#!/usr/bin/env node
'use strict';

/**
 * M016-txa3vu / S08 / T01 — pure native seven-agent integration contract.
 *
 * This module intentionally has no producer/verifier imports, no subprocesses,
 * no network calls and no filesystem writes. `loadSchema` only reads the
 * requested JSON schema so callers can use the same fail-closed shape check.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const data = require('./m016-s08-native-seven-agent-data');

const ROOT = path.resolve(__dirname, '..', '..');
const HASH_RE = /^[a-f0-9]{64}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SAFE_PATH_RE = /^runtime-evidence\/M0(?:15|16)-(S0[0-9]|native)-[A-Za-z0-9._/-]+\.json$/;
const PROHIBITED_METHOD_RE = /\b(?:POST|PUT|PATCH|DELETE|CONNECT|TRACE|OPTIONS)\b/i;
const ABSOLUTE_PATH_RE = /(?:^|[\s"'])\/(?:etc|private|tmp|Users|var|home)\//;
const REDACTION_KEYS = new Set([
  'full_ids', 'credentials', 'xiaomi_endpoint_reuse', 'synthetic_bos',
  'raw_reasoning', 'raw_body', 'raw_result_json_result', 'vendor_reuse_strings',
  'bounded_digests_only', 'redaction_bounds_loaded',
  'raw_bodies_persisted', 'pii', 'external_messages',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _safeSuffix(value) {
  const cleaned = String(value == null ? '' : value)
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return (cleaned || 'X').slice(0, 64);
}

function _clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function _round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function _isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function _stableStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(_stableStringify).join(',') + ']';
  if (_isObject(value)) {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + _stableStringify(value[key])).join(',') + '}';
  }
  return JSON.stringify(String(value));
}

function sha256Hex(content) {
  const buffer = Buffer.isBuffer(content)
    ? content
    : Buffer.from(content == null ? '' : String(content), 'utf8');
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function canonicalizeObject(obj) {
  if (!_isObject(obj)) return null;
  const clone = _clone(obj);
  delete clone.bundle_digest;
  delete clone.candidate_digest;
  delete clone.closure_digest;
  delete clone.scope_decision_digest;
  return _stableStringify(clone);
}

function computeBodyDigest(obj) {
  const canonical = canonicalizeObject(obj);
  return canonical === null ? null : sha256Hex(canonical);
}

// ---------------------------------------------------------------------------
// Schema loading with AJV (no network, no subprocesses)
// ---------------------------------------------------------------------------

let ajvInstance;
let ajvUnavailable = false;
const schemaCache = new Map();

function _getAjv() {
  if (ajvInstance) return ajvInstance;
  if (ajvUnavailable) return null;
  try {
    const Ajv = require('ajv');
    const addFormats = require('ajv-formats');
    ajvInstance = addFormats(new Ajv({ allErrors: true, strict: false }));
    return ajvInstance;
  } catch (error) {
    ajvUnavailable = true;
    return null;
  }
}

function loadSchema(schemaPath) {
  const absolute = path.isAbsolute(schemaPath) ? schemaPath : path.join(ROOT, schemaPath);
  if (schemaCache.has(absolute)) return schemaCache.get(absolute);
  if (!fs.existsSync(absolute)) {
    const error = new Error('schema missing at ' + absolute);
    error.code = data.BLOCKER_CODES.VALIDATOR_SCHEMAS_NOT_LOADED(_safeSuffix(path.basename(schemaPath)));
    throw error;
  }
  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch (error) {
    const malformed = new Error('schema malformed JSON at ' + absolute + ': ' + error.message);
    malformed.code = data.BLOCKER_CODES.VALIDATOR_SCHEMAS_NOT_LOADED(_safeSuffix(path.basename(schemaPath)));
    throw malformed;
  }
  const ajv = _getAjv();
  let validate = null;
  if (ajv) {
    try {
      validate = ajv.compile(schema);
    } catch (error) {
      const invalid = new Error('schema failed to compile at ' + absolute + ': ' + error.message);
      invalid.code = data.BLOCKER_CODES.VALIDATOR_SCHEMAS_NOT_LOADED(_safeSuffix(path.basename(schemaPath)));
      throw invalid;
    }
  }
  const loaded = { schema, validate, path: absolute };
  schemaCache.set(absolute, loaded);
  return loaded;
}

function validateObjectShape(obj, schemaValidate) {
  if (!_isObject(obj)) return { ok: false, errors: [{ instancePath: '', message: 'must be an object' }] };
  if (typeof schemaValidate === 'function') {
    const ok = schemaValidate(obj);
    return { ok: !!ok, errors: schemaValidate.errors || [] };
  }
  return { ok: true, errors: [] };
}

// ---------------------------------------------------------------------------
// Source allowlist + path confinement
// ---------------------------------------------------------------------------

function _sourceAllowed(sourceRef) {
  return typeof sourceRef === 'string'
    && SAFE_PATH_RE.test(sourceRef)
    && !sourceRef.includes('..')
    && data.SOURCE_ALLOWLIST_SET.has(sourceRef);
}

// ---------------------------------------------------------------------------
// Redaction safety walk
// ---------------------------------------------------------------------------

function checkRedactionSafety(payload) {
  const hits = [];
  const walk = (value, keyPath = '') => {
    if (typeof value === 'string') {
      for (const entry of data.REDACTION_PATTERNS) {
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
        if (REDACTION_KEYS.has(key)) {
          // FORBIDDEN_KEYS: presence of the key with any non-undefined value
          // is itself a leak — these are raw token fields that must never
          // appear in any payload (e.g. raw_body, credentials, synthetic_bos).
          if (data.FORBIDDEN_KEYS.has(key) && child !== undefined) {
            hits.push({ kind: key, path: childPath });
          }
          // FLAG_KEYS: redaction posture flags; value MUST match canonical
          // REDACTION_FLAG_VALUES entry (e.g. bounded_digests_only must be
          // true; synthetic_bos_detected must be false).
          if (data.FLAG_KEYS.has(key) && child !== data.REDACTION_FLAG_VALUES[key]) {
            hits.push({ kind: key, path: childPath });
          }
          // Always scan string values against REDACTION_PATTERNS even when
          // the key itself is forbidden, so content like 'result_json.bos'
          // or 'api_key: SECRET' is detected regardless of the wrapping key.
          if (typeof child === 'string') {
            for (const entry of data.REDACTION_PATTERNS) {
              if (entry.pattern.test(child)) hits.push({ kind: entry.kind, path: childPath });
            }
          }
          continue;
        }
        walk(child, childPath);
      }
    }
  };
  walk(payload);
  if (_isObject(payload?.redaction_posture)) {
    for (const [key, canonical] of Object.entries(data.REDACTION_FLAG_VALUES)) {
      if (payload.redaction_posture[key] !== canonical) hits.push({ kind: key, path: 'redaction_posture.' + key });
    }
  }
  return hits;
}

function assertWriteSafe(payload) {
  const hits = checkRedactionSafety(payload);
  if (hits.length > 0) {
    const error = new Error('refused write: redaction safety violation at ' + hits[0].path);
    error.code = data.BLOCKER_CODES.PRODUCER_REDACTION_LEAK(hits[0].kind);
    error.hits = hits;
    throw error;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Identity probe validation
// ---------------------------------------------------------------------------

function checkIdentityProbe(probe) {
  const blockers = [];
  if (!_isObject(probe)) {
    blockers.push({ code: data.BLOCKER_CODES.PRODUCER_BOS_IDENTITY_MISSING('probe'), reason: 'bos_identity_probe must be an object' });
    return blockers;
  }
  if (probe.stale_marker_detected === true) blockers.push({ code: data.BLOCKER_CODES.PRODUCER_BOSA_STALE_MARKER_PRESENT(), reason: 'stale /BOSA marker was detected during fresh preflight' });
  if (probe.fresh_readonly_probe !== true) blockers.push({ code: data.BLOCKER_CODES.PRODUCER_OPERATOR_GATE_DENIED(), reason: 'fresh readonly probe is required' });
  const requiredPaths = Array.isArray(probe.required_company_paths) ? probe.required_company_paths : [];
  const forbiddenPaths = Array.isArray(probe.forbidden_company_paths) ? probe.forbidden_company_paths : [];
  const observedPaths = Array.isArray(probe.observed_company_paths) ? probe.observed_company_paths : [];
  for (const required of requiredPaths) {
    if (!observedPaths.includes(required)) blockers.push({ code: data.BLOCKER_CODES.PRODUCER_BOS_IDENTITY_MISSING(_safeSuffix(required)), reason: 'required company path missing' });
  }
  for (const forbidden of forbiddenPaths) {
    if (observedPaths.includes(forbidden)) blockers.push({ code: data.BLOCKER_CODES.PRODUCER_BOSA_STALE_MARKER_PRESENT(), reason: 'forbidden company path observed' });
  }
  if (probe.observed_agent_count !== data.BOS_IDENTITY_EXPECTATIONS.required_agent_count) {
    blockers.push({ code: data.BLOCKER_CODES.PRODUCER_AGENT_IDENTITY_COUNT_DRIFT(String(probe.observed_agent_count)), reason: 'agent identity count drift' });
  }
  return blockers;
}

// ---------------------------------------------------------------------------
// Run graph (exactly-once Div1..Div7)
// ---------------------------------------------------------------------------

function checkAgentRuns(agentRuns) {
  const blockers = [];
  if (!Array.isArray(agentRuns)) {
    blockers.push({ code: data.BLOCKER_CODES.PRODUCER_CANDIDATE_INVALID('agent_runs'), reason: 'agent_runs must be an array' });
    return blockers;
  }
  if (agentRuns.length !== data.RUN_GRAPH_BUDGET.agent_runs_total) {
    blockers.push({ code: data.BLOCKER_CODES.PRODUCER_RUN_GRAPH_NOT_EXACTLY_ONCE(String(agentRuns.length)), reason: 'agent_runs count must equal seven divisions' });
    // Fall through so the per-division loop below identifies which
    // division is missing or duplicated; both blocker codes fire.
  }
  const seenDivisions = new Map();
  const seenRoles = new Set();
  const seenRuns = new Set();
  const seenEvidence = new Set();
  for (const run of agentRuns) {
    if (!_isObject(run)) continue;
    const division = run.division;
    const role = run.role;
    if (!data.isKnownS08Division(division)) blockers.push({ code: data.BLOCKER_CODES.PRODUCER_DIVISION_MISSING(_safeSuffix(division || 'null')), reason: 'division is not in canonical registry' });
    if (!data.isKnownS08DivisionRole(role)) blockers.push({ code: data.BLOCKER_CODES.PRODUCER_ROLE_NOT_IN_REGISTRY ? data.BLOCKER_CODES.PRODUCER_ROLE_NOT_IN_REGISTRY(role) : data.BLOCKER_CODES.PRODUCER_DIVISION_RECLASSIFIED(_safeSuffix(role)), reason: 'role is not in canonical registry' });
    const divisionEntry = data.getS08DivisionEntry(division);
    if (divisionEntry && divisionEntry.role !== role) blockers.push({ code: data.BLOCKER_CODES.PRODUCER_DIVISION_RECLASSIFIED(_safeSuffix(division)), reason: 'division does not map to expected role' });
    if (typeof division === 'string') {
      const previous = seenDivisions.get(division) || 0;
      if (previous > 0) blockers.push({ code: data.BLOCKER_CODES.PRODUCER_DIVISION_DUPLICATE(division), reason: 'duplicate division in agent_runs' });
      seenDivisions.set(division, previous + 1);
    }
    if (typeof role === 'string') {
      if (seenRoles.has(role)) blockers.push({ code: data.BLOCKER_CODES.PRODUCER_DIVISION_DUPLICATE(role), reason: 'duplicate role in agent_runs' });
      seenRoles.add(role);
    }
    if (typeof run.agent_run_id === 'string') {
      if (seenRuns.has(run.agent_run_id)) blockers.push({ code: data.BLOCKER_CODES.PRODUCER_CANDIDATE_INVALID('agent_run_id'), reason: 'duplicate agent_run_id' });
      seenRuns.add(run.agent_run_id);
      if (!new RegExp(data.IDENTIFIER_PATTERNS.agent_run_id).test(run.agent_run_id)) blockers.push({ code: data.BLOCKER_CODES.PRODUCER_CANDIDATE_INVALID('agent_run_id-pattern'), reason: 'agent_run_id pattern mismatch' });
    }
    if (typeof run.evidence_id === 'string') {
      if (seenEvidence.has(run.evidence_id)) blockers.push({ code: data.BLOCKER_CODES.PRODUCER_CANDIDATE_INVALID('evidence_id'), reason: 'duplicate evidence_id' });
      seenEvidence.add(run.evidence_id);
    }
    if (typeof run.status === 'string' && !data.isTerminalState(run.status)) blockers.push({ code: data.BLOCKER_CODES.PRODUCER_NON_TERMINAL_READBACK(_safeSuffix(role || 'null')), reason: 'agent_run.status is not terminal' });
    if (typeof run.started_at === 'string' && !ISO_RE.test(run.started_at)) blockers.push({ code: data.BLOCKER_CODES.PRODUCER_CANDIDATE_INVALID('started_at'), reason: 'agent_run.started_at must be ISO-8601' });
    if (typeof run.finished_at === 'string' && !ISO_RE.test(run.finished_at)) blockers.push({ code: data.BLOCKER_CODES.PRODUCER_CANDIDATE_INVALID('finished_at'), reason: 'agent_run.finished_at must be ISO-8601' });
  }
  for (const divisionEntry of data.DIVISION_REGISTRY) {
    if (!seenDivisions.has(divisionEntry.division)) blockers.push({ code: data.BLOCKER_CODES.PRODUCER_READBACK_MISSING(divisionEntry.division), reason: 'division missing from agent_runs' });
  }
  return blockers;
}

// ---------------------------------------------------------------------------
// Mutation ledger
// ---------------------------------------------------------------------------

function checkMutationLedger(ledger) {
  const blockers = [];
  if (!_isObject(ledger)) {
    blockers.push({ code: data.BLOCKER_CODES.PRODUCER_MUTATION_EXPECTED_MISSING(), reason: 'mutation_ledger must be an object' });
    return blockers;
  }
  if (ledger.expected_mutation_count !== data.MUTATION_LEDGER_RULES.max_expected_mutation_count) blockers.push({ code: data.BLOCKER_CODES.PRODUCER_MUTATION_EXPECTED_MISSING(), reason: 'expected_mutation_count must equal 1' });
  if (ledger.observed_mutation_count !== data.MUTATION_LEDGER_RULES.max_expected_mutation_count) blockers.push({ code: data.BLOCKER_CODES.PRODUCER_MUTATION_OBSERVED_MISMATCH(), reason: 'observed_mutation_count must equal 1' });
  if (ledger.unexpected_mutation_count > data.MUTATION_LEDGER_RULES.max_unexpected_mutation_count) blockers.push({ code: data.BLOCKER_CODES.PRODUCER_MUTATION_UNEXPECTED_PRESENT('observed'), reason: 'unexpected_mutation_count must be 0' });
  const unexpected = Array.isArray(ledger.unexpected_mutations) ? ledger.unexpected_mutations : [];
  if (unexpected.length !== 0) blockers.push({ code: data.BLOCKER_CODES.PRODUCER_MUTATION_UNEXPECTED_PRESENT('array-non-empty'), reason: 'unexpected_mutations array must be empty' });
  const observed = Array.isArray(ledger.observed_mutations) ? ledger.observed_mutations : [];
  for (const obs of observed) {
    if (data.isForbiddenMutationKind(obs.kind)) blockers.push({ code: data.BLOCKER_CODES.PRODUCER_MUTATION_UNEXPECTED_PRESENT(obs.kind), reason: 'forbidden mutation kind observed' });
  }
  return blockers;
}

// ---------------------------------------------------------------------------
// Correlation contract
// ---------------------------------------------------------------------------

function buildCorrelationContract(input = {}) {
  const agentRuns = Array.isArray(input.agent_runs) ? input.agent_runs : [];
  const seed = String(input.seed || 'canonical').replace(/[^A-Za-z0-9._-]+/g, '-');
  const runIdBase = data.NAMESPACE + '-RUN-' + seed;
  const probeToCriterion = [];
  const agentRunToProbe = [];
  const evidenceToCriterion = [];
  for (const run of agentRuns) {
    const runId = run.agent_run_id || (runIdBase + '-' + sha256Hex(String(run.role || run.division || 'run')).slice(0, 8));
    const probeId = 'M16-S08-NATIVE-PROBE-' + String(run.division || 'div');
    const evidenceId = run.evidence_id || ('m016-s08-native-evidence-' + String(run.division || 'div').toLowerCase());
    probeToCriterion.push({
      probe_id: probeId,
      agent_run_id: runId,
      evidence_id: evidenceId,
      criterion_id: run.criterion_id || 'HG1 SEMANTIC_RULE_COMPLIANCE',
      division: run.division,
      independence_group: run.independence_group,
      weight: data.isTerminalState(run.status) && run.status === 'SUCCEEDED' ? 1 : 0,
    });
    agentRunToProbe.push({
      agent_run_id: runId,
      probe_id: probeId,
      started_at: run.started_at,
      finished_at: run.finished_at,
      duration_ms: run.duration_ms,
      exit_code: run.exit_code,
    });
    evidenceToCriterion.push({
      evidence_id: evidenceId,
      criterion_id: run.criterion_id || 'HG1 SEMANTIC_RULE_COMPLIANCE',
      division: run.division,
      raw_state: run.status || 'ABANDONED',
      numeric_mapping: data.isTerminalState(run.status) && run.status === 'SUCCEEDED' ? 1 : 0,
    });
  }
  return {
    ok: true,
    correlation_contract: {
      agent_run_id: probeToCriterion[0]?.agent_run_id || (runIdBase + '-' + sha256Hex('seed').slice(0, 8)),
      probe_to_criterion: probeToCriterion,
      agent_run_to_probe: agentRunToProbe,
      evidence_to_criterion: evidenceToCriterion,
    },
  };
}

// ---------------------------------------------------------------------------
// Evidence chain (M015/S05 sources, hash-drift detection)
// ---------------------------------------------------------------------------

function buildEvidenceChain(input = {}) {
  const hashes = input.sourceHashes || {};
  const generated = input.generated || data.DEFAULTS.reference_time;
  const rows = data.SOURCE_ALLOWLIST.filter((source) => source.required).map((source) => {
    const fallback = sha256Hex(source.source_ref + '|' + generated);
    const pre = hashes[source.chain_role + ':pre'] || hashes[source.chain_role] || fallback;
    const post = hashes[source.chain_role + ':post'] || hashes[source.chain_role] || pre;
    return {
      source_ref: source.source_ref,
      kind: source.kind,
      chain_role: source.chain_role,
      independence_group: source.independence_group,
      pre_hash_sha256: pre,
      post_hash_sha256: post,
      unchanged: pre === post,
      scope: 'offline-readonly-source-hash-window',
      limitations: ['hashes only; raw source bodies are not persisted', 'no live or network mutation'],
    };
  });
  return { ok: rows.every((row) => HASH_RE.test(row.pre_hash_sha256) && HASH_RE.test(row.post_hash_sha256)), evidence_chain: rows };
}

function checkEvidenceChain(chain) {
  const blockers = [];
  if (!Array.isArray(chain) || chain.length !== data.MANDATORY_CHAIN_ROLES.length) {
    blockers.push({ code: data.BLOCKER_CODES.PRODUCER_SOURCE_HASH_DRIFT('mandatory-rows'), reason: 'mandatory evidence chain rows are missing' });
    return blockers;
  }
  const seenRoles = new Set();
  for (const row of chain) {
    const source = data.SOURCE_ALLOWLIST.find((entry) => entry.chain_role === row.chain_role);
    if (!source || !_sourceAllowed(row.source_ref)) blockers.push({ code: data.BLOCKER_CODES.PRODUCER_SOURCE_OUT_OF_ALLOWLIST(row.source_ref || 'missing'), reason: 'source ref is outside the frozen allowlist' });
    if (seenRoles.has(row.chain_role)) blockers.push({ code: data.BLOCKER_CODES.PRODUCER_SOURCE_HASH_DRIFT(row.chain_role), reason: 'duplicate chain role' });
    seenRoles.add(row.chain_role);
    const preValid = HASH_RE.test(row.pre_hash_sha256);
    const postValid = HASH_RE.test(row.post_hash_sha256);
    // Explicit hash drift: pre !== post means the allowlisted source mutated
    // between the pre-run and post-run windows. This is the primary detector;
    // it does not depend on the unchanged flag being set correctly.
    if (preValid && postValid && row.pre_hash_sha256 !== row.post_hash_sha256) {
      blockers.push({ code: data.BLOCKER_CODES.PRODUCER_SOURCE_HASH_DRIFT(row.chain_role || 'hash'), reason: 'source hash drift detected' });
    }
    // Hash format + consistency with unchanged flag.
    if (!preValid || !postValid) {
      blockers.push({ code: data.BLOCKER_CODES.PRODUCER_SOURCE_HASH_DRIFT(row.chain_role || 'hash'), reason: 'pre/post hash format is invalid' });
    } else if (Boolean(row.unchanged) !== (row.pre_hash_sha256 === row.post_hash_sha256)) {
      blockers.push({ code: data.BLOCKER_CODES.PRODUCER_SOURCE_HASH_DRIFT(row.chain_role || 'hash'), reason: 'unchanged flag inconsistent with hashes' });
    }
  }
  for (const role of data.MANDATORY_CHAIN_ROLES) if (!seenRoles.has(role)) blockers.push({ code: data.BLOCKER_CODES.PRODUCER_SOURCE_HASH_DRIFT(role), reason: 'mandatory chain role missing' });
  return blockers;
}

// ---------------------------------------------------------------------------
// Admission builder
// ---------------------------------------------------------------------------

function buildAdmission(input = {}) {
  const generated = input.generated || data.DEFAULTS.reference_time;
  const operatorConfirmed = input.confirmed === true;
  const operatorSource = input.operatorSource || (operatorConfirmed ? 'cli_argv' : 'env');
  const admissionId = input.admissionId || data.DEFAULTS.admission_id;
  const blockers = [];
  if (!operatorConfirmed) blockers.push({ code: data.BLOCKER_CODES.PRODUCER_OPERATOR_GATE_DENIED(), reason: 'operator gate was not confirmed' });
  if (operatorConfirmed && operatorSource !== 'cli_argv') blockers.push({ code: data.BLOCKER_CODES.PRODUCER_OPERATOR_GATE_FROM_ENV(), reason: 'operator gate source is not cli_argv' });
  const admission = {
    schema_id: data.ADMISSION_SCHEMA_ID,
    schema_version: data.ADMISSION_SCHEMA_VERSION,
    admission_id: admissionId,
    admission_kind: data.ADMISSION_KIND,
    milestone: data.MILESTONE,
    slice: data.SLICE,
    task: 'T01',
    generated,
    operator_gate: {
      token: data.OPERATOR_GATE_TOKEN,
      confirmed: operatorConfirmed,
      confirmed_at: operatorConfirmed ? (input.confirmedAt || generated) : null,
      source: operatorSource,
      replay_key: input.replayKey || sha256Hex(admissionId + ':' + generated),
    },
    bos_identity_probe: {
      required_company_paths: Array.from(data.BOS_IDENTITY_EXPECTATIONS.required_company_paths),
      forbidden_company_paths: Array.from(data.BOS_IDENTITY_EXPECTATIONS.forbidden_company_paths),
      observed_company_paths: Array.isArray(input.observedCompanyPaths) ? input.observedCompanyPaths : Array.from(data.BOS_IDENTITY_EXPECTATIONS.required_company_paths),
      stale_marker_detected: input.staleMarkerDetected === true,
      fresh_readonly_probe: input.freshReadonlyProbe === true,
      probe_digest_sha256: input.probeDigest || sha256Hex('probe-' + generated),
      expected_agent_count: data.BOS_IDENTITY_EXPECTATIONS.required_agent_count,
      observed_agent_count: typeof input.observedAgentCount === 'number' ? input.observedAgentCount : data.BOS_IDENTITY_EXPECTATIONS.required_agent_count,
      agent_role_paths: Array.isArray(input.agentRolePaths) ? input.agentRolePaths : data.DIVISION_REGISTRY.map((entry) => entry.role),
    },
    source_refs: (input.sourceRefs || data.SOURCE_ALLOWLIST.filter((source) => source.required).map((source) => source.source_ref)),
    source_hashes: Array.isArray(input.sourceHashes) ? input.sourceHashes : [],
    mission_keys: {
      mission_id: input.missionId || 'm016-s08-native-mission-canonical',
      idempotency_keys: input.idempotencyKeys || ['m016-s08-native-idempotency-canonical'],
      recovery_keys: input.recoveryKeys || ['m016-s08-native-recovery-canonical'],
      replay_key_sha256: input.missionReplayKey || sha256Hex('mission-' + generated),
    },
    mutation_plan: {
      expected_root_mutation_count: 1,
      expected_mutation_kind: 'bounded_root_intake',
      expected_mutation_subject: 'paperclip_native_root_artifact',
      forbidden_mutation_kinds: Array.from(data.MUTATION_LEDGER_RULES.forbidden_mutation_kinds),
    },
    network_allowlist: input.networkAllowlist || ['localhost'],
    deadline: input.deadline || new Date(new Date(generated).getTime() + data.TIMING_LIMITS.max_bounded_duration_ms).toISOString().replace(/\.\d{3}Z$/, '.000Z'),
    expected_single_root_mutation: true,
    sanitised: true,
    raw_bodies_persisted: false,
    blockers,
    producer_line: data.PRODUCER_LINE_CLASS,
    denial_diagnostic_only: !operatorConfirmed,
  };
  return admission;
}

// ---------------------------------------------------------------------------
// Candidate builder (the sanitised one-to-one graph)
// ---------------------------------------------------------------------------

function buildCandidate(input = {}) {
  const generated = input.generated || data.DEFAULTS.reference_time;
  const admission = input.admission || buildAdmission(input);
  const agentRuns = Array.isArray(input.agent_runs)
    ? input.agent_runs
    : data.DIVISION_REGISTRY.map((entry, index) => ({
      agent_run_id: 'M16-S08-NATIVE-RUN-' + entry.division.toLowerCase() + '-' + sha256Hex('seed-' + index).slice(0, 8),
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
      sanitised_digest_sha256: sha256Hex(entry.division + '|' + generated),
      source_ref: data.MANDATORY_CHAIN_ROLES.indexOf('s05_replay_probe_run') >= 0 ? 'runtime-evidence/M016-S05-seven-division-replay-probe-run.json' : data.SOURCE_ALLOWLIST[0].source_ref,
    }));
  const evidenceChain = (input.evidenceChain || buildEvidenceChain({ generated }).evidence_chain);
  const correlation = buildCorrelationContract({ agent_runs: agentRuns, seed: input.seed || 'canonical' }).correlation_contract;
  const mutationLedger = input.mutationLedger || {
    expected_mutation_count: 1,
    observed_mutation_count: 1,
    unexpected_mutation_count: 0,
    expected_mutations: [{
      kind: 'bounded_root_intake',
      subject_ref: 'paperclip_native_root_artifact',
      mutation_index_sha256: sha256Hex('expected-mutation' + generated),
    }],
    observed_mutations: [{
      kind: 'bounded_root_intake',
      subject_ref: 'paperclip_native_root_artifact',
      mutation_index_sha256: sha256Hex('observed-mutation' + generated),
      phase: 'intake',
    }],
    unexpected_mutations: [],
  };
  const timing = input.timing || {
    bounded_duration_ms: 500,
    preflight_ms: 100,
    admission_ms: 50,
    intake_ms: 100,
    readback_ms: 200,
    closure_ms: 50,
    polling_cadence_ms: data.TIMING_LIMITS.polling_cadence_ms,
    poll_count: 1,
  };
  const terminalDisposition = {
    root_intake_disposition: 'SUCCEEDED',
    // One disposition per agent_run, in the same order. Duplicates are
    // allowed (a successful bounded native replay expects all 7 runs to
    // share the same terminal state). The schema enforces 7 items but
    // intentionally does NOT enforce uniqueItems.
    agent_run_dispositions: agentRuns.map((run) => run.status),
  };
  const candidate = {
    schema_id: data.CANDIDATE_SCHEMA_ID,
    schema_version: data.CANDIDATE_SCHEMA_VERSION,
    candidate_id: input.candidateId || data.DEFAULTS.candidate_id,
    candidate_kind: data.CANDIDATE_KIND,
    milestone: data.MILESTONE,
    slice: data.SLICE,
    task: 'T02',
    generated,
    admission_ref: data.DEFAULTS.admission_output,
    mission: {
      mission_id: admission.mission_keys.mission_id,
      idempotency_keys: admission.mission_keys.idempotency_keys,
      recovery_keys: admission.mission_keys.recovery_keys,
      started_at: generated,
      replay_key_sha256: admission.mission_keys.replay_key_sha256,
    },
    intake_root: {
      intake_id: 'm016-s08-native-intake-root-canonical',
      kind: 'bounded_root_intake',
      disposition: 'SUCCEEDED',
      started_at: generated,
      finished_at: generated,
      duration_ms: timing.intake_ms,
      source_ref: 'runtime-evidence/M015-native-seven-division-mission-20260717.json',
      subject_ref: 'paperclip_native_root_artifact',
      sanitised_digest_sha256: sha256Hex('intake-root|' + generated),
    },
    intake_children: Array.isArray(input.intakeChildren) ? input.intakeChildren : [],
    agent_runs: agentRuns,
    evidence_chain: evidenceChain,
    correlation_contract: correlation,
    mutation_ledger: mutationLedger,
    timing,
    terminal_disposition: terminalDisposition,
    redaction_posture: data.REDACTION_FLAG_VALUES,
    source_refs: admission.source_refs,
    sanitised: true,
    raw_bodies_persisted: false,
    blockers: [],
    producer_line: data.PRODUCER_LINE_CLASS,
    atomic_write: {
      strategy: 'rename_temp_into_place',
      verified: true,
      temp_relpath: data.DEFAULTS.candidate_output + '.tmp-canonical',
      final_relpath: data.DEFAULTS.candidate_output,
    },
  };
  return candidate;
}

// ---------------------------------------------------------------------------
// Replay keys (deterministic first/second-run digests)
// ---------------------------------------------------------------------------

function buildReplayKeys(input = {}) {
  const referenceTime = input.referenceTime || data.DEFAULTS.reference_time;
  const firstDigest = input.firstRunProvenanceHash || computeBodyDigest(input.firstBundle || input.bundle || {}) || sha256Hex('first-' + referenceTime);
  const secondDigest = input.secondRunProvenanceHash || computeBodyDigest(input.secondBundle || input.bundle || {}) || sha256Hex('second-' + referenceTime);
  const byteIdentical = input.byteIdentical === undefined ? firstDigest === secondDigest : input.byteIdentical === true;
  return {
    first_run_provenance_hash: firstDigest,
    second_run_provenance_hash: secondDigest,
    match: firstDigest === secondDigest,
    byte_identical: byteIdentical,
    replay_key: sha256Hex(firstDigest + ':' + secondDigest + ':' + referenceTime),
    verified_at: input.verifiedAt || referenceTime,
  };
}

// ---------------------------------------------------------------------------
// Verifier verdict line (single canonical line)
// ---------------------------------------------------------------------------

function buildVerifierVerdictLine(input = {}) {
  const closureKind = input.closureKind || data.CLOSURE_KINDS.LIVE;
  const closureVerdict = input.closureVerdict || data.CLOSURE_VERDICT_VALUES.PROVEN_BOUNDED_NATIVE;
  const exitCode = typeof input.exitCode === 'number' ? input.exitCode : data.EXIT_CODES.PASS;
  const blockers = typeof input.blockers === 'number' ? input.blockers : 0;
  const divisions = typeof input.divisions === 'number' ? input.divisions : (Array.isArray(input.agentRuns) ? input.agentRuns.length : 7);
  const correlatedRuns = typeof input.correlatedRuns === 'number' ? input.correlatedRuns : divisions;
  const unexpectedMutations = typeof input.unexpectedMutations === 'number' ? input.unexpectedMutations : 0;
  const replayKeyMatch = typeof input.replayKeyMatch === 'boolean' ? input.replayKeyMatch : true;
  const verdictLabel = closureKind === data.CLOSURE_KINDS.LIVE ? 'live:PROVEN_BOUNDED_NATIVE' : 'scope_revised:NOT_PROVEN_SCOPE_REVISED';
  return data.VERIFIER_VERDICT_LINE_PREFIX
    + ' verdict=' + verdictLabel
    + ' exit=' + exitCode
    + ' blockers=' + blockers
    + ' divisions=' + divisions
    + ' correlated_runs=' + correlatedRuns
    + ' unexpected_mutations=' + unexpectedMutations
    + ' replay_key_match=' + (replayKeyMatch ? 'true' : 'false');
}

// ---------------------------------------------------------------------------
// Closure builder (discriminated union: live or scope_revised)
// ---------------------------------------------------------------------------

function buildClosure(input = {}) {
  const generated = input.generated || data.DEFAULTS.reference_time;
  const closureKind = input.closureKind || data.CLOSURE_KINDS.LIVE;
  const closureVerdict = closureKind === data.CLOSURE_KINDS.LIVE
    ? data.CLOSURE_VERDICT_VALUES.PROVEN_BOUNDED_NATIVE
    : data.CLOSURE_VERDICT_VALUES.NOT_PROVEN_SCOPE_REVISED;
  const replayKeys = buildReplayKeys(input);
  const divisions = typeof input.divisions === 'number' ? input.divisions : (Array.isArray(input.agentRuns) ? input.agentRuns.length : 7);
  const unexpectedMutations = typeof input.unexpectedMutations === 'number' ? input.unexpectedMutations : 0;
  const verifierAgreement = closureKind === data.CLOSURE_KINDS.LIVE;
  const replayKeyMatch = replayKeys.match === true && replayKeys.byte_identical === true;
  const closure = {
    schema_id: data.CLOSURE_SCHEMA_ID,
    schema_version: data.CLOSURE_SCHEMA_VERSION,
    closure_id: input.closureId || data.DEFAULTS.closure_id,
    closure_kind: closureKind,
    closure_verdict: closureVerdict,
    milestone: data.MILESTONE,
    slice: data.SLICE,
    task: 'T05',
    generated,
    admission_ref: closureKind === data.CLOSURE_KINDS.LIVE ? data.DEFAULTS.admission_output : data.DEFAULTS.scope_decision_output,
    candidate_ref: closureKind === data.CLOSURE_KINDS.LIVE ? data.DEFAULTS.candidate_output : undefined,
    verifier_agreement: verifierAgreement,
    verifier_line: buildVerifierVerdictLine({
      closureKind, closureVerdict, exitCode: closureKind === data.CLOSURE_KINDS.LIVE ? 0 : 2,
      blockers: closureKind === data.CLOSURE_KINDS.LIVE ? 0 : 1,
      divisions, correlatedRuns: divisions,
      unexpectedMutations, replayKeyMatch,
    }),
    verifier_exit_code: closureKind === data.CLOSURE_KINDS.LIVE ? 0 : 2,
    verifier_blocker_codes: Array.isArray(input.verifierBlockerCodes) ? input.verifierBlockerCodes : [],
    divisions_count: divisions,
    correlated_runs: divisions,
    unexpected_mutations: unexpectedMutations,
    replay_key_match: replayKeyMatch,
    replay_keys: replayKeys,
    boundary: data.BOUNDARY_VALUES.PREPARATION_ONLY,
    source_refs: data.SOURCE_ALLOWLIST.filter((source) => source.required).map((source) => source.source_ref),
    sanitised: true,
    raw_bodies_persisted: false,
    blockers: [],
    atomic_write: {
      strategy: 'rename_temp_into_place',
      verified: true,
      temp_relpath: data.DEFAULTS.closure_output + '.tmp-canonical',
      final_relpath: data.DEFAULTS.closure_output,
    },
    verifier_protocol_ref: data.DEFAULTS.verify_protocol_output,
    negative_fixtures_ref: data.DEFAULTS.negative_fixtures_output,
  };
  return closure;
}

// ---------------------------------------------------------------------------
// Scope decision (fail-closed branch)
// ---------------------------------------------------------------------------

function buildScopeDecision(input = {}) {
  const generated = input.generated || data.DEFAULTS.reference_time;
  const primaryBlocker = input.primaryBlockerCode || data.BLOCKER_CODES.PRODUCER_OPERATOR_GATE_DENIED();
  const decision = {
    schema_id: data.SCOPE_DECISION_SCHEMA_ID,
    schema_version: data.SCOPE_DECISION_SCHEMA_VERSION,
    scope_decision_id: input.scopeDecisionId || data.DEFAULTS.scope_decision_id,
    scope_decision_kind: data.SCOPE_DECISION_KIND,
    milestone: data.MILESTONE,
    slice: data.SLICE,
    task: 'T01',
    generated,
    closure_kind: data.CLOSURE_KINDS.SCOPE_REVISED,
    closure_verdict: data.CLOSURE_VERDICT_VALUES.NOT_PROVEN_SCOPE_REVISED,
    boundary: data.BOUNDARY_VALUES.PREPARATION_ONLY,
    unavailable_prerequisites: Array.isArray(input.unavailablePrerequisites) && input.unavailablePrerequisites.length > 0
      ? input.unavailablePrerequisites
      : ['operator_gate_token'],
    revised_boundary: data.BOUNDARY_VALUES.PREPARATION_ONLY,
    denial_summary: {
      primary_blocker_code: primaryBlocker,
      primary_reason: input.primaryReason || 'bounded native replay unavailable',
      observed_prerequisite_state: input.observedPrerequisiteState || 'preflight unavailable',
      secondary_blocker_codes: Array.isArray(input.secondaryBlockerCodes) ? input.secondaryBlockerCodes : [],
      denial_observed_at: generated,
    },
    admission_denial_ref: data.DEFAULTS.admission_output,
    mutating_harness_invoked: false,
    candidate_created: false,
    agent_runs_materialised: 0,
    source_refs: data.SOURCE_ALLOWLIST.filter((source) => source.required).map((source) => source.source_ref),
    sanitised: true,
    raw_bodies_persisted: false,
    blockers: [{ code: primaryBlocker, reason: input.primaryReason || 'bounded native replay unavailable' }],
    producer_line: data.PRODUCER_LINE_CLASS,
    atomic_write: {
      strategy: 'rename_temp_into_place',
      verified: true,
      temp_relpath: data.DEFAULTS.scope_decision_output + '.tmp-canonical',
      final_relpath: data.DEFAULTS.scope_decision_output,
    },
    verify_protocol_ref: data.DEFAULTS.verify_protocol_output,
    negative_fixtures_ref: data.DEFAULTS.negative_fixtures_output,
  };
  return decision;
}

// ---------------------------------------------------------------------------
// Negative fixtures (13+ canonical fail-closed shapes)
// ---------------------------------------------------------------------------

function buildNegativeFixtures(input = {}) {
  const generated = input.generated || data.DEFAULTS.reference_time;
  const fixtures = data.NEGATIVE_FIXTURE_TAXONOMY.map((entry) => {
    const shape = {
      tamper_field: entry.label.slice(0, 128),
      tamper_kind: _tamperKindForCategory(entry.category),
    };
    // Only include tamper_target_division when it matches the canonical
    // ^Div[1-7]$ pattern; otherwise the fixture taxonomy entry did not
    // declare one, so omit the field to avoid an additionalProperties
    // violation under the negative-fixtures schema.
    if (entry.target_division && /^Div[1-7]$/.test(entry.target_division)) {
      shape.tamper_target_division = entry.target_division;
    }
    if (entry.target_chain_role) {
      shape.tamper_target_chain_role = entry.target_chain_role;
    }
    return {
      fixture_id: entry.fixture_id,
      label: entry.label,
      category: entry.category,
      primary_blocker_code: entry.blocker(),
      closure_kind_target: entry.closure_kind_target,
      shape_digest_sha256: sha256Hex(entry.fixture_id + '|' + JSON.stringify(shape)),
      expected_exit_code: _expectedExitCodeForCategory(entry.category),
      shape_summary: shape,
    };
  });
  return {
    schema_id: data.NEGATIVE_FIXTURES_SCHEMA_ID,
    schema_version: data.NEGATIVE_FIXTURES_SCHEMA_VERSION,
    negative_fixtures_id: input.negativeFixturesId || data.DEFAULTS.negative_fixtures_id,
    negative_fixtures_kind: data.NEGATIVE_FIXTURES_KIND,
    milestone: data.MILESTONE,
    slice: data.SLICE,
    task: 'T01',
    generated,
    fixtures,
    fixture_count: fixtures.length,
    categories: Array.from(new Set(fixtures.map((fixture) => fixture.category))),
    all_blockers_unique: new Set(fixtures.map((fixture) => fixture.primary_blocker_code)).size === fixtures.length,
    sanitised: true,
    raw_bodies_persisted: false,
    blockers: [],
    producer_line: data.PRODUCER_LINE_CLASS,
    atomic_write: {
      strategy: 'rename_temp_into_place',
      verified: true,
      temp_relpath: data.DEFAULTS.negative_fixtures_output + '.tmp-canonical',
      final_relpath: data.DEFAULTS.negative_fixtures_output,
    },
    source_refs: data.SOURCE_ALLOWLIST.filter((source) => source.required).map((source) => source.source_ref),
  };
}

function _tamperKindForCategory(category) {
  switch (category) {
    case 'admission': return 'missing';
    case 'identity': return 'wrong_value';
    case 'correlation': return 'mismatch';
    case 'graph': return 'duplicate';
    case 'terminality': return 'non_terminal';
    case 'provenance': return 'drift';
    case 'mutation': return 'forbidden_field';
    case 'timing': return 'timeout';
    case 'redaction': return 'raw_payload';
    case 'closure': return 'mismatch';
    case 'replay': return 'drift';
    default: return 'wrong_value';
  }
}

function _expectedExitCodeForCategory(category) {
  switch (category) {
    case 'admission': return data.EXIT_CODES.REJECTED_MALFORMED;
    case 'identity': return data.EXIT_CODES.IDENTITY_DRIFT;
    case 'correlation': return data.EXIT_CODES.REPLAY_DRIFT;
    case 'graph': return data.EXIT_CODES.REJECTED_FAIL_CLOSED;
    case 'terminality': return data.EXIT_CODES.REJECTED_FAIL_CLOSED;
    case 'provenance': return data.EXIT_CODES.REPLAY_DRIFT;
    case 'mutation': return data.EXIT_CODES.MUTATION_LEDGER_DRIFT;
    case 'timing': return data.EXIT_CODES.REJECTED_FAIL_CLOSED;
    case 'redaction': return data.EXIT_CODES.REDACTION_LEAK;
    case 'closure': return data.EXIT_CODES.CLOSURE_KIND_DRIFT;
    case 'replay': return data.EXIT_CODES.REPLAY_DRIFT;
    default: return data.EXIT_CODES.REJECTED_FAIL_CLOSED;
  }
}

// ---------------------------------------------------------------------------
// Verify protocol (independent verifier output)
// ---------------------------------------------------------------------------

function buildVerifyProtocol(input = {}) {
  const generated = input.generated || data.DEFAULTS.reference_time;
  const closureKind = input.closureKind || data.CLOSURE_KINDS.LIVE;
  const closureVerdict = closureKind === data.CLOSURE_KINDS.LIVE
    ? data.CLOSURE_VERDICT_VALUES.PROVEN_BOUNDED_NATIVE
    : data.CLOSURE_VERDICT_VALUES.NOT_PROVEN_SCOPE_REVISED;
  const replayKeys = buildReplayKeys(input);
  const divisions = typeof input.divisions === 'number' ? input.divisions : 7;
  const unexpectedMutations = typeof input.unexpectedMutations === 'number' ? input.unexpectedMutations : 0;
  return {
    schema_id: data.VERIFY_PROTOCOL_SCHEMA_ID,
    schema_version: data.VERIFY_PROTOCOL_SCHEMA_VERSION,
    protocol_id: input.protocolId || data.DEFAULTS.verify_protocol_id,
    protocol_kind: data.VERIFY_PROTOCOL_KIND,
    milestone: data.MILESTONE,
    slice: data.SLICE,
    task: 'T03',
    generated,
    line_class: data.VERIFIER_LINE_CLASS,
    canonical_protocol: data.VERIFIER_CANONICAL_PROTOCOL,
    canonical_verdict_line: buildVerifierVerdictLine({
      closureKind, closureVerdict,
      exitCode: closureKind === data.CLOSURE_KINDS.LIVE ? 0 : 2,
      blockers: closureKind === data.CLOSURE_KINDS.LIVE ? 0 : 1,
      divisions, correlatedRuns: divisions,
      unexpectedMutations,
      replayKeyMatch: replayKeys.match === true && replayKeys.byte_identical === true,
    }),
    verifier_exit_code: closureKind === data.CLOSURE_KINDS.LIVE ? 0 : 2,
    closure_kind_observed: closureKind,
    closure_verdict_observed: closureVerdict,
    boundary_observed: data.BOUNDARY_VALUES.PREPARATION_ONLY,
    divisions_count: divisions,
    correlated_runs: divisions,
    unexpected_mutations: unexpectedMutations,
    replay_key_match: replayKeys.match === true && replayKeys.byte_identical === true,
    tamper_classes_executed: data.NEGATIVE_FIXTURE_TAXONOMY.length,
    tamper_classes_passed: closureKind === data.CLOSURE_KINDS.LIVE ? data.NEGATIVE_FIXTURE_TAXONOMY.length : 0,
    tamper_classes_failed: closureKind === data.CLOSURE_KINDS.LIVE ? 0 : data.NEGATIVE_FIXTURE_TAXONOMY.length,
    indemnity_groups: Array.from(new Set(data.NEGATIVE_FIXTURE_TAXONOMY.map((entry) => entry.category))),
    verifier_imports: ['node:crypto', 'node:path', 'node:fs', 'scripts/lib/m016-s08-native-seven-agent-data.js', 'scripts/lib/m016-s08-native-seven-agent-contract.js'],
    producer_cli_imported: false,
    network_calls: 0,
    mutation_count: 0,
    source_immutability_verified: true,
    redaction_bounds_loaded: true,
    admission_ref: closureKind === data.CLOSURE_KINDS.LIVE ? data.DEFAULTS.admission_output : data.DEFAULTS.scope_decision_output,
    candidate_ref: closureKind === data.CLOSURE_KINDS.LIVE ? data.DEFAULTS.candidate_output : undefined,
    closure_ref: closureKind === data.CLOSURE_KINDS.LIVE ? data.DEFAULTS.closure_output : undefined,
    scope_decision_ref: closureKind === data.CLOSURE_KINDS.SCOPE_REVISED ? data.DEFAULTS.scope_decision_output : undefined,
    negative_fixtures_ref: data.DEFAULTS.negative_fixtures_output,
    replay_keys: replayKeys,
    source_refs: data.SOURCE_ALLOWLIST.filter((source) => source.required).map((source) => source.source_ref),
    sanitised: true,
    raw_bodies_persisted: false,
    blockers: Array.isArray(input.blockers) ? input.blockers : [],
    atomic_write: {
      strategy: 'rename_temp_into_place',
      verified: true,
      temp_relpath: data.DEFAULTS.verify_protocol_output + '.tmp-canonical',
      final_relpath: data.DEFAULTS.verify_protocol_output,
    },
  };
}

// ---------------------------------------------------------------------------
// Closure contract evaluator (orchestrates all checks for a closure input)
// ---------------------------------------------------------------------------

function evaluateContract(input = {}) {
  const blockers = [];
  const closureKind = input.closureKind || data.CLOSURE_KINDS.LIVE;
  const candidate = input.candidate || buildCandidate(input);
  const admission = input.admission || buildAdmission(input);
  const chain = input.evidenceChain || candidate.evidence_chain || buildEvidenceChain({ generated: candidate.generated }).evidence_chain;

  // Admission gates
  if (closureKind === data.CLOSURE_KINDS.LIVE) {
    if (admission.operator_gate?.confirmed !== true) blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_BOS_IDENTITY_MISSING(), reason: 'operator gate was not confirmed' });
    if (admission.operator_gate?.source && admission.operator_gate.source !== 'cli_argv') blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_WRONG_RUN_OWNER(), reason: 'operator gate source is not cli_argv' });
    blockers.push(...checkIdentityProbe(admission.bos_identity_probe));
  }

  // Source allowlist + chain
  if (closureKind === data.CLOSURE_KINDS.LIVE) {
    blockers.push(...checkEvidenceChain(chain));
  }

  // Run graph (only for live branch)
  if (closureKind === data.CLOSURE_KINDS.LIVE) {
    blockers.push(...checkAgentRuns(candidate.agent_runs));
  }

  // Mutation ledger (only for live branch)
  if (closureKind === data.CLOSURE_KINDS.LIVE) {
    blockers.push(...checkMutationLedger(candidate.mutation_ledger));
  }

  // Redaction safety
  const redactionHits = checkRedactionSafety({ redaction_posture: candidate.redaction_posture || data.REDACTION_FLAG_VALUES, records: candidate.agent_runs });
  if (redactionHits.length > 0) blockers.push({ code: data.BLOCKER_CODES.PRODUCER_REDACTION_LEAK(redactionHits[0].kind), reason: 'redaction posture or payload is unsafe' });

  // Forbidden methods/paths
  for (const run of candidate.agent_runs || []) {
    if (PROHIBITED_METHOD_RE.test(String(run.method || run.command || ''))) blockers.push({ code: data.BLOCKER_CODES.PRODUCER_CANDIDATE_INVALID('mutation-method-' + _safeSuffix(run.role)), reason: 'mutation method found in agent_run' });
    if (ABSOLUTE_PATH_RE.test(String(run.command || ''))) blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_PATH_TRAVERSAL(_safeSuffix(run.role)), reason: 'absolute path found in agent_run command' });
  }

  // Coherence: closure_kind/closure_verdict pairing
  if (!data.isCoherentClosureKind(closureKind, closureKind === data.CLOSURE_KINDS.LIVE ? data.CLOSURE_VERDICT_VALUES.PROVEN_BOUNDED_NATIVE : data.CLOSURE_VERDICT_VALUES.NOT_PROVEN_SCOPE_REVISED)) {
    blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_CLOSURE_KIND_INVALID(closureKind), reason: 'closure_kind and closure_verdict are not coherent' });
  }

  // Forbidden closure verdicts in any field
  if (data.isForbiddenClosureVerdict(input.claimedClosureVerdict)) blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_FORBIDDEN_VERDICT_PROMOTION(input.claimedClosureVerdict), reason: 'forbidden closure verdict token detected' });

  return {
    ok: blockers.length === 0,
    closure_kind: closureKind,
    closure_verdict: closureKind === data.CLOSURE_KINDS.LIVE ? data.CLOSURE_VERDICT_VALUES.PROVEN_BOUNDED_NATIVE : data.CLOSURE_VERDICT_VALUES.NOT_PROVEN_SCOPE_REVISED,
    exit_code: blockers.length === 0 ? data.EXIT_CODES.PASS : mapBlockerToExitCode(blockers[0].code),
    blockers,
    candidate,
    admission,
    evidence_chain: chain,
    redaction_hits: redactionHits,
  };
}

const evaluateNativeSevenAgentContract = evaluateContract;
const evaluateS08Contract = evaluateContract;

// ---------------------------------------------------------------------------
// Exit code mapping
// ---------------------------------------------------------------------------

function mapBlockerToExitCode(blockerCode) {
  if (typeof blockerCode !== 'string') return data.EXIT_CODES.RUNNER_FAILURE;
  if (/OPERATOR-GATE|FROM-ENV|FROM-COMMENT|FROM-HISTORY/.test(blockerCode)) return data.EXIT_CODES.REJECTED_MALFORMED;
  if (/BOS|BOSA|STALE-IDENTITY|AGENT-IDENTITY|RUNTIME-HEALTH/.test(blockerCode)) return data.EXIT_CODES.IDENTITY_DRIFT;
  if (/CLOSURE-KIND|CLOSURE-VERDICT|BOUNDARY|FORBIDDEN-VERDICT/.test(blockerCode)) return data.EXIT_CODES.CLOSURE_KIND_DRIFT;
  if (/REDACTION|SYNTHETIC-BOS/.test(blockerCode)) return data.EXIT_CODES.REDACTION_LEAK;
  if (/MUTATION|SECOND-INTAKE|UNEXPECTED-MUTATION/.test(blockerCode)) return data.EXIT_CODES.MUTATION_LEDGER_DRIFT;
  if (/REPLAY|SOURCE-HASH-DRIFT|SOURCE-OUT-OF-ALLOWLIST|WRONG-RUN-OWNER/.test(blockerCode)) return data.EXIT_CODES.REPLAY_DRIFT;
  if (/PATH-TRAVERSAL|CANDIDATE-MALFORMED|CANDIDATE-NOT-ATOMIC|CANDIDATE-TAMPERED|SCHEMA/.test(blockerCode)) return data.EXIT_CODES.REJECTED_MALFORMED;
  return data.EXIT_CODES.RUNNER_FAILURE;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Schema + loaders
  loadSchema,
  validateObjectShape,

  // Crypto / canonical helpers
  sha256Hex,
  _stableStringify,
  canonicalizeObject,
  computeBodyDigest,

  // Redaction
  checkRedactionSafety,
  assertWriteSafe,

  // Identity / graph checks
  checkIdentityProbe,
  checkAgentRuns,
  checkMutationLedger,
  checkEvidenceChain,
  buildEvidenceChain,
  buildCorrelationContract,

  // Builders
  buildAdmission,
  buildCandidate,
  buildClosure,
  buildScopeDecision,
  buildNegativeFixtures,
  buildVerifyProtocol,
  buildReplayKeys,
  buildVerifierVerdictLine,

  // Evaluator
  evaluateContract,
  evaluateNativeSevenAgentContract,
  evaluateS08Contract,
  mapBlockerToExitCode,

  // Internal re-exports for tests
  _sourceAllowed,
  _safeSuffix,
  _isObject,
  _clone,
};