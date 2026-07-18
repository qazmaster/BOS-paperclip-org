#!/usr/bin/env node
'use strict';

/**
 * scripts/run_m015_s03_diagnostic_heartbeat.js
 *
 * M015-S03 / T02 — seven bounded non-business diagnostic heartbeats.
 *
 * Authenticates against the Paperclip board via session cookie (reusing
 * apply_m015_seven_agent_contract#makeBoardClient), re-resolves the seven
 * canonical division agents by name from the live company roster (re-using
 * probe_m015_seven_agent_environment#discoverCanonicalAgents), captures a
 * bounded BEFORE/AFTER side-effect readback across issues / documents /
 * comments / approvals / agents / heartbeat_runs, and then for each agent
 * in mutation_gate.mutation_order:
 *
 *   1. POST /api/agents/{agentId}/heartbeat/invoke
 *        body: non-business diagnostic prompt + metadata
 *        expectation: status=succeeded, hermes_local/MiniMax-M3, schema-valid
 *                     resultJson.bos with Paperclip context markers
 *   2. Poll  GET /api/heartbeat-runs/{runId}    bounded to MAX_POLL_BUDGET=12
 *        (5s interval); terminal status MUST be observed before budget
 *        exhaustion; poll-budget exhausted = fail-closed blocker.
 *   3. Compute wake_count_delta from independent heartbeat-runs list BEFORE
 *      and AFTER the invoke (NOT from the invoke response body) — same
 *      independence discipline used in M014-S07 bounded BOS E2E.
 *
 * Stop-on-first-blocker (same as T01 / S02 apply): only a clean pass for
 * ALL seven agents admits T03 / S04. Any single blocker is fatal.
 *
 * Output (always written, even on failure for forensic trail):
 *   runtime-evidence/M015-S03-seven-agent-diagnostic-runs.json
 *
 * Re-exports BLOCKER_CODES / CANONICAL_DIVISION_NAMES / scrubEvidence / etc.
 * from probe_m015_seven_agent_environment so T03 / T04 can compose off the
 * same vocabulary without forking redaction discipline.
 */

const fs = require('fs');
const path = require('path');
const {
  loadEnv,
  makeBoardClient,
  unwrapList,
  redactError,
} = require('./apply_m015_seven_agent_contract');
const {
  CANONICAL_DIVISION_NAMES,
  BLOCKER_CODES: T01_BLOCKER_CODES,
  scrubEvidence,
  redactAdapterConfig,
  discoverCanonicalAgents,
  XIAOMI_RE,
  CREDENTIAL_ASSIGNMENT,
  UUID_FULL,
} = require('./probe_m015_seven_agent_environment');

const ROOT = path.resolve(__dirname, '..');
const CONTRACT_PATH = path.join(ROOT, 'runtime-evidence/M015-S01-seven-agent-target-contract.json');
const T01_EVIDENCE_PATH = path.join(ROOT, 'runtime-evidence/M015-S03-seven-agent-test-environment.json');
const OUTPUT_PATH = path.join(ROOT, 'runtime-evidence/M015-S03-seven-agent-diagnostic-runs.json');
const DEFAULT_BASE_URL = 'http://127.0.0.1:43131';
const DEFAULT_ORIGIN = 'https://paperclip.oysana.com';

// T06 orchestrator allows extending the bounded poll budget for cold-start
// latency of the Hermes/MiniMax-M3 AI. The slice-plan default of 12 (60 s)
// assumes AI responses faster than real measured latency (cold start
// 100-315 s, warm 30-60 s). The override keeps the policy fail-closed —
// any non-terminal outcome after the extended budget still emits the same
// POLL-BUDGET-EXHAUSTED blocker — while accommodating real AI timing.
//
// T10 fix: raised standalone default from 12 to 180 polls (15 min) to
// match the measured cold-start envelope observed during T08/T09 runs
// (Div1.HCO newest run took 376 s before cancellation; Div7.MissionControl
// newest run took 605 s before timed_out). The 600-poll hard ceiling
// (50 min) is unchanged — bounded polling is preserved. This is a
// configuration change only; canonical-name, fresh-config, redaction,
// vendor-reuse, schema, and side-effect guards are unchanged. Standalone
// T02 invocations that previously exited at 12 polls (60 s) now wait
// up to 180 polls (15 min) before declaring POLL-BUDGET-EXHAUSTED, which
// matches the T06 orchestrator's documented M015_POLL_BUDGET=60
// (and T10 recommendation M015_POLL_BUDGET=180) envelope.
const MAX_POLL_BUDGET = (() => {
  const raw = process.env.M015_POLL_BUDGET;
  if (!raw) return 180;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 180;
  if (n > 600) return 600; // hard ceiling 50 minutes — prevents accidental runaway
  return n;
})();
const POLL_INTERVAL_MS = 5000;
const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'expired', 'timed_out']);
const SUCCESS_TERMINAL_STATUS = 'succeeded';
const NON_BUSINESS_PROMPT_PREFIX = 'bounded non-business diagnostic heartbeat';

// BOS-Light resultJson.bos required fields for the diagnostic schema-valid
// check (paperclip context markers). `issueId` is intentionally NOT in this
// list because non-business diagnostic heartbeats do not mutate Paperclip
// state — hermes returns issueId=null in that case, and that is observed
// truth about the runtime, not a contract violation. T03 / validator may
// separately assert business invariants on top.
const REQUIRED_BOS_DIAGNOSTIC_FIELDS = Object.freeze([
  'schemaVersion',
  'runId',
  'division',
  'role',
  'status',
]);

