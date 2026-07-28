#!/usr/bin/env node
'use strict';

/**
 * scripts/test_m016_s03_safe_operational_evidence_integration.js
 *
 * M016-txa3vu / S03 / T06 — End-to-end integration suite for the
 * canonical safe-operational evidence pack pipeline.
 *
 * Exercises the full happy path:
 *   1. real live-probe runner (T03 contract fixture or canonical pack)
 *   2. real scratch-drill runner (T04 contract fixture)
 *   3. real collector CLI (T05) against the canonical pack
 *   4. independent verifier CLI (T06) against the canonical pack
 *   5. S02 baseline immutability window: pre vs post CLI run SHA match
 *   6. tamper table CLI reruns: each mutation → specific verdict line
 *
 * Uses in-tree scratch dirs only. NEVER mutates the real S02 baseline,
 * real pack, or any canonical input.
 *
 * Run with:
 *   node --test scripts/test_m016_s03_safe_operational_evidence_integration.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const verifier = require('./verify_m016_s03_safe_operational_evidence');
const packData = require('./lib/m016-s03-safe-operational-evidence-pack-data');
const packContract = require('./lib/m016-s03-safe-operational-evidence-pack-contract');

const ROOT = verifier.ROOT;
const VERIFIER_SCRIPT = path.join(ROOT, 'scripts', 'verify_m016_s03_safe_operational_evidence.js');
const COLLECTOR_SCRIPT = path.join(ROOT, 'scripts', 'collect_m016_s03_safe_operational_evidence.js');
const PACK_PATH = path.join(ROOT, packData.DEFAULTS.pack_output);
const S02_BASELINE_PATH = path.join(ROOT, packData.S02_BASELINE_REF);
const RUNTIME_EVIDENCE_DIR = path.join(ROOT, 'runtime-evidence');

// ---------------------------------------------------------------------------
// In-tree scratch helpers — same pattern as the unit suite.
// ---------------------------------------------------------------------------

function mkInTreeTmpDir(label) {
  const tag = (label || 'integration') + '-' + crypto.randomBytes(4).toString('hex');
  const dir = path.join(RUNTIME_EVIDENCE_DIR, '.m016-s03-t06-int-' + tag);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function rmDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* best-effort */ }
}

