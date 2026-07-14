#!/usr/bin/env node
'use strict';
/**
 * scripts/diag_m015_s03_t10_inspect.js
 *
 * M015-S03 / T10 — Read-only investigation of the actual semantics of the
 * Paperclip diagnostic heartbeat invoke/readback, particularly for the two
 * unfinished runs (Div1.HCO + Div7.MissionControl) flagged by T09.
 *
 * For each of the 7 canonical division agents:
 *   - Lists the newest 3 heartbeat runs (GET /api/companies/{id}/heartbeat-runs?agentId=...)
 *   - Fetches each run's full state (GET /api/heartbeat-runs/{runId})
 *   - Reports terminal_status, finishedAt, resultJson shape, and the first
 *     1500 chars of resultJson.result (with redaction)
 *   - Tests whether resultJson.result contains a parseable JSON object with
 *     .bos structure, including a markdown-fence-unwrapped variant.
 *
 * Output: stdout JSON describing the per-agent newest-run shape. No mutations.
 *
 * This script is the "investigate actual semantics" phase of T10. It does NOT
 * attempt to fix anything; it only diagnoses.
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
  XIAOMI_RE,
  CREDENTIAL_ASSIGNMENT,
} = require('./probe_m015_seven_agent_environment');

const ROOT = path.resolve(__dirname, '..');
const CONTRACT_PATH = path.join(ROOT, 'runtime-evidence/M015-S01-seven-agent-target-contract.json');
const OUTPUT_PATH = path.join(ROOT, 'runtime-evidence/M015-S03-t10-inspection.json');
const DEFAULT_BASE_URL = 'http://127.0.0.1:43131';
const DEFAULT_ORIGIN = 'https://paperclip.oysana.com';

const REDACTION_TAIL = 80;
const RESULT_PREVIEW_CHARS = 1500;

function redact(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(UUID_FULL, '<redacted-id>')
    .replace(/\bbearer\s+[A-Za-z0-9._\-]+/gi, 'bearer=<redacted>')
    .replace(/sk-[A-Za-z0-9._\-]+/g, 'sk-<redacted>')
    .replace(/tp-[A-Za-z0-9._\-]+/g, 'tp-<redacted>')
    .replace(CREDENTIAL_ASSIGNMENT, '<redacted-credential-fragment>');
}

function redactTail(s, maxChars = REDACTION_TAIL) {
  const safe = redact(s);
  if (safe.length <= maxChars) return safe;
  return `…${safe.slice(-maxChars)}`;
}

function redactRunId(v) {
  if (typeof v !== 'string' || v.length === 0) return null;
  return `${v.slice(0, 8)}-<redacted>`;
}

// Try to extract a parseable bos schema from a string that may contain
// markdown-fenced JSON or inline JSON. Returns the parsed bos object on
// success, or null.
function tryParseBosFromText(text) {
  if (typeof text !== 'string') return null;

  // 1. Direct JSON.parse
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && parsed.bos && typeof parsed.bos === 'object') {
      return { kind: 'direct_json', bos: parsed.bos };
    }
    if (parsed && typeof parsed === 'object' && parsed.resultJson && parsed.resultJson.bos) {
      return { kind: 'direct_json_wrapped', bos: parsed.resultJson.bos };
    }
  } catch (_) { /* fall through */ }

  // 2. Markdown-fenced JSON block: ```json\n{...}\n``` or ```\n{...}\n```
  const fenceRe = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/g;
  let m;
  while ((m = fenceRe.exec(text)) !== null) {
    const body = m[1];
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === 'object' && parsed.bos && typeof parsed.bos === 'object') {
        return { kind: 'markdown_fenced', bos: parsed.bos };
      }
      if (parsed && typeof parsed === 'object' && parsed.resultJson && parsed.resultJson.bos) {
        return { kind: 'markdown_fenced_wrapped', bos: parsed.resultJson.bos };
      }
    } catch (_) { /* try next fence */ }
  }

  // 3. Inline balanced-brace object that contains "resultJson" and "bos"
  const braceRe = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
  while ((m = braceRe.exec(text)) !== null) {
    const candidate = m[0];
    if (!candidate.includes('bos')) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && parsed.bos && typeof parsed.bos === 'object') {
        return { kind: 'inline_braces', bos: parsed.bos };
      }
      if (parsed && typeof parsed === 'object' && parsed.resultJson && parsed.resultJson.bos) {
        return { kind: 'inline_braces_wrapped', bos: parsed.resultJson.bos };
      }
    } catch (_) { /* try next */ }
  }

  return null;
}

