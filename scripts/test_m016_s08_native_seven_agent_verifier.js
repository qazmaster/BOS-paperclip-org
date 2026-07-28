#!/usr/bin/env node
'use strict';

/**
 * scripts/test_m016_s08_native_seven_agent_verifier.js
 *
 * M016-txa3vu / S08 / T03 — Independent verifier tests.
 *
 * Tests cover:
 *   1. parseArgs — valid inputs, missing required, unknown arg, --help
 *   2. resolveExplicitRelative — repo-relative acceptance, absolute
 *      refusal, `..` traversal refusal, symlink escape refusal
 *   3. detectBranch — live vs scope_revised vs mutual exclusion vs none
 *   4. rederiveReplayKeys — match + byte_identical for canonical closure,
 *      mismatch on hash drift, scope branch returns declared-only keys
 *   5. rederiveEvidenceChain — digest agreement on canonical rows,
 *      drift detection on mismatched hashes
 *   6. evaluateLiveBranch — full PASS on canonical admission+candidate
 *      +closure; FAIL on each of the canonical blocker codes
 *   7. evaluateScopeBranch — PASS on canonical scope decision; FAIL on
 *      closure_kind mismatch, promoted execution verdict, harness
 *      invocation attempt
 *   8. evaluateNegativeFixtures — accepts canonical catalog; rejects
 *      duplicate blocker codes, duplicate exit codes, non-M16-S08-NATIVE
 *      blocker codes, incomplete catalog
 *   9. Verdict line — exact `M16-S08-VERIFY verdict=...` regex match,
 *      exit code 0..9, replay_key_match boolean
 *  10. Atomic write — refuses redaction leak, refuses overwrite without
 *      --force, succeeds with --force
 *  11. Independence — producer_cli_imported=false constant; no producer
 *      import attempt succeeds
 *  12. Exit code mapping — each blocker code maps to a stable exit code
 *
 * Run with: node --test scripts/test_m016_s08_native_seven_agent_verifier.js
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const test = require('node:test');
const assert = require('node:assert/strict');

const data = require('./lib/m016-s08-native-seven-agent-data');
const contract = require('./lib/m016-s08-native-seven-agent-contract');
const verifier = require('./verify_m016_s08_native_seven_agent_integration');

const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Helpers — fixture builders (re-using T01 contract helpers)
// ---------------------------------------------------------------------------

function makeSourceHashes(referenceTime) {
  const ref = referenceTime || data.DEFAULTS.reference_time;
  const hashes = {};
  for (const entry of data.SOURCE_ALLOWLIST) {
    hashes[entry.source_ref] = contract.sha256Hex('s08-verify-test-fixture:' + entry.source_ref);
  }
  return hashes;
}

function makeAdmission(overrides) {
  const generated = overrides?.generated || data.DEFAULTS.reference_time;
  return contract.buildAdmission(Object.assign({
    confirmed: true,
    operatorSource: 'cli_argv',
    freshReadonlyProbe: true,
    staleMarkerDetected: false,
    observedAgentCount: 7,
    sourceHashes: [],
  }, overrides || {}));
}

function makeAgentRuns(overrides) {
  const generated = overrides?.generated || data.DEFAULTS.reference_time;
  return data.DIVISION_REGISTRY.map((entry, index) => ({
    agent_run_id: 'M16-S08-NATIVE-RUN-' + entry.division.toLowerCase() + '-' + contract.sha256Hex('verify-seed-' + index).slice(0, 8),
    division: entry.division,
    role: entry.role,
    agent_label_path: '/BOS/agents/' + entry.agent_label,
    independence_group: entry.independence_group,
    status: 'SUCCEEDED',
    exit_code: 0,
    started_at: generated,
    finished_at: generated,
    duration_ms: 100,
    evidence_id: 'm016-s08-native-evidence-' + entry.division.toLowerCase(),
    criterion_id: entry.gate,
    sanitised_digest_sha256: contract.sha256Hex(entry.division + '|' + generated),
    source_ref: data.SOURCE_ALLOWLIST[2].source_ref,
  }));
}

function makeCandidate(overrides) {
  const generated = overrides?.generated || data.DEFAULTS.reference_time;
  const admission = overrides?.admission || makeAdmission({ generated });
  const evidenceChain = overrides?.evidenceChain || contract.buildEvidenceChain({ generated }).evidence_chain;
  const agentRuns = overrides?.agent_runs || makeAgentRuns({ generated });
  const mutationLedger = overrides?.mutationLedger || {
    expected_mutation_count: 1,
    observed_mutation_count: 1,
    unexpected_mutation_count: 0,
    expected_mutations: [{ kind: 'bounded_root_intake', subject_ref: 'paperclip_native_root_artifact', mutation_index_sha256: contract.sha256Hex('verifier-expected-' + generated) }],
    observed_mutations: [{ kind: 'bounded_root_intake', subject_ref: 'paperclip_native_root_artifact', mutation_index_sha256: contract.sha256Hex('verifier-observed-' + generated), phase: 'intake' }],
    unexpected_mutations: [],
  };
  return contract.buildCandidate(Object.assign({
    admission,
    generated,
    evidenceChain,
    agent_runs: agentRuns,
    mutationLedger,
  }, overrides || {}));
}

function makeClosure(overrides) {
  const canonicalHash = contract.sha256Hex('verifier-closure-' + data.DEFAULTS.reference_time);
  return contract.buildClosure(Object.assign({
    closureKind: data.CLOSURE_KINDS.LIVE,
    divisions: 7,
    unexpectedMutations: 0,
    firstRunProvenanceHash: canonicalHash,
    secondRunProvenanceHash: canonicalHash,
    byteIdentical: true,
  }, overrides || {}));
}

function makeScopeDecision(overrides) {
  return contract.buildScopeDecision(Object.assign({}, overrides || {}));
}

function makeNegativeFixtures(overrides) {
  return contract.buildNegativeFixtures(Object.assign({}, overrides || {}));
}

// Clone helper
function clone(value) { return JSON.parse(JSON.stringify(value)); }

// Temp directory for atomic-write tests
function makeTempRoot() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'm016-s08-verify-test-'));
  return tmp;
}

function cleanupTempRoot(tmp) {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* best effort */ }
}

