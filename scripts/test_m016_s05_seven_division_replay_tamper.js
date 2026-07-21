#!/usr/bin/env node
'use strict';

/**
 * scripts/test_m016_s05_seven_division_replay_tamper.js
 *
 * M016-txa3vu / S05 / T05 — Fail-closed tamper matrix for the seven-division
 * evidence replay bundle. Drives the independent verifier
 * (scripts/verify_m016_s05_seven_division_replay.js, T03) through 24
 * single-fault fixtures covering the eight abuse classes from the slice plan:
 *
 *   1. forged_admission                                  (FT-01 .. FT-02)
 *   2. division_or_classification_drift                  (FT-03, FT-05, FT-18)
 *   3. duplicate_kind_independence                       (FT-04)
 *   4. source_ref_or_hash_mutation                       (FT-06 .. FT-10, FT-07)
 *   5. worksheet_score_or_rows_or_steps_drift            (FT-15, FT-16, FT-17)
 *   6. synthetic_credential_pii_reasoning_redaction      (FT-11 .. FT-14)
 *   7. correlation_independence_or_duplicates            (FT-19 .. FT-22, FT-24)
 *   8. replay_keys_or_bundle_digest_drift                (FT-23)
 *
 * Every fixture:
 *   - Creates its own marker-owned subdirectory under <tmp>/m016-s05-tamper-<id>/
 *   - Snapshots the seven canonical S05 sidecars + the four evidence-chain
 *     upstream sources (S02 baseline, S03 pack, S04 canary bundle, S05
 *     probe-run sidecar) into the marker root via byte-identical copies
 *     (realpath -> <marker>/...)
 *   - Applies ONE single-fault mutation to the marker copy of the targeted
 *     sidecar (or upstream source for FT-08..FT-10)
 *   - Spawns the verifier as a FRESH Node subprocess with --source-root=<marker>
 *     (a child process is mandatory because T03 has a require.cache guard that
 *     exits 8 if the producer CLI is loaded in the same process; using a
 *     subprocess keeps this fixture isolated from any other test process)
 *   - Asserts:
 *       * subprocess exit != 0
 *       * subprocess stderr carries the fixture's expected M16-S05-VERIFY-*
 *         blocker code (one or more may appear; we assert substring membership
 *         because the verifier may surface multiple correlated blockers in
 *         a single fail-closed run)
 *       * the canonical S05 sidecars (ROOT/runtime-evidence/M016-S05-*.json)
 *         remain byte-identical to their pre-fixture snapshot
 *       * the S02/S03/S04 canonical upstream sources remain byte-identical
 *       * the verify-protocol file is NOT persisted under the marker root
 *         (atomic write is skipped on any blocker — the schema requires
 *         `blockers:maxItems:0` so a drift would never satisfy the v1 schema)
 *
 * Field-shape awareness:
 *   The JSON schemas const-lock many fields (admission.sanitised=true,
 *   worksheet.weight_sum=1, embedded_classification.verdicts.{orchestration,
 *   evidence, launch} per enum, etc.). Mutating a const-locked field always
 *   fires VALIDATOR_SCHEMA_VIOLATION first, masking the runtime check we
 *   would otherwise want to exercise. Each fixture therefore mutates a field
 *   whose schema contract permits drift and whose runtime path produces a
 *   verifier-side M16-S05-VERIFY-* blocker.
 *
 * The harness also emits the canonical negative-fixtures artifact to
 * runtime-evidence/M016-S05-seven-division-replay-negative-fixtures.json —
 * sanitised class names + expected blocker codes + rationales; no fixture
 * bodies and no PII are persisted (mirrors S04 T05 negative-fixtures artifact).
 *
 * No network, no live mutation, no producer CLI import, no global state
 * mutation: every fixture is hermetic and the residue at <tmp>/m016-s05-tamper-*
 * is removed by the harness on completion via POSIX `rm -rf`. Marker roots
 * are kept below the OS tmpdir to satisfy the SCRATCH_ROOT boundary enforced
 * by the T01 contract.
 *
 * Run with: node --test scripts/test_m016_s05_seven_division_replay_tamper.js
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');

const data = require('./lib/m016-s05-seven-division-replay-data');
const contract = require('./lib/m016-s05-seven-division-replay-contract');

const {
  BLOCKER_CODES,
  EXIT_CODES,
  DEFAULTS,
  MANDATORY_CHAIN_ROLES,
  RECORDS_BUDGET,
  SOURCE_ALLOWLIST,
} = data;

const ROOT = path.resolve(__dirname, '..');
const VERIFIER_SCRIPT = 'scripts/verify_m016_s05_seven_division_replay.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_ZEROS_SHA256 = '0'.repeat(64);
// Use a v1-5 compliant UUID so the /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
// pattern in checkRedactionSafety matches.
const FAKE_UUID = '12345678-90ab-1234-8def-123456789012';
const FAKE_CREDENTIAL = 'api_key=sk-ir-1234567890abcdef01';
const FAKE_RAW_REASONING = 'let me think step by step — raw_reasoning=42';
const FAKE_VENDOR_REUSE = 'xiaomi_endpoint_reuse: /mimo/v2/chat';
const CANONICAL_NEGATIVE_REF = DEFAULTS.negative_fixtures_output;
const CANONICAL_NEGATIVE_ABS = path.join(ROOT, CANONICAL_NEGATIVE_REF);
const CANONICAL_BUNDLE_REF = DEFAULTS.bundle_output;
const CANONICAL_BUNDLE_ABS = path.join(ROOT, CANONICAL_BUNDLE_REF);

const REFERENCE_TIME = DEFAULTS.reference_time; // '2026-07-20T12:00:00.000Z'
const SEED = 'canonical';

// The four mandatory chain sources that the verifier recomputes via
// loadSource(); every fixture marker must contain these four files so the
// verifier --source-root override resolves each chain row to a copy rather
// than to the canonical file on disk.
const CHAIN_SOURCE_REFS = MANDATORY_CHAIN_ROLES.map((role) => {
  const source = SOURCE_ALLOWLIST.find((entry) => entry.chain_role === role);
  return source ? source.source_ref : null;
}).filter(Boolean);

// The seven canonical S05 sidecars that the producer/verifier exchange.
const CANONICAL_S05_SIDECAR_REFS = Object.freeze([
  DEFAULTS.bundle_output,
  DEFAULTS.admission_output,
  DEFAULTS.worksheet_output,
  DEFAULTS.producer_protocol_output,
  DEFAULTS.input_inventory_output,
  DEFAULTS.probe_run_output,
  DEFAULTS.verify_protocol_output,
]);

// ---------------------------------------------------------------------------
// Fixtures (24 single-fault templates). Each fixture owns one unique
// expected_blocker_code; mutator closures receive a deep-clone + the
// marker subdirectory absolute path so they may either mutate the cloned
// in-memory JSON or rewrite a marker-owned file's bytes. Baseline on-disk
// files in the canonical ROOT are NEVER touched.
// ---------------------------------------------------------------------------

function _deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

const FIXTURES = Object.freeze([
  // ===== 1. forged_admission (FT-01, FT-02) =====

  // FT-01 — forged admission: operator gate is explicitly unconfirmed.
  // Schema allows confirmed=false (no const lock on the boolean itself); the
  // runtime admission guard then surfaces REDACTION_BOUNDS_UNLOADED.
  {
    id: 'FT-01',
    threat_class: 'forged_admission',
    tamper_path: 'admission.operator_gate.confirmed',
    mutator_kind: 'boolean_flip',
    target_sidecar: 'admission',
    target_source_ref: null,
    baseline_value: 'true',
    tampered_value: 'false',
    expected_blocker_code: BLOCKER_CODES.VALIDATOR_REDACTION_BOUNDS_UNLOADED(),
    rationale: 'admission.operator_gate.confirmed must be true for any replay admission; forged denial must surface as a redaction-bound violation so S06 admission can grep the blocker cleanly.',
    mutator: function (clone) { clone.operator_gate.confirmed = false; },
  },

  // FT-02 — admission confirmed_at=null: schema explicitly allows the null
  // branch (type is `["string","null"]` with pattern on string) so the
  // mutation reaches the verifier at runtime. The second runtime guard
  // (`!confirmed_at`) fires VALIDATOR_RUNNER_FAILURE.
  {
    id: 'FT-02',
    threat_class: 'forged_admission',
    tamper_path: 'admission.operator_gate.confirmed_at',
    mutator_kind: 'null_value',
    target_sidecar: 'admission',
    target_source_ref: null,
    baseline_value: '<canonical ISO timestamp>',
    tampered_value: 'null',
    expected_blocker_code: BLOCKER_CODES.VALIDATOR_RUNNER_FAILURE(),
    rationale: 'admission.operator_gate.confirmed_at must be a non-null ISO timestamp once the gate is confirmed; nullifying it bypasses the gate reference and must surface as a runner failure (R041).',
    mutator: function (clone) { clone.operator_gate.confirmed_at = null; },
  },

  // ===== 2. division_or_classification_drift (FT-03, FT-05, FT-18) =====

  // FT-03 — missing division: change Div7.MissionControl role to an infra
  // role name that already exists in the live partition. Both CORRELATION
  // _DUPLICATE(role:live_replay_record, ...) and DIVISION_MISSING fire; the
  // expected blocker is DIVISION_MISSING (asserted as a substring so the
  // preceding CORRELATION_DUPLICATE blocker is permitted to coexist).
  {
    id: 'FT-03',
    threat_class: 'division_or_classification_drift',
    tamper_path: 'bundle.records[role=Div7.MissionControl].role',
    mutator_kind: 'role_rename_to_existing_infra',
    target_sidecar: 'bundle',
    target_source_ref: null,
    baseline_value: 'Div7.MissionControl',
    tampered_value: 'redaction_posture_audit',
    expected_blocker_code: BLOCKER_CODES.VALIDATOR_DIVISION_MISSING('Div7.MissionControl'),
    rationale: 'divisions Div1..Div7 are mandatory coverage; renaming the Div7.MissionControl record to an infrastructure role collapses the seven-division invariant that R038 frames without violating the role schema regex.',
    mutator: function (clone) {
      const target = clone.records.find((r) => r.role === 'Div7.MissionControl');
      if (target) target.role = 'redaction_posture_audit';
    },
  },

  // FT-05 — classification drift: flip a drill-replay record from EXECUTED
  // to NOT_PROVEN. Schema allows the field change; runtime contract
  // buildEmbeddedClassification re-derives hard_gates.HG3 RECOVERY_EVIDENCE
  // from records and surfaces a deepEqual drift as
  // VALIDATOR_GATE_DERIVATION_DRIFT('hard_gates').
  {
    id: 'FT-05',
    threat_class: 'division_or_classification_drift',
    tamper_path: 'bundle.records[role=restore_drill].classification',
    mutator_kind: 'classification_flip',
    target_sidecar: 'bundle',
    target_source_ref: null,
    baseline_value: 'EXECUTED',
    tampered_value: 'NOT_PROVEN',
    expected_blocker_code: BLOCKER_CODES.VALIDATOR_GATE_DERIVATION_DRIFT('hard_gates'),
    rationale: 'classification drift at the record level silently alters HG1..HG8 weights and the orchestration/evidence/launch verdict triple; re-derivation must surface the drift.',
    mutator: function (clone) {
      const target = clone.records.find((r) => r.kind === 'drill_replay_record' && r.role === 'restore_drill');
      if (target) {
        target.classification = 'NOT_PROVEN';
        target.attempted_exit_code = 599;
        target.observed_blocker_code = 'M16-S03-PROBE-FT-05-DRIFT';
        target.observed_blocker_reason = 'tamper fixture FT-05 classification drift';
      }
    },
  },

  // FT-18 — verdict promotion: claim verdicts.launch='GO_BOUNDED_INTERNAL'
  // (passes the LAUNCH enum) while re-derivation collapses to PREPARATION_ONLY
  // (because records make hard_gates 'pass' but launch is still PREPARATION_ONLY
  // since only GO_BOUNDED_INTERNAL forces the launch promotion path).
  {
    id: 'FT-18',
    threat_class: 'division_or_classification_drift',
    tamper_path: 'bundle.embedded_classification.verdicts.launch',
    mutator_kind: 'verdict_promotion',
    target_sidecar: 'bundle',
    target_source_ref: null,
    baseline_value: 'PREPARATION_ONLY',
    tampered_value: 'GO_BOUNDED_INTERNAL',
    expected_blocker_code: BLOCKER_CODES.VALIDATOR_GATE_DERIVATION_DRIFT('verdicts'),
    rationale: 'launch verdict promotion to GO_BOUNDED_INTERNAL requires all HG* gates to be re-derived `pass`; flipping it on top of unchanged records forces a deepEqual drift on verdicts and yields GATE_DERIVATION_DRIFT(verdicts).',
    mutator: function (clone) { clone.embedded_classification.verdicts.launch = 'GO_BOUNDED_INTERNAL'; },
  },

  // ===== 3. duplicate_kind_independence (FT-04) =====

  // FT-04 — duplicate (kind, independence_group): mutate Div6.External's
  // independence_group to collide with Div1.HCO. The verifier's
  // `indepSeen` accumulator detects the (kind, independence_group)
  // duplicate and pushes VALIDATOR_INDEPENDENCE_VIOLATION.
  {
    id: 'FT-04',
    threat_class: 'duplicate_kind_independence',
    tamper_path: 'bundle.records[role=Div6.External].independence_group',
    mutator_kind: 'independence_collision',
    target_sidecar: 'bundle',
    target_source_ref: null,
    baseline_value: 'm016-s03-probe-div6-external',
    tampered_value: 'm016-s03-probe-div1-hco',
    expected_blocker_code: BLOCKER_CODES.VALIDATOR_INDEPENDENCE_VIOLATION(),
    rationale: '(kind, independence_group) uniqueness is the fail-closed invariant of the live probe independence taxonomy (R039); any collision must surface as an independence violation.',
    mutator: function (clone) {
      const target = clone.records.find((r) => r.role === 'Div6.External');
      if (target) target.independence_group = 'm016-s03-probe-div1-hco';
    },
  },

  // ===== 4. source_ref_or_hash_mutation (FT-06 .. FT-10, FT-07) =====

  // FT-06 — evidence_chain[0].pre_hash_sha256=ALL_ZEROS, s02_baseline
  // chain_role. Verifier recomputes source sha256 from marker copies and
  // pushes VALIDATOR_S02_HASH_DRIFT (chain-role-aware).
  {
    id: 'FT-06',
    threat_class: 'source_ref_or_hash_mutation',
    tamper_path: 'bundle.evidence_chain[chain_role=s02_baseline].pre_hash_sha256',
    mutator_kind: 'hash_drift',
    target_sidecar: 'bundle',
    target_source_ref: CHAIN_SOURCE_REFS[0],
    baseline_value: '<canonical s02 hash>',
    tampered_value: ALL_ZEROS_SHA256,
    expected_blocker_code: 'M16-S05-VERIFY-S02-HASH-DRIFT-' + ALL_ZEROS_SHA256.slice(0, 8),
    rationale: 's02 baseline pre_hash_sha256 is the immutable fingerprint of the upstream BOS mission proof (R038); any drift breaks the pre==post equality invariant and yields a chain-role-aware S02 hash drift blocker.',
    mutator: function (clone) {
      const row = clone.evidence_chain.find((r) => r.chain_role === 's02_baseline');
      if (row) row.pre_hash_sha256 = ALL_ZEROS_SHA256;
    },
  },

  // FT-07 — evidence_chain[0].unchanged=false while pre==post stays true.
  // Schema allows the boolean. Runtime `derivedUnchanged !== row.unchanged`
  // pushes VALIDATOR_EVIDENCE_CHAIN_BROKEN(s02_baseline) before the SHA /
  // allowlist checks, isolating the immutability invariant.
  {
    id: 'FT-07',
    threat_class: 'source_ref_or_hash_mutation',
    tamper_path: 'bundle.evidence_chain[chain_role=s02_baseline].unchanged',
    mutator_kind: 'boolean_flip',
    target_sidecar: 'bundle',
    target_source_ref: CHAIN_SOURCE_REFS[0],
    baseline_value: 'true',
    tampered_value: 'false',
    expected_blocker_code: BLOCKER_CODES.VALIDATOR_EVIDENCE_CHAIN_BROKEN('s02_baseline'),
    rationale: 'unchanged is the boolean flag for "pre==post without externally-imposed shift"; flipping it without moving the underlying hashes exposes a chain-level invariant violation (R038).',
    mutator: function (clone) {
      const row = clone.evidence_chain.find((r) => r.chain_role === 's02_baseline');
      if (row) row.unchanged = false;
    },
  },

  // FT-08 — evidence_chain[1].pre_hash_sha256=ALL_ZEROS, s03_pack
  // chain_role.
  {
    id: 'FT-08',
    threat_class: 'source_ref_or_hash_mutation',
    tamper_path: 'bundle.evidence_chain[chain_role=s03_pack].pre_hash_sha256',
    mutator_kind: 'hash_drift',
    target_sidecar: 'bundle',
    target_source_ref: CHAIN_SOURCE_REFS[1],
    baseline_value: '<canonical s03 hash>',
    tampered_value: ALL_ZEROS_SHA256,
    expected_blocker_code: 'M16-S05-VERIFY-S03-HASH-DRIFT-' + ALL_ZEROS_SHA256.slice(0, 8),
    rationale: 's03 pack pre_hash_sha256 is the immutable fingerprint of the upstream safe-operational evidence pack; any drift yields a chain-role-aware S03 hash drift blocker (separate code from S02/S04/replay).',
    mutator: function (clone) {
      const row = clone.evidence_chain.find((r) => r.chain_role === 's03_pack');
      if (row) row.pre_hash_sha256 = ALL_ZEROS_SHA256;
    },
  },

  // FT-09 — evidence_chain[2].pre_hash_sha256=ALL_ZEROS, s04_canary_bundle
  // chain_role.
  {
    id: 'FT-09',
    threat_class: 'source_ref_or_hash_mutation',
    tamper_path: 'bundle.evidence_chain[chain_role=s04_canary_bundle].pre_hash_sha256',
    mutator_kind: 'hash_drift',
    target_sidecar: 'bundle',
    target_source_ref: CHAIN_SOURCE_REFS[2],
    baseline_value: '<canonical s04 hash>',
    tampered_value: ALL_ZEROS_SHA256,
    expected_blocker_code: 'M16-S05-VERIFY-S04-CANARY-HASH-DRIFT-' + ALL_ZEROS_SHA256.slice(0, 8),
    rationale: 's04 canary bundle pre_hash_sha256 is the upstream readiness witness for Div4 / Div5; mutation yields a chain-role-aware S04 hash drift blocker.',
    mutator: function (clone) {
      const row = clone.evidence_chain.find((r) => r.chain_role === 's04_canary_bundle');
      if (row) row.pre_hash_sha256 = ALL_ZEROS_SHA256;
    },
  },

  // FT-10 — evidence_chain[3].pre_hash_sha256=ALL_ZEROS, replay_probe_run
  // chain_role. (probe-run is the S05 self-write sidecar; mutating its
  // declared hash while the file bytes remain canonical yields a
  // REPLAY_PROBE_RUN_DRIFT blocker.)
  {
    id: 'FT-10',
    threat_class: 'source_ref_or_hash_mutation',
    tamper_path: 'bundle.evidence_chain[chain_role=replay_probe_run].pre_hash_sha256',
    mutator_kind: 'hash_drift',
    target_sidecar: 'bundle',
    target_source_ref: CHAIN_SOURCE_REFS[3],
    baseline_value: '<canonical replay_probe_run hash>',
    tampered_value: ALL_ZEROS_SHA256,
    expected_blocker_code: 'M16-S05-VERIFY-REPLAY-PROBE-RUN-DRIFT-' + ALL_ZEROS_SHA256.slice(0, 8),
    rationale: 'replay_probe_run pre_hash_sha256 is the witness for the S05 probe-run sidecar; drift yields a chain-role-aware REPLAY_PROBE_RUN_DRIFT blocker (separate code from S02/S03/S04).',
    mutator: function (clone) {
      const row = clone.evidence_chain.find((r) => r.chain_role === 'replay_probe_run');
      if (row) row.pre_hash_sha256 = ALL_ZEROS_SHA256;
    },
  },

  // ===== 5. worksheet_score_or_rows_or_steps_drift (FT-15, FT-16, FT-17) =====

  // FT-15 — bundle.scoring_worksheet.score drift. Schema range [0,1] permits
  // the value; runtime contract.buildScoringWorksheet re-derives from
  // records and surfaces GATE_DERIVATION_DRIFT('score').
  {
    id: 'FT-15',
    threat_class: 'worksheet_score_or_rows_or_steps_drift',
    tamper_path: 'bundle.scoring_worksheet.score',
    mutator_kind: 'numeric_drift',
    target_sidecar: 'bundle',
    target_source_ref: null,
    baseline_value: '<canonical score>',
    tampered_value: 0.42,
    expected_blocker_code: BLOCKER_CODES.VALIDATOR_GATE_DERIVATION_DRIFT('score'),
    rationale: 'scoring_worksheet.score is the bounded rollup of three weighted steps; drift outside the contract-traced re-derivation must surface as a GATE_DERIVATION_DRIFT(score) so S06 admission can pin the exact field.',
    mutator: function (clone) { clone.scoring_worksheet.score = 0.42; },
  },

  // FT-16 — bundle.scoring_worksheet.rows[0].contribution drift.
  // contribution has min/max [0,1] in schema; runtime per-row deepEqual
  // detects the drift and pushes GATE_DERIVATION_DRIFT('worksheet.rows[0]').
  {
    id: 'FT-16',
    threat_class: 'worksheet_score_or_rows_or_steps_drift',
    tamper_path: 'bundle.scoring_worksheet.rows[0].contribution',
    mutator_kind: 'numeric_drift',
    target_sidecar: 'bundle',
    target_source_ref: null,
    baseline_value: '<canonical HG1 contribution>',
    tampered_value: 0.99,
    expected_blocker_code: BLOCKER_CODES.VALIDATOR_GATE_DERIVATION_DRIFT('worksheet.rows[0]'),
    rationale: 'each HG row carries a frozen contribution = weight * numeric_mapping; tampering one row collapses the audit trail for HG1 SEMANTIC_RULE_COMPLIANCE and must surface as a per-row drift blocker.',
    mutator: function (clone) {
      const row = clone.scoring_worksheet.rows[0];
      if (row) row.contribution = 0.99;
    },
  },

  // FT-17 — bundle.scoring_worksheet.steps[0].numeric_mapping drift.
  // step numeric_mapping has min/max [0,1] in schema; runtime per-step
  // deepEqual detects the drift and pushes GATE_DERIVATION_DRIFT('worksheet.steps[0]').
  {
    id: 'FT-17',
    threat_class: 'worksheet_score_or_rows_or_steps_drift',
    tamper_path: 'bundle.scoring_worksheet.steps[0].numeric_mapping',
    mutator_kind: 'numeric_drift',
    target_sidecar: 'bundle',
    target_source_ref: null,
    baseline_value: '<canonical step_orchestration numeric_mapping>',
    tampered_value: 0.99,
    expected_blocker_code: BLOCKER_CODES.VALIDATOR_GATE_DERIVATION_DRIFT('worksheet.steps[0]'),
    rationale: 'each worksheet step carries a numeric_mapping field that drives the bounded rollup score; tampering one step collapses the worksheet audit trail and must surface as a per-step drift blocker.',
    mutator: function (clone) {
      const step = clone.scoring_worksheet.steps[0];
      if (step) step.numeric_mapping = 0.99;
    },
  },

  // ===== 6. synthetic_credential_pii_reasoning_redaction (FT-11 .. FT-14) =====

  // FT-11 — synthetic credential leak in records[Div2.MasterPlanner].command.
  // The credentials regex `/(?:api[_-]?key|access[_-]?token|bearer|password|
  // secret)\s*[:=]\s*[^\s,;}]+/i` matches. Validator surfaces
  // VALIDATOR_REDACTION_LEAK('credentials').
  {
    id: 'FT-11',
    threat_class: 'synthetic_credential_pii_reasoning_redaction',
    tamper_path: 'bundle.records[role=Div2.MasterPlanner].command',
    mutator_kind: 'credential_injection',
    target_sidecar: 'bundle',
    target_source_ref: null,
    baseline_value: '<canonical command>',
    tampered_value: FAKE_CREDENTIAL,
    expected_blocker_code: BLOCKER_CODES.VALIDATOR_REDACTION_LEAK('credentials'),
    rationale: 'credential-class leakage in any replay record must surface as a REDACTION_LEAK(credentials) blocker (R040); the verifier walks every record.command and record.method before any score check.',
    mutator: function (clone) {
      const target = clone.records.find((r) => r.role === 'Div2.MasterPlanner');
      if (target) target.command = FAKE_CREDENTIAL;
    },
  },

  // FT-12 — synthetic UUID leak in records[Div3.Treasury].command.
  // The full_ids regex `/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-
  // [89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i` matches a v5-compliant UUID.
  {
    id: 'FT-12',
    threat_class: 'synthetic_credential_pii_reasoning_redaction',
    tamper_path: 'bundle.records[role=Div3.Treasury].command',
    mutator_kind: 'uuid_injection',
    target_sidecar: 'bundle',
    target_source_ref: null,
    baseline_value: '<canonical command>',
    tampered_value: 'probe ' + FAKE_UUID,
    expected_blocker_code: BLOCKER_CODES.VALIDATOR_REDACTION_LEAK('full_ids'),
    rationale: 'any full UUID leak in replay records or commands violates the bounded-digests-only invariant (R040); the verifier must surface it as REDACTION_LEAK(full_ids) so the operator-gate token cannot bypass.',
    mutator: function (clone) {
      const target = clone.records.find((r) => r.role === 'Div3.Treasury');
      if (target) target.command = 'probe ' + FAKE_UUID;
    },
  },

  // FT-13 — synthetic raw_reasoning leak in records[Div5].command.
  // The raw_reasoning regex `/(?:raw[_-]?reasoning|chain[_-]?of[_-]?
  // thought|private[_-]?reasoning)/i` matches. Validator surfaces
  // VALIDATOR_REDACTION_LEAK('raw_reasoning').
  {
    id: 'FT-13',
    threat_class: 'synthetic_credential_pii_reasoning_redaction',
    tamper_path: 'bundle.records[role=Div5.QualificationsLibraryLearning].command',
    mutator_kind: 'raw_reasoning_injection',
    target_sidecar: 'bundle',
    target_source_ref: null,
    baseline_value: '<canonical command>',
    tampered_value: FAKE_RAW_REASONING,
    expected_blocker_code: BLOCKER_CODES.VALIDATOR_REDACTION_LEAK('raw_reasoning'),
    rationale: 'raw_reasoning or chain-of-thought leakage violates the bounded-reasoning invariant (R040); the verifier must surface it as REDACTION_LEAK(raw_reasoning) so S06 admission can grep the exact kind.',
    mutator: function (clone) {
      const target = clone.records.find((r) => r.role === 'Div5.QualificationsLibraryLearning');
      if (target) target.command = FAKE_RAW_REASONING;
    },
  },

  // FT-14 — synthetic vendor_reuse_strings leak (xiaomi/mimo/vendor_reuse)
  // in records[Div6.External].command. Validator surfaces
  // VALIDATOR_REDACTION_LEAK('vendor_reuse_strings').
  {
    id: 'FT-14',
    threat_class: 'synthetic_credential_pii_reasoning_redaction',
    tamper_path: 'bundle.records[role=Div6.External].command',
    mutator_kind: 'vendor_reuse_injection',
    target_sidecar: 'bundle',
    target_source_ref: null,
    baseline_value: '<canonical command>',
    tampered_value: FAKE_VENDOR_REUSE,
    expected_blocker_code: BLOCKER_CODES.VALIDATOR_REDACTION_LEAK('vendor_reuse_strings'),
    rationale: 'vendor_reuse_strings (xiaomi/mimo/vendor-reuse tokens) leakage is the cross-vendor invariant (R040); the verifier must surface it as REDACTION_LEAK(vendor_reuse_strings).',
    mutator: function (clone) {
      const target = clone.records.find((r) => r.role === 'Div6.External');
      if (target) target.command = FAKE_VENDOR_REUSE;
    },
  },

  // ===== 7. correlation_independence_or_duplicates (FT-19 .. FT-22, FT-24) =====

  // FT-19 — correlation row independence_group mismatch: probe_to_criterion
  // row[0].independence_group flipped to a fake value. Row-by-row match
  // fails (independence_group != rec.independence_group), pushing
  // VALIDATOR_CORRELATION_INDEPENDENCE_GROUP_UNKNOWN.
  {
    id: 'FT-19',
    threat_class: 'correlation_independence_or_duplicates',
    tamper_path: 'bundle.correlation_contract.probe_to_criterion[0].independence_group',
    mutator_kind: 'correlation_drift',
    target_sidecar: 'bundle',
    target_source_ref: null,
    baseline_value: '<matched to record>',
    tampered_value: 'm016-s03-probe-fake-tampered-group',
    expected_blocker_code: BLOCKER_CODES.VALIDATOR_CORRELATION_INDEPENDENCE_GROUP_UNKNOWN('m016-s03-probe-fake-tampered-group'),
    rationale: 'correlation rows must mirror the immutable record keys (kind + independence_group); any mismatch must surface as CORRELATION_INDEPENDENCE_GROUP_UNKNOWN so S06 cannot be tricked into a phantom agent_run.',
    mutator: function (clone) {
      const row = clone.correlation_contract.probe_to_criterion[0];
      if (row) {
        // probeRow has no `kind` field; the kind prefix is encoded only in
        // independence_key, so we hardcode the canonical live prefix.
        row.independence_group = 'm016-s03-probe-fake-tampered-group';
        row.independence_key = 'live_replay_record:m016-s03-probe-fake-tampered-group';
      }
    },
  },

  // FT-20 — correlation duplicate evidence_id: probe_to_criterion[1].
  // .evidence_id copied onto probe_to_criterion[0].evidence_id. The
  // uniqueness check fires VALIDATOR_CORRELATION_DUPLICATE('evidence_id', X).
  {
    id: 'FT-20',
    threat_class: 'correlation_independence_or_duplicates',
    tamper_path: 'bundle.correlation_contract.probe_to_criterion[1].evidence_id',
    mutator_kind: 'correlation_duplicate_evidence_id',
    target_sidecar: 'bundle',
    target_source_ref: null,
    baseline_value: '<unique>',
    tampered_value: '<duplicated from row[0]>',
    expected_blocker_code: 'M16-S05-VERIFY-CORRELATION-DUPLICATE-evidence_id-',
    rationale: 'correlation.evidence_id must be unique across all 19 rows; duplicating one collapses the audit trail of the underlying live probe (R039) and must surface as CORRELATION_DUPLICATE.',
    mutator: function (clone) {
      const rows = clone.correlation_contract.probe_to_criterion;
      if (rows && rows.length > 1) rows[1].evidence_id = rows[0].evidence_id;
    },
  },

  // FT-21 — correlation duplicate probe_id: probe_to_criterion[1].probe_id
  // copied onto probe_to_criterion[0].probe_id. The uniqueness check
  // fires VALIDATOR_CORRELATION_DUPLICATE('probe_id', X).
  {
    id: 'FT-21',
    threat_class: 'correlation_independence_or_duplicates',
    tamper_path: 'bundle.correlation_contract.probe_to_criterion[1].probe_id',
    mutator_kind: 'correlation_duplicate_probe_id',
    target_sidecar: 'bundle',
    target_source_ref: null,
    baseline_value: '<unique>',
    tampered_value: '<duplicated from row[0]>',
    expected_blocker_code: 'M16-S05-VERIFY-CORRELATION-DUPLICATE-probe_id-',
    rationale: 'correlation.probe_id must be unique across all 19 rows; duplicating one collapses the audit trail (R039) and must surface as CORRELATION_DUPLICATE(probe_id, ...).',
    mutator: function (clone) {
      const rows = clone.correlation_contract.probe_to_criterion;
      if (rows && rows.length > 1) rows[1].probe_id = rows[0].probe_id;
    },
  },

  // FT-22 — correlation duplicate independence_key: probe_to_criterion[1].
  // independence_key copied onto probe_to_criterion[0].independence_key.
  // The uniqueness check fires VALIDATOR_CORRELATION_DUPLICATE
  // ('independence_key', X).
  {
    id: 'FT-22',
    threat_class: 'correlation_independence_or_duplicates',
    tamper_path: 'bundle.correlation_contract.probe_to_criterion[1].independence_key',
    mutator_kind: 'correlation_duplicate_independence_key',
    target_sidecar: 'bundle',
    target_source_ref: null,
    baseline_value: '<unique>',
    tampered_value: '<duplicated from row[0]>',
    expected_blocker_code: 'M16-S05-VERIFY-CORRELATION-DUPLICATE-independence_key-',
    rationale: 'correlation.independence_key must be unique (kind + independence_group fingerprint); duplicating one breaks the unique-fingerprint invariant (R039) and must surface as CORRELATION_DUPLICATE(independence_key, ...).',
    mutator: function (clone) {
      const rows = clone.correlation_contract.probe_to_criterion;
      if (rows && rows.length > 1) rows[1].independence_key = rows[0].independence_key;
    },
  },

  // FT-24 — correlation probe not in records: probe_to_criterion[0]
  // .probe_id mutated to a value that matches the regex but does not
  // correspond to any record.reused_probe_id. Verifier's recordsByProbe
  // lookup returns undefined → push VALIDATOR_CORRELATION_PROBE_NOT_IN_S03.
  {
    id: 'FT-24',
    threat_class: 'correlation_independence_or_duplicates',
    tamper_path: 'bundle.correlation_contract.probe_to_criterion[0].probe_id',
    mutator_kind: 'correlation_probe_phantom',
    target_sidecar: 'bundle',
    target_source_ref: null,
    baseline_value: '<maps to record[0].reused_probe_id>',
    tampered_value: 'M16-S03-PROBE-NONEXISTENT-FT24',
    expected_blocker_code: 'M16-S05-VERIFY-CORRELATION-PROBE-NOT-IN-S03-',
    rationale: 'correlation.probe_id must correspond to an existing record.reused_probe_id; a phantom probe yields a CORRELATION_PROBE_NOT_IN_S03 blocker so S06 cannot be tricked into a stale correlation row.',
    mutator: function (clone) {
      const row = clone.correlation_contract.probe_to_criterion[0];
      if (row) row.probe_id = 'M16-S03-PROBE-NONEXISTENT-FT24';
    },
  },

  // ===== 8. replay_keys_or_bundle_digest_drift (FT-23) =====

  // FT-23 — replay_keys.first_run_provenance_hash = ALL_ZEROS. Schema
  // digest pattern (^[a-f0-9]{64}$) accepts ALL_ZEROS_SHA256. Runtime
  // attachReplayKeys re-derives from bundle.body and pushes
  // VALIDATOR_REPLAY_DRIFT (first_run != re-derived).
  {
    id: 'FT-23',
    threat_class: 'replay_keys_or_bundle_digest_drift',
    tamper_path: 'bundle.replay_keys.first_run_provenance_hash',
    mutator_kind: 'hash_drift',
    target_sidecar: 'bundle',
    target_source_ref: null,
    baseline_value: '<canonical first_run>',
    tampered_value: ALL_ZEROS_SHA256,
    expected_blocker_code: BLOCKER_CODES.VALIDATOR_REPLAY_DRIFT(),
    rationale: 'first_run_provenance_hash is recomputed independently via attachReplayKeys; any drift breaks the byte-stable replay trail (SG3 / R038) and must surface as REPLAY_DRIFT.',
    mutator: function (clone) { clone.replay_keys.first_run_provenance_hash = ALL_ZEROS_SHA256; },
  },
]);

// ---------------------------------------------------------------------------
// Helpers — marker root, snapshot/copy, mutator application, subprocess
// ---------------------------------------------------------------------------

function _sha256Hex(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function _createMarkerRoot(fixtureId) {
  // Use OS tmpdir to satisfy the SCRATCH_ROOT boundary enforced by the
  // T01 contract (it allows /tmp/, /private/tmp/, /var/folders/).
  const base = process.env.TMPDIR || os.tmpdir();
  const root = path.join(base, 'm016-s05-tamper-' + fixtureId + '-' + crypto.randomBytes(4).toString('hex'));
  fs.mkdirSync(path.join(root, 'runtime-evidence'), { recursive: true });
  return root;
}

function _cleanupMarkerRoot(markerRoot) {
  // POSIX rm -rf; non-fatal if marker is already gone.
  try { fs.rmSync(markerRoot, { recursive: true, force: true }); } catch (_e) { /* ignore */ }
}

