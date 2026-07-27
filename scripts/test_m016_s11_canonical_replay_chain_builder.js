#!/usr/bin/env node
'use strict';
/**
 * scripts/test_m016_s11_canonical_replay_chain_builder.js
 *
 * M016-txa3vu / S11 / T02 — node:test suite for the sidecar builder.
 *
 * Covers:
 *   (a) CLI parsing + default values
 *   (b) ensureInsideRoot refuses path traversal
 *   (c) Sidecar rendered JSON shape — 17/8/4 invariants
 *   (d) Health-line shape — M16-S11-BUILD prefix + counters
 *   (e) Atomic write refuses overwrite without --force
 *   (f) Atomic write --force overwrites existing file
 *   (g) Two runs against a fixture root produce byte-stable chain digest
 *   (h) Pre/post loader snapshot equality (no mutation)
 *   (i) Real-project build emits M16-S11-BUILD CLI line with documented fields
 *
 * Run: node --test scripts/test_m016_s11_canonical_replay_chain_builder.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const contract = require('./lib/m016-s11-canonical-replay-chain-contract.js');
const loader = require('./lib/m016-s11-canonical-replay-chain-reference-loader.js');
const builder = require('./build_m016_s11_canonical_replay_chain.js');

const ROOT = loader.ROOT;

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------
function makeFixtureRoot() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'm016-s11-t02-'));
  const realTmp = fs.realpathSync(tmp);
  fs.mkdirSync(path.join(realTmp, 'runtime-evidence'), { recursive: true });
  fs.mkdirSync(path.join(realTmp, '.gsd'), { recursive: true });
  fs.mkdirSync(path.join(realTmp, '.gsd', 'phases', '16-txa3vu-evidence-bearing-bounded-mission-proof'), { recursive: true });

  const j = (filename, body) => {
    fs.writeFileSync(path.join(realTmp, 'runtime-evidence', filename), JSON.stringify(body, null, 2));
  };
  const md = (relpath, body) => {
    const target = path.join(realTmp, relpath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
  };
  md('.gsd/REQUIREMENTS.md', '# REQUIREMENTS placeholder\n');
  md('.gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/16-ROADMAP.md', '# ROADMAP placeholder\n');

  j('M015-native-seven-division-mission-20260717.json', { milestone: 'M015', baseline: true });
  j('M016-S02-bos-mission-proof.json', { milestone: 'M016', slice: 'S02', bos_grade_contract_proof_state: 'NOT_PROVEN_MISSING_RESULT_JSON_BOS' });
  j('M016-S05-seven-division-replay-bundle.json', { slice: 'S05', kind: 'bundle', verdict: 'PASS' });
  j('M016-S05-seven-division-replay-scoring-worksheet.json', { slice: 'S05', kind: 'worksheet' });
  j('M016-S05-seven-division-replay-producer-protocol.json', { slice: 'S05', kind: 'producer-protocol', verdict: 'PASS' });
  j('M016-S05-seven-division-replay-verify-protocol.json', { slice: 'S05', kind: 'verify-protocol', verdict: 'NOT_PROVEN' });
  j('M016-S05-seven-division-replay-admission.json', { slice: 'S05', kind: 'admission' });
  j('M016-S05-seven-division-replay-probe-run.json', { slice: 'S05', kind: 'probe-run' });
  j('M016-S06-proof-reconciliation.json', { slice: 'S06', kind: 'proof-reconciliation', verdict: 'PARTIAL' });
  j('M016-S06-capability-reconciliation.json', { slice: 'S06', kind: 'capability-reconciliation' });
  j('M016-S08-native-seven-agent-scope-decision.json', { slice: 'S08', kind: 'scope-decision', closure_kind: 'scope_revised' });
  j('M016-S08-native-seven-agent-verify-protocol.json', { slice: 'S08', kind: 'verify-protocol' });
  j('M016-S08-native-seven-agent-closure.json', { slice: 'S08', kind: 'closure', closure_verdict: 'NOT_PROVEN_SCOPE_REVISED' });
  md('runtime-evidence/M016-S09-HUMAN-REVIEW.md', '# Human Review placeholder\n');
  j('M016-S10-seven-division-acceptance-contract.json', {
    slice: 'S10',
    kind: 'acceptance-contract',
    acceptance_contract_digest: 'a'.repeat(64),
    launch_posture: { orchestration: 'PARTIAL', evidence: 'PARTIAL', launch: 'PREPARATION_ONLY', bounded_internal: true },
  });

  return realTmp;
}

function makeRootedTmp(name) {
  const rand = crypto.randomBytes(3).toString('hex');
  const dir = path.join(ROOT, '.gsd', 'exec', 's11-t02-' + name + '-' + rand);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupRoot(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (_e) { /* ignore */ } }

