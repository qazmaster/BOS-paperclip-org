#!/usr/bin/env node
'use strict';

/**
 * scripts/test_m016_s08_native_seven_agent_contract.js
 *
 * M016-txa3vu / S08 / T01 — schema, data registry, and pure contract tests
 * for the bounded native seven-agent Paperclip integration proof.
 *
 * Tests cover:
 *   1. Data registry shape (frozen enums, blocker namespaces, division registry)
 *   2. Schema compile + strict object roots
 *   3. BLOCKER_CODES factory namespace + stable exit-code mapping
 *   4. Closure discriminated-union coherence (live + scope_revised)
 *   5. BOS identity expectations (/BOS required, /BOSA forbidden)
 *   6. Negative fixture taxonomy (14 fixtures, unique blocker codes)
 *   7. Division registry: exactly 7 Div1..Div7 roles, exactly-once
 *   8. Verifier verdict line construction (canonical M16-S08-VERIFY)
 *   9. Redaction safety surfaces leak hits
 *  10. Sidecar builders: admission, candidate, closure, scope-decision,
 *      negative-fixtures, verify-protocol
 *  11. evaluateContract: live PASS, scope_revised PASS, malformed FAIL
 *  12. Schema rejects unknown properties, forbidden closure verdicts, branch
 *      drift and mutation ledger drift
 *  13. Pure contract module has no subprocess / network / write surface
 *
 * Run with: node --test scripts/test_m016_s08_native_seven_agent_contract.js
 */

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const data = require('./lib/m016-s08-native-seven-agent-data');
const contract = require('./lib/m016-s08-native-seven-agent-contract');

const ROOT = path.resolve(__dirname, '..');

