#!/usr/bin/env node
'use strict';

/**
 * scripts/lib/m015-s04-native-runner-fixtures.js
 *
 * M015-4o8lfw / S04 / T03 — Shared hermetic fixtures for the bounded-intake
 * + read-only observer harness tests.
 *
 * Provides:
 *   - buildAdmittedAdmissionEvidence()
 *   - buildBlockedAdmissionEvidence()
 *   - buildValidIntake(overrides)
 *   - buildMockTransport(overrides) → { inner, calls }
 *   - buildDiv1Child(divisionName, parentId)
 *   - buildHeartbeatRun(division, options)
 *   - clone(value)
 *
 * Lives in lib/ (not scripts/) so production runner does not pull test
 * fixtures into its import graph. Test parts pull this directly.
 */

const probe = require('../probe_m015_seven_agent_environment');
const { CANONICAL_DIVISION_NAMES } = probe;

function buildAdmittedAdmissionEvidence() {
  return {
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s04-admission.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S04',
    task: 'T01',
    generated: '2026-07-14T16:00:00.000Z',
    status: 'ADMITTED',
    admission_model: '4 admission gates (all-pass)',
    upstream_artifacts: {
      s03_t01_test_environment: 'runtime-evidence/M015-S03-seven-agent-test-environment.json',
      s03_t02_diagnostic_runs: 'runtime-evidence/M015-S03-seven-agent-diagnostic-runs.json',
      s03_t03_independent_gate: 'runtime-evidence/M015-S03-seven-agent-independent-gate.json',
      s03_t19_admission_blockers: 'runtime-evidence/M015-S03-t19-diagnostic-admission-blockers.json',
    },
    gates: {
      fresh_s03_7of7_invokability_pass: true,
      no_do_not_promote_s04_pass: true,
      no_drift_pass: true,
      no_leaks_pass: true,
      diagnostics: {},
    },
    business_mutations_recorded: 0,
    blockers: [],
    redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: true },
  };
}

function buildBlockedAdmissionEvidence() {
  return {
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s04-admission.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S04',
    task: 'T01',
    generated: '2026-07-14T16:00:00.000Z',
    status: 'BLOCKED_ON_S03_FAIL_CLOSED',
    admission_model: '4 admission gates (AG1/AG2 fail-closed under S03)',
    gates: {
      fresh_s03_7of7_invokability_pass: false,
      no_do_not_promote_s04_pass: false,
      no_drift_pass: true,
      no_leaks_pass: true,
      diagnostics: {},
    },
    business_mutations_recorded: 0,
    blockers: [
      { code: 'M15-S04-ADMISSION-GATE-FRESH-S03-7OF7', severity: 'blocking', agent: null, reason: 'T03.status !== PASS' },
      { code: 'M15-S04-ADMISSION-GATE-DO-NOT-PROMOTE-S04', severity: 'blocking', agent: null, reason: 'T19.do_not_promote_s04=true' },
    ],
    redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: true },
  };
}

function buildValidIntake(overrides) {
  return Object.assign({
    title: 'PO intake: bounded one-shot business mission for S04',
    description: 'A controlled bounded one-shot business mission routed through the native Paperclip Div7→Div1→Div2..Div6 hierarchy; harness performs ONE intake only and observes from there.',
    assignee: 'Div7.MissionControl',
    parent_issue_id: null,
    priority: 'normal',
    desired_outcome: 'Prove end-to-end native mission flow with proof-gated validation across all 10 MG gates.',
    confirmation: {
      explicit: true,
      reason: 'bounded intake — single root PO mission assigned to Div7.MissionControl',
      timestamp_iso: '2026-07-14T16:00:00.000Z',
    },
    mission_key: 's04-mission-fixture-2026-07-14T16-00-00Z',
    idempotency_key: 's04-mission-fixture-2026-07-14T16-00-00Z::root-001',
    recovery_lock: 'replay-blocked-on:s04-mission-fixture-2026-07-14T16-00-00Z',
  }, overrides || {});
}