function _copyToMarker(sourceRef, markerRoot) {
  const src = path.join(ROOT, sourceRef);
  const dst = path.join(markerRoot, sourceRef);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  return dst;
}

// Copy a canonical source file into the marker, retrying with exponential
// backoff if the source is transiently missing. The T04 integration test
// (admit path) uses a backup-and-delete strategy that momentarily removes
// canonical sidecars; if `node --test` ever runs files in parallel, the
// half-life of a missing canonical file is short. A 2-3 s retry window
// resolves the race transparently without changing serial-mode behaviour.
function _copyWithRetry(srcAbs, dstAbs, maxAttempts, baseDelayMs) {
  const attempts = maxAttempts != null ? maxAttempts : 12;
  const delayMs = baseDelayMs != null ? baseDelayMs : 25;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (fs.existsSync(srcAbs)) {
      try {
        fs.copyFileSync(srcAbs, dstAbs);
        return true;
      } catch (_e) { /* race: file deleted between existsSync and copyFileSync */ }
    }
    if (attempt < attempts - 1) {
      // Synchronous exponential backoff: 25, 50, 100, ... bounded at 400 ms.
      const sleepMs = Math.min(delayMs * Math.pow(2, attempt), 400);
      const end = Date.now() + sleepMs;
      while (Date.now() < end) { /* spin */ }
    }
  }
  return false;
}

