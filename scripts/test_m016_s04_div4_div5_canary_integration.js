#!/usr/bin/env node
'use strict';

/**
 * scripts/test_m016_s04_div4_div5_canary_integration.js
 *
 * M016-txa3vu / S04 / T06 — Producer → sidecar → fresh-verifier integration
 * replay. This entry point is the final slice-level gate: it spawns the
 * Div4 producer and the Div5 independent validator as fresh subprocesses
 * in a marker-owned temporary directory, asserts the full chain
 *
 *   S02/S03 evidence → Div4 producer → persisted sidecar
 *                    → fresh Div5 process → reproducible verdict
 *
 * and pins the structural and redaction invariants downstream S05 admission
 * will grep for:
 *
 *   (a) producer emits the canonical verdict line M16-S04-CANARY
 *       verdict=PRODUCED exit=0 block_count=0 and exits 0
 *   (b) bundle.json has 3 records (Div2.MasterPlanner NOT_PROVEN +
 *       secret_posture EXECUTED + budget_stop_drill EXECUTED),
 *       7-row evidence_chain with all unchanged=true, embedded_classification
 *       launch verdict frozen at PREPARATION_ONLY, replay_keys match=true
 *       and byte_identical=true, embedded_classification.canary_gates
 *       CG1..CG8 all "pass"
 *   (c) producer-protocol.json shape is schema-conformant, replay section
 *       reports first_run_provenance_hash == second_run_provenance_hash
 *   (d) verifier emits the canonical verdict line M16-S04-VERIFY
 *       verdict=PASS exit=0 block_count=0 and exits 0
 *   (e) verify-protocol.json re-derives all gates (CG1..CG8 pass), reports
 *       redaction_audit.clean=true, raw_sha_reproduction.all_match=true,
 *       s02_baseline_reproduction.match=true, s03_pack_reproduction.match=true,
 *       independent_replay.deterministic=true, embedded_classification_verdicts
 *       .launch=PREPARATION_ONLY
 *   (f) correlation contract is unique across agent_run_id / probe_id /
 *       evidence_id / criterion_id; criterion_id is in HARD/CANARY vocabulary
 *   (g) byte-identical dual replay is observable through producer-protocol
 *       (first_run_provenance_hash == second_run_provenance_hash)
 *   (h) negative-fixtures artifact exists in runtime-evidence/ with 8 entries
 *       and 8 unique blocker codes
 *   (i) on-disk S02/S03 source files are byte-identical before and after
 *       the integration flow (no live mutation outside marker-owned temp)
 *   (j) clean teardown — temp dir is removed, no scratch files leak into
 *       /tmp outside the marker-owned prefix
 *   (k) tamper path: a verifier run against a tampered bundle (launch
 *       verdict promoted to GO) emits FAIL_CLOSED with the expected
 *       M16-S04-VERIFY-LAUNCH-PROMOTION-DETECTED-GO blocker and a
 *       non-zero exit code, with the canonical FAIL_CLOSED line
 *
 * Run with:  node --test scripts/test_m016_s04_div4_div5_canary_integration.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const data = require('./lib/m016-s04-div4-div5-canary-data');
const contract = require('./lib/m016-s04-div4-div5-canary-contract');

const {
  SCHEMA_ID,
  SCHEMA_VERSION,
  BUNDLE_ID,
  BUNDLE_KIND,
  CANARY_GATE_IDS,
  CANARY_GATE_LABELS,
  CANARY_VERDICT_VALUES,
  ROLE_SUBSET_DEFAULTS,
  DRILL_SUBSET_DEFAULTS,
  EXIT_CODES,
  BLOCKER_CODES,
  SOURCE_ALLOWLIST,
  SOURCE_ALLOWLIST_SET,
  S02_BASELINE_REF,
  S03_PACK_REF,
  S03_VERIFY_REF,
  S03_COLLECT_REF,
  S03_INVENTORY_REF,
  S03_LIVE_PROBE_REF,
  S03_SCRATCH_DRILL_REF,
  DEFAULTS,
  PRODUCER_LINE_CLASS,
  VERIFIER_LINE_CLASS,
  PRODUCER_CANONICAL_PROTOCOL,
  VERIFIER_CANONICAL_PROTOCOL,
  PRODUCER_TASK_ID,
  VERIFIER_TASK_ID,
  PRODUCER_PROTOCOL_ID,
  PRODUCER_PROTOCOL_KIND,
  VERIFY_PROTOCOL_ID,
  VERIFY_PROTOCOL_KIND,
  isCanaryBlockerCode,
  isVerifierBlockerCode,
} = data;

const ROOT = contract.ROOT;
const PRODUCER_SCRIPT = 'scripts/produce_m016_s04_div4_div5_canary.js';
const VERIFIER_SCRIPT = 'scripts/verify_m016_s04_div4_div5_canary.js';
const PRODUCER_CMD = 'node ' + PRODUCER_SCRIPT;
const VERIFIER_CMD = 'node ' + VERIFIER_SCRIPT;

const REFERENCE_TIME = DEFAULTS.reference_time;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256Hex(content) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content == null ? '' : String(content), 'utf8');
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function hashOnDiskFile(absPath) {
  if (!fs.existsSync(absPath)) return null;
  return sha256Hex(fs.readFileSync(absPath));
}

function hashAllowlistSources() {
  const out = {};
  for (const entry of SOURCE_ALLOWLIST) {
    out[entry.source_ref] = hashOnDiskFile(path.join(ROOT, entry.source_ref));
  }
  return out;
}

function makeTempMarker(label) {
  // Temp markers MUST live inside ROOT (not under os.tmpdir()) because the
  // verifier's loadJsonFromDisk enforces a realpath boundary check that
  // rejects any path whose realpath escapes ROOT with
  // M16-S04-VERIFY-PATH-TRAVERSAL-<ref>. Using ROOT/.tmp-m016-s04-int-<label>-*
  // mirrors the existing S03 pattern (runtime-evidence/.tmp-m016-determinism)
  // and keeps the marker-owned subdirectory out of runtime-evidence/ proper.
  //
  // Returns both the tmpDir AND a sourceRoot that points to a marker-owned
  // snapshot of all SOURCE_ALLOWLIST files. The integration test forwards
  // sourceRoot as --source-root to producer and verifier so both subprocesses
  // read the SAME frozen snapshot rather than ROOT's runtime-evidence/, which
  // test_produce h3 may temporarily mutate (and restore) mid-flight under
  // node --test parallel execution.
  const tmpDir = fs.mkdtempSync(path.join(ROOT, '.tmp-m016-s04-int-' + label + '-'));
  const snapshot = snapshotAllowlistSources(tmpDir);
  return { tmpDir: tmpDir, sourceRoot: snapshot.sourceRoot };
}

function snapshotAllowlistSources(tmpDir) {
  // Copy all 7 SOURCE_ALLOWLIST files from ROOT/runtime-evidence/... into a
  // marker-owned snapshot directory <tmpDir>/sources/. The integration test
  // then passes --source-root <tmpDir>/sources to producer and verifier so
  // both subprocesses read the SAME frozen snapshot rather than ROOT's
  // runtime-evidence/, which test_produce h3 may temporarily mutate (and
  // restore) mid-flight under node --test parallel execution. Without this
  // isolation, the verifier's raw_sha_reproduction audit reads a post-restore
  // hash that no longer matches producer's pre-mutation hash and emits
  // M16-S04-VERIFY-EVIDENCE-CHAIN-BROKEN-raw_sha even on a healthy canary.
  //
  // The snapshot copy is retried until the live-probe portion contains the
  // Div2.MasterPlanner record (proof the snapshot was taken outside any
  // h3 mutation window). The retry budget mirrors waitForHealthyLiveProbe.
  const sourceRoot = path.join(tmpDir, 'sources');
  fs.mkdirSync(path.join(sourceRoot, 'runtime-evidence'), { recursive: true });
  const liveProbeRef = 'runtime-evidence/M016-S03-live-probe-results.json';
  const maxAttempts = 200;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    for (const entry of SOURCE_ALLOWLIST) {
      const srcAbs = path.join(ROOT, entry.source_ref);
      const destAbs = path.join(sourceRoot, entry.source_ref);
      fs.mkdirSync(path.dirname(destAbs), { recursive: true });
      fs.copyFileSync(srcAbs, destAbs);
    }
    if (snapshotHasDiv2MasterPlanner(sourceRoot, liveProbeRef)) {
      return { sourceRoot: sourceRoot, attempts: attempt };
    }
    try { require('child_process').execSync('sleep 0.025'); } catch (e) { /* ignore */ }
  }
  const err = new Error('snapshot never converged to a healthy live-probe within ' + (maxAttempts * 25) + 'ms; sibling test_produce h3 still mid-flight');
  err.code = 'M16-S04-CANARY-LIVE-PROBE-RACE-DETECTED';
  throw err;
}

