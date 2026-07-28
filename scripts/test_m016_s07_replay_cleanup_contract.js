#!/usr/bin/env node
'use strict';

/**
 * scripts/test_m016_s07_replay_cleanup_contract.js
 *
 * M016-txa3vu / S07 / T01 — schema, data registry, and pure contract tests
 * for the policy-compliant replay cleanup proof.
 *
 * The fixture uses inline source hashes (synthesised sha256-shaped
 * strings) so the tests run in CI / fresh checkouts without depending on
 * the canonical S01 sidecars. Tests cover:
 *
 *   - Data registry shape (frozen enums, blocker namespace, TRIAD_INVARIANT)
 *   - Schema compile + strict object roots
 *   - BLOCKER_CODES factory namespace + stable exit-code mapping
 *   - TRIAD_INVARIANT helpers (accept matching triple, reject drift)
 *   - Marker ownership: missing | forged | valid
 *   - Path containment: traversal, outside-prefix, root-prefix-empty
 *   - Single subprocess enforcement: 0 | 1 | >1
 *   - Cleanup trace validation: empty, too many, bad phase/action/outcome
 *   - Redaction safety surfaces leak hits and refuses write
 *   - Sidecar builders: byte-stable round-trip with proof + negative-fixtures
 *   - Schema rejects unknown properties and verdict triple drift
 *   - Pure contract module has no subprocess / network / write surface
 *
 * Run with: node --test scripts/test_m016_s07_replay_cleanup_contract.js
 */

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const data = require('./lib/m016-s07-replay-cleanup-data');
const contract = require('./lib/m016-s07-replay-cleanup-contract');

const ROOT = path.resolve(__dirname, '..');

const SCHEMA_REFS = [data.DEFAULTS.schema_path];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeSourceHashes() {
  const hashes = {};
  for (const entry of data.SOURCE_ALLOWLIST) {
    hashes[entry.source_ref] = contract.sha256Hex('s07-schema-test-fixture:' + entry.source_ref);
  }
  return hashes;
}

function makeCleanupMarker() {
  return {
    relpath: data.SCRATCH_ROOT_MARKER_RELPATH,
    contents: data.MARKER_CONTENTS,
    sha256: contract.sha256Hex(data.MARKER_CONTENTS),
  };
}

function makeMinimalCleanupTrace() {
  return [
    contract.buildCleanupTraceRow({
      phase: data.CLEANUP_PHASES.PRE_RUN,
      action: data.CLEANUP_ACTIONS.MARKER_VALIDATED,
      target_relpath: data.SCRATCH_ROOT_MARKER_RELPATH,
      outcome: data.CLEANUP_OUTCOMES.SUCCESS,
      reason: 'marker contents match frozen value',
    }),
    contract.buildCleanupTraceRow({
      phase: data.CLEANUP_PHASES.REPLAY,
      action: data.CLEANUP_ACTIONS.SUBPROCESS_INVOKED,
      target_relpath: data.DEFAULTS.s01_classifier_cli,
      outcome: data.CLEANUP_OUTCOMES.SUCCESS,
      reason: 'exactly one replay subprocess invocation',
    }),
    contract.buildCleanupTraceRow({
      phase: data.CLEANUP_PHASES.POST_RUN,
      action: data.CLEANUP_ACTIONS.POST_RUN_ABSENT,
      target_relpath: data.SCRATCH_ROOT_RELPATH,
      outcome: data.CLEANUP_OUTCOMES.SUCCESS,
      reason: 'scratch root absent after cleanup',
    }),
  ];
}

function makeBaseInput(overrides) {
  return Object.assign({
    generated: data.CLEANUP_REFERENCE_TIME,
    referenceTime: data.CLEANUP_REFERENCE_TIME,
    sourceHashes: makeSourceHashes(),
    inputs: {},
    cleanupMarker: makeCleanupMarker(),
    scratchRootRelpath: data.SCRATCH_ROOT_RELPATH,
    replaySubprocessInvocations: 1,
    cleanupTrace: makeMinimalCleanupTrace(),
    verdictTriple: clone(data.TRIAD_INVARIANT),
    preRunAbsenceCheck: {
      relpath: data.SCRATCH_ROOT_RELPATH,
      present_before: false,
      present_after: false,
    },
    postRunAbsenceCheck: {
      relpath: data.SCRATCH_ROOT_RELPATH,
      present_before: true,
      present_after: false,
    },
    atomicTempCleanupCheck: {
      relpath: data.SCRATCH_ROOT_RELPATH + '/.tmp-fallback',
      removed: true,
    },
    canonicalSidecarOverwriteRefusal: { attempted: false, refused: true },
    canonicalOutputOverwriteRefusal: { attempted: false, refused: true },
    semanticDigest: contract.sha256Hex('m016-s07-semantic-digest-fixture'),
    reproducibilityCount: 2,
  }, overrides || {});
}