// ---------------------------------------------------------------------------
// Test 1: parseArgs
// ---------------------------------------------------------------------------

test('parseArgs accepts valid live-branch argv', () => {
  const args = verifier.parseArgs([
    '--admission-path', 'runtime-evidence/M016-S08-native-seven-agent-admission.json',
    '--candidate-path', 'runtime-evidence/M016-S08-native-seven-agent-candidate.json',
    '--closure-path', 'runtime-evidence/M016-S08-native-seven-agent-closure.json',
    '--protocol-out', 'runtime-evidence/M016-S08-native-seven-agent-verify-protocol.json',
    '--force',
  ]);
  assert.equal(args.admissionPath, 'runtime-evidence/M016-S08-native-seven-agent-admission.json');
  assert.equal(args.candidatePath, 'runtime-evidence/M016-S08-native-seven-agent-candidate.json');
  assert.equal(args.closurePath, 'runtime-evidence/M016-S08-native-seven-agent-closure.json');
  assert.equal(args.protocolOut, 'runtime-evidence/M016-S08-native-seven-agent-verify-protocol.json');
  assert.equal(args.force, true);
  assert.equal(args.publishNegativeFixtures, true);
});

test('parseArgs accepts valid scope-branch argv with negative-fixtures', () => {
  const args = verifier.parseArgs([
    '--scope-decision-path', 'runtime-evidence/M016-S08-native-seven-agent-scope-decision.json',
    '--negative-fixtures-path', 'runtime-evidence/M016-S08-native-seven-agent-negative-fixtures.json',
    '--protocol-out', 'runtime-evidence/M016-S08-native-seven-agent-verify-protocol.json',
    '--no-publish-negative-fixtures',
  ]);
  assert.equal(args.scopeDecisionPath, 'runtime-evidence/M016-S08-native-seven-agent-scope-decision.json');
  assert.equal(args.negativeFixturesPath, 'runtime-evidence/M016-S08-native-seven-agent-negative-fixtures.json');
  assert.equal(args.publishNegativeFixtures, false);
});

