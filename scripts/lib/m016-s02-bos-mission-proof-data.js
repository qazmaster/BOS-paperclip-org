#!/usr/bin/env node
'use strict';

/**
 * scripts/lib/m016-s02-bos-mission-proof-data.js
 *
 * M016-txa3vu / S02 / T01 — Frozen constants for the sanitised sidecar
 * proof bundle contract.
 *
 * Pure-data module. No I/O, no evaluation logic. The contract evaluator
 * (./m016-s02-bos-mission-proof-contract.js) consumes these constants so
 * the heavy lifter stays under the 50KB GSD budget while a single source
 * of truth governs namespace, source kinds, redaction bounds, bundle
 * gates, blocker codes, exit codes, and default paths.
 *
 * Sections:
 *   1. SCHEMA + NAMESPACE        — schema_id, bundle_kind, milestone, slice
 *   2. SOURCE_KINDS              — bounded M015/S01 source kinds
 *   3. REDACTION_FLAG_VALUES     — required boolean values
 *   4. REDACTION_BOUNDS          — UUID/credential/xiaomi/raw markers
 *   5. REDACTION_PLACEHOLDERS    — safe substitution tokens
 *   6. REDACTION_SKIP_KEYS       — keys excluded from leak scanner
 *   7. BUNDLE_GATE_IDS / LABELS  — BG1..BG6 + descriptions
 *   8. BUNDLE_VERDICT_VALUES     — bundle-level verdict vocabulary
 *   9. BLOCKER_CODES             — M16-S02-* namespace
 *  10. EXIT_CODES                — process exit codes by verdict class
 *  11. DEFAULTS                  — paths, ceilings, placeholders
 *  12. MISSION_NAMESPACE         — top-level keys written to outputs
 */

const SCHEMA_ID = 'https://gsd.local/schemas/runtime-evidence/m016-s02-bos-mission-proof.v1.json';
const SCHEMA_VERSION = 'v1';

const BUNDLE_KIND = Object.freeze({ BOS_MISSION_PROOF: 'bos-mission-proof' });
const MILESTONE = 'M016-txa3vu';
const SLICE = 'S02';

const SOURCE_KINDS = Object.freeze([
  'mission_evidence',
  'agent_run',
  'regression_fixture',
  'sidecar_input',
  'classification_protocol',
  'classification_verification',
]);

const SOURCE_KIND_SET = Object.freeze(new Set(SOURCE_KINDS));
const ALLOWED_TASK_IDS = Object.freeze(['T01', 'T02', 'T03']);

const REDACTION_FLAG_VALUES = Object.freeze({
  full_ids: false,
  credentials: false,
  xiaomi_endpoint_reuse: false,
  synthetic_bos: false,
  raw_reasoning: false,
  raw_body: false,
  raw_result_json_result: false,
  vendor_reuse_strings: false,
  bounded_digests_only: true,
  redaction_bounds_loaded: true,
});

const REDACTION_LEAK_KINDS = Object.freeze([
  'uuid',
  'credential_assignment',
  'bearer_token',
  'sk_token',
  'tp_token',
  'xiaomi_marker',
  'vendor_reuse_string',
  'raw_reasoning_marker',
  'raw_body_marker',
  'raw_result_json_result',
]);

const REDACTION_BOUNDS = Object.freeze({
  uuid: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  credential_assignment: /[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|API_KEY)\s*[:=]\s*[A-Za-z0-9._-]+/,
  bearer_token: /\bbearer\s+[A-Za-z0-9._-]+/i,
  sk_token: /\bsk-[A-Za-z0-9._-]+/g,
  tp_token: /\btp-[A-Za-z0-9._-]+/g,
  xiaomi_or_mimo: /\b(?:xiaomi|mimo)\b/i,
  vendor_reuse: /\b(?:hermes\.execution|gsdpi\.execution|plugin\.execution|piko\.execution)\b/i,
  raw_reasoning: /\b(?:reasoning|chain_of_thought|chain-of-thought|thought_process|reasoning_chain)\b/i,
  raw_body: /\b(?:document_body|comment_body|issue_body|message_body|raw_body)\b/i,
  raw_result_json_result: /\bresult_json\.result\b|\"result_json\"\s*:\s*\{\s*\"result\"/,
  bounded_artifact_min_chars: 8,
  bounded_artifact_max_chars: 256,
  bounded_summary_max_chars: 200,
  bounded_digest_max_chars: 256,
  max_source_size_bytes: 67108864,
});

