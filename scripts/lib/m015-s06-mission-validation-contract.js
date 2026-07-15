#!/usr/bin/env node
'use strict';

/**
 * scripts/lib/m015-s06-mission-validation-contract.js
 *
 * M015-4o8lfw / S06 / T03 — Independent mission contract + readback
 * validation evaluator.
 *
 * Pure-function evaluator over the S06 evidence surfaces produced by
 * T01..T02:
 *   - preflight evidence     (T01)
 *   - admission evidence     (T01, S04 admission carried forward via
 *                              s04_admission_correlation block)
 *   - mission-run evidence   (T02)
 *   - po-intake evidence     (T02 bounded intake payload)
 *
 * Protocol evaluation reuses the S04 protocol contract evaluator
 * (./m015-s04-native-mission-contract.js) under a "blocked path" since
 * the S06 preflight in the current disk state is BLOCKED. The validator
 * does NOT trust the S06 T02 self-attesting summary; every claim is
 * independently re-derived from raw evidence.
 *
 * Eight verification gates (VG1..VG8):
 *   VG1 READBACK_INTEGRITY
 *   VG2 PREFLIGHT_CORRELATION
 *   VG3 ZERO_BUSINESS_MUTATION_LEDGER
 *   VG4 PROTOCOL_LEDGER_CORRELATION
 *   VG5 AUTONOMY_AND_NO_SYNTHETIC_BOS
 *   VG6 SAFE_BLOCK_NOT_PROMOTED
 *   VG7 ORCHESTRATOR_PROVENANCE
 *   VG8 R026_BOUNDARY_CLASSIFICATION
 *
 * Exports:
 *   loadEvidence(filePath, kind)
 *   evaluateValidationContract({ preflight, admission, missionRun, poIntake, acceptSafeBlock })
 *   compileValidationBlockers(gates, diagnostics)
 *   buildValidationEvidence(...)
 *   buildProtocolEvidence(...)
 *   buildVerificationEvidence(...)
 *   deriveValidationStatus(gates, acceptSafeBlock)
 *   findSyntheticBosHits(value, jsonPath, hits)
 *   findXiaomiReuseHits(value, jsonPath, hits)
 *   assertWriteSafe(payload)
 */

const fs = require('fs');
const path = require('path');
const data = require('./m015-s06-mission-validation-data');

const {
  VALIDATION_GATE_IDS,
  VALIDATION_GATE_ID_SET,
  VALIDATION_GATE_LABELS,
  BLOCKER_CODES,
  VERDICT_CODES,
  SAFE_BLOCK_BEARER_CODES,
  ORCHESTRATOR_PATTERN,
  ORCHESTRATOR_ATTRIBUTION_FILTER,
  EXPECTED_AGENT_COUNT,
  EXPECTED_RUN_COUNT,
  CANONICAL_SCHEMAS,
  REQUIRED_TOP_LEVEL_KEYS,
  REDACTION_SYNTHETIC_BOS_TAG,
  REDACTION_XIAOMI_TAG_RE,
  R026_BOUNDARY_KINDS,
} = data;

const ROOT = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Evidence loaders — fail-closed on missing/malformed.
// ---------------------------------------------------------------------------

