#!/usr/bin/env node
'use strict';

/**
 * scripts/test_m016_s09_human_review_builder.js
 *
 * M016-txa3vu / S09 / T02 — node:test scenarios for the bounded
 * canonical-reference loader + atomic review builder.
 *
 * Covers:
 *   (a) Loader public surface — exports, names, ROOT, blocker codes
 *   (b) Loader basic load — 11 allowlisted sources, sha256, statuses
 *   (c) Loader SHA-256 byte determinism
 *   (d) Loader zero mutation/network/subprocess/env counters
 *   (e) Loader missing source → status='missing'
 *   (f) Loader malformed source → status='malformed'
 *   (g) Loader path-traversal refusal (absolute, `..`, escape)
 *   (h) Loader snapshot + diff — pre/post = identity
 *   (i) Builder parseArgs — every supported flag and defaults
 *   (j) Builder parseArgs — rejects unknown argv token
 *   (k) Builder ensureInsideRoot — refuses output traversal
 *   (l) Builder atomicWriteText — refuses overwrite without --force
 *   (m) Builder atomicWriteText --force overwrites
 *   (n) Builder atomicWriteText — tmp file cleaned on failure
 *   (o) Builder buildBuilderCliLine — stable shape, valid verifier regex
 *   (p) Builder buildModel happy path — 11 reads → model passes evaluateReviewContract
 *   (q) Builder buildModel fail-closed — missing source → N blockers
 *   (r) Builder markdown rendering — 5 sections in frozen order + provenance + embedded JSON
 *   (s) Builder NOT_PROVEN preservation sibling invariant
 *   (t) Builder embedded model block — parseable JSON, frozen vocabulary intact
 *   (u) Builder end-to-end — atomic write + correct exit + drift snapshot unchanged
 *   (v) Builder determinism — same inputs → same byte output
 *   (w) Builder pre/post mutation check — 11 source hashes byte-identical
 *   (x) Builder Div1 communication maps 2 distinct kinds
 *   (y) Builder split: builder does NOT import a verifier module
 *
 * Run: node --test scripts/test_m016_s09_human_review_builder.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const contract = require('./lib/m016-s09-human-review-contract.js');
const helpers = require('./lib/m016-s09-human-review-helpers.js');
const loader = require('./lib/m016-s09-canonical-reference-loader.js');
const builder = require('./build_m016_s09_human_review.js');

const ROOT = loader.ROOT;

// ---------------------------------------------------------------------------
// Fixture helper — builds a tmp project-root layout with the 11 allowlisted
// stub source files. Tmp is fully isolated; never mutates the real tree.
// ---------------------------------------------------------------------------
function makeFixtureRoot() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'm016-s09-t02-'));
  // Realpath the root for symlink-safe comparisons (macOS /tmp is /private/tmp).
  const realTmp = fs.realpathSync(tmp);
  fs.mkdirSync(path.join(realTmp, 'runtime-evidence'), { recursive: true });
  const blobs = {};
  for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
    const body = JSON.stringify({ source_ref: ref, fixture_kind: 's09-t02-test', index: blobs[ref] = (blobs[ref] || 0) + 0 });
    const abs = path.join(realTmp, ref);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, Buffer.from(body, 'utf8'));
  }
  return { tmp: realTmp, blobs };
}

function makeMalformedFixtureRoot() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'm016-s09-t02-malformed-'));
  const realTmp = fs.realpathSync(tmp);
  fs.mkdirSync(path.join(realTmp, 'runtime-evidence'), { recursive: true });
  for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
    const abs = path.join(realTmp, ref);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    if (ref.indexOf('S08-native-seven-agent-closure') !== -1) {
      // write good content, then surgically corrupt
      fs.writeFileSync(abs, '{ malformed: ');
    } else if (ref.indexOf('M015-native-seven-division-mission-20260717') !== -1) {
      // explicitly drop this source to test missing behaviour
      continue;
    } else {
      fs.writeFileSync(abs, Buffer.from(JSON.stringify({ fixture_kind: 's09-t02-malformed-ok', source_ref: ref }), 'utf8'));
    }
  }
  return { tmp: realTmp };
}

function makeMissingFixtureRoot() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'm016-s09-t02-missing-'));
  const realTmp = fs.realpathSync(tmp);
  fs.mkdirSync(path.join(realTmp, 'runtime-evidence'), { recursive: true });
  for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
    if (ref.indexOf('S08-native-seven-agent-closure') !== -1) continue;
    if (ref.indexOf('S08-native-seven-agent-scope-decision') !== -1) continue;
    if (ref.indexOf('M015-native-seven-division-mission-20260717') !== -1) continue;
    const abs = path.join(realTmp, ref);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, Buffer.from(JSON.stringify({ fixture_kind: 's09-t02-missing-ok', source_ref: ref }), 'utf8'));
  }
  return { tmp: realTmp };
}

function makeOneMissingFixtureRoot(skipRef) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'm016-s09-t02-one-missing-'));
  const realTmp = fs.realpathSync(tmp);
  fs.mkdirSync(path.join(realTmp, 'runtime-evidence'), { recursive: true });
  for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
    if (ref === skipRef) continue;
    const abs = path.join(realTmp, ref);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, Buffer.from(JSON.stringify({ fixture_kind: 's09-t02-one-missing', source_ref: ref }), 'utf8'));
  }
  return { tmp: realTmp };
}

function makeRootedTmp(name) {
  // Path inside project root: `.gsd/exec/s09-t02-<name>-<rand>/...`
  // Lexically inside ROOT (passes ensureInsideRoot) while still isolated
  // per test. Followed by a `cleanup` step.
  const rand = crypto.randomBytes(3).toString('hex');
  const dir = path.join(ROOT, '.gsd', 'exec', 's09-t02-' + name + '-' + rand);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupRoot(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (_e) { /* ignore */ } }

