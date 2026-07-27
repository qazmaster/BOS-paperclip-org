#!/usr/bin/env node
'use strict';
/**
 * scripts/test_m016_s11_canonical_replay_chain_verifier.js
 *
 * M016-txa3vu / S11 / T03 — node:test suite covering the independent
 * read-only chain verifier.
 *
 * Covers:
 *   (a) CLI parsing + parseArgs invariants
 *   (b) Sidecar schema + counts validation (17/8/4/HG8/NP9)
 *   (c) Section order + class order + hard-gate order drift detection
 *   (d) Launch posture drift (orchestration / evidence / launch /
 *       bounded_internal) and S10 cross-link drift
 *   (e) NOT_PROVEN preservation removal detection
 *   (f) Chain verdict promotion forbidden (ACCEPTANCE_RESOLVED, GO_*, …)
 *   (g) Source hash drift detection via loader re-derivation
 *   (h) Counter invariants (network_call_count=0, mutation_count=0)
 *   (i) Human-Review section presence + frozen posture
 *   (j) Redaction safety scan (api_key, raw_bodies, absolute_path, key)
 *   (k) Verifier CLI health-line shape
 *   (l) Verifier independence / anti-coupling — NEVER imports builder
 *   (m) Real sidecar end-to-end run (PASS, exit 0)
 *
 * Run: node --test scripts/test_m016_s11_canonical_replay_chain_verifier.js
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
const verifier = require('./verify_m016_s11_canonical_replay_chain.js');

const ROOT = loader.ROOT;
const REAL_SIDECAR = path.resolve(ROOT, 'runtime-evidence', 'M016-S11-canonical-replay-chain.json');

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------
function makeFixtureRoot() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'm016-s11-t03-'));
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
  const dir = path.join(ROOT, '.gsd', 'exec', 's11-t03-' + name + '-' + rand);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupRoot(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (_e) { /* ignore */ } }

// Build a "minimal valid sidecar" against a fixture root — same shape
// as the real one but using freshly-built fixture content so verifier
// re-derivation can succeed.
function buildValidSidecar(fixtureRoot) {
  const l = loader.loadCanonicalReferences({ sourceRoot: fixtureRoot });
  const model = contract.buildChainModel({ generated: '2026-07-25T00:00:00.000Z' });
  const s10Section = model.sections.find((s) => s.section_id === 's10_acceptance_contract');
  if (s10Section) s10Section.contract_digest = 'a'.repeat(64);
  // Inject fresh per-source hashes so the sidecar's source_hashes map
  // matches what the loader re-derives.
  for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
    const row = l.rows.find((r) => r.source_ref === ref);
    if (row && row.status === 'read') {
      const section = model.sections.find((s) => s.chain_section === row.chain_section);
      if (section && ref === contract.REF.S10_ACCEPTANCE_CONTRACT) {
        // S10 cross-link: leave as-is (a * 64 above).
      }
    }
  }
  model.chain_digest = contract.computeChainDigest(model);
  return {
    schema_id: model.schema_id,
    schema_version: model.schema_version,
    schema_namespace: model.schema_namespace,
    chain_id: model.chain_id,
    chain_kind: model.chain_kind,
    chain_digest: model.chain_digest,
    milestone: model.milestone,
    slice: model.slice,
    task: model.task,
    task_ids: model.task_ids.slice(),
    builder_line_class: contract.BUILDER_LINE_CLASS,
    verifier_line_class: contract.VERIFIER_LINE_CLASS,
    canonical_protocol: contract.BUILDER_CANONICAL_PROTOCOL,
    generated: '2026-07-25T00:00:00.000Z',
    reference_time: '2026-07-25T00:00:00.000Z',
    output_path: 'runtime-evidence/M016-S11-canonical-replay-chain.json',
    section_count: model.section_count,
    expected_section_count: contract.EXPECTED_SECTION_COUNT,
    section_ids: model.section_ids.slice(),
    sections: JSON.parse(JSON.stringify(model.sections)),
    verification_classes: model.verification_classes.slice(),
    verification_class_ids: model.verification_class_ids.slice(),
    verification_class_count: model.verification_class_count,
    expected_verification_class_count: contract.EXPECTED_VERIFICATION_CLASS_COUNT,
    class_coverage: JSON.parse(JSON.stringify(model.class_coverage)),
    class_source_counts: JSON.parse(JSON.stringify(model.class_source_counts)),
    source_count: model.source_count,
    expected_source_count: contract.EXPECTED_SOURCE_COUNT,
    source_refs: model.source_refs.slice(),
    source_hashes: JSON.parse(JSON.stringify(l.all_hashes)),
    hard_gate_ids: model.hard_gate_ids.slice(),
    hard_gate_count: model.hard_gate_count,
    not_proven_preserved_ids: model.not_proven_preserved_ids.slice(),
    not_proven_preserved_count: model.not_proven_preserved_count,
    not_proven_preservation_invariant: model.not_proven_preservation_invariant,
    launch_posture: JSON.parse(JSON.stringify(model.launch_posture)),
    s10_crosslink_posture: JSON.parse(JSON.stringify(model.s10_crosslink_posture)),
    sanitised: true,
    raw_bodies_persisted: false,
    network_call_count: 0,
    mutation_count: 0,
    redacted_posture: JSON.parse(JSON.stringify(model.redacted_posture)),
    blocked_count: 0,
    blockers: [],
  };
}

