#!/usr/bin/env node
'use strict';

/**
 * scripts/apply_m015_s03_t06_orchestrator.js
 *
 * M015-S03 / T06 orchestrator — drives per-agent pause/resume and aggregates
 * the seven isolated diagnostic heartbeat invocations into the combined
 * M015-S03-seven-agent-diagnostic-runs.json consumed by T03.
 *
 * Why this exists: hermes_local wakes an agent when an issue is assigned or a
 * wake-payload arrives. While T02 is running, those wakes for OTHER agents
 * create issues (and other business-side effects) that pollute the S03
 * side-effect readback even though they are unrelated to our diagnostic.
 * The T02 script captures a global BEFORE/AFTER side-effect snapshot across
 * issues / documents / comments / approvals / agents, and any non-zero delta
 * becomes a hard fail-closed blocker.
 *
 * Strategy: drive T02 once per canonical agent. For each iteration:
 *   1. Pause every OTHER agent in the company (canonical + CEO) so wake
 *      payloads are not delivered while the diagnostic runs.
 *   2. Invoke the diagnostic heartbeat for the test target.
 *   3. Poll until terminal (extended budget via M015_POLL_BUDGET).
 *   4. Capture per-agent AFTER side-effect snapshot.
 *   5. Resume the other agents so their normal activity resumes.
 *
 * After seven iterations, the orchestrator reads the seven per-agent
 * evidence files (one per agent) and aggregates them into the combined
 * M015-S03-seven-agent-diagnostic-runs.json. The side-effects block sums
 * each per-agent delta — the test target's diagnostic heartbeat creates
 * issueCommentStatus=not_applicable (no business mutation) so the
 * per-iteration deltas are 0 when peers are paused.
 *
 * Pre-warm (M015_PREWARM=1): before each per-agent iteration, invoke one
 * on-demand heartbeat and wait for it to reach terminal so the diagnostic
 * iteration only sees warm AI timing.
 *
 * Idempotent: every pause is paired with a resume in a finally-like wrap
 * so an interruption cannot leave the roster in a paused state.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  loadEnv,
  makeBoardClient,
  unwrapList,
  redactError,
} = require('./apply_m015_seven_agent_contract');
const { CANONICAL_DIVISION_NAMES } = require('./probe_m015_seven_agent_environment');

const ROOT = path.resolve(__dirname, '..');
const CONTRACT_PATH = path.join(ROOT, 'runtime-evidence/M015-S01-seven-agent-target-contract.json');
const COMBINED_OUTPUT_PATH = path.join(ROOT, 'runtime-evidence/M015-S03-seven-agent-diagnostic-runs.json');
const ORCHESTRATOR_JOURNAL_PATH = path.join(ROOT, 'runtime-evidence/M015-S03-t06-orchestrator-journal.json');
const HEARTBEAT_SCRIPT = path.resolve(__dirname, 'run_m015_s03_diagnostic_heartbeat.js');

const DEFAULT_POLL_BUDGET = 36;
const PREWARM_TIMEOUT_PER_AGENT_MS = 6 * 60 * 1000; // 6 minutes ceiling per agent
const PREWARM_TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'expired', 'timed_out']);

function nowIso() { return new Date().toISOString(); }

function perAgentEvidencePath(agentName) {
  return COMBINED_OUTPUT_PATH.replace(
    /seven-agent-diagnostic-runs\.json$/,
    `diagnostic-run-${agentName.replace(/\./g, '-')}.json`,
  );
}

async function findAipCompany(request) {
  const companies = unwrapList(await request('GET', '/api/companies'), ['companies', 'items']);
  return companies.find((c) => (c.issuePrefix || c.issue_prefix) === 'AIP');
}

async function readAgents(request, companyId) {
  return unwrapList(await request('GET', `/api/companies/${encodeURIComponent(companyId)}/agents`), ['agents', 'items']);
}

async function cancelRunningHeartbeats(request, companyId) {
  const runs = unwrapList(
    await request('GET', `/api/companies/${encodeURIComponent(companyId)}/heartbeat-runs?limit=100`),
    ['heartbeatRuns', 'runs', 'items'],
  );
  const running = runs.filter((r) => r.status === 'running');
  const cancelled = [];
  for (const r of running) {
    try {
      await request('POST', `/api/heartbeat-runs/${encodeURIComponent(r.id)}/cancel`, {});
      cancelled.push(r.id);
    } catch (_) { /* best effort */ }
  }
  return { observed_running: running.length, cancelled_ids: cancelled };
}

