#!/usr/bin/env node
'use strict';

/**
 * scripts/lib/m016-s05-seven-division-replay-data.js
 *
 * M016-txa3vu / S05 / T01 — Frozen registry and constants for the seven
 * division evidence replay bundle. Pure-data module: no I/O, no evaluation
 * logic. The schema validator (test_m016_s05_seven_division_replay_schema.js),
 * the pure contract evaluator
 * (m016-s05-seven-division-replay-contract.js, T01), the S05 producer
 * (produce_m016_s05_seven_division_replay.js, T02), the S05 independent
 * verifier (verify_m016_s05_seven_division_replay.js, T03), and the tamper
 * matrix (T05) all consume these constants so a single source of truth
 * governs:
 *
 *   1.  SCHEMA + NAMESPACE           — admission/bundle/worksheet/producer/
 *                                       verify schema_ids, schema_version,
 *                                       milestone, slice
 *   2.  NAMESPACES                   — producer (M16-S05-REPLAY), validator
 *                                       (M16-S05-VERIFY), line_class tokens,
 *                                       operator gate token
 *   3.  REPLAY_GATE_IDS              — SG1..SG4 with explicit coverage labels
 *   4.  BLOCKER_CODES                — producer + validator M16-S05-REPLAY-*
 *                                       and M16-S05-VERIFY-* factory functions
 *   5.  BLOCKER_NAMESPACE + REGEX    — frozen patterns the schemas enforce
 *   6.  EXIT_CODES                   — process exit codes 0..8
 *   7.  REPLAY_KINDS                 — record kinds accepted in the bundle
 *                                       (live_replay_record / drill_replay_record)
 *   8.  VERDICT_VALUES               — three-dimension verdict vocabulary:
 *                                       orchestration/evidence (PASS|PARTIAL|NOT_PROVEN)
 *                                       and launch (GO_BOUNDED_INTERNAL|PREPARATION_ONLY|NO_GO)
 *   9.  SCORING_WEIGHTS              — bounded worksheet weights for the
 *                                       three weighted steps
 *  10.  CORRELATION_CONTRACT_VOCAB   — agent_run_id, probe_id, evidence_id,
 *                                       criterion_id namespaces and helpers
 *  11.  SOURCE_ALLOWLIST             — fixed S01..S04 inputs the bundle
 *                                       declares pre/post hashes for
 *  12.  RECORDS_BUDGET               — 16 role records + 3 drill records = 19
 *  13.  DEFAULTS                     — paths, scratch root, ceilings,
 *                                       operator gate token
 *  14.  REDACTION_FLAG_VALUES        — re-exported bounded redaction posture
 *  15.  Identifier patterns          — PROBE_ID_PATTERN, INDEPENDENCE_GROUP,
 *                                       BUNDLE_ID, SOURCE_REF
 */

