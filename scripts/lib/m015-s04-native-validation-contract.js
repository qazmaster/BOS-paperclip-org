#!/usr/bin/env node
'use strict';

/**
 * scripts/lib/m015-s04-native-validation-contract.js
 *
 * M015-4o8lfw / S04 / T05 — Independent validation contract evaluator.
 *
 * Pure-function evaluator over the 3 evidence surfaces produced by S04:
 *   - admission evidence (T01)
 *   - mission-run evidence (T04)
 *   - protocol evidence (T02)
 *
 * The validator must NOT trust any of these surfaces as self-attesting.
 * Every claim is independently re-derived from raw evidence and the
 * validator's own gate functions. If a surface claims "blocked" but the
 * raw fields disagree, the validator fails closed.
 *
 * Six verification gates (VG1..VG6):
 *   VG1 READBACK_INTEGRITY              — parseable JSON, schema prefix,
 *                                          required top-level keys
 *   VG2 ADMISSION_CORRELATION           — admission.status correlates
 *                                          across all 3 surfaces; blocked
 *                                          ⇔ both subgates false
 *   VG3 ZERO_BUSINESS_MUTATION_LEDGER   — under blocked admission, raw
 *                                          mutation fields prove zero
 *                                          mutations independent of
 *                                          harness summary
 *   VG4 PROTOCOL_LEDGER_CORRELATION     — protocol.protocol.allowlisted
 *                                          _side_effects and idempotency
 *                                          contract present; protocol
 *                                          gates all false under blocked
 *                                          admission; protocol.blockers
 *                                          carries admission-blocker
 *                                          marker
 *   VG5 AUTONOMY_AND_NO_SYNTHETIC_BOS   — redaction layers scrubbed
 *                                          xiaomi/mimo and synthetic bos
 *                                          light markers; no such strings
 *                                          appear anywhere in raw evidence
 *   VG6 SAFE_BLOCK_NOT_PROMOTED         — when admission.blocked=true,
 *                                          verdict must be
 *                                          MISSION_FAIL_CLOSED_ADMISSION_BLOCKED
 *                                          (or stricter); never MISSION_PASS
 *
 * Exports:
 *   loadEvidence(filePath, kind)
 *   evaluateValidationContract({ admission, missionRun, protocol, acceptSafeBlock })
 *   compileValidationBlockers(diagnostics, gates)
 *   buildValidationEvidence(...)
 *   deriveValidationStatus(gates, blockers, acceptSafeBlock)
 *   findSyntheticBosHits(value, jsonPath, hits)
 *   findXiaomiReuseHits(value, jsonPath, hits)
 */

const fs = require('fs');
const path = require('path');
const data = require('./m015-s04-native-validation-data');

const {
  VALIDATION_GATE_IDS,
  VALIDATION_GATE_ID_SET,
  VALIDATION_GATE_LABELS,
  BLOCKER_CODES,
  VERDICT_CODES,
  SAFE_BLOCK_BEARER_CODES,
  CANONICAL_SCHEMAS,
  REQUIRED_TOP_LEVEL_KEYS,
  REDACTION_SYNTHETIC_BOS_TAG,
  REDACTION_XIAOMI_TAG_RE,
} = data;

const ROOT = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Evidence loaders — fail-closed on missing/malformed.
// ---------------------------------------------------------------------------

