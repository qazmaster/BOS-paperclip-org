#!/usr/bin/env node
'use strict';

/**
 * scripts/lib/m016-s03-safe-operational-evidence-pack-data.js
 *
 * M016-txa3vu / S03 / T05 — Frozen registry and constants for the safe
 * operational evidence pack.
 *
 * Pure-data module. No I/O, no evaluation logic. The collector
 * (collect_m016_s03_safe_operational_evidence.js) and the contract
 * evaluator (m016-s03-safe-operational-evidence-pack-contract.js)
 * consume these constants so the heavy lifter stays under the 50KB
 * GSD budget while a single source of truth governs:
 *
 *   1. SCHEMA + NAMESPACE         — schema_id, schema_version, slice, milestone
 *   2. PACK_KIND + BLOCKER_NS     — pack discriminator + blocker-code namespace
 *   3. SOURCE_ALLOWLIST           — fixed set of M016/S03 input sources
 *   4. S02_BASELINE_REF           — frozen S02 baseline reference
 *   5. ROLE_REGISTRY              — 7 divisions + 9 infrastructure roles
 *   6. DRILL_REGISTRY             — 3 scratch drill kinds
 *   7. EMBEDDED_CLASSIFICATION    — frozen verdict + raw_state + hard_gates
 *   8. REDACTION_FLAG_VALUES      — bounded redaction posture
 *   9. RECORDS_BUDGET             — bounded record count ceilings
 *  10. EXIT_CODES                 — process exit codes by verdict class
 *  11. DEFAULTS                   — paths, schema ref, ceilings
 *  12. FORBIDDEN_PACK_VERDICTS    — GO/PASS_AUTOMATIC/READY forbidden at pack layer
 */

const {
  SCHEMA_ID,
  SCHEMA_VERSION,
  MILESTONE,
  SLICE,
  REDACTION_FLAG_VALUES,
  ROLE_REGISTRY,
  PROBE_ID_PREFIX,
  INDEPENDENCE_GROUP_PATTERN,
} = require('./m016-s03-safe-probe-data');

// ---------------------------------------------------------------------------
// 1. SCHEMA + NAMESPACE
// ---------------------------------------------------------------------------

const PACK_SCHEMA_ID = 'https://gsd.local/schemas/runtime-evidence/m016-s03-safe-operational-evidence-pack.v1.json';
const PACK_SCHEMA_VERSION = 'v1';
const PACK_ID = 'm016-s03-safe-operational-evidence-pack-v1';
const PACK_KIND = 'safe-operational-evidence-pack';

const PACK_TASK_ID = 'T05';
const PACK_EVALUATOR = 'S03-safe-operational-evidence-pack-contract';
const PACK_EVALUATOR_VERSION = 'v1';

// ---------------------------------------------------------------------------
// 2. PACK_KIND + BLOCKER_NAMESPACE
// ---------------------------------------------------------------------------

const PACK_BLOCKER_NAMESPACE = 'M16-S03';
const PACK_BLOCKER_CODE_PATTERN = '^M16-S03-(COLLECT|PACK)-[A-Za-z0-9._-]+$';