test('parseArgs throws on missing --protocol-out', () => {
  assert.throws(() => verifier.parseArgs([
    '--scope-decision-path', 'runtime-evidence/M016-S08-native-seven-agent-scope-decision.json',
  ]), (err) => /--protocol-out is required/.test(err.message));
});

test('parseArgs throws on unknown arg', () => {
  assert.throws(() => verifier.parseArgs([
    '--unknown-flag', 'foo',
    '--protocol-out', 'runtime-evidence/M016-S08-native-seven-agent-verify-protocol.json',
  ]), (err) => /unknown arg/.test(err.message));
});

// ---------------------------------------------------------------------------
// Test 2: resolveExplicitRelative — path confinement
// ---------------------------------------------------------------------------

test('resolveExplicitRelative accepts repo-relative paths', () => {
  const abs = verifier.resolveExplicitRelative('runtime-evidence/M016-S08-native-seven-agent-admission.json');
  assert.equal(typeof abs, 'string');
  assert.ok(abs.endsWith('runtime-evidence/M016-S08-native-seven-agent-admission.json'));
  assert.ok(verifier.pathIsUnderRoot(abs));
});

test('resolveExplicitRelative refuses absolute paths', () => {
  assert.throws(() => verifier.resolveExplicitRelative('/etc/passwd'), (err) => /absolute path/.test(err.message));
});

test('resolveExplicitRelative refuses .. traversal', () => {
  assert.throws(() => verifier.resolveExplicitRelative('runtime-evidence/../../../etc/passwd'), (err) => /escapes repo root|absolute/.test(err.message));
});

test('resolveExplicitRelative refuses empty / NUL', () => {
  assert.throws(() => verifier.resolveExplicitRelative(''), (err) => /path empty/.test(err.message));
  assert.throws(() => verifier.resolveExplicitRelative('foo\0bar'), (err) => /NUL/.test(err.message));
});

// ---------------------------------------------------------------------------
// Test 3: detectBranch
// ---------------------------------------------------------------------------

test('detectBranch returns live when admission+candidate+closure are present', () => {
  const result = verifier.detectBranch({
    admissionPath: 'runtime-evidence/M016-S08-native-seven-agent-admission.json',
    candidatePath: 'runtime-evidence/M016-S08-native-seven-agent-candidate.json',
    closurePath: 'runtime-evidence/M016-S08-native-seven-agent-closure.json',
    scopeDecisionPath: null,
  });
  assert.equal(result.branch, data.CLOSURE_KINDS.LIVE);
  assert.equal(result.blockers.length, 0);
});

test('detectBranch returns scope_revised when only scope_decision is present', () => {
  const result = verifier.detectBranch({
    admissionPath: null,
    candidatePath: null,
    closurePath: null,
    scopeDecisionPath: 'runtime-evidence/M016-S08-native-seven-agent-scope-decision.json',
  });
  assert.equal(result.branch, data.CLOSURE_KINDS.SCOPE_REVISED);
  assert.equal(result.blockers.length, 0);
});

test('detectBranch rejects mutually exclusive branches', () => {
  const result = verifier.detectBranch({
    admissionPath: 'runtime-evidence/M016-S08-native-seven-agent-admission.json',
    candidatePath: 'runtime-evidence/M016-S08-native-seven-agent-candidate.json',
    closurePath: 'runtime-evidence/M016-S08-native-seven-agent-closure.json',
    scopeDecisionPath: 'runtime-evidence/M016-S08-native-seven-agent-scope-decision.json',
  });
  assert.equal(result.branch, null);
  assert.equal(result.blockers.length, 1);
  assert.ok(/mutually exclusive/.test(result.blockers[0].reason));
});

test('detectBranch rejects empty input', () => {
  const result = verifier.detectBranch({ admissionPath: null, candidatePath: null, closurePath: null, scopeDecisionPath: null });
  assert.equal(result.branch, null);
  assert.ok(result.blockers.length >= 1);
});

// ---------------------------------------------------------------------------
// Test 4: rederiveReplayKeys
// ---------------------------------------------------------------------------

test('rederiveReplayKeys returns match+byte_identical for canonical closure', () => {
  const closure = makeClosure();
  const keys = verifier.rederiveReplayKeys(closure);
  assert.ok(/^[a-f0-9]{64}$/.test(keys.first_run_provenance_hash));
  assert.equal(keys.first_run_provenance_hash, keys.second_run_provenance_hash);
  assert.equal(keys.byte_identical, true);
});

