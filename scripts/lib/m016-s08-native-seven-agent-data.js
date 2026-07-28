#!/usr/bin/env node
'use strict';

/**
 * scripts/lib/m016-s08-native-seven-agent-data.js
 *
 * M016-txa3vu / S08 / T01 — Frozen registry and constants for the bounded
 * native seven-agent Paperclip integration proof.
 *
 * Pure-data module: no I/O, no evaluation logic. The schema validator
 * (test_m016_s08_native_seven_agent_contract.js), the pure contract
 * evaluator (m016-s08-native-seven-agent-contract.js, T01), the S08 producer
 * (T02), the S08 independent verifier (T03), the tamper matrix (T03) and
 * the branch-aware coordinator (T04) all consume these constants so a single
 * source of truth governs:
 *
 *   1.  SCHEMA + NAMESPACE           — admission/candidate/closure/scope-
 *                                       decision/negative-fixtures/verify-
 *                                       protocol schema_ids, schema_version,
 *                                       milestone, slice
 *   2.  NAMESPACES                   — producer (M16-S08-NATIVE), validator
 *                                       (M16-S08-VERIFY), line_class tokens,
 *                                       operator gate token, verdict line
 *   3.  DIVISION_REGISTRY            — exactly-once canonical Div1..Div7
 *                                       and their expected agent identities
 *   4.  BOS_IDENTITY_EXPECTATIONS    — canonical /BOS company id; /BOSA is
 *                                       forbidden stale marker
 *   5.  BLOCKER_CODES                — producer + validator M16-S08-NATIVE-*
 *                                       and M16-S08-VERIFY-* factory functions
 *   6.  BLOCKER_NAMESPACE + REGEX    — frozen patterns the schemas enforce
 *   7.  EXIT_CODES                   — process exit codes 0..9
 *   8.  TERMINAL_STATES              — bounded allowed terminal disposition
 *                                       vocabulary for intake and agent_run
 *   9.  CLOSURE_KINDS                — discriminated closure vocabulary
 *                                       ('live' | 'scope_revised')
 *  10.  CLOSURE_VERDICT_VALUES       — only two accepted verdicts:
 *                                       PROVEN_BOUNDED_NATIVE (live branch)
 *                                       and NOT_PROVEN_SCOPE_REVISED
 *                                       (scope branch). No GO/PASS/etc.
 *  11.  BOUNDARY_VALUES              — only PREPARATION_ONLY permitted for
 *                                       scope_revised boundary
 *  12.  TIMING_LIMITS                — bounded polling budget and per-phase
 *                                       budget allocation
 *  13.  MUTATION_LEDGER_RULES        — exactly-once expected root mutation;
 *                                       zero unexpected mutations; bounded
 *                                       mutation kinds
 *  14.  REDACTION_DENYLIST           — bounded forbidden field patterns
 *                                       (raw body/reasoning/credential/PII/
 *                                       vendor/external-message/synthetic BOS)
 *  15.  SOURCE_ALLOWLIST             — fixed M015/S05 inputs the contract
 *                                       declares pre/post hashes for
 *  16.  NEGATIVE_FIXTURE_TAXONOMY    — 13+ canonical fail-closed shapes the
 *                                       tamper matrix must independently
 *                                       reproduce (each carries a stable
 *                                       M16-S08-NATIVE-*-FIXTURE id)
 *  17.  IDENTIFIER PATTERNS          — closure_id, scope_decision_id,
 *                                       candidate_id, replay_key, agent_run_id,
 *                                       admission_id, verify_protocol_id,
 *                                       fixture_id, source_ref, evidence_id
 *  18.  DEFAULTS                     — paths, scratch root, ceilings,
 *                                       operator gate token, fixed time
 */

const {
  ROLE_REGISTRY,
  DIVISION_ROLES,
  PROBE_ID_PATTERN,
  INDEPENDENCE_GROUP_PATTERN,
} = require('./m016-s03-safe-probe-data');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _safeSuffix(value) {
  const raw = String(value == null ? '' : value);
  const cleaned = raw.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!cleaned) return 'X';
  return cleaned.slice(0, 64);
}

// ---------------------------------------------------------------------------
// 1. SCHEMA + NAMESPACE
// ---------------------------------------------------------------------------

const SCHEMA_NAMESPACE = 'm016-s08-native-seven-agent-v1';

const MILESTONE = 'M016-txa3vu';
const SLICE = 'S08';
const TASK_IDS = Object.freeze(['T01', 'T02', 'T03', 'T04', 'T05']);

const ADMISSION_SCHEMA_ID = 'https://gsd.local/schemas/runtime-evidence/m016-s08-native-seven-agent-admission.v1.json';
const ADMISSION_SCHEMA_VERSION = 'v1';

const CANDIDATE_SCHEMA_ID = 'https://gsd.local/schemas/runtime-evidence/m016-s08-native-seven-agent-candidate.v1.json';
const CANDIDATE_SCHEMA_VERSION = 'v1';

const CLOSURE_SCHEMA_ID = 'https://gsd.local/schemas/runtime-evidence/m016-s08-native-seven-agent-closure.v1.json';
const CLOSURE_SCHEMA_VERSION = 'v1';

const SCOPE_DECISION_SCHEMA_ID = 'https://gsd.local/schemas/runtime-evidence/m016-s08-native-seven-agent-scope-decision.v1.json';
const SCOPE_DECISION_SCHEMA_VERSION = 'v1';

const NEGATIVE_FIXTURES_SCHEMA_ID = 'https://gsd.local/schemas/runtime-evidence/m016-s08-native-seven-agent-negative-fixtures.v1.json';
const NEGATIVE_FIXTURES_SCHEMA_VERSION = 'v1';

const VERIFY_PROTOCOL_SCHEMA_ID = 'https://gsd.local/schemas/runtime-evidence/m016-s08-native-seven-agent-verify-protocol.v1.json';
const VERIFY_PROTOCOL_SCHEMA_VERSION = 'v1';

// Stable per-artifact identity values
const ADMISSION_ID = 'm016-s08-native-seven-agent-admission-v1';
const ADMISSION_KIND = 'native-seven-agent-integration-admission';

const CANDIDATE_ID = 'm016-s08-native-seven-agent-candidate-v1';
const CANDIDATE_KIND = 'native-seven-agent-integration-candidate';

const CLOSURE_ID = 'm016-s08-native-seven-agent-closure-v1';
const CLOSURE_KIND = 'native-seven-agent-integration-closure';

const SCOPE_DECISION_ID = 'm016-s08-native-seven-agent-scope-decision-v1';
const SCOPE_DECISION_KIND = 'native-seven-agent-integration-scope-decision';

const NEGATIVE_FIXTURES_ID = 'm016-s08-native-seven-agent-negative-fixtures-v1';
const NEGATIVE_FIXTURES_KIND = 'native-seven-agent-integration-negative-fixtures';

const VERIFY_PROTOCOL_ID = 'm016-s08-native-seven-agent-verify-protocol-v1';
const VERIFY_PROTOCOL_KIND = 'native-seven-agent-integration-verify-protocol';

const PRODUCER_TASK_ID = 'T02';
const VERIFIER_TASK_ID = 'T03';
const COORDINATOR_TASK_ID = 'T04';
const CLOSURE_TASK_ID = 'T05';

// ---------------------------------------------------------------------------
// 2. NAMESPACES — frozen line classes, blocker regex patterns, gate token
// ---------------------------------------------------------------------------

const NAMESPACE = 'M16-S08-NATIVE';
const VALIDATOR_NAMESPACE = 'M16-S08-VERIFY';

const PRODUCER_LINE_CLASS = 'M16-S08-NATIVE';
const VERIFIER_LINE_CLASS = 'M16-S08-VERIFY';

const PRODUCER_CANONICAL_PROTOCOL = 'PROTOCOL-M16-S08-NATIVE-V1';
const VERIFIER_CANONICAL_PROTOCOL = 'PROTOCOL-M16-S08-VERIFY-V1';

// Canonical single-line verdict emitted by the verifier:
//   M16-S08-VERIFY verdict=<closure_kind:closure_verdict|SCOPE_REVISED>
//                 exit=<0..9>
//                 blockers=<n>
//                 divisions=<n>
//                 correlated_runs=<n>
//                 unexpected_mutations=<n>
//                 replay_key_match=<true|false>
const VERIFIER_VERDICT_LINE_PREFIX = 'M16-S08-VERIFY';

