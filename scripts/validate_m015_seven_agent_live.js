#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { loadEnv, makeBoardClient, unwrapList, redactError } = require('./apply_m015_seven_agent_contract');

const ROOT = path.resolve(__dirname, '..');
const CONTRACT_PATH = path.join(ROOT, 'runtime-evidence/M015-S01-seven-agent-target-contract.json');
const OUTPUT_PATH = path.join(ROOT, 'runtime-evidence/M015-S02-seven-agent-after.json');
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

async function main() {
  const env = loadEnv();
  if (!env.PAPERCLIP_EMAIL || !env.PAPERCLIP_PASSWORD) throw new Error('Paperclip credentials missing');
  const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
  const request = await makeBoardClient({ baseUrl: env.PAPERCLIP_BASE_URL || 'http://127.0.0.1:43131', origin: env.PAPERCLIP_ORIGIN || 'https://paperclip.oysana.com', email: env.PAPERCLIP_EMAIL, password: env.PAPERCLIP_PASSWORD });
  const companies = unwrapList(await request('GET', '/api/companies'), ['companies', 'items']);
  const company = companies.find((item) => (item.issuePrefix || item.issue_prefix) === contract.company.issue_prefix);
  if (!company) throw new Error('AIP company not visible');
  const listed = unwrapList(await request('GET', `/api/companies/${encodeURIComponent(company.id)}/agents`), ['agents', 'items']);
  const byName = new Map(listed.map((agent) => [agent.name, agent]));
  const blockers = [];
  const agents = [];

  for (const target of contract.agents) {
    const listedAgent = byName.get(target.name);
    if (!listedAgent) { blockers.push(`${target.name}:missing`); continue; }
    const agent = await request('GET', `/api/agents/${encodeURIComponent(listedAgent.id)}`);
    const file = await request('GET', `/api/agents/${encodeURIComponent(listedAgent.id)}/instructions-bundle/file?path=AGENTS.md`);
    const parent = target.reports_to === 'CEO' ? (byName.get('CEO') || listed.find((item) => item.role === 'ceo')) : byName.get(target.reports_to);
    const config = agent.adapterConfig || {};
    const content = file && (file.content || file.body || file.text) || '';
    const permissions = agent.permissions || {};
    const actual = {
      name: target.name,
      title: agent.title,
      reports_to: parent && agent.reportsTo === parent.id ? target.reports_to : '<mismatch>',
      adapter_type: agent.adapterType,
      provider: config.provider,
      model: config.model,
      timeout_sec: config.timeoutSec,
      grace_sec: config.graceSec,
      persist_session: config.persistSession,
      max_turns_per_run: config.maxTurnsPerRun ?? null,
      toolsets: config.toolsets,
      quiet: config.quiet,
      legacy_extra_args_present: Array.isArray(config.extraArgs) && config.extraArgs.length > 0,
      instructions_bundle_mode: config.instructionsBundleMode,
      instructions_entry_file: config.instructionsEntryFile,
      instruction_sha256: sha256(content),
      tasks_assign: permissions.canAssignTasks === true,
    };
    const expectedAssign = target.permissions.includes('tasks:assign');
    const mismatches = [];
    for (const [key, expected] of Object.entries({
      title: target.title, reports_to: target.reports_to, adapter_type: target.adapter_type,
      provider: target.provider, model: target.model, timeout_sec: target.timeout_sec,
      grace_sec: target.grace_sec, persist_session: true, max_turns_per_run: null,
      toolsets: target.toolsets, quiet: true, legacy_extra_args_present: false,
      instructions_bundle_mode: 'managed', instructions_entry_file: 'AGENTS.md',
      instruction_sha256: target.instruction_hashes.combined_sha256, tasks_assign: expectedAssign,
    })) if (actual[key] !== expected) mismatches.push(key);
    if (mismatches.length) blockers.push(`${target.name}:${mismatches.join(',')}`);
    agents.push({ ...actual, verdict: mismatches.length ? 'fail' : 'pass' });
  }

  const evidence = {
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-seven-agent-after.v1.json',
    milestone: 'M015-4o8lfw', slice: 'S02', task: 'T03', generated: new Date().toISOString(),
    status: blockers.length ? 'FAIL_CLOSED' : 'PASS', company: contract.company,
    source_contract: 'runtime-evidence/M015-S01-seven-agent-target-contract.json',
    agent_count_expected: 7, agent_count_observed: agents.length,
    pass_count: agents.filter((agent) => agent.verdict === 'pass').length,
    blockers, agents,
    rollback_reference: 'runtime-evidence/M015-S01-seven-agent-before.json#backup',
    redaction: { full_ids: false, credentials: false },
  };
  const serialized = JSON.stringify(evidence, null, 2) + '\n';
  if (UUID.test(serialized)) throw new Error('after evidence UUID leak');
  fs.writeFileSync(OUTPUT_PATH, serialized);
  process.stdout.write(`M015_LIVE_VALIDATE=${blockers.length ? 'fail' : 'pass'} agents=${agents.length} blockers=${blockers.length}\n`);
  process.exit(blockers.length ? 1 : 0);
}

main().catch((error) => {
  process.stderr.write(`M015_LIVE_VALIDATE_ERROR=${redactError(error)}\n`);
  process.exit(2);
});
