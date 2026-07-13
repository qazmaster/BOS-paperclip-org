#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const builder = require('./build_m015_seven_agent_contract');

const ROOT = path.resolve(__dirname, '..');
const CONTRACT_PATH = path.join(ROOT, 'runtime-evidence/M015-S01-seven-agent-target-contract.json');
const OUTPUT_PATH = path.join(ROOT, 'runtime-evidence/M015-S02-seven-agent-apply.json');
const BASE_PATH = path.join(ROOT, 'agents/PAPERCLIP_EXECUTION_CONTRACT.md');
const DEFAULT_BASE_URL = 'http://127.0.0.1:43131';
const DEFAULT_ORIGIN = 'https://paperclip.oysana.com';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function loadEnv(file = path.join(ROOT, '.env')) {
  const env = { ...process.env };
  if (!fs.existsSync(file)) return env;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[key] = value;
  }
  return env;
}

function extractCookie(headers) {
  const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get('set-cookie')].filter(Boolean);
  return values.map((value) => String(value).split(';')[0]).filter(Boolean).join('; ');
}

function redactError(error) {
  return String(error && error.message || error)
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/ig, '<redacted-id>')
    .replace(/(bearer|token|password|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/ig, '$1=<redacted>')
    .slice(0, 500);
}

function buildAdapterConfig(target) {
  return {
    provider: target.provider,
    model: target.model,
    timeoutSec: target.timeout_sec,
    graceSec: target.grace_sec,
    persistSession: target.persist_session,
    toolsets: target.toolsets,
    quiet: target.quiet,
  };
}

function assembleInstructions(target, base, role) {
  return builder.combinedInstructions(base, role, target.name);
}

function buildAgentPatch(target, parentId) {
  return {
    title: target.title,
    reportsTo: parentId,
    adapterType: target.adapter_type,
    adapterConfig: buildAdapterConfig(target),
    replaceAdapterConfig: true,
  };
}

function verifyReadback(agent, file, target, parentId, expectedHash) {
  const config = agent && agent.adapterConfig || {};
  const errors = [];
  if (agent.title !== target.title) errors.push('title');
  if (agent.reportsTo !== parentId) errors.push('reportsTo');
  if (agent.adapterType !== target.adapter_type) errors.push('adapterType');
  if (config.provider !== target.provider) errors.push('provider');
  if (config.model !== target.model) errors.push('model');
  if (config.persistSession !== true) errors.push('persistSession');
  if (config.toolsets !== target.toolsets) errors.push('toolsets');
  if (Array.isArray(config.extraArgs) && config.extraArgs.length > 0) errors.push('extraArgs');
  if (config.instructionsBundleMode !== 'managed') errors.push('instructionsBundleMode');
  if (config.instructionsEntryFile !== 'AGENTS.md') errors.push('instructionsEntryFile');
  const content = file && (file.content || file.body || file.text);
  if (typeof content !== 'string' || sha256(content) !== expectedHash) errors.push('instructionHash');
  return errors;
}

function unwrapList(payload, keys) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) if (Array.isArray(payload && payload[key])) return payload[key];
  return [];
}

