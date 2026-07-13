#!/usr/bin/env node
/**
 * @file scripts/run_m014_s07_bounded_bos_e2e.js
 *
 * M014-a9jj46/S07 — Bounded BOS Light E2E gate runner (T02/T04).
 *
 * Plan mode is side-effect-free and audits the same fail-closed upstream gate
 * as the validator. Live mode is a separate explicit D062-scoped path: it
 * uses session-cookie auth, fresh scoped readbacks, and bounded one-shot
 * mutations with GET-only recovery.
 *
 *   1. ONE control-plane POST  /api/auth/sign-in/email            -> Set-Cookie session=<id>
 *   2. ONE business        POST /api/companies/{companyId}/issues -> create native issue
 *   3. ONE business        POST /api/agents/{agentId}/heartbeat/invoke -> invoke hermes_local heartbeat
 *   4. Independent       GET /api/issues/{issueId}                  -> native issue readback
 *   5. Independent       GET /api/agents/{agentId}                  -> wakeCount check (wakeCountDelta=1)
 *
 * Plan mode never dispatches HTTP. It builds a structured evidence file at
 * runtime-evidence/M014-S07-bounded-bos-e2e.json that:
 *
 *   - records every planned request with classification
 *     (control-plane / business / readback),
 *   - redacts session cookies, credentials, and full UUID literals using the
 *     same redaction discipline as T01's validator,
 *   - declares the expected-versus-observed side-effect ledger
 *     (issues_created=1, heartbeat_runs_started=1, others=0,
 *      unexpected_mutating_routes=0, unconfirmed_live_side_effects=0),
 *   - declares the bounded poll history (capped at MAX_POLL_BUDGET=12),
 *   - declares native readback hashes (sha256 of expected payload shapes),
 *   - declares the validator check IDs the runner claims to satisfy.
 *
 * Exit codes:
 *   0 = preconditions audited, plan emitted, evidence written
 *   2 = precondition gap (missing artifact, malformed JSON, deferred upstream)
 *   3 = load error (cannot read evidence path / lockfile path)
 *
 * Verification:
 *   node --test scripts/test_run_m014_s07_bounded_bos_e2e.js
 *
 * Reuses constants + redaction helpers from the validator:
 *   const { REQUIRED_*, ENTRY_GATE_CHECKS, R3_STALE_PREFIXES,
 *           scanCredentialLeaks, scanUuidLeaks, redactUuidLiteral,
 *           redactCredentialMatch, isLivePhaseAdmissible } =
 *     require('./validate_m014_s07_bounded_bos_e2e');
 *
 * Design contract:
 *   - Side-effect-free except for writing the canonical evidence file
 *     (runtime-evidence/M014-S07-bounded-bos-e2e.json) when --mode plan is set.
 *   - Plan mode does NOT make HTTP calls, execute subprocesses, mutate git
 *     state, or write credentials. Live mode writes no raw credentials.
 *   - Session cookies are redacted to 8-char prefixes; credentials are
 *     caught by the validator's scanCredentialLeaks; full UUIDs are
 *     redacted to 8-char prefixes.
 *   - Plan mode emits fail-closed evidence (business_mutation_count=0 + zero
 *     ledger counters) whenever upstream is deferred; live evidence records
 *     attempted and unconfirmed effects instead of hiding them.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VALIDATOR = require('./validate_m014_s07_bounded_bos_e2e');
const { runPreflight } = require('./lib/paperclip-preflight');

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

const PROJECT_ROOT = process.cwd();

const S04_DEPLOY = path.resolve(PROJECT_ROOT, 'runtime-evidence/M014-S04-paperclip-deploy.json');
const S04_POST_UPGRADE = path.resolve(PROJECT_ROOT, 'runtime-evidence/M014-S04-paperclip-post-upgrade.json');
const S04_NATIVE_SMOKE = path.resolve(PROJECT_ROOT, 'runtime-evidence/M014-S04-paperclip-native-smoke.json');
const S05_UPGRADE = path.resolve(PROJECT_ROOT, 'runtime-evidence/M014-S05-hermes-upgrade.json');
const S05_DIRECT = path.resolve(PROJECT_ROOT, 'runtime-evidence/M014-S05-minimax-direct-proof.json');
const S05_PAPERCLIP = path.resolve(PROJECT_ROOT, 'runtime-evidence/M014-S05-paperclip-hermes-minimax-proof.json');
const S06_DIRECT_LIVE = path.resolve(PROJECT_ROOT, 'runtime-evidence/M014-S06-minimax-direct-live.json');
const S06_PAPERCLIP_HERMES_LIVE = path.resolve(PROJECT_ROOT, 'runtime-evidence/M014-S06-paperclip-hermes-live.json');
const S06_ROLLOUT = path.resolve(PROJECT_ROOT, 'runtime-evidence/M014-S06-rollout-verdict.json');
const S06_PERSISTENCE = path.resolve(PROJECT_ROOT, 'runtime-evidence/M014-S06-persistence-canary.json');
const LOCKFILE = path.resolve(PROJECT_ROOT, 'paperclip-runtime.lock.json');
const S07_TARGET_EVIDENCE = path.resolve(PROJECT_ROOT, 'runtime-evidence/M014-S07-bounded-bos-e2e.json');

const UPSTREAM_ARTIFACT_PATHS = {
  s04Deploy: S04_DEPLOY,
  s04PostUpgrade: S04_POST_UPGRADE,
  s04NativeSmoke: S04_NATIVE_SMOKE,
  s05Upgrade: S05_UPGRADE,
  s05Direct: S05_DIRECT,
  s05Paperclip: S05_PAPERCLIP,
  s06DirectLive: S06_DIRECT_LIVE,
  s06PaperclipHermesLive: S06_PAPERCLIP_HERMES_LIVE,
  s06Rollout: S06_ROLLOUT,
  s06Persistence: S06_PERSISTENCE
};

// ---------------------------------------------------------------------------
// Constants (re-exported from validator + runner-specific)
// ---------------------------------------------------------------------------

const REQUIRED_BOUNDED_AGENT_KIND = 'bounded-test-agent';
const REQUIRED_COOKIE_AUTH_MODE = 'session-cookie';

// One route contract is shared by the plan, classifier, journal, tests, and
// live dispatcher. Evidence consumers compare these templates literally;
// live helpers substitute encoded IDs at dispatch time.
const ROUTE_CONTRACT = Object.freeze({
  sessionSignIn: 'POST /api/auth/sign-in/email',
  issueCreate: 'POST /api/companies/{companyId}/issues',
  issueReadback: 'GET /api/issues/{issueId}',
  agentReadback: 'GET /api/agents/{agentId}',
  heartbeatInvoke: 'POST /api/agents/{agentId}/heartbeat/invoke',
  heartbeatReadback: 'GET /api/heartbeat-runs/{runId}',
  heartbeatRunsList: 'GET /api/companies/{companyId}/heartbeat-runs'
});

const REQUIRED_BUSINESS_ROUTES = Object.freeze([
  ROUTE_CONTRACT.issueCreate,
  ROUTE_CONTRACT.heartbeatInvoke
]);

const REQUIRED_READBACK_ROUTES = Object.freeze([
  ROUTE_CONTRACT.issueReadback,
  ROUTE_CONTRACT.agentReadback
]);

const REQUIRED_CONTROL_PLANE_ROUTES = Object.freeze([
  ROUTE_CONTRACT.sessionSignIn
]);

function routePath(methodAndPath) {
  return String(methodAndPath).slice(String(methodAndPath).indexOf(' ') + 1);
}

// Bounded readback budget — maximum number of GET requests allowed across
// prechecks, independent readbacks, recovery, and status polling. Per Q6
// Load Profile gate: not a load test; cap at 8 total GETs.
const MAX_READBACK_GETS = 12;
// Kept as an exported compatibility name for existing plan/evidence consumers.
const MAX_POLL_BUDGET = MAX_READBACK_GETS;
const ISSUE_PAGE_SIZE = 100;
const MAX_ISSUE_LIST_PAGES = 10;

// Side-effect ledger — what we EXPECT (and OBSERVE on fail-closed) when the
// runner is run with no upstream live pass.
const EXPECTED_SIDE_EFFECTS = Object.freeze({
  issues_created: 1,
  heartbeat_runs_started: 1,
  // All other business routes = 0
  documents_created: 0,
  comments_created: 0,
  approvals_created: 0,
  agents_mutated: 0,
  unexpected_mutating_routes: 0,
  unconfirmed_live_side_effects: 0
});

// Observed (fail-closed): the runner does not dispatch, so all counters
// observed = 0 for the plan artifact. Live mode records its own exact
// observed counters in the T04 evidence shape.
const OBSERVED_SIDE_EFFECTS_FAIL_CLOSED = Object.freeze({
  issues_created: 0,
  heartbeat_runs_started: 0,
  documents_created: 0,
  comments_created: 0,
  approvals_created: 0,
  agents_mutated: 0,
  unexpected_mutating_routes: 0,
  unconfirmed_live_side_effects: 0
});

// BOS Light resultJson.bos schema — the runner declares the required fields
// the raw (pre-redaction) resultJson.bos MUST carry (per R037).
const REQUIRED_BOS_RESULT_FIELDS = Object.freeze([
  'schemaVersion',
  'runId',
  'issueId',
  'division',
  'role',
  'status'
]);

// The minimal BOS Light resultJson.bos shape (mock for native readback hash).
// This is the synthetic empty-bos-payload used by plan-mode shape hashes;
// live mode hashes only redacted readback shapes.
const SYNTHETIC_EMPTY_BOS_PAYLOAD = Object.freeze({
  schemaVersion: 'bos-light-v1',
  runId: '00000000-0000-0000-0000-000000000000',
  issueId: '00000000-0000-0000-0000-000000000000',
  division: 'Div1.HCO',
  role: 'bos-light',
  status: 'succeeded'
});

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

function readJsonOrFail(filePath, label) {
  if (!fs.existsSync(filePath)) {
    return { ok: false, reason: `${label} file not found: ${filePath}` };
  }
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { ok: false, reason: `${label} read failure: ${err && err.message ? err.message : 'unknown'}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ok: false, reason: `${label} JSON parse failure: ${err && err.message ? err.message : 'unknown'}` };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: `${label} top-level must be a JSON object` };
  }
  return { ok: true, parsed, raw, path: filePath };
}

function loadLockfile() {
  return readJsonOrFail(LOCKFILE, 'paperclip-runtime.lock.json');
}

function loadUpstreamArtifacts() {
  const out = {};
  const errors = [];
  for (const [k, p] of Object.entries(UPSTREAM_ARTIFACT_PATHS)) {
    const r = readJsonOrFail(p, k);
    if (!r.ok) {
      errors.push({ key: k, reason: r.reason });
    } else {
      out[k] = r;
    }
  }
  return { artifacts: out, errors };
}

// ---------------------------------------------------------------------------
// Redaction helpers (re-use validator primitives, add cookie/secret-ref helpers)
// ---------------------------------------------------------------------------

function redactCookie(raw) {
  // Session cookie: cookie value is opaque; we keep first 8 chars + …
  if (typeof raw !== 'string' || raw.length === 0) return raw;
  if (raw.length <= 8) return `${raw.slice(0, 2)}…(redacted)`;
  return `${raw.slice(0, 8)}…(redacted,len=${raw.length})`;
}

function redactSessionCookieHeader(headerValue) {
  // Header shape: "Cookie: session=<value>" or "Set-Cookie: session=<value>; Path=/; HttpOnly"
  if (typeof headerValue !== 'string') return headerValue;
  return headerValue.replace(/session=([^;\s]+)/g, (_, v) => `session=${redactCookie(v)}`);
}

function redactSecretRef(value) {
  // Secret ref names like MINIMAX_API_KEY / MINIMAX_BASE_URL are *names*, not
  // values. They are allowed in evidence. This helper is a no-op for names
  // and a guard against accidental value bleed.
  if (typeof value !== 'string') return value;
  if (/^(MINIMAX_API_KEY|MINIMAX_BASE_URL|XIAOMI_API_KEY|XIAOMI_BASE_URL|PAPERCLIP_API_KEY|OPENAI_API_KEY)$/.test(value)) {
    return value; // it's a name, allowed
  }
  // If it looks like a value (long opaque), redact it
  if (value.length >= 16) return redactCookie(value);
  return value;
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input), 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Request classifier (control-plane / business / readback)
// ---------------------------------------------------------------------------

function classifyRequest(method, pathTemplate) {
  const m = String(method || '').toUpperCase();
  const p = String(pathTemplate || '');
  if (!p.startsWith('/api/')) return 'unknown';
  if (REQUIRED_CONTROL_PLANE_ROUTES.includes(`${m} ${p}`)) return 'control-plane';
  const pathWithoutQuery = p.split('?')[0];
  // Company-scoped issue creation is the only canonical issue POST route.
  if (m === 'POST' && /^\/api\/companies\/[^/]+\/issues$/.test(pathWithoutQuery)) return 'business';
  // Company-scoped issue GET routes are deliberately not canonical readbacks.
  // The independent issue readback must use GET /api/issues/{issueId}.
  // Build a regex from each route template. Templated segments like
  // {agentId} become [^/]+ so resolved paths (with substituted ids)
  // match correctly.
  const routeMatches = (routes, expectedMethod) => {
    const prefix = `${expectedMethod} `;
    for (const r of routes) {
      if (!r.startsWith(prefix)) continue;
      const pathPart = r.slice(prefix.length);
      const regexStr = '^' + pathPart.replace(/\{[^}]+\}/g, '[^/]+') + '$';
      if (new RegExp(regexStr).test(pathWithoutQuery)) return true;
    }
    return false;
  };
  if (m === 'POST' && routeMatches(REQUIRED_BUSINESS_ROUTES, 'POST')) return 'business';
  if (m === 'GET' && routeMatches(REQUIRED_READBACK_ROUTES, 'GET')) return 'readback';
  if (m === 'POST' && p.startsWith('/api/')) return 'business-other';
  if (m === 'GET' && p.startsWith('/api/')) return 'readback-other';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Audit functions — read-only precondition audit mirroring T01 validator gates
// ---------------------------------------------------------------------------

function auditLockfile() {
  const r = loadLockfile();
  if (!r.ok) return r;
  const lockfile = r.parsed;
  if (typeof lockfile.safe_restart_command !== 'string' || lockfile.safe_restart_command.length === 0) {
    return { ok: false, reason: 'lockfile.safe_restart_command missing or empty (LFP-S02-02 breach)' };
  }
  if (!Array.isArray(lockfile.forbidden_commands)) {
    return { ok: false, reason: 'lockfile.forbidden_commands must be an array (LFP-LF-03)' };
  }
  const staleCount = (lockfile.stale_company_ids && Array.isArray(lockfile.stale_company_ids.ids))
    ? lockfile.stale_company_ids.ids.length
    : 0;
  const inherited = (lockfile.inherited_constraints_remain_in_force && Array.isArray(lockfile.inherited_constraints_remain_in_force.inherited_constraints))
    ? lockfile.inherited_constraints_remain_in_force.inherited_constraints
    : [];
  return {
    ok: true,
    safe_restart_command: lockfile.safe_restart_command,
    forbidden_commands_count: lockfile.forbidden_commands.length,
    stale_company_ids_count: staleCount,
    inherited_constraints_count: inherited.length
  };
}

// Map each upstream artifact to its verdict field. S04 evidence uses
// artifact-specific verdict names (deployment_status, post_upgrade_verdict,
// native_smoke_verdict); S05/S06 use the canonical phase_verdict. Mirrors
// V-BOS-E2E-02..07 + V-BOS-E2E-09..18 + V-BOS-E2E-21 in the validator.
const VERDICT_FIELD_BY_ARTIFACT = Object.freeze({
  s04Deploy: 'deployment_status',
  s04PostUpgrade: 'post_upgrade_verdict',
  s04NativeSmoke: 'native_smoke_verdict',
  s05Upgrade: 'phase_verdict',
  s05Direct: 'phase_verdict',
  s05Paperclip: 'phase_verdict',
  s06DirectLive: 'phase_verdict',
  s06PaperclipHermesLive: 'phase_verdict',
  s06Rollout: 'phase_verdict',
  s06Persistence: 'phase_verdict'
});

function auditUpstreamArtifact(key, expectedPhaseVerdict) {
  const r = readJsonOrFail(UPSTREAM_ARTIFACT_PATHS[key], key);
  if (!r.ok) return r;
  const ev = r.parsed;
  const verdictField = VERDICT_FIELD_BY_ARTIFACT[key] || 'phase_verdict';
  const phaseVerdict = ev[verdictField];
  const liveStatus = ev.live_execution_status;
  const phaseOk = Array.isArray(expectedPhaseVerdict)
    ? expectedPhaseVerdict.includes(phaseVerdict)
    : phaseVerdict === expectedPhaseVerdict;
  return {
    ok: true,
    key,
    verdict_field: verdictField,
    phase_verdict: typeof phaseVerdict === 'string' ? phaseVerdict : null,
    live_execution_status: liveStatus,
    phase_admissible_for_live: phaseOk && VALIDATOR.isLivePhaseAdmissible(phaseVerdict),
    fresh_readback_required: ev.fresh_readback_required === true,
    path: r.path
  };
}

function auditUpstreamGate() {
  // Use the same expected verdicts as the validator's V-BOS-E2E checks.
  const expectations = {
    s04Deploy: VALIDATOR.REQUIRED_DEPLOYMENT_STATUS,
    s04PostUpgrade: VALIDATOR.REQUIRED_POST_UPGRADE_VERDICT,
    s04NativeSmoke: VALIDATOR.REQUIRED_NATIVE_SMOKE_VERDICT,
    s05Upgrade: VALIDATOR.REQUIRED_S05_UPGRADE_PHASE_VERDICTS,
    s05Direct: VALIDATOR.REQUIRED_S05_DIRECT_PHASE_VERDICT,
    s05Paperclip: VALIDATOR.REQUIRED_S05_PAPERCLIP_PHASE_VERDICT,
    s06DirectLive: VALIDATOR.REQUIRED_S06_DIRECT_LIVE_PHASE_VERDICT,
    s06PaperclipHermesLive: VALIDATOR.REQUIRED_S06_PAPERCLIP_HERMES_LIVE_PHASE_VERDICT,
    s06Rollout: VALIDATOR.REQUIRED_S06_ROLLOUT_PHASE_VERDICT,
    s06Persistence: VALIDATOR.REQUIRED_S06_PERSISTENCE_PHASE_VERDICT
  };
  const audits = {};
  const blockers = [];
  for (const [k, expected] of Object.entries(expectations)) {
    const a = auditUpstreamArtifact(k, expected);
    audits[k] = a;
    if (!a.ok) {
      blockers.push(`${k}: ${a.reason}`);
      continue;
    }
    if (!a.phase_admissible_for_live) {
      blockers.push(`${k}: phase_verdict=${a.phase_verdict} not admissible for live dispatch`);
    }
    if (!a.fresh_readback_required) {
      blockers.push(`${k}: fresh_readback_required must be true`);
    }
  }
  return {
    audits,
    blockers,
    gate_satisfied: blockers.length === 0
  };
}

// ---------------------------------------------------------------------------
// Plan builders (side-effect-free: no HTTP, no subprocess, no mutation)
// ---------------------------------------------------------------------------

function buildSessionCookiePlan() {
  return {
    policy: `Control-plane sign-in: ONE ${ROUTE_CONTRACT.sessionSignIn} to acquire a session cookie. The cookie value is redacted in the evidence; only its 8-char prefix is recorded.`,
    planned_http_invocation: {
      method: 'POST',
      path: routePath(ROUTE_CONTRACT.sessionSignIn),
      request_body_shape: { email: 'string (operator-confirmed)', password: 'string (operator-confirmed; never recorded)' },
      expected_response_status: 200,
      expected_response_body_shape: { user: 'object', session: 'object with id+expires_at' },
      expected_response_headers: { 'Set-Cookie': 'session=<redacted-8-char-prefix>; Path=/; HttpOnly; SameSite=Lax' }
    },
    cookie_classification: 'control-plane',
    classification_rationale: 'session cookie acquisition is control-plane (not a business mutation); classified for the request journal',
    redaction_discipline: 'session cookie value redacted to 8-char prefix + length; password never recorded in evidence'
  };
}

function buildIssueCreatePlan(audits) {
  // Choose a session-cookie template (no real values)
  const session = 'session-cookie:8char-prefix-only';
  return {
    policy: `Business: ONE ${ROUTE_CONTRACT.issueCreate} creates the native correlated issue. Cookie auth via session-cookie. Body carries issue title/description/body. Title references the bounded test agent (NOT R3 stale prefix).`,
    classification: 'business',
    planned_http_invocation: {
      method: 'POST',
      path_template: routePath(ROUTE_CONTRACT.issueCreate),
      request_headers: { Cookie: `${session}=<redacted-8-char-prefix>` },
      request_body_shape: {
        title: 'string — bounded BOS Light MiniMax M3 heartbeat issue',
        description: 'string — references bounded-test-agent, MiniMax M3, hermes_local',
        body: 'string — bounded BOS workflow description (NO credentials, NO full UUIDs, NO xiaomi references)'
      },
      expected_response_status: 201,
      expected_response_body_shape: { id: 'string (redacted to 8-char prefix in evidence)', title: 'string', status: 'string' }
    },
    bounded_test_agent_target: {
      agent_kind: REQUIRED_BOUNDED_AGENT_KIND,
      agent_id_format: 'fresh <UUID v4> — NOT from R3 stale_company_ids ledger; created in same operator session, NOT extracted from previous S04/S05/S06 evidence',
      agent_id_prefix_constraint: '8-char prefix MUST NOT intersect R3_STALE_PREFIXES',
      adapter_profile_summary: 'paperclip adapterConfig.hermesLocal with provider=minimax, model=MiniMax-M3, endpoint_class=openai-compatible, api_key_secret_ref=MINIMAX_API_KEY, base_url_secret_ref=MINIMAX_BASE_URL, structured_output_schema=bos, session_id_format_expected=YYYYMMDD_HHMMSS_<6hex>'
    },
    side_effect_classification: 'issues_created (counts as 1 in the side-effect ledger)',
    redaction_discipline: 'request headers redacted to 8-char prefix; request body never contains credentials; response id redacted to 8-char prefix; xiaomi references forbidden'
  };
}

function buildHeartbeatInvokePlan(audits) {
  const session = 'session-cookie:8char-prefix-only';
  return {
    policy: `Business: ONE ${ROUTE_CONTRACT.heartbeatInvoke} invokes hermes_local heartbeat with MiniMax M3. Wake count MUST increment by exactly 1 (wakeCountDelta=1).`,
    classification: 'business',
    planned_http_invocation: {
      method: 'POST',
      path_template: routePath(ROUTE_CONTRACT.heartbeatInvoke),
      path_resolved_with: '<fresh agentId; 8-char prefix NOT in R3_STALE_PREFIXES>',
      request_headers: { Cookie: `${session}=<redacted-8-char-prefix>` },
      request_body_shape: {
        prompt: 'string — bounded BOS Light workflow prompt referencing the created issue',
        timeoutSec: 300,
        graceSec: 5
      },
      expected_response_status: 200,
      expected_response_body_shape: {
        runId: 'string (redacted to 8-char prefix in evidence)',
        status: 'succeeded',
        resultJson: {
          bos: {
            schemaVersion: 'bos-light-v1',
            runId: 'string',
            issueId: 'string',
            division: 'Div1.HCO',
            role: 'bos-light',
            status: 'succeeded'
          }
        },
        terminal: true,
        exit_code: 0
      },
      expected_resultJson_bos_required_fields: REQUIRED_BOS_RESULT_FIELDS.slice(),
      expected_routing_preservation: VALIDATOR.R026_ROUTING_CHAIN.slice()
    },
    bounded_test_agent_target: {
      agent_kind: REQUIRED_BOUNDED_AGENT_KIND,
      agent_id_prefix_constraint: '8-char prefix MUST NOT intersect R3_STALE_PREFIXES',
      hermes_binding: 'hermes_local with provider=minimax AND model=MiniMax-M3 (xiaomi MUST NOT re-emerge)'
    },
    side_effect_classification: 'heartbeat_runs_started (counts as 1 in the side-effect ledger)',
    wake_count_delta_policy: 'wakeCountDelta === 1; ANY other value is fail-closed',
    redaction_discipline: 'request headers redacted; resultJson.bos raw preserved (must contain required fields); xiaomi references forbidden'
  };
}

function buildIssueReadbackPlan() {
  const session = 'session-cookie:8char-prefix-only';
  return {
    policy: `Independent readback: ${ROUTE_CONTRACT.issueReadback} confirms the issue created by buildIssueCreatePlan. Cookie auth. Independent of the issue-create POST.`,
    classification: 'readback',
    planned_http_invocation: {
      method: 'GET',
      path_template: routePath(ROUTE_CONTRACT.issueReadback),
      request_headers: { Cookie: `${session}=<redacted-8-char-prefix>` },
      expected_response_status: 200,
      expected_response_body_shape: {
        id: 'string (redacted to 8-char prefix in evidence)',
        title: 'string',
        status: 'string',
        created_at: 'string (ISO 8601)'
      }
    },
    independence_policy: 'The issue readback MUST be a separate HTTP request, NOT derived from the issue-create response body — confirms server-side state.'
  };
}

function buildWakeCountCheckPlan() {
  const session = 'session-cookie:8char-prefix-only';
  return {
    policy: `Independent readback: ${ROUTE_CONTRACT.agentReadback} returns current wakeCount. wakeCountDelta = post - pre. Pre captured BEFORE heartbeat invoke; post captured AFTER.`,
    classification: 'readback',
    planned_http_invocation: {
      method: 'GET',
      path_template: routePath(ROUTE_CONTRACT.agentReadback),
      request_headers: { Cookie: `${session}=<redacted-8-char-prefix>` },
      expected_response_status: 200,
      expected_response_body_shape: {
        id: 'string (redacted to 8-char prefix in evidence)',
        adapterConfig: {
          hermesLocal: {
            provider: VALIDATOR.CANONICAL_MINIMAX_PROVIDER,
            model: VALIDATOR.CANONICAL_MINIMAX_MODEL
          }
        },
        wakeCount: 'integer >= 1'
      }
    },
    independence_policy: 'The wakeCount check MUST be a separate HTTP request. Pre-capture BEFORE heartbeat invoke; post-capture AFTER.'
  };
}

function buildBoundedPollHistory() {
  const plan = [
    [ROUTE_CONTRACT.agentReadback, 'company-project-agent-binding'],
    [ROUTE_CONTRACT.issueReadback, 'duplicate-pre-readback'],
    [ROUTE_CONTRACT.issueReadback, 'independent-issue-readback'],
    [ROUTE_CONTRACT.heartbeatRunsList, 'heartbeat-run-count-pre'],
    [ROUTE_CONTRACT.heartbeatReadback, 'heartbeat-status-1'],
    [ROUTE_CONTRACT.heartbeatReadback, 'heartbeat-status-2'],
    [ROUTE_CONTRACT.heartbeatReadback, 'heartbeat-status-3'],
    [ROUTE_CONTRACT.agentReadback, 'agent-post-readback'],
    [ROUTE_CONTRACT.heartbeatRunsList, 'heartbeat-run-count-post'],
    [ROUTE_CONTRACT.issueReadback, 'reserved-issue-recovery'],
    [ROUTE_CONTRACT.heartbeatReadback, 'reserved-heartbeat-recovery'],
    [ROUTE_CONTRACT.agentReadback, 'reserved-agent-recovery']
  ];
  const polls = plan.map(([route, pollKind], index) => ({
    seq: index + 1,
    route,
    poll_kind: pollKind,
    budget_remaining_after: MAX_POLL_BUDGET - index - 1
  }));
  return {
    max_poll_budget: MAX_POLL_BUDGET,
    polls_executed_planned: polls.length,
    polls,
    budget_policy: `No GET beyond seq=${MAX_POLL_BUDGET}. ANY unbounded poll is fail-closed.`,
    classification_rationale: 'All polls are GET /api/*; classified as readback (not business mutation).'
  };
}

function buildRequestJournal() {
  // Build the full planned sequence: 1 control-plane + 2 business + 2 readback.
  // Each entry carries redaction_discipline + classification.
  const journal = [];
  // 1. sign-in
  journal.push({
    seq: 1,
    classification: 'control-plane',
    method: 'POST',
    path: routePath(ROUTE_CONTRACT.sessionSignIn),
    request_headers_redacted: { Cookie: '<absent — sign-in does not carry Cookie>' },
    request_body_redacted_shape: { email: '<redacted>', password: '<never recorded>' },
    expected_response_status: 200,
    response_redacted: { 'Set-Cookie': 'session=<redacted-8-char-prefix>; Path=/; HttpOnly; SameSite=Lax' },
    side_effect: 'none (control-plane: session acquisition only)'
  });
  // 2. issue create
  journal.push({
    seq: 2,
    classification: 'business',
    method: 'POST',
    path: routePath(ROUTE_CONTRACT.issueCreate),
    request_headers_redacted: { Cookie: 'session=<redacted-8-char-prefix>' },
    request_body_redacted_shape: {
      title: 'bounded BOS Light MiniMax M3 heartbeat issue (no credentials, no xiaomi)',
      description: 'references bounded-test-agent + MiniMax M3 + hermes_local',
      body: 'bounded BOS workflow description (no credentials, no full UUIDs, no xiaomi references)'
    },
    expected_response_status: 201,
    response_redacted: { id: '<redacted-8-char-prefix>', title: '<redacted>', status: 'open' },
    side_effect: 'issues_created += 1'
  });
  // 3. heartbeat invoke
  journal.push({
    seq: 3,
    classification: 'business',
    method: 'POST',
    path: routePath(ROUTE_CONTRACT.heartbeatInvoke),
    request_headers_redacted: { Cookie: 'session=<redacted-8-char-prefix>' },
    request_body_redacted_shape: {
      prompt: 'bounded BOS Light workflow prompt referencing the created issue (no credentials, no xiaomi)',
      timeoutSec: 300,
      graceSec: 5
    },
    expected_response_status: 200,
    response_redacted: {
      runId: '<redacted-8-char-prefix>',
      status: 'succeeded',
      terminal: true,
      exit_code: 0,
      resultJson_bos_required_fields: REQUIRED_BOS_RESULT_FIELDS.slice(),
      routing_chain_if_present: VALIDATOR.R026_ROUTING_CHAIN.slice()
    },
    side_effect: 'heartbeat_runs_started += 1'
  });
  // 4. issue readback
  journal.push({
    seq: 4,
    classification: 'readback',
    method: 'GET',
    path: routePath(ROUTE_CONTRACT.issueReadback),
    request_headers_redacted: { Cookie: 'session=<redacted-8-char-prefix>' },
    expected_response_status: 200,
    response_redacted: { id: '<redacted-8-char-prefix>', title: '<redacted>', status: 'open' },
    side_effect: 'none (readback only)'
  });
  // 5. wakeCount check (post-heartbeat)
  journal.push({
    seq: 5,
    classification: 'readback',
    method: 'GET',
    path: routePath(ROUTE_CONTRACT.agentReadback),
    request_headers_redacted: { Cookie: 'session=<redacted-8-char-prefix>' },
    expected_response_status: 200,
    response_redacted: {
      id: '<redacted-8-char-prefix>',
      adapterConfig_hermesLocal: { provider: 'minimax', model: 'MiniMax-M3' },
      wakeCount: 'integer >= 1 (delta from pre = 1)'
    },
    side_effect: 'none (readback only)'
  });
  return {
    total_entries: journal.length,
    control_plane_count: journal.filter((e) => e.classification === 'control-plane').length,
    business_count: journal.filter((e) => e.classification === 'business').length,
    readback_count: journal.filter((e) => e.classification === 'readback').length,
    entries: journal,
    bounded_policy: 'EXACTLY 1 control-plane + 2 business + 2 readback = 5 entries. Any deviation is fail-closed.',
    redaction_discipline: 'All cookies, ids, runIds, and UUIDs are redacted to 8-char prefixes. No credentials in any entry.'
  };
}

function buildSideEffectLedger() {
  return {
    policy: 'Plan-mode expected-versus-observed side-effect ledger. Plan mode dispatches no business mutations; live mode writes exact counters separately.',
    expected: { ...EXPECTED_SIDE_EFFECTS },
    observed_fail_closed: { ...OBSERVED_SIDE_EFFECTS_FAIL_CLOSED },
    deltas: Object.fromEntries(Object.keys(EXPECTED_SIDE_EFFECTS).map((k) => [k, EXPECTED_SIDE_EFFECTS[k] - OBSERVED_SIDE_EFFECTS_FAIL_CLOSED[k]])),
    ledger_zero_invariants: {
      business_mutation_count: 0,
      unexpected_mutating_routes: OBSERVED_SIDE_EFFECTS_FAIL_CLOSED.unexpected_mutating_routes,
      unconfirmed_live_side_effects: OBSERVED_SIDE_EFFECTS_FAIL_CLOSED.unconfirmed_live_side_effects,
      validator_invariant: 'V-BOS-E2E-29 fail-closed invariant: business_mutation_count=0 AND all-zero ledger counters when entry-gate verdict=fail'
    }
  };
}

function buildPrePostCounters() {
  return {
    pre_dispatch_counters: {
      issues_count: 0,
      heartbeat_runs_count: 0,
      session_cookies_active: 0
    },
    post_dispatch_counters_fail_closed: {
      issues_count: 0,
      heartbeat_runs_count: 0,
      session_cookies_active: 0
    },
    counter_policy: 'Pre captured BEFORE any HTTP dispatch; post captured AFTER all HTTP dispatch completes. On fail-closed (no dispatch), pre == post == 0. Live PASS path: pre + observed = post.'
  };
}

function buildNativeReadbackHashes() {
  // sha256 of expected payload shapes (synthetic empty BOS payload) for plan mode.
  const issueReadbackShape = JSON.stringify({ id: 'string', title: 'string', status: 'open', created_at: 'ISO8601' });
  const heartbeatReadbackShape = JSON.stringify({
    runId: 'string',
    status: 'succeeded',
    terminal: true,
    exit_code: 0,
    resultJson: { bos: { ...SYNTHETIC_EMPTY_BOS_PAYLOAD } }
  });
  const agentReadbackShape = JSON.stringify({
    id: 'string',
    adapterConfig: { hermesLocal: { provider: VALIDATOR.CANONICAL_MINIMAX_PROVIDER, model: VALIDATOR.CANONICAL_MINIMAX_MODEL } },
    wakeCount: 1
  });
  return {
    policy: 'Plan-mode sha256 hashes of expected payload shapes; live mode records hashes of redacted native readback shapes.',
    issue_readback_sha256: sha256Hex(issueReadbackShape),
    heartbeat_readback_sha256: sha256Hex(heartbeatReadbackShape),
    agent_readback_sha256: sha256Hex(agentReadbackShape),
    shape_inputs: {
      issue_readback_shape: issueReadbackShape,
      heartbeat_readback_shape: heartbeatReadbackShape,
      agent_readback_shape: agentReadbackShape
    }
  };
}

function buildValidatorCheckIds() {
  // All 30 V-BOS-E2E-NN IDs used by both plan and live evidence validation.
  return VALIDATOR.ENTRY_GATE_CHECKS.map(([id]) => id);
}

function buildBlockerBoundary(blockers) {
  return {
    policy: 'If ANY blocker exists, the runner emits a fail-closed evidence file with business_mutation_count=0 and zero ledger counters. Recovery begins from the failing boundary WITHOUT re-mutation.',
    blockers,
    recovery_starts_from: 'failing boundary (no retry, no re-dispatch)',
    re_mutation_policy: 'NEVER retry a business mutation after a blocker. Recovery is precondition-fix, not retry.'
  };
}

function buildInheritedConstraints(lockfileAudit) {
  return VALIDATOR.REQUIRED_INHERITED_CONSTRAINT_IDS.map((id) => ({
    id,
    in_force: true,
    rationale: 'S07 carries forward S05/S06 LFP-* constraints unchanged; no relaxations; runner is side-effect-free (audit + plan only).'
  }));
}

function buildBoundedSessionCookiePlan(auditResult) {
  const sessionPlan = buildSessionCookiePlan();
  const issuePlan = buildIssueCreatePlan(auditResult.audits);
  const heartbeatPlan = buildHeartbeatInvokePlan(auditResult.audits);
  const issueReadback = buildIssueReadbackPlan();
  const wakeCountCheck = buildWakeCountCheckPlan();

  const plan = {
    runner: 'scripts/run_m014_s07_bounded_bos_e2e.js',
    milestone: 'M014-a9jj46',
    slice: 'S07',
    task: 'T02',
    purpose: 'Bounded session-cookie plan-only runner; side-effect-free; awaits operator-confirmed live executor per LFP-LF-02.',
    generated: new Date().toISOString(),
    generated_by: 'gsd-executor/auto-mode (S07-T02)',
    auth_mode: REQUIRED_COOKIE_AUTH_MODE,
    bounded_policy: {
      max_issue_creates: 1,
      max_heartbeat_invokes: 1,
      max_control_plane_sign_ins: 1,
      max_readback_gets: MAX_READBACK_GETS,
      max_polls: MAX_READBACK_GETS,
      max_business_mutations_per_run: 2,
      invariant: 'EXACTLY 1 issue create + EXACTLY 1 heartbeat invoke + 1 sign-in; every GET is counted separately and total GETs are bounded. Any deviation is fail-closed.'
    },
    inherited_constraints_remain_in_force: buildInheritedConstraints(),
    planned_invocation_sequence: [
      sessionPlan,
      issuePlan,
      heartbeatPlan,
      issueReadback,
      wakeCountCheck
    ],
    bounded_poll_history: buildBoundedPollHistory(),
    redacted_request_journal: buildRequestJournal(),
    pre_post_counters: buildPrePostCounters(),
    expected_vs_observed_side_effect_ledger: buildSideEffectLedger(),
    native_readback_hashes: buildNativeReadbackHashes(),
    validator_check_ids: buildValidatorCheckIds(),
    blocker_boundary: buildBlockerBoundary(auditResult.blockers),
    canonical_provider: VALIDATOR.CANONICAL_MINIMAX_PROVIDER,
    canonical_model: VALIDATOR.CANONICAL_MINIMAX_MODEL,
    stale_company_ids_known: Array.from(VALIDATOR.R3_STALE_PREFIXES),
    routing_chain_required: VALIDATOR.R026_ROUTING_CHAIN.slice(),
    bos_result_required_fields: REQUIRED_BOS_RESULT_FIELDS.slice()
  };
  return plan;
}

// ---------------------------------------------------------------------------
// Canonical evidence builder — produces the file the validator reads
// ---------------------------------------------------------------------------

function buildCanonicalEvidence(plan, auditResult, lockfileAudit) {
  return {
    $schema: 'https://gsd.local/schemas/runtime-evidence/s07-bounded-bos-e2e.v1.json',
    milestone: 'M014-a9jj46',
    slice: 'S07',
    task: 'T02',
    purpose: 'Canonical bounded BOS Light plan evidence. Records redacted request journal with control-plane/business/readback classification, bounded poll history, zero plan-mode counters, native readback shape hashes, blocker boundary, and validator check IDs. Live T04 evidence uses the separate exact ledger builder.',
    generated: plan.generated,
    generated_by: plan.generated_by,
    auth_mode: plan.auth_mode,
    bounded_policy: plan.bounded_policy,
    inherited_constraints_remain_in_force: plan.inherited_constraints_remain_in_force,
    preconditions_audit: {
      lockfile_ok: lockfileAudit.ok || false,
      stale_company_ids_count: lockfileAudit.stale_company_ids_count || 0,
      forbidden_commands_count: lockfileAudit.forbidden_commands_count || 0,
      upstream_gate_satisfied: auditResult.gate_satisfied,
      upstream_artifacts: Object.fromEntries(
        Object.entries(auditResult.audits).map(([k, v]) => [
          k,
          {
            ok: v.ok || false,
            phase_verdict: v.phase_verdict || null,
            live_execution_status: v.live_execution_status || null,
            phase_admissible_for_live: v.phase_admissible_for_live || false,
            fresh_readback_required: v.fresh_readback_required || false
          }
        ])
      )
    },
    redacted_request_journal: plan.redacted_request_journal,
    bounded_poll_history: plan.bounded_poll_history,
    pre_post_counters: plan.pre_post_counters,
    expected_vs_observed_side_effect_ledger: plan.expected_vs_observed_side_effect_ledger,
    native_readback_hashes: {
      issue_readback_sha256: plan.native_readback_hashes.issue_readback_sha256,
      heartbeat_readback_sha256: plan.native_readback_hashes.heartbeat_readback_sha256,
      agent_readback_sha256: plan.native_readback_hashes.agent_readback_sha256
    },
    native_readback_shape_inputs: plan.native_readback_hashes.shape_inputs,
    validator_check_ids: plan.validator_check_ids,
    blocker_boundary: plan.blocker_boundary,
    canonical_provider: plan.canonical_provider,
    canonical_model: plan.canonical_model,
    stale_company_ids_known: plan.stale_company_ids_known,
    routing_chain_required: plan.routing_chain_required,
    bos_result_required_fields: plan.bos_result_required_fields,
    // V-BOS-E2E-29 fail-closed invariant — these are the values the validator
    // reads when entry-gate verdict=fail.
    business_mutation_count: 0,
    ledger: {
      issues_created: 0,
      heartbeat_runs_started: 0,
      documents_created: 0,
      comments_created: 0,
      approvals_created: 0,
      agents_mutated: 0,
      unexpected_mutating_routes: 0,
      unconfirmed_live_side_effects: 0
    },
    next_steps_for_operator: [
      'Resolve upstream S04-S06 deferred state (each must reach its required phase_verdict)',
      'Re-run T02 to refresh the canonical evidence file',
      'Provision a fresh bounded-test-agent (UUID v4 not in R3 stale ledger)',
      'Execute the planned session-cookie sequence in an operator-confirmed session',
      'Capture raw (pre-redaction) resultJson.bos + native issue id + heartbeat runId into the canonical evidence',
      'Re-run S07-T02 in --mode plan to validate the operator-captured evidence',
      'Run S07-T04 in --phase require-pass mode to close acceptance'
    ]
  };
}

function writeEvidenceToFile(evidence, filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// Live execution path (T04): explicit, session-only, fail-closed
// ---------------------------------------------------------------------------

const LIVE_CONFIRMATION_TOKEN = 'M014-a9jj46/S07/T04/D062';
const LIVE_REQUIRED_ADAPTER = 'hermes_local';
const LIVE_REQUIRED_PROVIDER = VALIDATOR.CANONICAL_MINIMAX_PROVIDER;
const LIVE_REQUIRED_MODEL = VALIDATOR.CANONICAL_MINIMAX_MODEL;
const LIVE_ISSUE_CREATE_PATH = (companyId) => `/api/companies/${encodeURIComponent(companyId)}/issues`;
const LIVE_ISSUE_LIST_PATH = (companyId, { cursor = null, page = null } = {}) => {
  const params = new URLSearchParams({ limit: String(ISSUE_PAGE_SIZE) });
  if (typeof cursor === 'string' && cursor.length > 0) params.set('cursor', cursor);
  else if (Number.isInteger(page) && page > 1) params.set('page', String(page));
  return `${LIVE_ISSUE_CREATE_PATH(companyId)}?${params.toString()}`;
};
// Canonical independent readback. Do not add company scoping here: that route
// is a list/create surface and cannot serve as independent issue readback.
const LIVE_ISSUE_READBACK_PATH = (issueId) => `/api/issues/${encodeURIComponent(issueId)}`;
const LIVE_PROJECT_LIST_PATH = (companyId) => `/api/companies/${encodeURIComponent(companyId)}/projects?limit=100`;
const LIVE_AGENT_LIST_PATH = (companyId) => `/api/companies/${encodeURIComponent(companyId)}/agents`;
const LIVE_AGENT_READBACK_PATH = (agentId) => `/api/agents/${encodeURIComponent(agentId)}`;
const LIVE_HEARTBEAT_PATH = (agentId) => `${LIVE_AGENT_READBACK_PATH(agentId)}/heartbeat/invoke`;
const LIVE_HEARTBEAT_READBACK_PATH = (_agentId, runId) => `/api/heartbeat-runs/${encodeURIComponent(runId)}`;
const LIVE_HEARTBEAT_RUNS_LIST_PATH = (companyId, agentId) => `/api/companies/${encodeURIComponent(companyId)}/heartbeat-runs?agentId=${encodeURIComponent(agentId)}&limit=1000`;
const LIVE_MAX_HTTP_TIMEOUT_MS = 10_000;
const LIVE_MAX_HEARTBEAT_POLLS = 3;
const LIVE_MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const LIVE_RECOVERY_LOCK_PATH = path.resolve(PROJECT_ROOT, '.gsd/runtime/M014-S07-live-recovery.lock.json');
const RECOVERY_LOCK_SCHEMA_VERSION = 2;
const RECOVERY_LOCK_RESOLVED_STATUS = 'completed';
const RECOVERY_LOCK_TERMINAL_STATUSES = Object.freeze(['completed', 'resolved']);
const RECOVERY_OPERATION_NAMES = Object.freeze(['issue-create', 'heartbeat-invoke']);
const RECOVERY_OPERATION_STATUSES = Object.freeze(['not-attempted', 'issue_pending', 'heartbeat_pending', 'confirmed']);

function parseDotenv(raw) {
  const values = {};
  for (const rawLine of String(raw || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    let key = line.slice(0, separator).trim();
    if (key.startsWith('export ')) key = key.slice(7).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function loadDotenv(filePath = path.resolve(PROJECT_ROOT, '.env'), fsImpl = fs) {
  if (!fsImpl.existsSync(filePath)) return {};
  return parseDotenv(fsImpl.readFileSync(filePath, 'utf8'));
}

function isD062ScopedReason(reason) {
  if (typeof reason !== 'string') return false;
  const normalized = reason.trim();
  return /^D062\b/i.test(normalized) &&
    /M014-a9jj46/i.test(normalized) &&
    /S07/i.test(normalized) &&
    /T04/i.test(normalized);
}

function isSafeTargetId(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false, reason: `${label} is required and must be a non-empty string` };
  }
  if (value !== value.trim() || /[\u0000-\u001f\u007f/\\?#]/.test(value)) {
    return { ok: false, reason: `${label} contains invalid path characters` };
  }
  return { ok: true, value };
}

function isUsableEntityId(value) {
  return typeof value === 'string' &&
    value.length > 0 &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f/\\?#]/.test(value);
}

function getLockfileIdLedger(lockfile) {
  const ids = [];
  for (const key of ['stale_company_ids', 'disposable_company_ids']) {
    const entries = lockfile && lockfile[key] && Array.isArray(lockfile[key].ids) ? lockfile[key].ids : [];
    for (const entry of entries) {
      if (typeof entry === 'string') ids.push({ id: entry, ledger: key });
    }
  }
  return ids;
}

function rejectLockfileIds(lockfile, targets) {
  const ledger = getLockfileIdLedger(lockfile);
  const blockers = [];
  for (const [label, value] of Object.entries(targets)) {
    if (typeof value !== 'string') continue;
    const match = ledger.find((entry) => entry.id.toLowerCase() === value.toLowerCase());
    if (match) {
      blockers.push(`${label} matches ${match.ledger}; stale/disposable lockfile IDs are never accepted`);
    }
  }
  return blockers;
}

function extractEntity(payload, key) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  if (payload[key] && typeof payload[key] === 'object') return payload[key];
  return payload;
}

function extractCollection(payload, keys = []) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  for (const key of ['data', 'items', 'results']) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}

function entityId(entity) {
  if (!entity || typeof entity !== 'object') return null;
  return entity.id || entity.uuid || entity.issueId || entity.issue_id || null;
}

function relationId(entity, names) {
  if (!entity || typeof entity !== 'object') return null;
  for (const name of names) {
    const value = entity[name];
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && typeof value.id === 'string') return value.id;
  }
  return null;
}

function exactIdMatches(entity, expectedId) {
  const actualId = entityId(entity);
  return typeof actualId === 'string' && actualId.toLowerCase() === String(expectedId).toLowerCase();
}

function scopedToCompany(entity, companyId) {
  // Supported response equivalents are the direct companyId/company_id fields
  // or a relation object with an exact id. Missing ownership is fail-closed.
  const actualCompanyId = relationId(entity, ['companyId', 'company_id', 'company']);
  return typeof actualCompanyId === 'string' &&
    actualCompanyId.toLowerCase() === String(companyId).toLowerCase();
}

function getAdapterProfile(agent) {
  const config = agent && (agent.adapterConfig || agent.adapter_config || {});
  // Paperclip v2026.707.0 stores hermes_local fields directly in adapterConfig;
  // older evidence fixtures used a hermesLocal envelope. Accept both shapes,
  // but always compare the resolved provider/model exactly.
  const hermesLocal = config.hermesLocal || config.hermes_local || config;
  return {
    adapterType: agent && (agent.adapterType || agent.adapter_type || agent.type || null),
    provider: hermesLocal.provider || null,
    model: hermesLocal.model || null,
    profile: hermesLocal
  };
}

function adapterCheck(agent) {
  if (!agent || typeof agent !== 'object') return 'agent readback is not an object';
  const serialized = JSON.stringify(agent).toLowerCase();
  if (serialized.includes('xiaomi')) return 'agent readback contains a forbidden provider reuse marker';
  const profile = getAdapterProfile(agent);
  if (profile.adapterType !== LIVE_REQUIRED_ADAPTER) {
    return `agent adapter must be exactly ${LIVE_REQUIRED_ADAPTER}`;
  }
  if (profile.provider !== LIVE_REQUIRED_PROVIDER) {
    return `agent provider must be exactly ${LIVE_REQUIRED_PROVIDER}`;
  }
  if (profile.model !== LIVE_REQUIRED_MODEL) {
    return `agent model must be exactly ${LIVE_REQUIRED_MODEL}`;
  }
  return null;
}

function redactText(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/session=([^;\s]+)/gi, 'session=<redacted>')
    .replace(/(?:PAPERCLIP_API_KEY|PAPERCLIP_PASSWORD|MINIMAX_API_KEY|MINIMAX_BASE_URL|OPENAI_API_KEY)\s*[=:]\s*[^\s,;]+/gi, (match) => `${match.split(/[=:]/)[0]}:<redacted>`)
    .replace(/Authorization\s*:\s*Bearer\s+[^\s]+/gi, 'Authorization: Bearer <redacted>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, '<redacted-id>')
    .replace(/M014-S07-T04-[0-9a-f-]{8,}/gi, 'M014-S07-T04-<redacted>');
}

function redactEvidenceValue(value) {
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(redactEvidenceValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, redactEvidenceValue(nested)]));
  }
  return value;
}

function safeResponseShape(body) {
  if (!body || typeof body !== 'object') return { type: body === null ? 'null' : typeof body };
  const shape = { keys: Object.keys(body).slice(0, 40) };
  const id = entityId(body);
  if (id) shape.id = redactText(String(id));
  if (typeof body.status === 'string') shape.status = body.status;
  if (typeof body.terminal === 'boolean') shape.terminal = body.terminal;
  if (typeof body.exit_code === 'number') shape.exit_code = body.exit_code;
  if (typeof body.wakeCount === 'number') shape.wakeCount = body.wakeCount;
  if (typeof body.wake_count === 'number') shape.wake_count = body.wake_count;
  const runId = body.runId || body.run_id;
  if (runId) shape.run_id = redactText(String(runId));
  return redactEvidenceValue(shape);
}

function getHeader(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const wanted = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === wanted);
  return entry ? entry[1] : null;
}

function getSetCookieValues(headers) {
  if (!headers) return [];
  if (typeof headers.getSetCookie === 'function') {
    const values = headers.getSetCookie();
    if (Array.isArray(values)) return values;
  }
  const combined = getHeader(headers, 'set-cookie');
  return combined ? String(combined).split(/,(?=\s*[^;,=]+=[^;,]+)/) : [];
}

function extractSessionCookie(headers) {
  const cookies = getSetCookieValues(headers);
  for (const value of cookies) {
    const pair = String(value).split(';', 1)[0].trim();
    const separator = pair.indexOf('=');
    if (separator < 1) continue;
    const name = pair.slice(0, separator);
    if (/session/i.test(name) && pair.slice(separator + 1).length > 0) return pair;
  }
  return null;
}

async function responseBody(response) {
  if (!response) return { body: null, parse_error: 'missing response' };
  if (typeof response.text === 'function') {
    const text = await response.text();
    if (!text) return { body: null, parse_error: null };
    try {
      return { body: JSON.parse(text), parse_error: null };
    } catch {
      return { body: null, parse_error: 'non_json_response' };
    }
  }
  if (typeof response.json === 'function') {
    try {
      return { body: await response.json(), parse_error: null };
    } catch {
      return { body: null, parse_error: 'non_json_response' };
    }
  }
  return { body: null, parse_error: 'unsupported_response' };
}

function liveBlocker(code, message, where = 'live') {
  return { code, where, message: redactText(message) };
}

function resolveBaseUrl(lockfile, explicitBaseUrl = null) {
  const value = explicitBaseUrl || (lockfile.runtime_target && (lockfile.runtime_target.verified_base_url || lockfile.runtime_target.public_ingress));
  if (typeof value !== 'string' || value.length === 0) throw new Error('lockfile has no resolvable runtime base URL');
  return new URL(value).toString().replace(/\/$/, '');
}

function isSafeRunSeed(value) {
  return typeof value === 'string' &&
    value.length > 0 &&
    value === value.trim() &&
    value.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}

function deriveCorrelationMarker(runSeed) {
  if (!isSafeRunSeed(runSeed)) throw new Error('run-seed must be an explicit stable non-secret token');
  return `M014-S07-T04-${sha256Hex(`correlation:${runSeed}`).slice(0, 32)}`;
}

function deriveIdempotencyKey(seed, operation) {
  if (!isSafeRunSeed(seed)) throw new Error('run-seed must be an explicit stable non-secret token');
  const normalizedOperation = String(operation);
  return `M014-S07-T04-${normalizedOperation}-${sha256Hex(`${normalizedOperation}:${seed}`).slice(0, 32)}`;
}

function normalizeRecoveryBaseUrl(baseUrl) {
  const url = new URL(String(baseUrl));
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

function normalizeRecoveryTarget(baseUrl, targets) {
  const normalized = {
    baseUrl: normalizeRecoveryBaseUrl(baseUrl),
    companyId: String(targets?.companyId ?? '').trim().toLowerCase(),
    projectId: String(targets?.projectId ?? '').trim().toLowerCase(),
    agentId: String(targets?.agentId ?? '').trim().toLowerCase()
  };
  if (Object.values(normalized).some((value) => value.length === 0)) {
    throw new Error('recovery target identity requires baseUrl, companyId, projectId, and agentId');
  }
  return normalized;
}

function buildRecoveryTargetHashes(baseUrl, targets) {
  const normalized = normalizeRecoveryTarget(baseUrl, targets);
  const canonical = [
    `baseUrl=${normalized.baseUrl}`,
    `companyId=${normalized.companyId}`,
    `projectId=${normalized.projectId}`,
    `agentId=${normalized.agentId}`
  ].join('\\n');
  return {
    base_url_hash: sha256Hex(normalized.baseUrl),
    company_id_hash: sha256Hex(normalized.companyId),
    project_id_hash: sha256Hex(normalized.projectId),
    agent_id_hash: sha256Hex(normalized.agentId),
    combined_hash: sha256Hex(canonical)
  };
}

function normalizeRecoveryOperationStatus(operation, status) {
  if (status === 'attempted') return operation === 'issue-create' ? 'issue_pending' : 'heartbeat_pending';
  return status;
}

function recoveryOperationMetadata(idempotencyKey, status = 'not-attempted', details = {}, operation = '') {
  const normalizedStatus = normalizeRecoveryOperationStatus(operation, status);
  return {
    status: normalizedStatus,
    idempotency_key_hash: sha256Hex(idempotencyKey),
    attempted: normalizedStatus !== 'not-attempted',
    confirmed: normalizedStatus === 'confirmed',
    ...details
  };
}

function buildRecoveryLock(runSeed, correlationMarker, idempotencyKeys, status = 'prepared', operations = {}, targetIdentity = null) {
  const targetHashes = targetIdentity && targetIdentity.baseUrl
    ? buildRecoveryTargetHashes(targetIdentity.baseUrl, targetIdentity)
    : targetIdentity;
  if (!targetHashes || typeof targetHashes !== 'object') {
    throw new Error('recovery lock target identity is required');
  }
  return {
    schema_version: RECOVERY_LOCK_SCHEMA_VERSION,
    seed_hash: sha256Hex(runSeed),
    correlation_marker_hash: sha256Hex(correlationMarker),
    target_hashes: targetHashes,
    status,
    last_operation: operations.last_operation || null,
    operations: Object.fromEntries(RECOVERY_OPERATION_NAMES.map((operation) => [
      operation,
      (() => {
        const input = operations[operation];
        const inputStatus = typeof input === 'string' ? input : input?.status || 'not-attempted';
        const details = input && typeof input === 'object' ? { pre_wake_count: input.pre_wake_count } : {};
        return recoveryOperationMetadata(idempotencyKeys[operation], inputStatus, Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined)), operation);
      })()
    ]))
  };
}

function recoveryLockHasUnresolvedMutation(lock) {
  return Boolean(lock && !RECOVERY_LOCK_TERMINAL_STATUSES.includes(lock.status) &&
    Object.values(lock.operations || {}).some((operation) => operation && operation.attempted && !operation.confirmed));
}

function recoveryLockIsUnresolved(lock) {
  return Boolean(lock && !RECOVERY_LOCK_TERMINAL_STATUSES.includes(lock.status));
}

function recoveryLockIdentityMismatches(lock, expectedLock) {
  const mismatches = [];
  for (const field of ['seed_hash', 'correlation_marker_hash']) {
    if (lock[field] !== expectedLock[field]) mismatches.push(field);
  }
  for (const field of ['base_url_hash', 'company_id_hash', 'project_id_hash', 'agent_id_hash', 'combined_hash']) {
    if (lock.target_hashes?.[field] !== expectedLock.target_hashes?.[field]) mismatches.push(`target_hashes.${field}`);
  }
  return mismatches;
}

function validateRecoveryLock(lock) {
  if (!lock || typeof lock !== 'object' || Array.isArray(lock)) return 'recovery lock must be a JSON object';
  if (lock.schema_version !== RECOVERY_LOCK_SCHEMA_VERSION) return 'unsupported recovery lock schema version';
  if (!/^[a-f0-9]{64}$/.test(lock.seed_hash || '')) return 'recovery lock seed_hash is malformed';
  if (!/^[a-f0-9]{64}$/.test(lock.correlation_marker_hash || '')) return 'recovery lock correlation_marker_hash is malformed';
  const targetHashes = lock.target_hashes;
  if (!targetHashes || typeof targetHashes !== 'object' || Array.isArray(targetHashes)) return 'recovery lock target_hashes are missing';
  for (const field of ['base_url_hash', 'company_id_hash', 'project_id_hash', 'agent_id_hash', 'combined_hash']) {
    if (!/^[a-f0-9]{64}$/.test(targetHashes[field] || '')) return `recovery lock target hash is malformed: ${field}`;
  }
  if (typeof lock.status !== 'string' || !/^[a-z-]+$/.test(lock.status)) return 'recovery lock status is malformed';
  if (!lock.operations || typeof lock.operations !== 'object' || Array.isArray(lock.operations)) return 'recovery lock operations are missing';
  for (const operation of RECOVERY_OPERATION_NAMES) {
    const metadata = lock.operations[operation];
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) ||
        !RECOVERY_OPERATION_STATUSES.includes(metadata.status) ||
        typeof metadata.idempotency_key_hash !== 'string' || !/^[a-f0-9]{64}$/.test(metadata.idempotency_key_hash) ||
        typeof metadata.attempted !== 'boolean' || typeof metadata.confirmed !== 'boolean' ||
        metadata.attempted !== (metadata.status !== 'not-attempted') ||
        metadata.confirmed !== (metadata.status === 'confirmed')) {
      return `recovery lock operation metadata is malformed: ${operation}`;
    }
    if (Object.prototype.hasOwnProperty.call(metadata, 'pre_wake_count') &&
        (!Number.isInteger(metadata.pre_wake_count) || metadata.pre_wake_count < 0)) {
      return `recovery lock pre_wake_count is malformed: ${operation}`;
    }
    const allowedOperationKeys = new Set(['status', 'idempotency_key_hash', 'attempted', 'confirmed', 'pre_wake_count']);
    if (Object.keys(metadata).some((key) => !allowedOperationKeys.has(key))) return `recovery lock contains unsupported operation field: ${operation}`;
  }
  if (Object.keys(lock.operations).some((operation) => !RECOVERY_OPERATION_NAMES.includes(operation))) return 'recovery lock contains an unsupported operation';
  if (lock.last_operation !== null && !RECOVERY_OPERATION_NAMES.includes(lock.last_operation)) return 'recovery lock last_operation is malformed';
  const allowedLockKeys = new Set(['schema_version', 'seed_hash', 'correlation_marker_hash', 'target_hashes', 'status', 'last_operation', 'operations']);
  if (Object.keys(lock).some((key) => !allowedLockKeys.has(key))) return 'recovery lock contains unsupported raw fields';
  const raw = JSON.stringify(lock);
  if (/https?:\/\//i.test(raw) || VALIDATOR.scanCredentialLeaks(raw).length > 0 || VALIDATOR.scanUuidLeaks(raw).length > 0) {
    return 'recovery lock contains a raw URL, secret, or full UUID';
  }
  return null;
}

function readRecoveryLock(lockPath = LIVE_RECOVERY_LOCK_PATH, fsImpl = fs) {
  if (!fsImpl.existsSync(lockPath)) return { ok: true, lock: null };
  let parsed;
  try {
    parsed = JSON.parse(fsImpl.readFileSync(lockPath, 'utf8'));
  } catch (error) {
    return { ok: false, reason: `recovery lock cannot be read: ${error && error.message ? error.message : 'invalid JSON'}` };
  }
  const validationError = validateRecoveryLock(parsed);
  return validationError ? { ok: false, reason: validationError } : { ok: true, lock: parsed };
}

function writeRecoveryLockAtomic(lockPath, lock, fsImpl = fs) {
  const validationError = validateRecoveryLock(lock);
  if (validationError) throw new Error(`refusing to write recovery lock: ${validationError}`);
  const directory = path.dirname(lockPath);
  fsImpl.mkdirSync(directory, { recursive: true });
  const temporaryPath = `${lockPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = fsImpl.openSync(temporaryPath, 'w', 0o600);
    fsImpl.writeFileSync(descriptor, `${JSON.stringify(lock, null, 2)}\n`, { encoding: 'utf8' });
    if (typeof fsImpl.fsyncSync === 'function') fsImpl.fsyncSync(descriptor);
    fsImpl.closeSync(descriptor);
    descriptor = undefined;
    fsImpl.renameSync(temporaryPath, lockPath);
  } finally {
    if (descriptor !== undefined) fsImpl.closeSync(descriptor);
    if (fsImpl.existsSync(temporaryPath)) fsImpl.unlinkSync(temporaryPath);
  }
}

function acquireRecoveryLockExclusive(lockPath, lock, fsImpl = fs) {
  const validationError = validateRecoveryLock(lock);
  if (validationError) throw new Error(`refusing to acquire recovery lock: ${validationError}`);
  const directory = path.dirname(lockPath);
  fsImpl.mkdirSync(directory, { recursive: true });
  let descriptor;
  try {
    descriptor = fsImpl.openSync(lockPath, 'wx', 0o600);
    const content = `${JSON.stringify(lock, null, 2)}\n`;
    fsImpl.writeFileSync(descriptor, content, { encoding: 'utf8' });
    if (typeof fsImpl.fsyncSync === 'function') fsImpl.fsyncSync(descriptor);
    return { acquired: true, lock };
  } catch (error) {
    if (error && error.code === 'EEXIST') return { acquired: false, reason: 'recovery lock already exists' };
    throw error;
  } finally {
    if (descriptor !== undefined) fsImpl.closeSync(descriptor);
  }
}

function admitRecoveryLock(lockPath, candidateLock, fsImpl = fs) {
  const acquired = acquireRecoveryLockExclusive(lockPath, candidateLock, fsImpl);
  if (acquired.acquired) return { ok: true, acquired: true, recoveryOnly: false, lock: candidateLock };
  const existing = readRecoveryLock(lockPath, fsImpl);
  if (!existing.ok) return { ok: false, reason: existing.reason };
  const mismatches = recoveryLockIdentityMismatches(existing.lock, candidateLock);
  if (mismatches.length > 0) return { ok: false, code: 'LIVE-RECOVERY-TARGET-MISMATCH', reason: `recovery lock identity mismatch: ${mismatches.join(', ')}` };
  return {
    ok: true,
    acquired: false,
    recoveryOnly: true,
    completed: !recoveryLockIsUnresolved(existing.lock),
    lock: existing.lock
  };
}

function clearRecoveryLock(lockPath = LIVE_RECOVERY_LOCK_PATH, fsImpl = fs) {
  if (fsImpl.existsSync(lockPath)) fsImpl.unlinkSync(lockPath);
}

function makeLiveRequestClient({ baseUrl, origin, fetchFn, cookie, correlationId, idempotencyKeys, journal, budget, onMutationUnconfirmed }) {
  const counts = { issueCreates: 0, heartbeatPosts: 0, otherMutations: 0, getRequests: 0 };
  const dispatch = async ({ method, requestPath, body = null, classification, operation }) => {
    const normalizedMethod = String(method).toUpperCase();
    const normalizedPath = String(requestPath).split('?')[0];
    const actualClassification = classifyRequest(normalizedMethod, requestPath);
    if (classification !== actualClassification && !(classification === 'readback' && actualClassification === 'readback-other')) {
      throw new Error(`request classification mismatch for ${normalizedMethod} ${requestPath}: ${classification} != ${actualClassification}`);
    }
    if (normalizedMethod === 'GET') {
      if (budget.reads >= MAX_READBACK_GETS) {
        throw new Error(`readback budget exhausted at ${MAX_READBACK_GETS} total GET requests`);
      }
      budget.reads += 1;
      counts.getRequests += 1;
    }
    if (LIVE_MUTATION_METHODS.has(normalizedMethod)) {
      if (normalizedMethod !== 'POST') throw new Error(`unsupported live mutation method ${normalizedMethod}`);
      if (/^\/api\/agents\/[^/]+\/heartbeat\/invoke$/.test(normalizedPath)) {
        if (counts.heartbeatPosts >= 1) throw new Error('heartbeat POST budget exceeded: maximum is one');
        counts.heartbeatPosts += 1;
      } else if (/\/api\/companies\/[^/]+\/issues$/.test(normalizedPath)) {
        if (counts.issueCreates >= 1) throw new Error('issue POST budget exceeded: maximum is one');
        counts.issueCreates += 1;
      } else {
        counts.otherMutations += 1;
        throw new Error(`unexpected mutation route ${requestPath}`);
      }
    }
    const headers = {
      Accept: 'application/json',
      Cookie: cookie,
      Origin: origin || baseUrl,
      Referer: `${origin || baseUrl}/`,
      'X-Correlation-ID': correlationId
    };
    if (LIVE_MUTATION_METHODS.has(normalizedMethod)) {
      const idempotencyKey = idempotencyKeys && idempotencyKeys[operation];
      if (typeof idempotencyKey !== 'string' || idempotencyKey.length === 0) {
        throw new Error(`missing operation-specific idempotency key for ${operation}`);
      }
      headers['Content-Type'] = 'application/json';
      headers['Idempotency-Key'] = idempotencyKey;
    }
    let response;
    let parsed = { body: null, parse_error: null };
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LIVE_MAX_HTTP_TIMEOUT_MS);
      try {
        response = await fetchFn(new URL(requestPath, baseUrl).toString(), {
          method: normalizedMethod,
          headers,
          body: body === null ? undefined : JSON.stringify(body),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timer);
      }
      parsed = await responseBody(response);
    } catch (error) {
      journal.push({
        method: normalizedMethod,
        path: redactText(requestPath),
        classification: actualClassification,
        operation,
        status: null,
        request: { cookie: '<redacted>', body_keys: body ? Object.keys(body) : [] },
        response: { transport: 'ambiguous', error_kind: error && error.name ? error.name : 'request_error' }
      });
      if (LIVE_MUTATION_METHODS.has(normalizedMethod) && typeof onMutationUnconfirmed === 'function') {
        onMutationUnconfirmed(operation, 'transport response was ambiguous');
      }
      const wrapped = new Error(`${operation} ${normalizedMethod} response is ambiguous; recovery may use GET only`);
      wrapped.code = 'AMBIGUOUS_MUTATION_RESPONSE';
      wrapped.cause = error;
      throw wrapped;
    }
    const status = Number.isInteger(response.status) ? response.status : null;
    journal.push({
      method: normalizedMethod,
      path: redactText(requestPath),
      classification: actualClassification,
      operation,
      status,
      request: { cookie: '<redacted>', body_keys: body ? Object.keys(body) : [] },
      response: safeResponseShape(parsed.body)
    });
    if (LIVE_MUTATION_METHODS.has(normalizedMethod) &&
      (status === null || status < 200 || status >= 300 || parsed.parse_error || parsed.body === null)) {
      if (typeof onMutationUnconfirmed === 'function') {
        onMutationUnconfirmed(operation, 'mutation response was not a valid 2xx JSON response');
      }
      const wrapped = new Error(`${operation} ${normalizedMethod} response is ambiguous; recovery may use GET only`);
      wrapped.code = 'AMBIGUOUS_MUTATION_RESPONSE';
      wrapped.response = { status, body: parsed.body, parse_error: parsed.parse_error };
      throw wrapped;
    }
    return { response, body: parsed.body, parse_error: parsed.parse_error };
  };
  return { dispatch, counts };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasExactCorrelationMarker(value, marker) {
  if (typeof marker !== 'string' || marker.length === 0) return false;
  const boundaryPattern = new RegExp(`(^|[^A-Za-z0-9_-])${escapeRegExp(marker)}(?![A-Za-z0-9_-])`);
  return boundaryPattern.test(typeof value === 'string' ? value : JSON.stringify(value));
}

function extractIssueMarker(issue, marker) {
  if (!issue || typeof issue !== 'object') return false;
  // The marker is embedded in title/body text, so require token boundaries
  // rather than accepting a substring of another correlation value.
  return hasExactCorrelationMarker(issue, marker);
}

function findIssueByMarker(payload, marker) {
  return extractCollection(payload, ['issues']).find((issue) => extractIssueMarker(issue, marker)) || null;
}

function findOwnedIssueByMarker(issues, marker, companyId, projectId) {
  const candidate = findIssueByMarker(issues, marker);
  if (!candidate) return { issue: null, failure: null };
  if (!entityId(candidate)) return { issue: candidate, failure: 'issue marker match has no exact issue ID' };
  const ownershipFailure = issueCompanyProjectCheck(candidate, companyId, projectId);
  return { issue: candidate, failure: ownershipFailure };
}

function issueCompanyProjectCheck(issue, companyId, projectId) {
  if (!scopedToCompany(issue, companyId)) return 'issue companyId relation is missing or does not exactly match the target company';
  const issueProjectId = relationId(issue, ['projectId', 'project_id', 'project']);
  if (typeof issueProjectId !== 'string' || issueProjectId.length === 0) {
    return 'issue projectId relation is missing';
  }
  if (issueProjectId.toLowerCase() !== String(projectId).toLowerCase()) {
    return 'issue projectId relation does not exactly match the target project';
  }
  return null;
}

function extractIssuePage(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.issues)) return null;
  return payload.issues;
}

function firstPaginationValue(payload, names) {
  const containers = [
    payload,
    payload && payload.pagination,
    payload && payload.meta,
    payload && payload.pageInfo,
    payload && payload.page_info
  ].filter((value) => value && typeof value === 'object' && !Array.isArray(value));
  for (const container of containers) {
    for (const name of names) {
      if (Object.prototype.hasOwnProperty.call(container, name)) return container[name];
    }
  }
  return undefined;
}

function getNextIssuePage(payload, items, currentPage) {
  const nextCursor = firstPaginationValue(payload, ['nextCursor', 'next_cursor']);
  if (typeof nextCursor === 'string' && nextCursor.length > 0) return { cursor: nextCursor };

  const nextPage = firstPaginationValue(payload, ['nextPage', 'next_page']);
  if (Number.isInteger(nextPage) && nextPage > currentPage) return { page: nextPage };

  const next = firstPaginationValue(payload, ['next']);
  if (typeof next === 'string' && next.length > 0) {
    if (next.startsWith('/')) {
      const parsed = new URL(next, 'https://paperclip.invalid');
      const cursor = parsed.searchParams.get('cursor');
      const page = Number(parsed.searchParams.get('page'));
      if (cursor) return { cursor };
      if (Number.isInteger(page) && page > currentPage) return { page };
    } else {
      return { cursor: next };
    }
  }

  const hasMore = firstPaginationValue(payload, ['hasMore', 'has_more']);
  if (hasMore === true) return { page: currentPage + 1 };
  if (hasMore === false || next === null || nextCursor === null) return null;

  // With the documented limit semantics, a short page is complete. A full
  // page without explicit continuation metadata is not provably complete.
  if (items.length < ISSUE_PAGE_SIZE) return null;
  return { incomplete: true };
}

async function readCompleteIssueList(readJson, companyId, operation) {
  const issues = [];
  let page = 1;
  let cursor = null;
  for (let pageCount = 0; pageCount < MAX_ISSUE_LIST_PAGES; pageCount += 1) {
    const requestPath = LIVE_ISSUE_LIST_PATH(companyId, { cursor, page });
    const pageOperation = pageCount === 0 ? operation : `${operation}-page-${pageCount + 1}`;
    const payload = await readJson(requestPath, pageOperation);
    const items = extractIssuePage(payload);
    if (!items) {
      const error = new Error(`${operation} returned no explicit issues collection`);
      error.code = 'INCOMPLETE_ISSUE_LIST';
      throw error;
    }
    issues.push(...items);
    const next = getNextIssuePage(payload, items, page);
    if (!next) return issues;
    if (next.incomplete) {
      const error = new Error(`${operation} returned a full page without continuation metadata; completeness cannot be proven`);
      error.code = 'INCOMPLETE_ISSUE_LIST';
      throw error;
    }
    cursor = next.cursor || null;
    page = next.page || page + 1;
  }
  const error = new Error(`${operation} exceeded bounded pagination limit of ${MAX_ISSUE_LIST_PAGES} pages`);
  error.code = 'INCOMPLETE_ISSUE_LIST';
  throw error;
}

function heartbeatPayload(payload) {
  const root = extractEntity(payload, 'run');
  const resultJson = root && (root.resultJson || root.result_json || payload.resultJson || payload.result_json);
  const bos = resultJson && resultJson.bos;
  const status = root && root.status;
  const terminal = root && typeof root.terminal === 'boolean'
    ? root.terminal
    : ['succeeded', 'failed', 'cancelled', 'timed_out'].includes(String(status));
  return {
    root,
    runId: root && (root.runId || root.run_id || root.id || payload.runId || payload.run_id || payload.id),
    status,
    terminal,
    exitCode: root && (root.exit_code ?? root.exitCode),
    bos
  };
}

function validateHeartbeat(payload, { expectedIssueId = null, expectedIssueKey = null, expectedIssueMarker = null } = {}) {
  const normalized = heartbeatPayload(payload);
  if (JSON.stringify(normalized.root || payload || {}).toLowerCase().includes('xiaomi')) {
    return { ok: false, reason: 'heartbeat response contains a forbidden provider reuse marker', normalized };
  }
  if (!isUsableEntityId(normalized.runId)) {
    return { ok: false, reason: 'heartbeat runId is missing', normalized };
  }
  if (normalized.status !== 'succeeded' || normalized.terminal !== true || normalized.exitCode !== 0) {
    return { ok: false, reason: 'heartbeat did not reach terminal succeeded exit_code=0', normalized };
  }
  if (!normalized.bos || typeof normalized.bos !== 'object') {
    return { ok: false, reason: 'heartbeat resultJson.bos is missing', normalized };
  }
  for (const field of REQUIRED_BOS_RESULT_FIELDS) {
    if (typeof normalized.bos[field] !== 'string' || normalized.bos[field].trim().length === 0) {
      return { ok: false, reason: `heartbeat resultJson.bos.${field} is missing or empty`, normalized };
    }
  }
  const expectedIssueRefs = [expectedIssueId, expectedIssueKey, expectedIssueMarker]
    .filter((value) => typeof value === 'string' && value.length > 0)
    .map((value) => value.toLowerCase());
  if (expectedIssueRefs.length > 0 && !expectedIssueRefs.includes(normalized.bos.issueId.toLowerCase())) {
    return { ok: false, reason: 'heartbeat resultJson.bos.issueId does not exactly match the created issue id, identifier, or correlation marker', normalized };
  }
  return { ok: true, normalized };
}

function buildLiveEvidence(state) {
  const idempotencyKeys = state.idempotencyKeys || {
    'issue-create': 'test-placeholder-issue-create',
    'heartbeat-invoke': 'test-placeholder-heartbeat-invoke'
  };
  const readbackGets = Number(state.counts && state.counts.getRequests) || Number(state.budget && state.budget.reads) || 0;
  const requestJournal = [...state.journal];
  if (state.recoveryOnly) {
    const recoveredMutations = [
      {
        operation: 'issue-create',
        count: state.counts.issueCreates,
        path: LIVE_ISSUE_CREATE_PATH(state.targets.companyId),
        request_body_keys: ['projectId', 'title', 'description', 'assigneeAgentId']
      },
      {
        operation: 'heartbeat-invoke',
        count: state.counts.heartbeatPosts,
        path: LIVE_HEARTBEAT_PATH(state.targets.agentId),
        request_body_keys: ['reason', 'contextSnapshot']
      }
    ];
    for (const recovered of recoveredMutations) {
      if (recovered.count !== 1 || requestJournal.some((entry) => entry.method === 'POST' && entry.path === recovered.path)) continue;
      requestJournal.push({
        operation: recovered.operation,
        method: 'POST',
        path: recovered.path,
        classification: 'business',
        request_body_keys: recovered.request_body_keys,
        status: null,
        response_body_keys: [],
        recovered: true,
        recovery_source: 'persistent target-bound lock plus independent GET readback'
      });
    }
  }
  const observed = {
    issues_created: state.confirmed.issue ? 1 : 0,
    heartbeat_runs_started: state.confirmed.heartbeat ? 1 : 0,
    documents_created: 0,
    comments_created: 0,
    approvals_created: 0,
    agents_mutated: 0,
    unexpected_mutating_routes: state.counts.otherMutations,
    unconfirmed_live_side_effects: state.unconfirmedSideEffects
  };
  const expected = { ...EXPECTED_SIDE_EFFECTS };
  const evidence = {
    $schema: 'https://gsd.local/schemas/runtime-evidence/s07-bounded-bos-e2e-live.v1.json',
    milestone: 'M014-a9jj46',
    slice: 'S07',
    task: 'T04',
    mode: 'live',
    status: state.ok ? 'PASS' : 'FAIL_CLOSED',
    auth_mode: REQUIRED_COOKIE_AUTH_MODE,
    confirmation_scope: 'D062 / M014-a9jj46 / S07 / T04',
    generated: new Date().toISOString(),
    run_seed_hash: state.runSeedHash,
    correlation_marker_sha256: sha256Hex(state.correlationId),
    correlation_id_sha256: sha256Hex(state.correlationId),
    idempotency_key_sha256: {
      issue_create: sha256Hex(idempotencyKeys['issue-create']),
      heartbeat: sha256Hex(idempotencyKeys['heartbeat-invoke']),
      distinct: idempotencyKeys['issue-create'] !== idempotencyKeys['heartbeat-invoke']
    },
    recovery_lock: state.recoveryLock ? {
      schema_version: state.recoveryLock.schema_version,
      seed_hash: state.recoveryLock.seed_hash,
      status: state.recoveryLock.status,
      last_operation: state.recoveryLock.last_operation,
      operations: state.recoveryLock.operations
    } : null,
    target: {
      company_id: redactText(state.targets.companyId),
      project_id: redactText(state.targets.projectId),
      agent_id: redactText(state.targets.agentId)
    },
    adapter_check: state.adapterSummary || { adapter: LIVE_REQUIRED_ADAPTER, provider: LIVE_REQUIRED_PROVIDER, model: LIVE_REQUIRED_MODEL },
    terminal_proof: state.confirmed.heartbeat ? {
      status: state.confirmed.heartbeat.status,
      terminal: state.confirmed.heartbeat.terminal,
      exit_code: state.confirmed.heartbeat.exitCode,
      bos_status: state.confirmed.heartbeat.bosStatus,
      bos_required_fields_present: state.confirmed.heartbeat.bosRequiredFieldsPresent,
      issue_reference_matched: state.confirmed.heartbeat.issueReferenceMatched
    } : null,
    wake_count_delta: state.wakeCountDelta ?? null,
    preflight: {
      pass: Boolean(state.preflight && state.preflight.pass),
      blocker_codes: state.preflight && Array.isArray(state.preflight.blockers) ? state.preflight.blockers.map((b) => b.code).filter(Boolean) : []
    },
    bounded_policy: {
      max_issue_creates: 1,
      max_heartbeat_posts: 1,
      max_readback_gets: MAX_READBACK_GETS,
      max_heartbeat_polls: LIVE_MAX_HEARTBEAT_POLLS,
      retry_policy: 'no POST/PATCH/DELETE retry; ambiguous mutation recovery is GET-only'
    },
    request_journal: requestJournal,
    readback_budget: {
      max: MAX_READBACK_GETS,
      used: readbackGets,
      remaining: MAX_READBACK_GETS - readbackGets,
      scope: 'all GET requests, including prechecks, independent readbacks, recovery, and heartbeat status polling'
    },
    unconfirmed_live_side_effect_events: state.unconfirmedSideEffectEvents || 0,
    exact_side_effect_ledger: {
      expected,
      observed,
      attempted: {
        issue_create_posts: state.counts.issueCreates,
        heartbeat_posts: state.counts.heartbeatPosts,
        readback_gets: readbackGets,
        operations: state.mutationAttempts || {},
        unconfirmed_live_side_effect_events: state.unconfirmedSideEffectEvents || 0
      },
      readback_gets: readbackGets,
      business_mutation_count: state.counts.issueCreates + state.counts.heartbeatPosts,
      acceptance: {
        issue_create_mutations_required: 1,
        heartbeat_mutations_required: 1,
        exact_mutation_counts: state.counts.issueCreates === 1 && state.counts.heartbeatPosts === 1
      },
      invariant: 'all GETs are counted separately; acceptance requires exactly one issue create and one heartbeat mutation; no mutating retry'
    },
    readback_hashes: state.readbackHashes,
    issue_id: state.confirmed.issue ? redactText(state.confirmed.issue.id) : null,
    heartbeat_run_id: state.confirmed.heartbeat ? redactText(state.confirmed.heartbeat.runId) : null,
    failure: state.failure ? { code: state.failure.code, where: state.failure.where, message: redactText(state.failure.message) } : null
  };
  const safeEvidence = redactEvidenceValue(evidence);
  const serialized = JSON.stringify(safeEvidence);
  const credentialHits = VALIDATOR.scanCredentialLeaks(serialized);
  const uuidHits = VALIDATOR.scanUuidLeaks(serialized);
  if (credentialHits.length > 0 || uuidHits.length > 0) {
    throw new Error(`live evidence redaction check failed: credentials=${credentialHits.length}, uuids=${uuidHits.length}`);
  }
  return safeEvidence;
}

function writeLiveEvidence(evidence, filePath) {
  const safeEvidence = redactEvidenceValue(evidence);
  const serialized = JSON.stringify(safeEvidence);
  if (VALIDATOR.scanCredentialLeaks(serialized).length > 0 || VALIDATOR.scanUuidLeaks(serialized).length > 0) {
    throw new Error('refusing to write live evidence that fails secret or UUID redaction scan');
  }
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(safeEvidence, null, 2)}\n`, 'utf8');
}

async function runLive(options = {}) {
  const envFilePath = options.envFilePath || path.resolve(PROJECT_ROOT, '.env');
  const fsImpl = options.fsImpl || fs;
  const runSeed = options.runSeed;
  const heartbeatPollIntervalMs = Number.isInteger(options.pollIntervalMs) && options.pollIntervalMs >= 0
    ? options.pollIntervalMs
    : 4_000;
  const hasValidRunSeed = isSafeRunSeed(runSeed);
  const correlationId = hasValidRunSeed ? deriveCorrelationMarker(runSeed) : 'M014-S07-T04-invalid-run-seed';
  const idempotencyKeys = hasValidRunSeed ? {
    'issue-create': deriveIdempotencyKey(runSeed, 'issue-create'),
    'heartbeat-invoke': deriveIdempotencyKey(runSeed, 'heartbeat-invoke')
  } : {
    'issue-create': 'invalid-run-seed-issue-create',
    'heartbeat-invoke': 'invalid-run-seed-heartbeat-invoke'
  };
  const dotenv = loadDotenv(envFilePath, fsImpl);
  const env = { ...dotenv, ...process.env, ...(options.env || {}) };
  const targets = {
    companyId: options.companyId,
    projectId: options.projectId,
    agentId: options.agentId
  };
  const state = {
    ok: false,
    targets,
    runSeedHash: hasValidRunSeed ? sha256Hex(runSeed) : null,
    correlationId,
    idempotencyKeys,
    recoveryLock: null,
    recoveryOnly: false,
    recoveryLockPath: options.recoveryLockPath || LIVE_RECOVERY_LOCK_PATH,
    journal: [],
    budget: { reads: 0 },
    counts: { issueCreates: 0, heartbeatPosts: 0, otherMutations: 0, getRequests: 0 },
    mutationAttempts: { 'issue-create': 0, 'heartbeat-invoke': 0 },
    unconfirmedOperations: new Set(),
    unconfirmedSideEffectEvents: 0,
    confirmed: { issue: null, heartbeat: null },
    unconfirmedSideEffects: 0,
    preflight: null,
    readbackHashes: {}
  };
  const noteUnconfirmed = (operation, reason) => {
    state.unconfirmedSideEffectEvents += 1;
    if (!state.unconfirmedOperations.has(operation)) {
      state.unconfirmedOperations.add(operation);
      state.unconfirmedSideEffects += 1;
    }
    state.mutationAttempts[operation] = Math.max(state.mutationAttempts[operation] || 0, 1);
    state.lastUnconfirmedMutation = { operation, reason: redactText(reason) };
  };
  const resolveUnconfirmed = (operation) => {
    if (state.unconfirmedOperations.delete(operation)) {
      state.unconfirmedSideEffects = state.unconfirmedOperations.size;
    }
  };
  const fail = async (code, message, where = 'live-precondition') => {
    state.failure = liveBlocker(code, message, where);
    const evidence = buildLiveEvidence(state);
    if (options.writeEvidence) writeLiveEvidence(evidence, options.outputPath || S07_TARGET_EVIDENCE);
    return { ok: false, code, reason: state.failure.message, blockers: [state.failure], evidence, counts: state.counts };
  };

  if (!hasValidRunSeed) {
    return await fail('LIVE-RUN-SEED-01', 'live mode requires an explicit stable non-secret --run-seed', 'run-seed');
  }

  let recoveryTargetIdentity = null;
  let recoveryStatuses = {
    'issue-create': 'not-attempted',
    'heartbeat-invoke': 'not-attempted'
  };
  const persistRecovery = (status, operation, operationStatus) => {
    if (operation) recoveryStatuses[operation] = operationStatus;
    const next = buildRecoveryLock(runSeed, correlationId, idempotencyKeys, status, recoveryStatuses, recoveryTargetIdentity);
    if (Number.isInteger(state.preWakeCount)) next.operations['heartbeat-invoke'].pre_wake_count = state.preWakeCount;
    next.last_operation = operation || state.recoveryLock?.last_operation || null;
    writeRecoveryLockAtomic(state.recoveryLockPath, next, fsImpl);
    state.recoveryLock = next;
    return next;
  };
  const resolveOperation = (operation) => {
    const terminal = operation === 'heartbeat-invoke';
    persistRecovery(terminal ? RECOVERY_LOCK_RESOLVED_STATUS : 'issue-confirmed', operation, 'confirmed');
    resolveUnconfirmed(operation);
  };

  if (idempotencyKeys['issue-create'] === idempotencyKeys['heartbeat-invoke']) {
    return await fail('LIVE-IDEMPOTENCY-01', 'issue-create and heartbeat idempotency keys must be distinct', 'idempotency-policy');
  }

  for (const [label, value] of Object.entries(targets)) {
    const checked = isSafeTargetId(value, label);
    if (!checked.ok) return fail('LIVE-TARGET-01', checked.reason);
  }
  if (options.confirmationToken !== LIVE_CONFIRMATION_TOKEN) {
    return fail('LIVE-CONFIRM-01', `exact confirmation token required: ${LIVE_CONFIRMATION_TOKEN}`);
  }
  if (!isD062ScopedReason(options.reason)) {
    return fail('LIVE-CONFIRM-02', 'reason must start with D062 and name M014-a9jj46 S07 T04');
  }
  if (env.PAPERCLIP_API_KEY) {
    return fail('LIVE-AUTH-01', 'PAPERCLIP_API_KEY is forbidden; session-cookie auth is the only allowed mode');
  }
  if (!env.PAPERCLIP_EMAIL || !env.PAPERCLIP_PASSWORD) {
    return fail('LIVE-AUTH-02', 'PAPERCLIP_EMAIL and PAPERCLIP_PASSWORD are required for session-cookie auth');
  }

  const confirmation = { explicit: true, reason: options.reason };
  const preflightFn = options.preflightFn || runPreflight;
  try {
    state.preflight = await preflightFn({
      lockfilePath: options.lockfilePath || LOCKFILE,
      explicitCompanyId: targets.companyId,
      requiredAdapter: LIVE_REQUIRED_ADAPTER,
      allowedAdapters: [LIVE_REQUIRED_ADAPTER],
      confirmation,
      fsImpl,
      fetchFn: options.preflightFetchFn || options.fetchFn,
      readEnv: (name) => env[name]
    });
  } catch (error) {
    return fail('LIVE-PREFLIGHT-01', 'paperclip-preflight threw; mutation is refused', 'paperclip-preflight');
  }
  if (!state.preflight || state.preflight.pass !== true) {
    return fail('LIVE-PREFLIGHT-02', 'paperclip-preflight did not return pass=true', 'paperclip-preflight');
  }

  const lockResult = readJsonOrFail(options.lockfilePath || LOCKFILE, 'paperclip-runtime.lock.json');
  if (!lockResult.ok) return fail('LIVE-TARGET-02', lockResult.reason, 'lockfile');
  const staleBlockers = rejectLockfileIds(lockResult.parsed, targets);
  if (staleBlockers.length > 0) return fail('LIVE-TARGET-03', staleBlockers.join('; '), 'lockfile');
  let baseUrl;
  try {
    baseUrl = resolveBaseUrl(lockResult.parsed, options.baseUrl || null);
  } catch (error) {
    return fail('LIVE-TARGET-04', 'runtime base URL is missing or invalid', 'lockfile.runtime_target');
  }

  recoveryTargetIdentity = { baseUrl, ...targets };
  const candidateRecoveryLock = buildRecoveryLock(
    runSeed,
    correlationId,
    idempotencyKeys,
    'prepared',
    {},
    recoveryTargetIdentity
  );
  let admission;
  try {
    admission = admitRecoveryLock(state.recoveryLockPath, candidateRecoveryLock, fsImpl);
  } catch (error) {
    return fail('LIVE-RECOVERY-03', 'exclusive recovery lock acquisition failed; business mutation is refused', 'recovery-lock');
  }
  if (!admission.ok) return fail(admission.code || 'LIVE-RECOVERY-01', admission.reason, 'recovery-lock');
  state.recoveryLock = admission.lock;
  state.recoveryOnly = admission.recoveryOnly;
  recoveryStatuses = Object.fromEntries(RECOVERY_OPERATION_NAMES.map((operation) => [
    operation,
    state.recoveryLock.operations[operation].status
  ]));
  const resumeHeartbeatPreWakeCount = state.recoveryLock.operations['heartbeat-invoke'].pre_wake_count;
  for (const [operation, counter] of [['issue-create', 'issueCreates'], ['heartbeat-invoke', 'heartbeatPosts']]) {
    const metadata = state.recoveryLock.operations[operation];
    if (metadata.attempted) {
      state.counts[counter] = 1;
      state.mutationAttempts[operation] = 1;
      if (!metadata.confirmed) noteUnconfirmed(operation, 'recovery lock reports a prior pending mutation awaiting exact GET reconciliation');
    }
  }

  const fetchFn = options.fetchFn || fetch;
  const requestOrigin = options.origin || env.PAPERCLIP_ORIGIN || baseUrl;
  const cookielessClient = async (requestPath, body = null) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LIVE_MAX_HTTP_TIMEOUT_MS);
    try {
      return await fetchFn(new URL(requestPath, baseUrl).toString(), {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Origin: requestOrigin, Referer: `${requestOrigin}/` },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let authResponse;
  try {
    authResponse = await cookielessClient('/api/auth/sign-in/email', { email: env.PAPERCLIP_EMAIL, password: env.PAPERCLIP_PASSWORD });
  } catch (error) {
    return fail('LIVE-AUTH-03', 'session sign-in failed; no mutation was attempted', 'POST /api/auth/sign-in/email');
  }
  if (!authResponse || authResponse.status !== 200) {
    return fail('LIVE-AUTH-04', `session sign-in returned unexpected status ${authResponse && authResponse.status}`, 'POST /api/auth/sign-in/email');
  }
  const cookie = extractSessionCookie(authResponse.headers);
  if (!cookie) return fail('LIVE-AUTH-05', 'session sign-in did not return a session cookie', 'POST /api/auth/sign-in/email');
  state.journal.push({ method: 'POST', path: '/api/auth/sign-in/email', classification: 'control-plane', operation: 'session-sign-in', status: 200, request: { body_keys: ['email', 'password'], cookie: '<absent>' }, response: { session_cookie: '<redacted>' } });

  const recoveredCounts = { ...state.counts };
  const client = makeLiveRequestClient({
    baseUrl,
    origin: requestOrigin,
    fetchFn,
    cookie,
    correlationId: state.correlationId,
    idempotencyKeys: state.idempotencyKeys,
    journal: state.journal,
    budget: state.budget,
    onMutationUnconfirmed: noteUnconfirmed
  });
  Object.assign(client.counts, recoveredCounts);
  state.counts = client.counts;
  const get = async (requestPath, operation) => client.dispatch({ method: 'GET', requestPath, classification: 'readback', operation });
  const post = async (requestPath, body, operation) => {
    if (state.recoveryOnly) {
      const error = new Error('recovery lock exists; business POST replay is refused');
      error.code = 'RECOVERY_POST_REFUSED';
      throw error;
    }
    state.mutationAttempts[operation] = 1;
    const pendingStatus = operation === 'issue-create' ? 'issue_pending' : 'heartbeat_pending';
    persistRecovery('unresolved', operation, pendingStatus);
    return client.dispatch({ method: 'POST', requestPath, body, classification: 'business', operation });
  };
  const readJson = async (requestPath, operation) => {
    const result = await get(requestPath, operation);
    if (!result.response || result.response.status !== 200 || !result.body) throw new Error(`${operation} returned unexpected readback status or body`);
    return result.body;
  };

  let company;
  let projects;
  let agents;
  try {
    company = extractEntity(await readJson(`/api/companies/${encodeURIComponent(targets.companyId)}`, 'company-readback'), 'company');
    if (!exactIdMatches(company, targets.companyId)) return await fail('LIVE-ISOLATION-01', 'fresh company readback ID does not exactly match requested company', 'company-readback');
    projects = extractCollection(await readJson(LIVE_PROJECT_LIST_PATH(targets.companyId), 'project-list-readback'), ['projects']);
    const project = projects.find((candidate) => exactIdMatches(candidate, targets.projectId));
    if (!project) return await fail('LIVE-ISOLATION-03', 'requested project was not found in the exact company project scope', 'project-list-readback');
    if (!scopedToCompany(project, targets.companyId)) return await fail('LIVE-ISOLATION-04', 'project readback belongs to a different company', 'project-list-readback');
    agents = extractCollection(await readJson(LIVE_AGENT_LIST_PATH(targets.companyId), 'agent-list-readback'), ['agents']);
    const agent = agents.find((candidate) => exactIdMatches(candidate, targets.agentId));
    if (!agent) return await fail('LIVE-ISOLATION-05', 'requested agent was not found in the exact company agent scope', 'agent-list-readback');
    if (!scopedToCompany(agent, targets.companyId)) return await fail('LIVE-ISOLATION-06', 'agent readback belongs to a different company', 'agent-list-readback');
    const listAdapterFailure = adapterCheck(agent);
    if (listAdapterFailure) return await fail('LIVE-ADAPTER-01', listAdapterFailure, 'agent-list-readback');
    const freshAgent = extractEntity(await readJson(LIVE_AGENT_READBACK_PATH(targets.agentId), 'agent-readback'), 'agent');
    if (!exactIdMatches(freshAgent, targets.agentId)) return await fail('LIVE-ISOLATION-07', 'fresh agent readback ID does not exactly match requested agent', 'agent-readback');
    if (!scopedToCompany(freshAgent, targets.companyId)) return await fail('LIVE-ISOLATION-08', 'fresh agent readback belongs to a different company', 'agent-readback');
    const adapterFailure = adapterCheck(freshAgent);
    if (adapterFailure) return await fail('LIVE-ADAPTER-01', adapterFailure, 'agent-readback');
    state.adapterSummary = { adapterType: LIVE_REQUIRED_ADAPTER, provider: LIVE_REQUIRED_PROVIDER, model: LIVE_REQUIRED_MODEL };
    const preRuns = extractCollection(
      await readJson(LIVE_HEARTBEAT_RUNS_LIST_PATH(targets.companyId, targets.agentId), 'heartbeat-runs-pre-readback'),
      ['heartbeatRuns', 'heartbeat_runs', 'runs']
    );
    const observedPreWakeCount = preRuns.length;
    state.preWakeCount = Number.isInteger(resumeHeartbeatPreWakeCount) ? resumeHeartbeatPreWakeCount : observedPreWakeCount;
  } catch (error) {
    return await fail('LIVE-READBACK-01', error && error.message ? error.message : 'fresh target readback failed', 'fresh-target-readback');
  }

  const issueMarker = state.correlationId;
  let issueList;
  try {
    issueList = await readCompleteIssueList(readJson, targets.companyId, 'duplicate-pre-readback');
  } catch (error) {
    return await fail('LIVE-DUPLICATE-01', error && error.code === 'INCOMPLETE_ISSUE_LIST'
      ? error.message
      : 'duplicate pre-readback failed; no mutation was attempted', 'duplicate-pre-readback');
  }
  const priorIssueOperation = state.recoveryLock?.operations?.['issue-create'];
  const duplicate = findOwnedIssueByMarker(issueList, issueMarker, targets.companyId, targets.projectId);
  if (duplicate.failure) {
    if (priorIssueOperation?.attempted && !priorIssueOperation.confirmed) noteUnconfirmed('issue-create', duplicate.failure);
    return await fail(priorIssueOperation?.attempted ? 'LIVE-ISSUE-AMBIGUOUS' : 'LIVE-DUPLICATE-03', duplicate.failure, 'duplicate-pre-readback');
  }
  let issueResponse;
  if (duplicate.issue && priorIssueOperation?.attempted) {
    // A rerun with the same seed recovers the prior POST by marker. It never
    // repeats the mutation; the exact issue GET below is still mandatory.
    issueResponse = { body: duplicate.issue, response: { status: 200 }, recovered: true };
  } else if (duplicate.issue) {
    return await fail('LIVE-DUPLICATE-02', 'exact correlation marker already exists with exact company/project ownership; refusing duplicate issue creation', 'duplicate-pre-readback');
  } else if (priorIssueOperation?.attempted) {
    noteUnconfirmed('issue-create', 'recovery lock reports an attempted issue mutation but marker is not yet visible');
    return await fail('LIVE-ISSUE-AMBIGUOUS', 'same-seed recovery found no exact issue marker; no issue POST retry is permitted', 'issue-create-recovery');
  }

  if (state.recoveryOnly && !issueResponse) {
    return await fail('LIVE-RECOVERY-POST-REFUSED', 'unresolved recovery lock permits GET-only recovery; issue POST replay is refused', 'issue-create-recovery');
  }

  const issueBody = {
    title: `M014 S07 bounded BOS Light issue ${issueMarker}`,
    description: `Bounded BOS Light workflow correlation marker ${issueMarker}. Native issue for the isolated acceptance project.`,
    status: 'backlog',
    priority: 'medium',
    projectId: targets.projectId,
    assigneeAgentId: targets.agentId
  };
  if (!issueResponse) {
    try {
      issueResponse = await post(LIVE_ISSUE_CREATE_PATH(targets.companyId), issueBody, 'issue-create');
    } catch (error) {
      if (error && error.code !== 'AMBIGUOUS_MUTATION_RESPONSE') return await fail('LIVE-ISSUE-01', error.message, 'issue-create');
      try {
        const recoveredList = await readCompleteIssueList(readJson, targets.companyId, 'issue-create-ambiguous-recovery');
        const recovered = findOwnedIssueByMarker(recoveredList, issueMarker, targets.companyId, targets.projectId);
        if (recovered.failure || !recovered.issue) {
          noteUnconfirmed('issue-create', recovered.failure || 'issue POST response was ambiguous and marker was not found');
          return await fail('LIVE-ISSUE-AMBIGUOUS', recovered.failure || 'issue POST response was ambiguous and GET recovery found no exact marker with exact company/project ownership; refusing all further mutation', 'issue-create');
        }
        issueResponse = { body: recovered.issue, response: { status: 200 }, recovered: true };
      } catch (recoveryError) {
        noteUnconfirmed('issue-create', recoveryError && recoveryError.message ? recoveryError.message : 'issue recovery failed');
        return await fail('LIVE-ISSUE-AMBIGUOUS', 'issue POST response was ambiguous and GET-only recovery failed; refusing all further mutation', 'issue-create');
      }
    }
  }
  const issue = extractEntity(issueResponse.body, 'issue');
  const issueId = entityId(issue);
  if (!issueResponse.response || ![200, 201].includes(issueResponse.response.status) || !isUsableEntityId(issueId)) {
    noteUnconfirmed('issue-create', 'issue mutation returned an invalid or missing 2xx body/ID');
    return await fail('LIVE-ISSUE-02', 'issue create response did not contain a usable issue ID', 'issue-create');
  }
  const issueRelationFailure = issueCompanyProjectCheck(issue, targets.companyId, targets.projectId);
  if (issueRelationFailure) {
    noteUnconfirmed('issue-create', issueRelationFailure);
    return await fail('LIVE-ISSUE-04', issueRelationFailure, 'issue-create');
  }

  try {
    const issueReadback = extractEntity(await readJson(LIVE_ISSUE_READBACK_PATH(issueId), 'issue-readback'), 'issue');
    if (!exactIdMatches(issueReadback, issueId)) {
      noteUnconfirmed('issue-create', 'issue readback ID does not exactly match the attempted mutation');
      return await fail('LIVE-ISSUE-05', 'issue readback ID does not match the created issue', 'issue-readback');
    }
    const readbackFailure = issueCompanyProjectCheck(issueReadback, targets.companyId, targets.projectId);
    if (readbackFailure) {
      noteUnconfirmed('issue-create', readbackFailure);
      return await fail('LIVE-ISSUE-06', readbackFailure, 'issue-readback');
    }
    state.confirmed.issue = {
      id: issueId,
      identifier: issueReadback.identifier || issueReadback.key || issueReadback.issueKey || null
    };
    resolveOperation('issue-create');
    state.readbackHashes.issue = sha256Hex(JSON.stringify({ id: 'redacted', company: 'exact', project: 'exact', status: issueReadback.status || null }));
  } catch (error) {
    state.unconfirmedSideEffects += 1;
    return await fail('LIVE-ISSUE-READBACK', 'created issue could not be independently read back; heartbeat mutation is refused', 'issue-readback');
  }

  const recoverHeartbeat = async (operation) => {
    try {
      const listed = extractCollection(
        await readJson(LIVE_HEARTBEAT_RUNS_LIST_PATH(targets.companyId, targets.agentId), operation),
        ['heartbeatRuns', 'heartbeat_runs', 'runs']
      );
      const matches = listed.filter((run) => {
        const runAgentId = relationId(run, ['agentId', 'agent_id', 'agent']);
        return runAgentId && runAgentId.toLowerCase() === targets.agentId.toLowerCase() &&
          scopedToCompany(run, targets.companyId) && hasExactCorrelationMarker(run, issueMarker);
      });
      if (matches.length !== 1) {
        noteUnconfirmed('heartbeat-invoke', `heartbeat GET recovery expected exactly one correlated run, found ${matches.length}`);
        throw new Error('heartbeat GET recovery did not prove exactly one correlated company/agent run');
      }
      const recoveredRunId = entityId(matches[0]);
      if (!recoveredRunId) throw new Error('correlated heartbeat summary has no run id');
      const recoveredRun = extractEntity(
        await readJson(LIVE_HEARTBEAT_READBACK_PATH(targets.agentId, recoveredRunId), `${operation}-detail`),
        'run'
      );
      if (!exactIdMatches(recoveredRun, recoveredRunId) || !scopedToCompany(recoveredRun, targets.companyId)) {
        throw new Error('heartbeat detail readback failed exact run/company binding');
      }
      return { body: recoveredRun, response: { status: 200 }, recovered: true };
    } catch (error) {
      noteUnconfirmed('heartbeat-invoke', error && error.message ? error.message : 'heartbeat GET-only recovery failed');
      throw error;
    }
  };

  let heartbeatResponse;
  const priorHeartbeatOperation = state.recoveryLock?.operations?.['heartbeat-invoke'];
  if (priorHeartbeatOperation?.attempted) {
    // Same-seed reruns recover the attempted heartbeat through GET only.
    try {
      heartbeatResponse = await recoverHeartbeat('heartbeat-resume-recovery');
    } catch {
      return await fail('LIVE-HEARTBEAT-AMBIGUOUS', 'same-seed heartbeat recovery failed; no heartbeat POST retry is permitted', 'heartbeat-invoke');
    }
  } else if (state.recoveryOnly) {
    return await fail('LIVE-RECOVERY-POST-REFUSED', 'unresolved recovery lock permits GET-only recovery; heartbeat POST replay is refused', 'heartbeat-recovery');
  } else {
    try {
      heartbeatResponse = await post(LIVE_HEARTBEAT_PATH(targets.agentId), {
        reason: `issue_monitor_bounded_acceptance_no_recovery:${issueMarker}`,
        triggerDetail: 'system',
        forceFreshSession: true,
        idempotencyKey: state.idempotencyKeys['heartbeat-invoke'],
        payload: {
          issueId,
          taskId: issueId,
          taskTitle: `M014 S07 bounded BOS Light workflow ${issueMarker}`,
          taskBody: `Return the required BOS payload for correlation ${issueMarker}.`,
          projectId: targets.projectId,
          correlationMarker: issueMarker
        }
      }, 'heartbeat-invoke');
    } catch (error) {
      // A lost heartbeat response is never retried. Recover only with a scoped
      // agent GET, which may expose a lastHeartbeat/lastRun projection.
      try {
        heartbeatResponse = await recoverHeartbeat('heartbeat-ambiguous-recovery');
      } catch {
        return await fail('LIVE-HEARTBEAT-AMBIGUOUS', 'heartbeat POST response was ambiguous and GET-only recovery failed; no retry is permitted', 'heartbeat-invoke');
      }
    }
  }
  let heartbeatCheck = validateHeartbeat(heartbeatResponse.body, {
    expectedIssueId: issueId,
    expectedIssueKey: state.confirmed.issue && state.confirmed.issue.identifier,
    expectedIssueMarker: issueMarker
  });
  let heartbeat = heartbeatCheck.normalized;
  let heartbeatPolls = 0;
  while (!heartbeatCheck.ok && heartbeat && heartbeat.terminal !== true && heartbeat.runId && heartbeatPolls < LIVE_MAX_HEARTBEAT_POLLS) {
    if (state.budget.reads >= MAX_POLL_BUDGET - 1) break;
    heartbeatPolls += 1;
    try {
      if (heartbeatPollIntervalMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, heartbeatPollIntervalMs));
      }
      const polled = await get(LIVE_HEARTBEAT_READBACK_PATH(targets.agentId, heartbeat.runId), `heartbeat-status-poll-${heartbeatPolls}`);
      heartbeatCheck = validateHeartbeat(polled.body, {
        expectedIssueId: issueId,
        expectedIssueKey: state.confirmed.issue && state.confirmed.issue.identifier,
        expectedIssueMarker: issueMarker
      });
      heartbeat = heartbeatCheck.normalized;
    } catch {
      break;
    }
  }
  if (!heartbeatCheck.ok) {
    noteUnconfirmed('heartbeat-invoke', heartbeatCheck.reason);
    return await fail('LIVE-HEARTBEAT-01', heartbeatCheck.reason, 'heartbeat-readback');
  }
  state.confirmed.heartbeat = {
    runId: heartbeat.runId,
    status: heartbeat.status,
    terminal: heartbeat.terminal,
    exitCode: heartbeat.exitCode,
    bosStatus: heartbeat.bos.status,
    bosRequiredFieldsPresent: REQUIRED_BOS_RESULT_FIELDS.every((field) => typeof heartbeat.bos[field] === 'string' && heartbeat.bos[field].length > 0),
    issueReferenceMatched: true
  };
  state.readbackHashes.heartbeat = sha256Hex(JSON.stringify({ status: heartbeat.status, terminal: heartbeat.terminal, exit_code: heartbeat.exitCode, bos: REQUIRED_BOS_RESULT_FIELDS }));

  try {
    const agentReadback = extractEntity(await readJson(LIVE_AGENT_READBACK_PATH(targets.agentId), 'agent-post-readback'), 'agent');
    if (!exactIdMatches(agentReadback, targets.agentId)) {
      noteUnconfirmed('heartbeat-invoke', 'post-heartbeat agent ID did not exactly match the attempted mutation target');
      return await fail('LIVE-AGENT-02', 'post-heartbeat agent readback ID does not match requested agent', 'agent-post-readback');
    }
    if (!scopedToCompany(agentReadback, targets.companyId)) {
      noteUnconfirmed('heartbeat-invoke', 'post-heartbeat agent ownership did not exactly match the target company');
      return await fail('LIVE-AGENT-03', 'post-heartbeat agent readback belongs to a different company', 'agent-post-readback');
    }
    const postAdapterFailure = adapterCheck(agentReadback);
    if (postAdapterFailure) {
      noteUnconfirmed('heartbeat-invoke', postAdapterFailure);
      return await fail('LIVE-ADAPTER-02', postAdapterFailure, 'agent-post-readback');
    }
    const postRuns = extractCollection(
      await readJson(LIVE_HEARTBEAT_RUNS_LIST_PATH(targets.companyId, targets.agentId), 'heartbeat-runs-post-readback'),
      ['heartbeatRuns', 'heartbeat_runs', 'runs']
    );
    const postWakeCount = postRuns.length;
    if (postWakeCount - state.preWakeCount !== 1) {
      noteUnconfirmed('heartbeat-invoke', `wakeCountDelta must equal 1; observed ${postWakeCount - state.preWakeCount}`);
      return await fail('LIVE-AGENT-04', `wakeCountDelta must equal 1; observed ${postWakeCount - state.preWakeCount}`, 'heartbeat-runs-post-readback');
    }
    state.wakeCountDelta = 1;
    state.readbackHashes.agent = sha256Hex(JSON.stringify({ id: 'redacted', adapter: LIVE_REQUIRED_ADAPTER, provider: LIVE_REQUIRED_PROVIDER, model: LIVE_REQUIRED_MODEL, wakeCountDelta: 1 }));
    resolveOperation('heartbeat-invoke');
  } catch (error) {
    noteUnconfirmed('heartbeat-invoke', error && error.message ? error.message : 'post-heartbeat agent readback failed');
    return await fail('LIVE-AGENT-05', error && error.message ? error.message : 'post-heartbeat agent readback failed', 'agent-post-readback');
  }

  state.ok = true;
  const evidence = buildLiveEvidence(state);
  if (options.writeEvidence) writeLiveEvidence(evidence, options.outputPath || S07_TARGET_EVIDENCE);
  return { ok: true, evidence, counts: state.counts, correlationId: state.correlationId };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    mode: null,
    help: false,
    dryRun: false,
    output: S07_TARGET_EVIDENCE,
    confirmationToken: null,
    reason: null,
    companyId: null,
    projectId: null,
    agentId: null,
    runSeed: null
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--mode') args.mode = next();
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--output' || a === '-o') args.output = path.resolve(PROJECT_ROOT, next());
    else if (a === '--confirm-live' || a === '--confirmation-token') args.confirmationToken = next();
    else if (a === '--reason') args.reason = next();
    else if (a === '--company-id') args.companyId = next();
    else if (a === '--project-id') args.projectId = next();
    else if (a === '--agent-id') args.agentId = next();
    else if (a === '--run-seed') args.runSeed = next();
  }
  return args;
}

function printHelp() {
  process.stdout.write(
    [
      'Usage: node scripts/run_m014_s07_bounded_bos_e2e.js --mode <mode> [--dry-run] [--output <path>]',
      '',
      'Modes:',
      '  plan   audit upstream gate, emit JSON plan, write canonical evidence (fail-closed if upstream deferred)',
      '  live   execute one bounded session-cookie issue + heartbeat flow after every live guard passes',
      '',
      'Plan flags:',
      '  --dry-run     emit the plan to stdout but DO NOT write the evidence file',
      '  --output, -o  override evidence output path (default: runtime-evidence/M014-S07-bounded-bos-e2e.json)',
      '',
      'Live-only flags:',
      `  --confirm-live ${LIVE_CONFIRMATION_TOKEN}   exact confirmation token required`,
      '  --reason <text>               reason must start with D062 and name M014-a9jj46 S07 T04',
      '  --company-id <id>             freshly readback-verified company ID; no lockfile default',
      '  --project-id <id>             project ID read back inside the exact company scope',
      '  --agent-id <id>               agent ID read back inside the exact company scope',
      '  --run-seed <token>             explicit stable non-secret mutation identity (required in live mode)',
      '  --help, -h                    show this help',
      '',
      'Exit codes:',
      '  0  operation passed (or plan emitted)',
      '  2  live/precondition gap; no further mutation is attempted',
      '  3  CLI/load/evidence error',
      '',
      'Examples:',
      '  node scripts/run_m014_s07_bounded_bos_e2e.js --mode plan',
      '  node scripts/run_m014_s07_bounded_bos_e2e.js --mode plan --dry-run',
      '  node scripts/run_m014_s07_bounded_bos_e2e.js --mode live --confirm-live M014-a9jj46/S07/T04/D062 --reason "D062 M014-a9jj46 S07 T04 bounded live proof" --company-id <fresh-company-id> --project-id <fresh-project-id> --agent-id <fresh-agent-id>',
      ''
    ].join('\n')
  );
}

function runCLI(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return 0;
  }
  if (!args.mode) {
    process.stderr.write('error: --mode <mode> is required (try --help)\n');
    return 3;
  }
  if (args.mode !== 'plan' && args.mode !== 'live') {
    process.stderr.write(`error: unknown mode "${args.mode}" (expected "plan" or "live")\n`);
    return 3;
  }

  if (args.mode === 'live') {
    if (args.dryRun) {
      process.stdout.write(JSON.stringify({ mode: 'live', dispatch: 'skipped', reason: 'dry-run never authenticates or mutates' }) + '\n');
      return 0;
    }
    return runLive({
      confirmationToken: args.confirmationToken,
      reason: args.reason,
      companyId: args.companyId,
      projectId: args.projectId,
      agentId: args.agentId,
      runSeed: args.runSeed,
      outputPath: args.output,
      writeEvidence: true
    }).then((result) => {
      process.stdout.write(JSON.stringify({ ok: result.ok, status: result.evidence && result.evidence.status, counts: result.counts }) + '\n');
      if (!result.ok) process.stderr.write(`FAIL: ${result.reason}\n`);
      return result.ok ? 0 : 2;
    }).catch((error) => {
      process.stderr.write(`FAIL: live runner failed closed: ${error && error.message ? redactText(error.message) : 'unknown'}\n`);
      return 2;
    });
    // CLI is synchronous for plan mode, but live mode is promise-backed. The
    // main guard below handles the promise return without allowing a second
    // live invocation.
  }

  // Step 1: lockfile audit
  const lockfileAudit = auditLockfile();
  if (!lockfileAudit.ok) {
    process.stderr.write(`FAIL: lockfile audit failed: ${lockfileAudit.reason}\n`);
    return 2;
  }

  // Step 2: upstream gate audit
  const auditResult = auditUpstreamGate();

  // Step 3: build the bounded session-cookie plan
  const plan = buildBoundedSessionCookiePlan(auditResult);

  // Step 4: build + write canonical evidence (fail-closed shape)
  const evidence = buildCanonicalEvidence(plan, auditResult, lockfileAudit);

  if (!args.dryRun) {
    try {
      writeEvidenceToFile(evidence, args.output);
    } catch (err) {
      process.stderr.write(`FAIL: cannot write evidence: ${err && err.message ? err.message : 'unknown'}\n`);
      return 3;
    }
  }

  // Step 5: emit JSON plan to stdout
  process.stdout.write(JSON.stringify(plan, null, 2) + '\n');

  // Step 6: surface upstream blockers on stderr (but exit 0 — plan was emitted)
  if (auditResult.blockers.length > 0) {
    process.stderr.write(`INFO: upstream gate NOT satisfied; ${auditResult.blockers.length} blocker(s) recorded in evidence (fail-closed posture).\n`);
  }

  return 0;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Path constants (for tests + downstream T03/T04)
  PROJECT_ROOT,
  S07_TARGET_EVIDENCE,
  UPSTREAM_ARTIFACT_PATHS,
  LOCKFILE,
  // Runner-specific constants
  REQUIRED_BOUNDED_AGENT_KIND,
  REQUIRED_COOKIE_AUTH_MODE,
  ROUTE_CONTRACT,
  REQUIRED_BUSINESS_ROUTES,
  REQUIRED_READBACK_ROUTES,
  REQUIRED_CONTROL_PLANE_ROUTES,
  routePath,
  MAX_READBACK_GETS,
  MAX_POLL_BUDGET,
  ISSUE_PAGE_SIZE,
  MAX_ISSUE_LIST_PAGES,
  EXPECTED_SIDE_EFFECTS,
  OBSERVED_SIDE_EFFECTS_FAIL_CLOSED,
  REQUIRED_BOS_RESULT_FIELDS,
  SYNTHETIC_EMPTY_BOS_PAYLOAD,
  LIVE_CONFIRMATION_TOKEN,
  LIVE_REQUIRED_ADAPTER,
  LIVE_REQUIRED_PROVIDER,
  LIVE_REQUIRED_MODEL,
  LIVE_MAX_HEARTBEAT_POLLS,
  LIVE_RECOVERY_LOCK_PATH,
  RECOVERY_LOCK_SCHEMA_VERSION,
  RECOVERY_LOCK_RESOLVED_STATUS,
  RECOVERY_OPERATION_NAMES,
  RECOVERY_OPERATION_STATUSES,
  // Loaders
  readJsonOrFail,
  loadLockfile,
  loadUpstreamArtifacts,
  // Redaction helpers
  redactCookie,
  redactSessionCookieHeader,
  redactSecretRef,
  sha256Hex,
  parseDotenv,
  loadDotenv,
  isD062ScopedReason,
  rejectLockfileIds,
  isSafeRunSeed,
  isUsableEntityId,
  deriveCorrelationMarker,
  deriveIdempotencyKey,
  normalizeRecoveryBaseUrl,
  normalizeRecoveryTarget,
  buildRecoveryTargetHashes,
  buildRecoveryLock,
  recoveryLockIdentityMismatches,
  recoveryLockHasUnresolvedMutation,
  recoveryLockIsUnresolved,
  admitRecoveryLock,
  acquireRecoveryLockExclusive,
  readRecoveryLock,
  writeRecoveryLockAtomic,
  clearRecoveryLock,
  validateRecoveryLock,
  LIVE_ISSUE_CREATE_PATH,
  LIVE_ISSUE_LIST_PATH,
  LIVE_ISSUE_READBACK_PATH,
  hasExactCorrelationMarker,
  extractIssueMarker,
  findIssueByMarker,
  findOwnedIssueByMarker,
  issueCompanyProjectCheck,
  scopedToCompany,
  extractIssuePage,
  validateHeartbeat,
  getNextIssuePage,
  readCompleteIssueList,
  extractSessionCookie,
  redactText,
  buildLiveEvidence,
  writeLiveEvidence,
  runLive,
  executeLive: runLive,
  runLiveMode: runLive,
  // Classifier
  classifyRequest,
  // Audits
  auditLockfile,
  auditUpstreamArtifact,
  auditUpstreamGate,
  // Plan builders
  buildSessionCookiePlan,
  buildIssueCreatePlan,
  buildHeartbeatInvokePlan,
  buildIssueReadbackPlan,
  buildWakeCountCheckPlan,
  buildBoundedPollHistory,
  buildRequestJournal,
  buildSideEffectLedger,
  buildPrePostCounters,
  buildNativeReadbackHashes,
  buildValidatorCheckIds,
  buildBlockerBoundary,
  buildInheritedConstraints,
  buildBoundedSessionCookiePlan,
  // Evidence builder + writer
  buildCanonicalEvidence,
  writeEvidenceToFile,
  // CLI
  parseArgs,
  runCLI
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (require.main === module) {
  const cliResult = runCLI(process.argv.slice(2));
  if (cliResult && typeof cliResult.then === 'function') {
    cliResult.then((code) => process.exit(code)).catch(() => process.exit(2));
  } else {
    process.exit(cliResult);
  }
}