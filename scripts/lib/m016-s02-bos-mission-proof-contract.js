#!/usr/bin/env node
'use strict';

/**
 * scripts/lib/m016-s02-bos-mission-proof-contract.js
 *
 * M016-txa3vu / S02 / T01 — Pure fail-closed sidecar proof bundle contract.
 *
 * Pure-function evaluator over a sanitised bos-mission-proof.json bundle.
 * The contract NEVER mutates the filesystem; all inputs are passed in by
 * the caller. Determinism: same bundle + same options → same gates,
 * same verdicts, same blockers.
 *
 * Public API:
 *
 *   loadSchema(schemaPath)
 *   validateBundleShape(bundle, schemaValidate)
 *   checkRedactionSafety(payload, skipKeys)
 *   assertBundleWriteSafe(bundle, skipKeys)
 *   sanitizeString(value)
 *   canonicalizeSources(sources)
 *   computeProvenanceHash(sources)
 *   computeSidecarId(bundleId, provenanceHash)
 *   evaluateBundleContract({ bundle, schema, allowedSources, options })
 *   buildProtocolEvidence(...)
 *   buildVerificationEvidence(...)
 *   buildValidationEvidence(...)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const data = require('./m016-s02-bos-mission-proof-data');

const {
  SCHEMA_ID,
  SCHEMA_VERSION,
  BUNDLE_KIND,
  MILESTONE,
  SLICE,
  SOURCE_KINDS,
  SOURCE_KIND_SET,
  ALLOWED_TASK_IDS,
  REDACTION_FLAG_VALUES,
  REDACTION_BOUNDS,
  REDACTION_PLACEHOLDERS,
  REDACTION_SKIP_KEYS,
  BUNDLE_GATE_IDS,
  BUNDLE_GATE_LABELS,
  BUNDLE_VERDICT_VALUES,
  FORBIDDEN_LAUNCH_VERDICTS,
  REQUIRED_HG_NOT_PROVEN,
  BLOCKER_CODES,
  EXIT_CODES,
  DEFAULTS,
} = data;

const ROOT = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Schema loader (optional AJV)
// ---------------------------------------------------------------------------

let _ajvInstance = null;
let _ajvInitFailed = false;

function _tryInitAjv() {
  if (_ajvInstance !== null) return _ajvInstance;
  if (_ajvInitFailed) return null;
  try {
    const Ajv = require('ajv');
    const addFormats = require('ajv-formats');
    _ajvInstance = addFormats(new Ajv({ allErrors: true, strict: false }));
    return _ajvInstance;
  } catch (e) {
    _ajvInitFailed = true;
    return null;
  }
}

function loadSchema(schemaPath) {
  const rel = path.isAbsolute(schemaPath) ? schemaPath : path.join(ROOT, schemaPath);
  if (!fs.existsSync(rel)) {
    const err = new Error(`schema missing at ${rel}`);
    err.code = BLOCKER_CODES.BUNDLE_SCHEMA_VIOLATION('missing');
    err.path = rel;
    throw err;
  }
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(rel, 'utf8')); }
  catch (e) {
    const err = new Error(`schema malformed JSON at ${rel}: ${e.message}`);
    err.code = BLOCKER_CODES.BUNDLE_SCHEMA_VIOLATION('malformed-json');
    err.path = rel;
    throw err;
  }
  const ajv = _tryInitAjv();
  let validate = null;
  if (ajv) {
    try { validate = ajv.compile(parsed); } catch (e) { validate = null; }
  }
  return { schema: parsed, validate, path: rel };
}

// ---------------------------------------------------------------------------
// Sanitisation helpers
// ---------------------------------------------------------------------------

function sanitizeString(value) {
  if (typeof value !== 'string') return value;
  let out = value;
  out = out.replace(REDACTION_BOUNDS.uuid, REDACTION_PLACEHOLDERS.redacted_id_placeholder);
  out = out.replace(REDACTION_BOUNDS.credential_assignment, REDACTION_PLACEHOLDERS.redacted_credential_placeholder);
  out = out.replace(REDACTION_BOUNDS.bearer_token, REDACTION_PLACEHOLDERS.redacted_token_placeholder);
  out = out.replace(REDACTION_BOUNDS.sk_token, REDACTION_PLACEHOLDERS.redacted_token_placeholder);
  out = out.replace(REDACTION_BOUNDS.tp_token, REDACTION_PLACEHOLDERS.redacted_token_placeholder);
  if (out.length > REDACTION_BOUNDS.bounded_digest_max_chars) {
    out = out.slice(0, REDACTION_BOUNDS.bounded_digest_max_chars);
  }
  return out;
}

function checkRedactionSafety(payload, skipKeys) {
  const hits = [];
  const skip = skipKeys || REDACTION_SKIP_KEYS;
  const checks = [
    { kind: 'uuid', re: REDACTION_BOUNDS.uuid },
    { kind: 'credential_assignment', re: REDACTION_BOUNDS.credential_assignment },
    { kind: 'bearer_token', re: REDACTION_BOUNDS.bearer_token },
    { kind: 'sk_token', re: REDACTION_BOUNDS.sk_token },
    { kind: 'tp_token', re: REDACTION_BOUNDS.tp_token },
    { kind: 'xiaomi_marker', re: REDACTION_BOUNDS.xiaomi_or_mimo },
    { kind: 'vendor_reuse_string', re: REDACTION_BOUNDS.vendor_reuse },
    { kind: 'raw_reasoning_marker', re: REDACTION_BOUNDS.raw_reasoning },
    { kind: 'raw_body_marker', re: REDACTION_BOUNDS.raw_body },
    { kind: 'raw_result_json_result', re: REDACTION_BOUNDS.raw_result_json_result },
  ];
  const walk = (val, p) => {
    if (val == null) return;
    if (typeof val === 'string') {
      for (const c of checks) {
        if (c.re.test(val)) {
          hits.push({ kind: c.kind, path: p || '$', tail: val.length > 80 ? val.slice(0, 80) + '…' : val });
        }
      }
      return;
    }
    if (Array.isArray(val)) { for (let i = 0; i < val.length; i++) walk(val[i], `${p}[${i}]`); return; }
    if (typeof val === 'object') {
      for (const k of Object.keys(val)) {
        if (skip.has(k)) continue;
        walk(val[k], `${p}.${k}`);
      }
    }
  };
  walk(payload, '$');
  return hits;
}

function assertBundleWriteSafe(bundle, skipKeys) {
  const hits = checkRedactionSafety(bundle, skipKeys);
  if (hits.length > 0) {
    const err = new Error(`refused write: redaction leak in bundle (count=${hits.length})`);
    err.code = BLOCKER_CODES.RUNNER_FAILURE;
    err.hits = hits;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Per-source validator
// ---------------------------------------------------------------------------

const KEBAB_CASE = /^[a-z][a-z0-9._-]{2,63}$/;
const ARTIFACT_HASH = /^[a-f0-9]{64}$/;
const BOUNDED_PATH = /^(runtime-evidence|scripts)\/[A-Za-z0-9._/\-]+$/;
const BOUNDED_DIGEST_CHARSET = /^[A-Za-z0-9 .:;,_<>/\-]+$/;
const BOUNDED_SUMMARY_CHARSET = /^[A-Za-z0-9 .:;,_<>/\-]+$/;
const ISO_DATETIME = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})?$/;

function _inRange(s, lo, hi) { return typeof s === 'string' && s.length >= lo && s.length <= hi; }

function _validateSource(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return { ok: false, code: BLOCKER_CODES.SOURCE_OUT_OF_ALLOWLIST('null'), reason: 'source must be an object' };
  }
  const ref = source.source_ref;
  if (typeof ref !== 'string' || !BOUNDED_PATH.test(ref)) {
    return { ok: false, code: BLOCKER_CODES.SOURCE_PATH_OUT_OF_BOUND(String(ref)), reason: `source_ref "${ref}" out of bound` };
  }
  if (!SOURCE_KIND_SET.has(source.kind)) {
    return { ok: false, code: BLOCKER_CODES.SOURCE_KIND_INVALID(source.kind), reason: `source.kind "${source.kind}" not canonical` };
  }
  if (typeof source.raw_sha256 !== 'string' || !ARTIFACT_HASH.test(source.raw_sha256)) {
    return { ok: false, code: BLOCKER_CODES.SOURCE_RAW_HASH_MISSING(ref), reason: `raw_sha256 missing or malformed for ${ref}` };
  }
  if (typeof source.sanitised_sha256 !== 'string' || !ARTIFACT_HASH.test(source.sanitised_sha256)) {
    return { ok: false, code: BLOCKER_CODES.SOURCE_SANITISED_HASH_MISSING(ref), reason: `sanitised_sha256 missing or malformed for ${ref}` };
  }
  if (source.raw_sha256 === source.sanitised_sha256) {
    return { ok: false, code: BLOCKER_CODES.SOURCE_HASHES_IDENTICAL(ref), reason: `raw_sha256 and sanitised_sha256 must differ for ${ref}` };
  }
  if (!KEBAB_CASE.test(source.independence_group || '')) {
    return { ok: false, code: BLOCKER_CODES.SOURCE_GROUP_MISSING(ref), reason: `independence_group malformed for ${ref}` };
  }
  if (!Number.isInteger(source.size_bytes) || source.size_bytes < 1 || source.size_bytes > REDACTION_BOUNDS.max_source_size_bytes) {
    return { ok: false, code: BLOCKER_CODES.SOURCE_SIZE_OUT_OF_RANGE(ref), reason: `size_bytes out of range for ${ref}` };
  }
  if (!Array.isArray(source.claim_ids) || source.claim_ids.length < 1) {
    return { ok: false, code: BLOCKER_CODES.SOURCE_CLAIM_IDS_MISSING(ref), reason: `claim_ids missing or empty for ${ref}` };
  }
  for (const cid of source.claim_ids) {
    if (!KEBAB_CASE.test(cid || '')) {
      return { ok: false, code: BLOCKER_CODES.SOURCE_CLAIM_IDS_MISSING(ref), reason: `claim_id "${cid}" malformed for ${ref}` };
    }
  }
  if (source.captured_at !== undefined) {
    if (typeof source.captured_at !== 'string' || !ISO_DATETIME.test(source.captured_at) || isNaN(Date.parse(source.captured_at))) {
      return { ok: false, code: BLOCKER_CODES.SOURCE_OUT_OF_ALLOWLIST(ref), reason: `captured_at not ISO-8601 for ${ref}` };
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Bundle-shape validator
// ---------------------------------------------------------------------------

const ALLOWED_BUNDLE_KEYS = new Set([
  'schema_id', 'schema_version', 'bundle_id', 'bundle_kind',
  'milestone', 'slice', 'task', 'generated', 'sidecar_id',
  'provenance_hash', 'sources', 'indepenence_groups', 'redaction_posture',
  'classification', 'sanitised_artifacts', 'replay_keys', 'blockers',
]);

function validateBundleShape(bundle, schemaValidate) {
  if (bundle === undefined || bundle === null) return { ok: false, code: BLOCKER_CODES.BUNDLE_INPUT_MISSING, reason: 'bundle input missing' };
  if (typeof bundle !== 'object' || Array.isArray(bundle)) return { ok: false, code: BLOCKER_CODES.BUNDLE_INPUT_NOT_OBJECT, reason: 'bundle input must be an object' };
  if (schemaValidate) {
    const ok = schemaValidate(bundle);
    if (!ok) {
      const errs = schemaValidate.errors || [];
      const first = errs[0] ? `${errs[0].instancePath || '$'} ${errs[0].message}` : 'schema violation';
      return { ok: false, code: BLOCKER_CODES.BUNDLE_SCHEMA_VIOLATION(first.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)), reason: `schema violation: ${first}` };
    }
  }
  if (bundle.schema_id !== SCHEMA_ID) return { ok: false, code: BLOCKER_CODES.BUNDLE_SCHEMA_VIOLATION('schema_id'), reason: `schema_id "${bundle.schema_id}" not canonical` };
  if (bundle.schema_version !== SCHEMA_VERSION) return { ok: false, code: BLOCKER_CODES.BUNDLE_SCHEMA_VIOLATION('schema_version'), reason: `schema_version "${bundle.schema_version}" not canonical` };
  if (!KEBAB_CASE.test(bundle.bundle_id || '')) return { ok: false, code: BLOCKER_CODES.BUNDLE_SCHEMA_VIOLATION('bundle_id'), reason: 'bundle_id malformed' };
  if (bundle.bundle_kind !== BUNDLE_KIND.BOS_MISSION_PROOF) return { ok: false, code: BLOCKER_CODES.BUNDLE_KIND_INVALID(bundle.bundle_kind), reason: `bundle_kind "${bundle.bundle_kind}" not canonical` };
  if (bundle.milestone !== MILESTONE) return { ok: false, code: BLOCKER_CODES.BUNDLE_MILESTONE_INVALID(bundle.milestone), reason: `milestone "${bundle.milestone}" not canonical` };
  if (bundle.slice !== SLICE) return { ok: false, code: BLOCKER_CODES.BUNDLE_SLICE_INVALID(bundle.slice), reason: `slice "${bundle.slice}" not canonical` };
  if (!ALLOWED_TASK_IDS.includes(bundle.task)) return { ok: false, code: BLOCKER_CODES.BUNDLE_TASK_INVALID(bundle.task), reason: `task "${bundle.task}" not in [T01..T03]` };
  if (typeof bundle.generated !== 'string' || isNaN(Date.parse(bundle.generated))) return { ok: false, code: BLOCKER_CODES.BUNDLE_SCHEMA_VIOLATION('generated'), reason: 'generated not ISO-8601' };
  if (!ARTIFACT_HASH.test(bundle.sidecar_id || '')) return { ok: false, code: BLOCKER_CODES.SIDECAR_ID_MALFORMED, reason: 'sidecar_id malformed' };
  if (!ARTIFACT_HASH.test(bundle.provenance_hash || '')) return { ok: false, code: BLOCKER_CODES.PROVENANCE_HASH_MALFORMED, reason: 'provenance_hash malformed' };
  if (!Array.isArray(bundle.sources) || bundle.sources.length < 1 || bundle.sources.length > DEFAULTS.max_source_count) {
    return { ok: false, code: BLOCKER_CODES.BUNDLE_SCHEMA_VIOLATION('sources'), reason: 'sources must be a non-empty bounded array' };
  }
  const seenRefs = new Set();
  for (const source of bundle.sources) {
    const ref = source && source.source_ref;
    if (ref && seenRefs.has(ref)) return { ok: false, code: BLOCKER_CODES.SOURCE_DUPLICATE(ref), reason: `duplicate source_ref ${ref}` };
    if (ref) seenRefs.add(ref);
    const err = _validateSource(source);
    if (!err.ok) return { ok: false, code: err.code, reason: err.reason };
  }
  if (!Array.isArray(bundle.indepenence_groups) || bundle.indepenence_groups.length < 1) {
    return { ok: false, code: BLOCKER_CODES.BUNDLE_SCHEMA_VIOLATION('indepenence_groups'), reason: 'indepenence_groups must be a non-empty array' };
  }
  const seenGroups = new Set();
  for (const g of bundle.indepenence_groups) {
    if (typeof g !== 'string' || !KEBAB_CASE.test(g)) return { ok: false, code: BLOCKER_CODES.INDEPENDENCE_GROUPS_UNKNOWN(g), reason: `independence_group "${g}" malformed` };
    if (seenGroups.has(g)) return { ok: false, code: BLOCKER_CODES.INDEPENDENCE_GROUPS_DUPLICATE(g), reason: `independence_group "${g}" duplicated` };
    seenGroups.add(g);
  }
  if (!bundle.redaction_posture || typeof bundle.redaction_posture !== 'object') {
    return { ok: false, code: BLOCKER_CODES.BUNDLE_SCHEMA_VIOLATION('redaction_posture'), reason: 'redaction_posture missing' };
  }
  for (const [flag, expected] of Object.entries(REDACTION_FLAG_VALUES)) {
    if (bundle.redaction_posture[flag] !== expected) {
      return { ok: false, code: BLOCKER_CODES.REDACTION_FLAG_INVALID(flag), reason: `redaction_posture.${flag} must be ${expected}, got ${bundle.redaction_posture[flag]}` };
    }
  }
  if (!bundle.classification || typeof bundle.classification !== 'object') {
    return { ok: false, code: BLOCKER_CODES.BUNDLE_SCHEMA_VIOLATION('classification'), reason: 'classification missing' };
  }
  if (!Array.isArray(bundle.sanitised_artifacts) || bundle.sanitised_artifacts.length < 1) {
    return { ok: false, code: BLOCKER_CODES.BUNDLE_SCHEMA_VIOLATION('sanitised_artifacts'), reason: 'sanitised_artifacts must be a non-empty array' };
  }
  for (const art of bundle.sanitised_artifacts) {
    if (!art || typeof art !== 'object') return { ok: false, code: BLOCKER_CODES.ARTIFACT_DIGEST_OUT_OF_BOUND('null'), reason: 'sanitised_artifact must be an object' };
    if (!BOUNDED_PATH.test(art.source_ref || '')) return { ok: false, code: BLOCKER_CODES.ARTIFACT_DIGEST_OUT_OF_BOUND(art.source_ref), reason: `sanitised_artifact.source_ref "${art.source_ref}" out of bound` };
    if (!KEBAB_CASE.test(art.claim_id || '')) return { ok: false, code: BLOCKER_CODES.ARTIFACT_DIGEST_OUT_OF_BOUND(art.claim_id), reason: `sanitised_artifact.claim_id "${art.claim_id}" malformed` };
    if (!_inRange(art.sanitised_artifact, REDACTION_BOUNDS.bounded_artifact_min_chars, REDACTION_BOUNDS.bounded_artifact_max_chars)) {
      return { ok: false, code: BLOCKER_CODES.ARTIFACT_DIGEST_OUT_OF_BOUND(art.source_ref), reason: 'sanitised_artifact length out of [8,256]' };
    }
    if (!BOUNDED_DIGEST_CHARSET.test(art.sanitised_artifact)) {
      return { ok: false, code: BLOCKER_CODES.ARTIFACT_DIGEST_CHARSET(art.source_ref), reason: 'sanitised_artifact contains characters outside safe charset' };
    }
    if (!ARTIFACT_HASH.test(art.sanitised_hash || '')) return { ok: false, code: BLOCKER_CODES.ARTIFACT_DIGEST_OUT_OF_BOUND(art.source_ref), reason: 'sanitised_hash malformed' };
  }
  if (!bundle.replay_keys || typeof bundle.replay_keys !== 'object') {
    return { ok: false, code: BLOCKER_CODES.BUNDLE_SCHEMA_VIOLATION('replay_keys'), reason: 'replay_keys missing' };
  }
  if (!Array.isArray(bundle.blockers)) {
    return { ok: false, code: BLOCKER_CODES.BUNDLE_SCHEMA_VIOLATION('blockers'), reason: 'blockers must be an array' };
  }
  for (const b of bundle.blockers) {
    if (!b || typeof b !== 'object') continue;
    if (typeof b.code !== 'string' || !/^M16-S02-/.test(b.code)) return { ok: false, code: BLOCKER_CODES.BUNDLE_SCHEMA_VIOLATION('blockers_code'), reason: `blocker code "${b.code}" out of namespace` };
    if (!['blocking', 'advisory'].includes(b.severity)) return { ok: false, code: BLOCKER_CODES.BUNDLE_SCHEMA_VIOLATION('blockers_severity'), reason: `blocker severity "${b.severity}" not canonical` };
    if (!_inRange(b.reason, 1, 400)) return { ok: false, code: BLOCKER_CODES.BUNDLE_SCHEMA_VIOLATION('blockers_reason'), reason: 'blocker reason length out of [1,400]' };
    if (!BOUNDED_SUMMARY_CHARSET.test(b.reason || '')) return { ok: false, code: BLOCKER_CODES.BUNDLE_SCHEMA_VIOLATION('blockers_reason'), reason: 'blocker reason contains characters outside safe charset' };
  }
  const extras = Object.keys(bundle).filter((k) => !ALLOWED_BUNDLE_KEYS.has(k));
  if (extras.length) {
    return { ok: false, code: BLOCKER_CODES.BUNDLE_SCHEMA_VIOLATION('extra_props'), reason: `bundle has additional properties: ${extras.join(',')}` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Provenance / sidecar hash utilities
// ---------------------------------------------------------------------------

function _stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map((v) => _stableStringify(v)).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + _stableStringify(value[k])).join(',') + '}';
}

function canonicalizeSources(sources) {
  if (!Array.isArray(sources)) return [];
  const normalised = sources.map((s) => ({
    source_ref: s.source_ref,
    kind: s.kind,
    raw_sha256: s.raw_sha256,
    sanitised_sha256: s.sanitised_sha256,
    independence_group: s.independence_group,
    size_bytes: s.size_bytes,
    claim_ids: [...(s.claim_ids || [])].sort(),
    captured_at: s.captured_at || null,
  }));
  normalised.sort((a, b) => {
    if (a.source_ref < b.source_ref) return -1;
    if (a.source_ref > b.source_ref) return 1;
    if (a.raw_sha256 < b.raw_sha256) return -1;
    if (a.raw_sha256 > b.raw_sha256) return 1;
    return 0;
  });
  return normalised;
}

function computeProvenanceHash(sources) {
  const canonical = canonicalizeSources(sources);
  const payload = JSON.stringify({ schema_version: SCHEMA_VERSION, sources: canonical });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function computeSidecarId(bundleId, provenanceHash) {
  const payload = JSON.stringify({ schema_version: SCHEMA_VERSION, bundle_id: bundleId, provenance_hash: provenanceHash });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

// ---------------------------------------------------------------------------
// Embedded classification drift detector
// ---------------------------------------------------------------------------

function _detectClassificationDrift(classification) {
  const failures = [];
  if (!classification || typeof classification !== 'object') {
    failures.push({ code: BLOCKER_CODES.CLASSIFICATION_DRIFT('classification_missing'), reason: 'classification missing' });
    return failures;
  }
  if (classification.evaluator !== 'S01-classification-contract') {
    failures.push({ code: BLOCKER_CODES.CLASSIFICATION_DRIFT('evaluator'), reason: `evaluator "${classification.evaluator}" not canonical` });
  }
  if (classification.evaluator_version !== 'v1') {
    failures.push({ code: BLOCKER_CODES.CLASSIFICATION_DRIFT('evaluator_version'), reason: `evaluator_version "${classification.evaluator_version}" not canonical` });
  }
  const v = (classification.verdicts) || {};
  if (!classification.verdicts || typeof classification.verdicts !== 'object') {
    failures.push({ code: BLOCKER_CODES.CLASSIFICATION_DRIFT('verdicts_missing'), reason: 'verdicts missing' });
  } else {
    if (v.orchestration !== 'PASS') failures.push({ code: BLOCKER_CODES.CLASSIFICATION_DRIFT('orchestration_verdict'), reason: `orchestration verdict "${v.orchestration}" not PASS` });
    if (v.evidence !== 'PARTIAL') failures.push({ code: BLOCKER_CODES.CLASSIFICATION_DRIFT('evidence_verdict'), reason: `evidence verdict "${v.evidence}" not PARTIAL` });
    if (v.launch !== 'PREPARATION_ONLY') failures.push({ code: BLOCKER_CODES.CLASSIFICATION_DRIFT('launch_verdict'), reason: `launch verdict "${v.launch}" not PREPARATION_ONLY` });
  }
  const hg = (classification.hard_gates) || {};
  if (!classification.hard_gates || typeof classification.hard_gates !== 'object') {
    failures.push({ code: BLOCKER_CODES.CLASSIFICATION_DRIFT('hard_gates_missing'), reason: 'hard_gates missing' });
  } else {
    for (const gate of REQUIRED_HG_NOT_PROVEN) {
      if (hg[gate] !== 'not_proven') failures.push({ code: BLOCKER_CODES.CLASSIFICATION_HG_FAIL(gate), reason: `hard_gate ${gate} expected not_proven, got ${hg[gate]}` });
    }
    if (!['pass', 'not_proven'].includes(hg.HG1)) failures.push({ code: BLOCKER_CODES.CLASSIFICATION_HG_FAIL('HG1'), reason: `hard_gate HG1 must be pass|not_proven, got ${hg.HG1}` });
    if (!['pass', 'not_proven'].includes(hg.HG2)) failures.push({ code: BLOCKER_CODES.CLASSIFICATION_HG_FAIL('HG2'), reason: `hard_gate HG2 must be pass|not_proven, got ${hg.HG2}` });
  }
  if (!classification.worksheet || typeof classification.worksheet !== 'object') {
    failures.push({ code: BLOCKER_CODES.CLASSIFICATION_WORKSHEET_INCOMPLETE, reason: 'classification.worksheet missing' });
  } else if (!Array.isArray(classification.worksheet.steps) || classification.worksheet.steps.length < 1) {
    failures.push({ code: BLOCKER_CODES.CLASSIFICATION_WORKSHEET_INCOMPLETE, reason: 'classification.worksheet.steps must be non-empty' });
  }
  if (classification.weight !== undefined && (typeof classification.weight !== 'number' || classification.weight < 0 || classification.weight > 1)) {
    failures.push({ code: BLOCKER_CODES.CLASSIFICATION_DRIFT('weight'), reason: `classification.weight must be in [0,1], got ${classification.weight}` });
  }
  const nm = (classification.numeric_mapping) || {};
  if (!classification.numeric_mapping || typeof classification.numeric_mapping !== 'object') {
    failures.push({ code: BLOCKER_CODES.CLASSIFICATION_DRIFT('numeric_mapping'), reason: 'classification.numeric_mapping missing' });
  } else {
    for (const dim of ['orchestration', 'evidence', 'launch']) {
      const x = nm[dim];
      if (typeof x !== 'number' || x < 0 || x > 1) failures.push({ code: BLOCKER_CODES.CLASSIFICATION_DRIFT(`numeric_mapping.${dim}`), reason: `numeric_mapping.${dim} must be number in [0,1]` });
    }
  }
  return failures;
}

function _detectLaunchPromotion(bundle) {
  const failures = [];
  const classification = bundle.classification || {};
  const v = classification.verdicts || {};
  for (const forbidden of FORBIDDEN_LAUNCH_VERDICTS) {
    if (v.launch === forbidden) failures.push({ code: BLOCKER_CODES.LAUNCH_PROMOTION_ATTEMPT(forbidden), reason: `embedded classification attempted to promote launch to ${forbidden}` });
  }
  for (const b of (bundle.blockers || [])) {
    if (b && typeof b.code === 'string' && /LAUNCH-PROMOTION-ATTEMPT/.test(b.code)) {
      failures.push({ code: BLOCKER_CODES.LAUNCH_PROMOTION_ATTEMPT('blockers'), reason: 'bundle carries a launch-promotion blocker in the wrong field' });
    }
  }
  return failures;
}

// ---------------------------------------------------------------------------
// Replay-keys verifier
// ---------------------------------------------------------------------------

function _verifyReplayKeys(replay, expectedProvenanceHash) {
  const failures = [];
  if (!replay || typeof replay !== 'object') {
    failures.push({ code: BLOCKER_CODES.REPLAY_HASH_MISSING, reason: 'replay_keys missing' });
    return failures;
  }
  if (!ARTIFACT_HASH.test(replay.first_run_provenance_hash || '')) failures.push({ code: BLOCKER_CODES.REPLAY_HASH_MALFORMED, reason: 'first_run_provenance_hash malformed' });
  if (!ARTIFACT_HASH.test(replay.second_run_provenance_hash || '')) failures.push({ code: BLOCKER_CODES.REPLAY_HASH_MALFORMED, reason: 'second_run_provenance_hash malformed' });
  if (replay.first_run_provenance_hash && replay.second_run_provenance_hash && replay.first_run_provenance_hash !== replay.second_run_provenance_hash) {
    failures.push({ code: BLOCKER_CODES.REPLAY_HASH_MISMATCH, reason: 'first_run_provenance_hash != second_run_provenance_hash' });
  }
  if (replay.match !== true) failures.push({ code: BLOCKER_CODES.REPLAY_FLAG_FALSE, reason: 'replay_keys.match must be true' });
  if (replay.byte_identical !== true) failures.push({ code: BLOCKER_CODES.REPLAY_NOT_BYTE_IDENTICAL, reason: 'replay_keys.byte_identical must be true' });
  if (expectedProvenanceHash && replay.first_run_provenance_hash && replay.first_run_provenance_hash !== expectedProvenanceHash) {
    failures.push({ code: BLOCKER_CODES.REPLAY_HASH_MISMATCH, reason: 'replay first_run_provenance_hash does not match bundle provenance_hash' });
  }
  return failures;
}

// ---------------------------------------------------------------------------
// Allowlist + independence-groups cross-check
// ---------------------------------------------------------------------------

function _validateSourceAllowlist(bundle, allowedSources) {
  if (!Array.isArray(allowedSources) || allowedSources.length === 0) return { ok: false, reason: 'allowedSources must be a non-empty array' };
  const allowedSet = new Set(allowedSources);
  for (const source of bundle.sources || []) {
    if (!allowedSet.has(source.source_ref)) {
      return { ok: false, reason: `source_ref ${source.source_ref} not in allowlist`, code: BLOCKER_CODES.SOURCE_OUT_OF_ALLOWLIST(source.source_ref) };
    }
  }
  return { ok: true };
}

function _validateIndependenceGroups(bundle) {
  const declared = new Set(bundle.indepenence_groups || []);
  const observed = new Set();
  for (const source of bundle.sources || []) observed.add(source.independence_group);
  const failures = [];
  for (const g of observed) {
    if (!declared.has(g)) failures.push({ code: BLOCKER_CODES.INDEPENDENCE_GROUPS_MISSING_SOURCE(g), reason: `source group ${g} not declared in indepenence_groups` });
  }
  for (const g of declared) {
    if (!observed.has(g)) failures.push({ code: BLOCKER_CODES.INDEPENDENCE_GROUPS_UNKNOWN(g), reason: `declared group ${g} has no source` });
  }
  return failures;
}

function _validateRedactionPosture(posture) {
  const failures = [];
  if (!posture || typeof posture !== 'object') {
    return { ok: false, failures: [{ flag: 'redaction_posture', reason: 'redaction_posture missing' }] };
  }
  for (const [flag, expected] of Object.entries(REDACTION_FLAG_VALUES)) {
    if (posture[flag] !== expected) failures.push({ flag, reason: `redaction_posture.${flag} expected ${expected}, got ${posture[flag]}` });
  }
  return { ok: failures.length === 0, failures };
}

// ---------------------------------------------------------------------------
// Bundle-gate evaluator
// ---------------------------------------------------------------------------

function evaluateBundleGates({ shapeOk, redactionOk, sourcesOk, provenanceOk, classificationFailures, replayFailures, launchFailures }) {
  return {
    BG1_SCHEMA_COMPLIANCE: shapeOk ? 'pass' : 'fail_closed',
    BG2_SOURCE_ALLOWLIST: sourcesOk ? 'pass' : 'fail_closed',
    BG3_REDACTION_POSTURE: redactionOk ? 'pass' : 'fail_closed',
    BG4_PROVENANCE_INTEGRITY: provenanceOk ? 'pass' : 'fail_closed',
    BG5_CLASSIFICATION_FROZEN: classificationFailures.length === 0 ? 'pass' : 'fail_closed',
    BG6_LAUNCH_NOT_PROMOTED: launchFailures.length === 0 && replayFailures.length === 0 ? 'pass' : 'fail_closed',
  };
}

// ---------------------------------------------------------------------------
// Top-level orchestrator
// ---------------------------------------------------------------------------

function evaluateBundleContract(input) {
  const inData = input || {};
  const bundle = inData.bundle;
  const schemaValidate = inData.schema && inData.schema.validate ? inData.schema.validate : null;
  const allowedSources = inData.allowedSources || [];
  const options = inData.options || {};
  const fail = (code, runnerStatus, runnerExitCode, reason) => ({
    runner_status: runnerStatus, runner_exit_code: runnerExitCode,
    blockers: [{ code, severity: 'blocking', reason }],
    gates: {}, classifications: [], verdicts: {}, diagnostics: {},
  });
  if (bundle === undefined || bundle === null) return fail(BLOCKER_CODES.BUNDLE_INPUT_MISSING, 'FAIL', EXIT_CODES.BUNDLE_REJECTED_MALFORMED, 'bundle input missing');
  if (typeof bundle !== 'object' || Array.isArray(bundle)) return fail(BLOCKER_CODES.BUNDLE_INPUT_NOT_OBJECT, 'FAIL', EXIT_CODES.BUNDLE_REJECTED_MALFORMED, 'bundle input not an object');

  const shapeCheck = validateBundleShape(bundle, schemaValidate);
  if (!shapeCheck.ok) return fail(shapeCheck.code, 'FAIL', EXIT_CODES.BUNDLE_REJECTED_MALFORMED, shapeCheck.reason);

  const allowlistCheck = _validateSourceAllowlist(bundle, allowedSources);
  if (!allowlistCheck.ok) return fail(allowlistCheck.code || BLOCKER_CODES.SOURCE_OUT_OF_ALLOWLIST('unknown'), 'FAIL', EXIT_CODES.BUNDLE_REJECTED_FAIL_CLOSED, allowlistCheck.reason);

  const expectedProvenance = computeProvenanceHash(bundle.sources);
  const expectedSidecar = computeSidecarId(bundle.bundle_id, expectedProvenance);
  const provenanceFailures = [];
  if (bundle.provenance_hash !== expectedProvenance) provenanceFailures.push({ code: BLOCKER_CODES.PROVENANCE_HASH_MISMATCH((bundle.provenance_hash || '').slice(0, 12)), reason: 'bundle.provenance_hash does not match canonical sha256 of sources' });
  if (bundle.sidecar_id !== expectedSidecar) provenanceFailures.push({ code: BLOCKER_CODES.SIDECAR_ID_MALFORMED, reason: 'bundle.sidecar_id does not match sha256(bundle_id, provenance_hash)' });

  const redactionPostureCheck = _validateRedactionPosture(bundle.redaction_posture);
  const scannerHits = checkRedactionSafety(bundle);
  const redactionFailures = [];
  for (const f of redactionPostureCheck.failures) redactionFailures.push({ code: BLOCKER_CODES.REDACTION_FLAG_INVALID(f.flag), reason: f.reason });
  for (const hit of scannerHits) {
    const tail = String(hit.tail || '').slice(0, 24).replace(/[^A-Za-z0-9_-]/g, '_');
    redactionFailures.push({ code: BLOCKER_CODES.REDACTION_LEAK(hit.kind, tail), reason: `redaction leak at ${hit.path}: ${hit.kind}` });
  }

  const classificationFailures = _detectClassificationDrift(bundle.classification);
  const launchFailures = _detectLaunchPromotion(bundle);
  const replayFailures = _verifyReplayKeys(bundle.replay_keys, expectedProvenance);
  const indepFailures = _validateIndependenceGroups(bundle);

  const redactionOk = redactionPostureCheck.ok && scannerHits.length === 0;
  const provenanceOk = provenanceFailures.length === 0;

  const gates = evaluateBundleGates({
    shapeOk: true, redactionOk, sourcesOk: true, provenanceOk,
    classificationFailures, replayFailures, launchFailures,
  });

  const verdicts = {
    PROVENANCE_PRESERVED: provenanceOk ? BUNDLE_VERDICT_VALUES.PROVENANCE_PRESERVED : BUNDLE_VERDICT_VALUES.NEGATIVE_SUITE_OK,
    REDACTION_SAFE: redactionOk ? BUNDLE_VERDICT_VALUES.REDACTION_SAFE : BUNDLE_VERDICT_VALUES.NEGATIVE_SUITE_OK,
    REPLAY_DETERMINISTIC: replayFailures.length === 0 ? BUNDLE_VERDICT_VALUES.REPLAY_DETERMINISTIC : BUNDLE_VERDICT_VALUES.NEGATIVE_SUITE_OK,
    CLASSIFICATION_FROZEN: classificationFailures.length === 0 ? BUNDLE_VERDICT_VALUES.CLASSIFICATION_FROZEN : BUNDLE_VERDICT_VALUES.NEGATIVE_SUITE_OK,
    LAUNCH_NOT_PROMOTED: launchFailures.length === 0 ? BUNDLE_VERDICT_VALUES.LAUNCH_NOT_PROMOTED : BUNDLE_VERDICT_VALUES.NEGATIVE_SUITE_OK,
    NEGATIVE_SUITE_OK: BUNDLE_VERDICT_VALUES.NEGATIVE_SUITE_OK,
  };

  const blockers = [];
  for (const list of [provenanceFailures, redactionFailures, classificationFailures, launchFailures, replayFailures, indepFailures]) {
    for (const f of list) blockers.push({ ...f, severity: 'blocking' });
  }
  for (const [key, label] of Object.entries({
    BG1_SCHEMA_COMPLIANCE: BUNDLE_GATE_LABELS.schema_compliance_pass,
    BG2_SOURCE_ALLOWLIST: BUNDLE_GATE_LABELS.source_allowlist_pass,
    BG3_REDACTION_POSTURE: BUNDLE_GATE_LABELS.redaction_posture_pass,
    BG4_PROVENANCE_INTEGRITY: BUNDLE_GATE_LABELS.provenance_integrity_pass,
    BG5_CLASSIFICATION_FROZEN: BUNDLE_GATE_LABELS.classification_frozen_pass,
    BG6_LAUNCH_NOT_PROMOTED: BUNDLE_GATE_LABELS.launch_not_promoted_pass,
  })) {
    if (gates[key] === 'fail_closed') blockers.push({ code: BLOCKER_CODES.CLASSIFICATION_HG_FAIL(key), severity: 'blocking', gate_id: key, reason: `${label} failed closed` });
  }

  let runnerStatus, runnerExitCode;
  // BG6 (launch promotion) is more specific than BG5 (classification drift):
  // a forbidden launch verdict (GO/PASS_AUTOMATIC) is both a drift and a
  // promotion attempt, and the audit must surface the promotion attempt.
  if (gates.BG1_SCHEMA_COMPLIANCE === 'fail_closed' || gates.BG2_SOURCE_ALLOWLIST === 'fail_closed' || gates.BG4_PROVENANCE_INTEGRITY === 'fail_closed') {
    runnerStatus = 'REJECTED_MALFORMED'; runnerExitCode = EXIT_CODES.BUNDLE_REJECTED_MALFORMED;
  } else if (gates.BG3_REDACTION_POSTURE === 'fail_closed') {
    runnerStatus = 'REJECTED_REDACTION_LEAK'; runnerExitCode = EXIT_CODES.BUNDLE_REDACTION_LEAK;
  } else if (gates.BG6_LAUNCH_NOT_PROMOTED === 'fail_closed') {
    runnerStatus = 'REJECTED_LAUNCH_PROMOTION'; runnerExitCode = EXIT_CODES.BUNDLE_LAUNCH_PROMOTION;
  } else if (gates.BG5_CLASSIFICATION_FROZEN === 'fail_closed') {
    runnerStatus = 'REJECTED_CLASSIFICATION_DRIFT'; runnerExitCode = EXIT_CODES.BUNDLE_CLASSIFICATION_DRIFT;
  } else {
    runnerStatus = 'PASS'; runnerExitCode = EXIT_CODES.BUNDLE_PASS;
  }

  return {
    runner_status: runnerStatus, runner_exit_code: runnerExitCode,
    gates, verdicts, blockers,
    diagnostics: {
      expected_provenance_hash: expectedProvenance,
      expected_sidecar_id: expectedSidecar,
      redaction_posture_check: { ok: redactionPostureCheck.ok, failures: redactionPostureCheck.failures },
      scanner_hits_count: scannerHits.length,
      scanner_hits: scannerHits,
      classification_drift_count: classificationFailures.length,
      launch_promotion_attempts: launchFailures.length,
      replay_failures_count: replayFailures.length,
      independence_group_failures_count: indepFailures.length,
      source_count: bundle.sources.length,
      artifact_count: bundle.sanitised_artifacts.length,
      independence_group_count: bundle.indepenence_groups.length,
    },
    sanitisation_summary: {
      redaction_bounds_loaded: !!REDACTION_BOUNDS.uuid,
      redaction_posture_flags_ok: redactionPostureCheck.ok,
      scanner_clean: scannerHits.length === 0,
      leak_hits: scannerHits,
    },
    schema_ok: !!schemaValidate,
  };
}

// ---------------------------------------------------------------------------
// Evidence builders
// ---------------------------------------------------------------------------

function _nowIso() { return new Date().toISOString(); }

function buildProtocolEvidence({ gates, verdicts, blockers, diagnostics, paths, options }) {
  const opts = options || {};
  const pathsOut = paths || {};
  return {
    $schema: DEFAULTS.protocol_schema,
    milestone: MILESTONE, slice: SLICE, task: 'T02',
    generated: _nowIso(),
    status: opts.status || 'protocol_recorded',
    bundle_gate_ids: [...BUNDLE_GATE_IDS],
    bundle_gate_labels: { ...BUNDLE_GATE_LABELS },
    gates: { ...gates },
    verdicts: { ...verdicts },
    source_count: diagnostics.source_count || 0,
    artifact_count: diagnostics.artifact_count || 0,
    independence_group_count: diagnostics.independence_group_count || 0,
    expected_provenance_hash: diagnostics.expected_provenance_hash || null,
    expected_sidecar_id: diagnostics.expected_sidecar_id || null,
    scanner_hits_count: diagnostics.scanner_hits_count || 0,
    classification_drift_count: diagnostics.classification_drift_count || 0,
    launch_promotion_attempts: diagnostics.launch_promotion_attempts || 0,
    replay_failures_count: diagnostics.replay_failures_count || 0,
    blocker_codes: blockers.map((b) => b.code),
    blockers_count: blockers.length,
    paths: {
      bundle: pathsOut.bundle || DEFAULTS.bundle_output,
      inventory: pathsOut.inventory || DEFAULTS.inventory_output,
      redaction_contract: pathsOut.redaction_contract || DEFAULTS.redaction_contract_output,
      protocol: pathsOut.protocol || DEFAULTS.protocol_output,
      schema: pathsOut.schema || DEFAULTS.schema_path,
    },
    redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false, synthetic_bos: false, raw_reasoning: false, raw_body: false, raw_result_json_result: false, vendor_reuse_strings: false, bounded_digests_only: true, redaction_bounds_loaded: !!REDACTION_BOUNDS.uuid },
    options: { accept_safe_block: !!(opts.acceptSafeBlock), dual_run: opts.dualRun !== false },
  };
}

function buildVerificationEvidence({ bundle, gates, verdicts, blockers, diagnostics, paths, options }) {
  const opts = options || {};
  const pathsOut = paths || {};
  const sources = (bundle && bundle.sources) || [];
  return {
    $schema: DEFAULTS.verification_schema,
    milestone: MILESTONE, slice: SLICE, task: 'T03',
    generated: _nowIso(),
    status: opts.status || 'verification_recorded',
    bundle_gate_ids: [...BUNDLE_GATE_IDS],
    bundle_gate_labels: { ...BUNDLE_GATE_LABELS },
    gates: { ...gates },
    verdicts: { ...verdicts },
    bundle_id: bundle && bundle.bundle_id,
    sidecar_id: bundle && bundle.sidecar_id,
    provenance_hash: bundle && bundle.provenance_hash,
    expected_provenance_hash: diagnostics.expected_provenance_hash || null,
    provenance_match: bundle && diagnostics.expected_provenance_hash ? bundle.provenance_hash === diagnostics.expected_provenance_hash : false,
    sources: sources.map((s) => ({ source_ref: s.source_ref, kind: s.kind, raw_sha256: s.raw_sha256, sanitised_sha256: s.sanitised_sha256, independence_group: s.independence_group, size_bytes: s.size_bytes, claim_ids_count: (s.claim_ids || []).length })),
    source_count: sources.length,
    independence_groups_seen: (bundle && bundle.indepenence_groups) || [],
    sanitised_artifact_count: (bundle && bundle.sanitised_artifacts || []).length,
    replay_keys_match: !!(bundle && bundle.replay_keys && bundle.replay_keys.first_run_provenance_hash === bundle.replay_keys.second_run_provenance_hash && bundle.replay_keys.match === true && bundle.replay_keys.byte_identical === true),
    classification_drift_count: diagnostics.classification_drift_count || 0,
    launch_promotion_attempts: diagnostics.launch_promotion_attempts || 0,
    blocker_codes: blockers.map((b) => b.code),
    blockers,
    paths: {
      bundle: pathsOut.bundle || DEFAULTS.bundle_output,
      inventory: pathsOut.inventory || DEFAULTS.inventory_output,
      redaction_contract: pathsOut.redaction_contract || DEFAULTS.redaction_contract_output,
      verification: pathsOut.verification || DEFAULTS.verification_output,
      schema: pathsOut.schema || DEFAULTS.schema_path,
    },
    redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false, synthetic_bos: false, raw_reasoning: false, raw_body: false, raw_result_json_result: false, vendor_reuse_strings: false, bounded_digests_only: true, redaction_bounds_loaded: !!REDACTION_BOUNDS.uuid },
  };
}

function buildValidationEvidence({ bundle, gates, verdicts, blockers, diagnostics, paths, options, regressionFixture }) {
  const opts = options || {};
  const pathsOut = paths || {};
  return {
    $schema: DEFAULTS.validation_schema,
    milestone: MILESTONE, slice: SLICE, task: 'T01',
    generated: _nowIso(),
    status: opts.status || 'validation_recorded',
    bundle_gate_ids: [...BUNDLE_GATE_IDS],
    bundle_gate_labels: { ...BUNDLE_GATE_LABELS },
    gates: { ...gates },
    verdicts: { ...verdicts },
    per_dimension_summary: {
      orchestration: { verdict: 'PASS', source_dimension_count: (bundle && bundle.classification && bundle.classification.verdicts && bundle.classification.verdicts.orchestration === 'PASS') ? 1 : 0 },
      evidence: { verdict: 'PARTIAL', source_dimension_count: (bundle && bundle.classification && bundle.classification.verdicts && bundle.classification.verdicts.evidence === 'PARTIAL') ? 1 : 0 },
      launch: { verdict: 'PREPARATION_ONLY', source_dimension_count: (bundle && bundle.classification && bundle.classification.verdicts && bundle.classification.verdicts.launch === 'PREPARATION_ONLY') ? 1 : 0 },
    },
    source_count: diagnostics.source_count || 0,
    artifact_count: diagnostics.artifact_count || 0,
    independence_group_count: diagnostics.independence_group_count || 0,
    scanner_hits_count: diagnostics.scanner_hits_count || 0,
    classification_drift_count: diagnostics.classification_drift_count || 0,
    launch_promotion_attempts: diagnostics.launch_promotion_attempts || 0,
    replay_failures_count: diagnostics.replay_failures_count || 0,
    blockers,
    gate_diagnostics: diagnostics || {},
    regression: regressionFixture || null,
    paths: {
      bundle: pathsOut.bundle || DEFAULTS.bundle_output,
      inventory: pathsOut.inventory || DEFAULTS.inventory_output,
      redaction_contract: pathsOut.redaction_contract || DEFAULTS.redaction_contract_output,
      protocol: pathsOut.protocol || DEFAULTS.protocol_output,
      verification: pathsOut.verification || DEFAULTS.verification_output,
      validation: pathsOut.validation || DEFAULTS.validation_output,
      schema: pathsOut.schema || DEFAULTS.schema_path,
    },
    redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false, synthetic_bos: false, raw_reasoning: false, raw_body: false, raw_result_json_result: false, vendor_reuse_strings: false, bounded_digests_only: true, redaction_bounds_loaded: !!REDACTION_BOUNDS.uuid },
    runner_status: opts.runnerStatus || 'PASS',
    runner_exit_code: opts.runnerExitCode != null ? opts.runnerExitCode : EXIT_CODES.BUNDLE_PASS,
  };
}

module.exports = {
  ROOT,
  data,
  BLOCKER_CODES,
  EXIT_CODES,
  DEFAULTS,
  REDACTION_BOUNDS,
  REDACTION_FLAG_VALUES,
  REDACTION_PLACEHOLDERS,
  SOURCE_KINDS,
  BUNDLE_GATE_IDS,
  BUNDLE_GATE_LABELS,
  BUNDLE_VERDICT_VALUES,
  loadSchema,
  validateBundleShape,
  checkRedactionSafety,
  assertBundleWriteSafe,
  sanitizeString,
  canonicalizeSources,
  computeProvenanceHash,
  computeSidecarId,
  evaluateBundleGates,
  evaluateBundleContract,
  buildProtocolEvidence,
  buildVerificationEvidence,
  buildValidationEvidence,
  _validateSource,
  _validateRedactionPosture,
  _detectClassificationDrift,
  _detectLaunchPromotion,
  _verifyReplayKeys,
  _validateSourceAllowlist,
  _validateIndependenceGroups,
  _stableStringify,
};
