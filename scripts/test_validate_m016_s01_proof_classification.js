#!/usr/bin/env node
'use strict';

/**
 * scripts/test_validate_m016_s01_proof_classification.js
 *
 * M016-txa3vu / S01 / T04 — Regression and fail-closed negative suite for
 * the offline CLI `scripts/validate_m016_s01_proof_classification.js`.
 *
 * Uses node:test. Covers:
 *   (a) Public API of the CLI module — helpers exported via require()
 *       (parseArgs, resolveSafePath, isWithinRoot, deriveClaimsFromM015Evidence,
 *       compareToFixture, and the canonical output filenames).
 *   (b) Pure-helper unit tests — argument parsing, safe-path resolution,
 *       repo-root containment, deterministic claim derivation, and
 *       regression-mismatch diff construction.
 *   (c) CLI integration via child_process.spawnSync — happy-path
 *       (writes protocol/verification/validation JSON, deterministic
 *       outputs across two sequential runs, redaction sweep), and the
 *       full fail-closed negative suite (arg-error, path-error,
 *       input-missing, load-error, derive-error, regression-mismatch,
 *       output-exists, write-error).
 *
 * All CLI integration tests run against isolated temp directories under
 * `runtime-evidence/.tmp-m016-s01-test-<id>/` (within the repo root) and
 * are cleaned up in `t.after` hooks. No test writes to the canonical
 * `runtime-evidence/M016-S01-classification-*.json` artifacts; only the
 * orchestrator's verify command may regenerate those.
 *
 * Run with:
 *   node --test scripts/test_m016_s01_classification_contract.js \
 *                   scripts/test_validate_m016_s01_proof_classification.js
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

// ---------------------------------------------------------------------------
// Helpers — temp-dir lifecycle + spawn helper.
// ---------------------------------------------------------------------------

function makeTempDir(label = 'm016-s01-test') {
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runCli(args, opts = {}) {
  const cwd = opts.cwd || REPO_ROOT;
  const env = Object.assign({}, process.env, opts.env || {});
  const result = spawnSync(NODE_BIN, [cli.__filename || path.join(__dirname, 'validate_m016_s01_proof_classification.js'), ...args], {
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

function buildGoodFixture(overrides = {}) {
  // Minimal M015 evidence that the CLI accepts. The CLI extracts
  // mission_entities.root.completed_at and mission_entities.goal.created_at;
  // other shape keys are ignored by deriveClaimsFromM015Evidence.
  return Object.assign({
    mission_entities: {
      goal: {
        id: 'goal-test',
        created_at: '2026-07-17T12:00:00Z',
      },
      root: {
        id: 'root-test',
        completed_at: '2026-07-17T13:00:00Z',
      },
    },
  }, overrides);
}

function buildMismatchedFixture() {
  // Same structure as the real fixture but with diverged expected values
  // so compareToFixture produces a non-empty diff list.
  return {
    $schema: 'gsd/m016-s01-regression-fixture-v1',
    milestone: 'M016-txa3vu',
    slice: 'S01',
    expected_runner_status: 'FAIL',
    expected_runner_exit_code: 2,
    expected_classification_count: 9,
    expected_gates: {
      HG1_SEMANTIC_RULE_COMPLIANCE: 'pass',
      HG2_PROVENANCE_INTEGRITY: 'pass',
      HG3_INDEPENDENCE_GROUP_ISOLATION: 'pass',
      HG4_ARTIFACT_BINDING: 'pass',
      HG5_WORKSHEET_INTEGRITY: 'pass',
      HG6_VERDICT_DERIVATION_BOUNDED: 'pass',
    },
    expected_verdicts: {
      orchestration: 'NOT_PROVEN',
      evidence: 'NOT_PROVEN',
      launch: 'NOT_PROVEN',
    },
  };
}

// ---------------------------------------------------------------------------
// Tests — CLI module public API
// ---------------------------------------------------------------------------

test('CLI: module exports the documented public API', () => {
  assert.equal(typeof cli.parseArgs, 'function');
  assert.equal(typeof cli.resolveSafePath, 'function');
  assert.equal(typeof cli.isWithinRoot, 'function');
  assert.equal(typeof cli.deriveClaimsFromM015Evidence, 'function');
  assert.equal(typeof cli.compareToFixture, 'function');
  assert.equal(cli.PROTOCOL_FILENAME, 'M016-S01-classification-protocol.json');
  assert.equal(cli.VERIFICATION_FILENAME, 'M016-S01-classification-verification.json');
  assert.equal(cli.VALIDATION_FILENAME, 'M016-S01-classification-validation.json');
});

test('CLI: PROTOCOL_FILENAME / VERIFICATION_FILENAME / VALIDATION_FILENAME are distinct and frozen', () => {
  const set = new Set([cli.PROTOCOL_FILENAME, cli.VERIFICATION_FILENAME, cli.VALIDATION_FILENAME]);
  assert.equal(set.size, 3);
});

// ---------------------------------------------------------------------------
// Tests — parseArgs
// ---------------------------------------------------------------------------

test('parseArgs: throws when no required args are provided', () => {
  assert.throws(() => cli.parseArgs([]), /--input required/);
});

test('parseArgs: schema defaults to DEFAULTS.schema_path when --schema omitted', () => {
  const args = cli.parseArgs([
    '--input', 'a.json',
    '--expected', 'b.json',
    '--output-dir', 'out',
  ]);
  assert.equal(args.schema, data.DEFAULTS.schema_path);
  assert.equal(args.force, false);
});

test('parseArgs: captures --input / --expected / --output-dir / --schema / --force', () => {
  const args = cli.parseArgs([
    '--input', 'a.json',
    '--expected', 'b.json',
    '--output-dir', 'out',
    '--schema', 'schemas/x.json',
    '--force',
  ]);
  assert.equal(args.input, 'a.json');
  assert.equal(args.expected, 'b.json');
  assert.equal(args.outputDir, 'out');
  assert.equal(args.schema, 'schemas/x.json');
  assert.equal(args.force, true);
});

test('parseArgs: throws on unknown flag', () => {
  assert.throws(() => cli.parseArgs(['--bogus-flag']), /unknown arg/);
});

// ---------------------------------------------------------------------------
// Tests — resolveSafePath
// ---------------------------------------------------------------------------

test('resolveSafePath: rejects NUL byte in path', () => {
  assert.throws(() => cli.resolveSafePath('a\0b', '/tmp'), /NUL/);
});

test('resolveSafePath: rejects empty path', () => {
  assert.throws(() => cli.resolveSafePath('', '/tmp'), /path empty/);
  assert.throws(() => cli.resolveSafePath(null, '/tmp'), /path empty/);
});

test('resolveSafePath: relative path resolves against baseDir', () => {
  const p = cli.resolveSafePath('sub/x.json', '/tmp/base');
  assert.equal(p, path.resolve('/tmp/base', 'sub/x.json'));
});

test('resolveSafePath: absolute path ignores baseDir', () => {
  const p = cli.resolveSafePath('/var/data/x.json', '/tmp/base');
  assert.equal(p, path.resolve('/var/data/x.json'));
});

// ---------------------------------------------------------------------------
// Tests — isWithinRoot
// ---------------------------------------------------------------------------

test('isWithinRoot: path inside REPO_ROOT returns true', () => {
  assert.equal(cli.isWithinRoot(path.join(REPO_ROOT, 'runtime-evidence/x.json')), true);
});

test('isWithinRoot: path outside REPO_ROOT returns false', () => {
  assert.equal(cli.isWithinRoot('/tmp/m016-s01-outside.json'), false);
  assert.equal(cli.isWithinRoot(path.join(REPO_ROOT, '../outside-root.json')), false);
});

// ---------------------------------------------------------------------------
// Tests — deriveClaimsFromM015Evidence
// ---------------------------------------------------------------------------

test('deriveClaimsFromM015Evidence: derives 9 EXECUTED claims from a minimal fixture', () => {
  const claims = cli.deriveClaimsFromM015Evidence(buildGoodFixture());
  assert.equal(claims.length, 9);
  for (const claim of claims) {
    assert.equal(claim.semantic_rule, 'EXECUTED');
    assert.equal(typeof claim.executed_provenance, 'object');
    assert.equal(typeof claim.executed_provenance.artifact_hash, 'string');
    assert.match(claim.executed_provenance.artifact_hash, /^[0-9a-f]{64}$/);
    assert.ok(['orchestration', 'evidence', 'launch'].includes(claim.verdict_dimension));
    assert.ok(typeof claim.worksheet === 'object' && Array.isArray(claim.worksheet.steps) && claim.worksheet.steps.length >= 1);
  }
});

test('deriveClaimsFromM015Evidence: claim dimensions follow canonical distribution (7/1/1)', () => {
  const claims = cli.deriveClaimsFromM015Evidence(buildGoodFixture());
  const dist = claims.reduce((acc, c) => {
    acc[c.verdict_dimension] = (acc[c.verdict_dimension] || 0) + 1;
    return acc;
  }, {});
  assert.equal(dist.orchestration, 7);
  assert.equal(dist.evidence, 1);
  assert.equal(dist.launch, 1);
});

test('deriveClaimsFromM015Evidence: deterministic — same input → identical output', () => {
  const fixture = buildGoodFixture();
  const r1 = cli.deriveClaimsFromM015Evidence(fixture);
  const r2 = cli.deriveClaimsFromM015Evidence(fixture);
  assert.deepEqual(r1, r2);
});

test('deriveClaimsFromM015Evidence: throws on non-object m015 evidence', () => {
  assert.throws(() => cli.deriveClaimsFromM015Evidence(null), /not an object/);
  assert.throws(() => cli.deriveClaimsFromM015Evidence('string'), /not an object/);
});

test('deriveClaimsFromM015Evidence: throws when mission_entities.root.completed_at is missing', () => {
  const bad = { mission_entities: { goal: { created_at: '2026-07-17T12:00:00Z' } } };
  assert.throws(() => cli.deriveClaimsFromM015Evidence(bad), /root\.completed_at/);
});

test('deriveClaimsFromM015Evidence: throws when mission_entities.goal.created_at is missing', () => {
  const bad = { mission_entities: { root: { completed_at: '2026-07-17T12:00:00Z' } } };
  assert.throws(() => cli.deriveClaimsFromM015Evidence(bad), /goal\.created_at/);
});

// ---------------------------------------------------------------------------
// Tests — compareToFixture
// ---------------------------------------------------------------------------

test('compareToFixture: matching actual and expected yields zero diffs', () => {
  const actual = {
    runner_status: 'PASS',
    runner_exit_code: 0,
    gates: {
      HG1_SEMANTIC_RULE_COMPLIANCE: 'pass',
      HG2_PROVENANCE_INTEGRITY: 'pass',
      HG3_INDEPENDENCE_GROUP_ISOLATION: 'pass',
      HG4_ARTIFACT_BINDING: 'pass',
      HG5_WORKSHEET_INTEGRITY: 'pass',
      HG6_VERDICT_DERIVATION_BOUNDED: 'pass',
    },
    verdicts: { orchestration: 'PASS', evidence: 'PARTIAL', launch: 'PREPARATION_ONLY' },
    classifications: new Array(9).fill({}),
  };
  const expected = {
    expected_runner_status: 'PASS',
    expected_runner_exit_code: 0,
    expected_gates: actual.gates,
    expected_verdicts: actual.verdicts,
    expected_classification_count: 9,
  };
  const diffs = cli.compareToFixture(actual, expected);
  assert.deepEqual(diffs, []);
});

test('compareToFixture: divergence in runner_status produces diff entry', () => {
  const diffs = cli.compareToFixture(
    { runner_status: 'PASS', runner_exit_code: 0, gates: {}, verdicts: {}, classifications: [] },
    { expected_runner_status: 'FAIL' },
  );
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].field, 'runner_status');
  assert.equal(diffs[0].expected, 'FAIL');
  assert.equal(diffs[0].actual, 'PASS');
});

test('compareToFixture: divergence in expected_verdicts.orchestration produces diff entry', () => {
  const diffs = cli.compareToFixture(
    { runner_status: 'PASS', runner_exit_code: 0, gates: {}, verdicts: { orchestration: 'PASS' }, classifications: [] },
    { expected_verdicts: { orchestration: 'NOT_PROVEN' } },
  );
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].field, 'verdicts.orchestration');
});

test('compareToFixture: missing gates / verdicts keys treated as divergence', () => {
  const diffs = cli.compareToFixture(
    { runner_status: 'PASS', runner_exit_code: 0, gates: {}, verdicts: {}, classifications: [] },
    { expected_gates: { HG1_SEMANTIC_RULE_COMPLIANCE: 'pass' }, expected_verdicts: { launch: 'PREPARATION_ONLY' } },
  );
  assert.equal(diffs.length, 2);
  assert.ok(diffs.some((d) => d.field === 'gates.HG1_SEMANTIC_RULE_COMPLIANCE' && d.actual === '<missing>'));
  assert.ok(diffs.some((d) => d.field === 'verdicts.launch' && d.actual === '<missing>'));
});

// ---------------------------------------------------------------------------
// Tests — CLI integration: happy path via spawnSync
// ---------------------------------------------------------------------------

test('CLI integration: happy path writes 3 canonical outputs and exits 0 with --force', (t) => {
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
  assert.equal(result.status, 0, `unexpected exit ${result.status}; stderr=${result.stderr}`);
  assert.match(result.stdout, /M016_S01_VALIDATE=PASS/);
  assert.match(result.stdout, /orchestration=PASS/);
  assert.match(result.stdout, /evidence=PARTIAL/);
  assert.match(result.stdout, /launch=PREPARATION_ONLY/);
  assert.match(result.stdout, /claims=9/);

  const protocol = readJson(path.join(outDir, cli.PROTOCOL_FILENAME));
  const verification = readJson(path.join(outDir, cli.VERIFICATION_FILENAME));
  const validation = readJson(path.join(outDir, cli.VALIDATION_FILENAME));

  assert.equal(protocol.$schema, data.DEFAULTS.protocol_schema);
  assert.equal(verification.$schema, data.DEFAULTS.verification_schema);
  assert.equal(validation.$schema, data.DEFAULTS.validation_schema);
  assert.equal(protocol.verdicts.orchestration, 'PASS');
  assert.equal(protocol.verdicts.evidence, 'PARTIAL');
  assert.equal(protocol.verdicts.launch, 'PREPARATION_ONLY');
  assert.equal(verification.per_claim_classification.length, 9);
  assert.equal(validation.regression.expected_verdicts.orchestration, 'PASS');
  // All six HG states must be pass.
  for (const gate of Object.keys(protocol.gates)) {
    assert.equal(protocol.gates[gate], 'pass', `gate ${gate} should be pass`);
  }
});

test('CLI integration: redaction sweep — no UUID / bearer / credential / xiaomi leak in outputs', (t) => {
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
  const outputFiles = [cli.PROTOCOL_FILENAME, cli.VERIFICATION_FILENAME, cli.VALIDATION_FILENAME];
  for (const name of outputFiles) {
    const content = fs.readFileSync(path.join(outDir, name), 'utf8');
    for (const re of sweep) {
      assert.equal(re.test(content), false, `${name} contains sensitive marker matching ${re}`);
    }
  }
});

test('CLI integration: determinism — two sequential --force runs to the same outDir produce byte-identical structural content', (t) => {
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
});

// ---------------------------------------------------------------------------
// Tests — CLI integration: fail-closed negative suite
// ---------------------------------------------------------------------------

test('CLI integration: unknown arg → exit 1 (REJECTED_MALFORMED), stderr mentions unknown arg', (t) => {
  const tmpDir = makeTempDir();
  t.after(() => rmrf(tmpDir));
  const result = runCli([
    '--input', REAL_INPUT,
    '--expected', REAL_FIXTURE,
    '--output-dir', tmpDir,
    '--bogus-flag',
  ]);
  assert.equal(result.status, data.EXIT_CODES.CLASSIFICATION_REJECTED_MALFORMED);
  assert.match(result.stderr, /arg-error.*unknown arg/);
});

test('CLI integration: missing --input → exit 1 (REJECTED_MALFORMED)', (t) => {
  const tmpDir = makeTempDir();
  t.after(() => rmrf(tmpDir));
  const result = runCli([
    '--expected', REAL_FIXTURE,
    '--output-dir', tmpDir,
  ]);
  assert.equal(result.status, data.EXIT_CODES.CLASSIFICATION_REJECTED_MALFORMED);
  assert.match(result.stderr, /arg-error.*--input required/);
});

test('CLI integration: missing --expected → exit 1 (REJECTED_MALFORMED)', (t) => {
  const tmpDir = makeTempDir();
  t.after(() => rmrf(tmpDir));
  const result = runCli([
    '--input', REAL_INPUT,
    '--output-dir', tmpDir,
  ]);
  assert.equal(result.status, data.EXIT_CODES.CLASSIFICATION_REJECTED_MALFORMED);
  assert.match(result.stderr, /arg-error.*--expected required/);
});

test('CLI integration: missing --output-dir → exit 1 (REJECTED_MALFORMED)', (t) => {
  const tmpDir = makeTempDir();
  t.after(() => rmrf(tmpDir));
  const result = runCli([
    '--input', REAL_INPUT,
    '--expected', REAL_FIXTURE,
  ]);
  assert.equal(result.status, data.EXIT_CODES.CLASSIFICATION_REJECTED_MALFORMED);
  assert.match(result.stderr, /arg-error.*--output-dir required/);
});

test('CLI integration: missing input file → exit 1 (input-missing)', (t) => {
  const tmpDir = makeTempDir();
  t.after(() => rmrf(tmpDir));
  const ghost = path.join(tmpDir, 'ghost-input.json');
  const result = runCli([
    '--input', ghost,
    '--expected', REAL_FIXTURE,
    '--output-dir', tmpDir,
    '--force',
  ]);
  assert.equal(result.status, data.EXIT_CODES.CLASSIFICATION_REJECTED_MALFORMED);
  assert.match(result.stderr, /input-missing/);
});

test('CLI integration: malformed JSON input → exit 1 (load-error)', (t) => {
  const tmpDir = makeTempDir();
  t.after(() => rmrf(tmpDir));
  const badInput = path.join(tmpDir, 'malformed-input.json');
  fs.writeFileSync(badInput, '{ "this is not": valid json,, ');
  const result = runCli([
    '--input', badInput,
    '--expected', REAL_FIXTURE,
    '--output-dir', tmpDir,
    '--force',
  ]);
  assert.equal(result.status, data.EXIT_CODES.CLASSIFICATION_REJECTED_MALFORMED);
  assert.match(result.stderr, /load-error/);
});

test('CLI integration: m015 evidence missing required fields → exit 1 (derive-error)', (t) => {
  const tmpDir = makeTempDir();
  t.after(() => rmrf(tmpDir));
  const badM015 = path.join(tmpDir, 'bad-m015.json');
  writeJson(badM015, {
    milestone: 'M015',
    mission_entities: {
      goal: { id: 'x', created_at: '2026-01-01T00:00:00Z' },
      // root.completed_at is intentionally missing
    },
  });
  const result = runCli([
    '--input', badM015,
    '--expected', REAL_FIXTURE,
    '--output-dir', tmpDir,
    '--force',
  ]);
  assert.equal(result.status, data.EXIT_CODES.CLASSIFICATION_REJECTED_MALFORMED);
  assert.match(result.stderr, /derive-error/);
});

test('CLI integration: regression fixture mismatch → exit 6 (REGRESSION_MISMATCH) with diff list in stderr', (t) => {
  const tmpDir = makeTempDir();
  t.after(() => rmrf(tmpDir));
  const tampered = path.join(tmpDir, 'tampered-fixture.json');
  writeJson(tampered, buildMismatchedFixture());

  const result = runCli([
    '--input', REAL_INPUT,
    '--expected', tampered,
    '--output-dir', tmpDir,
    '--schema', SCHEMA_PATH,
    '--force',
  ]);
  assert.equal(result.status, data.EXIT_CODES.CLASSIFICATION_REGRESSION_MISMATCH);
  assert.match(result.stderr, /regression-mismatch/);
  // Diff list must be present in stderr
  assert.match(result.stderr, /runner_status/);
  assert.match(result.stderr, /verdicts\.orchestration/);
});

test('CLI integration: refuse to overwrite pre-existing outputs without --force → exit 1', (t) => {
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

test('CLI integration: --force flag permits overwrite of existing outputs', (t) => {
  const tmpDir = makeTempDir();
  t.after(() => rmrf(tmpDir));
  const outDir = path.join(tmpDir, 'out');
  fs.mkdirSync(outDir, { recursive: true });

  const first = runCli(['--input', REAL_INPUT, '--expected', REAL_FIXTURE, '--output-dir', outDir, '--schema', SCHEMA_PATH, '--force']);
  assert.equal(first.status, 0);

  const beforeProto = fs.readFileSync(path.join(outDir, cli.PROTOCOL_FILENAME), 'utf8');
  // Wait briefly so the timestamp differs.
  const waitMs = 50;
  const start = Date.now();
  while (Date.now() - start < waitMs) { /* spin */ }

  const second = runCli(['--input', REAL_INPUT, '--expected', REAL_FIXTURE, '--output-dir', outDir, '--schema', SCHEMA_PATH, '--force']);
  assert.equal(second.status, 0);

  const afterProto = fs.readFileSync(path.join(outDir, cli.PROTOCOL_FILENAME), 'utf8');
  // Output content must be byte-identical (deterministic), so files are
  // identical aside from the atomic-rename tmp suffix.
  assert.equal(fs.existsSync(path.join(outDir, cli.PROTOCOL_FILENAME)), true);
  assert.equal(fs.existsSync(path.join(outDir, cli.VERIFICATION_FILENAME)), true);
  assert.equal(fs.existsSync(path.join(outDir, cli.VALIDATION_FILENAME)), true);
  // Protocol JSON parsed structure must be unchanged (regenerated content equals prior).
  assert.deepEqual(JSON.parse(beforeProto).verdicts, JSON.parse(afterProto).verdicts);
});

