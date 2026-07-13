#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BEFORE_PATH = path.join(ROOT, 'runtime-evidence/M015-S01-seven-agent-before.json');
const OUTPUT_PATH = path.join(ROOT, 'runtime-evidence/M015-S01-seven-agent-target-contract.json');
const BASE_PATH = path.join(ROOT, 'agents/PAPERCLIP_EXECUTION_CONTRACT.md');

const ROLE_FILES = {
  'Div1.HCO': 'agents/Div1_HCO/AGENTS.md',
  'Div2.MasterPlanner': 'agents/Div2_MasterPlanner/AGENTS.md',
  'Div3.Treasury': 'agents/Div3_Treasury/AGENTS.md',
  'Div4.Production': 'agents/Div4_Production/AGENTS.md',
  'Div5.QualificationsLibraryLearning': 'agents/Div5_QualificationsLibraryLearning/AGENTS.md',
  'Div6.External': 'agents/Div6_External/AGENTS.md',
  'Div7.MissionControl': 'agents/Div7_MissionControl/AGENTS.md',
};

const TITLES = {
  'Div1.HCO': 'Head Communication Office',
  'Div2.MasterPlanner': 'Shaping / Product Planning',
  'Div3.Treasury': 'Treasury / Budget / Access',
  'Div4.Production': 'Production / Build / Delivery',
  'Div5.QualificationsLibraryLearning': 'Qualifications / Library / Learning',
  'Div6.External': 'External / DMZ',
  'Div7.MissionControl': 'Mission Control / Strategy',
};

const PARENTS = {
  'Div1.HCO': 'Div7.MissionControl',
  'Div2.MasterPlanner': 'Div1.HCO',
  'Div3.Treasury': 'Div1.HCO',
  'Div4.Production': 'Div1.HCO',
  'Div5.QualificationsLibraryLearning': 'Div1.HCO',
  'Div6.External': 'Div1.HCO',
  // Paperclip keeps the company CEO as the board-level principal above BOS.
  'Div7.MissionControl': 'CEO',
};

const TOOLSETS = {
  'Div1.HCO': 'terminal,file',
  'Div2.MasterPlanner': 'terminal,file',
  'Div3.Treasury': 'terminal,file',
  'Div4.Production': 'terminal,file',
  'Div5.QualificationsLibraryLearning': 'terminal,file',
  'Div6.External': 'terminal,file,web',
  'Div7.MissionControl': 'terminal,file',
};

const ASSIGN_PERMISSIONS = new Set(['Div1.HCO', 'Div7.MissionControl']);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function combinedInstructions(base, role, name) {
  return `${base.trim()}\n\n---\n\n# BOS Division Contract: ${name}\n\n${role.trim()}\n`;
}

function diffKeys(before, target) {
  const keys = ['title', 'reports_to', 'adapter_type', 'provider', 'model', 'persist_session', 'max_turns_per_run', 'toolsets', 'instructions_bundle_mode'];
  return keys.filter((key) => JSON.stringify(before[key] ?? null) !== JSON.stringify(target[key] ?? null));
}

function main() {
  const before = readJson(BEFORE_PATH);
  const base = fs.readFileSync(BASE_PATH, 'utf8');
  const byName = new Map(before.agents.map((agent) => [agent.name, agent]));
  const names = Object.keys(ROLE_FILES).sort();
  if (before.agent_count !== 7 || byName.size !== 7 || names.some((name) => !byName.has(name))) {
    throw new Error('before-state must contain exactly the seven canonical division agents');
  }

  const agents = names.map((name) => {
    const rolePath = ROLE_FILES[name];
    const role = fs.readFileSync(path.join(ROOT, rolePath), 'utf8');
    const combined = combinedInstructions(base, role, name);
    const target = {
      name,
      title: TITLES[name],
      reports_to: PARENTS[name],
      adapter_type: 'hermes_local',
      provider: 'minimax',
      model: 'MiniMax-M3',
      timeout_sec: 600,
      grace_sec: 5,
      persist_session: true,
      max_turns_per_run: null,
      toolsets: TOOLSETS[name],
      quiet: true,
      extra_args: [],
      instructions_bundle_mode: 'managed',
      instructions_entry_file: 'AGENTS.md',
      permissions: ASSIGN_PERMISSIONS.has(name) ? ['tasks:assign'] : [],
      external_io_allowed: name === 'Div6.External',
      role_file: rolePath,
      instruction_hashes: {
        base_sha256: sha256(base),
        role_sha256: sha256(role),
        combined_sha256: sha256(combined),
      },
      combined_instruction_bytes: Buffer.byteLength(combined),
    };
    return {
      ...target,
      before_diff_keys: diffKeys(byName.get(name), target),
      stale_fields_to_remove: ['extraArgs'],
    };
  });

  const output = {
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-seven-agent-target.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S01',
    task: 'T02',
    generated: new Date().toISOString(),
    company: before.company,
    source_before: 'runtime-evidence/M015-S01-seven-agent-before.json',
    base_execution_contract: 'agents/PAPERCLIP_EXECUTION_CONTRACT.md',
    hierarchy_policy: 'CEO -> Div7.MissionControl -> Div1.HCO -> Div2 through Div6',
    provider_policy: 'hermes_local + minimax + MiniMax-M3; no Xiaomi/MiMo or legacy profile args',
    session_policy: 'persist sessions; do not impose an artificial max-turn cap',
    tool_policy: 'terminal/file for internal divisions; web additionally only for Div6.External; external IO remains a declared BOS boundary',
    permission_policy: 'tasks:assign only for Div7 decision delegation and Div1 operational routing',
    agent_count: agents.length,
    agents,
    mutation_gate: {
      rollback_integrity_required: true,
      exact_readback_required: true,
      test_environment_required_before_mission: true,
      mutation_order: ['Div7.MissionControl', 'Div1.HCO', 'Div2.MasterPlanner', 'Div3.Treasury', 'Div4.Production', 'Div5.QualificationsLibraryLearning', 'Div6.External'],
      rollback_on_first_failed_readback: true,
    },
    known_boundary: 'Hermes terminal access is required for the Paperclip API and can also reach external networks; non-Div6 external-IO isolation is instruction/audit enforced until a per-agent network policy exists.',
    redaction: { full_uuid_values_stored: false, credentials_stored: false },
  };

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
  process.stdout.write(`M015_CONTRACT_BUILT=yes agents=${agents.length}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`M015_CONTRACT_BUILD_FAIL=${String(error && error.message || error).replace(/[0-9a-f]{8}-[0-9a-f-]{27}/ig, '<redacted-id>')}\n`);
    process.exit(1);
  }
}

module.exports = { ROLE_FILES, TITLES, PARENTS, TOOLSETS, combinedInstructions, main };
