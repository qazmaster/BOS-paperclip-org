#!/usr/bin/env node
'use strict';
/**
 * scripts/lib/m016-s09-human-review-contract.js
 *
 * M016-txa3vu / S09 / T01 — Frozen registry, model builders and pure
 * evaluator for the Human Proof Acceptance Review. This module is the
 * single source of truth that downstream tasks consume (T02 loader and
 * builder, T03 verifier, T04 fresh canonical run).
 *
 * Scope of T01 (rendering invariant, NOT a public schema contract):
 *
 *   1.  SCHEMA + NAMESPACE            — schema_id, schema_version, slice,
 *                                        milestone, task list, line classes
 *   2.  REVIEW_SECTIONS               — exactly 5 frozen review sections in
 *                                        immutable order, plus the
 *                                        NOT_PROVEN preservation invariant
 *   3.  SOURCE_ALLOWLIST              — exactly 11 canonical runtime-evidence
 *                                        sources the review model references
 *   4.  WORKSHEET_CONSTANTS          — 8 hard gates / 3 verdict rows /
 *                                        19 evidence records + HG2/HG6
 *                                        frozen state strings
 *   5.  VERDICT_ROWS                  — orchestration / evidence / launch
 *                                        frozen vocabularies and exact
 *                                        M016 launch posture snapshot
 *   6.  M015_COMPARISON               — 9 criterion-diff rows + 30 capability
 *                                        row audit constants + forbidden
 *                                        promotion surface list
 *  7.   DIV1_COMMUNICATION            — exact Div1.HCO ↔ S05 EXECUTED mapping
 *                                        shape that the worksheet enforces
 *  8.   BLOCKER_CODES                 — `M16-S09-REVIEW-*` factory functions
 *  9.   EXIT_CODES                    — process exit codes 0..6
 * 10.   CLI_HEALTH_LINE               — stable verifier line shape
 * 11.   DEFAULTS                      — output path, reference time, ceilings
 * 12.   Pure builders                 — buildReviewModel, buildWorksheet,
 *                                        buildSanitisedProofSummary,
 *                                        buildDiv1Communication,
 *                                        buildLaunchClassBoundary,
 *                                        buildM015Comparison,
 *                                        buildNotProvenPreservation,
 *                                        buildProvenanceAppendix,
 *                                        evaluateReviewContract,
 *                                        computeReviewDigest
 *
 * The module is intentionally pure: no fs/network subprocesses, no env
 * reads, no producer CLI import. T02 builder reads from disk and feeds
 * the resulting JSON into buildReviewModel. T03 verifier independently
 * re-derives source hashes and review semantics — it MUST NOT import
 * this file's builder functions (only the frozen registry constants).
 */
const crypto = require('node:crypto');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function _safeSuffix(value) {
  const raw = String(value == null ? '' : value);
  const cleaned = raw.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return (cleaned || 'X').slice(0, 64);
}
function _isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function _asString(value, fallback) {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}
function _clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
function sha256Hex(content) {
  const buf = Buffer.isBuffer(content) ? content
    : Buffer.from(content == null ? '' : String(content), 'utf8');
  return crypto.createHash('sha256').update(buf).digest('hex');
}
function _stableStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(_stableStringify).join(',') + ']';
  if (_isObject(value)) {
    return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + _stableStringify(value[k])).join(',') + '}';
  }
  return JSON.stringify(String(value));
}

// ---------------------------------------------------------------------------
// 1. SCHEMA + NAMESPACE
// ---------------------------------------------------------------------------
const SCHEMA_ID = 'https://gsd.local/schemas/runtime-evidence/m016-s09-human-review.v1.json';
const SCHEMA_VERSION = 'v1';
const SCHEMA_NAMESPACE = 'm016-s09-human-review-v1';
const MILESTONE = 'M016-txa3vu';
const SLICE = 'S09';
const TASK_IDS = Object.freeze(['T01', 'T02', 'T03', 'T04']);
const TASK = 'T01';
const HUMAN_REVIEW_ID = 'm016-s09-human-review-v1';
const HUMAN_REVIEW_KIND = 'human-proof-acceptance-review';
const NAMESPACE = 'M16-S09-REVIEW';
const BUILDER_LINE_CLASS = 'M16-S09-BUILD';
const VERIFIER_LINE_CLASS = 'M16-S09-REVIEW';
const BUILDER_CANONICAL_PROTOCOL = 'PROTOCOL-M16-S09-HUMAN-REVIEW-BUILD-V1';
const VERIFIER_CANONICAL_PROTOCOL = 'PROTOCOL-M16-S09-HUMAN-REVIEW-VERIFY-V1';
const BLOCKER_NAMESPACE = 'M16-S09-REVIEW';
const BLOCKER_CODE_PATTERN = '^M16-S09-REVIEW-[A-Za-z0-9._-]+$';
const BLOCKER_CODE_REGEX = new RegExp(BLOCKER_CODE_PATTERN);
function isReviewBlockerCode(value) {
  return typeof value === 'string' && BLOCKER_CODE_REGEX.test(value);
}
// Stable reference time; matches S03/S05/S06 family. Used when upstream
// sources emit no generated timestamp.
const HUMAN_REVIEW_REFERENCE_TIME = '2026-07-22T12:00:00.000Z';

// ---------------------------------------------------------------------------
// 2. REVIEW_SECTIONS — exactly 5 frozen sections + NOT_PROVEN invariant
// ---------------------------------------------------------------------------
// Order is immutable: each downstream renderer iterates in this order.
const REVIEW_SECTION_IDS = Object.freeze([
  'sanitised_proof_summary',
  'full_worksheet',
  'div1_exact_communication',
  'launch_class_boundary',
  'm015_comparison',
]);

const REVIEW_SECTION_LABELS_RU = Object.freeze({
  sanitised_proof_summary: 'Sanitised proof summary (M015 baseline + S02/S05/S06/S08 readback)',
  full_worksheet: 'Full worksheet — 8 hard gates × 3 verdict rows × 19 evidence records',
  div1_exact_communication: 'Exact Div1 communication (M015 Div1.HCO diagnostic ↔ M016 S05 EXECUTED read-only replay)',
  launch_class_boundary: 'Launch-class boundary (orchestration / evidence / launch + bounded_internal)',
  m015_comparison: 'M015 comparison (9 criterion-diff rows + 30 capability rows audit)',
});

const REVIEW_SECTION_SET = Object.freeze(new Set(REVIEW_SECTION_IDS));
const EXPECTED_SECTION_COUNT = REVIEW_SECTION_IDS.length; // 5
function isKnownReviewSection(value) {
  return typeof value === 'string' && REVIEW_SECTION_SET.has(value);
}

// NOT_PROVEN preservation is a sibling invariant, NOT a numbered review
// section — it rides along in every review artifact as its own appendix.
const NOT_PROVEN_INVARIANT_ID = 'not_proven_preservation';
const NOT_PROVEN_INVARIANT_LABEL_RU = 'NOT_PROVEN preservation (отсутствующие executed claims не повышаются)';

// ---------------------------------------------------------------------------
// 3. SOURCE_ALLOWLIST — exactly 11 canonical sources
// ---------------------------------------------------------------------------
const SOURCE_ALLOWLIST = Object.freeze([
  Object.freeze({
    source_ref: 'runtime-evidence/M015-native-seven-division-mission-20260717.json',
    kind: 'm015_baseline',
    chain_role: 'm015_baseline',
    independence_group: 'm015-native-seven-division',
    required: true,
    review_section: 'sanitised_proof_summary',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S02-bos-mission-proof.json',
    kind: 's02_proof',
    chain_role: 's02_proof',
    independence_group: 'm016-s02-bos-mission-proof',
    required: true,
    review_section: 'sanitised_proof_summary',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-bundle.json',
    kind: 's05_replay_bundle',
    chain_role: 's05_replay_bundle',
    independence_group: 'm016-s05-replay-bundle',
    required: true,
    review_section: 'full_worksheet',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-scoring-worksheet.json',
    kind: 's05_replay_worksheet',
    chain_role: 's05_replay_worksheet',
    independence_group: 'm016-s05-replay-worksheet',
    required: true,
    review_section: 'full_worksheet',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-verify-protocol.json',
    kind: 's05_replay_verify_protocol',
    chain_role: 's05_replay_verify_protocol',
    independence_group: 'm016-s05-replay-verify-protocol',
    required: true,
    review_section: 'full_worksheet',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-producer-protocol.json',
    kind: 's05_replay_producer_protocol',
    chain_role: 's05_replay_producer_protocol',
    independence_group: 'm016-s05-replay-producer-protocol',
    required: true,
    review_section: 'div1_exact_communication',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-probe-run.json',
    kind: 's05_replay_probe_run',
    chain_role: 's05_replay_probe_run',
    independence_group: 'm016-s05-replay-probe-run',
    required: true,
    review_section: 'div1_exact_communication',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-admission.json',
    kind: 's05_replay_admission',
    chain_role: 's05_replay_admission',
    independence_group: 'm016-s05-replay-admission',
    required: true,
    review_section: 'full_worksheet',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S06-proof-reconciliation.json',
    kind: 's06_reconciliation',
    chain_role: 's06_reconciliation',
    independence_group: 'm016-s06-reconciliation',
    required: true,
    review_section: 'm015_comparison',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S08-native-seven-agent-closure.json',
    kind: 's08_closure',
    chain_role: 's08_closure',
    independence_group: 'm016-s08-closure',
    required: true,
    review_section: 'launch_class_boundary',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S08-native-seven-agent-scope-decision.json',
    kind: 's08_scope_decision',
    chain_role: 's08_scope_decision',
    independence_group: 'm016-s08-scope-decision',
    required: true,
    review_section: 'launch_class_boundary',
  }),
]);