// ---------------------------------------------------------------------------
// (a) CLI parsing
// ---------------------------------------------------------------------------
test('a1: parseArgs honours every flag and applies defaults', () => {
  const args = builder.parseArgs([
    'node', 'build_m016_s11_canonical_replay_chain.js',
    '--force', '--output', 'foo.json',
    '--reference-time', '2026-07-25T00:00:00.000Z',
    '--source-root', '/tmp/x',
    '--show-blockers', '--dry-run',
  ]);
  assert.equal(args.force, true);
  assert.equal(args.output, 'foo.json');
  assert.equal(args.referenceTime, '2026-07-25T00:00:00.000Z');
  assert.equal(args.sourceRoot, '/tmp/x');
  assert.equal(args.showBlockers, true);
  assert.equal(args.dryRun, true);
});

test('a2: parseArgs applies canonical defaults', () => {
  const args = builder.parseArgs(['node', 'script.js']);
  assert.equal(args.force, false);
  assert.equal(args.output, contract.DEFAULTS.chain_output);
  assert.equal(args.referenceTime, contract.DEFAULTS.reference_time);
});

test('a3: parseArgs rejects unknown argv token', () => {
  assert.throws(() => builder.parseArgs(['node', 'x.js', '--bogus-flag']), /unknown argv token/);
});

// ---------------------------------------------------------------------------
// (b) ensureInsideRoot refuses traversal
// ---------------------------------------------------------------------------
test('b1: ensureInsideRoot refuses absolute output escaping project root', () => {
  assert.throws(() => builder.ensureInsideRoot('/etc/passwd', null, 'output'),
    (e) => String(e.code).startsWith(contract.BLOCKER_NAMESPACE + '-PATH-TRAVERSAL:output-'));
});

test('b2: ensureInsideRoot refuses path that escapes via `..` segment', () => {
  assert.throws(() => builder.ensureInsideRoot(path.resolve(ROOT, 'foo/../../../etc/passwd'), null, 'output'),
    (e) => String(e.code).startsWith(contract.BLOCKER_NAMESPACE + '-PATH-TRAVERSAL:output-'));
});

// ---------------------------------------------------------------------------
// (c) Sidecar rendered JSON shape — 17/8/4 invariants
// ---------------------------------------------------------------------------
test('c1: renderSidecar contains 17/8/4 invariants', () => {
  const l = loader.loadCanonicalReferences({ sourceRoot: ROOT });
  const model = contract.buildChainModel({ generated: '2026-07-25T00:00:00.000Z' });
  const s10Section = model.sections.find((s) => s.section_id === 's10_acceptance_contract');
  if (s10Section) s10Section.contract_digest = 'a'.repeat(64);
  model.chain_digest = contract.computeChainDigest(model);
  const rendered = builder.renderSidecar(model, l, '2026-07-25T00:00:00.000Z', null);
  assert.equal(rendered.section_count, 8);
  assert.equal(rendered.source_count, 17);
  assert.equal(rendered.verification_class_count, 4);
  assert.equal(rendered.verification_class_ids.length, 4);
  assert.equal(rendered.section_ids.length, 8);
  // Class coverage must declare section_ids for each class.
  for (const cls of contract.VERIFICATION_CLASS_IDS) {
    assert.ok(Array.isArray(rendered.class_coverage[cls].section_ids));
    assert.ok(rendered.class_coverage[cls].section_ids.length >= 1);
  }
});

