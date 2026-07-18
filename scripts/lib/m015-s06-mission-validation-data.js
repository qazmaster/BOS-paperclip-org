#!/usr/bin/env node
'use strict';

/**
 * scripts/lib/m015-s06-mission-validation-data.js
 *
 * M015-4o8lfw / S06 / T03 — Independent mission contract + readback proof
 * constants and labels.
 *
 * Eight verification gates:
 *   VG1 READBACK_INTEGRITY                — parseable JSON, schema prefix,
 *                                            required top-level keys across
 *                                            preflight + admission + mission-
 *                                            run + po-intake evidence
 *   VG2 PREFLIGHT_CORRELATION             — preflight verdict correlates
 *                                            with mission-run admission
 *                                            status; blocked preflight
 *                                            ⇔ blocked mission-run
 *   VG3 ZERO_BUSINESS_MUTATION_LEDGER     — under blocked preflight, raw
 *                                            mutation fields prove zero
 *                                            mutations independent of
 *                                            harness summary
 *   VG4 PROTOCOL_LEDGER_CORRELATION       — protocol structure present;
 *                                            under blocked preflight all
 *                                            10 protocol gates are false
 *                                            and protocol.blockers
 *                                            carries preflight-blocker
 *                                            marker
 *   VG5 AUTONOMY_AND_NO_SYNTHETIC_BOS     — redaction layers scrub
 *                                            xiaomi/mimo and synthetic
 *                                            bos light markers; no such
 *                                            string appears anywhere in
 *                                            raw evidence
 *   VG6 SAFE_BLOCK_NOT_PROMOTED           — when preflight verdict is
 *                                            blocked, the validation
 *                                            verdict must NOT be
 *                                            MISSION_PASS; safe-block
 *                                            evidence is recorded as
 *                                            MISSION_FAIL_CLOSED_PREFLIGHT_BLOCKED
 *   VG7 ORCHESTRATOR_PROVENANCE           — S05 T02 Option-A orchestrator
 *                                            proves 7/7 invokability via
 *                                            per-agent subprocess
 *                                            isolation with M015_OUR_AGENT_IDS
 *                                            attribution filter (does NOT
 *                                            promote to MISSION_PASS — only
 *                                            proves mission feasibility)
 *   VG8 R026_BOUNDARY_CLASSIFICATION      — any S06 audit-trail records
 *                                            (AIP-27/AIP-28) are
 *                                            classified as R026 boundary
 *                                            diagnostics with
 *                                            business_mutation=false; not
 *                                            mixed with mission business
 *                                            mutations
 */

const VALIDATION_GATE_IDS = Object.freeze([
  'readback_integrity_pass',
  'preflight_correlation_pass',
  'zero_business_mutation_ledger_pass',
  'protocol_ledger_correlation_pass',
  'autonomy_and_no_synthetic_bos_pass',
  'safe_block_not_promoted_pass',
  'orchestrator_provenance_pass',
  'r026_boundary_classification_pass',
]);

const VALIDATION_GATE_LABELS = Object.freeze({
  readback_integrity_pass:
    'VG1 READBACK_INTEGRITY: preflight + admission + mission-run + po-intake evidence are parseable JSON objects with required top-level keys and matching $schema/version',
  preflight_correlation_pass:
    'VG2 PREFLIGHT_CORRELATION: preflight verdict correlates with mission-run admission_summary.status; blocked preflight ⇔ mission-run admission blocked; do_not_promote flags propagate consistently',
  zero_business_mutation_ledger_pass:
    'VG3 ZERO_BUSINESS_MUTATION_LEDGER: under blocked preflight, harness_writes.root_issue_create === 0 and mission_context/intake_summary/root_issue/mission_run are null in raw evidence (independent of harness summary)',
  protocol_ledger_correlation_pass:
    'VG4 PROTOCOL_LEDGER_CORRELATION: protocol.protocol.allowlisted_side_effects and idempotency contract are present; under blocked preflight all 10 protocol gates are false and protocol.blockers contains the preflight-blocker carry-forward marker',
  autonomy_and_no_synthetic_bos_pass:
    'VG5 AUTONOMY_AND_NO_SYNTHETIC_BOS: redaction layers scrub xiaomi/mimo endpoint reuse and synthetic-bos light tags; no such string appears in any nested value of the raw S06 evidence (preflight, mission-run, po-intake, protocol)',
  safe_block_not_promoted_pass:
    'VG6 SAFE_BLOCK_NOT_PROMOTED: when preflight verdict is blocked, the validation verdict is NOT MISSION_PASS; safe-block evidence is recorded as MISSION_FAIL_CLOSED_PREFLIGHT_BLOCKED with safe_block_declared=true and zero business mutations',
  orchestrator_provenance_pass:
    'VG7 ORCHESTRATOR_PROVENANCE: S05 T02 Option-A orchestrator proves 7/7 canonical agent invokability via per-agent subprocess isolation with M015_OUR_AGENT_IDS attribution filter (does NOT promote to MISSION_PASS — only proves mission feasibility)',
  r026_boundary_classification_pass:
    'VG8 R026_BOUNDARY_CLASSIFICATION: any S06 audit-trail records (AIP-27/AIP-28) are classified as R026 boundary diagnostics with business_mutation=false; not mixed with mission business mutations; not counted in business_mutations_recorded',
});

