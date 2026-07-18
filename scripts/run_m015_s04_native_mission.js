#!/usr/bin/env node
'use strict';

/**
 * scripts/run_m015_s04_native_mission.js
 *
 * M015-4o8lfw / S04 / T03 — Bounded intake and read-only observer harness
 * for the native seven-division mission.
 *
 * The harness has exactly two operating modes:
 *
 *   INTAKE MODE (single mutation window)
 *     - Load T01 admission evidence; if it shows BLOCKED_ON_S03_FAIL_CLOSED,
 *       refuse to issue the bounded intake and exit per the BLOCKED_* codes.
 *     - Validate the operator-supplied intake payload (title, description,
 *       explicit confirmation, optional mission/idempotency/recovery keys).
 *     - Issue ONE root PO mission via the wrapped transport. The only
 *       mutation the harness is allowed to make is an `issue_create` with
 *       assignee=Div7.MissionControl and parent_issue_id=null.
 *
 *   OBSERVER MODE (pure read-only)
 *     - After intake, the transport transitions to OBSERVER mode. Any
 *       further non-GET transport call refuses with
 *       M15-S04-NATIVE-RUN-HARNESS-POST-INTAKE-WRITE (or
 *       M15-S04-NATIVE-RUN-HARNESS-WROTE-MULTIPLE-ROOT for second intake).
 *     - The harness polls the Paperclip API (issues, heartbeat_runs,
 *       comments, documents, dispositions, reviews, side_effects) until
 *       either (a) all seven divisions reach a terminal state with
 *       dispositions, or (b) the bounded observer budget exhausts.
 *     - Reads only — no harness-authored child issues, fan-out heartbeats,
 *       comments, documents, reviews, or disposition changes.
 *
 * Output (always written, even on failure):
 *   runtime-evidence/M015-S04-native-mission-run.json
 *
 * Verdict field is one of:
 *   - 'MISSION_PASS'            — all 10 MG gates pass on readback
 *   - 'MISSION_FAIL_CLOSED'     — at least one gate failed
 *   - 'MISSION_BLOCKED_SAFE'    — admission blocked, no run, --accept-safe-block
 *   - 'MISSION_BLOCKED_NO_RUN'  — admission blocked, no run, no --accept-safe-block
 *   - 'MISSION_RUNNER_FAILURE'  — harness itself crashed
 *
 * Exit codes:
 *   0 = MISSION_PASS
 *   1 = MISSION_FAIL_CLOSED
 *   2 = MISSION_BLOCKED_SAFE
 *   3 = MISSION_BLOCKED_NO_RUN
 *   4 = MISSION_RUNNER_FAILURE
 *   5 = MISSION_HARNESS_WROTE_MULTIPLE_ROOT (defensive)
 *   6 = MISSION_HARNESS_WROTE_OPERATING   (defensive)
 *
 * Pure-function helpers (validateIntake, deriveMissionContext,
 * evaluateMissionOutcome, buildRunnerEvidence, writeRunnerEvidence,
 * loadRunnerInput, deriveMissionStatus, aggregateMissionRun) live in
 * scripts/lib/m015-s04-native-runner-contract.js. This file owns the
 * transport adapter, the observer loop, the one-shot driver, and the
 * CLI glue.
 */

const fs = require('fs');
const path = require('path');
const {
  CANONICAL_DIVISION_NAMES,
} = require('./probe_m015_seven_agent_environment');
const {
  RUNNER_BLOCKER_CODES,
  EXIT_CODES,
  DEFAULTS,
  ROOT_REQUIRED_ASSIGNEE,
} = require('./lib/m015-s04-native-runner-data');
const {
  loadRunnerInput,
  validateIntake,
  deriveMissionContext,
  aggregateMissionRun,
  evaluateMissionOutcome,
  buildRunnerEvidence,
  writeRunnerEvidence,
  nowIso,
} = require('./lib/m015-s04-native-runner-contract');

const ROOT = path.resolve(__dirname, '..');
const ADMISSION_PATH = path.join(ROOT, DEFAULTS.admission_path);
const DEFAULT_INTAKE_PATH = path.join(ROOT, DEFAULTS.intake_path);
const OUTPUT_PATH = path.join(ROOT, DEFAULTS.output_path);

const PROTOCOL_BLOCKER_CODES = (() => {
  try {
    return require('./validate_m015_s04_native_mission').BLOCKER_CODES || {};
  } catch (_) {
    return {};
  }
})();

// ---------------------------------------------------------------------------
// BoundedTransport — wraps an underlying transport. Tracks INTAKE/OBSERVER
// mode and refuses to issue any non-GET call after the intake completes.
// ---------------------------------------------------------------------------