const SOURCE_ALLOWLIST_REFS = Object.freeze(SOURCE_ALLOWLIST.map((s) => s.source_ref));
const SOURCE_ALLOWLIST_SET = Object.freeze(new Set(SOURCE_ALLOWLIST_REFS));
const EXPECTED_SOURCE_COUNT = SOURCE_ALLOWLIST.length; // 11
function isAllowlistedSourceRef(value) {
  return typeof value === 'string' && SOURCE_ALLOWLIST_SET.has(value);
}
function getSourceEntry(ref) {
  if (typeof ref !== 'string') return null;
  for (const entry of SOURCE_ALLOWLIST) if (entry.source_ref === ref) return entry;
  return null;
}
// Convenience refs re-exported for downstream renderers.
const REF = Object.freeze({
  M015_BASELINE: 'runtime-evidence/M015-native-seven-division-mission-20260717.json',
  S02_PROOF: 'runtime-evidence/M016-S02-bos-mission-proof.json',
  S05_BUNDLE: 'runtime-evidence/M016-S05-seven-division-replay-bundle.json',
  S05_WORKSHEET: 'runtime-evidence/M016-S05-seven-division-replay-scoring-worksheet.json',
  S05_VERIFY_PROTOCOL: 'runtime-evidence/M016-S05-seven-division-replay-verify-protocol.json',
  S05_PRODUCER_PROTOCOL: 'runtime-evidence/M016-S05-seven-division-replay-producer-protocol.json',
  S05_PROBE_RUN: 'runtime-evidence/M016-S05-seven-division-replay-probe-run.json',
  S05_ADMISSION: 'runtime-evidence/M016-S05-seven-division-replay-admission.json',
  S06_RECONCILIATION: 'runtime-evidence/M016-S06-proof-reconciliation.json',
  S08_CLOSURE: 'runtime-evidence/M016-S08-native-seven-agent-closure.json',
  S08_SCOPE_DECISION: 'runtime-evidence/M016-S08-native-seven-agent-scope-decision.json',
});

// ---------------------------------------------------------------------------
// 4. WORKSHEET_CONSTANTS — 8 hard gates / 3 verdict rows / 19 evidence
//    records + HG2/HG6 frozen state strings
// ---------------------------------------------------------------------------
// 8 hard gate IDs match S03 frozen vocabulary (re-used to avoid drift).
const HARD_GATE_IDS = Object.freeze([
  'HG1 SEMANTIC_RULE_COMPLIANCE',
  'HG2 PROVENANCE_INTEGRITY',
  'HG3 RECOVERY_EVIDENCE',
  'HG4 FINANCIAL_PROTECTION',
  'HG5 SECURITY_POSTURE',
  'HG6 COMPLIANCE_POSTURE',
  'HG7 READ_ONLY_BOUNDARY',
  'HG8 SCRATCH_ISOLATION',
]);
const HARD_GATE_IDS_SET = Object.freeze(new Set(HARD_GATE_IDS));
const EXPECTED_HARD_GATE_COUNT = HARD_GATE_IDS.length; // 8
function isKnownHardGate(value) {
  return typeof value === 'string' && HARD_GATE_IDS_SET.has(value);
}
// HG2 + HG6 are tracked separately because they must reflect specific
// snapshots in the M016 review. They are NOT gates themselves — they are
// the two hard gates whose worksheet state is *named* in the slice must-
// haves (HG2 PROVENANCE_INTEGRITY, HG6 COMPLIANCE_POSTURE).
const HG2_PROVENANCE_INTEGRITY = 'HG2 PROVENANCE_INTEGRITY';
const HG6_COMPLIANCE_POSTURE = 'HG6 COMPLIANCE_POSTURE';
// Frozen state vocabulary per hard gate. Worksheet rows must populate one
// of these values.
const HARD_GATE_STATES = Object.freeze(['pass', 'partial', 'not_proven', 'fail_closed']);
const HARD_GATE_STATES_SET = Object.freeze(new Set(HARD_GATE_STATES));

// 3 verdict rows — orchestration / evidence / launch — mirrored from S06.
const VERDICT_ROWS = Object.freeze(['orchestration', 'evidence', 'launch']);
const VERDICT_ROWS_SET = Object.freeze(new Set(VERDICT_ROWS));
const EXPECTED_VERDICT_ROW_COUNT = VERDICT_ROWS.length; // 3