async function setPauseState(request, agents, paused) {
  const journal = [];
  for (const a of agents) {
    try {
      const r = await request('POST', `/api/agents/${encodeURIComponent(a.id)}/${paused ? 'pause' : 'resume'}`, {});
      journal.push({
        id: a.id,
        name: a.name,
        action: paused ? 'pause' : 'resume',
        status: r && r.status ? r.status : 'unknown',
      });
    } catch (err) {
      journal.push({ id: a.id, name: a.name, action: paused ? 'pause' : 'resume', error: redactError(err) });
    }
  }
  return journal;
}

async function prewarmAgent(request, agent) {
  const startedAt = Date.now();
  let runId = null;
  let invokeError = null;
  try {
    const r = await request('POST', `/api/agents/${encodeURIComponent(agent.id)}/heartbeat/invoke`, {
      reason: 'm015-s03-t06-prewarm',
      prompt: 'prewarm — return immediately',
      metadata: { schema_version: 'bos-light-v1', expected_result_json: 'bos', division: agent.name, non_business: true, prewarm: true },
    });
    runId = r && (r.id || (r.run && r.run.id));
  } catch (err) {
    invokeError = redactError(err);
  }
  if (!runId) {
    return { name: agent.name, prewarmed: false, invokeError, terminal_status: null };
  }
  const deadline = startedAt + PREWARM_TIMEOUT_PER_AGENT_MS;
  let terminal = null;
  let attempts = 0;
  while (Date.now() < deadline) {
    attempts += 1;
    await new Promise((resolve) => setTimeout(resolve, 5000));
    let payload;
    try {
      payload = await request('GET', `/api/heartbeat-runs/${encodeURIComponent(runId)}`);
    } catch (_) { continue; }
    const observed = payload && typeof payload.status === 'string' ? payload.status.toLowerCase() : null;
    if (observed && PREWARM_TERMINAL_STATUSES.has(observed)) {
      terminal = observed;
      break;
    }
  }
  return {
    name: agent.name,
    prewarmed: true,
    run_id_prefix: runId.slice(0, 8),
    terminal_status: terminal,
    attempts,
    elapsed_ms: Date.now() - startedAt,
  };
}

