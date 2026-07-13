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
const os = require('node:os');
const { spawn } = require('node:child_process');
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

  it('exports deterministic run-seed, recovery-lock, and session-cookie helpers', () => {
    assert.equal(typeof RUNNER.deriveCorrelationMarker, 'function');
    assert.equal(typeof RUNNER.deriveIdempotencyKey, 'function');
    assert.equal(typeof RUNNER.readRecoveryLock, 'function');
    assert.equal(typeof RUNNER.writeRecoveryLockAtomic, 'function');
    assert.equal(typeof RUNNER.extractSessionCookie, 'function');
  });

  it('extracts a Better Auth session cookie without assuming a literal session name', () => {
    const headers = { getSetCookie: () => ['better-auth.session_token=opaque-value; Path=/; HttpOnly'] };
    assert.equal(RUNNER.extractSessionCookie(headers), 'better-auth.session_token=opaque-value');
  });
});

// ---------------------------------------------------------------------------
// 2. Constants invariants
// ---------------------------------------------------------------------------

describe('run_m014_s07_bounded_bos_e2e.js constants invariants', () => {
  it('declares REQUIRED_COOKIE_AUTH_MODE = "session-cookie"', () => {
    assert.equal(RUNNER.REQUIRED_COOKIE_AUTH_MODE, 'session-cookie');
  });

  it('declares MAX_POLL_BUDGET = 12 (Q6 bounded load)', () => {
    assert.equal(RUNNER.MAX_POLL_BUDGET, 12);
  });

  it('declares 2 business routes (issue create + heartbeat invoke)', () => {
    assert.equal(RUNNER.REQUIRED_BUSINESS_ROUTES.length, 2);
    assert.ok(RUNNER.REQUIRED_BUSINESS_ROUTES.includes('POST /api/companies/{companyId}/issues'));
    assert.ok(RUNNER.REQUIRED_BUSINESS_ROUTES.some((r) => r.includes('heartbeat')));
  });

  it('declares the exact supported route contract', () => {
    assert.deepEqual(RUNNER.ROUTE_CONTRACT, {
      sessionSignIn: 'POST /api/auth/sign-in/email',
      issueCreate: 'POST /api/companies/{companyId}/issues',
      issueReadback: 'GET /api/issues/{issueId}',
      agentReadback: 'GET /api/agents/{agentId}',
      heartbeatInvoke: 'POST /api/agents/{agentId}/heartbeat/invoke',
      heartbeatReadback: 'GET /api/heartbeat-runs/{runId}',
      heartbeatRunsList: 'GET /api/companies/{companyId}/heartbeat-runs'
    });
    assert.deepEqual(RUNNER.REQUIRED_READBACK_ROUTES, [
      'GET /api/issues/{issueId}',
      'GET /api/agents/{agentId}'
    ]);
  });

  it('declares 1 control-plane route (sign-in)', () => {
    assert.equal(RUNNER.REQUIRED_CONTROL_PLANE_ROUTES.length, 1);
    assert.equal(RUNNER.REQUIRED_CONTROL_PLANE_ROUTES[0], 'POST /api/auth/sign-in/email');
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
  it('classifies POST /api/auth/sign-in/email as control-plane', () => {
    assert.equal(RUNNER.classifyRequest('POST', '/api/auth/sign-in/email'), 'control-plane');
    assert.equal(RUNNER.classifyRequest('POST', '/api/auth/sign-in'), 'business-other');
  });

  it('classifies POST /api/companies/{companyId}/issues as business', () => {
    assert.equal(RUNNER.classifyRequest('POST', '/api/companies/company-1/issues'), 'business');
    assert.equal(RUNNER.classifyRequest('POST', '/api/issues'), 'business-other');
  });

  it('classifies POST /api/agents/{id}/heartbeat/invoke as business (after template normalization)', () => {
    assert.equal(RUNNER.classifyRequest('POST', '/api/agents/abc123/heartbeat/invoke'), 'business');
  });

  it('classifies GET /api/issues/{issueId} as readback', () => {
    assert.equal(RUNNER.classifyRequest('GET', '/api/issues/xyz'), 'readback');
    assert.equal(RUNNER.LIVE_ISSUE_READBACK_PATH('issue-1'), '/api/issues/issue-1');
  });

  it('rejects company-scoped issue GET as canonical readback', () => {
    assert.equal(RUNNER.classifyRequest('GET', '/api/companies/company/issues/xyz'), 'readback-other');
  });

  it('keeps the exact company-scoped issue POST as the business create route', () => {
    assert.equal(RUNNER.classifyRequest('POST', '/api/companies/company/issues'), 'business');
    assert.equal(RUNNER.LIVE_ISSUE_CREATE_PATH('company'), '/api/companies/company/issues');
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
    assert.equal(RUNNER.classifyRequest('post', '/api/companies/company-1/issues'), 'business');
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

  it('derives deterministic distinct idempotency keys per mutation operation', () => {
    const issueKey = RUNNER.deriveIdempotencyKey('seed', 'issue-create');
    const heartbeatKey = RUNNER.deriveIdempotencyKey('seed', 'heartbeat-invoke');
    assert.equal(issueKey, RUNNER.deriveIdempotencyKey('seed', 'issue-create'));
    assert.notEqual(issueKey, heartbeatKey);
  });
});

// ---------------------------------------------------------------------------
// 5. Resumable mutation identity + recovery lock
// ---------------------------------------------------------------------------

describe('resumable mutation identity + recovery lock', () => {
  it('derives the same marker and distinct operation keys from the same seed', () => {
    const seed = 'stable-seed-01';
    assert.equal(RUNNER.deriveCorrelationMarker(seed), RUNNER.deriveCorrelationMarker(seed));
    const issueKey = RUNNER.deriveIdempotencyKey(seed, 'issue-create');
    const heartbeatKey = RUNNER.deriveIdempotencyKey(seed, 'heartbeat-invoke');
    assert.equal(issueKey, RUNNER.deriveIdempotencyKey(seed, 'issue-create'));
    assert.notEqual(issueKey, heartbeatKey);
    assert.ok(!issueKey.includes(seed));
  });

  it('rejects empty, unstable, or secret-shaped run-seed input', () => {
    assert.equal(RUNNER.isSafeRunSeed(''), false);
    assert.equal(RUNNER.isSafeRunSeed(' seed'), false);
    assert.equal(RUNNER.isSafeRunSeed('stable-seed-01'), true);
  });

  it('writes an atomic lock containing hashes and operation metadata only', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'm014-s07-lock-test-'));
    const lockPath = path.join(directory, 'recovery.lock.json');
    const seed = 'stable-seed-02';
    const marker = RUNNER.deriveCorrelationMarker(seed);
    const keys = {
      'issue-create': RUNNER.deriveIdempotencyKey(seed, 'issue-create'),
      'heartbeat-invoke': RUNNER.deriveIdempotencyKey(seed, 'heartbeat-invoke')
    };
    const lock = RUNNER.buildRecoveryLock(seed, marker, keys, 'unresolved', {
      'issue-create': 'attempted',
      'heartbeat-invoke': 'not-attempted'
    }, {
      baseUrl: 'https://paperclip.fake/',
      companyId: 'company-live-fixture',
      projectId: 'project-live-fixture',
      agentId: 'agent-live-fixture'
    });
    RUNNER.writeRecoveryLockAtomic(lockPath, lock);
    const raw = fs.readFileSync(lockPath, 'utf8');
    const loaded = RUNNER.readRecoveryLock(lockPath);
    assert.equal(loaded.ok, true);
    assert.equal(loaded.lock.seed_hash, RUNNER.sha256Hex(seed));
    assert.equal(loaded.lock.target_hashes.base_url_hash, RUNNER.sha256Hex('https://paperclip.fake'));
    assert.equal(raw.includes(seed), false);
    assert.equal(raw.includes('company-live-fixture'), false);
    assert.equal(RUNNER.validateRecoveryLock(loaded.lock), null);
  });
});

// ---------------------------------------------------------------------------
// 6. Lockfile + upstream audit
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

  it('auditUpstreamGate accepts the operator-promoted S04-S06 chain', () => {
    const r = RUNNER.auditUpstreamGate();
    assert.equal(r.gate_satisfied, true, JSON.stringify(r.blockers));
    assert.equal(r.blockers.length, 0);
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
    assert.equal(p.planned_http_invocation.path, '/api/auth/sign-in/email');
  });

  it('buildIssueCreatePlan returns business classification with bounded agent target', () => {
    const p = RUNNER.buildIssueCreatePlan({});
    assert.equal(p.classification, 'business');
    assert.equal(p.planned_http_invocation.path_template, '/api/companies/{companyId}/issues');
    assert.equal(p.bounded_test_agent_target.agent_kind, RUNNER.REQUIRED_BOUNDED_AGENT_KIND);
    assert.ok(p.bounded_test_agent_target.agent_id_prefix_constraint.includes('R3'));
  });

  it('buildHeartbeatInvokePlan declares required BOS fields and routing chain', () => {
    const p = RUNNER.buildHeartbeatInvokePlan({});
    assert.equal(p.classification, 'business');
    assert.equal(p.planned_http_invocation.path_template, '/api/agents/{agentId}/heartbeat/invoke');
    assert.deepEqual(p.planned_http_invocation.expected_resultJson_bos_required_fields, RUNNER.REQUIRED_BOS_RESULT_FIELDS.slice());
    assert.deepEqual(p.planned_http_invocation.expected_routing_preservation, VALIDATOR.R026_ROUTING_CHAIN.slice());
    assert.equal(p.wake_count_delta_policy.includes('1'), true);
  });

  it('buildIssueReadbackPlan marks independence', () => {
    const p = RUNNER.buildIssueReadbackPlan();
    assert.equal(p.classification, 'readback');
    assert.equal(p.planned_http_invocation.path_template, '/api/issues/{issueId}');
    assert.ok(p.independence_policy.includes('separate HTTP request'));
  });

  it('buildWakeCountCheckPlan marks independence and pre/post', () => {
    const p = RUNNER.buildWakeCountCheckPlan();
    assert.equal(p.classification, 'readback');
    assert.ok(p.independence_policy.includes('Pre-capture'));
  });

  it('buildBoundedPollHistory caps at MAX_POLL_BUDGET=12', () => {
    const h = RUNNER.buildBoundedPollHistory();
    assert.equal(h.max_poll_budget, RUNNER.MAX_POLL_BUDGET);
    assert.ok(h.polls.length <= RUNNER.MAX_POLL_BUDGET);
    assert.equal(h.polls.length, RUNNER.MAX_POLL_BUDGET);
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
    assert.deepEqual(j.entries.map((entry) => `${entry.method} ${entry.path}`), [
      'POST /api/auth/sign-in/email',
      'POST /api/companies/{companyId}/issues',
      'POST /api/agents/{agentId}/heartbeat/invoke',
      'GET /api/issues/{issueId}',
      'GET /api/agents/{agentId}'
    ]);
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

  it('parseArgs preserves live confirmation and fresh target bindings', () => {
    const a = RUNNER.parseArgs([
      '--mode', 'live', '--confirm-live', RUNNER.LIVE_CONFIRMATION_TOKEN,
      '--reason', 'D062 M014-a9jj46 S07 T04 bounded live proof',
      '--company-id', 'company-fresh', '--project-id', 'project-fresh', '--agent-id', 'agent-fresh', '--run-seed', 'stable-cli-seed'
    ]);
    assert.equal(a.mode, 'live');
    assert.equal(a.confirmationToken, RUNNER.LIVE_CONFIRMATION_TOKEN);
    assert.equal(a.companyId, 'company-fresh');
    assert.equal(a.projectId, 'project-fresh');
    assert.equal(a.agentId, 'agent-fresh');
    assert.equal(a.runSeed, 'stable-cli-seed');
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

  it('buildCanonicalEvidence propagates the satisfied operator-promoted upstream gate', () => {
    const auditResult = RUNNER.auditUpstreamGate();
    const plan = RUNNER.buildBoundedSessionCookiePlan(auditResult);
    const lockfileAudit = RUNNER.auditLockfile();
    const ev = RUNNER.buildCanonicalEvidence(plan, auditResult, lockfileAudit);
    assert.equal(ev.preconditions_audit.upstream_gate_satisfied, true);
  });
});

// ---------------------------------------------------------------------------
// 13. T04 live path: injected fake HTTP, no external mutation
// ---------------------------------------------------------------------------

const LIVE_FIXTURE = Object.freeze({
  companyId: 'company-live-fixture',
  projectId: 'project-live-fixture',
  agentId: 'agent-live-fixture',
  runSeed: 's07-network-free-fixture',
  issueId: 'issue-live-fixture',
  runId: 'run-live-fixture',
  baseUrl: 'https://paperclip.fake',
  correlationId: RUNNER.deriveCorrelationMarker('s07-network-free-fixture')
});

function fakeResponse(status, body, cookies = []) {
  return {
    status,
    headers: { getSetCookie: () => cookies },
    async text() { return body === undefined ? '' : JSON.stringify(body); }
  };
}

function makeFakeHttp(overrides = {}) {
  const requests = [];
  let issue = null;
  let issueListReads = 0;
  let agentReadbackReads = 0;
  let heartbeatPosts = 0;
  let heartbeatListReads = 0;
  let heartbeatRun = null;
  const fetchFn = async (url, init = {}) => {
    const parsed = new URL(url);
    const method = String(init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ method, pathname: parsed.pathname, search: parsed.search, headers: init.headers || {}, body });
    if (parsed.pathname === '/api/auth/sign-in/email') {
      return fakeResponse(200, { ok: true }, ['session=fake-session-secret; Path=/; HttpOnly']);
    }
    if (method === 'POST' && parsed.pathname.endsWith('/issues')) {
      issue = { id: LIVE_FIXTURE.issueId, companyId: LIVE_FIXTURE.companyId, projectId: LIVE_FIXTURE.projectId, title: body.title, status: 'open' };
      if (overrides.missingIssueCompany) delete issue.companyId;
      if (overrides.missingIssueProject) delete issue.projectId;
      if (overrides.unrelatedIssueCompany) issue.companyId = 'unrelated-company';
      if (overrides.unrelatedIssueProject) issue.projectId = 'unrelated-project';
      if (overrides.malformedIssueId) issue.id = '';
      if (overrides.ambiguousIssuePost) throw new Error('connection reset after issue commit');
      if (overrides.invalidIssueBody) {
        issue = null;
        return fakeResponse(201, null);
      }
      return fakeResponse(201, issue);
    }
    if (method === 'POST' && parsed.pathname.endsWith('/heartbeat/invoke')) {
      heartbeatPosts += 1;
      heartbeatRun = overrides.pollCap
        ? { id: LIVE_FIXTURE.runId, runId: LIVE_FIXTURE.runId, agentId: LIVE_FIXTURE.agentId, companyId: LIVE_FIXTURE.companyId, status: 'running', terminal: false, contextSnapshot: { wakeReason: LIVE_FIXTURE.correlationId } }
        : { id: LIVE_FIXTURE.runId, runId: LIVE_FIXTURE.runId, agentId: LIVE_FIXTURE.agentId, companyId: LIVE_FIXTURE.companyId, status: 'succeeded', exit_code: 0, contextSnapshot: { wakeReason: LIVE_FIXTURE.correlationId }, resultJson: { bos: {
          schemaVersion: 'bos-light-v1', runId: LIVE_FIXTURE.runId, issueId: LIVE_FIXTURE.issueId,
          division: 'Div1.HCO', role: 'bos-light', status: 'succeeded'
        } } };
      if (overrides.ambiguousHeartbeatPost) throw new Error('connection reset after heartbeat commit');
      if (overrides.invalidHeartbeatBody) return fakeResponse(200, null);
      return fakeResponse(200, heartbeatRun);
    }
    if (parsed.pathname === `/api/companies/${LIVE_FIXTURE.companyId}`) {
      return fakeResponse(200, overrides.unrelatedCompany ? { id: 'unrelated-company' } : { id: LIVE_FIXTURE.companyId, name: 'BOS' });
    }
    if (parsed.pathname === `/api/companies/${LIVE_FIXTURE.companyId}/projects`) {
      const project = overrides.unrelatedProject
        ? { id: LIVE_FIXTURE.projectId, companyId: 'unrelated-company' }
        : { id: LIVE_FIXTURE.projectId, companyId: LIVE_FIXTURE.companyId };
      if (overrides.missingProjectCompany) delete project.companyId;
      return fakeResponse(200, { projects: [project] });
    }
    if (parsed.pathname === `/api/companies/${LIVE_FIXTURE.companyId}/agents`) {
      const listedAgent = { id: LIVE_FIXTURE.agentId, companyId: LIVE_FIXTURE.companyId,
        adapterType: overrides.wrongAdapter ? 'other_adapter' : 'hermes_local',
        adapterConfig: { hermesLocal: { provider: overrides.xiaomi ? 'xiaomi' : 'minimax', model: 'MiniMax-M3' } },
        wakeCount: 4 };
      if (overrides.missingAgentCompany) delete listedAgent.companyId;
      return fakeResponse(200, { agents: [listedAgent] });
    }
    if (parsed.pathname === `/api/companies/${LIVE_FIXTURE.companyId}/heartbeat-runs`) {
      heartbeatListReads += 1;
      if (overrides.hideHeartbeatRecovery && heartbeatPosts > 0 && heartbeatListReads === 2) return fakeResponse(200, []);
      return fakeResponse(200, heartbeatRun ? [heartbeatRun] : []);
    }
    if (parsed.pathname === `/api/companies/${LIVE_FIXTURE.companyId}/issues`) {
      issueListReads += 1;
      const cursor = parsed.searchParams.get('cursor');
      if (overrides.hideIssueOnFirstRecovery && issueListReads === 2) return fakeResponse(200, { issues: [] });
      if (overrides.incompletePage) {
        return fakeResponse(200, { issues: Array.from({ length: RUNNER.ISSUE_PAGE_SIZE }, (_, index) => ({ id: `page-one-${index}`, companyId: LIVE_FIXTURE.companyId, projectId: LIVE_FIXTURE.projectId })) });
      }
      if (overrides.nextPage) {
        if (cursor !== 'page-two') {
          return fakeResponse(200, { issues: Array.from({ length: RUNNER.ISSUE_PAGE_SIZE }, (_, index) => ({ id: `page-one-${index}`, companyId: LIVE_FIXTURE.companyId, projectId: LIVE_FIXTURE.projectId })), pagination: { nextCursor: 'page-two' } });
        }
        return fakeResponse(200, { issues: [{ id: 'page-two-issue', companyId: LIVE_FIXTURE.companyId, projectId: LIVE_FIXTURE.projectId, body: `marker ${LIVE_FIXTURE.correlationId}` }] });
      }
      if (overrides.duplicate) return fakeResponse(200, { issues: [{ id: 'existing-issue', companyId: LIVE_FIXTURE.companyId, projectId: LIVE_FIXTURE.projectId, body: `marker ${LIVE_FIXTURE.correlationId}` }] });
      if (overrides.duplicateMissingOwnership) return fakeResponse(200, { issues: [{ id: 'existing-issue', body: `marker ${LIVE_FIXTURE.correlationId}` }] });
      return fakeResponse(200, { issues: issue ? [issue] : [] });
    }
    if (parsed.pathname === `/api/issues/${LIVE_FIXTURE.issueId}`) {
      const readbackIssue = issue || { id: LIVE_FIXTURE.issueId, companyId: LIVE_FIXTURE.companyId, projectId: LIVE_FIXTURE.projectId, status: 'open' };
      if (overrides.missingIssueReadbackCompany) delete readbackIssue.companyId;
      if (overrides.missingIssueReadbackProject) delete readbackIssue.projectId;
      return fakeResponse(200, readbackIssue);
    }
    if (parsed.pathname === `/api/heartbeat-runs/${LIVE_FIXTURE.runId}`) {
      return fakeResponse(200, heartbeatRun || { id: LIVE_FIXTURE.runId, runId: LIVE_FIXTURE.runId, agentId: LIVE_FIXTURE.agentId, companyId: LIVE_FIXTURE.companyId, status: 'running', terminal: false });
    }
    if (parsed.pathname === `/api/agents/${LIVE_FIXTURE.agentId}`) {
      agentReadbackReads += 1;
      const readbackAgent = { id: LIVE_FIXTURE.agentId, companyId: LIVE_FIXTURE.companyId,
        adapterType: 'hermes_local', adapterConfig: { hermesLocal: { provider: 'minimax', model: 'MiniMax-M3' } }, wakeCount: heartbeatPosts > 0 ? 5 : 4 };
      if (overrides.missingAgentPostCompany && heartbeatPosts > 0) delete readbackAgent.companyId;
      if (overrides.heartbeatProjection && heartbeatPosts > 0 && !(overrides.hideHeartbeatRecovery && agentReadbackReads === 2)) {
        readbackAgent.lastHeartbeat = { runId: LIVE_FIXTURE.runId, correlation: LIVE_FIXTURE.correlationId, status: 'succeeded', terminal: true, exit_code: 0, resultJson: { bos: {
          schemaVersion: 'bos-light-v1', runId: LIVE_FIXTURE.runId, issueId: LIVE_FIXTURE.issueId,
          division: 'Div1.HCO', role: 'bos-light', status: 'succeeded'
        } } };
      }
      return fakeResponse(200, readbackAgent);
    }
    throw new Error(`unexpected fake route ${method} ${parsed.pathname}${parsed.search}`);
  };
  return {
    fetchFn,
    requests,
    get issuePosts() { return requests.filter((request) => request.method === 'POST' && request.pathname.endsWith('/issues')).length; },
    get heartbeatPosts() { return heartbeatPosts; },
    get issueListReads() { return issueListReads; },
    get agentReadbackReads() { return agentReadbackReads; }
  };
}

function liveFixtureOptions(fake, overrides = {}) {
  const recoveryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'm014-s07-recovery-'));
  return {
    ...LIVE_FIXTURE,
    recoveryLockPath: path.join(recoveryDirectory, 'recovery.lock.json'),
    confirmationToken: RUNNER.LIVE_CONFIRMATION_TOKEN,
    reason: 'D062 M014-a9jj46 S07 T04 bounded live proof',
    env: { PAPERCLIP_EMAIL: 'operator@example.invalid', PAPERCLIP_PASSWORD: 'not-recorded', PAPERCLIP_API_KEY: undefined },
    fetchFn: fake.fetchFn,
    pollIntervalMs: 0,
    preflightFn: async () => ({ pass: true, blockers: [], diagnostics: { auth_mode: 'session-cookie' } }),
    ...overrides
  };
}

