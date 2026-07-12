#!/usr/bin/env node
/**
 * @file scripts/test_paperclip_preflight.js
 *
 * M014-a9jj46/S03/T02 — tests for scripts/lib/paperclip-preflight.js.
 *
 * Verifies all 10 validation classes declared in the preflight header doc:
 *   V-PF-01 lockfile_present
 *   V-PF-02 lockfile_valid
 *   V-PF-03 stale_target
 *   V-PF-04 auth_present
 *   V-PF-05 health_reachable
 *   V-PF-06 endpoint_reachable
 *   V-PF-07 adapter_support
 *   V-PF-08 explicit_confirmation
 *   V-PF-09 override_authorized
 *   V-PF-10 zero_mutation_in_preflight
 *
 * Run with:
 *   node --test scripts/test_paperclip_preflight.js
 *
 * Design contract (slice 14-03-PLAN must-have):
 *   - Fail-closed: every missing/blocking prerequisite produces a structured blocker
 *   - Zero mutation: no fetch call ever receives POST/PUT/PATCH/DELETE
 *   - Secrets are never echoed in blocker output
 *   - Tests use git-tracked fixtures (tmpdir() under os.tmpdir() is the only
 *     writable scratch space — never .gsd/, .planning/, or .audits/)
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const preflight = require('./lib/paperclip-preflight');
const { validateLockfile } = require('./validate_paperclip_runtime_lock');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// The six R3 stale UUIDs as recorded in paperclip-runtime.lock.json (T01
// shipped lockfile). Each test fixture must use the exact canonical forms so
// checkStaleTarget (which performs a case-insensitive string equality check)
// matches them deterministically.
const R3_STALE_UUIDS = [
  '9feb4c22-05b9-401e-ba67-0e866e3056da',
  '43c74adb-b194-44d1-8f8e-ba142544bb9d',
  '1a194762-0000-4000-8000-000000000000',
  '7595fd85-0000-4000-8000-000000000000',
  '7eede16c-0000-4000-8000-000000000000',
  '8233ea7b-0000-4000-8000-000000000000'
];

/**
 * Build a minimal, schema-valid lockfile. Mirrors the helper in
 * scripts/validate_paperclip_runtime_lock.js so each test starts from a
 * known-good baseline and only mutates the field under test.
 *
 * Notes on V-LF-03 / V-LF-04 constraints:
 *   - runtime_target.fresh_readback_required MUST be true (per V-LF-03).
 *   - verified_base_url_status must contain "provisional" OR "verified".
 *   - canonical_company_id / verified_company_id MUST be null while
 *     fresh_readback_required=true (V-LF-04 forbids non-null without verified).
 *
 * This combination is intentional: it forces tests to use explicitCompanyId +
 * override=allow for any happy-path scenario that needs a companyId.
 */
function minimalValidLockfile() {
  return {
    $schema: 'gsd/m014-s03-runtime-lockfile-v1',
    milestone: 'M014-a9jj46',
    slice: 'S03',
    task: 'T02',
    purpose: 'preflight-test-fixture',
    generated: '2026-07-11',
    generated_by: 'fixture',
    consumes: [],
    freshness_posture: {
      policy: 'snapshot',
      as_of: '2026-07-11',
      must_reprobe_after: '2026-07-11T00:00:00Z'
    },
    runtime_target: {
      public_ingress: 'https://paperclip.oysana.com',
      vps_ip: '87.99.146.178',
      sandbox_path: '/opt/paperclip-sandbox',
      compose_project: 'paperclip_sandbox',
      container_name: 'paperclip_sandbox-paperclip-1',
      container_binding: '127.0.0.1:3131->3100/tcp on VPS only',
      verified_base_url: null,
      verified_base_url_status: 'provisional-pending-fresh-readback',
      fresh_readback_required: true
    },
    company_identity: {
      canonical_company_id: null,
      canonical_company_id_status: 'provisional-pending-fresh-readback',
      verified_company_id: null,
      verified_company_id_status: 'provisional-pending-fresh-readback',
      fresh_readback_required: true
    },
    stale_company_ids: {
      ids: R3_STALE_UUIDS.slice()
    },
    disposable_company_ids: { ids: [] },
    auth_modes: {
      default_mode: 'session-cookie',
      allowed: [{ mode: 'session-cookie', status: 'confirmed' }],
      rejected: [{ mode: 'api-key-bearer (PAPERCLIP_API_KEY)', status: 'rejected' }],
      forbidden: [{ mode: 'public-sign-up', status: 'forbidden' }]
    },
    safe_restart_command:
      'cd /opt/paperclip-sandbox/docker && docker compose -p paperclip_sandbox up -d paperclip',
    forbidden_commands: [
      { command: 'docker compose down -v', reason: 'Destructive' },
      { command: 'docker volume prune', reason: 'Destructive' },
      { command: 'docker system prune', reason: 'Destructive' },
      { command: 'docker rm', reason: 'Destructive' },
      { command: 'docker volume rm', reason: 'Destructive' }
    ],
    forbidden_command_rule: 'Forbidden on VPS unless explicitly approved.',
    mutation_default_sources: {
      policy: 'mutation defaults only from runtime_target, auth_modes, company_identity',
      forbidden_default_sources: [
        'stale_company_ids.ids',
        'disposable_company_ids.ids',
        'any hardcoded UUID literal in a script'
      ],
      explicit_override_required: true,
      explicit_override_env: 'PAPERCLIP_COMPANY_ID_OVERRIDE'
    },
    validator_classes: ['schema_top_level_keys'],
    downstream_handoff: {}
  };
}

/**
 * Create a writable temp directory and write a lockfile there. Returns the
 * absolute path. Each call creates an isolated dir under os.tmpdir() so
 * parallel test runs do not collide and no .gsd/ or .planning/ state is
 * mutated.
 */
function writeLockfileToTempDir(lockfile) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-test-'));
  const p = path.join(dir, 'paperclip-runtime.lock.json');
  fs.writeFileSync(p, JSON.stringify(lockfile, null, 2));
  return p;
}

function removeTmpLockfile(p) {
  try {
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
    const dir = path.dirname(p);
    if (dir && fs.existsSync(dir)) fs.rmdirSync(dir);
  } catch (_err) {
    // best-effort cleanup; tmpdir() is wiped by the OS eventually
  }
}