// Namespaced blocker regex patterns — schemas enforce these.
const REPLAY_BLOCKER_NAMESPACE = 'M16-S08-NATIVE';
const VERIFIER_BLOCKER_NAMESPACE = 'M16-S08-VERIFY';
const REPLAY_BLOCKER_CODE_PATTERN = '^M16-S08-NATIVE-[A-Za-z0-9._-]+$';
const VERIFIER_BLOCKER_CODE_PATTERN = '^M16-S08-VERIFY-[A-Za-z0-9._-]+$';
const FIXTURE_ID_PATTERN = '^M16-S08-NATIVE-[A-Za-z0-9._-]+-FIXTURE$';

// Operator admission gate: producer CLI MUST receive this exact flag.
const OPERATOR_GATE_TOKEN = '--confirm-native-seven-agent-replay';

// ---------------------------------------------------------------------------
// 3. DIVISION_REGISTRY — exactly-once canonical Div1..Div7 with frozen
//     role, expected agent identity label, and division short codes.
// ---------------------------------------------------------------------------

const DIVISION_SHORT_CODES = Object.freeze(['Div1', 'Div2', 'Div3', 'Div4', 'Div5', 'Div6', 'Div7']);

const DIVISION_REGISTRY = Object.freeze([
  Object.freeze({ division: 'Div1', role: 'Div1.HCO', agent_label: 'HCO', gate: 'HG1 SEMANTIC_RULE_COMPLIANCE', independence_group: 'm016-s08-div1-hco' }),
  Object.freeze({ division: 'Div2', role: 'Div2.MasterPlanner', agent_label: 'MasterPlanner', gate: 'HG2 PROVENANCE_INTEGRITY', independence_group: 'm016-s08-div2-master-planner' }),
  Object.freeze({ division: 'Div3', role: 'Div3.Treasury', agent_label: 'Treasury', gate: 'HG3 RECOVERY_EVIDENCE', independence_group: 'm016-s08-div3-treasury' }),
  Object.freeze({ division: 'Div4', role: 'Div4.Production', agent_label: 'Production', gate: 'HG4 FINANCIAL_PROTECTION', independence_group: 'm016-s08-div4-production' }),
  Object.freeze({ division: 'Div5', role: 'Div5.QualificationsLibraryLearning', agent_label: 'QualificationsLibraryLearning', gate: 'HG5 SECURITY_POSTURE', independence_group: 'm016-s08-div5-ql-learning' }),
  Object.freeze({ division: 'Div6', role: 'Div6.External', agent_label: 'External', gate: 'HG6 COMPLIANCE_POSTURE', independence_group: 'm016-s08-div6-external' }),
  Object.freeze({ division: 'Div7', role: 'Div7.MissionControl', agent_label: 'MissionControl', gate: 'HG7 READ_ONLY_BOUNDARY', independence_group: 'm016-s08-div7-mission-control' }),
]);

const DIVISION_REGISTRY_BY_ROLE = Object.freeze(
  Object.fromEntries(DIVISION_REGISTRY.map((entry) => [entry.role, entry]))
);

const DIVISION_REGISTRY_BY_DIVISION = Object.freeze(
  Object.fromEntries(DIVISION_REGISTRY.map((entry) => [entry.division, entry]))
);

const DIVISION_ROLES_S08 = Object.freeze(DIVISION_REGISTRY.map((entry) => entry.role));

const DIVISION_REGISTRY_SET = Object.freeze(new Set(DIVISION_ROLES_S08));

function isKnownS08DivisionRole(value) {
  return typeof value === 'string' && DIVISION_REGISTRY_SET.has(value);
}

function isKnownS08Division(value) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(DIVISION_REGISTRY_BY_DIVISION, value);
}

function getS08DivisionEntry(roleOrDivision) {
  if (typeof roleOrDivision !== 'string') return null;
  if (Object.prototype.hasOwnProperty.call(DIVISION_REGISTRY_BY_DIVISION, roleOrDivision)) {
    return DIVISION_REGISTRY_BY_DIVISION[roleOrDivision];
  }
  if (Object.prototype.hasOwnProperty.call(DIVISION_REGISTRY_BY_ROLE, roleOrDivision)) {
    return DIVISION_REGISTRY_BY_ROLE[roleOrDivision];
  }
  return null;
}

// ---------------------------------------------------------------------------
// 4. BOS_IDENTITY_EXPECTATIONS — canonical /BOS company id; /BOSA is the
//     forbidden stale marker; legacy-stale UUIDs are not permitted.
// ---------------------------------------------------------------------------

// Frozen canonical company identity markers. The producer MUST prove via
// fresh read-only probe that /BOS is present and /BOSA is absent at preflight.
// UUIDs are EXPECTED VALUES ONLY — the contract treats any pre-recorded UUID
// as untrusted until a fresh read-only probe re-derives it.
const BOS_CANONICAL_COMPANY_PATH = '/BOS';
const BOS_FORBIDDEN_COMPANY_PATH = '/BOSA'; // stale UUID marker

const BOS_IDENTITY_EXPECTATIONS = Object.freeze({
  required_company_paths: Object.freeze([BOS_CANONICAL_COMPANY_PATH]),
  forbidden_company_paths: Object.freeze([BOS_FORBIDDEN_COMPANY_PATH]),
  required_agent_count: 7,
  agent_label_path_pattern: '^/BOS/agents/[A-Za-z0-9._-]{2,63}$',
  stale_marker_paths: Object.freeze([BOS_FORBIDDEN_COMPANY_PATH]),
  expected_marker: 'fresh-readonly-probe-required',
});

// ---------------------------------------------------------------------------
// 5. BLOCKER_CODES — producer + validator factory functions
// ---------------------------------------------------------------------------

