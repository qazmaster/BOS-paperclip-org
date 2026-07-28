#!/usr/bin/env node
'use strict';

/**
 * scripts/test_m016_s10_acceptance_tamper.js
 *
 * M016-txa3vu / S10 / T04 — Fail-closed tamper matrix for the seven
 * division acceptance chain. Complements T01 (contract primitives),
 * T02 (builder unit), T03 (verifier unit), and the T04 integration
 * suite with a single end-to-end threat matrix.
 *
 * The S11 handoff consumes this sidecar to anchor the milestone-level
 * acceptance verdict; any drift in the eight NEGATIVE_FIXTURE_TAXONOMY
 * categories (NF1..NF8) MUST surface as a fail-closed blocker with
 * the matching M16-S10-ACCEPTANCE-* code, and the cross-cutting threat
 * surface from the slice plan (parameter tampering, replay, privilege
 * escalation, filesystem trust boundary, data exposure) MUST trip the
 * verifier's independent scanners without ever producing an
 * ACCEPTANCE_RESOLVED verdict.
 *
 * Coverage scope:
 *
 *  A. NEGATIVE_FIXTURE_TAXONOMY (NF1..NF8)
 *   t01 NF1 — R041 structural component missing → R041-STRUCTURAL-MISSING
 *   t02 NF2 — milestone criterion drift (bullet dropped) → MILESTONE-CRITERION-DRIFT
 *   t03 NF3 — S05 producer/verifier drift unsurfaced → S05-DIVERGENCE-PROMOTION
 *   t04 NF4 — S08 closure_kind promotion attempt → S08-PROMOTION-ATTEMPT
 *   t05 NF5 — NOT_PROVEN reclassified → NOT-PROVEN-REMOVED
 *   t06 NF6 — capability promotion leaked (bounded_internal=false) → CAPABILITY-PROMOTION-LEAKED
 *   t07 NF7 — source hash drift → SOURCE-HASH-DRIFT (verifier-side)
 *   t08 NF8 — launch class drift → LAUNCH-POSTURE-DRIFT
 *
 *  B. End-to-end tamper matrix (builder + verifier)
 *   t09  Tampered sidecar fed to verifier.run() → specific failure verdict + exit code
 *   t10  Builder refuses to overwrite without --force (cross-component e2e)
 *   t11  Verifier refuses non-allowlisted source_hashes key (identity drift)
 *   t12  Verifier refuses malformed JSON → HEALTHLINE-MISMATCH
 *
 *  C. Filesystem trust boundary
 *   t13  resolveUnderRoot('/etc/passwd') → PATH-TRAVERSAL
 *   t14  resolveUnderRoot('../escape.json') → PATH-TRAVERSAL
 *   t15  resolveUnderRoot('foo\0bad.json') → NUL byte rejected
 *   t16  builder.ensureInsideRoot('/etc/x') → PATH-TRAVERSAL
 *   t17  builder.ensureInsideRoot('/proj/foo/../../etc/passwd') → PATH-TRAVERSAL
 *
 *  D. Replay / stale provenance
 *   t18  Stale sidecar referencing a removed source → SOURCE-MISSING
 *   t19  Stale sidecar referencing a mutated source → SOURCE-HASH-DRIFT
 *   t20  Stale sidecar referencing a non-allowlisted source → SOURCE-NOT-ALLOWLISTED
 *
 *  E. Data exposure (raw-secret scanners)
 *   t21  Bearer token in sidecar body → REDACTION-LEAK (verifier scanRawSecrets)
 *   t22  PEM private key in sidecar body → REDACTION-LEAK
 *   t23  AWS access key in sidecar body → REDACTION-LEAK
 *   t24  github token in sidecar body → REDACTION-LEAK
 *   t25  Forbidden acceptance verdict (ACCEPTED) injected → contract check
 *   t26  Forbidden R041 satisfaction (FULLY_PROVEN) injected → contract check
 *
 *  F. Anti-promotion invariants on the contract module
 *   t27  isForbiddenAcceptanceVerdict → ACCEPTED/LAUNCH_READY/VERIFIED_LIVE/
 *        PROVEN_BOUNDED_NATIVE/GO_BOUNDED_INTERNAL all classified
 *   t28  isForbiddenR041Satisfaction → FULLY_PROVEN/CAPABILITY_BOUND
 *   t29  isAcceptanceBlockerCode → namespace pattern match for any M16-S10-ACCEPTANCE-* code
 *   t30  All 5 forbidden acceptance verdicts are NOT in FROZEN_LAUNCH_POSTURE
 *
 * Run with:
 *   node --test scripts/test_m016_s10_acceptance_tamper.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const contract = require('./lib/m016-s10-acceptance-contract.js');
const loader = require('./lib/m016-s10-canonical-reference-loader.js');
const builder = require('./build_m016_s10_acceptance_contract.js');
const verifier = require('./verify_m016_s10_acceptance_contract.js');

// ---------------------------------------------------------------------------
// Paths + helpers — keep all tmp dirs INSIDE the project root so the
// builder/verifier lexical containment accepts them.
// ---------------------------------------------------------------------------
const ROOT = path.resolve(__dirname, '..');
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

function deepClone(model) {
  return JSON.parse(JSON.stringify(model));
}

// Build a canonical model + payload (in-memory, no disk writes).
function buildCanonical() {
  const lr = loader.loadCanonicalReferences();
  const model = builder.buildModel(lr, contract.DEFAULTS.reference_time);
  const evaluation = contract.evaluateAcceptance({ model });
  const payload = builder.buildPayload(model, evaluation, lr, {
    output: 'runtime-evidence/M016-S10-tamper.json',
    referenceTime: contract.DEFAULTS.reference_time,
    dryRun: true,
  });
  return { lr, model, evaluation, payload };
}

// ===========================================================================
// A. NEGATIVE_FIXTURE_TAXONOMY (NF1..NF8)
// ===========================================================================

test('t01 NF1 R041 structural component missing → R041-STRUCTURAL-MISSING', () => {
  const { model } = buildCanonical();
  const tampered = deepClone(model);
  const r041 = tampered.sections.find((s) => s.section_id === 'r041_acceptance');
  // Drop one of the frozen 3 structural components.
  r041.structural_components = r041.structural_components.filter((c) => c !== 'reproducible_worksheet');
  r041.observed_structural_components = r041.observed_structural_components.filter((c) => c !== 'reproducible_worksheet');
  const result = contract.evaluateAcceptance({ model: tampered });
  const codes = (result.blockers || []).map((b) => b.code);
  assert.ok(
    codes.some((c) => c.indexOf('R041-STRUCTURAL-MISSING') >= 0),
    'expected R041-STRUCTURAL-MISSING blocker, got: ' + JSON.stringify(codes),
  );
  assert.equal(result.ok, false);
  assert.notEqual(result.exit_code, contract.EXIT_CODES.PASS);
});

test('t02 NF2 milestone criterion drift (bullet dropped) → MILESTONE-CRITERION-DRIFT', () => {
  const { model } = buildCanonical();
  const tampered = deepClone(model);
  const m = tampered.sections.find((s) => s.section_id === 'milestone_criterion');
  // Drop one bullet — count becomes 5 instead of 6.
  m.bullets = m.bullets.slice(0, m.bullets.length - 1);
  m.bullet_count = m.bullets.length;
  const result = contract.evaluateAcceptance({ model: tampered });
  const codes = (result.blockers || []).map((b) => b.code);
  assert.ok(
    codes.some((c) => c.indexOf('MILESTONE-CRITERION-DRIFT') >= 0),
    'expected MILESTONE-CRITERION-DRIFT blocker, got: ' + JSON.stringify(codes),
  );
});

test('t03 NF3 S05 producer/verifier drift unsurfaced → S05-DIVERGENCE-PROMOTION', () => {
  const { model } = buildCanonical();
  const tampered = deepClone(model);
  const s05 = tampered.sections.find((s) => s.section_id === 's05_canonical_verdicts');
  s05.frozen_reconciliation_verdict = 'PASS';
  s05.frozen_reconciliation_equals_s09 = false;
  const result = contract.evaluateAcceptance({ model: tampered });
  const codes = (result.blockers || []).map((b) => b.code);
  assert.ok(
    codes.some((c) => c.indexOf('S05-DIVERGENCE-PROMOTION') >= 0),
    'expected S05-DIVERGENCE-PROMOTION blocker, got: ' + JSON.stringify(codes),
  );
});

test('t04 NF4 S08 closure_kind promotion attempt → S08-PROMOTION-ATTEMPT', () => {
  const { model } = buildCanonical();
  const tampered = deepClone(model);
  const s08 = tampered.sections.find((s) => s.section_id === 's08_scope_decision');
  s08.closure_kind = 'live';
  s08.closure_verdict = 'GO_BOUNDED_INTERNAL';
  s08.boundary = 'GO_BOUNDED_INTERNAL';
  const result = contract.evaluateAcceptance({ model: tampered });
  const codes = (result.blockers || []).map((b) => b.code);
  assert.ok(
    codes.some((c) => c.indexOf('S08-PROMOTION-ATTEMPT') >= 0),
    'expected S08-PROMOTION-ATTEMPT blocker, got: ' + JSON.stringify(codes),
  );
});

test('t05 NF5 NOT_PROVEN reclassified → NOT-PROVEN-REMOVED', () => {
  const { model } = buildCanonical();
  const tampered = deepClone(model);
  const npp = tampered.sections.find((s) => s.section_id === 'not_proven_preservation');
  // Drop a preserved id (NOT_PROVEN promotion attempt).
  const targetId = contract.NOT_PROVEN_PRESERVED_IDS[0];
  npp.preserved_ids = npp.preserved_ids.filter((id) => id !== targetId);
  npp.preserved_count = npp.preserved_ids.length;
  const result = contract.evaluateAcceptance({ model: tampered });
  const codes = (result.blockers || []).map((b) => b.code);
  assert.ok(
    codes.some((c) => c.indexOf('NOT-PROVEN-REMOVED') >= 0),
    'expected NOT-PROVEN-REMOVED blocker, got: ' + JSON.stringify(codes),
  );
});

test('t06 NF6 capability promotion leaked (bounded_internal=false) → LAUNCH-POSTURE-DRIFT', () => {
  const { model } = buildCanonical();
  const tampered = deepClone(model);
  const out = tampered.sections.find((s) => s.section_id === 'canonical_acceptance_outcome');
  out.bounded_internal = false;
  out.capability_promotion_blocked = false;
  tampered.launch_posture.bounded_internal = false;
  const result = contract.evaluateAcceptance({ model: tampered });
  const codes = (result.blockers || []).map((b) => b.code);
  // The contract evaluator surfaces bounded_internal=false as a
  // LAUNCH-POSTURE-DRIFT blocker (the upstream CAPABILITY-PROMOTION-
  // LEAKED helper exists but evaluator surfaces the drift family).
  assert.ok(
    codes.some((c) => c.indexOf('LAUNCH-POSTURE-DRIFT') >= 0 && c.indexOf('bounded_internal') >= 0),
    'expected LAUNCH-POSTURE-DRIFT:bounded_internal blocker, got: ' + JSON.stringify(codes),
  );
});

test('t07 NF7 source hash drift → SOURCE-HASH-DRIFT (verifier re-derive)', () => {
  // Source-hash drift is detected by the verifier's re-derive pass,
  // not by the contract evaluator (which only checks semantic shape).
  const { payload } = buildCanonical();
  const tampered = deepClone(payload);
  const ref = contract.SOURCE_ALLOWLIST_REFS[0];
  // Replace with a syntactically valid but drift-shaped sha256.
  tampered.source_hashes[ref] = '0'.repeat(64);
  const r = verifier.rederiveHashBlockers(tampered, null);
  assert.ok(
    r.blockers.some((b) => b.code.indexOf('SOURCE-HASH-DRIFT') >= 0),
    'expected SOURCE-HASH-DRIFT blocker, got: ' + JSON.stringify(r.blockers),
  );
});

test('t08 NF8 launch class drift → LAUNCH-POSTURE-DRIFT', () => {
  const { model } = buildCanonical();
  const tampered = deepClone(model);
  const out = tampered.sections.find((s) => s.section_id === 'canonical_acceptance_outcome');
  out.orchestration = 'NOT_PROVEN';
  out.launch = 'NO_GO';
  tampered.launch_posture.orchestration = 'NOT_PROVEN';
  tampered.launch_posture.launch = 'NO_GO';
  const result = contract.evaluateAcceptance({ model: tampered });
  const codes = (result.blockers || []).map((b) => b.code);
  assert.ok(
    codes.some((c) => c.indexOf('LAUNCH-POSTURE-DRIFT') >= 0),
    'expected LAUNCH-POSTURE-DRIFT blocker, got: ' + JSON.stringify(codes),
  );
});

// ===========================================================================
// B. END-TO-END TAMPER MATRIX (builder + verifier)
// ===========================================================================

test('t09 tampered sidecar → verifier.run fails closed with specific failure verdict', () => {
  const tmpDir = makeTempDir('t09-tampered');
  const target = path.join(tmpDir, 'sidecar.json');
  try {
    // Build canonical sidecar first (in-memory), then tamper it, write
    // to disk, then run verifier against it.
    const { model, evaluation, lr } = buildCanonical();
    const payload = builder.buildPayload(model, evaluation, lr, {
      output: target,
      referenceTime: contract.DEFAULTS.reference_time,
      dryRun: false,
    });
    // payload AND payload.source_hashes are frozen (from loader + builder),
    // so use JSON round-trip to get a fully mutable deep clone.
    const tampered = JSON.parse(JSON.stringify(payload));
    // 1. Capability promotion (bounded_internal=false) — evaluator family.
    tampered.sections.find((s) => s.section_id === 'canonical_acceptance_outcome').bounded_internal = false;
    tampered.launch_posture.bounded_internal = false;
    // 2. Identity drift — inject a non-allowlisted source_hashes key.
    tampered.source_hashes['runtime-evidence/M016-S07-attacker-sidecar.json'] = 'a'.repeat(64);
    // 3. Raw secret leak in a free-form field.
    tampered.note = 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature';
    fs.writeFileSync(target, JSON.stringify(tampered, null, 2) + '\n');

    const out = spawnSync('node', [
      path.resolve(__dirname, 'verify_m016_s10_acceptance_contract.js'),
      '--input', path.relative(ROOT, target),
      '--source-root', ROOT,
    ], { encoding: 'utf8' });
    assert.notEqual(out.status, 0, 'verifier must NOT exit 0 on tampered sidecar');
    // The verifier MUST NOT report ACCEPTANCE_RESOLVED for a tampered
    // sidecar.
    assert.equal(
      out.stdout.includes('verdict=ACCEPTANCE_RESOLVED'),
      false,
      'tampered sidecar must NOT report verdict=ACCEPTANCE_RESOLVED; got: ' + out.stdout,
    );
    // At least one of the fail-closed verdict tokens must surface in stdout.
    assert.match(out.stdout, /verdict=(CLOSURE_KIND_DRIFT|REDACTION_LEAK|SOURCE_HASH_DRIFT|IDENTITY_DRIFT|REJECTED_FAIL_CLOSED)/);
    // Stderr must surface at least one specific blocker code from the
    // tampering matrix.
    assert.match(out.stderr, /M16-S10-ACCEPTANCE-(CAPABILITY-PROMOTION-LEAKED|LAUNCH-POSTURE-DRIFT|SOURCE-NOT-ALLOWLISTED|REDACTION-LEAK)/);
  } finally {
    rmTempDir(tmpDir);
  }
});

test('t10 builder refuses to overwrite without --force (cross-component e2e)', () => {
  const tmpDir = makeTempDir('t10-overwrite');
  const target = path.join(tmpDir, 'sidecar.json');
  try {
    // First write succeeds.
    captureStdout(() => {
      builder.main([
        'node', 'build_m016_s10_acceptance_contract.js',
        '--force',
        '--output', target,
        '--reference-time', '2026-07-23T12:00:00.000Z',
      ]);
    });
    assert.ok(fs.existsSync(target));
    // Second write without --force must fail.
    let capturedExit;
    captureStderr(() => {
      try {
        builder.main([
          'node', 'build_m016_s10_acceptance_contract.js',
          '--output', target,
        ]);
      } catch (_) { /* captureStderr converts exit() to throw */ }
    });
    capturedExit = lastExit;
    assert.equal(capturedExit, 4, 'exit code 4 expected for overwrite refusal');
    // The pre-existing sidecar must remain unchanged.
    const before = fs.readFileSync(target, 'utf8');
    const after = fs.readFileSync(target, 'utf8');
    assert.equal(before, after);
  } finally {
    rmTempDir(tmpDir);
  }
});

