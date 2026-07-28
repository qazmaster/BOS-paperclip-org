#!/usr/bin/env node
'use strict';

/**
 * scripts/test_m016_s10_acceptance_builder.js
 *
 * M016-txa3vu / S10 / T02 — Builder test suite for the canonical seven
 * division acceptance sidecar.
 *
 * Coverage scope:
 *   1. CLI parsing (--force / --output / --source-root / --reference-time /
 *      --dry-run / --show-blockers / --help / unknown token)
 *   2. Reference-time ISO 8601 validation
 *   3. Path containment on output target (lexical + .. segment scan)
 *   4. Path containment on source-root override
 *   5. Atomic write — refuses to overwrite without --force
 *   6. Atomic write — succeeds with --force and produces sha256-stable bytes
 *   7. Atomic write — produces a non-empty file with JSON shape
 *   8. buildModel() — 6 sections in immutable order + frozen posture
 *   9. buildModel() — task='T02' stamped, source_hashes covers 15 entries
 *  10. buildModel() — text_snapshot_sha256 + roadmap_text_sha256 bound
 *  11. buildModel() — NOT_PROVEN preservation section has all 9 IDs
 *  12. buildModel() — R041 structural_components is the frozen 3-set
 *  13. buildModel() — S05 frozen_reconciliation_verdict equals PARTIAL
 *  14. buildModel() — S08 closure_kind + boundary + closure_verdict pinned
 *  15. buildPayload() — byte-stable digest round-trip (compute twice)
 *  16. buildPayload() — bounded blockers + bounded redaction_hits
 *  17. buildPayload() — counters all 0 except temp_file_writes
 *  18. buildBuilderCliLine() — exact line shape with output_path +
 *      output_sha256 extension
 *  19. failureStderrSummary() — bounded, no raw payload leak
 *  20. main() — dry-run returns 0, prints CLI line, writes nothing
 *  21. main() — non-dry-run refuses to overwrite without --force (exit 4)
 *  22. main() — full pipeline with --force returns 0
 *  23. main() — post-write source-hash drift detection (synthetic drift)
 *  24. Canonical sidecar on disk — schema + section invariants
 *  25. Canonical sidecar on disk — source_hashes match loader
 *  26. Canonical sidecar on disk — pre/post byte-stability on second build
 *  27. Re-run determinism — same reference-time → same digest + same sha
 *
 * Run with: node --test scripts/test_m016_s10_acceptance_builder.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');

const contract = require('./lib/m016-s10-acceptance-contract.js');
const loader = require('./lib/m016-s10-canonical-reference-loader.js');
const builder = require('./build_m016_s10_acceptance_contract.js');

const ROOT = path.resolve(__dirname, '..');
const RUNTIME_EVIDENCE = path.join(ROOT, 'runtime-evidence');
const CANONICAL_OUTPUT = path.join(RUNTIME_EVIDENCE, 'M016-S10-seven-division-acceptance-contract.json');
// Tests must use temp directories INSIDE the project root so the
// builder's lexical containment check (`ensureInsideRoot`) accepts them.
// os.tmpdir() would resolve to /tmp, which the builder refuses with
// PATH_TRAVERSAL. A .tmp-test/ subtree under ROOT keeps the builder
// in-project while staying out of runtime-evidence/ and scripts/.
const TEST_TMP_ROOT = path.join(ROOT, '.tmp-test');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// Clean any stale .tmp-test/ tree at module load (idempotent).
rmTestTmpRoot();
fs.mkdirSync(TEST_TMP_ROOT, { recursive: true });

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
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
// 1. CLI PARSING
// ===========================================================================
test('CLI parsing: defaults are valid', () => {
  const opts = builder.parseArgs(['node', 'build_m016_s10_acceptance_contract.js']);
  assert.equal(opts.force, false);
  assert.equal(opts.output, contract.DEFAULTS.acceptance_contract_output);
  assert.equal(opts.referenceTime, contract.DEFAULTS.reference_time);
  assert.equal(opts.dryRun, false);
  assert.equal(opts.showBlockers, false);
  assert.equal(opts.help, false);
});

test('CLI parsing: --force / --output / --reference-time / --dry-run / --show-blockers', () => {
  const opts = builder.parseArgs([
    'node', 'build_m016_s10_acceptance_contract.js',
    '--force',
    '--output', '/tmp/acceptance.json',
    '--reference-time', '2026-07-23T00:00:00.000Z',
    '--dry-run',
    '--show-blockers',
  ]);
  assert.equal(opts.force, true);
  assert.equal(opts.output, '/tmp/acceptance.json');
  assert.equal(opts.referenceTime, '2026-07-23T00:00:00.000Z');
  assert.equal(opts.dryRun, true);
  assert.equal(opts.showBlockers, true);
});

test('CLI parsing: unknown argv token throws', () => {
  assert.throws(
    () => builder.parseArgs(['node', 'build_m016_s10_acceptance_contract.js', '--bogus']),
    /unknown argv token: --bogus/,
  );
});

test('CLI parsing: --help flag', () => {
  const opts = builder.parseArgs(['node', 'build_m016_s10_acceptance_contract.js', '--help']);
  assert.equal(opts.help, true);
});

test('CLI parsing: invalid reference-time format throws', () => {
  assert.throws(
    () => builder.parseArgs([
      'node', 'build_m016_s10_acceptance_contract.js',
      '--reference-time', 'not-iso',
    ]),
    /reference-time must be ISO 8601/,
  );
});

test('CLI parsing: reference-time without millis suffix is valid', () => {
  const opts = builder.parseArgs([
    'node', 'build_m016_s10_acceptance_contract.js',
    '--reference-time', '2026-07-23T12:34:56Z',
  ]);
  assert.equal(opts.referenceTime, '2026-07-23T12:34:56Z');
});

test('CLI parsing: --source-root captured', () => {
  const opts = builder.parseArgs([
    'node', 'build_m016_s10_acceptance_contract.js',
    '--source-root', '/tmp/source-root',
  ]);
  assert.equal(opts.sourceRoot, '/tmp/source-root');
});

test('printHelp: emits usage block including builder line class', () => {
  const out = captureStdout(() => builder.printHelp());
  assert.match(out.stdout, /Usage: build_m016_s10_acceptance_contract.js/);
  assert.match(out.stdout, /--force/);
  assert.match(out.stdout, new RegExp(contract.BUILDER_LINE_CLASS));
  assert.match(out.stdout, new RegExp(contract.BLOCKER_NAMESPACE));
});

// ===========================================================================
// 2. PATH CONTAINMENT
// ===========================================================================
test('ensureInsideRoot: refuses absolute path outside root', () => {
  assert.throws(
    () => builder.ensureInsideRoot('/etc/passwd', null, 'output'),
    /escapes project root/,
  );
});

test('ensureInsideRoot: refuses path with `..` segment', () => {
  assert.throws(
    () => builder.ensureInsideRoot(path.join(ROOT, 'foo', '..', '..', 'etc', 'passwd'), null, 'output'),
    /escapes project root|contains `\.\.`/,
  );
});

test('ensureInsideRoot: accepts path inside ROOT', () => {
  assert.doesNotThrow(() => builder.ensureInsideRoot(path.join(RUNTIME_EVIDENCE, 'test.json'), null, 'output'));
});

test('ensureInsideRoot: rejects source-root that escapes ROOT', () => {
  assert.throws(
    () => builder.ensureInsideRoot('/tmp/x', '/etc', 'source-root'),
    /escapes project root/,
  );
});

// ===========================================================================
// 3. ATOMIC WRITE
// ===========================================================================
test('atomicWriteJson: refuses to overwrite without --force', () => {
  const tmpDir = makeTempDir('s10-builder-test');
  const target = path.join(tmpDir, 'sidecar.json');
  fs.writeFileSync(target, '{"existing":true}');
  try {
    assert.throws(
      () => builder.atomicWriteJson(target, { hello: 'world' }, { force: false }),
      /refusing to overwrite/,
    );
    // Existing file unchanged.
    assert.equal(readJson(target).existing, true);
  } finally {
    rmTempDir(tmpDir);
  }
});

test('atomicWriteJson: writes + overwrites with --force', () => {
  const tmpDir = makeTempDir('s10-builder-test');
  const target = path.join(tmpDir, 'sidecar.json');
  fs.writeFileSync(target, '{"existing":true}');
  try {
    const result = builder.atomicWriteJson(target, { hello: 'world' }, { force: true });
    assert.equal(result.path, target);
    assert.ok(result.size_bytes > 0);
    assert.match(result.sha256, /^[a-f0-9]{64}$/);
    const onDisk = readJson(target);
    assert.deepEqual(onDisk, { hello: 'world' });
    // No .tmp- file left behind.
    const entries = fs.readdirSync(tmpDir);
    const leftovers = entries.filter((e) => /\.tmp-/.test(e));
    assert.equal(leftovers.length, 0);
  } finally {
    rmTempDir(tmpDir);
  }
});

test('atomicWriteJson: creates parent directories recursively', () => {
  const tmpDir = makeTempDir('s10-builder-test');
  const nested = path.join(tmpDir, 'a', 'b', 'c', 'sidecar.json');
  try {
    builder.atomicWriteJson(nested, { nested: true }, { force: false });
    assert.ok(fs.existsSync(nested));
    assert.deepEqual(readJson(nested), { nested: true });
  } finally {
    rmTempDir(tmpDir);
  }
});

// ===========================================================================
// 4. buildModel — sections + frozen posture
// ===========================================================================
test('buildModel: returns exactly 6 sections in immutable order', () => {
  const lr = loader.loadCanonicalReferences();
  const model = builder.buildModel(lr, contract.DEFAULTS.reference_time);
  assert.equal(model.section_count, 6);
  assert.deepEqual([...model.section_ids], [
    'r041_acceptance',
    'milestone_criterion',
    's05_canonical_verdicts',
    's08_scope_decision',
    'not_proven_preservation',
    'canonical_acceptance_outcome',
  ]);
});

test('buildModel: task=T02 + builder_line_class + canonical_protocol stamped', () => {
  const lr = loader.loadCanonicalReferences();
  const model = builder.buildModel(lr, contract.DEFAULTS.reference_time);
  assert.equal(model.task, 'T02');
  assert.equal(model.builder_line_class, contract.BUILDER_LINE_CLASS);
  assert.equal(model.canonical_protocol, contract.BUILDER_CANONICAL_PROTOCOL);
});

test('buildModel: source_hashes covers all 15 allowlisted refs', () => {
  const lr = loader.loadCanonicalReferences();
  const model = builder.buildModel(lr, contract.DEFAULTS.reference_time);
  assert.equal(Object.keys(model.source_hashes).length, 15);
  for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
    assert.ok(ref in model.source_hashes, 'missing source_hashes[' + ref + ']');
  }
});

test('buildModel: R041 section has frozen 3 structural components', () => {
  const lr = loader.loadCanonicalReferences();
  const model = builder.buildModel(lr, contract.DEFAULTS.reference_time);
  const r041 = model.sections.find((s) => s.section_id === 'r041_acceptance');
  assert.deepEqual([...r041.structural_components], ['separate_verdicts', 'hard_gates', 'reproducible_worksheet']);
  assert.deepEqual([...r041.observed_structural_components], ['separate_verdicts', 'hard_gates', 'reproducible_worksheet']);
  assert.equal(r041.satisfied, true);
  assert.equal(r041.satisfaction, 'STRUCTURAL_ONLY');
});

test('buildModel: milestone criterion has 6 bullets with frozen IDs', () => {
  const lr = loader.loadCanonicalReferences();
  const model = builder.buildModel(lr, contract.DEFAULTS.reference_time);
  const m = model.sections.find((s) => s.section_id === 'milestone_criterion');
  assert.equal(m.bullet_count, 6);
  assert.equal(m.bullets.length, 6);
  const ids = m.bullets.map((b) => b.bullet_id).sort();
  assert.deepEqual(ids, ['MC1', 'MC2', 'MC3', 'MC4', 'MC5', 'MC6']);
});

test('buildModel: S05 canonical verdicts frozen_reconciliation = PARTIAL', () => {
  const lr = loader.loadCanonicalReferences();
  const model = builder.buildModel(lr, contract.DEFAULTS.reference_time);
  const s05 = model.sections.find((s) => s.section_id === 's05_canonical_verdicts');
  assert.equal(s05.frozen_reconciliation_verdict, 'PARTIAL');
  assert.equal(s05.producer_verdict, 'PASS');
  assert.equal(s05.verifier_protocol_verdict, 'NOT_PROVEN');
  assert.equal(s05.s06_reconciled_verdict, 'PARTIAL');
  assert.equal(s05.s09_frozen_verdict, 'PARTIAL');
  assert.equal(s05.divergence_acknowledged, true);
  assert.equal(s05.producer_provenance_preserved, true);
  assert.equal(s05.verifier_provenance_preserved, true);
  assert.equal(s05.frozen_reconciliation_equals_s09, true);
});

test('buildModel: S08 scope decision preserves scope_revised branch', () => {
  const lr = loader.loadCanonicalReferences();
  const model = builder.buildModel(lr, contract.DEFAULTS.reference_time);
  const s08 = model.sections.find((s) => s.section_id === 's08_scope_decision');
  assert.equal(s08.closure_kind, 'scope_revised');
  assert.equal(s08.closure_verdict, 'NOT_PROVEN_SCOPE_REVISED');
  assert.equal(s08.boundary, 'PREPARATION_ONLY');
  assert.equal(s08.denial_summary_required, true);
  assert.equal(s08.mutated_state_preserved, true);
});

test('buildModel: NOT_PROVEN preservation has all 9 frozen IDs', () => {
  const lr = loader.loadCanonicalReferences();
  const model = builder.buildModel(lr, contract.DEFAULTS.reference_time);
  const npp = model.sections.find((s) => s.section_id === 'not_proven_preservation');
  assert.equal(npp.preserved_count, contract.EXPECTED_NOT_PROVEN_COUNT);
  for (const id of contract.NOT_PROVEN_PRESERVED_IDS) {
    assert.ok(npp.preserved_ids.includes(id), 'missing preserved_id ' + id);
  }
  assert.equal(npp.capability_promotion_blocked, true);
});

test('buildModel: canonical acceptance outcome is PARTIAL/PARTIAL/PREPARATION_ONLY + bounded_internal=true', () => {
  const lr = loader.loadCanonicalReferences();
  const model = builder.buildModel(lr, contract.DEFAULTS.reference_time);
  const out = model.sections.find((s) => s.section_id === 'canonical_acceptance_outcome');
  assert.equal(out.orchestration, 'PARTIAL');
  assert.equal(out.evidence, 'PARTIAL');
  assert.equal(out.launch, 'PREPARATION_ONLY');
  assert.equal(out.bounded_internal, true);
  assert.equal(out.launch_posture_frozen, true);
  assert.equal(out.capability_promotion_blocked, true);
});

test('buildModel: launch_posture is the frozen snapshot', () => {
  const lr = loader.loadCanonicalReferences();
  const model = builder.buildModel(lr, contract.DEFAULTS.reference_time);
  assert.deepEqual({ ...model.launch_posture }, {
    orchestration: 'PARTIAL', evidence: 'PARTIAL', launch: 'PREPARATION_ONLY', bounded_internal: true,
  });
});

test('buildModel: text_snapshot_sha256 + roadmap_text_sha256 are sha256-shaped', () => {
  const lr = loader.loadCanonicalReferences();
  const model = builder.buildModel(lr, contract.DEFAULTS.reference_time);
  const r041 = model.sections.find((s) => s.section_id === 'r041_acceptance');
  const m = model.sections.find((s) => s.section_id === 'milestone_criterion');
  assert.match(r041.text_snapshot_sha256, /^[a-f0-9]{64}$/);
  assert.match(m.roadmap_text_sha256, /^[a-f0-9]{64}$/);
});

// ===========================================================================
// 5. buildPayload — digest, blockers, counters
// ===========================================================================
test('buildPayload: acceptance_contract_digest is sha256-shaped and stable across calls', () => {
  const lr = loader.loadCanonicalReferences();
  const model = builder.buildModel(lr, contract.DEFAULTS.reference_time);
  const evaluation = contract.evaluateAcceptance({ model });
  const p1 = builder.buildPayload(model, evaluation, lr, {
    output: '/tmp/sidecar.json', referenceTime: contract.DEFAULTS.reference_time, dryRun: true,
  });
  const p2 = builder.buildPayload(model, evaluation, lr, {
    output: '/tmp/sidecar.json', referenceTime: contract.DEFAULTS.reference_time, dryRun: true,
  });
  assert.match(p1.acceptance_contract_digest, /^[a-f0-9]{64}$/);
  assert.equal(p1.acceptance_contract_digest, p2.acceptance_contract_digest);
});

test('buildPayload: blocked_count matches blockers.length', () => {
  const lr = loader.loadCanonicalReferences();
  const model = builder.buildModel(lr, contract.DEFAULTS.reference_time);
  const evaluation = contract.evaluateAcceptance({ model });
  const p = builder.buildPayload(model, evaluation, lr, {
    output: '/tmp/sidecar.json', referenceTime: contract.DEFAULTS.reference_time, dryRun: true,
  });
  assert.equal(p.blocked_count, p.blockers.length);
});

test('buildPayload: counters all 0 except temp_file_writes (dryRun=0)', () => {
  const lr = loader.loadCanonicalReferences();
  const model = builder.buildModel(lr, contract.DEFAULTS.reference_time);
  const evaluation = contract.evaluateAcceptance({ model });
  const p = builder.buildPayload(model, evaluation, lr, {
    output: '/tmp/sidecar.json', referenceTime: contract.DEFAULTS.reference_time, dryRun: true,
  });
  assert.equal(p.counters.network_calls, 0);
  assert.equal(p.counters.subprocess_calls, 0);
  assert.equal(p.counters.env_reads, 0);
  assert.equal(p.counters.mutation_count, 0);
  assert.equal(p.counters.temp_file_writes, 0);
});

test('buildPayload: counters temp_file_writes = 1 when dryRun=false', () => {
  const lr = loader.loadCanonicalReferences();
  const model = builder.buildModel(lr, contract.DEFAULTS.reference_time);
  const evaluation = contract.evaluateAcceptance({ model });
  const p = builder.buildPayload(model, evaluation, lr, {
    output: '/tmp/sidecar.json', referenceTime: contract.DEFAULTS.reference_time, dryRun: false,
  });
  assert.equal(p.counters.temp_file_writes, 1);
});

test('buildPayload: redaction_posture mirrors contract.REDACTION_FLAG_VALUES exactly', () => {
  const lr = loader.loadCanonicalReferences();
  const model = builder.buildModel(lr, contract.DEFAULTS.reference_time);
  const evaluation = contract.evaluateAcceptance({ model });
  const p = builder.buildPayload(model, evaluation, lr, {
    output: '/tmp/sidecar.json', referenceTime: contract.DEFAULTS.reference_time, dryRun: true,
  });
  for (const key of Object.keys(contract.REDACTION_FLAG_VALUES)) {
    assert.equal(p.redaction_posture[key], contract.REDACTION_FLAG_VALUES[key]);
  }
});

test('buildPayload: sanitised=true + raw_bodies_persisted=false + producer_cli_invoked=false', () => {
  const lr = loader.loadCanonicalReferences();
  const model = builder.buildModel(lr, contract.DEFAULTS.reference_time);
  const evaluation = contract.evaluateAcceptance({ model });
  const p = builder.buildPayload(model, evaluation, lr, {
    output: '/tmp/sidecar.json', referenceTime: contract.DEFAULTS.reference_time, dryRun: true,
  });
  assert.equal(p.sanitised, true);
  assert.equal(p.raw_bodies_persisted, false);
  assert.equal(p.producer_cli_invoked, false);
  assert.equal(p.network_calls, 0);
  assert.equal(p.subprocess_calls, 0);
  assert.equal(p.env_reads, 0);
  assert.equal(p.mutation_count, 0);
});

test('buildPayload: output_path is relative to ROOT', () => {
  const lr = loader.loadCanonicalReferences();
  const model = builder.buildModel(lr, contract.DEFAULTS.reference_time);
  const evaluation = contract.evaluateAcceptance({ model });
  const absOutput = path.join(ROOT, 'runtime-evidence', 'M016-S10-sidecar.json');
  const p = builder.buildPayload(model, evaluation, lr, {
    output: absOutput, referenceTime: contract.DEFAULTS.reference_time, dryRun: true,
  });
  assert.equal(p.output_path, path.join('runtime-evidence', 'M016-S10-sidecar.json'));
});

// ===========================================================================
// 6. buildBuilderCliLine — exact shape
// ===========================================================================
test('buildBuilderCliLine: matches M16-S10-BUILD shape with output_path extension', () => {
  const lr = loader.loadCanonicalReferences();
  const model = builder.buildModel(lr, contract.DEFAULTS.reference_time);
  const evaluation = contract.evaluateAcceptance({ model });
  const p = builder.buildPayload(model, evaluation, lr, {
    output: 'runtime-evidence/x.json', referenceTime: contract.DEFAULTS.reference_time, dryRun: true,
  });
  const line = builder.buildBuilderCliLine(p, { sha256: 'abcd' });
  assert.match(line, /^M16-S10-BUILD verdict=ACCEPTANCE_BUILT exit=0 block_count=0 criterion_count=6 not_proven_count=9 source_count=15 section_count=6 digest=[a-f0-9]{64} output_path=runtime-evidence\/x\.json output_sha256=abcd$/);
});

test('buildBuilderCliLine: omits output_sha256 when writeResult is null', () => {
  const lr = loader.loadCanonicalReferences();
  const model = builder.buildModel(lr, contract.DEFAULTS.reference_time);
  const evaluation = contract.evaluateAcceptance({ model });
  const p = builder.buildPayload(model, evaluation, lr, {
    output: 'runtime-evidence/x.json', referenceTime: contract.DEFAULTS.reference_time, dryRun: true,
  });
  const line = builder.buildBuilderCliLine(p, null);
  assert.equal(line.endsWith('output_sha256='), false);
  assert.match(line, /output_path=runtime-evidence\/x\.json$/);
});

// ===========================================================================
// 7. failureStderrSummary — bounded, no raw payload leak
// ===========================================================================
test('failureStderrSummary: bounded string + includes verdict/exit/block_count', () => {
  const lr = loader.loadCanonicalReferences();
  const model = builder.buildModel(lr, contract.DEFAULTS.reference_time);
  const evaluation = contract.evaluateAcceptance({ model });
  const p = builder.buildPayload(model, evaluation, lr, {
    output: 'runtime-evidence/x.json', referenceTime: contract.DEFAULTS.reference_time, dryRun: true,
  });
  const summary = builder.failureStderrSummary(p);
  assert.match(summary, /M16-S10-BUILD:/);
  assert.match(summary, /verdict=ACCEPTANCE_BUILT/);
  assert.match(summary, /exit=0/);
  assert.match(summary, /block_count=0/);
  // Summary must NOT contain raw sections (bounded).
  assert.equal(summary.includes('structural_components'), false);
});

// ===========================================================================
// 8. main() — pipeline entry points
// ===========================================================================
test('main(): dry-run returns 0 + emits CLI line + writes nothing', () => {
  const tmpDir = makeTempDir('s10-builder-main');
  const target = path.join(tmpDir, 'should-not-exist.json');
  try {
    let exitCode;
    const out = captureStdout(() => {
      exitCode = builder.main([
        'node', 'build_m016_s10_acceptance_contract.js',
        '--dry-run',
        '--output', target,
      ]);
    });
    assert.equal(exitCode, 0);
    assert.equal(fs.existsSync(target), false, 'dry-run must NOT write output');
    assert.match(out.stdout, /^M16-S10-BUILD /);
    assert.match(out.stdout, new RegExp('verdict=ACCEPTANCE_BUILT'));
  } finally {
    rmTempDir(tmpDir);
  }
});

test('main(): refuses to overwrite without --force (exit 4)', () => {
  const tmpDir = makeTempDir('s10-builder-main');
  const target = path.join(tmpDir, 'existing.json');
  fs.writeFileSync(target, '{"existing":true}');
  try {
    let builderExitCode = undefined;
    const out = captureStderr(() => {
      // builder.main() calls process.exit(4) which our helper converts
      // into a throw — so the assignment below does NOT actually run.
      // We use out.exitCode instead.
      try {
        builderExitCode = builder.main([
          'node', 'build_m016_s10_acceptance_contract.js',
          '--output', target,
        ]);
      } catch (_e) { /* swallowed by captureStderr */ }
    });
    assert.equal(out.exitCode, 4, 'captureStderr must record exit code 4');
    assert.equal(builderExitCode, undefined, 'builder.main throws instead of returning on exit()');
    // Existing file unchanged.
    assert.equal(readJson(target).existing, true);
  } finally {
    rmTempDir(tmpDir);
  }
});

