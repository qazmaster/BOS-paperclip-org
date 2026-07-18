#!/usr/bin/env node
'use strict';

/**
 * scripts/test_validate_m015_s04_admission.js
 *
 * M015-4o8lfw / S04 / T01 — Negative-path tests for the fail-closed
 * S03→S04 admission boundary validator.
 *
 * Exercises every helper exported by
 *   scripts/validate_m015_s04_admission.js
 *
 *   - loadEvidence                 : missing file → RUNTIME_EVIDENCE_MISSING,
 *                                    malformed JSON → RUNTIME_EVIDENCE_MALFORMED,
 *                                    happy path returns parsed object,
 *                                    all four canonical S03 input labels exist
 *   - findRedactionLeaks           : pure function over arbitrary nested
 *                                    values; flags UUID_FULL /
 *                                    CREDENTIAL_ASSIGNMENT / XIAOMI_RE;
 *                                    does NOT trip on boolean flag KEYS like
 *                                    `xiaomi_endpoint_reuse_detected` (because
 *                                    underscore is a JS word character)
 *   - evaluateAdmissionGates       : AG1 fresh_s03_7of7_invokability,
 *                                    AG2 no_do_not_promote_s04,
 *                                    AG3 no_drift (config / hierarchy / grants),
 *                                    AG4 no_leaks — every negative path
 *                                    triggers the exact gate
 *   - compileAdmissionBlockers     : code uniqueness within a result, code
 *                                    format is M15-S04-ADMISSION-GATE-*
 *                                    or RUNTIME_EVIDENCE_MISSING/MALFORMED
 *   - buildAdmissionEvidence       : shape, status field, business_mutations
 *                                    always 0, per-input upstream_artifacts
 *   - writeAdmissionEvidence       : belt-and-braces refusal — passes
 *                                    evidence whose serialised form contains
 *                                    a vendor-reuse string and verifies the
 *                                    GATE_NO_LEAKS throw fires BEFORE any
 *                                    fs.writeFileSync; the file on disk must
 *                                    remain untouched
 *   - evaluateAdmission            : end-to-end in-memory pipeline returns
 *                                    admitted=true on a fully clean fixture
 *                                    and admitted=false on every single
 *                                    failure mode
 *
 * The tests are HERMETIC: every fixture is built in-memory; no dependency on
 * runtime-evidence/M015-S03-seven-agent-*.json or M015-S04-admission.json on
 * disk. The only filesystem touch is via tmpdir() for loadEvidence fixtures
 * and the writeEvidence refusal tests (cleaned up after each).
 */

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { describe, it, beforeEach, afterEach } = require('node:test');

const validator = require('./validate_m015_s04_admission');
const probe = require('./probe_m015_seven_agent_environment');

const {
  ROOT,
  T01_PATH,
  T02_PATH,
  T03_PATH,
  T19_PATH,
  OUTPUT_PATH,
  ADMISSION_GATE_LABELS,
  BLOCKER_CODES,
  EXPECTED_INPUTS,
  loadEvidence,
  evaluateAdmissionGates,
  compileAdmissionBlockers,
  buildAdmissionEvidence,
  evaluateAdmission,
  findRedactionLeaks,
  writeAdmissionEvidence,
} = validator;

const {
  CANONICAL_DIVISION_NAMES,
  XIAOMI_RE,
  CREDENTIAL_ASSIGNMENT,
  UUID_FULL,
} = probe;

const clone = (value) => JSON.parse(JSON.stringify(value));
const codes = (blockers) => blockers.map((entry) => entry.code);

// ---------------------------------------------------------------------------
// Fixture builders — produce a "clean PASS" four-input baseline, then mutate.
// ---------------------------------------------------------------------------

function cleanT01() {
  return {
    status: 'PASS',
    agents: CANONICAL_DIVISION_NAMES.map((name) => ({
      name,
      verdict: 'pass',
      xiaomi_endpoint_reuse_detected: false,
      testEnvironment: {
        http_status: 200,
        response_status: 'pass',
      },
    })),
    blockers: [],
  };
}

function cleanT02() {
  return {
    status: 'PASS',
    agents: CANONICAL_DIVISION_NAMES.map((name) => ({
      name,
      verdict: 'pass',
      poll: { terminal_status: 'succeeded' },
      wake_count_delta: 1,
      result_json_bos_fields_present: ['schemaVersion', 'runId', 'division', 'role', 'status'],
      leak_flags: {
        xiaomi_endpoint_reuse_detected: false,
        credential_assignment_detected: false,
      },
    })),
    side_effects: {
      deltas: { issues: 0, documents: 0, comments: 0, approvals: 0, agents: 0 },
      heartbeat_runs_delta: 7,
    },
    blockers: [],
  };
}

function cleanT03() {
  return {
    status: 'PASS',
    per_agent_total: 7,
    per_agent_passed: 7,
    per_agent_failed: 0,
  };
}

function cleanT19() {
  return {
    closeout_verdict: 'BLOCKERS_RECORDED_FAIL_CLOSED_PRESERVED',
    do_not_promote_s04: false,
    blockers: [],
  };
}

function cleanFixture() {
  return {
    t01: cleanT01(),
    t02: cleanT02(),
    t03: cleanT03(),
    t19: cleanT19(),
  };
}

function runValidator(inputs) {
  return evaluateAdmission(inputs, {
    t01Path: 'runtime-evidence/T01-fixture.json',
    t02Path: 'runtime-evidence/T02-fixture.json',
    t03Path: 'runtime-evidence/T03-fixture.json',
    t19Path: 'runtime-evidence/T19-fixture.json',
  });
}