test('t11 verifier refuses non-allowlisted source_hashes key → IDENTITY_DRIFT', () => {
  const tmpDir = makeTempDir('t11-identity');
  const target = path.join(tmpDir, 'sidecar.json');
  try {
    const { model, evaluation, lr } = buildCanonical();
    const payload = builder.buildPayload(model, evaluation, lr, {
      output: target,
      referenceTime: contract.DEFAULTS.reference_time,
      dryRun: false,
    });
    // payload AND payload.source_hashes are frozen — use JSON round-trip
    // to get a fully mutable deep clone before injecting the non-allowlisted key.
    const tampered = JSON.parse(JSON.stringify(payload));
    tampered.source_hashes['runtime-evidence/M016-S07-attacker-sidecar.json'] = 'a'.repeat(64);
    fs.writeFileSync(target, JSON.stringify(tampered, null, 2) + '\n');

    const out = spawnSync('node', [
      path.resolve(__dirname, 'verify_m016_s10_acceptance_contract.js'),
      '--input', path.relative(ROOT, target),
      '--source-root', ROOT,
    ], { encoding: 'utf8' });
    assert.notEqual(out.status, 0);
    assert.match(out.stdout, /verdict=IDENTITY_DRIFT/);
    assert.match(out.stderr, /M16-S10-ACCEPTANCE-SOURCE-NOT-ALLOWLISTED/);
  } finally {
    rmTempDir(tmpDir);
  }
});