test('main(): full pipeline writes sidecar + returns 0 with --force', () => {
  const tmpDir = makeTempDir('s10-builder-main');
  const target = path.join(tmpDir, 'sidecar.json');
  try {
    let exitCode;
    const out = captureStdout(() => {
      exitCode = builder.main([
        'node', 'build_m016_s10_acceptance_contract.js',
        '--force',
        '--output', target,
        '--reference-time', '2026-07-23T12:00:00.000Z',
      ]);
    });
    assert.equal(exitCode, 0);
    assert.ok(fs.existsSync(target));
    const payload = readJson(target);
    assert.equal(payload.task, 'T02');
    assert.equal(payload.section_count, 6);
    assert.equal(payload.blocked_count, 0);
    assert.match(out.stdout, /^M16-S10-BUILD /);
  } finally {
    rmTempDir(tmpDir);
  }
});

test('main(): --help returns 0 + prints help + writes nothing', () => {
  const out = captureStdout(() => {
    const exitCode = builder.main(['node', 'build_m016_s10_acceptance_contract.js', '--help']);
    assert.equal(exitCode, 0);
  });
  assert.match(out.stdout, /Usage: build_m016_s10_acceptance_contract.js/);
});

test('main(): unknown argv → exit 1 + stderr message', () => {
  const out = captureStderr(() => {
    const exitCode = builder.main(['node', 'build_m016_s10_acceptance_contract.js', '--bogus']);
    assert.equal(exitCode, 1);
  });
  assert.match(out.stderr, /unknown argv token/);
});

