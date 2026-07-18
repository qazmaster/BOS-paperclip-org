#!/usr/bin/env node
'use strict';

/**
 * scripts/test_run_m015_s04_native_mission_part2.js
 *
 * M015-4o8lfw / S04 / T03 — Hermetic tests, part 2 of 2.
 *
 * Covers the runtime side of the bounded-intake + read-only observer
 * harness:
 *   - runObserver (terminal exit; budget exhausted; transport error mid-loop;
 *     side-effect expansion detection)
 *   - aggregateMissionRun (shape + idempotency-key derivation)
 *   - evaluateMissionOutcome (5 verdict branches)
 *   - deriveMissionStatus (pure logic, including vacuous-pass guard)
 *   - writeRunnerEvidence refusal guard (UUID / credential / xiaomi leaks)
 *   - runOnce end-to-end (admission blocked safe; admission blocked no-run;
 *     admitted + invalid intake; admitted + happy mission;
 *     admitted + transport failure; admitted + observer transport error)
 *   - HttpTransport (sanity: construct without fetch; URL composition)
 *   - printHelp smoke
 *
 * All tests are HERMETIC. In-memory fixtures + MockTransport record
 * calls; only the writeRunnerEvidence refusal test touches tmpdir() and
 * cleans up after itself.
 */

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { describe, it, beforeEach, afterEach } = require('node:test');

const data = require('./lib/m015-s04-native-runner-data');
const contract = require('./lib/m015-s04-native-runner-contract');
const runner = require('./run_m015_s04_native_mission');
const fixtures = require('./lib/m015-s04-native-runner-fixtures');
const { CANONICAL_DIVISION_NAMES } = require('./probe_m015_seven_agent_environment');
const {
  buildAdmittedAdmissionEvidence,
  buildBlockedAdmissionEvidence,
  buildValidIntake,
  buildMockTransport,
  buildDiv1Child,
  buildHeartbeatRun,
} = fixtures;

const {
  RUNNER_BLOCKER_CODES,
  EXIT_CODES,
} = data;

const {
  aggregateMissionRun,
  deriveMissionStatus,
  evaluateMissionOutcome,
  buildRunnerEvidence,
  writeRunnerEvidence,
} = contract;

const {
  BoundedTransport,
  HttpTransport,
  runObserver,
  runOnce,
  printHelp,
} = runner;

// ---------------------------------------------------------------------------
// runObserver — bounded poll loop
// ---------------------------------------------------------------------------

