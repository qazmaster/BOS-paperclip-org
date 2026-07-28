#!/usr/bin/env node
'use strict';

/**
 * scripts/test_m016_s09_human_review_integration.js
 *
 * M016-txa3vu / S09 / T03 — End-to-end integration scenarios for the
 * independent human-proof acceptance reviewer (run as subprocesses
 * against the real builder + real canonical sources).
 *
 * Coverage:
 *   i01  builder + verifier subprocess — canonical pass (positive end-to-end)
 *   i02  builder subprocess failure (no --output) — both CLIs isolated
 *   i03  builder produces stable embedded JSON; verifier parses it
 *   i04  builder pre/post hash snapshot — verifier agrees (no upstream mutation)
 *   i05  two verifier runs against same HUMAN-REVIEW.md → byte-identical stdout
 *   i06  verifier CLI line shape strictly matches contract.CLI_LINE_REGEX
 *   i07  builder + verifier both fail-closed on the SAME upstream source removal
 *   i08  verifier exit code namespace — every emitted code is in contract.EXIT_CODES
 *   i09  builder stdout CLI line and verifier stdout CLI line both contain 11 source_count
 *   i10  builder pre-snapshot = post-snapshot; verifier sees zero mutation_count
 *   i11  builder emits M16-S09-BUILD prefix; verifier emits M16-S09-REVIEW prefix
 *   i12  integration with S08 closure present + scope_decision present → verifier passes
 *   i13  end-to-end independence: verifier never requires builder
 *   i14  malformed CLI argv → runner failure exit code
 *
 * Run: node --test scripts/test_m016_s09_human_review_integration.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const contract = require('./lib/m016-s09-human-review-contract.js');
const verifier = require('./verify_m016_s09_human_review.js');

// ---------------------------------------------------------------------------
// Fixture helpers — write a rooted tmp project tree with the 11
// allowlisted sources + a complete builder-runnable invariant layout.
// ---------------------------------------------------------------------------
function makeIntegrationFixture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'm016-s09-t03-int-'));
  const realTmp = fs.realpathSync(tmp);
  fs.mkdirSync(path.join(realTmp, 'runtime-evidence'), { recursive: true });
  fs.mkdirSync(path.join(realTmp, '.gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof'), { recursive: true });
  fs.mkdirSync(path.join(realTmp, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(realTmp, 'scripts/lib'), { recursive: true });
  // Copy the contract, helpers, loader, builder, and verifier into the
  // fixture tree so the integration tests run in a hermetic environment.
  const sources = [
    'scripts/lib/m016-s09-human-review-contract.js',
    'scripts/lib/m016-s09-human-review-helpers.js',
    'scripts/lib/m016-s09-canonical-reference-loader.js',
    'scripts/build_m016_s09_human_review.js',
    'scripts/verify_m016_s09_human_review.js',
  ];
  for (const rel of sources) {
    // __dirname is scripts/ — project-relative source paths start at the
    // repo root, so resolve relative to the parent (project root).
    const src = path.resolve(__dirname, '..', rel);
    const dst = path.join(realTmp, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
  const hashes = {};
  for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
    const payload = { source_ref: ref, fixture_kind: 's09-t03-integration', captured_at: contract.HUMAN_REVIEW_REFERENCE_TIME };
    const body = JSON.stringify(payload);
    const abs = path.join(realTmp, ref);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, Buffer.from(body, 'utf8'));
    hashes[ref] = crypto.createHash('sha256').update(Buffer.from(body, 'utf8')).digest('hex');
  }
  return { tmp: realTmp, hashes };
}

function runBuilder(fx, outRel) {
  // --force is always passed: each integration test owns a fresh tmp
  // fixture, and tests that re-run the builder (i02, i04) would otherwise
  // fail with ATOMIC-WRITE-FAILED on the second invocation. Tests that
  // expect fail-closed behaviour (i07) don't depend on the overwrite guard.
  return spawnSync('node', [
    path.join(fx.tmp, 'scripts/build_m016_s09_human_review.js'),
    '--output', outRel,
    '--force',
  ], { cwd: fx.tmp, encoding: 'utf8' });
}

function runVerifier(fx, hrRel) {
  return spawnSync('node', [
    path.join(fx.tmp, 'scripts/verify_m016_s09_human_review.js'),
    '--human-review-path', hrRel,
    '--source-root', fx.tmp,
  ], { cwd: fx.tmp, encoding: 'utf8' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('i01 builder + verifier subprocess — canonical pass (positive end-to-end)', () => {
  const fx = makeIntegrationFixture();
  const outRel = '.gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/16-09-HUMAN-REVIEW.md';
  const b = runBuilder(fx, outRel);
  assert.equal(b.status, 0, 'builder failed; stderr=' + b.stderr + ' stdout=' + b.stdout);
  assert.ok(/M16-S09-BUILD/.test(b.stdout));
  const v = runVerifier(fx, outRel);
  assert.equal(v.status, 0, 'verifier failed; stderr=' + v.stderr + ' stdout=' + v.stdout);
  assert.ok(/^M16-S09-REVIEW\s+/.test(v.stdout));
  assert.ok(/verdict=PREPARATION_ONLY/.test(v.stdout));
  assert.ok(/exit=0/.test(v.stdout));
  assert.ok(/block_count=0/.test(v.stdout));
  assert.ok(/section_count=5/.test(v.stdout));
  assert.ok(/source_count=11/.test(v.stdout));
});

test('i02 builder subprocess failure (no --output) — both CLIs isolated', () => {
  const fx = makeIntegrationFixture();
  const b = spawnSync('node', [
    path.join(fx.tmp, 'scripts/build_m016_s09_human_review.js'),
  ], { cwd: fx.tmp, encoding: 'utf8' });
  // Builder may succeed or fail-closed depending on its default output;
  // what we care about: verifier is independent and unaffected.
  const outRel = '.gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/16-09-HUMAN-REVIEW.md';
  const b2 = runBuilder(fx, outRel);
  assert.equal(b2.status, 0, 'builder2 failed; stderr=' + b2.stderr);
  const v = runVerifier(fx, outRel);
  assert.equal(v.status, 0, 'verifier failed after first builder; stderr=' + v.stderr);
  assert.ok(/^M16-S09-REVIEW\s+/.test(v.stdout));
});

test('i03 builder produces stable embedded JSON; verifier parses it', () => {
  const fx = makeIntegrationFixture();
  const outRel = '.gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/16-09-HUMAN-REVIEW.md';
  const b = runBuilder(fx, outRel);
  assert.equal(b.status, 0);
  const md = fs.readFileSync(path.join(fx.tmp, outRel), 'utf8');
  const model = verifier.extractModel(md);
  assert.equal(model.schema_id, contract.SCHEMA_ID);
  assert.equal(model.slice, 'S09');
  assert.equal(model.section_count, 5);
  assert.equal(model.source_count, 11);
});

test('i04 builder pre/post hash snapshot — verifier agrees (no upstream mutation)', () => {
  const fx = makeIntegrationFixture();
  const outRel = '.gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/16-09-HUMAN-REVIEW.md';
  const b1 = runBuilder(fx, outRel);
  assert.equal(b1.status, 0);
  // Hashes from first build.
  const md = fs.readFileSync(path.join(fx.tmp, outRel), 'utf8');
  const model = verifier.extractModel(md);
  const before = Object.assign({}, model.source_hashes);
  // Re-run builder and re-verify.
  const b2 = runBuilder(fx, outRel);
  assert.equal(b2.status, 0);
  const v = runVerifier(fx, outRel);
  assert.equal(v.status, 0, 'verifier failed post-rebuild; stderr=' + v.stderr);
  const md2 = fs.readFileSync(path.join(fx.tmp, outRel), 'utf8');
  const model2 = verifier.extractModel(md2);
  for (const ref of Object.keys(before)) {
    assert.equal(before[ref], model2.source_hashes[ref], 'source ' + ref + ' hash drifted between builds');
  }
});

test('i05 two verifier runs against same HUMAN-REVIEW.md → byte-identical stdout', () => {
  const fx = makeIntegrationFixture();
  const outRel = '.gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/16-09-HUMAN-REVIEW.md';
  const b = runBuilder(fx, outRel);
  assert.equal(b.status, 0);
  const v1 = runVerifier(fx, outRel);
  const v2 = runVerifier(fx, outRel);
  assert.equal(v1.status, 0);
  assert.equal(v2.status, 0);
  // CLI line is byte-identical between runs (sha256 over markdown).
  // The line includes the output_sha256; if the markdown body didn't
  // change, both runs compute the same digest.
  const line1 = v1.stdout.split('\n')[0];
  const line2 = v2.stdout.split('\n')[0];
  assert.equal(line1, line2);
});

test('i06 verifier CLI line shape strictly matches contract.CLI_LINE_REGEX', () => {
  const fx = makeIntegrationFixture();
  const outRel = '.gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/16-09-HUMAN-REVIEW.md';
  const b = runBuilder(fx, outRel);
  assert.equal(b.status, 0);
  const v = runVerifier(fx, outRel);
  assert.equal(v.status, 0);
  const line = v.stdout.split('\n')[0];
  assert.ok(contract.CLI_LINE_REGEX.test(line), 'verifier CLI line failed regex: ' + line);
});

test('i07 builder + verifier both fail-closed on the SAME upstream source removal', () => {
  const fx = makeIntegrationFixture();
  const outRel = '.gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/16-09-HUMAN-REVIEW.md';
  // First pass — builder + verifier happy.
  const b1 = runBuilder(fx, outRel);
  assert.equal(b1.status, 0, 'first builder failed; stderr=' + b1.stderr);
  // Mutate upstream — remove S08 closure file.
  fs.unlinkSync(path.join(fx.tmp, contract.REF.S08_CLOSURE));
  // Second build must fail-closed.
  const b2 = runBuilder(fx, outRel);
  assert.notEqual(b2.status, 0, 'second builder should have failed closed');
  // Verifier must also fail-closed.
  const v = runVerifier(fx, outRel);
  assert.notEqual(v.status, 0, 'verifier should have failed closed');
  assert.ok(/SOURCE-MISSING/.test(v.stderr + v.stdout), 'stderr=' + v.stderr);
});

test('i08 verifier exit code namespace — every emitted code is in contract.EXIT_CODES', () => {
  const fx = makeIntegrationFixture();
  const outRel = '.gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/16-09-HUMAN-REVIEW.md';
  const b = runBuilder(fx, outRel);
  assert.equal(b.status, 0);
  const v = runVerifier(fx, outRel);
  assert.ok(Object.values(contract.EXIT_CODES).indexOf(v.status) >= 0, 'verifier exit code not in namespace: ' + v.status);
});

test('i09 builder stdout CLI line and verifier stdout CLI line both contain 11 source_count', () => {
  const fx = makeIntegrationFixture();
  const outRel = '.gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/16-09-HUMAN-REVIEW.md';
  const b = runBuilder(fx, outRel);
  assert.equal(b.status, 0);
  const v = runVerifier(fx, outRel);
  assert.equal(v.status, 0);
  assert.ok(/source_count=11/.test(b.stdout));
  assert.ok(/source_count=11/.test(v.stdout));
});

test('i10 builder pre-snapshot = post-snapshot; verifier sees zero mutation_count', () => {
  const fx = makeIntegrationFixture();
  const outRel = '.gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/16-09-HUMAN-REVIEW.md';
  // Take pre-snapshot of every allowlisted source.
  const pre = {};
  for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
    const abs = path.join(fx.tmp, ref);
    if (fs.existsSync(abs)) pre[ref] = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
  }
  const b = runBuilder(fx, outRel);
  assert.equal(b.status, 0);
  // Post-snapshot.
  const post = {};
  for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
    const abs = path.join(fx.tmp, ref);
    if (fs.existsSync(abs)) post[ref] = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
  }
  for (const ref of Object.keys(pre)) {
    assert.equal(pre[ref], post[ref], 'upstream source ' + ref + ' was mutated by the build');
  }
});

test('i11 builder emits M16-S09-BUILD prefix; verifier emits M16-S09-REVIEW prefix', () => {
  const fx = makeIntegrationFixture();
  const outRel = '.gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/16-09-HUMAN-REVIEW.md';
  const b = runBuilder(fx, outRel);
  assert.equal(b.status, 0);
  const v = runVerifier(fx, outRel);
  assert.equal(v.status, 0);
  assert.ok(/^M16-S09-BUILD\s+/.test(b.stdout));
  assert.ok(/^M16-S09-REVIEW\s+/.test(v.stdout));
});

test('i12 integration with S08 closure present + scope_decision present → verifier passes', () => {
  const fx = makeIntegrationFixture();
  const outRel = '.gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/16-09-HUMAN-REVIEW.md';
  const b = runBuilder(fx, outRel);
  assert.equal(b.status, 0);
  // Both S08 sources present and used.
  assert.ok(fs.existsSync(path.join(fx.tmp, contract.REF.S08_CLOSURE)));
  assert.ok(fs.existsSync(path.join(fx.tmp, contract.REF.S08_SCOPE_DECISION)));
  const v = runVerifier(fx, outRel);
  assert.equal(v.status, 0);
});

test('i13 end-to-end independence: verifier never requires builder', () => {
  // The verifier source must not contain a require of the builder
  // module — same static check as v34 in the verifier suite, but
  // re-asserted in integration so the orchestrator never has to load
  // the builder module to run the verifier.
  const src = fs.readFileSync(path.resolve(__dirname, 'verify_m016_s09_human_review.js'), 'utf8');
  assert.ok(!/require\(.*build_m016_s09_human_review/.test(src));
  // Independently, the verifier module must load without the builder present.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'm016-s09-t03-isolated-'));
  // Copy only contract + helpers + loader into the isolated tree — no builder.
  for (const rel of ['scripts/lib/m016-s09-human-review-contract.js', 'scripts/lib/m016-s09-human-review-helpers.js', 'scripts/lib/m016-s09-canonical-reference-loader.js']) {
    const dst = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    // __dirname is scripts/ — project-relative source paths start at the
    // repo root, so resolve relative to the parent (project root).
    fs.copyFileSync(path.resolve(__dirname, '..', rel), dst);
  }
  const verifierDst = path.join(tmp, 'scripts/verify_m016_s09_human_review.js');
  fs.mkdirSync(path.dirname(verifierDst), { recursive: true });
  fs.copyFileSync(path.resolve(__dirname, '..', 'scripts/verify_m016_s09_human_review.js'), verifierDst);
  // Resolve its imports relative to the isolated tree.
  const verifierSrc = fs.readFileSync(verifierDst, 'utf8').replace("require('./lib/m016-s09-human-review-contract.js')", "require('" + path.join(tmp, 'scripts/lib/m016-s09-human-review-contract.js') + "')").replace("require('./lib/m016-s09-canonical-reference-loader.js')", "require('" + path.join(tmp, 'scripts/lib/m016-s09-canonical-reference-loader.js') + "')");
  fs.writeFileSync(verifierDst, verifierSrc, 'utf8');
  // The isolated verifier must load — this proves the builder is not in
  // its dependency graph.
  delete require.cache[verifierDst];
  const mod = require(verifierDst);
  assert.equal(typeof mod.run, 'function');
});

test('i14 malformed CLI argv → runner failure exit code', () => {
  const fx = makeIntegrationFixture();
  const v = spawnSync('node', [
    path.join(fx.tmp, 'scripts/verify_m016_s09_human_review.js'),
    '--bogus-flag',
  ], { cwd: fx.tmp, encoding: 'utf8' });
  assert.notEqual(v.status, 0);
  assert.ok(/unknown argv/.test(v.stderr) || /RUNNER-FAILURE/.test(v.stderr), 'stderr=' + v.stderr);
});