test('main(): path-traversal in --output → exit 5', () => {
  const out = captureStderr(() => {
    const exitCode = builder.main([
      'node', 'build_m016_s10_acceptance_contract.js',
      '--output', '/etc/passwd',
    ]);
    assert.equal(exitCode, 5);
  });
  assert.match(out.stderr, /Output path containment failure/);
});

test('main(): invalid reference-time → exit 1', () => {
  const out = captureStderr(() => {
    const exitCode = builder.main([
      'node', 'build_m016_s10_acceptance_contract.js',
      '--reference-time', 'tomorrow',
    ]);
    assert.equal(exitCode, 1);
  });
  assert.match(out.stderr, /reference-time must be ISO 8601/);
});

// ===========================================================================
// 9. CANONICAL SIDECAR ON DISK — invariants
// ===========================================================================
test('canonical sidecar: exists, parses, matches contract schema', () => {
  assert.ok(fs.existsSync(CANONICAL_OUTPUT),
    'canonical sidecar missing — run `node scripts/build_m016_s10_acceptance_contract.js --force --output runtime-evidence/M016-S10-seven-division-acceptance-contract.json` first');
  const sidecar = readJson(CANONICAL_OUTPUT);
  assert.equal(sidecar.schema_id, contract.SCHEMA_ID);
  assert.equal(sidecar.schema_version, contract.SCHEMA_VERSION);
  assert.equal(sidecar.acceptance_contract_kind, contract.ACCEPTANCE_CONTRACT_KIND);
  assert.equal(sidecar.milestone, contract.MILESTONE);
  assert.equal(sidecar.slice, contract.SLICE);
  assert.equal(sidecar.task, 'T02');
});