function snapshotHasDiv2MasterPlanner(sourceRoot, liveProbeRef) {
  try {
    const abs = path.join(sourceRoot, liveProbeRef);
    if (!fs.existsSync(abs)) return false;
    const parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const records = Array.isArray(parsed.records) ? parsed.records : [];
    return records.some(function (r) { return r && r.role === 'Div2.MasterPlanner'; });
  } catch (e) {
    return false;
  }
}

function removeTempMarker(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}

function runProducer(args, sourceRoot) {
  // Block until the live-probe source file is healthy. Without this guard,
  // `node --test` parallel execution can have the integration test's worker
  // observe the mid-flight tamper from test_produce h3 and fail with a
  // spurious M16-S04-CANARY-ROLE-NOT-IN-REGISTRY-Div2.MasterPlanner blocker.
  // The guard is a no-op when the source is already healthy (the common
  // case) and only spins when a sibling test is mid-tamper.
  //
  // sourceRoot (when non-null) is forwarded as --source-root <dir> so the
  // producer reads from the marker-owned snapshot rather than ROOT's
  // runtime-evidence/, fully isolating producer output hashes from any
  // concurrent test_produce h3 mutation. Pair this with snapshotAllowlistSources
  // above.
  waitForHealthyLiveProbe(40, 25);
  const fullArgs = sourceRoot ? ['--source-root', sourceRoot].concat(args) : args;
  const child = spawnSync(process.execPath, [PRODUCER_SCRIPT].concat(fullArgs), {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 180000,
  });
  return child;
}

function runVerifier(args, sourceRoot) {
  // Same race-condition guard as runProducer. The producer and verifier are
  // sequential subprocesses within one test, but the verifier reads the SAME
  // source files the producer just hashed. If a sibling test (test_produce
  // h3) mutates the live-probe source file between the producer's read and
  // the verifier's read, the verifier's raw_sha_reproduction audit detects
  // the hash drift and emits M16-S04-VERIFY-EVIDENCE-CHAIN-BROKEN-raw_sha.
  // Blocking until the file is healthy before spawning the verifier closes
  // that race window.
  //
  // sourceRoot (when non-null) is forwarded as --source-root <dir> so the
  // verifier reads from the SAME marker-owned snapshot the producer just
  // hashed. Without this, ROOT's live-probe could be mutated between the
  // producer's snapshot read and the verifier's recompute and produce a
  // false M16-S04-VERIFY-EVIDENCE-CHAIN-BROKEN-raw_sha failure.
  //
  // The canary probe-run ledger is a PRODUCER OUTPUT (not a source file)
  // written to <tmpDir>/probe-run.json by the producer's --probe-run-out
  // flag. When sourceRoot is set, auto-inject --probe-run-in
  // <path.dirname(sourceRoot)>/probe-run.json so the verifier reads the
  // SAME ledger the producer just wrote. Without this auto-inject the
  // verifier falls back to runtime-evidence/M016-S04-div4-div5-canary-probe-run.json
  // (the T03-era output), which has different hashes and emits a spurious
  // M16-S04-VERIFY-CANARY-PROBE-RUN-DRIFT-* blocker.
  waitForHealthyLiveProbe(40, 25);
  let fullArgs = [];
  if (sourceRoot) {
    fullArgs.push('--source-root', sourceRoot);
    fullArgs.push('--probe-run-in', path.join(path.dirname(sourceRoot), 'probe-run.json'));
  }
  fullArgs = fullArgs.concat(args);
  const child = spawnSync(process.execPath, [VERIFIER_SCRIPT].concat(fullArgs), {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 180000,
  });
  return child;
}

function assertProducerHealthy(producerResult, bundlePath) {
  assert.equal(producerResult.status, EXIT_CODES.CANARY_PASS,
    'producer must exit 0; got ' + producerResult.status + ' stderr=' + producerResult.stderr + ' stdout=' + producerResult.stdout);
  assert.match(producerResult.stdout, new RegExp('M16-S04-CANARY verdict=' + CANARY_VERDICT_VALUES.PRODUCED + ' exit=' + EXIT_CODES.CANARY_PASS + ' '),
    'producer stdout must emit canonical verdict line, got: ' + producerResult.stdout);
  assert.ok(fs.existsSync(bundlePath), 'producer must materialise bundle at ' + bundlePath);
}

function assertVerifierHealthy(verifierResult, verifyProtocolPath) {
  // Read the verify-protocol BEFORE asserting so a failure can include
  // the actual blocker codes in the error message — necessary for
  // diagnosing test interference from sibling test files.
  let vpBlockersInfo = '';
  try {
    if (fs.existsSync(verifyProtocolPath)) {
      const vp = JSON.parse(fs.readFileSync(verifyProtocolPath, 'utf8'));
      const blockers = Array.isArray(vp.blockers) ? vp.blockers : [];
      if (blockers.length > 0) {
        vpBlockersInfo = ' verify-protocol blockers=' + JSON.stringify(blockers.map(function (b) {
          return { code: b.code, reason: b.reason };
        }));
      }
    }
  } catch (e) { /* ignore */ }
  assert.equal(verifierResult.status, EXIT_CODES.CANARY_PASS,
    'verifier must exit 0 on healthy bundle; got ' + verifierResult.status + ' stderr=' + verifierResult.stderr + ' stdout=' + verifierResult.stdout + vpBlockersInfo);
  assert.match(verifierResult.stdout, /M16-S04-VERIFY verdict=PASS exit=0 block_count=0/,
    'verifier stdout must emit canonical PASS line, got: ' + verifierResult.stdout);
  assert.ok(fs.existsSync(verifyProtocolPath), 'verifier must materialise verify-protocol at ' + verifyProtocolPath);
}

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

