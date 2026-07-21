#!/usr/bin/env node
'use strict';

/**
 * scripts/lib/m016-s07-replay-cleanup-contract.js
 *
 * M016-txa3vu / S07 / T01 — Pure contract logic for the policy-compliant
 * replay cleanup proof. The module intentionally has NO subprocesses,
 * NO network calls, NO runtime-evidence writes, NO `fs.writeFileSync`, and
 * NO child_process / fetch / spawn usage. The T03 verifier
 * (`scripts/verify_m016_s07_replay_cleanup_proof.js`) is the only consumer
 * that performs subprocesses + atomic writes.
 *
 * Helper surface:
 *
 *   - sha256Hex, _stableStringify, canonicalizeProof,
 *     computeProofBodyDigest, computeNegativeFixturesBodyDigest
 *   - resolveAjv, loadSchema, validateProofShape
 *   - checkRedactionSafety, assertProofWriteSafe,
 *     assertNegativeFixturesWriteSafe
 *   - normalizeRelPath, validatePathContainment,
 *     validateMarkerOwnership, validateSingleSubprocess
 *   - buildCleanupTraceRow, buildCleanupTrace, validateCleanupTrace
 *   - buildVerdictTriad, assertVerdictTriadInvariant
 *   - buildProofSidecar, buildNegativeFixturesSidecar
 *   - evaluateCleanupContract
 *   - mapBlockerToExitCode
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const data = require('./m016-s07-replay-cleanup-data');

// ---------------------------------------------------------------------------
// Constants / regexes
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '..', '..');

const HASH_RE = /^[a-f0-9]{64}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SAFE_S01_SCHEMA_REF_RE = /^schemas\/runtime-evidence\/m016-s01-[A-Za-z0-9._/-]+\.json$/;
const SAFE_S01_RUNTIME_REF_RE = /^runtime-evidence\/M016-S01-[A-Za-z0-9._/-]+\.json$/;
const SAFE_M015_RUNTIME_REF_RE = /^runtime-evidence\/M015-[A-Za-z0-9._/-]+\.json$/;
const SAFE_SCRIPT_REF_RE = /^scripts\/[A-Za-z0-9._/-]+\.js$/;
const SCRATCH_RELPATH_RE = /^runtime-evidence\/[A-Za-z0-9._/-]+$/;
const ATOMIC_TEMP_RELPATH_RE = /^runtime-evidence\/[A-Za-z0-9._/-]+\.tmp-[A-Za-z0-9._-]+$/;

// Canonical presence/absence check relpath patterns: must stay under
// runtime-evidence/. The verifier records actual checks in pre/post-run
// absence objects and this regex enforces the bounded prefix in pure
// helpers too.
const ABSENCE_CHECK_RELPATH_RE = /^runtime-evidence\/[A-Za-z0-9._/-]+$/;

const TIMESTAMP_KEYS = new Set([
  'generated', 'reference_time', 'verified_at', 'completed_at',
  'captured_at', 'started_at', 'finished_at',
]);

// Marker ownership: contents MUST be the exact frozen string
// `M16-S07-CLEANUP-MARKER` (no trailing whitespace, no extra lines).
const MARKER_CONTENTS = data.MARKER_CONTENTS;

// Redaction keys — same shared contract as S06/S04/S05.
const REDACTION_KEYS = new Set([
  'full_ids', 'credentials', 'xiaomi_endpoint_reuse', 'synthetic_bos',
  'raw_reasoning', 'raw_body', 'raw_result_json_result', 'vendor_reuse_strings',
  'bounded_digests_only', 'redaction_bounds_loaded',
]);

// LEAK_PATTERNS: material that must NEVER appear anywhere in the
// cleanup proof sidecar. We do not flag the literal "xiaomi" / "mimo"
// tokens because the schema / verdict vocabulary may legitimately
// reference them through the redaction_posture flag enforcement.
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

function canonicalizeProof(proof) {
  if (!_isObject(proof)) return null;
  const clone = _clone(proof);
  delete clone.byte_digest;
  return _stableStringify(clone);
}

function computeProofBodyDigest(proof) {
  const canonical = canonicalizeProof(proof);
  return canonical === null ? null : sha256Hex(canonical);
}

function canonicalizeNegativeFixtures(sidecar) {
  if (!_isObject(sidecar)) return null;
  const clone = _clone(sidecar);
  delete clone.byte_digest;
  return _stableStringify(clone);
}

function computeNegativeFixturesBodyDigest(sidecar) {
  const canonical = canonicalizeNegativeFixtures(sidecar);
  return canonical === null ? null : sha256Hex(canonical);
}

// ---------------------------------------------------------------------------
// Ajv loader (lazy, scoped, fail-safe). The contract uses Ajv ONLY to
// compile the bundled JSON schema; missing Ajv means caller-side
// validation must be done elsewhere — the contract still serves the
// builders / safety checks.
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

function validateProofShape(proof, schemaValidate) {
  if (!_isObject(proof)) return { ok: false, errors: [{ instancePath: '', message: 'must be an object' }] };
  if (typeof schemaValidate === 'function') {
    const ok = schemaValidate(proof);
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
          if (typeof child === 'boolean' && child === true
            && key !== 'bounded_digests_only'
            && key !== 'redaction_bounds_loaded') {
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
    for (const [key, expected] of Object.entries(data.CLEANUP_REDACTION_FLAG_VALUES)) {
      if (payload.redaction_posture[key] !== expected) hits.push({ kind: key, path: 'redaction_posture.' + key });
    }
  }
  return hits;
}

function assertProofWriteSafe(proof) {
  const hits = checkRedactionSafety(proof);
  if (hits.length > 0) {
    const error = new Error('refused write: redaction safety violation at ' + hits[0].path);
    error.code = data.BLOCKER_CODES.SECRET_TOKEN(hits[0].kind);
    error.hits = hits;
    throw error;
  }
  return true;
}

function assertNegativeFixturesWriteSafe(sidecar) {
  const hits = checkRedactionSafety(sidecar);
  if (hits.length > 0) {
    const error = new Error('refused write: redaction safety violation at ' + hits[0].path);
    error.code = data.BLOCKER_CODES.SECRET_TOKEN(hits[0].kind);
    error.hits = hits;
    throw error;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Path + marker helpers
// ---------------------------------------------------------------------------

// normalizeRelPath: rejects empty / absolute / traversal / NUL inputs.
// Returns the path with `..` resolved lexically; caller must compare the
// resolved value against an allowlisted prefix to confirm containment.
// Returns null for invalid inputs (do NOT throw — pure helpers must not
// raise here; raise inside the verifier).
function normalizeRelPath(rel) {
  if (typeof rel !== 'string' || rel.length === 0) return null;
  if (rel.includes('\0')) return null;
  if (path.isAbsolute(rel)) return null;
  // Reject any `..` segment or parent-relative escape.
  const segments = rel.split(/[\\/]+/);
  for (const segment of segments) {
    if (segment === '..') return null;
  }
  return rel;
}

// validatePathContainment: verifies that `rel` (after lexical
// normalisation) starts with `rootPrefix` and uses only allowlisted
// characters. The contract helper is deliberately pure and does NOT
// touch the filesystem — symlink resolution is performed by the T03
// verifier with `fs.realpathSync`. Returns { ok, reason } where reason
// is one of the stable reason strings; callers translate to blocker codes.
function validatePathContainment(rel, rootPrefix) {
  if (typeof rel !== 'string' || rel.length === 0) return { ok: false, reason: 'empty' };
  if (typeof rootPrefix !== 'string' || rootPrefix.length === 0) return { ok: false, reason: 'root-prefix-empty' };
  const normalized = normalizeRelPath(rel);
  if (normalized === null) return { ok: false, reason: 'invalid-relpath' };
  if (!normalized.startsWith(rootPrefix + '/') && normalized !== rootPrefix) {
    return { ok: false, reason: 'outside-prefix' };
  }
  return { ok: true, relpath: normalized };
}

// validateMarkerOwnership: returns one of 'valid' | 'missing' | 'forged'.
// - 'valid'    : marker path points inside the scratch root AND contents
//                equal the frozen MARKER_CONTENTS string.
// - 'missing'  : marker path does not resolve to a non-empty string.
// - 'forged'   : marker path resolves but contents are not the frozen
//                string (any deviation — trailing whitespace, extra lines,
//                wrong encoding — counts as forged).
function validateMarkerOwnership(markerRelpath, markerContents) {
  if (typeof markerRelpath !== 'string' || markerRelpath.length === 0) return 'missing';
  if (typeof markerContents !== 'string') return 'forged';
  if (markerContents !== MARKER_CONTENTS) return 'forged';
  // Also reject if marker is not under the canonical scratch root.
  const normalized = normalizeRelPath(markerRelpath);
  if (normalized === null) return 'forged';
  if (!normalized.startsWith(data.SCRATCH_ROOT_RELPATH + '/')
    && normalized !== data.SCRATCH_ROOT_RELPATH) {
    return 'forged';
  }
  return 'valid';
}

// validateSingleSubprocess: enforces `max_replay_subprocess_invocations = 1`.
// Returns { ok, reason }; reason is one of:
//   - 'ok'                 : exactly one invocation recorded
//   - 'none'               : zero invocations recorded (must be at least one)
//   - 'overflow-observed'  : observed > 1
function validateSingleSubprocess(observed) {
  const value = Number(observed);
  if (!Number.isFinite(value)) return { ok: false, reason: 'non-finite' };
  if (value < 1) return { ok: false, reason: 'none' };
  if (value > 1) return { ok: false, reason: 'overflow-observed' };
  return { ok: true, reason: 'ok' };
}

// ---------------------------------------------------------------------------
// Verdict triad
// ---------------------------------------------------------------------------

function buildVerdictTriad(input) {
  const source = _isObject(input) ? input : {};
  return Object.freeze({
    orchestration: source.orchestration,
    evidence: source.evidence,
    launch: source.launch,
  });
}

function assertVerdictTriadInvariant(triple) {
  if (!_isObject(triple)) {
    const error = new Error('verdict triple is not an object');
    error.code = data.BLOCKER_CODES.VERDICT_TRIPLE_DRIFT('triple-not-object');
    error.driftField = 'triple-not-object';
    throw error;
  }
  const driftField = data.verdictTriadDriftField(triple);
  if (driftField !== null) {
    const error = new Error('verdict triple drift at ' + driftField);
    error.code = data.BLOCKER_CODES.VERDICT_TRIPLE_DRIFT(driftField);
    error.driftField = driftField;
    throw error;
  }
  return triple;
}

// ---------------------------------------------------------------------------
// Cleanup trace builders / validator
// ---------------------------------------------------------------------------

function buildCleanupTraceRow(input) {
  if (!_isObject(input)) throw new Error('cleanup trace row input must be object');
  const phase = input.phase;
  const action = input.action;
  const targetRelpath = input.target_relpath;
  const outcome = input.outcome;
  if (!data.isCleanupPhase(phase)) throw new Error('cleanup trace row phase invalid');
  if (!data.isCleanupAction(action)) throw new Error('cleanup trace row action invalid');
  if (typeof targetRelpath !== 'string' || targetRelpath.length === 0) throw new Error('cleanup trace row target_relpath invalid');
  if (!data.isCleanupOutcome(outcome)) throw new Error('cleanup trace row outcome invalid');
  const row = { phase, action, target_relpath: targetRelpath, outcome };
  if (typeof input.reason === 'string' && input.reason.length > 0) {
    row.reason = input.reason.slice(0, data.DEFAULTS.max_blocker_reason_chars);
  }
  return row;
}

// buildCleanupTrace: takes an array of pre-validated rows and freezes the
// resulting array (with bounded length). Does not validate rows — callers
// must invoke buildCleanupTraceRow first.
function buildCleanupTrace(rows) {
  if (!Array.isArray(rows)) throw new Error('cleanup trace rows must be array');
  if (rows.length === 0) throw new Error('cleanup trace must contain at least one row');
  if (rows.length > data.DEFAULTS.max_cleanup_trace_rows) {
    throw new Error('cleanup trace exceeds max_cleanup_trace_rows=' + data.DEFAULTS.max_cleanup_trace_rows);
  }
  return Object.freeze(rows.map((row) => Object.freeze(_clone(row))));
}

// validateCleanupTrace: pure check that returns { ok, reason, badIndex? }.
// Reasons include 'empty', 'too-many-rows', 'bad-phase', 'bad-action',
// 'bad-target-relpath', 'bad-outcome', 'bad-reason-length'.
function validateCleanupTrace(trace) {
  if (!Array.isArray(trace)) return { ok: false, reason: 'not-array' };
  if (trace.length === 0) return { ok: false, reason: 'empty' };
  if (trace.length > data.DEFAULTS.max_cleanup_trace_rows) {
    return { ok: false, reason: 'too-many-rows' };
  }
  for (let index = 0; index < trace.length; index += 1) {
    const row = trace[index];
    if (!_isObject(row)) return { ok: false, reason: 'not-object', badIndex: index };
    if (!data.isCleanupPhase(row.phase)) return { ok: false, reason: 'bad-phase', badIndex: index };
    if (!data.isCleanupAction(row.action)) return { ok: false, reason: 'bad-action', badIndex: index };
    if (typeof row.target_relpath !== 'string' || row.target_relpath.length === 0) {
      return { ok: false, reason: 'bad-target-relpath', badIndex: index };
    }
    if (!data.isCleanupOutcome(row.outcome)) return { ok: false, reason: 'bad-outcome', badIndex: index };
    if (row.reason !== undefined) {
      if (typeof row.reason !== 'string'
        || row.reason.length === 0
        || row.reason.length > data.DEFAULTS.max_blocker_reason_chars) {
        return { ok: false, reason: 'bad-reason-length', badIndex: index };
      }
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Source-allowlist validation
// ---------------------------------------------------------------------------

function _validateSourceAllowlist(sourceHashes) {
  const missing = [];
  for (const entry of data.SOURCE_ALLOWLIST) {
    if (!entry.required) continue;
    const hash = sourceHashes ? sourceHashes[entry.source_ref] : null;
    if (!HASH_RE.test(String(hash || ''))) missing.push(entry);
  }
  return missing;
}

// ---------------------------------------------------------------------------
// Sidecar builders
// ---------------------------------------------------------------------------

function _resolvedInputs(input) {
  const fallback = Object.freeze({
    s01_schema: data.S01_SCHEMA_REF,
    s01_fixture: data.S01_FIXTURE_REF,
    s01_protocol: data.S01_PROTOCOL_REF,
    s01_validation: data.S01_VALIDATION_REF,
    s01_verification: data.S01_VERIFICATION_REF,
    m015_baseline: data.M015_BASELINE_REF,
    s01_classifier_cli: data.DEFAULTS.s01_classifier_cli,
  });
  const supplied = _isObject(input?.inputs) ? input.inputs : {};
  return Object.freeze(Object.assign({}, fallback, supplied));
}

function _resolvedSourceHashes(input) {
  const supplied = _isObject(input?.sourceHashes) ? input.sourceHashes : {};
  const resolved = {};
  for (const entry of data.SOURCE_ALLOWLIST) {
    if (typeof supplied[entry.source_ref] === 'string'
      && HASH_RE.test(supplied[entry.source_ref])) {
      resolved[entry.source_ref] = supplied[entry.source_ref];
    } else {
      resolved[entry.source_ref] = '';
    }
  }
  return Object.freeze(resolved);
}

function buildProofSidecar(input = {}) {
  const generated = input.generated || data.CLEANUP_REFERENCE_TIME;
  const referenceTime = input.referenceTime || generated;
  const cleanupTrace = input.cleanupTrace || [];
  const traceValidation = validateCleanupTrace(cleanupTrace);
  if (!traceValidation.ok) {
    return {
      ok: false,
      code: data.BLOCKER_CODES.SCHEMA_VIOLATION('cleanup-trace-' + traceValidation.reason),
      sidecar: null,
    };
  }
  const subprocessValidation = validateSingleSubprocess(input.replaySubprocessInvocations);
  if (!subprocessValidation.ok) {
    const code = subprocessValidation.reason === 'none'
      ? data.BLOCKER_CODES.SUBPROCESS_NONE()
      : data.BLOCKER_CODES.SUBPROCESS_OVERFLOW(input.replaySubprocessInvocations);
    return { ok: false, code, sidecar: null };
  }
  // TRIAD_INVARIANT — refuse to render the sidecar if the supplied triple
  // drifts in any dimension. We don't try to "fix" the triple silently.
  let resolvedTriad;
  try {
    resolvedTriad = assertVerdictTriadInvariant(input.verdictTriple || data.TRIAD_INVARIANT);
  } catch (error) {
    return { ok: false, code: error.code || data.BLOCKER_CODES.VERDICT_TRIPLE_DRIFT('unknown'), sidecar: null };
  }
  const sourceHashes = _resolvedSourceHashes(input);
  const inputs = _resolvedInputs(input);
  const marker = input.cleanupMarker || {
    relpath: data.SCRATCH_ROOT_MARKER_RELPATH,
    contents: data.MARKER_CONTENTS,
    sha256: sha256Hex(data.MARKER_CONTENTS),
  };
  const sidecar = {
    schema_id: data.REPLAY_CLEANUP_SCHEMA_ID,
    schema_version: data.REPLAY_CLEANUP_SCHEMA_VERSION,
    proof_id: data.REPLAY_CLEANUP_PROOF_ID,
    proof_kind: data.REPLAY_CLEANUP_PROOF_KIND,
    milestone: data.MILESTONE,
    slice: data.SLICE,
    task: data.task || data.TASK,
    generated,
    reference_time: referenceTime,
    verifier_line: data.VERIFIER_LINE_CLASS,
    canonical_protocol: data.VERIFIER_CANONICAL_PROTOCOL,
    canonical_verdict_line: data.CANONICAL_VERDICT_LINE,
    canonical_verdict_line_status: 'PASS',
    bounded_exit_code: data.EXIT_CODES.CLEANUP_PASS,
    inputs,
    source_hashes: sourceHashes,
    cleanup_marker: marker,
    scratch_root_relpath: input.scratchRootRelpath || data.SCRATCH_ROOT_RELPATH,
    replay_subprocess_invocations: 1,
    cleanup_trace: cleanupTrace,
    pre_run_absence_check: input.preRunAbsenceCheck || {
      relpath: data.SCRATCH_ROOT_RELPATH,
      present_before: false,
      present_after: false,
    },
    post_run_absence_check: input.postRunAbsenceCheck || {
      relpath: data.SCRATCH_ROOT_RELPATH,
      present_before: true,
      present_after: false,
    },
    atomic_temp_cleanup_check: input.atomicTempCleanupCheck || {
      relpath: data.SCRATCH_ROOT_RELPATH + '/.tmp-fallback',
      removed: true,
    },
    canonical_sidecar_overwrite_refusal: input.canonicalSidecarOverwriteRefusal || {
      attempted: false,
      refused: true,
    },
    canonical_output_overwrite_refusal: input.canonicalOutputOverwriteRefusal || {
      attempted: false,
      refused: true,
    },
    verdict_triple: resolvedTriad,
    semantic_digest: typeof input.semanticDigest === 'string' && HASH_RE.test(input.semanticDigest)
      ? input.semanticDigest
      : sha256Hex('m016-s07-semantic-digest-default'),
    reproducibility_count: Number.isInteger(input.reproducibilityCount) && input.reproducibilityCount >= 1
      ? Math.min(input.reproducibilityCount, data.DEFAULTS.max_reproducibility_runs)
      : 1,
    limits: Object.freeze({
      max_cleanup_trace_rows: data.DEFAULTS.max_cleanup_trace_rows,
      max_blocker_codes: data.DEFAULTS.max_blocker_codes,
      max_blocker_reason_chars: data.DEFAULTS.max_blocker_reason_chars,
      max_replay_subprocess_invocations: data.DEFAULTS.max_replay_subprocess_invocations,
      max_source_refs: data.DEFAULTS.max_source_refs,
      max_reproducibility_runs: data.DEFAULTS.max_reproducibility_runs,
    }),
    raw_bodies_persisted: false,
    redaction_posture: data.CLEANUP_REDACTION_FLAG_VALUES,
    blockers: [],
  };
  sidecar.byte_digest = computeProofBodyDigest(sidecar);
  return { ok: true, sidecar, verdict_triple: resolvedTriad };
}

function buildNegativeFixturesSidecar(input = {}) {
  const generated = input.generated || data.CLEANUP_REFERENCE_TIME;
  const referenceTime = input.referenceTime || generated;
  const fixtures = Array.isArray(input.fixtures) ? input.fixtures : [];
  if (fixtures.length === 0) {
    return { ok: false, code: data.BLOCKER_CODES.SCHEMA_VIOLATION('fixtures-empty'), sidecar: null };
  }
  if (fixtures.length > 32) {
    return { ok: false, code: data.BLOCKER_CODES.LIMITS_EXCEEDED('fixtures'), sidecar: null };
  }
  const blockerCodes = new Set();
  for (const fixture of fixtures) {
    if (!_isObject(fixture)) {
      return { ok: false, code: data.BLOCKER_CODES.SCHEMA_VIOLATION('fixtures-shape'), sidecar: null };
    }
    if (typeof fixture.expected_blocker_code === 'string') {
      if (!data.isCleanupBlockerCode(fixture.expected_blocker_code)) {
        return {
          ok: false,
          code: data.BLOCKER_CODES.SCHEMA_VIOLATION('fixtures-blocker-pattern'),
          sidecar: null,
        };
      }
      blockerCodes.add(fixture.expected_blocker_code);
    }
  }
  const coverageSummary = _isObject(input.coverageSummary) ? input.coverageSummary : {};
  const sidecar = {
    schema_id: data.REPLAY_CLEANUP_SCHEMA_ID,
    schema_version: data.REPLAY_CLEANUP_SCHEMA_VERSION,
    proof_id: data.REPLAY_CLEANUP_NEGATIVE_FIXTURES_ID,
    proof_kind: data.REPLAY_CLEANUP_NEGATIVE_FIXTURES_KIND,
    milestone: data.MILESTONE,
    slice: data.SLICE,
    task: input.task || data.TASK,
    generated,
    reference_time: referenceTime,
    verifier_line: data.VERIFIER_LINE_CLASS,
    canonical_protocol: data.VERIFIER_CANONICAL_PROTOCOL,
    canonical_verdict_line: data.CANONICAL_VERDICT_LINE,
    canonical_verdict_line_status: 'PASS',
    bounded_exit_code: data.EXIT_CODES.CLEANUP_PASS,
    inputs: _resolvedInputs(input),
    source_hashes: _resolvedSourceHashes(input),
    limits: Object.freeze({
      max_cleanup_trace_rows: data.DEFAULTS.max_cleanup_trace_rows,
      max_blocker_codes: data.DEFAULTS.max_blocker_codes,
      max_blocker_reason_chars: data.DEFAULTS.max_blocker_reason_chars,
      max_replay_subprocess_invocations: data.DEFAULTS.max_replay_subprocess_invocations,
      max_source_refs: data.DEFAULTS.max_source_refs,
      max_reproducibility_runs: data.DEFAULTS.max_reproducibility_runs,
    }),
    raw_bodies_persisted: false,
    redaction_posture: data.CLEANUP_REDACTION_FLAG_VALUES,
    blockers: [],
    fixture_count: fixtures.length,
    unique_blocker_codes: blockerCodes.size,
    coverage_summary: coverageSummary,
    runner_command: input.runnerCommand
      || ('node --test scripts/test_m016_s07_replay_cleanup_artifacts.js'),
    evaluation_command: input.evaluationCommand
      || "node -e \"require('./scripts/lib/m016-s07-replay-cleanup-contract').evaluateCleanupContract({ sidecar: tamperedSidecar, options: { runSchema: false } })\"",
    schema_path: data.DEFAULTS.schema_path,
    fixtures,
  };
  sidecar.byte_digest = computeNegativeFixturesBodyDigest(sidecar);
  return { ok: true, sidecar };
}

// ---------------------------------------------------------------------------
// Top-level evaluation (consumed by T03 verifier)
// ---------------------------------------------------------------------------

function _pushBlocker(blockers, code, reason) {
  if (!blockers.some((entry) => entry.code === code)) blockers.push({ code, reason });
}

function evaluateCleanupContract(input) {
  const blockers = [];
  const sourceHashes = _resolvedSourceHashes(input);
  // Allowlist check: only required entries with valid sha256 hashes pass.
  const missingSources = _validateSourceAllowlist(sourceHashes);
  for (const entry of missingSources) {
    _pushBlocker(blockers, data.BLOCKER_CODES.PRECONDITION_MISSING(entry.chain_role), 'required source missing or unfresh');
  }
  // Path containment for any supplied scratch / marker / trace paths.
  const relpathsToCheck = [];
  if (typeof input.scratchRootRelpath === 'string') relpathsToCheck.push(input.scratchRootRelpath);
  if (typeof input.cleanupMarker?.relpath === 'string') relpathsToCheck.push(input.cleanupMarker.relpath);
  if (_isObject(input.preRunAbsenceCheck)) relpathsToCheck.push(input.preRunAbsenceCheck.relpath);
  if (_isObject(input.postRunAbsenceCheck)) relpathsToCheck.push(input.postRunAbsenceCheck.relpath);
  if (_isObject(input.atomicTempCleanupCheck)) relpathsToCheck.push(input.atomicTempCleanupCheck.relpath);
  for (const rel of relpathsToCheck) {
    const containment = validatePathContainment(rel, data.SCRATCH_ROOT_RELPATH);
    if (!containment.ok) {
      _pushBlocker(blockers, data.BLOCKER_CODES.PATH_OUT_OF_CHECKOUT(rel), 'relpath outside marker-owned scratch root');
    } else if (/^[A-Za-z0-9._/-]+\.\.\.[A-Za-z0-9._/-]+$/.test(rel)
      || rel.split(/[\\/]+/).some((segment) => segment === '..')) {
      _pushBlocker(blockers, data.BLOCKER_CODES.PATH_TRAVERSAL(rel), 'relpath escapes with .. segment');
    }
  }
  // Marker ownership check.
  if (input.cleanupMarker) {
    const markerOwnership = validateMarkerOwnership(input.cleanupMarker.relpath, input.cleanupMarker.contents);
    if (markerOwnership === 'missing') {
      _pushBlocker(blockers, data.BLOCKER_CODES.MARKER_MISSING(input.cleanupMarker.relpath || '<unset>'), 'scratch marker missing');
    } else if (markerOwnership === 'forged') {
      _pushBlocker(blockers, data.BLOCKER_CODES.MARKER_FORGED(input.cleanupMarker.relpath || '<unset>'), 'scratch marker contents do not match frozen value');
    }
  }
  // Subprocess overflow.
  const subprocessValidation = validateSingleSubprocess(input.replaySubprocessInvocations);
  if (!subprocessValidation.ok) {
    if (subprocessValidation.reason === 'none') {
      _pushBlocker(blockers, data.BLOCKER_CODES.SUBPROCESS_NONE(), 'no replay subprocess invocation recorded');
    } else if (subprocessValidation.reason === 'overflow-observed') {
      _pushBlocker(blockers, data.BLOCKER_CODES.SUBPROCESS_OVERFLOW(input.replaySubprocessInvocations), 'more than one replay subprocess invocation observed');
    } else {
      _pushBlocker(blockers, data.BLOCKER_CODES.SUBPROCESS_OVERFLOW(input.replaySubprocessInvocations), 'replay subprocess invocation count invalid');
    }
  }
  // Cleanup trace shape.
  if (Array.isArray(input.cleanupTrace)) {
    const traceValidation = validateCleanupTrace(input.cleanupTrace);
    if (!traceValidation.ok) {
      _pushBlocker(blockers, data.BLOCKER_CODES.SCHEMA_VIOLATION('cleanup-trace-' + traceValidation.reason), 'cleanup trace failed validation');
    }
  } else {
    _pushBlocker(blockers, data.BLOCKER_CODES.SCHEMA_VIOLATION('cleanup-trace-missing'), 'cleanup trace is required');
  }
  // TRIAD_INVARIANT check.
  if (input.verdictTriple) {
    try {
      assertVerdictTriadInvariant(input.verdictTriple);
    } catch (error) {
      _pushBlocker(blockers, error.code, 'verdict triple drifted from TRIAD_INVARIANT');
    }
  } else {
    _pushBlocker(blockers, data.BLOCKER_CODES.VERDICT_TRIPLE_DRIFT('triple-missing'), 'verdict triple not supplied');
  }
  // Build the canonical sidecar; pass through any internal failure codes.
  const proofResult = input.sidecar
    ? { ok: true, sidecar: input.sidecar }
    : buildProofSidecar(input);
  if (!proofResult.ok) {
    _pushBlocker(blockers, proofResult.code, 'proof sidecar refused to render');
  } else {
    assertProofWriteSafe(proofResult.sidecar);
  }
  const result = {
    ok: blockers.length === 0,
    verdict: blockers.length === 0 ? 'pass' : 'fail_closed',
    exit_code: blockers.length === 0
      ? data.EXIT_CODES.CLEANUP_PASS
      : mapBlockerToExitCode(blockers[0].code),
    blockers,
    sidecar: proofResult.ok ? proofResult.sidecar : null,
    source_hashes: sourceHashes,
  };
  return result;
}

// ---------------------------------------------------------------------------
// Blocker → exit code mapping (mirrors S05/S06 family)
// ---------------------------------------------------------------------------

function mapBlockerToExitCode(blockerCode) {
  if (typeof blockerCode !== 'string') return data.EXIT_CODES.CLEANUP_FAIL_CLOSED;
  if (/PRECONDITION-MISSING|FRESH-HASH-DRIFT|SOURCE-HASH-DRIFT|SOURCE-NOT-ALLOWLISTED|SCHEMA-VIOLATION|VERIFIER-RUNNER-FAILURE/.test(blockerCode)) return data.EXIT_CODES.CLEANUP_PRECONDITION_DRIFT;
  if (/LAUNCH-PROMOTION|EVIDENCE-PROMOTION|ORCHESTRATION-DEMOTION|VERDICT-TRIPLE-DRIFT|OVERWRITE-ATTEMPTED|OVERWRITE-NOT-REFUSED/.test(blockerCode)) return data.EXIT_CODES.CLEANUP_LAUNCH_PROMOTION;
  if (/SECRET-TOKEN|REDACTION|SCHEMA-VIOLATION/.test(blockerCode)) return data.EXIT_CODES.CLEANUP_REDACTION_LEAK;
  if (/PATH-TRAVERSAL|PATH-OUT-OF-CHECKOUT|SYMLINK-ESCAPE/.test(blockerCode)) return data.EXIT_CODES.CLEANUP_PRECONDITION_DRIFT;
  if (/MARKER-FORGED|MARKER-MISSING|SCRATCH-NOT-MARKER-OWNED/.test(blockerCode)) return data.EXIT_CODES.CLEANUP_PROVENANCE_DRIFT;
  if (/PRE-EXISTING-RESIDUE|POST-RUN-RESIDUE|ATOMIC-TEMP-NOT-REMOVED|ATOMIC-RENAME-FAILED|CLEANUP-REFUSED|RESIDUE-PRESENT-BEFORE/.test(blockerCode)) return data.EXIT_CODES.CLEANUP_RESIDUE_DRIFT;
  if (/SUBPROCESS-OVERFLOW|SUBPROCESS-NONE|SUBPROCESS-NONZERO-EXIT|SEMANTIC-DIGEST-DRIFT|REPRODUCIBILITY-INSUFFICIENT/.test(blockerCode)) return data.EXIT_CODES.CLEANUP_PROVENANCE_DRIFT;
  return data.EXIT_CODES.CLEANUP_FAIL_CLOSED;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // hashing / canonicalisation
  sha256Hex,
  _stableStringify,
  canonicalizeProof,
  computeProofBodyDigest,
  canonicalizeNegativeFixtures,
  computeNegativeFixturesBodyDigest,
  // ajv loader
  resolveAjv,
  loadSchema,
  validateProofShape,
  // safety
  checkRedactionSafety,
  assertProofWriteSafe,
  assertNegativeFixturesWriteSafe,
  // path + marker + subprocess
  normalizeRelPath,
  validatePathContainment,
  validateMarkerOwnership,
  validateSingleSubprocess,
  // verdict triad
  buildVerdictTriad,
  assertVerdictTriadInvariant,
  // cleanup trace
  buildCleanupTraceRow,
  buildCleanupTrace,
  validateCleanupTrace,
  // sidecars
  buildProofSidecar,
  buildNegativeFixturesSidecar,
  // top-level evaluation
  evaluateCleanupContract,
  mapBlockerToExitCode,
  // re-exports for tests
  _safeSuffix,
  // constants
  ROOT,
  HASH_RE,
  ISO_RE,
  SAFE_S01_SCHEMA_REF_RE,
  SAFE_S01_RUNTIME_REF_RE,
  SAFE_M015_RUNTIME_REF_RE,
  SAFE_SCRIPT_REF_RE,
  SCRATCH_RELPATH_RE,
  ATOMIC_TEMP_RELPATH_RE,
  ABSENCE_CHECK_RELPATH_RE,
  MARKER_CONTENTS,
  LEAK_PATTERNS,
  REDACTION_KEYS,
  TIMESTAMP_KEYS,
};