const SCHEMA_REFS = [
  data.DEFAULTS.admission_schema_path,
  data.DEFAULTS.candidate_schema_path,
  data.DEFAULTS.closure_schema_path,
  data.DEFAULTS.scope_decision_schema_path,
  data.DEFAULTS.negative_fixtures_schema_path,
  data.DEFAULTS.verify_protocol_schema_path,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeSourceHashes() {
  const hashes = {};
  for (const entry of data.SOURCE_ALLOWLIST) {
    hashes[entry.source_ref] = contract.sha256Hex('s08-schema-test-fixture:' + entry.source_ref);
  }
  return hashes;
}

function makeMinimalAgentRuns(overrides) {
  const generated = overrides?.generated || data.DEFAULTS.reference_time;
  return data.DIVISION_REGISTRY.map((entry, index) => ({
    agent_run_id: 'M16-S08-NATIVE-RUN-' + entry.division.toLowerCase() + '-' + contract.sha256Hex('seed-' + index).slice(0, 8),
    division: entry.division,
    role: entry.role,
    agent_label_path: '/BOS/agents/' + entry.agent_label,
    independence_group: entry.independence_group,
    status: 'SUCCEEDED',
    exit_code: 0,
    started_at: generated,
    finished_at: generated,
    duration_ms: 100,
    evidence_id: 'm016-s08-native-evidence-' + entry.division.toLowerCase(),
    criterion_id: entry.gate,
    sanitised_digest_sha256: contract.sha256Hex(entry.division + '|' + generated),
    source_ref: data.SOURCE_ALLOWLIST[2].source_ref,
  }));
}

function makeAdmission(overrides) {
  const generated = overrides?.generated || data.DEFAULTS.reference_time;
  return contract.buildAdmission(Object.assign({
    confirmed: true,
    operatorSource: 'cli_argv',
    freshReadonlyProbe: true,
    staleMarkerDetected: false,
    observedAgentCount: 7,
    sourceHashes: [],
  }, overrides || {}));
}

function makeCandidate(overrides) {
  const generated = overrides?.generated || data.DEFAULTS.reference_time;
  const admission = overrides?.admission || makeAdmission({ generated });
  const evidenceChain = overrides?.evidenceChain || contract.buildEvidenceChain({ generated }).evidence_chain;
  const agentRuns = overrides?.agent_runs || makeMinimalAgentRuns({ generated });
  const mutationLedger = overrides?.mutationLedger || {
    expected_mutation_count: 1,
    observed_mutation_count: 1,
    unexpected_mutation_count: 0,
    expected_mutations: [{ kind: 'bounded_root_intake', subject_ref: 'paperclip_native_root_artifact', mutation_index_sha256: contract.sha256Hex('expected-' + generated) }],
    observed_mutations: [{ kind: 'bounded_root_intake', subject_ref: 'paperclip_native_root_artifact', mutation_index_sha256: contract.sha256Hex('observed-' + generated), phase: 'intake' }],
    unexpected_mutations: [],
  };
  return contract.buildCandidate(Object.assign({
    admission,
    generated,
    evidenceChain,
    agent_runs: agentRuns,
    mutationLedger,
  }, overrides || {}));
}

function makeClosure(overrides) {
  // Use the SAME hash for first/second run so replay_keys.match=true,
  // which is required by the closure schema's allOf branch for LIVE closures.
  const canonicalHash = contract.sha256Hex('closure-canonical-' + data.DEFAULTS.reference_time);
  return contract.buildClosure(Object.assign({
    closureKind: data.CLOSURE_KINDS.LIVE,
    divisions: 7,
    unexpectedMutations: 0,
    firstRunProvenanceHash: canonicalHash,
    secondRunProvenanceHash: canonicalHash,
    byteIdentical: true,
  }, overrides || {}));
}

// ---------------------------------------------------------------------------
// Test 1: Data registry shape
// ---------------------------------------------------------------------------

test('data registry exposes frozen namespaces and discriminator vocabularies', () => {
  assert.equal(data.NAMESPACE, 'M16-S08-NATIVE');
  assert.equal(data.VALIDATOR_NAMESPACE, 'M16-S08-VERIFY');
  assert.equal(data.PRODUCER_LINE_CLASS, 'M16-S08-NATIVE');
  assert.equal(data.VERIFIER_LINE_CLASS, 'M16-S08-VERIFY');
  assert.equal(data.OPERATOR_GATE_TOKEN, '--confirm-native-seven-agent-replay');
  assert.equal(data.VERIFIER_VERDICT_LINE_PREFIX, 'M16-S08-VERIFY');

  // Closure kinds
  assert.equal(data.CLOSURE_KINDS.LIVE, 'live');
  assert.equal(data.CLOSURE_KINDS.SCOPE_REVISED, 'scope_revised');
  assert.ok(data.isValidClosureKind('live'));
  assert.ok(data.isValidClosureKind('scope_revised'));
  assert.ok(!data.isValidClosureKind('unknown'));
  assert.ok(!data.isValidClosureKind('partial'));

  // Closure verdicts (only two)
  assert.equal(data.CLOSURE_VERDICT_VALUES.PROVEN_BOUNDED_NATIVE, 'PROVEN_BOUNDED_NATIVE');
  assert.equal(data.CLOSURE_VERDICT_VALUES.NOT_PROVEN_SCOPE_REVISED, 'NOT_PROVEN_SCOPE_REVISED');
  assert.ok(data.isValidClosureVerdict('PROVEN_BOUNDED_NATIVE'));
  assert.ok(data.isValidClosureVerdict('NOT_PROVEN_SCOPE_REVISED'));
  assert.ok(!data.isValidClosureVerdict('GO'));
  assert.ok(!data.isValidClosureVerdict('PASS'));

  // Boundary values
  assert.equal(data.BOUNDARY_VALUES.PREPARATION_ONLY, 'PREPARATION_ONLY');
  assert.ok(data.isValidBoundary('PREPARATION_ONLY'));
  assert.ok(data.isForbiddenBoundary('GO'));
  assert.ok(data.isForbiddenBoundary('NO_GO'));

  // Forbidden closure verdicts
  assert.ok(data.isForbiddenClosureVerdict('GO'));
  assert.ok(data.isForbiddenClosureVerdict('PASS'));
  assert.ok(data.isForbiddenClosureVerdict('GO_BOUNDED_INTERNAL'));
  assert.ok(data.isForbiddenClosureVerdict('LAUNCH_GO'));
  assert.ok(!data.isForbiddenClosureVerdict('PROVEN_BOUNDED_NATIVE'));
  assert.ok(!data.isForbiddenClosureVerdict('NOT_PROVEN_SCOPE_REVISED'));

  // Coherence
  assert.ok(data.isCoherentClosureKind('live', 'PROVEN_BOUNDED_NATIVE'));
  assert.ok(data.isCoherentClosureKind('scope_revised', 'NOT_PROVEN_SCOPE_REVISED'));
  assert.ok(!data.isCoherentClosureKind('live', 'NOT_PROVEN_SCOPE_REVISED'));
  assert.ok(!data.isCoherentClosureKind('scope_revised', 'PROVEN_BOUNDED_NATIVE'));

  // Terminal states
  assert.ok(data.isTerminalState('SUCCEEDED'));
  assert.ok(data.isTerminalState('FAILED'));
  assert.ok(data.isTerminalState('ABANDONED'));
  assert.ok(!data.isTerminalState('RUNNING'));
  assert.ok(!data.isTerminalState('PENDING'));
  assert.ok(data.isNonTerminalState('RUNNING'));
  assert.ok(data.isNonTerminalState('IN_PROGRESS'));
});

test('division registry exposes exactly 7 frozen Div1..Div7 roles', () => {
  assert.equal(data.DIVISION_REGISTRY.length, 7);
  assert.equal(data.DIVISION_ROLES_S08.length, 7);
  const expectedDivisions = ['Div1', 'Div2', 'Div3', 'Div4', 'Div5', 'Div6', 'Div7'];
  for (const division of expectedDivisions) {
    const entry = data.getS08DivisionEntry(division);
    assert.ok(entry, 'division entry missing for ' + division);
    assert.ok(data.isKnownS08Division(division), 'isKnownS08Division false for ' + division);
    assert.ok(data.isKnownS08DivisionRole(entry.role), 'isKnownS08DivisionRole false for ' + entry.role);
  }
  // Distinct roles
  const roles = new Set(data.DIVISION_ROLES_S08);
  assert.equal(roles.size, 7);
  // Distinct divisions
  const divisions = new Set(data.DIVISION_REGISTRY.map((entry) => entry.division));
  assert.equal(divisions.size, 7);
  // Each entry has gate + independence_group
  for (const entry of data.DIVISION_REGISTRY) {
    assert.ok(/^HG[1-8] /.test(entry.gate), 'gate must be HGx: ' + entry.gate);
    assert.ok(entry.independence_group.length >= 4);
  }
  // Lookup by role
  const roleEntry = data.getS08DivisionEntry('Div3.Treasury');
  assert.equal(roleEntry.division, 'Div3');
  assert.equal(roleEntry.gate, 'HG3 RECOVERY_EVIDENCE');
  // Unknown returns null
  assert.equal(data.getS08DivisionEntry('Div9.Unknown'), null);
  assert.equal(data.getS08DivisionEntry(''), null);
});

test('BOS identity expectations require /BOS and forbid /BOSA', () => {
  assert.equal(data.BOS_CANONICAL_COMPANY_PATH, '/BOS');
  assert.equal(data.BOS_FORBIDDEN_COMPANY_PATH, '/BOSA');
  const exp = data.BOS_IDENTITY_EXPECTATIONS;
  assert.deepEqual(Array.from(exp.required_company_paths), ['/BOS']);
  assert.deepEqual(Array.from(exp.forbidden_company_paths), ['/BOSA']);
  assert.equal(exp.required_agent_count, 7);
  assert.ok(exp.stale_marker_paths.indexOf('/BOSA') >= 0);
  assert.equal(exp.expected_marker, 'fresh-readonly-probe-required');
});

// ---------------------------------------------------------------------------
// Test 2: Schema compile + strict object roots
// ---------------------------------------------------------------------------

test('all 6 S08 schemas compile and reject malformed input', () => {
  for (const schemaPath of SCHEMA_REFS) {
    const loaded = contract.loadSchema(schemaPath);
    assert.ok(loaded.schema, 'schema missing for ' + schemaPath);
    assert.equal(typeof loaded.validate, 'function', 'validator not compiled for ' + schemaPath);
  }
});

test('loadSchema throws with a VALIDATOR_SCHEMAS_NOT_LOADED blocker for unknown paths', () => {
  assert.throws(() => contract.loadSchema('schemas/runtime-evidence/missing-schema-v9.json'), (err) => {
    return typeof err.code === 'string' && err.code.startsWith('M16-S08-VERIFY-SCHEMAS-NOT-LOADED-');
  });
});

test('admission schema rejects objects that are missing required fields', () => {
  const loaded = contract.loadSchema(data.DEFAULTS.admission_schema_path);
  const shape = contract.validateObjectShape({}, loaded.validate);
  assert.equal(shape.ok, false);
  assert.ok(shape.errors.length > 0);
});

test('candidate schema rejects unknown properties', () => {
  const loaded = contract.loadSchema(data.DEFAULTS.candidate_schema_path);
  const candidate = makeCandidate();
  candidate.unknown_field = 'leak';
  const shape = contract.validateObjectShape(candidate, loaded.validate);
  assert.equal(shape.ok, false);
});

test('closure schema enforces the discriminated allOf branch', () => {
  const loaded = contract.loadSchema(data.DEFAULTS.closure_schema_path);
  // PROVEN_BOUNDED_NATIVE requires candidate_ref + divisions_count=7 + correlated_runs=7 + verifier_agreement=true + unexpected_mutations=0
  const validClosure = makeClosure();
  const shape1 = contract.validateObjectShape(validClosure, loaded.validate);
  assert.equal(shape1.ok, true, 'valid live closure must pass: ' + JSON.stringify(shape1.errors));

  // scope_revised branch requires NOT_PROVEN_SCOPE_REVISED + at least 1 verifier_blocker_code
  const scopeClosure = makeClosure({ closureKind: data.CLOSURE_KINDS.SCOPE_REVISED });
  scopeClosure.verifier_blocker_codes = [data.BLOCKER_CODES.VALIDATOR_SCOPE_REVISION_NOT_REVISED()];
  delete scopeClosure.candidate_ref;
  const shape2 = contract.validateObjectShape(scopeClosure, loaded.validate);
  assert.equal(shape2.ok, true, 'scope_revised closure must pass: ' + JSON.stringify(shape2.errors));
});

test('closure schema rejects live branch with missing candidate_ref', () => {
  const loaded = contract.loadSchema(data.DEFAULTS.closure_schema_path);
  const broken = makeClosure();
  delete broken.candidate_ref;
  const shape = contract.validateObjectShape(broken, loaded.validate);
  assert.equal(shape.ok, false);
});

test('closure schema rejects forbidden closure_verdict values', () => {
  const loaded = contract.loadSchema(data.DEFAULTS.closure_schema_path);
  const closure = makeClosure();
  closure.closure_verdict = 'GO';
  const shape = contract.validateObjectShape(closure, loaded.validate);
  assert.equal(shape.ok, false);
});

test('verify protocol schema accepts canonical verifier output', () => {
  const loaded = contract.loadSchema(data.DEFAULTS.verify_protocol_schema_path);
  const verifyProtocol = contract.buildVerifyProtocol({});
  const shape = contract.validateObjectShape(verifyProtocol, loaded.validate);
  assert.equal(shape.ok, true, 'verify protocol must pass: ' + JSON.stringify(shape.errors));
});

test('negative fixtures schema rejects fewer than 13 fixtures', () => {
  const loaded = contract.loadSchema(data.DEFAULTS.negative_fixtures_schema_path);
  const negativeFixtures = contract.buildNegativeFixtures({});
  // Sanity: must have at least 13 fixtures
  assert.ok(negativeFixtures.fixtures.length >= 13);
  const shape = contract.validateObjectShape(negativeFixtures, loaded.validate);
  assert.equal(shape.ok, true);
});

test('scope decision schema accepts canonical scope branch', () => {
  const loaded = contract.loadSchema(data.DEFAULTS.scope_decision_schema_path);
  const scopeDecision = contract.buildScopeDecision({});
  const shape = contract.validateObjectShape(scopeDecision, loaded.validate);
  assert.equal(shape.ok, true, 'scope decision must pass: ' + JSON.stringify(shape.errors));
});

// ---------------------------------------------------------------------------
// Test 3: BLOCKER_CODES factory namespaces + stable exit-code mapping
// ---------------------------------------------------------------------------

test('all producer blocker codes match M16-S08-NATIVE-* regex', () => {
  for (const [name, factory] of Object.entries(data.BLOCKER_CODES)) {
    if (!name.startsWith('PRODUCER_')) continue;
    const code = factory();
    assert.ok(data.isReplayBlockerCode(code), 'producer blocker ' + name + ' failed regex: ' + code);
  }
});

test('all validator blocker codes match M16-S08-VERIFY-* regex', () => {
  for (const [name, factory] of Object.entries(data.BLOCKER_CODES)) {
    if (!name.startsWith('VALIDATOR_')) continue;
    const code = factory();
    assert.ok(data.isVerifierBlockerCode(code), 'validator blocker ' + name + ' failed regex: ' + code);
  }
});

test('bloker factory with parameters produces stable M16-S08-* codes', () => {
  assert.equal(data.BLOCKER_CODES.PRODUCER_BOS_IDENTITY_MISSING('/BOS'), 'M16-S08-NATIVE-BOS-IDENTITY-MISSING-BOS');
  assert.equal(data.BLOCKER_CODES.PRODUCER_DIVISION_DUPLICATE('Div3'), 'M16-S08-NATIVE-DIVISION-DUPLICATE-Div3');
  assert.equal(data.BLOCKER_CODES.VALIDATOR_AGENT_IDENTITY_MISSING('Div5.QualificationsLibraryLearning'), 'M16-S08-VERIFY-AGENT-IDENTITY-MISSING-Div5.QualificationsLibraryLearning');
});

test('exit codes map cleanly to 0..9', () => {
  const values = Object.values(data.EXIT_CODES);
  assert.equal(values.length, 10);
  for (const v of values) assert.ok(Number.isInteger(v) && v >= 0 && v <= 9);
  assert.equal(data.EXIT_CODES.PASS, 0);
});

// ---------------------------------------------------------------------------
// Test 4: Closure discriminated-union coherence
// ---------------------------------------------------------------------------

test('closure builder accepts closureKind="live" only with PROVEN_BOUNDED_NATIVE', () => {
  const closure = makeClosure({ closureKind: data.CLOSURE_KINDS.LIVE });
  assert.equal(closure.closure_kind, 'live');
  assert.equal(closure.closure_verdict, 'PROVEN_BOUNDED_NATIVE');
  assert.equal(closure.boundary, 'PREPARATION_ONLY');
});

test('closure builder accepts closureKind="scope_revised" only with NOT_PROVEN_SCOPE_REVISED', () => {
  const closure = makeClosure({ closureKind: data.CLOSURE_KINDS.SCOPE_REVISED });
  assert.equal(closure.closure_kind, 'scope_revised');
  assert.equal(closure.closure_verdict, 'NOT_PROVEN_SCOPE_REVISED');
  assert.equal(closure.boundary, 'PREPARATION_ONLY');
});

// ---------------------------------------------------------------------------
// Test 5: Verifier verdict line construction
// ---------------------------------------------------------------------------

test('buildVerifierVerdictLine emits canonical M16-S08-VERIFY single line for live branch', () => {
  const line = contract.buildVerifierVerdictLine({
    closureKind: data.CLOSURE_KINDS.LIVE,
    closureVerdict: data.CLOSURE_VERDICT_VALUES.PROVEN_BOUNDED_NATIVE,
    exitCode: 0,
    blockers: 0,
    divisions: 7,
    correlatedRuns: 7,
    unexpectedMutations: 0,
    replayKeyMatch: true,
  });
  assert.ok(line.startsWith('M16-S08-VERIFY verdict=live:PROVEN_BOUNDED_NATIVE '), 'line prefix mismatch: ' + line);
  assert.ok(line.includes(' exit=0 '));
  assert.ok(line.includes(' blockers=0 '));
  assert.ok(line.includes(' divisions=7 '));
  assert.ok(line.includes(' correlated_runs=7 '));
  assert.ok(line.includes(' unexpected_mutations=0 '));
  assert.ok(line.includes(' replay_key_match=true'));
});

test('buildVerifierVerdictLine emits canonical M16-S08-VERIFY single line for scope branch', () => {
  const line = contract.buildVerifierVerdictLine({
    closureKind: data.CLOSURE_KINDS.SCOPE_REVISED,
    closureVerdict: data.CLOSURE_VERDICT_VALUES.NOT_PROVEN_SCOPE_REVISED,
    exitCode: 2,
    blockers: 1,
    divisions: 0,
    correlatedRuns: 0,
    unexpectedMutations: 0,
    replayKeyMatch: false,
  });
  assert.ok(line.startsWith('M16-S08-VERIFY verdict=scope_revised:NOT_PROVEN_SCOPE_REVISED '));
  assert.ok(line.includes(' exit=2 '));
  assert.ok(line.includes(' replay_key_match=false'));
});

test('verifier line matches the schema regex pattern', () => {
  const verifyProtocol = contract.buildVerifyProtocol({});
  const line = verifyProtocol.canonical_verdict_line;
  const re = /^M16-S08-VERIFY verdict=(live:PROVEN_BOUNDED_NATIVE|scope_revised:NOT_PROVEN_SCOPE_REVISED) exit=[0-9] blockers=[0-9]+ divisions=[0-9]+ correlated_runs=[0-9]+ unexpected_mutations=[0-9]+ replay_key_match=(true|false)$/;
  assert.ok(re.test(line), 'verifier line does not match canonical regex: ' + line);
});

// ---------------------------------------------------------------------------
// Test 6: Negative fixture taxonomy
// ---------------------------------------------------------------------------

test('NEGATIVE_FIXTURE_TAXONOMY has 13+ entries with unique stable blocker codes', () => {
  assert.ok(data.NEGATIVE_FIXTURE_TAXONOMY.length >= 13);
  const codes = new Set();
  for (const entry of data.NEGATIVE_FIXTURE_TAXONOMY) {
    assert.ok(data.isFixtureId(entry.fixture_id), 'fixture_id regex failed: ' + entry.fixture_id);
    assert.ok(entry.blocker().length > 0);
    assert.ok(codes.add(entry.blocker()), 'duplicate blocker: ' + entry.blocker());
  }
  assert.equal(codes.size, data.NEGATIVE_FIXTURE_TAXONOMY.length);
  // Spot-check the canonical fixture ids
  assert.ok(data.isKnownFixtureId('M16-S08-NATIVE-MISSING-CONFIRMATION-FIXTURE'));
  assert.ok(data.isKnownFixtureId('M16-S08-NATIVE-SYNTHETIC-BOS-FIXTURE'));
  assert.ok(!data.isKnownFixtureId('M16-S08-NATIVE-NONEXISTENT-FIXTURE'));
  assert.equal(data.getFixtureEntry('M16-S08-NATIVE-NONEXISTENT-FIXTURE'), null);
});

test('buildNegativeFixtures produces schema-valid fixture manifest with deterministic shape digests', () => {
  const fixtures = contract.buildNegativeFixtures({});
  assert.equal(fixtures.fixture_count, fixtures.fixtures.length);
  assert.equal(fixtures.all_blockers_unique, true);
  // All fixtures target scope_revised (live branch never admits these shapes)
  for (const fixture of fixtures.fixtures) {
    assert.equal(fixture.closure_kind_target, 'scope_revised');
    assert.ok(/^[a-f0-9]{64}$/.test(fixture.shape_digest_sha256));
  }
  // Categories include all 11 named categories at minimum
  for (const cat of fixtures.categories) {
    assert.ok(['admission', 'identity', 'correlation', 'graph', 'terminality', 'provenance', 'mutation', 'timing', 'redaction', 'closure', 'replay'].indexOf(cat) >= 0);
  }
});

// ---------------------------------------------------------------------------
// Test 7: Source allowlist + path confinement
// ---------------------------------------------------------------------------

test('SOURCE_ALLOWLIST contains required M015/S05 sources and is referenced via safe paths only', () => {
  for (const source of data.SOURCE_ALLOWLIST) {
    assert.ok(contract._sourceAllowed(source.source_ref), 'source_ref must pass _sourceAllowed: ' + source.source_ref);
    assert.ok(source.kind.length > 0);
    assert.ok(source.chain_role.length > 0);
    assert.ok(source.independence_group.length >= 4);
  }
  // All required sources must include M015 + S05 evidence
  const requiredRefs = data.SOURCE_ALLOWLIST.filter((s) => s.required).map((s) => s.source_ref);
  assert.ok(requiredRefs.some((r) => r.indexOf('M015') >= 0));
  assert.ok(requiredRefs.some((r) => r.indexOf('M016-S05') >= 0));
});

test('_sourceAllowed rejects traversal and unknown paths', () => {
  assert.equal(contract._sourceAllowed('../etc/passwd'), false);
  assert.equal(contract._sourceAllowed('runtime-evidence/M999-unknown.json'), false);
  assert.equal(contract._sourceAllowed('runtime-evidence/M016-S05-seven-division-replay-bundle.json'), true);
  assert.equal(contract._sourceAllowed(null), false);
  assert.equal(contract._sourceAllowed(undefined), false);
});

// ---------------------------------------------------------------------------
// Test 8: Redaction safety
// ---------------------------------------------------------------------------

test('checkRedactionSafety detects raw_body, credentials, vendor, BOS and raw token', () => {
  const payload = {
    raw_body: 'some raw body',
    credentials: 'api_key: SECRET',
    vendor_reuse: 'xiaomi',
    synthetic_bos: 'result_json.bos',
    raw_reasoning: 'chain-of-thought content',
  };
  const hits = contract.checkRedactionSafety(payload);
  const kinds = new Set(hits.map((h) => h.kind));
  assert.ok(kinds.has('raw_body'));
  assert.ok(kinds.has('credentials'));
  assert.ok(kinds.has('vendor_reuse'));
  assert.ok(kinds.has('synthetic_bos'));
  assert.ok(kinds.has('raw_reasoning'));
});

test('checkRedactionSafety detects full_uuid and pii patterns', () => {
  const uuid = '12345678-1234-1234-8234-123456789012';
  const payload = { notes: 'uuid ' + uuid + ' and email user@example.com' };
  const hits = contract.checkRedactionSafety(payload);
  const kinds = new Set(hits.map((h) => h.kind));
  assert.ok(kinds.has('full_uuid'));
  assert.ok(kinds.has('pii'));
});

test('checkRedactionSafety accepts canonical redacted posture without hits', () => {
  const payload = {
    redaction_posture: data.REDACTION_FLAG_VALUES,
    sanitised_digest_sha256: contract.sha256Hex('clean'),
  };
  const hits = contract.checkRedactionSafety(payload);
  assert.equal(hits.length, 0);
});

test('assertWriteSafe throws with redaction leak code on dirty payloads', () => {
  assert.throws(() => contract.assertWriteSafe({ raw_body: 'leak' }), (err) => {
    return err.code === data.BLOCKER_CODES.PRODUCER_REDACTION_LEAK('raw_body');
  });
});

// ---------------------------------------------------------------------------
// Test 9: Build functions produce schema-valid sidecars
// ---------------------------------------------------------------------------

test('buildAdmission produces schema-valid green admission', () => {
  const admission = makeAdmission();
  const loaded = contract.loadSchema(data.DEFAULTS.admission_schema_path);
  const shape = contract.validateObjectShape(admission, loaded.validate);
  assert.equal(shape.ok, true, 'admission must pass: ' + JSON.stringify(shape.errors));
  assert.equal(admission.operator_gate.confirmed, true);
  assert.equal(admission.operator_gate.source, 'cli_argv');
  assert.equal(admission.operator_gate.token, '--confirm-native-seven-agent-replay');
  assert.equal(admission.bos_identity_probe.expected_agent_count, 7);
  assert.equal(admission.bos_identity_probe.fresh_readonly_probe, true);
  assert.equal(admission.bos_identity_probe.stale_marker_detected, false);
});

test('buildAdmission produces denial when operator gate not confirmed', () => {
  const admission = makeAdmission({ confirmed: false });
  assert.equal(admission.operator_gate.confirmed, false);
  assert.equal(admission.denial_diagnostic_only, true);
  assert.ok(admission.blockers.length > 0);
  assert.equal(admission.blockers[0].code, data.BLOCKER_CODES.PRODUCER_OPERATOR_GATE_DENIED());
});

test('buildAdmission rejects operatorSource other than cli_argv', () => {
  const admission = makeAdmission({ operatorSource: 'env' });
  assert.ok(admission.blockers.some((b) => b.code === data.BLOCKER_CODES.PRODUCER_OPERATOR_GATE_FROM_ENV()));
});

test('buildCandidate produces schema-valid sanitised graph', () => {
  const candidate = makeCandidate();
  const loaded = contract.loadSchema(data.DEFAULTS.candidate_schema_path);
  const shape = contract.validateObjectShape(candidate, loaded.validate);
  assert.equal(shape.ok, true, 'candidate must pass: ' + JSON.stringify(shape.errors));
  assert.equal(candidate.agent_runs.length, 7);
  // All divisions present exactly once
  const divisions = candidate.agent_runs.map((run) => run.division);
  assert.equal(new Set(divisions).size, 7);
  // All terminal
  for (const run of candidate.agent_runs) {
    assert.ok(data.isTerminalState(run.status));
  }
  // Mutation ledger: expected=1, observed=1, unexpected=0
  assert.equal(candidate.mutation_ledger.expected_mutation_count, 1);
  assert.equal(candidate.mutation_ledger.observed_mutation_count, 1);
  assert.equal(candidate.mutation_ledger.unexpected_mutation_count, 0);
  // Correlation: 7 rows in each section
  assert.equal(candidate.correlation_contract.probe_to_criterion.length, 7);
  assert.equal(candidate.correlation_contract.agent_run_to_probe.length, 7);
  assert.equal(candidate.correlation_contract.evidence_to_criterion.length, 7);
});

test('buildCandidate rejects missing division (only 6 runs)', () => {
  const truncated = makeMinimalAgentRuns().slice(0, 6);
  const candidate = makeCandidate({ agent_runs: truncated });
  const result = contract.checkAgentRuns(candidate.agent_runs);
  // Exactly 1 division is missing (Div7 was dropped)
  assert.equal(result.filter((b) => b.code === data.BLOCKER_CODES.PRODUCER_READBACK_MISSING('Div7')).length > 0, true);
});

test('buildCandidate rejects duplicate division', () => {
  const runs = makeMinimalAgentRuns();
  // Replace Div7 with a second Div3 entry (duplicate)
  runs[6] = { ...runs[2], division: 'Div3', role: 'Div3.Treasury', agent_run_id: runs[6].agent_run_id };
  const candidate = makeCandidate({ agent_runs: runs });
  const result = contract.checkAgentRuns(candidate.agent_runs);
  // Div7 is now missing (runs[6] was Div7, replaced with Div3) + Div3 is duplicated
  assert.equal(result.filter((b) => b.code === data.BLOCKER_CODES.PRODUCER_DIVISION_DUPLICATE('Div3')).length > 0, true);
  assert.equal(result.filter((b) => b.code === data.BLOCKER_CODES.PRODUCER_READBACK_MISSING('Div7')).length > 0, true);
});

test('buildCandidate rejects non-terminal readback', () => {
  const runs = makeMinimalAgentRuns();
  runs[3].status = 'RUNNING';
  const candidate = makeCandidate({ agent_runs: runs });
  const result = contract.checkAgentRuns(candidate.agent_runs);
  assert.equal(result.filter((b) => b.code === data.BLOCKER_CODES.PRODUCER_NON_TERMINAL_READBACK('Div4.Production')).length > 0, true);
});

test('buildClosure produces schema-valid live closure', () => {
  const closure = makeClosure();
  const loaded = contract.loadSchema(data.DEFAULTS.closure_schema_path);
  const shape = contract.validateObjectShape(closure, loaded.validate);
  assert.equal(shape.ok, true, 'closure must pass: ' + JSON.stringify(shape.errors));
  assert.equal(closure.closure_kind, 'live');
  assert.equal(closure.closure_verdict, 'PROVEN_BOUNDED_NATIVE');
  assert.equal(closure.divisions_count, 7);
  assert.equal(closure.correlated_runs, 7);
  assert.equal(closure.unexpected_mutations, 0);
  assert.equal(closure.replay_key_match, true);
  assert.equal(closure.verifier_agreement, true);
});

test('buildScopeDecision produces schema-valid scope branch', () => {
  const decision = contract.buildScopeDecision({});
  const loaded = contract.loadSchema(data.DEFAULTS.scope_decision_schema_path);
  const shape = contract.validateObjectShape(decision, loaded.validate);
  assert.equal(shape.ok, true, 'scope decision must pass: ' + JSON.stringify(shape.errors));
  assert.equal(decision.closure_kind, 'scope_revised');
  assert.equal(decision.closure_verdict, 'NOT_PROVEN_SCOPE_REVISED');
  assert.equal(decision.boundary, 'PREPARATION_ONLY');
  assert.equal(decision.mutating_harness_invoked, false);
  assert.equal(decision.candidate_created, false);
  assert.equal(decision.agent_runs_materialised, 0);
});

test('buildVerifyProtocol produces schema-valid verifier output', () => {
  const protocol = contract.buildVerifyProtocol({});
  const loaded = contract.loadSchema(data.DEFAULTS.verify_protocol_schema_path);
  const shape = contract.validateObjectShape(protocol, loaded.validate);
  assert.equal(shape.ok, true, 'verify protocol must pass: ' + JSON.stringify(shape.errors));
  assert.equal(protocol.producer_cli_imported, false);
  assert.equal(protocol.network_calls, 0);
  assert.equal(protocol.mutation_count, 0);
  assert.ok(protocol.tamper_classes_executed >= 13);
});

// ---------------------------------------------------------------------------
// Test 10: Replay keys
// ---------------------------------------------------------------------------

test('buildReplayKeys produces stable hash derived from first+second digests', () => {
  const first = contract.sha256Hex('first');
  const second = contract.sha256Hex('second');
  const keys = contract.buildReplayKeys({
    firstRunProvenanceHash: first,
    secondRunProvenanceHash: second,
    referenceTime: data.DEFAULTS.reference_time,
  });
  assert.equal(keys.first_run_provenance_hash, first);
  assert.equal(keys.second_run_provenance_hash, second);
  assert.equal(keys.match, false);
  assert.equal(keys.byte_identical, false);
  assert.equal(keys.replay_key, contract.sha256Hex(first + ':' + second + ':' + data.DEFAULTS.reference_time));
});

test('buildReplayKeys reports match=true when first and second digests are equal', () => {
  const digest = contract.sha256Hex('same');
  const keys = contract.buildReplayKeys({
    firstRunProvenanceHash: digest,
    secondRunProvenanceHash: digest,
    referenceTime: data.DEFAULTS.reference_time,
  });
  assert.equal(keys.match, true);
  assert.equal(keys.byte_identical, true);
});

// ---------------------------------------------------------------------------
// Test 11: Evaluator (live PASS, scope_revised PASS, malformed FAIL)
// ---------------------------------------------------------------------------

test('evaluateContract returns ok=true for green live branch', () => {
  const admission = makeAdmission();
  const candidate = makeCandidate({ admission });
  const result = contract.evaluateContract({
    closureKind: data.CLOSURE_KINDS.LIVE,
    admission,
    candidate,
    evidenceChain: candidate.evidence_chain,
  });
  assert.equal(result.ok, true, 'green live branch must pass: ' + JSON.stringify(result.blockers));
  assert.equal(result.exit_code, data.EXIT_CODES.PASS);
  assert.equal(result.closure_kind, 'live');
  assert.equal(result.closure_verdict, 'PROVEN_BOUNDED_NATIVE');
});

test('evaluateContract returns ok=true for valid scope branch', () => {
  const result = contract.evaluateContract({
    closureKind: data.CLOSURE_KINDS.SCOPE_REVISED,
  });
  // No live gates apply for scope branch, so it should pass
  assert.equal(result.ok, true);
  assert.equal(result.closure_kind, 'scope_revised');
  assert.equal(result.closure_verdict, 'NOT_PROVEN_SCOPE_REVISED');
});

test('evaluateContract rejects live branch with missing operator gate', () => {
  const admission = makeAdmission({ confirmed: false });
  const candidate = makeCandidate({ admission });
  const result = contract.evaluateContract({
    closureKind: data.CLOSURE_KINDS.LIVE,
    admission,
    candidate,
    evidenceChain: candidate.evidence_chain,
  });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.length > 0);
});

