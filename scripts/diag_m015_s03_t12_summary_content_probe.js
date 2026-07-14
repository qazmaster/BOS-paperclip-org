#!/usr/bin/env node
'use strict';

/**
 * scripts/diag_m015_s03_t12_summary_content_probe.js
 *
 * M015-S03 / T12 — focused read-only diagnostic.
 *
 * T11 inspected 32 candidate string fields × 21 runs × 7 agents but only
 * stored `bos_markers: {found: bool}` for `resultJson.summary` and
 * `resultJson.result` — the literal TEXT content was discarded. That leaves
 * a critical information gap: we know "bos-light-v1" is not literally present
 * in those strings, but we do NOT know what bos-light-v1-equivalent metadata
 * (if any) might be emitted under looser field naming.
 *
 * T12 step 1 = close that information gap. This probe:
 *   - Authenticates against the live Paperclip board.
 *   - Re-resolves the seven canonical division agents by name.
 *   - For each agent, GETs the 3 newest heartbeat-runs (list-level filter).
 *   - For each candidate run, fetches the FULL heartbeat-run record via
 *     GET /api/heartbeat-runs/{runId} and captures
 *       resultJson.summary (preview+t head+len),
 *       resultJson.result  (preview+tail+len),
 *       resultJson keys,
 *       contextSnapshot    (preview),
 *       triggerDetail      (preview),
 *       stdoutExcerpt      (preview).
 *   - Walks every string-valued nested field inside resultJson and inside
 *     contextSnapshot/triggerDetail/usageJson with global redact() so a
 *     survey of where any bos-like 5-field metadata actually appears.
 *   - Writes bounded evidence to runtime-evidence/M015-S03-t12-summary-content-probe.json
 *
 * No mutations, no heartbeat invokes — pure read of existing run records.
 *
 * Re-exports BLOCKER_CODES / scrubEvidence / discoverCanonicalAgents from
 * the canonical probe helpers so any T12 follow-up uses identical redaction
 * discipline.
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
  BLOCKER_CODES: PROBE_BLOCKER_CODES,
  scrubEvidence,
  redacted,
  UUID_FULL,
  CREDENTIAL_ASSIGNMENT,
  XIAOMI_RE,
  discoverCanonicalAgents,
} = require('./probe_m015_seven_agent_environment');

const ROOT = path.resolve(__dirname, '..');
const CONTRACT_PATH = path.join(ROOT, 'runtime-evidence/M015-S01-seven-agent-target-contract.json');
const OUTPUT_PATH = path.join(ROOT, 'runtime-evidence/M015-S03-t12-summary-content-probe.json');
const DEFAULT_BASE_URL = 'http://127.0.0.1:43131';
const DEFAULT_ORIGIN = 'https://paperclip.oysana.com';

const PREVIEW_HEAD = 700;
const PREVIEW_TAIL = 700;
const MAX_RUNS_PER_AGENT = 3;

// Global flag regexes (probe module's UUID_FULL/CREDENTIAL_ASSIGNMENT/XIAOMI_RE
// have no `g` flag, so .replace() only substitutes the first match. We
// construct local global versions to handle back-to-back UUIDs in paths).
const UUID_FULL_G = new RegExp(UUID_FULL.source, 'gi');
const CREDENTIAL_ASSIGNMENT_G = new RegExp(CREDENTIAL_ASSIGNMENT.source, 'gi');
const XIAOMI_RE_G = new RegExp(XIAOMI_RE.source, 'gi');

function redact(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(UUID_FULL_G, '<redacted-id>')
    .replace(/\bbearer\s+[A-Za-z0-9._\-]+/gi, 'bearer=<redacted>')
    .replace(/sk-[A-Za-z0-9._\-]+/g, 'sk-<redacted>')
    .replace(/tp-[A-Za-z0-9._\-]+/g, 'tp-<redacted>')
    .replace(CREDENTIAL_ASSIGNMENT_G, '<redacted-credential-fragment>')
    .replace(XIAOMI_RE_G, '<redacted-vendor-marker>');
}

function previewHead(s, n = PREVIEW_HEAD) {
  if (typeof s !== 'string') return s;
  const redactedStr = redact(s);
  return redactedStr.length <= n
    ? redactedStr
    : `${redactedStr.slice(0, n)}…[+${redactedStr.length - n} chars]`;
}

function previewTail(s, n = PREVIEW_TAIL) {
  if (typeof s !== 'string') return s;
  const redactedStr = redact(s);
  return redactedStr.length <= n
    ? redactedStr
    : `[+${redactedStr.length - n} chars]…${redactedStr.slice(-n)}`;
}

function redactRunId(v) {
  if (typeof v !== 'string' || v.length === 0) return null;
  return `${v.slice(0, 8)}-<redacted>`;
}

// Loose bos-metadata detector — recognise ANY textual mention of the 5 bos
// field names or schema-version pattern, regardless of casing or quote style.
// This is the EXTRACTION SIDE of T12: finding whatever bos-equivalent the
// model might be emitting under looser naming before deciding whether to
// shape it back into bos-light-v1 schema on the validator side.
const BOS_FIELD_PATTERNS = Object.freeze({
  schema_version: /(\bbos[-_ ]?light[-_ ]?v?\d*\b|schema[_ -]?version)/i,
  run_id: /\brun[ _-]?id\b/i,
  division_field: /\bdivision\b/i,
  role_field: /\brole\b/i,
  status_field: /\bstatus\b/i,
  paperclip_context: /\bpaperclip\b/i,
});

function findLooseBosMetadata(text) {
  if (typeof text !== 'string') return {};
  const out = {};
  for (const [name, re] of Object.entries(BOS_FIELD_PATTERNS)) {
    const matches = text.match(new RegExp(re.source, 'gi')) || [];
    out[name] = { count: matches.length, sample: matches[0] || null };
  }
  return out;
}

function walkStrings(value, jsonPath, hits) {
  if (hits == null) hits = [];
  if (value == null) return hits;
  if (typeof value === 'string') {
    const loose = findLooseBosMetadata(value);
    const counts = Object.fromEntries(Object.entries(loose).map(([k, v]) => [k, v.count]));
    const anyHit = Object.values(counts).some((n) => n > 0);
    if (anyHit) {
      hits.push({
        path: jsonPath || '$',
        length: value.length,
        preview_head: previewHead(value, 400),
        ...loose,
      });
    }
    return hits;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      walkStrings(value[i], jsonPath ? `${jsonPath}[${i}]` : `[${i}]`, hits);
    }
    return hits;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      walkStrings(v, jsonPath ? `${jsonPath}.${k}` : k, hits);
    }
    return hits;
  }
  return hits;
}

async function listHeartbeatRuns(request, companyId, agentId) {
  const payload = await request('GET', `/api/companies/${encodeURIComponent(companyId)}/heartbeat-runs?agentId=${encodeURIComponent(agentId)}`);
  return unwrapList(payload, ['heartbeatRuns', 'runs', 'items']);
}

function redactError(error) {
  return redact(String(error && error.message || error)).slice(0, 500);
}

(async () => {
  const env = loadEnv();
  if (!env.PAPERCLIP_EMAIL || !env.PAPERCLIP_PASSWORD) {
    process.stderr.write(JSON.stringify({ status: 'NO_AUTH' }));
    process.exit(1);
  }
  const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
  const request = await makeBoardClient({
    baseUrl: env.PAPERCLIP_BASE_URL || DEFAULT_BASE_URL,
    origin: env.PAPERCLIP_ORIGIN || DEFAULT_ORIGIN,
    email: env.PAPERCLIP_EMAIL,
    password: env.PAPERCLIP_PASSWORD,
  });
  const startedAt = new Date().toISOString();
  const discovery = await discoverCanonicalAgents(contract, request);

  const blockers = [];
  if (discovery.missing.length) {
    blockers.push({
      code: PROBE_BLOCKER_CODES.NAME_MISSING(discovery.missing[0]),
      severity: 'blocking',
      agent: discovery.missing[0],
      reason: `canonical agents missing: ${discovery.missing.join(', ')}`,
    });
  }

  const agents = [];
  let totalCapturedRuns = 0;
  for (const name of CANONICAL_DIVISION_NAMES) {
    const meta = discovery.found[name];
    if (!meta) {
      agents.push({ name, status: 'NOT_FOUND_IN_ROSTER' });
      continue;
    }
    let runs = [];
    try {
      runs = await listHeartbeatRuns(request, discovery.companyId, meta.id);
    } catch (e) {
      agents.push({ name, status: 'LIST_ERROR', error: redactError(e) });
      continue;
    }
    // Newest-first
    const sorted = runs.slice().sort((a, b) => (b.startedAt || b.createdAt || '').localeCompare(a.startedAt || a.createdAt || ''));
    const captures = [];
    for (const r of sorted.slice(0, MAX_RUNS_PER_AGENT)) {
      const runId = r && r.id;
      if (!runId) continue;
      let full = null;
      let fetchError = null;
      try {
        full = await request('GET', `/api/heartbeat-runs/${encodeURIComponent(runId)}`);
      } catch (e) {
        fetchError = redactError(e);
      }
      const capture = {
        run_id_prefix: redactRunId(runId),
        list_status: r && r.status,
        full_status: full && full.status,
        startedAt: full && full.startedAt,
        finishedAt: full && full.finishedAt,
      };
      if (fetchError) {
        capture.fetch_error = fetchError;
        captures.push(capture);
        continue;
      }
      const resultJson = full && full.resultJson;
      if (resultJson && typeof resultJson === 'object' && !Array.isArray(resultJson)) {
        capture.resultJson_keys = Object.keys(resultJson).sort();
        capture.resultJson_keys_count = capture.resultJson_keys.length;
        const summaryText = typeof resultJson.summary === 'string' ? resultJson.summary : null;
        const resultText = typeof resultJson.result === 'string' ? resultJson.result : null;
        capture.summary_length = summaryText ? summaryText.length : 0;
        capture.result_length = resultText ? resultText.length : 0;
        capture.summary_preview_head = summaryText ? previewHead(summaryText) : null;
        capture.summary_preview_tail = summaryText ? previewTail(summaryText) : null;
        capture.result_preview_head = resultText ? previewHead(resultText) : null;
        capture.result_preview_tail = resultText ? previewTail(resultText) : null;
        capture.summary_loose_bos = summaryText ? findLooseBosMetadata(summaryText) : null;
        capture.result_loose_bos = resultText ? findLooseBosMetadata(resultText) : null;
      } else {
        capture.resultJson_keys = [];
      }
      // Surface previews of contextSnapshot / triggerDetail / stdoutExcerpt
      const contextSnap = full && full.contextSnapshot;
      if (contextSnap != null) {
        capture.contextSnapshot_type = Array.isArray(contextSnap) ? 'array' : typeof contextSnap;
        if (typeof contextSnap === 'string') {
          capture.contextSnapshot_length = contextSnap.length;
          capture.contextSnapshot_preview = previewHead(contextSnap, 500);
          capture.contextSnapshot_loose_bos = findLooseBosMetadata(contextSnap);
        } else if (contextSnap && typeof contextSnap === 'object') {
          capture.contextSnapshot_keys = Object.keys(contextSnap).sort();
          capture.contextSnapshot_walked_hits = walkStrings(contextSnap, 'contextSnapshot');
        }
      }
      const triggerDetail = full && full.triggerDetail;
      if (triggerDetail != null) {
        capture.triggerDetail_type = Array.isArray(triggerDetail) ? 'array' : typeof triggerDetail;
        if (typeof triggerDetail === 'string') {
          capture.triggerDetail_length = triggerDetail.length;
          capture.triggerDetail_preview = previewHead(triggerDetail, 500);
          capture.triggerDetail_loose_bos = findLooseBosMetadata(triggerDetail);
        } else if (triggerDetail && typeof triggerDetail === 'object') {
          capture.triggerDetail_keys = Object.keys(triggerDetail).sort();
          capture.triggerDetail_walked_hits = walkStrings(triggerDetail, 'triggerDetail');
        }
      }
      const stdoutExcerpt = full && full.stdoutExcerpt;
      if (typeof stdoutExcerpt === 'string') {
        capture.stdoutExcerpt_length = stdoutExcerpt.length;
        capture.stdoutExcerpt_preview = previewHead(stdoutExcerpt, 500);
        capture.stdoutExcerpt_loose_bos = findLooseBosMetadata(stdoutExcerpt);
      }
      // Full resultJson walked hit survey
      if (resultJson && typeof resultJson === 'object') {
        capture.resultJson_walked_hits = walkStrings(resultJson, 'resultJson');
      }
      captures.push(capture);
      totalCapturedRuns += 1;
    }
    agents.push({
      name,
      agent_id_prefix: redactRunId(meta.id),
      roster_runs_count: sorted.length,
      captured_count: captures.length,
      captures,
    });
  }

  const summary = {
    runs_captured: totalCapturedRuns,
    agents_covered: agents.filter((entry) => entry.captures && entry.captures.length > 0).length,
    blocker_codes: blockers.map((entry) => entry.code),
  };

  const out = {
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s03-t12-summary-content-probe.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S03',
    task: 'T12',
    generated: startedAt,
    purpose: 'Capture bounded preview of resultJson.summary and resultJson.result text content (and resultJson_walked hits) across the newest 3 heartbeat-runs per canonical agent — closes the T11 information gap that discarded literal text content while keeping only bos_markers: {found: bool}.',
    upstream_artifacts: {
      full_field_inspection: 'runtime-evidence/M015-S03-t11-full-field-inspection.json',
    },
    summary,
    blockers: blockers.map((entry) => ({ code: entry.code, severity: entry.severity, agent: entry.agent, reason: entry.reason })),
    agents,
    redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false },
  };

  const scrubbed = scrubEvidence(out);
  const serialized = JSON.stringify(scrubbed, null, 2) + '\n';
  // Belt-and-braces refusal to write if any full UUID / credential assignment
  // / xiaomi-mimo string survived the per-field redact(). This is the same
  // safety net T11 uses — UUID_FULL/CREDENTIAL_ASSIGNMENT/XIAOMI_RE have no
  // `g` flag and so substitute only the first match.
  if (UUID_FULL.test(serialized)) {
    throw new Error('M15-S03-T12-LEAK-UUID refused write: full UUID survived per-field redact()');
  }
  if (CREDENTIAL_ASSIGNMENT.test(serialized)) {
    throw new Error('M15-S03-T12-LEAK-CRED refused write: credential assignment survived per-field redact()');
  }
  if (XIAOMI_RE.test(serialized)) {
    throw new Error('M15-S03-T12-LEAK-XIAOMI refused write: xiaomi/mimo string survived per-field redact()');
  }
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, serialized);
  process.stdout.write(JSON.stringify({ ...summary, written: path.relative(ROOT, OUTPUT_PATH) }, null, 2) + '\n');
})().catch((err) => {
  process.stderr.write(JSON.stringify({ status: 'ERROR', reason: redactError(err) }));
  process.exit(2);
});