// ---------------------------------------------------------------------------
// Pre-condition check — guard against test_produce h3 race condition.
//
// test_produce h3 mutates runtime-evidence/M016-S03-live-probe-results.json
// (drops the Div2.MasterPlanner record) and restores it in a finally block.
// When `node --test` runs the six S04 entrypoints in parallel (Node.js 21+
// default), the integration test's worker can read the mutated file BEFORE
// test_produce h3's finally block restores it, producing a spurious
// `M16-S04-CANARY-ROLE-NOT-IN-REGISTRY-Div2.MasterPlanner` blocker. This
// helper waits up to N attempts for the live-probe source file to contain
// the Div2.MasterPlanner record before any producer invocation runs.
// ---------------------------------------------------------------------------

function liveProbeHasDiv2MasterPlanner() {
  try {
    const liveProbePath = path.join(ROOT, S03_LIVE_PROBE_REF);
    if (!fs.existsSync(liveProbePath)) return false;
    const parsed = JSON.parse(fs.readFileSync(liveProbePath, 'utf8'));
    const records = Array.isArray(parsed.records) ? parsed.records : [];
    return records.some(function (r) { return r && r.role === 'Div2.MasterPlanner'; });
  } catch (e) {
    return false;
  }
}

function waitForHealthyLiveProbe(maxAttempts, delayMs) {
  // Strict guard. test_produce h3 temporarily mutates
  // runtime-evidence/M016-S03-live-probe-results.json (drops the
  // Div2.MasterPlanner record) and restores it in a finally block. When
  // `node --test` runs the six S04 entrypoints in parallel, the integration
  // test's worker can read the mutated file before h3's finally restore
  // completes; producer then fails with M16-S04-CANARY-ROLE-NOT-IN-REGISTRY-
  // Div2.MasterPlanner even though the persistent source is healthy. The
  // helper must therefore (a) yield CPU to the sibling worker via
  // execSync('sleep') rather than busy-wait, and (b) throw loudly on
  // timeout so node:test fails the gate with a precise message instead of
  // silently propagating a tampered view into the canary verdict line.
  const attempts = typeof maxAttempts === 'number' && maxAttempts > 0 ? maxAttempts : 200;
  const delayMsFinal = typeof delayMs === 'number' && delayMs > 0 ? delayMs : 25;
  for (let i = 0; i < attempts; i++) {
    if (liveProbeHasDiv2MasterPlanner()) return i;
    // child_process.execSync('sleep') actually yields to the OS scheduler so
    // sibling worker threads (test_produce h3 in another file) get CPU time
    // to complete their finally-block file restore. A busy-wait on Date.now()
    // would consume this thread's slice without yielding, defeating the
    // purpose of the guard when node --test runs files in parallel.
    try { require('child_process').execSync('sleep ' + (delayMsFinal / 1000).toFixed(3)); }
    catch (e) { /* sleep unavailable on this platform — fall through */ }
  }
  const liveProbePath = path.join(ROOT, S03_LIVE_PROBE_REF);
  const totalMs = attempts * delayMsFinal;
  const err = new Error(
    'live-probe source did not restore to a healthy state within ' + totalMs + 'ms ' +
    '(attempts=' + attempts + ', delay=' + delayMsFinal + 'ms); ' +
    'sibling test_produce h3 likely still mid-flight — refusing to spawn producer ' +
    'because it would emit M16-S04-CANARY-ROLE-NOT-IN-REGISTRY-Div2.MasterPlanner ' +
    'against a tampered view rather than the persistent source.'
  );
  err.code = 'M16-S04-CANARY-LIVE-PROBE-RACE-DETECTED';
  err.liveProbePath = liveProbePath;
  err.attempts = attempts;
  err.delayMs = delayMsFinal;
  err.totalMs = totalMs;
  throw err;
}

// ===========================================================================
// (a) producer emits canonical verdict line + persists sidecar
// ===========================================================================

test('integration: producer emits canonical verdict and writes bundle+protocol+probe-run+inventory', () => {
  const { tmpDir, sourceRoot } = makeTempMarker('producer');
  const preHashes = hashAllowlistSources();
  try {
    const bundlePath = path.join(tmpDir, 'bundle.json');
    const producerProtocolPath = path.join(tmpDir, 'producer-protocol.json');
    const probeRunPath = path.join(tmpDir, 'probe-run.json');
    const inventoryPath = path.join(tmpDir, 'inventory.json');

    const result = runProducer([
      '--force',
      '--bundle-out', bundlePath,
      '--protocol-out', producerProtocolPath,
      '--probe-run-out', probeRunPath,
      '--inventory-out', inventoryPath,
      '--reference-time', REFERENCE_TIME,
      '--seed', 'integration-replay',
      '--iterations', '2',
    ], sourceRoot);
    assertProducerHealthy(result, bundlePath);

    // All four sidecars written
    for (const p of [producerProtocolPath, probeRunPath, inventoryPath]) {
      assert.ok(fs.existsSync(p), 'expected sidecar missing: ' + p);
    }
  } finally {
    // Verify on-disk S02/S03 sources unchanged.
    const postHashes = hashAllowlistSources();
    for (const ref of Object.keys(postHashes)) {
      assert.equal(postHashes[ref], preHashes[ref], 'S02/S03 source mutated on disk: ' + ref);
    }
    removeTempMarker(tmpDir);
  }
});

// ===========================================================================
// (b) bundle shape — 3 records, 7 evidence_chain rows, PREPARATION_ONLY
// ===========================================================================