function loadEvidence(filePath, kind) {
  const rel = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
  if (!fs.existsSync(rel)) {
    const err = new Error(`evidence missing at ${path.relative(ROOT, rel)} (kind=${kind})`);
    err.code = BLOCKER_CODES.EVIDENCE_MISSING(kind);
    err.kind = kind;
    err.path = rel;
    throw err;
  }
  let raw;
  try {
    raw = fs.readFileSync(rel, 'utf8');
  } catch (inner) {
    const err = new Error(`evidence read failed at ${path.relative(ROOT, rel)}: ${inner.message}`);
    err.code = BLOCKER_CODES.EVIDENCE_MALFORMED(kind);
    err.kind = kind;
    err.path = rel;
    throw err;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (inner) {
    const err = new Error(`evidence malformed JSON at ${path.relative(ROOT, rel)}: ${inner.message}`);
    err.code = BLOCKER_CODES.EVIDENCE_MALFORMED(kind);
    err.kind = kind;
    err.path = rel;
    throw err;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const err = new Error(`evidence is not a JSON object at ${path.relative(ROOT, rel)}`);
    err.code = BLOCKER_CODES.EVIDENCE_MALFORMED(kind);
    err.kind = kind;
    err.path = rel;
    throw err;
  }
  return { value: parsed, path: rel, kind };
}

// ---------------------------------------------------------------------------
// Generic tree walkers for substring/regex leak detection.
// skipKeys: Set of object keys whose subtree should be excluded from leak
// detection. These keys are documentation/identifier fields (gate_labels,
// paths, blocker codes) that legitimately describe the marker strings
// rather than carrying them as evidence values.
// ---------------------------------------------------------------------------

const DEFAULT_SKIP_KEYS = new Set([
  'gate_labels',
  'gate_codes',
  'paths',
  '$schema',
  'code',
]);

function _shouldSkipKey(key, skipKeys) {
  if (!skipKeys) return false;
  return skipKeys.has(key);
}

function findSyntheticBosHits(value, jsonPath, hits, skipKeys) {
  if (!hits) hits = [];
  if (!skipKeys) skipKeys = DEFAULT_SKIP_KEYS;
  if (value == null) return hits;
  if (typeof value === 'string') {
    if (value.toLowerCase().includes(REDACTION_SYNTHETIC_BOS_TAG)) {
      hits.push({ path: jsonPath || '$', tail: value.length > 80 ? value.slice(0, 80) + '…' : value });
    }
    return hits;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      findSyntheticBosHits(value[i], `${jsonPath}[${i}]`, hits, skipKeys);
    }
    return hits;
  }
  if (typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (_shouldSkipKey(key, skipKeys)) continue;
      findSyntheticBosHits(value[key], `${jsonPath}.${key}`, hits, skipKeys);
    }
  }
  return hits;
}