const REDACTION_PLACEHOLDERS = Object.freeze({
  redacted_id_placeholder: '<redacted-id>',
  redacted_credential_placeholder: '<redacted-credential-fragment>',
  redacted_token_placeholder: '<redacted>',
});

const REDACTION_SKIP_KEYS = Object.freeze(new Set([
  '$schema', 'schema_id', 'schema_version', 'milestone', 'slice', 'task',
  'bundle_kind', 'evaluator', 'evaluator_version', 'code', 'reason',
  'claim_id', 'independence_group', 'source_ref', 'kind', 'severity',
  'provenance_hash', 'sidecar_id', 'completed_by', 'raw_sha256',
  'sanitised_sha256', 'sanitised_hash', 'first_run_provenance_hash',
  'second_run_provenance_hash', 'verified_at', 'captured_at',
]));

const BUNDLE_GATE_IDS = Object.freeze([
  'BG1_SCHEMA_COMPLIANCE',
  'BG2_SOURCE_ALLOWLIST',
  'BG3_REDACTION_POSTURE',
  'BG4_PROVENANCE_INTEGRITY',
  'BG5_CLASSIFICATION_FROZEN',
  'BG6_LAUNCH_NOT_PROMOTED',
]);

const BUNDLE_GATE_LABELS = Object.freeze({
  schema_compliance_pass: 'BG1 SCHEMA_COMPLIANCE: bundle matches the M016-S02 bos-mission-proof v1 JSON Schema',
  source_allowlist_pass: 'BG2 SOURCE_ALLOWLIST: every source_ref is inside runtime-evidence/ or scripts/ and in the explicit allowlist',
  redaction_posture_pass: 'BG3 REDACTION_POSTURE: declared flags are all safe and the scanner finds no leak markers anywhere in the bundle',
  provenance_integrity_pass: 'BG4 PROVENANCE_INTEGRITY: every source carries raw_sha256 + sanitised_sha256 + claim_ids; provenance_hash matches the canonical source list',
  classification_frozen_pass: 'BG5 CLASSIFICATION_FROZEN: embedded classification stays orchestration=PASS, evidence=PARTIAL, launch=PREPARATION_ONLY with HG3..HG6 NOT_PROVEN',
  launch_not_promoted_pass: 'BG6 LAUNCH_NOT_PROMOTED: launch dimension never exceeds PREPARATION_ONLY and no embedded classification attempts to promote the bundle to a launch proof',
});

const BUNDLE_VERDICT_VALUES = Object.freeze({
  PROVENANCE_PRESERVED: 'PROVENANCE_PRESERVED',
  REDACTION_SAFE: 'REDACTION_SAFE',
  REPLAY_DETERMINISTIC: 'REPLAY_DETERMINISTIC',
  CLASSIFICATION_FROZEN: 'CLASSIFICATION_FROZEN',
  LAUNCH_NOT_PROMOTED: 'LAUNCH_NOT_PROMOTED',
  NEGATIVE_SUITE_OK: 'NEGATIVE_SUITE_OK',
});

const FORBIDDEN_LAUNCH_VERDICTS = Object.freeze(['GO', 'PASS_AUTOMATIC']);
const REQUIRED_HG_NOT_PROVEN = Object.freeze(['HG3', 'HG4', 'HG5', 'HG6']);

