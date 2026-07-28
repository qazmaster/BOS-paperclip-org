#!/usr/bin/env node
'use strict';

/**
 * scripts/lib/m016-s01-classification-data.js
 *
 * M016-txa3vu / S01 / T01 — Frozen classification constants for the
 * historical M015 proof classifier.
 *
 * Pure-data module. No I/O, no evaluation logic. The contract evaluator
 * (./m016-s01-classification-contract.js) consumes these constants so the
 * heavy lifter stays under the 50KB GSD budget while a single source of
 * truth governs gate IDs, semantic-rule catalog, verdict dimensions,
 * independence groups, provenance kinds, worksheet contract, blocker
 * codes, exit codes, and sanitised redaction bounds.
 *
 * Sections:
 *   1. SEMANTIC_RULES            — OBSERVED / EXECUTED / INFERRED / PROPOSED / NOT_PROVEN
 *   2. PROVENANCE_KINDS          — native_run / agent_log / harness_log / replay
 *   3. PROVENANCE_PROMOTION      — which kinds may promote / demote
 *   4. VERDICT_DIMENSIONS        — orchestration / evidence / launch
 *   5. VERDICT_VALUES            — PASS / PARTIAL / PREPARATION_ONLY / NOT_PROVEN
 *   6. VERDICT_DERIVATION_RULES  — gate floors + upgrade conditions per dimension
 *   7. HARD_GATE_IDS             — HG1..HG6
 *   8. HARD_GATE_LABELS          — human-readable gate labels
 *   9. WORKSHEET_STEP_STATUSES   — pass / warn / fail / not_proven
 *  10. INDEPENDENCE_GROUPS       — canonical group identifiers
 *  11. BLOCKER_CODES             — M16-S01-CLASSIFY-* codes
 *  12. EXIT_CODES                — process exit codes by verdict class
 *  13. DEFAULTS                  — paths, bounds, ceilings
 *  14. REDACTION_BOUNDS          — sanitised payload limits + regex from probe
 *  15. MISSION_NAMESPACE         — top-level keys written to classifier outputs
 *  16. IDENTITY_KIND             — agent_name vs runner_id
 */

const {
  UUID_FULL,
  XIAOMI_RE,
  CREDENTIAL_ASSIGNMENT,
} = require('../probe_m015_seven_agent_environment');

const SCHEMA_ID = 'https://gsd.local/schemas/runtime-evidence/m016-s01-evidence-claim.v1.json';

const SEMANTIC_RULES = Object.freeze({
  OBSERVED: 'OBSERVED',
  EXECUTED: 'EXECUTED',
  INFERRED: 'INFERRED',
  PROPOSED: 'PROPOSED',
  NOT_PROVEN: 'NOT_PROVEN',
});

const SEMANTIC_RULE_CATALOG = Object.freeze([
  {
    rule: 'OBSERVED',
    promote_to: ['orchestration'],
    demote_to: ['evidence', 'launch'],
    rationale: 'OBSERVED claims may support orchestration only; they cannot substitute for execution evidence or launch authority.',
  },
  {
    rule: 'EXECUTED',
    promote_to: ['orchestration', 'evidence'],
    demote_to: ['launch'],
    rationale: 'EXECUTED claims with native_run provenance may promote orchestration and evidence; launch requires independent artifact binding the historical fixture does not carry.',
  },
  {
    rule: 'INFERRED',
    promote_to: [],
    demote_to: ['orchestration', 'evidence', 'launch'],
    rationale: 'Inferred claims are diagnostic only; they never promote any dimension.',
  },
  {
    rule: 'PROPOSED',
    promote_to: [],
    demote_to: ['orchestration', 'evidence', 'launch'],
    rationale: 'Proposed claims describe future intent; they never promote any dimension.',
  },
  {
    rule: 'NOT_PROVEN',
    promote_to: [],
    demote_to: ['orchestration', 'evidence', 'launch'],
    rationale: 'NOT_PROVEN is the fail-closed terminal state for any claim lacking confirmed evidence.',
  },
]);

const PROVENANCE_KINDS = Object.freeze({
  NATIVE_RUN: 'native_run',
  AGENT_LOG: 'agent_log',
  HARNESS_LOG: 'harness_log',
  REPLAY: 'replay',
});

