#!/usr/bin/env node
'use strict';

/**
 * M016-txa3vu / S05 / T01 — schema and pure-contract tests.
 *
 * The fixture is a complete 16+3 S03-shaped pack. Tests cover schema compile,
 * strict additional-property rejection, exact partitioning, deterministic
 * contract output, provenance/redaction/path safety, scoring arithmetic and
 * bounded launch verdict promotion.
 */

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const data = require('./lib/m016-s05-seven-division-replay-data');
const contract = require('./lib/m016-s05-seven-division-replay-contract');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_REFS = [
  data.DEFAULTS.admission_schema_path,
  data.DEFAULTS.schema_path,
  data.DEFAULTS.worksheet_schema_path,
  data.DEFAULTS.producer_protocol_schema_path,
  data.DEFAULTS.verify_protocol_schema_path,
];
const ZERO_MUTATIONS = Object.freeze({
  issues_created: 0,
  issues_business_updated: 0,
  documents_created: 0,
  documents_business_updated: 0,
  projects_created: 0,
  projects_business_updated: 0,
  goals_created: 0,
  goals_business_updated: 0,
  plugins_created: 0,
  plugins_updated: 0,
  agents_created: 0,
  agents_operational_updated: 0,
  business_mutations_recorded: 0,
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hash(seed) {
  return contract.sha256Hex(String(seed));
}

function makeSourceRecord(role, classification, index, sourceKind = null) {
  const entry = data.ROLE_REGISTRY.find((candidate) => candidate.role === role);
  assert.ok(entry, 'fixture role must be in registry: ' + role);
  const isScratch = sourceKind === 'scratch_drill' || entry.methodology === 'scratch-drill';
  const base = {
    schema_id: 'https://gsd.local/schemas/runtime-evidence/m016-s03-safe-probe.v1.json',
    schema_version: 'v1',
    milestone: data.MILESTONE,
    slice: 'S03',
    task: 'T03',
    generated: data.DEFAULTS.reference_time,
    probe_id: 'M16-S03-PROBE-' + role.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + String(index).padStart(2, '0'),
    role_class: entry.role_class,
    role,
    classification,
    independence_group: entry.independence_group,
    method: isScratch ? entry.drill_kind || role.replace(/_/g, '-') : 'GET /api/health',
    command: isScratch ? 'node scripts/run_m016_s03_scratch_drills.js --drill ' + (entry.drill_kind || role.replace(/_/g, '-')) : 'GET http://127.0.0.1:43131/api/health',
    started_at: data.DEFAULTS.reference_time,
    finished_at: '2026-07-20T12:00:01.000Z',
    duration_ms: 1000,
    scope: isScratch ? 'scratch-drill-isolated' : 'offline-readonly-replay-fixture',
    limitations: ['fixture contains sanitised digests only', 'no live or network action is performed'],
    source_identity: isScratch
      ? { kind: 'scratch_drill', scratch_root: '/tmp/m016-s05-scratch/' + index, drill_kind: entry.drill_kind || role.replace(/_/g, '-') }
      : { kind: 'observed', company_kind: 'bos-light' },
    isolation_invariant: { read_only_boundary_pass: true, scratch_target_used: isScratch, boundary_blocker_code: null },
    mutation_audit: clone(ZERO_MUTATIONS),
    redaction: clone(data.REPLAY_REDACTION_FLAG_VALUES),
    verdict: classification === 'EXECUTED' ? 'pass' : 'not_proven',
    blocker_codes: classification === 'EXECUTED' ? [] : ['M16-S03-PROBE-TARGET-UNAVAILABLE-' + role],
  };
  if (classification === 'EXECUTED') {
    base.exit_code = 0;
    base.sanitised_digest = 'fixture-' + role + '-objective';
    base.artifact_reference = isScratch ? 'runtime-evidence/M016-S03-scratch-drill-results.json' : 'runtime-evidence/M016-S03-live-probe-results.json';
    base.artifact_hash = hash('artifact:' + role);
  } else {
    base.attempted_exit_code = 404;
    base.observed_blocker_code = 'M16-S03-PROBE-TARGET-UNAVAILABLE-' + role;
    base.observed_blocker_reason = 'fixture target unavailable; no raw response persisted';
  }
  return base;
}

function makeFullPack() {
  const roleRecords = data.DIVISION_ROLES
    .map((role, index) => makeSourceRecord(role, 'NOT_PROVEN', index))
    .concat(data.INFRASTRUCTURE_ROLES.map((role, index) => makeSourceRecord(role, 'EXECUTED', index + 7)));
  const drillRecords = data.DRILL_ROLE_KINDS.map((role, index) => makeSourceRecord(role, 'EXECUTED', index + 30, 'scratch_drill'));
  return { roleRecords, drillRecords };
}

function makeBundle() {
  const pack = makeFullPack();
  const normalized = contract.normalizeReplayRecords(pack);
  assert.equal(normalized.ok, true, normalized.reason);
  const records = normalized.records;
  const correlation = contract.buildCorrelationContract({ records, seed: 'schema-fixture' });
  assert.equal(correlation.ok, true, correlation.reason);
  const evidenceChain = contract.buildEvidenceChain({ generated: data.DEFAULTS.reference_time }).evidence_chain;
  const classification = contract.buildEmbeddedClassification({ records, evidenceChain, correlationUnique: true, replayMatch: true, rawInputImmutable: true });
  const worksheet = contract.buildScoringWorksheet({ records, classification, generated: data.DEFAULTS.reference_time });
  const bundle = {
    schema_id: data.SCHEMA_ID,
    schema_version: data.SCHEMA_VERSION,
    bundle_id: data.BUNDLE_ID,
    bundle_kind: data.BUNDLE_KIND,
    milestone: data.MILESTONE,
    slice: data.SLICE,
    task: data.PRODUCER_TASK_ID,
    generated: data.DEFAULTS.reference_time,
    bundle_digest: '',
    evidence_chain: evidenceChain,
    correlation_contract: correlation.correlation_contract,
    records,
    redaction_posture: clone(data.REPLAY_REDACTION_FLAG_VALUES),
    embedded_classification: classification,
    scoring_worksheet: worksheet,
    replay_keys: null,
    blockers: [],
    raw_input_immutability_verified: true,
    producer_verdict_line: 'M16-S05-REPLAY ' + classification.verdicts.orchestration + ' ' + classification.verdicts.evidence + ' ' + classification.verdicts.launch,
  };
  bundle.replay_keys = contract.attachReplayKeys({ bundle });
  bundle.bundle_digest = contract.computeBundleBodyDigest(bundle);
  return bundle;
}

function validatorFor(schemaRef) {
  const loaded = contract.loadSchema(schemaRef);
  assert.ok(loaded.schema, schemaRef + ' must parse');
  assert.equal(typeof loaded.validate, 'function', schemaRef + ' must compile with Ajv');
  return loaded.validate;
}

test('S05 data registry exposes frozen 19-record vocabulary and bounded verdicts', () => {
  assert.deepEqual(data.REPLAY_PARTITION, { role_count: 16, drill_count: 3, total: 19, divisions: 7, infrastructure: 9 });
  assert.equal(data.SCORING_WEIGHT_SUM, 1);
  assert.deepEqual(data.ORCHESTRATION_VERDICTS, ['PASS', 'PARTIAL', 'NOT_PROVEN']);
  assert.deepEqual(data.LAUNCH_VERDICTS, ['GO_BOUNDED_INTERNAL', 'PREPARATION_ONLY', 'NO_GO']);
  assert.equal(Object.isFrozen(data.DEFAULTS), true);
  assert.equal(data.isForbiddenReplayVerdict('GO'), true);
  assert.equal(data.isForbiddenReplayVerdict('GO_BOUNDED_INTERNAL'), false);
});

test('all five S05 schemas compile and advertise strict object roots', () => {
  for (const schemaRef of SCHEMA_REFS) {
    const loaded = contract.loadSchema(schemaRef);
    assert.equal(loaded.schema.additionalProperties, false, schemaRef);
    assert.equal(typeof loaded.validate, 'function', schemaRef);
  }
});

test('valid full 16+3 pack passes bundle, worksheet, producer and verifier schemas', () => {
  const bundle = makeBundle();
  const bundleValidator = validatorFor(data.DEFAULTS.schema_path);
  assert.equal(bundleValidator(bundle), true, JSON.stringify(bundleValidator.errors));
  const worksheetValidator = validatorFor(data.DEFAULTS.worksheet_schema_path);
  assert.equal(worksheetValidator(bundle.scoring_worksheet), true, JSON.stringify(worksheetValidator.errors));
  const producer = contract.buildProducerProtocol({ bundle, replayKeys: bundle.replay_keys, verdicts: bundle.embedded_classification.verdicts });
  const verify = contract.buildVerifyProtocol({ bundle, replayKeys: bundle.replay_keys, verdicts: bundle.embedded_classification.verdicts });
  assert.equal(validatorFor(data.DEFAULTS.producer_protocol_schema_path)(producer), true, JSON.stringify(validatorFor(data.DEFAULTS.producer_protocol_schema_path).errors));
  assert.equal(validatorFor(data.DEFAULTS.verify_protocol_schema_path)(verify), true, JSON.stringify(validatorFor(data.DEFAULTS.verify_protocol_schema_path).errors));
  const admission = contract.buildAdmission({ confirmed: true });
  assert.equal(validatorFor(data.DEFAULTS.admission_schema_path)(admission), true, JSON.stringify(validatorFor(data.DEFAULTS.admission_schema_path).errors));
});

test('contract produces deterministic replay, exact partition and independent worksheet arithmetic', () => {
  const bundle = makeBundle();
  const first = contract.evaluateReplayContract({ bundle, runSchema: true });
  const second = contract.evaluateReplayContract({ bundle: clone(bundle), runSchema: true });
  assert.equal(first.ok, true, JSON.stringify(first.blockers));
  assert.equal(second.ok, true, JSON.stringify(second.blockers));
  assert.equal(first.verdict, 'pass');
  assert.equal(first.records.length, 19);
  assert.equal(first.records.filter((record) => record.kind === 'live_replay_record').length, 16);
  assert.equal(first.records.filter((record) => record.kind === 'drill_replay_record').length, 3);
  assert.deepEqual(first.replay_keys, second.replay_keys);
  assert.equal(first.scoring_worksheet.weight_sum, 1);
  const recomputedScore = first.scoring_worksheet.steps.reduce((sum, row) => sum + row.contribution, 0);
  assert.equal(first.scoring_worksheet.score, Math.round(recomputedScore * 1e6) / 1e6);
  assert.equal(first.embedded_classification.verdicts.launch, 'PREPARATION_ONLY');
});

test('normalizer rejects record count, matrix drift, unknown role and classification drift', () => {
  const pack = makeFullPack();
  assert.equal(contract.normalizeReplayRecords({ roleRecords: pack.roleRecords.slice(0, 15), drillRecords: pack.drillRecords }).code, data.BLOCKER_CODES.PRODUCER_RECORDS_NOT_NINETEEN(18));
  const matrixDrift = makeFullPack();
  assert.equal(contract.normalizeReplayRecords({ records: matrixDrift.roleRecords.concat(matrixDrift.drillRecords), roleMatrix: [{ role: 'Div1.HCO', classification: 'EXECUTED', probe_id: matrixDrift.roleRecords[0].probe_id }], drillMatrix: [] }).ok, false);
  const unknown = makeFullPack();
  unknown.roleRecords[0].role = 'Div9.Unknown';
  assert.equal(contract.normalizeReplayRecords(unknown).ok, false, 'unknown roles are rejected before replay materialisation');
  const evaluated = contract.evaluateReplayContract({ records: contract.normalizeReplayRecords(makeFullPack()).records, runSchema: false });
  assert.equal(evaluated.ok, true);
  const reclassified = makeFullPack();
  reclassified.roleRecords[0].classification = 'MAYBE';
  const normalized = contract.normalizeReplayRecords(reclassified);
  assert.equal(normalized.ok, true);
  const result = contract.evaluateReplayContract({ records: normalized.records, runSchema: false });
  assert.ok(result.blockers.some((entry) => entry.code.includes('RECLASSIFIED')));
});

test('contract fails closed on path, provenance, redaction, correlation and verdict tampering', () => {
  const baseline = makeBundle();
  const cases = [
    ['path', (value) => { value.records[0].source_ref = '../../etc/passwd'; }, 'SOURCE-OUT-OF-ALLOWLIST'],
    ['hash', (value) => { value.evidence_chain[0].post_hash_sha256 = '0'.repeat(64); value.evidence_chain[0].unchanged = true; }, 'EVIDENCE-CHAIN-BROKEN'],
    ['redaction', (value) => { value.redaction_posture.full_ids = true; }, 'REDACTION-LEAK'],
    ['correlation', (value) => { value.correlation_contract.probe_to_criterion[1].probe_id = value.correlation_contract.probe_to_criterion[0].probe_id; }, 'CORRELATION-DUPLICATE'],
    ['promotion', (value) => { value.embedded_classification.verdicts.launch = 'GO_BOUNDED_INTERNAL'; }, 'LAUNCH-PROMOTION-DETECTED'],
  ];
  for (const [name, mutate, codeFragment] of cases) {
    const tampered = clone(baseline);
    mutate(tampered);
    const result = contract.evaluateReplayContract({ bundle: tampered, runSchema: false });
    assert.equal(result.ok, false, name);
    assert.ok(result.blockers.some((entry) => entry.code.includes(codeFragment)), name + ': ' + JSON.stringify(result.blockers));
    assert.notEqual(contract.mapBlockerToExitCode(result.blockers[0].code), 0, name);
  }
});

test('redaction writer rejects synthetic leak markers without persisting them', () => {
  assert.throws(() => contract.assertBundleWriteSafe({ redaction_posture: { full_ids: true } }), (error) => error.code === data.BLOCKER_CODES.PRODUCER_REDACTION_LEAK('full_ids'));
  assert.doesNotThrow(() => contract.assertBundleWriteSafe({ redaction_posture: clone(data.REPLAY_REDACTION_FLAG_VALUES), note: 'sanitised digest only' }));
});

test('schema roots reject unknown properties and forged promotion values', () => {
  const validate = validatorFor(data.DEFAULTS.schema_path);
  const unknown = makeBundle();
  unknown.unexpected = true;
  assert.equal(validate(unknown), false);
  const forged = makeBundle();
  forged.embedded_classification.verdicts.launch = 'GO';
  assert.equal(validate(forged), false);
});

test('contract has no producer CLI import and no process/network execution surface', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts/lib/m016-s05-seven-division-replay-contract.js'), 'utf8');
  assert.doesNotMatch(source, /produce_m016_s05_seven_division_replay/);
  assert.doesNotMatch(source, /child_process|execSync|spawnSync|fetch\s*\(|https?:\/\//);
});