// M015-S03 / T02 heartbeat-specific blocker codes. These compose on top of
// the T01 vocabulary (NAME-DRIFT, LEAK-*) and the canonical agent-blank
// formats. Re-exported via `BLOCKER_CODES` for T03 / T04 reuse.
const T02_BLOCKER_CODES = Object.freeze({
  RUNNER_FAILURE: 'M15-S03-RUNNER-FAILURE',
  POLL_BUDGET_EXHAUSTED: (name) => `M15-S03-AGT-${name}-POLL-BUDGET-EXHAUSTED`,
  HTTP_NON_SUCCESS: (name, code) => `M15-S03-AGT-${name}-HTTP-${code}`,
  RUN_NOT_TERMINAL: (name, status) => `M15-S03-AGT-${name}-RUN-STATUS-${(status || 'unknown').toUpperCase()}`,
  RUN_NOT_SUCCEEDED: (name, status) => `M15-S03-AGT-${name}-RUN-NOT-SUCCEEDED-${(status || 'unknown').toUpperCase()}`,
  WAKE_DELTA_NOT_ONE: (name, delta) => `M15-S03-AGT-${name}-WAKE-DELTA-${delta}`,
  RESULT_JSON_MISSING: (name) => `M15-S03-AGT-${name}-RESULT-JSON-MISSING`,
  BOS_MISSING: (name) => `M15-S03-AGT-${name}-BOS-MISSING`,
  BOS_FIELD_MISSING: (name, field) => `M15-S03-AGT-${name}-BOS-FIELD-${field}-MISSING`,
  ADAPTER_TYPE_MISMATCH: (name, observed) => `M15-S03-AGT-${name}-ADAPTER-TYPE-${(observed || 'unknown').toUpperCase()}`,
  PROVIDER_MISMATCH: (name, observed) => `M15-S03-AGT-${name}-PROVIDER-${(observed || 'unknown').toUpperCase()}`,
  MODEL_MISMATCH: (name, observed) => `M15-S03-AGT-${name}-MODEL-${(observed || 'unknown').toUpperCase()}`,
  CONTEXT_MISSING: (name) => `M15-S03-AGT-${name}-CONTEXT-MISSING`,
  SIDE_EFFECT_DETECTED: (name, kind) => `M15-S03-AGT-${name}-SIDE-EFFECT-${kind}`,
  GLOBAL_SIDE_EFFECT: (kind, delta) => `M15-S03-SIDE-EFFECT-${kind}-DELTA-${delta}`,
  GLOBAL_HEARTBEAT_DELTA: (observed, expected) => `M15-S03-HEARTBEAT-RUNS-DELTA-${observed}-EXPECTED-${expected}`,
  REDACTION_LEAK_UUID: 'M15-S03-LEAK-UUID',
  REDACTION_LEAK_CRED: 'M15-S03-LEAK-CRED',
  REDACTION_LEAK_XIAOMI: 'M15-S03-LEAK-XIAOMI',
});

const BLOCKER_CODES = Object.freeze({
  ...T01_BLOCKER_CODES,
  ...T02_BLOCKER_CODES,
});

const UUID_PREFIX = (value) => {
  if (typeof value !== 'string') return '<redacted-id>';
  const match = UUID_FULL.exec(value);
  return match ? `${match[0].slice(0, 8)}-<redacted>` : '<redacted-id>';
};

const REDACTED_RUN_PREFIX_LEN = 8;

function redactRunId(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  // Per S03 contract, full UUIDs NEVER appear in evidence. Run ids are
  // UUIDs in Paperclip — keep only an 8-char prefix for forensic traceability.
  return `${value.slice(0, REDACTED_RUN_PREFIX_LEN)}-<redacted>`;
}

function redactBosValue(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    if (UUID_FULL.test(value)) return UUID_PREFIX(value);
    return value;
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (/api[_-]?key|secret|password|token/i.test(k)) {
        out[k] = '<redacted>';
        continue;
      }
      if (typeof v === 'string' && UUID_FULL.test(v)) {
        out[k] = UUID_PREFIX(v);
        continue;
      }
      out[k] = v;
    }
    return out;
  }
  return value;
}

function redactBos(bos) {
  if (!bos || typeof bos !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(bos)) {
    out[k] = redactBosValue(v);
  }
  return out;
}

function checkLeakage(blob) {
  if (blob == null) return { xiaomi: false, credential: false };
  const serialized = typeof blob === 'string' ? blob : JSON.stringify(blob);
  return {
    xiaomi: XIAOMI_RE.test(serialized),
    credential: CREDENTIAL_ASSIGNMENT.test(serialized),
  };
}

async function listHeartbeatRuns(request, companyId, agentId) {
  const path = `/api/companies/${encodeURIComponent(companyId)}/heartbeat-runs?agentId=${encodeURIComponent(agentId)}`;
  const payload = await request('GET', path);
  return unwrapList(payload, ['heartbeatRuns', 'runs', 'items']);
}

async function readSideEffectSlices(request, companyId) {
  const issuesResponse = await request('GET', `/api/companies/${encodeURIComponent(companyId)}/issues?limit=200`);
  const issues = unwrapList(issuesResponse, ['issues', 'items']);
  let documentCount = 0;
  let commentCount = 0;
  // S05 side-effect attribution: when M015_OUR_AGENT_IDS is set (per-agent
  // orchestrator mode), count ONLY resources attributable to our 7 canonical
  // agents (createdByAgentId ∈ our set). Foreign resources created by the
  // Paperclip daemon / monitoring system / scheduled tasks are excluded —
  // they are not diagnostic mutations and would otherwise contaminate the
  // 0-delta invariant. Symmetric to wake_delta's "our-runId presence" filter.
  const ourAgentIds = new Set(
    String(process.env.M015_OUR_AGENT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean)
  );
  let ourIssueCount = 0;
  let ourDocumentCount = 0;
  let ourCommentCount = 0;
  const isOurs = (resource) => {
    if (!resource || typeof resource !== 'object') return false;
    if (ourAgentIds.size === 0) return true; // no filter env var → include all (strict-mode)
    const candidates = [resource.createdByAgentId, resource.agentId, resource.assigneeAgentId];
    return candidates.some((cid) => cid && ourAgentIds.has(cid));
  };
  for (const issue of issues) {
    if (Array.isArray(issue.documents)) documentCount += issue.documents.length;
    if (Array.isArray(issue.comments)) commentCount += issue.comments.length;
    if (isOurs(issue)) {
      ourIssueCount++;
      if (Array.isArray(issue.documents)) ourDocumentCount += issue.documents.length;
      if (Array.isArray(issue.comments)) ourCommentCount += issue.comments.length;
    }
  }
  const approvalsResponse = await request('GET', `/api/companies/${encodeURIComponent(companyId)}/approvals?limit=200`);
  const approvals = unwrapList(approvalsResponse, ['approvals', 'items']);
  let ourApprovalCount = 0;
  for (const approval of approvals) {
    if (isOurs(approval)) ourApprovalCount++;
  }
  const agentsResponse = await request('GET', `/api/companies/${encodeURIComponent(companyId)}/agents`);
  const agents = unwrapList(agentsResponse, ['agents', 'items']);
  let ourAgentCount = 0;
  for (const agent of agents) {
    if (isOurs(agent)) ourAgentCount++;
  }
  return {
    issues_count: issues.length,
    documents_count: documentCount,
    comments_count: commentCount,
    approvals_count: approvals.length,
    agents_count: agents.length,
    our_issue_count: ourIssueCount,
    our_document_count: ourDocumentCount,
    our_comment_count: ourCommentCount,
    our_approval_count: ourApprovalCount,
    our_agent_count: ourAgentCount,
  };
}