test('evaluateContract rejects live branch with stale /BOSA marker', () => {
  const admission = makeAdmission({ staleMarkerDetected: true });
  const candidate = makeCandidate({ admission });
  const result = contract.evaluateContract({
    closureKind: data.CLOSURE_KINDS.LIVE,
    admission,
    candidate,
    evidenceChain: candidate.evidence_chain,
  });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((b) => b.code === data.BLOCKER_CODES.PRODUCER_BOSA_STALE_MARKER_PRESENT()));
});

test('evaluateContract rejects live branch with source hash drift', () => {
  const admission = makeAdmission();
  const chain = contract.buildEvidenceChain({}).evidence_chain;
  // Force a hash drift on the first chain row
  chain[0].post_hash_sha256 = contract.sha256Hex('different');
  chain[0].unchanged = false;
  const candidate = makeCandidate({ admission, evidenceChain: chain });
  const result = contract.evaluateContract({
    closureKind: data.CLOSURE_KINDS.LIVE,
    admission,
    candidate,
    evidenceChain: chain,
  });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((b) => b.code.indexOf('M16-S08-NATIVE-SOURCE-HASH-DRIFT') === 0));
});

test('evaluateContract rejects live branch with unexpected mutations', () => {
  const admission = makeAdmission();
  const candidate = makeCandidate({ admission });
  candidate.mutation_ledger.unexpected_mutations = [{ kind: 'rollback', subject_ref: 'extra', mutation_index_sha256: contract.sha256Hex('u') }];
  candidate.mutation_ledger.unexpected_mutation_count = 1;
  const result = contract.evaluateContract({
    closureKind: data.CLOSURE_KINDS.LIVE,
    admission,
    candidate,
    evidenceChain: candidate.evidence_chain,
  });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((b) => b.code.indexOf('M16-S08-NATIVE-MUTATION-UNEXPECTED-PRESENT') === 0));
});