// ---------------------------------------------------------------------------
// (a) Loader public surface
// ---------------------------------------------------------------------------
test('a1: loader exports the documented public surface', () => {
  const expected = ['ROOT', 'LOADER_BLOCKERS', 'resolveSourcePath', 'assertInsideRoot', 'computeSha256Hex', 'readSource', 'loadCanonicalReferences', 'snapshotHashes', 'diffSnapshots'];
  for (const name of expected) {
    assert.ok(typeof loader[name] !== 'undefined', 'loader must export ' + name);
  }
  assert.equal(typeof loader.ROOT, 'string');
  assert.ok(loader.ROOT.endsWith('BOS_Chimera_Paperclip_Handoff'));
});

test('a2: LOADER_BLOCKERS mirrors contract.BLOCKER_CODES namespace', () => {
  assert.equal(loader.LOADER_BLOCKERS.PATH_TRAVERSAL('k'), contract.BLOCKER_CODES.PATH_TRAVERSAL('k'));
  assert.equal(loader.LOADER_BLOCKERS.SOURCE_MISSING('r'), contract.BLOCKER_CODES.SOURCE_MISSING('r'));
  assert.equal(loader.LOADER_BLOCKERS.SOURCE_HASH_DRIFT('r'), contract.BLOCKER_CODES.SOURCE_HASH_DRIFT('r'));
});

// ---------------------------------------------------------------------------
// (b) Loader basic load
// ---------------------------------------------------------------------------
test('b1: loadCanonicalReferences yields 11 rows against real project root', () => {
  const result = loader.loadCanonicalReferences({});
  assert.equal(result.rows.length, contract.EXPECTED_SOURCE_COUNT);
  // Real project root reads M015/S02/S05/S06/S08 (some sources may be
  // missing on disk — that's fine, we test statuses shape, not read count).
  for (const row of result.rows) {
    assert.ok(['read', 'missing', 'malformed'].indexOf(row.status) >= 0);
    assert.ok(row.source_ref && typeof row.source_ref === 'string');
    assert.ok(row.chain_role && typeof row.chain_role === 'string');
  }
  // At least the S02 + S05 sources MUST be present and read.
  for (const required of [contract.REF.S02_PROOF, contract.REF.S05_BUNDLE, contract.REF.S05_WORKSHEET, contract.REF.S06_RECONCILIATION, contract.REF.S08_SCOPE_DECISION]) {
    const row = result.rows.find((r) => r.source_ref === required);
    assert.ok(row, 'must include row for ' + required);
    assert.equal(row.status, 'read', required + ' must be read');
    assert.ok(/^[a-f0-9]{64}$/.test(row.sha256), required + ' sha256 must be 64-char hex');
  }
});

test('b2: sources_by_ref only contains reads (no missing/malformed payloads)', () => {
  const result = loader.loadCanonicalReferences({});
  for (const ref of Object.keys(result.sources_by_ref)) {
    const row = result.rows.find((r) => r.source_ref === ref);
    assert.equal(row.status, 'read');
  }
  // Counters summary stays frozen.
  assert.equal(result.summary.expected_count, 11);
  assert.equal(result.summary.read_count + result.summary.missing_count + result.summary.malformed_count, 11);
});

