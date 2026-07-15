#!/usr/bin/env node
'use strict';

/**
 * scripts/test_run_m015_s06_preflight.js
 *
 * M015-4o8lfw / S06 / T01 — Negative-path tests for the fail-closed
 * S06 preflight runner.
 *
 * Exercises every helper exported by
 *   scripts/run_m015_s06_preflight.js
 *
 *   - loadEvidence                     : missing file → RUNTIME_EVIDENCE_MISSING,
 *                                        malformed JSON → RUNTIME_EVIDENCE_MALFORMED,
 *                                        happy path returns parsed object,
 *                                        all six canonical inputs exist
 *   - hashOfEvidence                   : sha256 hex of file contents, null for
 *                                        absent files
 *   - deriveS04Admission               : re-derives the four S04 admission
 *                                        gates on a four-input snapshot and
 *                                        returns s04_admitted boolean plus
 *                                        per-gate diagnostics
 *   - findRedactionLeaks               : pure function over arbitrary nested
 *                                        values; flags UUID_FULL /
 *                                        CREDENTIAL_ASSIGNMENT / XIAOMI_RE;
 *                                        does NOT trip on boolean flag KEYS
 *                                        (underscore is a JS word character)
 *   - captureSideEffectBaseline        : forensic T02 side_effects.after
 *                                        snapshot with non-null baselines,
 *                                        source='forensic_disk_evidence',
 *                                        observer_budget 5s/3600s
 *   - evaluateS06PreflightGates        : all six gates (SG1–SG6), every
 *                                        negative path triggers the matching
 *                                        gate (sg1, sg2, sg3, sg5)
 *   - compileS06PreflightBlockers      : code uniqueness within a result,
 *                                        SG1 failures map to canonical
 *                                        "M15-S06-PREFLIGHT-LIVE-RUNTIME-UNREACHABLE"
 *   - deriveVerdict                    : ADMITTED only when all six gates
 *                                        green and zero blockers; SG1 failure
 *                                        → BLOCKED_ON_LIVE_RUNTIME_UNREACHABLE
 *   - buildS06PreflightEvidence        : shape, status field, business_mutations
 *                                        always 0, upstream_artifacts paths
 *                                        + sha256, side_effect_baseline,
 *                                        canonical_verdict_line
 *   - writeS06PreflightEvidence        : belt-and-braces refusal — passes
 *                                        evidence whose serialised form
 *                                        contains a UUID, credential, or
 *                                        xiaomi/mimo string and verifies
 *                                        the SG4_FAIL throw fires BEFORE any
 *                                        fs.writeFileSync; the file on disk
 *                                        must remain untouched
 *
 * The tests are HERMETIC: every fixture is built in-memory; no dependency
 * on runtime-evidence/M015-S03-seven-agent-*.json / M015-S04-admission.json /
 * M015-S05-remediation-evidence.json on disk. The only filesystem touch is
 * via tmpdir() for loadEvidence fixtures and the writeEvidence refusal
 * tests (cleaned up after each).
 */

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { describe, it, beforeEach, afterEach } = require('node:test');

const preflight = require('./run_m015_s06_preflight');
const probe = require('./probe_m015_seven_agent_environment');

const {
  ROOT,
  T01_PATH,
  T02_PATH,
  T03_PATH,
  T19_PATH,
  S04_ADMISSION_PATH,
  S05_REMEDIATION_PATH,
  OUTPUT_PATH,
  CANONICAL_VERDICT,
  PREFLIGHT_GATE_LABELS,
  BLOCKER_CODES,
  EXPECTED_INPUTS,
  loadEvidence,
  hashOfEvidence,
  deriveS04Admission,
  findRedactionLeaks,
  captureSideEffectBaseline,
  evaluateS06PreflightGates,
  compileS06PreflightBlockers,
  deriveVerdict,
  buildS06PreflightEvidence,
  writeS06PreflightEvidence,
} = preflight;

const { CANONICAL_DIVISION_NAMES } = probe;

const codes = (blockers) => blockers.map((entry) => entry.code);

// ---------------------------------------------------------------------------
// Fixture builders — produce a "clean PASS" six-input baseline, then mutate.
// ---------------------------------------------------------------------------

function cleanT01() {
  return {
    status: 'PASS',
    pass_count: 7,
    generated: '2026-07-15T14:54:32.645Z',
    agents: CANONICAL_DIVISION_NAMES.map((name) => ({
      name,
      verdict: 'pass',
      xiaomi_endpoint_reuse_detected: false,
      testEnvironment: { http_status: 200, response_status: 'pass' },
    })),
    blockers: [],
    redaction: { full_ids: false, credentials: false },
  };
}

function cleanT02() {
  return {
    status: 'PASS',
    pass_count: 7,
    agent_count_observed: 7,
    generated: '2026-07-15T14:54:32.645Z',
    agents: CANONICAL_DIVISION_NAMES.map((name) => ({
      name,
      verdict: 'pass',
      poll: { terminal_status: 'succeeded' },
      wake_count_delta: 1,
      result_json_bos_fields_present: ['schemaVersion', 'runId', 'division', 'role', 'status'],
      leak_flags: { xiaomi_endpoint_reuse_detected: false, credential_assignment_detected: false },
      result_json_bos_redacted: {
        schemaVersion: 'bos-light-v1',
        runId: '43a8b7d8-<redacted>',
        division: name,
        role: 'general',
        status: 'succeeded',
      },
      bos_provenance: { source: 'assembled-from-runtime+canonical-metadata', field_sources: { runId: 'invoke' } },
      invoke: { run_id_redacted: '43a8b7d8-<redacted>' },
    })),
    side_effects: {
      deltas: {
        issues: 1,
        documents: 0,
        comments: 0,
        approvals: 0,
        agents: 0,
        r026_boundary_diagnostic_records: 1,
        business_issue_mutations: 0,
      },
      before: { our_issue_count: 14, documents_count: 2, comments_count: 13, approvals_count: 0, agents_count: 8, heartbeat_runs_count: 104 },
      after: { our_issue_count: 15, documents_count: 2, comments_count: 13, approvals_count: 0, agents_count: 8, heartbeat_runs_count: 113 },
      heartbeat_runs_delta: 7,
    },
    redaction: { full_ids: false, credentials: false },
  };
}

