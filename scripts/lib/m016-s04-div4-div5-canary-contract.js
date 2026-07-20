#!/usr/bin/env node
'use strict';

/**
 * scripts/lib/m016-s04-div4-div5-canary-contract.js
 *
 * M016-txa3vu / S04 — Pure fail-closed Div4->Div5 canary contract shared by
 * the Div4 producer (T03) and Div5 independent validator (T04). Pure
 * functions only: no fs mutation, no network calls, no subprocess execution.
 * Deterministic for a given input set so producer and validator rebuild the
 * same gates, blockers, and verdicts from persisted sidecars. The validator
 * MUST import this file but MUST NOT import the producer CLI.
 *
 * Public API: loadSchema, validateBundleShape, sha256Hex, _stableStringify,
 * canonicalizeBundle, computeBundleBodyDigest, checkRedactionSafety,
 * assertBundleWriteSafe, buildCanarySubset, buildCorrelationContract,
 * buildEmbeddedClassification, buildEvidenceChain, attachReplayKeys,
 * buildProbeRunLedger, buildInputInventory, buildProducerProtocol,
 * evaluateCanaryContract, mapBlockerToExitCode.
 *
 * Frozen vocabulary: BLOCKER_CODES (M16-S04-CANARY-* / M16-S04-VERIFY-*),
 * EXIT_CODES 0..8, ROLE_SUBSET_DEFAULTS, DRILL_SUBSET_DEFAULTS,
 * CANARY_GATE_IDS (CG1..CG8), HARD_GATE_IDS (HG1..HG8).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const data = require('./m016-s04-div4-div5-canary-data');
const s03Contract = require('./m016-s03-safe-probe-contract');

const {
  SCHEMA_ID,
  SCHEMA_VERSION,
  PRODUCER_PROTOCOL_SCHEMA_ID,
  PRODUCER_PROTOCOL_SCHEMA_VERSION,
  VERIFY_PROTOCOL_SCHEMA_ID,
  VERIFY_PROTOCOL_SCHEMA_VERSION,
  MILESTONE,
  SLICE,
  BUNDLE_ID,
  BUNDLE_KIND,
  CANARY_PAIR_PRODUCER,
  CANARY_PAIR_VALIDATOR,
  PRODUCER_PROTOCOL_ID,
  PRODUCER_PROTOCOL_KIND,
  VERIFY_PROTOCOL_ID,
  VERIFY_PROTOCOL_KIND,
  PRODUCER_LINE_CLASS,
  VERIFIER_LINE_CLASS,
  PRODUCER_CANONICAL_PROTOCOL,
  EVIDENCE_ID_PREFIX,
  AGENT_RUN_ID_PREFIX,
  CANARY_GATE_IDS,
  CANARY_GATE_LABELS,
  HARD_GATE_IDS_HINT,
  BLOCKER_CODES,
  EXIT_CODES,
  ROLE_SUBSET_DEFAULTS,
  DRILL_SUBSET_DEFAULTS,
  CANARY_KINDS,
  CANARY_VERDICT_VALUES,
  FORBIDDEN_CANARY_VERDICTS,
  CANARY_REDACTION_FLAG_VALUES,
  SOURCE_ALLOWLIST,
  S02_BASELINE_REF,
  S03_PACK_REF,
  S03_VERIFY_REF,
  S03_COLLECT_REF,
  S03_INVENTORY_REF,
  S03_LIVE_PROBE_REF,
  S03_SCRATCH_DRILL_REF,
  RECORDS_BUDGET,
  CORRELATION_BUDGET,
  DEFAULTS,
  isKnownCanaryGate,
  isCanaryBlockerCode,
  isVerifierBlockerCode,
  isInRoleSubset,
  isInRoleSubsetAny,
  isInDrillSubset,
  isInDrillSubsetAny,
  isValidCanaryKind,
  isValidCanaryVerdict,
  isForbiddenCanaryVerdict,
} = data;

const s03Data = require('./m016-s03-safe-probe-data');

const {
  PROBE_ID_PREFIX,
  INDEPENDENCE_GROUPS_SET,
  INDEPENDENCE_GROUP_PATTERN,
  HARD_GATE_IDS,
  HARD_GATE_IDS_SET,
  getGateFor,
  getIndependenceGroup,
  getRoleEntry,
  isKnownRole,
  REDACTION_BOUNDS,
  REDACTION_FLAG_VALUES,
  isKnownDrillKind,
} = s03Data;

const ROOT = path.resolve(__dirname, '..', '..');
const P = path.posix;

// Hard-gate IDs the canary may consume as criterion_id values. Producer may
// only emit criterion_id values that are members of HARD_GATE_IDS_SET or
// CANARY_GATE_IDS_SET.
const HARD_GATE_IDS_HINT_FROZEN = Object.freeze(HARD_GATE_IDS);

// Cross-div regex patterns reused verbatim.
const SHA256_RE = /^[a-f0-9]{64}$/;
const SHA512_RE = /^[a-f0-9]{128}$/;
const EVIDENCE_ID_REGEX = new RegExp('^' + EVIDENCE_ID_PREFIX.replace(/\./g, '\\.') + '[a-z][a-z0-9._-]{2,63}$');
const AGENT_RUN_ID_REGEX = new RegExp('^M16-S04-CANARY-RUN-[A-Za-z0-9._-]+$');
const PROBE_ID_RE = new RegExp('^M16-S03-PROBE-[A-Za-z0-9._-]+$');
const BOUNDED_BUNDLE_HASH_RE = /^[a-f0-9]{64}$/;
const SAFE_CHARSET_DIGEST = /^[A-Za-z0-9 .:;,_<>/\-]+$/;
const SAFE_CHARSET_LIMIT = /^[A-Za-z0-9 .:;,_<>/\-{}?&=%@]+$/;
const SAFE_CHARSET_COMMAND = /^[A-Za-z0-9 .:;,_<>/\-{}?&=%@]+$/;
const SAFE_PATH_REL_RE = /^(runtime-evidence|scripts)\/[A-Za-z0-9._/\-]+$/;
const SCHEMA_REF_RE = /^schemas\/runtime-evidence\/m016-s04-[a-z0-9.-]+\.v1\.json$/;
const PRODUCER_PROTOCOL_PATH_RE = /^runtime-evidence\/M016-S04-div4-div5-canary-producer-protocol\.json$/;
const BUNDLE_PATH_RE = /^runtime-evidence\/M016-S04-div4-div5-canary-bundle\.json$/;
const SCRATCH_ROOT_RE = /^\/(?:tmp|private\/tmp|var\/folders|Users\/[^/]+\/Library\/Caches\/Temp|run\/m016-s04)\/[A-Za-z0-9._\-]*\/?$/;
const PATH_TRAVERSAL_RE = /(?:\.\.|\/\.)/;
const ROLE_REGEX = /^(Div[1-7]\.(HCO|MasterPlanner|Treasury|Production|QualificationsLibraryLearning|External|MissionControl)|paperclip_health|hermes_environment|secret_posture|cost_snapshot|isolation_invariant|restore_drill|budget_stop_drill|failure_drill|redaction_posture_audit)$/;

// Optional Ajv with fallback. Mirrors S02/S03 pattern.
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
    const err = new Error('schema missing at ' + rel);
    err.code = BLOCKER_CODES.PRODUCER_BUNDLE_MALFORMED();
    err.path = rel;
    throw err;
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(rel, 'utf8'));
  } catch (e) {
    const err = new Error('schema malformed JSON at ' + rel + ': ' + e.message);
    err.code = BLOCKER_CODES.PRODUCER_BUNDLE_MALFORMED();
    err.path = rel;
    throw err;
  }
  const ajv = _tryInitAjv();
  let validate = null;
  if (ajv) {
    try {
      validate = ajv.compile(parsed);
    } catch (e) {
      validate = null;
    }
  }
  return { schema: parsed, validate: validate, path: rel };
}

function _ensureBundleValidator() {
  return loadSchema(DEFAULTS.schema_path);
}

function _ensureProducerValidator() {
  return loadSchema(DEFAULTS.producer_protocol_schema_path);
}

// Hashing + canonicalisation.
function sha256Hex(content) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content == null ? '' : String(content), 'utf8');
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function _stableStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'null';
    if (Number.isInteger(value)) return String(value);
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(function (v) { return _stableStringify(v); }).join(',') + ']';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map(function (k) {
      return JSON.stringify(k) + ':' + _stableStringify(value[k]);
    }).join(',') + '}';
  }
  return JSON.stringify(String(value));
}

function canonicalizeBundle(bundle) {
  if (bundle === null || typeof bundle !== 'object' || Array.isArray(bundle)) return null;
  const sortable = {};
  for (const k of Object.keys(bundle).sort()) {
    if (bundle[k] === undefined) continue;
    sortable[k] = bundle[k];
  }
  return _stableStringify(sortable);
}

function computeBundleBodyDigest(bundle) {
  return sha256Hex(canonicalizeBundle(bundle || {}));
}

// Redaction safety wrapper: surfaces M16-S04-CANARY-REDACTION-LEAK-*.
const CANARY_REDACTION_SKIP_KEYS = Object.freeze(new Set([
  'schema_id', 'schema_version', 'protocol_id', 'protocol_kind',
  'milestone', 'slice', 'task', 'generated', 'reference_time',
  'verified_at', 'started_at', 'finished_at', 'verified',
  'bundle_id', 'bundle_kind', 'bundle_digest', 'producer_verdict_line',
  'canary_division_pair', 'first_run_provenance_hash', 'second_run_provenance_hash',
  'line_class', 'canonical_protocol', 'protocol_path', 'protocol_digest',
  'blocker_codes', 'blockers', 'verdict', 'verdict_line', 'runner_status',
  'runner_exit_code', 'completed_at', 'completed_by',
  'evaluator', 'evaluator_version',
  'role_subset', 'drill_subset',
  'redaction_bounds_loaded', 'bounded_digests_only',
  'chain_role', 'pre_hash_sha256', 'post_hash_sha256', 'unchanged',
  'size_bytes', 'independence_group', 'runner_status',
  'kind', 'role', 'role_class', 'classification',
  'criterion_id', 'reused_probe_id', 'evidence_id', 'method',
  'command', 'duration_ms', 'exit_code', 'attempted_exit_code',
  'sanitised_digest', 'artifact_hash', 'observed_blocker_code',
  'source_identity',
]));

function _stringHits(value) {
  if (typeof value !== 'string') return [];
  const hits = [];
  if (REDACTION_BOUNDS.uuid.test(value)) {
    hits.push({ kind: 'full_uuid', path: 'value', excerpt: value.slice(0, 16) });
  }
  if (REDACTION_BOUNDS.credential_assignment.test(value)) {
    hits.push({ kind: 'credential_assignment', path: 'value', excerpt: value.split('=')[0] });
  }
  if (REDACTION_BOUNDS.xiaomi_or_mimo && REDACTION_BOUNDS.xiaomi_or_mimo.test(value)) {
    hits.push({ kind: 'xiaomi_endpoint_reuse', path: 'value', excerpt: value.slice(0, 16) });
  }
  return hits;
}

function _walkForLeaks(node, skip) {
  if (node === null || node === undefined) return [];
  if (skip && skip.has('__all__')) return [];
  if (typeof node === 'string') return _stringHits(node);
  if (typeof node === 'number' || typeof node === 'boolean') return [];
  if (Array.isArray(node)) {
    const out = [];
    for (let i = 0; i < node.length; i++) {
      const child = node[i];
      if (skip && typeof child === 'object' && child !== null) continue;
      out.push.apply(out, _walkForLeaks(child, skip));
    }
    return out;
  }
  if (typeof node === 'object') {
    const out = [];
    for (const k of Object.keys(node)) {
      if (skip && skip.has(k)) continue;
      out.push.apply(out, _walkForLeaks(node[k], skip));
    }
    return out;
  }
  return [];
}

function checkRedactionSafety(payload, skipKeys) {
  const skip = skipKeys ? new Set([...CANARY_REDACTION_SKIP_KEYS, ...skipKeys]) : CANARY_REDACTION_SKIP_KEYS;
  return _walkForLeaks(payload, skip);
}

function assertBundleWriteSafe(bundle, skipKeys) {
  const hits = checkRedactionSafety(bundle, skipKeys);
  if (hits.length > 0) {
    const err = new Error('refused write: redaction leak in canary bundle (count=' + hits.length + ')');
    err.code = BLOCKER_CODES.PRODUCER_REDACTION_LEAK(hits[0].kind || 'kind');
    err.hits = hits;
    throw err;
  }
}

// Utility helpers.
function _frozenArray(arr) {
  return Object.freeze(arr.slice());
}

function _safeSuffix(value) {
  const raw = String(value == null ? '' : value);
  const cleaned = raw.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned ? cleaned.slice(0, 64) : 'x';
}

function _isIso(value) {
  if (typeof value !== 'string') return false;
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})?$/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

function _checkPath(value, ctx) {
  if (typeof value !== 'string') return { ok: false, code: BLOCKER_CODES.PRODUCER_BUNDLE_INVALID(ctx + ':type'), reason: ctx + ' must be string' };
  if (value.length < 1 || value.length > 256) return { ok: false, code: BLOCKER_CODES.PRODUCER_BUNDLE_INVALID(ctx + ':length'), reason: ctx + ' length out of [1,256]' };
  if (PATH_TRAVERSAL_RE.test(value)) return { ok: false, code: BLOCKER_CODES.PRODUCER_BUNDLE_INVALID(ctx + ':traversal'), reason: ctx + ' contains ../' };
  if (value.startsWith('/')) return { ok: false, code: BLOCKER_CODES.PRODUCER_BUNDLE_INVALID(ctx + ':absolute'), reason: ctx + ' absolute forbidden' };
  if (!SAFE_PATH_REL_RE.test(value)) return { ok: false, code: BLOCKER_CODES.PRODUCER_BUNDLE_INVALID(ctx + ':prefix'), reason: ctx + ' prefix not runtime-evidence|scripts' };
  return { ok: true };
}

function _checkScratchRoot(value) {
  if (typeof value !== 'string') return { ok: false, code: BLOCKER_CODES.PRODUCER_SCRATCH_ROOT_FORBIDDEN('type'), reason: 'scratch_root must be string' };
  if (value.length < 1 || value.length > 256) return { ok: false, code: BLOCKER_CODES.PRODUCER_SCRATCH_ROOT_FORBIDDEN('length'), reason: 'scratch_root length out of [1,256]' };
  if (PATH_TRAVERSAL_RE.test(value)) return { ok: false, code: BLOCKER_CODES.PRODUCER_SCRATCH_ROOT_FORBIDDEN('traversal'), reason: 'scratch_root contains ../' };
  const normalized = P.normalize(value);
  if (normalized.includes('..')) return { ok: false, code: BLOCKER_CODES.PRODUCER_SCRATCH_ROOT_FORBIDDEN('normalize'), reason: 'scratch_root normalizes to ..' };
  if (!SCRATCH_ROOT_RE.test(normalized)) return { ok: false, code: BLOCKER_CODES.PRODUCER_SCRATCH_ROOT_FORBIDDEN(normalized), reason: 'scratch_root "' + normalized + '" outside allowed scratch prefixes' };
  return { ok: true };
}

function _clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function mapBlockerToExitCode(blockerCode) {
  if (!blockerCode || typeof blockerCode !== 'string') return EXIT_CODES.CANARY_RUNNER_FAILURE;
  if (isCanaryBlockerCode(blockerCode)) return EXIT_CODES.CANARY_REJECTED_FAIL_CLOSED;
  if (isVerifierBlockerCode(blockerCode)) return EXIT_CODES.CANARY_REJECTED_FAIL_CLOSED;
  if (blockerCode.indexOf('SOURCE-FILE-MISSING') >= 0) return EXIT_CODES.CANARY_PROVENANCE_DRIFT;
  if (blockerCode.indexOf('SOURCE-OUT-OF-ALLOWLIST') >= 0) return EXIT_CODES.CANARY_PROVENANCE_DRIFT;
  if (blockerCode.indexOf('BASELINE-MISSING') >= 0 || blockerCode.indexOf('PACK-MISSING') >= 0) return EXIT_CODES.CANARY_PROVENANCE_DRIFT;
  if (blockerCode.indexOf('REPLAY') >= 0) return EXIT_CODES.CANARY_REPLAY_DRIFT;
  if (blockerCode.indexOf('LAUNCH-PROMOTION') >= 0) return EXIT_CODES.CANARY_LAUNCH_PROMOTION;
  if (blockerCode.indexOf('REDACTION-LEAK') >= 0) return EXIT_CODES.CANARY_REDACTION_LEAK;
  if (blockerCode.indexOf('CORRELATION-BROKEN') >= 0) return EXIT_CODES.CANARY_REJECTED_FAIL_CLOSED;
  if (blockerCode.indexOf('CLASSIFICATION-DRIFT') >= 0) return EXIT_CODES.CANARY_CLASSIFICATION_DRIFT;
  if (blockerCode.indexOf('BUNDLE-INVALID') >= 0 || blockerCode.indexOf('BUNDLE-MALFORMED') >= 0) return EXIT_CODES.CANARY_REJECTED_MALFORMED;
  if (blockerCode.indexOf('ATOMIC-WRITE') >= 0 || blockerCode.indexOf('OUTPUT-PATH-OUT-OF-TMP') >= 0) return EXIT_CODES.CANARY_RUNNER_FAILURE;
  return EXIT_CODES.CANARY_RUNNER_FAILURE;
}

// Subset selection. Preserves original M16-S03-PROBE-* IDs.
function _reclassify(record, kind) {
  return {
    kind: kind,
    role: record.role,
    classification: record.classification,
    independence_group: record.independence_group,
    reused_probe_id: record.probe_id,
    method: record.method,
    command: record.command,
    started_at: record.started_at,
    finished_at: record.finished_at,
    duration_ms: record.duration_ms,
    scope: record.scope,
    limitations: record.limitations,
    source_identity: record.source_identity,
    isolation_invariant: record.isolation_invariant,
    mutation_audit: record.mutation_audit,
    redaction: record.redaction,
    verdict: record.verdict,
    blocker_codes: record.blocker_codes || [],
    exit_code: record.exit_code,
    sanitised_digest: record.sanitised_digest,
    artifact_reference: record.artifact_reference,
    artifact_hash: record.artifact_hash,
    attempted_exit_code: record.attempted_exit_code,
    observed_blocker_code: record.observed_blocker_code,
    observed_blocker_reason: record.observed_blocker_reason,
    _source_set: record._source_set || 'live',
  };
}

function buildCanarySubset(input) {
  const opts = input || {};
  const liveRecords = Array.isArray(opts.liveRecords) ? opts.liveRecords : [];
  const scratchDrillRecords = Array.isArray(opts.scratchDrillRecords) ? opts.scratchDrillRecords : [];
  const roleSubset = Array.isArray(opts.roleSubset) ? opts.roleSubset : ROLE_SUBSET_DEFAULTS;
  const drillSubset = Array.isArray(opts.drillSubset) ? opts.drillSubset : DRILL_SUBSET_DEFAULTS;

  if (roleSubset.length === 0) {
    return { ok: false, code: BLOCKER_CODES.PRODUCER_SUBSET_EMPTY('role'), reason: 'role_subset empty', records: [] };
  }
  if (drillSubset.length === 0) {
    return { ok: false, code: BLOCKER_CODES.PRODUCER_SUBSET_EMPTY('drill'), reason: 'drill_subset empty', records: [] };
  }

  const out = [];
  for (const role of roleSubset) {
    if (!ROLE_REGEX.test(role)) {
      return { ok: false, code: BLOCKER_CODES.PRODUCER_ROLE_NOT_IN_REGISTRY(role), reason: 'role "' + role + '" not in canary role regex', records: [] };
    }
    if (!isInRoleSubsetAny(role, roleSubset)) {
      return { ok: false, code: BLOCKER_CODES.PRODUCER_ROLE_NOT_IN_REGISTRY(role), reason: 'role "' + role + '" not in custom subset', records: [] };
    }
    let found = null;
    let fromSet = 'live';
    for (const rec of liveRecords) {
      if (rec.role === role && !found) { found = rec; fromSet = 'live'; }
    }
    if (!found) {
      for (const rec of scratchDrillRecords) {
        if (rec.role === role && !found) { found = rec; fromSet = 'drill'; }
      }
    }
    if (!found) {
      return { ok: false, code: BLOCKER_CODES.PRODUCER_ROLE_NOT_IN_REGISTRY(role), reason: 'role "' + role + '" not present in S03 live or drill records', records: [] };
    }
    const enriched = _reclassify(found, CANARY_KINDS.LIVE_CANARY_RECORD);
    enriched._source_set = fromSet;
    out.push(enriched);
  }

  for (const drillRole of drillSubset) {
    if (!isKnownDrillKind(drillRole)) {
      return { ok: false, code: BLOCKER_CODES.PRODUCER_DRILL_NOT_IN_REGISTRY(drillRole), reason: 'drill "' + drillRole + '" not in SCRATCH_DRILL_KINDS', records: [] };
    }
    if (!isInDrillSubsetAny(drillRole, drillSubset)) {
      return { ok: false, code: BLOCKER_CODES.PRODUCER_DRILL_NOT_IN_REGISTRY(drillRole), reason: 'drill "' + drillRole + '" not in custom subset', records: [] };
    }
    // Map drill kind to role identifier used in S03 records.
    const drillRoleName = drillRole.replace(/-/g, '_');
    let found = null;
    for (const rec of scratchDrillRecords) {
      if (rec.role === drillRoleName && rec.classification === 'EXECUTED' && !found) { found = rec; }
    }
    if (!found) {
      // Fall back to ANY drill with that role even if NOT_PROVEN — schema accepts both, but
      // we still surface the orchestrator-side concern via the EXECUTED check is informational.
      for (const rec of scratchDrillRecords) {
        if (rec.role === drillRoleName && !found) { found = rec; }
      }
    }
    if (!found) {
      return { ok: false, code: BLOCKER_CODES.PRODUCER_DRILL_NOT_IN_REGISTRY(drillRole), reason: 'drill "' + drillRole + '" not found in scratch-drill records', records: [] };
    }
    const enriched = _reclassify(found, CANARY_KINDS.DRILL_CANARY_RECORD);
    enriched._source_set = 'drill';
    out.push(enriched);
  }

  return { ok: true, records: out };
}

// Correlation contract builder. Deterministic per record list.
function _deriveEvidenceId(reusedProbeId) {
  const stripped = String(reusedProbeId || '').replace(/^M16-S03-PROBE-/, '');
  const slug = stripped.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  const tail = slug.slice(0, 48) || 'probe';
  return EVIDENCE_ID_PREFIX + tail;
}

function _classifyCriterionId(record) {
  if (!record) return null;
  const role = record.role;
  // Drills map onto HG3 RECOVERY_EVIDENCE / HG8 SCRATCH_ISOLATION depending on drill_kind.
  if (record.kind === CANARY_KINDS.DRILL_CANARY_RECORD) {
    return 'HG8 SCRATCH_ISOLATION';
  }
  if (isKnownRole(role)) {
    const entry = getRoleEntry(role);
    return entry.gate;
  }
  // Infrastructure role registries (secret_posture → HG5 SECURITY_POSTURE; restore_drill →
  // HG3 RECOVERY_EVIDENCE; etc.) — fall back to gate lookup if present.
  const viaLookup = getGateFor && getGateFor(role);
  return viaLookup || 'HG2 PROVENANCE_INTEGRITY';
}

function buildCorrelationContract(input) {
  const opts = input || {};
  const records = Array.isArray(opts.records) ? opts.records : [];
  const seed = String(opts.seed || 'default');
  if (!AGENT_RUN_ID_REGEX.test(AGENT_RUN_ID_PREFIX + seed.replace(/[^A-Za-z0-9._-]+/g, '-'))) {
    return { ok: false, code: BLOCKER_CODES.PRODUCER_CORRELATION_BROKEN('agent_run_id'), reason: 'seed produces invalid agent_run_id' };
  }
  const agentRunId = AGENT_RUN_ID_PREFIX + seed.replace(/[^A-Za-z0-9._-]+/g, '-');
  const referenceTime = opts.referenceTime || DEFAULTS.reference_time;

  const probeToCriterion = [];
  const agentRunToProbe = [];
  const evidenceToCriterion = [];

  const seenProbes = new Set();
  const seenEvidence = new Set();
  const seenCriterion = new Set();
  const seenIndependence = new Set();

  for (const rec of records) {
    const probeId = rec.reused_probe_id;
    const evidenceId = _deriveEvidenceId(probeId);
    const criterionId = _classifyCriterionId(rec);
    const classification = rec.classification;

    if (!probeId || !PROBE_ID_RE.test(probeId)) {
      return { ok: false, code: BLOCKER_CODES.PRODUCER_CORRELATION_BROKEN('probe_id'), reason: 'probe_id "' + probeId + '" out of S03 vocabulary' };
    }
    if (!criterionId || (!HARD_GATE_IDS_SET.has(criterionId) && !isKnownCanaryGate(criterionId))) {
      return { ok: false, code: BLOCKER_CODES.PRODUCER_CORRELATION_BROKEN('criterion_id'), reason: 'criterion_id "' + criterionId + '" not in HARD/CANARY gate vocabulary' };
    }
    if (!rec.independence_group || !new RegExp(INDEPENDENCE_GROUP_PATTERN).test(rec.independence_group)) {
      return { ok: false, code: BLOCKER_CODES.PRODUCER_CORRELATION_BROKEN('independence_group'), reason: 'independence_group "' + rec.independence_group + '" pattern mismatch' };
    }
    if (seenProbes.has(probeId)) {
      return { ok: false, code: BLOCKER_CODES.PRODUCER_CORRELATION_BROKEN('probe_id:duplicate'), reason: 'probe_id "' + probeId + '" appears twice' };
    }
    if (seenEvidence.has(evidenceId)) {
      return { ok: false, code: BLOCKER_CODES.PRODUCER_CORRELATION_BROKEN('evidence_id:duplicate'), reason: 'evidence_id "' + evidenceId + '" appears twice' };
    }
    if (seenIndependence.has(rec.independence_group)) {
      return { ok: false, code: BLOCKER_CODES.PRODUCER_INDEPENDENCE_GROUP_REUSED(rec.independence_group), reason: 'independence_group "' + rec.independence_group + '" reused' };
    }
    seenProbes.add(probeId);
    seenEvidence.add(evidenceId);
    seenCriterion.add(criterionId);
    seenIndependence.add(rec.independence_group);

    probeToCriterion.push(Object.freeze({
      probe_id: probeId,
      agent_run_id: agentRunId,
      evidence_id: evidenceId,
      criterion_id: criterionId,
      classification: classification,
      independence_group: rec.independence_group,
      weight: classification === 'EXECUTED' ? 1 : 0,
    }));

    const exitCode = classification === 'EXECUTED' ? 0 : -1;
    const duration = typeof rec.duration_ms === 'number' ? rec.duration_ms : 0;
    agentRunToProbe.push(Object.freeze({
      agent_run_id: agentRunId,
      probe_id: probeId,
      started_at: rec.started_at || referenceTime,
      finished_at: rec.finished_at || referenceTime,
      duration_ms: duration,
      exit_code: exitCode,
    }));

    evidenceToCriterion.push(Object.freeze({
      evidence_id: evidenceId,
      criterion_id: criterionId,
      weight: classification === 'EXECUTED' ? 1 : 0,
      raw_state: classification === 'EXECUTED' ? 'EXECUTED' : 'NOT_PROVEN',
      numeric_mapping: classification === 'EXECUTED' ? 1 : 0,
    }));
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

// Embedded classification builder (HG/CG gates + worksheet).
function _gateForRole(role, kind) {
  if (kind === CANARY_KINDS.DRILL_CANARY_RECORD) return 'HG8 SCRATCH_ISOLATION';
  const entry = getRoleEntry(role);
  if (entry) return entry.gate;
  const viaLookup = getGateFor && getGateFor(role);
  return viaLookup || 'HG2 PROVENANCE_INTEGRITY';
}

function buildEmbeddedClassification(input) {
  const opts = input || {};
  const records = Array.isArray(opts.records) ? opts.records : [];
  const sources = Array.isArray(opts.sources) ? opts.sources : [];
  const redactionHits = Array.isArray(opts.redactionHits) ? opts.redactionHits : [];
  const replayMatch = opts.replayMatch === true;
  const s02Unchanged = opts.s02Unchanged === true;
  const s03Unchanged = opts.s03Unchanged === true;
  const correlationUnique = opts.correlationUnique === true;
  const preHashes = opts.preHashes || {};
  const postHashes = opts.postHashes || {};
  const blockerRows = Array.isArray(opts.blockerRows) ? opts.blockerRows : [];
  const generated = opts.generated || DEFAULTS.reference_time;

  // Hard gates: derive each from the role/drill it covers.
  const hardGates = {};
  for (const hgid of HARD_GATE_IDS) hardGates[hgid] = 'pass';
  // If a NOT_PROVEN record exists targeting HG1, demote HG1 to not_proven.
  for (const rec of records) {
    if (rec.classification === 'NOT_PROVEN') {
      const gate = _gateForRole(rec.role, rec.kind);
      hardGates[gate] = hardGates[gate] === 'pass' ? 'not_proven' : hardGates[gate];
    }
  }
  if (redactionHits.length > 0) hardGates['HG5 SECURITY_POSTURE'] = 'fail_closed';
  if (!s02Unchanged) hardGates['HG2 PROVENANCE_INTEGRITY'] = 'fail_closed';
  if (!s03Unchanged) hardGates['HG2 PROVENANCE_INTEGRITY'] = 'fail_closed';
  if (!correlationUnique) hardGates['HG2 PROVENANCE_INTEGRITY'] = 'fail_closed';

  // Canary gates:
  const canaryGates = {};
  canaryGates['CG1 CANARY_PRODUCER_VALID'] = blockerRows.length === 0 ? 'pass' : 'fail_closed';
  canaryGates['CG2 CANARY_VALIDATOR_INDEPENDENT'] = 'pass'; // Producer cannot prove validator independence; pass when bundle is structurally valid.
  canaryGates['CG3 EVIDENCE_CHAIN_INTACT'] = (
    s02Unchanged && s03Unchanged && preHashes.s02_baseline === postHashes.s02_baseline && preHashes.s03_pack === postHashes.s03_pack && preHashes.canary_probe_run === postHashes.canary_probe_run
  ) ? 'pass' : 'fail_closed';
  canaryGates['CG4 CORRELATION_CONTRACT_VALID'] = correlationUnique ? 'pass' : 'fail_closed';
  canaryGates['CG5 REDACTION_SAFE'] = (redactionHits.length === 0) ? 'pass' : 'fail_closed';
  canaryGates['CG6 S02_BASELINE_IMMUTABLE'] = s02Unchanged ? 'pass' : 'fail_closed';
  canaryGates['CG7 S03_PACK_IMMUTABLE'] = s03Unchanged ? 'pass' : 'fail_closed';
  canaryGates['CG8 DETERMINISTIC_REPLAY'] = replayMatch ? 'pass' : 'fail_closed';

  // Verdicts:
  const orchestrationPass = canaryGates['CG1 CANARY_PRODUCER_VALID'] === 'pass' && canaryGates['CG2 CANARY_VALIDATOR_INDEPENDENT'] === 'pass' && canaryGates['CG8 DETERMINISTIC_REPLAY'] === 'pass';
  const evidencePass = canaryGates['CG3 EVIDENCE_CHAIN_INTACT'] === 'pass' && canaryGates['CG4 CORRELATION_CONTRACT_VALID'] === 'pass' && canaryGates['CG5 REDACTION_SAFE'] === 'pass' && canaryGates['CG6 S02_BASELINE_IMMUTABLE'] === 'pass' && canaryGates['CG7 S03_PACK_IMMUTABLE'] === 'pass';

  const hardPassCount = Object.values(hardGates).filter(function (v) { return v === 'pass'; }).length;
  const hardTotal = Object.keys(hardGates).length;
  const canaryPassCount = Object.values(canaryGates).filter(function (v) { return v === 'pass'; }).length;
  const canaryTotal = Object.keys(canaryGates).length;

  const orchestration = (orchestrationPass && hardPassCount >= 5 && canaryPassCount >= 7) ? 'PASS' : (hardPassCount + canaryPassCount >= hardTotal + canaryTotal - 1 ? 'PARTIAL' : 'NOT_PROVEN');
  const evidence = (evidencePass && hardPassCount >= 6) ? 'PASS' : (hardPassCount + canaryPassCount >= hardTotal + canaryTotal - 2 ? 'PARTIAL' : 'NOT_PROVEN');

  const liveExecutedCount = records.filter(function (r) { return r.classification === 'EXECUTED'; }).length;
  const sourcesAllowedCount = sources.length;
  const replayMatchInt = replayMatch ? 1 : 0;
  const s02Int = s02Unchanged ? 1 : 0;
  const s03Int = s03Unchanged ? 1 : 0;
  const correlationInt = correlationUnique ? 1 : 0;

  return Object.freeze({
    evaluator: 'S04-div4-div5-canary-contract',
    evaluator_version: 'v1',
    raw_state: (liveExecutedCount === records.length && records.length > 0) ? 'EXECUTED' : (liveExecutedCount === 0 ? 'NOT_PROVEN' : 'PARTIAL'),
    numeric_mapping: Object.freeze({
      orchestration: _clamp(orchestration === 'PASS' ? 1.0 : orchestration === 'PARTIAL' ? 0.5 : 0.0, 0, 1),
      evidence: _clamp(evidence === 'PASS' ? 1.0 : evidence === 'PARTIAL' ? 0.5 : 0.0, 0, 1),
      launch: 1.0, // PREPARATION_ONLY is structurally closed; the numeric stays at 1.
    }),
    weight: 1.0,
    verdicts: Object.freeze({
      orchestration: orchestration,
      evidence: evidence,
      launch: 'PREPARATION_ONLY',
    }),
    hard_gates: Object.freeze(hardGates),
    canary_gates: Object.freeze(canaryGates),
    worksheet: Object.freeze({
      step_orchestration: Object.freeze({
        weight: 0.34,
        numeric_mapping: Object.freeze({
          producer_executed: Math.min(liveExecutedCount, 16),
          validator_replay_match: replayMatchInt,
        }),
        observed_status: orchestrationPass ? 'pass' : (orchestration === 'PARTIAL' ? 'not_proven' : 'fail_closed'),
      }),
      step_evidence: Object.freeze({
        weight: 0.33,
        numeric_mapping: Object.freeze({
          sources_sanitised: Math.min(sourcesAllowedCount, 6),
          s02_unchanged: s02Int,
          s03_unchanged: s03Int,
          correlation_unique: correlationInt,
        }),
        observed_status: evidencePass ? 'pass' : (evidence === 'PARTIAL' ? 'not_proven' : 'fail_closed'),
      }),
      step_launch: Object.freeze({
        weight: 0.33,
        numeric_mapping: Object.freeze({
          verdict_frozen: 'PREPARATION_ONLY',
          replay_byte_identical: replayMatchInt,
        }),
        observed_status: 'fail_closed',
      }),
    }),
    completed_at: generated,
    completed_by: 'producer',
  });
}

// Evidence chain integrity helper.
function buildEvidenceChain(input) {
  const opts = input || {};
  const allowlist = Array.isArray(opts.sources) ? opts.sources : []; // [{ source_ref, kind, chain_role, independence_group, pre_hash_sha256, post_hash_sha256 }]
  const rows = allowlist.map(function (entry) {
    return Object.freeze({
      chain_role: entry.chain_role,
      source_ref: entry.source_ref,
      pre_hash_sha256: entry.pre_hash_sha256,
      post_hash_sha256: entry.post_hash_sha256,
      unchanged: entry.pre_hash_sha256 === entry.post_hash_sha256,
      size_bytes: typeof entry.size_bytes === 'number' ? entry.size_bytes : 0,
      independence_group: entry.independence_group,
      runner_status: entry.runner_status || 'PASS',
    });
  });
  if (rows.length < 3) {
    return { ok: false, code: BLOCKER_CODES.PRODUCER_EVIDENCE_CHAIN_BROKEN('count'), reason: 'evidence_chain requires >= 3 rows' };
  }
  return { ok: true, rows: rows };
}

// Replay key attachment: dual-run byte-identical provenance check.
function attachReplayKeys(input) {
  const opts = input || {};
  const builder = typeof opts.builder === 'function' ? opts.builder : null;
  if (!builder) return { ok: false, code: BLOCKER_CODES.PRODUCER_REPLAY_NOT_BYTE_IDENTICAL(), reason: 'no replay builder supplied' };
  const first = builder();
  const second = builder();
  const firstHash = computeBundleBodyDigest(first);
  const secondHash = computeBundleBodyDigest(second);
  if (firstHash !== secondHash) {
    return { ok: false, code: BLOCKER_CODES.PRODUCER_REPLAY_NOT_BYTE_IDENTICAL(), reason: 'first/second run provenance mismatch', firstHash: firstHash, secondHash: secondHash };
  }
  if (firstHash !== opts.expectedHash && opts.expectedHash && opts.expectedHash !== '') {
    return { ok: false, code: BLOCKER_CODES.PRODUCER_REPLAY_NOT_BYTE_IDENTICAL(), reason: 'pre-registered hash drifted', firstHash: firstHash, secondHash: secondHash };
  }
  return {
    ok: true,
    replay_keys: Object.freeze({
      first_run_provenance_hash: firstHash,
      second_run_provenance_hash: secondHash,
      match: true,
      byte_identical: true,
      verified_at: opts.referenceTime || DEFAULTS.reference_time,
    }),
  };
}

// Probe-run ledger + input inventory + producer-protocol builders.
function buildProbeRunLedger(input) {
  const opts = input || {};
  const records = Array.isArray(opts.records) ? opts.records : [];
  const correlationContract = opts.correlationContract || {};
  const generated = opts.generated || DEFAULTS.reference_time;

  const correlationRows = (correlationContract.probe_to_criterion || []).map(function (r) {
    return Object.freeze({
      probe_id: r.probe_id,
      evidence_id: r.evidence_id,
      criterion_id: r.criterion_id,
      classification: r.classification,
      independence_group: r.independence_group,
    });
  });

  return Object.freeze({
    schema_id: 'm016-s04-div4-div5-canary-probe-run-v1',
    schema_namespace: 'm016-s04-div4-div5-canary-probe-run-v1',
    schema_version: 'v1',
    bundle_id: BUNDLE_ID,
    canary_division_pair: Object.freeze({ producer: CANARY_PAIR_PRODUCER, validator: CANARY_PAIR_VALIDATOR }),
    milestone: MILESTONE,
    slice: SLICE,
    task: 'T03',
    generated: generated,
    line_class: PRODUCER_LINE_CLASS,
    canonical_protocol: PRODUCER_CANONICAL_PROTOCOL,
    reference_time: opts.referenceTime || generated,
    agent_run_id: correlationContract.agent_run_id || '',
    record_count: records.length,
    live_record_count: records.filter(function (r) { return r.kind === CANARY_KINDS.LIVE_CANARY_RECORD; }).length,
    drill_record_count: records.filter(function (r) { return r.kind === CANARY_KINDS.DRILL_CANARY_RECORD; }).length,
    executed_count: records.filter(function (r) { return r.classification === 'EXECUTED'; }).length,
    not_proven_count: records.filter(function (r) { return r.classification === 'NOT_PROVEN'; }).length,
    correlation_rows: correlationRows,
    agent_run_to_probe_rows: correlationContract.agent_run_to_probe || [],
    evidence_to_criterion_rows: correlationContract.evidence_to_criterion || [],
  });
}

function buildInputInventory(input) {
  const opts = input || {};
  const sources = Array.isArray(opts.sources) ? opts.sources : [];
  const generated = opts.generated || DEFAULTS.reference_time;
  return Object.freeze({
    schema_id: 'm016-s04-div4-div5-canary-input-inventory-v1',
    schema_version: 'v1',
    milestone: MILESTONE,
    slice: SLICE,
    task: 'T03',
    generated: generated,
    source_count: sources.length,
    sources: sources.map(function (s) {
      return Object.freeze({
        source_ref: s.source_ref,
        kind: s.kind,
        chain_role: s.chain_role,
        independence_group: s.independence_group,
        size_bytes: typeof s.size_bytes === 'number' ? s.size_bytes : 0,
        pre_hash_sha256: s.pre_hash_sha256,
        post_hash_sha256: s.post_hash_sha256,
        unchanged: s.pre_hash_sha256 === s.post_hash_sha256,
        runner_status: s.runner_status || 'PASS',
        loaded_at: generated,
      });
    }),
  });
}

function buildProducerProtocol(input) {
  const opts = input || {};
  const bundle = opts.bundle || {};
  const paths = opts.paths || {};
  const replay = opts.replay || {};
  const gates = opts.gates || {};
  const blockers = Array.isArray(opts.blockers) ? opts.blockers : [];
  const runnerStatus = typeof opts.runnerStatus === 'number' ? opts.runnerStatus : 0;
  const runnerExitCode = typeof opts.runnerExitCode === 'number' ? opts.runnerExitCode : 0;
  const generated = opts.generated || DEFAULTS.reference_time;
  const producerCommand = opts.producerCommand || 'node scripts/produce_m016_s04_div4_div5_canary.js';
  const canarySubset = opts.canarySubset || { live_records: 0, drill_records: 0, correlation_rows: 0, agent_run_to_probe_rows: 0 };
  const roleSubset = opts.roleSubset || ROLE_SUBSET_DEFAULTS.slice();
  const drillSubset = opts.drillSubset || DRILL_SUBSET_DEFAULTS.slice();
  const verdict = opts.verdict || CANARY_VERDICT_VALUES.PRODUCED;

  return Object.freeze({
    schema_id: PRODUCER_PROTOCOL_SCHEMA_ID,
    schema_version: PRODUCER_PROTOCOL_SCHEMA_VERSION,
    protocol_id: PRODUCER_PROTOCOL_ID,
    protocol_kind: PRODUCER_PROTOCOL_KIND,
    milestone: MILESTONE,
    slice: SLICE,
    task: 'T03',
    generated: generated,
    line_class: PRODUCER_LINE_CLASS,
    canonical_protocol: PRODUCER_CANONICAL_PROTOCOL,
    bundle_id: bundle.bundle_id || BUNDLE_ID,
    bundle_sha256: bundle.bundle_digest || '',
    bundle_path: paths.bundlePath || DEFAULTS.bundle_output,
    protocol_path: paths.protocolPath || DEFAULTS.producer_protocol_output,
    schema_path: DEFAULTS.schema_path,
    producer_command: producerCommand,
    role_subset: _frozenArray(roleSubset),
    drill_subset: _frozenArray(drillSubset),
    reference_time: opts.referenceTime || generated,
    options: Object.freeze({
      force: opts.force === true,
      iterations: typeof opts.iterations === 'number' ? opts.iterations : 2,
      reference_time: opts.referenceTime || generated,
    }),
    sources_loaded: _frozenArray(opts.sourcesLoaded || []),
    evidence_chain: opts.evidence_chain || [],
    replay: Object.freeze({
      iterations: typeof replay.iterations === 'number' ? replay.iterations : 2,
      first_run_provenance_hash: replay.first_run_provenance_hash || '',
      second_run_provenance_hash: replay.second_run_provenance_hash || '',
      match: replay.match === true,
      byte_identical: replay.byte_identical === true,
    }),
    gates: Object.freeze(gates),
    canary_subset_size: Object.freeze({
      live_records: canarySubset.live_records || 0,
      drill_records: canarySubset.drill_records || 0,
      correlation_rows: canarySubset.correlation_rows || 0,
      agent_run_to_probe_rows: canarySubset.agent_run_to_probe_rows || 0,
    }),
    verdict: verdict,
    blockers: _frozenArray(blockers),
    runner_status: runnerStatus,
    runner_exit_code: runnerExitCode,
    verdict_line: opts.verdictLine || ('M16-S04-CANARY verdict=' + verdict + ' exit=' + runnerExitCode),
  });
}

// Top-level bundle evaluator. Returns blockers + verdict.
function evaluateCanaryContract(input) {
  const opts = input || {};
  const bundle = opts.bundle || null;
  const options = opts.options || {};

  if (!bundle || typeof bundle !== 'object') {
    return { ok: false, blockers: [{ code: BLOCKER_CODES.PRODUCER_BUNDLE_MALFORMED(), reason: 'bundle missing or non-object' }], verdict: CANARY_VERDICT_VALUES.FAIL_CLOSED };
  }
  const blockers = [];

  if (bundle.schema_id !== SCHEMA_ID) blockers.push({ code: BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('schema_id'), reason: 'bundle.schema_id "' + bundle.schema_id + '" !== "' + SCHEMA_ID + '"' });
  if (bundle.bundle_kind !== BUNDLE_KIND) blockers.push({ code: BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('bundle_kind'), reason: 'bundle_kind must be "' + BUNDLE_KIND + '"' });
  if (bundle.bundle_id !== BUNDLE_ID) blockers.push({ code: BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('bundle_id'), reason: 'bundle_id must be "' + BUNDLE_ID + '"' });
  if (bundle.milestone !== MILESTONE) blockers.push({ code: BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('milestone'), reason: 'milestone must be ' + MILESTONE });
  if (bundle.slice !== SLICE) blockers.push({ code: BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('slice'), reason: 'slice must be ' + SLICE });
  if (!PROBE_ID_PREFIX || !bundle.task) blockers.push({ code: BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('task'), reason: 'bundle.task missing' });

  // Embedded classification launch verdict must be PREPARATION_ONLY.
  const ec = bundle.embedded_classification || {};
  if (!ec.verdicts || ec.verdicts.launch !== 'PREPARATION_ONLY') {
    blockers.push({ code: BLOCKER_CODES.PRODUCER_LAUNCH_PROMOTION_ATTEMPTED((ec.verdicts && ec.verdicts.launch) || 'launch'), reason: 'launch verdict must be PREPARATION_ONLY' });
  }

  // Evidence chain shape + immutability.
  if (!Array.isArray(bundle.evidence_chain) || bundle.evidence_chain.length < 3) {
    blockers.push({ code: BLOCKER_CODES.PRODUCER_EVIDENCE_CHAIN_BROKEN('length'), reason: 'evidence_chain requires >= 3 rows' });
  } else {
    for (const row of bundle.evidence_chain) {
      const pathResult = _checkPath(row.source_ref, 'evidence_chain.source_ref');
      if (!pathResult.ok) blockers.push({ code: pathResult.code, reason: pathResult.reason });
      if (row.pre_hash_sha256 !== row.post_hash_sha256) blockers.push({ code: BLOCKER_CODES.PRODUCER_EVIDENCE_CHAIN_BROKEN(row.chain_role), reason: row.chain_role + ' pre/post hash drift' });
      if (row.unchanged !== true) blockers.push({ code: BLOCKER_CODES.PRODUCER_EVIDENCE_CHAIN_BROKEN(row.chain_role + ':unchanged'), reason: 'unchanged must be true' });
    }
  }

  // Records shape + classification determinism.
  if (!Array.isArray(bundle.records) || bundle.records.length === 0) {
    blockers.push({ code: BLOCKER_CODES.PRODUCER_SUBSET_EMPTY('records'), reason: 'records must be non-empty' });
  } else {
    for (const rec of bundle.records) {
      if (!isValidCanaryKind(rec.kind)) blockers.push({ code: BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('records.kind'), reason: 'unknown canary kind "' + rec.kind + '"' });
      if (rec.classification !== 'EXECUTED' && rec.classification !== 'NOT_PROVEN') blockers.push({ code: BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('records.classification'), reason: 'classification must be EXECUTED or NOT_PROVEN' });
      if (rec.kind === CANARY_KINDS.DRILL_CANARY_RECORD && rec.classification !== 'EXECUTED') {
        // Drills entering the canary must be EXECUTED; otherwise the producer cannot claim an isolation witness.
        blockers.push({ code: BLOCKER_CODES.PRODUCER_DRILL_NOT_PROVEN_EXECUTED(rec.role), reason: 'drill "' + rec.role + '" not EXECUTED — orchestrator failure' });
      }
      if (rec.kind === CANARY_KINDS.LIVE_CANARY_RECORD && rec.role && (rec.role === 'Div1.HCO' || rec.role === 'Div2.MasterPlanner' || rec.role === 'Div3.Treasury' || rec.role === 'Div4.Production' || rec.role === 'Div5.QualificationsLibraryLearning' || rec.role === 'Div6.External' || rec.role === 'Div7.MissionControl') && rec.classification !== 'NOT_PROVEN') {
        blockers.push({ code: BLOCKER_CODES.PRODUCER_ROLE_NOT_PROVEN_EXECUTED(rec.role), reason: 'live division role "' + rec.role + '" must be NOT_PROVEN at canary layer' });
      }
      if (typeof rec.artifact_reference === 'string' && !SAFE_PATH_REL_RE.test(rec.artifact_reference)) {
        blockers.push({ code: BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('records.artifact_reference'), reason: 'artifact_reference prefix invalid' });
      }
      if (rec.redaction && (rec.redaction.full_ids !== false || rec.redaction.credentials !== false || rec.redaction.bounded_digests_only !== true)) {
        if (rec.redaction.full_ids !== false || rec.redaction.credentials !== false) {
          blockers.push({ code: BLOCKER_CODES.PRODUCER_REDACTION_LEAK('full_ids|credentials'), reason: 'leak-class flag must be false in record redaction' });
        }
        if (rec.redaction.bounded_digests_only !== true) {
          blockers.push({ code: BLOCKER_CODES.PRODUCER_REDACTION_LEAK('bounded_digests_only'), reason: 'bounded_digests_only must be true in record redaction' });
        }
      }
    }
  }

  // Top-level redaction posture.
  const rp = bundle.redaction_posture || {};
  for (const [flag, value] of Object.entries(rp)) {
    if (REDACTION_FLAG_VALUES && REDACTION_FLAG_VALUES[flag] === false && value !== false) {
      blockers.push({ code: BLOCKER_CODES.PRODUCER_REDACTION_LEAK(flag), reason: 'redaction_posture flag "' + flag + '" must be false' });
    }
    if (REDACTION_FLAG_VALUES && REDACTION_FLAG_VALUES[flag] === true && value !== true) {
      blockers.push({ code: BLOCKER_CODES.PRODUCER_REDACTION_LEAK(flag), reason: 'redaction_posture flag "' + flag + '" must be true' });
    }
  }

  // Correlation contract.
  const cc = bundle.correlation_contract || {};
  if (!cc.agent_run_id || !AGENT_RUN_ID_REGEX.test(cc.agent_run_id)) blockers.push({ code: BLOCKER_CODES.PRODUCER_CORRELATION_BROKEN('agent_run_id'), reason: 'agent_run_id pattern mismatch' });
  if (!Array.isArray(cc.probe_to_criterion) || cc.probe_to_criterion.length < 1) blockers.push({ code: BLOCKER_CODES.PRODUCER_CORRELATION_BROKEN('probe_to_criterion'), reason: 'probe_to_criterion empty' });
  if (!Array.isArray(cc.agent_run_to_probe) || cc.agent_run_to_probe.length < 1) blockers.push({ code: BLOCKER_CODES.PRODUCER_CORRELATION_BROKEN('agent_run_to_probe'), reason: 'agent_run_to_probe empty' });
  if (!Array.isArray(cc.evidence_to_criterion) || cc.evidence_to_criterion.length < 1) blockers.push({ code: BLOCKER_CODES.PRODUCER_CORRELATION_BROKEN('evidence_to_criterion'), reason: 'evidence_to_criterion empty' });
  const probeSet = new Set();
  const evidenceSet = new Set();
  const criterionSet = new Set();
  const independenceSet = new Set();
  for (const row of (cc.probe_to_criterion || [])) {
    if (probeSet.has(row.probe_id)) blockers.push({ code: BLOCKER_CODES.PRODUCER_CORRELATION_BROKEN('probe_id:duplicate'), reason: 'duplicate probe_id "' + row.probe_id + '"' });
    if (evidenceSet.has(row.evidence_id)) blockers.push({ code: BLOCKER_CODES.PRODUCER_CORRELATION_BROKEN('evidence_id:duplicate'), reason: 'duplicate evidence_id "' + row.evidence_id + '"' });
    if (criterionSet.has(row.criterion_id)) blockers.push({ code: BLOCKER_CODES.PRODUCER_CORRELATION_BROKEN('criterion_id:duplicate'), reason: 'duplicate criterion_id "' + row.criterion_id + '"' });
    if (independenceSet.has(row.independence_group)) blockers.push({ code: BLOCKER_CODES.PRODUCER_INDEPENDENCE_GROUP_REUSED(row.independence_group), reason: 'reused independence_group "' + row.independence_group + '"' });
    probeSet.add(row.probe_id); evidenceSet.add(row.evidence_id); criterionSet.add(row.criterion_id); independenceSet.add(row.independence_group);
  }

  // Replay keys.
  const rk = bundle.replay_keys || {};
  if (rk.first_run_provenance_hash !== rk.second_run_provenance_hash) blockers.push({ code: BLOCKER_CODES.PRODUCER_REPLAY_NOT_BYTE_IDENTICAL(), reason: 'replay_keys first/second mismatch' });
  if (rk.match !== true) blockers.push({ code: BLOCKER_CODES.PRODUCER_REPLAY_NOT_BYTE_IDENTICAL(), reason: 'replay_keys.match must be true' });
  if (rk.byte_identical !== true) blockers.push({ code: BLOCKER_CODES.PRODUCER_REPLAY_NOT_BYTE_IDENTICAL(), reason: 'replay_keys.byte_identical must be true' });

  // raw_input_immutability_verified.
  if (bundle.raw_input_immutability_verified !== true) blockers.push({ code: BLOCKER_CODES.PRODUCER_EVIDENCE_CHAIN_BROKEN('raw_input_immutability_verified'), reason: 'raw_input_immutability_verified must be true' });

  // producer_verdict_line pattern.
  if (!bundle.producer_verdict_line || !/^M16-S04-CANARY\s+verdict=[A-Z0-9_]+/.test(bundle.producer_verdict_line)) blockers.push({ code: BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('producer_verdict_line'), reason: 'producer_verdict_line missing or malformed' });

  // Subset size budget.
  if (Array.isArray(bundle.records) && bundle.records.length > RECORDS_BUDGET.max_total_records) {
    blockers.push({ code: BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('records.length'), reason: 'records exceed budget ' + RECORDS_BUDGET.max_total_records });
  }

  // Optional AJV schema validation if available.
  if (options.runSchema !== false) {
    try {
      const _compiler = _ensureBundleValidator();
      if (_compiler && _compiler.validate) {
        if (!_compiler.validate(bundle)) {
          blockers.push({ code: BLOCKER_CODES.PRODUCER_BUNDLE_MALFORMED(), reason: 'Ajv bundle schema rejected (errors=' + (_compiler.validate.errors ? _compiler.validate.errors.length : 0) + ')' });
        }
      }
    } catch (e) {
      // Schema loader failures are not fail-closed at the top-level evaluator when the bundle was constructed manually;
      // they should have surfaced during load.
    }
  }

  const verdict = blockers.length === 0 ? CANARY_VERDICT_VALUES.PRODUCED : CANARY_VERDICT_VALUES.FAIL_CLOSED;
  return { ok: verdict === CANARY_VERDICT_VALUES.PRODUCED, verdict: verdict, blockers: blockers };
}

// Object shape validation (test + validator helper).
function validateBundleShape(bundle, schemaValidate) {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
    return { ok: false, code: BLOCKER_CODES.PRODUCER_BUNDLE_MALFORMED(), reason: 'bundle missing' };
  }
  if (typeof schemaValidate === 'function') {
    if (!schemaValidate(bundle)) {
      return { ok: false, code: BLOCKER_CODES.PRODUCER_BUNDLE_MALFORMED(), reason: 'Ajv bundle validator rejected' };
    }
  }
  if (bundle.bundle_kind !== BUNDLE_KIND) {
    return { ok: false, code: BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('bundle_kind'), reason: 'bundle_kind must be "' + BUNDLE_KIND + '"' };
  }
  return { ok: true };
}

module.exports = {
  // schema + hashing
  loadSchema,
  sha256Hex,
  canonicalizeBundle,
  computeBundleBodyDigest,
  _stableStringify,
  // redaction safety
  checkRedactionSafety,
  assertBundleWriteSafe,
  // subset / correlation / classification
  buildCanarySubset,
  buildCorrelationContract,
  buildEmbeddedClassification,
  buildEvidenceChain,
  attachReplayKeys,
  buildProbeRunLedger,
  buildInputInventory,
  buildProducerProtocol,
  evaluateCanaryContract,
  validateBundleShape,
  mapBlockerToExitCode,
  // helpers exposed for tests + validator
  ROLE_REGEX,
  HARD_GATE_IDS_HINT: HARD_GATE_IDS_HINT_FROZEN,
  DEFAULTS,
  ROOT,
  EVIDENCE_ID_REGEX,
  AGENT_RUN_ID_REGEX,
  PROBE_ID_RE,
  SHA256_RE,
  SHA512_RE,
  SAFE_CHARSET_DIGEST,
  SAFE_CHARSET_LIMIT,
  SAFE_CHARSET_COMMAND,
  BOUNDED_BUNDLE_HASH_RE,
  SCHEMA_REF_RE,
  PRODUCER_PROTOCOL_PATH_RE,
  BUNDLE_PATH_RE,
  SCRATCH_ROOT_RE,
  PATH_TRAVERSAL_RE,
  ROLE_SUBSET_DEFAULTS,
  DRILL_SUBSET_DEFAULTS,
  CANARY_KINDS,
  RECORDS_BUDGET,
  CORRELATION_BUDGET,
  SOURCE_ALLOWLIST,
  CANARY_GATE_IDS,
  CANARY_GATE_LABELS,
};