// ---------------------------------------------------------------------------
// (c) Loader SHA-256 byte determinism
// ---------------------------------------------------------------------------
test('c1: computeSha256Hex matches contract.sha256Hex for known vectors', () => {
  assert.equal(loader.computeSha256Hex(Buffer.from('')), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(loader.computeSha256Hex(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(loader.computeSha256Hex(Buffer.from('hello world')), 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
});

test('c2: loadCanonicalReferences produces identical hashes across two runs', () => {
  const fx = makeFixtureRoot();
  try {
    const a = loader.loadCanonicalReferences({ sourceRoot: fx.tmp });
    const b = loader.loadCanonicalReferences({ sourceRoot: fx.tmp });
    assert.equal(a.summary.read_count, b.summary.read_count);
    for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
      assert.equal(a.all_hashes[ref], b.all_hashes[ref], 'hash drift for ' + ref);
    }
  } finally { cleanupRoot(fx.tmp); }
});

// ---------------------------------------------------------------------------
// (d) Loader zero-counter invariants
// ---------------------------------------------------------------------------
test('d1: loader counters stay at zero (no network / subprocess / env reads)', () => {
  const fx = makeFixtureRoot();
  try {
    const r = loader.loadCanonicalReferences({ sourceRoot: fx.tmp });
    assert.equal(r.counters.network_calls, 0);
    assert.equal(r.counters.subprocess_calls, 0);
    assert.equal(r.counters.env_reads, 0);
    assert.equal(r.counters.mutation_count, 0);
  } finally { cleanupRoot(fx.tmp); }
});

// ---------------------------------------------------------------------------
// (e) Loader missing source
// ---------------------------------------------------------------------------
test('e1: missing source produces status="missing" and is absent from all_hashes', () => {
  const fx = makeMissingFixtureRoot();
  try {
    const r = loader.loadCanonicalReferences({ sourceRoot: fx.tmp });
    for (const ref of [contract.REF.M015_BASELINE, contract.REF.S08_CLOSURE, contract.REF.S08_SCOPE_DECISION]) {
      const row = r.rows.find((x) => x.source_ref === ref);
      assert.equal(row.status, 'missing', ref + ' must be missing');
      assert.equal(row.sha256, '');
      assert.equal(r.all_hashes[ref], undefined, ref + ' must be absent from all_hashes');
    }
    // rest are read
    for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
      if ([contract.REF.M015_BASELINE, contract.REF.S08_CLOSURE, contract.REF.S08_SCOPE_DECISION].indexOf(ref) >= 0) continue;
      const row = r.rows.find((x) => x.source_ref === ref);
      assert.equal(row.status, 'read', ref + ' must be read');
    }
  } finally { cleanupRoot(fx.tmp); }
});

// ---------------------------------------------------------------------------
// (f) Loader malformed source
// ---------------------------------------------------------------------------
test('f1: malformed JSON produces status="malformed" and sentinel empty hash in all_hashes', () => {
  const fx = makeMalformedFixtureRoot();
  try {
    const r = loader.loadCanonicalReferences({ sourceRoot: fx.tmp });
    const closureRow = r.rows.find((x) => x.source_ref === contract.REF.S08_CLOSURE);
    assert.equal(closureRow.status, 'malformed');
    // The row still records the byte-stable sha256 of the malformed bytes,
    // so downstream prov surfacing keeps the raw fingerprint. The
    // all_hashes map, however, uses '' as a sentinel to flag the hash
    // for the contract's SOURCE_HASH_DRIFT branch.
    assert.ok(/^[a-f0-9]{64}$/.test(closureRow.sha256), 'malformed row must keep sha256 of raw bytes');
    assert.equal(r.all_hashes[contract.REF.S08_CLOSURE], '', 'all_hashes must use empty-string sentinel for malformed sources');
    const m015Row = r.rows.find((x) => x.source_ref === contract.REF.M015_BASELINE);
    assert.equal(m015Row.status, 'missing', 'M015 deliberately dropped');
  } finally { cleanupRoot(fx.tmp); }
});

// ---------------------------------------------------------------------------
// (g) Loader path traversal refusal
// ---------------------------------------------------------------------------
test('g1: resolveSourcePath refuses absolute source_ref', () => {
  assert.throws(() => loader.resolveSourcePath('/etc/passwd', null), /absolute source_ref rejected/);
});

test('g2: resolveSourcePath refuses empty source_ref', () => {
  assert.throws(() => loader.resolveSourcePath('', null), /source_ref is not a non-empty string/);
});

test('g3: assertInsideRoot refuses real path outside the project root', () => {
  const escaper = fs.mkdtempSync(path.join(os.tmpdir(), 'm016-s09-t02-escape-'));
  try {
    fs.writeFileSync(path.join(escaper, 'evil.json'), '{}');
    let threw = false;
    try {
      loader.assertInsideRoot(path.join(escaper, 'evil.json'), '../etc/passwd');
    } catch (_e) { threw = true; }
    assert.ok(threw || fs.realpathSync(escaper).indexOf(fs.realpathSync(os.tmpdir())) !== 0, 'either threw OR the test temp is not actually outside the real /tmp');
  } finally { cleanupRoot(escaper); }
});

// ---------------------------------------------------------------------------
// (h) Loader snapshot + diff
// ---------------------------------------------------------------------------
test('h1: snapshotHashes + diffSnapshots: identity for unchanged sources', () => {
  const fx = makeFixtureRoot();
  try {
    const a = loader.loadCanonicalReferences({ sourceRoot: fx.tmp });
    const sa = loader.snapshotHashes(a);
    const b = loader.loadCanonicalReferences({ sourceRoot: fx.tmp });
    const sb = loader.snapshotHashes(b);
    const d = loader.diffSnapshots(sa, sb);
    assert.equal(d.drift_count, 0);
    assert.deepEqual([...d.drift_refs], []);
    assert.equal(d.byte_total_unchanged, true);
    assert.equal(d.read_count_unchanged, true);
  } finally { cleanupRoot(fx.tmp); }
});

// ---------------------------------------------------------------------------
// (i) Builder parseArgs
// ---------------------------------------------------------------------------
test('i1: parseArgs honours every flag and applies defaults', () => {
  const args = builder.parseArgs(['node', 'script.js', '--force', '--output', 'foo.md', '--show-blockers', '--dry-run', '--confirm-m016-s09-human-review', '--reference-time', '2026-07-22T00:00:00.000Z', '--source-root', '/tmp/x']);
  assert.equal(args.force, true);
  assert.equal(args.output, 'foo.md');
  assert.equal(args.showBlockers, true);
  assert.equal(args.dryRun, true);
  assert.equal(args.operatorConfirmed, true);
  assert.equal(args.referenceTime, '2026-07-22T00:00:00.000Z');
  assert.equal(args.sourceRoot, '/tmp/x');
});

test('i2: parseArgs applies canonical defaults when no flags present', () => {
  const args = builder.parseArgs(['node', 'script.js']);
  assert.equal(args.force, false);
  assert.equal(args.output, contract.DEFAULTS.output_path);
  assert.equal(args.showBlockers, false);
  assert.equal(args.dryRun, false);
  assert.equal(args.operatorConfirmed, false);
});

// ---------------------------------------------------------------------------
// (j) Builder malformed argv
// ---------------------------------------------------------------------------
test('j1: parseArgs rejects unknown argv token', () => {
  assert.throws(() => builder.parseArgs(['node', 'script.js', '--explode']), /unknown argv token/);
});

// ---------------------------------------------------------------------------
// (k) Builder ensureInsideRoot
// ---------------------------------------------------------------------------
test('k1: ensureInsideRoot refuses absolute output escaping project root', () => {
  assert.throws(() => builder.ensureInsideRoot('/etc/passwd', null, 'output'),
    (e) => String(e.code).startsWith(contract.BLOCKER_NAMESPACE + '-PATH-TRAVERSAL-output-'));
});

test('k2: ensureInsideRoot refuses path that escapes via `..` segment', () => {
  assert.throws(() => builder.ensureInsideRoot(path.resolve(ROOT, 'foo/../../../etc/passwd'), null, 'output'),
    (e) => String(e.code).startsWith(contract.BLOCKER_NAMESPACE + '-PATH-TRAVERSAL-output-'));
});

test('k3: ensureInsideRoot accepts canonical in-tree path', () => {
  builder.ensureInsideRoot(path.resolve(ROOT, '.gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/16-09-HUMAN-REVIEW.md'), null, 'output');
});

// ---------------------------------------------------------------------------
// (l,m,n) Builder atomicWriteText
// ---------------------------------------------------------------------------
test('l1: atomicWriteText refuses overwrite without --force', () => {
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'm016-s09-t02-atomic-')), 'review.md');
  fs.writeFileSync(tmp, 'first');
  let threw = false;
  try { builder.atomicWriteText(tmp, 'second'); } catch (_e) { threw = true; }
  assert.ok(threw, 'must refuse to overwrite');
  assert.equal(fs.readFileSync(tmp, 'utf8'), 'first', 'file must be untouched after refusal');
  cleanupRoot(path.dirname(tmp));
});

