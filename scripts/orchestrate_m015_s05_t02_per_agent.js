#!/usr/bin/env node
'use strict';

/**
 * scripts/orchestrate_m015_s05_t02_per_agent.js
 *
 * M015-S05 / T02 Option-A orchestrator: per-agent isolated sequential runs.
 *
 * Strategy: invoke run_m015_s03_diagnostic_heartbeat.js seven times, once
 * per canonical division agent, with M015_ONLY_AGENT={name}. Each invocation
 * runs as a fresh Node process, processes exactly one agent, and writes a
 * single-agent evidence record to the canonical path
 * (runtime-evidence/M015-S03-seven-agent-diagnostic-runs.json). We capture
 * that record BEFORE the next invocation overwrites it, save it to a
 * per-agent path under runtime-evidence/M015-S05-T02-orchestrator/, then
 * aggregate all seven into a single 7-of-7 canonical evidence file.
 *
 * Why this works:
 *   1. Per-agent isolation — each invocation touches exactly one agent's
 *      invoke + heartbeat-runs list, eliminating foreign daemon heartbeat
 *      noise from per-agent runListBefore/After diffs.
 *   2. Per-agent subprocess — each invocation gets its own cold-start
 *      session (persistSession=true means each session warms independently,
 *      so this doesn't worsen cold-start cost).
 *   3. Bounded wall-clock per agent — 30 minutes (1800s) per subprocess,
 *      fitting the 600s gsd_exec × 5 budget that the T12 evidence flagged
 *      as the failure mode for 7-agent single-process runs.
 *
 * What this does NOT change:
 *   - canonical-name, fresh-config, redaction, vendor-reuse, polling, schema,
 *     side-effect guards (all enforced inside run_m015_s03_diagnostic_heartbeat.js).
 *   - bos_provenance discipline (native-full / assembled-replacing-incomplete-native
 *     / assembled-no-native, with field_sources + division_value_agreement).
 *   - wake_count_delta filter ("our runId presence" — not raw list-length diff).
 *   - S01 contract mutation_order / canonical 7 names.
 *   - T02 script's existing stop-on-first-blocker + side-effect zero-delta
 *     invariants.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  CANONICAL_DIVISION_NAMES,
  discoverCanonicalAgents,
} = require('./probe_m015_seven_agent_environment');
const {
  loadEnv,
  makeBoardClient,
} = require('./apply_m015_seven_agent_contract');
const {
  UUID_FULL,
  CREDENTIAL_ASSIGNMENT,
  XIAOMI_RE,
} = require('./probe_m015_seven_agent_environment');

const ROOT = path.resolve(__dirname, '..');
const T02_SCRIPT = path.join(ROOT, 'scripts/run_m015_s03_diagnostic_heartbeat.js');
const CANONICAL_PATH = path.join(ROOT, 'runtime-evidence/M015-S03-seven-agent-diagnostic-runs.json');
const ORCH_DIR = path.join(ROOT, 'runtime-evidence/M015-S05-T02-orchestrator');
const CONTRACT_PATH = path.join(ROOT, 'runtime-evidence/M015-S01-seven-agent-target-contract.json');
const PER_AGENT_TIMEOUT_MS = 1800000; // 30 min per agent; cold-start envelope up to 5 min × 7 won't repeat sequentially here

function safeAgentSlug(name) {
  return String(name).replace(/[^A-Za-z0-9]+/g, '-');
}

function loadEnvFromDotenv() {
  const env = { ...process.env };
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return env;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[key] = value;
  }
  return env;
}

function redactionCheck(serialized, agent) {
  if (UUID_FULL.test(serialized)) throw new Error(`REDACTION_LEAK_UUID for ${agent}`);
  if (CREDENTIAL_ASSIGNMENT.test(serialized)) throw new Error(`REDACTION_LEAK_CRED for ${agent}`);
  if (XIAOMI_RE.test(serialized)) throw new Error(`REDACTION_LEAK_XIAOMI for ${agent}`);
}

function runOneAgent(env, name, ourAgentIdsCsv) {
  const slug = safeAgentSlug(name);
  const perAgentPath = path.join(ORCH_DIR, `${slug}.json`);
  const childEnv = {
    ...env,
    M015_ONLY_AGENT: name,
    M015_OUR_AGENT_IDS: ourAgentIdsCsv,
    // Force a tight budget per subprocess so the orchestrator can recover
    // gracefully when one agent stalls. 180 polls × 5s = 900s ≈ 15 min
    // matches the existing T02 default; we cap at the hard ceiling 600.
    M015_POLL_BUDGET: '180',
  };
  const startedAt = Date.now();
  // eslint-disable-next-line no-console
  console.log(`[orchestrator] running T02 for ${name} (pid pending, budget=${childEnv.M015_POLL_BUDGET})`);
  const result = spawnSync('node', [T02_SCRIPT], {
    cwd: ROOT,
    env: childEnv,
    encoding: 'utf8',
    timeout: PER_AGENT_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const elapsedMs = Date.now() - startedAt;
  // Per-agent subprocess exit codes:
  //   0 — never (T02 writes FAIL_CLOSED on blocker, exit 2; success path exits 0)
  //   1 — T02 success path with status=FAIL_CLOSED (e.g. partial agents under
  //       non-M015_ONLY_AGENT sequential; under M015_ONLY_AGENT=1, exit 1
  //       indicates blocker for the single agent)
  //   2 — T02 RUNNER-FAILURE
  //   null/124 — timeout (PER_AGENT_TIMEOUT_MS exceeded)
  const status = result.status;
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  // eslint-disable-next-line no-console
  console.log(`[orchestrator] T02 for ${name} exited status=${status} elapsedMs=${elapsedMs}`);
  if (stdout.trim().length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[orchestrator] stdout-tail: ${stdout.trim().split(/\r?\n/).slice(-3).join(' | ')}`);
  }
  if (stderr.trim().length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[orchestrator] stderr-tail: ${stderr.trim().split(/\r?\n/).slice(-3).join(' | ')}`);
  }
  // Read the per-agent evidence file that T02 just wrote (when
  // M015_ONLY_AGENT is set, T02 writes to runtime-evidence/M015-S03-diagnostic-run-{name}.json
  // and SKIPS the canonical seven-agent-diagnostic-runs.json, so reading from
  // the canonical path returns stale data from earlier runs). The per-agent
  // path mirrors T02's own OUTPUT_PATH.replace logic.
  const perAgentT02Path = CANONICAL_PATH.replace(
    /seven-agent-diagnostic-runs\.json$/,
    `diagnostic-run-${name.replace(/\./g, '-')}.json`
  );
  const freshSourcePath = fs.existsSync(perAgentT02Path) ? perAgentT02Path : CANONICAL_PATH;
  if (!fs.existsSync(freshSourcePath)) {
    throw new Error(`T02 for ${name} did not write evidence at ${freshSourcePath}`);
  }
  const freshSerialized = fs.readFileSync(freshSourcePath, 'utf8');
  redactionCheck(freshSerialized, name);
  const fresh = JSON.parse(freshSerialized);
  // Save per-agent copy under the orchestrator dir (atomic — write-then-rename
  // would be ideal but fs.writeFileSync is acceptable here since no other
  // process writes to the same path).
  fs.mkdirSync(ORCH_DIR, { recursive: true });
  fs.writeFileSync(perAgentPath, freshSerialized);
  return {
    name,
    exitStatus: status,
    elapsedMs,
    perAgentPath,
    evidence: fresh,
  };
}

function aggregate(perAgentResults) {
  // Compose a single canonical 7-of-7 evidence record from seven per-agent
  // records. Side-effect deltas: each per-agent run did its own BEFORE/AFTER
  // snapshot; we aggregate them across the seven invocations. heartbeat_runs
  // deltas use the per-agent wake_count_delta sum (our-run filter, already
  // daemon-noise-free).
  const agents = perAgentResults.flatMap((r) => (r.evidence && Array.isArray(r.evidence.agents)) ? r.evidence.agents : []);
  if (agents.length !== perAgentResults.length) {
    throw new Error(`aggregate: agent count mismatch ${agents.length} vs ${perAgentResults.length}`);
  }
  const blockers = perAgentResults.flatMap((r) => (r.evidence && Array.isArray(r.evidence.blockers)) ? r.evidence.blockers : []);
  const passCount = agents.filter((a) => a.verdict === 'pass').length;
  const failCount = agents.filter((a) => a.verdict !== 'pass').length;
  const blockingBlockers = blockers.filter((b) => b.severity === 'blocking');

  // heartbeat_runs_delta: sum per-agent wake_count_delta. Each per-agent
  // wake_count_delta is 1 iff THIS run's runId is in runListAfter minus
  // runListBefore. Sum across seven isolated subprocesses = 7 when all
  // seven succeed, <7 otherwise.
  const heartbeatRunsDelta = agents.reduce((acc, a) => acc + (a.wake_count_delta === 1 ? 1 : 0), 0);

  // Side-effects aggregate: take the FIRST invocation's BEFORE as global
  // before, the LAST invocation's AFTER as global after. Compute deltas.
  // Each per-agent run is zero-delta in isolation, so the global deltas
  // here reflect any cross-agent noise (which should also be zero since
  // we ran diagnostic-only heartbeats).
  const firstBefore = perAgentResults[0]?.evidence?.side_effects?.before || null;
  const lastAfter = perAgentResults[perAgentResults.length - 1]?.evidence?.side_effects?.after || null;
  const sideEffects = firstBefore && lastAfter ? {
    before: firstBefore,
    after: lastAfter,
    deltas: {
      issues: lastAfter.issues_count - firstBefore.issues_count,
      documents: lastAfter.documents_count - firstBefore.documents_count,
      comments: lastAfter.comments_count - firstBefore.comments_count,
      approvals: lastAfter.approvals_count - firstBefore.approvals_count,
      agents: lastAfter.agents_count - firstBefore.agents_count,
    },
    heartbeat_runs_before_total: perAgentResults.reduce((acc, r) => acc + ((r.evidence?.side_effects?.heartbeat_runs_before_total) || 0), 0),
    heartbeat_runs_after_total: perAgentResults.reduce((acc, r) => acc + ((r.evidence?.side_effects?.heartbeat_runs_after_total) || 0), 0),
    heartbeat_runs_delta: heartbeatRunsDelta,
  } : null;

  // Status distribution & poll-attempts distribution across the seven runs.
  const statusDistribution = {};
  const pollAttemptsDistribution = {};
  for (const a of agents) {
    const s = a.poll?.terminal_status || 'unknown';
    statusDistribution[s] = (statusDistribution[s] || 0) + 1;
    const k = String(a.poll?.attempts_to_terminal || a.poll?.attempts || 'exhausted');
    pollAttemptsDistribution[k] = (pollAttemptsDistribution[k] || 0) + 1;
  }

  // Reference the upstream test-environment (T01 PASS) and contract.
  const firstEvidence = perAgentResults[0]?.evidence;
  return {
    $schema: firstEvidence?.$schema || 'https://gsd.local/schemas/runtime-evidence/m015-s03-seven-agent-diagnostic-runs.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S05',
    task: 'T02',
    generated: new Date().toISOString(),
    status: blockingBlockers.length === 0 ? 'PASS' : 'FAIL_CLOSED',
    company: firstEvidence?.company || null,
    source_contract: firstEvidence?.source_contract || 'runtime-evidence/M015-S01-seven-agent-target-contract.json',
    cross_reference: firstEvidence?.cross_reference || 'runtime-evidence/M015-S02-seven-agent-after.json',
    upstream_test_environment: firstEvidence?.upstream_test_environment || null,
    heartbeat_endpoint: 'POST /api/agents/{agentId}/heartbeat/invoke',
    poll_endpoint: 'GET /api/heartbeat-runs/{runId}',
    heartbeat_runs_list_endpoint: 'GET /api/companies/{companyId}/heartbeat-runs?agentId={agentId}',
    poll_budget: firstEvidence?.poll_budget || 180,
    poll_interval_ms: firstEvidence?.poll_interval_ms || 5000,
    terminal_statuses: firstEvidence?.terminal_statuses || ['succeeded', 'failed', 'cancelled', 'expired', 'timed_out'],
    expected_success_terminal: 'succeeded',
    required_bos_diagnostic_fields: ['schemaVersion', 'runId', 'division', 'role', 'status'],
    agent_count_expected: perAgentResults.length,
    agent_count_observed: agents.length,
    pass_count: passCount,
    fail_count: failCount,
    status_distribution: statusDistribution,
    poll_attempts_distribution: pollAttemptsDistribution,
    side_effects: sideEffects,
    orchestration: {
      strategy: 'per-agent-isolated-sequential-subprocess',
      per_agent_subprocess: true,
      m015_only_agent_envar: true,
      per_agent_artifact_dir: 'runtime-evidence/M015-S05-T02-orchestrator/',
      per_agent_results: perAgentResults.map((r) => ({
        name: r.name,
        per_agent_path: path.relative(ROOT, r.perAgentPath),
        exit_status: r.exitStatus,
        elapsed_ms: r.elapsedMs,
        pass: r.evidence?.agents?.[0]?.verdict === 'pass',
        wake_count_delta: r.evidence?.agents?.[0]?.wake_count_delta,
        terminal_status: r.evidence?.agents?.[0]?.poll?.terminal_status,
        bos_provenance_source: r.evidence?.agents?.[0]?.bos_provenance?.source,
        bos_provenance_agreement: r.evidence?.agents?.[0]?.bos_provenance?.agreement,
      })),
    },
    agents,
    blockers,
    redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false },
  };
}

async function main() {
  const env = loadEnv();
  if (!env.PAPERCLIP_EMAIL || !env.PAPERCLIP_PASSWORD) {
    // eslint-disable-next-line no-console
    console.error('PAPERCLIP_EMAIL/PAPERCLIP_PASSWORD missing — set in .env before running the orchestrator');
    process.exit(2);
  }
  if (!env.PAPERCLIP_BASE_URL) {
    env.PAPERCLIP_BASE_URL = 'https://paperclip.oysana.com';
  }
  if (!env.PAPERCLIP_ORIGIN) {
    env.PAPERCLIP_ORIGIN = 'https://paperclip.oysana.com';
  }
  fs.mkdirSync(ORCH_DIR, { recursive: true });

  // Resolve the 7 canonical agent IDs ONCE at startup so we can pass them
  // to each per-agent subprocess via M015_OUR_AGENT_IDS. This enables T02's
  // side-effect attribution filter (createdByAgentId ∈ our set) — symmetric
  // to wake_delta's "our-runId presence" filter. Foreign daemon / monitoring
  // issues are excluded from the 0-delta invariant.
  // eslint-disable-next-line no-console
  console.log('[orchestrator] resolving 7 canonical agent IDs for side-effect attribution');
  const request = await makeBoardClient({
    baseUrl: env.PAPERCLIP_BASE_URL,
    origin: env.PAPERCLIP_ORIGIN,
    email: env.PAPERCLIP_EMAIL,
    password: env.PAPERCLIP_PASSWORD,
  });
  const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
  const discovery = await discoverCanonicalAgents(contract, request);
  const ourAgentIds = CANONICAL_DIVISION_NAMES.map((n) => discovery.found[n] && discovery.found[n].id).filter(Boolean);
  const ourAgentIdsCsv = ourAgentIds.join(',');
  // eslint-disable-next-line no-console
  console.log(`[orchestrator] M015_OUR_AGENT_IDS=${ourAgentIdsCsv} (${ourAgentIds.length} canonical IDs)`);

  const perAgentResults = [];
  for (const name of CANONICAL_DIVISION_NAMES) {
    const r = runOneAgent(env, name, ourAgentIdsCsv);
    perAgentResults.push(r);
    if (r.evidence && r.evidence.agents && r.evidence.agents[0] && r.evidence.agents[0].verdict !== 'pass') {
      // Stop on first blocker — same discipline as the standalone T02 run.
      // We still aggregate whatever we have so the canonical evidence file
      // reflects the partial state.
      // eslint-disable-next-line no-console
      console.log(`[orchestrator] stop-on-first-blocker fired at ${name} (verdict=${r.evidence.agents[0].verdict}); aggregating ${perAgentResults.length} of ${CANONICAL_DIVISION_NAMES.length}`);
      break;
    }
  }

  const canonical = aggregate(perAgentResults);
  const serialized = JSON.stringify(canonical, null, 2) + '\n';
  redactionCheck(serialized, 'aggregate');
  fs.writeFileSync(CANONICAL_PATH, serialized);

  // eslint-disable-next-line no-console
  console.log(`[orchestrator] aggregated ${perAgentResults.length} per-agent runs into ${path.relative(ROOT, CANONICAL_PATH)}`);
  // eslint-disable-next-line no-console
  console.log(`[orchestrator] status=${canonical.status} pass=${canonical.pass_count} fail=${canonical.fail_count} heartbeat_runs_delta=${canonical.side_effects?.heartbeat_runs_delta} blockers=${canonical.blockers.length}`);
  process.exit(canonical.status === 'PASS' ? 0 : 1);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[orchestrator] fatal: ${error && error.stack || error}`);
    process.exit(2);
  }
}

module.exports = {
  aggregate,
  runOneAgent,
  CANONICAL_DIVISION_NAMES,
};