function validatorFor(schemaRef) {
  const loaded = contract.loadSchema(schemaRef);
  assert.ok(loaded.schema, schemaRef + ' must parse');
  assert.equal(typeof loaded.validate, 'function', schemaRef + ' must compile with Ajv');
  return loaded.validate;
}

// ---------------------------------------------------------------------------
// Tests — data registry
// ---------------------------------------------------------------------------

test('S07 data registry exposes frozen enums, TRIAD_INVARIANT, and bounded verdicts', () => {
  assert.equal(data.MILESTONE, 'M016-txa3vu');
  assert.equal(data.SLICE, 'S07');
  assert.equal(data.TASK, 'T01');
  assert.deepEqual(data.TASK_IDS, ['T01', 'T02', 'T03', 'T04']);

  assert.equal(data.VERIFIER_LINE_CLASS, 'M16-S07-CLEANUP');
  assert.equal(data.VERIFIER_CANONICAL_PROTOCOL, 'PROTOCOL-M16-S07-REPLAY-CLEANUP-V1');
  assert.equal(data.CLEANUP_REFERENCE_TIME, '2026-07-21T12:00:00.000Z');

  assert.deepEqual(data.CLEANUP_PHASES, {
    PRE_RUN: 'pre_run', REPLAY: 'replay', POST_RUN: 'post_run',
  });
  assert.deepEqual(data.CLEANUP_OUTCOMES, {
    SUCCESS: 'success', REFUSED: 'refused', FAILED: 'failed',
  });
  assert.equal(Object.isFrozen(data.DEFAULTS), true);
  assert.equal(Object.isFrozen(data.TRIAD_INVARIANT), true);
  assert.equal(Object.isFrozen(data.SOURCE_ALLOWLIST), true);
  assert.equal(Object.isFrozen(data.CLEANUP_ACTIONS), true);
  assert.equal(Object.isFrozen(data.CLEANUP_PHASES), true);
  assert.equal(Object.isFrozen(data.CLEANUP_OUTCOMES), true);
  assert.equal(Object.isFrozen(data.BLOCKER_CODES), true);
});

test('S07 CLEANUP_ACTIONS includes all plan-mandated action enums', () => {
  const expected = [
    'created', 'removed', 'refused', 'atomic_rename_failed',
    'post_run_absent', 'overwrite_refused', 'marker_validated',
    'marker_forged', 'marker_missing', 'subprocess_invoked',
  ];
  for (const value of expected) {
    assert.ok(data.isCleanupAction(value), 'CLEANUP_ACTIONS must include ' + value);
    assert.ok(data.CLEANUP_ACTIONS_SET.has(value), 'CLEANUP_ACTIONS_SET must include ' + value);
  }
  assert.equal(data.isCleanupAction('not-in-enum'), false);
});

test('S07 TRIAD_INVARIANT is frozen, equal-by-reference, and helpers accept matching triples only', () => {
  assert.deepEqual(data.TRIAD_INVARIANT, {
    orchestration: 'PASS', evidence: 'PARTIAL', launch: 'PREPARATION_ONLY',
  });
  assert.equal(data.isVerdictTriad(data.TRIAD_INVARIANT), true);
  assert.equal(data.isVerdictTriad(null), false);
  assert.equal(data.isVerdictTriad({}), false);
  assert.equal(data.isVerdictTriad({ orchestration: 'PASS', evidence: 'PARTIAL', launch: 'PASS' }), false);

  assert.equal(data.verdictTriadDriftField(data.TRIAD_INVARIANT), null);
  assert.equal(data.verdictTriadDriftField({ orchestration: 'NOT_PROVEN', evidence: 'PARTIAL', launch: 'PREPARATION_ONLY' }), 'orchestration');
  assert.equal(data.verdictTriadDriftField({ orchestration: 'PASS', evidence: 'NOT_PROVEN', launch: 'PREPARATION_ONLY' }), 'evidence');
  assert.equal(data.verdictTriadDriftField({ orchestration: 'PASS', evidence: 'PARTIAL', launch: 'GO' }), 'launch');
  assert.equal(data.verdictTriadDriftField(null), 'triple-not-object');
});

