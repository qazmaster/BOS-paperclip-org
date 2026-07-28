#!/usr/bin/env node
'use strict';

/**
 * scripts/lib/m016-s04-div4-div5-canary-data.js
 *
 * M016-txa3vu / S04 / T01 — Frozen registry and constants for the Div4 to
 * Div5 evidence canary bundle. Pure-data module: no I/O, no evaluation
 * logic. The schema validator (test_m016_s04_div4_div5_canary_schema.js),
 * the pure contract evaluator (m016-s04-div4-div5-canary-contract.js,
 * T02), the Div4 producer (produce_m016_s04_div4_div5_canary.js, T03),
 * and the Div5 independent validator (verify_m016_s04_div4_div5_canary.js,
 * T04) all consume these constants so a single source of truth governs:
 *
 *   1.  SCHEMA + NAMESPACE            — bundle/producer/verify schema_ids,
 *                                       schema_version, slice, milestone
 *   2.  NAMESPACES                    — producer (M16-S04-CANARY), validator
 *                                       (M16-S04-VERIFY), line_class tokens
 *   3.  CANARY_GATE_IDS               — CG1..CG8 with explicit coverage labels
 *   4.  BLOCKER_CODES                 — producer + validator M16-S04-CANARY-*
 *                                       and M16-S04-VERIFY-* factory functions
 *   5.  BLOCKER_NAMESPACE + REGEX     — frozen patterns the schemas enforce
 *   6.  EXIT_CODES                    — process exit codes 0..8
 *   7.  ROLE_SUBSET_DEFAULTS          — bounded Div4 canary role subset
 *   8.  DRILL_SUBSET_DEFAULTS         — bounded canary drill subset
 *   9.  CANARY_KINDS                  — record kinds accepted in the bundle
 *                                       (live_canary_record / drill_canary_record)
 *  10.  CORRELATION_CONTRACT_VOCAB    — agent_run_id, probe_id, evidence_id,
 *                                       criterion_id namespaces and helpers
 *  11.  SOURCE_ALLOWLIST              — fixed S02/S03 inputs the bundle
 *                                       declares pre/post hashes for
 *  12.  S02_BASELINE_REF              — frozen S02 baseline reference
 *  13.  S03_REFS                      — frozen S03 pack / verify / collect /
 *                                       inventory / probe / drill source refs
 *  14.  RECORDS_BUDGET                — bounded record / byte ceilings
 *  15.  DEFAULTS                      — paths, scratch root, ceilings
 *  16.  FORBIDDEN_CANARY_VERDICTS     — GO / PASS_AUTOMATIC / READY forbidden
 *                                       at the canary layer
 *  17.  REDACTION_FLAG_VALUES         — re-exported bounded redaction posture
 *  18.  PROBE_ID_PATTERN / INDEPENDENCE_GROUP_PATTERN — bounded identifiers
 */

