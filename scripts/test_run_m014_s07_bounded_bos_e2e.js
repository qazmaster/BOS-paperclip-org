#!/usr/bin/env node
/**
 * @file scripts/test_run_m014_s07_bounded_bos_e2e.js
 *
 * M014-a9jj46/S07 — Tests for the bounded session-cookie runner (T02).
 *
 * Verification:
 *   node --test scripts/test_run_m014_s07_bounded_bos_e2e.js
 *
 * Test groups:
 *   1. Module shape + exports              (6 tests)
 *   2. Constants invariants                (5 tests)
 *   3. classifyRequest (control-plane vs business vs readback)  (6 tests)
 *   4. Redaction helpers + sha256          (5 tests)
 *   5. Lockfile + upstream audit           (4 tests)
 *   6. Plan builders                       (6 tests)
 *   7. Request journal classification      (4 tests)
 *   8. Side-effect ledger + pre/post counters (4 tests)
 *   9. Native readback hashes + validator check IDs (3 tests)
 *  10. Blocker boundary + inherited constraints (3 tests)
 *  11. CLI parsing + dispatch              (5 tests)
 *
 * Total: ~51 tests across 11 groups.
 *
 * The tests do NOT mutate git state, do NOT touch the live Paperclip
 * runtime, and use only git-tracked files (paperclip-runtime.lock.json,
 * runtime-evidence/M014-S04..S06-*.json) plus synthetic fixtures.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const RUNNER = require('./run_m014_s07_bounded_bos_e2e');
const VALIDATOR = require('./validate_m014_s07_bounded_bos_e2e');

// ---------------------------------------------------------------------------
// 1. Module shape + exports
// ---------------------------------------------------------------------------

describe('run_m014_s07_bounded_bos_e2e.js module shape', () => {
  it('exports auditLockfile as a function', () => {
    assert.equal(typeof RUNNER.auditLockfile, 'function');
  });

  it('exports auditUpstreamGate as a function', () => {
    assert.equal(typeof RUNNER.auditUpstreamGate, 'function');
  });

  it('exports buildBoundedSessionCookiePlan as a function', () => {
    assert.equal(typeof RUNNER.buildBoundedSessionCookiePlan, 'function');
  });

  it('exports buildCanonicalEvidence as a function', () => {
    assert.equal(typeof RUNNER.buildCanonicalEvidence, 'function');
  });

  it('exports classifyRequest as a function', () => {
    assert.equal(typeof RUNNER.classifyRequest, 'function');
  });

  it('exports runCLI as a function', () => {
    assert.equal(typeof RUNNER.runCLI, 'function');
  });
});

// ---------------------------------------------------------------------------
// 2. Constants invariants
// ---------------------------------------------------------------------------

describe('run_m014_s07_bounded_bos_e2e.js constants invariants', () => {
  it('declares REQUIRED_COOKIE_AUTH_MODE = "session-cookie"', () => {
    assert.equal(RUNNER.REQUIRED_COOKIE_AUTH_MODE, 'session-cookie');
  });

  it('declares MAX_POLL_BUDGET = 8 (Q6 bounded load)', () => {
    assert.equal(RUNNER.MAX_POLL_BUDGET, 8);
  });

  it('declares 2 business routes (issue create + heartbeat invoke)', () => {
    assert.equal(RUNNER.REQUIRED_BUSINESS_ROUTES.length, 2);
    assert.ok(RUNNER.REQUIRED_BUSINESS_ROUTES.includes('POST /api/issues'));
    assert.ok(RUNNER.REQUIRED_BUSINESS_ROUTES.some((r) => r.includes('heartbeat')));
  });

  it('declares 2 readback routes (issue readback + agent readback)', () => {
    assert.equal(RUNNER.REQUIRED_READBACK_ROUTES.length, 2);
  });

  it('declares 1 control-plane route (sign-in)', () => {
    assert.equal(RUNNER.REQUIRED_CONTROL_PLANE_ROUTES.length, 1);
    assert.equal(RUNNER.REQUIRED_CONTROL_PLANE_ROUTES[0], 'POST /api/auth/sign-in');
  });

  it('EXPECTED_SIDE_EFFECTS issues_created = 1 and heartbeat_runs_started = 1', () => {
    assert.equal(RUNNER.EXPECTED_SIDE_EFFECTS.issues_created, 1);
    assert.equal(RUNNER.EXPECTED_SIDE_EFFECTS.heartbeat_runs_started, 1);
  });

  it('EXPECTED_SIDE_EFFECTS all other business counters = 0', () => {
    assert.equal(RUNNER.EXPECTED_SIDE_EFFECTS.documents_created, 0);
    assert.equal(RUNNER.EXPECTED_SIDE_EFFECTS.comments_created, 0);
    assert.equal(RUNNER.EXPECTED_SIDE_EFFECTS.approvals_created, 0);
    assert.equal(RUNNER.EXPECTED_SIDE_EFFECTS.agents_mutated, 0);
    assert.equal(RUNNER.EXPECTED_SIDE_EFFECTS.unexpected_mutating_routes, 0);
    assert.equal(RUNNER.EXPECTED_SIDE_EFFECTS.unconfirmed_live_side_effects, 0);
  });

  it('REQUIRED_BOS_RESULT_FIELDS carries 6 mandatory fields', () => {
    assert.equal(RUNNER.REQUIRED_BOS_RESULT_FIELDS.length, 6);
    for (const f of ['schemaVersion', 'runId', 'issueId', 'division', 'role', 'status']) {
      assert.ok(RUNNER.REQUIRED_BOS_RESULT_FIELDS.includes(f), `missing BOS field: ${f}`);
    }
  });

  it('declares 10 upstream artifact paths (S04-S06)', () => {
    assert.equal(Object.keys(RUNNER.UPSTREAM_ARTIFACT_PATHS).length, 10);
    for (const k of [
      's04Deploy', 's04PostUpgrade', 's04NativeSmoke',
      's05Upgrade', 's05Direct', 's05Paperclip',
      's06DirectLive', 's06PaperclipHermesLive', 's06Rollout', 's06Persistence'
    ]) {
      assert.ok(RUNNER.UPSTREAM_ARTIFACT_PATHS[k], `missing upstream artifact path: ${k}`);
    }
  });

  it('declares S07 target evidence path', () => {
    assert.ok(RUNNER.S07_TARGET_EVIDENCE.endsWith('runtime-evidence/M014-S07-bounded-bos-e2e.json'));
  });
});

// ---------------------------------------------------------------------------
// 3. classifyRequest (control-plane vs business vs readback)
// ---------------------------------------------------------------------------

describe('classifyRequest', () => {
  it('classifies POST /api/auth/sign-in as control-plane', () => {
    assert.equal(RUNNER.classifyRequest('POST', '/api/auth/sign-in'), 'control-plane');
  });

  it('classifies POST /api/issues as business', () => {
    assert.equal(RUNNER.classifyRequest('POST', '/api/issues'), 'business');
  });

  it('classifies POST /api/agents/{id}/heartbeat as business (after template normalization)', () => {
    assert.equal(RUNNER.classifyRequest('POST', '/api/agents/abc123/heartbeat'), 'business');
  });

  it('classifies GET /api/issues/{id} as readback', () => {
    assert.equal(RUNNER.classifyRequest('GET', '/api/issues/xyz'), 'readback');
  });

  it('classifies GET /api/agents/{id} as readback', () => {
    assert.equal(RUNNER.classifyRequest('GET', '/api/agents/abc123'), 'readback');
  });

  it('classifies non-/api path as unknown', () => {
    assert.equal(RUNNER.classifyRequest('POST', '/health'), 'unknown');
  });

  it('classifies non-listed /api POST as business-other (NOT business)', () => {
    assert.equal(RUNNER.classifyRequest('POST', '/api/agents/abc123/adapterConfig'), 'business-other');
  });

  it('classifies non-listed /api GET as readback-other', () => {
    assert.equal(RUNNER.classifyRequest('GET', '/api/companies'), 'readback-other');
  });

  it('handles lowercase method', () => {
    assert.equal(RUNNER.classifyRequest('post', '/api/issues'), 'business');
  });

  it('handles empty path as unknown', () => {
    assert.equal(RUNNER.classifyRequest('POST', ''), 'unknown');
  });
});

// ---------------------------------------------------------------------------
// 4. Redaction helpers + sha256
// ---------------------------------------------------------------------------

describe('redaction helpers + sha256', () => {
  it('redactCookie keeps 8-char prefix for long values', () => {
    const r = RUNNER.redactCookie('abcd1234efgh5678ijkl9012mnop3456');
    assert.ok(r.startsWith('abcd1234'), `expected 8-char prefix, got: ${r}`);
    assert.ok(r.includes('redacted'), 'expected redacted marker');
    assert.ok(!r.includes('9012mnop'), 'must not contain tail of cookie');
  });

  it('redactCookie handles short values', () => {
    const r = RUNNER.redactCookie('short');
    assert.ok(r.includes('redacted'));
    assert.ok(!r.includes('short'), 'must not expose short value');
  });

  it('redactSessionCookieHeader redacts session= value', () => {
    const r = RUNNER.redactSessionCookieHeader('Cookie: session=abcd1234efgh5678ijkl9012mnop3456');
    assert.ok(r.includes('abcd1234'));
    assert.ok(!r.includes('9012mnop'));
  });

  it('redactSessionCookieHeader preserves non-session cookies', () => {
    const r = RUNNER.redactSessionCookieHeader('Cookie: tracking=xyz');
    assert.ok(r.includes('tracking=xyz'));
  });

  it('redactSecretRef passes through secret ref NAMES', () => {
    assert.equal(RUNNER.redactSecretRef('MINIMAX_API_KEY'), 'MINIMAX_API_KEY');
    assert.equal(RUNNER.redactSecretRef('MINIMAX_BASE_URL'), 'MINIMAX_BASE_URL');
    assert.equal(RUNNER.redactSecretRef('XIAOMI_API_KEY'), 'XIAOMI_API_KEY');
  });

  it('sha256Hex is deterministic', () => {
    const a = RUNNER.sha256Hex('hello world');
    const b = RUNNER.sha256Hex('hello world');
    assert.equal(a, b);
    assert.equal(a.length, 64);
  });

  it('sha256Hex produces known sha256 of empty string', () => {
    assert.equal(RUNNER.sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('sha256Hex differs for different inputs', () => {
    assert.notEqual(RUNNER.sha256Hex('foo'), RUNNER.sha256Hex('bar'));
  });
});

// ---------------------------------------------------------------------------
// 5. Lockfile + upstream audit
// ---------------------------------------------------------------------------

describe('lockfile + upstream audit', () => {
  it('auditLockfile accepts the canonical lockfile (ok=true)', () => {
    const a = RUNNER.auditLockfile();
    assert.equal(a.ok, true, `expected ok=true; reason=${a.reason}`);
    assert.equal(typeof a.safe_restart_command, 'string');
    assert.ok(a.safe_restart_command.length > 0);
  });

  it('auditLockfile reports 6 R3 stale company ids', () => {
    const a = RUNNER.auditLockfile();
    assert.equal(a.stale_company_ids_count, 6);
  });

  it('auditUpstreamGate returns gate_satisfied=false against deferred S04-S06', () => {
    const r = RUNNER.auditUpstreamGate();
    assert.equal(r.gate_satisfied, false);
    assert.ok(r.blockers.length >= 1, 'expected at least 1 blocker when upstream deferred');
  });

  it('auditUpstreamGate reports all 10 upstream artifacts (5 S05/S06 audit functions covered)', () => {
    const r = RUNNER.auditUpstreamGate();
    assert.equal(Object.keys(r.audits).length, 10);
    for (const k of [
      's04Deploy', 's04PostUpgrade', 's04NativeSmoke',
      's05Upgrade', 's05Direct', 's05Paperclip',
      's06DirectLive', 's06PaperclipHermesLive', 's06Rollout', 's06Persistence'
    ]) {
      assert.ok(r.audits[k], `audit missing for ${k}`);
      assert.equal(r.audits[k].ok, true, `audit should load ${k} ok; got: ${JSON.stringify(r.audits[k])}`);
    }
  });

  it('auditUpstreamGate records phase_verdict per artifact', () => {
    const r = RUNNER.auditUpstreamGate();
    for (const a of Object.values(r.audits)) {
      assert.ok(typeof a.phase_verdict === 'string', `phase_verdict must be string for ${a.key}`);
      assert.equal(typeof a.phase_admissible_for_live, 'boolean');
      assert.equal(typeof a.fresh_readback_required, 'boolean');
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Plan builders
// ---------------------------------------------------------------------------

describe('plan builders', () => {
  it('buildSessionCookiePlan returns control-plane classification', () => {
    const p = RUNNER.buildSessionCookiePlan();
    assert.equal(p.cookie_classification, 'control-plane');
    assert.equal(p.planned_http_invocation.method, 'POST');
    assert.equal(p.planned_http_invocation.path, '/api/auth/sign-in');
  });

  it('buildIssueCreatePlan returns business classification with bounded agent target', () => {
    const p = RUNNER.buildIssueCreatePlan({});
    assert.equal(p.classification, 'business');
    assert.equal(p.bounded_test_agent_target.agent_kind, RUNNER.REQUIRED_BOUNDED_AGENT_KIND);
    assert.ok(p.bounded_test_agent_target.bounded_agent_id_prefix_constraint.includes('R3'));
  });

  it('buildHeartbeatInvokePlan declares required BOS fields and routing chain', () => {
    const p = RUNNER.buildHeartbeatInvokePlan({});
    assert.equal(p.classification, 'business');
    assert.deepEqual(p.planned_http_invocation.expected_resultJson_bos_required_fields, RUNNER.REQUIRED_BOS_RESULT_FIELDS.slice());
    assert.deepEqual(p.planned_http_invocation.expected_routing_preservation, VALIDATOR.R026_ROUTING_CHAIN.slice());
    assert.equal(p.wake_count_delta_policy.includes('1'), true);
  });

  it('buildIssueReadbackPlan marks independence', () => {
    const p = RUNNER.buildIssueReadbackPlan();
    assert.equal(p.classification, 'readback');
    assert.ok(p.independence_policy.includes('separate HTTP request'));
  });

  it('buildWakeCountCheckPlan marks independence and pre/post', () => {
    const p = RUNNER.buildWakeCountCheckPlan();
    assert.equal(p.classification, 'readback');
    assert.ok(p.independence_policy.includes('Pre-capture'));
  });

  it('buildBoundedPollHistory caps at MAX_POLL_BUDGET=8', () => {
    const h = RUNNER.buildBoundedPollHistory();
    assert.equal(h.max_poll_budget, RUNNER.MAX_POLL_BUDGET);
    assert.ok(h.polls.length <= RUNNER.MAX_POLL_BUDGET);
    assert.equal(h.polls.length, 8);
    // last poll must have budget_remaining_after=0
    const last = h.polls[h.polls.length - 1];
    assert.equal(last.budget_remaining_after, 0);
  });

  it('buildBoundedPollHistory budget is monotonically decreasing', () => {
    const h = RUNNER.buildBoundedPollHistory();
    for (let i = 1; i < h.polls.length; i++) {
      assert.ok(h.polls[i].budget_remaining_after < h.polls[i - 1].budget_remaining_after,
        `poll ${i} budget must decrease`);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Request journal classification
// ---------------------------------------------------------------------------

describe('request journal classification', () => {
  it('buildRequestJournal emits 5 entries (1 control-plane + 2 business + 2 readback)', () => {
    const j = RUNNER.buildRequestJournal();
    assert.equal(j.total_entries, 5);
    assert.equal(j.control_plane_count, 1);
    assert.equal(j.business_count, 2);
    assert.equal(j.readback_count, 2);
  });

  it('buildRequestJournal entries are sequentially numbered 1..5', () => {
    const j = RUNNER.buildRequestJournal();
    for (let i = 0; i < j.entries.length; i++) {
      assert.equal(j.entries[i].seq, i + 1);
    }
  });

  it('buildRequestJournal carries no credential values (scan-validator passes)', () => {
    const j = RUNNER.buildRequestJournal();
    const haystack = JSON.stringify(j);
    const hits = VALIDATOR.scanCredentialLeaks(haystack);
    assert.equal(hits.length, 0, `credential leak in journal: ${JSON.stringify(hits)}`);
  });

  it('buildRequestJournal classifies side effects correctly', () => {
    const j = RUNNER.buildRequestJournal();
    const sideEffects = j.entries.map((e) => e.side_effect);
    assert.ok(sideEffects.some((s) => s.includes('issues_created')));
    assert.ok(sideEffects.some((s) => s.includes('heartbeat_runs_started')));
  });

  it('buildRequestJournal bounded_policy asserts exactly 5 entries', () => {
    const j = RUNNER.buildRequestJournal();
    assert.ok(j.bounded_policy.includes('EXACTLY'));
  });
});

// ---------------------------------------------------------------------------
// 8. Side-effect ledger + pre/post counters
// ---------------------------------------------------------------------------

describe('side-effect ledger + pre/post counters', () => {
  it('buildSideEffectLedger declares expected=1 for issues_created and heartbeat_runs_started', () => {
    const l = RUNNER.buildSideEffectLedger();
    assert.equal(l.expected.issues_created, 1);
    assert.equal(l.expected.heartbeat_runs_started, 1);
  });

  it('buildSideEffectLedger declares observed_fail_closed=0 across the board', () => {
    const l = RUNNER.buildSideEffectLedger();
    for (const v of Object.values(l.observed_fail_closed)) {
      assert.equal(v, 0, `observed_fail_closed must be 0; got: ${v}`);
    }
  });

  it('buildSideEffectLedger ledger_zero_invariants.business_mutation_count = 0', () => {
    const l = RUNNER.buildSideEffectLedger();
    assert.equal(l.ledger_zero_invariants.business_mutation_count, 0);
  });

  it('buildPrePostCounters declares all zero on fail-closed', () => {
    const c = RUNNER.buildPrePostCounters();
    assert.deepEqual(c.pre_dispatch_counters, c.post_dispatch_counters_fail_closed);
    for (const v of Object.values(c.pre_dispatch_counters)) {
      assert.equal(v, 0);
    }
  });
});

// ---------------------------------------------------------------------------
// 9. Native readback hashes + validator check IDs
// ---------------------------------------------------------------------------

describe('native readback hashes + validator check IDs', () => {
  it('buildNativeReadbackHashes produces 3 sha256 hashes (issue/heartbeat/agent)', () => {
    const h = RUNNER.buildNativeReadbackHashes();
    assert.equal(h.issue_readback_sha256.length, 64);
    assert.equal(h.heartbeat_readback_sha256.length, 64);
    assert.equal(h.agent_readback_sha256.length, 64);
  });

  it('buildNativeReadbackHashes are deterministic (sha256 of stable JSON)', () => {
    const a = RUNNER.buildNativeReadbackHashes();
    const b = RUNNER.buildNativeReadbackHashes();
    assert.equal(a.issue_readback_sha256, b.issue_readback_sha256);
    assert.equal(a.heartbeat_readback_sha256, b.heartbeat_readback_sha256);
    assert.equal(a.agent_readback_sha256, b.agent_readback_sha256);
  });

  it('buildNativeReadbackHashes shape_inputs do NOT contain credential leaks', () => {
    const h = RUNNER.buildNativeReadbackHashes();
    const haystack = JSON.stringify(h.shape_inputs);
    const hits = VALIDATOR.scanCredentialLeaks(haystack);
    assert.equal(hits.length, 0, `credential leak in shape_inputs: ${JSON.stringify(hits)}`);
  });

  it('buildValidatorCheckIds returns all 30 V-BOS-E2E-NN IDs', () => {
    const ids = RUNNER.buildValidatorCheckIds();
    assert.equal(ids.length, 30);
    assert.ok(ids[0] === 'V-BOS-E2E-01');
    assert.ok(ids[29] === 'V-BOS-E2E-30');
  });

  it('buildValidatorCheckIds has no duplicate IDs', () => {
    const ids = RUNNER.buildValidatorCheckIds();
    const set = new Set(ids);
    assert.equal(set.size, ids.length);
  });

  it('buildValidatorCheckIds mirrors validator ENTRY_GATE_CHECKS', () => {
    const ids = RUNNER.buildValidatorCheckIds();
    const validatorIds = VALIDATOR.ENTRY_GATE_CHECKS.map(([id]) => id);
    assert.deepEqual(ids, validatorIds);
  });
});

// ---------------------------------------------------------------------------
// 10. Blocker boundary + inherited constraints
// ---------------------------------------------------------------------------

describe('blocker boundary + inherited constraints', () => {
  it('buildBlockerBoundary records blockers list and recovery_starts_from', () => {
    const b = RUNNER.buildBlockerBoundary(['x: missing', 'y: deferred']);
    assert.equal(b.blockers.length, 2);
    assert.ok(b.recovery_starts_from.includes('failing boundary'));
    assert.ok(b.re_mutation_policy.includes('NEVER'));
  });

  it('buildBlockerBoundary handles empty blocker list', () => {
    const b = RUNNER.buildBlockerBoundary([]);
    assert.equal(b.blockers.length, 0);
    assert.ok(b.re_mutation_policy.includes('NEVER'));
  });

  it('buildInheritedConstraints returns all 6 LFP-* IDs from validator', () => {
    const ic = RUNNER.buildInheritedConstraints();
    assert.equal(ic.length, VALIDATOR.REQUIRED_INHERITED_CONSTRAINT_IDS.length);
    for (const id of VALIDATOR.REQUIRED_INHERITED_CONSTRAINT_IDS) {
      assert.ok(ic.some((c) => c.id === id));
      assert.ok(ic.find((c) => c.id === id).in_force);
    }
  });
});

// ---------------------------------------------------------------------------
// 11. CLI parsing + dispatch
// ---------------------------------------------------------------------------

describe('CLI parsing + dispatch', () => {
  it('parseArgs with --mode plan returns mode=plan', () => {
    const a = RUNNER.parseArgs(['--mode', 'plan']);
    assert.equal(a.mode, 'plan');
    assert.equal(a.help, false);
    assert.equal(a.dryRun, false);
  });

  it('parseArgs with --dry-run sets dryRun=true', () => {
    const a = RUNNER.parseArgs(['--mode', 'plan', '--dry-run']);
    assert.equal(a.dryRun, true);
  });

  it('parseArgs with --output /tmp/foo.json sets output', () => {
    const a = RUNNER.parseArgs(['--mode', 'plan', '--output', '/tmp/foo.json']);
    assert.ok(a.output.endsWith('foo.json'));
  });

  it('parseArgs with --help sets help=true', () => {
    const a = RUNNER.parseArgs(['--help']);
    assert.equal(a.help, true);
  });

  it('parseArgs with no flags returns mode=null', () => {
    const a = RUNNER.parseArgs([]);
    assert.equal(a.mode, null);
  });

  it('runCLI returns 3 when --mode missing', () => {
    // Capture stderr to avoid noise
    const origErr = process.stderr.write;
    process.stderr.write = () => true;
    try {
      const code = RUNNER.runCLI([]);
      assert.equal(code, 3);
    } finally {
      process.stderr.write = origErr;
    }
  });

  it('runCLI returns 3 when --mode unknown', () => {
    const origErr = process.stderr.write;
    process.stderr.write = () => true;
    try {
      const code = RUNNER.runCLI(['--mode', 'bogus']);
      assert.equal(code, 3);
    } finally {
      process.stderr.write = origErr;
    }
  });

  it('runCLI returns 0 on --mode plan (with stderr noise captured)', () => {
    const origErr = process.stderr.write;
    const origOut = process.stdout.write;
    let stderrBuf = '';
    let stdoutBuf = '';
    process.stderr.write = (s) => { stderrBuf += s; return true; };
    process.stdout.write = (s) => { stdoutBuf += s; return true; };
    try {
      const code = RUNNER.runCLI(['--mode', 'plan', '--dry-run']);
      assert.equal(code, 0);
      assert.ok(stdoutBuf.includes('bounded_policy'), 'plan must include bounded_policy');
    } finally {
      process.stderr.write = origErr;
      process.stdout.write = origOut;
    }
  });

  it('runCLI returns 0 on --mode plan + writes evidence file (default path)', () => {
    const origErr = process.stderr.write;
    const origOut = process.stdout.write;
    process.stderr.write = () => true;
    process.stdout.write = () => true;
    try {
      const code = RUNNER.runCLI(['--mode', 'plan']);
      assert.equal(code, 0);
      assert.ok(fs.existsSync(RUNNER.S07_TARGET_EVIDENCE), 'evidence file must exist after --mode plan');
      const ev = JSON.parse(fs.readFileSync(RUNNER.S07_TARGET_EVIDENCE, 'utf8'));
      assert.equal(ev.business_mutation_count, 0);
      assert.equal(ev.ledger.issues_created, 0);
      assert.equal(ev.ledger.heartbeat_runs_started, 0);
    } finally {
      process.stderr.write = origErr;
      process.stdout.write = origOut;
    }
  });

  it('runCLI emits evidence with all 30 V-BOS-E2E-NN IDs in validator_check_ids', () => {
    const origErr = process.stderr.write;
    const origOut = process.stdout.write;
    process.stderr.write = () => true;
    process.stdout.write = () => true;
    try {
      RUNNER.runCLI(['--mode', 'plan']);
      const ev = JSON.parse(fs.readFileSync(RUNNER.S07_TARGET_EVIDENCE, 'utf8'));
      assert.equal(ev.validator_check_ids.length, 30);
      assert.ok(ev.validator_check_ids.includes('V-BOS-E2E-01'));
      assert.ok(ev.validator_check_ids.includes('V-BOS-E2E-30'));
    } finally {
      process.stderr.write = origErr;
      process.stdout.write = origOut;
    }
  });

  it('runCLI emits evidence whose request journal carries no credential leaks', () => {
    const origErr = process.stderr.write;
    const origOut = process.stdout.write;
    process.stderr.write = () => true;
    process.stdout.write = () => true;
    try {
      RUNNER.runCLI(['--mode', 'plan']);
      const ev = JSON.parse(fs.readFileSync(RUNNER.S07_TARGET_EVIDENCE, 'utf8'));
      const haystack = JSON.stringify(ev);
      const hits = VALIDATOR.scanCredentialLeaks(haystack);
      assert.equal(hits.length, 0, `credential leak in evidence: ${JSON.stringify(hits)}`);
    } finally {
      process.stderr.write = origErr;
      process.stdout.write = origOut;
    }
  });
});

// ---------------------------------------------------------------------------
// 12. Top-level buildBoundedSessionCookiePlan integration
// ---------------------------------------------------------------------------

describe('buildBoundedSessionCookiePlan integration', () => {
  it('returns a plan object with all required top-level sections', () => {
    const auditResult = RUNNER.auditUpstreamGate();
    const plan = RUNNER.buildBoundedSessionCookiePlan(auditResult);
    for (const k of [
      'runner', 'milestone', 'slice', 'task', 'purpose', 'auth_mode',
      'bounded_policy', 'inherited_constraints_remain_in_force',
      'planned_invocation_sequence', 'bounded_poll_history',
      'redacted_request_journal', 'pre_post_counters',
      'expected_vs_observed_side_effect_ledger', 'native_readback_hashes',
      'validator_check_ids', 'blocker_boundary', 'canonical_provider',
      'canonical_model', 'stale_company_ids_known',
      'routing_chain_required', 'bos_result_required_fields'
    ]) {
      assert.ok(plan[k] !== undefined, `plan missing required section: ${k}`);
    }
  });

  it('plan.planned_invocation_sequence has exactly 5 entries (1 sign-in + 1 issue + 1 heartbeat + 2 readback)', () => {
    const auditResult = RUNNER.auditUpstreamGate();
    const plan = RUNNER.buildBoundedSessionCookiePlan(auditResult);
    assert.equal(plan.planned_invocation_sequence.length, 5);
    assert.equal(plan.planned_invocation_sequence[0].cookie_classification, 'control-plane');
    assert.equal(plan.planned_invocation_sequence[1].classification, 'business');
    assert.equal(plan.planned_invocation_sequence[2].classification, 'business');
    assert.equal(plan.planned_invocation_sequence[3].classification, 'readback');
    assert.equal(plan.planned_invocation_sequence[4].classification, 'readback');
  });

  it('plan.stale_company_ids_known carries all 6 R3 prefixes', () => {
    const auditResult = RUNNER.auditUpstreamGate();
    const plan = RUNNER.buildBoundedSessionCookiePlan(auditResult);
    assert.equal(plan.stale_company_ids_known.length, 6);
    for (const p of ['9feb4c22', '43c74adb', '1a194762', '7595fd85', '7eede16c', '8233ea7b']) {
      assert.ok(plan.stale_company_ids_known.includes(p), `missing R3 prefix: ${p}`);
    }
  });

  it('buildCanonicalEvidence produces fail-closed shape (business_mutation_count=0 + zero ledger)', () => {
    const auditResult = RUNNER.auditUpstreamGate();
    const plan = RUNNER.buildBoundedSessionCookiePlan(auditResult);
    const lockfileAudit = RUNNER.auditLockfile();
    const ev = RUNNER.buildCanonicalEvidence(plan, auditResult, lockfileAudit);
    assert.equal(ev.business_mutation_count, 0);
    for (const v of Object.values(ev.ledger)) {
      assert.equal(v, 0);
    }
  });

  it('buildCanonicalEvidence propagates preconditions_audit.upstream_gate_satisfied=false when deferred', () => {
    const auditResult = RUNNER.auditUpstreamGate();
    const plan = RUNNER.buildBoundedSessionCookiePlan(auditResult);
    const lockfileAudit = RUNNER.auditLockfile();
    const ev = RUNNER.buildCanonicalEvidence(plan, auditResult, lockfileAudit);
    assert.equal(ev.preconditions_audit.upstream_gate_satisfied, false);
  });
});