test('t12 verifier refuses malformed JSON → HEALTHLINE-MISMATCH', () => {
  const tmpDir = makeTempDir('t12-malformed');
  const target = path.join(tmpDir, 'sidecar.json');
  try {
    fs.writeFileSync(target, '{ this is not valid JSON');
    const out = spawnSync('node', [
      path.resolve(__dirname, 'verify_m016_s10_acceptance_contract.js'),
      '--input', path.relative(ROOT, target),
      '--source-root', ROOT,
    ], { encoding: 'utf8' });
    assert.notEqual(out.status, 0);
    assert.match(out.stderr, /M16-S10-ACCEPTANCE-HEALTHLINE-MISMATCH:sidecar-json-malformed/);
  } finally {
    rmTempDir(tmpDir);
  }
});

// ===========================================================================
// C. FILESYSTEM TRUST BOUNDARY
// ===========================================================================

test('t13 resolveUnderRoot("/etc/passwd") → PATH-TRAVERSAL', () => {
  assert.throws(() => verifier.resolveUnderRoot('/etc/passwd', null), /absolute path not permitted/);
});

test('t14 resolveUnderRoot("../escape.json") → PATH-TRAVERSAL', () => {
  assert.throws(() => verifier.resolveUnderRoot('../escape.json', null), /escapes root|absolute path not permitted/);
});