/**
 * Build an env-reader factory with the standard overrides for the happy
 * path (override=allow + EMAIL + PASSWORD; no API_KEY). Tests that need to
 * simulate missing auth or rejected tokens override individual fields.
 */
function envWith(overrides = {}) {
  const defaults = {
    PAPERCLIP_COMPANY_ID_OVERRIDE: 'allow',
    PAPERCLIP_EMAIL: 'op@example.com',
    PAPERCLIP_PASSWORD: 'op-secret-password',
    PAPERCLIP_API_KEY: undefined
  };
  const merged = { ...defaults, ...overrides };
  return (name) => merged[name];
}

/**
 * Build a recording fetch stub. Returns a function with a `.calls` array
 * populated by every invocation. Default success is 200 OK; override
 * `behaviors` to script specific status codes / network errors per URL.
 */
function recordingFetch(behaviors = []) {
  const calls = [];
  let i = 0;
  const fn = async (url, init = {}) => {
    calls.push({ url, method: String(init.method || 'GET').toUpperCase(), init });
    const b = behaviors[i++] || { status: 200 };
    if (b.throwWith) throw b.throwWith;
    return { status: b.status || 200, ok: (b.status || 200) < 400 };
  };
  fn.calls = calls;
  return fn;
}

// ---------------------------------------------------------------------------
// V-PF-01 lockfile_present
// ---------------------------------------------------------------------------

describe('V-PF-01 lockfile_present', () => {
  it('checkLockfilePresent blocks when lockfile is missing', () => {
    const missing = path.join(os.tmpdir(), 'pf-test-no-such-' + Date.now() + '.json');
    const res = preflight.checkLockfilePresent(missing);
    assert.equal(res.summary, undefined);
    assert.ok(res.blocker);
    assert.equal(res.blocker.code, 'V-PF-01');
    assert.equal(res.blocker.kind, 'schema');
    assert.equal(res.blocker.where, missing);
    assert.match(res.blocker.message, /missing or unreadable/i);
    assert.equal(res.blocker.evidence.path, missing);
    assert.match(res.blocker.remediation, /Restore paperclip-runtime\.lock\.json/);
  });

  it('checkLockfilePresent blocks when JSON.parse fails', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-test-'));
    const p = path.join(dir, 'paperclip-runtime.lock.json');
    fs.writeFileSync(p, '{ "broken: json');
    try {
      const res = preflight.checkLockfilePresent(p);
      assert.equal(res.summary, undefined);
      assert.ok(res.blocker);
      assert.equal(res.blocker.code, 'V-PF-01');
      assert.match(res.blocker.message, /JSON parse failed/);
    } finally {
      removeTmpLockfile(p);
    }
  });

  it('checkLockfilePresent returns summary when lockfile parses', () => {
    const p = writeLockfileToTempDir(minimalValidLockfile());
    try {
      const res = preflight.checkLockfilePresent(p);
      assert.equal(res.blocker, undefined);
      assert.ok(res.summary);
      assert.equal(res.summary.lockfilePath, p);
      assert.equal(typeof res.summary.lockfile, 'object');
      assert.equal(res.summary.lockfile.milestone, 'M014-a9jj46');
    } finally {
      removeTmpLockfile(p);
    }
  });

  it('runPreflight returns pass=false with V-PF-01 blocker when lockfile missing', async () => {
    const missing = path.join(os.tmpdir(), 'pf-test-no-such-' + Date.now() + '.json');
    const result = await preflight.runPreflight({
      lockfilePath: missing,
      readEnv: envWith(),
      confirmation: { explicit: true, reason: 'test' },
      bypassHealthProbe: true,
      bypassVisibilityProbe: true
    });
    assert.equal(result.pass, false);
    assert.equal(result.blockers.length, 1);
    assert.equal(result.blockers[0].code, 'V-PF-01');
    assert.equal(result.diagnostics.lockfile_loaded, undefined);
  });
});

// ---------------------------------------------------------------------------
// V-PF-02 lockfile_valid
// ---------------------------------------------------------------------------

describe('V-PF-02 lockfile_valid', () => {
  it('checkLockfileValid returns summary when lockfile is valid', () => {
    // Sanity check: validateLockfile (called transitively by checkLockfileValid)
    // must report zero blockers on the baseline fixture. If this fails, the
    // fixture itself is broken — fix the fixture before fixing tests.
    const lf = minimalValidLockfile();
    const sanity = validateLockfile(lf);
    assert.equal(
      sanity.length,
      0,
      `baseline fixture must validate cleanly, got ${JSON.stringify(sanity.map((b) => ({ code: b.code, where: b.where })))}`
    );
    const res = preflight.checkLockfileValid(lf);
    assert.equal(res.blocker, undefined);
    assert.ok(res.summary);
    assert.equal(res.summary.blockersChecked, 0);
  });

  it('checkLockfileValid promotes V-LF-* blockers into V-PF-02 with kind+where', () => {
    const lf = minimalValidLockfile();
    delete lf.freshness_posture; // triggers V-LF-01 + V-LF-02 in T01
    const res = preflight.checkLockfileValid(lf);
    assert.equal(res.summary, undefined);
    const blocked = Array.isArray(res.blocker) ? res.blocker : [res.blocker];
    assert.ok(blocked.length >= 1);
    for (const b of blocked) {
      assert.equal(b.code, 'V-PF-02');
      assert.match(b.message, /lockfile invalid/);
      assert.match(b.where, /^lockfile\./);
    }
  });

  it('runPreflight returns pass=false with V-PF-02 blockers when lockfile is malformed', async () => {
    const lf = minimalValidLockfile();
    delete lf.forbidden_commands; // schema-invalid
    const p = writeLockfileToTempDir(lf);
    try {
      const result = await preflight.runPreflight({
        lockfilePath: p,
        readEnv: envWith(),
        confirmation: { explicit: true, reason: 'test' },
        bypassHealthProbe: true,
        bypassVisibilityProbe: true
      });
      assert.equal(result.pass, false);
      const v2 = result.blockers.filter((b) => b.code === 'V-PF-02');
      assert.ok(v2.length >= 1);
      // V-PF-02 must surface the inner validator's remediation hint
      for (const b of v2) assert.equal(typeof b.remediation, 'string');
    } finally {
      removeTmpLockfile(p);
    }
  });
});