async function makeBoardClient({ baseUrl, origin, email, password, fetchFn = fetch }) {
  const auth = await fetchFn(new URL('/api/auth/sign-in/email', baseUrl), {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', origin, referer: `${origin}/` },
    body: JSON.stringify({ email, password }),
  });
  if (!auth.ok) throw new Error(`board sign-in failed HTTP ${auth.status}`);
  const cookie = extractCookie(auth.headers);
  if (!cookie) throw new Error('board sign-in returned no session cookie');
  return async function request(method, requestPath, body) {
    const response = await fetchFn(new URL(requestPath, baseUrl), {
      method,
      headers: { accept: 'application/json', 'content-type': 'application/json', cookie, origin, referer: `${origin}/` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { error: 'non-json response' }; }
    if (!response.ok) throw new Error(`${method} ${requestPath} failed HTTP ${response.status}: ${parsed && parsed.error || 'request failed'}`);
    return parsed;
  };
}

async function applyContract({ contract, base, roleReader, request }) {
  const journal = [];
  const companies = unwrapList(await request('GET', '/api/companies'), ['companies', 'items']);
  const company = companies.find((item) => (item.issuePrefix || item.issue_prefix) === contract.company.issue_prefix);
  if (!company) throw new Error(`company ${contract.company.issue_prefix} not visible`);
  const companyId = company.id;
  const agents = unwrapList(await request('GET', `/api/companies/${encodeURIComponent(companyId)}/agents`), ['agents', 'items']);
  const byName = new Map(agents.map((agent) => [agent.name, agent]));
  const missing = contract.agents.filter((target) => !byName.has(target.name)).map((target) => target.name);
  if (missing.length) throw new Error(`canonical agents missing: ${missing.join(', ')}`);
  const ceo = byName.get('CEO') || agents.find((agent) => agent.role === 'ceo');
  if (!ceo) throw new Error('CEO parent agent not found');

  const order = contract.mutation_gate.mutation_order;
  for (const name of order) {
    const target = contract.agents.find((agent) => agent.name === name);
    const current = byName.get(name);
    const parent = target.reports_to === 'CEO' ? ceo : byName.get(target.reports_to);
    if (!parent) throw new Error(`parent ${target.reports_to} not found for ${name}`);
    const role = roleReader(target.role_file);
    const instructions = assembleInstructions(target, base, role);
    const expectedHash = sha256(instructions);
    if (expectedHash !== target.instruction_hashes.combined_sha256) throw new Error(`local instruction hash drift for ${name}`);

    try {
      await request('PATCH', `/api/agents/${encodeURIComponent(current.id)}`, buildAgentPatch(target, parent.id));
      journal.push({ agent: name, operation: 'agent-config', status: 'confirmed' });
      await request('PUT', `/api/agents/${encodeURIComponent(current.id)}/instructions-bundle/file`, {
        path: 'AGENTS.md',
        content: instructions,
        clearLegacyPromptTemplate: true,
      });
      journal.push({ agent: name, operation: 'instructions', status: 'confirmed', instruction_sha256: expectedHash });
      const readAgent = await request('GET', `/api/agents/${encodeURIComponent(current.id)}`);
      const readFile = await request('GET', `/api/agents/${encodeURIComponent(current.id)}/instructions-bundle/file?path=AGENTS.md`);
      const errors = verifyReadback(readAgent, readFile, target, parent.id, expectedHash);
      if (errors.length) throw new Error(`exact readback mismatch for ${name}: ${errors.join(', ')}`);
      journal.push({
        agent: name,
        operation: 'exact-readback',
        status: 'confirmed',
        title: target.title,
        reports_to: target.reports_to,
        adapter_type: target.adapter_type,
        provider: target.provider,
        model: target.model,
        persist_session: true,
        max_turns_per_run: null,
        toolsets: target.toolsets,
        instruction_sha256: expectedHash,
      });
      Object.assign(current, readAgent);
    } catch (error) {
      journal.push({ agent: name, operation: 'apply', status: 'failed', reason: redactError(error) });
      return { ok: false, failedAgent: name, journal };
    }
  }
  return { ok: true, failedAgent: null, journal };
}

function buildEvidence(contract, result) {
  const confirmed = new Set(result.journal.filter((entry) => entry.operation === 'exact-readback' && entry.status === 'confirmed').map((entry) => entry.agent));
  return {
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-seven-agent-apply.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S02',
    task: 'T02',
    generated: new Date().toISOString(),
    status: result.ok ? 'PASS' : 'FAIL_CLOSED',
    company: contract.company,
    target_contract: 'runtime-evidence/M015-S01-seven-agent-target-contract.json',
    agent_count_expected: 7,
    agent_count_confirmed: confirmed.size,
    failed_agent: result.failedAgent,
    operation_journal: result.journal,
    stale_xiaomi_remaining_in_confirmed_readbacks: result.journal.filter((entry) => entry.operation === 'exact-readback' && /xiaomi|mimo/i.test(JSON.stringify(entry))).length,
    redaction: { full_ids: false, credentials: false },
  };
}

async function main() {
  const env = loadEnv();
  if (!env.PAPERCLIP_EMAIL || !env.PAPERCLIP_PASSWORD) throw new Error('PAPERCLIP_EMAIL/PAPERCLIP_PASSWORD missing');
  const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
  const base = fs.readFileSync(BASE_PATH, 'utf8');
  const request = await makeBoardClient({
    baseUrl: env.PAPERCLIP_BASE_URL || DEFAULT_BASE_URL,
    origin: env.PAPERCLIP_ORIGIN || DEFAULT_ORIGIN,
    email: env.PAPERCLIP_EMAIL,
    password: env.PAPERCLIP_PASSWORD,
  });
  const result = await applyContract({
    contract,
    base,
    roleReader: (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8'),
    request,
  });
  const evidence = buildEvidence(contract, result);
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`M015_APPLY_OK=${result.ok ? 'yes' : 'no'} confirmed=${evidence.agent_count_confirmed} failed=${result.failedAgent || 'none'}\n`);
  process.exit(result.ok ? 0 : 2);
}

if (require.main === module) {
  main().catch((error) => {
    const failure = {
      $schema: 'https://gsd.local/schemas/runtime-evidence/m015-seven-agent-apply.v1.json',
      milestone: 'M015-4o8lfw', slice: 'S02', task: 'T02', generated: new Date().toISOString(),
      status: 'FAIL_CLOSED', agent_count_expected: 7, agent_count_confirmed: 0, failed_agent: null,
      failure: redactError(error), redaction: { full_ids: false, credentials: false },
    };
    fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(failure, null, 2)}\n`);
    process.stderr.write(`M015_APPLY_FAIL=${failure.failure}\n`);
    process.exit(2);
  });
}

module.exports = { loadEnv, makeBoardClient, unwrapList, assembleInstructions, buildAdapterConfig, buildAgentPatch, verifyReadback, applyContract, buildEvidence, redactError };