function _setupMarkerFiles(markerRoot) {
  // Copy the seven canonical S05 sidecars into the marker root so the
  // verifier --source-root override resolves them via the frozen
  // runtime-evidence/ relative paths.
  for (const sourceRef of CANONICAL_S05_SIDECAR_REFS) {
    const srcAbs = path.join(ROOT, sourceRef);
    const dstAbs = path.join(markerRoot, sourceRef);
    if (!_copyWithRetry(srcAbs, dstAbs)) {
      throw new Error('canonical sidecar missing or persistently unavailable: ' + sourceRef);
    }
  }
  // Copy the four mandatory chain sources so the verifier recomputes the
  // correct sha256 and detects any upstream mutation.
  for (const sourceRef of CHAIN_SOURCE_REFS) {
    const srcAbs = path.join(ROOT, sourceRef);
    const dstAbs = path.join(markerRoot, sourceRef);
    if (!_copyWithRetry(srcAbs, dstAbs)) {
      throw new Error('canonical chain source missing or persistently unavailable: ' + sourceRef);
    }
  }
}

function _applyMutator(fixture, markerRoot) {
  if (fixture.target_sidecar === 'bundle') {
    const bundlePath = path.join(markerRoot, DEFAULTS.bundle_output);
    const clone = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
    fixture.mutator(clone);
    fs.writeFileSync(bundlePath, JSON.stringify(clone, null, 2));
    return bundlePath;
  }
  if (fixture.target_sidecar === 'admission') {
    const admissionPath = path.join(markerRoot, DEFAULTS.admission_output);
    const clone = JSON.parse(fs.readFileSync(admissionPath, 'utf8'));
    fixture.mutator(clone);
    fs.writeFileSync(admissionPath, JSON.stringify(clone, null, 2));
    return admissionPath;
  }
  throw new Error('unknown target_sidecar for ' + fixture.id + ': ' + fixture.target_sidecar);
}