const VALIDATION_GATE_ID_SET = new Set(VALIDATION_GATE_IDS);

const BLOCKER_CODES = Object.freeze({
  EVIDENCE_MISSING: (label) => `M15-S06-VALIDATION-EVIDENCE-MISSING-${label}`,
  EVIDENCE_MALFORMED: (label) => `M15-S06-VALIDATION-EVIDENCE-MALFORMED-${label}`,
  SCHEMA_MISMATCH: (label) => `M15-S06-VALIDATION-SCHEMA-MISMATCH-${label}`,
  TOP_LEVEL_KEY_MISSING: (key) => `M15-S06-VALIDATION-TOPLEVEL-KEY-MISSING-${key}`,
  VG1_READBACK_INTEGRITY: 'M15-S06-VALIDATION-VG1-READBACK-INTEGRITY',
  VG2_PREFLIGHT_CORRELATION: 'M15-S06-VALIDATION-VG2-PREFLIGHT-CORRELATION',
  VG3_LEDGER_VIOLATION: 'M15-S06-VALIDATION-VG3-LEDGER-VIOLATION',
  VG3_LEDGER_MISSING_FIELDS: 'M15-S06-VALIDATION-VG3-LEDGER-MISSING-FIELDS',
  VG4_PROTOCOL_LEDGER_CORRELATION: 'M15-S06-VALIDATION-VG4-PROTOCOL-LEDGER-CORRELATION',
  VG4_PROTOCOL_ALLOWLIST_MISSING: 'M15-S06-VALIDATION-VG4-PROTOCOL-ALLOWLIST-MISSING',
  VG4_PROTOCOL_NO_PREFLIGHT_CARRY_FORWARD: 'M15-S06-VALIDATION-VG4-PROTOCOL-NO-PREFLIGHT-CARRY-FORWARD',
  VG5_AUTONOMY_BREACH: 'M15-S06-VALIDATION-VG5-AUTONOMY-BREACH',
  VG5_XIAOMI_REUSE_DETECTED: 'M15-S06-VALIDATION-VG5-XIAOMI-REUSE-DETECTED',
  VG5_SYNTHETIC_BOS_TAG_DETECTED: 'M15-S06-VALIDATION-VG5-SYNTHETIC-BOS-TAG-DETECTED',
  VG6_PROMOTION_OF_SAFE_BLOCK: 'M15-S06-VALIDATION-VG6-PROMOTION-OF-SAFE-BLOCK',
  VG7_ORCHESTRATOR_MISSING: 'M15-S06-VALIDATION-VG7-ORCHESTRATOR-MISSING',
  VG7_ORCHESTRATOR_NOT_7_OF_7: 'M15-S06-VALIDATION-VG7-ORCHESTRATOR-NOT-7-OF-7',
  VG7_ORCHESTRATOR_WRONG_PATTERN: 'M15-S06-VALIDATION-VG7-ORCHESTRATOR-WRONG-PATTERN',
  VG7_ORCHESTRATOR_NO_ATTRIBUTION_FILTER: 'M15-S06-VALIDATION-VG7-ORCHESTRATOR-NO-ATTRIBUTION-FILTER',
  VG8_R026_BOUNDARY_VIOLATION: 'M15-S06-VALIDATION-VG8-R026-BOUNDARY-VIOLATION',
  VG8_R026_RECORD_MISCLASSIFIED: 'M15-S06-VALIDATION-VG8-R026-RECORD-MISCLASSIFIED',
  VG8_R026_BUSINESS_MUTATION_MIX: 'M15-S06-VALIDATION-VG8-R026-BUSINESS-MUTATION-MIX',
  VALIDATION_RUNTIME_ERROR: 'M15-S06-VALIDATION-RUNTIME-ERROR',
});

const VERDICT_CODES = Object.freeze({
  MISSION_PASS: 'MISSION_PASS',
  MISSION_FAIL_CLOSED_PREFLIGHT_BLOCKED: 'MISSION_FAIL_CLOSED_PREFLIGHT_BLOCKED',
  MISSION_FAIL_CLOSED_LEDGER_VIOLATION: 'MISSION_FAIL_CLOSED_LEDGER_VIOLATION',
  MISSION_FAIL_CLOSED_PROTOCOL_MISMATCH: 'MISSION_FAIL_CLOSED_PROTOCOL_MISMATCH',
  MISSION_FAIL_CLOSED_AUTONOMY_BREACH: 'MISSION_FAIL_CLOSED_AUTONOMY_BREACH',
  MISSION_FAIL_CLOSED_ORCHESTRATOR_INVALID: 'MISSION_FAIL_CLOSED_ORCHESTRATOR_INVALID',
  MISSION_FAIL_CLOSED_R026_MISCLASSIFICATION: 'MISSION_FAIL_CLOSED_R026_MISCLASSIFICATION',
  MISSION_FAIL_CLOSED: 'MISSION_FAIL_CLOSED',
  MISSION_VALIDATION_ERROR: 'MISSION_VALIDATION_ERROR',
});

