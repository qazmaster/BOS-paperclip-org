#!/usr/bin/env node
'use strict';

/**
 * scripts/test_m016_s03_safe_probe_contract.js
 *
 * M016-txa3vu / S03 / T02 — Test suite for the pure fail-closed probe contract.
 * Mirrors test_m016_s03_safe_probe_schema.js patterns. Covers:
 *   (a) Public surface stability — every exported helper ships
 *   (b) Schema loader — Ajv compiles the JSON Schema draft-07 declaration
 *   (c) Happy path — 16 roles × EXECUTED + 16 roles × NOT_PROVEN
 *   (d) Branch integrity — EXECUTED forbids NOT_PROVEN-only fields and vice versa
 *   (e) Method/command — POST/PUT/PATCH/DELETE/mutation verbs rejected
 *   (f) Field-shape — hash charset/length, exit_code/attempted_exit_code ranges,
 *       limitations empty/leak, scope newline/empty, duration_ms out of range,
 *       timestamp ordering violation
 *   (g) Identity-shape — unknown role, paperclip without auth_method, probe_id namespace
 *   (h) Path/scratch — artifact_reference traversal, symlink escape, forbidden scratch roots
 *   (i) Isolation — live probe + scratch_target_used=true rejected; drill + scratch_target_used=false
 *   (j) Redaction posture — full_ids=true, bounded_digests_only=false, missing flag rejected
 *   (k) Independence reuse — same group + different artifact_hash rejected
 *   (l) Launch promotion — verdict=GO, field named launch_verdict rejected
 *   (m) Stale identity — DEAD_COMPANY_UUIDS detection in source_identity
 *   (n) Raw state — weight/numeric_mapping out of [0,1] rejected
 *   (o) Builder determinism — buildExecutedRecord / buildNotProvenRecord for all 16 roles
 *   (p) Canonicalization / hash — computeProbeId stable; computeRecordDigest stable
 *   (q) Helpers — checkIndependenceReuse / trackExecutedIndependence / checkStaleIdentity /
 *       checkScratchContainment / checkLaunchPromotion
 *   (r) Orchestrator — evaluateProbeContract returns fail_closed on bad record,
 *       populates gates per HARD_GATE_IDS, does not promote to launch
 *   (s) Block codes — invalid pattern, duplicates, > 32 items rejected
 *   (t) Symlink escape — /tmp/../etc rejected via path.normalize
 *
 * All fixtures live in this file (no /tmp, no runtime-evidence pollution).
 * Run: node --test scripts/test_m016_s03_safe_probe_contract.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const data = require('./lib/m016-s03-safe-probe-data');
const contract = require('./lib/m016-s03-safe-probe-contract');

const {
  SCHEMA_ID, SCHEMA_VERSION, MILESTONE, SLICE, TASK_IDS,
  PROBE_ID_PREFIX, PROBE_BLOCKER_CODE_PATTERN,
  ROLE_REGISTRY, ROLE_BY_NAME, ROLES_SET, INDEPENDENCE_GROUPS_SET,
  PROBE_METHODS, PROHIBITED_METHODS, HARD_GATE_IDS,
  BLOCKER_CODES, BLOCKER_CODE_REGEX, REDACTION_FLAG_VALUES, MUTATION_AUDIT_ZERO_COUNTERS,
  allZeroMutationAudit, DEAD_COMPANY_UUIDS,
  VERDICT_VALUES, FORBIDDEN_PROBE_VERDICTS, EXIT_CODES, DEFAULTS,
  isKnownRole, getRoleEntry, getIndependenceGroup, isKnownGate,
} = data;

const {
  loadSchema, sanitizeString, checkRedactionSafety, assertProbeWriteSafe,
  canonicalizeRecord, computeRecordDigest, computeProbeId, computeArtifactHash,
  validateProbeRecordShape, evaluateProbeContract,
  buildExecutedRecord, buildNotProvenRecord, buildProtocolEvidence,
  checkIndependenceReuse, trackExecutedIndependence, checkLaunchPromotion,
  checkStaleIdentity, validateRawStateWorksheet, checkScratchContainment,
  cloneRedactionFlags, cloneMutationAudit,
} = contract;

// ---------------------------------------------------------------------------
// Schema loader (Ajv with optional fallback). Mirrors S02 schema test pattern.
// ---------------------------------------------------------------------------
function tryLoadValidator() {
  try {
    const Ajv = require('ajv');
    const addFormats = require('ajv-formats');
    const ajv = addFormats(new Ajv({ allErrors: true, strict: false }));
    const compiled = ajv.compile(JSON.parse(fs.readFileSync(path.join(__dirname, '..', DEFAULTS.schema_path), 'utf8')));
    return (data) => {
      const ok = compiled(data);
      return { ok: !!ok, errors: compiled.errors || [] };
    };
  } catch (e) {
    return null;
  }
}

const VALIDATE = tryLoadValidator();
const SCHEMA_OK = VALIDATE !== null;

// ---------------------------------------------------------------------------
// Fixture builders — every helper clones so test mutations do not bleed.
// ---------------------------------------------------------------------------
function sha256hex(seed) {
  const s = String(seed);
  return crypto.createHash('sha256').update(s).digest('hex');
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function makeExecutedRecord(role, overrides = {}) {
  const entry = ROLE_BY_NAME[role];
  assert.ok(entry, `unknown role ${role} for fixture`);
  const isDrill = entry.methodology === 'scratch-drill';
  const sourceIdentity = isDrill
    ? { kind: 'scratch_drill', scratch_root: '/tmp/m016-s03-scratch/' + entry.drill_kind + '-001', drill_kind: entry.drill_kind }
    : { kind: 'paperclip_api_readonly', company_kind: 'bos-light', auth_method: 'bearer_token_env' };
  const method = isDrill ? entry.drill_kind : 'GET /api/companies/{companyId}/agents';
  const command = isDrill
    ? 'node scripts/run_m016_s03_scratch_drills.js --drill ' + entry.drill_kind
    : 'GET https://paperclip.oysana.com/api/companies/{companyId}/agents';
  const artifactReference = isDrill
    ? 'runtime-evidence/M016-S03-scratch-drill-' + role.toLowerCase().replace(/\./g, '-') + '.json'
    : 'runtime-evidence/M016-S03-live-probe-' + role.toLowerCase().replace(/\./g, '-') + '.json';
  return clone(Object.assign({}, overrides, {
    schema_id: SCHEMA_ID,
    schema_version: SCHEMA_VERSION,
    milestone: MILESTONE,
    slice: SLICE,
    task: 'T02',
    generated: '2026-07-19T12:00:00Z',
    probe_id: PROBE_ID_PREFIX + role.toLowerCase().replace(/\./g, '-') + '-readonly-001',
    role_class: entry.role_class,
    role,
    classification: 'EXECUTED',
    independence_group: entry.independence_group,
    method,
    command,
    started_at: '2026-07-19T12:00:00Z',
    finished_at: '2026-07-19T12:00:01Z',
    duration_ms: 1000,
    scope: isDrill ? 'scratch-drill-isolated' : 'live-readonly-no-mutation',
    limitations: ['target stale per memory evidence'],
    source_identity: sourceIdentity,
    isolation_invariant: isDrill
      ? { read_only_boundary_pass: true, scratch_target_used: true, boundary_blocker_code: null }
      : { read_only_boundary_pass: true, scratch_target_used: false, boundary_blocker_code: null },
    mutation_audit: allZeroMutationAudit(),
    redaction: cloneRedactionFlags(),
    exit_code: 0,
    sanitised_digest: (role + ':no-mutation:objective').slice(0, 64),
    artifact_reference: artifactReference,
    artifact_hash: sha256hex(role + '-artifact'),
    verdict: 'pass',
    blocker_codes: [],
  }));
}

function makeNotProvenRecord(role, overrides = {}) {
  const entry = ROLE_BY_NAME[role];
  assert.ok(entry, `unknown role ${role} for fixture`);
  const isDrill = entry.methodology === 'scratch-drill';
  const sourceIdentity = isDrill
    ? { kind: 'scratch_drill', scratch_root: '/tmp/m016-s03-scratch/' + entry.drill_kind + '-001', drill_kind: entry.drill_kind }
    : { kind: 'paperclip_api_readonly', company_kind: 'bos-light', auth_method: 'bearer_token_env' };
  const method = isDrill ? entry.drill_kind : 'GET /api/companies/{companyId}/agents';
  const command = isDrill
    ? 'node scripts/run_m016_s03_scratch_drills.js --drill ' + entry.drill_kind
    : 'GET https://paperclip.oysana.com/api/companies/{companyId}/agents';
  return clone(Object.assign({}, overrides, {
    schema_id: SCHEMA_ID,
    schema_version: SCHEMA_VERSION,
    milestone: MILESTONE,
    slice: SLICE,
    task: 'T02',
    generated: '2026-07-19T12:00:00Z',
    probe_id: PROBE_ID_PREFIX + role.toLowerCase().replace(/\./g, '-') + '-no-target-001',
    role_class: entry.role_class,
    role,
    classification: 'NOT_PROVEN',
    independence_group: entry.independence_group,
    method,
    command,
    started_at: '2026-07-19T12:00:00Z',
    finished_at: '2026-07-19T12:00:01Z',
    duration_ms: 1000,
    scope: isDrill ? 'scratch-drill-isolated' : 'live-readonly-no-mutation',
    limitations: ['target stale per memory evidence'],
    source_identity: sourceIdentity,
    isolation_invariant: isDrill
      ? { read_only_boundary_pass: true, scratch_target_used: true, boundary_blocker_code: null }
      : { read_only_boundary_pass: true, scratch_target_used: false, boundary_blocker_code: null },
    mutation_audit: allZeroMutationAudit(),
    redaction: cloneRedactionFlags(),
    attempted_exit_code: -1,
    observed_blocker_code: BLOCKER_CODES.TARGET_UNAVAILABLE(role),
    observed_blocker_reason: 'target stale per memory evidence',
    verdict: 'not_proven',
    blocker_codes: [BLOCKER_CODES.TARGET_UNAVAILABLE(role)],
  }));
}

// ---------------------------------------------------------------------------
// (a) Public surface stability
// ---------------------------------------------------------------------------
test('public surface: 21 exports ship with canonical names', () => {
  const expected = [
    'loadSchema', 'sanitizeString', 'checkRedactionSafety', 'assertProbeWriteSafe',
    'canonicalizeRecord', 'computeRecordDigest', 'computeProbeId', 'computeArtifactHash',
    'validateProbeRecordShape', 'evaluateProbeContract',
    'buildExecutedRecord', 'buildNotProvenRecord', 'buildProtocolEvidence',
    'checkIndependenceReuse', 'trackExecutedIndependence',
    'checkLaunchPromotion', 'checkStaleIdentity', 'validateRawStateWorksheet',
    'checkScratchContainment', 'cloneRedactionFlags', 'cloneMutationAudit',
  ];
  for (const name of expected) assert.equal(typeof contract[name], 'function', `missing or non-function: ${name}`);
  assert.equal(Object.keys(contract).length, expected.length);
});

test('data module: 16 roles; 7 divisions + 9 infrastructure', () => {
  assert.equal(ROLE_REGISTRY.length, 16);
  const divisions = ROLE_REGISTRY.filter((r) => r.role_class === 'division');
  const infrastructure = ROLE_REGISTRY.filter((r) => r.role_class === 'infrastructure');
  assert.equal(divisions.length, 7);
  assert.equal(infrastructure.length, 9);
});

// ---------------------------------------------------------------------------
// (b) Schema loader
// ---------------------------------------------------------------------------
test('schema loader: Ajv compiles draft-07 schema successfully', () => {
  assert.equal(SCHEMA_OK, true, 'Ajv did not compile the probe schema');
  const exec = makeExecutedRecord('Div1.HCO');
  const r = VALIDATE(exec); assert.equal(r.ok, true, 'happy EXECUTED rejected by schema');
  const np = makeNotProvenRecord('Div1.HCO');
  const r2 = VALIDATE(np); assert.equal(r2.ok, true, 'happy NOT_PROVEN rejected by schema');
});

test('schema loader: returns bundle with schema, validate, path', () => {
  const bundle = loadSchema(DEFAULTS.schema_path);
  assert.equal(bundle.schema.$id, SCHEMA_ID);
  assert.equal(typeof bundle.path, 'string');
  assert.ok(bundle.path.endsWith('m016-s03-safe-probe.v1.json'));
});

// ---------------------------------------------------------------------------
// (c) Happy path — every role × EXECUTED + NOT_PROVEN through contract validator
// ---------------------------------------------------------------------------
test('happy EXECUTED: every role accepted by validateProbeRecordShape', () => {
  for (const role of ROLES_SET) {
    const exec = makeExecutedRecord(role);
    const r = validateProbeRecordShape(exec, VALIDATE);
    assert.equal(r.ok, true, `EXECUTED ${role} rejected: ${r.reason || (r.code && r.code(role))}`);
  }
});

test('happy NOT_PROVEN: every role accepted by validateProbeRecordShape', () => {
  for (const role of ROLES_SET) {
    const np = makeNotProvenRecord(role);
    const r = validateProbeRecordShape(np, VALIDATE);
    assert.equal(r.ok, true, `NOT_PROVEN ${role} rejected: ${r.reason || (r.code && r.code(role))}`);
  }
});

// ---------------------------------------------------------------------------
// (d) Branch integrity — cross-branch leakage rejected
// ---------------------------------------------------------------------------
test('branch integrity: EXECUTED forbids NOT_PROVEN-only fields (attempted_exit_code, observed_blocker_*)', () => {
  for (const field of ['attempted_exit_code', 'observed_blocker_code', 'observed_blocker_reason']) {
    const exec = makeExecutedRecord('Div1.HCO');
    if (field === 'attempted_exit_code') exec.attempted_exit_code = -1;
    else if (field === 'observed_blocker_code') exec.observed_blocker_code = BLOCKER_CODES.TARGET_UNAVAILABLE('Div1.HCO');
    else exec.observed_blocker_reason = 'leakage';
    const r = validateProbeRecordShape(exec, VALIDATE);
    assert.equal(r.ok, false, `EXECUTED with ${field} should be rejected`);
    assert.ok(/NOT_PROVEN-only|EXECUTED/.test(r.reason), `wrong reason: ${r.reason}`);
  }
});

test('branch integrity: NOT_PROVEN forbids EXECUTED-only fields (exit_code, sanitised_digest, artifact_*)', () => {
  for (const field of ['exit_code', 'sanitised_digest', 'artifact_reference', 'artifact_hash']) {
    const np = makeNotProvenRecord('Div1.HCO');
    if (field === 'exit_code') np.exit_code = 0;
    else if (field === 'sanitised_digest') np.sanitised_digest = 'obj:probe';
    else if (field === 'artifact_reference') np.artifact_reference = 'runtime-evidence/M016-S03-x.json';
    else np.artifact_hash = sha256hex('leak');
    const r = validateProbeRecordShape(np, VALIDATE);
    assert.equal(r.ok, false, `NOT_PROVEN with ${field} should be rejected`);
  }
});

test('branch integrity: PASS-like NOT_PROVEN rejected (verdict=pass on NOT_PROVEN)', () => {
  const np = makeNotProvenRecord('Div1.HCO');
  np.verdict = 'pass';
  const r = validateProbeRecordShape(np, VALIDATE);
  assert.equal(r.ok, false);
  assert.ok(/NOT_PROVEN|fail_closed/i.test(r.reason));
});

// ---------------------------------------------------------------------------
// (e) Method / command blockers
// ---------------------------------------------------------------------------
test('method: POST/PUT/PATCH/DELETE leading method rejected', () => {
  for (const verb of ['POST', 'PUT', 'PATCH', 'DELETE', 'DESTROY']) {
    const exec = makeExecutedRecord('Div1.HCO');
    exec.method = verb + ' /api/companies/{companyId}';
    exec.command = 'curl -X ' + verb + ' /api/companies/{companyId}';
    const r = validateProbeRecordShape(exec, VALIDATE);
    assert.equal(r.ok, false, `${verb} should be rejected`);
    assert.ok(/mutation|prohibited|allowlist/i.test(r.reason), `${verb} wrong reason: ${r.reason}`);
  }
});

test('method: not in GET-only allowlist rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  exec.method = 'GET /not-an-api/foo bar';
  const r = validateProbeRecordShape(exec, VALIDATE);
  assert.equal(r.ok, false);
  assert.ok(/method|allowlist/i.test(r.reason));
});

test('command: credential/UUID/vendor/raw markers rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  exec.command = 'GET https://x.test/api/x?token=sk-abcdefghijklmnop123456';
  const r = validateProbeRecordShape(exec, VALIDATE);
  assert.equal(r.ok, false, 'sk- token should be rejected');
  assert.ok(/credential|charset|leak/i.test(r.reason));
});

// ---------------------------------------------------------------------------
// (f) Field-shape blockers
// ---------------------------------------------------------------------------
test('hash: uppercase rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  exec.artifact_hash = exec.artifact_hash.toUpperCase();
  const r = validateProbeRecordShape(exec, VALIDATE);
  assert.equal(r.ok, false); assert.ok(/hash|hex/i.test(r.reason));
});

test('hash: short hex rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  exec.artifact_hash = 'abc123';
  const r = validateProbeRecordShape(exec, VALIDATE);
  assert.equal(r.ok, false);
});

test('exit_code: out of range (-2, 256) rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  exec.exit_code = -2;
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
  const exec2 = makeExecutedRecord('Div1.HCO'); exec2.exit_code = 256;
  const r2 = validateProbeRecordShape(exec2, VALIDATE); assert.equal(r2.ok, false);
});

test('attempted_exit_code: HTTP 600+ rejected (NOT_PROVEN)', () => {
  const np = makeNotProvenRecord('Div1.HCO'); np.attempted_exit_code = 600;
  const r = validateProbeRecordShape(np, VALIDATE); assert.equal(r.ok, false);
});

test('limitations: empty list rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO'); exec.limitations = [];
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

test('limitations: 17 entries rejected (> 16 max)', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  exec.limitations = Array.from({ length: 17 }, (_, i) => 'limitation ' + i);
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

test('limitations: credential leak in item rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  exec.limitations = ['token=sk-abcdefghijklmnop123456'];
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

test('scope: empty rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO'); exec.scope = '';
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

test('scope: too long (> 200) rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO'); exec.scope = 'x'.repeat(201);
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

test('duration_ms: negative rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO'); exec.duration_ms = -1;
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

test('duration_ms: > 10min rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO'); exec.duration_ms = 600001;
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

test('timestamp: finished_at < started_at rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  exec.started_at = '2026-07-19T12:00:01Z';
  exec.finished_at = '2026-07-19T12:00:00Z';
  exec.duration_ms = -1000; // wall-clock negative — also rejected
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

test('timestamp: duration undercounts wall-clock by > 5s rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  exec.started_at = '2026-07-19T12:00:00Z';
  exec.finished_at = '2026-07-19T12:00:30Z';
  exec.duration_ms = 100; // wall = 30000 ms; undercounts by > 5s
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

test('timestamp: generated not ISO-8601 rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO'); exec.generated = 'not-a-date';
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

// ---------------------------------------------------------------------------
// (g) Identity-shape blockers
// ---------------------------------------------------------------------------
test('role: unknown role rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO'); exec.role = 'Div999.NotARealOne';
  exec.role_class = 'division';
  exec.independence_group = 'm016-s03-probe-div999-notarealone';
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

test('role_class: mismatch with registry rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO'); exec.role_class = 'infrastructure';
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

test('paperclip source_identity: company_kind missing rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  exec.source_identity = { kind: 'paperclip_api_readonly', auth_method: 'bearer_token_env' };
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

test('paperclip source_identity: auth_method missing rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  exec.source_identity = { kind: 'paperclip_api_readonly', company_kind: 'bos-light' };
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

test('scratch_drill source_identity: drill_kind unknown rejected', () => {
  const exec = makeExecutedRecord('restore_drill');
  exec.source_identity.drill_kind = 'not-a-drill';
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

test('probe_id: namespace prefix missing rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO'); exec.probe_id = 'bos-light-evil-no-prefix';
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

test('probe_id: too short rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO'); exec.probe_id = 'M16-S03-x';
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

test('task: not in T01..T06 rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO'); exec.task = 'T99';
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

// ---------------------------------------------------------------------------
// (h) Path / scratch containment
// ---------------------------------------------------------------------------
test('path: artifact_reference traversal rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  exec.artifact_reference = 'runtime-evidence/../../../etc/passwd';
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false); assert.ok(/traversal|artifact/i.test(r.reason));
});

test('path: artifact_reference outside runtime-evidence/ or scripts/ rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  exec.artifact_reference = 'tmp/evil.json';
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

test('symlink escape: /tmp/../etc normalized rejected', () => {
  const exec = makeExecutedRecord('restore_drill');
  exec.source_identity.scratch_root = '/tmp/../etc/passwd';
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false); assert.ok(/scratch|traversal|escape/i.test(r.reason));
});

test('scratch_root: forbidden root /root, /etc, /usr rejected', () => {
  const exec = makeExecutedRecord('restore_drill');
  exec.source_identity.scratch_root = '/root/evil';
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

test('scratch_root: macOS /private/tmp/.. allowed (positive)', () => {
  const exec = makeExecutedRecord('restore_drill');
  exec.source_identity.scratch_root = '/private/tmp/m016-s03-scratch/restore-drill-001';
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, true, r.reason);
});

test('scratch_root: linux /run/m016-s03/... allowed (positive)', () => {
  const exec = makeExecutedRecord('restore_drill');
  exec.source_identity.scratch_root = '/run/m016-s03/restore-drill-001';
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, true, r.reason);
});

test('checkScratchContainment: rejects non-string, non-absolute, traversal', () => {
  assert.equal(checkScratchContainment(123).ok, false);
  assert.equal(checkScratchContainment('relative/path').ok, false);
  assert.equal(checkScratchContainment('/etc/passwd').ok, false);
  assert.equal(checkScratchContainment('/tmp/../etc/passwd').ok, false);
  assert.equal(checkScratchContainment('/tmp/m016-s03-scratch/x').ok, true);
});

// ---------------------------------------------------------------------------
// (i) Isolation invariant mismatches
// ---------------------------------------------------------------------------
test('isolation: live probe + scratch_target_used=true rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  exec.isolation_invariant.scratch_target_used = true;
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

test('isolation: drill + scratch_target_used=false rejected', () => {
  const exec = makeExecutedRecord('restore_drill');
  exec.isolation_invariant.scratch_target_used = false;
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

test('isolation: read_only_boundary_pass=false requires boundary_blocker_code', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  exec.isolation_invariant.read_only_boundary_pass = false;
  exec.isolation_invariant.boundary_blocker_code = null;
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

// ---------------------------------------------------------------------------
// (j) Redaction posture deviation
// ---------------------------------------------------------------------------
test('redaction: full_ids=true rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO'); exec.redaction.full_ids = true;
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

test('redaction: bounded_digests_only=false rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO'); exec.redaction.bounded_digests_only = false;
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

test('redaction: missing flag rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO'); delete exec.redaction.full_ids;
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

test('redaction: unknown flag rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO'); exec.redaction.unknown_flag = true;
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

// ---------------------------------------------------------------------------
// (k) Independence group reuse
// ---------------------------------------------------------------------------
test('independence: same group with different artifact_hash rejected (cross-record)', () => {
  const map = new Map();
  const first = makeExecutedRecord('Div1.HCO');
  trackExecutedIndependence(first, map);
  const second = makeExecutedRecord('Div1.HCO');
  second.artifact_hash = sha256hex('divergent-content');
  // Same role + same group, different artifact_hash => reject
  const r = checkIndependenceReuse(second, map);
  assert.equal(r.ok, false);
  assert.ok(/differing artifact_hash|reuse/i.test(r.reason));
});

test('independence: same group, different role, rejected (cross-record)', () => {
  const map = new Map();
  const first = makeExecutedRecord('Div1.HCO');
  trackExecutedIndependence(first, map);
  // Build a SECOND EXECUTED but with Div1.HCO registry (force same independence_group via role mapping).
  // Since independence_group is role-bound, true cross-role violation requires direct registry usage.
  const second = makeExecutedRecord('Div1.HCO');
  // Manually fabricate a role/group drift to detect what the contract enforces.
  second.role = 'Div2.MasterPlanner';
  second.role_class = 'division';
  second.independence_group = getIndependenceGroup('Div1.HCO'); // forces collision
  const r = checkIndependenceReuse(second, map);
  assert.equal(r.ok, false);
  assert.ok(/role|reuse/i.test(r.reason));
});

test('independence: NOT_PROVEN records bypass reuse check (per design)', () => {
  const map = new Map();
  const exec = makeExecutedRecord('Div1.HCO');
  trackExecutedIndependence(exec, map);
  const np = makeNotProvenRecord('Div1.HCO');
  // NOT_PROVEN shares independence_group with EXECUTED but reuse check applies only to EXECUTED pairings.
  const r = checkIndependenceReuse(np, map);
  assert.equal(r.ok, true);
  assert.equal(r.code, undefined, 'checkIndependenceReuse should not emit blocker for NOT_PROVEN');
});

test('trackExecutedIndependence: accumulates per-group entries with role + hash + classification', () => {
  const map = new Map();
  const first = makeExecutedRecord('Div1.HCO');
  trackExecutedIndependence(first, map);
  assert.equal(map.size, 1);
  const group = first.independence_group;
  assert.equal(map.get(group).length, 1);
  assert.equal(map.get(group)[0].role, 'Div1.HCO');
  assert.equal(map.get(group)[0].artifact_hash, first.artifact_hash);
});

// ---------------------------------------------------------------------------
// (l) Launch promotion detection
// ---------------------------------------------------------------------------
test('launch promotion: verdict=GO rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  exec.verdict = 'GO';
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
  assert.ok(/launch|forbidden/i.test(r.reason));
});

test('launch promotion: field launch_verdict present rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  exec.launch_verdict = 'GO';
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

test('launch promotion: field GO present rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  exec.GO = true;
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

test('launch promotion: FORBIDDEN_PROBE_VERDICTS contains GO, PASS_AUTOMATIC, READY', () => {
  for (const v of ['GO', 'PASS_AUTOMATIC', 'READY']) assert.ok(FORBIDDEN_PROBE_VERDICTS.includes(v));
});

test('checkLaunchPromotion: empty failures for clean record', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  assert.equal(checkLaunchPromotion(exec).length, 0);
});

test('checkLaunchPromotion: returns blockers for launch signals', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  exec.launch_go = true;
  const fails = checkLaunchPromotion(exec);
  assert.ok(fails.length >= 1);
});

// ---------------------------------------------------------------------------
// (m) Stale identity
// ---------------------------------------------------------------------------
test('stale identity: dead UUID in company_kind rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  exec.source_identity.company_kind = DEAD_COMPANY_UUIDS[0];
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
  assert.ok(/stale/i.test(r.reason));
});

test('stale identity: dead marker in scratch_root (drill) rejected', () => {
  const exec = makeExecutedRecord('restore_drill');
  exec.source_identity.scratch_root = '/tmp/m016-s03-scratch/' + DEAD_COMPANY_UUIDS[0] + '-001';
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

test('stale identity: aipay.kz token rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  exec.source_identity.company_kind = 'aipay.kz';
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

test('checkStaleIdentity: empty failures for safe source_identity', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  assert.equal(checkStaleIdentity(exec.source_identity, exec.role).length, 0);
});

// ---------------------------------------------------------------------------
// (n) Raw state / worksheet validation
// ---------------------------------------------------------------------------
test('rawState: weight out of [0,1] rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  const r1 = validateProbeRecordShape(exec, VALIDATE, { rawState: { weight: 1.5 } });
  assert.equal(r1.ok, false);
  const r2 = validateProbeRecordShape(exec, VALIDATE, { rawState: { weight: -0.1 } });
  assert.equal(r2.ok, false);
});

test('rawState: numeric_mapping value out of [0,1] rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  const r = validateProbeRecordShape(exec, VALIDATE, { rawState: { numeric_mapping: { x: 2.0 } } });
  assert.equal(r.ok, false);
});

test('rawState: missing rawState is allowed', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  const r = validateProbeRecordShape(exec, VALIDATE);
  assert.equal(r.ok, true);
});

test('validateRawStateWorksheet: non-object rawState rejected', () => {
  assert.ok(validateRawStateWorksheet('not-object', 'Div1.HCO').length > 0);
  assert.ok(validateRawStateWorksheet([1, 2], 'Div1.HCO').length > 0);
});

test('validateRawStateWorksheet: null/undefined is allowed', () => {
  assert.equal(validateRawStateWorksheet(undefined, 'Div1.HCO').length, 0);
  assert.equal(validateRawStateWorksheet(null, 'Div1.HCO').length, 0);
});

// ---------------------------------------------------------------------------
// (o) Builder determinism — every role × builder accepts known role, schema-valid record
// ---------------------------------------------------------------------------
test('builder: buildExecutedRecord produces schema-valid record for every role', () => {
  for (const role of ROLES_SET) {
    const exec = buildExecutedRecord({ role, task: 'T02' });
    if (VALIDATE) { const r = VALIDATE(exec); assert.equal(r.ok, true, `buildExecutedRecord(${role}) failed schema: ${JSON.stringify(r.errors)}`); }
    assert.equal(exec.classification, 'EXECUTED');
    assert.equal(exec.role, role);
  }
});

test('builder: buildNotProvenRecord produces schema-valid record for every role', () => {
  for (const role of ROLES_SET) {
    const np = buildNotProvenRecord({ role, task: 'T02' });
    if (VALIDATE) { const r = VALIDATE(np); assert.equal(r.ok, true, `buildNotProvenRecord(${role}) failed schema`); }
    assert.equal(np.classification, 'NOT_PROVEN');
    assert.equal(np.verdict, 'not_proven');
  }
});

test('builder: unknown role throws with role_unknown blocker', () => {
  let err;
  try { buildExecutedRecord({ role: 'Div999.NotReal' }); } catch (e) { err = e; }
  assert.ok(err); assert.equal(err.code, BLOCKER_CODES.ROLE_UNKNOWN('Div999.NotReal'));
});

test('builder: drill_kind mismatch in source_identity throws', () => {
  let err;
  try {
    buildExecutedRecord({
      role: 'restore_drill',
      sourceIdentity: { kind: 'scratch_drill', scratch_root: '/tmp/m016-s03-scratch/restore-drill-001', drill_kind: 'failure-drill' },
    });
  } catch (e) { err = e; }
  assert.ok(err); assert.ok(/drill_kind mismatch/.test(err.message));
});

test('builders: do not call fs.writeFileSync / fs.createWriteStream (write evidence surface)', () => {
  // Builders are pure inputs->object factories; verify no write-surface fs calls are reachable from builder bodies.
  const src = fs.readFileSync(path.join(__dirname, 'lib', 'm016-s03-safe-probe-contract.js'), 'utf8');
  // Look only inside the body of buildExecutedRecord (between its `function buildExecutedRecord` line and the next `^function|^module.exports`).
  const startEx = src.indexOf('function buildExecutedRecord(input)');
  const startNp = src.indexOf('function buildNotProvenRecord(input)');
  const endEx = startNp > 0 ? startNp : src.length;
  const afterEx = src.indexOf('\nfunction ', startEx + 10);
  const afterNp = src.indexOf('\nfunction ', startNp + 10);
  const exBody = src.slice(startEx, endEx);
  const npBody = src.slice(startNp, afterNp > 0 ? afterNp : src.length);
  assert.ok(!/fs\.write|fs\.create/.test(exBody), 'buildExecutedRecord body references write-surface fs call');
  assert.ok(!/fs\.write|fs\.create/.test(npBody), 'buildNotProvenRecord body references write-surface fs call');
});

// ---------------------------------------------------------------------------
// (p) Canonicalization / hashing — determinism
// ---------------------------------------------------------------------------
test('computeProbeId: same input -> same output (deterministic)', () => {
  const id1 = computeProbeId({ role: 'Div1.HCO', classification: 'EXECUTED', suffix: 'noop' });
  const id2 = computeProbeId({ role: 'Div1.HCO', classification: 'EXECUTED', suffix: 'noop' });
  assert.equal(id1, id2);
  assert.ok(PROBE_ID_PREFIX && id1.startsWith(PROBE_ID_PREFIX));
  assert.ok(BLOCKER_CODE_REGEX.test(id1));
});

test('computeProbeId: differs by role/suffix/seed', () => {
  const a = computeProbeId({ role: 'Div1.HCO', classification: 'EXECUTED', suffix: 'a' });
  const b = computeProbeId({ role: 'Div2.MasterPlanner', classification: 'EXECUTED', suffix: 'a' });
  const c = computeProbeId({ role: 'Div1.HCO', classification: 'EXECUTED', suffix: 'b' });
  const d = computeProbeId({ role: 'Div1.HCO', classification: 'NOT_PROVEN', suffix: 'a' });
  const e = computeProbeId({ role: 'Div1.HCO', classification: 'EXECUTED', suffix: 'a', seed: 'T02' });
  assert.notEqual(a, b); assert.notEqual(a, c); assert.notEqual(a, d); assert.notEqual(a, e);
});

test('computeProbeId: dynamic suffix with bad chars is sanitised into namespace', () => {
  const id = computeProbeId({ role: 'Div1.HCO', classification: 'EXECUTED', suffix: 'POST /api/agents' });
  assert.ok(BLOCKER_CODE_REGEX.test(id), 'id should match namespace after sanitization: ' + id);
});

test('computeProbeId: unknown role returns null', () => {
  assert.equal(computeProbeId({ role: 'Div999.NotReal', suffix: 'x' }), null);
});

test('computeArtifactHash: same input -> same output, sha256 64 hex', () => {
  const h1 = computeArtifactHash('hello');
  const h2 = computeArtifactHash('hello');
  assert.equal(h1, h2);
  assert.ok(/^[a-f0-9]{64}$/.test(h1));
});

test('computeArtifactHash: accepts Buffer', () => {
  const h1 = computeArtifactHash(Buffer.from('abc'));
  const h2 = computeArtifactHash(Buffer.from('abc'));
  assert.equal(h1, h2);
});

test('canonicalizeRecord: same record + same canonical form, regardless of key order', () => {
  const exec1 = makeExecutedRecord('Div1.HCO');
  const exec2 = makeExecutedRecord('Div1.HCO');
  // Shuffle exec2's top-level keys
  const keys = Object.keys(exec2); const shuffled = {};
  for (let i = keys.length - 1; i > 0; i--) { const j = Math.floor((i + 1) * 0.5); [keys[i], keys[j]] = [keys[j], keys[i]]; }
  for (const k of keys) shuffled[k] = exec2[k];
  assert.equal(canonicalizeRecord(exec1), canonicalizeRecord(shuffled));
});

test('computeRecordDigest: deterministic for same content, different for mutated', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  const d1 = computeRecordDigest(exec);
  const exec2 = makeExecutedRecord('Div1.HCO'); exec2.duration_ms = 2000;
  const d2 = computeRecordDigest(exec2);
  assert.notEqual(d1, d2);
});

// ---------------------------------------------------------------------------
// (q) Helpers — checkStaleIdentity / checkIndependenceReuse / checkScratchContainment
// ---------------------------------------------------------------------------
test('checkStaleIdentity: returns failure for DEAD_COMPANY_UUIDS hit', () => {
  const si = { kind: 'paperclip_api_readonly', company_kind: DEAD_COMPANY_UUIDS[0], auth_method: 'bearer_token_env' };
  const fails = checkStaleIdentity(si, 'Div1.HCO');
  assert.ok(fails.length >= 1, 'expected at least one failure');
});

test('checkIndependenceReuse: same group, same role, same hash, returns ok=true', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  const map = new Map([[exec.independence_group, [{ role: exec.role, artifact_hash: exec.artifact_hash, classification: 'EXECUTED' }]]]);
  const r = checkIndependenceReuse(exec, map);
  assert.equal(r.ok, true);
});

test('checkIndependenceReuse: same group, same role, different hash, returns ok=false', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  const map = new Map([[exec.independence_group, [{ role: exec.role, artifact_hash: sha256hex('other'), classification: 'EXECUTED' }]]]);
  const r = checkIndependenceReuse(exec, map);
  assert.equal(r.ok, false);
  assert.ok(/differing artifact_hash/.test(r.reason));
});

// ---------------------------------------------------------------------------
// (r) Orchestrator
// ---------------------------------------------------------------------------
test('orchestrator: record missing returns fail_closed with PROBE_RECORD_MALFORMED blocker', () => {
  const out = evaluateProbeContract({ record: null, schema: { validate: VALIDATE } });
  assert.equal(out.ok, false); assert.equal(out.verdict, 'fail_closed');
  assert.ok(out.blocker_codes.includes(BLOCKER_CODES.PROBE_RECORD_MALFORMED), 'blocker missing: ' + JSON.stringify(out.blocker_codes));
  assert.equal(out.runner_status, EXIT_CODES.PROBE_RECORD_MALFORMED);
});

test('orchestrator: bad record (unknown role) returns fail_closed', () => {
  const exec = makeExecutedRecord('Div1.HCO'); exec.role = 'Evil.Role';
  const out = evaluateProbeContract({ record: exec, schema: { validate: VALIDATE } });
  assert.equal(out.ok, false); assert.equal(out.verdict, 'fail_closed');
  assert.ok(out.reason && /role/.test(out.reason), 'reason: ' + out.reason);
});

test('orchestrator: happy EXECUTED returns pass, populates 8 gates, runner_status=0', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  const out = evaluateProbeContract({ record: exec, schema: { validate: VALIDATE } });
  assert.equal(out.ok, true); assert.equal(out.verdict, 'pass');
  assert.equal(out.runner_status, EXIT_CODES.PROBE_RECORD_VALID);
  for (const g of HARD_GATE_IDS) assert.ok(out.gates[g], 'gate ' + g + ' missing from orchestrator output: ' + JSON.stringify(out.gates));
});

test('orchestrator: NOT_PROVEN record returns not_proven verdict, runner_status=0', () => {
  const np = makeNotProvenRecord('Div1.HCO');
  const out = evaluateProbeContract({ record: np, schema: { validate: VALIDATE } });
  assert.equal(out.verdict, 'not_proven');
  assert.equal(out.runner_status, EXIT_CODES.PROBE_RECORD_VALID);
});

test('orchestrator: passes verdict through and never emits launch verdict', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  exec.verdict = 'GO';
  const out = evaluateProbeContract({ record: exec, schema: { validate: VALIDATE } });
  // Should be fail_closed because launcher verdict is forbidden.
  assert.equal(out.verdict, 'fail_closed');
  assert.ok(!forbiddenVerdictEmitted(out), 'orchestrator must never emit forbidden verdict');
});

function forbiddenVerdictEmitted(out) {
  return FORBIDDEN_PROBE_VERDICTS.includes(out.verdict) || (out.gates && Object.values(out.gates).some((v) => FORBIDDEN_PROBE_VERDICTS.includes(v)));
}

test('buildProtocolEvidence: counts executed / not_proven / fail_closed correctly', () => {
  const records = [
    makeExecutedRecord('Div1.HCO'),
    makeExecutedRecord('Div2.MasterPlanner'),
    makeNotProvenRecord('Div3.Treasury'),
  ];
  const failRec = makeExecutedRecord('Div4.Production');
  failRec.verdict = 'fail_closed';
  failRec.blocker_codes = [BLOCKER_CODES.LIMITATIONS_MISSING('Div4.Production')];
  records.push(failRec);
  const ev = buildProtocolEvidence({ records, gates: { HG1: 'pass' }, verdict: 'not_proven', task: 'T03' });
  assert.equal(ev.record_count, 4);
  assert.equal(ev.executed_count, 3);
  assert.equal(ev.not_proven_count, 1);
  assert.equal(ev.fail_closed_count, 1);
  assert.ok(ev.protocol_digest && /^[a-f0-9]{64}$/.test(ev.protocol_digest));
});

// ---------------------------------------------------------------------------
// (s) Block codes — invalid pattern, duplicates, > 32 items rejected
// ---------------------------------------------------------------------------
test('blocker_codes: invalid pattern rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  exec.verdict = 'fail_closed'; exec.blocker_codes = ['not-a-blocker-code'];
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

test('blocker_codes: > 32 items rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  exec.verdict = 'fail_closed';
  exec.blocker_codes = Array.from({ length: 33 }, (_, i) => BLOCKER_CODES.LIMITATIONS_MISSING('Div' + i));
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

test('blocker_codes: EXECUTED pass with non-empty block codes rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  exec.verdict = 'pass'; exec.blocker_codes = [BLOCKER_CODES.LIMITATIONS_MISSING('Div1.HCO')];
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

test('blocker_codes: NOT_PROVEN excludes observed_blocker_code rejected', () => {
  const np = makeNotProvenRecord('Div1.HCO');
  np.blocker_codes = []; // drop observed
  const r = validateProbeRecordShape(np, VALIDATE); assert.equal(r.ok, false);
});

// ---------------------------------------------------------------------------
// (t) Symlink escape via path.normalize — runtime contract cross-checks
// ---------------------------------------------------------------------------
test('path: artifact_reference normalizes with .. rejected (after pattern match)', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  exec.artifact_reference = 'runtime-evidence/foo/../../bar/baz.json';
  // path.posix.normalize will reduce to ../bar/baz.json which contains ..
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false); assert.ok(/traversal|escape/i.test(r.reason));
});

test('path: artifact_reference starting with / rejected', () => {
  const exec = makeExecutedRecord('Div1.HCO');
  exec.artifact_reference = '/runtime-evidence/foo.json';
  const r = validateProbeRecordShape(exec, VALIDATE); assert.equal(r.ok, false);
});

// ---------------------------------------------------------------------------
// (u) Sanitisation — delegated helpers
// ---------------------------------------------------------------------------
test('sanitizeString: redacts UUIDs, credentials, bearer/sk-/tp- tokens', () => {
  assert.ok(!/[0-9a-f]{8}-/.test(sanitizeString('uuid 9feb4c22-05b9-401e-ba67-0e866e3056da is here')));
  assert.ok(/<redacted>/.test(sanitizeString('bearer abcdef-token-1234567890')));
  assert.ok(/<redacted>/.test(sanitizeString('sk-abcdefghijklmnop123456')));
  assert.ok(/<redacted>/.test(sanitizeString('tp-abcdefghijklmnop123456')));
});

test('checkRedactionSafety: returns hits per redaction kind', () => {
  const record = makeExecutedRecord('Div1.HCO');
  record.limitations = ['token sk-abcdefghijklmnop123456'];
  const hits = checkRedactionSafety(record);
  assert.ok(hits.length >= 1, 'expected at least one hit');
});

test('assertProbeWriteSafe: throws if record carries raw markers', () => {
  const rec = makeExecutedRecord('Div1.HCO');
  rec.limitations = ['token sk-abcdefghijklmnop123456'];
  let err;
  try { assertProbeWriteSafe(rec); } catch (e) { err = e; }
  assert.ok(err, 'expected throw'); assert.ok(err.hits && err.hits.length >= 1);
});

test('assertProbeWriteSafe: passes for clean record', () => {
  const rec = makeExecutedRecord('Div1.HCO');
  assert.doesNotThrow(() => assertProbeWriteSafe(rec));
});

// ---------------------------------------------------------------------------
// (v) Sanity: registry contract and helpers
// ---------------------------------------------------------------------------
test('ROLE_REGISTRY: every role has independence_group, gate, methodology, identity_kind, role_class', () => {
  for (const entry of ROLE_REGISTRY) {
    for (const k of ['role', 'role_class', 'independence_group', 'gate', 'methodology', 'identity_kind', 'target_kind']) {
      assert.ok(entry[k], `role ${entry.role} missing field ${k}`);
    }
    assert.ok(['division', 'infrastructure'].includes(entry.role_class));
  }
});

test('ROLE_REGISTRY: every independence_group is unique', () => {
  const seen = new Set();
  for (const entry of ROLE_REGISTRY) {
    assert.equal(seen.has(entry.independence_group), false, 'dup independence_group ' + entry.independence_group);
    seen.add(entry.independence_group);
  }
});

test('isKnownRole: validates against registry', () => {
  assert.equal(isKnownRole('Div1.HCO'), true);
  assert.equal(isKnownRole('Evil.Role'), false);
});

test('isKnownGate: validates against HG list', () => {
  assert.equal(isKnownGate('HG1 SEMANTIC_RULE_COMPLIANCE'), true);
  assert.equal(isKnownGate('HG99'), false);
});

test('getIndependenceGroup: returns kebab from registry', () => {
  assert.equal(getIndependenceGroup('Div1.HCO'), 'm016-s03-probe-div1-hco');
  assert.equal(getIndependenceGroup('Evil.Role'), null);
});

test('cloneRedactionFlags / cloneMutationAudit return the canonical shapes', () => {
  const rd = cloneRedactionFlags();
  for (const [k, v] of Object.entries(REDACTION_FLAG_VALUES)) assert.equal(rd[k], v);
  const ma = cloneMutationAudit();
  for (const k of MUTATION_AUDIT_ZERO_COUNTERS) assert.equal(ma[k], 0);
});

test('dependency: contract wraps S02 sanitizeString (functional parity)', () => {
  const s02 = require('./lib/m016-s02-bos-mission-proof-contract');
  // Both produce identical output on a representative redaction-rich string.
  const sample = 'uuid 9feb4c22-05b9-401e-ba67-0e866e3056da bearer xyz sk-abcdefghijklmnop123456 tp-token-1234567890';
  assert.equal(sanitizeString(sample), s02.sanitizeString(sample));
});

test('verdict vocabulary boundary: only pass, not_proven, fail_closed accepted', () => {
  for (const v of Object.values(VERDICT_VALUES)) assert.ok(typeof v === 'string');
  assert.equal(Object.values(VERDICT_VALUES).length, 3);
  for (const v of ['GO', 'PASS_AUTOMATIC', 'READY']) assert.ok(FORBIDDEN_PROBE_VERDICTS.includes(v));
});