function loadEvidence(filePath, kind) {
  const rel = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
  if (!fs.existsSync(rel)) {
    const err = new Error(`evidence missing at ${path.isAbsolute(filePath) ? rel : path.relative(ROOT, rel)} (kind=${kind})`);
    err.code = BLOCKER_CODES.EVIDENCE_MISSING(kind);
    err.kind = kind;
    err.path = rel;
    throw err;
  }
  let raw;
  try {
    raw = fs.readFileSync(rel, 'utf8');
  } catch (inner) {
    const err = new Error(`evidence read failed at ${path.isAbsolute(filePath) ? rel : path.relative(ROOT, rel)}: ${inner.message}`);
    err.code = BLOCKER_CODES.EVIDENCE_MALFORMED(kind);
    err.kind = kind;
    err.path = rel;
    throw err;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (inner) {
    const err = new Error(`evidence malformed JSON at ${path.isAbsolute(filePath) ? rel : path.relative(ROOT, rel)}: ${inner.message}`);
    err.code = BLOCKER_CODES.EVIDENCE_MALFORMED(kind);
    err.kind = kind;
    err.path = rel;
    throw err;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const err = new Error(`evidence is not a JSON object at ${path.isAbsolute(filePath) ? rel : path.relative(ROOT, rel)}`);
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
// paths, blocker codes, canonical schemas) that legitimately describe the
// marker strings rather than carrying them as evidence values.
// ---------------------------------------------------------------------------

const DEFAULT_SKIP_KEYS = new Set([
  'gate_labels',
  'gate_codes',
  'paths',
  '$schema',
  'code',
  // Diagnostic hit arrays legitimately contain the captured marker
  // strings (e.g., the offending xiaomi/mimo/synthetic-bos-light value)
  // as `tail` to prove the leak was caught. They MUST be skipped on
  // the write-safety walk so the writing of evidence does not re-trigger
  // the leak detector (chicken-and-egg: the evidence of capturing a leak
  // must itself be writable).
  'xiaomi_hits',
  'synthetic_bos_hits',
  // Blocker `reason` text is a human-readable summary field that
  // legitimately describes the captured marker (e.g.
  // "xiaomi/mimo string leaked into raw evidence"). It MUST be skipped
  // on the write-safety walk so the written evidence does not
  // re-trigger the leak detector. This matches the S04 verifier
  // convention: documentation/summary fields describing markers are
  // not raw evidence values.
  'reason',
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

function validateReadbackIntegrity({ preflight, admission, missionRun, poIntake }) {
  const diagnostics = {
    schema_prefix_ok: { preflight: null, admission: null, mission_run: null, po_intake: null },
    top_level_keys_ok: { preflight: null, admission: null, mission_run: null, po_intake: null },
    required_keys_missing: [],
  };
  let ok = true;
  const surfaces = [
    ['preflight', preflight, CANONICAL_SCHEMAS.preflight, REQUIRED_TOP_LEVEL_KEYS.preflight],
    ['admission', admission, CANONICAL_SCHEMAS.admission, REQUIRED_TOP_LEVEL_KEYS.admission],
    ['mission_run', missionRun, CANONICAL_SCHEMAS.mission_run, REQUIRED_TOP_LEVEL_KEYS.mission_run],
    ['po_intake', poIntake, CANONICAL_SCHEMAS.po_intake, REQUIRED_TOP_LEVEL_KEYS.po_intake],
  ];
  for (const [kind, ev, schemaPrefix, required] of surfaces) {
    if (!ev) {
      // Optional surface; absence is recorded but does not block VG1 (other
      // gates handle each surface specifically).
      continue;
    }
    const schema = typeof ev.value.$schema === 'string' ? ev.value.$schema : '';
    const schemaOk = schema.startsWith(schemaPrefix);
    diagnostics.schema_prefix_ok[kind] = schemaOk;
    if (!schemaOk) {
      ok = false;
      diagnostics.required_keys_missing.push(`${kind}:$schema`);
    }
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
// VG2 PREFLIGHT_CORRELATION
// ---------------------------------------------------------------------------

function validatePreflightCorrelation({ preflight, missionRun }) {
  const diagnostics = {
    preflight_verdict: null,
    preflight_blocked: null,
    mission_run_admission_status: null,
    mission_run_blocked: null,
    do_not_promote_s04_consistent: null,
    business_mutations_propagated: null,
    all_consistent: null,
  };
  const pf = preflight.value;
  const pfVerdict = typeof pf.verdict === 'string' ? pf.verdict : (pf.status || null);
  diagnostics.preflight_verdict = pfVerdict;
  const pfBlocked = pfVerdict !== 'ADMITTED' && pfVerdict !== 'PASS' && pfVerdict !== 'GREEN';
  diagnostics.preflight_blocked = pfBlocked;
  const mr = missionRun.value;
  const adm = mr.admission_summary || {};
  const mrStatus = adm.status || (mr.status || null);
  diagnostics.mission_run_admission_status = mrStatus;
  const mrBlocked = (mrStatus && typeof mrStatus === 'string')
    ? !(mrStatus === 'PASS' || mrStatus === 'ADMITTED')
    : true;
  diagnostics.mission_run_blocked = mrBlocked;
  // do_not_promote_s04 must propagate: if preflight is not blocked, the
  // do_not_promote_s04 must be false; under blocked preflight, the flag
  // may be false (closed dependency) — only check absence of contradiction.
  const pfDoNotPromote = !!pf.do_not_promote_s04;
  const pfDnpConsistent = !pfDoNotPromote;
  diagnostics.do_not_promote_s04_consistent = pfDnpConsistent;
  // business_mutations_recorded must propagate: under blocked preflight,
  // the preflight records business_mutations_recorded=0; the mission-run
  // admission_summary.business_mutations_recorded must also be 0.
  const pfBm = typeof pf.business_mutations_recorded === 'number' ? pf.business_mutations_recorded : null;
  const mrBm = typeof adm.business_mutations_recorded === 'number' ? adm.business_mutations_recorded : null;
  const bmPropagated = pfBm === mrBm;
  diagnostics.business_mutations_propagated = bmPropagated;
  const blockedConsistent = pfBlocked === mrBlocked;
  diagnostics.all_consistent = blockedConsistent && pfDnpConsistent && bmPropagated;
  return { pass: diagnostics.all_consistent, diagnostics };
}

// ---------------------------------------------------------------------------
// VG3 ZERO_BUSINESS_MUTATION_LEDGER
// ---------------------------------------------------------------------------

function validateZeroBusinessMutationLedger({ preflight, missionRun, poIntake }) {
  const diagnostics = {
    preflight_blocked: null,
    harness_root_issue_create: null,
    mission_context_null: null,
    intake_summary_null: null,
    root_issue_null: null,
    mission_run_null: null,
    preflight_business_mutations_recorded: null,
    mission_run_business_mutations_recorded: null,
    po_intake_deterministic_only: null,
    raw_mutation_count: 0,
    raw_mutations: [],
    blocked_required_fields_missing: [],
  };
  const pf = preflight.value;
  const pfVerdict = typeof pf.verdict === 'string' ? pf.verdict : (pf.status || null);
  const pfBlocked = pfVerdict !== 'ADMITTED' && pfVerdict !== 'PASS' && pfVerdict !== 'GREEN';
  diagnostics.preflight_blocked = pfBlocked;
  const mr = missionRun.value;
  const hw = mr.harness_writes || {};
  const hwRootCreate = typeof hw.root_issue_create === 'number' ? hw.root_issue_create : null;
  diagnostics.harness_root_issue_create = hwRootCreate;
  diagnostics.mission_context_null = mr.mission_context == null;
  diagnostics.intake_summary_null = mr.intake_summary == null;
  diagnostics.root_issue_null = mr.root_issue == null;
  diagnostics.mission_run_null = mr.mission_run == null;
  const pfBm = typeof pf.business_mutations_recorded === 'number' ? pf.business_mutations_recorded : null;
  diagnostics.preflight_business_mutations_recorded = pfBm;
  const adm = mr.admission_summary || {};
  const mrBm = typeof adm.business_mutations_recorded === 'number' ? adm.business_mutations_recorded : null;
  diagnostics.mission_run_business_mutations_recorded = mrBm;
  // PO intake is a deterministic bounded payload. It MUST NOT reference
  // any mutable state, only declared fields (mission_key, idempotency_key,
  // recovery_lock). It is allowed to exist alongside a blocked preflight
  // because it was not yet executed.
  if (poIntake) {
    const pi = poIntake.value;
    const keys = Object.keys(pi).filter((k) => k !== '$schema' && k !== 'milestone' && k !== 'slice' && k !== 'task' && k !== 'generated');
    const allowedKeys = REQUIRED_TOP_LEVEL_KEYS.po_intake.filter((k) => k !== '$schema' && k !== 'milestone' && k !== 'slice' && k !== 'task' && k !== 'generated');
    const extraKeys = keys.filter((k) => !allowedKeys.includes(k));
    diagnostics.po_intake_deterministic_only = extraKeys.length === 0;
    if (extraKeys.length > 0) diagnostics.po_intake_extra_keys = extraKeys;
  } else {
    diagnostics.po_intake_deterministic_only = null;
  }
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
  if (!pfBlocked) {
    pass = true;
  } else {
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
        && (pfBm === null || pfBm === 0)
        && (mrBm === null || mrBm === 0);
    }
  }
  return { pass, diagnostics };
}

// ---------------------------------------------------------------------------
// VG4 PROTOCOL_LEDGER_CORRELATION
// Protocol-block correlation: protocol structure must be present, and
// under blocked preflight all 10 protocol gates must be false (or
// "<redacted>" for MG9 secret_hygiene_pass) and protocol.blockers must
// carry at least one safe-block bearer.
// ---------------------------------------------------------------------------

function validateProtocolLedgerCorrelation({ protocol }) {
  const diagnostics = {
    protocol_allowlist_present: null,
    protocol_idempotency_present: null,
    protocol_gate_labels_count: null,
    protocol_gates_all_false_under_block: null,
    protocol_blockers_bearer_present: null,
    protocol_status: null,
    bearer_codes_observed: [],
  };
  if (!protocol) {
    return {
      pass: false,
      diagnostics: Object.assign(diagnostics, { missing_protocol: true }),
    };
  }
  const pr = protocol.value;
  const proto = pr.protocol || {};
  const allowlist = proto.allowlisted_side_effects || null;
  const idemp = proto.idempotency_and_recovery || null;
  diagnostics.protocol_allowlist_present = allowlist != null;
  diagnostics.protocol_idempotency_present = idemp != null;
  diagnostics.protocol_status = pr.status;
  const gateLabels = pr.gate_labels || {};
  diagnostics.protocol_gate_labels_count = Object.keys(gateLabels).length;
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
  // The blocked-path protocol gates are all false. The validator does
  // NOT require MG9 secret_hygiene to be false (it may be "<redacted>").
  let allFalseUnderBlock = true;
  for (const gid of gateIds) {
    const v = protocolGates[gid];
    if (v !== false) {
      allFalseUnderBlock = false;
      break;
    }
  }
  diagnostics.protocol_gates_all_false_under_block = allFalseUnderBlock;
  // At least one safe-block bearer must appear in protocol.blockers.
  const blockers = Array.isArray(pr.blockers) ? pr.blockers : [];
  const observedBearers = blockers
    .map((b) => (b && b.code ? b.code : null))
    .filter((code) => code && SAFE_BLOCK_BEARER_CODES.includes(code));
  diagnostics.bearer_codes_observed = observedBearers;
  diagnostics.protocol_blockers_bearer_present = observedBearers.length > 0;
  const pass = diagnostics.protocol_allowlist_present
    && diagnostics.protocol_idempotency_present
    && diagnostics.protocol_gate_labels_count >= 10
    && allFalseUnderBlock
    && diagnostics.protocol_blockers_bearer_present;
  return { pass, diagnostics };
}

// ---------------------------------------------------------------------------
// VG5 AUTONOMY_AND_NO_SYNTHETIC_BOS
// ---------------------------------------------------------------------------

function validateAutonomyAndNoSyntheticBos({ preflight, admission, missionRun, poIntake }) {
  const diagnostics = {
    preflight_safe_block_declared: null,
    mission_run_safe_block_declared: null,
    synthetic_bos_hits: [],
    xiaomi_hits: [],
  };
  const mr = missionRun.value;
  const adm = admission && admission.value ? admission.value : null;
  const pf = preflight.value;
  diagnostics.mission_run_safe_block_declared = !!mr.safe_block_declared;
  diagnostics.preflight_safe_block_declared = pf.verdict && pf.verdict !== 'ADMITTED' && pf.verdict !== 'PASS' && pf.verdict !== 'GREEN';
  diagnostics.synthetic_bos_hits = [
    ...findSyntheticBosHits(pf, 'preflight'),
    ...findSyntheticBosHits(mr, 'mission_run'),
    ...(poIntake ? findSyntheticBosHits(poIntake.value, 'po_intake') : []),
  ];
  diagnostics.xiaomi_hits = [
    ...findXiaomiReuseHits(pf, 'preflight'),
    ...findXiaomiReuseHits(mr, 'mission_run'),
    ...(adm ? findXiaomiReuseHits(adm, 'admission') : []),
    ...(poIntake ? findXiaomiReuseHits(poIntake.value, 'po_intake') : []),
  ];
  const pass = diagnostics.synthetic_bos_hits.length === 0
    && diagnostics.xiaomi_hits.length === 0;
  return { pass, diagnostics };
}

// ---------------------------------------------------------------------------
// VG7 ORCHESTRATOR_PROVENANCE
// Independent re-derivation of S05 T02 Option-A orchestrator evidence:
//   - canonical aggregate MUST be present and accessible
//   - canonical_aggregate_status MUST be PASS
//   - observed_pass_count MUST equal expected_agent_count (7/7)
//   - option_a_pattern MUST be "per-agent-isolated-sequential-subprocess"
//   - attribution filter MUST be "M015_OUR_AGENT_IDS"
// ---------------------------------------------------------------------------

function validateOrchestratorProvenance({ missionRun }) {
  const diagnostics = {
    orchestrator_present: null,
    canonical_aggregate_status: null,
    canonical_aggregate_pass_count: null,
    expected_agent_count: null,
    observed_pass_count: null,
    seven_of_seven_invokability_pass: null,
    option_a_pattern: null,
    option_a_pattern_ok: null,
    attribution_filter_present: null,
    attribution_filter_ok: null,
    our_agent_ids_filter_match: null,
    per_agent_dir_present: null,
    aggregate_path: null,
    diagnostics_detail: [],
  };
  const mr = missionRun.value;
  const provenance = mr.s06_provenance || mr.orchestrator || null;
  if (!provenance) {
    diagnostics.diagnostics_detail.push('mission_run.s06_provenance missing');
    return { pass: false, diagnostics };
  }
  const orch = provenance.orchestrator || provenance;
  diagnostics.orchestrator_present = true;
  diagnostics.canonical_aggregate_status = orch.canonical_aggregate_status || null;
  diagnostics.canonical_aggregate_pass_count = orch.canonical_aggregate_pass_count || null;
  diagnostics.expected_agent_count = orch.expected_agent_count || null;
  diagnostics.observed_pass_count = orch.observed_pass_count || null;
  diagnostics.aggregate_path = orch.canonical_aggregate_path || null;
  diagnostics.seven_of_seven_invokability_pass = !!orch.seven_of_seven_invokability_pass;
  diagnostics.option_a_pattern = orch.option_a_pattern || null;
  diagnostics.option_a_pattern_ok = orch.option_a_pattern === ORCHESTRATOR_PATTERN;
  diagnostics.attribution_filter_present = !!orch.our_agent_ids_attribution_filter;
  diagnostics.attribution_filter_ok = !!orch.our_agent_ids_attribution_filter
    && orch.wake_count_delta_filter === 'our-runId-presence-not-raw-list-length-diff';
  diagnostics.per_agent_dir_present = !!orch.per_agent_dir;
  diagnostics.our_agent_ids_filter_match = diagnostics.attribution_filter_ok && diagnostics.option_a_pattern_ok;
  const pass = diagnostics.orchestrator_present
    && diagnostics.canonical_aggregate_status === 'PASS'
    && diagnostics.canonical_aggregate_pass_count === EXPECTED_AGENT_COUNT
    && diagnostics.observed_pass_count === EXPECTED_AGENT_COUNT
    && diagnostics.expected_agent_count === EXPECTED_AGENT_COUNT
    && diagnostics.seven_of_seven_invokability_pass
    && diagnostics.option_a_pattern_ok
    && diagnostics.attribution_filter_ok
    && diagnostics.per_agent_dir_present;
  return { pass, diagnostics };
}

// ---------------------------------------------------------------------------
// VG8 R026_BOUNDARY_CLASSIFICATION
// Re-derives that S06 audit-trail records (AIP-27/AIP-28) are NOT mixed
// with business mutations:
//   - kind === audit_trail_record OR one of R026_BOUNDARY_KINDS
//   - classification === R026-boundary-diagnostic
//   - business_mutation === false
//   - attribution_filter === M015_OUR_AGENT_IDS
// ---------------------------------------------------------------------------

function validateR026BoundaryClassification({ missionRun }) {
  const diagnostics = {
    audit_trail_records_present: null,
    audit_trail_record_count: null,
    r026_classifications: [],
    misclassifications: [],
    business_mutation_mix: null,
    audit_trail_records: [],
  };
  const mr = missionRun.value;
  const records = ((mr.s06_provenance || {}).audit_trail_records) || null;
  if (!records || typeof records !== 'object') {
    diagnostics.diagnostics_detail = ['mission_run.s06_provenance.audit_trail_records missing'];
    return { pass: false, diagnostics };
  }
  const keys = Object.keys(records);
  diagnostics.audit_trail_records_present = true;
  diagnostics.audit_trail_record_count = keys.length;
  let businessMix = false;
  for (const key of keys) {
    const record = records[key];
    const recordDiag = { key };
    const kind = record.kind || null;
    recordDiag.kind = kind;
    recordDiag.classification = record.classification || null;
    recordDiag.business_mutation = record.business_mutation == null ? null : !!record.business_mutation;
    recordDiag.attribution_filter = record.attribution_filter || null;
    recordDiag.created_by_agent = record.created_by_agent || null;
    // Expected invariant: R026-boundary diagnostic, NOT a business mutation
    const isBoundaryKind = R026_BOUNDARY_KINDS.includes(kind);
    const isBoundaryClassification = record.classification === 'R026-boundary-diagnostic'
      || record.classification === 'r026-boundary-diagnostic';
    const isNotBusinessMutation = record.business_mutation === false;
    const hasAttributionFilter = record.attribution_filter === ORCHESTRATOR_ATTRIBUTION_FILTER;
    if (!isBoundaryKind || !isBoundaryClassification || !isNotBusinessMutation || !hasAttributionFilter) {
      diagnostics.misclassifications.push({ key, kind, record });
      recordDiag.valid = false;
    } else {
      recordDiag.valid = true;
    }
    if (record.business_mutation === true) businessMix = true;
    diagnostics.r026_classifications.push(recordDiag);
    diagnostics.audit_trail_records.push({ key, record });
  }
  diagnostics.business_mutation_mix = businessMix;
  // Pass iff audit-trail records exist AND none are misclassified AND
  // none mix into business mutations.
  const pass = diagnostics.audit_trail_records_present
    && diagnostics.audit_trail_record_count > 0
    && diagnostics.misclassifications.length === 0
    && !businessMix;
  return { pass, diagnostics };
}

// ---------------------------------------------------------------------------
// VG6 SAFE_BLOCK_NOT_PROMOTED — applied as a post-check on the verdict.
// The orchestrator first derives a provisional verdict from VG1..VG5 and
// VG7/VG8, then VG6 enforces that safe-block evidence cannot be promoted
// to MISSION_PASS.
// ---------------------------------------------------------------------------

function enforceSafeBlockNotPromoted({ preflight, provisionalStatus, gates, acceptSafeBlock }) {
  const diagnostics = {
    preflight_blocked: null,
    preflight_verdict: null,
    provisional_status: null,
    promoted_to_mission_pass: null,
    safe_block_declared: null,
    accept_safe_block: !!acceptSafeBlock,
  };
  const pf = preflight.value;
  const pfVerdict = typeof pf.verdict === 'string' ? pf.verdict : (pf.status || null);
  const pfBlocked = pfVerdict !== 'ADMITTED' && pfVerdict !== 'PASS' && pfVerdict !== 'GREEN';
  diagnostics.preflight_verdict = pfVerdict;
  diagnostics.preflight_blocked = pfBlocked;
  diagnostics.provisional_status = provisionalStatus;
  let pass = true;
  if (pfBlocked && provisionalStatus === VERDICT_CODES.MISSION_PASS) {
    pass = false;
    diagnostics.promoted_to_mission_pass = true;
  } else {
    diagnostics.promoted_to_mission_pass = false;
  }
  diagnostics.safe_block_declared = pfBlocked;
  return { pass, diagnostics };
}

// ---------------------------------------------------------------------------
// Top-level orchestrator
// ---------------------------------------------------------------------------

function evaluateValidationContract({ preflight, admission, missionRun, poIntake, protocol, acceptSafeBlock }) {
  const gates = {};
  const diagnostics = {};
  const vg1 = validateReadbackIntegrity({ preflight, admission, missionRun, poIntake });
  gates.readback_integrity_pass = vg1.pass;
  diagnostics.readback_integrity = vg1.diagnostics;
  const vg2 = validatePreflightCorrelation({ preflight, missionRun });
  gates.preflight_correlation_pass = vg2.pass;
  diagnostics.preflight_correlation = vg2.diagnostics;
  const vg3 = validateZeroBusinessMutationLedger({ preflight, missionRun, poIntake });
  gates.zero_business_mutation_ledger_pass = vg3.pass;
  diagnostics.zero_business_mutation_ledger = vg3.diagnostics;
  const vg4 = validateProtocolLedgerCorrelation({ protocol });
  gates.protocol_ledger_correlation_pass = vg4.pass;
  diagnostics.protocol_ledger_correlation = vg4.diagnostics;
  const vg5 = validateAutonomyAndNoSyntheticBos({ preflight, admission, missionRun, poIntake });
  gates.autonomy_and_no_synthetic_bos_pass = vg5.pass;
  diagnostics.autonomy_and_no_synthetic_bos = vg5.diagnostics;
  const vg7 = validateOrchestratorProvenance({ missionRun });
  gates.orchestrator_provenance_pass = vg7.pass;
  diagnostics.orchestrator_provenance = vg7.diagnostics;
  const vg8 = validateR026BoundaryClassification({ missionRun });
  gates.r026_boundary_classification_pass = vg8.pass;
  diagnostics.r026_boundary_classification = vg8.diagnostics;
  // Provisional status before VG6 enforcement.
  const provisionalStatus = deriveValidationStatus(gates, acceptSafeBlock);
  const vg6 = enforceSafeBlockNotPromoted({ preflight, provisionalStatus, gates, acceptSafeBlock });
  gates.safe_block_not_promoted_pass = vg6.pass;
  diagnostics.safe_block_not_promoted = vg6.diagnostics;
  // Final status (after VG6).
  const finalStatus = deriveValidationStatus(gates, acceptSafeBlock);
  return {
    gates,
    diagnostics,
    provisional_status: provisionalStatus,
    status: finalStatus,
  };
}

// ---------------------------------------------------------------------------
// Status derivation
// ---------------------------------------------------------------------------

function deriveValidationStatus(gates, acceptSafeBlock) {
  const allPass = VALIDATION_GATE_IDS.every((gid) => gates[gid] === true);
  if (!allPass) {
    // Blocked admission path: VG3 + VG2 correlation gates are the
    // canonical indicators.
    if (gates.zero_business_mutation_ledger_pass === false
        && gates.preflight_correlation_pass === true) {
      return VERDICT_CODES.MISSION_FAIL_CLOSED_LEDGER_VIOLATION;
    }
    if (gates.orchestrator_provenance_pass === false) {
      return VERDICT_CODES.MISSION_FAIL_CLOSED_ORCHESTRATOR_INVALID;
    }
    if (gates.r026_boundary_classification_pass === false) {
      return VERDICT_CODES.MISSION_FAIL_CLOSED_R026_MISCLASSIFICATION;
    }
    if (gates.autonomy_and_no_synthetic_bos_pass === false) {
      return VERDICT_CODES.MISSION_FAIL_CLOSED_AUTONOMY_BREACH;
    }
    if (gates.protocol_ledger_correlation_pass === false
        || gates.preflight_correlation_pass === false
        || gates.readback_integrity_pass === false) {
      return VERDICT_CODES.MISSION_FAIL_CLOSED_PROTOCOL_MISMATCH;
    }
    return VERDICT_CODES.MISSION_FAIL_CLOSED;
  }
  // All gates pass; under blocked preflight (admission blocked), that
  // means VG6 also passed (provisional was not MISSION_PASS). Result:
  // safe-block.
  return acceptSafeBlock
    ? VERDICT_CODES.MISSION_FAIL_CLOSED_PREFLIGHT_BLOCKED
    : VERDICT_CODES.MISSION_FAIL_CLOSED;
}

// ---------------------------------------------------------------------------
// Blocker compiler
// ---------------------------------------------------------------------------

function compileValidationBlockers(gates, diagnostics) {
  const blockers = [];
  if (!gates.readback_integrity_pass) {
    blockers.push({
      code: BLOCKER_CODES.VG1_READBACK_INTEGRITY,
      severity: 'blocking',
      agent: null,
      reason: `readback integrity violated: ${diagnostics.readback_integrity.required_keys_missing.join(', ') || 'unknown'}`,
    });
  }
  if (!gates.preflight_correlation_pass) {
    const d = diagnostics.preflight_correlation;
    const reason = [];
    if (!d.all_consistent) {
      reason.push(`preflight_verdict=${d.preflight_verdict} mission_run_admission_status=${d.mission_run_admission_status} do_not_promote_consistent=${d.do_not_promote_s04_consistent} bm_propagated=${d.business_mutations_propagated}`);
    }
    blockers.push({
      code: BLOCKER_CODES.VG2_PREFLIGHT_CORRELATION,
      severity: 'blocking',
      agent: null,
      reason: reason.join('; '),
    });
  }
  if (!gates.zero_business_mutation_ledger_pass) {
    const d = diagnostics.zero_business_mutation_ledger;
    if (d.preflight_blocked) {
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
          reason: `blocked preflight but raw mutations present: ${JSON.stringify(d.raw_mutations)}`,
        });
      }
    }
  }
  if (!gates.protocol_ledger_correlation_pass) {
    const d = diagnostics.protocol_ledger_correlation;
    if (d.missing_protocol) {
      blockers.push({
        code: BLOCKER_CODES.VG4_PROTOCOL_LEDGER_CORRELATION,
        severity: 'blocking',
        agent: null,
        reason: 'protocol evidence missing (required for S06 T03 readback correlation)',
      });
    } else if (!d.protocol_allowlist_present) {
      blockers.push({
        code: BLOCKER_CODES.VG4_PROTOCOL_ALLOWLIST_MISSING,
        severity: 'blocking',
        agent: null,
        reason: 'protocol.protocol.allowlisted_side_effects missing',
      });
    } else if (!d.protocol_blockers_bearer_present && d.protocol_gates_all_false_under_block === false) {
      blockers.push({
        code: BLOCKER_CODES.VG4_PROTOCOL_LEDGER_CORRELATION,
        severity: 'blocking',
        agent: null,
        reason: `protocol gates not all false (all_false=${d.protocol_gates_all_false_under_block}) and no safe-block bearer observed`,
      });
    } else if (!d.protocol_blockers_bearer_present) {
      blockers.push({
        code: BLOCKER_CODES.VG4_PROTOCOL_NO_PREFLIGHT_CARRY_FORWARD,
        severity: 'blocking',
        agent: null,
        reason: `protocol.blockers missing safe-block bearer (observed=${(d.bearer_codes_observed || []).join(',') || 'none'})`,
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
  if (!gates.autonomy_and_no_synthetic_bos_pass) {
    const d = diagnostics.autonomy_and_no_synthetic_bos;
    if (d.xiaomi_hits.length > 0) {
      blockers.push({
        code: BLOCKER_CODES.VG5_XIAOMI_REUSE_DETECTED,
        severity: 'blocking',
        agent: null,
        reason: `endpoint-reuse marker found in raw evidence: ${d.xiaomi_hits.map((h) => h.path).join(', ')}`,
      });
    }
    if (d.synthetic_bos_hits.length > 0) {
      blockers.push({
        code: BLOCKER_CODES.VG5_SYNTHETIC_BOS_TAG_DETECTED,
        severity: 'blocking',
        agent: null,
        reason: `synthetic-bos marker found in raw evidence: ${d.synthetic_bos_hits.map((h) => h.path).join(', ')}`,
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
  if (!gates.orchestrator_provenance_pass) {
    const d = diagnostics.orchestrator_provenance;
    const reasons = [];
    if (!d.orchestrator_present) reasons.push('orchestrator provenance missing');
    if (d.canonical_aggregate_status !== 'PASS') reasons.push(`canonical_aggregate_status=${d.canonical_aggregate_status}`);
    if (d.observed_pass_count !== EXPECTED_AGENT_COUNT) reasons.push(`observed_pass_count=${d.observed_pass_count} expected=${EXPECTED_AGENT_COUNT}`);
    if (!d.option_a_pattern_ok) reasons.push(`option_a_pattern=${d.option_a_pattern} expected=${ORCHESTRATOR_PATTERN}`);
    if (!d.attribution_filter_ok) reasons.push('M015_OUR_AGENT_IDS attribution filter missing or wake-count delta filter wrong');
    if (!d.per_agent_dir_present) reasons.push('per_agent_dir missing');
    blockers.push({
      code: BLOCKER_CODES.VG7_ORCHESTRATOR_INVALID,
      severity: 'blocking',
      agent: null,
      reason: `orchestrator provenance not 7/7 invokability proven via Option-A: ${reasons.join('; ')}`,
    });
  }
  if (!gates.r026_boundary_classification_pass) {
    const d = diagnostics.r026_boundary_classification;
    if (d.business_mutation_mix) {
      blockers.push({
        code: BLOCKER_CODES.VG8_R026_BUSINESS_MUTATION_MIX,
        severity: 'blocking',
        agent: null,
        reason: 'audit-trail record mixed into business mutations (R026 boundary violated)',
      });
    }
    if (d.misclassifications && d.misclassifications.length > 0) {
      blockers.push({
        code: BLOCKER_CODES.VG8_R026_RECORD_MISCLASSIFIED,
        severity: 'blocking',
        agent: null,
        reason: `${d.misclassifications.length} audit-trail record(s) misclassified: ${JSON.stringify(d.misclassifications.map((m) => m.key))}`,
      });
    }
    if (!d.audit_trail_records_present) {
      blockers.push({
        code: BLOCKER_CODES.VG8_R026_BOUNDARY_VIOLATION,
        severity: 'blocking',
        agent: null,
        reason: 'audit-trail records missing from s06_provenance.audit_trail_records',
      });
    }
  }
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
// Evidence builders
// ---------------------------------------------------------------------------

function buildProtocolEvidence({ preflight, missionRun, gates, blockers, paths, options, status }) {
  const generated = new Date().toISOString();
  const pf = preflight.value;
  const pfVerdict = typeof pf.verdict === 'string' ? pf.verdict : 'BLOCKED';
  const safeBlock = pfVerdict !== 'ADMITTED' && pfVerdict !== 'PASS' && pfVerdict !== 'GREEN';
  const adm = (missionRun && missionRun.value && missionRun.value.admission_summary) || {};
  return {
    $schema: `${CANONICAL_SCHEMAS.protocol}.v1.json`,
    milestone: 'M015-4o8lfw',
    slice: 'S06',
    task: 'T03',
    generated,
    status,
    safe_block_declared: safeBlock,
    preflight_correlation: {
      preflight_verdict: pfVerdict,
      preflight_path: path.relative(ROOT, preflight.path),
      canonical_verdict: pf.canonical_verdict || 'M015_S06_PREFLIGHT',
      blockers_count: (pf.blockers || []).length,
      do_not_promote_s04: !!pf.do_not_promote_s04,
      business_mutations_recorded: typeof pf.business_mutations_recorded === 'number'
        ? pf.business_mutations_recorded : null,
    },
    admission_summary: {
      status: adm.status || (missionRun && missionRun.value && missionRun.value.status) || 'UNKNOWN',
      admitted: adm.admitted == null ? null : !!adm.admitted,
      blocked: adm.blocked == null ? null : !!adm.blocked,
      business_mutations_recorded: typeof adm.business_mutations_recorded === 'number'
        ? adm.business_mutations_recorded : null,
      blocker_codes: adm.blocker_codes || [],
    },
    protocol: {
      topology_required_root_assignee: 'Div7.MissionControl',
      division_requirements: {
        'Div1.HCO': { comment_required: true, document_required: false, review_required: false, terminal_disposition_state: 'routed' },
        'Div2.MasterPlanner': { comment_required: true, document_required: true, review_required: false, terminal_disposition_state: 'planned' },
        'Div3.Treasury': { comment_required: true, document_required: false, review_required: false, terminal_disposition_state: 'budgeted' },
        'Div4.Production': { comment_required: true, document_required: true, review_required: false, terminal_disposition_state: 'built' },
        'Div5.QualificationsLibraryLearning': { comment_required: true, document_required: false, review_required: true, terminal_disposition_state: 'reviewed' },
        'Div6.External': { comment_required: true, document_required: false, review_required: false, terminal_disposition_state: 'external_brief_received' },
        'Div7.MissionControl': { comment_required: true, document_required: false, review_required: false, terminal_disposition_state: 'finalised' },
      },
      review_path: {
        required_reviewer: 'Div5.QualificationsLibraryLearning',
        review_target: 'Div4.Production',
        routing_disposition_owner: 'Div1.HCO',
        final_disposition_owner: 'Div7.MissionControl',
      },
      allowlisted_side_effects: {
        root_issue_max: 1,
        div7_to_div1_max: 1,
        div1_to_operating_max: 5,
        documents_max: 2,
        heartbeat_runs_expected: EXPECTED_RUN_COUNT,
        heartbeat_runs_max: EXPECTED_RUN_COUNT,
      },
      time_budgets: {
        per_run_timeout_sec: 600,
        mission_total_budget_sec: 3600,
      },
      idempotency_and_recovery: {
        mission_key_required: true,
        idempotency_key_required: true,
        recovery_lock_required: true,
        expected_runs_per_mission: EXPECTED_RUN_COUNT,
      },
    },
    gate_labels: { ...VALIDATION_GATE_LABELS.slice ? VALIDATION_GATE_LABELS : VALIDATION_GATE_LABELS },
    gates: { ...gates },
    blockers,
    redaction: {
      full_ids: false,
      credentials: false,
      xiaomi_endpoint_reuse: safeBlock,
      provider_secret_names: '<redacted>',
      synthetic_bos: safeBlock,
    },
    paths: paths || {
      preflight_evidence: path.relative(ROOT, preflight.path),
      mission_run_evidence: path.relative(ROOT, missionRun.path),
      output_evidence: 'runtime-evidence/M015-S06-native-mission-protocol.json',
    },
    options: { accept_safe_block: !!(options && options.acceptSafeBlock) },
  };
}

function buildVerificationEvidence({ preflight, admission, missionRun, poIntake, gates, blockers, diagnostics, paths, options, status }) {
  const generated = new Date().toISOString();
  const pf = preflight.value;
  const pfVerdict = typeof pf.verdict === 'string' ? pf.verdict : (pf.status || null);
  const safeBlock = pfVerdict !== 'ADMITTED' && pfVerdict !== 'PASS' && pfVerdict !== 'GREEN';
  return {
    $schema: `${CANONICAL_SCHEMAS.verification}.v1.json`,
    milestone: 'M015-4o8lfw',
    slice: 'S06',
    task: 'T03',
    generated,
    status,
    safe_block_declared: safeBlock,
    safe_block_evidence: {
      preflight_verdict: pfVerdict,
      preflight_business_mutations_recorded: pf.business_mutations_recorded,
      preflight_do_not_promote_s04: !!pf.do_not_promote_s04,
      harness_root_issue_create: ((missionRun.value.harness_writes || {}).root_issue_create),
      mission_context_null: missionRun.value.mission_context == null,
      intake_summary_null: missionRun.value.intake_summary == null,
      root_issue_null: missionRun.value.root_issue == null,
      mission_run_null: missionRun.value.mission_run == null,
      po_intake_deterministic_only: ((diagnostics.zero_business_mutation_ledger || {}).po_intake_deterministic_only !== false),
    },
    gate_labels: { ...VALIDATION_GATE_LABELS },
    gates: { ...gates },
    diagnostics,
    blockers,
    paths: paths || {
      preflight_evidence: path.relative(ROOT, preflight.path),
      admission_evidence: admission ? path.relative(ROOT, admission.path) : null,
      mission_run_evidence: path.relative(ROOT, missionRun.path),
      po_intake_evidence: poIntake ? path.relative(ROOT, poIntake.path) : null,
      output_evidence: 'runtime-evidence/M015-S06-native-mission-verification.json',
    },
    options: { accept_safe_block: !!(options && options.acceptSafeBlock) },
    redaction: {
      full_ids: false,
      credentials: false,
      xiaomi_endpoint_reuse: safeBlock,
      provider_secret_names: '<redacted>',
      synthetic_bos: safeBlock,
    },
  };
}

function buildValidationEvidence({ preflight, admission, missionRun, poIntake, gates, blockers, diagnostics, paths, options, status }) {
  const generated = new Date().toISOString();
  const pf = preflight.value;
  const pfVerdict = typeof pf.verdict === 'string' ? pf.verdict : (pf.status || null);
  const safeBlock = pfVerdict !== 'ADMITTED' && pfVerdict !== 'PASS' && pfVerdict !== 'GREEN';
  return {
    $schema: `${CANONICAL_SCHEMAS.validation}.v1.json`,
    milestone: 'M015-4o8lfw',
    slice: 'S06',
    task: 'T03',
    generated,
    status,
    safe_block_declared: safeBlock,
    safe_block_evidence: {
      preflight_verdict: pfVerdict,
      preflight_business_mutations_recorded: pf.business_mutations_recorded,
      preflight_do_not_promote_s04: !!pf.do_not_promote_s04,
      preflight_blockers_count: (pf.blockers || []).length,
      harness_root_issue_create: ((missionRun.value.harness_writes || {}).root_issue_create),
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
      preflight_evidence: path.relative(ROOT, preflight.path),
      admission_evidence: admission ? path.relative(ROOT, admission.path) : null,
      mission_run_evidence: path.relative(ROOT, missionRun.path),
      po_intake_evidence: poIntake ? path.relative(ROOT, poIntake.path) : null,
      output_evidence: 'runtime-evidence/M015-S06-native-mission-validation.json',
    },
    options: { accept_safe_block: !!(options && options.acceptSafeBlock) },
    redaction: {
      full_ids: false,
      credentials: false,
      xiaomi_endpoint_reuse: safeBlock,
      provider_secret_names: '<redacted>',
      synthetic_bos: safeBlock,
    },
    preflight_snapshot: {
      verdict: pfVerdict,
      business_mutations_recorded: pf.business_mutations_recorded,
      do_not_promote_s04: !!pf.do_not_promote_s04,
      blockers: (pf.blockers || []).map((b) => ({ code: b.code, severity: b.severity })),
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
  ORCHESTRATOR_PATTERN,
  ORCHESTRATOR_ATTRIBUTION_FILTER,
  EXPECTED_AGENT_COUNT,
  EXPECTED_RUN_COUNT,
  CANONICAL_SCHEMAS,
  R026_BOUNDARY_KINDS,
  loadEvidence,
  evaluateValidationContract,
  compileValidationBlockers,
  buildProtocolEvidence,
  buildVerificationEvidence,
  buildValidationEvidence,
  deriveValidationStatus,
  findSyntheticBosHits,
  findXiaomiReuseHits,
  assertWriteSafe,
  // Exposed for testability of individual gates
  validateReadbackIntegrity,
  validatePreflightCorrelation,
  validateZeroBusinessMutationLedger,
  validateProtocolLedgerCorrelation,
  validateAutonomyAndNoSyntheticBos,
  validateOrchestratorProvenance,
  validateR026BoundaryClassification,
  enforceSafeBlockNotPromoted,
};
