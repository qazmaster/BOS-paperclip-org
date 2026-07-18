#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const builder = require('./build_m015_seven_agent_contract');

const ROOT = path.resolve(__dirname, '..');
const BEFORE = path.join(ROOT, 'runtime-evidence/M015-S01-seven-agent-before.json');
const TARGET = path.join(ROOT, 'runtime-evidence/M015-S01-seven-agent-target-contract.json');
const BASE = path.join(ROOT, 'agents/PAPERCLIP_EXECUTION_CONTRACT.md');
const SHA = /^[0-9a-f]{64}$/;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const CREDENTIAL_ASSIGNMENT = /\b(?:PAPERCLIP_API_KEY|MINIMAX_API_KEY|XIAOMI_API_KEY|BETTER_AUTH_SECRET|POSTGRES_PASSWORD|DATABASE_URL)\s*=/i;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function blocker(code, message) {
  return { code, message };
}

function validateContract(before, target, sources = {}) {
  const blockers = [];
  const beforeRaw = sources.beforeRaw ?? JSON.stringify(before);
  const targetRaw = sources.targetRaw ?? JSON.stringify(target);
  const base = sources.base ?? fs.readFileSync(BASE, 'utf8');
  const roleReader = sources.roleReader ?? ((relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8'));
  const expectedNames = Object.keys(builder.ROLE_FILES).sort();

  if (!before || typeof before !== 'object' || before.agent_count !== 7 || !Array.isArray(before.agents) || before.agents.length !== 7) {
    blockers.push(blocker('M15-C01', 'before-state must contain exactly seven agents'));
  }
  if (!before?.backup?.integrity_verified || !SHA.test(before?.backup?.dump_sha256 || '') || !SHA.test(before?.backup?.manifest_sha256 || '')) {
    blockers.push(blocker('M15-C02', 'rollback backup integrity and hashes are required'));
  }
  if (UUID.test(beforeRaw) || UUID.test(targetRaw) || CREDENTIAL_ASSIGNMENT.test(beforeRaw) || CREDENTIAL_ASSIGNMENT.test(targetRaw)) {
    blockers.push(blocker('M15-C03', 'evidence contains a full UUID or credential assignment'));
  }

  if (!target || typeof target !== 'object' || target.agent_count !== 7 || !Array.isArray(target.agents) || target.agents.length !== 7) {
    blockers.push(blocker('M15-C04', 'target contract must contain exactly seven agents'));
    return blockers;
  }

  const names = target.agents.map((agent) => agent.name).sort();
  if (new Set(names).size !== 7 || JSON.stringify(names) !== JSON.stringify(expectedNames)) {
    blockers.push(blocker('M15-C05', 'target names must exactly match the seven canonical divisions'));
  }

  for (const agent of target.agents) {
    const prefix = `agent ${agent.name || '<missing>'}`;
    if (agent.title !== builder.TITLES[agent.name]) blockers.push(blocker('M15-C06', `${prefix} title drift`));
    if (agent.reports_to !== builder.PARENTS[agent.name]) blockers.push(blocker('M15-C07', `${prefix} hierarchy drift`));
    if (agent.adapter_type !== 'hermes_local' || agent.provider !== 'minimax' || agent.model !== 'MiniMax-M3') {
      blockers.push(blocker('M15-C08', `${prefix} must use hermes_local MiniMax M3`));
    }
    if (agent.persist_session !== true || agent.max_turns_per_run !== null) {
      blockers.push(blocker('M15-C09', `${prefix} must persist sessions without artificial max-turn cap`));
    }
    if (!Array.isArray(agent.extra_args) || agent.extra_args.length !== 0 || /xiaomi|mimo|--ignore-user-config|"-p"/i.test(JSON.stringify(agent))) {
      blockers.push(blocker('M15-C10', `${prefix} contains stale provider or legacy profile arguments`));
    }
    if (agent.instructions_bundle_mode !== 'managed' || agent.instructions_entry_file !== 'AGENTS.md') {
      blockers.push(blocker('M15-C11', `${prefix} managed AGENTS bundle is required`));
    }
    const expectedToolsets = builder.TOOLSETS[agent.name];
    if (agent.toolsets !== expectedToolsets || (agent.name !== 'Div6.External' && agent.toolsets.includes('web'))) {
      blockers.push(blocker('M15-C12', `${prefix} tool boundary drift`));
    }
    const expectedPermissions = ['Div1.HCO', 'Div7.MissionControl'].includes(agent.name) ? ['tasks:assign'] : [];
    if (JSON.stringify(agent.permissions) !== JSON.stringify(expectedPermissions)) {
      blockers.push(blocker('M15-C13', `${prefix} assignment permission drift`));
    }

    const rolePath = builder.ROLE_FILES[agent.name];
    if (agent.role_file !== rolePath) {
      blockers.push(blocker('M15-C14', `${prefix} role file mismatch`));
      continue;
    }
    const role = roleReader(rolePath);
    const combined = builder.combinedInstructions(base, role, agent.name);
    const hashes = agent.instruction_hashes || {};
    if (hashes.base_sha256 !== sha256(base) || hashes.role_sha256 !== sha256(role) || hashes.combined_sha256 !== sha256(combined)) {
      blockers.push(blocker('M15-C15', `${prefix} instruction hash mismatch`));
    }
  }

  const gate = target.mutation_gate || {};
  if (gate.rollback_integrity_required !== true || gate.exact_readback_required !== true || gate.test_environment_required_before_mission !== true || gate.rollback_on_first_failed_readback !== true || !Array.isArray(gate.mutation_order) || gate.mutation_order.length !== 7) {
    blockers.push(blocker('M15-C16', 'mutation gate is incomplete'));
  }

  return blockers;
}

function main() {
  const beforeRaw = fs.readFileSync(BEFORE, 'utf8');
  const targetRaw = fs.readFileSync(TARGET, 'utf8');
  const before = JSON.parse(beforeRaw);
  const target = JSON.parse(targetRaw);
  const blockers = validateContract(before, target, { beforeRaw, targetRaw });
  process.stdout.write(`${JSON.stringify({ verdict: blockers.length ? 'fail' : 'pass', blocker_count: blockers.length, blockers }, null, 2)}\n`);
  process.exit(blockers.length ? 1 : 0);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`M015_CONTRACT_VALIDATE_FAIL=${String(error && error.message || error).replace(/[0-9a-f]{8}-[0-9a-f-]{27}/ig, '<redacted-id>')}\n`);
    process.exit(2);
  }
}

module.exports = { validateContract };