const PROVENANCE_PROMOTION = Object.freeze({
  native_run: Object.freeze({
    promotes: true,
    max_verdict: 'PASS',
    rationale: 'A native Paperclip run with bounded artifact hash may promote a dimension to PASS.',
  }),
  agent_log: Object.freeze({
    promotes: false,
    max_verdict: 'PARTIAL',
    rationale: 'Agent-authored logs are bounded to PARTIAL; they cannot be promoted to PASS without independent native_run witness.',
  }),
  harness_log: Object.freeze({
    promotes: false,
    max_verdict: 'PARTIAL',
    rationale: 'Harness logs are bounded to PARTIAL; they cannot be promoted to PASS without independent native_run witness.',
  }),
  replay: Object.freeze({
    promotes: false,
    max_verdict: 'NOT_PROVEN',
    rationale: 'Replay provenance is demoted to NOT_PROVEN; replaying an artifact does not re-prove execution.',
  }),
});

const VERDICT_DIMENSIONS = Object.freeze({
  ORCHESTRATION: 'orchestration',
  EVIDENCE: 'evidence',
  LAUNCH: 'launch',
});

const VERDICT_VALUES = Object.freeze({
  PASS: 'PASS',
  PARTIAL: 'PARTIAL',
  PREPARATION_ONLY: 'PREPARATION_ONLY',
  NOT_PROVEN: 'NOT_PROVEN',
});

const VERDICT_VALUE_RANK = Object.freeze({
  PASS: 3,
  PARTIAL: 2,
  PREPARATION_ONLY: 1,
  NOT_PROVEN: 0,
});

const VERDICT_DERIVATION_RULES = Object.freeze({
  orchestration: Object.freeze({
    gate_floor: Object.freeze(['HG1', 'HG2']),
    upgrade_to_pass: Object.freeze([
      'at_least_one_executed_with_native_run_provenance',
      'hg1_pass',
      'hg2_pass',
      'hg3_pass',
    ]),
    demote_to_partial: Object.freeze([
      'hg1_pass_only_observed_claims',
      'hg3_partial_independence_group_reuse',
    ]),
    demote_to_not_proven: Object.freeze([
      'hg1_fail',
      'hg2_fail',
      'classifier_runner_failure',
    ]),
    prohibited_verdicts: Object.freeze(['GO']),
  }),
  evidence: Object.freeze({
    gate_floor: Object.freeze(['HG1', 'HG2', 'HG3', 'HG4']),
    upgrade_to_pass: Object.freeze([
      'multiple_independent_executed_claims',
      'hg1_pass',
      'hg2_pass',
      'hg3_pass',
      'hg4_pass',
      'hg5_pass',
    ]),
    demote_to_partial: Object.freeze([
      'single_executed_claim_without_independence',
      'hg5_partial_incomplete_worksheet',
      'hg6_partial_unsanitised_diagnostic',
    ]),
    demote_to_not_proven: Object.freeze([
      'hg1_fail',
      'hg2_fail',
      'hg3_fail',
      'hg4_fail',
      'hg5_fail',
    ]),
    prohibited_verdicts: Object.freeze(['GO', 'PREPARATION_ONLY']),
  }),
  launch: Object.freeze({
    gate_floor: Object.freeze(['HG1', 'HG2', 'HG3', 'HG4', 'HG5', 'HG6']),
    upgrade_to_pass: Object.freeze([
      'all_hgs_pass',
      'artifact_hash_bound_to_native_run',
      'independent_launch_artifact_present',
      'native_readback_hash_present',
    ]),
    upgrade_to_preparation_only: Object.freeze([
      'hg1_pass',
      'hg2_pass',
      'hg3_pass',
      'hg4_pass',
      'hg5_pass',
      'hg6_pass',
      'native_run_artifact_reference_present',
      'native_readback_hash_absent',
    ]),
    demote_to_not_proven: Object.freeze([
      'any_hg_fail',
      'hg5_incomplete_worksheet',
      'artifact_hash_missing',
      'launch_go_attempt_detected',
    ]),
    prohibited_verdicts: Object.freeze(['GO', 'PASS_AUTOMATIC']),
    max_verdict_without_independent_native_readback: 'PREPARATION_ONLY',
  }),
});

const HARD_GATE_IDS = Object.freeze([
  'HG1 SEMANTIC_RULE_COMPLIANCE',
  'HG2 PROVENANCE_INTEGRITY',
  'HG3 INDEPENDENCE_GROUP_ISOLATION',
  'HG4 ARTIFACT_BINDING',
  'HG5 WORKSHEET_INTEGRITY',
  'HG6 VERDICT_DERIVATION_BOUNDED',
]);