const BLOCKER_CODES = Object.freeze({
  // --- producer (M16-S08-NATIVE) blockers ---
  PRODUCER_OPERATOR_GATE_DENIED: () => 'M16-S08-NATIVE-OPERATOR-GATE-DENIED',
  PRODUCER_OPERATOR_GATE_DUPLICATE: () => 'M16-S08-NATIVE-OPERATOR-GATE-DUPLICATE',
  PRODUCER_OPERATOR_GATE_FROM_ENV: () => 'M16-S08-NATIVE-OPERATOR-GATE-FROM-ENV',
  PRODUCER_OPERATOR_GATE_FROM_COMMENT: () => 'M16-S08-NATIVE-OPERATOR-GATE-FROM-COMMENT',
  PRODUCER_OPERATOR_GATE_FROM_HISTORY: () => 'M16-S08-NATIVE-OPERATOR-GATE-FROM-HISTORY',
  PRODUCER_RUNTIME_HEALTH_UNAVAILABLE: () => 'M16-S08-NATIVE-RUNTIME-HEALTH-UNAVAILABLE',
  PRODUCER_RUNTIME_HEALTH_DRIFT: () => 'M16-S08-NATIVE-RUNTIME-HEALTH-DRIFT',
  PRODUCER_BOS_IDENTITY_MISSING: (path) => 'M16-S08-NATIVE-BOS-IDENTITY-MISSING-' + _safeSuffix(path),
  PRODUCER_BOSA_STALE_MARKER_PRESENT: () => 'M16-S08-NATIVE-BOSA-STALE-MARKER-PRESENT',
  PRODUCER_STALE_IDENTITY_MARKER: (marker) => 'M16-S08-NATIVE-STALE-IDENTITY-MARKER-' + _safeSuffix(marker),
  PRODUCER_AGENT_IDENTITY_MISSING: (role) => 'M16-S08-NATIVE-AGENT-IDENTITY-MISSING-' + _safeSuffix(role),
  PRODUCER_AGENT_IDENTITY_COUNT_DRIFT: (observed) => 'M16-S08-NATIVE-AGENT-IDENTITY-COUNT-DRIFT-' + _safeSuffix(String(observed)),
  PRODUCER_WRONG_RUN_OWNER: (key) => 'M16-S08-NATIVE-WRONG-RUN-OWNER-' + _safeSuffix(key),
  PRODUCER_REPLAY_KEY_MISMATCH: () => 'M16-S08-NATIVE-REPLAY-KEY-MISMATCH',
  PRODUCER_SOURCE_OUT_OF_ALLOWLIST: (ref) => 'M16-S08-NATIVE-SOURCE-OUT-OF-ALLOWLIST-' + _safeSuffix(ref),
  PRODUCER_SOURCE_FILE_MISSING: (ref) => 'M16-S08-NATIVE-SOURCE-FILE-MISSING-' + _safeSuffix(ref),
  PRODUCER_SOURCE_HASH_DRIFT: (chain) => 'M16-S08-NATIVE-SOURCE-HASH-DRIFT-' + _safeSuffix(chain),
  PRODUCER_PATH_TRAVERSAL: (path) => 'M16-S08-NATIVE-PATH-TRAVERSAL-' + _safeSuffix(path),
  PRODUCER_ADMISSION_INVALID: (field) => 'M16-S08-NATIVE-ADMISSION-INVALID-' + _safeSuffix(field),
  PRODUCER_CANDIDATE_INVALID: (field) => 'M16-S08-NATIVE-CANDIDATE-INVALID-' + _safeSuffix(field),
  PRODUCER_CANDIDATE_MALFORMED: () => 'M16-S08-NATIVE-CANDIDATE-MALFORMED',
  PRODUCER_CANDIDATE_NOT_ATOMIC: () => 'M16-S08-NATIVE-CANDIDATE-NOT-ATOMIC',
  PRODUCER_CANDIDATE_TAMPERED: () => 'M16-S08-NATIVE-CANDIDATE-TAMPERED',
  PRODUCER_RUN_GRAPH_NOT_EXACTLY_ONCE: (division) => 'M16-S08-NATIVE-RUN-GRAPH-NOT-EXACTLY-ONCE-' + _safeSuffix(division),
  PRODUCER_DIVISION_MISSING: (division) => 'M16-S08-NATIVE-DIVISION-MISSING-' + _safeSuffix(division),
  PRODUCER_DIVISION_DUPLICATE: (division) => 'M16-S08-NATIVE-DIVISION-DUPLICATE-' + _safeSuffix(division),
  PRODUCER_DIVISION_RECLASSIFIED: (division) => 'M16-S08-NATIVE-DIVISION-RECLASSIFIED-' + _safeSuffix(division),
  PRODUCER_NON_TERMINAL_READBACK: (division) => 'M16-S08-NATIVE-NON-TERMINAL-READBACK-' + _safeSuffix(division),
  PRODUCER_READBACK_MISSING: (division) => 'M16-S08-NATIVE-READBACK-MISSING-' + _safeSuffix(division),
  PRODUCER_TIMEOUT: (phase) => 'M16-S08-NATIVE-TIMEOUT-' + _safeSuffix(phase),
  PRODUCER_POLLING_BUDGET_EXCEEDED: () => 'M16-S08-NATIVE-POLLING-BUDGET-EXCEEDED',
  PRODUCER_MUTATION_EXPECTED_MISSING: () => 'M16-S08-NATIVE-MUTATION-EXPECTED-MISSING',
  PRODUCER_MUTATION_OBSERVED_MISMATCH: () => 'M16-S08-NATIVE-MUTATION-OBSERVED-MISMATCH',
  PRODUCER_MUTATION_UNEXPECTED_PRESENT: (kind) => 'M16-S08-NATIVE-MUTATION-UNEXPECTED-PRESENT-' + _safeSuffix(kind),
  PRODUCER_SECOND_INTAKE: () => 'M16-S08-NATIVE-SECOND-INTAKE',
  PRODUCER_EXTERNAL_ENDPOINT: (endpoint) => 'M16-S08-NATIVE-EXTERNAL-ENDPOINT-' + _safeSuffix(endpoint),
  PRODUCER_SUBPROCESS_FAILURE: () => 'M16-S08-NATIVE-SUBPROCESS-FAILURE',
  PRODUCER_HARNESS_NON_ZERO_EXIT: () => 'M16-S08-NATIVE-HARNESS-NON-ZERO-EXIT',
  PRODUCER_ATOMIC_WRITE_FAILED: (path) => 'M16-S08-NATIVE-ATOMIC-WRITE-FAILED-' + _safeSuffix(path),
  PRODUCER_REDACTION_LEAK: (kind) => 'M16-S08-NATIVE-REDACTION-LEAK-' + _safeSuffix(kind),
  PRODUCER_SYNTHETIC_BOS_DETECTED: () => 'M16-S08-NATIVE-SYNTHETIC-BOS-DETECTED',
  PRODUCER_BOUNDARY_INVALID: (boundary) => 'M16-S08-NATIVE-BOUNDARY-INVALID-' + _safeSuffix(boundary),
  PRODUCER_CLOSURE_KIND_MISMATCH: (kind) => 'M16-S08-NATIVE-CLOSURE-KIND-MISMATCH-' + _safeSuffix(kind),
  PRODUCER_RUNNER_FAILURE: () => 'M16-S08-NATIVE-RUNNER-FAILURE',

  // Coordinator-level gate raised when an explicit CLI output path
  // does not match the canonical runtime-evidence/M016-S08-native-…json
  // pattern. Custom locations would silently break the verify-protocol
  // schema's *-ref field regexes, so the coordinator rejects them
  // BEFORE spawning any child subprocess.
  COORDINATOR_EXPLICIT_PATH_NON_CANONICAL: (kind) => 'M16-S08-NATIVE-EXPLICIT-PATH-NON-CANONICAL-' + _safeSuffix(kind),

  // --- validator (M16-S08-VERIFY) blockers ---
  VALIDATOR_ADMISSION_NOT_FOUND: () => 'M16-S08-VERIFY-ADMISSION-NOT-FOUND',
  VALIDATOR_CANDIDATE_NOT_FOUND: () => 'M16-S08-VERIFY-CANDIDATE-NOT-FOUND',
  VALIDATOR_SCOPE_DECISION_NOT_FOUND: () => 'M16-S08-VERIFY-SCOPE-DECISION-NOT-FOUND',
  VALIDATOR_NEGATIVE_FIXTURES_NOT_FOUND: () => 'M16-S08-VERIFY-NEGATIVE-FIXTURES-NOT-FOUND',
  VALIDATOR_SCHEMAS_NOT_LOADED: (schema) => 'M16-S08-VERIFY-SCHEMAS-NOT-LOADED-' + _safeSuffix(schema),
  VALIDATOR_SCHEMA_VIOLATION: (field) => 'M16-S08-VERIFY-SCHEMA-VIOLATION-' + _safeSuffix(field),
  VALIDATOR_PRODUCER_IMPORT: () => 'M16-S08-VERIFY-PRODUCER-IMPORT',
  VALIDATOR_SOURCE_HASH_DRIFT: (chain) => 'M16-S08-VERIFY-SOURCE-HASH-DRIFT-' + _safeSuffix(chain),
  VALIDATOR_SOURCE_OUT_OF_ALLOWLIST: (ref) => 'M16-S08-VERIFY-SOURCE-OUT-OF-ALLOWLIST-' + _safeSuffix(ref),
  VALIDATOR_PATH_TRAVERSAL: (path) => 'M16-S08-VERIFY-PATH-TRAVERSAL-' + _safeSuffix(path),
  VALIDATOR_BOS_IDENTITY_MISSING: () => 'M16-S08-VERIFY-BOS-IDENTITY-MISSING',
  VALIDATOR_BOSA_STALE_MARKER_PRESENT: () => 'M16-S08-VERIFY-BOSA-STALE-MARKER-PRESENT',
  VALIDATOR_AGENT_COUNT_DRIFT: () => 'M16-S08-VERIFY-AGENT-COUNT-DRIFT',
  VALIDATOR_AGENT_IDENTITY_MISSING: (role) => 'M16-S08-VERIFY-AGENT-IDENTITY-MISSING-' + _safeSuffix(role),
  VALIDATOR_WRONG_RUN_OWNER: () => 'M16-S08-VERIFY-WRONG-RUN-OWNER',
  VALIDATOR_REPLAY_KEY_MISMATCH: () => 'M16-S08-VERIFY-REPLAY-KEY-MISMATCH',
  VALIDATOR_DIVISION_NOT_EXACTLY_ONCE: (division) => 'M16-S08-VERIFY-DIVISION-NOT-EXACTLY-ONCE-' + _safeSuffix(division),
  VALIDATOR_DIVISION_GATE_DRIFT: (division) => 'M16-S08-VERIFY-DIVISION-GATE-DRIFT-' + _safeSuffix(division),
  VALIDATOR_NON_TERMINAL_READBACK: (division) => 'M16-S08-VERIFY-NON-TERMINAL-READBACK-' + _safeSuffix(division),
  VALIDATOR_READBACK_MISSING: (division) => 'M16-S08-VERIFY-READBACK-MISSING-' + _safeSuffix(division),
  VALIDATOR_MUTATION_LEDGER_DRIFT: () => 'M16-S08-VERIFY-MUTATION-LEDGER-DRIFT',
  VALIDATOR_UNEXPECTED_MUTATION_PRESENT: () => 'M16-S08-VERIFY-UNEXPECTED-MUTATION-PRESENT',
  VALIDATOR_TIMEOUT_DETECTED: () => 'M16-S08-VERIFY-TIMEOUT-DETECTED',
  VALIDATOR_REDACTION_LEAK: (kind) => 'M16-S08-VERIFY-REDACTION-LEAK-' + _safeSuffix(kind),
  VALIDATOR_SYNTHETIC_BOS_DETECTED: () => 'M16-S08-VERIFY-SYNTHETIC-BOS-DETECTED',
  VALIDATOR_CLOSURE_KIND_INVALID: (kind) => 'M16-S08-VERIFY-CLOSURE-KIND-INVALID-' + _safeSuffix(kind),
  VALIDATOR_CLOSURE_VERDICT_INVALID: (verdict) => 'M16-S08-VERIFY-CLOSURE-VERDICT-INVALID-' + _safeSuffix(verdict),
  VALIDATOR_BOUNDARY_INVALID: (boundary) => 'M16-S08-VERIFY-BOUNDARY-INVALID-' + _safeSuffix(boundary),
  VALIDATOR_FORBIDDEN_VERDICT_PROMOTION: (verdict) => 'M16-S08-VERIFY-FORBIDDEN-VERDICT-PROMOTION-' + _safeSuffix(verdict),
  VALIDATOR_REDACTION_BOUNDS_UNLOADED: () => 'M16-S08-VERIFY-REDACTION-BOUNDS-UNLOADED',
  VALIDATOR_INDEPENDENCE_VIOLATION: () => 'M16-S08-VERIFY-INDEPENDENCE-VIOLATION',
  VALIDATOR_REPLAY_NOT_BYTE_IDENTICAL: () => 'M16-S08-VERIFY-REPLAY-NOT-BYTE-IDENTICAL',
  VALIDATOR_TAMPER_DETECTED: (tamper) => 'M16-S08-VERIFY-TAMPER-DETECTED-' + _safeSuffix(tamper),
  VALIDATOR_RUNNER_FAILURE: () => 'M16-S08-VERIFY-RUNNER-FAILURE',
  VALIDATOR_PRODUCER_AGREEMENT_FAILURE: () => 'M16-S08-VERIFY-PRODUCER-AGREEMENT-FAILURE',
  VALIDATOR_SCOPE_REVISION_NOT_REVISED: () => 'M16-S08-VERIFY-SCOPE-REVISION-NOT-REVISED',
});