test('integration: bundle.json shape — 3 records / 7 evidence_chain rows / PREPARATION_ONLY launch / CG1..CG8 pass', () => {
  const { tmpDir, sourceRoot } = makeTempMarker('bundle-shape');
  try {
    const bundlePath = path.join(tmpDir, 'bundle.json');
    const producerProtocolPath = path.join(tmpDir, 'producer-protocol.json');
    const probeRunPath = path.join(tmpDir, 'probe-run.json');
    const inventoryPath = path.join(tmpDir, 'inventory.json');

    const result = runProducer([
      '--force',
      '--bundle-out', bundlePath,
      '--protocol-out', producerProtocolPath,
      '--probe-run-out', probeRunPath,
      '--inventory-out', inventoryPath,
      '--reference-time', REFERENCE_TIME,
      '--seed', 'integration-replay',
      '--iterations', '2',
    ], sourceRoot);
    assertProducerHealthy(result, bundlePath);

    const bundle = readJson(bundlePath);

    // Schema + namespace.
    assert.equal(bundle.schema_id, SCHEMA_ID);
    assert.equal(bundle.schema_version, SCHEMA_VERSION);
    assert.equal(bundle.bundle_kind, BUNDLE_KIND);
    assert.equal(bundle.bundle_id, BUNDLE_ID);
    assert.equal(bundle.milestone, 'M016-txa3vu');
    assert.equal(bundle.slice, 'S04');
    assert.equal(bundle.task, 'T03');

    // Records: exactly 3 — Div2.MasterPlanner (NOT_PROVEN), secret_posture (EXECUTED), budget_stop_drill (EXECUTED).
    assert.equal(bundle.records.length, 3);
    const roles = bundle.records.map(function (r) { return r.role; });
    assert.ok(roles.indexOf('Div2.MasterPlanner') >= 0, 'missing Div2.MasterPlanner role');
    assert.ok(roles.indexOf('secret_posture') >= 0, 'missing secret_posture role');
    assert.ok(roles.indexOf('budget_stop_drill') >= 0, 'missing budget_stop_drill role');
    const masterPlanner = bundle.records.find(function (r) { return r.role === 'Div2.MasterPlanner'; });
    assert.equal(masterPlanner.classification, 'NOT_PROVEN', 'Div2.MasterPlanner must stay NOT_PROVEN at canary layer');

    // Evidence chain: SOURCE_ALLOWLIST rows, all unchanged=true, pre==post.
    assert.equal(bundle.evidence_chain.length, SOURCE_ALLOWLIST.length);
    for (const row of bundle.evidence_chain) {
      assert.equal(row.unchanged, true, 'evidence_chain row unchanged=false for ' + row.chain_role);
      assert.equal(row.pre_hash_sha256, row.post_hash_sha256,
        'evidence_chain row pre/post hash mismatch for ' + row.chain_role);
      assert.ok(SOURCE_ALLOWLIST_SET.has(row.source_ref),
        'evidence_chain source_ref not in allowlist: ' + row.source_ref);
    }

    // Embedded classification: launch verdict frozen at PREPARATION_ONLY, canary_gates CG1..CG8 all pass.
    assert.equal(bundle.embedded_classification.verdicts.launch, 'PREPARATION_ONLY',
      'launch verdict must be PREPARATION_ONLY');
    assert.equal(bundle.embedded_classification.verdicts.orchestration, 'PASS');
    assert.equal(bundle.embedded_classification.verdicts.evidence, 'PASS');
    const cg = bundle.embedded_classification.canary_gates;
    for (const g of CANARY_GATE_IDS) {
      assert.equal(cg[g], 'pass', 'producer embedded canary_gates[' + g + '] must be pass');
    }

    // Replay keys: match=true, byte_identical=true.
    assert.equal(bundle.replay_keys.match, true);
    assert.equal(bundle.replay_keys.byte_identical, true);
    assert.equal(bundle.replay_keys.first_run_provenance_hash, bundle.replay_keys.second_run_provenance_hash,
      'first/second run provenance hashes must match for byte-identical replay');

    // No blockers / launch promotion / launch promotion attempt.
    assert.equal(bundle.blockers.length, 0);
    assert.equal(bundle.raw_input_immutability_verified, true);

    // Correlation contract: 3 probe_to_criterion rows, 3 agent_run_to_probe rows, 3 evidence_to_criterion rows.
    assert.equal(bundle.correlation_contract.probe_to_criterion.length, 3);
    assert.equal(bundle.correlation_contract.agent_run_to_probe.length, 3);
    assert.equal(bundle.correlation_contract.evidence_to_criterion.length, 3);

    // Redaction posture: must equal the frozen CANARY_REDACTION_FLAG_VALUES
    // exactly. The posture has 10 flags — 8 leak-class flags (full_ids,
    // credentials, xiaomi_endpoint_reuse, synthetic_bos, raw_reasoning,
    // raw_body, raw_result_json_result, vendor_reuse_strings) that MUST be
    // false, and 2 positive indicators (bounded_digests_only,
    // redaction_bounds_loaded) that MUST be true. Asserting equality with
    // the canonical registry proves both invariants at once.
    assert.deepEqual(bundle.redaction_posture, data.CANARY_REDACTION_FLAG_VALUES,
      'bundle redaction_posture must equal frozen CANARY_REDACTION_FLAG_VALUES');
  } finally {
    removeTempMarker(tmpDir);
  }
});

// ===========================================================================
// (c) producer-protocol shape — schema-conformant + replay match
// ===========================================================================

test('integration: producer-protocol.json shape — schema-conformant and replay_keys byte-identical', () => {
  const { tmpDir, sourceRoot } = makeTempMarker('producer-protocol');
  try {
    const bundlePath = path.join(tmpDir, 'bundle.json');
    const producerProtocolPath = path.join(tmpDir, 'producer-protocol.json');
    const probeRunPath = path.join(tmpDir, 'probe-run.json');
    const inventoryPath = path.join(tmpDir, 'inventory.json');

    const result = runProducer([
      '--force',
      '--bundle-out', bundlePath,
      '--protocol-out', producerProtocolPath,
      '--probe-run-out', probeRunPath,
      '--inventory-out', inventoryPath,
      '--reference-time', REFERENCE_TIME,
      '--seed', 'integration-replay',
      '--iterations', '2',
    ], sourceRoot);
    assertProducerHealthy(result, bundlePath);

    const proto = readJson(producerProtocolPath);
    const bundle = readJson(bundlePath);

    // Schema identity.
    assert.equal(proto.schema_id, 'https://gsd.local/schemas/runtime-evidence/m016-s04-div4-div5-canary-producer-protocol.v1.json');
    assert.equal(proto.protocol_id, PRODUCER_PROTOCOL_ID);
    assert.equal(proto.protocol_kind, PRODUCER_PROTOCOL_KIND);
    assert.equal(proto.line_class, PRODUCER_LINE_CLASS);
    assert.equal(proto.canonical_protocol, PRODUCER_CANONICAL_PROTOCOL);
    assert.equal(proto.task, PRODUCER_TASK_ID);
    assert.equal(proto.milestone, 'M016-txa3vu');
    assert.equal(proto.slice, 'S04');

    // Bundle reference.
    assert.equal(proto.bundle_id, BUNDLE_ID);
    assert.equal(proto.bundle_sha256, bundle.bundle_digest);

    // Replay section: iterations=2, match=true, byte_identical=true, hashes equal.
    assert.equal(proto.replay.iterations, 2);
    assert.equal(proto.replay.match, true);
    assert.equal(proto.replay.byte_identical, true);
    assert.equal(proto.replay.first_run_provenance_hash, proto.replay.second_run_provenance_hash,
      'producer-protocol replay hashes must be equal for byte-identical dual run');

    // Gates: all CG1..CG8 pass.
    for (const g of CANARY_GATE_IDS) {
      assert.equal(proto.gates[g], 'pass', 'producer-protocol gates[' + g + '] must be pass');
    }

    // Subset counts match bundle.
    const liveCount = bundle.records.filter(function (r) { return r.kind === 'live_canary_record'; }).length;
    const drillCount = bundle.records.filter(function (r) { return r.kind === 'drill_canary_record'; }).length;
    assert.equal(proto.canary_subset_size.live_records, liveCount);
    assert.equal(proto.canary_subset_size.drill_records, drillCount);
    assert.equal(proto.canary_subset_size.correlation_rows, bundle.correlation_contract.probe_to_criterion.length);

    // Sources loaded: every allowlist entry is present.
    for (const entry of SOURCE_ALLOWLIST) {
      assert.ok(proto.sources_loaded.indexOf(entry.source_ref) >= 0,
        'producer-protocol missing source ' + entry.source_ref);
    }

    // Verdict + exit code.
    assert.equal(proto.verdict, CANARY_VERDICT_VALUES.PRODUCED);
    assert.equal(proto.runner_status, EXIT_CODES.CANARY_PASS);
    assert.equal(proto.runner_exit_code, EXIT_CODES.CANARY_PASS);
    assert.equal(proto.blockers.length, 0);

    // Producer command echoed for replay.
    assert.match(proto.producer_command, /node scripts\/produce_m016_s04_div4_div5_canary\.js/);
  } finally {
    removeTempMarker(tmpDir);
  }
});

// ===========================================================================
// (d) verifier emits canonical PASS line and writes verify-protocol
// ===========================================================================