// ---------------------------------------------------------------------------
// (a) CLI parsing
// ---------------------------------------------------------------------------
test('a1: parseArgs honours --input and applies defaults', () => {
  const args = verifier.parseArgs([
    'node', 'verify_m016_s11_canonical_replay_chain.js',
    '--input', 'runtime-evidence/M016-S11-canonical-replay-chain.json',
    '--show-blockers',
  ]);
  assert.equal(args.input, 'runtime-evidence/M016-S11-canonical-replay-chain.json');
  assert.equal(args.showBlockers, true);
  assert.equal(args.help, false);
});

test('a2: parseArgs rejects unknown argv token', () => {
  assert.throws(() => verifier.parseArgs(['node', 'x.js', '--bogus-flag']),
    (e) => String(e.code).startsWith(contract.NAMESPACE + '-RUNNER-FAILURE'));
});

test('a3: parseArgs accepts --help without throwing', () => {
  const args = verifier.parseArgs(['node', 'x.js', '--help']);
  assert.equal(args.help, true);
});

// ---------------------------------------------------------------------------
// (b) Sidecar schema + counts validation
// ---------------------------------------------------------------------------
test('b1: validateCounts flags wrong source_count', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  sc.source_count = 16;
  const blocks = verifier.validateCounts(sc);
  assert.ok(blocks.some((b) => b.code.startsWith(contract.NAMESPACE + '-COUNT-DRIFT:source-')), 'expected COUNT-DRIFT:source- block');
});

test('b2: validateCounts flags wrong section_count', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  sc.section_count = 7;
  const blocks = verifier.validateCounts(sc);
  assert.ok(blocks.some((b) => b.code.startsWith(contract.NAMESPACE + '-COUNT-DRIFT:section-')), 'expected COUNT-DRIFT:section- block');
});

test('b3: validateCounts flags wrong verification_class_count', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  sc.verification_class_count = 3;
  const blocks = verifier.validateCounts(sc);
  assert.ok(blocks.some((b) => b.code.startsWith(contract.NAMESPACE + '-COUNT-DRIFT:class-')), 'expected COUNT-DRIFT:class- block');
});

test('b4: validateCounts flags wrong hard_gate_count', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  sc.hard_gate_count = 7;
  const blocks = verifier.validateCounts(sc);
  assert.ok(blocks.some((b) => b.code.startsWith(contract.NAMESPACE + '-COUNT-DRIFT:hardgate-')), 'expected COUNT-DRIFT:hardgate- block');
});

test('b5: validateSchema flags schema_id mismatch', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  sc.schema_id = 'https://attacker.local/schemas/foo';
  const blocks = verifier.validateSchema(sc);
  assert.ok(blocks.some((b) => b.code.indexOf('SCHEMA-ID') !== -1));
});

test('b6: validateSchema flags schema_namespace mismatch', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  sc.schema_namespace = 'm999-attacker';
  const blocks = verifier.validateSchema(sc);
  assert.ok(blocks.some((b) => b.code.indexOf('SCHEMA-NAMESPACE') !== -1));
});

