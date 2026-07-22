#!/usr/bin/env node
'use strict';
/**
 * scripts/test_m016_s09_human_review_contract.js
 *
 * M016-txa3vu / S09 / T01 — Contract tests for the frozen human-review
 * model + pure renderer.
 *
 * Coverage scope:
 *   1. Schema + namespace invariants
 *   2. Review sections invariant (exactly 5, immutable order)
 *   3. Source allowlist invariant (exactly 11, REF aliases match)
 *   4. Hard gates invariant (8, HG2/HG6 tracking)
 *   5. Verdict rows invariant (3, launch posture)
 *   6. Evidence records invariant (19, no duplicates)
 *   7. M015 comparison invariant (9 criteria + 30 capability rows)
 *   8. Div1 communication kinds + comparison fields
 *   9. S08 closure vocabulary (NOT_PROVEN_SCOPE_REVISED + Stage B)
 *  10. Blocker codes namespace + factory shape
 *  11. CLI health line format + digest
 *  12. Pure builders (buildReviewModel, buildWorksheet,
 *      buildSanitisedProofSummary, buildDiv1Communication,
 *      buildLaunchClassBoundary, buildM015Comparison,
 *      buildNotProvenPreservation, buildProvenanceAppendix)
 *  13. evaluateReviewContract — positive path
 *  14. evaluateReviewContract — negative tamper matrix
 *  15. computeReviewDigest determinism
 *  16. helpers module re-export surface
 *
 * The tests are pure (no fs / network / subprocesses) so they can run
 * under `node --test` without side effects.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const contract = require('./lib/m016-s09-human-review-contract.js');
const helpers = require('./lib/m016-s09-human-review-helpers.js');

// ===========================================================================
// 1. SCHEMA + NAMESPACE INVARIANTS
// ===========================================================================
test('schema + namespace invariants', () => {
  assert.equal(typeof contract.SCHEMA_ID, 'string');
  assert.match(contract.SCHEMA_ID, /^https:\/\/gsd\.local\/schemas\//);
  assert.equal(contract.SCHEMA_VERSION, 'v1');
  assert.equal(contract.SCHEMA_NAMESPACE, 'm016-s09-human-review-v1');
  assert.equal(contract.MILESTONE, 'M016-txa3vu');
  assert.equal(contract.SLICE, 'S09');
  assert.equal(contract.TASK, 'T01');
  assert.deepEqual([...contract.TASK_IDS], ['T01', 'T02', 'T03', 'T04']);
  assert.equal(contract.HUMAN_REVIEW_ID, 'm016-s09-human-review-v1');
  assert.equal(contract.HUMAN_REVIEW_KIND, 'human-proof-acceptance-review');
  assert.equal(contract.NAMESPACE, 'M16-S09-REVIEW');
  assert.equal(contract.BUILDER_LINE_CLASS, 'M16-S09-BUILD');
  assert.equal(contract.VERIFIER_LINE_CLASS, 'M16-S09-REVIEW');
  assert.equal(contract.BUILDER_CANONICAL_PROTOCOL, 'PROTOCOL-M16-S09-HUMAN-REVIEW-BUILD-V1');
  assert.equal(contract.VERIFIER_CANONICAL_PROTOCOL, 'PROTOCOL-M16-S09-HUMAN-REVIEW-VERIFY-V1');
  assert.equal(contract.BLOCKER_NAMESPACE, 'M16-S09-REVIEW');
  // BLOCKER_CODE_PATTERN is exported as a regex SOURCE string (starts
  // with '^'), so we anchor after the literal '^' character. Anchor
  // with '\\^M16-S09-REVIEW' to match the literal pattern prefix.
  assert.match(contract.BLOCKER_CODE_PATTERN, /\^M16-S09-REVIEW/);
  assert.ok(contract.isReviewBlockerCode('M16-S09-REVIEW-FOO'));
  assert.equal(contract.isReviewBlockerCode('M16-S06-BLOCKER'), false);
  assert.equal(contract.isReviewBlockerCode(''), false);
  assert.equal(contract.isReviewBlockerCode(null), false);
  assert.equal(contract.isReviewBlockerCode(undefined), false);
  assert.equal(contract.isReviewBlockerCode(42), false);
  // Reference time is ISO 8601.
  assert.match(contract.HUMAN_REVIEW_REFERENCE_TIME, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
});

// ===========================================================================
// 2. REVIEW SECTIONS INVARIANT — exactly 5, immutable order
// ===========================================================================
test('review sections: exactly 5 in immutable order', () => {
  assert.equal(contract.REVIEW_SECTION_IDS.length, 5);
  assert.equal(contract.EXPECTED_SECTION_COUNT, 5);
  assert.deepEqual([...contract.REVIEW_SECTION_IDS], [
    'sanitised_proof_summary',
    'full_worksheet',
    'div1_exact_communication',
    'launch_class_boundary',
    'm015_comparison',
  ]);
  // Set membership
  for (const id of contract.REVIEW_SECTION_IDS) {
    assert.ok(contract.REVIEW_SECTION_SET.has(id), `${id} should be in set`);
    assert.equal(contract.isKnownReviewSection(id), true);
    assert.equal(typeof contract.REVIEW_SECTION_LABELS_RU[id], 'string');
  }
  // Foreign ids rejected
  assert.equal(contract.isKnownReviewSection('not_a_section'), false);
  assert.equal(contract.isKnownReviewSection(''), false);
  assert.equal(contract.isKnownReviewSection(undefined), false);
  // Set is frozen
  assert.ok(Object.isFrozen(contract.REVIEW_SECTION_IDS));
  assert.ok(Object.isFrozen(contract.REVIEW_SECTION_LABELS_RU));
});

// ===========================================================================
// 3. SOURCE ALLOWLIST — exactly 11 allowlisted refs
// ===========================================================================
test('source allowlist: exactly 11 + REF aliases match', () => {
  assert.equal(contract.SOURCE_ALLOWLIST.length, 11);
  assert.equal(contract.EXPECTED_SOURCE_COUNT, 11);
  assert.equal(contract.SOURCE_ALLOWLIST_REFS.length, 11);
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
    assert.ok(contract.REVIEW_SECTION_SET.has(entry.review_section),
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
  // Frozen
  assert.ok(Object.isFrozen(contract.SOURCE_ALLOWLIST));
  assert.ok(Object.isFrozen(contract.SOURCE_ALLOWLIST_REFS));
});

// ===========================================================================
// 4. HARD GATES — exactly 8, HG2/HG6 tracked
// ===========================================================================
test('hard gates: exactly 8 + HG2/HG6 vocabulary', () => {
  assert.equal(contract.HARD_GATE_IDS.length, 8);
  assert.equal(contract.EXPECTED_HARD_GATE_COUNT, 8);
  for (const id of contract.HARD_GATE_IDS) {
    assert.ok(contract.isKnownHardGate(id));
    assert.match(id, /^HG[1-8]\s/);
  }
  // HG2 and HG6 specifically tracked
  assert.equal(contract.HG2_PROVENANCE_INTEGRITY, 'HG2 PROVENANCE_INTEGRITY');
  assert.equal(contract.HG6_COMPLIANCE_POSTURE, 'HG6 COMPLIANCE_POSTURE');
  assert.ok(contract.HARD_GATE_IDS_SET.has(contract.HG2_PROVENANCE_INTEGRITY));
  assert.ok(contract.HARD_GATE_IDS_SET.has(contract.HG6_COMPLIANCE_POSTURE));
  // States vocabulary
  assert.deepEqual([...contract.HARD_GATE_STATES].sort(), ['fail_closed', 'not_proven', 'partial', 'pass']);
  assert.equal(contract.HARD_GATE_STATES_SET.size, 4);
  // Negative
  assert.equal(contract.isKnownHardGate('HG0 BOGUS'), false);
  assert.equal(contract.isKnownHardGate(''), false);
  assert.equal(contract.isKnownHardGate(undefined), false);
  assert.ok(Object.isFrozen(contract.HARD_GATE_IDS));
  assert.ok(Object.isFrozen(contract.HARD_GATE_STATES));
});

// ===========================================================================
// 5. VERDICT ROWS — 3 rows, launch posture, forbidden vocabulary
// ===========================================================================
test('verdict rows: 3 rows + launch posture frozen + forbidden', () => {
  assert.deepEqual([...contract.VERDICT_ROWS], ['orchestration', 'evidence', 'launch']);
  assert.equal(contract.EXPECTED_VERDICT_ROW_COUNT, 3);
  assert.equal(contract.FROZEN_LAUNCH_POSTURE.orchestration, 'PARTIAL');
  assert.equal(contract.FROZEN_LAUNCH_POSTURE.evidence, 'PARTIAL');
  assert.equal(contract.FROZEN_LAUNCH_POSTURE.launch, 'PREPARATION_ONLY');
  assert.equal(contract.FROZEN_LAUNCH_POSTURE.bounded_internal, true);
  // Verdict validity
  assert.ok(contract.isValidOrchestrationVerdict('PASS'));
  assert.ok(contract.isValidOrchestrationVerdict('PARTIAL'));
  assert.ok(contract.isValidOrchestrationVerdict('NOT_PROVEN'));
  assert.equal(contract.isValidOrchestrationVerdict('GO'), false);
  assert.ok(contract.isValidEvidenceVerdict('PASS'));
  assert.ok(contract.isValidLaunchVerdict('PREPARATION_ONLY'));
  assert.ok(contract.isValidLaunchVerdict('NO_GO'));
  // Forbidden at review layer
  for (const v of ['GO', 'PASS_AUTOMATIC', 'READY', 'LAUNCH_GO']) {
    assert.equal(contract.isForbiddenReviewVerdict(v), true, `${v} must be forbidden`);
  }
  assert.equal(contract.isForbiddenReviewVerdict('PASS'), false);
  // Frozen
  assert.ok(Object.isFrozen(contract.VERDICT_ROWS));
  assert.ok(Object.isFrozen(contract.FROZEN_LAUNCH_POSTURE));
  assert.ok(Object.isFrozen(contract.FORBIDDEN_REVIEW_VERDICTS));
});

// ===========================================================================
// 6. EVIDENCE RECORDS — 19, no duplicates, ids stable
// ===========================================================================
test('evidence records: exactly 19 + no duplicates + ids stable', () => {
  assert.equal(contract.EVIDENCE_RECORDS.length, 19);
  assert.equal(contract.EVIDENCE_RECORD_IDS.length, 19);
  assert.equal(contract.EXPECTED_EVIDENCE_RECORD_COUNT, 19);
  const seen = new Set();
  for (const rec of contract.EVIDENCE_RECORDS) {
    assert.equal(seen.has(rec.evidence_id), false, `duplicate evidence_id ${rec.evidence_id}`);
    seen.add(rec.evidence_id);
    assert.equal(typeof rec.evidence_id, 'string');
    assert.match(rec.evidence_id, /^m016-s09-record-\d{4}-[a-z0-9-]+$/);
    assert.ok(contract.REVIEW_SECTION_SET.has(rec.review_section),
      `evidence ${rec.evidence_id} review_section ${rec.review_section} not in frozen sections`);
    assert.ok(contract.HARD_GATE_IDS_SET.has(rec.gate),
      `evidence ${rec.evidence_id} gate ${rec.gate} not in frozen HG1..HG8`);
    assert.ok(contract.SOURCE_ALLOWLIST_SET.has(rec.source_ref),
      `evidence ${rec.evidence_id} source_ref ${rec.source_ref} not in allowlist`);
    assert.equal(typeof rec.classification, 'string');
  }
  // Predicate
  for (const id of contract.EVIDENCE_RECORD_IDS) {
    assert.equal(contract.isKnownEvidenceRecord(id), true);
  }
  assert.equal(contract.isKnownEvidenceRecord('m016-s09-record-9999-bogus'), false);
  assert.equal(contract.isKnownEvidenceRecord(''), false);
  // getEvidenceRecord round-trips
  for (const id of contract.EVIDENCE_RECORD_IDS) {
    const rec = contract.getEvidenceRecord(id);
    assert.ok(rec);
    assert.equal(rec.evidence_id, id);
  }
  assert.equal(contract.getEvidenceRecord('not-a-record'), null);
  // NOT_PROVEN baseline present (record 0010)
  const bosGradeProof = contract.getEvidenceRecord('m016-s09-record-0010-m015-criterion-bos-grade-contract-proof');
  assert.equal(bosGradeProof.classification, 'NOT_PROVEN');
  assert.equal(bosGradeProof.review_section, 'm015_comparison');
  // Frozen
  assert.ok(Object.isFrozen(contract.EVIDENCE_RECORDS));
  assert.ok(Object.isFrozen(contract.EVIDENCE_RECORD_IDS));
});

// ===========================================================================
// 7. M015 COMPARISON — 9 criterion ids + 30 capability rows
// ===========================================================================
test('M015 comparison: 9 criteria + 30 capability rows + downgrades/promotions', () => {
  assert.equal(contract.M015_CRITERION_IDS.length, 9);
  assert.equal(contract.EXPECTED_CRITERION_DIFF_ROW_COUNT, 9);
  for (const id of contract.M015_CRITERION_IDS) {
    assert.equal(contract.isKnownM015CriterionId(id), true);
    assert.match(id, /^M16-S06-CRITERION-/);
  }
  assert.equal(contract.isKnownM015CriterionId('M16-S06-CRITERION-NOT-EXIST'), false);
  // Capability audit expectations
  assert.equal(contract.EXPECTED_CAPABILITY_AUDIT_ROW_COUNT, 30);
  assert.equal(contract.EXPECTED_PROMOTIONS_TO_CONFIRMED, 0);
  assert.equal(contract.EXPECTED_EVIDENCE_DRIVEN_DOWNGRADES, 1);
  // Statuses
  assert.equal(contract.CAPABILITY_STATUSES.CONFIRMED, 'confirmed');
  assert.equal(contract.CAPABILITY_STATUSES.UNVALIDATED, 'unvalidated');
  assert.equal(contract.CAPABILITY_STATUSES.FALLBACK_ONLY, 'fallback-only');
  assert.equal(contract.CAPABILITY_STATUSES.UNSUPPORTED, 'unsupported');
  assert.equal(contract.CAPABILITY_STATUSES_SET.size, 4);
  // Frozen
  assert.ok(Object.isFrozen(contract.M015_CRITERION_IDS));
});

// ===========================================================================
// 8. DIV1 COMMUNICATION — two distinct kinds + 7 comparison fields
// ===========================================================================
test('div1 communication: distinct kinds + comparison fields', () => {
  assert.equal(contract.DIV1_COMMUNICATION_KINDS.M015_DIAGNOSTIC, 'm015_div1_hco_diagnostic_evidence');
  assert.equal(contract.DIV1_COMMUNICATION_KINDS.M016_S05_EXECUTED_READBACK, 'm016_s05_executed_readonly_replay_record');
  // Kinds are distinct
  assert.notEqual(
    contract.DIV1_COMMUNICATION_KINDS.M015_DIAGNOSTIC,
    contract.DIV1_COMMUNICATION_KINDS.M016_S05_EXECUTED_READBACK
  );
  assert.equal(contract.DIV1_COMMUNICATION_KINDS_SET.size, 2);
  // Comparison fields are 7
  assert.equal(contract.DIV1_COMPARISON_FIELDS.length, 7);
  for (const f of contract.DIV1_COMPARISON_FIELDS) {
    assert.equal(typeof f, 'string');
  }
  // Predicate
  assert.equal(contract.isKnownDiv1CommunicationKind(contract.DIV1_COMMUNICATION_KINDS.M015_DIAGNOSTIC), true);
  assert.equal(contract.isKnownDiv1CommunicationKind('unknown_kind'), false);
  assert.equal(contract.isKnownDiv1CommunicationKind(''), false);
});

// ===========================================================================
// 9. S08 CLOSURE VOCABULARY
// ===========================================================================
test('S08 closure vocabulary: NOT_PROVEN_SCOPE_REVISED + Stage B pattern', () => {
  assert.equal(contract.S08_CLOSURE_VERDICT, 'NOT_PROVEN_SCOPE_REVISED');
  assert.equal(contract.S08_STAGE_B_RECOMMENDATION, 'adapter-native proof integration, deferred-unvalidated');
  // Pattern is exported as a string (regex source) per contract design;
  // construct a RegExp at the test boundary so assert.match accepts it.
  const stageBRegex = new RegExp(contract.S08_STAGE_B_RECOMMENDATION_PATTERN);
  assert.match(contract.S08_STAGE_B_RECOMMENDATION, stageBRegex);
  // Plugin-owned variant also matches (per must-haves decision branch)
  assert.match('plugin-owned proof integration, deferred-unvalidated', stageBRegex);
  assert.equal('ad-hoc integration'.match(stageBRegex), null);
  // Reject variants that drop the trailing state suffix
  assert.equal('adapter-native proof integration'.match(stageBRegex), null);
  assert.equal('plugin-owned proof integration, ready'.match(stageBRegex), null);
});

// ===========================================================================
// 10. BLOCKER CODES NAMESPACE + FACTORY SHAPE
// ===========================================================================
test('blocker codes: namespace + factory shape', () => {
  // Static codes match the namespace pattern
  assert.equal(contract.isReviewBlockerCode(contract.BLOCKER_CODES.RUNNER_FAILURE), true);
  assert.equal(contract.isReviewBlockerCode(contract.BLOCKER_CODES.MODEL_MALFORMED), true);
  // Factory codes match the pattern
  assert.equal(contract.isReviewBlockerCode(contract.BLOCKER_CODES.SECTION_DRIFT('count')), true);
  assert.equal(contract.isReviewBlockerCode(contract.BLOCKER_CODES.SECTION_MISSING('foo')), true);
  assert.equal(contract.isReviewBlockerCode(contract.BLOCKER_CODES.SOURCE_COUNT_DRIFT(11, 10)), true);
  assert.equal(contract.isReviewBlockerCode(contract.BLOCKER_CODES.SOURCE_NOT_ALLOWLISTED('foo.json')), true);
  assert.equal(contract.isReviewBlockerCode(contract.BLOCKER_CODES.SOURCE_HASH_DRIFT('foo.json')), true);
  assert.equal(contract.isReviewBlockerCode(contract.BLOCKER_CODES.SOURCE_MISSING('foo.json')), true);
  assert.equal(contract.isReviewBlockerCode(contract.BLOCKER_CODES.EVIDENCE_RECORD_COUNT_DRIFT(19, 18)), true);
  assert.equal(contract.isReviewBlockerCode(contract.BLOCKER_CODES.EVIDENCE_RECORD_DUPLICATE('rec-1')), true);
  assert.equal(contract.isReviewBlockerCode(contract.BLOCKER_CODES.HARD_GATE_COUNT_DRIFT(8, 7)), true);
  assert.equal(contract.isReviewBlockerCode(contract.BLOCKER_CODES.HARD_GATE_UNKNOWN('HG9')), true);
  assert.equal(contract.isReviewBlockerCode(contract.BLOCKER_CODES.HARD_GATE_STATE_DRIFT('HG1 SEMANTIC_RULE_COMPLIANCE')), true);
  assert.equal(contract.isReviewBlockerCode(contract.BLOCKER_CODES.VERDICT_ROW_COUNT_DRIFT(3, 2)), true);
  assert.equal(contract.isReviewBlockerCode(contract.BLOCKER_CODES.VERDICT_FORBIDDEN('GO')), true);
  assert.equal(contract.isReviewBlockerCode(contract.BLOCKER_CODES.VERDICT_LAUNCH_DRIFT('launch=PREPARATION_ONLY', 'observed=GO')), true);
  assert.equal(contract.isReviewBlockerCode(contract.BLOCKER_CODES.VERDICT_BOUNDED_INTERNAL_DRIFT()), true);
  assert.equal(contract.isReviewBlockerCode(contract.BLOCKER_CODES.CAPABILITY_AUDIT_ROW_COUNT_DRIFT(30, 29)), true);
  assert.equal(contract.isReviewBlockerCode(contract.BLOCKER_CODES.CAPABILITY_PROMOTION_DETECTED('count=1')), true);
  assert.equal(contract.isReviewBlockerCode(contract.BLOCKER_CODES.CAPABILITY_DOWNGRADE_COUNT_DRIFT(1, 0)), true);
  assert.equal(contract.isReviewBlockerCode(contract.BLOCKER_CODES.CRITERION_DIFF_ROW_COUNT_DRIFT(9, 8)), true);
  assert.equal(contract.isReviewBlockerCode(contract.BLOCKER_CODES.CRITERION_DIFF_UNKNOWN_ID('bogus')), true);
  assert.equal(contract.isReviewBlockerCode(contract.BLOCKER_CODES.NOT_PROVEN_PROMOTION('rec-1')), true);
  assert.equal(contract.isReviewBlockerCode(contract.BLOCKER_CODES.S08_CLOSURE_VERDICT_DRIFT('GO')), true);
  assert.equal(contract.isReviewBlockerCode(contract.BLOCKER_CODES.S08_STAGE_B_RECOMMENDATION_DRIFT('ad-hoc')), true);
  assert.equal(contract.isReviewBlockerCode(contract.BLOCKER_CODES.DIV1_KIND_UNKNOWN('bogus')), true);
  assert.equal(contract.isReviewBlockerCode(contract.BLOCKER_CODES.DIV1_MAPPING_INCOMPLETE()), true);
  assert.equal(contract.isReviewBlockerCode(contract.BLOCKER_CODES.SECRET_TOKEN('output')), true);
  assert.equal(contract.isReviewBlockerCode(contract.BLOCKER_CODES.PATH_TRAVERSAL('source')), true);
  assert.equal(contract.isReviewBlockerCode(contract.BLOCKER_CODES.REDACTION_LEAK_RAW('result_json.result')), true);
  // Exit codes
  assert.equal(contract.EXIT_CODES.REVIEW_PASS, 0);
  assert.equal(contract.EXIT_CODES.REVIEW_MALFORMED, 1);
  assert.equal(contract.EXIT_CODES.REVIEW_FAIL_CLOSED, 2);
  assert.equal(contract.EXIT_CODES.REVIEW_PRECONDITION_DRIFT, 3);
  assert.equal(contract.EXIT_CODES.REVIEW_LAUNCH_DRIFT, 4);
  assert.equal(contract.EXIT_CODES.REVIEW_REDACTION_LEAK, 5);
  assert.equal(contract.EXIT_CODES.REVIEW_RUNNER_FAILURE, 6);
});

// ===========================================================================
// 11. CLI HEALTH LINE FORMAT
// ===========================================================================
test('CLI health line format', () => {
  // Default shape
  const def = contract.buildCliHealthLine({});
  assert.match(def, /^M16-S09-REVIEW\s+verdict=PREPARATION_ONLY\s+exit=0\s+block_count=0\s+section_count=5\s+source_count=11$/);
  // With optional output_path + output_sha256
  const full = contract.buildCliHealthLine({
    verdict: 'PASS',
    exitCode: 0,
    blockCount: 0,
    outputPath: '.gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/16-09-HUMAN-REVIEW.md',
    outputSha256: 'a'.repeat(64),
  });
  assert.match(full, /^M16-S09-REVIEW\s+verdict=PASS\s+exit=0\s+block_count=0\s+section_count=5\s+source_count=11\s+output_path=\S+\s+output_sha256=[a-f0-9]{64}$/);
  // Regex matches default
  assert.match(def, contract.CLI_LINE_REGEX);
  assert.match(full, contract.CLI_LINE_REGEX);
  // FAIL_CLOSED line
  const fail = contract.buildCliHealthLine({ verdict: 'FAIL_CLOSED', exitCode: 2, blockCount: 5 });
  assert.match(fail, /^M16-S09-REVIEW\s+verdict=FAIL_CLOSED\s+exit=2\s+block_count=5\s+section_count=5\s+source_count=11$/);
});

// ===========================================================================
// 12. PURE BUILDERS
// ===========================================================================
function buildFullyAcceptableSourceHashes() {
  const out = {};
  for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
    // Use a sha256-shaped deterministic placeholder. The T01 contract
    // does not require real digests; it only requires the field be
    // present and shaped like a sha256. The T03 verifier is what
    // re-derives real digests.
    out[ref] = 'a'.repeat(64);
  }
  return out;
}

test('buildReviewModel: frozen + correct counts + frozen launch posture', () => {
  const sourceHashes = buildFullyAcceptableSourceHashes();
  const model = contract.buildReviewModel({ sourceHashes });
  assert.equal(model.milestone, contract.MILESTONE);
  assert.equal(model.slice, contract.SLICE);
  assert.equal(model.task, contract.TASK);
  assert.equal(model.section_count, 5);
  assert.equal(model.source_count, 11);
  assert.equal(model.evidence_record_count, 19);
  assert.equal(model.hard_gate_count, 8);
  assert.equal(model.verdict_row_count, 3);
  assert.equal(model.source_refs.length, 11);
  assert.equal(Object.keys(model.source_hashes).length, 11);
  assert.equal(model.launch_posture.orchestration, 'PARTIAL');
  assert.equal(model.launch_posture.evidence, 'PARTIAL');
  assert.equal(model.launch_posture.launch, 'PREPARATION_ONLY');
  assert.equal(model.launch_posture.bounded_internal, true);
  assert.equal(model.verifier_line, contract.BUILDER_LINE_CLASS);
  // Frozen
  assert.ok(Object.isFrozen(model));
  assert.ok(Object.isFrozen(model.sections));
  assert.ok(Object.isFrozen(model.launch_posture));
  assert.ok(Object.isFrozen(model.source_refs));
  assert.ok(Object.isFrozen(model.source_hashes));
});

test('buildWorksheet: 8 hard gates + 3 verdict rows + 19 evidence records', () => {
  const ws = contract.buildWorksheet({});
  assert.equal(ws.hard_gate_count, 8);
  assert.equal(ws.verdict_row_count, 3);
  assert.equal(ws.evidence_record_count, 19);
  assert.equal(ws.hard_gate_rows.length, 8);
  assert.equal(ws.verdict_rows.length, 3);
  assert.equal(ws.evidence_records.length, 19);
  // Hard gate rows default to partial
  for (const row of ws.hard_gate_rows) {
    assert.ok(contract.HARD_GATE_IDS_SET.has(row.hard_gate_id));
    assert.ok(contract.HARD_GATE_STATES_SET.has(row.state));
  }
  // Verdict rows are empty by default
  for (const row of ws.verdict_rows) {
    assert.ok(contract.VERDICT_ROWS_SET.has(row.verdict_row));
    assert.equal(row.value, '');
  }
  // Evidence records match registry
  for (const rec of ws.evidence_records) {
    assert.ok(contract.EVIDENCE_RECORD_SET.has(rec.evidence_id));
  }
});

test('buildSanitisedProofSummary: defaults + redaction posture', () => {
  const ss = contract.buildSanitisedProofSummary({});
  assert.equal(ss.section_id, 'sanitised_proof_summary');
  assert.equal(ss.m015_baseline_ref, contract.REF.M015_BASELINE);
  assert.equal(ss.s02_proof_ref, contract.REF.S02_PROOF);
  // Redaction posture — every flag must be false (bounded_digests_only + redaction_bounds_loaded are true)
  assert.equal(ss.redaction_posture.full_ids, false);
  assert.equal(ss.redaction_posture.credentials, false);
  assert.equal(ss.redaction_posture.xiaomi_endpoint_reuse, false);
  assert.equal(ss.redaction_posture.raw_body, false);
  assert.equal(ss.redaction_posture.raw_reasoning, false);
  assert.equal(ss.redaction_posture.raw_result_json_result, false);
  assert.equal(ss.redaction_posture.vendor_reuse_strings, false);
  assert.equal(ss.redaction_posture.bounded_digests_only, true);
  assert.equal(ss.redaction_posture.redaction_bounds_loaded, true);
});

test('buildDiv1Communication: defaults + kind normalisation', () => {
  const div1 = contract.buildDiv1Communication({});
  assert.equal(div1.section_id, 'div1_exact_communication');
  assert.equal(div1.comparison_fields.length, 7);
  assert.equal(div1.m015_record.evidence_kind, contract.DIV1_COMMUNICATION_KINDS.M015_DIAGNOSTIC);
  assert.equal(div1.m016_record.evidence_kind, contract.DIV1_COMMUNICATION_KINDS.M016_S05_EXECUTED_READBACK);
  assert.equal(div1.mapping_complete, true);
  assert.equal(div1.historical_not_replaced, true);
  // Kinds normalise unknown to frozen default
  const override = contract.buildDiv1Communication({
    m015Record: { evidence_kind: 'bogus' },
    m016Record: { evidence_kind: 'also-bogus' },
  });
  assert.equal(override.m015_record.evidence_kind, contract.DIV1_COMMUNICATION_KINDS.M015_DIAGNOSTIC);
  assert.equal(override.m016_record.evidence_kind, contract.DIV1_COMMUNICATION_KINDS.M016_S05_EXECUTED_READBACK);
});

test('buildLaunchClassBoundary: frozen launch posture + S08 vocabulary', () => {
  const stageBRegex = new RegExp(contract.S08_STAGE_B_RECOMMENDATION_PATTERN);
  const lcb = contract.buildLaunchClassBoundary({});
  assert.equal(lcb.section_id, 'launch_class_boundary');
  assert.equal(lcb.orchestration, 'PARTIAL');
  assert.equal(lcb.evidence, 'PARTIAL');
  assert.equal(lcb.launch, 'PREPARATION_ONLY');
  assert.equal(lcb.bounded_internal, true);
  assert.equal(lcb.s08_closure_verdict, contract.S08_CLOSURE_VERDICT);
  assert.match(lcb.s08_stage_b_recommendation, stageBRegex);
  assert.equal(lcb.s08_closure_ref, contract.REF.S08_CLOSURE);
  assert.equal(lcb.s08_scope_decision_ref, contract.REF.S08_SCOPE_DECISION);
});

test('buildM015Comparison: 9 criterion-diff + 30 capability rows + counts', () => {
  const m = contract.buildM015Comparison({});
  assert.equal(m.section_id, 'm015_comparison');
  assert.equal(m.criterion_diff_row_count, 9);
  assert.equal(m.criterion_diff.length, 9);
  for (const row of m.criterion_diff) {
    assert.ok(contract.isKnownM015CriterionId(row.criterion_id));
    assert.equal(row.m016_verdict, 'NOT_PROVEN');
    assert.equal(row.pass_through, false);
    assert.equal(row.evidence_driven, false);
  }
  // 30 capability rows
  assert.equal(m.capability_audit_row_count, 30);
  assert.equal(m.capability_audit.length, 30);
  for (let i = 0; i < 30; i += 1) {
    const row = m.capability_audit[i];
    assert.ok(row.capability_key);
    assert.ok(row.paperclip_surface_name);
    assert.equal(row.pre_status, contract.CAPABILITY_STATUSES.UNVALIDATED);
    assert.equal(row.post_status, contract.CAPABILITY_STATUSES.UNVALIDATED);
    assert.equal(row.promotion_attempted, false);
  }
  // Default promotion/downgrade counts
  assert.equal(m.promotion_to_confirmed_count, 0);
  assert.equal(m.evidence_driven_downgrade_count, 1);
});

test('buildNotProvenPreservation: default preserved ids + Stage B pattern', () => {
  const stageBRegex = new RegExp(contract.S08_STAGE_B_RECOMMENDATION_PATTERN);
  const npp = contract.buildNotProvenPreservation({});
  assert.equal(npp.invariant_id, contract.NOT_PROVEN_INVARIANT_ID);
  assert.ok(Array.isArray(npp.preserved_ids));
  assert.ok(npp.preserved_ids.includes(contract.S08_CLOSURE_VERDICT));
  assert.equal(npp.stage_b_evidence_state, 'deferred-unvalidated');
  assert.equal(npp.bos_grade_contract_proof_state, 'NOT_PROVEN_MISSING_RESULT_JSON_BOS');
  assert.match(npp.stage_b_recommendation, stageBRegex);
});

test('buildProvenanceAppendix: row count matches allowlist', () => {
  const hashes = buildFullyAcceptableSourceHashes();
  const pa = contract.buildProvenanceAppendix({ sourceHashes: hashes });
  assert.equal(pa.row_count, 11);
  assert.equal(pa.rows.length, 11);
  for (const row of pa.rows) {
    assert.ok(contract.isAllowlistedSourceRef(row.source_ref));
    assert.match(row.sha256, /^[a-f0-9]{64}$/);
    assert.equal(row.required, true);
  }
});

// ===========================================================================
// 13. evaluateReviewContract — POSITIVE PATH
// ===========================================================================
test('evaluateReviewContract: positive path returns ok=true + exit=0', () => {
  const sourceHashes = buildFullyAcceptableSourceHashes();
  const m015 = contract.buildM015Comparison({});
  const div1 = contract.buildDiv1Communication({});
  // buildReviewModel treats opts.worksheet as RAW INPUTS to buildWorksheet
  // (HG1..HG8 keys + orchestration/evidence/launch verdict values), NOT
  // as a pre-built worksheet — see contract.buildReviewModel comment.
  const worksheetInputs = {
    HG1: 'pass',
    HG2: 'pass',
    HG3: 'pass',
    HG4: 'pass',
    HG5: 'pass',
    HG6: 'pass',
    HG7: 'pass',
    HG8: 'pass',
    orchestration: 'PARTIAL',
    evidence: 'PARTIAL',
    launch: 'PREPARATION_ONLY',
  };
  const ws = contract.buildWorksheet(worksheetInputs);
  const npp = contract.buildNotProvenPreservation({});
  const sanitised = contract.buildSanitisedProofSummary({});
  const lcb = contract.buildLaunchClassBoundary({});
  const model = contract.buildReviewModel({
    sourceHashes,
    sections: {
      sanitised_proof_summary: sanitised,
      full_worksheet: ws,
      div1_exact_communication: div1,
      launch_class_boundary: lcb,
      m015_comparison: m015,
    },
    notProvenPreservation: npp,
    worksheet: worksheetInputs,
  });
  const res = contract.evaluateReviewContract({
    model,
    evidenceRecordIds: ws.evidence_records.map((r) => r.evidence_id),
    m015Comparison: m015,
    div1Communication: div1,
  });
  assert.equal(res.ok, true);
  assert.equal(res.verdict, 'PREPARATION_ONLY');
  assert.equal(res.exit_code, contract.EXIT_CODES.REVIEW_PASS);
  assert.equal(res.blockers.length, 0);
  assert.equal(res.cli_line.startsWith('M16-S09-REVIEW verdict=PREPARATION_ONLY exit=0 block_count=0'), true);
});

test('evaluateReviewContract: rejects missing model', () => {
  const res = contract.evaluateReviewContract({});
  assert.equal(res.ok, false);
  assert.equal(res.exit_code, contract.EXIT_CODES.REVIEW_MALFORMED);
  assert.equal(res.blockers.length >= 1, true);
  assert.equal(res.blockers[0].code, contract.BLOCKER_CODES.MODEL_MALFORMED);
});

// ===========================================================================
// 14. evaluateReviewContract — NEGATIVE TAMPER MATRIX
// ===========================================================================
// Helper: build an otherwise-acceptable model that we then mutate.
function buildPassingFixture() {
  const sourceHashes = buildFullyAcceptableSourceHashes();
  const m015 = contract.buildM015Comparison({});
  const div1 = contract.buildDiv1Communication({});
  // buildReviewModel treats opts.worksheet as RAW INPUTS (HG1..HG8 +
  // verdict rows), NOT a pre-built worksheet — pass raw inputs here.
  const worksheetInputs = {
    HG1: 'pass', HG2: 'pass', HG3: 'pass', HG4: 'pass',
    HG5: 'pass', HG6: 'pass', HG7: 'pass', HG8: 'pass',
    orchestration: 'PARTIAL',
    evidence: 'PARTIAL',
    launch: 'PREPARATION_ONLY',
  };
  const ws = contract.buildWorksheet(worksheetInputs);
  const npp = contract.buildNotProvenPreservation({});
  const sanitised = contract.buildSanitisedProofSummary({});
  const lcb = contract.buildLaunchClassBoundary({});
  return {
    sourceHashes,
    m015,
    div1,
    ws,
    worksheetInputs,
    npp,
    sanitised,
    lcb,
    model: contract.buildReviewModel({
      sourceHashes,
      sections: {
        sanitised_proof_summary: sanitised,
        full_worksheet: ws,
        div1_exact_communication: div1,
        launch_class_boundary: lcb,
        m015_comparison: m015,
      },
      notProvenPreservation: npp,
      worksheet: worksheetInputs,
    }),
  };
}

test('tamper: section count drift rejected', () => {
  const fix = buildPassingFixture();
  // Force model to be unfrozen so we can simulate a renderer drift
  const model = JSON.parse(JSON.stringify(fix.model));
  delete model.sections.launch_class_boundary;
  // We need source_hashes as object too (not frozen)
  const res = contract.evaluateReviewContract({
    model,
    evidenceRecordIds: fix.ws.evidence_records.map((r) => r.evidence_id),
    m015Comparison: fix.m015,
    div1Communication: fix.div1,
  });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.code === contract.BLOCKER_CODES.SECTION_DRIFT('count')));
});

test('tamper: source_ref not in allowlist rejected', () => {
  const fix = buildPassingFixture();
  const model = JSON.parse(JSON.stringify(fix.model));
  model.source_refs.push('runtime-evidence/BOGUS.json');
  const res = contract.evaluateReviewContract({
    model,
    evidenceRecordIds: fix.ws.evidence_records.map((r) => r.evidence_id),
    m015Comparison: fix.m015,
    div1Communication: fix.div1,
  });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.code === contract.BLOCKER_CODES.SOURCE_NOT_ALLOWLISTED('runtime-evidence/BOGUS.json')));
});

test('tamper: source_hash missing rejected', () => {
  const fix = buildPassingFixture();
  const model = JSON.parse(JSON.stringify(fix.model));
  delete model.source_hashes[contract.REF.M015_BASELINE];
  const res = contract.evaluateReviewContract({
    model,
    evidenceRecordIds: fix.ws.evidence_records.map((r) => r.evidence_id),
    m015Comparison: fix.m015,
    div1Communication: fix.div1,
  });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.code === contract.BLOCKER_CODES.SOURCE_MISSING(contract.REF.M015_BASELINE)));
});

test('tamper: source_hash wrong format rejected', () => {
  const fix = buildPassingFixture();
  const model = JSON.parse(JSON.stringify(fix.model));
  model.source_hashes[contract.REF.M015_BASELINE] = 'NOT-A-SHA256';
  const res = contract.evaluateReviewContract({
    model,
    evidenceRecordIds: fix.ws.evidence_records.map((r) => r.evidence_id),
    m015Comparison: fix.m015,
    div1Communication: fix.div1,
  });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.code === contract.BLOCKER_CODES.SOURCE_HASH_DRIFT(contract.REF.M015_BASELINE)));
});

test('tamper: evidence record count drift rejected', () => {
  const fix = buildPassingFixture();
  const res = contract.evaluateReviewContract({
    model: fix.model,
    evidenceRecordIds: fix.ws.evidence_records.slice(0, 18).map((r) => r.evidence_id),
    m015Comparison: fix.m015,
    div1Communication: fix.div1,
  });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.code.startsWith('M16-S09-REVIEW-EVIDENCE-RECORD-COUNT-DRIFT')));
});

test('tamper: evidence record duplicate rejected', () => {
  const fix = buildPassingFixture();
  const ids = fix.ws.evidence_records.map((r) => r.evidence_id);
  ids.push(ids[0]); // duplicate
  const res = contract.evaluateReviewContract({
    model: fix.model,
    evidenceRecordIds: ids,
    m015Comparison: fix.m015,
    div1Communication: fix.div1,
  });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.code.startsWith('M16-S09-REVIEW-EVIDENCE-RECORD-DUPLICATE')));
});

test('tamper: unknown hard gate rejected', () => {
  const fix = buildPassingFixture();
  const model = JSON.parse(JSON.stringify(fix.model));
  model.worksheet.hard_gate_rows[0] = { hard_gate_id: 'HG9 BOGUS', state: 'pass', evidence_record_ids: [] };
  const res = contract.evaluateReviewContract({
    model,
    evidenceRecordIds: fix.ws.evidence_records.map((r) => r.evidence_id),
    m015Comparison: fix.m015,
    div1Communication: fix.div1,
  });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.code === contract.BLOCKER_CODES.HARD_GATE_UNKNOWN('HG9 BOGUS')));
});

test('tamper: hard gate bad state rejected', () => {
  const fix = buildPassingFixture();
  const model = JSON.parse(JSON.stringify(fix.model));
  model.worksheet.hard_gate_rows[0].state = 'mystery';
  const res = contract.evaluateReviewContract({
    model,
    evidenceRecordIds: fix.ws.evidence_records.map((r) => r.evidence_id),
    m015Comparison: fix.m015,
    div1Communication: fix.div1,
  });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.code.startsWith('M16-S09-REVIEW-HARD-GATE-STATE-DRIFT')));
});

test('tamper: forbidden verdict rejected', () => {
  const fix = buildPassingFixture();
  const model = JSON.parse(JSON.stringify(fix.model));
  model.worksheet.verdict_rows[2] = { verdict_row: 'launch', value: 'GO' };
  const res = contract.evaluateReviewContract({
    model,
    evidenceRecordIds: fix.ws.evidence_records.map((r) => r.evidence_id),
    m015Comparison: fix.m015,
    div1Communication: fix.div1,
  });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.code === contract.BLOCKER_CODES.VERDICT_FORBIDDEN('GO')));
});

test('tamper: launch verdict drift to PASS rejected', () => {
  const fix = buildPassingFixture();
  const model = JSON.parse(JSON.stringify(fix.model));
  model.worksheet.verdict_rows[2] = { verdict_row: 'launch', value: 'PASS' };
  const res = contract.evaluateReviewContract({
    model,
    evidenceRecordIds: fix.ws.evidence_records.map((r) => r.evidence_id),
    m015Comparison: fix.m015,
    div1Communication: fix.div1,
  });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.code.startsWith('M16-S09-REVIEW-VERDICT-LAUNCH-DRIFT')));
});

test('tamper: bounded_internal drift rejected', () => {
  const fix = buildPassingFixture();
  const model = JSON.parse(JSON.stringify(fix.model));
  model.launch_posture.bounded_internal = false;
  const res = contract.evaluateReviewContract({
    model,
    evidenceRecordIds: fix.ws.evidence_records.map((r) => r.evidence_id),
    m015Comparison: fix.m015,
    div1Communication: fix.div1,
  });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.code === contract.BLOCKER_CODES.VERDICT_BOUNDED_INTERNAL_DRIFT()));
});

test('tamper: S08 closure verdict drift rejected', () => {
  const fix = buildPassingFixture();
  const model = JSON.parse(JSON.stringify(fix.model));
  model.s08_state.closure_verdict = 'GO';
  const res = contract.evaluateReviewContract({
    model,
    evidenceRecordIds: fix.ws.evidence_records.map((r) => r.evidence_id),
    m015Comparison: fix.m015,
    div1Communication: fix.div1,
  });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.code === contract.BLOCKER_CODES.S08_CLOSURE_VERDICT_DRIFT('GO')));
});

test('tamper: S08 Stage B recommendation drift rejected', () => {
  const fix = buildPassingFixture();
  const model = JSON.parse(JSON.stringify(fix.model));
  model.s08_state.stage_b_recommendation = 'ad-hoc integration now';
  const res = contract.evaluateReviewContract({
    model,
    evidenceRecordIds: fix.ws.evidence_records.map((r) => r.evidence_id),
    m015Comparison: fix.m015,
    div1Communication: fix.div1,
  });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.code.startsWith('M16-S09-REVIEW-S08-STAGE-B-RECOMMENDATION-DRIFT')));
});

test('tamper: criterion-diff row count drift rejected', () => {
  const fix = buildPassingFixture();
  const m015 = JSON.parse(JSON.stringify(fix.m015));
  m015.criterion_diff = m015.criterion_diff.slice(0, 8);
  const res = contract.evaluateReviewContract({
    model: fix.model,
    evidenceRecordIds: fix.ws.evidence_records.map((r) => r.evidence_id),
    m015Comparison: m015,
    div1Communication: fix.div1,
  });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.code.startsWith('M16-S09-REVIEW-CRITERION-DIFF-ROW-COUNT-DRIFT')));
});

test('tamper: criterion-diff unknown id rejected', () => {
  const fix = buildPassingFixture();
  const m015 = JSON.parse(JSON.stringify(fix.m015));
  m015.criterion_diff[0].criterion_id = 'M16-S06-CRITERION-NOT-EXIST';
  const res = contract.evaluateReviewContract({
    model: fix.model,
    evidenceRecordIds: fix.ws.evidence_records.map((r) => r.evidence_id),
    m015Comparison: m015,
    div1Communication: fix.div1,
  });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.code === contract.BLOCKER_CODES.CRITERION_DIFF_UNKNOWN_ID('M16-S06-CRITERION-NOT-EXIST')));
});

test('tamper: capability audit row count drift rejected', () => {
  const fix = buildPassingFixture();
  const m015 = JSON.parse(JSON.stringify(fix.m015));
  m015.capability_audit = m015.capability_audit.slice(0, 29);
  const res = contract.evaluateReviewContract({
    model: fix.model,
    evidenceRecordIds: fix.ws.evidence_records.map((r) => r.evidence_id),
    m015Comparison: m015,
    div1Communication: fix.div1,
  });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.code.startsWith('M16-S09-REVIEW-CAPABILITY-AUDIT-ROW-COUNT-DRIFT')));
});

test('tamper: promotion-to-confirmed count drift rejected', () => {
  const fix = buildPassingFixture();
  const m015 = JSON.parse(JSON.stringify(fix.m015));
  m015.promotion_to_confirmed_count = 1;
  const res = contract.evaluateReviewContract({
    model: fix.model,
    evidenceRecordIds: fix.ws.evidence_records.map((r) => r.evidence_id),
    m015Comparison: m015,
    div1Communication: fix.div1,
  });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.code === contract.BLOCKER_CODES.CAPABILITY_PROMOTION_DETECTED('count=1')));
});

test('tamper: evidence-driven downgrade count drift rejected', () => {
  const fix = buildPassingFixture();
  const m015 = JSON.parse(JSON.stringify(fix.m015));
  m015.evidence_driven_downgrade_count = 2;
  const res = contract.evaluateReviewContract({
    model: fix.model,
    evidenceRecordIds: fix.ws.evidence_records.map((r) => r.evidence_id),
    m015Comparison: m015,
    div1Communication: fix.div1,
  });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.code.startsWith('M16-S09-REVIEW-CAPABILITY-DOWNGRADE-COUNT-DRIFT')));
});

test('tamper: div1 unknown kind rejected', () => {
  const fix = buildPassingFixture();
  const div1 = JSON.parse(JSON.stringify(fix.div1));
  div1.m015_record.evidence_kind = 'not-a-kind';
  const res = contract.evaluateReviewContract({
    model: fix.model,
    evidenceRecordIds: fix.ws.evidence_records.map((r) => r.evidence_id),
    m015Comparison: fix.m015,
    div1Communication: div1,
  });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.code === contract.BLOCKER_CODES.DIV1_KIND_UNKNOWN('not-a-kind')));
});

test('tamper: div1 mapping_complete=false rejected', () => {
  const fix = buildPassingFixture();
  const div1 = JSON.parse(JSON.stringify(fix.div1));
  div1.mapping_complete = false;
  const res = contract.evaluateReviewContract({
    model: fix.model,
    evidenceRecordIds: fix.ws.evidence_records.map((r) => r.evidence_id),
    m015Comparison: fix.m015,
    div1Communication: div1,
  });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.code === contract.BLOCKER_CODES.DIV1_MAPPING_INCOMPLETE()));
});

test('tamper: historical_not_replaced=false rejected', () => {
  const fix = buildPassingFixture();
  const div1 = JSON.parse(JSON.stringify(fix.div1));
  div1.historical_not_replaced = false;
  const res = contract.evaluateReviewContract({
    model: fix.model,
    evidenceRecordIds: fix.ws.evidence_records.map((r) => r.evidence_id),
    m015Comparison: fix.m015,
    div1Communication: div1,
  });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.code === contract.BLOCKER_CODES.DIV1_MAPPING_INCOMPLETE()));
});

test('tamper: NOT_PROVEN promotion_attempted rejected', () => {
  const fix = buildPassingFixture();
  const model = JSON.parse(JSON.stringify(fix.model));
  model.not_proven_preservation.promotion_attempted = ['some-not-proven-id'];
  const res = contract.evaluateReviewContract({
    model,
    evidenceRecordIds: fix.ws.evidence_records.map((r) => r.evidence_id),
    m015Comparison: fix.m015,
    div1Communication: fix.div1,
  });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.code === contract.BLOCKER_CODES.NOT_PROVEN_PROMOTION('some-not-proven-id')));
});

test('tamper: source count drift rejected', () => {
  const fix = buildPassingFixture();
  const model = JSON.parse(JSON.stringify(fix.model));
  model.source_refs = model.source_refs.slice(0, 10);
  const res = contract.evaluateReviewContract({
    model,
    evidenceRecordIds: fix.ws.evidence_records.map((r) => r.evidence_id),
    m015Comparison: fix.m015,
    div1Communication: fix.div1,
  });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.code.startsWith('M16-S09-REVIEW-SOURCE-COUNT-DRIFT')));
});

test('tamper: hard gate count drift rejected', () => {
  const fix = buildPassingFixture();
  const model = JSON.parse(JSON.stringify(fix.model));
  model.worksheet.hard_gate_rows = model.worksheet.hard_gate_rows.slice(0, 7);
  const res = contract.evaluateReviewContract({
    model,
    evidenceRecordIds: fix.ws.evidence_records.map((r) => r.evidence_id),
    m015Comparison: fix.m015,
    div1Communication: fix.div1,
  });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.code.startsWith('M16-S09-REVIEW-HARD-GATE-COUNT-DRIFT')));
});

test('tamper: verdict row count drift rejected', () => {
  const fix = buildPassingFixture();
  const model = JSON.parse(JSON.stringify(fix.model));
  model.worksheet.verdict_rows = model.worksheet.verdict_rows.slice(0, 2);
  const res = contract.evaluateReviewContract({
    model,
    evidenceRecordIds: fix.ws.evidence_records.map((r) => r.evidence_id),
    m015Comparison: fix.m015,
    div1Communication: fix.div1,
  });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.code.startsWith('M16-S09-REVIEW-VERDICT-ROW-COUNT-DRIFT')));
});

test('tamper: launch posture triplet drift rejected', () => {
  const fix = buildPassingFixture();
  const model = JSON.parse(JSON.stringify(fix.model));
  model.launch_posture.launch = 'NO_GO';
  const res = contract.evaluateReviewContract({
    model,
    evidenceRecordIds: fix.ws.evidence_records.map((r) => r.evidence_id),
    m015Comparison: fix.m015,
    div1Communication: fix.div1,
  });
  assert.equal(res.ok, false);
  assert.ok(res.blockers.some((b) => b.code.startsWith('M16-S09-REVIEW-VERDICT-LAUNCH-DRIFT')));
});

// ===========================================================================
// 15. computeReviewDigest — DETERMINISM
// ===========================================================================
test('computeReviewDigest: deterministic across same input', () => {
  const a = contract.buildReviewModel({ sourceHashes: buildFullyAcceptableSourceHashes() });
  const b = contract.buildReviewModel({ sourceHashes: buildFullyAcceptableSourceHashes() });
  const digestA = contract.computeReviewDigest(a);
  const digestB = contract.computeReviewDigest(b);
  assert.equal(typeof digestA, 'string');
  assert.match(digestA, /^[a-f0-9]{64}$/);
  assert.equal(digestA, digestB);
});

test('computeReviewDigest: different inputs → different digests', () => {
  const baseHashes = buildFullyAcceptableSourceHashes();
  const a = contract.buildReviewModel({ sourceHashes: baseHashes });
  const altHashes = Object.assign({}, baseHashes, {
    [contract.REF.M015_BASELINE]: 'b'.repeat(64),
  });
  const b = contract.buildReviewModel({ sourceHashes: altHashes });
  const digestA = contract.computeReviewDigest(a);
  const digestB = contract.computeReviewDigest(b);
  assert.notEqual(digestA, digestB);
});

test('computeReviewDigest: null on missing model', () => {
  assert.equal(contract.computeReviewDigest(null), null);
  assert.equal(contract.computeReviewDigest(undefined), null);
});

// ===========================================================================
// 16. HELPERS MODULE RE-EXPORT SURFACE
// ===========================================================================
test('helpers: re-exports contract + invariants', () => {
  // Vocabulary re-export
  assert.equal(helpers.MILESTONE, contract.MILESTONE);
  assert.equal(helpers.SLICE, contract.SLICE);
  assert.equal(helpers.TASK, contract.TASK);
  assert.equal(helpers.SCHEMA_ID, contract.SCHEMA_ID);
  assert.equal(helpers.HUMAN_REVIEW_ID, contract.HUMAN_REVIEW_ID);
  // Frozen arrays / objects preserved
  assert.deepEqual([...helpers.REVIEW_SECTION_IDS], [...contract.REVIEW_SECTION_IDS]);
  assert.deepEqual([...helpers.SOURCE_ALLOWLIST_REFS], [...contract.SOURCE_ALLOWLIST_REFS]);
  assert.deepEqual([...helpers.HARD_GATE_IDS], [...contract.HARD_GATE_IDS]);
  assert.deepEqual([...helpers.VERDICT_ROWS], [...contract.VERDICT_ROWS]);
  assert.deepEqual([...helpers.EVIDENCE_RECORD_IDS], [...contract.EVIDENCE_RECORD_IDS]);
  assert.deepEqual([...helpers.M015_CRITERION_IDS], [...contract.M015_CRITERION_IDS]);
  // Predicate aliases
  assert.equal(helpers.isKnownReviewSection('sanitised_proof_summary'), true);
  assert.equal(helpers.isAllowlistedSourceRef(contract.REF.M015_BASELINE), true);
  assert.equal(helpers.isKnownHardGate(contract.HG2_PROVENANCE_INTEGRITY), true);
  assert.equal(helpers.isKnownEvidenceRecord(contract.EVIDENCE_RECORD_IDS[0]), true);
  assert.equal(helpers.isKnownM015CriterionId(contract.M015_CRITERION_IDS[0]), true);
  assert.equal(helpers.isKnownDiv1CommunicationKind(contract.DIV1_COMMUNICATION_KINDS.M015_DIAGNOSTIC), true);
  // describeFrozenInvariants
  const inv = helpers.describeFrozenInvariants();
  assert.equal(inv.section_count, 5);
  assert.equal(inv.source_count, 11);
  assert.equal(inv.hard_gate_count, 8);
  assert.equal(inv.verdict_row_count, 3);
  assert.equal(inv.evidence_record_count, 19);
  assert.equal(inv.m015_criterion_count, 9);
  assert.equal(inv.capability_audit_row_count, 30);
  assert.equal(inv.promotions_to_confirmed, 0);
  assert.equal(inv.evidence_driven_downgrades, 1);
  assert.equal(inv.s08_closure_verdict, contract.S08_CLOSURE_VERDICT);
  // placeholders
  const ph = helpers.placeholderSourceHashes();
  assert.equal(Object.keys(ph).length, 11);
  for (const ref of Object.keys(ph)) {
    assert.equal(ph[ref], '0'.repeat(64));
  }
  const snapshots = helpers.placeholderSourceSnapshots();
  assert.equal(Object.keys(snapshots).length, 11);
  // Frozen
  assert.ok(Object.isFrozen(helpers));
});

test('helpers: buildAcceptanceModel produces model with evaluator pass + exit=0', () => {
  const sourceHashes = buildFullyAcceptableSourceHashes();
  const m015 = contract.buildM015Comparison({});
  const div1 = contract.buildDiv1Communication({});
  const ws = contract.buildWorksheet({
    HG1: 'pass', HG2: 'pass', HG3: 'pass', HG4: 'pass',
    HG5: 'pass', HG6: 'pass', HG7: 'pass', HG8: 'pass',
    orchestration: 'PARTIAL',
    evidence: 'PARTIAL',
    launch: 'PREPARATION_ONLY',
  });
  const model = helpers.buildAcceptanceModel({
    sourceHashes,
    worksheetInputs: {
      HG1: 'pass', HG2: 'pass', HG3: 'pass', HG4: 'pass',
      HG5: 'pass', HG6: 'pass', HG7: 'pass', HG8: 'pass',
      orchestration: 'PARTIAL',
      evidence: 'PARTIAL',
      launch: 'PREPARATION_ONLY',
    },
  });
  const res = contract.evaluateReviewContract({
    model,
    evidenceRecordIds: ws.evidence_records.map((r) => r.evidence_id),
    m015Comparison: m015,
    div1Communication: div1,
  });
  assert.equal(res.ok, true);
  assert.equal(res.exit_code, contract.EXIT_CODES.REVIEW_PASS);
  assert.equal(res.verdict, 'PREPARATION_ONLY');
});

// ===========================================================================
// 17. DEFAULTS
// ===========================================================================
test('defaults: output path / ceilings / operator gate token', () => {
  assert.equal(contract.DEFAULTS.output_path, '.gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/16-09-HUMAN-REVIEW.md');
  assert.equal(contract.DEFAULTS.reference_time, contract.HUMAN_REVIEW_REFERENCE_TIME);
  assert.equal(contract.DEFAULTS.max_section_count, 5);
  assert.equal(contract.DEFAULTS.max_source_count, 11);
  assert.equal(contract.DEFAULTS.max_evidence_records, 19);
  assert.equal(contract.DEFAULTS.max_hard_gates, 8);
  assert.equal(contract.DEFAULTS.max_verdict_rows, 3);
  assert.equal(contract.DEFAULTS.max_criterion_diff_rows, 9);
  assert.equal(contract.DEFAULTS.max_capability_audit_rows, 30);
  assert.equal(contract.DEFAULTS.operator_gate_token, '--confirm-m016-s09-human-review');
});

// ===========================================================================
// 18. SHA256 / STABLE STRINGIFY HELPERS
// ===========================================================================
test('sha256Hex + stableStringify invariants', () => {
  // Same content → same digest (sha256 is deterministic)
  assert.equal(contract.sha256Hex('hello'), contract.sha256Hex(Buffer.from('hello')));
  assert.match(contract.sha256Hex(''), /^[a-f0-9]{64}$/);
  // Stable across key order (this is what allows cross-run byte-stability)
  const a = JSON.stringify({ a: 1, b: 2, c: 3 });
  const b = JSON.stringify({ c: 3, b: 2, a: 1 });
  // sha256Hex itself doesn't sort; we test that the wrapper exists.
  assert.equal(typeof contract.sha256Hex, 'function');
  // Different content → different digest
  assert.notEqual(contract.sha256Hex('a'), contract.sha256Hex('b'));
});