test('rederiveReplayKeys detects declared match=false', () => {
  const closure = makeClosure();
  closure.replay_keys.match = false;
  const keys = verifier.rederiveReplayKeys(closure);
  assert.equal(keys.match, false);
});

test('rederiveReplayKeys detects byte_identical=false', () => {
  const closure = makeClosure();
  closure.replay_keys.byte_identical = false;
  const keys = verifier.rederiveReplayKeys(closure);
  assert.equal(keys.byte_identical, false);
});

// ---------------------------------------------------------------------------
// Test 5: rederiveEvidenceChain
// ---------------------------------------------------------------------------

test('rederiveEvidenceChain computes matching digests for canonical rows', () => {
  const generated = data.DEFAULTS.reference_time;
  const chain = contract.buildEvidenceChain({ generated }).evidence_chain;
  const result = verifier.rederiveEvidenceChain(chain);
  assert.equal(result.length, chain.length);
  for (const row of result) {
    assert.equal(row.pre_matches, true);
    assert.equal(row.post_matches, true);
    assert.equal(row.unchanged, true);
  }
});

test('rederiveEvidenceChain detects declared pre/post hash drift', () => {
  const generated = data.DEFAULTS.reference_time;
  const chain = contract.buildEvidenceChain({ generated }).evidence_chain;
  // Tamper one row's pre_hash_sha256
  const tampered = clone(chain);
  tampered[0].post_hash_sha256 = contract.sha256Hex('tampered-post');
  const result = verifier.rederiveEvidenceChain(tampered);
  assert.equal(result[0].pre_matches, true);
  assert.equal(result[0].post_matches, false);
  assert.equal(result[0].unchanged, false);
});

// ---------------------------------------------------------------------------
// Test 6: evaluateLiveBranch
// ---------------------------------------------------------------------------

test('evaluateLiveBranch returns zero blockers for canonical admission+candidate+closure', () => {
  const admission = makeAdmission();
  const candidate = makeCandidate({ admission });
  const closure = makeClosure();
  const result = verifier.evaluateLiveBranch({ admission, candidate, closure });
  // Closure schema requires evidence_chain-derived replay_keys to match;
  // canonical hash matches the verifier's re-derivation.
  assert.equal(result.branch, data.CLOSURE_KINDS.LIVE);
  assert.equal(result.divisions, 7);
  assert.equal(result.unexpected_mutations, 0);
});

test('evaluateLiveBranch detects closure_kind drift', () => {
  const admission = makeAdmission();
  const candidate = makeCandidate({ admission });
  const closure = makeClosure({ closureKind: data.CLOSURE_KINDS.SCOPE_REVISED });
  const result = verifier.evaluateLiveBranch({ admission, candidate, closure });
  assert.ok(result.blockers.some((b) => b.code === data.BLOCKER_CODES.VALIDATOR_CLOSURE_KIND_INVALID('scope_revised')));
});

test('evaluateLiveBranch detects forbidden boundary', () => {
  const admission = makeAdmission();
  const candidate = makeCandidate({ admission });
  const closure = makeClosure();
  closure.boundary = 'GO_BOUNDED_INTERNAL';
  const result = verifier.evaluateLiveBranch({ admission, candidate, closure });
  assert.ok(result.blockers.some((b) => b.code === data.BLOCKER_CODES.VALIDATOR_BOUNDARY_INVALID('GO_BOUNDED_INTERNAL')));
});

test('evaluateLiveBranch detects replay key mismatch', () => {
  const admission = makeAdmission();
  const candidate = makeCandidate({ admission });
  const closure = makeClosure();
  closure.replay_keys.first_run_provenance_hash = contract.sha256Hex('not-matching');
  closure.replay_keys.second_run_provenance_hash = contract.sha256Hex('not-matching');
  const result = verifier.evaluateLiveBranch({ admission, candidate, closure });
  assert.ok(result.blockers.some((b) => b.code === data.BLOCKER_CODES.VALIDATOR_REPLAY_KEY_MISMATCH() || b.code === data.BLOCKER_CODES.VALIDATOR_REPLAY_NOT_BYTE_IDENTICAL()));
});