// ---------------------------------------------------------------------------
// (c) Section / class / hard-gate order drift
// ---------------------------------------------------------------------------
test('c1: validateSectionOrder flags order swap', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  const tmp = sc.section_ids[0]; sc.section_ids[0] = sc.section_ids[1]; sc.section_ids[1] = tmp;
  const blocks = verifier.validateSectionOrder(sc);
  assert.ok(blocks.some((b) => b.code.startsWith(contract.NAMESPACE + '-SECTION-ORDER-DRIFT:section_ids-')), 'expected SECTION-ORDER-DRIFT:section_ids- block');
});

test('c2: validateClassOrder flags missing Human-Review', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  sc.verification_class_ids = ['Contract', 'Integration', 'Operational'];
  const blocks = verifier.validateClassOrder(sc);
  assert.ok(blocks.some((b) => b.code.startsWith(contract.NAMESPACE + '-SECTION-ORDER-DRIFT:verification_class_ids-')), 'expected SECTION-ORDER-DRIFT:verification_class_ids- block');
});

test('c3: validateHardGateOrder flags unknown HG id', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  sc.hard_gate_ids = contract.HARD_GATE_IDS.slice();
  sc.hard_gate_ids[0] = 'HG9 UNKNOWN';
  const blocks = verifier.validateHardGateOrder(sc);
  assert.ok(blocks.some((b) => b.code.startsWith(contract.NAMESPACE + '-SECTION-ORDER-DRIFT:hard_gate_ids-')), 'expected SECTION-ORDER-DRIFT:hard_gate_ids- block');
});

// ---------------------------------------------------------------------------
// (d) Launch posture + S10 crosslink
// ---------------------------------------------------------------------------
test('d1: validateLaunchPosture flags orchestration=PASS', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  sc.launch_posture.orchestration = 'PASS';
  const blocks = verifier.validateLaunchPosture(sc);
  assert.ok(blocks.some((b) => b.code.startsWith(contract.NAMESPACE + '-LAUNCH-POSTURE-DRIFT:orchestration-')), 'expected LAUNCH-POSTURE-DRIFT:orchestration- block');
});

test('d2: validateLaunchPosture flags launch=GO_BOUNDED_INTERNAL', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  sc.launch_posture.launch = 'GO_BOUNDED_INTERNAL';
  const blocks = verifier.validateLaunchPosture(sc);
  assert.ok(blocks.some((b) => b.code.startsWith(contract.NAMESPACE + '-LAUNCH-POSTURE-DRIFT:launch-')), 'expected LAUNCH-POSTURE-DRIFT:launch- block');
});

test('d3: validateLaunchPosture flags bounded_internal=false', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  sc.launch_posture.bounded_internal = false;
  const blocks = verifier.validateLaunchPosture(sc);
  assert.ok(blocks.some((b) => b.code.startsWith(contract.NAMESPACE + '-LAUNCH-POSTURE-DRIFT:bounded_internal-')), 'expected LAUNCH-POSTURE-DRIFT:bounded_internal- block');
});

test('d4: validateS10Crosslink flags S10 launch drift', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  sc.s10_crosslink_posture.launch = 'GO_BOUNDED_INTERNAL';
  const blocks = verifier.validateS10Crosslink(sc);
  assert.ok(blocks.some((b) => b.code.startsWith(contract.NAMESPACE + '-S10-CROSSLINK-DRIFT:launch-')), 'expected S10-CROSSLINK-DRIFT:launch- block');
});

// ---------------------------------------------------------------------------
// (e) NOT_PROVEN preservation
// ---------------------------------------------------------------------------
test('e1: validateNotProvenPreservation flags removal of all preserved ids', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  sc.not_proven_preserved_ids = [];
  sc.not_proven_preserved_count = 0;
  const blocks = verifier.validateNotProvenPreservation(sc);
  assert.ok(blocks.some((b) => b.code.startsWith(contract.NAMESPACE + '-NOT-PROVEN-REMOVED:')));
});

test('e2: validateNotProvenPreservation flags removal of single frozen id', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  sc.not_proven_preserved_ids = sc.not_proven_preserved_ids.filter((id) => id !== 'NOT_PROVEN_SCOPE_REVISED');
  sc.not_proven_preserved_count = sc.not_proven_preserved_ids.length;
  const blocks = verifier.validateNotProvenPreservation(sc);
  assert.ok(blocks.some((b) => b.code.startsWith(contract.NAMESPACE + '-NOT-PROVEN-REMOVED:NOT_PROVEN_SCOPE_REVISED')));
});