const {
  REDACTION_FLAG_VALUES,
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

const SCHEMA_ID = 'https://gsd.local/schemas/runtime-evidence/m016-s04-div4-div5-canary-bundle.v1.json';
const SCHEMA_VERSION = 'v1';

const PRODUCER_PROTOCOL_SCHEMA_ID = 'https://gsd.local/schemas/runtime-evidence/m016-s04-div4-div5-canary-producer-protocol.v1.json';
const PRODUCER_PROTOCOL_SCHEMA_VERSION = 'v1';
const VERIFY_PROTOCOL_SCHEMA_ID = 'https://gsd.local/schemas/runtime-evidence/m016-s04-div4-div5-canary-verify-protocol.v1.json';
const VERIFY_PROTOCOL_SCHEMA_VERSION = 'v1';

const MILESTONE = 'M016-txa3vu';
const SLICE = 'S04';
const TASK_IDS = Object.freeze(['T01', 'T02', 'T03', 'T04', 'T05', 'T06']);
const SCHEMA_NAMESPACE = 'm016-s04-div4-div5-canary-bundle-v1';

const BUNDLE_ID = 'm016-s04-div4-div5-canary-bundle-v1';
const BUNDLE_KIND = 'div4-to-div5-canary-bundle';
const CANARY_PAIR_PRODUCER = 'Div4.Production';
const CANARY_PAIR_VALIDATOR = 'Div5.QualificationsLibraryLearning';

const PRODUCER_PROTOCOL_ID = 'm016-s04-div4-div5-canary-producer-protocol-v1';
const VERIFY_PROTOCOL_ID = 'm016-s04-div4-div5-canary-verify-protocol-v1';
const PRODUCER_PROTOCOL_KIND = 'div4-to-div5-canary-producer-protocol';
const VERIFY_PROTOCOL_KIND = 'div4-to-div5-canary-verify-protocol';

const PRODUCER_TASK_ID = 'T03';
const VERIFIER_TASK_ID = 'T04';

// ---------------------------------------------------------------------------
// 2. NAMESPACES
// ---------------------------------------------------------------------------

const NAMESPACE = 'M16-S04-CANARY';
const VALIDATOR_NAMESPACE = 'M16-S04-VERIFY';

const PRODUCER_LINE_CLASS = 'M16-S04-CANARY';
const VERIFIER_LINE_CLASS = 'M16-S04-VERIFY';

const PRODUCER_CANONICAL_PROTOCOL = 'PROTOCOL-M16-S04-CANARY-V1';
const VERIFIER_CANONICAL_PROTOCOL = 'PROTOCOL-M16-S04-VERIFY-V1';

const CANARY_BLOCKER_NAMESPACE = 'M16-S04-CANARY';
const VERIFIER_BLOCKER_NAMESPACE = 'M16-S04-VERIFY';

const CANARY_BLOCKER_CODE_PATTERN = '^M16-S04-CANARY-[A-Za-z0-9._-]+$';
const VERIFIER_BLOCKER_CODE_PATTERN = '^M16-S04-VERIFY-[A-Za-z0-9._-]+$';

const EVIDENCE_ID_PREFIX = 'm016-s04-canary-evidence-';
const AGENT_RUN_ID_PREFIX = 'M16-S04-CANARY-RUN-';
const CORRELATION_PROBE_ID_PREFIX = 'M16-S03-PROBE-';

// ---------------------------------------------------------------------------
// 3. CANARY_GATE_IDS — CG1..CG8 with explicit coverage labels
// ---------------------------------------------------------------------------

const CANARY_GATE_IDS = Object.freeze([
  'CG1 CANARY_PRODUCER_VALID',
  'CG2 CANARY_VALIDATOR_INDEPENDENT',
  'CG3 EVIDENCE_CHAIN_INTACT',
  'CG4 CORRELATION_CONTRACT_VALID',
  'CG5 REDACTION_SAFE',
  'CG6 S02_BASELINE_IMMUTABLE',
  'CG7 S03_PACK_IMMUTABLE',
  'CG8 DETERMINISTIC_REPLAY',
]);

const CANARY_GATE_LABELS = Object.freeze({
  'CG1 CANARY_PRODUCER_VALID': 'Div4 producer CLI exit=0, bundle schema passes, byte-identical inline dual-run replay produces two equal provenance hashes',
  'CG2 CANARY_VALIDATOR_INDEPENDENT': 'Div5 verifier imports only contract/data modules, never the producer CLI; N-iteration replay produces equal verifier verdict lines',
  'CG3 EVIDENCE_CHAIN_INTACT': 's02_baseline pre_canonical_hash == post_canonical_hash, s03_pack pre_sha256 == post_sha256, canary_probe_run pre_sha256 == post_sha256',
  'CG4 CORRELATION_CONTRACT_VALID': 'agent_run_id, probe_id, evidence_id, criterion_id are all unique within the bundle; criterion_id is a member of HARD_GATE_IDS or CANARY_GATE_IDS; independence_group is a member of INDEPENDENCE_GROUPS_SET',
  'CG5 REDACTION_SAFE': 'all 10 REDACTION_FLAG_VALUES flags are false; bounded_digests_only=true; redaction_bounds_loaded=true; no leak regex hit on any sanitised field',
  'CG6 S02_BASELINE_IMMUTABLE': 's02 baseline canonical_hash and raw_sha256 are equal on the producer pre and post windows; unchanged flag is true',
  'CG7 S03_PACK_IMMUTABLE': 's03_safe_operational_evidence_pack sha256 and pack_digest are equal on the producer pre and post windows; unchanged flag is true',
  'CG8 DETERMINISTIC_REPLAY': 'two sequential producer runs produce byte-identical bundle bytes under the same reference_time; replay_keys.match=true and byte_identical=true',
});

const CANARY_GATE_IDS_SET = Object.freeze(new Set(CANARY_GATE_IDS));

function isKnownCanaryGate(value) {
  return CANARY_GATE_IDS_SET.has(value);
}

// ---------------------------------------------------------------------------
// 4. BLOCKER_CODES — producer + validator factory functions
// ---------------------------------------------------------------------------

const BLOCKER_CODES = Object.freeze({
  // --- producer (Div4) blockers under M16-S04-CANARY-* ---
  PRODUCER_RUNNER_FAILURE: () => 'M16-S04-CANARY-RUNNER-FAILURE',
  PRODUCER_BUNDLE_INVALID: (kind) => 'M16-S04-CANARY-BUNDLE-INVALID-' + _safeSuffix(kind),
  PRODUCER_BUNDLE_MALFORMED: () => 'M16-S04-CANARY-BUNDLE-MALFORMED',
  PRODUCER_SOURCE_OUT_OF_ALLOWLIST: (ref) => 'M16-S04-CANARY-SOURCE-OUT-OF-ALLOWLIST-' + _safeSuffix(ref),
  PRODUCER_SOURCE_FILE_MISSING: (ref) => 'M16-S04-CANARY-SOURCE-FILE-MISSING-' + _safeSuffix(ref),
  PRODUCER_SOURCE_MALFORMED_JSON: (ref) => 'M16-S04-CANARY-SOURCE-MALFORMED-JSON-' + _safeSuffix(ref),
  PRODUCER_S02_BASELINE_MUTATED: () => 'M16-S04-CANARY-S02-BASELINE-MUTATED',
  PRODUCER_S02_BASELINE_MISSING: () => 'M16-S04-CANARY-S02-BASELINE-MISSING',
  PRODUCER_S03_PACK_MUTATED: () => 'M16-S04-CANARY-S03-PACK-MUTATED',
  PRODUCER_S03_PACK_MISSING: () => 'M16-S04-CANARY-S03-PACK-MISSING',
  PRODUCER_S03_VERIFIER_NOT_PASS: () => 'M16-S04-CANARY-S03-VERIFIER-NOT-PASS',
  PRODUCER_ROLE_NOT_IN_REGISTRY: (role) => 'M16-S04-CANARY-ROLE-NOT-IN-REGISTRY-' + _safeSuffix(role),
  PRODUCER_DRILL_NOT_IN_REGISTRY: (kind) => 'M16-S04-CANARY-DRILL-NOT-IN-REGISTRY-' + _safeSuffix(kind),
  PRODUCER_ROLE_NOT_PROVEN_EXECUTED: (role) => 'M16-S04-CANARY-ROLE-NOT-PROVEN-EXECUTED-' + _safeSuffix(role),
  PRODUCER_DRILL_NOT_PROVEN_EXECUTED: (kind) => 'M16-S04-CANARY-DRILL-NOT-PROVEN-EXECUTED-' + _safeSuffix(kind),
  PRODUCER_REPLAY_NOT_BYTE_IDENTICAL: () => 'M16-S04-CANARY-REPLAY-NOT-BYTE-IDENTICAL',
  PRODUCER_LAUNCH_PROMOTION_ATTEMPTED: (target) => 'M16-S04-CANARY-LAUNCH-PROMOTION-ATTEMPTED-' + _safeSuffix(target),
  PRODUCER_REDACTION_LEAK: (kind) => 'M16-S04-CANARY-REDACTION-LEAK-' + _safeSuffix(kind),
  PRODUCER_CORRELATION_BROKEN: (field) => 'M16-S04-CANARY-CORRELATION-BROKEN-' + _safeSuffix(field),
  PRODUCER_EVIDENCE_CHAIN_BROKEN: (chain) => 'M16-S04-CANARY-EVIDENCE-CHAIN-BROKEN-' + _safeSuffix(chain),
  PRODUCER_SUBSET_EMPTY: (kind) => 'M16-S04-CANARY-SUBSET-EMPTY-' + _safeSuffix(kind),
  PRODUCER_INDEPENDENCE_GROUP_REUSED: (group) => 'M16-S04-CANARY-INDEPENDENCE-GROUP-REUSED-' + _safeSuffix(group),
  PRODUCER_SCRATCH_ROOT_FORBIDDEN: (root) => 'M16-S04-CANARY-SCRATCH-ROOT-FORBIDDEN-' + _safeSuffix(root),
  PRODUCER_OUTPUT_PATH_OUT_OF_TMP: (path) => 'M16-S04-CANARY-OUTPUT-PATH-OUT-OF-TMP-' + _safeSuffix(path),
  PRODUCER_ATOMIC_WRITE_FAILED: (path) => 'M16-S04-CANARY-ATOMIC-WRITE-FAILED-' + _safeSuffix(path),

  // --- validator (Div5) blockers under M16-S04-VERIFY-* ---
  VALIDATOR_BUNDLE_NOT_FOUND: (path) => 'M16-S04-VERIFY-BUNDLE-NOT-FOUND-' + _safeSuffix(path),
  VALIDATOR_BUNDLE_NOT_BYTE_IDENTICAL: () => 'M16-S04-VERIFY-BUNDLE-NOT-BYTE-IDENTICAL',
  VALIDATOR_SCHEMA_VIOLATION: (field) => 'M16-S04-VERIFY-SCHEMA-VIOLATION-' + _safeSuffix(field),
  VALIDATOR_EVIDENCE_CHAIN_BROKEN: (chain) => 'M16-S04-VERIFY-EVIDENCE-CHAIN-BROKEN-' + _safeSuffix(chain),
  VALIDATOR_S02_HASH_DRIFT: (expected, actual) => 'M16-S04-VERIFY-S02-HASH-DRIFT-' + _safeSuffix(expected) + '-' + _safeSuffix(actual),
  VALIDATOR_S03_HASH_DRIFT: (expected, actual) => 'M16-S04-VERIFY-S03-HASH-DRIFT-' + _safeSuffix(expected) + '-' + _safeSuffix(actual),
  VALIDATOR_CANARY_PROBE_RUN_DRIFT: (expected, actual) => 'M16-S04-VERIFY-CANARY-PROBE-RUN-DRIFT-' + _safeSuffix(expected) + '-' + _safeSuffix(actual),
  VALIDATOR_CORRELATION_DUPLICATE: (kind, value) => 'M16-S04-VERIFY-CORRELATION-DUPLICATE-' + _safeSuffix(kind) + '-' + _safeSuffix(value),
  VALIDATOR_CORRELATION_CRITERION_UNKNOWN: (criterion) => 'M16-S04-VERIFY-CORRELATION-CRITERION-UNKNOWN-' + _safeSuffix(criterion),
  VALIDATOR_CORRELATION_AGENT_RUN_MISSING: () => 'M16-S04-VERIFY-CORRELATION-AGENT-RUN-MISSING',
  VALIDATOR_CORRELATION_PROBE_NOT_IN_S03: (probe) => 'M16-S04-VERIFY-CORRELATION-PROBE-NOT-IN-S03-' + _safeSuffix(probe),
  VALIDATOR_CORRELATION_INDEPENDENCE_GROUP_UNKNOWN: (group) => 'M16-S04-VERIFY-CORRELATION-INDEPENDENCE-GROUP-UNKNOWN-' + _safeSuffix(group),
  VALIDATOR_CLASSIFICATION_DRIFT: (gate) => 'M16-S04-VERIFY-CLASSIFICATION-DRIFT-' + _safeSuffix(gate),
  VALIDATOR_GATE_DERIVATION_DRIFT: (gate) => 'M16-S04-VERIFY-GATE-DERIVATION-DRIFT-' + _safeSuffix(gate),
  VALIDATOR_LAUNCH_PROMOTION_DETECTED: (verdict) => 'M16-S04-VERIFY-LAUNCH-PROMOTION-DETECTED-' + _safeSuffix(verdict),
  VALIDATOR_REDACTION_LEAK: (kind) => 'M16-S04-VERIFY-REDACTION-LEAK-' + _safeSuffix(kind),
  VALIDATOR_REPLAY_DRIFT: () => 'M16-S04-VERIFY-REPLAY-DRIFT',
  VALIDATOR_REDACTION_BOUNDS_UNLOADED: () => 'M16-S04-VERIFY-REDACTION-BOUNDS-UNLOADED',
  VALIDATOR_INDEPENDENCE_VIOLATION: () => 'M16-S04-VERIFY-INDEPENDENCE-VIOLATION',
  VALIDATOR_PATH_TRAVERSAL: (path) => 'M16-S04-VERIFY-PATH-TRAVERSAL-' + _safeSuffix(path),
  VALIDATOR_RUNNER_FAILURE: () => 'M16-S04-VERIFY-RUNNER-FAILURE',
});

const CANARY_BLOCKER_CODE_REGEX = new RegExp(CANARY_BLOCKER_CODE_PATTERN);
const VERIFIER_BLOCKER_CODE_REGEX = new RegExp(VERIFIER_BLOCKER_CODE_PATTERN);

function isCanaryBlockerCode(value) {
  return typeof value === 'string' && CANARY_BLOCKER_CODE_REGEX.test(value);
}

function isVerifierBlockerCode(value) {
  return typeof value === 'string' && VERIFIER_BLOCKER_CODE_REGEX.test(value);
}

// ---------------------------------------------------------------------------
// 6. EXIT_CODES — process exit codes 0..8
// ---------------------------------------------------------------------------

const EXIT_CODES = Object.freeze({
  CANARY_PASS: 0,
  CANARY_REJECTED_MALFORMED: 1,
  CANARY_REJECTED_FAIL_CLOSED: 2,
  CANARY_CLASSIFICATION_DRIFT: 3,
  CANARY_LAUNCH_PROMOTION: 4,
  CANARY_PROVENANCE_DRIFT: 5,
  CANARY_REDACTION_LEAK: 6,
  CANARY_REPLAY_DRIFT: 7,
  CANARY_RUNNER_FAILURE: 8,
});

// ---------------------------------------------------------------------------
// 7. ROLE_SUBSET_DEFAULTS — bounded canary role subset
// ---------------------------------------------------------------------------

// Frozen default role subset for the Div4→Div5 canary. Each role is a
// member of the upstream S03 ROLE_REGISTRY and was proven EXECUTED on the
// most recent S03 run (see research §3.8). The set stays small enough to
// keep the canary bounded while exercising both a division probe and an
// infrastructure probe.
const ROLE_SUBSET_DEFAULTS = Object.freeze(['Div2.MasterPlanner', 'secret_posture']);
const ROLE_SUBSET_ALTERNATIVE = Object.freeze(['Div4.Production', 'failure_drill']);
const ROLE_SUBSET_SET = Object.freeze(new Set(ROLE_SUBSET_DEFAULTS));

function isInRoleSubset(role) {
  return ROLE_SUBSET_SET.has(role);
}

function isInRoleSubsetAny(role, subset) {
  if (!Array.isArray(subset)) return ROLE_SUBSET_SET.has(role);
  return subset.includes(role);
}

// ---------------------------------------------------------------------------
// 8. DRILL_SUBSET_DEFAULTS — bounded canary drill subset
// ---------------------------------------------------------------------------

const DRILL_SUBSET_DEFAULTS = Object.freeze(['budget-stop-drill']);
const DRILL_SUBSET_ALTERNATIVE = Object.freeze(['failure-drill']);
const DRILL_SUBSET_SET = Object.freeze(new Set(DRILL_SUBSET_DEFAULTS));

function isInDrillSubset(kind) {
  return DRILL_SUBSET_SET.has(kind);
}

function isInDrillSubsetAny(kind, subset) {
  if (!Array.isArray(subset)) return DRILL_SUBSET_SET.has(kind);
  return subset.includes(kind);
}

// ---------------------------------------------------------------------------
// 9. CANARY_KINDS — record kinds accepted in the bundle
// ---------------------------------------------------------------------------

const CANARY_KINDS = Object.freeze({
  LIVE_CANARY_RECORD: 'live_canary_record',
  DRILL_CANARY_RECORD: 'drill_canary_record',
});
const CANARY_KINDS_SET = Object.freeze(new Set(Object.values(CANARY_KINDS)));

function isValidCanaryKind(value) {
  return CANARY_KINDS_SET.has(value);
}

// ---------------------------------------------------------------------------
// 10. CORRELATION_CONTRACT_VOCAB
// ---------------------------------------------------------------------------

const CORRELATION_AGENT_RUN_ID_PATTERN = '^M16-S04-CANARY-RUN-[A-Za-z0-9._-]+$';
const CORRELATION_EVIDENCE_ID_PATTERN = '^m016-s04-canary-evidence-[a-z][a-z0-9._-]{2,63}$';
const CORRELATION_PROBE_ID_PATTERN = '^M16-S03-PROBE-[A-Za-z0-9._-]+$';
const CORRELATION_CRITERION_ID_PATTERN = '^(HG[1-8] SEMANTIC_RULE_COMPLIANCE|HG[1-8] PROVENANCE_INTEGRITY|HG[1-8] RECOVERY_EVIDENCE|HG[1-8] FINANCIAL_PROTECTION|HG[1-8] SECURITY_POSTURE|HG[1-8] COMPLIANCE_POSTURE|HG[1-8] READ_ONLY_BOUNDARY|HG[1-8] SCRATCH_ISOLATION|CG[1-8] CANARY_PRODUCER_VALID|CG[1-8] CANARY_VALIDATOR_INDEPENDENT|CG[1-8] EVIDENCE_CHAIN_INTACT|CG[1-8] CORRELATION_CONTRACT_VALID|CG[1-8] REDACTION_SAFE|CG[1-8] S02_BASELINE_IMMUTABLE|CG[1-8] S03_PACK_IMMUTABLE|CG[1-8] DETERMINISTIC_REPLAY)$';

// Cardinality hints for the correlation contract — schema enforces upper bounds.
const CORRELATION_BUDGET = Object.freeze({
  max_probe_to_criterion_rows: 32,
  max_agent_run_to_probe_rows: 32,
  max_evidence_to_criterion_rows: 64,
  min_probe_to_criterion_rows: 1,
});

// ---------------------------------------------------------------------------
// 11. SOURCE_ALLOWLIST — fixed set of S02/S03 inputs the bundle declares
//     pre/post hashes for. Mirrors the S03 SOURCE_ALLOWLIST so the Div4
//     canary references the same evidence pool.
// ---------------------------------------------------------------------------

const SOURCE_ALLOWLIST = Object.freeze([
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S02-bos-mission-proof.json',
    kind: 's02_baseline',
    independence_group: 'm016-s02-bos-mission-proof',
    chain_role: 's02_baseline',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S03-safe-operational-evidence-pack.json',
    kind: 's03_pack',
    independence_group: 'm016-s03-pack',
    chain_role: 's03_pack',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S03-live-probe-results.json',
    kind: 'live_probe_results',
    independence_group: 'm016-s03-probe-live',
    chain_role: 'canary_probe_run',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S03-scratch-drill-results.json',
    kind: 'scratch_drill_results',
    independence_group: 'm016-s03-probe-drill',
    chain_role: 'canary_probe_run',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S03-verify-protocol.json',
    kind: 's03_verify_protocol',
    independence_group: 'm016-s03-verify-protocol',
    chain_role: 's03_verify_protocol',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S03-collect-protocol.json',
    kind: 's03_collect_protocol',
    independence_group: 'm016-s03-collect-protocol',
    chain_role: 's03_collect_protocol',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S03-input-inventory.json',
    kind: 's03_input_inventory',
    independence_group: 'm016-s03-input-inventory',
    chain_role: 's03_input_inventory',
  }),
]);