const REPLAY_BLOCKER_CODE_REGEX = new RegExp(REPLAY_BLOCKER_CODE_PATTERN);
const VERIFIER_BLOCKER_CODE_REGEX = new RegExp(VERIFIER_BLOCKER_CODE_PATTERN);
const FIXTURE_ID_REGEX = new RegExp(FIXTURE_ID_PATTERN);

function isReplayBlockerCode(value) {
  return typeof value === 'string' && REPLAY_BLOCKER_CODE_REGEX.test(value);
}

function isVerifierBlockerCode(value) {
  return typeof value === 'string' && VERIFIER_BLOCKER_CODE_REGEX.test(value);
}

function isFixtureId(value) {
  return typeof value === 'string' && FIXTURE_ID_REGEX.test(value);
}

// ---------------------------------------------------------------------------
// 6. EXIT_CODES — process exit codes 0..9
// ---------------------------------------------------------------------------

const EXIT_CODES = Object.freeze({
  PASS: 0,
  REJECTED_MALFORMED: 1,
  REJECTED_FAIL_CLOSED: 2,
  CLOSURE_KIND_DRIFT: 3,
  IDENTITY_DRIFT: 4,
  REPLAY_DRIFT: 5,
  REDACTION_LEAK: 6,
  MUTATION_LEDGER_DRIFT: 7,
  PRODUCER_AGREEMENT_FAILURE: 8,
  RUNNER_FAILURE: 9,
});

// ---------------------------------------------------------------------------
// 7. TERMINAL_STATES — bounded allowed terminal disposition vocabulary
// ---------------------------------------------------------------------------

const TERMINAL_STATES = Object.freeze({
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  ABANDONED: 'ABANDONED',
});

const TERMINAL_STATES_SET = Object.freeze(new Set(Object.values(TERMINAL_STATES)));

// Non-terminal states are explicitly forbidden for any readback in a proven
// closure — the verifier rejects any record whose agent_run.status is
// RUNNING, PENDING, IN_PROGRESS, READY, etc.
const NON_TERMINAL_STATES = Object.freeze(['RUNNING', 'PENDING', 'IN_PROGRESS', 'READY', 'PAUSED', 'UNKNOWN']);

function isTerminalState(value) {
  return TERMINAL_STATES_SET.has(value);
}

function isNonTerminalState(value) {
  return typeof value === 'string' && NON_TERMINAL_STATES.indexOf(value) >= 0;
}

// ---------------------------------------------------------------------------
// 8. CLOSURE_KINDS — discriminated closure vocabulary
// ---------------------------------------------------------------------------

const CLOSURE_KINDS = Object.freeze({
  LIVE: 'live',
  SCOPE_REVISED: 'scope_revised',
});

const CLOSURE_KINDS_SET = Object.freeze(new Set(Object.values(CLOSURE_KINDS)));

function isValidClosureKind(value) {
  return CLOSURE_KINDS_SET.has(value);
}

// ---------------------------------------------------------------------------
// 9. CLOSURE_VERDICT_VALUES — only two accepted verdicts
// ---------------------------------------------------------------------------

const CLOSURE_VERDICT_VALUES = Object.freeze({
  PROVEN_BOUNDED_NATIVE: 'PROVEN_BOUNDED_NATIVE',
  NOT_PROVEN_SCOPE_REVISED: 'NOT_PROVEN_SCOPE_REVISED',
});

const CLOSURE_VERDICT_VALUES_SET = Object.freeze(new Set(Object.values(CLOSURE_VERDICT_VALUES)));

function isValidClosureVerdict(value) {
  return CLOSURE_VERDICT_VALUES_SET.has(value);
}

// Forbidden closure verdicts — any other vocabulary implies forbidden
// capability promotion.
const FORBIDDEN_CLOSURE_VERDICTS = Object.freeze([
  'GO', 'PASS', 'PASS_AUTOMATIC', 'READY', 'LAUNCH_GO', 'GO_BOUNDED_INTERNAL',
  'NO_GO', 'PREPARATION_ONLY_LIVE', 'LIVE_PROVEN', 'LIVE_GO', 'EXECUTION_PASS',
]);

function isForbiddenClosureVerdict(value) {
  return typeof value === 'string' && FORBIDDEN_CLOSURE_VERDICTS.indexOf(value) >= 0;
}

// Verdict/closure-kind coherence — PROVEN_BOUNDED_NATIVE only with closure_kind='live';
// NOT_PROVEN_SCOPE_REVISED only with closure_kind='scope_revised'.
function isCoherentClosureKind(closureKind, closureVerdict) {
  if (!isValidClosureKind(closureKind) || !isValidClosureVerdict(closureVerdict)) return false;
  if (closureKind === CLOSURE_KINDS.LIVE && closureVerdict === CLOSURE_VERDICT_VALUES.PROVEN_BOUNDED_NATIVE) return true;
  if (closureKind === CLOSURE_KINDS.SCOPE_REVISED && closureVerdict === CLOSURE_VERDICT_VALUES.NOT_PROVEN_SCOPE_REVISED) return true;
  return false;
}

