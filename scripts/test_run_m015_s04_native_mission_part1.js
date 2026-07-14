#!/usr/bin/env node
'use strict';

/**
 * scripts/test_run_m015_s04_native_mission_part1.js
 *
 * M015-4o8lfw / S04 / T03 — Hermetic tests, part 1 of 2.
 *
 * Covers the structural side of the bounded-intake + read-only observer
 * harness:
 *   - constants/namespace sanity (RUNNER_BLOCKER_CODES, EXIT_CODES)
 *   - loadRunnerInput (happy, missing admission, missing intake, malformed)
 *   - validateIntake (literal-boolean confirmation, required fields,
 *     assignee/parent invariant)
 *   - deriveMissionContext (auto-derive + custom + format validation)
 *   - parseArgs (CLI defaults, overrides, --help, unknown arg)
 *   - BoundedTransport (mode transitions, 2nd-intake rejection,
 *     post-intake write rejection, non-intake write rejection)
 *   - runIntake (happy + transport/response errors)
 *   - MultipleIntakeError shape
 *   - runner module re-exports
 *
 * All tests are HERMETIC. In-memory fixtures + MockTransport record
 * calls; no runtime-evidence/ dependency on disk (write refusal guard
 * is in part 2).
 */

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { describe, it, beforeEach, afterEach } = require('node:test');

const data = require('./lib/m015-s04-native-runner-data');
const contract = require('./lib/m015-s04-native-runner-contract');
const runner = require('./run_m015_s04_native_mission');
const probe = require('./probe_m015_seven_agent_environment');
const fixtures = require('./lib/m015-s04-native-runner-fixtures');
const {
  CANONICAL_DIVISION_NAMES,
} = probe;
const {
  buildAdmittedAdmissionEvidence,
  buildBlockedAdmissionEvidence,
  buildValidIntake,
  buildMockTransport,
} = fixtures;

const {
  RUNNER_BLOCKER_CODES,
  EXIT_CODES,
  DEFAULTS,
  REQUIRED_INTAKE_FIELDS,
  ROOT_REQUIRED_ASSIGNEE,
  MISSION_KEY_PREFIX,
  MISSION_KEY_SLUG_RE,
} = data;

const {
  loadRunnerInput,
  validateIntake,
  deriveMissionContext,
} = contract;

const {
  BoundedTransport,
  MultipleIntakeError,
  runIntake,
  parseArgs,
  PROTOCOL_BLOCKER_CODES,
} = runner;

// ---------------------------------------------------------------------------
// Blockers namespace sanity
// ---------------------------------------------------------------------------