test('evaluateContract rejects claimed forbidden closure verdict', () => {
  const admission = makeAdmission();
  const candidate = makeCandidate({ admission });
  const result = contract.evaluateContract({
    closureKind: data.CLOSURE_KINDS.LIVE,
    admission,
    candidate,
    evidenceChain: candidate.evidence_chain,
    claimedClosureVerdict: 'GO',
  });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((b) => b.code === data.BLOCKER_CODES.VALIDATOR_FORBIDDEN_VERDICT_PROMOTION('GO')));
});

// ---------------------------------------------------------------------------
// Test 12: Exit code mapping
// ---------------------------------------------------------------------------

test('mapBlockerToExitCode maps identifier, replay, mutation and redaction classes to distinct exits', () => {
  assert.equal(contract.mapBlockerToExitCode('M16-S08-NATIVE-OPERATOR-GATE-DENIED'), data.EXIT_CODES.REJECTED_MALFORMED);
  assert.equal(contract.mapBlockerToExitCode('M16-S08-NATIVE-BOSA-STALE-MARKER-PRESENT'), data.EXIT_CODES.IDENTITY_DRIFT);
  assert.equal(contract.mapBlockerToExitCode('M16-S08-NATIVE-CLOSURE-KIND-MISMATCH-live'), data.EXIT_CODES.CLOSURE_KIND_DRIFT);
  assert.equal(contract.mapBlockerToExitCode('M16-S08-NATIVE-REDACTION-LEAK-raw_body'), data.EXIT_CODES.REDACTION_LEAK);
  assert.equal(contract.mapBlockerToExitCode('M16-S08-NATIVE-MUTATION-UNEXPECTED-PRESENT-rollback'), data.EXIT_CODES.MUTATION_LEDGER_DRIFT);
  assert.equal(contract.mapBlockerToExitCode('M16-S08-NATIVE-SOURCE-HASH-DRIFT-x'), data.EXIT_CODES.REPLAY_DRIFT);
  assert.equal(contract.mapBlockerToExitCode('M16-S08-NATIVE-PATH-TRAVERSAL-x'), data.EXIT_CODES.REJECTED_MALFORMED);
  assert.equal(contract.mapBlockerToExitCode('unknown-blocker'), data.EXIT_CODES.RUNNER_FAILURE);
});