class BoundedTransport {
  constructor(inner) {
    if (!inner || typeof inner !== 'object') {
      throw new Error('BoundedTransport requires an inner transport');
    }
    this.inner = inner;
    this.mode = 'INTAKE';
    this.intakeCompleted = false;
    this.intakeAttempts = 0;
    this.intakeStartedAt = null;
    this.sideEffectsObserved = [];
  }

  _read(method, op, fn) {
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      return this._write(method, op, fn);
    }
    return Promise.resolve()
      .then(() => fn())
      .then((result) => {
        this._observeReadSideEffects(op, result);
        return result;
      })
      .catch((error) => { throw this._wrapTransportError(op, error); });
  }

  _write(method, op, fn) {
    const upperMethod = String(method || '').toUpperCase();
    if (this.mode === 'OBSERVER') {
      // Defensive: if the harness somehow attempted a second intake
      // while already in OBSERVER mode, surface the more specific
      // HARNESS_WROTE_MULTIPLE_ROOT error rather than the generic
      // HARNESS_POST_INTAKE_WRITE. Both paths still refuse without
      // emitting any side effect.
      if (op === 'createRootIssue') {
        throw new MultipleIntakeError();
      }
      throw this._postIntakeError(upperMethod, op);
    }
    if (this.mode === 'INTAKE') {
      if (op === 'createRootIssue') {
        this.intakeAttempts += 1;
        if (this.intakeAttempts > 1) {
          throw new MultipleIntakeError();
        }
        this.intakeStartedAt = nowIso();
        const result = fn();
        this.mode = 'OBSERVER';
        this.intakeCompleted = true;
        return result;
      }
      throw this._operatingWriteError(upperMethod, op);
    }
    throw new Error(`BoundedTransport in unknown mode: ${this.mode}`);
  }

  _observeReadSideEffects(op, result) {
    // Accept either a flat array (legacy/test shape) or a wrapped
    // { side_effects: [...] } envelope (production Paperclip shape).
    // Dedupe by entry.id so the same harness escape observed across
    // multiple observer poll iterations is recorded exactly once.
    let entries = null;
    if (!result) return;
    if (Array.isArray(result)) entries = result;
    else if (Array.isArray(result.side_effects)) entries = result.side_effects;
    if (!entries) return;
    const seenIds = new Set(this.sideEffectsObserved.map((s) => s.id).filter(Boolean));
    for (const entry of entries) {
      if (!entry) continue;
      if (entry.actor !== 'harness') continue;
      if (entry.id && seenIds.has(entry.id)) continue;
      if (entry.id) seenIds.add(entry.id);
      this.sideEffectsObserved.push({
        id: entry.id || null,
        kind: entry.kind,
        actor: entry.actor,
        observed_via: op,
        at: entry.observed_at || null,
      });
    }
  }

  _postIntakeError(method, op) {
    const err = new Error(
      `BoundedTransport refused post-intake write: method=${method} op=${op} (mode=${this.mode})`,
    );
    err.code = RUNNER_BLOCKER_CODES.HARNESS_POST_INTAKE_WRITE;
    err.method = method;
    err.op = op;
    return err;
  }

  _operatingWriteError(method, op) {
    const err = new Error(
      `BoundedTransport refused non-intake write: method=${method} op=${op} (only createRootIssue is allowed in INTAKE mode)`,
    );
    err.code = RUNNER_BLOCKER_CODES.HARNESS_WROTE_OPERATING;
    err.method = method;
    err.op = op;
    return err;
  }

  _wrapTransportError(op, error) {
    if (!error) return error;
    if (typeof error.code === 'string' && error.code.startsWith('M15-S04-NATIVE-RUN')) {
      return error;
    }
    const wrapped = new Error(
      `transport error during ${op}: ${error.message || error}`,
    );
    wrapped.code = RUNNER_BLOCKER_CODES.OBSERVER_TRANSPORT_ERROR(op);
    wrapped.cause = error;
    wrapped.op = op;
    return wrapped;
  }

  // ----- Pure read methods (always allowed) -----
  getAgentByName(name) { return this._read('GET', 'getAgentByName', () => this.inner.getAgentByName(name)); }
  getCompany() { return this._read('GET', 'getCompany', () => this.inner.getCompany()); }
  listIssues(query) { return this._read('GET', 'listIssues', () => this.inner.listIssues(query)); }
  listHeartbeatRuns(query) { return this._read('GET', 'listHeartbeatRuns', () => this.inner.listHeartbeatRuns(query)); }
  getIssueComments(issueId) { return this._read('GET', 'getIssueComments', () => this.inner.getIssueComments(issueId)); }
  getIssueDocuments(issueId) { return this._read('GET', 'getIssueDocuments', () => this.inner.getIssueDocuments(issueId)); }
  getDispositions(issueId) { return this._read('GET', 'getDispositions', () => this.inner.getDispositions(issueId)); }
  getReviews(issueId) { return this._read('GET', 'getReviews', () => this.inner.getReviews(issueId)); }
  getSideEffects(query) { return this._read('GET', 'getSideEffects', () => this.inner.getSideEffects(query)); }

  // ----- The ONLY write method -----
  createRootIssue(payload) {
    // Wrap in Promise.resolve().then(...) so that synchronous throws from
    // BoundedTransport's gate (HARNESS_WROTE_MULTIPLE_ROOT, etc.) become
    // rejected promises — callers using `await / assert.rejects` see them
    // uniformly with any underlying transport-level rejection.
    return Promise.resolve().then(() =>
      this._write('POST', 'createRootIssue', () => this.inner.createRootIssue(payload)),
    );
  }
}