describe('runObserver', () => {
  it('exits early when observed state reaches terminal (7 divisions + dispositions)', async () => {
    const rootId = 'root-issue-mock-001';
    const issueChildren = CANONICAL_DIVISION_NAMES
      .filter((n) => n !== 'Div7.MissionControl')
      .map((n) => buildDiv1Child(n, rootId));
    const heartbeatRunData = CANONICAL_DIVISION_NAMES.map((n) => buildHeartbeatRun(n, { terminal: 'succeeded' }));
    const dispositionData = CANONICAL_DIVISION_NAMES.map((n) => ({
      id: `disp-${n}`, division: n, state: 'finalised', issue_id: rootId,
    }));
    const { inner } = buildMockTransport({ issueChildren, heartbeatRunData, dispositionData });
    const bt = new BoundedTransport(inner);
    await bt.createRootIssue({ title: 'one' });
    const rootIssue = { id: rootId, role: 'PO_ROOT_MISSION', assignee: 'Div7.MissionControl', parent_issue_id: null };
    const state = await runObserver({
      transport: bt, rootIssue, observedState: null,
      options: { maxSeconds: 5, pollIntervalMs: 10 },
    });
    assert.equal(state.observer_status.terminal, true);
    assert.equal(state.observer_status.terminal_divisions, 7);
    assert.equal(state.observer_budget_exhausted, false);
    assert.equal(state.heartbeat_runs.length, 7);
    assert.equal(state.dispositions.length, 7);
  });

  it('marks budget_exhausted when terminal not reached within the deadline', async () => {
    const rootId = 'root-issue-mock-001';
    const { inner } = buildMockTransport({ issueChildren: [], heartbeatRunData: [], dispositionData: [] });
    const bt = new BoundedTransport(inner);
    await bt.createRootIssue({ title: 'one' });
    const rootIssue = { id: rootId, role: 'PO_ROOT_MISSION', assignee: 'Div7.MissionControl', parent_issue_id: null };
    const state = await runObserver({
      transport: bt, rootIssue, observedState: null,
      options: { maxSeconds: 1, pollIntervalMs: 50 },
    });
    assert.equal(state.observer_budget_exhausted, true);
    assert.equal(state.observer_status.terminal, false);
    assert.ok(state.iterations >= 1);
  });

  it('throws OBSERVER_TRANSPORT_ERROR_<op> when a read fails mid-loop', async () => {
    const rootId = 'root-issue-mock-001';
    const { inner } = buildMockTransport({ issueChildren: [], heartbeatRunData: [], transportErrors: { listHeartbeatRuns: true } });
    const bt = new BoundedTransport(inner);
    await bt.createRootIssue({ title: 'one' });
    const rootIssue = { id: rootId, role: 'PO_ROOT_MISSION', assignee: 'Div7.MissionControl', parent_issue_id: null };
    await assert.rejects(
      () => runObserver({ transport: bt, rootIssue, options: { maxSeconds: 1, pollIntervalMs: 50 } }),
      (err) => {
        assert.equal(err.code, RUNNER_BLOCKER_CODES.OBSERVER_TRANSPORT_ERROR('listHeartbeatRuns'));
        return true;
      },
    );
  });

  it('requires OBSERVER-mode transport', async () => {
    const { inner } = buildMockTransport();
    const bt = new BoundedTransport(inner);
    const rootIssue = { id: 'root-x', role: 'PO_ROOT_MISSION', assignee: 'Div7.MissionControl', parent_issue_id: null };
    await assert.rejects(
      () => runObserver({ transport: bt, rootIssue, options: { maxSeconds: 1, pollIntervalMs: 50 } }),
      /OBSERVER-mode transport/,
    );
  });

  it('records observed_harness_escapes when side_effects ledger shows harness-authored entries', async () => {
    const rootId = 'root-issue-mock-001';
    const { inner } = buildMockTransport({
      issueChildren: [], heartbeatRunData: [], dispositionData: [],
      sideEffectData: [
        { id: 'se-1', kind: 'comment_create', actor: 'harness', observed_at: '2026-07-14T16:00:30.000Z' },
      ],
    });
    const bt = new BoundedTransport(inner);
    await bt.createRootIssue({ title: 'one' });
    const rootIssue = { id: rootId, role: 'PO_ROOT_MISSION', assignee: 'Div7.MissionControl', parent_issue_id: null };
    const state = await runObserver({ transport: bt, rootIssue, options: { maxSeconds: 1, pollIntervalMs: 50 } });
    assert.equal(state.observed_harness_escapes.length, 1);
    assert.equal(state.observed_harness_escapes[0].kind, 'comment_create');
  });
});

// ---------------------------------------------------------------------------
// aggregateMissionRun
// ---------------------------------------------------------------------------

describe('aggregateMissionRun', () => {
  it('produces correct missionRun shape combining rootIssue + observedState', () => {
    const intake = buildValidIntake();
    const missionContext = contract.deriveMissionContext(intake);
    const rootIssue = {
      id: 'root-issue-mock-001', role: 'PO_ROOT_MISSION', assignee: 'Div7.MissionControl',
      parent_issue_id: null, title: intake.title, created_by: 'harness',
    };
    const observedState = {
      issues: [{ id: 'div1-child', assignee: 'Div1.HCO', parent_issue_id: rootIssue.id, role: 'OPERATING_CHILD', created_by: 'Div7.MissionControl' }],
      comments: [{ id: 'c1', author_division: 'Div1.HCO', kind: 'handoff_or_progress', body_tail: 'routing' }],
      documents: [],
      heartbeat_runs: [buildHeartbeatRun('Div1.HCO')],
      side_effects: [],
      dispositions: [],
      reviews: [],
      observer_status: { terminal: false, terminal_divisions: 1, divisions_with_dispositions: 0, observed_run_count: 1 },
      observer_budget_exhausted: true,
      started_at: '2026-07-14T16:00:00.000Z',
      ended_at: '2026-07-14T16:01:00.000Z',
      iterations: 6,
    };
    const run = aggregateMissionRun({
      rootIssue, observedState, missionContext, startedAt: observedState.started_at, endedAt: observedState.ended_at,
    });
    assert.equal(run.mission_key, missionContext.missionKey);
    assert.equal(run.idempotency_key, missionContext.idempotencyKey);
    assert.equal(run.recovery_lock, missionContext.recoveryLock);
    assert.equal(run.started_at, '2026-07-14T16:00:00.000Z');
    assert.equal(run.ended_at, '2026-07-14T16:01:00.000Z');
    assert.equal(run.mission_duration_sec, 60);
    assert.equal(run.root_issue.id, 'root-issue-mock-001');
    assert.equal(run.issues.length, 2);
    assert.equal(run.issues[0].id, 'root-issue-mock-001');
    assert.equal(run.comments.length, 1);
    assert.equal(run.heartbeat_runs.length, 1);
    assert.equal(run.observer_budget_exhausted, true);
  });
});