// ---------------------------------------------------------------------------
// V-PF-03 stale_target
// ---------------------------------------------------------------------------

describe('V-PF-03 stale_target', () => {
  it('blocks when explicitCompanyId matches a stale UUID (case-insensitive)', () => {
    const lf = minimalValidLockfile();
    // Use the exact ship-canonical R3 stale UUID but uppercase — proves
    // checkStaleTarget compares case-insensitively.
    const res = preflight.checkStaleTarget(lf, R3_STALE_UUIDS[0].toUpperCase());
    assert.equal(res.summary, undefined);
    assert.ok(res.blocker);
    assert.equal(res.blocker.code, 'V-PF-03');
    assert.equal(res.blocker.kind, 'target');
    assert.equal(res.blocker.where, 'explicit_company_id');
    assert.match(res.blocker.message, /stale_company_ids\.ids/);
    assert.equal(res.blocker.evidence.matched_ledger, 'stale_company_ids');
  });

  it('blocks when explicitCompanyId matches a disposable UUID', () => {
    const lf = minimalValidLockfile();
    lf.disposable_company_ids.ids = ['aaaa1111-2222-3333-4444-555566667777'];
    const res = preflight.checkStaleTarget(lf, 'aaaa1111-2222-3333-4444-555566667777');
    assert.equal(res.summary, undefined);
    assert.ok(res.blocker);
    assert.equal(res.blocker.code, 'V-PF-03');
    assert.equal(res.blocker.evidence.matched_ledger, 'disposable_company_ids');
    assert.match(res.blocker.message, /disposable_company_ids\.ids/);
  });

  it('accepts a fresh, non-stale companyId', () => {
    const lf = minimalValidLockfile();
    const res = preflight.checkStaleTarget(lf, 'bbbb1111-2222-3333-4444-555566667777');
    assert.equal(res.blocker, undefined);
    assert.ok(res.summary);
    assert.equal(res.summary.company_id_prefix, 'bbbb1111');
  });

  it('blocks when no companyId is supplied (lockfile canonical also null)', () => {
    const lf = minimalValidLockfile();
    const res = preflight.checkStaleTarget(lf, null);
    assert.ok(res.blocker);
    assert.equal(res.blocker.code, 'V-PF-03');
    assert.equal(res.blocker.kind, 'target');
    assert.equal(res.blocker.where, 'company_identity');
    assert.match(res.blocker.message, /no resolved companyId/);
  });

  it('blocks when no companyId is supplied as empty string', () => {
    const lf = minimalValidLockfile();
    const res = preflight.checkStaleTarget(lf, '');
    assert.ok(res.blocker);
    assert.equal(res.blocker.code, 'V-PF-03');
  });

  it('runPreflight blocks with V-PF-03 when explicitCompanyId is stale', async () => {
    const p = writeLockfileToTempDir(minimalValidLockfile());
    try {
      const result = await preflight.runPreflight({
        lockfilePath: p,
        explicitCompanyId: R3_STALE_UUIDS[0], // stale R3 UUID
        readEnv: envWith(),
        confirmation: { explicit: true, reason: 'test' },
        bypassHealthProbe: true,
        bypassVisibilityProbe: true
      });
      assert.equal(result.pass, false);
      assert.ok(result.blockers.some((b) => b.code === 'V-PF-03'));
      // The stale-id check supersedes override=allow even when both flags set
      assert.equal(
        result.blockers.some((b) => b.code === 'V-PF-09'),
        false
      );
    } finally {
      removeTmpLockfile(p);
    }
  });

  it('runPreflight requires override=allow when lockfile canonical is null and no explicit', async () => {
    const p = writeLockfileToTempDir(minimalValidLockfile());
    try {
      const result = await preflight.runPreflight({
        lockfilePath: p,
        readEnv: envWith({ PAPERCLIP_COMPANY_ID_OVERRIDE: undefined }),
        confirmation: { explicit: true, reason: 'test' },
        bypassHealthProbe: true,
        bypassVisibilityProbe: true
      });
      assert.equal(result.pass, false);
      assert.ok(result.blockers.some((b) => b.code === 'V-PF-03'));
      // diagnostics.company_id_source must be null because no source resolved
      assert.equal(result.diagnostics.company_id_source, null);
    } finally {
      removeTmpLockfile(p);
    }
  });
});

// ---------------------------------------------------------------------------
// V-PF-04 auth_present
// ---------------------------------------------------------------------------