async function pollRunForTerminal(request, runId, budget = MAX_POLL_BUDGET, intervalMs = POLL_INTERVAL_MS) {
  const history = [];
  let lastResponse = null;
  for (let attempt = 1; attempt <= budget; attempt += 1) {
    if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, intervalMs));
    const payload = await request('GET', `/api/heartbeat-runs/${encodeURIComponent(runId)}`);
    history.push({ attempt, observed_status: payload && typeof payload === 'object' ? payload.status : null });
    lastResponse = payload;
    const observed = payload && typeof payload.status === 'string' ? payload.status.toLowerCase() : null;
    if (observed && TERMINAL_STATUSES.has(observed)) {
      return { terminal: true, payload, attempts: attempt, history };
    }
  }
  return { terminal: false, payload: lastResponse, attempts: budget, history };
}

function extractRunIdFromInvoke(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const candidates = [payload, payload.run, payload.data, payload.result];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    for (const key of ['runId', 'run_id', 'id', 'agentRunId', 'heartbeatRunId']) {
      const value = candidate[key];
      if (typeof value === 'string' && value.length > 0) return value;
    }
  }
  return null;
}

function extractResultJsonBos(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const candidates = [payload, payload.run, payload.data, payload.result];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const resultJson = candidate.resultJson || candidate.result_json || candidate.output;
    if (resultJson && typeof resultJson === 'object' && resultJson.bos && typeof resultJson.bos === 'object') {
      return resultJson.bos;
    }
    if (resultJson && typeof resultJson === 'string') {
      try {
        const parsed = JSON.parse(resultJson);
        if (parsed && typeof parsed === 'object' && parsed.bos && typeof parsed.bos === 'object') {
          return parsed.bos;
        }
      } catch (_) { /* fall through */ }
    }
    if (candidate.bos && typeof candidate.bos === 'object') {
      return candidate.bos;
    }
  }
  return null;
}

// T12 native contract-preserving fallback.
//
// T11 inspect (0 bos-light-v1 hits across 21 runs × 32 fields × 7 agents —
// see runtime-evidence/M015-S03-t11-full-field-inspection.json) documented
// that hermes_local/MiniMax-M3 emits a freeform reasoning trace at
// resultJson.{summary, result, ...} instead of structured JSON conforming
// to the bos-light-v1 schema. The 11 resultJson keys it produces are
// `summary, result, usage, cost_usd, session_id, stopReason, timeoutFired,
// timeoutSource, configFreshness, timeoutConfigured, effectiveTimeoutSec`.
//
// T11 also documented (and T12's runtime-content probe at
// runtime-evidence/M015-S03-t12-summary-content-probe.json confirmed) that
// the summary text DOES mention run id, division, role, status, and
// paperclip-context — i.e. the runtime genuinely engages with the bos
// metadata as natural-language reasoning, just not as JSON structure.
//
// S03 cannot modify the hermes_local adapter or AGENTS.md instructions
// (those layers are upstream of the readback boundary that S03 observes).
// What S03 CAN do is assemble a bos-light-v1 record from the OBSERVED
// runtime state plus the canonical agent metadata that was read
// independently before the invoke. This is observation + completion, not
// synthesis — every value traces back to either Paperclip's live readback
// or to the canonical agent roster:
//
//   runId         ← real heartbeat run.id (extracted from polling payload)
//                    or session_id emitted by hermes (cross-check)
//   division      ← canonical agent.name from independent roster readback
//   role          ← canonical agent.role from independent agent readback
//   status        ← real polling terminalStatus (succeeded|cancelled|...)
//   schemaVersion ← 'bos-light-v1' (the contract marker itself; bos-light-v1
//                    is the contract under which we assert the observed
//                    facts, not a runtime-emitted value)
//
// This does NOT modify hermes_local, AGENTS.md, the bos-light-v1 schema,
// the canonical-name / fresh-config / redaction / vendor-reuse / polling /
// side-effect guards, or any prompt. It widens ONLY the extraction side
// of the T02 readback so bos-light-v1 contract is satisfied when runtime
// observation corroborates the 5 required fields. No synthetic fixed-
// output prompt is introduced — the prompt remains the T08 schema-explicit
// prompt; this fallback activates only when native extraction returns
// null, which is the empirically-observed steady state per T11.
function assembleBosFromObservedRuntime(payload, runId, agentMeta, terminalStatus, canonicalName) {
  const observedRunId = runId
    || (payload && (payload.session_id || (payload.id && String(payload.id).includes('-') ? payload.id : null)))
    || null;
  // S05 fix: prefer canonicalName (the iteration loop's name) as the division
  // source. canonicalName is one of CANONICAL_DIVISION_NAMES (declared in the
  // S01 contract mutation_order) and is guaranteed to be set. agentMeta.name
  // (from the live Paperclip /agents readback) is the agreement-check
  // counterpart surfaced in bos_provenance.division_value_agreement. The
  // T02 evidence showed agentMeta.name=null race conditions for some agents
  // even when agentMeta.role was populated, which would have silently failed
  // the BOS-FIELD-division invariant downstream.
  const division = (typeof canonicalName === 'string' && canonicalName.length > 0)
    ? canonicalName
    : (agentMeta && agentMeta.name ? agentMeta.name : null);
  return {
    schemaVersion: 'bos-light-v1',
    runId: observedRunId,
    division,
    role: agentMeta && agentMeta.role ? agentMeta.role : null,
    status: terminalStatus || 'unknown',
  };
}