const HARD_GATE_LABELS = Object.freeze({
  semantic_rule_compliance_pass: 'HG1 SEMANTIC_RULE_COMPLIANCE: every claim declares a frozen semantic_rule and matches the claim_id / independence_group / dimension patterns',
  provenance_integrity_pass: 'HG2 PROVENANCE_INTEGRITY: every EXECUTED claim carries identity, timestamps, exit_code, sanitised_digest, artifact_reference and artifact_hash; non-EXECUTED claims carry no executed_provenance',
  independence_group_isolation_pass: 'HG3 INDEPENDENCE_GROUP_ISOLATION: every claim has a unique independence_group; reuse across EXECUTED claims requires a shared artifact_hash and is rejected otherwise',
  artifact_binding_pass: 'HG4 ARTIFACT_BINDING: source_ref paths are bounded inside runtime-evidence/, schemas/ or scripts/; EXECUTED claims additionally bind to an artifact_hash and reference',
  worksheet_integrity_pass: 'HG5 WORKSHEET_INTEGRITY: a worksheet is present with at least one step, completed_at and completed_by; missing or incomplete worksheets block the score',
  verdict_derivation_bounded_pass: 'HG6 VERDICT_DERIVATION_BOUNDED: launch dimension never emits GO; diagnostic payloads are sanitised; no score is derived without a complete worksheet',
});

const WORKSHEET_STEP_STATUSES = Object.freeze({
  PASS: 'pass',
  WARN: 'warn',
  FAIL: 'fail',
  NOT_PROVEN: 'not_proven',
});

const WORKSHEET_CONTRACT = Object.freeze({
  min_steps: 1,
  max_steps: 32,
  max_step_id_length: 64,
  max_description_length: 200,
  max_verify_cmd_length: 200,
  max_observed_evidence_length: 200,
  max_completed_by_length: 64,
  completed_by_pattern: '^(Div[1-7]\\.[A-Za-z]+|classifier)$',
});

const INDEPENDENCE_GROUPS = Object.freeze({
  DIV1_HCO: 'div1-hco-orchestration',
  DIV2_MASTER_PLANNER: 'div2-master-planner-orchestration',
  DIV3_TREASURY: 'div3-treasury-orchestration',
  DIV4_PRODUCTION: 'div4-production-orchestration',
  DIV5_QUALIFICATIONS: 'div5-qualifications-orchestration',
  DIV6_EXTERNAL: 'div6-external-orchestration',
  DIV7_MISSION_CONTROL: 'div7-mission-control-orchestration',
  MISSION_TOPOLOGY: 'mission-topology',
  HEARTBEAT_RUNS: 'heartbeat-runs',
  MISSION_DOCUMENTS: 'mission-documents',
  MISSION_COMMENTS: 'mission-comments',
  MISSION_ACTIVITY: 'mission-activity',
  ORCHESTRATION_OUTCOMES: 'orchestration-outcomes',
  ISOLATION_AUDIT: 'isolation-audit',
  VERDICT_DERIVATION: 'verdict-derivation',
});

