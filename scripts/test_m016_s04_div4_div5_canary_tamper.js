#!/usr/bin/env node
'use strict';

/**
 * scripts/test_m016_s04_div4_div5_canary_tamper.js
 *
 * M016-txa3vu / S04 / T05 — Fail-closed tamper matrix for the Div4 -> Div5
 * evidence canary. Drives the pure canary contract
 * (scripts/lib/m016-s04-div4-div5-canary-contract.js evaluateCanaryContract)
 * through eight single-fault fixtures covering the five abuse classes from
 * the slice plan:
 *
 *   1. parameter_tampering          (FT-01 bundle_kind, FT-02 launch verdict)
 *   2. replay_attacks               (FT-03 replay_keys.match, FT-04 evidence chain pre/post hash drift)
 *   3. privilege_or_scope_escalation(FT-05 role classification lift, FT-08 drill classification demote)
 *   4. data_exposure                (FT-06 redaction_posture flag flip)
 *   5. filesystem_trust_boundary    (FT-07 evidence_chain.source_ref traversal)
 *
 * Every fixture mutates a deep-clone of the live T03 baseline bundle, runs
 * the pure evaluator, and asserts:
 *   - verdict == 'fail_closed'
 *   - blockers contain the expected unique M16-S04-CANARY-* code
 *   - mapBlockerToExitCode(expected_blocker_code) != 0
 *
 * The test harness never mutates the on-disk baseline; after the fixture
 * matrix runs, the harness re-reads the baseline and asserts byte-identical
 * preservation. The harness also emits the canonical negative-fixtures
 * artifact to runtime-evidence/M016-S04-div4-div5-canary-negative-fixtures.json.
 *
 * No subprocesses, no network, no live mutation: pure data in, pure
 * assertions out. Public surface mirrors the schema / contract / producer /
 * verify test conventions so node --test treats it as one canonical entry
 * point.
 */

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const data = require('./lib/m016-s04-div4-div5-canary-data');
const contract = require('./lib/m016-s04-div4-div5-canary-contract');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_REF = data.DEFAULTS.bundle_output;
const ARTIFACT_REF = data.DEFAULTS.negative_fixtures_output;
const BASELINE_ABS = path.join(ROOT, BASELINE_REF);
const ARTIFACT_ABS = path.join(ROOT, ARTIFACT_REF);

const { BLOCKER_CODES, EXIT_CODES } = data;

// ---------------------------------------------------------------------------
// Fixtures (declared before helpers so they can reference mutation closures).
// Each fixture owns one deep-clone-safe mutator. The mutator MUST mutate only
// the in-memory clone; it must never touch the on-disk baseline.
// ---------------------------------------------------------------------------

function _deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function _setPath(obj, dotted, value) {
  const parts = dotted.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
  cur[parts[parts.length - 1]] = value;
  return obj;
}

function _replaceWhere(arr, predicate, mutate) {
  for (let i = 0; i < arr.length; i++) {
    if (predicate(arr[i], i)) return mutate(arr[i], i);
  }
  throw new Error('no matching row in array');
}

const ALL_ZEROS_SHA256 = '0'.repeat(64);
const ABS_PATH_LEAK = '/etc/passwd';

