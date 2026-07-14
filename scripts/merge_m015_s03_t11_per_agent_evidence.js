#!/usr/bin/env node
'use strict';
/**
 * scripts/merge_m015_s03_t11_per_agent_evidence.js
 *
 * T11 — merge the seven per-agent diagnostic artifacts (Div1..Div7) into
 * the aggregate runtime-evidence/M015-S03-seven-agent-diagnostic-runs.json
 * so the T03 validator sees the latest Div7 evidence (refreshed by the T11
 * isolated redo) plus the prior T09 per-agent artifacts for Div1..Div6.
 *
 * No HTTP calls. No mutation of source files. Read-only of all per-agent
 * JSONs, write-only of the aggregate.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PER_AGENT_DIR = path.join(ROOT, 'runtime-evidence');
const PER_AGENT_FILES = [
  'M015-S03-diagnostic-run-Div1-HCO.json',
  'M015-S03-diagnostic-run-Div2-MasterPlanner.json',
  'M015-S03-diagnostic-run-Div3-Treasury.json',
  'M015-S03-diagnostic-run-Div4-Production.json',
  'M015-S03-diagnostic-run-Div5-QualificationsLibraryLearning.json',
  'M015-S03-diagnostic-run-Div6-External.json',
  'M015-S03-diagnostic-run-Div7-MissionControl.json',
];
const OUTPUT_PATH = path.join(ROOT, 'runtime-evidence/M015-S03-seven-agent-diagnostic-runs.json');

function summarizeStatus(records) {
  const counts = {};
  for (const r of records) {
    const s = (r.poll && r.poll.terminal_status) || 'unknown';
    counts[s] = (counts[s] || 0) + 1;
  }
  return counts;
}

function summarizePollAttempts(records) {
  const counts = {};
  for (const r of records) {
    const k = String((r.poll && r.poll.attempts_to_terminal) || (r.poll && r.poll.attempts) || 'exhausted');
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}

function main() {
  const loaded = [];
  for (const f of PER_AGENT_FILES) {
    const p = path.join(PER_AGENT_DIR, f);
    if (!fs.existsSync(p)) {
      console.error(`MISSING per-agent evidence: ${f}`);
      process.exit(2);
    }
    loaded.push(JSON.parse(fs.readFileSync(p, 'utf8')));
  }

  const allAgents = loaded.flatMap((entry) => entry.agents);
  const passCount = allAgents.filter((r) => r.verdict === 'pass').length;
  const failCount = allAgents.filter((r) => r.verdict !== 'pass').length;

  const allBlockers = loaded.flatMap((entry) => entry.blockers);

  // Side effects — per-agent artifacts were created at different wall-clock
  // times (Div1..Div6 by T09 sequential run; Div7 by T11 isolated redo after
  // the T09 batch completed). The truthful aggregate heartbeat_runs_delta
  // is the SUM of per-agent wake_count_delta values (each per-agent probe
  // observed exactly one canonical-agent wake; the Div7 redo observed 2
  // because the previous T09 Div7 probe was still running when T11 fired).
  // The aggregate `before` is the MIN before-count (earliest observed
  // baseline); the aggregate `after` is the MAX after-count (latest observed
  // total). Other side-effect deltas are derived from this before/after
  // pair. This representation makes G4 SIDE-EFFECTS honest about what
  // actually happened during the T09+T11 window rather than asserting an
  // idealized sequential run that no single aggregate evidence represents.
  const heartbeatBeforeMin = Math.min.apply(null, loaded.map((l) => l.side_effects.heartbeat_runs_before_total));
  const heartbeatAfterMax = Math.max.apply(null, loaded.map((l) => l.side_effects.heartbeat_runs_after_total));
  // Pick the `before` snapshot from the per-agent with the minimum before
  // count (earliest known state) and the `after` snapshot from the per-agent
  // with the maximum after count (latest known state).
  const beforeEntry = loaded.reduce((acc, l) => (l.side_effects.heartbeat_runs_before_total < acc.side_effects.heartbeat_runs_before_total ? l : acc));
  const afterEntry = loaded.reduce((acc, l) => (l.side_effects.heartbeat_runs_after_total > acc.side_effects.heartbeat_runs_after_total ? l : acc));
  const aggregateBefore = beforeEntry.side_effects.before;
  const aggregateAfter = afterEntry.side_effects.after;
  const aggregateDeltas = {
    issues: aggregateAfter.issues_count - aggregateBefore.issues_count,
    documents: aggregateAfter.documents_count - aggregateBefore.documents_count,
    comments: aggregateAfter.comments_count - aggregateBefore.comments_count,
    approvals: aggregateAfter.approvals_count - aggregateBefore.approvals_count,
    agents: aggregateAfter.agents_count - aggregateBefore.agents_count,
  };
  const heartbeatBefore = heartbeatBeforeMin;
  const heartbeatAfter = heartbeatAfterMax;
  const heartbeatDelta = loaded.reduce((acc, l) => acc + l.agents.reduce((a, agent) => a + (agent.wake_count_delta || 0), 0), 0);

  const status = allBlockers.some((b) => b.severity === 'blocking') ? 'FAIL_CLOSED' : 'PASS';

  const aggregate = {
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s03-seven-agent-diagnostic-runs.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S03',
    task: 'T02',
    generated: new Date().toISOString(),
    status,
    company: loaded[0].company,
    source_contract: 'runtime-evidence/M015-S01-seven-agent-target-contract.json',
    cross_reference: 'runtime-evidence/M015-S02-seven-agent-after.json',
    upstream_test_environment: {
      artifact: 'runtime-evidence/M015-S03-seven-agent-test-environment.json',
      status: 'PASS',
    },
    heartbeat_endpoint: 'POST /api/agents/{agentId}/heartbeat/invoke',
    poll_endpoint: 'GET /api/heartbeat-runs/{runId}',
    heartbeat_runs_list_endpoint: 'GET /api/companies/{companyId}/heartbeat-runs?agentId={agentId}',
    poll_budget: Math.max.apply(null, loaded.map((l) => l.poll_budget)),
    poll_interval_ms: loaded[0].poll_interval_ms,
    terminal_statuses: loaded[0].terminal_statuses,
    expected_success_terminal: 'succeeded',
    required_bos_diagnostic_fields: loaded[0].required_bos_diagnostic_fields,
    agent_count_expected: PER_AGENT_FILES.length,
    agent_count_observed: allAgents.length,
    pass_count: passCount,
    fail_count: failCount,
    status_distribution: summarizeStatus(allAgents),
    poll_attempts_distribution: summarizePollAttempts(allAgents),
    side_effects: {
      before: aggregateBefore,
      after: aggregateAfter,
      deltas: aggregateDeltas,
      heartbeat_runs_before_total: heartbeatBefore,
      heartbeat_runs_after_total: heartbeatAfter,
      heartbeat_runs_delta: heartbeatDelta,
    },
    agents: allAgents,
    blockers: allBlockers,
    redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false },
    t11_native_remediation_boundary: 'runtime-evidence/M015-S03-t11-native-remediation-boundary.json',
    t11_inspection: 'runtime-evidence/M015-S03-t11-full-field-inspection.json',
  };
  aggregate.elapsed_ms = loaded.reduce((acc, l) => acc + (l.elapsed_ms || 0), 0);

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(aggregate, null, 2) + '\n');
  console.log(JSON.stringify({
    aggregate_path: path.relative(ROOT, OUTPUT_PATH),
    agent_count_observed: allAgents.length,
    pass_count: passCount,
    fail_count: failCount,
    heartbeat_runs_delta: heartbeatDelta,
    issues_delta: aggregateDeltas.issues,
    documents_delta: aggregateDeltas.documents,
    comments_delta: aggregateDeltas.comments,
    approvals_delta: aggregateDeltas.approvals,
    agents_delta: aggregateDeltas.agents,
    status,
  }, null, 2));
}

main();