function buildMockTransport(overrides) {
  const obs = Object.assign({
    rootIssueResponse: null,
    issueChildren: [],
    heartbeatRunData: [],
    commentData: [],
    documentData: [],
    dispositionData: [],
    reviewData: [],
    sideEffectData: [],
    transportErrors: {},
    observeIterations: 1,
    exhaustedBudget: false,
    terminalAfter: 1,
    injectSideEffectsViaRead: false,
  }, overrides || {});

  const calls = [];
  const inner = {
    async createRootIssue(payload) {
      calls.push({ op: 'createRootIssue', method: 'POST', payload });
      if (obs.transportErrors.createRootIssue) throw new Error('mock transport failure on createRootIssue');
      return obs.rootIssueResponse || {
        id: 'root-issue-mock-001',
        assignee: payload.assignee,
        title: payload.title,
        created_at: new Date().toISOString(),
      };
    },
    async listIssues(query) {
      calls.push({ op: 'listIssues', method: 'GET', query });
      if (obs.transportErrors.listIssues) throw new Error('mock listIssues error');
      return obs.issueChildren;
    },
    async listHeartbeatRuns(query) {
      calls.push({ op: 'listHeartbeatRuns', method: 'GET', query });
      if (obs.transportErrors.listHeartbeatRuns) throw new Error('mock listHeartbeatRuns error');
      return obs.heartbeatRunData;
    },
    async getIssueComments(issueId) {
      calls.push({ op: 'getIssueComments', method: 'GET', issueId });
      if (obs.transportErrors.getIssueComments) throw new Error('mock getIssueComments error');
      return obs.commentData;
    },
    async getIssueDocuments(issueId) {
      calls.push({ op: 'getIssueDocuments', method: 'GET', issueId });
      if (obs.transportErrors.getIssueDocuments) throw new Error('mock getIssueDocuments error');
      return obs.documentData;
    },
    async getDispositions(issueId) {
      calls.push({ op: 'getDispositions', method: 'GET', issueId });
      if (obs.transportErrors.getDispositions) throw new Error('mock getDispositions error');
      return obs.dispositionData;
    },
    async getReviews(issueId) {
      calls.push({ op: 'getReviews', method: 'GET', issueId });
      if (obs.transportErrors.getReviews) throw new Error('mock getReviews error');
      return obs.reviewData;
    },
    async getSideEffects(query) {
      calls.push({ op: 'getSideEffects', method: 'GET', query });
      if (obs.transportErrors.getSideEffects) throw new Error('mock getSideEffects error');
      return obs.sideEffectData;
    },
    async getCompany() {
      calls.push({ op: 'getCompany', method: 'GET' });
      if (obs.transportErrors.getCompany) throw new Error('mock getCompany error');
      return { id: 'company-mock', name: 'Mock Paperclip Co.' };
    },
    async getAgentByName(name) {
      calls.push({ op: 'getAgentByName', method: 'GET', name });
      if (obs.transportErrors.getAgentByName) throw new Error('mock getAgentByName error');
      return { id: `agent-${name}`, name, role: 'division' };
    },
  };
  return { inner, calls };
}

function buildDiv1Child(divisionName, parentId) {
  return {
    id: `${divisionName.replace(/\W+/g, '-').toLowerCase()}-child-001`,
    assignee: divisionName,
    parent_issue_id: parentId,
    title: `${divisionName} child issue`,
    role: 'OPERATING_CHILD',
    created_by: 'Div1.HCO',
    created_at: '2026-07-14T16:00:10.000Z',
  };
}

function buildHeartbeatRun(division, options) {
  const opts = options || {};
  return {
    id: `run-${division.replace(/\W+/g, '-').toLowerCase()}-001`,
    division,
    agent_id: `agent-${division.replace(/\W+/g, '-').toLowerCase()}`,
    terminal_status: opts.terminal || 'succeeded',
    started_at: opts.started_at || '2026-07-14T16:00:20.000Z',
    ended_at: opts.ended_at || '2026-07-14T16:01:00.000Z',
    duration_sec: opts.duration || 40,
    model: 'MiniMax-M3',
    adapter: 'hermes_local',
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  CANONICAL_DIVISION_NAMES,
  buildAdmittedAdmissionEvidence,
  buildBlockedAdmissionEvidence,
  buildValidIntake,
  buildMockTransport,
  buildDiv1Child,
  buildHeartbeatRun,
  clone,
};
