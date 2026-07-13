#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { loadEnv, makeBoardClient, unwrapList, redactError } = require('./apply_m015_seven_agent_contract');

const ROOT = path.resolve(__dirname, '..');
const CONTRACT = path.join(ROOT, 'runtime-evidence/M015-S01-seven-agent-target-contract.json');
const OUTPUT = path.join(ROOT, 'runtime-evidence/M015-S02-seven-agent-grants.json');

function buildPermissionPayload(agent, canAssignTasks) {
  const current = agent && agent.permissions || {};
  const payload = {
    canCreateAgents: current.canCreateAgents === true,
    canCreateSkills: current.canCreateSkills === true,
    canAssignTasks,
  };
  if (current.trustPreset) payload.trustPreset = current.trustPreset;
  if (current.authorizationPolicy) payload.authorizationPolicy = current.authorizationPolicy;
  return payload;
}

async function main() {
  const env = loadEnv();
  if (!env.PAPERCLIP_EMAIL || !env.PAPERCLIP_PASSWORD) throw new Error('Paperclip credentials missing');
  const contract = JSON.parse(fs.readFileSync(CONTRACT, 'utf8'));
  const request = await makeBoardClient({
    baseUrl: env.PAPERCLIP_BASE_URL || 'http://127.0.0.1:43131',
    origin: env.PAPERCLIP_ORIGIN || 'https://paperclip.oysana.com',
    email: env.PAPERCLIP_EMAIL,
    password: env.PAPERCLIP_PASSWORD,
  });
  const companies = unwrapList(await request('GET', '/api/companies'), ['companies', 'items']);
  const company = companies.find((item) => (item.issuePrefix || item.issue_prefix) === contract.company.issue_prefix);
  if (!company) throw new Error('AIP company not visible');
  const agents = unwrapList(await request('GET', `/api/companies/${encodeURIComponent(company.id)}/agents`), ['agents', 'items']);
  const byName = new Map(agents.map((agent) => [agent.name, agent]));
  const journal = [];
  for (const target of contract.agents) {
    const agent = byName.get(target.name);
    if (!agent) throw new Error(`missing agent ${target.name}`);
    const canAssignTasks = target.permissions.includes('tasks:assign');
    try {
      const updated = await request('PATCH', `/api/agents/${encodeURIComponent(agent.id)}/permissions`, buildPermissionPayload(agent, canAssignTasks));
      const actual = updated && updated.permissions && updated.permissions.canAssignTasks;
      if (actual !== canAssignTasks) throw new Error(`permission readback mismatch for ${target.name}`);
      journal.push({ agent: target.name, tasks_assign: canAssignTasks, status: 'confirmed' });
    } catch (error) {
      journal.push({ agent: target.name, tasks_assign: canAssignTasks, status: 'failed', reason: redactError(error) });
      const evidence = { milestone: 'M015-4o8lfw', slice: 'S02', task: 'T03', generated: new Date().toISOString(), status: 'FAIL_CLOSED', confirmed: journal.filter((x) => x.status === 'confirmed').length, failed_agent: target.name, journal, redaction: { full_ids: false, credentials: false } };
      fs.writeFileSync(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`);
      process.stdout.write(`M015_GRANTS_OK=no confirmed=${evidence.confirmed} failed=${target.name}\n`);
      process.exit(2);
    }
  }
  const evidence = { milestone: 'M015-4o8lfw', slice: 'S02', task: 'T03', generated: new Date().toISOString(), status: 'PASS', confirmed: journal.length, failed_agent: null, journal, redaction: { full_ids: false, credentials: false } };
  fs.writeFileSync(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`M015_GRANTS_OK=yes confirmed=${journal.length}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`M015_GRANTS_FAIL=${redactError(error)}\n`);
    process.exit(2);
  });
}

module.exports = { buildPermissionPayload };