function _runVerifierAgainstMarker(markerRoot) {
  const protocolOut = path.join(markerRoot, 'runtime-evidence', 'M016-S05-seven-division-replay-verify-protocol-tamper.json');
  if (fs.existsSync(protocolOut)) fs.unlinkSync(protocolOut);
  const args = [
    VERIFIER_SCRIPT,
    '--source-root', markerRoot,
    '--protocol-out', protocolOut,
    '--iterations', '1',
    '--reference-time', REFERENCE_TIME,
    '--seed', SEED,
    '--bundle-path', DEFAULTS.bundle_output,
    '--admission-path', DEFAULTS.admission_output,
    '--worksheet-path', DEFAULTS.worksheet_output,
    '--producer-protocol-path', DEFAULTS.producer_protocol_output,
    '--input-inventory-path', DEFAULTS.input_inventory_output,
    '--probe-run-path', DEFAULTS.probe_run_output,
  ];
  const result = spawnSync('node', args, { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
  return {
    exitCode: result.status == null ? -1 : result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    protocolOut,
  };
}

// ---------------------------------------------------------------------------
// Negative-fixtures artifact (sanitised). Emitted on module load so the
// artifact exists even if a fixture fails.
// ---------------------------------------------------------------------------

const THREAT_CLASS_RE = /^[a-z][a-z0-9_]+$/;

function _coverageSummary() {
  const summary = {};
  for (const f of FIXTURES) {
    summary[f.threat_class] = (summary[f.threat_class] || 0) + 1;
  }
  return summary;
}

function _buildArtifact() {
  const baseline = fs.existsSync(CANONICAL_BUNDLE_ABS)
    ? JSON.parse(fs.readFileSync(CANONICAL_BUNDLE_ABS, 'utf8'))
    : null;
  const fixtures = FIXTURES.map(function (f) {
    return {
      fixture_id: f.id,
      threat_class: f.threat_class,
      tamper_path: f.tamper_path,
      mutator_kind: f.mutator_kind,
      target_sidecar: f.target_sidecar,
      target_source_ref: f.target_source_ref || null,
      baseline_value: f.baseline_value,
      tampered_value: f.tampered_value,
      expected_blocker_code: f.expected_blocker_code,
      rationale: f.rationale,
      evidence_ref: CANONICAL_NEGATIVE_REF,
    };
  });
  return {
    schema_id: 'https://gsd.local/schemas/runtime-evidence/m016-s05-seven-division-replay-negative-fixtures.v1.json',
    schema_version: 'v1',
    fixture_set_id: 'm016-s05-seven-division-replay-negative-fixtures-v1',
    fixture_set_kind: 'seven-division-evidence-replay-negative-fixtures',
    milestone: data.MILESTONE,
    slice: data.SLICE,
    task: 'T05',
    generated: data.DEFAULTS.reference_time,
    line_class: data.VERIFIER_LINE_CLASS,
    canonical_protocol: data.VERIFIER_CANONICAL_PROTOCOL,
    baseline_bundle: CANONICAL_BUNDLE_REF,
    baseline_bundle_sha256: (baseline && baseline.bundle_digest) || '<unavailable>',
    runner_command: 'node --test scripts/test_m016_s05_seven_division_replay_tamper.js',
    evaluation_command: 'node scripts/verify_m016_s05_seven_division_replay.js --source-root <marker> --protocol-out <marker>/runtime-evidence/M016-S05-seven-division-replay-verify-protocol-tamper.json',
    fixture_count: fixtures.length,
    unique_blocker_codes: fixtures.length,
    non_zero_exit_codes: fixtures.every(function (f) {
      const prefix = 'M16-S05-VERIFY-';
      return contract.mapBlockerToExitCode(f.expected_blocker_code) !== EXIT_CODES.REPLAY_PASS;
    }),
    coverage_summary: _coverageSummary(),
    schema_path: data.DEFAULTS.schema_path,
    producer_protocol_path: data.DEFAULTS.producer_protocol_output,
    verify_protocol_path: data.DEFAULTS.verify_protocol_output,
    fixtures: fixtures,
  };
}

// Emit artifact at module load (idempotent overwrite).
(function _emitArtifact() {
  const artifact = _buildArtifact();
  fs.mkdirSync(path.dirname(CANONICAL_NEGATIVE_ABS), { recursive: true });
  fs.writeFileSync(CANONICAL_NEGATIVE_ABS, JSON.stringify(artifact, null, 2) + '\n');
})();

// ---------------------------------------------------------------------------
// Canonical preservation snapshot helpers.
// ---------------------------------------------------------------------------

function _hashOnDisk(absPath) {
  if (!fs.existsSync(absPath)) return null;
  return _sha256Hex(fs.readFileSync(absPath));
}

// Capture a snapshot of canonical file hashes, waiting until every file
// exists. The T04 integration admit path momentarily removes canonical
// sidecars; in parallel execution that gap can coincide with T05's
// snapshot capture. The wait-for-stable loop lets T05 take a clean
// baseline regardless of how T04 is scheduled relative to T05.
function _waitForCanonicalFiles(refs, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    let allPresent = true;
    for (const ref of refs) {
      if (!fs.existsSync(path.join(ROOT, ref))) { allPresent = false; break; }
    }
    if (allPresent) return;
    const sleepMs = 50;
    const end = Date.now() + sleepMs;
    while (Date.now() < end) { /* spin */ }
  }
}

function _snapshotCanonicalFiles() {
  const refs = CANONICAL_S05_SIDECAR_REFS.concat(CHAIN_SOURCE_REFS);
  _waitForCanonicalFiles(refs, 5000);
  const out = {};
  for (const ref of refs) {
    out[ref] = _hashOnDisk(path.join(ROOT, ref));
  }
  // Take a second pass to confirm stability (no concurrent mid-flight
  // update). If different, keep the second value as the post-stability hash.
  let firstPass = Object.assign({}, out);
  _waitForCanonicalFiles(refs, 5000);
  for (const ref of refs) {
    out[ref] = _hashOnDisk(path.join(ROOT, ref));
  }
  // If a third pass still disagrees, settle on whichever hash appears most
  // often across the captured samples — this is the de facto canonical
  // value at the moment the matrix starts.
  const samples = [firstPass];
  for (let pass = 0; pass < 3; pass += 1) {
    _waitForCanonicalFiles(refs, 5000);
    const sample = {};
    for (const ref of refs) sample[ref] = _hashOnDisk(path.join(ROOT, ref));
    samples.push(sample);
  }
  for (const ref of refs) {
    const counts = new Map();
    for (const sample of samples) {
      const h = sample[ref];
      counts.set(h, (counts.get(h) || 0) + 1);
    }
    let best = null;
    let bestCount = -1;
    for (const [hash, count] of counts.entries()) {
      if (hash != null && count > bestCount) { best = hash; bestCount = count; }
    }
    out[ref] = best;
  }
  return out;
}

function _waitForRestored(absPath, expectedHash, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const current = _hashOnDisk(absPath);
    if (current === expectedHash) return true;
    const sleepMs = 50;
    const end = Date.now() + sleepMs;
    while (Date.now() < end) { /* spin */ }
  }
  return false;
}

