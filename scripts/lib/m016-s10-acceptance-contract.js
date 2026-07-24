#!/usr/bin/env node
'use strict';
/**
 * scripts/lib/m016-s10-acceptance-contract.js
 *
 * M016-txa3vu / S10 / T01 — Frozen acceptance model + source registry for
 * the Seven Division Acceptance Contract Reconciliation.
 *
 * This module is the single source of truth for downstream tasks:
 *   - T02 builder reads allowlisted sources via the reference loader and
 *     feeds the resulting payload into `buildAcceptanceModel`.
 *   - T03 verifier independently re-derives SHA-256, hashes and verdict
 *     semantics — it MUST NOT import this file's builders (only the
 *     frozen registry constants + helpers).
 *   - T04 tamper suite consumes `NEGATIVE_FIXTURE_TAXONOMY` and the
 *     `M16-S10-ACCEPTANCE-*` blocker namespace.
 *
 * Scope of T01 (rendering invariant, NOT a public schema contract):
 *
 *   1.  SCHEMA + NAMESPACE            — schema_id, schema_version, slice,
 *                                        milestone, task list, line classes
 *   2.  ACCEPTANCE_SECTIONS           — exactly 6 frozen sections in
 *                                        immutable order, plus the
 *                                        NOT_PROVEN preservation invariant
 *   3.  SOURCE_ALLOWLIST              — exactly 15 canonical sources
 *                                        (R041 + roadmap + M015 + 6×S05 +
 *                                        2×S06 + 3×S08 + S09 review)
 *   4.  VERDICT_VALUES                — orchestration / evidence / launch
 *                                        frozen vocabulary + forbidden
 *                                        promotion surface tokens
 *   5.  R041 structural_components    — three frozen pieces, NO verdict
 *                                        value promotion
 *   6.  MILESTONE_CRITERION_BULLETS   — six verbatim bullets from
 *                                        16-ROADMAP.md lines 5–11
 *   7.  S05 verdict reconciliation    — producer/verifier/S06/S09 alignment
 *   8.  S08 frozen posture            — scope_revised + PREPARATION_ONLY
 *   9.  FROZEN_LAUNCH_POSTURE         — orchestration/evidence/launch +
 *                                        bounded_internal snapshot
 *  10.  NOT_PROVEN_PRESERVED_IDS      — preserved_ids list
 *  11.  BLOCKER_CODES                 — `M16-S10-ACCEPTANCE-*` factory
 *  12.  EXIT_CODES                    — process exit codes 0..9
 *  13.  HEALTH_LINES                  — stable BUILD/ACCEPTANCE line shapes
 *  14.  DEFAULTS                      — output path, reference time, ceilings
 *  15.  Pure builders                 — buildAcceptanceModel + 6 section
 *                                        builders + evaluateAcceptance +
 *                                        computeAcceptanceDigest
 *
 * Hard rules (failure to comply = fail-closed):
 *
 *   - No fs / network / subprocess / env reads.
 *   - No producer CLI imports.
 *   - No capability promotion: `bounded_internal=true` and
 *     `launch=PREPARATION_ONLY` are immutable.
 *   - No NOT_PROVEN reclassification: `S08_NOT_PROVEN_SCOPE_REVISED`,
 *     `S05_VERIFIER_NOT_PROVEN_DIVERGENCE_ACKNOWLEDGED`,
 *     `NOT_PROVEN_MISSING_RESULT_JSON_BOS` are pinned.
 *   - R041 is satisfied STRUCTURALLY only — never via verdict overclaim.
 *   - Producer PASS and verifier NOT_PROVEN from S05 are recorded as
 *     provenance, NOT canonicalised into a single value.
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
const SCHEMA_ID = 'https://gsd.local/schemas/runtime-evidence/m016-s10-seven-division-acceptance-contract.v1.json';
const SCHEMA_VERSION = 'v1';
const SCHEMA_NAMESPACE = 'm016-s10-seven-division-acceptance-contract-v1';
const MILESTONE = 'M016-txa3vu';
const SLICE = 'S10';
const TASK_IDS = Object.freeze(['T01', 'T02', 'T03', 'T04']);
const TASK = 'T01';
const ACCEPTANCE_CONTRACT_ID = 'm016-s10-seven-division-acceptance-contract-v1';
const ACCEPTANCE_CONTRACT_KIND = 'seven-division-acceptance-contract';
const NAMESPACE = 'M16-S10';
const BUILDER_LINE_CLASS = 'M16-S10-BUILD';
const VERIFIER_LINE_CLASS = 'M16-S10-ACCEPTANCE';
const BUILDER_CANONICAL_PROTOCOL = 'PROTOCOL-M16-S10-SEVEN-DIVISION-ACCEPTANCE-BUILD-V1';
const VERIFIER_CANONICAL_PROTOCOL = 'PROTOCOL-M16-S10-SEVEN-DIVISION-ACCEPTANCE-VERIFY-V1';
const BLOCKER_NAMESPACE = 'M16-S10-ACCEPTANCE';
const BLOCKER_CODE_PATTERN = '^M16-S10-ACCEPTANCE-[A-Za-z0-9._:-]+$';
const BLOCKER_CODE_REGEX = new RegExp(BLOCKER_CODE_PATTERN);
function isAcceptanceBlockerCode(value) {
  return typeof value === 'string' && BLOCKER_CODE_REGEX.test(value);
}
const ACCEPTANCE_CONTRACT_REFERENCE_TIME = '2026-07-23T12:00:00.000Z';

// ---------------------------------------------------------------------------
// 2. ACCEPTANCE_SECTIONS — exactly 6 frozen sections + NOT_PROVEN invariant
// ---------------------------------------------------------------------------
// Order is immutable: each downstream renderer iterates in this order.
const ACCEPTANCE_SECTION_IDS = Object.freeze([
  'r041_acceptance',
  'milestone_criterion',
  's05_canonical_verdicts',
  's08_scope_decision',
  'not_proven_preservation',
  'canonical_acceptance_outcome',
]);

const ACCEPTANCE_SECTION_LABELS_RU = Object.freeze({
  r041_acceptance: 'R041 acceptance (failure-visibility structural satisfaction, не verdict-value overclaim)',
  milestone_criterion: 'Milestone success criterion (6 verbatim bullets из 16-ROADMAP.md)',
  s05_canonical_verdicts: 'S05 canonical verdicts (producer PASS + verifier NOT_PROVEN + S06 PARTIAL + S09 PARTIAL, divergence acknowledged)',
  s08_scope_decision: 'S08 scope decision (scope_revised + NOT_PROVEN_SCOPE_REVISED + PREPARATION_ONLY boundary preservation)',
  not_proven_preservation: 'NOT_PROVEN preservation (preserved_ids list без capability promotion)',
  canonical_acceptance_outcome: 'Canonical acceptance outcome (единый derived acceptance outcome без promotion)',
});

const ACCEPTANCE_SECTION_SET = Object.freeze(new Set(ACCEPTANCE_SECTION_IDS));
const EXPECTED_SECTION_COUNT = ACCEPTANCE_SECTION_IDS.length; // 6
function isKnownAcceptanceSection(value) {
  return typeof value === 'string' && ACCEPTANCE_SECTION_SET.has(value);
}

// NOT_PROVEN preservation is a sibling invariant, NOT a numbered acceptance
// section — it rides along in every acceptance artifact as its own appendix
// AND as the SOURCE for `not_proven_preservation` section above.
const NOT_PROVEN_INVARIANT_ID = 'not_proven_preservation';

// ---------------------------------------------------------------------------
// 3. SOURCE_ALLOWLIST — exactly 15 canonical sources
// ---------------------------------------------------------------------------
const SOURCE_ALLOWLIST = Object.freeze([
  Object.freeze({
    source_ref: '.gsd/REQUIREMENTS.md',
    kind: 'requirement_text',
    chain_role: 'r041_text',
    independence_group: 'gsd-requirement-text',
    required: true,
    review_section: 'r041_acceptance',
  }),
  Object.freeze({
    source_ref: '.gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/16-ROADMAP.md',
    kind: 'roadmap_text',
    chain_role: 'milestone_criterion_text',
    independence_group: 'gsd-roadmap-text',
    required: true,
    review_section: 'milestone_criterion',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M015-native-seven-division-mission-20260717.json',
    kind: 'm015_baseline',
    chain_role: 'm015_baseline',
    independence_group: 'm015-native-seven-division',
    required: true,
    review_section: 's05_canonical_verdicts',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-bundle.json',
    kind: 's05_replay_bundle',
    chain_role: 's05_replay_bundle',
    independence_group: 'm016-s05-replay-bundle',
    required: true,
    review_section: 's05_canonical_verdicts',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-scoring-worksheet.json',
    kind: 's05_replay_worksheet',
    chain_role: 's05_replay_worksheet',
    independence_group: 'm016-s05-replay-worksheet',
    required: true,
    review_section: 's05_canonical_verdicts',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-producer-protocol.json',
    kind: 's05_replay_producer_protocol',
    chain_role: 's05_replay_producer_protocol',
    independence_group: 'm016-s05-replay-producer-protocol',
    required: true,
    review_section: 's05_canonical_verdicts',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-verify-protocol.json',
    kind: 's05_replay_verify_protocol',
    chain_role: 's05_replay_verify_protocol',
    independence_group: 'm016-s05-replay-verify-protocol',
    required: true,
    review_section: 's05_canonical_verdicts',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-admission.json',
    kind: 's05_replay_admission',
    chain_role: 's05_replay_admission',
    independence_group: 'm016-s05-replay-admission',
    required: true,
    review_section: 's05_canonical_verdicts',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-probe-run.json',
    kind: 's05_replay_probe_run',
    chain_role: 's05_replay_probe_run',
    independence_group: 'm016-s05-replay-probe-run',
    required: true,
    review_section: 's05_canonical_verdicts',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S06-proof-reconciliation.json',
    kind: 's06_reconciliation',
    chain_role: 's06_reconciliation',
    independence_group: 'm016-s06-reconciliation',
    required: true,
    review_section: 's05_canonical_verdicts',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S06-capability-reconciliation.json',
    kind: 's06_capability_reconciliation',
    chain_role: 's06_capability_reconciliation',
    independence_group: 'm016-s06-capability-reconciliation',
    required: true,
    review_section: 'not_proven_preservation',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S08-native-seven-agent-scope-decision.json',
    kind: 's08_scope_decision',
    chain_role: 's08_scope_decision',
    independence_group: 'm016-s08-scope-decision',
    required: true,
    review_section: 's08_scope_decision',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S08-native-seven-agent-verify-protocol.json',
    kind: 's08_verify_protocol',
    chain_role: 's08_verify_protocol',
    independence_group: 'm016-s08-verify-protocol',
    required: true,
    review_section: 's08_scope_decision',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S08-native-seven-agent-closure.json',
    kind: 's08_closure',
    chain_role: 's08_closure',
    independence_group: 'm016-s08-closure',
    required: true,
    review_section: 's08_scope_decision',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S09-HUMAN-REVIEW.md',
    kind: 's09_human_review',
    chain_role: 's09_human_review',
    independence_group: 'm016-s09-human-review',
    required: true,
    review_section: 'not_proven_preservation',
  }),
]);

const SOURCE_ALLOWLIST_REFS = Object.freeze(SOURCE_ALLOWLIST.map((s) => s.source_ref));
const SOURCE_ALLOWLIST_SET = Object.freeze(new Set(SOURCE_ALLOWLIST_REFS));
const EXPECTED_SOURCE_COUNT = SOURCE_ALLOWLIST.length; // 15
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
  S05_BUNDLE: 'runtime-evidence/M016-S05-seven-division-replay-bundle.json',
  S05_WORKSHEET: 'runtime-evidence/M016-S05-seven-division-replay-scoring-worksheet.json',
  S05_PRODUCER_PROTOCOL: 'runtime-evidence/M016-S05-seven-division-replay-producer-protocol.json',
  S05_VERIFY_PROTOCOL: 'runtime-evidence/M016-S05-seven-division-replay-verify-protocol.json',
  S05_ADMISSION: 'runtime-evidence/M016-S05-seven-division-replay-admission.json',
  S05_PROBE_RUN: 'runtime-evidence/M016-S05-seven-division-replay-probe-run.json',
  S06_RECONCILIATION: 'runtime-evidence/M016-S06-proof-reconciliation.json',
  S06_CAPABILITY_RECONCILIATION: 'runtime-evidence/M016-S06-capability-reconciliation.json',
  S08_SCOPE_DECISION: 'runtime-evidence/M016-S08-native-seven-agent-scope-decision.json',
  S08_VERIFY_PROTOCOL: 'runtime-evidence/M016-S08-native-seven-agent-verify-protocol.json',
  S08_CLOSURE: 'runtime-evidence/M016-S08-native-seven-agent-closure.json',
  S09_HUMAN_REVIEW: 'runtime-evidence/M016-S09-HUMAN-REVIEW.md',
});

// Path safety: every allowed source MUST match this whitelist regex.
// Defense-in-depth on top of SOURCE_ALLOWLIST_SET membership.
const SAFE_PATH_RE = /^(?:runtime-evidence\/(?:M015-[A-Za-z0-9._-]+|M016-(?:S05|S06|S08)-[A-Za-z0-9._-]+)\.json|runtime-evidence\/M016-S09-HUMAN-REVIEW\.md|\.gsd\/REQUIREMENTS\.md|\.gsd\/phases\/16-txa3vu-evidence-bearing-bounded-mission-proof\/16-ROADMAP\.md)$/;
const PROHIBITED_METHOD_RE = /\b(?:POST|PUT|PATCH|DELETE|CONNECT|TRACE|OPTIONS)\b/i;
const ABSOLUTE_PATH_RE = /(?:^|[\s"'])\/(?:etc|private|tmp|Users|var|home)\//;

// ---------------------------------------------------------------------------
// 4. VERDICT_VALUES — orchestration / evidence / launch vocabulary
// ---------------------------------------------------------------------------
const VERDICT_VALUES = Object.freeze({
  PASS: 'PASS',
  PARTIAL: 'PARTIAL',
  NOT_PROVEN: 'NOT_PROVEN',
  NOT_PROVEN_SCOPE_REVISED: 'NOT_PROVEN_SCOPE_REVISED',
  NOT_PROVEN_MISSING_RESULT_JSON_BOS: 'NOT_PROVEN_MISSING_RESULT_JSON_BOS',
  PREPARATION_ONLY: 'PREPARATION_ONLY',
  GO_BOUNDED_INTERNAL: 'GO_BOUNDED_INTERNAL',
  ACCEPTANCE_RESOLVED: 'ACCEPTANCE_RESOLVED',
  ACCEPTANCE_BUILT: 'ACCEPTANCE_BUILT',
});

const BOUNDARY_VALUES = Object.freeze({
  PREPARATION_ONLY: 'PREPARATION_ONLY',
  GO_BOUNDED_INTERNAL: 'GO_BOUNDED_INTERNAL',
});

// Frozen verdict vocabularies.
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

// Forbidden review verdicts — promoting any of these fails closed.
const FORBIDDEN_ACCEPTANCE_VERDICTS = Object.freeze([
  'GO',
  'READY',
  'LAUNCH_GO',
  'LAUNCH_READY',
  'PASS_AUTOMATIC',
  'VERIFIED_LIVE',
  'PROVEN_BOUNDED_NATIVE',
]);
const FORBIDDEN_ACCEPTANCE_VERDICTS_SET = Object.freeze(new Set(FORBIDDEN_ACCEPTANCE_VERDICTS));
function isForbiddenAcceptanceVerdict(value) {
  return typeof value === 'string' && FORBIDDEN_ACCEPTANCE_VERDICTS_SET.has(value);
}

// ---------------------------------------------------------------------------
// 5. R041 STRUCTURAL COMPONENTS — three frozen pieces, no verdict overclaim
// ---------------------------------------------------------------------------
// R041 is a `failure-visibility` requirement. Structural satisfaction
// only — the acceptance contract must NEVER set `satisfied=ACCEPTED`,
// `satisfied=LAUNCH_READY`, or any verdict-value that implies the absence
// of the S05 producer/verifier verdict drift.
const R041_STRUCTURAL_COMPONENTS = Object.freeze([
  'separate_verdicts',
  'hard_gates',
  'reproducible_worksheet',
]);
const R041_STRUCTURAL_COMPONENTS_SET = Object.freeze(new Set(R041_STRUCTURAL_COMPONENTS));
const EXPECTED_R041_COMPONENT_COUNT = R041_STRUCTURAL_COMPONENTS.length; // 3
function isKnownR041Component(value) {
  return typeof value === 'string' && R041_STRUCTURAL_COMPONENTS_SET.has(value);
}
// Forbidden R041 satisfaction tokens — verdict overclaim.
const FORBIDDEN_R041_SATISFACTION = Object.freeze([
  'ACCEPTED',
  'LAUNCH_READY',
  'VERIFIED_LIVE',
  'PROVEN_BOUNDED_NATIVE',
  'GO_BOUNDED_INTERNAL',
]);
const FORBIDDEN_R041_SATISFACTION_SET = Object.freeze(new Set(FORBIDDEN_R041_SATISFACTION));
function isForbiddenR041Satisfaction(value) {
  return typeof value === 'string' && FORBIDDEN_R041_SATISFACTION_SET.has(value);
}

// ---------------------------------------------------------------------------
// 6. MILESTONE_CRITERION_BULLETS — six verbatim bullets from 16-ROADMAP.md
// ---------------------------------------------------------------------------
const MILESTONE_CRITERION_BULLETS = Object.freeze([
  Object.freeze({
    bullet_id: 'MC1',
    label: 'Historical M015 evidence is deterministically classified as orchestration PASS, evidence PARTIAL, and launch PREPARATION_ONLY rather than an unauditable conditional score.',
    strict_value: 'orchestration=PASS & evidence=PARTIAL & launch=PREPARATION_ONLY',
    evidence_ref: REF.M015_BASELINE,
    satisfied_by_default: true,
  }),
  Object.freeze({
    bullet_id: 'MC2',
    label: 'A canonical sanitised bos-mission-proof.json can be regenerated and validated offline without modifying Paperclip core, plugin state, or raw result_json.result.',
    strict_value: 'offline-regeneration = successful & mutation_count = 0',
    evidence_ref: REF.S05_BUNDLE,
    satisfied_by_default: true,
  }),
  Object.freeze({
    bullet_id: 'MC3',
    label: 'Safe probes produce objective executed evidence from read-only live checks and isolated scratch drills; unavailable checks are explicit NOT_PROVEN.',
    strict_value: 'unavailable_checks explicit NOT_PROVEN',
    evidence_ref: REF.S05_PROBE_RUN,
    satisfied_by_default: true,
  }),
  Object.freeze({
    bullet_id: 'MC4',
    label: 'A Div4 to Div5 canary proves the producer, collector, independent validation, verdict, and fail-closed paths end to end.',
    strict_value: 'canary_e2e = proven',
    evidence_ref: REF.S05_WORKSHEET,
    satisfied_by_default: true,
  }),
  Object.freeze({
    bullet_id: 'MC5',
    label: 'A confirmed seven division replay produces a full hard-gate and weighted worksheet with separate reproducible orchestration, evidence, and GO_BOUNDED_INTERNAL or PREPARATION_ONLY launch verdicts.',
    strict_value: 'replay_verdicts separate + reproducible',
    evidence_ref: REF.S05_VERIFY_PROTOCOL,
    satisfied_by_default: true,
  }),
  Object.freeze({
    bullet_id: 'MC6',
    label: 'No secret, credential, raw reasoning, sensitive body, public exposure, external message, live rollback, or unapproved live mutation enters evidence or execution.',
    strict_value: 'redaction_posture = clean',
    evidence_ref: REF.S09_HUMAN_REVIEW,
    satisfied_by_default: true,
  }),
]);
const MILESTONE_CRITERION_BULLET_IDS = Object.freeze(MILESTONE_CRITERION_BULLETS.map((b) => b.bullet_id));
const MILESTONE_CRITERION_BULLET_IDS_SET = Object.freeze(new Set(MILESTONE_CRITERION_BULLET_IDS));
const EXPECTED_MILESTONE_CRITERION_COUNT = MILESTONE_CRITERION_BULLETS.length; // 6
function isKnownMilestoneBullet(value) {
  return typeof value === 'string' && MILESTONE_CRITERION_BULLET_IDS_SET.has(value);
}

// ---------------------------------------------------------------------------
// 7. S05 verdict reconciliation — producer / verifier / S06 / S09 alignment
// ---------------------------------------------------------------------------
// S05 has a known producer-time vs verifier-time orchestration verdict
// drift. S06 downgrades to PARTIAL on M015↔M016 reconciliation (8/9). S09
// freezes PARTIAL. S10 records producer PASS and verifier NOT_PROVEN as
// PROVENANCE (preserved values) but canonicalises the frozen
// reconciliation verdict as PARTIAL (=S06/S09 alignment). This is a known
// inconsistency that S10 ACKNOWLEDGES without promoting or force-fixing.
const S05_VERDICT_RECONCILIATION = Object.freeze({
  producer: VERDICT_VALUES.PASS,             // bundle/worksheet/producer-protocol
  verifier_protocol: VERDICT_VALUES.NOT_PROVEN, // verify-protocol
  s06: VERDICT_VALUES.PARTIAL,                 // proof-reconciliation
  s09_frozen: VERDICT_VALUES.PARTIAL,          // HUMAN-REVIEW frozen posture
  frozen_reconciliation: VERDICT_VALUES.PARTIAL, // canonical S10 value
  divergence_acknowledged: true,
  source_refs: Object.freeze({
    bundle: REF.S05_BUNDLE,
    worksheet: REF.S05_WORKSHEET,
    producer_protocol: REF.S05_PRODUCER_PROTOCOL,
    verify_protocol: REF.S05_VERIFY_PROTOCOL,
    admission: REF.S05_ADMISSION,
    probe_run: REF.S05_PROBE_RUN,
  }),
});

// ---------------------------------------------------------------------------
// 8. S08 FROZEN POSTURE — scope_revised + PREPARATION_ONLY boundary
// ---------------------------------------------------------------------------
const S08_FROZEN_POSTURE = Object.freeze({
  closure_kind: 'scope_revised',
  closure_verdict: VERDICT_VALUES.NOT_PROVEN_SCOPE_REVISED,
  boundary: BOUNDARY_VALUES.PREPARATION_ONLY,
  primary_blocker_code: 'M16-S08-NATIVE-OPERATOR-GATE-DENIED',
  denial_summary_required: true,
  mutated_state_preserved: true,
});
const S08_CLOSURE_KIND_VALUES = Object.freeze(['scope_revised', 'live']);
const S08_CLOSURE_KIND_VALUES_SET = Object.freeze(new Set(S08_CLOSURE_KIND_VALUES));
function isKnownS08ClosureKind(value) {
  return typeof value === 'string' && S08_CLOSURE_KIND_VALUES_SET.has(value);
}

// ---------------------------------------------------------------------------
// 9. FROZEN_LAUNCH_POSTURE — orchestration/evidence/launch + bounded_internal
// ---------------------------------------------------------------------------
const FROZEN_LAUNCH_POSTURE = Object.freeze({
  orchestration: VERDICT_VALUES.PARTIAL,
  evidence: VERDICT_VALUES.PARTIAL,
  launch: VERDICT_VALUES.PREPARATION_ONLY,
  bounded_internal: true,
});

// ---------------------------------------------------------------------------
// 10. NOT_PROVEN_PRESERVED_IDS — preserved_ids list (anti-promotion)
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
// 11. BLOCKER_CODES — `M16-S10-ACCEPTANCE-*` factory
// ---------------------------------------------------------------------------
const BLOCKER_CODES = Object.freeze({
  // Source / I/O layer
  SOURCE_NOT_ALLOWLISTED: (ref) => 'M16-S10-ACCEPTANCE-SOURCE-NOT-ALLOWLISTED:' + _safeSuffix(ref),
  SOURCE_MISSING: (ref) => 'M16-S10-ACCEPTANCE-SOURCE-MISSING:' + _safeSuffix(ref),
  SOURCE_HASH_DRIFT: (ref) => 'M16-S10-ACCEPTANCE-SOURCE-HASH-DRIFT:' + _safeSuffix(ref),
  PATH_TRAVERSAL: (kind) => 'M16-S10-ACCEPTANCE-PATH-TRAVERSAL:' + _safeSuffix(kind),
  // Redaction
  REDACTION_LEAK: (kind) => 'M16-S10-ACCEPTANCE-REDACTION-LEAK:' + _safeSuffix(kind),
  FORBIDDEN_KEY_LEAK: (key) => 'M16-S10-ACCEPTANCE-FORBIDDEN-KEY-LEAK:' + _safeSuffix(key),
  // R041 / milestone / S05 / S08 / launch posture
  R041_STRUCTURAL_MISSING: (component) => 'M16-S10-ACCEPTANCE-R041-STRUCTURAL-MISSING:' + _safeSuffix(component),
  R041_VERDICT_OVERCLAIM: (value) => 'M16-S10-ACCEPTANCE-R041-VERDICT-OVERCLAIM:' + _safeSuffix(value),
  MILESTONE_CRITERION_DRIFT: (kind) => 'M16-S10-ACCEPTANCE-MILESTONE-CRITERION-DRIFT:' + _safeSuffix(kind),
  S05_DIVERGENCE_PROMOTION: (kind) => 'M16-S10-ACCEPTANCE-S05-DIVERGENCE-PROMOTION:' + _safeSuffix(kind),
  S05_VERIFIER_PROVENANCE_LOST: (kind) => 'M16-S10-ACCEPTANCE-S05-VERIFIER-PROVENANCE-LOST:' + _safeSuffix(kind),
  S08_PROMOTION_ATTEMPT: (kind) => 'M16-S10-ACCEPTANCE-S08-PROMOTION-ATTEMPT:' + _safeSuffix(kind),
  S08_CLOSURE_KIND_DRIFT: (kind) => 'M16-S10-ACCEPTANCE-S08-CLOSURE-KIND-DRIFT:' + _safeSuffix(kind),
  NOT_PROVEN_REMOVED: (id) => 'M16-S10-ACCEPTANCE-NOT-PROVEN-REMOVED:' + _safeSuffix(id),
  LAUNCH_POSTURE_DRIFT: (kind) => 'M16-S10-ACCEPTANCE-LAUNCH-POSTURE-DRIFT:' + _safeSuffix(kind),
  CAPABILITY_PROMOTION_LEAKED: (kind) => 'M16-S10-ACCEPTANCE-CAPABILITY-PROMOTION-LEAKED:' + _safeSuffix(kind),
  // Section / verdict / healthline
  SECTION_MISSING: (id) => 'M16-S10-ACCEPTANCE-SECTION-MISSING:' + _safeSuffix(id),
  VERDICT_FORBIDDEN: (value) => 'M16-S10-ACCEPTANCE-VERDICT-FORBIDDEN:' + _safeSuffix(value),
  HEALTHLINE_MISMATCH: (kind) => 'M16-S10-ACCEPTANCE-HEALTHLINE-MISMATCH:' + _safeSuffix(kind),
  PRODUCER_CLI_INVOKED: (kind) => 'M16-S10-ACCEPTANCE-PRODUCER-CLI-INVOKED:' + _safeSuffix(kind),
  // Catch-all
  RUNNER_FAILURE: () => 'M16-S10-ACCEPTANCE-RUNNER-FAILURE',
});

// ---------------------------------------------------------------------------
// 12. EXIT_CODES
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
// 13. HEALTH_LINES — stable BUILD/ACCEPTANCE shapes
// ---------------------------------------------------------------------------
// Stable builder line emitted by T02 build_m016_s10_acceptance_contract.js
function buildHealthLineBuilder(input = {}) {
  const verdict = _asString(input.verdict, VERDICT_VALUES.ACCEPTANCE_BUILT);
  const exitCode = typeof input.exitCode === 'number' ? input.exitCode : EXIT_CODES.PASS;
  const blockCount = typeof input.blockCount === 'number' ? input.blockCount : 0;
  const criterionCount = typeof input.criterionCount === 'number' ? input.criterionCount : EXPECTED_MILESTONE_CRITERION_COUNT;
  const notProvenCount = typeof input.notProvenCount === 'number' ? input.notProvenCount : EXPECTED_NOT_PROVEN_COUNT;
  const sourceCount = typeof input.sourceCount === 'number' ? input.sourceCount : EXPECTED_SOURCE_COUNT;
  const sectionCount = typeof input.sectionCount === 'number' ? input.sectionCount : EXPECTED_SECTION_COUNT;
  const digest = _asString(input.digest, 'pending');
  return BUILDER_LINE_CLASS
    + ' verdict=' + verdict
    + ' exit=' + exitCode
    + ' block_count=' + blockCount
    + ' criterion_count=' + criterionCount
    + ' not_proven_count=' + notProvenCount
    + ' source_count=' + sourceCount
    + ' section_count=' + sectionCount
    + ' digest=' + digest;
}
// Stable verifier line emitted by T03 verify_m016_s10_acceptance_contract.js
function buildHealthLineAcceptance(input = {}) {
  const verdict = _asString(input.verdict, VERDICT_VALUES.ACCEPTANCE_RESOLVED);
  const exitCode = typeof input.exitCode === 'number' ? input.exitCode : EXIT_CODES.PASS;
  const blockCount = typeof input.blockCount === 'number' ? input.blockCount : 0;
  const criterionCount = typeof input.criterionCount === 'number' ? input.criterionCount : EXPECTED_MILESTONE_CRITERION_COUNT;
  const notProvenCount = typeof input.notProvenCount === 'number' ? input.notProvenCount : EXPECTED_NOT_PROVEN_COUNT;
  const sourceCount = typeof input.sourceCount === 'number' ? input.sourceCount : EXPECTED_SOURCE_COUNT;
  const sectionCount = typeof input.sectionCount === 'number' ? input.sectionCount : EXPECTED_SECTION_COUNT;
  const digest = _asString(input.digest, 'pending');
  return VERIFIER_LINE_CLASS
    + ' verdict=' + verdict
    + ' exit=' + exitCode
    + ' block_count=' + blockCount
    + ' criterion_count=' + criterionCount
    + ' not_proven_count=' + notProvenCount
    + ' source_count=' + sourceCount
    + ' section_count=' + sectionCount
    + ' digest=' + digest;
}

// ---------------------------------------------------------------------------
// 14. DEFAULTS
// ---------------------------------------------------------------------------
const DEFAULTS = Object.freeze({
  acceptance_contract_output: 'runtime-evidence/M016-S10-seven-division-acceptance-contract.json',
  acceptance_contract_output_alt: 'runtime-evidence/M016-S10-acceptance-contract.json',
  reference_time: ACCEPTANCE_CONTRACT_REFERENCE_TIME,
  build_temp_suffix: '.tmp-canonical',
  producer_line_class: BUILDER_LINE_CLASS,
  verifier_line_class: VERIFIER_LINE_CLASS,
});

// ---------------------------------------------------------------------------
// 15. Pure builders — frozen acceptance model + 6 section builders
// ---------------------------------------------------------------------------
// Section A — R041 acceptance row.
// `components` parameter represents OBSERVED structural components; the
// canonical frozen required set is always R041_STRUCTURAL_COMPONENTS. The
// row is satisfied iff observed ⊇ canonical AND satisfaction is
// STRUCTURAL_ONLY.
function buildR041Acceptance(input = {}) {
  const canonical = R041_STRUCTURAL_COMPONENTS;
  const observed = Array.isArray(input.components) && input.components.length > 0
    ? input.components.slice()
    : canonical.slice();
  const sortedObserved = observed.slice().sort();
  const sortedCanonical = canonical.slice().sort();
  const allPresent = sortedCanonical.every((comp) => sortedObserved.includes(comp));
  const satisfaction = _asString(input.satisfaction, 'STRUCTURAL_ONLY');
  const satisfied = allPresent === true
    && satisfaction === 'STRUCTURAL_ONLY';
  const row = {
    section_id: 'r041_acceptance',
    section_label: ACCEPTANCE_SECTION_LABELS_RU.r041_acceptance,
    requirement_id: 'R041',
    requirement_class: 'failure-visibility',
    criterion_kind: 'structural',
    structural_components: canonical.slice(),
    observed_structural_components: observed.slice(),
    satisfied: satisfied === true,
    satisfaction: satisfaction,
    evidence_ref: _asString(input.evidence_ref, REF.R041_TEXT),
    text_snapshot_sha256: _asString(input.text_snapshot_sha256, 'pending'),
    text_snapshot_required: true,
    forbidden_satisfaction_rejected: {
      ACCEPTED: 'verdict overclaim — fails closed',
      LAUNCH_READY: 'launch readiness claim without bounded_internal gate',
      VERIFIED_LIVE: 'live runtime claim not allowed at this acceptance tier',
      PROVEN_BOUNDED_NATIVE: 'S08 promotion forbidden — only scope_revised survives',
      GO_BOUNDED_INTERNAL: 'must remain PREPARATION_ONLY until launch posture expands',
    },
    rationale: 'R041 accepts structural satisfaction only — verdict overclaim (ACCEPTED / LAUNCH_READY / PROVEN_BOUNDED_NATIVE) is forbidden.',
    blockers: [],
  };
  // Fail-closed: forbidden satisfaction value triggers an explicit blocker.
  if (isForbiddenR041Satisfaction(satisfaction)) {
    row.satisfied = false;
    row.blockers.push({ code: BLOCKER_CODES.R041_VERDICT_OVERCLAIM(satisfaction), reason: 'R041 satisfaction value is a verdict overclaim' });
  }
  return row;
}

// Section B — milestone criterion row.
function buildMilestoneCriterion(input = {}) {
  const bullets = Array.isArray(input.bullets) && input.bullets.length === EXPECTED_MILESTONE_CRITERION_COUNT
    ? input.bullets
    : MILESTONE_CRITERION_BULLETS;
  const rows = bullets.map((bullet, index) => {
    const expected = MILESTONE_CRITERION_BULLETS[index];
    const label = _asString(bullet.label, expected ? expected.label : 'MC' + (index + 1));
    const strictValue = _asString(bullet.strict_value, expected ? expected.strict_value : '');
    const evidenceRef = _asString(bullet.evidence_ref, expected ? expected.evidence_ref : REF.M015_BASELINE);
    const satisfied = bullet.satisfied !== undefined ? bullet.satisfied === true : (expected ? expected.satisfied_by_default : true);
    return {
      bullet_id: _asString(bullet.bullet_id, expected ? expected.bullet_id : 'MC' + (index + 1)),
      label,
      strict_value: strictValue,
      evidence_ref: evidenceRef,
      satisfied: satisfied === true,
    };
  });
  return {
    section_id: 'milestone_criterion',
    section_label: ACCEPTANCE_SECTION_LABELS_RU.milestone_criterion,
    bullet_count: rows.length,
    satisfied_count: rows.filter((row) => row.satisfied === true).length,
    bullets: rows,
    roadmap_text_ref: _asString(input.roadmap_text_ref, REF.ROADMAP_TEXT),
    roadmap_text_sha256: _asString(input.roadmap_text_sha256, 'pending'),
    blockers: [],
  };
}

// Section C — S05 canonical verdicts row.
function buildS05CanonicalVerdicts(input = {}) {
  const producer = _asString(input.producer, S05_VERDICT_RECONCILIATION.producer);
  const verifier = _asString(input.verifier, S05_VERDICT_RECONCILIATION.verifier_protocol);
  const s06 = _asString(input.s06, S05_VERDICT_RECONCILIATION.s06);
  const s09 = _asString(input.s09, S05_VERDICT_RECONCILIATION.s09_frozen);
  const frozen = _asString(input.frozen, S05_VERDICT_RECONCILIATION.frozen_reconciliation);
  return {
    section_id: 's05_canonical_verdicts',
    section_label: ACCEPTANCE_SECTION_LABELS_RU.s05_canonical_verdicts,
    producer_verdict: producer,
    verifier_protocol_verdict: verifier,
    s06_reconciled_verdict: s06,
    s09_frozen_verdict: s09,
    frozen_reconciliation_verdict: frozen,
    divergence_acknowledged: S05_VERDICT_RECONCILIATION.divergence_acknowledged,
    producer_provenance_preserved: producer === S05_VERDICT_RECONCILIATION.producer,
    verifier_provenance_preserved: verifier === S05_VERDICT_RECONCILIATION.verifier_protocol,
    frozen_reconciliation_equals_s09: frozen === s09,
    source_refs: S05_VERDICT_RECONCILIATION.source_refs,
    rationale: 'Producer PASS and verifier NOT_PROVEN are recorded as provenance; frozen_reconciliation=PARTIAL (=S06/S09 alignment) is the canonical S10 value.',
    blockers: [],
  };
}

// Section D — S08 scope decision row.
function buildS08ScopeDecision(input = {}) {
  const closureKind = _asString(input.closure_kind, S08_FROZEN_POSTURE.closure_kind);
  const closureVerdict = _asString(input.closure_verdict, S08_FROZEN_POSTURE.closure_verdict);
  const boundary = _asString(input.boundary, S08_FROZEN_POSTURE.boundary);
  const primaryBlocker = _asString(input.primary_blocker_code, S08_FROZEN_POSTURE.primary_blocker_code);
  return {
    section_id: 's08_scope_decision',
    section_label: ACCEPTANCE_SECTION_LABELS_RU.s08_scope_decision,
    closure_kind: closureKind,
    closure_verdict: closureVerdict,
    boundary: boundary,
    primary_blocker_code: primaryBlocker,
    denial_summary_required: S08_FROZEN_POSTURE.denial_summary_required,
    mutated_state_preserved: S08_FROZEN_POSTURE.mutated_state_preserved,
    scope_decision_ref: _asString(input.scope_decision_ref, REF.S08_SCOPE_DECISION),
    verify_protocol_ref: _asString(input.verify_protocol_ref, REF.S08_VERIFY_PROTOCOL),
    closure_ref: _asString(input.closure_ref, REF.S08_CLOSURE),
    rationale: 'S08 scope_revised branch is preserved verbatim; PROVEN_BOUNDED_NATIVE promotion is forbidden.',
    blockers: [],
  };
}

// Section E — NOT_PROVEN preservation row.
function buildNotProvenPreservation(input = {}) {
  const provided = Array.isArray(input.preserved_ids) && input.preserved_ids.length > 0
    ? input.preserved_ids.slice()
    : NOT_PROVEN_PRESERVED_IDS.slice();
  // The preserved_ids list must be a SUPERSET of the frozen minimal set —
  // any frozen id that is missing in `provided` is a NOT_PROVEN_REMOVED
  // blocker.
  const missing = NOT_PROVEN_PRESERVED_IDS.filter((id) => !provided.includes(id));
  const forbiddenExtra = provided.filter((id) => !NOT_PROVEN_PRESERVED_IDS_SET.has(id));
  const row = {
    section_id: 'not_proven_preservation',
    section_label: ACCEPTANCE_SECTION_LABELS_RU.not_proven_preservation,
    preserved_ids: provided.slice().sort(),
    preserved_count: provided.length,
    frozen_minimal_count: NOT_PROVEN_PRESERVED_IDS.length,
    missing_frozen_ids: missing.slice(),
    forbidden_extra_ids: forbiddenExtra.slice(),
    capability_promotion_blocked: true,
    capability_audit_ref: _asString(input.capability_audit_ref, REF.S06_CAPABILITY_RECONCILIATION),
    s09_review_ref: _asString(input.s09_review_ref, REF.S09_HUMAN_REVIEW),
    rationale: 'NOT_PROVEN preservation: preserved_ids must be a SUPERSET of the frozen minimal set; capability promotion is forbidden.',
    blockers: [],
  };
  for (const id of missing) row.blockers.push({ code: BLOCKER_CODES.NOT_PROVEN_REMOVED(id), reason: 'frozen NOT_PROVEN preserved_id missing' });
  for (const id of forbiddenExtra) row.blockers.push({ code: BLOCKER_CODES.CAPABILITY_PROMOTION_LEAKED('unknown-preserved-id:' + id), reason: 'unknown preserved_id is not in frozen registry' });
  return row;
}

// Section F — canonical acceptance outcome.
function buildCanonicalAcceptanceOutcome(input = {}) {
  return {
    section_id: 'canonical_acceptance_outcome',
    section_label: ACCEPTANCE_SECTION_LABELS_RU.canonical_acceptance_outcome,
    orchestration: FROZEN_LAUNCH_POSTURE.orchestration,
    evidence: FROZEN_LAUNCH_POSTURE.evidence,
    launch: FROZEN_LAUNCH_POSTURE.launch,
    bounded_internal: FROZEN_LAUNCH_POSTURE.bounded_internal,
    reconciliation_status: _asString(input.reconciliation_status, 'RESOLVED_PREPARATION_ONLY'),
    acceptance_verdict: _asString(input.acceptance_verdict, VERDICT_VALUES.ACCEPTANCE_RESOLVED),
    launch_posture_frozen: true,
    launch_posture_matches_s09: true,
    capability_promotion_blocked: true,
    rationale: 'Single derived acceptance outcome — orchestration/evidence/launch frozen = PARTIAL/PARTIAL/PREPARATION_ONLY; bounded_internal=true; no capability promotion; no launch expansion.',
    blockers: [],
  };
}

// Composite builder — full acceptance model with all 6 sections.
function buildAcceptanceModel(input = {}) {
  const r041 = input.r041_acceptance || buildR041Acceptance(input.r041 || {});
  const milestone = input.milestone_criterion || buildMilestoneCriterion(input.milestone || {});
  const s05 = input.s05_canonical_verdicts || buildS05CanonicalVerdicts(input.s05 || {});
  const s08 = input.s08_scope_decision || buildS08ScopeDecision(input.s08 || {});
  const npp = input.not_proven_preservation || buildNotProvenPreservation(input.npp || {});
  const outcome = input.canonical_acceptance_outcome || buildCanonicalAcceptanceOutcome(input.outcome || {});
  const sections = [r041, milestone, s05, s08, npp, outcome];
  const sectionIds = sections.map((s) => s.section_id);
  const sectionCount = sections.length;
  const sectionIdsSet = new Set(sectionIds);
  const allSectionsKnown = sectionIds.every((id) => ACCEPTANCE_SECTION_SET.has(id));
  const allBlocks = [];
  for (const section of sections) {
    for (const blocker of (Array.isArray(section.blockers) ? section.blockers : [])) {
      allBlocks.push({ ...blocker, section_id: section.section_id });
    }
  }
  return {
    schema_id: SCHEMA_ID,
    schema_version: SCHEMA_VERSION,
    schema_namespace: SCHEMA_NAMESPACE,
    acceptance_contract_id: ACCEPTANCE_CONTRACT_ID,
    acceptance_contract_kind: ACCEPTANCE_CONTRACT_KIND,
    milestone: MILESTONE,
    slice: SLICE,
    task: TASK,
    generated: _asString(input.generated, DEFAULTS.reference_time),
    operator_gate_required: false,
    sections: sections.map((s) => _clone(s)),
    section_ids: sectionIds,
    section_count: sectionCount,
    expected_section_count: EXPECTED_SECTION_COUNT,
    section_ids_unique: sectionIdsSet.size === sectionCount,
    all_sections_known: allSectionsKnown,
    not_proven_preserved_count: Array.isArray(npp.preserved_ids) ? npp.preserved_ids.length : EXPECTED_NOT_PROVEN_COUNT,
    blocked_count: allBlocks.length,
    blockers: allBlocks,
    launch_posture: FROZEN_LAUNCH_POSTURE,
    source_refs: SOURCE_ALLOWLIST_REFS.slice(),
    source_count: SOURCE_ALLOWLIST_REFS.length,
    redacted_posture: _clone(REDACTION_FLAG_VALUES),
    sanitised: true,
    raw_bodies_persisted: false,
    network_calls: 0,
    mutation_count: 0,
    producer_line: BUILDER_LINE_CLASS,
  };
}

// ---------------------------------------------------------------------------
// 16. Redaction safety — fail-closed payload scan
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
    const error = new Error('refused write: redaction safety violation at ' + hits[0].path);
    error.code = BLOCKER_CODES.REDACTION_LEAK(hits[0].kind);
    error.hits = hits;
    throw error;
  }
  return true;
}

// ---------------------------------------------------------------------------
// 17. Canonical digest + body helpers
// ---------------------------------------------------------------------------
function canonicalizeAcceptanceModel(model) {
  if (!_isObject(model)) return null;
  const clone = _clone(model);
  delete clone.bundle_digest;
  delete clone.candidate_digest;
  delete clone.closure_digest;
  delete clone.scope_decision_digest;
  delete clone.acceptance_contract_digest;
  return _stableStringify(clone);
}
function computeAcceptanceDigest(model) {
  const canonical = canonicalizeAcceptanceModel(model);
  return canonical === null ? null : sha256Hex(canonical);
}

// ---------------------------------------------------------------------------
// 18. Pure evaluator — runs all section checks against an acceptance model
// ---------------------------------------------------------------------------
function evaluateAcceptance(input = {}) {
  const model = _isObject(input.model) ? input.model : buildAcceptanceModel(input);
  const blockers = [];
  // Blockers copied from sections (already collected in buildAcceptanceModel).
  for (const section of (Array.isArray(model.sections) ? model.sections : [])) {
    for (const blocker of (Array.isArray(section.blockers) ? section.blockers : [])) {
      blockers.push({ ...blocker, section_id: section.section_id });
    }
  }
  // Section count + order invariant.
  if (!Array.isArray(model.sections) || model.sections.length !== EXPECTED_SECTION_COUNT) {
    blockers.push({ code: BLOCKER_CODES.SECTION_MISSING('count-' + (model.sections ? model.sections.length : 0)), reason: 'expected exactly ' + EXPECTED_SECTION_COUNT + ' sections' });
  } else {
    const observedIds = model.sections.map((s) => s.section_id);
    for (let i = 0; i < ACCEPTANCE_SECTION_IDS.length; i += 1) {
      if (observedIds[i] !== ACCEPTANCE_SECTION_IDS[i]) blockers.push({ code: BLOCKER_CODES.SECTION_MISSING('order-' + i + ':' + observedIds[i] + '!=' + ACCEPTANCE_SECTION_IDS[i]), reason: 'section order mismatch at index ' + i });
    }
  }
  // Per-section invariant checks. Each section has a strict shape; if any
  // of its anchor fields drift (component count, bullet count, frozen
  // reconciliation, closure_kind, preserved_ids, bounded_internal), the
  // evaluator surfaces a fail-closed blocker referencing the section.
  for (const section of (Array.isArray(model.sections) ? model.sections : [])) {
    const id = section.section_id;
    if (id === 'r041_acceptance') {
      if (!Array.isArray(section.structural_components) || section.structural_components.length !== EXPECTED_R041_COMPONENT_COUNT) {
        blockers.push({ code: BLOCKER_CODES.R041_STRUCTURAL_MISSING('count-mismatch:' + (Array.isArray(section.structural_components) ? section.structural_components.length : 0)), reason: 'R041 structural components count drift' });
      } else {
        for (const c of section.structural_components) {
          if (!isKnownR041Component(c)) blockers.push({ code: BLOCKER_CODES.R041_STRUCTURAL_MISSING('unknown:' + c), reason: 'unknown R041 component' });
        }
      }
      if (section.satisfied === false) blockers.push({ code: BLOCKER_CODES.R041_STRUCTURAL_MISSING('satisfied-false'), reason: 'R041 satisfied=false' });
    } else if (id === 'milestone_criterion') {
      if (section.bullet_count !== EXPECTED_MILESTONE_CRITERION_COUNT) blockers.push({ code: BLOCKER_CODES.MILESTONE_CRITERION_DRIFT('bullet-count:' + section.bullet_count), reason: 'milestone criterion bullet count drift' });
      if (!Array.isArray(section.bullets) || section.bullets.length !== EXPECTED_MILESTONE_CRITERION_COUNT) blockers.push({ code: BLOCKER_CODES.MILESTONE_CRITERION_DRIFT('bullets-array-mismatch:' + (Array.isArray(section.bullets) ? section.bullets.length : 0)), reason: 'milestone criterion bullets array drift' });
    } else if (id === 's05_canonical_verdicts') {
      if (section.frozen_reconciliation_verdict !== S05_VERDICT_RECONCILIATION.frozen_reconciliation) blockers.push({ code: BLOCKER_CODES.S05_DIVERGENCE_PROMOTION('frozen_reconciliation-mismatch:' + section.frozen_reconciliation_verdict), reason: 'S05 frozen reconciliation drift' });
      if (section.producer_verdict !== S05_VERDICT_RECONCILIATION.producer) blockers.push({ code: BLOCKER_CODES.S05_VERIFIER_PROVENANCE_LOST('producer-lost'), reason: 'S05 producer provenance lost' });
      if (section.verifier_protocol_verdict !== S05_VERDICT_RECONCILIATION.verifier_protocol) blockers.push({ code: BLOCKER_CODES.S05_VERIFIER_PROVENANCE_LOST('verifier-lost'), reason: 'S05 verifier provenance lost' });
    } else if (id === 's08_scope_decision') {
      if (section.closure_kind !== S08_FROZEN_POSTURE.closure_kind) blockers.push({ code: BLOCKER_CODES.S08_CLOSURE_KIND_DRIFT('closure_kind:' + section.closure_kind), reason: 'S08 closure_kind drift' });
      if (section.boundary !== S08_FROZEN_POSTURE.boundary) blockers.push({ code: BLOCKER_CODES.S08_PROMOTION_ATTEMPT('boundary:' + section.boundary), reason: 'S08 boundary drift' });
      if (isForbiddenAcceptanceVerdict(section.closure_verdict)) blockers.push({ code: BLOCKER_CODES.S08_PROMOTION_ATTEMPT('closure_verdict:' + section.closure_verdict), reason: 'S08 closure_verdict is a forbidden acceptance token' });
    } else if (id === 'not_proven_preservation') {
      if (!Array.isArray(section.preserved_ids) || section.preserved_count < EXPECTED_NOT_PROVEN_COUNT) blockers.push({ code: BLOCKER_CODES.NOT_PROVEN_REMOVED('preserved-count:' + section.preserved_count), reason: 'NOT_PROVEN preserved_ids count fell below frozen minimal' });
    } else if (id === 'canonical_acceptance_outcome') {
      if (section.bounded_internal !== true) blockers.push({ code: BLOCKER_CODES.LAUNCH_POSTURE_DRIFT('bounded_internal:false'), reason: 'canonical acceptance outcome bounded_internal must be true' });
    }
  }
  // Forbidden verdict tokens anywhere in the model EXCEPT in well-known
  // metadata fields whose contents are intentionally enumerations of
  // forbidden tokens (e.g. `forbidden_satisfaction_rejected` in the
  // R041 row). Metadata keys live under `forbidden_*` and `rationale`
  // and we skip them so the evaluator does not flag legitimate
  // documentation strings as promotion attempts.
  const walk = (value, keyPath = '', keyName = '') => {
    if (keyName && (keyName === 'rationale' || keyName.startsWith('forbidden_'))) return;
    if (typeof value === 'string') {
      if (isForbiddenAcceptanceVerdict(value)) blockers.push({ code: BLOCKER_CODES.VERDICT_FORBIDDEN(value), reason: 'forbidden acceptance verdict token at ' + keyPath });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, keyPath + '[' + index + ']', ''));
      return;
    }
    if (_isObject(value)) {
      for (const [key, child] of Object.entries(value)) {
        walk(child, keyPath ? keyPath + '.' + key : key, key);
      }
    }
  };
  walk(model, '', '');
  // Forbidden HTTP methods / absolute paths in source_refs.
  if (Array.isArray(model.source_refs)) {
    for (const ref of model.source_refs) {
      if (!SAFE_PATH_RE.test(ref) || !isAllowlistedSourceRef(ref)) {
        blockers.push({ code: BLOCKER_CODES.SOURCE_NOT_ALLOWLISTED(ref || 'missing'), reason: 'source ref fails allowlist or safe-path regex' });
      }
      if (ABSOLUTE_PATH_RE.test(String(ref || ''))) blockers.push({ code: BLOCKER_CODES.PATH_TRAVERSAL('absolute-ref:' + ref), reason: 'absolute path in source_refs' });
    }
  }
  // Launch posture frozen invariant.
  if (!_isObject(model.launch_posture)) {
    blockers.push({ code: BLOCKER_CODES.LAUNCH_POSTURE_DRIFT('missing'), reason: 'launch_posture missing' });
  } else {
    for (const key of ['orchestration', 'evidence', 'launch']) {
      if (model.launch_posture[key] !== FROZEN_LAUNCH_POSTURE[key]) blockers.push({ code: BLOCKER_CODES.LAUNCH_POSTURE_DRIFT(key + ':' + model.launch_posture[key] + '!=' + FROZEN_LAUNCH_POSTURE[key]), reason: 'launch_posture[' + key + '] drifted' });
    }
    if (model.launch_posture.bounded_internal !== true) blockers.push({ code: BLOCKER_CODES.LAUNCH_POSTURE_DRIFT('bounded_internal:false'), reason: 'bounded_internal must be true' });
  }
  // Redaction safety.
  const redactionHits = checkRedactionSafety(model);
  for (const hit of redactionHits) blockers.push({ code: BLOCKER_CODES.REDACTION_LEAK(hit.kind + '@' + hit.path), reason: 'redaction safety violation' });
  return {
    ok: blockers.length === 0,
    exit_code: blockers.length === 0 ? EXIT_CODES.PASS : mapBlockerToExitCode(blockers[0].code),
    blockers,
    redaction_hits: redactionHits,
    model,
  };
}

function evaluateAcceptanceContract(input) {
  return evaluateAcceptance(input);
}

// ---------------------------------------------------------------------------
// 19. Exit code mapping
// ---------------------------------------------------------------------------
function mapBlockerToExitCode(blockerCode) {
  if (typeof blockerCode !== 'string') return EXIT_CODES.RUNNER_FAILURE;
  if (/SOURCE-NOT-ALLOWLISTED|SOURCE-MISSING/.test(blockerCode)) return EXIT_CODES.IDENTITY_DRIFT;
  if (/SOURCE-HASH-DRIFT|REPLAY-DRIFT/.test(blockerCode)) return EXIT_CODES.REPLAY_DRIFT;
  if (/PATH-TRAVERSAL/.test(blockerCode)) return EXIT_CODES.REJECTED_FAIL_CLOSED;
  if (/REDACTION-LEAK|FORBIDDEN-KEY-LEAK|RAW-BODIES/.test(blockerCode)) return EXIT_CODES.REDACTION_LEAK;
  if (/R041|MILESTONE-CRITERION|S05-DIVERGENCE|S05-VERIFIER-PROVENANCE|S08-PROMOTION|S08-CLOSURE-KIND|NOT-PROVEN-REMOVED|LAUNCH-POSTURE-DRIFT|CAPABILITY-PROMOTION/.test(blockerCode)) return EXIT_CODES.CLOSURE_KIND_DRIFT;
  if (/VERDICT-FORBIDDEN|SECTION-MISSING|HEALTHLINE-MISMATCH/.test(blockerCode)) return EXIT_CODES.REJECTED_FAIL_CLOSED;
  return EXIT_CODES.RUNNER_FAILURE;
}

// ---------------------------------------------------------------------------
// 20. Negative fixture taxonomy (consumed by T04 tamper suite)
// ---------------------------------------------------------------------------
const NEGATIVE_FIXTURE_TAXONOMY = Object.freeze([
  Object.freeze({
    fixture_id: 'NF1',
    label: 'R041 structural component missing',
    category: 'r041_structural_missing',
    target_section: 'r041_acceptance',
    blocker: () => BLOCKER_CODES.R041_STRUCTURAL_MISSING('reproducible_worksheet'),
    closure_kind_target: 'fail_closed',
  }),
  Object.freeze({
    fixture_id: 'NF2',
    label: 'Milestone criterion drift (bullet reordered / dropped)',
    category: 'milestone_criterion_drift',
    target_section: 'milestone_criterion',
    blocker: () => BLOCKER_CODES.MILESTONE_CRITERION_DRIFT('bullet-count-mismatch'),
    closure_kind_target: 'fail_closed',
  }),
  Object.freeze({
    fixture_id: 'NF3',
    label: 'S05 producer/verifier drift unsurfaced (frozen_reconciliation != PARTIAL)',
    category: 's05_producer_verifier_drift_unsurfaced',
    target_section: 's05_canonical_verdicts',
    blocker: () => BLOCKER_CODES.S05_DIVERGENCE_PROMOTION('frozen_reconciliation-mismatch'),
    closure_kind_target: 'fail_closed',
  }),
  Object.freeze({
    fixture_id: 'NF4',
    label: 'S08 scope decision promotion attempt (closure_kind != scope_revised)',
    category: 's08_scope_promotion_attempt',
    target_section: 's08_scope_decision',
    blocker: () => BLOCKER_CODES.S08_PROMOTION_ATTEMPT('closure_kind-promotion'),
    closure_kind_target: 'fail_closed',
  }),
  Object.freeze({
    fixture_id: 'NF5',
    label: 'NOT_PROVEN reclassified to PASS / launch-ready',
    category: 'not_proven_to_pass_reclassified',
    target_section: 'not_proven_preservation',
    blocker: () => BLOCKER_CODES.NOT_PROVEN_REMOVED('NOT_PROVEN_SCOPE_REVISED'),
    closure_kind_target: 'fail_closed',
  }),
  Object.freeze({
    fixture_id: 'NF6',
    label: 'Capability promotion leaked (bounded_internal=false or promotion tokens)',
    category: 'capability_promotion_leaked',
    target_section: 'canonical_acceptance_outcome',
    blocker: () => BLOCKER_CODES.CAPABILITY_PROMOTION_LEAKED('bounded_internal-false'),
    closure_kind_target: 'fail_closed',
  }),
  Object.freeze({
    fixture_id: 'NF7',
    label: 'Source hash drift (allowlisted source mutated between pre/post)',
    category: 'source_hash_drift',
    target_section: 's05_canonical_verdicts',
    blocker: () => BLOCKER_CODES.SOURCE_HASH_DRIFT('m016-s05-seven-division-replay-bundle.json'),
    closure_kind_target: 'fail_closed',
  }),
  Object.freeze({
    fixture_id: 'NF8',
    label: 'Launch class drift (orchestration/evidence/launch drifted from frozen posture)',
    category: 'launch_class_drift',
    target_section: 'canonical_acceptance_outcome',
    blocker: () => BLOCKER_CODES.LAUNCH_POSTURE_DRIFT('orchestration:NOT_PROVEN'),
    closure_kind_target: 'fail_closed',
  }),
]);
const NEGATIVE_FIXTURE_IDS = Object.freeze(NEGATIVE_FIXTURE_TAXONOMY.map((f) => f.fixture_id));
const NEGATIVE_FIXTURE_CATEGORIES = Object.freeze(Array.from(new Set(NEGATIVE_FIXTURE_TAXONOMY.map((f) => f.category))));
const EXPECTED_NEGATIVE_FIXTURE_COUNT = NEGATIVE_FIXTURE_TAXONOMY.length; // 8

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = Object.freeze({
  // 1. SCHEMA + NAMESPACE
  SCHEMA_ID, SCHEMA_VERSION, SCHEMA_NAMESPACE,
  MILESTONE, SLICE, TASK_IDS, TASK,
  ACCEPTANCE_CONTRACT_ID, ACCEPTANCE_CONTRACT_KIND,
  NAMESPACE, BUILDER_LINE_CLASS, VERIFIER_LINE_CLASS,
  BUILDER_CANONICAL_PROTOCOL, VERIFIER_CANONICAL_PROTOCOL,
  BLOCKER_NAMESPACE, BLOCKER_CODE_PATTERN, BLOCKER_CODE_REGEX,
  isAcceptanceBlockerCode,
  ACCEPTANCE_CONTRACT_REFERENCE_TIME,

  // 2. SECTIONS
  ACCEPTANCE_SECTION_IDS, ACCEPTANCE_SECTION_LABELS_RU,
  ACCEPTANCE_SECTION_SET, EXPECTED_SECTION_COUNT, isKnownAcceptanceSection,
  NOT_PROVEN_INVARIANT_ID,

  // 3. SOURCE_ALLOWLIST
  SOURCE_ALLOWLIST, SOURCE_ALLOWLIST_REFS, SOURCE_ALLOWLIST_SET,
  EXPECTED_SOURCE_COUNT, isAllowlistedSourceRef, getSourceEntry,
  REF, SAFE_PATH_RE, PROHIBITED_METHOD_RE, ABSOLUTE_PATH_RE,

  // 4. VERDICT_VALUES
  VERDICT_VALUES, BOUNDARY_VALUES,
  ORCHESTRATION_VERDICTS, EVIDENCE_VERDICTS, LAUNCH_VERDICTS,
  ORCHESTRATION_VERDICTS_SET, EVIDENCE_VERDICTS_SET, LAUNCH_VERDICTS_SET,
  isValidOrchestrationVerdict, isValidEvidenceVerdict, isValidLaunchVerdict,
  FORBIDDEN_ACCEPTANCE_VERDICTS, FORBIDDEN_ACCEPTANCE_VERDICTS_SET, isForbiddenAcceptanceVerdict,

  // 5. R041
  R041_STRUCTURAL_COMPONENTS, R041_STRUCTURAL_COMPONENTS_SET,
  EXPECTED_R041_COMPONENT_COUNT, isKnownR041Component,
  FORBIDDEN_R041_SATISFACTION, FORBIDDEN_R041_SATISFACTION_SET, isForbiddenR041Satisfaction,

  // 6. MILESTONE_CRITERION
  MILESTONE_CRITERION_BULLETS, MILESTONE_CRITERION_BULLET_IDS,
  MILESTONE_CRITERION_BULLET_IDS_SET, EXPECTED_MILESTONE_CRITERION_COUNT, isKnownMilestoneBullet,

  // 7. S05 reconciliation
  S05_VERDICT_RECONCILIATION,

  // 8. S08 posture
  S08_FROZEN_POSTURE, S08_CLOSURE_KIND_VALUES, S08_CLOSURE_KIND_VALUES_SET, isKnownS08ClosureKind,

  // 9. Launch posture
  FROZEN_LAUNCH_POSTURE,

  // 10. NOT_PROVEN preservation
  NOT_PROVEN_PRESERVED_IDS, NOT_PROVEN_PRESERVED_IDS_SET,
  EXPECTED_NOT_PROVEN_COUNT, isPreservedNotProvenId,

  // 11. BLOCKER_CODES
  BLOCKER_CODES,

  // 12. EXIT_CODES
  EXIT_CODES,

  // 13. HEALTH_LINES
  buildHealthLineBuilder, buildHealthLineAcceptance,

  // 14. DEFAULTS
  DEFAULTS,

  // 15. Pure builders
  buildR041Acceptance, buildMilestoneCriterion, buildS05CanonicalVerdicts,
  buildS08ScopeDecision, buildNotProvenPreservation, buildCanonicalAcceptanceOutcome,
  buildAcceptanceModel,

  // 16. Redaction
  FORBIDDEN_KEYS, FLAG_KEYS, REDACTION_FLAG_VALUES, REDACTION_PATTERNS,
  checkRedactionSafety, assertWriteSafe,

  // 17. Digest helpers
  sha256Hex, _stableStringify, canonicalizeAcceptanceModel, computeAcceptanceDigest,

  // 18. Evaluator
  evaluateAcceptance, evaluateAcceptanceContract,

  // 19. Exit code mapping
  mapBlockerToExitCode,

  // 20. Negative fixture taxonomy
  NEGATIVE_FIXTURE_TAXONOMY, NEGATIVE_FIXTURE_IDS, NEGATIVE_FIXTURE_CATEGORIES,
  EXPECTED_NEGATIVE_FIXTURE_COUNT,
});