#!/usr/bin/env node
'use strict';

/**
 * scripts/lib/m016-s07-replay-cleanup-data.js
 *
 * M016-txa3vu / S07 / T01 — Frozen registry and constants for the
 * policy-compliant replay cleanup proof contract. Pure-data module: no I/O,
 * no evaluation logic, no subprocesses, no network, no runtime writes.
 * T01 consumers:
 *
 *   - m016-s07-replay-cleanup-contract.js (T01 pure helpers)
 *   - verify_m016_s07_replay_cleanup_proof.js (T03 verifier, future)
 *   - test_m016_s07_replay_cleanup_contract.js (T01 schema/data/contract tests)
 *
 * Single source of truth for:
 *
 *   1.  SCHEMA + NAMESPACE           — proof schema id, schema_version,
 *                                       milestone/slice/task, proof id/kind
 *   2.  NAMESPACES                   — verifier line class
 *                                       (`M16-S07-CLEANUP`), canonical
 *                                       protocol token, blocker pattern
 *   3.  CLEANUP_PHASES               — pre_run | replay | post_run
 *   4.  CLEANUP_ACTIONS              — marker_validated | marker_forged |
 *                                       marker_missing | created | removed |
 *                                       refused | atomic_rename_failed |
 *                                       post_run_absent | overwrite_refused |
 *                                       subprocess_invoked
 *   5.  CLEANUP_OUTCOMES             — success | refused | failed
 *   6.  TRIAD_INVARIANT              — orchestration=PASS,
 *                                       evidence=PARTIAL,
 *                                       launch=PREPARATION_ONLY (must not
 *                                       drift; helper accepts and rejects
 *                                       triples accordingly)
 *   7.  CANONICAL_VERDICT_LINE       — frozen
 *                                       `M016_S07_REPLAY_CLEANUP=PASS|FAIL`
 *   8.  BLOCKER_CODES                — factory functions with stable
 *                                       namespace `M16-S07-CLEANUP-*`
 *   9.  EXIT_CODES                   — bounded process exits 0..7
 *                                       (mirrors S05/S06 family for
 *                                       cross-slice consistency)
 *  10.  SOURCE_ALLOWLIST             — frozen inputs the S07 verifier
 *                                       re-reads: S01 schema, fixture,
 *                                       S01 canonical sidecars
 *                                       (protocol/validation/verification),
 *                                       M015 baseline, S01 classifier CLI
 *  11.  DEFAULTS                     — scratch root (marker-owned), marker
 *                                       filename/contents, cleanup_script,
 *                                       bounded ceilings, operator gate token
 *                                       (NOT used in offline cleanup proof)
 *  12.  PATTERNS                     — source_ref / scratch_relpath /
 *                                       fixture_id patterns
 *  13.  REDACTION_FLAG_VALUES        — re-used safe redaction posture
 *                                       (re-exported from S03 safe probe)
 *  14.  Helpers                      — _safeSuffix, isCleanupPhase,
 *                                       isCleanupAction, isCleanupOutcome,
 *                                       isVerdictValue, isVerdictTriad,
 *                                       isCanonicalVerdictLine,
 *                                       isCleanupBlockerCode,
 *                                       TRIAD_INVARIANT, MARKER_CONTENTS
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

const REPLAY_CLEANUP_SCHEMA_ID = 'https://gsd.local/schemas/runtime-evidence/m016-s07-replay-cleanup-proof.v1.json';
const REPLAY_CLEANUP_SCHEMA_VERSION = 'v1';

const REPLAY_CLEANUP_PROOF_ID = 'm016-s07-replay-cleanup-proof-v1';
const REPLAY_CLEANUP_PROOF_KIND = 'replay-cleanup-proof';

const REPLAY_CLEANUP_NEGATIVE_FIXTURES_ID = 'm016-s07-replay-cleanup-negative-fixtures-v1';
const REPLAY_CLEANUP_NEGATIVE_FIXTURES_KIND = 'replay-cleanup-negative-fixtures';

const PROOF_KINDS = Object.freeze({
  PROOF: REPLAY_CLEANUP_PROOF_KIND,
  NEGATIVE_FIXTURES: REPLAY_CLEANUP_NEGATIVE_FIXTURES_KIND,
});
const PROOF_KINDS_SET = Object.freeze(new Set(Object.values(PROOF_KINDS)));

function isProofKind(value) {
  return PROOF_KINDS_SET.has(value);
}

const MILESTONE = 'M016-txa3vu';
const SLICE = 'S07';
const TASK = 'T01';
const TASK_IDS = Object.freeze(['T01', 'T02', 'T03', 'T04']);

// ---------------------------------------------------------------------------
// 2. NAMESPACES
// ---------------------------------------------------------------------------

const NAMESPACE = 'M16-S07';
const VERIFIER_LINE_CLASS = 'M16-S07-CLEANUP';

const VERIFIER_CANONICAL_PROTOCOL = 'PROTOCOL-M16-S07-REPLAY-CLEANUP-V1';

const CLEANUP_BLOCKER_NAMESPACE = 'M16-S07-CLEANUP';
const CLEANUP_BLOCKER_CODE_PATTERN = '^M16-S07-CLEANUP-[A-Za-z0-9._-]+$';

// Reference time used when canonical inputs emit no timestamp override.
const CLEANUP_REFERENCE_TIME = '2026-07-21T12:00:00.000Z';

// ---------------------------------------------------------------------------
// 3. CLEANUP_PHASES — pre_run | replay | post_run
// ---------------------------------------------------------------------------

const CLEANUP_PHASES = Object.freeze({
  PRE_RUN: 'pre_run',
  REPLAY: 'replay',
  POST_RUN: 'post_run',
});

const CLEANUP_PHASES_SET = Object.freeze(new Set(Object.values(CLEANUP_PHASES)));

function isCleanupPhase(value) {
  return CLEANUP_PHASES_SET.has(value);
}

// ---------------------------------------------------------------------------
// 4. CLEANUP_ACTIONS
// ---------------------------------------------------------------------------

const CLEANUP_ACTIONS = Object.freeze({
  CREATED: 'created',
  REMOVED: 'removed',
  REFUSED: 'refused',
  ATOMIC_RENAME_FAILED: 'atomic_rename_failed',
  POST_RUN_ABSENT: 'post_run_absent',
  OVERWRITE_REFUSED: 'overwrite_refused',
  MARKER_VALIDATED: 'marker_validated',
  MARKER_FORGED: 'marker_forged',
  MARKER_MISSING: 'marker_missing',
  SUBPROCESS_INVOKED: 'subprocess_invoked',
});

const CLEANUP_ACTIONS_SET = Object.freeze(new Set(Object.values(CLEANUP_ACTIONS)));

function isCleanupAction(value) {
  return CLEANUP_ACTIONS_SET.has(value);
}

// ---------------------------------------------------------------------------
// 5. CLEANUP_OUTCOMES
// ---------------------------------------------------------------------------

const CLEANUP_OUTCOMES = Object.freeze({
  SUCCESS: 'success',
  REFUSED: 'refused',
  FAILED: 'failed',
});

const CLEANUP_OUTCOMES_SET = Object.freeze(new Set(Object.values(CLEANUP_OUTCOMES)));

function isCleanupOutcome(value) {
  return CLEANUP_OUTCOMES_SET.has(value);
}

// ---------------------------------------------------------------------------
// 6. TRIAD_INVARIANT — orchestration=PASS, evidence=PARTIAL,
//                      launch=PREPARATION_ONLY
//
// The historical S01 verdict triple must remain unchanged by S07. Any
// drift in any of the three dimensions is a fail-closed condition with
// a stable blocker code. The TRIAD_INVARIANT is intentionally const-folded
// so consumers can compare objects by reference if desired.
// ---------------------------------------------------------------------------

const TRIAD_INVARIANT = Object.freeze({
  orchestration: 'PASS',
  evidence: 'PARTIAL',
  launch: 'PREPARATION_ONLY',
});

// Verdict vocabulary mirrors S01/S05/S06 verdict families.
const VERDICT_VALUES = Object.freeze({
  PASS: 'PASS',
  PARTIAL: 'PARTIAL',
  PREPARATION_ONLY: 'PREPARATION_ONLY',
  NOT_PROVEN: 'NOT_PROVEN',
  FAIL: 'FAIL',
});

const VERDICT_VALUES_SET = Object.freeze(new Set(Object.values(VERDICT_VALUES)));

function isValidVerdictValue(value) {
  return VERDICT_VALUES_SET.has(value);
}

function isVerdictTriad(triple) {
  if (!triple || typeof triple !== 'object') return false;
  return triple.orchestration === TRIAD_INVARIANT.orchestration
    && triple.evidence === TRIAD_INVARIANT.evidence
    && triple.launch === TRIAD_INVARIANT.launch;
}

// Which TRIAD field drifted, if any. Returns null when the triple matches.
function verdictTriadDriftField(triple) {
  if (!triple || typeof triple !== 'object') return 'triple-not-object';
  if (triple.orchestration !== TRIAD_INVARIANT.orchestration) return 'orchestration';
  if (triple.evidence !== TRIAD_INVARIANT.evidence) return 'evidence';
  if (triple.launch !== TRIAD_INVARIANT.launch) return 'launch';
  return null;
}

// ---------------------------------------------------------------------------
// 7. CANONICAL_VERDICT_LINE — machine-scannable one-liner
// ---------------------------------------------------------------------------

const CANONICAL_VERDICT_LINE = 'M016_S07_REPLAY_CLEANUP=PASS|FAIL';
const CANONICAL_VERDICT_LINE_STATUS_VALUES = Object.freeze(['PASS', 'FAIL']);
const CANONICAL_VERDICT_LINE_STATUS_SET = Object.freeze(new Set(CANONICAL_VERDICT_LINE_STATUS_VALUES));

function isCanonicalVerdictLineStatus(value) {
  return CANONICAL_VERDICT_LINE_STATUS_SET.has(value);
}

function formatCanonicalVerdictLine(status) {
  if (status === 'PASS') return 'M016_S07_REPLAY_CLEANUP=PASS';
  if (status === 'FAIL') return 'M016_S07_REPLAY_CLEANUP=FAIL';
  return null;
}

// ---------------------------------------------------------------------------
// 8. BLOCKER_CODES — factory functions for S07 cleanup blocker codes
// ---------------------------------------------------------------------------

const BLOCKER_CODES = Object.freeze({
  PRECONDITION_MISSING: (kind) => 'M16-S07-CLEANUP-PRECONDITION-MISSING-' + _safeSuffix(kind),
  SOURCE_HASH_DRIFT: (chain) => 'M16-S07-CLEANUP-SOURCE-HASH-DRIFT-' + _safeSuffix(chain),
  SOURCE_NOT_ALLOWLISTED: (rel) => 'M16-S07-CLEANUP-SOURCE-NOT-ALLOWLISTED-' + _safeSuffix(rel),
  PATH_TRAVERSAL: (rel) => 'M16-S07-CLEANUP-PATH-TRAVERSAL-' + _safeSuffix(rel),
  PATH_OUT_OF_CHECKOUT: (rel) => 'M16-S07-CLEANUP-PATH-OUT-OF-CHECKOUT-' + _safeSuffix(rel),
  SYMLINK_ESCAPE: (rel) => 'M16-S07-CLEANUP-SYMLINK-ESCAPE-' + _safeSuffix(rel),
  MARKER_FORGED: (rel) => 'M16-S07-CLEANUP-MARKER-FORGED-' + _safeSuffix(rel),
  MARKER_MISSING: (rel) => 'M16-S07-CLEANUP-MARKER-MISSING-' + _safeSuffix(rel),
  SCRATCH_NOT_MARKER_OWNED: (rel) => 'M16-S07-CLEANUP-SCRATCH-NOT-MARKER-OWNED-' + _safeSuffix(rel),
  PRE_EXISTING_RESIDUE: (rel) => 'M16-S07-CLEANUP-PRE-EXISTING-RESIDUE-' + _safeSuffix(rel),
  POST_RUN_RESIDUE: (rel) => 'M16-S07-CLEANUP-POST-RUN-RESIDUE-' + _safeSuffix(rel),
  ATOMIC_TEMP_NOT_REMOVED: (rel) => 'M16-S07-CLEANUP-ATOMIC-TEMP-NOT-REMOVED-' + _safeSuffix(rel),
  ATOMIC_RENAME_FAILED: (rel) => 'M16-S07-CLEANUP-ATOMIC-RENAME-FAILED-' + _safeSuffix(rel),
  CLEANUP_REFUSED: (rel) => 'M16-S07-CLEANUP-CLEANUP-REFUSED-' + _safeSuffix(rel),
  OVERWRITE_ATTEMPTED: (rel) => 'M16-S07-CLEANUP-OVERWRITE-ATTEMPTED-' + _safeSuffix(rel),
  OVERWRITE_NOT_REFUSED: (rel) => 'M16-S07-CLEANUP-OVERWRITE-NOT-REFUSED-' + _safeSuffix(rel),
  SUBPROCESS_OVERFLOW: (observed) => 'M16-S07-CLEANUP-SUBPROCESS-OVERFLOW-' + _safeSuffix(String(observed)),
  SUBPROCESS_NONE: () => 'M16-S07-CLEANUP-SUBPROCESS-NONE',
  SUBPROCESS_NONZERO_EXIT: (code) => 'M16-S07-CLEANUP-SUBPROCESS-NONZERO-EXIT-' + _safeSuffix(String(code)),
  VERDICT_TRIPLE_DRIFT: (field) => 'M16-S07-CLEANUP-VERDICT-TRIPLE-DRIFT-' + _safeSuffix(field),
  LAUNCH_PROMOTION: (value) => 'M16-S07-CLEANUP-LAUNCH-PROMOTION-' + _safeSuffix(value),
  EVIDENCE_PROMOTION: (value) => 'M16-S07-CLEANUP-EVIDENCE-PROMOTION-' + _safeSuffix(value),
  ORCHESTRATION_DEMOTION: (value) => 'M16-S07-CLEANUP-ORCHESTRATION-DEMOTION-' + _safeSuffix(value),
  SECRET_TOKEN: (where) => 'M16-S07-CLEANUP-SECRET-TOKEN-' + _safeSuffix(where),
  SCHEMA_VIOLATION: (field) => 'M16-S07-CLEANUP-SCHEMA-VIOLATION-' + _safeSuffix(field),
  SEMANTIC_DIGEST_DRIFT: () => 'M16-S07-CLEANUP-SEMANTIC-DIGEST-DRIFT',
  REPRODUCIBILITY_INSUFFICIENT: (observed) => 'M16-S07-CLEANUP-REPRODUCIBILITY-INSUFFICIENT-' + _safeSuffix(String(observed)),
  RESIDUE_PRESENT_BEFORE: (rel) => 'M16-S07-CLEANUP-RESIDUE-PRESENT-BEFORE-' + _safeSuffix(rel),
  VERIFIER_RUNNER_FAILURE: () => 'M16-S07-CLEANUP-RUNNER-FAILURE',
  LIMITS_EXCEEDED: (limit) => 'M16-S07-CLEANUP-LIMITS-EXCEEDED-' + _safeSuffix(limit),
});

const CLEANUP_BLOCKER_CODE_REGEX = new RegExp(CLEANUP_BLOCKER_CODE_PATTERN);

function isCleanupBlockerCode(value) {
  return typeof value === 'string' && CLEANUP_BLOCKER_CODE_REGEX.test(value);
}

// ---------------------------------------------------------------------------
// 9. EXIT_CODES — bounded process exits 0..7 (cross-slice consistency)
// ---------------------------------------------------------------------------

const EXIT_CODES = Object.freeze({
  CLEANUP_PASS: 0,
  CLEANUP_REJECTED_MALFORMED: 1,
  CLEANUP_FAIL_CLOSED: 2,
  CLEANUP_PRECONDITION_DRIFT: 3,
  CLEANUP_LAUNCH_PROMOTION: 4,
  CLEANUP_PROVENANCE_DRIFT: 5,
  CLEANUP_REDACTION_LEAK: 6,
  CLEANUP_RESIDUE_DRIFT: 7,
});

// ---------------------------------------------------------------------------
// 10. SOURCE_ALLOWLIST — frozen inputs the S07 verifier re-reads
// ---------------------------------------------------------------------------

const SOURCE_ALLOWLIST = Object.freeze([
  Object.freeze({
    source_ref: 'schemas/runtime-evidence/m016-s01-evidence-claim.v1.json',
    kind: 's01_schema',
    chain_role: 's01_schema',
    independence_group: 'm016-s01-evidence-claim-schema',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S01-m015-regression-fixture.json',
    kind: 's01_fixture',
    chain_role: 's01_fixture',
    independence_group: 'm016-s01-regression-fixture',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S01-classification-protocol.json',
    kind: 's01_protocol',
    chain_role: 's01_protocol',
    independence_group: 'm016-s01-classification-protocol',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S01-classification-validation.json',
    kind: 's01_validation',
    chain_role: 's01_validation',
    independence_group: 'm016-s01-classification-validation',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S01-classification-verification.json',
    kind: 's01_verification',
    chain_role: 's01_verification',
    independence_group: 'm016-s01-classification-verification',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M015-native-seven-division-mission-20260717.json',
    kind: 'm015_baseline',
    chain_role: 'm015_baseline',
    independence_group: 'm015-native-seven-division',
    required: true,
  }),
]);

const SOURCE_ALLOWLIST_SET = Object.freeze(new Set(SOURCE_ALLOWLIST.map((s) => s.source_ref)));

const REQUIRED_CHAIN_ROLES = Object.freeze(
  SOURCE_ALLOWLIST.filter((entry) => entry.required).map((entry) => entry.chain_role),
);

// Convenience references to the canonical M015 baseline and the S01
// classifier CLI (consumed by the verifier for the exactly-one subprocess
// replay invocation).
const M015_BASELINE_REF = 'runtime-evidence/M015-native-seven-division-mission-20260717.json';
const S01_SCHEMA_REF = 'schemas/runtime-evidence/m016-s01-evidence-claim.v1.json';
const S01_FIXTURE_REF = 'runtime-evidence/M016-S01-m015-regression-fixture.json';
const S01_PROTOCOL_REF = 'runtime-evidence/M016-S01-classification-protocol.json';
const S01_VALIDATION_REF = 'runtime-evidence/M016-S01-classification-validation.json';
const S01_VERIFICATION_REF = 'runtime-evidence/M016-S01-classification-verification.json';

// ---------------------------------------------------------------------------
// 11. DEFAULTS — paths, scratch root, marker, ceilings
// ---------------------------------------------------------------------------

const SCRATCH_ROOT_RELPATH = 'runtime-evidence/.m016-s07-replay-scratch';
const SCRATCH_ROOT_MARKER_RELPATH = SCRATCH_ROOT_RELPATH + '/.m016-s07-replay-marker';
const SCRATCH_ROOT_MARKER_CONTENTS = 'M16-S07-CLEANUP-MARKER';

const MARKER_CONTENTS = SCRATCH_ROOT_MARKER_CONTENTS;

const DEFAULTS = Object.freeze({
  // schema + output paths
  schema_path: 'schemas/runtime-evidence/m016-s07-replay-cleanup-proof.v1.json',
  output_dir: 'runtime-evidence',
  proof_output: 'runtime-evidence/M016-S07-replay-cleanup-proof.json',
  negative_fixtures_output: 'runtime-evidence/M016-S07-replay-cleanup-negative-fixtures.json',
  // scratch + marker
  scratch_root_relpath: SCRATCH_ROOT_RELPATH,
  scratch_root_marker_relpath: SCRATCH_ROOT_MARKER_RELPATH,
  scratch_root_marker_contents: SCRATCH_ROOT_MARKER_CONTENTS,
  marker_contents: MARKER_CONTENTS,
  // S01 classifier CLI used for the exactly-one subprocess replay
  s01_classifier_cli: 'scripts/validate_m016_s01_proof_classification.js',
  // time + ceilings
  reference_time: CLEANUP_REFERENCE_TIME,
  max_cleanup_trace_rows: 16,
  max_blocker_codes: 96,
  max_blocker_reason_chars: 512,
  max_replay_subprocess_invocations: 1,
  max_source_refs: 8,
  max_reproducibility_runs: 4,
  // ids
  replay_cleanup_proof_id: REPLAY_CLEANUP_PROOF_ID,
  replay_cleanup_negative_fixtures_id: REPLAY_CLEANUP_NEGATIVE_FIXTURES_ID,
  // operator gate (NOT used by offline cleanup proof; reserved for parity)
  operator_gate_token: '--confirm-operator-gate-s07',
});

// ---------------------------------------------------------------------------
// 12. PATTERNS — stable regexes used by schema + contract
// ---------------------------------------------------------------------------

const S01_SCHEMA_REF_PATTERN = '^schemas/runtime-evidence/m016-s01-[A-Za-z0-9._/-]+\\.json$';
const S01_RUNTIME_REF_PATTERN = '^runtime-evidence/M016-S01-[A-Za-z0-9._/-]+\\.json$';
const M015_RUNTIME_REF_PATTERN = '^runtime-evidence/M015-[A-Za-z0-9._/-]+\\.json$';
const SCRIPT_REF_PATTERN = '^scripts/[A-Za-z0-9._/-]+\\.js$';
const SCRATCH_RELPATH_PATTERN = '^runtime-evidence/[A-Za-z0-9._/-]+$';
const ATOMIC_TEMP_RELPATH_PATTERN = '^runtime-evidence/[A-Za-z0-9._/-]+\\.tmp-[A-Za-z0-9._-]+$';
const FIXTURE_ID_PATTERN = '^S07-NF-[0-9]{2}$';

// ---------------------------------------------------------------------------
// 13. REDACTION_FLAG_VALUES — re-export from S03 safe probe (shared)
// ---------------------------------------------------------------------------

const CLEANUP_REDACTION_FLAG_VALUES = REDACTION_FLAG_VALUES;

// ---------------------------------------------------------------------------
// 14. Helpers (re-exported)
// ---------------------------------------------------------------------------

// Allowed-source helper: returns true iff the source_ref is one of the
// frozen entries in SOURCE_ALLOWLIST.
function isAllowedSourceRef(value) {
  return typeof value === 'string' && SOURCE_ALLOWLIST_SET.has(value);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // 1. SCHEMA + NAMESPACE
  REPLAY_CLEANUP_SCHEMA_ID,
  REPLAY_CLEANUP_SCHEMA_VERSION,
  REPLAY_CLEANUP_PROOF_ID,
  REPLAY_CLEANUP_PROOF_KIND,
  REPLAY_CLEANUP_NEGATIVE_FIXTURES_ID,
  REPLAY_CLEANUP_NEGATIVE_FIXTURES_KIND,
  PROOF_KINDS,
  PROOF_KINDS_SET,
  isProofKind,
  MILESTONE,
  SLICE,
  TASK,
  TASK_IDS,
  // 2. NAMESPACES
  NAMESPACE,
  VERIFIER_LINE_CLASS,
  VERIFIER_CANONICAL_PROTOCOL,
  CLEANUP_BLOCKER_NAMESPACE,
  CLEANUP_BLOCKER_CODE_PATTERN,
  CLEANUP_REFERENCE_TIME,
  // 3. CLEANUP_PHASES
  CLEANUP_PHASES,
  CLEANUP_PHASES_SET,
  isCleanupPhase,
  // 4. CLEANUP_ACTIONS
  CLEANUP_ACTIONS,
  CLEANUP_ACTIONS_SET,
  isCleanupAction,
  // 5. CLEANUP_OUTCOMES
  CLEANUP_OUTCOMES,
  CLEANUP_OUTCOMES_SET,
  isCleanupOutcome,
  // 6. TRIAD_INVARIANT
  TRIAD_INVARIANT,
  VERDICT_VALUES,
  VERDICT_VALUES_SET,
  isValidVerdictValue,
  isVerdictTriad,
  verdictTriadDriftField,
  // 7. CANONICAL_VERDICT_LINE
  CANONICAL_VERDICT_LINE,
  CANONICAL_VERDICT_LINE_STATUS_VALUES,
  CANONICAL_VERDICT_LINE_STATUS_SET,
  isCanonicalVerdictLineStatus,
  formatCanonicalVerdictLine,
  // 8. BLOCKER_CODES
  BLOCKER_CODES,
  CLEANUP_BLOCKER_CODE_REGEX,
  isCleanupBlockerCode,
  // 9. EXIT_CODES
  EXIT_CODES,
  // 10. SOURCE_ALLOWLIST
  SOURCE_ALLOWLIST,
  SOURCE_ALLOWLIST_SET,
  REQUIRED_CHAIN_ROLES,
  M015_BASELINE_REF,
  S01_SCHEMA_REF,
  S01_FIXTURE_REF,
  S01_PROTOCOL_REF,
  S01_VALIDATION_REF,
  S01_VERIFICATION_REF,
  // 11. DEFAULTS
  DEFAULTS,
  SCRATCH_ROOT_RELPATH,
  SCRATCH_ROOT_MARKER_RELPATH,
  SCRATCH_ROOT_MARKER_CONTENTS,
  MARKER_CONTENTS,
  // 12. PATTERNS
  S01_SCHEMA_REF_PATTERN,
  S01_RUNTIME_REF_PATTERN,
  M015_RUNTIME_REF_PATTERN,
  SCRIPT_REF_PATTERN,
  SCRATCH_RELPATH_PATTERN,
  ATOMIC_TEMP_RELPATH_PATTERN,
  FIXTURE_ID_PATTERN,
  // 13. REDACTION_FLAG_VALUES
  CLEANUP_REDACTION_FLAG_VALUES,
  // 14. helpers
  isAllowedSourceRef,
  _safeSuffix,
};
