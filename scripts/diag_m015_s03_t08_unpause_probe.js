#!/usr/bin/env node
'use strict';
/**
 * scripts/diag_m015_s03_t08_unpause_probe.js
 *
 * T08 remediation probe — tests different PATCH body shapes on Div7.MissionControl
 * to identify which one flips status from "paused" to "idle"/"active". The
 * goal is a minimal PATCH that only changes the agent state without touching
 * adapterConfig, title, reportsTo, or instructions.
 *
 * Three attempts (each separately confirmed by GET /api/agents/{id}):
 *   A) { status: 'idle' }
 *   B) { livenessState: 'active' }
 *   C) { status: 'active' }
 *
 * Stops at the first attempt that flips the status. Logs each attempt's
 * pre/post status to stdout. Does NOT write runtime-evidence.
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
  const div7 = discovery.found['Div7.MissionControl'];
  if (!div7) { console.error(JSON.stringify({ status: 'NO_DIV7' })); process.exit(1); }

  async function getCurrentStatus() {
    const detail = await request('GET', `/api/agents/${encodeURIComponent(div7.id)}`);
    return {
      status: detail.status,
      pausedAt: detail.pausedAt,
      adapterType: detail.adapterType,
      provider: detail.adapterConfig && detail.adapterConfig.provider,
      model: detail.adapterConfig && detail.adapterConfig.model,
    };
  }

  const before = await getCurrentStatus();
  const out = {
    initial: before,
    attempts: [],
    final: null,
    flipped: false,
  };

  // Try PATCH shapes
  const candidates = [
    { name: 'A_status_idle', body: { status: 'idle' } },
    { name: 'B_livenessState_active', body: { livenessState: 'active' } },
    { name: 'C_status_active', body: { status: 'active' } },
  ];

  for (const cand of candidates) {
    let patchResult = null;
    let patchErr = null;
    try {
      patchResult = await request('PATCH', `/api/agents/${encodeURIComponent(div7.id)}`, cand.body);
    } catch (e) {
      patchErr = redact(String(e && e.message || e)).slice(0, 500);
    }
    let after = null;
    try { after = await getCurrentStatus(); } catch (e) {
      after = { readback_error: redact(String(e && e.message || e)).slice(0, 200) };
    }
    const attempt = {
      name: cand.name,
      body: cand.body,
      patch_response_keys: patchResult && typeof patchResult === 'object' ? Object.keys(patchResult).sort() : null,
      patch_error: patchErr,
      post_status: after.status,
      post_pausedAt: after.pausedAt,
      status_changed: before.status !== (after.status || null),
    };
    out.attempts.push(attempt);
    if (after.status && after.status !== 'paused') {
      out.flipped = true;
      out.final = after;
      break;
    }
  }

  if (!out.flipped) {
    out.final = await getCurrentStatus();
  }
  console.log(JSON.stringify(out, null, 2));
})().catch((err) => {
  console.error(JSON.stringify({ status: 'ERROR', reason: redact(String(err && err.message || err)).slice(0, 500) }));
  process.exit(2);
});