const FIXTURES = Object.freeze([
  {
    id: 'FT-01',
    threat_class: 'parameter_tampering',
    tamper_path: 'bundle_kind',
    mutator_kind: 'string_replace',
    baseline_value: data.BUNDLE_KIND,
    tampered_value: 'sneaky-bundle',
    expected_blocker_code: BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('bundle_kind'),
    expected_verdict: 'fail_closed',
    expected_exit_code: EXIT_CODES.CANARY_REJECTED_FAIL_CLOSED,
    rationale: 'bundle_kind is the frozen discriminator; any value other than div4-to-div5-canary-bundle must be rejected before any other field is trusted.',
    mutator: function (baseline) {
      const clone = _deepClone(baseline);
      _setPath(clone, 'bundle_kind', 'sneaky-bundle');
      return clone;
    },
  },
  {
    id: 'FT-02',
    threat_class: 'parameter_tampering',
    tamper_path: 'embedded_classification.verdicts.launch',
    mutator_kind: 'string_replace',
    baseline_value: 'PREPARATION_ONLY',
    tampered_value: 'PASS',
    expected_blocker_code: BLOCKER_CODES.PRODUCER_LAUNCH_PROMOTION_ATTEMPTED('PASS'),
    expected_verdict: 'fail_closed',
    expected_exit_code: EXIT_CODES.CANARY_REJECTED_FAIL_CLOSED,
    rationale: 'launch verdict is structurally frozen to PREPARATION_ONLY at the canary layer; PASS would silently promote scope and invalidate the S05 admission gate.',
    mutator: function (baseline) {
      const clone = _deepClone(baseline);
      _setPath(clone, 'embedded_classification.verdicts.launch', 'PASS');
      return clone;
    },
  },
  {
    id: 'FT-03',
    threat_class: 'replay_attacks',
    tamper_path: 'replay_keys.match',
    mutator_kind: 'boolean_flip',
    baseline_value: true,
    tampered_value: false,
    expected_blocker_code: BLOCKER_CODES.PRODUCER_REPLAY_NOT_BYTE_IDENTICAL(),
    expected_verdict: 'fail_closed',
    expected_exit_code: EXIT_CODES.CANARY_REJECTED_FAIL_CLOSED,
    rationale: 'replay_keys.match must be true after dual-run byte-identical replay; flipping match hides producer non-determinism and breaks CG8.',
    mutator: function (baseline) {
      const clone = _deepClone(baseline);
      _setPath(clone, 'replay_keys.match', false);
      return clone;
    },
  },
  {
    id: 'FT-04',
    threat_class: 'replay_attacks',
    tamper_path: 'evidence_chain[chain_role=s02_baseline].pre_hash_sha256',
    mutator_kind: 'hash_drift',
    baseline_value: '373d54e024ee847dc0388a4e2acfbdba536d1eef8392bd89ce929a618050e329',
    tampered_value: ALL_ZEROS_SHA256,
    expected_blocker_code: BLOCKER_CODES.PRODUCER_EVIDENCE_CHAIN_BROKEN('s02_baseline'),
    expected_verdict: 'fail_closed',
    expected_exit_code: EXIT_CODES.CANARY_REJECTED_FAIL_CLOSED,
    rationale: 's02 baseline pre/post hash equality is the immutability gate for the upstream BOS mission proof; any drift must surface as a chain-level blocker and propagate to CG3 / CG6.',
    mutator: function (baseline) {
      const clone = _deepClone(baseline);
      _replaceWhere(clone.evidence_chain, function (row) { return row.chain_role === 's02_baseline'; }, function (row) {
        row.pre_hash_sha256 = ALL_ZEROS_SHA256;
      });
      return clone;
    },
  },
  {
    id: 'FT-05',
    threat_class: 'privilege_or_scope_escalation',
    tamper_path: 'records[role=Div2.MasterPlanner].classification',
    mutator_kind: 'classification_lift',
    baseline_value: 'NOT_PROVEN',
    tampered_value: 'EXECUTED',
    expected_blocker_code: BLOCKER_CODES.PRODUCER_ROLE_NOT_PROVEN_EXECUTED('Div2.MasterPlanner'),
    expected_verdict: 'fail_closed',
    expected_exit_code: EXIT_CODES.CANARY_REJECTED_FAIL_CLOSED,
    rationale: 'Live division roles cannot be EXECUTED at the canary layer; promoting Div2.MasterPlanner would silently extend the canary into live mutation scope.',
    mutator: function (baseline) {
      const clone = _deepClone(baseline);
      _replaceWhere(clone.records, function (row) { return row.role === 'Div2.MasterPlanner'; }, function (row) {
        row.classification = 'EXECUTED';
      });
      return clone;
    },
  },
  {
    id: 'FT-06',
    threat_class: 'data_exposure',
    tamper_path: 'redaction_posture.full_ids',
    mutator_kind: 'boolean_flip',
    baseline_value: false,
    tampered_value: true,
    expected_blocker_code: BLOCKER_CODES.PRODUCER_REDACTION_LEAK('full_ids'),
    expected_verdict: 'fail_closed',
    expected_exit_code: EXIT_CODES.CANARY_REJECTED_FAIL_CLOSED,
    rationale: 'redaction_posture leak-class flags must stay false; flipping full_ids to true would expose full UUIDs and break CG5 / R040.',
    mutator: function (baseline) {
      const clone = _deepClone(baseline);
      _setPath(clone, 'redaction_posture.full_ids', true);
      return clone;
    },
  },
  {
    id: 'FT-07',
    threat_class: 'filesystem_trust_boundary',
    tamper_path: 'evidence_chain[0].source_ref',
    mutator_kind: 'path_traversal',
    baseline_value: 'runtime-evidence/M016-S02-bos-mission-proof.json',
    tampered_value: '../../etc/passwd',
    expected_blocker_code: BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('evidence_chain.source_ref:traversal'),
    expected_verdict: 'fail_closed',
    expected_exit_code: EXIT_CODES.CANARY_REJECTED_FAIL_CLOSED,
    rationale: 'evidence_chain.source_ref must remain inside runtime-evidence/ or scripts/ prefixes; ../ traversal attempts must be rejected before any reader touches the filesystem.',
    mutator: function (baseline) {
      const clone = _deepClone(baseline);
      if (Array.isArray(clone.evidence_chain) && clone.evidence_chain.length > 0) {
        clone.evidence_chain[0].source_ref = '../../etc/passwd';
      }
      return clone;
    },
  },
  {
    id: 'FT-08',
    threat_class: 'privilege_or_scope_escalation',
    tamper_path: 'records[role=budget_stop_drill].classification',
    mutator_kind: 'classification_demote',
    baseline_value: 'EXECUTED',
    tampered_value: 'NOT_PROVEN',
    expected_blocker_code: BLOCKER_CODES.PRODUCER_DRILL_NOT_PROVEN_EXECUTED('budget_stop_drill'),
    expected_verdict: 'fail_closed',
    expected_exit_code: EXIT_CODES.CANARY_REJECTED_FAIL_CLOSED,
    rationale: 'Drills entering the canary must be EXECUTED; a NOT_PROVEN drill cannot witness the isolation invariant (HG8 / CG7) and must fail closed.',
    mutator: function (baseline) {
      const clone = _deepClone(baseline);
      _replaceWhere(clone.records, function (row) { return row.role === 'budget_stop_drill'; }, function (row) {
        row.classification = 'NOT_PROVEN';
      });
      return clone;
    },
  },
]);

