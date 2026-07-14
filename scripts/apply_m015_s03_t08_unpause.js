#!/usr/bin/env node
'use strict';
/**
 * scripts/apply_m015_s03_t08_unpause.js
 *
 * T08 bounded remediation: flips each canonical division agent whose
 * current `status === "paused"` to `"idle"` via PATCH /api/agents/{id} with
 * a minimal body of `{ status: "idle" }`. This is a Paperclip-supported
 * admin operation that does NOT touch adapterConfig, title, reportsTo, or
 * instructions — the existing S01/S02 contract (hermes_local + minimax +
 * MiniMax-M3) is preserved verbatim. Verified by reading back
 * GET /api/agents/{id} after each PATCH.
 *
 * Output:
 *   - bounded per-agent PATCH/GET trace to stdout
 *   - bounded JSON to runtime-evidence/M015-S03-t08-unpause-journal.json
 *
 * Failure modes:
 *   - AUTH/companies-missing → fail-closed, exit 2
 *   - canonical-agent-missing → fail-closed, exit 2
 *   - any individual PATCH that fails to flip status → recorded, but the
 *     loop continues so the journal captures the full state. Final
 *     M015_T08_UNPAUSE=all_ok exit 0 only if every paused canonical agent
 *     flipped to non-paused.
 */

const fs = require('fs');
const path = require('path');
const {
  loadEnv,
  makeBoardClient,
  unwrapList,
  redactError,
} = require('./apply_m015_seven_agent_contract');
const {
  CANONICAL_DIVISION_NAMES,
  discoverCanonicalAgents,
  UUID_FULL,
} = require('./probe_m015_seven_agent_environment');

const ROOT = path.resolve(__dirname, '..');
const CONTRACT_PATH = path.join(ROOT, 'runtime-evidence/M015-S01-seven-agent-target-contract.json');
const OUTPUT_PATH = path.join(ROOT, 'runtime-evidence/M015-S03-t08-unpause-journal.json');
const DEFAULT_BASE_URL = 'http://127.0.0.1:43131';
const DEFAULT_ORIGIN = 'https://paperclip.oysana.com';

const ALLOWED_PRE_STATUSES = new Set(['paused', 'idle', 'active']);

function redactId(s) {
  if (typeof s !== 'string') return s;
  return UUID_FULL.test(s) ? s.slice(0, 8) + '-<redacted>' : s;
}

function redact(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/ig, '<redacted-id>')
          .replace(/(bearer|token|password|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/ig, '$1=<redacted>');
}

