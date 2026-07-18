#!/usr/bin/env node
'use strict';
/**
 * scripts/diag_m015_s03_t11_full_field_inspect.js
 *
 * M015-S03 / T11 — exhaustive read-only inspection of ALL fields returned by
 * the Paperclip heartbeat-runs readback to determine whether hermes_local/
 * MiniMax-M3 emits the bos-light-v1 schema in any place OTHER than the
 * well-known resultJson.result / resultJson.summary strings. Specifically:
 *
 *   - contextSnapshot — Paperclip-injected runtime context snapshot
 *   - triggerDetail  — what triggered this heartbeat
 *   - stdoutExcerpt  / stderrExcerpt — MiniMax-M3 process output
 *   - usageJson      — usage metadata
 *   - livenessReason / nextAction / livenessState — runtime liveness info
 *   - externalRunId  / invocationSource — external dispatch metadata
 *   - sessionIdBefore / sessionIdAfter — session lifecycle markers
 *   - logRef / logSha256 / logStore — process log reference
 *   - error / errorCode / signal / exitCode — process error surfaces
 *   - lastOutputStream / lastOutputBytes / lastOutputSeq / lastOutputAt —
 *     streaming output envelope
 *   - issueCommentStatus / issueCommentRetryQueuedAt / issueCommentSatisfiedByCommentId
 *
 * T10 only checked `resultJson.result` (long-form reasoning trace) and
 * `resultJson.summary` (shorter text). T11 widens the search to every
 * field the readback exposes.
 *
 * No mutations — pure read.
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
  XIAOMI_RE,
  CREDENTIAL_ASSIGNMENT,
} = require('./probe_m015_seven_agent_environment');

const ROOT = path.resolve(__dirname, '..');
const CONTRACT_PATH = path.join(ROOT, 'runtime-evidence/M015-S01-seven-agent-target-contract.json');
const OUTPUT_PATH = path.join(ROOT, 'runtime-evidence/M015-S03-t11-full-field-inspection.json');
const DEFAULT_BASE_URL = 'http://127.0.0.1:43131';
const DEFAULT_ORIGIN = 'https://paperclip.oysana.com';

const PREVIEW_CHARS = 1200;
const REDACTION_TAIL = 80;

// CRITICAL: imported UUID_FULL has no `g` flag, so `.replace()` only
// substitutes the FIRST match. Strings like logStore paths may carry
// several UUIDs back-to-back (`<uuid>/<uuid>/<uuid>.ndjson`); we must
// redact every occurrence or the artifact leaks full IDs. Build a global
// version locally — same source pattern as probe_m015_seven_agent_environment
// but with the `gi` flags. Same applies for credential / xiaomi checks.
const UUID_FULL_G = new RegExp(UUID_FULL.source, 'gi');
const CREDENTIAL_ASSIGNMENT_G = new RegExp(CREDENTIAL_ASSIGNMENT.source, 'gi');
const XIAOMI_RE_G = new RegExp(XIAOMI_RE.source, 'gi');

// Fields we will inspect for bos-light-v1 schema. These are the places
// bos-light-v1 schema *could* appear if MiniMax-M3 or the Paperclip adapter
// injected it somewhere other than resultJson.result / resultJson.summary.
const CANDIDATE_STRING_FIELDS = Object.freeze([
  'contextSnapshot',
  'triggerDetail',
  'stdoutExcerpt',
  'stderrExcerpt',
  'usageJson',
  'livenessReason',
  'nextAction',
  'externalRunId',
  'invocationSource',
  'sessionIdBefore',
  'sessionIdAfter',
  'logRef',
  'logSha256',
  'logStore',
  'error',
  'errorCode',
  'signal',
  'livenessState',
  'wakeupRequestId',
  'responsibleUserId',
  'processGroupId',
  'processPid',
  'processLossRetryCount',
  'scheduledRetryReason',
  'scheduledRetryAt',
  'scheduledRetryAttempt',
  'continuationAttempt',
  'retryOfRunId',
  'issueCommentStatus',
  'issueCommentRetryQueuedAt',
  'issueCommentSatisfiedByCommentId',
  'sessionIdAfter',
]);

const CANDIDATE_OBJECT_FIELDS = Object.freeze([
  'contextSnapshot',
  'triggerDetail',
  'usageJson',
  'lastOutputStream',
  'resultJson',
  'logRef',
  'logStore',
]);

function redact(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(UUID_FULL_G, '<redacted-id>')
    .replace(/\bbearer\s+[A-Za-z0-9._\-]+/gi, 'bearer=<redacted>')
    .replace(/sk-[A-Za-z0-9._\-]+/g, 'sk-<redacted>')
    .replace(/tp-[A-Za-z0-9._\-]+/g, 'tp-<redacted>')
    .replace(CREDENTIAL_ASSIGNMENT_G, '<redacted-credential-fragment>');
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

function truncate(s, maxChars = PREVIEW_CHARS) {
  if (typeof s !== 'string') return s;
  return s.length <= maxChars ? s : `${s.slice(0, maxChars)}…`;
}

// bos-light-v1 marker detector — recognise {schemaVersion: 'bos-light-v1', ...}
// in any text surface. Returns { found: bool, sample: text, fields: [] }.
function findBosMarkers(text) {
  if (typeof text !== 'string') return { found: false };
  const markers = [
    /bos-light-v1/,
    /"schemaVersion"\s*:\s*"bos-light-v1"/,
    /"schema_version"\s*:\s*"bos-light-v1"/,
    /schemaVersion['":\s]+bos-light-v1/i,
  ];
  for (const re of markers) {
    if (re.test(text)) {
      // Pull all top-level fields out of any JSON-like structure that contains bos-light-v1
      const fenceRe = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/g;
      let m;
      while ((m = fenceRe.exec(text)) !== null) {
        try {
          const parsed = JSON.parse(m[1]);
          if (parsed && typeof parsed === 'object') {
            const maybe = parsed.bos || parsed.resultJson?.bos || parsed;
            if (maybe && typeof maybe === 'object' && (maybe.schemaVersion === 'bos-light-v1' || maybe.schema_version === 'bos-light-v1')) {
              return { found: true, kind: 'fenced', fields: Object.keys(maybe) };
            }
          }
        } catch (_) { /* next */ }
      }
      // Try inline braces containing bos-light-v1
      const braceRe = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
      while ((m = braceRe.exec(text)) !== null) {
        if (!m[0].includes('bos-light-v1')) continue;
        try {
          const parsed = JSON.parse(m[0]);
          if (parsed && typeof parsed === 'object') {
            const maybe = parsed.bos || parsed.resultJson?.bos || parsed;
            if (maybe && typeof maybe === 'object' && (maybe.schemaVersion === 'bos-light-v1' || maybe.schema_version === 'bos-light-v1')) {
              return { found: true, kind: 'inline_braces', fields: Object.keys(maybe) };
            }
          }
        } catch (_) { /* next */ }
      }
      // Bare mention of bos-light-v1 with no parseable structure
      return { found: true, kind: 'string_mention', fields: [] };
    }
  }
  return { found: false };
}