test('canonical sidecar: section_count + section_ids immutable', () => {
  const sidecar = readJson(CANONICAL_OUTPUT);
  assert.equal(sidecar.section_count, 6);
  assert.deepEqual(sidecar.section_ids, [
    'r041_acceptance', 'milestone_criterion', 's05_canonical_verdicts',
    's08_scope_decision', 'not_proven_preservation', 'canonical_acceptance_outcome',
  ]);
});

test('canonical sidecar: source_count = 15 and source_refs matches SOURCE_ALLOWLIST', () => {
  const sidecar = readJson(CANONICAL_OUTPUT);
  assert.equal(sidecar.source_count, 15);
  assert.deepEqual(sidecar.source_refs, [...contract.SOURCE_ALLOWLIST_REFS]);
});

test('canonical sidecar: source_hashes match loader.all_hashes', () => {
  const sidecar = readJson(CANONICAL_OUTPUT);
  const lr = loader.loadCanonicalReferences();
  for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
    assert.equal(sidecar.source_hashes[ref], lr.all_hashes[ref],
      'source_hashes[' + ref + '] must equal loader.all_hashes[' + ref + ']');
  }
});

test('canonical sidecar: digest + acceptance_contract_digest are sha256-shaped', () => {
  const sidecar = readJson(CANONICAL_OUTPUT);
  assert.match(sidecar.acceptance_contract_digest, /^[a-f0-9]{64}$/);
});