test('S07 canonical verdict line is frozen and formatter rejects anything outside PASS|FAIL', () => {
  assert.equal(data.CANONICAL_VERDICT_LINE, 'M016_S07_REPLAY_CLEANUP=PASS|FAIL');
  assert.equal(data.formatCanonicalVerdictLine('PASS'), 'M016_S07_REPLAY_CLEANUP=PASS');
  assert.equal(data.formatCanonicalVerdictLine('FAIL'), 'M016_S07_REPLAY_CLEANUP=FAIL');
  assert.equal(data.formatCanonicalVerdictLine('MAYBE'), null);
  assert.equal(data.isCanonicalVerdictLineStatus('PASS'), true);
  assert.equal(data.isCanonicalVerdictLineStatus('FAIL'), true);
  assert.equal(data.isCanonicalVerdictLineStatus('MAYBE'), false);
});

test('S07 BLOCKER_CODES factory namespace M16-S07-CLEANUP-* with stable exit-code mapping', () => {
  // Verify that every factory yields a string that matches the namespace
  // pattern and that mapBlockerToExitCode returns a non-zero exit code.
  for (const [name, factory] of Object.entries(data.BLOCKER_CODES)) {
    const sample = typeof factory === 'function'
      ? factory(name === 'SUBPROCESS_NONE'
        || name === 'SEMANTIC_DIGEST_DRIFT'
        || name === 'VERIFIER_RUNNER_FAILURE' ? undefined : 'fixture')
      : null;
    if (sample === null) continue;
    assert.equal(typeof sample, 'string', name + ' must yield string');
    assert.match(sample, /^M16-S07-CLEANUP-[A-Za-z0-9._-]+/, name + ' must follow namespace');
    assert.ok(data.isCleanupBlockerCode(sample), name + ' must pass isCleanupBlockerCode');
    assert.notEqual(contract.mapBlockerToExitCode(sample), 0, name + ' must map to non-zero exit');
  }
  // Specific mapping precedence checks.
  assert.equal(contract.mapBlockerToExitCode(data.BLOCKER_CODES.PRECONDITION_MISSING('x')), data.EXIT_CODES.CLEANUP_PRECONDITION_DRIFT);
  assert.equal(contract.mapBlockerToExitCode(data.BLOCKER_CODES.SECRET_TOKEN('full_ids')), data.EXIT_CODES.CLEANUP_REDACTION_LEAK);
  assert.equal(contract.mapBlockerToExitCode(data.BLOCKER_CODES.VERDICT_TRIPLE_DRIFT('launch')), data.EXIT_CODES.CLEANUP_LAUNCH_PROMOTION);
  assert.equal(contract.mapBlockerToExitCode(data.BLOCKER_CODES.MARKER_FORGED('rel')), data.EXIT_CODES.CLEANUP_PROVENANCE_DRIFT);
  assert.equal(contract.mapBlockerToExitCode(data.BLOCKER_CODES.PRE_EXISTING_RESIDUE('rel')), data.EXIT_CODES.CLEANUP_RESIDUE_DRIFT);
  assert.equal(contract.mapBlockerToExitCode(data.BLOCKER_CODES.SUBPROCESS_OVERFLOW(2)), data.EXIT_CODES.CLEANUP_PROVENANCE_DRIFT);
  // Unknown blocker falls through to CLEANUP_FAIL_CLOSED.
  assert.equal(contract.mapBlockerToExitCode('totally-unknown'), data.EXIT_CODES.CLEANUP_FAIL_CLOSED);
  assert.equal(contract.mapBlockerToExitCode(undefined), data.EXIT_CODES.CLEANUP_FAIL_CLOSED);
});

test('S07 EXIT_CODES is frozen and bounded to 0..7', () => {
  assert.equal(Object.isFrozen(data.EXIT_CODES), true);
  const values = Object.values(data.EXIT_CODES);
  for (const value of values) {
    assert.ok(Number.isInteger(value));
    assert.ok(value >= 0 && value <= 7, 'EXIT_CODES must stay within 0..7: ' + value);
  }
  assert.equal(data.EXIT_CODES.CLEANUP_PASS, 0);
});