class MultipleIntakeError extends Error {
  constructor() {
    super('BoundedTransport refused second issue_create call: harness may write exactly one root PO mission');
    this.code = RUNNER_BLOCKER_CODES.HARNESS_WROTE_MULTIPLE_ROOT;
  }
}

// ---------------------------------------------------------------------------
// runIntake — single bounded intake write. Returns { rootIssue, rawResponse }.
// ---------------------------------------------------------------------------

async function runIntake({ transport, intake, missionContext, harnessActor }) {
  if (!transport || transport.mode !== 'INTAKE') {
    throw new Error('runIntake requires a transport in INTAKE mode');
  }
  const payload = {
    title: intake.title.trim(),
    description: intake.description.trim(),
    assignee: ROOT_REQUIRED_ASSIGNEE,
    parent_issue_id: null,
    priority: intake.priority || 'normal',
    role: 'PO_ROOT_MISSION',
    mission_key: missionContext.missionKey,
    idempotency_key: missionContext.idempotencyKey,
    recovery_lock: missionContext.recoveryLock,
    confirmation: {
      explicit: intake.confirmation.explicit === true,
      reason: intake.confirmation.reason,
    },
    source: 'bounded-intake-harness',
    harness_actor: harnessActor || 'harness',
  };
  const response = await transport.createRootIssue(payload);
  if (!response || typeof response !== 'object') {
    const err = new Error('createRootIssue returned non-object response');
    err.code = RUNNER_BLOCKER_CODES.ROOT_ISSUE_CREATE_NOT_OBJECT;
    throw err;
  }
  if (typeof response.id !== 'string' || response.id.length === 0) {
    const err = new Error('createRootIssue response missing id field');
    err.code = RUNNER_BLOCKER_CODES.ROOT_ISSUE_ID_MISSING;
    throw err;
  }
  if (response.assignee && response.assignee !== ROOT_REQUIRED_ASSIGNEE) {
    const err = new Error(
      `createRootIssue response assignee=${JSON.stringify(response.assignee)} != ${ROOT_REQUIRED_ASSIGNEE}`,
    );
    err.code = RUNNER_BLOCKER_CODES.ROOT_ISSUE_ASSIGNEE_MISMATCH;
    throw err;
  }
  const rootIssue = {
    id: response.id,
    role: 'PO_ROOT_MISSION',
    assignee: response.assignee || ROOT_REQUIRED_ASSIGNEE,
    parent_issue_id: null,
    title: response.title || payload.title,
    created_by: payload.harness_actor,
    created_at: response.created_at || nowIso(),
    mission_key: missionContext.missionKey,
    idempotency_key: missionContext.idempotencyKey,
    recovery_lock: missionContext.recoveryLock,
  };
  return { rootIssue, rawResponse: response, payloadSent: payload };
}

// ---------------------------------------------------------------------------
// runObserver — bounded read-only poll loop. Returns observed state.
// ---------------------------------------------------------------------------

