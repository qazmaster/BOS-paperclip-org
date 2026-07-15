#!/usr/bin/env node
'use strict';

/**
 * scripts/test_build_m015_s06_requirement_promotion.js
 *
 * M015-4o8lfw / S06 / T05 — Mission Level Requirement Promotion and Readback
 * unit test suite.
 *
 * Tests the pure-function surface of the promotion runner against:
 *   (a) live disk evidence on the S06 BLOCKED upstream state
 *   (b) synthetic fixtures that exercise each joint proof gate independently
 *   (c) negative fixtures that prove fail-closed discipline (leak, out-of-
 *       allowlist R-IDs, do_not_promote flags, missing upstream, etc.)
 *
 * Run with:
 *   node --test scripts/test_build_m015_s06_requirement_promotion.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..', '..');
const data = require('./lib/m015-s06-requirement-promotion-data');
const contract = require('./lib/m015-s06-requirement-promotion-contract');
const entry = require('./build_m015_s06_requirement_promotion');

const {
  CANONICAL_VERDICT,
  VERDICT_CODES,
  PROOF_TIERS,
  OWNED_RID_ALLOWLIST,
  RID_SET,
  RID_LABELS,
  EXCLUDED_CAPABILITY_SURFACES,
  REDACTION_DISCIPLINE_KEYS,
  CANONICAL_SCHEMA,
  REQUIRED_TOP_LEVEL_KEYS,
  PREVIOUS_TIER_DEFAULTS,
  S05_RID_KEY_MAP,
  UPSTREAM_PATHS,
  OUTPUT_PATH,
} = data;

const {
  scrubEvidence,
  detectLeakHits,
  assertWriteSafe,
  loadJsonSafe,
  computeFileSha256,
  fileSize,
  isPassVerdict,
  isBlockedVerdict,
  deriveSafeBlockDeclared,
  evaluatePreflightJointProof,
  evaluateMissionJointProof,
  evaluateValidationJointProof,
  evaluateUiJointProof,
  evaluateLeakScans,
  evaluateRidAllowlist,
  evaluateBusinessMutations,
  evaluateDoNotPromote,
  evaluateMissionRunPresent,
  evaluateJointProof,
  derivePreviousTier,
  computeRequirementReadback,
  buildDbReadbackPayload,
  buildNonPromotions,
  buildCapabilityPromotions,
  buildPromotionEvidence,
  deriveVerdictCode,
  deriveVerdictLine,
  exitCodeFor,
  deriveStatus,
  UUID_FULL,
  XIAOMI_RE,
  ROOT: CONTRACT_ROOT,
} = contract;

// ---------------------------------------------------------------------------
// Fixture builders — pure objects for upstream evidence shapes
// ---------------------------------------------------------------------------

function basePreflight(overrides = {}) {
  return Object.assign({
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s06-preflight.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S06',
    task: 'T01',
    verdict: 'BLOCKED_ON_LIVE_RUNTIME_UNREACHABLE',
    status: 'BLOCKED_ON_LIVE_RUNTIME_UNREACHABLE',
    admitted: false,
    business_mutations_recorded: 0,
    do_not_promote_s04: false,
    blockers: [{ code: 'M15-S06-PREFLIGHT-LIVE-RUNTIME-UNREACHABLE', severity: 'blocking', reason: 'live runtime unreachable' }],
    redaction: { ...REDACTION_DISCIPLINE_KEYS },
  }, overrides);
}

function baseMissionRun(overrides = {}) {
  return Object.assign({
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s06-native-mission-run.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S06',
    task: 'T02',
    status: 'MISSION_BLOCKED_NO_RUN',
    admission_summary: { status: 'BLOCKED_ON_S03_FAIL_CLOSED', admitted: false, blocked: true, business_mutations_recorded: 0, blocker_codes: [] },
    safe_block_declared: true,
    harness_writes: { root_issue_create: 0, child_issue_create: 0, comment_create: 0, document_create: 0 },
    mission_context: null,
    intake_summary: null,
    root_issue: null,
    mission_run: null,
    protocol_gates: {
      mission_topology_pass: false,
      authorship_and_authority_pass: false,
      secret_hygiene_pass: '<redacted>',
    },
    blockers: [],
    redaction: { ...REDACTION_DISCIPLINE_KEYS },
  }, overrides);
}

function baseValidation(overrides = {}) {
  return Object.assign({
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s06-native-mission-validation.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S06',
    task: 'T03',
    status: 'MISSION_FAIL_CLOSED_LEDGER_VIOLATION',
    safe_block_declared: true,
    safe_block_evidence: {
      preflight_verdict: 'BLOCKED_ON_LIVE_RUNTIME_UNREACHABLE',
      preflight_business_mutations_recorded: 0,
      preflight_do_not_promote_s04: false,
      preflight_blockers_count: 1,
      harness_root_issue_create: 0,
      mission_context_null: false,
      intake_summary_null: false,
      root_issue_null: true,
      mission_run_null: true,
    },
    do_not_promote_s04: false,
    protocol_gates: {
      mission_topology_pass: false,
      authorship_and_authority_pass: false,
    },
    gates: {
      readback_integrity_pass: false,
      preflight_correlation_pass: true,
      zero_business_mutation_ledger_pass: false,
      protocol_ledger_correlation_pass: false,
      autonomy_and_no_synthetic_bos_pass: false,
      safe_block_not_promoted_pass: true,
      orchestrator_provenance_pass: true,
      r026_boundary_classification_pass: true,
    },
    blockers: [],
    redaction: { ...REDACTION_DISCIPLINE_KEYS },
  }, overrides);
}

function basePublicUi(overrides = {}) {
  return Object.assign({
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s06-public-ui-proof.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S06',
    task: 'T04',
    canonical_verdict: 'M015_S06_UI',
    verdict: 'PASS_AUTH_NO_LEAK',
    status: 'AUTH_OK',
    safe_block_declared: true,
    browser_assertions: { ok: true },
    leak_scan: { blocking_findings: 0, advisory_findings: 0 },
    redaction: { ...REDACTION_DISCIPLINE_KEYS },
  }, overrides);
}

function baseS05Remediation(overrides = {}) {
  return Object.assign({
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s05-remediation.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S05',
    status: 'FAIL_CLOSED_UPSTREAM_FIX_REQUIRED',
    requirement_status: {
      R019_hermes_native_invokability: { status: PROOF_TIERS.DIAGNOSTIC_PROVEN, promoted_to_mission: false },
      R022_canonical_seven_division_agents: { status: PROOF_TIERS.DIAGNOSTIC_PROVEN, promoted_to_mission: false },
      R023_safe_provider_endpoint_config: { status: PROOF_TIERS.DIAGNOSTIC_PROVEN, promoted_to_mission: false },
      R026_routing_ordering: { status: PROOF_TIERS.DIAGNOSTIC_PROVEN, promoted_to_mission: false },
      R030_requirements_out_of_scope: { status: PROOF_TIERS.NOT_PROMOTED, promoted_to_mission: false },
      R031_requirements_out_of_scope: { status: PROOF_TIERS.NOT_PROMOTED, promoted_to_mission: false },
      R032_bos_proofability: { status: PROOF_TIERS.DIAGNOSTIC_PROVEN, promoted_to_mission: false },
      R035_admission_fail_closed_boundary: { status: PROOF_TIERS.DIAGNOSTIC_PROVEN, promoted_to_mission: false },
      R037_no_premature_business_mutations: { status: PROOF_TIERS.DIAGNOSTIC_PROVEN, promoted_to_mission: false },
    },
  }, overrides);
}

function baseS04Admission(overrides = {}) {
  return Object.assign({
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s04-admission.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S04',
    status: 'BLOCKED_ON_S03_FAIL_CLOSED',
    do_not_promote_s04: false,
    business_mutations_recorded: 0,
  }, overrides);
}

function makeUpstream(overrides = {}) {
  return Object.assign({
    preflight: { value: basePreflight(), path: 'runtime-evidence/M015-S06-preflight.json' },
    missionRun: { value: baseMissionRun(), path: 'runtime-evidence/M015-S06-native-mission-run.json' },
    validation: { value: baseValidation(), path: 'runtime-evidence/M015-S06-native-mission-validation.json' },
    publicUi: { value: basePublicUi(), path: 'runtime-evidence/M015-S06-public-ui-proof.json' },
    s05: { value: baseS05Remediation(), path: 'runtime-evidence/M015-S05-remediation-evidence.json' },
    s04Admission: { value: baseS04Admission(), path: 'runtime-evidence/M015-S04-admission.json' },
  }, overrides);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

test('canonical verdict constant equals M015_S06_PROMOTION', () => {
  assert.equal(CANONICAL_VERDICT, 'M015_S06_PROMOTION');
  assert.equal(data.CANONICAL_VERDICT, 'M015_S06_PROMOTION');
  assert.equal(entry.CANONICAL_VERDICT || data.CANONICAL_VERDICT, 'M015_S06_PROMOTION');
});

test('OWNED_RID_ALLOWLIST contains exactly R019/R022/R023/R026/R030/R031/R032/R035/R037', () => {
  assert.deepEqual([...OWNED_RID_ALLOWLIST].sort(), ['R019', 'R022', 'R023', 'R026', 'R030', 'R031', 'R032', 'R035', 'R037']);
  assert.equal(OWNED_RID_ALLOWLIST.length, 9);
});

test('RID_SET membership: every allowlisted R-ID is in the set', () => {
  for (const r of OWNED_RID_ALLOWLIST) {
    assert.equal(RID_SET.has(r), true, `${r} should be in RID_SET`);
  }
});

test('PROOF_TIERS contains MISSION_PROVEN, DIAGNOSTIC_PROVEN, NOT_PROMOTED, UNVALIDATED', () => {
  for (const t of ['MISSION_PROVEN', 'DIAGNOSTIC_PROVEN', 'NOT_PROMOTED', 'UNVALIDATED']) {
    assert.ok(PROOF_TIERS[t], `PROOF_TIERS.${t} must exist`);
  }
});

test('PREVIOUS_TIER_DEFAULTS: R019/R022/R023/R026/R032/R035/R037 default to DIAGNOSTIC_PROVEN; R030/R031 to NOT_PROMOTED', () => {
  for (const r of ['R019', 'R022', 'R023', 'R026', 'R032', 'R035', 'R037']) {
    assert.equal(PREVIOUS_TIER_DEFAULTS[r], PROOF_TIERS.DIAGNOSTIC_PROVEN, `${r} default`);
  }
  for (const r of ['R030', 'R031']) {
    assert.equal(PREVIOUS_TIER_DEFAULTS[r], PROOF_TIERS.NOT_PROMOTED, `${r} default`);
  }
});

test('S05_RID_KEY_MAP covers all 9 owned R-IDs', () => {
  for (const r of OWNED_RID_ALLOWLIST) {
    assert.ok(S05_RID_KEY_MAP[r], `S05_RID_KEY_MAP.${r} must exist`);
  }
});

test('UPSTREAM_PATHS references the four canonical S06 evidence files plus S05 + S04', () => {
  assert.equal(UPSTREAM_PATHS.preflight, 'runtime-evidence/M015-S06-preflight.json');
  assert.equal(UPSTREAM_PATHS.missionRun, 'runtime-evidence/M015-S06-native-mission-run.json');
  assert.equal(UPSTREAM_PATHS.validation, 'runtime-evidence/M015-S06-native-mission-validation.json');
  assert.equal(UPSTREAM_PATHS.publicUi, 'runtime-evidence/M015-S06-public-ui-proof.json');
  assert.equal(UPSTREAM_PATHS.s05Remediation, 'runtime-evidence/M015-S05-remediation-evidence.json');
  assert.equal(UPSTREAM_PATHS.s04Admission, 'runtime-evidence/M015-S04-admission.json');
});

test('OUTPUT_PATH resolves under runtime-evidence/M015-S06-requirement-promotion.json', () => {
  assert.equal(OUTPUT_PATH, 'runtime-evidence/M015-S06-requirement-promotion.json');
});

test('CANONICAL_SCHEMA is a stable HTTPS schema URL', () => {
  assert.match(CANONICAL_SCHEMA, /^https:\/\/gsd\.local\/schemas\//);
  assert.match(CANONICAL_SCHEMA, /m015-s06-requirement-promotion/);
});

test('REQUIRED_TOP_LEVEL_KEYS contains canonical verdict/status/payload keys', () => {
  const required = new Set(REQUIRED_TOP_LEVEL_KEYS);
  for (const k of ['$schema', 'milestone', 'slice', 'task', 'generated', 'canonical_verdict', 'verdict', 'verdict_code', 'status', 'safe_block_declared', 'joint_proof_evaluation', 'requirement_readback', 'non_promotions', 'capability_promotions', 'db_readback_payload', 'redaction', 'paths']) {
    assert.ok(required.has(k), `REQUIRED_TOP_LEVEL_KEYS must include ${k}`);
  }
});

test('EXCLUDED_CAPABILITY_SURFACES includes approvals, plugin, piko, data, action, widget, state, activity, events, gsdpi, hermes', () => {
  for (const s of ['approvals', 'plugin_registration', 'piko_tools', 'data_provider', 'action_surfaces', 'dashboard_widget', 'state_persistence', 'activity_events', 'gsdpi_execution', 'hermes_execution']) {
    assert.ok(EXCLUDED_CAPABILITY_SURFACES.includes(s), `${s} must be in EXCLUDED_CAPABILITY_SURFACES`);
  }
});

test('REDACTION_DISCIPLINE_KEYS contains 5 false-valued redaction flags', () => {
  assert.equal(REDACTION_DISCIPLINE_KEYS.full_ids, false);
  assert.equal(REDACTION_DISCIPLINE_KEYS.credentials, false);
  assert.equal(REDACTION_DISCIPLINE_KEYS.xiaomi_endpoint_reuse, false);
  assert.equal(REDACTION_DISCIPLINE_KEYS.provider_secret_names, false);
  assert.equal(REDACTION_DISCIPLINE_KEYS.synthetic_bos, false);
});

test('VERDICT_CODES has six stable codes (granted + 3 denied + missing + runner_failure)', () => {
  for (const c of ['PROMOTION_GRANTED_JOINT_PROOF_PASS', 'PROMOTION_DENIED_BLOCKED_UPSTREAM', 'PROMOTION_DENIED_LEAK_DETECTED', 'PROMOTION_DENIED_RID_NOT_ALLOWLISTED', 'PROMOTION_DENIED_EVIDENCE_MISSING', 'PROMOTION_RUNNER_FAILURE']) {
    assert.ok(VERDICT_CODES[c], `VERDICT_CODES.${c} must exist`);
  }
});

// ---------------------------------------------------------------------------
// Verdict-shape matchers
// ---------------------------------------------------------------------------

test('isPassVerdict: matches MISSION_PASS, PASS_AUTH_NO_LEAK, PREFLIGHT_GREEN, ADMITTED', () => {
  assert.equal(isPassVerdict('MISSION_PASS'), true);
  assert.equal(isPassVerdict('PASS_AUTH_NO_LEAK'), true);
  assert.equal(isPassVerdict('PREFLIGHT_GREEN'), true);
  assert.equal(isPassVerdict('ADMITTED'), true);
});

test('isPassVerdict: rejects BLOCKED/MISSION_BLOCKED_* / FAIL_CLOSED variants', () => {
  for (const v of ['MISSION_BLOCKED_NO_RUN', 'MISSION_BLOCKED_SAFE', 'MISSION_FAIL_CLOSED_LEDGER_VIOLATION', 'BLOCKED_ON_S03_FAIL_CLOSED', 'BLOCKED_UI_SAFETY_VIOLATION', 'PREFLIGHT_BLOCKED_LIVE_RUNTIME_UNREACHABLE', null, undefined, '', 'random_text']) {
    assert.equal(isPassVerdict(v), false, `should reject ${v}`);
  }
});

test('isBlockedVerdict: matches MISSION_BLOCKED, MISSION_FAIL_CLOSED, BLOCKED_ON_, BLOCKED_, BLOCKED_UI_, PREFLIGHT_BLOCKED, FAIL_CLOSED', () => {
  for (const v of ['MISSION_BLOCKED_NO_RUN', 'MISSION_BLOCKED_SAFE', 'MISSION_FAIL_CLOSED_LEDGER_VIOLATION', 'BLOCKED_ON_S03_FAIL_CLOSED', 'BLOCKED_UI_SAFETY_VIOLATION', 'PREFLIGHT_BLOCKED_LIVE_RUNTIME_UNREACHABLE', 'FAIL_CLOSED_UI']) {
    assert.equal(isBlockedVerdict(v), true, `should accept ${v}`);
  }
});

test('isBlockedVerdict: rejects PASS, ADMITTED, PREFLIGHT_GREEN, non-strings', () => {
  for (const v of ['MISSION_PASS', 'PASS_AUTH_NO_LEAK', 'ADMITTED', 'PREFLIGHT_GREEN', null, undefined, 42]) {
    assert.equal(isBlockedVerdict(v), false, `should reject ${v}`);
  }
});

// ---------------------------------------------------------------------------
// Redaction helpers
// ---------------------------------------------------------------------------

test('scrubEvidence replaces full UUIDs with <redacted-id>', () => {
  const result = scrubEvidence({ id: '12345678-1234-1234-1234-123456789012', other: 'ok' });
  assert.equal(result.id, '<redacted-id>');
  assert.equal(result.other, 'ok');
});

test('scrubEvidence replaces credential assignment strings with <redacted-credential-fragment>', () => {
  const result = scrubEvidence({ assignment: 'PAPERCLIP_API_KEY=abcd1234xyz' });
  assert.match(result.assignment, /^<redacted-credential-fragment>$/);
});

test('scrubEvidence replaces api-key/secret/password/token keys with <redacted>', () => {
  const result = scrubEvidence({ apiKey: 'whatever', secret_token: 'whatever', password: 'whatever', MySessionToken: 'whatever' });
  assert.equal(result.apiKey, '<redacted>');
  assert.equal(result.secret_token, '<redacted>');
  assert.equal(result.password, '<redacted>');
  assert.equal(result.MySessionToken, '<redacted>');
});

test('scrubEvidence handles nested objects and arrays', () => {
  const result = scrubEvidence({ items: [{ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }, 'plain'] });
  assert.equal(result.items[0].id, '<redacted-id>');
  assert.equal(result.items[1], 'plain');
});

test('detectLeakHits finds uuid_full, credential_assignment, xiaomi_reuse, synthetic_bos', () => {
  const hits = [];
  detectLeakHits({
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    assignment: 'OPENAI_API_KEY=sk-abc123',
    vendor: 'xiaomi mimo',
    bos: '<bos_light> test',
    clean: 'fine',
  }, '$', hits);
  const kinds = hits.map((h) => h.kind).sort();
  assert.deepEqual(kinds, ['credential_assignment', 'synthetic_bos', 'uuid_full', 'xiaomi_reuse']);
});

test('detectLeakHits ignores already-scrubbed placeholders', () => {
  const hits = [];
  detectLeakHits({
    id: '<redacted-id>',
    key: '<redacted>',
    cred: '<redacted-credential-fragment>',
    clean: 'fine',
  }, '$', hits);
  assert.equal(hits.length, 0);
});

test('assertWriteSafe throws when serialized payload contains a leak', () => {
  assert.throws(() => assertWriteSafe({ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }), /refusing to persist/);
  assert.throws(() => assertWriteSafe({ assignment: 'XIAOMI_API_KEY=sk-bad' }), /refusing to persist/);
  assert.throws(() => assertWriteSafe({ vendor: 'xiaomi mimo' }), /refusing to persist/);
});

test('assertWriteSafe passes for clean payload', () => {
  assert.doesNotThrow(() => assertWriteSafe({ verdict: 'OK', safe: true, status: 'PROMOTION_DENIED' }));
});

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

test('loadJsonSafe: returns null for missing file, parsed object for existing', () => {
  const missing = loadJsonSafe(path.join(os.tmpdir(), 'm015-t05-missing-' + Date.now() + '.json'));
  assert.equal(missing.exists, false);
  assert.equal(missing.value, null);
  const tmpFile = path.join(os.tmpdir(), 'm015-t05-fixture-' + Date.now() + '.json');
  fs.writeFileSync(tmpFile, JSON.stringify({ ok: true }));
  try {
    const ok = loadJsonSafe(tmpFile);
    assert.equal(ok.exists, true);
    assert.equal(ok.value.ok, true);
  } finally {
    fs.unlinkSync(tmpFile);
  }
});

test('computeFileSha256 returns 64-char hex for existing files, null for missing', () => {
  const tmpFile = path.join(os.tmpdir(), 'm015-t05-hash-' + Date.now() + '.json');
  fs.writeFileSync(tmpFile, 'hello');
  try {
    const hash = computeFileSha256(tmpFile);
    assert.match(hash, /^[0-9a-f]{64}$/);
  } finally {
    fs.unlinkSync(tmpFile);
  }
  assert.equal(computeFileSha256('/nonexistent/path'), null);
});

test('fileSize returns number for existing files, null for missing', () => {
  const tmpFile = path.join(os.tmpdir(), 'm015-t05-size-' + Date.now() + '.json');
  fs.writeFileSync(tmpFile, 'hello');
  try {
    const size = fileSize(tmpFile);
    assert.equal(size, 5);
  } finally {
    fs.unlinkSync(tmpFile);
  }
  assert.equal(fileSize('/nonexistent/path'), null);
});

// ---------------------------------------------------------------------------
// deriveSafeBlockDeclared — union of upstream safe-block signals
// ---------------------------------------------------------------------------

test('deriveSafeBlockDeclared: returns true if any upstream is blocked/safe-block', () => {
  const up = makeUpstream();
  assert.equal(deriveSafeBlockDeclared(up.preflight, up.missionRun, up.validation, up.publicUi), true);
});

test('deriveSafeBlockDeclared: returns false only when all upstream are non-blocked + safe_block=false', () => {
  const up = makeUpstream({
    preflight: { value: basePreflight({ verdict: 'PREFLIGHT_GREEN', status: 'PREFLIGHT_GREEN', admitted: true, safe_block_declared: false, blockers: [] }) },
    missionRun: { value: baseMissionRun({ status: 'MISSION_PASS', safe_block_declared: false, root_issue: { id: 'fake' }, mission_run: { id: 'mr', children: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }, { id: 'c5' }, { id: 'c6' }], all_agents_terminal: true } }) },
    validation: { value: baseValidation({ status: 'MISSION_PASS', safe_block_declared: false }) },
    publicUi: { value: basePublicUi({ verdict: 'PASS_AUTH_NO_LEAK', safe_block_declared: false }) },
  });
  assert.equal(deriveSafeBlockDeclared(up.preflight, up.missionRun, up.validation, up.publicUi), false);
});

test('deriveSafeBlockDeclared: handles missing upstream files gracefully', () => {
  assert.equal(deriveSafeBlockDeclared(null, null, null, null), false);
  assert.equal(deriveSafeBlockDeclared({ value: null }, null, null, null), false);
});

// ---------------------------------------------------------------------------
// Joint-proof gate evaluators
// ---------------------------------------------------------------------------

test('evaluatePreflightJointProof: ADMITTED verdict → passes', () => {
  const pf = { value: basePreflight({ verdict: 'ADMITTED', admitted: true, blockers: [] }) };
  const r = evaluatePreflightJointProof(pf);
  assert.equal(r.passed, true);
});

test('evaluatePreflightJointProof: PREFLIGHT_GREEN verdict → passes', () => {
  const pf = { value: basePreflight({ verdict: 'PREFLIGHT_GREEN', admitted: true, blockers: [] }) };
  const r = evaluatePreflightJointProof(pf);
  assert.equal(r.passed, true);
});

test('evaluatePreflightJointProof: BLOCKED_ON_LIVE_RUNTIME_UNREACHABLE → fails', () => {
  const pf = { value: basePreflight({ verdict: 'BLOCKED_ON_LIVE_RUNTIME_UNREACHABLE' }) };
  const r = evaluatePreflightJointProof(pf);
  assert.equal(r.passed, false);
  assert.match(r.detail, /not ADMITTED/);
});

test('evaluatePreflightJointProof: missing evidence → fails with detail', () => {
  const r = evaluatePreflightJointProof(null);
  assert.equal(r.passed, false);
  assert.match(r.detail, /missing/);
});

test('evaluateMissionJointProof: MISSION_PASS + MG all green → passes', () => {
  const mr = { value: baseMissionRun({ status: 'MISSION_PASS', mission_run: { children: [], all_agents_terminal: true } }) };
  const va = { value: baseValidation({ status: 'MISSION_PASS', protocol_gates: { a: true, b: true } }) };
  const r = evaluateMissionJointProof(mr, va);
  assert.equal(r.passed, true);
  assert.equal(r.mg_all_green, true);
});

test('evaluateMissionJointProof: MISSION_BLOCKED_NO_RUN → fails', () => {
  const mr = { value: baseMissionRun({ status: 'MISSION_BLOCKED_NO_RUN' }) };
  const va = { value: baseValidation() };
  const r = evaluateMissionJointProof(mr, va);
  assert.equal(r.passed, false);
  assert.match(r.detail, /MISSION_PASS/);
});

test('evaluateMissionJointProof: MISSION_PASS but MG gates have false values → fails', () => {
  const mr = { value: baseMissionRun({ status: 'MISSION_PASS', mission_run: { children: [], all_agents_terminal: true } }) };
  const va = { value: baseValidation({ protocol_gates: { a: true, b: false } }) };
  const r = evaluateMissionJointProof(mr, va);
  assert.equal(r.passed, false);
  assert.equal(r.mg_all_green, false);
});

test('evaluateValidationJointProof: MISSION_PASS + VG1-VG6 all true → passes', () => {
  const va = { value: baseValidation({
    status: 'MISSION_PASS',
    gates: {
      readback_integrity_pass: true,
      preflight_correlation_pass: true,
      zero_business_mutation_ledger_pass: true,
      protocol_ledger_correlation_pass: true,
      autonomy_and_no_synthetic_bos_pass: true,
      safe_block_not_promoted_pass: true,
    },
  }) };
  const r = evaluateValidationJointProof(va);
  assert.equal(r.passed, true);
});

test('evaluateValidationJointProof: MISSION_FAIL_CLOSED → fails', () => {
  const va = { value: baseValidation() };
  const r = evaluateValidationJointProof(va);
  assert.equal(r.passed, false);
});

test('evaluateValidationJointProof: any VG1-VG6 false → fails', () => {
  const va = { value: baseValidation({
    status: 'MISSION_PASS',
    gates: {
      readback_integrity_pass: true,
      preflight_correlation_pass: false,
      zero_business_mutation_ledger_pass: true,
      protocol_ledger_correlation_pass: true,
      autonomy_and_no_synthetic_bos_pass: true,
      safe_block_not_promoted_pass: true,
    },
  }) };
  const r = evaluateValidationJointProof(va);
  assert.equal(r.passed, false);
});

test('evaluateUiJointProof: PASS_AUTH_NO_LEAK + safe_block=false → passes', () => {
  const u = { value: basePublicUi({ verdict: 'PASS_AUTH_NO_LEAK', safe_block_declared: false }) };
  const r = evaluateUiJointProof(u, false);
  assert.equal(r.passed, true);
});

test('evaluateUiJointProof: PASS_AUTH_NO_LEAK + safe_block=true → fails (current disk state)', () => {
  const u = { value: basePublicUi({ verdict: 'PASS_AUTH_NO_LEAK', safe_block_declared: true }) };
  const r = evaluateUiJointProof(u, true);
  assert.equal(r.passed, false);
});

test('evaluateUiJointProof: BLOCKED verdict → fails', () => {
  const u = { value: basePublicUi({ verdict: 'BLOCKED_UI_SAFETY_VIOLATION' }) };
  const r = evaluateUiJointProof(u, false);
  assert.equal(r.passed, false);
});

test('evaluateRidAllowlist: default OWNED_RID_ALLOWLIST all in set → passes', () => {
  const r = evaluateRidAllowlist();
  assert.equal(r.passed, true);
  assert.equal(r.owned_count, 9);
  assert.equal(r.out_of_allowlist.length, 0);
});

test('evaluateRidAllowlist: out-of-allowlist R-IDs → fails', () => {
  const r = evaluateRidAllowlist(['R019', 'R099', 'R150']);
  assert.equal(r.passed, false);
  assert.deepEqual(r.out_of_allowlist.sort(), ['R099', 'R150']);
});

test('evaluateBusinessMutations: preflight=0 + harness_root_issue_create=0 + safe_block.mission_run_null=true → passes', () => {
  const pf = { value: basePreflight({ business_mutations_recorded: 0 }) };
  const mr = { value: baseMissionRun({ harness_writes: { root_issue_create: 0 } }) };
  const va = { value: baseValidation({ safe_block_evidence: { harness_root_issue_create: 0, mission_run_null: true } }) };
  const r = evaluateBusinessMutations(pf, mr, va);
  assert.equal(r.passed, true);
});

test('evaluateBusinessMutations: preflight.business_mutations_recorded > 0 → fails', () => {
  const pf = { value: basePreflight({ business_mutations_recorded: 1 }) };
  const mr = { value: baseMissionRun({ harness_writes: { root_issue_create: 0 } }) };
  const va = { value: baseValidation() };
  const r = evaluateBusinessMutations(pf, mr, va);
  assert.equal(r.passed, false);
});

test('evaluateDoNotPromote: all upstream do_not_promote_s04=false → passes', () => {
  const pf = { value: basePreflight({ do_not_promote_s04: false }) };
  const s04 = { value: baseS04Admission({ do_not_promote_s04: false }) };
  const va = { value: baseValidation({ do_not_promote_s04: false }) };
  const r = evaluateDoNotPromote(pf, s04, va);
  assert.equal(r.passed, true);
});

test('evaluateDoNotPromote: any upstream do_not_promote_s04=true → fails', () => {
  const pf = { value: basePreflight({ do_not_promote_s04: false }) };
  const s04 = { value: baseS04Admission({ do_not_promote_s04: true }) };
  const va = { value: baseValidation({ do_not_promote_s04: false }) };
  const r = evaluateDoNotPromote(pf, s04, va);
  assert.equal(r.passed, false);
});

test('evaluateMissionRunPresent: mission_run=null → fails', () => {
  const mr = { value: baseMissionRun({ mission_run: null }) };
  const r = evaluateMissionRunPresent(mr);
  assert.equal(r.passed, false);
});

test('evaluateMissionRunPresent: mission_run with 6 children + all_agents_terminal=true → passes', () => {
  const mr = { value: baseMissionRun({
    mission_run: { children: [{}, {}, {}, {}, {}, {}], all_agents_terminal: true },
  }) };
  const r = evaluateMissionRunPresent(mr);
  assert.equal(r.passed, true);
});

test('evaluateMissionRunPresent: mission_run with 5 children → fails (not exactly 6)', () => {
  const mr = { value: baseMissionRun({
    mission_run: { children: [{}, {}, {}, {}, {}], all_agents_terminal: true },
  }) };
  const r = evaluateMissionRunPresent(mr);
  assert.equal(r.passed, false);
});

test('evaluateLeakScans: clean upstream → 0 blocking findings → passes', () => {
  const up = makeUpstream();
  const r = evaluateLeakScans(up.preflight, up.missionRun, up.validation, up.publicUi, up.s05);
  assert.equal(r.passed, true);
  assert.equal(r.blocking_count, 0);
});

test('evaluateLeakScans: xiaomi string in upstream → blocking finding → fails', () => {
  const up = makeUpstream();
  up.publicUi.value.verdict = 'PASS_AUTH_NO_LEAK but leaked xiaomi mimo endpoint';
  const r = evaluateLeakScans(up.preflight, up.missionRun, up.validation, up.publicUi, up.s05);
  assert.equal(r.passed, false);
  assert.ok(r.blocking_count >= 1);
  assert.ok(r.blocking_hits.some((h) => h.kind === 'xiaomi_reuse'));
});

test('evaluateLeakScans: credential assignment in upstream → blocking finding → fails', () => {
  const up = makeUpstream();
  up.missionRun.value.assignment = 'OPENAI_API_KEY=sk-leak';
  const r = evaluateLeakScans(up.preflight, up.missionRun, up.validation, up.publicUi, up.s05);
  assert.equal(r.passed, false);
  assert.ok(r.blocking_hits.some((h) => h.kind === 'credential_assignment'));
});

test('evaluateLeakScans: full UUID in upstream → blocking finding → fails', () => {
  const up = makeUpstream();
  up.preflight.value.something_with_uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const r = evaluateLeakScans(up.preflight, up.missionRun, up.validation, up.publicUi, up.s05);
  assert.equal(r.passed, false);
  assert.ok(r.blocking_hits.some((h) => h.kind === 'uuid_full'));
});

// ---------------------------------------------------------------------------
// evaluateJointProof orchestrator
// ---------------------------------------------------------------------------

test('evaluateJointProof: current BLOCKED disk state → not all-pass, safe_block_declared=true', () => {
  const up = makeUpstream();
  const r = evaluateJointProof(up);
  assert.equal(r.all_pass, false);
  assert.equal(r.safe_block_declared, true);
  assert.equal(r.jp_count, 9);
  assert.ok(r.jp_pass_count < 9);
  // At least these gates should fail
  const fails = r.blocking_reasons.map((x) => x.gate).sort();
  assert.ok(fails.includes('preflight_admitted'));
  assert.ok(fails.includes('mission_pass'));
  assert.ok(fails.includes('validation_pass'));
  assert.ok(fails.includes('ui_pass_no_safe_block'));
  assert.ok(fails.includes('mission_run_present'));
});

test('evaluateJointProof: fully admitted fixture → all-pass', () => {
  const up = makeUpstream({
    preflight: { value: basePreflight({ verdict: 'PREFLIGHT_GREEN', status: 'PREFLIGHT_GREEN', admitted: true, blockers: [] }) },
    missionRun: { value: baseMissionRun({
      status: 'MISSION_PASS',
      safe_block_declared: false,
      root_issue: { id: 'root' },
      mission_run: { children: [{}, {}, {}, {}, {}, {}], all_agents_terminal: true },
    }) },
    validation: { value: baseValidation({
      status: 'MISSION_PASS',
      safe_block_declared: false,
      protocol_gates: { mission_topology_pass: true, authorship_and_authority_pass: true, secret_hygiene_pass: true, bos_provenance_pass: true, handoff_completeness_pass: true, disposition_allowlist_pass: true, single_write_boundary_pass: true, idempotency_lock_pass: true, recovery_lock_pass: true, side_effects_limited_pass: true },
      gates: {
        readback_integrity_pass: true,
        preflight_correlation_pass: true,
        zero_business_mutation_ledger_pass: true,
        protocol_ledger_correlation_pass: true,
        autonomy_and_no_synthetic_bos_pass: true,
        safe_block_not_promoted_pass: true,
      },
    }) },
    publicUi: { value: basePublicUi({ verdict: 'PASS_AUTH_NO_LEAK', safe_block_declared: false }) },
  });
  const r = evaluateJointProof(up);
  assert.equal(r.all_pass, true);
  assert.equal(r.safe_block_declared, false);
  assert.equal(r.jp_pass_count, 9);
  assert.equal(r.blocking_reasons.length, 0);
});

test('evaluateJointProof: leak in upstream → JP5 fails → not all-pass', () => {
  const up = makeUpstream();
  up.validation.value.note = 'xiaomi leak detected';
  const r = evaluateJointProof(up);
  assert.equal(r.all_pass, false);
  const fails = r.blocking_reasons.map((x) => x.gate);
  assert.ok(fails.includes('leak_scans_clean'));
});

// ---------------------------------------------------------------------------
// Previous tier + readback computation
// ---------------------------------------------------------------------------

test('derivePreviousTier: looks up S05 requirement_status when present', () => {
  const s05 = { value: baseS05Remediation() };
  assert.equal(derivePreviousTier('R019', s05), PROOF_TIERS.DIAGNOSTIC_PROVEN);
  assert.equal(derivePreviousTier('R030', s05), PROOF_TIERS.NOT_PROMOTED);
});

test('derivePreviousTier: falls back to PREVIOUS_TIER_DEFAULTS when S05 missing', () => {
  assert.equal(derivePreviousTier('R019', null), PROOF_TIERS.DIAGNOSTIC_PROVEN);
  assert.equal(derivePreviousTier('R030', { value: { requirement_status: {} } }), PROOF_TIERS.NOT_PROMOTED);
});

test('computeRequirementReadback: under fail-closed, all R-IDs keep previous tier (promoted=false)', () => {
  const up = makeUpstream();
  const joint = evaluateJointProof(up);
  const previousTiers = {};
  for (const r of OWNED_RID_ALLOWLIST) previousTiers[r] = derivePreviousTier(r, up.s05);
  const readback = computeRequirementReadback(up, joint, previousTiers, [...EXCLUDED_CAPABILITY_SURFACES]);
  assert.equal(readback.length, 9);
  for (const r of readback) {
    assert.equal(r.promoted_to_mission, false, `${r.rid} should not be promoted under fail-closed`);
    assert.ok(r.non_promotion_reason, `${r.rid} should have non_promotion_reason`);
    assert.match(r.non_promotion_reason, /joint proof failed/);
    assert.equal(r.status, r.previous_tier, `${r.rid} status should equal previous tier`);
    assert.equal(r.proposed_tier, r.previous_tier);
  }
});

test('computeRequirementReadback: under joint_pass, all R-IDs promoted to MISSION_PROVEN', () => {
  const up = makeUpstream({
    preflight: { value: basePreflight({ verdict: 'PREFLIGHT_GREEN', status: 'PREFLIGHT_GREEN', admitted: true, blockers: [] }) },
    missionRun: { value: baseMissionRun({
      status: 'MISSION_PASS',
      safe_block_declared: false,
      root_issue: { id: 'root' },
      mission_run: { children: [{}, {}, {}, {}, {}, {}], all_agents_terminal: true },
    }) },
    validation: { value: baseValidation({
      status: 'MISSION_PASS',
      safe_block_declared: false,
      protocol_gates: { mission_topology_pass: true, authorship_and_authority_pass: true, secret_hygiene_pass: true, bos_provenance_pass: true, handoff_completeness_pass: true, disposition_allowlist_pass: true, single_write_boundary_pass: true, idempotency_lock_pass: true, recovery_lock_pass: true, side_effects_limited_pass: true },
      gates: {
        readback_integrity_pass: true,
        preflight_correlation_pass: true,
        zero_business_mutation_ledger_pass: true,
        protocol_ledger_correlation_pass: true,
        autonomy_and_no_synthetic_bos_pass: true,
        safe_block_not_promoted_pass: true,
      },
    }) },
    publicUi: { value: basePublicUi({ verdict: 'PASS_AUTH_NO_LEAK', safe_block_declared: false }) },
  });
  const joint = evaluateJointProof(up);
  const previousTiers = {};
  for (const r of OWNED_RID_ALLOWLIST) previousTiers[r] = derivePreviousTier(r, up.s05);
  const readback = computeRequirementReadback(up, joint, previousTiers, [...EXCLUDED_CAPABILITY_SURFACES]);
  for (const r of readback) {
    assert.equal(r.promoted_to_mission, true, `${r.rid} should be promoted under joint_pass`);
    assert.equal(r.status, PROOF_TIERS.MISSION_PROVEN);
    assert.equal(r.proposed_tier, PROOF_TIERS.MISSION_PROVEN);
    assert.equal(r.non_promotion_reason, null);
  }
});

test('computeRequirementReadback: each entry has evidence_refs and capability_constraints_excluded', () => {
  const up = makeUpstream();
  const joint = evaluateJointProof(up);
  const previousTiers = {};
  for (const r of OWNED_RID_ALLOWLIST) previousTiers[r] = derivePreviousTier(r, up.s05);
  const readback = computeRequirementReadback(up, joint, previousTiers, [...EXCLUDED_CAPABILITY_SURFACES]);
  for (const r of readback) {
    assert.ok(Array.isArray(r.evidence_refs) && r.evidence_refs.length > 0, `${r.rid} must have evidence_refs`);
    assert.equal(r.evidence_files.length, 4);
    assert.ok(r.capability_constraints_excluded.includes('approvals'));
    assert.ok(r.capability_constraints_excluded.includes('gsdpi_execution'));
  }
});

// ---------------------------------------------------------------------------
// DB readback payload
// ---------------------------------------------------------------------------

test('buildDbReadbackPayload: under fail-closed, will_execute=false and calls=[]', () => {
  const up = makeUpstream();
  const joint = evaluateJointProof(up);
  const previousTiers = {};
  for (const r of OWNED_RID_ALLOWLIST) previousTiers[r] = derivePreviousTier(r, up.s05);
  const readback = computeRequirementReadback(up, joint, previousTiers, [...EXCLUDED_CAPABILITY_SURFACES]);
  const p = buildDbReadbackPayload(readback, joint);
  assert.equal(p.will_execute, false);
  assert.equal(p.tool, 'gsd_requirement_update');
  assert.equal(p.calls.length, 0);
  assert.equal(p.joint_proof_summary.all_pass, false);
  assert.ok(p.joint_proof_summary.blocking_gate_count > 0);
});

test('buildDbReadbackPayload: under joint_pass, will_execute=true and calls populated', () => {
  const up = makeUpstream({
    preflight: { value: basePreflight({ verdict: 'PREFLIGHT_GREEN', status: 'PREFLIGHT_GREEN', admitted: true, blockers: [] }) },
    missionRun: { value: baseMissionRun({
      status: 'MISSION_PASS',
      safe_block_declared: false,
      root_issue: { id: 'root' },
      mission_run: { children: [{}, {}, {}, {}, {}, {}], all_agents_terminal: true },
    }) },
    validation: { value: baseValidation({
      status: 'MISSION_PASS',
      safe_block_declared: false,
      protocol_gates: { mission_topology_pass: true, authorship_and_authority_pass: true, secret_hygiene_pass: true, bos_provenance_pass: true, handoff_completeness_pass: true, disposition_allowlist_pass: true, single_write_boundary_pass: true, idempotency_lock_pass: true, recovery_lock_pass: true, side_effects_limited_pass: true },
      gates: {
        readback_integrity_pass: true,
        preflight_correlation_pass: true,
        zero_business_mutation_ledger_pass: true,
        protocol_ledger_correlation_pass: true,
        autonomy_and_no_synthetic_bos_pass: true,
        safe_block_not_promoted_pass: true,
      },
    }) },
    publicUi: { value: basePublicUi({ verdict: 'PASS_AUTH_NO_LEAK', safe_block_declared: false }) },
  });
  const joint = evaluateJointProof(up);
  const previousTiers = {};
  for (const r of OWNED_RID_ALLOWLIST) previousTiers[r] = derivePreviousTier(r, up.s05);
  const readback = computeRequirementReadback(up, joint, previousTiers, [...EXCLUDED_CAPABILITY_SURFACES]);
  const p = buildDbReadbackPayload(readback, joint);
  assert.equal(p.will_execute, true);
  assert.equal(p.calls.length, 9);
  for (const call of p.calls) {
    assert.ok(call.id, 'call must have id');
    assert.equal(call.action, 'promote');
    assert.equal(call.status, 'mission-level');
    assert.match(call.primary_owner, /M015-4o8lfw\/S06/);
  }
});

// ---------------------------------------------------------------------------
// Non-promotions + capability promotions
// ---------------------------------------------------------------------------

test('buildNonPromotions: under fail-closed, includes joint-not-pass reason + per-R non-promotion', () => {
  const up = makeUpstream();
  const joint = evaluateJointProof(up);
  const previousTiers = {};
  for (const r of OWNED_RID_ALLOWLIST) previousTiers[r] = derivePreviousTier(r, up.s05);
  const readback = computeRequirementReadback(up, joint, previousTiers, [...EXCLUDED_CAPABILITY_SURFACES]);
  const lines = buildNonPromotions(readback, joint, [...EXCLUDED_CAPABILITY_SURFACES]);
  assert.ok(lines.some((l) => /Joint runtime\+independent\+browser proof is NOT all-pass/.test(l)));
  assert.ok(lines.some((l) => /Blocking gates:/.test(l)));
  assert.ok(lines.some((l) => /R019 remains at DIAGNOSTIC_PROVEN/.test(l)));
  assert.ok(lines.some((l) => /R030 remains at NOT_PROMOTED/.test(l)));
  assert.ok(lines.some((l) => /approvals/.test(l)));
});

test('buildCapabilityPromotions: explicitly excludes all 13 surfaces, all promoted=false', () => {
  const items = buildCapabilityPromotions([], null, [...EXCLUDED_CAPABILITY_SURFACES]);
  assert.equal(items.explicitly_excluded_count, EXCLUDED_CAPABILITY_SURFACES.length);
  assert.equal(items.promoted_count, 0);
  assert.equal(items.no_unsupported_capability_promotion, true);
  for (const it of items.items) {
    assert.equal(it.promoted, false);
    assert.equal(it.status, 'EXPLICITLY_UNPROMOTED');
    assert.match(it.rationale, /out of scope/);
  }
});

// ---------------------------------------------------------------------------
// buildPromotionEvidence — top-level structure
// ---------------------------------------------------------------------------

test('buildPromotionEvidence: includes all required top-level keys', () => {
  const up = makeUpstream();
  const joint = evaluateJointProof(up);
  const previousTiers = {};
  for (const r of OWNED_RID_ALLOWLIST) previousTiers[r] = derivePreviousTier(r, up.s05);
  const readback = computeRequirementReadback(up, joint, previousTiers, [...EXCLUDED_CAPABILITY_SURFACES]);
  const ev = buildPromotionEvidence({
    upstream: up,
    jointProof: joint,
    readback,
    generated: new Date().toISOString(),
    capabilityConstraints: [...EXCLUDED_CAPABILITY_SURFACES],
  });
  for (const k of REQUIRED_TOP_LEVEL_KEYS) {
    assert.ok(k in ev, `evidence must contain key ${k}`);
  }
  assert.equal(ev.canonical_verdict, 'M015_S06_PROMOTION');
  assert.equal(ev.milestone, 'M015-4o8lfw');
  assert.equal(ev.slice, 'S06');
  assert.equal(ev.task, 'T05');
  assert.equal(ev.safe_block_declared, joint.safe_block_declared);
  assert.equal(ev.joint_proof_evaluation, joint);
  assert.equal(ev.requirement_readback, readback);
});

test('buildPromotionEvidence: evidence_hashes includes all 6 upstream + this_file pending', () => {
  const up = makeUpstream();
  const joint = evaluateJointProof(up);
  const previousTiers = {};
  for (const r of OWNED_RID_ALLOWLIST) previousTiers[r] = derivePreviousTier(r, up.s05);
  const readback = computeRequirementReadback(up, joint, previousTiers, [...EXCLUDED_CAPABILITY_SURFACES]);
  const ev = buildPromotionEvidence({
    upstream: up,
    jointProof: joint,
    readback,
    generated: new Date().toISOString(),
    capabilityConstraints: [...EXCLUDED_CAPABILITY_SURFACES],
  });
  for (const name of ['preflight', 'missionRun', 'validation', 'publicUi', 's05Remediation', 's04Admission']) {
    assert.ok(ev.evidence_hashes[name], `evidence_hashes must include ${name}`);
    assert.equal(ev.evidence_hashes[name].path, UPSTREAM_PATHS[name]);
  }
  assert.ok(ev.evidence_hashes.this_file);
  assert.equal(ev.evidence_hashes.this_file.pending, true);
});

test('buildPromotionEvidence: redaction block contains 5 false-valued keys', () => {
  const up = makeUpstream();
  const joint = evaluateJointProof(up);
  const previousTiers = {};
  for (const r of OWNED_RID_ALLOWLIST) previousTiers[r] = derivePreviousTier(r, up.s05);
  const readback = computeRequirementReadback(up, joint, previousTiers, [...EXCLUDED_CAPABILITY_SURFACES]);
  const ev = buildPromotionEvidence({
    upstream: up,
    jointProof: joint,
    readback,
    generated: new Date().toISOString(),
    capabilityConstraints: [...EXCLUDED_CAPABILITY_SURFACES],
  });
  assert.equal(ev.redaction.full_ids, false);
  assert.equal(ev.redaction.credentials, false);
  assert.equal(ev.redaction.xiaomi_endpoint_reuse, false);
  assert.equal(ev.redaction.provider_secret_names, false);
  assert.equal(ev.redaction.synthetic_bos, false);
});

// ---------------------------------------------------------------------------
// Verdict derivation
// ---------------------------------------------------------------------------

test('deriveVerdictCode: joint_pass=true → PROMOTION_GRANTED_JOINT_PROOF_PASS', () => {
  const joint = { all_pass: true, blocking_reasons: [] };
  assert.equal(deriveVerdictCode(joint, []), VERDICT_CODES.PROMOTION_GRANTED_JOINT_PROOF_PASS);
});

test('deriveVerdictCode: blockers → PROMOTION_DENIED_EVIDENCE_MISSING (priority)', () => {
  const joint = { all_pass: false, blocking_reasons: [] };
  const blockers = [{ code: 'M15-S06-PROMOTION-EVIDENCE-MISSING' }];
  assert.equal(deriveVerdictCode(joint, blockers), VERDICT_CODES.PROMOTION_DENIED_EVIDENCE_MISSING);
});

test('deriveVerdictCode: leak fails → PROMOTION_DENIED_LEAK_DETECTED', () => {
  const joint = { all_pass: false, blocking_reasons: [{ gate: 'leak_scans_clean' }] };
  assert.equal(deriveVerdictCode(joint, []), VERDICT_CODES.PROMOTION_DENIED_LEAK_DETECTED);
});

test('deriveVerdictCode: r_id_allowlist fail → PROMOTION_DENIED_RID_NOT_ALLOWLISTED', () => {
  const joint = { all_pass: false, blocking_reasons: [{ gate: 'r_id_allowlist_ok' }] };
  assert.equal(deriveVerdictCode(joint, []), VERDICT_CODES.PROMOTION_DENIED_RID_NOT_ALLOWLISTED);
});

test('deriveVerdictCode: other fail → PROMOTION_DENIED_BLOCKED_UPSTREAM', () => {
  const joint = { all_pass: false, blocking_reasons: [{ gate: 'preflight_admitted' }] };
  assert.equal(deriveVerdictCode(joint, []), VERDICT_CODES.PROMOTION_DENIED_BLOCKED_UPSTREAM);
});

test('deriveStatus: each verdict code maps to a stable status string', () => {
  assert.equal(deriveStatus(VERDICT_CODES.PROMOTION_GRANTED_JOINT_PROOF_PASS), 'PROMOTION_GRANTED');
  assert.equal(deriveStatus(VERDICT_CODES.PROMOTION_DENIED_BLOCKED_UPSTREAM), 'PROMOTION_DENIED');
  assert.equal(deriveStatus(VERDICT_CODES.PROMOTION_DENIED_LEAK_DETECTED), 'PROMOTION_DENIED');
  assert.equal(deriveStatus(VERDICT_CODES.PROMOTION_DENIED_RID_NOT_ALLOWLISTED), 'PROMOTION_DENIED');
  assert.equal(deriveStatus(VERDICT_CODES.PROMOTION_DENIED_EVIDENCE_MISSING), 'PROMOTION_REFUSED_EVIDENCE_MISSING');
  assert.equal(deriveStatus(VERDICT_CODES.PROMOTION_RUNNER_FAILURE), 'PROMOTION_RUNNER_FAILURE');
});

test('exitCodeFor: granted/denied=0, missing=1, runner_failure=2', () => {
  assert.equal(exitCodeFor(VERDICT_CODES.PROMOTION_GRANTED_JOINT_PROOF_PASS), 0);
  assert.equal(exitCodeFor(VERDICT_CODES.PROMOTION_DENIED_BLOCKED_UPSTREAM), 0);
  assert.equal(exitCodeFor(VERDICT_CODES.PROMOTION_DENIED_LEAK_DETECTED), 0);
  assert.equal(exitCodeFor(VERDICT_CODES.PROMOTION_DENIED_RID_NOT_ALLOWLISTED), 0);
  assert.equal(exitCodeFor(VERDICT_CODES.PROMOTION_DENIED_EVIDENCE_MISSING), 1);
  assert.equal(exitCodeFor(VERDICT_CODES.PROMOTION_RUNNER_FAILURE), 2);
});

// ---------------------------------------------------------------------------
// Verdict line shape
// ---------------------------------------------------------------------------

test('deriveVerdictLine: canonical M015_S06_PROMOTION= prefix and 6-field structure', () => {
  const joint = { safe_block_declared: true, jp_count: 9, jp_pass_count: 4, blocking_reasons: [{ gate: 'a' }, { gate: 'b' }] };
  const readback = [{ promoted_to_mission: true }, { promoted_to_mission: false }, { promoted_to_mission: false }];
  const line = deriveVerdictLine('PROMOTION_DENIED_BLOCKED_UPSTREAM', joint, readback);
  assert.match(line, /^M015_S06_PROMOTION=verdict=PROMOTION_DENIED_BLOCKED_UPSTREAM promoted_count=1\/3 evidence_hashes=9 blockers=2 jp_pass=4\/9 safe_block=true$/);
});

test('deriveVerdictLine: granted state with promoted_count=9/9 and safe_block=false', () => {
  const joint = { safe_block_declared: false, jp_count: 9, jp_pass_count: 9, blocking_reasons: [] };
  const readback = Array.from({ length: 9 }, () => ({ promoted_to_mission: true }));
  const line = deriveVerdictLine('PROMOTION_GRANTED_JOINT_PROOF_PASS', joint, readback);
  assert.match(line, /^M015_S06_PROMOTION=verdict=PROMOTION_GRANTED_JOINT_PROOF_PASS promoted_count=9\/9 evidence_hashes=9 blockers=0 jp_pass=9\/9 safe_block=false$/);
});

// ---------------------------------------------------------------------------
// Entry script — parseArgs + writeEvidence
// ---------------------------------------------------------------------------

test('parseArgs: defaults match canonical UPSTREAM_PATHS + OUTPUT_PATH', () => {
  const opts = entry.parseArgs(['node']);
  assert.equal(opts.preflight, UPSTREAM_PATHS.preflight);
  assert.equal(opts.missionRun, UPSTREAM_PATHS.missionRun);
  assert.equal(opts.validation, UPSTREAM_PATHS.validation);
  assert.equal(opts.publicUi, UPSTREAM_PATHS.publicUi);
  assert.equal(opts.s05Remediation, UPSTREAM_PATHS.s05Remediation);
  assert.equal(opts.s04Admission, UPSTREAM_PATHS.s04Admission);
  assert.equal(opts.output, OUTPUT_PATH);
  assert.equal(opts.dryRun, false);
  assert.equal(opts.errors.length, 0);
});

test('parseArgs: --dry-run sets dryRun=true', () => {
  const opts = entry.parseArgs(['node', '--dry-run']);
  assert.equal(opts.dryRun, true);
});

test('parseArgs: --preflight=PATH overrides preflight path', () => {
  const opts = entry.parseArgs(['node', '--preflight=/tmp/pf.json']);
  assert.equal(opts.preflight, '/tmp/pf.json');
});

test('parseArgs: --output=PATH overrides output path', () => {
  const opts = entry.parseArgs(['node', '--output=/tmp/out.json']);
  assert.equal(opts.output, '/tmp/out.json');
});

test('parseArgs: unknown arg populates errors[]', () => {
  const opts = entry.parseArgs(['node', '--unknown-flag']);
  assert.ok(opts.errors.length > 0);
  assert.match(opts.errors[0], /unknown argument/);
});

test('parseArgs: -h sets help=true', () => {
  const opts = entry.parseArgs(['node', '-h']);
  assert.equal(opts.help, true);
});

test('writeEvidence: writes valid scrubbed JSON to output path', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm015-t05-write-'));
  const out = path.join(tmpDir, 'promotion.json');
  const evidence = { verdict: 'PROMOTION_DENIED_BLOCKED_UPSTREAM', payload: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }, redaction: { ...REDACTION_DISCIPLINE_KEYS } };
  const r = entry.writeEvidence(evidence, out);
  assert.ok(r.absolute_path.endsWith('promotion.json'));
  assert.ok(r.byte_size > 0);
  const written = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(written.payload.id, '<redacted-id>');
  assert.equal(written.verdict, 'PROMOTION_DENIED_BLOCKED_UPSTREAM');
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('writeEvidence: throws (via assertWriteSafe) on xiaomi leak', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm015-t05-write-'));
  const out = path.join(tmpDir, 'promotion.json');
  const evidence = { verdict: 'OK', note: 'xiaomi mimo leaked' };
  assert.throws(() => entry.writeEvidence(evidence, out), /refusing to persist/);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Live disk integration — read real upstream evidence, run joint proof
// ---------------------------------------------------------------------------

test('live disk integration: preflight file absent on disk → derives safe_block from upstream union', () => {
  // preflight file does not currently exist (per T04 summary). The runner
  // handles this by deriving safe_block_declared from union of upstream.
  // We assert that evaluateJointProof does NOT crash on missing preflight.
  const preflightExists = fs.existsSync(path.join(ROOT, UPSTREAM_PATHS.preflight));
  if (!preflightExists) {
    const up = makeUpstream({ preflight: { value: null, path: UPSTREAM_PATHS.preflight, exists: false } });
    const r = evaluateJointProof(up);
    assert.equal(r.gates.preflight_admitted.passed, false);
    assert.match(r.gates.preflight_admitted.detail, /missing|not ADMITTED/);
  } else {
    const pfRaw = loadJsonSafe(UPSTREAM_PATHS.preflight);
    const r = evaluatePreflightJointProof(pfRaw);
    assert.ok(['ADMITTED', 'PREFLIGHT_GREEN'].includes(r.verdict) === false, 'preflight should NOT be admitted on current disk');
    assert.equal(r.passed, false);
  }
});

test('live disk integration: real mission-run + validation + public-ui produce PROMOTION_DENIED_BLOCKED_UPSTREAM', () => {
  const up = makeUpstream();
  // Use real files where they exist on disk
  for (const [key, filePath] of [['missionRun', UPSTREAM_PATHS.missionRun], ['validation', UPSTREAM_PATHS.validation], ['publicUi', UPSTREAM_PATHS.publicUi], ['s05', UPSTREAM_PATHS.s05Remediation], ['s04Admission', UPSTREAM_PATHS.s04Admission]]) {
    const loaded = loadJsonSafe(filePath);
    if (loaded && loaded.value) up[key] = loaded;
  }
  const joint = evaluateJointProof(up);
  assert.equal(joint.all_pass, false, 'joint proof must not all-pass on current BLOCKED upstream');
  assert.equal(joint.safe_block_declared, true, 'safe_block must be true under BLOCKED upstream');
  const verdictCode = deriveVerdictCode(joint, []);
  assert.equal(verdictCode, VERDICT_CODES.PROMOTION_DENIED_BLOCKED_UPSTREAM);
});

test('live disk integration: real upstream evidence has 0 blocking leak findings', () => {
  const up = makeUpstream();
  for (const [key, filePath] of [['missionRun', UPSTREAM_PATHS.missionRun], ['validation', UPSTREAM_PATHS.validation], ['publicUi', UPSTREAM_PATHS.publicUi], ['s05', UPSTREAM_PATHS.s05Remediation], ['s04Admission', UPSTREAM_PATHS.s04Admission]]) {
    const loaded = loadJsonSafe(filePath);
    if (loaded && loaded.value) up[key] = loaded;
  }
  const r = evaluateLeakScans(up.preflight, up.missionRun, up.validation, up.publicUi, up.s05);
  assert.equal(r.blocking_count, 0, `expected 0 blocking findings on real upstream, got ${r.blocking_count}`);
});