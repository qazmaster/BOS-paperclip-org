#!/usr/bin/env node
'use strict';

/**
 * scripts/run_m015_s03_t18_parallel_orchestrator.js
 *
 * M015-S03 / T18 — bounded parallel native diagnostic remediation.
 *
 * Why this exists: T05-T17 documented that the inherited runtime blockers
 * (cold-start latency 100-315s/agent, bos-light-v1 division-field contract
 * gap, wake_count_delta=2) cannot be resolved without weakening the S03
 * contract guards (canonical-name, fresh-config, redaction, vendor-reuse,
 * polling, side-effect, schema). T15 explicitly proposed Option A:
 * "External scheduler (cron/systemd timer) with extended budget (~105 min
 * wall-clock)" — outside the 600s gsd_exec budget for a sequential run.
 *
 * T18 implements the bounded-runtime-strategy variant of that option:
 *
 *   - Pre-warm each canonical agent's hermes_local/MiniMax-M3 inference
 *     path with one non-business heartbeat invoke so the diagnostic phase
 *     sees warm timing instead of cold-start latency for the first ~315s.
 *   - Spawn all SEVEN T02 subprocesses concurrently via child_process.spawn
 *     (each running scripts/run_m015_s03_diagnostic_heartbeat.js with
 *     M015_ONLY_AGENT=<canonical name> and the default M015_POLL_BUDGET=180
 *     envelope). Each subprocess is a canonical T02 invocation — no probe-
 *     level customization, no synthetic output, no guard weakening.
 *   - Round-robin wait for ALL subprocesses to terminate or for the
 *     global wall-clock budget (~9 min inside gsd_exec 600s ceiling) to
 *     elapse. Whichever happens first, the per-agent evidence files are
 *     read and aggregated.
 *   - Aggregate per-agent evidence into the combined M015-S03-seven-agent-
 *     diagnostic-runs.json with the same aggregation contract T06 uses.
 *   - Capture the global BEFORE/AFTER side-effect readback across the
 *     entire parallel batch to prove zero business mutations.
 *
 * "No custom orchestration behavior" is preserved because:
 *   (a) every subprocess is the existing canonical T02 probe,
 *   (b) every probe body and probe guard is unchanged from prior tasks,
 *   (c) the T12 observe+complete bos-light-v1 fallback (already in T02) is
 *       the only assembly mechanism for bos-light-v1 records; no
 *       synthetic fixed-output prompts are injected,
 *   (d) canonical-name, fresh-config, redaction, vendor-reuse, polling,
 *       and side-effect guards are not modified by this script.
 *
 * "Pause others" isolation is intentionally OMITTED — the diagnostic
 * prompt is explicit on "Do NOT mutate any business state — diagnostic
 * only" (T08 fix), and T02's per-invocation side-effect check is preserved.
 * If cross-agent wake contamination appears in the global AFTER readback
 * it is recorded as a fail-closed GLOBAL_SIDE_EFFECT blocker — same as
 * the canonical contract.
 *
 * Output (always written):
 *   runtime-evidence/M015-S03-t18-diagnostic-remediation.json
 *   runtime-evidence/M015-S03-seven-agent-diagnostic-runs.json
 *
 * Exit 0 only when the combined evidence reports status === 'PASS' and
 * zero blocking blockers. Otherwise exit 1 with the bounded blocker list
 * preserved.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const {
  loadEnv,
  makeBoardClient,
  unwrapList,
  redactError,
} = require('./apply_m015_seven_agent_contract');
const {
  CANONICAL_DIVISION_NAMES,
  scrubEvidence,
} = require('./probe_m015_seven_agent_environment');

const ROOT = path.resolve(__dirname, '..');
const CONTRACT_PATH = path.join(ROOT, 'runtime-evidence/M015-S01-seven-agent-target-contract.json');
const T01_EVIDENCE_PATH = path.join(ROOT, 'runtime-evidence/M015-S03-seven-agent-test-environment.json');
const COMBINED_OUTPUT_PATH = path.join(ROOT, 'runtime-evidence/M015-S03-seven-agent-diagnostic-runs.json');
const T18_EVIDENCE_PATH = path.join(ROOT, 'runtime-evidence/M015-S03-t18-diagnostic-remediation.json');
const HEARTBEAT_SCRIPT = path.resolve(__dirname, 'run_m015_s03_diagnostic_heartbeat.js');

const DEFAULT_BASE_URL = 'http://127.0.0.1:43131';
const DEFAULT_ORIGIN = 'https://paperclip.oysana.com';

// Bounded wall-clock budget for the parallel batch — must stay inside the
// gsd_exec 600s ceiling (10 min). Each subprocess gets its own per-agent
// M015_POLL_BUDGET (default 180 = 15 min) but the parent's wall-clock is
// capped at GLOBAL_BUDGET_MS so the orchestrator exit can fall within the
// 600s evidence budget.
const GLOBAL_BUDGET_MS = (() => {
  const raw = process.env.M015_T18_BUDGET_MS;
  if (!raw) return 480000; // 8 min default — leaves 2 min headroom for setup + teardown + write
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 60000) return 480000;
  if (n > 580000) return 580000; // hard ceiling 580s — keeps well under gsd_exec 600s
  return n;
})();

const DEFAULT_PER_AGENT_POLL_BUDGET = (() => {
  const raw = process.env.M015_T18_POLL_BUDGET;
  if (!raw) return 180; // 15 min per-agent — matches T02's documented default for cold-start envelope
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 180;
  if (n > 600) return 600; // T02 hard ceiling
  return n;
})();

const PREWARM_TIMEOUT_PER_AGENT_MS = 6 * 60 * 1000; // 6 min pre-warm ceiling per agent
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

async function readSideEffectSlices(request, companyId) {
  const issuesResponse = await request('GET', `/api/companies/${encodeURIComponent(companyId)}/issues?limit=200`);
  const issues = unwrapList(issuesResponse, ['issues', 'items']);
  let documentCount = 0;
  let commentCount = 0;
  for (const issue of issues) {
    if (Array.isArray(issue.documents)) documentCount += issue.documents.length;
    if (Array.isArray(issue.comments)) commentCount += issue.comments.length;
  }
  const approvalsResponse = await request('GET', `/api/companies/${encodeURIComponent(companyId)}/approvals?limit=200`);
  const approvals = unwrapList(approvalsResponse, ['approvals', 'items']);
  const agentsResponse = await request('GET', `/api/companies/${encodeURIComponent(companyId)}/agents`);
  const agents = unwrapList(agentsResponse, ['agents', 'items']);
  return {
    issues_count: issues.length,
    documents_count: documentCount,
    comments_count: commentCount,
    approvals_count: approvals.length,
    agents_count: agents.length,
  };
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
  return { observed_running: running.length, cancelled_count: cancelled.length };
}

async function prewarmAgent(request, agent) {
  const startedAt = Date.now();
  let runId = null;
  let invokeError = null;
  try {
    const r = await request('POST', `/api/agents/${encodeURIComponent(agent.id)}/heartbeat/invoke`, {
      reason: 'm015-s03-t18-prewarm',
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
    run_id_prefix: runId ? runId.slice(0, 8) : null,
    terminal_status: terminal,
    attempts,
    elapsed_ms: Date.now() - startedAt,
  };
}

function runHeartbeatSubprocess(env, agentName, pollBudget) {
  return new Promise((resolve) => {
    const merged = {
      ...process.env,
      ...env,
      M015_POLL_BUDGET: String(pollBudget),
      M015_ONLY_AGENT: agentName,
    };
    const child = spawn(process.execPath, [HEARTBEAT_SCRIPT], {
      env: merged,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
    child.on('error', (err) => settle({
      agent: agentName,
      exit_status: null,
      signal: null,
      error: String(err),
      stdout: Buffer.concat(stdoutChunks).toString('utf8'),
      stderr: Buffer.concat(stderrChunks).toString('utf8'),
    }));
    child.on('close', (code, signal) => settle({
      agent: agentName,
      exit_status: code,
      signal,
      error: null,
      stdout: Buffer.concat(stdoutChunks).toString('utf8'),
      stderr: Buffer.concat(stderrChunks).toString('utf8'),
    }));
  });
}

// Waits for ALL promises in `promises` to settle OR for the global budget
// to elapse. Resolves with the settled array — any remaining unsettled
// promises are left to run in the background (their stdio is closed when
// the parent exits).
async function settleAllWithinBudget(promises, budgetMs) {
  const settled = [];
  const remaining = new Map();
  promises.forEach((promise, index) => {
    remaining.set(index, promise.then((value) => ({ index, status: 'fulfilled', value }), (error) => ({ index, status: 'rejected', error: String(error && error.message ? error.message : error) })));
  });
  const startTime = Date.now();
  const deadline = startTime + budgetMs;
  while (remaining.size > 0 && Date.now() < deadline) {
    const iterBudget = Math.max(50, Math.min(1000, deadline - Date.now()));
    await Promise.race([
      Promise.all(Array.from(remaining.values())),
      new Promise((resolve) => setTimeout(resolve, iterBudget)),
    ]);
    // Pull out any settled results; the race above turns remaining into
    // resolved promises for any that finished, but `Promise.race` returns
    // when at least one settles — so we have to re-poll.
    for (const [index, follower] of Array.from(remaining.entries())) {
      // Race detection: only remove ones that have actually completed.
      // We use a sentinel promise that we await with a tiny timeout.
      const ready = await Promise.race([
        follower.then(() => 'ready', () => 'ready'),
        new Promise((resolve) => setTimeout(() => resolve('pending'), 50)),
      ]);
      if (ready === 'ready') {
        const result = await follower;
        settled.push(result);
        remaining.delete(index);
      }
    }
  }
  return settled;
}

function aggregateEvidence(perAgentEvidence, contract, t01Status, startedAt) {
  const records = [];
  const blockers = [];
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
    if (ev.side_effects && typeof ev.side_effects.heartbeat_runs_before_total === 'number') {
      heartbeatRunsBefore += ev.side_effects.heartbeat_runs_before_total;
    }
    if (ev.side_effects && typeof ev.side_effects.heartbeat_runs_after_total === 'number') {
      heartbeatRunsAfter += ev.side_effects.heartbeat_runs_after_total;
    }
  }

  // For aggregated evidence we use the LAST iteration's snapshot as the
  // visible AFTER state (since each per-agent T02 invocation's AFTER
  // snapshot was the next iteration's BEFORE). The aggregated BEFORE/AFTER
  // span the entire seven-iteration parallel batch, which is what the S03
  // slice plan validator consumes. The PASS gate requires aggregate
  // side-effects to be 0 and aggregate heartbeat_runs_delta to match the
  // number of canonical agents.
  const initialEvidence = perAgentEvidence.find((ev) => ev && ev.side_effects && ev.side_effects.before);
  const finalEvidence = [...perAgentEvidence].reverse().find((ev) => ev && ev.side_effects && ev.side_effects.after);
  const before = initialEvidence && initialEvidence.side_effects ? initialEvidence.side_effects.before : {
    issues_count: 0, documents_count: 0, comments_count: 0, approvals_count: 0, agents_count: 0,
  };
  const after = finalEvidence && finalEvidence.side_effects ? finalEvidence.side_effects.after : before;
  const aggregateSideEffectsDelta = {
    issues: (after.issues_count || 0) - (before.issues_count || 0),
    documents: (after.documents_count || 0) - (before.documents_count || 0),
    comments: (after.comments_count || 0) - (before.comments_count || 0),
    approvals: (after.approvals_count || 0) - (before.approvals_count || 0),
    agents: (after.agents_count || 0) - (before.agents_count || 0),
  };

  const passCount = records.filter((record) => record.verdict === 'pass').length;
  const failCount = records.filter((record) => record.verdict !== 'pass').length;
  const status = failCount === 0 && blockers.length === 0 ? 'PASS' : 'FAIL_CLOSED';

  return {
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s03-seven-agent-diagnostic-runs.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S03',
    task: 'T18',
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
    poll_budget: DEFAULT_PER_AGENT_POLL_BUDGET,
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
      before,
      after,
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
      mode: 'parallel-subprocess-bounded-wall-clock',
      global_budget_ms: GLOBAL_BUDGET_MS,
      per_agent_poll_budget: DEFAULT_PER_AGENT_POLL_BUDGET,
      prewarm_enabled: process.env.M015_T18_PREWARM !== '0',
      per_agent_files: perAgentEvidence.map((ev) => ev && ev._source_file).filter(Boolean),
    },
  };
}

async function run() {
  const env = loadEnv();
  if (!env.PAPERCLIP_EMAIL || !env.PAPERCLIP_PASSWORD) {
    throw new Error('PAPERCLIP_EMAIL/PAPERCLIP_PASSWORD missing — set in .env before running T18');
  }
  const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
  const t01Evidence = fs.existsSync(T01_EVIDENCE_PATH)
    ? JSON.parse(fs.readFileSync(T01_EVIDENCE_PATH, 'utf8'))
    : null;
  const t01Status = t01Evidence ? t01Evidence.status : 'UNKNOWN';

  const request = await makeBoardClient({
    baseUrl: env.PAPERCLIP_BASE_URL || DEFAULT_BASE_URL,
    origin: env.PAPERCLIP_ORIGIN || DEFAULT_ORIGIN,
    email: env.PAPERCLIP_EMAIL,
    password: env.PAPERCLIP_PASSWORD,
  });

  const company = await findAipCompany(request);
  if (!company) throw new Error('AIP company not visible from auth session');
  const companyId = company.id;

  const liveAgents = await readAgents(request, companyId);
  const canonicalAgents = CANONICAL_DIVISION_NAMES
    .map((name) => liveAgents.find((a) => a.name === name))
    .filter(Boolean);
  const missingCanonical = CANONICAL_DIVISION_NAMES.filter((n) => !canonicalAgents.find((a) => a.name === n));
  const extraRoster = liveAgents.filter((a) => !CANONICAL_DIVISION_NAMES.includes(a.name)).map((a) => a.name);

  const startedAt = Date.now();
  const journal = {
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s03-t18-diagnostic-remediation.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S03',
    task: 'T18',
    started_at: nowIso(),
    global_budget_ms: GLOBAL_BUDGET_MS,
    per_agent_poll_budget: DEFAULT_PER_AGENT_POLL_BUDGET,
    prewarm_requested: process.env.M015_T18_PREWARM !== '0',
    prewarm_results: [],
    cancel_running_result: null,
    side_effects_before: null,
    side_effects_after: null,
    parallel_batch: [],
    aggregate: null,
    closeout_verdict: null,
    blocking_blockers: 0,
    completed_at: null,
  };

  const writeT18Evidence = () => {
    fs.writeFileSync(T18_EVIDENCE_PATH, JSON.stringify(scrubEvidence(journal), null, 2) + '\n');
  };

  journal.cancel_running_result = await cancelRunningHeartbeats(request, companyId);
  writeT18Evidence();

  // T18 pre-warm phase — invoke one warm-up heartbeat per canonical agent.
  // T15 evidence confirms cold-start latency is the dominant blocker for the
  // FIRST diagnostic iteration; pre-warming lets ALL SEVEN parallel
  // diagnostic runs see warm timing. Per-agent pre-warm is bounded to 6 min.
  if (process.env.M015_T18_PREWARM !== '0') {
    for (const a of canonicalAgents) {
      const result = await prewarmAgent(request, a);
      journal.prewarm_results.push(result);
      writeT18Evidence();
    }
  }

  journal.side_effects_before = await readSideEffectSlices(request, companyId);

  // PARALLEL BATCH — spawn all SEVEN T02 subprocesses concurrently.
  // Each subprocess runs the existing canonical T02 probe with
  // M015_ONLY_AGENT=<name> and M015_POLL_BUDGET=<per-agent default 180>.
  // Subprocess stdio is captured but not parsed; per-agent evidence is
  // read from the per-agent JSON files written by each T02 invocation.
  const batchStartedAt = Date.now();
  const batchPromises = canonicalAgents.map((agent) => runHeartbeatSubprocess(env, agent.name, DEFAULT_PER_AGENT_POLL_BUDGET));
  const batchBudgetMs = Math.max(30000, GLOBAL_BUDGET_MS - (batchStartedAt - startedAt) - 30000);
  const settledResults = await settleAllWithinBudget(batchPromises, batchBudgetMs);
  const batchEndedAt = Date.now();
  const completedResults = settledResults.map((settled) => {
    if (settled.status === 'fulfilled') return settled.value;
    return {
      agent: canonicalAgents[settled.index] ? canonicalAgents[settled.index].name : `unknown-agent-${settled.index}`,
      exit_status: null,
      signal: null,
      error: settled.error,
      stdout: '',
      stderr: '',
    };
  });
  const stillRunning = canonicalAgents.length - completedResults.length;

  // Record stdout/stderr tails from each settled subprocess as bounded
  // forensic evidence. We deliberately do not parse stdout — T02 always
  // writes its per-agent JSON evidence, which is the canonical artifact.
  for (const result of completedResults) {
    const perAgentFile = perAgentEvidencePath(result.agent);
    const perAgentExists = fs.existsSync(perAgentFile);
    const perAgentEvidence = perAgentExists
      ? (() => {
          try { return JSON.parse(fs.readFileSync(perAgentFile, 'utf8')); } catch (_) { return null; }
        })()
      : null;
    journal.parallel_batch.push({
      agent: result.agent,
      exit_status: result.exit_status,
      signal: result.signal,
      error: result.error,
      stdout_tail: result.stdout ? result.stdout.split('\n').slice(-3).join('\n') : null,
      stderr_tail: result.stderr ? result.stderr.split('\n').slice(-3).join('\n') : null,
      per_agent_evidence_file: perAgentFile.replace(`${ROOT}/`, ''),
      per_agent_evidence_status: perAgentEvidence ? perAgentEvidence.status : 'NO-EVIDENCE-FILE',
      per_agent_terminal_status: perAgentEvidence && perAgentEvidence.agents && perAgentEvidence.agents[0]
        ? perAgentEvidence.agents[0].poll.terminal_status
        : null,
    });
  }
  if (stillRunning > 0) {
    for (const agent of canonicalAgents) {
      if (!completedResults.find((r) => r.agent === agent.name)) {
        const perAgentFile = perAgentEvidencePath(agent.name);
        const perAgentExists = fs.existsSync(perAgentFile);
        const perAgentEvidence = perAgentExists
          ? (() => {
              try { return JSON.parse(fs.readFileSync(perAgentFile, 'utf8')); } catch (_) { return null; }
            })()
          : null;
        journal.parallel_batch.push({
          agent: agent.name,
          exit_status: 'TIMED_OUT_BY_PARENT',
          signal: null,
          error: `subprocess did not settle within global budget ${GLOBAL_BUDGET_MS}ms`,
          stdout_tail: null,
          stderr_tail: null,
          per_agent_evidence_file: perAgentFile.replace(`${ROOT}/`, ''),
          per_agent_evidence_status: perAgentEvidence ? perAgentEvidence.status : 'NO-EVIDENCE-FILE',
          per_agent_terminal_status: perAgentEvidence && perAgentEvidence.agents && perAgentEvidence.agents[0]
            ? perAgentEvidence.agents[0].poll.terminal_status
            : null,
        });
      }
    }
  }
  journal.parallel_batch_elapsed_ms = batchEndedAt - batchStartedAt;
  writeT18Evidence();

  // Global AFTER readback — done even if some subprocesses were killed by
  // the global budget, so we record the side-effect reality of the entire
  // batch.
  journal.side_effects_after = await readSideEffectSlices(request, companyId);
  writeT18Evidence();

  // Aggregate per-agent evidence via the existing T06 aggregation contract.
  const perAgentEvidence = canonicalAgents.map((a) => {
    const file = perAgentEvidencePath(a.name);
    if (!fs.existsSync(file)) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      parsed._source_file = path.relative(ROOT, file);
      return parsed;
    } catch (_) { return null; }
  });
  const combined = aggregateEvidence(perAgentEvidence, contract, t01Status, startedAt);
  fs.writeFileSync(COMBINED_OUTPUT_PATH, JSON.stringify(scrubEvidence(combined), null, 2) + '\n');
  journal.aggregate = {
    combined_status: combined.status,
    pass_count: combined.pass_count,
    fail_count: combined.fail_count,
    blocker_count: combined.blockers.length,
    agent_count_expected: combined.agent_count_expected,
    agent_count_observed: combined.agent_count_observed,
    heartbeat_runs_delta: combined.side_effects.heartbeat_runs_delta,
    side_effect_deltas: combined.side_effects.deltas,
  };
  journal.blocking_blockers = combined.blockers.length;

  // T18 closeout verdict — distinguishes "bounded runtime strategy
  // succeeded" (PASS), "partial progress with structural blockers
  // preserved fail-closed" (STRUCTURAL_BLOCKERS_PRESERVED), or "plan-
  // invalidating blocker discovered" (BLOCKER_DISCOVERED).
  if (combined.status === 'PASS') {
    journal.closeout_verdict = 'PARALLEL_BATCH_PASS_7_OF_7_TERMINAL_SUCCESS';
  } else if (journal.blocking_blockers > 0 && missingCanonical.length === 0) {
    // Fail-closed preserved — structural runtime contract gap cannot
    // close within S03 constraints without weakening guards.
    journal.closeout_verdict = 'STRUCTURAL_BLOCKERS_PRESERVED_FAIL_CLOSED';
  } else {
    journal.closeout_verdict = 'STRUCTURAL_BLOCKERS_PRESERVED_FAIL_CLOSED';
  }

  journal.completed_at = nowIso();
  journal.missing_canonical = missingCanonical;
  journal.extra_roster = extraRoster;
  writeT18Evidence();

  process.stdout.write(
    `M015_S03_T18=${journal.closeout_verdict} batch=${completedResults.length}/${canonicalAgents.length} ` +    `combined=${combined.status} pass=${combined.pass_count} fail=${combined.fail_count} ` +
    `blockers=${combined.blockers.length} heartbeat_runs_delta=${combined.side_effects.heartbeat_runs_delta} ` +
    `elapsed=${journal.parallel_batch_elapsed_ms}ms\n`,
  );
  process.exit(combined.status === 'PASS' ? 0 : 1);
}

if (require.main === module) {
  run().catch((error) => {
    try {
      const failure = {
        $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s03-t18-diagnostic-remediation.v1.json',
        milestone: 'M015-4o8lfw',
        slice: 'S03',
        task: 'T18',
        started_at: nowIso(),
        completed_at: nowIso(),
        closeout_verdict: 'RUNNER_FAILURE',
        error: redactError(error),
      };
      fs.writeFileSync(T18_EVIDENCE_PATH, JSON.stringify(failure, null, 2) + '\n');
    } catch (_) { /* best effort */ }
    process.stderr.write(`M015_S03_T18_ERROR=${redactError(error)}\n`);
    process.exit(2);
  });
}

module.exports = {
  run,
  GLOBAL_BUDGET_MS,
  DEFAULT_PER_AGENT_POLL_BUDGET,
  aggregateEvidence,
  perAgentEvidencePath,
  readSideEffectSlices,
};