async function runObserver({ transport, rootIssue, observedState, options }) {
  const opts = options || {};
  const maxSeconds = Math.max(1, Math.min(opts.maxSeconds || DEFAULTS.max_observe_seconds, DEFAULTS.max_observe_seconds_ceiling));
  const pollIntervalMs = Math.max(DEFAULTS.poll_interval_ms_min, opts.pollIntervalMs || DEFAULTS.poll_interval_ms);
  const deadline = Date.now() + maxSeconds * 1000;

  const state = observedState && typeof observedState === 'object'
    ? observedState
    : { issues: [], comments: [], documents: [], heartbeat_runs: [], dispositions: [], reviews: [], side_effects: [], iterations: 0, started_at: nowIso() };

  let lastStatus = null;
  let budgetExhausted = false;

  while (Date.now() < deadline) {
    if (transport.mode !== 'OBSERVER') {
      throw new Error('runObserver requires OBSERVER-mode transport');
    }
    state.iterations += 1;

    const freshIssues = await safeList(() => transport.listIssues({ parent_id: rootIssue.id }), 'listIssues');
    if (freshIssues) state.issues = mergeById(state.issues, freshIssues);

    const freshRuns = await safeList(() => transport.listHeartbeatRuns({ division: '*' }), 'listHeartbeatRuns');
    if (freshRuns) state.heartbeat_runs = mergeById(state.heartbeat_runs, freshRuns);

    const freshComments = await safeList(() => transport.getIssueComments(rootIssue.id), 'getIssueComments');
    if (freshComments) state.comments = mergeById(state.comments, freshComments);

    const freshDocuments = await safeList(() => transport.getIssueDocuments(rootIssue.id), 'getIssueDocuments');
    if (freshDocuments) state.documents = mergeById(state.documents, freshDocuments);

    const freshDispositions = await safeList(() => transport.getDispositions(rootIssue.id), 'getDispositions');
    if (freshDispositions) state.dispositions = mergeById(state.dispositions, freshDispositions);

    const freshReviews = await safeList(() => transport.getReviews(rootIssue.id), 'getReviews');
    if (freshReviews) state.reviews = mergeById(state.reviews, freshReviews);

    const freshEffects = await safeList(() => transport.getSideEffects({ since: state.started_at }), 'getSideEffects');
    if (freshEffects) state.side_effects = mergeById(state.side_effects, freshEffects);

    lastStatus = computeObserverStatus(state);
    if (lastStatus.terminal) break;

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleepMs(Math.min(pollIntervalMs, remaining));
  }

  if (!lastStatus || !lastStatus.terminal) budgetExhausted = true;
  state.ended_at = nowIso();
  state.observer_status = lastStatus || computeObserverStatus(state);
  state.observer_budget_exhausted = budgetExhausted;
  state.observed_harness_escapes = (transport.sideEffectsObserved || []).slice();

  return state;
}

async function safeList(fn, op) {
  try {
    const result = await fn();
    if (result == null || !Array.isArray(result)) return null;
    return result;
  } catch (error) {
    const wrapped = new Error(
      `transport error during ${op}: ${error && error.message ? error.message : error}`,
    );
    wrapped.code = RUNNER_BLOCKER_CODES.OBSERVER_TRANSPORT_ERROR(op);
    wrapped.cause = error;
    throw wrapped;
  }
}