test('S07 SOURCE_ALLOWLIST pins M015 baseline + S01 schema/fixture/canonical artifacts', () => {
  assert.ok(data.SOURCE_ALLOWLIST_SET.has(data.S01_SCHEMA_REF));
  assert.ok(data.SOURCE_ALLOWLIST_SET.has(data.S01_FIXTURE_REF));
  assert.ok(data.SOURCE_ALLOWLIST_SET.has(data.S01_PROTOCOL_REF));
  assert.ok(data.SOURCE_ALLOWLIST_SET.has(data.S01_VALIDATION_REF));
  assert.ok(data.SOURCE_ALLOWLIST_SET.has(data.S01_VERIFICATION_REF));
  assert.ok(data.SOURCE_ALLOWLIST_SET.has(data.M015_BASELINE_REF));
  assert.equal(data.isAllowedSourceRef('runtime-evidence/M016-S07-replay-cleanup-proof.json'), false);
  assert.equal(data.isAllowedSourceRef(data.M015_BASELINE_REF), true);

  const required = data.REQUIRED_CHAIN_ROLES;
  assert.ok(required.length === data.SOURCE_ALLOWLIST.length);
  for (const role of required) {
    assert.ok(typeof role === 'string');
    assert.match(role, /^[a-z][a-z0-9_]+$/);
  }
});

// ---------------------------------------------------------------------------
// Tests — schema
// ---------------------------------------------------------------------------

test('S07 schema compiles and advertises strict object roots', () => {
  for (const schemaRef of SCHEMA_REFS) {
    const loaded = contract.loadSchema(schemaRef);
    assert.equal(loaded.schema.additionalProperties, false, schemaRef);
    assert.equal(typeof loaded.validate, 'function', schemaRef);
  }
});

test('S07 schema rejects unknown top-level properties on the proof sidecar', () => {
  const validate = validatorFor(data.DEFAULTS.schema_path);
  const input = makeBaseInput();
  const proof = contract.buildProofSidecar(input).sidecar;
  assert.ok(proof);
  assert.equal(validate(proof), true, JSON.stringify(validate.errors));

  const tampered = clone(proof);
  tampered.unexpected = 'value';
  assert.equal(validate(tampered), false, 'unknown property must be rejected');
});

test('S07 schema rejects verdict triple drift in the proof sidecar', () => {
  const validate = validatorFor(data.DEFAULTS.schema_path);
  const proof = contract.buildProofSidecar(makeBaseInput()).sidecar;
  assert.ok(proof);

  const launchPromotion = clone(proof);
  launchPromotion.verdict_triple = { orchestration: 'PASS', evidence: 'PARTIAL', launch: 'PASS' };
  assert.equal(validate(launchPromotion), false, 'launch verdict promotion must be rejected');

  const evidencePromotion = clone(proof);
  evidencePromotion.verdict_triple = { orchestration: 'PASS', evidence: 'PASS', launch: 'PREPARATION_ONLY' };
  assert.equal(validate(evidencePromotion), false, 'evidence verdict promotion must be rejected');

  const orchestrationDemotion = clone(proof);
  orchestrationDemotion.verdict_triple = { orchestration: 'NOT_PROVEN', evidence: 'PARTIAL', launch: 'PREPARATION_ONLY' };
  assert.equal(validate(orchestrationDemotion), false, 'orchestration demotion must be rejected');
});

// ---------------------------------------------------------------------------
// Tests — pure contract helpers
// ---------------------------------------------------------------------------

test('S07 path containment rejects traversal, absolute, NUL, and outside-prefix relpaths', () => {
  assert.equal(contract.normalizeRelPath('../etc/passwd'), null);
  assert.equal(contract.normalizeRelPath('foo/../bar'), null);
  assert.equal(contract.normalizeRelPath('/absolute/path'), null);
  assert.equal(contract.normalizeRelPath('with\0nul'), null);
  assert.equal(contract.normalizeRelPath(''), null);
  assert.equal(contract.normalizeRelPath(null), null);

  assert.equal(contract.validatePathContainment('', 'runtime-evidence/x').ok, false);
  assert.equal(contract.validatePathContainment('runtime-evidence/x', '').ok, false);
  assert.equal(contract.validatePathContainment('scripts/foo.js', 'runtime-evidence/x').ok, false);
  assert.equal(contract.validatePathContainment('../runtime-evidence/x', 'runtime-evidence/x').ok, false);

  const ok = contract.validatePathContainment('runtime-evidence/x/sub', 'runtime-evidence/x');
  assert.equal(ok.ok, true);
  assert.equal(ok.relpath, 'runtime-evidence/x/sub');
});