test('m1: atomicWriteText --force overwrites', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm016-s09-t02-atomic-force-'));
  try {
    const target = path.join(dir, 'review.md');
    fs.writeFileSync(target, 'first');
    const res = builder.atomicWriteText(target, 'second content', { force: true });
    assert.equal(fs.readFileSync(target, 'utf8'), 'second content');
    assert.ok(res.size_bytes > 0);
    assert.ok(/^[a-f0-9]{64}$/.test(res.sha256));
  } finally { cleanupRoot(dir); }
});

test('n1: atomicWriteText refuses fs.writeFileSync failure (simulated) — tmp cleaned', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm016-s09-t02-atomic-leak-'));
  try {
    // Inject a directory at target so writeFileSync throws
    const target = path.join(dir, 'iamadirectory');
    fs.mkdirSync(target);
    let threw = false;
    try { builder.atomicWriteText(target, 'x', { force: true }); } catch (_e) { threw = true; }
    assert.ok(threw, 'must throw when target is a directory');
    // No leftover .tmp-* files in dir
    const remaining = fs.readdirSync(dir).filter((n) => n.startsWith('iamadirectory.tmp-'));
    assert.equal(remaining.length, 0, 'no tmp leftovers after failure');
  } finally { cleanupRoot(dir); }
});

// ---------------------------------------------------------------------------
// (o) buildBuilderCliLine shape
// ---------------------------------------------------------------------------
test('o1: buildBuilderCliLine emits BUILDER-prefix line with the documented structural fields', () => {
  const line = builder.buildBuilderCliLine(
    { verifier_line: contract.BUILDER_LINE_CLASS },
    { verdict: 'PREPARATION_ONLY', exitCode: 0, blockCount: 0, outputPath: '.gsd/x.md', outputSha256: 'a'.repeat(64) }
  );
  // Prefix MUST be BUILDER (canonical builder signature per slice plan).
  assert.ok(line.startsWith(contract.BUILDER_LINE_CLASS + ' '), 'line must lead with M16-S09-BUILD: ' + line);
  // Structural field contract — same field vocabulary the verifier line uses.
  assert.match(line, /verdict=PREPARATION_ONLY/);
  assert.match(line, /exit=0/);
  assert.match(line, /block_count=0/);
  assert.match(line, /section_count=5/);
  assert.match(line, /source_count=11/);
  assert.match(line, /output_path=\.gsd\/x\.md/);
  assert.match(line, /output_sha256=[a-f0-9]{64}/);
});

