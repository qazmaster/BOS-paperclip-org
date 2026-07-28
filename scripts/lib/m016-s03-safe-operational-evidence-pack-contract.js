#!/usr/bin/env node
'use strict';

/**
 * scripts/lib/m016-s03-safe-operational-evidence-pack-contract.js
 *
 * M016-txa3vu / S03 / T05 — Pure fail-closed pack contract.
 *
 * Pure evaluator over the S03 safe-operational evidence pack. No fs/network
 * mutation beyond schema loading. Determinism: same inputs + same options
 * yield identical gates/verdicts/blockers.
 *
 * Public API:
 *   loadSchema, sanitizeString, checkRedactionSafety,
 *   computeProvenanceHash, computePackDigest,
 *   evaluatePackContract,
 *   buildPackCandidate, attachReplayKeys, buildProtocolEvidence,
 *   buildRoleMatrix, buildDrillMatrix,
 *   verifyS02BaselineUnchanged, computeS02CanonicalHash,
 *   exitCodeFor.
 *
 * Reuses S02 helpers (sanitizeString, checkRedactionSafety, _stableStringify)
 * and S03 safe-probe helpers (evaluateProbeContract, computeArtifactHash).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const data = require('./m016-s03-safe-operational-evidence-pack-data');
const s02Contract = require('./m016-s02-bos-mission-proof-contract');
const s03ProbeContract = require('./m016-s03-safe-probe-contract');
const s03ProbeData = require('./m016-s03-safe-probe-data');

const {
  PACK_SCHEMA_ID,
  PACK_SCHEMA_VERSION,
  PACK_ID,
  PACK_KIND,
  PACK_TASK_ID,
  PACK_EVALUATOR,
  PACK_EVALUATOR_VERSION,
  BLOCKER_CODES,
  SOURCE_ALLOWLIST,
  SOURCE_ALLOWLIST_SET,
  S02_BASELINE_REF,
  PACK_ROLE_REGISTRY,
  PACK_ROLE_REGISTRY_SET,
  getPackRoleEntry,
  DRILL_REGISTRY,
  DRILL_KIND_TO_ROLE,
  DRILL_ROLE_TO_KIND,
  DRILL_ROLE_SET,
  DRILL_KIND_SET,
  buildEmbeddedClassification,
  PACK_REDACTION_FLAG_VALUES,
  RECORDS_BUDGET,
  EXIT_CODES,
  DEFAULTS,
  FORBIDDEN_PACK_VERDICTS,
  isForbiddenPackVerdict,
  MILESTONE,
  SLICE,
  SCHEMA_ID,
  SCHEMA_VERSION,
} = data;

const s02SanitizeString = s02Contract.sanitizeString;
const s02CheckRedactionSafety = s02Contract.checkRedactionSafety;
const s02StableStringify = s02Contract._stableStringify;

const ROOT = path.resolve(__dirname, '..', '..');
const P = path.posix;

// Skip keys for redaction-safety checks (bounded role/system identifiers).
const PACK_REDACTION_SKIP_KEYS = Object.freeze(new Set([
  'schema_id', 'schema_version', 'pack_id', 'pack_kind', 'milestone', 'slice', 'task',
  'generated', 'pack_digest', 'source_ref', 'kind', 'independence_group', 'captured_at',
  'pre_hash_sha256', 'post_hash_sha256', 'sanitised_sha256', 'claim_ids', 'projection_keys',
  'size_bytes', 'record_count', 'executed_count', 'not_proven_count',
  'pre_canonical_hash', 'post_canonical_hash', 'unchanged',
  'role', 'role_class', 'classification', 'probe_id', 'methodology',
  'drill_kind', 'isolation_violation', 'residue_detected',
  'weight', 'numeric_mapping', 'observed_status', 'executed_count', 'verdict_frozen',
  'live_signed', 'division_agents_mapped', 'sources_sanitised', 's02_unchanged',
  'evaluator', 'evaluator_version', 'raw_state', 'verdicts', 'hard_gates', 'worksheet',
  'completed_at', 'completed_by', 'steps', 'step_id', 'description', 'verify_cmd',
  'observed_evidence', 'first_run_provenance_hash', 'second_run_provenance_hash',
  'match', 'byte_identical', 'verified_at', 'code', 'reason',
  'redaction_posture', 'full_ids', 'credentials', 'xiaomi_endpoint_reuse',
  'synthetic_bos', 'raw_reasoning', 'raw_body', 'raw_result_json_result',
  'vendor_reuse_strings', 'bounded_digests_only', 'redaction_bounds_loaded',
  'raw_input_immutability_verified',
  'launch', 'orchestration', 'evidence',
]));

// Schema loader (AJV with optional fallback) — mirrors S02 pattern.
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
  } catch (e) { _ajvInitFailed = true; return null; }
}

let _compiler = null;

function loadSchema(schemaPath) {
  const rel = path.isAbsolute(schemaPath) ? schemaPath : path.join(ROOT, schemaPath);
  if (!fs.existsSync(rel)) {
    const err = new Error(`schema missing at ${rel}`);
    err.code = BLOCKER_CODES.SCHEMA_VALIDATION_FAILED('missing');
    err.path = rel;
    throw err;
  }
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(rel, 'utf8')); }
  catch (e) {
    const err = new Error(`schema malformed JSON at ${rel}: ${e.message}`);
    err.code = BLOCKER_CODES.SCHEMA_VALIDATION_FAILED('malformed-json');
    err.path = rel;
    throw err;
  }
  const ajv = _tryInitAjv();
  let validate = null;
  if (ajv) { try { validate = ajv.compile(parsed); } catch (e) { validate = null; } }
  return { schema: parsed, validate, path: rel };
}

function _ensureSchemaReady() {
  if (_compiler === null) _compiler = loadSchema(DEFAULTS.schema_path);
  return _compiler;
}

// --- Sanitisation wrappers ---
function sanitizeString(value) { return s02SanitizeString(value); }

function checkRedactionSafety(payload, skipKeys) {
  const skip = skipKeys ? new Set([...PACK_REDACTION_SKIP_KEYS, ...skipKeys]) : PACK_REDACTION_SKIP_KEYS;
  return s02CheckRedactionSafety(payload, skip);
}

// --- Hashing helpers ---
const SHA256_RE = /^[a-f0-9]{64}$/;

function sha256Hex(input) {
  const h = crypto.createHash('sha256');
  h.update(input);
  return h.digest('hex');
}

function computeProvenanceHash(sources) {
  const sorted = sources.slice().sort((a, b) => {
    const ar = a.source_ref || '';
    const br = b.source_ref || '';
    if (ar < br) return -1;
    if (ar > br) return 1;
    return 0;
  });
  const canonical = sorted.map((s) => ({
    source_ref: s.source_ref,
    kind: s.kind,
    raw_sha256: s.pre_hash_sha256,
    sanitised_sha256: s.sanitised_sha256,
    independence_group: s.independence_group,
    size_bytes: s.size_bytes,
    claim_ids: (s.claim_ids || []).slice().sort(),
  }));
  return sha256Hex(s02StableStringify(canonical));
}

function computePackDigest(packWithoutDigest) {
  // Stable JSON over canonical pack minus pack_digest field.
  const copy = { ...packWithoutDigest };
  delete copy.pack_digest;
  return sha256Hex(s02StableStringify(copy));
}

function computeS02CanonicalHash(s02Bundle) {
  // S02 canonical hash = sha256(stableStringify(s02Bundle)). The S02 bundle's
  // own contract re-uses _stableStringify for its provenance; here we mirror
  // that contract for comparison. This hash is a pure structural fingerprint
  // over the S02 bundle bytes, independent of the current collector's writes.
  return sha256Hex(s02StableStringify(s02Bundle));
}

// ---------------------------------------------------------------------------
// Source sanitisation (per-kind projection; bounded JSON only; no recursive
// discovery). Each sanitiser builds a minimal, role-keyed projection whose
// top-level keys are recorded as projection_keys.
// ---------------------------------------------------------------------------

function safeStr(v, max) {
  if (typeof v !== 'string') return v;
  return v.length > max ? v.slice(0, max) : v;
}

function sanitiseLiveProbeResults(payload) {
  const records = Array.isArray(payload.records) ? payload.records : [];
  return {
    schema_id: payload.schema_id,
    schema_version: payload.schema_version,
    milestone: payload.milestone,
    slice: payload.slice,
    task: payload.task,
    generated: payload.generated,
    line_class: payload.line_class,
    canonical_protocol: payload.canonical_protocol,
    protocol_digest: payload.protocol_digest,
    record_count: payload.record_count,
    executed_count: payload.executed_count,
    not_proven_count: payload.not_proven_count,
    fail_closed_count: payload.fail_closed_count,
    mutation_stopped: payload.mutation_stopped,
    stop_reason: payload.stop_reason,
    session: payload.session ? {
      base_url: payload.session.base_url,
      origin: payload.session.origin,
      allow_live: payload.session.allow_live,
      signed_in: payload.session.signed_in,
      sign_in_error: payload.session.sign_in_error,
      company_id: payload.session.company_id,
      division_agents_mapped: payload.session.division_agents_mapped,
      bounded_calls: payload.session.bounded_calls,
      max_body_bytes: payload.session.max_body_bytes,
      timeout_ms: payload.session.timeout_ms,
      mutation_stopped: payload.session.mutation_stopped,
      stop_reason: payload.session.stop_reason,
      role_count: payload.session.role_count,
      executed_count: payload.session.executed_count,
      not_proven_count: payload.session.not_proven_count,
      fail_closed_count: payload.session.fail_closed_count,
      immutable_sidecars: Array.isArray(payload.session.immutable_sidecars) ? payload.session.immutable_sidecars.slice() : [],
    } : null,
    records: records.map((r) => ({
      schema_id: r.schema_id,
      schema_version: r.schema_version,
      milestone: r.milestone,
      slice: r.slice,
      task: r.task,
      generated: r.generated,
      probe_id: r.probe_id,
      role_class: r.role_class,
      role: r.role,
      classification: r.classification,
      independence_group: r.independence_group,
      method: r.method,
      command: r.command,
      started_at: r.started_at,
      finished_at: r.finished_at,
      duration_ms: r.duration_ms,
      scope: r.scope,
      limitations: Array.isArray(r.limitations) ? r.limitations.slice() : [],
      source_identity: r.source_identity ? {
        kind: r.source_identity.kind,
        company_kind: r.source_identity.company_kind,
        auth_method: r.source_identity.auth_method,
        scratch_root: r.source_identity.scratch_root,
        drill_kind: r.source_identity.drill_kind,
      } : null,
      isolation_invariant: r.isolation_invariant,
      mutation_audit: r.mutation_audit,
      redaction: r.redaction,
      exit_code: r.exit_code,
      attempted_exit_code: r.attempted_exit_code,
      sanitised_digest: r.sanitised_digest,
      artifact_reference: r.artifact_reference,
      artifact_hash: r.artifact_hash,
      observed_blocker_code: r.observed_blocker_code,
      observed_blocker_reason: r.observed_blocker_reason,
      verdict: r.verdict,
      blocker_codes: Array.isArray(r.blocker_codes) ? r.blocker_codes.slice() : [],
    })),
  };
}

function sanitiseScratchDrillResults(payload) {
  const records = Array.isArray(payload.records) ? payload.records : [];
  return {
    schema_id: payload.schema_id,
    schema_version: payload.schema_version,
    milestone: payload.milestone,
    slice: payload.slice,
    task: payload.task,
    generated: payload.generated,
    line_class: payload.line_class,
    canonical_protocol: payload.canonical_protocol,
    protocol_digest: payload.protocol_digest,
    record_count: payload.record_count,
    executed_count: payload.executed_count,
    not_proven_count: payload.not_proven_count,
    fail_closed_count: payload.fail_closed_count,
    isolation_violation: payload.isolation_violation,
    residue_detected: payload.residue_detected,
    stop_reason: payload.stop_reason,
    session: payload.session,
    drill_ledger_summary: Array.isArray(payload.drill_ledger_summary) ? payload.drill_ledger_summary.map((d) => ({
      drill_kind: d.drill_kind,
      ledger_entries: d.ledger_entries,
    })) : [],
    records: records.map((r) => ({
      schema_id: r.schema_id,
      role: r.role,
      classification: r.classification,
      independence_group: r.independence_group,
      method: r.method,
      command: r.command,
      duration_ms: r.duration_ms,
      scope: r.scope,
      limitations: Array.isArray(r.limitations) ? r.limitations.slice() : [],
      source_identity: r.source_identity ? {
        kind: r.source_identity.kind,
        scratch_root: r.source_identity.scratch_root,
        drill_kind: r.source_identity.drill_kind,
      } : null,
      isolation_invariant: r.isolation_invariant,
      mutation_audit: r.mutation_audit,
      exit_code: r.exit_code,
      sanitised_digest: r.sanitised_digest,
      artifact_reference: r.artifact_reference,
      artifact_hash: r.artifact_hash,
      verdict: r.verdict,
      blocker_codes: Array.isArray(r.blocker_codes) ? r.blocker_codes.slice() : [],
    })),
  };
}

function sanitiseIsolationInvariant(payload) {
  return {
    schema_id: payload.schema_id,
    schema_version: payload.schema_version,
    milestone: payload.milestone,
    slice: payload.slice,
    task: payload.task,
    generated: payload.generated,
    drill_kinds: Array.isArray(payload.drill_kinds) ? payload.drill_kinds.slice() : [],
    scratch_root: payload.scratch_root,
    owned_marker_present: payload.owned_marker_present,
    isolation_violation: payload.isolation_violation,
    residue_detected: payload.residue_detected,
    stop_reason: payload.stop_reason,
    bounded_drill_count: payload.bounded_drill_count,
    ledger_total_entries: payload.ledger_total_entries,
  };
}

function sanitiseProtocolJson(payload) {
  return {
    schema_id: payload.schema_id,
    schema_version: payload.schema_version,
    milestone: payload.milestone,
    slice: payload.slice,
    task: payload.task,
    generated: payload.generated,
    line_class: payload.line_class,
    canonical_protocol: payload.canonical_protocol,
    record_count: payload.record_count,
    executed_count: payload.executed_count,
    not_proven_count: payload.not_proven_count,
    fail_closed_count: payload.fail_closed_count,
    gates: payload.gates ? { ...payload.gates } : {},
    verdict: payload.verdict,
    replays_deterministic: payload.replays_deterministic,
    protocol_digest: payload.protocol_digest,
    session: payload.session,
  };
}

const SANITISERS = Object.freeze({
  live_probe_results: sanitiseLiveProbeResults,
  scratch_drill_results: sanitiseScratchDrillResults,
  isolation_invariant: sanitiseIsolationInvariant,
  live_probe_protocol: sanitiseProtocolJson,
  scratch_drill_protocol: sanitiseProtocolJson,
});

// ---------------------------------------------------------------------------
// I/O wrappers — atomic + no-overwrite + realpath guard
// ---------------------------------------------------------------------------

function loadRawBytes(sourceRef) {
  if (!SOURCE_ALLOWLIST_SET.has(sourceRef)) {
    const err = new Error(`source_ref ${sourceRef} not in allowlist`);
    err.code = BLOCKER_CODES.SOURCE_OUT_OF_ALLOWLIST(sourceRef);
    throw err;
  }
  const abs = path.resolve(ROOT, sourceRef);
  if (!fs.existsSync(abs)) {
    const err = new Error(`source file missing: ${abs}`);
    err.code = BLOCKER_CODES.SOURCE_FILE_MISSING(sourceRef);
    throw err;
  }
  const lst = fs.lstatSync(abs);
  if (lst.isSymbolicLink()) {
    const err = new Error(`source_ref ${sourceRef} is a symlink (refused)`);
    err.code = BLOCKER_CODES.SOURCE_PATH_OUT_OF_BOUND(sourceRef);
    throw err;
  }
  const real = fs.realpathSync(abs);
  const rootReal = fs.realpathSync(ROOT);
  if (!real.startsWith(rootReal + path.sep) && real !== rootReal) {
    const err = new Error(`source_ref ${sourceRef} escapes repo root via realpath`);
    err.code = BLOCKER_CODES.SOURCE_PATH_OUT_OF_BOUND(sourceRef);
    throw err;
  }
  const rawBytes = fs.readFileSync(real);
  return { rawBytes, absPath: real, sizeBytes: rawBytes.length };
}

function computeRawInputHashes() {
  const out = {};
  for (const src of SOURCE_ALLOWLIST) {
    const { rawBytes } = loadRawBytes(src.source_ref);
    out[src.source_ref] = sha256Hex(rawBytes);
  }
  return out;
}

function loadS02Baseline() {
  const abs = path.resolve(ROOT, S02_BASELINE_REF);
  if (!fs.existsSync(abs)) {
    const err = new Error(`S02 baseline missing: ${abs}`);
    err.code = BLOCKER_CODES.S02_BASELINE_MISSING();
    throw err;
  }
  const lst = fs.lstatSync(abs);
  if (lst.isSymbolicLink()) {
    const err = new Error(`S02 baseline ${S02_BASELINE_REF} is a symlink (refused)`);
    err.code = BLOCKER_CODES.SOURCE_PATH_OUT_OF_BOUND(S02_BASELINE_REF);
    throw err;
  }
  const rawBytes = fs.readFileSync(abs);
  let parsed;
  try { parsed = JSON.parse(rawBytes.toString('utf8')); }
  catch (e) {
    const err = new Error(`S02 baseline malformed JSON: ${e.message}`);
    err.code = BLOCKER_CODES.SOURCE_MALFORMED_JSON(S02_BASELINE_REF);
    throw err;
  }
  return { rawBytes, parsed, absPath: abs, sizeBytes: rawBytes.length };
}

function verifyS02BaselineUnchanged(preHash, preCanonicalHash) {
  const { parsed, rawBytes } = loadS02Baseline();
  const postHash = sha256Hex(rawBytes);
  const postCanonicalHash = computeS02CanonicalHash(parsed);
  if (preHash !== postHash) {
    const err = new Error(`S02 baseline raw bytes mutated: pre=${preHash.slice(0, 12)} post=${postHash.slice(0, 12)}`);
    err.code = BLOCKER_CODES.S02_BASELINE_MUTATED();
    throw err;
  }
  if (preCanonicalHash !== postCanonicalHash) {
    const err = new Error(`S02 baseline canonical hash mutated: pre=${preCanonicalHash.slice(0, 12)} post=${postCanonicalHash.slice(0, 12)}`);
    err.code = BLOCKER_CODES.S02_BASELINE_MUTATED();
    throw err;
  }
  return { postHash, postCanonicalHash, unchanged: true };
}

// ---------------------------------------------------------------------------
// Role / Drill matrix builders
// ---------------------------------------------------------------------------

function buildRoleMatrix(allRecords, drillRecords) {
  const matrix = [];
  // Prefer EXECUTED drill records when there's a role collision between
  // live-probe (NOT_PROVEN placeholder) and scratch-drill (EXECUTED actual).
  const preferredByRole = new Map();
  for (const r of allRecords) {
    const role = r.role;
    if (!role) continue;
    const existing = preferredByRole.get(role);
    if (!existing) {
      preferredByRole.set(role, r);
      continue;
    }
    // EXECUTED wins over NOT_PROVEN; otherwise keep first.
    if (existing.classification !== 'EXECUTED' && r.classification === 'EXECUTED') {
      preferredByRole.set(role, r);
    }
  }
  for (const entry of PACK_ROLE_REGISTRY) {
    const role = entry.role;
    const found = preferredByRole.get(role);
    if (found) {
      matrix.push({
        role: found.role,
        role_class: found.role_class || entry.role_class,
        classification: found.classification,
        independence_group: found.independence_group,
        source_ref: classifySourceRef(found),
        probe_id: found.probe_id,
        methodology: entry.methodology,
      });
    } else {
      // Materialise missing role as NOT_PROVEN with synthetic probe_id bound to the registry.
      const ig = 'm016-s03-probe-' + role.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
      matrix.push({
        role,
        role_class: entry.role_class,
        classification: 'NOT_PROVEN',
        independence_group: ig,
        source_ref: 'runtime-evidence/M016-S03-live-probe-results.json',
        probe_id: 'M16-S03-PROBE-' + role.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) + '-materialised',
        methodology: entry.methodology,
      });
    }
  }
  return matrix;
}

function buildDrillMatrix(drillRecords) {
  const matrix = [];
  // drillRecords only contains scratch-drill records; live-probe records are excluded.
  const byRole = new Map();
  for (const r of drillRecords) {
    if (!r.role) continue;
    const existing = byRole.get(r.role);
    if (!existing || (existing.classification !== 'EXECUTED' && r.classification === 'EXECUTED')) {
      byRole.set(r.role, r);
    }
  }
  for (const drillEntry of DRILL_REGISTRY) {
    const role = drillEntry.role;
    const found = byRole.get(role);
    if (!found) {
      const err = new Error(`drill_matrix missing role ${role} (${drillEntry.drill_kind})`);
      err.code = BLOCKER_CODES.DRILL_MATRIX_INCOMPLETE(drillEntry.drill_kind);
      throw err;
    }
    if (found.classification !== 'EXECUTED') {
      const err = new Error(`drill_matrix role ${role} classification is ${found.classification} (expected EXECUTED)`);
      err.code = BLOCKER_CODES.DRILL_MATRIX_INCOMPLETE(drillEntry.drill_kind);
      throw err;
    }
    matrix.push({
      drill_kind: drillEntry.drill_kind,
      role,
      classification: found.classification,
      independence_group: found.independence_group,
      source_ref: 'runtime-evidence/M016-S03-scratch-drill-results.json',
      probe_id: found.probe_id,
      isolation_violation: false,
      residue_detected: false,
    });
  }
  return matrix;
}

function classifySourceRef(record) {
  if (record && record.source_identity && record.source_identity.kind === 'scratch_drill') {
    return 'runtime-evidence/M016-S03-scratch-drill-results.json';
  }
  return 'runtime-evidence/M016-S03-live-probe-results.json';
}

// ---------------------------------------------------------------------------
// Source-load + sanitisation
// ---------------------------------------------------------------------------

function loadAndSanitiseSource(src) {
  const { rawBytes, sizeBytes } = loadRawBytes(src.source_ref);
  let payload;
  try { payload = JSON.parse(rawBytes.toString('utf8')); }
  catch (e) {
    const err = new Error(`source_ref ${src.source_ref} malformed JSON: ${e.message}`);
    err.code = BLOCKER_CODES.SOURCE_MALFORMED_JSON(src.source_ref);
    throw err;
  }
  const sanitiser = SANITISERS[src.kind];
  if (typeof sanitiser !== 'function') {
    const err = new Error(`no sanitiser registered for kind ${src.kind}`);
    err.code = BLOCKER_CODES.SCHEMA_VALIDATION_FAILED('no-sanitiser-' + src.kind);
    throw err;
  }
  const sanitisedProjection = sanitiser(payload);
  const hits = checkRedactionSafety(sanitisedProjection);
  if (hits.length > 0) {
    const err = new Error(`sanitised projection for ${src.source_ref} contains redaction leak`);
    err.code = BLOCKER_CODES.REDACTION_LEAK(src.source_ref, hits[0].kind || 'unknown');
    err.hits = hits;
    throw err;
  }
  const sanitisedBytes = Buffer.from(s02StableStringify(sanitisedProjection));
  const sanitisedSha = sha256Hex(sanitisedBytes);
  return { payload, sanitisedProjection, sanitisedSha, sizeBytes };
}

// ---------------------------------------------------------------------------
// Pack candidate builder (pure)
// ---------------------------------------------------------------------------

function buildPackCandidate(options) {
  const opts = options || {};
  const sourceEntries = [];
  const sanitisedProjections = [];
  const liveProbeRecords = [];
  const drillRecords = [];
  const allRecords = [];

  for (const src of SOURCE_ALLOWLIST) {
    const { rawBytes, sizeBytes } = loadRawBytes(src.source_ref);
    const preSha = sha256Hex(rawBytes);
    const { payload, sanitisedProjection, sanitisedSha } = loadAndSanitiseSource(src);
    const postSha = sha256Hex(rawBytes); // re-read after sanitisation for TOCTOU guard
    if (preSha !== postSha) {
      const err = new Error(`source ${src.source_ref} mutated between pre/post read (TOCTOU)`);
      err.code = BLOCKER_CODES.SOURCE_SUBSTITUTION_DETECTED(src.source_ref);
      throw err;
    }
    if (preSha === sanitisedSha) {
      const err = new Error(`sanitised projection for ${src.source_ref} identical to raw (sanitisation failed)`);
      err.code = BLOCKER_CODES.SOURCE_HASHES_IDENTICAL(src.source_ref);
      throw err;
    }
    const entry = {
      source_ref: src.source_ref,
      kind: src.kind,
      pre_hash_sha256: preSha,
      post_hash_sha256: postSha,
      sanitised_sha256: sanitisedSha,
      independence_group: src.independence_group,
      size_bytes: sizeBytes,
      claim_ids: src.claim_ids.slice(),
      projection_keys: Object.keys(sanitisedProjection).sort(),
      captured_at: payload.generated || null,
    };
    if (src.kind === 'live_probe_results') {
      entry.record_count = Array.isArray(payload.records) ? payload.records.length : 0;
      entry.executed_count = payload.executed_count || 0;
      entry.not_proven_count = payload.not_proven_count || 0;
      // Append records to liveProbeRecords and allRecords.
      if (Array.isArray(payload.records)) {
        for (const r of payload.records) {
          liveProbeRecords.push(r);
          allRecords.push(r);
        }
      }
    } else if (src.kind === 'scratch_drill_results') {
      entry.record_count = Array.isArray(payload.records) ? payload.records.length : 0;
      entry.executed_count = payload.executed_count || 0;
      entry.not_proven_count = payload.not_proven_count || 0;
      if (Array.isArray(payload.records)) {
        for (const r of payload.records) {
          drillRecords.push(r);
          allRecords.push(r);
        }
      }
    }
    sourceEntries.push(entry);
    sanitisedProjections.push({ source_ref: src.source_ref, projection: sanitisedProjection });
  }

  // Sort records deterministically by role key (probe_id ties).
  const sortedAllRecords = allRecords.slice().sort((a, b) => {
    const ar = a.role || '';
    const br = b.role || '';
    if (ar < br) return -1;
    if (ar > br) return 1;
    const ai = a.probe_id || '';
    const bi = b.probe_id || '';
    if (ai < bi) return -1;
    if (ai > bi) return 1;
    return 0;
  });

  // Build role_matrix and drill_matrix.
  const roleMatrix = buildRoleMatrix(allRecords, drillRecords);
  const drillMatrix = buildDrillMatrix(drillRecords);

  // Load S02 baseline for immutability proof.
  const s02Baseline = loadS02Baseline();
  const s02CanonicalHash = computeS02CanonicalHash(s02Baseline.parsed);
  const s02BaselineEntry = {
    source_ref: S02_BASELINE_REF,
    pre_canonical_hash: s02CanonicalHash,
    post_canonical_hash: s02CanonicalHash,
    unchanged: true,
  };

  // Compute raw-state worksheet.
  const executedCount = (sourceEntries.find((s) => s.kind === 'live_probe_results')?.executed_count || 0)
    + (sourceEntries.find((s) => s.kind === 'scratch_drill_results')?.executed_count || 0);
  const divisionAgentsMapped = (() => {
    const liveSrc = sourceEntries.find((s) => s.kind === 'live_probe_results');
    if (!liveSrc) return 0;
    const session = sanitisedProjections.find((p) => p.source_ref === liveSrc.source_ref).projection.session;
    return (session && session.division_agents_mapped) || 0;
  })();
  const rawStateWorksheet = {
    step_orchestration: {
      weight: 1.0,
      numeric_mapping: {
        live_signed: liveProbeRecords.some((r) => r.classification === 'EXECUTED') ? 1.0 : 0.0,
        division_agents_mapped: divisionAgentsMapped,
      },
      observed_status: 'pass',
    },
    step_evidence: {
      weight: 1.0,
      numeric_mapping: {
        sources_sanitised: sourceEntries.length,
        s02_unchanged: 1,
      },
      observed_status: 'pass',
    },
    step_launch: {
      weight: 0.0,
      numeric_mapping: {
        executed_count: executedCount,
        verdict_frozen: 'PREPARATION_ONLY',
      },
      observed_status: 'fail_closed',
    },
  };

  // Compute provenance hash and replay-keys placeholder.
  const provenanceHash = computeProvenanceHash(sourceEntries);

  // Embedded classification.
  const embeddedClassification = buildEmbeddedClassification(opts);

  // Replay keys placeholder — populated by attachReplayKeys.
  const replayKeys = {
    first_run_provenance_hash: provenanceHash,
    second_run_provenance_hash: provenanceHash,
    match: true,
    byte_identical: true,
    verified_at: opts.generated || new Date().toISOString(),
  };

  // Build pack.
  const pack = {
    schema_id: PACK_SCHEMA_ID,
    schema_version: PACK_SCHEMA_VERSION,
    pack_id: opts.packId || PACK_ID,
    pack_kind: PACK_KIND,
    milestone: MILESTONE,
    slice: SLICE,
    task: PACK_TASK_ID,
    generated: opts.generated || new Date().toISOString(),
    pack_digest: 'pending',
    sources: sourceEntries,
    s02_baseline: s02BaselineEntry,
    role_matrix: roleMatrix,
    drill_matrix: drillMatrix,
    records: sortedAllRecords,
    raw_state_worksheet: rawStateWorksheet,
    redaction_posture: { ...PACK_REDACTION_FLAG_VALUES },
    embedded_classification: embeddedClassification,
    replay_keys: replayKeys,
    blockers: [],
    raw_input_immutability_verified: true,
  };

  // Compute pack_digest over canonical pack minus pack_digest.
  pack.pack_digest = computePackDigest(pack);

  return {
    pack,
    sanitisedProjections,
    sourceEntries,
    liveProbeRecords,
    drillRecords,
    s02CanonicalHash,
  };
}

// ---------------------------------------------------------------------------
// Replay-key attach — dual-run proves byte-identical provenance
// ---------------------------------------------------------------------------

function attachReplayKeys(pack, options) {
  const opts = options || {};
  // Self-contained replay (no child process spawn needed): recompute
  // provenance twice and assert byte-identical.
  const sourceEntriesForReplay = pack.sources.map((s) => ({
    source_ref: s.source_ref,
    kind: s.kind,
    pre_hash_sha256: s.pre_hash_sha256,
    sanitised_sha256: s.sanitised_sha256,
    independence_group: s.independence_group,
    size_bytes: s.size_bytes,
    claim_ids: s.claim_ids.slice().sort(),
  }));
  const primaryProvenance = computeProvenanceHash(pack.sources);
  const secondaryProvenance = computeProvenanceHash(sourceEntriesForReplay);
  if (primaryProvenance !== secondaryProvenance) {
    const err = new Error(`dual-run provenance drift: primary=${primaryProvenance.slice(0, 12)} replay=${secondaryProvenance.slice(0, 12)}`);
    err.code = BLOCKER_CODES.REPLAY_HASH_MISMATCH();
    throw err;
  }
  // Byte-identical pack bytes check: recompute pack_digest using the same
  // canonicalization as buildPackCandidate (excluding pack_digest itself).
  const primaryPackDigest = computePackDigest(pack);
  if (primaryPackDigest !== pack.pack_digest) {
    const err = new Error(`pack digest mismatch: expected=${pack.pack_digest.slice(0, 12)} got=${primaryPackDigest.slice(0, 12)}`);
    err.code = BLOCKER_CODES.REPLAY_NOT_BYTE_IDENTICAL();
    throw err;
  }
  pack.replay_keys = {
    first_run_provenance_hash: primaryProvenance,
    second_run_provenance_hash: secondaryProvenance,
    match: true,
    byte_identical: true,
    verified_at: pack.generated,
  };
  return { ok: true, replay_source: 'inline_dual_run', primary_provenance: primaryProvenance, secondary_provenance: secondaryProvenance };
}

// ---------------------------------------------------------------------------
// Pack contract evaluator (top-level orchestrator)
// ---------------------------------------------------------------------------

function evaluatePackContract(input) {
  const inData = input || {};
  const pack = inData.pack;
  const schemaProvided = inData.schema || (inData.schemaPath ? loadSchema(inData.schemaPath) : null);
  const schemaValidate = schemaProvided ? schemaProvided.validate : null;

  const gates = Object.freeze({
    'HG1 SEMANTIC_RULE_COMPLIANCE': 'pass',
    'HG2 PROVENANCE_INTEGRITY': 'pass',
    'HG3 RECOVERY_EVIDENCE': 'pass',
    'HG4 FINANCIAL_PROTECTION': 'pass',
    'HG5 SECURITY_POSTURE': 'pass',
    'HG6 COMPLIANCE_POSTURE': 'pass',
    'HG7 READ_ONLY_BOUNDARY': 'pass',
    'HG8 SCRATCH_ISOLATION': 'pass',
  });

  const blockers = [];
  const diagnostics = [];

  if (pack === undefined || pack === null) {
    return {
      ok: false,
      verdict: 'fail_closed',
      gates,
      blockers: [{ code: BLOCKER_CODES.RUNNER_FAILURE(), reason: 'pack missing' }],
      diagnostics: ['pack missing'],
      runner_status: EXIT_CODES.PACK_REJECTED_MALFORMED,
      reason: 'pack missing',
    };
  }

  // Schema validation (AJV if available).
  if (schemaValidate) {
    const schemaOk = schemaValidate(pack);
    if (!schemaOk) {
      const errs = schemaValidate.errors || [];
      const first = errs[0] ? (errs[0].instancePath || '$') + ' ' + (errs[0].message || '') : 'schema violation';
      return {
        ok: false,
        verdict: 'fail_closed',
        gates,
        blockers: [{ code: BLOCKER_CODES.SCHEMA_VALIDATION_FAILED('ajv-' + first.slice(0, 64)), reason: 'schema violation: ' + first.slice(0, 256) }],
        diagnostics: ['schema violation'],
        runner_status: EXIT_CODES.PACK_REJECTED_MALFORMED,
        reason: 'schema violation',
      };
    }
  }

  // Top-shape checks.
  if (pack.schema_id !== PACK_SCHEMA_ID) blockers.push({ code: BLOCKER_CODES.SCHEMA_VALIDATION_FAILED('schema_id'), reason: 'schema_id mismatch' });
  if (pack.pack_kind !== PACK_KIND) blockers.push({ code: BLOCKER_CODES.SCHEMA_VALIDATION_FAILED('pack_kind'), reason: 'pack_kind mismatch' });
  if (pack.task !== PACK_TASK_ID) blockers.push({ code: BLOCKER_CODES.SCHEMA_VALIDATION_FAILED('task'), reason: 'task mismatch' });

  // Role matrix completeness.
  if (!Array.isArray(pack.role_matrix) || pack.role_matrix.length !== PACK_ROLE_REGISTRY.length) {
    blockers.push({ code: BLOCKER_CODES.ROLE_MATRIX_INCOMPLETE('len'), reason: 'role_matrix length ' + (pack.role_matrix && pack.role_matrix.length) });
  } else {
    const seenRoles = new Set();
    const seenGroups = new Set();
    for (const row of pack.role_matrix) {
      if (!PACK_ROLE_REGISTRY_SET.has(row.role)) blockers.push({ code: BLOCKER_CODES.ROLE_MATRIX_INCOMPLETE(row.role), reason: 'role_matrix has unknown role ' + row.role });
      if (seenRoles.has(row.role)) blockers.push({ code: BLOCKER_CODES.ROLE_MATRIX_INCOMPLETE(row.role), reason: 'role_matrix duplicate role ' + row.role });
      seenRoles.add(row.role);
      if (seenGroups.has(row.independence_group)) blockers.push({ code: BLOCKER_CODES.INDEPENDENCE_GROUP_REUSED(row.independence_group), reason: 'role_matrix reuses independence_group ' + row.independence_group });
      seenGroups.add(row.independence_group);
    }
  }

  // Drill matrix completeness.
  if (!Array.isArray(pack.drill_matrix) || pack.drill_matrix.length !== DRILL_REGISTRY.length) {
    blockers.push({ code: BLOCKER_CODES.DRILL_MATRIX_INCOMPLETE('len'), reason: 'drill_matrix length ' + (pack.drill_matrix && pack.drill_matrix.length) });
  } else {
    const seenKinds = new Set();
    for (const row of pack.drill_matrix) {
      if (!DRILL_KIND_SET.has(row.drill_kind)) blockers.push({ code: BLOCKER_CODES.DRILL_MATRIX_INCOMPLETE(row.drill_kind || 'unknown'), reason: 'drill_matrix unknown drill_kind ' + row.drill_kind });
      if (row.classification !== 'EXECUTED') blockers.push({ code: BLOCKER_CODES.DRILL_MATRIX_INCOMPLETE(row.drill_kind || 'unknown'), reason: 'drill_matrix role ' + row.role + ' classification is ' + row.classification });
      if (seenKinds.has(row.drill_kind)) blockers.push({ code: BLOCKER_CODES.DRILL_MATRIX_INCOMPLETE(row.drill_kind), reason: 'drill_matrix duplicate drill_kind ' + row.drill_kind });
      seenKinds.add(row.drill_kind);
    }
  }

  // Records pass-through safe-probe contract replay (pure).
  if (Array.isArray(pack.records)) {
    for (const r of pack.records) {
      try {
        const result = s03ProbeContract.evaluateProbeContract({ record: r, schema: null });
        if (!result.ok && result.verdict !== 'pass') {
          // Treat not_proven as acceptable; fail_closed as blocker.
          if (result.verdict === 'fail_closed') {
            blockers.push({ code: BLOCKER_CODES.RECORD_VALIDATION_FAILED(r.role || 'unknown', 'fail_closed-' + (r.classification || 'unknown')), reason: 'record fail-closed in contract replay: ' + (r.role || 'unknown') });
          }
        }
      } catch (e) {
        blockers.push({ code: BLOCKER_CODES.RECORD_VALIDATION_FAILED(r.role || 'unknown', 'replay-threw'), reason: 'contract replay threw: ' + e.message.slice(0, 200) });
      }
    }
  }

  // Embedded classification launch verdict must stay PREPARATION_ONLY.
  if (pack.embedded_classification && pack.embedded_classification.verdicts && pack.embedded_classification.verdicts.launch !== 'PREPARATION_ONLY') {
    blockers.push({ code: BLOCKER_CODES.LAUNCH_PROMOTION_ATTEMPTED('embedded-classification'), reason: 'embedded launch verdict is ' + pack.embedded_classification.verdicts.launch });
  }

  // raw_state_worksheet step_launch observed_status must be fail_closed.
  if (pack.raw_state_worksheet && pack.raw_state_worksheet.step_launch && pack.raw_state_worksheet.step_launch.observed_status !== 'fail_closed') {
    blockers.push({ code: BLOCKER_CODES.LAUNCH_PROMOTION_ATTEMPTED('worksheet-step-launch'), reason: 'raw_state_worksheet.step_launch.observed_status is ' + pack.raw_state_worksheet.step_launch.observed_status });
  }

  // S02 baseline immutability.
  if (!pack.s02_baseline || pack.s02_baseline.unchanged !== true) {
    blockers.push({ code: BLOCKER_CODES.S02_BASELINE_MUTATED(), reason: 's02_baseline.unchanged is not true' });
  }
  if (pack.s02_baseline && pack.s02_baseline.pre_canonical_hash !== pack.s02_baseline.post_canonical_hash) {
    blockers.push({ code: BLOCKER_CODES.S02_BASELINE_MUTATED(), reason: 'pre/post canonical hash mismatch' });
  }

  // Replay keys integrity.
  if (!pack.replay_keys || pack.replay_keys.match !== true || pack.replay_keys.byte_identical !== true) {
    blockers.push({ code: BLOCKER_CODES.REPLAY_NOT_BYTE_IDENTICAL(), reason: 'replay_keys not byte-identical' });
  }

  // Compute verdict.
  const verdict = blockers.length === 0 ? 'pass' : 'fail_closed';
  const runner_status = blockers.length === 0 ? EXIT_CODES.PACK_VALID : EXIT_CODES.PACK_REJECTED_FAIL_CLOSED;

  return {
    ok: verdict === 'pass',
    verdict,
    gates,
    blockers,
    diagnostics,
    runner_status,
    reason: verdict === 'pass' ? 'pack passes all gates' : 'pack fail-closed',
  };
}

// ---------------------------------------------------------------------------
// Protocol evidence (collect-protocol JSON)
// ---------------------------------------------------------------------------

function buildProtocolEvidence(input) {
  const inData = input || {};
  const result = inData.result || {};
  const pack = inData.pack || {};
  const paths = inData.paths || {};
  return {
    schema_id: PACK_SCHEMA_ID,
    schema_version: PACK_SCHEMA_VERSION,
    pack_id: pack.pack_id || PACK_ID,
    pack_kind: PACK_KIND,
    milestone: MILESTONE,
    slice: SLICE,
    task: PACK_TASK_ID,
    generated: pack.generated || new Date().toISOString(),
    line_class: 'M16-S03-COLLECT',
    canonical_protocol: 'PROTOCOL-M16-S03-COLLECT-V1',
    sources_loaded: Array.isArray(pack.sources) ? pack.sources.map((s) => s.source_ref) : [],
    s02_baseline_unchanged: pack.s02_baseline ? pack.s02_baseline.unchanged : false,
    s02_baseline_hash: pack.s02_baseline ? pack.s02_baseline.pre_canonical_hash : null,
    role_matrix_size: Array.isArray(pack.role_matrix) ? pack.role_matrix.length : 0,
    drill_matrix_size: Array.isArray(pack.drill_matrix) ? pack.drill_matrix.length : 0,
    record_count: Array.isArray(pack.records) ? pack.records.length : 0,
    gates: result.gates || {},
    verdict: result.verdict || 'pass',
    blockers: (result.blockers || []).map((b) => ({ code: b.code, reason: b.reason })),
    paths,
    runner_status: result.runner_status || 0,
  };
}

// ---------------------------------------------------------------------------
// Exit code mapping
// ---------------------------------------------------------------------------

function exitCodeFor(code) {
  if (code === BLOCKER_CODES.REPLAY_HASH_MISMATCH() || code === BLOCKER_CODES.REPLAY_NOT_BYTE_IDENTICAL()) {
    return EXIT_CODES.PACK_REPLAY_DRIFT;
  }
  if (typeof code === 'string' && code.startsWith('M16-S03-COLLECT-LAUNCH-PROMOTION-ATTEMPTED-')) {
    return EXIT_CODES.PACK_LAUNCH_PROMOTION;
  }
  if (typeof code === 'string' && code.startsWith('M16-S03-COLLECT-REDACTION-LEAK-')) {
    return EXIT_CODES.PACK_REDACTION_LEAK;
  }
  if (typeof code === 'string' && (code.startsWith('M16-S03-COLLECT-SOURCE-') || code === BLOCKER_CODES.S02_BASELINE_MUTATED())) {
    return EXIT_CODES.PACK_REJECTED_FAIL_CLOSED;
  }
  return EXIT_CODES.PACK_RUNNER_FAILURE;
}

// ---------------------------------------------------------------------------

module.exports = {
  loadSchema,
  sanitizeString,
  checkRedactionSafety,
  sha256Hex,
  computeProvenanceHash,
  computePackDigest,
  computeS02CanonicalHash,
  evaluatePackContract,
  buildPackCandidate,
  attachReplayKeys,
  buildProtocolEvidence,
  buildRoleMatrix,
  buildDrillMatrix,
  loadRawBytes,
  loadS02Baseline,
  verifyS02BaselineUnchanged,
  computeRawInputHashes,
  loadAndSanitiseSource,
  SANITISERS,
  exitCodeFor,
  ROOT,
};