test('S07 marker ownership: valid | forged | missing', () => {
  // valid
  assert.equal(contract.validateMarkerOwnership(data.SCRATCH_ROOT_MARKER_RELPATH, data.MARKER_CONTENTS), 'valid');
  // missing — relpath empty
  assert.equal(contract.validateMarkerOwnership('', data.MARKER_CONTENTS), 'missing');
  // missing — relpath not a string
  assert.equal(contract.validateMarkerOwnership(null, data.MARKER_CONTENTS), 'missing');
  // forged — wrong contents
  assert.equal(contract.validateMarkerOwnership(data.SCRATCH_ROOT_MARKER_RELPATH, 'WRONG'), 'forged');
  // forged — trailing newline
  assert.equal(contract.validateMarkerOwnership(data.SCRATCH_ROOT_MARKER_RELPATH, data.MARKER_CONTENTS + '\n'), 'forged');
  // forged — contents not a string
  assert.equal(contract.validateMarkerOwnership(data.SCRATCH_ROOT_MARKER_RELPATH, 42), 'forged');
  // forged — relpath outside scratch root
  assert.equal(contract.validateMarkerOwnership('runtime-evidence/other/.marker', data.MARKER_CONTENTS), 'forged');
});

test('S07 single subprocess enforcement: 0=none, 1=ok, >1=overflow', () => {
  assert.deepEqual(contract.validateSingleSubprocess(0), { ok: false, reason: 'none' });
  assert.deepEqual(contract.validateSingleSubprocess(1), { ok: true, reason: 'ok' });
  assert.deepEqual(contract.validateSingleSubprocess(2), { ok: false, reason: 'overflow-observed' });
  assert.deepEqual(contract.validateSingleSubprocess(99), { ok: false, reason: 'overflow-observed' });
  assert.deepEqual(contract.validateSingleSubprocess('not-a-number'), { ok: false, reason: 'non-finite' });
  assert.deepEqual(contract.validateSingleSubprocess(-1), { ok: false, reason: 'none' });
});

test('S07 cleanup trace validation: empty, too-many, bad-phase, bad-action, bad-outcome, bad-reason-length', () => {
  assert.deepEqual(contract.validateCleanupTrace([]), { ok: false, reason: 'empty' });
  assert.deepEqual(contract.validateCleanupTrace(null), { ok: false, reason: 'not-array' });
  assert.deepEqual(contract.validateCleanupTrace({ not: 'array' }), { ok: false, reason: 'not-array' });

  const tooMany = new Array(data.DEFAULTS.max_cleanup_trace_rows + 1).fill(0).map(() => makeMinimalCleanupTrace()[0]);
  const tooManyResult = contract.validateCleanupTrace(tooMany);
  assert.equal(tooManyResult.ok, false);
  assert.equal(tooManyResult.reason, 'too-many-rows');

  const badPhase = makeMinimalCleanupTrace();
  badPhase[0].phase = 'NOPE';
  assert.equal(contract.validateCleanupTrace(badPhase).ok, false);

  const badAction = makeMinimalCleanupTrace();
  badAction[1].action = 'totally-unknown';
  assert.equal(contract.validateCleanupTrace(badAction).ok, false);

  const badOutcome = makeMinimalCleanupTrace();
  badOutcome[2].outcome = 'WAT';
  assert.equal(contract.validateCleanupTrace(badOutcome).ok, false);

  const badReason = makeMinimalCleanupTrace();
  badReason[0].reason = '';
  assert.equal(contract.validateCleanupTrace(badReason).ok, false);

  const tooLongReason = makeMinimalCleanupTrace();
  tooLongReason[0].reason = 'x'.repeat(data.DEFAULTS.max_blocker_reason_chars + 1);
  assert.equal(contract.validateCleanupTrace(tooLongReason).ok, false);

  // Well-formed trace passes.
  const okTrace = makeMinimalCleanupTrace();
  assert.deepEqual(contract.validateCleanupTrace(okTrace), { ok: true });

  // Cleanup trace builder rejects empty/oversized lists.
  assert.throws(() => contract.buildCleanupTrace([]), /at least one row/);
  assert.throws(
    () => contract.buildCleanupTrace(new Array(data.DEFAULTS.max_cleanup_trace_rows + 1).fill(0).map(() => makeMinimalCleanupTrace()[0])),
    /exceeds max_cleanup_trace_rows/,
  );

  // Cleanup trace row builder enforces enum membership.
  assert.throws(() => contract.buildCleanupTraceRow({ phase: 'x', action: 'y', target_relpath: 'z', outcome: 'w' }), /phase/);
});

test('S07 verdict triad helper builds and enforces invariant', () => {
  const triple = contract.buildVerdictTriad(data.TRIAD_INVARIANT);
  assert.equal(contract.assertVerdictTriadInvariant(triple), triple);
  assert.throws(
    () => contract.assertVerdictTriadInvariant({ orchestration: 'PASS', evidence: 'PASS', launch: 'PREPARATION_ONLY' }),
    (error) => error.code && /VERDICT-TRIPLE-DRIFT/.test(error.code) && error.driftField === 'evidence',
  );
  assert.throws(
    () => contract.assertVerdictTriadInvariant(null),
    (error) => error.code && /VERDICT-TRIPLE-DRIFT/.test(error.code) && error.driftField === 'triple-not-object',
  );
});