describe('T04 live path with injected fake HTTP', () => {
  it('requires an explicit run-seed before any network request', async () => {
    const fake = makeFakeHttp();
    const result = await RUNNER.runLive(liveFixtureOptions(fake, { runSeed: undefined }));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'LIVE-RUN-SEED-01');
    assert.equal(fake.requests.length, 0);
  });

  it('passes one issue POST and one heartbeat POST without Authorization', async () => {
    const fake = makeFakeHttp();
    const result = await RUNNER.runLive(liveFixtureOptions(fake));
    assert.equal(result.ok, true, result.reason);
    assert.equal(fake.issuePosts, 1);
    assert.equal(fake.heartbeatPosts, 1);
    assert.ok(fake.requests.every((request) => !Object.keys(request.headers).some((key) => key.toLowerCase() === 'authorization')));
    assert.equal(result.evidence.exact_side_effect_ledger.observed.issues_created, 1);
    assert.equal(result.evidence.exact_side_effect_ledger.observed.heartbeat_runs_started, 1);
    assert.equal(result.evidence.exact_side_effect_ledger.attempted.issue_create_posts, 1);
    assert.equal(result.evidence.exact_side_effect_ledger.attempted.heartbeat_posts, 1);
    const mutationRequests = fake.requests.filter((request) => request.method === 'POST' && (request.pathname.endsWith('/issues') || request.pathname.endsWith('/heartbeat/invoke')));
    assert.equal(new Set(mutationRequests.map((request) => request.headers['Idempotency-Key'])).size, 2);
    assert.equal(result.evidence.idempotency_key_sha256.distinct, true);
    const getCount = fake.requests.filter((request) => request.method === 'GET').length;
    assert.equal(result.evidence.readback_budget.used, getCount);
    assert.equal(result.evidence.exact_side_effect_ledger.readback_gets, getCount);
    assert.equal(result.evidence.exact_side_effect_ledger.observed.issues_created, 1);
    assert.equal(result.evidence.exact_side_effect_ledger.observed.heartbeat_runs_started, 1);
  });

  it('rejects missing confirmation before any HTTP request', async () => {
    const fake = makeFakeHttp();
    const result = await RUNNER.runLive(liveFixtureOptions(fake, { confirmationToken: null }));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'LIVE-CONFIRM-01');
    assert.equal(fake.requests.length, 0);
  });

  it('rejects non-D062 reason before any HTTP request', async () => {
    const fake = makeFakeHttp();
    const result = await RUNNER.runLive(liveFixtureOptions(fake, { reason: 'ordinary maintenance' }));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'LIVE-CONFIRM-02');
    assert.equal(fake.requests.length, 0);
  });

  it('rejects PAPERCLIP_API_KEY and never falls back to bearer auth', async () => {
    const fake = makeFakeHttp();
    const result = await RUNNER.runLive(liveFixtureOptions(fake, { env: { PAPERCLIP_API_KEY: 'forbidden' } }));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'LIVE-AUTH-01');
    assert.equal(fake.requests.length, 0);
  });

  it('rejects missing session credentials before any HTTP request', async () => {
    const fake = makeFakeHttp();
    const result = await RUNNER.runLive(liveFixtureOptions(fake, { env: { PAPERCLIP_EMAIL: '', PAPERCLIP_PASSWORD: '' } }));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'LIVE-AUTH-02');
    assert.equal(fake.requests.length, 0);
  });

  it('fails closed when preflight throws and performs no HTTP request', async () => {
    const fake = makeFakeHttp();
    const result = await RUNNER.runLive(liveFixtureOptions(fake, { preflightFn: async () => { throw new Error('preflight harness failure'); } }));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'LIVE-PREFLIGHT-01');
    assert.equal(fake.requests.length, 0);
  });

  it('calls preflight before auth and stops on a failed preflight', async () => {
    const fake = makeFakeHttp();
    let preflightCalls = 0;
    const result = await RUNNER.runLive(liveFixtureOptions(fake, {
      preflightFn: async () => { preflightCalls += 1; return { pass: false, blockers: [{ code: 'V-PF-05' }] }; }
    }));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'LIVE-PREFLIGHT-02');
    assert.equal(preflightCalls, 1);
    assert.equal(fake.requests.length, 0);
  });

  it('rejects stale and disposable lockfile IDs without using them as targets', async () => {
    const lockfile = JSON.parse(fs.readFileSync(RUNNER.LOCKFILE, 'utf8'));
    const synthetic = { stale_company_ids: { ids: ['stale-id'] }, disposable_company_ids: { ids: ['disposable-id'] } };
    assert.equal(RUNNER.rejectLockfileIds(synthetic, { companyId: 'stale-id', projectId: 'fresh', agentId: 'fresh' }).length, 1);
    assert.equal(RUNNER.rejectLockfileIds(synthetic, { companyId: 'disposable-id', projectId: 'fresh', agentId: 'fresh' }).length, 1);
    const fake = makeFakeHttp();
    const result = await RUNNER.runLive(liveFixtureOptions(fake, { companyId: lockfile.stale_company_ids.ids[0] }));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'LIVE-TARGET-03');
    assert.equal(fake.requests.length, 0);
  });

  it('rejects unrelated company and project readbacks before issue creation', async () => {
    for (const override of [{ unrelatedCompany: true }, { unrelatedProject: true }]) {
      const fake = makeFakeHttp(override);
      const result = await RUNNER.runLive(liveFixtureOptions(fake));
      assert.equal(result.ok, false);
      assert.equal(fake.issuePosts, 0);
      assert.equal(fake.heartbeatPosts, 0);
    }
  });

  it('fails closed when agent or project company ownership is missing before issue creation', async () => {
    for (const [override, expectedCode] of [
      [{ missingAgentCompany: true }, 'LIVE-ISOLATION-06'],
      [{ missingProjectCompany: true }, 'LIVE-ISOLATION-04']
    ]) {
      const fake = makeFakeHttp(override);
      const result = await RUNNER.runLive(liveFixtureOptions(fake));
      assert.equal(result.ok, false);
      assert.equal(result.code, expectedCode);
      assert.equal(fake.issuePosts, 0);
      assert.equal(fake.heartbeatPosts, 0);
    }
  });

  it('fails closed when issue company/project ownership is missing before heartbeat mutation', async () => {
    for (const override of [{ missingIssueCompany: true }, { missingIssueProject: true }]) {
      const fake = makeFakeHttp(override);
      const result = await RUNNER.runLive(liveFixtureOptions(fake));
      assert.equal(result.ok, false);
      assert.equal(result.code, 'LIVE-ISSUE-04');
      assert.equal(fake.issuePosts, 1);
      assert.equal(fake.heartbeatPosts, 0);
    }
  });

  it('fails closed when independent issue readback ownership is missing', async () => {
    for (const override of [{ missingIssueReadbackCompany: true }, { missingIssueReadbackProject: true }]) {
      const fake = makeFakeHttp(override);
      const result = await RUNNER.runLive(liveFixtureOptions(fake));
      assert.equal(result.ok, false);
      assert.equal(result.code, 'LIVE-ISSUE-06');
      assert.equal(fake.issuePosts, 1);
      assert.equal(fake.heartbeatPosts, 0);
      assert.ok(fake.requests.some((request) => request.method === 'GET' && request.pathname === `/api/issues/${LIVE_FIXTURE.issueId}`));
    }
  });

  it('fails closed when post-heartbeat agent ownership is missing', async () => {
    const fake = makeFakeHttp({ missingAgentPostCompany: true });
    const result = await RUNNER.runLive(liveFixtureOptions(fake));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'LIVE-AGENT-03');
    assert.equal(fake.issuePosts, 1);
    assert.equal(fake.heartbeatPosts, 1);
  });

  it('rejects a duplicate marker before issue creation', async () => {
    const fake = makeFakeHttp({ duplicate: true });
    const result = await RUNNER.runLive(liveFixtureOptions(fake));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'LIVE-DUPLICATE-02');
    assert.equal(fake.issuePosts, 0);
    assert.equal(fake.heartbeatPosts, 0);
  });

  it('checks the next bounded issue-list page before allowing issue creation', async () => {
    const fake = makeFakeHttp({ nextPage: true });
    const result = await RUNNER.runLive(liveFixtureOptions(fake));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'LIVE-DUPLICATE-02');
    assert.equal(fake.issuePosts, 0);
    assert.ok(fake.requests.some((request) => request.search.includes('cursor=page-two')));
  });

  it('fails closed when a full issue-list page has no continuation metadata', async () => {
    const fake = makeFakeHttp({ incompletePage: true });
    const result = await RUNNER.runLive(liveFixtureOptions(fake));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'LIVE-DUPLICATE-01');
    assert.equal(fake.issuePosts, 0);
    assert.equal(fake.heartbeatPosts, 0);
  });

  it('fails closed when a duplicate marker lacks exact company/project ownership', async () => {
    const fake = makeFakeHttp({ duplicateMissingOwnership: true });
    const result = await RUNNER.runLive(liveFixtureOptions(fake));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'LIVE-DUPLICATE-03');
    assert.equal(fake.issuePosts, 0);
  });

  it('records uncertainty for every attempted mutation whose 2xx body or validation is invalid', async () => {
    for (const [override, mutation, expectedCode] of [
      [{ invalidIssueBody: true }, 'issue', null],
      [{ malformedIssueId: true }, 'issue', 'LIVE-ISSUE-02'],
      [{ missingIssueCompany: true }, 'issue', 'LIVE-ISSUE-04'],
      [{ invalidHeartbeatBody: true, hideHeartbeatRecovery: true }, 'heartbeat', 'LIVE-HEARTBEAT-AMBIGUOUS'],
      [{ pollCap: true }, 'heartbeat', 'LIVE-HEARTBEAT-01']
    ]) {
      const fake = makeFakeHttp(override);
      const result = await RUNNER.runLive(liveFixtureOptions(fake));
      if (override.invalidIssueBody) {
        assert.equal(result.ok, false);
        assert.equal(result.code, 'LIVE-ISSUE-AMBIGUOUS');
      } else {
        assert.equal(result.ok, false, `override=${JSON.stringify(override)} code=${result.code}`);
        if (expectedCode) assert.equal(result.code, expectedCode);
      }
      assert.equal(result.evidence.exact_side_effect_ledger.observed.unconfirmed_live_side_effects >= 1, true, `${mutation} uncertainty must be non-zero`);
      assert.equal(result.evidence.exact_side_effect_ledger.attempted[`${mutation === 'issue' ? 'issue_create' : 'heartbeat'}_posts`], 1);
    }
  });

  it('recovers an ambiguous issue POST with GET only and never retries POST', async () => {
    const fake = makeFakeHttp({ ambiguousIssuePost: true });
    const result = await RUNNER.runLive(liveFixtureOptions(fake));
    assert.equal(result.ok, true, result.reason);
    assert.equal(fake.issuePosts, 1);
    assert.equal(fake.heartbeatPosts, 1);
    assert.ok(result.evidence.request_journal.some((entry) => entry.response && entry.response.transport === 'ambiguous'));
    assert.ok(result.evidence.request_journal.some((entry) => entry.operation === 'issue-create-ambiguous-recovery' && entry.method === 'GET'));
  });

  it('resumes the same seed after an ambiguous issue POST without repeating mutation', async () => {
    const fake = makeFakeHttp({ ambiguousIssuePost: true, hideIssueOnFirstRecovery: true });
    const recoveryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'm014-s07-resume-'));
    const recoveryLockPath = path.join(recoveryDirectory, 'recovery.lock.json');
    const first = await RUNNER.runLive(liveFixtureOptions(fake, { recoveryLockPath }));
    assert.equal(first.ok, false);
    assert.equal(first.code, 'LIVE-ISSUE-AMBIGUOUS');
    assert.equal(fake.issuePosts, 1);
    assert.equal(fs.existsSync(recoveryLockPath), true);
    const rawLock = fs.readFileSync(recoveryLockPath, 'utf8');
    assert.equal(rawLock.includes(LIVE_FIXTURE.companyId), false);
    assert.equal(rawLock.includes(LIVE_FIXTURE.issueId), false);

    const second = await RUNNER.runLive(liveFixtureOptions(fake, { recoveryLockPath }));
    assert.equal(second.ok, false);
    assert.equal(second.code, 'LIVE-RECOVERY-POST-REFUSED');
    assert.equal(fake.issuePosts, 1, 'same-seed recovery must not repeat issue creation');
    assert.equal(fake.heartbeatPosts, 0, 'GET-only recovery must not start a new heartbeat POST');
    assert.equal(fs.existsSync(recoveryLockPath), true, 'unresolved lock is retained for operator reconciliation');
  });

  it('resumes an ambiguous heartbeat with the same seed through GET-only recovery', async () => {
    const fake = makeFakeHttp({ ambiguousHeartbeatPost: true, heartbeatProjection: true, hideHeartbeatRecovery: true });
    const recoveryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'm014-s07-heartbeat-resume-'));
    const recoveryLockPath = path.join(recoveryDirectory, 'recovery.lock.json');
    const first = await RUNNER.runLive(liveFixtureOptions(fake, { recoveryLockPath }));
    assert.equal(first.ok, false);
    assert.equal(first.code, 'LIVE-HEARTBEAT-AMBIGUOUS');
    assert.equal(fake.issuePosts, 1);
    assert.equal(fake.heartbeatPosts, 1);

    const second = await RUNNER.runLive(liveFixtureOptions(fake, { recoveryLockPath }));
    assert.equal(second.ok, true, second.reason);
    assert.equal(fake.issuePosts, 1);
    assert.equal(fake.heartbeatPosts, 1, 'same-seed heartbeat recovery must not repeat POST');
    assert.equal(fs.existsSync(recoveryLockPath), true, 'terminal lock is retained after successful recovery');

    const third = await RUNNER.runLive(liveFixtureOptions(fake, { recoveryLockPath }));
    assert.equal(third.ok, true, third.reason);
    assert.equal(fake.issuePosts, 1, 'completed-lock evidence hydration must not repeat issue POST');
    assert.equal(fake.heartbeatPosts, 1, 'completed-lock evidence hydration must not repeat heartbeat POST');
    assert.equal(third.evidence.request_journal.filter((entry) => entry.method === 'POST' && entry.classification === 'business').length, 2);
    assert.equal(third.evidence.request_journal.filter((entry) => entry.method === 'POST' && entry.classification === 'business').every((entry) => entry.recovered === true), true);
  });

  it('refuses a different seed while the prior mutation remains unresolved', async () => {
    const fake = makeFakeHttp({ ambiguousIssuePost: true, hideIssueOnFirstRecovery: true });
    const recoveryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'm014-s07-seed-refusal-'));
    const recoveryLockPath = path.join(recoveryDirectory, 'recovery.lock.json');
    const first = await RUNNER.runLive(liveFixtureOptions(fake, { recoveryLockPath }));
    assert.equal(first.ok, false);
    const requestCountAfterFirstRun = fake.requests.length;
    const second = await RUNNER.runLive(liveFixtureOptions(fake, {
      recoveryLockPath,
      runSeed: 'different-stable-seed'
    }));
    assert.equal(second.ok, false);
    assert.equal(second.code, 'LIVE-RECOVERY-TARGET-MISMATCH');
    assert.equal(fake.requests.length, requestCountAfterFirstRun, 'seed refusal must happen before any network request');
    assert.equal(fake.issuePosts, 1);
    assert.equal(fake.heartbeatPosts, 0);
  });

  it('rejects ambiguous issue recovery without exact project ownership', async () => {
    const fake = makeFakeHttp({ ambiguousIssuePost: true, missingIssueProject: true });
    const result = await RUNNER.runLive(liveFixtureOptions(fake));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'LIVE-ISSUE-AMBIGUOUS');
    assert.equal(fake.issuePosts, 1);
    assert.equal(fake.heartbeatPosts, 0);
    assert.ok(fake.requests.some((request) => request.method === 'GET' && request.search.includes('limit=100')));
  });

  it('recovers an ambiguous heartbeat with GET only and never retries heartbeat POST', async () => {
    const fake = makeFakeHttp({ ambiguousHeartbeatPost: true });
    const result = await RUNNER.runLive(liveFixtureOptions(fake));
    assert.equal(result.ok, true, result.reason);
    assert.equal(fake.heartbeatPosts, 1);
    assert.equal(result.evidence.exact_side_effect_ledger.observed.unconfirmed_live_side_effects, 0);
    assert.ok(fake.requests.some((request) => request.method === 'GET' && request.pathname === `/api/companies/${LIVE_FIXTURE.companyId}/heartbeat-runs`));
  });

  it('caps nonterminal heartbeat polling and does not issue a second heartbeat POST', async () => {
    const fake = makeFakeHttp({ pollCap: true });
    const result = await RUNNER.runLive(liveFixtureOptions(fake));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'LIVE-HEARTBEAT-01');
    assert.equal(fake.heartbeatPosts, 1);
    const polls = result.evidence.request_journal.filter((entry) => entry.operation.startsWith('heartbeat-status-poll-'));
    assert.ok(polls.length <= RUNNER.LIVE_MAX_HEARTBEAT_POLLS);
    assert.ok(polls.length >= 1);
    assert.ok(result.evidence.readback_budget.used <= RUNNER.MAX_POLL_BUDGET);
  });

  it('redacts cookies, credentials, and full UUIDs before evidence scan', () => {
    const state = {
      ok: false,
      targets: { companyId: '123e4567-e89b-12d3-a456-426614174000', projectId: '223e4567-e89b-12d3-a456-426614174000', agentId: '323e4567-e89b-12d3-a456-426614174000' },
      correlationId: 'M014-S07-T04-123e4567-e89b-12d3-a456-426614174000',
      idempotencyKey: 'M014-S07-T04-223e4567-e89b-12d3-a456-426614174000',
      journal: [{ request: { Cookie: 'session=super-secret-cookie', raw: 'MINIMAX_API_KEY=super-secret-value' } }],
      budget: { reads: 0 },
      counts: { issueCreates: 0, heartbeatPosts: 0, otherMutations: 0 },
      confirmed: { issue: null, heartbeat: null },
      unconfirmedSideEffects: 0,
      preflight: { pass: false, blockers: [] },
      readbackHashes: {}
    };
    const evidence = RUNNER.buildLiveEvidence(state);
    const serialized = JSON.stringify(evidence);
    assert.equal(VALIDATOR.scanCredentialLeaks(serialized).length, 0);
    assert.equal(VALIDATOR.scanUuidLeaks(serialized).length, 0);
    assert.ok(!serialized.includes('super-secret-cookie'));
    assert.ok(!serialized.includes('super-secret-value'));
    assert.ok(!serialized.includes('123e4567-e89b-12d3-a456-426614174000'));
  });

  it('rejects wrong adapter/provider and Xiaomi reuse before issue creation', async () => {
    for (const override of [{ wrongAdapter: true }, { xiaomi: true }]) {
      const fake = makeFakeHttp(override);
      const result = await RUNNER.runLive(liveFixtureOptions(fake));
      assert.equal(result.ok, false);
      assert.equal(result.code, 'LIVE-ADAPTER-01');
      assert.equal(fake.issuePosts, 0);
    }
  });
});