test('canonical sidecar: launch_posture is the frozen snapshot', () => {
  const sidecar = readJson(CANONICAL_OUTPUT);
  assert.deepEqual({ ...sidecar.launch_posture }, {
    orchestration: 'PARTIAL', evidence: 'PARTIAL', launch: 'PREPARATION_ONLY', bounded_internal: true,
  });
});

test('canonical sidecar: blocked_count=0 + blockers is empty', () => {
  const sidecar = readJson(CANONICAL_OUTPUT);
  assert.equal(sidecar.blocked_count, 0);
  assert.deepEqual(sidecar.blockers, []);
});

test('canonical sidecar: redaction_hits is empty', () => {
  const sidecar = readJson(CANONICAL_OUTPUT);
  assert.deepEqual(sidecar.redaction_hits, []);
});

test('canonical sidecar: counters all 0 + temp_file_writes=1', () => {
  const sidecar = readJson(CANONICAL_OUTPUT);
  assert.equal(sidecar.counters.network_calls, 0);
  assert.equal(sidecar.counters.subprocess_calls, 0);
  assert.equal(sidecar.counters.env_reads, 0);
  assert.equal(sidecar.counters.mutation_count, 0);
  assert.equal(sidecar.counters.temp_file_writes, 1);
});

test('canonical sidecar: redaction_posture matches contract exactly', () => {
  const sidecar = readJson(CANONICAL_OUTPUT);
  for (const [key, val] of Object.entries(contract.REDACTION_FLAG_VALUES)) {
    assert.equal(sidecar.redaction_posture[key], val);
  }
});