const BLOCKER_CODES = Object.freeze({
  RUNNER_FAILURE: 'M16-S02-BUNDLE-RUNNER-FAILURE',
  BUNDLE_INPUT_MISSING: 'M16-S02-BUNDLE-INPUT-MISSING',
  BUNDLE_INPUT_NOT_OBJECT: 'M16-S02-BUNDLE-INPUT-NOT-OBJECT',
  BUNDLE_SCHEMA_VIOLATION: (field) => `M16-S02-BUNDLE-SCHEMA-VIOLATION-${field}`,
  BUNDLE_SCHEMA_NOT_LOADED: 'M16-S02-BUNDLE-SCHEMA-NOT-LOADED',
  BUNDLE_KIND_INVALID: (kind) => `M16-S02-BUNDLE-KIND-INVALID-${kind || 'undefined'}`,
  BUNDLE_MILESTONE_INVALID: (value) => `M16-S02-BUNDLE-MILESTONE-INVALID-${value || 'undefined'}`,
  BUNDLE_SLICE_INVALID: (value) => `M16-S02-BUNDLE-SLICE-INVALID-${value || 'undefined'}`,
  BUNDLE_TASK_INVALID: (value) => `M16-S02-BUNDLE-TASK-INVALID-${value || 'undefined'}`,
  SOURCE_OUT_OF_ALLOWLIST: (source_ref) => `M16-S02-SOURCE-OUT-OF-ALLOWLIST-${source_ref}`,
  SOURCE_PATH_OUT_OF_BOUND: (source_ref) => `M16-S02-SOURCE-PATH-OUT-OF-BOUND-${source_ref}`,
  SOURCE_KIND_INVALID: (kind) => `M16-S02-SOURCE-KIND-INVALID-${kind || 'undefined'}`,
  SOURCE_RAW_HASH_MISSING: (source_ref) => `M16-S02-SOURCE-RAW-HASH-MISSING-${source_ref}`,
  SOURCE_SANITISED_HASH_MISSING: (source_ref) => `M16-S02-SOURCE-SANITISED-HASH-MISSING-${source_ref}`,
  SOURCE_HASH_MALFORMED: (source_ref) => `M16-S02-SOURCE-HASH-MALFORMED-${source_ref}`,
  SOURCE_HASHES_IDENTICAL: (source_ref) => `M16-S02-SOURCE-HASHES-IDENTICAL-${source_ref}`,
  SOURCE_CLAIM_IDS_MISSING: (source_ref) => `M16-S02-SOURCE-CLAIM-IDS-MISSING-${source_ref}`,
  SOURCE_GROUP_MISSING: (source_ref) => `M16-S02-SOURCE-INDEPENDENCE-GROUP-MISSING-${source_ref}`,
  SOURCE_SIZE_OUT_OF_RANGE: (source_ref) => `M16-S02-SOURCE-SIZE-OUT-OF-RANGE-${source_ref}`,
  SOURCE_DUPLICATE: (source_ref) => `M16-S02-SOURCE-DUPLICATE-${source_ref}`,
  PROVENANCE_HASH_MISMATCH: (observed) => `M16-S02-PROVENANCE-HASH-MISMATCH-${observed}`,
  PROVENANCE_HASH_MALFORMED: 'M16-S02-PROVENANCE-HASH-MALFORMED',
  SIDECAR_ID_MALFORMED: 'M16-S02-SIDECAR-ID-MALFORMED',
  REDACTION_FLAG_INVALID: (flag) => `M16-S02-REDACT-FLAG-INVALID-${flag}`,
  REDACTION_LEAK: (kind, tail) => `M16-S02-REDACT-LEAK-${kind}-${tail}`,
  CLASSIFICATION_DRIFT: (field) => `M16-S02-CLASSIFY-DRIFT-${field}`,
  CLASSIFICATION_HG_FAIL: (gate) => `M16-S02-CLASSIFY-HG-FAIL-${gate}`,
  CLASSIFICATION_VERDICT_FORBIDDEN: (dim, value) => `M16-S02-CLASSIFY-VERDICT-FORBIDDEN-${dim}-${value}`,
  CLASSIFICATION_WORKSHEET_INCOMPLETE: 'M16-S02-CLASSIFY-WORKSHEET-INCOMPLETE',
  LAUNCH_PROMOTION_ATTEMPT: (target) => `M16-S02-LAUNCH-PROMOTION-ATTEMPT-${target}`,
  REPLAY_HASH_MISSING: 'M16-S02-REPLAY-HASH-MISSING',
  REPLAY_HASH_MALFORMED: 'M16-S02-REPLAY-HASH-MALFORMED',
  REPLAY_HASH_MISMATCH: 'M16-S02-REPLAY-HASH-MISMATCH',
  REPLAY_NOT_BYTE_IDENTICAL: 'M16-S02-REPLAY-NOT-BYTE-IDENTICAL',
  REPLAY_FLAG_FALSE: 'M16-S02-REPLAY-FLAG-FALSE',
  ARTIFACT_DIGEST_OUT_OF_BOUND: (source_ref) => `M16-S02-ARTIFACT-DIGEST-OUT-OF-BOUND-${source_ref}`,
  ARTIFACT_DIGEST_CHARSET: (source_ref) => `M16-S02-ARTIFACT-DIGEST-CHARSET-${source_ref}`,
  INDEPENDENCE_GROUPS_DUPLICATE: (group) => `M16-S02-INDEPENDENCE-GROUPS-DUPLICATE-${group}`,
  INDEPENDENCE_GROUPS_MISSING_SOURCE: (group) => `M16-S02-INDEPENDENCE-GROUPS-MISSING-SOURCE-${group}`,
  INDEPENDENCE_GROUPS_UNKNOWN: (group) => `M16-S02-INDEPENDENCE-GROUPS-UNKNOWN-${group}`,
});

