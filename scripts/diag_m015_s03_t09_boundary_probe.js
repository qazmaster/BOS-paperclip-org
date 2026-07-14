#!/usr/bin/env node
'use strict';
/**
 * scripts/diag_m015_s03_t09_boundary_probe.js
 *
 * T09 read-only boundary diagnostic. Probes for alternative authoritative
 * sources for wake_count_delta and BOS-shaped fields, without weakening
 * fail-closed guards.
 *
 * Steps:
 *   1. Re-resolve canonical agents.
 *   2. For one idle agent (Div2.MasterPlanner):
 *      a. Read full agent object BEFORE invoke → surface wakeCount/heartbeatCount/wake fields.
 *      b. List heartbeat-runs via agentId filter AND without filter.
 *      c. Invoke a single non-business diagnostic heartbeat.
 *      d. Poll for terminal.
 *      e. Read agent object AFTER invoke → compare.
 *      f. List heartbeat-runs again via agentId filter AND without filter.
 *      g. Wait 30s, then list again → does the per-agent list catch up?
 *      h. Dump full resultJson tree (keys at every depth, no values).
 *   3. Output bounded JSON to stdout only (no evidence file written).
 *
 * This script does NOT write to runtime-evidence — it is forensic only.
 */

const fs = require('fs');
const path = require('path');
const {
  loadEnv,
  makeBoardClient,
  unwrapList,
} = require('./apply_m015_seven_agent_contract');
const {
  CANONICAL_DIVISION_NAMES,
  discoverCanonicalAgents,
  UUID_FULL,
} = require('./probe_m015_seven_agent_environment');

const ROOT = path.resolve(__dirname, '..');
const CONTRACT_PATH = path.join(ROOT, 'runtime-evidence/M015-S01-seven-agent-target-contract.json');
const PROBE_AGENT = 'Div2.MasterPlanner';
const POLL_BUDGET = 36;
const POLL_INTERVAL_MS = 5000;
const POST_INVOKE_SETTLE_MS = 30000;

function redactId(s) {
  if (typeof s !== 'string') return s;
  return UUID_FULL.test(s) ? s.slice(0, 8) + '-<redacted>' : s;
}

function redact(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/ig, '<redacted-id>')
          .replace(/(bearer|token|password|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/ig, '$1=<redacted>');
}