// Carry-forward markers reused from protocol/S04 evidence. The protocol
// blockers list must contain at least one of these to evidence the
// upstream block under a "carry-forward" pattern. The names are
// intentionally stable so cross-slice auditors can grep them.
const SAFE_BLOCK_BEARER_CODES = Object.freeze([
  'M15-S04-PROTOCOL-ADMISSION-BLOCKER-CARRY-FORWARD',
  'M15-S06-MISSION-PLAN-BLOCKED-UPSTREAM',
  'M15-S06-PREFLIGHT-LIVE-RUNTIME-UNREACHABLE',
  'M15-S06-PREFLIGHT-LIVE-RUNTIME-DRIFT',
  'M15-S06-PREFLIGHT-NO-DO-NOT-PROMOTE-S04',
  'M15-S06-PREFLIGHT-S05-DISPOSITION-NOT-ADMITTED',
  'M15-S06-PREFLIGHT-LEAK-DETECTED',
  'M15-S06-PREFLIGHT-BASELINE-SNAPSHOT-FAILED',
  'M15-S06-PREFLIGHT-SELF-MUTATION-DETECTED',
]);

const ORCHESTRATOR_PATTERN = 'per-agent-isolated-sequential-subprocess';
const ORCHESTRATOR_ATTRIBUTION_FILTER = 'M015_OUR_AGENT_IDS';
const EXPECTED_AGENT_COUNT = 7;
const EXPECTED_RUN_COUNT = 7;

// Acceptable $schema tags per evidence kind. The validator only checks
// the prefix; full URL match is not required because evidence files are
// project-internal and may evolve schema versions behind a frozen prefix.
const CANONICAL_SCHEMAS = Object.freeze({
  preflight: 'https://gsd.local/schemas/runtime-evidence/m015-s06-preflight',
  admission: 'https://gsd.local/schemas/runtime-evidence/m015-s04-admission',
  mission_run: 'https://gsd.local/schemas/runtime-evidence/m015-s06-native-mission-run',
  po_intake: 'https://gsd.local/schemas/runtime-evidence/m015-s06-po-intake',
  protocol: 'https://gsd.local/schemas/runtime-evidence/m015-s06-native-mission-protocol',
  verification: 'https://gsd.local/schemas/runtime-evidence/m015-s06-native-mission-verification',
  validation: 'https://gsd.local/schemas/runtime-evidence/m015-s06-native-mission-validation',
  orchestrator: 'https://gsd.local/schemas/runtime-evidence/m015-s03-seven-agent-diagnostic-runs',
});

const REQUIRED_TOP_LEVEL_KEYS = Object.freeze({
  preflight: Object.freeze([
    '$schema',
    'milestone',
    'slice',
    'task',
    'generated',
    'verdict',
    'canonical_verdict',
    'preflight_model',
    'upstream_artifacts',
    'gate_labels',
    'gates',
    'business_mutations_recorded',
    'do_not_promote_s04',
    'blockers',
    'redaction',
    'canonical_verdict_line',
  ]),
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
    's06_provenance',
  ]),
  po_intake: Object.freeze([
    '$schema',
    'milestone',
    'slice',
    'task',
    'generated',
    'mission_key',
    'idempotency_key',
    'recovery_lock',
    'title',
    'description',
    'confirmation',
    'desired_assignee',
    'desired_outcome',
    'priority',
    'parent_issue_id',
  ]),
  protocol: Object.freeze([
    '$schema',
    'milestone',
    'slice',
    'task',
    'generated',
    'status',
    'safe_block_declared',
    'preflight_correlation',
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

// Roles reserved for the R026 audit-trail / boundary diagnostic records.
// These are NOT business mutations and MUST NOT contribute to
// business_mutations_recorded or appear in canonical mutation fields.
const R026_BOUNDARY_KINDS = Object.freeze([
  'audit_trail_record',
  'boundary_diagnostic',
  'r026_diagnostic',
]);

module.exports = {
  VALIDATION_GATE_IDS,
  VALIDATION_GATE_ID_SET,
  VALIDATION_GATE_LABELS,
  BLOCKER_CODES,
  VERDICT_CODES,
  SAFE_BLOCK_BEARER_CODES,
  ORCHESTRATOR_PATTERN,
  ORCHESTRATOR_ATTRIBUTION_FILTER,
  EXPECTED_AGENT_COUNT,
  EXPECTED_RUN_COUNT,
  CANONICAL_SCHEMAS,
  REQUIRED_TOP_LEVEL_KEYS,
  REDACTION_SYNTHETIC_BOS_TAG,
  REDACTION_XIAOMI_TAG_RE,
  R026_BOUNDARY_KINDS,
};