// ---------------------------------------------------------------------------
// evaluateMissionOutcome
// ---------------------------------------------------------------------------

describe('evaluateMissionOutcome', () => {
  it('admission blocked + no run + acceptSafeBlock=true → MISSION_BLOCKED_SAFE', () => {
    const r = evaluateMissionOutcome({
      admission: buildBlockedAdmissionEvidence(),
      missionRun: null,
      options: { acceptSafeBlock: true },
    });
    assert.equal(r.status, 'MISSION_BLOCKED_SAFE');
    assert.equal(r.gates.mission_topology_pass, false);
  });

  it('admission blocked + no run + acceptSafeBlock=false → MISSION_BLOCKED_NO_RUN', () => {
    const r = evaluateMissionOutcome({
      admission: buildBlockedAdmissionEvidence(),
      missionRun: null,
      options: { acceptSafeBlock: false },
    });
    assert.equal(r.status, 'MISSION_BLOCKED_NO_RUN');
  });

  it('admission blocked + run present (cannot happen per T02 short-circuit) → MISSION_FAIL_CLOSED', () => {
    const r = evaluateMissionOutcome({
      admission: buildBlockedAdmissionEvidence(),
      missionRun: { issues: [], comments: [], heartbeat_runs: [], side_effects: [], dispositions: [], reviews: [], documents: [], mission_key: 's04-mission-x', idempotency_key: 'x::y', recovery_lock: 'rb:x' },
      options: { acceptSafeBlock: true },
    });
    assert.equal(r.status, 'MISSION_FAIL_CLOSED');
  });

  it('admission admitted + empty missionRun → MISSION_FAIL_CLOSED', () => {
    const r = evaluateMissionOutcome({
      admission: buildAdmittedAdmissionEvidence(),
      missionRun: {
        mission_key: 's04-mission-fixture-2026-07-14T16-00-00Z',
        idempotency_key: 'x::y',
        recovery_lock: 'rb:x',
        issues: [], comments: [], documents: [], heartbeat_runs: [],
        side_effects: [], dispositions: [], reviews: [], mission_duration_sec: 0,
      },
      options: { acceptSafeBlock: false },
    });
    assert.equal(r.status, 'MISSION_FAIL_CLOSED');
  });
});

// ---------------------------------------------------------------------------
// deriveMissionStatus pure logic
// ---------------------------------------------------------------------------

describe('deriveMissionStatus', () => {
  it('admission blocked + no run + acceptSafeBlock=true → MISSION_BLOCKED_SAFE', () => {
    const status = deriveMissionStatus({
      admissionAdmitted: false, missionRun: null, gates: {}, blockers: [], acceptSafeBlock: true,
    });
    assert.equal(status, 'MISSION_BLOCKED_SAFE');
  });

  it('admission blocked + no run + acceptSafeBlock=false → MISSION_BLOCKED_NO_RUN', () => {
    const status = deriveMissionStatus({
      admissionAdmitted: false, missionRun: null, gates: {}, blockers: [], acceptSafeBlock: false,
    });
    assert.equal(status, 'MISSION_BLOCKED_NO_RUN');
  });

  it('admission blocked + run present → MISSION_FAIL_CLOSED', () => {
    const status = deriveMissionStatus({
      admissionAdmitted: false, missionRun: { issues: [] }, gates: {}, blockers: [], acceptSafeBlock: false,
    });
    assert.equal(status, 'MISSION_FAIL_CLOSED');
  });

  it('admitted + blockers present → MISSION_FAIL_CLOSED', () => {
    const status = deriveMissionStatus({
      admissionAdmitted: true, missionRun: { issues: [] }, gates: {}, blockers: [{ code: 'X' }], acceptSafeBlock: true,
    });
    assert.equal(status, 'MISSION_FAIL_CLOSED');
  });

  it('admitted + all gates pass → MISSION_PASS', () => {
    const gates = { a: true, b: true, c: true };
    const status = deriveMissionStatus({
      admissionAdmitted: true, missionRun: { issues: [] }, gates, blockers: [], acceptSafeBlock: false,
    });
    assert.equal(status, 'MISSION_PASS');
  });

  it('empty gates object cannot be vacuously MISSION_PASS', () => {
    const status = deriveMissionStatus({
      admissionAdmitted: true, missionRun: { issues: [] }, gates: {}, blockers: [], acceptSafeBlock: false,
    });
    assert.equal(status, 'MISSION_FAIL_CLOSED');
  });
});