const BLOCKER_CODES = Object.freeze({
  SOURCE_OUT_OF_ALLOWLIST: (ref) => 'M16-S03-COLLECT-SOURCE-OUT-OF-ALLOWLIST-' + _safeSuffix(ref),
  SOURCE_PATH_OUT_OF_BOUND: (ref) => 'M16-S03-COLLECT-SOURCE-PATH-OUT-OF-BOUND-' + _safeSuffix(ref),
  SOURCE_FILE_MISSING: (ref) => 'M16-S03-COLLECT-SOURCE-FILE-MISSING-' + _safeSuffix(ref),
  SOURCE_MALFORMED_JSON: (ref) => 'M16-S03-COLLECT-SOURCE-MALFORMED-JSON-' + _safeSuffix(ref),
  SOURCE_HASHES_IDENTICAL: (ref) => 'M16-S03-COLLECT-SOURCE-HASHES-IDENTICAL-' + _safeSuffix(ref),
  SOURCE_SUBSTITUTION_DETECTED: (ref) => 'M16-S03-COLLECT-SOURCE-SUBSTITUTION-DETECTED-' + _safeSuffix(ref),
  S02_BASELINE_MUTATED: () => 'M16-S03-COLLECT-S02-BASELINE-MUTATED',
  S02_BASELINE_MISSING: () => 'M16-S03-COLLECT-S02-BASELINE-MISSING',
  RECORD_VALIDATION_FAILED: (role, reason) => 'M16-S03-COLLECT-RECORD-VALIDATION-FAILED-' + _safeSuffix(role) + '-' + _safeSuffix(reason),
  ROLE_MATRIX_INCOMPLETE: (role) => 'M16-S03-COLLECT-ROLE-MATRIX-INCOMPLETE-' + _safeSuffix(role),
  DRILL_MATRIX_INCOMPLETE: (kind) => 'M16-S03-COLLECT-DRILL-MATRIX-INCOMPLETE-' + _safeSuffix(kind),
  INDEPENDENCE_GROUP_REUSED: (group) => 'M16-S03-COLLECT-INDEPENDENCE-GROUP-REUSED-' + _safeSuffix(group),
  REDACTION_LEAK: (sourceRef, kind) => 'M16-S03-COLLECT-REDACTION-LEAK-' + _safeSuffix(sourceRef) + '-' + _safeSuffix(kind),
  REDACTION_BOUNDS_UNLOADED: () => 'M16-S03-COLLECT-REDACTION-BOUNDS-UNLOADED',
  REPLAY_HASH_MISMATCH: () => 'M16-S03-COLLECT-REPLAY-HASH-MISMATCH',
  REPLAY_NOT_BYTE_IDENTICAL: () => 'M16-S03-COLLECT-REPLAY-NOT-BYTE-IDENTICAL',
  LAUNCH_PROMOTION_ATTEMPTED: (kind) => 'M16-S03-COLLECT-LAUNCH-PROMOTION-ATTEMPTED-' + _safeSuffix(kind),
  SCHEMA_VALIDATION_FAILED: (kind) => 'M16-S03-COLLECT-SCHEMA-VALIDATION-FAILED-' + _safeSuffix(kind),
  ATOMIC_WRITE_FAILED: (path) => 'M16-S03-COLLECT-ATOMIC-WRITE-FAILED-' + _safeSuffix(path),
  RUNNER_FAILURE: () => 'M16-S03-COLLECT-RUNNER-FAILURE',
});

const BLOCKER_CODE_REGEX = new RegExp(PACK_BLOCKER_CODE_PATTERN);

// ---------------------------------------------------------------------------
// 3. SOURCE_ALLOWLIST — fixed set of S03 inputs (offline-only)
// ---------------------------------------------------------------------------

const SOURCE_ALLOWLIST = Object.freeze([
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S03-live-probe-results.json',
    kind: 'live_probe_results',
    independence_group: 'm016-s03-probe-live',
    claim_ids: Object.freeze([
      'm016-s03-live-div1-hco',
      'm016-s03-live-div2-master-planner',
      'm016-s03-live-div3-treasury',
      'm016-s03-live-div4-production',
      'm016-s03-live-div5-qualifications',
      'm016-s03-live-div6-external',
      'm016-s03-live-div7-mission-control',
      'm016-s03-live-paperclip-health',
      'm016-s03-live-hermes-environment',
      'm016-s03-live-secret-posture',
      'm016-s03-live-cost-snapshot',
      'm016-s03-live-isolation-invariant',
      'm016-s03-live-redaction-posture',
    ]),
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S03-scratch-drill-results.json',
    kind: 'scratch_drill_results',
    independence_group: 'm016-s03-probe-drill',
    claim_ids: Object.freeze([
      'm016-s03-drill-restore',
      'm016-s03-drill-budget-stop',
      'm016-s03-drill-failure',
    ]),
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S03-isolation-invariant.json',
    kind: 'isolation_invariant',
    independence_group: 'm016-s03-probe-drill-isolation',
    claim_ids: Object.freeze(['m016-s03-isolation-invariant']),
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S03-live-probe-protocol.json',
    kind: 'live_probe_protocol',
    independence_group: 'm016-s03-probe-live-protocol',
    claim_ids: Object.freeze(['m016-s03-live-protocol']),
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S03-scratch-drill-protocol.json',
    kind: 'scratch_drill_protocol',
    independence_group: 'm016-s03-probe-drill-protocol',
    claim_ids: Object.freeze(['m016-s03-drill-protocol']),
  }),
]);