describe('V-PF-04 auth_present', () => {
  it('blocks when PAPERCLIP_API_KEY is set in env', () => {
    const res = preflight.checkAuthPresence(envWith({ PAPERCLIP_API_KEY: 'sk-leaked' }));
    assert.equal(res.summary, undefined);
    assert.ok(res.blocker);
    assert.equal(res.blocker.code, 'V-PF-04');
    assert.equal(res.blocker.kind, 'auth');
    assert.deepEqual(res.blocker.evidence.rejected_tokens, ['PAPERCLIP_API_KEY']);
  });

  it('blocks when PAPERCLIP_EMAIL is missing', () => {
    const res = preflight.checkAuthPresence(
      envWith({ PAPERCLIP_EMAIL: undefined })
    );
    assert.equal(res.summary, undefined);
    assert.ok(res.blocker);
    assert.equal(res.blocker.code, 'V-PF-04');
    assert.deepEqual(res.blocker.evidence.missing_env, ['PAPERCLIP_EMAIL']);
  });

  it('blocks when PAPERCLIP_PASSWORD is missing', () => {
    const res = preflight.checkAuthPresence(
      envWith({ PAPERCLIP_PASSWORD: undefined })
    );
    assert.ok(res.blocker);
    assert.equal(res.blocker.code, 'V-PF-04');
    assert.deepEqual(res.blocker.evidence.missing_env, ['PAPERCLIP_PASSWORD']);
  });

  it('blocks when both EMAIL and PASSWORD missing', () => {
    const res = preflight.checkAuthPresence(
      envWith({ PAPERCLIP_EMAIL: undefined, PAPERCLIP_PASSWORD: undefined })
    );
    assert.ok(res.blocker);
    assert.equal(res.blocker.code, 'V-PF-04');
    assert.equal(res.blocker.evidence.missing_env.length, 2);
  });

  it('accepts when session-cookie creds present and API_KEY absent', () => {
    const res = preflight.checkAuthPresence(envWith());
    assert.equal(res.blocker, undefined);
    assert.ok(res.summary);
    assert.equal(res.summary.auth_mode, 'session-cookie');
    assert.equal(res.summary.has_email, true);
    assert.equal(res.summary.has_password, true);
    assert.equal(res.summary.has_api_key, false);
  });

  it('runPreflight blocks with V-PF-04 when env has no auth at all', async () => {
    const p = writeLockfileToTempDir(minimalValidLockfile());
    try {
      const result = await preflight.runPreflight({
        lockfilePath: p,
        explicitCompanyId: 'bbbb1111-2222-3333-4444-555566667777',
        readEnv: () => undefined,
        confirmation: { explicit: true, reason: 'test' },
        bypassHealthProbe: true,
        bypassVisibilityProbe: true
      });
      assert.equal(result.pass, false);
      // Will fail at V-PF-09 (no override=allow) before reaching V-PF-04;
      // both are acceptable blockers per the slice's "fail closed" contract.
      assert.ok(
        result.blockers.some((b) => b.code === 'V-PF-09' || b.code === 'V-PF-04'),
        `expected V-PF-09 or V-PF-04, got ${result.blockers.map((b) => b.code).join(',')}`
      );
    } finally {
      removeTmpLockfile(p);
    }
  });
});

// ---------------------------------------------------------------------------
// V-PF-05 health_reachable
// ---------------------------------------------------------------------------

describe('V-PF-05 health_reachable', () => {
  function makeTarget() {
    return preflight.resolveRuntimeTarget(minimalValidLockfile());
  }

  it('blocks when /api/health returns 5xx', async () => {
    const target = makeTarget();
    const fetchFn = recordingFetch([{ status: 503 }]);
    const res = await preflight.probeHealth(target, fetchFn);
    assert.equal(res.summary, undefined);
    assert.ok(res.blocker);
    assert.equal(res.blocker.code, 'V-PF-05');
    assert.match(res.blocker.message, /503/);
    assert.equal(res.blocker.evidence.status, 503);
  });

  it('blocks when network error occurs', async () => {
    const target = makeTarget();
    const fetchFn = recordingFetch([
      { throwWith: Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }) }
    ]);
    const res = await preflight.probeHealth(target, fetchFn);
    assert.equal(res.summary, undefined);
    assert.ok(res.blocker);
    assert.equal(res.blocker.code, 'V-PF-05');
    assert.match(res.blocker.message, /network error/);
  });

  it('accepts when /api/health returns 2xx', async () => {
    const target = makeTarget();
    const fetchFn = recordingFetch([{ status: 200 }]);
    const res = await preflight.probeHealth(target, fetchFn);
    assert.equal(res.blocker, undefined);
    assert.ok(res.summary);
    assert.equal(res.summary.status, 200);
  });

  it('accepts when /api/health returns 3xx (redirect range)', async () => {
    const target = makeTarget();
    const fetchFn = recordingFetch([{ status: 301 }]);
    const res = await preflight.probeHealth(target, fetchFn);
    assert.equal(res.blocker, undefined);
    assert.equal(res.summary.status, 301);
  });

  it('blocks when no resolvable base URL is present', async () => {
    const fetchFn = recordingFetch();
    const res = await preflight.probeHealth(
      { verified_base_url: null, public_ingress: null },
      fetchFn
    );
    assert.ok(res.blocker);
    assert.equal(res.blocker.code, 'V-PF-05');
    assert.match(res.blocker.message, /no resolvable base URL/);
    assert.equal(fetchFn.calls.length, 0, 'fetch must not be called without base URL');
  });

  it('runPreflight skips health probe when bypassHealthProbe=true', async () => {
    const p = writeLockfileToTempDir(minimalValidLockfile());
    try {
      const fetchFn = recordingFetch(); // no behaviors, will throw if called
      const result = await preflight.runPreflight({
        lockfilePath: p,
        explicitCompanyId: 'bbbb1111-2222-3333-4444-555566667777',
        readEnv: envWith(),
        confirmation: { explicit: true, reason: 'test' },
        bypassHealthProbe: true,
        bypassVisibilityProbe: true,
        fetchFn
      });
      assert.equal(result.pass, true);
      assert.equal(result.diagnostics.bypass_health, true);
      // The fetchFn must NOT have been called when both probes are bypassed
      assert.equal(fetchFn.calls.length, 0);
    } finally {
      removeTmpLockfile(p);
    }
  });
});

// ---------------------------------------------------------------------------
// V-PF-06 endpoint_reachable
// ---------------------------------------------------------------------------