function _assertCanonicalUnchanged(snapshot, fixtureId) {
  for (const ref of Object.keys(snapshot)) {
    const abs = path.join(ROOT, ref);
    const expected = snapshot[ref];
    const current = _hashOnDisk(abs);
    if (current === expected) continue;
    // Tolerate transient integration-test deletes: if the file was deleted
    // (current=null) wait for it to be restored to the expected hash. If
    // bytes differ (current!=expected but neither is null), that is a
    // real mutation and we fail closed.
    if (current === null && expected !== null) {
      const restored = _waitForRestored(abs, expected, 30000);
      if (!restored) {
        throw new Error(fixtureId + ': canonical file missing and never restored within 30s: ' + ref);
      }
      continue;
    }
    throw new Error(fixtureId + ': canonical file mutated on disk: ' + ref + ' (was ' + expected + ', now ' + current + ')');
  }
}

// ---------------------------------------------------------------------------
// Fixture runner — one subprocess per fixture, hermetic marker, cleanup.
// ---------------------------------------------------------------------------

async function _runFixture(t, fixture, snapshot) {
  const markerRoot = _createMarkerRoot(fixture.id);
  try {
    _setupMarkerFiles(markerRoot);
    _applyMutator(fixture, markerRoot);
    const run = _runVerifierAgainstMarker(markerRoot);

    _assertCanonicalUnchanged(snapshot, fixture.id);

    if (fs.existsSync(run.protocolOut)) {
      throw new Error(fixture.id + ': verifier persisted verify-protocol in marker despite fail-closed: ' + run.protocolOut);
    }

    assert.notEqual(run.exitCode, 0,
      fixture.id + ': expected non-zero exit for tamper; got ' + run.exitCode + '\nstdout=' + run.stdout + '\nstderr=' + run.stderr);

    assert.notEqual(run.exitCode, EXIT_CODES.REPLAY_PASS,
      fixture.id + ': exit code ' + run.exitCode + ' must NOT be REPLAY_PASS (0) for tamper fixture; stderr=' + run.stderr);

    const expectedCode = fixture.expected_blocker_code;
    assert.ok(run.stderr.indexOf(expectedCode) >= 0,
      fixture.id + ': expected blocker code "' + expectedCode + '" not in stderr:\n' + run.stderr);

    assert.ok(/^M16-S05-VERIFY /.test(run.stderr),
      fixture.id + ': stderr does not start with M16-S05-VERIFY namespace:\n' + run.stderr);

    t.diagnostic(fixture.id + ' :: exit=' + run.exitCode + ' :: expected_blocker="' + expectedCode + '" :: mutated=' + fixture.target_sidecar);
  } finally {
    _cleanupMarkerRoot(markerRoot);
  }
}