// ---------------------------------------------------------------------------
// writeRunnerEvidence refusal guard
// ---------------------------------------------------------------------------

describe('writeRunnerEvidence refusal guard', () => {
  let tmpRoot;
  let prevCwd;
  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'm015-s04-write-'));
    prevCwd = process.cwd();
    process.chdir(tmpRoot);
  });
  afterEach(() => {
    process.chdir(prevCwd);
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('writes evidence JSON on clean shape', () => {
    const evidence = buildRunnerEvidence({
      admission: buildBlockedAdmissionEvidence(), intake: null, missionContext: null,
      rootIssue: null, missionRun: null,
      outcome: { status: 'MISSION_BLOCKED_SAFE', gates: null, blockers: [], safe_block_declared: true, redaction: {} },
      startedAt: '2026-07-14T16:00:00.000Z', endedAt: '2026-07-14T16:00:00.000Z',
      observationBudget: null, observationPollingMs: null,
    });
    const target = path.join(tmpRoot, 'runtime-evidence', 'run.json');
    writeRunnerEvidence(evidence, target);
    const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
    assert.equal(parsed.status, 'MISSION_BLOCKED_SAFE');
  });

  it('scrubs full UUIDs from evidence end-to-end (UUIDs are scrubbed, not refused)', () => {
    // Matches T01/T02 pattern (SCRUB-BEFORE-REFUSAL): scrubEvidence redacts
    // UUIDs in string values before the belt-and-braces refusal backstop
    // runs, so the file is written successfully with the UUID replaced by
    // the redacted-id placeholder. The refusal guard is documented to
    // catch leaks that survived scrubEvidence (none expected in practice).
    const evidence = buildRunnerEvidence({
      admission: buildBlockedAdmissionEvidence(), intake: null, missionContext: null,
      rootIssue: null, missionRun: null,
      outcome: { status: 'MISSION_BLOCKED_SAFE', gates: null, blockers: [], safe_block_declared: true, redaction: {} },
      startedAt: '2026-07-14T16:00:00.000Z', endedAt: '2026-07-14T16:00:00.000Z',
      observationBudget: null, observationPollingMs: null,
    });
    evidence.intake_summary = { desired_assignee: 'Div7.MissionControl', leak: '12345678-1234-1234-8234-123456789abc' };
    const target = path.join(tmpRoot, 'runtime-evidence', 'run.json');
    writeRunnerEvidence(evidence, target);
    assert.equal(fs.existsSync(target), true);
    const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
    const serialised = fs.readFileSync(target, 'utf8');
    assert.equal(parsed.intake_summary.leak, '<redacted-id>');
    assert.equal(serialised.includes('12345678-1234-1234-8234-123456789abc'), false, 'full UUID must not appear in serialised output');
  });

  it('scrubs credential assignments from evidence end-to-end', () => {
    const evidence = buildRunnerEvidence({
      admission: buildBlockedAdmissionEvidence(), intake: null, missionContext: null,
      rootIssue: null, missionRun: null,
      outcome: { status: 'MISSION_BLOCKED_SAFE', gates: null, blockers: [], safe_block_declared: true, redaction: {} },
      startedAt: '2026-07-14T16:00:00.000Z', endedAt: '2026-07-14T16:00:00.000Z',
      observationBudget: null, observationPollingMs: null,
    });
    evidence.intake_summary = { desired_assignee: 'Div7.MissionControl', bad: 'PAPERCLIP_API_KEY=sk-abcdef123456789' };
    const target = path.join(tmpRoot, 'runtime-evidence', 'run.json');
    writeRunnerEvidence(evidence, target);
    assert.equal(fs.existsSync(target), true);
    const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
    const serialised = fs.readFileSync(target, 'utf8');
    assert.equal(parsed.intake_summary.bad, '<redacted-credential-fragment>');
    assert.equal(serialised.includes('PAPERCLIP_API_KEY=sk-abcdef123456789'), false, 'credential assignment must not appear in serialised output');
  });

  it('refuses to write when xiaomi/mimo string leaks', () => {
    const evidence = buildRunnerEvidence({
      admission: buildBlockedAdmissionEvidence(), intake: null, missionContext: null,
      rootIssue: null, missionRun: null,
      outcome: { status: 'MISSION_BLOCKED_SAFE', gates: null, blockers: [], safe_block_declared: true, redaction: {} },
      startedAt: '2026-07-14T16:00:00.000Z', endedAt: '2026-07-14T16:00:00.000Z',
      observationBudget: null, observationPollingMs: null,
    });
    evidence.intake_summary = { desired_assignee: 'Div7.MissionControl', bad: 'xiaomi endpoint reuse' };
    const target = path.join(tmpRoot, 'runtime-evidence', 'run.json');
    assert.throws(
      () => writeRunnerEvidence(evidence, target),
      (err) => {
        assert.equal(err.code, RUNNER_BLOCKER_CODES.LEAK_XIAOMI);
        return true;
      },
    );
    assert.equal(fs.existsSync(target), false);
  });
});

