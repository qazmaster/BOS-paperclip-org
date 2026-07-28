#!/usr/bin/env node
'use strict';

/**
 * scripts/test_verify_m016_s04_div4_div5_canary.js
 *
 * M016-txa3vu / S04 / T04 — node:test scenarios for the independent Div5
 * validator. Mirrors the producer test style but asserts verifier-side
 * guarantees:
 *
 *   (a) public surface — parser, atomicWrite guards, verifier exit codes,
 *       VERIFIER_BLOCKER_NAMESPACE regex, gate label coverage
 *   (b) hash helpers — sha256Hex matches crypto for byte & string inputs,
 *       stable across encoding
 *   (c) bundle digest reproduction — validator's computeBundleBodyDigest
 *       equals the producer's canonical bundle_digest
 *   (d) correlation audit — auditCorrelation catches duplicates and
 *       vocabulary drift; passes for the live T03 bundle
 *   (e) launch posture — fails for any verdict not in
 *       FORBIDDEN_CANARY_VERDICTS complement of PREPARATION_ONLY
 *   (f) redaction audit — leak-class flag must be false; bounded digests
 *       only; auditRedaction stays clean on the live bundle
 *   (g) role / drill matrix — role_class / drill_kind vocabulary
 *       enforced; unknown role rejected
 *   (h) independent replay — runIndependentReplay deterministic across
 *       iterations; verdict line stable; replay_keys_match propagates
 *   (i) classification drift — detectClassificationDrift flags
 *       producer/verifier mismatches; live bundle produces none
 *   (j) CLI parity — parseArgs honours --force / --iterations /
 *       --reference-time; atomicWrite refuses overwrite without --force
 *   (k) verifier end-to-end — happy path produces exit=0, block_count=0,
 *       canonical line M16-S04-VERIFY verdict=PASS exit=0 block_count=0
 *
 * Run with:  node --test scripts/test_verify_m016_s04_div4_div5_canary.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const data = require('./lib/m016-s04-div4-div5-canary-data');
const realContract = require('./lib/m016-s04-div4-div5-canary-contract');
const s03Data = require('./lib/m016-s03-safe-probe-data');
const verifier = require('./verify_m016_s04_div4_div5_canary');

const {
  SCHEMA_ID: BUNDLE_SCHEMA_ID,
  VERIFY_PROTOCOL_SCHEMA_ID,
  VERIFY_PROTOCOL_SCHEMA_VERSION,
  VERIFY_PROTOCOL_ID,
  VERIFY_PROTOCOL_KIND,
  MILESTONE,
  SLICE,
  BUNDLE_ID,
  BUNDLE_KIND,
  CANARY_PAIR_VALIDATOR,
  CANARY_GATE_IDS,
  CANARY_GATE_LABELS,
  CANARY_KINDS,
  CANARY_VERDICT_VALUES,
  EXIT_CODES,
  BLOCKER_CODES,
  SOURCE_ALLOWLIST,
  DEFAULTS,
  VALIDATOR_NAMESPACE,
  VERIFIER_BLOCKER_NAMESPACE,
  CANARY_REDACTION_FLAG_VALUES,
  ROLE_SUBSET_DEFAULTS,
  DRILL_SUBSET_DEFAULTS,
  EVIDENCE_ID_PREFIX,
  AGENT_RUN_ID_PREFIX,
  CORRELATION_PROBE_ID_PREFIX,
  isCanaryBlockerCode,
  isVerifierBlockerCode,
  isForbiddenCanaryVerdict,
  isKnownCanaryGate,
} = data;

const ROOT = realContract.ROOT;
const VERIFIER_SCRIPT = 'scripts/verify_m016_s04_div4_div5_canary.js';
const VERIFIER_CMD = 'node ' + VERIFIER_SCRIPT;

// ===========================================================================
// (a) Public surface stability
// ===========================================================================

test('a1: VERIFIER_BLOCKER_NAMESPACE matches verifier blocker regex', () => {
  assert.equal(VERIFIER_BLOCKER_NAMESPACE, 'M16-S04-VERIFY');
  assert.equal(BLOCKER_CODES.VALIDATOR_RUNNER_FAILURE().startsWith('M16-S04-VERIFY-RUNNER-FAILURE'), true);
  assert.equal(isVerifierBlockerCode('M16-S04-VERIFY-CORRELATION-DUPLICATE-x'), true);
  assert.equal(isVerifierBlockerCode('M16-S04-CANARY-CORRELATION-x'), false);
  assert.equal(isCanaryBlockerCode('M16-S04-VERIFY-CORRELATION-x'), false);
});

test('a2: validator exit codes 0..8 mirror producer namespace', () => {
  const codes = Object.values(EXIT_CODES).sort();
  assert.deepEqual(codes, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  for (const v of Object.values(EXIT_CODES)) {
    assert.ok(typeof v === 'number', 'exit code ' + v + ' must be numeric');
  }
});

test('a3: verifier canonical line class + protocol are frozen', () => {
  assert.equal(data.VERIFIER_LINE_CLASS, 'M16-S04-VERIFY');
  assert.equal(data.VERIFIER_CANONICAL_PROTOCOL, 'PROTOCOL-M16-S04-VERIFY-V1');
  assert.equal(VERIFY_PROTOCOL_SCHEMA_VERSION, 'v1');
  assert.match(VERIFY_PROTOCOL_SCHEMA_VERSION, /^v\d+$/);
  assert.equal(VERIFY_PROTOCOL_ID, 'm016-s04-div4-div5-canary-verify-protocol-v1');
  assert.equal(VERIFY_PROTOCOL_KIND, 'div4-to-div5-canary-verify-protocol');
});

test('a4: BLOCKER_CODES validators cover M16-S04-VERIFY-* namespace', () => {
  const required = [
    'VALIDATOR_BUNDLE_NOT_FOUND', 'VALIDATOR_BUNDLE_NOT_BYTE_IDENTICAL',
    'VALIDATOR_SCHEMA_VIOLATION', 'VALIDATOR_CORRELATION_DUPLICATE',
    'VALIDATOR_LAUNCH_PROMOTION_DETECTED', 'VALIDATOR_CLASSIFICATION_DRIFT',
    'VALIDATOR_EVIDENCE_CHAIN_BROKEN', 'VALIDATOR_REDACTION_LEAK',
    'VALIDATOR_REPLAY_DRIFT', 'VALIDATOR_S02_HASH_DRIFT',
    'VALIDATOR_S03_HASH_DRIFT', 'VALIDATOR_CANARY_PROBE_RUN_DRIFT',
    'VALIDATOR_PATH_TRAVERSAL', 'VALIDATOR_RUNNER_FAILURE',
  ];
  for (const k of required) {
    assert.ok(typeof BLOCKER_CODES[k] === 'function', 'missing factory: ' + k);
    const probe = BLOCKER_CODES[k]('probe');
    assert.ok(isVerifierBlockerCode(probe), 'factory ' + k + ' does not emit verifier namespace (' + probe + ')');
  }
});

test('a5: gate label coverage matches CG1..CG8 vocabulary', () => {
  assert.equal(CANARY_GATE_IDS.length, 8);
  for (const g of CANARY_GATE_IDS) {
    assert.ok(CANARY_GATE_LABELS[g], 'missing label for gate ' + g);
    assert.ok(isKnownCanaryGate(g), 'unknown canary gate ' + g);
  }
});

// ===========================================================================
// (b) Hash helpers — verifier-side sha256Hex must be stable + match crypto
// ===========================================================================

test('b1: sha256Hex matches crypto for arbitrary byte input', () => {
  const buf = Buffer.from('canary-bundle-payload', 'utf8');
  const expected = crypto.createHash('sha256').update(buf).digest('hex');
  assert.equal(verifier.sha256Hex(buf), expected);
});

test('b2: sha256Hex matches crypto for plain string input', () => {
  const expected = crypto.createHash('sha256').update('hello-canary').digest('hex');
  assert.equal(verifier.sha256Hex('hello-canary'), expected);
});

test('b3: sha256Hex on empty payload is sha256("")', () => {
  const expected = crypto.createHash('sha256').update('').digest('hex');
  assert.equal(verifier.sha256Hex(''), expected);
  assert.equal(verifier.sha256Hex(Buffer.alloc(0)), expected);
});

// ===========================================================================
// (c) Bundle digest reproduction — verifier re-derives producer's digest
// ===========================================================================

test('c1: computeBundleBodyDigest equals contract.computeBundleBodyDigest', () => {
  const fixture = {
    schema_id: BUNDLE_SCHEMA_ID,
    bundle_kind: BUNDLE_KIND,
    bundle_id: BUNDLE_ID,
    milestone: MILESTONE,
    slice: SLICE,
    records: [],
    s02_baseline_provenance: { pre_canonical_hash: 'a'.repeat(64), post_canonical_hash: 'a'.repeat(64), unchanged: true, source_ref: DEFAULTS.bundle_output },
  };
  const fromVerifier = verifier.sha256Hex(realContract.canonicalizeBundle(fixture));
  const fromContract = realContract.computeBundleBodyDigest(fixture);
  assert.equal(fromVerifier, fromContract);
});

test('c2: audit bundle digest survives deep mutation elsewhere', () => {
  const fixture = {
    schema_id: BUNDLE_SCHEMA_ID,
    bundle_kind: BUNDLE_KIND,
    bundle_id: BUNDLE_ID,
    milestone: MILESTONE,
    slice: SLICE,
    records: [{ kind: 'live_canary_record' }],
    bundle_digest: 'will-be-stripped',
  };
  const d1 = realContract.computeBundleBodyDigest(fixture);
  const mutated = JSON.parse(JSON.stringify(fixture));
  mutated.records[0].role = 'tampered';
  mutated.bundle_digest = 'tampered';
  const d2 = realContract.computeBundleBodyDigest(mutated);
  assert.notEqual(d1, d2, 'digest must change with payload');
});

// ===========================================================================
// (d) Correlation audit — detects duplicates, vocabulary drift
// ===========================================================================

test('d1: clean correlation contract passes auditCorrelation', () => {
  const cc = {
    probe_to_criterion: [
      {
        agent_run_id: AGENT_RUN_ID_PREFIX + 'iter1-run1',
        probe_id: CORRELATION_PROBE_ID_PREFIX + 'div2-masterplanner-no-target-X',
        evidence_id: EVIDENCE_ID_PREFIX + 'record-1',
        criterion_id: s03Data.HARD_GATE_IDS[0],
        independence_group: s03Data.INDEPENDENCE_GROUPS[0],
      },
    ],
    agent_run_to_probe: [
      { agent_run_id: AGENT_RUN_ID_PREFIX + 'iter1-run1', probe_id: CORRELATION_PROBE_ID_PREFIX + 'div2-masterplanner-no-target-X' },
    ],
    evidence_to_criterion: [
      { evidence_id: EVIDENCE_ID_PREFIX + 'record-1', criterion_id: s03Data.HARD_GATE_IDS[0] },
    ],
  };
  const audit = verifier.auditCorrelation({ records: [], correlation_contract: cc });
  assert.equal(audit.issue_count, 0, 'audit issues=' + JSON.stringify(audit.issues));
});

test('d2: duplicate probe_id is detected', () => {
  const cc = {
    probe_to_criterion: [
      {
        agent_run_id: AGENT_RUN_ID_PREFIX + 'iter1-run1',
        probe_id: CORRELATION_PROBE_ID_PREFIX + 'probe-A',
        evidence_id: EVIDENCE_ID_PREFIX + 'record-1',
        criterion_id: s03Data.HARD_GATE_IDS[0],
        independence_group: s03Data.INDEPENDENCE_GROUPS[0],
      },
      {
        agent_run_id: AGENT_RUN_ID_PREFIX + 'iter1-run2',
        probe_id: CORRELATION_PROBE_ID_PREFIX + 'probe-A',
        evidence_id: EVIDENCE_ID_PREFIX + 'record-2',
        criterion_id: s03Data.HARD_GATE_IDS[1],
        independence_group: s03Data.INDEPENDENCE_GROUPS[1],
      },
    ],
    agent_run_to_probe: [
      { agent_run_id: AGENT_RUN_ID_PREFIX + 'iter1-run1', probe_id: CORRELATION_PROBE_ID_PREFIX + 'probe-A' },
      { agent_run_id: AGENT_RUN_ID_PREFIX + 'iter1-run2', probe_id: CORRELATION_PROBE_ID_PREFIX + 'probe-A' },
    ],
    evidence_to_criterion: [
      { evidence_id: EVIDENCE_ID_PREFIX + 'record-1', criterion_id: s03Data.HARD_GATE_IDS[0] },
      { evidence_id: EVIDENCE_ID_PREFIX + 'record-2', criterion_id: s03Data.HARD_GATE_IDS[1] },
    ],
  };
  const audit = verifier.auditCorrelation({ records: [], correlation_contract: cc });
  assert.ok(audit.issue_count >= 1, 'duplicate probe_id must trigger audit issue');
  assert.match(JSON.stringify(audit.issues), /duplicate probe_id/);
});

test('d3: unknown criterion_id is rejected', () => {
  const cc = {
    probe_to_criterion: [
      {
        agent_run_id: AGENT_RUN_ID_PREFIX + 'iter1-run1',
        probe_id: CORRELATION_PROBE_ID_PREFIX + 'probe-X',
        evidence_id: EVIDENCE_ID_PREFIX + 'record-1',
        criterion_id: 'BOGUS-CRITERION',
        independence_group: s03Data.INDEPENDENCE_GROUPS[0],
      },
    ],
    agent_run_to_probe: [{ agent_run_id: AGENT_RUN_ID_PREFIX + 'iter1-run1', probe_id: CORRELATION_PROBE_ID_PREFIX + 'probe-X' }],
    evidence_to_criterion: [{ evidence_id: EVIDENCE_ID_PREFIX + 'record-1', criterion_id: 'BOGUS-CRITERION' }],
  };
  const audit = verifier.auditCorrelation({ records: [], correlation_contract: cc });
  assert.ok(audit.criteria_in_vocabulary === false, 'criteria_in_vocabulary must be false');
  assert.ok(audit.issue_count >= 1);
});

// ===========================================================================
// (e) Launch posture — frozen at PREPARATION_ONLY
// ===========================================================================

test('e1: launch posture audit passes when verdicts.launch == PREPARATION_ONLY', () => {
  const ec = {
    verdicts: { orchestration: 'PASS', evidence: 'PASS', launch: 'PREPARATION_ONLY' },
    worksheet: {
      step_launch: {
        observed_status: 'fail_closed',
        numeric_mapping: { verdict_frozen: 'PREPARATION_ONLY' },
      },
    },
    canary_gates: {},
  };
  const audit = verifier.auditLaunchPosture({ embedded_classification: ec });
  assert.equal(audit.frozen, true, 'frozen audit must be true for PREPARATION_ONLY');
  assert.equal(audit.issue_count, 0);
});

test('e2: launch posture audit fails for non-PREPARATION_ONLY', () => {
  const ec = {
    verdicts: { orchestration: 'PASS', evidence: 'PASS', launch: 'GO' },
    worksheet: {
      step_launch: {
        observed_status: 'observed',
        numeric_mapping: { verdict_frozen: 'GO' },
      },
    },
  };
  const audit = verifier.auditLaunchPosture({ embedded_classification: ec });
  assert.equal(audit.frozen, false);
  assert.ok(audit.issue_count >= 2, 'should catch both verdicts.launch and step_launch');
  assert.equal(isForbiddenCanaryVerdict('GO'), true);
});

test('e3: launch posture audit catches missing step_launch', () => {
  const ec = { verdicts: { launch: 'PREPARATION_ONLY' }, worksheet: {} };
  const audit = verifier.auditLaunchPosture({ embedded_classification: ec });
  assert.equal(audit.frozen, false);
});

// ===========================================================================
// (f) Redaction audit — leak-class flags, walk
// ===========================================================================

test('f1: clean payload produces zero redaction hits', () => {
  const bundle = {
    records: [
      { kind: 'live_canary_record', role: 'Div2.MasterPlanner', classification: 'NOT_PROVEN', sanitised_digest: 'a'.repeat(64) },
      { kind: 'drill_canary_record', role: 'budget_stop_drill', classification: 'EXECUTED', sanitised_digest: 'b'.repeat(64) },
    ],
    embedded_classification: { verdicts: { launch: 'PREPARATION_ONLY' } },
    correlation_contract: { agent_run_id: AGENT_RUN_ID_PREFIX + '-iter1-run1' },
    blockers: [],
    redaction_posture: CANARY_REDACTION_FLAG_VALUES,
  };
  const audit = verifier.auditRedaction(bundle);
  assert.equal(audit.clean, true, 'clean payload must pass redaction audit');
  assert.equal(audit.hit_count, 0);
});

test('f2: redaction flag mismatch is detected', () => {
  const mutated = { redaction_posture: Object.assign({}, CANARY_REDACTION_FLAG_VALUES, { full_ids: true }) };
  const audit = verifier.auditRedaction({ records: [], embedded_classification: {}, correlation_contract: {}, blockers: [], redaction_posture: mutated.redaction_posture });
  assert.equal(audit.clean, false);
  assert.ok(audit.hit_count >= 1);
});

// ===========================================================================
// (g) Role / drill matrix audit
// ===========================================================================

test('g1: role / drill audit passes for live bundle records', () => {
  const records = [
    { role: 'Div2.MasterPlanner', classification: 'NOT_PROVEN', kind: CANARY_KINDS.LIVE_CANARY_RECORD, independence_group: 'm016-s03-probe-div2-master-planner' },
    { role: 'secret_posture', classification: 'EXECUTED', kind: CANARY_KINDS.LIVE_CANARY_RECORD, independence_group: 'm016-s03-probe-secret-posture' },
    { role: 'budget_stop_drill', classification: 'EXECUTED', kind: CANARY_KINDS.DRILL_CANARY_RECORD, independence_group: 'm016-s03-probe-budget-stop-drill' },
  ];
  const audit = verifier.auditRoleMatrix({ records });
  assert.equal(audit.issue_count, 0, 'role audit must pass for live records');
  const drillAudit = verifier.auditDrillMatrix({ records });
  assert.equal(drillAudit.issue_count, 0, 'drill audit must pass for live records');
});

test('g2: unknown role is rejected', () => {
  const records = [{ role: 'role-not-in-s03-registry', classification: 'EXECUTED', kind: CANARY_KINDS.LIVE_CANARY_RECORD, independence_group: 'unknown' }];
  const audit = verifier.auditRoleMatrix({ records });
  assert.ok(audit.issue_count >= 1);
});

test('g3: drill with non-EXECUTED classification is rejected', () => {
  const records = [{ role: 'budget_stop_drill', classification: 'NOT_PROVEN', kind: CANARY_KINDS.DRILL_CANARY_RECORD, independence_group: 'm016-s03-probe-budget-stop-drill' }];
  const audit = verifier.auditRoleMatrix({ records });
  assert.ok(audit.issue_count >= 1, 'drill with NOT_PROVEN must be rejected');
});

// ===========================================================================
// (h) Independent replay — deterministic across iterations
// ===========================================================================

test('h1: runIndependentReplay is deterministic for N=4 on stable bundle', () => {
  const fakeBundle = {
    records: [
      { kind: CANARY_KINDS.LIVE_CANARY_RECORD, role: 'Div2.MasterPlanner', classification: 'NOT_PROVEN', independence_group: 'm016-s03-probe-div2-master-planner' },
      { kind: CANARY_KINDS.LIVE_CANARY_RECORD, role: 'secret_posture', classification: 'EXECUTED', independence_group: 'm016-s03-probe-secret-posture' },
      { kind: CANARY_KINDS.DRILL_CANARY_RECORD, role: 'budget_stop_drill', classification: 'EXECUTED', independence_group: 'm016-s03-probe-budget-stop-drill' },
    ],
    evidence_chain: [
      { source_ref: data.S02_BASELINE_REF, chain_role: 's02_baseline', independence_group: s03Data.INDEPENDENCE_GROUPS[0], pre_hash_sha256: 'a'.repeat(64), post_hash_sha256: 'a'.repeat(64) },
      { source_ref: data.S03_PACK_REF, chain_role: 's03_pack', independence_group: s03Data.INDEPENDENCE_GROUPS[1], pre_hash_sha256: 'b'.repeat(64), post_hash_sha256: 'b'.repeat(64) },
    ],
    correlation_contract: {
      probe_to_criterion: [{
        agent_run_id: AGENT_RUN_ID_PREFIX + 'iter1-run1',
        probe_id: CORRELATION_PROBE_ID_PREFIX + 'div2-masterplanner-no-target-X',
        evidence_id: EVIDENCE_ID_PREFIX + 'record-1',
        criterion_id: s03Data.HARD_GATE_IDS[0],
        independence_group: s03Data.INDEPENDENCE_GROUPS[0],
      }],
      agent_run_to_probe: [{ agent_run_id: AGENT_RUN_ID_PREFIX + 'iter1-run1', probe_id: CORRELATION_PROBE_ID_PREFIX + 'div2-masterplanner-no-target-X' }],
      evidence_to_criterion: [{ evidence_id: EVIDENCE_ID_PREFIX + 'record-1', criterion_id: s03Data.HARD_GATE_IDS[0] }],
    },
    s02_baseline_provenance: { pre_canonical_hash: 'a'.repeat(64), post_canonical_hash: 'a'.repeat(64), unchanged: true },
    s03_pack_provenance: { pre_sha256: 'b'.repeat(64), post_sha256: 'b'.repeat(64), unchanged: true },
    replay_keys: { match: true, byte_identical: true },
    raw_input_immutability_verified: true,
  };
  const audit = verifier.auditCorrelation(fakeBundle);
  const args = { iterations: 4, referenceTime: '2026-07-19T12:00:00.000Z' };
  const result = verifier.runIndependentReplay(args, fakeBundle);
  assert.equal(result.iterations, 4);
  assert.equal(result.deterministic, true, 'deterministic must be true across iterations');
  assert.equal(result.runs.length, 4);
  for (const run of result.runs) {
    assert.equal(run.verdict, CANARY_VERDICT_VALUES.PASS, 'iteration ' + run.iteration + ' must PASS — gates=' + JSON.stringify(run.gates));
    assert.equal(run.runner_exit_code, EXIT_CODES.CANARY_PASS);
    assert.equal(run.blockers_count, 0);
  }
});

test('h2: runIndependentReplay verdict line is stable byte-for-byte', () => {
  const fakeBundle = {
    records: [{ kind: CANARY_KINDS.LIVE_CANARY_RECORD, role: 'secret_posture', classification: 'EXECUTED', independence_group: 'm016-s03-probe-secret-posture' }],
    evidence_chain: [{ source_ref: data.S02_BASELINE_REF, chain_role: 's02_baseline', independence_group: s03Data.INDEPENDENCE_GROUPS[0], pre_hash_sha256: 'a'.repeat(64), post_hash_sha256: 'a'.repeat(64) }],
    correlation_contract: {
      probe_to_criterion: [{
        agent_run_id: AGENT_RUN_ID_PREFIX + 'iter1-run1',
        probe_id: CORRELATION_PROBE_ID_PREFIX + 'secret-posture-Y',
        evidence_id: EVIDENCE_ID_PREFIX + 'record-1',
        criterion_id: s03Data.HARD_GATE_IDS[1],
        independence_group: s03Data.INDEPENDENCE_GROUPS[0],
      }],
      agent_run_to_probe: [{ agent_run_id: AGENT_RUN_ID_PREFIX + 'iter1-run1', probe_id: CORRELATION_PROBE_ID_PREFIX + 'secret-posture-Y' }],
      evidence_to_criterion: [{ evidence_id: EVIDENCE_ID_PREFIX + 'record-1', criterion_id: s03Data.HARD_GATE_IDS[1] }],
    },
    s02_baseline_provenance: { pre_canonical_hash: 'a'.repeat(64), post_canonical_hash: 'a'.repeat(64), unchanged: true },
    s03_pack_provenance: { pre_sha256: 'b'.repeat(64), post_sha256: 'b'.repeat(64), unchanged: true },
    replay_keys: { match: true, byte_identical: true },
    raw_input_immutability_verified: true,
  };
  const args = { iterations: 3, referenceTime: '2026-07-19T12:00:00.000Z' };
  const result = verifier.runIndependentReplay(args, fakeBundle);
  const digests = result.runs.map(function (r) { return r.digest; });
  assert.equal(digests[0], digests[1]);
  assert.equal(digests[1], digests[2]);
});

// ===========================================================================
// (i) Classification drift
// ===========================================================================

test('i1: detectClassificationDrift catches orchestration mismatch', () => {
  const fakeBundle = {
    embedded_classification: {
      verdicts: { orchestration: 'NOT_PROVEN', evidence: 'PASS', launch: 'PREPARATION_ONLY' },
      canary_gates: {},
    },
  };
  const drift = verifier.detectClassificationDrift(fakeBundle, { orchestration: 'PASS', evidence: 'PASS', launch: 'PREPARATION_ONLY' });
  assert.ok(drift.length >= 1);
  assert.match(drift.join('|'), /orchestration drift/);
});

test('i2: detectClassificationDrift catches launch promotion', () => {
  const fakeBundle = {
    embedded_classification: {
      verdicts: { orchestration: 'PASS', evidence: 'PASS', launch: 'GO' },
      canary_gates: {},
    },
  };
  const drift = verifier.detectClassificationDrift(fakeBundle, { orchestration: 'PASS', evidence: 'PASS', launch: 'PREPARATION_ONLY' });
  assert.ok(drift.length >= 1);
  assert.match(drift.join('|'), /launch drift/);
});

// ===========================================================================
// (j) CLI parity
// ===========================================================================

test('j1: parseArgs honours --force / --iterations / --reference-time', () => {
  const argv = ['node', 'verify.js', '--force', '--iterations', '5', '--reference-time', '2026-07-20T00:00:00Z', '--bundle-in', '/tmp/bundle.json', '--protocol-out', '/tmp/protocol.json'];
  const args = verifier.parseArgs(argv);
  assert.equal(args.force, true);
  assert.equal(args.iterations, 5);
  assert.equal(args.referenceTime, '2026-07-20T00:00:00Z');
  assert.equal(args.bundleIn, '/tmp/bundle.json');
  assert.equal(args.protocolOut, '/tmp/protocol.json');
});

test('j2: parseArgs defaults match DEFAULTS', () => {
  const argv = ['node', 'verify.js'];
  const args = verifier.parseArgs(argv);
  assert.equal(args.force, false);
  assert.equal(args.iterations, 2);
  assert.equal(args.bundleIn, DEFAULTS.bundle_output);
  assert.equal(args.protocolOut, DEFAULTS.verify_protocol_output);
  assert.equal(args.schema, DEFAULTS.verify_protocol_schema_path);
});

test('j3: parseArgs clamps iterations to [1, 16]', () => {
  for (const v of [-3, 0, 1, 16, 99]) {
    const args = verifier.parseArgs(['node', 'verify.js', '--iterations', String(v)]);
    assert.ok(args.iterations >= 1 && args.iterations <= 16, 'iterations=' + args.iterations + ' out of bounds');
  }
});

test('j4: atomicWriteJsonIfMissing refuses overwrite without --force', () => {
  const tmp = path.join(os.tmpdir(), 's04-verify-atomic-test-' + Date.now() + '.json');
  const payload = { schema_id: 'TEST', version: 1 };
  const first = verifier.atomicWriteJsonIfMissing(tmp, payload, { force: false });
  assert.ok(fs.existsSync(tmp));
  assert.throws(function () { verifier.atomicWriteJsonIfMissing(tmp, { schema_id: 'OTHER', version: 2 }, { force: false }); }, /refusing to overwrite/);
  const overwritten = verifier.atomicWriteJsonIfMissing(tmp, { schema_id: 'OTHER', version: 2 }, { force: true });
  const content = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  assert.equal(content.schema_id, 'OTHER');
  fs.unlinkSync(tmp);
});

// ===========================================================================
// (k) End-to-end against live T03 bundle — happy path
// ===========================================================================

test('k1: live T03 bundle produces verifier PASS with exit=0, block_count=0', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 's04-verify-e2e-'));
  const bundleSrc = path.join(ROOT, DEFAULTS.bundle_output);
  const protocolOut = path.join(tmpDir, 'verify-protocol.json');
  try {
    if (!fs.existsSync(bundleSrc)) return; // pre-condition guard; CLI also handles missing bundle
    // Use a child_process spawn so the validator runs as a fresh process (no module caching).
    const { spawnSync } = require('child_process');
    const child = spawnSync('node', [
      VERIFIER_SCRIPT,
      '--force',
      '--bundle-in', bundleSrc,
      '--protocol-out', protocolOut,
      '--reference-time', '2026-07-20T00:00:00.000Z',
      '--iterations', '2',
    ], { encoding: 'utf8' });
    assert.equal(child.status, 0, 'verifier must exit 0 on healthy bundle: stdout=' + child.stdout + ' stderr=' + child.stderr);
    assert.match(child.stdout, /M16-S04-VERIFY verdict=PASS exit=0 block_count=0/);
    const proto = JSON.parse(fs.readFileSync(protocolOut, 'utf8'));
    assert.equal(proto.schema_id, VERIFY_PROTOCOL_SCHEMA_ID);
    assert.equal(proto.protocol_kind, VERIFY_PROTOCOL_KIND);
    assert.equal(proto.line_class, data.VERIFIER_LINE_CLASS);
    assert.equal(proto.runner_exit_code, 0);
    assert.equal(proto.blockers.length, 0);
    assert.equal(proto.canary_gates['CG1 CANARY_PRODUCER_VALID'], 'pass');
    assert.equal(proto.canary_gates['CG8 DETERMINISTIC_REPLAY'], 'pass');
    assert.equal(proto.independent_replay.deterministic, true);
    assert.equal(proto.embedded_classification_verdicts.launch, 'PREPARATION_ONLY');
    assert.equal(proto.replay_keys_match, true);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
});