// ---------------------------------------------------------------------------
// 10. BOUNDARY_VALUES — only PREPARATION_ONLY permitted for scope_revised
// ---------------------------------------------------------------------------

const BOUNDARY_VALUES = Object.freeze({
  PREPARATION_ONLY: 'PREPARATION_ONLY',
});

const BOUNDARY_VALUES_SET = Object.freeze(new Set(Object.values(BOUNDARY_VALUES)));

function isValidBoundary(value) {
  return BOUNDARY_VALUES_SET.has(value);
}

// Forbidden boundaries — NO_GO/GO/etc. are not permitted at S08 closure.
const FORBIDDEN_BOUNDARY_VALUES = Object.freeze(['NO_GO', 'GO_BOUNDED_INTERNAL', 'GO', 'EXECUTION_PASS']);

function isForbiddenBoundary(value) {
  return typeof value === 'string' && FORBIDDEN_BOUNDARY_VALUES.indexOf(value) >= 0;
}

// ---------------------------------------------------------------------------
// 11. TIMING_LIMITS — bounded polling budget and per-phase budget allocation
// ---------------------------------------------------------------------------

const TIMING_LIMITS = Object.freeze({
  // Hard ceiling on the entire bounded native replay; producer/verifier
  // reject any candidate whose bounded_duration_ms exceeds this.
  max_bounded_duration_ms: 600000, // 10 minutes
  // Per-phase bounded budgets (sum must be <= max_bounded_duration_ms).
  preflight_budget_ms: 30000, // 30s for health + identity readback
  admission_budget_ms: 5000, // 5s for admission object materialisation
  intake_budget_ms: 60000, // 60s for the single root intake
  readback_budget_ms: 300000, // 5 min bounded observer polling
  closure_budget_ms: 30000, // 30s for closure materialisation
  // Polling cadence — bounded so the observer cannot become an unbounded watch.
  polling_cadence_ms: 500,
  max_polls: 600,
  // Reference time for deterministic fixed-time verification.
  reference_time: '2026-07-20T12:00:00.000Z',
});

// Sum of phase budgets must not exceed the overall ceiling.
const TIMING_PHASE_SUM = Object.freeze(
  TIMING_LIMITS.preflight_budget_ms
  + TIMING_LIMITS.admission_budget_ms
  + TIMING_LIMITS.intake_budget_ms
  + TIMING_LIMITS.readback_budget_ms
  + TIMING_LIMITS.closure_budget_ms,
);

// ---------------------------------------------------------------------------
// 12. MUTATION_LEDGER_RULES — exactly-once expected root mutation
// ---------------------------------------------------------------------------

const MUTATION_LEDGER_RULES = Object.freeze({
  // The bounded native replay admits at most one allowlisted root mutation
  // (the single root intake); children are read-only.
  max_expected_mutation_count: 1,
  expected_mutation_kind: 'bounded_root_intake',
  expected_mutation_subject: 'paperclip_native_root_artifact',
  // Zero unexpected mutations is the only acceptance posture.
  max_unexpected_mutation_count: 0,
  // Bounded set of mutation kinds accepted in the ledger.
  allowed_mutation_kinds: Object.freeze([
    'bounded_root_intake',
    'bounded_idempotency_record',
    'bounded_recovery_record',
  ]),
  forbidden_mutation_kinds: Object.freeze([
    'rollback', 'delete', 'update_existing', 'mass_intake',
    'plugin_state_change', 'approval_state_change', 'external_send',
    'result_json_bos_injection',
  ]),
});

function isAllowedMutationKind(value) {
  return typeof value === 'string' && MUTATION_LEDGER_RULES.allowed_mutation_kinds.indexOf(value) >= 0;
}

function isForbiddenMutationKind(value) {
  return typeof value === 'string' && MUTATION_LEDGER_RULES.forbidden_mutation_kinds.indexOf(value) >= 0;
}

// ---------------------------------------------------------------------------
// 13. REDACTION_DENYLIST — bounded forbidden field patterns
// ---------------------------------------------------------------------------

const REDACTION_PATTERNS = Object.freeze([
  // raw response/result body — must be referenced only by digest
  { kind: 'raw_body', pattern: /(?:raw[_-]?body|result_json\.result|response[_-]?body)/i },
  // raw reasoning — must be referenced only by digest
  { kind: 'raw_reasoning', pattern: /(?:raw[_-]?reasoning|chain[_-]?of[_-]?thought|private[_-]?reasoning)/i },
  // credentials/tokens — never permitted in any payload
  { kind: 'credentials', pattern: /(?:api[_-]?key|access[_-]?token|bearer|password|secret[_-]?token)\s*[:=]\s*[^\s,;}]+/i },
  // full UUIDs — allowed only inside designated identity_marker fields
  { kind: 'full_uuid', pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i },
  // PII surface — email-like, phone-like, etc. The phone branch REQUIRES
  // explicit '-' or ' ' separators so it does NOT match contiguous hex
  // strings such as SHA-256 digests. Email branch is anchored on '@'.
  { kind: 'pii', pattern: /(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\+?\d{1,3}[ -]\d{2,4}[ -]\d{3,4}[ -]\d{3,4})/i },
  // vendor reuse strings
  { kind: 'vendor_reuse', pattern: /(?:xiaomi|mimo|vendor[_-]?reuse)/i },
  // external messaging surfaces
  { kind: 'external_messages', pattern: /(?:send[_-]?message|outbound[_-]?message|external[_-]?message)/i },
  // synthetic BOS — must never appear as a result_json field
  { kind: 'synthetic_bos', pattern: /result_json\.bos/i },
  // raw token value — used only as bounded identifier (e.g. admission_token),
  // never as inline credential
  { kind: 'raw_token', pattern: /(?:native[_-]?seven[_-]?agent[_-]?token|admission[_-]?token)\s*[:=]\s*[^\s,;}]{6,}/i },
]);

const REDACTION_FLAG_KEYS = Object.freeze([
  'bounded_digests_only',
  'raw_bodies_persisted',
  'redaction_bounds_loaded',
  'synthetic_bos_detected',
  'vendor_reuse_strings',
  'external_messages',
]);

const REDACTION_FLAG_VALUES = Object.freeze({
  bounded_digests_only: true,
  raw_bodies_persisted: false,
  redaction_bounds_loaded: true,
  synthetic_bos_detected: false,
  vendor_reuse_strings: false,
  external_messages: false,
});

const REDACTION_DENYLIST_KEYS = Object.freeze([
  'full_ids', 'credentials', 'raw_body', 'raw_reasoning', 'raw_result_json_result',
  'vendor_reuse_strings', 'external_messages', 'synthetic_bos', 'pii',
]);

// ---------------------------------------------------------------------------
// 13b. FORBIDDEN_KEYS / FLAG_KEYS — split of REDACTION_KEYS into two
//      leak-detection categories used by checkRedactionSafety.
//
//      FORBIDDEN_KEYS: presence of the key (with any non-undefined value)
//                      is itself a leak — these are raw token fields that
//                      must never appear in any payload.
//      FLAG_KEYS:     redaction posture flags; the value MUST match the
//                      canonical REDACTION_FLAG_VALUES entry or the posture
//                      is unsafe.
//
//      REDACTION_KEYS = FORBIDDEN_KEYS ∪ FLAG_KEYS (controls walk skipping).
// ---------------------------------------------------------------------------

const FORBIDDEN_KEYS = Object.freeze(new Set([
  'full_ids',
  'credentials',
  'xiaomi_endpoint_reuse',
  'synthetic_bos',
  'raw_reasoning',
  'raw_body',
  'raw_result_json_result',
  'pii',
]));

const FLAG_KEYS = Object.freeze(new Set([
  'bounded_digests_only',
  'raw_bodies_persisted',
  'redaction_bounds_loaded',
  'synthetic_bos_detected',
  'vendor_reuse_strings',
  'external_messages',
]));

// ---------------------------------------------------------------------------
// 14. SOURCE_ALLOWLIST — fixed M015 + S05 inputs the contract declares
//     pre/post hashes for. Only sources from this set may be referenced
//     in the candidate graph or evidence chain.
// ---------------------------------------------------------------------------