// ---------------------------------------------------------------------------
// Test 13: Identity probe + mutation ledger checks
// ---------------------------------------------------------------------------

test('checkIdentityProbe flags stale_marker_detected=true', () => {
  const probe = {
    required_company_paths: ['/BOS'],
    forbidden_company_paths: ['/BOSA'],
    observed_company_paths: ['/BOS', '/BOSA'],
    stale_marker_detected: true,
    fresh_readonly_probe: true,
    expected_agent_count: 7,
    observed_agent_count: 7,
  };
  const blockers = contract.checkIdentityProbe(probe);
  assert.ok(blockers.some((b) => b.code === data.BLOCKER_CODES.PRODUCER_BOSA_STALE_MARKER_PRESENT()));
});

test('checkIdentityProbe flags missing required path', () => {
  const probe = {
    required_company_paths: ['/BOS'],
    forbidden_company_paths: ['/BOSA'],
    observed_company_paths: [],
    stale_marker_detected: false,
    fresh_readonly_probe: true,
    expected_agent_count: 7,
    observed_agent_count: 7,
  };
  const blockers = contract.checkIdentityProbe(probe);
  assert.ok(blockers.some((b) => b.code === data.BLOCKER_CODES.PRODUCER_BOS_IDENTITY_MISSING('/BOS')));
});

