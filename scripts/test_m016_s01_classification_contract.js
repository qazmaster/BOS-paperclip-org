#!/usr/bin/env node
'use strict';

/**
 * scripts/test_m016_s01_classification_contract.js
 *
 * M016-txa3vu / S01 / T02 — Test suite for the pure fail-closed
 * classification contract.
 *
 * Uses node:test. Covers:
 *   (a) Happy-path: well-formed claims produce expected verdicts
 *   (b) Fail-closed negative cases: malformed EXECUTED, missing provenance,
 *       reused independence group, score-without-worksheet, incomplete
 *       worksheet, unsafe/redaction-shaped input, launch GO attempts
 *   (c) Three-dimension verdict derivation: orchestration PASS, evidence
 *       PARTIAL, launch PREPARATION_ONLY
 *   (d) Sanitisation helpers: REDACTION_BOUNDS replacement + leak detection
 *   (e) Evidence builders: protocol/verification/validation JSON shapes
 *   (f) Determinism: same input → same output (run twice)
 *
 * All fixtures live in this file (no /tmp, no runtime-evidence pollution).
 *
 * Run with:
 *   node --test scripts/test_m016_s01_classification_contract.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const contract = require('./lib/m016-s01-classification-contract');
const data = require('./lib/m016-s01-classification-data');

const {
  BLOCKER_CODES,
  EXIT_CODES,
  HARD_GATE_IDS,
  HARD_GATE_LABELS,
  VERDICT_DIMENSIONS,
  VERDICT_VALUES,
  SEMANTIC_RULES,
  PROVENANCE_KINDS,
  IDENTITY_KIND,
  INDEPENDENCE_GROUPS,
  DEFAULTS,
  REDACTION_BOUNDS,
  classifyClaim,
  validateClaimShape,
  evaluateHardGates,
  deriveVerdicts,
  compileClassificationBlockers,
  evaluateClassificationContract,
  buildProtocolEvidence,
  buildVerificationEvidence,
  buildValidationEvidence,
  sanitizeString,
  checkRedactionSafety,
  assertWriteSafe,
} = contract;

// ---------------------------------------------------------------------------
// Fixture builders — small focused evidence-shape helpers.
// ---------------------------------------------------------------------------

function sha256hex(seed) {
  // Deterministic 64-char lowercase hex for fixture use only. NOT a real
  // cryptographic hash; produces stable artifact_hash values.
  const seedStr = String(seed);
  let out = '';
  let counter = 0;
  while (out.length < 64) {
    let h = 0;
    const s = seedStr + ':' + counter;
    for (let i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) >>> 0;
    }
    out += h.toString(16).padStart(8, '0');
    counter++;
  }
  return out.slice(0, 64);
}

function baseProvenance(overrides = {}) {
  return Object.assign({
    provenance_kind: 'native_run',
    identity: { agent_name: 'Div4.Production' },
    started_at: '2026-07-17T12:00:00Z',
    ended_at: '2026-07-17T12:01:30Z',
    exit_code: 0,
    sanitised_digest: 'sha-div4-build-doc-v1',
    artifact_reference: 'runtime-evidence/M015-native-seven-division-mission-20260717.json',
    artifact_hash: sha256hex('div4-build-doc'),
    scope: 'Div4.Production build artifact',
    limitations: 'Covers build-time artefact only.',
  }, overrides);
}

function baseWorksheet(overrides = {}) {
  return Object.assign({
    steps: [
      { step_id: 'w-div4-1', description: 'check artifact exists', verify_cmd: 'test -f artifact.json', observed_status: 'pass' },
      { step_id: 'w-div4-2', description: 'verify sha256', verify_cmd: 'sha256sum artifact.json', observed_status: 'pass' },
    ],
    completed_at: '2026-07-17T12:02:00Z',
    completed_by: 'classifier',
  }, overrides);
}

function baseObserved(overrides = {}) {
  return Object.assign({
    claim_id: 'div1-hco-orchestration',
    semantic_rule: 'OBSERVED',
    verdict_dimension: 'orchestration',
    independence_group: 'div1-hco-orchestration',
    scope: 'Div1.HCO observed the goal achievement',
    limitations: 'Observed only, no execution proof',
    source_ref: 'runtime-evidence/M015-native-seven-division-mission-20260717.json',
    gate_status: 'NOT_PROVEN',
  }, overrides);
}

function baseExecuted(overrides = {}) {
  return Object.assign({
    claim_id: 'div4-build-doc-executed',
    semantic_rule: 'EXECUTED',
    verdict_dimension: 'evidence',
    independence_group: 'div4-production-orchestration',
    scope: 'Div4.Production wrote the build document',
    limitations: 'Limited to Div4 build output',
    source_ref: 'runtime-evidence/M015-native-seven-division-mission-20260717.json',
    gate_status: 'PASS',
    executed_provenance: baseProvenance(),
    worksheet: baseWorksheet(),
    diagnostic: { summary: 'Div4 build artifact verified', redaction_applied: true },
  }, overrides);
}

// ---------------------------------------------------------------------------
// Tests — public API surface
// ---------------------------------------------------------------------------

test('contract: public API surface is stable', () => {
  const expected = [
    'loadSchema', 'classifyClaim', 'validateClaimShape',
    'evaluateHardGates', 'deriveVerdicts', 'compileClassificationBlockers',
    'evaluateClassificationContract',
    'buildProtocolEvidence', 'buildVerificationEvidence', 'buildValidationEvidence',
    'sanitizeString', 'checkRedactionSafety', 'assertWriteSafe',
  ];
  for (const name of expected) {
    assert.equal(typeof contract[name], 'function', `expected ${name} to be a function`);
  }
});

test('contract: re-exports frozen data module constants', () => {
  assert.equal(contract.VERDICT_DIMENSIONS.ORCHESTRATION, 'orchestration');
  assert.equal(contract.VERDICT_VALUES.PASS, 'PASS');
  assert.equal(contract.SEMANTIC_RULES.EXECUTED, 'EXECUTED');
  assert.equal(contract.PROVENANCE_KINDS.NATIVE_RUN, 'native_run');
  assert.equal(contract.EXIT_CODES.CLASSIFICATION_REJECTED_MALFORMED, 1);
  assert.equal(contract.EXIT_CODES.CLASSIFICATION_REJECTED_FAIL_CLOSED, 2);
  assert.equal(contract.BLOCKER_CODES.RUNNER_FAILURE, 'M16-S01-CLASSIFY-RUNNER-FAILURE');
  assert.ok(Array.isArray(contract.HARD_GATE_IDS));
  assert.equal(contract.HARD_GATE_IDS.length, 6);
});

// ---------------------------------------------------------------------------
// Tests — sanitisation helpers
// ---------------------------------------------------------------------------

test('sanitizeString: replaces UUID with redacted-id placeholder', () => {
  const uuid = '45cb883f-32b5-40cd-bf8d-94c40419a1d1';
  const out = sanitizeString(`live-id=${uuid}`);
  assert.equal(out.includes(uuid), false);
  assert.equal(out.includes(DEFAULTS.redacted_id_placeholder), true);
});

test('sanitizeString: replaces bearer token with redacted placeholder', () => {
  const out = sanitizeString('Authorization: bearer abc.def.ghi');
  assert.equal(out.includes('bearer'), false);
  assert.equal(out.includes(DEFAULTS.redacted_token_placeholder), true);
});

test('sanitizeString: replaces credential assignment', () => {
  const out = sanitizeString('PAPERCLIP_API_KEY=sk-test-abcdef');
  assert.equal(out.includes('PAPERCLIP_API_KEY='), false);
  assert.equal(out.includes(DEFAULTS.redacted_credential_placeholder), true);
});

test('sanitizeString: bounds length to max_chars_per_summary', () => {
  const big = 'a'.repeat(REDACTION_BOUNDS.max_chars_per_summary + 100);
  const out = sanitizeString(big);
  assert.ok(out.length <= REDACTION_BOUNDS.max_chars_per_summary);
});

test('sanitizeString: passes through safe strings unchanged', () => {
  const safe = 'safe string no markers';
  assert.equal(sanitizeString(safe), safe);
});

test('checkRedactionSafety: detects UUID leak in nested object', () => {
  const payload = {
    outer: { inner: { id: '45cb883f-32b5-40cd-bf8d-94c40419a1d1' } },
    array: ['safe', 'bearer x.y.z'],
  };
  const hits = checkRedactionSafety(payload);
  const kinds = hits.map((h) => h.kind);
  assert.ok(kinds.includes('uuid'), 'expected uuid leak');
  assert.ok(kinds.includes('bearer_token'), 'expected bearer_token leak');
});

test('checkRedactionSafety: skips known documentation keys', () => {
  const payload = {
    claim_id: 'div4-build-doc-executed', // kebab-case only — does not leak
    code: 'M16-S01-CLASSIFY-CLAIMS-INPUT-MISSING', // code value is documentation
    gate_labels: { hg1: 'no-op' },
    paths: { x: 'runtime-evidence/somewhere.json' },
    $schema: 'https://gsd.local/schemas/runtime-evidence/m016-s01-evidence-claim.v1.json',
  };
  // None of those values contain real UUID / bearer / credential markers.
  // The test asserts that walking those keys does not produce false-positive hits.
  const hits = checkRedactionSafety(payload);
  assert.equal(hits.length, 0, 'expected no hits for documentation-only fields, got ' + JSON.stringify(hits));
});

test('assertWriteSafe: throws when payload leaks UUID', () => {
  const payload = { ok: true, id: '45cb883f-32b5-40cd-bf8d-94c40419a1d1' };
  assert.throws(() => assertWriteSafe(payload), /redaction leak/);
});

test('assertWriteSafe: returns silently for safe payload', () => {
  const payload = { ok: true, summary: 'all safe' };
  assert.doesNotThrow(() => assertWriteSafe(payload));
});

// ---------------------------------------------------------------------------
// Tests — per-claim shape validation
// ---------------------------------------------------------------------------

test('validateClaimShape: rejects non-object claim', () => {
  const res = validateClaimShape(null);
  assert.equal(res.ok, false);
  assert.match(res.code, /CLAIM-NOT-OBJECT/);
});

test('validateClaimShape: rejects claim missing required keys', () => {
  const res = validateClaimShape({ claim_id: 'x-1' });
  assert.equal(res.ok, false);
});

test('validateClaimShape: rejects malformed claim_id', () => {
  const claim = baseObserved({ claim_id: 'BAD ID!' });
  const res = validateClaimShape(claim);
  assert.equal(res.ok, false);
  assert.match(res.reason, /claim_id.*malformed/);
});

test('validateClaimShape: rejects unknown semantic_rule', () => {
  const claim = baseObserved({ semantic_rule: 'BOGUS' });
  const res = validateClaimShape(claim);
  assert.equal(res.ok, false);
  assert.match(res.code, /SEMANTIC-RULE-INVALID/);
});

test('validateClaimShape: rejects unknown verdict_dimension', () => {
  const claim = baseObserved({ verdict_dimension: 'sideways' });
  const res = validateClaimShape(claim);
  assert.equal(res.ok, false);
  assert.match(res.code, /DIMENSION-INVALID/);
});

test('validateClaimShape: rejects EXECUTED without executed_provenance', () => {
  const claim = baseExecuted();
  delete claim.executed_provenance;
  const res = validateClaimShape(claim);
  assert.equal(res.ok, false);
  assert.match(res.code, /EXECUTED-MISSING-PROVENANCE/);
});

test('validateClaimShape: rejects non-EXECUTED with executed_provenance', () => {
  const claim = baseObserved({ semantic_rule: 'OBSERVED', executed_provenance: baseProvenance() });
  const res = validateClaimShape(claim);
  assert.equal(res.ok, false);
  assert.match(res.code, /NON-EXECUTED-WITH-PROVENANCE/);
});

test('validateClaimShape: rejects source_ref out of bounds', () => {
  const claim = baseObserved({ source_ref: '/etc/passwd' });
  const res = validateClaimShape(claim);
  assert.equal(res.ok, false);
  assert.match(res.code, /SOURCE-REF-PATH-OUT-OF-BOUND/);
});

test('validateClaimShape: rejects additional top-level property', () => {
  const claim = baseObserved({ evil_field: 'injected' });
  const res = validateClaimShape(claim);
  assert.equal(res.ok, false);
  assert.match(res.code, /CLAIM-ADDITIONAL-PROPS/);
});

test('validateClaimShape: rejects EXECUTED with malformed provenance_kind', () => {
  const claim = baseExecuted();
  claim.executed_provenance.provenance_kind = 'bogus_kind';
  const res = validateClaimShape(claim);
  assert.equal(res.ok, false);
  assert.match(res.code, /EXECUTED-PROVENANCE-MALFORMED/);
});

test('validateClaimShape: rejects EXECUTED identity mixing agent_name and runner_id', () => {
  const claim = baseExecuted();
  claim.executed_provenance.identity = { agent_name: 'Div4.Production', runner_id: 'runner-7' };
  const res = validateClaimShape(claim);
  assert.equal(res.ok, false);
  assert.match(res.reason, /must declare either/);
});

test('validateClaimShape: rejects EXECUTED with malformed artifact_hash', () => {
  const claim = baseExecuted();
  claim.executed_provenance.artifact_hash = 'ZZZ_NOT_HEX';
  const res = validateClaimShape(claim);
  assert.equal(res.ok, false);
  assert.match(res.reason, /lowercase hex/);
});

test('validateClaimShape: rejects launch EXECUTED without artifact_hash', () => {
  const claim = baseExecuted({
    claim_id: 'launch-build-executed',
    semantic_rule: 'EXECUTED',
    verdict_dimension: 'launch',
    independence_group: 'launch-readiness',
  });
  delete claim.executed_provenance.artifact_hash;
  const res = validateClaimShape(claim);
  assert.equal(res.ok, false);
});

test('validateClaimShape: rejects worksheet with empty steps', () => {
  const claim = baseExecuted({ worksheet: { steps: [], completed_at: '2026-07-17T12:00:00Z', completed_by: 'classifier' } });
  const res = validateClaimShape(claim);
  assert.equal(res.ok, false);
  assert.match(res.code, /WORKSHEET-INCOMPLETE/);
});

test('validateClaimShape: rejects worksheet with non-canonical completed_by', () => {
  const claim = baseExecuted({
    worksheet: {
      steps: [{ step_id: 'w-1', description: 'check', verify_cmd: 'true', observed_status: 'pass' }],
      completed_at: '2026-07-17T12:00:00Z',
      completed_by: 'UnknownActor',
    },
  });
  const res = validateClaimShape(claim);
  assert.equal(res.ok, false);
});

test('validateClaimShape: rejects diagnostic with bad summary charset', () => {
  const claim = baseExecuted({ diagnostic: { summary: '!!!secret=bearer=x.y.z!!!', redaction_applied: false } });
  const res = validateClaimShape(claim);
  assert.equal(res.ok, false);
});

// ---------------------------------------------------------------------------
// Tests — classifyClaim (per-claim classifier)
// ---------------------------------------------------------------------------

test('classifyClaim: well-formed OBSERVED orchestration → max_verdict PARTIAL', () => {
  const claim = baseObserved();
  const c = classifyClaim(claim);
  assert.equal(c.status, 'pass');
  assert.equal(c.max_verdict, VERDICT_VALUES.PARTIAL);
  assert.equal(c.semantic_rule, 'OBSERVED');
});

test('classifyClaim: OBSERVED on evidence dimension → max_verdict NOT_PROVEN', () => {
  const claim = baseObserved({ verdict_dimension: 'evidence', claim_id: 'div1-observed-evidence', independence_group: 'div1-hco-orchestration' });
  const c = classifyClaim(claim);
  assert.equal(c.max_verdict, VERDICT_VALUES.NOT_PROVEN);
});

test('classifyClaim: well-formed EXECUTED native_run evidence → max_verdict PASS', () => {
  const claim = baseExecuted();
  const c = classifyClaim(claim);
  assert.equal(c.status, 'pass');
  assert.equal(c.max_verdict, VERDICT_VALUES.PASS);
  assert.equal(c.artifact_hash, claim.executed_provenance.artifact_hash);
});

test('classifyClaim: EXECUTED agent_log → max_verdict PARTIAL', () => {
  const claim = baseExecuted();
  claim.executed_provenance.provenance_kind = 'agent_log';
  const c = classifyClaim(claim);
  assert.equal(c.max_verdict, VERDICT_VALUES.PARTIAL);
});

test('classifyClaim: EXECUTED replay → max_verdict NOT_PROVEN', () => {
  const claim = baseExecuted();
  claim.executed_provenance.provenance_kind = 'replay';
  const c = classifyClaim(claim);
  assert.equal(c.max_verdict, VERDICT_VALUES.NOT_PROVEN);
});

test('classifyClaim: EXECUTED PASS without worksheet → fail-closed', () => {
  const claim = baseExecuted();
  delete claim.worksheet;
  const c = classifyClaim(claim);
  assert.equal(c.max_verdict, VERDICT_VALUES.NOT_PROVEN);
  assert.ok(c.blockers.some((b) => b.code.includes('SCORE-WITHOUT-WORKSHEET')));
});

test('classifyClaim: launch EXECUTED without native_readback → PREPARATION_ONLY', () => {
  const claim = baseExecuted({
    claim_id: 'launch-evidence-executed',
    semantic_rule: 'EXECUTED',
    verdict_dimension: 'launch',
    independence_group: 'launch-readiness',
  });
  const c = classifyClaim(claim);
  // Launch caps at PREPARATION_ONLY when no native_readback_hash pattern.
  assert.equal(c.max_verdict, VERDICT_VALUES.PREPARATION_ONLY);
});

test('classifyClaim: detects UUID leak in sanitised_digest → fail-closed', () => {
  const claim = baseExecuted();
  claim.executed_provenance.sanitised_digest = 'safe-prefix 45cb883f-32b5-40cd-bf8d-94c40419a1d1 suffix';
  const c = classifyClaim(claim);
  assert.equal(c.redaction_safe, false);
  assert.ok(c.blockers.some((b) => b.code.includes('UUID-LEAK')));
});

test('classifyClaim: detects bearer token leak in sanitised_digest → fail-closed', () => {
  const claim = baseExecuted();
  claim.executed_provenance.sanitised_digest = 'bearer verysecretvalue';
  const c = classifyClaim(claim);
  assert.equal(c.redaction_safe, false);
  assert.ok(c.blockers.some((b) => b.code.includes('BEARER-LEAK')));
});

test('classifyClaim: detects xiaomi marker leak → fail-closed', () => {
  const claim = baseExecuted();
  claim.executed_provenance.sanitised_digest = 'observed xiaomi endpoint reuse';
  const c = classifyClaim(claim);
  assert.equal(c.redaction_safe, false);
  assert.ok(c.blockers.some((b) => b.code.includes('XIAOMI-LEAK')));
});

test('classifyClaim: rejects malformed EXECUTED (exit_code out of range)', () => {
  const claim = baseExecuted();
  claim.executed_provenance.exit_code = 999;
  const c = classifyClaim(claim);
  assert.equal(c.status, 'rejected');
});

test('classifyClaim: rejected claim records fail-closed code', () => {
  const claim = baseExecuted();
  delete claim.executed_provenance;
  const c = classifyClaim(claim);
  assert.equal(c.status, 'rejected');
  assert.ok(c.blockers.some((b) => b.code.includes('EXECUTED-MISSING-PROVENANCE')));
});

// ---------------------------------------------------------------------------
// Tests — hard gate evaluation
// ---------------------------------------------------------------------------

test('evaluateHardGates: well-formed mixed claims → all gates pass', () => {
  const claims = [
    baseObserved({ independence_group: 'div1-hco-orchestration' }),
    baseExecuted({ independence_group: 'div4-production-orchestration' }),
    baseExecuted({
      claim_id: 'div5-review-executed',
      independence_group: 'div5-qualifications-orchestration',
      executed_provenance: baseProvenance({ identity: { agent_name: 'Div5.QualificationsLibraryLearning' }, artifact_hash: sha256hex('div5-review') }),
    }),
  ];
  const classifications = claims.map(classifyClaim);
  const result = evaluateHardGates(classifications);
  // Iterate over the actual gate keys produced by evaluateHardGates
  // (underscored: HG1_SEMANTIC_RULE_COMPLIANCE etc.), not the spaced
  // strings from data.HARD_GATE_IDS.
  for (const gid of Object.keys(result.gates)) {
    assert.equal(result.gates[gid] === 'pass' || result.gates[gid] === 'not_proven', true, `gate ${gid} should be pass or not_proven (got ${result.gates[gid]})`);
  }
  assert.equal(result.gates.HG1_SEMANTIC_RULE_COMPLIANCE, 'pass');
  assert.equal(result.gates.HG2_PROVENANCE_INTEGRITY, 'pass');
  assert.equal(result.gates.HG4_ARTIFACT_BINDING, 'pass');
  assert.equal(result.gates.HG5_WORKSHEET_INTEGRITY, 'pass');
  assert.equal(result.gates.HG6_VERDICT_DERIVATION_BOUNDED, 'pass');
});

test('evaluateHardGates: reused independence_group with conflicting artifact_hash → HG3 fail_closed', () => {
  const claims = [
    baseExecuted({ claim_id: 'a-1', independence_group: 'div4-production-orchestration' }),
    baseExecuted({ claim_id: 'a-2', independence_group: 'div4-production-orchestration' }),
  ];
  // Override second claim's artifact_hash to a different value
  claims[1].executed_provenance.artifact_hash = sha256hex('different');
  const classifications = claims.map(classifyClaim);
  const result = evaluateHardGates(classifications);
  assert.equal(result.gates.HG3_INDEPENDENCE_GROUP_ISOLATION, 'fail_closed');
  assert.ok(result.diagnostics.hg3_independence_group_isolation.reused_groups.includes('div4-production-orchestration'));
});

test('evaluateHardGates: reused independence_group with shared artifact_hash → HG3 pass', () => {
  const sharedHash = sha256hex('shared');
  const claims = [
    baseExecuted({ claim_id: 'a-1', independence_group: 'div4-production-orchestration' }),
    baseExecuted({ claim_id: 'a-2', independence_group: 'div4-production-orchestration' }),
  ];
  claims[0].executed_provenance.artifact_hash = sharedHash;
  claims[1].executed_provenance.artifact_hash = sharedHash;
  const classifications = claims.map(classifyClaim);
  const result = evaluateHardGates(classifications);
  assert.notEqual(result.gates.HG3_INDEPENDENCE_GROUP_ISOLATION, 'fail_closed');
});

test('evaluateHardGates: EXECUTED without artifact_hash → HG4 fail_closed', () => {
  const claims = [baseExecuted()];
  delete claims[0].executed_provenance.artifact_hash;
  const classifications = claims.map(classifyClaim);
  const result = evaluateHardGates(classifications);
  // Schema-level rejection happens first; classified as rejected → HG4 fail_closed
  assert.equal(result.gates.HG4_ARTIFACT_BINDING, 'fail_closed');
});

test('evaluateHardGates: empty classifications → defaults', () => {
  const result = evaluateHardGates([]);
  assert.equal(result.gates.HG1_SEMANTIC_RULE_COMPLIANCE, 'pass');
  assert.equal(result.diagnostics.hg1_semantic_rule_compliance.total_claims, 0);
});

// ---------------------------------------------------------------------------
// Tests — verdict derivation
// ---------------------------------------------------------------------------

test('deriveVerdicts: well-formed independent claims → orchestration PASS, evidence PASS, launch PREPARATION_ONLY', () => {
  // 5 EXECUTED native_run claims: 2 orchestration, 2 evidence, 1 launch,
  // each with unique independence_groups and complete worksheets.
  // With unique groups, HG3 = pass → evidence can promote to PASS.
  // Launch is capped at PREPARATION_ONLY because the launch claim lacks an
  // independent native_readback artifact (the historical evidence rule).
  const claims = [
    baseExecuted({ claim_id: 'div1-hco-build', independence_group: 'div1-hco-orchestration', verdict_dimension: 'orchestration', executed_provenance: baseProvenance({ identity: { agent_name: 'Div1.HCO' }, artifact_hash: sha256hex('div1') }) }),
    baseExecuted({ claim_id: 'div4-build-doc', independence_group: 'div4-production-orchestration', verdict_dimension: 'evidence', executed_provenance: baseProvenance({ identity: { agent_name: 'Div4.Production' }, artifact_hash: sha256hex('div4') }) }),
    baseExecuted({ claim_id: 'div5-review', independence_group: 'div5-qualifications-orchestration', verdict_dimension: 'evidence', executed_provenance: baseProvenance({ identity: { agent_name: 'Div5.QualificationsLibraryLearning' }, artifact_hash: sha256hex('div5') }) }),
    baseExecuted({ claim_id: 'div7-final', independence_group: 'div7-mission-control-orchestration', verdict_dimension: 'orchestration', executed_provenance: baseProvenance({ identity: { agent_name: 'Div7.MissionControl' }, artifact_hash: sha256hex('div7') }) }),
    baseExecuted({ claim_id: 'launch-build', verdict_dimension: 'launch', independence_group: 'launch-readiness', executed_provenance: baseProvenance({ identity: { agent_name: 'Div7.MissionControl' }, artifact_hash: sha256hex('launch') }) }),
  ];
  const classifications = claims.map(classifyClaim);
  const hgResult = evaluateHardGates(classifications);
  const result = deriveVerdicts(hgResult.gates, classifications);
  assert.equal(result.verdicts.orchestration, 'PASS');
  assert.equal(result.verdicts.evidence, 'PASS');
  assert.equal(result.verdicts.launch, 'PREPARATION_ONLY');
});

test('deriveVerdicts: launch dimension never produces GO', () => {
  const claim = baseExecuted({
    claim_id: 'launch-attempt',
    verdict_dimension: 'launch',
    independence_group: 'launch-readiness',
    executed_provenance: baseProvenance({ identity: { agent_name: 'Div7.MissionControl' }, artifact_hash: sha256hex('launch-strong') }),
  });
  const c = classifyClaim(claim);
  assert.notEqual(c.max_verdict, 'GO');
  assert.notEqual(c.max_verdict, 'PASS_AUTOMATIC');
});

test('deriveVerdicts: insufficient native_run evidence → evidence NOT_PROVEN', () => {
  const claim = baseObserved({
    claim_id: 'observed-evidence-only',
    verdict_dimension: 'evidence',
    independence_group: 'div1-hco-orchestration',
  });
  const classifications = [classifyClaim(claim)];
  const gates = evaluateHardGates(classifications).gates;
  const result = deriveVerdicts(gates, classifications);
  assert.equal(result.verdicts.evidence, 'NOT_PROVEN');
});

// ---------------------------------------------------------------------------
// Tests — top-level orchestrator
// ---------------------------------------------------------------------------

test('evaluateClassificationContract: null claims → fail-closed CLAIMS_INPUT_MISSING', () => {
  const result = evaluateClassificationContract({ claims: null });
  assert.equal(result.runner_status, 'FAIL');
  assert.equal(result.runner_exit_code, EXIT_CODES.CLASSIFICATION_REJECTED_FAIL_CLOSED);
  assert.ok(result.blockers.some((b) => b.code === BLOCKER_CODES.CLAIMS_INPUT_MISSING));
});

test('evaluateClassificationContract: non-array claims → fail-closed CLAIMS_INPUT_NOT_ARRAY', () => {
  const result = evaluateClassificationContract({ claims: 'not-an-array' });
  assert.equal(result.runner_status, 'FAIL');
  assert.equal(result.runner_exit_code, EXIT_CODES.CLASSIFICATION_REJECTED_MALFORMED);
  assert.ok(result.blockers.some((b) => b.code === BLOCKER_CODES.CLAIMS_INPUT_NOT_ARRAY));
});

test('evaluateClassificationContract: empty claims → fail-closed CLAIMS_EMPTY', () => {
  const result = evaluateClassificationContract({ claims: [] });
  assert.equal(result.runner_status, 'FAIL');
  assert.ok(result.blockers.some((b) => b.code === BLOCKER_CODES.CLAIMS_EMPTY));
});

test('evaluateClassificationContract: well-formed independent claims → PASS verdict across all dimensions', () => {
  // Claims with unique independence_groups (truly independent) and complete
  // worksheets correctly resolve to PASS verdicts. This is the happy-path
  // contract: the classifier does NOT pretend M015-style shared provenance
  // is independent, but it DOES reward claims that bring genuine isolation.
  const claims = [
    baseObserved({ independence_group: 'div1-hco-orchestration' }),
    baseExecuted({ independence_group: 'div4-production-orchestration', verdict_dimension: 'evidence' }),
    baseExecuted({ claim_id: 'div5-review-executed', independence_group: 'div5-qualifications-orchestration', verdict_dimension: 'evidence', executed_provenance: baseProvenance({ identity: { agent_name: 'Div5.QualificationsLibraryLearning' }, artifact_hash: sha256hex('div5') }) }),
    baseExecuted({ claim_id: 'div7-final', independence_group: 'div7-mission-control-orchestration', verdict_dimension: 'orchestration', executed_provenance: baseProvenance({ identity: { agent_name: 'Div7.MissionControl' }, artifact_hash: sha256hex('div7') }) }),
    baseExecuted({ claim_id: 'launch-build-claim', verdict_dimension: 'launch', independence_group: 'launch-readiness', executed_provenance: baseProvenance({ identity: { agent_name: 'Div7.MissionControl' }, artifact_hash: sha256hex('launch') }) }),
  ];
  const result = evaluateClassificationContract({ claims });
  assert.equal(result.runner_status, 'PASS');
  assert.equal(result.runner_exit_code, EXIT_CODES.CLASSIFICATION_PASS);
  assert.equal(result.verdicts.orchestration, 'PASS');
  assert.equal(result.verdicts.evidence, 'PASS');
  assert.equal(result.verdicts.launch, 'PREPARATION_ONLY');
});

test('evaluateClassificationContract: M015 fixture pattern (shared independence_group) → evidence PARTIAL', () => {
  // Reproduces the actual M015 fixture structure: all 7 division runs share
  // a single independence_group with the same artifact_hash (one native
  // mission execution). HG3 = not_proven (shared group), so evidence
  // dimension is capped at PARTIAL even though every claim is well-formed.
  const sharedHash = sha256hex('shared-m015-mission');
  const sharedGroup = 'mission-topology';
  const claims = [
    baseObserved({ independence_group: sharedGroup }),
    baseExecuted({ claim_id: 'div4-evidence-shared', independence_group: sharedGroup, verdict_dimension: 'evidence', executed_provenance: baseProvenance({ artifact_hash: sharedHash }) }),
    baseExecuted({ claim_id: 'div5-evidence-shared', independence_group: sharedGroup, verdict_dimension: 'evidence', executed_provenance: baseProvenance({ identity: { agent_name: 'Div5.QualificationsLibraryLearning' }, artifact_hash: sharedHash }) }),
    baseExecuted({ claim_id: 'div7-orchestration-shared', independence_group: sharedGroup, verdict_dimension: 'orchestration', executed_provenance: baseProvenance({ identity: { agent_name: 'Div7.MissionControl' }, artifact_hash: sharedHash }) }),
    baseExecuted({ claim_id: 'launch-evidence-shared', verdict_dimension: 'launch', independence_group: sharedGroup, executed_provenance: baseProvenance({ identity: { agent_name: 'Div7.MissionControl' }, artifact_hash: sharedHash }) }),
  ];
  const result = evaluateClassificationContract({ claims });
  // Runner stays PASS (no fail-closed violations), but HG3 = not_proven
  // because the independence_group is shared. Evidence dimension is PARTIAL.
  assert.equal(result.runner_status, 'PASS');
  assert.equal(result.verdicts.launch, 'PREPARATION_ONLY');
  // Orchestration + evidence depend on HG3 state. With shared group +
  // consistent hash, the contract classifies as PARTIAL (not_proven HG3).
  assert.notEqual(result.verdicts.evidence, 'PASS', 'shared independence_group must not promote evidence to PASS');
});

test('evaluateClassificationContract: malformed EXECUTED → REJECTED_MALFORMED runner status', () => {
  const claims = [baseExecuted()];
  delete claims[0].executed_provenance;
  const result = evaluateClassificationContract({ claims });
  assert.equal(result.runner_exit_code, EXIT_CODES.CLASSIFICATION_REJECTED_MALFORMED);
});

test('evaluateClassificationContract: reused independence group with conflicting hashes → REJECTED_FAIL_CLOSED', () => {
  const claims = [
    baseExecuted({ claim_id: 'a-1', independence_group: 'div4-production-orchestration' }),
    baseExecuted({ claim_id: 'a-2', independence_group: 'div4-production-orchestration' }),
  ];
  claims[1].executed_provenance.artifact_hash = sha256hex('different');
  const result = evaluateClassificationContract({ claims });
  assert.equal(result.runner_exit_code, EXIT_CODES.CLASSIFICATION_REJECTED_FAIL_CLOSED);
});

// ---------------------------------------------------------------------------
// Tests — evidence builders
// ---------------------------------------------------------------------------

test('buildProtocolEvidence: produces canonical protocol shape', () => {
  const claims = [baseObserved(), baseExecuted()];
  const classifications = claims.map(classifyClaim);
  const gates = evaluateHardGates(classifications).gates;
  const verdictResult = deriveVerdicts(gates, classifications);
  const blockers = compileClassificationBlockers(gates, classifications, verdictResult.verdicts);
  const proto = buildProtocolEvidence({
    classifications, gates, verdicts: verdictResult.verdicts, blockers,
    paths: { input: 'runtime-evidence/test.json' },
  });
  assert.equal(proto.$schema, 'gsd/m016-s01-classification-protocol-v1');
  assert.equal(proto.milestone, 'M016-txa3vu');
  assert.equal(proto.slice, 'S01');
  assert.equal(proto.task, 'T02');
  assert.ok(Array.isArray(proto.hard_gate_ids));
  assert.equal(proto.hard_gate_ids.length, 6);
  assert.ok(typeof proto.gates === 'object');
  assert.ok(typeof proto.verdicts === 'object');
  assert.equal(proto.classification_count, 2);
});

test('buildVerificationEvidence: includes per-claim classification array', () => {
  const claims = [baseObserved(), baseExecuted()];
  const classifications = claims.map(classifyClaim);
  const gates = evaluateHardGates(classifications).gates;
  const verdictResult = deriveVerdicts(gates, classifications);
  const blockers = compileClassificationBlockers(gates, classifications, verdictResult.verdicts);
  const ver = buildVerificationEvidence({
    classifications, gates, verdicts: verdictResult.verdicts, blockers,
    gateDiagnostics: {},
  });
  assert.equal(ver.$schema, 'gsd/m016-s01-classification-verification-v1');
  assert.ok(Array.isArray(ver.per_claim_classification));
  assert.equal(ver.per_claim_classification.length, 2);
  assert.equal(ver.per_claim_classification[0].semantic_rule, 'OBSERVED');
  assert.equal(ver.per_claim_classification[1].semantic_rule, 'EXECUTED');
});

test('buildValidationEvidence: includes per-dimension summary and regression slot', () => {
  const claims = [baseObserved(), baseExecuted()];
  const classifications = claims.map(classifyClaim);
  const gates = evaluateHardGates(classifications).gates;
  const verdictResult = deriveVerdicts(gates, classifications);
  const blockers = compileClassificationBlockers(gates, classifications, verdictResult.verdicts);
  const val = buildValidationEvidence({
    classifications, gates, verdicts: verdictResult.verdicts, blockers,
    gateDiagnostics: {},
    regressionFixture: { orchestration: 'PASS', evidence: 'PARTIAL', launch: 'PREPARATION_ONLY' },
  });
  assert.equal(val.$schema, 'gsd/m016-s01-classification-validation-v1');
  assert.ok(val.per_dimension_summary.orchestration);
  assert.ok(val.per_dimension_summary.evidence);
  assert.ok(val.per_dimension_summary.launch);
  assert.ok(val.regression);
  assert.equal(val.regression.orchestration, 'PASS');
});

// ---------------------------------------------------------------------------
// Tests — determinism
// ---------------------------------------------------------------------------

test('determinism: same input → identical output (run twice)', () => {
  const claims = [
    baseObserved({ independence_group: 'div1-hco-orchestration' }),
    baseExecuted({ independence_group: 'div4-production-orchestration', verdict_dimension: 'evidence' }),
  ];
  const r1 = evaluateClassificationContract({ claims });
  const r2 = evaluateClassificationContract({ claims });
  // Strip generated timestamp from comparison
  delete r1.generated;
  delete r2.generated;
  assert.deepEqual(r1, r2);
});

test('determinism: per-claim classification is deterministic', () => {
  const claim = baseExecuted();
  const r1 = classifyClaim(claim);
  const r2 = classifyClaim(claim);
  assert.deepEqual(r1, r2);
});

// ---------------------------------------------------------------------------
// Tests — blocker compiler
// ---------------------------------------------------------------------------

test('compileClassificationBlockers: aggregates per-claim and per-gate blockers', () => {
  const claims = [
    baseExecuted({ claim_id: 'a-1', independence_group: 'div4-production-orchestration' }),
    baseExecuted({ claim_id: 'a-2', independence_group: 'div4-production-orchestration' }),
  ];
  claims[1].executed_provenance.artifact_hash = sha256hex('different');
  const classifications = claims.map(classifyClaim);
  const gates = evaluateHardGates(classifications).gates;
  const verdictResult = deriveVerdicts(gates, classifications);
  const blockers = compileClassificationBlockers(gates, classifications, verdictResult.verdicts);
  assert.ok(blockers.length > 0);
  // Should include at least one HG3 fail_closed blocker
  assert.ok(blockers.some((b) => b.code.includes('HG3')));
});

// ---------------------------------------------------------------------------
// Tests — AJV schema loading (when AJV is available)
// ---------------------------------------------------------------------------

test('loadSchema: loads JSON Schema draft-07 and compiles AJV validator when available', () => {
  const result = contract.loadSchema('schemas/runtime-evidence/m016-s01-evidence-claim.v1.json');
  assert.equal(result.schema.$schema, 'http://json-schema.org/draft-07/schema#');
  assert.ok(result.path);
  // AJV may or may not be available; either way loadSchema must succeed.
  if (result.validate) {
    const ok = result.validate(baseExecuted());
    assert.equal(ok, true, 'expected well-formed EXECUTED claim to validate against schema');
  }
});