// Paperclip context markers — what T03 reads off resultJson.bos. We look
// for these anywhere in any string field as an alternative "Paperclip-
// context diagnostic shape".
const PAPERCLIP_CONTEXT_MARKERS = Object.freeze({
  schemaVersion_mention: /"schemaVersion"/,
  division_mention: /\bDiv\d\.[A-Za-z]+/, // matches Div1.HCO, Div7.MissionControl, etc.
  paperclip_mention: /\bpaperclip\b/i,
  resultJson_mention: /\bresultJson\b/,
  bos_mention: /\bbos\b/i,
});

function findPaperclipContextMarkers(text) {
  if (typeof text !== 'string') return {};
  const out = {};
  for (const [k, re] of Object.entries(PAPERCLIP_CONTEXT_MARKERS)) {
    out[k] = re.test(text);
  }
  return out;
}

function inspectField(name, value, allFieldNames) {
  if (value == null) return { name, present: false, type: 'null' };
  const type = Array.isArray(value) ? 'array' : typeof value;
  const out = { name, present: true, type };

  if (typeof value === 'string') {
    out.length = value.length;
    out.bos_markers = findBosMarkers(value);
    out.paperclip_context_markers = findPaperclipContextMarkers(value);
    out.preview = redact(truncate(value));
    out.tail = redactTail(value);
  } else if (typeof value === 'object') {
    if (Array.isArray(value)) {
      out.length = value.length;
      out.items_type = value.length > 0 ? typeof value[0] : 'empty';
    } else {
      out.keys = Object.keys(value);
      out.keys_sorted = out.keys.slice().sort();
      // For nested objects, also scan string values recursively for bos markers
      const nestedHits = [];
      function walk(v, p) {
        if (typeof v === 'string') {
          const m = findBosMarkers(v);
          if (m.found) nestedHits.push({ path: p, kind: m.kind, fields: m.fields });
        } else if (Array.isArray(v)) {
          for (let i = 0; i < v.length; i += 1) walk(v[i], `${p}[${i}]`);
        } else if (v && typeof v === 'object') {
          for (const [k, vv] of Object.entries(v)) walk(vv, `${p}.${k}`);
        }
      }
      walk(value, name);
      out.bos_markers_in_nested_strings = nestedHits;
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
  const startedAt = new Date().toISOString();

  const out = {
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s03-t11-full-field-inspection.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S03',
    task: 'T11',
    generated: startedAt,
    purpose: 'Exhaustive read-only inspection of every field on the heartbeat-runs readback to determine whether bos-light-v1 schema appears anywhere OTHER than resultJson.result/resultJson.summary.',
    candidate_string_fields: CANDIDATE_STRING_FIELDS,
    candidate_object_fields: CANDIDATE_OBJECT_FIELDS,
    agents: [],
  };

  let totalBosHits = 0;
  let totalRunsInspected = 0;

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
      out.agents.push({ name, status: 'LIST_ERROR', error: redact(String(e && e.message || e)).slice(0, 200) });
      continue;
    }
    const sorted = runs.slice().sort((a, b) => (b.startedAt || b.createdAt || '').localeCompare(a.startedAt || a.createdAt || ''));

    // Inspect the newest 3 runs (covers succeeded / running / cancelled / etc.)
    const inspectedRuns = [];
    for (const r of sorted.slice(0, 3)) {
      const runId = r && r.id;
      if (!runId) continue;
      let full = null;
      try {
        full = await request('GET', `/api/heartbeat-runs/${encodeURIComponent(runId)}`);
      } catch (e) {
        inspectedRuns.push({ run_id_prefix: redactRunId(runId), list_status: r && r.status, error: redact(String(e && e.message || e)).slice(0, 200) });
        continue;
      }

      const fieldNames = full && typeof full === 'object' ? Object.keys(full).sort() : [];
      const fields = {};
      let runBosHits = 0;
      for (const fname of CANDIDATE_STRING_FIELDS) {
        const inspected = inspectField(fname, full && full[fname], fieldNames);
        fields[fname] = inspected;
        if (inspected.bos_markers && inspected.bos_markers.found) runBosHits += 1;
        if (inspected.bos_markers_in_nested_strings && inspected.bos_markers_in_nested_strings.length > 0) {
          runBosHits += inspected.bos_markers_in_nested_strings.length;
        }
      }

      // Also check resultJson (already covered by T10 but include for completeness)
      const resultJson = full && full.resultJson;
      if (resultJson && typeof resultJson === 'object' && !Array.isArray(resultJson)) {
        const summaryText = typeof resultJson.summary === 'string' ? resultJson.summary : null;
        const resultText = typeof resultJson.result === 'string' ? resultJson.result : null;
        fields.resultJson_summary_bos = summaryText ? findBosMarkers(summaryText) : { found: false };
        fields.resultJson_result_bos = resultText ? findBosMarkers(resultText) : { found: false };
        fields.resultJson_keys = Object.keys(resultJson).sort();
        if (fields.resultJson_summary_bos.found) runBosHits += 1;
        if (fields.resultJson_result_bos.found) runBosHits += 1;
      }

      inspectedRuns.push({
        run_id_prefix: redactRunId(runId),
        status: full && full.status,
        terminal: full && (full.finishedAt ? true : false),
        startedAt: full && full.startedAt,
        finishedAt: full && full.finishedAt,
        all_field_names: fieldNames,
        field_inspections: fields,
        bos_hit_count_this_run: runBosHits,
      });
      totalBosHits += runBosHits;
      totalRunsInspected += 1;
    }

    out.agents.push({
      name,
      agent_id_prefix: redactRunId(meta.id),
      newest_count: sorted.length,
      inspected_count: inspectedRuns.length,
      bos_hit_count_for_agent: inspectedRuns.reduce((acc, r) => acc + (r.bos_hit_count_this_run || 0), 0),
      runs: inspectedRuns,
    });
  }

  out.summary = {
    runs_inspected: totalRunsInspected,
    total_bos_hits: totalBosHits,
    verdict: totalBosHits > 0 ? 'bos-light-v1 schema detected in some readback field — T03 condition may be satisfiable' : 'bos-light-v1 schema NOT detected anywhere in any heartbeat readback field — native runtime does not emit bos-light-v1; resultJson.bos contract is a sentinel for a feature hermes_local/MiniMax-M3 does not produce',
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const serialized = JSON.stringify(out, null, 2) + '\n';
  // Belt-and-braces refusal to write if any full UUID / credential assignment
  // / xiaomi-mimo string survived the per-field redact(). Without this
  // post-write check the script leaked UUIDs back-to-back in `logStore`
  // paths on the first run because the imported UUID_FULL regex has no
  // `g` flag and `.replace()` only substitutes the first match.
  if (UUID_FULL.test(serialized)) {
    throw new Error('M15-S03-T11-LEAK-UUID refused write: full UUID survived per-field redact()');
  }
  if (CREDENTIAL_ASSIGNMENT.test(serialized)) {
    throw new Error('M15-S03-T11-LEAK-CRED refused write: credential assignment survived per-field redact()');
  }
  if (XIAOMI_RE.test(serialized)) {
    throw new Error('M15-S03-T11-LEAK-XIAOMI refused write: xiaomi/mimo string survived per-field redact()');
  }
  fs.writeFileSync(OUTPUT_PATH, serialized);
  console.log(JSON.stringify(out.summary, null, 2));
})().catch((err) => {
  console.error(JSON.stringify({ status: 'ERROR', reason: redact(String(err && err.message || err)).slice(0, 500) }));
  process.exit(2);
});