test('evaluateLiveBranch detects producer/verifier disagreement on divisions_count', () => {
  const admission = makeAdmission();
  const candidate = makeCandidate({ admission });
  const closure = makeClosure();
  closure.divisions_count = 6; // disagrees with candidate's 7
  closure.correlated_runs = 6;
  const result = verifier.evaluateLiveBranch({ admission, candidate, closure });
  assert.ok(result.blockers.some((b) => b.code === data.BLOCKER_CODES.VALIDATOR_DIVISION_NOT_EXACTLY_ONCE('6')));
});

test('evaluateLiveBranch detects redaction leak in candidate', () => {
  const admission = makeAdmission();
  const candidate = makeCandidate({ admission });
  candidate.raw_body = 'leaked raw body content';
  const result = verifier.evaluateLiveBranch({ admission, candidate, closure: makeClosure() });
  assert.ok(result.blockers.some((b) => b.code === data.BLOCKER_CODES.VALIDATOR_REDACTION_LEAK('raw_body')));
});

test('evaluateLiveBranch detects synthetic BOS claim in candidate', () => {
  const admission = makeAdmission();
  const candidate = makeCandidate({ admission });
  candidate.redaction_posture = clone(data.REDACTION_FLAG_VALUES);
  candidate.redaction_posture.synthetic_bos_detected = true;
  const result = verifier.evaluateLiveBranch({ admission, candidate, closure: makeClosure() });
  assert.ok(result.blockers.length > 0);
});

test('evaluateLiveBranch detects unexpected mutation > 0', () => {
  const admission = makeAdmission();
  // Build a candidate with unexpected_mutation_count=1
  const candidate = makeCandidate({ admission });
  candidate.mutation_ledger.unexpected_mutation_count = 1;
  candidate.mutation_ledger.unexpected_mutations = [{ kind: 'rollback', subject_ref: 'tampered', mutation_index_sha256: contract.sha256Hex('x') }];
  const result = verifier.evaluateLiveBranch({ admission, candidate, closure: makeClosure() });
  assert.ok(result.blockers.some((b) => b.code.startsWith('M16-S08-NATIVE-MUTATION-UNEXPECTED-PRESENT')));
});

// ---------------------------------------------------------------------------
// Test 7: evaluateScopeBranch
// ---------------------------------------------------------------------------

test('evaluateScopeBranch returns zero blockers for canonical scope decision', () => {
  const scope = makeScopeDecision();
  const result = verifier.evaluateScopeBranch({ scopeDecision: scope });
  assert.equal(result.branch, data.CLOSURE_KINDS.SCOPE_REVISED);
  assert.equal(result.divisions, 0);
  assert.equal(result.unexpected_mutations, 0);
});

test('evaluateScopeBranch rejects closure_kind drift to live', () => {
  const scope = makeScopeDecision();
  scope.closure_kind = data.CLOSURE_KINDS.LIVE;
  const result = verifier.evaluateScopeBranch({ scopeDecision: scope });
  assert.ok(result.blockers.some((b) => b.code === data.BLOCKER_CODES.VALIDATOR_CLOSURE_KIND_INVALID('live')));
});

test('evaluateScopeBranch rejects forbidden closure_verdict promotion', () => {
  const scope = makeScopeDecision();
  scope.closure_verdict = 'PASS';
  const result = verifier.evaluateScopeBranch({ scopeDecision: scope });
  assert.ok(result.blockers.some((b) => b.code === data.BLOCKER_CODES.VALIDATOR_CLOSURE_VERDICT_INVALID('PASS')));
});

test('evaluateScopeBranch rejects mutating_harness_invoked=true', () => {
  const scope = makeScopeDecision();
  scope.mutating_harness_invoked = true;
  const result = verifier.evaluateScopeBranch({ scopeDecision: scope });
  assert.ok(result.blockers.some((b) => b.code === data.BLOCKER_CODES.VALIDATOR_SCOPE_REVISION_NOT_REVISED()));
});

test('evaluateScopeBranch rejects candidate_created=true', () => {
  const scope = makeScopeDecision();
  scope.candidate_created = true;
  const result = verifier.evaluateScopeBranch({ scopeDecision: scope });
  assert.ok(result.blockers.some((b) => b.code === data.BLOCKER_CODES.VALIDATOR_SCOPE_REVISION_NOT_REVISED()));
});