const SOURCE_ALLOWLIST = Object.freeze([
  Object.freeze({
    source_ref: 'runtime-evidence/M015-S04-native-mission-contract.json',
    kind: 'm015_native_mission_contract',
    independence_group: 'm015-s04-native-mission-contract',
    chain_role: 'm015_native_mission_contract',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M015-native-seven-division-mission-20260717.json',
    kind: 'm015_native_seven_division_mission',
    independence_group: 'm015-native-seven-division-mission',
    chain_role: 'm015_native_seven_division_mission',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-admission.json',
    kind: 's05_replay_admission',
    independence_group: 'm016-s05-replay-admission',
    chain_role: 's05_replay_admission',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-probe-run.json',
    kind: 's05_replay_probe_run',
    independence_group: 'm016-s05-replay-probe-run',
    chain_role: 's05_replay_probe_run',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-verify-protocol.json',
    kind: 's05_replay_verify_protocol',
    independence_group: 'm016-s05-replay-verify-protocol',
    chain_role: 's05_replay_verify_protocol',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-bundle.json',
    kind: 's05_replay_bundle',
    independence_group: 'm016-s05-replay-bundle',
    chain_role: 's05_replay_bundle',
    required: false,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-producer-protocol.json',
    kind: 's05_replay_producer_protocol',
    independence_group: 'm016-s05-replay-producer-protocol',
    chain_role: 's05_replay_producer_protocol',
    required: false,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-negative-fixtures.json',
    kind: 's05_replay_negative_fixtures',
    independence_group: 'm016-s05-replay-negative-fixtures',
    chain_role: 's05_replay_negative_fixtures',
    required: false,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S04-div4-div5-canary-bundle.json',
    kind: 's04_canary_bundle',
    independence_group: 'm016-s04-canary-bundle',
    chain_role: 's04_canary_bundle',
    required: false,
  }),
]);

const SOURCE_ALLOWLIST_SET = Object.freeze(new Set(SOURCE_ALLOWLIST.map((s) => s.source_ref)));

const MANDATORY_CHAIN_ROLES = Object.freeze([
  'm015_native_mission_contract',
  'm015_native_seven_division_mission',
  's05_replay_admission',
  's05_replay_probe_run',
  's05_replay_verify_protocol',
]);

const SOURCE_REF_PATTERN = '^runtime-evidence/M0(?:15|16)-(S0[0-9]|native)-[A-Za-z0-9._/-]+\\.json$';

// ---------------------------------------------------------------------------
// 15. NEGATIVE_FIXTURE_TAXONOMY — 13+ canonical fail-closed shapes the
//     tamper matrix must independently reproduce. Each carries a stable
//     fixture_id (M16-S08-NATIVE-...-FIXTURE) and a stable blocker code.
// ---------------------------------------------------------------------------

const NEGATIVE_FIXTURE_TAXONOMY = Object.freeze([
  Object.freeze({
    fixture_id: 'M16-S08-NATIVE-MISSING-CONFIRMATION-FIXTURE',
    label: 'Missing operator confirmation (no --confirm-native-seven-agent-replay)',
    blocker: () => BLOCKER_CODES.PRODUCER_OPERATOR_GATE_DENIED(),
    closure_kind_target: 'scope_revised',
    category: 'admission',
  }),
  Object.freeze({
    fixture_id: 'M16-S08-NATIVE-STALE-IDENTITY-MARKER-FIXTURE',
    label: 'Stale /BOSA identity marker present (forbidden stale UUID)',
    blocker: () => BLOCKER_CODES.PRODUCER_BOSA_STALE_MARKER_PRESENT(),
    closure_kind_target: 'scope_revised',
    category: 'identity',
  }),
  Object.freeze({
    fixture_id: 'M16-S08-NATIVE-WRONG-RUN-OWNER-FIXTURE',
    label: 'Mission / idempotency / recovery key owner does not match admission',
    blocker: () => BLOCKER_CODES.PRODUCER_WRONG_RUN_OWNER('mission_id'),
    closure_kind_target: 'scope_revised',
    category: 'correlation',
  }),
  Object.freeze({
    fixture_id: 'M16-S08-NATIVE-DUPLICATE-DIVISION-FIXTURE',
    label: 'Two agent_runs target the same DivN role (duplicate division)',
    blocker: () => BLOCKER_CODES.PRODUCER_DIVISION_DUPLICATE('Div3'),
    closure_kind_target: 'scope_revised',
    category: 'graph',
    target_division: 'Div3',
  }),
  Object.freeze({
    fixture_id: 'M16-S08-NATIVE-MISSING-READBACK-FIXTURE',
    label: 'No agent_run for one of Div1..Div7 (missing readback)',
    blocker: () => BLOCKER_CODES.PRODUCER_READBACK_MISSING('Div5'),
    closure_kind_target: 'scope_revised',
    category: 'graph',
    target_division: 'Div5',
  }),
  Object.freeze({
    fixture_id: 'M16-S08-NATIVE-NON-TERMINAL-READBACK-FIXTURE',
    label: 'Agent_run status not in {SUCCEEDED,FAILED,ABANDONED}',
    blocker: () => BLOCKER_CODES.PRODUCER_NON_TERMINAL_READBACK('Div4'),
    closure_kind_target: 'scope_revised',
    category: 'terminality',
    target_division: 'Div4',
  }),
  Object.freeze({
    fixture_id: 'M16-S08-NATIVE-SOURCE-DRIFT-FIXTURE',
    label: 'Allowlisted M015/S05 source pre_hash_sha256 != post_hash_sha256',
    blocker: () => BLOCKER_CODES.PRODUCER_SOURCE_HASH_DRIFT('m015_native_mission_contract'),
    closure_kind_target: 'scope_revised',
    category: 'provenance',
    target_chain_role: 'm015_native_mission_contract',
  }),
  Object.freeze({
    fixture_id: 'M16-S08-NATIVE-UNEXPECTED-MUTATION-FIXTURE',
    label: 'unexpected_mutation_count > 0 (extra or forbidden mutation)',
    blocker: () => BLOCKER_CODES.PRODUCER_MUTATION_UNEXPECTED_PRESENT('rollback'),
    closure_kind_target: 'scope_revised',
    category: 'mutation',
  }),
  Object.freeze({
    fixture_id: 'M16-S08-NATIVE-TIMEOUT-FIXTURE',
    label: 'Root intake or readback exceeded bounded polling budget',
    blocker: () => BLOCKER_CODES.PRODUCER_TIMEOUT('readback'),
    closure_kind_target: 'scope_revised',
    category: 'timing',
  }),
  Object.freeze({
    fixture_id: 'M16-S08-NATIVE-RAW-BODY-FIXTURE',
    label: 'Candidate payload leaks raw_body or raw_result_json_result',
    blocker: () => BLOCKER_CODES.PRODUCER_REDACTION_LEAK('raw_body'),
    closure_kind_target: 'scope_revised',
    category: 'redaction',
  }),
  Object.freeze({
    fixture_id: 'M16-S08-NATIVE-RAW-TOKEN-FIXTURE',
    label: 'Candidate payload leaks raw admission token or operator_token value',
    blocker: () => BLOCKER_CODES.PRODUCER_REDACTION_LEAK('raw_token'),
    closure_kind_target: 'scope_revised',
    category: 'redaction',
  }),
  Object.freeze({
    fixture_id: 'M16-S08-NATIVE-SYNTHETIC-BOS-FIXTURE',
    label: 'Candidate payload contains result_json.bos (synthetic BOS claim)',
    blocker: () => BLOCKER_CODES.PRODUCER_SYNTHETIC_BOS_DETECTED(),
    closure_kind_target: 'scope_revised',
    category: 'redaction',
  }),
  Object.freeze({
    fixture_id: 'M16-S08-NATIVE-BRANCH-MISMATCH-FIXTURE',
    label: 'Closure carries closure_kind=live but candidate data is scope_revised',
    blocker: () => BLOCKER_CODES.PRODUCER_CLOSURE_KIND_MISMATCH('live'),
    closure_kind_target: 'scope_revised',
    category: 'closure',
  }),
  Object.freeze({
    fixture_id: 'M16-S08-NATIVE-REPLAY-KEY-MISMATCH-FIXTURE',
    label: 'first_run_provenance_hash != second_run_provenance_hash on replay',
    blocker: () => BLOCKER_CODES.PRODUCER_REPLAY_KEY_MISMATCH(),
    closure_kind_target: 'scope_revised',
    category: 'replay',
  }),
]);

