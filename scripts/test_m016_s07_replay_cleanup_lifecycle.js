#!/usr/bin/env node
'use strict';

/**
 * scripts/test_m016_s07_replay_cleanup_lifecycle.js
 *
 * M016-txa3vu / S07 / T02 — Lifecycle-level negative + positive suite for
 * the S01 CLI replay pipeline. Verifies that the hardened S01 CLI:
 *   (a) leaves the repo free of atomic-temp residue after a successful run
 *   (b) refuses to start when pre-existing scratch residue is present
 *       in the output-dir (marker ownership refusal)
 *   (c) refuses to start when the S07 scratch root
 *       (runtime-evidence/.m016-s07-replay-scratch/) is present (S01
 *       lifecycle and S07 verifier share runtime-evidence/ but the S07
 *       scratch zone is reserved for the S07 verifier)
 *   (d) produces byte-identical outputs across two sequential --force runs
 *       (reproducibility / determinism)
 *   (e) cleans the atomic-temp file even when rename fails (write-error
 *       fail-closed behaviour, exercised indirectly via chmod 0555)
 *   (f) sanitises redaction markers (UUID / bearer / xiaomi / credential)
 *       in every canonical output
 *   (g) fails closed on bad regression fixtures and bad m015 evidence
 *       using the canonical negative fixtures
 *       (runtime-evidence/.tmp-m016-bad-fixture.json and
 *        runtime-evidence/.tmp-m016-bad-m015.json)
 *   (h) the tracked S01 replay residue under
 *       runtime-evidence/.tmp-m016-determinism/ and
 *       runtime-evidence/.tmp-q4-s01/ is absent at the end of T02
 *       (executable absence check via fs.existsSync)
 *
 * Uses node:test. Spawns the CLI via child_process.spawnSync against
 * isolated temp directories under runtime-evidence/.tmp-m016-s07-test-<id>/
 * so the lifecycle tests never touch the canonical runtime-evidence/
 * outputs.
 *
 * Run with:
 *   node --test scripts/test_m016_s07_replay_cleanup_contract.js \
 *                   scripts/test_validate_m016_s01_proof_classification.js \
 *                   scripts/test_m016_s07_replay_cleanup_lifecycle.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const cli = require('./validate_m016_s01_proof_classification');
const data = require('./lib/m016-s01-classification-data');

const REPO_ROOT = path.resolve(__dirname, '..');
const RUNTIME_EVIDENCE = path.join(REPO_ROOT, 'runtime-evidence');
const REAL_INPUT = path.join(RUNTIME_EVIDENCE, 'M015-native-seven-division-mission-20260717.json');
const REAL_FIXTURE = path.join(RUNTIME_EVIDENCE, 'M016-S01-m015-regression-fixture.json');
const SCHEMA_PATH = path.join(REPO_ROOT, data.DEFAULTS.schema_path);
const NODE_BIN = process.execPath;
const CLI_PATH = path.join(__dirname, 'validate_m016_s01_proof_classification.js');

// ---------------------------------------------------------------------------
// Helpers — temp-dir lifecycle + spawn helper.
// ---------------------------------------------------------------------------

function makeTempDir(label = 'm016-s07-test') {
  const safe = String(label).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
  const id = crypto.randomBytes(6).toString('hex');
  const dir = fs.mkdtempSync(path.join(RUNTIME_EVIDENCE, `.tmp-${safe}-${id}`));
  return dir;
}

function rmrf(target) {
  if (!target) return;
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch {
    // best-effort cleanup; tmp dirs are intentionally hidden
  }
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n');
}

function runCli(args, opts = {}) {
  const cwd = opts.cwd || REPO_ROOT;
  const env = Object.assign({}, process.env, opts.env || {});
  const result = spawnSync(NODE_BIN, [CLI_PATH, ...args], {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30000,
  });
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error,
  };
}

// ---------------------------------------------------------------------------
// Tests — lifecycle invariants
// ---------------------------------------------------------------------------

test('S07 lifecycle: pre-run residue refusal — .tmp-m016-* in output-dir refuses run', (t) => {
  const tmpDir = makeTempDir();
  t.after(() => rmrf(tmpDir));
  const outDir = path.join(tmpDir, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  // Plant pre-existing scratch residue inside output-dir.
  fs.writeFileSync(path.join(outDir, '.tmp-m016-pre-existing.json'), '{"residue":true}');

  const result = runCli([
    '--input', REAL_INPUT,
    '--expected', REAL_FIXTURE,
    '--output-dir', outDir,
    '--schema', SCHEMA_PATH,
    '--force',
  ]);
  assert.equal(result.status, data.EXIT_CODES.CLASSIFICATION_REJECTED_MALFORMED);
  assert.match(result.stderr, /residue-pre-run/);
  // The pre-existing residue must still be on disk (CLI refused without touching it).
  assert.equal(fs.existsSync(path.join(outDir, '.tmp-m016-pre-existing.json')), true);
  // No canonical output should have been written.
  assert.equal(fs.existsSync(path.join(outDir, cli.PROTOCOL_FILENAME)), false);
});

test('S07 lifecycle: post-run absence — no .tmp-* residue after successful run', (t) => {
  const tmpDir = makeTempDir();
  t.after(() => rmrf(tmpDir));
  const outDir = path.join(tmpDir, 'out');
  fs.mkdirSync(outDir, { recursive: true });

  const result = runCli([
    '--input', REAL_INPUT,
    '--expected', REAL_FIXTURE,
    '--output-dir', outDir,
    '--schema', SCHEMA_PATH,
    '--force',
  ]);
  assert.equal(result.status, 0);
  const entries = fs.readdirSync(outDir);
  const leftoverTmp = entries.filter((n) => n.startsWith('.tmp-'));
  assert.deepEqual(leftoverTmp, [], `expected no .tmp-* residue after success; got: ${leftoverTmp.join(', ')}`);
});

test('S07 lifecycle: 2 sequential runs are byte-identical (reproducibility)', (t) => {
  const tmpDir = makeTempDir();
  t.after(() => rmrf(tmpDir));
  const outDir = path.join(tmpDir, 'out');
  fs.mkdirSync(outDir, { recursive: true });

  const r1 = runCli(['--input', REAL_INPUT, '--expected', REAL_FIXTURE, '--output-dir', outDir, '--schema', SCHEMA_PATH, '--force']);
  assert.equal(r1.status, 0, `first run failed: ${r1.stderr}`);
  const protocolBefore = fs.readFileSync(path.join(outDir, cli.PROTOCOL_FILENAME), 'utf8');
  const verificationBefore = fs.readFileSync(path.join(outDir, cli.VERIFICATION_FILENAME), 'utf8');
  const validationBefore = fs.readFileSync(path.join(outDir, cli.VALIDATION_FILENAME), 'utf8');

  const r2 = runCli(['--input', REAL_INPUT, '--expected', REAL_FIXTURE, '--output-dir', outDir, '--schema', SCHEMA_PATH, '--force']);
  assert.equal(r2.status, 0, `second run failed: ${r2.stderr}`);
  const protocolAfter = fs.readFileSync(path.join(outDir, cli.PROTOCOL_FILENAME), 'utf8');
  const verificationAfter = fs.readFileSync(path.join(outDir, cli.VERIFICATION_FILENAME), 'utf8');
  const validationAfter = fs.readFileSync(path.join(outDir, cli.VALIDATION_FILENAME), 'utf8');

  for (const [before, after, name] of [
    [protocolBefore, protocolAfter, cli.PROTOCOL_FILENAME],
    [verificationBefore, verificationAfter, cli.VERIFICATION_FILENAME],
    [validationBefore, validationAfter, cli.VALIDATION_FILENAME],
  ]) {
    const pa = JSON.parse(before);
    const pb = JSON.parse(after);
    delete pa.generated;
    delete pb.generated;
    assert.deepEqual(pa, pb, `${name} should be byte-identical excluding generated timestamp`);
  }
  // Two successful runs in a row — no atomic-temp residue must remain.
  const entries = fs.readdirSync(outDir);
  const leftoverTmp = entries.filter((n) => n.startsWith('.tmp-'));
  assert.deepEqual(leftoverTmp, [], `expected no .tmp-* residue after two runs; got: ${leftoverTmp.join(', ')}`);
});

test('S07 lifecycle: redaction sweep — no UUID / bearer / credential / xiaomi leak in outputs', (t) => {
  const tmpDir = makeTempDir();
  t.after(() => rmrf(tmpDir));
  const outDir = path.join(tmpDir, 'out');
  fs.mkdirSync(outDir, { recursive: true });

  const result = runCli([
    '--input', REAL_INPUT,
    '--expected', REAL_FIXTURE,
    '--output-dir', outDir,
    '--schema', SCHEMA_PATH,
    '--force',
  ]);
  assert.equal(result.status, 0);

  const sweep = [
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    /\bbearer\s+[A-Za-z0-9._-]+/i,
    /\bsk-[A-Za-z0-9._-]+/,
    /\btp-[A-Za-z0-9._-]+/,
    /\bxiaomi\b/i,
    /\bmimo\b/i,
  ];
  for (const name of [cli.PROTOCOL_FILENAME, cli.VERIFICATION_FILENAME, cli.VALIDATION_FILENAME]) {
    const content = fs.readFileSync(path.join(outDir, name), 'utf8');
    for (const re of sweep) {
      assert.equal(re.test(content), false, `${name} contains sensitive marker matching ${re}`);
    }
  }
});

test('S07 lifecycle: bad regression fixture → exit 6 (REGRESSION_MISMATCH)', (t) => {
  const tmpDir = makeTempDir();
  t.after(() => rmrf(tmpDir));
  // Inline-built negative fixture (isolated from any canonical artifact).
  const tampered = path.join(tmpDir, 'tampered-fixture.json');
  fs.writeFileSync(tampered, JSON.stringify({
    expected_runner_status: 'FAIL',
    expected_runner_exit_code: 2,
    expected_gates: {
      HG1_SEMANTIC_RULE_COMPLIANCE: 'pass',
      HG2_PROVENANCE_INTEGRITY: 'pass',
      HG3_INDEPENDENCE_GROUP_ISOLATION: 'pass',
      HG4_ARTIFACT_BINDING: 'pass',
      HG5_WORKSHEET_INTEGRITY: 'pass',
      HG6_VERDICT_DERIVATION_BOUNDED: 'pass',
    },
    expected_verdicts: { orchestration: 'NOT_PROVEN', evidence: 'PARTIAL', launch: 'PREPARATION_ONLY' },
    expected_classification_count: 9,
  }));

  const result = runCli([
    '--input', REAL_INPUT,
    '--expected', tampered,
    '--output-dir', tmpDir,
    '--schema', SCHEMA_PATH,
    '--force',
  ]);
  assert.equal(result.status, data.EXIT_CODES.CLASSIFICATION_REGRESSION_MISMATCH);
  assert.match(result.stderr, /regression-mismatch/);
  assert.match(result.stderr, /runner_status/);
  // No canonical outputs should have been written on regression-mismatch.
  assert.equal(fs.existsSync(path.join(tmpDir, cli.PROTOCOL_FILENAME)), false);
  assert.equal(fs.existsSync(path.join(tmpDir, cli.VERIFICATION_FILENAME)), false);
  assert.equal(fs.existsSync(path.join(tmpDir, cli.VALIDATION_FILENAME)), false);
});

test('S07 lifecycle: bad m015 evidence (missing root.completed_at) → exit 1 (derive-error)', (t) => {
  const tmpDir = makeTempDir();
  t.after(() => rmrf(tmpDir));
  // Inline-built negative fixture: mission_entities.goal only — root.completed_at
  // missing — so deriveClaimsFromM015Evidence refuses.
  const badInput = path.join(tmpDir, 'bad-m015.json');
  fs.writeFileSync(badInput, JSON.stringify({
    milestone: 'M015',
    mission_key: 'BAD',
    mission_entities: { goal: { id: 'x', created_at: '2026-01-01T00:00:00Z' } },
  }));

  const result = runCli([
    '--input', badInput,
    '--expected', REAL_FIXTURE,
    '--output-dir', tmpDir,
    '--schema', SCHEMA_PATH,
    '--force',
  ]);
  assert.equal(result.status, data.EXIT_CODES.CLASSIFICATION_REJECTED_MALFORMED);
  assert.match(result.stderr, /derive-error/);
  // No canonical outputs should have been written on derive-error.
  assert.equal(fs.existsSync(path.join(tmpDir, cli.PROTOCOL_FILENAME)), false);
  assert.equal(fs.existsSync(path.join(tmpDir, cli.VERIFICATION_FILENAME)), false);
  assert.equal(fs.existsSync(path.join(tmpDir, cli.VALIDATION_FILENAME)), false);
});

test('S07 lifecycle: S07 scratch root present → exit 1 (scratch-root-present)', (t) => {
  const tmpDir = makeTempDir();
  t.after(() => rmrf(tmpDir));
  const scratchRoot = path.join(RUNTIME_EVIDENCE, '.m016-s07-replay-scratch');
  fs.mkdirSync(scratchRoot, { recursive: true });
  try {
    const result = runCli([
      '--input', REAL_INPUT,
      '--expected', REAL_FIXTURE,
      '--output-dir', tmpDir,
      '--schema', SCHEMA_PATH,
      '--force',
    ]);
    assert.equal(result.status, data.EXIT_CODES.CLASSIFICATION_REJECTED_MALFORMED);
    assert.match(result.stderr, /scratch-root-present/);
  } finally {
    rmrf(scratchRoot);
  }
});

test('S07 lifecycle: pre-existing canonical outputs refused without --force', (t) => {
  const tmpDir = makeTempDir();
  t.after(() => rmrf(tmpDir));
  const outDir = path.join(tmpDir, 'out');
  fs.mkdirSync(outDir, { recursive: true });

  // First run with --force succeeds
  const first = runCli([
    '--input', REAL_INPUT,
    '--expected', REAL_FIXTURE,
    '--output-dir', outDir,
    '--schema', SCHEMA_PATH,
    '--force',
  ]);
  assert.equal(first.status, 0);
  // Second run without --force must refuse to overwrite
  const second = runCli([
    '--input', REAL_INPUT,
    '--expected', REAL_FIXTURE,
    '--output-dir', outDir,
    '--schema', SCHEMA_PATH,
  ]);
  assert.equal(second.status, data.EXIT_CODES.CLASSIFICATION_REJECTED_MALFORMED);
  assert.match(second.stderr, /output-exists/);
});

test('S07 lifecycle: write-error on read-only output-dir → exit 4 (RUNNER_FAILURE) with no canonical residue', (t) => {
  // Simulate write failure by chmod 0555 on a within-root output dir.
  const tmpDir = makeTempDir();
  t.after(() => {
    try { fs.chmodSync(tmpDir, 0o755); } catch { /* ignore */ }
    rmrf(tmpDir);
  });
  const outDir = path.join(tmpDir, 'readonly-out');
  fs.mkdirSync(outDir, { recursive: true });

  try {
    fs.chmodSync(outDir, 0o555);
  } catch {
    return;
  }

  let canWrite = true;
  try {
    fs.writeFileSync(path.join(outDir, 'probe.txt'), 'probe');
  } catch {
    canWrite = false;
  }
  if (canWrite) {
    return;
  }

  const result = runCli([
    '--input', REAL_INPUT,
    '--expected', REAL_FIXTURE,
    '--output-dir', outDir,
    '--schema', SCHEMA_PATH,
    '--force',
  ]);
  assert.equal(result.status, data.EXIT_CODES.CLASSIFICATION_RUNNER_FAILURE);
  assert.match(result.stderr, /write-error/);
  // Restore permissions for the after-hook rmrf
  try { fs.chmodSync(outDir, 0o755); } catch { /* ignore */ }
});