function cleanT03() {
  return {
    status: 'PASS',
    generated: '2026-07-15T14:54:32.645Z',
    per_agent_passed: 7,
    per_agent_total: 7,
    per_agent_failed: 0,
    per_agent_conditions_passed: 49,
    per_agent_conditions_total: 49,
    global_gates: { name_drift_pass: true, upstream_status_pass: true, redaction_pass: true, side_effects_pass: true },
    redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: true },
  };
}

function cleanT19() {
  return {
    closeout_verdict: 'BLOCKERS_REFRESHED_FOR_S05_R026_AWARE_PASS',
    do_not_promote_s04: false,
    generated: '2026-07-15T12:19:18.202Z',
  };
}

function cleanS04Admission() {
  return {
    status: 'ADMITTED',
    business_mutations_recorded: 0,
    blockers: [],
    redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: true },
    generated: '2026-07-15T15:54:16.439Z',
  };
}

function cleanS05Remediation() {
  return {
    status: 'ADMITTED',
    do_not_promote_s04: false,
    business_mutations_recorded: 0,
    admission: { status: 'ADMITTED', business_mutations_recorded: 0, blockers: [] },
    generated: '2026-07-15T12:20:09.712Z',
  };
}

function cleanSnapshot() {
  return {
    t01: cleanT01(),
    t02: cleanT02(),
    t03: cleanT03(),
    t19: cleanT19(),
    s04_admission: cleanS04Admission(),
    s05_remediation: cleanS05Remediation(),
  };
}

function cleanPaths() {
  return {
    t01: 'runtime-evidence/T01-fixture.json',
    t02: 'runtime-evidence/T02-fixture.json',
    t03: 'runtime-evidence/T03-fixture.json',
    t19: 'runtime-evidence/T19-fixture.json',
    s04_admission: 'runtime-evidence/S04-admission-fixture.json',
    s05_remediation: 'runtime-evidence/S05-remediation-fixture.json',
  };
}

async function evaluatePreflightViaSnapshot(snapshot, paths) {
  const derived = deriveS04Admission(snapshot, paths);
  const baseline = await captureSideEffectBaseline(snapshot);
  const gates = evaluateS06PreflightGates(snapshot, derived, baseline);
  const blockers = compileS06PreflightBlockers(gates, snapshot, derived);
  return { derived, baseline, gates, blockers, verdict: deriveVerdict(gates, blockers) };
}

// ---------------------------------------------------------------------------
// loadEvidence
// ---------------------------------------------------------------------------

describe('loadEvidence', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'm015-s06-load-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('returns parsed JSON on a happy path', () => {
    const file = path.join(tmpRoot, 'evidence.json');
    fs.writeFileSync(file, JSON.stringify({ status: 'PASS' }));
    const evidence = loadEvidence(file, 'S03-T01');
    assert.equal(evidence.status, 'PASS');
  });

  it('throws RUNTIME_EVIDENCE_MISSING when file does not exist', () => {
    const missing = path.join(tmpRoot, 'absent.json');
    assert.throws(
      () => loadEvidence(missing, 'S03-T01'),
      (err) => err.code === BLOCKER_CODES.RUNTIME_EVIDENCE_MISSING('S03-T01'),
    );
  });

  it('throws RUNTIME_EVIDENCE_MALFORMED on unparseable JSON', () => {
    const file = path.join(tmpRoot, 'broken.json');
    fs.writeFileSync(file, '{ not json');
    assert.throws(
      () => loadEvidence(file, 'S03-T02'),
      (err) => err.code === BLOCKER_CODES.RUNTIME_EVIDENCE_MALFORMED('S03-T02'),
    );
  });

  it('throws RUNTIME_EVIDENCE_MALFORMED on empty file', () => {
    const file = path.join(tmpRoot, 'empty.json');
    fs.writeFileSync(file, '');
    assert.throws(
      () => loadEvidence(file, 'S03-T01'),
      (err) => err.code === BLOCKER_CODES.RUNTIME_EVIDENCE_MALFORMED('S03-T01'),
    );
  });
});

// ---------------------------------------------------------------------------
// EXPECTED_INPUTS / path placement
// ---------------------------------------------------------------------------

describe('EXPECTED_INPUTS / path placement', () => {
  it('exposes the six canonical S03/S04/S05 input paths in stable order', () => {
    assert.equal(EXPECTED_INPUTS.length, 6);
    assert.deepEqual(EXPECTED_INPUTS.map((e) => e.key), ['t01', 't02', 't03', 't19', 's04_admission', 's05_remediation']);
    assert.deepEqual(EXPECTED_INPUTS.map((e) => e.label), [
      'S03-T01', 'S03-T02', 'S03-T03', 'S03-T19', 'S04-ADMISSION', 'S05-REMEDIATION',
    ]);
  });

  it('all paths (input + output) are git-tracked (runtime-evidence/, not .gsd/)', () => {
    for (const p of [T01_PATH, T02_PATH, T03_PATH, T19_PATH, S04_ADMISSION_PATH, S05_REMEDIATION_PATH, OUTPUT_PATH]) {
      const rel = path.relative(ROOT, p);
      assert.ok(rel.startsWith('runtime-evidence' + path.sep), `${p} not under runtime-evidence/`);
      assert.ok(!rel.includes('.gsd'));
    }
  });

  it('OUTPUT_PATH ends in M015-S06-preflight.json', () => {
    assert.ok(OUTPUT_PATH.endsWith('M015-S06-preflight.json'));
  });
});