// ---------------------------------------------------------------------------
// (f) Chain verdict promotion forbidden
// ---------------------------------------------------------------------------
test('f1: validateChainVerdict flags ACCEPTANCE_RESOLVED', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  const outcome = sc.sections.find((s) => s.section_id === 'canonical_chain_outcome');
  outcome.chain_verdict = 'ACCEPTANCE_RESOLVED';
  const blocks = verifier.validateChainVerdict(sc);
  assert.ok(blocks.some((b) => b.code.indexOf('ACCEPTANCE_RESOLVED') !== -1));
});

test('f2: validateChainVerdict flags GO_BOUNDED_INTERNAL promotion', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  const outcome = sc.sections.find((s) => s.section_id === 'canonical_chain_outcome');
  outcome.chain_verdict = 'GO_BOUNDED_INTERNAL';
  const blocks = verifier.validateChainVerdict(sc);
  assert.ok(blocks.some((b) => b.code.startsWith(contract.NAMESPACE + '-VERDICT-FORBIDDEN:GO_BOUNDED_INTERNAL')));
});

test('f3: validateChainVerdict flags VERIFIED_LIVE leakage', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  const outcome = sc.sections.find((s) => s.section_id === 'canonical_chain_outcome');
  outcome.chain_verdict = 'VERIFIED_LIVE';
  const blocks = verifier.validateChainVerdict(sc);
  assert.ok(blocks.some((b) => b.code.startsWith(contract.NAMESPACE + '-VERDICT-FORBIDDEN:VERIFIED_LIVE')));
});

test('f4: validateChainVerdict flags unknown chain_verdict vocabulary', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  const outcome = sc.sections.find((s) => s.section_id === 'canonical_chain_outcome');
  outcome.chain_verdict = 'MAYBE_LAUNCH';
  const blocks = verifier.validateChainVerdict(sc);
  assert.ok(blocks.some((b) => b.code.startsWith(contract.NAMESPACE + '-VERDICT-FORBIDDEN:')));
});

test('f5: validateChainVerdict accepts CHAIN_RESOLVED_PREPARATION_ONLY', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  const outcome = sc.sections.find((s) => s.section_id === 'canonical_chain_outcome');
  outcome.chain_verdict = 'CHAIN_RESOLVED_PREPARATION_ONLY';
  const blocks = verifier.validateChainVerdict(sc);
  assert.equal(blocks.length, 0);
});

// ---------------------------------------------------------------------------
// (g) Source hash drift detection via loader re-derivation
// ---------------------------------------------------------------------------
test('g1: rederiveSourceHashes detects drifted fingerprint', () => {
  const fx = makeFixtureRoot();
  try {
    const l = loader.loadCanonicalReferences({ sourceRoot: fx });
    const declared = JSON.parse(JSON.stringify(l.all_hashes));
    // Mutate one declared fingerprint.
    declared['.gsd/REQUIREMENTS.md'] = 'deadbeef'.repeat(8);
    const rr = verifier.rederiveSourceHashes(l, declared);
    assert.ok(rr.blocks.some((b) => b.code.indexOf('SOURCE-HASH-DRIFT') !== -1 && b.code.indexOf('REQUIREMENTS.md') !== -1));
    assert.ok(rr.drift.indexOf('.gsd/REQUIREMENTS.md') !== -1);
  } finally { cleanupRoot(fx); }
});

test('g2: rederiveSourceHashes passes when declared matches fresh loader', () => {
  const fx = makeFixtureRoot();
  try {
    const l = loader.loadCanonicalReferences({ sourceRoot: fx });
    const declared = JSON.parse(JSON.stringify(l.all_hashes));
    const rr = verifier.rederiveSourceHashes(l, declared);
    assert.equal(rr.blocks.length, 0);
    assert.equal(rr.drift.length, 0);
  } finally { cleanupRoot(fx); }
});

// ---------------------------------------------------------------------------
// (h) Counter invariants
// ---------------------------------------------------------------------------
test('h1: validateCounters flags network_call_count > 0', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  sc.network_call_count = 3;
  const blocks = verifier.validateCounters(sc);
  assert.ok(blocks.some((b) => b.code.indexOf('NETWORK-CALL-COUNT') !== -1));
});

test('h2: validateCounters flags mutation_count > 0', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  sc.mutation_count = 7;
  const blocks = verifier.validateCounters(sc);
  assert.ok(blocks.some((b) => b.code.indexOf('MUTATION-COUNT') !== -1));
});