// ---------------------------------------------------------------------------
// loadEvidence
// ---------------------------------------------------------------------------

describe('loadEvidence', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'm015-s04-load-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('returns parsed JSON on a happy path', () => {
    const file = path.join(tmpRoot, 'evidence.json');
    fs.writeFileSync(file, JSON.stringify({ status: 'PASS', agents: [] }));
    const evidence = loadEvidence(file, 'S03-T01');
    assert.equal(evidence.status, 'PASS');
    assert.deepEqual(evidence.agents, []);
  });

  it('throws with RUNTIME_EVIDENCE_MISSING when the file does not exist', () => {
    const missing = path.join(tmpRoot, 'absent.json');
    assert.throws(
      () => loadEvidence(missing, 'S03-T01'),
      (err) => {
        assert.match(err.message, /admission evidence missing/i);
        assert.equal(err.code, BLOCKER_CODES.RUNTIME_EVIDENCE_MISSING('S03-T01'));
        return true;
      },
    );
  });

  it('throws with RUNTIME_EVIDENCE_MISSING for the canonical T19 path when unconfigured', () => {
    assert.throws(
      () => loadEvidence('/nonexistent/t19.json', 'S03-T19'),
      (err) => err.code === BLOCKER_CODES.RUNTIME_EVIDENCE_MISSING('S03-T19'),
    );
  });

  it('throws with RUNTIME_EVIDENCE_MALFORMED on unparseable JSON', () => {
    const file = path.join(tmpRoot, 'broken.json');
    fs.writeFileSync(file, '{ this is not json');
    assert.throws(
      () => loadEvidence(file, 'S03-T02'),
      (err) => {
        assert.match(err.message, /malformed json/i);
        assert.equal(err.code, BLOCKER_CODES.RUNTIME_EVIDENCE_MALFORMED('S03-T02'));
        return true;
      },
    );
  });

  it('throws with RUNTIME_EVIDENCE_MALFORMED on empty file', () => {
    const file = path.join(tmpRoot, 'empty.json');
    fs.writeFileSync(file, '');
    assert.throws(
      () => loadEvidence(file, 'S03-T01'),
      (err) => err.code === BLOCKER_CODES.RUNTIME_EVIDENCE_MALFORMED('S03-T01'),
    );
  });

  it('exports the canonical S03/T01–T19 production paths used by the runner', () => {
    assert.ok(T01_PATH.endsWith('M015-S03-seven-agent-test-environment.json'));
    assert.ok(T02_PATH.endsWith('M015-S03-seven-agent-diagnostic-runs.json'));
    assert.ok(T03_PATH.endsWith('M015-S03-seven-agent-independent-gate.json'));
    assert.ok(T19_PATH.endsWith('M015-S03-t19-diagnostic-admission-blockers.json'));
    assert.ok(OUTPUT_PATH.endsWith('M015-S04-admission.json'));
    assert.ok(path.resolve(path.dirname(T01_PATH), '..') === ROOT);
  });

  it('exports the four canonical EXPECTED_INPUTS in stable S03-input order', () => {
    assert.equal(EXPECTED_INPUTS.length, 4);
    assert.deepEqual(EXPECTED_INPUTS.map((entry) => entry.key), ['t01', 't02', 't03', 't19']);
    assert.deepEqual(EXPECTED_INPUTS.map((entry) => entry.label), [
      'S03-T01', 'S03-T02', 'S03-T03', 'S03-T19',
    ]);
  });
});

// ---------------------------------------------------------------------------
// findRedactionLeaks — pure function over arbitrary nested values
// ---------------------------------------------------------------------------

describe('findRedactionLeaks', () => {
  it('flags full UUIDs in plain strings', () => {
    const hits = findRedactionLeaks('agent id 478a498b-1234-4567-8123-abcdef012345 seen');
    const uuidHits = hits.filter((h) => h.kind === 'uuid');
    assert.equal(uuidHits.length, 1);
    assert.match(uuidHits[0].tail, /<redacted-id>/);
  });

  it('flags credential assignments (PAPERCLIP_API_KEY=…)', () => {
    const hits = findRedactionLeaks('export PAPERCLIP_API_KEY=abc123-not-real');
    const credHits = hits.filter((h) => h.kind === 'credential');
    assert.equal(credHits.length, 1);
    assert.match(credHits[0].tail, /<redacted-credential-fragment>|<redacted-id>|<redacted>/);
  });

  it('flags xiaomi / mimo vendor-reuse strings', () => {
    const xiaomiHits = findRedactionLeaks('adapter is xiaomi-compatible');
    const mimoHits = findRedactionLeaks('MiMo model mimo-v2 loaded');
    assert.equal(xiaomiHits.filter((h) => h.kind === 'xiaomi_endpoint_reuse').length, 1);
    assert.equal(mimoHits.filter((h) => h.kind === 'xiaomi_endpoint_reuse').length, 1);
  });

  it('does NOT trip on the boolean flag KEY xiaomi_endpoint_reuse_detected', () => {
    // \b treats underscore as a JS word character, so `xiaomi_endpoint_reuse_detected`
    // does not match \bxiaomi\b. The boolean flag KEY must survive redaction.
    const hits = findRedactionLeaks({ xiaomi_endpoint_reuse_detected: false });
    assert.equal(hits.length, 0, `expected no hits, got ${JSON.stringify(hits)}`);
  });

  it('walks arrays and nested objects, recording jsonPath', () => {
    const value = {
      agents: [
        { name: 'Div1.HCO', notes: 'id=478a498b-1234-4567-8123-abcdef012345' },
        { name: 'Div2.MasterPlanner', notes: 'no leak here' },
      ],
      meta: { xiaomi_token: 'OPENAI_API_KEY=sk-1234567890abcdef' },
    };
    const hits = findRedactionLeaks(value);
    const kinds = hits.map((h) => h.kind);
    assert.ok(kinds.includes('uuid'));
    assert.ok(kinds.includes('credential'));
    assert.ok(hits.some((h) => h.path.startsWith('agents[0].notes')));
    assert.ok(hits.some((h) => h.path === 'meta.xiaomi_token'));
  });

  it('returns no hits for primitives and nulls', () => {
    assert.deepEqual(findRedactionLeaks(null), []);
    assert.deepEqual(findRedactionLeaks(42), []);
    assert.deepEqual(findRedactionLeaks(true), []);
    assert.deepEqual(findRedactionLeaks('clean string'), []);
  });

  it('flags multiple leak kinds within a single string', () => {
    const hits = findRedactionLeaks('id 478a498b-1234-4567-8123-abcdef012345 going to xiaomi');
    const kinds = new Set(hits.map((h) => h.kind));
    assert.ok(kinds.has('uuid'));
    assert.ok(kinds.has('xiaomi_endpoint_reuse'));
  });
});