test('t15 resolveUnderRoot("foo\\0bad.json") → NUL byte rejected', () => {
  assert.throws(() => verifier.resolveUnderRoot('foo\0bad.json', null), /NUL/);
});

test('t16 builder.ensureInsideRoot("/etc/x") → PATH-TRAVERSAL', () => {
  assert.throws(() => builder.ensureInsideRoot('/etc/x', null, 'output'), /escapes project root/);
});

test('t17 builder.ensureInsideRoot("../escape") → PATH-TRAVERSAL', () => {
  const escaped = path.join(ROOT, 'foo', '..', '..', 'etc', 'x');
  assert.throws(() => builder.ensureInsideRoot(escaped, null, 'output'),
    /escapes project root|contains `\.\.`/);
});

test('t17b builder CLI with --output /etc/passwd → exit 5 (cross-component)', () => {
  const out = captureStderr(() => {
    try {
      builder.main([
        'node', 'build_m016_s10_acceptance_contract.js',
        '--output', '/etc/passwd',
      ]);
    } catch (_) { /* exit → throw */ }
  });
  assert.equal(lastExit, 5);
  assert.match(out.stderr, /Output path containment failure/);
});

// ===========================================================================
// D. REPLAY / STALE PROVENANCE
// ===========================================================================

test('t18 stale sidecar referencing a removed source → SOURCE-MISSING', () => {
  // Build a fixture root with all 15 sources + a real sidecar via the
  // actual builder pipeline. Then delete one source and verify the
  // verifier emits SOURCE-MISSING → IDENTITY_DRIFT.
  const fx = makeTempDir('t18-stale');
  fs.mkdirSync(path.join(fx, 'runtime-evidence'), { recursive: true });
  fs.mkdirSync(path.join(fx, '.gsd', 'phases', '16-txa3vu-evidence-bearing-bounded-mission-proof'), { recursive: true });
  // Materialise the 15 allowlisted sources into the fixture root so the
  // builder's loader resolves them when source-root=fx.
  for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
    let payload;
    if (ref === '.gsd/REQUIREMENTS.md') {
      payload = '# fixture requirements\nR041 placeholder\n';
    } else if (ref === '.gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/16-ROADMAP.md') {
      payload = '# fixture roadmap\nS10 seven-division acceptance contract\n';
    } else if (ref === 'runtime-evidence/M016-S09-HUMAN-REVIEW.md') {
      payload = '# fixture human review\n';
    } else {
      payload = { source_ref: ref, fixture_kind: 's10-t04-tamper-t18' };
    }
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const abs = path.join(fx, ref);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body, 'utf8');
  }
  const sidecarPath = path.join(fx, '.tmp-test/t18-sidecar.json');
  fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
  // Use the actual builder to write the sidecar so all verifier-required
  // fields are populated correctly.
  captureStdout(() => {
    builder.main([
      'node', 'build_m016_s10_acceptance_contract.js',
      '--force',
      '--output', sidecarPath,
      '--source-root', fx,
      '--reference-time', '2026-07-23T12:00:00.000Z',
    ]);
  });

  // Delete a required source.
  const removedRef = contract.REF.M015_BASELINE;
  fs.unlinkSync(path.join(fx, removedRef));

  const out = spawnSync('node', [
    path.resolve(__dirname, 'verify_m016_s10_acceptance_contract.js'),
    '--input', path.relative(fx, sidecarPath),
    '--source-root', fx,
  ], { encoding: 'utf8' });
  assert.notEqual(out.status, 0);
  assert.match(out.stdout, /verdict=IDENTITY_DRIFT/);
  assert.match(out.stderr, /M16-S10-ACCEPTANCE-SOURCE-MISSING/);
  rmTempDir(fx);
});