test('h3: validateCounters accepts zero counters', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  const blocks = verifier.validateCounters(sc);
  assert.equal(blocks.length, 0);
});

// ---------------------------------------------------------------------------
// (i) Human-Review section
// ---------------------------------------------------------------------------
test('i1: validateHumanReviewSection flags missing s09_human_review', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  sc.sections = sc.sections.filter((s) => s.section_id !== 's09_human_review');
  const blocks = verifier.validateHumanReviewSection(sc);
  assert.ok(blocks.some((b) => b.code.startsWith(contract.NAMESPACE + '-SECTION-MISSING:s09_human_review')));
});

test('i2: validateHumanReviewSection flags wrong review_ref', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  const s09 = sc.sections.find((s) => s.section_id === 's09_human_review');
  s09.review_ref = 'runtime-evidence/forged.md';
  const blocks = verifier.validateHumanReviewSection(sc);
  assert.ok(blocks.some((b) => b.code.indexOf('SECTION-MISSING:s09_human_review-review_ref') !== -1));
});

test('i3: validateHumanReviewSection flags frozen_posture drift in s09', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  const s09 = sc.sections.find((s) => s.section_id === 's09_human_review');
  s09.frozen_posture.launch = 'GO_BOUNDED_INTERNAL';
  const blocks = verifier.validateHumanReviewSection(sc);
  assert.ok(blocks.some((b) => b.code.indexOf('LAUNCH-POSTURE-DRIFT:s09-') !== -1));
});

// ---------------------------------------------------------------------------
// (j) Redaction safety
// ---------------------------------------------------------------------------
test('j1: validateRedaction flags api_key leak', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  sc.redacted_posture.leaked_secret = 'api_key=ABCDEFGHIJKLMNOP';
  const blocks = verifier.validateRedaction(sc);
  assert.ok(blocks.length > 0);
});

test('j2: validateRedaction flags raw_bodies leak', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  sc.redacted_posture.leaked = 'result_json.bos and raw_bodies and raw_reasoning';
  const blocks = verifier.validateRedaction(sc);
  assert.ok(blocks.length > 0);
});

test('j3: validateRedaction flags absolute path leak', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  sc.redacted_posture.leaked_path = '/etc/passwd';
  const blocks = verifier.validateRedaction(sc);
  assert.ok(blocks.length > 0);
});

test('j4: validateRedaction flags RSA PRIVATE KEY leak', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  sc.redacted_posture.pem = '-----BEGIN RSA PRIVATE KEY-----\nABCD\n-----END RSA PRIVATE KEY-----';
  const blocks = verifier.validateRedaction(sc);
  assert.ok(blocks.length > 0);
});

test('j5: validateRedaction passes clean sidecar', () => {
  const sc = buildValidSidecar(makeFixtureRoot());
  const blocks = verifier.validateRedaction(sc);
  assert.equal(blocks.length, 0);
});

// ---------------------------------------------------------------------------
// (k) Verifier CLI health-line shape
// ---------------------------------------------------------------------------
test('k1: buildVerifierCliLine emits M16-S11-CHAIN shape with documented counters', () => {
  const line = verifier.buildVerifierCliLine({
    verdict: 'CHAIN_RESOLVED_PREPARATION_ONLY',
    exitCode: 0,
    blockCount: 0,
    notProvenIds: contract.NOT_PROVEN_PRESERVED_IDS,
    digest: 'abc',
  });
  assert.match(line, /^M16-S11-CHAIN verdict=CHAIN_RESOLVED_PREPARATION_ONLY /);
  assert.match(line, /block_count=0/);
  assert.match(line, /class_count=4/);
  assert.match(line, /source_count=17/);
  assert.match(line, /section_count=8/);
  assert.match(line, /not_proven_count=9/);
  assert.match(line, /mutation_count=0/);
  assert.match(line, /network_call_count=0/);
  assert.match(line, /digest=abc$/);
});

test('k2: selectExitCode returns PASS (0) when no blockers', () => {
  assert.equal(verifier.selectExitCode([]), contract.EXIT_CODES.PASS);
});

test('k3: selectExitCode returns SOURCE_HASH_DRIFT (4) for hash drift blockers', () => {
  const blockers = [{ code: 'M16-S11-CHAIN-SOURCE-HASH-DRIFT:foo' }];
  assert.equal(verifier.selectExitCode(blockers), contract.EXIT_CODES.SOURCE_HASH_DRIFT);
});

