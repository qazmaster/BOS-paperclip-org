#!/usr/bin/env node
'use strict';

/**
 * scripts/test_m016_s07_replay_cleanup_integration.js
 *
 * M016-txa3vu / S07 / T03 — Integration tests for the policy-compliant
 * replay cleanup proof verifier. These tests exercise the verifier
 * (scripts/verify_m016_s07_replay_cleanup_proof.js) end-to-end via
 * child_process.spawnSync and verify:
 *
 *   - End-to-end PASS run produces a canonical proof sidecar with all
 *     expected fields, fresh source/output hashes, frozen verdict triple,
 *     and a matching semantic_digest
 *   - Two sequential runs produce IDENTICAL semantic_digest (reproducibility)
 *   - Pre-run absence: scratch root leftover triggers pre-existing-residue
 *     refusal (exit 7, CLEANUP_RESIDUE_DRIFT)
 *   - Overwrite refusal: canonical proof sidecar at default --output-dir
 *     refuses without --force (exit 1, CLEANUP_REJECTED_MALFORMED)
 *   - Pre-run absence: post-run scratch root is absent (cleanup invariant)
 *   - Pre-run absence: no atomic temp residue leaks into runtime-evidence/
 *   - Verifier subprocess invocation count is exactly 1 (single replay)
 *   - Verifier produces S01-bound canonical verdict line on stdout
 *
 * Uses node:test. Each test runs the verifier via spawnSync against a
 * temp --output-dir under runtime-evidence/.tmp-m016-s07-t03-<id>/ so the
 * integration tests never touch the canonical runtime-evidence/ outputs.
 *
 * Run with: node --test scripts/test_m016_s07_replay_cleanup_integration.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const data = require('./lib/m016-s07-replay-cleanup-data');

const REPO_ROOT = path.resolve(__dirname, '..');
const RUNTIME_EVIDENCE = path.join(REPO_ROOT, 'runtime-evidence');
const SCRATCH_ABS = path.join(RUNTIME_EVIDENCE, '.m016-s07-replay-scratch');
const NODE_BIN = process.execPath;
const VERIFIER_PATH = path.join(__dirname, 'verify_m016_s07_replay_cleanup_proof.js');

const PROOF_FILENAME = 'M016-S07-replay-cleanup-proof.json';

// ---------------------------------------------------------------------------
// Helpers — temp-dir lifecycle + spawn helper.
// ---------------------------------------------------------------------------

function makeTempDir(label = 'm016-s07-t03') {
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

function runVerifier(args, opts = {}) {
  const cwd = opts.cwd || REPO_ROOT;
  const env = Object.assign({}, process.env, opts.env || {});
  const result = spawnSync(NODE_BIN, [VERIFIER_PATH, ...args], {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60000,
  });
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error,
  };
}

function readProofSidecar(outputDir) {
  const fp = path.join(outputDir, PROOF_FILENAME);
  if (!fs.existsSync(fp)) return null;
  const raw = fs.readFileSync(fp, 'utf8');
  return JSON.parse(raw);
}

function readCanonicalProofSidecar() {
  const fp = path.join(RUNTIME_EVIDENCE, PROOF_FILENAME);
  if (!fs.existsSync(fp)) return null;
  const raw = fs.readFileSync(fp, 'utf8');
  return JSON.parse(raw);
}

function ensureScratchAbsent() {
  // Defensive: each test starts with scratch absent. If scratch somehow
  // leaked from a prior interrupted run, clean it up.
  if (fs.existsSync(SCRATCH_ABS)) {
    rmrf(SCRATCH_ABS);
  }
}

function registerCleanup(t, dir, alsoScratch) {
  t.after(() => {
    rmrf(dir);
    if (alsoScratch && fs.existsSync(SCRATCH_ABS)) {
      rmrf(SCRATCH_ABS);
    }
  });
}

// ---------------------------------------------------------------------------
// Tests — end-to-end PASS run
// ---------------------------------------------------------------------------

test('S07 T03 integration: verifier runs end-to-end with --force and --output-dir <temp>', (t) => {
  ensureScratchAbsent();
  const tmpDir = makeTempDir();
  registerCleanup(t, tmpDir, true);

  const result = runVerifier(['--output-dir', tmpDir, '--force']);
  assert.equal(result.status, data.EXIT_CODES.CLEANUP_PASS,
    `verifier exited ${result.status}; stderr: ${result.stderr}\nstdout: ${result.stdout}`);
  // Canonical verdict line on stdout.
  assert.match(result.stdout, /M016_S07_REPLAY_CLEANUP=PASS/);
  // Verifier summary line on stdout.
  assert.match(result.stdout, /M016_S07_VERIFY=pass/);
  // Proof sidecar written to <tmpDir>/M016-S07-replay-cleanup-proof.json.
  const sidecar = readProofSidecar(tmpDir);
  assert.ok(sidecar, 'proof sidecar must exist at ' + path.join(tmpDir, PROOF_FILENAME));
  assert.equal(sidecar.proof_kind, data.REPLAY_CLEANUP_PROOF_KIND);
  assert.equal(sidecar.canonical_verdict_line_status, 'PASS');
  assert.equal(sidecar.bounded_exit_code, 0);
  assert.equal(sidecar.replay_subprocess_invocations, 1);
  // Verdict triple is structurally frozen.
  assert.deepEqual(sidecar.verdict_triple, {
    orchestration: 'PASS', evidence: 'PARTIAL', launch: 'PREPARATION_ONLY',
  });
  // Source hashes cover the full allowlist.
  assert.equal(Object.keys(sidecar.source_hashes).length, data.SOURCE_ALLOWLIST.length);
  // Redaction posture flags match frozen values.
  for (const [key, value] of Object.entries(data.CLEANUP_REDACTION_FLAG_VALUES)) {
    assert.equal(sidecar.redaction_posture[key], value);
  }
  // Cleanup trace covers pre_run, replay, post_run phases.
  const phases = new Set(sidecar.cleanup_trace.map((r) => r.phase));
  assert.ok(phases.has('pre_run'));
  assert.ok(phases.has('replay'));
  assert.ok(phases.has('post_run'));
  // semantic_digest and byte_digest are sha256-shaped.
  assert.match(sidecar.semantic_digest, /^[a-f0-9]{64}$/);
  assert.match(sidecar.byte_digest, /^[a-f0-9]{64}$/);
});

test('S07 T03 integration: post-run scratch root is absent (cleanup invariant)', (t) => {
  ensureScratchAbsent();
  const tmpDir = makeTempDir();
  registerCleanup(t, tmpDir, true);

  const result = runVerifier(['--output-dir', tmpDir, '--force']);
  assert.equal(result.status, 0);
  // Scratch root MUST be absent after verifier finishes (fail-closed invariant).
  assert.equal(fs.existsSync(SCRATCH_ABS), false,
    'scratch root ' + data.SCRATCH_ROOT_RELPATH + ' must be removed after verifier finishes');
  // No atomic temp residue should remain in runtime-evidence/.
  const entries = fs.readdirSync(RUNTIME_EVIDENCE);
  const tmpLeftover = entries.filter((n) => n.startsWith('.tmp-m016-s07-verify-'));
  assert.deepEqual(tmpLeftover, [], `no atomic-temp residue expected; got: ${tmpLeftover.join(', ')}`);
});

// ---------------------------------------------------------------------------
// Tests — reproducibility
// ---------------------------------------------------------------------------

test('S07 T03 integration: 2 sequential runs produce identical semantic_digest', (t) => {
  ensureScratchAbsent();
  const tmpDir = makeTempDir();
  registerCleanup(t, tmpDir, true);

  // First run
  const r1 = runVerifier(['--output-dir', tmpDir, '--force']);
  assert.equal(r1.status, 0, `first run failed: ${r1.stderr}`);
  const s1 = readProofSidecar(tmpDir);
  assert.ok(s1);
  const digest1 = s1.semantic_digest;

  // Second run (verifier refuses if canonical at --output-dir exists; --force overrides)
  const r2 = runVerifier(['--output-dir', tmpDir, '--force']);
  assert.equal(r2.status, 0, `second run failed: ${r2.stderr}`);
  const s2 = readProofSidecar(tmpDir);
  assert.ok(s2);
  const digest2 = s2.semantic_digest;

  assert.equal(digest1, digest2, 'semantic_digest must be byte-identical across 2 runs');
  // byte_digest may differ because byte_digest includes generated timestamp;
  // semantic_digest is the reproducibility binding.
  assert.match(digest1, /^[a-f0-9]{64}$/);
});

// ---------------------------------------------------------------------------
// Tests — fail-closed lifecycle branches
// ---------------------------------------------------------------------------

test('S07 T03 integration: verifier refuses pre-existing scratch root (pre-existing-residue)', (t) => {
  ensureScratchAbsent();
  // Plant pre-existing scratch + marker.
  fs.mkdirSync(SCRATCH_ABS, { recursive: true });
  fs.writeFileSync(path.join(SCRATCH_ABS, '.m016-s07-replay-marker'), data.MARKER_CONTENTS);
  t.after(() => {
    rmrf(SCRATCH_ABS);
  });

  const tmpDir = makeTempDir();
  registerCleanup(t, tmpDir, false);

  const result = runVerifier(['--output-dir', tmpDir, '--force']);
  assert.equal(result.status, data.EXIT_CODES.CLEANUP_RESIDUE_DRIFT,
    `expected CLEANUP_RESIDUE_DRIFT (7); got ${result.status}; stderr: ${result.stderr}`);
  assert.match(result.stderr, /pre-existing-residue/);
  // No proof sidecar should have been written.
  assert.equal(fs.existsSync(path.join(tmpDir, PROOF_FILENAME)), false);
});

test('S07 T03 integration: verifier refuses overwrite of canonical sidecar without --force', (t) => {
  ensureScratchAbsent();
  // Plant a sentinel canonical sidecar at default --output-dir.
  const canonicalPath = path.join(RUNTIME_EVIDENCE, PROOF_FILENAME);
  const sentinelDigest = data.CLEANUP_REFERENCE_TIME;
  fs.writeFileSync(canonicalPath, JSON.stringify({
    schema_id: data.REPLAY_CLEANUP_SCHEMA_ID,
    proof_kind: 'sentinel',
    sentinel: true,
    generated: sentinelDigest,
  }));
  t.after(() => {
    if (fs.existsSync(canonicalPath)) {
      fs.unlinkSync(canonicalPath);
    }
  });

  // Run WITHOUT --force — verifier must refuse (canonical exists).
  const result = runVerifier([]);
  assert.equal(result.status, data.EXIT_CODES.CLEANUP_REJECTED_MALFORMED,
    `expected CLEANUP_REJECTED_MALFORMED (1); got ${result.status}; stderr: ${result.stderr}`);
  assert.match(result.stderr, /output-exists/);
  // Sentinel must still be on disk (verifier refused without touching it).
  const after = fs.readFileSync(canonicalPath, 'utf8');
  assert.match(after, /sentinel/);
});

test('S07 T03 integration: verifier succeeds with --force when canonical sidecar exists', (t) => {
  ensureScratchAbsent();
  // Plant a sentinel canonical sidecar.
  const canonicalPath = path.join(RUNTIME_EVIDENCE, PROOF_FILENAME);
  fs.writeFileSync(canonicalPath, '{"sentinel": true}');
  // Only delete in t.after if the sentinel is still on disk — if the
  // verifier overwrote it with the real proof sidecar, leave it in place
  // so subsequent tests (S07 T04 artifacts/tamper) can read the canonical
  // proof sidecar that this test produces.
  t.after(() => {
    if (fs.existsSync(canonicalPath)) {
      try {
        const content = fs.readFileSync(canonicalPath, 'utf8');
        if (content.includes('"sentinel"')) {
          fs.unlinkSync(canonicalPath);
        }
      } catch (_) {
        // best-effort cleanup
      }
    }
  });

  const result = runVerifier(['--force']);
  assert.equal(result.status, 0, `verifier with --force failed: ${result.stderr}`);
  // Canonical sidecar now contains real proof (no longer sentinel).
  const after = JSON.parse(fs.readFileSync(canonicalPath, 'utf8'));
  assert.equal(after.proof_kind, data.REPLAY_CLEANUP_PROOF_KIND);
  assert.notEqual(after.sentinel, true);
});

// ---------------------------------------------------------------------------
// Tests — source-allowlist enforcement
// ---------------------------------------------------------------------------

test('S07 T03 integration: verifier refuses when M015 baseline is missing', (t) => {
  ensureScratchAbsent();
  const tmpDir = makeTempDir();
  registerCleanup(t, tmpDir, true);

  // Hide M015 source temporarily so the source-hash computation fails.
  const m015Path = path.join(REPO_ROOT, data.M015_BASELINE_REF);
  const m015Backup = m015Path + '.t03-backup';
  fs.renameSync(m015Path, m015Backup);
  t.after(() => {
    if (!fs.existsSync(m015Path) && fs.existsSync(m015Backup)) {
      fs.renameSync(m015Backup, m015Path);
    } else if (fs.existsSync(m015Backup)) {
      fs.unlinkSync(m015Backup);
    }
  });

  const result = runVerifier(['--output-dir', tmpDir, '--force']);
  assert.equal(result.status, data.EXIT_CODES.CLEANUP_PRECONDITION_DRIFT,
    `expected CLEANUP_PRECONDITION_DRIFT (3); got ${result.status}; stderr: ${result.stderr}`);
  assert.match(result.stderr, /precondition-missing/);
  assert.match(result.stderr, /M015/);
});

test('S07 T03 integration: verifier refuses when S01 canonical output is missing', (t) => {
  ensureScratchAbsent();
  const tmpDir = makeTempDir();
  registerCleanup(t, tmpDir, true);

  // Hide one S01 canonical output.
  const s01Validation = path.join(REPO_ROOT, data.S01_VALIDATION_REF);
  const backup = s01Validation + '.t03-backup';
  fs.renameSync(s01Validation, backup);
  t.after(() => {
    if (!fs.existsSync(s01Validation) && fs.existsSync(backup)) {
      fs.renameSync(backup, s01Validation);
    } else if (fs.existsSync(backup)) {
      fs.unlinkSync(backup);
    }
  });

  const result = runVerifier(['--output-dir', tmpDir, '--force']);
  assert.equal(result.status, data.EXIT_CODES.CLEANUP_PRECONDITION_DRIFT,
    `expected CLEANUP_PRECONDITION_DRIFT (3); got ${result.status}; stderr: ${result.stderr}`);
  assert.match(result.stderr, /precondition-missing/);
  assert.match(result.stderr, /classification-validation/);
});

// ---------------------------------------------------------------------------
// Tests — cleanup_trace + post-run absence proof
// ---------------------------------------------------------------------------

test('S07 T03 integration: cleanup_trace contains expected ordered rows', (t) => {
  ensureScratchAbsent();
  const tmpDir = makeTempDir();
  registerCleanup(t, tmpDir, true);

  const result = runVerifier(['--output-dir', tmpDir, '--force']);
  assert.equal(result.status, 0);
  const sidecar = readProofSidecar(tmpDir);
  assert.ok(sidecar);

  const actions = sidecar.cleanup_trace.map((r) => r.action);
  // Required actions in expected order:
  //   pre_run: MARKER_MISSING (pre-run scratch absent)
  //   replay: SUBPROCESS_INVOKED (one replay)
  //   post_run: MARKER_VALIDATED + REMOVED + POST_RUN_ABSENT
  const idx = (a) => actions.indexOf(a);
  assert.ok(idx('marker_missing') >= 0 && idx('marker_missing') < idx('subprocess_invoked'),
    'pre_run marker_missing must precede subprocess_invoked');
  assert.ok(idx('subprocess_invoked') < idx('marker_validated'),
    'replay subprocess_invoked must precede post_run marker_validated');
  assert.ok(idx('marker_validated') < idx('removed'),
    'marker_validated must precede removed');
  assert.ok(idx('removed') < idx('post_run_absent'),
    'removed must precede post_run_absent');
  // Every row target_relpath stays inside runtime-evidence/ or scripts/.
  for (const row of sidecar.cleanup_trace) {
    assert.match(row.target_relpath, /^(runtime-evidence|scripts|schemas)\b/);
  }
});

test('S07 T03 integration: pre_run_absence_check and post_run_absence_check have expected booleans', (t) => {
  ensureScratchAbsent();
  const tmpDir = makeTempDir();
  registerCleanup(t, tmpDir, true);

  const result = runVerifier(['--output-dir', tmpDir, '--force']);
  assert.equal(result.status, 0);
  const sidecar = readProofSidecar(tmpDir);
  assert.ok(sidecar);

  // pre_run_absence_check: scratch was absent before AND after pre_run check.
  assert.equal(sidecar.pre_run_absence_check.relpath, data.SCRATCH_ROOT_RELPATH);
  assert.equal(sidecar.pre_run_absence_check.present_before, false);
  assert.equal(sidecar.pre_run_absence_check.present_after, false);

  // post_run_absence_check: scratch was created during replay, removed at post_run.
  assert.equal(sidecar.post_run_absence_check.relpath, data.SCRATCH_ROOT_RELPATH);
  assert.equal(sidecar.post_run_absence_check.present_before, true);
  assert.equal(sidecar.post_run_absence_check.present_after, false);
});

test('S07 T03 integration: replay_subprocess_invocations is exactly 1', (t) => {
  ensureScratchAbsent();
  const tmpDir = makeTempDir();
  registerCleanup(t, tmpDir, true);

  const result = runVerifier(['--output-dir', tmpDir, '--force']);
  assert.equal(result.status, 0);
  const sidecar = readProofSidecar(tmpDir);
  assert.equal(sidecar.replay_subprocess_invocations, 1);
  assert.equal(sidecar.cleanup_trace.filter((r) => r.action === 'subprocess_invoked').length, 1);
});

// ---------------------------------------------------------------------------
// Tests — output paths stay inside allowlisted prefixes
// ---------------------------------------------------------------------------

test('S07 T03 integration: verifier keeps all output paths inside runtime-evidence/', (t) => {
  ensureScratchAbsent();
  const tmpDir = makeTempDir();
  registerCleanup(t, tmpDir, true);

  const result = runVerifier(['--output-dir', tmpDir, '--force']);
  assert.equal(result.status, 0);
  const sidecar = readProofSidecar(tmpDir);
  // Inputs reference canonical paths.
  for (const value of Object.values(sidecar.inputs)) {
    assert.match(value, /^(runtime-evidence|schemas|scripts)\b/);
  }
  // Cleanup trace targets.
  for (const row of sidecar.cleanup_trace) {
    assert.match(row.target_relpath, /^(runtime-evidence|scripts|schemas)\b/);
  }
  // Marker.
  assert.match(sidecar.cleanup_marker.relpath, /^runtime-evidence\//);
});

// ---------------------------------------------------------------------------
// Tests — fail-closed on subprocess non-zero exit (mark regressed m015)
// ---------------------------------------------------------------------------

test('S07 T03 integration: verifier fails closed when S01 subprocess exits non-zero', (t) => {
  ensureScratchAbsent();
  const tmpDir = makeTempDir();
  registerCleanup(t, tmpDir, true);

  // Replace M015 with a malformed shape that S01 CLI's
  // deriveClaimsFromM015Evidence rejects: missing BOTH legacy
  // mission_entities.{goal.created_at, root.completed_at} AND top-level
  // generated. S01 CLI exits 1 with derive-error; verifier must surface
  // that as a bounded exit code, not PASS.
  const m015Path = path.join(REPO_ROOT, data.M015_BASELINE_REF);
  const backup = m015Path + '.t03-failclosed-backup';
  fs.renameSync(m015Path, backup);
  fs.writeFileSync(m015Path, JSON.stringify({
    milestone: 'M015',
    mission_key: 'MALFORMED-FOR-FAIL-CLOSED-TEST',
    // neither mission_entities.goal.created_at nor top-level generated
    notes: 'this file is a temporary fail-closed trigger; backup restored in t.after',
  }) + '\n');

  t.after(() => {
    if (fs.existsSync(m015Path)) fs.unlinkSync(m015Path);
    if (fs.existsSync(backup)) fs.renameSync(backup, m015Path);
  });

  const result = runVerifier(['--output-dir', tmpDir, '--force']);
  // S01 CLI exits 1 (derive-error); verifier surfaces as bounded non-zero.
  assert.notEqual(result.status, 0,
    `verifier must fail closed when S01 subprocess returns non-zero; got ${result.status}; stderr: ${result.stderr}`);
  assert.ok(result.status >= 1 && result.status <= 7,
    `verifier should exit with bounded code; got ${result.status}; stderr: ${result.stderr}`);
  assert.match(result.stderr, /subprocess-nonzero/);
  // No proof sidecar written on fail-closed path.
  assert.equal(fs.existsSync(path.join(tmpDir, PROOF_FILENAME)), false,
    'no proof sidecar must be written on fail-closed path');
});

// ---------------------------------------------------------------------------
// Tests — verifier subprocess invocation count (exactly-one)
// ---------------------------------------------------------------------------

test('S07 T03 integration: verifier invokes S01 CLI exactly once per run', (t) => {
  ensureScratchAbsent();
  const tmpDir = makeTempDir();
  registerCleanup(t, tmpDir, true);

  // We can't easily count subprocess invocations from outside, but we can
  // verify the proof sidecar records replay_subprocess_invocations=1 and
  // that exactly one marker_validated + REMOVED + POST_RUN_ABSENT tuple is
  // present (one replay round-trip).
  const result = runVerifier(['--output-dir', tmpDir, '--force']);
  assert.equal(result.status, 0);
  const sidecar = readProofSidecar(tmpDir);
  assert.equal(sidecar.replay_subprocess_invocations, 1);
  const replayRows = sidecar.cleanup_trace.filter((r) => r.action === 'subprocess_invoked');
  assert.equal(replayRows.length, 1, 'cleanup_trace must contain exactly one subprocess_invoked row');
});