// 19 evidence records — frozen IDs that the worksheet tracks. Each record
// pins a (review_section, source_ref) tuple plus an immutable gate label.
// Order is frozen for deterministic byte-stable rendering.
const EVIDENCE_RECORDS = Object.freeze([
  // 1. M015 baseline anchor — sanitised_proof_summary
  Object.freeze({ evidence_id: 'm016-s09-record-0001-m015-baseline', review_section: 'sanitised_proof_summary', gate: 'HG2 PROVENANCE_INTEGRITY', source_ref: REF.M015_BASELINE, classification: 'EXECUTED_READBACK' }),
  // 2. M015 9 criterion-diff rows — m015_comparison (rows 0002..0010)
  Object.freeze({ evidence_id: 'm016-s09-record-0002-m015-criterion-native-paperclip-mission', review_section: 'm015_comparison', gate: 'HG1 SEMANTIC_RULE_COMPLIANCE', source_ref: REF.M015_BASELINE, classification: 'EXECUTED_READBACK' }),
  Object.freeze({ evidence_id: 'm016-s09-record-0003-m015-criterion-seven-division-execution', review_section: 'm015_comparison', gate: 'HG1 SEMANTIC_RULE_COMPLIANCE', source_ref: REF.M015_BASELINE, classification: 'EXECUTED_READBACK' }),
  Object.freeze({ evidence_id: 'm016-s09-record-0004-m015-criterion-useful-artifact-generation', review_section: 'm015_comparison', gate: 'HG1 SEMANTIC_RULE_COMPLIANCE', source_ref: REF.M015_BASELINE, classification: 'EXECUTED_READBACK' }),
  Object.freeze({ evidence_id: 'm016-s09-record-0005-m015-criterion-dependency-orchestration', review_section: 'm015_comparison', gate: 'HG1 SEMANTIC_RULE_COMPLIANCE', source_ref: REF.M015_BASELINE, classification: 'EXECUTED_READBACK' }),
  Object.freeze({ evidence_id: 'm016-s09-record-0006-m015-criterion-final-mission-control-review', review_section: 'm015_comparison', gate: 'HG1 SEMANTIC_RULE_COMPLIANCE', source_ref: REF.M015_BASELINE, classification: 'EXECUTED_READBACK' }),
  Object.freeze({ evidence_id: 'm016-s09-record-0007-m015-criterion-zero-out-of-scope-mutations', review_section: 'm015_comparison', gate: 'HG6 COMPLIANCE_POSTURE', source_ref: REF.M015_BASELINE, classification: 'EXECUTED_READBACK' }),
  Object.freeze({ evidence_id: 'm016-s09-record-0008-m015-criterion-bos-plugin-required', review_section: 'm015_comparison', gate: 'HG6 COMPLIANCE_POSTURE', source_ref: REF.M015_BASELINE, classification: 'EXECUTED_READBACK' }),
  Object.freeze({ evidence_id: 'm016-s09-record-0009-m015-criterion-result-json-bos-required', review_section: 'm015_comparison', gate: 'HG6 COMPLIANCE_POSTURE', source_ref: REF.M015_BASELINE, classification: 'EXECUTED_READBACK' }),
  Object.freeze({ evidence_id: 'm016-s09-record-0010-m015-criterion-bos-grade-contract-proof', review_section: 'm015_comparison', gate: 'HG6 COMPLIANCE_POSTURE', source_ref: REF.M015_BASELINE, classification: 'NOT_PROVEN' }),
  // 11. S02 proof — sanitised_proof_summary
  Object.freeze({ evidence_id: 'm016-s09-record-0011-s02-bos-mission-proof', review_section: 'sanitised_proof_summary', gate: 'HG2 PROVENANCE_INTEGRITY', source_ref: REF.S02_PROOF, classification: 'EXECUTED_READBACK' }),
  // 12-16. S05 surfaces — full_worksheet (bundle, worksheet, verify-protocol, admission) + div1 (producer-protocol, probe-run)
  Object.freeze({ evidence_id: 'm016-s09-record-0012-s05-replay-bundle', review_section: 'full_worksheet', gate: 'HG1 SEMANTIC_RULE_COMPLIANCE', source_ref: REF.S05_BUNDLE, classification: 'EXECUTED_READBACK' }),
  Object.freeze({ evidence_id: 'm016-s09-record-0013-s05-replay-scoring-worksheet', review_section: 'full_worksheet', gate: 'HG2 PROVENANCE_INTEGRITY', source_ref: REF.S05_WORKSHEET, classification: 'EXECUTED_READBACK' }),
  Object.freeze({ evidence_id: 'm016-s09-record-0014-s05-replay-verify-protocol', review_section: 'full_worksheet', gate: 'HG7 READ_ONLY_BOUNDARY', source_ref: REF.S05_VERIFY_PROTOCOL, classification: 'EXECUTED_READBACK' }),
  Object.freeze({ evidence_id: 'm016-s09-record-0015-s05-replay-admission', review_section: 'full_worksheet', gate: 'HG1 SEMANTIC_RULE_COMPLIANCE', source_ref: REF.S05_ADMISSION, classification: 'EXECUTED_READBACK' }),
  // 17-18. S05 div1 surfaces (producer-protocol + probe-run)
  Object.freeze({ evidence_id: 'm016-s09-record-0016-s05-replay-producer-protocol', review_section: 'div1_exact_communication', gate: 'HG1 SEMANTIC_RULE_COMPLIANCE', source_ref: REF.S05_PRODUCER_PROTOCOL, classification: 'EXECUTED_READBACK' }),
  Object.freeze({ evidence_id: 'm016-s09-record-0017-s05-replay-probe-run', review_section: 'div1_exact_communication', gate: 'HG7 READ_ONLY_BOUNDARY', source_ref: REF.S05_PROBE_RUN, classification: 'EXECUTED_READBACK' }),
  // 18. S06 reconciliation — m015_comparison
  Object.freeze({ evidence_id: 'm016-s09-record-0018-s06-proof-reconciliation', review_section: 'm015_comparison', gate: 'HG2 PROVENANCE_INTEGRITY', source_ref: REF.S06_RECONCILIATION, classification: 'EXECUTED_READBACK' }),
  // 19. S08 scope-decision — launch_class_boundary (NOT_PROVEN if S08 closure absent)
  Object.freeze({ evidence_id: 'm016-s09-record-0019-s08-scope-decision', review_section: 'launch_class_boundary', gate: 'HG6 COMPLIANCE_POSTURE', source_ref: REF.S08_SCOPE_DECISION, classification: 'EXECUTED_READBACK' }),
]);
const EVIDENCE_RECORD_IDS = Object.freeze(EVIDENCE_RECORDS.map((r) => r.evidence_id));
const EVIDENCE_RECORD_SET = Object.freeze(new Set(EVIDENCE_RECORD_IDS));
const EXPECTED_EVIDENCE_RECORD_COUNT = EVIDENCE_RECORDS.length; // 19
function isKnownEvidenceRecord(value) {
  return typeof value === 'string' && EVIDENCE_RECORD_SET.has(value);
}
function getEvidenceRecord(id) {
  if (typeof id !== 'string') return null;
  for (const rec of EVIDENCE_RECORDS) if (rec.evidence_id === id) return rec;
  return null;
}

// ---------------------------------------------------------------------------
// 5. VERDICT_ROWS — orchestration / evidence / launch frozen vocabulary
// ---------------------------------------------------------------------------
const ORCHESTRATION_VERDICTS = Object.freeze(['PASS', 'PARTIAL', 'NOT_PROVEN']);
const EVIDENCE_VERDICTS = Object.freeze(['PASS', 'PARTIAL', 'NOT_PROVEN']);
const LAUNCH_VERDICTS = Object.freeze(['PREPARATION_ONLY', 'NO_GO']);
const VERDICT_VALUES = Object.freeze({ PASS: 'PASS', PARTIAL: 'PARTIAL', NOT_PROVEN: 'NOT_PROVEN', PREPARATION_ONLY: 'PREPARATION_ONLY', NO_GO: 'NO_GO' });
const VERDICT_VALUES_SET = Object.freeze(new Set(Object.values(VERDICT_VALUES)));
function isValidOrchestrationVerdict(value) { return ORCHESTRATION_VERDICTS.indexOf(value) >= 0; }
function isValidEvidenceVerdict(value) { return EVIDENCE_VERDICTS.indexOf(value) >= 0; }
function isValidLaunchVerdict(value) { return LAUNCH_VERDICTS.indexOf(value) >= 0; }
// Forbidden at the review layer — same vocabulary as S06.
const FORBIDDEN_REVIEW_VERDICTS = Object.freeze(['GO', 'PASS_AUTOMATIC', 'READY', 'LAUNCH_GO']);
function isForbiddenReviewVerdict(value) {
  return typeof value === 'string' && FORBIDDEN_REVIEW_VERDICTS.indexOf(value) >= 0;
}

// Frozen M016 launch posture — the worksheet's three verdict rows MUST
// carry exactly these values per the slice must-haves.
const FROZEN_LAUNCH_POSTURE = Object.freeze({
  orchestration: 'PARTIAL',
  evidence: 'PARTIAL',
  launch: 'PREPARATION_ONLY',
  bounded_internal: true,
});

// ---------------------------------------------------------------------------
// 6. M015_COMPARISON — 9 criterion-diff rows + 30 capability row audit
// ---------------------------------------------------------------------------
// 9 criterion-diff rows are the same ids as S06 (frozen across S06/S09).
// We embed the id set here so the review model can render a stable
// diff table without pulling S06 contract into T01's render path.
const M015_CRITERION_IDS = Object.freeze([
  'M16-S06-CRITERION-NATIVE-PAPERCLIP-MISSION',
  'M16-S06-CRITERION-SEVEN-DIVISION-EXECUTION',
  'M16-S06-CRITERION-USEFUL-ARTIFACT-GENERATION',
  'M16-S06-CRITERION-DEPENDENCY-ORCHESTRATION',
  'M16-S06-CRITERION-FINAL-MISSION-CONTROL-REVIEW',
  'M16-S06-CRITERION-ZERO-OUT-OF-SCOPE-MUTATIONS',
  'M16-S06-CRITERION-BOS-PLUGIN-REQUIRED',
  'M16-S06-CRITERION-RESULT-JSON-BOS-REQUIRED',
  'M16-S06-CRITERION-BOS-GRADE-CONTRACT-PROOF',
]);
const M015_CRITERION_IDS_SET = Object.freeze(new Set(M015_CRITERION_IDS));
const EXPECTED_CRITERION_DIFF_ROW_COUNT = M015_CRITERION_IDS.length; // 9
function isKnownM015CriterionId(value) {
  return typeof value === 'string' && M015_CRITERION_IDS_SET.has(value);
}

// 30 capability rows — the audit MUST enumerate all 30 rows from the
// capability ledger, with exactly one evidence-driven downgrade and zero
// promotions to confirmed.
const EXPECTED_CAPABILITY_AUDIT_ROW_COUNT = 30;
const EXPECTED_PROMOTIONS_TO_CONFIRMED = 0;
const EXPECTED_EVIDENCE_DRIVEN_DOWNGRADES = 1;