const {
  REDACTION_FLAG_VALUES,
  HARD_GATE_IDS,
  HARD_GATE_LABELS,
  HARD_GATE_IDS_SET,
  ROLE_REGISTRY,
  INDEPENDENCE_GROUPS_SET,
  PROBE_ID_PATTERN,
  INDEPENDENCE_GROUP_PATTERN,
  SCRATCH_DRILL_KINDS,
  SCRATCH_DRILL_KINDS_SET,
  isKnownDrillKind,
  isKnownRole,
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

const SCHEMA_ID = 'https://gsd.local/schemas/runtime-evidence/m016-s05-seven-division-replay-bundle.v1.json';
const SCHEMA_VERSION = 'v1';

const ADMISSION_SCHEMA_ID = 'https://gsd.local/schemas/runtime-evidence/m016-s05-seven-division-replay-admission.v1.json';
const ADMISSION_SCHEMA_VERSION = 'v1';
const WORKSHEET_SCHEMA_ID = 'https://gsd.local/schemas/runtime-evidence/m016-s05-seven-division-replay-scoring-worksheet.v1.json';
const WORKSHEET_SCHEMA_VERSION = 'v1';
const PRODUCER_PROTOCOL_SCHEMA_ID = 'https://gsd.local/schemas/runtime-evidence/m016-s05-seven-division-replay-producer-protocol.v1.json';
const PRODUCER_PROTOCOL_SCHEMA_VERSION = 'v1';
const VERIFY_PROTOCOL_SCHEMA_ID = 'https://gsd.local/schemas/runtime-evidence/m016-s05-seven-division-replay-verify-protocol.v1.json';
const VERIFY_PROTOCOL_SCHEMA_VERSION = 'v1';

const MILESTONE = 'M016-txa3vu';
const SLICE = 'S05';
const TASK_IDS = Object.freeze(['T01', 'T02', 'T03', 'T04', 'T05']);
const SCHEMA_NAMESPACE = 'm016-s05-seven-division-replay-bundle-v1';

const BUNDLE_ID = 'm016-s05-seven-division-replay-bundle-v1';
const BUNDLE_KIND = 'seven-division-evidence-replay-bundle';

const ADMISSION_ID = 'm016-s05-seven-division-replay-admission-v1';
const ADMISSION_KIND = 'seven-division-evidence-replay-admission';

const WORKSHEET_ID = 'm016-s05-seven-division-replay-scoring-worksheet-v1';
const WORKSHEET_KIND = 'seven-division-evidence-replay-scoring-worksheet';

const PRODUCER_PROTOCOL_ID = 'm016-s05-seven-division-replay-producer-protocol-v1';
const PRODUCER_PROTOCOL_KIND = 'seven-division-evidence-replay-producer-protocol';

const VERIFY_PROTOCOL_ID = 'm016-s05-seven-division-replay-verify-protocol-v1';
const VERIFY_PROTOCOL_KIND = 'seven-division-evidence-replay-verify-protocol';

const PRODUCER_TASK_ID = 'T02';
const VERIFIER_TASK_ID = 'T03';

// ---------------------------------------------------------------------------
// 2. NAMESPACES
// ---------------------------------------------------------------------------

const NAMESPACE = 'M16-S05-REPLAY';
const VALIDATOR_NAMESPACE = 'M16-S05-VERIFY';

const PRODUCER_LINE_CLASS = 'M16-S05-REPLAY';
const VERIFIER_LINE_CLASS = 'M16-S05-VERIFY';

const PRODUCER_CANONICAL_PROTOCOL = 'PROTOCOL-M16-S05-REPLAY-V1';
const VERIFIER_CANONICAL_PROTOCOL = 'PROTOCOL-M16-S05-VERIFY-V1';

const REPLAY_BLOCKER_NAMESPACE = 'M16-S05-REPLAY';
const VERIFIER_BLOCKER_NAMESPACE = 'M16-S05-VERIFY';

const REPLAY_BLOCKER_CODE_PATTERN = '^M16-S05-REPLAY-[A-Za-z0-9._-]+$';
const VERIFIER_BLOCKER_CODE_PATTERN = '^M16-S05-VERIFY-[A-Za-z0-9._-]+$';

const EVIDENCE_ID_PREFIX = 'm016-s05-replay-evidence-';
const AGENT_RUN_ID_PREFIX = 'M16-S05-REPLAY-RUN-';
const CORRELATION_PROBE_ID_PREFIX = 'M16-S03-PROBE-';

// Operator admission gate: producer CLI MUST receive this exact flag.
const OPERATOR_GATE_TOKEN = '--confirm-operator-gate';

// ---------------------------------------------------------------------------
// 3. REPLAY_GATE_IDS — SG1..SG4 with explicit coverage labels
// ---------------------------------------------------------------------------

const REPLAY_GATE_IDS = Object.freeze([
  'SG1 SEVEN_DIVISION_COVERAGE',
  'SG2 LAUNCH_VERDICT_FROZEN',
  'SG3 PRODUCER_PROVENANCE_OK',
  'SG4 VERIFIER_INDEPENDENCE',
]);

const REPLAY_GATE_LABELS = Object.freeze({
  'SG1 SEVEN_DIVISION_COVERAGE': 'bundle carries exactly 19 S03 records covering Div1..Div7 plus 9 infrastructure roles and 3 drill kinds with no reclassification',
  'SG2 LAUNCH_VERDICT_FROZEN': 'embedded_classification.verdicts carries bounded orchestration/evidence (PASS|PARTIAL|NOT_PROVEN) and launch (GO_BOUNDED_INTERNAL|PREPARATION_ONLY|NO_GO) vocabulary without forbidden canary tokens',
  'SG3 PRODUCER_PROVENANCE_OK': 'evidence_chain rows pre_hash_sha256 == post_hash_sha256 for s02_baseline, s03_pack, s04_canary_bundle, replay_probe_run; raw_input_immutability_verified=true',
  'SG4 VERIFIER_INDEPENDENCE': 'fresh verifier does not import producer CLI; uses only data + contract + read-only upstream S03/S04 loaders; produces >= 3 bounded replay iterations with byte-identical verifier verdict lines',
});

const REPLAY_GATE_IDS_SET = Object.freeze(new Set(REPLAY_GATE_IDS));

function isKnownReplayGate(value) {
  return REPLAY_GATE_IDS_SET.has(value);
}

// ---------------------------------------------------------------------------
// 4. BLOCKER_CODES — producer + validator factory functions
// ---------------------------------------------------------------------------

const BLOCKER_CODES = Object.freeze({
  // --- producer (M16-S05-REPLAY) blockers ---
  PRODUCER_RUNNER_FAILURE: () => 'M16-S05-REPLAY-RUNNER-FAILURE',
  PRODUCER_OPERATOR_GATE_DENIED: () => 'M16-S05-REPLAY-OPERATOR-GATE-DENIED',
  PRODUCER_BUNDLE_INVALID: (kind) => 'M16-S05-REPLAY-BUNDLE-INVALID-' + _safeSuffix(kind),
  PRODUCER_BUNDLE_MALFORMED: () => 'M16-S05-REPLAY-BUNDLE-MALFORMED',
  PRODUCER_RECORDS_NOT_NINETEEN: (observed) => 'M16-S05-REPLAY-RECORDS-NOT-NINETEEN-' + _safeSuffix(String(observed)),
  PRODUCER_DIVISION_COVERAGE_MISSING: (division) => 'M16-S05-REPLAY-DIVISION-COVERAGE-MISSING-' + _safeSuffix(division),
  PRODUCER_RECORD_RECLASSIFIED: (role) => 'M16-S05-REPLAY-RECORD-RECLASSIFIED-' + _safeSuffix(role),
  PRODUCER_SOURCE_OUT_OF_ALLOWLIST: (ref) => 'M16-S05-REPLAY-SOURCE-OUT-OF-ALLOWLIST-' + _safeSuffix(ref),
  PRODUCER_SOURCE_FILE_MISSING: (ref) => 'M16-S05-REPLAY-SOURCE-FILE-MISSING-' + _safeSuffix(ref),
  PRODUCER_SOURCE_MALFORMED_JSON: (ref) => 'M16-S05-REPLAY-SOURCE-MALFORMED-JSON-' + _safeSuffix(ref),
  PRODUCER_S02_BASELINE_MUTATED: () => 'M16-S05-REPLAY-S02-BASELINE-MUTATED',
  PRODUCER_S02_BASELINE_MISSING: () => 'M16-S05-REPLAY-S02-BASELINE-MISSING',
  PRODUCER_S03_PACK_MUTATED: () => 'M16-S05-REPLAY-S03-PACK-MUTATED',
  PRODUCER_S03_PACK_MISSING: () => 'M16-S05-REPLAY-S03-PACK-MISSING',
  PRODUCER_S04_CANARY_BUNDLE_MISSING: () => 'M16-S05-REPLAY-S04-CANARY-BUNDLE-MISSING',
  PRODUCER_S04_CANARY_BUNDLE_NOT_PASS: () => 'M16-S05-REPLAY-S04-CANARY-BUNDLE-NOT-PASS',
  PRODUCER_S04_VERIFY_NOT_PASS: () => 'M16-S05-REPLAY-S04-VERIFY-NOT-PASS',
  PRODUCER_ROLE_NOT_IN_REGISTRY: (role) => 'M16-S05-REPLAY-ROLE-NOT-IN-REGISTRY-' + _safeSuffix(role),
  PRODUCER_DRILL_NOT_IN_REGISTRY: (kind) => 'M16-S05-REPLAY-DRILL-NOT-IN-REGISTRY-' + _safeSuffix(kind),
  PRODUCER_GATE_WEIGHT_INVALID: (gate) => 'M16-S05-REPLAY-GATE-WEIGHT-INVALID-' + _safeSuffix(gate),
  PRODUCER_GATE_WEIGHT_SUM_INVALID: () => 'M16-S05-REPLAY-GATE-WEIGHT-SUM-INVALID',
  PRODUCER_CONTRIBUTION_OUT_OF_RANGE: (gate) => 'M16-S05-REPLAY-CONTRIBUTION-OUT-OF-RANGE-' + _safeSuffix(gate),
  PRODUCER_SCORE_OUT_OF_RANGE: (score) => 'M16-S05-REPLAY-SCORE-OUT-OF-RANGE-' + _safeSuffix(String(score)),
  PRODUCER_LAUNCH_PROMOTION_INVALID: (verdict) => 'M16-S05-REPLAY-LAUNCH-PROMOTION-INVALID-' + _safeSuffix(verdict),
  PRODUCER_REPLAY_NOT_BYTE_IDENTICAL: () => 'M16-S05-REPLAY-REPLAY-NOT-BYTE-IDENTICAL',
  PRODUCER_REDACTION_LEAK: (kind) => 'M16-S05-REPLAY-REDACTION-LEAK-' + _safeSuffix(kind),
  PRODUCER_CORRELATION_BROKEN: (field) => 'M16-S05-REPLAY-CORRELATION-BROKEN-' + _safeSuffix(field),
  PRODUCER_EVIDENCE_CHAIN_BROKEN: (chain) => 'M16-S05-REPLAY-EVIDENCE-CHAIN-BROKEN-' + _safeSuffix(chain),
  PRODUCER_INDEPENDENCE_GROUP_REUSED: (group) => 'M16-S05-REPLAY-INDEPENDENCE-GROUP-REUSED-' + _safeSuffix(group),
  PRODUCER_OUTPUT_PATH_OUT_OF_TMP: (path) => 'M16-S05-REPLAY-OUTPUT-PATH-OUT-OF-TMP-' + _safeSuffix(path),
  PRODUCER_ATOMIC_WRITE_FAILED: (path) => 'M16-S05-REPLAY-ATOMIC-WRITE-FAILED-' + _safeSuffix(path),
  PRODUCER_FORBIDDEN_CANARY_VERDICT: (verdict) => 'M16-S05-REPLAY-FORBIDDEN-CANARY-VERDICT-' + _safeSuffix(verdict),
  PRODUCER_SCHEDULE_DUPLICATE: (key) => 'M16-S05-REPLAY-SCHEDULE-DUPLICATE-' + _safeSuffix(key),

  // --- validator (M16-S05-VERIFY) blockers ---
  VALIDATOR_BUNDLE_NOT_FOUND: (path) => 'M16-S05-VERIFY-BUNDLE-NOT-FOUND-' + _safeSuffix(path),
  VALIDATOR_BUNDLE_NOT_BYTE_IDENTICAL: () => 'M16-S05-VERIFY-BUNDLE-NOT-BYTE-IDENTICAL',
  VALIDATOR_SCHEMA_VIOLATION: (field) => 'M16-S05-VERIFY-SCHEMA-VIOLATION-' + _safeSuffix(field),
  VALIDATOR_EVIDENCE_CHAIN_BROKEN: (chain) => 'M16-S05-VERIFY-EVIDENCE-CHAIN-BROKEN-' + _safeSuffix(chain),
  VALIDATOR_S02_HASH_DRIFT: (expected, actual) => 'M16-S05-VERIFY-S02-HASH-DRIFT-' + _safeSuffix(expected) + '-' + _safeSuffix(actual),
  VALIDATOR_S03_HASH_DRIFT: (expected, actual) => 'M16-S05-VERIFY-S03-HASH-DRIFT-' + _safeSuffix(expected) + '-' + _safeSuffix(actual),
  VALIDATOR_S04_CANARY_HASH_DRIFT: (expected, actual) => 'M16-S05-VERIFY-S04-CANARY-HASH-DRIFT-' + _safeSuffix(expected) + '-' + _safeSuffix(actual),
  VALIDATOR_REPLAY_PROBE_RUN_DRIFT: (expected, actual) => 'M16-S05-VERIFY-REPLAY-PROBE-RUN-DRIFT-' + _safeSuffix(expected) + '-' + _safeSuffix(actual),
  VALIDATOR_CORRELATION_DUPLICATE: (kind, value) => 'M16-S05-VERIFY-CORRELATION-DUPLICATE-' + _safeSuffix(kind) + '-' + _safeSuffix(value),
  VALIDATOR_CORRELATION_CRITERION_UNKNOWN: (criterion) => 'M16-S05-VERIFY-CORRELATION-CRITERION-UNKNOWN-' + _safeSuffix(criterion),
  VALIDATOR_CORRELATION_AGENT_RUN_MISSING: () => 'M16-S05-VERIFY-CORRELATION-AGENT-RUN-MISSING',
  VALIDATOR_CORRELATION_PROBE_NOT_IN_S03: (probe) => 'M16-S05-VERIFY-CORRELATION-PROBE-NOT-IN-S03-' + _safeSuffix(probe),
  VALIDATOR_CORRELATION_INDEPENDENCE_GROUP_UNKNOWN: (group) => 'M16-S05-VERIFY-CORRELATION-INDEPENDENCE-GROUP-UNKNOWN-' + _safeSuffix(group),
  VALIDATOR_COVERAGE_NOT_NINETEEN: (observed) => 'M16-S05-VERIFY-COVERAGE-NOT-NINETEEN-' + _safeSuffix(String(observed)),
  VALIDATOR_DIVISION_MISSING: (division) => 'M16-S05-VERIFY-DIVISION-MISSING-' + _safeSuffix(division),
  VALIDATOR_GATE_DERIVATION_DRIFT: (gate) => 'M16-S05-VERIFY-GATE-DERIVATION-DRIFT-' + _safeSuffix(gate),
  VALIDATOR_LAUNCH_PROMOTION_DETECTED: (verdict) => 'M16-S05-VERIFY-LAUNCH-PROMOTION-DETECTED-' + _safeSuffix(verdict),
  VALIDATOR_VERDICT_VOCAB_INVALID: (verdict) => 'M16-S05-VERIFY-VERDICT-VOCAB-INVALID-' + _safeSuffix(verdict),
  VALIDATOR_REDACTION_LEAK: (kind) => 'M16-S05-VERIFY-REDACTION-LEAK-' + _safeSuffix(kind),
  VALIDATOR_REPLAY_DRIFT: () => 'M16-S05-VERIFY-REPLAY-DRIFT',
  VALIDATOR_REDACTION_BOUNDS_UNLOADED: () => 'M16-S05-VERIFY-REDACTION-BOUNDS-UNLOADED',
  VALIDATOR_INDEPENDENCE_VIOLATION: () => 'M16-S05-VERIFY-INDEPENDENCE-VIOLATION',
  VALIDATOR_PATH_TRAVERSAL: (path) => 'M16-S05-VERIFY-PATH-TRAVERSAL-' + _safeSuffix(path),
  VALIDATOR_RUNNER_FAILURE: () => 'M16-S05-VERIFY-RUNNER-FAILURE',
});

const REPLAY_BLOCKER_CODE_REGEX = new RegExp(REPLAY_BLOCKER_CODE_PATTERN);
const VERIFIER_BLOCKER_CODE_REGEX = new RegExp(VERIFIER_BLOCKER_CODE_PATTERN);

function isReplayBlockerCode(value) {
  return typeof value === 'string' && REPLAY_BLOCKER_CODE_REGEX.test(value);
}

function isVerifierBlockerCode(value) {
  return typeof value === 'string' && VERIFIER_BLOCKER_CODE_REGEX.test(value);
}

// ---------------------------------------------------------------------------
// 6. EXIT_CODES — process exit codes 0..8
// ---------------------------------------------------------------------------

const EXIT_CODES = Object.freeze({
  REPLAY_PASS: 0,
  REPLAY_REJECTED_MALFORMED: 1,
  REPLAY_REJECTED_FAIL_CLOSED: 2,
  REPLAY_CLASSIFICATION_DRIFT: 3,
  REPLAY_LAUNCH_PROMOTION: 4,
  REPLAY_PROVENANCE_DRIFT: 5,
  REPLAY_REDACTION_LEAK: 6,
  REPLAY_REPLAY_DRIFT: 7,
  REPLAY_RUNNER_FAILURE: 8,
});

// ---------------------------------------------------------------------------
// 7. REPLAY_KINDS — record kinds accepted in the bundle
// ---------------------------------------------------------------------------

const REPLAY_KINDS = Object.freeze({
  LIVE_REPLAY_RECORD: 'live_replay_record',
  DRILL_REPLAY_RECORD: 'drill_replay_record',
});
const REPLAY_KINDS_SET = Object.freeze(new Set(Object.values(REPLAY_KINDS)));

function isValidReplayKind(value) {
  return REPLAY_KINDS_SET.has(value);
}

// ---------------------------------------------------------------------------
// 8. VERDICT_VALUES — three-dimension verdict vocabulary
// ---------------------------------------------------------------------------

const VERDICT_VALUES = Object.freeze({
  // Orchestration + Evidence
  PASS: 'PASS',
  PARTIAL: 'PARTIAL',
  NOT_PROVEN: 'NOT_PROVEN',
  // Launch
  GO_BOUNDED_INTERNAL: 'GO_BOUNDED_INTERNAL',
  PREPARATION_ONLY: 'PREPARATION_ONLY',
  NO_GO: 'NO_GO',
});

const VERDICT_VALUES_SET = Object.freeze(new Set(Object.values(VERDICT_VALUES)));

const ORCHESTRATION_VERDICTS = Object.freeze(['PASS', 'PARTIAL', 'NOT_PROVEN']);
const EVIDENCE_VERDICTS = Object.freeze(['PASS', 'PARTIAL', 'NOT_PROVEN']);
const LAUNCH_VERDICTS = Object.freeze(['GO_BOUNDED_INTERNAL', 'PREPARATION_ONLY', 'NO_GO']);

function isValidVerdict(value) {
  return VERDICT_VALUES_SET.has(value);
}

function isValidOrchestrationVerdict(value) {
  return ORCHESTRATION_VERDICTS.indexOf(value) >= 0;
}

function isValidEvidenceVerdict(value) {
  return EVIDENCE_VERDICTS.indexOf(value) >= 0;
}

function isValidLaunchVerdict(value) {
  return LAUNCH_VERDICTS.indexOf(value) >= 0;
}

// Forbidden at the replay layer — canary-only tokens must not appear.
const FORBIDDEN_REPLAY_VERDICTS = Object.freeze(['GO', 'PASS_AUTOMATIC', 'READY', 'LAUNCH_GO']);
function isForbiddenReplayVerdict(value) {
  return typeof value === 'string' && FORBIDDEN_REPLAY_VERDICTS.indexOf(value) >= 0;
}

// ---------------------------------------------------------------------------
// 9. SCORING_WEIGHTS — bounded worksheet weights for the three weighted steps
// ---------------------------------------------------------------------------

// Sum of all three weights MUST equal exactly 1.0; verifier rejects drift.
const SCORING_WEIGHTS = Object.freeze({
  step_orchestration: 0.34,
  step_evidence: 0.33,
  step_launch: 0.33,
});

const SCORING_WEIGHT_SUM = Object.freeze(
  SCORING_WEIGHTS.step_orchestration + SCORING_WEIGHTS.step_evidence + SCORING_WEIGHTS.step_launch,
);

// Per-step numeric_mapping template (frozen). Each step's numeric_mapping
// is filled by the contract from observed record/gate counters.
const WORKSHEET_NUMERIC_MAPPING_SCHEMA = Object.freeze({
  step_orchestration: Object.freeze({
    required: Object.freeze(['live_executed', 'live_not_proven', 'drill_executed', 'validator_replay_match']),
    bounds: Object.freeze({
      live_executed: Object.freeze({ min: 0, max: 16 }),
      live_not_proven: Object.freeze({ min: 0, max: 16 }),
      drill_executed: Object.freeze({ min: 0, max: 3 }),
      validator_replay_match: Object.freeze({ values: Object.freeze([0, 1]) }),
    }),
  }),
  step_evidence: Object.freeze({
    required: Object.freeze(['s02_unchanged', 's03_unchanged', 's04_unchanged', 'replay_probe_run_unchanged', 'correlation_unique', 'redaction_safe']),
    bounds: Object.freeze({
      s02_unchanged: Object.freeze({ values: Object.freeze([0, 1]) }),
      s03_unchanged: Object.freeze({ values: Object.freeze([0, 1]) }),
      s04_unchanged: Object.freeze({ values: Object.freeze([0, 1]) }),
      replay_probe_run_unchanged: Object.freeze({ values: Object.freeze([0, 1]) }),
      correlation_unique: Object.freeze({ values: Object.freeze([0, 1]) }),
      redaction_safe: Object.freeze({ values: Object.freeze([0, 1]) }),
    }),
  }),
  step_launch: Object.freeze({
    required: Object.freeze(['launch_verdict', 'replay_byte_identical']),
    bounds: Object.freeze({
      launch_verdict: Object.freeze({ values: Object.freeze(['GO_BOUNDED_INTERNAL', 'PREPARATION_ONLY', 'NO_GO']) }),
      replay_byte_identical: Object.freeze({ values: Object.freeze([0, 1]) }),
    }),
  }),
});

// ---------------------------------------------------------------------------
// 10. CORRELATION_CONTRACT_VOCAB
// ---------------------------------------------------------------------------

const CORRELATION_AGENT_RUN_ID_PATTERN = '^M16-S05-REPLAY-RUN-[A-Za-z0-9._-]+$';
const CORRELATION_EVIDENCE_ID_PATTERN = '^m016-s05-replay-evidence-[a-z][a-z0-9._-]{2,63}$';
const CORRELATION_PROBE_ID_PATTERN = '^M16-S03-PROBE-[A-Za-z0-9._-]+$';
const CORRELATION_CRITERION_ID_PATTERN = '^(HG[1-8] SEMANTIC_RULE_COMPLIANCE|HG[1-8] PROVENANCE_INTEGRITY|HG[1-8] RECOVERY_EVIDENCE|HG[1-8] FINANCIAL_PROTECTION|HG[1-8] SECURITY_POSTURE|HG[1-8] COMPLIANCE_POSTURE|HG[1-8] READ_ONLY_BOUNDARY|HG[1-8] SCRATCH_ISOLATION|SG[1-4] SEVEN_DIVISION_COVERAGE|SG[1-4] LAUNCH_VERDICT_FROZEN|SG[1-4] PRODUCER_PROVENANCE_OK|SG[1-4] VERIFIER_INDEPENDENCE)$';

const CORRELATION_BUDGET = Object.freeze({
  max_probe_to_criterion_rows: 64,
  max_agent_run_to_probe_rows: 64,
  max_evidence_to_criterion_rows: 96,
  min_probe_to_criterion_rows: 19,
});

// ---------------------------------------------------------------------------
// 11. SOURCE_ALLOWLIST — fixed S01..S04 inputs the bundle declares pre/post
//     hashes for. S02 baseline, S03 pack, S04 canary bundle, and the S05
//     replay probe-run sidecar are mandatory chains; the rest is optional
//     auxiliary context.
// ---------------------------------------------------------------------------

const SOURCE_ALLOWLIST = Object.freeze([
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S02-bos-mission-proof.json',
    kind: 's02_baseline',
    independence_group: 'm016-s02-bos-mission-proof',
    chain_role: 's02_baseline',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S03-safe-operational-evidence-pack.json',
    kind: 's03_pack',
    independence_group: 'm016-s03-pack',
    chain_role: 's03_pack',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S04-div4-div5-canary-bundle.json',
    kind: 's04_canary_bundle',
    independence_group: 'm016-s04-canary-bundle',
    chain_role: 's04_canary_bundle',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-probe-run.json',
    kind: 'replay_probe_run',
    independence_group: 'm016-s05-replay-probe-run',
    chain_role: 'replay_probe_run',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S03-live-probe-results.json',
    kind: 'live_probe_results',
    independence_group: 'm016-s03-probe-live',
    chain_role: 'replay_probe_run',
    required: false,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S03-scratch-drill-results.json',
    kind: 'scratch_drill_results',
    independence_group: 'm016-s03-probe-drill',
    chain_role: 'replay_probe_run',
    required: false,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S03-verify-protocol.json',
    kind: 's03_verify_protocol',
    independence_group: 'm016-s03-verify-protocol',
    chain_role: 's03_verify_protocol',
    required: false,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S03-collect-protocol.json',
    kind: 's03_collect_protocol',
    independence_group: 'm016-s03-collect-protocol',
    chain_role: 's03_collect_protocol',
    required: false,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S03-input-inventory.json',
    kind: 's03_input_inventory',
    independence_group: 'm016-s03-input-inventory',
    chain_role: 's03_input_inventory',
    required: false,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S03-isolation-invariant.json',
    kind: 's03_isolation_invariant',
    independence_group: 'm016-s03-isolation-invariant',
    chain_role: 's03_isolation_invariant',
    required: false,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S04-div4-div5-canary-producer-protocol.json',
    kind: 's04_canary_producer_protocol',
    independence_group: 'm016-s04-canary-producer-protocol',
    chain_role: 's04_canary_producer_protocol',
    required: false,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S04-div4-div5-canary-verify-protocol.json',
    kind: 's04_canary_verify_protocol',
    independence_group: 'm016-s04-canary-verify-protocol',
    chain_role: 's04_canary_verify_protocol',
    required: false,
  }),
]);

