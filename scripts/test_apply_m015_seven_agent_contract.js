#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const {
  assembleInstructions,
  buildAdapterConfig,
  buildAgentPatch,
  verifyReadback,
  applyContract,
  buildEvidence,
  redactError,
} = require('./apply_m015_seven_agent_contract');
const { buildPermissionPayload } = require('./reconcile_m015_seven_agent_grants');

const ROOT = path.resolve(__dirname, '..');
const contract = require('../runtime-evidence/M015-S01-seven-agent-target-contract.json');
const base = fs.readFileSync(path.join(ROOT, 'agents/PAPERCLIP_EXECUTION_CONTRACT.md'), 'utf8');

function makeFake({ failAgent = null } = {}) {
  const parentNames = ['CEO', ...contract.agents.map((agent) => agent.name)];
  const agents = parentNames.map((name, index) => ({
    id: `agent-${index}`,
    companyId: 'company-aip',
    name,
    title: name === 'CEO' ? 'CEO' : 'old',
    role: name === 'CEO' ? 'ceo' : 'member',
    reportsTo: null,
    adapterType: 'hermes_local',
    adapterConfig: {},
  }));
  const files = new Map();
  const requests = [];
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const request = async (method, requestPath, body) => {
    requests.push({ method, path: requestPath, body });
    if (method === 'GET' && requestPath === '/api/companies') return [{ id: 'company-aip', issuePrefix: 'AIP' }];
    if (method === 'GET' && requestPath === '/api/companies/company-aip/agents') return agents;
    const match = requestPath.match(/^\/api\/agents\/([^/?]+)/);
    const id = match && decodeURIComponent(match[1]);
    const agent = byId.get(id);
    if (!agent) throw new Error('agent not found');
    if (method === 'PATCH' && requestPath === `/api/agents/${id}`) {
      if (agent.name === failAgent) throw new Error(`synthetic failure for ${agent.name}`);
      agent.title = body.title;
      agent.reportsTo = body.reportsTo;
      agent.adapterType = body.adapterType;
      agent.adapterConfig = { ...body.adapterConfig };
      return agent;
    }
    if (method === 'PUT' && requestPath.endsWith('/instructions-bundle/file')) {
      files.set(id, body.content);
      agent.adapterConfig.instructionsBundleMode = 'managed';
      agent.adapterConfig.instructionsEntryFile = 'AGENTS.md';
      return { path: body.path, content: body.content };
    }
    if (method === 'GET' && requestPath === `/api/agents/${id}`) return agent;
    if (method === 'GET' && requestPath.includes('/instructions-bundle/file?path=AGENTS.md')) return { path: 'AGENTS.md', content: files.get(id) };
    throw new Error(`unexpected ${method} ${requestPath}`);
  };
  return { request, requests, agents };
}

describe('M015 seven-agent apply runner', () => {
  it('assembles the standard execution contract before the division role', () => {
    const target = contract.agents[0];
    const role = fs.readFileSync(path.join(ROOT, target.role_file), 'utf8');
    const combined = assembleInstructions(target, base, role);
    assert.ok(combined.startsWith('# Paperclip Execution Contract'));
    assert.ok(combined.includes(`# BOS Division Contract: ${target.name}`));
    assert.ok(combined.includes(role.trim()));
  });

  it('builds a MiniMax config without legacy args or turn cap', () => {
    const config = buildAdapterConfig(contract.agents[0]);
    assert.deepEqual(Object.keys(config).sort(), ['graceSec', 'model', 'persistSession', 'provider', 'quiet', 'timeoutSec', 'toolsets'].sort());
    assert.equal(config.provider, 'minimax');
    assert.equal(config.model, 'MiniMax-M3');
    assert.equal(config.persistSession, true);
    assert.equal('extraArgs' in config, false);
    assert.equal('maxTurnsPerRun' in config, false);
  });

  it('builds exact title, parent, adapter, and replacement payload', () => {
    const patch = buildAgentPatch(contract.agents[0], 'parent-id');
    assert.equal(patch.reportsTo, 'parent-id');
    assert.equal(patch.replaceAdapterConfig, true);
    assert.equal(patch.adapterType, 'hermes_local');
  });

  it('verifies exact readback and detects stale args', () => {
    const target = contract.agents[0];
    const role = fs.readFileSync(path.join(ROOT, target.role_file), 'utf8');
    const content = assembleInstructions(target, base, role);
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    const agent = { title: target.title, reportsTo: 'parent-id', adapterType: 'hermes_local', adapterConfig: { ...buildAdapterConfig(target), instructionsBundleMode: 'managed', instructionsEntryFile: 'AGENTS.md' } };
    assert.deepEqual(verifyReadback(agent, { content }, target, 'parent-id', hash), []);
    agent.adapterConfig.extraArgs = ['-p', 'legacy'];
    assert.ok(verifyReadback(agent, { content }, target, 'parent-id', hash).includes('extraArgs'));
  });

  it('applies all seven in mutation order and emits redacted evidence', async () => {
    const fake = makeFake();
    const result = await applyContract({ contract, base, roleReader: (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8'), request: fake.request });
    assert.equal(result.ok, true);
    const applied = result.journal.filter((entry) => entry.operation === 'exact-readback').map((entry) => entry.agent);
    assert.deepEqual(applied, contract.mutation_gate.mutation_order);
    const evidence = buildEvidence(contract, result);
    assert.equal(evidence.status, 'PASS');
    assert.equal(evidence.agent_count_confirmed, 7);
    assert.equal(/[0-9a-f]{8}-[0-9a-f-]{27}/i.test(JSON.stringify(evidence)), false);
  });

  it('stops on the first failed agent and never touches later agents', async () => {
    const fake = makeFake({ failAgent: 'Div1.HCO' });
    const result = await applyContract({ contract, base, roleReader: (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8'), request: fake.request });
    assert.equal(result.ok, false);
    assert.equal(result.failedAgent, 'Div1.HCO');
    const patchedNames = fake.requests.filter((entry) => entry.method === 'PATCH').map((entry) => fake.agents.find((agent) => entry.path.endsWith(agent.id)).name);
    assert.deepEqual(patchedNames, ['Div7.MissionControl', 'Div1.HCO']);
    assert.equal(patchedNames.includes('Div2.MasterPlanner'), false);
  });

  it('preserves existing creation/trust settings while changing task assignment', () => {
    const payload = buildPermissionPayload({ permissions: { canCreateAgents: false, canCreateSkills: true, trustPreset: 'restricted' } }, true);
    assert.deepEqual(payload, { canCreateAgents: false, canCreateSkills: true, canAssignTasks: true, trustPreset: 'restricted' });
  });

  it('redacts UUIDs and credential-like values from failures', () => {
    const text = redactError(new Error('token=abc123 id=11111111-1111-4111-8111-111111111111'));
    assert.equal(text.includes('abc123'), false);
    assert.equal(text.includes('11111111-1111-4111-8111-111111111111'), false);
  });
});