const NEGATIVE_FIXTURE_TAXONOMY_BY_ID = Object.freeze(
  Object.fromEntries(NEGATIVE_FIXTURE_TAXONOMY.map((entry) => [entry.fixture_id, entry]))
);

function isKnownFixtureId(value) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(NEGATIVE_FIXTURE_TAXONOMY_BY_ID, value);
}

function getFixtureEntry(fixtureId) {
  if (typeof fixtureId !== 'string') return null;
  return NEGATIVE_FIXTURE_TAXONOMY_BY_ID[fixtureId] || null;
}

// ---------------------------------------------------------------------------
// 15b. CANONICAL_OUTPUT_PATH_PATTERNS — frozen regex set that maps each
//      sidecar kind to its canonical runtime-evidence/M016-S08-native-…json
//      pattern. The coordinator uses this to REJECT explicit CLI output
//      paths that diverge from the canonical namespace BEFORE any child
//      subprocess is spawned. Custom locations would silently break the
//      verify-protocol schema's *_ref field regexes (which are anchored
//      on those exact patterns), so we fail closed rather than emit a
//      sidecar whose protocol ref cannot be schema-validated.
// ---------------------------------------------------------------------------

const CANONICAL_OUTPUT_PATH_KINDS = Object.freeze([
  'admission',
  'candidate',
  'closure',
  'scope_decision',
  'negative_fixtures',
  'verify_protocol',
]);

const CANONICAL_OUTPUT_PATH_PATTERNS = Object.freeze({
  admission: /^runtime-evidence\/M016-S08-native-seven-agent-admission\.json$/,
  candidate: /^runtime-evidence\/M016-S08-native-seven-agent-candidate\.json$/,
  closure: /^runtime-evidence\/M016-S08-native-seven-agent-closure\.json$/,
  scope_decision: /^runtime-evidence\/M016-S08-native-seven-agent-scope-decision\.json$/,
  negative_fixtures: /^runtime-evidence\/M016-S08-native-seven-agent-negative-fixtures\.json$/,
  verify_protocol: /^runtime-evidence\/M016-S08-native-seven-agent-verify-protocol\.json$/,
});

function isCanonicalOutputPathKind(value) {
  return typeof value === 'string' && CANONICAL_OUTPUT_PATH_KINDS.indexOf(value) >= 0;
}

function isCanonicalOutputPath(value, kind) {
  if (!isCanonicalOutputPathKind(kind)) return false;
  const re = CANONICAL_OUTPUT_PATH_PATTERNS[kind];
  if (!re) return false;
  return typeof value === 'string' && re.test(value);
}

// ---------------------------------------------------------------------------
// 16. IDENTIFIER PATTERNS
// ---------------------------------------------------------------------------

const IDENTIFIER_PATTERNS = Object.freeze({
  admission_id: '^m016-s08-native-seven-agent-admission-v1$',
  candidate_id: '^m016-s08-native-seven-agent-candidate-v1$',
  closure_id: '^m016-s08-native-seven-agent-closure-v1$',
  scope_decision_id: '^m016-s08-native-seven-agent-scope-decision-v1$',
  negative_fixtures_id: '^m016-s08-native-seven-agent-negative-fixtures-v1$',
  verify_protocol_id: '^m016-s08-native-seven-agent-verify-protocol-v1$',
  admission_id_per_run: '^m016-s08-native-seven-agent-admission-v1-[a-z0-9._-]{1,32}$',
  candidate_id_per_run: '^m016-s08-native-seven-agent-candidate-v1-[a-z0-9._-]{1,32}$',
  closure_id_per_run: '^m016-s08-native-seven-agent-closure-v1-[a-z0-9._-]{1,32}$',
  agent_run_id: '^M16-S08-NATIVE-RUN-[A-Za-z0-9._-]+-[A-Fa-f0-9]{8,16}$',
  evidence_id: '^m016-s08-native-evidence-[a-z][a-z0-9._-]{2,63}$',
  criterion_id: '^(HG[1-8] [A-Z_]+|SG[1-4] [A-Z_]+)$',
  replay_key: '^[a-f0-9]{64}$',
  sha256: '^[a-f0-9]{64}$',
  iso_timestamp: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$',
  // replay_keys shape: { first_run_provenance_hash, second_run_provenance_hash, match, byte_identical, replay_key, verified_at }
  bounded_duration_ms_max: TIMING_LIMITS.max_bounded_duration_ms,
});

// ---------------------------------------------------------------------------
// 17. DEFAULTS — paths, scratch root, ceilings, operator gate token
// ---------------------------------------------------------------------------

const DEFAULTS = Object.freeze({
  // Schema paths
  admission_schema_path: 'schemas/runtime-evidence/m016-s08-native-seven-agent-admission.v1.json',
  candidate_schema_path: 'schemas/runtime-evidence/m016-s08-native-seven-agent-candidate.v1.json',
  closure_schema_path: 'schemas/runtime-evidence/m016-s08-native-seven-agent-closure.v1.json',
  scope_decision_schema_path: 'schemas/runtime-evidence/m016-s08-native-seven-agent-scope-decision.v1.json',
  negative_fixtures_schema_path: 'schemas/runtime-evidence/m016-s08-native-seven-agent-negative-fixtures.v1.json',
  verify_protocol_schema_path: 'schemas/runtime-evidence/m016-s08-native-seven-agent-verify-protocol.v1.json',

  // Canonical sidecar paths
  admission_output: 'runtime-evidence/M016-S08-native-seven-agent-admission.json',
  candidate_output: 'runtime-evidence/M016-S08-native-seven-agent-candidate.json',
  closure_output: 'runtime-evidence/M016-S08-native-seven-agent-closure.json',
  scope_decision_output: 'runtime-evidence/M016-S08-native-seven-agent-scope-decision.json',
  negative_fixtures_output: 'runtime-evidence/M016-S08-native-seven-agent-negative-fixtures.json',
  verify_protocol_output: 'runtime-evidence/M016-S08-native-seven-agent-verify-protocol.json',
  output_dir: 'runtime-evidence',

  // Producer CLI (T02)
  producer_cli: 'scripts/execute_m016_s08_native_seven_agent_replay.js',
  // Verifier CLI (T03)
  verifier_cli: 'scripts/verify_m016_s08_native_seven_agent_integration.js',
  // Coordinator CLI (T04)
  coordinator_cli: 'scripts/finalize_m016_s08_native_seven_agent_integration.js',

  // Subprocess harness
  harness_cli: 'scripts/run_m015_s04_native_mission.js',

  // Scratch / working roots (root-confined)
  scratch_root: '/tmp/m016-s08-scratch',
  scratch_root_macos_private: '/private/tmp/m016-s08-scratch',
  scratch_root_macos_user: '/var/folders/m016-s08-scratch',

  // Bounded polling
  polling_cadence_ms: TIMING_LIMITS.polling_cadence_ms,
  max_polls: TIMING_LIMITS.max_polls,

  // Reference time
  reference_time: TIMING_LIMITS.reference_time,

  // Verify iterations
  verify_iterations: 3,

  // Identity
  admission_id: ADMISSION_ID,
  candidate_id: CANDIDATE_ID,
  closure_id: CLOSURE_ID,
  scope_decision_id: SCOPE_DECISION_ID,
  negative_fixtures_id: NEGATIVE_FIXTURES_ID,
  verify_protocol_id: VERIFY_PROTOCOL_ID,
  operator_gate_token: OPERATOR_GATE_TOKEN,

  // Bounded ceilings
  max_bounded_duration_ms: TIMING_LIMITS.max_bounded_duration_ms,
  max_total_mutations: MUTATION_LEDGER_RULES.max_expected_mutation_count,
  max_unexpected_mutations: MUTATION_LEDGER_RULES.max_unexpected_mutation_count,
  max_blocker_codes: 96,
  max_agent_runs: DIVISION_REGISTRY.length,
  max_evidence_chain_rows: SOURCE_ALLOWLIST.length,
  max_negative_fixtures: NEGATIVE_FIXTURE_TAXONOMY.length,
  max_redaction_leak_rows: 32,
  max_closure_correlation_rows: 14,
  max_verify_protocol_rows: 96,
});

