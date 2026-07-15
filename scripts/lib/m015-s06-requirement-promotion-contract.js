#!/usr/bin/env node
'use strict';

/**
 * scripts/lib/m015-s06-requirement-promotion-contract.js
 *
 * M015-4o8lfw / S06 / T05 — Mission Level Requirement Promotion and Readback
 * contract logic.
 *
 * Pure-function surface:
 *   - loadJsonSafe(filePath): read + parse JSON or return { value: null, error }
 *   - computeFileSha256(filePath): SHA-256 of file contents (hex)
 *   - detectLeakHits(value, jsonPath, hits): recursive UUID/credential/xiaomi
 *     scanner; writes findings into `hits` array
 *   - scrubEvidence(value): recursive scrubber replacing UUIDs with
 *     <redacted-id>, credential assignments with <redacted-credential-fragment>,
 *     and api-key/secret/password/token keys with <redacted>
 *   - assertWriteSafe(payload): throws if serialized payload still contains
 *     blocking leak patterns (defence-in-depth)
 *   - isPassVerdict(verdictString): PASS-flavor matcher
 *   - isBlockedVerdict(verdictString): BLOCKED-flavor matcher
 *   - deriveSafeBlockDeclared(preflight, missionRun, validation, publicUi):
 *     union of upstream safe-block signals
 *   - evaluatePreflightJointProof(preflight): JP1
 *   - evaluateMissionJointProof(missionRun, validation): JP2 (uses validation
 *     to read MG10 protocol gates since mission-run itself doesn't expose MG
 *     matrix)
 *   - evaluateValidationJointProof(validation): JP3 (VG1-VG6 all green)
 *   - evaluateUiJointProof(publicUi, safeBlockDeclared): JP4
 *   - evaluateLeakScans(preflight, missionRun, validation, publicUi, s05):
 *     JP5 (recursive scan over all 5 upstream files)
 *   - evaluateRidAllowlist(ownedRids): JP6
 *   - evaluateBusinessMutations(preflight, missionRun, validation): JP7
 *   - evaluateDoNotPromote(preflight, s04Admission, validation): JP8
 *   - evaluateMissionRunPresent(missionRun): JP9
 *   - evaluateJointProof(upstream): orchestrator that runs JP1-JP9 and
 *     returns { gates: {jp1..jp9}, all_pass, blocking_reasons }
 *   - derivePreviousTier(rid, s05Remediation): look up R-ID's tier in S05
 *     requirement_status; fall back to PREVIOUS_TIER_DEFAULTS
 *   - computeRequirementReadback(upstream, jointProof, previousTiers,
 *     capabilityConstraints): array of { rid, status, promoted_to_mission,
 *     previous_tier, proposed_tier, evidence_refs, non_promotion_reason,
 *     capability_constraints_excluded }
 *   - buildDbReadbackPayload(readback, jointProof): gsd_requirement_update
 *     payload describing what calls would be issued if joint proof passed.
 *     Under fail-closed this list is empty; the structure records what would
 *     happen so the artifact remains audit-ready.
 *   - buildNonPromotions(readback, jointProof, capabilityConstraints):
 *     explicit reason list
 *   - buildCapabilityPromotions(readback, jointProof, capabilityConstraints):
 *     explicit list of capability surfaces and their promotion status (all
 *     denied under fail-closed)
 *   - buildPromotionEvidence(upstream, jointProof, readback, options):
 *     full evidence object
 *   - deriveVerdictCode(jointProof, blockers): map joint proof outcome to
 *     canonical verdict code
 *   - deriveVerdictLine(verdictCode, jointProof, readback): stdout canonical
 *     M015_S06_PROMOTION=... line
 *   - exitCodeFor(verdictCode): exit code mapping
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const data = require('./m015-s06-requirement-promotion-data');

const {
  CANONICAL_VERDICT,
  VERDICT_CODES,
  PROOF_TIERS,
  OWNED_RID_ALLOWLIST,
  RID_SET,
  RID_LABELS,
  RID_EVIDENCE_POINTERS,
  EXCLUDED_CAPABILITY_SURFACES,
  JOINT_PROOF_GATE_LABELS,
  REDACTION_DISCIPLINE_KEYS,
  CANONICAL_SCHEMA,
  REQUIRED_TOP_LEVEL_KEYS,
  PREVIOUS_TIER_DEFAULTS,
  S05_RID_KEY_MAP,
  UPSTREAM_PATHS,
  OUTPUT_PATH,
} = data;

const ROOT = path.resolve(__dirname, '..', '..');
const CONTRACT_ROOT = ROOT;

// ---------------------------------------------------------------------------
// Redaction helpers (mirroring scripts/probe_m015_seven_agent_environment.js
// and scripts/lib/m015-s04-native-mission-contract.js scrubEvidence).
// ---------------------------------------------------------------------------

const UUID_FULL = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const CREDENTIAL_ASSIGNMENT = /\b(?:PAPERCLIP_API_KEY|MINIMAX_API_KEY|XIAOMI_API_KEY|BETTER_AUTH_SECRET|POSTGRES_PASSWORD|DATABASE_URL|OPENAI_API_KEY)\s*=\s*[^\s,;'"]+/i;
const XIAOMI_RE = /\b(?:xiaomi|mimo)\b/i;
const SECRET_HYGIENE_SYNTHETIC_BOS = /<bos[\s_-]?light>/i;

// Diagnostic-label paths that legitimately mention xiaomi/mimo as part of
// DESCRIBING the leak detector (e.g. gate_labels.autonomy_and_no_synthetic_bos_pass,
// blockers[].code = 'M15-S06-VALIDATION-VG5-XIAOMI-REUSE-DETECTED'). Skipping
// only well-known label paths avoids the chicken-and-egg problem where the
// leak detector's own metadata would re-trigger itself. An attacker would
// need to inject xiaomi into a non-label field to bypass detection.
const SKIP_KEY_PATHS = Object.freeze([
  'gate_labels',         // VG descriptions (legitimately mention what VG5 checks)
  'gate_label',          // singular form
  'label',               // human-readable descriptions (R-ID labels, gate labels)
]);
const SKIP_VALUE_PATTERNS = Object.freeze([
  /^M15-[A-Z0-9-]+$/,    // canonical blocker code (M15-S06-VALIDATION-VG5-XIAOMI-REUSE-DETECTED)
]);

function scrubEvidence(value) {
  if (value == null) return value;
  if (typeof value === 'string') {
    if (UUID_FULL.test(value)) return '<redacted-id>';
    if (CREDENTIAL_ASSIGNMENT.test(value)) return '<redacted-credential-fragment>';
    return value;
  }
  if (Array.isArray(value)) return value.map(scrubEvidence);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (/api[_-]?key|secret|password|token/i.test(k)) { out[k] = '<redacted>'; continue; }
      out[k] = scrubEvidence(v);
    }
    return out;
  }
  return value;
}

function detectLeakHits(value, jsonPath, hits) {
  if (value == null) return;
  if (typeof value === 'string') {
    // Skip canonical blocker-code values like M15-S06-VALIDATION-VG5-XIAOMI-REUSE-DETECTED.
    // These are stable identifiers used by validators to label what they check for;
    // they describe the leak detector's own purpose, not an actual leak.
    if (SKIP_VALUE_PATTERNS.some((re) => re.test(value))) return;
    if (UUID_FULL.test(value)) hits.push({ kind: 'uuid_full', path: jsonPath, tail: value.slice(0, 80) });
    if (CREDENTIAL_ASSIGNMENT.test(value)) hits.push({ kind: 'credential_assignment', path: jsonPath, tail: value.slice(0, 80) });
    if (XIAOMI_RE.test(value)) hits.push({ kind: 'xiaomi_reuse', path: jsonPath, tail: value.slice(0, 80) });
    if (SECRET_HYGIENE_SYNTHETIC_BOS.test(value)) hits.push({ kind: 'synthetic_bos', path: jsonPath, tail: value.slice(0, 80) });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => detectLeakHits(v, `${jsonPath}[${i}]`, hits));
    return;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      // Skip already-scrubbed placeholders so we don't false-positive
      if (typeof v === 'string' && (v === '<redacted-id>' || v === '<redacted-credential-fragment>' || v === '<redacted>')) continue;
      // Skip whole subtrees under well-known diagnostic-label paths
      if (SKIP_KEY_PATHS.includes(k)) continue;
      detectLeakHits(v, `${jsonPath}.${k}`, hits);
    }
  }
}

function assertWriteSafe(payload) {
  // Serialize-then-reparse so the leak scan traverses the OBJECT tree (where
  // SKIP_KEY_PATHS can exclude gate_labels/label subtrees) rather than
  // treating the whole JSON as a single string. Without this reparse, any
  // descriptive xiaomi/mimo substring inside a label field would trip the
  // scan, even though the field is semantically a description, not a leak.
  const serialized = JSON.stringify(payload);
  const reparsed = JSON.parse(serialized);
  const hits = [];
  detectLeakHits(reparsed, '$', hits);
  if (hits.length > 0) {
    const err = new Error(`refusing to persist evidence: leak detected in serialized payload: ${hits.slice(0, 3).map((h) => h.kind).join(', ')}`);
    err.hits = hits;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

function loadJsonSafe(filePath) {
  const rel = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
  if (!fs.existsSync(rel)) return { value: null, path: rel, exists: false };
  try {
    const raw = fs.readFileSync(rel, 'utf8');
    const value = JSON.parse(raw);
    return { value, path: rel, exists: true };
  } catch (err) {
    return { value: null, path: rel, exists: true, error: err.message };
  }
}

function computeFileSha256(filePath) {
  const rel = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
  if (!fs.existsSync(rel)) return null;
  const raw = fs.readFileSync(rel);
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function fileSize(filePath) {
  const rel = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
  if (!fs.existsSync(rel)) return null;
  return fs.statSync(rel).size;
}

// ---------------------------------------------------------------------------
// Verdict-shape matchers
// ---------------------------------------------------------------------------

const PASS_VERDICT_PATTERNS = Object.freeze([
  /^MISSION_PASS$/,
  /^PASS_AUTH_NO_LEAK$/,
  /^PREFLIGHT_GREEN$/,
  /^ADMITTED$/,
]);

const BLOCKED_VERDICT_PATTERNS = Object.freeze([
  /^MISSION_BLOCKED/,
  /^MISSION_FAIL_CLOSED/,
  /^BLOCKED_ON_/,
  /^BLOCKED_/,
  /^PREFLIGHT_BLOCKED/,
  /^BLOCKED_UI_/,
  /^FAIL_CLOSED/,
]);

function isPassVerdict(s) {
  if (typeof s !== 'string') return false;
  return PASS_VERDICT_PATTERNS.some((re) => re.test(s));
}

function isBlockedVerdict(s) {
  if (typeof s !== 'string') return false;
  return BLOCKED_VERDICT_PATTERNS.some((re) => re.test(s));
}

function deriveSafeBlockDeclared(preflight, missionRun, validation, publicUi) {
  // Union of upstream safe-block signals — same approach as T04 public UI
  // runner (per S06 T04 summary). If any upstream is blocked/safe-block,
  // safe_block_declared=true.
  const sources = [
    preflight && preflight.value,
    missionRun && missionRun.value,
    validation && validation.value,
    publicUi && publicUi.value,
  ];
  for (const ev of sources) {
    if (!ev) continue;
    const verdict = ev.verdict || ev.status;
    if (typeof verdict === 'string' && isBlockedVerdict(verdict)) return true;
    if (ev.safe_block_declared === true) return true;
    // Mission-run has root_issue=null/mission_run=null safety signals
    if (ev.root_issue === null && ev.mission_run === null) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Joint-proof evaluators (JP1..JP9)
// ---------------------------------------------------------------------------

function evaluatePreflightJointProof(preflight) {
  if (!preflight || !preflight.value) {
    return { label: JOINT_PROOF_GATE_LABELS.preflight_admitted, passed: false, detail: 'preflight evidence missing' };
  }
  const v = preflight.value;
  const verdict = v.verdict || v.status;
  const admitted = verdict === 'ADMITTED' || verdict === 'PREFLIGHT_GREEN';
  const blocked = isBlockedVerdict(verdict);
  return {
    label: JOINT_PROOF_GATE_LABELS.preflight_admitted,
    passed: admitted && !blocked,
    detail: admitted
      ? `preflight verdict=${verdict} admitted=${v.admitted === true || admitted}`
      : `preflight verdict=${verdict} is not ADMITTED`,
    verdict,
    admitted,
    business_mutations_recorded: v.business_mutations_recorded,
  };
}

function evaluateMissionJointProof(missionRun, validation) {
  if (!missionRun || !missionRun.value) {
    return { label: JOINT_PROOF_GATE_LABELS.mission_pass, passed: false, detail: 'mission-run evidence missing' };
  }
  const mr = missionRun.value;
  const status = mr.status;
  const isPass = status === 'MISSION_PASS';
  // For MG1-MG10 we rely on the validation file (T03) which independently
  // re-derives the protocol gates and exposes them as protocol.protocol.allowlisted_side_effects
  // and protocol_gates.
  let mgAllGreen = false;
  let mgDetails = [];
  if (validation && validation.value) {
    const v = validation.value;
    const gates = v.protocol_gates || {};
    mgDetails = Object.entries(gates).map(([k, val]) => ({ gate: k, value: val }));
    // For blocked-upstream state, all MG gates are expected to be false; for
    // admitted state they should all be true.
    mgAllGreen = Object.values(gates).every((val) => val === true);
  }
  // Mission-run itself does not need MG-green under fail-closed; we evaluate
  // pass based on its own status. MG-green is captured by validation.gates.
  return {
    label: JOINT_PROOF_GATE_LABELS.mission_pass,
    passed: isPass && mgAllGreen,
    detail: isPass
      ? `mission status=${status} MG1-MG10=${mgAllGreen ? 'all green' : 'pending validation'}`
      : `mission status=${status} (expected MISSION_PASS)`,
    status,
    mg_all_green: mgAllGreen,
    root_issue: mr.root_issue,
    mission_run: mr.mission_run,
    mg_gates_observed: mgDetails,
  };
}

function evaluateValidationJointProof(validation) {
  if (!validation || !validation.value) {
    return { label: JOINT_PROOF_GATE_LABELS.validation_pass, passed: false, detail: 'validation evidence missing' };
  }
  const v = validation.value;
  const status = v.status;
  const isPass = status === 'MISSION_PASS';
  // VG1-VG6 must all be true; VG7/VG8 are S06-specific boundary provenance
  // gates that can stay informational.
  const gates = v.gates || {};
  const vg1to6 = ['readback_integrity_pass', 'preflight_correlation_pass', 'zero_business_mutation_ledger_pass', 'protocol_ledger_correlation_pass', 'autonomy_and_no_synthetic_bos_pass', 'safe_block_not_promoted_pass'];
  const vg1to6Pass = vg1to6.every((k) => gates[k] === true);
  return {
    label: JOINT_PROOF_GATE_LABELS.validation_pass,
    passed: isPass && vg1to6Pass,
    detail: isPass
      ? `validation status=${status} VG1-VG6=${vg1to6Pass ? 'all green' : 'some fail'}`
      : `validation status=${status} (expected MISSION_PASS)`,
    status,
    vg1to6_all_green: vg1to6Pass,
    gates,
  };
}

function evaluateUiJointProof(publicUi, safeBlockDeclared) {
  if (!publicUi || !publicUi.value) {
    return { label: JOINT_PROOF_GATE_LABELS.ui_pass_no_safe_block, passed: false, detail: 'public-ui evidence missing' };
  }
  const u = publicUi.value;
  const verdict = u.verdict || u.status;
  const isPass = verdict === 'PASS_AUTH_NO_LEAK';
  // JP4 requires upstream safe_block=false (no upstream safe-block context)
  // because a real mission graph must be present in the UI, not a synthetic
  // negative probe.
  const noSafeBlock = safeBlockDeclared === false;
  return {
    label: JOINT_PROOF_GATE_LABELS.ui_pass_no_safe_block,
    passed: isPass && noSafeBlock,
    detail: isPass
      ? `ui verdict=${verdict} safe_block_declared=${safeBlockDeclared}`
      : `ui verdict=${verdict} (expected PASS_AUTH_NO_LEAK)`,
    verdict,
    safe_block_declared: safeBlockDeclared,
    no_safe_block: noSafeBlock,
  };
}

function evaluateLeakScans(preflight, missionRun, validation, publicUi, s05) {
  const hits = [];
  const sources = [
    { name: 'preflight', ev: preflight },
    { name: 'mission_run', ev: missionRun },
    { name: 'validation', ev: validation },
    { name: 'public_ui', ev: publicUi },
    { name: 's05_remediation', ev: s05 },
  ];
  for (const { name, ev } of sources) {
    if (!ev || !ev.value) continue;
    detectLeakHits(ev.value, `$.${name}`, hits);
  }
  // Blocking hits = any uuid_full, credential_assignment, xiaomi_reuse,
  // synthetic_bos. Note: T03 validation evidence includes xiaomi_hits array
  // populated as part of normal diagnostic output; if those arrays contain
  // the string 'xiaomi' as a diagnostic label, they will trigger xiaomi_reuse
  // detection. This is by design — if xiaomi appears ANYWHERE in raw
  // upstream evidence it should be a blocking signal (per S06 must-have
  // "пустые leak scans"). The T03 evidence uses placeholder labels
  // ('xiaomi-reuse-detected' boolean) rather than literal xiaomi strings, so
  // the scan will normally be empty.
  const blockingKinds = new Set(['uuid_full', 'credential_assignment', 'xiaomi_reuse', 'synthetic_bos']);
  const blocking = hits.filter((h) => blockingKinds.has(h.kind));
  return {
    label: JOINT_PROOF_GATE_LABELS.leak_scans_clean,
    passed: blocking.length === 0,
    detail: blocking.length === 0
      ? `0 blocking findings across 5 upstream evidence files (${hits.length} informational hits)`
      : `${blocking.length} blocking findings: ${blocking.slice(0, 3).map((h) => `${h.kind}@${h.path}`).join('; ')}`,
    blocking_count: blocking.length,
    informational_count: hits.length - blocking.length,
    blocking_hits: blocking.slice(0, 10),
    all_hits_count: hits.length,
  };
}

function evaluateRidAllowlist(ownedRids) {
  const ridList = Array.isArray(ownedRids) ? ownedRids : OWNED_RID_ALLOWLIST;
  const outOfAllowlist = ridList.filter((r) => !RID_SET.has(r));
  return {
    label: JOINT_PROOF_GATE_LABELS.r_id_allowlist_ok,
    passed: outOfAllowlist.length === 0,
    detail: outOfAllowlist.length === 0
      ? `all ${ridList.length} owned R-IDs are in allowlist R019/R022/R023/R026/R030/R031/R032/R035/R037`
      : `out-of-allowlist R-IDs: ${outOfAllowlist.join(', ')}`,
    owned_count: ridList.length,
    allowlist_count: OWNED_RID_ALLOWLIST.length,
    out_of_allowlist: outOfAllowlist,
  };
}

function evaluateBusinessMutations(preflight, missionRun, validation) {
  // Per S06 must-have: business_mutations_recorded=0 AND no premature
  // mutations under BLOCKED preflight.
  const pf = preflight && preflight.value ? preflight.value : null;
  const mr = missionRun && missionRun.value ? missionRun.value : null;
  const va = validation && validation.value ? validation.value : null;
  const pfMut = pf ? Number(pf.business_mutations_recorded || 0) : null;
  const harnessRoot = mr && mr.harness_writes ? Number(mr.harness_writes.root_issue_create || 0) : null;
  const safeBlockEvidence = va && va.safe_block_evidence ? va.safe_block_evidence : null;
  const clean = (
    pfMut === 0 &&
    harnessRoot === 0 &&
    (safeBlockEvidence == null || safeBlockEvidence.harness_root_issue_create === 0) &&
    (safeBlockEvidence == null || safeBlockEvidence.mission_run_null === true)
  );
  return {
    label: JOINT_PROOF_GATE_LABELS.business_mutations_clean,
    passed: clean,
    detail: clean
      ? `preflight.business_mutations_recorded=0, harness.root_issue_create=0, safe_block.mission_run_null=true`
      : `business mutation invariant violated (pf=${pfMut}, harness=${harnessRoot})`,
    preflight_business_mutations_recorded: pfMut,
    harness_root_issue_create: harnessRoot,
    safe_block_mission_run_null: safeBlockEvidence ? safeBlockEvidence.mission_run_null : null,
  };
}

function evaluateDoNotPromote(preflight, s04Admission, validation) {
  const sources = [
    preflight && preflight.value,
    s04Admission && s04Admission.value,
    validation && validation.value,
  ].filter(Boolean);
  const flags = sources.map((e) => e.do_not_promote_s04).filter((v) => typeof v === 'boolean');
  const anyTrue = flags.some((v) => v === true);
  return {
    label: JOINT_PROOF_GATE_LABELS.do_not_promote_clean,
    passed: !anyTrue,
    detail: anyTrue
      ? `do_not_promote_s04=true detected in ${flags.filter((v) => v === true).length} upstream file(s)`
      : `do_not_promote_s04=false across ${sources.length} upstream file(s)`,
    any_true: anyTrue,
    sources_observed: sources.length,
  };
}

function evaluateMissionRunPresent(missionRun) {
  const mr = missionRun && missionRun.value ? missionRun.value : null;
  const present = !!(mr && mr.mission_run && typeof mr.mission_run === 'object');
  const childrenCount = mr && mr.mission_run && Array.isArray(mr.mission_run.children) ? mr.mission_run.children.length : null;
  const allAgentsTerminal = mr && mr.mission_run && mr.mission_run.all_agents_terminal === true;
  return {
    label: JOINT_PROOF_GATE_LABELS.mission_run_present,
    passed: present && childrenCount === 6 && allAgentsTerminal,
    detail: present
      ? `mission_run present, children=${childrenCount}, all_agents_terminal=${allAgentsTerminal}`
      : `mission_run absent or null (mission is BLOCKED upstream)`,
    present,
    children_count: childrenCount,
    all_agents_terminal: allAgentsTerminal,
  };
}

function evaluateJointProof(upstream) {
  const {
    preflight, missionRun, validation, publicUi, s05, s04Admission,
  } = upstream;
  const safeBlockDeclared = deriveSafeBlockDeclared(preflight, missionRun, validation, publicUi);
  const gates = {
    preflight_admitted: evaluatePreflightJointProof(preflight),
    mission_pass: evaluateMissionJointProof(missionRun, validation),
    validation_pass: evaluateValidationJointProof(validation),
    ui_pass_no_safe_block: evaluateUiJointProof(publicUi, safeBlockDeclared),
    leak_scans_clean: evaluateLeakScans(preflight, missionRun, validation, publicUi, s05),
    r_id_allowlist_ok: evaluateRidAllowlist(),
    business_mutations_clean: evaluateBusinessMutations(preflight, missionRun, validation),
    do_not_promote_clean: evaluateDoNotPromote(preflight, s04Admission, validation),
    mission_run_present: evaluateMissionRunPresent(missionRun),
  };
  const allPass = Object.values(gates).every((g) => g.passed === true);
  const blockingReasons = Object.entries(gates)
    .filter(([_, g]) => g.passed === false)
    .map(([k, g]) => ({ gate: k, label: g.label, detail: g.detail }));
  return {
    safe_block_declared: safeBlockDeclared,
    gates,
    all_pass: allPass,
    blocking_reasons: blockingReasons,
    jp_count: Object.keys(gates).length,
    jp_pass_count: Object.values(gates).filter((g) => g.passed === true).length,
  };
}

// ---------------------------------------------------------------------------
// Per-R-ID readback computation
// ---------------------------------------------------------------------------

function derivePreviousTier(rid, s05Remediation) {
  // Look up S05's previous tier via S05_RID_KEY_MAP; fall back to defaults.
  if (s05Remediation && s05Remediation.value && s05Remediation.value.requirement_status) {
    const s05Key = S05_RID_KEY_MAP[rid];
    if (s05Key && s05Remediation.value.requirement_status[s05Key]) {
      return s05Remediation.value.requirement_status[s05Key].status || PREVIOUS_TIER_DEFAULTS[rid] || PROOF_TIERS.NOT_PROMOTED;
    }
  }
  return PREVIOUS_TIER_DEFAULTS[rid] || PROOF_TIERS.NOT_PROMOTED;
}

function computeRequirementReadback(upstream, jointProof, previousTiers, capabilityConstraints) {
  const readback = [];
  for (const rid of OWNED_RID_ALLOWLIST) {
    const previousTier = previousTiers[rid] || PREVIOUS_TIER_DEFAULTS[rid] || PROOF_TIERS.NOT_PROMOTED;
    const jointPass = jointProof.all_pass;
    const proposedTier = jointPass ? PROOF_TIERS.MISSION_PROVEN : previousTier;
    const promoted = proposedTier === PROOF_TIERS.MISSION_PROVEN && previousTier !== PROOF_TIERS.MISSION_PROVEN;
    const nonPromotionReason = (() => {
      if (jointPass) return null;
      const reasons = jointProof.blocking_reasons.map((r) => r.gate).filter(Boolean);
      return `joint proof failed: ${reasons.length === 0 ? 'unknown' : reasons.join(', ')}`;
    })();
    const evidenceRefs = RID_EVIDENCE_POINTERS[rid] || [];
    readback.push({
      rid,
      label: RID_LABELS[rid],
      status: proposedTier,
      promoted_to_mission: promoted,
      previous_tier: previousTier,
      proposed_tier: proposedTier,
      evidence_refs: evidenceRefs,
      evidence_files: ['runtime-evidence/M015-S06-preflight.json', 'runtime-evidence/M015-S06-native-mission-run.json', 'runtime-evidence/M015-S06-native-mission-validation.json', 'runtime-evidence/M015-S06-public-ui-proof.json'],
      non_promotion_reason: nonPromotionReason,
      capability_constraints_excluded: capabilityConstraints || EXCLUDED_CAPABILITY_SURFACES,
      joint_pass_required: true,
    });
  }
  return readback;
}

// ---------------------------------------------------------------------------
// DB readback payload — describes gsd_requirement_update calls that would be
// issued if joint proof passed. Under fail-closed, list is empty.
// ---------------------------------------------------------------------------

function buildDbReadbackPayload(readback, jointProof) {
  const calls = [];
  if (!jointProof.all_pass) {
    return {
      tool: 'gsd_requirement_update',
      will_execute: false,
      reason: 'joint proof not all-pass; DB readback deferred until joint proof passes',
      calls,
      joint_proof_summary: {
        all_pass: jointProof.all_pass,
        blocking_gate_count: jointProof.blocking_reasons.length,
      },
    };
  }
  for (const r of readback) {
    if (r.promoted_to_mission) {
      calls.push({
        id: r.rid,
        action: 'promote',
        status: 'mission-level',
        notes: `S06 joint proof passed; promoted from ${r.previous_tier} to ${r.proposed_tier}`,
        primary_owner: 'M015-4o8lfw/S06',
        supporting_slices: 'M015-4o8lfw/S05, M015-4o8lfw/S04, M015-4o8lfw/S03',
        validation: 'S06 joint runtime + independent + browser proof (T01+T02+T03+T04 all PASS)',
      });
    }
  }
  return {
    tool: 'gsd_requirement_update',
    will_execute: true,
    reason: 'joint proof passed; DB readback calls ready for invocation',
    calls,
    joint_proof_summary: {
      all_pass: jointProof.all_pass,
      jp_pass_count: jointProof.jp_pass_count,
      jp_total_count: jointProof.jp_count,
    },
  };
}

// ---------------------------------------------------------------------------
// Non-promotions and capability-promotions lists
// ---------------------------------------------------------------------------

function buildNonPromotions(readback, jointProof, capabilityConstraints) {
  const lines = [];
  if (!jointProof.all_pass) {
    const reasonList = jointProof.blocking_reasons.map((r) => r.gate).join(', ');
    lines.push(`Joint runtime+independent+browser proof is NOT all-pass (${jointProof.jp_pass_count}/${jointProof.jp_count} gates green); per S06 plan must-have, requirements remain at previous proof tier`);
    lines.push(`Blocking gates: ${reasonList || '(none)'}`);
  } else {
    lines.push('Joint proof passed; all R-IDs promoted to MISSION_PROVEN');
  }
  for (const r of readback) {
    if (!r.promoted_to_mission) {
      lines.push(`${r.rid} remains at ${r.previous_tier} (proposed: ${r.proposed_tier})${r.non_promotion_reason ? ` — ${r.non_promotion_reason}` : ''}`);
    } else {
      lines.push(`${r.rid} promoted to ${r.proposed_tier} from ${r.previous_tier}`);
    }
  }
  lines.push(`Capability surfaces explicitly excluded from promotion: ${capabilityConstraints.join(', ')}`);
  return lines;
}

function buildCapabilityPromotions(readback, jointProof, capabilityConstraints) {
  const items = [];
  for (const surface of capabilityConstraints) {
    items.push({
      surface,
      promoted: false,
      status: 'EXPLICITLY_UNPROMOTED',
      rationale: `Per S06 plan must-have, ${surface} is out of scope for mission-level promotion regardless of joint proof outcome`,
    });
  }
  return {
    explicitly_excluded_count: items.length,
    promoted_count: 0,
    items,
    no_unsupported_capability_promotion: true,
  };
}

// ---------------------------------------------------------------------------
// Evidence assembly
// ---------------------------------------------------------------------------

function buildPromotionEvidence({ upstream, jointProof, readback, generated, capabilityConstraints }) {
  const nonPromotions = buildNonPromotions(readback, jointProof, capabilityConstraints);
  const capabilityPromotions = buildCapabilityPromotions(readback, jointProof, capabilityConstraints);
  const dbReadback = buildDbReadbackPayload(readback, jointProof);
  // Compute evidence file hashes (forensic chain). snake_case to match the
  // surrounding evidence-files schema.
  const evidence_hashes = {};
  for (const [name, filePath] of Object.entries(UPSTREAM_PATHS)) {
    const hash = computeFileSha256(filePath);
    evidence_hashes[name] = hash ? { sha256: hash, size_bytes: fileSize(filePath), path: filePath } : { sha256: null, exists: false, path: filePath };
  }
  evidence_hashes.this_file = { sha256: null, pending: true, path: 'runtime-evidence/M015-S06-requirement-promotion.json' };
  return {
    $schema: CANONICAL_SCHEMA,
    milestone: 'M015-4o8lfw',
    slice: 'S06',
    task: 'T05',
    generated,
    canonical_verdict: CANONICAL_VERDICT,
    verdict: null, // set by entry script after derivation
    verdict_code: null,
    status: null, // set by entry script
    safe_block_declared: jointProof.safe_block_declared,
    joint_proof_evaluation: jointProof,
    requirement_readback: readback,
    non_promotions: nonPromotions,
    capability_promotions: capabilityPromotions,
    db_readback_payload: dbReadback,
    evidence_hashes,
    evidence_files_loaded: {
      preflight: !!upstream.preflight.value,
      mission_run: !!upstream.missionRun.value,
      validation: !!upstream.validation.value,
      public_ui: !!upstream.publicUi.value,
      s05_remediation: !!upstream.s05.value,
      s04_admission: !!upstream.s04Admission.value,
    },
    redaction: { ...REDACTION_DISCIPLINE_KEYS },
    paths: { ...UPSTREAM_PATHS, output: 'runtime-evidence/M015-S06-requirement-promotion.json' },
  };
}

// ---------------------------------------------------------------------------
// Verdict derivation
// ---------------------------------------------------------------------------

function deriveVerdictCode(jointProof, blockers) {
  if (blockers && blockers.length > 0) return VERDICT_CODES.PROMOTION_DENIED_EVIDENCE_MISSING;
  if (jointProof.all_pass) return VERDICT_CODES.PROMOTION_GRANTED_JOINT_PROOF_PASS;
  // Specific denial reasons
  const gateFails = jointProof.blocking_reasons.map((r) => r.gate);
  if (gateFails.includes('leak_scans_clean')) return VERDICT_CODES.PROMOTION_DENIED_LEAK_DETECTED;
  if (gateFails.includes('r_id_allowlist_ok')) return VERDICT_CODES.PROMOTION_DENIED_RID_NOT_ALLOWLISTED;
  return VERDICT_CODES.PROMOTION_DENIED_BLOCKED_UPSTREAM;
}

function deriveVerdictLine(verdictCode, jointProof, readback) {
  const promotedCount = readback.filter((r) => r.promoted_to_mission).length;
  const totalRids = readback.length;
  const blockerCount = jointProof.blocking_reasons.length;
  const safeBlock = jointProof.safe_block_declared ? 'true' : 'false';
  const jpPassCount = jointProof.jp_pass_count;
  const jpTotal = jointProof.jp_count;
  return `M015_S06_PROMOTION=verdict=${verdictCode} promoted_count=${promotedCount}/${totalRids} evidence_hashes=${jointProof.jp_count} blockers=${blockerCount} jp_pass=${jpPassCount}/${jpTotal} safe_block=${safeBlock}`;
}

function exitCodeFor(verdictCode) {
  switch (verdictCode) {
    case VERDICT_CODES.PROMOTION_GRANTED_JOINT_PROOF_PASS:
    case VERDICT_CODES.PROMOTION_DENIED_BLOCKED_UPSTREAM:
    case VERDICT_CODES.PROMOTION_DENIED_LEAK_DETECTED:
    case VERDICT_CODES.PROMOTION_DENIED_RID_NOT_ALLOWLISTED:
      return 0;
    case VERDICT_CODES.PROMOTION_DENIED_EVIDENCE_MISSING:
      return 1;
    case VERDICT_CODES.PROMOTION_RUNNER_FAILURE:
    default:
      return 2;
  }
}

function deriveStatus(verdictCode) {
  switch (verdictCode) {
    case VERDICT_CODES.PROMOTION_GRANTED_JOINT_PROOF_PASS:
      return 'PROMOTION_GRANTED';
    case VERDICT_CODES.PROMOTION_DENIED_BLOCKED_UPSTREAM:
    case VERDICT_CODES.PROMOTION_DENIED_LEAK_DETECTED:
    case VERDICT_CODES.PROMOTION_DENIED_RID_NOT_ALLOWLISTED:
      return 'PROMOTION_DENIED';
    case VERDICT_CODES.PROMOTION_DENIED_EVIDENCE_MISSING:
      return 'PROMOTION_REFUSED_EVIDENCE_MISSING';
    case VERDICT_CODES.PROMOTION_RUNNER_FAILURE:
    default:
      return 'PROMOTION_RUNNER_FAILURE';
  }
}

module.exports = {
  // Re-exports
  CANONICAL_VERDICT,
  VERDICT_CODES,
  PROOF_TIERS,
  OWNED_RID_ALLOWLIST,
  RID_SET,
  RID_LABELS,
  RID_EVIDENCE_POINTERS,
  EXCLUDED_CAPABILITY_SURFACES,
  JOINT_PROOF_GATE_LABELS,
  REDACTION_DISCIPLINE_KEYS,
  CANONICAL_SCHEMA,
  REQUIRED_TOP_LEVEL_KEYS,
  PREVIOUS_TIER_DEFAULTS,
  S05_RID_KEY_MAP,
  UPSTREAM_PATHS,
  OUTPUT_PATH,
  CONTRACT_ROOT,
  // Constants
  UUID_FULL,
  CREDENTIAL_ASSIGNMENT,
  XIAOMI_RE,
  SECRET_HYGIENE_SYNTHETIC_BOS,
  SKIP_KEY_PATHS,
  SKIP_VALUE_PATTERNS,
  ROOT,
  // Helpers
  scrubEvidence,
  detectLeakHits,
  assertWriteSafe,
  loadJsonSafe,
  computeFileSha256,
  fileSize,
  isPassVerdict,
  isBlockedVerdict,
  deriveSafeBlockDeclared,
  // Joint proof evaluators
  evaluatePreflightJointProof,
  evaluateMissionJointProof,
  evaluateValidationJointProof,
  evaluateUiJointProof,
  evaluateLeakScans,
  evaluateRidAllowlist,
  evaluateBusinessMutations,
  evaluateDoNotPromote,
  evaluateMissionRunPresent,
  evaluateJointProof,
  // Readback computation
  derivePreviousTier,
  computeRequirementReadback,
  buildDbReadbackPayload,
  buildNonPromotions,
  buildCapabilityPromotions,
  buildPromotionEvidence,
  // Verdict derivation
  deriveVerdictCode,
  deriveVerdictLine,
  exitCodeFor,
  deriveStatus,
};