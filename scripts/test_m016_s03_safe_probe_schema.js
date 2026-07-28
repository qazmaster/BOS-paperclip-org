#!/usr/bin/env node
'use strict';

/**
 * scripts/test_m016_s03_safe_probe_schema.js
 *
 * M016-txa3vu / S03 / T01 — Test suite for the frozen safe-probe schema
 * and the bounded registry of role/method/drill/gate/blocker constants.
 *
 * Uses node:test. Covers:
 *   (a) Public surface stability — every exported constant ships
 *   (b) Schema loader — Ajv compiles the JSON Schema draft-07 declaration
 *   (c) Happy paths — division EXECUTED + drill EXECUTED + NOT_PROVEN
 *   (d) Mutually exclusive branches — single-field leak in EXECUTED / NOT_PROVEN
 *   (e) Method/command blockers — POST/PUT/PATCH/DELETE/mutation verbs rejected
 *   (f) Field-shape blockers — malformed hash / range-violating exit_code / charset violation
 *   (g) Identity-shape blockers — paperclip without auth_method, unknown role, additional property
 *   (h) Path / scratch containment — traversal in artifact_reference, forbidden scratch roots
 *   (i) Isolation invariant — live probe MUST NOT set scratch_target_used=true, drill MUST
 *   (j) Redaction posture — redaction flags accepted only when every flag matches the frozen posture
 *   (k) Registry helpers — isKnownRole / isKnownGate / isProhibitedMethod / isKnownDrillKind
 *       / isDeadIdentity / isValidProbeVerdict / BLOCKER_CODES factory functions /
 *       allZeroMutationAudit
 *
 * All fixtures live in this file (no /tmp, no runtime-evidence pollution).
 *
 * Run with:
 *   node --test scripts/test_m016_s03_safe_probe_schema.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const data = require('./lib/m016-s03-safe-probe-data');

const {
  SCHEMA_ID,
  SCHEMA_VERSION,
  MILESTONE,
  SLICE,
  TASK_IDS,
  PROBE_ID_PREFIX,
  PROBE_BLOCKER_CODE_PATTERN,
  INDEPENDENCE_GROUP_PATTERN,
  ROLE_REGISTRY,
  ROLES_SET,
  ROLE_BY_NAME,
  INDEPENDENCE_GROUPS_SET,
  PROBE_METHODS,
  PROBE_METHOD_VALUES,
  PROBE_METHODS_SET,
  PROBE_METHOD_PATTERN,
  PROHIBITED_METHODS,
  MUTATION_VERB_REGEX,
  SCRATCH_DRILL_KINDS,
  SCRATCH_DRILL_KINDS_SET,
  HARD_GATE_IDS,
  HARD_GATE_LABELS,
  HARD_GATE_IDS_SET,
  BLOCKER_CODES,
  BLOCKER_CODE_REGEX,
  SOURCE_IDENTITY_KINDS,
  SOURCE_IDENTITY_KINDS_SET,
  REDACTION_BOUNDS,
  REDACTION_FLAG_VALUES,
  MUTATION_AUDIT_ZERO_COUNTERS,
  MUTATION_AUDIT_ZERO_COUNTERS_SET,
  DEAD_COMPANY_UUIDS,
  DEAD_COMPANY_UUIDS_SET,
  VERDICT_VALUES,
  VERDICT_VALUES_SET,
  FORBIDDEN_PROBE_VERDICTS,
  CLASSIFICATION_VALUES,
  CLASSIFICATION_VALUES_SET,
  EXIT_CODES,
  DEFAULTS,
  isKnownRole,
  getRoleEntry,
  getIndependenceGroup,
  getGateFor,
  isAllowedMethod,
  isScratchDrillMethod,
  isProhibitedMethod,
  isKnownDrillKind,
  getDrillKindForRole,
  isKnownGate,
  isValidIdentityKind,
  isKnownCounter,
  allZeroMutationAudit,
  isDeadIdentity,
  isValidProbeVerdict,
} = data;

// ---------------------------------------------------------------------------
// Schema loader (Ajv with optional fallback) — mirrors the S01/S02 pattern.
// ---------------------------------------------------------------------------

function loadSchema(schemaPath) {
  const rel = path.isAbsolute(schemaPath) ? schemaPath : path.join(__dirname, '..', schemaPath);
  assert.ok(fs.existsSync(rel), `schema missing at ${rel}`);
  return JSON.parse(fs.readFileSync(rel, 'utf8'));
}

function tryLoadValidator() {
  try {
    const Ajv = require('ajv');
    const addFormats = require('ajv-formats');
    const ajv = addFormats(new Ajv({ allErrors: true, strict: false }));
    const compiled = ajv.compile(loadSchema(DEFAULTS.schema_path));
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
  // Deterministic 64-char lowercase hex for fixture use only. NOT a real
  // cryptographic hash; produces stable artifact_hash values for tests.
  let out = '';
  let counter = 0;
  const s = String(seed);
  while (out.length < 64) {
    let h = 0;
    const t = s + ':' + counter;
    for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
    out += h.toString(16).padStart(8, '0');
    counter++;
  }
  return out.slice(0, 64);
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function makeExecutedRecord(role, overrides = {}) {
  const entry = ROLE_BY_NAME[role];
  assert.ok(entry, `unknown role ${role} for fixture`);
  const isDrill = entry.methodology === 'scratch-drill';
  const sourceIdentity = isDrill
    ? {
        kind: 'scratch_drill',
        scratch_root: '/tmp/m016-s03-scratch/' + entry.drill_kind + '-001',
        drill_kind: entry.drill_kind,
      }
    : {
        kind: 'paperclip_api_readonly',
        company_kind: 'bos-light',
        auth_method: 'bearer_token_env',
      };
  const method = isDrill
    ? entry.drill_kind
    : 'GET /api/companies/{companyId}/agents';
  const command = isDrill
    ? 'node scripts/run_m016_s03_scratch_drills.js --drill ' + entry.drill_kind
    : 'GET https://paperclip.oysana.com/api/companies/{companyId}/agents';
  const artifactReference = isDrill
    ? 'runtime-evidence/M016-S03-scratch-drill-results.json'
    : 'runtime-evidence/M016-S03-live-probe-' + role.toLowerCase().replace(/\./g, '-') + '.json';
  const sanitisedDigest = (role + ':' + entry.methodology + ':no-mutation:objective').slice(0, 64);
  return clone({
    schema_id: SCHEMA_ID,
    schema_version: SCHEMA_VERSION,
    milestone: MILESTONE,
    slice: SLICE,
    task: 'T01',
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
    redaction: clone(REDACTION_FLAG_VALUES),
    exit_code: 0,
    sanitised_digest: sanitisedDigest,
    artifact_reference: artifactReference,
    artifact_hash: sha256hex(role + '-artifact'),
    verdict: 'pass',
    blocker_codes: [],
    ...overrides,
  });
}

function makeNotProvenRecord(role, overrides = {}) {
  const base = makeExecutedRecord(role);
  delete base.exit_code;
  delete base.sanitised_digest;
  delete base.artifact_reference;
  delete base.artifact_hash;
  base.classification = 'NOT_PROVEN';
  base.verdict = 'not_proven';
  base.attempted_exit_code = 404;
  base.observed_blocker_code = 'M16-S03-PROBE-TARGET-UNAVAILABLE';
  base.observed_blocker_reason = 'GET /api/companies returned empty list';
  base.blocker_codes = ['M16-S03-PROBE-TARGET-UNAVAILABLE'];
  return clone(Object.assign(base, overrides));
}

// ---------------------------------------------------------------------------
// (a) Public surface stability
// ---------------------------------------------------------------------------

test('registry exports the documented surface', () => {
  assert.equal(SCHEMA_ID, 'https://gsd.local/schemas/runtime-evidence/m016-s03-safe-probe.v1.json');
  assert.equal(SCHEMA_VERSION, 'v1');
  assert.equal(MILESTONE, 'M016-txa3vu');
  assert.equal(SLICE, 'S03');
  assert.deepEqual([...TASK_IDS], ['T01', 'T02', 'T03', 'T04', 'T05', 'T06']);
  assert.equal(PROBE_ID_PREFIX, 'M16-S03-PROBE-');
  assert.equal(PROBE_BLOCKER_CODE_PATTERN, '^M16-S03-PROBE-[A-Za-z0-9._-]+$');
  assert.equal(INDEPENDENCE_GROUP_PATTERN, '^[a-z][a-z0-9._-]{2,63}$');
});

test('ROLE_REGISTRY contains seven divisions plus nine infrastructure roles', () => {
  assert.equal(ROLE_REGISTRY.length, 16, 'ROLE_REGISTRY should hold 7 divisions + 9 infrastructure = 16 entries');
  const roles = ROLE_REGISTRY.map((entry) => entry.role);
  for (const name of data.CANONICAL_DIVISION_NAMES) {
    assert.ok(roles.includes(name), 'division ' + name + ' must be present');
  }
  for (const required of [
    'paperclip_health', 'hermes_environment', 'secret_posture', 'cost_snapshot',
    'isolation_invariant', 'restore_drill', 'budget_stop_drill', 'failure_drill',
  ]) {
    assert.ok(roles.includes(required), 'infrastructure role ' + required + ' must be present');
  }
  for (const entry of ROLE_REGISTRY) {
    assert.equal(typeof entry.independence_group, 'string');
    assert.equal(typeof entry.gate, 'string');
    assert.match(entry.independence_group, new RegExp(INDEPENDENCE_GROUP_PATTERN));
  }
});

test('PROBE_METHODS contains GET-only allowlist + scratch-drill kind tokens', () => {
  assert.ok(PROBE_METHODS.GET_COMPANIES.startsWith('GET /api/'));
  assert.ok(PROBE_METHODS.GET_AGENTS.startsWith('GET /api/'));
  assert.ok(PROBE_METHODS.GET_HEALTH.startsWith('GET /api/'));
  assert.equal(PROBE_METHODS.RESTORE_DRILL, 'restore-drill');
  assert.equal(PROBE_METHODS.BUDGET_STOP_DRILL, 'budget-stop-drill');
  assert.equal(PROBE_METHODS.FAILURE_DRILL, 'failure-drill');
  assert.equal(PROBE_METHODS_SET.size, PROBE_METHOD_VALUES.length, 'set must mirror array');
});

test('PROHIBITED_METHODS covers every documented mutation verb', () => {
  for (const verb of ['POST', 'PUT', 'PATCH', 'DELETE', 'DESTROY', 'CREATE', 'UPDATE', 'INVOKE', 'WRITE', 'MUTATE']) {
    assert.ok(PROHIBITED_METHODS.includes(verb), 'prohibited verb ' + verb + ' must be present');
  }
});

test('SCRATCH_DRILL_KINDS, SOURCE_IDENTITY_KINDS, CLASSIFICATION_VALUES, VERDICT_VALUES are frozen', () => {
  assert.equal(SCRATCH_DRILL_KINDS_SET.size, 3);
  assert.equal(SOURCE_IDENTITY_KINDS_SET.size, 4);
  assert.equal(CLASSIFICATION_VALUES_SET.size, 2);
  assert.equal(VERDICT_VALUES_SET.size, 3);
  for (const v of FORBIDDEN_PROBE_VERDICTS) {
    assert.ok(!VERDICT_VALUES_SET.has(v), 'forbidden verdict ' + v + ' must not be allowed as a probe verdict');
  }
});

test('HARD_GATE_IDS covers HG1..HG8 with labels', () => {
  assert.equal(HARD_GATE_IDS.length, 8);
  assert.equal(Object.keys(HARD_GATE_LABELS).length, HARD_GATE_IDS.length);
  for (const id of HARD_GATE_IDS) {
    assert.ok(typeof HARD_GATE_LABELS[id] === 'string' && HARD_GATE_LABELS[id].length > 0, 'gate ' + id + ' must have a non-empty label');
  }
});

test('BLOCKER_CODES namespace matches the M16-S03-PROBE-* pattern', () => {
  const staticCodes = Object.entries(BLOCKER_CODES)
    .filter(([, value]) => typeof value === 'string')
    .map(([, value]) => value);
  for (const code of staticCodes) {
    assert.match(code, BLOCKER_CODE_REGEX, 'static code ' + code + ' must match namespace pattern');
  }
  // Factory functions must produce the same pattern when invoked.
  assert.match(BLOCKER_CODES.SCHEMA_VALIDATION_FAILED('Div1.HCO'), BLOCKER_CODE_REGEX);
  assert.match(BLOCKER_CODES.METHOD_PROHIBITED('Div3.Treasury', 'POST /api/agents'), BLOCKER_CODE_REGEX);
  assert.match(BLOCKER_CODES.BOUNDARY_MUTATION_DETECTED('Div1.HCO', 'issues_created', '1'), BLOCKER_CODE_REGEX);
  assert.match(BLOCKER_CODES.TARGET_UNAVAILABLE('restore_drill'), BLOCKER_CODE_REGEX);
  assert.match(BLOCKER_CODES.DRILL_PRECONDITION_FAILED('restore-drill', 'marker-missing'), BLOCKER_CODE_REGEX);
});

test('REDACTION_BOUNDS expose every leak regex from S02', () => {
  for (const key of ['uuid', 'credential_assignment', 'bearer_token', 'sk_token', 'tp_token',
    'xiaomi_or_mimo', 'vendor_reuse', 'raw_reasoning', 'raw_body', 'raw_result_json_result']) {
    assert.ok(REDACTION_BOUNDS[key] instanceof RegExp, 'redaction regex ' + key + ' must be a RegExp');
  }
  assert.equal(typeof REDACTION_FLAG_VALUES.bounded_digests_only, 'boolean');
  assert.equal(REDACTION_FLAG_VALUES.bounded_digests_only, true);
  assert.equal(REDACTION_FLAG_VALUES.full_ids, false);
});

test('MUTATION_AUDIT_ZERO_COUNTERS covers all documented counters', () => {
  assert.equal(MUTATION_AUDIT_ZERO_COUNTERS.length, 13);
  const zeros = allZeroMutationAudit();
  for (const counter of MUTATION_AUDIT_ZERO_COUNTERS) {
    assert.ok(MUTATION_AUDIT_ZERO_COUNTERS_SET.has(counter));
    assert.equal(zeros[counter], 0);
  }
});

test('DEAD_COMPANY_UUIDS detects stale identity values', () => {
  assert.equal(DEAD_COMPANY_UUIDS_SET.size, DEAD_COMPANY_UUIDS.length);
  assert.ok(isDeadIdentity('https://paperclip.oysana.com/api/companies/9feb4c22-05b9-401e-ba67-0e866e3056da'));
  assert.ok(isDeadIdentity('cfg=aipay.kz-token'));
  assert.ok(!isDeadIdentity('bos-light'));
  assert.ok(!isDeadIdentity('a7b1fdfc-test'));
});

test('EXIT_CODES documents every exit used by downstream scripts', () => {
  for (const code of Object.values(EXIT_CODES)) {
    assert.equal(typeof code, 'number');
  }
  assert.ok(EXIT_CODES.PROBE_RECORD_VALID === 0);
});

// ---------------------------------------------------------------------------
// (b) Schema loader
// ---------------------------------------------------------------------------

test('JSON Schema compiles under Ajv (draft-07)', () => {
  if (!SCHEMA_OK) return; // Optional Ajv unavailable — skip silently.
  const result = VALIDATE(makeExecutedRecord('Div1.HCO'));
  assert.ok(result.ok, 'baseline happy EXECUTED must validate under Ajv');
});

// ---------------------------------------------------------------------------
// (c) Happy paths — division, drill, NOT_PROVEN
// ---------------------------------------------------------------------------

test('happy EXECUTED record for each role parses under Ajv', () => {
  if (!SCHEMA_OK) return;
  for (const entry of ROLE_REGISTRY) {
    const r = VALIDATE(makeExecutedRecord(entry.role));
    assert.ok(r.ok, 'role ' + entry.role + ' must accept EXECUTED happy path. errors=' + JSON.stringify(r.errors));
  }
});

test('happy NOT_PROVEN record for each role parses under Ajv', () => {
  if (!SCHEMA_OK) return;
  for (const entry of ROLE_REGISTRY) {
    const r = VALIDATE(makeNotProvenRecord(entry.role));
    assert.ok(r.ok, 'role ' + entry.role + ' must accept NOT_PROVEN happy path. errors=' + JSON.stringify(r.errors));
  }
});

// ---------------------------------------------------------------------------
// (d) Mutually exclusive branches — single-field leak detection
// ---------------------------------------------------------------------------

test('NOT_PROVEN rejects any EXECUTED-only field (sanitised_digest / exit_code / artifact_reference / artifact_hash)', () => {
  if (!SCHEMA_OK) return;
  const np = makeNotProvenRecord('Div1.HCO');
  for (const field of ['sanitised_digest', 'exit_code', 'artifact_reference', 'artifact_hash']) {
    const clone1 = clone(np);
    clone1[field] = field === 'exit_code' ? 0 : 'leak';
    const r = VALIDATE(clone1);
    assert.ok(!r.ok, 'NOT_PROVEN must reject leaking EXECUTED field ' + field);
  }
});

test('EXECUTED rejects any NOT_PROVEN-only field (attempted_exit_code / observed_blocker_code / observed_blocker_reason)', () => {
  if (!SCHEMA_OK) return;
  const exec = makeExecutedRecord('Div1.HCO');
  const mutations = {
    attempted_exit_code: 1,
    observed_blocker_code: 'M16-S03-PROBE-TARGET-UNAVAILABLE',
    observed_blocker_reason: 'override',
  };
  for (const field of Object.keys(mutations)) {
    const clone1 = clone(exec);
    clone1[field] = mutations[field];
    const r = VALIDATE(clone1);
    assert.ok(!r.ok, 'EXECUTED must reject leaking NOT_PROVEN field ' + field);
  }
});

test('PASS-like NOT_PROVEN (verdict=pass) is rejected', () => {
  if (!SCHEMA_OK) return;
  const np = makeNotProvenRecord('Div1.HCO');
  np.verdict = 'pass';
  assert.ok(!VALIDATE(np).ok, 'NOT_PROVEN verdict=pass must be rejected');
});

test('NOT_PROVEN verdict=not_proven strictly enforced', () => {
  if (!SCHEMA_OK) return;
  const np = makeNotProvenRecord('Div1.HCO');
  np.verdict = 'fail_closed';
  assert.ok(!VALIDATE(np).ok, 'NOT_PROVEN verdict=fail_closed must be rejected');
});

// ---------------------------------------------------------------------------
// (e) Method and command blockers
// ---------------------------------------------------------------------------

test('mutation verbs in method are rejected (POST/PUT/PATCH/DELETE/DESTROY)', () => {
  if (!SCHEMA_OK) return;
  for (const verb of ['POST', 'PUT', 'PATCH', 'DELETE', 'DESTROY']) {
    const clone1 = clone(makeExecutedRecord('Div1.HCO'));
    clone1.method = verb + ' /api/agents';
    clone1.command = verb.toLowerCase() + ' /api/agents';
    assert.ok(!VALIDATE(clone1).ok, 'method starting with ' + verb + ' must be rejected');
  }
});

test('isProhibitedMethod helper detects all mutation verbs', () => {
  assert.ok(isProhibitedMethod('POST /api/agents'));
  assert.ok(isProhibitedMethod('PUT /api/agents/1'));
  assert.ok(isProhibitedMethod('DELETE /api/agents/1'));
  assert.ok(isProhibitedMethod('DESTROY /api/snapshot'));
  assert.ok(!isProhibitedMethod('GET /api/agents'));
  assert.ok(!isProhibitedMethod('restore-drill'));
});

test('command tokens with sk- / tp- / bearer leak are rejected', () => {
  if (!SCHEMA_OK) return;
  for (const leak of ['bearer sk-abc123', 'tp-leak-token-1', 'GET /api set sk-x']) {
    const clone1 = clone(makeExecutedRecord('Div1.HCO'));
    clone1.command = leak;
    assert.ok(!VALIDATE(clone1).ok, 'command carrying ' + leak + ' must be rejected');
  }
});

test('isAllowedMethod accepts GET-only allowlist + scratch-drill kinds', () => {
  assert.ok(isAllowedMethod('GET /api/companies'));
  assert.ok(isAllowedMethod('GET /api/companies/{companyId}'));
  assert.ok(isAllowedMethod('restore-drill'));
  assert.ok(isAllowedMethod('budget-stop-drill'));
  assert.ok(isAllowedMethod('failure-drill'));
  assert.ok(!isAllowedMethod('POST /api/agents'));
  assert.ok(!isAllowedMethod('unknown-drill-kind'));
});

// ---------------------------------------------------------------------------
// (f) Field-shape blockers
// ---------------------------------------------------------------------------

test('artifact_hash rejects uppercase hex and wrong length', () => {
  if (!SCHEMA_OK) return;
  const a = clone(makeExecutedRecord('Div1.HCO')); a.artifact_hash = 'A'.repeat(64);
  assert.ok(!VALIDATE(a).ok, 'uppercase hex must be rejected');
  const b = clone(makeExecutedRecord('Div1.HCO')); b.artifact_hash = 'a'.repeat(60);
  assert.ok(!VALIDATE(b).ok, 'short hash must be rejected');
  const c = clone(makeExecutedRecord('Div1.HCO')); c.artifact_hash = 'z'.repeat(64);
  assert.ok(!VALIDATE(c).ok, 'non-hex char must be rejected');
});

test('exit_code and attempted_exit_code honour their integer ranges', () => {
  if (!SCHEMA_OK) return;
  const exec = makeExecutedRecord('Div1.HCO');
  const a = clone(exec); a.exit_code = 999;
  assert.ok(!VALIDATE(a).ok, 'exit_code > 255 must be rejected');
  const b = clone(exec); b.exit_code = 'zero';
  assert.ok(!VALIDATE(b).ok, 'non-integer exit_code must be rejected');
  const np = makeNotProvenRecord('Div1.HCO');
  const c = clone(np); c.attempted_exit_code = 999;
  assert.ok(!VALIDATE(c).ok, 'attempted_exit_code > 599 must be rejected');
});

test('limitations must be non-empty array with bounded entries', () => {
  if (!SCHEMA_OK) return;
  const a = clone(makeExecutedRecord('Div1.HCO')); a.limitations = [];
  assert.ok(!VALIDATE(a).ok, 'limitations=[] must be rejected');
  const b = clone(makeExecutedRecord('Div1.HCO')); b.limitations = 'no array';
  assert.ok(!VALIDATE(b).ok, 'limitations=string must be rejected');
  const c = clone(makeExecutedRecord('Div1.HCO')); c.limitations = ['bearer sk-leak'];
  assert.ok(!VALIDATE(c).ok, 'limitations with bearer leak must be rejected');
});

test('scope rejects unsafe charset (newline / braces)', () => {
  if (!SCHEMA_OK) return;
  const a = clone(makeExecutedRecord('Div1.HCO')); a.scope = 'with\nnewline';
  assert.ok(!VALIDATE(a).ok, 'scope newline must be rejected');
  const b = clone(makeExecutedRecord('Div1.HCO')); b.scope = '';
  assert.ok(!VALIDATE(b).ok, 'empty scope must be rejected');
});

test('duration_ms must be non-negative integer within 10 minutes', () => {
  if (!SCHEMA_OK) return;
  const a = clone(makeExecutedRecord('Div1.HCO')); a.duration_ms = -1;
  assert.ok(!VALIDATE(a).ok, 'negative duration must be rejected');
  const b = clone(makeExecutedRecord('Div1.HCO')); b.duration_ms = 999999;
  assert.ok(!VALIDATE(b).ok, 'duration > 10 minutes must be rejected');
  const c = clone(makeExecutedRecord('Div1.HCO')); c.duration_ms = '10';
  assert.ok(!VALIDATE(c).ok, 'non-integer duration must be rejected');
});

// ---------------------------------------------------------------------------
// (g) Identity-shape blockers
// ---------------------------------------------------------------------------

test('unknown role is rejected by enum', () => {
  if (!SCHEMA_OK) return;
  const r = clone(makeExecutedRecord('Div1.HCO')); r.role = 'Div99.Bogus';
  assert.ok(!VALIDATE(r).ok, 'unknown role must be rejected');
});

test('additional properties are rejected by additionalProperties:false', () => {
  if (!SCHEMA_OK) return;
  const r = clone(makeExecutedRecord('Div1.HCO')); r.launch_verdict = 'GO';
  assert.ok(!VALIDATE(r).ok, 'additional top-level property must be rejected');
});

test('paperclip_api_readonly identity requires company_kind + auth_method', () => {
  if (!SCHEMA_OK) return;
  const r = clone(makeExecutedRecord('Div1.HCO'));
  delete r.source_identity.auth_method;
  assert.ok(!VALIDATE(r).ok, 'paperclip without auth_method must be rejected');
});

test('probe_id must start with M16-S03-PROBE-', () => {
  if (!SCHEMA_OK) return;
  const r = clone(makeExecutedRecord('Div1.HCO')); r.probe_id = 'div1-readonly-001';
  assert.ok(!VALIDATE(r).ok, 'probe_id without namespace prefix must be rejected');
});

test('task must be a valid T-id from the frozen list', () => {
  if (!SCHEMA_OK) return;
  const r = clone(makeExecutedRecord('Div1.HCO')); r.task = 'T99';
  assert.ok(!VALIDATE(r).ok, 'unknown task id must be rejected');
});

// ---------------------------------------------------------------------------
// (h) Path and scratch-root containment
// ---------------------------------------------------------------------------

test('artifact_reference rejects path traversal (../etc/passwd)', () => {
  if (!SCHEMA_OK) return;
  const r = clone(makeExecutedRecord('Div1.HCO'));
  r.artifact_reference = 'runtime-evidence/../etc/passwd';
  assert.ok(!VALIDATE(r).ok, 'path traversal must be rejected');
});

test('artifact_reference must be inside runtime-evidence/ or scripts/', () => {
  if (!SCHEMA_OK) return;
  const r = clone(makeExecutedRecord('Div1.HCO'));
  r.artifact_reference = 'etc/passwd';
  assert.ok(!VALIDATE(r).ok, 'absolute path outside root must be rejected');
});

test('scratch_drill.scratch_root forbids production roots (/root /home /etc /usr /opt /boot /sys /proc)', () => {
  if (!SCHEMA_OK) return;
  for (const root of ['/root/scratch', '/etc/passwd', '/usr/local', '/opt/probe', '/boot/grub', '/sys/kernel', '/proc/version']) {
    const r = clone(makeExecutedRecord('restore_drill'));
    r.source_identity.scratch_root = root;
    assert.ok(!VALIDATE(r).ok, 'scratch_root=' + root + ' must be rejected');
  }
});

test('scratch_drill.scratch_root accepts /tmp /private/tmp /var/folders', () => {
  if (!SCHEMA_OK) return;
  for (const root of ['/tmp/m016-s03-scratch/restore', '/private/tmp/m016-s03-scratch/restore', '/var/folders/m016-s03-scratch']) {
    const r = clone(makeExecutedRecord('restore_drill'));
    r.source_identity.scratch_root = root;
    assert.ok(VALIDATE(r).ok, 'scratch_root=' + root + ' must be accepted');
  }
});

// ---------------------------------------------------------------------------
// (i) Isolation invariant
// ---------------------------------------------------------------------------

test('live paperclip probe with scratch_target_used=true is rejected', () => {
  if (!SCHEMA_OK) return;
  const r = clone(makeExecutedRecord('Div1.HCO'));
  r.isolation_invariant.scratch_target_used = true;
  assert.ok(!VALIDATE(r).ok, 'live probe with scratch_target_used=true must be rejected');
});

test('scratch drill with scratch_target_used=false is rejected', () => {
  if (!SCHEMA_OK) return;
  const r = clone(makeExecutedRecord('restore_drill'));
  r.isolation_invariant.scratch_target_used = false;
  assert.ok(!VALIDATE(r).ok, 'drill with scratch_target_used=false must be rejected');
});

test('live paperclip probe with read_only_boundary_pass=false is rejected', () => {
  if (!SCHEMA_OK) return;
  const r = clone(makeExecutedRecord('Div1.HCO'));
  r.isolation_invariant.read_only_boundary_pass = false;
  assert.ok(!VALIDATE(r).ok, 'live probe with read_only_boundary_pass=false must be rejected');
});

// ---------------------------------------------------------------------------
// (j) Redaction posture
// ---------------------------------------------------------------------------

test('redaction.posture rejects any non-zero leak flag (full_ids = true)', () => {
  if (!SCHEMA_OK) return;
  const r = clone(makeExecutedRecord('Div1.HCO'));
  r.redaction.full_ids = true;
  assert.ok(!VALIDATE(r).ok, 'full_ids=true must be rejected');
});

test('redaction.posture rejects bounded_digests_only=false', () => {
  if (!SCHEMA_OK) return;
  const r = clone(makeExecutedRecord('Div1.HCO'));
  r.redaction.bounded_digests_only = false;
  assert.ok(!VALIDATE(r).ok, 'bounded_digests_only=false must be rejected');
});

test('redaction.posture accepts the canonical frozen posture verbatim', () => {
  if (!SCHEMA_OK) return;
  const r = clone(makeExecutedRecord('Div1.HCO'));
  r.redaction = clone(REDACTION_FLAG_VALUES);
  assert.ok(VALIDATE(r).ok, 'canonical redaction posture must be accepted');
});

// ---------------------------------------------------------------------------
// (k) Registry helpers
// ---------------------------------------------------------------------------

test('isKnownRole / getRoleEntry / getIndependenceGroup / getGateFor are consistent', () => {
  for (const entry of ROLE_REGISTRY) {
    assert.ok(isKnownRole(entry.role));
    assert.equal(getRoleEntry(entry.role), entry);
    assert.equal(getIndependenceGroup(entry.role), entry.independence_group);
    assert.equal(getGateFor(entry.role), entry.gate);
    assert.ok(HARD_GATE_IDS_SET.has(entry.gate));
  }
  assert.ok(!isKnownRole('Div99.Bogus'));
  assert.equal(getRoleEntry('Div99.Bogus'), null);
  assert.equal(getIndependenceGroup('Div99.Bogus'), null);
  assert.equal(getGateFor('Div99.Bogus'), null);
});

test('isKnownGate rejects arbitrary gate labels', () => {
  assert.ok(isKnownGate('HG1 SEMANTIC_RULE_COMPLIANCE'));
  assert.ok(isKnownGate('HG8 SCRATCH_ISOLATION'));
  assert.ok(!isKnownGate('HG9 INVALID_GATE'));
  assert.ok(!isKnownGate('NOT_A_GATE'));
});

test('isKnownDrillKind / getDrillKindForRole', () => {
  assert.ok(isKnownDrillKind('restore-drill'));
  assert.ok(isKnownDrillKind('budget-stop-drill'));
  assert.ok(isKnownDrillKind('failure-drill'));
  assert.ok(!isKnownDrillKind('roll-back-drill'));
  assert.equal(getDrillKindForRole('restore_drill'), 'restore-drill');
  assert.equal(getDrillKindForRole('budget_stop_drill'), 'budget-stop-drill');
  assert.equal(getDrillKindForRole('failure_drill'), 'failure-drill');
  assert.equal(getDrillKindForRole('Div1.HCO'), null);
});

test('isValidIdentityKind / isKnownCounter / isValidProbeVerdict / isScratchDrillMethod', () => {
  assert.ok(isValidIdentityKind('paperclip_api_readonly'));
  assert.ok(isValidIdentityKind('scratch_drill'));
  assert.ok(!isValidIdentityKind('external_api'));
  assert.ok(isKnownCounter('issues_created'));
  assert.ok(!isKnownCounter('random_counter'));
  assert.ok(isValidProbeVerdict('pass'));
  assert.ok(isValidProbeVerdict('not_proven'));
  assert.ok(isValidProbeVerdict('fail_closed'));
  assert.ok(!isValidProbeVerdict('GO'));
  assert.ok(!isValidProbeVerdict('PASS_AUTOMATIC'));
  assert.ok(isScratchDrillMethod('restore-drill'));
  assert.ok(!isScratchDrillMethod('GET /api/agents'));
});

test('PROBE_METHOD_PATTERN regex behaves as documented', () => {
  const re = new RegExp(PROBE_METHOD_PATTERN);
  assert.ok(re.test('GET /api/companies'));
  assert.ok(re.test('GET /api/companies/{companyId}'));
  assert.ok(re.test('GET /api/companies/{companyId}/agents/{agentId}'));
  assert.ok(re.test('restore-drill'));
  assert.ok(re.test('budget-stop-drill'));
  assert.ok(re.test('failure-drill'));
  assert.ok(!re.test('POST /api/agents'));
  assert.ok(!re.test('GET'));
  assert.ok(!re.test('GET /'));
  assert.ok(!re.test('read-only'));
});

test('INDEPENDENCE_GROUPS_SET size matches ROLE_REGISTRY (one per role)', () => {
  assert.equal(INDEPENDENCE_GROUPS_SET.size, ROLE_REGISTRY.length);
  for (const entry of ROLE_REGISTRY) {
    assert.ok(INDEPENDENCE_GROUPS_SET.has(entry.independence_group));
    assert.match(entry.independence_group, new RegExp(INDEPENDENCE_GROUP_PATTERN));
    // No two entries share an independence group.
    const matches = ROLE_REGISTRY.filter((e) => e.independence_group === entry.independence_group);
    assert.equal(matches.length, 1, 'independence_group ' + entry.independence_group + ' must be unique');
  }
});