test('integration: verifier emits canonical PASS line and writes verify-protocol', () => {
  const { tmpDir, sourceRoot } = makeTempMarker('verifier');
  try {
    const bundlePath = path.join(tmpDir, 'bundle.json');
    const producerProtocolPath = path.join(tmpDir, 'producer-protocol.json');
    const probeRunPath = path.join(tmpDir, 'probe-run.json');
    const inventoryPath = path.join(tmpDir, 'inventory.json');
    const verifyProtocolPath = path.join(tmpDir, 'verify-protocol.json');

    const producer = runProducer([
      '--force',
      '--bundle-out', bundlePath,
      '--protocol-out', producerProtocolPath,
      '--probe-run-out', probeRunPath,
      '--inventory-out', inventoryPath,
      '--reference-time', REFERENCE_TIME,
      '--seed', 'integration-replay',
      '--iterations', '2',
    ], sourceRoot);
    assertProducerHealthy(producer, bundlePath);

    const verifier = runVerifier([
      '--force',
      '--bundle-in', bundlePath,
      '--protocol-in', producerProtocolPath,
      '--protocol-out', verifyProtocolPath,
      '--reference-time', REFERENCE_TIME,
      '--iterations', '2',
    ], sourceRoot);
    assertVerifierHealthy(verifier, verifyProtocolPath);
  } finally {
    removeTempMarker(tmpDir);
  }
});

// ===========================================================================
// (e) verify-protocol shape — gates pass, redaction clean, S02/S03 match
// ===========================================================================

test('integration: verify-protocol.json re-derives CG1..CG8 pass, deterministic replay, clean redaction', () => {
  const { tmpDir, sourceRoot } = makeTempMarker('verify-shape');
  try {
    const bundlePath = path.join(tmpDir, 'bundle.json');
    const producerProtocolPath = path.join(tmpDir, 'producer-protocol.json');
    const probeRunPath = path.join(tmpDir, 'probe-run.json');
    const inventoryPath = path.join(tmpDir, 'inventory.json');
    const verifyProtocolPath = path.join(tmpDir, 'verify-protocol.json');

    const producer = runProducer([
      '--force',
      '--bundle-out', bundlePath,
      '--protocol-out', producerProtocolPath,
      '--probe-run-out', probeRunPath,
      '--inventory-out', inventoryPath,
      '--reference-time', REFERENCE_TIME,
      '--seed', 'integration-replay',
      '--iterations', '2',
    ], sourceRoot);
    assertProducerHealthy(producer, bundlePath);

    const verifier = runVerifier([
      '--force',
      '--bundle-in', bundlePath,
      '--protocol-in', producerProtocolPath,
      '--protocol-out', verifyProtocolPath,
      '--reference-time', REFERENCE_TIME,
      '--iterations', '2',
    ], sourceRoot);
    assertVerifierHealthy(verifier, verifyProtocolPath);

    const bundle = readJson(bundlePath);
    const vp = readJson(verifyProtocolPath);

    // Schema identity.
    assert.equal(vp.schema_id, 'https://gsd.local/schemas/runtime-evidence/m016-s04-div4-div5-canary-verify-protocol.v1.json');
    assert.equal(vp.protocol_id, VERIFY_PROTOCOL_ID);
    assert.equal(vp.protocol_kind, VERIFY_PROTOCOL_KIND);
    assert.equal(vp.line_class, VERIFIER_LINE_CLASS);
    assert.equal(vp.canonical_protocol, VERIFIER_CANONICAL_PROTOCOL);
    assert.equal(vp.task, VERIFIER_TASK_ID);
    assert.equal(vp.milestone, 'M016-txa3vu');
    assert.equal(vp.slice, 'S04');

    // Bundle reference. The verifier recomputes the bundle_digest by stripping
    // the bundle_digest field entirely and re-hashing the canonical body
    // (see verify_m016_s04_div4_div5_canary.js loadJsonFromDisk → run path).
    // That is NOT the same as bundle.bundle_digest, which the producer sets
    // to attachReplayKeys.first_run_provenance_hash — a hash of the bundle
    // body with bundle_digest="" (empty value, key present). The two
    // canonical JSON forms differ, so we recompute the verifier-style digest
    // here and assert that vp.bundle_sha256 matches it.
    const bundleForDigest = Object.assign({}, bundle);
    delete bundleForDigest.bundle_digest;
    const verifierDigest = contract.computeBundleBodyDigest(bundleForDigest);
    assert.equal(vp.bundle_id, BUNDLE_ID);
    assert.equal(vp.bundle_sha256, verifierDigest,
      'verify-protocol bundle_sha256 must equal the verifier-style recomputed digest (no bundle_digest key)');

    // All CG1..CG8 pass.
    for (const g of CANARY_GATE_IDS) {
      assert.equal(vp.gates[g], 'pass', 'verify-protocol gates[' + g + '] must be pass');
      assert.equal(vp.canary_gates[g], 'pass', 'verify-protocol canary_gates[' + g + '] must be pass');
      assert.equal(vp.derived_gates[g], 'pass', 'verify-protocol derived_gates[' + g + '] must be pass');
    }
    // Hard gates: HG1 SEMANTIC_RULE_COMPLIANCE stays 'not_proven' because the
    // Div2.MasterPlanner live role is NOT_PROVEN at the canary layer (the
    // upstream live division probe could not reach its target on the most
    // recent S03 run; the producer's buildEmbeddedClassification records
    // this as not_proven and the verifier independently propagates the
    // value). HG8 SCRATCH_ISOLATION is 'pass' because budget_stop_drill
    // is EXECUTED in a bounded scratch root.
    assert.equal(vp.hard_gates['HG1 SEMANTIC_RULE_COMPLIANCE'], 'not_proven',
      'HG1 stays not_proven because Div2.MasterPlanner is NOT_PROVEN at canary layer');
    assert.equal(vp.hard_gates['HG8 SCRATCH_ISOLATION'], 'pass',
      'HG8 SCRATCH_ISOLATION is pass because budget_stop_drill is EXECUTED');

    // Independent replay deterministic + iterations match.
    assert.equal(vp.independent_replay.deterministic, true);
    assert.equal(vp.independent_replay.iterations, 2);
    assert.equal(vp.independent_replay.runs.length, 2);

    // S02 baseline immutability.
    assert.equal(vp.s02_baseline_reproduction.match, true);
    assert.equal(vp.s02_baseline_reproduction.pre_match, true);
    assert.equal(vp.s02_baseline_reproduction.post_match, true);
    assert.equal(vp.s02_baseline_reproduction.pre_post_equal, true);
    assert.equal(vp.s02_baseline_reproduction.unchanged_flag, true);

    // S03 pack immutability.
    assert.equal(vp.s03_pack_reproduction.match, true);
    assert.equal(vp.s03_pack_reproduction.pre_match, true);
    assert.equal(vp.s03_pack_reproduction.post_match, true);
    assert.equal(vp.s03_pack_reproduction.pre_post_equal, true);
    assert.equal(vp.s03_pack_reproduction.unchanged_flag, true);

    // Raw SHA reproduction: all matches across all 7 allowlist rows.
    assert.equal(vp.raw_sha_reproduction.all_match, true);
    assert.equal(vp.raw_sha_reproduction.match_count, SOURCE_ALLOWLIST.length);
    assert.equal(vp.raw_sha_reproduction.total_count, SOURCE_ALLOWLIST.length);

    // Redaction audit clean.
    assert.equal(vp.redaction_audit.clean, true);
    assert.equal(vp.redaction_audit.hit_count, 0);

    // Correlation audit: unique + vocabulary.
    assert.equal(vp.correlation_audit.issue_count, 0);
    assert.equal(vp.correlation_audit.probe_unique, true);
    assert.equal(vp.correlation_audit.evidence_unique, true);
    assert.equal(vp.correlation_audit.criteria_in_vocabulary, true);
    assert.equal(vp.correlation_audit.independence_group_in_registry, true);

    // Launch posture frozen at PREPARATION_ONLY (verifier independently confirms).
    assert.equal(vp.launch_posture_audit.frozen, true);
    assert.equal(vp.embedded_classification_verdicts.launch, 'PREPARATION_ONLY');
    assert.equal(vp.embedded_classification_verdicts.orchestration, 'PASS');
    assert.equal(vp.embedded_classification_verdicts.evidence, 'PASS');

    // Allowlist drift must be 0.
    assert.equal(vp.allowlist_drift.drift_count, 0);
    assert.equal(vp.role_matrix_audit.issue_count, 0);
    assert.equal(vp.drill_matrix_audit.issue_count, 0);

    // Replay keys match.
    assert.equal(vp.replay_keys_match, true);

    // Blockers and exit code.
    assert.equal(vp.blockers.length, 0);
    assert.equal(vp.blocker_codes.length, 0);
    assert.equal(vp.runner_status, 'PASS');
    assert.equal(vp.runner_exit_code, EXIT_CODES.CANARY_PASS);

    // Verifier command echoed.
    assert.match(vp.validator_command, /node scripts\/verify_m016_s04_div4_div5_canary\.js/);

    // Gate labels — one label per CG.
    assert.equal(Object.keys(vp.gate_labels).length, CANARY_GATE_IDS.length);
    for (const id of CANARY_GATE_IDS) {
      assert.ok(typeof vp.gate_labels[id] === 'string' && vp.gate_labels[id].length > 0,
        'gate label missing for ' + id);
      assert.equal(vp.gate_labels[id], CANARY_GATE_LABELS[id]);
    }
  } finally {
    removeTempMarker(tmpDir);
  }
});