// Capability status enum — re-exported for renderer convenience.
const CAPABILITY_STATUSES = Object.freeze({
  CONFIRMED: 'confirmed',
  UNVALIDATED: 'unvalidated',
  FALLBACK_ONLY: 'fallback-only',
  UNSUPPORTED: 'unsupported',
});
const CAPABILITY_STATUSES_SET = Object.freeze(new Set(Object.values(CAPABILITY_STATUSES)));

// ---------------------------------------------------------------------------
// 7. DIV1_COMMUNICATION — exact Div1.HCO ↔ S05 EXECUTED mapping shape
// ---------------------------------------------------------------------------
// The worksheet's div1_exact_communication section MUST compare two frozen
// records: (a) M015 Div1.HCO diagnostic evidence and (b) M016 S05
// EXECUTED read-only replay record. The two records MUST keep distinct
// `evidence_kind` values so the renderer never substitutes one for the
// other (no historical evidence replaced by fresh readback).
const DIV1_COMMUNICATION_KINDS = Object.freeze({
  M015_DIAGNOSTIC: 'm015_div1_hco_diagnostic_evidence',
  M016_S05_EXECUTED_READBACK: 'm016_s05_executed_readonly_replay_record',
});
const DIV1_COMMUNICATION_KINDS_SET = Object.freeze(new Set(Object.values(DIV1_COMMUNICATION_KINDS)));
// Bounded fields that the renderer must surface side-by-side.
const DIV1_COMPARISON_FIELDS = Object.freeze([
  'role_label',
  'gate',
  'evidence_kind',
  'source_ref',
  'classification',
  'verdict',
  'artifact_hash',
]);
function isKnownDiv1CommunicationKind(value) {
  return typeof value === 'string' && DIV1_COMMUNICATION_KINDS_SET.has(value);
}

// S08 closure verdict — must stay NOT_PROVEN_SCOPE_REVISED per slice
// must-haves. Stage B stays adapter-native deferred-unvalidated.
const S08_CLOSURE_VERDICT = 'NOT_PROVEN_SCOPE_REVISED';
const S08_STAGE_B_RECOMMENDATION = 'adapter-native proof integration, deferred-unvalidated';
const S08_STAGE_B_RECOMMENDATION_PATTERN = '^(plugin-owned|adapter-native) proof integration, deferred-unvalidated$';

// ---------------------------------------------------------------------------
// 8. BLOCKER_CODES — M16-S09-REVIEW-* factory functions
// ---------------------------------------------------------------------------
const BLOCKER_CODES = Object.freeze({
  RUNNER_FAILURE: 'M16-S09-REVIEW-RUNNER-FAILURE',
  MODEL_MALFORMED: 'M16-S09-REVIEW-MODEL-MALFORMED',
  SECTION_DRIFT: (id) => 'M16-S09-REVIEW-SECTION-DRIFT-' + _safeSuffix(id),
  SECTION_MISSING: (id) => 'M16-S09-REVIEW-SECTION-MISSING-' + _safeSuffix(id),
  SOURCE_COUNT_DRIFT: (expected, observed) => 'M16-S09-REVIEW-SOURCE-COUNT-DRIFT-' + _safeSuffix(String(expected)) + '-' + _safeSuffix(String(observed)),
  SOURCE_NOT_ALLOWLISTED: (ref) => 'M16-S09-REVIEW-SOURCE-NOT-ALLOWLISTED-' + _safeSuffix(ref),
  SOURCE_HASH_DRIFT: (ref) => 'M16-S09-REVIEW-SOURCE-HASH-DRIFT-' + _safeSuffix(ref),
  SOURCE_MISSING: (ref) => 'M16-S09-REVIEW-SOURCE-MISSING-' + _safeSuffix(ref),
  EVIDENCE_RECORD_COUNT_DRIFT: (expected, observed) => 'M16-S09-REVIEW-EVIDENCE-RECORD-COUNT-DRIFT-' + _safeSuffix(String(expected)) + '-' + _safeSuffix(String(observed)),
  EVIDENCE_RECORD_DUPLICATE: (id) => 'M16-S09-REVIEW-EVIDENCE-RECORD-DUPLICATE-' + _safeSuffix(id),
  HARD_GATE_COUNT_DRIFT: (expected, observed) => 'M16-S09-REVIEW-HARD-GATE-COUNT-DRIFT-' + _safeSuffix(String(expected)) + '-' + _safeSuffix(String(observed)),
  HARD_GATE_UNKNOWN: (id) => 'M16-S09-REVIEW-HARD-GATE-UNKNOWN-' + _safeSuffix(id),
  HARD_GATE_STATE_DRIFT: (gate) => 'M16-S09-REVIEW-HARD-GATE-STATE-DRIFT-' + _safeSuffix(gate),
  VERDICT_ROW_COUNT_DRIFT: (expected, observed) => 'M16-S09-REVIEW-VERDICT-ROW-COUNT-DRIFT-' + _safeSuffix(String(expected)) + '-' + _safeSuffix(String(observed)),
  VERDICT_FORBIDDEN: (value) => 'M16-S09-REVIEW-VERDICT-FORBIDDEN-' + _safeSuffix(value),
  VERDICT_LAUNCH_DRIFT: (expected, observed) => 'M16-S09-REVIEW-VERDICT-LAUNCH-DRIFT-' + _safeSuffix(expected) + '-' + _safeSuffix(observed),
  VERDICT_BOUNDED_INTERNAL_DRIFT: () => 'M16-S09-REVIEW-VERDICT-BOUNDED-INTERNAL-DRIFT',
  CAPABILITY_AUDIT_ROW_COUNT_DRIFT: (expected, observed) => 'M16-S09-REVIEW-CAPABILITY-AUDIT-ROW-COUNT-DRIFT-' + _safeSuffix(String(expected)) + '-' + _safeSuffix(String(observed)),
  CAPABILITY_PROMOTION_DETECTED: (key) => 'M16-S09-REVIEW-CAPABILITY-PROMOTION-DETECTED-' + _safeSuffix(key),
  CAPABILITY_DOWNGRADE_COUNT_DRIFT: (expected, observed) => 'M16-S09-REVIEW-CAPABILITY-DOWNGRADE-COUNT-DRIFT-' + _safeSuffix(String(expected)) + '-' + _safeSuffix(String(observed)),
  CRITERION_DIFF_ROW_COUNT_DRIFT: (expected, observed) => 'M16-S09-REVIEW-CRITERION-DIFF-ROW-COUNT-DRIFT-' + _safeSuffix(String(expected)) + '-' + _safeSuffix(String(observed)),
  CRITERION_DIFF_UNKNOWN_ID: (id) => 'M16-S09-REVIEW-CRITERION-DIFF-UNKNOWN-ID-' + _safeSuffix(id),
  NOT_PROVEN_PROMOTION: (id) => 'M16-S09-REVIEW-NOT-PROVEN-PROMOTION-' + _safeSuffix(id),
  S08_CLOSURE_VERDICT_DRIFT: (value) => 'M16-S09-REVIEW-S08-CLOSURE-VERDICT-DRIFT-' + _safeSuffix(value),
  S08_STAGE_B_RECOMMENDATION_DRIFT: (value) => 'M16-S09-REVIEW-S08-STAGE-B-RECOMMENDATION-DRIFT-' + _safeSuffix(value),
  DIV1_KIND_UNKNOWN: (kind) => 'M16-S09-REVIEW-DIV1-KIND-UNKNOWN-' + _safeSuffix(kind),
  DIV1_MAPPING_INCOMPLETE: () => 'M16-S09-REVIEW-DIV1-MAPPING-INCOMPLETE',
  SECRET_TOKEN: (where) => 'M16-S09-REVIEW-SECRET-TOKEN-' + _safeSuffix(where),
  PATH_TRAVERSAL: (kind) => 'M16-S09-REVIEW-PATH-TRAVERSAL-' + _safeSuffix(kind),
  REDACTION_LEAK_RAW: (where) => 'M16-S09-REVIEW-REDACTION-LEAK-' + _safeSuffix(where),
});