const BLOCKER_CODES = Object.freeze({
  RUNNER_FAILURE: 'M16-S01-CLASSIFY-RUNNER-FAILURE',
  CLAIMS_INPUT_MISSING: 'M16-S01-CLASSIFY-CLAIMS-INPUT-MISSING',
  CLAIMS_INPUT_MALFORMED: 'M16-S01-CLASSIFY-CLAIMS-INPUT-MALFORMED',
  CLAIMS_INPUT_NOT_ARRAY: 'M16-S01-CLASSIFY-CLAIMS-INPUT-NOT-ARRAY',
  CLAIMS_EMPTY: 'M16-S01-CLASSIFY-CLAIMS-EMPTY',
  CLAIM_ID_MALFORMED: (claim_id) => `M16-S01-CLASSIFY-CLAIM-ID-MALFORMED-${claim_id}`,
  CLAIM_NOT_OBJECT: 'M16-S01-CLASSIFY-CLAIM-NOT-OBJECT',
  CLAIM_ADDITIONAL_PROPS: (claim_id) => `M16-S01-CLASSIFY-CLAIM-ADDITIONAL-PROPS-${claim_id}`,
  SEMANTIC_RULE_INVALID: (claim_id, rule) => `M16-S01-CLASSIFY-${claim_id}-SEMANTIC-RULE-INVALID-${rule}`,
  DIMENSION_INVALID: (claim_id, dimension) => `M16-S01-CLASSIFY-${claim_id}-DIMENSION-INVALID-${dimension}`,
  EXECUTED_MISSING_PROVENANCE: (claim_id) => `M16-S01-CLASSIFY-${claim_id}-EXECUTED-MISSING-PROVENANCE`,
  EXECUTED_PROVENANCE_MALFORMED: (claim_id) => `M16-S01-CLASSIFY-${claim_id}-EXECUTED-PROVENANCE-MALFORMED`,
  NON_EXECUTED_WITH_PROVENANCE: (claim_id) => `M16-S01-CLASSIFY-${claim_id}-NON-EXECUTED-WITH-PROVENANCE`,
  PROVENANCE_KIND_DEMOTED: (claim_id, kind) => `M16-S01-CLASSIFY-${claim_id}-PROVENANCE-KIND-DEMOTED-${kind}`,
  EXIT_CODE_NON_ZERO: (claim_id, exit_code) => `M16-S01-CLASSIFY-${claim_id}-EXIT-CODE-NON-ZERO-${exit_code}`,
  TIMESTAMP_INVALID: (claim_id, field) => `M16-S01-CLASSIFY-${claim_id}-TIMESTAMP-INVALID-${field}`,
  INDEPENDENCE_GROUP_MALFORMED: (claim_id) => `M16-S01-CLASSIFY-${claim_id}-INDEPENDENCE-GROUP-MALFORMED`,
  INDEPENDENCE_GROUP_REUSED: (group) => `M16-S01-CLASSIFY-INDEPENDENCE-GROUP-REUSED-${group}`,
  SOURCE_REF_MISSING: (claim_id) => `M16-S01-CLASSIFY-${claim_id}-SOURCE-REF-MISSING`,
  SOURCE_REF_PATH_OUT_OF_BOUND: (claim_id) => `M16-S01-CLASSIFY-${claim_id}-SOURCE-REF-PATH-OUT-OF-BOUND`,
  ARTIFACT_HASH_MISSING: (claim_id) => `M16-S01-CLASSIFY-${claim_id}-ARTIFACT-HASH-MISSING`,
  ARTIFACT_HASH_MALFORMED: (claim_id) => `M16-S01-CLASSIFY-${claim_id}-ARTIFACT-HASH-MALFORMED`,
  WORKSHEET_INCOMPLETE: (claim_id) => `M16-S01-CLASSIFY-${claim_id}-WORKSHEET-INCOMPLETE`,
  SCORE_WITHOUT_WORKSHEET: (claim_id) => `M16-S01-CLASSIFY-${claim_id}-SCORE-WITHOUT-WORKSHEET`,
  DIAGNOSTIC_UNSANITISED: (claim_id) => `M16-S01-CLASSIFY-${claim_id}-DIAGNOSTIC-UNSANITISED`,
  DIAGNOSTIC_BEARER_LEAK: (claim_id) => `M16-S01-CLASSIFY-${claim_id}-DIAGNOSTIC-BEARER-LEAK`,
  DIAGNOSTIC_UUID_LEAK: (claim_id) => `M16-S01-CLASSIFY-${claim_id}-DIAGNOSTIC-UUID-LEAK`,
  DIAGNOSTIC_CRED_LEAK: (claim_id) => `M16-S01-CLASSIFY-${claim_id}-DIAGNOSTIC-CRED-LEAK`,
  DIAGNOSTIC_XIAOMI_LEAK: (claim_id) => `M16-S01-CLASSIFY-${claim_id}-DIAGNOSTIC-XIAOMI-LEAK`,
  LAUNCH_GO_ATTEMPT: (claim_id) => `M16-S01-CLASSIFY-${claim_id}-LAUNCH-GO-ATTEMPT`,
  LAUNCH_VERDICT_EXCEEDS_MAX: (claim_id, value) => `M16-S01-CLASSIFY-${claim_id}-LAUNCH-VERDICT-EXCEEDS-MAX-${value}`,
  HG_GATE_FAIL_CLOSED: (gate_id, reason) => `M16-S01-CLASSIFY-HG-${gate_id}-FAIL-CLOSED-${reason}`,
  HG_GATE_NOT_PROVEN: (gate_id, reason) => `M16-S01-CLASSIFY-HG-${gate_id}-NOT-PROVEN-${reason}`,
  REGRESSION_FIXTURE_MISMATCH: (claim_id) => `M16-S01-CLASSIFY-REGRESSION-FIXTURE-MISMATCH-${claim_id}`,
});