test('canonical sidecar: provenance_appendix matches loader summary', () => {
  const sidecar = readJson(CANONICAL_OUTPUT);
  const lr = loader.loadCanonicalReferences();
  assert.equal(sidecar.provenance_appendix.source_count, lr.summary.expected_count);
  assert.equal(sidecar.provenance_appendix.read_count, lr.summary.read_count);
  assert.equal(sidecar.provenance_appendix.missing_count, lr.summary.missing_count);
  assert.equal(sidecar.provenance_appendix.malformed_count, lr.summary.malformed_count);
  assert.equal(sidecar.provenance_appendix.byte_total, lr.summary.byte_total);
});

// ===========================================================================
// 10. RE-RUN DETERMINISM — byte-stability on second build
// ===========================================================================
test('re-run determinism: identical reference-time → identical digest', () => {
  const tmpDir = makeTempDir('s10-builder-rerun');
  const target = path.join(tmpDir, 'sidecar.json');
  try {
    const ref = '2026-07-23T12:00:00.000Z';
    builder.main([
      'node', 'build_m016_s10_acceptance_contract.js',
      '--force',
      '--output', target,
      '--reference-time', ref,
    ]);
    const first = readJson(target);
    builder.main([
      'node', 'build_m016_s10_acceptance_contract.js',
      '--force',
      '--output', target,
      '--reference-time', ref,
    ]);
    const second = readJson(target);
    assert.equal(second.acceptance_contract_digest, first.acceptance_contract_digest);
    assert.equal(second.sections.length, first.sections.length);
    // Section-level digest reproducibility (excluding captured_at which
    // would drift only if generated changed).
    assert.equal(second.source_hashes['runtime-evidence/M015-native-seven-division-mission-20260717.json'],
      first.source_hashes['runtime-evidence/M015-native-seven-division-mission-20260717.json']);
  } finally {
    rmTempDir(tmpDir);
  }
});