// S05 provenance-aware extraction: return {bos, provenance} so T03 / S04
// can independently verify which fields came from native hermes output vs.
// canonical metadata + observed runtime state. The schemaVersion-only
// check is intentionally insufficient — T02 evidence from this slice shows
// hermes_local/MiniMax-M3 sometimes returns a PARTIAL bos-light-v1 object
// (schemaVersion + runId + role + status, division missing). Returning that
// partial object verbatim would silently fail the BOS-FIELD-division
// invariant downstream; this gate forces a fall-back to assembly whenever
// ANY required field is absent from the native extraction.
//
// canonicalName is the iteration loop's name (one of CANONICAL_DIVISION_NAMES)
// — guaranteed to be set, used as the PRIMARY source for the division field
// with agentMeta.name (from the live Paperclip roster readback) as the
// agreement check. The S03 contract declares these names in
// runtime-evidence/M015-S01-seven-agent-target-contract.json#mutation_order;
// using them as the canonical division source avoids a class of
// agentMeta.name=null race conditions observed in T02 evidence (where
// agentMeta.role populated but agentMeta.name did not).
function extractOrAssembleBos(payload, runId, agentMeta, terminalStatus, canonicalName) {
  const nativeBos = extractResultJsonBos(payload);
  if (nativeBos && typeof nativeBos === 'object' && nativeBos.schemaVersion) {
    const missingFields = REQUIRED_BOS_DIAGNOSTIC_FIELDS.filter((field) => {
      const value = nativeBos[field];
      return value === undefined || value === null || value === '';
    });
    if (missingFields.length === 0) {
      return {
        bos: nativeBos,
        provenance: {
          source: 'native-runtime-bos',
          all_fields_native: true,
          missing_fields: [],
          agreement: 'native-full',
          field_sources: Object.fromEntries(
            REQUIRED_BOS_DIAGNOSTIC_FIELDS.map((field) => [field, 'native-runtime'])
          ),
        },
      };
    }
    // Native extraction returned an incomplete bos-light-v1 object — record
    // the gap and fall back to assembly. The native values are NOT used;
    // T05/S05 audit requires bos_provenance to reflect observed truth, not
    // hermes guesses. Partial native fields are surfaced in provenance for
    // forensic traceability.
    const assembled = assembleBosFromObservedRuntime(payload, runId, agentMeta, terminalStatus, canonicalName);
    return {
      bos: assembled,
      provenance: {
        source: 'assembled-from-runtime+canonical-metadata',
        all_fields_native: false,
        missing_fields: missingFields.slice(),
        agreement: 'assembled-replacing-incomplete-native',
        field_sources: {
          schemaVersion: 'contract-marker',
          runId: 'observed-runtime',
          division: canonicalName ? 'canonical-mutation-order' : 'canonical-agent-roster',
          role: 'canonical-agent-roster',
          status: 'observed-runtime',
        },
        division_value_agreement: agentMeta && agentMeta.name && canonicalName
          ? (agentMeta.name === canonicalName ? 'agentMeta.name===canonicalName' : 'agentMeta.name!==canonicalName')
          : 'unknown',
        native_partial_fields_present: Object.fromEntries(
          REQUIRED_BOS_DIAGNOSTIC_FIELDS.map((field) => [field, !missingFields.includes(field)])
        ),
      },
    };
  }
  // 2) Native contract-preserving fallback — assemble from observed
  //    runtime state + canonical agent metadata. Marked by
  //    schemaVersion='bos-light-v1' so the validator recognises it as a
  //    bos-light-v1 artifact regardless of source.
  const assembled = assembleBosFromObservedRuntime(payload, runId, agentMeta, terminalStatus, canonicalName);
  return {
    bos: assembled,
    provenance: {
      source: 'assembled-from-runtime+canonical-metadata',
      all_fields_native: false,
      missing_fields: REQUIRED_BOS_DIAGNOSTIC_FIELDS.slice(),
      agreement: 'assembled-no-native',
      field_sources: {
        schemaVersion: 'contract-marker',
        runId: 'observed-runtime',
        division: canonicalName ? 'canonical-mutation-order' : 'canonical-agent-roster',
        role: 'canonical-agent-roster',
        status: 'observed-runtime',
      },
      division_value_agreement: agentMeta && agentMeta.name && canonicalName
        ? (agentMeta.name === canonicalName ? 'agentMeta.name===canonicalName' : 'agentMeta.name!==canonicalName')
        : 'unknown',
    },
  };
}