const SOURCE_ALLOWLIST_SET = Object.freeze(new Set(SOURCE_ALLOWLIST.map((s) => s.source_ref)));

// Mandatory chain roles — must appear in evidence_chain rows.
const MANDATORY_CHAIN_ROLES = Object.freeze([
  's02_baseline',
  's03_pack',
  's04_canary_bundle',
  'replay_probe_run',
]);

// ---------------------------------------------------------------------------
// 12. RECORDS_BUDGET — exactly 19 records = 16 role + 3 drill partition
// ---------------------------------------------------------------------------

const RECORDS_BUDGET = Object.freeze({
  total_records: 19,
  role_records: 16,
  drill_records: 3,
  divisions_count: 7,
  infrastructure_count: 9,
  // Bounded upper bound for contract evaluation; schema enforces ===19.
  max_total_records: 24,
  max_canary_bytes: 4194304,
  max_bundle_hash_chars: 64,
  max_protocol_hash_chars: 64,
  max_evidence_chain_rows: 12,
  max_redaction_leak_rows: 16,
  max_blocker_codes: 96,
  max_worksheet_rows: 24,
  // S05 boundary: contracts must materialise EXACTLY 19 records (16+3).
  enforce_exact_nineteen: true,
});

const DIVISION_ROLES = Object.freeze([
  'Div1.HCO',
  'Div2.MasterPlanner',
  'Div3.Treasury',
  'Div4.Production',
  'Div5.QualificationsLibraryLearning',
  'Div6.External',
  'Div7.MissionControl',
]);