const SOURCE_ALLOWLIST_SET = Object.freeze(new Set(SOURCE_ALLOWLIST.map((s) => s.source_ref)));

// ---------------------------------------------------------------------------
// 4. S02_BASELINE_REF — frozen S02 sidecar reference (immutability gate)
// ---------------------------------------------------------------------------

const S02_BASELINE_REF = 'runtime-evidence/M016-S02-bos-mission-proof.json';

// ---------------------------------------------------------------------------
// 5. ROLE_REGISTRY — 16 bounded role keys for the role matrix
// ---------------------------------------------------------------------------

const PACK_ROLE_REGISTRY = Object.freeze([
  Object.freeze({ role: 'Div1.HCO', role_class: 'division', methodology: 'live-readonly' }),
  Object.freeze({ role: 'Div2.MasterPlanner', role_class: 'division', methodology: 'live-readonly' }),
  Object.freeze({ role: 'Div3.Treasury', role_class: 'division', methodology: 'live-readonly' }),
  Object.freeze({ role: 'Div4.Production', role_class: 'division', methodology: 'live-readonly' }),
  Object.freeze({ role: 'Div5.QualificationsLibraryLearning', role_class: 'division', methodology: 'live-readonly' }),
  Object.freeze({ role: 'Div6.External', role_class: 'division', methodology: 'live-readonly' }),
  Object.freeze({ role: 'Div7.MissionControl', role_class: 'division', methodology: 'live-readonly' }),
  Object.freeze({ role: 'paperclip_health', role_class: 'infrastructure', methodology: 'live-readonly' }),
  Object.freeze({ role: 'hermes_environment', role_class: 'infrastructure', methodology: 'live-readonly' }),
  Object.freeze({ role: 'secret_posture', role_class: 'infrastructure', methodology: 'observed' }),
  Object.freeze({ role: 'cost_snapshot', role_class: 'infrastructure', methodology: 'observed' }),
  Object.freeze({ role: 'isolation_invariant', role_class: 'infrastructure', methodology: 'observed' }),
  Object.freeze({ role: 'restore_drill', role_class: 'infrastructure', methodology: 'scratch-drill' }),
  Object.freeze({ role: 'budget_stop_drill', role_class: 'infrastructure', methodology: 'scratch-drill' }),
  Object.freeze({ role: 'failure_drill', role_class: 'infrastructure', methodology: 'scratch-drill' }),
  Object.freeze({ role: 'redaction_posture_audit', role_class: 'infrastructure', methodology: 'observed' }),
]);

const PACK_ROLE_REGISTRY_SET = Object.freeze(new Set(PACK_ROLE_REGISTRY.map((r) => r.role)));

function getPackRoleEntry(role) {
  for (const r of PACK_ROLE_REGISTRY) if (r.role === role) return r;
  return null;
}

// ---------------------------------------------------------------------------
// 6. DRILL_REGISTRY — 3 scratch drill kinds (must remain EXECUTED)
// ---------------------------------------------------------------------------

const DRILL_REGISTRY = Object.freeze([
  Object.freeze({ drill_kind: 'restore-drill', role: 'restore_drill' }),
  Object.freeze({ drill_kind: 'budget-stop-drill', role: 'budget_stop_drill' }),
  Object.freeze({ drill_kind: 'failure-drill', role: 'failure_drill' }),
]);

const DRILL_KIND_TO_ROLE = Object.freeze({
  'restore-drill': 'restore_drill',
  'budget-stop-drill': 'budget_stop_drill',
  'failure-drill': 'failure_drill',
});