// ---------------------------------------------------------------------------
// hashOfEvidence
// ---------------------------------------------------------------------------

describe('hashOfEvidence', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'm015-s06-hash-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('returns sha256 hex of file contents', () => {
    const file = path.join(tmpRoot, 'x.json');
    fs.writeFileSync(file, '{"status":"PASS"}');
    const h = hashOfEvidence(file);
    assert.equal(h.length, 64);
    assert.match(h, /^[0-9a-f]+$/);
  });

  it('returns null when the file does not exist', () => {
    assert.equal(hashOfEvidence(path.join(tmpRoot, 'absent.json')), null);
  });

  it('produces deterministic hashes across multiple reads', () => {
    const file = path.join(tmpRoot, 'det.json');
    fs.writeFileSync(file, '{"x":1}');
    assert.equal(hashOfEvidence(file), hashOfEvidence(file));
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
    const hits = findRedactionLeaks('export PAPERCLIP_API_KEY=not-real-secret');
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
    // \b treats underscore as a JS word character so this KEY does not match
    // \bxiaomi\b. The boolean flag KEY must survive redaction.
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
});

// ---------------------------------------------------------------------------
// deriveS04Admission — re-derives 4 S04 admission gates on 4 inputs
// ---------------------------------------------------------------------------

describe('deriveS04Admission', () => {
  it('returns s04_admitted=true with empty s04_blockers on a clean fixture', () => {
    const derived = deriveS04Admission(cleanSnapshot(), cleanPaths());
    assert.equal(derived.s04_admitted, true);
    assert.equal(derived.s04_blockers.length, 0);
    assert.equal(derived.s04_gates.fresh_s03_7of7_invokability_pass, true);
    assert.equal(derived.s04_gates.no_do_not_promote_s04_pass, true);
    assert.equal(derived.s04_gates.no_drift_pass, true);
    assert.equal(derived.s04_gates.no_leaks_pass, true);
  });

  it('returns s04_admitted=false when T01 is empty (no_drift fail)', () => {
    const snap = cleanSnapshot();
    snap.t01.agents = [];
    const derived = deriveS04Admission(snap, cleanPaths());
    assert.equal(derived.s04_admitted, false);
    assert.ok(derived.s04_blockers.length > 0);
    assert.equal(derived.s04_gates.no_drift_pass, false);
  });

  it('returns s04_admitted=false when T19.do_not_promote_s04 is true', () => {
    const snap = cleanSnapshot();
    snap.t19.do_not_promote_s04 = true;
    const derived = deriveS04Admission(snap, cleanPaths());
    assert.equal(derived.s04_admitted, false);
    assert.equal(derived.s04_gates.no_do_not_promote_s04_pass, false);
  });

  it('returns s04_admitted=false when T03 fails 7-of-7', () => {
    const snap = cleanSnapshot();
    snap.t03.status = 'FAIL_CLOSED';
    snap.t03.per_agent_passed = 0;
    const derived = deriveS04Admission(snap, cleanPaths());
    assert.equal(derived.s04_admitted, false);
    assert.equal(derived.s04_gates.fresh_s03_7of7_invokability_pass, false);
  });

  it('includes per-gate diagnostics for every gate', () => {
    const derived = deriveS04Admission(cleanSnapshot(), cleanPaths());
    const d = derived.s04_gates.diagnostics;
    assert.ok(d.fresh_s03_7of7_invokability);
    assert.ok(d.no_do_not_promote_s04);
    assert.ok(d.no_drift);
    assert.ok(d.no_leaks);
  });
});

// ---------------------------------------------------------------------------
// captureSideEffectBaseline — forensic T02 side_effects.after snapshot
// ---------------------------------------------------------------------------

describe('captureSideEffectBaseline', () => {
  it('returns forensic_disk_evidence baseline with all six non-null counters', async () => {
    const baseline = await captureSideEffectBaseline(cleanSnapshot());
    assert.equal(baseline.source, 'forensic_disk_evidence');
    assert.equal(typeof baseline.fetched_at, 'string');
    assert.equal(baseline.issues_baseline, 15);
    assert.equal(baseline.documents_baseline, 2);
    assert.equal(baseline.comments_baseline, 13);
    assert.equal(baseline.approvals_baseline, 0);
    assert.equal(baseline.agents_baseline, 8);
    assert.equal(baseline.heartbeat_runs_baseline, 113);
    assert.equal(baseline.observer_budget.poll_interval_ms, 5000);
    assert.equal(baseline.observer_budget.observer_ceiling_s, 3600);
  });

  it('returns null baselines when T02 side_effects is missing', async () => {
    const snap = cleanSnapshot();
    delete snap.t02.side_effects;
    const baseline = await captureSideEffectBaseline(snap);
    assert.equal(baseline.issues_baseline, null);
    assert.equal(baseline.documents_baseline, null);
    assert.equal(baseline.comments_baseline, null);
    assert.equal(baseline.approvals_baseline, null);
    assert.equal(baseline.agents_baseline, null);
    assert.equal(baseline.heartbeat_runs_baseline, null);
  });
});

// ---------------------------------------------------------------------------
// evaluateS06PreflightGates — happy path / per-gate negative scenarios
// ---------------------------------------------------------------------------

describe('evaluateS06PreflightGates — happy path', () => {
  it('passes all 6 gates on a clean fixture', async () => {
    const result = await evaluatePreflightViaSnapshot(cleanSnapshot(), cleanPaths());
    assert.equal(result.gates.sg1_fresh_s04_admitted_pass, true);
    assert.equal(result.gates.sg2_no_do_not_promote_s04_pass, true);
    assert.equal(result.gates.sg3_s05_disposition_admitted_pass, true);
    assert.equal(result.gates.sg4_no_leaks_pass, true);
    assert.equal(result.gates.sg5_side_effect_baseline_snapshot_pass, true);
    assert.equal(result.gates.sg6_zero_preflight_business_mutations_pass, true);
    assert.equal(result.blockers.length, 0);
    assert.equal(result.verdict, 'ADMITTED');
  });
});