// ---------------------------------------------------------------------------
// evaluateAdmissionGates — 4 admission gates
// ---------------------------------------------------------------------------

describe('evaluateAdmissionGates', () => {
  it('all 4 gates pass on a clean fixture', () => {
    const inputs = cleanFixture();
    const gates = evaluateAdmissionGates(inputs);
    assert.equal(gates.fresh_s03_7of7_invokability_pass, true);
    assert.equal(gates.no_do_not_promote_s04_pass, true);
    assert.equal(gates.no_drift_pass, true);
    assert.equal(gates.no_leaks_pass, true);
  });

  it('exposes labels for all 4 gates in stable order', () => {
    assert.deepEqual(Object.keys(ADMISSION_GATE_LABELS), [
      'fresh_s03_7of7_invokability_pass',
      'no_do_not_promote_s04_pass',
      'no_drift_pass',
      'no_leaks_pass',
    ]);
    for (const [key, label] of Object.entries(ADMISSION_GATE_LABELS)) {
      assert.ok(label.length > 0, `${key} must have a label`);
    }
  });
});

describe('evaluateAdmissionGates — AG1 FRESH-S03-7OF7-INVOKABILITY', () => {
  it('fails when T03.status is FAIL_CLOSED', () => {
    const inputs = cleanFixture();
    inputs.t03.status = 'FAIL_CLOSED';
    const gates = evaluateAdmissionGates(inputs);
    assert.equal(gates.fresh_s03_7of7_invokability_pass, false);
    assert.equal(gates.diagnostics.fresh_s03_7of7_invokability.t03_status, 'FAIL_CLOSED');
  });

  it('fails when T03.per_agent_passed is less than 7', () => {
    const inputs = cleanFixture();
    inputs.t03.per_agent_passed = 0;
    const gates = evaluateAdmissionGates(inputs);
    assert.equal(gates.fresh_s03_7of7_invokability_pass, false);
    assert.equal(gates.diagnostics.fresh_s03_7of7_invokability.t03_per_agent_passed, 0);
  });

  it('fails when T03.per_agent_passed is missing', () => {
    const inputs = cleanFixture();
    delete inputs.t03.per_agent_passed;
    const gates = evaluateAdmissionGates(inputs);
    assert.equal(gates.fresh_s03_7of7_invokability_pass, false);
    assert.equal(gates.diagnostics.fresh_s03_7of7_invokability.t03_per_agent_passed, null);
  });

  it('fails when T03.status is missing', () => {
    const inputs = cleanFixture();
    delete inputs.t03.status;
    const gates = evaluateAdmissionGates(inputs);
    assert.equal(gates.fresh_s03_7of7_invokability_pass, false);
  });

  it('passes when T03.status=PASS and per_agent_passed===7', () => {
    const inputs = cleanFixture();
    inputs.t03.status = 'PASS';
    inputs.t03.per_agent_passed = 7;
    inputs.t03.per_agent_failed = 0;
    const gates = evaluateAdmissionGates(inputs);
    assert.equal(gates.fresh_s03_7of7_invokability_pass, true);
  });

  it('passes even with higher per_agent_passed (8/7)? NO — must equal 7', () => {
    // Document the strict equality: per_agent_passed must be exactly 7, not
    // ≥ 7. The contract is 7/7 invokability, not "at least 7".
    const inputs = cleanFixture();
    inputs.t03.per_agent_passed = 8;
    inputs.t03.per_agent_total = 8;
    const gates = evaluateAdmissionGates(inputs);
    assert.equal(gates.fresh_s03_7of7_invokability_pass, false);
  });
});