test('o2: contract.buildCliHealthLine emits a line that matches the contract verifier regex (REVIEW-prefix)', () => {
  const line = contract.buildCliHealthLine({
    verdict: 'PREPARATION_ONLY',
    exitCode: 0,
    blockCount: 0,
    outputPath: '.gsd/x.md',
    outputSha256: 'a'.repeat(64),
  });
  // T03 verifier line shape — the regex is owned by contract, not by the builder.
  assert.ok(contract.CLI_LINE_REGEX.test(line), 'verifier line must match CLI_LINE_REGEX shape: ' + line);
  assert.ok(line.startsWith(contract.VERIFIER_LINE_CLASS + ' '), 'verifier line must lead with M16-S09-REVIEW');
});

// ---------------------------------------------------------------------------
// (p,q) Builder buildModel
// ---------------------------------------------------------------------------
test('p1: buildModel with all 11 fixture sources returns a model that passes evaluateReviewContract', () => {
  const fx = makeFixtureRoot();
  try {
    const lr = loader.loadCanonicalReferences({ sourceRoot: fx.tmp });
    const model = builder.buildModel(lr, '2026-07-22T12:00:00.000Z');
    const m015Section = model.sections.m015_comparison;
    const div1Section = model.sections.div1_exact_communication;
    const evidenceRecordIds = model.worksheet.evidence_records.map((r) => r.evidence_id);
    const evalRes = contract.evaluateReviewContract({
      model,
      evidenceRecordIds,
      m015Comparison: {
        criterion_diff: m015Section.criterion_diff,
        capability_audit: m015Section.capability_audit,
        promotion_to_confirmed_count: m015Section.promotion_to_confirmed_count,
        evidence_driven_downgrade_count: m015Section.evidence_driven_downgrade_count,
      },
      div1Communication: {
        m015_record: div1Section.m015_record,
        m016_record: div1Section.m016_record,
        mapping_complete: div1Section.mapping_complete,
        historical_not_replaced: div1Section.historical_not_replaced,
      },
    });
    assert.equal(evalRes.ok, true);
    assert.equal(evalRes.verdict, contract.FROZEN_LAUNCH_POSTURE.launch);
    assert.equal(evalRes.exit_code, 0);
    assert.deepEqual(evalRes.blockers, []);
  } finally { cleanupRoot(fx.tmp); }
});

test('q1: buildModel with one source missing fails closed with N>=1 blockers', () => {
  const fx = makeOneMissingFixtureRoot(contract.REF.S08_CLOSURE);
  try {
    const lr = loader.loadCanonicalReferences({ sourceRoot: fx.tmp });
    const model = builder.buildModel(lr, '2026-07-22T12:00:00.000Z');
    const m015Section = model.sections.m015_comparison;
    const div1Section = model.sections.div1_exact_communication;
    const evalRes = contract.evaluateReviewContract({
      model,
      m015Comparison: {
        criterion_diff: m015Section.criterion_diff,
        capability_audit: m015Section.capability_audit,
      },
      div1Communication: {
        m015_record: div1Section.m015_record,
        m016_record: div1Section.m016_record,
      },
    });
    assert.equal(evalRes.ok, false);
    assert.ok(evalRes.blockers.length >= 1, 'must emit at least one blocker');
    const missingBlocker = evalRes.blockers.find((b) => b.code === contract.BLOCKER_CODES.SOURCE_MISSING(contract.REF.S08_CLOSURE));
    assert.ok(missingBlocker, 'must emit SOURCE_MISSING for the missing ref');
  } finally { cleanupRoot(fx.tmp); }
});

// ---------------------------------------------------------------------------
// (r) Markdown rendering
// ---------------------------------------------------------------------------
test('r1: renderReviewMarkdown emits 5 sections in canonical frozen order', () => {
  const fx = makeFixtureRoot();
  try {
    const lr = loader.loadCanonicalReferences({ sourceRoot: fx.tmp });
    const model = builder.buildModel(lr, '2026-07-22T12:00:00.000Z');
    const evalRes = contract.evaluateReviewContract({ model });
    const md = builder.renderReviewMarkdown(model, lr, evalRes);
    // Sections in frozen order
    const pos1 = md.indexOf('## 1. Sanitised Proof Summary');
    const pos2 = md.indexOf('## 2. Full Worksheet');
    const pos3 = md.indexOf('## 3. Div1 Exact Communication');
    const pos4 = md.indexOf('## 4. Launch Class Boundary');
    const pos5 = md.indexOf('## 5. M015 Comparison');
    assert.ok(pos1 > 0 && pos2 > pos1 && pos3 > pos2 && pos4 > pos3 && pos5 > pos4, '5 sections must appear in frozen order');
    // Provenance + embedded model at the tail
    assert.ok(md.indexOf('## Appendix B: Provenance') > pos5);
    assert.ok(md.indexOf('<!-- HUMAN_REVIEW_MODEL_V1') > 0);
    assert.ok(md.indexOf('HUMAN_REVIEW_MODEL_V1 -->') > 0);
    // 11 sources listed
    for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
      assert.ok(md.indexOf(ref) >= 0, 'must reference ' + ref);
    }
    // 8 hard gates appear
    for (const hg of contract.HARD_GATE_IDS) {
      assert.ok(md.indexOf(hg) >= 0, 'must reference hard gate ' + hg);
    }
    // 19 evidence records appear
    for (const id of contract.EVIDENCE_RECORD_IDS) {
      assert.ok(md.indexOf(id) >= 0, 'must reference evidence record ' + id);
    }
    // frozen launch posture appears
    assert.ok(md.indexOf('orchestration=' + contract.FROZEN_LAUNCH_POSTURE.orchestration) >= 0);
    assert.ok(md.indexOf('evidence=' + contract.FROZEN_LAUNCH_POSTURE.evidence) >= 0);
    assert.ok(md.indexOf('launch=' + contract.FROZEN_LAUNCH_POSTURE.launch) >= 0);
    assert.ok(md.indexOf('bounded_internal=' + contract.FROZEN_LAUNCH_POSTURE.bounded_internal) >= 0);
  } finally { cleanupRoot(fx.tmp); }
});