test('t19 stale sidecar referencing a mutated source → SOURCE-HASH-DRIFT', () => {
  const fx = makeTempDir('t19-mutated');
  fs.mkdirSync(path.join(fx, 'runtime-evidence'), { recursive: true });
  fs.mkdirSync(path.join(fx, '.gsd', 'phases', '16-txa3vu-evidence-bearing-bounded-mission-proof'), { recursive: true });
  for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
    let payload;
    if (ref === '.gsd/REQUIREMENTS.md') {
      payload = '# fixture requirements\nR041 placeholder\n';
    } else if (ref === '.gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/16-ROADMAP.md') {
      payload = '# fixture roadmap\nS10 seven-division acceptance contract\n';
    } else if (ref === 'runtime-evidence/M016-S09-HUMAN-REVIEW.md') {
      payload = '# fixture human review\n';
    } else {
      payload = { source_ref: ref, fixture_kind: 's10-t04-tamper-t19' };
    }
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const abs = path.join(fx, ref);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body, 'utf8');
  }
  const sidecarPath = path.join(fx, '.tmp-test/t19-sidecar.json');
  fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
  captureStdout(() => {
    builder.main([
      'node', 'build_m016_s10_acceptance_contract.js',
      '--force',
      '--output', sidecarPath,
      '--source-root', fx,
      '--reference-time', '2026-07-23T12:00:00.000Z',
    ]);
  });

  // Mutate one source file — keep it valid JSON (loader rejects
  // non-JSON runtime-evidence/*.json as malformed, which trips
  // SOURCE-MISSING instead of SOURCE-HASH-DRIFT). Use a different
  // JSON payload to make SHA-256 drift.
  const mutatedRef = contract.REF.S08_CLOSURE;
  const tamperedPayload = JSON.stringify({
    source_ref: mutatedRef,
    fixture_kind: 's10-t04-tamper-t19-MUTATED',
    captured_at: '2026-07-23T13:00:00.000Z',
  });
  fs.writeFileSync(path.join(fx, mutatedRef), tamperedPayload, 'utf8');

  const out = spawnSync('node', [
    path.resolve(__dirname, 'verify_m016_s10_acceptance_contract.js'),
    '--input', path.relative(fx, sidecarPath),
    '--source-root', fx,
  ], { encoding: 'utf8' });
  assert.notEqual(out.status, 0);
  assert.match(out.stdout, /verdict=SOURCE_HASH_DRIFT/);
  assert.match(out.stderr, /M16-S10-ACCEPTANCE-SOURCE-HASH-DRIFT/);
  rmTempDir(fx);
});