// ---------------------------------------------------------------------------
// (d) Health-line shape
// ---------------------------------------------------------------------------
test('d1: buildBuilderCliLine emits M16-S11-BUILD shape with documented counters', () => {
  const model = contract.buildChainModel({ generated: '2026-07-25T00:00:00.000Z' });
  const line = builder.buildBuilderCliLine(model, { verdict: 'CHAIN_BUILT', exitCode: 0, blockCount: 0, digest: 'abc' });
  assert.match(line, /^M16-S11-BUILD /);
  assert.match(line, /class_count=4/);
  assert.match(line, /source_count=17/);
  assert.match(line, /section_count=8/);
  assert.match(line, /mutation_count=0/);
  assert.match(line, /network_call_count=0/);
});

// ---------------------------------------------------------------------------
// (e) Atomic write refuses overwrite without --force
// ---------------------------------------------------------------------------
test('e1: end-to-end build refuses to overwrite without --force', () => {
  const fx = makeFixtureRoot();
  const outDir = makeRootedTmp('refuse');
  const tmpOut = path.join(outDir, 'sidecar.json');
  try {
    fs.writeFileSync(tmpOut, 'pre-existing');
    const res = spawnSync('node', [
      builder.SCRIPT_PATH,
      '--output', tmpOut,
      '--source-root', fx,
      '--reference-time', '2026-07-25T00:00:00.000Z',
    ], { encoding: 'utf8' });
    assert.notEqual(res.status, 0, 'must exit non-zero when refusing overwrite');
    assert.match(res.stderr || '', /refusing to overwrite/);
    assert.equal(fs.readFileSync(tmpOut, 'utf8'), 'pre-existing', 'file must remain unchanged');
  } finally { cleanupRoot(fx); cleanupRoot(outDir); }
});

// ---------------------------------------------------------------------------
// (f) Atomic write --force overwrites
// ---------------------------------------------------------------------------
test('f1: --force overwrites an existing file with a fresh sidecar', () => {
  const fx = makeFixtureRoot();
  const outDir = makeRootedTmp('force');
  const tmpOut = path.join(outDir, 'sidecar.json');
  try {
    fs.writeFileSync(tmpOut, 'pre-existing content\n');
    const res = spawnSync('node', [
      builder.SCRIPT_PATH,
      '--force',
      '--output', tmpOut,
      '--source-root', fx,
      '--reference-time', '2026-07-25T00:00:00.000Z',
    ], { encoding: 'utf8' });
    assert.equal(res.status, 0, 'must exit 0; stderr=' + (res.stderr || '') + ' stdout=' + (res.stdout || ''));
    assert.match(res.stdout || '', /^M16-S11-BUILD /);
    const body = JSON.parse(fs.readFileSync(tmpOut, 'utf8'));
    assert.equal(body.source_count, 17);
    assert.equal(body.section_count, 8);
    assert.equal(body.verification_class_count, 4);
  } finally { cleanupRoot(fx); cleanupRoot(outDir); }
});

// ---------------------------------------------------------------------------
// (g) Two runs against fixture root produce byte-stable chain digest
// ---------------------------------------------------------------------------
test('g1: two runs against fixture root produce byte-stable chain digest + source hashes', () => {
  const fx = makeFixtureRoot();
  const outDirA = makeRootedTmp('det-a');
  const outDirB = makeRootedTmp('det-b');
  const tmpA = path.join(outDirA, 'sidecar-a.json');
  const tmpB = path.join(outDirB, 'sidecar-b.json');
  try {
    const common = ['--source-root', fx, '--reference-time', '2026-07-25T00:00:00.000Z', '--force'];
    const runA = spawnSync('node', [builder.SCRIPT_PATH, '--output', tmpA, ...common], { encoding: 'utf8' });
    const runB = spawnSync('node', [builder.SCRIPT_PATH, '--output', tmpB, ...common], { encoding: 'utf8' });
    assert.equal(runA.status, 0, 'A must exit 0; stderr=' + (runA.stderr || ''));
    assert.equal(runB.status, 0, 'B must exit 0; stderr=' + (runB.stderr || ''));
    const sidecarA = JSON.parse(fs.readFileSync(tmpA, 'utf8'));
    const sidecarB = JSON.parse(fs.readFileSync(tmpB, 'utf8'));
    assert.equal(sidecarA.chain_digest, sidecarB.chain_digest, 'chain_digest must be byte-stable across runs');
    assert.deepEqual(sidecarA.source_hashes, sidecarB.source_hashes, 'source_hashes must match across runs');
    assert.deepEqual(sidecarA.section_ids, sidecarB.section_ids);
    assert.equal(sidecarA.source_count, 17);
    assert.equal(sidecarA.section_count, 8);
    assert.equal(sidecarA.verification_class_count, 4);
  } finally { cleanupRoot(fx); cleanupRoot(outDirA); cleanupRoot(outDirB); }
});