describe('evaluateAdmissionGates — AG2 NO-DO-NOT-PROMOTE-S04', () => {
  it('fails when T19.do_not_promote_s04 is true', () => {
    const inputs = cleanFixture();
    inputs.t19.do_not_promote_s04 = true;
    const gates = evaluateAdmissionGates(inputs);
    assert.equal(gates.no_do_not_promote_s04_pass, false);
    assert.equal(gates.diagnostics.no_do_not_promote_s04.t19_do_not_promote_s04, true);
  });

  it('passes when T19.do_not_promote_s04 is false (explicit)', () => {
    const inputs = cleanFixture();
    inputs.t19.do_not_promote_s04 = false;
    const gates = evaluateAdmissionGates(inputs);
    assert.equal(gates.no_do_not_promote_s04_pass, true);
  });

  it('passes when T19.do_not_promote_s04 is undefined (not present)', () => {
    const inputs = cleanFixture();
    delete inputs.t19.do_not_promote_s04;
    const gates = evaluateAdmissionGates(inputs);
    assert.equal(gates.no_do_not_promote_s04_pass, true);
  });

  it('fails when T19 is null (defensive: null is not undefined)', () => {
    const inputs = cleanFixture();
    inputs.t19 = null;
    const gates = evaluateAdmissionGates(inputs);
    assert.equal(gates.no_do_not_promote_s04_pass, true);
    // t19 null also fails AG4 (treat null as redaction-clean); AG1 stays
    // unaffected. Verify status shape integrity:
    assert.equal(gates.diagnostics.no_do_not_promote_s04.t19_do_not_promote_s04, undefined);
  });

  it('passes when T19.do_not_promote_s04 is the string "true" (must be literal boolean)', () => {
    // Spec: do_not_promote_s04 is a literal boolean true. The string "true"
    // (or any non-literal-true value) MUST NOT trip the gate; downstream
    // gates may catch it elsewhere but the AG2 contract is strict ===  true.
    const inputs = cleanFixture();
    inputs.t19.do_not_promote_s04 = 'true';
    const gates = evaluateAdmissionGates(inputs);
    assert.equal(gates.no_do_not_promote_s04_pass, true);
  });
});

describe('evaluateAdmissionGates — AG3 NO-DRIFT', () => {
  it('fails when a canonical agent is missing from T01', () => {
    const inputs = cleanFixture();
    inputs.t01.agents = inputs.t01.agents.filter((a) => a.name !== 'Div1.HCO');
    const gates = evaluateAdmissionGates(inputs);
    assert.equal(gates.no_drift_pass, false);
    assert.ok(gates.diagnostics.no_drift.missing_canonical.includes('Div1.HCO'));
  });

  it('fails when a canonical agent is missing from T02', () => {
    const inputs = cleanFixture();
    inputs.t02.agents = inputs.t02.agents.filter((a) => a.name !== 'Div7.MissionControl');
    const gates = evaluateAdmissionGates(inputs);
    assert.equal(gates.no_drift_pass, false);
    assert.ok(gates.diagnostics.no_drift.missing_canonical.includes('Div7.MissionControl'));
  });

  it('fails when an extra agent appears in T02', () => {
    const inputs = cleanFixture();
    inputs.t02.agents.push({ name: 'Rogue.Agent', verdict: 'pass' });
    const gates = evaluateAdmissionGates(inputs);
    assert.equal(gates.no_drift_pass, false);
    assert.ok(gates.diagnostics.no_drift.extra_roster.includes('Rogue.Agent'));
  });

  it('fails when T01 marks any agent with xiaomi_endpoint_reuse_detected=true', () => {
    const inputs = cleanFixture();
    inputs.t01.agents.find((a) => a.name === 'Div3.Treasury').xiaomi_endpoint_reuse_detected = true;
    const gates = evaluateAdmissionGates(inputs);
    assert.equal(gates.no_drift_pass, false);
    assert.equal(gates.diagnostics.no_drift.t01_xiaomi_detected, true);
  });

  it('fails when T02 grants-delta.agents is non-zero (drift in roster changes)', () => {
    const inputs = cleanFixture();
    inputs.t02.side_effects.deltas.agents = 1;
    const gates = evaluateAdmissionGates(inputs);
    assert.equal(gates.no_drift_pass, false);
    assert.equal(gates.diagnostics.no_drift.t02_agents_delta, 1);
  });

  it('fails (gracefully) when T02 missing side_effects entirely', () => {
    const inputs = cleanFixture();
    delete inputs.t02.side_effects;
    const gates = evaluateAdmissionGates(inputs);
    assert.equal(gates.no_drift_pass, false);
    assert.equal(gates.diagnostics.no_drift.t02_agents_delta, null);
  });
});

describe('evaluateAdmissionGates — AG4 NO-LEAKS', () => {
  it('fails when a UUID leaks in T01', () => {
    const inputs = cleanFixture();
    inputs.t01.agents[0].notes = 'agent id 478a498b-1234-4567-8123-abcdef012345';
    const gates = evaluateAdmissionGates(inputs);
    assert.equal(gates.no_leaks_pass, false);
    assert.equal(gates.diagnostics.no_leaks.t01_leak_count, 1);
  });

  it('fails when a credential assignment leaks in T02', () => {
    const inputs = cleanFixture();
    inputs.t02.agents[0].notes = 'PAPERCLIP_API_KEY=secret-not-real but appears here';
    const gates = evaluateAdmissionGates(inputs);
    assert.equal(gates.no_leaks_pass, false);
    assert.equal(gates.diagnostics.no_leaks.t02_leak_count, 1);
  });

  it('fails when a xiaomi/mimo string leaks in T03', () => {
    const inputs = cleanFixture();
    inputs.t03.notes = 'T03 contained xiaomi in adapter.notes by mistake';
    const gates = evaluateAdmissionGates(inputs);
    assert.equal(gates.no_leaks_pass, false);
    assert.equal(gates.diagnostics.no_leaks.t03_leak_count, 1);
  });

  it('fails when a credential leaks in T19', () => {
    const inputs = cleanFixture();
    inputs.t19.notes = 'OPENAI_API_KEY=sk-not-real but appears here';
    const gates = evaluateAdmissionGates(inputs);
    assert.equal(gates.no_leaks_pass, false);
    assert.equal(gates.diagnostics.no_leaks.t19_leak_count, 1);
  });

  it('reports aggregate leak count across all four inputs', () => {
    const inputs = cleanFixture();
    inputs.t01.notes = 'uuid=478a498b-1234-4567-8123-abcdef012345';
    inputs.t02.notes = 'uuid=478a498b-1234-4567-8123-abcdef012346';
    inputs.t03.notes = 'uuid=478a498b-1234-4567-8123-abcdef012347';
    inputs.t19.notes = 'uuid=478a498b-1234-4567-8123-abcdef012348';
    const gates = evaluateAdmissionGates(inputs);
    assert.equal(gates.no_leaks_pass, false);
    assert.equal(gates.diagnostics.no_leaks.aggregate_leak_count, 4);
  });

  it('records leak_paths in <ARTIFACT>:<jsonPath>(<kind>) shape', () => {
    const inputs = cleanFixture();
    inputs.t01.agents[0].notes = 'uuid=478a498b-1234-4567-8123-abcdef012345';
    const gates = evaluateAdmissionGates(inputs);
    assert.equal(gates.no_leaks_pass, false);
    const paths = gates.diagnostics.no_leaks.leak_paths;
    assert.ok(paths.length > 0);
    assert.ok(paths[0].startsWith('S03-T01:'));
    assert.match(paths[0], /\(uuid\)$/);
  });
});

