#!/usr/bin/env node
'use strict';
/**
 * scripts/diag_m015_s03_t08_raw_probe.js
 *
 * Raw-fetch probe to capture FULL response (status, headers, body) of
 * POST /api/agents/{id}/heartbeat/invoke on Div7.MissionControl. Uses
 * makeBoardClient only to obtain the session cookie, then bypasses its
 * error-throwing wrapper so the live 409 body is preserved.
 *
 * Output: stdout JSON. Does NOT write runtime-evidence.
 */

const fs = require('fs');
const path = require('path');
const {
  loadEnv,
  makeBoardClient,
} = require('./apply_m015_seven_agent_contract');
const {
  discoverCanonicalAgents,
  UUID_FULL,
} = require('./probe_m015_seven_agent_environment');

const ROOT = path.resolve(__dirname, '..');
const CONTRACT_PATH = path.join(ROOT, 'runtime-evidence/M015-S01-seven-agent-target-contract.json');
const DEFAULT_BASE_URL = 'http://127.0.0.1:43131';
const DEFAULT_ORIGIN = 'https://paperclip.oysana.com';

const NON_BUSINESS_PROMPT_PREFIX = 'bounded non-business diagnostic heartbeat';

function safeStr(v) { return typeof v === 'string' ? v : (v == null ? null : JSON.stringify(v)); }
function redact(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/ig, '<redacted-id>')
          .replace(/(bearer|token|password|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/ig, '$1=<redacted>');
}

async function rawPost(baseUrl, origin, cookie, urlPath, body) {
  const url = new URL(urlPath, baseUrl);
  const response = await fetch(url, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', cookie, origin, referer: `${origin}/` },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch (_) { parsed = { _nonJson: true }; }
  const headers = {};
  response.headers.forEach((v, k) => { headers[k] = v; });
  return { status: response.status, headers, rawText: text, parsed };
}

async function rawGet(baseUrl, origin, cookie, urlPath) {
  const url = new URL(urlPath, baseUrl);
  const response = await fetch(url, {
    method: 'GET',
    headers: { accept: 'application/json', cookie, origin, referer: `${origin}/` },
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch (_) { parsed = { _nonJson: true }; }
  return { status: response.status, rawText: text, parsed };
}

(async () => {
  const env = loadEnv();
  if (!env.PAPERCLIP_EMAIL || !env.PAPERCLIP_PASSWORD) {
    console.error(JSON.stringify({ status: 'NO_AUTH' })); process.exit(1);
  }
  const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
  const baseUrl = env.PAPERCLIP_BASE_URL || DEFAULT_BASE_URL;
  const origin = env.PAPERCLIP_ORIGIN || DEFAULT_ORIGIN;

  // Sign in directly to capture cookie (avoid makeBoardClient wrapping)
  const authRes = await fetch(new URL('/api/auth/sign-in/email', baseUrl), {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', origin, referer: `${origin}/` },
    body: JSON.stringify({ email: env.PAPERCLIP_EMAIL, password: env.PAPERCLIP_PASSWORD }),
  });
  if (!authRes.ok) {
    console.error(JSON.stringify({ status: 'SIGNIN_FAIL', http: authRes.status, body: redact(await authRes.text()).slice(0, 500) }));
    process.exit(1);
  }
  const setCookie = typeof authRes.headers.getSetCookie === 'function' ? authRes.headers.getSetCookie() : [authRes.headers.get('set-cookie')].filter(Boolean);
  const cookie = setCookie.map((v) => String(v).split(';')[0]).filter(Boolean).join('; ');

  // Discover Div7
  const agentsRes = await rawGet(baseUrl, origin, cookie, '/api/companies');
  const companies = (agentsRes.parsed && (Array.isArray(agentsRes.parsed) ? agentsRes.parsed : (agentsRes.parsed.companies || agentsRes.parsed.items))) || [];
  const company = companies.find((c) => (c.issuePrefix || c.issue_prefix) === contract.company.issue_prefix);
  if (!company) { console.error(JSON.stringify({ status: 'NO_COMPANY', contract_company: contract.company })); process.exit(1); }
  const companyId = company.id;
  const agList = await rawGet(baseUrl, origin, cookie, `/api/companies/${encodeURIComponent(companyId)}/agents`);
  const agArr = (agList.parsed && (Array.isArray(agList.parsed) ? agList.parsed : (agList.parsed.agents || agList.parsed.items))) || [];
  const div7 = agArr.find((a) => a.name === 'Div7.MissionControl');
  if (!div7) { console.error(JSON.stringify({ status: 'NO_DIV7' })); process.exit(1); }

  // Read agent detail
  const agDetail = await rawGet(baseUrl, origin, cookie, `/api/agents/${encodeURIComponent(div7.id)}`);

  // Build the T02 invoke body verbatim
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

  // Raw POST — preserve full body on 409
  const invokeRes = await rawPost(baseUrl, origin, cookie, `/api/agents/${encodeURIComponent(div7.id)}/heartbeat/invoke`, invokeBody);

  // List heartbeat-runs again post-invoke to detect side-effect
  const runsList = await rawGet(baseUrl, origin, cookie, `/api/companies/${encodeURIComponent(companyId)}/heartbeat-runs?agentId=${encodeURIComponent(div7.id)}`);
  const runs = (runsList.parsed && (Array.isArray(runsList.parsed) ? runsList.parsed : (runsList.parsed.heartbeatRuns || runsList.parsed.runs || runsList.parsed.items))) || [];

  const out = {
    agent: {
      name: 'Div7.MissionControl',
      agent_id_prefix: String(div7.id).slice(0, 8) + '-<redacted>',
      role: div7.role || null,
      adapter_type: (agDetail.parsed && agDetail.parsed.adapterType) || null,
      adapter_config_redacted: agDetail.parsed && agDetail.parsed.adapterConfig
        ? Object.keys(agDetail.parsed.adapterConfig).sort()
        : null,
      liveness_state: agDetail.parsed && (agDetail.parsed.livenessState || agDetail.parsed.liveness_state),
    },
    invoke: {
      http_status: invokeRes.status,
      response_headers_subset: Object.fromEntries(Object.entries(invokeRes.headers).filter(([k]) => /^(content-type|x-|cf-|set-cookie)/i.test(k))),
      raw_body: redact(invokeRes.rawText).slice(0, 2000),
      parsed_body: invokeRes.parsed ? safeStr(invokeRes.parsed).slice(0, 1000) : null,
    },
    post_invoke_runs_count: runs.length,
    newest_run_status: runs.length ? (runs[0].status || 'unknown') : null,
  };
  console.log(JSON.stringify(out, null, 2));
})().catch((err) => {
  console.error(JSON.stringify({ status: 'ERROR', reason: redact(String(err && err.message || err)).slice(0, 800) }));
  process.exit(2);
});