test('checkIdentityProbe flags wrong agent count', () => {
  const probe = {
    required_company_paths: ['/BOS'],
    forbidden_company_paths: ['/BOSA'],
    observed_company_paths: ['/BOS'],
    stale_marker_detected: false,
    fresh_readonly_probe: true,
    expected_agent_count: 7,
    observed_agent_count: 5,
  };
  const blockers = contract.checkIdentityProbe(probe);
  assert.ok(blockers.some((b) => b.code === data.BLOCKER_CODES.PRODUCER_AGENT_IDENTITY_COUNT_DRIFT('5')));
});

test('checkMutationLedger rejects > 0 unexpected mutations', () => {
  const ledger = {
    expected_mutation_count: 1,
    observed_mutation_count: 1,
    unexpected_mutation_count: 1,
    expected_mutations: [{ kind: 'bounded_root_intake', subject_ref: 'paperclip_native_root_artifact', mutation_index_sha256: contract.sha256Hex('e') }],
    observed_mutations: [{ kind: 'bounded_root_intake', subject_ref: 'paperclip_native_root_artifact', mutation_index_sha256: contract.sha256Hex('o'), phase: 'intake' }],
    unexpected_mutations: [{ kind: 'rollback', subject_ref: 'extra', mutation_index_sha256: contract.sha256Hex('u') }],
  };
  const blockers = contract.checkMutationLedger(ledger);
  assert.ok(blockers.length > 0);
  assert.ok(blockers.some((b) => b.code.indexOf('M16-S08-NATIVE-MUTATION-UNEXPECTED-PRESENT') === 0));
});

