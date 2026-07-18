#!/usr/bin/env node
'use strict';

/**
 * scripts/probe_m015_seven_agent_environment.js
 *
 * M015-S03 / T01 — exact per-agent Hermes environment probe.
 *
 * Authenticates against the Paperclip board via session cookie (reusing
 * apply_m015_seven_agent_contract#makeBoardClient), enumerates the seven
 * canonical division agents by name from the live company agent list, then
 * for each agent submits
 *   POST /api/companies/{companyId}/adapters/hermes_local/test-environment
 * with body { adapterConfig: <exact live adapterConfig from
 *           GET /api/agents/{id}> }
 * so the probe exercises the agent's bound profile (not the company-level
 * default). Captures HTTP status, response.json.status (pass|warn|fail),
 * response.json.checks[] codes, and a bounded redacted message tail
 * (last 200 chars max, credential / UUID redaction, xiaomi / mimo grep).
 *
 * Stop-on-first-blocker mirrors the M015-S02 apply + validate discipline;
 * only a clean pass for ALL seven agents is allowed to admit T02/T03.
 *
 * Output (always written, even on failure for forensic trail):
 *   runtime-evidence/M015-S03-seven-agent-test-environment.json
 *
 * Exports helpers for T02 + T03 reuse:
 *   loadEnv, makeBoardClient, unwrapList, redactError (re-exported),
 *   discoverCanonicalAgents(contract, request),
 *   probeTestEnvironment(request, companyId, adapterConfig),
 *   buildProbeEvidence(contract, probeRecords, blockers, options),
 *   redactMessageTail(text, maxChars), XIAOMI_RE, BLOCKER_CODES,
 *   CANONICAL_DIVISION_NAMES, MAX_MESSAGE_TAIL_CHARS.
 */

const fs = require('fs');
const path = require('path');
const {
  loadEnv,
  makeBoardClient,
  unwrapList,
  redactError,
} = require('./apply_m015_seven_agent_contract');

const ROOT = path.resolve(__dirname, '..');
const CONTRACT_PATH = path.join(ROOT, 'runtime-evidence/M015-S01-seven-agent-target-contract.json');
const S02_AFTER_PATH = path.join(ROOT, 'runtime-evidence/M015-S02-seven-agent-after.json');
const OUTPUT_PATH = path.join(ROOT, 'runtime-evidence/M015-S03-seven-agent-test-environment.json');
const DEFAULT_BASE_URL = 'http://127.0.0.1:43131';
const DEFAULT_ORIGIN = 'https://paperclip.oysana.com';

const CANONICAL_DIVISION_NAMES = Object.freeze([
  'Div1.HCO',
  'Div2.MasterPlanner',
  'Div3.Treasury',
  'Div4.Production',
  'Div5.QualificationsLibraryLearning',
  'Div6.External',
  'Div7.MissionControl',
]);

const XIAOMI_RE = /\b(?:xiaomi|mimo)\b/i;
const CREDENTIAL_ASSIGNMENT = /\b(?:PAPERCLIP_API_KEY|MINIMAX_API_KEY|XIAOMI_API_KEY|BETTER_AUTH_SECRET|POSTGRES_PASSWORD|DATABASE_URL|OPENAI_API_KEY)\s*=\s*[^\s,;'"]+/i;
const UUID_FULL = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const MAX_MESSAGE_TAIL_CHARS = 200;

const BLOCKER_CODES = Object.freeze({
  COMPANY_MISSING: 'M15-S03-COMPANY-MISSING',
  NAME_DRIFT: 'M15-S03-NAME-DRIFT',
  NAME_MISSING: (name) => `M15-S03-AGT-${name}-NAME-MISSING`,
  HTTP_NON_SUCCESS: (name, code) => `M15-S03-AGT-${name}-HTTP-${code}`,
  STATUS_NOT_PASS: (name, status) => `M15-S03-AGT-${name}-STATUS-${(status || 'unknown').toUpperCase()}`,
  RESPONSE_NOT_OBJECT: (name) => `M15-S03-AGT-${name}-RESPONSE-NOT-OBJECT`,
  CHECK_NOT_ARRAY: (name) => `M15-S03-AGT-${name}-CHECKS-NOT-ARRAY`,
  XIAOMI_LEAK: 'M15-S03-LEAK-XIAOMI',
  CRED_LEAK: 'M15-S03-LEAK-CRED',
  UUID_LEAK: 'M15-S03-LEAK-UUID',
});

function redacted(text) {
  return String(text == null ? '' : text)
    .replace(UUID_FULL, '<redacted-id>')
    .replace(/\bbearer\s+[A-Za-z0-9._\-]+/gi, 'bearer=<redacted>')
    .replace(/sk-[A-Za-z0-9._\-]+/g, 'sk-<redacted>')
    .replace(/tp-[A-Za-z0-9._\-]+/g, 'tp-<redacted>')
    .replace(CREDENTIAL_ASSIGNMENT, '<redacted-credential-fragment>');
}

function redactMessageTail(text, maxChars = MAX_MESSAGE_TAIL_CHARS) {
  const safe = redacted(text);
  if (safe.length <= maxChars) return safe;
  return `…${safe.slice(-maxChars)}`;
}

function redactAdapterConfig(config) {
  if (!config || typeof config !== 'object') return null;
  const cloned = JSON.parse(JSON.stringify(config));
  const scrub = (value) => {
    if (value == null) return value;
    if (typeof value === 'string') return UUID_FULL.test(value) ? '<redacted-id>' : value;
    if (Array.isArray(value)) return value.map(scrub);
    if (typeof value === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        if (/api[_-]?key|secret|password|token/i.test(k)) { out[k] = '<redacted>'; continue; }
        out[k] = scrub(v);
      }
      return out;
    }
    return value;
  };
  return scrub(cloned);
}