const SOURCE_ALLOWLIST_SET = Object.freeze(new Set(SOURCE_ALLOWLIST.map((s) => s.source_ref)));

// ---------------------------------------------------------------------------
// 12. S02_BASELINE_REF — frozen S02 baseline sidecar reference (immutability gate)
// ---------------------------------------------------------------------------

const S02_BASELINE_REF = 'runtime-evidence/M016-S02-bos-mission-proof.json';

// ---------------------------------------------------------------------------
// 13. S03_REFS — frozen S03 evidence references the canary consumes
// ---------------------------------------------------------------------------

const S03_PACK_REF = 'runtime-evidence/M016-S03-safe-operational-evidence-pack.json';
const S03_VERIFY_REF = 'runtime-evidence/M016-S03-verify-protocol.json';
const S03_COLLECT_REF = 'runtime-evidence/M016-S03-collect-protocol.json';
const S03_INVENTORY_REF = 'runtime-evidence/M016-S03-input-inventory.json';
const S03_LIVE_PROBE_REF = 'runtime-evidence/M016-S03-live-probe-results.json';
const S03_SCRATCH_DRILL_REF = 'runtime-evidence/M016-S03-scratch-drill-results.json';
const S03_ISOLATION_INVARIANT_REF = 'runtime-evidence/M016-S03-isolation-invariant.json';