// ---------------------------------------------------------------------------
// 9. EXIT_CODES — process exit codes 0..6 (matches S06 family shape)
// ---------------------------------------------------------------------------
const EXIT_CODES = Object.freeze({
  REVIEW_PASS: 0,
  REVIEW_MALFORMED: 1,
  REVIEW_FAIL_CLOSED: 2,
  REVIEW_PRECONDITION_DRIFT: 3,
  REVIEW_LAUNCH_DRIFT: 4,
  REVIEW_REDACTION_LEAK: 5,
  REVIEW_RUNNER_FAILURE: 6,
});

// ---------------------------------------------------------------------------
// 10. CLI_HEALTH_LINE — stable verifier line shape
// ---------------------------------------------------------------------------
// `M16-S09-REVIEW verdict=<PREPARATION_ONLY> exit=<0> block_count=<n> section_count=5 source_count=11 output_path=<...> output_sha256=<...>`
const CLI_LINE_PATTERN = '^M16-S09-REVIEW\\s+verdict=[A-Z_0-9-]+\\s+exit=[0-9]+\\s+block_count=[0-9]+\\s+section_count=5\\s+source_count=11(\\s+output_path=[^\\s]+)?(\\s+output_sha256=[a-f0-9]{64})?$';
const CLI_LINE_REGEX = new RegExp(CLI_LINE_PATTERN);
function buildCliHealthLine(input) {
  const opts = input || {};
  const verdict = _asString(opts.verdict, 'PREPARATION_ONLY');
  const exitCode = Number.isInteger(opts.exitCode) ? opts.exitCode : 0;
  const blockCount = Number.isInteger(opts.blockCount) ? opts.blockCount : 0;
  const outputPath = _asString(opts.outputPath, '');
  const outputSha = _asString(opts.outputSha256, '');
  let line = 'M16-S09-REVIEW verdict=' + verdict + ' exit=' + exitCode + ' block_count=' + blockCount + ' section_count=5 source_count=11';
  if (outputPath) line += ' output_path=' + outputPath;
  if (outputSha) line += ' output_sha256=' + outputSha;
  return line;
}

// ---------------------------------------------------------------------------
// 11. DEFAULTS — output path, reference time, ceilings
// ---------------------------------------------------------------------------
const DEFAULTS = Object.freeze({
  output_path: '.gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/16-09-HUMAN-REVIEW.md',
  reference_time: HUMAN_REVIEW_REFERENCE_TIME,
  max_section_count: EXPECTED_SECTION_COUNT,
  max_source_count: EXPECTED_SOURCE_COUNT,
  max_evidence_records: EXPECTED_EVIDENCE_RECORD_COUNT,
  max_hard_gates: EXPECTED_HARD_GATE_COUNT,
  max_verdict_rows: EXPECTED_VERDICT_ROW_COUNT,
  max_criterion_diff_rows: EXPECTED_CRITERION_DIFF_ROW_COUNT,
  max_capability_audit_rows: EXPECTED_CAPABILITY_AUDIT_ROW_COUNT,
  max_blocker_codes: 64,
  max_blocker_reason_chars: 512,
  operator_gate_token: '--confirm-m016-s09-human-review',
});

// ---------------------------------------------------------------------------
// 12. Pure builders
// ---------------------------------------------------------------------------
// Default M015 verdict snapshot used when upstream baseline is absent
// (only for the builder's *initial* model; verifier refuses absent hashes
// via evaluateReviewContract).
function _defaultM015CriterionRow(criterionId) {
  return {
    criterion_id: criterionId,
    m016_verdict: 'NOT_PROVEN',
    pass_through: false,
    evidence_driven: false,
  };
}
function _defaultCapabilityAuditRow(index) {
  return {
    capability_key: 'sample.surface.' + index,
    paperclip_surface_name: 'surface-' + index,
    pre_status: CAPABILITY_STATUSES.UNVALIDATED,
    post_status: CAPABILITY_STATUSES.UNVALIDATED,
    action: 'keep',
    promotion_attempted: false,
  };
}
function _defaultDiv1Communication() {
  return Object.freeze({
    m015_record: {
      evidence_kind: DIV1_COMMUNICATION_KINDS.M015_DIAGNOSTIC,
      role_label: 'Div1.HCO',
      gate: 'HG1 SEMANTIC_RULE_COMPLIANCE',
      source_ref: REF.M015_BASELINE,
      classification: 'OBSERVED',
      verdict: 'NOT_PROVEN',
      artifact_hash: '',
    },
    m016_record: {
      evidence_kind: DIV1_COMMUNICATION_KINDS.M016_S05_EXECUTED_READBACK,
      role_label: 'Div1.HCO',
      gate: 'HG1 SEMANTIC_RULE_COMPLIANCE',
      source_ref: REF.S05_PRODUCER_PROTOCOL,
      classification: 'EXECUTED_READONLY_REPLAY',
      verdict: 'PASS',
      artifact_hash: '',
    },
    mapping_complete: true,
    historical_not_replaced: true,
  });
}

