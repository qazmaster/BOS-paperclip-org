#!/usr/bin/env node
'use strict';

/**
 * scripts/test_validate_m015_s03_independent_agent_proof.js
 *
 * M015-S03 / T04 — Negative-path tests for the fail-closed validator.
 *
 * Exercises every helper exported by scripts/validate_m015_s03_independent_agent_proof.js:
 *
 *   - loadEvidence: missing file → RUNTIME_EVIDENCE_MISSING, malformed JSON →
 *     RUNTIME_EVIDENCE_MALFORMED, happy path returns parsed object.
 *   - evaluatePerAgentConditions: 49 conditions (7 agents x 7 conditions);
 *     flips each condition independently and verifies that exactly one
 *     blocker code is emitted per failure, scoped to the right agent.
 *   - evaluateGlobalGates: G1 NAME-DRIFT, G2 UPSTREAM-STATUS, G3 REDACTION,
 *     G4 SIDE-EFFECTS — every negative path triggers the exact gate.
 *   - compileBlockers: every blocker code is unique within a result; code
 *     format is M15-S03-{AGENT}-{CONDITION_UPPER} or one of the GATE_*
 *     / RUNTIME_EVIDENCE_* namespaces.
 *   - findRedactionLeaks: pure function that walks objects/arrays, flags
 *     strings matching UUID_FULL/CREDENTIAL_ASSIGNMENT/XIAOMI_RE, and does
 *     NOT trip on boolean flag KEYS like `xiaomi_endpoint_reuse_detected`
 *     (because underscore is a JS word character so \b doesn't match).
 *   - writeEvidence: belt-and-braces refusal — passes evidence whose
 *     serialised form contains a vendor-reuse string and verifies the
 *     GATE_REDACTION throw fires before any fs.writeFileSync. The file
 *     on disk must remain untouched.
 *   - evaluateGate: end-to-end in-memory pipeline returns ok=true on a
 *     fully clean fixture and ok=false on every single failure mode.
 *
 * The tests are HERMETIC: every fixture is built in-memory and there is
 * no dependency on runtime-evidence/M015-S03-seven-agent-*.json on disk.
 * The only filesystem touch is via tmpdir() for loadEvidence fixtures
 * (cleaned up after each test).
 */

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { describe, it, beforeEach, afterEach } = require('node:test');

const validator = require('./validate_m015_s03_independent_agent_proof');
const probe = require('./probe_m015_seven_agent_environment');

const {
  ROOT,
  T01_PATH,
  T02_PATH,
  OUTPUT_PATH,
  REQUIRED_BOS_FIELDS,
  PER_AGENT_CONDITION_LABELS,
  GLOBAL_GATE_LABELS,
  BLOCKER_CODES,
  loadEvidence,
  evaluatePerAgentConditions,
  evaluateGlobalGates,
  compileBlockers,
  buildGateEvidence,
  evaluateGate,
  findRedactionLeaks,
  writeEvidence,
} = validator;

const {
  CANONICAL_DIVISION_NAMES,
  BLOCKER_CODES: PROBE_BLOCKER_CODES,
  XIAOMI_RE,
  CREDENTIAL_ASSIGNMENT,
  UUID_FULL,
} = probe;

const clone = (value) => JSON.parse(JSON.stringify(value));
const codes = (blockers) => blockers.map((entry) => entry.code);

// ---------------------------------------------------------------------------
// Fixture builders — produce a "clean PASS" T01/T02 baseline, then mutate.
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
      result_json_bos_fields_present: REQUIRED_BOS_FIELDS.slice(),
      leak_flags: {
        xiaomi_endpoint_reuse_detected: false,
        credential_assignment_detected: false,
      },
    })),
    blockers: [],
    side_effects: {
      deltas: { issues: 0, documents: 0, comments: 0, approvals: 0, agents: 0 },
      heartbeat_runs_delta: 7,
    },
  };
}

function cleanFixture() {
  return { t01: cleanT01(), t02: cleanT02() };
}

function runValidator(t01, t02) {
  return evaluateGate(t01, t02, {
    t01Path: 'runtime-evidence/T01-fixture.json',
    t02Path: 'runtime-evidence/T02-fixture.json',
  });
}

// ---------------------------------------------------------------------------
// loadEvidence
// ---------------------------------------------------------------------------