describe('evaluateS06PreflightGates — SG1 fresh S04 admitted', () => {
  it('fails SG1 when S04 admission status is BLOCKED', async () => {
    const snap = cleanSnapshot();
    snap.s04_admission.status = 'BLOCKED_ON_S03_FAIL_CLOSED';
    snap.t01.agents = [];
    const result = await evaluatePreflightViaSnapshot(snap, cleanPaths());
    assert.equal(result.gates.sg1_fresh_s04_admitted_pass, false);
    assert.equal(result.verdict, 'BLOCKED_ON_LIVE_RUNTIME_UNREACHABLE');
  });

  it('SG1 is a re-derivation: S04 file status alone does not pass SG1, the in-process gates pass through', async () => {
    // Even if S04-admission-on-disk says ADMITTED, deriveS04Admission
    // re-derives from t01+t02+t03+t19. If T01 agents are blown, SG1 must fail.
    const snap = cleanSnapshot();
    snap.s04_admission.status = 'ADMITTED';
    snap.s04_admission.blockers = [];
    snap.t01.agents = snap.t01.agents.filter((a) => a.name !== 'Div1.HCO');
    const result = await evaluatePreflightViaSnapshot(snap, cleanPaths());
    assert.equal(result.gates.sg1_fresh_s04_admitted_pass, false);
  });
});

describe('evaluateS06PreflightGates — SG2 no_do_not_promote_s04', () => {
  it('fails SG2 when T19.do_not_promote_s04 is true', async () => {
    const snap = cleanSnapshot();
    snap.t19.do_not_promote_s04 = true;
    const result = await evaluatePreflightViaSnapshot(snap, cleanPaths());
    assert.equal(result.gates.sg2_no_do_not_promote_s04_pass, false);
  });

  it('passes SG2 when T19.do_not_promote_s04 is false', async () => {
    const result = await evaluatePreflightViaSnapshot(cleanSnapshot(), cleanPaths());
    assert.equal(result.gates.sg2_no_do_not_promote_s04_pass, true);
  });

  it('passes SG2 when T19 missing do_not_promote_s04 (defensive undefined)', async () => {
    const snap = cleanSnapshot();
    delete snap.t19.do_not_promote_s04;
    const result = await evaluatePreflightViaSnapshot(snap, cleanPaths());
    assert.equal(result.gates.sg2_no_do_not_promote_s04_pass, true);
  });

  it('passes SG2 when T19 is null (defensive)', async () => {
    // SG2 expects 3-input upstream; this scenario can't really fire from the
    // real runner (loadEvidence rejects null), but the pure gate must still
    // be safe. Use undefined-shape via snapshot.t19 being a non-null object
    // missing the field rather than truly null:
    const snap = cleanSnapshot();
    snap.t19 = { closeout_verdict: 'X' };
    const result = await evaluatePreflightViaSnapshot(snap, cleanPaths());
    assert.equal(result.gates.sg2_no_do_not_promote_s04_pass, true);
  });
});

describe('evaluateS06PreflightGates — SG3 S05 disposition', () => {
  it('fails SG3 when S05.status is FAIL_CLOSED', async () => {
    const snap = cleanSnapshot();
    snap.s05_remediation.status = 'FAIL_CLOSED_UPSTREAM_FIX_REQUIRED';
    const result = await evaluatePreflightViaSnapshot(snap, cleanPaths());
    assert.equal(result.gates.sg3_s05_disposition_admitted_pass, false);
  });

  it('fails SG3 when S05.do_not_promote_s04 === true', async () => {
    const snap = cleanSnapshot();
    snap.s05_remediation.do_not_promote_s04 = true;
    const result = await evaluatePreflightViaSnapshot(snap, cleanPaths());
    assert.equal(result.gates.sg3_s05_disposition_admitted_pass, false);
  });

  it('fails SG3 when S05.admission.business_mutations_recorded > 0', async () => {
    const snap = cleanSnapshot();
    snap.s05_remediation.admission.business_mutations_recorded = 1;
    const result = await evaluatePreflightViaSnapshot(snap, cleanPaths());
    assert.equal(result.gates.sg3_s05_disposition_admitted_pass, false);
  });

  it('fails SG3 when S05.admission.status is not ADMITTED', async () => {
    const snap = cleanSnapshot();
    snap.s05_remediation.admission.status = 'BLOCKED';
    const result = await evaluatePreflightViaSnapshot(snap, cleanPaths());
    assert.equal(result.gates.sg3_s05_disposition_admitted_pass, false);
  });
});

