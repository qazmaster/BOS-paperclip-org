#!/usr/bin/env node
'use strict';
/**
 * scripts/lib/m016-s09-human-review-helpers.js
 *
 * M016-txa3vu / S09 / T01 — Convenience wrapper around the frozen
 * `m016-s09-human-review-contract.js` registry and pure builders. This
 * module is intentionally pure (no fs / network / subprocesses / env
 * reads) and only re-exports a curated public surface so downstream
 * tasks (T02 builder, T03 verifier, T04 fresh canonical run) can import
 * the review vocabulary through a single stable path.
 *
 * Per the T01 contract:
 *
 *   - This module MUST NOT mutate the registry returned by the
 *     contract module.
 *   - Every helper MUST remain pure: same inputs → same outputs.
 *   - The module MUST NOT introduce new public schema or runtime-
 *     evidence contract fields; it is a rendering invariant only.
 *
 * Anything that requires file I/O, network access, or subprocess
 * management belongs in the T02 builder, NOT here.
 */
const contract = require('./m016-s09-human-review-contract.js');

// ---------------------------------------------------------------------------
// Public re-exports — frozen vocabulary + builders
// ---------------------------------------------------------------------------
const frozenVocabulary = Object.freeze({
  // Schema / namespace
  SCHEMA_ID: contract.SCHEMA_ID,
  SCHEMA_VERSION: contract.SCHEMA_VERSION,
  SCHEMA_NAMESPACE: contract.SCHEMA_NAMESPACE,
  MILESTONE: contract.MILESTONE,
  SLICE: contract.SLICE,
  TASK_IDS: contract.TASK_IDS,
  TASK: contract.TASK,
  HUMAN_REVIEW_ID: contract.HUMAN_REVIEW_ID,
  HUMAN_REVIEW_KIND: contract.HUMAN_REVIEW_KIND,
  NAMESPACE: contract.NAMESPACE,
  BUILDER_LINE_CLASS: contract.BUILDER_LINE_CLASS,
  VERIFIER_LINE_CLASS: contract.VERIFIER_LINE_CLASS,
  BUILDER_CANONICAL_PROTOCOL: contract.BUILDER_CANONICAL_PROTOCOL,
  VERIFIER_CANONICAL_PROTOCOL: contract.VERIFIER_CANONICAL_PROTOCOL,
  BLOCKER_NAMESPACE: contract.BLOCKER_NAMESPACE,
  BLOCKER_CODE_PATTERN: contract.BLOCKER_CODE_PATTERN,
  HUMAN_REVIEW_REFERENCE_TIME: contract.HUMAN_REVIEW_REFERENCE_TIME,
  // Review sections
  REVIEW_SECTION_IDS: contract.REVIEW_SECTION_IDS,
  REVIEW_SECTION_LABELS_RU: contract.REVIEW_SECTION_LABELS_RU,
  EXPECTED_SECTION_COUNT: contract.EXPECTED_SECTION_COUNT,
  // Source allowlist
  SOURCE_ALLOWLIST: contract.SOURCE_ALLOWLIST,
  SOURCE_ALLOWLIST_REFS: contract.SOURCE_ALLOWLIST_REFS,
  EXPECTED_SOURCE_COUNT: contract.EXPECTED_SOURCE_COUNT,
  // Hard gates
  HARD_GATE_IDS: contract.HARD_GATE_IDS,
  HARD_GATE_STATES: contract.HARD_GATE_STATES,
  HG2_PROVENANCE_INTEGRITY: contract.HG2_PROVENANCE_INTEGRITY,
  HG6_COMPLIANCE_POSTURE: contract.HG6_COMPLIANCE_POSTURE,
  EXPECTED_HARD_GATE_COUNT: contract.EXPECTED_HARD_GATE_COUNT,
  // Verdict rows
  VERDICT_ROWS: contract.VERDICT_ROWS,
  VERDICT_VALUES: contract.VERDICT_VALUES,
  EXPECTED_VERDICT_ROW_COUNT: contract.EXPECTED_VERDICT_ROW_COUNT,
  // Evidence records
  EVIDENCE_RECORDS: contract.EVIDENCE_RECORDS,
  EVIDENCE_RECORD_IDS: contract.EVIDENCE_RECORD_IDS,
  EXPECTED_EVIDENCE_RECORD_COUNT: contract.EXPECTED_EVIDENCE_RECORD_COUNT,
  // M015 comparison
  M015_CRITERION_IDS: contract.M015_CRITERION_IDS,
  EXPECTED_CRITERION_DIFF_ROW_COUNT: contract.EXPECTED_CRITERION_DIFF_ROW_COUNT,
  EXPECTED_CAPABILITY_AUDIT_ROW_COUNT: contract.EXPECTED_CAPABILITY_AUDIT_ROW_COUNT,
  EXPECTED_PROMOTIONS_TO_CONFIRMED: contract.EXPECTED_PROMOTIONS_TO_CONFIRMED,
  EXPECTED_EVIDENCE_DRIVEN_DOWNGRADES: contract.EXPECTED_EVIDENCE_DRIVEN_DOWNGRADES,
  // Div1 communication
  DIV1_COMMUNICATION_KINDS: contract.DIV1_COMMUNICATION_KINDS,
  DIV1_COMPARISON_FIELDS: contract.DIV1_COMPARISON_FIELDS,
  // S08 closure vocabulary
  S08_CLOSURE_VERDICT: contract.S08_CLOSURE_VERDICT,
  S08_STAGE_B_RECOMMENDATION: contract.S08_STAGE_B_RECOMMENDATION,
  // Launch posture
  FROZEN_LAUNCH_POSTURE: contract.FROZEN_LAUNCH_POSTURE,
  // Blocker + exit
  BLOCKER_CODES: contract.BLOCKER_CODES,
  EXIT_CODES: contract.EXIT_CODES,
  // CLI line + defaults
  CLI_LINE_PATTERN: contract.CLI_LINE_PATTERN,
  DEFAULTS: contract.DEFAULTS,
  // Reference aliases
  REF: contract.REF,
});