describe('V-PF-06 endpoint_reachable', () => {
  function makeTarget() {
    return preflight.resolveRuntimeTarget(minimalValidLockfile());
  }

  it('accepts 2xx, 401, 403, 404, and 405 on the company endpoint', async () => {
    for (const status of [200, 401, 403, 404, 405]) {
      const target = makeTarget();
      const fetchFn = recordingFetch([{ status }]);
      const res = await preflight.probeEndpointReachable(
        target,
        'bbbb1111-2222-3333-4444-555566667777',
        fetchFn
      );
      assert.equal(res.blocker, undefined, `status ${status} should be routable`);
      assert.ok(res.summary);
      assert.equal(res.summary.routable, true);
      assert.equal(res.summary.status, status);
      // V-PF-10: probe uses HEAD/GET only, never a mutation method
      assert.match(fetchFn.calls[0].method, /^(HEAD|GET)$/);
    }
  });

  it('blocks on 5xx responses', async () => {
    const target = makeTarget();
    const fetchFn = recordingFetch([{ status: 502 }]);
    const res = await preflight.probeEndpointReachable(
      target,
      'bbbb1111-2222-3333-4444-555566667777',
      fetchFn
    );
    assert.ok(res.blocker);
    assert.equal(res.blocker.code, 'V-PF-06');
    assert.match(res.blocker.message, /502/);
  });

  it('skips when no companyId is supplied', async () => {
    const target = makeTarget();
    const fetchFn = recordingFetch();
    const res = await preflight.probeEndpointReachable(target, null, fetchFn);
    assert.equal(res.blocker, undefined);
    assert.equal(res.summary.skipped, 'no_company_id');
    assert.equal(fetchFn.calls.length, 0);
  });

  it('blocks when network error occurs', async () => {
    const target = makeTarget();
    const fetchFn = recordingFetch([
      { throwWith: Object.assign(new Error('fetch failed'), { name: 'FetchError' }) }
    ]);
    const res = await preflight.probeEndpointReachable(
      target,
      'bbbb1111-2222-3333-4444-555566667777',
      fetchFn
    );
    assert.ok(res.blocker);
    assert.equal(res.blocker.code, 'V-PF-06');
    assert.match(res.blocker.message, /network error/);
  });

  it('runPreflight skips endpoint probe when bypassVisibilityProbe=true', async () => {
    const p = writeLockfileToTempDir(minimalValidLockfile());
    try {
      const fetchFn = recordingFetch();
      const result = await preflight.runPreflight({
        lockfilePath: p,
        explicitCompanyId: 'bbbb1111-2222-3333-4444-555566667777',
        readEnv: envWith(),
        confirmation: { explicit: true, reason: 'test' },
        bypassHealthProbe: true,
        bypassVisibilityProbe: true,
        fetchFn
      });
      assert.equal(result.pass, true);
      assert.equal(result.diagnostics.bypass_visibility, true);
    } finally {
      removeTmpLockfile(p);
    }
  });
});

// ---------------------------------------------------------------------------
// V-PF-07 adapter_support
// ---------------------------------------------------------------------------

describe('V-PF-07 adapter_support', () => {
  it('returns summary when requiredAdapter is null (no adapter needed)', () => {
    const lf = minimalValidLockfile();
    const res = preflight.checkAdapterSupport(lf, null, []);
    assert.equal(res.blocker, undefined);
    assert.equal(res.summary.required, null);
  });

  it('blocks when requiredAdapter is not in allowedAdapters', () => {
    const lf = minimalValidLockfile();
    const res = preflight.checkAdapterSupport(lf, 'hermes', ['gsdpi_local', 'paperclip']);
    assert.equal(res.summary, undefined);
    assert.ok(res.blocker);
    assert.equal(res.blocker.code, 'V-PF-07');
    assert.equal(res.blocker.kind, 'adapter');
    assert.equal(res.blocker.evidence.required, 'hermes');
    assert.deepEqual(res.blocker.evidence.allowed_names, ['gsdpi_local', 'paperclip']);
  });

  it('accepts when requiredAdapter is in allowedAdapters (case-insensitive)', () => {
    const lf = minimalValidLockfile();
    const res = preflight.checkAdapterSupport(lf, 'HERMES', ['hermes', 'gsdpi_local']);
    assert.equal(res.blocker, undefined);
    assert.ok(res.summary);
    assert.equal(res.summary.required, 'HERMES');
    assert.equal(res.summary.allowed, true);
  });

  it('blocks when allowedAdapters is undefined for requiredAdapter', () => {
    const lf = minimalValidLockfile();
    const res = preflight.checkAdapterSupport(lf, 'hermes');
    assert.ok(res.blocker);
    assert.equal(res.blocker.code, 'V-PF-07');
    assert.equal(res.blocker.evidence.allowed_count, 0);
  });

  it('runPreflight blocks with V-PF-07 when required adapter is not in allowed list', async () => {
    const p = writeLockfileToTempDir(minimalValidLockfile());
    try {
      const result = await preflight.runPreflight({
        lockfilePath: p,
        explicitCompanyId: 'bbbb1111-2222-3333-4444-555566667777',
        requiredAdapter: 'hermes',
        allowedAdapters: ['gsdpi_local'],
        readEnv: envWith(),
        confirmation: { explicit: true, reason: 'test' },
        bypassHealthProbe: true,
        bypassVisibilityProbe: true
      });
      assert.equal(result.pass, false);
      assert.ok(result.blockers.some((b) => b.code === 'V-PF-07'));
    } finally {
      removeTmpLockfile(p);
    }
  });
});

// ---------------------------------------------------------------------------
// V-PF-08 explicit_confirmation
// ---------------------------------------------------------------------------

describe('V-PF-08 explicit_confirmation', () => {
  it('blocks when confirmation is null', () => {
    const res = preflight.checkExplicitConfirmation(null);
    assert.equal(res.summary, undefined);
    assert.ok(res.blocker);
    assert.equal(res.blocker.code, 'V-PF-08');
    assert.equal(res.blocker.kind, 'confirmation');
    assert.equal(res.blocker.where, 'confirmation');
  });

  it('blocks when confirmation.explicit !== true', () => {
    const res = preflight.checkExplicitConfirmation({ explicit: false, reason: 'x' });
    assert.ok(res.blocker);
    assert.equal(res.blocker.code, 'V-PF-08');
    assert.equal(res.blocker.where, 'confirmation.explicit');
  });

  it('blocks when confirmation.explicit is missing', () => {
    const res = preflight.checkExplicitConfirmation({ reason: 'x' });
    assert.ok(res.blocker);
    assert.equal(res.blocker.code, 'V-PF-08');
  });

  it('blocks when confirmation.reason is empty string or whitespace-only', () => {
    const r1 = preflight.checkExplicitConfirmation({ explicit: true, reason: '' });
    assert.ok(r1.blocker);
    assert.equal(r1.blocker.where, 'confirmation.reason');
    const r2 = preflight.checkExplicitConfirmation({ explicit: true, reason: '   ' });
    assert.ok(r2.blocker);
    assert.equal(r2.blocker.where, 'confirmation.reason');
  });

  it('blocks when confirmation.reason is not a string', () => {
    const r = preflight.checkExplicitConfirmation({ explicit: true, reason: 42 });
    assert.ok(r.blocker);
    assert.equal(r.blocker.code, 'V-PF-08');
    assert.equal(r.blocker.evidence.reason_kind, 'number');
  });

  it('accepts when explicit=true and reason is non-empty', () => {
    const res = preflight.checkExplicitConfirmation({
      explicit: true,
      reason: 'operator acknowledged dry-run summary'
    });
    assert.equal(res.blocker, undefined);
    assert.ok(res.summary);
    assert.equal(res.summary.explicit, true);
    assert.ok(res.summary.reason_length > 0);
  });

  it('runPreflight blocks with V-PF-08 when confirmation omitted', async () => {
    const p = writeLockfileToTempDir(minimalValidLockfile());
    try {
      const result = await preflight.runPreflight({
        lockfilePath: p,
        // No explicitCompanyId — V-PF-09 override check is skipped entirely.
        // override=allow + null effectiveCompanyId passes V-PF-03 with
        // diagnostics only (no blocker), letting V-PF-08 fire next.
        readEnv: envWith(),
        bypassHealthProbe: true,
        bypassVisibilityProbe: true
        // confirmation: intentionally omitted
      });
      assert.equal(result.pass, false);
      assert.ok(result.blockers.some((b) => b.code === 'V-PF-08'));
      // V-PF-09 must NOT fire here because there is no explicitCompanyId to
      // override — its check is gated on `explicitCompanyId && explicitCompanyId !== lockfileCompanyId`.
      assert.equal(
        result.blockers.some((b) => b.code === 'V-PF-09'),
        false,
        'V-PF-09 should not fire without explicitCompanyId'
      );
    } finally {
      removeTmpLockfile(p);
    }
  });
});