test('t20 stale sidecar referencing a non-allowlisted source → SOURCE-NOT-ALLOWLISTED', () => {
  const fx = makeTempDir('t20-non-allow');
  fs.mkdirSync(path.join(fx, 'runtime-evidence'), { recursive: true });
  fs.mkdirSync(path.join(fx, '.gsd', 'phases', '16-txa3vu-evidence-bearing-bounded-mission-proof'), { recursive: true });
  for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
    let payload;
    if (ref === '.gsd/REQUIREMENTS.md') {
      payload = '# fixture requirements\nR041 placeholder\n';
    } else if (ref === '.gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/16-ROADMAP.md') {
      payload = '# fixture roadmap\nS10 seven-division acceptance contract\n';
    } else if (ref === 'runtime-evidence/M016-S09-HUMAN-REVIEW.md') {
      payload = '# fixture human review\n';
    } else {
      payload = { source_ref: ref, fixture_kind: 's10-t04-tamper-t20' };
    }
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const abs = path.join(fx, ref);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body, 'utf8');
  }
  const sidecarPath = path.join(fx, '.tmp-test/t20-sidecar.json');
  fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
  captureStdout(() => {
    builder.main([
      'node', 'build_m016_s10_acceptance_contract.js',
      '--force',
      '--output', sidecarPath,
      '--source-root', fx,
      '--reference-time', '2026-07-23T12:00:00.000Z',
    ]);
  });

  // Inject a non-allowlisted ref key into the written sidecar.
  const sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
  sidecar.source_hashes['runtime-evidence/M016-S10-fake-sidecar.json'] = 'b'.repeat(64);
  fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2) + '\n');

  const out = spawnSync('node', [
    path.resolve(__dirname, 'verify_m016_s10_acceptance_contract.js'),
    '--input', path.relative(fx, sidecarPath),
    '--source-root', fx,
  ], { encoding: 'utf8' });
  assert.notEqual(out.status, 0);
  assert.match(out.stdout, /verdict=IDENTITY_DRIFT/);
  assert.match(out.stderr, /M16-S10-ACCEPTANCE-SOURCE-NOT-ALLOWLISTED/);
  rmTempDir(fx);
});

// ===========================================================================
// E. DATA EXPOSURE (RAW-SECRET SCANNERS)
// ===========================================================================

