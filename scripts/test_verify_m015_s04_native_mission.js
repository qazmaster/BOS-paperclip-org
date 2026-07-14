#!/usr/bin/env node
'use strict';

/**
 * scripts/test_verify_m015_s04_native_mission.js
 *
 * M015-4o8lfw / S04 / T05 — Independent validation contract test suite.
 *
 * Pure hermetic tests using inline fixtures and node:test. No network,
 * no .gsd/, no .planning/, no .audits/ paths. Each test builds a small
 * in-memory evidence surface, runs the validator gate(s), and asserts
 * the expected pass/fail and verdict.
 *
 * Tests cover:
 *   1. data module: constants shape, BLOCKER_CODES frozen, VERDICT_CODES complete
 *   2. loadEvidence: happy path; missing file; malformed JSON; non-object
 *   3. findSyntheticBosHits / findXiaomiReuseHits: tree walking + substring
 *   4. validateReadbackIntegrity (VG1): schema + top-level keys
 *   5. validateAdmissionCorrelation (VG2): status + subgate consistency
 *   6. validateZeroBusinessMutationLedger (VG3): blocked → zero mutations
 *   7. validateProtocolLedgerCorrelation (VG4): allowlist + gates + carry-forward
 *   8. validateAutonomyAndNoSyntheticBos (VG5): redaction scrub re-check
 *   9. enforceSafeBlockNotPromoted (VG6): no promotion of safe block
 *   10. evaluateValidationContract: end-to-end blocked-path safe-block verdict
 *   11. compileValidationBlockers: each gate fail → matching blocker code
 *   12. deriveValidationStatus: verdict selection
 *   13. assertWriteSafe: refuses leak-bearing payload
 *   14. parseArgs / exitCodeFor / runValidation: CLI + integration
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const data = require('./lib/m015-s04-native-validation-data');
const contract = require('./lib/m015-s04-native-validation-contract');
const cli = require('./verify_m015_s04_native_mission');

// ---------------------------------------------------------------------------
// Test fixtures: minimal valid 3-surface evidence set under blocked admission.
// ---------------------------------------------------------------------------

function makeBlockedAdmission(overrides = {}) {
  return Object.assign({
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s04-admission.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S04',
    task: 'T01',
    generated: '2026-07-14T00:00:00.000Z',
    status: 'BLOCKED_ON_S03_FAIL_CLOSED',
    admission_model: '4 admission gates',
    upstream_artifacts: { s03: 'runtime-evidence/M015-S03.json' },
    gate_labels: {},
    gates: {
      fresh_s03_7of7_invokability_pass: false,
      no_do_not_promote_s04_pass: false,
      no_drift_pass: true,
      no_leaks_pass: true,
    },
    business_mutations_recorded: 0,
    blockers: [
      { code: 'M15-S04-ADMISSION-GATE-FRESH-S03-7OF7', severity: 'blocking', agent: null, reason: 'fake' },
      { code: 'M15-S04-ADMISSION-GATE-DO-NOT-PROMOTE-S04', severity: 'blocking', agent: null, reason: 'fake' },
    ],
    redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: true },
  }, overrides);
}

function makeBlockedMissionRun(overrides = {}) {
  return Object.assign({
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s04-native-mission-run.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S04',
    task: 'T04',
    generated: '2026-07-14T00:00:00.000Z',
    status: 'MISSION_BLOCKED_SAFE',
    admission_summary: {
      status: 'BLOCKED_ON_S03_FAIL_CLOSED',
      admitted: false,
      blocked: true,
    },
    safe_block_declared: true,
    harness_writes: { root_issue_create: 0 },
    mission_context: null,
    intake_summary: null,
    root_issue: null,
    mission_run: null,
    protocol_gates: {},
    blockers: [
      { code: 'M15-S04-PROTOCOL-ADMISSION-BLOCKER-CARRY-FORWARD', severity: 'blocking', agent: null, reason: 'fake' },
    ],
    observation_budget: { started_at: '2026-07-14T00:00:00.000Z', ended_at: '2026-07-14T00:00:00.000Z' },
    redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: true, provider_secret_names: '<redacted>', synthetic_bos: true },
  }, overrides);
}

function makeBlockedProtocol(overrides = {}) {
  return Object.assign({
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s04-native-mission-protocol.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S04',
    task: 'T02',
    generated: '2026-07-14T00:00:00.000Z',
    status: 'MISSION_FAIL_CLOSED',
    safe_block_declared: true,
    admission_summary: { status: 'BLOCKED_ON_S03_FAIL_CLOSED', admitted: false, blocked: true },
    protocol: {
      allowlisted_side_effects: { root_issue_max: 1, heartbeat_runs_expected: 7 },
      idempotency_and_recovery: { mission_key_required: true, idempotency_key_required: true, recovery_lock_required: true },
    },
    gate_labels: {
      mission_topology_pass: 'MG1',
      authorship_and_authority_pass: 'MG2',
      agent_authored_outputs_pass: 'MG3',
      review_and_disposition_path_pass: 'MG4',
      allowlisted_side_effects_pass: 'MG5',
      terminal_run_and_disposition_states_pass: 'MG6',
      time_budgets_pass: 'MG7',
      idempotency_and_recovery_lock_pass: 'MG8',
      secret_hygiene_pass: 'MG9',
      no_synthetic_bos_fallback_pass: 'MG10',
    },
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
    blockers: [
      { code: 'M15-S04-PROTOCOL-ADMISSION-BLOCKER-CARRY-FORWARD', severity: 'blocking', agent: null, reason: 'fake' },
    ],
    redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false, provider_secret_names: '<redacted>', synthetic_bos: false },
    paths: {},
  }, overrides);
}

function makeEvidence(surface, value, overrides = {}) {
  return { value: Object.assign(value, overrides), path: `/tmp/${surface}-${Math.random()}.json`, kind: surface };
}

function triple(aOverrides = {}, mrOverrides = {}, prOverrides = {}) {
  return {
    admission: makeEvidence('admission', makeBlockedAdmission(), aOverrides),
    missionRun: makeEvidence('mission_run', makeBlockedMissionRun(), mrOverrides),
    protocol: makeEvidence('protocol', makeBlockedProtocol(), prOverrides),
  };
}

// ===========================================================================
// 1. Data module
// ===========================================================================

test('data: VALIDATION_GATE_IDS has exactly 6 VG gates in canonical order', () => {
  assert.deepEqual(data.VALIDATION_GATE_IDS, [
    'readback_integrity_pass',
    'admission_correlation_pass',
    'zero_business_mutation_ledger_pass',
    'protocol_ledger_correlation_pass',
    'autonomy_and_no_synthetic_bos_pass',
    'safe_block_not_promoted_pass',
  ]);
});

test('data: VALIDATION_GATE_ID_SET reflects the ID list', () => {
  assert.equal(data.VALIDATION_GATE_ID_SET.size, 6);
  for (const id of data.VALIDATION_GATE_IDS) {
    assert.ok(data.VALIDATION_GATE_ID_SET.has(id));
  }
});

test('data: VALIDATION_GATE_LABELS has a label for each gate ID', () => {
  for (const id of data.VALIDATION_GATE_IDS) {
    assert.ok(typeof data.VALIDATION_GATE_LABELS[id] === 'string' && data.VALIDATION_GATE_LABELS[id].length > 10);
  }
});

test('data: BLOCKER_CODES is frozen and produces M15-S04-VALIDATION-* codes', () => {
  assert.ok(Object.isFrozen(data.BLOCKER_CODES));
  const code = data.BLOCKER_CODES.EVIDENCE_MISSING('foo');
  assert.ok(code.startsWith('M15-S04-VALIDATION-EVIDENCE-MISSING-'));
  assert.equal(data.BLOCKER_CODES.VG1_READBACK_INTEGRITY, 'M15-S04-VALIDATION-VG1-READBACK-INTEGRITY');
  assert.equal(data.BLOCKER_CODES.VG6_PROMOTION_OF_SAFE_BLOCK, 'M15-S04-VALIDATION-VG6-PROMOTION-OF-SAFE-BLOCK');
});

test('data: VERDICT_CODES is frozen with all expected codes', () => {
  assert.ok(Object.isFrozen(data.VERDICT_CODES));
  assert.equal(data.VERDICT_CODES.MISSION_PASS, 'MISSION_PASS');
  assert.equal(data.VERDICT_CODES.MISSION_FAIL_CLOSED_ADMISSION_BLOCKED, 'MISSION_FAIL_CLOSED_ADMISSION_BLOCKED');
  assert.equal(data.VERDICT_CODES.MISSION_FAIL_CLOSED_LEDGER_VIOLATION, 'MISSION_FAIL_CLOSED_LEDGER_VIOLATION');
  assert.equal(data.VERDICT_CODES.MISSION_VALIDATION_ERROR, 'MISSION_VALIDATION_ERROR');
});

test('data: SAFE_BLOCK_BEARER_CODES contains the protocol carry-forward marker', () => {
  assert.ok(data.SAFE_BLOCK_BEARER_CODES.includes('M15-S04-PROTOCOL-ADMISSION-BLOCKER-CARRY-FORWARD'));
});

test('data: CANONICAL_SCHEMAS has all 4 surface kinds', () => {
  for (const kind of ['admission', 'mission_run', 'protocol', 'validation']) {
    assert.ok(typeof data.CANONICAL_SCHEMAS[kind] === 'string');
    assert.ok(data.CANONICAL_SCHEMAS[kind].startsWith('https://gsd.local/schemas/runtime-evidence/m015-s04-'));
  }
});

test('data: REQUIRED_TOP_LEVEL_KEYS covers all 3 input surfaces', () => {
  for (const kind of ['admission', 'mission_run', 'protocol']) {
    const keys = data.REQUIRED_TOP_LEVEL_KEYS[kind];
    assert.ok(Array.isArray(keys) && keys.length >= 10, `${kind} must have >=10 required keys`);
    assert.ok(keys.includes('$schema'));
    assert.ok(keys.includes('status'));
    assert.ok(keys.includes('blockers'));
  }
});

test('data: REDACTION_SYNTHETIC_BOS_TAG matches the canonical synthetic bos light marker', () => {
  assert.equal(data.REDACTION_SYNTHETIC_BOS_TAG, 'synthetic bos light');
});

test('data: REDACTION_XIAOMI_TAG_RE matches both xiaomi and mimo case-insensitively', () => {
  assert.ok(data.REDACTION_XIAOMI_TAG_RE.test('xiaomi'));
  assert.ok(data.REDACTION_XIAOMI_TAG_RE.test('XIAOMI'));
  assert.ok(data.REDACTION_XIAOMI_TAG_RE.test('mimo'));
  assert.ok(data.REDACTION_XIAOMI_TAG_RE.test('MiMo'));
  assert.ok(!data.REDACTION_XIAOMI_TAG_RE.test('xia'));
});

// ===========================================================================
// 2. loadEvidence
// ===========================================================================

test('contract.loadEvidence: happy path returns { value, path, kind }', () => {
  const tmp = path.join(os.tmpdir(), `adm-${Date.now()}-${Math.random()}.json`);
  fs.writeFileSync(tmp, JSON.stringify(makeBlockedAdmission()), 'utf8');
  try {
    const ev = contract.loadEvidence(tmp, 'admission');
    assert.equal(ev.kind, 'admission');
    assert.equal(ev.path, tmp);
    assert.equal(ev.value.status, 'BLOCKED_ON_S03_FAIL_CLOSED');
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('contract.loadEvidence: missing file throws EVIDENCE_MISSING code', () => {
  const tmp = path.join(os.tmpdir(), `missing-${Date.now()}-${Math.random()}.json`);
  try {
    contract.loadEvidence(tmp, 'admission');
    assert.fail('expected throw');
  } catch (err) {
    assert.ok(err.code.startsWith('M15-S04-VALIDATION-EVIDENCE-MISSING-'));
    assert.equal(err.kind, 'admission');
  }
});

test('contract.loadEvidence: malformed JSON throws EVIDENCE_MALFORMED code', () => {
  const tmp = path.join(os.tmpdir(), `malformed-${Date.now()}-${Math.random()}.json`);
  fs.writeFileSync(tmp, '{not json', 'utf8');
  try {
    contract.loadEvidence(tmp, 'protocol');
    assert.fail('expected throw');
  } catch (err) {
    assert.ok(err.code.startsWith('M15-S04-VALIDATION-EVIDENCE-MALFORMED-'));
    assert.equal(err.kind, 'protocol');
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('contract.loadEvidence: non-object JSON throws EVIDENCE_MALFORMED code', () => {
  const tmp = path.join(os.tmpdir(), `array-${Date.now()}-${Math.random()}.json`);
  fs.writeFileSync(tmp, JSON.stringify([1, 2, 3]), 'utf8');
  try {
    contract.loadEvidence(tmp, 'mission_run');
    assert.fail('expected throw');
  } catch (err) {
    assert.ok(err.code.startsWith('M15-S04-VALIDATION-EVIDENCE-MALFORMED-'));
  } finally {
    fs.unlinkSync(tmp);
  }
});

// ===========================================================================
// 3. findSyntheticBosHits / findXiaomiReuseHits
// ===========================================================================

test('contract.findSyntheticBosHits: detects tag in nested object', () => {
  const hits = contract.findSyntheticBosHits({ a: { b: ['synthetic bos light tag here'] } }, '$');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].path, '$.a.b[0]');
});

test('contract.findSyntheticBosHits: case-insensitive', () => {
  const hits = contract.findSyntheticBosHits({ x: 'Synthetic BOS Light' }, '$');
  assert.equal(hits.length, 1);
});

test('contract.findSyntheticBosHits: returns empty for clean input', () => {
  const hits = contract.findSyntheticBosHits({ x: 'safe', y: [1, 2, 'normal string'] }, '$');
  assert.equal(hits.length, 0);
});

test('contract.findXiaomiReuseHits: detects xiaomi in nested value', () => {
  const hits = contract.findXiaomiReuseHits({ a: { b: 'endpoint xiaomi-1' } }, '$');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].path, '$.a.b');
});

test('contract.findXiaomiReuseHits: detects mimo case-insensitively', () => {
  const hits = contract.findXiaomiReuseHits({ x: 'MIMO route' }, '$');
  assert.equal(hits.length, 1);
});

// ===========================================================================
// 4. VG1 READBACK_INTEGRITY
// ===========================================================================

test('VG1: pass when all 3 surfaces have schema prefix and required keys', () => {
  const t = triple();
  const r = contract.validateReadbackIntegrity(t);
  assert.equal(r.pass, true);
  assert.deepEqual(r.diagnostics.required_keys_missing, []);
  assert.equal(r.diagnostics.schema_prefix_ok.admission, true);
  assert.equal(r.diagnostics.top_level_keys_ok.protocol, true);
});

test('VG1: fail when admission missing a required key', () => {
  const t = triple({}, {}, {});
  delete t.admission.value.gate_labels;
  const r = contract.validateReadbackIntegrity(t);
  assert.equal(r.pass, false);
  assert.ok(r.diagnostics.required_keys_missing.includes('admission:gate_labels'));
});

test('VG1: fail when protocol $schema prefix is wrong', () => {
  const t = triple({}, {}, { $schema: 'https://wrong.example.com/not-canonical' });
  const r = contract.validateReadbackIntegrity(t);
  assert.equal(r.pass, false);
  assert.ok(r.diagnostics.required_keys_missing.includes('protocol:$schema'));
});

test('VG1: fail when mission-run missing mission_context key', () => {
  const t = triple({}, {}, {});
  delete t.missionRun.value.mission_context;
  const r = contract.validateReadbackIntegrity(t);
  assert.equal(r.pass, false);
  assert.ok(r.diagnostics.required_keys_missing.includes('mission_run:mission_context'));
});

// ===========================================================================
// 5. VG2 ADMISSION_CORRELATION
// ===========================================================================

test('VG2: pass when all 3 surfaces agree on BLOCKED and both subgates are false', () => {
  const r = contract.validateAdmissionCorrelation(triple());
  assert.equal(r.pass, true);
  assert.equal(r.diagnostics.all_three_agree, true);
  assert.equal(r.diagnostics.blocked_subgates_consistent, true);
});

test('VG2: fail when mission-run admission_summary.status disagrees', () => {
  const t = triple({}, { admission_summary: { status: 'ADMITTED', admitted: true, blocked: false } }, {});
  const r = contract.validateAdmissionCorrelation(t);
  assert.equal(r.pass, false);
  assert.equal(r.diagnostics.all_three_agree, false);
});

test('VG2: fail when blocked subgate fresh_s03_7of7_invokability_pass is true (status blocked)', () => {
  const t = triple({ gates: { fresh_s03_7of7_invokability_pass: true, no_do_not_promote_s04_pass: false, no_drift_pass: true, no_leaks_pass: true } }, {}, {});
  const r = contract.validateAdmissionCorrelation(t);
  assert.equal(r.pass, false);
  assert.equal(r.diagnostics.blocked_subgates_consistent, false);
});

test('VG2: pass when ADMITTED and both subgates are true', () => {
  const t = triple({
    status: 'ADMITTED',
    gates: { fresh_s03_7of7_invokability_pass: true, no_do_not_promote_s04_pass: true, no_drift_pass: true, no_leaks_pass: true },
  }, { admission_summary: { status: 'ADMITTED', admitted: true, blocked: false } }, { admission_summary: { status: 'ADMITTED', admitted: true, blocked: false } });
  const r = contract.validateAdmissionCorrelation(t);
  assert.equal(r.pass, true);
});

// ===========================================================================
// 6. VG3 ZERO_BUSINESS_MUTATION_LEDGER
// ===========================================================================

test('VG3: pass when blocked admission + zero raw mutations + zero business_mutations_recorded', () => {
  const r = contract.validateZeroBusinessMutationLedger(triple());
  assert.equal(r.pass, true);
  assert.equal(r.diagnostics.raw_mutation_count, 0);
});

test('VG3: fail when blocked admission but root_issue_create > 0', () => {
  const t = triple({}, { harness_writes: { root_issue_create: 1 } }, {});
  const r = contract.validateZeroBusinessMutationLedger(t);
  assert.equal(r.pass, false);
  assert.equal(r.diagnostics.raw_mutation_count, 1);
});

test('VG3: fail when blocked admission but mission_context is present', () => {
  const t = triple({}, { mission_context: { id: 'fake' } }, {});
  const r = contract.validateZeroBusinessMutationLedger(t);
  assert.equal(r.pass, false);
  assert.ok(r.diagnostics.raw_mutations.some((m) => m.kind === 'mission_context_object_present'));
});

test('VG3: fail when mission-run missing harness_writes.root_issue_create (cannot prove zero)', () => {
  const t = triple({}, {}, {});
  delete t.missionRun.value.harness_writes;
  const r = contract.validateZeroBusinessMutationLedger(t);
  assert.equal(r.pass, false);
  assert.deepEqual(r.diagnostics.blocked_required_fields_missing, ['harness_writes.root_issue_create']);
});

test('VG3: pass when admitted (trivially — other gates cover full mission)', () => {
  const t = triple({ status: 'ADMITTED', business_mutations_recorded: 1 }, { harness_writes: { root_issue_create: 1 } }, {});
  const r = contract.validateZeroBusinessMutationLedger(t);
  assert.equal(r.pass, true);
});

// ===========================================================================
// 7. VG4 PROTOCOL_LEDGER_CORRELATION
// ===========================================================================

test('VG4: pass under blocked admission with allowlist + 10 labels + carry-forward + all-false gates', () => {
  const r = contract.validateProtocolLedgerCorrelation(triple());
  assert.equal(r.pass, true);
  assert.equal(r.diagnostics.protocol_gates_all_false_under_block, true);
  assert.equal(r.diagnostics.protocol_blockers_admission_carry_forward, true);
});

test('VG4: fail when protocol.protocol.allowlisted_side_effects missing', () => {
  const t = triple({}, {}, {});
  delete t.protocol.value.protocol.allowlisted_side_effects;
  const r = contract.validateProtocolLedgerCorrelation(t);
  assert.equal(r.pass, false);
  assert.equal(r.diagnostics.protocol_allowlist_present, false);
});

test('VG4: fail when protocol.protocol.idempotency_and_recovery missing', () => {
  const t = triple({}, {}, {});
  delete t.protocol.value.protocol.idempotency_and_recovery;
  const r = contract.validateProtocolLedgerCorrelation(t);
  assert.equal(r.pass, false);
  assert.equal(r.diagnostics.protocol_idempotency_present, false);
});

test('VG4: fail when gate_labels_count < 10', () => {
  const t = triple({}, {}, { gate_labels: { mission_topology_pass: 'MG1' } });
  const r = contract.validateProtocolLedgerCorrelation(t);
  assert.equal(r.pass, false);
});

test('VG4: fail when protocol gate is true under blocked admission', () => {
  const t = triple({}, {}, { gates: Object.assign(makeBlockedProtocol().gates, { mission_topology_pass: true }) });
  const r = contract.validateProtocolLedgerCorrelation(t);
  assert.equal(r.pass, false);
  assert.equal(r.diagnostics.protocol_gates_all_false_under_block, false);
});

test('VG4: fail when protocol.blockers missing admission-blocker carry-forward marker', () => {
  const t = triple({}, {}, { blockers: [{ code: 'M15-S04-OTHER-BLOCKER', severity: 'blocking', agent: null, reason: 'x' }] });
  const r = contract.validateProtocolLedgerCorrelation(t);
  assert.equal(r.pass, false);
  assert.equal(r.diagnostics.protocol_blockers_admission_carry_forward, false);
});

// ===========================================================================
// 8. VG5 AUTONOMY_AND_NO_SYNTHETIC_BOS
// ===========================================================================

test('VG5: pass on clean triple', () => {
  const r = contract.validateAutonomyAndNoSyntheticBos(triple());
  assert.equal(r.pass, true);
  assert.equal(r.diagnostics.synthetic_bos_hits.length, 0);
  assert.equal(r.diagnostics.xiaomi_hits.length, 0);
});

test('VG5: fail when synthetic bos light tag leaks into mission-run reason string', () => {
  const t = triple({}, { blockers: [{ code: 'X', severity: 'blocking', agent: null, reason: 'synthetic bos light was used' }] }, {});
  const r = contract.validateAutonomyAndNoSyntheticBos(t);
  assert.equal(r.pass, false);
  assert.equal(r.diagnostics.synthetic_bos_hits.length, 1);
});

test('VG5: fail when xiaomi string leaks into protocol.redaction field', () => {
  const t = triple({}, {}, { redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: 'xiaomi-was-found' } });
  const r = contract.validateAutonomyAndNoSyntheticBos(t);
  assert.equal(r.pass, false);
  assert.equal(r.diagnostics.xiaomi_hits.length, 1);
});

// ===========================================================================
// 9. VG6 SAFE_BLOCK_NOT_PROMOTED
// ===========================================================================

test('VG6: fail if blocked admission but provisional status is MISSION_PASS', () => {
  const r = contract.enforceSafeBlockNotPromoted({
    admission: makeEvidence('admission', makeBlockedAdmission()),
    provisionalStatus: data.VERDICT_CODES.MISSION_PASS,
    gates: {},
    acceptSafeBlock: true,
  });
  assert.equal(r.pass, false);
  assert.equal(r.diagnostics.promoted_to_mission_pass, true);
});

test('VG6: pass when blocked admission and provisional status is fail-closed', () => {
  const r = contract.enforceSafeBlockNotPromoted({
    admission: makeEvidence('admission', makeBlockedAdmission()),
    provisionalStatus: data.VERDICT_CODES.MISSION_FAIL_CLOSED,
    gates: {},
    acceptSafeBlock: true,
  });
  assert.equal(r.pass, true);
  assert.equal(r.diagnostics.promoted_to_mission_pass, false);
});

test('VG6: pass when admission is admitted and provisional status is MISSION_PASS', () => {
  const r = contract.enforceSafeBlockNotPromoted({
    admission: makeEvidence('admission', makeBlockedAdmission({ status: 'ADMITTED' })),
    provisionalStatus: data.VERDICT_CODES.MISSION_PASS,
    gates: {},
    acceptSafeBlock: true,
  });
  assert.equal(r.pass, true);
});

// ===========================================================================
// 10. evaluateValidationContract (end-to-end)
// ===========================================================================

test('contract.evaluateValidationContract: end-to-end blocked path → 6 gates pass, status safe-block', () => {
  const result = contract.evaluateValidationContract({
    ...triple(),
    acceptSafeBlock: true,
  });
  assert.equal(result.status, data.VERDICT_CODES.MISSION_FAIL_CLOSED_ADMISSION_BLOCKED);
  for (const id of data.VALIDATION_GATE_IDS) {
    assert.equal(result.gates[id], true, `gate ${id} must pass on clean blocked triple`);
  }
});

test('contract.evaluateValidationContract: end-to-end blocked path WITHOUT accept-safe-block → MISSION_FAIL_CLOSED', () => {
  const result = contract.evaluateValidationContract({
    ...triple(),
    acceptSafeBlock: false,
  });
  assert.equal(result.status, data.VERDICT_CODES.MISSION_FAIL_CLOSED);
});

test('contract.evaluateValidationContract: ledger violation (mutation under blocked) → MISSION_FAIL_CLOSED_LEDGER_VIOLATION', () => {
  const t = triple({}, { harness_writes: { root_issue_create: 1 } }, {});
  const result = contract.evaluateValidationContract({ ...t, acceptSafeBlock: true });
  assert.equal(result.status, data.VERDICT_CODES.MISSION_FAIL_CLOSED_LEDGER_VIOLATION);
  assert.equal(result.gates.zero_business_mutation_ledger_pass, false);
});

test('contract.evaluateValidationContract: synthetic bos tag leak → MISSION_FAIL_CLOSED_AUTONOMY_BREACH', () => {
  const t = triple({}, { blockers: [{ code: 'X', severity: 'blocking', agent: null, reason: 'synthetic bos light sneaked in' }] }, {});
  const result = contract.evaluateValidationContract({ ...t, acceptSafeBlock: true });
  assert.equal(result.status, data.VERDICT_CODES.MISSION_FAIL_CLOSED_AUTONOMY_BREACH);
  assert.equal(result.gates.autonomy_and_no_synthetic_bos_pass, false);
});

test('contract.evaluateValidationContract: protocol carry-forward missing → MISSION_FAIL_CLOSED_PROTOCOL_MISMATCH', () => {
  const t = triple({}, {}, { blockers: [] });
  const result = contract.evaluateValidationContract({ ...t, acceptSafeBlock: true });
  assert.equal(result.status, data.VERDICT_CODES.MISSION_FAIL_CLOSED_PROTOCOL_MISMATCH);
  assert.equal(result.gates.protocol_ledger_correlation_pass, false);
});

// ===========================================================================
// 11. compileValidationBlockers
// ===========================================================================

test('contract.compileValidationBlockers: VG1 fail produces VG1_READBACK_INTEGRITY blocker', () => {
  const diag = { readback_integrity: { required_keys_missing: ['admission:gate_labels'] } };
  const gates = Object.fromEntries(data.VALIDATION_GATE_IDS.map((id) => [id, true]));
  gates.readback_integrity_pass = false;
  const blockers = contract.compileValidationBlockers(gates, diag);
  assert.ok(blockers.some((b) => b.code === data.BLOCKER_CODES.VG1_READBACK_INTEGRITY));
});

test('contract.compileValidationBlockers: VG2 fail produces VG2_ADMISSION_CORRELATION blocker', () => {
  const gates = Object.fromEntries(data.VALIDATION_GATE_IDS.map((id) => [id, true]));
  gates.admission_correlation_pass = false;
  const diag = { admission_correlation: { all_three_agree: false, blocked_subgates_consistent: false } };
  const blockers = contract.compileValidationBlockers(gates, diag);
  assert.ok(blockers.some((b) => b.code === data.BLOCKER_CODES.VG2_ADMISSION_CORRELATION));
});

test('contract.compileValidationBlockers: VG3 ledger violation produces VG3_LEDGER_VIOLATION blocker', () => {
  const gates = Object.fromEntries(data.VALIDATION_GATE_IDS.map((id) => [id, true]));
  gates.zero_business_mutation_ledger_pass = false;
  const diag = { zero_business_mutation_ledger: { admission_blocked: true, blocked_required_fields_missing: [], raw_mutations: [{ kind: 'root_issue_create', count: 1 }] } };
  const blockers = contract.compileValidationBlockers(gates, diag);
  assert.ok(blockers.some((b) => b.code === data.BLOCKER_CODES.VG3_LEDGER_VIOLATION));
});

test('contract.compileValidationBlockers: VG3 missing fields produces VG3_LEDGER_MISSING_FIELDS blocker', () => {
  const gates = Object.fromEntries(data.VALIDATION_GATE_IDS.map((id) => [id, true]));
  gates.zero_business_mutation_ledger_pass = false;
  const diag = { zero_business_mutation_ledger: { admission_blocked: true, blocked_required_fields_missing: ['harness_writes.root_issue_create'], raw_mutations: [] } };
  const blockers = contract.compileValidationBlockers(gates, diag);
  assert.ok(blockers.some((b) => b.code === data.BLOCKER_CODES.VG3_LEDGER_MISSING_FIELDS));
});

test('contract.compileValidationBlockers: VG5 xiaomi leak produces VG5_XIAOMI_REUSE_DETECTED blocker', () => {
  const gates = Object.fromEntries(data.VALIDATION_GATE_IDS.map((id) => [id, true]));
  gates.autonomy_and_no_synthetic_bos_pass = false;
  const diag = { autonomy_and_no_synthetic_bos: { xiaomi_hits: [{ path: '$.x' }], synthetic_bos_hits: [] } };
  const blockers = contract.compileValidationBlockers(gates, diag);
  assert.ok(blockers.some((b) => b.code === data.BLOCKER_CODES.VG5_XIAOMI_REUSE_DETECTED));
});

test('contract.compileValidationBlockers: VG5 synthetic bos leak produces VG5_SYNTHETIC_BOS_TAG_DETECTED blocker', () => {
  const gates = Object.fromEntries(data.VALIDATION_GATE_IDS.map((id) => [id, true]));
  gates.autonomy_and_no_synthetic_bos_pass = false;
  const diag = { autonomy_and_no_synthetic_bos: { xiaomi_hits: [], synthetic_bos_hits: [{ path: '$.x' }] } };
  const blockers = contract.compileValidationBlockers(gates, diag);
  assert.ok(blockers.some((b) => b.code === data.BLOCKER_CODES.VG5_SYNTHETIC_BOS_TAG_DETECTED));
});

test('contract.compileValidationBlockers: VG6 fail produces VG6_PROMOTION_OF_SAFE_BLOCK blocker', () => {
  const gates = Object.fromEntries(data.VALIDATION_GATE_IDS.map((id) => [id, true]));
  gates.safe_block_not_promoted_pass = false;
  const diag = { safe_block_not_promoted: { provisional_status: 'MISSION_PASS' } };
  const blockers = contract.compileValidationBlockers(gates, diag);
  assert.ok(blockers.some((b) => b.code === data.BLOCKER_CODES.VG6_PROMOTION_OF_SAFE_BLOCK));
});

test('contract.compileValidationBlockers: empty blockers when all gates pass', () => {
  const gates = Object.fromEntries(data.VALIDATION_GATE_IDS.map((id) => [id, true]));
  const diag = {};
  const blockers = contract.compileValidationBlockers(gates, diag);
  assert.deepEqual(blockers, []);
});

// ===========================================================================
// 12. deriveValidationStatus
// ===========================================================================

test('deriveValidationStatus: all gates pass + blocked admission + acceptSafeBlock → safe-block verdict', () => {
  const gates = Object.fromEntries(data.VALIDATION_GATE_IDS.map((id) => [id, true]));
  const s = contract.deriveValidationStatus(gates, true);
  assert.equal(s, data.VERDICT_CODES.MISSION_FAIL_CLOSED_ADMISSION_BLOCKED);
});

test('deriveValidationStatus: all gates pass + blocked admission + no acceptSafeBlock → generic fail-closed', () => {
  const gates = Object.fromEntries(data.VALIDATION_GATE_IDS.map((id) => [id, true]));
  const s = contract.deriveValidationStatus(gates, false);
  assert.equal(s, data.VERDICT_CODES.MISSION_FAIL_CLOSED);
});

test('deriveValidationStatus: VG3 fail + VG2 pass (blocked) → LEDGER_VIOLATION', () => {
  const gates = Object.fromEntries(data.VALIDATION_GATE_IDS.map((id) => [id, true]));
  gates.zero_business_mutation_ledger_pass = false;
  const s = contract.deriveValidationStatus(gates, true);
  assert.equal(s, data.VERDICT_CODES.MISSION_FAIL_CLOSED_LEDGER_VIOLATION);
});

test('deriveValidationStatus: VG5 fail → AUTONOMY_BREACH', () => {
  const gates = Object.fromEntries(data.VALIDATION_GATE_IDS.map((id) => [id, true]));
  gates.autonomy_and_no_synthetic_bos_pass = false;
  const s = contract.deriveValidationStatus(gates, true);
  assert.equal(s, data.VERDICT_CODES.MISSION_FAIL_CLOSED_AUTONOMY_BREACH);
});

test('deriveValidationStatus: VG1 fail → PROTOCOL_MISMATCH', () => {
  const gates = Object.fromEntries(data.VALIDATION_GATE_IDS.map((id) => [id, true]));
  gates.readback_integrity_pass = false;
  const s = contract.deriveValidationStatus(gates, true);
  assert.equal(s, data.VERDICT_CODES.MISSION_FAIL_CLOSED_PROTOCOL_MISMATCH);
});

// ===========================================================================
// 13. assertWriteSafe
// ===========================================================================

test('assertWriteSafe: passes on clean payload', () => {
  contract.assertWriteSafe({ x: 'normal string', y: { z: 1 } });
});

test('assertWriteSafe: throws on synthetic bos light leak', () => {
  assert.throws(() => {
    contract.assertWriteSafe({ reason: 'synthetic bos light was used' });
  }, /redaction leak/);
});

test('assertWriteSafe: throws on xiaomi leak', () => {
  assert.throws(() => {
    contract.assertWriteSafe({ endpoint: 'xiaomi-was-here' });
  }, /redaction leak/);
});

// ===========================================================================
// 14. CLI
// ===========================================================================

test('cli.parseArgs: defaults', () => {
  const opts = cli.parseArgs(['node', 'script.js']);
  assert.equal(opts.acceptSafeBlock, false);
  assert.equal(opts.errors.length, 0);
  assert.equal(opts.admission, cli.ADMISSION_PATH);
  assert.equal(opts.output, cli.OUTPUT_PATH);
});

test('cli.parseArgs: --accept-safe-block', () => {
  const opts = cli.parseArgs(['node', 'script.js', '--accept-safe-block']);
  assert.equal(opts.acceptSafeBlock, true);
});

test('cli.parseArgs: unknown arg → errors', () => {
  const opts = cli.parseArgs(['node', 'script.js', '--bogus']);
  assert.ok(opts.errors.length > 0);
  assert.ok(opts.errors[0].includes('--bogus'));
});

test('cli.parseArgs: --input without value → errors', () => {
  const opts = cli.parseArgs(['node', 'script.js', '--input']);
  assert.ok(opts.errors.length > 0);
});

test('cli.exitCodeFor: MISSION_PASS → 0', () => {
  assert.equal(cli.exitCodeFor(data.VERDICT_CODES.MISSION_PASS, false), 0);
});

test('cli.exitCodeFor: MISSION_FAIL_CLOSED_ADMISSION_BLOCKED + accept-safe-block → 0', () => {
  assert.equal(cli.exitCodeFor(data.VERDICT_CODES.MISSION_FAIL_CLOSED_ADMISSION_BLOCKED, true), 0);
});

test('cli.exitCodeFor: MISSION_FAIL_CLOSED_ADMISSION_BLOCKED without accept-safe-block → 1', () => {
  assert.equal(cli.exitCodeFor(data.VERDICT_CODES.MISSION_FAIL_CLOSED_ADMISSION_BLOCKED, false), 1);
});

test('cli.exitCodeFor: MISSION_FAIL_CLOSED_LEDGER_VIOLATION → 3', () => {
  assert.equal(cli.exitCodeFor(data.VERDICT_CODES.MISSION_FAIL_CLOSED_LEDGER_VIOLATION, true), 3);
});

test('cli.exitCodeFor: MISSION_VALIDATION_ERROR → 2', () => {
  assert.equal(cli.exitCodeFor(data.VERDICT_CODES.MISSION_VALIDATION_ERROR, true), 2);
});

test('cli.runValidation: missing admission → MISSION_VALIDATION_ERROR with EVIDENCE_MISSING blocker', () => {
  const tmp = path.join(os.tmpdir(), `missing-${Date.now()}-${Math.random()}.json`);
  const tmpMr = path.join(os.tmpdir(), `mr-${Date.now()}-${Math.random()}.json`);
  const tmpPr = path.join(os.tmpdir(), `pr-${Date.now()}-${Math.random()}.json`);
  fs.writeFileSync(tmpMr, JSON.stringify(makeBlockedMissionRun()), 'utf8');
  fs.writeFileSync(tmpPr, JSON.stringify(makeBlockedProtocol()), 'utf8');
  try {
    const r = cli.runValidation({
      admissionPath: tmp,
      inputPath: tmpMr,
      protocolPath: tmpPr,
      outputPath: path.join(os.tmpdir(), `out-${Date.now()}.json`),
      acceptSafeBlock: true,
    });
    assert.equal(r.verdict, data.VERDICT_CODES.MISSION_VALIDATION_ERROR);
    assert.ok(r.blockers.some((b) => b.code.startsWith('M15-S04-VALIDATION-EVIDENCE-MISSING-admission')));
  } finally {
    try { fs.unlinkSync(tmpMr); } catch (e) {}
    try { fs.unlinkSync(tmpPr); } catch (e) {}
  }
});

test('cli.runValidation: clean blocked triple → MISSION_FAIL_CLOSED_ADMISSION_BLOCKED + all 6 gates pass', () => {
  const tmpA = path.join(os.tmpdir(), `a-${Date.now()}-${Math.random()}.json`);
  const tmpMr = path.join(os.tmpdir(), `mr-${Date.now()}-${Math.random()}.json`);
  const tmpPr = path.join(os.tmpdir(), `pr-${Date.now()}-${Math.random()}.json`);
  const tmpOut = path.join(os.tmpdir(), `out-${Date.now()}-${Math.random()}.json`);
  fs.writeFileSync(tmpA, JSON.stringify(makeBlockedAdmission()), 'utf8');
  fs.writeFileSync(tmpMr, JSON.stringify(makeBlockedMissionRun()), 'utf8');
  fs.writeFileSync(tmpPr, JSON.stringify(makeBlockedProtocol()), 'utf8');
  try {
    const r = cli.runValidation({
      admissionPath: tmpA,
      inputPath: tmpMr,
      protocolPath: tmpPr,
      outputPath: tmpOut,
      acceptSafeBlock: true,
    });
    assert.equal(r.verdict, data.VERDICT_CODES.MISSION_FAIL_CLOSED_ADMISSION_BLOCKED);
    for (const id of data.VALIDATION_GATE_IDS) {
      assert.equal(r.gates[id], true, `gate ${id} must pass`);
    }
  } finally {
    try { fs.unlinkSync(tmpA); } catch (e) {}
    try { fs.unlinkSync(tmpMr); } catch (e) {}
    try { fs.unlinkSync(tmpPr); } catch (e) {}
  }
});

test('cli.writeValidationEvidence: writes JSON file with required top-level keys', () => {
  const tmpOut = path.join(os.tmpdir(), `out-${Date.now()}-${Math.random()}.json`);
  cli.writeValidationEvidence({
    verdict: data.VERDICT_CODES.MISSION_FAIL_CLOSED_ADMISSION_BLOCKED,
    gates: Object.fromEntries(data.VALIDATION_GATE_IDS.map((id) => [id, true])),
    blockers: [],
    diagnostics: {},
    safe_block_declared: true,
    outputEvidencePath: tmpOut,
    evidence: null,
  });
  try {
    const parsed = JSON.parse(fs.readFileSync(tmpOut, 'utf8'));
    assert.equal(parsed.status, data.VERDICT_CODES.MISSION_FAIL_CLOSED_ADMISSION_BLOCKED);
    assert.equal(parsed.task, 'T05');
    assert.ok(parsed.gate_labels);
    assert.ok(parsed.gates);
    assert.ok(parsed.redaction);
  } finally {
    fs.unlinkSync(tmpOut);
  }
});

// ===========================================================================
// 15. End-to-end integration against real S04 evidence (no fixtures)
// ===========================================================================

test('integration: real evidence files on disk yield MISSION_FAIL_CLOSED_ADMISSION_BLOCKED with --accept-safe-block', () => {
  const result = cli.runValidation({
    admissionPath: cli.ADMISSION_PATH,
    inputPath: cli.DEFAULT_RUN_PATH,
    protocolPath: cli.DEFAULT_PROTOCOL_PATH,
    outputPath: cli.OUTPUT_PATH,
    acceptSafeBlock: true,
  });
  assert.equal(result.verdict, data.VERDICT_CODES.MISSION_FAIL_CLOSED_ADMISSION_BLOCKED);
  for (const id of data.VALIDATION_GATE_IDS) {
    assert.equal(result.gates[id], true, `gate ${id} must pass on real evidence`);
  }
  assert.equal(result.safe_block_declared, true);
  // Write evidence to disk so we can inspect it
  cli.writeValidationEvidence(result);
  const parsed = JSON.parse(fs.readFileSync(cli.OUTPUT_PATH, 'utf8'));
  assert.equal(parsed.status, data.VERDICT_CODES.MISSION_FAIL_CLOSED_ADMISSION_BLOCKED);
  assert.ok(parsed.safe_block_declared);
  assert.ok(parsed.safe_block_evidence);
  assert.equal(parsed.safe_block_evidence.admission_status, 'BLOCKED_ON_S03_FAIL_CLOSED');
  assert.equal(parsed.safe_block_evidence.harness_root_issue_create, 0);
});