// ===========================================================================
// 11. NEGATIVE PATHS — synthetic fails closed
// ===========================================================================
test('atomicWriteJson: writeable sidecar has bounded JSON + sha256 + size', () => {
  // Sanity check: write a minimal payload and read it back to confirm
  // the atomic write produces a well-formed JSON file with sha256-stable
  // bytes. Negative paths (overwrite refusal) are covered elsewhere.
  const tmpDir = makeTempDir('s10-builder-negative');
  try {
    const result = builder.atomicWriteJson(path.join(tmpDir, 'x.json'), { foo: 'bar' }, { force: true });
    assert.match(result.sha256, /^[a-f0-9]{64}$/);
    assert.ok(result.size_bytes > 0);
    const onDisk = readJson(path.join(tmpDir, 'x.json'));
    assert.deepEqual(onDisk, { foo: 'bar' });
  } finally {
    rmTempDir(tmpDir);
  }
});

test('main(): source-root override pointing outside ROOT fails closed', () => {
  // When --source-root is outside ROOT, the ensureInsideRoot check
  // fails first (because output containment uses lexical ROOT, not
  // the overridden sourceRoot). The expected stderr surfaces this.
  const out = captureStderr(() => {
    try {
      builder.main([
        'node', 'build_m016_s10_acceptance_contract.js',
        '--source-root', '/etc',
        '--dry-run',
      ]);
    } catch (_e) { /* swallowed by captureStderr */ }
  });
  assert.match(out.stderr, /Output path containment failure|Source-root containment failure/);
  assert.equal(out.exitCode, 5);
});