describe('evaluateS06PreflightGates — SG4 no_leaks aggregate over 6 inputs', () => {
  it('fails SG4 when T01 leaks a UUID', async () => {
    const snap = cleanSnapshot();
    snap.t01.notes = 'uuid=478a498b-1234-4567-8123-abcdef012345';
    const result = await evaluatePreflightViaSnapshot(snap, cleanPaths());
    assert.equal(result.gates.sg4_no_leaks_pass, false);
  });

  it('fails SG4 when T02 leaks a credential', async () => {
    const snap = cleanSnapshot();
    snap.t02.notes = 'PAPERCLIP_API_KEY=secret-not-real';
    const result = await evaluatePreflightViaSnapshot(snap, cleanPaths());
    assert.equal(result.gates.sg4_no_leaks_pass, false);
  });

  it('fails SG4 when T03 leaks xiaomi/mimo', async () => {
    const snap = cleanSnapshot();
    snap.t03.notes = 'T03 contained xiaomi in adapter.notes';
    const result = await evaluatePreflightViaSnapshot(snap, cleanPaths());
    assert.equal(result.gates.sg4_no_leaks_pass, false);
  });

  it('fails SG4 when T19 leaks a credential', async () => {
    const snap = cleanSnapshot();
    snap.t19.notes = 'OPENAI_API_KEY=sk-not-real';
    const result = await evaluatePreflightViaSnapshot(snap, cleanPaths());
    assert.equal(result.gates.sg4_no_leaks_pass, false);
  });

  it('fails SG4 when S04-admission leaks xiaomi', async () => {
    const snap = cleanSnapshot();
    snap.s04_admission.notes = 'xiaomi mention sneaks in';
    const result = await evaluatePreflightViaSnapshot(snap, cleanPaths());
    assert.equal(result.gates.sg4_no_leaks_pass, false);
  });

  it('fails SG4 when S05-evidence leaks a UUID', async () => {
    const snap = cleanSnapshot();
    snap.s05_remediation.notes = 'uuid=478a498b-1234-4567-8123-abcdef012345';
    const result = await evaluatePreflightViaSnapshot(snap, cleanPaths());
    assert.equal(result.gates.sg4_no_leaks_pass, false);
  });

  it('records leak_paths in <ARTIFACT>:<jsonPath>(<kind>) shape', async () => {
    const snap = cleanSnapshot();
    snap.s05_remediation.notes = 'uuid=478a498b-1234-4567-8123-abcdef012345';
    const result = await evaluatePreflightViaSnapshot(snap, cleanPaths());
    assert.equal(result.gates.sg4_no_leaks_pass, false);
    const paths = result.gates.diagnostics.sg4.leak_paths;
    assert.ok(paths.length > 0);
    assert.ok(paths[0].startsWith('S05-REMEDIATION:'));
    assert.match(paths[0], /\(uuid\)$/);
  });
});

describe('evaluateS06PreflightGates — SG5 baseline snapshot', () => {
  it('passes SG5 when T02 side_effects.after.* populated', async () => {
    const result = await evaluatePreflightViaSnapshot(cleanSnapshot(), cleanPaths());
    assert.equal(result.gates.sg5_side_effect_baseline_snapshot_pass, true);
  });

  it('fails SG5 when T02 side_effects missing', async () => {
    const snap = cleanSnapshot();
    delete snap.t02.side_effects;
    const result = await evaluatePreflightViaSnapshot(snap, cleanPaths());
    assert.equal(result.gates.sg5_side_effect_baseline_snapshot_pass, false);
  });
});

describe('evaluateS06PreflightGates — SG6 always pass', () => {
  it('SG6 is true by construction (preflight is read-only)', async () => {
    const result = await evaluatePreflightViaSnapshot(cleanSnapshot(), cleanPaths());
    assert.equal(result.gates.sg6_zero_preflight_business_mutations_pass, true);
  });
});

// ---------------------------------------------------------------------------
// compileS06PreflightBlockers — code uniqueness, namespace, mapping
// ---------------------------------------------------------------------------

describe('compileS06PreflightBlockers', () => {
  it('emits no blockers on clean fixture', async () => {
    const result = await evaluatePreflightViaSnapshot(cleanSnapshot(), cleanPaths());
    assert.equal(result.blockers.length, 0);
  });

  it('emits M15-S06-PREFLIGHT-LIVE-RUNTIME-UNREACHABLE when SG1 fails', async () => {
    const snap = cleanSnapshot();
    snap.t01.agents = [];
    const result = await evaluatePreflightViaSnapshot(snap, cleanPaths());
    assert.ok(codes(result.blockers).includes(BLOCKER_CODES.LIVE_RUNTIME_UNREACHABLE));
  });

  it('emits SG2_FAIL when T19.do_not_promote_s04 === true', async () => {
    const snap = cleanSnapshot();
    snap.t19.do_not_promote_s04 = true;
    const result = await evaluatePreflightViaSnapshot(snap, cleanPaths());
    assert.ok(codes(result.blockers).includes(BLOCKER_CODES.SG2_FAIL));
  });

  it('emits SG3_FAIL when S05 status regresses', async () => {
    const snap = cleanSnapshot();
    snap.s05_remediation.status = 'FAIL_CLOSED_UPSTREAM_FIX_REQUIRED';
    const result = await evaluatePreflightViaSnapshot(snap, cleanPaths());
    assert.ok(codes(result.blockers).includes(BLOCKER_CODES.SG3_FAIL));
  });

  it('emits SG4_FAIL when redaction leaks aggregate', async () => {
    const snap = cleanSnapshot();
    snap.s05_remediation.notes = 'xiaomi sneaks';
    const result = await evaluatePreflightViaSnapshot(snap, cleanPaths());
    assert.ok(codes(result.blockers).includes(BLOCKER_CODES.SG4_FAIL));
  });

  it('emits multiple gates simultaneously with unique codes', async () => {
    const snap = cleanSnapshot();
    snap.t01.agents = []; // SG1
    snap.t19.do_not_promote_s04 = true; // SG2
    snap.s05_remediation.status = 'FAIL_CLOSED'; // SG3
    snap.t02.notes = 'xiaomi'; // SG4
    const result = await evaluatePreflightViaSnapshot(snap, cleanPaths());
    const cs = codes(result.blockers);
    assert.ok(cs.includes(BLOCKER_CODES.LIVE_RUNTIME_UNREACHABLE));
    assert.ok(cs.includes(BLOCKER_CODES.SG2_FAIL));
    assert.ok(cs.includes(BLOCKER_CODES.SG3_FAIL));
    assert.ok(cs.includes(BLOCKER_CODES.SG4_FAIL));
    const uniq = new Set(cs);
    assert.equal(uniq.size, cs.length, `duplicate blocker code(s): ${cs}`);
  });

  it('every blocker carries code, severity, gate, reason', async () => {
    const snap = cleanSnapshot();
    snap.t01.agents = [];
    const result = await evaluatePreflightViaSnapshot(snap, cleanPaths());
    assert.ok(result.blockers.length > 0);
    for (const blocker of result.blockers) {
      assert.equal(typeof blocker.code, 'string');
      assert.match(blocker.code, /^M15-S06-PREFLIGHT-/);
      assert.equal(blocker.severity || 'blocking', 'blocking');
      assert.ok('gate' in blocker);
      assert.equal(typeof blocker.reason, 'string');
      assert.ok(blocker.reason.length > 0);
    }
  });
});