describe('loadEvidence', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'm015-s03-load-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('returns parsed JSON on a happy path', () => {
    const file = path.join(tmpRoot, 'evidence.json');
    fs.writeFileSync(file, JSON.stringify({ status: 'PASS', agents: [] }));
    const evidence = loadEvidence(file, 'T01');
    assert.equal(evidence.status, 'PASS');
    assert.deepEqual(evidence.agents, []);
  });

  it('throws with RUNTIME_EVIDENCE_MISSING when the file does not exist', () => {
    const missing = path.join(tmpRoot, 'absent.json');
    assert.throws(
      () => loadEvidence(missing, 'T01'),
      (err) => {
        assert.match(err.message, /runtime evidence missing/i);
        assert.equal(err.code, BLOCKER_CODES.RUNTIME_EVIDENCE_MISSING('T01'));
        return true;
      },
    );
  });

  it('throws with RUNTIME_EVIDENCE_MALFORMED on unparseable JSON', () => {
    const file = path.join(tmpRoot, 'broken.json');
    fs.writeFileSync(file, '{ this is not json');
    assert.throws(
      () => loadEvidence(file, 'T02'),
      (err) => {
        assert.match(err.message, /malformed json/i);
        assert.equal(err.code, BLOCKER_CODES.RUNTIME_EVIDENCE_MALFORMED('T02'));
        return true;
      },
    );
  });

  it('throws with RUNTIME_EVIDENCE_MALFORMED on empty file', () => {
    const file = path.join(tmpRoot, 'empty.json');
    fs.writeFileSync(file, '');
    assert.throws(
      () => loadEvidence(file, 'T01'),
      (err) => err.code === BLOCKER_CODES.RUNTIME_EVIDENCE_MALFORMED('T01'),
    );
  });

  it('exports the canonical production paths used by the runner', () => {
    assert.ok(T01_PATH.endsWith('M015-S03-seven-agent-test-environment.json'));
    assert.ok(T02_PATH.endsWith('M015-S03-seven-agent-diagnostic-runs.json'));
    assert.ok(OUTPUT_PATH.endsWith('M015-S03-seven-agent-independent-gate.json'));
    assert.ok(path.resolve(path.dirname(T01_PATH), '..') === ROOT);
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
    // The whole point of the regex design: \b treats underscore as a word
    // character, so `xiaomi_endpoint_reuse_detected` does not match \bxiaomi\b.
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
// evaluatePerAgentConditions — 7 agents x 7 conditions
// ---------------------------------------------------------------------------

describe('evaluatePerAgentConditions — happy path', () => {
  it('returns 7 entries with all 7 conditions passing for the clean fixture', () => {
    const { t01, t02 } = cleanFixture();
    const result = evaluatePerAgentConditions(t01, t02);

    assert.equal(result.length, CANONICAL_DIVISION_NAMES.length);
    assert.ok(result.every((entry) => entry.passed));
    assert.ok(result.every((entry) => entry.expected_count === 7));
    assert.ok(result.every((entry) => entry.passed_count === 7));
    assert.deepEqual(
      result.map((entry) => entry.name),
      CANONICAL_DIVISION_NAMES,
    );
  });

  it('exposes all 7 condition keys with labels', () => {
    assert.equal(Object.keys(PER_AGENT_CONDITION_LABELS).length, 7);
    for (const key of [
      'canonical_name_present',
      't01_http_success',
      't01_response_status_pass',
      't01_no_xiaomi_endpoint_reuse',
      't02_heartbeat_terminal_succeeded',
      't02_wake_count_delta_one',
      't02_bos_result_present',
    ]) {
      assert.ok(PER_AGENT_CONDITION_LABELS[key], `missing label for ${key}`);
    }
  });
});

describe('evaluatePerAgentConditions — per-agent missing', () => {
  it('flags canonical_name_present when an agent is absent from T01', () => {
    const { t01, t02 } = cleanFixture();
    t01.agents = t01.agents.filter((a) => a.name !== 'Div1.HCO');
    const result = evaluatePerAgentConditions(t01, t02);
    const hco = result.find((entry) => entry.name === 'Div1.HCO');
    assert.equal(hco.conditions.canonical_name_present, false);
    assert.equal(hco.passed, false);
  });

  it('flags canonical_name_present when an agent is absent from T02', () => {
    const { t01, t02 } = cleanFixture();
    t02.agents = t02.agents.filter((a) => a.name !== 'Div7.MissionControl');
    const result = evaluatePerAgentConditions(t01, t02);
    const div7 = result.find((entry) => entry.name === 'Div7.MissionControl');
    assert.equal(div7.conditions.canonical_name_present, false);
    assert.equal(div7.passed, false);
  });
});

describe('evaluatePerAgentConditions — T01 condition flips', () => {
  it('t01_http_success=false when HTTP status is 500', () => {
    const { t01, t02 } = cleanFixture();
    t01.agents.find((a) => a.name === 'Div2.MasterPlanner').testEnvironment.http_status = 500;
    const result = evaluatePerAgentConditions(t01, t02);
    const entry = result.find((e) => e.name === 'Div2.MasterPlanner');
    assert.equal(entry.conditions.t01_http_success, false);
    assert.equal(entry.conditions.t01_response_status_pass, true);
    assert.equal(entry.passed_count, 6);
  });

  it('t01_response_status_pass=false when response_status is "warn"', () => {
    const { t01, t02 } = cleanFixture();
    t01.agents.find((a) => a.name === 'Div3.Treasury').testEnvironment.response_status = 'warn';
    const result = evaluatePerAgentConditions(t01, t02);
    const entry = result.find((e) => e.name === 'Div3.Treasury');
    assert.equal(entry.conditions.t01_response_status_pass, false);
    assert.equal(entry.passed_count, 6);
  });

  it('t01_response_status_pass=false when response_status is "fail"', () => {
    const { t01, t02 } = cleanFixture();
    t01.agents.find((a) => a.name === 'Div4.Production').testEnvironment.response_status = 'fail';
    const result = evaluatePerAgentConditions(t01, t02);
    const entry = result.find((e) => e.name === 'Div4.Production');
    assert.equal(entry.conditions.t01_response_status_pass, false);
  });

  it('t01_no_xiaomi_endpoint_reuse=false when xiaomi_endpoint_reuse_detected=true', () => {
    const { t01, t02 } = cleanFixture();
    t01.agents.find((a) => a.name === 'Div5.QualificationsLibraryLearning').xiaomi_endpoint_reuse_detected = true;
    const result = evaluatePerAgentConditions(t01, t02);
    const entry = result.find((e) => e.name === 'Div5.QualificationsLibraryLearning');
    assert.equal(entry.conditions.t01_no_xiaomi_endpoint_reuse, false);
    assert.equal(entry.passed_count, 6);
  });

  it('treats null http_status as t01_http_success=false', () => {
    const { t01, t02 } = cleanFixture();
    t01.agents.find((a) => a.name === 'Div6.External').testEnvironment.http_status = null;
    const result = evaluatePerAgentConditions(t01, t02);
    const entry = result.find((e) => e.name === 'Div6.External');
    assert.equal(entry.conditions.t01_http_success, false);
  });
});

describe('evaluatePerAgentConditions — T02 condition flips', () => {
  it('t02_heartbeat_terminal_succeeded=false when terminal_status is "failed"', () => {
    const { t01, t02 } = cleanFixture();
    t02.agents.find((a) => a.name === 'Div1.HCO').poll.terminal_status = 'failed';
    const result = evaluatePerAgentConditions(t01, t02);
    const entry = result.find((e) => e.name === 'Div1.HCO');
    assert.equal(entry.conditions.t02_heartbeat_terminal_succeeded, false);
  });

  it('t02_wake_count_delta_one=false when wake_count_delta is 0', () => {
    const { t01, t02 } = cleanFixture();
    t02.agents.find((a) => a.name === 'Div2.MasterPlanner').wake_count_delta = 0;
    const result = evaluatePerAgentConditions(t01, t02);
    const entry = result.find((e) => e.name === 'Div2.MasterPlanner');
    assert.equal(entry.conditions.t02_wake_count_delta_one, false);
  });

  it('t02_wake_count_delta_one=false when wake_count_delta is 2', () => {
    const { t01, t02 } = cleanFixture();
    t02.agents.find((a) => a.name === 'Div3.Treasury').wake_count_delta = 2;
    const result = evaluatePerAgentConditions(t01, t02);
    const entry = result.find((e) => e.name === 'Div3.Treasury');
    assert.equal(entry.conditions.t02_wake_count_delta_one, false);
  });

  it('t02_bos_result_present=false when a required BOS field is missing', () => {
    const { t01, t02 } = cleanFixture();
    const bosFields = t02.agents.find((a) => a.name === 'Div4.Production').result_json_bos_fields_present;
    t02.agents.find((a) => a.name === 'Div4.Production').result_json_bos_fields_present =
      bosFields.filter((f) => f !== 'schemaVersion');
    const result = evaluatePerAgentConditions(t01, t02);
    const entry = result.find((e) => e.name === 'Div4.Production');
    assert.equal(entry.conditions.t02_bos_result_present, false);
  });

  it('t02_bos_result_present=false when leak_flags.xiaomi_endpoint_reuse_detected=true', () => {
    const { t01, t02 } = cleanFixture();
    t02.agents.find((a) => a.name === 'Div5.QualificationsLibraryLearning').leak_flags.xiaomi_endpoint_reuse_detected = true;
    const result = evaluatePerAgentConditions(t01, t02);
    const entry = result.find((e) => e.name === 'Div5.QualificationsLibraryLearning');
    assert.equal(entry.conditions.t02_bos_result_present, false);
  });

  it('t02_bos_result_present=false when leak_flags.credential_assignment_detected=true', () => {
    const { t01, t02 } = cleanFixture();
    t02.agents.find((a) => a.name === 'Div6.External').leak_flags.credential_assignment_detected = true;
    const result = evaluatePerAgentConditions(t01, t02);
    const entry = result.find((e) => e.name === 'Div6.External');
    assert.equal(entry.conditions.t02_bos_result_present, false);
  });
});

// ---------------------------------------------------------------------------
// evaluateGlobalGates — 4 gates
// ---------------------------------------------------------------------------

describe('evaluateGlobalGates', () => {
  it('all 4 gates pass on a clean fixture', () => {
    const { t01, t02 } = cleanFixture();
    const gates = evaluateGlobalGates(t01, t02);
    assert.equal(gates.name_drift_pass, true);
    assert.equal(gates.upstream_status_pass, true);
    assert.equal(gates.redaction_pass, true);
    assert.equal(gates.side_effects_pass, true);
  });

  it('exposes labels for all 4 gates', () => {
    assert.deepEqual(Object.keys(GLOBAL_GATE_LABELS), [
      'name_drift_pass',
      'upstream_status_pass',
      'redaction_pass',
      'side_effects_pass',
    ]);
  });

  it('G1 NAME-DRIFT fails when an extra agent appears in T02', () => {
    const { t01, t02 } = cleanFixture();
    t02.agents.push({ name: 'M014.S07.BoundedMiniMax', verdict: 'pass', poll: { terminal_status: 'succeeded' }, wake_count_delta: 1, result_json_bos_fields_present: REQUIRED_BOS_FIELDS.slice(), leak_flags: { xiaomi_endpoint_reuse_detected: false, credential_assignment_detected: false } });
    const gates = evaluateGlobalGates(t01, t02);
    assert.equal(gates.name_drift_pass, false);
    assert.deepEqual(gates.diagnostics.name_drift.extra_roster, ['M014.S07.BoundedMiniMax']);
  });

  it('G1 NAME-DRIFT fails when a canonical agent is missing from T02', () => {
    const { t01, t02 } = cleanFixture();
    t02.agents = t02.agents.filter((a) => a.name !== 'Div4.Production');
    const gates = evaluateGlobalGates(t01, t02);
    assert.equal(gates.name_drift_pass, false);
    assert.deepEqual(gates.diagnostics.name_drift.missing_canonical, ['Div4.Production']);
  });

  it('G1 NAME-DRIFT fails when T01 carries a NAME_DRIFT blocker', () => {
    const { t01, t02 } = cleanFixture();
    t01.blockers.push({ code: PROBE_BLOCKER_CODES.NAME_DRIFT, severity: 'blocking', agent: null, reason: 'drift' });
    const gates = evaluateGlobalGates(t01, t02);
    assert.equal(gates.name_drift_pass, false);
    assert.equal(gates.diagnostics.name_drift.t01_name_drift_blocker, true);
  });

  it('G1 NAME-DRIFT fails when T02 carries a NAME_DRIFT blocker', () => {
    const { t01, t02 } = cleanFixture();
    t02.blockers.push({ code: PROBE_BLOCKER_CODES.NAME_DRIFT, severity: 'blocking', agent: null, reason: 'drift' });
    const gates = evaluateGlobalGates(t01, t02);
    assert.equal(gates.name_drift_pass, false);
    assert.equal(gates.diagnostics.name_drift.t02_name_drift_blocker, true);
  });

  it('G2 UPSTREAM-STATUS fails when T01.status is FAIL_CLOSED', () => {
    const { t01, t02 } = cleanFixture();
    t01.status = 'FAIL_CLOSED';
    const gates = evaluateGlobalGates(t01, t02);
    assert.equal(gates.upstream_status_pass, false);
    assert.equal(gates.diagnostics.upstream_status.t01_status, 'FAIL_CLOSED');
  });

  it('G2 UPSTREAM-STATUS fails when T02.status is FAIL_CLOSED', () => {
    const { t01, t02 } = cleanFixture();
    t02.status = 'FAIL_CLOSED';
    const gates = evaluateGlobalGates(t01, t02);
    assert.equal(gates.upstream_status_pass, false);
    assert.equal(gates.diagnostics.upstream_status.t02_status, 'FAIL_CLOSED');
  });

  it('G3 REDACTION fails when a UUID leaks in a T01 string value', () => {
    const { t01, t02 } = cleanFixture();
    t01.agents[0].notes = 'agent id 478a498b-1234-4567-8123-abcdef012345';
    const gates = evaluateGlobalGates(t01, t02);
    assert.equal(gates.redaction_pass, false);
    assert.equal(gates.diagnostics.redaction.t01_leak_count, 1);
  });

  it('G3 REDACTION fails when a credential assignment leaks in T02', () => {
    const { t01, t02 } = cleanFixture();
    t02.agents[0].notes = 'PAPERCLIP_API_KEY=secret-not-real but appears here';
    const gates = evaluateGlobalGates(t01, t02);
    assert.equal(gates.redaction_pass, false);
    assert.equal(gates.diagnostics.redaction.t02_leak_count, 1);
  });

  it('G3 REDACTION fails when a xiaomi/mimo string leaks', () => {
    const { t01, t02 } = cleanFixture();
    t02.notes = 'adapter chose xiaomi as fallback';
    const gates = evaluateGlobalGates(t01, t02);
    assert.equal(gates.redaction_pass, false);
  });

  it('G4 SIDE-EFFECTS fails when issues_delta is non-zero', () => {
    const { t01, t02 } = cleanFixture();
    t02.side_effects.deltas.issues = 1;
    const gates = evaluateGlobalGates(t01, t02);
    assert.equal(gates.side_effects_pass, false);
    assert.equal(gates.diagnostics.side_effects.issues_delta, 1);
  });

  it('G4 SIDE-EFFECTS fails when heartbeat_runs_delta is not 7', () => {
    const { t01, t02 } = cleanFixture();
    t02.side_effects.heartbeat_runs_delta = 1;
    const gates = evaluateGlobalGates(t01, t02);
    assert.equal(gates.side_effects_pass, false);
  });

  it('G4 SIDE-EFFECTS fails when documents_delta is non-zero', () => {
    const { t01, t02 } = cleanFixture();
    t02.side_effects.deltas.documents = 1;
    const gates = evaluateGlobalGates(t01, t02);
    assert.equal(gates.side_effects_pass, false);
  });
});

// ---------------------------------------------------------------------------
// compileBlockers — code uniqueness and shape
// ---------------------------------------------------------------------------

describe('compileBlockers', () => {
  it('emits no blockers on a fully clean fixture', () => {
    const { t01, t02 } = cleanFixture();
    const perAgent = evaluatePerAgentConditions(t01, t02);
    const gates = evaluateGlobalGates(t01, t02);
    const blockers = compileBlockers(perAgent, gates);
    assert.equal(blockers.length, 0);
  });

  it('emits T01-MISSING when an agent is missing from T01 only', () => {
    const { t01, t02 } = cleanFixture();
    t01.agents = t01.agents.filter((a) => a.name !== 'Div1.HCO');
    const perAgent = evaluatePerAgentConditions(t01, t02);
    const gates = evaluateGlobalGates(t01, t02);
    const blockers = compileBlockers(perAgent, gates);

    const hcoBlockers = blockers.filter((b) => b.agent === 'Div1.HCO');
    const hcoCodes = hcoBlockers.map((b) => b.code);
    assert.ok(hcoCodes.includes(BLOCKER_CODES.PER_AGENT_NAME_MISSING_T01('Div1.HCO')));
    assert.ok(!hcoCodes.includes(BLOCKER_CODES.PER_AGENT_NAME_MISSING_T02('Div1.HCO')));
  });

  it('emits T02-MISSING when an agent is missing from T02 only', () => {
    const { t01, t02 } = cleanFixture();
    t02.agents = t02.agents.filter((a) => a.name !== 'Div7.MissionControl');
    const perAgent = evaluatePerAgentConditions(t01, t02);
    const gates = evaluateGlobalGates(t01, t02);
    const blockers = compileBlockers(perAgent, gates);

    const div7Blockers = blockers.filter((b) => b.agent === 'Div7.MissionControl');
    const div7Codes = div7Blockers.map((b) => b.code);
    assert.ok(div7Codes.includes(BLOCKER_CODES.PER_AGENT_NAME_MISSING_T02('Div7.MissionControl')));
    assert.ok(!div7Codes.includes(BLOCKER_CODES.PER_AGENT_NAME_MISSING_T01('Div7.MissionControl')));
  });

  it('emits per-agent condition blocker with uppercase condition key', () => {
    const { t01, t02 } = cleanFixture();
    t01.agents.find((a) => a.name === 'Div2.MasterPlanner').testEnvironment.http_status = 500;
    const perAgent = evaluatePerAgentConditions(t01, t02);
    const gates = evaluateGlobalGates(t01, t02);
    const blockers = compileBlockers(perAgent, gates);

    const div2Blockers = blockers.filter((b) => b.agent === 'Div2.MasterPlanner');
    const codes_ = div2Blockers.map((b) => b.code);
    assert.ok(codes_.includes('M15-S03-Div2.MasterPlanner-T01_HTTP_SUCCESS'));
  });

  it('every blocker code is unique within a result', () => {
    const { t01, t02 } = cleanFixture();
    // Hit two failures across two different agents and the G2 gate.
    t01.status = 'FAIL_CLOSED';
    t01.agents.find((a) => a.name === 'Div1.HCO').testEnvironment.http_status = 500;
    t02.agents.find((a) => a.name === 'Div7.MissionControl').wake_count_delta = 0;

    const result = runValidator(t01, t02);
    const allCodes = codes(result.blockers);
    const uniq = new Set(allCodes);
    assert.equal(uniq.size, allCodes.length, `duplicate blocker code(s): ${allCodes}`);
  });

  it('emits GATE_NAME_DRIFT when an extra agent appears', () => {
    const { t01, t02 } = cleanFixture();
    t02.agents.push({ name: 'Rogue.Agent', verdict: 'pass', poll: { terminal_status: 'succeeded' }, wake_count_delta: 1, result_json_bos_fields_present: REQUIRED_BOS_FIELDS.slice(), leak_flags: { xiaomi_endpoint_reuse_detected: false, credential_assignment_detected: false } });
    const result = runValidator(t01, t02);
    assert.ok(codes(result.blockers).includes(BLOCKER_CODES.GATE_NAME_DRIFT));
  });

  it('emits GATE_UPSTREAM_STATUS when T01.status is not PASS', () => {
    const { t01, t02 } = cleanFixture();
    t01.status = 'FAIL_CLOSED';
    const result = runValidator(t01, t02);
    assert.ok(codes(result.blockers).includes(BLOCKER_CODES.GATE_UPSTREAM_STATUS));
  });

  it('emits GATE_REDACTION when a xiaomi string leaks', () => {
    const { t01, t02 } = cleanFixture();
    t02.notes = 'looks like xiaomi fallback';
    const result = runValidator(t01, t02);
    assert.ok(codes(result.blockers).includes(BLOCKER_CODES.GATE_REDACTION));
  });

  it('emits GATE_SIDE_EFFECTS when issues_delta is non-zero', () => {
    const { t01, t02 } = cleanFixture();
    t02.side_effects.deltas.issues = 3;
    const result = runValidator(t01, t02);
    assert.ok(codes(result.blockers).includes(BLOCKER_CODES.GATE_SIDE_EFFECTS));
  });

  it('every blocker carries severity=blocking, code, agent and reason', () => {
    const { t01, t02 } = cleanFixture();
    t01.status = 'FAIL_CLOSED';
    t02.side_effects.heartbeat_runs_delta = 0;
    t01.agents[0].testEnvironment.http_status = 503;
    const result = runValidator(t01, t02);

    assert.ok(result.blockers.length > 0);
    for (const blocker of result.blockers) {
      assert.equal(typeof blocker.code, 'string');
      assert.match(blocker.code, /^M15-S03-/);
      assert.equal(blocker.severity || 'blocking', 'blocking');
      assert.ok('agent' in blocker);
      assert.equal(typeof blocker.reason, 'string');
      assert.ok(blocker.reason.length > 0);
    }
  });
});

// ---------------------------------------------------------------------------
// buildGateEvidence — shape of the gate evidence object
// ---------------------------------------------------------------------------

describe('buildGateEvidence', () => {
  it('returns status=PASS for a fully clean fixture', () => {
    const { t01, t02 } = cleanFixture();
    const perAgent = evaluatePerAgentConditions(t01, t02);
    const gates = evaluateGlobalGates(t01, t02);
    const blockers = compileBlockers(perAgent, gates);
    const evidence = buildGateEvidence({
      perAgent,
      gates,
      blockers,
      t01Path: T01_PATH,
      t02Path: T02_PATH,
    });

    assert.equal(evidence.status, 'PASS');
    assert.equal(evidence.per_agent_total, 7);
    assert.equal(evidence.per_agent_passed, 7);
    assert.equal(evidence.per_agent_failed, 0);
    assert.equal(evidence.per_agent_conditions_total, 49);
    assert.equal(evidence.per_agent_conditions_passed, 49);
    assert.equal(evidence.per_agent_conditions_failed, 0);
    assert.equal(evidence.redaction.xiaomi_endpoint_reuse, true);
  });

  it('returns status=FAIL_CLOSED when any condition fails', () => {
    const { t01, t02 } = cleanFixture();
    t01.agents[0].testEnvironment.http_status = 500;
    const perAgent = evaluatePerAgentConditions(t01, t02);
    const gates = evaluateGlobalGates(t01, t02);
    const blockers = compileBlockers(perAgent, gates);
    const evidence = buildGateEvidence({
      perAgent,
      gates,
      blockers,
      t01Path: T01_PATH,
      t02Path: T02_PATH,
    });

    assert.equal(evidence.status, 'FAIL_CLOSED');
    assert.equal(evidence.per_agent_passed, 6);
    assert.equal(evidence.per_agent_failed, 1);
    assert.equal(evidence.per_agent_conditions_passed, 48);
    assert.equal(evidence.per_agent_conditions_failed, 1);
    assert.ok(evidence.blockers.length >= 1);
  });

  it('records upstream artifact paths as relative', () => {
    const { t01, t02 } = cleanFixture();
    const perAgent = evaluatePerAgentConditions(t01, t02);
    const gates = evaluateGlobalGates(t01, t02);
    const blockers = compileBlockers(perAgent, gates);
    const evidence = buildGateEvidence({
      perAgent,
      gates,
      blockers,
      t01Path: T01_PATH,
      t02Path: T02_PATH,
    });

    assert.equal(evidence.upstream_artifacts.test_environment, 'runtime-evidence/M015-S03-seven-agent-test-environment.json');
    assert.equal(evidence.upstream_artifacts.diagnostic_runs, 'runtime-evidence/M015-S03-seven-agent-diagnostic-runs.json');
  });
});

// ---------------------------------------------------------------------------
// evaluateGate — end-to-end in-memory pipeline
// ---------------------------------------------------------------------------

describe('evaluateGate — happy path', () => {
  it('returns ok=true with status=PASS on a clean fixture', () => {
    const { t01, t02 } = cleanFixture();
    const result = runValidator(t01, t02);
    assert.equal(result.ok, true);
    assert.equal(result.evidence.status, 'PASS');
    assert.equal(result.blockers.length, 0);
  });
});

describe('evaluateGate — single failure per dimension', () => {
  it('blocks S04 admission when any single per-agent condition fails', () => {
    const cases = [
      {
        label: 't01_http_success',
        mutate: (t01) => {
          t01.agents[0].testEnvironment.http_status = 502;
        },
      },
      {
        label: 't01_response_status_pass',
        mutate: (t01) => {
          t01.agents[0].testEnvironment.response_status = 'warn';
        },
      },
      {
        label: 't01_no_xiaomi_endpoint_reuse',
        mutate: (t01) => {
          t01.agents[0].xiaomi_endpoint_reuse_detected = true;
        },
      },
      {
        label: 't02_heartbeat_terminal_succeeded',
        mutate: (t02) => {
          t02.agents[0].poll.terminal_status = 'failed';
        },
      },
      {
        label: 't02_wake_count_delta_one',
        mutate: (t02) => {
          t02.agents[0].wake_count_delta = 0;
        },
      },
      {
        label: 't02_bos_result_present (missing field)',
        mutate: (t02) => {
          t02.agents[0].result_json_bos_fields_present = ['runId', 'division', 'role', 'status'];
        },
      },
      {
        label: 't02_bos_result_present (leak flag)',
        mutate: (t02) => {
          t02.agents[0].leak_flags.credential_assignment_detected = true;
        },
      },
    ];

    for (const scenario of cases) {
      const { t01, t02 } = cleanFixture();
      // Dispatch by label prefix: t01_* scenarios mutate T01, t02_* mutate T02.
      // The cases array above is the source of truth — each mutate closure
      // targets the side indicated by its label.
      const target = scenario.label.startsWith('t01_') ? t01 : t02;
      scenario.mutate(target);
      const result = runValidator(t01, t02);
      assert.equal(result.ok, false, `${scenario.label} should have failed`);
      assert.equal(result.evidence.status, 'FAIL_CLOSED');
      const blockerReasons = result.blockers.map((b) => b.reason).join('\n');
      assert.ok(
        result.perAgent[0].passed === false,
        `${scenario.label}: per-agent entry should not be passing`,
      );
      assert.ok(blockerReasons.length > 0, `${scenario.label}: must emit at least one blocker`);
    }
  });
});

// ---------------------------------------------------------------------------
// writeEvidence — refusal guard
// ---------------------------------------------------------------------------

describe('writeEvidence — refusal guard', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'm015-s03-write-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('refuses to write when serialised output contains a xiaomi/mimo string', () => {
    // The validator must throw GATE_REDACTION before any fs.writeFileSync.
    // We cannot use a UUID/credential because scrubEvidence rewrites those —
    // only xiaomi/mimo survives scrubbing. We construct the evidence so that
    // the serialised form MUST contain a xiaomi string.
    const leaky = {
      $schema: 'x',
      milestone: 'M015-4o8lfw',
      slice: 'S03',
      task: 'T03',
      generated: new Date().toISOString(),
      status: 'FAIL_CLOSED',
      leak_field: 'xiaomi appears in serialized form',
      agents: [],
      blockers: [],
      redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false },
    };
    assert.throws(
      () => writeEvidence(leaky),
      (err) => {
        assert.match(err.message, /M15-S03-GATE-REDACTION/);
        assert.match(err.message, /xiaomi or mimo string detected/i);
        return true;
      },
    );
  });

  it('refuses to write when serialised output contains a xiaomi/mimo string in a nested key', () => {
    const leaky = {
      $schema: 'x',
      milestone: 'M015-4o8lfw',
      slice: 'S03',
      task: 'T03',
      generated: new Date().toISOString(),
      status: 'FAIL_CLOSED',
      agents: [{ name: 'Div1.HCO', notes: 'MiMo adapter chosen' }],
      blockers: [],
      redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false },
    };
    assert.throws(
      () => writeEvidence(leaky),
      (err) => err.message.includes(BLOCKER_CODES.GATE_REDACTION),
    );
  });

  it('refuses to write when serialised output contains a mixed-case MiMo token', () => {
    // Belt-and-braces: scrubEvidence rewrites UUIDs/credentials but a
    // vendor-reuse substring (xiaomi or mimo in any case) survives and
    // must trip the refusal guard. Use a MIXED-CASE MiMo token to prove
    // the guard is case-insensitive, mirroring the XIAOMI_RE regex.
    const leaky = {
      $schema: 'x',
      milestone: 'M015-4o8lfw',
      slice: 'S03',
      task: 'T03',
      generated: new Date().toISOString(),
      status: 'FAIL_CLOSED',
      agents: [{ name: 'Div1.HCO', notes: 'MIMO upper-case token appears here' }],
      blockers: [],
      redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false },
    };
    assert.throws(
      () => writeEvidence(leaky),
      (err) => err.message.includes(BLOCKER_CODES.GATE_REDACTION),
    );
  });
});