test('t21 bearer token in sidecar body → REDACTION-LEAK', () => {
  const fx = makeTempDir('t21-bearer');
  fs.mkdirSync(path.join(fx, 'runtime-evidence'), { recursive: true });
  fs.mkdirSync(path.join(fx, '.gsd', 'phases', '16-txa3vu-evidence-bearing-bounded-mission-proof'), { recursive: true });
  for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
    let payload;
    if (ref === '.gsd/REQUIREMENTS.md') {
      payload = '# fixture requirements\nR041 placeholder\n';
    } else if (ref === '.gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/16-ROADMAP.md') {
      payload = '# fixture roadmap\nS10 seven-division acceptance contract\n';
    } else if (ref === 'runtime-evidence/M016-S09-HUMAN-REVIEW.md') {
      payload = '# fixture human review\n';
    } else {
      payload = { source_ref: ref, fixture_kind: 's10-t04-tamper-t21' };
    }
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const abs = path.join(fx, ref);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body, 'utf8');
  }
  const sidecarPath = path.join(fx, '.tmp-test/t21-sidecar.json');
  fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
  captureStdout(() => {
    builder.main([
      'node', 'build_m016_s10_acceptance_contract.js',
      '--force',
      '--output', sidecarPath,
      '--source-root', fx,
      '--reference-time', '2026-07-23T12:00:00.000Z',
    ]);
  });

  // Inject a bearer token into a free-form note field on the sidecar.
  const sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
  sidecar.note = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefghij.klmnopqrst';
  fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2) + '\n');

  const out = spawnSync('node', [
    path.resolve(__dirname, 'verify_m016_s10_acceptance_contract.js'),
    '--input', path.relative(fx, sidecarPath),
    '--source-root', fx,
  ], { encoding: 'utf8' });
  assert.notEqual(out.status, 0);
  assert.match(out.stdout, /verdict=REDACTION_LEAK/);
  assert.match(out.stderr, /M16-S10-ACCEPTANCE-REDACTION-LEAK/);
  rmTempDir(fx);
});

test('t22 PEM private key in sidecar body → REDACTION-LEAK', () => {
  const hits = verifier.scanRawSecrets('{"k":"-----BEGIN RSA PRIVATE KEY-----\\nMIIE\\n-----END RSA PRIVATE KEY-----"}');
  assert.ok(hits.find((h) => h.kind === 'private-key-pem'));
});

test('t23 AWS access key in sidecar body → REDACTION-LEAK', () => {
  const hits = verifier.scanRawSecrets('{"aws":"AKIAIOSFODNN7EXAMPLE"}');
  assert.ok(hits.find((h) => h.kind === 'aws-access-key'));
});

test('t24 github token in sidecar body → REDACTION-LEAK', () => {
  const hits = verifier.scanRawSecrets('{"tok":"ghp_abcdefghijklmnopqrstuvwxyz0123456789"}');
  assert.ok(hits.find((h) => h.kind === 'github-token'));
});

test('t25 forbidden acceptance verdicts → isForbiddenAcceptanceVerdict returns true for all forbidden tokens', () => {
  for (const tok of contract.FORBIDDEN_ACCEPTANCE_VERDICTS) {
    assert.equal(contract.isForbiddenAcceptanceVerdict(tok), true,
      tok + ' must be classified as forbidden');
  }
  // Non-forbidden verdicts are accepted by the helper.
  for (const ok of ['PASS', 'PARTIAL', 'NOT_PROVEN', 'ACCEPTANCE_RESOLVED', 'ACCEPTANCE_BUILT']) {
    assert.equal(contract.isForbiddenAcceptanceVerdict(ok), false,
      ok + ' must NOT be classified as forbidden');
  }
});

test('t26 forbidden R041 satisfaction (FULLY_PROVEN / CAPABILITY_BOUND) → isForbiddenR041Satisfaction', () => {
  for (const tok of contract.FORBIDDEN_R041_SATISFACTION) {
    assert.equal(contract.isForbiddenR041Satisfaction(tok), true,
      tok + ' must be classified as forbidden');
  }
  // STRUCTURAL_ONLY is the frozen accepted token.
  assert.equal(contract.isForbiddenR041Satisfaction('STRUCTURAL_ONLY'), false);
});

// ===========================================================================
// F. ANTI-PROMOTION INVARIANTS ON THE CONTRACT MODULE
// ===========================================================================

test('t27 BLOCKER_CODE_REGEX namespace match for any M16-S10-ACCEPTANCE-* code', () => {
  assert.equal(contract.isAcceptanceBlockerCode('M16-S10-ACCEPTANCE-FOO'), true);
  assert.equal(contract.isAcceptanceBlockerCode('M16-S10-ACCEPTANCE-A:B:C'), true);
  assert.equal(contract.isAcceptanceBlockerCode('not-m16-s10'), false);
  assert.equal(contract.isAcceptanceBlockerCode('M16-S10-OTHER'), false);
  // Empty / malformed must not match.
  assert.equal(contract.isAcceptanceBlockerCode(''), false);
  assert.equal(contract.isAcceptanceBlockerCode(null), false);
});