function scrubEvidence(value) {
  if (value == null) return value;
  if (typeof value === 'string') {
    if (UUID_FULL.test(value)) return '<redacted-id>';
    if (CREDENTIAL_ASSIGNMENT.test(value)) return '<redacted-credential-fragment>';
    return value;
  }
  if (Array.isArray(value)) return value.map(scrubEvidence);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (/api[_-]?key|secret|password|token/i.test(k)) { out[k] = '<redacted>'; continue; }
      out[k] = scrubEvidence(v);
    }
    return out;
  }
  return value;
}

async function discoverCanonicalAgents(contract, request) {
  const companies = unwrapList(await request('GET', '/api/companies'), ['companies', 'items']);
  const company = companies.find((item) => (item.issuePrefix || item.issue_prefix) === contract.company.issue_prefix);
  if (!company) throw new Error(`company ${contract.company.issue_prefix} not visible`);
  const companyId = company.id;
  const listed = unwrapList(await request('GET', `/api/companies/${encodeURIComponent(companyId)}/agents`), ['agents', 'items']);
  const byName = new Map(listed.map((agent) => [agent.name, agent]));
  const found = {};
  const missing = [];
  for (const name of CANONICAL_DIVISION_NAMES) {
    const live = byName.get(name);
    if (!live) { missing.push(name); continue; }
    found[name] = { id: live.id, role: live.role, reportsTo: live.reportsTo };
  }
  return { companyId, company, byName, found, missing };
}

async function probeTestEnvironment(request, companyId, adapterConfig) {
  const url = `/api/companies/${encodeURIComponent(companyId)}/adapters/hermes_local/test-environment`;
  let response;
  try {
    response = await request('POST', url, { adapterConfig });
  } catch (error) {
    return {
      http_status: 0,
      body_kind: 'fetch-error',
      error_message: redactError(error),
      checks: [],
    };
  }
  const checks = Array.isArray(response && response.checks) ? response.checks : null;
  const result = {
    http_status: response && typeof response.http_status === 'number'
      ? response.http_status
      : (response && response.status && typeof response.status === 'string' ? 200 : 200),
    body_kind: response && typeof response === 'object' && !Array.isArray(response) ? 'object' : 'other',
    response_status: typeof response === 'object' && response !== null ? response.status : undefined,
    error: response && typeof response === 'object' && response !== null ? response.error : undefined,
    checks: Array.isArray(checks)
      ? checks.map((entry) => ({
          code: entry && entry.code,
          status: entry && entry.status,
          message_tail: redactMessageTail(entry && entry.message),
        }))
      : [],
  };
  return result;
}