const INFRASTRUCTURE_ROLES = Object.freeze([
  'paperclip_health',
  'hermes_environment',
  'secret_posture',
  'cost_snapshot',
  'isolation_invariant',
  'restore_drill',
  'budget_stop_drill',
  'failure_drill',
  'redaction_posture_audit',
]);

const DRILL_ROLE_KINDS = Object.freeze(['restore_drill', 'budget_stop_drill', 'failure_drill']);

const REPLAY_PARTITION = Object.freeze({
  role_count: 16,
  drill_count: 3,
  total: 19,
  divisions: DIVISION_ROLES.length,
  infrastructure: INFRASTRUCTURE_ROLES.length,
});

// ---------------------------------------------------------------------------
// 13. DEFAULTS — paths, scratch root, ceilings, operator gate token
// ---------------------------------------------------------------------------

const DEFAULTS = Object.freeze({
  schema_path: 'schemas/runtime-evidence/m016-s05-seven-division-replay-bundle.v1.json',
  admission_schema_path: 'schemas/runtime-evidence/m016-s05-seven-division-replay-admission.v1.json',
  worksheet_schema_path: 'schemas/runtime-evidence/m016-s05-seven-division-replay-scoring-worksheet.v1.json',
  producer_protocol_schema_path: 'schemas/runtime-evidence/m016-s05-seven-division-replay-producer-protocol.v1.json',
  verify_protocol_schema_path: 'schemas/runtime-evidence/m016-s05-seven-division-replay-verify-protocol.v1.json',
  output_dir: 'runtime-evidence',
  bundle_output: 'runtime-evidence/M016-S05-seven-division-replay-bundle.json',
  admission_output: 'runtime-evidence/M016-S05-seven-division-replay-admission.json',
  input_inventory_output: 'runtime-evidence/M016-S05-seven-division-replay-input-inventory.json',
  probe_run_output: 'runtime-evidence/M016-S05-seven-division-replay-probe-run.json',
  worksheet_output: 'runtime-evidence/M016-S05-seven-division-replay-scoring-worksheet.json',
  producer_protocol_output: 'runtime-evidence/M016-S05-seven-division-replay-producer-protocol.json',
  verify_protocol_output: 'runtime-evidence/M016-S05-seven-division-replay-verify-protocol.json',
  negative_fixtures_output: 'runtime-evidence/M016-S05-seven-division-replay-negative-fixtures.json',
  scratch_root: '/tmp/m016-s05-scratch',
  scratch_root_macos_private: '/private/tmp/m016-s05-scratch',
  scratch_root_macos_user: '/var/folders/m016-s05-scratch',
  reference_time: '2026-07-20T12:00:00.000Z',
  verify_iterations: 3,
  max_replay_duration_ms: 600000,
  bundle_id: BUNDLE_ID,
  admission_id: ADMISSION_ID,
  worksheet_id: WORKSHEET_ID,
  producer_protocol_id: PRODUCER_PROTOCOL_ID,
  verify_protocol_id: VERIFY_PROTOCOL_ID,
  operator_gate_token: OPERATOR_GATE_TOKEN,
});