// ---------------------------------------------------------------------------
// Tests — redaction safety
// ---------------------------------------------------------------------------

test('S07 redaction safety surfaces leak hits and refuses to write', () => {
  const unsafeHits = contract.checkRedactionSafety({ full_ids: true });
  assert.ok(unsafeHits.length >= 1, 'full_ids=true must surface at least one leak hit');
  const safeHits = contract.checkRedactionSafety({ full_ids: false });
  assert.equal(safeHits.length, 0);

  // Full UUID in any string must be flagged.
  const uuidHits = contract.checkRedactionSafety({ description: 'see 9feb4c22-05b9-401e-ba67-0e866e3056da' });
  assert.ok(uuidHits.length >= 1);

  // Bearer token in any string must be flagged.
  const bearerHits = contract.checkRedactionSafety({ line: 'authorization: bearer aabbccddeeff1122' });
  assert.ok(bearerHits.length >= 1);

  // assertProofWriteSafe throws when full_ids is true.
  const stub = {
    schema_id: data.REPLAY_CLEANUP_SCHEMA_ID,
    inputs: {},
    redaction_posture: clone(data.CLEANUP_REDACTION_FLAG_VALUES),
  };
  assert.doesNotThrow(() => contract.assertProofWriteSafe(clone(stub)));
  const unsafe = {
    schema_id: data.REPLAY_CLEANUP_SCHEMA_ID,
    inputs: {},
    redaction_posture: Object.assign({}, data.CLEANUP_REDACTION_FLAG_VALUES, { full_ids: true }),
  };
  assert.throws(
    () => contract.assertProofWriteSafe(unsafe),
    (error) => error.code && /^M16-S07-CLEANUP-SECRET-TOKEN-/.test(error.code),
  );
});

// ---------------------------------------------------------------------------
// Tests — sidecar builders
// ---------------------------------------------------------------------------

test('S07 proof sidecar builds via buildProofSidecar with byte-stable round-trip', () => {
  const input = makeBaseInput();
  const result = contract.buildProofSidecar(input);
  assert.equal(result.ok, true, JSON.stringify(result.code));
  const proof = result.sidecar;
  assert.equal(proof.proof_kind, data.REPLAY_CLEANUP_PROOF_KIND);
  assert.equal(proof.canonical_verdict_line, data.CANONICAL_VERDICT_LINE);
  assert.equal(proof.canonical_verdict_line_status, 'PASS');
  assert.equal(proof.bounded_exit_code, 0);
  assert.equal(proof.replay_subprocess_invocations, 1);
  assert.equal(proof.verdict_triple.orchestration, 'PASS');
  assert.equal(proof.verdict_triple.evidence, 'PARTIAL');
  assert.equal(proof.verdict_triple.launch, 'PREPARATION_ONLY');
  assert.equal(proof.raw_bodies_persisted, false);
  assert.equal(proof.blockers.length, 0);
  // Byte-stable round-trip: re-canonicalise and re-hash.
  const digest2 = contract.computeProofBodyDigest(proof);
  assert.equal(proof.byte_digest, digest2);

  // Schema validation passes for the well-formed proof.
  const validate = validatorFor(data.DEFAULTS.schema_path);
  assert.equal(validate(proof), true, JSON.stringify(validate.errors));
});

test('S07 proof sidecar refuses to render when the verdict triple drifts', () => {
  const input = makeBaseInput({
    verdictTriple: { orchestration: 'PASS', evidence: 'PARTIAL', launch: 'GO' },
  });
  const result = contract.buildProofSidecar(input);
  assert.equal(result.ok, false);
  assert.match(result.code, /VERDICT-TRIPLE-DRIFT/);
});

test('S07 proof sidecar refuses to render when subprocess invocations exceed 1', () => {
  const input = makeBaseInput({ replaySubprocessInvocations: 2 });
  const result = contract.buildProofSidecar(input);
  assert.equal(result.ok, false);
  assert.match(result.code, /SUBPROCESS-OVERFLOW/);
});

test('S07 proof sidecar refuses to render when subprocess invocations are zero', () => {
  const input = makeBaseInput({ replaySubprocessInvocations: 0 });
  const result = contract.buildProofSidecar(input);
  assert.equal(result.ok, false);
  assert.equal(result.code, data.BLOCKER_CODES.SUBPROCESS_NONE());
});