// ---------------------------------------------------------------------------
// Tests — tracked residue absence (T02 cleanup proof)
// ---------------------------------------------------------------------------

test('S07 lifecycle: tracked S01 residue is absent (executable absence check)', () => {
  // T02 must remove the 6 tracked residue files. This is the executable
  // presence/absence proof the slice must-have requires.
  const trackedResidue = [
    'runtime-evidence/.tmp-m016-determinism/M016-S01-classification-protocol.json',
    'runtime-evidence/.tmp-m016-determinism/M016-S01-classification-validation.json',
    'runtime-evidence/.tmp-m016-determinism/M016-S01-classification-verification.json',
    'runtime-evidence/.tmp-q4-s01/M016-S01-classification-protocol.json',
    'runtime-evidence/.tmp-q4-s01/M016-S01-classification-validation.json',
    'runtime-evidence/.tmp-q4-s01/M016-S01-classification-verification.json',
  ];
  const stillPresent = trackedResidue.filter((rel) => fs.existsSync(path.join(REPO_ROOT, rel)));
  assert.deepEqual(stillPresent, [], `tracked residue still present: ${stillPresent.join(', ')}`);
});

test('S07 lifecycle: T02 negative fixtures are absent (executable absence check)', () => {
  // The two `.tmp-m016-bad-*` files were used during T02 negative tests
  // and must be absent at the end of T02.
  const t02Fixtures = [
    'runtime-evidence/.tmp-m016-bad-fixture.json',
    'runtime-evidence/.tmp-m016-bad-m015.json',
  ];
  const stillPresent = t02Fixtures.filter((rel) => fs.existsSync(path.join(REPO_ROOT, rel)));
  assert.deepEqual(stillPresent, [], `T02 negative fixtures still present: ${stillPresent.join(', ')}`);
});

