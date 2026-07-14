#!/usr/bin/env node
'use strict';
/**
 * scripts/diag_m015_s03_t08_agent_status.js
 *
 * Read-only diagnostic that fetches the agent-level status field for each
 * of the seven canonical division agents (no mutations). Used to identify
 * which agents need to be unpaused before T02 chained diagnostic heartbeats
 * can succeed.
 *
 * Output: stdout JSON. Does NOT write runtime-evidence.
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
  const out = {
    company: contract.company,
    company_id_prefix: discovery.companyId ? String(discovery.companyId).slice(0, 8) + '-<redacted>' : null,
    per_agent: {},
  };
  for (const name of CANONICAL_DIVISION_NAMES) {
    const meta = discovery.found[name];
    if (!meta) {
      out.per_agent[name] = { present: false };
      continue;
    }
    let detail = null;
    let detailErr = null;
    try {
      detail = await request('GET', `/api/agents/${encodeURIComponent(meta.id)}`);
    } catch (e) {
      detailErr = redact(String(e && e.message || e)).slice(0, 300);
    }
    if (!detail) {
      out.per_agent[name] = { present: true, agent_id_prefix: String(meta.id).slice(0, 8) + '-<redacted>', detail_error: detailErr };
      continue;
    }
    // Surface every "state"-ish field — different API shapes use status, livenessState, agentStatus, etc.
    const candidateStatusFields = {};
    for (const k of Object.keys(detail).sort()) {
      if (/(status|state|liveness|active|enabled|paused|invokable|running)/i.test(k)) {
        let v = detail[k];
        if (typeof v === 'string' && UUID_FULL.test(v)) v = v.slice(0, 8) + '-<redacted>';
        candidateStatusFields[k] = v;
      }
    }
    out.per_agent[name] = {
      present: true,
      agent_id_prefix: String(meta.id).slice(0, 8) + '-<redacted>',
      adapter_type: detail.adapterType,
      adapter_provider: detail.adapterConfig && detail.adapterConfig.provider,
      adapter_model: detail.adapterConfig && detail.adapterConfig.model,
      role: detail.role,
      candidate_status_fields: candidateStatusFields,
    };
  }
  // Quick summary of paused/active
  const paused = [];
  const active = [];
  const unknown = [];
  for (const [name, info] of Object.entries(out.per_agent)) {
    if (!info.present) { unknown.push(name); continue; }
    const sf = info.candidate_status_fields || {};
    const status = (sf.status || sf.livenessState || sf.liveness_state || sf.agentStatus || sf.state || '').toString().toLowerCase();
    if (status === 'paused' || status === 'disabled' || status === 'inactive') paused.push(name);
    else if (status === 'active' || status === 'invokable' || status === 'ready') active.push(name);
    else unknown.push(name);
  }
  out.summary = { paused, active, unknown_state: unknown, total: CANONICAL_DIVISION_NAMES.length };
  console.log(JSON.stringify(out, null, 2));
})().catch((err) => {
  console.error(JSON.stringify({ status: 'ERROR', reason: redact(String(err && err.message || err)).slice(0, 500) }));
  process.exit(2);
});