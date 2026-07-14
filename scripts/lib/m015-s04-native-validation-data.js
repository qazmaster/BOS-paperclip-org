#!/usr/bin/env node
'use strict';

/**
 * scripts/lib/m015-s04-native-validation-data.js
 *
 * M015-4o8lfw / S04 / T05 — Independent validation constants and labels.
 *
 * Provides:
 *   - VALIDATION_GATE_IDS / VALIDATION_GATE_LABELS  (VG1..VG6)
 *   - BLOCKER_CODES                                  (M15-S04-VALIDATION-*)
 *   - VERDICT_CODES                                  (MISSION_PASS / FAIL_CLOSED_* / VALIDATION_ERROR)
 *   - SAFE_BLOCK_BEARER                              (carry-forward marker from protocol evidence)
 *   - CANONICAL_SCHEMAS                              (acceptable $schema tags for each evidence file)
 *   - REDACTION_XIAOMI_TAG / REDACTION_SYNTHETIC_BOS_TAG
 *
 * The validation contract evaluator and the CLI share these constants.
 */

const VALIDATION_GATE_IDS = Object.freeze([
  'readback_integrity_pass',
  'admission_correlation_pass',
  'zero_business_mutation_ledger_pass',
  'protocol_ledger_correlation_pass',
  'autonomy_and_no_synthetic_bos_pass',
  'safe_block_not_promoted_pass',
]);

const VALIDATION_GATE_LABELS = Object.freeze({
  readback_integrity_pass:
    'VG1 READBACK_INTEGRITY: admission + mission-run + protocol evidence are parseable JSON objects with required top-level keys and matching $schema/version',
  admission_correlation_pass:
    'VG2 ADMISSION_CORRELATION: admission.status, mission-run.admission_summary.status, and protocol.admission_summary.status are equal and internally consistent (blocked ⇔ both subgates false)',
  zero_business_mutation_ledger_pass:
    'VG3 ZERO_BUSINESS_MUTATION_LEDGER: under blocked admission, harness_writes.root_issue_create === 0 and mission_context/intake_summary/root_issue/mission_run are null in raw evidence (independent of harness summary)',
  protocol_ledger_correlation_pass:
    'VG4 PROTOCOL_LEDGER_CORRELATION: protocol.protocol.allowlisted_side_effects and idempotency contract are present; under blocked admission all 10 protocol gates are false and protocol.blockers contains the admission-blocker carry-forward marker',
  autonomy_and_no_synthetic_bos_pass:
    'VG5 AUTONOMY_AND_NO_SYNTHETIC_BOS: redaction layers scrub xiaomi/mimo endpoint reuse and synthetic-bos light tags; no such string appears in any nested value of the raw evidence',
  safe_block_not_promoted_pass:
    'VG6 SAFE_BLOCK_NOT_PROMOTED: when admission is blocked, the verdict is NOT MISSION_PASS; safe-block evidence is recorded as MISSION_FAIL_CLOSED_ADMISSION_BLOCKED with safe_block_declared=true and zero business mutations',
});

const VALIDATION_GATE_ID_SET = new Set(VALIDATION_GATE_IDS);

const BLOCKER_CODES = Object.freeze({
  EVIDENCE_MISSING: (label) => `M15-S04-VALIDATION-EVIDENCE-MISSING-${label}`,
  EVIDENCE_MALFORMED: (label) => `M15-S04-VALIDATION-EVIDENCE-MALFORMED-${label}`,
  SCHEMA_MISMATCH: (label) => `M15-S04-VALIDATION-SCHEMA-MISMATCH-${label}`,
  TOP_LEVEL_KEY_MISSING: (key) => `M15-S04-VALIDATION-TOPLEVEL-KEY-MISSING-${key}`,
  VG1_READBACK_INTEGRITY: 'M15-S04-VALIDATION-VG1-READBACK-INTEGRITY',
  VG2_ADMISSION_CORRELATION: 'M15-S04-VALIDATION-VG2-ADMISSION-CORRELATION',
  VG3_LEDGER_VIOLATION: 'M15-S04-VALIDATION-VG3-LEDGER-VIOLATION',
  VG3_LEDGER_MISSING_FIELDS: 'M15-S04-VALIDATION-VG3-LEDGER-MISSING-FIELDS',
  VG4_PROTOCOL_LEDGER_CORRELATION: 'M15-S04-VALIDATION-VG4-PROTOCOL-LEDGER-CORRELATION',
  VG4_PROTOCOL_ALLOWLIST_MISSING: 'M15-S04-VALIDATION-VG4-PROTOCOL-ALLOWLIST-MISSING',
  VG4_PROTOCOL_NO_ADMISSION_CARRY_FORWARD: 'M15-S04-VALIDATION-VG4-PROTOCOL-NO-ADMISSION-CARRY-FORWARD',
  VG5_AUTONOMY_BREACH: 'M15-S04-VALIDATION-VG5-AUTONOMY-BREACH',
  VG5_XIAOMI_REUSE_DETECTED: 'M15-S04-VALIDATION-VG5-XIAOMI-REUSE-DETECTED',
  VG5_SYNTHETIC_BOS_TAG_DETECTED: 'M15-S04-VALIDATION-VG5-SYNTHETIC-BOS-TAG-DETECTED',
  VG6_PROMOTION_OF_SAFE_BLOCK: 'M15-S04-VALIDATION-VG6-PROMOTION-OF-SAFE-BLOCK',
  VALIDATION_RUNTIME_ERROR: 'M15-S04-VALIDATION-RUNTIME-ERROR',
});

