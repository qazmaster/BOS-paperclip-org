#!/usr/bin/env node
'use strict';

/**
 * M016-txa3vu / S05 / T01 — pure seven-division replay contract.
 *
 * This module intentionally has no producer/verifier imports, no subprocesses,
 * no network calls and no filesystem writes. `loadSchema` only reads the
 * requested JSON schema so callers can use the same fail-closed shape check.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const data = require('./m016-s05-seven-division-replay-data');
const s03Data = require('./m016-s03-safe-probe-data');

const ROOT = path.resolve(__dirname, '..', '..');
const HASH_RE = /^[a-f0-9]{64}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SAFE_PATH_RE = /^runtime-evidence\/M016-S\d{2}-[A-Za-z0-9._/-]+\.json$/;
const PROHIBITED_METHOD_RE = /\b(?:POST|PUT|PATCH|DELETE|CONNECT|TRACE|OPTIONS)\b/i;
const ABSOLUTE_PATH_RE = /(?:^|[\s"'])\/(?:etc|private|tmp|Users|var|home)\//;
const LEAK_PATTERNS = Object.freeze([
  { kind: 'full_ids', pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i },
  { kind: 'credentials', pattern: /(?:api[_-]?key|access[_-]?token|bearer|password|secret)\s*[:=]\s*[^\s,;}]+/i },
  { kind: 'raw_body', pattern: /(?:raw[_-]?body|result_json\.result|response[_-]?body)/i },
  { kind: 'raw_reasoning', pattern: /(?:raw[_-]?reasoning|chain[_-]?of[_-]?thought|private[_-]?reasoning)/i },
  { kind: 'vendor_reuse_strings', pattern: /(?:xiaomi|mimo|vendor[_-]?reuse)/i },
  { kind: 'external_messages', pattern: /(?:send[_-]?message|outbound[_-]?message|external[_-]?message)/i },
]);
const REDACTION_KEYS = new Set([
  'full_ids', 'credentials', 'xiaomi_endpoint_reuse', 'synthetic_bos',
  'raw_reasoning', 'raw_body', 'raw_result_json_result', 'vendor_reuse_strings',
  'bounded_digests_only', 'redaction_bounds_loaded',
]);

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

function canonicalizeBundle(bundle) {
  if (!_isObject(bundle)) return null;
  const clone = _clone(bundle);
  delete clone.bundle_digest;
  delete clone.replay_keys;
  return _stableStringify(clone);
}

function computeBundleBodyDigest(bundle) {
  const canonical = canonicalizeBundle(bundle);
  return canonical === null ? null : sha256Hex(canonical);
}

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
    error.code = data.BLOCKER_CODES.PRODUCER_BUNDLE_MALFORMED();
    throw error;
  }
  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch (error) {
    const malformed = new Error('schema malformed JSON at ' + absolute + ': ' + error.message);
    malformed.code = data.BLOCKER_CODES.PRODUCER_BUNDLE_MALFORMED();
    throw malformed;
  }
  const ajv = _getAjv();
  let validate = null;
  if (ajv) {
    try {
      validate = ajv.compile(schema);
    } catch (error) {
      const invalid = new Error('schema failed to compile at ' + absolute + ': ' + error.message);
      invalid.code = data.BLOCKER_CODES.PRODUCER_BUNDLE_MALFORMED();
      throw invalid;
    }
  }
  const loaded = { schema, validate, path: absolute };
  schemaCache.set(absolute, loaded);
  return loaded;
}

function _recordSourceRef(record, partition) {
  if (typeof record.source_ref === 'string') return record.source_ref;
  if (partition === 'drill' || record.source_identity?.kind === 'scratch_drill') {
    return 'runtime-evidence/M016-S03-scratch-drill-results.json';
  }
  return 'runtime-evidence/M016-S03-live-probe-results.json';
}

function _criterionForRecord(record, kind) {
  if (kind === data.REPLAY_KINDS.DRILL_REPLAY_RECORD) return 'HG8 SCRATCH_ISOLATION';
  const roleEntry = s03Data.ROLE_REGISTRY.find((entry) => entry.role === record.role);
  return roleEntry?.gate ?? null;
}

function _deriveEvidenceId(probeId, index) {
  const slug = String(probeId || 'probe-' + index)
    .replace(/^M16-S03-PROBE-/, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'probe-' + index;
  return data.EVIDENCE_ID_PREFIX + slug;
}

function _safeRecordProjection(source, partition, index) {
  if (!_isObject(source)) return null;
  const kind = partition === 'drill'
    ? data.REPLAY_KINDS.DRILL_REPLAY_RECORD
    : data.REPLAY_KINDS.LIVE_REPLAY_RECORD;
  const probeId = source.probe_id || source.reused_probe_id;
  const criterionId = source.criterion_id || _criterionForRecord(source, kind);
  const sourceRef = _recordSourceRef(source, partition);
  const projection = {
    kind,
    role: source.role,
    role_class: source.role_class || 'infrastructure',
    classification: source.classification,
    independence_group: source.independence_group,
    reused_probe_id: probeId,
    evidence_id: source.evidence_id || _deriveEvidenceId(probeId, index),
    criterion_id: criterionId,
    method: source.method,
    command: source.command,
    started_at: source.started_at,
    finished_at: source.finished_at,
    duration_ms: source.duration_ms,
    scope: source.scope,
    limitations: source.limitations,
    source_identity: source.source_identity,
    isolation_invariant: source.isolation_invariant,
    mutation_audit: source.mutation_audit,
    redaction: source.redaction || source.redaction_posture,
    exit_code: source.exit_code,
    attempted_exit_code: source.attempted_exit_code,
    sanitised_digest: source.sanitised_digest,
    artifact_reference: source.artifact_reference,
    artifact_hash: source.artifact_hash,
    verdict: source.verdict,
    blocker_codes: source.blocker_codes || [],
    observed_blocker_code: source.observed_blocker_code,
    observed_blocker_reason: source.observed_blocker_reason,
    source_ref: sourceRef,
    source_record_digest: sha256Hex(_stableStringify(source)),
  };
  return Object.fromEntries(Object.entries(projection).filter(([, value]) => value !== undefined));
}

function _selectPartitionRecords(options) {
  if (Array.isArray(options.roleRecords) && Array.isArray(options.drillRecords)) {
    return [
      ...options.roleRecords.map((record) => ({ record, partition: 'role' })),
      ...options.drillRecords.map((record) => ({ record, partition: 'drill' })),
    ];
  }
  const records = Array.isArray(options.records) ? options.records : [];
  if (Array.isArray(options.roleMatrix) && Array.isArray(options.drillMatrix)) {
    const byProbe = new Map(records.map((record) => [record.probe_id || record.reused_probe_id, record]));
    const selected = [];
    for (const row of options.roleMatrix) selected.push({ record: byProbe.get(row.probe_id), partition: 'role', matrix: row });
    for (const row of options.drillMatrix) selected.push({ record: byProbe.get(row.probe_id), partition: 'drill', matrix: row });
    return selected;
  }
  return records.map((record, index) => ({ record, partition: index >= data.REPLAY_PARTITION.role_count ? 'drill' : 'role' }));
}

function normalizeReplayRecords(input = {}) {
  const selected = _selectPartitionRecords(input);
  if (selected.length !== data.RECORDS_BUDGET.total_records) {
    return {
      ok: false,
      code: data.BLOCKER_CODES.PRODUCER_RECORDS_NOT_NINETEEN(selected.length),
      reason: 'exactly 19 records are required',
      records: [],
    };
  }
  const records = [];
  for (let index = 0; index < selected.length; index += 1) {
    const item = selected[index];
    if (!_isObject(item.record)) {
      return { ok: false, code: data.BLOCKER_CODES.PRODUCER_BUNDLE_MALFORMED(), reason: 'record ' + index + ' is not an object', records: [] };
    }
    if (item.matrix && (item.matrix.role !== item.record.role || item.matrix.classification !== item.record.classification || item.matrix.probe_id !== item.record.probe_id)) {
      return { ok: false, code: data.BLOCKER_CODES.PRODUCER_RECORD_RECLASSIFIED(item.record.role || index), reason: 'matrix and record disagree', records: [] };
    }
    const projected = _safeRecordProjection(item.record, item.partition, index);
    if (!projected.role || !projected.classification || !projected.independence_group || !projected.reused_probe_id || !projected.criterion_id) {
      return { ok: false, code: data.BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('record-shape-' + index), reason: 'record lacks frozen identity fields', records: [] };
    }
    if (!data.isValidReplayKind(projected.kind)) {
      return { ok: false, code: data.BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('record-kind-' + index), reason: 'unknown replay record kind', records: [] };
    }
    records.push(projected);
  }
  return { ok: true, records };
}

const buildReplayRecords = normalizeReplayRecords;

function _sourceAllowed(sourceRef) {
  return typeof sourceRef === 'string'
    && SAFE_PATH_RE.test(sourceRef)
    && !sourceRef.includes('..')
    && data.SOURCE_ALLOWLIST_SET.has(sourceRef);
}

function checkRedactionSafety(payload) {
  const hits = [];
  const walk = (value, keyPath = '') => {
    if (typeof value === 'string') {
      for (const entry of LEAK_PATTERNS) {
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
          if (typeof child === 'boolean' && child === true && key !== 'bounded_digests_only' && key !== 'redaction_bounds_loaded') {
            hits.push({ kind: key, path: childPath });
          }
          continue;
        }
        walk(child, childPath);
      }
    }
  };
  walk(payload);
  if (_isObject(payload?.redaction_posture)) {
    for (const [key, canonical] of Object.entries(data.REPLAY_REDACTION_FLAG_VALUES)) {
      if (payload.redaction_posture[key] !== canonical) hits.push({ kind: key, path: 'redaction_posture.' + key });
    }
  }
  return hits;
}

function assertBundleWriteSafe(bundle) {
  const hits = checkRedactionSafety(bundle);
  if (hits.length > 0) {
    const error = new Error('refused write: redaction safety violation at ' + hits[0].path);
    error.code = data.BLOCKER_CODES.PRODUCER_REDACTION_LEAK(hits[0].kind);
    error.hits = hits;
    throw error;
  }
  return true;
}

function _validateRecord(record, index, seen) {
  if (!_isObject(record)) return data.BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('record-' + index);
  if (!data.isValidReplayKind(record.kind)) return data.BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('kind-' + index);
  if (!s03Data.isKnownRole(record.role)) return data.BLOCKER_CODES.PRODUCER_ROLE_NOT_IN_REGISTRY(record.role);
  if (!['EXECUTED', 'NOT_PROVEN'].includes(record.classification)) return data.BLOCKER_CODES.PRODUCER_RECORD_RECLASSIFIED(record.role);
  const roleEntry = s03Data.ROLE_REGISTRY.find((entry) => entry.role === record.role);
  if (roleEntry.independence_group !== record.independence_group) return data.BLOCKER_CODES.PRODUCER_CORRELATION_BROKEN('independence_group:' + record.role);
  if (!new RegExp(data.CORRELATION_PROBE_ID_PATTERN).test(record.reused_probe_id)) return data.BLOCKER_CODES.PRODUCER_CORRELATION_BROKEN('probe_id:' + index);
  if (!new RegExp(data.CORRELATION_EVIDENCE_ID_PATTERN).test(record.evidence_id)) return data.BLOCKER_CODES.PRODUCER_CORRELATION_BROKEN('evidence_id:' + index);
  if (!data.HARD_GATE_IDS_SET.has(record.criterion_id)) return data.BLOCKER_CODES.VALIDATOR_CORRELATION_CRITERION_UNKNOWN(record.criterion_id);
  const sourceKey = record.kind + ':' + record.reused_probe_id;
  const independenceKey = record.kind + ':' + record.independence_group;
  if (seen.probes.has(sourceKey)) return data.BLOCKER_CODES.VALIDATOR_CORRELATION_DUPLICATE('probe_id', record.reused_probe_id);
  if (seen.evidence.has(record.evidence_id)) return data.BLOCKER_CODES.VALIDATOR_CORRELATION_DUPLICATE('evidence_id', record.evidence_id);
  if (seen.independence.has(independenceKey)) return data.BLOCKER_CODES.PRODUCER_INDEPENDENCE_GROUP_REUSED(record.independence_group);
  if (!_sourceAllowed(record.source_ref)) return data.BLOCKER_CODES.PRODUCER_SOURCE_OUT_OF_ALLOWLIST(record.source_ref);
  if (!Array.isArray(record.limitations) || record.limitations.length === 0) return data.BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('limitations-' + index);
  if (!ISO_RE.test(record.started_at) || !ISO_RE.test(record.finished_at)) return data.BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('timestamps-' + index);
  if (!Number.isInteger(record.duration_ms) || record.duration_ms < 0 || record.duration_ms > 600000) return data.BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('duration-' + index);
  if (!Array.isArray(record.blocker_codes)) return data.BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('blocker-codes-' + index);
  if (record.classification === 'EXECUTED') {
    if (record.exit_code !== 0 || typeof record.sanitised_digest !== 'string' || !HASH_RE.test(record.artifact_hash)) return data.BLOCKER_CODES.PRODUCER_RECORD_RECLASSIFIED(record.role);
  } else if (!Number.isInteger(record.attempted_exit_code) || typeof record.observed_blocker_code !== 'string') {
    return data.BLOCKER_CODES.PRODUCER_RECORD_RECLASSIFIED(record.role);
  }
  if (record.kind === data.REPLAY_KINDS.DRILL_REPLAY_RECORD && record.source_identity?.kind !== 'scratch_drill') return data.BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('drill-source-' + record.role);
  if (record.kind === data.REPLAY_KINDS.DRILL_REPLAY_RECORD && record.isolation_invariant?.scratch_target_used !== true) return data.BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('drill-isolation-' + record.role);
  seen.probes.add(sourceKey);
  seen.evidence.add(record.evidence_id);
  seen.independence.add(independenceKey);
  return null;
}

function buildCorrelationContract(input = {}) {
  const records = Array.isArray(input.records) ? input.records : [];
  const seed = String(input.seed || 'canonical').replace(/[^A-Za-z0-9._-]+/g, '-');
  const agentRunId = data.AGENT_RUN_ID_PREFIX + (seed || 'canonical');
  if (!new RegExp(data.CORRELATION_AGENT_RUN_ID_PATTERN).test(agentRunId)) {
    return { ok: false, code: data.BLOCKER_CODES.PRODUCER_CORRELATION_BROKEN('agent_run_id'), reason: 'invalid agent_run_id' };
  }
  const seen = { probes: new Set(), evidence: new Set(), independence: new Set() };
  const probeToCriterion = [];
  const agentRunToProbe = [];
  const evidenceToCriterion = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const code = _validateRecord(record, index, seen);
    if (code) return { ok: false, code, reason: 'correlation contract rejected record ' + index };
    const exitCode = record.classification === 'EXECUTED' ? record.exit_code : record.attempted_exit_code;
    probeToCriterion.push({
      probe_id: record.reused_probe_id,
      agent_run_id: agentRunId,
      evidence_id: record.evidence_id,
      criterion_id: record.criterion_id,
      classification: record.classification,
      independence_group: record.independence_group,
      independence_key: record.kind + ':' + record.independence_group,
      weight: record.classification === 'EXECUTED' ? 1 : 0,
    });
    agentRunToProbe.push({
      agent_run_id: agentRunId,
      probe_id: record.reused_probe_id,
      started_at: record.started_at,
      finished_at: record.finished_at,
      duration_ms: record.duration_ms,
      exit_code: exitCode,
    });
    evidenceToCriterion.push({
      evidence_id: record.evidence_id,
      criterion_id: record.criterion_id,
      raw_state: record.classification,
      numeric_mapping: record.classification === 'EXECUTED' ? 1 : 0,
      source_ref: record.source_ref,
    });
  }
  return {
    ok: true,
    correlation_contract: {
      agent_run_id: agentRunId,
      probe_to_criterion: probeToCriterion,
      agent_run_to_probe: agentRunToProbe,
      evidence_to_criterion: evidenceToCriterion,
    },
  };
}

function buildEvidenceChain(input = {}) {
  const hashes = input.sourceHashes || {};
  const preHashes = input.preHashes || {};
  const postHashes = input.postHashes || {};
  const generated = input.generated || data.DEFAULTS.reference_time;
  const rows = data.SOURCE_ALLOWLIST.filter((source) => source.required).map((source) => {
    const fallback = sha256Hex(source.source_ref + '|' + generated);
    const pre = preHashes[source.chain_role] || hashes[source.chain_role] || fallback;
    const post = postHashes[source.chain_role] || hashes[source.chain_role] || pre;
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

function _gateState(records, gateId) {
  const covered = records.filter((record) => record.criterion_id === gateId || (gateId === 'HG8 SCRATCH_ISOLATION' && record.kind === data.REPLAY_KINDS.DRILL_REPLAY_RECORD));
  if (covered.length === 0) return 'not_proven';
  if (covered.some((record) => !['EXECUTED'].includes(record.classification))) return 'not_proven';
  if (covered.some((record) => record.isolation_invariant?.read_only_boundary_pass === false || record.mutation_audit?.business_mutations_recorded !== 0)) return 'fail_closed';
  return 'pass';
}

function _setGateState(map, gate, state) {
  const order = { pass: 0, not_proven: 1, fail_closed: 2 };
  if (order[state] > order[map[gate]]) map[gate] = state;
}

function buildEmbeddedClassification(input = {}) {
  const records = Array.isArray(input.records) ? input.records : [];
  const evidenceChain = Array.isArray(input.evidenceChain) ? input.evidenceChain : [];
  const redactionHits = Array.isArray(input.redactionHits) ? input.redactionHits : [];
  const correlationUnique = input.correlationUnique !== false;
  const replayMatch = input.replayMatch !== false;
  const rawInputImmutable = input.rawInputImmutable !== false;
  const gates = Object.fromEntries(data.HARD_GATE_IDS.map((gate) => [gate, _gateState(records, gate)]));
  if (evidenceChain.some((row) => row.unchanged !== true)) _setGateState(gates, 'HG2 PROVENANCE_INTEGRITY', 'fail_closed');
  if (!correlationUnique) _setGateState(gates, 'HG2 PROVENANCE_INTEGRITY', 'fail_closed');
  if (!rawInputImmutable) _setGateState(gates, 'HG2 PROVENANCE_INTEGRITY', 'fail_closed');
  if (!replayMatch) _setGateState(gates, 'HG2 PROVENANCE_INTEGRITY', 'fail_closed');
  if (redactionHits.length > 0) {
    _setGateState(gates, 'HG5 SECURITY_POSTURE', 'fail_closed');
    _setGateState(gates, 'HG6 COMPLIANCE_POSTURE', 'fail_closed');
  }
  if (records.some((record) => record.source_identity?.kind === 'paperclip_api_readonly' && record.isolation_invariant?.read_only_boundary_pass !== true)) {
    _setGateState(gates, 'HG7 READ_ONLY_BOUNDARY', 'fail_closed');
  }
  const allPass = Object.values(gates).every((state) => state === 'pass');
  const hasFailure = Object.values(gates).some((state) => state === 'fail_closed');
  const hasNotProven = Object.values(gates).some((state) => state === 'not_proven');
  const divisions = records.filter((record) => data.DIVISION_ROLES.includes(record.role));
  const executedDivisions = divisions.filter((record) => record.classification === 'EXECUTED').length;
  const orchestration = executedDivisions === data.DIVISION_ROLES.length
    ? 'PASS'
    : executedDivisions > 0 ? 'PARTIAL' : 'NOT_PROVEN';
  const evidence = hasFailure ? 'NOT_PROVEN' : allPass ? 'PASS' : hasNotProven ? 'PARTIAL' : 'PASS';
  const launch = allPass && replayMatch && correlationUnique && orchestration === 'PASS' && evidence === 'PASS'
    ? 'GO_BOUNDED_INTERNAL'
    : hasFailure ? 'NO_GO' : 'PREPARATION_ONLY';
  const canaryGates = {
    'SG1 SEVEN_DIVISION_COVERAGE': records.length === data.RECORDS_BUDGET.total_records && new Set(divisions.map((record) => record.role)).size === data.DIVISION_ROLES.length ? 'pass' : 'not_proven',
    'SG2 LAUNCH_VERDICT_FROZEN': data.isValidLaunchVerdict(launch) && !data.isForbiddenReplayVerdict(launch) ? 'pass' : 'fail_closed',
    'SG3 PRODUCER_PROVENANCE_OK': evidenceChain.length === data.MANDATORY_CHAIN_ROLES.length && evidenceChain.every((row) => row.unchanged === true) ? 'pass' : 'fail_closed',
    'SG4 VERIFIER_INDEPENDENCE': correlationUnique && replayMatch ? 'pass' : 'fail_closed',
  };
  return {
    evaluator: 'S05-seven-division-replay-contract',
    evaluator_version: 'v1',
    raw_state: hasFailure ? 'FAIL_CLOSED' : hasNotProven ? 'NOT_PROVEN' : 'EXECUTED',
    verdicts: { orchestration, evidence, launch },
    hard_gates: gates,
    replay_gates: canaryGates,
    bounded_internal_constraints: {
      offline_only: true,
      read_only: true,
      no_network_mutation: true,
      no_forbidden_verdict_promotion: launch !== 'GO_BOUNDED_INTERNAL' || allPass,
    },
  };
}

function _scoreForState(state) {
  return state === 'pass' ? 1 : state === 'not_proven' ? 0.5 : 0;
}

function buildScoringWorksheet(input = {}) {
  const classification = input.classification || buildEmbeddedClassification(input);
  const records = Array.isArray(input.records) ? input.records : [];
  const sourceRefs = [...new Set(records.map((record) => record.source_ref).filter(Boolean))];
  const rows = data.HARD_GATE_IDS.map((gate) => {
    const numericMapping = _scoreForState(classification.hard_gates[gate]);
    const weight = _round(1 / data.HARD_GATE_IDS.length);
    return {
      criterion_id: gate,
      raw_state: classification.hard_gates[gate],
      numeric_mapping: numericMapping,
      weight,
      contribution: _round(numericMapping * weight),
      rationale: data.HARD_GATE_LABELS[gate],
      source_refs: sourceRefs,
    };
  });
  const steps = [
    ['step_orchestration', records.filter((record) => data.DIVISION_ROLES.includes(record.role) && record.classification === 'EXECUTED').length / data.DIVISION_ROLES.length, 'division execution coverage'],
    ['step_evidence', rows.reduce((sum, row) => sum + row.numeric_mapping, 0) / rows.length, 'independent hard-gate evidence score'],
    ['step_launch', classification.verdicts.launch === 'GO_BOUNDED_INTERNAL' ? 1 : classification.verdicts.launch === 'PREPARATION_ONLY' ? 0.5 : 0, 'bounded launch verdict'],
  ].map(([step, numericMapping, rationale]) => ({
    step,
    raw_state: classification.verdicts[step === 'step_orchestration' ? 'orchestration' : step === 'step_evidence' ? 'evidence' : 'launch'],
    numeric_mapping: _round(numericMapping),
    weight: data.SCORING_WEIGHTS[step],
    contribution: _round(numericMapping * data.SCORING_WEIGHTS[step]),
    rationale,
    source_refs: sourceRefs,
  }));
  const score = _round(steps.reduce((sum, row) => sum + row.contribution, 0));
  return {
    schema_id: data.WORKSHEET_SCHEMA_ID,
    schema_version: data.WORKSHEET_SCHEMA_VERSION,
    worksheet_id: data.WORKSHEET_ID,
    worksheet_kind: data.WORKSHEET_KIND,
    milestone: data.MILESTONE,
    slice: data.SLICE,
    task: 'T01',
    generated: input.generated || data.DEFAULTS.reference_time,
    rows,
    steps,
    weight_sum: _round(rows.reduce((sum, row) => sum + row.weight, 0)),
    score,
    verdicts: classification.verdicts,
    replay_key: input.replayKey || sha256Hex(_stableStringify({ rows, steps, score })),
    blockers: [],
  };
}

function attachReplayKeys(input = {}) {
  const bundle = input.bundle || {};
  const firstDigest = input.firstRunProvenanceHash || computeBundleBodyDigest(bundle);
  const secondDigest = input.secondRunProvenanceHash || computeBundleBodyDigest(input.secondBundle || bundle);
  const byteIdentical = input.byteIdentical === undefined ? _stableStringify(bundle) === _stableStringify(input.secondBundle || bundle) : input.byteIdentical === true;
  return {
    first_run_provenance_hash: firstDigest,
    second_run_provenance_hash: secondDigest,
    match: firstDigest === secondDigest,
    byte_identical: byteIdentical,
    replay_key: sha256Hex(firstDigest + ':' + secondDigest + ':' + (input.referenceTime || data.DEFAULTS.reference_time)),
    verified_at: input.verifiedAt || data.DEFAULTS.reference_time,
  };
}

function buildInputInventory(input = {}) {
  const sources = Array.isArray(input.sources) ? input.sources : data.SOURCE_ALLOWLIST.filter((source) => source.required);
  return {
    schema_id: data.ADMISSION_SCHEMA_ID,
    schema_version: data.ADMISSION_SCHEMA_VERSION,
    inventory_id: 'm016-s05-seven-division-replay-input-inventory-v1',
    milestone: data.MILESTONE,
    slice: data.SLICE,
    generated: input.generated || data.DEFAULTS.reference_time,
    sources: sources.map((source) => ({
      source_ref: source.source_ref,
      kind: source.kind,
      required: source.required,
      pre_hash_sha256: source.pre_hash_sha256 || sha256Hex(source.source_ref + '|pre'),
      post_hash_sha256: source.post_hash_sha256 || source.pre_hash_sha256 || sha256Hex(source.source_ref + '|pre'),
      unchanged: source.unchanged === undefined ? true : source.unchanged === true,
      scope: 'offline-readonly',
    })),
    source_count: sources.length,
    raw_bodies_persisted: false,
    blockers: [],
  };
}

function buildProbeRunLedger(input = {}) {
  const records = Array.isArray(input.records) ? input.records : [];
  return {
    schema_id: data.PRODUCER_PROTOCOL_SCHEMA_ID,
    schema_version: data.PRODUCER_PROTOCOL_SCHEMA_VERSION,
    run_id: data.AGENT_RUN_ID_PREFIX + String(input.seed || 'canonical').replace(/[^A-Za-z0-9._-]+/g, '-'),
    generated: input.generated || data.DEFAULTS.reference_time,
    iterations: input.iterations || data.DEFAULTS.verify_iterations,
    record_count: records.length,
    exit_codes: records.map((record) => record.classification === 'EXECUTED' ? record.exit_code : record.attempted_exit_code),
    network_calls: 0,
    mutation_count: 0,
    replay_key: input.replayKey || sha256Hex(_stableStringify(records)),
    blockers: [],
  };
}

function buildAdmission(input = {}) {
  const generated = input.generated || data.DEFAULTS.reference_time;
  return {
    schema_id: data.ADMISSION_SCHEMA_ID,
    schema_version: data.ADMISSION_SCHEMA_VERSION,
    admission_id: data.ADMISSION_ID,
    admission_kind: data.ADMISSION_KIND,
    milestone: data.MILESTONE,
    slice: data.SLICE,
    task: 'T01',
    generated,
    operator_gate: {
      token: data.OPERATOR_GATE_TOKEN,
      confirmed: input.confirmed === true,
      confirmed_at: input.confirmed === true ? (input.confirmedAt || generated) : null,
    },
    source_refs: (input.sourceRefs || data.SOURCE_ALLOWLIST.filter((source) => source.required).map((source) => source.source_ref)),
    sanitised: true,
    raw_bodies_persisted: false,
    blockers: [],
    producer_line: data.PRODUCER_LINE_CLASS,
  };
}

function buildProducerProtocol(input = {}) {
  return {
    schema_id: data.PRODUCER_PROTOCOL_SCHEMA_ID,
    schema_version: data.PRODUCER_PROTOCOL_SCHEMA_VERSION,
    protocol_id: data.PRODUCER_PROTOCOL_ID,
    protocol_kind: data.PRODUCER_PROTOCOL_KIND,
    milestone: data.MILESTONE,
    slice: data.SLICE,
    task: data.PRODUCER_TASK_ID,
    generated: input.generated || data.DEFAULTS.reference_time,
    line_class: data.PRODUCER_LINE_CLASS,
    canonical_protocol: data.PRODUCER_CANONICAL_PROTOCOL,
    admission_ref: input.admissionRef || data.DEFAULTS.admission_output,
    input_inventory_ref: input.inputInventoryRef || data.DEFAULTS.input_inventory_output,
    probe_run_ref: input.probeRunRef || data.DEFAULTS.probe_run_output,
    bundle_ref: input.bundleRef || data.DEFAULTS.bundle_output,
    worksheet_ref: input.worksheetRef || data.DEFAULTS.worksheet_output,
    records_count: input.recordsCount ?? data.RECORDS_BUDGET.total_records,
    replay_keys: input.replayKeys || attachReplayKeys({ bundle: input.bundle || {} }),
    verdicts: input.verdicts || { orchestration: 'PARTIAL', evidence: 'PARTIAL', launch: 'PREPARATION_ONLY' },
    blockers: input.blockers || [],
  };
}

function buildVerifyProtocol(input = {}) {
  const replayKeys = input.replayKeys || attachReplayKeys({ bundle: input.bundle || {} });
  return {
    schema_id: data.VERIFY_PROTOCOL_SCHEMA_ID,
    schema_version: data.VERIFY_PROTOCOL_SCHEMA_VERSION,
    protocol_id: data.VERIFY_PROTOCOL_ID,
    protocol_kind: data.VERIFY_PROTOCOL_KIND,
    milestone: data.MILESTONE,
    slice: data.SLICE,
    task: data.VERIFIER_TASK_ID,
    generated: input.generated || data.DEFAULTS.reference_time,
    line_class: data.VERIFIER_LINE_CLASS,
    canonical_protocol: data.VERIFIER_CANONICAL_PROTOCOL,
    bundle_ref: input.bundleRef || data.DEFAULTS.bundle_output,
    iterations: input.iterations || data.DEFAULTS.verify_iterations,
    replay_keys: replayKeys,
    verifier_imports: ['scripts/lib/m016-s05-seven-division-replay-data.js', 'scripts/lib/m016-s05-seven-division-replay-contract.js'],
    producer_cli_imported: false,
    network_calls: 0,
    mutation_count: 0,
    verdicts: input.verdicts || { orchestration: 'PARTIAL', evidence: 'PARTIAL', launch: 'PREPARATION_ONLY' },
    blockers: input.blockers || [],
  };
}

function _pushBlocker(blockers, code, reason) {
  if (!blockers.some((entry) => entry.code === code)) blockers.push({ code, reason });
}

function _compareClaim(claimed, expected, pathName, blockers) {
  if (claimed === undefined) return;
  if (_stableStringify(claimed) !== _stableStringify(expected)) {
    _pushBlocker(blockers, data.BLOCKER_CODES.VALIDATOR_GATE_DERIVATION_DRIFT(pathName), pathName + ' does not match independent derivation');
  }
}

function _validateChain(chain, blockers) {
  if (!Array.isArray(chain) || chain.length !== data.MANDATORY_CHAIN_ROLES.length) {
    _pushBlocker(blockers, data.BLOCKER_CODES.PRODUCER_EVIDENCE_CHAIN_BROKEN('mandatory-rows'), 'mandatory evidence chain rows are missing');
    return;
  }
  const seenRoles = new Set();
  for (const row of chain) {
    const source = data.SOURCE_ALLOWLIST.find((entry) => entry.chain_role === row.chain_role);
    if (!source || !_sourceAllowed(row.source_ref)) _pushBlocker(blockers, data.BLOCKER_CODES.PRODUCER_SOURCE_OUT_OF_ALLOWLIST(row.source_ref), 'source ref is outside the frozen allowlist');
    if (seenRoles.has(row.chain_role)) _pushBlocker(blockers, data.BLOCKER_CODES.PRODUCER_EVIDENCE_CHAIN_BROKEN(row.chain_role), 'duplicate chain role');
    seenRoles.add(row.chain_role);
    if (!HASH_RE.test(row.pre_hash_sha256) || !HASH_RE.test(row.post_hash_sha256) || row.unchanged !== (row.pre_hash_sha256 === row.post_hash_sha256)) {
      _pushBlocker(blockers, data.BLOCKER_CODES.PRODUCER_EVIDENCE_CHAIN_BROKEN(row.chain_role || 'hash'), 'pre/post hash equality is invalid');
    }
  }
  for (const role of data.MANDATORY_CHAIN_ROLES) if (!seenRoles.has(role)) _pushBlocker(blockers, data.BLOCKER_CODES.PRODUCER_EVIDENCE_CHAIN_BROKEN(role), 'mandatory chain role missing');
}

function _validateBundleBasics(bundle, blockers) {
  if (!_isObject(bundle)) {
    _pushBlocker(blockers, data.BLOCKER_CODES.PRODUCER_BUNDLE_MALFORMED(), 'bundle must be an object');
    return;
  }
  if (bundle.schema_id !== data.SCHEMA_ID) _pushBlocker(blockers, data.BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('schema_id'), 'schema_id is not canonical');
  if (bundle.schema_version !== data.SCHEMA_VERSION) _pushBlocker(blockers, data.BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('schema_version'), 'schema_version is not canonical');
  if (bundle.bundle_id !== data.BUNDLE_ID || bundle.bundle_kind !== data.BUNDLE_KIND) _pushBlocker(blockers, data.BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('identity'), 'bundle identity is not canonical');
  if (bundle.milestone !== data.MILESTONE || bundle.slice !== data.SLICE) _pushBlocker(blockers, data.BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('scope'), 'bundle scope is not canonical');
  if (!ISO_RE.test(bundle.generated)) _pushBlocker(blockers, data.BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('generated'), 'generated must be a bounded ISO timestamp');
}

function validateBundleShape(bundle, schemaValidate) {
  if (!_isObject(bundle)) return { ok: false, errors: [{ instancePath: '', message: 'must be an object' }] };
  if (typeof schemaValidate === 'function') {
    const ok = schemaValidate(bundle);
    return { ok: !!ok, errors: schemaValidate.errors || [] };
  }
  return { ok: true, errors: [] };
}

function evaluateReplayContract(input = {}) {
  const bundle = input.bundle;
  const blockers = [];
  const normalized = Array.isArray(input.records)
    ? { ok: true, records: input.records }
    : bundle && Array.isArray(bundle.records)
      ? { ok: true, records: bundle.records }
      : normalizeReplayRecords(input);
  if (!normalized.ok) _pushBlocker(blockers, normalized.code, normalized.reason);
  const records = normalized.records || [];
  if (records.length !== data.RECORDS_BUDGET.total_records) _pushBlocker(blockers, data.BLOCKER_CODES.PRODUCER_RECORDS_NOT_NINETEEN(records.length), 'record count must be exactly 19');
  const roleRecords = records.filter((record) => record.kind === data.REPLAY_KINDS.LIVE_REPLAY_RECORD);
  const drillRecords = records.filter((record) => record.kind === data.REPLAY_KINDS.DRILL_REPLAY_RECORD);
  if (roleRecords.length !== data.RECORDS_BUDGET.role_records) _pushBlocker(blockers, data.BLOCKER_CODES.PRODUCER_RECORDS_NOT_NINETEEN(roleRecords.length), 'role partition must contain exactly 16 records');
  if (drillRecords.length !== data.RECORDS_BUDGET.drill_records) _pushBlocker(blockers, data.BLOCKER_CODES.PRODUCER_RECORDS_NOT_NINETEEN(drillRecords.length), 'drill partition must contain exactly 3 records');
  for (const division of data.DIVISION_ROLES) {
    if (!roleRecords.some((record) => record.role === division)) _pushBlocker(blockers, data.BLOCKER_CODES.PRODUCER_DIVISION_COVERAGE_MISSING(division), 'division coverage missing');
  }
  const seenRoles = new Set(roleRecords.map((record) => record.role));
  for (const role of data.DIVISION_ROLES.concat(data.INFRASTRUCTURE_ROLES)) if (!seenRoles.has(role)) _pushBlocker(blockers, data.BLOCKER_CODES.PRODUCER_ROLE_NOT_IN_REGISTRY(role), 'role matrix coverage missing');
  for (let index = 0; index < records.length; index += 1) {
    const code = _validateRecord(records[index], index, { probes: new Set(), evidence: new Set(), independence: new Set() });
    if (code && !blockers.some((entry) => entry.code === code)) _pushBlocker(blockers, code, 'record validation failed at index ' + index);
  }
  const derivedCorrelationResult = buildCorrelationContract({ records, seed: input.seed || 'canonical' });
  if (!derivedCorrelationResult.ok) _pushBlocker(blockers, derivedCorrelationResult.code, derivedCorrelationResult.reason);
  const correlationResult = input.correlationContract
    ? { ok: true, correlation_contract: input.correlationContract }
    : bundle?.correlation_contract
      ? { ok: true, correlation_contract: bundle.correlation_contract }
      : derivedCorrelationResult;
  if (!correlationResult.ok) _pushBlocker(blockers, correlationResult.code, correlationResult.reason);
  const correlation = correlationResult.correlation_contract || {};
  const correlationProbeRows = Array.isArray(correlation.probe_to_criterion) ? correlation.probe_to_criterion : [];
  const correlationUnique = correlationProbeRows.length === records.length
    && new Set(correlationProbeRows.map((row) => row.probe_id)).size === records.length
    && new Set(correlationProbeRows.map((row) => row.evidence_id)).size === records.length
    && new Set(correlationProbeRows.map((row) => row.independence_key)).size === records.length;
  if (!correlationUnique) _pushBlocker(blockers, data.BLOCKER_CODES.VALIDATOR_CORRELATION_DUPLICATE('contract', 'non-unique'), 'correlation rows are not unique');
  if (!new RegExp(data.CORRELATION_AGENT_RUN_ID_PATTERN).test(String(correlation.agent_run_id || ''))) {
    _pushBlocker(blockers, data.BLOCKER_CODES.VALIDATOR_CORRELATION_AGENT_RUN_MISSING(), 'agent_run_id is missing or outside the replay namespace');
  }
  const recordsByProbe = new Map(records.map((record) => [record.reused_probe_id, record]));
  for (const row of correlationProbeRows) {
    const sourceRecord = recordsByProbe.get(row.probe_id);
    if (!sourceRecord) {
      _pushBlocker(blockers, data.BLOCKER_CODES.VALIDATOR_CORRELATION_PROBE_NOT_IN_S03(row.probe_id), 'correlation probe is not present in records');
      continue;
    }
    if (row.evidence_id !== sourceRecord.evidence_id || row.criterion_id !== sourceRecord.criterion_id || row.independence_group !== sourceRecord.independence_group || row.independence_key !== sourceRecord.kind + ':' + sourceRecord.independence_group) {
      _pushBlocker(blockers, data.BLOCKER_CODES.VALIDATOR_CORRELATION_INDEPENDENCE_GROUP_UNKNOWN(row.independence_group || 'missing'), 'correlation row does not match the immutable record');
    }
  }
  const chain = input.evidenceChain || bundle?.evidence_chain || buildEvidenceChain({ generated: input.generated || bundle?.generated }).evidence_chain;
  _validateChain(chain, blockers);
  const redactionPayload = input.redactionPosture || bundle?.redaction_posture || data.REPLAY_REDACTION_FLAG_VALUES;
  const redactionHits = checkRedactionSafety({ redaction_posture: redactionPayload, records });
  if (redactionHits.length > 0) _pushBlocker(blockers, data.BLOCKER_CODES.PRODUCER_REDACTION_LEAK(redactionHits[0].kind), 'redaction posture or record payload is unsafe');
  for (const record of records) {
    if (PROHIBITED_METHOD_RE.test(String(record.method || '')) || PROHIBITED_METHOD_RE.test(String(record.command || ''))) _pushBlocker(blockers, data.BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('mutation-method-' + record.role), 'mutation method found in replay record');
    if (ABSOLUTE_PATH_RE.test(String(record.command || ''))) _pushBlocker(blockers, data.BLOCKER_CODES.VALIDATOR_PATH_TRAVERSAL(record.role), 'absolute path found in replay command');
  }
  const replayKeys = input.replayKeys || bundle?.replay_keys || attachReplayKeys({ bundle: bundle || { records, evidence_chain: chain } });
  if (replayKeys.match !== true || replayKeys.byte_identical !== true || replayKeys.first_run_provenance_hash !== replayKeys.second_run_provenance_hash) {
    _pushBlocker(blockers, data.BLOCKER_CODES.PRODUCER_REPLAY_NOT_BYTE_IDENTICAL(), 'replay key mismatch');
  }
  if (HASH_RE.test(replayKeys.first_run_provenance_hash || '') && HASH_RE.test(replayKeys.second_run_provenance_hash || '')) {
    const expectedReplayKey = sha256Hex(replayKeys.first_run_provenance_hash + ':' + replayKeys.second_run_provenance_hash + ':' + (bundle?.generated || input.generated || data.DEFAULTS.reference_time));
    if (replayKeys.replay_key !== expectedReplayKey) _pushBlocker(blockers, data.BLOCKER_CODES.VALIDATOR_REPLAY_DRIFT(), 'replay_key does not match the two provenance hashes');
  }
  const classification = buildEmbeddedClassification({
    records,
    evidenceChain: chain,
    redactionHits,
    correlationUnique,
    replayMatch: replayKeys.match === true && replayKeys.byte_identical === true,
    rawInputImmutable: bundle?.raw_input_immutability_verified !== false,
  });
  const worksheet = buildScoringWorksheet({ records, classification, generated: input.generated || bundle?.generated });
  if (bundle) {
    _validateBundleBasics(bundle, blockers);
    if (bundle.bundle_digest && bundle.bundle_digest !== computeBundleBodyDigest(bundle)) _pushBlocker(blockers, data.BLOCKER_CODES.VALIDATOR_REPLAY_DRIFT(), 'bundle digest does not match canonical body');
    _compareClaim(bundle.embedded_classification?.hard_gates, classification.hard_gates, 'hard_gates', blockers);
    _compareClaim(bundle.embedded_classification?.verdicts, classification.verdicts, 'verdicts', blockers);
    if (bundle.scoring_worksheet) {
      if (bundle.scoring_worksheet.weight_sum !== worksheet.weight_sum) _pushBlocker(blockers, data.BLOCKER_CODES.PRODUCER_GATE_WEIGHT_SUM_INVALID(), 'worksheet weight_sum drift');
      if (bundle.scoring_worksheet.score !== worksheet.score) _pushBlocker(blockers, data.BLOCKER_CODES.PRODUCER_SCORE_OUT_OF_RANGE(String(bundle.scoring_worksheet.score)), 'worksheet score drift');
      const claimedRows = Array.isArray(bundle.scoring_worksheet.rows) ? bundle.scoring_worksheet.rows : [];
      for (let index = 0; index < worksheet.rows.length; index += 1) {
        const expectedRow = worksheet.rows[index];
        const claimedRow = claimedRows[index];
        if (!claimedRow) continue;
        if (claimedRow.weight !== expectedRow.weight) _pushBlocker(blockers, data.BLOCKER_CODES.PRODUCER_GATE_WEIGHT_INVALID(expectedRow.criterion_id), 'worksheet gate weight drift');
        if (claimedRow.contribution !== expectedRow.contribution) _pushBlocker(blockers, data.BLOCKER_CODES.PRODUCER_CONTRIBUTION_OUT_OF_RANGE(expectedRow.criterion_id), 'worksheet contribution drift');
      }
    }
    if (bundle.redaction_posture && _stableStringify(bundle.redaction_posture) !== _stableStringify(data.REPLAY_REDACTION_FLAG_VALUES)) _pushBlocker(blockers, data.BLOCKER_CODES.PRODUCER_REDACTION_LEAK('posture'), 'redaction posture drift');
    if (Array.isArray(bundle.blockers) && bundle.blockers.length > 0) _pushBlocker(blockers, data.BLOCKER_CODES.VALIDATOR_SCHEMA_VIOLATION('embedded-blockers'), 'canonical bundle carries blockers');
    const claimedVerdicts = bundle.embedded_classification?.verdicts || {};
    for (const verdict of Object.values(claimedVerdicts)) {
      if (data.isForbiddenReplayVerdict(verdict)) _pushBlocker(blockers, data.BLOCKER_CODES.PRODUCER_FORBIDDEN_CANARY_VERDICT(verdict), 'forbidden canary verdict token');
    }
    if (claimedVerdicts.launch === 'GO_BOUNDED_INTERNAL' && classification.verdicts.launch !== 'GO_BOUNDED_INTERNAL') _pushBlocker(blockers, data.BLOCKER_CODES.VALIDATOR_LAUNCH_PROMOTION_DETECTED(claimedVerdicts.launch), 'launch verdict promotion detected');
    const runSchema = input.runSchema === undefined ? input.options?.runSchema !== false : input.runSchema !== false;
    if (runSchema) {
      try {
        const loaded = loadSchema(data.DEFAULTS.schema_path);
        const shape = validateBundleShape(bundle, loaded.validate);
        if (!shape.ok) _pushBlocker(blockers, data.BLOCKER_CODES.VALIDATOR_SCHEMA_VIOLATION('bundle'), 'bundle JSON Schema rejected the object');
      } catch (error) {
        _pushBlocker(blockers, error.code || data.BLOCKER_CODES.VALIDATOR_SCHEMA_VIOLATION('schema'), error.message);
      }
    }
  }
  const result = {
    ok: blockers.length === 0,
    verdict: blockers.length === 0 ? 'pass' : 'fail_closed',
    exit_code: blockers.length === 0 ? data.EXIT_CODES.REPLAY_PASS : mapBlockerToExitCode(blockers[0].code),
    blockers,
    records,
    correlation_contract: correlation,
    evidence_chain: chain,
    embedded_classification: classification,
    scoring_worksheet: worksheet,
    replay_keys: replayKeys,
    redaction_hits: redactionHits,
  };
  return result;
}

const evaluateSevenDivisionReplay = evaluateReplayContract;
const evaluateS05Contract = evaluateReplayContract;

function mapBlockerToExitCode(blockerCode) {
  if (typeof blockerCode !== 'string') return data.EXIT_CODES.REPLAY_RUNNER_FAILURE;
  if (/OPERATOR-GATE|BUNDLE-INVALID|BUNDLE-MALFORMED|RECORDS-NOT-NINETEEN|SCHEMA-VIOLATION/.test(blockerCode)) return data.EXIT_CODES.REPLAY_REJECTED_MALFORMED;
  if (/RECLASSIFIED|DIVISION-COVERAGE|ROLE-NOT-IN-REGISTRY|DRILL-NOT-IN-REGISTRY|CLASSIFICATION/.test(blockerCode)) return data.EXIT_CODES.REPLAY_CLASSIFICATION_DRIFT;
  if (/LAUNCH-PROMOTION|FORBIDDEN/.test(blockerCode)) return data.EXIT_CODES.REPLAY_LAUNCH_PROMOTION;
  if (/REDACTION/.test(blockerCode)) return data.EXIT_CODES.REPLAY_REDACTION_LEAK;
  if (/REPLAY/.test(blockerCode)) return data.EXIT_CODES.REPLAY_REPLAY_DRIFT;
  if (/SOURCE|HASH|EVIDENCE|CORRELATION|INDEPENDENCE|PATH|PROVENANCE/.test(blockerCode)) return data.EXIT_CODES.REPLAY_PROVENANCE_DRIFT;
  return data.EXIT_CODES.REPLAY_RUNNER_FAILURE;
}

module.exports = {
  loadSchema,
  validateBundleShape,
  sha256Hex,
  _stableStringify,
  canonicalizeBundle,
  computeBundleBodyDigest,
  checkRedactionSafety,
  assertBundleWriteSafe,
  normalizeReplayRecords,
  buildReplayRecords,
  buildCorrelationContract,
  buildEmbeddedClassification,
  buildEvidenceChain,
  buildScoringWorksheet,
  attachReplayKeys,
  buildInputInventory,
  buildProbeRunLedger,
  buildAdmission,
  buildProducerProtocol,
  buildVerifyProtocol,
  evaluateReplayContract,
  evaluateSevenDivisionReplay,
  evaluateS05Contract,
  mapBlockerToExitCode,
};