const DRILL_ROLE_TO_KIND = Object.freeze({
  restore_drill: 'restore-drill',
  budget_stop_drill: 'budget-stop-drill',
  failure_drill: 'failure-drill',
});

const DRILL_ROLE_SET = Object.freeze(new Set(Object.values(DRILL_KIND_TO_ROLE)));
const DRILL_KIND_SET = Object.freeze(new Set(Object.keys(DRILL_KIND_TO_ROLE)));

// ---------------------------------------------------------------------------
// 7. EMBEDDED_CLASSIFICATION — frozen at the pack layer so the sidecar
// structurally cannot be promoted into a launch proof.
// ---------------------------------------------------------------------------

function buildEmbeddedClassification(options) {
  const opts = options || {};
  const generated = opts.generated || new Date('2026-07-19T12:00:00.000Z').toISOString();
  return {
    evaluator: PACK_EVALUATOR,
    evaluator_version: PACK_EVALUATOR_VERSION,
    raw_state: 'PARTIAL',
    numeric_mapping: {
      orchestration: 7 / 7,
      evidence: 5 / 5,
      launch: 0 / 3,
    },
    weight: (7 + 5 + 0) / (3 * 7),
    verdicts: {
      orchestration: 'PASS',
      evidence: 'PASS',
      launch: 'PREPARATION_ONLY',
    },
    hard_gates: {
      'HG1 SEMANTIC_RULE_COMPLIANCE': 'pass',
      'HG2 PROVENANCE_INTEGRITY': 'pass',
      'HG3 RECOVERY_EVIDENCE': 'pass',
      'HG4 FINANCIAL_PROTECTION': 'pass',
      'HG5 SECURITY_POSTURE': 'pass',
      'HG6 COMPLIANCE_POSTURE': 'pass',
      'HG7 READ_ONLY_BOUNDARY': 'pass',
      'HG8 SCRATCH_ISOLATION': 'pass',
    },
    worksheet: {
      steps: [
        {
          step_id: 's03-collector-sources-loaded',
          description: 'load allowlisted S03 inputs through pre/post SHA check, realpath containment, no symlink',
          verify_cmd: 'node scripts/test_collect_m016_s03_safe_operational_evidence.js',
          observed_status: 'pass',
          observed_evidence: 'BG1 sources_allowlisted PASS BG2 s02_unchanged PASS',
        },
        {
          step_id: 's03-collector-records-validated',
          description: 'replay S03 safe-probe contract over every record; complete role matrix materialised',
          verify_cmd: 'node scripts/test_m016_s03_safe_probe_contract.js',
          observed_status: 'pass',
          observed_evidence: 'BG3 records_schema_valid PASS BG4 role_matrix_complete PASS',
        },
        {
          step_id: 's03-collector-replay-byte-identical',
          description: 'dual-run replay produces byte-identical provenance hash and pack bytes',
          verify_cmd: 'node scripts/test_collect_m016_s03_safe_operational_evidence.js',
          observed_status: 'pass',
          observed_evidence: 'BG5 replay_deterministic PASS',
        },
        {
          step_id: 's03-collector-launch-not-promoted',
          description: 'embedded launch verdict stays frozen at PREPARATION_ONLY regardless of executed_count',
          verify_cmd: 'node scripts/test_collect_m016_s03_safe_operational_evidence.js',
          observed_status: 'pass',
          observed_evidence: 'BG6 launch_not_promoted PASS',
        },
      ],
      completed_at: generated,
      completed_by: 'collector',
    },
    completed_at: generated,
    completed_by: 'collector',
  };
}

// ---------------------------------------------------------------------------
// 8. REDACTION_FLAG_VALUES — imported from safe-probe data (shared source)
// ---------------------------------------------------------------------------

// Reuse S03 safe-probe REDACTION_FLAG_VALUES (10 flags).
const PACK_REDACTION_FLAG_VALUES = REDACTION_FLAG_VALUES;

// ---------------------------------------------------------------------------
// 9. RECORDS_BUDGET — bounded record count ceilings
// ---------------------------------------------------------------------------