// ---------------------------------------------------------------------------
// runOnce end-to-end with MockTransport
// ---------------------------------------------------------------------------

describe('runOnce end-to-end', () => {
  it('admission blocked + no intake → MISSION_BLOCKED_SAFE, exit 2, evidence recorded', async () => {
    const { inner } = buildMockTransport();
    const bt = new BoundedTransport(inner);
    const result = await runOnce({
      admission: buildBlockedAdmissionEvidence(),
      intake: null,
      transport: bt,
      options: { acceptSafeBlock: true },
    });
    assert.equal(result.exitCode, EXIT_CODES.MISSION_BLOCKED_SAFE);
    assert.equal(result.evidence.status, 'MISSION_BLOCKED_SAFE');
    assert.equal(result.evidence.harness_writes.root_issue_create, 0);
    assert.equal(bt.intakeAttempts, 0);
  });

  it('admission blocked + no intake, no --accept-safe-block → MISSION_BLOCKED_NO_RUN, exit 3', async () => {
    const { inner } = buildMockTransport();
    const bt = new BoundedTransport(inner);
    const result = await runOnce({
      admission: buildBlockedAdmissionEvidence(),
      intake: null,
      transport: bt,
      options: { acceptSafeBlock: false },
    });
    assert.equal(result.exitCode, EXIT_CODES.MISSION_BLOCKED_NO_RUN);
    assert.equal(result.evidence.status, 'MISSION_BLOCKED_NO_RUN');
    assert.equal(result.evidence.safe_block_declared, false);
  });

  it('admission admitted + intake missing → throws INTAKE_PAYLOAD_MISSING', async () => {
    const { inner } = buildMockTransport();
    const bt = new BoundedTransport(inner);
    await assert.rejects(
      () => runOnce({
        admission: buildAdmittedAdmissionEvidence(),
        intake: null,
        transport: bt,
        options: { acceptSafeBlock: false },
      }),
      (err) => {
        assert.equal(err.code, RUNNER_BLOCKER_CODES.INTAKE_PAYLOAD_MISSING);
        return true;
      },
    );
  });

  it('admission admitted + invalid intake (missing title) → MISSION_FAIL_CLOSED, exit 1', async () => {
    const { inner } = buildMockTransport();
    const bt = new BoundedTransport(inner);
    const intake = buildValidIntake();
    delete intake.title;
    const result = await runOnce({
      admission: buildAdmittedAdmissionEvidence(),
      intake,
      transport: bt,
      options: { acceptSafeBlock: false },
    });
    assert.equal(result.exitCode, EXIT_CODES.MISSION_FAIL_CLOSED);
    assert.equal(result.evidence.status, 'MISSION_FAIL_CLOSED');
    assert.equal(result.evidence.harness_writes.root_issue_create, 0);
    assert.ok(result.evidence.blockers.some((b) => b.code === RUNNER_BLOCKER_CODES.INTAKE_INVALID('title')));
    assert.equal(bt.intakeAttempts, 0);
  });

  it('admission admitted + valid intake + happy native mission → MISSION_PASS, exit 0', async () => {
    const rootId = 'root-issue-mock-001';
    const intake = buildValidIntake();
    // MG2 AUTHORSHIP_AND_AUTHORITY requires Div1's child to be authored by
    // Div7 (the only Div1-creator), and Div2..Div6 children authored by
    // Div1. Override the helper's default `created_by='Div1.HCO'` so Div1's
    // child carries the correct author.
    const issueChildren = CANONICAL_DIVISION_NAMES
      .filter((n) => n !== 'Div7.MissionControl')
      .map((n) => {
        const child = buildDiv1Child(n, rootId);
        child.created_by = n === 'Div1.HCO' ? 'Div7.MissionControl' : 'Div1.HCO';
        return child;
      });
    const heartbeatRunData = CANONICAL_DIVISION_NAMES.map((n) => buildHeartbeatRun(n, { terminal: 'succeeded' }));
    // MG4 REVIEW_AND_DISPOSITION_PATH requires Div1's disposition state
    // === 'routed' (REVIEW_PATH.disposition_states.Div1); other divisions
    // need only a state string. Div7's state must be 'finalised'.
    const dispositionData = CANONICAL_DIVISION_NAMES.map((n) => ({
      id: `disp-${n}`,
      division: n,
      state: n === 'Div1.HCO' ? 'routed' : 'finalised',
      issue_id: rootId,
    }));
    const commentData = CANONICAL_DIVISION_NAMES.map((n) => ({
      id: `c-${n}`, author_division: n, kind: 'handoff_or_progress',
      issue_id: n === 'Div7.MissionControl' ? rootId : issueChildren.find((c) => c.assignee === n).id,
      body_tail: 'ok', created_at: '2026-07-14T16:01:00.000Z',
    }));
    const documentData = ['Div2.MasterPlanner', 'Div4.Production'].map((n) => ({
      id: `doc-${n}`, author_division: n, kind: 'plan_or_build', issue_id: rootId,
      created_at: '2026-07-14T16:01:00.000Z',
    }));
    const reviewData = [{
      id: 'rev-1', reviewer_division: 'Div5.QualificationsLibraryLearning',
      target_division: 'Div4.Production', outcome: 'approved', issue_id: rootId,
    }];
    // MG5 ALLOWLISTED_SIDE_EFFECTS requires exactly 7 heartbeat_run_invoke
    // entries (expected_run_count), 1 issue_create (root intake), 6
    // issue_create_or_assign (1 Div7→Div1 + 5 Div1→Div2..Div6), and up to
    // 7 issue_status_update (one per division). All kinds must come from
    // the allowed set.
    const div1ChildId = issueChildren.find((c) => c.assignee === 'Div1.HCO').id;
    const sideEffectData = [
      { id: 'se-root', kind: 'issue_create', actor: 'harness', assignee: 'Div7.MissionControl', issue_id: rootId },
      { id: 'se-div7-div1', kind: 'issue_create_or_assign', actor: 'Div7.MissionControl', assignee: 'Div1.HCO', issue_id: div1ChildId },
      ...['Div2.MasterPlanner', 'Div3.Treasury', 'Div4.Production', 'Div5.QualificationsLibraryLearning', 'Div6.External']
        .map((div, idx) => ({
          id: `se-div1-${idx}`,
          kind: 'issue_create_or_assign',
          actor: 'Div1.HCO',
          assignee: div,
          issue_id: issueChildren.find((c) => c.assignee === div).id,
        })),
      ...CANONICAL_DIVISION_NAMES.map((n, idx) => ({
        id: `se-rb-${idx}`,
        kind: 'heartbeat_run_invoke',
        actor: n,
        run_id: `run-${n.replace(/\W+/g, '-').toLowerCase()}-001`,
      })),
      ...CANONICAL_DIVISION_NAMES.map((n, idx) => ({
        id: `se-st-${idx}`,
        kind: 'issue_status_update',
        actor: n,
        issue_id: rootId,
      })),
    ];
    const { inner, calls } = buildMockTransport({
      issueChildren, heartbeatRunData, dispositionData,
      commentData, documentData, reviewData, sideEffectData,
    });
    const bt = new BoundedTransport(inner);
    const result = await runOnce({
      admission: buildAdmittedAdmissionEvidence(),
      intake,
      transport: bt,
      options: { acceptSafeBlock: false, maxObserveSeconds: 5, pollIntervalMs: 10 },
    });
    assert.equal(result.evidence.status, 'MISSION_PASS', `expected PASS but got ${result.evidence.status} blockers=${JSON.stringify(result.evidence.blockers)}`);
    assert.equal(result.exitCode, EXIT_CODES.MISSION_PASS);
    assert.equal(result.evidence.harness_writes.root_issue_create, 1);
    const createCalls = calls.filter((c) => c.op === 'createRootIssue');
    assert.equal(createCalls.length, 1);
    assert.equal(createCalls[0].payload.assignee, 'Div7.MissionControl');
    assert.equal(createCalls[0].payload.parent_issue_id, null);
    assert.equal(result.evidence.mission_run.observer_status.terminal, true);
    assert.equal(result.evidence.mission_run.observer_budget_exhausted, false);
  });

  it('admission admitted + transport throws on createRootIssue → MISSION_RUNNER_FAILURE, exit 4', async () => {
    const { inner } = buildMockTransport({ transportErrors: { createRootIssue: true } });
    const bt = new BoundedTransport(inner);
    const result = await runOnce({
      admission: buildAdmittedAdmissionEvidence(),
      intake: buildValidIntake(),
      transport: bt,
      options: { acceptSafeBlock: false },
    });
    assert.equal(result.evidence.status, 'MISSION_RUNNER_FAILURE');
    assert.equal(result.exitCode, EXIT_CODES.MISSION_RUNNER_FAILURE);
  });

  it('admission admitted + transport throws mid-observer → RUNNER_FAILURE (not OPERATING)', async () => {
    const rootId = 'root-issue-mock-001';
    const { inner } = buildMockTransport({ issueChildren: [], heartbeatRunData: [], transportErrors: { listHeartbeatRuns: true } });
    const bt = new BoundedTransport(inner);
    const result = await runOnce({
      admission: buildAdmittedAdmissionEvidence(),
      intake: buildValidIntake(),
      transport: bt,
      options: { acceptSafeBlock: false, maxObserveSeconds: 1, pollIntervalMs: 50 },
    });
    assert.equal(result.evidence.status, 'MISSION_RUNNER_FAILURE');
    assert.equal(result.exitCode, EXIT_CODES.MISSION_RUNNER_FAILURE);
    assert.ok(result.evidence.blockers[0].code.includes('OBSERVER-TRANSPORT-ERROR-'));
  });
});