// ===========================================================================
// (f) correlation chain — uniqueness across agent_run_id / probe / evidence / criterion
// ===========================================================================

test('integration: correlation chain is unique across agent_run_id / probe_id / evidence_id / criterion_id', () => {
  const { tmpDir, sourceRoot } = makeTempMarker('correlation');
  try {
    const bundlePath = path.join(tmpDir, 'bundle.json');
    const producerProtocolPath = path.join(tmpDir, 'producer-protocol.json');
    const probeRunPath = path.join(tmpDir, 'probe-run.json');
    const inventoryPath = path.join(tmpDir, 'inventory.json');
    const verifyProtocolPath = path.join(tmpDir, 'verify-protocol.json');

    const producer = runProducer([
      '--force',
      '--bundle-out', bundlePath,
      '--protocol-out', producerProtocolPath,
      '--probe-run-out', probeRunPath,
      '--inventory-out', inventoryPath,
      '--reference-time', REFERENCE_TIME,
      '--seed', 'integration-replay',
      '--iterations', '2',
    ], sourceRoot);
    assertProducerHealthy(producer, bundlePath);

    const verifier = runVerifier([
      '--force',
      '--bundle-in', bundlePath,
      '--protocol-in', producerProtocolPath,
      '--protocol-out', verifyProtocolPath,
      '--reference-time', REFERENCE_TIME,
      '--iterations', '2',
    ], sourceRoot);
    assertVerifierHealthy(verifier, verifyProtocolPath);

    const bundle = readJson(bundlePath);
    const vp = readJson(verifyProtocolPath);
    const probeRows = bundle.correlation_contract.probe_to_criterion;

    // Uniqueness.
    const probes = new Set();
    const evidences = new Set();
    const criteria = new Set();
    const agents = new Set();
    for (const row of probeRows) {
      assert.ok(!probes.has(row.probe_id), 'duplicate probe_id ' + row.probe_id);
      assert.ok(!evidences.has(row.evidence_id), 'duplicate evidence_id ' + row.evidence_id);
      assert.ok(!criteria.has(row.criterion_id), 'duplicate criterion_id ' + row.criterion_id);
      probes.add(row.probe_id); evidences.add(row.evidence_id); criteria.add(row.criterion_id);
      // Multiple probe rows share one agent_run_id by S04 design (one
      // canary run, multiple probes).
      agents.add(row.agent_run_id);
    }
    assert.equal(probes.size, 3);
    assert.equal(evidences.size, 3);
    assert.equal(criteria.size, 3);
    assert.equal(agents.size, 1);

    // Patterns.
    const probeIdRe = new RegExp(data.CORRELATION_PROBE_ID_PATTERN);
    const evidenceIdRe = new RegExp(data.CORRELATION_EVIDENCE_ID_PATTERN);
    const agentRunIdRe = new RegExp(data.CORRELATION_AGENT_RUN_ID_PATTERN);
    const criterionIdRe = new RegExp(data.CORRELATION_CRITERION_ID_PATTERN);
    for (const row of probeRows) {
      assert.match(row.probe_id, probeIdRe, 'probe_id pattern mismatch: ' + row.probe_id);
      assert.match(row.evidence_id, evidenceIdRe, 'evidence_id pattern mismatch: ' + row.evidence_id);
      assert.match(row.agent_run_id, agentRunIdRe, 'agent_run_id pattern mismatch: ' + row.agent_run_id);
      assert.match(row.criterion_id, criterionIdRe, 'criterion_id pattern mismatch: ' + row.criterion_id);
    }

    // Verifier confirms the same uniqueness via its audit.
    assert.equal(vp.correlation_audit.issue_count, 0);
  } finally {
    removeTempMarker(tmpDir);
  }
});

// ===========================================================================
// (g) byte-identical dual replay observable via producer-protocol
// ===========================================================================

test('integration: byte-identical dual replay (within-run replay_keys) is recorded in producer-protocol', () => {
  // The producer's attachReplayKeys contract guarantees WITHIN-RUN
  // determinism: for a single producer invocation, first_run_provenance_hash
  // equals second_run_provenance_hash, replay.match=true and
  // replay.byte_identical=true. Cross-run byte-identity is NOT what the
  // current producer contract claims (test_produce h2 exercises only
  // within-run determinism via replay_keys). T06 must not over-spec the
  // contract: we verify the recorded determinism on a single run, not on
  // two runs whose bundle bytes might differ in property insertion order.
  const { tmpDir, sourceRoot } = makeTempMarker('replay');
  try {
    const bundlePath = path.join(tmpDir, 'bundle.json');
    const producerProtocolPath = path.join(tmpDir, 'producer-protocol.json');
    const probeRunPath = path.join(tmpDir, 'probe-run.json');
    const inventoryPath = path.join(tmpDir, 'inventory.json');

    const result = runProducer([
      '--force',
      '--bundle-out', bundlePath,
      '--protocol-out', producerProtocolPath,
      '--probe-run-out', probeRunPath,
      '--inventory-out', inventoryPath,
      '--reference-time', REFERENCE_TIME,
      '--seed', 'integration-replay',
      '--iterations', '2',
    ], sourceRoot);
    assertProducerHealthy(result, bundlePath);

    const proto = readJson(producerProtocolPath);
    // Within-run determinism (the contract's actual guarantee).
    assert.equal(proto.replay.iterations, 2);
    assert.equal(proto.replay.match, true);
    assert.equal(proto.replay.byte_identical, true);
    assert.equal(proto.replay.first_run_provenance_hash, proto.replay.second_run_provenance_hash,
      'first/second run provenance hashes must be equal for byte-identical dual run');

    // And the bundle records the same provenance hash as the producer-protocol replay section.
    const bundle = readJson(bundlePath);
    assert.equal(bundle.replay_keys.match, true);
    assert.equal(bundle.replay_keys.byte_identical, true);
    assert.equal(bundle.replay_keys.first_run_provenance_hash, bundle.replay_keys.second_run_provenance_hash);
    assert.equal(bundle.bundle_digest, proto.replay.first_run_provenance_hash,
      'bundle.bundle_digest must equal producer-protocol replay.first_run_provenance_hash');
  } finally {
    removeTempMarker(tmpDir);
  }
});

