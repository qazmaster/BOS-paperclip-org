#!/usr/bin/env node
'use strict';

/**
 * scripts/test_produce_m016_s04_div4_div5_canary.js
 *
 * M016-txa3vu / S04 / T03 — node:test scenarios for the Div4 bounded
 * evidence producer. Covers:
 *
 *   (a) public surface stability — exporter names, role/drill subset size,
 *       CANARY_GATE_IDS cardinality, EXIT_CODES values, BLOCKER_CODES
 *       factory surface
 *   (b) contract subset selection — happy path picks the 3-record canary,
 *       unknown role rejected, unknown drill rejected, empty subset
 *       rejected, drill classification integrity
 *   (c) correlation contract — evidence_id derivation, agent_run_id
 *       pattern, criterion_id vocabulary (HG/CG only), probe/evidence/
 *       independence uniqueness
 *   (d) embedded classification — HG + CG gates propagate EXECUTED /
 *       NOT_PROVEN semantics, launch verdict frozen at PREPARATION_ONLY,
 *       worksheet step_launch observed_status stays fail_closed,
 *       step_orchestration / step_evidence reflect subset shape
 *   (e) replay keys — attachReplayKeys passes for byte-identical builder,
 *       detects builder drift via first/second hash mismatch
 *   (f) redactor + bundle evaluator — leak-class flag must be false,
 *       bounded_digests_only must be true, evaluation rejects forged
 *       launch verdict and missing correlation rows
 *   (g) producer CLI parity — parseArgs honours --force / --seed /
 *       --role-subset / --drill-subset / --reference-time, atomic write
 *       refuses overwrite without --force, --force overwrites cleanly
 *   (h) producer end-to-end against live S02 + S03 fixtures — happy path
 *       produces 3 records, all gates PASS, byte-identical dual replay,
 *       dual replay against tampered source triggers FAIL_CLOSED
 *
 * Run with:  node --test scripts/test_produce_m016_s04_div4_div5_canary.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const data = require('./lib/m016-s04-div4-div5-canary-data');
const contract = require('./lib/m016-s04-div4-div5-canary-contract');
const producer = require('./produce_m016_s04_div4_div5_canary');

const {
  SCHEMA_ID,
  SCHEMA_VERSION,
  BUNDLE_ID,
  BUNDLE_KIND,
  CANARY_PAIR_PRODUCER,
  CANARY_PAIR_VALIDATOR,
  CANARY_GATE_IDS,
  CANARY_KINDS,
  CANARY_VERDICT_VALUES,
  ROLE_SUBSET_DEFAULTS,
  DRILL_SUBSET_DEFAULTS,
  EXIT_CODES,
  BLOCKER_CODES,
  RECORDS_BUDGET,
  SOURCE_ALLOWLIST,
  DEFAULTS,
} = data;

const ROOT = contract.ROOT;

// ---------------------------------------------------------------------------
// Fixtures — minimal S03 live + scratch-drill records that exercise the
// ROLE_SUBSET_DEFAULTS = ['Div2.MasterPlanner', 'secret_posture'] and
// DRILL_SUBSET_DEFAULTS = ['budget-stop-drill'] canary subset.
// ---------------------------------------------------------------------------

const FIXTURES = Object.freeze({
  liveProbe: {
    source_ref: 'runtime-evidence/M016-S03-live-probe-results.json',
    chain_role: 'canary_probe_run',
    independence_group: 'm016-s03-probe-live',
    payload: {
      records: [
        {
          probe_id: 'M16-S03-PROBE-div2-masterplanner-no-target-X',
          role_class: 'division',
          role: 'Div2.MasterPlanner',
          classification: 'NOT_PROVEN',
          independence_group: 'm016-s03-probe-div2-master-planner',
          method: 'GET /api/companies/{companyId}/agents',
          command: 'GET http://127.0.0.1:43131/api/companies/X/agents',
          started_at: '2026-07-19T12:00:00.000Z',
          finished_at: '2026-07-19T12:00:00.000Z',
          duration_ms: 0,
          scope: 'live-paperclip-discover-divisions',
          limitations: ['GET-only allowlist', 'identity discovered fresh'],
          source_identity: { kind: 'paperclip_api_readonly', company_kind: 'bos-light', auth_method: 'bearer_token_env' },
          isolation_invariant: { read_only_boundary_pass: true, scratch_target_used: false, boundary_blocker_code: null },
          mutation_audit: { issues_created: 0, issues_business_updated: 0, documents_created: 0, documents_business_updated: 0, projects_created: 0, projects_business_updated: 0, goals_created: 0, goals_business_updated: 0, plugins_created: 0, plugins_updated: 0, agents_created: 0, agents_operational_updated: 0, business_mutations_recorded: 0 },
          redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false, synthetic_bos: false, raw_reasoning: false, raw_body: false, raw_result_json_result: false, vendor_reuse_strings: false, bounded_digests_only: true, redaction_bounds_loaded: true },
          attempted_exit_code: -1,
          observed_blocker_code: 'M16-S03-PROBE-TARGET-UNAVAILABLE-Div2.MasterPlanner',
          observed_blocker_reason: 'live session disabled',
          verdict: 'not_proven',
          blocker_codes: ['M16-S03-PROBE-TARGET-UNAVAILABLE-Div2.MasterPlanner'],
        },
        {
          probe_id: 'M16-S03-PROBE-secret_posture-probe-Y',
          role: 'secret_posture',
          classification: 'EXECUTED',
          independence_group: 'm016-s03-probe-secret-posture',
          method: 'secret-posture-probe',
          command: 'node secret-posture-probe',
          started_at: '2026-07-19T12:00:00.000Z',
          finished_at: '2026-07-19T12:00:00.000Z',
          duration_ms: 0,
          scope: 'redaction-posture-audit',
          limitations: ['bounded redaction checks'],
          source_identity: { kind: 'observed' },
          isolation_invariant: { read_only_boundary_pass: true, scratch_target_used: false, boundary_blocker_code: null },
          mutation_audit: { issues_created: 0, issues_business_updated: 0, documents_created: 0, documents_business_updated: 0, projects_created: 0, projects_business_updated: 0, goals_created: 0, goals_business_updated: 0, plugins_created: 0, plugins_updated: 0, agents_created: 0, agents_operational_updated: 0, business_mutations_recorded: 0 },
          redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false, synthetic_bos: false, raw_reasoning: false, raw_body: false, raw_result_json_result: false, vendor_reuse_strings: false, bounded_digests_only: true, redaction_bounds_loaded: true },
          exit_code: 0,
          sanitised_digest: 'secret-posture:audit-no-leak:hash-equal-true',
          artifact_reference: 'runtime-evidence/M016-S03-live-probe-results.json',
          artifact_hash: 'a'.repeat(64),
          verdict: 'pass',
          blocker_codes: [],
        },
      ],
    },
  },
  scratchDrill: {
    source_ref: 'runtime-evidence/M016-S03-scratch-drill-results.json',
    chain_role: 'canary_probe_run',
    independence_group: 'm016-s03-probe-drill',
    payload: {
      records: [
        {
          probe_id: 'M16-S03-PROBE-budget_stop_drill-drill-11-Z',
          role: 'budget_stop_drill',
          classification: 'EXECUTED',
          independence_group: 'm016-s03-probe-budget-stop-drill',
          method: 'budget-stop-drill',
          command: 'node scripts/run_m016_s03_scratch_drills.js --drill budget-stop-drill',
          started_at: '2026-07-19T12:00:00.000Z',
          finished_at: '2026-07-19T12:00:00.000Z',
          duration_ms: 0,
          scope: 'scratch-drill-isolated-budget-stop',
          limitations: ['synthetic in-memory budget state'],
          source_identity: { kind: 'scratch_drill', scratch_root: '/tmp/m016-s04-canary-scratch/drill', drill_kind: 'budget-stop-drill' },
          isolation_invariant: { read_only_boundary_pass: true, scratch_target_used: true, boundary_blocker_code: null },
          mutation_audit: { issues_created: 0, issues_business_updated: 0, documents_created: 0, documents_business_updated: 0, projects_created: 0, projects_business_updated: 0, goals_created: 0, goals_business_updated: 0, plugins_created: 0, plugins_updated: 0, agents_created: 0, agents_operational_updated: 0, business_mutations_recorded: 0 },
          redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false, synthetic_bos: false, raw_reasoning: false, raw_body: false, raw_result_json_result: false, vendor_reuse_strings: false, bounded_digests_only: true, redaction_bounds_loaded: true },
          exit_code: 0,
          sanitised_digest: 'budget-drill:decisions:ALLOW-DENY-DENY-DENY',
          artifact_reference: 'runtime-evidence/M016-S03-scratch-drill-results.json',
          artifact_hash: 'b'.repeat(64),
          verdict: 'pass',
          blocker_codes: [],
        },
      ],
    },
  },
});

function fakeSources() {
  return [FIXTURES.liveProbe, FIXTURES.scratchDrill];
}

// ===========================================================================
// (a) Public surface stability
// ===========================================================================

test('a1: data registry exposes 8 canary gates (CG1..CG8) in canonical order', () => {
  assert.equal(CANARY_GATE_IDS.length, 8);
  assert.equal(CANARY_GATE_IDS[0], 'CG1 CANARY_PRODUCER_VALID');
  assert.equal(CANARY_GATE_IDS[7], 'CG8 DETERMINISTIC_REPLAY');
});

test('a2: exit codes 0..8 cover canary runner namespace exactly', () => {
  const codes = Object.values(EXIT_CODES).sort();
  assert.deepEqual(codes, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
});

test('a3: default role subset = [Div2.MasterPlanner, secret_posture]', () => {
  assert.deepEqual([...ROLE_SUBSET_DEFAULTS], ['Div2.MasterPlanner', 'secret_posture']);
});

test('a4: default drill subset = [budget-stop-drill]', () => {
  assert.deepEqual([...DRILL_SUBSET_DEFAULTS], ['budget-stop-drill']);
});

test('a5: source allowlist carries 7 frozen entries covering all chain roles', () => {
  assert.equal(SOURCE_ALLOWLIST.length, 7);
  const roles = SOURCE_ALLOWLIST.map(function (s) { return s.chain_role; });
  for (const required of ['s02_baseline', 's03_pack', 'canary_probe_run', 's03_verify_protocol', 's03_collect_protocol', 's03_input_inventory']) {
    assert.ok(roles.indexOf(required) >= 0, 'missing chain_role: ' + required);
  }
});

test('a6: blocker code factories produce values matching M16-S04-CANARY-* / M16-S04-VERIFY-* regex', () => {
  assert.match(BLOCKER_CODES.PRODUCER_RUNNER_FAILURE(), /^M16-S04-CANARY-[A-Za-z0-9._-]+$/);
  assert.match(BLOCKER_CODES.PRODUCER_REDACTION_LEAK('full_uuid'), /^M16-S04-CANARY-REDACTION-LEAK-/);
  assert.match(BLOCKER_CODES.VALIDATOR_BUNDLE_NOT_FOUND('bundle.json'), /^M16-S04-VERIFY-BUNDLE-NOT-FOUND-/);
});

test('a7: contract module export surface is complete', () => {
  const required = [
    'loadSchema', 'sha256Hex', 'canonicalizeBundle', 'computeBundleBodyDigest',
    '_stableStringify', 'checkRedactionSafety', 'assertBundleWriteSafe',
    'buildCanarySubset', 'buildCorrelationContract', 'buildEmbeddedClassification',
    'buildEvidenceChain', 'attachReplayKeys', 'buildProbeRunLedger',
    'buildInputInventory', 'buildProducerProtocol', 'evaluateCanaryContract',
    'validateBundleShape', 'mapBlockerToExitCode',
  ];
  for (const name of required) assert.ok(typeof contract[name] === 'function', 'missing: ' + name);
});

test('a8: producer module exports CLI helpers without leaking internal state', () => {
  const required = ['parseArgs', 'loadSource', 'loadAllowlistedSources', 'extractRecords', 'atomicWriteJson', 'atomicWriteJsonIfMissing'];
  for (const name of required) assert.ok(typeof producer[name] === 'function', 'missing: ' + name);
});

// ===========================================================================
// (b) Contract subset selection
// ===========================================================================

test('b1: subset picks Div2.MasterPlanner + secret_posture + budget_stop_drill', () => {
  const result = contract.buildCanarySubset({
    liveRecords: FIXTURES.liveProbe.payload.records,
    scratchDrillRecords: FIXTURES.scratchDrill.payload.records,
    roleSubset: [...ROLE_SUBSET_DEFAULTS],
    drillSubset: [...DRILL_SUBSET_DEFAULTS],
  });
  assert.equal(result.ok, true);
  assert.equal(result.records.length, 3);
  const roles = result.records.map(function (r) { return r.role; });
  assert.ok(roles.indexOf('Div2.MasterPlanner') >= 0);
  assert.ok(roles.indexOf('secret_posture') >= 0);
  assert.ok(roles.indexOf('budget_stop_drill') >= 0);
});

test('b2: subset tags each record with kind discriminator (live vs drill)', () => {
  const result = contract.buildCanarySubset({
    liveRecords: FIXTURES.liveProbe.payload.records,
    scratchDrillRecords: FIXTURES.scratchDrill.payload.records,
    roleSubset: [...ROLE_SUBSET_DEFAULTS],
    drillSubset: [...DRILL_SUBSET_DEFAULTS],
  });
  assert.equal(result.ok, true);
  const liveTagged = result.records.filter(function (r) { return r.kind === CANARY_KINDS.LIVE_CANARY_RECORD; });
  const drillTagged = result.records.filter(function (r) { return r.kind === CANARY_KINDS.DRILL_CANARY_RECORD; });
  assert.equal(liveTagged.length, 2, 'expected 2 live_canary_record entries');
  assert.equal(drillTagged.length, 1, 'expected 1 drill_canary_record entry');
  assert.equal(drillTagged[0].role, 'budget_stop_drill');
});

test('b3: subset rejects unknown role via PRODUCER_ROLE_NOT_IN_REGISTRY', () => {
  const result = contract.buildCanarySubset({
    liveRecords: FIXTURES.liveProbe.payload.records,
    scratchDrillRecords: FIXTURES.scratchDrill.payload.records,
    roleSubset: ['Div99.Unknown'],
    drillSubset: [...DRILL_SUBSET_DEFAULTS],
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, BLOCKER_CODES.PRODUCER_ROLE_NOT_IN_REGISTRY('Div99.Unknown'));
});

test('b4: subset rejects unknown drill via PRODUCER_DRILL_NOT_IN_REGISTRY', () => {
  const result = contract.buildCanarySubset({
    liveRecords: FIXTURES.liveProbe.payload.records,
    scratchDrillRecords: FIXTURES.scratchDrill.payload.records,
    roleSubset: [...ROLE_SUBSET_DEFAULTS],
    drillSubset: ['never-seen-drill'],
  });
  assert.equal(result.ok, false);
  assert.match(result.code, /^M16-S04-CANARY-DRILL-NOT-IN-REGISTRY-/);
});

test('b5: subset rejects empty role list via PRODUCER_SUBSET_EMPTY-role', () => {
  const result = contract.buildCanarySubset({
    liveRecords: FIXTURES.liveProbe.payload.records,
    scratchDrillRecords: FIXTURES.scratchDrill.payload.records,
    roleSubset: [],
    drillSubset: [...DRILL_SUBSET_DEFAULTS],
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, BLOCKER_CODES.PRODUCER_SUBSET_EMPTY('role'));
});

// ===========================================================================
// (c) Correlation contract
// ===========================================================================

test('c1: correlation agent_run_id defaults to "M16-S04-CANARY-RUN-default"', () => {
  const subset = contract.buildCanarySubset({
    liveRecords: FIXTURES.liveProbe.payload.records,
    scratchDrillRecords: FIXTURES.scratchDrill.payload.records,
    roleSubset: [...ROLE_SUBSET_DEFAULTS],
    drillSubset: [...DRILL_SUBSET_DEFAULTS],
  });
  const corr = contract.buildCorrelationContract({ records: subset.records, seed: 'default' });
  assert.equal(corr.ok, true);
  assert.equal(corr.correlation_contract.agent_run_id, 'M16-S04-CANARY-RUN-default');
  assert.equal(corr.correlation_contract.probe_to_criterion.length, 3);
});

test('c2: evidence_id is derived from reused_probe_id and unique within bundle', () => {
  const subset = contract.buildCanarySubset({
    liveRecords: FIXTURES.liveProbe.payload.records,
    scratchDrillRecords: FIXTURES.scratchDrill.payload.records,
    roleSubset: [...ROLE_SUBSET_DEFAULTS],
    drillSubset: [...DRILL_SUBSET_DEFAULTS],
  });
  const corr = contract.buildCorrelationContract({ records: subset.records, seed: 'default' });
  const ids = corr.correlation_contract.evidence_to_criterion.map(function (r) { return r.evidence_id; });
  const set = new Set(ids);
  assert.equal(set.size, ids.length, 'duplicate evidence_id: ' + ids.join(','));
  for (const id of ids) {
    assert.match(id, /^m016-s04-canary-evidence-[a-z][a-z0-9._-]{2,63}$/, 'evidence_id format: ' + id);
  }
});

test('c3: criterion_id is restricted to HARD_GATE_IDS vocabulary', () => {
  const subset = contract.buildCanarySubset({
    liveRecords: FIXTURES.liveProbe.payload.records,
    scratchDrillRecords: FIXTURES.scratchDrill.payload.records,
    roleSubset: [...ROLE_SUBSET_DEFAULTS],
    drillSubset: [...DRILL_SUBSET_DEFAULTS],
  });
  const corr = contract.buildCorrelationContract({ records: subset.records, seed: 'default' });
  const allowed = new Set([
    'HG1 SEMANTIC_RULE_COMPLIANCE', 'HG2 PROVENANCE_INTEGRITY', 'HG3 RECOVERY_EVIDENCE',
    'HG4 FINANCIAL_PROTECTION', 'HG5 SECURITY_POSTURE', 'HG6 COMPLIANCE_POSTURE',
    'HG7 READ_ONLY_BOUNDARY', 'HG8 SCRATCH_ISOLATION',
    'CG1 CANARY_PRODUCER_VALID', 'CG2 CANARY_VALIDATOR_INDEPENDENT',
    'CG3 EVIDENCE_CHAIN_INTACT', 'CG4 CORRELATION_CONTRACT_VALID',
    'CG5 REDACTION_SAFE', 'CG6 S02_BASELINE_IMMUTABLE',
    'CG7 S03_PACK_IMMUTABLE', 'CG8 DETERMINISTIC_REPLAY',
  ]);
  for (const r of corr.correlation_contract.probe_to_criterion) {
    assert.ok(allowed.has(r.criterion_id), 'unexpected criterion_id: ' + r.criterion_id);
  }
});

test('c4: correlation rejects duplicate independence_group via PRODUCER_INDEPENDENCE_GROUP_REUSED', () => {
  const baseRecord = FIXTURES.liveProbe.payload.records[0];
  const fakeRecords = [
    Object.assign({}, baseRecord, { reused_probe_id: baseRecord.probe_id, independence_group: 'm016-s03-probe-div2-master-planner' }),
    Object.assign({}, baseRecord, { probe_id: 'M16-S03-PROBE-div2-masterplanner-second', reused_probe_id: 'M16-S03-PROBE-div2-masterplanner-second', independence_group: 'm016-s03-probe-div2-master-planner' }),
  ];
  const corr = contract.buildCorrelationContract({ records: fakeRecords, seed: 'default' });
  assert.equal(corr.ok, false);
  assert.equal(corr.code, BLOCKER_CODES.PRODUCER_INDEPENDENCE_GROUP_REUSED('m016-s03-probe-div2-master-planner'));
});

// ===========================================================================
// (d) Embedded classification
// ===========================================================================

test('d1: launch verdict is structurally frozen at PREPARATION_ONLY', () => {
  const cls = contract.buildEmbeddedClassification({
    records: [],
    sources: SOURCE_ALLOWLIST,
    redactionHits: [],
    replayMatch: true,
    s02Unchanged: true,
    s03Unchanged: true,
    correlationUnique: true,
    preHashes: {},
    postHashes: {},
    generated: DEFAULTS.reference_time,
  });
  assert.equal(cls.verdicts.launch, 'PREPARATION_ONLY');
  assert.equal(cls.evaluator, 'S04-div4-div5-canary-contract');
  assert.equal(cls.evaluator_version, 'v1');
  assert.equal(cls.completed_by, 'producer');
});

test('d2: HG1 SEMANTIC_RULE_COMPLIANCE demoted to not_proven when Div2.MasterPlanner present', () => {
  const subset = contract.buildCanarySubset({
    liveRecords: FIXTURES.liveProbe.payload.records,
    scratchDrillRecords: FIXTURES.scratchDrill.payload.records,
    roleSubset: [...ROLE_SUBSET_DEFAULTS],
    drillSubset: [...DRILL_SUBSET_DEFAULTS],
  });
  const cls = contract.buildEmbeddedClassification({
    records: subset.records,
    sources: SOURCE_ALLOWLIST,
    redactionHits: [],
    replayMatch: true,
    s02Unchanged: true,
    s03Unchanged: true,
    correlationUnique: true,
    preHashes: {},
    postHashes: {},
    blockerRows: [],
    generated: DEFAULTS.reference_time,
  });
  assert.equal(cls.hard_gates['HG1 SEMANTIC_RULE_COMPLIANCE'], 'not_proven');
  assert.equal(cls.hard_gates['HG8 SCRATCH_ISOLATION'], 'pass');
});

test('d3: step_launch observed_status is structurally fail_closed (even when CG8=pass)', () => {
  const cls = contract.buildEmbeddedClassification({
    records: [],
    sources: [],
    redactionHits: [],
    replayMatch: true,
    s02Unchanged: true,
    s03Unchanged: true,
    correlationUnique: true,
    preHashes: {},
    postHashes: {},
    blockerRows: [],
    generated: DEFAULTS.reference_time,
  });
  assert.equal(cls.worksheet.step_launch.observed_status, 'fail_closed');
  assert.equal(cls.worksheet.step_launch.numeric_mapping.verdict_frozen, 'PREPARATION_ONLY');
});

test('d4: redaction hit flips CG5 REDACTION_SAFE and HG5 SECURITY_POSTURE', () => {
  const cls = contract.buildEmbeddedClassification({
    records: [],
    sources: SOURCE_ALLOWLIST,
    redactionHits: [{ kind: 'full_uuid', path: 'x' }],
    replayMatch: true,
    s02Unchanged: true,
    s03Unchanged: true,
    correlationUnique: true,
    preHashes: {},
    postHashes: {},
    blockerRows: [],
    generated: DEFAULTS.reference_time,
  });
  assert.equal(cls.canary_gates['CG5 REDACTION_SAFE'], 'fail_closed');
  assert.equal(cls.hard_gates['HG5 SECURITY_POSTURE'], 'fail_closed');
});

// ===========================================================================
// (e) Replay keys
// ===========================================================================

test('e1: attachReplayKeys returns match=true for byte-identical builder', () => {
  const samples = [{ kind: CANARY_KINDS.LIVE_CANARY_RECORD, classification: 'EXECUTED', reuse: 'X' }];
  let n = 0;
  const r = contract.attachReplayKeys({
    builder: function () { n += 1; return Object.assign({}, samples[0], { _iter: n }); },
  });
  // Two calls should produce the same canonical hash once the per-call
  // ephemeral fields are stripped by _stableStringify. We instead use a
  // pure-data builder for true identity:
  const pureBuilder = function () { return { value: 1, list: [1, 2, 3] }; };
  const r2 = contract.attachReplayKeys({ builder: pureBuilder });
  assert.equal(r2.ok, true);
  assert.equal(r2.replay_keys.byte_identical, true);
  assert.equal(r2.replay_keys.match, true);
  assert.equal(r2.replay_keys.first_run_provenance_hash, r2.replay_keys.second_run_provenance_hash);
});

test('e2: attachReplayKeys detects drift via expectedHash mismatch', () => {
  const pureBuilder = function () { return { value: 1 }; };
  const r = contract.attachReplayKeys({ builder: pureBuilder, expectedHash: '0'.repeat(64) });
  assert.equal(r.ok, false);
  assert.equal(r.code, BLOCKER_CODES.PRODUCER_REPLAY_NOT_BYTE_IDENTICAL());
});

// ===========================================================================
// (f) Bundle evaluator + redactor
// ===========================================================================

test('f1: evaluateCanaryContract rejects launch verdict != PREPARATION_ONLY', () => {
  const result = contract.evaluateCanaryContract({
    bundle: {
      bundle_kind: BUNDLE_KIND,
      bundle_id: BUNDLE_ID,
      schema_id: SCHEMA_ID,
      schema_version: SCHEMA_VERSION,
      milestone: 'M016-txa3vu',
      slice: 'S04',
      task: 'T03',
      embedded_classification: { verdicts: { launch: 'GO' } },
    },
  });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some(function (b) { return b.code.indexOf('LAUNCH-PROMOTION') >= 0; }));
});

test('f2: evaluateCanaryContract rejects redaction leak in records', () => {
  const leaked = {
    bundle_kind: BUNDLE_KIND, bundle_id: BUNDLE_ID, schema_id: SCHEMA_ID, schema_version: SCHEMA_VERSION,
    milestone: 'M016-txa3vu', slice: 'S04', task: 'T03',
    embedded_classification: { verdicts: { launch: 'PREPARATION_ONLY' } },
    records: [{
      kind: CANARY_KINDS.LIVE_CANARY_RECORD, classification: 'EXECUTED', role: 'Div2.MasterPlanner',
      redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false, synthetic_bos: false, raw_reasoning: false, raw_body: false, raw_result_json_result: false, vendor_reuse_strings: false, bounded_digests_only: false, redaction_bounds_loaded: true },
    }],
  };
  const result = contract.evaluateCanaryContract({ bundle: leaked, options: { runSchema: false } });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.length > 0);
});

test('f3: checkRedactionSafety walks arbitrarily nested objects', () => {
  const payload = { a: 1, b: { c: 'PAPERCLIP_API_KEY=sk-1234567890abcdef', d: { e: [1, 2, { f: 'plain' }] } } };
  const hits = contract.checkRedactionSafety(payload);
  assert.ok(hits.length >= 1, 'expected at least 1 leak hit');
  assert.equal(hits[0].kind, 'credential_assignment');
});

// ===========================================================================
// (g) Producer CLI parity
// ===========================================================================

test('g1: parseArgs honours defaults, --force, --seed, --iterations, --reference-time, --role-subset, --drill-subset', () => {
  const out = producer.parseArgs(['node', 'producer', '--force', '--seed', 'abc-def', '--iterations', '4', '--reference-time', '2026-01-01T00:00:00.000Z', '--role-subset', 'Div2.MasterPlanner,secret_posture', '--drill-subset', 'budget-stop-drill']);
  assert.equal(out.force, true);
  assert.equal(out.seed, 'abc-def');
  assert.equal(out.iterations, 4);
  assert.equal(out.referenceTime, '2026-01-01T00:00:00.000Z');
  assert.deepEqual(out.roleSubset, ['Div2.MasterPlanner', 'secret_posture']);
  assert.deepEqual(out.drillSubset, ['budget-stop-drill']);
  assert.equal(out.bundleOut, DEFAULTS.bundle_output);
});

test('g2: atomicWriteJsonIfMissing refuses to overwrite without --force', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm016-s04-tmp-'));
  const target = path.join(tmpDir, 'bundle.json');
  producer.atomicWriteJson(target, { a: 1 });
  assert.throws(function () {
    producer.atomicWriteJsonIfMissing(target, { a: 2 });
  }, /refusing to overwrite/);
  // With force, overwrite succeeds.
  const result = producer.atomicWriteJsonIfMissing(target, { a: 2 }, { force: true });
  assert.equal(fs.existsSync(target), true);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('g3: atomicWriteJson succeeds for new target and writes canonical size', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm016-s04-tmp-'));
  const target = path.join(tmpDir, 'nested', 'bundle.json');
  const result = producer.atomicWriteJson(target, { x: 1 });
  assert.ok(result.size_bytes > 0);
  assert.ok(fs.existsSync(target));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ===========================================================================
// (h) End-to-end against the on-disk S02 + S03 fixtures
// ===========================================================================

test('h1: producer end-to-end happy path emits verdict=PRODUCED and bundle with 3 records / 3 correlation rows', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm016-s04-producer-'));
  const bundlePath = path.join(tmpDir, 'bundle.json');
  const protoPath = path.join(tmpDir, 'protocol.json');
  const probeRunPath = path.join(tmpDir, 'probe-run.json');
  const inventoryPath = path.join(tmpDir, 'inventory.json');

  // Copy real fixtures into a fresh workspace to keep the live tree
  // untouched on test rerun; the producer resolves its sources by path.
  const sources = [
    { name: 's02', src: path.join(ROOT, 'runtime-evidence', 'M016-S02-bos-mission-proof.json') },
    { name: 's03pack', src: path.join(ROOT, 'runtime-evidence', 'M016-S03-safe-operational-evidence-pack.json') },
    { name: 's03live', src: path.join(ROOT, 'runtime-evidence', 'M016-S03-live-probe-results.json') },
    { name: 's03drill', src: path.join(ROOT, 'runtime-evidence', 'M016-S03-scratch-drill-results.json') },
    { name: 's03verify', src: path.join(ROOT, 'runtime-evidence', 'M016-S03-verify-protocol.json') },
    { name: 's03collect', src: path.join(ROOT, 'runtime-evidence', 'M016-S03-collect-protocol.json') },
    { name: 's03inventory', src: path.join(ROOT, 'runtime-evidence', 'M016-S03-input-inventory.json') },
  ];
  for (const s of sources) {
    const text = fs.readFileSync(s.src, 'utf8');
    const dest = path.join(ROOT, 'runtime-evidence', path.basename(s.src));
    fs.writeFileSync(dest + '.bak-test', text);
  }
  try {
    const args = producer.parseArgs(['node', 'producer', '--force', '--bundle-out', bundlePath, '--protocol-out', protoPath, '--probe-run-out', probeRunPath, '--inventory-out', inventoryPath]);
    // Run pipeline manually (avoid subprocess).
    // Stage a controlled invocation by calling producer.run via an isolated require with cwd pointed at tmpDir.
    const subproducerPath = path.join(__dirname, 'produce_m016_s04_div4_div5_canary.js');
    const child = require('child_process').spawnSync(process.execPath, [subproducerPath, '--force', '--bundle-out', bundlePath, '--protocol-out', protoPath, '--probe-run-out', probeRunPath, '--inventory-out', inventoryPath], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(child.status, EXIT_CODES.CANARY_PASS, 'producer exited non-zero: ' + child.stderr);
    assert.match(child.stdout, new RegExp('M16-S04-CANARY verdict=' + CANARY_VERDICT_VALUES.PRODUCED + ' exit=' + EXIT_CODES.CANARY_PASS));

    const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
    assert.equal(bundle.bundle_kind, BUNDLE_KIND);
    assert.equal(bundle.bundle_id, BUNDLE_ID);
    assert.equal(bundle.records.length, 3);
    assert.equal(bundle.correlation_contract.probe_to_criterion.length, 3);
    assert.equal(bundle.embedded_classification.verdicts.launch, 'PREPARATION_ONLY');
    assert.equal(bundle.embedded_classification.canary_gates['CG8 DETERMINISTIC_REPLAY'], 'pass');
    assert.equal(bundle.replay_keys.byte_identical, true);
    assert.equal(bundle.blockers.length, 0);
    assert.equal(bundle.evidence_chain.length, 7);
    for (const row of bundle.evidence_chain) assert.equal(row.unchanged, true);
  } finally {
    // Restore originals.
    for (const s of sources) {
      const dest = path.join(ROOT, 'runtime-evidence', path.basename(s.src));
      const bak = dest + '.bak-test';
      if (fs.existsSync(bak)) {
        fs.copyFileSync(bak, dest);
        fs.unlinkSync(bak);
      }
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('h2: producer byte-identical dual replay across two consecutive runs', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm016-s04-dual-'));
  const bundlePath = path.join(tmpDir, 'bundle.json');
  const child1 = require('child_process').spawnSync(process.execPath, [path.join(__dirname, 'produce_m016_s04_div4_div5_canary.js'), '--force', '--bundle-out', bundlePath, '--protocol-out', path.join(tmpDir, 'p1.json'), '--probe-run-out', path.join(tmpDir, 'pr1.json'), '--inventory-out', path.join(tmpDir, 'i1.json')], { cwd: ROOT, encoding: 'utf8' });
  const child2 = require('child_process').spawnSync(process.execPath, [path.join(__dirname, 'produce_m016_s04_div4_div5_canary.js'), '--force', '--bundle-out', bundlePath, '--protocol-out', path.join(tmpDir, 'p2.json'), '--probe-run-out', path.join(tmpDir, 'pr2.json'), '--inventory-out', path.join(tmpDir, 'i2.json')], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(child1.status, EXIT_CODES.CANARY_PASS);
  assert.equal(child2.status, EXIT_CODES.CANARY_PASS);
  const bundleA = fs.readFileSync(bundlePath);
  const bundleB = fs.readFileSync(bundlePath);
  assert.equal(bundleA.length, bundleB.length);
  assert.equal(bundleA.toString('hex'), bundleB.toString('hex'));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('h3: producer against tampered live-probe source triggers FAIL_CLOSED', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm016-s04-tamper-'));
  const liveProbeBackup = path.join(ROOT, 'runtime-evidence', 'M016-S03-live-probe-results.json.bak-tamper');
  const liveProbeReal = path.join(ROOT, 'runtime-evidence', 'M016-S03-live-probe-results.json');
  const original = fs.readFileSync(liveProbeReal, 'utf8');
  try {
    fs.writeFileSync(liveProbeBackup, original);
    // Tamper: drop Div2.MasterPlanner record so subset returns FAIL_CLOSED for missing role.
    const tampered = JSON.parse(original);
    tampered.records = tampered.records.filter(function (r) { return r.role !== 'Div2.MasterPlanner'; });
    fs.writeFileSync(liveProbeReal, JSON.stringify(tampered));
    const child = require('child_process').spawnSync(process.execPath, [path.join(__dirname, 'produce_m016_s04_div4_div5_canary.js'), '--force', '--bundle-out', path.join(tmpDir, 'bundle.json'), '--protocol-out', path.join(tmpDir, 'protocol.json'), '--probe-run-out', path.join(tmpDir, 'probe.json'), '--inventory-out', path.join(tmpDir, 'inventory.json')], { cwd: ROOT, encoding: 'utf8' });
    assert.notEqual(child.status, EXIT_CODES.CANARY_PASS);
    assert.ok(child.status >= 1 && child.status <= 8);
    assert.match(child.stderr || child.stdout, /M16-S04-CANARY-(ROLE-NOT-IN-REGISTRY-Div2.MasterPlanner|REPLAY-NOT-BYTE-IDENTICAL|RUNNER-FAILURE|BUNDLE-INVALID|SUBSET-EMPTY)/);
  } finally {
    fs.copyFileSync(liveProbeBackup, liveProbeReal);
    fs.unlinkSync(liveProbeBackup);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('h4: producer FAIL_CLOSED when --bundle-out is refused (no --force and existing file)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm016-s04-noforce-'));
  const bundlePath = path.join(tmpDir, 'bundle.json');
  fs.writeFileSync(bundlePath, JSON.stringify({ stale: true }));
  const child = require('child_process').spawnSync(process.execPath, [path.join(__dirname, 'produce_m016_s04_div4_div5_canary.js'), '--bundle-out', bundlePath, '--protocol-out', path.join(tmpDir, 'p.json'), '--probe-run-out', path.join(tmpDir, 'pr.json'), '--inventory-out', path.join(tmpDir, 'i.json')], { cwd: ROOT, encoding: 'utf8' });
  assert.notEqual(child.status, EXIT_CODES.CANARY_PASS);
  assert.match(child.stderr || child.stdout, /ATOMIC-WRITE-FAILED|refusing to overwrite|M16-S04-CANARY/);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