function buildProbeEvidence(contract, records, blockers, options) {
  const orderedNames = CANONICAL_DIVISION_NAMES.filter((name) => contract.mutation_gate.mutation_order.includes(name));
  const usedOrder = orderedNames.length === contract.mutation_gate.mutation_order.length
    ? contract.mutation_gate.mutation_order
    : CANONICAL_DIVISION_NAMES;
  const xiaomiTouched = records.some((record) => record && record.aggregate_xiaomi_detected);
  return {
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s03-seven-agent-test-environment.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S03',
    task: 'T01',
    generated: new Date().toISOString(),
    status: blockers.some((entry) => entry.severity === 'blocking') ? 'FAIL_CLOSED' : 'PASS',
    company: contract.company,
    source_contract: 'runtime-evidence/M015-S01-seven-agent-target-contract.json',
    cross_reference: 'runtime-evidence/M015-S02-seven-agent-after.json',
    probe_endpoint: 'POST /api/companies/{companyId}/adapters/hermes_local/test-environment',
    agent_count_expected: contract.agent_count || 7,
    probe_count_observed: records.length,
    probe_order: usedOrder,
    pass_count: records.filter((record) => record.verdict === 'pass').length,
    fail_count: records.filter((record) => record.verdict !== 'pass').length,
    blockers: blockers.map((entry) => ({ code: entry.code, severity: entry.severity, agent: entry.agent || null, reason: entry.reason })),
    agents: records.map((record) => ({
      name: record.name,
      agent_role_observed: record.agent_role_observed || null,
      adapter_config_redacted: redactAdapterConfig(record.adapter_config_observed),
      testEnvironment: {
        http_status: record.testEnvironment.http_status,
        response_status: record.testEnvironment.response_status,
        body_kind: record.testEnvironment.body_kind,
        error_message: record.testEnvironment.error_message || null,
        check_codes: record.testEnvironment.checks.map((entry) => entry.code).filter(Boolean),
        check_statuses: record.testEnvironment.checks.map((entry) => entry.status).filter((value) => value != null),
        redaction_safe_message_tail: record.testEnvironment.checks.map((entry) => entry.message_tail).filter(Boolean),
      },
      verdict: record.verdict,
      blocker_code: record.blocker_code || null,
      xiaomi_endpoint_reuse_detected: !!record.aggregate_xiaomi_detected,
    })),
    xiaomi_endpoint_reuse_detected: xiaomiTouched,
    redaction: { full_ids: false, credentials: false },
    probe_elapsed_ms: options && typeof options.elapsed_ms === 'number' ? options.elapsed_ms : null,
  };
}

async function run() {
  const env = loadEnv();
  if (!env.PAPERCLIP_EMAIL || !env.PAPERCLIP_PASSWORD) {
    throw new Error('PAPERCLIP_EMAIL/PAPERCLIP_PASSWORD missing — set in .env before running the live probe');
  }
  const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
  const beforeContract = (() => {
    try { return fs.readFileSync(S02_AFTER_PATH, 'utf8'); } catch { return null; }
  })();
  const request = await makeBoardClient({
    baseUrl: env.PAPERCLIP_BASE_URL || DEFAULT_BASE_URL,
    origin: env.PAPERCLIP_ORIGIN || DEFAULT_ORIGIN,
    email: env.PAPERCLIP_EMAIL,
    password: env.PAPERCLIP_PASSWORD,
  });
  const startedAt = Date.now();

  const discovery = await discoverCanonicalAgents(contract, request);
  const blockers = [];
  const records = [];

  if (discovery.missing.length) {
    blockers.push({
      code: BLOCKER_CODES.NAME_MISSING(discovery.missing[0]),
      severity: 'blocking',
      agent: discovery.missing[0],
      reason: `canonical agents missing from company roster: ${discovery.missing.join(', ')}`,
    });
    const evidence = buildProbeEvidence(contract, records, blockers, { elapsed_ms: Date.now() - startedAt });
    writeEvidence(evidence, beforeContract);
    process.exit(1);
  }

  const liveNames = Array.from(discovery.byName.keys()).sort();
  const wantedCanonical = [...CANONICAL_DIVISION_NAMES].sort();
  const extraLive = liveNames.filter((name) => !wantedCanonical.includes(name) && name !== 'CEO');
  const missingCanonical = wantedCanonical.filter((name) => !discovery.byName.has(name));
  if (extraLive.length || missingCanonical.length) {
    blockers.push({
      code: BLOCKER_CODES.NAME_DRIFT,
      severity: 'blocking',
      agent: null,
      reason: `live name drift: extra=${extraLive.join(',') || 'none'} missing=${missingCanonical.join(',') || 'none'}`,
    });
  }

  for (const name of contract.mutation_gate.mutation_order) {
    const liveAgentMeta = discovery.found[name];
    if (!liveAgentMeta) continue;
    const liveAgentDetail = await request('GET', `/api/agents/${encodeURIComponent(liveAgentMeta.id)}`);
    const adapterConfig = liveAgentDetail && liveAgentDetail.adapterConfig;
    const probeResult = await probeTestEnvironment(request, discovery.companyId, adapterConfig);

    const httpStatus = probeResult.http_status;
    const aggregateXiami = probeResult.checks.some((entry) => XIAOMI_RE.test(`${entry.code || ''} ${entry.message_tail || ''}`));
    const credLeak = probeResult.checks.some((entry) => CREDENTIAL_ASSIGNMENT.test(`${entry.message_tail || ''}`))
      || CREDENTIAL_ASSIGNMENT.test(`${probeResult.error_message || ''}`);

    let verdict = 'fail';
    let blocker = null;
    if (httpStatus < 200 || httpStatus >= 300) {
      verdict = 'fail';
      blocker = { code: BLOCKER_CODES.HTTP_NON_SUCCESS(name, httpStatus || 'NETWORK'), severity: 'blocking', agent: name, reason: `HTTP ${httpStatus || 'network error'} from test-environment` };
    } else if (typeof probeResult.response_status !== 'string') {
      verdict = 'fail';
      blocker = { code: BLOCKER_CODES.RESPONSE_NOT_OBJECT(name), severity: 'blocking', agent: name, reason: 'response did not include response_status field' };
    } else if (probeResult.response_status !== 'pass') {
      verdict = probeResult.response_status === 'warn' ? 'warn' : 'fail';
      blocker = { code: BLOCKER_CODES.STATUS_NOT_PASS(name, probeResult.response_status), severity: 'blocking', agent: name, reason: `response status ${probeResult.response_status}` };
    } else {
      verdict = 'pass';
    }

    if (aggregateXiami && !blocker) {
      blocker = { code: BLOCKER_CODES.XIAOMI_LEAK, severity: 'blocking', agent: name, reason: 'xiaomi or mimo string detected in check codes or messages' };
      verdict = 'fail';
    }
    if (credLeak && !blocker) {
      blocker = { code: BLOCKER_CODES.CRED_LEAK, severity: 'blocking', agent: name, reason: 'credential assignment or token fragment detected in redacted output' };
      verdict = 'fail';
    }

    if (blocker) blockers.push(blocker);

    records.push({
      name,
      agent_role_observed: liveAgentDetail.role || liveAgentMeta.role || null,
      adapter_config_observed: adapterConfig,
      testEnvironment: {
        http_status: httpStatus,
        response_status: probeResult.response_status,
        body_kind: probeResult.body_kind,
        error_message: probeResult.error_message || null,
        checks: probeResult.checks,
      },
      verdict,
      blocker_code: blocker ? blocker.code : null,
      aggregate_xiaomi_detected: aggregateXiami,
    });

    if (blocker) break;
  }

  const evidence = buildProbeEvidence(contract, records, blockers, { elapsed_ms: Date.now() - startedAt });
  writeEvidence(evidence, beforeContract);
  const ok = !blockers.some((entry) => entry.severity === 'blocking');
  process.stdout.write(`M015_S03_PROBE=${ok ? 'pass' : 'fail'} pass=${evidence.pass_count} fail=${evidence.fail_count} blockers=${blockers.length}\n`);
  process.exit(ok ? 0 : 1);
}