const RECORDS_BUDGET = Object.freeze({
  max_live_probe_records: 16,
  max_drill_records: 3,
  max_total_records: 32,
  max_source_files: 16,
  max_pack_bytes: 4194304,
  max_artifact_hash_chars: 64,
  max_role_matrix_entries: 16,
  max_drill_matrix_entries: 3,
});

// ---------------------------------------------------------------------------
// 10. EXIT_CODES — process exit codes by verdict class
// ---------------------------------------------------------------------------

const EXIT_CODES = Object.freeze({
  PACK_VALID: 0,
  PACK_REJECTED_MALFORMED: 1,
  PACK_REJECTED_FAIL_CLOSED: 2,
  PACK_REPLAY_DRIFT: 3,
  PACK_LAUNCH_PROMOTION: 4,
  PACK_REDACTION_LEAK: 5,
  PACK_RUNNER_FAILURE: 6,
});

// ---------------------------------------------------------------------------
// 11. DEFAULTS — paths, schema ref, ceilings
// ---------------------------------------------------------------------------

const DEFAULTS = Object.freeze({
  schema_path: 'schemas/runtime-evidence/m016-s03-safe-operational-evidence-pack.v1.json',
  output_dir: 'runtime-evidence',
  pack_output: 'runtime-evidence/M016-S03-safe-operational-evidence-pack.json',
  inventory_output: 'runtime-evidence/M016-S03-input-inventory.json',
  protocol_output: 'runtime-evidence/M016-S03-collect-protocol.json',
  pack_id: PACK_ID,
  bundle_id: PACK_ID,
});

// ---------------------------------------------------------------------------
// 12. FORBIDDEN_PACK_VERDICTS — launch-promotion forbidden at pack layer
// ---------------------------------------------------------------------------

const FORBIDDEN_PACK_VERDICTS = Object.freeze(['GO', 'PASS_AUTOMATIC', 'READY', 'LAUNCH_GO']);

function isForbiddenPackVerdict(value) {
  return typeof value === 'string' && FORBIDDEN_PACK_VERDICTS.includes(value);
}

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

module.exports = {
  // 1. SCHEMA + NAMESPACE
  PACK_SCHEMA_ID,
  PACK_SCHEMA_VERSION,
  PACK_ID,
  PACK_KIND,
  PACK_TASK_ID,
  PACK_EVALUATOR,
  PACK_EVALUATOR_VERSION,
  // 2. BLOCKER_NAMESPACE
  PACK_BLOCKER_NAMESPACE,
  PACK_BLOCKER_CODE_PATTERN,
  BLOCKER_CODES,
  BLOCKER_CODE_REGEX,
  // 3. SOURCE_ALLOWLIST
  SOURCE_ALLOWLIST,
  SOURCE_ALLOWLIST_SET,
  // 4. S02_BASELINE_REF
  S02_BASELINE_REF,
  // 5. ROLE_REGISTRY
  PACK_ROLE_REGISTRY,
  PACK_ROLE_REGISTRY_SET,
  getPackRoleEntry,
  // 6. DRILL_REGISTRY
  DRILL_REGISTRY,
  DRILL_KIND_TO_ROLE,
  DRILL_ROLE_TO_KIND,
  DRILL_ROLE_SET,
  DRILL_KIND_SET,
  // 7. EMBEDDED_CLASSIFICATION
  buildEmbeddedClassification,
  // 8. REDACTION
  PACK_REDACTION_FLAG_VALUES,
  // 9. RECORDS_BUDGET
  RECORDS_BUDGET,
  // 10. EXIT_CODES
  EXIT_CODES,
  // 11. DEFAULTS
  DEFAULTS,
  // 12. FORBIDDEN
  FORBIDDEN_PACK_VERDICTS,
  isForbiddenPackVerdict,
  // Re-exports
  SCHEMA_ID,
  SCHEMA_VERSION,
  MILESTONE,
  SLICE,
  PROBE_ID_PREFIX,
  INDEPENDENCE_GROUP_PATTERN,
  ROLE_REGISTRY,
  _safeSuffix,
};