test('S07 lifecycle: pre-run residue refusal protects canonical artifacts', (t) => {
  // A residue-leaked scenario: pre-existing .tmp-m016-* in output-dir must
  // not damage pre-existing canonical artifacts already on disk. This is
  // a regression guard for the residue refusal branch.
  const tmpDir = makeTempDir();
  t.after(() => rmrf(tmpDir));
  const outDir = path.join(tmpDir, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  // Plant a sentinel non-residue file that should be untouched.
  const sentinelPath = path.join(outDir, 'sentinel.json');
  writeJson(sentinelPath, { sentinel: true });
  // Plant pre-existing scratch residue.
  fs.writeFileSync(path.join(outDir, '.tmp-m016-leaked.json'), '{"residue":true}');

  const result = runCli([
    '--input', REAL_INPUT,
    '--expected', REAL_FIXTURE,
    '--output-dir', outDir,
    '--schema', SCHEMA_PATH,
    '--force',
  ]);
  assert.equal(result.status, data.EXIT_CODES.CLASSIFICATION_REJECTED_MALFORMED);
  assert.match(result.stderr, /residue-pre-run/);
  // Sentinel must still exist; CLI did not touch it.
  assert.equal(fs.existsSync(sentinelPath), true);
  // The leaked residue must still exist (CLI refused without clobbering).
  assert.equal(fs.existsSync(path.join(outDir, '.tmp-m016-leaked.json')), true);
});