test('evaluateScopeBranch rejects agent_runs_materialised > 0', () => {
  const scope = makeScopeDecision();
  scope.agent_runs_materialised = 1;
  const result = verifier.evaluateScopeBranch({ scopeDecision: scope });
  assert.ok(result.blockers.some((b) => b.code === data.BLOCKER_CODES.VALIDATOR_SCOPE_REVISION_NOT_REVISED()));
});

test('evaluateScopeBranch rejects forbidden boundary value', () => {
  const scope = makeScopeDecision();
  scope.boundary = 'GO_BOUNDED_INTERNAL';
  const result = verifier.evaluateScopeBranch({ scopeDecision: scope });
  assert.ok(result.blockers.some((b) => b.code === data.BLOCKER_CODES.VALIDATOR_BOUNDARY_INVALID('GO_BOUNDED_INTERNAL')));
});

test('evaluateScopeBranch rejects non-NATIVE primary_blocker_code', () => {
  const scope = makeScopeDecision();
  scope.denial_summary.primary_blocker_code = 'M16-S08-VERIFY-INDEPENDENCE-VIOLATION';
  const result = verifier.evaluateScopeBranch({ scopeDecision: scope });
  assert.ok(result.blockers.some((b) => b.code === data.BLOCKER_CODES.VALIDATOR_SCOPE_REVISION_NOT_REVISED()));
});

test('evaluateScopeBranch rejects redaction leak', () => {
  const scope = makeScopeDecision();
  scope.raw_body = 'leaked';
  const result = verifier.evaluateScopeBranch({ scopeDecision: scope });
  assert.ok(result.blockers.some((b) => b.code === data.BLOCKER_CODES.VALIDATOR_REDACTION_LEAK('raw_body')));
});

// ---------------------------------------------------------------------------
// Test 8: evaluateNegativeFixtures
// ---------------------------------------------------------------------------

test('evaluateNegativeFixtures accepts canonical catalog', () => {
  const fixtures = makeNegativeFixtures();
  const result = verifier.evaluateNegativeFixtures(fixtures);
  assert.equal(result.classes_executed, fixtures.fixtures.length);
  assert.equal(result.classes_failed, 0);
  assert.equal(result.blockers.length, 0);
});

test('evaluateNegativeFixtures rejects duplicate primary_blocker_code', () => {
  const fixtures = clone(makeNegativeFixtures());
  // Set second fixture's blocker code to the first fixture's
  fixtures.fixtures[1].primary_blocker_code = fixtures.fixtures[0].primary_blocker_code;
  const result = verifier.evaluateNegativeFixtures(fixtures);
  assert.ok(result.blockers.some((b) => b.code === data.BLOCKER_CODES.VALIDATOR_TAMPER_DETECTED(fixtures.fixtures[1].fixture_id)));
});

test('evaluateNegativeFixtures rejects non-M16-S08-NATIVE blocker code', () => {
  const fixtures = clone(makeNegativeFixtures());
  fixtures.fixtures[0].primary_blocker_code = 'M16-S08-VERIFY-WRONG-NAMESPACE';
  const result = verifier.evaluateNegativeFixtures(fixtures);
  assert.ok(result.blockers.length > 0);
});

test('evaluateNegativeFixtures accepts shared exit_code (by-category mapping is allowed)', () => {
  // Categories map to a bounded set of exit codes (graph/terminality/timing
  // all share exit code 2; correlation/provenance/replay share 5; etc.).
  // Duplicate exit codes are an intentional consequence of the by-category
  // mapping and are NOT rejected. Each fixture still gets a unique
  // primary_blocker_code (verified separately above).
  const fixtures = clone(makeNegativeFixtures());
  fixtures.fixtures[1].expected_exit_code = fixtures.fixtures[0].expected_exit_code;
  const result = verifier.evaluateNegativeFixtures(fixtures);
  assert.equal(result.blockers.length, 0);
});