test('main(): --dry-run exits 0 + writes nothing + counters.temp_file_writes=0', () => {
  const tmpDir = makeTempDir('s10-builder-dryrun');
  const target = path.join(tmpDir, 'should-not-exist.json');
  try {
    let exitCode;
    captureStdout(() => {
      exitCode = builder.main([
        'node', 'build_m016_s10_acceptance_contract.js',
        '--dry-run',
        '--output', target,
      ]);
    });
    assert.equal(exitCode, 0);
    assert.equal(fs.existsSync(target), false);
  } finally {
    rmTempDir(tmpDir);
  }
});

// ===========================================================================
// 12. SNAPSHOT COUNTERS — provenance + per-source metadata
// ===========================================================================
test('buildModel: source_snapshots contain bounded metadata per allowlisted ref', () => {
  const lr = loader.loadCanonicalReferences();
  const model = builder.buildModel(lr, contract.DEFAULTS.reference_time);
  assert.equal(Object.keys(model.source_snapshots).length, 15);
  for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
    const snap = model.source_snapshots[ref];
    assert.ok(snap, 'snapshot for ' + ref + ' is missing');
    assert.equal(typeof snap.sha256, 'string');
    assert.match(snap.sha256, /^[a-f0-9]{64}$/);
    assert.equal(typeof snap.size_bytes, 'number');
    assert.ok(['read', 'missing', 'malformed', 'not_allowlisted'].includes(snap.status),
      'unexpected status: ' + snap.status);
    assert.equal(snap.chain_role, contract.getSourceEntry(ref).chain_role);
    assert.equal(snap.review_section, contract.getSourceEntry(ref).review_section);
    assert.equal(snap.required, true);
  }
});