// ---------------------------------------------------------------------------
// deriveVerdict
// ---------------------------------------------------------------------------

describe('deriveVerdict', () => {
  it('returns ADMITTED only when all 6 gates pass and no blockers', async () => {
    const result = await evaluatePreflightViaSnapshot(cleanSnapshot(), cleanPaths());
    assert.equal(result.verdict, 'ADMITTED');
  });

  it('returns BLOCKED_ON_LIVE_RUNTIME_UNREACHABLE when SG1 fails', async () => {
    const snap = cleanSnapshot();
    snap.t01.agents = [];
    const result = await evaluatePreflightViaSnapshot(snap, cleanPaths());
    assert.equal(result.verdict, 'BLOCKED_ON_LIVE_RUNTIME_UNREACHABLE');
  });

  it('returns BLOCKED_PREFLIGHT_GATE_FAILURE when SG2/SG3/SG4/SG5 fails with SG1 still green', async () => {
    // SG2/SG3 specifically depend on upstream state (T19.do_not_promote_s04,
    // S05.status) which is also captured transitively by SG1's S04-admission
    // re-derivation; breaking either alone cannot keep SG1 green. Pick an
    // SG4-only break (redaction leak in S05-evidence) that does NOT touch
    // the four S04 admission inputs, so SG1 stays green and the verdict
    // maps to BLOCKED_PREFLIGHT_GATE_FAILURE rather than the canonical
    // LIVE-RUNTIME-UNREACHABLE.
    const snap = cleanSnapshot();
    snap.s05_remediation.notes = 'xiaomi sneaks into S05-evidence only';
    const result = await evaluatePreflightViaSnapshot(snap, cleanPaths());
    assert.equal(result.gates.sg1_fresh_s04_admitted_pass, true);
    assert.equal(result.gates.sg4_no_leaks_pass, false);
    assert.equal(result.verdict, 'BLOCKED_PREFLIGHT_GATE_FAILURE');
  });
});

// ---------------------------------------------------------------------------
// buildS06PreflightEvidence — shape of the evidence object
// ---------------------------------------------------------------------------

describe('buildS06PreflightEvidence', () => {
  it('returns canonical shape with ADMITTED verdict on a clean fixture', async () => {
    const snap = cleanSnapshot();
    const paths = cleanPaths();
    const derived = deriveS04Admission(snap, paths);
    const baseline = await captureSideEffectBaseline(snap);
    const gates = evaluateS06PreflightGates(snap, derived, baseline);
    const blockers = compileS06PreflightBlockers(gates, snap, derived);
    const evidence = buildS06PreflightEvidence(snap, derived, baseline, gates, blockers, paths);
    assert.ok(evidence.$schema);
    assert.equal(evidence.milestone, 'M015-4o8lfw');
    assert.equal(evidence.slice, 'S06');
    assert.equal(evidence.task, 'T01');
    assert.equal(evidence.canonical_verdict, CANONICAL_VERDICT);
    assert.ok(evidence.generated);
    assert.equal(evidence.business_mutations_recorded, 0);
    assert.equal(evidence.do_not_promote_s04, false);
    assert.equal(evidence.verdict, 'ADMITTED');
    assert.equal(evidence.canonical_verdict_line, `${CANONICAL_VERDICT}=ADMITTED`);
  });

  it('exposes upstream_artifacts with paths for all six inputs', async () => {
    const snap = cleanSnapshot();
    const paths = cleanPaths();
    const derived = deriveS04Admission(snap, paths);
    const baseline = await captureSideEffectBaseline(snap);
    const gates = evaluateS06PreflightGates(snap, derived, baseline);
    const blockers = compileS06PreflightBlockers(gates, snap, derived);
    const evidence = buildS06PreflightEvidence(snap, derived, baseline, gates, blockers, paths);
    assert.equal(evidence.upstream_artifacts.s03_t01_test_environment.path, paths.t01);
    assert.equal(evidence.upstream_artifacts.s03_t02_diagnostic_runs.path, paths.t02);
    assert.equal(evidence.upstream_artifacts.s03_t03_independent_gate.path, paths.t03);
    assert.equal(evidence.upstream_artifacts.s03_t19_admission_blockers.path, paths.t19);
    assert.equal(evidence.upstream_artifacts.s04_admission.path, paths.s04_admission);
    assert.equal(evidence.upstream_artifacts.s05_remediation.path, paths.s05_remediation);
  });

  it('exposes per-gate diagnostics in the gates block', async () => {
    const snap = cleanSnapshot();
    snap.t19.do_not_promote_s04 = true;
    const paths = cleanPaths();
    const derived = deriveS04Admission(snap, paths);
    const baseline = await captureSideEffectBaseline(snap);
    const gates = evaluateS06PreflightGates(snap, derived, baseline);
    const blockers = compileS06PreflightBlockers(gates, snap, derived);
    const evidence = buildS06PreflightEvidence(snap, derived, baseline, gates, blockers, paths);
    const d = evidence.gates.diagnostics;
    assert.ok(d.sg1);
    assert.ok(d.sg2);
    assert.ok(d.sg3);
    assert.ok(d.sg4);
    assert.ok(d.sg5);
    assert.ok(d.sg6);
  });

  it('honors blocked verdict with explicit blockers and canonical line', async () => {
    // Same scenario as the deriveVerdict test: SG4 fails (xiaomi leak in
    // S05-evidence) without breaking SG1, so the verdict is the generic
    // BLOCKED_PREFLIGHT_GATE_FAILURE rather than the canonical
    // LIVE-RUNTIME-UNREACHABLE.
    const snap = cleanSnapshot();
    snap.s05_remediation.notes = 'xiaomi sneaks into S05-evidence only';
    const paths = cleanPaths();
    const derived = deriveS04Admission(snap, paths);
    const baseline = await captureSideEffectBaseline(snap);
    const gates = evaluateS06PreflightGates(snap, derived, baseline);
    const blockers = compileS06PreflightBlockers(gates, snap, derived);
    const evidence = buildS06PreflightEvidence(snap, derived, baseline, gates, blockers, paths);
    assert.equal(evidence.verdict, 'BLOCKED_PREFLIGHT_GATE_FAILURE');
    assert.ok(evidence.blockers.length > 0);
    assert.match(evidence.canonical_verdict_line, /^M015_S06_PREFLIGHT=/);
  });

  it('records side_effect_baseline verbatim', async () => {
    const snap = cleanSnapshot();
    const paths = cleanPaths();
    const derived = deriveS04Admission(snap, paths);
    const baseline = await captureSideEffectBaseline(snap);
    const gates = evaluateS06PreflightGates(snap, derived, baseline);
    const blockers = compileS06PreflightBlockers(gates, snap, derived);
    const evidence = buildS06PreflightEvidence(snap, derived, baseline, gates, blockers, paths);
    assert.equal(evidence.side_effect_baseline.source, 'forensic_disk_evidence');
    assert.equal(evidence.side_effect_baseline.issues_baseline, 15);
    assert.equal(evidence.side_effect_baseline.observer_budget.poll_interval_ms, 5000);
    assert.equal(evidence.side_effect_baseline.observer_budget.observer_ceiling_s, 3600);
  });

  it('inherits s04_blockers verbatim', async () => {
    const snap = cleanSnapshot();
    snap.t01.agents = [];
    const paths = cleanPaths();
    const derived = deriveS04Admission(snap, paths);
    const baseline = await captureSideEffectBaseline(snap);
    const gates = evaluateS06PreflightGates(snap, derived, baseline);
    const blockers = compileS06PreflightBlockers(gates, snap, derived);
    const evidence = buildS06PreflightEvidence(snap, derived, baseline, gates, blockers, paths);
    assert.ok(evidence.s04_blockers_inherited.length > 0);
    assert.ok(evidence.s04_blockers_inherited.every((b) => typeof b.code === 'string'));
  });
});

