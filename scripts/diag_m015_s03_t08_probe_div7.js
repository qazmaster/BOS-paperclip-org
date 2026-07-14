#!/usr/bin/env node
'use strict';
/**
 * scripts/diag_m015_s03_t08_probe_div7.js
 *
 * Read-and-single-invoke diagnostic: tests POST /api/agents/{id}/heartbeat/invoke
 * on Div7.MissionControl with the EXACT body shape used by T02, to surface
 * the live response and reproduce the HTTP 409 observed in the chained T02.
 *
 * Writes a redacted, bounded trace to stdout. Does NOT write runtime-evidence.
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

const NON_BUSINESS_PROMPT_PREFIX = 'bounded non-business diagnostic heartbeat';

function redactString(value) {
  if (typeof value !== 'string') return value;
  if (UUID_FULL.test(value)) return value.slice(0, 8) + '-<redacted>';
  return value;
}

function redactObject(o, depth = 0) {
  if (depth > 6) return '<truncated>';
  if (o == null) return o;
  if (typeof o === 'string') return redactString(o);
  if (typeof o !== 'object') return o;
  if (Array.isArray(o)) return o.slice(0, 8).map((v) => redactObject(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (/api[_-]?key|secret|password|token/i.test(k)) { out[k] = '<redacted>'; continue; }
    out[k] = redactObject(v, depth + 1);
  }
  return out;
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
  const div7 = discovery.found['Div7.MissionControl'];
  if (!div7) { console.error(JSON.stringify({ status: 'NO_DIV7' })); process.exit(1); }

  // Read agent detail
  let agentDetail = null;
  try {
    agentDetail = await request('GET', `/api/agents/${encodeURIComponent(div7.id)}`);
  } catch (e) {
    console.error(JSON.stringify({ status: 'AGENT_READ_FAIL', reason: String(e.message).slice(0, 300) }));
    process.exit(1);
  }

  // Build the same invoke body T02 uses
  const invokeBody = {
    reason: 'm015-s03-diagnostic-heartbeat',
    prompt: `${NON_BUSINESS_PROMPT_PREFIX} for Div7.MissionControl; report Paperclip context (division, role, status); no business mutations`,
    metadata: {
      schema_version: 'bos-light-v1',
      expected_result_json: 'bos',
      selected_path: 'm015-s03-diagnostic',
      division: 'Div7.MissionControl',
      non_business: true,
    },
  };

  // Make a LOW-LEVEL request so we can capture both the HTTP status and the body
  // without makeBoardClient swallowing non-2xx as an exception. We re-use the
  // session cookie by going through makeBoardClient's internal helper if exposed;
  // otherwise we make a fresh fetch with the cookie captured from the wrapper.
  let invokeHttpStatus = 0;
  let invokeResponseText = '';
  let invokeResponseJson = null;
  try {
    invokeResponseJson = await request('POST', `/api/agents/${encodeURIComponent(div7.id)}/heartbeat/invoke`, invokeBody);
    invokeHttpStatus = 200;
  } catch (e) {
    const msg = String(e && e.message || e);
    const m = /HTTP\s+(\d+)/.exec(msg);
    invokeHttpStatus = m ? Number(m[1]) : 0;
    // Try to extract body from message
    const bodyMatch = /body=(.+)$/s.exec(msg);
    if (bodyMatch) {
      invokeResponseText = bodyMatch[1];
      try { invokeResponseJson = JSON.parse(invokeResponseText); } catch (_) {}
    }
  }

  const out = {
    agent: {
      name: 'Div7.MissionControl',
      agent_id_prefix: String(div7.id).slice(0, 8) + '-<redacted>',
      role: div7.role || null,
      adapter_type: agentDetail && agentDetail.adapterType,
      adapter_config_redacted: agentDetail && agentDetail.adapterConfig
        ? Object.keys(agentDetail.adapterConfig).sort()
        : null,
      liveness_state: agentDetail && (agentDetail.livenessState || agentDetail.liveness_state),
    },
    invoke: {
      http_status: invokeHttpStatus,
      body_shape: invokeResponseJson && typeof invokeResponseJson === 'object'
        ? Object.keys(invokeResponseJson).sort()
        : null,
      body_redacted: redactObject(invokeResponseJson),
      error_message: invokeHttpStatus >= 300 ? invokeResponseText.slice(0, 500) : null,
    },
  };
  console.log(JSON.stringify(out, null, 2));
})().catch((err) => {
  console.error(JSON.stringify({ status: 'ERROR', reason: String(err && err.message || err).slice(0, 500) }));
  process.exit(2);
});