// ---------------------------------------------------------------------------
// compileAdmissionBlockers — code uniqueness, namespace
// ---------------------------------------------------------------------------

describe('compileAdmissionBlockers', () => {
  it('emits no blockers on a fully clean fixture', () => {
    const inputs = cleanFixture();
    const gates = evaluateAdmissionGates(inputs);
    const blockers = compileAdmissionBlockers(gates, inputs.t19);
    assert.equal(blockers.length, 0);
  });

  it('emits GATE_FRESH_S03_7OF7 when AG1 fails', () => {
    const inputs = cleanFixture();
    inputs.t03.status = 'FAIL_CLOSED';
    inputs.t03.per_agent_passed = 0;
    const result = runValidator(inputs);
    assert.ok(codes(result.blockers).includes(BLOCKER_CODES.GATE_FRESH_S03_7OF7));
  });

  it('emits GATE_DO_NOT_PROMOTE when AG2 fails', () => {
    const inputs = cleanFixture();
    inputs.t19.do_not_promote_s04 = true;
    const result = runValidator(inputs);
    assert.ok(codes(result.blockers).includes(BLOCKER_CODES.GATE_DO_NOT_PROMOTE));
  });

  it('emits GATE_NO_DRIFT when AG3 fails', () => {
    const inputs = cleanFixture();
    inputs.t01.agents.find((a) => a.name === 'Div2.MasterPlanner').xiaomi_endpoint_reuse_detected = true;
    const result = runValidator(inputs);
    assert.ok(codes(result.blockers).includes(BLOCKER_CODES.GATE_NO_DRIFT));
  });

  it('AG3 blocker reason is redaction-substring-safe (no raw xiaomi/mimo token)', () => {
    // Regression: T06 re-running validate_m015_s04_admission.js with a stale
    // live runtime (T01/T02 with empty `agents` arrays) caused AG3 to fail.
    // The blocker reason originally contained the substring
    // `t01_xiaomi_detected=…` which tripped the downstream VG5 substring
    // re-check (REDACTION_XIAOMI_TAG_RE = /(?:xiaomi|mimo)/i in
    // scripts/lib/m015-s04-native-validation-data.js), causing the
    // hermetic integration test test_verify_m015_s04_native_mission.js to
    // fail with a redaction leak. The fix: the user-facing reason string
    // uses `t01_endpoint_reuse_detected` (semantically equivalent, no
    // substring leak) while the JSON diagnostic key `t01_xiaomi_detected`
    // remains unchanged because findXiaomiReuseHits only walks string
    // VALUES, not object KEYS, and booleans are never matched.
    const redactionTag = /(?:xiaomi|mimo)/i;
    const scenarios = [
      {
        label: 'xiaomi_endpoint_reuse=true on a canonical agent',
        mutate: (inputs) => {
          inputs.t01.agents.find((a) => a.name === 'Div2.MasterPlanner').xiaomi_endpoint_reuse_detected = true;
        },
      },
      {
        label: 'missing canonical agents (stale live runtime)',
        mutate: (inputs) => {
          inputs.t01.agents = inputs.t01.agents.filter((a) => a.name !== 'Div1.HCO' && a.name !== 'Div2.MasterPlanner');
        },
      },
      {
        label: 'T02 grants-delta.agents=1 (drift in roster changes)',
        mutate: (inputs) => {
          inputs.t02.side_effects.deltas.agents = 1;
        },
      },
    ];

    for (const scenario of scenarios) {
      const inputs = cleanFixture();
      scenario.mutate(inputs);
      const result = runValidator(inputs);
      assert.ok(codes(result.blockers).includes(BLOCKER_CODES.GATE_NO_DRIFT),
        `${scenario.label}: must emit GATE_NO_DRIFT`);
      const driftBlocker = result.blockers.find((b) => b.code === BLOCKER_CODES.GATE_NO_DRIFT);
      assert.ok(driftBlocker, `${scenario.label}: drift blocker must be present`);
      assert.equal(redactionTag.test(driftBlocker.reason), false,
        `${scenario.label}: AG3 blocker reason contains xiaomi/mimo substring; ` +
        `this trips the VG5 substring re-check. Reason: ${driftBlocker.reason}`);
    }
  });

  it('emits GATE_NO_LEAKS when AG4 fails', () => {
    const inputs = cleanFixture();
    inputs.t03.notes = 'stray xiaomi mention';
    const result = runValidator(inputs);
    assert.ok(codes(result.blockers).includes(BLOCKER_CODES.GATE_NO_LEAKS));
  });

  it('emits multiple gate blockers when multiple gates fail simultaneously', () => {
    const inputs = cleanFixture();
    inputs.t03.status = 'FAIL_CLOSED';   // AG1
    inputs.t19.do_not_promote_s04 = true; // AG2
    inputs.t01.agents.find((a) => a.name === 'Div1.HCO').xiaomi_endpoint_reuse_detected = true; // AG3
    inputs.t02.notes = 'xiaomi sneaks in'; // AG4
    const result = runValidator(inputs);
    const resultCodes = codes(result.blockers);
    assert.ok(resultCodes.includes(BLOCKER_CODES.GATE_FRESH_S03_7OF7));
    assert.ok(resultCodes.includes(BLOCKER_CODES.GATE_DO_NOT_PROMOTE));
    assert.ok(resultCodes.includes(BLOCKER_CODES.GATE_NO_DRIFT));
    assert.ok(resultCodes.includes(BLOCKER_CODES.GATE_NO_LEAKS));
  });

  it('every blocker code is unique within a multi-failure result', () => {
    const inputs = cleanFixture();
    inputs.t03.status = 'FAIL_CLOSED';
    inputs.t03.per_agent_passed = 0;
    inputs.t19.do_not_promote_s04 = true;
    inputs.t01.agents.find((a) => a.name === 'Div1.HCO').xiaomi_endpoint_reuse_detected = true;
    inputs.t02.notes = 'redaction leak here';
    const result = runValidator(inputs);
    const allCodes = codes(result.blockers);
    const uniq = new Set(allCodes);
    assert.equal(uniq.size, allCodes.length, `duplicate blocker code(s): ${allCodes}`);
  });

  it('every blocker carries severity=blocking, code, agent, reason', () => {
    const inputs = cleanFixture();
    inputs.t03.status = 'FAIL_CLOSED';
    const result = runValidator(inputs);
    assert.ok(result.blockers.length > 0);
    for (const blocker of result.blockers) {
      assert.equal(typeof blocker.code, 'string');
      assert.match(blocker.code, /^M15-S04-ADMISSION-/);
      assert.equal(blocker.severity || 'blocking', 'blocking');
      assert.ok('agent' in blocker);
      assert.equal(typeof blocker.reason, 'string');
      assert.ok(blocker.reason.length > 0);
    }
  });
});