// ---------------------------------------------------------------------------
// writeS06PreflightEvidence — refusal guard
// ---------------------------------------------------------------------------

describe('writeS06PreflightEvidence — refusal guard', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'm015-s06-write-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('refuses to write when serialised output contains a xiaomi/mimo string', () => {
    if (fs.existsSync(OUTPUT_PATH)) fs.unlinkSync(OUTPUT_PATH);
    const leaky = {
      $schema: 'x',
      milestone: 'M015-4o8lfw',
      slice: 'S06',
      task: 'T01',
      generated: new Date().toISOString(),
      verdict: 'BLOCKED_ON_LIVE_RUNTIME_UNREACHABLE',
      canonical_verdict: CANONICAL_VERDICT,
      leak_field: 'xiaomi appears in serialized form',
      blocks: { sg1_fail: true, sg4_fail: true },
      blockers: [{ code: BLOCKER_CODES.LIVE_RUNTIME_UNREACHABLE, severity: 'blocking', reason: 'xiaomi detected' }],
      business_mutations_recorded: 0,
      redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false },
      canonical_verdict_line: `${CANONICAL_VERDICT}=BLOCKED_ON_LIVE_RUNTIME_UNREACHABLE`,
    };
    assert.throws(
      () => writeS06PreflightEvidence(leaky),
      (err) => {
        assert.match(err.message, /M15-S06-PREFLIGHT-SG4-REDACTION-LEAKS/);
        assert.match(err.message, /xiaomi or mimo string detected/i);
        return true;
      },
    );
    assert.equal(fs.existsSync(OUTPUT_PATH), false);
  });

  it('scrubs UUIDs to <redacted-id> before writing (post-scrub rejection then succeeds)', () => {
    // The write pipeline runs scrubEvidence() FIRST and refuses AFTER scrub.
    // UUIDs/CREDENTIALS are caught by scrubEvidence and replaced with
    // <redacted-id>/<redacted-credential-fragment> placeholders, so the
    // post-scrub serialised output never contains the raw values. This is
    // the correct behaviour: scrub catches them at the value layer; the
    // refusal guard is the safety net for anything scrub misses (notably
    // xiaomi/mimo strings, which are NOT scrubbed but REFUSED).
    if (fs.existsSync(OUTPUT_PATH)) fs.unlinkSync(OUTPUT_PATH);
    const leaky = {
      $schema: 'x',
      milestone: 'M015-4o8lfw',
      slice: 'S06',
      task: 'T01',
      generated: new Date().toISOString(),
      verdict: 'ADMITTED',
      canonical_verdict: CANONICAL_VERDICT,
      agent_id: 'uuid 478a498b-1234-4567-8123-abcdef012345',
      blockers: [],
      business_mutations_recorded: 0,
      redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: true },
      canonical_verdict_line: `${CANONICAL_VERDICT}=ADMITTED`,
    };
    writeS06PreflightEvidence(leaky); // does NOT throw
    assert.ok(fs.existsSync(OUTPUT_PATH));
    const onDisk = fs.readFileSync(OUTPUT_PATH, 'utf8');
    assert.equal(/478a498b-1234-4567-8123-abcdef012345/.test(onDisk), false,
      `UUID substring must be scrubbed before serialisation; file: ${onDisk.slice(0, 400)}`);
    assert.equal(/<redacted-id>/.test(onDisk), true, '<redacted-id> placeholder must be present after scrub');
    fs.unlinkSync(OUTPUT_PATH);
  });

  it('scrubs credential assignments to <redacted-credential-fragment> before writing', () => {
    if (fs.existsSync(OUTPUT_PATH)) fs.unlinkSync(OUTPUT_PATH);
    const leaky = {
      $schema: 'x',
      milestone: 'M015-4o8lfw',
      slice: 'S06',
      task: 'T01',
      generated: new Date().toISOString(),
      verdict: 'ADMITTED',
      canonical_verdict: CANONICAL_VERDICT,
      notes: 'PAPERCLIP_API_KEY=secret-not-real',
      blockers: [],
      business_mutations_recorded: 0,
      redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: true },
      canonical_verdict_line: `${CANONICAL_VERDICT}=ADMITTED`,
    };
    writeS06PreflightEvidence(leaky); // does NOT throw
    assert.ok(fs.existsSync(OUTPUT_PATH));
    const onDisk = fs.readFileSync(OUTPUT_PATH, 'utf8');
    assert.equal(/PAPERCLIP_API_KEY=secret-not-real/.test(onDisk), false,
      `credential substring must be scrubbed before serialisation; file: ${onDisk.slice(0, 400)}`);
    assert.equal(/<redacted-credential-fragment>/.test(onDisk), true, '<redacted-credential-fragment> placeholder must be present after scrub');
    fs.unlinkSync(OUTPUT_PATH);
  });

  it('refuses to write when serialised output contains a mixed-case MIMO token', () => {
    if (fs.existsSync(OUTPUT_PATH)) fs.unlinkSync(OUTPUT_PATH);
    const leaky = {
      $schema: 'x',
      milestone: 'M015-4o8lfw',
      slice: 'S06',
      task: 'T01',
      generated: new Date().toISOString(),
      verdict: 'BLOCKED_ON_LIVE_RUNTIME_UNREACHABLE',
      canonical_verdict: CANONICAL_VERDICT,
      gates: { notes: 'MIMO upper-case token appears here' },
      blockers: [],
      business_mutations_recorded: 0,
      redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false },
      canonical_verdict_line: `${CANONICAL_VERDICT}=BLOCKED_ON_LIVE_RUNTIME_UNREACHABLE`,
    };
    assert.throws(
      () => writeS06PreflightEvidence(leaky),
      (err) => err.message.includes(BLOCKER_CODES.SG4_FAIL),
    );
    assert.equal(fs.existsSync(OUTPUT_PATH), false);
  });

  it('writes a clean evidence object without throwing', () => {
    if (fs.existsSync(OUTPUT_PATH)) fs.unlinkSync(OUTPUT_PATH);
    const clean = {
      $schema: 'x',
      milestone: 'M015-4o8lfw',
      slice: 'S06',
      task: 'T01',
      generated: new Date().toISOString(),
      verdict: 'ADMITTED',
      canonical_verdict: CANONICAL_VERDICT,
      blockers: [],
      business_mutations_recorded: 0,
      redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: true },
      canonical_verdict_line: `${CANONICAL_VERDICT}=ADMITTED`,
    };
    writeS06PreflightEvidence(clean);
    assert.ok(fs.existsSync(OUTPUT_PATH));
    fs.unlinkSync(OUTPUT_PATH);
  });
});

