#!/usr/bin/env node
'use strict';
/**
 * scripts/diag_m015_s03_t08_inspect_resultjson.js
 *
 * Inspects the resultJson structure of the newest heartbeat run for Div7.MissionControl
 * (or any other canonical agent). Helps T08 determine WHY resultJson.bos is null
 * despite the explicit bos-light-v1 schema instruction in the prompt.
 *
 * Output: stdout JSON describing the resultJson shape (with redaction).
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
const DEFAULT_BASE_URL = 'http://127.0.0.1:43131';
const DEFAULT_ORIGIN = 'https://paperclip.oysana.com';

function redact(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/ig, '<redacted-id>')
          .replace(/(bearer|token|password|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/ig, '$1=<redacted>');
}

function redactRunId(v) {
  if (typeof v !== 'string') return null;
  return v.length > 0 ? v.slice(0, 8) + '-<redacted>' : null;
}

async function fetchFullRun(request, runId) {
  return await request('GET', `/api/heartbeat-runs/${encodeURIComponent(runId)}`);
}

(async () => {
  const env = loadEnv();
  if (!env.PAPERCLIP_EMAIL || !env.PAPERCLIP_PASSWORD) {
    console.error(JSON.stringify({ status: 'NO_AUTH' })); process.exit(1);
  }
  const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
  const request = await makeBoardClient({
    baseUrl: env.PAPERCLIP_BASE_URL || DEFAULT_BASE_URL,
    origin: env.PAPERCLIP_ORIGIN || DEFAULT_ORIGIN,
    email: env.PAPERCLIP_EMAIL,
    password: env.PAPERCLIP_PASSWORD,
  });
  const discovery = await discoverCanonicalAgents(contract, request);
  const targetName = process.env.M015_INSPECT_AGENT || 'Div7.MissionControl';
  const meta = discovery.found[targetName];
  if (!meta) { console.error(JSON.stringify({ status: 'NO_AGENT', target: targetName })); process.exit(1); }

  // List newest runs
  const listPath = `/api/companies/${encodeURIComponent(discovery.companyId)}/heartbeat-runs?agentId=${encodeURIComponent(meta.id)}`;
  const listRes = await request('GET', listPath);
  const runs = unwrapList(listRes, ['heartbeatRuns', 'runs', 'items']) || [];

  const out = {
    target: targetName,
    total_runs: runs.length,
    newest: [],
  };

  // Inspect top 3 newest runs (by startedAt)
  const sorted = runs.slice().sort((a, b) => {
    const aT = a && (a.startedAt || a.createdAt || '');
    const bT = b && (b.startedAt || b.createdAt || '');
    return (bT || '').localeCompare(aT || '');
  });

  for (const r of sorted.slice(0, 3)) {
    const runId = r && r.id;
    const summary = {
      run_id_prefix: redactRunId(runId),
      started_at: r && r.startedAt,
      finished_at: r && r.finishedAt,
      status: r && r.status,
      resultJson_type: r && r.resultJson == null ? 'null' : typeof r.resultJson,
      resultJson_keys: r && r.resultJson && typeof r.resultJson === 'object' ? Object.keys(r.resultJson) : null,
      resultJson_first_500: typeof r.resultJson === 'string'
        ? redact(r.resultJson).slice(0, 500)
        : (r && r.resultJson ? JSON.stringify(r.resultJson).slice(0, 500) : null),
    };
    out.newest.push(summary);

    // Also fetch full detail via /api/heartbeat-runs/{runId} for fresh readback
    if (runId) {
      try {
        const full = await fetchFullRun(request, runId);
        out.newest[out.newest.length - 1].full_status = full && full.status;
        out.newest[out.newest.length - 1].full_resultJson_type = full && full.resultJson == null ? 'null' : typeof full.resultJson;
        out.newest[out.newest.length - 1].full_resultJson_keys = full && full.resultJson && typeof full.resultJson === 'object' ? Object.keys(full.resultJson) : null;
        out.newest[out.newest.length - 1].full_resultJson_first_500 = typeof full.resultJson === 'string'
          ? redact(full.resultJson).slice(0, 500)
          : (full && full.resultJson ? JSON.stringify(full.resultJson).slice(0, 500) : null);
      } catch (e) {
        out.newest[out.newest.length - 1].full_error = redact(String(e && e.message || e)).slice(0, 200);
      }
    }
  }

  console.log(JSON.stringify(out, null, 2));
})().catch((err) => {
  console.error(JSON.stringify({ status: 'ERROR', reason: redact(String(err && err.message || err)).slice(0, 500) }));
  process.exit(2);
});