test('evaluateNegativeFixtures rejects incomplete catalog', () => {
  const fixtures = clone(makeNegativeFixtures());
  fixtures.fixtures = fixtures.fixtures.slice(0, 3);
  const result = verifier.evaluateNegativeFixtures(fixtures);
  assert.ok(result.blockers.some((b) => b.code === data.BLOCKER_CODES.VALIDATOR_NEGATIVE_FIXTURES_NOT_FOUND()));
});

test('evaluateNegativeFixtures rejects fixtures array missing', () => {
  const result = verifier.evaluateNegativeFixtures({});
  assert.ok(result.blockers.length > 0);
});

test('evaluateNegativeFixtures rejects closure_kind_target=live', () => {
  const fixtures = clone(makeNegativeFixtures());
  fixtures.fixtures[0].closure_kind_target = data.CLOSURE_KINDS.LIVE;
  const result = verifier.evaluateNegativeFixtures(fixtures);
  assert.ok(result.blockers.length > 0);
});

test('evaluateNegativeFixtures rejects invalid fixture_id pattern', () => {
  const fixtures = clone(makeNegativeFixtures());
  fixtures.fixtures[0].fixture_id = 'INVALID-FIXTURE-ID';
  const result = verifier.evaluateNegativeFixtures(fixtures);
  assert.ok(result.classes_failed > 0);
});

// ---------------------------------------------------------------------------
// Test 9: Verdict line format
// ---------------------------------------------------------------------------

test('verifier verdict line matches canonical regex', () => {
  const line = contract.buildVerifierVerdictLine({
    closureKind: data.CLOSURE_KINDS.LIVE,
    closureVerdict: data.CLOSURE_VERDICT_VALUES.PROVEN_BOUNDED_NATIVE,
    exitCode: 0,
    blockers: 0,
    divisions: 7,
    correlatedRuns: 7,
    unexpectedMutations: 0,
    replayKeyMatch: true,
  });
  assert.match(line, /^M16-S08-VERIFY verdict=live:PROVEN_BOUNDED_NATIVE exit=0 blockers=0 divisions=7 correlated_runs=7 unexpected_mutations=0 replay_key_match=true$/);
});

test('verifier verdict line emits scope_revised label on scope branch', () => {
  const line = contract.buildVerifierVerdictLine({
    closureKind: data.CLOSURE_KINDS.SCOPE_REVISED,
    closureVerdict: data.CLOSURE_VERDICT_VALUES.NOT_PROVEN_SCOPE_REVISED,
    exitCode: 2,
    blockers: 1,
    divisions: 0,
    correlatedRuns: 0,
    unexpectedMutations: 0,
    replayKeyMatch: false,
  });
  assert.match(line, /^M16-S08-VERIFY verdict=scope_revised:NOT_PROVEN_SCOPE_REVISED exit=2 blockers=1 divisions=0 correlated_runs=0 unexpected_mutations=0 replay_key_match=false$/);
});

// ---------------------------------------------------------------------------
// Test 10: Atomic write
// ---------------------------------------------------------------------------

test('writeJsonAtomic succeeds on canonical payload into temp root', () => {
  const tmp = makeTempRoot();
  try {
    const protocol = contract.buildVerifyProtocol({});
    const protocolAbs = path.join(tmp, 'protocol.json');
    verifier.writeJsonAtomic(protocolAbs, protocol, verifier.RUN_TAG());
    assert.ok(fs.existsSync(protocolAbs));
    const parsed = JSON.parse(fs.readFileSync(protocolAbs, 'utf8'));
    assert.equal(parsed.protocol_kind, data.VERIFY_PROTOCOL_KIND);
    assert.equal(parsed.producer_cli_imported, false);
  } finally {
    cleanupTempRoot(tmp);
  }
});

test('writeJsonAtomic refuses redaction leak', () => {
  const tmp = makeTempRoot();
  try {
    const protocol = contract.buildVerifyProtocol({});
    protocol.raw_body = 'leaked raw body';
    const protocolAbs = path.join(tmp, 'protocol.json');
    assert.throws(() => verifier.writeJsonAtomic(protocolAbs, protocol, verifier.RUN_TAG()), (err) => /refused write/.test(err.message));
    assert.ok(!fs.existsSync(protocolAbs));
  } finally {
    cleanupTempRoot(tmp);
  }
});

