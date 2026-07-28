#!/usr/bin/env node
'use strict';

/**
 * scripts/test_m016_s10_acceptance_verifier.js
 *
 * M016-txa3vu / S10 / T03 — node:test scenarios for the independent
 * acceptance contract verifier.
 *
 * Coverage:
 *   v01  parseArgs — happy path
 *   v02  parseArgs — missing --input
 *   v03  parseArgs — unknown token rejected
 *   v04  parseArgs — --help short-circuit
 *   v05  parseArgs — --source-root captured
 *   v06  resolveUnderRoot — happy path
 *   v07  resolveUnderRoot — absolute path refused
 *   v08  resolveUnderRoot — .. traversal refused
 *   v09  resolveUnderRoot — empty path refused
 *   v10  resolveUnderRoot — NUL byte refused
 *   v11  parseSidecar — happy path
 *   v12  parseSidecar — malformed JSON → HEALTHLINE_MISMATCH
 *   v13  parseSidecar — array top-level → HEALTHLINE_MISMATCH
 *   v14  parseSidecar — primitive top-level → HEALTHLINE_MISMATCH
 *   v15  assertAcceptanceContractShape — happy
 *   v16  assertAcceptanceContractShape — schema_id drift
 *   v17  assertAcceptanceContractShape — slice mismatch
 *   v18  assertAcceptanceContractShape — sections count mismatch
 *   v19  assertAcceptanceContractShape — source_hashes missing
 *   v20  scanRawSecrets — clean JSON → no hits
 *   v21  scanRawSecrets — bearer token → 1 hit
 *   v22  scanRawSecrets — PEM private key → 1 hit
 *   v23  scanRawSecrets — AWS access key → 1 hit
 *   v24  scanRawSecrets — slack token → 1 hit
 *   v25  scanRawSecrets — password assignment → 1 hit
 *   v26  scanRawSecrets — github token → 1 hit
 *   v27  scanRawSecrets — multiple patterns → multiple hits
 *   v28  rederiveHashBlockers — happy path → 0 blockers
 *   v29  rederiveHashBlockers — missing source → SOURCE_MISSING
 *   v30  rederiveHashBlockers — hash drift → SOURCE_HASH_DRIFT
 *   v31  rederiveHashBlockers — non-sha256 → SOURCE_HASH_DRIFT
 *   v32  rederiveHashBlockers — non-allowlisted ref → SOURCE_NOT_ALLOWLISTED
 *   v33  rederiveHashBlockers — missing allowlisted ref → SOURCE_MISSING
 *   v34  classifyExit — no blockers → PASS
 *   v35  classifyExit — redaction → REDACTION_LEAK
 *   v36  classifyExit — hash drift → SOURCE_HASH_DRIFT
 *   v37  classifyExit — identity drift → IDENTITY_DRIFT
 *   v38  classifyExit — closure drift → CLOSURE_KIND_DRIFT
 *   v39  classifyExit — section/verdict → REJECTED_FAIL_CLOSED
 *   v40  classifyExit — path traversal → REJECTED_FAIL_CLOSED
 *   v41  buildVerifierCliLine — happy path shape (ACCEPTANCE_RESOLVED)
 *   v42  buildVerifierCliLine — failure path includes FAIL_CLOSED
 *   v43  module surface frozen
 *   v44  independence — verifier imports list is exactly the 5 allowed
 *   v45  independence — verifier never imports producer CLI module
 *   v46  positive end-to-end run() — happy fixture sidecar passes (subprocess)
 *   v47  negative end-to-end run() — hash drift in fixture → fail-closed (subprocess)
 *
 * Run: node --test scripts/test_m016_s10_acceptance_verifier.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const contract = require('./lib/m016-s10-acceptance-contract.js');
const verifier = require('./verify_m016_s10_acceptance_contract.js');

// ---------------------------------------------------------------------------
// Fixture helpers — keep all tmp dirs INSIDE the project root so the
// verifier's lexical containment (resolveUnderRoot → ROOT) accepts them.
// Using os.tmpdir() (i.e. /tmp) would make the verifier correctly reject
// the path with PATH_TRAVERSAL — which is good security, but useless for
// unit tests that need the path to resolve.
// ---------------------------------------------------------------------------
const ROOT = path.resolve(__dirname, '..');
const TEST_TMP_ROOT = path.join(ROOT, '.tmp-test');

function makeFixtureRoot() {
  fs.mkdirSync(TEST_TMP_ROOT, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(TEST_TMP_ROOT, 'm016-s10-t03-verifier-'));
  const realTmp = fs.realpathSync(tmp);
  fs.mkdirSync(path.join(realTmp, 'runtime-evidence'), { recursive: true });
  const blobs = {};
  const hashes = {};
  for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
    let payload;
    if (ref === '.gsd/REQUIREMENTS.md' || ref === '.gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/16-ROADMAP.md' || ref === 'runtime-evidence/M016-S09-HUMAN-REVIEW.md') {
      payload = '# fixture ' + ref + '\nfixture_kind=s10-t03-verifier\n';
    } else {
      payload = { source_ref: ref, fixture_kind: 's10-t03-verifier', captured_at: contract.ACCEPTANCE_CONTRACT_REFERENCE_TIME };
    }
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const abs = path.join(realTmp, ref);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, Buffer.from(body, 'utf8'));
    blobs[ref] = body;
    hashes[ref] = crypto.createHash('sha256').update(Buffer.from(body, 'utf8')).digest('hex');
  }
  return { tmp: realTmp, blobs, hashes };
}

function rmFixtureRoot(fx) {
  try { fs.rmSync(fx.tmp, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

function rmTestTmpRoot() {
  try { fs.rmSync(TEST_TMP_ROOT, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

// Clean any stale .tmp-test/ tree at module load (idempotent).
rmTestTmpRoot();
fs.mkdirSync(TEST_TMP_ROOT, { recursive: true });

// Build a valid acceptance sidecar model using the frozen contract builder.
function buildValidSidecar(hashes, opts = {}) {
  const sourceHashes = Object.assign({}, hashes);
  if (opts.missingRef) delete sourceHashes[opts.missingRef];
  if (opts.driftRef) sourceHashes[opts.driftRef] = 'f'.repeat(64);
  if (opts.badFormatRef) sourceHashes[opts.badFormatRef] = 'not-a-sha256';
  if (opts.extraRef) sourceHashes[opts.extraRef] = 'a'.repeat(64);
  // Use the frozen contract builder for shape consistency.
  const model = contract.buildAcceptanceModel({});
  // Stamp the input-path fields the sidecar ships with.
  model.task = 'T02';
  model.builder_line_class = contract.BUILDER_LINE_CLASS;
  model.canonical_protocol = contract.BUILDER_CANONICAL_PROTOCOL;
  model.output_path = 'runtime-evidence/M016-S10-seven-division-acceptance-contract.json';
  model.source_hashes = Object.freeze(Object.assign({}, sourceHashes));
  // Recompute the canonical digest so the verifier's independent
  // recomputation matches.
  model.acceptance_contract_digest = contract.computeAcceptanceDigest(model);
  return Object.freeze(model);
}

function renderSidecar(model) {
  return JSON.stringify(model, null, 2) + '\n';
}

function writeSidecar(fx, model, opts = {}) {
  const rel = '.tmp-s10-t03-' + Math.random().toString(36).slice(2, 8) + '/sidecar.json';
  const abs = path.join(fx.tmp, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const text = renderSidecar(model);
  fs.writeFileSync(abs, text, 'utf8');
  return { fx, rel, abs, md: text };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// v01
test('v01 parseArgs — happy path', () => {
  const args = verifier.parseArgs(['--input', 'runtime-evidence/foo.json']);
  assert.equal(args.input, 'runtime-evidence/foo.json');
  assert.equal(args.sourceRoot, null);
  assert.equal(args.help, false);
});

// v02
test('v02 parseArgs — missing --input', () => {
  assert.throws(() => verifier.parseArgs([]), /--input is required/);
});

// v03
test('v03 parseArgs — unknown token rejected', () => {
  assert.throws(() => verifier.parseArgs(['--bogus']), /unknown argv token/);
});

// v04
test('v04 parseArgs — --help short-circuit', () => {
  const args = verifier.parseArgs(['--help']);
  assert.equal(args.help, true);
  // When help is true, missing --input must NOT throw.
});

// v05
test('v05 parseArgs — --source-root captured', () => {
  const args = verifier.parseArgs(['--input', 'foo.json', '--source-root', '/tmp/root']);
  assert.equal(args.sourceRoot, '/tmp/root');
});

// v06
test('v06 resolveUnderRoot — happy path', () => {
  const fx = makeFixtureRoot();
  try {
    const out = verifier.resolveUnderRoot('.tmp-test/some-file.json', fx.tmp);
    assert.equal(out.exists, false);
    assert.equal(typeof out.absolute, 'string');
  } finally { rmFixtureRoot(fx); }
});

// v07
test('v07 resolveUnderRoot — absolute path refused', () => {
  assert.throws(() => verifier.resolveUnderRoot('/etc/passwd', null), /absolute path not permitted/);
});

// v08
test('v08 resolveUnderRoot — .. traversal refused', () => {
  assert.throws(() => verifier.resolveUnderRoot('../escape.json', null), /escapes root|absolute path not permitted/);
});

// v09
test('v09 resolveUnderRoot — empty path refused', () => {
  assert.throws(() => verifier.resolveUnderRoot('', null), /path empty/);
});

// v10
test('v10 resolveUnderRoot — NUL byte refused', () => {
  assert.throws(() => verifier.resolveUnderRoot('foo\0bad.json', null), /NUL/);
});

// v11
test('v11 parseSidecar — happy path', () => {
  const parsed = verifier.parseSidecar('{"a":1}');
  assert.equal(parsed.a, 1);
});

// v12
test('v12 parseSidecar — malformed JSON → HEALTHLINE_MISMATCH', () => {
  try {
    verifier.parseSidecar('{ bad json');
    assert.fail('should throw');
  } catch (e) {
    assert.match(String(e.code), /^M16-S10-ACCEPTANCE-HEALTHLINE-MISMATCH:/);
  }
});

// v13
test('v13 parseSidecar — array top-level → HEALTHLINE_MISMATCH', () => {
  try {
    verifier.parseSidecar('[]');
    assert.fail('should throw');
  } catch (e) {
    assert.match(String(e.code), /^M16-S10-ACCEPTANCE-HEALTHLINE-MISMATCH:/);
  }
});

// v14
test('v14 parseSidecar — primitive top-level → HEALTHLINE_MISMATCH', () => {
  try {
    verifier.parseSidecar('42');
    assert.fail('should throw');
  } catch (e) {
    assert.match(String(e.code), /^M16-S10-ACCEPTANCE-HEALTHLINE-MISMATCH:/);
  }
});

// v15
test('v15 assertAcceptanceContractShape — happy', () => {
  const fx = makeFixtureRoot();
  try {
    const model = buildValidSidecar(fx.hashes);
    const blockers = verifier.assertAcceptanceContractShape(model);
    assert.equal(blockers.length, 0);
  } finally { rmFixtureRoot(fx); }
});

// v16
test('v16 assertAcceptanceContractShape — schema_id drift', () => {
  const fx = makeFixtureRoot();
  try {
    const model = buildValidSidecar(fx.hashes);
    // Replace schema_id with a non-frozen value.
    const cloned = JSON.parse(JSON.stringify(model));
    cloned.schema_id = 'https://attacker.local/schemas/foo.json';
    const blockers = verifier.assertAcceptanceContractShape(cloned);
    assert.ok(blockers.length > 0);
    assert.ok(blockers.some((b) => b.code.indexOf('HEALTHLINE-MISMATCH') >= 0));
  } finally { rmFixtureRoot(fx); }
});

// v17
test('v17 assertAcceptanceContractShape — slice mismatch', () => {
  const fx = makeFixtureRoot();
  try {
    const model = buildValidSidecar(fx.hashes);
    const cloned = JSON.parse(JSON.stringify(model));
    cloned.slice = 'S07';
    const blockers = verifier.assertAcceptanceContractShape(cloned);
    assert.ok(blockers.some((b) => b.code.indexOf('slice-mismatch') >= 0));
  } finally { rmFixtureRoot(fx); }
});

// v18
test('v18 assertAcceptanceContractShape — sections count mismatch', () => {
  const fx = makeFixtureRoot();
  try {
    const model = buildValidSidecar(fx.hashes);
    const cloned = JSON.parse(JSON.stringify(model));
    cloned.sections = cloned.sections.slice(0, 5);
    cloned.section_count = 5;
    cloned.section_ids = cloned.section_ids.slice(0, 5);
    const blockers = verifier.assertAcceptanceContractShape(cloned);
    assert.ok(blockers.length > 0);
    assert.ok(blockers.some((b) => b.code.indexOf('SECTION-MISSING') >= 0));
  } finally { rmFixtureRoot(fx); }
});

// v19
test('v19 assertAcceptanceContractShape — source_hashes missing', () => {
  const fx = makeFixtureRoot();
  try {
    const model = buildValidSidecar(fx.hashes);
    const cloned = JSON.parse(JSON.stringify(model));
    delete cloned.source_hashes;
    const blockers = verifier.assertAcceptanceContractShape(cloned);
    assert.ok(blockers.some((b) => b.code.indexOf('SOURCE-HASH-DRIFT') >= 0));
  } finally { rmFixtureRoot(fx); }
});

// v20
test('v20 scanRawSecrets — clean JSON → no hits', () => {
  const fx = makeFixtureRoot();
  try {
    const model = buildValidSidecar(fx.hashes);
    const json = renderSidecar(model);
    assert.equal(verifier.scanRawSecrets(json).length, 0);
  } finally { rmFixtureRoot(fx); }
});

// v21
test('v21 scanRawSecrets — bearer token → 1 hit', () => {
  const json = '{"note":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def-ghi"}';
  const hits = verifier.scanRawSecrets(json);
  assert.ok(hits.find((h) => h.kind === 'bearer-token'));
});

// v22
test('v22 scanRawSecrets — PEM private key → 1 hit', () => {
  const json = '{"key":"-----BEGIN RSA PRIVATE KEY-----\\nMIIE\\n-----END RSA PRIVATE KEY-----"}';
  const hits = verifier.scanRawSecrets(json);
  assert.ok(hits.find((h) => h.kind === 'private-key-pem'));
});

// v23
test('v23 scanRawSecrets — AWS access key → 1 hit', () => {
  const json = '{"aws":"AKIAIOSFODNN7EXAMPLE"}';
  const hits = verifier.scanRawSecrets(json);
  assert.ok(hits.find((h) => h.kind === 'aws-access-key'));
});

// v24
test('v24 scanRawSecrets — slack token → 1 hit', () => {
  const json = '{"slack":"xoxb-1234567890-abcdefghij"}';
  const hits = verifier.scanRawSecrets(json);
  assert.ok(hits.find((h) => h.kind === 'slack-token'));
});

// v25
test('v25 scanRawSecrets — password assignment → 1 hit', () => {
  const json = '{"cfg":"password=SuperSecret123"}';
  const hits = verifier.scanRawSecrets(json);
  assert.ok(hits.find((h) => h.kind === 'password-assignment'));
});

// v26
test('v26 scanRawSecrets — github token → 1 hit', () => {
  const json = '{"tok":"ghp_abcdefghijklmnopqrstuvwxyz0123456789"}';
  const hits = verifier.scanRawSecrets(json);
  assert.ok(hits.find((h) => h.kind === 'github-token'));
});

// v27
test('v27 scanRawSecrets — multiple patterns → multiple hits', () => {
  const json = '{"a":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def-ghi","b":"AKIAIOSFODNN7EXAMPLE"}';
  const hits = verifier.scanRawSecrets(json);
  assert.ok(hits.length >= 2);
  assert.ok(hits.find((h) => h.kind === 'bearer-token'));
  assert.ok(hits.find((h) => h.kind === 'aws-access-key'));
});

// v28
test('v28 rederiveHashBlockers — happy path → 0 blockers', () => {
  const fx = makeFixtureRoot();
  try {
    const model = buildValidSidecar(fx.hashes);
    const out = verifier.rederiveHashBlockers(model, fx.tmp);
    assert.equal(out.blockers.length, 0);
    // The loader result is also returned for diagnostics.
    assert.ok(out.loaderResult);
    assert.equal(out.loaderResult.summary.expected_count, 15);
  } finally { rmFixtureRoot(fx); }
});

// v29
test('v29 rederiveHashBlockers — missing source → SOURCE_MISSING', () => {
  const fx = makeFixtureRoot();
  try {
    const model = buildValidSidecar(fx.hashes, { missingRef: contract.REF.S08_CLOSURE });
    const out = verifier.rederiveHashBlockers(model, fx.tmp);
    const codes = out.blockers.map((b) => b.code);
    assert.ok(codes.some((c) => c.indexOf('SOURCE-MISSING') >= 0));
  } finally { rmFixtureRoot(fx); }
});

// v30
test('v30 rederiveHashBlockers — hash drift → SOURCE_HASH_DRIFT', () => {
  const fx = makeFixtureRoot();
  try {
    const model = buildValidSidecar(fx.hashes, { driftRef: contract.REF.S08_CLOSURE });
    const out = verifier.rederiveHashBlockers(model, fx.tmp);
    const codes = out.blockers.map((b) => b.code);
    assert.ok(codes.some((c) => c.indexOf('SOURCE-HASH-DRIFT') >= 0));
  } finally { rmFixtureRoot(fx); }
});

// v31
test('v31 rederiveHashBlockers — non-sha256 → SOURCE_HASH_DRIFT', () => {
  const fx = makeFixtureRoot();
  try {
    const model = buildValidSidecar(fx.hashes, { badFormatRef: contract.REF.S08_CLOSURE });
    const out = verifier.rederiveHashBlockers(model, fx.tmp);
    const codes = out.blockers.map((b) => b.code);
    assert.ok(codes.some((c) => c.indexOf('SOURCE-HASH-DRIFT') >= 0));
  } finally { rmFixtureRoot(fx); }
});

// v32
test('v32 rederiveHashBlockers — non-allowlisted ref → SOURCE_NOT_ALLOWLISTED', () => {
  const fx = makeFixtureRoot();
  try {
    const extraRef = 'runtime-evidence/M016-S07-fake-sidecar.json';
    const model = buildValidSidecar(fx.hashes, { extraRef });
    const out = verifier.rederiveHashBlockers(model, fx.tmp);
    const codes = out.blockers.map((b) => b.code);
    assert.ok(codes.some((c) => c.indexOf('SOURCE-NOT-ALLOWLISTED') >= 0 && c.indexOf('S07-fake-sidecar.json') >= 0));
  } finally { rmFixtureRoot(fx); }
});

// v33
test('v33 rederiveHashBlockers — missing allowlisted ref → SOURCE_MISSING', () => {
  const fx = makeFixtureRoot();
  try {
    // Wipe the source file from disk so the loader returns a missing entry
    // AND strip the hash from the sidecar's source_hashes map.
    const target = contract.REF.M015_BASELINE;
    const abs = path.join(fx.tmp, target);
    fs.unlinkSync(abs);
    const model = buildValidSidecar(fx.hashes, { missingRef: target });
    const out = verifier.rederiveHashBlockers(model, fx.tmp);
    const codes = out.blockers.map((b) => b.code);
    assert.ok(codes.some((c) => c.indexOf('SOURCE-MISSING') >= 0 && c.indexOf('M015-native-seven-division-mission') >= 0));
  } finally { rmFixtureRoot(fx); }
});

// v34
test('v34 classifyExit — no blockers → PASS', () => {
  const c = verifier.classifyExit([], []);
  assert.equal(c.exitCode, contract.EXIT_CODES.PASS);
  assert.equal(c.verdict, contract.VERDICT_VALUES.ACCEPTANCE_RESOLVED);
});

// v35
test('v35 classifyExit — redaction → REDACTION_LEAK', () => {
  const c = verifier.classifyExit(
    [{ code: contract.BLOCKER_CODES.REDACTION_LEAK('test:1') }],
    [{ kind: 'bearer-token', count: 1 }],
  );
  assert.equal(c.exitCode, contract.EXIT_CODES.REDACTION_LEAK);
  assert.equal(c.verdict, 'REDACTION_LEAK');
});

// v36
test('v36 classifyExit — hash drift → SOURCE_HASH_DRIFT', () => {
  const c = verifier.classifyExit(
    [{ code: contract.BLOCKER_CODES.SOURCE_HASH_DRIFT(contract.REF.S08_CLOSURE) }],
    [],
  );
  assert.equal(c.exitCode, contract.EXIT_CODES.SOURCE_HASH_DRIFT);
  assert.equal(c.verdict, 'SOURCE_HASH_DRIFT');
});

// v37
test('v37 classifyExit — identity drift → IDENTITY_DRIFT', () => {
  const c = verifier.classifyExit(
    [{ code: contract.BLOCKER_CODES.SOURCE_NOT_ALLOWLISTED('runtime-evidence/foo.json') }],
    [],
  );
  assert.equal(c.exitCode, contract.EXIT_CODES.IDENTITY_DRIFT);
  assert.equal(c.verdict, 'IDENTITY_DRIFT');
});

// v38
test('v38 classifyExit — closure drift → CLOSURE_KIND_DRIFT', () => {
  const c = verifier.classifyExit(
    [{ code: contract.BLOCKER_CODES.S08_PROMOTION_ATTEMPT('closure_kind-promotion') }],
    [],
  );
  assert.equal(c.exitCode, contract.EXIT_CODES.CLOSURE_KIND_DRIFT);
  assert.equal(c.verdict, 'CLOSURE_KIND_DRIFT');
});

// v39
test('v39 classifyExit — section/verdict → REJECTED_FAIL_CLOSED', () => {
  const c = verifier.classifyExit(
    [{ code: contract.BLOCKER_CODES.SECTION_MISSING('count-5') }],
    [],
  );
  assert.equal(c.exitCode, contract.EXIT_CODES.REJECTED_FAIL_CLOSED);
  assert.equal(c.verdict, 'REJECTED_FAIL_CLOSED');
});

// v40
test('v40 classifyExit — path traversal → REJECTED_FAIL_CLOSED', () => {
  const c = verifier.classifyExit(
    [{ code: contract.BLOCKER_CODES.PATH_TRAVERSAL('escape:foo') }],
    [],
  );
  assert.equal(c.exitCode, contract.EXIT_CODES.REJECTED_FAIL_CLOSED);
  assert.equal(c.verdict, 'REJECTED_FAIL_CLOSED');
});

// v41
test('v41 buildVerifierCliLine — happy path shape (ACCEPTANCE_RESOLVED)', () => {
  const classification = { verdict: contract.VERDICT_VALUES.ACCEPTANCE_RESOLVED, exitCode: 0 };
  const line = verifier.buildVerifierCliLine(classification, 0, 'runtime-evidence/foo.json', 'a'.repeat(64), 'b'.repeat(64));
  assert.match(line, /^M16-S10-ACCEPTANCE verdict=ACCEPTANCE_RESOLVED exit=0 block_count=0 criterion_count=6 not_proven_count=9 source_count=15 section_count=6 digest=[a-f0-9]{64} input_path=runtime-evidence\/foo\.json input_sha256=[a-f0-9]{64}$/);
});

// v42
test('v42 buildVerifierCliLine — failure path exposes the specific failure class', () => {
  const classification = { verdict: 'CLOSURE_KIND_DRIFT', exitCode: 8 };
  const line = verifier.buildVerifierCliLine(classification, 3, 'runtime-evidence/foo.json', 'a'.repeat(64), 'b'.repeat(64));
  assert.match(line, /verdict=CLOSURE_KIND_DRIFT/);
  assert.match(line, /exit=8/);
  assert.match(line, /block_count=3/);
});

// v43
test('v43 module surface frozen + exports', () => {
  assert.ok(Object.isFrozen(verifier));
  for (const fn of ['parseArgs', 'resolveUnderRoot', 'parseSidecar', 'assertAcceptanceContractShape', 'rederiveHashBlockers', 'scanRawSecrets', 'classifyExit', 'buildVerifierCliLine', 'failureStderrSummary', 'run']) {
    assert.equal(typeof verifier[fn], 'function', `${fn} must be a function`);
  }
  for (const field of ['VERIFIER_IMPORTS', 'PRODUCER_CLI_PATH', 'RAW_SECRET_PATTERNS', 'REFERENCE_TIME', 'ROOT', 'RUN_TAG']) {
    assert.ok(verifier[field] !== undefined, `${field} must be exported`);
  }
});

// v44
test('v44 independence — verifier imports list is exactly the 5 allowed', () => {
  assert.equal(verifier.VERIFIER_IMPORTS.length, 5);
  assert.ok(verifier.VERIFIER_IMPORTS.indexOf('node:fs') >= 0);
  assert.ok(verifier.VERIFIER_IMPORTS.indexOf('node:path') >= 0);
  assert.ok(verifier.VERIFIER_IMPORTS.indexOf('node:crypto') >= 0);
  assert.ok(verifier.VERIFIER_IMPORTS.some((m) => m.indexOf('m016-s10-acceptance-contract') >= 0));
  assert.ok(verifier.VERIFIER_IMPORTS.some((m) => m.indexOf('m016-s10-canonical-reference-loader') >= 0));
});

// v45
test('v45 independence — verifier never imports producer CLI module', () => {
  const cli = verifier.PRODUCER_CLI_PATH;
  assert.equal(typeof cli, 'string');
  assert.ok(cli.indexOf('build_m016_s10_acceptance_contract') >= 0);
  const src = fs.readFileSync(path.resolve(__dirname, 'verify_m016_s10_acceptance_contract.js'), 'utf8');
  assert.ok(!/require\(['"]\.\/build_m016_s10_acceptance_contract/.test(src), 'verifier must not require producer CLI');
  // Also: verifier must not require any other verifier.
  assert.ok(!/require\(['"]\.\/verify_m016_s10_acceptance_contract/.test(src), 'verifier must not self-require');
  // And no other build_*.js scripts either.
  assert.ok(!/require\(['"]\.\/build_m016/.test(src), 'verifier must not require any build_* CLI');
});

// v46
test('v46 positive end-to-end run() — happy fixture sidecar passes (subprocess)', () => {
  const fx = makeFixtureRoot();
  try {
    const model = buildValidSidecar(fx.hashes);
    const written = writeSidecar(fx, model);
    const out = spawnSync('node', [
      path.resolve(__dirname, 'verify_m016_s10_acceptance_contract.js'),
      '--input', path.relative(fx.tmp, written.abs),
      '--source-root', fx.tmp,
    ], { encoding: 'utf8' });
    assert.equal(out.status, 0, 'expected exit 0; stderr=' + out.stderr + ' stdout=' + out.stdout);
    assert.ok(/^M16-S10-ACCEPTANCE\s+/.test(out.stdout), 'expected ACCEPTANCE health line; got=' + out.stdout);
    assert.ok(out.stdout.indexOf('verdict=ACCEPTANCE_RESOLVED') >= 0);
    assert.ok(out.stdout.indexOf('exit=0') >= 0);
    assert.ok(out.stdout.indexOf('block_count=0') >= 0);
    assert.ok(out.stdout.indexOf('criterion_count=6') >= 0);
    assert.ok(out.stdout.indexOf('not_proven_count=9') >= 0);
    assert.ok(out.stdout.indexOf('source_count=15') >= 0);
    assert.ok(out.stdout.indexOf('section_count=6') >= 0);
    assert.ok(/digest=[a-f0-9]{64}/.test(out.stdout));
    assert.ok(/input_path=\.tmp-s10-t03-[a-z0-9]{6}\/sidecar\.json/.test(out.stdout));
    assert.ok(/input_sha256=[a-f0-9]{64}/.test(out.stdout));
  } finally { rmFixtureRoot(fx); }
});

// v47
test('v47 negative end-to-end run() — hash drift in fixture → fail-closed (subprocess)', () => {
  const fx = makeFixtureRoot();
  try {
    const model = buildValidSidecar(fx.hashes, { driftRef: contract.REF.S08_CLOSURE });
    const written = writeSidecar(fx, model);
    const out = spawnSync('node', [
      path.resolve(__dirname, 'verify_m016_s10_acceptance_contract.js'),
      '--input', path.relative(fx.tmp, written.abs),
      '--source-root', fx.tmp,
    ], { encoding: 'utf8' });
    assert.equal(out.status, contract.EXIT_CODES.SOURCE_HASH_DRIFT, 'expected exit 4; stderr=' + out.stderr + ' stdout=' + out.stdout);
    assert.ok(/verdict=SOURCE_HASH_DRIFT/.test(out.stdout));
    assert.ok(/block_count=[1-9]\d*/.test(out.stdout));
    assert.ok(/M16-S10-ACCEPTANCE-SOURCE-HASH-DRIFT:/.test(out.stderr));
  } finally { rmFixtureRoot(fx); }
});

// Cleanup on exit (best-effort; .tmp-test/ is gitignored-equivalent and
// will be wiped by future test runs anyway).
test('zz cleanup', () => {
  rmTestTmpRoot();
});