function writeEvidence(evidence, beforeContractRaw) {
  const scrubbed = scrubEvidence(evidence);
  const serialized = JSON.stringify(scrubbed, null, 2) + '\n';
  if (UUID_FULL.test(serialized)) throw new Error(BLOCKER_CODES.UUID_LEAK);
  if (CREDENTIAL_ASSIGNMENT.test(serialized)) throw new Error(BLOCKER_CODES.CRED_LEAK);
  fs.writeFileSync(OUTPUT_PATH, serialized);
  if (beforeContractRaw && UUID_FULL.test(beforeContractRaw)) {
    process.stderr.write('reference S02 evidence contains a full UUID; cross-reference must be opt-in only\n');
  }
}

if (require.main === module) {
  run().catch((error) => {
    const failure = {
      $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s03-seven-agent-test-environment.v1.json',
      milestone: 'M015-4o8lfw',
      slice: 'S03',
      task: 'T01',
      generated: new Date().toISOString(),
      status: 'FAIL_CLOSED',
      reason: redactError(error),
      blockers: [{ code: 'M15-S03-RUNNER-FAILURE', severity: 'blocking', agent: null, reason: redactError(error) }],
      redaction: { full_ids: false, credentials: false },
    };
    try { fs.writeFileSync(OUTPUT_PATH, JSON.stringify(failure, null, 2) + '\n'); } catch (_) { /* best effort */ }
    process.stderr.write(`M015_S03_PROBE_FAIL=${redactError(error)}\n`);
    process.exit(2);
  });
}

module.exports = {
  BLOCKER_CODES,
  CANONICAL_DIVISION_NAMES,
  MAX_MESSAGE_TAIL_CHARS,
  XIAOMI_RE,
  CREDENTIAL_ASSIGNMENT,
  UUID_FULL,
  redacted,
  redactMessageTail,
  redactAdapterConfig,
  scrubEvidence,
  discoverCanonicalAgents,
  probeTestEnvironment,
  buildProbeEvidence,
};