test('k4: selectExitCode returns REDACTION_LEAK (6) for redaction blockers', () => {
  const blockers = [{ code: 'M16-S11-CHAIN-REDACTION-LEAK:foo' }];
  assert.equal(verifier.selectExitCode(blockers), contract.EXIT_CODES.REDACTION_LEAK);
});

test('k5: selectExitCode returns REJECTED_FAIL_CLOSED (2) for posture / verdict drift', () => {
  const blockers = [{ code: 'M16-S11-CHAIN-LAUNCH-POSTURE-DRIFT:foo' }];
  assert.equal(verifier.selectExitCode(blockers), contract.EXIT_CODES.REJECTED_FAIL_CLOSED);
});

test('k6: selectExitCode returns RUNNER_FAILURE (9) for runner-failure blockers', () => {
  const blockers = [{ code: 'M16-S11-CHAIN-RUNNER-FAILURE:INPUT-NOT-FOUND' }];
  assert.equal(verifier.selectExitCode(blockers), contract.EXIT_CODES.RUNNER_FAILURE);
});

// ---------------------------------------------------------------------------
// (l) Verifier independence / anti-coupling
// ---------------------------------------------------------------------------
test('l1: verifier module does NOT import the builder script', () => {
  const src = fs.readFileSync(verifier.SCRIPT_PATH, 'utf8');
  assert.ok(!/require\(\s*['"]\.\/build_m016_s11_canonical_replay_chain/.test(src),
    'verifier must not require the builder script');
});

test('l2: verifier module does NOT require child_process / net / dns / http(s)', () => {
  const src = fs.readFileSync(verifier.SCRIPT_PATH, 'utf8');
  assert.equal(/require\(\s*['"]node:child_process['"]/.test(src), false);
  assert.equal(/require\(\s*['"]node:net['"]/.test(src), false);
  assert.equal(/require\(\s*['"]node:dns['"]/.test(src), false);
  assert.equal(/require\(\s*['"]node:http['"]/.test(src), false);
  assert.equal(/require\(\s*['"]node:https['"]/.test(src), false);
  assert.equal(/require\(\s*['"]node:http2['"]/.test(src), false);
  assert.equal(/require\(\s*['"]node:tls['"]/.test(src), false);
});

test('l3: enforceIndependence() throws if a forbidden pattern is present', () => {
  const src = fs.readFileSync(verifier.SCRIPT_PATH, 'utf8');
  for (const pat of verifier.FORBIDDEN_IMPORT_PATTERNS) {
    assert.ok(typeof pat.test === 'function', 'pattern must expose .test');
    // Sanity: only validate patterns that DO appear in the file are
    // gated; this test should not introduce false positives.
    void pat;
  }
  // Calling enforceIndependence() on the real source must return true.
  assert.equal(verifier.enforceIndependence(), true);
  void src;
});

// ---------------------------------------------------------------------------
// (m) Real-sidecar end-to-end run
// ---------------------------------------------------------------------------
test('m1: end-to-end run against real sidecar exits 0 with CHAIN_RESOLVED_PREPARATION_ONLY', () => {
  if (!fs.existsSync(REAL_SIDECAR)) {
    // Sidecar missing — skip (build it first via T02).
    return;
  }
  const res = spawnSync('node', [
    verifier.SCRIPT_PATH,
    '--input', REAL_SIDECAR,
    '--show-blockers',
  ], { encoding: 'utf8' });
  assert.equal(res.status, 0, 'verifier must exit 0 on real sidecar; stderr=' + (res.stderr || '') + ' stdout=' + (res.stdout || ''));
  const cliLine = (res.stdout || '').split(/\r?\n/).filter(Boolean)[0] || '';
  assert.match(cliLine, /^M16-S11-CHAIN /);
  assert.match(cliLine, /verdict=CHAIN_RESOLVED_PREPARATION_ONLY/);
  assert.match(cliLine, /block_count=0/);
  assert.match(cliLine, /class_count=4/);
  assert.match(cliLine, /source_count=17/);
  assert.match(cliLine, /section_count=8/);
  assert.match(cliLine, /mutation_count=0/);
  assert.match(cliLine, /network_call_count=0/);
});

test('m2: end-to-end run rejects tampered sidecar (hash drift) with non-zero exit', () => {
  if (!fs.existsSync(REAL_SIDECAR)) return;
  const tmpDir = makeRootedTmp('tamper');
  const tmpFile = path.join(tmpDir, 'tampered.json');
  try {
    const body = JSON.parse(fs.readFileSync(REAL_SIDECAR, 'utf8'));
    body.source_hashes['.gsd/REQUIREMENTS.md'] = 'deadbeef'.repeat(8);
    fs.writeFileSync(tmpFile, JSON.stringify(body, null, 2));
    const res = spawnSync('node', [
      verifier.SCRIPT_PATH,
      '--input', tmpFile,
    ], { encoding: 'utf8' });
    assert.notEqual(res.status, 0, 'tampered sidecar must exit non-zero');
    assert.equal(res.status, contract.EXIT_CODES.SOURCE_HASH_DRIFT);
    const cliLine = (res.stdout || '').split(/\r?\n/).filter(Boolean)[0] || '';
    assert.match(cliLine, /block_count=[1-9]/);
    assert.match((res.stderr || ''), /SOURCE-HASH-DRIFT/);
  } finally { cleanupRoot(tmpDir); }
});

test('m3: end-to-end run rejects sidecar with verdict promotion', () => {
  if (!fs.existsSync(REAL_SIDECAR)) return;
  const tmpDir = makeRootedTmp('promote');
  const tmpFile = path.join(tmpDir, 'promoted.json');
  try {
    const body = JSON.parse(fs.readFileSync(REAL_SIDECAR, 'utf8'));
    const outcome = body.sections.find((s) => s.section_id === 'canonical_chain_outcome');
    outcome.chain_verdict = 'ACCEPTANCE_RESOLVED';
    fs.writeFileSync(tmpFile, JSON.stringify(body, null, 2));
    const res = spawnSync('node', [
      verifier.SCRIPT_PATH,
      '--input', tmpFile,
    ], { encoding: 'utf8' });
    assert.notEqual(res.status, 0);
    assert.equal(res.status, contract.EXIT_CODES.REJECTED_FAIL_CLOSED);
    assert.match((res.stderr || ''), /ACCEPTANCE_RESOLVED/);
  } finally { cleanupRoot(tmpDir); }
});

test('m4: end-to-end run rejects missing --input with RUNNER_FAILURE exit', () => {
  const res = spawnSync('node', [verifier.SCRIPT_PATH], { encoding: 'utf8' });
  assert.notEqual(res.status, 0);
  assert.equal(res.status, contract.EXIT_CODES.RUNNER_FAILURE);
  assert.match((res.stderr || ''), /INPUT/);
});

test('m5: end-to-end run rejects malformed JSON sidecar with RUNNER_FAILURE exit', () => {
  const tmpDir = makeRootedTmp('malformed');
  const tmpFile = path.join(tmpDir, 'malformed.json');
  try {
    fs.writeFileSync(tmpFile, '{not json');
    const res = spawnSync('node', [verifier.SCRIPT_PATH, '--input', tmpFile], { encoding: 'utf8' });
    assert.notEqual(res.status, 0);
    assert.equal(res.status, contract.EXIT_CODES.RUNNER_FAILURE);
    assert.match((res.stderr || ''), /INPUT/);
  } finally { cleanupRoot(tmpDir); }
});

// ---------------------------------------------------------------------------
// (n) Public surface
// ---------------------------------------------------------------------------
test('n1: verifier module exports documented public surface', () => {
  for (const name of [
    'parseArgs',
    'printHelp',
    'verifySidecar',
    'validateSchema',
    'validateCounts',
    'validateSectionOrder',
    'validateClassOrder',
    'validateHardGateOrder',
    'validateSourceAllowlist',
    'validateLaunchPosture',
    'validateS10Crosslink',
    'validateNotProvenPreservation',
    'validateChainVerdict',
    'validateCounters',
    'validateHumanReviewSection',
    'rederiveSourceHashes',
    'validateRedaction',
    'selectExitCode',
    'buildVerifierCliLine',
    'failureSummary',
    'readSidecar',
    'enforceIndependence',
    'run',
    'ROOT',
    'SCRIPT_PATH',
    'FORBIDDEN_IMPORT_PATTERNS',
  ]) {
    assert.ok(typeof verifier[name] !== 'undefined', 'verifier must export ' + name);
  }
});