// ---------------------------------------------------------------------------
// (h) Pre/post loader snapshot equality
// ---------------------------------------------------------------------------
test('h1: pre/post snapshot equality — no mutation of upstream sources', () => {
  const fx = makeFixtureRoot();
  const outDir = makeRootedTmp('snap');
  const tmpOut = path.join(outDir, 'sidecar.json');
  try {
    const before = loader.loadCanonicalReferences({ sourceRoot: fx });
    const beforeSnap = loader.snapshotHashes(before);
    const res = spawnSync('node', [
      builder.SCRIPT_PATH,
      '--force',
      '--output', tmpOut,
      '--source-root', fx,
      '--reference-time', '2026-07-25T00:00:00.000Z',
    ], { encoding: 'utf8' });
    assert.equal(res.status, 0, 'build must succeed; stderr=' + (res.stderr || ''));
    const after = loader.loadCanonicalReferences({ sourceRoot: fx });
    const afterSnap = loader.snapshotHashes(after);
    const drift = loader.diffSnapshots(beforeSnap, afterSnap);
    assert.equal(drift.drift_count, 0);
    assert.equal(drift.byte_total_unchanged, true);
  } finally { cleanupRoot(fx); cleanupRoot(outDir); }
});

// ---------------------------------------------------------------------------
// (i) Real-project dry-run emits CLI line with documented fields
// ---------------------------------------------------------------------------
test('i1: dry-run against the real project emits M16-S11-BUILD CLI line + 17/8/4 counters', () => {
  const outDir = makeRootedTmp('real');
  const tmpOut = path.join(outDir, 'sidecar.json');
  try {
    const res = spawnSync('node', [
      builder.SCRIPT_PATH,
      '--dry-run',
      '--output', tmpOut,
      '--reference-time', '2026-07-25T00:00:00.000Z',
    ], { encoding: 'utf8' });
    assert.equal(res.status, 0, 'real-project dry-run must exit 0; stderr=' + (res.stderr || ''));
    const cliLine = (res.stdout || '').split(/\r?\n/).filter(Boolean)[0] || '';
    assert.ok(cliLine.startsWith(contract.BUILDER_LINE_CLASS + ' '), 'CLI must lead with M16-S11-BUILD; got: ' + cliLine);
    assert.match(cliLine, /class_count=4/);
    assert.match(cliLine, /source_count=17/);
    assert.match(cliLine, /section_count=8/);
    assert.match(cliLine, /mutation_count=0/);
    assert.match(cliLine, /network_call_count=0/);
  } finally { cleanupRoot(outDir); }
});

// ---------------------------------------------------------------------------
// (j) Public surface exported
// ---------------------------------------------------------------------------
test('j1: builder module exports documented public surface', () => {
  for (const name of ['parseArgs', 'printHelp', 'ensureInsideRoot', 'atomicWriteJson', 'buildModel', 'renderSidecar', 'buildBuilderCliLine', 'failureSummary', 'run', 'ROOT', 'SCRIPT_PATH', 'OUTPUT_PATH_DEFAULT']) {
    assert.ok(typeof builder[name] !== 'undefined', 'builder must export ' + name);
  }
});

// ---------------------------------------------------------------------------
// (k) Builder does NOT import the verifier
// ---------------------------------------------------------------------------
test('k1: builder does NOT import any verifier module (T03 independence invariant)', () => {
  const src = fs.readFileSync(builder.SCRIPT_PATH, 'utf8');
  assert.ok(!/require\(\s*['"]\.\/verify_m016_s11_canonical_replay_chain/.test(src),
    'builder must not import the verifier script');
  assert.ok(!/require\(\s*['"]\.\/m016-s11-canonical-replay-chain-verifier/.test(src));
});
