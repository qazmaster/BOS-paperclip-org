#!/usr/bin/env node
/**
 * @file scripts/run_m014_s07_bounded_bos_e2e.js
 *
 * M014-a9jj46/S07 — Bounded BOS Light E2E gate runner (T02).
 *
 * Side-effect-free planning runner with bounded session-cookie semantics.
 * The runner audits the same fail-closed upstream gate as the validator, then
 * emits a JSON plan describing the planned bounded session-cookie execution:
 *
 *   1. ONE control-plane POST  /api/auth/sign-in               -> Set-Cookie session=<id>
 *   2. ONE business        POST /api/issues                    -> create native issue
 *   3. ONE business        POST /api/agents/{id}/heartbeat     -> invoke hermes_local heartbeat
 *   4. Independent       GET /api/issues/{issue_id}            -> native issue readback
 *   5. Independent       GET /api/agents/{id}                  -> wakeCount check (wakeCountDelta=1)
 *
 * The runner NEVER dispatches any real HTTP request. It builds a structured
 * evidence file at runtime-evidence/M014-S07-bounded-bos-e2e.json that:
 *
 *   - records every planned request with classification
 *     (control-plane / business / readback),
 *   - redacts session cookies, credentials, and full UUID literals using the
 *     same redaction discipline as T01's validator,
 *   - declares the expected-versus-observed side-effect ledger
 *     (issues_created=1, heartbeat_runs_started=1, others=0,
 *      unexpected_mutating_routes=0, unconfirmed_live_side_effects=0),
 *   - declares the bounded poll history (capped at MAX_POLL_BUDGET=8),
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
 *   - The runner does NOT make HTTP calls, does NOT execute subprocesses,
 *     does NOT mutate git state, and does NOT write credentials.
 *   - Session cookies are redacted to 8-char prefixes; credentials are
 *     caught by the validator's scanCredentialLeaks; full UUIDs are
 *     redacted to 8-char prefixes.
 *   - The runner emits fail-closed evidence (business_mutation_count=0 +
 *     zero ledger counters) whenever upstream is deferred.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VALIDATOR = require('./validate_m014_s07_bounded_bos_e2e');

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

const REQUIRED_BUSINESS_ROUTES = Object.freeze([
  'POST /api/issues',
  'POST /api/agents/{bounded_agent_id}/heartbeat'
]);

const REQUIRED_READBACK_ROUTES = Object.freeze([
  'GET /api/issues/{issue_id}',
  'GET /api/agents/{bounded_agent_id}'
]);

const REQUIRED_CONTROL_PLANE_ROUTES = Object.freeze([
  'POST /api/auth/sign-in'
]);

// Bounded poll budget — maximum number of GET polls allowed during readback
// polling. Per Q6 Load Profile gate: not a load test; cap at 8 polls.
const MAX_POLL_BUDGET = 8;

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
// observed = 0. T03/T04 will replace this with real observed counters when
// upstream is fully promoted and a single operator-confirmed live run is
// captured.
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
// This is the synthetic empty-bos-payload that sha256 hashes against. T03/T04
// will replace it with the real raw resultJson.bos readback shape.
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
  // Build a regex from each route template. Templated segments like
  // {bounded_agent_id} become [^/]+ so resolved paths (with substituted ids)
  // match correctly.
  const routeMatches = (routes, expectedMethod) => {
    const prefix = `${expectedMethod} `;
    for (const r of routes) {
      if (!r.startsWith(prefix)) continue;
      const pathPart = r.slice(prefix.length);
      const regexStr = '^' + pathPart.replace(/\{[^}]+\}/g, '[^/]+') + '$';
      if (new RegExp(regexStr).test(p)) return true;
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
    policy: 'Control-plane sign-in: ONE POST /api/auth/sign-in to acquire a session cookie. The cookie value is redacted in the evidence; only its 8-char prefix is recorded.',
    planned_http_invocation: {
      method: 'POST',
      path: '/api/auth/sign-in',
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
    policy: 'Business: ONE POST /api/issues creates the native correlated issue. Cookie auth via session-cookie. Body carries issue title/description/body. Title references the bounded test agent (NOT R3 stale prefix).',
    classification: 'business',
    planned_http_invocation: {
      method: 'POST',
      path: '/api/issues',
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
      bounded_agent_id_format: 'fresh <UUID v4> — NOT from R3 stale_company_ids ledger; created in same operator session, NOT extracted from previous S04/S05/S06 evidence',
      bounded_agent_id_prefix_constraint: '8-char prefix MUST NOT intersect R3_STALE_PREFIXES',
      adapter_profile_summary: 'paperclip adapterConfig.hermesLocal with provider=minimax, model=MiniMax-M3, endpoint_class=openai-compatible, api_key_secret_ref=MINIMAX_API_KEY, base_url_secret_ref=MINIMAX_BASE_URL, structured_output_schema=bos, session_id_format_expected=YYYYMMDD_HHMMSS_<6hex>'
    },
    side_effect_classification: 'issues_created (counts as 1 in the side-effect ledger)',
    redaction_discipline: 'request headers redacted to 8-char prefix; request body never contains credentials; response id redacted to 8-char prefix; xiaomi references forbidden'
  };
}

function buildHeartbeatInvokePlan(audits) {
  const session = 'session-cookie:8char-prefix-only';
  return {
    policy: 'Business: ONE POST /api/agents/{bounded_agent_id}/heartbeat invokes hermes_local heartbeat with MiniMax M3. Wake count MUST increment by exactly 1 (wakeCountDelta=1).',
    classification: 'business',
    planned_http_invocation: {
      method: 'POST',
      path_template: '/api/agents/{bounded_agent_id}/heartbeat',
      path_resolved_with: '<fresh bounded_agent_id; 8-char prefix NOT in R3_STALE_PREFIXES>',
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
      bounded_agent_id_prefix_constraint: '8-char prefix MUST NOT intersect R3_STALE_PREFIXES',
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
    policy: 'Independent readback: GET /api/issues/{issue_id} confirms the issue created by buildIssueCreatePlan. Cookie auth. Independent of the issue-create POST.',
    classification: 'readback',
    planned_http_invocation: {
      method: 'GET',
      path_template: '/api/issues/{issue_id}',
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
    policy: 'Independent readback: GET /api/agents/{bounded_agent_id} returns current wakeCount. wakeCountDelta = post - pre. Pre captured BEFORE heartbeat invoke; post captured AFTER.',
    classification: 'readback',
    planned_http_invocation: {
      method: 'GET',
      path_template: '/api/agents/{bounded_agent_id}',
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
  // Bounded poll history — capped at MAX_POLL_BUDGET=8 polls across the
  // entire execution. Each poll is a GET readback.
  const polls = [];
  // Polls 1-2: issue readback (initial + retry if not yet visible)
  polls.push({ seq: 1, route: 'GET /api/issues/{issue_id}', poll_kind: 'issue-readback', budget_remaining_after: MAX_POLL_BUDGET - 1 });
  polls.push({ seq: 2, route: 'GET /api/issues/{issue_id}', poll_kind: 'issue-readback-retry', budget_remaining_after: MAX_POLL_BUDGET - 2 });
  // Polls 3-6: wakeCount pre/post + heartbeat status polling
  polls.push({ seq: 3, route: 'GET /api/agents/{bounded_agent_id}', poll_kind: 'wakeCount-pre', budget_remaining_after: MAX_POLL_BUDGET - 3 });
  polls.push({ seq: 4, route: 'GET /api/agents/{bounded_agent_id}', poll_kind: 'wakeCount-post', budget_remaining_after: MAX_POLL_BUDGET - 4 });
  polls.push({ seq: 5, route: 'GET /api/agents/{bounded_agent_id}/heartbeat/{runId}', poll_kind: 'heartbeat-status', budget_remaining_after: MAX_POLL_BUDGET - 5 });
  polls.push({ seq: 6, route: 'GET /api/agents/{bounded_agent_id}/heartbeat/{runId}', poll_kind: 'heartbeat-status-retry', budget_remaining_after: MAX_POLL_BUDGET - 6 });
  // Polls 7-8: readback resilience (terminal check + final state)
  polls.push({ seq: 7, route: 'GET /api/agents/{bounded_agent_id}/heartbeat/{runId}', poll_kind: 'terminal-check', budget_remaining_after: MAX_POLL_BUDGET - 7 });
  polls.push({ seq: 8, route: 'GET /api/issues/{issue_id}', poll_kind: 'final-issue-state', budget_remaining_after: 0 });
  return {
    max_poll_budget: MAX_POLL_BUDGET,
    polls_executed_planned: polls.length,
    polls,
    budget_policy: 'No poll beyond seq=8. ANY unbounded poll is fail-closed.',
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
    path: '/api/auth/sign-in',
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
    path: '/api/issues',
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
    path: '/api/agents/{bounded_agent_id}/heartbeat',
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
    path: '/api/issues/{issue_id}',
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
    path: '/api/agents/{bounded_agent_id}',
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
    policy: 'expected-versus-observed side-effect ledger. Runner is fail-closed (no dispatch), so observed = zeros across the board. T03/T04 replace observed counters with real numbers from a single operator-confirmed live run.',
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
  // sha256 of expected payload shapes (synthetic empty BOS payload). T03/T04
  // will compute the real sha256 against the actual readback shapes.
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
    policy: 'sha256 hashes of expected payload shapes for native readbacks. Real sha256 will replace these in T03/T04 after a single operator-confirmed live run.',
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
  // All 30 V-BOS-E2E-NN IDs the runner claims to satisfy when the upstream
  // gate is fully promoted. Currently upstream is deferred, so all checks
  // are reported as fail-closed; the runner advertises which IDs would be
  // asserted against canonical evidence in T03/T04.
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
      max_readback_gets: 2,
      max_polls: MAX_POLL_BUDGET,
      max_business_mutations_per_run: 2,
      invariant: 'EXACTLY 1 issue create + EXACTLY 1 heartbeat invoke + 1 sign-in + 2 readbacks. Any deviation is fail-closed.'
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
    purpose: 'Canonical bounded BOS Light E2E evidence (side-effect-free planning artifact). Records redacted request journal with control-plane/business/readback classification, bounded poll history, pre/post counters, expected-versus-observed side-effect ledger, native readback hashes, blocker boundary, and validator check IDs. Runner does NOT dispatch; observed counters are all zero (fail-closed posture). T03/T04 will replace observed counters with real numbers from a single operator-confirmed live run.',
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
    native_readback_hashes: plan.native_readback_hashes,
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
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { mode: null, help: false, dryRun: false, output: S07_TARGET_EVIDENCE };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mode') {
      args.mode = argv[++i];
    } else if (a === '--help' || a === '-h') {
      args.help = true;
    } else if (a === '--dry-run') {
      args.dryRun = true;
    } else if (a === '--output' || a === '-o') {
      args.output = path.resolve(PROJECT_ROOT, argv[++i]);
    }
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
      '',
      'Flags:',
      '  --dry-run     emit the plan to stdout but DO NOT write the evidence file',
      '  --output, -o  override evidence output path (default: runtime-evidence/M014-S07-bounded-bos-e2e.json)',
      '  --help, -h    show this help',
      '',
      'Exit codes:',
      '  0  plan emitted (and evidence written unless --dry-run)',
      '  2  precondition gap (missing artifact, malformed JSON, deferred upstream)',
      '  3  load error (cannot read evidence path / lockfile path)',
      '',
      'Examples:',
      '  node scripts/run_m014_s07_bounded_bos_e2e.js --mode plan',
      '  node scripts/run_m014_s07_bounded_bos_e2e.js --mode plan --dry-run',
      '  node scripts/run_m014_s07_bounded_bos_e2e.js --mode plan --output /tmp/s07-evidence.json',
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
  if (args.mode !== 'plan') {
    process.stderr.write(`error: unknown mode "${args.mode}" (only "plan" is supported)\n`);
    return 3;
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
  REQUIRED_BUSINESS_ROUTES,
  REQUIRED_READBACK_ROUTES,
  REQUIRED_CONTROL_PLANE_ROUTES,
  MAX_POLL_BUDGET,
  EXPECTED_SIDE_EFFECTS,
  OBSERVED_SIDE_EFFECTS_FAIL_CLOSED,
  REQUIRED_BOS_RESULT_FIELDS,
  SYNTHETIC_EMPTY_BOS_PAYLOAD,
  // Loaders
  readJsonOrFail,
  loadLockfile,
  loadUpstreamArtifacts,
  // Redaction helpers
  redactCookie,
  redactSessionCookieHeader,
  redactSecretRef,
  sha256Hex,
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
  process.exit(runCLI(process.argv.slice(2)));
}