// ---------------------------------------------------------------------------
// 18. RUN_GRAPH_BUDGET — exactly-once constraints for the candidate graph
// ---------------------------------------------------------------------------

const RUN_GRAPH_BUDGET = Object.freeze({
  // Exactly 7 agent_runs, one per division, no duplicates, no missing
  agent_runs_total: DIVISION_REGISTRY.length,
  agent_runs_min: DIVISION_REGISTRY.length,
  agent_runs_max: DIVISION_REGISTRY.length,
  // Exactly 1 root_intake (the bounded intake); 1+ children permitted (bounded readback)
  root_intake_min: 1,
  root_intake_max: 1,
  children_intake_min: 0,
  children_intake_max: 12, // bounded observer children
  // 1 mission root + bounded recovery/idempotency keys
  mission_min: 1,
  mission_max: 1,
  idempotency_keys_min: 1,
  idempotency_keys_max: 4,
  recovery_keys_min: 1,
  recovery_keys_max: 4,
});

// ---------------------------------------------------------------------------
// 19. CORRELATION_CONTRACT_VOCAB — agent_run_id / evidence_id / criterion_id
// ---------------------------------------------------------------------------

const CORRELATION_AGENT_RUN_ID_PATTERN = IDENTIFIER_PATTERNS.agent_run_id;
const CORRELATION_EVIDENCE_ID_PATTERN = IDENTIFIER_PATTERNS.evidence_id;
const CORRELATION_CRITERION_ID_PATTERN = IDENTIFIER_PATTERNS.criterion_id;

const CORRELATION_BUDGET = Object.freeze({
  max_probe_to_criterion_rows: 32,
  max_agent_run_to_probe_rows: 32,
  max_evidence_to_criterion_rows: 64,
  min_probe_to_criterion_rows: 7, // exactly 7 divisions
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // 1. SCHEMA + NAMESPACE
  SCHEMA_NAMESPACE,
  MILESTONE,
  SLICE,
  TASK_IDS,
  ADMISSION_SCHEMA_ID,
  ADMISSION_SCHEMA_VERSION,
  CANDIDATE_SCHEMA_ID,
  CANDIDATE_SCHEMA_VERSION,
  CLOSURE_SCHEMA_ID,
  CLOSURE_SCHEMA_VERSION,
  SCOPE_DECISION_SCHEMA_ID,
  SCOPE_DECISION_SCHEMA_VERSION,
  NEGATIVE_FIXTURES_SCHEMA_ID,
  NEGATIVE_FIXTURES_SCHEMA_VERSION,
  VERIFY_PROTOCOL_SCHEMA_ID,
  VERIFY_PROTOCOL_SCHEMA_VERSION,
  ADMISSION_ID,
  ADMISSION_KIND,
  CANDIDATE_ID,
  CANDIDATE_KIND,
  CLOSURE_ID,
  CLOSURE_KIND,
  SCOPE_DECISION_ID,
  SCOPE_DECISION_KIND,
  NEGATIVE_FIXTURES_ID,
  NEGATIVE_FIXTURES_KIND,
  VERIFY_PROTOCOL_ID,
  VERIFY_PROTOCOL_KIND,
  PRODUCER_TASK_ID,
  VERIFIER_TASK_ID,
  COORDINATOR_TASK_ID,
  CLOSURE_TASK_ID,

  // 2. NAMESPACES
  NAMESPACE,
  VALIDATOR_NAMESPACE,
  PRODUCER_LINE_CLASS,
  VERIFIER_LINE_CLASS,
  PRODUCER_CANONICAL_PROTOCOL,
  VERIFIER_CANONICAL_PROTOCOL,
  VERIFIER_VERDICT_LINE_PREFIX,
  REPLAY_BLOCKER_NAMESPACE,
  VERIFIER_BLOCKER_NAMESPACE,
  REPLAY_BLOCKER_CODE_PATTERN,
  VERIFIER_BLOCKER_CODE_PATTERN,
  FIXTURE_ID_PATTERN,
  OPERATOR_GATE_TOKEN,

  // 3. DIVISION_REGISTRY
  DIVISION_SHORT_CODES,
  DIVISION_REGISTRY,
  DIVISION_REGISTRY_BY_ROLE,
  DIVISION_REGISTRY_BY_DIVISION,
  DIVISION_ROLES_S08,
  DIVISION_REGISTRY_SET,
  isKnownS08DivisionRole,
  isKnownS08Division,
  getS08DivisionEntry,

  // 4. BOS_IDENTITY_EXPECTATIONS
  BOS_CANONICAL_COMPANY_PATH,
  BOS_FORBIDDEN_COMPANY_PATH,
  BOS_IDENTITY_EXPECTATIONS,

  // 5. BLOCKER_CODES
  BLOCKER_CODES,
  REPLAY_BLOCKER_CODE_REGEX,
  VERIFIER_BLOCKER_CODE_REGEX,
  FIXTURE_ID_REGEX,
  isReplayBlockerCode,
  isVerifierBlockerCode,
  isFixtureId,

  // 6. EXIT_CODES
  EXIT_CODES,

  // 7. TERMINAL_STATES
  TERMINAL_STATES,
  TERMINAL_STATES_SET,
  NON_TERMINAL_STATES,
  isTerminalState,
  isNonTerminalState,

  // 8. CLOSURE_KINDS
  CLOSURE_KINDS,
  CLOSURE_KINDS_SET,
  isValidClosureKind,

  // 9. CLOSURE_VERDICT_VALUES
  CLOSURE_VERDICT_VALUES,
  CLOSURE_VERDICT_VALUES_SET,
  isValidClosureVerdict,
  FORBIDDEN_CLOSURE_VERDICTS,
  isForbiddenClosureVerdict,
  isCoherentClosureKind,

  // 10. BOUNDARY_VALUES
  BOUNDARY_VALUES,
  BOUNDARY_VALUES_SET,
  isValidBoundary,
  FORBIDDEN_BOUNDARY_VALUES,
  isForbiddenBoundary,

  // 11. TIMING_LIMITS
  TIMING_LIMITS,
  TIMING_PHASE_SUM,

  // 12. MUTATION_LEDGER_RULES
  MUTATION_LEDGER_RULES,
  isAllowedMutationKind,
  isForbiddenMutationKind,

  // 13. REDACTION_DENYLIST
  REDACTION_PATTERNS,
  REDACTION_FLAG_KEYS,
  REDACTION_FLAG_VALUES,
  REDACTION_DENYLIST_KEYS,
  FORBIDDEN_KEYS,
  FLAG_KEYS,

  // 14. SOURCE_ALLOWLIST
  SOURCE_ALLOWLIST,
  SOURCE_ALLOWLIST_SET,
  MANDATORY_CHAIN_ROLES,
  SOURCE_REF_PATTERN,

  // 15. NEGATIVE_FIXTURE_TAXONOMY
  NEGATIVE_FIXTURE_TAXONOMY,
  NEGATIVE_FIXTURE_TAXONOMY_BY_ID,
  isKnownFixtureId,
  getFixtureEntry,

  // 15b. CANONICAL_OUTPUT_PATH_PATTERNS — schema-safety gate
  CANONICAL_OUTPUT_PATH_KINDS,
  CANONICAL_OUTPUT_PATH_PATTERNS,
  isCanonicalOutputPathKind,
  isCanonicalOutputPath,

  // 16. IDENTIFIER PATTERNS
  IDENTIFIER_PATTERNS,
  CORRELATION_AGENT_RUN_ID_PATTERN,
  CORRELATION_EVIDENCE_ID_PATTERN,
  CORRELATION_CRITERION_ID_PATTERN,
  CORRELATION_BUDGET,

  // 17. DEFAULTS
  DEFAULTS,

  // 18. RUN_GRAPH_BUDGET
  RUN_GRAPH_BUDGET,

  // Re-exports from S03 safe-probe-data (frozen role/gate vocabularies)
  ROLE_REGISTRY,
  DIVISION_ROLES,
  PROBE_ID_PATTERN,
  INDEPENDENCE_GROUP_PATTERN,

  // helpers
  _safeSuffix,
};