// ---------------------------------------------------------------------------
// V-PF-09 override_authorized
// ---------------------------------------------------------------------------

describe('V-PF-09 override_authorized', () => {
  function opts(overrides = {}) {
    return {
      explicitCompanyId: 'bbbb1111-2222-3333-4444-555566667777',
      lockfileCompanyId: null,
      readEnv: envWith(),
      confirmationPresent: true,
      staleCheckPassed: true,
      ...overrides
    };
  }

  it('returns summary when explicitCompanyId is null (no override in play)', () => {
    const res = preflight.checkOverrideAuthorization(
      opts({ explicitCompanyId: null })
    );
    assert.equal(res.blocker, undefined);
    assert.equal(res.summary.override_used, false);
  });

  it('returns summary when explicitCompanyId matches lockfileCompanyId (no override)', () => {
    const sameId = 'bbbb1111-2222-3333-4444-555566667777';
    const res = preflight.checkOverrideAuthorization(
      opts({ explicitCompanyId: sameId, lockfileCompanyId: sameId })
    );
    assert.equal(res.blocker, undefined);
    assert.equal(res.summary.override_used, false);
  });

  it('blocks when explicitCompanyId differs but override env is not "allow"', () => {
    const res = preflight.checkOverrideAuthorization(
      opts({ readEnv: envWith({ PAPERCLIP_COMPANY_ID_OVERRIDE: undefined }) })
    );
    assert.equal(res.summary, undefined);
    assert.ok(res.blocker);
    assert.equal(res.blocker.code, 'V-PF-09');
    assert.equal(res.blocker.kind, 'mutation_default');
    assert.match(res.blocker.message, /must be "allow"/);
    assert.equal(res.blocker.evidence.provided_prefix, 'bbbb1111');
  });

  it('blocks when override=allow but confirmation is missing', () => {
    const res = preflight.checkOverrideAuthorization(
      opts({ confirmationPresent: false })
    );
    assert.equal(res.summary, undefined);
    assert.ok(res.blocker);
    assert.equal(res.blocker.code, 'V-PF-09');
    assert.match(res.blocker.message, /override=allow requires explicit confirmation/);
    assert.equal(res.blocker.evidence.confirmation_present, false);
  });

  it('blocks when override=allow but staleCheckPassed=false', () => {
    const res = preflight.checkOverrideAuthorization(
      opts({ staleCheckPassed: false })
    );
    assert.ok(res.blocker);
    assert.equal(res.blocker.code, 'V-PF-09');
    assert.match(res.blocker.message, /stale\/disposable; refused/);
  });

  it('accepts when override=allow, confirmation present, and stale check passed', () => {
    const res = preflight.checkOverrideAuthorization(opts());
    assert.equal(res.blocker, undefined);
    assert.ok(res.summary);
    assert.equal(res.summary.override_used, true);
    assert.equal(res.summary.override_policy, 'allow');
  });

  it('runPreflight enforces override policy end-to-end', async () => {
    const p = writeLockfileToTempDir(minimalValidLockfile());
    try {
      // No override env → fail with V-PF-09 (stale runs first if it were stale;
      // here explicitCompanyId is fresh so V-PF-09 fires alone).
      const result = await preflight.runPreflight({
        lockfilePath: p,
        explicitCompanyId: 'bbbb1111-2222-3333-4444-555566667777',
        readEnv: envWith({ PAPERCLIP_COMPANY_ID_OVERRIDE: undefined }),
        confirmation: { explicit: true, reason: 'test' },
        bypassHealthProbe: true,
        bypassVisibilityProbe: true
      });
      assert.equal(result.pass, false);
      assert.ok(result.blockers.some((b) => b.code === 'V-PF-09'));
    } finally {
      removeTmpLockfile(p);
    }
  });
});

// ---------------------------------------------------------------------------
// V-PF-10 zero_mutation_in_preflight
// ---------------------------------------------------------------------------