// ---------------------------------------------------------------------------
// (s) NOT_PROVEN sibling invariant
// ---------------------------------------------------------------------------
test('s1: NOT_PROVEN preservation rendered as Appendix A (sibling, not numbered review section)', () => {
  const fx = makeFixtureRoot();
  try {
    const lr = loader.loadCanonicalReferences({ sourceRoot: fx.tmp });
    const model = builder.buildModel(lr, '2026-07-22T12:00:00.000Z');
    const evalRes = contract.evaluateReviewContract({ model });
    const md = builder.renderReviewMarkdown(model, lr, evalRes);
    assert.ok(md.indexOf('## Appendix A: NOT_PROVEN Preservation') > 0, 'must include Appendix A');
    assert.ok(md.indexOf(contract.S08_CLOSURE_VERDICT) > 0, 'must reference S08 closure verdict');
    assert.ok(md.indexOf('NOT_PROVEN_MISSING_RESULT_JSON_BOS') > 0, 'must reference BOS grade contract proof state');
    // NOT a numbered section
    assert.ok(md.indexOf('## 6. NOT_PROVEN') < 0, 'must NOT have a sixth numbered review section');
  } finally { cleanupRoot(fx.tmp); }
});

// ---------------------------------------------------------------------------
// (t) Embedded model block
// ---------------------------------------------------------------------------
test('t1: renderEmbeddedModelBlock produces parseable JSON with frozen vocabulary', () => {
  const fx = makeFixtureRoot();
  try {
    const lr = loader.loadCanonicalReferences({ sourceRoot: fx.tmp });
    const model = builder.buildModel(lr, '2026-07-22T12:00:00.000Z');
    const evalRes = contract.evaluateReviewContract({ model });
    const md = builder.renderReviewMarkdown(model, lr, evalRes);
    // Extract embedded block
    const m = md.match(/<!--\s*HUMAN_REVIEW_MODEL_V1\s*\n([\s\S]+?)\n\s*HUMAN_REVIEW_MODEL_V1\s*-->/);
    assert.ok(m, 'must have embedded HUMAN_REVIEW_MODEL_V1 block');
    const parsed = JSON.parse(m[1]);
    assert.equal(parsed.schema_id, contract.SCHEMA_ID);
    assert.equal(parsed.schema_version, contract.SCHEMA_VERSION);
    assert.equal(parsed.milestone, contract.MILESTONE);
    assert.equal(parsed.slice, contract.SLICE);
    assert.equal(parsed.task, 'T02');
    assert.equal(parsed.section_count, 5);
    assert.equal(parsed.source_count, 11);
    assert.equal(parsed.evidence_record_count, 19);
    assert.equal(parsed.hard_gate_count, 8);
    assert.equal(parsed.verdict_row_count, 3);
    assert.equal(parsed.launch_posture.orchestration, 'PARTIAL');
    assert.equal(parsed.launch_posture.evidence, 'PARTIAL');
    assert.equal(parsed.launch_posture.launch, 'PREPARATION_ONLY');
    assert.equal(parsed.launch_posture.bounded_internal, true);
    assert.ok(/^[a-f0-9]{64}$/.test(parsed.byte_digest), 'embedded model must carry stable sha256 byte_digest');
    assert.ok(parsed.source_refs.length === 11);
    for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
      assert.notEqual(parsed.source_refs.indexOf(ref), -1, 'must include ref ' + ref);
    }
    assert.deepEqual(parsed.sections['sanitised_proof_summary'].m015_summary_text, 'M015 native seven-division mission recorded as bounded execution with NOT_PROVEN bos_grade_contract_proof.');
  } finally { cleanupRoot(fx.tmp); }
});

// ---------------------------------------------------------------------------
// (u) End-to-end atomic build
// ---------------------------------------------------------------------------
test('u1: end-to-end build writes the file, emits CLI line, and exit 0 on full READ', () => {
  const fx = makeFixtureRoot();
  const outDir = makeRootedTmp('e2e');
  const tmpOut = path.join(outDir, 'review.md');
  try {
    const res = spawnSync('node', [
      builder.SCRIPT_PATH,
      '--output', tmpOut,
      '--source-root', fx.tmp,
      '--reference-time', '2026-07-22T12:00:00.000Z',
      '--force',
    ], { encoding: 'utf8' });
    assert.equal(res.status, 0, 'must exit 0 with all 11 sources read; stderr=' + (res.stderr || '') + '; stdout=' + (res.stdout || ''));
    assert.match(res.stdout, /M16-S09-BUILD verdict=PREPARATION_ONLY exit=0/);
    assert.match(res.stdout, /section_count=5/);
    assert.match(res.stdout, /source_count=11/);
    assert.match(res.stdout, /block_count=0/);
    const out = fs.readFileSync(tmpOut, 'utf8');
    assert.ok(out.indexOf('## 1. Sanitised Proof Summary') > 0);
    assert.ok(out.indexOf('HUMAN_REVIEW_MODEL_V1 -->') > 0);
    const stat = fs.statSync(tmpOut);
    assert.ok(stat.size > 1000, 'file must be non-trivial');
  } finally { cleanupRoot(fx.tmp); cleanupRoot(outDir); }
});