function redactForJournal(o, depth = 0) {
  if (depth > 4 || o == null) return o;
  if (typeof o === 'string') return redact(o);
  if (typeof o !== 'object') return o;
  if (Array.isArray(o)) return o.slice(0, 8).map((v) => redactForJournal(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (/api[_-]?key|secret|password|token/i.test(k)) { out[k] = '<redacted>'; continue; }
    out[k] = redactForJournal(v, depth + 1);
  }
  return out;
}

async function getAgentDetail(request, agentId) {
  return await request('GET', `/api/agents/${encodeURIComponent(agentId)}`);
}

(async () => {
  const env = loadEnv();
  if (!env.PAPERCLIP_EMAIL || !env.PAPERCLIP_PASSWORD) {
    console.error(JSON.stringify({ status: 'NO_AUTH' })); process.exit(2);
  }
  const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
  const request = await makeBoardClient({
    baseUrl: env.PAPERCLIP_BASE_URL || DEFAULT_BASE_URL,
    origin: env.PAPERCLIP_ORIGIN || DEFAULT_ORIGIN,
    email: env.PAPERCLIP_EMAIL,
    password: env.PAPERCLIP_PASSWORD,
  });
  const discovery = await discoverCanonicalAgents(contract, request);
  const startedAt = Date.now();
  const journal = [];
  let missing = [];
  for (const name of CANONICAL_DIVISION_NAMES) {
    if (!discovery.found[name]) missing.push(name);
  }
  if (missing.length) {
    const failure = {
      $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s03-t08-unpause-journal.v1.json',
      milestone: 'M015-4o8lfw', slice: 'S03', task: 'T08',
      generated: new Date().toISOString(),
      status: 'FAIL_CLOSED',
      reason: `canonical agents missing from roster: ${missing.join(', ')}`,
      missing_canonical: missing,
      redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false },
    };
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(failure, null, 2) + '\n');
    console.error(JSON.stringify({ status: 'MISSING_CANONICAL', missing }));
    process.exit(2);
  }

  for (const name of CANONICAL_DIVISION_NAMES) {
    const meta = discovery.found[name];
    const trace = { name, agent_id_prefix: redactId(meta.id) };
    let detail = null;
    try { detail = await getAgentDetail(request, meta.id); }
    catch (e) { trace.readback_error = redactError(e); journal.push(trace); continue; }
    const preStatus = (detail.status || '').toString().toLowerCase();
    trace.pre_status = preStatus;
    trace.adapter_type = detail.adapterType;
    trace.adapter_provider = detail.adapterConfig && detail.adapterConfig.provider;
    trace.adapter_model = detail.adapterConfig && detail.adapterConfig.model;
    trace.pre_pausedAt = detail.pausedAt;

    if (preStatus !== 'paused') {
      trace.action = 'no-op';
      trace.post_status = preStatus;
      trace.flipped = false;
      trace.skip_reason = preStatus ? `already ${preStatus}` : 'unknown pre_status';
      journal.push(trace);
      continue;
    }

    let patchResult = null;
    let patchErr = null;
    try {
      patchResult = await request('PATCH', `/api/agents/${encodeURIComponent(meta.id)}`, { status: 'idle' });
    } catch (e) {
      patchErr = redactError(e);
    }
    trace.patch_response_keys = patchResult && typeof patchResult === 'object' ? Object.keys(patchResult).sort() : null;
    trace.patch_error = patchErr;

    let postDetail = null;
    try { postDetail = await getAgentDetail(request, meta.id); }
    catch (e) { trace.post_readback_error = redactError(e); journal.push(trace); continue; }
    trace.post_status = (postDetail.status || '').toString().toLowerCase();
    trace.post_pausedAt = postDetail.pausedAt;
    trace.post_adapter_type = postDetail.adapterType;
    trace.post_adapter_provider = postDetail.adapterConfig && postDetail.adapterConfig.provider;
    trace.post_adapter_model = postDetail.adapterConfig && postDetail.adapterConfig.model;
    trace.flipped = trace.post_status !== 'paused';
    trace.adapter_config_preserved = (
      trace.adapter_type === trace.post_adapter_type &&
      trace.adapter_provider === trace.post_adapter_provider &&
      trace.adapter_model === trace.post_adapter_model
    );
    trace.action = trace.flipped ? 'unpaused' : 'still-paused';
    journal.push(trace);
  }

  const flippedCount = journal.filter((j) => j.flipped).length;
  const noOpCount = journal.filter((j) => j.action === 'no-op').length;
  const stillPaused = journal.filter((j) => j.post_status === 'paused').map((j) => j.name);
  const adapterDrift = journal.filter((j) => j.flipped && j.adapter_config_preserved === false).map((j) => j.name);

  const ok = (stillPaused.length === 0) && (missing.length === 0) && (adapterDrift.length === 0);
  const summary = {
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s03-t08-unpause-journal.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S03',
    task: 'T08',
    generated: new Date().toISOString(),
    status: ok ? 'PASS' : 'FAIL_CLOSED',
    company: contract.company,
    company_id_prefix: redactId(discovery.companyId),
    expected_count: CANONICAL_DIVISION_NAMES.length,
    flipped_count: flippedCount,
    no_op_count: noOpCount,
    still_paused: stillPaused,
    adapter_config_drift: adapterDrift,
    missing_canonical: missing,
    operation_journal: journal,
    redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false },
    elapsed_ms: Date.now() - startedAt,
  };
  const scrubbed = redactForJournal(summary);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(scrubbed, null, 2) + '\n');
  process.stdout.write(`M015_T08_UNPAUSE=${ok ? 'all_ok' : 'partial'} flipped=${flippedCount} no_op=${noOpCount} still_paused=${stillPaused.length} adapter_drift=${adapterDrift.length}\n`);
  process.stdout.write(`--journal: ${OUTPUT_PATH}\n`);
  process.exit(ok ? 0 : 2);
})().catch((err) => {
  console.error(JSON.stringify({ status: 'ERROR', reason: redact(String(err && err.message || err)).slice(0, 500) }));
  process.exit(2);
});