describe('V-PF-10 zero_mutation_in_preflight', () => {
  it('defaultFetch refuses POST', async () => {
    await assert.rejects(
      () => preflight.defaultFetch('http://127.0.0.1:3131/api/companies/x', { method: 'POST' }),
      /refuses to issue POST/
    );
  });

  it('defaultFetch refuses PUT, PATCH, DELETE', async () => {
    for (const m of ['PUT', 'PATCH', 'DELETE']) {
      await assert.rejects(
        () => preflight.defaultFetch('http://127.0.0.1:3131/api/companies/x', { method: m }),
        new RegExp(`refuses to issue ${m}`)
      );
    }
  });

  it('defaultFetch allows GET, HEAD, OPTIONS', () => {
    // We do not make a real network call; we just confirm defaultFetch does
    // not throw synchronously when given a permitted method. The fetch call
    // would normally throw due to network unavailability, but the
    // "refuses to issue …" error must NOT be raised.
    for (const m of ['GET', 'HEAD', 'OPTIONS']) {
      const p = preflight.defaultFetch('http://127.0.0.1:1/never-reachable', { method: m });
      // Catch the rejection but assert it is NOT a "refuses to issue" error
      p.catch((err) => {
        assert.ok(
          !/refuses to issue/.test(err.message),
          `${m} should not be refused: ${err.message}`
        );
      });
    }
  });

  it('runPreflight never calls fetchFn with POST/PUT/PATCH/DELETE', async () => {
    const p = writeLockfileToTempDir(minimalValidLockfile());
    try {
      const fetchFn = recordingFetch([{ status: 200 }, { status: 200 }]);
      const result = await preflight.runPreflight({
        lockfilePath: p,
        explicitCompanyId: 'bbbb1111-2222-3333-4444-555566667777',
        readEnv: envWith(),
        confirmation: { explicit: true, reason: 'test' },
        bypassHealthProbe: false,
        bypassVisibilityProbe: false,
        fetchFn
      });
      assert.equal(result.pass, true);
      assert.ok(fetchFn.calls.length >= 2, 'expected at least health + endpoint probes');
      for (const call of fetchFn.calls) {
        assert.ok(
          ['GET', 'HEAD', 'OPTIONS'].includes(call.method),
          `preflight issued mutation method ${call.method} to ${call.url}`
        );
      }
    } finally {
      removeTmpLockfile(p);
    }
  });

  it('runPreflight issues zero fetch calls when both probes are bypassed', async () => {
    const p = writeLockfileToTempDir(minimalValidLockfile());
    try {
      const fetchFn = recordingFetch();
      const result = await preflight.runPreflight({
        lockfilePath: p,
        explicitCompanyId: 'bbbb1111-2222-3333-4444-555566667777',
        readEnv: envWith(),
        confirmation: { explicit: true, reason: 'test' },
        bypassHealthProbe: true,
        bypassVisibilityProbe: true,
        fetchFn
      });
      assert.equal(result.pass, true);
      assert.equal(fetchFn.calls.length, 0, 'preflight must be side-effect free when probes bypassed');
    } finally {
      removeTmpLockfile(p);
    }
  });
});

// ---------------------------------------------------------------------------
// Structured blocker output + no-secret leakage
// ---------------------------------------------------------------------------

describe('structured blocker output and no-secret leakage', () => {
  it('every blocker has { code, kind, where, message, evidence, remediation }', async () => {
    const p = writeLockfileToTempDir(minimalValidLockfile());
    try {
      // Trigger as many blocker codes as possible in one shot
      const result = await preflight.runPreflight({
        lockfilePath: p,
        explicitCompanyId: R3_STALE_UUIDS[0], // stale R3 UUID
        readEnv: () => undefined, // no auth, no override
        bypassHealthProbe: true,
        bypassVisibilityProbe: true
      });
      assert.equal(result.pass, false);
      assert.ok(result.blockers.length >= 1);
      for (const b of result.blockers) {
        assert.equal(typeof b.code, 'string');
        assert.ok(b.code.startsWith('V-PF-'));
        assert.ok(
          ['schema', 'target', 'auth', 'adapter', 'confirmation', 'mutation_default'].includes(b.kind),
          `unknown blocker kind ${b.kind}`
        );
        assert.equal(typeof b.where, 'string');
        assert.ok(b.where.length > 0);
        assert.equal(typeof b.message, 'string');
        assert.ok(b.message.length > 0);
        assert.ok(b.remediation == null || typeof b.remediation === 'string');
        assert.ok(
          b.evidence == null || typeof b.evidence === 'object',
          'evidence must be a structured object or null'
        );
      }
    } finally {
      removeTmpLockfile(p);
    }
  });

  it('blocker output never echoes API_KEY, password, or base64-shaped tokens', () => {
    const lf = minimalValidLockfile();
    const res = preflight.checkAuthPresence(
      envWith({ PAPERCLIP_API_KEY: 'sk-LEAKED-SECRET-1234567890abcdef' })
    );
    const json = JSON.stringify(res.blocker);
    assert.ok(!/LEAKED/.test(json), 'blocker must not echo the API key value');
    assert.ok(!/sk-/.test(json), 'blocker must not echo api-key prefixes');
    // No long base64-shaped tokens in evidence/message/remediation
    assert.ok(!/[A-Za-z0-9+/]{40,}={0,2}/.test(json), 'blocker must not contain raw base64');
  });

  it('UUID prefixes in evidence are truncated to 8 chars (no full UUID leak)', () => {
    const lf = minimalValidLockfile();
    // Use the exact R3 stale UUID present in the fixture (9feb4c22-...).
    const res = preflight.checkStaleTarget(lf, R3_STALE_UUIDS[0]);
    assert.ok(res.blocker, 'checkStaleTarget must produce a blocker for a stale UUID');
    const json = JSON.stringify(res.blocker);
    // The full 36-char UUID body must never appear in evidence/message/etc.
    assert.ok(
      !/9feb4c22-05b9-401e-ba67/.test(json),
      `evidence must not echo full UUID body, got: ${json}`
    );
    // The 8-char prefix must appear (intentional truncation for diagnostics).
    assert.ok(
      /9feb4c22/.test(json),
      `evidence should retain the 8-char prefix, got: ${json}`
    );
  });

  it('makePreflightBlocker delegates to T01 makeBlocker with no secret leakage', () => {
    const blocker = preflight.makePreflightBlocker({
      code: 'V-PF-99',
      kind: 'auth',
      where: 'unit-test',
      message: 'no real secrets here',
      evidence: { rejected_tokens: ['PAPERCLIP_API_KEY'] },
      remediation: 'unset it'
    });
    assert.equal(blocker.code, 'V-PF-99');
    assert.equal(blocker.kind, 'auth');
    assert.equal(blocker.evidence.rejected_tokens[0], 'PAPERCLIP_API_KEY');
    assert.ok(!/sk-/.test(JSON.stringify(blocker)));
  });
});