const VERDICT_CODES = Object.freeze({
  MISSION_PASS: 'MISSION_PASS',
  MISSION_FAIL_CLOSED_ADMISSION_BLOCKED: 'MISSION_FAIL_CLOSED_ADMISSION_BLOCKED',
  MISSION_FAIL_CLOSED_LEDGER_VIOLATION: 'MISSION_FAIL_CLOSED_LEDGER_VIOLATION',
  MISSION_FAIL_CLOSED_PROTOCOL_MISMATCH: 'MISSION_FAIL_CLOSED_PROTOCOL_MISMATCH',
  MISSION_FAIL_CLOSED_AUTONOMY_BREACH: 'MISSION_FAIL_CLOSED_AUTONOMY_BREACH',
  MISSION_FAIL_CLOSED: 'MISSION_FAIL_CLOSED',
  MISSION_VALIDATION_ERROR: 'MISSION_VALIDATION_ERROR',
});

const SAFE_BLOCK_BEARER_CODES = Object.freeze([
  'M15-S04-PROTOCOL-ADMISSION-BLOCKER-CARRY-FORWARD',
]);

// Acceptable $schema tags per evidence kind. The validator only checks
// the prefix; full URL match is not required because evidence files are
// project-internal and may evolve schema versions behind a frozen prefix.
const CANONICAL_SCHEMAS = Object.freeze({
  admission: 'https://gsd.local/schemas/runtime-evidence/m015-s04-admission',
  mission_run: 'https://gsd.local/schemas/runtime-evidence/m015-s04-native-mission-run',
  protocol: 'https://gsd.local/schemas/runtime-evidence/m015-s04-native-mission-protocol',
  validation: 'https://gsd.local/schemas/runtime-evidence/m015-s04-native-mission-validation',
});

const REQUIRED_TOP_LEVEL_KEYS = Object.freeze({
  admission: Object.freeze([
    '$schema',
    'milestone',
    'slice',
    'task',
    'generated',
    'status',
    'admission_model',
    'upstream_artifacts',
    'gate_labels',
    'gates',
    'business_mutations_recorded',
    'blockers',
    'redaction',
  ]),
  mission_run: Object.freeze([
    '$schema',
    'milestone',
    'slice',
    'task',
    'generated',
    'status',
    'admission_summary',
    'safe_block_declared',
    'harness_writes',
    'mission_context',
    'intake_summary',
    'root_issue',
    'mission_run',
    'protocol_gates',
    'blockers',
    'observation_budget',
    'redaction',
  ]),
  protocol: Object.freeze([
    '$schema',
    'milestone',
    'slice',
    'task',
    'generated',
    'status',
    'safe_block_declared',
    'admission_summary',
    'protocol',
    'gate_labels',
    'gates',
    'blockers',
    'redaction',
    'paths',
  ]),
});

// Synthetic-bos and xiaomi/mimo marker tag used by redaction layer and
// independently re-detected by the validator. Treated as substring matches;
// canonical string is "synthetic bos light" with a single space.
const REDACTION_SYNTHETIC_BOS_TAG = 'synthetic bos light';
const REDACTION_XIAOMI_TAG_RE = /(?:xiaomi|mimo)/i;

module.exports = {
  VALIDATION_GATE_IDS,
  VALIDATION_GATE_ID_SET,
  VALIDATION_GATE_LABELS,
  BLOCKER_CODES,
  VERDICT_CODES,
  SAFE_BLOCK_BEARER_CODES,
  CANONICAL_SCHEMAS,
  REQUIRED_TOP_LEVEL_KEYS,
  REDACTION_SYNTHETIC_BOS_TAG,
  REDACTION_XIAOMI_TAG_RE,
};