function mergeById(existing, fresh) {
  const seen = new Set();
  const out = [];
  for (const item of existing || []) {
    if (!item || typeof item.id !== 'string') continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  for (const item of fresh || []) {
    if (!item || typeof item.id !== 'string') continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function computeObserverStatus(state) {
  const observedRuns = state.heartbeat_runs || [];
  const observedDispositions = state.dispositions || [];
  const divisionRuns = new Map();
  for (const run of observedRuns) {
    if (!run || !run.division) continue;
    const list = divisionRuns.get(run.division) || [];
    list.push(run);
    divisionRuns.set(run.division, list);
  }
  let terminalDivisions = 0;
  for (const name of CANONICAL_DIVISION_NAMES) {
    const runs = divisionRuns.get(name) || [];
    if (runs.length >= 1 && runs.every((r) => r && ['succeeded', 'failed', 'cancelled'].includes(r.terminal_status))) {
      terminalDivisions += 1;
    }
  }
  const divisionsWithDispositions = new Set(
    (observedDispositions || [])
      .filter((d) => d && typeof d.division === 'string')
      .map((d) => d.division),
  );
  const allTerminal = terminalDivisions === CANONICAL_DIVISION_NAMES.length;
  const allDispositions = CANONICAL_DIVISION_NAMES.every((n) => divisionsWithDispositions.has(n));
  return {
    terminal: allTerminal && allDispositions,
    terminal_divisions: terminalDivisions,
    divisions_with_dispositions: divisionsWithDispositions.size,
    observed_run_count: observedRuns.length,
  };
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// runOnce — full one-shot driver. Returns { exitCode, evidence, summary }.
// ---------------------------------------------------------------------------

async function runOnce({ admission, intake, transport, options, harnessActor }) {
  const opts = options || {};
  const startedAt = nowIso();
  const admissionAdmitted = !!admission && admission.status === 'ADMITTED';

  if (!admissionAdmitted) {
    const outcome = evaluateMissionOutcome({
      admission,
      missionRun: null,
      options: { acceptSafeBlock: !!opts.acceptSafeBlock, previousMissionKeys: opts.previousMissionKeys || [] },
    });
    outcome.safe_block_declared = !!opts.acceptSafeBlock;
    const evidence = buildRunnerEvidence({
      admission, intake, missionContext: null, rootIssue: null, missionRun: null,
      outcome, startedAt, endedAt: startedAt,
      observationBudget: null, observationPollingMs: null,
    });
    const exitCode = outcome.status === 'MISSION_BLOCKED_SAFE'
      ? EXIT_CODES.MISSION_BLOCKED_SAFE
      : EXIT_CODES.MISSION_BLOCKED_NO_RUN;
    return { exitCode, evidence, summary: { status: outcome.status, rootIssueId: null } };
  }

  // Admission admitted → validate intake + mission context before any mutation.
  if (!intake) {
    const err = new Error('intake payload required when admission is ADMITTED');
    err.code = RUNNER_BLOCKER_CODES.INTAKE_PAYLOAD_MISSING;
    throw err;
  }
  const intakeCheck = validateIntake(intake);
  if (!intakeCheck.ok) {
    const outcome = {
      status: 'MISSION_FAIL_CLOSED', gates: null, blockers: intakeCheck.blockers,
      safe_block_declared: !!opts.acceptSafeBlock, admission, redaction: {},
    };
    const evidence = buildRunnerEvidence({
      admission, intake, missionContext: null, rootIssue: null, missionRun: null,
      outcome, startedAt, endedAt: nowIso(),
      observationBudget: null, observationPollingMs: null,
    });
    return { exitCode: EXIT_CODES.MISSION_FAIL_CLOSED, evidence, summary: { status: outcome.status, blockers: intakeCheck.blockers } };
  }
  const missionContextCheck = deriveMissionContext(intake, { now: new Date() });
  if (!missionContextCheck.ok) {
    const outcome = {
      status: 'MISSION_FAIL_CLOSED', gates: null, blockers: missionContextCheck.blockers,
      safe_block_declared: !!opts.acceptSafeBlock, admission, redaction: {},
    };
    const evidence = buildRunnerEvidence({
      admission, intake, missionContext: null, rootIssue: null, missionRun: null,
      outcome, startedAt, endedAt: nowIso(),
      observationBudget: null, observationPollingMs: null,
    });
    return { exitCode: EXIT_CODES.MISSION_FAIL_CLOSED, evidence, summary: { status: outcome.status, blockers: missionContextCheck.blockers } };
  }
  const missionContext = {
    missionKey: missionContextCheck.missionKey,
    idempotencyKey: missionContextCheck.idempotencyKey,
    recoveryLock: missionContextCheck.recoveryLock,
    derivedAt: missionContextCheck.derivedAt,
  };

  // Issue the single bounded intake write.
  let intakeResult;
  try {
    intakeResult = await runIntake({ transport, intake, missionContext, harnessActor });
  } catch (error) {
    const blockerCode = (error && error.code) || RUNNER_BLOCKER_CODES.RUNNER_FAILURE;
    const outcome = {
      status: 'MISSION_RUNNER_FAILURE', gates: null,
      blockers: [{ code: blockerCode, severity: 'blocking', agent: null, reason: error && error.message ? error.message : String(error) }],
      safe_block_declared: !!opts.acceptSafeBlock, admission, redaction: {},
    };
    const evidence = buildRunnerEvidence({
      admission, intake, missionContext, rootIssue: null, missionRun: null,
      outcome, startedAt, endedAt: nowIso(),
      observationBudget: null, observationPollingMs: null,
    });
    const exitCode = error && error.code === RUNNER_BLOCKER_CODES.HARNESS_WROTE_MULTIPLE_ROOT
      ? EXIT_CODES.MISSION_HARNESS_WROTE_MULTIPLE_ROOT
      : EXIT_CODES.MISSION_RUNNER_FAILURE;
    return { exitCode, evidence, summary: { status: outcome.status, blockers: outcome.blockers } };
  }
  const rootIssue = intakeResult.rootIssue;

  // Run the bounded observer loop.
  let observedState;
  try {
    observedState = await runObserver({
      transport, rootIssue, observedState: null,
      options: { maxSeconds: opts.maxObserveSeconds, pollIntervalMs: opts.pollIntervalMs },
    });
  } catch (error) {
    const blockerCode = (error && error.code) || RUNNER_BLOCKER_CODES.RUNNER_FAILURE;
    const outcome = {
      status: 'MISSION_RUNNER_FAILURE', gates: null,
      blockers: [{ code: blockerCode, severity: 'blocking', agent: null, reason: error && error.message ? error.message : String(error) }],
      safe_block_declared: !!opts.acceptSafeBlock, admission, redaction: {},
    };
    const evidence = buildRunnerEvidence({
      admission, intake, missionContext, rootIssue, missionRun: null,
      outcome, startedAt, endedAt: nowIso(),
      observationBudget: null, observationPollingMs: null,
    });
    const exitCode = error && error.code === RUNNER_BLOCKER_CODES.HARNESS_POST_INTAKE_WRITE
      ? EXIT_CODES.MISSION_HARNESS_WROTE_OPERATING
      : EXIT_CODES.MISSION_RUNNER_FAILURE;
    return { exitCode, evidence, summary: { status: outcome.status, blockers: outcome.blockers } };
  }

  let missionRun = aggregateMissionRun({
    rootIssue, observedState, missionContext, startedAt, endedAt: observedState.ended_at,
  });
  if (missionContext.idempotencyKey && missionContext.idempotencyKey.includes('pending-root-issue-id')) {
    missionRun.idempotency_key = `${missionContext.missionKey}::${rootIssue.id}`;
  }

  let outcome = evaluateMissionOutcome({
    admission, missionRun,
    options: { acceptSafeBlock: !!opts.acceptSafeBlock, previousMissionKeys: opts.previousMissionKeys || [] },
  });
  outcome.safe_block_declared = !!opts.acceptSafeBlock;
  if (observedState.observer_budget_exhausted && outcome.status === 'MISSION_BLOCKED_SAFE') {
    outcome.status = 'MISSION_FAIL_CLOSED';
  }

  const evidence = buildRunnerEvidence({
    admission, intake, missionContext, rootIssue, missionRun,
    outcome, startedAt, endedAt: observedState.ended_at,
    observationBudget: { maxSeconds: opts.maxObserveSeconds || DEFAULTS.max_observe_seconds },
    observationPollingMs: opts.pollIntervalMs || DEFAULTS.poll_interval_ms,
  });

  let exitCode = EXIT_CODES.MISSION_FAIL_CLOSED;
  if (outcome.status === 'MISSION_PASS') exitCode = EXIT_CODES.MISSION_PASS;
  else if (outcome.status === 'MISSION_BLOCKED_SAFE') exitCode = EXIT_CODES.MISSION_BLOCKED_SAFE;
  else if (outcome.status === 'MISSION_BLOCKED_NO_RUN') exitCode = EXIT_CODES.MISSION_BLOCKED_NO_RUN;
  else if (outcome.status === 'MISSION_RUNNER_FAILURE') exitCode = EXIT_CODES.MISSION_RUNNER_FAILURE;
  return { exitCode, evidence, summary: { status: outcome.status, rootIssueId: rootIssue.id } };
}

// ---------------------------------------------------------------------------
// HttpTransport — minimal real HTTP transport. Refuses everything except
// the bounded intake write. The CLI uses this; tests pass a MockTransport.
// ---------------------------------------------------------------------------

class HttpTransport {
  constructor(options) {
    const opts = options || {};
    this.baseUrl = opts.baseUrl || process.env.PAPERCLIP_BASE_URL || 'http://127.0.0.1:43131';
    this.cookie = opts.cookie || process.env.PAPERCLIP_SESSION_COOKIE || null;
    this.companyId = opts.companyId || process.env.PAPERCLIP_COMPANY_ID || null;
    this.timeoutMs = opts.timeoutMs || 30000;
    this.fetchImpl = opts.fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!this.fetchImpl) {
      throw new Error('HttpTransport requires global fetch (Node 18+) or opts.fetchImpl');
    }
  }

  async _request(method, op, body) {
    if (!this.companyId && op !== 'discoverCompany') {
      throw new Error(`HttpTransport missing companyId (op=${op}); set PAPERCLIP_COMPANY_ID or pass opts.companyId`);
    }
    const url = this._urlFor(op);
    const init = { method, headers: { 'Content-Type': 'application/json' } };
    if (this.cookie) init.headers.Cookie = this.cookie;
    if (body !== undefined) init.body = JSON.stringify(body);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, { ...init, signal: controller.signal });
      const status = res && typeof res.status === 'number' ? res.status : 0;
      if (!res || status >= 400) {
        const err = new Error(`${method} ${url} failed: HTTP ${status}`);
        err.code = RUNNER_BLOCKER_CODES.ROOT_ISSUE_CREATE_HTTP_ERROR(status);
        err.status = status;
        throw err;
      }
      const text = await res.text();
      try { return JSON.parse(text); } catch (_) { return { raw: text }; }
    } finally {
      clearTimeout(timer);
    }
  }

  _urlFor(op) {
    const base = this.baseUrl.replace(/\/+$/, '');
    const cid = encodeURIComponent(this.companyId || '');
    switch (op) {
      case 'getCompany': return `${base}/api/companies/${cid}`;
      case 'createRootIssue': return `${base}/api/companies/${cid}/issues`;
      case 'listIssues': return `${base}/api/companies/${cid}/issues`;
      case 'listHeartbeatRuns': return `${base}/api/companies/${cid}/heartbeat-runs`;
      case 'getIssueComments': return `${base}/api/companies/${cid}/issues/comments`;
      case 'getIssueDocuments': return `${base}/api/companies/${cid}/issues/documents`;
      case 'getDispositions': return `${base}/api/companies/${cid}/issues/dispositions`;
      case 'getReviews': return `${base}/api/companies/${cid}/issues/reviews`;
      case 'getSideEffects': return `${base}/api/companies/${cid}/side-effects`;
      case 'getAgentByName': return `${base}/api/companies/${cid}/agents`;
      default: throw new Error(`HttpTransport unknown op: ${op}`);
    }
  }

  async getCompany() { return this._request('GET', 'getCompany'); }
  async getAgentByName(name) { return this._request('GET', 'getAgentByName', { name }); }
  async listIssues(query) { return this._request('GET', 'listIssues', query); }
  async listHeartbeatRuns(query) { return this._request('GET', 'listHeartbeatRuns', query); }
  async getIssueComments(issueId) { return this._request('GET', 'getIssueComments', { issue_id: issueId }); }
  async getIssueDocuments(issueId) { return this._request('GET', 'getIssueDocuments', { issue_id: issueId }); }
  async getDispositions(issueId) { return this._request('GET', 'getDispositions', { issue_id: issueId }); }
  async getReviews(issueId) { return this._request('GET', 'getReviews', { issue_id: issueId }); }
  async getSideEffects(query) { return this._request('GET', 'getSideEffects', query); }
  async createRootIssue(payload) { return this._request('POST', 'createRootIssue', payload); }
}

// ---------------------------------------------------------------------------
// parseArgs — minimal CLI parser.
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    admission: ADMISSION_PATH,
    intake: DEFAULT_INTAKE_PATH,
    output: OUTPUT_PATH,
    acceptSafeBlock: false,
    previousMissionKeys: [],
    maxObserveSeconds: DEFAULTS.max_observe_seconds,
    pollIntervalMs: DEFAULTS.poll_interval_ms,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--admission') { args.admission = path.resolve(argv[++i]); }
    else if (a === '--intake') { args.intake = path.resolve(argv[++i]); }
    else if (a === '--output') { args.output = path.resolve(argv[++i]); }
    else if (a === '--accept-safe-block') { args.acceptSafeBlock = true; }
    else if (a === '--previous-mission-keys') {
      args.previousMissionKeys = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    }
    else if (a === '--max-observe-seconds') {
      args.maxObserveSeconds = Number.parseInt(argv[++i], 10) || DEFAULTS.max_observe_seconds;
    }
    else if (a === '--poll-interval-ms') {
      args.pollIntervalMs = Number.parseInt(argv[++i], 10) || DEFAULTS.poll_interval_ms;
    }
    else if (a === '--help' || a === '-h') { args.help = true; }
    else { throw new Error(`unknown arg: ${a}`); }
  }
  args.output = args.output || OUTPUT_PATH;
  return args;
}