test('u2: end-to-end build with one source missing: still writes file, exit 2, N blockers', () => {
  const fx = makeOneMissingFixtureRoot(contract.REF.S08_CLOSURE);
  const outDir = makeRootedTmp('e2e-miss');
  const tmpOut = path.join(outDir, 'review.md');
  try {
    const res = spawnSync('node', [
      builder.SCRIPT_PATH,
      '--output', tmpOut,
      '--source-root', fx.tmp,
      '--reference-time', '2026-07-22T12:00:00.000Z',
      '--force',
    ], { encoding: 'utf8' });
    assert.equal(res.status, 2, 'must exit 2 with missing source; stderr=' + (res.stderr || '') + '; stdout=' + (res.stdout || ''));
    assert.match(res.stdout, /M16-S09-BUILD verdict=FAIL_CLOSED/);
    assert.match(res.stdout, /exit=2/);
    assert.match(res.stdout, /block_count=[1-9][0-9]*/);
    // File STILL written
    assert.ok(fs.existsSync(tmpOut), 'file must be written even on fail-closed');
    const out = fs.readFileSync(tmpOut, 'utf8');
    assert.ok(out.indexOf('## 1. Sanitised Proof Summary') > 0, 'file must contain full review body even on fail-closed');
    assert.ok(out.indexOf('fail-closed') >= 0 || out.indexOf('FAIL_CLOSED') >= 0, 'file must signal fail-closed posture');
  } finally { cleanupRoot(fx.tmp); cleanupRoot(outDir); }
});

// ---------------------------------------------------------------------------
// (v) Determinism — same inputs → same byte output
// ---------------------------------------------------------------------------
test('v1: two consecutive runs against an unchanged fixture produce identical file bytes', () => {
  const fx = makeFixtureRoot();
  const outA = makeRootedTmp('det-a');
  const outB = makeRootedTmp('det-b');
  const tmpA = path.join(outA, 'review.md');
  const tmpB = path.join(outB, 'review.md');
  try {
    const common = ['--source-root', fx.tmp, '--reference-time', '2026-07-22T12:00:00.000Z', '--force'];
    const runA = spawnSync('node', [builder.SCRIPT_PATH, '--output', tmpA, ...common], { encoding: 'utf8' });
    const runB = spawnSync('node', [builder.SCRIPT_PATH, '--output', tmpB, ...common], { encoding: 'utf8' });
    assert.equal(runA.status, 0, 'A must exit 0: ' + runA.stderr);
    assert.equal(runB.status, 0, 'B must exit 0: ' + runB.stderr);
    const bytesA = fs.readFileSync(tmpA);
    const bytesB = fs.readFileSync(tmpB);
    assert.equal(bytesA.length, bytesB.length);
    assert.equal(crypto.createHash('sha256').update(bytesA).digest('hex'), crypto.createHash('sha256').update(bytesB).digest('hex'),
      'two runs must produce byte-identical output');
  } finally {
    cleanupRoot(fx.tmp);
    cleanupRoot(outA);
    cleanupRoot(outB);
  }
});

// ---------------------------------------------------------------------------
// (w) Pre/post mutation check on upstream sources
// ---------------------------------------------------------------------------
test('w1: end-to-end build does not mutate any of the 11 upstream sources', () => {
  const fx = makeFixtureRoot();
  const outDir = makeRootedTmp('mut');
  const tmpOut = path.join(outDir, 'review.md');
  try {
    const before = loader.loadCanonicalReferences({ sourceRoot: fx.tmp });
    const beforeSnap = loader.snapshotHashes(before);
    const run = spawnSync('node', [
      builder.SCRIPT_PATH,
      '--output', tmpOut,
      '--source-root', fx.tmp,
      '--reference-time', '2026-07-22T12:00:00.000Z',
      '--force',
    ], { encoding: 'utf8' });
    assert.equal(run.status, 0, 'build must succeed: ' + run.stderr);
    const after = loader.loadCanonicalReferences({ sourceRoot: fx.tmp });
    const afterSnap = loader.snapshotHashes(after);
    const drift = loader.diffSnapshots(beforeSnap, afterSnap);
    assert.equal(drift.drift_count, 0, 'must not mutate any source: drift=' + drift.drift_refs.join(','));
    assert.equal(drift.byte_total_unchanged, true);
  } finally { cleanupRoot(fx.tmp); cleanupRoot(outDir); }
});