// ---------------------------------------------------------------------------
// Helpers — pure predicates over the frozen registry
// ---------------------------------------------------------------------------
function isReviewBlockerCode(value) {
  return contract.isReviewBlockerCode(value);
}
function isKnownReviewSection(value) {
  return contract.isKnownReviewSection(value);
}
function isAllowlistedSourceRef(value) {
  return contract.isAllowlistedSourceRef(value);
}
function isKnownHardGate(value) {
  return contract.isKnownHardGate(value);
}
function isKnownEvidenceRecord(value) {
  return contract.isKnownEvidenceRecord(value);
}
function isKnownM015CriterionId(value) {
  return contract.isKnownM015CriterionId(value);
}
function isKnownDiv1CommunicationKind(value) {
  return contract.isKnownDiv1CommunicationKind(value);
}
function isValidOrchestrationVerdict(value) {
  return contract.isValidOrchestrationVerdict(value);
}
function isValidEvidenceVerdict(value) {
  return contract.isValidEvidenceVerdict(value);
}
function isValidLaunchVerdict(value) {
  return contract.isValidLaunchVerdict(value);
}
function isForbiddenReviewVerdict(value) {
  return contract.isForbiddenReviewVerdict(value);
}
function getSourceEntry(ref) {
  return contract.getSourceEntry(ref);
}
function getEvidenceRecord(id) {
  return contract.getEvidenceRecord(id);
}

// ---------------------------------------------------------------------------
// Helpers — invariant sanity probes (pure, side-effect free)
// ---------------------------------------------------------------------------
// Returns a frozen summary of every frozen invariant a downstream
// renderer / verifier can rely on. Useful for boot-time self-checks.
function describeFrozenInvariants() {
  return Object.freeze({
    section_count: contract.EXPECTED_SECTION_COUNT,
    section_ids: contract.REVIEW_SECTION_IDS.slice(),
    source_count: contract.EXPECTED_SOURCE_COUNT,
    source_refs: contract.SOURCE_ALLOWLIST_REFS.slice(),
    hard_gate_count: contract.EXPECTED_HARD_GATE_COUNT,
    hard_gate_ids: contract.HARD_GATE_IDS.slice(),
    verdict_row_count: contract.EXPECTED_VERDICT_ROW_COUNT,
    verdict_rows: contract.VERDICT_ROWS.slice(),
    evidence_record_count: contract.EXPECTED_EVIDENCE_RECORD_COUNT,
    evidence_record_ids: contract.EVIDENCE_RECORD_IDS.slice(),
    m015_criterion_count: contract.EXPECTED_CRITERION_DIFF_ROW_COUNT,
    m015_criterion_ids: contract.M015_CRITERION_IDS.slice(),
    capability_audit_row_count: contract.EXPECTED_CAPABILITY_AUDIT_ROW_COUNT,
    promotions_to_confirmed: contract.EXPECTED_PROMOTIONS_TO_CONFIRMED,
    evidence_driven_downgrades: contract.EXPECTED_EVIDENCE_DRIVEN_DOWNGRADES,
    frozen_launch_posture: Object.assign({}, contract.FROZEN_LAUNCH_POSTURE),
    s08_closure_verdict: contract.S08_CLOSURE_VERDICT,
    s08_stage_b_recommendation: contract.S08_STAGE_B_RECOMMENDATION,
    blocker_namespace: contract.BLOCKER_NAMESPACE,
    exit_codes: Object.assign({}, contract.EXIT_CODES),
  });
}