function printHelp() {
  process.stdout.write(
    'Usage: run_m015_s04_native_mission.js [options]\n' +
    '\n' +
    'Options:\n' +
    '  --admission <path>          S04 admission evidence JSON (T01 output).\n' +
    '  --intake <path>             PO intake payload JSON (title, description, confirmation).\n' +
    '  --output <path>             Where the runner writes its evidence JSON.\n' +
    '  --accept-safe-block         On admission BLOCKED + no run, emit MISSION_BLOCKED_SAFE.\n' +
    '  --previous-mission-keys a,b,c   Optional list for duplicate-detection.\n' +
    '  --max-observe-seconds <n>   Bounded observer budget (default 600, ceiling 3600).\n' +
    '  --poll-interval-ms <n>      Observer poll interval (default 5000, min 500).\n' +
    '\n' +
    'Defaults:\n' +
    `  --admission  ${path.relative(ROOT, ADMISSION_PATH)}\n` +
    `  --intake     ${path.relative(ROOT, DEFAULT_INTAKE_PATH)}\n` +
    `  --output     ${path.relative(ROOT, OUTPUT_PATH)}\n` +
    '\n' +
    'Exit codes:\n' +
    '  0 = MISSION_PASS\n' +
    '  1 = MISSION_FAIL_CLOSED\n' +
    '  2 = MISSION_BLOCKED_SAFE (--accept-safe-block + admission blocked)\n' +
    '  3 = MISSION_BLOCKED_NO_RUN (admission blocked, no --accept-safe-block)\n' +
    '  4 = MISSION_RUNNER_FAILURE (transport / parse / unknown)\n' +
    '  5 = MISSION_HARNESS_WROTE_MULTIPLE_ROOT (defensive)\n' +
    '  6 = MISSION_HARNESS_WROTE_OPERATING (defensive)\n',
  );
}

