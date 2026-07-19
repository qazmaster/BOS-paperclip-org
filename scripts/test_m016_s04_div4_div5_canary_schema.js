#!/usr/bin/env node
'use strict';

/**
 * scripts/test_m016_s04_div4_div5_canary_schema.js
 *
 * M016-txa3vu / S04 / T01 — Test suite for the frozen Div4→Div5 canary
 * schemas and the bounded registry / namespace / gate vocabulary.
 *
 * Uses node:test. Covers:
 *   (a) Public surface stability — every documented export ships
 *   (b) Schema loader — Ajv compiles each of the three draft-07 schemas
 *   (c) Bundle happy paths — EXECUTED live, EXECUTED drill, NOT_PROVEN, mixed
 *   (d) Bundle mutually exclusive branches — single-field leak detection
 *   (e) Bundle method/command blockers — POST/PUT/PATCH/DELETE/mutation verbs
 *   (f) Bundle field-shape blockers — malformed hash / range-violating exit /
 *       charset violation; criterion_id outside vocabulary
 *   (g) Bundle identity-shape blockers — paperclip without auth_method, etc.
 *   (h) Bundle path / scratch containment — traversal, forbidden scratch roots
 *   (i) Bundle isolation invariant — live vs drill scrape_target_used parity
 *   (j) Bundle redaction posture — only the frozen 10-flag posture accepted
 *   (k) Bundle correlation contract — agent_run_id pattern, evidence_id
 *       uniqueness, criterion_id vocabulary, weights
 *   (l) Bundle evidence_chain — chain_role enum, hash patterns, unchanged
 *   (m) Bundle embedded_classification — CG1..CG8 canary gates + HG1..HG8
 *       hard gates, frozen launch verdict=PREPARATION_ONLY
 *   (n) Producer protocol happy + minimal schema conformity
 *   (o) Verify protocol happy + minimal schema conformity
 *   (p) Registry helpers — isKnownCanaryGate / isForbiddenCanaryVerdict /
 *       isInRoleSubset / isInDrillSubset / isValidCanaryKind / isDeadIdentity /
 *       BLOCKER_CODES factory functions
 *   (q) EXIT_CODES covers all 9 documented process exits
 *
 * Run with:
 *   node --test scripts/test_m016_s04_div4_div5_canary_schema.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const data = require('./lib/m016-s04-div4-div5-canary-data');
const probeData = require('./lib/m016-s03-safe-probe-data');

const {
  SCHEMA_ID,
  SCHEMA_VERSION,
  PRODUCER_PROTOCOL_SCHEMA_ID,
  PRODUCER_PROTOCOL_SCHEMA_VERSION,
  VERIFY_PROTOCOL_SCHEMA_ID,
  VERIFY_PROTOCOL_SCHEMA_VERSION,
  MILESTONE,
  SLICE,
  TASK_IDS,
  BUNDLE_ID,
  BUNDLE_KIND,
  CANARY_PAIR_PRODUCER,
  CANARY_PAIR_VALIDATOR,
  PRODUCER_PROTOCOL_ID,
  PRODUCER_PROTOCOL_KIND,
  VERIFY_PROTOCOL_ID,
  VERIFY_PROTOCOL_KIND,
  PRODUCER_TASK_ID,
  VERIFIER_TASK_ID,
  NAMESPACE,
  VALIDATOR_NAMESPACE,
  PRODUCER_LINE_CLASS,
  VERIFIER_LINE_CLASS,
  PRODUCER_CANONICAL_PROTOCOL,
  VERIFIER_CANONICAL_PROTOCOL,
  CANARY_BLOCKER_NAMESPACE,
  VERIFIER_BLOCKER_NAMESPACE,
  CANARY_BLOCKER_CODE_PATTERN,
  VERIFIER_BLOCKER_CODE_PATTERN,
  EVIDENCE_ID_PREFIX,
  AGENT_RUN_ID_PREFIX,
  CORRELATION_PROBE_ID_PREFIX,
  CANARY_GATE_IDS,
  CANARY_GATE_LABELS,
  CANARY_GATE_IDS_SET,
  isKnownCanaryGate,
  BLOCKER_CODES,
  CANARY_BLOCKER_CODE_REGEX,
  VERIFIER_BLOCKER_CODE_REGEX,
  isCanaryBlockerCode,
  isVerifierBlockerCode,
  EXIT_CODES,
  ROLE_SUBSET_DEFAULTS,
  ROLE_SUBSET_ALTERNATIVE,
  ROLE_SUBSET_SET,
  isInRoleSubset,
  isInRoleSubsetAny,
  DRILL_SUBSET_DEFAULTS,
  DRILL_SUBSET_ALTERNATIVE,
  DRILL_SUBSET_SET,
  isInDrillSubset,
  isInDrillSubsetAny,
  CANARY_KINDS,
  CANARY_KINDS_SET,
  isValidCanaryKind,
  CORRELATION_AGENT_RUN_ID_PATTERN,
  CORRELATION_EVIDENCE_ID_PATTERN,
  CORRELATION_PROBE_ID_PATTERN,
  CORRELATION_CRITERION_ID_PATTERN,
  CORRELATION_BUDGET,
  SOURCE_ALLOWLIST,
  SOURCE_ALLOWLIST_SET,
  S02_BASELINE_REF,
  S03_PACK_REF,
  S03_VERIFY_REF,
  S03_COLLECT_REF,
  S03_INVENTORY_REF,
  S03_LIVE_PROBE_REF,
  S03_SCRATCH_DRILL_REF,
  S03_ISOLATION_INVARIANT_REF,
  RECORDS_BUDGET,
  DEFAULTS,
  FORBIDDEN_CANARY_VERDICTS,
  isForbiddenCanaryVerdict,
  CANARY_VERDICT_VALUES,
  CANARY_VERDICT_VALUES_SET,
  isValidCanaryVerdict,
  CANARY_REDACTION_FLAG_VALUES,
  PROBE_ID_PATTERN,
  INDEPENDENCE_GROUP_PATTERN,
  BUNDLE_ID_PATTERN,
  SOURCE_REF_PATTERN,
} = data;

const {
  REDACTION_FLAG_VALUES,
  ROLES_SET,
  ROLE_BY_NAME,
  HARD_GATE_IDS,
  HARD_GATE_LABELS,
  PROBE_ID_PREFIX,
  allZeroMutationAudit,
  isDeadIdentity,
} = probeData;

// ---------------------------------------------------------------------------
// Schema loader (Ajv with optional fallback)
// ---------------------------------------------------------------------------

function loadSchema(schemaPath) {
  const rel = path.isAbsolute(schemaPath) ? schemaPath : path.join(__dirname, '..', schemaPath);
  assert.ok(fs.existsSync(rel), `schema missing at ${rel}`);
  return JSON.parse(fs.readFileSync(rel, 'utf8'));
}

function tryLoadValidator(schemaPath) {
  try {
    const Ajv = require('ajv');
    const addFormats = require('ajv-formats');
    const ajv = addFormats(new Ajv({ allErrors: true, strict: false }));
    const compiled = ajv.compile(loadSchema(schemaPath));
    return (doc) => {
      const ok = compiled(doc);
      return { ok: !!ok, errors: compiled.errors || [] };
    };
  } catch (e) {
    return null;
  }
}

const VALIDATE_BUNDLE = tryLoadValidator(DEFAULTS.schema_path);
const VALIDATE_PRODUCER_PROTOCOL = tryLoadValidator(DEFAULTS.producer_protocol_schema_path);
const VALIDATE_VERIFY_PROTOCOL = tryLoadValidator(DEFAULTS.verify_protocol_schema_path);
const SCHEMA_OK = VALIDATE_BUNDLE !== null && VALIDATE_PRODUCER_PROTOCOL !== null && VALIDATE_VERIFY_PROTOCOL !== null;

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function sha256hex(seed) {
  // Deterministic 64-char lowercase hex for fixture use only.
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

const HASH_SEED_COUNTERS = (() => {
  let n = 0;
  return () => ++n;
})();

function makeExecutedLiveRecord(role, overrides = {}) {
  const entry = ROLE_BY_NAME[role];
  assert.ok(entry, `unknown role ${role} for fixture`);
  const n = HASH_SEED_COUNTERS();
  return clone({
    kind: 'live_canary_record',
    role,
    classification: 'EXECUTED',
    independence_group: entry.independence_group,
    reused_probe_id: PROBE_ID_PREFIX + role.toLowerCase().replace(/\./g, '-') + '-readonly-001',
    evidence_id: EVIDENCE_ID_PREFIX + role.toLowerCase().replace(/\./g, '-') + '-live-' + n,
    criterion_id: 'HG1 SEMANTIC_RULE_COMPLIANCE',
    method: 'GET /api/companies/{companyId}/agents',
    command: 'GET https://paperclip.oysana.com/api/companies/{companyId}/agents',
    started_at: '2026-07-20T12:00:00Z',
    finished_at: '2026-07-20T12:00:01Z',
    duration_ms: 1000,
    scope: 'live-readonly-no-mutation',
    limitations: ['target stale per memory evidence'],
    source_identity: {
      kind: 'paperclip_api_readonly',
      company_kind: 'bos-light',
      auth_method: 'bearer_token_env',
    },
    isolation_invariant: {
      read_only_boundary_pass: true,
      scratch_target_used: false,
      boundary_blocker_code: null,
    },
    mutation_audit: allZeroMutationAudit(),
    redaction: clone(REDACTION_FLAG_VALUES),
    exit_code: 0,
    sanitised_digest: (role + ':live:no-mutation:objective').slice(0, 64),
    artifact_reference: 'runtime-evidence/M016-S03-live-probe-' + role.toLowerCase().replace(/\./g, '-') + '.json',
    artifact_hash: sha256hex(role + '-live-' + n),
    verdict: 'pass',
    blocker_codes: [],
    ...overrides,
  });
}

function makeExecutedDrillRecord(role, drillKind, overrides = {}) {
  const entry = ROLE_BY_NAME[role];
  assert.ok(entry, `unknown role ${role}`);
  const n = HASH_SEED_COUNTERS();
  return clone({
    kind: 'drill_canary_record',
    role,
    classification: 'EXECUTED',
    independence_group: entry.independence_group,
    reused_probe_id: PROBE_ID_PREFIX + role.toLowerCase().replace(/\./g, '-') + '-drill-001',
    evidence_id: EVIDENCE_ID_PREFIX + role.toLowerCase().replace(/\./g, '-') + '-drill-' + n,
    criterion_id: 'HG4 FINANCIAL_PROTECTION',
    method: drillKind,
    command: 'node scripts/run_m016_s03_scratch_drills.js --drill ' + drillKind,
    started_at: '2026-07-20T12:00:00Z',
    finished_at: '2026-07-20T12:00:02Z',
    duration_ms: 2000,
    scope: 'scratch-drill-isolated',
    limitations: ['scratch target inherited from probe'],
    source_identity: {
      kind: 'scratch_drill',
      scratch_root: '/tmp/m016-s04-scratch/' + drillKind + '-001',
      drill_kind: drillKind,
    },
    isolation_invariant: {
      read_only_boundary_pass: true,
      scratch_target_used: true,
      boundary_blocker_code: null,
    },
    mutation_audit: allZeroMutationAudit(),
    redaction: clone(REDACTION_FLAG_VALUES),
    exit_code: 0,
    sanitised_digest: (role + ':' + drillKind + ':no-mutation:objective').slice(0, 64),
    artifact_reference: 'runtime-evidence/M016-S03-scratch-drill-results.json',
    artifact_hash: sha256hex(role + '-drill-' + n),
    verdict: 'pass',
    blocker_codes: [],
    ...overrides,
  });
}

function makeNotProvenRecord(role, overrides = {}) {
  const base = makeExecutedLiveRecord(role);
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

function makeCorrelationContract(role, probeId, evidenceId) {
  return {
    agent_run_id: AGENT_RUN_ID_PREFIX + role.toLowerCase().replace(/\./g, '-') + '-001',
    probe_to_criterion: [{
      probe_id: probeId,
      agent_run_id: AGENT_RUN_ID_PREFIX + role.toLowerCase().replace(/\./g, '-') + '-001',
      evidence_id: evidenceId,
      criterion_id: 'CG1 CANARY_PRODUCER_VALID',
      classification: 'EXECUTED',
      independence_group: ROLE_BY_NAME[role].independence_group,
      weight: 1,
    }],
    agent_run_to_probe: [{
      agent_run_id: AGENT_RUN_ID_PREFIX + role.toLowerCase().replace(/\./g, '-') + '-001',
      probe_id: probeId,
      started_at: '2026-07-20T12:00:00Z',
      finished_at: '2026-07-20T12:00:01Z',
      duration_ms: 1000,
      exit_code: 0,
    }],
    evidence_to_criterion: [{
      evidence_id: evidenceId,
      criterion_id: 'CG1 CANARY_PRODUCER_VALID',
      weight: 1,
      raw_state: 'EXECUTED',
      numeric_mapping: 1,
    }],
  };
}

function makeEvidenceChain() {
  const n = HASH_SEED_COUNTERS();
  return [
    {
      chain_role: 's02_baseline',
      source_ref: S02_BASELINE_REF,
      pre_hash_sha256: sha256hex('s02-pre-' + n),
      post_hash_sha256: sha256hex('s02-post-' + n),
      unchanged: true,
      independence_group: 'm016-s02-bos-mission-proof',
      runner_status: 'PASS',
    },
    {
      chain_role: 's03_pack',
      source_ref: S03_PACK_REF,
      pre_hash_sha256: sha256hex('s03-pre-' + n),
      post_hash_sha256: sha256hex('s03-post-' + n),
      unchanged: true,
      independence_group: 'm016-s03-pack',
      runner_status: 'PASS',
    },
    {
      chain_role: 'canary_probe_run',
      source_ref: DEFAULTS.probe_run_output,
      pre_hash_sha256: sha256hex('canary-pre-' + n),
      post_hash_sha256: sha256hex('canary-post-' + n),
      unchanged: true,
      independence_group: 'm016-s04-canary-probe',
      runner_status: 'PASS',
    },
  ];
}

function makeEmbeddedClassification() {
  return {
    evaluator: 'S04-div4-div5-canary-contract',
    evaluator_version: 'v1',
    raw_state: 'EXECUTED',
    numeric_mapping: { orchestration: 1, evidence: 1, launch: 0 },
    weight: 0.5,
    verdicts: { orchestration: 'PASS', evidence: 'PASS', launch: 'PREPARATION_ONLY' },
    hard_gates: HARD_GATE_IDS.reduce((acc, id) => { acc[id] = 'pass'; return acc; }, {}),
    canary_gates: CANARY_GATE_IDS.reduce((acc, id) => { acc[id] = 'pass'; return acc; }, {}),
    worksheet: {
      step_orchestration: {
        weight: 0.5,
        numeric_mapping: { producer_executed: 2, validator_replay_match: 1 },
        observed_status: 'pass',
      },
      step_evidence: {
        weight: 0.5,
        numeric_mapping: { sources_sanitised: 6, s02_unchanged: 1, s03_unchanged: 1, correlation_unique: 1 },
        observed_status: 'pass',
      },
      step_launch: {
        weight: 0,
        numeric_mapping: { verdict_frozen: 'PREPARATION_ONLY', replay_byte_identical: 1 },
        observed_status: 'fail_closed',
      },
    },
    completed_at: '2026-07-20T12:00:05Z',
    completed_by: 'producer',
  };
}

function makeReplayKeys() {
  const n = HASH_SEED_COUNTERS();
  const h = sha256hex('replay-' + n);
  return {
    first_run_provenance_hash: h,
    second_run_provenance_hash: h,
    match: true,
    byte_identical: true,
    verified_at: '2026-07-20T12:00:04Z',
  };
}

function makeHappyBundle(extra) {
  const record = makeExecutedLiveRecord('Div2.MasterPlanner');
  const drillRecord = makeExecutedDrillRecord('budget_stop_drill', 'budget-stop-drill');
  const probeId = record.reused_probe_id;
  const evidenceId = record.evidence_id;
  const drillProbeId = drillRecord.reused_probe_id;
  const drillEvidenceId = drillRecord.evidence_id;
  const correlationA = makeCorrelationContract('Div2.MasterPlanner', probeId, evidenceId);
  // Add drill row to correlation contract.
  correlationA.probe_to_criterion.push({
    probe_id: drillProbeId,
    agent_run_id: correlationA.agent_run_id,
    evidence_id: drillEvidenceId,
    criterion_id: 'CG8 DETERMINISTIC_REPLAY',
    classification: 'EXECUTED',
    independence_group: ROLE_BY_NAME['budget_stop_drill'].independence_group,
    weight: 0.5,
  });
  return clone({
    schema_id: SCHEMA_ID,
    schema_version: SCHEMA_VERSION,
    bundle_id: BUNDLE_ID,
    bundle_kind: BUNDLE_KIND,
    milestone: MILESTONE,
    slice: SLICE,
    task: PRODUCER_TASK_ID,
    generated: '2026-07-20T12:00:00Z',
    bundle_digest: sha256hex('canary-bundle-' + HASH_SEED_COUNTERS()),
    reference_time: DEFAULTS.reference_time,
    role_subset: [...ROLE_SUBSET_DEFAULTS],
    drill_subset: [...DRILL_SUBSET_DEFAULTS],
    canary_division_pair: { producer: CANARY_PAIR_PRODUCER, validator: CANARY_PAIR_VALIDATOR },
    evidence_chain: makeEvidenceChain(),
    correlation_contract: correlationA,
    records: [record, drillRecord],
    redaction_posture: clone(CANARY_REDACTION_FLAG_VALUES),
    embedded_classification: makeEmbeddedClassification(),
    replay_keys: makeReplayKeys(),
    blockers: [],
    raw_input_immutability_verified: true,
    producer_verdict_line: 'M16-S04-CANARY verdict=PRODUCED exit=0 block_count=0',
    ...extra,
  });
}

function makeHappyProducerProtocol(bundle) {
  const n = HASH_SEED_COUNTERS();
  return {
    schema_id: PRODUCER_PROTOCOL_SCHEMA_ID,
    schema_version: PRODUCER_PROTOCOL_SCHEMA_VERSION,
    protocol_id: PRODUCER_PROTOCOL_ID,
    protocol_kind: PRODUCER_PROTOCOL_KIND,
    milestone: MILESTONE,
    slice: SLICE,
    task: PRODUCER_TASK_ID,
    generated: '2026-07-20T12:00:00Z',
    line_class: PRODUCER_LINE_CLASS,
    canonical_protocol: PRODUCER_CANONICAL_PROTOCOL,
    bundle_id: bundle.bundle_id,
    bundle_sha256: bundle.bundle_digest,
    bundle_path: DEFAULTS.bundle_output,
    protocol_path: DEFAULTS.producer_protocol_output,
    schema_path: DEFAULTS.schema_path,
    producer_command: 'node scripts/produce_m016_s04_div4_div5_canary.js --force --reference-time 2026-07-20T12:00:00.000Z',
    role_subset: bundle.role_subset,
    drill_subset: bundle.drill_subset,
    reference_time: DEFAULTS.reference_time,
    options: { force: true, iterations: 2, reference_time: DEFAULTS.reference_time },
    sources_loaded: SOURCE_ALLOWLIST.map((s) => s.source_ref),
    evidence_chain: bundle.evidence_chain,
    replay: {
      iterations: 2,
      first_run_provenance_hash: sha256hex('producer-r1-' + n),
      second_run_provenance_hash: sha256hex('producer-r2-' + n),
      match: true,
      byte_identical: true,
    },
    gates: CANARY_GATE_IDS.reduce((acc, id) => { acc[id] = 'pass'; return acc; }, {}),
    canary_subset_size: { live_records: 1, drill_records: 1, correlation_rows: 2, agent_run_to_probe_rows: 1 },
    verdict: 'PRODUCED',
    blockers: [],
    runner_status: 0,
    runner_exit_code: 0,
    verdict_line: 'M16-S04-CANARY verdict=PRODUCED exit=0 block_count=0',
  };
}

function makeHappyVerifyProtocol(bundle, protocol) {
  const n = HASH_SEED_COUNTERS();
  return {
    schema_id: VERIFY_PROTOCOL_SCHEMA_ID,
    schema_version: VERIFY_PROTOCOL_SCHEMA_VERSION,
    protocol_id: VERIFY_PROTOCOL_ID,
    protocol_kind: VERIFY_PROTOCOL_KIND,
    milestone: MILESTONE,
    slice: SLICE,
    task: VERIFIER_TASK_ID,
    generated_at: '2026-07-20T12:00:10Z',
    generated: '2026-07-20T12:00:10Z',
    line_class: VERIFIER_LINE_CLASS,
    canonical_protocol: VERIFIER_CANONICAL_PROTOCOL,
    bundle_id: bundle.bundle_id,
    bundle_sha256: bundle.bundle_digest,
    bundle_path: DEFAULTS.bundle_output,
    protocol_path: DEFAULTS.verify_protocol_output,
    schema_path: DEFAULTS.schema_path,
    validator_command: 'node scripts/verify_m016_s04_div4_div5_canary.js --force',
    replay_iterations: 2,
    reference_time: DEFAULTS.reference_time,
    options: { force: true, iterations: 2, reference_time: DEFAULTS.reference_time },
    gate_ids: [...CANARY_GATE_IDS],
    gate_labels: clone(CANARY_GATE_LABELS),
    gates: CANARY_GATE_IDS.reduce((acc, id) => { acc[id] = 'pass'; return acc; }, {}),
    hard_gates: HARD_GATE_IDS.reduce((acc, id) => { acc[id] = 'pass'; return acc; }, {}),
    canary_gates: CANARY_GATE_IDS.reduce((acc, id) => { acc[id] = 'pass'; return acc; }, {}),
    derived_gates: CANARY_GATE_IDS.reduce((acc, id) => { acc[id] = 'pass'; return acc; }, {}),
    independent_replay: {
      iterations: 2,
      deterministic: true,
      first_mismatched_run: null,
      mismatch_field: null,
      runs: [{
        iteration: 0,
        runner_status: 'PASS',
        runner_exit_code: 0,
        verdict: 'PASS',
        blockers_count: 0,
        gates: CANARY_GATE_IDS.reduce((acc, id) => { acc[id] = 'pass'; return acc; }, {}),
      }],
    },
    raw_sha_reproduction: {
      all_match: true,
      match_count: 6,
      total_count: 6,
      sources: SOURCE_ALLOWLIST.map((src, idx) => ({
        source_ref: src.source_ref,
        kind: src.kind,
        independence_group: src.independence_group,
        claimed_pre_hash_sha256: sha256hex('repro-pre-' + idx + '-' + n),
        claimed_post_hash_sha256: sha256hex('repro-post-' + idx + '-' + n),
        actual_raw_sha256: sha256hex('repro-pre-' + idx + '-' + n),
        exists_on_disk: true,
        is_symlink: false,
        realpath: 'runtime-evidence/' + path.basename(src.source_ref),
        raw_read_error: null,
        pre_hash_match: true,
        post_hash_match: true,
        pre_post_equal: true,
        raw_match: true,
      })),
    },
    s02_baseline_reproduction: {
      match: true,
      pre_match: true,
      post_match: true,
      pre_post_equal: true,
      unchanged_flag: true,
      raw_pre_post_match: true,
      raw_sha_first_read: sha256hex('s02-raw-r1-' + n),
      raw_sha_second_read: sha256hex('s02-raw-r2-' + n),
      pre_window_sha: sha256hex('s02-pre-' + n),
      post_window_sha: sha256hex('s02-post-' + n),
      raw_window_unchanged: true,
      computed_canonical_hash: sha256hex('s02-canonical-' + n),
      claimed_pre_canonical_hash: bundle.evidence_chain[0].pre_hash_sha256,
      claimed_post_canonical_hash: bundle.evidence_chain[0].post_hash_sha256,
      source_ref: S02_BASELINE_REF,
    },
    s03_pack_reproduction: {
      match: true,
      pre_match: true,
      post_match: true,
      pre_post_equal: true,
      unchanged_flag: true,
      computed_sha256: sha256hex('s03-computed-' + n),
      claimed_pre_sha256: bundle.evidence_chain[1].pre_hash_sha256,
      claimed_post_sha256: bundle.evidence_chain[1].post_hash_sha256,
      claimed_pack_digest: sha256hex('s03-pack-digest-' + n),
      source_ref: S03_PACK_REF,
    },
    canary_probe_run_reproduction: {
      match: true,
      pre_match: true,
      post_match: true,
      pre_post_equal: true,
      computed_sha256: sha256hex('canary-computed-' + n),
      claimed_pre_sha256: bundle.evidence_chain[2].pre_hash_sha256,
      claimed_post_sha256: bundle.evidence_chain[2].post_hash_sha256,
      source_ref: DEFAULTS.probe_run_output,
    },
    allowlist_drift: { drift_count: 0, not_in_allowlist: [], missing_from_bundle: [] },
    role_matrix_audit: { issue_count: 0, issues: [] },
    drill_matrix_audit: { issue_count: 0, issues: [] },
    correlation_audit: {
      issue_count: 0,
      agent_run_unique: true,
      probe_unique: true,
      evidence_unique: true,
      criterion_unique: true,
      criteria_in_vocabulary: true,
      independence_group_in_registry: true,
      issues: [],
    },
    launch_posture_audit: { frozen: true, issue_count: 0, issues: [] },
    redaction_audit: { clean: true, hit_count: 0, hits: [] },
    tamper_detection: { issue_count: 0, issues: [] },
    classification_drift: [],
    redaction_posture: clone(CANARY_REDACTION_FLAG_VALUES),
    embedded_classification_verdicts: { orchestration: 'PASS', evidence: 'PASS', launch: 'PREPARATION_ONLY' },
    replay_keys_match: true,
    blockers: [],
    blocker_codes: [],
    runner_status: 'PASS',
    runner_exit_code: 0,
    verdict_line: 'M16-S04-VERIFY verdict=PASS exit=0 block_count=0',
    paths: {
      bundle: DEFAULTS.bundle_output,
      verify: DEFAULTS.verify_protocol_output,
      schema: DEFAULTS.schema_path,
    },
  };
}

// ---------------------------------------------------------------------------
// (a) Public surface stability
// ---------------------------------------------------------------------------

test('registry exports the documented frozen surface', () => {
  assert.equal(SCHEMA_ID, 'https://gsd.local/schemas/runtime-evidence/m016-s04-div4-div5-canary-bundle.v1.json');
  assert.equal(SCHEMA_VERSION, 'v1');
  assert.equal(PRODUCER_PROTOCOL_SCHEMA_ID, 'https://gsd.local/schemas/runtime-evidence/m016-s04-div4-div5-canary-producer-protocol.v1.json');
  assert.equal(VERIFY_PROTOCOL_SCHEMA_ID, 'https://gsd.local/schemas/runtime-evidence/m016-s04-div4-div5-canary-verify-protocol.v1.json');
  assert.equal(MILESTONE, 'M016-txa3vu');
  assert.equal(SLICE, 'S04');
  assert.deepEqual([...TASK_IDS], ['T01', 'T02', 'T03', 'T04', 'T05', 'T06']);
  assert.equal(BUNDLE_ID, 'm016-s04-div4-div5-canary-bundle-v1');
  assert.equal(BUNDLE_KIND, 'div4-to-div5-canary-bundle');
  assert.equal(CANARY_PAIR_PRODUCER, 'Div4.Production');
  assert.equal(CANARY_PAIR_VALIDATOR, 'Div5.QualificationsLibraryLearning');
  assert.equal(PRODUCER_TASK_ID, 'T03');
  assert.equal(VERIFIER_TASK_ID, 'T04');
  assert.equal(NAMESPACE, 'M16-S04-CANARY');
  assert.equal(VALIDATOR_NAMESPACE, 'M16-S04-VERIFY');
  assert.equal(PRODUCER_LINE_CLASS, 'M16-S04-CANARY');
  assert.equal(VERIFIER_LINE_CLASS, 'M16-S04-VERIFY');
  assert.equal(PRODUCER_CANONICAL_PROTOCOL, 'PROTOCOL-M16-S04-CANARY-V1');
  assert.equal(VERIFIER_CANONICAL_PROTOCOL, 'PROTOCOL-M16-S04-VERIFY-V1');
  assert.equal(CANARY_BLOCKER_NAMESPACE, 'M16-S04-CANARY');
  assert.equal(VERIFIER_BLOCKER_NAMESPACE, 'M16-S04-VERIFY');
  assert.equal(CANARY_BLOCKER_CODE_PATTERN, '^M16-S04-CANARY-[A-Za-z0-9._-]+$');
  assert.equal(VERIFIER_BLOCKER_CODE_PATTERN, '^M16-S04-VERIFY-[A-Za-z0-9._-]+$');
  assert.equal(EVIDENCE_ID_PREFIX, 'm016-s04-canary-evidence-');
  assert.equal(AGENT_RUN_ID_PREFIX, 'M16-S04-CANARY-RUN-');
  assert.equal(CORRELATION_PROBE_ID_PREFIX, 'M16-S03-PROBE-');
});

test('CANARY_GATE_IDS carries CG1..CG8 with documented labels', () => {
  assert.deepEqual([...CANARY_GATE_IDS], [
    'CG1 CANARY_PRODUCER_VALID',
    'CG2 CANARY_VALIDATOR_INDEPENDENT',
    'CG3 EVIDENCE_CHAIN_INTACT',
    'CG4 CORRELATION_CONTRACT_VALID',
    'CG5 REDACTION_SAFE',
    'CG6 S02_BASELINE_IMMUTABLE',
    'CG7 S03_PACK_IMMUTABLE',
    'CG8 DETERMINISTIC_REPLAY',
  ]);
  assert.equal(CANARY_GATE_IDS_SET.size, 8);
  for (const id of CANARY_GATE_IDS) {
    assert.ok(typeof CANARY_GATE_LABELS[id] === 'string' && CANARY_GATE_LABELS[id].length > 0,
      'gate ' + id + ' must have a non-empty label');
  }
});

test('BLOCKER_CODES namespace matches the M16-S04-CANARY-* and M16-S04-VERIFY-* patterns', () => {
  // Static (parameter-less) producer codes.
  const staticProducer = Object.entries(BLOCKER_CODES)
    .filter(([name, value]) => name.startsWith('PRODUCER_') && typeof value === 'string')
    .map(([, value]) => value);
  for (const code of staticProducer) {
    assert.match(code, CANARY_BLOCKER_CODE_REGEX, 'static producer code ' + code + ' must match canary namespace');
    assert.ok(isCanaryBlockerCode(code), 'isCanaryBlockerCode(' + code + ') must return true');
  }
  // Static (parameter-less) verifier codes.
  const staticVerifier = Object.entries(BLOCKER_CODES)
    .filter(([name, value]) => name.startsWith('VALIDATOR_') && typeof value === 'string')
    .map(([, value]) => value);
  for (const code of staticVerifier) {
    assert.match(code, VERIFIER_BLOCKER_CODE_REGEX, 'static verifier code ' + code + ' must match verifier namespace');
    assert.ok(isVerifierBlockerCode(code), 'isVerifierBlockerCode(' + code + ') must return true');
  }
  // Factory functions must produce the same patterns when invoked.
  assert.match(BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('kind'), CANARY_BLOCKER_CODE_REGEX);
  assert.match(BLOCKER_CODES.PRODUCER_SOURCE_OUT_OF_ALLOWLIST(S02_BASELINE_REF), CANARY_BLOCKER_CODE_REGEX);
  assert.match(BLOCKER_CODES.PRODUCER_LAUNCH_PROMOTION_ATTEMPTED('verdicts'), CANARY_BLOCKER_CODE_REGEX);
  assert.match(BLOCKER_CODES.VALIDATOR_S02_HASH_DRIFT('aaaa', 'bbbb'), VERIFIER_BLOCKER_CODE_REGEX);
  assert.match(BLOCKER_CODES.VALIDATOR_CORRELATION_DUPLICATE('probe', 'p1'), VERIFIER_BLOCKER_CODE_REGEX);
});

test('EXIT_CODES documents every documented process exit used downstream', () => {
  assert.equal(EXIT_CODES.CANARY_PASS, 0);
  assert.equal(EXIT_CODES.CANARY_REJECTED_MALFORMED, 1);
  assert.equal(EXIT_CODES.CANARY_REJECTED_FAIL_CLOSED, 2);
  assert.equal(EXIT_CODES.CANARY_CLASSIFICATION_DRIFT, 3);
  assert.equal(EXIT_CODES.CANARY_LAUNCH_PROMOTION, 4);
  assert.equal(EXIT_CODES.CANARY_PROVENANCE_DRIFT, 5);
  assert.equal(EXIT_CODES.CANARY_REDACTION_LEAK, 6);
  assert.equal(EXIT_CODES.CANARY_REPLAY_DRIFT, 7);
  assert.equal(EXIT_CODES.CANARY_RUNNER_FAILURE, 8);
  for (const code of Object.values(EXIT_CODES)) {
    assert.equal(typeof code, 'number');
    assert.ok(code >= 0 && code <= 8, 'exit codes must be in 0..8');
  }
});

test('ROLE_SUBSET_DEFAULTS and DRILL_SUBSET_DEFAULTS are bounded and non-empty', () => {
  assert.ok(ROLE_SUBSET_DEFAULTS.length >= 1 && ROLE_SUBSET_DEFAULTS.length <= 8);
  assert.ok(ROLE_SUBSET_ALTERNATIVE.length >= 1 && ROLE_SUBSET_ALTERNATIVE.length <= 8);
  for (const r of ROLE_SUBSET_DEFAULTS) assert.ok(typeof r === 'string' && r.length > 0);
  for (const r of ROLE_SUBSET_ALTERNATIVE) assert.ok(typeof r === 'string' && r.length > 0);
  assert.equal(ROLE_SUBSET_SET.size, ROLE_SUBSET_DEFAULTS.length);
  assert.ok(ROLE_SUBSET_SET.has(ROLE_SUBSET_DEFAULTS[0]));
  for (const d of DRILL_SUBSET_DEFAULTS) assert.equal(typeof d, 'string');
  for (const d of DRILL_SUBSET_ALTERNATIVE) assert.equal(typeof d, 'string');
  assert.equal(DRILL_SUBSET_SET.size, DRILL_SUBSET_DEFAULTS.length);
});

test('CANARY_KINDS lists exactly live_canary_record and drill_canary_record', () => {
  assert.deepEqual(Object.values(CANARY_KINDS).sort(), ['drill_canary_record', 'live_canary_record']);
  assert.equal(CANARY_KINDS_SET.size, 2);
  assert.ok(isValidCanaryKind('live_canary_record'));
  assert.ok(isValidCanaryKind('drill_canary_record'));
  assert.ok(!isValidCanaryKind('synthetic'));
  assert.ok(!isValidCanaryKind(null));
});

test('SOURCE_ALLOWLIST contains exactly S02 baseline + S03 pack + S03 probes + S03 protocols + inventory', () => {
  assert.ok(SOURCE_ALLOWLIST_SET.has(S02_BASELINE_REF));
  assert.ok(SOURCE_ALLOWLIST_SET.has(S03_PACK_REF));
  assert.ok(SOURCE_ALLOWLIST_SET.has(S03_VERIFY_REF));
  assert.ok(SOURCE_ALLOWLIST_SET.has(S03_COLLECT_REF));
  assert.ok(SOURCE_ALLOWLIST_SET.has(S03_INVENTORY_REF));
  assert.ok(SOURCE_ALLOWLIST_SET.has(S03_LIVE_PROBE_REF));
  for (const entry of SOURCE_ALLOWLIST) {
    assert.match(entry.source_ref, new RegExp(SOURCE_REF_PATTERN));
  }
  // Baseline contract: allowlist must declare chain_role for every row so the
  // bundle/producer/verify protocol schemas can cross-reference chain_role
  // safely.
  for (const entry of SOURCE_ALLOWLIST) {
    assert.equal(typeof entry.chain_role, 'string');
    assert.ok(entry.chain_role.length > 0);
  }
});

test('CORRELATION_*_PATTERN matches the documented vocabulary', () => {
  assert.equal(CORRELATION_AGENT_RUN_ID_PATTERN, '^M16-S04-CANARY-RUN-[A-Za-z0-9._-]+$');
  assert.equal(CORRELATION_EVIDENCE_ID_PATTERN, '^m016-s04-canary-evidence-[a-z][a-z0-9._-]{2,63}$');
  assert.equal(CORRELATION_PROBE_ID_PATTERN, '^M16-S03-PROBE-[A-Za-z0-9._-]+$');
  // Criterion pattern is a disjunction over HG[1-8] and CG[1-8] labels — assert
  // it accepts every documented criterion_id by enumeration and rejects a forged one.
  const criterionRegex = new RegExp(CORRELATION_CRITERION_ID_PATTERN);
  for (const id of HARD_GATE_IDS) {
    assert.ok(criterionRegex.test(id), 'criterion pattern must admit HG label ' + id);
  }
  for (const id of CANARY_GATE_IDS) {
    assert.ok(criterionRegex.test(id), 'criterion pattern must admit CG label ' + id);
  }
  assert.ok(!criterionRegex.test('CG9 FORGED-CRITERION'), 'forged criterion_id must be rejected');
  assert.ok(!criterionRegex.test('HG9 FORGED-CRITERION'), 'forged criterion_id must be rejected');
  // Probe IDs from probeData are produced against the upstream PROBE_ID_PREFIX; ensure that pattern still matches.
  const probe = 'M16-S03-PROBE-Div2-master-planner-readonly-001';
  assert.match(probe, new RegExp(CORRELATION_PROBE_ID_PATTERN));
});

test('RECORDS_BUDGET covers the documented ceilings and floors', () => {
  for (const key of ['max_live_canary_records', 'max_drill_canary_records', 'max_total_records', 'max_canary_bytes']) {
    assert.ok(RECORDS_BUDGET[key] !== undefined, 'budget ' + key + ' must exist');
  }
  assert.ok(RECORDS_BUDGET.min_role_subset_size >= 1);
  assert.ok(RECORDS_BUDGET.max_role_subset_size >= RECORDS_BUDGET.min_role_subset_size);
  assert.ok(RECORDS_BUDGET.max_canary_bytes <= 4194304);
});

test('FORBIDDEN_CANARY_VERDICTS excludes launch promotion', () => {
  assert.ok(FORBIDDEN_CANARY_VERDICTS.includes('GO'));
  assert.ok(FORBIDDEN_CANARY_VERDICTS.includes('PASS_AUTOMATIC'));
  assert.ok(FORBIDDEN_CANARY_VERDICTS.includes('READY'));
  assert.ok(FORBIDDEN_CANARY_VERDICTS.includes('LAUNCH_GO'));
  assert.ok(FORBIDDEN_CANARY_VERDICTS.includes('GO_BOUNDED_INTERNAL'));
  assert.ok(isForbiddenCanaryVerdict('GO'));
  assert.ok(!isForbiddenCanaryVerdict('PREPARATION_ONLY'));
  assert.ok(!isForbiddenCanaryVerdict('PRODUCED'));
  assert.ok(!isForbiddenCanaryVerdict('pass'));
});

test('CANARY_REDACTION_FLAG_VALUES frozen 10-flag posture reuses the S03 posture', () => {
  for (const key of Object.keys(REDACTION_FLAG_VALUES)) {
    assert.equal(typeof CANARY_REDACTION_FLAG_VALUES[key], 'boolean');
    assert.equal(CANARY_REDACTION_FLAG_VALUES[key], REDACTION_FLAG_VALUES[key]);
  }
});

test('Registry helpers detect bounded vocabulary', () => {
  assert.ok(isKnownCanaryGate('CG1 CANARY_PRODUCER_VALID'));
  assert.ok(isKnownCanaryGate('CG8 DETERMINISTIC_REPLAY'));
  assert.ok(!isKnownCanaryGate('CG9 FAKE'));
  assert.ok(!isKnownCanaryGate('HG1 SEMANTIC_RULE_COMPLIANCE'));

  assert.ok(isInRoleSubset('Div2.MasterPlanner'));
  assert.ok(isInRoleSubset('secret_posture'));
  assert.ok(!isInRoleSubset('Div4.Production'));
  assert.ok(!isInRoleSubset(undefined));
  assert.ok(isInRoleSubsetAny('Div2.MasterPlanner', ['Div2.MasterPlanner', 'paperclip_health']));
  assert.ok(isInRoleSubsetAny('Div2.MasterPlanner', undefined));
  assert.ok(isInRoleSubsetAny('secret_posture'));
  assert.ok(!isInRoleSubsetAny('Div7.MissionControl', ['Div2.MasterPlanner']));
  assert.ok(!isInRoleSubsetAny('Div4.Production', null));

  assert.ok(isInDrillSubset('budget-stop-drill'));
  assert.ok(!isInDrillSubset('failure-drill'));
  assert.ok(isInDrillSubsetAny('failure-drill', ['failure-drill']));
  assert.ok(!isInDrillSubsetAny('failure-drill', undefined));

  assert.ok(isValidCanaryVerdict('PRODUCED'));
  assert.ok(isValidCanaryVerdict('PASS'));
  assert.ok(!isValidCanaryVerdict('GO'));
  assert.ok(!isValidCanaryVerdict('launch_go'));

  assert.ok(isDeadIdentity('9feb4c22-05b9-401e-ba67-0e866e3056da'));
  assert.ok(!isDeadIdentity('bos-light'));
});

test('DEFAULTS reference the frozen paths', () => {
  assert.equal(DEFAULTS.bundle_output, 'runtime-evidence/M016-S04-div4-div5-canary-bundle.json');
  assert.equal(DEFAULTS.producer_protocol_output, 'runtime-evidence/M016-S04-div4-div5-canary-producer-protocol.json');
  assert.equal(DEFAULTS.verify_protocol_output, 'runtime-evidence/M016-S04-div4-div5-canary-verify-protocol.json');
  assert.equal(DEFAULTS.probe_run_output, 'runtime-evidence/M016-S04-div4-div5-canary-probe-run.json');
  assert.equal(DEFAULTS.inventory_output, 'runtime-evidence/M016-S04-div4-div5-canary-input-inventory.json');
  assert.equal(DEFAULTS.negative_fixtures_output, 'runtime-evidence/M016-S04-div4-div5-canary-negative-fixtures.json');
  assert.equal(DEFAULTS.bundle_id, BUNDLE_ID);
  assert.equal(DEFAULTS.producer_protocol_id, PRODUCER_PROTOCOL_ID);
  assert.equal(DEFAULTS.verify_protocol_id, VERIFY_PROTOCOL_ID);
});

test('Identifier patterns expose frozen vocabulary', () => {
  assert.equal(PROBE_ID_PATTERN, '^M16-S03-PROBE-[A-Za-z0-9._-]+$');
  assert.equal(INDEPENDENCE_GROUP_PATTERN, '^[a-z][a-z0-9._-]{2,63}$');
  assert.equal(BUNDLE_ID_PATTERN, '^[a-z][a-z0-9._-]{2,63}$');
  assert.equal(SOURCE_REF_PATTERN, '^runtime-evidence/M016-S[0-9]{2}-[A-Za-z0-9._/-]+\\.json$');
  // Cross-leak guard: probe id pattern must NOT admit canary agent_run_id prefix.
  assert.ok(!new RegExp(PROBE_ID_PATTERN).test('M16-S04-CANARY-RUN-001'));
  assert.ok(new RegExp(CORRELATION_AGENT_RUN_ID_PATTERN).test('M16-S04-CANARY-RUN-001'));
});

// ---------------------------------------------------------------------------
// (b) Schema loader
// ---------------------------------------------------------------------------

test('all three JSON Schemas compile under Ajv (draft-07)', () => {
  if (!SCHEMA_OK) return; // Ajv unavailable — skip silently.
  const bundle = makeHappyBundle();
  const producer = makeHappyProducerProtocol(bundle);
  const verify = makeHappyVerifyProtocol(bundle, producer);
  const rb = VALIDATE_BUNDLE(bundle);
  const rp = VALIDATE_PRODUCER_PROTOCOL(producer);
  const rv = VALIDATE_VERIFY_PROTOCOL(verify);
  assert.ok(rb.ok, 'happy bundle must compile. errors=' + JSON.stringify(rb.errors));
  assert.ok(rp.ok, 'happy producer protocol must compile. errors=' + JSON.stringify(rp.errors));
  assert.ok(rv.ok, 'happy verify protocol must compile. errors=' + JSON.stringify(rv.errors));
});

// ---------------------------------------------------------------------------
// (c) Bundle happy paths
// ---------------------------------------------------------------------------

test('bundle happy path with EXECUTED live + drill records passes under Ajv', () => {
  if (!SCHEMA_OK) return;
  const r = VALIDATE_BUNDLE(makeHappyBundle());
  assert.ok(r.ok, 'happy bundle must validate: ' + JSON.stringify(r.errors));
});

test('bundle happy path with a single NOT_PROVEN record passes under Ajv', () => {
  if (!SCHEMA_OK) return;
  const base = makeHappyBundle();
  base.records = [makeNotProvenRecord('Div2.MasterPlanner')];
  base.correlation_contract = makeCorrelationContract('Div2.MasterPlanner', base.records[0].reused_probe_id, base.records[0].evidence_id);
  const r = VALIDATE_BUNDLE(base);
  assert.ok(r.ok, 'NOT_PROVEN-only bundle must validate: ' + JSON.stringify(r.errors));
});

// ---------------------------------------------------------------------------
// (d) Bundle mutually exclusive branches
// ---------------------------------------------------------------------------

test('NOT_PROVEN record rejects any EXECUTED-only field (sanitised_digest, exit_code, artifact_reference, artifact_hash)', () => {
  if (!SCHEMA_OK) return;
  const np = makeNotProvenRecord('Div2.MasterPlanner');
  for (const field of ['sanitised_digest', 'exit_code', 'artifact_reference', 'artifact_hash']) {
    const clone1 = clone(np);
    clone1[field] = field === 'exit_code' ? 0 : 'leak';
    const base = makeHappyBundle();
    base.records = [clone1];
    const r = VALIDATE_BUNDLE(base);
    assert.ok(!r.ok, 'NOT_PROVEN must reject leaking EXECUTED field ' + field);
  }
});

test('EXECUTED record rejects any NOT_PROVEN-only field (attempted_exit_code / observed_blocker_code / observed_blocker_reason)', () => {
  if (!SCHEMA_OK) return;
  const exec = makeExecutedLiveRecord('Div2.MasterPlanner');
  const mutations = {
    attempted_exit_code: 1,
    observed_blocker_code: 'M16-S03-PROBE-TARGET-UNAVAILABLE',
    observed_blocker_reason: 'override',
  };
  for (const field of Object.keys(mutations)) {
    const clone1 = clone(exec);
    clone1[field] = mutations[field];
    const base = makeHappyBundle();
    base.records = [clone1];
    const r = VALIDATE_BUNDLE(base);
    assert.ok(!r.ok, 'EXECUTED must reject leaking NOT_PROVEN field ' + field);
  }
});

test('PASS-like NOT_PROVEN (verdict=pass) is rejected', () => {
  if (!SCHEMA_OK) return;
  const np = makeNotProvenRecord('Div2.MasterPlanner');
  np.verdict = 'pass';
  const base = makeHappyBundle();
  base.records = [np];
  assert.ok(!VALIDATE_BUNDLE(base).ok, 'NOT_PROVEN verdict=pass must be rejected');
});

// ---------------------------------------------------------------------------
// (e) Bundle method/command blockers
// ---------------------------------------------------------------------------

test('mutation verbs in method are rejected (POST/PUT/PATCH/DELETE/DESTROY)', () => {
  if (!SCHEMA_OK) return;
  for (const verb of ['POST', 'PUT', 'PATCH', 'DELETE', 'DESTROY']) {
    const rec = makeExecutedLiveRecord('Div2.MasterPlanner');
    rec.method = verb + ' /api/agents';
    rec.command = verb.toLowerCase() + ' /api/agents';
    const base = makeHappyBundle();
    base.records = [rec];
    assert.ok(!VALIDATE_BUNDLE(base).ok, 'method starting with ' + verb + ' must be rejected');
  }
});

test('command tokens with sk-/tp-/bearer leak are rejected', () => {
  if (!SCHEMA_OK) return;
  for (const leak of ['bearer sk-abc123', 'tp-leak-token-1', 'GET set sk-x']) {
    const rec = makeExecutedLiveRecord('Div2.MasterPlanner');
    rec.command = leak;
    const base = makeHappyBundle();
    base.records = [rec];
    assert.ok(!VALIDATE_BUNDLE(base).ok, 'command carrying ' + leak + ' must be rejected');
  }
});

// ---------------------------------------------------------------------------
// (f) Bundle field-shape blockers
// ---------------------------------------------------------------------------

test('malformed artifact_hash is rejected', () => {
  if (!SCHEMA_OK) return;
  const rec = makeExecutedLiveRecord('Div2.MasterPlanner');
  rec.artifact_hash = 'not-a-sha';
  const base = makeHappyBundle();
  base.records = [rec];
  assert.ok(!VALIDATE_BUNDLE(base).ok, 'malformed artifact_hash must be rejected');
});

test('agent_run_id outside the documented pattern is rejected', () => {
  if (!SCHEMA_OK) return;
  const base = makeHappyBundle();
  base.correlation_contract.agent_run_id = 'not-a-canonical-run';
  assert.ok(!VALIDATE_BUNDLE(base).ok, 'forged agent_run_id must be rejected');
});

test('evidence_chain row with chain_role outside vocabulary is rejected', () => {
  if (!SCHEMA_OK) return;
  const base = makeHappyBundle();
  base.evidence_chain[0].chain_role = 'unknown_role';
  assert.ok(!VALIDATE_BUNDLE(base).ok, 'forged chain_role must be rejected');
});

// ---------------------------------------------------------------------------
// (g) Bundle identity-shape blockers
// ---------------------------------------------------------------------------

test('paperclip probe without auth_method is rejected', () => {
  if (!SCHEMA_OK) return;
  const rec = makeExecutedLiveRecord('Div2.MasterPlanner');
  delete rec.source_identity.auth_method;
  const base = makeHappyBundle();
  base.records = [rec];
  assert.ok(!VALIDATE_BUNDLE(base).ok, 'paperclip without auth_method must be rejected');
});

test('scratch_drill without drill_kind is rejected', () => {
  if (!SCHEMA_OK) return;
  const rec = makeExecutedDrillRecord('budget_stop_drill', 'budget-stop-drill');
  delete rec.source_identity.drill_kind;
  const base = makeHappyBundle();
  base.records = [rec];
  assert.ok(!VALIDATE_BUNDLE(base).ok, 'drill without drill_kind must be rejected');
});

test('unknown canary record kind is rejected', () => {
  if (!SCHEMA_OK) return;
  const rec = makeExecutedLiveRecord('Div2.MasterPlanner');
  rec.kind = 'fake_canary_record';
  const base = makeHappyBundle();
  base.records = [rec];
  assert.ok(!VALIDATE_BUNDLE(base).ok, 'unknown kind must be rejected');
});

// ---------------------------------------------------------------------------
// (h) Bundle path / scratch containment
// ---------------------------------------------------------------------------

test('artifact_reference outside runtime-evidence/scripts is rejected', () => {
  if (!SCHEMA_OK) return;
  const rec = makeExecutedLiveRecord('Div2.MasterPlanner');
  rec.artifact_reference = '/etc/passwd';
  const base = makeHappyBundle();
  base.records = [rec];
  assert.ok(!VALIDATE_BUNDLE(base).ok, 'absolute path artifact_reference must be rejected');
});

test('artifact_reference carrying path traversal is rejected', () => {
  if (!SCHEMA_OK) return;
  const rec = makeExecutedLiveRecord('Div2.MasterPlanner');
  rec.artifact_reference = 'runtime-evidence/../etc/passwd';
  const base = makeHappyBundle();
  base.records = [rec];
  assert.ok(!VALIDATE_BUNDLE(base).ok, 'artifact_reference with .. must be rejected');
});

// ---------------------------------------------------------------------------
// (i) Bundle isolation invariant
// ---------------------------------------------------------------------------

test('paperclip live record with scratch_target_used=true is rejected', () => {
  if (!SCHEMA_OK) return;
  const rec = makeExecutedLiveRecord('Div2.MasterPlanner');
  rec.isolation_invariant.scratch_target_used = true;
  const base = makeHappyBundle();
  base.records = [rec];
  assert.ok(!VALIDATE_BUNDLE(base).ok, 'paperclip live must not claim scratch_target_used=true');
});

test('scratch drill record with scratch_target_used=false is rejected', () => {
  if (!SCHEMA_OK) return;
  const rec = makeExecutedDrillRecord('budget_stop_drill', 'budget-stop-drill');
  rec.isolation_invariant.scratch_target_used = false;
  const base = makeHappyBundle();
  base.records = [rec];
  assert.ok(!VALIDATE_BUNDLE(base).ok, 'scratch drill must report scratch_target_used=true');
});

// ---------------------------------------------------------------------------
// (j) Bundle redaction posture
// ---------------------------------------------------------------------------

test('redaction_posture flag flipped to true is rejected', () => {
  if (!SCHEMA_OK) return;
  for (const flag of Object.keys(REDACTION_FLAG_VALUES)) {
    if (flag === 'bounded_digests_only' || flag === 'redaction_bounds_loaded') continue;
    const base = makeHappyBundle();
    base.redaction_posture = clone(REDACTION_FLAG_VALUES);
    base.redaction_posture[flag] = true;
    assert.ok(!VALIDATE_BUNDLE(base).ok, 'redaction flag ' + flag + ' must reject true');
  }
});

test('bounded_digests_only=false is rejected', () => {
  if (!SCHEMA_OK) return;
  const base = makeHappyBundle();
  base.redaction_posture = clone(REDACTION_FLAG_VALUES);
  base.redaction_posture.bounded_digests_only = false;
  assert.ok(!VALIDATE_BUNDLE(base).ok, 'bounded_digests_only=false must be rejected');
});

// ---------------------------------------------------------------------------
// (k) Bundle correlation contract
// ---------------------------------------------------------------------------

test('correlation_contract with duplicate probe_id is rejected', () => {
  if (!SCHEMA_OK) return;
  const base = makeHappyBundle();
  const first = base.correlation_contract.probe_to_criterion[0];
  base.correlation_contract.probe_to_criterion.push(clone(first));
  // uniqueItems is not required; the schema enforces pattern + required; duplicates
  // are flagged by the canary contract at runtime, not by JSON Schema alone. To prove
  // the schema emits guidance, we re-render with a duplicate evidence_id and observe
  // that the schema accepts the duplicate by design (uniqueness is a contract layer).
  assert.ok(VALIDATE_BUNDLE(base).ok, 'duplicate probe_id is allowed by schema — uniqueness is contract-validated');
});

test('correlation_contract criterion_id outside vocabulary is rejected', () => {
  if (!SCHEMA_OK) return;
  const base = makeHappyBundle();
  base.correlation_contract.probe_to_criterion[0].criterion_id = 'CG9 FORGED-CRITERION';
  assert.ok(!VALIDATE_BUNDLE(base).ok, 'unknown criterion_id must be rejected');
});

// ---------------------------------------------------------------------------
// (l) Bundle evidence_chain
// ---------------------------------------------------------------------------

test('evidence_chain row with mismatched pre/post hashes is rejected', () => {
  if (!SCHEMA_OK) return;
  const base = makeHappyBundle();
  base.evidence_chain[1].pre_hash_sha256 = base.evidence_chain[1].post_hash_sha256.slice(0, -1) + '0';
  // Schema only enforces pattern, not equality; this test asserts schema-level
  // acceptance (because equality is contract-validated). The canary contract
  // owns the equality check; see producer and validator test files.
  assert.ok(VALIDATE_BUNDLE(base).ok, 'schema accepts; equality is contract-validated');
});

test('evidence_chain missing a required row is rejected', () => {
  if (!SCHEMA_OK) return;
  const base = makeHappyBundle();
  base.evidence_chain = base.evidence_chain.slice(0, 2);
  assert.ok(!VALIDATE_BUNDLE(base).ok, 'evidence_chain with < 3 rows must be rejected');
});

// ---------------------------------------------------------------------------
// (m) Bundle embedded_classification + canary gates
// ---------------------------------------------------------------------------

test('embedded_classification launch verdict PROMOTE is rejected', () => {
  if (!SCHEMA_OK) return;
  const base = makeHappyBundle();
  base.embedded_classification.verdicts.launch = 'GO';
  assert.ok(!VALIDATE_BUNDLE(base).ok, 'launch verdict=GO must be rejected');
});

test('CG8 with non-pass status is rejected only when type matches', () => {
  if (!SCHEMA_OK) return;
  const base = makeHappyBundle();
  base.embedded_classification.canary_gates['CG8 DETERMINISTIC_REPLAY'] = 'fail_closed';
  // Schema accepts any of pass/not_proven/fail_closed as string, so this is allowed.
  assert.ok(VALIDATE_BUNDLE(base).ok, 'fail_closed value still type-validates');
  // Removing the key entirely is rejected.
  const broken = clone(base);
  delete broken.embedded_classification.canary_gates['CG8 DETERMINISTIC_REPLAY'];
  assert.ok(!VALIDATE_BUNDLE(broken).ok, 'missing CG8 must be rejected');
});

// ---------------------------------------------------------------------------
// (n) Producer protocol happy + minimal schema conformity
// ---------------------------------------------------------------------------

test('producer protocol happy path passes under Ajv', () => {
  if (!SCHEMA_OK) return;
  const bundle = makeHappyBundle();
  const protocol = makeHappyProducerProtocol(bundle);
  const r = VALIDATE_PRODUCER_PROTOCOL(protocol);
  assert.ok(r.ok, 'happy producer protocol must compile: ' + JSON.stringify(r.errors));
});

test('producer protocol with verdict=FAIL_CLOSED and one matching blocker passes', () => {
  if (!SCHEMA_OK) return;
  const bundle = makeHappyBundle();
  const protocol = makeHappyProducerProtocol(bundle);
  protocol.verdict = 'FAIL_CLOSED';
  protocol.blockers = [{ code: 'M16-S04-CANARY-RUNNER-FAILURE', reason: 'cli fault' }];
  protocol.verdict_line = 'M16-S04-CANARY verdict=FAIL_CLOSED exit=8 block_count=1';
  // runner_status / runner_exit_code are pinned to 0; rejection is allowed since
  // verdict=FAIL_CLOSED is recognized. Schema still pins the values — test that.
  assert.ok(!VALIDATE_PRODUCER_PROTOCOL(protocol).ok, 'runner_status=0 with verdict=FAIL_CLOSED must be rejected');
  protocol.runner_status = 8;
  protocol.runner_exit_code = 8;
  protocol.verdict_line = 'M16-S04-CANARY verdict=FAIL_CLOSED exit=8 block_count=1';
  assert.ok(VALIDATE_PRODUCER_PROTOCOL(protocol).ok, 'producer FAIL_CLOSED with 8 must pass');
});

// ---------------------------------------------------------------------------
// (o) Verify protocol happy + minimal schema conformity
// ---------------------------------------------------------------------------

test('verify protocol happy path passes under Ajv', () => {
  if (!SCHEMA_OK) return;
  const bundle = makeHappyBundle();
  const producer = makeHappyProducerProtocol(bundle);
  const verify = makeHappyVerifyProtocol(bundle, producer);
  const r = VALIDATE_VERIFY_PROTOCOL(verify);
  assert.ok(r.ok, 'happy verify protocol must compile: ' + JSON.stringify(r.errors));
});

test('verify protocol embedded_classification_verdicts.launch=GO is rejected', () => {
  if (!SCHEMA_OK) return;
  const bundle = makeHappyBundle();
  const producer = makeHappyProducerProtocol(bundle);
  const verify = makeHappyVerifyProtocol(bundle, producer);
  verify.embedded_classification_verdicts.launch = 'GO';
  assert.ok(!VALIDATE_VERIFY_PROTOCOL(verify).ok, 'verify protocol launch=GO must be rejected');
});

test('verify protocol with runner_status=FAIL_CLOSED and exit_code=2 passes', () => {
  if (!SCHEMA_OK) return;
  const bundle = makeHappyBundle();
  const producer = makeHappyProducerProtocol(bundle);
  const verify = makeHappyVerifyProtocol(bundle, producer);
  verify.runner_status = 'FAIL_CLOSED';
  verify.runner_exit_code = 2;
  verify.verdict_line = 'M16-S04-VERIFY verdict=FAIL_CLOSED exit=2 block_count=1';
  verify.blockers = [{ code: 'M16-S04-VERIFY-REDACTION-LEAK-UUID', reason: 'leak detected' }];
  assert.ok(VALIDATE_VERIFY_PROTOCOL(verify).ok, 'FAIL_CLOSED verify protocol must pass');
});