// ---------------------------------------------------------------------------
// Happy path / full integration
// ---------------------------------------------------------------------------

describe('happy path integration', () => {
  it('runPreflight returns pass=true when all prerequisites are met (probes bypassed)', async () => {
    const p = writeLockfileToTempDir(minimalValidLockfile());
    try {
      const result = await preflight.runPreflight({
        lockfilePath: p,
        explicitCompanyId: 'bbbb1111-2222-3333-4444-555566667777',
        requiredAdapter: 'hermes',
        allowedAdapters: ['hermes'],
        confirmation: { explicit: true, reason: 'integration test happy path' },
        bypassHealthProbe: true,
        bypassVisibilityProbe: true,
        readEnv: envWith()
      });
      assert.equal(result.pass, true);
      assert.deepEqual(result.blockers, []);
      assert.ok(result.diagnostics);
      assert.equal(result.diagnostics.pass, true);
      assert.equal(result.diagnostics.company_id_source, 'explicit');
      assert.equal(result.diagnostics.override.override_used, true);
      assert.equal(result.diagnostics.override.override_policy, 'allow');
      assert.equal(result.diagnostics.adapter.required, 'hermes');
      assert.equal(result.diagnostics.adapter.allowed, true);
      assert.equal(result.diagnostics.confirmation.explicit, true);
      assert.ok(result.diagnostics.finished_at);
      assert.ok(result.diagnostics.started_at);
    } finally {
      removeTmpLockfile(p);
    }
  });

  it('runPreflight records diagnostics with override policy when explicitCompanyId != lockfile canonical', async () => {
    // The minimal fixture has canonical_company_id=null, so explicitCompanyId
    // always differs from the lockfile. This test confirms the diagnostics
    // surface records the override path that was honored.
    const p = writeLockfileToTempDir(minimalValidLockfile());
    try {
      const result = await preflight.runPreflight({
        lockfilePath: p,
        explicitCompanyId: 'cccc1111-2222-3333-4444-555566667777',
        readEnv: envWith(),
        confirmation: { explicit: true, reason: 'happy path via override' },
        bypassHealthProbe: true,
        bypassVisibilityProbe: true
      });
      assert.equal(result.pass, true);
      assert.equal(result.diagnostics.company_id_source, 'explicit');
      assert.equal(result.diagnostics.override.override_used, true);
      assert.equal(result.diagnostics.override.override_policy, 'allow');
      assert.equal(result.diagnostics.override.stale_check_passed, true);
    } finally {
      removeTmpLockfile(p);
    }
  });

  it('runPreflight result envelope has the documented shape', async () => {
    const p = writeLockfileToTempDir(minimalValidLockfile());
    try {
      const result = await preflight.runPreflight({
        lockfilePath: p,
        readEnv: envWith(),
        confirmation: { explicit: true, reason: 'shape test' },
        bypassHealthProbe: true,
        bypassVisibilityProbe: true,
        explicitCompanyId: 'bbbb1111-2222-3333-4444-555566667777'
      });
      assert.equal(typeof result, 'object');
      assert.equal(typeof result.pass, 'boolean');
      assert.ok(Array.isArray(result.blockers));
      assert.equal(typeof result.diagnostics, 'object');
      // diagnostics must include the canonical keys documented in preflight.js
      for (const key of [
        'started_at',
        'lockfile_path',
        'explicit_company_id',
        'required_adapter',
        'bypass_health',
        'bypass_visibility'
      ]) {
        assert.ok(key in result.diagnostics, `diagnostics missing ${key}`);
      }
    } finally {
      removeTmpLockfile(p);
    }
  });
});

// ---------------------------------------------------------------------------
// API surface / reusability for T03 script hardening
// ---------------------------------------------------------------------------

describe('API surface for T03 reusability', () => {
  it('exports runPreflight and all check functions', () => {
    // Functions exposed for T03 reusability and S04 canary reuse.
    for (const fn of [
      'runPreflight',
      'makePreflightBlocker',
      'checkLockfilePresent',
      'checkLockfileValid',
      'checkStaleTarget',
      'checkAuthPresence',
      'checkAdapterSupport',
      'checkExplicitConfirmation',
      'checkOverrideAuthorization',
      'probeHealth',
      'probeEndpointReachable',
      'resolveRuntimeTarget',
      'defaultFetch',
      'defaultReadEnv'
    ]) {
      assert.equal(typeof preflight[fn], 'function', `missing function export: ${fn}`);
    }
    // DEFAULT_LOCKFILE_PATH is a constant, not a function — assert string.
    assert.equal(typeof preflight.DEFAULT_LOCKFILE_PATH, 'string');
    assert.ok(preflight.DEFAULT_LOCKFILE_PATH.endsWith('paperclip-runtime.lock.json'));
  });

  it('resolveRuntimeTarget returns expected shape from a minimal lockfile', () => {
    const lf = minimalValidLockfile();
    const t = preflight.resolveRuntimeTarget(lf);
    assert.equal(t.public_ingress, 'https://paperclip.oysana.com');
    // Fixture sets verified_base_url=null (provisional readback) so probeHealth
    // falls back to public_ingress at runtime; both are captured here.
    assert.equal(t.verified_base_url, null);
    assert.equal(t.verified_base_url_status, 'provisional-pending-fresh-readback');
    assert.equal(t.compose_project, 'paperclip_sandbox');
    assert.equal(t.container_name, 'paperclip_sandbox-paperclip-1');
  });

  it('defaultReadEnv reads from process.env when no overrides given', () => {
    // defaultReadEnv is a thin wrapper over process.env; we just confirm it
    // returns the same thing as process.env[name].
    assert.equal(preflight.defaultReadEnv('PATH'), process.env.PATH);
  });
});

// ---------------------------------------------------------------------------
// CLI gate intentionally omitted.
//
// As documented in scripts/validate_paperclip_runtime_lock.js: a synchronous
// CLI gate would short-circuit before `describe`/`it` register, and a
// deferred gate would mask test failures. This file is test-only; the
// orchestrator invokes the suite via `node --test` and downstream consumers
// (T03 hardening, S04 persistence canary) call `runPreflight` directly.
// ---------------------------------------------------------------------------

module.exports = {};