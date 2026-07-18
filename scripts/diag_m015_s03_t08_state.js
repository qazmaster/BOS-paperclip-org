#!/usr/bin/env node
'use strict';
/**
 * scripts/diag_m015_s03_t08_state.js
 *
 * Read-only diagnostic for T08. Does NOT mutate heartbeat state.
 * Authenticates against the live Paperclip board, lists the seven canonical
 * division agents, and for each one fetches the heartbeat-runs listing to
 * determine whether any agent currently has a non-terminal (running/queued)
 * run that would cause POST /heartbeat/invoke to return HTTP 409.
 *
 * Output: stdout JSON only. No evidence file written (read-only).
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
} = require('./probe_m015_seven_agent_environment');

const ROOT = path.resolve(__dirname, '..');
const CONTRACT_PATH = path.join(ROOT, 'runtime-evidence/M015-S01-seven-agent-target-contract.json');
const DEFAULT_BASE_URL = 'http://127.0.0.1:43131';
const DEFAULT_ORIGIN = 'https://paperclip.oysana.com';

function safeLen(o) { return Array.isArray(o) ? o.length : 0; }

async function listHeartbeatRuns(request, companyId, agentId) {
  const path = `/api/companies/${encodeURIComponent(companyId)}/heartbeat-runs?agentId=${encodeURIComponent(agentId)}`;
  const payload = await request('GET', path);
  const runs = unwrapList(payload, ['heartbeatRuns', 'runs', 'items']);
  return runs || [];
}

(async () => {
  const env = loadEnv();
  if (!env.PAPERCLIP_EMAIL || !env.PAPERCLIP_PASSWORD) {
    console.error(JSON.stringify({ status: 'NO_AUTH', reason: 'PAPERCLIP_EMAIL/PAPERCLIP_PASSWORD missing' }));
    process.exit(1);
  }
  const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
  const request = await makeBoardClient({
    baseUrl: env.PAPERCLIP_BASE_URL || DEFAULT_BASE_URL,
    origin: env.PAPERCLIP_ORIGIN || DEFAULT_ORIGIN,
    email: env.PAPERCLIP_EMAIL,
    password: env.PAPERCLIP_PASSWORD,
  });
  const discovery = await discoverCanonicalAgents(contract, request);
  const out = {
    status: 'OK',
    company: contract.company,
    company_id_prefix: discovery.companyId ? String(discovery.companyId).slice(0, 8) + '-<redacted>' : null,
    agents_total: discovery.byName.size,
    per_agent: {},
  };
  for (const name of CANONICAL_DIVISION_NAMES) {
    const meta = discovery.found[name];
    if (!meta) {
      out.per_agent[name] = { present: false };
      continue;
    }
    let runs = [];
    try { runs = await listHeartbeatRuns(request, discovery.companyId, meta.id); }
    catch (e) { out.per_agent[name] = { present: true, list_error: String(e && e.message).slice(0, 200) }; continue; }
    const statuses = {};
    const non_terminal = [];
    let newest_started_at = null;
    let newest_status = null;
    let newest_run_id_prefix = null;
    for (const r of runs) {
      const s = (r && typeof r.status === 'string') ? r.status.toLowerCase() : 'unknown';
      statuses[s] = (statuses[s] || 0) + 1;
      if (!['succeeded', 'failed', 'cancelled', 'expired', 'timed_out'].includes(s)) {
        non_terminal.push(s);
      }
      const started = r && (r.startedAt || r.createdAt);
      if (started && (!newest_started_at || started > newest_started_at)) {
        newest_started_at = started;
        newest_status = s;
        newest_run_id_prefix = (r.id || r.runId) ? String(r.id || r.runId).slice(0, 8) + '-<redacted>' : null;
      }
    }
    out.per_agent[name] = {
      present: true,
      agent_id_prefix: meta.id ? String(meta.id).slice(0, 8) + '-<redacted>' : null,
      role: meta.role || null,
      total_runs: runs.length,
      status_distribution: statuses,
      has_non_terminal: non_terminal.length > 0,
      non_terminal_statuses: non_terminal,
      newest_run: {
        started_at: newest_started_at,
        status: newest_status,
        run_id_prefix: newest_run_id_prefix,
      },
    };
  }
  console.log(JSON.stringify(out, null, 2));
})().catch((err) => {
  console.error(JSON.stringify({ status: 'ERROR', reason: String(err && err.message || err).slice(0, 500) }));
  process.exit(2);
});