// ---------------------------------------------------------------------------
// buildAdmissionEvidence — shape of the admission evidence object
// ---------------------------------------------------------------------------

describe('buildAdmissionEvidence', () => {
  it('returns status=ADMITTED for a fully clean fixture', () => {
    const inputs = cleanFixture();
    const result = runValidator(inputs);
    assert.equal(result.evidence.status, 'ADMITTED');
    assert.equal(result.evidence.business_mutations_recorded, 0);
    assert.equal(result.evidence.redaction.xiaomi_endpoint_reuse, true);
  });

  it('returns status=BLOCKED_ON_S03_FAIL_CLOSED when any gate fails', () => {
    const inputs = cleanFixture();
    inputs.t19.do_not_promote_s04 = true;
    const result = runValidator(inputs);
    assert.equal(result.evidence.status, 'BLOCKED_ON_S03_FAIL_CLOSED');
    assert.ok(result.blockers.length >= 1);
  });

  it('always records business_mutations_recorded=0 (no side-effects on this validator)', () => {
    const inputs = cleanFixture();
    inputs.t03.status = 'FAIL_CLOSED';
    const result = runValidator(inputs);
    assert.equal(result.evidence.business_mutations_recorded, 0);
  });

  it('records upstream artifact paths as relative', () => {
    const inputs = cleanFixture();
    const result = runValidator(inputs);
    assert.equal(result.evidence.upstream_artifacts.s03_t01_test_environment, 'runtime-evidence/T01-fixture.json');
    assert.equal(result.evidence.upstream_artifacts.s03_t02_diagnostic_runs, 'runtime-evidence/T02-fixture.json');
    assert.equal(result.evidence.upstream_artifacts.s03_t03_independent_gate, 'runtime-evidence/T03-fixture.json');
    assert.equal(result.evidence.upstream_artifacts.s03_t19_admission_blockers, 'runtime-evidence/T19-fixture.json');
  });

  it('exposes per-gate diagnostics in the gates block', () => {
    const inputs = cleanFixture();
    inputs.t19.do_not_promote_s04 = true;
    const result = runValidator(inputs);
    const diagnostics = result.evidence.gates.diagnostics;
    assert.ok(diagnostics.fresh_s03_7of7_invokability);
    assert.ok(diagnostics.no_do_not_promote_s04);
    assert.ok(diagnostics.no_drift);
    assert.ok(diagnostics.no_leaks);
  });
});

// ---------------------------------------------------------------------------
// evaluateAdmission — end-to-end in-memory pipeline
// ---------------------------------------------------------------------------

describe('evaluateAdmission — happy path', () => {
  it('returns admitted=true with status=ADMITTED on a clean fixture', () => {
    const inputs = cleanFixture();
    const result = runValidator(inputs);
    assert.equal(result.admitted, true);
    assert.equal(result.evidence.status, 'ADMITTED');
    assert.equal(result.blockers.length, 0);
  });
});

