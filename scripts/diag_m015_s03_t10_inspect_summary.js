#!/usr/bin/env node
'use strict';
/**
 * scripts/diag_m015_s03_t10_inspect_summary.js
 *
 * T10 — Phase 2 probe: check whether the hermes_local/MiniMax-M3 model emits
 * the bos-light-v1 schema in the SUMMARY field (different from `result`).
 * The T10 inspection already proved the long-form `result` field contains
 * only reasoning traces (no parseable bos). The shorter `summary` field may
 * carry structured output. Read-only — no mutations.
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
  CREDENTIAL_ASSIGNMENT,
} = require('./probe_m015_seven_agent_environment');

const ROOT = path.resolve(__dirname, '..');
const CONTRACT_PATH = path.join(ROOT, 'runtime-evidence/M015-S01-seven-agent-target-contract.json');
const OUTPUT_PATH = path.join(ROOT, 'runtime-evidence/M015-S03-t10-summary-inspection.json');
const DEFAULT_BASE_URL = 'http://127.0.0.1:43131';
const DEFAULT_ORIGIN = 'https://paperclip.oysana.com';

function redact(s) {
  if (typeof s !== 'string') return s;
  return s.replace(UUID_FULL, '<redacted-id>')
          .replace(/\bbearer\s+[A-Za-z0-9._\-]+/gi, 'bearer=<redacted>')
          .replace(/sk-[A-Za-z0-9._\-]+/g, 'sk-<redacted>')
          .replace(/tp-[A-Za-z0-9._\-]+/g, 'tp-<redacted>')
          .replace(CREDENTIAL_ASSIGNMENT, '<redacted-credential-fragment>');
}

function tryParseBos(text) {
  if (typeof text !== 'string') return null;
  // 1. direct
  try {
    const p = JSON.parse(text);
    if (p && typeof p === 'object') {
      if (p.bos && typeof p.bos === 'object') return { kind: 'direct', bos: p.bos };
      if (p.resultJson && p.resultJson.bos) return { kind: 'direct_wrapped', bos: p.resultJson.bos };
    }
  } catch (_) { /* fall through */ }
  // 2. markdown fence
  const fenceRe = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/g;
  let m;
  while ((m = fenceRe.exec(text)) !== null) {
    try {
      const p = JSON.parse(m[1]);
      if (p && typeof p === 'object') {
        if (p.bos && typeof p.bos === 'object') return { kind: 'fenced', bos: p.bos };
        if (p.resultJson && p.resultJson.bos) return { kind: 'fenced_wrapped', bos: p.resultJson.bos };
      }
    } catch (_) { /* next */ }
  }
  return null;
}

function redactBos(b) {
  if (!b || typeof b !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(b)) {
    if (typeof v === 'string') {
      out[k] = UUID_FULL.test(v) ? '<redacted-id>' : v.length > 200 ? v.slice(0, 200) + '…' : v;
    } else {
      out[k] = v;
    }
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
  const out = {
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s03-t10-summary-inspection.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S03',
    task: 'T10',
    generated: new Date().toISOString(),
    purpose: 'Check whether the hermes_local/MiniMax-M3 model emits the bos-light-v1 schema in the summary field (separate from result).',
    agents: [],
  };

  let totalSucceeded = 0;
  let totalWithSummaryBos = 0;

  for (const name of CANONICAL_DIVISION_NAMES) {
    const meta = discovery.found[name];
    if (!meta) { out.agents.push({ name, status: 'NOT_FOUND' }); continue; }

    const listRes = await request('GET', `/api/companies/${encodeURIComponent(discovery.companyId)}/heartbeat-runs?agentId=${encodeURIComponent(meta.id)}`);
    const runs = unwrapList(listRes, ['heartbeatRuns', 'runs', 'items']) || [];
    const sorted = runs.slice().sort((a, b) => (b.startedAt || b.createdAt || '').localeCompare(a.startedAt || a.createdAt || ''));

    const succeeded = sorted.filter((r) => r && r.status === 'succeeded').slice(0, 2);
    const inspects = [];
    for (const r of succeeded) {
      const full = await request('GET', `/api/heartbeat-runs/${encodeURIComponent(r.id)}`);
      const rj = full && full.resultJson;
      const summary = rj && typeof rj === 'object' ? rj.summary : null;
      const summaryType = summary == null ? 'null' : typeof summary;
      const summaryText = typeof summary === 'string' ? summary : null;
      const bosExtraction = summaryText ? tryParseBos(summaryText) : null;
      if (bosExtraction) totalWithSummaryBos += 1;
      inspects.push({
        run_id_prefix: r.id.slice(0, 8) + '-<redacted>',
        status: full && full.status,
        summary_type: summaryType,
        summary_length: summaryText ? summaryText.length : 0,
        summary_first_500: summaryText ? redact(summaryText).slice(0, 500) : null,
        summary_tail: summaryText ? redact(summaryText.slice(-200)) : null,
        summary_bos_extraction: bosExtraction ? { kind: bosExtraction.kind, fields: Object.keys(bosExtraction.bos) } : null,
      });
      totalSucceeded += 1;
    }
    out.agents.push({ name, succeeded_inspected: inspects.length, runs: inspects });
  }

  out.summary = { total_succeeded_inspected: totalSucceeded, total_with_summary_bos: totalWithSummaryBos };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify(out.summary, null, 2));
})().catch((err) => {
  console.error(JSON.stringify({ status: 'ERROR', reason: redact(String(err && err.message || err)).slice(0, 500) }));
  process.exit(2);
});