describe('M015-S04 native runner data + namespace', () => {
  it('RUNNER_BLOCKER_CODES has the expected top-level keys', () => {
    for (const key of [
      'RUNNER_FAILURE', 'INTAKE_PAYLOAD_MISSING', 'INTAKE_PAYLOAD_MALFORMED',
      'INTAKE_TITLE_REQUIRED', 'INTAKE_DESCRIPTION_REQUIRED',
      'INTAKE_CONFIRMATION_REQUIRED', 'INTAKE_CONFIRMATION_NOT_EXPLICIT',
      'INTAKE_ASSIGNEE_MUST_BE_DIV7', 'INTAKE_PARENT_MUST_BE_NULL',
      'HARNESS_WROTE_MULTIPLE_ROOT', 'HARNESS_WROTE_OPERATING',
      'HARNESS_POST_INTAKE_WRITE', 'LEAK_UUID', 'LEAK_CREDENTIAL', 'LEAK_XIAOMI',
    ]) {
      assert.equal(typeof RUNNER_BLOCKER_CODES[key], 'string', `missing ${key}`);
      assert.ok(RUNNER_BLOCKER_CODES[key].startsWith('M15-S04-NATIVE-RUN-'), `${key} should prefix M15-S04-NATIVE-RUN-`);
    }
  });

  it('RUNNER_BLOCKER_CODES template functions return M15-S04-NATIVE-RUN-* strings', () => {
    assert.ok(RUNNER_BLOCKER_CODES.INTAKE_INVALID('title').startsWith('M15-S04-NATIVE-RUN-INTAKE-INVALID-'));
    assert.ok(RUNNER_BLOCKER_CODES.OBSERVER_TRANSPORT_ERROR('listIssues').startsWith('M15-S04-NATIVE-RUN-OBSERVER-TRANSPORT-ERROR-'));
    assert.ok(RUNNER_BLOCKER_CODES.ROOT_ISSUE_CREATE_HTTP_ERROR(500).startsWith('M15-S04-NATIVE-RUN-ROOT-CREATE-HTTP-'));
    assert.ok(RUNNER_BLOCKER_CODES.OBSERVED_SIDE_EFFECT_DURING_OBSERVER('comment_create').startsWith('M15-S04-NATIVE-RUN-OBSERVED-SIDE-EFFECT-'));
  });

  it('EXIT_CODES spans all 7 verdict classes', () => {
    assert.equal(EXIT_CODES.MISSION_PASS, 0);
    assert.equal(EXIT_CODES.MISSION_FAIL_CLOSED, 1);
    assert.equal(EXIT_CODES.MISSION_BLOCKED_SAFE, 2);
    assert.equal(EXIT_CODES.MISSION_BLOCKED_NO_RUN, 3);
    assert.equal(EXIT_CODES.MISSION_RUNNER_FAILURE, 4);
    assert.equal(EXIT_CODES.MISSION_HARNESS_WROTE_MULTIPLE_ROOT, 5);
    assert.equal(EXIT_CODES.MISSION_HARNESS_WROTE_OPERATING, 6);
  });

  it('REQUIRED_INTAKE_FIELDS is exactly [title, description, confirmation]', () => {
    assert.deepEqual([...REQUIRED_INTAKE_FIELDS], ['title', 'description', 'confirmation']);
  });

  it('DEFAULTS contains admission / intake / output paths and bounded budgets', () => {
    assert.equal(typeof DEFAULTS.admission_path, 'string');
    assert.equal(typeof DEFAULTS.intake_path, 'string');
    assert.equal(typeof DEFAULTS.output_path, 'string');
    assert.equal(DEFAULTS.max_observe_seconds, 600);
    assert.equal(DEFAULTS.max_observe_seconds_ceiling, 3600);
    assert.equal(DEFAULTS.poll_interval_ms, 5000);
  });

  it('ROOT_REQUIRED_ASSIGNEE is Div7.MissionControl', () => {
    assert.equal(ROOT_REQUIRED_ASSIGNEE, 'Div7.MissionControl');
  });

  it('MISSION_KEY_PREFIX is s04-mission- and the slug regex accepts typical inputs', () => {
    assert.equal(MISSION_KEY_PREFIX, 's04-mission-');
    assert.equal(MISSION_KEY_SLUG_RE.test('fixture-2026-07-14T16-00-00Z'), true);
    assert.equal(MISSION_KEY_SLUG_RE.test('a'), true);
    assert.equal(MISSION_KEY_SLUG_RE.test('A.B_C-1'), true);
    assert.equal(MISSION_KEY_SLUG_RE.test('!@#$'), false);
    assert.equal(MISSION_KEY_SLUG_RE.test('a'.repeat(80)), false);
  });

  it('CANONICAL_DIVISION_NAMES has 7 entries in canonical order', () => {
    assert.equal(CANONICAL_DIVISION_NAMES.length, 7);
    assert.equal(CANONICAL_DIVISION_NAMES[6], 'Div7.MissionControl');
  });

  it('runner module re-exports the contract helpers verbatim', () => {
    assert.equal(runner.validateIntake, validateIntake);
    assert.equal(runner.deriveMissionContext, deriveMissionContext);
    assert.equal(runner.evaluateMissionOutcome, contract.evaluateMissionOutcome);
    assert.equal(runner.buildRunnerEvidence, contract.buildRunnerEvidence);
    assert.equal(runner.writeRunnerEvidence, contract.writeRunnerEvidence);
  });
});

// ---------------------------------------------------------------------------
// loadRunnerInput
// ---------------------------------------------------------------------------