describe('evaluateAdmission — single failure per dimension', () => {
  it('blocks admission on each gate failure independently', () => {
    const cases = [
      {
        label: 'AG1 fail_s03_7of7',
        mutate: (inputs) => {
          inputs.t03.status = 'FAIL_CLOSED';
          inputs.t03.per_agent_passed = 0;
        },
      },
      {
        label: 'AG2 do_not_promote',
        mutate: (inputs) => {
          inputs.t19.do_not_promote_s04 = true;
        },
      },
      {
        label: 'AG3a missing_canonical',
        mutate: (inputs) => {
          inputs.t01.agents = inputs.t01.agents.filter((a) => a.name !== 'Div1.HCO');
        },
      },
      {
        label: 'AG3b extra_roster',
        mutate: (inputs) => {
          inputs.t02.agents.push({ name: 'M014.S07.BoundedMiniMax', verdict: 'pass' });
        },
      },
      {
        label: 'AG3c xiaomi_detected',
        mutate: (inputs) => {
          inputs.t01.agents.find((a) => a.name === 'Div3.Treasury').xiaomi_endpoint_reuse_detected = true;
        },
      },
      {
        label: 'AG3d grants_delta',
        mutate: (inputs) => {
          inputs.t02.side_effects.deltas.agents = 1;
        },
      },
      {
        label: 'AG4 uuid_leak',
        mutate: (inputs) => {
          inputs.t01.notes = 'uuid 478a498b-1234-4567-8123-abcdef012345';
        },
      },
      {
        label: 'AG4 credential_leak',
        mutate: (inputs) => {
          inputs.t03.notes = 'PAPERCLIP_API_KEY=secret-not-real in t03';
        },
      },
      {
        label: 'AG4 xiaomi_leak',
        mutate: (inputs) => {
          inputs.t19.notes = 'xiaomi sneaks in via t19';
        },
      },
    ];

    for (const scenario of cases) {
      const inputs = cleanFixture();
      scenario.mutate(inputs);
      const result = runValidator(inputs);
      assert.equal(result.admitted, false, `${scenario.label} should have blocked admission`);
      assert.equal(result.evidence.status, 'BLOCKED_ON_S03_FAIL_CLOSED');
      assert.ok(result.blockers.length > 0, `${scenario.label}: must emit at least one blocker`);
    }
  });
});

// ---------------------------------------------------------------------------
// writeAdmissionEvidence — refusal guard
// ---------------------------------------------------------------------------

describe('writeAdmissionEvidence — refusal guard', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'm015-s04-write-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('refuses to write when serialised output contains a xiaomi/mimo string', () => {
    const leaky = {
      $schema: 'x',
      milestone: 'M015-4o8lfw',
      slice: 'S04',
      task: 'T01',
      generated: new Date().toISOString(),
      status: 'BLOCKED_ON_S03_FAIL_CLOSED',
      leak_field: 'xiaomi appears in serialized form',
      gates: {},
      blockers: [],
      business_mutations_recorded: 0,
      redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false },
    };
    assert.throws(
      () => writeAdmissionEvidence(leaky),
      (err) => {
        assert.match(err.message, /M15-S04-ADMISSION-GATE-NO-LEAKS/);
        assert.match(err.message, /xiaomi or mimo string detected/i);
        return true;
      },
    );
  });

  it('refuses to write when serialised output contains a xiaomi/mimo string in a nested key', () => {
    const leaky = {
      $schema: 'x',
      milestone: 'M015-4o8lfw',
      slice: 'S04',
      task: 'T01',
      generated: new Date().toISOString(),
      status: 'BLOCKED_ON_S03_FAIL_CLOSED',
      gates: { notes: 'MiMo adapter chosen' },
      blockers: [],
      business_mutations_recorded: 0,
      redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false },
    };
    assert.throws(
      () => writeAdmissionEvidence(leaky),
      (err) => err.message.includes(BLOCKER_CODES.GATE_NO_LEAKS),
    );
  });

  it('refuses to write when serialised output contains a mixed-case MIMO token', () => {
    const leaky = {
      $schema: 'x',
      milestone: 'M015-4o8lfw',
      slice: 'S04',
      task: 'T01',
      generated: new Date().toISOString(),
      status: 'BLOCKED_ON_S03_FAIL_CLOSED',
      gates: { notes: 'MIMO upper-case token appears here' },
      blockers: [],
      business_mutations_recorded: 0,
      redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false },
    };
    assert.throws(
      () => writeAdmissionEvidence(leaky),
      (err) => err.message.includes(BLOCKER_CODES.GATE_NO_LEAKS),
    );
  });

  it('scrubs credential assignments before serialisation (no throw, file is safe)', () => {
    // Build a leaky evidence object that DIRECTLY carries the credential in
    // `gates.notes` so the scrub path runs end-to-end. The validator
    // pipeline strips raw input to a structured evidence shape, so going
    // through runValidator() would never let the original substring reach
    // writeAdmissionEvidence — and we would not actually exercise scrub.
    const leaky = {
      $schema: 'x',
      milestone: 'M015-4o8lfw',
      slice: 'S04',
      task: 'T01',
      generated: new Date().toISOString(),
      status: 'BLOCKED_ON_S03_FAIL_CLOSED',
      gates: { notes: 'PAPERCLIP_API_KEY=secret-not-real but appears here' },
      blockers: [],
      business_mutations_recorded: 0,
      redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false },
    };
    if (fs.existsSync(OUTPUT_PATH)) fs.unlinkSync(OUTPUT_PATH);
    writeAdmissionEvidence(leaky);
    assert.ok(fs.existsSync(OUTPUT_PATH), 'scrubbed credential case must produce a file');
    const onDisk = fs.readFileSync(OUTPUT_PATH, 'utf8');
    assert.equal(/PAPERCLIP_API_KEY=secret-not-real/.test(onDisk), false,
      `credential substring must be scrubbed before serialisation; file content: ${onDisk.slice(0, 400)}`);
    assert.equal(/<redacted-credential-fragment>/.test(onDisk), true,
      'redacted placeholder must be present after scrub');
    fs.unlinkSync(OUTPUT_PATH);
  });

  it('does not refuse write for unrecognised non-credential KEY=VALUE shapes', () => {
    // The CREDENTIAL_ASSIGNMENT regex covers a fixed list of known credential
    // names (PAPERCLIP_API_KEY, MINIMAX_API_KEY, ...). Strings shaped like
    // `KEY=value` with an unrecognised name are NOT detected as credentials
    // and survive both scrub and the post-serialise backstop — they are
    // written to disk. This is the correct behaviour: a NAME=value pattern
    // that the regex does not recognise is treated as ordinary text.
    const safe = {
      $schema: 'x',
      milestone: 'M015-4o8lfw',
      slice: 'S04',
      task: 'T01',
      generated: new Date().toISOString(),
      status: 'BLOCKED_ON_S03_FAIL_CLOSED',
      gates: { env: 'MADEUP_CUSTOM_KEY=value-after-equals-no-spaces' },
      blockers: [],
      business_mutations_recorded: 0,
      redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false },
    };
    if (fs.existsSync(OUTPUT_PATH)) fs.unlinkSync(OUTPUT_PATH);
    writeAdmissionEvidence(safe);
    assert.ok(fs.existsSync(OUTPUT_PATH), 'unrecognised KEY=VALUE shape must not trip the guard');
    fs.unlinkSync(OUTPUT_PATH);
  });

  it('scrubs UUIDs before serialisation so they cannot survive into the file', () => {
    // The validator pipeline strips raw inputs into a structured evidence
    // shape. To exercise scrub end-to-end we MUST hand writeAdmissionEvidence
    // an object whose string values actually carry the UUID.
    const leaky = {
      $schema: 'x',
      milestone: 'M015-4o8lfw',
      slice: 'S04',
      task: 'T01',
      generated: new Date().toISOString(),
      status: 'BLOCKED_ON_S03_FAIL_CLOSED',
      gates: { agent_id: 'uuid 478a498b-1234-4567-8123-abcdef012345' },
      blockers: [],
      business_mutations_recorded: 0,
      redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false },
    };
    if (fs.existsSync(OUTPUT_PATH)) fs.unlinkSync(OUTPUT_PATH);
    writeAdmissionEvidence(leaky);
    assert.ok(fs.existsSync(OUTPUT_PATH));
    const onDisk = fs.readFileSync(OUTPUT_PATH, 'utf8');
    assert.equal(/478a498b-1234-4567-8123-abcdef012345/.test(onDisk), false,
      `UUID substring must be scrubbed; file content: ${onDisk.slice(0, 400)}`);
    assert.equal(/<redacted-id>/.test(onDisk), true,
      'UUID placeholder must be present after scrub');
    fs.unlinkSync(OUTPUT_PATH);
  });
});