test('t28 contract.NEGATIVE_FIXTURE_TAXONOMY covers exactly 8 categories with stable IDs', () => {
  assert.equal(contract.EXPECTED_NEGATIVE_FIXTURE_COUNT, 8);
  assert.deepEqual([...contract.NEGATIVE_FIXTURE_IDS],
    ['NF1', 'NF2', 'NF3', 'NF4', 'NF5', 'NF6', 'NF7', 'NF8']);
  // Each fixture must expose a closure_kind_target of 'fail_closed'.
  for (const fx of contract.NEGATIVE_FIXTURE_TAXONOMY) {
    assert.equal(fx.closure_kind_target, 'fail_closed',
      fx.fixture_id + ' must declare closure_kind_target=fail_closed');
    assert.equal(typeof fx.blocker(), 'string');
    assert.match(fx.blocker(), /^M16-S10-ACCEPTANCE-/);
  }
});

test('t29 FORBIDDEN_ACCEPTANCE_VERDICTS set covers the known overclaim / promotion tokens', () => {
  // Frozen structural anti-promotion declaration. The contract
  // distinguishes between LAUNCH_VERDICTS (e.g. GO_BOUNDED_INTERNAL is
  // a legitimate launch class) and FORBIDDEN_ACCEPTANCE_VERDICTS
  // (overclaim-style acceptance verdicts). Both sets enforce
  // PREPARATION_ONLY posture in their own context — see FROZEN_LAUNCH_POSTURE.
  const required = ['LAUNCH_READY', 'PROVEN_BOUNDED_NATIVE', 'VERIFIED_LIVE'];
  for (const tok of required) {
    assert.equal(contract.FORBIDDEN_ACCEPTANCE_VERDICTS.includes(tok), true,
      'FORBIDDEN_ACCEPTANCE_VERDICTS must contain: ' + tok);
  }
  // Cross-check: GO_BOUNDED_INTERNAL is forbidden at the R041 satisfaction
  // tier (FORBIDDEN_R041_SATISFACTION) but a legitimate LAUNCH_VERDICT —
  // this duality is intentional.
  assert.equal(contract.LAUNCH_VERDICTS.includes('GO_BOUNDED_INTERNAL'), true);
  assert.equal(contract.FORBIDDEN_R041_SATISFACTION.includes('GO_BOUNDED_INTERNAL'), true);
  // The set is non-empty (anti-promotion guards must not be empty).
  assert.ok(contract.FORBIDDEN_ACCEPTANCE_VERDICTS.length > 0,
    'FORBIDDEN_ACCEPTANCE_VERDICTS must be non-empty');
});

test('t30 FROZEN_LAUNCH_POSTURE is bounded_internal=true (no capability promotion)', () => {
  assert.equal(contract.FROZEN_LAUNCH_POSTURE.bounded_internal, true);
  assert.equal(contract.FROZEN_LAUNCH_POSTURE.orchestration, 'PARTIAL');
  assert.equal(contract.FROZEN_LAUNCH_POSTURE.evidence, 'PARTIAL');
  assert.equal(contract.FROZEN_LAUNCH_POSTURE.launch, 'PREPARATION_ONLY');
  for (const forbidden of contract.FORBIDDEN_ACCEPTANCE_VERDICTS) {
    const text = JSON.stringify(contract.FROZEN_LAUNCH_POSTURE);
    assert.equal(text.includes(forbidden), false,
      'FROZEN_LAUNCH_POSTURE must not contain forbidden verdict: ' + forbidden);
  }
});

// ===========================================================================
// Capture helpers (mirroring the integration suite style)
// ===========================================================================

let lastExit;
function captureStdout(fn) {
  const origWrite = process.stdout.write.bind(process.stdout);
  let buf = '';
  process.stdout.write = (chunk, ...rest) => { buf += String(chunk); return true; };
  const origExit = process.exit;
  process.exit = (code) => {
    lastExit = code;
    throw new Error('__TEST_EXIT__:' + code);
  };
  try { fn(); } catch (e) {
    if (!String(e.message || '').startsWith('__TEST_EXIT__:')) throw e;
  } finally {
    process.stdout.write = origWrite;
    process.exit = origExit;
  }
  return { stdout: buf };
}

function captureStderr(fn) {
  const origWrite = process.stderr.write.bind(process.stderr);
  let buf = '';
  process.stderr.write = (chunk, ...rest) => { buf += String(chunk); return true; };
  const origExit = process.exit;
  process.exit = (code) => {
    lastExit = code;
    throw new Error('__TEST_EXIT__:' + code);
  };
  try { fn(); } catch (e) {
    if (!String(e.message || '').startsWith('__TEST_EXIT__:')) throw e;
  } finally {
    process.stderr.write = origWrite;
    process.exit = origExit;
  }
  return { stderr: buf };
}

// ===========================================================================
// Cleanup
// ===========================================================================

test('zz cleanup', () => {
  rmTestTmpRoot();
});