const EXIT_CODES = Object.freeze({
  BUNDLE_PASS: 0,
  BUNDLE_REJECTED_MALFORMED: 1,
  BUNDLE_REJECTED_FAIL_CLOSED: 2,
  BUNDLE_CLASSIFICATION_DRIFT: 3,
  BUNDLE_LAUNCH_PROMOTION: 4,
  BUNDLE_REPLAY_DRIFT: 5,
  BUNDLE_REDACTION_LEAK: 6,
  BUNDLE_RUNNER_FAILURE: 7,
});

const DEFAULTS = Object.freeze({
  schema_path: 'schemas/runtime-evidence/m016-s02-bos-mission-proof.v1.json',
  output_dir: 'runtime-evidence',
  bundle_output: 'runtime-evidence/M016-S02-bos-mission-proof.json',
  inventory_output: 'runtime-evidence/M016-S02-input-inventory.json',
  redaction_contract_output: 'runtime-evidence/M016-S02-redaction-contract.json',
  protocol_output: 'runtime-evidence/M016-S02-collect-protocol.json',
  verification_output: 'runtime-evidence/M016-S02-verify-protocol.json',
  validation_output: 'runtime-evidence/M016-S02-validation-evidence.json',
  protocol_schema: 'gsd/m016-s02-bos-mission-proof-protocol-v1',
  verification_schema: 'gsd/m016-s02-bos-mission-proof-verification-v1',
  validation_schema: 'gsd/m016-s02-bos-mission-proof-validation-v1',
  max_source_count: 32,
  max_artifact_count: 64,
  max_summary_chars: 200,
  max_artifact_chars: 256,
});

const MISSION_NAMESPACE = Object.freeze({
  runner_namespace: 'M16-S02',
  schema_id: SCHEMA_ID,
  schema_version: SCHEMA_VERSION,
  bundle_kinds: Object.freeze([BUNDLE_KIND.BOS_MISSION_PROOF]),
  source_kinds: Object.freeze([...SOURCE_KINDS]),
  bundle_gate_ids: Object.freeze([...BUNDLE_GATE_IDS]),
});

module.exports = {
  SCHEMA_ID,
  SCHEMA_VERSION,
  BUNDLE_KIND,
  MILESTONE,
  SLICE,
  SOURCE_KINDS,
  SOURCE_KIND_SET,
  ALLOWED_TASK_IDS,
  REDACTION_FLAG_VALUES,
  REDACTION_BOUNDS,
  REDACTION_PLACEHOLDERS,
  REDACTION_SKIP_KEYS,
  REDACTION_LEAK_KINDS,
  BUNDLE_GATE_IDS,
  BUNDLE_GATE_LABELS,
  BUNDLE_VERDICT_VALUES,
  FORBIDDEN_LAUNCH_VERDICTS,
  REQUIRED_HG_NOT_PROVEN,
  BLOCKER_CODES,
  EXIT_CODES,
  DEFAULTS,
  MISSION_NAMESPACE,
};