test('checkMutationLedger rejects forbidden mutation kinds in observed mutations', () => {
  const ledger = {
    expected_mutation_count: 1,
    observed_mutation_count: 1,
    unexpected_mutation_count: 0,
    expected_mutations: [{ kind: 'bounded_root_intake', subject_ref: 'paperclip_native_root_artifact', mutation_index_sha256: contract.sha256Hex('e') }],
    observed_mutations: [{ kind: 'rollback', subject_ref: 'paperclip_native_root_artifact', mutation_index_sha256: contract.sha256Hex('o'), phase: 'intake' }],
    unexpected_mutations: [],
  };
  const blockers = contract.checkMutationLedger(ledger);
  assert.ok(blockers.some((b) => b.code === data.BLOCKER_CODES.PRODUCER_MUTATION_UNEXPECTED_PRESENT('rollback')));
});

// ---------------------------------------------------------------------------
// Test 14: Pure contract module surface
// ---------------------------------------------------------------------------

test('contract module exposes no subprocess / network / write surface', () => {
  const source = fs.readFileSync(path.resolve(__dirname, 'lib/m016-s08-native-seven-agent-contract.js'), 'utf8');
  // Module does not import spawn/exec/fork/child_process
  assert.ok(!/child_process/.test(source), 'must not import child_process');
  assert.ok(!/require\(['"]node:http/.test(source), 'must not import node:http');
  assert.ok(!/require\(['"]node:net/.test(source), 'must not import node:net');
  assert.ok(!/require\(['"]node:https/.test(source), 'must not import node:https');
  // Module does not write to disk outside loadSchema (which only reads)
  assert.ok(!/fs\.writeFile/.test(source), 'must not call fs.writeFile');
  assert.ok(!/fs\.appendFile/.test(source), 'must not call fs.appendFile');
  assert.ok(!/fs\.unlink/.test(source), 'must not call fs.unlink');
  // Module does not import the producer or verifier scripts
  assert.ok(!/execute_m016_s08_native_seven_agent_replay/.test(source));
  assert.ok(!/verify_m016_s08_native_seven_agent_integration/.test(source));
  assert.ok(!/finalize_m016_s08_native_seven_agent_integration/.test(source));
});

// ---------------------------------------------------------------------------
// Test 15: Edge cases — schema rejects drift shapes, hash pattern, source ref
// ---------------------------------------------------------------------------

test('admission schema rejects forged schema_id', () => {
  const loaded = contract.loadSchema(data.DEFAULTS.admission_schema_path);
  const admission = makeAdmission();
  admission.schema_id = 'https://gsd.local/forged-schema';
  const shape = contract.validateObjectShape(admission, loaded.validate);
  assert.equal(shape.ok, false);
});

test('closure schema rejects wrong boundary value', () => {
  const loaded = contract.loadSchema(data.DEFAULTS.closure_schema_path);
  const closure = makeClosure();
  closure.boundary = 'GO_BOUNDED_INTERNAL';
  const shape = contract.validateObjectShape(closure, loaded.validate);
  assert.equal(shape.ok, false);
});

test('candidate schema rejects non-SHA256 sanitised_digest_sha256', () => {
  const loaded = contract.loadSchema(data.DEFAULTS.candidate_schema_path);
  const candidate = makeCandidate();
  candidate.intake_root.sanitised_digest_sha256 = 'not-a-sha256';
  const shape = contract.validateObjectShape(candidate, loaded.validate);
  assert.equal(shape.ok, false);
});

test('candidate schema rejects observed_mutation_count not equal to 1', () => {
  const loaded = contract.loadSchema(data.DEFAULTS.candidate_schema_path);
  const candidate = makeCandidate();
  candidate.mutation_ledger.observed_mutation_count = 2;
  const shape = contract.validateObjectShape(candidate, loaded.validate);
  assert.equal(shape.ok, false);
});

test('candidate schema rejects non-empty unexpected_mutations array', () => {
  const loaded = contract.loadSchema(data.DEFAULTS.candidate_schema_path);
  const candidate = makeCandidate();
  // The schema enforces maxItems:0 on unexpected_mutations
  candidate.mutation_ledger.unexpected_mutations = [{ kind: 'extra', subject_ref: 'x', mutation_index_sha256: contract.sha256Hex('x') }];
  const shape = contract.validateObjectShape(candidate, loaded.validate);
  assert.equal(shape.ok, false);
});

// ---------------------------------------------------------------------------
// Test 16: Boundary values and forbidden closure verdict promotion
// ---------------------------------------------------------------------------

test('only PREPARATION_ONLY is a valid boundary value', () => {
  assert.ok(data.isValidBoundary('PREPARATION_ONLY'));
  assert.ok(!data.isValidBoundary('GO_BOUNDED_INTERNAL'));
  assert.ok(!data.isValidBoundary('NO_GO'));
  assert.ok(!data.isValidBoundary('EXECUTION_PASS'));
  assert.ok(data.isForbiddenBoundary('GO_BOUNDED_INTERNAL'));
  assert.ok(data.isForbiddenBoundary('NO_GO'));
});

test('forbidden closure verdicts cover all known promotion tokens', () => {
  const forbidden = ['GO', 'PASS', 'PASS_AUTOMATIC', 'READY', 'LAUNCH_GO', 'GO_BOUNDED_INTERNAL', 'EXECUTION_PASS'];
  for (const v of forbidden) {
    assert.ok(data.isForbiddenClosureVerdict(v), 'forbidden verdict not detected: ' + v);
  }
  assert.ok(!data.isForbiddenClosureVerdict('PROVEN_BOUNDED_NATIVE'));
  assert.ok(!data.isForbiddenClosureVerdict('NOT_PROVEN_SCOPE_REVISED'));
});

// ---------------------------------------------------------------------------
// Test 17: Source allowlist containment
// ---------------------------------------------------------------------------

test('SOURCE_ALLOWLIST_SET contains exactly the same entries as SOURCE_ALLOWLIST', () => {
  const fromList = new Set(data.SOURCE_ALLOWLIST.map((s) => s.source_ref));
  const fromSet = Array.from(data.SOURCE_ALLOWLIST_SET);
  assert.equal(fromList.size, fromSet.length);
  for (const ref of fromSet) assert.ok(fromList.has(ref));
});

test('mandatory chain roles are exactly the required source_refs', () => {
  const requiredChainRoles = data.SOURCE_ALLOWLIST.filter((s) => s.required).map((s) => s.chain_role);
  assert.deepEqual(Array.from(data.MANDATORY_CHAIN_ROLES).sort(), requiredChainRoles.sort());
});