// buildReviewModel — top-level pure builder. T02 loader feeds it raw
// source JSON + source_hashes; T03 verifier feeds the same canonical
// inputs from disk. Same input → same model → byte-stable review.
function buildReviewModel(input) {
  const opts = _isObject(input) ? input : {};
  const sourceHashes = _isObject(opts.sourceHashes) ? opts.sourceHashes : {};
  const referenceTime = _asString(opts.referenceTime, HUMAN_REVIEW_REFERENCE_TIME);
  const sections = {};
  for (const id of REVIEW_SECTION_IDS) sections[id] = _isObject(opts.sections && opts.sections[id]) ? _clone(opts.sections[id]) : {};
  const notProvenPreservation = _isObject(opts.notProvenPreservation) ? _clone(opts.notProvenPreservation) : {
    preserved_ids: [],
    promotion_attempted: [],
    stage_b_recommendation: S08_STAGE_B_RECOMMENDATION,
    stage_b_evidence_state: 'deferred-unvalidated',
    bos_grade_contract_proof_state: 'NOT_PROVEN_MISSING_RESULT_JSON_BOS',
  };
  const worksheet = buildWorksheet(opts.worksheet || {});
  const provenanceAppendix = buildProvenanceAppendix({
    sourceHashes,
    sourceSnapshots: opts.sourceSnapshots || {},
  });
  const s08State = _isObject(opts.s08State) ? _clone(opts.s08State) : {
    closure_verdict: S08_CLOSURE_VERDICT,
    stage_b_recommendation: S08_STAGE_B_RECOMMENDATION,
  };
  const model = Object.freeze({
    schema_id: SCHEMA_ID,
    schema_version: SCHEMA_VERSION,
    human_review_id: HUMAN_REVIEW_ID,
    human_review_kind: HUMAN_REVIEW_KIND,
    milestone: MILESTONE,
    slice: SLICE,
    task: opts.task || TASK,
    generated: _asString(opts.generated, referenceTime),
    reference_time: referenceTime,
    verifier_line: BUILDER_LINE_CLASS,
    canonical_protocol: BUILDER_CANONICAL_PROTOCOL,
    operator_gate_token: DEFAULTS.operator_gate_token,
    operator_gate_confirmed: opts.operatorGateConfirmed === true,
    sections: Object.freeze(sections),
    not_proven_preservation: Object.freeze(notProvenPreservation),
    worksheet: Object.freeze(worksheet),
    launch_posture: Object.freeze({
      orchestration: FROZEN_LAUNCH_POSTURE.orchestration,
      evidence: FROZEN_LAUNCH_POSTURE.evidence,
      launch: FROZEN_LAUNCH_POSTURE.launch,
      bounded_internal: FROZEN_LAUNCH_POSTURE.bounded_internal,
    }),
    s08_state: Object.freeze(s08State),
    section_count: REVIEW_SECTION_IDS.length,
    source_count: SOURCE_ALLOWLIST.length,
    evidence_record_count: EVIDENCE_RECORDS.length,
    hard_gate_count: HARD_GATE_IDS.length,
    verdict_row_count: VERDICT_ROWS.length,
    source_refs: Object.freeze(SOURCE_ALLOWLIST_REFS.slice()),
    source_hashes: Object.freeze(_clone(sourceHashes)),
    provenance_appendix: Object.freeze(provenanceAppendix),
    block_count: 0,
    blockers: Object.freeze([]),
    cli_line: buildCliHealthLine({
      verdict: FROZEN_LAUNCH_POSTURE.launch,
      exitCode: EXIT_CODES.REVIEW_PASS,
      blockCount: 0,
    }),
    byte_digest: '',
  });
  return model;
}
function buildWorksheet(input) {
  const opts = _isObject(input) ? input : {};
  const hardGateRows = [];
  for (const id of HARD_GATE_IDS) {
    hardGateRows.push({
      hard_gate_id: id,
      state: HARD_GATE_STATES_SET.has(opts[id]) ? opts[id] : 'partial',
      evidence_record_ids: Array.isArray(opts[id + '_records']) ? opts[id + '_records'].slice(0, 16) : [],
    });
  }
  const verdictRows = [];
  for (const row of VERDICT_ROWS) {
    const v = _asString(opts[row], '');
    verdictRows.push({ verdict_row: row, value: v });
  }
  const evidenceRecords = [];
  for (const id of EVIDENCE_RECORD_IDS) {
    const rec = getEvidenceRecord(id);
    evidenceRecords.push({
      evidence_id: id,
      review_section: rec.review_section,
      gate: rec.gate,
      source_ref: rec.source_ref,
      classification: rec.classification,
      worksheet_state: opts[id] || 'observed',
    });
  }
  return {
    hard_gate_count: hardGateRows.length,
    verdict_row_count: verdictRows.length,
    evidence_record_count: evidenceRecords.length,
    hard_gate_rows: hardGateRows,
    verdict_rows: verdictRows,
    evidence_records: evidenceRecords,
    hg2_state: _asString(opts.HG2, 'partial'),
    hg6_state: _asString(opts.HG6, 'partial'),
  };
}
function buildSanitisedProofSummary(input) {
  const opts = _isObject(input) ? input : {};
  return {
    section_id: 'sanitised_proof_summary',
    m015_baseline_ref: REF.M015_BASELINE,
    s02_proof_ref: REF.S02_PROOF,
    m015_summary_text: _asString(opts.m015Summary, 'M015 native seven-division mission recorded as bounded execution with NOT_PROVEN bos_grade_contract_proof.'),
    s02_summary_text: _asString(opts.s02Summary, 'M016 S02 bos-mission-proof re-derived from M015 baseline; preserves NOT_PROVEN surface.'),
    redaction_posture: Object.freeze({
      full_ids: false,
      credentials: false,
      xiaomi_endpoint_reuse: false,
      raw_body: false,
      raw_reasoning: false,
      raw_result_json_result: false,
      vendor_reuse_strings: false,
      bounded_digests_only: true,
      redaction_bounds_loaded: true,
    }),
  };
}
function buildDiv1Communication(input) {
  const opts = _isObject(input) ? input : {};
  const m015 = _isObject(opts.m015Record) ? _clone(opts.m015Record) : _defaultDiv1Communication().m015_record;
  const m016 = _isObject(opts.m016Record) ? _clone(opts.m016Record) : _defaultDiv1Communication().m016_record;
  if (!isKnownDiv1CommunicationKind(m015.evidence_kind)) m015.evidence_kind = DIV1_COMMUNICATION_KINDS.M015_DIAGNOSTIC;
  if (!isKnownDiv1CommunicationKind(m016.evidence_kind)) m016.evidence_kind = DIV1_COMMUNICATION_KINDS.M016_S05_EXECUTED_READBACK;
  return {
    section_id: 'div1_exact_communication',
    comparison_fields: DIV1_COMPARISON_FIELDS.slice(),
    m015_record: m015,
    m016_record: m016,
    mapping_complete: opts.mappingComplete !== false,
    historical_not_replaced: opts.historicalNotReplaced !== false,
  };
}
function buildLaunchClassBoundary(input) {
  const opts = _isObject(input) ? input : {};
  return {
    section_id: 'launch_class_boundary',
    orchestration: _asString(opts.orchestration, FROZEN_LAUNCH_POSTURE.orchestration),
    evidence: _asString(opts.evidence, FROZEN_LAUNCH_POSTURE.evidence),
    launch: _asString(opts.launch, FROZEN_LAUNCH_POSTURE.launch),
    bounded_internal: opts.boundedInternal !== false,
    s08_closure_ref: REF.S08_CLOSURE,
    s08_scope_decision_ref: REF.S08_SCOPE_DECISION,
    s08_closure_verdict: _asString(opts.s08ClosureVerdict, S08_CLOSURE_VERDICT),
    s08_stage_b_recommendation: _asString(opts.s08StageBRecommendation, S08_STAGE_B_RECOMMENDATION),
  };
}
function buildM015Comparison(input) {
  const opts = _isObject(input) ? input : {};
  const diffRows = [];
  for (const id of M015_CRITERION_IDS) diffRows.push(_isObject(opts[id]) ? Object.assign({ criterion_id: id }, _clone(opts[id])) : _defaultM015CriterionRow(id));
  const capabilityRows = [];
  const total = Number.isInteger(opts.capabilityTotalRows) ? opts.capabilityTotalRows : EXPECTED_CAPABILITY_AUDIT_ROW_COUNT;
  for (let i = 0; i < EXPECTED_CAPABILITY_AUDIT_ROW_COUNT; i += 1) {
    const row = _isObject(opts['capability_row_' + i]) ? _clone(opts['capability_row_' + i]) : _defaultCapabilityAuditRow(i);
    capabilityRows.push(row);
  }
  return {
    section_id: 'm015_comparison',
    criterion_diff_row_count: diffRows.length,
    capability_audit_row_count: total,
    criterion_diff: diffRows,
    capability_audit: capabilityRows,
    promotion_to_confirmed_count: Number.isInteger(opts.promotionToConfirmedCount) ? opts.promotionToConfirmedCount : EXPECTED_PROMOTIONS_TO_CONFIRMED,
    evidence_driven_downgrade_count: Number.isInteger(opts.evidenceDrivenDowngradeCount) ? opts.evidenceDrivenDowngradeCount : EXPECTED_EVIDENCE_DRIVEN_DOWNGRADES,
  };
}
function buildNotProvenPreservation(input) {
  const opts = _isObject(input) ? input : {};
  return {
    invariant_id: NOT_PROVEN_INVARIANT_ID,
    preserved_ids: Array.isArray(opts.preservedIds) ? opts.preservedIds.slice(0, 32) : [S08_CLOSURE_VERDICT, 'NOT_PROVEN_MISSING_RESULT_JSON_BOS'],
    promotion_attempted: Array.isArray(opts.promotionAttempted) ? opts.promotionAttempted.slice(0, 32) : [],
    stage_b_recommendation: _asString(opts.stageBRecommendation, S08_STAGE_B_RECOMMENDATION),
    stage_b_evidence_state: _asString(opts.stageBEvidenceState, 'deferred-unvalidated'),
    bos_grade_contract_proof_state: _asString(opts.bosGradeContractProofState, 'NOT_PROVEN_MISSING_RESULT_JSON_BOS'),
  };
}
function buildProvenanceAppendix(input) {
  const opts = _isObject(input) ? input : {};
  const sourceHashes = _isObject(opts.sourceHashes) ? opts.sourceHashes : {};
  const sourceSnapshots = _isObject(opts.sourceSnapshots) ? opts.sourceSnapshots : {};
  const rows = [];
  for (const entry of SOURCE_ALLOWLIST) {
    rows.push({
      source_ref: entry.source_ref,
      kind: entry.kind,
      chain_role: entry.chain_role,
      review_section: entry.review_section,
      required: entry.required,
      sha256: _asString(sourceHashes[entry.source_ref], ''),
      has_artifact_snapshot: Object.prototype.hasOwnProperty.call(sourceSnapshots, entry.source_ref),
    });
  }
  return { row_count: rows.length, rows };
}

