#!/usr/bin/env node
'use strict';
/**
 * scripts/test_m016_s10_acceptance_contract.js
 *
 * M016-txa3vu / S10 / T01 — Contract tests for the frozen acceptance
 * model + source registry + pure builders.
 *
 * Coverage scope:
 *   1. Schema + namespace invariants
 *   2. Acceptance sections invariant (exactly 6, immutable order)
 *   3. Source allowlist invariant (exactly 15, REF aliases match)
 *   4. Verdict values vocabulary + forbidden tokens
 *   5. R041 structural components (3) + forbidden overclaim
 *   6. Milestone criterion (6 verbatim bullets, strict_value, evidence_ref)
 *   7. S05 verdict reconciliation (producer/verifier/S06/S09/frozen)
 *   8. S08 frozen posture (closure_kind/verdict/boundary preservation)
 *   9. Launch posture frozen (orchestration/evidence/launch/bounded_internal)
 *  10. NOT_PROVEN preservation invariant (preserved_ids superset check)
 *  11. Blocker codes namespace + factory shape
 *  12. Exit codes + mapping
 *  13. CLI health lines (BUILD + ACCEPTANCE) format + digest
 *  14. Pure builders (buildR041Acceptance, buildMilestoneCriterion,
 *      buildS05CanonicalVerdicts, buildS08ScopeDecision,
 *      buildNotProvenPreservation, buildCanonicalAcceptanceOutcome,
 *      buildAcceptanceModel)
 *  15. evaluateAcceptance — positive path
 *  16. evaluateAcceptance — negative tamper matrix (8 categories)
 *  17. computeAcceptanceDigest determinism (byte-stable)
 *  18. Redaction safety (FORBIDDEN_KEYS, FLAG_KEYS, REDACTION_PATTERNS)
 *  19. assertWriteSafe fail-closed
 *  20. Loader basics — readSource with non-allowlisted ref → status
 *  21. Negative fixture taxonomy (exactly 8, all categories referenced)
 *  22. Module export surface (frozen + complete)
 *
 * The tests are pure (no fs / network / subprocesses for the contract
 * portion; loader tests use only project-internal paths) so they can
 * run under `node --test` without side effects beyond the project's
 * own runtime-evidence/ directory.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const contract = require('./lib/m016-s10-acceptance-contract.js');
const loader = require('./lib/m016-s10-canonical-reference-loader.js');

// ===========================================================================
// 1. SCHEMA + NAMESPACE INVARIANTS
// ===========================================================================
test('schema + namespace invariants', () => {
  assert.equal(typeof contract.SCHEMA_ID, 'string');
  assert.match(contract.SCHEMA_ID, /^https:\/\/gsd\.local\/schemas\//);
  assert.equal(contract.SCHEMA_VERSION, 'v1');
  assert.equal(contract.SCHEMA_NAMESPACE, 'm016-s10-seven-division-acceptance-contract-v1');
  assert.equal(contract.MILESTONE, 'M016-txa3vu');
  assert.equal(contract.SLICE, 'S10');
  assert.equal(contract.TASK, 'T01');
  assert.deepEqual([...contract.TASK_IDS], ['T01', 'T02', 'T03', 'T04']);
  assert.equal(contract.ACCEPTANCE_CONTRACT_ID, 'm016-s10-seven-division-acceptance-contract-v1');
  assert.equal(contract.ACCEPTANCE_CONTRACT_KIND, 'seven-division-acceptance-contract');
  assert.equal(contract.NAMESPACE, 'M16-S10');
  assert.equal(contract.BUILDER_LINE_CLASS, 'M16-S10-BUILD');
  assert.equal(contract.VERIFIER_LINE_CLASS, 'M16-S10-ACCEPTANCE');
  assert.equal(contract.BUILDER_CANONICAL_PROTOCOL, 'PROTOCOL-M16-S10-SEVEN-DIVISION-ACCEPTANCE-BUILD-V1');
  assert.equal(contract.VERIFIER_CANONICAL_PROTOCOL, 'PROTOCOL-M16-S10-SEVEN-DIVISION-ACCEPTANCE-VERIFY-V1');
  assert.equal(contract.BLOCKER_NAMESPACE, 'M16-S10-ACCEPTANCE');
  // BLOCKER_CODE_PATTERN is exported as a regex SOURCE string (starts with '^').
  assert.match(contract.BLOCKER_CODE_PATTERN, /\^M16-S10-ACCEPTANCE/);
  assert.ok(contract.isAcceptanceBlockerCode('M16-S10-ACCEPTANCE-FOO'));
  assert.equal(contract.isAcceptanceBlockerCode('M16-S09-REVIEW-FOO'), false);
  assert.equal(contract.isAcceptanceBlockerCode(''), false);
  assert.equal(contract.isAcceptanceBlockerCode(null), false);
  assert.equal(contract.isAcceptanceBlockerCode(undefined), false);
  assert.equal(contract.isAcceptanceBlockerCode(42), false);
  // Reference time is ISO 8601.
  assert.match(contract.ACCEPTANCE_CONTRACT_REFERENCE_TIME, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
});

// ===========================================================================
// 2. ACCEPTANCE SECTIONS — exactly 6 in immutable order
// ===========================================================================
test('acceptance sections: exactly 6 in immutable order', () => {
  assert.equal(contract.ACCEPTANCE_SECTION_IDS.length, 6);
  assert.equal(contract.EXPECTED_SECTION_COUNT, 6);
  assert.deepEqual([...contract.ACCEPTANCE_SECTION_IDS], [
    'r041_acceptance',
    'milestone_criterion',
    's05_canonical_verdicts',
    's08_scope_decision',
    'not_proven_preservation',
    'canonical_acceptance_outcome',
  ]);
  for (const id of contract.ACCEPTANCE_SECTION_IDS) {
    assert.ok(contract.ACCEPTANCE_SECTION_SET.has(id), `${id} should be in set`);
    assert.equal(contract.isKnownAcceptanceSection(id), true);
    assert.equal(typeof contract.ACCEPTANCE_SECTION_LABELS_RU[id], 'string');
  }
  // Foreign ids rejected
  assert.equal(contract.isKnownAcceptanceSection('not_a_section'), false);
  assert.equal(contract.isKnownAcceptanceSection(''), false);
  assert.equal(contract.isKnownAcceptanceSection(undefined), false);
  assert.equal(contract.NOT_PROVEN_INVARIANT_ID, 'not_proven_preservation');
  // Frozen
  assert.ok(Object.isFrozen(contract.ACCEPTANCE_SECTION_IDS));
  assert.ok(Object.isFrozen(contract.ACCEPTANCE_SECTION_LABELS_RU));
});

// ===========================================================================
// 3. SOURCE_ALLOWLIST — exactly 15 + REF aliases match
// ===========================================================================
test('source allowlist: exactly 15 + REF aliases match', () => {
  assert.equal(contract.SOURCE_ALLOWLIST.length, 15);
  assert.equal(contract.EXPECTED_SOURCE_COUNT, 15);
  assert.equal(contract.SOURCE_ALLOWLIST_REFS.length, 15);
  // No duplicate source_refs
  const seen = new Set();
  for (const entry of contract.SOURCE_ALLOWLIST) {
    assert.equal(seen.has(entry.source_ref), false, `duplicate source_ref ${entry.source_ref}`);
    seen.add(entry.source_ref);
    // Every entry has required structural fields
    assert.equal(typeof entry.kind, 'string');
    assert.equal(typeof entry.chain_role, 'string');
    assert.equal(typeof entry.independence_group, 'string');
    assert.equal(typeof entry.review_section, 'string');
    assert.equal(entry.required, true);
    assert.ok(contract.ACCEPTANCE_SECTION_SET.has(entry.review_section),
      `source ${entry.source_ref} -> review_section ${entry.review_section} not in frozen sections`);
  }
  // Every REF alias must point to an allowlisted ref
  for (const key of Object.keys(contract.REF)) {
    assert.ok(contract.SOURCE_ALLOWLIST_SET.has(contract.REF[key]),
      `REF.${key} -> ${contract.REF[key]} not in allowlist`);
  }
  // getSourceEntry round-trips
  for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
    const entry = contract.getSourceEntry(ref);
    assert.ok(entry);
    assert.equal(entry.source_ref, ref);
  }
  // Negative
  assert.equal(contract.getSourceEntry('not-a-ref'), null);
  assert.equal(contract.getSourceEntry(''), null);
  assert.equal(contract.isAllowlistedSourceRef('runtime-evidence/NOT-EXIST.json'), false);
  // Safe-path regex rejects non-allowlisted patterns
  assert.match('runtime-evidence/M016-S05-seven-division-replay-bundle.json', contract.SAFE_PATH_RE);
  assert.match('.gsd/REQUIREMENTS.md', contract.SAFE_PATH_RE);
  assert.match('.gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/16-ROADMAP.md', contract.SAFE_PATH_RE);
  assert.match('runtime-evidence/M016-S09-HUMAN-REVIEW.md', contract.SAFE_PATH_RE);
  assert.equal(contract.SAFE_PATH_RE.test('.gsd/.planning/something.json'), false);
  assert.equal(contract.SAFE_PATH_RE.test('runtime-evidence/M016-S07-anything.json'), false);
  // Frozen
  assert.ok(Object.isFrozen(contract.SOURCE_ALLOWLIST));
  assert.ok(Object.isFrozen(contract.SOURCE_ALLOWLIST_REFS));
});

// ===========================================================================
// 4. VERDICT VALUES — vocabulary + forbidden
// ===========================================================================
test('verdict values: vocabulary + forbidden tokens', () => {
  assert.equal(contract.VERDICT_VALUES.PASS, 'PASS');
  assert.equal(contract.VERDICT_VALUES.PARTIAL, 'PARTIAL');
  assert.equal(contract.VERDICT_VALUES.NOT_PROVEN, 'NOT_PROVEN');
  assert.equal(contract.VERDICT_VALUES.NOT_PROVEN_SCOPE_REVISED, 'NOT_PROVEN_SCOPE_REVISED');
  assert.equal(contract.VERDICT_VALUES.NOT_PROVEN_MISSING_RESULT_JSON_BOS, 'NOT_PROVEN_MISSING_RESULT_JSON_BOS');
  assert.equal(contract.VERDICT_VALUES.PREPARATION_ONLY, 'PREPARATION_ONLY');
  assert.equal(contract.VERDICT_VALUES.GO_BOUNDED_INTERNAL, 'GO_BOUNDED_INTERNAL');
  assert.equal(contract.VERDICT_VALUES.ACCEPTANCE_RESOLVED, 'ACCEPTANCE_RESOLVED');
  assert.equal(contract.VERDICT_VALUES.ACCEPTANCE_BUILT, 'ACCEPTANCE_BUILT');
  // Boundary values
  assert.equal(contract.BOUNDARY_VALUES.PREPARATION_ONLY, 'PREPARATION_ONLY');
  assert.equal(contract.BOUNDARY_VALUES.GO_BOUNDED_INTERNAL, 'GO_BOUNDED_INTERNAL');
  // Validity helpers
  assert.ok(contract.isValidOrchestrationVerdict('PASS'));
  assert.ok(contract.isValidOrchestrationVerdict('PARTIAL'));
  assert.ok(contract.isValidOrchestrationVerdict('NOT_PROVEN'));
  assert.equal(contract.isValidOrchestrationVerdict('GO'), false);
  assert.ok(contract.isValidEvidenceVerdict('PASS'));
  assert.equal(contract.isValidEvidenceVerdict('NOT_PROVEN_SCOPE_REVISED'), false);
  assert.ok(contract.isValidLaunchVerdict('PREPARATION_ONLY'));
  assert.ok(contract.isValidLaunchVerdict('GO_BOUNDED_INTERNAL'));
  assert.ok(contract.isValidLaunchVerdict('NO_GO'));
  // Forbidden review verdicts
  for (const v of ['GO', 'READY', 'LAUNCH_GO', 'LAUNCH_READY', 'PASS_AUTOMATIC', 'VERIFIED_LIVE', 'PROVEN_BOUNDED_NATIVE']) {
    assert.equal(contract.isForbiddenAcceptanceVerdict(v), true, `${v} must be forbidden`);
  }
  assert.equal(contract.isForbiddenAcceptanceVerdict('PASS'), false);
  assert.equal(contract.isForbiddenAcceptanceVerdict(null), false);
  // Frozen
  assert.ok(Object.isFrozen(contract.VERDICT_VALUES));
  assert.ok(Object.isFrozen(contract.BOUNDARY_VALUES));
  assert.ok(Object.isFrozen(contract.FORBIDDEN_ACCEPTANCE_VERDICTS));
});

// ===========================================================================
// 5. R041 — structural components + forbidden overclaim
// ===========================================================================
test('R041: 3 structural components + forbidden satisfaction tokens', () => {
  assert.equal(contract.R041_STRUCTURAL_COMPONENTS.length, 3);
  assert.equal(contract.EXPECTED_R041_COMPONENT_COUNT, 3);
  assert.deepEqual([...contract.R041_STRUCTURAL_COMPONENTS].sort(), ['hard_gates', 'reproducible_worksheet', 'separate_verdicts']);
  for (const c of contract.R041_STRUCTURAL_COMPONENTS) {
    assert.ok(contract.isKnownR041Component(c));
  }
  assert.equal(contract.isKnownR041Component('unsupported_component'), false);
  assert.equal(contract.isKnownR041Component(''), false);
  // Forbidden satisfaction tokens
  for (const v of ['ACCEPTED', 'LAUNCH_READY', 'VERIFIED_LIVE', 'PROVEN_BOUNDED_NATIVE', 'GO_BOUNDED_INTERNAL']) {
    assert.equal(contract.isForbiddenR041Satisfaction(v), true, `${v} must be forbidden`);
  }
  assert.equal(contract.isForbiddenR041Satisfaction('STRUCTURAL_ONLY'), false);
  assert.equal(contract.isForbiddenR041Satisfaction(null), false);
  assert.ok(Object.isFrozen(contract.R041_STRUCTURAL_COMPONENTS));
  assert.ok(Object.isFrozen(contract.FORBIDDEN_R041_SATISFACTION));
});

// ===========================================================================
// 6. MILESTONE CRITERION — 6 verbatim bullets
// ===========================================================================
test('milestone criterion: exactly 6 verbatim bullets', () => {
  assert.equal(contract.MILESTONE_CRITERION_BULLETS.length, 6);
  assert.equal(contract.EXPECTED_MILESTONE_CRITERION_COUNT, 6);
  assert.equal(contract.MILESTONE_CRITERION_BULLET_IDS.length, 6);
  assert.deepEqual([...contract.MILESTONE_CRITERION_BULLET_IDS], ['MC1', 'MC2', 'MC3', 'MC4', 'MC5', 'MC6']);
  for (const id of contract.MILESTONE_CRITERION_BULLET_IDS) {
    assert.ok(contract.isKnownMilestoneBullet(id));
    const bullet = contract.MILESTONE_CRITERION_BULLETS.find((b) => b.bullet_id === id);
    assert.ok(bullet);
    assert.equal(typeof bullet.label, 'string');
    assert.ok(bullet.label.length > 20);
    assert.equal(typeof bullet.strict_value, 'string');
    assert.ok(contract.SOURCE_ALLOWLIST_SET.has(bullet.evidence_ref));
  }
  assert.equal(contract.isKnownMilestoneBullet('MC7'), false);
  assert.ok(Object.isFrozen(contract.MILESTONE_CRITERION_BULLETS));
  assert.ok(Object.isFrozen(contract.MILESTONE_CRITERION_BULLET_IDS));
});

// ===========================================================================
// 7. S05 VERDICT RECONCILIATION — producer/verifier/S06/S09/frozen
// ===========================================================================
test('S05 verdict reconciliation: producer/verifier/S06/S09/frozen alignment', () => {
  const r = contract.S05_VERDICT_RECONCILIATION;
  assert.equal(r.producer, contract.VERDICT_VALUES.PASS);
  assert.equal(r.verifier_protocol, contract.VERDICT_VALUES.NOT_PROVEN);
  assert.equal(r.s06, contract.VERDICT_VALUES.PARTIAL);
  assert.equal(r.s09_frozen, contract.VERDICT_VALUES.PARTIAL);
  assert.equal(r.frozen_reconciliation, contract.VERDICT_VALUES.PARTIAL);
  assert.equal(r.divergence_acknowledged, true);
  assert.ok(r.source_refs);
  assert.ok(contract.SOURCE_ALLOWLIST_SET.has(r.source_refs.bundle));
  assert.ok(contract.SOURCE_ALLOWLIST_SET.has(r.source_refs.worksheet));
  assert.ok(contract.SOURCE_ALLOWLIST_SET.has(r.source_refs.verify_protocol));
  assert.ok(Object.isFrozen(r));
  assert.ok(Object.isFrozen(r.source_refs));
});

// ===========================================================================
// 8. S08 FROZEN POSTURE — closure_kind/verdict/boundary preservation
// ===========================================================================
test('S08 frozen posture: closure_kind=scope_revised + boundary=PREPARATION_ONLY', () => {
  assert.equal(contract.S08_FROZEN_POSTURE.closure_kind, 'scope_revised');
  assert.equal(contract.S08_FROZEN_POSTURE.closure_verdict, contract.VERDICT_VALUES.NOT_PROVEN_SCOPE_REVISED);
  assert.equal(contract.S08_FROZEN_POSTURE.boundary, contract.BOUNDARY_VALUES.PREPARATION_ONLY);
  assert.equal(contract.S08_FROZEN_POSTURE.denial_summary_required, true);
  assert.equal(contract.S08_FROZEN_POSTURE.mutated_state_preserved, true);
  assert.equal(typeof contract.S08_FROZEN_POSTURE.primary_blocker_code, 'string');
  // Closure kind vocabulary
  assert.ok(contract.isKnownS08ClosureKind('scope_revised'));
  assert.ok(contract.isKnownS08ClosureKind('live'));
  assert.equal(contract.isKnownS08ClosureKind('proven'), false);
  assert.ok(Object.isFrozen(contract.S08_FROZEN_POSTURE));
});

// ===========================================================================
// 9. LAUNCH POSTURE — frozen orchestration/evidence/launch + bounded_internal
// ===========================================================================
test('launch posture: frozen orchestration=PARTIAL evidence=PARTIAL launch=PREPARATION_ONLY', () => {
  assert.equal(contract.FROZEN_LAUNCH_POSTURE.orchestration, contract.VERDICT_VALUES.PARTIAL);
  assert.equal(contract.FROZEN_LAUNCH_POSTURE.evidence, contract.VERDICT_VALUES.PARTIAL);
  assert.equal(contract.FROZEN_LAUNCH_POSTURE.launch, contract.VERDICT_VALUES.PREPARATION_ONLY);
  assert.equal(contract.FROZEN_LAUNCH_POSTURE.bounded_internal, true);
  assert.ok(Object.isFrozen(contract.FROZEN_LAUNCH_POSTURE));
});

// ===========================================================================
// 10. NOT_PROVEN PRESERVATION — preserved_ids superset invariant
// ===========================================================================
test('NOT_PROVEN preservation: preserved_ids set frozen', () => {
  assert.equal(contract.NOT_PROVEN_PRESERVED_IDS.length, 9);
  assert.equal(contract.EXPECTED_NOT_PROVEN_COUNT, 9);
  // No duplicates
  const seen = new Set();
  for (const id of contract.NOT_PROVEN_PRESERVED_IDS) {
    assert.equal(seen.has(id), false, `duplicate preserved_id ${id}`);
    seen.add(id);
    assert.ok(contract.isPreservedNotProvenId(id));
  }
  assert.equal(contract.isPreservedNotProvenId('UNKNOWN'), false);
  // MUST contain the named frozen anchors
  for (const required of ['NOT_PROVEN_SCOPE_REVISED', 'NOT_PROVEN_MISSING_RESULT_JSON_BOS', 'STAGE_B_ADAPTER_NATIVE_DEFERRED_UNVALIDATED', 'S08_OPERATOR_GATE_DENIED', 'S05_VERIFIER_NOT_PROVEN_DIVERGENCE_ACKNOWLEDGED']) {
    assert.ok(contract.isPreservedNotProvenId(required), `${required} must be preserved`);
  }
  assert.ok(Object.isFrozen(contract.NOT_PROVEN_PRESERVED_IDS));
});

// ===========================================================================
// 11. BLOCKER CODES — namespace + factory shape
// ===========================================================================
test('blocker codes: M16-S10-ACCEPTANCE-* factory shape', () => {
  assert.equal(typeof contract.BLOCKER_CODES.SOURCE_NOT_ALLOWLISTED('runtime-evidence/foo.json'), 'string');
  assert.match(contract.BLOCKER_CODES.SOURCE_NOT_ALLOWLISTED('runtime-evidence/foo.json'), /^M16-S10-ACCEPTANCE-SOURCE-NOT-ALLOWLISTED:/);
  assert.match(contract.BLOCKER_CODES.SOURCE_MISSING('foo.json'), /^M16-S10-ACCEPTANCE-SOURCE-MISSING:/);
  assert.match(contract.BLOCKER_CODES.PATH_TRAVERSAL('escape:foo'), /^M16-S10-ACCEPTANCE-PATH-TRAVERSAL:/);
  assert.match(contract.BLOCKER_CODES.REDACTION_LEAK('token_assignment'), /^M16-S10-ACCEPTANCE-REDACTION-LEAK:/);
  assert.match(contract.BLOCKER_CODES.R041_STRUCTURAL_MISSING('hard_gates'), /^M16-S10-ACCEPTANCE-R041-STRUCTURAL-MISSING:/);
  assert.match(contract.BLOCKER_CODES.R041_VERDICT_OVERCLAIM('ACCEPTED'), /^M16-S10-ACCEPTANCE-R041-VERDICT-OVERCLAIM:/);
  assert.match(contract.BLOCKER_CODES.S05_DIVERGENCE_PROMOTION('frozen_reconciliation-mismatch'), /^M16-S10-ACCEPTANCE-S05-DIVERGENCE-PROMOTION:/);
  assert.match(contract.BLOCKER_CODES.S08_PROMOTION_ATTEMPT('closure_kind-promotion'), /^M16-S10-ACCEPTANCE-S08-PROMOTION-ATTEMPT:/);
  assert.match(contract.BLOCKER_CODES.NOT_PROVEN_REMOVED('NOT_PROVEN_SCOPE_REVISED'), /^M16-S10-ACCEPTANCE-NOT-PROVEN-REMOVED:/);
  assert.match(contract.BLOCKER_CODES.LAUNCH_POSTURE_DRIFT('orchestration:NOT_PROVEN'), /^M16-S10-ACCEPTANCE-LAUNCH-POSTURE-DRIFT:/);
  assert.match(contract.BLOCKER_CODES.CAPABILITY_PROMOTION_LEAKED('bounded_internal-false'), /^M16-S10-ACCEPTANCE-CAPABILITY-PROMOTION-LEAKED:/);
  assert.match(contract.BLOCKER_CODES.SECTION_MISSING('count-5'), /^M16-S10-ACCEPTANCE-SECTION-MISSING:/);
  assert.match(contract.BLOCKER_CODES.VERDICT_FORBIDDEN('GO'), /^M16-S10-ACCEPTANCE-VERDICT-FORBIDDEN:/);
  assert.equal(contract.BLOCKER_CODES.RUNNER_FAILURE(), 'M16-S10-ACCEPTANCE-RUNNER-FAILURE');
  // All emitted codes pass isAcceptanceBlockerCode.
  const samples = [
    contract.BLOCKER_CODES.SOURCE_NOT_ALLOWLISTED('x'),
    contract.BLOCKER_CODES.SOURCE_MISSING('x'),
    contract.BLOCKER_CODES.PATH_TRAVERSAL('x'),
    contract.BLOCKER_CODES.REDACTION_LEAK('x'),
    contract.BLOCKER_CODES.R041_STRUCTURAL_MISSING('x'),
    contract.BLOCKER_CODES.R041_VERDICT_OVERCLAIM('x'),
    contract.BLOCKER_CODES.MILESTONE_CRITERION_DRIFT('x'),
    contract.BLOCKER_CODES.S05_DIVERGENCE_PROMOTION('x'),
    contract.BLOCKER_CODES.S05_VERIFIER_PROVENANCE_LOST('x'),
    contract.BLOCKER_CODES.S08_PROMOTION_ATTEMPT('x'),
    contract.BLOCKER_CODES.S08_CLOSURE_KIND_DRIFT('x'),
    contract.BLOCKER_CODES.NOT_PROVEN_REMOVED('x'),
    contract.BLOCKER_CODES.LAUNCH_POSTURE_DRIFT('x'),
    contract.BLOCKER_CODES.CAPABILITY_PROMOTION_LEAKED('x'),
    contract.BLOCKER_CODES.SECTION_MISSING('x'),
    contract.BLOCKER_CODES.VERDICT_FORBIDDEN('x'),
    contract.BLOCKER_CODES.HEALTHLINE_MISMATCH('x'),
    contract.BLOCKER_CODES.PRODUCER_CLI_INVOKED('x'),
    contract.BLOCKER_CODES.RUNNER_FAILURE(),
  ];
  for (const code of samples) assert.ok(contract.isAcceptanceBlockerCode(code), `${code} must be a valid blocker code`);
  assert.ok(Object.isFrozen(contract.BLOCKER_CODES));
});

// ===========================================================================
// 12. EXIT CODES — mapping
// ===========================================================================
test('exit codes: 0..9 + mapping helper', () => {
  assert.equal(contract.EXIT_CODES.PASS, 0);
  assert.equal(contract.EXIT_CODES.REJECTED_FAIL_CLOSED, 2);
  assert.equal(contract.EXIT_CODES.REPLAY_DRIFT, 3);
  assert.equal(contract.EXIT_CODES.SOURCE_HASH_DRIFT, 4);
  assert.equal(contract.EXIT_CODES.IDENTITY_DRIFT, 5);
  assert.equal(contract.EXIT_CODES.REDACTION_LEAK, 6);
  assert.equal(contract.EXIT_CODES.MUTATION_LEDGER_DRIFT, 7);
  assert.equal(contract.EXIT_CODES.CLOSURE_KIND_DRIFT, 8);
  assert.equal(contract.EXIT_CODES.RUNNER_FAILURE, 9);
  assert.equal(contract.mapBlockerToExitCode(contract.BLOCKER_CODES.SOURCE_NOT_ALLOWLISTED('x')), contract.EXIT_CODES.IDENTITY_DRIFT);
  assert.equal(contract.mapBlockerToExitCode(contract.BLOCKER_CODES.SOURCE_HASH_DRIFT('x')), contract.EXIT_CODES.REPLAY_DRIFT);
  assert.equal(contract.mapBlockerToExitCode(contract.BLOCKER_CODES.PATH_TRAVERSAL('x')), contract.EXIT_CODES.REJECTED_FAIL_CLOSED);
  assert.equal(contract.mapBlockerToExitCode(contract.BLOCKER_CODES.REDACTION_LEAK('x')), contract.EXIT_CODES.REDACTION_LEAK);
  assert.equal(contract.mapBlockerToExitCode(contract.BLOCKER_CODES.R041_STRUCTURAL_MISSING('x')), contract.EXIT_CODES.CLOSURE_KIND_DRIFT);
  assert.equal(contract.mapBlockerToExitCode(contract.BLOCKER_CODES.S08_PROMOTION_ATTEMPT('x')), contract.EXIT_CODES.CLOSURE_KIND_DRIFT);
  assert.equal(contract.mapBlockerToExitCode(contract.BLOCKER_CODES.LAUNCH_POSTURE_DRIFT('x')), contract.EXIT_CODES.CLOSURE_KIND_DRIFT);
  assert.equal(contract.mapBlockerToExitCode(contract.BLOCKER_CODES.NOT_PROVEN_REMOVED('x')), contract.EXIT_CODES.CLOSURE_KIND_DRIFT);
  assert.equal(contract.mapBlockerToExitCode(contract.BLOCKER_CODES.RUNNER_FAILURE()), contract.EXIT_CODES.RUNNER_FAILURE);
  assert.equal(contract.mapBlockerToExitCode(null), contract.EXIT_CODES.RUNNER_FAILURE);
  assert.ok(Object.isFrozen(contract.EXIT_CODES));
});

// ===========================================================================
// 13. CLI HEALTH LINES — BUILD + ACCEPTANCE format
// ===========================================================================
test('health lines: BUILD + ACCEPTANCE stable format', () => {
  const build = contract.buildHealthLineBuilder({
    exitCode: 0, blockCount: 0, criterionCount: 6, notProvenCount: 9, sourceCount: 15, sectionCount: 6, digest: 'abc123',
  });
  assert.match(build, /^M16-S10-BUILD verdict=ACCEPTANCE_BUILT exit=0 block_count=0 criterion_count=6 not_proven_count=9 source_count=15 section_count=6 digest=abc123$/);
  const accept = contract.buildHealthLineAcceptance({
    exitCode: 0, blockCount: 0, criterionCount: 6, notProvenCount: 9, sourceCount: 15, sectionCount: 6, digest: 'def456',
  });
  assert.match(accept, /^M16-S10-ACCEPTANCE verdict=ACCEPTANCE_RESOLVED exit=0 block_count=0 criterion_count=6 not_proven_count=9 source_count=15 section_count=6 digest=def456$/);
  // Default values
  const buildDefault = contract.buildHealthLineBuilder({ digest: 'X' });
  assert.match(buildDefault, /M16-S10-BUILD verdict=ACCEPTANCE_BUILT/);
  const acceptDefault = contract.buildHealthLineAcceptance({ digest: 'Y' });
  assert.match(acceptDefault, /M16-S10-ACCEPTANCE verdict=ACCEPTANCE_RESOLVED/);
  // Blocked exit
  const acceptBlocked = contract.buildHealthLineAcceptance({ exitCode: 8, blockCount: 2, digest: 'Z' });
  assert.match(acceptBlocked, /exit=8 block_count=2/);
});

// ===========================================================================
// 14. PURE BUILDERS — section builders + composite buildAcceptanceModel
// ===========================================================================
test('buildR041Acceptance: structural satisfaction only', () => {
  const row = contract.buildR041Acceptance({});
  assert.equal(row.section_id, 'r041_acceptance');
  assert.equal(row.requirement_id, 'R041');
  assert.equal(row.criterion_kind, 'structural');
  assert.deepEqual(row.structural_components, ['separate_verdicts', 'hard_gates', 'reproducible_worksheet']);
  assert.equal(row.satisfaction, 'STRUCTURAL_ONLY');
  assert.equal(row.satisfied, true);
  assert.equal(row.blockers.length, 0);
  assert.deepEqual(row.forbidden_satisfaction_rejected, {
    ACCEPTED: 'verdict overclaim — fails closed',
    LAUNCH_READY: 'launch readiness claim without bounded_internal gate',
    VERIFIED_LIVE: 'live runtime claim not allowed at this acceptance tier',
    PROVEN_BOUNDED_NATIVE: 'S08 promotion forbidden — only scope_revised survives',
    GO_BOUNDED_INTERNAL: 'must remain PREPARATION_ONLY until launch posture expands',
  });
  // Forbidden satisfaction triggers overclaim blocker
  const overclaim = contract.buildR041Acceptance({ satisfaction: 'ACCEPTED' });
  assert.equal(overclaim.satisfied, false);
  assert.equal(overclaim.blockers.length, 1);
  assert.ok(contract.isAcceptanceBlockerCode(overclaim.blockers[0].code));
  // Missing component → satisfied=false
  const partial = contract.buildR041Acceptance({ components: ['separate_verdicts', 'hard_gates'] });
  assert.equal(partial.satisfied, false);
});

test('buildMilestoneCriterion: 6 bullets + satisfied_count', () => {
  const row = contract.buildMilestoneCriterion({});
  assert.equal(row.section_id, 'milestone_criterion');
  assert.equal(row.bullet_count, 6);
  assert.equal(row.satisfied_count, 6);
  assert.equal(row.bullets.length, 6);
  for (const bullet of row.bullets) {
    assert.ok(contract.isKnownMilestoneBullet(bullet.bullet_id));
    assert.ok(contract.SOURCE_ALLOWLIST_SET.has(bullet.evidence_ref));
  }
  // Custom override (correct count) is honored
  const custom = contract.buildMilestoneCriterion({
    bullets: contract.MILESTONE_CRITERION_BULLETS.map((b, i) => i === 0 ? { ...b, satisfied: false } : b),
  });
  assert.equal(custom.satisfied_count, 5);
});

test('buildS05CanonicalVerdicts: frozen_reconciliation=PARTIAL + provenance preserved', () => {
  const row = contract.buildS05CanonicalVerdicts({});
  assert.equal(row.section_id, 's05_canonical_verdicts');
  assert.equal(row.producer_verdict, 'PASS');
  assert.equal(row.verifier_protocol_verdict, 'NOT_PROVEN');
  assert.equal(row.s06_reconciled_verdict, 'PARTIAL');
  assert.equal(row.s09_frozen_verdict, 'PARTIAL');
  assert.equal(row.frozen_reconciliation_verdict, 'PARTIAL');
  assert.equal(row.divergence_acknowledged, true);
  assert.equal(row.producer_provenance_preserved, true);
  assert.equal(row.verifier_provenance_preserved, true);
  assert.equal(row.frozen_reconciliation_equals_s09, true);
  // Drift attempt
  const drift = contract.buildS05CanonicalVerdicts({ frozen: 'PASS' });
  assert.equal(drift.frozen_reconciliation_verdict, 'PASS');
  assert.equal(drift.frozen_reconciliation_equals_s09, false);
});

test('buildS08ScopeDecision: scope_revised + PREPARATION_ONLY preserved', () => {
  const row = contract.buildS08ScopeDecision({});
  assert.equal(row.section_id, 's08_scope_decision');
  assert.equal(row.closure_kind, 'scope_revised');
  assert.equal(row.closure_verdict, 'NOT_PROVEN_SCOPE_REVISED');
  assert.equal(row.boundary, 'PREPARATION_ONLY');
  assert.equal(row.denial_summary_required, true);
  assert.equal(row.mutated_state_preserved, true);
  // Promotion attempt is captured but does NOT auto-block (verifier surfaces it).
  const promoted = contract.buildS08ScopeDecision({ closure_kind: 'live' });
  assert.equal(promoted.closure_kind, 'live');
});

test('buildNotProvenPreservation: superset check + capability guard', () => {
  const row = contract.buildNotProvenPreservation({});
  assert.equal(row.section_id, 'not_proven_preservation');
  assert.equal(row.preserved_count, 9);
  assert.equal(row.frozen_minimal_count, 9);
  assert.equal(row.missing_frozen_ids.length, 0);
  assert.equal(row.forbidden_extra_ids.length, 0);
  assert.equal(row.capability_promotion_blocked, true);
  // Missing frozen id → blocker
  const missing = contract.buildNotProvenPreservation({
    preserved_ids: ['NOT_PROVEN_SCOPE_REVISED'], // only 1
  });
  assert.ok(missing.missing_frozen_ids.length > 0);
  assert.ok(missing.blockers.length > 0);
  for (const blocker of missing.blockers) assert.ok(contract.isAcceptanceBlockerCode(blocker.code));
  // Forbidden extra id → blocker
  const extra = contract.buildNotProvenPreservation({
    preserved_ids: [...contract.NOT_PROVEN_PRESERVED_IDS, 'UNKNOWN_PROMOTED'],
  });
  assert.ok(extra.forbidden_extra_ids.length > 0);
  assert.ok(extra.blockers.length > 0);
});

test('buildCanonicalAcceptanceOutcome: orchestration/evidence/launch frozen', () => {
  const row = contract.buildCanonicalAcceptanceOutcome({});
  assert.equal(row.section_id, 'canonical_acceptance_outcome');
  assert.equal(row.orchestration, 'PARTIAL');
  assert.equal(row.evidence, 'PARTIAL');
  assert.equal(row.launch, 'PREPARATION_ONLY');
  assert.equal(row.bounded_internal, true);
  assert.equal(row.launch_posture_frozen, true);
  assert.equal(row.launch_posture_matches_s09, true);
  assert.equal(row.capability_promotion_blocked, true);
  assert.equal(row.reconciliation_status, 'RESOLVED_PREPARATION_ONLY');
  assert.equal(row.acceptance_verdict, 'ACCEPTANCE_RESOLVED');
});

test('buildAcceptanceModel: 6 sections + frozen posture + blocked_count', () => {
  const model = contract.buildAcceptanceModel({});
  assert.equal(model.schema_id, contract.SCHEMA_ID);
  assert.equal(model.schema_version, 'v1');
  assert.equal(model.milestone, 'M016-txa3vu');
  assert.equal(model.slice, 'S10');
  assert.equal(model.task, 'T01');
  assert.equal(model.sections.length, 6);
  assert.equal(model.section_count, 6);
  assert.equal(model.expected_section_count, 6);
  assert.equal(model.section_ids_unique, true);
  assert.equal(model.all_sections_known, true);
  assert.deepEqual(model.section_ids, [...contract.ACCEPTANCE_SECTION_IDS]);
  assert.equal(model.not_proven_preserved_count, 9);
  assert.equal(model.source_count, 15);
  assert.equal(model.network_calls, 0);
  assert.equal(model.mutation_count, 0);
  assert.equal(model.sanitised, true);
  assert.equal(model.raw_bodies_persisted, false);
  assert.equal(model.producer_line, 'M16-S10-BUILD');
  // Launch posture embedded
  assert.deepEqual(model.launch_posture, {
    orchestration: 'PARTIAL',
    evidence: 'PARTIAL',
    launch: 'PREPARATION_ONLY',
    bounded_internal: true,
  });
});

// ===========================================================================
// 15. EVALUATE — positive path
// ===========================================================================
test('evaluateAcceptance: positive path with frozen model', () => {
  const model = contract.buildAcceptanceModel({});
  const result = contract.evaluateAcceptance({ model });
  assert.equal(result.ok, true);
  assert.equal(result.exit_code, contract.EXIT_CODES.PASS);
  assert.equal(result.blockers.length, 0);
  assert.deepEqual(result.redaction_hits, []);
});

// ===========================================================================
// 16. EVALUATE — negative tamper matrix (8 categories)
// ===========================================================================
test('evaluateAcceptance: tamper matrix (8 categories)', () => {
  // NF1 — R041 structural missing
  {
    const model = contract.buildAcceptanceModel({});
    model.sections[0].structural_components = ['separate_verdicts']; // drop hard_gates
    model.sections[0].satisfied = false;
    const result = contract.evaluateAcceptance({ model });
    assert.equal(result.ok, false);
    assert.ok(result.blockers.length > 0);
  }
  // NF2 — milestone criterion drift
  {
    const model = contract.buildAcceptanceModel({});
    model.sections[1].bullets = model.sections[1].bullets.slice(0, 5); // drop MC6
    model.sections[1].bullet_count = 5;
    model.sections[1].satisfied_count = 5;
    const result = contract.evaluateAcceptance({ model });
    assert.equal(result.ok, false);
  }
  // NF3 — S05 divergence unsurfaced
  {
    const model = contract.buildAcceptanceModel({});
    model.sections[2].frozen_reconciliation_verdict = 'PASS';
    const result = contract.evaluateAcceptance({ model });
    assert.equal(result.ok, false);
  }
  // NF4 — S08 scope decision promotion attempt
  {
    const model = contract.buildAcceptanceModel({});
    model.sections[3].closure_kind = 'live';
    model.sections[3].closure_verdict = 'PROVEN_BOUNDED_NATIVE';
    const result = contract.evaluateAcceptance({ model });
    assert.equal(result.ok, false);
    assert.ok(result.blockers.some((b) => b.code.includes('S08-PROMOTION-ATTEMPT') || b.code.includes('S08-CLOSURE-KIND-DRIFT') || b.code.includes('VERDICT-FORBIDDEN')));
  }
  // NF5 — NOT_PROVEN removed
  {
    const model = contract.buildAcceptanceModel({});
    model.sections[4].preserved_ids = ['NOT_PROVEN_MISSING_RESULT_JSON_BOS']; // drop others
    model.sections[4].preserved_count = 1;
    const result = contract.evaluateAcceptance({ model });
    assert.equal(result.ok, false);
    assert.ok(result.blockers.some((b) => b.code.includes('NOT-PROVEN-REMOVED')));
  }
  // NF6 — Capability promotion leaked (bounded_internal=false)
  {
    const model = contract.buildAcceptanceModel({});
    model.launch_posture = { orchestration: 'PARTIAL', evidence: 'PARTIAL', launch: 'PREPARATION_ONLY', bounded_internal: false };
    const result = contract.evaluateAcceptance({ model });
    assert.equal(result.ok, false);
    assert.ok(result.blockers.some((b) => b.code.includes('LAUNCH-POSTURE-DRIFT')));
  }
  // NF7 — Source hash drift (source_ref not allowlisted)
  {
    const model = contract.buildAcceptanceModel({});
    model.source_refs = [...model.source_refs, 'runtime-evidence/M016-S07-some-thing.json'];
    const result = contract.evaluateAcceptance({ model });
    assert.equal(result.ok, false);
    assert.ok(result.blockers.some((b) => b.code.includes('SOURCE-NOT-ALLOWLISTED')));
  }
  // NF8 — Launch posture drift
  {
    const model = contract.buildAcceptanceModel({});
    model.launch_posture = { orchestration: 'NOT_PROVEN', evidence: 'PARTIAL', launch: 'PREPARATION_ONLY', bounded_internal: true };
    const result = contract.evaluateAcceptance({ model });
    assert.equal(result.ok, false);
    assert.ok(result.blockers.some((b) => b.code.includes('LAUNCH-POSTURE-DRIFT')));
  }
});

// ===========================================================================
// 17. computeAcceptanceDigest — determinism (byte-stable)
// ===========================================================================
test('computeAcceptanceDigest: deterministic + stable', () => {
  const model1 = contract.buildAcceptanceModel({ generated: '2026-07-23T12:00:00.000Z' });
  const model2 = contract.buildAcceptanceModel({ generated: '2026-07-23T12:00:00.000Z' });
  const d1 = contract.computeAcceptanceDigest(model1);
  const d2 = contract.computeAcceptanceDigest(model2);
  assert.equal(typeof d1, 'string');
  assert.match(d1, /^[a-f0-9]{64}$/);
  assert.equal(d1, d2);
  // Different generated → different digest
  const model3 = contract.buildAcceptanceModel({ generated: '2026-07-24T12:00:00.000Z' });
  const d3 = contract.computeAcceptanceDigest(model3);
  assert.notEqual(d1, d3);
  // null object → null
  assert.equal(contract.computeAcceptanceDigest(null), null);
});

// ===========================================================================
// 18. REDACTION SAFETY — FORBIDDEN_KEYS, FLAG_KEYS, REDACTION_PATTERNS
// ===========================================================================
test('redaction safety: detect forbidden keys + flag mismatches + pattern hits', () => {
  // Empty payload → no hits
  assert.deepEqual(contract.checkRedactionSafety({}), []);
  // Forbidden key presence
  const payload1 = { redacted_posture: contract.REDACTION_FLAG_VALUES, full_ids: 'leak-1' };
  const hits1 = contract.checkRedactionSafety(payload1);
  assert.ok(hits1.some((h) => h.kind === 'full_ids'));
  // Flag key mismatch (synthetic_bos_detected=true)
  const payload2 = { redaction_posture: { ...contract.REDACTION_FLAG_VALUES, synthetic_bos_detected: true } };
  const hits2 = contract.checkRedactionSafety(payload2);
  assert.ok(hits2.some((h) => h.kind === 'synthetic_bos_detected'));
  // Pattern hit inside free-form string
  const payload3 = { note: 'see result_json.bos body for raw data' };
  const hits3 = contract.checkRedactionSafety(payload3);
  assert.ok(hits3.length > 0);
  // API key pattern
  const payload4 = { config: 'api_key: abc123def456' };
  const hits4 = contract.checkRedactionSafety(payload4);
  assert.ok(hits4.some((h) => h.kind === 'token_assignment'));
  // Private key pattern
  const payload5 = { key: '-----BEGIN RSA PRIVATE KEY-----\nfoo\n-----END RSA PRIVATE KEY-----' };
  const hits5 = contract.checkRedactionSafety(payload5);
  assert.ok(hits5.some((h) => h.kind === 'private_key'));
  // Absolute path pattern
  const payload6 = { path: '/etc/passwd' };
  const hits6 = contract.checkRedactionSafety(payload6);
  assert.ok(hits6.some((h) => h.kind === 'absolute_path'));
  // Nested object traversal
  const payload7 = { outer: { inner: { deep: { leak: 'api_key: lmnopqrs' } } } };
  const hits7 = contract.checkRedactionSafety(payload7);
  assert.ok(hits7.some((h) => h.kind === 'token_assignment'));
});

// ===========================================================================
// 19. assertWriteSafe — fail-closed throws
// ===========================================================================
test('assertWriteSafe: fails closed on redaction violation', () => {
  const clean = { sanitised: true, raw_bodies_persisted: false, redacted_posture: contract.REDACTION_FLAG_VALUES };
  assert.equal(contract.assertWriteSafe(clean), true);
  // Throw path
  assert.throws(() => contract.assertWriteSafe({ full_ids: 'leak' }), (err) => {
    return err.code === contract.BLOCKER_CODES.REDACTION_LEAK('full_ids');
  });
});

// ===========================================================================
// 20. LOADER BASICS — readSource + allowlist enforcement
// ===========================================================================
test('loader: readSource enforces allowlist on non-allowlisted ref', () => {
  const fakeEntry = {
    source_ref: 'runtime-evidence/M016-S07-some-thing.json', // NOT in allowlist
    kind: 'rogue', chain_role: 'rogue', review_section: 'canonical_acceptance_outcome', required: false,
  };
  const row = loader.readSource(fakeEntry);
  assert.equal(row.status, 'not_allowlisted');
  assert.equal(row.not_allowlisted, true);
});

test('loader: readSource with allowlisted ref → read or missing', () => {
  // Use a real allowlisted source that exists in the repo
  const entry = contract.getSourceEntry(contract.REF.M015_BASELINE);
  assert.ok(entry);
  const row = loader.readSource(entry);
  // The repo has M015 baseline in runtime-evidence/ — should be 'read'.
  assert.ok(['read', 'missing', 'malformed'].includes(row.status));
  assert.equal(typeof row.sha256, 'string');
  assert.equal(typeof row.size_bytes, 'number');
  assert.equal(row.not_allowlisted, false);
});

test('loader: resolveSourcePath rejects absolute paths', () => {
  assert.throws(() => loader.resolveSourcePath('/etc/passwd'), (err) => err.code === contract.BLOCKER_CODES.PATH_TRAVERSAL('absolute-ref:/etc/passwd'));
  assert.throws(() => loader.resolveSourcePath(''), (err) => err.code === contract.BLOCKER_CODES.PATH_TRAVERSAL('empty-ref'));
});

test('loader: loadCanonicalReferences returns frozen summary', () => {
  const result = loader.loadCanonicalReferences();
  assert.equal(result.summary.expected_count, 15);
  assert.ok(typeof result.summary.read_count === 'number');
  assert.ok(typeof result.summary.byte_total === 'number');
  assert.equal(result.counters.network_calls, 0);
  assert.equal(result.counters.subprocess_calls, 0);
  assert.equal(result.counters.env_reads, 0);
  assert.equal(result.counters.mutation_count, 0);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.summary));
  assert.ok(Object.isFrozen(result.counters));
});

test('loader: snapshotHashes + diffSnapshots → no drift on second pass', () => {
  const result = loader.loadCanonicalReferences();
  const snap1 = loader.snapshotHashes(result);
  const snap2 = loader.snapshotHashes(result);
  const diff = loader.diffSnapshots(snap1, snap2);
  assert.equal(diff.drift_count, 0);
  assert.deepEqual(diff.drift_refs, []);
  assert.equal(diff.byte_total_unchanged, true);
  assert.equal(diff.read_count_unchanged, true);
});

test('loader: ROOT resolves to project root', () => {
  // Realpath-aware comparison: path.resolve() may yield a non-canonical
  // representation when the workspace root contains a symlinked parent
  // (e.g. /home/qazanik/Documents/<project>). realpathSync normalizes
  // both sides so the assertion is robust against symlink traversal.
  // The test file lives in `scripts/`, so a single `..` lands on the
  // project root — matching `loader.ROOT` which is computed from the
  // loader file in `scripts/lib/` via two `..` steps.
  assert.equal(fs.realpathSync(loader.ROOT), fs.realpathSync(path.resolve(__dirname, '..')));
});

// ===========================================================================
// 21. NEGATIVE FIXTURE TAXONOMY — exactly 8 categories
// ===========================================================================
test('negative fixture taxonomy: exactly 8 + categories cover all blockers', () => {
  assert.equal(contract.NEGATIVE_FIXTURE_TAXONOMY.length, 8);
  assert.equal(contract.EXPECTED_NEGATIVE_FIXTURE_COUNT, 8);
  assert.equal(contract.NEGATIVE_FIXTURE_IDS.length, 8);
  assert.deepEqual([...contract.NEGATIVE_FIXTURE_IDS], ['NF1', 'NF2', 'NF3', 'NF4', 'NF5', 'NF6', 'NF7', 'NF8']);
  // Every fixture references a valid section
  for (const fixture of contract.NEGATIVE_FIXTURE_TAXONOMY) {
    assert.ok(contract.isKnownAcceptanceSection(fixture.target_section));
    const code = fixture.blocker();
    assert.ok(contract.isAcceptanceBlockerCode(code), `${code} must be a valid blocker`);
  }
  // Categories cover the 8 expected
  assert.ok(contract.NEGATIVE_FIXTURE_CATEGORIES.includes('r041_structural_missing'));
  assert.ok(contract.NEGATIVE_FIXTURE_CATEGORIES.includes('milestone_criterion_drift'));
  assert.ok(contract.NEGATIVE_FIXTURE_CATEGORIES.includes('s05_producer_verifier_drift_unsurfaced'));
  assert.ok(contract.NEGATIVE_FIXTURE_CATEGORIES.includes('s08_scope_promotion_attempt'));
  assert.ok(contract.NEGATIVE_FIXTURE_CATEGORIES.includes('not_proven_to_pass_reclassified'));
  assert.ok(contract.NEGATIVE_FIXTURE_CATEGORIES.includes('capability_promotion_leaked'));
  assert.ok(contract.NEGATIVE_FIXTURE_CATEGORIES.includes('source_hash_drift'));
  assert.ok(contract.NEGATIVE_FIXTURE_CATEGORIES.includes('launch_class_drift'));
  assert.equal(contract.NEGATIVE_FIXTURE_CATEGORIES.length, 8);
  assert.ok(Object.isFrozen(contract.NEGATIVE_FIXTURE_TAXONOMY));
  assert.ok(Object.isFrozen(contract.NEGATIVE_FIXTURE_CATEGORIES));
});

// ===========================================================================
// 22. MODULE EXPORT SURFACE — frozen + complete
// ===========================================================================
test('module export surface: frozen + all expected keys', () => {
  // Verify the module itself is frozen.
  assert.ok(Object.isFrozen(contract));
  // Spot-check key surfaces
  const expected = [
    'SCHEMA_ID', 'SCHEMA_VERSION', 'MILESTONE', 'SLICE', 'NAMESPACE',
    'ACCEPTANCE_SECTION_IDS', 'SOURCE_ALLOWLIST', 'SOURCE_ALLOWLIST_REFS',
    'VERDICT_VALUES', 'BOUNDARY_VALUES', 'FORBIDDEN_ACCEPTANCE_VERDICTS',
    'R041_STRUCTURAL_COMPONENTS', 'FORBIDDEN_R041_SATISFACTION',
    'MILESTONE_CRITERION_BULLETS', 'S05_VERDICT_RECONCILIATION',
    'S08_FROZEN_POSTURE', 'FROZEN_LAUNCH_POSTURE',
    'NOT_PROVEN_PRESERVED_IDS', 'BLOCKER_CODES', 'EXIT_CODES',
    'buildHealthLineBuilder', 'buildHealthLineAcceptance',
    'buildAcceptanceModel', 'evaluateAcceptance', 'evaluateAcceptanceContract',
    'checkRedactionSafety', 'assertWriteSafe',
    'computeAcceptanceDigest', 'mapBlockerToExitCode',
    'NEGATIVE_FIXTURE_TAXONOMY',
  ];
  for (const key of expected) assert.ok(key in contract, `${key} must be exported`);
});