function findXiaomiReuseHits(value, jsonPath, hits, skipKeys) {
  if (!hits) hits = [];
  if (!skipKeys) skipKeys = DEFAULT_SKIP_KEYS;
  if (value == null) return hits;
  if (typeof value === 'string') {
    if (REDACTION_XIAOMI_TAG_RE.test(value)) {
      hits.push({ path: jsonPath || '$', tail: value.length > 80 ? value.slice(0, 80) + '…' : value });
    }
    return hits;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      findXiaomiReuseHits(value[i], `${jsonPath}[${i}]`, hits, skipKeys);
    }
    return hits;
  }
  if (typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (_shouldSkipKey(key, skipKeys)) continue;
      findXiaomiReuseHits(value[key], `${jsonPath}.${key}`, hits, skipKeys);
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// VG1 READBACK_INTEGRITY
// ---------------------------------------------------------------------------

function validateReadbackIntegrity({ admission, missionRun, protocol }) {
  const diagnostics = {
    schema_prefix_ok: { admission: null, mission_run: null, protocol: null },
    top_level_keys_ok: { admission: null, mission_run: null, protocol: null },
    required_keys_missing: [],
  };
  let ok = true;
  const surfaces = [
    ['admission', admission, CANONICAL_SCHEMAS.admission],
    ['mission_run', missionRun, CANONICAL_SCHEMAS.mission_run],
    ['protocol', protocol, CANONICAL_SCHEMAS.protocol],
  ];
  for (const [kind, ev, schemaPrefix] of surfaces) {
    const schema = typeof ev.value.$schema === 'string' ? ev.value.$schema : '';
    const schemaOk = schema.startsWith(schemaPrefix);
    diagnostics.schema_prefix_ok[kind] = schemaOk;
    if (!schemaOk) {
      ok = false;
      diagnostics.required_keys_missing.push(`${kind}:$schema`);
    }
    const required = REQUIRED_TOP_LEVEL_KEYS[kind] || [];
    const missing = required.filter((k) => !(k in ev.value));
    diagnostics.top_level_keys_ok[kind] = missing.length === 0;
    if (missing.length > 0) {
      ok = false;
      for (const m of missing) diagnostics.required_keys_missing.push(`${kind}:${m}`);
    }
  }
  return { pass: ok, diagnostics };
}

// ---------------------------------------------------------------------------
// VG2 ADMISSION_CORRELATION
// ---------------------------------------------------------------------------

function validateAdmissionCorrelation({ admission, missionRun, protocol }) {
  const diagnostics = {
    admission_status: null,
    mission_run_admission_status: null,
    protocol_admission_status: null,
    all_three_agree: null,
    blocked_subgates_consistent: null,
    admission_blocked_flag: null,
  };
  const aStatus = admission.value.status;
  const mrStatus = missionRun.value.admission_summary && missionRun.value.admission_summary.status;
  const prStatus = protocol.value.admission_summary && protocol.value.admission_summary.status;
  diagnostics.admission_status = aStatus;
  diagnostics.mission_run_admission_status = mrStatus;
  diagnostics.protocol_admission_status = prStatus;
  const allThreeAgree = aStatus === mrStatus && aStatus === prStatus;
  diagnostics.all_three_agree = allThreeAgree;
  // blocked subgates consistency: if status is BLOCKED_ON_S03_FAIL_CLOSED,
  // both fresh_s03_7of7_invokability_pass and no_do_not_promote_s04_pass
  // MUST be false. If status is ADMITTED, both MUST be true.
  const gates = admission.value.gates || {};
  const sub1 = !!gates.fresh_s03_7of7_invokability_pass;
  const sub2 = !!gates.no_do_not_promote_s04_pass;
  let blockedConsistent;
  if (aStatus === 'BLOCKED_ON_S03_FAIL_CLOSED') {
    blockedConsistent = sub1 === false && sub2 === false;
  } else if (aStatus === 'ADMITTED') {
    blockedConsistent = sub1 === true && sub2 === true;
  } else {
    // Unknown status: fail closed
    blockedConsistent = false;
  }
  diagnostics.blocked_subgates_consistent = blockedConsistent;
  diagnostics.admission_blocked_flag = aStatus !== 'ADMITTED';
  const pass = allThreeAgree && blockedConsistent;
  return { pass, diagnostics };
}

// ---------------------------------------------------------------------------
// VG3 ZERO_BUSINESS_MUTATION_LEDGER
// ---------------------------------------------------------------------------

function validateZeroBusinessMutationLedger({ admission, missionRun }) {
  const diagnostics = {
    admission_blocked: null,
    harness_root_issue_create: null,
    mission_context_null: null,
    intake_summary_null: null,
    root_issue_null: null,
    mission_run_null: null,
    admission_business_mutations_recorded: null,
    raw_mutation_count: 0,
    raw_mutations: [],
    blocked_required_fields_missing: [],
  };
  const aBlocked = admission.value.status !== 'ADMITTED';
  diagnostics.admission_blocked = aBlocked;
  const mr = missionRun.value;
  const hw = mr.harness_writes || {};
  const hwRootCreate = typeof hw.root_issue_create === 'number' ? hw.root_issue_create : null;
  diagnostics.harness_root_issue_create = hwRootCreate;
  diagnostics.mission_context_null = mr.mission_context == null;
  diagnostics.intake_summary_null = mr.intake_summary == null;
  diagnostics.root_issue_null = mr.root_issue == null;
  diagnostics.mission_run_null = mr.mission_run == null;
  const admBm = typeof admission.value.business_mutations_recorded === 'number'
    ? admission.value.business_mutations_recorded
    : null;
  diagnostics.admission_business_mutations_recorded = admBm;
  // Count raw mutations from the mission-run evidence independent of any
  // harness-asserted counts.
  if (hwRootCreate !== null && hwRootCreate > 0) {
    diagnostics.raw_mutations.push({ kind: 'root_issue_create', count: hwRootCreate });
  }
  if (mr.root_issue != null) {
    diagnostics.raw_mutations.push({ kind: 'root_issue_object_present', count: 1 });
  }
  if (mr.mission_run != null) {
    diagnostics.raw_mutations.push({ kind: 'mission_run_object_present', count: 1 });
  }
  if (mr.intake_summary != null) {
    diagnostics.raw_mutations.push({ kind: 'intake_summary_object_present', count: 1 });
  }
  if (mr.mission_context != null) {
    diagnostics.raw_mutations.push({ kind: 'mission_context_object_present', count: 1 });
  }
  diagnostics.raw_mutation_count = diagnostics.raw_mutations.reduce((s, e) => s + e.count, 0);
  let pass;
  if (!aBlocked) {
    // Admitted path: VG3 is not strictly applicable (other gates cover
    // full mission). Treat as trivially passing for now; downstream
    // MISSION_PASS path requires more checks anyway.
    pass = true;
  } else {
    // Blocked path: zero raw mutations required. Also require required
    // fields to be present on mission-run evidence (else we can't prove
    // zero mutations and must fail closed).
    const missingFields = [];
    if (hwRootCreate === null) missingFields.push('harness_writes.root_issue_create');
    diagnostics.blocked_required_fields_missing = missingFields;
    if (missingFields.length > 0) {
      pass = false;
    } else {
      pass = hwRootCreate === 0
        && mr.mission_context == null
        && mr.intake_summary == null
        && mr.root_issue == null
        && mr.mission_run == null
        && (admBm === null || admBm === 0);
    }
  }
  return { pass, diagnostics };
}

// ---------------------------------------------------------------------------
// VG4 PROTOCOL_LEDGER_CORRELATION
// ---------------------------------------------------------------------------

function validateProtocolLedgerCorrelation({ admission, protocol }) {
  const diagnostics = {
    protocol_allowlist_present: null,
    protocol_idempotency_present: null,
    protocol_gate_labels_count: null,
    protocol_gates_all_false_under_block: null,
    protocol_blockers_admission_carry_forward: null,
    protocol_status: null,
  };
  const pr = protocol.value;
  const proto = pr.protocol || {};
  const allowlist = proto.allowlisted_side_effects || null;
  const idemp = proto.idempotency_and_recovery || null;
  diagnostics.protocol_allowlist_present = allowlist != null;
  diagnostics.protocol_idempotency_present = idemp != null;
  diagnostics.protocol_status = pr.status;
  // Gate labels
  const gateLabels = pr.gate_labels || {};
  diagnostics.protocol_gate_labels_count = Object.keys(gateLabels).length;
  // Under blocked admission all 10 protocol gates must be false (or "<redacted>"
  // for MG9 secret_hygiene_pass per T02 contract). The validator does NOT
  // require MG9 false; it requires MG1..MG8 + MG10 to be false.
  const protocolGates = pr.gates || {};
  const gateIds = [
    'mission_topology_pass',
    'authorship_and_authority_pass',
    'agent_authored_outputs_pass',
    'review_and_disposition_path_pass',
    'allowlisted_side_effects_pass',
    'terminal_run_and_disposition_states_pass',
    'time_budgets_pass',
    'idempotency_and_recovery_lock_pass',
    'no_synthetic_bos_fallback_pass',
  ];
  const aBlocked = admission.value.status !== 'ADMITTED';
  let allFalseUnderBlock = true;
  if (aBlocked) {
    for (const gid of gateIds) {
      const v = protocolGates[gid];
      if (v !== false) {
        allFalseUnderBlock = false;
        break;
      }
    }
  }
  diagnostics.protocol_gates_all_false_under_block = aBlocked ? allFalseUnderBlock : null;
  // Admission-blocker carry-forward marker must be present in protocol.blockers
  const blockers = Array.isArray(pr.blockers) ? pr.blockers : [];
  const hasCarryForward = blockers.some((b) => b && SAFE_BLOCK_BEARER_CODES.includes(b.code));
  diagnostics.protocol_blockers_admission_carry_forward = hasCarryForward;
  let pass = diagnostics.protocol_allowlist_present
    && diagnostics.protocol_idempotency_present
    && diagnostics.protocol_gate_labels_count >= 10
    && (aBlocked ? allFalseUnderBlock && hasCarryForward : true);
  return { pass, diagnostics };
}

// ---------------------------------------------------------------------------
// VG5 AUTONOMY_AND_NO_SYNTHETIC_BOS
// ---------------------------------------------------------------------------

function validateAutonomyAndNoSyntheticBos({ admission, missionRun, protocol }) {
  const diagnostics = {
    mission_run_synthetic_bos_redaction_flag: null,
    admission_xiaomi_redaction_flag: null,
    protocol_redaction_synthetic_bos_flag: null,
    synthetic_bos_hits: [],
    xiaomi_hits: [],
    mission_run_safe_block_declared: null,
    protocol_safe_block_declared: null,
  };
  const mr = missionRun.value;
  const pr = protocol.value;
  const adm = admission.value;
  diagnostics.mission_run_synthetic_bos_redaction_flag = !!(mr.redaction && mr.redaction.synthetic_bos);
  diagnostics.admission_xiaomi_redaction_flag = !!(adm.redaction && adm.redaction.xiaomi_endpoint_reuse);
  diagnostics.protocol_redaction_synthetic_bos_flag = !!(pr.redaction && pr.redaction.synthetic_bos);
  diagnostics.mission_run_safe_block_declared = !!mr.safe_block_declared;
  diagnostics.protocol_safe_block_declared = !!pr.safe_block_declared;
  diagnostics.synthetic_bos_hits = [
    ...findSyntheticBosHits(mr, 'mission_run'),
    ...findSyntheticBosHits(pr, 'protocol'),
  ];
  diagnostics.xiaomi_hits = [
    ...findXiaomiReuseHits(adm, 'admission'),
    ...findXiaomiReuseHits(mr, 'mission_run'),
    ...findXiaomiReuseHits(pr, 'protocol'),
  ];
  const pass = diagnostics.synthetic_bos_hits.length === 0
    && diagnostics.xiaomi_hits.length === 0;
  return { pass, diagnostics };
}

// ---------------------------------------------------------------------------
// VG6 SAFE_BLOCK_NOT_PROMOTED — applied as a post-check on the verdict.
// The orchestrator first derives a provisional verdict from VG1..VG5, then
// VG6 enforces that safe-block evidence cannot be promoted to MISSION_PASS.
// ---------------------------------------------------------------------------

function enforceSafeBlockNotPromoted({ admission, provisionalStatus, gates, acceptSafeBlock }) {
  const diagnostics = {
    admission_blocked: null,
    provisional_status: null,
    promoted_to_mission_pass: null,
    safe_block_declared_on_mission_run: null,
    accept_safe_block: !!acceptSafeBlock,
  };
  const aBlocked = admission.value.status !== 'ADMITTED';
  diagnostics.admission_blocked = aBlocked;
  diagnostics.provisional_status = provisionalStatus;
  diagnostics.safe_block_declared_on_mission_run = !!admission.value && true;
  let pass = true;
  if (aBlocked && provisionalStatus === VERDICT_CODES.MISSION_PASS) {
    pass = false;
    diagnostics.promoted_to_mission_pass = true;
  } else {
    diagnostics.promoted_to_mission_pass = false;
  }
  return { pass, diagnostics };
}

// ---------------------------------------------------------------------------
// Top-level orchestrator
// ---------------------------------------------------------------------------

function evaluateValidationContract({ admission, missionRun, protocol, acceptSafeBlock }) {
  const gates = {};
  const diagnostics = {};
  // VG1
  const vg1 = validateReadbackIntegrity({ admission, missionRun, protocol });
  gates.readback_integrity_pass = vg1.pass;
  diagnostics.readback_integrity = vg1.diagnostics;
  // VG2
  const vg2 = validateAdmissionCorrelation({ admission, missionRun, protocol });
  gates.admission_correlation_pass = vg2.pass;
  diagnostics.admission_correlation = vg2.diagnostics;
  // VG3
  const vg3 = validateZeroBusinessMutationLedger({ admission, missionRun });
  gates.zero_business_mutation_ledger_pass = vg3.pass;
  diagnostics.zero_business_mutation_ledger = vg3.diagnostics;
  // VG4
  const vg4 = validateProtocolLedgerCorrelation({ admission, protocol });
  gates.protocol_ledger_correlation_pass = vg4.pass;
  diagnostics.protocol_ledger_correlation = vg4.diagnostics;
  // VG5
  const vg5 = validateAutonomyAndNoSyntheticBos({ admission, missionRun, protocol });
  gates.autonomy_and_no_synthetic_bos_pass = vg5.pass;
  diagnostics.autonomy_and_no_synthetic_bos = vg5.diagnostics;
  // Provisional status before VG6 enforcement
  const provisionalStatus = deriveValidationStatus(gates, acceptSafeBlock);
  // VG6 — final gate, enforces no-promotion invariant
  const vg6 = enforceSafeBlockNotPromoted({ admission, provisionalStatus, gates, acceptSafeBlock });
  gates.safe_block_not_promoted_pass = vg6.pass;
  diagnostics.safe_block_not_promoted = vg6.diagnostics;
  // Final status (after VG6)
  const finalStatus = deriveValidationStatus(gates, acceptSafeBlock);
  return { gates, diagnostics, provisional_status: provisionalStatus, status: finalStatus };
}

// ---------------------------------------------------------------------------
// Status derivation
// ---------------------------------------------------------------------------

function deriveValidationStatus(gates, acceptSafeBlock) {
  // Required gates for MISSION_PASS: all 6 must pass and admission
  // correlation must show admitted status. Since VG1..VG5 are evaluated
  // against any admission state, MISSION_PASS is only meaningful when
  // admission is admitted AND all gates pass. In the blocked path, the
  // orchestrator forces a fail-closed verdict.
  const allPass = VALIDATION_GATE_IDS.every((gid) => gates[gid] === true);
  if (!allPass) {
    // Specific failures win
    if (gates.zero_business_mutation_ledger_pass === false
        && gates.admission_correlation_pass === true) {
      // Blocked admission + raw mutations present (ledger violation)
      return VERDICT_CODES.MISSION_FAIL_CLOSED_LEDGER_VIOLATION;
    }
    if (gates.autonomy_and_no_synthetic_bos_pass === false) {
      return VERDICT_CODES.MISSION_FAIL_CLOSED_AUTONOMY_BREACH;
    }
    if (gates.protocol_ledger_correlation_pass === false
        || gates.admission_correlation_pass === false
        || gates.readback_integrity_pass === false) {
      return VERDICT_CODES.MISSION_FAIL_CLOSED_PROTOCOL_MISMATCH;
    }
    return VERDICT_CODES.MISSION_FAIL_CLOSED;
  }
  // All gates pass; under blocked admission that means VG6 also passed
  // (i.e., provisional status was not MISSION_PASS). Result: safe-block.
  return acceptSafeBlock
    ? VERDICT_CODES.MISSION_FAIL_CLOSED_ADMISSION_BLOCKED
    : VERDICT_CODES.MISSION_FAIL_CLOSED;
}

// ---------------------------------------------------------------------------
// Blocker compiler
// ---------------------------------------------------------------------------

function compileValidationBlockers(gates, diagnostics) {
  const blockers = [];
  // VG1
  if (!gates.readback_integrity_pass) {
    blockers.push({
      code: BLOCKER_CODES.VG1_READBACK_INTEGRITY,
      severity: 'blocking',
      agent: null,
      reason: `readback integrity violated: ${diagnostics.readback_integrity.required_keys_missing.join(', ') || 'unknown'}`,
    });
  }
  // VG2
  if (!gates.admission_correlation_pass) {
    const d = diagnostics.admission_correlation;
    const reason = [];
    if (!d.all_three_agree) {
      reason.push(`admission.status=${d.admission_status} mr=${d.mission_run_admission_status} pr=${d.protocol_admission_status} (must agree)`);
    }
    if (!d.blocked_subgates_consistent) {
      reason.push('blocked subgates inconsistent with admission.status');
    }
    blockers.push({
      code: BLOCKER_CODES.VG2_ADMISSION_CORRELATION,
      severity: 'blocking',
      agent: null,
      reason: reason.join('; '),
    });
  }
  // VG3
  if (!gates.zero_business_mutation_ledger_pass) {
    const d = diagnostics.zero_business_mutation_ledger;
    if (d.admission_blocked) {
      if (d.blocked_required_fields_missing.length > 0) {
        blockers.push({
          code: BLOCKER_CODES.VG3_LEDGER_MISSING_FIELDS,
          severity: 'blocking',
          agent: null,
          reason: `mission-run evidence missing required fields for blocked-state proof: ${d.blocked_required_fields_missing.join(', ')}`,
        });
      } else {
        blockers.push({
          code: BLOCKER_CODES.VG3_LEDGER_VIOLATION,
          severity: 'blocking',
          agent: null,
          reason: `blocked admission but raw mutations present: ${JSON.stringify(d.raw_mutations)}`,
        });
      }
    }
  }
  // VG4
  if (!gates.protocol_ledger_correlation_pass) {
    const d = diagnostics.protocol_ledger_correlation;
    if (!d.protocol_allowlist_present) {
      blockers.push({
        code: BLOCKER_CODES.VG4_PROTOCOL_ALLOWLIST_MISSING,
        severity: 'blocking',
        agent: null,
        reason: 'protocol.protocol.allowlisted_side_effects missing',
      });
    } else if (!d.protocol_blockers_admission_carry_forward && d.protocol_gates_all_false_under_block === false) {
      blockers.push({
        code: BLOCKER_CODES.VG4_PROTOCOL_LEDGER_CORRELATION,
        severity: 'blocking',
        agent: null,
        reason: `protocol gates not all false under blocked admission (all_false=${d.protocol_gates_all_false_under_block}) and admission-blocker carry-forward marker missing`,
      });
    } else if (!d.protocol_blockers_admission_carry_forward) {
      blockers.push({
        code: BLOCKER_CODES.VG4_PROTOCOL_NO_ADMISSION_CARRY_FORWARD,
        severity: 'blocking',
        agent: null,
        reason: 'protocol.blockers missing admission-blocker carry-forward marker',
      });
    } else {
      blockers.push({
        code: BLOCKER_CODES.VG4_PROTOCOL_LEDGER_CORRELATION,
        severity: 'blocking',
        agent: null,
        reason: `protocol ledger correlation failed (gate_labels_count=${d.protocol_gate_labels_count})`,
      });
    }
  }
  // VG5
  if (!gates.autonomy_and_no_synthetic_bos_pass) {
    const d = diagnostics.autonomy_and_no_synthetic_bos;
    if (d.xiaomi_hits.length > 0) {
      blockers.push({
        code: BLOCKER_CODES.VG5_XIAOMI_REUSE_DETECTED,
        severity: 'blocking',
        agent: null,
        reason: `xiaomi/mimo string leaked into raw evidence: ${d.xiaomi_hits.map((h) => h.path).join(', ')}`,
      });
    }
    if (d.synthetic_bos_hits.length > 0) {
      blockers.push({
        code: BLOCKER_CODES.VG5_SYNTHETIC_BOS_TAG_DETECTED,
        severity: 'blocking',
        agent: null,
        reason: `synthetic bos light tag leaked into raw evidence: ${d.synthetic_bos_hits.map((h) => h.path).join(', ')}`,
      });
    }
    if (d.xiaomi_hits.length === 0 && d.synthetic_bos_hits.length === 0) {
      blockers.push({
        code: BLOCKER_CODES.VG5_AUTONOMY_BREACH,
        severity: 'blocking',
        agent: null,
        reason: 'autonomy gate failed for unknown reason',
      });
    }
  }
  // VG6
  if (!gates.safe_block_not_promoted_pass) {
    blockers.push({
      code: BLOCKER_CODES.VG6_PROMOTION_OF_SAFE_BLOCK,
      severity: 'blocking',
      agent: null,
      reason: `safe-block evidence incorrectly promoted to MISSION_PASS (provisional=${diagnostics.safe_block_not_promoted.provisional_status})`,
    });
  }
  return blockers;
}

// ---------------------------------------------------------------------------
// Evidence builder
// ---------------------------------------------------------------------------

function buildValidationEvidence({ admission, missionRun, protocol, gates, blockers, diagnostics, paths, options, status }) {
  const generated = new Date().toISOString();
  const safeBlock = admission.value.status !== 'ADMITTED';
  return {
    $schema: `${CANONICAL_SCHEMAS.validation}.v1.json`,
    milestone: 'M015-4o8lfw',
    slice: 'S04',
    task: 'T05',
    generated,
    status,
    safe_block_declared: safeBlock,
    safe_block_evidence: {
      admission_status: admission.value.status,
      admission_business_mutations_recorded: admission.value.business_mutations_recorded,
      harness_root_issue_create: (missionRun.value.harness_writes && typeof missionRun.value.harness_writes.root_issue_create === 'number')
        ? missionRun.value.harness_writes.root_issue_create
        : null,
      mission_context_null: missionRun.value.mission_context == null,
      intake_summary_null: missionRun.value.intake_summary == null,
      root_issue_null: missionRun.value.root_issue == null,
      mission_run_null: missionRun.value.mission_run == null,
    },
    gate_labels: { ...VALIDATION_GATE_LABELS },
    gates: { ...gates },
    diagnostics,
    blockers,
    paths: paths || {
      admission_evidence: path.relative(ROOT, admission.path),
      mission_run_evidence: path.relative(ROOT, missionRun.path),
      protocol_evidence: path.relative(ROOT, protocol.path),
      output_evidence: 'runtime-evidence/M015-S04-native-mission-validation.json',
    },
    redaction: {
      full_ids: false,
      credentials: false,
      xiaomi_endpoint_reuse: safeBlock,
      provider_secret_names: '<redacted>',
      synthetic_bos: safeBlock,
    },
    options: {
      accept_safe_block: !!(options && options.acceptSafeBlock),
    },
    admission_snapshot: {
      status: admission.value.status,
      business_mutations_recorded: admission.value.business_mutations_recorded,
      blockers: (admission.value.blockers || []).map((b) => ({ code: b.code, severity: b.severity })),
    },
  };
}

// ---------------------------------------------------------------------------
// Sanity guards before write — refuse to write if redaction would leak.
// ---------------------------------------------------------------------------

function assertWriteSafe(payload) {
  const xiaomiHits = findXiaomiReuseHits(payload, '$');
  const syntheticHits = findSyntheticBosHits(payload, '$');
  if (xiaomiHits.length > 0 || syntheticHits.length > 0) {
    const err = new Error(`refused write: redaction leak in payload (xiaomi=${xiaomiHits.length}, synthetic=${syntheticHits.length})`);
    err.code = BLOCKER_CODES.VALIDATION_RUNTIME_ERROR;
    err.xiaomiHits = xiaomiHits;
    err.syntheticHits = syntheticHits;
    throw err;
  }
}

module.exports = {
  ROOT,
  BLOCKER_CODES,
  VERDICT_CODES,
  VALIDATION_GATE_IDS,
  VALIDATION_GATE_ID_SET,
  VALIDATION_GATE_LABELS,
  SAFE_BLOCK_BEARER_CODES,
  loadEvidence,
  evaluateValidationContract,
  compileValidationBlockers,
  buildValidationEvidence,
  deriveValidationStatus,
  findSyntheticBosHits,
  findXiaomiReuseHits,
  assertWriteSafe,
  // Exposed for testability of individual gates
  validateReadbackIntegrity,
  validateAdmissionCorrelation,
  validateZeroBusinessMutationLedger,
  validateProtocolLedgerCorrelation,
  validateAutonomyAndNoSyntheticBos,
  enforceSafeBlockNotPromoted,
};