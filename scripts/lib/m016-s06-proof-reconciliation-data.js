#!/usr/bin/env node
'use strict';

/**
 * scripts/lib/m016-s06-proof-reconciliation-data.js
 *
 * M016-txa3vu / S06 / T01 — Frozen registry and constants for the proof
 * reconciliation / replay gate. Pure-data module: no I/O, no evaluation
 * logic, no subprocesses, no network. T01 consumers:
 *
 *   - m016-s06-proof-reconciliation-contract.js (T01 helper logic)
 *   - verify_m016_s06_proof_reconciliation.js (T02 verifier entrypoint)
 *   - test_m016_s06_proof_reconciliation_schema.js (T04)
 *   - m016-s06-product-report-helpers.js (T03)
 *
 * Single source of truth for:
 *
 *   1.  SCHEMA + NAMESPACE           — reconciliation + capability-ledger
 *                                       schema ids, schema_version, milestone
 *                                       and slice
 *   2.  NAMESPACES                   — verifier line class
 *                                       (`M16-S06-RECONCILE`),
 *                                       canonical protocol token,
 *                                       block pattern
 *   3.  CRITERION_MAPPING            — frozen M015 → M016 criterion rows
 *                                       (9 criteria) with pass-through rules
 *   4.  CAPABILITY_ACTION_ENUM       — keep | update_fallback |
 *                                       update_blocker | drop
 *   5.  CAPABILITY_STATUS_ENUM       — confirmed | unvalidated |
 *                                       fallback-only | unsupported
 *   6.  RECOMMENDATION_VALUES        — frozen
 *                                       `plugin-owned proof integration,
 *                                       deferred-unvalidated` and
 *                                       `adapter-native proof integration,
 *                                       deferred-unvalidated`
 *   7.  BLOCKER_CODES                — factory functions with stable
 *                                       namespace `M16-S06-RECONCILE-*`
 *   8.  EXIT_CODES                   — process exit codes 0..8 (mirrors
 *                                       S05 mapping family for consistency)
 *   9.  VERDICT_VALUES               — orchestration/evidence
 *                                       (PASS|PARTIAL|NOT_PROVEN) plus
 *                                       launch (PREPARATION_ONLY|NO_GO)
 *  10.  SOURCE_ALLOWLIST             — frozen inputs the verifier reads:
 *                                       M015 baseline, M016 S02 proof,
 *                                       M016 S05 bundle / worksheet /
 *                                       verify-protocol / producer-protocol
 *                                       / probe-run / admission /
 *                                       input-inventory, capability ledger
 *                                       (plugin-bos-light), plus M016
 *                                       S01..S04 auxiliary sidecars
 *  11.  DEFAULTS                     — schema paths, output paths, scratch
 *                                       root, operator gate token, fixed
 *                                       bounded ceilings
 *  12.  CAPABILITY_LEDGER_REL_PATH   — canonical external capability ledger
 *                                       path that the verifier reads
 *  13.  REDACTION_FLAG_VALUES        — re-used safe redaction posture
 *  14.  Identifier patterns          — CRITERION_ID_PATTERN, CAPABILITY_KEY,
 *                                       RECOMMENDATION_TEXT, SOURCE_REF
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

const RECONCILIATION_SCHEMA_ID = 'https://gsd.local/schemas/runtime-evidence/m016-s06-proof-reconciliation.v1.json';
const RECONCILIATION_SCHEMA_VERSION = 'v1';

const CAPABILITY_LEDGER_SCHEMA_ID = 'https://gsd.local/schemas/runtime-evidence/m016-s06-capability-action-ledger.v1.json';
const CAPABILITY_LEDGER_SCHEMA_VERSION = 'v1';

const MILESTONE = 'M016-txa3vu';
const SLICE = 'S06';
const TASK = 'T01';
const TASK_IDS = Object.freeze(['T01', 'T02', 'T03', 'T04']);

const RECONCILIATION_ID = 'm016-s06-proof-reconciliation-v1';
const RECONCILIATION_KIND = 'proof-reconciliation';

const CAPABILITY_LEDGER_ID = 'm016-s06-capability-action-ledger-v1';
const CAPABILITY_LEDGER_KIND = 'capability-action-ledger';

const VERIFIER_TASK_ID = 'T02';
const REPORT_TASK_ID = 'T03';

// ---------------------------------------------------------------------------
// 2. NAMESPACES
// ---------------------------------------------------------------------------

const NAMESPACE = 'M16-S06';
const VERIFIER_LINE_CLASS = 'M16-S06-RECONCILE';
const PRODUCER_FORBIDDEN_LINE_CLASS = 'M16-S06-PROMOTE';

const VERIFIER_CANONICAL_PROTOCOL = 'PROTOCOL-M16-S06-RECONCILE-V1';

const RECONCILE_BLOCKER_NAMESPACE = 'M16-S06-RECONCILE';
const RECONCILE_BLOCKER_CODE_PATTERN = '^M16-S06-RECONCILE-[A-Za-z0-9._-]+$';

// Reference time used when canonical inputs emit no timestamp override.
const RECONCILE_REFERENCE_TIME = '2026-07-21T12:00:00.000Z';

// ---------------------------------------------------------------------------
// 3. CRITERION_MAPPING — frozen M015 → M016 rows (9 criteria)
//
// Each criterion row carries:
//   criterion_id            — frozen `<m015_field>` row pattern
//   label                   — human-readable
//   m015_field              — exact dotted JSON path inside
//                             `verdict` of the M015 baseline
//   m015_expected_state     — semantic enum mapping (PROVEN | NOT_PROVEN |
//                             NOT_REQUIRED)
//   m016_required_back_refs — minimum count of independent M016 source_refs
//                             that must exist for pass-through=true to be
//                             valid (independent of M015 itself)
//   m015_verdict_value_refs — frozen list of source_refs where M015's
//                             verdict text was observed
//   pass_through_rule_text  — short rule summary for product reports
// ---------------------------------------------------------------------------

const M015_VERDICT_FIELD_VALUES = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  NOT_PROVEN_MISSING_RESULT_JSON_BOS: 'NOT_PROVEN_MISSING_RESULT_JSON_BOS',
  BOOLEAN_TRUE: true,
  BOOLEAN_FALSE: false,
});

const M015_CRITERION_MAPPING = Object.freeze([
  Object.freeze({
    criterion_id: 'M16-S06-CRITERION-NATIVE-PAPERCLIP-MISSION',
    label: 'Native Paperclip Mission',
    m015_field: 'verdict.native_paperclip_mission',
    m015_expected_state: 'PROVEN',
    m016_required_back_refs: 0,
    m015_verdict_value_refs: Object.freeze([
      'runtime-evidence/M015-native-seven-division-mission-20260717.json',
    ]),
    pass_through_rule_text:
      'M015 verdict + M016 S02 bos-mission-proof re-derivation must both confirm native mission posture; pass-through is allowed only when both match.',
  }),
  Object.freeze({
    criterion_id: 'M16-S06-CRITERION-SEVEN-DIVISION-EXECUTION',
    label: 'Seven Division Execution',
    m015_field: 'verdict.seven_division_execution',
    m015_expected_state: 'PROVEN',
    m016_required_back_refs: 1,
    m015_verdict_value_refs: Object.freeze([
      'runtime-evidence/M015-native-seven-division-mission-20260717.json',
      'runtime-evidence/M016-S05-seven-division-replay-bundle.json',
    ]),
    pass_through_rule_text:
      'Seven-division execution requires at least one independent M016 replay bundle source_ref besides M015 itself.',
  }),
  Object.freeze({
    criterion_id: 'M16-S06-CRITERION-USEFUL-ARTIFACT-GENERATION',
    label: 'Useful Artifact Generation',
    m015_field: 'verdict.useful_artifact_generation',
    m015_expected_state: 'PROVEN',
    m016_required_back_refs: 1,
    m015_verdict_value_refs: Object.freeze([
      'runtime-evidence/M015-native-seven-division-mission-20260717.json',
      'runtime-evidence/M016-S02-bos-mission-proof.json',
    ]),
    pass_through_rule_text:
      'Useful artifact generation requires the S02 bos-mission-proof bundle to bound seven mission documents.',
  }),
  Object.freeze({
    criterion_id: 'M16-S06-CRITERION-DEPENDENCY-ORCHESTRATION',
    label: 'Dependency Orchestration',
    m015_field: 'verdict.dependency_orchestration',
    m015_expected_state: 'PROVEN',
    m016_required_back_refs: 1,
    m015_verdict_value_refs: Object.freeze([
      'runtime-evidence/M015-native-seven-division-mission-20260717.json',
      'runtime-evidence/M016-S05-seven-division-replay-bundle.json',
    ]),
    pass_through_rule_text:
      'Dependency orchestration requires fresh S05 replay bundle evidence beyond M015 self-reference.',
  }),
  Object.freeze({
    criterion_id: 'M16-S06-CRITERION-FINAL-MISSION-CONTROL-REVIEW',
    label: 'Final Mission Control Review',
    m015_field: 'verdict.final_mission_control_review',
    m015_expected_state: 'PROVEN',
    m016_required_back_refs: 1,
    m015_verdict_value_refs: Object.freeze([
      'runtime-evidence/M015-native-seven-division-mission-20260717.json',
      'runtime-evidence/M016-S02-bos-mission-proof.json',
    ]),
    pass_through_rule_text:
      'Final Div7 review requires S02 proof plus an explicit dependency_behavior correlation reference.',
  }),
  Object.freeze({
    criterion_id: 'M16-S06-CRITERION-ZERO-OUT-OF-SCOPE-MUTATIONS',
    label: 'Zero Out-Of-Scope Business Mutations',
    m015_field: 'verdict.zero_out_of_scope_business_mutations',
    m015_expected_state: 'PROVEN',
    m016_required_back_refs: 1,
    m015_verdict_value_refs: Object.freeze([
      'runtime-evidence/M015-native-seven-division-mission-20260717.json',
      'runtime-evidence/M016-S03-safe-operational-evidence-pack.json',
    ]),
    pass_through_rule_text:
      'Zero out-of-scope mutations requires S03 safe operational evidence pack isolation invariant beside M015.',
  }),
  Object.freeze({
    criterion_id: 'M16-S06-CRITERION-BOS-PLUGIN-REQUIRED',
    label: 'Bos Plugin Required',
    m015_field: 'verdict.bos_plugin_required',
    m015_expected_state: 'NOT_REQUIRED',
    m016_required_back_refs: 1,
    m015_verdict_value_refs: Object.freeze([
      'runtime-evidence/M015-native-seven-division-mission-20260717.json',
      'runtime-evidence/M016-S05-seven-division-replay-verify-protocol.json',
    ]),
    pass_through_rule_text:
      'bos_plugin_required must remain false; promotion to "true" via pass-through must NEVER happen (fail-closed).',
  }),
  Object.freeze({
    criterion_id: 'M16-S06-CRITERION-RESULT-JSON-BOS-REQUIRED',
    label: 'Result JSON BOS Required For Execution',
    m015_field: 'verdict.result_json_bos_required_for_execution',
    m015_expected_state: 'NOT_REQUIRED',
    m016_required_back_refs: 1,
    m015_verdict_value_refs: Object.freeze([
      'runtime-evidence/M015-native-seven-division-mission-20260717.json',
      'runtime-evidence/M016-S05-seven-division-replay-verify-protocol.json',
    ]),
    pass_through_rule_text:
      'result_json_bos_required_for_execution must remain false; promotion would re-open M016 launch gate.',
  }),
  Object.freeze({
    criterion_id: 'M16-S06-CRITERION-BOS-GRADE-CONTRACT-PROOF',
    label: 'Bos Grade Contract Proof',
    m015_field: 'verdict.bos_grade_contract_proof',
    m015_expected_state: 'NOT_PROVEN',
    m016_required_back_refs: 0,
    m015_verdict_value_refs: Object.freeze([
      'runtime-evidence/M015-native-seven-division-mission-20260717.json',
      'runtime-evidence/M016-S05-seven-division-replay-verify-protocol.json',
    ]),
    pass_through_rule_text:
      'bos_grade_contract_proof stays NOT_PROVEN_MISSING_RESULT_JSON_BOS; no M016 evidence may promote this row.',
  }),
]);

const CRITERION_MAPPING_SET = Object.freeze(new Set(M015_CRITERION_MAPPING.map((row) => row.criterion_id)));

function isKnownCriterion(value) {
  return CRITERION_MAPPING_SET.has(value);
}

// Maximum criteria rows in the canonical reconciliation sidecar.
const MAX_CRITERION_ROWS = M015_CRITERION_MAPPING.length;

// ---------------------------------------------------------------------------
// 4. CAPABILITY_ACTION_ENUM — keep | update_fallback | update_blocker | drop
// ---------------------------------------------------------------------------

const CAPABILITY_ACTIONS = Object.freeze({
  KEEP: 'keep',
  UPDATE_FALLBACK: 'update_fallback',
  UPDATE_BLOCKER: 'update_blocker',
  DROP: 'drop',
});

const CAPABILITY_ACTIONS_SET = Object.freeze(new Set(Object.values(CAPABILITY_ACTIONS)));

function isCapabilityAction(value) {
  return CAPABILITY_ACTIONS_SET.has(value);
}

// ---------------------------------------------------------------------------
// 5. CAPABILITY_STATUS_ENUM — confirmed | unvalidated | fallback-only |
//    unsupported
// ---------------------------------------------------------------------------

const CAPABILITY_STATUSES = Object.freeze({
  CONFIRMED: 'confirmed',
  UNVALIDATED: 'unvalidated',
  FALLBACK_ONLY: 'fallback-only',
  UNSUPPORTED: 'unsupported',
});

const CAPABILITY_STATUSES_SET = Object.freeze(new Set(Object.values(CAPABILITY_STATUSES)));

function isCapabilityStatus(value) {
  return CAPABILITY_STATUSES_SET.has(value);
}

// Promotable surfaces forbidden from promotion in M016/S06: any pre_status in
// this set MUST NOT move to "confirmed" without an explicit independent
// M016 source_ref beyond M015 itself (which has none for these surfaces).
// The list mirrors the M015 guardrail + capability ledger guardrail.
const FORBIDDEN_PROMOTION_SURFACES = Object.freeze([
  'registration.tools',
  'registration.data',
  'registration.actions',
  'state.company_scoped',
  'state.issue_scoped',
  'entities.api',
  'activity.logging',
  'events.issue_lifecycle',
  'events.terminal_runs',
  'config.api',
  'ui.dashboard_widgets',
  'ui.issue_detail_tabs',
  'hermes.execution.xiaomi',
  'workflow.mission_intake',
  'workflow.hitl_gates',
  'workflow.branch_policy',
  'workflow.qa_review',
  'git.local_cli',
  'state.hybrid_persistence',
  'plugin.runtime.registration',
  'approvals.native',
  'company_template.import_export',
  'agents.syntax',
]);

const FORBIDDEN_PROMOTION_SURFACES_SET = Object.freeze(new Set(FORBIDDEN_PROMOTION_SURFACES));

// ---------------------------------------------------------------------------
// 6. RECOMMENDATION_VALUES — frozen language strings
// ---------------------------------------------------------------------------

const RECOMMENDATION_VALUES = Object.freeze({
  PLUGIN_OWNED_DEFERRED_UNVALIDATED: 'plugin-owned proof integration, deferred-unvalidated',
  ADAPTER_NATIVE_DEFERRED_UNVALIDATED: 'adapter-native proof integration, deferred-unvalidated',
});

const RECOMMENDATION_VALUES_SET = Object.freeze(new Set(Object.values(RECOMMENDATION_VALUES)));

function isRecommendationValue(value) {
  return RECOMMENDATION_VALUES_SET.has(value);
}

// ---------------------------------------------------------------------------
// 7. BLOCKER_CODES — factory functions for S06 reconciliation blocker codes
// ---------------------------------------------------------------------------

const BLOCKER_CODES = Object.freeze({
  PRECONDITION_MISSING: (kind) => 'M16-S06-RECONCILE-PRECONDITION-MISSING-' + _safeSuffix(kind),
  FRESH_HASH_DRIFT: (expected, actual) => 'M16-S06-RECONCILE-FRESH-HASH-DRIFT-' + _safeSuffix(expected) + '-' + _safeSuffix(actual),
  S05_VERIFIER_NOT_FOUND: (path) => 'M16-S06-RECONCILE-S05-VERIFIER-NOT-FOUND-' + _safeSuffix(path),
  S05_VERIFIER_NONZERO_EXIT: (code) => 'M16-S06-RECONCILE-S05-VERIFIER-NONZERO-EXIT-' + _safeSuffix(String(code)),
  S05_VERIFIER_PRODUCER_CLI_IMPORTED: () => 'M16-S06-RECONCILE-S05-VERIFIER-PRODUCER-CLI-IMPORTED',
  S05_VERIFIER_NETWORK_CALLS: (observed) => 'M16-S06-RECONCILE-S05-VERIFIER-NETWORK-CALLS-' + _safeSuffix(String(observed)),
  S05_VERIFIER_MUTATIONS: (observed) => 'M16-S06-RECONCILE-S05-VERIFIER-MUTATIONS-' + _safeSuffix(String(observed)),
  S05_VERIFIER_BLOCKERS: (count) => 'M16-S06-RECONCILE-S05-VERIFIER-BLOCKERS-' + _safeSuffix(String(count)),
  S05_VERIFIER_REPLAY_KEY_MISMATCH: (kind) => 'M16-S06-RECONCILE-S05-VERIFIER-REPLAY-KEY-MISMATCH-' + _safeSuffix(kind),
  S05_VERDICT_DRIFT: (field) => 'M16-S06-RECONCILE-S05-VERDICT-DRIFT-' + _safeSuffix(field),
  CRITERION_PASS_THROUGH: (criterion) => 'M16-S06-RECONCILE-CRITERION-PASS-THROUGH-' + _safeSuffix(criterion),
  SOURCE_HASH_DRIFT: (chain) => 'M16-S06-RECONCILE-SOURCE-HASH-DRIFT-' + _safeSuffix(chain),
  CAPABILITY_ILLEGAL_PROMOTION: (key) => 'M16-S06-RECONCILE-CAPABILITY-ILLEGAL-PROMOTION-' + _safeSuffix(key),
  CAPABILITY_SOURCE_REF_MISSING: (key) => 'M16-S06-RECONCILE-CAPABILITY-SOURCE-REF-MISSING-' + _safeSuffix(key),
  CAPABILITY_ACTION_INVALID: (key, action) => 'M16-S06-RECONCILE-CAPABILITY-ACTION-INVALID-' + _safeSuffix(key) + '-' + _safeSuffix(action),
  CAPABILITY_CONFIDENCE_OUT_OF_RANGE: (key, value) => 'M16-S06-RECONCILE-CAPABILITY-CONFIDENCE-OUT-OF-RANGE-' + _safeSuffix(key) + '-' + _safeSuffix(String(value)),
  RECOMMENDATION_UNSUPPORTED: (rec) => 'M16-S06-RECONCILE-RECOMMENDATION-UNSUPPORTED-' + _safeSuffix(rec),
  RECOMMENDATION_MISSING: () => 'M16-S06-RECONCILE-RECOMMENDATION-MISSING',
  PATH_TRAVERSAL: (path) => 'M16-S06-RECONCILE-PATH-TRAVERSAL-' + _safeSuffix(path),
  SECRET_TOKEN: (where) => 'M16-S06-RECONCILE-SECRET-TOKEN-' + _safeSuffix(where),
  SCHEDULE_DUPLICATE: (key) => 'M16-S06-RECONCILE-SCHEDULE-DUPLICATE-' + _safeSuffix(key),
  SCHEMA_VIOLATION: (field) => 'M16-S06-RECONCILE-SCHEMA-VIOLATION-' + _safeSuffix(field),
  LIMITS_EXCEEDED: (limit) => 'M16-S06-RECONCILE-LIMITS-EXCEEDED-' + _safeSuffix(limit),
  VERIFIER_RUNNER_FAILURE: () => 'M16-S06-RECONCILE-RUNNER-FAILURE',
});

const RECONCILE_BLOCKER_CODE_REGEX = new RegExp(RECONCILE_BLOCKER_CODE_PATTERN);

function isReconcileBlockerCode(value) {
  return typeof value === 'string' && RECONCILE_BLOCKER_CODE_REGEX.test(value);
}

// ---------------------------------------------------------------------------
// 8. EXIT_CODES — process exit codes 0..8 (kept consistent with S05 family)
// ---------------------------------------------------------------------------

const EXIT_CODES = Object.freeze({
  RECONCILE_PASS: 0,
  RECONCILE_REJECTED_MALFORMED: 1,
  RECONCILE_REJECTED_FAIL_CLOSED: 2,
  RECONCILE_PRECONDITION_DRIFT: 3,
  RECONCILE_LAUNCH_PROMOTION: 4,
  RECONCILE_PROVENANCE_DRIFT: 5,
  RECONCILE_REDACTION_LEAK: 6,
  RECONCILE_REPLAY_DRIFT: 7,
  RECONCILE_RUNNER_FAILURE: 8,
});

// ---------------------------------------------------------------------------
// 9. VERDICT_VALUES — orchestration/evidence/launch vocabulary
// ---------------------------------------------------------------------------

const VERDICT_VALUES = Object.freeze({
  PASS: 'PASS',
  PARTIAL: 'PARTIAL',
  NOT_PROVEN: 'NOT_PROVEN',
  PREPARATION_ONLY: 'PREPARATION_ONLY',
  NO_GO: 'NO_GO',
});

const VERDICT_VALUES_SET = Object.freeze(new Set(Object.values(VERDICT_VALUES)));

const ORCHESTRATION_VERDICTS = Object.freeze(['PASS', 'PARTIAL', 'NOT_PROVEN']);
const EVIDENCE_VERDICTS = Object.freeze(['PASS', 'PARTIAL', 'NOT_PROVEN']);
const LAUNCH_VERDICTS = Object.freeze(['PREPARATION_ONLY', 'NO_GO']);

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

// Forbidden at the reconciliation layer.
const FORBIDDEN_RECONCILE_VERDICTS = Object.freeze(['GO', 'PASS_AUTOMATIC', 'READY', 'LAUNCH_GO']);
function isForbiddenReconcileVerdict(value) {
  return typeof value === 'string' && FORBIDDEN_RECONCILE_VERDICTS.indexOf(value) >= 0;
}

// ---------------------------------------------------------------------------
// 10. SOURCE_ALLOWLIST — frozen inputs the verifier reads; each carries a
//     required flag, chain_role, and independence_group.
// ---------------------------------------------------------------------------

const SOURCE_ALLOWLIST = Object.freeze([
  // M015 baseline — canonical anchor for every criterion.
  Object.freeze({
    source_ref: 'runtime-evidence/M015-native-seven-division-mission-20260717.json',
    kind: 'm015_baseline',
    chain_role: 'm015_baseline',
    independence_group: 'm015-native-seven-division',
    required: true,
  }),
  // M016 S02 proof — first M016 sidecar to settle after M015.
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S02-bos-mission-proof.json',
    kind: 's02_proof',
    chain_role: 's02_proof',
    independence_group: 'm016-s02-bos-mission-proof',
    required: true,
  }),
  // M016 S05 bundle + worksheet + verify-protocol + producer-protocol +
  // probe-run + admission + input-inventory — the S05 surfaces S06
  // re-executes through the fresh verifier subprocess.
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-bundle.json',
    kind: 's05_replay_bundle',
    chain_role: 's05_replay_bundle',
    independence_group: 'm016-s05-replay-bundle',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-scoring-worksheet.json',
    kind: 's05_replay_worksheet',
    chain_role: 's05_replay_worksheet',
    independence_group: 'm016-s05-replay-worksheet',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-verify-protocol.json',
    kind: 's05_replay_verify_protocol',
    chain_role: 's05_replay_verify_protocol',
    independence_group: 'm016-s05-replay-verify-protocol',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-producer-protocol.json',
    kind: 's05_replay_producer_protocol',
    chain_role: 's05_replay_producer_protocol',
    independence_group: 'm016-s05-replay-producer-protocol',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-probe-run.json',
    kind: 's05_replay_probe_run',
    chain_role: 's05_replay_probe_run',
    independence_group: 'm016-s05-replay-probe-run',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-admission.json',
    kind: 's05_replay_admission',
    chain_role: 's05_replay_admission',
    independence_group: 'm016-s05-replay-admission',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-input-inventory.json',
    kind: 's05_replay_input_inventory',
    chain_role: 's05_replay_input_inventory',
    independence_group: 'm016-s05-replay-input-inventory',
    required: false,
  }),
  // M016 S01..S04 auxiliary sidecars — optional corroborators; the
  // criterion mapping may use them as independent M016 back refs.
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S01-classification-protocol.json',
    kind: 's01_classification_protocol',
    chain_role: 's01_classification_protocol',
    independence_group: 'm016-s01-classification-protocol',
    required: false,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S01-classification-validation.json',
    kind: 's01_classification_validation',
    chain_role: 's01_classification_validation',
    independence_group: 'm016-s01-classification-validation',
    required: false,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S01-classification-verification.json',
    kind: 's01_classification_verification',
    chain_role: 's01_classification_verification',
    independence_group: 'm016-s01-classification-verification',
    required: false,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S01-m015-regression-fixture.json',
    kind: 's01_regression_fixture',
    chain_role: 's01_regression_fixture',
    independence_group: 'm016-s01-regression-fixture',
    required: false,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S02-collect-protocol.json',
    kind: 's02_collect_protocol',
    chain_role: 's02_collect_protocol',
    independence_group: 'm016-s02-collect-protocol',
    required: false,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S02-verify-protocol.json',
    kind: 's02_verify_protocol',
    chain_role: 's02_verify_protocol',
    independence_group: 'm016-s02-verify-protocol',
    required: false,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S02-input-inventory.json',
    kind: 's02_input_inventory',
    chain_role: 's02_input_inventory',
    independence_group: 'm016-s02-input-inventory',
    required: false,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S02-redaction-contract.json',
    kind: 's02_redaction_contract',
    chain_role: 's02_redaction_contract',
    independence_group: 'm016-s02-redaction-contract',
    required: false,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S03-safe-operational-evidence-pack.json',
    kind: 's03_safe_pack',
    chain_role: 's03_safe_pack',
    independence_group: 'm016-s03-safe-pack',
    required: false,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S03-collect-protocol.json',
    kind: 's03_collect_protocol',
    chain_role: 's03_collect_protocol',
    independence_group: 'm016-s03-collect-protocol',
    required: false,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S03-verify-protocol.json',
    kind: 's03_verify_protocol',
    chain_role: 's03_verify_protocol',
    independence_group: 'm016-s03-verify-protocol',
    required: false,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S03-input-inventory.json',
    kind: 's03_input_inventory',
    chain_role: 's03_input_inventory',
    independence_group: 'm016-s03-input-inventory',
    required: false,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S03-isolation-invariant.json',
    kind: 's03_isolation_invariant',
    chain_role: 's03_isolation_invariant',
    independence_group: 'm016-s03-isolation-invariant',
    required: false,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S03-live-probe-results.json',
    kind: 's03_live_probe_results',
    chain_role: 's03_live_probe_results',
    independence_group: 'm016-s03-live-probe-results',
    required: false,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S03-scratch-drill-results.json',
    kind: 's03_scratch_drill_results',
    chain_role: 's03_scratch_drill_results',
    independence_group: 'm016-s03-scratch-drill-results',
    required: false,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S04-div4-div5-canary-bundle.json',
    kind: 's04_canary_bundle',
    chain_role: 's04_canary_bundle',
    independence_group: 'm016-s04-canary-bundle',
    required: false,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S04-div4-div5-canary-verify-protocol.json',
    kind: 's04_canary_verify_protocol',
    chain_role: 's04_canary_verify_protocol',
    independence_group: 'm016-s04-canary-verify-protocol',
    required: false,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S04-div4-div5-canary-producer-protocol.json',
    kind: 's04_canary_producer_protocol',
    chain_role: 's04_canary_producer_protocol',
    independence_group: 'm016-s04-canary-producer-protocol',
    required: false,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S04-div4-div5-canary-probe-run.json',
    kind: 's04_canary_probe_run',
    chain_role: 's04_canary_probe_run',
    independence_group: 'm016-s04-canary-probe-run',
    required: false,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S04-div4-div5-canary-input-inventory.json',
    kind: 's04_canary_input_inventory',
    chain_role: 's04_canary_input_inventory',
    independence_group: 'm016-s04-canary-input-inventory',
    required: false,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S04-div4-div5-canary-negative-fixtures.json',
    kind: 's04_canary_negative_fixtures',
    chain_role: 's04_canary_negative_fixtures',
    independence_group: 'm016-s04-canary-negative-fixtures',
    required: false,
  }),
  // Capability ledger — frozen external input that the verifier audits
  // without ever writing.
  Object.freeze({
    source_ref: 'plugin-bos-light/capabilities.paperclip-runtime.json',
    kind: 'capability_ledger',
    chain_role: 'capability_ledger',
    independence_group: 'm016-s06-capability-ledger-input',
    required: true,
  }),
]);

const SOURCE_ALLOWLIST_SET = Object.freeze(new Set(SOURCE_ALLOWLIST.map((s) => s.source_ref)));

// Mandatory chain roles: every required row must have a fresh sha256
// matching the disk bytes (pre == post) before the verifier emits its
// reconciliation sidecar.
const MANDATORY_CHAIN_ROLES = Object.freeze(
  SOURCE_ALLOWLIST.filter((entry) => entry.required).map((entry) => entry.chain_role),
);

// Identifiers of capability sidecar referrers that, if missing, block the
// audit; useful for tamper tests where the ledger is replaced.
const CAPABILITY_LEDGER_REF = 'plugin-bos-light/capabilities.paperclip-runtime.json';
const M015_BASELINE_REF = 'runtime-evidence/M015-native-seven-division-mission-20260717.json';
const S02_PROOF_REF = 'runtime-evidence/M016-S02-bos-mission-proof.json';
const S05_BUNDLE_REF = 'runtime-evidence/M016-S05-seven-division-replay-bundle.json';
const S05_WORKSHEET_REF = 'runtime-evidence/M016-S05-seven-division-replay-scoring-worksheet.json';
const S05_VERIFY_PROTOCOL_REF = 'runtime-evidence/M016-S05-seven-division-replay-verify-protocol.json';

// ---------------------------------------------------------------------------
// 11. DEFAULTS — paths, scratch root, ceilings, operator gate token
// ---------------------------------------------------------------------------

const DEFAULTS = Object.freeze({
  reconciliation_schema_path:
    'schemas/runtime-evidence/m016-s06-proof-reconciliation.v1.json',
  capability_action_ledger_schema_path:
    'schemas/runtime-evidence/m016-s06-capability-action-ledger.v1.json',
  output_dir: 'runtime-evidence',
  reconciliation_output:
    'runtime-evidence/M016-S06-proof-reconciliation.json',
  capability_ledger_output:
    'runtime-evidence/M016-S06-capability-reconciliation.json',
  scratch_root: '/tmp/m016-s06-scratch',
  scratch_root_macos_private: '/private/tmp/m016-s06-scratch',
  scratch_root_macos_user: '/var/folders/m016-s06-scratch',
  reference_time: RECONCILE_REFERENCE_TIME,
  max_replay_duration_ms: 600000,
  max_criterion_rows: MAX_CRITERION_ROWS,
  max_capability_rows: 64,
  max_blocker_codes: 96,
  max_blocker_reason_chars: 512,
  max_rationale_chars: 1024,
  max_source_refs_per_criterion: 8,
  max_seed_length: 64,
  min_confidence: 0,
  max_confidence: 1,
  reconciliation_id: RECONCILIATION_ID,
  capability_ledger_id: CAPABILITY_LEDGER_ID,
  operator_gate_token: '--confirm-operator-gate-s06',
});

// ---------------------------------------------------------------------------
// 12. CAPABILITY_LEDGER_REL_PATH
// ---------------------------------------------------------------------------

const CAPABILITY_LEDGER_REL_PATH = CAPABILITY_LEDGER_REF;

// ---------------------------------------------------------------------------
// 13. REDACTION_FLAG_VALUES — re-export from S03 safe-probe (shared)
// ---------------------------------------------------------------------------

const RECONCILE_REDACTION_FLAG_VALUES = REDACTION_FLAG_VALUES;

// ---------------------------------------------------------------------------
// 14. Identifier patterns
// ---------------------------------------------------------------------------

const CRITERION_ID_PATTERN = '^M16-S06-CRITERION-[A-Za-z0-9_-]+$';
const CAPABILITY_KEY_PATTERN = '^[a-z][a-z0-9._-]{2,63}$';
const RECOMMENDATION_TEXT_PATTERN = '^[a-z][a-z0-9 ,._-]{2,255}$';
const SOURCE_REF_PATTERN = '^runtime-evidence/M016-S[0-9]{2}-[A-Za-z0-9._/-]+\\.json$';
const EXTERNAL_SOURCE_REF_PATTERN = '^plugin-bos-light/[A-Za-z0-9._/-]+\\.json$';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // 1. SCHEMA + NAMESPACE
  RECONCILIATION_SCHEMA_ID,
  RECONCILIATION_SCHEMA_VERSION,
  CAPABILITY_LEDGER_SCHEMA_ID,
  CAPABILITY_LEDGER_SCHEMA_VERSION,
  MILESTONE,
  SLICE,
  TASK,
  TASK_IDS,
  RECONCILIATION_ID,
  RECONCILIATION_KIND,
  CAPABILITY_LEDGER_ID,
  CAPABILITY_LEDGER_KIND,
  VERIFIER_TASK_ID,
  REPORT_TASK_ID,
  // 2. NAMESPACES
  NAMESPACE,
  VERIFIER_LINE_CLASS,
  PRODUCER_FORBIDDEN_LINE_CLASS,
  VERIFIER_CANONICAL_PROTOCOL,
  RECONCILE_BLOCKER_NAMESPACE,
  RECONCILE_BLOCKER_CODE_PATTERN,
  RECONCILE_REFERENCE_TIME,
  // 3. CRITERION_MAPPING
  M015_VERDICT_FIELD_VALUES,
  M015_CRITERION_MAPPING,
  CRITERION_MAPPING_SET,
  MAX_CRITERION_ROWS,
  isKnownCriterion,
  // 4. CAPABILITY_ACTION_ENUM
  CAPABILITY_ACTIONS,
  CAPABILITY_ACTIONS_SET,
  isCapabilityAction,
  // 5. CAPABILITY_STATUS_ENUM
  CAPABILITY_STATUSES,
  CAPABILITY_STATUSES_SET,
  isCapabilityStatus,
  FORBIDDEN_PROMOTION_SURFACES,
  FORBIDDEN_PROMOTION_SURFACES_SET,
  // 6. RECOMMENDATION_VALUES
  RECOMMENDATION_VALUES,
  RECOMMENDATION_VALUES_SET,
  isRecommendationValue,
  // 7. BLOCKER_CODES
  BLOCKER_CODES,
  RECONCILE_BLOCKER_CODE_REGEX,
  isReconcileBlockerCode,
  // 8. EXIT_CODES
  EXIT_CODES,
  // 9. VERDICT_VALUES
  VERDICT_VALUES,
  VERDICT_VALUES_SET,
  ORCHESTRATION_VERDICTS,
  EVIDENCE_VERDICTS,
  LAUNCH_VERDICTS,
  isValidVerdict,
  isValidOrchestrationVerdict,
  isValidEvidenceVerdict,
  isValidLaunchVerdict,
  FORBIDDEN_RECONCILE_VERDICTS,
  isForbiddenReconcileVerdict,
  // 10. SOURCE_ALLOWLIST
  SOURCE_ALLOWLIST,
  SOURCE_ALLOWLIST_SET,
  MANDATORY_CHAIN_ROLES,
  CAPABILITY_LEDGER_REF,
  M015_BASELINE_REF,
  S02_PROOF_REF,
  S05_BUNDLE_REF,
  S05_WORKSHEET_REF,
  S05_VERIFY_PROTOCOL_REF,
  // 11. DEFAULTS
  DEFAULTS,
  // 12. CAPABILITY_LEDGER_REL_PATH
  CAPABILITY_LEDGER_REL_PATH,
  // 13. REDACTION_FLAG_VALUES (shared)
  RECONCILE_REDACTION_FLAG_VALUES,
  // 14. PATTERNS
  CRITERION_ID_PATTERN,
  CAPABILITY_KEY_PATTERN,
  RECOMMENDATION_TEXT_PATTERN,
  SOURCE_REF_PATTERN,
  EXTERNAL_SOURCE_REF_PATTERN,
  // helpers
  _safeSuffix,
};