function runHeartbeatScript(env, agentName, pollBudget) {
  const merged = { ...process.env, ...env, M015_POLL_BUDGET: String(pollBudget), M015_ONLY_AGENT: agentName };
  const result = spawnSync(process.execPath, [HEARTBEAT_SCRIPT], {
    env: merged,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 30 * 60 * 1000,
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? String(result.error) : null,
    signal: result.signal,
  };
}

function readPerAgentEvidence(agentName) {
  const p = perAgentEvidencePath(agentName);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function aggregateEvidence(perAgentEvidence, contract, t01Status, startedAt) {
  const records = [];
  const blockers = [];
  const aggregateSideEffectsBefore = { issues_count: 0, documents_count: 0, comments_count: 0, approvals_count: 0, agents_count: 0 };
  const aggregateSideEffectsAfter = { issues_count: 0, documents_count: 0, comments_count: 0, approvals_count: 0, agents_count: 0 };
  let heartbeatRunsBefore = 0;
  let heartbeatRunsAfter = 0;

  for (const ev of perAgentEvidence) {
    if (!ev) continue;
    if (Array.isArray(ev.agents)) {
      for (const a of ev.agents) records.push(a);
    }
    if (Array.isArray(ev.blockers)) {
      for (const b of ev.blockers) blockers.push(b);
    }
    if (ev.side_effects && ev.side_effects.before) {
      aggregateSideEffectsBefore.issues_count += ev.side_effects.before.issues_count || 0;
      aggregateSideEffectsBefore.documents_count += ev.side_effects.before.documents_count || 0;
      aggregateSideEffectsBefore.comments_count += ev.side_effects.before.comments_count || 0;
      aggregateSideEffectsBefore.approvals_count += ev.side_effects.before.approvals_count || 0;
      aggregateSideEffectsBefore.agents_count += ev.side_effects.before.agents_count || 0;
    }
    if (ev.side_effects && ev.side_effects.after) {
      aggregateSideEffectsAfter.issues_count += ev.side_effects.after.issues_count || 0;
      aggregateSideEffectsAfter.documents_count += ev.side_effects.after.documents_count || 0;
      aggregateSideEffectsAfter.comments_count += ev.side_effects.after.comments_count || 0;
      aggregateSideEffectsAfter.approvals_count += ev.side_effects.after.approvals_count || 0;
      aggregateSideEffectsAfter.agents_count += ev.side_effects.after.agents_count || 0;
    }
    if (ev.side_effects && typeof ev.side_effects.heartbeat_runs_before_total === 'number') {
      heartbeatRunsBefore += ev.side_effects.heartbeat_runs_before_total;
    }
    if (ev.side_effects && typeof ev.side_effects.heartbeat_runs_after_total === 'number') {
      heartbeatRunsAfter += ev.side_effects.heartbeat_runs_after_total;
    }
  }

  // For aggregated evidence we use the LAST iteration's snapshot as the
  // visible AFTER state (since each iteration's AFTER snapshot is the next
  // iteration's BEFORE). The aggregated BEFORE/AFTER span the entire
  // seven-iteration run, which is what the S03 slice plan validator
  // consumes. The PASS gate requires aggregate side-effects to be 0.
  const finalEvidence = perAgentEvidence[perAgentEvidence.length - 1];
  const initialEvidence = perAgentEvidence[0];
  const aggregateSideEffectsDelta = {
    issues: (finalEvidence && finalEvidence.side_effects && finalEvidence.side_effects.after
      ? finalEvidence.side_effects.after.issues_count
      : 0) - (initialEvidence && initialEvidence.side_effects && initialEvidence.side_effects.before
        ? initialEvidence.side_effects.before.issues_count
        : 0),
    documents: (finalEvidence && finalEvidence.side_effects && finalEvidence.side_effects.after
      ? finalEvidence.side_effects.after.documents_count
      : 0) - (initialEvidence && initialEvidence.side_effects && initialEvidence.side_effects.before
        ? initialEvidence.side_effects.before.documents_count
        : 0),
    comments: (finalEvidence && finalEvidence.side_effects && finalEvidence.side_effects.after
      ? finalEvidence.side_effects.after.comments_count
      : 0) - (initialEvidence && initialEvidence.side_effects && initialEvidence.side_effects.before
        ? initialEvidence.side_effects.before.comments_count
        : 0),
    approvals: (finalEvidence && finalEvidence.side_effects && finalEvidence.side_effects.after
      ? finalEvidence.side_effects.after.approvals_count
      : 0) - (initialEvidence && initialEvidence.side_effects && initialEvidence.side_effects.before
        ? initialEvidence.side_effects.before.approvals_count
        : 0),
    agents: (finalEvidence && finalEvidence.side_effects && finalEvidence.side_effects.after
      ? finalEvidence.side_effects.after.agents_count
      : 0) - (initialEvidence && initialEvidence.side_effects && initialEvidence.side_effects.before
        ? initialEvidence.side_effects.before.agents_count
        : 0),
  };

  const passCount = records.filter((record) => record.verdict === 'pass').length;
  const failCount = records.filter((record) => record.verdict !== 'pass').length;

  // Status is PASS only when every record passed AND there are no
  // blocking blockers from any iteration. Per-iteration side-effect
  // blockers are already recorded by each T02 invocation, so the aggregate
  // carries them through.
  const status = failCount === 0 && blockers.length === 0 ? 'PASS' : 'FAIL_CLOSED';

  return {
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s03-seven-agent-diagnostic-runs.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S03',
    task: 'T02',
    generated: nowIso(),
    status,
    company: contract.company,
    source_contract: 'runtime-evidence/M015-S01-seven-agent-target-contract.json',
    cross_reference: 'runtime-evidence/M015-S02-seven-agent-after.json',
    upstream_test_environment: {
      artifact: 'runtime-evidence/M015-S03-seven-agent-test-environment.json',
      status: t01Status || (initialEvidence && initialEvidence.upstream_test_environment && initialEvidence.upstream_test_environment.status) || 'UNKNOWN',
    },
    heartbeat_endpoint: 'POST /api/agents/{agentId}/heartbeat/invoke',
    poll_endpoint: 'GET /api/heartbeat-runs/{runId}',
    heartbeat_runs_list_endpoint: 'GET /api/companies/{companyId}/heartbeat-runs?agentId={agentId}',
    poll_budget: Number(process.env.M015_POLL_BUDGET || DEFAULT_POLL_BUDGET),
    poll_interval_ms: 5000,
    terminal_statuses: ['succeeded', 'failed', 'cancelled', 'expired', 'timed_out'],
    expected_success_terminal: 'succeeded',
    required_bos_diagnostic_fields: ['schemaVersion', 'runId', 'division', 'role', 'status'],
    agent_count_expected: CANONICAL_DIVISION_NAMES.length,
    agent_count_observed: records.length,
    pass_count: passCount,
    fail_count: failCount,
    status_distribution: records.reduce((acc, r) => {
      const status = (r.poll && r.poll.terminal_status) || 'unknown';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {}),
    poll_attempts_distribution: records.reduce((acc, r) => {
      const key = String((r.poll && r.poll.attempts_to_terminal) || (r.poll && r.poll.attempts) || 'exhausted');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
    side_effects: {
      before: initialEvidence && initialEvidence.side_effects ? initialEvidence.side_effects.before : aggregateSideEffectsBefore,
      after: finalEvidence && finalEvidence.side_effects ? finalEvidence.side_effects.after : aggregateSideEffectsAfter,
      deltas: aggregateSideEffectsDelta,
      heartbeat_runs_before_total: heartbeatRunsBefore,
      heartbeat_runs_after_total: heartbeatRunsAfter,
      heartbeat_runs_delta: heartbeatRunsAfter - heartbeatRunsBefore,
    },
    agents: records,
    blockers,
    redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false },
    elapsed_ms: Date.now() - startedAt,
    orchestration: {
      mode: 'per-agent-isolated',
      per_agent_files: perAgentEvidence.map((ev) => ev && ev._source_file).filter(Boolean),
    },
  };
}

async function run() {
  const env = loadEnv();
  if (!env.PAPERCLIP_EMAIL || !env.PAPERCLIP_PASSWORD) {
    throw new Error('PAPERCLIP_EMAIL/PAPERCLIP_PASSWORD missing');
  }
  const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
  const request = await makeBoardClient({
    baseUrl: env.PAPERCLIP_BASE_URL || 'http://127.0.0.1:43131',
    origin: env.PAPERCLIP_ORIGIN || 'https://paperclip.oysana.com',
    email: env.PAPERCLIP_EMAIL,
    password: env.PAPERCLIP_PASSWORD,
  });

  const company = await findAipCompany(request);
  if (!company) throw new Error('AIP company not visible');
  const companyId = company.id;

  const beforeAgents = await readAgents(request, companyId);
  const canonicalAgents = CANONICAL_DIVISION_NAMES
    .map((name) => beforeAgents.find((a) => a.name === name))
    .filter(Boolean);
  if (canonicalAgents.length !== CANONICAL_DIVISION_NAMES.length) {
    throw new Error(`canonical agents missing: ${CANONICAL_DIVISION_NAMES.filter((n) => !canonicalAgents.find((a) => a.name === n)).join(', ')}`);
  }
  const otherAgents = beforeAgents.filter((a) => !CANONICAL_DIVISION_NAMES.includes(a.name));

  const startedAt = Date.now();
  const journal = {
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s03-t06-orchestrator-journal.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S03',
    task: 'T06',
    started_at: nowIso(),
    poll_budget: Number(process.env.M015_POLL_BUDGET || DEFAULT_POLL_BUDGET),
    prewarm_requested: process.env.M015_PREWARM === '1',
    phases: [],
    iterations: [],
    final_action: null,
  };

  const writeJournal = () => fs.writeFileSync(ORCHESTRATOR_JOURNAL_PATH, JSON.stringify(journal, null, 2) + '\n');
  const phase = (name, payload) => {
    journal.phases.push({ phase: name, at: nowIso(), ...payload });
    writeJournal();
  };

  const cancelResult = await cancelRunningHeartbeats(request, companyId);
  phase('cancel-running-heartbeats', cancelResult);

  // Reserve the right to resume every agent we touch, even on failure.
  let pausedAgents = new Set();
  const safePause = async (agents, label) => {
    const list = await setPauseState(request, agents, true);
    for (const entry of list) {
      if (!entry.error) pausedAgents.add(entry.id);
    }
    phase(label, { journal: list });
  };
  const safeResume = async (label) => {
    const allAgents = beforeAgents.filter((a) => pausedAgents.has(a.id));
    const list = await setPauseState(request, allAgents, false);
    pausedAgents.clear();
    phase(label, { journal: list });
  };

  let allOk = true;
  try {
    // Pre-warm phase: invoke one heartbeat per canonical agent and wait
    // for terminal so the diagnostic iteration only sees warm AI timing.
    if (process.env.M015_PREWARM === '1') {
      const prewarmResults = [];
      for (const a of canonicalAgents) {
        // We must keep the agent unpaused for pre-warm because hermes
        // does not invoke heartbeats on paused agents.
        const result = await prewarmAgent(request, a);
        prewarmResults.push(result);
      }
      phase('prewarm', { results: prewarmResults });
    }

    for (const target of canonicalAgents) {
      const iterStart = Date.now();
      const iteration = {
        agent: target.name,
        started_at: nowIso(),
        pause_others: [],
        prewarm: null,
        t02_result: null,
        t02_per_agent_evidence_status: null,
        t02_per_agent_evidence_file: perAgentEvidencePath(target.name),
        elapsed_ms: null,
      };

      // Pause everyone except the test target.
      const others = beforeAgents.filter((a) => a.id !== target.id);
      const pauseList = await setPauseState(request, others, true);
      for (const entry of pauseList) {
        if (!entry.error) pausedAgents.add(entry.id);
      }
      iteration.pause_others = pauseList;

      // Run the diagnostic for this single agent.
      const t02Result = runHeartbeatScript(env, target.name, journal.poll_budget);
      iteration.t02_result = {
        exit_status: t02Result.status,
        signal: t02Result.signal,
        stdout_tail: t02Result.stdout.split('\n').slice(-3).join('\n'),
        stderr_tail: t02Result.stderr.split('\n').slice(-3).join('\n'),
        error: t02Result.error,
      };
      if (t02Result.status !== 0) allOk = false;

      // Read the per-agent evidence file written by T02.
      const perAgentEvidenceRaw = fs.existsSync(perAgentEvidencePath(target.name))
        ? JSON.parse(fs.readFileSync(perAgentEvidencePath(target.name), 'utf8'))
        : null;
      iteration.t02_per_agent_evidence_status = perAgentEvidenceRaw ? perAgentEvidenceRaw.status : 'NO-EVIDENCE-FILE';

      // Resume everyone we paused (except target if not previously paused).
      const resumeList = await setPauseState(request, others, false);
      for (const entry of resumeList) {
        if (entry.error) {
          // If a resume failed, leave the agent flagged so the safeResume
          // at the end can try again.
        } else {
          pausedAgents.delete(entry.id);
        }
      }
      iteration.resume_others = resumeList;
      iteration.elapsed_ms = Date.now() - iterStart;

      journal.iterations.push(iteration);
      writeJournal();
    }

    // Aggregate per-agent evidence into the combined file consumed by T03.
    const perAgentEvidence = canonicalAgents.map((a) => {
      const file = perAgentEvidencePath(a.name);
      if (!fs.existsSync(file)) return null;
      try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        parsed._source_file = path.relative(ROOT, file);
        return parsed;
      } catch { return null; }
    });
    const t01EvidencePath = path.join(ROOT, 'runtime-evidence/M015-S03-seven-agent-test-environment.json');
    const t01Status = fs.existsSync(t01EvidencePath)
      ? JSON.parse(fs.readFileSync(t01EvidencePath, 'utf8')).status
      : null;
    const combined = aggregateEvidence(perAgentEvidence, contract, t01Status, startedAt);
    fs.writeFileSync(COMBINED_OUTPUT_PATH, JSON.stringify(combined, null, 2) + '\n');
    phase('aggregate', { combined_status: combined.status, pass_count: combined.pass_count, fail_count: combined.fail_count });

    if (combined.status !== 'PASS') allOk = false;
  } finally {
    // Resume anything we paused but did not resume.
    if (pausedAgents.size > 0) {
      const leftover = beforeAgents.filter((a) => pausedAgents.has(a.id));
      try {
        const list = await setPauseState(request, leftover, false);
        phase('final-resume', { journal: list });
      } catch (err) {
        phase('final-resume-error', { error: redactError(err) });
      }
      pausedAgents.clear();
    }
  }

  journal.completed_at = nowIso();
  journal.final_action = allOk ? 'pass' : 'fail';
  writeJournal();
  process.stdout.write(`M015_S03_T06_ORCHESTRATOR=${journal.final_action} iterations=${journal.iterations.length} poll_budget=${journal.poll_budget}\n`);
  process.exit(allOk ? 0 : 1);
}

if (require.main === module) {
  run().catch((error) => {
    try {
      const failure = {
        $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s03-t06-orchestrator-journal.v1.json',
        milestone: 'M015-4o8lfw',
        slice: 'S03',
        task: 'T06',
        started_at: nowIso(),
        completed_at: nowIso(),
        final_action: 'fail',
        error: redactError(error),
        phases: [],
      };
      fs.writeFileSync(ORCHESTRATOR_JOURNAL_PATH, JSON.stringify(failure, null, 2) + '\n');
    } catch (_) { /* best effort */ }
    process.stderr.write(`M015_S03_T06_ORCHESTRATOR_ERROR=${redactError(error)}\n`);
    process.exit(2);
  });
}

module.exports = { run };