// ---------------------------------------------------------------------------
// evaluateReviewContract — pure evaluator. Same inputs → same result.
// Re-derives every frozen invariant. Used by T03 verifier and by T01's
// own self-check.
// ---------------------------------------------------------------------------
function _pushBlocker(blockers, code, reason) {
  if (!blockers.some((entry) => entry.code === code)) blockers.push({ code, reason });
}
function evaluateReviewContract(input) {
  const inData = _isObject(input) ? input : {};
  const model = _isObject(inData.model) ? inData.model : null;
  if (!model) {
    return {
      ok: false,
      verdict: 'fail_closed',
      exit_code: EXIT_CODES.REVIEW_MALFORMED,
      cli_line: buildCliHealthLine({ verdict: 'FAIL_CLOSED', exitCode: EXIT_CODES.REVIEW_MALFORMED, blockCount: 1 }),
      blockers: [{ code: BLOCKER_CODES.MODEL_MALFORMED, reason: 'model missing' }],
    };
  }
  const blockers = [];
  // Section count + ordering.
  const sectionIds = _isObject(model.sections) ? Object.keys(model.sections) : [];
  if (sectionIds.length !== EXPECTED_SECTION_COUNT) {
    _pushBlocker(blockers, BLOCKER_CODES.SECTION_DRIFT('count'), 'sections=' + sectionIds.length + ' expected=' + EXPECTED_SECTION_COUNT);
  } else {
    for (let i = 0; i < REVIEW_SECTION_IDS.length; i += 1) {
      if (sectionIds[i] !== REVIEW_SECTION_IDS[i]) {
        _pushBlocker(blockers, BLOCKER_CODES.SECTION_DRIFT('order@' + i), 'section at index ' + i + ' is ' + sectionIds[i] + ' expected ' + REVIEW_SECTION_IDS[i]);
      }
      if (!isKnownReviewSection(sectionIds[i])) {
        _pushBlocker(blockers, BLOCKER_CODES.SECTION_MISSING(sectionIds[i] || 'unknown'), 'section not in frozen review vocabulary');
      }
    }
  }
  // Source count + allowlist.
  const sourceRefs = Array.isArray(model.source_refs) ? model.source_refs : [];
  if (sourceRefs.length !== EXPECTED_SOURCE_COUNT) {
    _pushBlocker(blockers, BLOCKER_CODES.SOURCE_COUNT_DRIFT(EXPECTED_SOURCE_COUNT, sourceRefs.length), 'source_refs length ' + sourceRefs.length + ' != ' + EXPECTED_SOURCE_COUNT);
  }
  for (const ref of sourceRefs) {
    if (!isAllowlistedSourceRef(ref)) {
      _pushBlocker(blockers, BLOCKER_CODES.SOURCE_NOT_ALLOWLISTED(ref), 'ref ' + ref + ' outside S09 allowlist');
    }
  }
  // Evidence record count.
  const recIds = Array.isArray(inData.evidenceRecordIds) ? inData.evidenceRecordIds : (model.worksheet && Array.isArray(model.worksheet.evidence_records) ? model.worksheet.evidence_records.map((r) => r.evidence_id) : []);
  if (recIds.length !== EXPECTED_EVIDENCE_RECORD_COUNT) {
    _pushBlocker(blockers, BLOCKER_CODES.EVIDENCE_RECORD_COUNT_DRIFT(EXPECTED_EVIDENCE_RECORD_COUNT, recIds.length), 'evidence_records length ' + recIds.length + ' != ' + EXPECTED_EVIDENCE_RECORD_COUNT);
  }
  const seenRec = new Set();
  for (const id of recIds) {
    if (!isKnownEvidenceRecord(id)) _pushBlocker(blockers, BLOCKER_CODES.SECTION_MISSING(id), 'evidence id ' + id + ' not in frozen registry');
    if (seenRec.has(id)) _pushBlocker(blockers, BLOCKER_CODES.EVIDENCE_RECORD_DUPLICATE(id), 'evidence id ' + id + ' duplicate');
    seenRec.add(id);
  }
  // Hard gate count.
  const worksheet = _isObject(model.worksheet) ? model.worksheet : {};
  if (!Array.isArray(worksheet.hard_gate_rows) || worksheet.hard_gate_rows.length !== EXPECTED_HARD_GATE_COUNT) {
    _pushBlocker(blockers, BLOCKER_CODES.HARD_GATE_COUNT_DRIFT(EXPECTED_HARD_GATE_COUNT, Array.isArray(worksheet.hard_gate_rows) ? worksheet.hard_gate_rows.length : -1), 'hard_gate_rows length drift');
  } else {
    for (const row of worksheet.hard_gate_rows) {
      if (!isKnownHardGate(row.hard_gate_id)) _pushBlocker(blockers, BLOCKER_CODES.HARD_GATE_UNKNOWN(row.hard_gate_id || 'unknown'), 'hard gate id not in HG1..HG8');
      if (!HARD_GATE_STATES_SET.has(row.state)) _pushBlocker(blockers, BLOCKER_CODES.HARD_GATE_STATE_DRIFT(row.hard_gate_id), 'state ' + row.state + ' not in pass|partial|not_proven|fail_closed');
    }
  }
  // Verdict rows.
  if (!Array.isArray(worksheet.verdict_rows) || worksheet.verdict_rows.length !== EXPECTED_VERDICT_ROW_COUNT) {
    _pushBlocker(blockers, BLOCKER_CODES.VERDICT_ROW_COUNT_DRIFT(EXPECTED_VERDICT_ROW_COUNT, Array.isArray(worksheet.verdict_rows) ? worksheet.verdict_rows.length : -1), 'verdict_rows length drift');
  } else {
    for (const row of worksheet.verdict_rows) {
      const v = row.value;
      if (isForbiddenReviewVerdict(v)) _pushBlocker(blockers, BLOCKER_CODES.VERDICT_FORBIDDEN(v), 'forbidden verdict ' + v);
      if (row.verdict_row === 'orchestration' && v !== FROZEN_LAUNCH_POSTURE.orchestration) _pushBlocker(blockers, BLOCKER_CODES.VERDICT_LAUNCH_DRIFT('orchestration=' + FROZEN_LAUNCH_POSTURE.orchestration, 'observed=' + v), 'orchestration must stay PARTIAL');
      if (row.verdict_row === 'evidence' && v !== FROZEN_LAUNCH_POSTURE.evidence) _pushBlocker(blockers, BLOCKER_CODES.VERDICT_LAUNCH_DRIFT('evidence=' + FROZEN_LAUNCH_POSTURE.evidence, 'observed=' + v), 'evidence must stay PARTIAL');
      if (row.verdict_row === 'launch' && v !== FROZEN_LAUNCH_POSTURE.launch) _pushBlocker(blockers, BLOCKER_CODES.VERDICT_LAUNCH_DRIFT('launch=' + FROZEN_LAUNCH_POSTURE.launch, 'observed=' + v), 'launch must stay PREPARATION_ONLY');
    }
  }
  // Launch posture.
  const lp = _isObject(model.launch_posture) ? model.launch_posture : {};
  if (lp.orchestration !== FROZEN_LAUNCH_POSTURE.orchestration || lp.evidence !== FROZEN_LAUNCH_POSTURE.evidence || lp.launch !== FROZEN_LAUNCH_POSTURE.launch) {
    _pushBlocker(blockers, BLOCKER_CODES.VERDICT_LAUNCH_DRIFT(FROZEN_LAUNCH_POSTURE.launch, _asString(lp.launch, '[none]')), 'launch posture triplet drifted');
  }
  if (lp.bounded_internal !== true) _pushBlocker(blockers, BLOCKER_CODES.VERDICT_BOUNDED_INTERNAL_DRIFT(), 'bounded_internal must be true');
  // S08 closure verdict + Stage B recommendation.
  const s08 = _isObject(model.s08_state) ? model.s08_state : {};
  if (_asString(s08.closure_verdict, '') !== S08_CLOSURE_VERDICT) _pushBlocker(blockers, BLOCKER_CODES.S08_CLOSURE_VERDICT_DRIFT(_asString(s08.closure_verdict, 'unset')), 'S08 closure_verdict must stay NOT_PROVEN_SCOPE_REVISED');
  if (!new RegExp(S08_STAGE_B_RECOMMENDATION_PATTERN).test(_asString(s08.stage_b_recommendation, ''))) _pushBlocker(blockers, BLOCKER_CODES.S08_STAGE_B_RECOMMENDATION_DRIFT(_asString(s08.stage_b_recommendation, 'unset')), 'Stage B recommendation must stay adapter-native deferred-unvalidated');
  // M015 comparison: criterion diff + capability audit.
  const m015 = _isObject(inData.m015Comparison) ? inData.m015Comparison : null;
  if (m015) {
    if (!Array.isArray(m015.criterion_diff) || m015.criterion_diff.length !== EXPECTED_CRITERION_DIFF_ROW_COUNT) {
      _pushBlocker(blockers, BLOCKER_CODES.CRITERION_DIFF_ROW_COUNT_DRIFT(EXPECTED_CRITERION_DIFF_ROW_COUNT, Array.isArray(m015.criterion_diff) ? m015.criterion_diff.length : -1), 'criterion_diff length drift');
    }
    for (const row of (m015.criterion_diff || [])) {
      if (!isKnownM015CriterionId(row.criterion_id)) _pushBlocker(blockers, BLOCKER_CODES.CRITERION_DIFF_UNKNOWN_ID(row.criterion_id || 'unknown'), 'criterion id not in M015 mapping');
    }
    if (!Array.isArray(m015.capability_audit) || m015.capability_audit.length !== EXPECTED_CAPABILITY_AUDIT_ROW_COUNT) {
      _pushBlocker(blockers, BLOCKER_CODES.CAPABILITY_AUDIT_ROW_COUNT_DRIFT(EXPECTED_CAPABILITY_AUDIT_ROW_COUNT, Array.isArray(m015.capability_audit) ? m015.capability_audit.length : -1), 'capability_audit length drift');
    }
    const promoted = m015.promotion_to_confirmed_count;
    if (promoted !== undefined && promoted !== EXPECTED_PROMOTIONS_TO_CONFIRMED) {
      _pushBlocker(blockers, BLOCKER_CODES.CAPABILITY_PROMOTION_DETECTED('count=' + promoted), 'promotion_to_confirmed_count must be 0');
    }
    const downgrades = m015.evidence_driven_downgrade_count;
    if (downgrades !== undefined && downgrades !== EXPECTED_EVIDENCE_DRIVEN_DOWNGRADES) {
      _pushBlocker(blockers, BLOCKER_CODES.CAPABILITY_DOWNGRADE_COUNT_DRIFT(EXPECTED_EVIDENCE_DRIVEN_DOWNGRADES, downgrades), 'evidence_driven_downgrade_count must be 1');
    }
  }
  // Div1 communication shape.
  const div1 = _isObject(inData.div1Communication) ? inData.div1Communication : null;
  if (div1) {
    if (!isKnownDiv1CommunicationKind(_asString(div1.m015_record && div1.m015_record.evidence_kind, ''))) _pushBlocker(blockers, BLOCKER_CODES.DIV1_KIND_UNKNOWN(_asString(div1.m015_record && div1.m015_record.evidence_kind, 'unset')), 'm015 div1 evidence_kind unknown');
    if (!isKnownDiv1CommunicationKind(_asString(div1.m016_record && div1.m016_record.evidence_kind, ''))) _pushBlocker(blockers, BLOCKER_CODES.DIV1_KIND_UNKNOWN(_asString(div1.m016_record && div1.m016_record.evidence_kind, 'unset')), 'm016 div1 evidence_kind unknown');
    if (div1.mapping_complete === false) _pushBlocker(blockers, BLOCKER_CODES.DIV1_MAPPING_INCOMPLETE(), 'div1 mapping_complete=false');
    if (div1.historical_not_replaced === false) _pushBlocker(blockers, BLOCKER_CODES.DIV1_MAPPING_INCOMPLETE(), 'historical_not_replaced=false');
  }
  // NOT_PROVEN preservation.
  const npp = _isObject(model.not_proven_preservation) ? model.not_proven_preservation : {};
  if (Array.isArray(npp.promotion_attempted) && npp.promotion_attempted.length > 0) {
    for (const id of npp.promotion_attempted) _pushBlocker(blockers, BLOCKER_CODES.NOT_PROVEN_PROMOTION(id), 'preserved NOT_PROVEN promoted: ' + id);
  }
  // Source hash drift (if hashes provided).
  const sourceHashes = _isObject(model.source_hashes) ? model.source_hashes : {};
  for (const ref of SOURCE_ALLOWLIST_REFS) {
    if (!Object.prototype.hasOwnProperty.call(sourceHashes, ref)) {
      _pushBlocker(blockers, BLOCKER_CODES.SOURCE_MISSING(ref), 'source hash missing for ' + ref);
    } else if (!/^[a-f0-9]{64}$/.test(_asString(sourceHashes[ref], ''))) {
      _pushBlocker(blockers, BLOCKER_CODES.SOURCE_HASH_DRIFT(ref), 'source hash for ' + ref + ' is not sha256');
    }
  }
  const ok = blockers.length === 0;
  const verdict = ok ? FROZEN_LAUNCH_POSTURE.launch : 'FAIL_CLOSED';
  return {
    ok,
    verdict,
    exit_code: ok ? EXIT_CODES.REVIEW_PASS : EXIT_CODES.REVIEW_FAIL_CLOSED,
    cli_line: buildCliHealthLine({ verdict, exitCode: ok ? EXIT_CODES.REVIEW_PASS : EXIT_CODES.REVIEW_FAIL_CLOSED, blockCount: blockers.length }),
    blockers,
  };
}
function computeReviewDigest(model) {
  if (!_isObject(model)) return null;
  const clone = _clone(model);
  delete clone.byte_digest;
  delete clone.cli_line;
  return sha256Hex(_stableStringify(clone));
}