// ---------------------------------------------------------------------------
// (x) Div1 communication maps two distinct kinds
// ---------------------------------------------------------------------------
test('x1: div1 communication maps the two distinct kinds and stays historical', () => {
  const fx = makeFixtureRoot();
  try {
    const lr = loader.loadCanonicalReferences({ sourceRoot: fx.tmp });
    const model = builder.buildModel(lr, '2026-07-22T12:00:00.000Z');
    const d = model.sections.div1_exact_communication;
    assert.equal(d.m015_record.evidence_kind, contract.DIV1_COMMUNICATION_KINDS.M015_DIAGNOSTIC);
    assert.equal(d.m016_record.evidence_kind, contract.DIV1_COMMUNICATION_KINDS.M016_S05_EXECUTED_READBACK);
    assert.equal(d.mapping_complete, true);
    assert.equal(d.historical_not_replaced, true);
    assert.notEqual(d.m015_record.evidence_kind, d.m016_record.evidence_kind, 'must be two distinct kinds');
    // 7 comparison fields in the order frozen by contract
    assert.equal(d.comparison_fields.length, 7);
  } finally { cleanupRoot(fx.tmp); }
});

// ---------------------------------------------------------------------------
// (y) Builder does not import any verifier module (T03 independence invariant)
// ---------------------------------------------------------------------------
test('y1: builder module source does not import a verifier file', () => {
  const src = fs.readFileSync(builder.SCRIPT_PATH, 'utf8');
  assert.ok(!/require\(\s*['"]\.\/verify_m016_s09_human_review/.test(src), 'builder must not import the verifier script');
  // Allow internal cross-check but never a hidden import of an independent verifier file.
  assert.ok(!/require\(\s*['"]\.\/m016-s09-human-review-verifier/.test(src));
});

// ---------------------------------------------------------------------------
// (z) Real-project build emits the documented CLI signature
// ---------------------------------------------------------------------------
test('z1: real-project build (against actual runtime-evidence/, T05-restored S08 closure on disk) emits a builder CLI line with the documented fields', () => {
  const outDir = makeRootedTmp('real');
  const tmpOut = path.join(outDir, 'review.md');
  try {
    const res = spawnSync('node', [
      builder.SCRIPT_PATH,
      '--output', tmpOut,
      '--force',
    ], { encoding: 'utf8' });
    const cliLine = (res.stdout || '').split(/\r?\n/).filter(Boolean)[0] || '';
    assert.ok(cliLine.length > 0, 'stdout must include at least one CLI line');
    assert.ok(cliLine.startsWith(contract.BUILDER_LINE_CLASS + ' '), 'CLI line must lead with M16-S09-BUILD (canonical builder signature): ' + cliLine);
    assert.match(cliLine, /section_count=5/);
    assert.match(cliLine, /source_count=11/);
    // Output path is reported relative to ROOT, so it always starts with `.gsd/`.
    assert.match(cliLine, /output_path=\.gsd\//);
    assert.match(cliLine, /output_sha256=[a-f0-9]{64}/);
    // Real project (post-T05): S08 closure source has been restored under
    // runtime-evidence/M016-S08-native-seven-agent-closure.json, so all 11
    // allowlisted sources are present, the contract evaluates cleanly, and
    // the builder exits 0 with verdict=PREPARATION_ONLY.
    assert.equal(res.status, 0, 'builder must exit 0 when all 11 allowlisted sources are readable; got status=' + res.status + ' stderr=' + (res.stderr || '').slice(0, 240));
    assert.match(cliLine, /verdict=PREPARATION_ONLY/);
    assert.match(cliLine, /exit=0/);
    assert.match(cliLine, /block_count=0/);
  } finally { cleanupRoot(outDir); }
});

test('z2: contract.CLI_LINE_REGEX parses a verifier-prefixed line correctly', () => {
  // Defensive sanity: the contract regex owns REVIEW-prefixed lines;
  // the builder emits BUILD-prefixed lines. Both share the structural
  // vocabulary, but only REVIEW-prefixed lines are bound by the regex.
  const line = contract.buildCliHealthLine({
    verdict: 'PREPARATION_ONLY',
    exitCode: 0,
    blockCount: 0,
    outputPath: '.gsd/x.md',
    outputSha256: 'a'.repeat(64),
  });
  assert.ok(contract.CLI_LINE_REGEX.test(line), 'contract.buildCliHealthLine must match contract.CLI_LINE_REGEX (REVIEW prefix)');
});

// Surface area sanity — freeze every public name we ship.
test('zz: builder module exports documented public surface', () => {
  for (const name of ['parseArgs', 'printHelp', 'ensureInsideRoot', 'atomicWriteText', 'buildModel', 'renderReviewMarkdown', 'renderEmbeddedModelBlock', 'renderSection1SanitisedProofSummary', 'renderSection2FullWorksheet', 'renderSection3Div1Communication', 'renderSection4LaunchClassBoundary', 'renderSection5M015Comparison', 'renderNotProvenPreservation', 'renderProvenanceAppendix', 'renderReviewHeader', 'buildBuilderCliLine', 'failureSummary', 'run', 'ROOT', 'SCRIPT_PATH', 'OUTPUT_PATH_DEFAULT']) {
    assert.ok(typeof builder[name] !== 'undefined', 'builder must export ' + name);
  }
});