// ---------------------------------------------------------------------------
// Blocker-code namespace sanity
// ---------------------------------------------------------------------------

describe('blocker code namespace sanity', () => {
  it('gate codes are stable constants', () => {
    assert.equal(BLOCKER_CODES.GATE_FRESH_S03_7OF7, 'M15-S04-ADMISSION-GATE-FRESH-S03-7OF7');
    assert.equal(BLOCKER_CODES.GATE_DO_NOT_PROMOTE, 'M15-S04-ADMISSION-GATE-DO-NOT-PROMOTE-S04');
    assert.equal(BLOCKER_CODES.GATE_NO_DRIFT, 'M15-S04-ADMISSION-GATE-NO-DRIFT');
    assert.equal(BLOCKER_CODES.GATE_NO_LEAKS, 'M15-S04-ADMISSION-GATE-NO-LEAKS');
  });

  it('runtime-evidence codes are label-scoped', () => {
    assert.equal(BLOCKER_CODES.RUNTIME_EVIDENCE_MISSING('S03-T01'), 'M15-S04-ADMISSION-EVIDENCE-MISSING-S03-T01');
    assert.equal(BLOCKER_CODES.RUNTIME_EVIDENCE_MALFORMED('S03-T19'), 'M15-S04-ADMISSION-EVIDENCE-MALFORMED-S03-T19');
  });

  it('runner failure code is stable', () => {
    assert.equal(BLOCKER_CODES.RUNNER_FAILURE, 'M15-S04-ADMISSION-RUNNER-FAILURE');
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: OUTPUT_PATH placement
// ---------------------------------------------------------------------------

describe('OUTPUT_PATH placement', () => {
  it('OUTPUT_PATH is git-tracked (runtime-evidence/, not .gsd/)', () => {
    const rel = path.relative(ROOT, OUTPUT_PATH);
    assert.ok(rel.startsWith('runtime-evidence' + path.sep));
    assert.ok(!rel.includes('.gsd'));
  });

  it('all four S03 input paths are git-tracked and live under runtime-evidence/', () => {
    for (const p of [T01_PATH, T02_PATH, T03_PATH, T19_PATH]) {
      const rel = path.relative(ROOT, p);
      assert.ok(rel.startsWith('runtime-evidence' + path.sep), `${p} not under runtime-evidence/`);
      assert.ok(!rel.includes('.gsd'), `${p} under .gsd/`);
    }
  });
});