module.exports = {
  SCHEMA_ID, SCHEMA_VERSION, SCHEMA_NAMESPACE, MILESTONE, SLICE, TASK_IDS, TASK,
  HUMAN_REVIEW_ID, HUMAN_REVIEW_KIND,
  NAMESPACE, BUILDER_LINE_CLASS, VERIFIER_LINE_CLASS,
  BUILDER_CANONICAL_PROTOCOL, VERIFIER_CANONICAL_PROTOCOL,
  BLOCKER_NAMESPACE, BLOCKER_CODE_PATTERN, BLOCKER_CODE_REGEX,
  isReviewBlockerCode,
  HUMAN_REVIEW_REFERENCE_TIME,
  REVIEW_SECTION_IDS, REVIEW_SECTION_LABELS_RU, REVIEW_SECTION_SET, EXPECTED_SECTION_COUNT, isKnownReviewSection,
  NOT_PROVEN_INVARIANT_ID, NOT_PROVEN_INVARIANT_LABEL_RU,
  SOURCE_ALLOWLIST, SOURCE_ALLOWLIST_REFS, SOURCE_ALLOWLIST_SET, EXPECTED_SOURCE_COUNT, isAllowlistedSourceRef, getSourceEntry,
  REF,
  HARD_GATE_IDS, HARD_GATE_IDS_SET, EXPECTED_HARD_GATE_COUNT, isKnownHardGate,
  HARD_GATE_STATES, HARD_GATE_STATES_SET,
  HG2_PROVENANCE_INTEGRITY, HG6_COMPLIANCE_POSTURE,
  VERDICT_ROWS, VERDICT_ROWS_SET, EXPECTED_VERDICT_ROW_COUNT,
  EVIDENCE_RECORDS, EVIDENCE_RECORD_IDS, EVIDENCE_RECORD_SET, EXPECTED_EVIDENCE_RECORD_COUNT, isKnownEvidenceRecord, getEvidenceRecord,
  ORCHESTRATION_VERDICTS, EVIDENCE_VERDICTS, LAUNCH_VERDICTS, VERDICT_VALUES, VERDICT_VALUES_SET,
  isValidOrchestrationVerdict, isValidEvidenceVerdict, isValidLaunchVerdict,
  FORBIDDEN_REVIEW_VERDICTS, isForbiddenReviewVerdict,
  FROZEN_LAUNCH_POSTURE,
  M015_CRITERION_IDS, M015_CRITERION_IDS_SET, EXPECTED_CRITERION_DIFF_ROW_COUNT, isKnownM015CriterionId,
  EXPECTED_CAPABILITY_AUDIT_ROW_COUNT, EXPECTED_PROMOTIONS_TO_CONFIRMED, EXPECTED_EVIDENCE_DRIVEN_DOWNGRADES,
  CAPABILITY_STATUSES, CAPABILITY_STATUSES_SET,
  DIV1_COMMUNICATION_KINDS, DIV1_COMMUNICATION_KINDS_SET, DIV1_COMPARISON_FIELDS, isKnownDiv1CommunicationKind,
  S08_CLOSURE_VERDICT, S08_STAGE_B_RECOMMENDATION, S08_STAGE_B_RECOMMENDATION_PATTERN,
  BLOCKER_CODES,
  EXIT_CODES,
  CLI_LINE_PATTERN, CLI_LINE_REGEX, buildCliHealthLine,
  DEFAULTS,
  buildReviewModel, buildWorksheet, buildSanitisedProofSummary, buildDiv1Communication,
  buildLaunchClassBoundary, buildM015Comparison, buildNotProvenPreservation,
  buildProvenanceAppendix, evaluateReviewContract, computeReviewDigest,
  sha256Hex, _stableStringify, _isObject, _asString, _clone, _safeSuffix,
};