// ---------------------------------------------------------------------------
// 14. RECORDS_BUDGET — bounded record count ceilings
// ---------------------------------------------------------------------------

const RECORDS_BUDGET = Object.freeze({
  max_live_canary_records: 16,
  max_drill_canary_records: 8,
  max_total_records: 24,
  max_canary_bytes: 4194304,
  max_bundle_hash_chars: 64,
  max_protocol_hash_chars: 64,
  max_evidence_chain_rows: 3,
  max_redaction_leak_rows: 16,
  max_blocker_codes: 64,
  max_role_subset_size: 8,
  min_role_subset_size: 1,
  max_drill_subset_size: 4,
  min_drill_subset_size: 1,
});

// ---------------------------------------------------------------------------
// 15. DEFAULTS — paths, scratch root, ceilings
// ---------------------------------------------------------------------------

const DEFAULTS = Object.freeze({
  schema_path: 'schemas/runtime-evidence/m016-s04-div4-div5-canary-bundle.v1.json',
  producer_protocol_schema_path: 'schemas/runtime-evidence/m016-s04-div4-div5-canary-producer-protocol.v1.json',
  verify_protocol_schema_path: 'schemas/runtime-evidence/m016-s04-div4-div5-canary-verify-protocol.v1.json',
  output_dir: 'runtime-evidence',
  bundle_output: 'runtime-evidence/M016-S04-div4-div5-canary-bundle.json',
  producer_protocol_output: 'runtime-evidence/M016-S04-div4-div5-canary-producer-protocol.json',
  verify_protocol_output: 'runtime-evidence/M016-S04-div4-div5-canary-verify-protocol.json',
  probe_run_output: 'runtime-evidence/M016-S04-div4-div5-canary-probe-run.json',
  inventory_output: 'runtime-evidence/M016-S04-div4-div5-canary-input-inventory.json',
  negative_fixtures_output: 'runtime-evidence/M016-S04-div4-div5-canary-negative-fixtures.json',
  scratch_root: '/tmp/m016-s04-scratch',
  scratch_root_macos_private: '/private/tmp/m016-s04-scratch',
  scratch_root_macos_user: '/var/folders/m016-s04-scratch',
  reference_time: '2026-07-20T12:00:00.000Z',
  verify_iterations: 2,
  max_canary_duration_ms: 600000,
  bundle_id: BUNDLE_ID,
  producer_protocol_id: PRODUCER_PROTOCOL_ID,
  verify_protocol_id: VERIFY_PROTOCOL_ID,
});