// ===========================================================================
// (h) negative-fixtures artifact exists with 8 unique blocker codes
// ===========================================================================

test('integration: negative-fixtures artifact exists with 8 unique blocker codes (T05 admission input)', () => {
  const fixturesPath = path.join(ROOT, DEFAULTS.negative_fixtures_output);
  assert.ok(fs.existsSync(fixturesPath), 'negative-fixtures artifact missing: ' + fixturesPath);
  const fixtures = readJson(fixturesPath);
  assert.equal(fixtures.fixture_count, 8);
  assert.equal(fixtures.fixtures.length, 8);
  assert.equal(fixtures.unique_blocker_codes, 8);
  assert.equal(fixtures.non_zero_exit_codes, true);
  assert.equal(fixtures.milestone, 'M016-txa3vu');
  assert.equal(fixtures.slice, 'S04');

  // Every fixture is in M16-S04-CANARY-* namespace and has a unique code.
  const codes = fixtures.fixtures.map(function (f) { return f.expected_blocker_code; });
  const uniqueCodes = new Set(codes);
  assert.equal(uniqueCodes.size, 8, 'expected_blocker_code values must be unique across fixtures');
  for (const code of codes) {
    assert.equal(isCanaryBlockerCode(code), true, 'expected_blocker_code must satisfy M16-S04-CANARY-* regex: ' + code);
  }

  // Coverage spans all five threat classes from the slice plan.
  const threats = new Set(fixtures.fixtures.map(function (f) { return f.threat_class; }));
  for (const required of ['parameter_tampering', 'replay_attacks', 'privilege_or_scope_escalation', 'data_exposure', 'filesystem_trust_boundary']) {
    assert.ok(threats.has(required), 'negative-fixtures missing threat class: ' + required);
  }
});

// ===========================================================================
// (i) on-disk S02/S03 sources are byte-identical before and after the flow
// ===========================================================================

test('integration: on-disk S02/S03 source files are byte-identical before and after the producer+verifier flow', () => {
  const { tmpDir, sourceRoot } = makeTempMarker('immutability');
  const preHashes = hashAllowlistSources();
  try {
    const bundlePath = path.join(tmpDir, 'bundle.json');
    const producerProtocolPath = path.join(tmpDir, 'producer-protocol.json');
    const probeRunPath = path.join(tmpDir, 'probe-run.json');
    const inventoryPath = path.join(tmpDir, 'inventory.json');
    const verifyProtocolPath = path.join(tmpDir, 'verify-protocol.json');

    const producer = runProducer([
      '--force',
      '--bundle-out', bundlePath,
      '--protocol-out', producerProtocolPath,
      '--probe-run-out', probeRunPath,
      '--inventory-out', inventoryPath,
      '--reference-time', REFERENCE_TIME,
      '--seed', 'integration-replay',
      '--iterations', '2',
    ], sourceRoot);
    assertProducerHealthy(producer, bundlePath);

    const verifier = runVerifier([
      '--force',
      '--bundle-in', bundlePath,
      '--protocol-in', producerProtocolPath,
      '--protocol-out', verifyProtocolPath,
      '--reference-time', REFERENCE_TIME,
      '--iterations', '2',
    ], sourceRoot);
    assertVerifierHealthy(verifier, verifyProtocolPath);

    // Now check on-disk hashes — must match pre-flow.
    const postHashes = hashAllowlistSources();
    for (const ref of Object.keys(postHashes)) {
      assert.equal(postHashes[ref], preHashes[ref],
        'S02/S03 source mutated on disk during integration flow: ' + ref);
    }
  } finally {
    removeTempMarker(tmpDir);
  }
});

// ===========================================================================
// (j) clean teardown — temp dir is removed, no scratch leakage
// ===========================================================================

test('integration: clean teardown — temp marker is removed and no scratch files leak under ROOT', () => {
  const { tmpDir, sourceRoot } = makeTempMarker('teardown');
  assert.ok(fs.existsSync(tmpDir), 'temp dir must exist before teardown');
  // Snapshot existing ROOT/.tmp-m016-s04-int-teardown-* entries so we can detect new ones.
  const before = new Set(fs.readdirSync(ROOT).filter(function (name) {
    return name.indexOf('.tmp-m016-s04-int-teardown-') === 0;
  }));
  try {
    const bundlePath = path.join(tmpDir, 'bundle.json');
    const producerProtocolPath = path.join(tmpDir, 'producer-protocol.json');
    const probeRunPath = path.join(tmpDir, 'probe-run.json');
    const inventoryPath = path.join(tmpDir, 'inventory.json');

    const producer = runProducer([
      '--force',
      '--bundle-out', bundlePath,
      '--protocol-out', producerProtocolPath,
      '--probe-run-out', probeRunPath,
      '--inventory-out', inventoryPath,
      '--reference-time', REFERENCE_TIME,
      '--seed', 'integration-replay',
      '--iterations', '2',
    ], sourceRoot);
    assertProducerHealthy(producer, bundlePath);
  } finally {
    removeTempMarker(tmpDir);
  }
  assert.equal(fs.existsSync(tmpDir), false, 'temp dir must be removed after teardown');

  // After teardown: any new .tmp-m016-s04-int-teardown-* marker under ROOT is a leak.
  const after = fs.readdirSync(ROOT).filter(function (name) {
    return name.indexOf('.tmp-m016-s04-int-teardown-') === 0;
  });
  const leaked = after.filter(function (n) { return !before.has(n); });
  assert.equal(leaked.length, 0, 'scratch leak detected under ROOT: ' + leaked.join(','));
});

// ===========================================================================
// (k) tamper path — verifier against tampered bundle → FAIL_CLOSED
// ===========================================================================