const EXIT_CODES = Object.freeze({
  CLASSIFICATION_PASS: 0,
  CLASSIFICATION_PARTIAL: 0,
  CLASSIFICATION_PREPARATION_ONLY: 0,
  CLASSIFICATION_REJECTED_MALFORMED: 1,
  CLASSIFICATION_REJECTED_FAIL_CLOSED: 2,
  CLASSIFICATION_UNSUPPORTED_CLAIM: 3,
  CLASSIFICATION_RUNNER_FAILURE: 4,
  CLASSIFICATION_GATE_NOT_PROVEN: 5,
  CLASSIFICATION_REGRESSION_MISMATCH: 6,
});

const DEFAULTS = Object.freeze({
  schema_path: 'schemas/runtime-evidence/m016-s01-evidence-claim.v1.json',
  fixture_path: 'runtime-evidence/M016-S01-m015-regression-fixture.json',
  default_input_path: 'runtime-evidence/M015-native-seven-division-mission-20260717.json',
  output_dir: 'runtime-evidence',
  protocol_output: 'runtime-evidence/M016-S01-classification-protocol.json',
  verification_output: 'runtime-evidence/M016-S01-classification-verification.json',
  validation_output: 'runtime-evidence/M016-S01-classification-validation.json',
  protocol_schema: 'gsd/m016-s01-classification-protocol-v1',
  verification_schema: 'gsd/m016-s01-classification-verification-v1',
  validation_schema: 'gsd/m016-s01-classification-validation-v1',
  max_summary_chars: 200,
  max_limitations_chars: 400,
  max_sanitised_digest_chars: 256,
  max_worksheet_step_description_chars: 200,
  max_worksheet_step_verify_cmd_chars: 200,
  max_worksheet_step_observed_evidence_chars: 200,
  max_diagnostic_summary_chars: 200,
  redacted_id_placeholder: '<redacted-id>',
  redacted_credential_placeholder: '<redacted-credential-fragment>',
  redacted_token_placeholder: '<redacted>',
});

const REDACTION_BOUNDS = Object.freeze({
  uuid: UUID_FULL,
  xiaomi_or_mimo: XIAOMI_RE,
  credential_assignment: CREDENTIAL_ASSIGNMENT,
  bearer_token: /\bbearer\s+[A-Za-z0-9._-]+/i,
  sk_token: /\bsk-[A-Za-z0-9._-]+/g,
  tp_token: /\btp-[A-Za-z0-9._-]+/g,
  max_chars_per_summary: 200,
  max_chars_per_digest: 256,
});

const MISSION_NAMESPACE = Object.freeze({
  runner_namespace: 'M16-S01-CLASSIFY',
  schema_namespace: 'm016-s01-evidence-claim-v1',
  schema_id: SCHEMA_ID,
  hard_gate_ids: HARD_GATE_IDS,
  verdict_dimensions: Object.freeze(Object.values(VERDICT_DIMENSIONS)),
  verdict_values: Object.freeze(Object.values(VERDICT_VALUES)),
  semantic_rules: Object.freeze(Object.values(SEMANTIC_RULES)),
  provenance_kinds: Object.freeze(Object.values(PROVENANCE_KINDS)),
});

const IDENTITY_KIND = Object.freeze({
  AGENT_NAME: 'agent_name',
  RUNNER_ID: 'runner_id',
});

const CANONICAL_AGENT_NAMES = Object.freeze([
  'Div1.HCO',
  'Div2.MasterPlanner',
  'Div3.Treasury',
  'Div4.Production',
  'Div5.QualificationsLibraryLearning',
  'Div6.External',
  'Div7.MissionControl',
]);

const AGENT_NAMES_SET = Object.freeze(new Set(CANONICAL_AGENT_NAMES));

module.exports = {
  SCHEMA_ID,
  SEMANTIC_RULES,
  SEMANTIC_RULE_CATALOG,
  PROVENANCE_KINDS,
  PROVENANCE_PROMOTION,
  VERDICT_DIMENSIONS,
  VERDICT_VALUES,
  VERDICT_VALUE_RANK,
  VERDICT_DERIVATION_RULES,
  HARD_GATE_IDS,
  HARD_GATE_LABELS,
  WORKSHEET_STEP_STATUSES,
  WORKSHEET_CONTRACT,
  INDEPENDENCE_GROUPS,
  BLOCKER_CODES,
  EXIT_CODES,
  DEFAULTS,
  REDACTION_BOUNDS,
  MISSION_NAMESPACE,
  IDENTITY_KIND,
  CANONICAL_AGENT_NAMES,
  AGENT_NAMES_SET,
};