test('CLI integration: --help prints usage and exits 0', (t) => {
  const tmpDir = makeTempDir();
  t.after(() => rmrf(tmpDir));
  const result = runCli(['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /--input/);
  assert.match(result.stdout, /--expected/);
  assert.match(result.stdout, /--output-dir/);
});

// Note: the NUL-byte CLI guard cannot be exercised through child_process
// (Node spawnSync itself rejects NUL bytes before the CLI starts). The
// `resolveSafePath: rejects NUL byte in path` helper test above asserts the
// equivalent contract directly via require().

test('CLI integration: --output-dir outside repo root → exit 1 (path-error)', (t) => {
  const tmpDir = makeTempDir();
  t.after(() => rmrf(tmpDir));
  const result = runCli([
    '--input', REAL_INPUT,
    '--expected', REAL_FIXTURE,
    '--output-dir', '/tmp/m016-s01-outside-root-target',
    '--force',
  ]);
  assert.equal(result.status, data.EXIT_CODES.CLASSIFICATION_REJECTED_MALFORMED);
  assert.match(result.stderr, /path-error.*outside repo root/);
});

test('CLI integration: write-error on read-only output-dir → exit 4 (RUNNER_FAILURE)', (t) => {
  // Simulate write failure by chmod 0555 on a within-root output dir.
  // This is best-effort; on systems that ignore chmod (e.g. running as
  // root) the test is skipped to avoid a false negative.
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
    // Cannot chmod (likely running as root); skip the test.
    return;
  }

  // Verify we really cannot write into the dir.
  let canWrite = true;
  try {
    fs.writeFileSync(path.join(outDir, 'probe.txt'), 'probe');
  } catch {
    canWrite = false;
  }
  if (canWrite) {
    // chmod was ineffective (e.g. POSIX ACLs, container mounts); skip.
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
});

test('CLI integration: malformed JSON in regression fixture → exit 1 (load-error)', (t) => {
  const tmpDir = makeTempDir();
  t.after(() => rmrf(tmpDir));
  const badFixture = path.join(tmpDir, 'bad-fixture.json');
  fs.writeFileSync(badFixture, '{ this is not valid json ');
  const result = runCli([
    '--input', REAL_INPUT,
    '--expected', badFixture,
    '--output-dir', tmpDir,
    '--schema', SCHEMA_PATH,
    '--force',
  ]);
  assert.equal(result.status, data.EXIT_CODES.CLASSIFICATION_REJECTED_MALFORMED);
  assert.match(result.stderr, /load-error/);
});

test('CLI integration: bad regression fixture → exit 6 (REGRESSION_MISMATCH)', (t) => {
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
});

test('CLI integration: bad m015 evidence (missing root.completed_at) → exit 1 (derive-error)', (t) => {
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
  assert.match(result.stderr, /required timestamps/);
});

// ---------------------------------------------------------------------------
// Tests — T02 S07 hardening additions
// ---------------------------------------------------------------------------

test('deriveClaimsFromM015Evidence: accepts top-level generated when mission_entities is missing (fallback chain)', () => {
  // New M015 evidence shape — no mission_entities block, uses top-level generated.
  const m015 = {
    milestone: 'M015',
    generated: '2026-07-17T12:00:00.000Z',
    verdict: { native_paperclip_mission: 'PASS' },
  };
  const claims = cli.deriveClaimsFromM015Evidence(m015);
  assert.equal(claims.length, 9);
  for (const claim of claims) {
    assert.equal(claim.executed_provenance.started_at, '2026-07-17T12:00:00.000Z');
    assert.equal(claim.executed_provenance.ended_at, '2026-07-17T12:00:00.000Z');
    assert.equal(claim.worksheet.completed_at, '2026-07-17T12:00:00.000Z');
  }
});

test('deriveClaimsFromM015Evidence: legacy mission_entities shape is preferred when both are present', () => {
  const m015 = {
    generated: '2026-07-17T99:99:99.000Z', // bogus top-level value
    mission_entities: {
      goal: { id: 'g', created_at: '2026-07-17T12:00:00Z' },
      root: { id: 'r', completed_at: '2026-07-17T13:00:00Z' },
    },
  };
  const claims = cli.deriveClaimsFromM015Evidence(m015);
  assert.equal(claims.length, 9);
  // Legacy mission_entities.* must win over top-level generated
  assert.equal(claims[0].executed_provenance.started_at, '2026-07-17T12:00:00Z');
  assert.equal(claims[0].executed_provenance.ended_at, '2026-07-17T13:00:00Z');
});

test('deriveClaimsFromM015Evidence: throws when neither legacy nor top-level timestamps are present', () => {
  const m015 = { milestone: 'M015', verdict: {} };
  assert.throws(() => cli.deriveClaimsFromM015Evidence(m015), /required timestamps/);
});

test('isWithinRoot: realpath containment rejects symlink escape to outside-root', (t) => {
  // Create a symlink inside repo root that points outside. Lexical
  // containment would pass this; realpath containment must reject it.
  const tmpDir = makeTempDir();
  t.after(() => rmrf(tmpDir));
  const symlinkPath = path.join(tmpDir, 'escape-link');
  try {
    fs.symlinkSync('/tmp', symlinkPath, 'dir');
  } catch {
    // symlinks may not be supported on this filesystem; skip silently.
    return;
  }
  assert.equal(cli.isWithinRoot(symlinkPath), false,
    'symlink to /tmp must NOT be treated as inside-root');
});

test('CLI integration: pre-run residue refusal — .tmp-m016-* in output-dir → exit 1 (residue-pre-run)', (t) => {
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

test('CLI integration: S07 scratch root present → exit 1 (scratch-root-present)', (t) => {
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

test('CLI integration: post-run absence — no atomic temp residue after successful run', (t) => {
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
  // After a clean successful run, no `.tmp-*` files must remain in outDir.
  const entries = fs.readdirSync(outDir);
  const leftoverTmp = entries.filter((n) => n.startsWith('.tmp-'));
  assert.deepEqual(leftoverTmp, [], `expected no .tmp-* residue after success; got: ${leftoverTmp.join(', ')}`);
});
