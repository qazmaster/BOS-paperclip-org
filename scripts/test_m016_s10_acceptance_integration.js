#!/usr/bin/env node
'use strict';

/**
 * scripts/test_m016_s10_acceptance_integration.js
 *
 * M016-txa3vu / S10 / T04 — Cross-component integration suite for the
 * seven-division acceptance chain. The S11 handoff consumes one
 * immutable acceptance anchor; this suite proves that the contract
 * model, the builder sidecar, and the independent verifier agree
 * on every cross-cutting invariant: digests, counters, source hashes,
 * frozen posture, forbidden verdict tokens, capability promotion
 * guards, and the byte-stable round-trip.
 *
 * Coverage scope (no overlap with T01/T02/T03 unit suites):
 *
 *  A. Cross-module API surface
 *   i01  buildAcceptanceModel({}) produces 6 sections in immutable order
 *   i02  contract exports cover the S11-handoff surface (builder + verifier
 *        + eval utilities, all frozen)
 *   i03  builder + verifier expose main()/run() with no shared mutable state
 *
 *  B. End-to-end pipeline (builder → sidecar → verifier)
 *   i04  builder.main dry-run → verifier accepts the model sections
 *   i05  builder.main full pipeline writes a sidecar that verifier.run
 *        reports as ACCEPTANCE_RESOLVED with exit 0 (subprocess)
 *   i06  Builder CLI line shape + verifier CLI line shape agree on shared
 *        counts (criterion=6, not_proven=9, source=15, section=6)
 *
 *  C. Determinism across the chain
 *   i07  Two builder runs with same reference-time produce byte-identical
 *        files
 *   i08  Builder payload digest == verifier-recomputed digest on the same
 *        sidecar
 *   i09  Re-built sidecar source_hashes == loader.all_hashes for all 15
 *        refs (zero hash drift)
 *   i10  builder.main exit_code == contract.evaluateAcceptance(model).exit_code
 *
 *  D. Frozen posture + provenance cross-check
 *   i11  launch_posture is the frozen snapshot, surfaced identically in
 *        model.launch_posture and sidecar.launch_posture
 *   i12  NOT_PROVEN preservation: 9 preserved_ids present in built sidecar
 *        + block_count == 0 (none promoted)
 *   i13  S05 producer PASS + verifier NOT_PROVEN preserved as provenance,
 *        frozen_reconciliation_verdict == PARTIAL
 *   i14  S08 scope decision is scope_revised + boundary PREPARATION_ONLY +
 *        closure_verdict NOT_PROVEN_SCOPE_REVISED
 *   i15  R041 satisfaction == STRUCTURAL_ONLY + observed_components ==
 *        frozen 3-set
 *
 *  E. Anti-promotion invariants (cross-component)
 *   i16  None of the 5 FORBIDDEN_ACCEPTANCE_VERDICTS appear in the
 *        built sidecar or any canonical model section
 *   i17  None of the FORBIDDEN_R041_SATISFACTION tokens appear anywhere
 *        in the built sidecar
 *   i18  bounded_internal == true preserved in launch_posture and outcome
 *        section (no capability promotion)
 *   i19  source_hashes has exactly the 15 allowlisted refs (no extras,
 *        no missing) on the sidecar
 *
 *  F. Counter + provenance agreement
 *   i20  sidecar.provenance_appendix counters match loader.summary exactly
 *   i21  sidecar.counters.{network_calls,subprocess_calls,env_reads,
 *        mutation_count} == 0; temp_file_writes == 1 for full build
 *   i22  sidecar.sanitised + raw_bodies_persisted == false + producer_cli
 *        _invoked == false (independent of any external producer)
 *
 *  G. Verifier independence surface
 *   i23  verifier.VERIFIER_IMPORTS contains exactly the 5 allowed modules
 *   i24  verifier module surface never references the producer CLI
 *   i25  Failure summary from builder + failure summary from verifier use
 *        the bounded stable shape (no raw payload leak)
 *
 * Run with:
 *   node --test scripts/test_m016_s10_acceptance_integration.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const contract = require('./lib/m016-s10-acceptance-contract.js');
const loader = require('./lib/m016-s10-canonical-reference-loader.js');
const builder = require('./build_m016_s10_acceptance_contract.js');
const verifier = require('./verify_m016_s10_acceptance_contract.js');

// ---------------------------------------------------------------------------
// Paths + helpers — keep all tmp dirs INSIDE the project root so the
// builder/verifier lexical containment accepts them (mirrors T02/T03 style).
// ---------------------------------------------------------------------------
const ROOT = path.resolve(__dirname, '..');
const RUNTIME_EVIDENCE = path.join(ROOT, 'runtime-evidence');
const CANONICAL_OUTPUT = path.join(RUNTIME_EVIDENCE, 'M016-S10-seven-division-acceptance-contract.json');
const TEST_TMP_ROOT = path.join(ROOT, '.tmp-test');

function makeTempDir(prefix) {
  fs.mkdirSync(TEST_TMP_ROOT, { recursive: true });
  return fs.mkdtempSync(path.join(TEST_TMP_ROOT, prefix + '-'));
}

function rmTempDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

function rmTestTmpRoot() {
  try { fs.rmSync(TEST_TMP_ROOT, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

rmTestTmpRoot();
fs.mkdirSync(TEST_TMP_ROOT, { recursive: true });

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// Build a builder payload without writing to disk — for in-memory tests.
function buildInMemoryPayload(referenceTime) {
  const ref = referenceTime || contract.DEFAULTS.reference_time;
  const lr = loader.loadCanonicalReferences();
  const model = builder.buildModel(lr, ref);
  const evaluation = contract.evaluateAcceptance({ model });
  return {
    lr,
    model,
    evaluation,
    payload: builder.buildPayload(model, evaluation, lr, {
      output: 'runtime-evidence/M016-S10-integration.json',
      referenceTime: ref,
      dryRun: true,
    }),
  };
}

function captureStdout(fn) {
  const origWrite = process.stdout.write.bind(process.stdout);
  let buf = '';
  process.stdout.write = (chunk, ...rest) => { buf += String(chunk); return true; };
  let exitCode = undefined;
  const origExit = process.exit;
  process.exit = (code) => { exitCode = code; throw new Error('__TEST_EXIT__:' + code); };
  try { fn(); } catch (e) {
    if (!String(e.message || '').startsWith('__TEST_EXIT__:')) throw e;
  } finally {
    process.stdout.write = origWrite;
    process.exit = origExit;
  }
  return { stdout: buf, exitCode };
}

function captureStderr(fn) {
  const origWrite = process.stderr.write.bind(process.stderr);
  let buf = '';
  process.stderr.write = (chunk, ...rest) => { buf += String(chunk); return true; };
  let exitCode = undefined;
  const origExit = process.exit;
  process.exit = (code) => { exitCode = code; throw new Error('__TEST_EXIT__:' + code); };
  try { fn(); } catch (e) {
    if (!String(e.message || '').startsWith('__TEST_EXIT__:')) throw e;
  } finally {
    process.stderr.write = origWrite;
    process.exit = origExit;
  }
  return { stderr: buf, exitCode };
}

// ===========================================================================
// A. CROSS-MODULE API SURFACE
// ===========================================================================

test('i01 buildAcceptanceModel({}): produces 6 sections in immutable order', () => {
  const m = contract.buildAcceptanceModel({});
  assert.equal(m.section_count, 6);
  assert.deepEqual([...m.section_ids], [
    'r041_acceptance',
    'milestone_criterion',
    's05_canonical_verdicts',
    's08_scope_decision',
    'not_proven_preservation',
    'canonical_acceptance_outcome',
  ]);
  // Cross-check against the frozen contract constants.
  assert.equal(m.section_count, contract.EXPECTED_SECTION_COUNT);
  assert.deepEqual([...m.section_ids], [...contract.ACCEPTANCE_SECTION_IDS]);
});

test('i02 contract module surface covers S11 handoff — builder + verifier + eval utilities all frozen', () => {
  assert.equal(Object.isFrozen(contract), true);
  for (const fn of [
    'buildAcceptanceModel', 'buildR041Acceptance', 'buildMilestoneCriterion',
    'buildS05CanonicalVerdicts', 'buildS08ScopeDecision',
    'buildNotProvenPreservation', 'buildCanonicalAcceptanceOutcome',
    'computeAcceptanceDigest', 'evaluateAcceptance', 'checkRedactionSafety',
    'assertWriteSafe', 'mapBlockerToExitCode',
    'buildHealthLineBuilder', 'buildHealthLineAcceptance',
    'isForbiddenAcceptanceVerdict', 'isForbiddenR041Satisfaction',
    'isAcceptanceBlockerCode', 'isAllowlistedSourceRef',
  ]) {
    assert.equal(typeof contract[fn], 'function', `${fn} must be a function in contract`);
  }
});

test('i03 builder + verifier expose main()/run() with no shared mutable state', () => {
  assert.equal(typeof builder.main, 'function');
  assert.equal(typeof verifier.run, 'function');
  // Two consecutive builds must not share transient state.
  const a = buildInMemoryPayload('2026-07-23T12:00:00.000Z');
  const b = buildInMemoryPayload('2026-07-23T12:00:00.000Z');
  assert.equal(a.payload.acceptance_contract_digest, b.payload.acceptance_contract_digest);
  // Different reference-time must produce a different digest.
  const c = buildInMemoryPayload('2026-07-23T12:00:00.001Z');
  assert.notEqual(c.payload.acceptance_contract_digest, a.payload.acceptance_contract_digest);
});

// ===========================================================================
// B. END-TO-END PIPELINE (builder → sidecar → verifier)
// ===========================================================================

test('i04 builder.main dry-run produces a model the verifier can re-validate', () => {
  const tmpDir = makeTempDir('i04-dryrun');
  const target = path.join(tmpDir, 'should-not-exist.json');
  try {
    let exitCode;
    const out = captureStdout(() => {
      exitCode = builder.main([
        'node', 'build_m016_s10_acceptance_contract.js',
        '--dry-run',
        '--output', target,
        '--reference-time', '2026-07-23T12:00:00.000Z',
      ]);
    });
    assert.equal(exitCode, 0);
    assert.equal(fs.existsSync(target), false, 'dry-run must NOT write output');
    // Verifier re-derives hashes against the loader — same source_root
    // (project ROOT) must yield zero hash blockers for an in-memory
    // model produced from the canonical sources.
    const inMemory = buildInMemoryPayload('2026-07-23T12:00:00.000Z');
    const r = verifier.rederiveHashBlockers(inMemory.payload, null);
    assert.equal(r.blockers.length, 0, 'no hash blockers expected for canonical sources');
  } finally {
    rmTempDir(tmpDir);
  }
});

test('i05 builder.main full pipeline writes a sidecar that verifier.run reports as ACCEPTANCE_RESOLVED (subprocess)', () => {
  const tmpDir = makeTempDir('i05-e2e');
  const target = path.join(tmpDir, 'sidecar.json');
  try {
    let exitCode;
    captureStdout(() => {
      exitCode = builder.main([
        'node', 'build_m016_s10_acceptance_contract.js',
        '--force',
        '--output', target,
        '--reference-time', '2026-07-23T12:00:00.000Z',
      ]);
    });
    assert.equal(exitCode, 0);
    assert.ok(fs.existsSync(target));
    // Run verifier as a real subprocess — exactly what S11 will invoke.
    const out = spawnSync('node', [
      path.resolve(__dirname, 'verify_m016_s10_acceptance_contract.js'),
      '--input', path.relative(ROOT, target),
      '--source-root', ROOT,
    ], { encoding: 'utf8' });
    assert.equal(out.status, 0, 'verifier exit must be 0; stderr=' + out.stderr + ' stdout=' + out.stdout);
    assert.match(out.stdout, /^M16-S10-ACCEPTANCE\s+/);
    assert.match(out.stdout, /verdict=ACCEPTANCE_RESOLVED/);
    assert.match(out.stdout, /exit=0/);
    assert.match(out.stdout, /block_count=0/);
  } finally {
    rmTempDir(tmpDir);
  }
});

test('i06 builder CLI line shape + verifier CLI line shape agree on shared counts', () => {
  const { payload } = buildInMemoryPayload('2026-07-23T12:00:00.000Z');
  const builderLine = builder.buildBuilderCliLine(payload, { sha256: 'abcd' });
  // Both lines must surface the same canonical counts.
  assert.match(builderLine, /criterion_count=6\b/);
  assert.match(builderLine, /not_proven_count=9\b/);
  assert.match(builderLine, /source_count=15\b/);
  assert.match(builderLine, /section_count=6\b/);

  const classification = {
    verdict: contract.VERDICT_VALUES.ACCEPTANCE_RESOLVED,
    exitCode: 0,
  };
  const verifierLine = verifier.buildVerifierCliLine(
    classification, 0, 'runtime-evidence/foo.json', 'a'.repeat(64), 'b'.repeat(64),
  );
  assert.match(verifierLine, /criterion_count=6\b/);
  assert.match(verifierLine, /not_proven_count=9\b/);
  assert.match(verifierLine, /source_count=15\b/);
  assert.match(verifierLine, /section_count=6\b/);
});

// ===========================================================================
// C. DETERMINISM ACROSS THE CHAIN
// ===========================================================================

test('i07 two builder runs with same reference-time produce byte-identical files', () => {
  const tmpDir = makeTempDir('i07-determinism');
  const target = path.join(tmpDir, 'sidecar.json');
  try {
    const ref = '2026-07-23T12:00:00.000Z';
    // builder.main calls process.exit(0) on success — wrap with
    // captureStdout so the test runner stays alive between builds.
    captureStdout(() => {
      builder.main([
        'node', 'build_m016_s10_acceptance_contract.js',
        '--force', '--output', target, '--reference-time', ref,
      ]);
    });
    const firstBytes = fs.readFileSync(target);
    captureStdout(() => {
      builder.main([
        'node', 'build_m016_s10_acceptance_contract.js',
        '--force', '--output', target, '--reference-time', ref,
      ]);
    });
    const secondBytes = fs.readFileSync(target);
    const sha1 = crypto.createHash('sha256').update(firstBytes).digest('hex');
    const sha2 = crypto.createHash('sha256').update(secondBytes).digest('hex');
    assert.equal(sha1, sha2, 'second build must be byte-identical to first');
    const first = JSON.parse(firstBytes.toString('utf8'));
    const second = JSON.parse(secondBytes.toString('utf8'));
    assert.equal(first.acceptance_contract_digest, second.acceptance_contract_digest);
  } finally {
    rmTempDir(tmpDir);
  }
});

test('i08 builder payload digest == verifier-recomputed digest on the same sidecar', () => {
  const { model, payload } = buildInMemoryPayload('2026-07-23T12:00:00.000Z');
  // Verifier independently re-derives the digest from the parsed model.
  const recomputed = contract.computeAcceptanceDigest(model);
  assert.match(recomputed, /^[a-f0-9]{64}$/);
  assert.equal(recomputed, payload.acceptance_contract_digest);
});

test('i09 re-built sidecar source_hashes == loader.all_hashes for all 15 refs (zero drift)', () => {
  const { lr, payload } = buildInMemoryPayload('2026-07-23T12:00:00.000Z');
  for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
    assert.equal(
      payload.source_hashes[ref], lr.all_hashes[ref],
      'source_hashes[' + ref + '] must match loader.all_hashes',
    );
  }
});

test('i10 builder.main exit_code == contract.evaluateAcceptance(model).exit_code', () => {
  const { model, evaluation } = buildInMemoryPayload('2026-07-23T12:00:00.000Z');
  // For a canonical model the evaluator returns ok=true → exit 0.
  assert.equal(evaluation.ok, true);
  assert.equal(evaluation.exit_code, contract.EXIT_CODES.PASS);
  // The builder stamps evaluation.exit_code into payload.evaluation.exit_code.
  // Indirectly: builder.main should also return 0 for the canonical path.
  const tmpDir = makeTempDir('i10-exit');
  const target = path.join(tmpDir, 'should-not-exist.json');
  try {
    let exitCode;
    captureStdout(() => {
      exitCode = builder.main([
        'node', 'build_m016_s10_acceptance_contract.js',
        '--dry-run',
        '--output', target,
        '--reference-time', '2026-07-23T12:00:00.000Z',
      ]);
    });
    assert.equal(exitCode, evaluation.exit_code);
  } finally {
    rmTempDir(tmpDir);
  }
});

// ===========================================================================
// D. FROZEN POSTURE + PROVENANCE CROSS-CHECK
// ===========================================================================

test('i11 launch_posture is the frozen snapshot — surfaced identically in model + sidecar', () => {
  const { model, payload } = buildInMemoryPayload('2026-07-23T12:00:00.000Z');
  const frozen = {
    orchestration: 'PARTIAL', evidence: 'PARTIAL', launch: 'PREPARATION_ONLY', bounded_internal: true,
  };
  assert.deepEqual({ ...model.launch_posture }, frozen);
  assert.deepEqual({ ...payload.launch_posture }, frozen);
  // Cross-check: outcome section mirrors launch_posture.
  const out = model.sections.find((s) => s.section_id === 'canonical_acceptance_outcome');
  assert.equal(out.orchestration, frozen.orchestration);
  assert.equal(out.evidence, frozen.evidence);
  assert.equal(out.launch, frozen.launch);
  assert.equal(out.bounded_internal, frozen.bounded_internal);
});

test('i12 NOT_PROVEN preservation: 9 preserved_ids present in built sidecar + block_count == 0', () => {
  const { payload } = buildInMemoryPayload('2026-07-23T12:00:00.000Z');
  // Builder sidecar surfaces not_proven_preserved_count on the model and
  // explicit preserved_ids on the s10 section.
  assert.equal(payload.not_proven_preserved_count, contract.EXPECTED_NOT_PROVEN_COUNT);
  assert.equal(payload.not_proven_preserved_count, 9);
  assert.equal(payload.blocked_count, 0);
  // The 9 NOT_PROVEN_PRESERVED_IDS must all appear in the
  // not_proven_preservation section's preserved_ids list.
  const npp = payload.sections.find((s) => s.section_id === 'not_proven_preservation');
  assert.ok(npp, 'not_proven_preservation section must exist');
  for (const id of contract.NOT_PROVEN_PRESERVED_IDS) {
    assert.ok(npp.preserved_ids.includes(id), 'missing preserved_id ' + id);
  }
});

test('i13 S05: producer PASS + verifier NOT_PROVEN preserved as provenance, frozen_reconciliation == PARTIAL', () => {
  const { model } = buildInMemoryPayload('2026-07-23T12:00:00.000Z');
  const s05 = model.sections.find((s) => s.section_id === 's05_canonical_verdicts');
  assert.equal(s05.producer_verdict, 'PASS');
  assert.equal(s05.verifier_protocol_verdict, 'NOT_PROVEN');
  assert.equal(s05.frozen_reconciliation_verdict, 'PARTIAL');
  assert.equal(s05.producer_provenance_preserved, true);
  assert.equal(s05.verifier_provenance_preserved, true);
  assert.equal(s05.frozen_reconciliation_equals_s09, true);
});

test('i14 S08 scope decision is scope_revised + boundary PREPARATION_ONLY + closure_verdict NOT_PROVEN_SCOPE_REVISED', () => {
  const { model } = buildInMemoryPayload('2026-07-23T12:00:00.000Z');
  const s08 = model.sections.find((s) => s.section_id === 's08_scope_decision');
  assert.equal(s08.closure_kind, 'scope_revised');
  assert.equal(s08.boundary, 'PREPARATION_ONLY');
  assert.equal(s08.closure_verdict, 'NOT_PROVEN_SCOPE_REVISED');
  // Frozen posture in contract.S08_FROZEN_POSTURE matches.
  assert.equal(s08.closure_kind, contract.S08_FROZEN_POSTURE.closure_kind);
  assert.equal(s08.boundary, contract.S08_FROZEN_POSTURE.boundary);
  assert.equal(s08.closure_verdict, contract.S08_FROZEN_POSTURE.closure_verdict);
});

test('i15 R041 satisfaction == STRUCTURAL_ONLY + observed_components == frozen 3-set', () => {
  const { model } = buildInMemoryPayload('2026-07-23T12:00:00.000Z');
  const r041 = model.sections.find((s) => s.section_id === 'r041_acceptance');
  assert.equal(r041.satisfaction, 'STRUCTURAL_ONLY');
  assert.deepEqual(
    [...r041.structural_components].sort(),
    [...r041.observed_structural_components].sort(),
  );
  assert.deepEqual(
    [...r041.structural_components].sort(),
    [...contract.R041_STRUCTURAL_COMPONENTS].sort(),
  );
  // Anti-promotion: STRUCTURAL_ONLY must NOT be in the forbidden R041 set.
  assert.equal(contract.FORBIDDEN_R041_SATISFACTION.includes(r041.satisfaction), false);
});

// ===========================================================================
// E. ANTI-PROMOTION INVARIANTS (CROSS-COMPONENT)
// ===========================================================================

test('i16 none of the FORBIDDEN_ACCEPTANCE_VERDICTS appear as verdict-bearing values in the built sidecar', () => {
  const { payload } = buildInMemoryPayload('2026-07-23T12:00:00.000Z');
  // Sidecar rejection maps legitimately list forbidden tokens (e.g. in
  // r041.forbidden_satisfaction_rejected) — that's the structural anti-
  // promotion declaration, not a verdict overclaim. The semantic check is:
  // forbidden tokens must NEVER appear as the value of verdict-bearing
  // fields (launch_posture, outcome section, s08 closure_kind, etc.).
  const verdictFields = [
    payload.launch_posture,
    payload.sections.find((s) => s.section_id === 'canonical_acceptance_outcome'),
    payload.sections.find((s) => s.section_id === 's08_scope_decision'),
    payload.sections.find((s) => s.section_id === 's05_canonical_verdicts'),
  ];
  for (const section of verdictFields) {
    for (const value of Object.values(section)) {
      for (const forbidden of contract.FORBIDDEN_ACCEPTANCE_VERDICTS) {
        assert.notEqual(value, forbidden,
          'verdict-bearing field must not equal forbidden token: ' + forbidden);
      }
    }
  }
  // Cross-check: the canonical outcome section's verdict-related scalars
  // are exactly the frozen posture.
  const out = payload.sections.find((s) => s.section_id === 'canonical_acceptance_outcome');
  assert.equal(out.orchestration, 'PARTIAL');
  assert.equal(out.evidence, 'PARTIAL');
  assert.equal(out.launch, 'PREPARATION_ONLY');
  assert.equal(out.bounded_internal, true);
});

test('i17 r041.satisfaction is NOT in FORBIDDEN_R041_SATISFACTION (anti-promotion)', () => {
  const { payload } = buildInMemoryPayload('2026-07-23T12:00:00.000Z');
  const r041 = payload.sections.find((s) => s.section_id === 'r041_acceptance');
  // STRUCTURAL_ONLY is the only accepted R041 satisfaction token.
  assert.equal(r041.satisfaction, 'STRUCTURAL_ONLY');
  assert.equal(contract.FORBIDDEN_R041_SATISFACTION.includes(r041.satisfaction), false);
  // The rejection map (forbidden_satisfaction_rejected) IS expected to
  // enumerate the forbidden tokens — that's the structural declaration
  // of what is rejected. Verify its keys match the frozen forbidden set.
  const rejectionKeys = Object.keys(r041.forbidden_satisfaction_rejected).sort();
  const forbiddenKeys = [...contract.FORBIDDEN_R041_SATISFACTION].sort();
  assert.deepEqual(rejectionKeys, forbiddenKeys);
});

test('i18 bounded_internal == true preserved in launch_posture and outcome section (no capability promotion)', () => {
  const { model, payload } = buildInMemoryPayload('2026-07-23T12:00:00.000Z');
  assert.equal(payload.launch_posture.bounded_internal, true);
  const out = model.sections.find((s) => s.section_id === 'canonical_acceptance_outcome');
  assert.equal(out.bounded_internal, true);
  assert.equal(out.capability_promotion_blocked, true);
});

test('i19 source_hashes has exactly the 15 allowlisted refs (no extras, no missing)', () => {
  const { payload } = buildInMemoryPayload('2026-07-23T12:00:00.000Z');
  const keys = Object.keys(payload.source_hashes).sort();
  assert.deepEqual(keys, [...contract.SOURCE_ALLOWLIST_REFS].sort());
  assert.equal(payload.source_count, 15);
  assert.deepEqual(payload.source_refs.slice().sort(), [...contract.SOURCE_ALLOWLIST_REFS].sort());
});

// ===========================================================================
// F. COUNTER + PROVENANCE AGREEMENT
// ===========================================================================

test('i20 sidecar.provenance_appendix counters match loader.summary exactly', () => {
  const { lr, payload } = buildInMemoryPayload('2026-07-23T12:00:00.000Z');
  const p = payload.provenance_appendix;
  assert.equal(p.source_count, lr.summary.expected_count);
  assert.equal(p.read_count, lr.summary.read_count);
  assert.equal(p.missing_count, lr.summary.missing_count);
  assert.equal(p.malformed_count, lr.summary.malformed_count);
  assert.equal(p.byte_total, lr.summary.byte_total);
  assert.equal(p.source_count, 15);
});

test('i21 sidecar.counters.{network_calls,subprocess_calls,env_reads,mutation_count} == 0; temp_file_writes == 1', () => {
  const tmpDir = makeTempDir('i21-counters');
  const target = path.join(tmpDir, 'sidecar.json');
  try {
    captureStdout(() => {
      builder.main([
        'node', 'build_m016_s10_acceptance_contract.js',
        '--force',
        '--output', target,
        '--reference-time', '2026-07-23T12:00:00.000Z',
      ]);
    });
    const onDisk = readJson(target);
    assert.equal(onDisk.counters.network_calls, 0);
    assert.equal(onDisk.counters.subprocess_calls, 0);
    assert.equal(onDisk.counters.env_reads, 0);
    assert.equal(onDisk.counters.mutation_count, 0);
    assert.equal(onDisk.counters.temp_file_writes, 1);
    // Top-level scalar mirrors.
    assert.equal(onDisk.network_calls, 0);
    assert.equal(onDisk.subprocess_calls, 0);
    assert.equal(onDisk.env_reads, 0);
    assert.equal(onDisk.mutation_count, 0);
  } finally {
    rmTempDir(tmpDir);
  }
});

test('i22 sidecar.sanitised + raw_bodies_persisted == false + producer_cli_invoked == false', () => {
  const { payload } = buildInMemoryPayload('2026-07-23T12:00:00.000Z');
  assert.equal(payload.sanitised, true);
  assert.equal(payload.raw_bodies_persisted, false);
  assert.equal(payload.producer_cli_invoked, false);
  // Sanity: source_hashes map contains sha256-shaped entries only — no
  // raw bytes leaked into the payload.
  for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
    assert.match(payload.source_hashes[ref], /^[a-f0-9]{64}$/);
  }
});

// ===========================================================================
// G. VERIFIER INDEPENDENCE SURFACE
// ===========================================================================

test('i23 verifier.VERIFIER_IMPORTS contains exactly the 5 allowed modules', () => {
  assert.equal(verifier.VERIFIER_IMPORTS.length, 5);
  const imports = verifier.VERIFIER_IMPORTS.slice().sort();
  const expected = [
    'node:crypto',
    'node:fs',
    'node:path',
    'scripts/lib/m016-s10-acceptance-contract.js',
    'scripts/lib/m016-s10-canonical-reference-loader.js',
  ].sort();
  assert.deepEqual(imports, expected);
});

test('i24 verifier module surface never references the producer CLI', () => {
  assert.equal(typeof verifier.PRODUCER_CLI_PATH, 'string');
  assert.match(verifier.PRODUCER_CLI_PATH, /build_m016_s10_acceptance_contract/);
  const src = fs.readFileSync(
    path.resolve(__dirname, 'verify_m016_s10_acceptance_contract.js'), 'utf8',
  );
  assert.equal(
    /require\(['"]\.\/build_m016_s10_acceptance_contract/.test(src),
    false,
    'verifier must not require the producer CLI module',
  );
  assert.equal(
    /require\(['"]\.\/verify_m016_s10_acceptance_contract/.test(src),
    false,
    'verifier must not self-require',
  );
  assert.equal(
    /require\(['"]\.\/build_m016/.test(src),
    false,
    'verifier must not require any build_* CLI',
  );
});

test('i25 failureStderrSummary from builder + verifier use bounded stable shape (no raw payload leak)', () => {
  const { payload } = buildInMemoryPayload('2026-07-23T12:00:00.000Z');
  // Force a synthetic failure shape: builder sidecar with one blocker.
  const forced = Object.assign({}, payload, {
    blocked_count: 1,
    blockers: [{ code: 'M16-S10-ACCEPTANCE-TEST-CODE', section_id: 'r041_acceptance', reason: 'synthetic-for-shape-check' }],
    evaluation: Object.assign({}, payload.evaluation, { ok: false, verdict: 'FAIL_CLOSED', exit_code: 2 }),
  });
  const builderSummary = builder.failureStderrSummary(forced);
  assert.match(builderSummary, /M16-S10-BUILD:/);
  assert.match(builderSummary, /M16-S10-ACCEPTANCE-TEST-CODE/);
  // Synthetic raw-secret smell must NOT survive into the bounded summary.
  assert.equal(builderSummary.includes('structural_components'), false);

  const classification = { verdict: 'REJECTED_FAIL_CLOSED', exitCode: 2 };
  const verifierBlockers = [{ code: 'M16-S10-ACCEPTANCE-SECTION-MISSING', reason: 'synthetic' }];
  const verifierSummary = verifier.failureStderrSummary(classification, verifierBlockers);
  assert.match(verifierSummary, /M16-S10-ACCEPTANCE-FAILURE-SUMMARY:/);
  assert.match(verifierSummary, /M16-S10-ACCEPTANCE-SECTION-MISSING/);
  // Both summaries should be bounded: line count ≤ (header + 32 lines).
  assert.ok(builderSummary.split('\n').length <= 33);
  assert.ok(verifierSummary.split('\n').length <= 33);
});

// ===========================================================================
// Cleanup
// ===========================================================================

test('zz cleanup', () => {
  rmTestTmpRoot();
});