test('S07 proof sidecar refuses to render when cleanup trace is empty', () => {
  const input = makeBaseInput({ cleanupTrace: [] });
  const result = contract.buildProofSidecar(input);
  assert.equal(result.ok, false);
  assert.match(result.code, /SCHEMA-VIOLATION/);
});

test('S07 negative-fixtures sidecar builds with byte-stable round-trip and unique blocker codes', () => {
  const fixtures = [
    {
      fixture_id: 'S07-NF-01',
      threat_class: 'traversal',
      tamper_path: 'cleanup_trace[0].target_relpath',
      mutator_kind: 'path_traversal',
      baseline_value: 'runtime-evidence/.m016-s07-replay-scratch/.m016-s07-replay-marker',
      tampered_value: '../etc/passwd',
      expected_blocker_code: data.BLOCKER_CODES.PATH_TRAVERSAL('etc-passwd'),
      expected_verdict: 'FAIL',
      expected_exit_code: 3,
      rationale: 'cleanup_trace target_relpath must stay under marker-owned scratch root.',
      evidence_ref: 'runtime-evidence/M016-S07-replay-cleanup-negative-fixtures.json',
    },
    {
      fixture_id: 'S07-NF-02',
      threat_class: 'verdict_triple_drift',
      tamper_path: 'verdict_triple.launch',
      mutator_kind: 'verdict_promotion',
      baseline_value: 'PREPARATION_ONLY',
      tampered_value: 'PASS',
      expected_blocker_code: data.BLOCKER_CODES.VERDICT_TRIPLE_DRIFT('launch'),
      expected_verdict: 'FAIL',
      expected_exit_code: 4,
      rationale: 'verdict triple is structurally frozen to PREPARATION_ONLY for launch.',
      evidence_ref: 'runtime-evidence/M016-S07-replay-cleanup-negative-fixtures.json',
    },
  ];
  const result = contract.buildNegativeFixturesSidecar({
    generated: data.CLEANUP_REFERENCE_TIME,
    sourceHashes: makeSourceHashes(),
    fixtures,
    coverageSummary: {
      traversal: 1, symlink_escape: 0, marker_forgery: 0, marker_missing: 0,
      source_hash_drift: 0, pre_existing_residue: 0, cleanup_refusal: 0,
      atomic_rename_failure: 0, overwrite_attempt: 0, redaction_leak: 0,
      subprocess_overflow: 0, verdict_triple_drift: 1,
    },
  });
  assert.equal(result.ok, true, JSON.stringify(result.code));
  const sidecar = result.sidecar;
  assert.equal(sidecar.proof_kind, data.REPLAY_CLEANUP_NEGATIVE_FIXTURES_KIND);
  assert.equal(sidecar.fixture_count, 2);
  assert.equal(sidecar.unique_blocker_codes, 2);
  assert.equal(sidecar.bounded_exit_code, 0);
  const digest2 = contract.computeNegativeFixturesBodyDigest(sidecar);
  assert.equal(sidecar.byte_digest, digest2);

  // Schema validation: when proof_kind is replay-cleanup-negative-fixtures
  // the conditional `then` requires the negative-fixtures-only fields and
  // DOES NOT require proof-only fields like cleanup_marker. The same
  // schema accepts both proof kinds via allOf branches.
  const validate = validatorFor(data.DEFAULTS.schema_path);
  assert.equal(validate(sidecar), true, JSON.stringify(validate.errors));
});

test('S07 negative-fixtures sidecar refuses malformed blocker codes', () => {
  const fixtures = [{
    fixture_id: 'S07-NF-01',
    threat_class: 'traversal',
    tamper_path: 'cleanup_trace[0].target_relpath',
    mutator_kind: 'path_traversal',
    baseline_value: 'a',
    tampered_value: 'b',
    expected_blocker_code: 'INVALID-BLOCKER-CODE',
    expected_verdict: 'FAIL',
    expected_exit_code: 3,
    rationale: 'must be rejected because the expected blocker code is malformed.',
    evidence_ref: 'runtime-evidence/M016-S07-replay-cleanup-negative-fixtures.json',
  }];
  const result = contract.buildNegativeFixturesSidecar({ fixtures });
  assert.equal(result.ok, false);
  assert.match(result.code, /SCHEMA-VIOLATION/);
});

// ---------------------------------------------------------------------------
// Tests — top-level evaluation
// ---------------------------------------------------------------------------