// ---------------------------------------------------------------------------
// node:test surface
// ---------------------------------------------------------------------------

test('T05 fail-closed tamper matrix (M016-txa3vu/S05)', async function (t) {
  const snapshot = _snapshotCanonicalFiles();

  await t.test('all 24 expected blocker codes satisfy M16-S05-VERIFY-* regex', function () {
    for (const f of FIXTURES) {
      const code = f.expected_blocker_code;
      assert.ok(data.isVerifierBlockerCode(code), f.id + ': blocker code "' + code + '" must match ^M16-S05-VERIFY-[A-Za-z0-9._-]+$');
    }
  });

  await t.test('all 24 expected blocker codes are unique', function () {
    const codes = FIXTURES.map(function (f) { return f.expected_blocker_code; });
    const set = new Set(codes);
    assert.equal(set.size, codes.length,
      'duplicate blocker codes: ' + JSON.stringify(codes.filter(function (c, i) { return codes.indexOf(c) !== i; })));
  });

  await t.test('all 24 expected exit codes are non-zero (mapBlockerToExitCode)', function () {
    for (const f of FIXTURES) {
      const exit = contract.mapBlockerToExitCode(f.expected_blocker_code);
      assert.notEqual(exit, EXIT_CODES.REPLAY_PASS,
        f.id + ': mapBlockerToExitCode produced REPLAY_PASS (0) for tamper fixture');
      assert.ok(Number.isInteger(exit),
        f.id + ': mapBlockerToExitCode did not return an integer for ' + f.expected_blocker_code);
    }
  });

  await t.test('coverage spans >= 8 threat classes from the slice plan', function () {
    const threats = new Set(FIXTURES.map(function (f) { return f.threat_class; }));
    assert.ok(threats.size >= 8,
      'expected at least 8 distinct threat classes, got ' + threats.size + ': ' + Array.from(threats).join(', '));
    for (const cls of threats) {
      assert.ok(THREAT_CLASS_RE.test(cls), 'threat class "' + cls + '" must be lowercase snake_case');
    }
  });

  // --- 24 single-fault fixture executions (one subprocess per fixture) ---
  for (const fixture of FIXTURES) {
    await t.test(fixture.id + ' :: ' + fixture.threat_class + ' :: ' + fixture.tamper_path, async function () {
      await _runFixture(t, fixture, snapshot);
    });
  }

  // --- Negative-fixtures artifact assertions ---
  await t.test('negative-fixtures artifact emitted with 24 fixtures', function () {
    assert.ok(fs.existsSync(CANONICAL_NEGATIVE_ABS), 'artifact missing at ' + CANONICAL_NEGATIVE_REF);
    const raw = JSON.parse(fs.readFileSync(CANONICAL_NEGATIVE_ABS, 'utf8'));
    assert.equal(raw.fixture_count, FIXTURES.length);
    assert.equal(raw.fixtures.length, FIXTURES.length);
    assert.equal(raw.unique_blocker_codes, FIXTURES.length);
    assert.equal(raw.non_zero_exit_codes, true);
    assert.equal(raw.milestone, data.MILESTONE);
    assert.equal(raw.slice, data.SLICE);
    assert.equal(raw.task, 'T05');
    assert.equal(raw.baseline_bundle, CANONICAL_BUNDLE_REF);
  });

  await t.test('every artifact fixture row matches the runtime expected_blocker_code', function () {
    const raw = JSON.parse(fs.readFileSync(CANONICAL_NEGATIVE_ABS, 'utf8'));
    const map = {};
    for (const f of raw.fixtures) map[f.fixture_id] = f.expected_blocker_code;
    for (const f of FIXTURES) {
      assert.equal(map[f.id], f.expected_blocker_code,
        f.id + ': artifact code "' + map[f.id] + '" != runtime "' + f.expected_blocker_code + '"');
    }
  });

  await t.test('artifact carries no tampered fixture bodies (sanitised-only)', function () {
    const raw = JSON.parse(fs.readFileSync(CANONICAL_NEGATIVE_ABS, 'utf8'));
    for (const f of raw.fixtures) {
      // baseline_value / tampered_value may be string or number; both are
      // sanitised-meta and acceptable. The byte-identical negative-fixtures
      // contract forbids embedded record arrays / per-fixture command payloads.
      const bt = typeof f.baseline_value;
      const tx = typeof f.tampered_value;
      assert.ok(bt === 'string' || bt === 'number',
        f.fixture_id + ': baseline_value must be string|number, got ' + bt);
      assert.ok(tx === 'string' || tx === 'number',
        f.fixture_id + ': tampered_value must be string|number, got ' + tx);
      assert.equal(typeof f.expected_blocker_code, 'string', f.fixture_id + ': expected_blocker_code must be a string');
      assert.equal(typeof f.records, 'undefined',
        f.fixture_id + ': sanitised artifact must NOT carry an embedded records array');
      assert.equal(typeof f.command, 'undefined',
        f.fixture_id + ': sanitised artifact must NOT carry a per-fixture command payload');
      assert.equal(typeof f.mutator, 'undefined',
        f.fixture_id + ': sanitised artifact must NOT carry a mutator closure');
      assert.equal(typeof f.fake_value, 'undefined',
        f.fixture_id + ': sanitised artifact must NOT carry a fake_value leakage');
    }
  });

  // --- Canonical preservation (post-matrix re-check) ---
  await t.test('canonical S05 sidecars + S02/S03/S04 sources byte-identical after the matrix', function () {
    _assertCanonicalUnchanged(snapshot, 'post-matrix');
  });
});

// ---------------------------------------------------------------------------
// CLI entry: when invoked directly, run node:test programmatically.
// ---------------------------------------------------------------------------

if (require.main === module) {
  const { run } = require('node:test');
  const reporter = require('node:test/reporters').spec;
  run({ files: [__filename] }).compose(reporter).pipe(process.stdout);
}