// ---------------------------------------------------------------------------
// HttpTransport — sanity check on URL composition
// ---------------------------------------------------------------------------

describe('HttpTransport', () => {
  it('refuses to construct without a fetch implementation when global fetch is unavailable', () => {
    const originalFetch = global.fetch;
    try {
      delete global.fetch;
      assert.throws(
        () => new HttpTransport({ baseUrl: 'http://127.0.0.1:43131' }),
        /HttpTransport requires global fetch/,
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('builds URL paths correctly for createRootIssue and read-only ops', () => {
    const transport = new HttpTransport({ baseUrl: 'http://x/', companyId: 'cmp', fetchImpl: () => {} });
    const expected = {
      getCompany: 'http://x/api/companies/cmp',
      createRootIssue: 'http://x/api/companies/cmp/issues',
      listHeartbeatRuns: 'http://x/api/companies/cmp/heartbeat-runs',
      getSideEffects: 'http://x/api/companies/cmp/side-effects',
    };
    for (const [op, url] of Object.entries(expected)) {
      assert.equal(transport._urlFor(op), url);
    }
  });
});

// ---------------------------------------------------------------------------
// printHelp smoke
// ---------------------------------------------------------------------------

describe('printHelp', () => {
  it('writes usage text to stdout', () => {
    const captured = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = (msg) => { captured.push(String(msg)); return true; };
    try {
      printHelp();
    } finally {
      process.stdout.write = original;
    }
    assert.ok(captured.length > 0);
    assert.ok(captured.join('').includes('Usage:'));
    assert.ok(captured.join('').includes('--accept-safe-block'));
  });
});
