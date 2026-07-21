#!/usr/bin/env node
'use strict';

/**
 * scripts/lib/m016-s06-proof-reconciliation-contract.js
 *
 * M016-txa3vu / S06 / T01 — Pure contract logic for the proof
 * reconciliation / replay gate. The module intentionally has no
 * subprocesses, no network calls, no runtime-evidence writes; `loadSchema`
 * only reads the requested JSON schema so callers can use the same
 * fail-closed shape check. T02 verifier (`verify_m016_s06_proof_reconciliation.js`)
 * is the only consumer that performs subprocesses + atomic writes.
 *
 * Helper surface:
 *
 *   - sha256Hex, _stableStringify, canonicalizeReconciliation,
 *     computeReconciliationDigest
 *   - resolveAjv, loadSchema, validateReconciliationShape, validateLedgerShape
 *   - checkRedactionSafety, assertReconciliationWriteSafe
 *   - evaluateM015Baseline, deriveM015VerdictField, deriveM015Key
 *   - buildCriterionDiff, buildCapabilityAudit,
 *     buildCapabilityActionLedgerSidecar
 *   - buildRecommendation
 *   - buildReconciliationSidecar, evaluateReconciliationContract
 *   - mapBlockerToExitCode
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const data = require('./m016-s06-proof-reconciliation-data');

// ---------------------------------------------------------------------------
// Constants / regexes
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '..', '..');
const HASH_RE = /^[a-f0-9]{64}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SAFE_RUNTIME_PATH_RE = /^runtime-evidence\/M016-S\d{2}-[A-Za-z0-9._/-]+\.json$/;
const SAFE_LEDGER_PATH_RE = /^plugin-bos-light\/[A-Za-z0-9._/-]+\.json$/;
const TIMESTAMP_KEYS = new Set([
  'generated', 'reference_time', 'generated_at', 'verified_at',
  'completed_at', 'captured_at', 'started_at', 'finished_at',
]);

const REDACTION_KEYS = new Set([
  'full_ids', 'credentials', 'xiaomi_endpoint_reuse', 'synthetic_bos',
  'raw_reasoning', 'raw_body', 'raw_result_json_result', 'vendor_reuse_strings',
  'bounded_digests_only', 'redaction_bounds_loaded',
]);

// LEAK_PATTERNS covers material that must NEVER appear anywhere outside
// the documented redaction posture flags. The vendor/xiaomi tokens are
// checked via the redaction_posture.xiaomi_endpoint_reuse and
// redaction_posture.vendor_reuse_strings flag enforcement (see
// checkRedactionSafety below), so the body walk does NOT also flag the
// literal "xiaomi"/"mimo" tokens — the capability ledger legitimately
// records those names as capability_key / paperclip_surface_name.
const LEAK_PATTERNS = Object.freeze([
  { kind: 'full_ids', pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i },
  { kind: 'credentials', pattern: /(?:api[_-]?key|access[_-]?token|bearer|password|secret)\s*[:=]\s*[^\s,;}]+/i },
  { kind: 'raw_body', pattern: /(?:raw[_-]?body|result_json\.result|response[_-]?body)/i },
  { kind: 'raw_reasoning', pattern: /(?:raw[_-]?reasoning|chain[_-]?of[_-]?thought|private[_-]?reasoning)/i },
  { kind: 'authorization_header', pattern: /\bauthorization\s*:\s*bearer\s+[A-Za-z0-9._~+/=-]{8,}/i },
  { kind: 'paperclip_base_url', pattern: /paperclip\.[a-z]+\.com/i },
]);

const AJV_CANDIDATE_REQUIRES = Object.freeze([
  () => {
    try { return require('ajv'); } catch (error) { return null; }
  },
  () => {
    try { return require(path.join(ROOT, 'plugin-bos-light', 'node_modules', 'ajv')); } catch (error) { return null; }
  },
  () => {
    try { return require(path.join(ROOT, 'node_modules', 'ajv')); } catch (error) { return null; }
  },
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

function _round(value, digits) {
  const factor = 10 ** (digits === undefined ? 6 : digits);
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

function canonicalizeReconciliation(reconciliation) {
  if (!_isObject(reconciliation)) return null;
  const clone = _clone(reconciliation);
  delete clone.byte_digest;
  return _stableStringify(clone);
}

function computeReconciliationBodyDigest(reconciliation) {
  const canonical = canonicalizeReconciliation(reconciliation);
  return canonical === null ? null : sha256Hex(canonical);
}

function canonicalizeLedger(ledger) {
  if (!_isObject(ledger)) return null;
  const clone = _clone(ledger);
  delete clone.byte_digest;
  return _stableStringify(clone);
}

function computeLedgerBodyDigest(ledger) {
  const canonical = canonicalizeLedger(ledger);
  return canonical === null ? null : sha256Hex(canonical);
}

// ---------------------------------------------------------------------------
// Ajv loader (lazy, scoped, fail-safe). The contract uses Ajv ONLY to compile
// the bundled JSON schemas; missing Ajv means caller-side validation must be
// done elsewhere — the contract still serves builders/safety checks.
// ---------------------------------------------------------------------------

let ajvInstance = null;

function resolveAjv() {
  if (ajvInstance !== null) return ajvInstance;
  for (const candidate of AJV_CANDIDATE_REQUIRES) {
    const mod = candidate();
    if (mod) {
      const AjvClass = (mod.default && typeof mod.default === 'function') ? mod.default : mod;
      if (typeof AjvClass === 'function' && typeof AjvClass.prototype.compile === 'function') {
        try {
          ajvInstance = new AjvClass({ allErrors: true, strict: false });
        } catch (error) {
          ajvInstance = null;
          break;
        }
        return ajvInstance;
      }
    }
  }
  ajvInstance = false; // sentinel — Ajv unavailable
  return null;
}

const schemaCache = new Map();

function loadSchema(schemaPath) {
  const absolute = path.isAbsolute(schemaPath) ? schemaPath : path.join(ROOT, schemaPath);
  if (schemaCache.has(absolute)) return schemaCache.get(absolute);
  if (!fs.existsSync(absolute)) {
    const error = new Error('schema missing at ' + absolute);
    error.code = data.BLOCKER_CODES.SCHEMA_VIOLATION('schema-missing');
    throw error;
  }
  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch (error) {
    const malformed = new Error('schema malformed JSON at ' + absolute + ': ' + error.message);
    malformed.code = data.BLOCKER_CODES.SCHEMA_VIOLATION('schema-malformed');
    throw malformed;
  }
  const ajv = resolveAjv();
  let validate = null;
  if (ajv) {
    try {
      validate = ajv.compile(schema);
    } catch (error) {
      const invalid = new Error('schema failed to compile at ' + absolute + ': ' + error.message);
      invalid.code = data.BLOCKER_CODES.SCHEMA_VIOLATION('schema-compile');
      throw invalid;
    }
  }
  const loaded = { schema, validate, path: absolute, ajvAvailable: !!ajv };
  schemaCache.set(absolute, loaded);
  return loaded;
}

function validateReconciliationShape(reconciliation, schemaValidate) {
  if (!_isObject(reconciliation)) return { ok: false, errors: [{ instancePath: '', message: 'must be an object' }] };
  if (typeof schemaValidate === 'function') {
    const ok = schemaValidate(reconciliation);
    return { ok: !!ok, errors: schemaValidate.errors || [] };
  }
  return { ok: true, errors: [], deferred: true };
}

function validateLedgerShape(ledger, schemaValidate) {
  if (!_isObject(ledger)) return { ok: false, errors: [{ instancePath: '', message: 'must be an object' }] };
  if (typeof schemaValidate === 'function') {
    const ok = schemaValidate(ledger);
    return { ok: !!ok, errors: schemaValidate.errors || [] };
  }
  return { ok: true, errors: [], deferred: true };
}

// ---------------------------------------------------------------------------
// Redaction safety
// ---------------------------------------------------------------------------

function checkRedactionSafety(payload) {
  const hits = [];
  const walk = (value, keyPath) => {
    if (keyPath === undefined) keyPath = '';
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
    for (const [key, expected] of Object.entries(data.RECONCILE_REDACTION_FLAG_VALUES)) {
      if (payload.redaction_posture[key] !== expected) hits.push({ kind: key, path: 'redaction_posture.' + key });
    }
  }
  return hits;
}

function assertReconciliationWriteSafe(reconciliation) {
  const hits = checkRedactionSafety(reconciliation);
  if (hits.length > 0) {
    const error = new Error('refused write: redaction safety violation at ' + hits[0].path);
    error.code = data.BLOCKER_CODES.SECRET_TOKEN(hits[0].kind);
    error.hits = hits;
    throw error;
  }
  return true;
}

function assertLedgerWriteSafe(ledger) {
  const hits = checkRedactionSafety(ledger);
  if (hits.length > 0) {
    const error = new Error('refused write: redaction safety violation at ' + hits[0].path);
    error.code = data.BLOCKER_CODES.SECRET_TOKEN(hits[0].kind);
    error.hits = hits;
    throw error;
  }
  return true;
}

// ---------------------------------------------------------------------------
// M015 baseline helpers
// ---------------------------------------------------------------------------

function deriveM015Key(mapping) {
  if (typeof mapping.m015_field !== 'string') return null;
  const parts = mapping.m015_field.split('.').filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length !== 2 || parts[0] !== 'verdict') return null;
  return parts[1];
}

function deriveM015VerdictField(m015Baseline, mapping) {
  const key = deriveM015Key(mapping);
  if (!key) return null;
  const verdict = m015Baseline && m015Baseline.verdict;
  if (!_isObject(verdict)) return null;
  return verdict[key];
}

function _classifyM015FieldValue(value) {
  if (value === data.M015_VERDICT_FIELD_VALUES.PASS) return 'PROVEN';
  if (value === data.M015_VERDICT_FIELD_VALUES.FAIL) return 'REGRESSED';
  if (value === data.M015_VERDICT_FIELD_VALUES.NOT_PROVEN_MISSING_RESULT_JSON_BOS) return 'NOT_PROVEN';
  if (value === data.M015_VERDICT_FIELD_VALUES.BOOLEAN_FALSE) return 'NOT_REQUIRED';
  if (value === data.M015_VERDICT_FIELD_VALUES.BOOLEAN_TRUE) return 'REQUIRED';
  return 'UNRECOGNISED';
}

function _expectedStateMatch(expected, observedState) {
  if (expected === 'PROVEN') return observedState === 'PROVEN';
  if (expected === 'NOT_PROVEN') return observedState === 'NOT_PROVEN';
  if (expected === 'NOT_REQUIRED') return observedState === 'NOT_REQUIRED';
  return false;
}

function _booleanScore(state) {
  if (state === 'PROVEN') return 1;
  if (state === 'NOT_PROVEN') return 0;
  if (state === 'NOT_REQUIRED') return 1;
  return 0;
}

function evaluateM015Baseline(m015Baseline, sourceHashes = {}) {
  const m015Verdicts = [];
  let aggregateScore = 0;
  for (const mapping of data.M015_CRITERION_MAPPING) {
    const rawValue = deriveM015VerdictField(m015Baseline || {}, mapping);
    const observedState = _classifyM015FieldValue(rawValue);
    const pass = _expectedStateMatch(mapping.m015_expected_state, observedState);
    const refValue = sourceHashes[mapping.m015_verdict_value_refs[0]] || '';
    m015Verdicts.push({
      criterion_id: mapping.criterion_id,
      m015_field: mapping.m015_field,
      m015_expected_state: mapping.m015_expected_state,
      m015_observed_value: rawValue,
      m015_observed_state: observedState,
      m015_pass_against_expected: pass,
      source_ref: mapping.m015_verdict_value_refs[0],
      source_sha256: HASH_RE.test(refValue) ? refValue : '',
    });
    aggregateScore += _booleanScore(observedState);
  }
  return {
    m015_verdicts: m015Verdicts,
    m015_score: _round(aggregateScore / data.M015_CRITERION_MAPPING.length),
    m015_all_pass_against_expected: m015Verdicts.every((row) => row.m015_pass_against_expected),
  };
}

// ---------------------------------------------------------------------------
// M016 source-ref back refs — collect and bound
// ---------------------------------------------------------------------------

function _uniqueSourceRefs(refs) {
  const seen = new Set();
  const out = [];
  for (const ref of refs || []) {
    if (typeof ref !== 'string') continue;
    if (SAFE_RUNTIME_PATH_RE.test(ref) || SAFE_LEDGER_PATH_RE.test(ref)) {
      if (!seen.has(ref)) { seen.add(ref); out.push(ref); }
    }
  }
  return out.slice(0, data.DEFAULTS.max_source_refs_per_criterion);
}

function _backRefCountForCriterion(mapping, independentRefs) {
  // Back refs are M016 source_refs that are independent of M015's own
  // source_ref (i.e. not the first value_ref in mapping).
  const excluded = new Set(mapping.m015_verdict_value_refs.slice(0, 1));
  return independentRefs.filter((ref) => !excluded.has(ref)).length;
}

// ---------------------------------------------------------------------------
// Criterion diff builder
// ---------------------------------------------------------------------------

function buildCriterionDiff(input) {
  const m015Evaluation = input.m015Evaluation || evaluateM015Baseline(input.m015Baseline || {}, input.sourceHashes || {});
  const m016IndependentRefs = _uniqueSourceRefs(input.m016IndependentRefs || []);
  const criterionDiff = [];
  let passThroughCount = 0;
  let promotionRefusedCount = 0;
  for (const mapping of data.M015_CRITERION_MAPPING) {
    const backRefCount = _backRefCountForCriterion(mapping, m016IndependentRefs);
    const passThrough = mapping.m015_expected_state !== 'NOT_PROVEN'
      && m015Evaluation.m015_verdicts.find((row) => row.criterion_id === mapping.criterion_id)?.m015_pass_against_expected === true
      && backRefCount >= mapping.m016_required_back_refs;
    const m016Verdict = passThrough
      ? 'PASS'
      : mapping.m015_expected_state === 'NOT_PROVEN'
        ? 'NOT_PROVEN'
        : mapping.m015_expected_state === 'NOT_REQUIRED'
          ? 'NOT_REQUIRED'
          : 'NOT_PROVEN';
    if (passThrough) passThroughCount += 1;
    const backRefs = m016IndependentRefs.filter((ref) => !mapping.m015_verdict_value_refs.slice(0, 1).includes(ref)).slice(0, data.DEFAULTS.max_source_refs_per_criterion);
    if (mapping.m015_expected_state === 'PROVEN' && m015Evaluation.m015_verdicts.find((row) => row.criterion_id === mapping.criterion_id)?.m015_pass_against_expected === true && !passThrough) {
      promotionRefusedCount += 1;
    }
    criterionDiff.push({
      criterion_id: mapping.criterion_id,
      label: mapping.label,
      m015_field: mapping.m015_field,
      m015_expected_state: mapping.m015_expected_state,
      m015_observed_state: m015Evaluation.m015_verdicts.find((row) => row.criterion_id === mapping.criterion_id)?.m015_observed_state || 'UNRECOGNISED',
      m015_observed_value: m015Evaluation.m015_verdicts.find((row) => row.criterion_id === mapping.criterion_id)?.m015_observed_value,
      m015_source_ref: mapping.m015_verdict_value_refs[0],
      m016_back_refs: backRefs,
      m016_required_back_refs: mapping.m016_required_back_refs,
      pass_through: passThrough,
      m016_verdict: m016Verdict,
      pass_through_rule_text: mapping.pass_through_rule_text,
    });
  }
  const orchestrationScore = _round(criterionDiff.filter((row) => row.pass_through).length / data.M015_CRITERION_MAPPING.length);
  const evidenceScore = _round(criterionDiff.filter((row) => row.m016_verdict !== 'NOT_PROVEN' && row.m016_verdict !== 'REGRESSED').length / data.M015_CRITERION_MAPPING.length);
  return {
    criterion_diff: criterionDiff,
    pass_through_count: passThroughCount,
    promotion_refused_count: promotionRefusedCount,
    orchestration_score: orchestrationScore,
    evidence_score: evidenceScore,
    m015_score: m015Evaluation.m015_score,
    m015_all_pass_against_expected: m015Evaluation.m015_all_pass_against_expected,
    m016_independent_refs: m016IndependentRefs,
  };
}

// ---------------------------------------------------------------------------
// Capability ledger auditor
// ---------------------------------------------------------------------------

function _defaultActionForPreStatus(preStatus, key) {
  if (!data.isCapabilityStatus(preStatus)) return data.CAPABILITY_ACTIONS.KEEP;
  if (preStatus === data.CAPABILITY_STATUSES.CONFIRMED) {
    if (key === 'plugin.runtime.version_build' || key === 'issues.native' || key === 'documents.native' || key === 'comments.native') {
      return data.CAPABILITY_ACTIONS.KEEP;
    }
    return data.CAPABILITY_ACTIONS.UPDATE_BLOCKER;
  }
  return data.CAPABILITY_ACTIONS.KEEP;
}

function _validateCapabilityRow(row) {
  if (!_isObject(row)) return 'row-not-object';
  if (typeof row.key !== 'string' || !new RegExp(data.CAPABILITY_KEY_PATTERN).test(row.key)) return 'key-bad-pattern';
  if (typeof row.status !== 'string' || !data.isCapabilityStatus(row.status)) return 'status-invalid';
  return null;
}

function _normaliseActionList(rawAction) {
  if (Array.isArray(rawAction)) return rawAction;
  if (rawAction && typeof rawAction === 'object') return [rawAction];
  return [];
}

function buildCapabilityAudit(input) {
  const ledger = input.ledger || {};
  if (!_isObject(ledger) || !Array.isArray(ledger.capabilities)) {
    return { ok: false, code: data.BLOCKER_CODES.SCHEMA_VIOLATION('capability-ledger-shape'), rows: [] };
  }
  if (!HASH_RE.test(String(input.sourceHash || ''))) {
    return { ok: false, code: data.BLOCKER_CODES.CAPABILITY_SOURCE_REF_MISSING('hash'), rows: [] };
  }
  const actionsByKey = new Map();
  for (const entry of _normaliseActionList(input.actions || [])) {
    if (!_isObject(entry)) continue;
    if (typeof entry.key !== 'string' || !new RegExp(data.CAPABILITY_KEY_PATTERN).test(entry.key)) continue;
    if (typeof entry.action !== 'string' || !data.isCapabilityAction(entry.action)) continue;
    const confidence = typeof entry.confidence === 'number' ? entry.confidence : 1;
    if (confidence < data.DEFAULTS.min_confidence || confidence > data.DEFAULTS.max_confidence) {
      return { ok: false, code: data.BLOCKER_CODES.CAPABILITY_CONFIDENCE_OUT_OF_RANGE(entry.key, confidence), rows: [] };
    }
    if (actionsByKey.has(entry.key)) {
      return { ok: false, code: data.BLOCKER_CODES.SCHEDULE_DUPLICATE(entry.key), rows: [] };
    }
    actionsByKey.set(entry.key, entry);
  }
  const rows = [];
  const aggregateCounts = Object.fromEntries(Object.values(data.CAPABILITY_ACTIONS).map((value) => [value, 0]));
  let promotionAttempted = false;
  let promotionBlocked = true;
  for (const row of ledger.capabilities.slice(0, data.DEFAULTS.max_capability_rows)) {
    const validation = _validateCapabilityRow(row);
    if (validation) {
      return { ok: false, code: data.BLOCKER_CODES.CAPABILITY_ACTION_INVALID(String(row?.key || 'unknown'), validation), rows: [] };
    }
    const preStatus = row.status;
    const override = actionsByKey.get(row.key);
    // Guard against direct ledger mutation that elevates a forbidden surface
    // to `confirmed`. The action API structurally refuses promotion (no
    // promote action), so a confirmed row in the allowlist is expected only
    // for plugin.runtime.version_build / issues.native / documents.native /
    // comments.native. Anything else refuses to render so the audit
    // surfaces the tamper instead of silently accepting and downgrading.
    if (data.FORBIDDEN_PROMOTION_SURFACES_SET.has(row.key) && preStatus === data.CAPABILITY_STATUSES.CONFIRMED) {
      promotionAttempted = true;
      return { ok: false, code: data.BLOCKER_CODES.CAPABILITY_ILLEGAL_PROMOTION(row.key), rows: [] };
    }
    let action = override?.action || _defaultActionForPreStatus(preStatus, row.key);
    let postStatus = preStatus;
    if (action === data.CAPABILITY_ACTIONS.DROP) {
      postStatus = preStatus;
    } else if (action === data.CAPABILITY_ACTIONS.UPDATE_FALLBACK) {
      if (preStatus === data.CAPABILITY_STATUSES.CONFIRMED) {
        return { ok: false, code: data.BLOCKER_CODES.CAPABILITY_ILLEGAL_PROMOTION(row.key), rows: [] };
      }
      postStatus = data.CAPABILITY_STATUSES.FALLBACK_ONLY;
    } else if (action === data.CAPABILITY_ACTIONS.UPDATE_BLOCKER) {
      postStatus = data.CAPABILITY_STATUSES.FALLBACK_ONLY;
    }
    if (data.FORBIDDEN_PROMOTION_SURFACES_SET.has(row.key) && postStatus === data.CAPABILITY_STATUSES.CONFIRMED && preStatus !== data.CAPABILITY_STATUSES.CONFIRMED) {
      promotionAttempted = true;
      return { ok: false, code: data.BLOCKER_CODES.CAPABILITY_ILLEGAL_PROMOTION(row.key), rows: [] };
    }
    if (postStatus !== preStatus && data.FORBIDDEN_PROMOTION_SURFACES_SET.has(row.key) && postStatus === data.CAPABILITY_STATUSES.CONFIRMED) {
      promotionAttempted = true;
      return { ok: false, code: data.BLOCKER_CODES.CAPABILITY_ILLEGAL_PROMOTION(row.key), rows: [] };
    }
    if (postStatus === data.CAPABILITY_STATUSES.CONFIRMED && preStatus !== data.CAPABILITY_STATUSES.CONFIRMED) {
      promotionAttempted = true;
      return { ok: false, code: data.BLOCKER_CODES.CAPABILITY_ILLEGAL_PROMOTION(row.key), rows: [] };
    }
    aggregateCounts[action] += 1;
    if (postStatus !== data.CAPABILITY_STATUSES.CONFIRMED) {
      // Only rows that remain NOT confirmed can satisfy the non-promotion
      // guardrail.
    } else if (postStatus === data.CAPABILITY_STATUSES.CONFIRMED && preStatus !== data.CAPABILITY_STATUSES.CONFIRMED) {
      promotionBlocked = false;
    }
    rows.push({
      capability_key: row.key,
      paperclip_surface_name: typeof row.paperclip_surface_name === 'string' ? row.paperclip_surface_name.slice(0, data.DEFAULTS.max_rationale_chars) : '',
      pre_status: preStatus,
      post_status: postStatus,
      action,
      confidence: typeof override?.confidence === 'number' ? override.confidence : 1,
      justification: typeof override?.justification === 'string'
        ? override.justification.slice(0, data.DEFAULTS.max_rationale_chars)
        : 'no-overriding-action',
      source_ref: data.CAPABILITY_LEDGER_REF,
      source_sha256: input.sourceHash,
      observed_in_m015_or_m016: Array.isArray(override?.observed_in_m015_or_m016)
        ? override.observed_in_m015_or_m016.slice(0, data.DEFAULTS.max_source_refs_per_criterion)
        : [],
      supported_by_criterion_ids: Array.isArray(override?.supported_by_criterion_ids)
        ? override.supported_by_criterion_ids.filter((value) => data.isKnownCriterion(value)).slice(0, data.DEFAULTS.max_source_refs_per_criterion)
        : [],
      blocked_reason: postStatus === preStatus && action === data.CAPABILITY_ACTIONS.KEEP
        ? 'no-promotion-required'
        : action === data.CAPABILITY_ACTIONS.UPDATE_BLOCKER
          ? 'downgrade-to-fallback-only'
          : null,
    });
  }
  return {
    ok: true,
    rows,
    aggregate_counts: aggregateCounts,
    total_rows: rows.length,
    promotion_blocked: !promotionAttempted,
    pre_status_promoted_to_confirmed_count: rows.filter((row) => row.post_status === data.CAPABILITY_STATUSES.CONFIRMED && row.pre_status !== data.CAPABILITY_STATUSES.CONFIRMED).length,
  };
}

// ---------------------------------------------------------------------------
// Recommendation builder
// ---------------------------------------------------------------------------

function buildRecommendation(input) {
  const capabilityAudit = input.capabilityAudit || { ok: true, rows: [] };
  const criterionDiff = input.criterionDiff || { criterion_diff: [], orchestration_score: 0, evidence_score: 0 };
  const m015Baseline = input.m015Baseline || {};
  const bosPluginRequired = deriveM015VerdictField(m015Baseline, data.M015_CRITERION_MAPPING.find((row) => row.criterion_id === 'M16-S06-CRITERION-BOS-PLUGIN-REQUIRED'));
  const resultJsonBosRequired = deriveM015VerdictField(m015Baseline, data.M015_CRITERION_MAPPING.find((row) => row.criterion_id === 'M16-S06-CRITERION-RESULT-JSON-BOS-REQUIRED'));
  const bosGradeContract = deriveM015VerdictField(m015Baseline, data.M015_CRITERION_MAPPING.find((row) => row.criterion_id === 'M16-S06-CRITERION-BOS-GRADE-CONTRACT-PROOF'));
  const ledgerRows = Array.isArray(capabilityAudit.rows) ? capabilityAudit.rows : [];
  const m016SurfaceNeeds = ledgerRows.some((row) => {
    if (data.FORBIDDEN_PROMOTION_SURFACES_SET.has(row.capability_key) && row.pre_status !== data.CAPABILITY_STATUSES.CONFIRMED) return true;
    return false;
  });
  let recommendation = data.RECOMMENDATION_VALUES.PLUGIN_OWNED_DEFERRED_UNVALIDATED;
  let rationale = 'plugin-owned proof integration is preferred so the host plugin owns the integration test surface; M016 evidence stays non-promoting and defers UVM-style proof validation to a future milestone.';
  if (bosPluginRequired === data.M015_VERDICT_FIELD_VALUES.BOOLEAN_TRUE
    || resultJsonBosRequired === data.M015_VERDICT_FIELD_VALUES.BOOLEAN_TRUE
    || bosGradeContract === data.M015_VERDICT_FIELD_VALUES.PASS) {
    recommendation = data.RECOMMENDATION_VALUES.ADAPTER_NATIVE_DEFERRED_UNVALIDATED;
    rationale = 'M015 promoted bos_plugin_required=true or result_json_bos_required=true; integration is best handled by the adapter so future adapter upgrades can carry the proof contract.';
  } else if (m016SurfaceNeeds) {
    recommendation = data.RECOMMENDATION_VALUES.ADAPTER_NATIVE_DEFERRED_UNVALIDATED;
    rationale = 'current capability ledger carries non-confirmed surfaces that already cover the integration surface; adapter-native proof integration minimises blast radius and keeps host plugin state unpromoted.';
  }
  const evidenceCriterionIds = (criterionDiff.criterion_diff || [])
    .filter((row) => row.pass_through)
    .map((row) => row.criterion_id);
  if (!data.isRecommendationValue(recommendation)) {
    return { ok: false, code: data.BLOCKER_CODES.RECOMMENDATION_UNSUPPORTED(String(recommendation)), recommendation: null };
  }
  return {
    ok: true,
    recommendation: {
      kind: recommendation.split(' ')[0],
      value: recommendation,
      rationale: rationale.slice(0, data.DEFAULTS.max_rationale_chars),
      requires_future_proof: true,
      evidence_criterion_ids: evidenceCriterionIds,
    },
  };
}

// ---------------------------------------------------------------------------
// Capability-action-ledger sidecar builder
// ---------------------------------------------------------------------------

function buildCapabilityActionLedgerSidecar(input = {}) {
  const generated = input.generated || data.RECONCILE_REFERENCE_TIME;
  const capabilityAudit = input.capabilityAudit || buildCapabilityAudit(input);
  if (!capabilityAudit.ok) {
    return { ok: false, code: capabilityAudit.code, sidecar: null };
  }
  const sidecar = {
    schema_id: data.CAPABILITY_LEDGER_SCHEMA_ID,
    schema_version: data.CAPABILITY_LEDGER_SCHEMA_VERSION,
    ledger_id: data.CAPABILITY_LEDGER_ID,
    ledger_kind: data.CAPABILITY_LEDGER_KIND,
    milestone: data.MILESTONE,
    slice: data.SLICE,
    task: data.TASK,
    generated,
    reference_time: input.referenceTime || generated,
    verifier_line: data.VERIFIER_LINE_CLASS,
    canonical_protocol: data.VERIFIER_CANONICAL_PROTOCOL,
    ledger_source_ref: data.CAPABILITY_LEDGER_REF,
    ledger_source_sha256: input.sourceHash || '',
    capability_rows: capabilityAudit.rows,
    aggregate_action_counts: capabilityAudit.aggregate_counts,
    promotion_blocked: capabilityAudit.promotion_blocked,
    pre_status_promoted_to_confirmed_count: capabilityAudit.pre_status_promoted_to_confirmed_count,
    total_rows: capabilityAudit.total_rows,
    limits: Object.freeze({
      max_capability_rows: data.DEFAULTS.max_capability_rows,
      max_blocker_codes: data.DEFAULTS.max_blocker_codes,
      max_blocker_reason_chars: data.DEFAULTS.max_blocker_reason_chars,
    }),
    blockers: [],
  };
  sidecar.byte_digest = computeLedgerBodyDigest(sidecar);
  return { ok: true, sidecar, capability_audit: capabilityAudit };
}

// ---------------------------------------------------------------------------
// Reconciliation sidecar builder
// ---------------------------------------------------------------------------

function buildReconciliationSidecar(input = {}) {
  const generated = input.generated || data.RECONCILE_REFERENCE_TIME;
  const sourceHashes = input.sourceHashes || {};
  const m015Evaluation = evaluateM015Baseline(input.m015Baseline || {}, sourceHashes);
  const criterionDiff = buildCriterionDiff({
    m015Baseline: input.m015Baseline || {},
    sourceHashes,
    m016IndependentRefs: input.m016IndependentRefs || [],
    m015Evaluation,
  });
  const capabilityAudit = buildCapabilityAudit({
    ledger: input.capabilityLedger || {},
    actions: input.capabilityActions || [],
    sourceHash: input.capabilityLedgerHash || sourceHashes[data.CAPABILITY_LEDGER_REF] || '',
  });
  if (!capabilityAudit.ok) {
    return { ok: false, code: capabilityAudit.code, sidecar: null };
  }
  const recommendation = buildRecommendation({
    m015Baseline: input.m015Baseline || {},
    criterionDiff,
    capabilityAudit,
  });
  if (!recommendation.ok) {
    return { ok: false, code: recommendation.code, sidecar: null };
  }
  const s05Verifier = input.s05Verifier || {
    exit_code: -1,
    producer_cli_imported: null,
    network_calls: null,
    mutation_count: null,
    blockers: [],
    replay_keys: null,
    protocol_path: null,
  };
  const sidecar = {
    schema_id: data.RECONCILIATION_SCHEMA_ID,
    schema_version: data.RECONCILIATION_SCHEMA_VERSION,
    reconciliation_id: data.RECONCILIATION_ID,
    reconciliation_kind: data.RECONCILIATION_KIND,
    milestone: data.MILESTONE,
    slice: data.SLICE,
    task: data.TASK,
    generated,
    reference_time: input.referenceTime || generated,
    verifier_line: data.VERIFIER_LINE_CLASS,
    canonical_protocol: data.VERIFIER_CANONICAL_PROTOCOL,
    operator_gate: {
      token: data.DEFAULTS.operator_gate_token,
      confirmed: input.operatorConfirmed === true,
      confirmed_at: input.operatorConfirmed === true ? (input.operatorConfirmedAt || generated) : null,
    },
    inputs: (input.inputs && _isObject(input.inputs)) ? input.inputs : {},
    source_hashes: sourceHashes,
    m015_baseline_ref: data.M015_BASELINE_REF,
    m015_baseline_sha256: sourceHashes[data.M015_BASELINE_REF] || '',
    s05_verifier: {
      exit_code: s05Verifier.exit_code,
      producer_cli_imported: s05Verifier.producer_cli_imported,
      network_calls: s05Verifier.network_calls,
      mutation_count: s05Verifier.mutation_count,
      blockers: Array.isArray(s05Verifier.blockers) ? s05Verifier.blockers : [],
      replay_keys: s05Verifier.replay_keys || null,
      protocol_path: s05Verifier.protocol_path || null,
    },
    m015_score: criterionDiff.m015_score,
    m015_all_pass_against_expected: criterionDiff.m015_all_pass_against_expected,
    orchestration_score: criterionDiff.orchestration_score,
    evidence_score: criterionDiff.evidence_score,
    pass_through_count: criterionDiff.pass_through_count,
    promotion_refused_count: criterionDiff.promotion_refused_count,
    criterion_diff: criterionDiff.criterion_diff,
    capability_action_ledger_ref: data.DEFAULTS.capability_ledger_output,
    capability_promotion_blocked: capabilityAudit.promotion_blocked,
    recommendation: recommendation.recommendation,
    aggregate_verdict: {
      orchestration: criterionDiff.orchestration_score === 1 ? 'PASS' : criterionDiff.orchestration_score >= 0.5 ? 'PARTIAL' : 'NOT_PROVEN',
      evidence: criterionDiff.evidence_score === 1 ? 'PASS' : criterionDiff.evidence_score >= 0.5 ? 'PARTIAL' : 'NOT_PROVEN',
      launch: 'PREPARATION_ONLY',
      overall: 'PREPARATION_ONLY',
    },
    launch_posture: {
      keep_no_promote: true,
      bounded_internal: true,
      no_promotion_to_m016_pass_leaked: criterionDiff.promotion_refused_count === 0,
      preparation_only: true,
    },
    limits: Object.freeze({
      max_criterion_rows: data.DEFAULTS.max_criterion_rows,
      max_capability_rows: data.DEFAULTS.max_capability_rows,
      max_blocker_codes: data.DEFAULTS.max_blocker_codes,
      max_blocker_reason_chars: data.DEFAULTS.max_blocker_reason_chars,
    }),
    raw_bodies_persisted: false,
    redaction_posture: data.RECONCILE_REDACTION_FLAG_VALUES,
    blockers: [],
  };
  sidecar.byte_digest = computeReconciliationBodyDigest(sidecar);
  return { ok: true, sidecar, criterion_diff: criterionDiff, capability_audit: capabilityAudit, recommendation };
}

// ---------------------------------------------------------------------------
// Top-level reconciliation contract evaluation (consumed by T02)
// ---------------------------------------------------------------------------

function _pushBlocker(blockers, code, reason) {
  if (!blockers.some((entry) => entry.code === code)) blockers.push({ code, reason });
}

function _validateSourceAllowlist(sourceHashes) {
  const missing = [];
  for (const entry of data.SOURCE_ALLOWLIST) {
    if (!entry.required) continue;
    const hash = sourceHashes[entry.source_ref];
    if (!HASH_RE.test(String(hash || ''))) missing.push(entry);
  }
  return missing;
}

function evaluateReconciliationContract(input) {
  const blockers = [];
  const requiredSources = _validateSourceAllowlist(input.sourceHashes || {});
  for (const entry of requiredSources) {
    _pushBlocker(blockers, data.BLOCKER_CODES.PRECONDITION_MISSING(entry.chain_role), 'required source is missing or unfresh');
  }
  if (!HASH_RE.test(String(input.s05VerifierExitCode === undefined ? '' : ''))) {
    // s05VerifierExitCode is an integer; nothing to do here.
  }
  const s05Verifier = input.s05Verifier || {};
  if (s05Verifier.exit_code === 0) {
    // ok
  } else if (typeof s05Verifier.exit_code === 'number' && s05Verifier.exit_code > 0) {
    _pushBlocker(blockers, data.BLOCKER_CODES.S05_VERIFIER_NONZERO_EXIT(s05Verifier.exit_code), 'fresh S05 verifier returned a non-zero exit');
  } else if (s05Verifier.exit_code === -1 || s05Verifier.exit_code === null || s05Verifier.exit_code === undefined) {
    _pushBlocker(blockers, data.BLOCKER_CODES.PRECONDITION_MISSING('s05-verifier-output'), 'fresh S05 verifier output was not provided');
  }
  if (s05Verifier.producer_cli_imported === true) {
    _pushBlocker(blockers, data.BLOCKER_CODES.S05_VERIFIER_PRODUCER_CLI_IMPORTED(), 'fresh S05 verifier imported the producer CLI');
  }
  if (typeof s05Verifier.network_calls === 'number' && s05Verifier.network_calls > 0) {
    _pushBlocker(blockers, data.BLOCKER_CODES.S05_VERIFIER_NETWORK_CALLS(s05Verifier.network_calls), 'fresh S05 verifier performed a network call');
  }
  if (typeof s05Verifier.mutation_count === 'number' && s05Verifier.mutation_count > 0) {
    _pushBlocker(blockers, data.BLOCKER_CODES.S05_VERIFIER_MUTATIONS(s05Verifier.mutation_count), 'fresh S05 verifier performed a mutation');
  }
  if (Array.isArray(s05Verifier.blockers) && s05Verifier.blockers.length > 0) {
    _pushBlocker(blockers, data.BLOCKER_CODES.S05_VERIFIER_BLOCKERS(s05Verifier.blockers.length), 'fresh S05 verifier reported blockers');
  }
  if (s05Verifier.replay_keys && (s05Verifier.replay_keys.match !== true || s05Verifier.replay_keys.byte_identical !== true)) {
    _pushBlocker(blockers, data.BLOCKER_CODES.S05_VERIFIER_REPLAY_KEY_MISMATCH('replay_keys'), 'fresh S05 verifier replay keys mismatch');
  }

  const reconciliationSidecar = buildReconciliationSidecar({
    ...input,
    generated: input.generated || data.RECONCILE_REFERENCE_TIME,
  });
  if (!reconciliationSidecar.ok) {
    _pushBlocker(blockers, reconciliationSidecar.code, 'reconciliation sidecar refused to render');
  } else {
    const reco = reconciliationSidecar.sidecar;
    if (reco.recommendation && !data.isRecommendationValue(reco.recommendation.value)) {
      _pushBlocker(blockers, data.BLOCKER_CODES.RECOMMENDATION_UNSUPPORTED(String(reco.recommendation.value)), 'reconciliation recommendation is not on the frozen enum');
    }
    for (const row of reco.criterion_diff) {
      if (row.m015_observed_state === 'UNRECOGNISED') {
        _pushBlocker(blockers, data.BLOCKER_CODES.S05_VERDICT_DRIFT(row.criterion_id), 'criterion observed state is unrecognised');
      }
    }
  }
  const result = {
    ok: blockers.length === 0,
    verdict: blockers.length === 0 ? 'pass' : 'fail_closed',
    exit_code: blockers.length === 0 ? data.EXIT_CODES.RECONCILE_PASS : mapBlockerToExitCode(blockers[0].code),
    blockers,
    sidecar: reconciliationSidecar.ok ? reconciliationSidecar.sidecar : null,
    criterion_diff: reconciliationSidecar.ok ? reconciliationSidecar.criterion_diff : null,
    capability_audit: reconciliationSidecar.ok ? reconciliationSidecar.capability_audit : null,
    recommendation: reconciliationSidecar.ok ? reconciliationSidecar.recommendation : null,
  };
  return result;
}

const evaluateS06Contract = evaluateReconciliationContract;
const evaluateProofReconciliation = evaluateReconciliationContract;

// ---------------------------------------------------------------------------
// Blocker → exit code mapping (mirrors S05 family)
// ---------------------------------------------------------------------------

function mapBlockerToExitCode(blockerCode) {
  if (typeof blockerCode !== 'string') return data.EXIT_CODES.RECONCILE_RUNNER_FAILURE;
  if (/PRECONDITION-MISSING|FRESH-HASH-DRIFT|SCHEMA-VIOLATION|SOURCE-OUT-OF-ALLOWLIST/.test(blockerCode)) return data.EXIT_CODES.RECONCILE_PRECONDITION_DRIFT;
  if (/RECOMMENDATION-/.test(blockerCode)) return data.EXIT_CODES.RECONCILE_LAUNCH_PROMOTION;
  if (/CAPABILITY-ILLEGAL-PROMOTION|LAUNCH-PROMOTION|CRITERION-PASS-THROUGH/.test(blockerCode)) return data.EXIT_CODES.RECONCILE_LAUNCH_PROMOTION;
  if (/SECRET-TOKEN|REDACTION|RAW_BODY|RAW_BODY|RAW-REASONING|VENDOR-REUSE|PAPERCLIP-BASE-URL|AUTHORIZATION/.test(blockerCode)) return data.EXIT_CODES.RECONCILE_REDACTION_LEAK;
  if (/REPLAY-KEY-MISMATCH|REPLAY-DRIFT|VERIFIER-REPLAY/.test(blockerCode)) return data.EXIT_CODES.RECONCILE_REPLAY_DRIFT;
  if (/S05-VERIFIER-|SOURCE-HASH|CORRELATION|EVIDENCE-CHAIN|PROVENANCE|PATH-TRAVERSAL|SCHEMA-VIOLATION/.test(blockerCode)) return data.EXIT_CODES.RECONCILE_PROVENANCE_DRIFT;
  return data.EXIT_CODES.RECONCILE_RUNNER_FAILURE;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // hashing / canonicalisation
  sha256Hex,
  _stableStringify,
  canonicalizeReconciliation,
  computeReconciliationBodyDigest,
  canonicalizeLedger,
  computeLedgerBodyDigest,
  // ajv loader
  resolveAjv,
  loadSchema,
  validateReconciliationShape,
  validateLedgerShape,
  // safety
  checkRedactionSafety,
  assertReconciliationWriteSafe,
  assertLedgerWriteSafe,
  // baseline / diff builders
  evaluateM015Baseline,
  deriveM015VerdictField,
  deriveM015Key,
  buildCriterionDiff,
  buildCapabilityAudit,
  buildRecommendation,
  buildCapabilityActionLedgerSidecar,
  buildReconciliationSidecar,
  evaluateReconciliationContract,
  evaluateS06Contract,
  evaluateProofReconciliation,
  mapBlockerToExitCode,
  // helpers (re-exported)
  _safeSuffix,
};
