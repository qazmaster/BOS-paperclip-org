#!/usr/bin/env node
'use strict';

/**
 * scripts/test_validate_m015_s06_mission_evidence.js
 *
 * M015-4o8lfw / S06 / T03 — Independent validator test suite.
 *
 * Tests the VG1-VG8 readback + protocol re-derivation logic against
 *   (a) live disk evidence on the S06 preflight-blocked state
 *   (b) synthetic fixtures that exercise each gate independently
 *
 * Run with:
 *   node --test scripts/test_validate_m015_s06_mission_evidence.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const contract = require('./lib/m015-s06-mission-validation-contract');
const entry = require('./validate_m015_s06_mission_evidence');

const {
  VALIDATION_GATE_IDS,
  BLOCKER_CODES,
  VERDICT_CODES,
  ORCHESTRATOR_PATTERN,
  ORCHESTRATOR_ATTRIBUTION_FILTER,
  EXPECTED_AGENT_COUNT,
  R026_BOUNDARY_KINDS,
  loadEvidence,
  evaluateValidationContract,
  compileValidationBlockers,
  findSyntheticBosHits,
  findXiaomiReuseHits,
  assertWriteSafe,
  validateReadbackIntegrity,
  validatePreflightCorrelation,
  validateZeroBusinessMutationLedger,
  validateProtocolLedgerCorrelation,
  validateAutonomyAndNoSyntheticBos,
  validateOrchestratorProvenance,
  validateR026BoundaryClassification,
  enforceSafeBlockNotPromoted,
  buildProtocolEvidence,
  buildVerificationEvidence,
  buildValidationEvidence,
} = contract;

const REAL_PREFLIGHT = 'runtime-evidence/M015-S06-preflight.json';
const REAL_MISSION_RUN = 'runtime-evidence/M015-S06-native-mission-run.json';
const REAL_PO_INTAKE = 'runtime-evidence/M015-S06-po-intake.json';
const REAL_ADMISSION = 'runtime-evidence/M015-S04-admission.json';

// ---------------------------------------------------------------------------
// Fixture builders — small focused evidence-shape helpers.
// ---------------------------------------------------------------------------

function basePreflight({ verdict = 'BLOCKED_ON_LIVE_RUNTIME_UNREACHABLE', business_mutations_recorded = 0, do_not_promote_s04 = false, blockers = [{ code: 'M15-S06-PREFLIGHT-LIVE-RUNTIME-UNREACHABLE', severity: 'blocking' }] } = {}) {
  return {
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s06-preflight.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S06',
    task: 'T01',
    generated: new Date().toISOString(),
    verdict,
    canonical_verdict: 'M015_S06_PREFLIGHT',
    preflight_model: '6 preflight gates',
    upstream_artifacts: {},
    gate_labels: {},
    gates: {},
    business_mutations_recorded,
    do_not_promote_s04,
    blockers,
    redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: true },
    canonical_verdict_line: `M015_S06_PREFLIGHT=${verdict}`,
  };
}

function baseAdmission({ status = 'BLOCKED_ON_S03_FAIL_CLOSED', business_mutations_recorded = 0, blockers = [] } = {}) {
  return {
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s04-admission.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S04',
    task: 'T01',
    generated: new Date().toISOString(),
    status,
    admission_model: '4 admission gates',
    upstream_artifacts: {},
    gate_labels: {},
    gates: {
      fresh_s03_7of7_invokability_pass: status === 'ADMITTED',
      no_do_not_promote_s04_pass: status === 'ADMITTED',
      no_drift_pass: status === 'ADMITTED',
      no_leaks_pass: status === 'ADMITTED',
    },
    business_mutations_recorded,
    blockers,
    redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false, provider_secret_names: '<redacted>', synthetic_bos: false },
  };
}

function baseMissionRun({ status = 'MISSION_BLOCKED_NO_RUN', harness_root_issue_create = 0, business_mutations_recorded = 0, includeProvenance = true } = {}) {
  const base = {
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s06-native-mission-run.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S06',
    task: 'T02',
    generated: new Date().toISOString(),
    status,
    admission_summary: {
      status: 'BLOCKED_ON_S03_FAIL_CLOSED',
      admitted: false,
      blocked: true,
      business_mutations_recorded,
      blocker_codes: ['M15-S04-ADMISSION-GATE-FRESH-S03-7OF7'],
    },
    safe_block_declared: true,
    harness_writes: { root_issue_create: harness_root_issue_create },
    mission_context: null,
    intake_summary: null,
    root_issue: null,
    mission_run: null,
    protocol_gates: {},
    blockers: [],
    observation_budget: {
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      max_seconds: 600,
      poll_interval_ms: 5000,
      budget_exhausted: false,
    },
    redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: true, provider_secret_names: '<redacted>', synthetic_bos: true },
  };
  if (includeProvenance) {
    base.s06_provenance = {
      orchestrator: {
        canonical_aggregate_path: 'runtime-evidence/M015-S03-seven-agent-diagnostic-runs.json',
        per_agent_dir: 'runtime-evidence/M015-S05-T02-orchestrator',
        canonical_aggregate_status: 'PASS',
        canonical_aggregate_pass_count: 7,
        canonical_aggregate_fail_count: 0,
        expected_agent_count: 7,
        observed_agent_count: 7,
        observed_expected_agent_count: 7,
        observed_pass_count: 7,
        seven_of_seven_invokability_pass: true,
        option_a_pattern: ORCHESTRATOR_PATTERN,
        our_agent_ids_attribution_filter: true,
        wake_count_delta_filter: 'our-runId-presence-not-raw-list-length-diff',
        attribution_summary: 'canonical 7 of 7 invokability PASS',
      },
      audit_trail_records: {
        aip_27: {
          observed_via: 'S05-T02-option-A-orchestrator',
          created_by_agent: 'Div3.Treasury',
          kind: 'audit_trail_record',
          classification: 'R026-boundary-diagnostic',
          attribution_filter: ORCHESTRATOR_ATTRIBUTION_FILTER,
          business_mutation: false,
        },
        aip_28: {
          observed_via: 'S05-T02-option-A-orchestrator',
          created_by_agent: 'Div7.MissionControl',
          kind: 'audit_trail_record',
          classification: 'R026-boundary-diagnostic',
          attribution_filter: ORCHESTRATOR_ATTRIBUTION_FILTER,
          business_mutation: false,
        },
      },
    };
  }
  return base;
}

function basePoIntake() {
  return {
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s06-po-intake.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S06',
    task: 'T02',
    generated: new Date().toISOString(),
    mission_key: 's04-mission-M015-S06-T02-bounded-native-seven-division',
    idempotency_key: 's04-mission-M015-S06-T02-bounded-native-seven-division::pending-root-issue-id',
    recovery_lock: 'replay-blocked-on:s04-mission-M015-S06-T02-bounded-native-seven-division',
    title: 'S06 launch-readiness decision package for seven-division MiniMax M3 runtime',
    description: 'decision-package-mission-description',
    confirmation: 'confirmation-reason-blinded',
    desired_assignee: 'Div7.MissionControl',
    desired_outcome: 'launch-readiness-decision-package-artifacts',
    priority: 'normal',
    parent_issue_id: null,
  };
}

// Valid protocol fixture shape for the VG4 protocol-ledger correlation
// gate. Ten MG-shaped gate labels (MG1..MG10) are required by VG4
// (protocol_gate_labels_count >= 10); all 9 non-redacted MG gates
// default to false; the safe-block bearer is present in blockers; the
// protocol substructure exposes allowlisted_side_effects and
// idempotency_and_recovery.
function validProtocolFixture() {
  return {
    gates: {
      mission_topology_pass: false,
      authorship_and_authority_pass: false,
      agent_authored_outputs_pass: false,
      review_and_disposition_path_pass: false,
      allowlisted_side_effects_pass: false,
      terminal_run_and_disposition_states_pass: false,
      time_budgets_pass: false,
      idempotency_and_recovery_lock_pass: false,
      no_synthetic_bos_fallback_pass: false,
    },
    blockers: [{ code: 'M15-S06-PREFLIGHT-LIVE-RUNTIME-UNREACHABLE', severity: 'blocking' }],
    protocol: {
      allowlisted_side_effects: { root_issue_max: 1 },
      idempotency_and_recovery: { mission_key_required: true },
    },
    gate_labels: {
      mission_topology_pass: 'MG1 MISSION_TOPOLOGY',
      authorship_and_authority_pass: 'MG2 AUTHORSHIP_AND_AUTHORITY',
      agent_authored_outputs_pass: 'MG3 AGENT_AUTHORED_OUTPUTS',
      review_and_disposition_path_pass: 'MG4 REVIEW_AND_DISPOSITION_PATH',
      allowlisted_side_effects_pass: 'MG5 ALLOWLISTED_SIDE_EFFECTS',
      terminal_run_and_disposition_states_pass: 'MG6 TERMINAL_RUN_AND_DISPOSITION_STATES',
      time_budgets_pass: 'MG7 TIME_BUDGETS',
      idempotency_and_recovery_lock_pass: 'MG8 IDEMPOTENCY_AND_RECOVERY_LOCK',
      secret_hygiene_pass: 'MG9 SECRET_HYGIENE',
      no_synthetic_bos_fallback_pass: 'MG10 NO_SYNTHETIC_BOS_FALLBACK',
    },
  };
}

function wrapProtocol(fixture, overridePath) {
  return { value: fixture, path: overridePath || '/tmp/proto.json', kind: 'protocol' };
}

// ---------------------------------------------------------------------------
// Gate-level unit tests
// ---------------------------------------------------------------------------

test('VG1 READBACK_INTEGRITY: passes when all evidence surfaces have $schema + required keys', () => {
  const pf = { value: basePreflight(), path: path.join(ROOT, REAL_PREFLIGHT), kind: 'preflight' };
  const adm = { value: baseAdmission(), path: path.join(ROOT, REAL_ADMISSION), kind: 'admission' };
  const mr = { value: baseMissionRun(), path: path.join(ROOT, REAL_MISSION_RUN), kind: 'mission_run' };
  const pi = { value: basePoIntake(), path: path.join(ROOT, REAL_PO_INTAKE), kind: 'po_intake' };
  const vg1 = validateReadbackIntegrity({ preflight: pf, admission: adm, missionRun: mr, poIntake: pi });
  assert.equal(vg1.pass, true, JSON.stringify(vg1.diagnostics));
});

test('VG1 READBACK_INTEGRITY: fails when preflight missing required top-level key', () => {
  const pf = basePreflight();
  delete pf.canonical_verdict_line;
  const vg1 = validateReadbackIntegrity({
    preflight: { value: pf, path: '/tmp/pf.json', kind: 'preflight' },
    missionRun: { value: baseMissionRun(), path: '/tmp/mr.json', kind: 'mission_run' },
    poIntake: { value: basePoIntake(), path: '/tmp/pi.json', kind: 'po_intake' },
  });
  assert.equal(vg1.pass, false);
  assert.match(vg1.diagnostics.required_keys_missing.join(','), /preflight:canonical_verdict_line/);
});

test('VG1 READBACK_INTEGRITY: fails when preflight schema prefix wrong', () => {
  const pf = basePreflight();
  pf.$schema = 'https://gsd.local/schemas/wrong-schema';
  const vg1 = validateReadbackIntegrity({
    preflight: { value: pf, path: '/tmp/pf.json', kind: 'preflight' },
    missionRun: { value: baseMissionRun(), path: '/tmp/mr.json', kind: 'mission_run' },
    poIntake: { value: basePoIntake(), path: '/tmp/pi.json', kind: 'po_intake' },
  });
  assert.equal(vg1.pass, false);
});

test('VG2 PREFLIGHT_CORRELATION: passes when blocked preflight + blocked mission-run + bm_propagated', () => {
  const vg2 = validatePreflightCorrelation({
    preflight: { value: basePreflight(), path: '/tmp/pf.json' },
    missionRun: { value: baseMissionRun(), path: '/tmp/mr.json' },
  });
  assert.equal(vg2.pass, true, JSON.stringify(vg2.diagnostics));
  assert.equal(vg2.diagnostics.preflight_blocked, true);
  assert.equal(vg2.diagnostics.mission_run_blocked, true);
});

test('VG2 PREFLIGHT_CORRELATION: fails when do_not_promote_s04=true contradicts cleared path', () => {
  const pf = basePreflight({ do_not_promote_s04: true });
  const vg2 = validatePreflightCorrelation({
    preflight: { value: pf, path: '/tmp/pf.json' },
    missionRun: { value: baseMissionRun(), path: '/tmp/mr.json' },
  });
  assert.equal(vg2.pass, false);
});

test('VG2 PREFLIGHT_CORRELATION: fails when business_mutations_recorded does not propagate', () => {
  const pf = basePreflight({ business_mutations_recorded: 0 });
  const mr = baseMissionRun({ business_mutations_recorded: 5 });
  const vg2 = validatePreflightCorrelation({
    preflight: { value: pf, path: '/tmp/pf.json' },
    missionRun: { value: mr, path: '/tmp/mr.json' },
  });
  assert.equal(vg2.pass, false);
  assert.equal(vg2.diagnostics.business_mutations_propagated, false);
});

test('VG3 ZERO_BUSINESS_MUTATION_LEDGER: passes under blocked preflight with zero mutations', () => {
  const vg3 = validateZeroBusinessMutationLedger({
    preflight: { value: basePreflight(), path: '/tmp/pf.json' },
    missionRun: { value: baseMissionRun(), path: '/tmp/mr.json' },
    poIntake: { value: basePoIntake(), path: '/tmp/pi.json' },
  });
  assert.equal(vg3.pass, true, JSON.stringify(vg3.diagnostics));
  assert.equal(vg3.diagnostics.raw_mutation_count, 0);
});

test('VG3 ZERO_BUSINESS_MUTATION_LEDGER: fails with LEDGER_VIOLATION when root_issue_create>0 under blocked preflight', () => {
  const mr = baseMissionRun({ harness_root_issue_create: 1 });
  const vg3 = validateZeroBusinessMutationLedger({
    preflight: { value: basePreflight(), path: '/tmp/pf.json' },
    missionRun: { value: mr, path: '/tmp/mr.json' },
  });
  assert.equal(vg3.pass, false);
  assert.equal(vg3.diagnostics.raw_mutation_count, 1);
});

test('VG3 ZERO_BUSINESS_MUTATION_LEDGER: fails when mission_context is non-null under blocked preflight', () => {
  const mr = baseMissionRun();
  mr.mission_context = { mission_key: 'fake' };
  const vg3 = validateZeroBusinessMutationLedger({
    preflight: { value: basePreflight(), path: '/tmp/pf.json' },
    missionRun: { value: mr, path: '/tmp/mr.json' },
  });
  assert.equal(vg3.pass, false);
});

test('VG3 ZERO_BUSINESS_MUTATION_LEDGER: passes for admitted preflight (trivially)', () => {
  const pf = basePreflight({ verdict: 'ADMITTED', business_mutations_recorded: 5, blockers: [] });
  const vg3 = validateZeroBusinessMutationLedger({
    preflight: { value: pf, path: '/tmp/pf.json' },
    missionRun: { value: baseMissionRun(), path: '/tmp/mr.json' },
  });
  assert.equal(vg3.pass, true);
});

test('VG4 PROTOCOL_LEDGER_CORRELATION: passes when all gates false + bearer present + structure present', () => {
  const protocol = wrapProtocol(validProtocolFixture());
  const vg4 = validateProtocolLedgerCorrelation({ protocol });
  assert.equal(vg4.pass, true, JSON.stringify(vg4.diagnostics));
});

test('VG4 PROTOCOL_LEDGER_CORRELATION: fails when protocol block missing allowlist', () => {
  const fixture = validProtocolFixture();
  fixture.protocol = {}; // remove allowlist
  const protocol = wrapProtocol(fixture);
  const vg4 = validateProtocolLedgerCorrelation({ protocol });
  assert.equal(vg4.pass, false);
  assert.equal(vg4.diagnostics.protocol_allowlist_present, false);
});

test('VG4 PROTOCOL_LEDGER_CORRELATION: fails when no safe-block bearer in protocol.blockers', () => {
  const fixture = validProtocolFixture();
  fixture.blockers = [{ code: 'SOME-OTHER-BLOCKER', severity: 'blocking' }];
  const protocol = wrapProtocol(fixture);
  const vg4 = validateProtocolLedgerCorrelation({ protocol });
  assert.equal(vg4.pass, false);
  assert.equal(vg4.diagnostics.protocol_blockers_bearer_present, false);
});

test('VG4 PROTOCOL_LEDGER_CORRELATION: fails when gate_labels count < 10', () => {
  const fixture = validProtocolFixture();
  delete fixture.gate_labels.secret_hygiene_pass; // 9 labels, not 10
  const protocol = wrapProtocol(fixture);
  const vg4 = validateProtocolLedgerCorrelation({ protocol });
  assert.equal(vg4.pass, false);
  assert.equal(vg4.diagnostics.protocol_gate_labels_count, 9);
});

test('VG5 AUTONOMY_AND_NO_SYNTHETIC_BOS: passes on clean evidence', () => {
  const vg5 = validateAutonomyAndNoSyntheticBos({
    preflight: { value: basePreflight(), path: '/tmp/pf.json' },
    missionRun: { value: baseMissionRun(), path: '/tmp/mr.json' },
    poIntake: { value: basePoIntake(), path: '/tmp/pi.json' },
  });
  assert.equal(vg5.pass, true);
  assert.equal(vg5.diagnostics.xiaomi_hits.length, 0);
  assert.equal(vg5.diagnostics.synthetic_bos_hits.length, 0);
});

test('VG5 AUTONOMY: fails when "xiaomi" string appears in evidence payload', () => {
  const mr = baseMissionRun();
  // Inject a leak string into a non-skipped key.
  mr.intake_summary = { foo: 'xiaomi device-id redacted string' };
  mr.intake_summary = { foo: 'mimo detection string' };
  // The synthetic bos-light full tag is also detected, so we keep just xiaomi and ensure it's caught in objective_test_key.
  const vg5 = validateAutonomyAndNoSyntheticBos({
    preflight: { value: basePreflight(), path: '/tmp/pf.json' },
    missionRun: { value: mr, path: '/tmp/mr.json' },
  });
  assert.equal(vg5.pass, false);
  assert.ok(vg5.diagnostics.xiaomi_hits.length > 0);
});

test('VG5 AUTONOMY: skips leak detection in path identifier keys (gate_labels/paths)', () => {
  // Place "xiaomi" in a path/key under paths, gate_labels, or $schema
  // and verify it is NOT flagged.
  const pf = basePreflight();
  pf.gate_labels = { xiaomi_marker_doc: 'some descriptive label' };
  const vg5 = validateAutonomyAndNoSyntheticBos({
    preflight: { value: pf, path: '/tmp/pf.json' },
    missionRun: { value: baseMissionRun(), path: '/tmp/mr.json' },
  });
  assert.equal(vg5.pass, true);
});

test('VG6 SAFE_BLOCK_NOT_PROMOTED: passes when blocked + verdict not MISSION_PASS', () => {
  const vg6 = enforceSafeBlockNotPromoted({
    preflight: { value: basePreflight(), path: '/tmp/pf.json' },
    provisionalStatus: VERDICT_CODES.MISSION_FAIL_CLOSED,
    gates: {},
    acceptSafeBlock: false,
  });
  assert.equal(vg6.pass, true);
  assert.equal(vg6.diagnostics.promoted_to_mission_pass, false);
});

test('VG6 SAFE_BLOCK_NOT_PROMOTED: fails when provisional MISSION_PASS under blocked preflight', () => {
  const vg6 = enforceSafeBlockNotPromoted({
    preflight: { value: basePreflight(), path: '/tmp/pf.json' },
    provisionalStatus: VERDICT_CODES.MISSION_PASS,
    gates: {},
    acceptSafeBlock: false,
  });
  assert.equal(vg6.pass, false);
  assert.equal(vg6.diagnostics.promoted_to_mission_pass, true);
});

test('VG7 ORCHESTRATOR_PROVENANCE: passes on canonical Option-A S05 T02 evidence', () => {
  const vg7 = validateOrchestratorProvenance({
    missionRun: { value: baseMissionRun(), path: '/tmp/mr.json' },
  });
  assert.equal(vg7.pass, true, JSON.stringify(vg7.diagnostics));
  assert.equal(vg7.diagnostics.observed_pass_count, EXPECTED_AGENT_COUNT);
  assert.equal(vg7.diagnostics.option_a_pattern, ORCHESTRATOR_PATTERN);
});

test('VG7 ORCHESTRATOR_PROVENANCE: fails when canonical_aggregate_status is not PASS', () => {
  const mr = baseMissionRun();
  mr.s06_provenance.orchestrator.canonical_aggregate_status = 'FAIL_CLOSED';
  const vg7 = validateOrchestratorProvenance({
    missionRun: { value: mr, path: '/tmp/mr.json' },
  });
  assert.equal(vg7.pass, false);
});

test('VG7 ORCHESTRATOR_PROVENANCE: fails when observed_pass_count is not 7', () => {
  const mr = baseMissionRun();
  mr.s06_provenance.orchestrator.observed_pass_count = 6;
  const vg7 = validateOrchestratorProvenance({
    missionRun: { value: mr, path: '/tmp/mr.json' },
  });
  assert.equal(vg7.pass, false);
});

test('VG7 ORCHESTRATOR_PROVENANCE: fails when option_a_pattern is wrong', () => {
  const mr = baseMissionRun();
  mr.s06_provenance.orchestrator.option_a_pattern = 'parallel-fanout';
  const vg7 = validateOrchestratorProvenance({
    missionRun: { value: mr, path: '/tmp/mr.json' },
  });
  assert.equal(vg7.pass, false);
});

test('VG7 ORCHESTRATOR_PROVENANCE: fails when attribution filter missing', () => {
  const mr = baseMissionRun();
  mr.s06_provenance.orchestrator.our_agent_ids_attribution_filter = false;
  const vg7 = validateOrchestratorProvenance({
    missionRun: { value: mr, path: '/tmp/mr.json' },
  });
  assert.equal(vg7.pass, false);
});

test('VG8 R026_BOUNDARY_CLASSIFICATION: passes on canonical AIP-27/AIP-28', () => {
  const vg8 = validateR026BoundaryClassification({
    missionRun: { value: baseMissionRun(), path: '/tmp/mr.json' },
  });
  assert.equal(vg8.pass, true, JSON.stringify(vg8.diagnostics));
  assert.equal(vg8.diagnostics.audit_trail_record_count, 2);
  assert.equal(vg8.diagnostics.misclassifications.length, 0);
  assert.equal(vg8.diagnostics.business_mutation_mix, false);
});

test('VG8 R026_BOUNDARY_CLASSIFICATION: fails when audit-trail record misclassified as business_mutation=true', () => {
  const mr = baseMissionRun();
  mr.s06_provenance.audit_trail_records.aip_27.business_mutation = true;
  const vg8 = validateR026BoundaryClassification({
    missionRun: { value: mr, path: '/tmp/mr.json' },
  });
  assert.equal(vg8.pass, false);
  assert.equal(vg8.diagnostics.business_mutation_mix, true);
  assert.equal(vg8.diagnostics.misclassifications.length, 1);
});

test('VG8 R026_BOUNDARY_CLASSIFICATION: fails when kind is not in R026_BOUNDARY_KINDS', () => {
  const mr = baseMissionRun();
  mr.s06_provenance.audit_trail_records.aip_27.kind = 'issue_create';
  const vg8 = validateR026BoundaryClassification({
    missionRun: { value: mr, path: '/tmp/mr.json' },
  });
  assert.equal(vg8.pass, false);
});

test('VG8 R026_BOUNDARY_CLASSIFICATION: fails when audit_trail_records missing entirely', () => {
  const mr = baseMissionRun();
  delete mr.s06_provenance.audit_trail_records;
  const vg8 = validateR026BoundaryClassification({
    missionRun: { value: mr, path: '/tmp/mr.json' },
  });
  assert.equal(vg8.pass, false);
});

test('R026_BOUNDARY_KINDS includes audit_trail_record and boundary_diagnostic', () => {
  assert.ok(R026_BOUNDARY_KINDS.includes('audit_trail_record'));
  assert.ok(R026_BOUNDARY_KINDS.includes('boundary_diagnostic'));
});

// ---------------------------------------------------------------------------
// End-to-end evaluator tests
// ---------------------------------------------------------------------------

test('evaluateValidationContract: on clean blocked-preflight evidence, all 8 VGs pass', () => {
  const preflight = { value: basePreflight(), path: '/tmp/pf.json' };
  const missionRun = { value: baseMissionRun(), path: '/tmp/mr.json' };
  const poIntake = { value: basePoIntake(), path: '/tmp/pi.json' };
  const protocol = wrapProtocol(validProtocolFixture());
  const result = evaluateValidationContract({ preflight, missionRun, poIntake, protocol, acceptSafeBlock: true });
  // All 8 VGs should pass.
  assert.equal(result.gates.readback_integrity_pass, true);
  assert.equal(result.gates.preflight_correlation_pass, true);
  assert.equal(result.gates.zero_business_mutation_ledger_pass, true);
  assert.equal(result.gates.protocol_ledger_correlation_pass, true);
  assert.equal(result.gates.autonomy_and_no_synthetic_bos_pass, true);
  assert.equal(result.gates.safe_block_not_promoted_pass, true);
  assert.equal(result.gates.orchestrator_provenance_pass, true);
  assert.equal(result.gates.r026_boundary_classification_pass, true);
  // Status: safe-block path with --accept-safe-block returns PREFLIGHT_BLOCKED
  assert.equal(result.status, VERDICT_CODES.MISSION_FAIL_CLOSED_PREFLIGHT_BLOCKED);
});

test('evaluateValidationContract: ledger violation detected yields LEDGER_VIOLATION verdict', () => {
  // Setup: preflight blocked + business_mutations_recorded=0 (consistent
  // with mission-run BM=0), but raw harness_writes.root_issue_create=2
  // indicates the safety net is breached. VG2 correlation still PASSES
  // (BM propagates), but VG3 zero-mutation ledger FAILS. This yields
  // MISSION_FAIL_CLOSED_LEDGER_VIOLATION, not PROTOCOL_MISMATCH.
  const preflight = { value: basePreflight(), path: '/tmp/pf.json' };
  const missionRun = {
    value: baseMissionRun({ harness_root_issue_create: 2 }),
    path: '/tmp/mr.json',
  };
  // admission_summary.business_mutations_recorded stays at 0 (default).
  // raw root_issue_create=2 triggers the LEDGER_VIOLATION path.
  const protocol = wrapProtocol(validProtocolFixture());
  const result = evaluateValidationContract({ preflight, missionRun, protocol, acceptSafeBlock: true });
  assert.equal(result.gates.preflight_correlation_pass, true);
  assert.equal(result.gates.zero_business_mutation_ledger_pass, false);
  assert.equal(result.status, VERDICT_CODES.MISSION_FAIL_CLOSED_LEDGER_VIOLATION);
});

test('evaluateValidationContract: orchestrator-not-7-of-7 yields ORCHESTRATOR_INVALID verdict', () => {
  const preflight = { value: basePreflight(), path: '/tmp/pf.json' };
  const mr = baseMissionRun();
  mr.s06_provenance.orchestrator.observed_pass_count = 5;
  mr.s06_provenance.orchestrator.canonical_aggregate_pass_count = 5;
  const missionRun = { value: mr, path: '/tmp/mr.json' };
  const protocol = wrapProtocol(validProtocolFixture());
  const result = evaluateValidationContract({ preflight, missionRun, protocol, acceptSafeBlock: true });
  assert.equal(result.gates.orchestrator_provenance_pass, false);
  assert.equal(result.status, VERDICT_CODES.MISSION_FAIL_CLOSED_ORCHESTRATOR_INVALID);
});

test('evaluateValidationContract: r026 misclassification yields R026_MISCLASSIFICATION verdict', () => {
  const preflight = { value: basePreflight(), path: '/tmp/pf.json' };
  const mr = baseMissionRun();
  mr.s06_provenance.audit_trail_records.aip_27.business_mutation = true;
  const missionRun = { value: mr, path: '/tmp/mr.json' };
  const protocol = wrapProtocol(validProtocolFixture());
  const result = evaluateValidationContract({ preflight, missionRun, protocol, acceptSafeBlock: true });
  assert.equal(result.gates.r026_boundary_classification_pass, false);
  assert.equal(result.status, VERDICT_CODES.MISSION_FAIL_CLOSED_R026_MISCLASSIFICATION);
});

// ---------------------------------------------------------------------------
// Redaction walk tests
// ---------------------------------------------------------------------------

test('findSyntheticBosHits: detects "synthetic bos light" tag inside nested value', () => {
  const evidence = { foo: { bar: 'this is a synthetic bos light marker' } };
  const hits = findSyntheticBosHits(evidence, '$');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].path, '$.foo.bar');
});

test('findSyntheticBosHits: skips keys in DEFAULT_SKIP_KEYS (gate_labels, paths)', () => {
  const evidence = {
    gate_labels: { synthetic_bos_light_marker_doc: 'description' },
    paths: { some_path_with_synthetic_bos_light_in_name: 'x' },
  };
  const hits = findSyntheticBosHits(evidence, '$');
  assert.equal(hits.length, 0);
});

test('findXiaomiReuseHits: detects xiaomi/mimo case-insensitively in nested value', () => {
  const evidence = { foo: { bar: 'Xiaomi device ID redacted' } };
  const hits = findXiaomiReuseHits(evidence, '$');
  assert.equal(hits.length, 1);
});

test('assertWriteSafe: throws when payload contains xiaomi leak', () => {
  assert.throws(() => assertWriteSafe({ foo: 'xiaomi is here' }), /redaction leak/);
});

test('assertWriteSafe: does not throw when payload is clean', () => {
  assertWriteSafe({ redaction: { full_ids: false } });
});

// ---------------------------------------------------------------------------
// Live disk evidence integration test (only run if real evidence files exist)
// ---------------------------------------------------------------------------

test('integration: live disk evidence runs end-to-end via entry.runValidation', () => {
  if (!fs.existsSync(path.join(ROOT, REAL_PREFLIGHT))) {
    // Skip silently if real evidence not available
    return;
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm015s06t03-'));
  try {
    const protocolOut = path.join(tmpDir, 'protocol.json');
    const verificationOut = path.join(tmpDir, 'verification.json');
    const validationOut = path.join(tmpDir, 'validation.json');
    const result = entry.runValidation({
      preflight: path.join(ROOT, REAL_PREFLIGHT),
      admission: path.join(ROOT, REAL_ADMISSION),
      input: path.join(ROOT, REAL_MISSION_RUN),
      poIntake: path.join(ROOT, REAL_PO_INTAKE),
      outputProtocol: protocolOut,
      outputVerification: verificationOut,
      outputValidation: validationOut,
      acceptSafeBlock: true,
      errors: [],
    });
    // All three output files must have been written.
    assert.ok(fs.existsSync(protocolOut));
    assert.ok(fs.existsSync(verificationOut));
    assert.ok(fs.existsSync(validationOut));
    // Verdict should be PREFLIGHT_BLOCKED under current disk state.
    assert.equal(result.verdict, VERDICT_CODES.MISSION_FAIL_CLOSED_PREFLIGHT_BLOCKED);
    // All 8 VGs should pass under --accept-safe-block.
    assert.equal(result.gates.readback_integrity_pass, true);
    assert.equal(result.gates.preflight_correlation_pass, true);
    assert.equal(result.gates.zero_business_mutation_ledger_pass, true);
    assert.equal(result.gates.protocol_ledger_correlation_pass, true);
    assert.equal(result.gates.autonomy_and_no_synthetic_bos_pass, true);
    assert.equal(result.gates.safe_block_not_promoted_pass, true);
    assert.equal(result.gates.orchestrator_provenance_pass, true);
    assert.equal(result.gates.r026_boundary_classification_pass, true);
    // All three files contain M015_S06_VALIDATION reference.
    for (const f of [protocolOut, verificationOut, validationOut]) {
      const content = fs.readFileSync(f, 'utf8');
      assert.match(content, /M015_S06_VALIDATION/);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('integration: CLI runCli with --accept-safe-block exits 0 on blocked preflight', () => {
  if (!fs.existsSync(path.join(ROOT, REAL_PREFLIGHT))) return;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm015s06t03-cli-'));
  try {
    const protocolOut = path.join(tmpDir, 'protocol.json');
    const verificationOut = path.join(tmpDir, 'verification.json');
    const validationOut = path.join(tmpDir, 'validation.json');
    const exitCode = entry.runCli([
      'node',
      '--preflight', path.join(ROOT, REAL_PREFLIGHT),
      '--admission', path.join(ROOT, REAL_ADMISSION),
      '--input', path.join(ROOT, REAL_MISSION_RUN),
      '--po-intake', path.join(ROOT, REAL_PO_INTAKE),
      '--output-protocol', protocolOut,
      '--output-verification', verificationOut,
      '--output-validation', validationOut,
      '--accept-safe-block',
    ]);
    assert.equal(exitCode, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('integration: CLI without --accept-safe-block exits 1 on blocked preflight (FAIL_CLOSED)', () => {
  if (!fs.existsSync(path.join(ROOT, REAL_PREFLIGHT))) return;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm015s06t03-cli2-'));
  try {
    const protocolOut = path.join(tmpDir, 'protocol.json');
    const verificationOut = path.join(tmpDir, 'verification.json');
    const validationOut = path.join(tmpDir, 'validation.json');
    const exitCode = entry.runCli([
      'node',
      '--preflight', path.join(ROOT, REAL_PREFLIGHT),
      '--admission', path.join(ROOT, REAL_ADMISSION),
      '--input', path.join(ROOT, REAL_MISSION_RUN),
      '--po-intake', path.join(ROOT, REAL_PO_INTAKE),
      '--output-protocol', protocolOut,
      '--output-verification', verificationOut,
      '--output-validation', validationOut,
    ]);
    assert.equal(exitCode, 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('integration: CLI with missing evidence returns 2 (VALIDATION_ERROR)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm015s06t03-cli3-'));
  try {
    const protocolOut = path.join(tmpDir, 'protocol.json');
    const verificationOut = path.join(tmpDir, 'verification.json');
    const validationOut = path.join(tmpDir, 'validation.json');
    const exitCode = entry.runCli([
      'node',
      '--preflight', '/nonexistent/M015-S06-preflight.json',
      '--admission', '/nonexistent/M015-S04-admission.json',
      '--input', '/nonexistent/M015-S06-native-mission-run.json',
      '--po-intake', '/nonexistent/M015-S06-po-intake.json',
      '--output-protocol', protocolOut,
      '--output-verification', verificationOut,
      '--output-validation', validationOut,
    ]);
    assert.equal(exitCode, 2);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Evidence builder round-trip tests
// ---------------------------------------------------------------------------

test('buildProtocolEvidence produces MG-shaped gates (10 keys, MG1-MG10 labels)', () => {
  const evidence = buildProtocolEvidence({
    preflight: { value: basePreflight(), path: path.join(ROOT, REAL_PREFLIGHT) },
    missionRun: { value: baseMissionRun(), path: path.join(ROOT, REAL_MISSION_RUN) },
    gates: {
      mission_topology_pass: false,
      authorship_and_authority_pass: false,
      agent_authored_outputs_pass: false,
      review_and_disposition_path_pass: false,
      allowlisted_side_effects_pass: false,
      terminal_run_and_disposition_states_pass: false,
      time_budgets_pass: false,
      idempotency_and_recovery_lock_pass: false,
      secret_hygiene_pass: '<redacted>',
      no_synthetic_bos_fallback_pass: false,
    },
    blockers: [],
    paths: {},
    options: { acceptSafeBlock: true },
    status: VERDICT_CODES.MISSION_FAIL_CLOSED_PREFLIGHT_BLOCKED,
  });
  assert.equal(typeof evidence.protocol, 'object');
  assert.equal(evidence.protocol.topology_required_root_assignee, 'Div7.MissionControl');
  assert.equal(evidence.protocol.allowlisted_side_effects.heartbeat_runs_expected, 7);
});

test('buildVerificationEvidence produces VG-shaped gate labels (8 keys, VG1-VG8)', () => {
  const pf = { value: basePreflight(), path: path.join(ROOT, REAL_PREFLIGHT) };
  const mr = { value: baseMissionRun(), path: path.join(ROOT, REAL_MISSION_RUN) };
  const pi = { value: basePoIntake(), path: path.join(ROOT, REAL_PO_INTAKE) };
  const gates = {};
  for (const gid of VALIDATION_GATE_IDS) gates[gid] = true;
  const evidence = buildVerificationEvidence({
    preflight: pf,
    admission: null,
    missionRun: mr,
    poIntake: pi,
    gates,
    blockers: [],
    diagnostics: { zero_business_mutation_ledger: { po_intake_deterministic_only: true } },
    paths: {},
    options: { acceptSafeBlock: true },
    status: VERDICT_CODES.MISSION_FAIL_CLOSED_PREFLIGHT_BLOCKED,
  });
  // Must be 8 VG labels.
  assert.equal(Object.keys(evidence.gate_labels).length, 8);
  assert.ok(evidence.gate_labels.readback_integrity_pass.startsWith('VG1'));
  assert.ok(evidence.gate_labels.r026_boundary_classification_pass.startsWith('VG8'));
});

test('buildValidationEvidence produces 8-VG gates + preflight_snapshot', () => {
  const pf = { value: basePreflight(), path: path.join(ROOT, REAL_PREFLIGHT) };
  const mr = { value: baseMissionRun(), path: path.join(ROOT, REAL_MISSION_RUN) };
  const gates = {};
  for (const gid of VALIDATION_GATE_IDS) gates[gid] = true;
  const evidence = buildValidationEvidence({
    preflight: pf,
    admission: null,
    missionRun: mr,
    poIntake: null,
    gates,
    blockers: [],
    diagnostics: {},
    paths: {},
    options: { acceptSafeBlock: true },
    status: VERDICT_CODES.MISSION_FAIL_CLOSED_PREFLIGHT_BLOCKED,
  });
  assert.ok(evidence.preflight_snapshot);
  assert.equal(evidence.preflight_snapshot.verdict, 'BLOCKED_ON_LIVE_RUNTIME_UNREACHABLE');
  assert.equal(evidence.safe_block_declared, true);
});

test('compileValidationBlockers: emits precise blocker codes per failed gate', () => {
  const gates = {
    readback_integrity_pass: false,
    preflight_correlation_pass: false,
    zero_business_mutation_ledger_pass: false,
    protocol_ledger_correlation_pass: false,
    autonomy_and_no_synthetic_bos_pass: false,
    safe_block_not_promoted_pass: false,
    orchestrator_provenance_pass: false,
    r026_boundary_classification_pass: false,
  };
  const diagnostics = {
    readback_integrity: { required_keys_missing: ['mission_run:x'] },
    preflight_correlation: { all_consistent: false, preflight_verdict: 'X', mission_run_admission_status: 'Y', do_not_promote_s04_consistent: false, business_mutations_propagated: false },
    zero_business_mutation_ledger: { preflight_blocked: true, blocked_required_fields_missing: [], raw_mutations: [{ kind: 'root_issue_create', count: 1 }] },
    protocol_ledger_correlation: { protocol_allowlist_present: false, protocol_idempotency_present: true, protocol_gates_all_false_under_block: false, protocol_blockers_bearer_present: false, protocol_gate_labels_count: 0, bearer_codes_observed: [] },
    autonomy_and_no_synthetic_bos: { xiaomi_hits: [{ path: '$.mr.foo' }], synthetic_bos_hits: [] },
    orchestrator_provenance: { orchestrator_present: false, canonical_aggregate_status: 'FAIL_CLOSED', observed_pass_count: 5, option_a_pattern: 'wrong', attribution_filter_ok: false, per_agent_dir_present: false },
    r026_boundary_classification: { business_mutation_mix: true, misclassifications: [{ key: 'aip_27', kind: 'issue_create', record: {} }], audit_trail_records_present: true },
    safe_block_not_promoted: { provisional_status: 'MISSION_PASS' },
  };
  const blockers = compileValidationBlockers(gates, diagnostics);
  const codes = blockers.map((b) => b.code);
  assert.ok(codes.some((c) => c === BLOCKER_CODES.VG1_READBACK_INTEGRITY));
  assert.ok(codes.some((c) => c === BLOCKER_CODES.VG2_PREFLIGHT_CORRELATION));
  assert.ok(codes.some((c) => c === BLOCKER_CODES.VG3_LEDGER_VIOLATION));
  assert.ok(codes.some((c) => c === BLOCKER_CODES.VG4_PROTOCOL_ALLOWLIST_MISSING));
  assert.ok(codes.some((c) => c === BLOCKER_CODES.VG5_XIAOMI_REUSE_DETECTED));
  assert.ok(codes.some((c) => c === BLOCKER_CODES.VG7_ORCHESTRATOR_INVALID));
  assert.ok(codes.some((c) => c === BLOCKER_CODES.VG8_R026_BUSINESS_MUTATION_MIX));
  assert.ok(codes.some((c) => c === BLOCKER_CODES.VG6_PROMOTION_OF_SAFE_BLOCK));
});

// ---------------------------------------------------------------------------
// Argument parsing sanity tests
// ---------------------------------------------------------------------------

test('parseArgs: default paths and --accept-safe-block flag', () => {
  const opts = entry.parseArgs(['node']);
  assert.equal(opts.preflight, entry.PREFLIGHT_PATH);
  assert.equal(opts.admission, entry.ADMISSION_PATH);
  assert.equal(opts.input, entry.MISSION_RUN_PATH);
  assert.equal(opts.poIntake, entry.PO_INTAKE_PATH);
  assert.equal(opts.acceptSafeBlock, false);
});

test('parseArgs: --accept-safe-block toggles acceptSafeBlock to true', () => {
  const opts = entry.parseArgs(['node', '--accept-safe-block']);
  assert.equal(opts.acceptSafeBlock, true);
});

test('parseArgs: errors[] populated on unknown arg', () => {
  const opts = entry.parseArgs(['node', '--unknown-flag']);
  assert.ok(opts.errors.length > 0);
  assert.match(opts.errors[0], /unknown argument/);
});

test('exitCodeFor: pass=0, preflight_blocked=0 with acceptSafeBlock, =1 without', () => {
  assert.equal(entry.exitCodeFor(VERDICT_CODES.MISSION_PASS, false), 0);
  assert.equal(entry.exitCodeFor(VERDICT_CODES.MISSION_FAIL_CLOSED_PREFLIGHT_BLOCKED, true), 0);
  assert.equal(entry.exitCodeFor(VERDICT_CODES.MISSION_FAIL_CLOSED_PREFLIGHT_BLOCKED, false), 1);
  assert.equal(entry.exitCodeFor(VERDICT_CODES.MISSION_VALIDATION_ERROR, false), 2);
  assert.equal(entry.exitCodeFor(VERDICT_CODES.MISSION_FAIL_CLOSED_LEDGER_VIOLATION, false), 3);
});

test('evaluateProtocolGates: blocked preflight → all gates false (MG9 redacted)', () => {
  const gates = entry.evaluateProtocolGates(
    { value: baseMissionRun(), path: '/tmp/mr.json' },
    { value: basePreflight(), path: '/tmp/pf.json' },
  );
  assert.equal(gates.mission_topology_pass, false);
  assert.equal(gates.authorship_and_authority_pass, false);
  assert.equal(gates.secret_hygiene_pass, '<redacted>');
});

test('evaluateProtocolGates: admitted preflight + live payload → all gates true', () => {
  const pf = basePreflight({ verdict: 'ADMITTED', business_mutations_recorded: 7, blockers: [] });
  const mr = baseMissionRun({ harness_root_issue_create: 1 });
  mr.mission_run = { side_effects: [] };
  const gates = entry.evaluateProtocolGates(
    { value: mr, path: '/tmp/mr.json' },
    { value: pf, path: '/tmp/pf.json' },
  );
  assert.equal(gates.mission_topology_pass, true);
  assert.equal(gates.secret_hygiene_pass, '<redacted>');
});

test('buildBlockedPathProtocolBlockers: emits M15-S06-PREFLIGHT-LIVE-RUNTIME-UNREACHABLE bearer', () => {
  const blockers = entry.buildBlockedPathProtocolBlockers(
    { secret_hygiene_pass: '<redacted>' },
    { value: basePreflight(), path: '/tmp/pf.json' },
  );
  assert.ok(blockers.some((b) => b.code === 'M15-S06-PREFLIGHT-LIVE-RUNTIME-UNREACHABLE'));
});
