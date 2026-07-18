#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const { validateContract } = require('./validate_m015_seven_agent_contract');

const ROOT = path.resolve(__dirname, '..');
const before = require('../runtime-evidence/M015-S01-seven-agent-before.json');
const target = require('../runtime-evidence/M015-S01-seven-agent-target-contract.json');
const clone = (value) => JSON.parse(JSON.stringify(value));
const codes = (result) => result.map((entry) => entry.code);

function validate(nextBefore = before, nextTarget = target, sources = {}) {
  return validateContract(nextBefore, nextTarget, {
    beforeRaw: sources.beforeRaw ?? JSON.stringify(nextBefore),
    targetRaw: sources.targetRaw ?? JSON.stringify(nextTarget),
  });
}

describe('M015 seven-agent target contract', () => {
  it('accepts the canonical contract', () => {
    assert.deepEqual(validate(), []);
  });

  it('rejects a missing division agent', () => {
    const next = clone(target);
    next.agents.pop();
    next.agent_count = 6;
    const result = validate(before, next);
    assert.ok(codes(result).includes('M15-C04'));
  });

  it('rejects missing rollback integrity', () => {
    const next = clone(before);
    next.backup.integrity_verified = false;
    assert.ok(codes(validate(next, target)).includes('M15-C02'));
  });

  it('rejects hierarchy drift', () => {
    const next = clone(target);
    next.agents.find((agent) => agent.name === 'Div4.Production').reports_to = 'CEO';
    assert.ok(codes(validate(before, next)).includes('M15-C07'));
  });

  it('rejects stale Xiaomi provider and MiMo model', () => {
    const next = clone(target);
    const agent = next.agents[0];
    agent.provider = 'xiaomi';
    agent.model = 'mimo-v2.5-pro';
    const result = validate(before, next);
    assert.ok(codes(result).includes('M15-C08'));
    assert.ok(codes(result).includes('M15-C10'));
  });

  it('rejects legacy profile args', () => {
    const next = clone(target);
    next.agents[0].extra_args = ['--ignore-user-config', '-p', 'div1-hco'];
    assert.ok(codes(validate(before, next)).includes('M15-C10'));
  });

  it('rejects web tool access outside Div6', () => {
    const next = clone(target);
    next.agents.find((agent) => agent.name === 'Div2.MasterPlanner').toolsets = 'terminal,file,web';
    assert.ok(codes(validate(before, next)).includes('M15-C12'));
  });

  it('rejects instruction hash drift', () => {
    const next = clone(target);
    next.agents[0].instruction_hashes.combined_sha256 = '0'.repeat(64);
    assert.ok(codes(validate(before, next)).includes('M15-C15'));
  });

  it('rejects assignment grants outside Div7 and Div1', () => {
    const next = clone(target);
    next.agents.find((agent) => agent.name === 'Div5.QualificationsLibraryLearning').permissions = ['tasks:assign'];
    assert.ok(codes(validate(before, next)).includes('M15-C13'));
  });

  it('rejects full UUID leakage', () => {
    const result = validate(before, target, { targetRaw: `${JSON.stringify(target)} 11111111-1111-4111-8111-111111111111` });
    assert.ok(codes(result).includes('M15-C03'));
  });

  it('rejects an incomplete mutation gate', () => {
    const next = clone(target);
    next.mutation_gate.test_environment_required_before_mission = false;
    assert.ok(codes(validate(before, next)).includes('M15-C16'));
  });
});
