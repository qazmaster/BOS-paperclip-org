#!/usr/bin/env node
'use strict';
/**
 * scripts/lib/m016-s03-safe-probe-contract.js
 * M016-txa3vu / S03 / T02 — Pure fail-closed probe contract.
 * Pure evaluator over a sanitised safe-probe record. No fs/network mutation.
 * Determinism: same record + same options -> same gates, verdicts, blockers.
 * Public API: loadSchema, sanitizeString, checkRedactionSafety,
 * assertProbeWriteSafe, canonicalizeRecord, computeRecordDigest, computeProbeId,
 * computeArtifactHash, validateProbeRecordShape, evaluateProbeContract,
 * buildExecutedRecord, buildNotProvenRecord, buildProtocolEvidence,
 * checkIndependenceReuse, trackExecutedIndependence, checkLaunchPromotion,
 * checkStaleIdentity, validateRawStateWorksheet, checkScratchContainment,
 * cloneRedactionFlags, cloneMutationAudit.
 * Reuses S02 helpers (sanitizeString, checkRedactionSafety, _stableStringify).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const data = require('./m016-s03-safe-probe-data');
const s02Contract = require('./m016-s02-bos-mission-proof-contract');
const {
 SCHEMA_ID, SCHEMA_VERSION, MILESTONE, SLICE, TASK_IDS,
 PROBE_ID_PREFIX, PROBE_BLOCKER_CODE_PATTERN,
 INDEPENDENCE_GROUP_PATTERN,
 ROLE_BY_NAME, INDEPENDENCE_GROUPS_SET,
 isKnownRole, getRoleEntry,
 PROBE_METHOD_PATTERN, isAllowedMethod,
 PROHIBITED_METHODS_SET, MUTATION_VERB_REGEX,
 isKnownDrillKind,
 HARD_GATE_IDS,
 BLOCKER_CODES, BLOCKER_CODE_REGEX, isValidIdentityKind,
 REDACTION_BOUNDS, REDACTION_FLAG_VALUES,
 MUTATION_AUDIT_ZERO_COUNTERS,
 isKnownCounter, allZeroMutationAudit,
 isDeadIdentity,
 VERDICT_VALUES_SET, FORBIDDEN_PROBE_VERDICTS, isValidProbeVerdict,
 CLASSIFICATION_VALUES_SET,
 EXIT_CODES,
 DEFAULTS,
} = data;
const s02SanitizeString = s02Contract.sanitizeString;
const s02CheckRedactionSafety = s02Contract.checkRedactionSafety;
const s02StableStringify = s02Contract._stableStringify;
const ROOT = path.resolve(__dirname, '..', '..');
const P = path.posix;
// Skip keys for redaction-safety checks (bounded role/system identifiers).
const PROBE_REDACTION_SKIP_KEYS = Object.freeze(new Set([
 'schema_id','schema_version','milestone','slice','task','generated','started_at','finished_at',
 'probe_id','role','role_class','independence_group','classification','verdict','blocker_codes',
 'observed_blocker_code','command','method','duration_ms','source_identity','isolation_invariant',
 'mutation_audit','redaction','exit_code','attempted_exit_code','artifact_hash',
]));
// Schema loader (AJV with optional fallback) — mirrors S02 pattern.
let _ajvInstance = null;
let _ajvInitFailed = false;
let _compiler = null;
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
 const skip = skipKeys ? new Set([...PROBE_REDACTION_SKIP_KEYS, ...skipKeys]) : PROBE_REDACTION_SKIP_KEYS;
 return s02CheckRedactionSafety(payload, skip);
}

function assertProbeWriteSafe(record, skipKeys) {
 const hits = checkRedactionSafety(record, skipKeys);
 if (hits.length > 0) {
 const err = new Error(`refused write: redaction leak in probe record (count=${hits.length})`);
 err.code = BLOCKER_CODES.REDACTION_LEAK_RAW_BODY(record && record.role ? record.role : 'unknown');
 err.hits = hits;
 throw err;
 }
}
// --- Canonicalisation / hashing ---
const PROBE_ID_SCHEMA_REGEX = new RegExp('^M16-S03-PROBE-[a-z][a-z0-9._-]{2,63}$');
const INDEPENDENCE_GROUP_REGEX = new RegExp(INDEPENDENCE_GROUP_PATTERN);
function _safeProbeSuffix(value) {
 const raw = String(value == null ? '' : value);
 const cleaned = raw.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
 return cleaned ? cleaned.slice(0, 64) : 'x';
}

function computeProbeId(input) {
 const inData = input || {};
 const role = inData.role;
 if (!role || !isKnownRole(role)) return null;
 const classification = inData.classification || 'EXECUTED';
 const suffix = _safeProbeSuffix(inData.suffix || inData.kindToken || 'probe');
 const seed = inData.seed != null ? String(inData.seed) : '';
 const payload = [SCHEMA_VERSION, MILESTONE, SLICE, role, classification, suffix, seed].join('|');
 const hex = crypto.createHash('sha256').update(payload).digest('hex').slice(0, 8);
 return PROBE_ID_PREFIX + role.toLowerCase().replace(/\./g, '-') + '-' + suffix + '-' + hex;
}

function computeArtifactHash(content) {
 const buf = Buffer.isBuffer(content) ? content : Buffer.from(content == null ? '' : String(content), 'utf8');
 return crypto.createHash('sha256').update(buf).digest('hex');
}

function canonicalizeRecord(record) {
 if (record === null || typeof record !== 'object' || Array.isArray(record)) return null;
 const sortable = {};
 for (const k of Object.keys(record).sort()) {
 if (record[k] === undefined) continue;
 sortable[k] = record[k];
 }
 return s02StableStringify(sortable);
}

function computeRecordDigest(record) {
 return crypto.createHash('sha256').update(s02StableStringify(record || {})).digest('hex');
}
// --------------------------------------------------------------------------- Field-shape regexes ---------------------------------------------------------------------------
const SHA256_RE = /^[a-f0-9]{64}$/;
const SHA512_RE = /^[a-f0-9]{128}$/;
const BOUNDED_PATH_RE = /^(runtime-evidence|scripts)\/[A-Za-z0-9._/\-]+$/;
const SAFE_SCRATCH_ROOT_PATTERN = /^\/(?:tmp|private\/tmp|var\/folders|Users\/[^/]+\/Library\/Caches\/Temp)(?:\/[A-Za-z0-9._\-]+)*\/?$/;
const SAFE_SCRATCH_ROOT_LINUX = /^\/run\/(?:m016-s03|user\/[0-9]+\/m016-s03)(?:\/[A-Za-z0-9._\-]+)*\/?$/;
const SAFE_CHARSET_DIGEST = /^[A-Za-z0-9 .:;,_<>/\-]+$/;
const SAFE_CHARSET_SCOPE = /^[A-Za-z0-9 .:;,_<>/\-]+$/;
const SAFE_CHARSET_LIMIT = /^[A-Za-z0-9 .:;,_<>/\-{}?&=%@]+$/;
const SAFE_CHARSET_COMMAND = /^[A-Za-z0-9 .:;,_<>/\-{}?&=%@]+$/;
const SAFE_CHARSET_ROLE_TOKEN = /^[A-Za-z0-9._-]+$/;
const ISO_DATETIME_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})?$/;
const PATH_TRAVERSAL_RE = /(?:\.\.|\/\.)/;
function _isIsoDate(value) { return typeof value === 'string' && ISO_DATETIME_RE.test(value) && Number.isFinite(Date.parse(value)); }

function checkScratchContainment(value) {
 if (typeof value !== 'string') return { ok: false, code: BLOCKER_CODES.SCRATCH_TARGET_MISSING('scratch_root'), reason: 'scratch_root must be a string' };
 if (value.length < 1 || value.length > 256) return { ok: false, code: BLOCKER_CODES.SCRATCH_PATH_OUTSIDE_TMP('length'), reason: 'scratch_root length out of [1,256]' };
 if (PATH_TRAVERSAL_RE.test(value)) return { ok: false, code: BLOCKER_CODES.PATH_TRAVERSAL('scratch_root', 'scratch'), reason: 'scratch_root contains ../' };
 if (!P.isAbsolute(value)) return { ok: false, code: BLOCKER_CODES.SCRATCH_PATH_OUTSIDE_TMP('absolute'), reason: 'scratch_root must be absolute' };
 const normalized = P.normalize(value);
 if (normalized.includes('..')) return { ok: false, code: BLOCKER_CODES.PATH_TRAVERSAL('scratch_root', 'scratch'), reason: 'scratch_root normalizes to ..' };
 if (!SAFE_SCRATCH_ROOT_PATTERN.test(normalized) && !SAFE_SCRATCH_ROOT_LINUX.test(normalized)) {
 return { ok: false, code: BLOCKER_CODES.SCRATCH_PATH_OUTSIDE_TMP(normalized), reason: 'scratch_root "' + normalized + '" outside allowed scratch prefixes' };
 }
 return { ok: true };
}
// --------------------------------------------------------------------------- Per-field validators (orchestrator-only) ----------------------------------
function _validateTopShape(record) {
 if (record === undefined || record === null) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'record missing' };
 if (typeof record !== 'object' || Array.isArray(record)) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'record must be object' };
 if (record.schema_id !== SCHEMA_ID) return { ok: false, code: BLOCKER_CODES.SCHEMA_VALIDATION_FAILED('schema_id'), reason: 'schema_id "' + record.schema_id + '" not canonical' };
 if (record.schema_version !== SCHEMA_VERSION) return { ok: false, code: BLOCKER_CODES.SCHEMA_VALIDATION_FAILED('schema_version'), reason: 'schema_version "' + record.schema_version + '" not canonical' };
 if (record.milestone !== MILESTONE) return { ok: false, code: BLOCKER_CODES.SCHEMA_VALIDATION_FAILED('milestone'), reason: 'milestone "' + record.milestone + '" not canonical' };
 if (record.slice !== SLICE) return { ok: false, code: BLOCKER_CODES.SCHEMA_VALIDATION_FAILED('slice'), reason: 'slice "' + record.slice + '" not canonical' };
 if (!TASK_IDS.includes(record.task)) return { ok: false, code: BLOCKER_CODES.SCHEMA_VALIDATION_FAILED('task'), reason: 'task "' + record.task + '" not in ' + TASK_IDS.join(',') };
 if (!isKnownRole(record.role)) return { ok: false, code: BLOCKER_CODES.ROLE_UNKNOWN(record.role || 'unknown'), reason: 'role "' + record.role + '" not in registry' };
 const entry = ROLE_BY_NAME[record.role];
 if (record.role_class !== entry.role_class) return { ok: false, code: BLOCKER_CODES.SCHEMA_VALIDATION_FAILED('role_class'), reason: 'role_class mismatch for ' + record.role };
 if (!CLASSIFICATION_VALUES_SET.has(record.classification)) return { ok: false, code: BLOCKER_CODES.PROBE_CLASSIFICATION_INVALID(record.role, String(record.classification)), reason: 'classification "' + record.classification + '" not canonical' };
 if (record.independence_group !== entry.independence_group) return { ok: false, code: BLOCKER_CODES.SCHEMA_VALIDATION_FAILED('independence_group'), reason: 'independence_group "' + record.independence_group + '" does not match role registry' };
 return { ok: true };
}

function _validateIsoTimestamp(field, value, role) {
 if (typeof value !== 'string') return { ok: false, code: BLOCKER_CODES.TIMESTAMP_INVALID(role, field), reason: field + ' must be a string' };
 if (!_isIsoDate(value)) return { ok: false, code: BLOCKER_CODES.TIMESTAMP_INVALID(role, field), reason: field + '="' + value + '" is not ISO-8601' };
 return { ok: true };
}

function _validateGenerated(record) {
 if (!_isIsoDate(record.generated)) return { ok: false, code: BLOCKER_CODES.TIMESTAMP_INVALID(record.role || 'unknown', 'generated'), reason: 'generated is not ISO-8601' };
 return { ok: true };
}

function _validateProbeId(record) {
 const role = record.role || 'unknown';
 const probeId = record.probe_id;
 if (typeof probeId !== 'string') return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'probe_id must be a string' };
 if (probeId.length < DEFAULTS.bounded_probe_id_min_chars || probeId.length > DEFAULTS.bounded_probe_id_max_chars) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'probe_id length out of [18,80]' };
 if (!PROBE_ID_SCHEMA_REGEX.test(probeId)) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'probe_id "' + probeId + '" does not match frozen pattern' };
 if (!probeId.startsWith(PROBE_ID_PREFIX)) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'probe_id missing prefix ' + PROBE_ID_PREFIX };
 return { ok: true };
}

function _validateIndependenceGroup(record) {
 const ig = record.independence_group;
 if (typeof ig !== 'string') return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'independence_group must be a string' };
 if (!INDEPENDENCE_GROUP_REGEX.test(ig)) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'independence_group "' + ig + '" does not match frozen kebab pattern' };
 if (!INDEPENDENCE_GROUPS_SET.has(ig)) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'independence_group "' + ig + '" not in role registry' };
 return { ok: true };
}

function _validateMethod(record) {
 const role = record.role || 'unknown';
 const method = record.method;
 if (typeof method !== 'string') return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'method must be a string' };
 if (method.length < 5 || method.length > 256) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'method length out of [5,256]' };
 if (MUTATION_VERB_REGEX.test(method)) return { ok: false, code: BLOCKER_CODES.MUTATION_VERB_DETECTED(role, method), reason: 'method "' + method + '" starts with mutation verb' };
 if (PROHIBITED_METHODS_SET.has(method.trim().split(/\s+/)[0])) return { ok: false, code: BLOCKER_CODES.METHOD_PROHIBITED(role, method), reason: 'method "' + method + '" uses prohibited HTTP verb' };
 if (!isAllowedMethod(method)) return { ok: false, code: BLOCKER_CODES.METHOD_NOT_IN_ALLOWLIST(role, method), reason: 'method "' + method + '" outside allowlist' };
 return { ok: true };
}

function _validateCommand(record) {
 const role = record.role || 'unknown';
 const command = record.command;
 if (typeof command !== 'string') return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'command must be a string' };
 if (command.length < 1 || command.length > 400) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'command length out of [1,400]' };
 if (MUTATION_VERB_REGEX.test(command)) return { ok: false, code: BLOCKER_CODES.MUTATION_VERB_DETECTED(role, command), reason: 'command starts with mutation verb' };
 if (!SAFE_CHARSET_COMMAND.test(command)) return { ok: false, code: BLOCKER_CODES.COMMAND_LEAK(role, 'charset'), reason: 'command outside safe charset' };
 if (REDACTION_BOUNDS.sk_token.test(command) || REDACTION_BOUNDS.tp_token.test(command) || REDACTION_BOUNDS.bearer_token.test(command)) {
 return { ok: false, code: BLOCKER_CODES.COMMAND_LEAK(role, 'credential'), reason: 'command carries credential/token marker' };
 }
 return { ok: true };
}

function _validateScope(record) {
 const role = record.role || 'unknown';
 const scope = record.scope;
 if (typeof scope !== 'string') return { ok: false, code: BLOCKER_CODES.SCOPE_MISSING(role), reason: 'scope must be a string' };
 if (scope.length < 1 || scope.length > 200) return { ok: false, code: BLOCKER_CODES.SCOPE_MISSING(role), reason: 'scope length out of [1,200]' };
 if (!SAFE_CHARSET_SCOPE.test(scope)) return { ok: false, code: BLOCKER_CODES.SCOPE_MISSING(role), reason: 'scope outside safe charset' };
 return { ok: true };
}

function _validateLimitations(record) {
 const role = record.role || 'unknown';
 const limitations = record.limitations;
 if (!Array.isArray(limitations)) return { ok: false, code: BLOCKER_CODES.LIMITATIONS_MISSING(role), reason: 'limitations must be an array' };
 if (limitations.length < 1 || limitations.length > 16) return { ok: false, code: BLOCKER_CODES.LIMITATIONS_MISSING(role), reason: 'limitations length out of [1,16]' };
 for (let i = 0; i < limitations.length; i++) {
 const item = limitations[i];
 if (typeof item !== 'string') return { ok: false, code: BLOCKER_CODES.LIMITATIONS_MISSING(role), reason: 'limitations[' + i + '] must be string' };
 if (item.length < 1 || item.length > 200) return { ok: false, code: BLOCKER_CODES.LIMITATIONS_MISSING(role), reason: 'limitations[' + i + '] length out of [1,200]' };
 if (!SAFE_CHARSET_LIMIT.test(item)) return { ok: false, code: BLOCKER_CODES.LIMITATIONS_MISSING(role), reason: 'limitations[' + i + '] outside safe charset' };
 if (REDACTION_BOUNDS.sk_token.test(item) || REDACTION_BOUNDS.tp_token.test(item) || REDACTION_BOUNDS.bearer_token.test(item)) return { ok: false, code: BLOCKER_CODES.COMMAND_LEAK(role, 'limitation-credential'), reason: 'limitations[' + i + '] carries credential marker' };
 if (REDACTION_BOUNDS.uuid.test(item)) return { ok: false, code: BLOCKER_CODES.REDACTION_LEAK_UUID(role), reason: 'limitations[' + i + '] carries raw UUID' };
 }
 return { ok: true };
}

function _validateSourceIdentity(record) {
 const role = record.role || 'unknown';
 const si = record.source_identity;
 if (si === undefined || si === null) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'source_identity missing' };
 if (typeof si !== 'object' || Array.isArray(si)) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'source_identity must be an object' };
 if (!isValidIdentityKind(si.kind)) return { ok: false, code: BLOCKER_CODES.PROBE_CLASSIFICATION_INVALID(role, si.kind || 'unknown'), reason: 'source_identity.kind "' + (si.kind || '') + '" not canonical' };
 if (si.kind === 'paperclip_api_readonly') {
 if (typeof si.company_kind !== 'string' || !SAFE_CHARSET_ROLE_TOKEN.test(si.company_kind)) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'paperclip_api_readonly requires company_kind in safe charset' };
 if (typeof si.auth_method !== 'string' || !SAFE_CHARSET_ROLE_TOKEN.test(si.auth_method)) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'paperclip_api_readonly requires auth_method in safe charset' };
 } else if (si.kind === 'scratch_drill') {
 if (typeof si.scratch_root !== 'string') return { ok: false, code: BLOCKER_CODES.SCRATCH_TARGET_MISSING('scratch_root'), reason: 'scratch_drill requires scratch_root' };
 if (!isKnownDrillKind(si.drill_kind)) return { ok: false, code: BLOCKER_CODES.DRILL_PRECONDITION_FAILED(si.drill_kind || 'unknown', 'drill_kind'), reason: 'drill_kind "' + (si.drill_kind || '') + '" not canonical' };
 const cr = checkScratchContainment(si.scratch_root);
 if (!cr.ok) return cr;
 } else if (si.kind === 'offline_bundle_read') {
 if (typeof si.bundle_ref !== 'string' || !BOUNDED_PATH_RE.test(si.bundle_ref)) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'offline_bundle_read requires bounded bundle_ref' };
 if (PATH_TRAVERSAL_RE.test(si.bundle_ref)) return { ok: false, code: BLOCKER_CODES.PATH_TRAVERSAL(role, 'bundle_ref'), reason: 'bundle_ref contains traversal' };
 }
 return { ok: true };
}

function _validateIsolation(record) {
 const role = record.role || 'unknown';
 const iso = record.isolation_invariant;
 if (!iso || typeof iso !== 'object' || Array.isArray(iso)) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'isolation_invariant must be an object' };
 if (typeof iso.read_only_boundary_pass !== 'boolean') return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'isolation_invariant.read_only_boundary_pass must be boolean' };
 if (typeof iso.scratch_target_used !== 'boolean') return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'isolation_invariant.scratch_target_used must be boolean' };
 if (iso.boundary_blocker_code !== null && iso.boundary_blocker_code !== undefined) {
 if (typeof iso.boundary_blocker_code !== 'string' || !BLOCKER_CODE_REGEX.test(iso.boundary_blocker_code)) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'boundary_blocker_code "' + iso.boundary_blocker_code + '" does not match frozen pattern' };
 }
 const kind = record.source_identity && record.source_identity.kind;
 if (kind === 'paperclip_api_readonly') {
 if (iso.scratch_target_used !== false) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'live paperclip probe must have scratch_target_used=false' };
 if (iso.read_only_boundary_pass !== true) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'live paperclip probe must have read_only_boundary_pass=true' };
 } else if (kind === 'scratch_drill') {
 if (iso.scratch_target_used !== true) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'scratch drill must have scratch_target_used=true' };
 if (iso.read_only_boundary_pass !== true) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'scratch drill must have read_only_boundary_pass=true' };
 }
 if (iso.read_only_boundary_pass === false && (iso.boundary_blocker_code === null || iso.boundary_blocker_code === undefined)) {
 return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'read_only_boundary_pass=false requires boundary_blocker_code' };
 }
 return { ok: true };
}

function _validateMutationAudit(record) {
 const role = record.role || 'unknown';
 const ma = record.mutation_audit;
 if (!ma || typeof ma !== 'object' || Array.isArray(ma)) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'mutation_audit must be an object' };
 for (const counter of MUTATION_AUDIT_ZERO_COUNTERS) {
 if (!(counter in ma)) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'mutation_audit.' + counter + ' missing' };
 if (!Number.isInteger(ma[counter]) || ma[counter] < 0) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'mutation_audit.' + counter + ' must be non-negative integer' };
 }
 for (const k of Object.keys(ma)) {
 if (!isKnownCounter(k)) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'mutation_audit.' + k + ' not in frozen counter list' };
 }
 const kind = record.source_identity && record.source_identity.kind;
 if (kind === 'paperclip_api_readonly') {
 for (const counter of MUTATION_AUDIT_ZERO_COUNTERS) {
 if (ma[counter] !== 0) return { ok: false, code: BLOCKER_CODES.BOUNDARY_MUTATION_DETECTED(role, counter, ma[counter]), reason: 'live probe bumped ' + counter + ' to ' + ma[counter] };
 }
 }
 return { ok: true };
}

function _validateRedaction(record) {
 const role = record.role || 'unknown';
 const rd = record.redaction;
 if (!rd || typeof rd !== 'object' || Array.isArray(rd)) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'redaction must be an object' };
 for (const [flag, expected] of Object.entries(REDACTION_FLAG_VALUES)) {
 if (rd[flag] !== expected) return { ok: false, code: BLOCKER_CODES.REDACTION_LEAK_RAW_BODY(role), reason: 'redaction.' + flag + ' must be ' + expected + ', got ' + rd[flag] };
 }
 for (const k of Object.keys(rd)) {
 if (!(k in REDACTION_FLAG_VALUES)) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'redaction.' + k + ' not in frozen flag list' };
 }
 return { ok: true };
}

function _validateTimestamps(record) {
 const role = record.role || 'unknown';
 const start = record.started_at;
 const finish = record.finished_at;
 const duration = record.duration_ms;
 let r = _validateIsoTimestamp('started_at', start, role);
 if (!r.ok) return r;
 r = _validateIsoTimestamp('finished_at', finish, role);
 if (!r.ok) return r;
 if (!Number.isInteger(duration) || duration < 0 || duration > 600000) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'duration_ms out of [0,600000]' };
 const startMs = Date.parse(start);
 const finishMs = Date.parse(finish);
 if (finishMs < startMs) return { ok: false, code: BLOCKER_CODES.TIMESTAMP_INVALID(role, 'finished_at'), reason: 'finished_at < started_at' };
 const wall = finishMs - startMs;
 if (wall > 600000) return { ok: false, code: BLOCKER_CODES.TIMESTAMP_INVALID(role, 'finished_at'), reason: 'wall-clock duration exceeds 10 minutes ceiling' };
 if (duration > wall + 5000) return { ok: false, code: BLOCKER_CODES.TIMESTAMP_INVALID(role, 'duration_ms'), reason: 'duration_ms ' + duration + ' exceeds wall-clock ' + wall + ' by > 5s' };
 if (duration < wall - 5000) return { ok: false, code: BLOCKER_CODES.TIMESTAMP_INVALID(role, 'duration_ms'), reason: 'duration_ms ' + duration + ' undercounts wall-clock ' + wall + ' by > 5s' };
 return { ok: true };
}

function _validateExitCode(record) {
 const role = record.role || 'unknown';
 if (record.classification === 'EXECUTED') {
 if (!Number.isInteger(record.exit_code) || record.exit_code < -1 || record.exit_code > 255) return { ok: false, code: BLOCKER_CODES.EXIT_CODE_INVALID(role, String(record.exit_code)), reason: 'exit_code out of [-1,255]' };
 } else if (record.classification === 'NOT_PROVEN') {
 if (!Number.isInteger(record.attempted_exit_code) || record.attempted_exit_code < -1 || record.attempted_exit_code > 599) return { ok: false, code: BLOCKER_CODES.EXIT_CODE_INVALID(role, String(record.attempted_exit_code)), reason: 'attempted_exit_code out of [-1,599]' };
 }
 return { ok: true };
}

function _validateExecutedHashes(record) {
 const role = record.role || 'unknown';
 const digest = record.sanitised_digest;
 const ref = record.artifact_reference;
 const hash = record.artifact_hash;
 if (typeof digest !== 'string' || digest.length < 8 || digest.length > 256 || !SAFE_CHARSET_DIGEST.test(digest)) return { ok: false, code: BLOCKER_CODES.DIGEST_CHARSET_VIOLATION(role), reason: 'sanitised_digest out of [8,256] or outside safe charset' };
 if (typeof ref !== 'string' || ref.length < 1 || ref.length > 256) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'artifact_reference length out of [1,256]' };
 if (!BOUNDED_PATH_RE.test(ref)) return { ok: false, code: BLOCKER_CODES.PATH_TRAVERSAL(role, 'artifact_reference'), reason: 'artifact_reference "' + ref + '" outside runtime-evidence/ or scripts/' };
 if (PATH_TRAVERSAL_RE.test(ref)) return { ok: false, code: BLOCKER_CODES.PATH_TRAVERSAL(role, 'artifact_reference'), reason: 'artifact_reference "' + ref + '" contains traversal' };
 const normalized = P.normalize(ref);
 if (normalized.includes('..') || normalized.startsWith('/')) return { ok: false, code: BLOCKER_CODES.PATH_TRAVERSAL(role, 'artifact_reference'), reason: 'artifact_reference "' + ref + '" normalizes to "' + normalized + '"' };
 if (typeof hash !== 'string' || (!SHA256_RE.test(hash) && !SHA512_RE.test(hash))) return { ok: false, code: BLOCKER_CODES.HASH_MALFORMED(role), reason: 'artifact_hash "' + hash + '" not sha256|sha512 lowercase hex' };
 return { ok: true };
}

function _validateNotProvenFields(record) {
 const role = record.role || 'unknown';
 const code = record.observed_blocker_code;
 const reason = record.observed_blocker_reason;
 if (typeof code !== 'string' || code.length < 16 || code.length > 96 || !BLOCKER_CODE_REGEX.test(code)) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'observed_blocker_code "' + code + '" does not match frozen pattern' };
 if (typeof reason !== 'string' || reason.length < 1 || reason.length > 400) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'observed_blocker_reason length out of [1,400]' };
 if (!SAFE_CHARSET_DIGEST.test(reason)) return { ok: false, code: BLOCKER_CODES.DIGEST_CHARSET_VIOLATION(role), reason: 'observed_blocker_reason outside safe charset' };
 if (REDACTION_BOUNDS.uuid.test(reason) || REDACTION_BOUNDS.credential_assignment.test(reason) || REDACTION_BOUNDS.bearer_token.test(reason) || REDACTION_BOUNDS.sk_token.test(reason) || REDACTION_BOUNDS.tp_token.test(reason) || REDACTION_BOUNDS.vendor_reuse.test(reason) || REDACTION_BOUNDS.raw_result_json_result.test(reason)) {
 return { ok: false, code: BLOCKER_CODES.REDACTION_LEAK_RAW_BODY(role), reason: 'observed_blocker_reason carries raw marker' };
 }
 return { ok: true };
}

function _validateVerdict(record) {
 if (FORBIDDEN_PROBE_VERDICTS.includes(record.verdict)) return { ok: false, code: BLOCKER_CODES.LAUNCH_PROMOTION_ATTEMPTED(record.role || 'unknown'), reason: 'verdict "' + record.verdict + '" is a forbidden launch verdict' };
 if (!isValidProbeVerdict(record.verdict)) return { ok: false, code: BLOCKER_CODES.VERDICT_DRIFT(record.role || 'unknown', String(record.verdict)), reason: 'verdict "' + record.verdict + '" not in probe vocabulary' };
 if (record.classification === 'NOT_PROVEN' && record.verdict !== 'not_proven') return { ok: false, code: BLOCKER_CODES.PROBE_FORGED_NOT_PROVEN(record.role || 'unknown'), reason: 'NOT_PROVEN record with verdict=pass|fail_closed is fail-closed' };
 if (record.classification === 'EXECUTED' && record.verdict === 'not_proven') return { ok: false, code: BLOCKER_CODES.VERDICT_DRIFT(record.role || 'unknown', 'not_proven'), reason: 'EXECUTED record cannot carry verdict=not_proven' };
 return { ok: true };
}

function _validateBlockerCodes(record) {
 const codes = record.blocker_codes;
 if (!Array.isArray(codes)) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'blocker_codes must be array' };
 if (codes.length > 32) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'blocker_codes length ' + codes.length + ' > 32' };
 const seen = new Set();
 for (let i = 0; i < codes.length; i++) {
 const c = codes[i];
 if (typeof c !== 'string' || !BLOCKER_CODE_REGEX.test(c) || c.length < 16 || c.length > 96) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'blocker_codes[' + i + '] "' + c + '" outside pattern' };
 if (seen.has(c)) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'blocker_codes[' + i + '] duplicate ' + c };
 seen.add(c);
 }
 if (record.classification === 'EXECUTED' && record.verdict === 'pass' && codes.length !== 0) return { ok: false, code: BLOCKER_CODES.VERDICT_DRIFT(record.role || 'unknown', 'pass-with-blockers'), reason: 'EXECUTED verdict=pass requires empty blocker_codes' };
 if (record.classification === 'EXECUTED' && record.verdict === 'fail_closed' && codes.length < 1) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'EXECUTED verdict=fail_closed requires at least one blocker_code' };
 if (record.classification === 'NOT_PROVEN' && codes.length < 1) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'NOT_PROVEN requires at least one blocker_code' };
 if (record.classification === 'NOT_PROVEN' && !codes.includes(record.observed_blocker_code)) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'NOT_PROVEN blocker_codes must include observed_blocker_code' };
 return { ok: true };
}

function _validateBranchIntegrity(record) {
 const isExecuted = record.classification === 'EXECUTED';
 const isNotProven = record.classification === 'NOT_PROVEN';
 if (isExecuted) {
 if ('attempted_exit_code' in record) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'EXECUTED record carries NOT_PROVEN-only attempted_exit_code' };
 if ('observed_blocker_code' in record) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'EXECUTED record carries NOT_PROVEN-only observed_blocker_code' };
 if ('observed_blocker_reason' in record) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'EXECUTED record carries NOT_PROVEN-only observed_blocker_reason' };
 } else if (isNotProven) {
 if ('exit_code' in record) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'NOT_PROVEN record carries EXECUTED-only exit_code' };
 if ('sanitised_digest' in record) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'NOT_PROVEN record carries EXECUTED-only sanitised_digest' };
 if ('artifact_reference' in record) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'NOT_PROVEN record carries EXECUTED-only artifact_reference' };
 if ('artifact_hash' in record) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'NOT_PROVEN record carries EXECUTED-only artifact_hash' };
 } else {
 return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'classification "' + record.classification + '" not in EXECUTED|NOT_PROVEN' };
 }
 return { ok: true };
}
// --------------------------------------------------------------------------- Cross-record checks ---------------------------------------------------------------------------
function checkIndependenceReuse(record, observedExecuted) {
 if (!record || record.classification !== 'EXECUTED') return { ok: true };
 if (!observedExecuted || !(observedExecuted instanceof Map)) return { ok: true };
 const group = record.independence_group;
 if (!group) return { ok: true };
 const prior = observedExecuted.get(group) || [];
 for (const p of prior) {
 if (p.role && p.role !== record.role) return { ok: false, code: BLOCKER_CODES.INDEPENDENCE_GROUP_REUSED(group), reason: 'independence_group "' + group + '" used by role "' + p.role + '" and "' + record.role + '"; reuse must be role-scoped' };
 if (p.artifact_hash && record.artifact_hash && p.artifact_hash !== record.artifact_hash) return { ok: false, code: BLOCKER_CODES.INDEPENDENCE_GROUP_REUSED(group), reason: 'independence_group "' + group + '" reused with differing artifact_hash (prior=' + p.artifact_hash.slice(0,12) + ', new=' + record.artifact_hash.slice(0,12) + ')' };
 if (p.classification && p.classification !== record.classification) return { ok: false, code: BLOCKER_CODES.INDEPENDENCE_GROUP_REUSED(group), reason: 'independence_group "' + group + '" used with classification "' + p.classification + '" and "' + record.classification + '"' };
 }
 return { ok: true };
}

function trackExecutedIndependence(record, observedExecuted) {
 if (!record || record.classification !== 'EXECUTED') return observedExecuted;
 const group = record.independence_group;
 if (!group) return observedExecuted;
 const map = observedExecuted instanceof Map ? observedExecuted : new Map();
 const list = map.get(group) || [];
 list.push({ role: record.role, artifact_hash: record.artifact_hash, classification: record.classification, probe_id: record.probe_id });
 map.set(group, list);
 return map;
}

function checkLaunchPromotion(record) {
 const role = record && record.role ? record.role : 'unknown';
 const failures = [];
 if (record && record.verdict && FORBIDDEN_PROBE_VERDICTS.includes(record.verdict)) failures.push({ code: BLOCKER_CODES.LAUNCH_PROMOTION_ATTEMPTED(role), reason: 'verdict "' + record.verdict + '" is forbidden at probe layer' });
 for (const k of Object.keys(record || {})) {
 const lk = k.toLowerCase();
 if (/(?:^|_)launch(?:_|$)/.test(lk)) failures.push({ code: BLOCKER_CODES.LAUNCH_PROMOTION_ATTEMPTED(role), reason: 'field "' + k + '" smuggles launch verdict' });
 if (lk === 'go' || lk === 'go_signal' || lk === 'launch_go') failures.push({ code: BLOCKER_CODES.LAUNCH_PROMOTION_ATTEMPTED(role), reason: 'field "' + k + '" smuggles GO signal' });
 }
 return failures;
}

function checkStaleIdentity(sourceIdentity, role) {
 const failures = [];
 const si = sourceIdentity || {};
 for (const v of Object.values(si)) {
 if (typeof v === 'string' && isDeadIdentity(v)) failures.push({ code: BLOCKER_CODES.STALE_IDENTITY(role || 'unknown', v), reason: 'stale identity token "' + v + '" not allowed' });
 }
 return failures;
}

function validateRawStateWorksheet(rawState, role) {
 const failures = [];
 if (rawState === undefined || rawState === null) return failures;
 if (typeof rawState !== 'object' || Array.isArray(rawState)) { failures.push({ code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'raw_state must be an object' }); return failures; }
 if (rawState.weight !== undefined && rawState.weight !== null) {
 if (typeof rawState.weight !== 'number' || rawState.weight < 0 || rawState.weight > 1) failures.push({ code: BLOCKER_CODES.PROBE_CLASSIFICATION_INVALID(role, 'weight'), reason: 'raw_state.weight must be in [0,1]' });
 }
 if (rawState.numeric_mapping !== undefined && rawState.numeric_mapping !== null) {
 const nm = rawState.numeric_mapping;
 if (typeof nm !== 'object' || Array.isArray(nm) || nm === null) failures.push({ code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'numeric_mapping must be an object' });
 else for (const [k, v] of Object.entries(nm)) if (typeof v !== 'number' || v < 0 || v > 1) failures.push({ code: BLOCKER_CODES.PROBE_CLASSIFICATION_INVALID(role, 'numeric_mapping.' + k), reason: 'numeric_mapping.' + k + ' must be in [0,1]' });
 }
 return failures;
}

function cloneRedactionFlags() { return { ...REDACTION_FLAG_VALUES }; }

function cloneMutationAudit() { return allZeroMutationAudit(); }

function _nowIso() { return new Date('2026-07-19T12:00:00.000Z').toISOString(); }
// --- Builders ---
function _resolveExecutedSourceIdentity(input) {
 const entry = ROLE_BY_NAME[input.role];
 const provided = input.sourceIdentity;
 if (provided) {
 if (provided.kind === 'scratch_drill' && entry.drill_kind && provided.drill_kind && provided.drill_kind !== entry.drill_kind) return { ok: false, code: BLOCKER_CODES.SCHEMA_VALIDATION_FAILED('drill_kind'), reason: 'drill_kind mismatch (entry=' + entry.drill_kind + ' provided=' + provided.drill_kind + ')' };
 return { ok: true, sourceIdentity: provided };
 }
 if (entry.identity_kind === 'paperclip_api_readonly') return { ok: true, sourceIdentity: { kind: 'paperclip_api_readonly', company_kind: 'bos-light', auth_method: 'bearer_token_env' } };
 if (entry.identity_kind === 'scratch_drill') return { ok: true, sourceIdentity: { kind: 'scratch_drill', scratch_root: '/tmp/m016-s03-scratch/' + entry.drill_kind + '-001', drill_kind: entry.drill_kind } };
 if (entry.identity_kind === 'offline_bundle_read') return { ok: true, sourceIdentity: { kind: 'offline_bundle_read', bundle_ref: 'runtime-evidence/M016-S02-bos-mission-proof.json' } };
 return { ok: true, sourceIdentity: { kind: 'observed' } };
}

function buildExecutedRecord(input) {
 const opts = input || {};
 const role = opts.role;
 if (!isKnownRole(role)) { const err = new Error('role "' + role + '" not in registry'); err.code = BLOCKER_CODES.ROLE_UNKNOWN(String(role || 'unknown')); throw err; }
 const entry = ROLE_BY_NAME[role];
 const sourceIdentityRes = _resolveExecutedSourceIdentity({ role, sourceIdentity: opts.sourceIdentity });
 if (!sourceIdentityRes.ok) { const err = new Error(sourceIdentityRes.reason); err.code = sourceIdentityRes.code; throw err; }
 const sourceIdentity = sourceIdentityRes.sourceIdentity;
 const isDrill = sourceIdentity.kind === 'scratch_drill';
 const isolationInvariant = opts.isolationInvariant || (isDrill ? { read_only_boundary_pass: true, scratch_target_used: true, boundary_blocker_code: null } : { read_only_boundary_pass: true, scratch_target_used: false, boundary_blocker_code: null });
 const method = opts.method || (isDrill ? entry.drill_kind : 'GET /api/companies/{companyId}/agents');
 const command = opts.command || (isDrill ? 'node scripts/run_m016_s03_scratch_drills.js --drill ' + entry.drill_kind : 'GET https://paperclip.oysana.com/api/companies/{companyId}/agents');
 const artifactReference = opts.artifactReference || (isDrill ? 'runtime-evidence/M016-S03-scratch-drill-' + role.toLowerCase().replace(/\./g, '-') + '.json' : 'runtime-evidence/M016-S03-live-probe-' + role.toLowerCase().replace(/\./g, '-') + '.json');
 const generated = opts.generated || _nowIso();
 const startedAt = opts.startedAt || generated;
 const finishedAt = opts.finishedAt || new Date(Date.parse(generated) + 1000).toISOString();
 const durationMs = opts.durationMs != null ? opts.durationMs : 1000;
 const probeId = opts.probeId || computeProbeId({ role, classification: 'EXECUTED', kindToken: isDrill ? entry.drill_kind : 'probe', suffix: opts.suffix });
 const sanitisedDigest = opts.sanitisedDigest || (role + ':' + entry.methodology + ':no-mutation:objective').slice(0, 64);
 const artifactContent = opts.artifactContent != null ? opts.artifactContent : 'artifact:' + role;
 const artifactHash = opts.artifactHash || computeArtifactHash(artifactContent);
 const counters = opts.counters || cloneMutationAudit();
 const redaction = opts.redaction || cloneRedactionFlags();
 const verdict = opts.verdict || 'pass';
 const blockerCodes = opts.blockerCodes != null ? opts.blockerCodes : (verdict === 'fail_closed' ? [BLOCKER_CODES.LIMITATIONS_MISSING(role)] : []);
 return {
 schema_id: SCHEMA_ID, schema_version: SCHEMA_VERSION, milestone: MILESTONE, slice: SLICE,
 task: opts.task || 'T03', generated, probe_id: probeId,
 role_class: entry.role_class, role, classification: 'EXECUTED',
 independence_group: entry.independence_group,
 method, command, started_at: startedAt, finished_at: finishedAt, duration_ms: durationMs,
 scope: opts.scope || (isDrill ? 'scratch-drill-isolated' : 'live-readonly-no-mutation'),
 limitations: opts.limitations || ['target stale per memory evidence'],
 source_identity: sourceIdentity, isolation_invariant: isolationInvariant,
 mutation_audit: counters, redaction,
 exit_code: opts.exitCode != null ? opts.exitCode : 0,
 sanitised_digest: sanitisedDigest, artifact_reference: artifactReference, artifact_hash: artifactHash,
 verdict, blocker_codes: blockerCodes,
 };
}

function buildNotProvenRecord(input) {
 const opts = input || {};
 const role = opts.role;
 if (!isKnownRole(role)) { const err = new Error('role "' + role + '" not in registry'); err.code = BLOCKER_CODES.ROLE_UNKNOWN(String(role || 'unknown')); throw err; }
 const entry = ROLE_BY_NAME[role];
 let sourceIdentity = opts.sourceIdentity;
 if (!sourceIdentity) {
 if (entry.identity_kind === 'paperclip_api_readonly') sourceIdentity = { kind: 'paperclip_api_readonly', company_kind: 'bos-light', auth_method: 'bearer_token_env' };
 else if (entry.identity_kind === 'scratch_drill') sourceIdentity = { kind: 'scratch_drill', scratch_root: '/tmp/m016-s03-scratch/' + entry.drill_kind + '-001', drill_kind: entry.drill_kind };
 else if (entry.identity_kind === 'offline_bundle_read') sourceIdentity = { kind: 'offline_bundle_read', bundle_ref: 'runtime-evidence/M016-S02-bos-mission-proof.json' };
 else sourceIdentity = { kind: 'observed' };
 }
 const isDrill = sourceIdentity.kind === 'scratch_drill';
 const isolationInvariant = opts.isolationInvariant || (isDrill ? { read_only_boundary_pass: true, scratch_target_used: true, boundary_blocker_code: null } : { read_only_boundary_pass: true, scratch_target_used: false, boundary_blocker_code: null });
 const method = opts.method || (isDrill ? entry.drill_kind : 'GET /api/companies/{companyId}/agents');
 const command = opts.command || (isDrill ? 'node scripts/run_m016_s03_scratch_drills.js --drill ' + entry.drill_kind : 'GET https://paperclip.oysana.com/api/companies/{companyId}/agents');
 const generated = opts.generated || _nowIso();
 const startedAt = opts.startedAt || generated;
 const finishedAt = opts.finishedAt || new Date(Date.parse(generated) + 1000).toISOString();
 const durationMs = opts.durationMs != null ? opts.durationMs : 1000;
 const probeId = opts.probeId || computeProbeId({ role, classification: 'NOT_PROVEN', kindToken: isDrill ? entry.drill_kind : 'probe', suffix: opts.suffix || 'no-target' });
 const observedBlockerCode = opts.observedBlockerCode || BLOCKER_CODES.TARGET_UNAVAILABLE(role);
 const observedBlockerReason = opts.observedBlockerReason || 'target stale per memory evidence';
 return {
 schema_id: SCHEMA_ID, schema_version: SCHEMA_VERSION, milestone: MILESTONE, slice: SLICE,
 task: opts.task || 'T03', generated, probe_id: probeId,
 role_class: entry.role_class, role, classification: 'NOT_PROVEN',
 independence_group: entry.independence_group,
 method, command, started_at: startedAt, finished_at: finishedAt, duration_ms: durationMs,
 scope: opts.scope || (isDrill ? 'scratch-drill-isolated' : 'live-readonly-no-mutation'),
 limitations: opts.limitations || ['target stale per memory evidence'],
 source_identity: sourceIdentity, isolation_invariant: isolationInvariant,
 mutation_audit: cloneMutationAudit(), redaction: cloneRedactionFlags(),
 attempted_exit_code: opts.attemptedExitCode != null ? opts.attemptedExitCode : -1,
 observed_blocker_code: observedBlockerCode, observed_blocker_reason: observedBlockerReason,
 verdict: 'not_proven', blocker_codes: opts.blockerCodes || [observedBlockerCode],
 };
}
// --------------------------------------------------------------------------- Per-record validator ---------------------------------------------------------------------------
function validateProbeRecordShape(record, schemaValidate, options) {
 const opts = options || {};
 const observedExecuted = opts.observedExecuted instanceof Map ? opts.observedExecuted : null;
 if (record === undefined || record === null || typeof record !== 'object' || Array.isArray(record)) return { ok: false, code: BLOCKER_CODES.PROBE_RECORD_MALFORMED, reason: 'record missing or not object' };
 if (schemaValidate) {
 const schemaOk = schemaValidate(record);
 if (!schemaOk) {
 const errs = schemaValidate.errors || [];
 const first = errs[0] ? (errs[0].instancePath || '$') + ' ' + (errs[0].message || '') : 'schema violation';
 return { ok: false, code: BLOCKER_CODES.SCHEMA_VALIDATION_FAILED('ajv'), reason: 'schema violation: ' + first };
 }
 }
 let v;
 v = _validateTopShape(record); if (!v.ok) return v;
 v = _validateGenerated(record); if (!v.ok) return v;
 v = _validateProbeId(record); if (!v.ok) return v;
 v = _validateIndependenceGroup(record); if (!v.ok) return v;
 v = _validateMethod(record); if (!v.ok) return v;
 v = _validateCommand(record); if (!v.ok) return v;
 v = _validateScope(record); if (!v.ok) return v;
 v = _validateLimitations(record); if (!v.ok) return v;
 v = _validateSourceIdentity(record); if (!v.ok) return v;
 v = _validateIsolation(record); if (!v.ok) return v;
 v = _validateMutationAudit(record); if (!v.ok) return v;
 v = _validateRedaction(record); if (!v.ok) return v;
 v = _validateTimestamps(record); if (!v.ok) return v;
 v = _validateExitCode(record); if (!v.ok) return v;
 v = _validateVerdict(record); if (!v.ok) return v;
 v = _validateBranchIntegrity(record); if (!v.ok) return v;
 if (record.classification === 'EXECUTED') { v = _validateExecutedHashes(record); if (!v.ok) return v; }
 else if (record.classification === 'NOT_PROVEN') { v = _validateNotProvenFields(record); if (!v.ok) return v; }
 v = _validateBlockerCodes(record); if (!v.ok) return v;
 if (record.classification === 'EXECUTED') {
 const ireuse = checkIndependenceReuse(record, observedExecuted);
 if (!ireuse.ok) return ireuse;
 }
 const slFailures = checkStaleIdentity(record.source_identity, record.role);
 if (slFailures.length) return { ok: false, code: slFailures[0].code, reason: slFailures[0].reason };
 const lpFailures = checkLaunchPromotion(record);
 if (lpFailures.length) return { ok: false, code: lpFailures[0].code, reason: lpFailures[0].reason };
 if (opts.rawState !== undefined) {
 const rsFailures = validateRawStateWorksheet(opts.rawState, record.role);
 if (rsFailures.length) return { ok: false, code: rsFailures[0].code, reason: rsFailures[0].reason };
 }
 return { ok: true };
}
// --------------------------------------------------------------------------- Top-level orchestrator ---------------------------------------------------------------------------
function evaluateProbeContract(input) {
 const inData = input || {};
 const record = inData.record;
 const schemaProvided = inData.schema || (inData.schemaPath ? loadSchema(inData.schemaPath) : null);
 const schemaValidate = schemaProvided ? schemaProvided.validate : null;
 const observedExecuted = inData.observedExecuted instanceof Map ? inData.observedExecuted : new Map();
 const options = inData.options || {};
 if (record === undefined || record === null) {
 return {
 ok: false, verdict: 'fail_closed',
 blocker_codes: [BLOCKER_CODES.PROBE_RECORD_MALFORMED],
 gates: { HG1: 'fail_closed', HG2: 'fail_closed', HG7: 'fail_closed' },
 runner_status: EXIT_CODES.PROBE_RECORD_MALFORMED, reason: 'record missing',
 };
 }
 const validation = validateProbeRecordShape(record, schemaValidate, { observedExecuted, rawState: options.rawState });
 if (!validation.ok) {
 return {
 ok: false, verdict: 'fail_closed',
 blocker_codes: [typeof validation.code === 'function' ? validation.code(record.role || 'unknown') : validation.code],
 gates: Object.assign({}, Object.fromEntries(HARD_GATE_IDS.map((g) => [g, 'fail_closed']))),
 runner_status: EXIT_CODES.PROBE_RECORD_MALFORMED, reason: validation.reason,
 };
 }
 if (record.classification === 'EXECUTED') trackExecutedIndependence(record, observedExecuted);
 const verdict = record.verdict;
 const gates = {};
 for (const g of HARD_GATE_IDS) gates[g] = verdict === 'pass' ? 'pass' : (verdict === 'not_proven' ? 'not_proven' : 'fail_closed');
 return {
 ok: verdict === 'pass', verdict, blocker_codes: record.blocker_codes.slice(),
 gates, runner_status: EXIT_CODES.PROBE_RECORD_VALID,
 reason: verdict === 'pass' ? 'probe passed all gates' : verdict,
 observedExecuted,
 };
}

function buildProtocolEvidence(input) {
 const inData = input || {};
 const records = Array.isArray(inData.records) ? inData.records : [];
 const gates = inData.gates || {};
 const verdict = inData.verdict || 'not_proven';
 let totalExecuted = 0, totalNotProven = 0, totalFailClosed = 0;
 for (const r of records) {
 if (!r || typeof r !== 'object') continue;
 if (r.classification === 'EXECUTED') { totalExecuted++; if (r.verdict === 'fail_closed') totalFailClosed++; }
 else if (r.classification === 'NOT_PROVEN') totalNotProven++;
 }
 return {
 schema_id: SCHEMA_ID, schema_version: SCHEMA_VERSION, milestone: MILESTONE, slice: SLICE,
 task: inData.task || 'T03', generated: inData.generated || _nowIso(),
 line_class: inData.lineClass || 'M16-S03-LIVE',
 canonical_protocol: 'PROTOCOL-M16-S03-PROBE-V1',
 record_count: records.length, executed_count: totalExecuted, not_proven_count: totalNotProven, fail_closed_count: totalFailClosed,
 gates, verdict, replays_deterministic: true,
 protocol_digest: computeRecordDigest({ records: records.map(canonicalizeRecord) }),
 };
}

module.exports = {
 loadSchema, sanitizeString, checkRedactionSafety, assertProbeWriteSafe,
 canonicalizeRecord, computeRecordDigest, computeProbeId, computeArtifactHash,
 validateProbeRecordShape, evaluateProbeContract,
 buildExecutedRecord, buildNotProvenRecord, buildProtocolEvidence,
 checkIndependenceReuse, trackExecutedIndependence,
 checkLaunchPromotion, checkStaleIdentity, validateRawStateWorksheet,
 checkScratchContainment, cloneRedactionFlags, cloneMutationAudit,
};