// Convenience: produces a complete source_hashes map of zero-value
// sha256 placeholders (NOT real digests) so tests / builders can build
// a model without forging upstream hashes. Verifier MUST refuse this
// map because the digests are zero — fail-closed by design.
function placeholderSourceHashes() {
  const out = {};
  for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
    out[ref] = '0'.repeat(64);
  }
  return Object.freeze(out);
}

// Convenience: build a minimal but evaluate-passing model. Used by
// downstream tests + T02 builder smoke tests. The verifier, however,
// MUST still re-derive hashes from disk; this helper exists for the
// pure renderer surface only.
//
// IMPORTANT: `buildReviewModel` treats `opts.worksheet` as RAW INPUTS
// to `buildWorksheet` (HG1..HG8 state keys + orchestration/evidence/
// launch verdict values), NOT as a pre-built worksheet. Callers that
// have already built a worksheet must pass its INPUTS, not the result.
function buildAcceptanceModel(input) {
  const opts = input || {};
  const sourceHashes = opts.sourceHashes || placeholderSourceHashes();
  const worksheetInputs = opts.worksheetInputs || {};
  const m015ComparisonInputs = opts.m015ComparisonInputs || {};
  const div1CommunicationInputs = opts.div1CommunicationInputs || {};
  const worksheet = contract.buildWorksheet(worksheetInputs);
  const sanitised = contract.buildSanitisedProofSummary(opts.sanitisedInputs || {});
  const div1 = contract.buildDiv1Communication(div1CommunicationInputs);
  const launchBoundary = contract.buildLaunchClassBoundary(opts.launchInputs || {});
  const m015 = contract.buildM015Comparison(m015ComparisonInputs);
  const notProven = contract.buildNotProvenPreservation(opts.notProvenInputs || {});
  return contract.buildReviewModel({
    sourceHashes,
    sourceSnapshots: opts.sourceSnapshots || {},
    generated: opts.generated,
    referenceTime: opts.referenceTime,
    operatorGateConfirmed: opts.operatorGateConfirmed === true,
    sections: {
      sanitised_proof_summary: sanitised,
      full_worksheet: worksheet,
      div1_exact_communication: div1,
      launch_class_boundary: launchBoundary,
      m015_comparison: m015,
    },
    notProvenPreservation: notProven,
    // Pass RAW worksheet inputs, not the built worksheet — contract's
    // buildReviewModel calls buildWorksheet(opts.worksheet) internally.
    worksheet: worksheetInputs,
    s08State: opts.s08State,
  });
}

// Convenience: build a complete fake source_snapshots map so
// buildProvenanceAppendix can report `has_artifact_snapshot: true` per
// source — purely a renderer hint; not a real artifact.
function placeholderSourceSnapshots() {
  const out = {};
  for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
    out[ref] = { snapshot_kind: 'placeholder', captured_at: contract.HUMAN_REVIEW_REFERENCE_TIME };
  }
  return Object.freeze(out);
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------
module.exports = Object.freeze({
  // Curated vocabulary
  ...frozenVocabulary,
  // Predicate helpers
  isReviewBlockerCode,
  isKnownReviewSection,
  isAllowlistedSourceRef,
  isKnownHardGate,
  isKnownEvidenceRecord,
  isKnownM015CriterionId,
  isKnownDiv1CommunicationKind,
  isValidOrchestrationVerdict,
  isValidEvidenceVerdict,
  isValidLaunchVerdict,
  isForbiddenReviewVerdict,
  getSourceEntry,
  getEvidenceRecord,
  // Probe + factory helpers
  describeFrozenInvariants,
  placeholderSourceHashes,
  placeholderSourceSnapshots,
  buildAcceptanceModel,
  // Raw builders (re-exported for convenience — contract remains the
  // source of truth)
  buildReviewModel: contract.buildReviewModel,
  buildWorksheet: contract.buildWorksheet,
  buildSanitisedProofSummary: contract.buildSanitisedProofSummary,
  buildDiv1Communication: contract.buildDiv1Communication,
  buildLaunchClassBoundary: contract.buildLaunchClassBoundary,
  buildM015Comparison: contract.buildM015Comparison,
  buildNotProvenPreservation: contract.buildNotProvenPreservation,
  buildProvenanceAppendix: contract.buildProvenanceAppendix,
  evaluateReviewContract: contract.evaluateReviewContract,
  computeReviewDigest: contract.computeReviewDigest,
  buildCliHealthLine: contract.buildCliHealthLine,
  sha256Hex: contract.sha256Hex,
});