// ---------------------------------------------------------------------------
// runCli — main entry point.
// ---------------------------------------------------------------------------

async function runCli(argv) {
  const args = parseArgs(argv);
  if (args.help) { printHelp(); return 0; }
  const { admission, intake } = loadRunnerInput({ admissionPath: args.admission, intakePath: args.intake });
  const transport = new BoundedTransport(new HttpTransport());
  let result;
  try {
    result = await runOnce({
      admission, intake, transport,
      options: {
        acceptSafeBlock: args.acceptSafeBlock,
        previousMissionKeys: args.previousMissionKeys,
        maxObserveSeconds: args.maxObserveSeconds,
        pollIntervalMs: args.pollIntervalMs,
      },
    });
  } catch (error) {
    try {
      const failure = {
        $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s04-native-mission-run.v1.json',
        milestone: 'M015-4o8lfw',
        slice: 'S04',
        task: 'T03',
        generated: nowIso(),
        status: 'MISSION_RUNNER_FAILURE',
        reason: error && error.message ? error.message : String(error),
        blockers: [{
          code: (error && error.code) || RUNNER_BLOCKER_CODES.RUNNER_FAILURE,
          severity: 'blocking', agent: null,
          reason: error && error.message ? error.message : String(error),
        }],
        redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: true, provider_secret_names: true, synthetic_bos: true },
      };
      fs.mkdirSync(path.dirname(args.output), { recursive: true });
      fs.writeFileSync(args.output, JSON.stringify(failure, null, 2) + '\n');
    } catch (_) { /* best effort */ }
    process.stderr.write(`M015_S04_NATIVE_RUN_ERROR=${error && error.message ? error.message : error}\n`);
    return EXIT_CODES.MISSION_RUNNER_FAILURE;
  }
  try {
    writeRunnerEvidence(result.evidence, args.output);
  } catch (writeError) {
    process.stderr.write(`M015_S04_NATIVE_RUN_WRITE_ERROR=${writeError && writeError.message ? writeError.message : writeError}\n`);
    return EXIT_CODES.MISSION_RUNNER_FAILURE;
  }
  process.stdout.write(
    `M015_S04_NATIVE_RUN=${result.summary && result.summary.status} ` +
    `harness_root_issue_create=${result.evidence.harness_writes ? result.evidence.harness_writes.root_issue_create : 0} ` +
    `blockers=${(result.evidence.blockers || []).length} ` +
    `admission=${result.evidence.admission_summary ? result.evidence.admission_summary.status : 'missing'}\n`,
  );
  return result.exitCode;
}

if (require.main === module) {
  runCli(process.argv).then((exitCode) => {
    process.exit(typeof exitCode === 'number' ? exitCode : EXIT_CODES.MISSION_RUNNER_FAILURE);
  }, (error) => {
    process.stderr.write(`M015_S04_NATIVE_RUN_FATAL=${error && error.message ? error.message : error}\n`);
    process.exit(EXIT_CODES.MISSION_RUNNER_FAILURE);
  });
}

module.exports = {
  ROOT,
  ADMISSION_PATH,
  DEFAULT_INTAKE_PATH,
  OUTPUT_PATH,
  BLOCKER_CODES: RUNNER_BLOCKER_CODES,
  EXIT_CODES,
  PROTOCOL_BLOCKER_CODES,
  BoundedTransport,
  HttpTransport,
  MultipleIntakeError,
  runIntake,
  runObserver,
  runOnce,
  parseArgs,
  printHelp,
  // Pure helpers re-exported from the contract lib so a single import
  // surface still works for tests / downstream callers.
  loadRunnerInput,
  validateIntake,
  deriveMissionContext,
  aggregateMissionRun,
  evaluateMissionOutcome,
  buildRunnerEvidence,
  writeRunnerEvidence,
};