// ---------------------------------------------------------------------------
// 14. REDACTION_FLAG_VALUES — re-export from S03 safe-probe (shared)
// ---------------------------------------------------------------------------

const REPLAY_REDACTION_FLAG_VALUES = REDACTION_FLAG_VALUES;

// ---------------------------------------------------------------------------
// 15. Identifier patterns
// ---------------------------------------------------------------------------

const BUNDLE_ID_PATTERN = '^[a-z][a-z0-9._-]{2,63}$';
const SOURCE_REF_PATTERN = '^runtime-evidence/M016-S[0-9]{2}-[A-Za-z0-9._/-]+\\.json$';

// ---------------------------------------------------------------------------
// 16. REPLAY_PROBE_RUN_TAG_PREFIX — used by admission/probe-run builders.
// ---------------------------------------------------------------------------

const REPLAY_PROBE_RUN_TAG_PREFIX = 'M16-S05-REPLAY-RUN-';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // 1. SCHEMA + NAMESPACE
  SCHEMA_ID,
  SCHEMA_VERSION,
  ADMISSION_SCHEMA_ID,
  ADMISSION_SCHEMA_VERSION,
  WORKSHEET_SCHEMA_ID,
  WORKSHEET_SCHEMA_VERSION,
  PRODUCER_PROTOCOL_SCHEMA_ID,
  PRODUCER_PROTOCOL_SCHEMA_VERSION,
  VERIFY_PROTOCOL_SCHEMA_ID,
  VERIFY_PROTOCOL_SCHEMA_VERSION,
  MILESTONE,
  SLICE,
  TASK_IDS,
  SCHEMA_NAMESPACE,
  BUNDLE_ID,
  BUNDLE_KIND,
  ADMISSION_ID,
  ADMISSION_KIND,
  WORKSHEET_ID,
  WORKSHEET_KIND,
  PRODUCER_PROTOCOL_ID,
  PRODUCER_PROTOCOL_KIND,
  VERIFY_PROTOCOL_ID,
  VERIFY_PROTOCOL_KIND,
  PRODUCER_TASK_ID,
  VERIFIER_TASK_ID,
  // 2. NAMESPACES
  NAMESPACE,
  VALIDATOR_NAMESPACE,
  PRODUCER_LINE_CLASS,
  VERIFIER_LINE_CLASS,
  PRODUCER_CANONICAL_PROTOCOL,
  VERIFIER_CANONICAL_PROTOCOL,
  REPLAY_BLOCKER_NAMESPACE,
  VERIFIER_BLOCKER_NAMESPACE,
  REPLAY_BLOCKER_CODE_PATTERN,
  VERIFIER_BLOCKER_CODE_PATTERN,
  EVIDENCE_ID_PREFIX,
  AGENT_RUN_ID_PREFIX,
  CORRELATION_PROBE_ID_PREFIX,
  OPERATOR_GATE_TOKEN,
  // 3. REPLAY_GATE_IDS
  REPLAY_GATE_IDS,
  REPLAY_GATE_LABELS,
  REPLAY_GATE_IDS_SET,
  isKnownReplayGate,
  // 4. BLOCKER_CODES
  BLOCKER_CODES,
  REPLAY_BLOCKER_CODE_REGEX,
  VERIFIER_BLOCKER_CODE_REGEX,
  isReplayBlockerCode,
  isVerifierBlockerCode,
  // 6. EXIT_CODES
  EXIT_CODES,
  // 7. REPLAY_KINDS
  REPLAY_KINDS,
  REPLAY_KINDS_SET,
  isValidReplayKind,
  // 8. VERDICT_VALUES
  VERDICT_VALUES,
  VERDICT_VALUES_SET,
  ORCHESTRATION_VERDICTS,
  EVIDENCE_VERDICTS,
  LAUNCH_VERDICTS,
  isValidVerdict,
  isValidOrchestrationVerdict,
  isValidEvidenceVerdict,
  isValidLaunchVerdict,
  FORBIDDEN_REPLAY_VERDICTS,
  isForbiddenReplayVerdict,
  // 9. SCORING_WEIGHTS
  SCORING_WEIGHTS,
  SCORING_WEIGHT_SUM,
  WORKSHEET_NUMERIC_MAPPING_SCHEMA,
  // 10. CORRELATION_CONTRACT_VOCAB
  CORRELATION_AGENT_RUN_ID_PATTERN,
  CORRELATION_EVIDENCE_ID_PATTERN,
  CORRELATION_PROBE_ID_PATTERN,
  CORRELATION_CRITERION_ID_PATTERN,
  CORRELATION_BUDGET,
  // 11. SOURCE_ALLOWLIST
  SOURCE_ALLOWLIST,
  SOURCE_ALLOWLIST_SET,
  MANDATORY_CHAIN_ROLES,
  // 12. RECORDS_BUDGET + partitions
  RECORDS_BUDGET,
  DIVISION_ROLES,
  INFRASTRUCTURE_ROLES,
  DRILL_ROLE_KINDS,
  REPLAY_PARTITION,
  // 13. DEFAULTS
  DEFAULTS,
  // 14. REDACTION (shared)
  REPLAY_REDACTION_FLAG_VALUES,
  // 15. PATTERNS
  PROBE_ID_PATTERN,
  INDEPENDENCE_GROUP_PATTERN,
  BUNDLE_ID_PATTERN,
  SOURCE_REF_PATTERN,
  // 16. Probe-run tag prefix
  REPLAY_PROBE_RUN_TAG_PREFIX,
  // Re-exports from S03 safe-probe-data (frozen role/gate/drill vocabularies)
  HARD_GATE_IDS,
  HARD_GATE_LABELS,
  HARD_GATE_IDS_SET,
  ROLE_REGISTRY,
  INDEPENDENCE_GROUPS_SET,
  SCRATCH_DRILL_KINDS,
  SCRATCH_DRILL_KINDS_SET,
  isKnownDrillKind,
  isKnownRole,
  // helpers
  _safeSuffix,
};