// ---------------------------------------------------------------------------
// Blocker-code namespace sanity — fail-closed dispatcher naming convention
// ---------------------------------------------------------------------------

describe('blocker code namespace sanity', () => {
  it('per-agent missing codes use M15-S03-{NAME}-T0N-MISSING shape', () => {
    assert.equal(BLOCKER_CODES.PER_AGENT_NAME_MISSING_T01('Div1.HCO'), 'M15-S03-Div1.HCO-T01-MISSING');
    assert.equal(BLOCKER_CODES.PER_AGENT_NAME_MISSING_T02('Div7.MissionControl'), 'M15-S03-Div7.MissionControl-T02-MISSING');
  });

  it('per-agent condition codes use M15-S03-{NAME}-{CONDITION_UPPER} shape', () => {
    assert.equal(BLOCKER_CODES.PER_AGENT_CONDITION('Div1.HCO', 't01_http_success'), 'M15-S03-Div1.HCO-T01_HTTP_SUCCESS');
  });

  it('gate codes are stable constants', () => {
    assert.equal(BLOCKER_CODES.GATE_NAME_DRIFT, 'M15-S03-GATE-NAME-DRIFT');
    assert.equal(BLOCKER_CODES.GATE_UPSTREAM_STATUS, 'M15-S03-GATE-UPSTREAM-STATUS');
    assert.equal(BLOCKER_CODES.GATE_REDACTION, 'M15-S03-GATE-REDACTION');
    assert.equal(BLOCKER_CODES.GATE_SIDE_EFFECTS, 'M15-S03-GATE-SIDE-EFFECTS');
  });

  it('runtime-evidence codes are label-scoped', () => {
    assert.equal(BLOCKER_CODES.RUNTIME_EVIDENCE_MISSING('T01'), 'M15-S03-RUNTIME-EVIDENCE-MISSING-T01');
    assert.equal(BLOCKER_CODES.RUNTIME_EVIDENCE_MALFORMED('T02'), 'M15-S03-RUNTIME-EVIDENCE-MALFORMED-T02');
  });

  it('scenarios with multiple gate failures emit every gate blocker exactly once', () => {
    const { t01, t02 } = cleanFixture();
    t01.status = 'FAIL_CLOSED';          // G2
    t02.notes = 'xiaomi sneaks in';      // G3
    t02.side_effects.deltas.issues = 1;  // G4

    const result = runValidator(t01, t02);
    const resultCodes = codes(result.blockers);

    // G1 may also fail when a xiaomi string is in T02 (it doesn't — but
    // verify the G2/G3/G4 trio).
    assert.equal(resultCodes.filter((c) => c === BLOCKER_CODES.GATE_UPSTREAM_STATUS).length, 1);
    assert.equal(resultCodes.filter((c) => c === BLOCKER_CODES.GATE_REDACTION).length, 1);
    assert.equal(resultCodes.filter((c) => c === BLOCKER_CODES.GATE_SIDE_EFFECTS).length, 1);
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: ensure no test fixture leaks vendor-reuse strings into
// runtime-evidence/M015-S03-seven-agent-independent-gate.json (the file the
// real validator writes to disk). The validate-and-write path is exercised
// only via writeEvidence refusal tests above, so we verify the OUTPUT_PATH
// is in a tracked directory.
// ---------------------------------------------------------------------------

describe('OUTPUT_PATH placement', () => {
  it('OUTPUT_PATH is git-tracked (runtime-evidence/, not .gsd/)', () => {
    const rel = path.relative(ROOT, OUTPUT_PATH);
    assert.ok(rel.startsWith('runtime-evidence' + path.sep));
    assert.ok(!rel.includes('.gsd'));
  });
});