test('integration: verifier against tampered bundle (launch verdict=GO) returns FAIL_CLOSED with M16-S04-VERIFY-LAUNCH-PROMOTION-DETECTED-GO', () => {
  const { tmpDir, sourceRoot } = makeTempMarker('tamper');
  try {
    const bundlePath = path.join(tmpDir, 'bundle.json');
    const producerProtocolPath = path.join(tmpDir, 'producer-protocol.json');
    const probeRunPath = path.join(tmpDir, 'probe-run.json');
    const inventoryPath = path.join(tmpDir, 'inventory.json');

    const producer = runProducer([
      '--force',
      '--bundle-out', bundlePath,
      '--protocol-out', producerProtocolPath,
      '--probe-run-out', probeRunPath,
      '--inventory-out', inventoryPath,
      '--reference-time', REFERENCE_TIME,
      '--seed', 'integration-replay',
      '--iterations', '2',
    ], sourceRoot);
    assertProducerHealthy(producer, bundlePath);

    // Mutate the bundle in a tamper copy: launch verdict promoted to GO.
    // Use the outer sourceRoot for the verifier (NOT a fresh snapshot) so
    // raw_sha_reproduction matches the producer's hashes; the inner marker
    // exists only as a directory for the tampered bundle copy + verifier
    // protocol output, so we discard its own sourceRoot via .tmpDir access.
    const tamperedDir = makeTempMarker('tamper-bundle').tmpDir;
    try {
      const tamperedBundlePath = path.join(tamperedDir, 'bundle.json');
      const original = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
      original.embedded_classification.verdicts.launch = 'GO';
      fs.writeFileSync(tamperedBundlePath, JSON.stringify(original, null, 2));

      const verifyOnTamperedPath = path.join(tamperedDir, 'verify-protocol.json');
      const verifier = runVerifier([
        '--force',
        '--bundle-in', tamperedBundlePath,
        '--protocol-in', producerProtocolPath,
        '--protocol-out', verifyOnTamperedPath,
        '--reference-time', REFERENCE_TIME,
        '--iterations', '2',
      ], sourceRoot);

      // Verifier exits non-zero.
      assert.notEqual(verifier.status, EXIT_CODES.CANARY_PASS,
        'verifier must exit non-zero on tampered bundle; got ' + verifier.status);

      // Canonical FAIL_CLOSED line on stderr.
      assert.match(verifier.stderr || verifier.stdout, /M16-S04-VERIFY verdict=fail_closed/);

      // Verify protocol still emitted and records the FAIL_CLOSED verdict + expected blocker.
      assert.ok(fs.existsSync(verifyOnTamperedPath), 'verify-protocol must be emitted even on tampered bundle');
      const tamperedVp = readJson(verifyOnTamperedPath);
      const codes = (tamperedVp.blockers || []).map(function (b) { return b.code; });
      assert.ok(codes.some(function (c) { return c.indexOf('LAUNCH-PROMOTION') >= 0; }),
        'expected LAUNCH-PROMOTION blocker in tampered run; got ' + JSON.stringify(codes));
      // Verifier's launch_posture_audit must report frozen=false.
      assert.equal(tamperedVp.launch_posture_audit.frozen, false);
      // Verifier's derived embedded_classification_verdicts.launch is
      // intentionally hard-coded to PREPARATION_ONLY (see deriveEmbeddedVerdicts)
      // even when the producer-side verdict was tampered — the launch
      // posture is structurally frozen at the canary layer. Instead, the
      // audit signal is classification_drift which records producer↔verifier
      // disagreement.
      assert.equal(tamperedVp.embedded_classification_verdicts.launch, 'PREPARATION_ONLY',
        'verifier hardcodes launch verdict to PREPARATION_ONLY');
      const drift = tamperedVp.classification_drift || [];
      assert.ok(drift.some(function (d) { return d.indexOf('launch drift') >= 0; }),
        'expected launch drift in classification_drift, got ' + JSON.stringify(drift));
    } finally {
      removeTempMarker(tamperedDir);
    }
  } finally {
    removeTempMarker(tmpDir);
  }
});

// ===========================================================================
// (l) end-to-end slice admission — all invariants in one node:test block
// ===========================================================================

test('integration: end-to-end slice admission — all six S04 invariants hold under one deterministic replay', () => {
  const { tmpDir, sourceRoot } = makeTempMarker('slice-admission');
  try {
    // Step 1: producer
    const bundlePath = path.join(tmpDir, 'bundle.json');
    const producerProtocolPath = path.join(tmpDir, 'producer-protocol.json');
    const probeRunPath = path.join(tmpDir, 'probe-run.json');
    const inventoryPath = path.join(tmpDir, 'inventory.json');
    const verifyProtocolPath = path.join(tmpDir, 'verify-protocol.json');

    const producer = runProducer([
      '--force',
      '--bundle-out', bundlePath,
      '--protocol-out', producerProtocolPath,
      '--probe-run-out', probeRunPath,
      '--inventory-out', inventoryPath,
      '--reference-time', REFERENCE_TIME,
      '--seed', 'integration-replay',
      '--iterations', '2',
    ], sourceRoot);
    assertProducerHealthy(producer, bundlePath);

    // Step 2: verifier (fresh process, separate exit code, separate stdout line)
    const verifier = runVerifier([
      '--force',
      '--bundle-in', bundlePath,
      '--protocol-in', producerProtocolPath,
      '--protocol-out', verifyProtocolPath,
      '--reference-time', REFERENCE_TIME,
      '--iterations', '2',
    ], sourceRoot);
    assertVerifierHealthy(verifier, verifyProtocolPath);

    // Step 3: invariants
    const bundle = readJson(bundlePath);
    const vp = readJson(verifyProtocolPath);

    // Invariant 1: launch verdict frozen at PREPARATION_ONLY across both views.
    assert.equal(bundle.embedded_classification.verdicts.launch, 'PREPARATION_ONLY');
    assert.equal(vp.embedded_classification_verdicts.launch, 'PREPARATION_ONLY');

    // Invariant 2: CG1..CG8 pass in both producer and verifier views.
    for (const g of CANARY_GATE_IDS) {
      assert.equal(bundle.embedded_classification.canary_gates[g], 'pass');
      assert.equal(vp.gates[g], 'pass');
    }

    // Invariant 3: byte-identical dual replay recorded in producer-protocol.
    const pp = readJson(producerProtocolPath);
    assert.equal(pp.replay.byte_identical, true);
    assert.equal(pp.replay.first_run_provenance_hash, pp.replay.second_run_provenance_hash);

    // Invariant 4: deterministic independent replay (verifier's N-iteration replay).
    assert.equal(vp.independent_replay.deterministic, true);
    assert.equal(vp.independent_replay.first_mismatched_run, null);

    // Invariant 5: correlation chain — unique probe/evidence/agent_run.
    const probes = new Set(bundle.correlation_contract.probe_to_criterion.map(function (r) { return r.probe_id; }));
    const evs = new Set(bundle.correlation_contract.probe_to_criterion.map(function (r) { return r.evidence_id; }));
    const agents = new Set(bundle.correlation_contract.probe_to_criterion.map(function (r) { return r.agent_run_id; }));
    assert.equal(probes.size, 3);
    assert.equal(evs.size, 3);
    assert.equal(agents.size, 1);

    // Invariant 6: S02/S03 pre/post hashes equal in evidence chain, both unchanged.
    for (const row of bundle.evidence_chain) {
      assert.equal(row.unchanged, true);
      assert.equal(row.pre_hash_sha256, row.post_hash_sha256);
    }
    assert.equal(vp.s02_baseline_reproduction.match, true);
    assert.equal(vp.s03_pack_reproduction.match, true);

    // Canonical lines exist (already asserted in producer/verifier tests, but pin here for the all-in-one gate).
    assert.match(producer.stdout, /M16-S04-CANARY verdict=PRODUCED exit=0 /);
    assert.match(verifier.stdout, /M16-S04-VERIFY verdict=PASS exit=0 block_count=0 /);
  } finally {
    removeTempMarker(tmpDir);
  }
});