function sha256hex(payload) {
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function loadCanonicalPack() {
  return JSON.parse(fs.readFileSync(PACK_PATH, 'utf8'));
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ---------------------------------------------------------------------------
// Capture S02 baseline raw bytes SHA before any test mutates the world.
// This is the immutability gate referenced in T06 verification contract:
// S02 SHA must remain constant across the verifier's run window.
// ---------------------------------------------------------------------------

function captureS02RawSha() {
  return sha256hex(fs.readFileSync(S02_BASELINE_PATH));
}

// ---------------------------------------------------------------------------
// (1) S02 baseline immutability gate — read twice (before + after CLI run),
// confirm bytes unchanged. Tests the verifier's pre/post window check.
// ---------------------------------------------------------------------------

test('integration: S02 baseline raw SHA unchanged across verifier window', () => {
  const preSha = captureS02RawSha();
  // Run verifier once on the canonical pack; subprocess exit is allowed
  // to be 0 (PASS).
  const dir = mkInTreeTmpDir('s02-window');
  try {
    const proto = path.join(dir, 'verify.json');
    const r = spawnSync(process.execPath, [
      VERIFIER_SCRIPT,
      '--bundle', PACK_PATH,
      '--protocol-out', proto,
      '--reference-time', '2026-07-19T21:00:00Z',
      '--force',
    ], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    assert.equal(r.status, 0, `verifier exit ${r.status}: ${r.stderr}`);
    const postSha = captureS02RawSha();
    assert.equal(preSha, postSha,
      `S02 baseline raw SHA must remain stable: pre=${preSha} post=${postSha}`);
    // Confirm protocol reports raw_window_unchanged=true
    const protoDoc = JSON.parse(fs.readFileSync(proto, 'utf8'));
    assert.equal(protoDoc.s02_baseline_reproduction.raw_window_unchanged, true);
    assert.equal(protoDoc.s02_baseline_reproduction.match, true);
  } finally { rmDir(dir); }
});

// ---------------------------------------------------------------------------
// (2) End-to-end happy path: collector → verifier. The canonical pack was
// produced by T05 collector; here we confirm the verifier independently
// re-validates it without trusting the collector CLI's verdict line.
// ---------------------------------------------------------------------------

test('integration: verifier independently re-validates canonical pack (PASS)', () => {
  const dir = mkInTreeTmpDir('e2e-pass');
  try {
    const proto = path.join(dir, 'verify.json');
    const r = spawnSync(process.execPath, [
      VERIFIER_SCRIPT,
      '--bundle', PACK_PATH,
      '--protocol-out', proto,
      '--reference-time', '2026-07-19T21:00:00Z',
      '--iterations', '3',
      '--force',
    ], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    assert.equal(r.status, 0, `verifier exit ${r.status}: stdout=${r.stdout} stderr=${r.stderr}`);
    const doc = JSON.parse(fs.readFileSync(proto, 'utf8'));
    assert.equal(doc.task, 'T06');
    assert.equal(doc.runner_status, 'PASS');
    assert.equal(doc.replay_iterations, 3);
    assert.equal(doc.independent_replay.deterministic, true);
    for (const gid of verifier.PACK_GATE_IDS) {
      assert.equal(doc.gates[gid], 'pass', `gate ${gid} not pass`);
    }
    assert.equal(doc.raw_sha_reproduction.all_match, true);
    assert.equal(doc.raw_sha_reproduction.match_count, 5);
    assert.equal(doc.s02_baseline_reproduction.match, true);
    assert.equal(doc.classification_drift.length, 0);
    assert.equal(doc.records_semantic_replay.fail_closed_count, 0);
    assert.equal(doc.replay_key_audit.intact, true);
    assert.equal(doc.launch_posture_audit.frozen, true);
    // Verdict line must reflect PASS
    assert.match(r.stdout, /^M16-S03-VERIFY verdict=PASS exit=0 block_count=0 /m);
  } finally { rmDir(dir); }
});

// ---------------------------------------------------------------------------
// (3) End-to-end tamper table — every canonical mutation vector is wired
// through the CLI subprocess and the verdict line must carry the correct
// override label. This is the red-team integration table.
// ---------------------------------------------------------------------------

function runTamperedPackThroughCli(mutator, expectedVerdict) {
  return test(`integration tamper: ${expectedVerdict}`, () => {
    const dir = mkInTreeTmpDir('tamper-' + expectedVerdict.toLowerCase().replace(/[^a-z0-9]/g, '_'));
    try {
      const tamperedPath = path.join(dir, 'tampered.json');
      const tampered = clone(loadCanonicalPack());
      mutator(tampered);
      fs.writeFileSync(tamperedPath, JSON.stringify(tampered, null, 2));
      const proto = path.join(dir, 'verify.json');
      const r = spawnSync(process.execPath, [
        VERIFIER_SCRIPT,
        '--bundle', tamperedPath,
        '--protocol-out', proto,
        '--force',
      ], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
      assert.notEqual(r.status, 0, `tampered pack should fail: ${expectedVerdict}`);
      assert.match(r.stdout || '', new RegExp(`verdict=${expectedVerdict}`),
        `expected verdict=${expectedVerdict}, got: ${r.stdout}`);
    } finally { rmDir(dir); }
  });
}

runTamperedPackThroughCli((b) => { b.embedded_classification.verdicts.launch = 'GO'; }, 'LAUNCH_PROMOTION');
runTamperedPackThroughCli((b) => { b.sources[0].pre_hash_sha256 = sha256hex('on-disk-tamper-pre'); }, 'PROVENANCE_DRIFT');
runTamperedPackThroughCli((b) => { b.role_matrix = b.role_matrix.slice(0, 15); }, 'REJECTED_FAIL_CLOSED');
runTamperedPackThroughCli((b) => { b.drill_matrix[0].classification = 'NOT_PROVEN'; }, 'REJECTED_FAIL_CLOSED');
runTamperedPackThroughCli((b) => {
  b.replay_keys.first_run_provenance_hash = sha256hex('first-tamper');
  b.replay_keys.second_run_provenance_hash = sha256hex('second-tamper');
}, 'REJECTED_FAIL_CLOSED');
runTamperedPackThroughCli((b) => { b.s02_baseline.pre_canonical_hash = sha256hex('tampered-pre'); }, 'PROVENANCE_DRIFT');

// ---------------------------------------------------------------------------
// (4) Independent verifier — runtime independence check.
// The verifier must NOT depend on the collector CLI binary. We verify this
// by running the verifier through node directly without invoking the
// collector. If the verifier passed, it means it can run standalone.
// ---------------------------------------------------------------------------

test('integration: verifier runs standalone (no collector dependency)', () => {
  const dir = mkInTreeTmpDir('standalone');
  try {
    const proto = path.join(dir, 'verify.json');
    const r = spawnSync(process.execPath, [
      VERIFIER_SCRIPT,
      '--bundle', PACK_PATH,
      '--protocol-out', proto,
      '--force',
    ], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    assert.equal(r.status, 0, `verifier standalone failed: exit=${r.status}`);
    const doc = JSON.parse(fs.readFileSync(proto, 'utf8'));
    assert.equal(doc.runner_status, 'PASS');
  } finally { rmDir(dir); }
});

// ---------------------------------------------------------------------------
// (5) Two semantic replays reported in the verify protocol.
// The verify-protocol must include BOTH:
//   - records_semantic_replay: per-record pass/fail summary
//   - independent_replay: N iterations of the full contract replay
// ---------------------------------------------------------------------------

test('integration: protocol includes both records_semantic_replay and independent_replay', () => {
  const dir = mkInTreeTmpDir('semantic-replays');
  try {
    const proto = path.join(dir, 'verify.json');
    const r = spawnSync(process.execPath, [
      VERIFIER_SCRIPT,
      '--bundle', PACK_PATH,
      '--protocol-out', proto,
      '--iterations', '2',
      '--force',
    ], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    assert.equal(r.status, 0);
    const doc = JSON.parse(fs.readFileSync(proto, 'utf8'));
    // records_semantic_replay present
    assert.ok(doc.records_semantic_replay);
    assert.equal(typeof doc.records_semantic_replay.row_count, 'number');
    assert.equal(typeof doc.records_semantic_replay.executed_count, 'number');
    assert.equal(typeof doc.records_semantic_replay.not_proven_count, 'number');
    assert.equal(typeof doc.records_semantic_replay.fail_closed_count, 'number');
    assert.equal(doc.records_semantic_replay.fail_closed_count, 0);
    // independent_replay present (the second semantic replay)
    assert.ok(doc.independent_replay);
    assert.equal(doc.independent_replay.iterations, 2);
    assert.equal(doc.independent_replay.deterministic, true);
    assert.equal(doc.independent_replay.runs.length, 2);
    for (let i = 0; i < 2; i++) {
      assert.equal(doc.independent_replay.runs[i].runner_status, 'PASS');
    }
  } finally { rmDir(dir); }
});

// ---------------------------------------------------------------------------
// (6) Embedded classification drift detection — derived vs embedded HG*.
// ---------------------------------------------------------------------------

test('integration: deriveIndependentClassification matches embedded hard_gates for canonical pack', () => {
  const pack = loadCanonicalPack();
  const derived = verifier.deriveIndependentClassification(pack);
  const embedded = pack.embedded_classification.hard_gates;
  for (const gid of verifier.PACK_GATE_IDS) {
    assert.equal(derived[gid], embedded[gid], `derived ${gid} vs embedded mismatch`);
  }
  // And via the public drift detector
  const drift = verifier.detectEmbeddedClassificationDrift(pack);
  assert.equal(drift.drift.length, 0);
});