// ---------------------------------------------------------------------------
// 16. FORBIDDEN_CANARY_VERDICTS — launch-promotion forbidden at canary layer
// ---------------------------------------------------------------------------

const FORBIDDEN_CANARY_VERDICTS = Object.freeze(['GO', 'PASS_AUTOMATIC', 'READY', 'LAUNCH_GO', 'GO_BOUNDED_INTERNAL']);

function isForbiddenCanaryVerdict(value) {
  return typeof value === 'string' && FORBIDDEN_CANARY_VERDICTS.includes(value);
}

const CANARY_VERDICT_VALUES = Object.freeze({
  PRODUCED: 'PRODUCED',
  PASS: 'PASS',
  FAIL_CLOSED: 'fail_closed',
  NOT_PROVEN: 'NOT_PROVEN',
});
const CANARY_VERDICT_VALUES_SET = Object.freeze(new Set(Object.values(CANARY_VERDICT_VALUES)));

function isValidCanaryVerdict(value) {
  return CANARY_VERDICT_VALUES_SET.has(value);
}

// ---------------------------------------------------------------------------
// 17. REDACTION_FLAG_VALUES — re-export from S03 safe-probe (shared)
// ---------------------------------------------------------------------------

// Single source of truth; S03 safe-probe data owns the 10-flag posture.
const CANARY_REDACTION_FLAG_VALUES = REDACTION_FLAG_VALUES;