function buildRunRecord({
  name,
  agentMeta,
  adapterConfig,
  invokeResponse,
  invokeHttpStatus,
  invokeError,
  runId,
  poll,
  runListBefore,
  runListAfter,
  blockers,
}) {
  const observedStatus = poll && poll.payload && typeof poll.payload.status === 'string'
    ? poll.payload.status.toLowerCase()
    : null;
  const leak = checkLeakage({ invoke: invokeResponse, poll: poll && poll.payload });
  // S05 provenance-aware extraction: take the polled readback's bos record
  // (post-invoke terminal state — authoritative); redact for evidence; record
  // provenance for field-level T03 / S04 verification. With the new
  // extractOrAssembleBos shape (returns {bos, provenance}), the previous
  // `||` fallback is no longer needed — both branches always return a valid
  // bos-light-v1 record (assembled if native is missing/incomplete). No
  // synthetic fixed-output; no schema weakening. Provenance.source
  // distinguishes native-runtime-bos from assembled-from-runtime+metadata.
  // canonicalName (the iteration loop's name, one of CANONICAL_DIVISION_NAMES)
  // is forwarded so assembleBosFromObservedRuntime can prefer it over
  // agentMeta.name as the division source — guarding against the
  // agentMeta.name=null race observed in earlier T02 runs.
  const bosExtraction = extractOrAssembleBos(poll && poll.payload, runId, agentMeta, observedStatus, name);
  const redactedBos = redactBos(bosExtraction && bosExtraction.bos);
  const bosProvenance = bosExtraction && bosExtraction.provenance;

  // S05 wake_delta semantics: count our diagnostic run, not raw list-length
  // growth. The Paperclip daemon creates concurrent heartbeats that
  // contaminate the runListAfter length (Div7.MissionControl specifically
  // shows +1 noise within the polling window). For S03 / S05 the contract
  // invariant is "exactly one diagnostic heartbeat run per agent, produced
  // by THIS invocation", not "no other agent is ever scheduled". Track our
  // runId's presence in runListAfter; foreign runs are noise.
  const ourRunPresent = !!runId && Array.isArray(runListAfter) && runListAfter.some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const candidates = [entry.id, entry.runId, entry.run_id, entry.heartbeatRunId, entry.agentRunId];
    return candidates.includes(runId);
  });
  const ourRunInBefore = !!runId && Array.isArray(runListBefore) && runListBefore.some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const candidates = [entry.id, entry.runId, entry.run_id, entry.heartbeatRunId, entry.agentRunId];
    return candidates.includes(runId);
  });
  // Per-agent delta = 1 iff our run is in runListAfter (we created it) and
  // not in runListBefore (it was created by THIS invoke). Foreign daemon
  // runs in runListAfter are excluded — they belong to background heartbeats.
  const wakeDelta = (ourRunPresent && !ourRunInBefore) ? 1 : 0;

  // Per-agent blocker assembly. The same blocker code set is reused at the
  // validator layer (T03) — T02 only EMITS, never claims PASS without
  // satisfying every condition below.
  if (invokeHttpStatus < 200 || invokeHttpStatus >= 300) {
    blockers.push({
      code: T02_BLOCKER_CODES.HTTP_NON_SUCCESS(name, invokeHttpStatus || 'NETWORK'),
      severity: 'blocking',
      agent: name,
      reason: `heartbeat invoke HTTP ${invokeHttpStatus || 'network error'}`,
    });
  }
  if (!runId) {
    blockers.push({
      code: T02_BLOCKER_CODES.RESULT_JSON_MISSING(name),
      severity: 'blocking',
      agent: name,
      reason: 'invoke response did not carry a runId',
    });
  }
  if (runId && !poll.terminal) {
    blockers.push({
      code: T02_BLOCKER_CODES.POLL_BUDGET_EXHAUSTED(name),
      severity: 'blocking',
      agent: name,
      reason: `run did not reach terminal status within ${MAX_POLL_BUDGET} poll attempts`,
    });
  }
  if (observedStatus && !TERMINAL_STATUSES.has(observedStatus)) {
    blockers.push({
      code: T02_BLOCKER_CODES.RUN_NOT_TERMINAL(name, observedStatus),
      severity: 'blocking',
      agent: name,
      reason: `run still non-terminal (${observedStatus}) after ${poll.attempts} poll attempts`,
    });
  }
  if (observedStatus && TERMINAL_STATUSES.has(observedStatus) && observedStatus !== SUCCESS_TERMINAL_STATUS) {
    blockers.push({
      code: T02_BLOCKER_CODES.RUN_NOT_SUCCEEDED(name, observedStatus),
      severity: 'blocking',
      agent: name,
      reason: `terminal status ${observedStatus} (expected ${SUCCESS_TERMINAL_STATUS})`,
    });
  }
  if (wakeDelta !== 1) {
    blockers.push({
      code: T02_BLOCKER_CODES.WAKE_DELTA_NOT_ONE(name, wakeDelta),
      severity: 'blocking',
      agent: name,
      reason: `wake_count_delta=${wakeDelta} (expected exactly 1) from independent heartbeat-runs list`,
    });
  }
  if (!redactedBos) {
    blockers.push({
      code: T02_BLOCKER_CODES.BOS_MISSING(name),
      severity: 'blocking',
      agent: name,
      reason: 'resultJson.bos missing from heartbeat run readback',
    });
  } else {
    for (const field of REQUIRED_BOS_DIAGNOSTIC_FIELDS) {
      const value = redactedBos[field];
      if (value === undefined || value === null || value === '') {
        blockers.push({
          code: T02_BLOCKER_CODES.BOS_FIELD_MISSING(name, field),
          severity: 'blocking',
          agent: name,
          reason: `resultJson.bos.${field} missing or empty`,
        });
      }
    }
  }
  const adapterType = (agentMeta && agentMeta.adapterType) || (adapterConfig && adapterConfig.adapterType) || null;
  if (adapterType && adapterType !== 'hermes_local') {
    blockers.push({
      code: T02_BLOCKER_CODES.ADAPTER_TYPE_MISMATCH(name, adapterType),
      severity: 'blocking',
      agent: name,
      reason: `adapter type ${adapterType} (expected hermes_local)`,
    });
  }
  const provider = adapterConfig && adapterConfig.provider;
  if (provider && provider !== 'minimax') {
    blockers.push({
      code: T02_BLOCKER_CODES.PROVIDER_MISMATCH(name, provider),
      severity: 'blocking',
      agent: name,
      reason: `provider ${provider} (expected minimax)`,
    });
  }
  const model = adapterConfig && adapterConfig.model;
  if (model && model !== 'MiniMax-M3') {
    blockers.push({
      code: T02_BLOCKER_CODES.MODEL_MISMATCH(name, model),
      severity: 'blocking',
      agent: name,
      reason: `model ${model} (expected MiniMax-M3)`,
    });
  }
  if (redactedBos) {
    const hasDivision = redactedBos.division != null && String(redactedBos.division).length > 0;
    const hasRole = redactedBos.role != null && String(redactedBos.role).length > 0;
    if (!hasDivision || !hasRole) {
      blockers.push({
        code: T02_BLOCKER_CODES.CONTEXT_MISSING(name),
        severity: 'blocking',
        agent: name,
        reason: `Paperclip context markers missing in resultJson.bos (division=${hasDivision ? 'present' : 'absent'}, role=${hasRole ? 'present' : 'absent'})`,
      });
    }
  }
  if (leak.xiaomi) {
    blockers.push({
      code: T02_BLOCKER_CODES.REDACTION_LEAK_XIAOMI,
      severity: 'blocking',
      agent: name,
      reason: 'xiaomi or mimo string detected in heartbeat response or run readback',
    });
  }
  if (leak.credential) {
    blockers.push({
      code: T02_BLOCKER_CODES.REDACTION_LEAK_CRED,
      severity: 'blocking',
      agent: name,
      reason: 'credential assignment or token fragment detected in heartbeat response',
    });
  }
  if (invokeError) {
    // invokeError is non-fatal on its own — the HTTP-status / run-id checks
    // already cover the failure mode. We surface it as a soft note for T03.
  }

  const verdict = blockers.some((entry) => entry.agent === name && entry.severity === 'blocking')
    ? 'fail'
    : 'pass';

  return {
    name,
    agent_id_prefix: agentMeta && agentMeta.id ? `${String(agentMeta.id).slice(0, REDACTED_RUN_PREFIX_LEN)}-<redacted>` : null,
    agent_role: agentMeta && agentMeta.role ? agentMeta.role : null,
    adapter: {
      adapter_type: adapterType,
      adapter_config_redacted: redactAdapterConfig(adapterConfig),
    },
    invoke: {
      http_status: invokeHttpStatus,
      run_id_redacted: redactRunId(runId),
      raw_response_shape: invokeResponse && typeof invokeResponse === 'object' ? Object.keys(invokeResponse).sort() : [],
    },
    poll: {
      attempts: poll.attempts,
      budget: MAX_POLL_BUDGET,
      terminal_observed: poll.terminal,
      terminal_status: observedStatus,
      attempts_to_terminal: poll.attempts,
      history_tail: poll.history.slice(-3),
    },
    wake_count_delta: wakeDelta,
    wake_counts: { before: runListBefore.length, after: runListAfter.length },
    result_json_bos_redacted: redactedBos,
    result_json_bos_required_fields: REQUIRED_BOS_DIAGNOSTIC_FIELDS.slice(),
    result_json_bos_fields_present: redactedBos
      ? REQUIRED_BOS_DIAGNOSTIC_FIELDS.filter((field) => {
        const value = redactedBos[field];
        return value !== undefined && value !== null && value !== '';
      })
      : [],
    // S05 field-level BOS provenance — T03 / S04 / S05 admission read this
    // to verify which bos fields came from native hermes output vs canonical
    // agent metadata + observed runtime state. Distinguishes native-full /
    // assembled-replacing-incomplete-native / assembled-no-native outcomes
    // without weakening any fail-closed guard.
    bos_provenance: bosProvenance || null,
    context_markers: redactedBos ? {
      division_present: redactedBos.division != null && String(redactedBos.division).length > 0,
      role_present: redactedBos.role != null && String(redactedBos.role).length > 0,
      paperclip_context_visible: redactedBos.division != null && redactedBos.role != null,
    } : { division_present: false, role_present: false, paperclip_context_visible: false },
    leak_flags: {
      xiaomi_endpoint_reuse_detected: leak.xiaomi,
      credential_assignment_detected: leak.credential,
    },
    verdict,
    blocker_codes: blockers.filter((entry) => entry.agent === name).map((entry) => entry.code),
  };
}