(async () => {
  const env = loadEnv();
  if (!env.PAPERCLIP_EMAIL || !env.PAPERCLIP_PASSWORD) {
    console.error(JSON.stringify({ status: 'NO_AUTH' }));
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
  const startedAt = new Date().toISOString();

  const out = {
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s03-t10-inspection.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S03',
    task: 'T10',
    generated: startedAt,
    company: { issue_prefix: contract.company.issue_prefix, name: contract.company.name },
    purpose: 'Read-only investigation of heartbeat invoke/readback semantics for the two unfinished runs (Div1.HCO + Div7.MissionControl). NO mutations.',
    agents: [],
  };

  for (const name of CANONICAL_DIVISION_NAMES) {
    const meta = discovery.found[name];
    if (!meta) {
      out.agents.push({ name, status: 'NOT_FOUND_IN_ROSTER' });
      continue;
    }

    const listPath = `/api/companies/${encodeURIComponent(discovery.companyId)}/heartbeat-runs?agentId=${encodeURIComponent(meta.id)}`;
    let runs = [];
    try {
      const listRes = await request('GET', listPath);
      runs = unwrapList(listRes, ['heartbeatRuns', 'runs', 'items']) || [];
    } catch (e) {
      out.agents.push({ name, agent_id_prefix: redactRunId(meta.id), status: 'LIST_ERROR', error: redact(String(e && e.message || e)).slice(0, 200) });
      continue;
    }

    const sorted = runs.slice().sort((a, b) => {
      const aT = a && (a.startedAt || a.createdAt || '');
      const bT = b && (b.startedAt || b.createdAt || '');
      return (bT || '').localeCompare(aT || '');
    });

    const newestInspections = [];
    for (const r of sorted.slice(0, 3)) {
      const runId = r && r.id;
      if (!runId) continue;
      let full = null;
      try {
        full = await request('GET', `/api/heartbeat-runs/${encodeURIComponent(runId)}`);
      } catch (e) {
        newestInspections.push({
          run_id_prefix: redactRunId(runId),
          list_status: r && r.status,
          list_startedAt: r && r.startedAt,
          list_finishedAt: r && r.finishedAt,
          full_error: redact(String(e && e.message || e)).slice(0, 200),
        });
        continue;
      }

      const resultJson = full && full.resultJson;
      const resultString = typeof resultJson === 'string'
        ? resultJson
        : (resultJson && typeof resultJson === 'object' && typeof resultJson.result === 'string' ? resultJson.result : null);

      const bosExtract = resultString ? tryParseBosFromText(resultString) : null;

      newestInspections.push({
        run_id_prefix: redactRunId(runId),
        list_status: r && r.status,
        list_startedAt: r && r.startedAt,
        list_finishedAt: r && r.finishedAt,
        full_status: full && full.status,
        full_startedAt: full && full.startedAt,
        full_finishedAt: full && full.finishedAt,
        full_lastOutputAt: full && full.lastOutputAt,
        resultJson_type: resultJson == null ? 'null' : typeof resultJson,
        resultJson_keys: resultJson && typeof resultJson === 'object' && !Array.isArray(resultJson) ? Object.keys(resultJson) : null,
        resultString_length: resultString ? resultString.length : 0,
        resultString_preview: resultString
          ? redact(resultString).slice(0, RESULT_PREVIEW_CHARS)
          : null,
        resultString_tail: resultString
          ? redactTail(resultString, REDACTION_TAIL)
          : null,
        bos_extraction: bosExtract ? { kind: bosExtract.kind, bos_fields: Object.keys(bosExtract.bos) } : null,
      });
    }

    out.agents.push({
      name,
      agent_id_prefix: redactRunId(meta.id),
      agent_role: meta.role,
      newest_count: sorted.length,
      newest: newestInspections,
    });
  }

  // Summary rollup across all 7 agents
  const summary = {
    agents_inspected: out.agents.filter((a) => !a.status || a.status !== 'NOT_FOUND_IN_ROSTER').length,
    agents_missing_from_roster: out.agents.filter((a) => a.status === 'NOT_FOUND_IN_ROSTER').map((a) => a.name),
    runs_terminal_succeeded: out.agents.flatMap((a) => a.newest || []).filter((r) => (r.full_status || r.list_status) === 'succeeded').length,
    runs_terminal_running: out.agents.flatMap((a) => a.newest || []).filter((r) => (r.full_status || r.list_status) === 'running').length,
    runs_with_parseable_bos_in_result_string: out.agents.flatMap((a) => a.newest || []).filter((r) => r.bos_extraction != null).length,
  };
  out.summary = summary;

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify({
    agents_inspected: summary.agents_inspected,
    runs_terminal_succeeded: summary.runs_terminal_succeeded,
    runs_terminal_running: summary.runs_terminal_running,
    runs_with_parseable_bos_in_result_string: summary.runs_with_parseable_bos_in_result_string,
    output: path.relative(ROOT, OUTPUT_PATH),
  }, null, 2));
})().catch((err) => {
  console.error(JSON.stringify({ status: 'ERROR', reason: redact(String(err && err.message || err)).slice(0, 500) }));
  process.exit(2);
});