// ---------------------------------------------------------------------------
// 18. Identifier patterns
// ---------------------------------------------------------------------------

const PROBE_ID_PATTERN = '^M16-S03-PROBE-[A-Za-z0-9._-]+$';
const INDEPENDENCE_GROUP_PATTERN = '^[a-z][a-z0-9._-]{2,63}$';
const BUNDLE_ID_PATTERN = '^[a-z][a-z0-9._-]{2,63}$';
const SOURCE_REF_PATTERN = '^runtime-evidence/M016-S[0-9]{2}-[A-Za-z0-9._/-]+\\.json$';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // 1. SCHEMA + NAMESPACE
  SCHEMA_ID,
  SCHEMA_VERSION,
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
  CANARY_PAIR_PRODUCER,
  CANARY_PAIR_VALIDATOR,
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
  CANARY_BLOCKER_NAMESPACE,
  VERIFIER_BLOCKER_NAMESPACE,
  CANARY_BLOCKER_CODE_PATTERN,
  VERIFIER_BLOCKER_CODE_PATTERN,
  EVIDENCE_ID_PREFIX,
  AGENT_RUN_ID_PREFIX,
  CORRELATION_PROBE_ID_PREFIX,
  // 3. CANARY_GATE_IDS
  CANARY_GATE_IDS,
  CANARY_GATE_LABELS,
  CANARY_GATE_IDS_SET,
  isKnownCanaryGate,
  // 4. BLOCKER_CODES
  BLOCKER_CODES,
  CANARY_BLOCKER_CODE_REGEX,
  VERIFIER_BLOCKER_CODE_REGEX,
  isCanaryBlockerCode,
  isVerifierBlockerCode,
  // 6. EXIT_CODES
  EXIT_CODES,
  // 7. ROLE_SUBSET_DEFAULTS
  ROLE_SUBSET_DEFAULTS,
  ROLE_SUBSET_ALTERNATIVE,
  ROLE_SUBSET_SET,
  isInRoleSubset,
  isInRoleSubsetAny,
  // 8. DRILL_SUBSET_DEFAULTS
  DRILL_SUBSET_DEFAULTS,
  DRILL_SUBSET_ALTERNATIVE,
  DRILL_SUBSET_SET,
  isInDrillSubset,
  isInDrillSubsetAny,
  // 9. CANARY_KINDS
  CANARY_KINDS,
  CANARY_KINDS_SET,
  isValidCanaryKind,
  // 10. CORRELATION_CONTRACT_VOCAB
  CORRELATION_AGENT_RUN_ID_PATTERN,
  CORRELATION_EVIDENCE_ID_PATTERN,
  CORRELATION_PROBE_ID_PATTERN,
  CORRELATION_CRITERION_ID_PATTERN,
  CORRELATION_BUDGET,
  // 11. SOURCE_ALLOWLIST
  SOURCE_ALLOWLIST,
  SOURCE_ALLOWLIST_SET,
  // 12. S02_BASELINE_REF
  S02_BASELINE_REF,
  // 13. S03_REFS
  S03_PACK_REF,
  S03_VERIFY_REF,
  S03_COLLECT_REF,
  S03_INVENTORY_REF,
  S03_LIVE_PROBE_REF,
  S03_SCRATCH_DRILL_REF,
  S03_ISOLATION_INVARIANT_REF,
  // 14. RECORDS_BUDGET
  RECORDS_BUDGET,
  // 15. DEFAULTS
  DEFAULTS,
  // 16. FORBIDDEN / VERDICT
  FORBIDDEN_CANARY_VERDICTS,
  isForbiddenCanaryVerdict,
  CANARY_VERDICT_VALUES,
  CANARY_VERDICT_VALUES_SET,
  isValidCanaryVerdict,
  // 17. REDACTION (shared)
  CANARY_REDACTION_FLAG_VALUES,
  // 18. PATTERNS
  PROBE_ID_PATTERN,
  INDEPENDENCE_GROUP_PATTERN,
  BUNDLE_ID_PATTERN,
  SOURCE_REF_PATTERN,
  // helpers
  _safeSuffix,
};