describe('loadRunnerInput', () => {
  let tmpRoot;
  let prevCwd;
  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'm015-s04-runner-input-'));
    prevCwd = process.cwd();
    process.chdir(tmpRoot);
  });
  afterEach(() => {
    process.chdir(prevCwd);
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('happy path: loads admission + intake JSON', () => {
    const admissionPath = path.join(tmpRoot, 'admission.json');
    const intakePath = path.join(tmpRoot, 'intake.json');
    fs.writeFileSync(admissionPath, JSON.stringify(buildAdmittedAdmissionEvidence()));
    fs.writeFileSync(intakePath, JSON.stringify(buildValidIntake()));
    const loaded = loadRunnerInput({ admissionPath, intakePath });
    assert.equal(loaded.admission.status, 'ADMITTED');
    assert.equal(loaded.intake.title.length > 5, true);
  });

  it('throws when admission JSON is missing', () => {
    const intakePath = path.join(tmpRoot, 'intake.json');
    fs.writeFileSync(intakePath, JSON.stringify(buildValidIntake()));
    assert.throws(
      () => loadRunnerInput({ admissionPath: path.join(tmpRoot, 'missing.json'), intakePath }),
      /admission evidence missing|M15-S04-(PROTOCOL-ADMISSION-EVIDENCE-MISSING|NATIVE-RUN-RUNNER-FAILURE)/,
    );
  });

  it('throws when admission JSON is malformed', () => {
    const admissionPath = path.join(tmpRoot, 'admission.json');
    fs.writeFileSync(admissionPath, '{ this is not json ');
    assert.throws(
      () => loadRunnerInput({ admissionPath, intakePath: null }),
      /malformed JSON|M15-S04-/,
    );
  });

  it('allows intake to be null (admission-blocked short-circuit)', () => {
    const admissionPath = path.join(tmpRoot, 'admission.json');
    fs.writeFileSync(admissionPath, JSON.stringify(buildBlockedAdmissionEvidence()));
    const loaded = loadRunnerInput({ admissionPath, intakePath: null });
    assert.equal(loaded.admission.status, 'BLOCKED_ON_S03_FAIL_CLOSED');
    assert.equal(loaded.intake, null);
  });

  it('throws when intake JSON is missing and intakePath supplied', () => {
    const admissionPath = path.join(tmpRoot, 'admission.json');
    fs.writeFileSync(admissionPath, JSON.stringify(buildAdmittedAdmissionEvidence()));
    assert.throws(
      () => loadRunnerInput({
        admissionPath,
        intakePath: path.join(tmpRoot, 'missing-intake.json'),
      }),
      (error) => {
        assert.equal(error.code, RUNNER_BLOCKER_CODES.INTAKE_PAYLOAD_MISSING);
        return true;
      },
    );
  });

  it('throws when intake JSON is malformed', () => {
    const admissionPath = path.join(tmpRoot, 'admission.json');
    const intakePath = path.join(tmpRoot, 'intake.json');
    fs.writeFileSync(admissionPath, JSON.stringify(buildAdmittedAdmissionEvidence()));
    fs.writeFileSync(intakePath, '{ not valid');
    assert.throws(
      () => loadRunnerInput({ admissionPath, intakePath }),
      (error) => {
        assert.equal(error.code, RUNNER_BLOCKER_CODES.INTAKE_PAYLOAD_MALFORMED);
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// validateIntake
// ---------------------------------------------------------------------------

describe('validateIntake', () => {
  it('happy path: returns ok=true with no blockers', () => {
    const result = validateIntake(buildValidIntake());
    assert.equal(result.ok, true);
    assert.deepEqual(result.blockers, []);
    assert.equal(typeof result.intake.title, 'string');
  });

  it('rejects null / array / non-object intakes', () => {
    for (const bad of [null, [], 'string', 42]) {
      const r = validateIntake(bad);
      assert.equal(r.ok, false);
      assert.ok(r.blockers.some((b) => b.code === RUNNER_BLOCKER_CODES.INTAKE_PAYLOAD_MALFORMED));
    }
  });

  it('rejects intake missing required top-level field', () => {
    const intake = buildValidIntake();
    delete intake.title;
    const r = validateIntake(intake);
    assert.equal(r.ok, false);
    assert.ok(r.blockers.some((b) => b.code === RUNNER_BLOCKER_CODES.INTAKE_INVALID('title')));
  });

  it('rejects non-string / empty title', () => {
    for (const bad of ['', '   ', null, undefined, 7, {}, []]) {
      const intake = buildValidIntake({ title: bad });
      if (bad === undefined) delete intake.title;
      const r = validateIntake(intake);
      assert.equal(r.ok, false);
      assert.ok(
        r.blockers.some((b) =>
          b.code === RUNNER_BLOCKER_CODES.INTAKE_TITLE_REQUIRED ||
          b.code === RUNNER_BLOCKER_CODES.INTAKE_INVALID('title'),
        ),
        `expected title-required blocker for ${JSON.stringify(bad)}, got ${r.blockers.map((b) => b.code).join(',')}`,
      );
    }
  });

  it('rejects non-string / empty description', () => {
    const intake = buildValidIntake({ description: '' });
    const r = validateIntake(intake);
    assert.equal(r.ok, false);
    assert.ok(r.blockers.some((b) => b.code === RUNNER_BLOCKER_CODES.INTAKE_DESCRIPTION_REQUIRED));
  });

  it('rejects missing confirmation object', () => {
    const intake = buildValidIntake();
    delete intake.confirmation;
    const r = validateIntake(intake);
    assert.equal(r.ok, false);
    assert.ok(r.blockers.some((b) => b.code === RUNNER_BLOCKER_CODES.INTAKE_CONFIRMATION_REQUIRED));
  });

  it('rejects confirmation.explicit that is not literally true', () => {
    for (const bad of [false, 'true', 1, null, undefined, 'YES', '1']) {
      const intake = buildValidIntake({ confirmation: { explicit: bad, reason: 'some reason' } });
      const r = validateIntake(intake);
      assert.equal(r.ok, false, `should reject explicit=${JSON.stringify(bad)}`);
      assert.ok(r.blockers.some((b) => b.code === RUNNER_BLOCKER_CODES.INTAKE_CONFIRMATION_NOT_EXPLICIT));
    }
  });

  it('rejects confirmation.reason that is empty or missing', () => {
    for (const bad of ['', '   ', null, undefined]) {
      const intake = buildValidIntake({ confirmation: { explicit: true, reason: bad } });
      if (bad === undefined) delete intake.confirmation.reason;
      const r = validateIntake(intake);
      assert.equal(r.ok, false);
      assert.ok(
        r.blockers.some((b) =>
          b.code === RUNNER_BLOCKER_CODES.INTAKE_INVALID('confirmation.reason') ||
          b.code === RUNNER_BLOCKER_CODES.INTAKE_CONFIRMATION_REQUIRED,
        ),
        `should reject reason=${JSON.stringify(bad)}`,
      );
    }
  });

  it('rejects intake.assignee that is not Div7.MissionControl', () => {
    for (const bad of ['Div1.HCO', 'Div2.MasterPlanner', 'harness', 'someone-else']) {
      const intake = buildValidIntake({ assignee: bad });
      const r = validateIntake(intake);
      assert.equal(r.ok, false);
      assert.ok(r.blockers.some((b) => b.code === RUNNER_BLOCKER_CODES.INTAKE_ASSIGNEE_MUST_BE_DIV7));
    }
  });

  it('rejects intake.parent_issue_id that is not null', () => {
    for (const bad of ['some-issue-id-uuid', 1, {}, true]) {
      const intake = buildValidIntake({ parent_issue_id: bad });
      const r = validateIntake(intake);
      assert.equal(r.ok, false);
      assert.ok(r.blockers.some((b) => b.code === RUNNER_BLOCKER_CODES.INTAKE_PARENT_MUST_BE_NULL));
    }
  });

  it('accepts intake where parent_issue_id is null', () => {
    const intake = buildValidIntake({ parent_issue_id: null });
    const r = validateIntake(intake);
    assert.equal(r.ok, true);
  });
});

// ---------------------------------------------------------------------------
// deriveMissionContext
// ---------------------------------------------------------------------------

describe('deriveMissionContext', () => {
  it('auto-derives mission_key from timestamp when not supplied', () => {
    const intake = buildValidIntake();
    delete intake.mission_key;
    delete intake.idempotency_key;
    delete intake.recovery_lock;
    const fixedNow = new Date('2026-07-14T16:00:00.000Z');
    const r = deriveMissionContext(intake, { now: fixedNow });
    assert.equal(r.ok, true);
    assert.equal(r.missionKey, 's04-mission-2026-07-14T16-00-00Z');
    assert.equal(r.idempotencyKey.includes('s04-mission-2026-07-14T16-00-00Z'), true);
    assert.equal(r.recoveryLock, 'replay-blocked-on:s04-mission-2026-07-14T16-00-00Z');
    assert.equal(r.derivedAt, '2026-07-14T16:00:00.000Z');
  });

  it('preserves intake-provided mission_key / idempotency_key / recovery_lock', () => {
    const intake = buildValidIntake();
    const r = deriveMissionContext(intake);
    assert.equal(r.missionKey, intake.mission_key);
    assert.equal(r.idempotencyKey, intake.idempotency_key);
    assert.equal(r.recoveryLock, intake.recovery_lock);
  });

  it('rejects mission_key that does not match the slug regex', () => {
    const intake = buildValidIntake({ mission_key: 's04-mission-!!!invalid!!!' });
    const r = deriveMissionContext(intake);
    assert.equal(r.ok, false);
    assert.ok(r.blockers.some((b) => b.code === RUNNER_BLOCKER_CODES.MISSION_KEY_INVALID));
  });

  it('rejects mission_key that is missing the prefix entirely', () => {
    const intake = buildValidIntake({ mission_key: 'nosuchprefix-2026-07-14' });
    const r = deriveMissionContext(intake);
    assert.equal(r.ok, false);
    assert.ok(r.blockers.some((b) => b.code === RUNNER_BLOCKER_CODES.MISSION_KEY_INVALID));
  });

  it('idempotency_key derivation uses missionKey when not supplied', () => {
    const intake = buildValidIntake();
    delete intake.idempotency_key;
    const r = deriveMissionContext(intake);
    assert.equal(r.idempotencyKey, `${intake.mission_key}::pending-root-issue-id`);
  });

  it('recovery_lock derivation uses missionKey when not supplied', () => {
    const intake = buildValidIntake();
    delete intake.recovery_lock;
    const r = deriveMissionContext(intake);
    assert.equal(r.recoveryLock, `replay-blocked-on:${intake.mission_key}`);
  });
});

// ---------------------------------------------------------------------------
// BoundedTransport — mode transitions and write surface enforcement
// ---------------------------------------------------------------------------

describe('BoundedTransport', () => {
  it('starts in INTAKE mode and rejects >1 createRootIssue calls', async () => {
    const { inner, calls } = buildMockTransport();
    const bt = new BoundedTransport(inner);
    assert.equal(bt.mode, 'INTAKE');
    const r1 = await bt.createRootIssue({ title: 'one' });
    assert.equal(r1.id, 'root-issue-mock-001');
    assert.equal(bt.mode, 'OBSERVER');
    assert.equal(bt.intakeCompleted, true);
    await assert.rejects(
      () => bt.createRootIssue({ title: 'two' }),
      (error) => {
        assert.equal(error.code, RUNNER_BLOCKER_CODES.HARNESS_WROTE_MULTIPLE_ROOT);
        assert.ok(error instanceof MultipleIntakeError);
        return true;
      },
    );
    const createCalls = calls.filter((c) => c.op === 'createRootIssue');
    assert.equal(createCalls.length, 1);
  });

  it('rejects non-createRootIssue writes in INTAKE mode (operating writes blocked)', async () => {
    const { inner, calls } = buildMockTransport();
    const bt = new BoundedTransport(inner);
    assert.throws(
      () => bt._write('POST', 'createDiv1Child', () => 'should-not-be-called'),
      (error) => {
        assert.equal(error.code, RUNNER_BLOCKER_CODES.HARNESS_WROTE_OPERATING);
        return true;
      },
    );
    const createCalls = calls.filter((c) => c.op === 'createDiv1Child');
    assert.equal(createCalls.length, 0);
  });

  it('rejects any non-GET write after intake completes', async () => {
    const { inner } = buildMockTransport();
    const bt = new BoundedTransport(inner);
    await bt.createRootIssue({ title: 'one' });
    assert.throws(
      () => bt._write('POST', 'createRootIssue', () => 'x'),
      (err) => {
        assert.equal(err.code, RUNNER_BLOCKER_CODES.HARNESS_WROTE_MULTIPLE_ROOT);
        return true;
      },
    );
    assert.throws(
      () => bt._write('POST', 'createComment', () => 'x'),
      (err) => {
        assert.equal(err.code, RUNNER_BLOCKER_CODES.HARNESS_POST_INTAKE_WRITE);
        return true;
      },
    );
    assert.throws(
      () => bt._write('PATCH', 'updateIssue', () => 'x'),
      (err) => {
        assert.equal(err.code, RUNNER_BLOCKER_CODES.HARNESS_POST_INTAKE_WRITE);
        return true;
      },
    );
    assert.throws(
      () => bt._write('DELETE', 'archiveIssue', () => 'x'),
      (err) => {
        assert.equal(err.code, RUNNER_BLOCKER_CODES.HARNESS_POST_INTAKE_WRITE);
        return true;
      },
    );
  });

  it('allows GET reads before AND after intake', async () => {
    const { inner, calls } = buildMockTransport();
    const bt = new BoundedTransport(inner);
    await bt.listIssues({});
    await bt.createRootIssue({ title: 'one' });
    await bt.listHeartbeatRuns({ division: '*' });
    await bt.getIssueComments('root');
    await bt.getIssueDocuments('root');
    await bt.getDispositions('root');
    await bt.getReviews('root');
    await bt.getSideEffects({});
    // 7 read calls: 1 before intake + 6 after intake (across 7 distinct read ops).
    const getCalls = calls.filter((c) => c.method !== 'POST');
    assert.equal(getCalls.length, 7);
  });

  it('wraps transport errors with OBSERVER_TRANSPORT_ERROR during reads', async () => {
    const { inner } = buildMockTransport({ transportErrors: { listIssues: true } });
    const bt = new BoundedTransport(inner);
    await bt.createRootIssue({ title: 'one' });
    await assert.rejects(
      () => bt.listIssues({}),
      (error) => {
        assert.equal(error.code, RUNNER_BLOCKER_CODES.OBSERVER_TRANSPORT_ERROR('listIssues'));
        return true;
      },
    );
  });

  it('observes harness-authored side effects via getSideEffects read', async () => {
    const { inner } = buildMockTransport({
      sideEffectData: [
        { id: 'se-1', kind: 'comment_create', actor: 'harness', observed_at: '2026-07-14T16:00:30.000Z' },
        { id: 'se-2', kind: 'issue_status_update', actor: 'Div5.QualificationsLibraryLearning', observed_at: '2026-07-14T16:00:31.000Z' },
      ],
    });
    const bt = new BoundedTransport(inner);
    await bt.createRootIssue({ title: 'one' });
    await bt.getSideEffects({});
    assert.equal(bt.sideEffectsObserved.length, 1);
    assert.equal(bt.sideEffectsObserved[0].kind, 'comment_create');
    assert.equal(bt.sideEffectsObserved[0].actor, 'harness');
  });
});

// ---------------------------------------------------------------------------
// runIntake
// ---------------------------------------------------------------------------

describe('runIntake', () => {
  it('happy path: issues one createRootIssue and returns rootIssue with all key fields', async () => {
    const { inner, calls } = buildMockTransport();
    const bt = new BoundedTransport(inner);
    const intake = buildValidIntake();
    const missionContext = deriveMissionContext(intake);
    const result = await runIntake({ transport: bt, intake, missionContext });
    assert.equal(result.rootIssue.id, 'root-issue-mock-001');
    assert.equal(result.rootIssue.assignee, 'Div7.MissionControl');
    assert.equal(result.rootIssue.parent_issue_id, null);
    assert.equal(result.rootIssue.role, 'PO_ROOT_MISSION');
    assert.equal(result.rootIssue.created_by, 'harness');
    const createCalls = calls.filter((c) => c.op === 'createRootIssue');
    assert.equal(createCalls.length, 1);
    assert.equal(createCalls[0].payload.title, intake.title);
    assert.equal(createCalls[0].payload.assignee, 'Div7.MissionControl');
    assert.equal(createCalls[0].payload.parent_issue_id, null);
  });

  it('rejects non-object createRootIssue response', async () => {
    const { inner } = buildMockTransport({ rootIssueResponse: 'not-an-object' });
    const bt = new BoundedTransport(inner);
    await assert.rejects(
      () => runIntake({ transport: bt, intake: buildValidIntake(), missionContext: deriveMissionContext(buildValidIntake()) }),
      (err) => {
        assert.equal(err.code, RUNNER_BLOCKER_CODES.ROOT_ISSUE_CREATE_NOT_OBJECT);
        return true;
      },
    );
  });

  it('rejects response missing id', async () => {
    const { inner } = buildMockTransport({ rootIssueResponse: { assignee: 'Div7.MissionControl' } });
    const bt = new BoundedTransport(inner);
    await assert.rejects(
      () => runIntake({ transport: bt, intake: buildValidIntake(), missionContext: deriveMissionContext(buildValidIntake()) }),
      (err) => {
        assert.equal(err.code, RUNNER_BLOCKER_CODES.ROOT_ISSUE_ID_MISSING);
        return true;
      },
    );
  });

  it('rejects response with wrong assignee', async () => {
    const { inner } = buildMockTransport({ rootIssueResponse: { id: 'root-1', assignee: 'Div1.HCO' } });
    const bt = new BoundedTransport(inner);
    await assert.rejects(
      () => runIntake({ transport: bt, intake: buildValidIntake(), missionContext: deriveMissionContext(buildValidIntake()) }),
      (err) => {
        assert.equal(err.code, RUNNER_BLOCKER_CODES.ROOT_ISSUE_ASSIGNEE_MISMATCH);
        return true;
      },
    );
  });

  it('rejects when transport throws on createRootIssue', async () => {
    const { inner } = buildMockTransport({ transportErrors: { createRootIssue: true } });
    const bt = new BoundedTransport(inner);
    await assert.rejects(
      () => runIntake({ transport: bt, intake: buildValidIntake(), missionContext: deriveMissionContext(buildValidIntake()) }),
      /mock transport failure/,
    );
  });

  it('requires a transport in INTAKE mode', async () => {
    const { inner } = buildMockTransport();
    const bt = new BoundedTransport(inner);
    await bt.createRootIssue({ title: 'one' });
    await assert.rejects(
      () => runIntake({ transport: bt, intake: buildValidIntake(), missionContext: deriveMissionContext(buildValidIntake()) }),
      /INTAKE mode/,
    );
  });
});

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

describe('parseArgs', () => {
  it('returns defaults with no flags', () => {
    const args = parseArgs(['node', 'run_m015_s04_native_mission.js']);
    assert.equal(args.acceptSafeBlock, false);
    assert.equal(args.maxObserveSeconds, DEFAULTS.max_observe_seconds);
    assert.equal(args.pollIntervalMs, DEFAULTS.poll_interval_ms);
    assert.deepEqual(args.previousMissionKeys, []);
    assert.equal(args.help, undefined);
  });

  it('parses --accept-safe-block', () => {
    const args = parseArgs(['node', 'x', '--accept-safe-block']);
    assert.equal(args.acceptSafeBlock, true);
  });

  it('parses --admission / --intake / --output paths', () => {
    const args = parseArgs(['node', 'x', '--admission', '/tmp/a.json', '--intake', '/tmp/i.json', '--output', '/tmp/o.json']);
    assert.equal(args.admission, '/tmp/a.json');
    assert.equal(args.intake, '/tmp/i.json');
    assert.equal(args.output, '/tmp/o.json');
  });

  it('parses --previous-mission-keys comma list and trims empties', () => {
    const args = parseArgs(['node', 'x', '--previous-mission-keys', 'a,b,,c']);
    assert.deepEqual(args.previousMissionKeys, ['a', 'b', 'c']);
  });

  it('parses --max-observe-seconds and --poll-interval-ms', () => {
    const args = parseArgs(['node', 'x', '--max-observe-seconds', '120', '--poll-interval-ms', '1500']);
    assert.equal(args.maxObserveSeconds, 120);
    assert.equal(args.pollIntervalMs, 1500);
  });

  it('sets --help flag without throwing', () => {
    const args = parseArgs(['node', 'x', '--help']);
    assert.equal(args.help, true);
  });

  it('throws on unknown arg', () => {
    assert.throws(
      () => parseArgs(['node', 'x', '--wat']),
      /unknown arg: --wat/,
    );
  });
});

// ---------------------------------------------------------------------------
// MultipleIntakeError shape
// ---------------------------------------------------------------------------

describe('MultipleIntakeError', () => {
  it('carries the HARNESS_WROTE_MULTIPLE_ROOT blocker code', () => {
    const e = new MultipleIntakeError();
    assert.equal(e.code, RUNNER_BLOCKER_CODES.HARNESS_WROTE_MULTIPLE_ROOT);
    assert.ok(/refused second issue_create/.test(e.message));
  });
});

// ---------------------------------------------------------------------------
// PROTOCOL_BLOCKER_CODES re-export smoke
// ---------------------------------------------------------------------------

describe('runner module re-exports', () => {
  it('exposes PROTOCOL_BLOCKER_CODES so downstream validators can share names', () => {
    assert.equal(typeof PROTOCOL_BLOCKER_CODES, 'object');
    if (Object.keys(PROTOCOL_BLOCKER_CODES).length > 0) {
      assert.equal(typeof PROTOCOL_BLOCKER_CODES.ADMISSION_BLOCKER_CARRY_FORWARD, 'string');
    }
  });
});
