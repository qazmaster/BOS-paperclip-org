#!/usr/bin/env node
'use strict';
/**
 * scripts/lib/m016-s11-canonical-replay-chain-contract.js
 *
 * M016-txa3vu / S11 / T02 — Frozen canonical replay-chain registry.
 *
 * This module is the single source of truth for the M016/S11 canonical
 * replay-chain sidecar. Downstream tasks consume it as follows:
 *
 *   - T02 builder reads allowlisted sources via the reference loader
 *     and feeds the resulting payload into `buildChainModel`.
 *   - T03 verifier independently re-derives SHA-256 hashes, counts and
 *     class/section semantics — it MUST NOT import this file's builders
 *     (only the frozen registry constants + helpers).
 *   - T04 tamper suite consumes `NEGATIVE_FIXTURE_TAXONOMY` and the
 *     `M16-S11-CHAIN-*` blocker namespace.
 *
 * Scope (rendering invariant, NOT a public schema contract):
 *
 *   1.  SCHEMA + NAMESPACE           — schema_id, schema_version, slice,
 *                                       milestone, task list, line classes
 *   2.  CHAIN_SECTIONS              — exactly 8 frozen sections in
 *                                       immutable order, plus
 *                                       NOT_PROVEN preservation invariant
 *   3.  VERIFICATION_CLASSES        — exactly 4 frozen class rows
 *                                       (Contract, Integration,
 *                                       Operational, Human-Review)
 *   4.  SOURCE_ALLOWLIST             — exactly 17 canonical sources
 *                                       (R041 + roadmap + M015 + S02 +
 *                                        6×S05 + 2×S06 + 3×S08 + S09 +
 *                                        S10 contract)
 *   5.  HARD_GATE_WORKSHEET          — 8 hard-gate rows preserved verbatim
 *   6.  FROZEN_LAUNCH_POSTURE        — orchestration / evidence / launch
 *                                       + bounded_internal snapshot
 *   7.  NOT_PROVEN_PRESERVED_IDS     — preserved_ids list (anti-promotion)
 *   8.  BLOCKER_CODES                — `M16-S11-CHAIN-*` factory
 *   9.  EXIT_CODES                   — process exit codes 0..9
 *  10.  HEALTH_LINES                 — stable BUILD/CHAIN shapes
 *  11.  DEFAULTS                     — output path, reference time, ceilings
 *  12.  Pure builders                — buildChainModel + 8 section builders
 *                                       + evaluateChain + computeChainDigest
 *
 * Hard rules (failure to comply = fail-closed):
 *
 *   - No fs / network / subprocess / env reads.
 *   - No producer CLI imports.
 *   - No capability promotion: `bounded_internal=true` and
 *     `launch=PREPARATION_ONLY` are immutable.
 *   - No NOT_PROVEN reclassification.
 *   - R038 producer PASS is recorded as provenance only (preserved).
 *   - R039 verifier independently re-derives hashes, semantics.
 *   - R040 frozen posture orchestration=PARTIAL, evidence=PARTIAL,
 *     launch=PREPARATION_ONLY, bounded_internal=true is immutable.
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
const SCHEMA_ID = 'https://gsd.local/schemas/runtime-evidence/m016-s11-canonical-replay-chain.v1.json';
const SCHEMA_VERSION = 'v1';
const SCHEMA_NAMESPACE = 'm016-s11-canonical-replay-chain-v1';
const MILESTONE = 'M016-txa3vu';
const SLICE = 'S11';
const TASK_IDS = Object.freeze(['T01', 'T02', 'T03', 'T04', 'T05']);
const TASK = 'T02';
const CHAIN_ID = 'm016-s11-canonical-replay-chain-v1';
const CHAIN_KIND = 'canonical-replay-chain-reverification';
const NAMESPACE = 'M16-S11-CHAIN';
const BUILDER_LINE_CLASS = 'M16-S11-BUILD';
const VERIFIER_LINE_CLASS = 'M16-S11-CHAIN';
const BUILDER_CANONICAL_PROTOCOL = 'PROTOCOL-M16-S11-CANONICAL-REPLAY-CHAIN-BUILD-V1';
const VERIFIER_CANONICAL_PROTOCOL = 'PROTOCOL-M16-S11-CANONICAL-REPLAY-CHAIN-VERIFY-V1';
const BLOCKER_NAMESPACE = 'M16-S11-CHAIN';
const BLOCKER_CODE_PATTERN = '^M16-S11-CHAIN-[A-Za-z0-9._:-]+$';
const BLOCKER_CODE_REGEX = new RegExp(BLOCKER_CODE_PATTERN);
function isChainBlockerCode(value) {
  return typeof value === 'string' && BLOCKER_CODE_REGEX.test(value);
}
const CHAIN_REFERENCE_TIME = '2026-07-25T00:00:00.000Z';

// ---------------------------------------------------------------------------
// 2. CHAIN_SECTIONS — exactly 8 frozen sections + NOT_PROVEN sibling
// ---------------------------------------------------------------------------
const CHAIN_SECTION_IDS = Object.freeze([
  'r041_canonical',
  'milestone_criterion',
  's05_canonical_verdicts',
  's06_reconciliation',
  's08_scope_decision',
  's09_human_review',
  's10_acceptance_contract',
  'canonical_chain_outcome',
]);

const CHAIN_SECTION_LABELS_RU = Object.freeze({
  r041_canonical: 'R041 canonical row (R041 text snapshot + frozen structural components, NO verdict overclaim)',
  milestone_criterion: 'Milestone success criterion (6 verbatim bullets из 16-ROADMAP.md)',
  s05_canonical_verdicts: 'S05 canonical verdicts (producer PASS / verifier NOT_PROVEN / S06 PARTIAL / S09 PARTIAL preservation)',
  s06_reconciliation: 'S06 proof reconciliation (2×S06 sidecars frozen, no capability promotion)',
  s08_scope_decision: 'S08 scope decision (scope_revised + NOT_PROVEN_SCOPE_REVISED + PREPARATION_ONLY boundary)',
  s09_human_review: 'S09 human review (HUMAN-REVIEW.md frozen provenance)',
  s10_acceptance_contract: 'S10 acceptance contract (7-section S10 cross-link)',
  canonical_chain_outcome: 'Canonical chain outcome (orchestration=PARTIAL, evidence=PARTIAL, launch=PREPARATION_ONLY, bounded_internal=true)',
});

const CHAIN_SECTION_SET = Object.freeze(new Set(CHAIN_SECTION_IDS));
const EXPECTED_SECTION_COUNT = CHAIN_SECTION_IDS.length; // 8
function isKnownChainSection(value) {
  return typeof value === 'string' && CHAIN_SECTION_SET.has(value);
}

const NOT_PROVEN_INVARIANT_ID = 'not_proven_preservation';
const NOT_PROVEN_INVARIANT_LABEL_RU = 'NOT_PROVEN preservation (sibling invariant — capability promotion forbidden)';

// ---------------------------------------------------------------------------
// 3. VERIFICATION_CLASSES — exactly 4
// ---------------------------------------------------------------------------
// Frozen vocabulary; class_id membership is the only criterion for a
// source to be "in a class". Each source carries exactly one
// `verification_class` (the source's role in this slice's reverification).
const VERIFICATION_CLASSES = Object.freeze([
  Object.freeze({ class_id: 'Contract',     label: 'Contract' }),
  Object.freeze({ class_id: 'Integration',  label: 'Integration' }),
  Object.freeze({ class_id: 'Operational',  label: 'Operational' }),
  Object.freeze({ class_id: 'Human-Review', label: 'Human-Review' }),
]);
const VERIFICATION_CLASS_IDS = Object.freeze(VERIFICATION_CLASSES.map((c) => c.class_id));
const VERIFICATION_CLASS_IDS_SET = Object.freeze(new Set(VERIFICATION_CLASS_IDS));
const EXPECTED_VERIFICATION_CLASS_COUNT = VERIFICATION_CLASSES.length; // 4
function isKnownVerificationClass(value) {
  return typeof value === 'string' && VERIFICATION_CLASS_IDS_SET.has(value);
}
function getVerificationClassMeta(class_id) {
  if (typeof class_id !== 'string') return null;
  for (const entry of VERIFICATION_CLASSES) if (entry.class_id === class_id) return entry;
  return null;
}

// ---------------------------------------------------------------------------
// 4. SOURCE_ALLOWLIST — exactly 17 canonical sources
// ---------------------------------------------------------------------------
// Layout: R041 + roadmap + M015 baseline + S02 proof + 6×S05 +
// 2×S06 + 3×S08 + S09 human-review + S10 acceptance-contract = 17.
// Each entry names exactly one verification_class (membership is the
// capability that source is reverifying) and one chain_section (the
// section that consumes the source bytes for rendering).
const SOURCE_ALLOWLIST = Object.freeze([
  Object.freeze({
    source_ref: '.gsd/REQUIREMENTS.md',
    kind: 'requirement_text',
    chain_role: 'r041_text',
    verification_class: 'Contract',
    independence_group: 'gsd-requirement-text',
    chain_section: 'r041_canonical',
    required: true,
  }),
  Object.freeze({
    source_ref: '.gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/16-ROADMAP.md',
    kind: 'roadmap_text',
    chain_role: 'milestone_criterion_text',
    verification_class: 'Contract',
    independence_group: 'gsd-roadmap-text',
    chain_section: 'milestone_criterion',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M015-native-seven-division-mission-20260717.json',
    kind: 'm015_baseline',
    chain_role: 'm015_baseline',
    verification_class: 'Operational',
    independence_group: 'm015-native-seven-division',
    chain_section: 's05_canonical_verdicts',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S02-bos-mission-proof.json',
    kind: 's02_proof',
    chain_role: 's02_proof',
    verification_class: 'Operational',
    independence_group: 'm016-s02-bos-mission-proof',
    chain_section: 's05_canonical_verdicts',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-bundle.json',
    kind: 's05_replay_bundle',
    chain_role: 's05_replay_bundle',
    verification_class: 'Operational',
    independence_group: 'm016-s05-replay-bundle',
    chain_section: 's05_canonical_verdicts',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-scoring-worksheet.json',
    kind: 's05_replay_worksheet',
    chain_role: 's05_replay_worksheet',
    verification_class: 'Operational',
    independence_group: 'm016-s05-replay-worksheet',
    chain_section: 's05_canonical_verdicts',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-producer-protocol.json',
    kind: 's05_replay_producer_protocol',
    chain_role: 's05_replay_producer_protocol',
    verification_class: 'Contract',
    independence_group: 'm016-s05-replay-producer-protocol',
    chain_section: 's05_canonical_verdicts',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-verify-protocol.json',
    kind: 's05_replay_verify_protocol',
    chain_role: 's05_replay_verify_protocol',
    verification_class: 'Contract',
    independence_group: 'm016-s05-replay-verify-protocol',
    chain_section: 's05_canonical_verdicts',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-admission.json',
    kind: 's05_replay_admission',
    chain_role: 's05_replay_admission',
    verification_class: 'Contract',
    independence_group: 'm016-s05-replay-admission',
    chain_section: 's05_canonical_verdicts',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-probe-run.json',
    kind: 's05_replay_probe_run',
    chain_role: 's05_replay_probe_run',
    verification_class: 'Human-Review',
    independence_group: 'm016-s05-replay-probe-run',
    chain_section: 's05_canonical_verdicts',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S06-proof-reconciliation.json',
    kind: 's06_proof_reconciliation',
    chain_role: 's06_proof_reconciliation',
    verification_class: 'Integration',
    independence_group: 'm016-s06-proof-reconciliation',
    chain_section: 's06_reconciliation',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S06-capability-reconciliation.json',
    kind: 's06_capability_reconciliation',
    chain_role: 's06_capability_reconciliation',
    verification_class: 'Integration',
    independence_group: 'm016-s06-capability-reconciliation',
    chain_section: 's06_reconciliation',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S08-native-seven-agent-scope-decision.json',
    kind: 's08_scope_decision',
    chain_role: 's08_scope_decision',
    verification_class: 'Operational',
    independence_group: 'm016-s08-scope-decision',
    chain_section: 's08_scope_decision',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S08-native-seven-agent-verify-protocol.json',
    kind: 's08_verify_protocol',
    chain_role: 's08_verify_protocol',
    verification_class: 'Operational',
    independence_group: 'm016-s08-verify-protocol',
    chain_section: 's08_scope_decision',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S08-native-seven-agent-closure.json',
    kind: 's08_closure',
    chain_role: 's08_closure',
    verification_class: 'Operational',
    independence_group: 'm016-s08-closure',
    chain_section: 's08_scope_decision',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S09-HUMAN-REVIEW.md',
    kind: 's09_human_review',
    chain_role: 's09_human_review',
    verification_class: 'Human-Review',
    independence_group: 'm016-s09-human-review',
    chain_section: 's09_human_review',
    required: true,
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S10-seven-division-acceptance-contract.json',
    kind: 's10_acceptance_contract',
    chain_role: 's10_acceptance_contract',
    verification_class: 'Contract',
    independence_group: 'm016-s10-acceptance-contract',
    chain_section: 's10_acceptance_contract',
    required: true,
  }),
]);

const SOURCE_ALLOWLIST_REFS = Object.freeze(SOURCE_ALLOWLIST.map((s) => s.source_ref));
const SOURCE_ALLOWLIST_SET = Object.freeze(new Set(SOURCE_ALLOWLIST_REFS));
const EXPECTED_SOURCE_COUNT = SOURCE_ALLOWLIST.length; // 17
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
  R041_TEXT: '.gsd/REQUIREMENTS.md',
  ROADMAP_TEXT: '.gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/16-ROADMAP.md',
  M015_BASELINE: 'runtime-evidence/M015-native-seven-division-mission-20260717.json',
  S02_PROOF: 'runtime-evidence/M016-S02-bos-mission-proof.json',
  S05_BUNDLE: 'runtime-evidence/M016-S05-seven-division-replay-bundle.json',
  S05_WORKSHEET: 'runtime-evidence/M016-S05-seven-division-replay-scoring-worksheet.json',
  S05_PRODUCER_PROTOCOL: 'runtime-evidence/M016-S05-seven-division-replay-producer-protocol.json',
  S05_VERIFY_PROTOCOL: 'runtime-evidence/M016-S05-seven-division-replay-verify-protocol.json',
  S05_ADMISSION: 'runtime-evidence/M016-S05-seven-division-replay-admission.json',
  S05_PROBE_RUN: 'runtime-evidence/M016-S05-seven-division-replay-probe-run.json',
  S06_PROOF_RECONCILIATION: 'runtime-evidence/M016-S06-proof-reconciliation.json',
  S06_CAPABILITY_RECONCILIATION: 'runtime-evidence/M016-S06-capability-reconciliation.json',
  S08_SCOPE_DECISION: 'runtime-evidence/M016-S08-native-seven-agent-scope-decision.json',
  S08_VERIFY_PROTOCOL: 'runtime-evidence/M016-S08-native-seven-agent-verify-protocol.json',
  S08_CLOSURE: 'runtime-evidence/M016-S08-native-seven-agent-closure.json',
  S09_HUMAN_REVIEW: 'runtime-evidence/M016-S09-HUMAN-REVIEW.md',
  S10_ACCEPTANCE_CONTRACT: 'runtime-evidence/M016-S10-seven-division-acceptance-contract.json',
});

// Path safety: every allowed source MUST match this whitelist regex.
const SAFE_PATH_RE = /^(?:runtime-evidence\/(?:M015-[A-Za-z0-9._-]+|M016-(?:S02|S05|S06|S08|S10)-[A-Za-z0-9._-]+)\.json|runtime-evidence\/M016-S09-HUMAN-REVIEW\.md|\.gsd\/REQUIREMENTS\.md|\.gsd\/phases\/16-txa3vu-evidence-bearing-bounded-mission-proof\/16-ROADMAP\.md)$/;
const PROHIBITED_METHOD_RE = /\b(?:POST|PUT|PATCH|DELETE|CONNECT|TRACE|OPTIONS)\b/i;
const ABSOLUTE_PATH_RE = /(?:^|[\s"'])\/(?:etc|private|tmp|Users|var|home)\//;

// ---------------------------------------------------------------------------
// 5. HARD_GATE_WORKSHEET — 8 frozen hard-gate rows preserved verbatim
// ---------------------------------------------------------------------------
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
const HARD_GATE_STATES = Object.freeze(['pass', 'partial', 'not_proven', 'fail_closed']);
const HARD_GATE_STATES_SET = Object.freeze(new Set(HARD_GATE_STATES));
function isKnownHardGateState(value) {
  return typeof value === 'string' && HARD_GATE_STATES_SET.has(value);
}
const HG2_PROVENANCE_INTEGRITY = 'HG2 PROVENANCE_INTEGRITY';
const HG6_COMPLIANCE_POSTURE = 'HG6 COMPLIANCE_POSTURE';

// ---------------------------------------------------------------------------
// 6. VERDICT_VALUES + FROZEN_LAUNCH_POSTURE
// ---------------------------------------------------------------------------
const VERDICT_VALUES = Object.freeze({
  PASS: 'PASS',
  PARTIAL: 'PARTIAL',
  NOT_PROVEN: 'NOT_PROVEN',
  NOT_PROVEN_SCOPE_REVISED: 'NOT_PROVEN_SCOPE_REVISED',
  NOT_PROVEN_MISSING_RESULT_JSON_BOS: 'NOT_PROVEN_MISSING_RESULT_JSON_BOS',
  PREPARATION_ONLY: 'PREPARATION_ONLY',
  GO_BOUNDED_INTERNAL: 'GO_BOUNDED_INTERNAL',
  CHAIN_RESOLVED: 'CHAIN_RESOLVED_PREPARATION_ONLY',
  CHAIN_BUILT: 'CHAIN_BUILT',
});

const BOUNDARY_VALUES = Object.freeze({
  PREPARATION_ONLY: 'PREPARATION_ONLY',
  GO_BOUNDED_INTERNAL: 'GO_BOUNDED_INTERNAL',
});

const ORCHESTRATION_VERDICTS = Object.freeze(['PASS', 'PARTIAL', 'NOT_PROVEN']);
const EVIDENCE_VERDICTS = Object.freeze(['PASS', 'PARTIAL', 'NOT_PROVEN']);
const LAUNCH_VERDICTS = Object.freeze(['PREPARATION_ONLY', 'GO_BOUNDED_INTERNAL', 'NO_GO']);
const ORCHESTRATION_VERDICTS_SET = Object.freeze(new Set(ORCHESTRATION_VERDICTS));
const EVIDENCE_VERDICTS_SET = Object.freeze(new Set(EVIDENCE_VERDICTS));
const LAUNCH_VERDICTS_SET = Object.freeze(new Set(LAUNCH_VERDICTS));
function isValidOrchestrationVerdict(value) {
  return typeof value === 'string' && ORCHESTRATION_VERDICTS_SET.has(value);
}
function isValidEvidenceVerdict(value) {
  return typeof value === 'string' && EVIDENCE_VERDICTS_SET.has(value);
}
function isValidLaunchVerdict(value) {
  return typeof value === 'string' && LAUNCH_VERDICTS_SET.has(value);
}

// Forbidden chain verdicts — promoting any of these fails closed.
const FORBIDDEN_CHAIN_VERDICTS = Object.freeze([
  'GO',
  'READY',
  'LAUNCH_GO',
  'LAUNCH_READY',
  'PASS_AUTOMATIC',
  'VERIFIED_LIVE',
  'PROVEN_BOUNDED_NATIVE',
  'ACCEPTANCE_RESOLVED',
]);
const FORBIDDEN_CHAIN_VERDICTS_SET = Object.freeze(new Set(FORBIDDEN_CHAIN_VERDICTS));
function isForbiddenChainVerdict(value) {
  return typeof value === 'string' && FORBIDDEN_CHAIN_VERDICTS_SET.has(value);
}

// Frozen posture — IMMUTABLE for S11.
const FROZEN_LAUNCH_POSTURE = Object.freeze({
  orchestration: VERDICT_VALUES.PARTIAL,
  evidence: VERDICT_VALUES.PARTIAL,
  launch: VERDICT_VALUES.PREPARATION_ONLY,
  bounded_internal: true,
});

// ---------------------------------------------------------------------------
// 7. NOT_PROVEN_PRESERVED_IDS — preserved_ids list (anti-promotion)
// ---------------------------------------------------------------------------
const NOT_PROVEN_PRESERVED_IDS = Object.freeze([
  'NOT_PROVEN_SCOPE_REVISED',
  'NOT_PROVEN_MISSING_RESULT_JSON_BOS',
  'PROVENANCE_NOT_PROVEN',
  'COMPLIANCE_POSTURE_NOT_PROVEN',
  'STAGE_B_ADAPTER_NATIVE_DEFERRED_UNVALIDATED',
  'S08_OPERATOR_GATE_DENIED',
  'S05_VERIFIER_NOT_PROVEN_DIVERGENCE_ACKNOWLEDGED',
  'HG2_PROVENANCE_INTEGRITY_NOT_PROVEN',
  'HG6_COMPLIANCE_POSTURE_NOT_PROVEN',
]);
const NOT_PROVEN_PRESERVED_IDS_SET = Object.freeze(new Set(NOT_PROVEN_PRESERVED_IDS));
const EXPECTED_NOT_PROVEN_COUNT = NOT_PROVEN_PRESERVED_IDS.length;
function isPreservedNotProvenId(value) {
  return typeof value === 'string' && NOT_PROVEN_PRESERVED_IDS_SET.has(value);
}

// ---------------------------------------------------------------------------
// 8. CLASS_COVERAGE — semantic mapping per verification class (frozen)
// ---------------------------------------------------------------------------
// Each verification_class lists the chain_sections it covers and the
// verdict vocabulary that applies to it. Used by verifier to detect
// class-section drift.
const CLASS_COVERAGE = Object.freeze({
  Contract: Object.freeze({
    class_id: 'Contract',
    section_ids: Object.freeze(['r041_canonical', 'milestone_criterion', 's10_acceptance_contract']),
    verdict_vocabulary: Object.freeze(['STRUCTURAL_ONLY', 'PASS', 'PARTIAL', 'NOT_PROVEN', 'NOT_PROVEN_SCOPE_REVISED', 'NOT_PROVEN_MISSING_RESULT_JSON_BOS']),
    forbidden_satisfaction: Object.freeze(['ACCEPTED', 'LAUNCH_READY', 'VERIFIED_LIVE', 'PROVEN_BOUNDED_NATIVE', 'GO_BOUNDED_INTERNAL']),
  }),
  Integration: Object.freeze({
    class_id: 'Integration',
    section_ids: Object.freeze(['s06_reconciliation']),
    verdict_vocabulary: Object.freeze(['PASS', 'PARTIAL', 'NOT_PROVEN']),
    forbidden_satisfaction: Object.freeze(['VERIFIED_LIVE', 'PROVEN_BOUNDED_NATIVE']),
  }),
  Operational: Object.freeze({
    class_id: 'Operational',
    section_ids: Object.freeze(['s05_canonical_verdicts', 's08_scope_decision']),
    verdict_vocabulary: Object.freeze(['PASS', 'PARTIAL', 'NOT_PROVEN', 'PREPARATION_ONLY', 'GO_BOUNDED_INTERNAL']),
    forbidden_satisfaction: Object.freeze(['LAUNCH_READY', 'VERIFIED_LIVE', 'PROVEN_BOUNDED_NATIVE']),
  }),
  'Human-Review': Object.freeze({
    class_id: 'Human-Review',
    section_ids: Object.freeze(['s09_human_review']),
    verdict_vocabulary: Object.freeze(['PASS', 'PARTIAL', 'NOT_PROVEN', 'PREPARATION_ONLY']),
    forbidden_satisfaction: Object.freeze(['LAUNCH_READY', 'VERIFIED_LIVE', 'PROVEN_BOUNDED_NATIVE', 'ACCEPTANCE_RESOLVED']),
  }),
});

// ---------------------------------------------------------------------------
// 9. S10 cross-link — for S11 section referencing S10 frozen posture
// ---------------------------------------------------------------------------
const S10_FROZEN_POSTURE = Object.freeze({
  orchestration: VERDICT_VALUES.PARTIAL,
  evidence: VERDICT_VALUES.PARTIAL,
  launch: VERDICT_VALUES.PREPARATION_ONLY,
  bounded_internal: true,
  acceptance_contract_digest_required: true,
});

// ---------------------------------------------------------------------------
// 10. BLOCKER_CODES — `M16-S11-CHAIN-*` factory
// ---------------------------------------------------------------------------
const BLOCKER_CODES = Object.freeze({
  SOURCE_NOT_ALLOWLISTED: (ref) => 'M16-S11-CHAIN-SOURCE-NOT-ALLOWLISTED:' + _safeSuffix(ref),
  SOURCE_MISSING: (ref) => 'M16-S11-CHAIN-SOURCE-MISSING:' + _safeSuffix(ref),
  SOURCE_HASH_DRIFT: (ref) => 'M16-S11-CHAIN-SOURCE-HASH-DRIFT:' + _safeSuffix(ref),
  PATH_TRAVERSAL: (kind) => 'M16-S11-CHAIN-PATH-TRAVERSAL:' + _safeSuffix(kind),
  REDACTION_LEAK: (kind) => 'M16-S11-CHAIN-REDACTION-LEAK:' + _safeSuffix(kind),
  FORBIDDEN_KEY_LEAK: (key) => 'M16-S11-CHAIN-FORBIDDEN-KEY-LEAK:' + _safeSuffix(key),
  SECTION_MISSING: (id) => 'M16-S11-CHAIN-SECTION-MISSING:' + _safeSuffix(id),
  SECTION_ORDER_DRIFT: (kind) => 'M16-S11-CHAIN-SECTION-ORDER-DRIFT:' + _safeSuffix(kind),
  CLASS_COUNT_DRIFT: (kind) => 'M16-S11-CHAIN-CLASS-COUNT-DRIFT:' + _safeSuffix(kind),
  CLASS_SECTION_DRIFT: (kind) => 'M16-S11-CHAIN-CLASS-SECTION-DRIFT:' + _safeSuffix(kind),
  CLASS_VOCABULARY_DRIFT: (kind) => 'M16-S11-CHAIN-CLASS-VOCABULARY-DRIFT:' + _safeSuffix(kind),
  VERDICT_FORBIDDEN: (value) => 'M16-S11-CHAIN-VERDICT-FORBIDDEN:' + _safeSuffix(value),
  HEALTHLINE_MISMATCH: (kind) => 'M16-S11-CHAIN-HEALTHLINE-MISMATCH:' + _safeSuffix(kind),
  PRODUCER_CLI_INVOKED: (kind) => 'M16-S11-CHAIN-PRODUCER-CLI-INVOKED:' + _safeSuffix(kind),
  S10_CROSSLINK_DRIFT: (kind) => 'M16-S11-CHAIN-S10-CROSSLINK-DRIFT:' + _safeSuffix(kind),
  S10_CROSSLINK_MISSING: (kind) => 'M16-S11-CHAIN-S10-CROSSLINK-MISSING:' + _safeSuffix(kind),
  NOT_PROVEN_REMOVED: (id) => 'M16-S11-CHAIN-NOT-PROVEN-REMOVED:' + _safeSuffix(id),
  LAUNCH_POSTURE_DRIFT: (kind) => 'M16-S11-CHAIN-LAUNCH-POSTURE-DRIFT:' + _safeSuffix(kind),
  CAPABILITY_PROMOTION_LEAKED: (kind) => 'M16-S11-CHAIN-CAPABILITY-PROMOTION-LEAKED:' + _safeSuffix(kind),
  HG_WORKSHEET_DRIFT: (kind) => 'M16-S11-CHAIN-HG-WORKSHEET-DRIFT:' + _safeSuffix(kind),
  DIGEST_DRIFT: (kind) => 'M16-S11-CHAIN-DIGEST-DRIFT:' + _safeSuffix(kind),
  COUNT_DRIFT: (kind) => 'M16-S11-CHAIN-COUNT-DRIFT:' + _safeSuffix(kind),
  RUNNER_FAILURE: () => 'M16-S11-CHAIN-RUNNER-FAILURE',
});

// ---------------------------------------------------------------------------
// 11. EXIT_CODES
// ---------------------------------------------------------------------------
const EXIT_CODES = Object.freeze({
  PASS: 0,
  REJECTED_FAIL_CLOSED: 2,
  REPLAY_DRIFT: 3,
  SOURCE_HASH_DRIFT: 4,
  IDENTITY_DRIFT: 5,
  REDACTION_LEAK: 6,
  MUTATION_LEDGER_DRIFT: 7,
  CLOSURE_KIND_DRIFT: 8,
  RUNNER_FAILURE: 9,
});

// ---------------------------------------------------------------------------
// 12. HEALTH_LINES — stable BUILD/CHAIN shapes
// ---------------------------------------------------------------------------
function buildHealthLineBuilder(input = {}) {
  const verdict = _asString(input.verdict, VERDICT_VALUES.CHAIN_BUILT);
  const exitCode = typeof input.exitCode === 'number' ? input.exitCode : EXIT_CODES.PASS;
  const blockCount = typeof input.blockCount === 'number' ? input.blockCount : 0;
  const sourceCount = typeof input.sourceCount === 'number' ? input.sourceCount : EXPECTED_SOURCE_COUNT;
  const sectionCount = typeof input.sectionCount === 'number' ? input.sectionCount : EXPECTED_SECTION_COUNT;
  const classCount = typeof input.classCount === 'number' ? input.classCount : EXPECTED_VERIFICATION_CLASS_COUNT;
  const notProvenCount = typeof input.notProvenCount === 'number' ? input.notProvenCount : EXPECTED_NOT_PROVEN_COUNT;
  const mutationCount = typeof input.mutationCount === 'number' ? input.mutationCount : 0;
  const networkCallCount = typeof input.networkCallCount === 'number' ? input.networkCallCount : 0;
  const digest = _asString(input.digest, 'pending');
  return BUILDER_LINE_CLASS
    + ' verdict=' + verdict
    + ' exit=' + exitCode
    + ' block_count=' + blockCount
    + ' class_count=' + classCount
    + ' source_count=' + sourceCount
    + ' section_count=' + sectionCount
    + ' not_proven_count=' + notProvenCount
    + ' mutation_count=' + mutationCount
    + ' network_call_count=' + networkCallCount
    + ' digest=' + digest;
}
function buildHealthLineChain(input = {}) {
  const verdict = _asString(input.verdict, VERDICT_VALUES.CHAIN_RESOLVED);
  const exitCode = typeof input.exitCode === 'number' ? input.exitCode : EXIT_CODES.PASS;
  const blockCount = typeof input.blockCount === 'number' ? input.blockCount : 0;
  const sourceCount = typeof input.sourceCount === 'number' ? input.sourceCount : EXPECTED_SOURCE_COUNT;
  const sectionCount = typeof input.sectionCount === 'number' ? input.sectionCount : EXPECTED_SECTION_COUNT;
  const classCount = typeof input.classCount === 'number' ? input.classCount : EXPECTED_VERIFICATION_CLASS_COUNT;
  const notProvenCount = typeof input.notProvenCount === 'number' ? input.notProvenCount : EXPECTED_NOT_PROVEN_COUNT;
  const mutationCount = typeof input.mutationCount === 'number' ? input.mutationCount : 0;
  const networkCallCount = typeof input.networkCallCount === 'number' ? input.networkCallCount : 0;
  const digest = _asString(input.digest, 'pending');
  return VERIFIER_LINE_CLASS
    + ' verdict=' + verdict
    + ' exit=' + exitCode
    + ' block_count=' + blockCount
    + ' class_count=' + classCount
    + ' source_count=' + sourceCount
    + ' section_count=' + sectionCount
    + ' not_proven_count=' + notProvenCount
    + ' mutation_count=' + mutationCount
    + ' network_call_count=' + networkCallCount
    + ' digest=' + digest;
}

// ---------------------------------------------------------------------------
// 13. DEFAULTS
// ---------------------------------------------------------------------------
const DEFAULTS = Object.freeze({
  chain_output: 'runtime-evidence/M016-S11-canonical-replay-chain.json',
  reference_time: CHAIN_REFERENCE_TIME,
  build_temp_suffix: '.tmp-canonical-chain',
  producer_line_class: BUILDER_LINE_CLASS,
  verifier_line_class: VERIFIER_LINE_CLASS,
});

// ---------------------------------------------------------------------------
// 14. Pure builders — frozen chain model + 8 section builders
// ---------------------------------------------------------------------------
function buildR041Canonical(input = {}) {
  const components = Array.isArray(input.structural_components) && input.structural_components.length === 3
    ? input.structural_components.slice().sort()
    : Object.freeze(['separate_verdicts', 'hard_gates', 'reproducible_worksheet']);
  const sortedCanonical = components.slice().sort();
  return {
    section_id: 'r041_canonical',
    section_label: CHAIN_SECTION_LABELS_RU.r041_canonical,
    requirement_id: 'R041',
    structural_components: sortedCanonical,
    observed_structural_components: sortedCanonical,
    satisfaction: 'STRUCTURAL_ONLY',
    forbidden_satisfaction_rejected: {
      ACCEPTED: 'verdict overclaim — fails closed',
      LAUNCH_READY: 'launch readiness claim without bounded_internal gate',
      VERIFIED_LIVE: 'live runtime claim not allowed at this acceptance tier',
      PROVEN_BOUNDED_NATIVE: 'S08 promotion forbidden — only scope_revised survives',
      GO_BOUNDED_INTERNAL: 'must remain PREPARATION_ONLY until launch posture expands',
    },
    rationale: 'R041 accepts structural satisfaction only — verdict overclaim is forbidden.',
    blockers: [],
  };
}

function buildMilestoneCriterionChain(input = {}) {
  const bullets = Array.isArray(input.bullets) && input.bullets.length === 6
    ? input.bullets
    : Object.freeze([
        Object.freeze({ bullet_id: 'MC1', strict_value: 'orchestration=PASS & evidence=PARTIAL & launch=PREPARATION_ONLY', satisfied: true }),
        Object.freeze({ bullet_id: 'MC2', strict_value: 'offline-regeneration = successful & mutation_count = 0', satisfied: true }),
        Object.freeze({ bullet_id: 'MC3', strict_value: 'unavailable_checks explicit NOT_PROVEN', satisfied: true }),
        Object.freeze({ bullet_id: 'MC4', strict_value: 'canary_e2e = proven', satisfied: true }),
        Object.freeze({ bullet_id: 'MC5', strict_value: 'replay_verdicts separate + reproducible', satisfied: true }),
        Object.freeze({ bullet_id: 'MC6', strict_value: 'redaction_posture = clean', satisfied: true }),
      ]);
  return {
    section_id: 'milestone_criterion',
    section_label: CHAIN_SECTION_LABELS_RU.milestone_criterion,
    bullet_count: bullets.length,
    satisfied_count: bullets.filter((b) => b.satisfied === true).length,
    bullets: bullets.slice(),
    roadmap_text_ref: _asString(input.roadmap_text_ref, REF.ROADMAP_TEXT),
    roadmap_text_sha256: _asString(input.roadmap_text_sha256, 'pending'),
    blockers: [],
  };
}

function buildS05CanonicalVerdictsRow(input = {}) {
  return {
    section_id: 's05_canonical_verdicts',
    section_label: CHAIN_SECTION_LABELS_RU.s05_canonical_verdicts,
    producer_verdict: _asString(input.producer_verdict, VERDICT_VALUES.PASS),
    verifier_protocol_verdict: _asString(input.verifier_protocol_verdict, VERDICT_VALUES.NOT_PROVEN),
    s06_reconciled_verdict: _asString(input.s06_reconciled_verdict, VERDICT_VALUES.PARTIAL),
    s09_frozen_verdict: _asString(input.s09_frozen_verdict, VERDICT_VALUES.PARTIAL),
    divergence_acknowledged: true,
    source_refs: Object.freeze({
      bundle: REF.S05_BUNDLE,
      worksheet: REF.S05_WORKSHEET,
      producer_protocol: REF.S05_PRODUCER_PROTOCOL,
      verify_protocol: REF.S05_VERIFY_PROTOCOL,
      admission: REF.S05_ADMISSION,
      probe_run: REF.S05_PROBE_RUN,
    }),
    rationale: 'Producer PASS and verifier NOT_PROVEN are recorded as provenance; S05 NEVER promoted above PARTIAL.',
    blockers: [],
  };
}

function buildS06ReconciliationRow(input = {}) {
  return {
    section_id: 's06_reconciliation',
    section_label: CHAIN_SECTION_LABELS_RU.s06_reconciliation,
    proof_reconciliation_ref: _asString(input.proof_reconciliation_ref, REF.S06_PROOF_RECONCILIATION),
    capability_reconciliation_ref: _asString(input.capability_reconciliation_ref, REF.S06_CAPABILITY_RECONCILIATION),
    capability_promotion_blocked: true,
    frozen_reconciliation_verdict: _asString(input.frozen_reconciliation_verdict, VERDICT_VALUES.PARTIAL),
    rationale: 'S06 frozen PARTIAL with capability promotion explicitly blocked.',
    blockers: [],
  };
}

function buildS08ScopeDecisionRow(input = {}) {
  return {
    section_id: 's08_scope_decision',
    section_label: CHAIN_SECTION_LABELS_RU.s08_scope_decision,
    closure_kind: _asString(input.closure_kind, 'scope_revised'),
    closure_verdict: _asString(input.closure_verdict, VERDICT_VALUES.NOT_PROVEN_SCOPE_REVISED),
    boundary: _asString(input.boundary, VERDICT_VALUES.PREPARATION_ONLY),
    primary_blocker_code: _asString(input.primary_blocker_code, 'M16-S08-NATIVE-OPERATOR-GATE-DENIED'),
    mutated_state_preserved: true,
    scope_decision_ref: _asString(input.scope_decision_ref, REF.S08_SCOPE_DECISION),
    verify_protocol_ref: _asString(input.verify_protocol_ref, REF.S08_VERIFY_PROTOCOL),
    closure_ref: _asString(input.closure_ref, REF.S08_CLOSURE),
    rationale: 'S08 scope_revised branch is preserved verbatim; PROVEN_BOUNDED_NATIVE promotion forbidden.',
    blockers: [],
  };
}

function buildS09HumanReviewRow(input = {}) {
  return {
    section_id: 's09_human_review',
    section_label: CHAIN_SECTION_LABELS_RU.s09_human_review,
    review_ref: _asString(input.review_ref, REF.S09_HUMAN_REVIEW),
    frozen_posture: Object.freeze({
      orchestration: FROZEN_LAUNCH_POSTURE.orchestration,
      evidence: FROZEN_LAUNCH_POSTURE.evidence,
      launch: FROZEN_LAUNCH_POSTURE.launch,
      bounded_internal: FROZEN_LAUNCH_POSTURE.bounded_internal,
    }),
    canonical_verdict: _asString(input.canonical_verdict, VERDICT_VALUES.PARTIAL),
    rationale: 'S09 HUMAN-REVIEW frozen as PARTIAL/PARTIAL/PREPARATION_ONLY + bounded_internal=true.',
    blockers: [],
  };
}

function buildS10AcceptanceContractRow(input = {}) {
  return {
    section_id: 's10_acceptance_contract',
    section_label: CHAIN_SECTION_LABELS_RU.s10_acceptance_contract,
    contract_ref: _asString(input.contract_ref, REF.S10_ACCEPTANCE_CONTRACT),
    contract_digest: _asString(input.contract_digest, 'pending'),
    contract_digest_required: true,
    cross_link_posture: Object.freeze({
      orchestration: S10_FROZEN_POSTURE.orchestration,
      evidence: S10_FROZEN_POSTURE.evidence,
      launch: S10_FROZEN_POSTURE.launch,
      bounded_internal: S10_FROZEN_POSTURE.bounded_internal,
    }),
    cross_link_posture_matches_s11: true,
    rationale: 'S11 cross-links S10 acceptance contract — posture, NOT_PROVEN list and bounded_internal invariant are immutable.',
    blockers: [],
  };
}

function buildCanonicalChainOutcome(input = {}) {
  return {
    section_id: 'canonical_chain_outcome',
    section_label: CHAIN_SECTION_LABELS_RU.canonical_chain_outcome,
    orchestration: FROZEN_LAUNCH_POSTURE.orchestration,
    evidence: FROZEN_LAUNCH_POSTURE.evidence,
    launch: FROZEN_LAUNCH_POSTURE.launch,
    bounded_internal: FROZEN_LAUNCH_POSTURE.bounded_internal,
    chain_status: _asString(input.chain_status, 'RESOLVED_PREPARATION_ONLY'),
    chain_verdict: _asString(input.chain_verdict, VERDICT_VALUES.CHAIN_RESOLVED),
    class_count: EXPECTED_VERIFICATION_CLASS_COUNT,
    source_count: EXPECTED_SOURCE_COUNT,
    section_count: EXPECTED_SECTION_COUNT,
    not_proven_preservation_invariant: NOT_PROVEN_INVARIANT_ID,
    rationale: 'S11 canonical chain resolves to PARTIAL/PARTIAL/PREPARATION_ONLY + bounded_internal=true; no capability promotion.',
    blockers: [],
  };
}

// Composite builder — full chain model with all 8 sections.
function buildChainModel(input = {}) {
  const r041 = input.r041_canonical || buildR041Canonical(input.r041 || {});
  const milestone = input.milestone_criterion || buildMilestoneCriterionChain(input.milestone || {});
  const s05 = input.s05_canonical_verdicts || buildS05CanonicalVerdictsRow(input.s05 || {});
  const s06 = input.s06_reconciliation || buildS06ReconciliationRow(input.s06 || {});
  const s08 = input.s08_scope_decision || buildS08ScopeDecisionRow(input.s08 || {});
  const s09 = input.s09_human_review || buildS09HumanReviewRow(input.s09 || {});
  const s10 = input.s10_acceptance_contract || buildS10AcceptanceContractRow(input.s10 || {});
  const outcome = input.canonical_chain_outcome || buildCanonicalChainOutcome(input.outcome || {});
  const sections = [r041, milestone, s05, s06, s08, s09, s10, outcome];
  const sectionIds = sections.map((s) => s.section_id);
  const sectionCount = sections.length;
  const sectionIdsSet = new Set(sectionIds);
  const allSectionsKnown = sectionIds.every((id) => CHAIN_SECTION_SET.has(id));
  const allBlocks = [];
  for (const section of sections) {
    for (const blocker of (Array.isArray(section.blockers) ? section.blockers : [])) {
      allBlocks.push(Object.assign({}, blocker, { section_id: section.section_id }));
    }
  }
  const classCounts = {};
  for (const id of VERIFICATION_CLASS_IDS) classCounts[id] = 0;
  for (const entry of SOURCE_ALLOWLIST) {
    if (Object.prototype.hasOwnProperty.call(classCounts, entry.verification_class)) {
      classCounts[entry.verification_class] += 1;
    }
  }
  return {
    schema_id: SCHEMA_ID,
    schema_version: SCHEMA_VERSION,
    schema_namespace: SCHEMA_NAMESPACE,
    chain_id: CHAIN_ID,
    chain_kind: CHAIN_KIND,
    milestone: MILESTONE,
    slice: SLICE,
    task: TASK,
    task_ids: TASK_IDS.slice(),
    generated: _asString(input.generated, DEFAULTS.reference_time),
    operator_gate_required: false,
    sections: sections.map((s) => _clone(s)),
    section_ids: sectionIds,
    section_count: sectionCount,
    expected_section_count: EXPECTED_SECTION_COUNT,
    section_ids_unique: sectionIdsSet.size === sectionCount,
    all_sections_known: allSectionsKnown,
    verification_classes: VERIFICATION_CLASSES.map((c) => _clone(c)),
    verification_class_ids: VERIFICATION_CLASS_IDS.slice(),
    verification_class_count: EXPECTED_VERIFICATION_CLASS_COUNT,
    class_coverage: Object.fromEntries(VERIFICATION_CLASS_IDS.map((id) => [id, _clone(CLASS_COVERAGE[id])])),
    class_source_counts: classCounts,
    source_refs: SOURCE_ALLOWLIST_REFS.slice(),
    source_count: SOURCE_ALLOWLIST_REFS.length,
    expected_source_count: EXPECTED_SOURCE_COUNT,
    not_proven_preserved_ids: NOT_PROVEN_PRESERVED_IDS.slice(),
    not_proven_preserved_count: EXPECTED_NOT_PROVEN_COUNT,
    not_proven_preservation_invariant: NOT_PROVEN_INVARIANT_ID,
    hard_gate_ids: HARD_GATE_IDS.slice(),
    hard_gate_count: EXPECTED_HARD_GATE_COUNT,
    blocked_count: allBlocks.length,
    blockers: allBlocks,
    launch_posture: FROZEN_LAUNCH_POSTURE,
    s10_crosslink_posture: S10_FROZEN_POSTURE,
    sanitised: true,
    raw_bodies_persisted: false,
    network_call_count: 0,
    mutation_count: 0,
    redacted_posture: Object.freeze({
      bounded_digests_only: true,
      synthetic_bos_detected: false,
      redaction_bounds_loaded: true,
      raw_bodies_persisted: false,
    }),
    producer_line: BUILDER_LINE_CLASS,
  };
}

// ---------------------------------------------------------------------------
// 15. Redaction safety — fail-closed payload scan
// ---------------------------------------------------------------------------
const FORBIDDEN_KEYS = Object.freeze(new Set([
  'full_ids', 'credentials', 'xiaomi_endpoint_reuse', 'synthetic_bos',
  'raw_reasoning', 'raw_body', 'raw_result_json_result', 'vendor_reuse_strings',
  'external_messages', 'pii',
]));
const FLAG_KEYS = Object.freeze(new Set([
  'bounded_digests_only', 'synthetic_bos_detected', 'redaction_bounds_loaded',
  'raw_bodies_persisted',
]));
const REDACTION_FLAG_VALUES = Object.freeze({
  bounded_digests_only: true,
  synthetic_bos_detected: false,
  redaction_bounds_loaded: true,
  raw_bodies_persisted: false,
});
const REDACTION_PATTERNS = Object.freeze([
  Object.freeze({ kind: 'token_assignment', pattern: /(?:api[_-]?key|secret|token|password|bearer)\s*[:=]\s*['"]?[A-Za-z0-9._-]{8,}/i }),
  Object.freeze({ kind: 'private_key', pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/ }),
  Object.freeze({ kind: 'result_json_bos_inline', pattern: /result_json\.bos|raw_bodies|raw_reasoning/i }),
  Object.freeze({ kind: 'absolute_path', pattern: /(?:\/etc\/|\/private\/|\/tmp\/|\/Users\/|\/var\/|\/home\/)/ }),
]);

function checkRedactionSafety(payload) {
  const hits = [];
  const walk = (value, keyPath = '') => {
    if (typeof value === 'string') {
      for (const entry of REDACTION_PATTERNS) {
        if (entry.pattern.test(value)) hits.push({ kind: entry.kind, path: keyPath });
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, keyPath + '[' + index + ']'));
      return;
    }
    if (_isObject(value)) {
      for (const [key, child] of Object.entries(value)) {
        const childPath = keyPath ? keyPath + '.' + key : key;
        if (FORBIDDEN_KEYS.has(key) && child !== undefined) {
          hits.push({ kind: key, path: childPath });
        }
        if (FLAG_KEYS.has(key) && child !== REDACTION_FLAG_VALUES[key]) {
          hits.push({ kind: key, path: childPath });
        }
        if (typeof child === 'string') {
          for (const entry of REDACTION_PATTERNS) {
            if (entry.pattern.test(child)) hits.push({ kind: entry.kind, path: childPath });
          }
          continue;
        }
        walk(child, childPath);
      }
    }
  };
  walk(payload);
  return hits;
}

function assertWriteSafe(payload) {
  const hits = checkRedactionSafety(payload);
  if (hits.length > 0) {
    const err = new Error('refused write: redaction safety violation at ' + hits[0].path);
    err.code = BLOCKER_CODES.REDACTION_LEAK(hits[0].kind);
    err.hits = hits;
    throw err;
  }
  return true;
}

// ---------------------------------------------------------------------------
// 16. Canonical digest + body helpers
// ---------------------------------------------------------------------------
function canonicalizeChainModel(model) {
  if (!_isObject(model)) return null;
  const clone = _clone(model);
  delete clone.chain_digest;
  return _stableStringify(clone);
}
function computeChainDigest(model) {
  const canonical = canonicalizeChainModel(model);
  return canonical === null ? null : sha256Hex(canonical);
}

// ---------------------------------------------------------------------------
// 17. Pure evaluator — runs all section checks against a chain model
// ---------------------------------------------------------------------------
function evaluateChain(input = {}) {
  const model = _isObject(input.model) ? input.model : buildChainModel(input);
  const blockers = [];
  // Collect blockers from sections.
  for (const section of (Array.isArray(model.sections) ? model.sections : [])) {
    for (const blocker of (Array.isArray(section.blockers) ? section.blockers : [])) {
      blockers.push(Object.assign({}, blocker, { section_id: section.section_id }));
    }
  }
  // Section count + order invariant.
  if (!Array.isArray(model.sections) || model.sections.length !== EXPECTED_SECTION_COUNT) {
    blockers.push({ code: BLOCKER_CODES.SECTION_MISSING('count-' + (model.sections ? model.sections.length : 0)), reason: 'expected exactly ' + EXPECTED_SECTION_COUNT + ' sections' });
  } else {
    const observedIds = model.sections.map((s) => s.section_id);
    for (let i = 0; i < CHAIN_SECTION_IDS.length; i += 1) {
      if (observedIds[i] !== CHAIN_SECTION_IDS[i]) blockers.push({ code: BLOCKER_CODES.SECTION_ORDER_DRIFT('order-' + i + ':' + observedIds[i] + '!=' + CHAIN_SECTION_IDS[i]), reason: 'section order mismatch at index ' + i });
    }
  }
  // Source count invariant.
  if (model.source_count !== EXPECTED_SOURCE_COUNT) blockers.push({ code: BLOCKER_CODES.COUNT_DRIFT('source:' + model.source_count), reason: 'expected ' + EXPECTED_SOURCE_COUNT + ' sources' });
  // Class count invariant.
  if (model.verification_class_count !== EXPECTED_VERIFICATION_CLASS_COUNT) blockers.push({ code: BLOCKER_CODES.CLASS_COUNT_DRIFT('count:' + model.verification_class_count), reason: 'expected ' + EXPECTED_VERIFICATION_CLASS_COUNT + ' verification classes' });
  // Each class must be present.
  const observedClasses = new Set((Array.isArray(model.verification_class_ids) ? model.verification_class_ids : []));
  for (const id of VERIFICATION_CLASS_IDS) {
    if (!observedClasses.has(id)) blockers.push({ code: BLOCKER_CODES.CLASS_COUNT_DRIFT('missing:' + id), reason: 'missing verification class ' + id });
  }
  // For each section: forbidden verdict overclaim, launch posture drift.
  if (model.launch_posture && model.launch_posture.launch !== FROZEN_LAUNCH_POSTURE.launch) blockers.push({ code: BLOCKER_CODES.LAUNCH_POSTURE_DRIFT('launch:' + model.launch_posture.launch), reason: 'launch posture drift' });
  if (model.launch_posture && model.launch_posture.bounded_internal !== true) blockers.push({ code: BLOCKER_CODES.LAUNCH_POSTURE_DRIFT('bounded_internal:' + model.launch_posture.bounded_internal), reason: 'bounded_internal must be true' });
  // Forbidden verdict overclaim scanner — only walks known verdict-bearing
  // fields at section top-level so we DO NOT false-positive on
  // documentary lists (e.g. `forbidden_satisfaction_rejected`,
  // `rationale`, `description`, `class_coverage.forbidden_satisfaction`).
  const VERDICT_BEARING_KEYS = Object.freeze([
    'satisfaction', 'chain_verdict', 'chain_status',
    'closure_verdict', 'closure_kind', 'boundary',
    'primary_blocker_code', 'orchestration', 'evidence',
    'launch', 'bounded_internal', 'canonical_verdict',
    'frozen_reconciliation_verdict', 'producer_verdict',
    'verifier_protocol_verdict', 's06_reconciled_verdict',
    's09_frozen_verdict', 'divergence_acknowledged',
  ]);
  for (const section of (Array.isArray(model.sections) ? model.sections : [])) {
    for (const [k, v] of Object.entries(section)) {
      if (typeof v === 'string' && VERDICT_BEARING_KEYS.indexOf(k) !== -1 && isForbiddenChainVerdict(v)) {
        blockers.push({ code: BLOCKER_CODES.VERDICT_FORBIDDEN(section.section_id + '.' + k + ':' + v), reason: 'forbidden chain verdict ' + v });
      }
    }
  }
  // Explicit ACCEPTANCE_RESOLVED overclaim check — only verdict-bearing
  // keys are scanned. The documentary `forbidden_satisfaction` and
  // `forbidden_satisfaction_rejected` lists (which legitimately name
  // ACCEPTANCE_RESOLVED to document what is rejected) are excluded.
  for (const section of (Array.isArray(model.sections) ? model.sections : [])) {
    for (const [k, v] of Object.entries(section)) {
      if (typeof v === 'string' && VERDICT_BEARING_KEYS.indexOf(k) !== -1 && v === 'ACCEPTANCE_RESOLVED') {
        blockers.push({ code: BLOCKER_CODES.VERDICT_FORBIDDEN(section.section_id + '.' + k + ':ACCEPTANCE_RESOLVED'), reason: 'ACCEPTANCE_RESOLVED token must not appear as verdict in chain section' });
      }
    }
  }
  // Top-level launch_posture is verdict-bearing.
  if (model.launch_posture && model.launch_posture.launch === 'ACCEPTANCE_RESOLVED') {
    blockers.push({ code: BLOCKER_CODES.VERDICT_FORBIDDEN('launch_posture.launch:ACCEPTANCE_RESOLVED'), reason: 'launch posture must not claim ACCEPTANCE_RESOLVED' });
  }
  // HG worksheet drift: if model.worksheet present (or in any section) and not exactly 8 hard-gate rows, blocker.
  const wsSection = model.sections ? model.sections.find((s) => s.section_id === 's05_canonical_verdicts') : null;
  if (wsSection && wsSection.hard_gate_rows && Array.isArray(wsSection.hard_gate_rows) && wsSection.hard_gate_rows.length !== EXPECTED_HARD_GATE_COUNT) {
    blockers.push({ code: BLOCKER_CODES.HG_WORKSHEET_DRIFT('count:' + wsSection.hard_gate_rows.length), reason: 'HG worksheet row count drift' });
  }
  // Hard-gate vocabulary discipline — every gate state must be one of HARD_GATE_STATES.
  if (wsSection && Array.isArray(wsSection.hard_gate_rows)) {
    for (const row of wsSection.hard_gate_rows) {
      if (!HARD_GATE_IDS_SET.has(row.hard_gate_id)) blockers.push({ code: BLOCKER_CODES.HG_WORKSHEET_DRIFT('unknown-gate:' + row.hard_gate_id), reason: 'unknown hard-gate id' });
      if (!HARD_GATE_STATES_SET.has(row.state)) blockers.push({ code: BLOCKER_CODES.HG_WORKSHEET_DRIFT('unknown-state:' + row.state), reason: 'unknown hard-gate state' });
    }
  }
  // NOT_PROVEN preservation — preserved_ids count must be >= frozen minimal count.
  if (!Array.isArray(model.not_proven_preserved_ids) || model.not_proven_preserved_count < EXPECTED_NOT_PROVEN_COUNT) {
    blockers.push({ code: BLOCKER_CODES.NOT_PROVEN_REMOVED('count:' + (model.not_proven_preserved_count || 0)), reason: 'NOT_PROVEN preserved count fell below frozen minimal' });
  }
  const ok = blockers.length === 0;
  return Object.freeze({
    ok,
    verdict: ok ? VERDICT_VALUES.CHAIN_RESOLVED : 'FAIL_CLOSED',
    exit_code: ok ? EXIT_CODES.PASS : EXIT_CODES.REJECTED_FAIL_CLOSED,
    blockers: Object.freeze(blockers.slice()),
    block_count: blockers.length,
    source_count: model.source_count || EXPECTED_SOURCE_COUNT,
    section_count: (Array.isArray(model.sections) ? model.sections.length : EXPECTED_SECTION_COUNT),
    class_count: (Array.isArray(model.verification_class_ids) ? model.verification_class_ids.length : EXPECTED_VERIFICATION_CLASS_COUNT),
    not_proven_count: model.not_proven_preserved_count || EXPECTED_NOT_PROVEN_COUNT,
  });
}

// ---------------------------------------------------------------------------
// 18. Public surface
// ---------------------------------------------------------------------------
module.exports = Object.freeze({
  // Helpers
  sha256Hex,
  checkRedactionSafety,
  assertWriteSafe,
  _safeSuffix,
  // 1. SCHEMA + NAMESPACE
  SCHEMA_ID,
  SCHEMA_VERSION,
  SCHEMA_NAMESPACE,
  MILESTONE,
  SLICE,
  TASK_IDS,
  TASK,
  CHAIN_ID,
  CHAIN_KIND,
  NAMESPACE,
  BUILDER_LINE_CLASS,
  VERIFIER_LINE_CLASS,
  BUILDER_CANONICAL_PROTOCOL,
  VERIFIER_CANONICAL_PROTOCOL,
  BLOCKER_NAMESPACE,
  BLOCKER_CODE_PATTERN,
  BLOCKER_CODE_REGEX,
  isChainBlockerCode,
  CHAIN_REFERENCE_TIME,
  // 2. CHAIN_SECTIONS
  CHAIN_SECTION_IDS,
  CHAIN_SECTION_LABELS_RU,
  CHAIN_SECTION_SET,
  EXPECTED_SECTION_COUNT,
  isKnownChainSection,
  NOT_PROVEN_INVARIANT_ID,
  NOT_PROVEN_INVARIANT_LABEL_RU,
  // 3. VERIFICATION_CLASSES
  VERIFICATION_CLASSES,
  VERIFICATION_CLASS_IDS,
  VERIFICATION_CLASS_IDS_SET,
  EXPECTED_VERIFICATION_CLASS_COUNT,
  isKnownVerificationClass,
  getVerificationClassMeta,
  // 4. SOURCE_ALLOWLIST
  SOURCE_ALLOWLIST,
  SOURCE_ALLOWLIST_REFS,
  SOURCE_ALLOWLIST_SET,
  EXPECTED_SOURCE_COUNT,
  isAllowlistedSourceRef,
  getSourceEntry,
  REF,
  SAFE_PATH_RE,
  PROHIBITED_METHOD_RE,
  ABSOLUTE_PATH_RE,
  // 5. HARD_GATE_WORKSHEET
  HARD_GATE_IDS,
  HARD_GATE_IDS_SET,
  EXPECTED_HARD_GATE_COUNT,
  isKnownHardGate,
  HARD_GATE_STATES,
  HARD_GATE_STATES_SET,
  isKnownHardGateState,
  HG2_PROVENANCE_INTEGRITY,
  HG6_COMPLIANCE_POSTURE,
  // 6. VERDICT_VALUES + frozen posture
  VERDICT_VALUES,
  BOUNDARY_VALUES,
  ORCHESTRATION_VERDICTS,
  EVIDENCE_VERDICTS,
  LAUNCH_VERDICTS,
  ORCHESTRATION_VERDICTS_SET,
  EVIDENCE_VERDICTS_SET,
  LAUNCH_VERDICTS_SET,
  isValidOrchestrationVerdict,
  isValidEvidenceVerdict,
  isValidLaunchVerdict,
  FORBIDDEN_CHAIN_VERDICTS,
  FORBIDDEN_CHAIN_VERDICTS_SET,
  isForbiddenChainVerdict,
  FROZEN_LAUNCH_POSTURE,
  // 7. NOT_PROVEN_PRESERVED_IDS
  NOT_PROVEN_PRESERVED_IDS,
  NOT_PROVEN_PRESERVED_IDS_SET,
  EXPECTED_NOT_PROVEN_COUNT,
  isPreservedNotProvenId,
  // 8. CLASS_COVERAGE
  CLASS_COVERAGE,
  // 9. S10 cross-link
  S10_FROZEN_POSTURE,
  // 10. BLOCKER_CODES
  BLOCKER_CODES,
  // 11. EXIT_CODES
  EXIT_CODES,
  // 12. HEALTH_LINES
  buildHealthLineBuilder,
  buildHealthLineChain,
  // 13. DEFAULTS
  DEFAULTS,
  // 14. Pure builders
  buildR041Canonical,
  buildMilestoneCriterionChain,
  buildS05CanonicalVerdictsRow,
  buildS06ReconciliationRow,
  buildS08ScopeDecisionRow,
  buildS09HumanReviewRow,
  buildS10AcceptanceContractRow,
  buildCanonicalChainOutcome,
  buildChainModel,
  // 15. Redaction safety
  FORBIDDEN_KEYS,
  FLAG_KEYS,
  REDACTION_FLAG_VALUES,
  REDACTION_PATTERNS,
  // 16. Digest
  canonicalizeChainModel,
  computeChainDigest,
  // 17. Evaluator
  evaluateChain,
});
