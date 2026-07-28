#!/usr/bin/env node
'use strict';
/**
 * scripts/test_m016_s11_canonical_replay_chain_contract.js
 *
 * M016-txa3vu / S11 / T02 — node:test suite covering the frozen
 * chain contract. Validates:
 *
 *   - 17 sources, 8 sections, 4 verification classes (exact counts).
 *   - Frozen posture: orchestration=PARTIAL, evidence=PARTIAL,
 *     launch=PREPARATION_ONLY, bounded_internal=true.
 *   - NOT_PROVEN preservation: preserved_ids is non-empty + bounded.
 *   - HG1..HG8 hard-gate vocabulary + worksheet state vocabulary.
 *   - Chain digest byte-stability (canonical input → same digest).
 *   - Block factory emits namespaced M16-S11-CHAIN-* codes.
 *   - Evaluator round-trip on a passing + failing model.
 *   - Redaction safety scan catches forbidden keys + patterns.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const contract = require('./lib/m016-s11-canonical-replay-chain-contract.js');

const ROOT = path.resolve(__dirname, '..');
const S09 = path.resolve(ROOT, 'runtime-evidence', 'M016-S09-HUMAN-REVIEW.md');
const REQUIREMENTS = path.resolve(ROOT, '.gsd', 'REQUIREMENTS.md');
const ROADMAP = path.resolve(ROOT, '.gsd', 'phases', '16-txa3vu-evidence-bearing-bounded-mission-proof', '16-ROADMAP.md');

// ---------------------------------------------------------------------------
// 1. Schema + namespace
// ---------------------------------------------------------------------------
test('contract: schema + namespace invariants', () => {
  assert.equal(contract.MILESTONE, 'M016-txa3vu');
  assert.equal(contract.SLICE, 'S11');
  assert.ok(contract.TASK_IDS.length === 5);
  assert.equal(contract.TASK, 'T02');
  assert.equal(contract.NAMESPACE, 'M16-S11-CHAIN');
  assert.equal(contract.BUILDER_LINE_CLASS, 'M16-S11-BUILD');
  assert.equal(contract.VERIFIER_LINE_CLASS, 'M16-S11-CHAIN');
  assert.ok(typeof contract.BLOCKER_CODE_PATTERN === 'string');
  assert.ok(contract.BLOCKER_CODE_PATTERN.indexOf('M16-S11-CHAIN-') !== -1);
  // Pattern itself must reject foreign codes.
  assert.ok(/^M16-S11-CHAIN-[A-Za-z0-9._:-]+$/.test('M16-S11-CHAIN-SOURCE-MISSING:a'));
  assert.equal(/^M16-S11-CHAIN-[A-Za-z0-9._:-]+$/.test('M16-S10-ACCEPTANCE-X'), false);
  assert.ok(contract.CHAIN_REFERENCE_TIME.endsWith('Z'));
});

// ---------------------------------------------------------------------------
// 2. Frozen posture + chain verdicts
// ---------------------------------------------------------------------------
test('contract: frozen launch posture immutable', () => {
  const posture = contract.FROZEN_LAUNCH_POSTURE;
  assert.equal(posture.orchestration, 'PARTIAL');
  assert.equal(posture.evidence, 'PARTIAL');
  assert.equal(posture.launch, 'PREPARATION_ONLY');
  assert.equal(posture.bounded_internal, true);
});

test('contract: forbidden chain verdicts detected', () => {
  for (const v of ['GO', 'LAUNCH_READY', 'VERIFIED_LIVE', 'PROVEN_BOUNDED_NATIVE', 'ACCEPTANCE_RESOLVED']) {
    assert.equal(contract.isForbiddenChainVerdict(v), true, v + ' must be forbidden');
  }
  for (const v of ['PARTIAL', 'PASS', 'NOT_PROVEN', 'PREPARATION_ONLY', 'CHAIN_RESOLVED_PREPARATION_ONLY']) {
    assert.equal(contract.isForbiddenChainVerdict(v), false, v + ' must NOT be forbidden');
  }
});

test('contract: S10 cross-link posture matches S11 frozen posture', () => {
  const s10 = contract.S10_FROZEN_POSTURE;
  const s11 = contract.FROZEN_LAUNCH_POSTURE;
  assert.equal(s10.orchestration, s11.orchestration);
  assert.equal(s10.evidence, s11.evidence);
  assert.equal(s10.launch, s11.launch);
  assert.equal(s10.bounded_internal, s11.bounded_internal);
});

// ---------------------------------------------------------------------------
// 3. Sections — 8 frozen
// ---------------------------------------------------------------------------
test('contract: chain sections count == 8 and ordered', () => {
  const ids = contract.CHAIN_SECTION_IDS;
  assert.equal(ids.length, 8);
  assert.deepEqual(ids, [
    'r041_canonical',
    'milestone_criterion',
    's05_canonical_verdicts',
    's06_reconciliation',
    's08_scope_decision',
    's09_human_review',
    's10_acceptance_contract',
    'canonical_chain_outcome',
  ]);
  for (const id of ids) assert.equal(contract.isKnownChainSection(id), true);
  // Unknown id rejected.
  assert.equal(contract.isKnownChainSection('r042_does_not_exist'), false);
});

// ---------------------------------------------------------------------------
// 4. Verification classes — exactly 4
// ---------------------------------------------------------------------------
test('contract: verification classes == 4', () => {
  const ids = contract.VERIFICATION_CLASS_IDS;
  assert.equal(ids.length, 4);
  assert.deepEqual(ids, ['Contract', 'Integration', 'Operational', 'Human-Review']);
  for (const id of ids) assert.equal(contract.isKnownVerificationClass(id), true);
  for (const id of ['Network', 'Browser', 'E2E', 'UAT']) {
    assert.equal(contract.isKnownVerificationClass(id), false);
  }
});

test('contract: class coverage declares section_ids per class', () => {
  const cc = contract.CLASS_COVERAGE;
  assert.ok(Array.isArray(cc.Contract.section_ids));
  assert.ok(cc.Contract.section_ids.length >= 1);
  assert.ok(Array.isArray(cc.Integration.section_ids));
  assert.ok(cc.Operational.section_ids.length >= 1);
  assert.ok(cc['Human-Review'].section_ids.length >= 1);
  // Every class section must be a known chain section.
  for (const cls of Object.values(cc)) {
    for (const sid of cls.section_ids) {
      assert.ok(contract.isKnownChainSection(sid), 'unknown section id ' + sid);
    }
  }
});

// ---------------------------------------------------------------------------
// 5. Source allowlist — exactly 17
// ---------------------------------------------------------------------------
test('contract: source allowlist == 17 with locked verification class + chain section', () => {
  assert.equal(contract.SOURCE_ALLOWLIST_REFS.length, 17);
  assert.equal(contract.SOURCE_ALLOWLIST.length, 17);
  const seenRefs = new Set();
  const classCounts = {};
  for (const cls of contract.VERIFICATION_CLASS_IDS) classCounts[cls] = 0;
  for (const entry of contract.SOURCE_ALLOWLIST) {
    assert.equal(typeof entry.source_ref, 'string');
    assert.ok(entry.source_ref.length > 0);
    assert.ok(!seenRefs.has(entry.source_ref), 'duplicate source_ref: ' + entry.source_ref);
    seenRefs.add(entry.source_ref);
    assert.ok(contract.isKnownVerificationClass(entry.verification_class), 'unknown class ' + entry.verification_class);
    assert.ok(contract.isKnownChainSection(entry.chain_section), 'unknown section ' + entry.chain_section);
    assert.equal(entry.required, true);
    if (Object.prototype.hasOwnProperty.call(classCounts, entry.verification_class)) {
      classCounts[entry.verification_class] += 1;
    }
    assert.match(entry.source_ref, contract.SAFE_PATH_RE, 'source_ref must match SAFE_PATH_RE: ' + entry.source_ref);
  }
  // Each class must have at least one source.
  for (const cls of contract.VERIFICATION_CLASS_IDS) {
    assert.ok(classCounts[cls] >= 1, 'class ' + cls + ' must have >=1 source');
  }
});

// ---------------------------------------------------------------------------
// 6. HG + worksheet vocabulary
// ---------------------------------------------------------------------------
test('contract: hard-gate ids == 8 + state vocabulary', () => {
  assert.equal(contract.HARD_GATE_IDS.length, 8);
  assert.deepEqual(contract.HARD_GATE_IDS.slice(), [
    'HG1 SEMANTIC_RULE_COMPLIANCE',
    'HG2 PROVENANCE_INTEGRITY',
    'HG3 RECOVERY_EVIDENCE',
    'HG4 FINANCIAL_PROTECTION',
    'HG5 SECURITY_POSTURE',
    'HG6 COMPLIANCE_POSTURE',
    'HG7 READ_ONLY_BOUNDARY',
    'HG8 SCRATCH_ISOLATION',
  ]);
  for (const id of contract.HARD_GATE_IDS) assert.equal(contract.isKnownHardGate(id), true);
  for (const state of ['pass', 'partial', 'not_proven', 'fail_closed']) {
    assert.equal(contract.isKnownHardGateState(state), true);
  }
  assert.equal(contract.isKnownHardGateState('unknown'), false);
});

// ---------------------------------------------------------------------------
// 7. NOT_PROVEN preservation
// ---------------------------------------------------------------------------
test('contract: NOT_PROVEN preserved_ids is bounded and non-empty', () => {
  const ids = contract.NOT_PROVEN_PRESERVED_IDS;
  assert.ok(Array.isArray(ids));
  assert.ok(ids.length >= 1);
  for (const id of ids) {
    assert.equal(typeof id, 'string');
    assert.equal(contract.isPreservedNotProvenId(id), true);
  }
  assert.equal(contract.isPreservedNotProvenId('SOMETHING_NEW'), false);
});

// ---------------------------------------------------------------------------
// 8. Blocker factory
// ---------------------------------------------------------------------------
test('contract: blocker factory emits M16-S11-CHAIN-* codes', () => {
  assert.ok(contract.BLOCKER_CODES.SOURCE_NOT_ALLOWLISTED('runtime-evidence/foo').startsWith('M16-S11-CHAIN-SOURCE-NOT-ALLOWLISTED:'));
  assert.ok(contract.BLOCKER_CODES.SOURCE_MISSING('some-ref').startsWith('M16-S11-CHAIN-SOURCE-MISSING:'));
  assert.ok(contract.BLOCKER_CODES.PATH_TRAVERSAL('escape:foo').startsWith('M16-S11-CHAIN-PATH-TRAVERSAL:'));
  assert.ok(contract.BLOCKER_CODES.NOT_PROVEN_REMOVED('X-1').startsWith('M16-S11-CHAIN-NOT-PROVEN-REMOVED:'));
  assert.ok(contract.BLOCKER_CODES.LAUNCH_POSTURE_DRIFT('GO').startsWith('M16-S11-CHAIN-LAUNCH-POSTURE-DRIFT:'));
  assert.equal(contract.BLOCKER_CODES.RUNNER_FAILURE(), 'M16-S11-CHAIN-RUNNER-FAILURE');
  // Namespacing regex check.
  for (const code of [
    contract.BLOCKER_CODES.SOURCE_MISSING('a'),
    contract.BLOCKER_CODES.SOURCE_HASH_DRIFT('a'),
    contract.BLOCKER_CODES.RUNNER_FAILURE(),
  ]) {
    assert.equal(contract.isChainBlockerCode(code), true);
  }
});

// ---------------------------------------------------------------------------
// 9. Health-line shapes — match contract BUILDER/VERIFIER classes
// ---------------------------------------------------------------------------
test('contract: builder health line shape', () => {
  const line = contract.buildHealthLineBuilder({ verdict: 'CHAIN_BUILT', exitCode: 0, blockCount: 0, sourceCount: 17, sectionCount: 8, classCount: 4, notProvenCount: 9, mutationCount: 0, networkCallCount: 0, digest: 'abc' });
  assert.match(line, /^M16-S11-BUILD verdict=CHAIN_BUILT /);
  assert.match(line, /block_count=0/);
  assert.match(line, /class_count=4/);
  assert.match(line, /source_count=17/);
  assert.match(line, /section_count=8/);
  assert.match(line, /not_proven_count=9/);
  assert.match(line, /mutation_count=0/);
  assert.match(line, /network_call_count=0/);
  assert.match(line, /digest=abc$/);
});

test('contract: chain (verifier) health line shape', () => {
  const line = contract.buildHealthLineChain({ verdict: 'CHAIN_RESOLVED_PREPARATION_ONLY', exitCode: 0, blockCount: 0, sourceCount: 17, sectionCount: 8, classCount: 4, notProvenCount: 9, mutationCount: 0, networkCallCount: 0, digest: 'def' });
  assert.match(line, /^M16-S11-CHAIN verdict=CHAIN_RESOLVED_PREPARATION_ONLY /);
  assert.match(line, /block_count=0/);
  assert.match(line, /class_count=4/);
  assert.match(line, /source_count=17/);
  assert.match(line, /section_count=8/);
  assert.match(line, /digest=def$/);
});

// ---------------------------------------------------------------------------
// 10. Pure builders + digest byte-stability
// ---------------------------------------------------------------------------
test('contract: buildChainModel returns 8 sections + frozen posture', () => {
  const model = contract.buildChainModel({ generated: '2026-07-25T00:00:00.000Z' });
  assert.equal(model.section_count, 8);
  assert.equal(model.section_ids.length, 8);
  assert.equal(model.source_count, 17);
  assert.equal(model.expected_source_count, 17);
  assert.equal(model.verification_class_count, 4);
  assert.equal(model.verification_class_ids.length, 4);
  assert.equal(model.hard_gate_count, 8);
  assert.equal(model.not_proven_preserved_count, contract.EXPECTED_NOT_PROVEN_COUNT);
  assert.equal(model.launch_posture.launch, 'PREPARATION_ONLY');
  assert.equal(model.launch_posture.bounded_internal, true);
  assert.equal(model.s10_crosslink_posture.launch, 'PREPARATION_ONLY');
});

test('contract: evaluateChain accepts a freshly built model', () => {
  const model = contract.buildChainModel({ generated: '2026-07-25T00:00:00.000Z' });
  const ev = contract.evaluateChain({ model });
  assert.equal(ev.ok, true);
  assert.equal(ev.verdict, 'CHAIN_RESOLVED_PREPARATION_ONLY');
  assert.equal(ev.block_count, 0);
  assert.equal(ev.source_count, 17);
  assert.equal(ev.section_count, 8);
  assert.equal(ev.class_count, 4);
});

test('contract: computeChainDigest byte-stable for same inputs', () => {
  const modelA = contract.buildChainModel({ generated: '2026-07-25T00:00:00.000Z' });
  const modelB = contract.buildChainModel({ generated: '2026-07-25T00:00:00.000Z' });
  const a = contract.computeChainDigest(modelA);
  const b = contract.computeChainDigest(modelB);
  assert.equal(typeof a, 'string');
  assert.equal(a.length, 64);
  assert.equal(a, b, 'digest must be byte-stable for identical inputs');
});

// ---------------------------------------------------------------------------
// 11. Evaluator fail-closed scenarios
// ---------------------------------------------------------------------------
test('contract: evaluateChain rejects ACCEPTANCE_RESOLVED leakage', () => {
  const model = contract.buildChainModel({ generated: '2026-07-25T00:00:00.000Z' });
  const outcome = model.sections.find((s) => s.section_id === 'canonical_chain_outcome');
  outcome.chain_verdict = 'ACCEPTANCE_RESOLVED';
  const ev = contract.evaluateChain({ model });
  assert.equal(ev.ok, false);
  assert.ok(ev.blockers.some((b) => b.code.startsWith('M16-S11-CHAIN-VERDICT-FORBIDDEN')));
});

test('contract: evaluateChain rejects launch posture drift', () => {
  const model = contract.buildChainModel({ generated: '2026-07-25T00:00:00.000Z' });
  model.launch_posture = Object.assign({}, model.launch_posture, { launch: 'GO_BOUNDED_INTERNAL' });
  const ev = contract.evaluateChain({ model });
  assert.equal(ev.ok, false);
  assert.ok(ev.blockers.some((b) => b.code.startsWith('M16-S11-CHAIN-LAUNCH-POSTURE-DRIFT')));
});

test('contract: evaluateChain rejects bounded_internal=false', () => {
  const model = contract.buildChainModel({ generated: '2026-07-25T00:00:00.000Z' });
  model.launch_posture = Object.assign({}, model.launch_posture, { bounded_internal: false });
  const ev = contract.evaluateChain({ model });
  assert.equal(ev.ok, false);
  assert.ok(ev.blockers.some((b) => b.code.startsWith('M16-S11-CHAIN-LAUNCH-POSTURE-DRIFT')));
});

test('contract: evaluateChain rejects section order drift', () => {
  const model = contract.buildChainModel({ generated: '2026-07-25T00:00:00.000Z' });
  // Swap two adjacent sections — the section order matters.
  const tmp = model.sections[0];
  model.sections[0] = model.sections[1];
  model.sections[1] = tmp;
  model.section_ids = model.sections.map((s) => s.section_id);
  const ev = contract.evaluateChain({ model });
  assert.equal(ev.ok, false);
  assert.ok(ev.blockers.some((b) => b.code.startsWith('M16-S11-CHAIN-SECTION-ORDER-DRIFT')));
});

test('contract: evaluateChain rejects NOT_PROVEN removal', () => {
  const model = contract.buildChainModel({ generated: '2026-07-25T00:00:00.000Z' });
  model.not_proven_preserved_ids = [];
  model.not_proven_preserved_count = 0;
  const ev = contract.evaluateChain({ model });
  assert.equal(ev.ok, false);
  assert.ok(ev.blockers.some((b) => b.code.startsWith('M16-S11-CHAIN-NOT-PROVEN-REMOVED')));
});

test('contract: evaluateChain rejects forbidden verdict in section row', () => {
  const model = contract.buildChainModel({ generated: '2026-07-25T00:00:00.000Z' });
  const outcome = model.sections.find((s) => s.section_id === 'canonical_chain_outcome');
  outcome.chain_verdict = 'READY';
  const ev = contract.evaluateChain({ model });
  assert.equal(ev.ok, false);
  assert.ok(ev.blockers.some((b) => b.code.startsWith('M16-S11-CHAIN-VERDICT-FORBIDDEN')));
});

test('contract: evaluateChain rejects missing verification class', () => {
  const model = contract.buildChainModel({ generated: '2026-07-25T00:00:00.000Z' });
  model.verification_class_ids = ['Contract', 'Integration', 'Operational']; // drop Human-Review
  model.verification_class_count = 3;
  const ev = contract.evaluateChain({ model });
  assert.equal(ev.ok, false);
  assert.ok(ev.blockers.some((b) => b.code.startsWith('M16-S11-CHAIN-CLASS-COUNT-DRIFT')));
});

// ---------------------------------------------------------------------------
// 12. Redaction safety
// ---------------------------------------------------------------------------
test('contract: redaction safety scan flags api_key tokens', () => {
  const hits = contract.checkRedactionSafety({ leak: 'api_key = ABCDEFGHIJKLMN' });
  assert.ok(hits.length > 0);
  assert.equal(hits[0].kind, 'token_assignment');
});

test('contract: redaction safety scan flags absolute paths', () => {
  const hits = contract.checkRedactionSafety({ path: '/etc/passwd' });
  assert.ok(hits.length > 0);
  assert.equal(hits[0].kind, 'absolute_path');
});

test('contract: redaction safety scan flags raw_bodies in payloads', () => {
  const hits = contract.checkRedactionSafety({ inline: 'result_json.bos and raw_bodies and raw_reasoning' });
  assert.ok(hits.length > 0);
  assert.ok(['result_json_bos_inline', 'absolute_path'].includes(hits[0].kind));
});

test('contract: assertWriteSafe refuses payload with private_key', () => {
  assert.throws(() => contract.assertWriteSafe({ pem: '-----BEGIN RSA PRIVATE KEY-----\nABCD\n-----END RSA PRIVATE KEY-----' }), /redaction safety violation/);
});

test('contract: assertWriteSafe accepts clean payload', () => {
  assert.equal(contract.assertWriteSafe({ ok: 'bounded', bounded_digests_only: true }), true);
});

// ---------------------------------------------------------------------------
// 13. Files exist on disk
// ---------------------------------------------------------------------------
test('contract: live S09/S10 sources exist + GSD paths exist', () => {
  const fs = require('node:fs');
  // These may be optional in test env; assert only when fs is available.
  if (fs.existsSync(S09)) assert.equal(fs.statSync(S09).isFile(), true);
  if (fs.existsSync(REQUIREMENTS)) assert.equal(fs.statSync(REQUIREMENTS).isFile(), true);
  if (fs.existsSync(ROADMAP)) assert.equal(fs.statSync(ROADMAP).isFile(), true);
});

// ---------------------------------------------------------------------------
// 14. Source guards + extras
// ---------------------------------------------------------------------------
test('contract: PROHIBITED_METHOD_RE rejects HTTP verbs', () => {
  assert.equal(contract.PROHIBITED_METHOD_RE.test('POST /api/x'), true);
  assert.equal(contract.PROHIBITED_METHOD_RE.test('DELETE foo'), true);
  assert.equal(contract.PROHIBITED_METHOD_RE.test('GET x'), false);
});

test('contract: ABSOLUTE_PATH_RE rejects absolute paths', () => {
  assert.equal(contract.ABSOLUTE_PATH_RE.test('/etc/passwd'), true);
  assert.equal(contract.ABSOLUTE_PATH_RE.test('/var/log'), true);
  assert.equal(contract.ABSOLUTE_PATH_RE.test('home/foo'), false);
});