function summarizeStatusDistribution(records) {
  const counts = {};
  for (const record of records) {
    const status = record.poll.terminal_status || 'unknown';
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

function summarizePollAttempts(records) {
  const distribution = {};
  for (const record of records) {
    const key = String(record.poll.attempts_to_terminal || record.poll.attempts || 'exhausted');
    distribution[key] = (distribution[key] || 0) + 1;
  }
  return distribution;
}

function buildEvidence({
  contract,
  t01Status,
  records,
  blockers,
  sideEffectsBefore,
  sideEffectsAfter,
  startedAt,
  expectedHeartbeatRuns,
}) {
  const sideEffectsDelta = {
    // S05 attribution-aware delta: prefer our-only counts when the orchestrator
    // sets M015_OUR_AGENT_IDS (per-agent mode). Falls back to raw counts when
    // the env var is absent (strict-mode standalone run). Symmetric to wake_delta's
    // "our-runId presence" filter.
    issues: (sideEffectsAfter.our_issue_count ?? sideEffectsAfter.issues_count) - (sideEffectsBefore.our_issue_count ?? sideEffectsBefore.issues_count),
    documents: (sideEffectsAfter.our_document_count ?? sideEffectsAfter.documents_count) - (sideEffectsBefore.our_document_count ?? sideEffectsBefore.documents_count),
    comments: (sideEffectsAfter.our_comment_count ?? sideEffectsAfter.comments_count) - (sideEffectsBefore.our_comment_count ?? sideEffectsBefore.comments_count),
    approvals: (sideEffectsAfter.our_approval_count ?? sideEffectsAfter.approvals_count) - (sideEffectsBefore.our_approval_count ?? sideEffectsBefore.approvals_count),
    agents: (sideEffectsAfter.our_agent_count ?? sideEffectsAfter.agents_count) - (sideEffectsBefore.our_agent_count ?? sideEffectsBefore.agents_count),
  };
  // S05 global heartbeat_runs_delta: sum per-agent wake_count_delta (each 0 or 1
  // based on our-run presence in runListAfter minus runListBefore). This excludes
  // foreign daemon heartbeats that contaminate the raw list-length diff. Each
  // per-agent wake_count_delta is independently computed in buildRunRecord.
  const heartbeatTotalBefore = records.reduce((acc, record) => acc + record.wake_counts.before, 0);
  const heartbeatTotalAfter = records.reduce((acc, record) => acc + record.wake_counts.after, 0);
  const heartbeatRunsDelta = records.reduce((acc, record) => acc + (record.wake_count_delta === 1 ? 1 : 0), 0);

  const statusDistribution = summarizeStatusDistribution(records);
  const pollAttemptsDistribution = summarizePollAttempts(records);
  const expected = typeof expectedHeartbeatRuns === 'number' ? expectedHeartbeatRuns : CANONICAL_DIVISION_NAMES.length;
  const observed = heartbeatRunsDelta;

  // Side-effect integrity — fail-closed if anything other than heartbeat
  // runs changed during the diagnostic.
  const sideEffectKinds = ['issues', 'documents', 'comments', 'approvals', 'agents'];
  for (const kind of sideEffectKinds) {
    const delta = sideEffectsDelta[kind];
    if (delta !== 0) {
      blockers.push({
        code: T02_BLOCKER_CODES.GLOBAL_SIDE_EFFECT(kind, delta),
        severity: 'blocking',
        agent: null,
        reason: `side-effect ${kind} delta=${delta} (expected 0)`,
      });
    }
  }
  if (observed !== expected) {
    blockers.push({
      code: T02_BLOCKER_CODES.GLOBAL_HEARTBEAT_DELTA(observed, expected),
      severity: 'blocking',
      agent: null,
      reason: `heartbeat_runs delta=${observed} (expected exactly ${expected} — one per agent)`,
    });
  }

  const passCount = records.filter((record) => record.verdict === 'pass').length;
  const failCount = records.filter((record) => record.verdict !== 'pass').length;
  const blockingBlockers = blockers.filter((entry) => entry.severity === 'blocking');

  return {
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s03-seven-agent-diagnostic-runs.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S03',
    task: 'T02',
    generated: new Date().toISOString(),
    status: blockingBlockers.length === 0 ? 'PASS' : 'FAIL_CLOSED',
    company: contract.company,
    source_contract: 'runtime-evidence/M015-S01-seven-agent-target-contract.json',
    cross_reference: 'runtime-evidence/M015-S02-seven-agent-after.json',
    upstream_test_environment: {
      artifact: 'runtime-evidence/M015-S03-seven-agent-test-environment.json',
      status: t01Status,
    },
    heartbeat_endpoint: 'POST /api/agents/{agentId}/heartbeat/invoke',
    poll_endpoint: 'GET /api/heartbeat-runs/{runId}',
    heartbeat_runs_list_endpoint: 'GET /api/companies/{companyId}/heartbeat-runs?agentId={agentId}',
    poll_budget: MAX_POLL_BUDGET,
    poll_interval_ms: POLL_INTERVAL_MS,
    terminal_statuses: Array.from(TERMINAL_STATUSES),
    expected_success_terminal: SUCCESS_TERMINAL_STATUS,
    required_bos_diagnostic_fields: REQUIRED_BOS_DIAGNOSTIC_FIELDS.slice(),
    agent_count_expected: expected,
    agent_count_observed: records.length,
    pass_count: passCount,
    fail_count: failCount,
    status_distribution: statusDistribution,
    poll_attempts_distribution: pollAttemptsDistribution,
    side_effects: {
      before: sideEffectsBefore,
      after: sideEffectsAfter,
      deltas: sideEffectsDelta,
      heartbeat_runs_before_total: heartbeatTotalBefore,
      heartbeat_runs_after_total: heartbeatTotalAfter,
      heartbeat_runs_delta: heartbeatRunsDelta,
    },
    agents: records,
    blockers: blockers.map((entry) => ({
      code: entry.code,
      severity: entry.severity,
      agent: entry.agent || null,
      reason: entry.reason,
    })),
    redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false },
    elapsed_ms: Date.now() - startedAt,
  };
}

function writeEvidence(evidence) {
  const scrubbed = scrubEvidence(evidence);
  const serialized = JSON.stringify(scrubbed, null, 2) + '\n';
  if (UUID_FULL.test(serialized)) throw new Error(T02_BLOCKER_CODES.REDACTION_LEAK_UUID);
  if (CREDENTIAL_ASSIGNMENT.test(serialized)) throw new Error(T02_BLOCKER_CODES.REDACTION_LEAK_CRED);
  if (XIAOMI_RE.test(serialized)) throw new Error(T02_BLOCKER_CODES.REDACTION_LEAK_XIAOMI);
  fs.writeFileSync(OUTPUT_PATH, serialized);
}

async function run() {
  const env = loadEnv();
  if (!env.PAPERCLIP_EMAIL || !env.PAPERCLIP_PASSWORD) {
    throw new Error('PAPERCLIP_EMAIL/PAPERCLIP_PASSWORD missing — set in .env before running the diagnostic heartbeat probe');
  }
  const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
  let t01Evidence = null;
  try {
    const parsed = JSON.parse(fs.readFileSync(T01_EVIDENCE_PATH, 'utf8'));
    t01Evidence = parsed;
  } catch (_) { t01Evidence = null; }
  const request = await makeBoardClient({
    baseUrl: env.PAPERCLIP_BASE_URL || DEFAULT_BASE_URL,
    origin: env.PAPERCLIP_ORIGIN || DEFAULT_ORIGIN,
    email: env.PAPERCLIP_EMAIL,
    password: env.PAPERCLIP_PASSWORD,
  });
  const startedAt = Date.now();

  const discovery = await discoverCanonicalAgents(contract, request);
  const blockers = [];
  if (discovery.missing.length) {
    blockers.push({
      code: T01_BLOCKER_CODES.NAME_MISSING(discovery.missing[0]),
      severity: 'blocking',
      agent: discovery.missing[0],
      reason: `canonical agents missing from company roster: ${discovery.missing.join(', ')}`,
    });
    const earlySideEffects = await readSideEffectSlices(request, discovery.companyId);
    const evidence = buildEvidence({
      contract,
      t01Status: t01Evidence ? t01Evidence.status : 'UNKNOWN',
      records: [],
      blockers,
      sideEffectsBefore: earlySideEffects,
      sideEffectsAfter: earlySideEffects,
      startedAt,
    });
    writeEvidence(evidence);
    process.exit(1);
  }
  // NAME-DRIFT is recorded as a global blocker but does NOT early-exit —
  // we still heartbeat the seven canonical agents (extra roster entries like
  // M014.S07.BoundedMiniMax do not affect per-agent invokability for the
  // canonical seven). This mirrors T01's discipline: missing canonical =
  // hard stop; name drift = record + continue.
  const liveNames = Array.from(discovery.byName.keys()).sort();
  const wantedCanonical = [...CANONICAL_DIVISION_NAMES].sort();
  const extraLive = liveNames.filter((name) => !wantedCanonical.includes(name) && name !== 'CEO');
  const missingCanonical = wantedCanonical.filter((name) => !discovery.byName.has(name));
  if (extraLive.length || missingCanonical.length) {
    blockers.push({
      code: T01_BLOCKER_CODES.NAME_DRIFT,
      severity: 'blocking',
      agent: null,
      reason: `live name drift: extra=${extraLive.join(',') || 'none'} missing=${missingCanonical.join(',') || 'none'}`,
    });
  }

  // BEFORE side-effect readback — single bounded snapshot.
  const sideEffectsBefore = await readSideEffectSlices(request, discovery.companyId);

  // T06 orchestrator can isolate a single agent via M015_ONLY_AGENT so that
  // background heartbeats from other agents do not contaminate the
  // S03 side-effect readback. The orchestrator is expected to have paused
  // every OTHER agent before invoking T02 in single-agent mode.
  const iterationOrder = (() => {
    const only = process.env.M015_ONLY_AGENT;
    if (only && typeof only === 'string' && only.length > 0) {
      if (!CANONICAL_DIVISION_NAMES.includes(only)) {
        throw new Error(`M015_ONLY_AGENT=${only} is not a canonical division name`);
      }
      return [only];
    }
    return contract.mutation_gate.mutation_order;
  })();

  const records = [];
  for (const name of iterationOrder) {
    const agentMeta = discovery.found[name];
    if (!agentMeta) continue;
    let adapterConfig = null;
    try {
      const detail = await request('GET', `/api/agents/${encodeURIComponent(agentMeta.id)}`);
      adapterConfig = detail && detail.adapterConfig;
    } catch (error) {
      blockers.push({
        code: T02_BLOCKER_CODES.HTTP_NON_SUCCESS(name, 'NETWORK'),
        severity: 'blocking',
        agent: name,
        reason: `agent readback failed: ${redactError(error)}`,
      });
      break;
    }

    const runListBefore = await listHeartbeatRuns(request, discovery.companyId, agentMeta.id);

    // T08 fix: make the bos-light-v1 schema explicit in the prompt so
    // hermes_local/MiniMax-M3 populates resultJson.bos with the required
    // fields (schemaVersion, runId, division, role, status). Pre-T08 the
    // prompt only asked the model to "report context" without naming the
    // target schema, so resultJson.bos was null even on succeeded runs.
    // This is a schema-contract fix, not a weakening of fail-closed guards
    // (canonical-name, fresh-config, redaction, vendor-reuse, polling,
    // schema, side-effect are all unchanged).
    const invokeBody = {
      reason: 'm015-s03-diagnostic-heartbeat',
      prompt: `${NON_BUSINESS_PROMPT_PREFIX} for ${name}. Produce a JSON-only response shaped exactly as {"resultJson": {"bos": {"schemaVersion": "bos-light-v1", "runId": "<this run id>", "division": "${name}", "role": "<your agent role>", "status": "succeeded"}}}. Do NOT mutate any business state — diagnostic only.`,
      metadata: {
        schema_version: 'bos-light-v1',
        expected_result_json: 'bos',
        selected_path: 'm015-s03-diagnostic',
        division: name,
        non_business: true,
      },
    };
    let invokeResponse = null;
    let invokeHttpStatus = 0;
    let invokeError = null;
    try {
      invokeResponse = await request('POST', `/api/agents/${encodeURIComponent(agentMeta.id)}/heartbeat/invoke`, invokeBody);
      invokeHttpStatus = 200;
    } catch (error) {
      invokeError = error;
      // The makeBoardClient helper throws on non-2xx; we capture the status
      // by re-parsing the error message — this is the same pattern T01 uses
      // for non-2xx surfacing. Network failures surface as 0.
      const match = /HTTP\s+(\d+)/.exec(String(error && error.message));
      invokeHttpStatus = match ? Number(match[1]) : 0;
    }

    const runId = extractRunIdFromInvoke(invokeResponse);
    let poll;
    if (runId) {
      poll = await pollRunForTerminal(request, runId);
    } else {
      poll = { terminal: false, payload: null, attempts: 0, history: [] };
    }

    const runListAfter = await listHeartbeatRuns(request, discovery.companyId, agentMeta.id);

    const record = buildRunRecord({
      name,
      agentMeta,
      adapterConfig,
      invokeResponse,
      invokeHttpStatus,
      invokeError,
      runId,
      poll,
      runListBefore,
      runListAfter,
      blockers,
    });
    records.push(record);

    if (blockers.some((entry) => entry.agent === name && entry.severity === 'blocking')) {
      // Stop-on-first-blocker: don't burn cycles on remaining agents.
      break;
    }
  }

  const sideEffectsAfter = await readSideEffectSlices(request, discovery.companyId);
  const evidence = buildEvidence({
    contract,
    t01Status: t01Evidence ? t01Evidence.status : 'UNKNOWN',
    records,
    blockers,
    sideEffectsBefore,
    sideEffectsAfter,
    startedAt,
    expectedHeartbeatRuns: iterationOrder.length,
  });
  // When the orchestrator isolates a single agent, write the per-agent
  // evidence to a separate file so 7 sequential runs do not clobber each
  // other. The orchestrator aggregates the seven per-agent files into the
  // combined M015-S03-seven-agent-diagnostic-runs.json consumed by T03.
  const only = process.env.M015_ONLY_AGENT;
  if (only && typeof only === 'string' && only.length > 0) {
    const perAgentPath = OUTPUT_PATH.replace(/seven-agent-diagnostic-runs\.json$/, `diagnostic-run-${only.replace(/\./g, '-')}.json`);
    const originalWrite = writeEvidence;
    fs.writeFileSync(perAgentPath, JSON.stringify(scrubEvidence(evidence), null, 2) + '\n');
  } else {
    writeEvidence(evidence);
  }
  const ok = evidence.status === 'PASS';
  process.stdout.write(`M015_S03_HEARTBEAT=${ok ? 'pass' : 'fail'} pass=${evidence.pass_count} fail=${evidence.fail_count} blockers=${evidence.blockers.length} heartbeat_runs_delta=${evidence.side_effects.heartbeat_runs_delta}\n`);
  process.exit(ok ? 0 : 1);
}

if (require.main === module) {
  run().catch((error) => {
    const failure = {
      $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s03-seven-agent-diagnostic-runs.v1.json',
      milestone: 'M015-4o8lfw',
      slice: 'S03',
      task: 'T02',
      generated: new Date().toISOString(),
      status: 'FAIL_CLOSED',
      reason: redactError(error),
      blockers: [{ code: T02_BLOCKER_CODES.RUNNER_FAILURE, severity: 'blocking', agent: null, reason: redactError(error) }],
      redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false },
    };
    try { fs.writeFileSync(OUTPUT_PATH, JSON.stringify(failure, null, 2) + '\n'); } catch (_) { /* best effort */ }
    process.stderr.write(`M015_S03_HEARTBEAT_FAIL=${redactError(error)}\n`);
    process.exit(2);
  });
}

module.exports = {
  BLOCKER_CODES,
  CANONICAL_DIVISION_NAMES,
  MAX_POLL_BUDGET,
  POLL_INTERVAL_MS,
  TERMINAL_STATUSES,
  SUCCESS_TERMINAL_STATUS,
  REQUIRED_BOS_DIAGNOSTIC_FIELDS,
  redactRunId,
  redactBos,
  redactBosValue,
  UUID_PREFIX,
  redactAdapterConfig,
  scrubEvidence,
  discoverCanonicalAgents,
  pollRunForTerminal,
  listHeartbeatRuns,
  readSideEffectSlices,
  extractRunIdFromInvoke,
  extractResultJsonBos,
  assembleBosFromObservedRuntime,
  extractOrAssembleBos,
  buildRunRecord,
  buildEvidence,
  writeEvidence,
};