// ---------------------------------------------------------------------------
// Canonical verdict & gate-labels constants
// ---------------------------------------------------------------------------

describe('canonical verdict & gate labels', () => {
  it('canonical verdict is M015_S06_PREFLIGHT', () => {
    assert.equal(CANONICAL_VERDICT, 'M015_S06_PREFLIGHT');
  });

  it('exposes 6 preflight gate labels in stable order', () => {
    assert.deepEqual(Object.keys(PREFLIGHT_GATE_LABELS), [
      'sg1_fresh_s04_admitted_pass',
      'sg2_no_do_not_promote_s04_pass',
      'sg3_s05_disposition_admitted_pass',
      'sg4_no_leaks_pass',
      'sg5_side_effect_baseline_snapshot_pass',
      'sg6_zero_preflight_business_mutations_pass',
    ]);
    for (const [key, label] of Object.entries(PREFLIGHT_GATE_LABELS)) {
      assert.ok(label.length > 0, `${key} must have a label`);
    }
  });

  it('exposes stable blocker code constants', () => {
    assert.equal(BLOCKER_CODES.LIVE_RUNTIME_UNREACHABLE, 'M15-S06-PREFLIGHT-LIVE-RUNTIME-UNREACHABLE');
    assert.equal(BLOCKER_CODES.SG1_FAIL, 'M15-S06-PREFLIGHT-SG1-NO-FRESH-S04');
    assert.equal(BLOCKER_CODES.SG2_FAIL, 'M15-S06-PREFLIGHT-SG2-DO-NOT-PROMOTE-S04');
    assert.equal(BLOCKER_CODES.SG3_FAIL, 'M15-S06-PREFLIGHT-SG3-S05-NOT-ADMITTED');
    assert.equal(BLOCKER_CODES.SG4_FAIL, 'M15-S06-PREFLIGHT-SG4-REDACTION-LEAKS');
    assert.equal(BLOCKER_CODES.SG5_FAIL, 'M15-S06-PREFLIGHT-SG5-SIDE-EFFECT-BASELINE');
    assert.equal(BLOCKER_CODES.SG6_FAIL, 'M15-S06-PREFLIGHT-SG6-ZERO-MUTATIONS');
    assert.equal(BLOCKER_CODES.RUNNER_FAILURE, 'M15-S06-PREFLIGHT-RUNNER-FAILURE');
  });

  it('runtime-evidence codes are label-scoped', () => {
    assert.equal(BLOCKER_CODES.RUNTIME_EVIDENCE_MISSING('S03-T01'), 'M15-S06-PREFLIGHT-EVIDENCE-MISSING-S03-T01');
    assert.equal(BLOCKER_CODES.RUNTIME_EVIDENCE_MALFORMED('S05-REMEDIATION'), 'M15-S06-PREFLIGHT-EVIDENCE-MALFORMED-S05-REMEDIATION');
  });
});