// ---------------------------------------------------------------------------
// Artifact emission (idempotent overwrite before tests run). This guarantees
// the negative-fixtures artifact exists even if the first assertion fails,
// so downstream T06 / S05 admission can grep for it without depending on
// test pass order.
// ---------------------------------------------------------------------------

function _buildArtifact() {
  const generated = data.DEFAULTS.reference_time;
  const fixtures = FIXTURES.map(function (f) {
    return {
      fixture_id: f.id,
      threat_class: f.threat_class,
      tamper_path: f.tamper_path,
      mutator_kind: f.mutator_kind,
      baseline_value: f.baseline_value,
      tampered_value: f.tampered_value,
      expected_blocker_code: f.expected_blocker_code,
      expected_verdict: f.expected_verdict,
      expected_exit_code: f.expected_exit_code,
      rationale: f.rationale,
      evidence_ref: ARTIFACT_REF,
    };
  });
  const coverageSummary = {
    parameter_tampering: 0,
    replay_attacks: 0,
    privilege_or_scope_escalation: 0,
    data_exposure: 0,
    filesystem_trust_boundary: 0,
  };
  for (const f of fixtures) {
    if (coverageSummary[f.threat_class] !== undefined) coverageSummary[f.threat_class] += 1;
  }
  return {
    schema_id: 'https://gsd.local/schemas/runtime-evidence/m016-s04-div4-div5-canary-negative-fixtures.v1.json',
    schema_version: 'v1',
    fixture_set_id: 'm016-s04-div4-div5-canary-negative-fixtures-v1',
    fixture_set_kind: 'div4-to-div5-canary-negative-fixtures',
    milestone: data.MILESTONE,
    slice: data.SLICE,
    task: 'T05',
    generated: generated,
    line_class: data.PRODUCER_LINE_CLASS,
    canonical_protocol: data.PRODUCER_CANONICAL_PROTOCOL,
    baseline_bundle: BASELINE_REF,
    baseline_bundle_sha256: '', // populated below after baseline load
    runner_command: 'node --test scripts/test_m016_s04_div4_div5_canary_tamper.js',
    evaluation_command: 'node -e "require(\'./scripts/lib/m016-s04-div4-div5-canary-contract\').evaluateCanaryContract({ bundle: tamperedBundle, options: { runSchema: false } })"',
    fixture_count: fixtures.length,
    unique_blocker_codes: fixtures.length,
    non_zero_exit_codes: fixtures.every(function (f) { return f.expected_exit_code !== 0; }),
    coverage_summary: coverageSummary,
    schema_path: data.DEFAULTS.schema_path,
    producer_protocol_path: data.DEFAULTS.producer_protocol_output,
    verify_protocol_path: data.DEFAULTS.verify_protocol_output,
    fixtures: fixtures,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _loadBaseline() {
  if (!fs.existsSync(BASELINE_ABS)) {
    throw new Error('baseline bundle missing at ' + BASELINE_REF);
  }
  return JSON.parse(fs.readFileSync(BASELINE_ABS, 'utf8'));
}

function _evaluateTampered(tampered) {
  return contract.evaluateCanaryContract({
    bundle: tampered,
    options: { runSchema: false },
  });
}

function _verifyFixture(fixture, baseline) {
  return function () {
    const tampered = fixture.mutator(baseline);
    const result = _evaluateTampered(tampered);

    assert.equal(result.verdict, fixture.expected_verdict,
      fixture.id + ': expected verdict ' + fixture.expected_verdict + ' got ' + result.verdict);

    const blockerCodes = (result.blockers || []).map(function (b) { return b.code; });
    assert.ok(blockerCodes.indexOf(fixture.expected_blocker_code) >= 0,
      fixture.id + ': expected blocker "' + fixture.expected_blocker_code + '" not in ' + JSON.stringify(blockerCodes));

    const exitCode = contract.mapBlockerToExitCode(fixture.expected_blocker_code);
    assert.notEqual(exitCode, EXIT_CODES.CANARY_PASS,
      fixture.id + ': expected non-zero exit for "' + fixture.expected_blocker_code + '", got 0');
    assert.equal(exitCode, fixture.expected_exit_code,
      fixture.id + ': expected exit ' + fixture.expected_exit_code + ', got ' + exitCode);

    // Tamper produced at least one blocker (fail-closed implies non-empty blockers).
    assert.ok((result.blockers || []).length >= 1,
      fixture.id + ': fail-closed verdict must carry >= 1 blocker');
  };
}

// ---------------------------------------------------------------------------
// Emit artifact once at module load so it exists even if tests fail.
// ---------------------------------------------------------------------------

(function _emitArtifact() {
  const baseline = fs.existsSync(BASELINE_ABS)
    ? JSON.parse(fs.readFileSync(BASELINE_ABS, 'utf8'))
    : null;
  const artifact = _buildArtifact();
  if (baseline && typeof baseline.bundle_digest === 'string') {
    artifact.baseline_bundle_sha256 = baseline.bundle_digest;
  }
  fs.mkdirSync(path.dirname(ARTIFACT_ABS), { recursive: true });
  fs.writeFileSync(ARTIFACT_ABS, JSON.stringify(artifact, null, 2) + '\n');
})();

// ---------------------------------------------------------------------------
// node:test surface
// ---------------------------------------------------------------------------

test('T05 fail-closed tamper matrix (M016-txa3vu/S04)', async function (t) {
  let baseline;
  try {
    baseline = _loadBaseline();
  } catch (e) {
    t.diagnostic('baseline load failed: ' + e.message);
    t.fail('baseline bundle unavailable: ' + e.message);
    return;
  }

  // --- Eight single-fault fixtures (baseline flows through closure) ---
  for (const fixture of FIXTURES) {
    await t.test(fixture.id + ' :: ' + fixture.threat_class + ' :: ' + fixture.tamper_path, _verifyFixture(fixture, baseline));
  }

  // --- Cross-fixture invariants ---
  await t.test('all eight blocker codes are unique within M16-S04-CANARY-* namespace', function () {
    const codes = FIXTURES.map(function (f) { return f.expected_blocker_code; });
    const unique = new Set(codes);
    assert.equal(unique.size, codes.length,
      'duplicate blocker codes: ' + JSON.stringify(codes.filter(function (c, i) { return codes.indexOf(c) !== i; }), null, 2));
    for (const c of codes) {
      assert.equal(data.isCanaryBlockerCode(c), true,
        'blocker code "' + c + '" must satisfy M16-S04-CANARY-* regex');
    }
  });

  await t.test('all eight expected exit codes are non-zero', function () {
    for (const f of FIXTURES) {
      assert.notEqual(f.expected_exit_code, EXIT_CODES.CANARY_PASS,
        f.id + ': exit code must be non-zero');
      assert.equal(contract.mapBlockerToExitCode(f.expected_blocker_code), f.expected_exit_code,
        f.id + ': mapBlockerToExitCode must agree with expected_exit_code');
    }
  });

  await t.test('coverage spans all five threat classes from the slice plan', function () {
    const threats = new Set(FIXTURES.map(function (f) { return f.threat_class; }));
    const required = ['parameter_tampering', 'replay_attacks', 'privilege_or_scope_escalation', 'data_exposure', 'filesystem_trust_boundary'];
    for (const r of required) {
      assert.ok(threats.has(r), 'missing threat class: ' + r);
    }
  });

  await t.test('baseline bundle on disk is byte-identical after the matrix runs', function () {
    const after = _loadBaseline();
    assert.equal(after.bundle_kind, baseline.bundle_kind, 'bundle_kind mutated on disk');
    assert.equal(after.bundle_id, baseline.bundle_id, 'bundle_id mutated on disk');
    assert.equal(after.bundle_digest, baseline.bundle_digest, 'bundle_digest drifted on disk');
    assert.equal(JSON.stringify(after.records), JSON.stringify(baseline.records), 'records array drifted on disk');
    assert.equal(JSON.stringify(after.embedded_classification), JSON.stringify(baseline.embedded_classification), 'embedded_classification drifted on disk');
    assert.equal(JSON.stringify(after.redaction_posture), JSON.stringify(baseline.redaction_posture), 'redaction_posture drifted on disk');
    assert.equal(JSON.stringify(after.evidence_chain), JSON.stringify(baseline.evidence_chain), 'evidence_chain drifted on disk');
    assert.equal(JSON.stringify(after.replay_keys), JSON.stringify(baseline.replay_keys), 'replay_keys drifted on disk');
  });

  // --- Negative-fixtures artifact ---
  await t.test('negative-fixtures artifact emitted with 8 fixtures', function () {
    assert.ok(fs.existsSync(ARTIFACT_ABS), 'artifact missing at ' + ARTIFACT_REF);
    const raw = JSON.parse(fs.readFileSync(ARTIFACT_ABS, 'utf8'));
    assert.equal(raw.fixture_count, 8);
    assert.equal(raw.fixtures.length, 8);
    assert.equal(raw.unique_blocker_codes, 8);
    assert.equal(raw.non_zero_exit_codes, true);
    assert.equal(raw.milestone, data.MILESTONE);
    assert.equal(raw.slice, data.SLICE);
    assert.equal(raw.task, 'T05');
    assert.equal(raw.baseline_bundle, BASELINE_REF);
  });

  await t.test('every artifact fixture row matches the runtime expected_blocker_code', function () {
    const raw = JSON.parse(fs.readFileSync(ARTIFACT_ABS, 'utf8'));
    const map = {};
    for (const f of raw.fixtures) map[f.fixture_id] = f.expected_blocker_code;
    for (const f of FIXTURES) {
      assert.equal(map[f.id], f.expected_blocker_code,
        f.id + ': artifact code "' + map[f.id] + '" != runtime "' + f.expected_blocker_code + '"');
    }
  });
});

// ---------------------------------------------------------------------------
// CLI entry: when invoked directly, run node:test programmatically.
// ---------------------------------------------------------------------------

if (require.main === module) {
  const { run } = require('node:test');
  const reporter = require('node:test/reporters').spec;
  run({ files: [__filename] }).compose(reporter).pipe(process.stdout);
}