function redactForLog(o, depth = 0) {
  if (depth > 6 || o == null) return o;
  if (typeof o === 'string') return redact(o);
  if (typeof o !== 'object') return o;
  if (Array.isArray(o)) return o.slice(0, 4).map((v) => redactForLog(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (/api[_-]?key|secret|password|token/i.test(k)) { out[k] = '<redacted>'; continue; }
    out[k] = redactForLog(v, depth + 1);
  }
  return out;
}

function collectKeysDeep(o, prefix = '', into = new Set(), maxDepth = 6, depth = 0) {
  if (depth > maxDepth || o == null || typeof o !== 'object') return into;
  if (Array.isArray(o)) {
    into.add(`${prefix}[]`);
    if (o.length > 0) collectKeysDeep(o[0], `${prefix}[]`, into, maxDepth, depth + 1);
    return into;
  }
  for (const [k, v] of Object.entries(o)) {
    const path = prefix ? `${prefix}.${k}` : k;
    into.add(path);
    if (v != null && typeof v === 'object') collectKeysDeep(v, path, into, maxDepth, depth + 1);
  }
  return into;
}

async function listHeartbeatRuns(request, companyId, agentId) {
  const p = `/api/companies/${encodeURIComponent(companyId)}/heartbeat-runs?agentId=${encodeURIComponent(agentId)}`;
  const payload = await request('GET', p);
  const runs = unwrapList(payload, ['heartbeatRuns', 'runs', 'items']);
  return Array.isArray(runs) ? runs : [];
}

async function listAllHeartbeatRuns(request, companyId) {
  const payload = await request('GET', `/api/companies/${encodeURIComponent(companyId)}/heartbeat-runs?limit=200`);
  const runs = unwrapList(payload, ['heartbeatRuns', 'runs', 'items']);
  return Array.isArray(runs) ? runs : [];
}

async function getAgentDetail(request, agentId) {
  return await request('GET', `/api/agents/${encodeURIComponent(agentId)}`);
}

function extractWakeRelatedFields(agent) {
  const out = {};
  if (!agent || typeof agent !== 'object') return out;
  for (const [k, v] of Object.entries(agent)) {
    if (/(wake|count|heartbeat|invoke)/i.test(k)) out[k] = typeof v === 'string' ? redact(v) : v;
  }
  return out;
}

(async () => {
  const env = loadEnv();
  if (!env.PAPERCLIP_EMAIL || !env.PAPERCLIP_PASSWORD) {
    console.error(JSON.stringify({ status: 'NO_AUTH' }));
    process.exit(1);
  }
  const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
  const DEFAULT_BASE_URL = 'http://127.0.0.1:43131';
  const DEFAULT_ORIGIN = 'https://paperclip.oysana.com';
  const request = await makeBoardClient({
    baseUrl: env.PAPERCLIP_BASE_URL || DEFAULT_BASE_URL,
    origin: env.PAPERCLIP_ORIGIN || DEFAULT_ORIGIN,
    email: env.PAPERCLIP_EMAIL,
    password: env.PAPERCLIP_PASSWORD,
  });
  const discovery = await discoverCanonicalAgents(contract, request);
  const target = discovery.found[PROBE_AGENT];
  if (!target) {
    console.error(JSON.stringify({ status: 'TARGET_NOT_FOUND', target: PROBE_AGENT }));
    process.exit(2);
  }

  const out = {
    status: 'OK',
    target: PROBE_AGENT,
    target_agent_id_prefix: redactId(target.id),
    steps: {},
  };

  // Step 1: BEFORE — full agent readback
  const before = await getAgentDetail(request, target.id);
  out.steps.before_agent_keys = Object.keys(before).sort();
  out.steps.before_wake_related = extractWakeRelatedFields(before);
  out.steps.before_status = before.status;
  out.steps.before_pausedAt = before.pausedAt;
  out.steps.before_adapterType = before.adapterType;
  out.steps.before_adapterProvider = before.adapterConfig && before.adapterConfig.provider;
  out.steps.before_adapterModel = before.adapterConfig && before.adapterConfig.model;

  // Step 2: BEFORE — list heartbeat-runs (per-agent) and (all)
  const beforeRunsAgent = await listHeartbeatRuns(request, discovery.companyId, target.id);
  const beforeRunsAll = await listAllHeartbeatRuns(request, discovery.companyId);
  out.steps.before_runs_agent_count = beforeRunsAgent.length;
  out.steps.before_runs_all_count = beforeRunsAll.length;
  out.steps.before_runs_agent_newest = beforeRunsAgent.length > 0 ? {
    id_prefix: redactId(beforeRunsAgent[0].id || beforeRunsAgent[0].runId),
    status: beforeRunsAgent[0].status,
    startedAt: beforeRunsAgent[0].startedAt || beforeRunsAgent[0].createdAt,
    agentId_prefix: beforeRunsAgent[0].agentId ? redactId(beforeRunsAgent[0].agentId) : null,
  } : null;
  out.steps.before_runs_agent_keys = beforeRunsAgent.length > 0 ? Object.keys(beforeRunsAgent[0]).sort() : [];

  // Step 3: INVOKE
  let invokeResponse = null;
  let invokeHttpStatus = null;
  let invokeError = null;
  let runId = null;
  try {
    invokeResponse = await request('POST', `/api/agents/${encodeURIComponent(target.id)}/heartbeat/invoke`, {
      reason: 'm015-s03-t09-boundary-probe',
      prompt: `bounded non-business diagnostic heartbeat for ${PROBE_AGENT}. Produce a JSON-only response shaped exactly as {"resultJson": {"bos": {"schemaVersion": "bos-light-v1", "runId": "<this run id>", "division": "${PROBE_AGENT}", "role": "<your agent role>", "status": "succeeded"}}}. Do NOT mutate any business state — diagnostic only.`,
      metadata: { schema_version: 'bos-light-v1', expected_result_json: 'bos', division: PROBE_AGENT, non_business: true, probe: 't09-boundary' },
    });
    invokeHttpStatus = 200;
    runId = invokeResponse && (invokeResponse.id || (invokeResponse.run && invokeResponse.run.id));
  } catch (e) {
    invokeError = redact(String(e && e.message || e)).slice(0, 400);
    const m = /HTTP\s+(\d+)/.exec(invokeError);
    invokeHttpStatus = m ? Number(m[1]) : 0;
  }
  out.steps.invoke_http_status = invokeHttpStatus;
  out.steps.invoke_run_id_prefix = runId ? redactId(runId) : null;
  out.steps.invoke_error = invokeError;
  out.steps.invoke_response_keys = invokeResponse && typeof invokeResponse === 'object' ? Object.keys(invokeResponse).sort() : null;
  out.steps.invoke_contextSnapshot_keys = invokeResponse && invokeResponse.contextSnapshot && typeof invokeResponse.contextSnapshot === 'object' ? Object.keys(invokeResponse.contextSnapshot).sort() : null;

  // Step 4: POLL for terminal
  let pollTerminal = null;
  let pollAttempts = 0;
  let pollFinalPayload = null;
  if (runId) {
    for (let attempt = 1; attempt <= POLL_BUDGET; attempt++) {
      pollAttempts = attempt;
      if (attempt > 1) await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      try {
        const p = await request('GET', `/api/heartbeat-runs/${encodeURIComponent(runId)}`);
        pollFinalPayload = p;
        const status = p && typeof p.status === 'string' ? p.status.toLowerCase() : null;
        if (status && ['succeeded', 'failed', 'cancelled', 'expired', 'timed_out'].includes(status)) {
          pollTerminal = status;
          break;
        }
      } catch (e) {
        // transient poll error — keep trying
      }
    }
  }
  out.steps.poll_attempts = pollAttempts;
  out.steps.poll_terminal = pollTerminal;
  out.steps.poll_final_status = pollFinalPayload && pollFinalPayload.status;
  out.steps.poll_final_resultJson_keys = pollFinalPayload && pollFinalPayload.resultJson ? Object.keys(pollFinalPayload.resultJson).sort() : null;
  out.steps.poll_final_contextSnapshot_keys = pollFinalPayload && pollFinalPayload.contextSnapshot ? Object.keys(pollFinalPayload.contextSnapshot).sort() : null;
  out.steps.poll_final_all_keys = pollFinalPayload && typeof pollFinalPayload === 'object' ? Object.keys(pollFinalPayload).sort() : null;

  // Step 5: AFTER — agent readback (compare wake-related fields)
  const after = await getAgentDetail(request, target.id);
  out.steps.after_wake_related = extractWakeRelatedFields(after);
  out.steps.after_status = after.status;
  out.steps.after_pausedAt = after.pausedAt;
  const wakeRelatedDiffs = {};
  for (const k of new Set([...Object.keys(out.steps.before_wake_related), ...Object.keys(out.steps.after_wake_related)])) {
    const b = out.steps.before_wake_related[k];
    const a = out.steps.after_wake_related[k];
    if (JSON.stringify(b) !== JSON.stringify(a)) wakeRelatedDiffs[k] = { before: b, after: a };
  }
  out.steps.wake_related_diffs = wakeRelatedDiffs;

  // Step 6: AFTER — list immediately
  const afterRunsAgent = await listHeartbeatRuns(request, discovery.companyId, target.id);
  const afterRunsAll = await listAllHeartbeatRuns(request, discovery.companyId);
  out.steps.after_runs_agent_count = afterRunsAgent.length;
  out.steps.after_runs_all_count = afterRunsAll.length;
  out.steps.after_runs_agent_delta = afterRunsAgent.length - beforeRunsAgent.length;
  out.steps.after_runs_all_delta = afterRunsAll.length - beforeRunsAll.length;

  // Step 7: settle wait then list again
  await new Promise((r) => setTimeout(r, POST_INVOKE_SETTLE_MS));
  const settledRunsAgent = await listHeartbeatRuns(request, discovery.companyId, target.id);
  const settledRunsAll = await listAllHeartbeatRuns(request, discovery.companyId);
  out.steps.settled_runs_agent_count = settledRunsAgent.length;
  out.steps.settled_runs_all_count = settledRunsAll.length;
  out.steps.settled_runs_agent_delta = settledRunsAgent.length - beforeRunsAgent.length;
  out.steps.settled_runs_all_delta = settledRunsAll.length - beforeRunsAll.length;

  // Step 8: full resultJson tree shape (keys only, no values)
  const rj = pollFinalPayload && pollFinalPayload.resultJson;
  if (rj && typeof rj === 'object') {
    const keySet = collectKeysDeep(rj, 'resultJson');
    out.steps.resultJson_key_paths = Array.from(keySet).sort();
  } else {
    out.steps.resultJson_key_paths = null;
  }

  // Step 9: dump full poll payload keys (no values) for forensics
  if (pollFinalPayload) {
    const keySet = collectKeysDeep(pollFinalPayload, '$');
    out.steps.poll_payload_key_paths = Array.from(keySet).sort();
  }

  console.log(JSON.stringify(redactForLog(out), null, 2));
})().catch((err) => {
  console.error(JSON.stringify({ status: 'ERROR', reason: redact(String(err && err.message || err)).slice(0, 500) }));
  process.exit(2);
});