test('S07 evaluateCleanupContract passes on a clean input', () => {
  const evaluation = contract.evaluateCleanupContract(makeBaseInput());
  assert.equal(evaluation.ok, true, JSON.stringify(evaluation.blockers));
  assert.equal(evaluation.verdict, 'pass');
  assert.equal(evaluation.exit_code, data.EXIT_CODES.CLEANUP_PASS);
  assert.equal(evaluation.blockers.length, 0);
  assert.ok(evaluation.sidecar);
  assert.equal(evaluation.sidecar.bounded_exit_code, 0);
});

test('S07 evaluateCleanupContract refuses path traversal in marker relpath', () => {
  const evaluation = contract.evaluateCleanupContract(makeBaseInput({
    cleanupMarker: {
      relpath: '../etc/passwd',
      contents: data.MARKER_CONTENTS,
      sha256: contract.sha256Hex(data.MARKER_CONTENTS),
    },
  }));
  assert.equal(evaluation.ok, false);
  assert.ok(evaluation.blockers.length >= 1);
  assert.match(evaluation.blockers[0].code, /PATH-OUT-OF-CHECKOUT|PATH-TRAVERSAL/);
});

test('S07 evaluateCleanupContract refuses forged marker contents', () => {
  const evaluation = contract.evaluateCleanupContract(makeBaseInput({
    cleanupMarker: {
      relpath: data.SCRATCH_ROOT_MARKER_RELPATH,
      contents: 'forged',
      sha256: contract.sha256Hex('forged'),
    },
  }));
  assert.equal(evaluation.ok, false);
  assert.match(evaluation.blockers[0].code, /MARKER-FORGED/);
});

test('S07 evaluateCleanupContract refuses verdict triple drift', () => {
  const evaluation = contract.evaluateCleanupContract(makeBaseInput({
    verdictTriple: { orchestration: 'NOT_PROVEN', evidence: 'PARTIAL', launch: 'PREPARATION_ONLY' },
  }));
  assert.equal(evaluation.ok, false);
  assert.match(evaluation.blockers[0].code, /VERDICT-TRIPLE-DRIFT/);
});

test('S07 evaluateCleanupContract refuses missing sources and overflows', () => {
  const emptyHashes = {};
  const evaluation = contract.evaluateCleanupContract(makeBaseInput({
    sourceHashes: emptyHashes,
    replaySubprocessInvocations: 3,
  }));
  assert.equal(evaluation.ok, false);
  const codes = evaluation.blockers.map((b) => b.code);
  assert.ok(codes.some((c) => /PRECONDITION-MISSING/.test(c)));
  assert.ok(codes.some((c) => /SUBPROCESS-OVERFLOW/.test(c)));
});

// ---------------------------------------------------------------------------
// Tests — pure module surface (no subprocess / write / network)
// ---------------------------------------------------------------------------

test('S07 contract module has no subprocess, write, or network surface', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts/lib/m016-s07-replay-cleanup-contract.js'), 'utf8');
  // Forbid subprocess/network/wire-write usage inside the pure contract.
  // Patterns match actual API usage (require call or method invocation with
  // open paren), not identifier mentions in doc comments.
  assert.doesNotMatch(source, /require\s*\(\s*['"](?:node:)?child_process['"]/);
  assert.doesNotMatch(source, /from\s+['"](?:node:)?child_process['"]/);
  assert.doesNotMatch(source, /\bexecSync\s*\(/);
  assert.doesNotMatch(source, /\bspawnSync\s*\(/);
  assert.doesNotMatch(source, /\bwriteFileSync\s*\(/);
  assert.doesNotMatch(source, /\bwriteFile\s*\(/);
  assert.doesNotMatch(source, /\bappendFileSync\s*\(/);
  assert.doesNotMatch(source, /\bappendFile\s*\(/);
  assert.doesNotMatch(source, /\brenameSync\s*\(/);
  assert.doesNotMatch(source, /\bunlinkSync\s*\(/);
  assert.doesNotMatch(source, /\brmSync\s*\(/);
  assert.doesNotMatch(source, /\bmkdirSync\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /https?\.(?:get|request)\s*\(/);
});

test('S07 data module is pure (no subprocess / write / network surface)', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts/lib/m016-s07-replay-cleanup-data.js'), 'utf8');
  assert.doesNotMatch(source, /require\s*\(\s*['"](?:node:)?child_process['"]/);
  assert.doesNotMatch(source, /require\s*\(\s*['"]node:fs['"]/);
  assert.doesNotMatch(source, /\bfs\.[a-zA-Z]+\s*\(/);
  assert.doesNotMatch(source, /\bwriteFileSync\s*\(/);
  assert.doesNotMatch(source, /\bwriteFile\s*\(/);
  assert.doesNotMatch(source, /\bexecSync\s*\(/);
  assert.doesNotMatch(source, /\bspawnSync\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
});