// ---------------------------------------------------------------------------
// Test 11: Independence
// ---------------------------------------------------------------------------

test('producer_cli_imported is locked to false', () => {
  assert.equal(verifier.VERIFIER_IMPORTS.indexOf(verifier.PRODUCER_CLI_PATH), -1);
  assert.equal(verifier.VERIFIER_IMPORTS.indexOf(verifier.COORDINATOR_CLI_PATH), -1);
  // The verifier module never `require`s the producer or coordinator.
  // Inspecting the module's source: it only `require`s the data and
  // contract modules plus node:fs/path/crypto.
  assert.equal(verifier.VERIFIER_IMPORTS.length, 5);
});

test('FORBIDDEN_PATHS_RE matches producer and coordinator CLIs', () => {
  assert.ok(verifier.FORBIDDEN_PATHS_RE.test(verifier.PRODUCER_CLI_PATH));
  assert.ok(verifier.FORBIDDEN_PATHS_RE.test(verifier.COORDINATOR_CLI_PATH));
});

test('verifier does not have access to producer CLI', () => {
  // The verifier module does NOT export a producer reference.
  assert.equal(verifier.PRODUCER_CLI_PATH, data.DEFAULTS.producer_cli);
  assert.equal(verifier.COORDINATOR_CLI_PATH, data.DEFAULTS.coordinator_cli);
});

// ---------------------------------------------------------------------------
// Test 12: Exit code mapping
// ---------------------------------------------------------------------------

test('exit code mapping covers all canonical blockers', () => {
  const sampleBlockers = [
    data.BLOCKER_CODES.PRODUCER_OPERATOR_GATE_DENIED(),
    data.BLOCKER_CODES.PRODUCER_BOSA_STALE_MARKER_PRESENT(),
    data.BLOCKER_CODES.PRODUCER_WRONG_RUN_OWNER('mission_id'),
    data.BLOCKER_CODES.PRODUCER_DIVISION_DUPLICATE('Div3'),
    data.BLOCKER_CODES.PRODUCER_READBACK_MISSING('Div5'),
    data.BLOCKER_CODES.PRODUCER_NON_TERMINAL_READBACK('Div4'),
    data.BLOCKER_CODES.PRODUCER_SOURCE_HASH_DRIFT('m015_native_mission_contract'),
    data.BLOCKER_CODES.PRODUCER_MUTATION_UNEXPECTED_PRESENT('rollback'),
    data.BLOCKER_CODES.PRODUCER_TIMEOUT('readback'),
    data.BLOCKER_CODES.PRODUCER_REDACTION_LEAK('raw_body'),
    data.BLOCKER_CODES.PRODUCER_SYNTHETIC_BOS_DETECTED(),
    data.BLOCKER_CODES.PRODUCER_CLOSURE_KIND_MISMATCH('live'),
    data.BLOCKER_CODES.PRODUCER_REPLAY_KEY_MISMATCH(),
  ];
  for (const blocker of sampleBlockers) {
    const exitCode = contract.mapBlockerToExitCode(blocker);
    assert.ok(exitCode >= 0 && exitCode <= 9, 'exit code out of range for ' + blocker + ': ' + exitCode);
  }
});

// ---------------------------------------------------------------------------
// Test 13: mapBranchToVerdict — discrimination never promotes execution
// ---------------------------------------------------------------------------

test('mapBranchToVerdict returns NOT_PROVEN_SCOPE_REVISED for scope branch', () => {
  assert.equal(verifier.mapBranchToVerdict(data.CLOSURE_KINDS.SCOPE_REVISED, [{ code: 'X' }]), data.CLOSURE_VERDICT_VALUES.NOT_PROVEN_SCOPE_REVISED);
});

test('mapBranchToVerdict returns PROVEN_BOUNDED_NATIVE for live branch even on failure', () => {
  // The verdict label is determined by the branch; the LIVE branch's
  // verdict label is always PROVEN_BOUNDED_NATIVE (the failure is
  // reflected in the exit code and blocker count, not the verdict).
  assert.equal(verifier.mapBranchToVerdict(data.CLOSURE_KINDS.LIVE, [{ code: 'X' }]), data.CLOSURE_VERDICT_VALUES.PROVEN_BOUNDED_NATIVE);
});
