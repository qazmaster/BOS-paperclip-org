#!/usr/bin/env node
'use strict';

/**
 * scripts/test_run_m016_s03_readonly_probes.js
 *
 * M016-txa3vu / S03 / T03 — Test suite for the GET-only live role probe
 * runner. Uses node:test. All tests are HERMETIC: fixture HTTP servers
 * bind to 127.0.0.1 with ephemeral ports; sidecar operations use
 * tmpdir() + cleanup; no live Paperclip dependency.
 *
 * Categories:
 *   (a) Public API surface + namespace
 *   (b) Static mutation-verb assertion (PROBE_METHODS allowlist)
 *   (c) BoundedFetch unit: timeout, body cap, redirect rejection,
 *       401/403/404/429/5xx mapping, sign-in flow, cookie reuse
 *   (d) Sanitisation: UUIDs / credentials / vendor markers / result_json
 *   (e) Sidecar baseline + immutability check
 *   (f) Per-role probe executors (live / observed / offline / drill-deferral)
 *   (g) End-to-end with fixture HTTP server: happy path (all live roles
 *       EXECUTED), auth failure, rate limit, timeout, malformed JSON,
 *       cross-origin redirect rejection, stale-identity rejection via
 *       dead-UUID body, mutation delta STOP behaviour
 *   (h) Atomic write + overwrite refusal + --force bypass
 *   (i) parseArgs CLI surface
 *   (j) Mutation-verb leak (live roles never run mutation endpoints)
 *
 * Run: node --test scripts/test_run_m016_s03_readonly_probes.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('node:http');
const crypto = require('node:crypto');

const runner = require('./run_m016_s03_readonly_probes');
const contract = require('./lib/m016-s03-safe-probe-contract');
const data = require('./lib/m016-s03-safe-probe-data');
const {
  ROLE_REGISTRY, ROLE_BY_NAME,
  PROBE_METHODS, PROBE_METHOD_VALUES,
  BLOCKER_CODES, EXIT_CODES,
  MUTATION_AUDIT_ZERO_COUNTERS, REDACTION_FLAG_VALUES,
} = data;

const ROOT = runner.ROOT;

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------
function startFixtureServer(routes) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const key = req.method + ' ' + url.pathname;
      const entry = routes[key] || routes['default'];
      if (!entry) {
        res.statusCode = 404;
        res.setHeader('content-type', 'application/json');
        res.end('{"error":"no route for ' + key + '"}');
        return;
      }
      // Accept either a plain object describing the response, or a function
      // that returns one. Function form lets tests vary response per request.
      const r = typeof entry === 'function' ? entry(req, url) : entry;
      const status = r.status == null ? 200 : r.status;
      const headers = Object.assign({ 'content-type': 'application/json' }, r.headers || {});
      for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
      if (r.hang) { /* never resolve */ return; }
      if (r.delay && r.delay > 0) {
        setTimeout(() => {
          res.statusCode = status;
          res.end(r.body == null ? '' : (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)));
        }, r.delay);
      } else {
        res.statusCode = status;
        res.end(r.body == null ? '' : (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)));
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        server,
        baseUrl: 'http://127.0.0.1:' + port,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

function mkTmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'm016-s03-t03-' + (prefix || 'test') + '-'));
}

function rmTmpDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) { /* ignore */ }
}

// ---------------------------------------------------------------------------
// (a) Public API surface
// ---------------------------------------------------------------------------
test('(a) public API surface exposes runner functions', () => {
  const expected = [
    'ROOT', 'SCRIPT_PATH', 'IMMUTABLE_SIDECARS',
    'DEFAULT_RESULTS_OUT', 'DEFAULT_PROTOCOL_OUT',
    'assertStaticNoMutationVerbs', 'BoundedFetch',
    'sanitiseString', 'sanitiseLivePayload',
    'captureBaseline', 'verifySidecarImmutability',
    'runLiveProbe', 'runObservedProbe', 'runOfflineBundleProbe',
    'runDrillDeferralProbe',
    'discoverCompanyAndDivisions',
    'atomicWriteJson', 'atomicWriteJsonIfMissing',
    'runSession', 'parseArgs', 'printHelp', 'main',
  ];
  for (const name of expected) assert.ok(name in runner, 'missing export: ' + name);
  assert.equal(typeof runner.BoundedFetch, 'function');
  assert.equal(typeof runner.runSession, 'function');
  assert.equal(runner.IMMUTABLE_SIDECARS.length >= 4, true);
});

// ---------------------------------------------------------------------------
// (b) Static mutation-verb assertion
// ---------------------------------------------------------------------------
test('(b) assertStaticNoMutationVerbs succeeds against frozen allowlist', () => {
  const r = runner.assertStaticNoMutationVerbs();
  assert.equal(r.checked, PROBE_METHOD_VALUES.length);
  for (const m of r.allowlist) {
    assert.equal(/^(?:POST|PUT|PATCH|DELETE|DESTROY|REMOVE|CREATE|UPDATE|INVOKE|WRITE|MUTATE)\b/i.test(m), false, 'mutation verb in ' + m);
  }
});

test('(b) assertStaticNoMutationVerbs throws when fed a mutation verb', () => {
  const data2 = require('./lib/m016-s03-safe-probe-data');
  const original = data2.PROBE_METHOD_VALUES;
  try {
    data2.PROBE_METHOD_VALUES = Object.freeze([...original, 'POST /api/evil']);
    assert.throws(() => runner.assertStaticNoMutationVerbs(), /mutation verb/i);
  } finally {
    data2.PROBE_METHOD_VALUES = original;
  }
});

// ---------------------------------------------------------------------------
// (c) BoundedFetch unit
// ---------------------------------------------------------------------------
test('(c) BoundedFetch rejects non-http(s) base URL', () => {
  assert.throws(() => new runner.BoundedFetch({ baseUrl: 'ftp://example.com', fetchImpl: () => {} }), /http\(s\)/);
});

test('(c) BoundedFetch requires fetchImpl or global fetch when global missing', () => {
  // Hide global fetch and confirm constructor refuses null fetchImpl.
  const savedFetch = globalThis.fetch;
  try {
    delete globalThis.fetch;
    assert.throws(() => new runner.BoundedFetch({ baseUrl: 'http://127.0.0.1:1', fetchImpl: null }), /fetch/i);
  } finally {
    if (savedFetch) globalThis.fetch = savedFetch;
  }
});

test('(c) BoundedFetch sign-in: 200 + set-cookie returns ok and stores cookie', async () => {
  const f = await startFixtureServer({
    'POST /api/auth/sign-in/email': { status: 200, body: { ok: true }, headers: { 'set-cookie': 'session=abc; Path=/' } },
  });
  try {
    const bf = new runner.BoundedFetch({ baseUrl: f.baseUrl, fetchImpl });
    const res = await bf.signIn({ email: 'e@x', password: 'p' });
    assert.equal(res.ok, true);
    assert.equal(bf.cookie.startsWith('session=abc'), true);
    assert.equal(bf.signedIn, true);
  } finally { await f.close(); }
});

test('(c) BoundedFetch sign-in: 401 returns AUTH_FAILED', async () => {
  const f = await startFixtureServer({
    'POST /api/auth/sign-in/email': { status: 401, body: { error: 'bad creds' } },
  });
  try {
    const bf = new runner.BoundedFetch({ baseUrl: f.baseUrl, fetchImpl });
    const res = await bf.signIn({ email: 'e@x', password: 'p' });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'AUTH_FAILED');
  } finally { await f.close(); }
});

test('(c) BoundedFetch sign-in: 429 returns RATE_LIMITED', async () => {
  const f = await startFixtureServer({
    'POST /api/auth/sign-in/email': { status: 429, body: { error: 'slow down' } },
  });
  try {
    const bf = new runner.BoundedFetch({ baseUrl: f.baseUrl, fetchImpl });
    const res = await bf.signIn({ email: 'e@x', password: 'p' });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'RATE_LIMITED');
  } finally { await f.close(); }
});

test('(c) BoundedFetch get: 200 happy path returns parsed body', async () => {
  const f = await startFixtureServer({
    'GET /api/health': { status: 200, body: { ok: true, ts: '2026-07-19T00:00:00Z' } },
  });
  try {
    const bf = new runner.BoundedFetch({ baseUrl: f.baseUrl, fetchImpl, cookie: 'session=abc' });
    const r = await bf.get('/api/health');
    assert.equal(r.ok, true);
    assert.equal(r.body && r.body.ok, true);
    assert.equal(r.status, 200);
  } finally { await f.close(); }
});

test('(c) BoundedFetch get: 404 → NOT_FOUND', async () => {
  const f = await startFixtureServer({
    'GET /api/missing': { status: 404, body: { error: 'no' } },
  });
  try {
    const bf = new runner.BoundedFetch({ baseUrl: f.baseUrl, fetchImpl });
    const r = await bf.get('/api/missing');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'NOT_FOUND');
  } finally { await f.close(); }
});

test('(c) BoundedFetch get: 429 → RATE_LIMITED', async () => {
  const f = await startFixtureServer({
    'GET /api/x': { status: 429, body: { error: 'too many' } },
  });
  try {
    const bf = new runner.BoundedFetch({ baseUrl: f.baseUrl, fetchImpl });
    const r = await bf.get('/api/x');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'RATE_LIMITED');
  } finally { await f.close(); }
});

test('(c) BoundedFetch get: 503 → UNAVAILABLE', async () => {
  const f = await startFixtureServer({
    'GET /api/x': { status: 503, body: { error: 'down' } },
  });
  try {
    const bf = new runner.BoundedFetch({ baseUrl: f.baseUrl, fetchImpl });
    const r = await bf.get('/api/x');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'UNAVAILABLE');
  } finally { await f.close(); }
});

test('(c) BoundedFetch get: timeout → TIMEOUT', async () => {
  const f = await startFixtureServer({
    'GET /api/slow': { hang: true },
  });
  try {
    const bf = new runner.BoundedFetch({ baseUrl: f.baseUrl, fetchImpl, timeoutMs: 100 });
    const r = await bf.get('/api/slow');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'TIMEOUT');
  } finally { await f.close(); }
});

test('(c) BoundedFetch get: oversized body → BODY_TOO_LARGE', async () => {
  const big = 'x'.repeat(2048);
  const f = await startFixtureServer({
    'GET /api/big': { status: 200, body: { data: big } },
  });
  try {
    const bf = new runner.BoundedFetch({ baseUrl: f.baseUrl, fetchImpl, maxBodyBytes: 512 });
    const r = await bf.get('/api/big');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'BODY_TOO_LARGE');
  } finally { await f.close(); }
});

test('(c) BoundedFetch get: 200 + non-JSON body → MALFORMED_JSON', async () => {
  const f = await startFixtureServer({
    'GET /api/html': { status: 200, body: '<html>not json</html>' },
  });
  try {
    const bf = new runner.BoundedFetch({ baseUrl: f.baseUrl, fetchImpl });
    const r = await bf.get('/api/html');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'MALFORMED_JSON');
  } finally { await f.close(); }
});

test('(c) BoundedFetch get: cross-origin 302 redirect → CROSS_ORIGIN_REDIRECT', async () => {
  const f = await startFixtureServer({
    'GET /api/x': { status: 302, headers: { location: 'http://evil.example.com/api/x' }, body: '' },
  });
  try {
    const bf = new runner.BoundedFetch({ baseUrl: f.baseUrl, fetchImpl });
    const r = await bf.get('/api/x');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'CROSS_ORIGIN_REDIRECT');
  } finally { await f.close(); }
});

test('(c) BoundedFetch get: same-origin 302 redirect follows once', async () => {
  let redirected = false;
  const f = await startFixtureServer({
    'GET /api/x': { status: 302, headers: { location: '/api/y' }, body: '' },
    'GET /api/y': { status: 200, body: { ok: 'redirected' } },
  });
  try {
    const bf = new runner.BoundedFetch({ baseUrl: f.baseUrl, fetchImpl });
    const r = await bf.get('/api/x');
    assert.equal(r.ok, true);
    assert.equal(r.body && r.body.ok, 'redirected');
    redirected = true;
    assert.equal(redirected, true);
  } finally { await f.close(); }
});

test('(c) BoundedFetch get: 401 → AUTH_FAILED', async () => {
  const f = await startFixtureServer({
    'GET /api/x': { status: 401, body: { error: 'expired' } },
  });
  try {
    const bf = new runner.BoundedFetch({ baseUrl: f.baseUrl, fetchImpl, cookie: 'session=expired' });
    const r = await bf.get('/api/x');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'AUTH_FAILED');
  } finally { await f.close(); }
});

test('(c) BoundedFetch get: bounded calls enforced', async () => {
  const f = await startFixtureServer({
    'GET /api/x': { status: 200, body: { ok: true } },
  });
  try {
    const bf = new runner.BoundedFetch({ baseUrl: f.baseUrl, fetchImpl, maxCalls: 3 });
    await bf.get('/api/x');
    await bf.get('/api/x');
    await bf.get('/api/x');
    const r = await bf.get('/api/x');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'RUNNER_FAILURE');
    assert.equal(/bounded calls exceeded/.test(r.reason), true);
  } finally { await f.close(); }
});

// ---------------------------------------------------------------------------
// (d) Sanitisation
// ---------------------------------------------------------------------------
test('(d) sanitiseString redacts UUIDs', () => {
  const r = runner.sanitiseString('company 9feb4c22-05b9-401e-ba67-0e866e3056da here');
  assert.equal(r.includes('9feb4c22'), false);
  assert.equal(r.includes('<redacted-id>'), true);
});

test('(d) sanitiseString redacts credentials', () => {
  const r = runner.sanitiseString('password=hunter2 and api_key=AKIAIOSFODNN7EXAMPLE');
  assert.equal(r.includes('hunter2'), false);
  assert.equal(r.includes('AKIAIOSFODNN7EXAMPLE'), false);
});

test('(d) sanitiseString redacts bearer / sk- / tp- tokens', () => {
  const r1 = runner.sanitiseString('Authorization: bearer eyJhbGciOiJIUzI1NiJ9.payload.sig');
  assert.equal(r1.includes('eyJhbGciOiJIUzI1NiJ9'), false);
  const r2 = runner.sanitiseString('key=sk-abcdef12345');
  assert.equal(r2.includes('sk-abcdef12345'), false);
  const r3 = runner.sanitiseString('tp-zzzz9999');
  assert.equal(r3.includes('tp-zzzz9999'), false);
});

test('(d) sanitiseString redacts vendor reuse and result_json.result', () => {
  const r1 = runner.sanitiseString('hermes.execution.xiaomi fired');
  assert.equal(r1.includes('hermes.execution.xiaomi'), false);
  const r2 = runner.sanitiseString('see result_json.result for details');
  assert.equal(r2.includes('result_json.result'), false);
});

test('(d) sanitiseLivePayload recurses through objects and arrays', () => {
  const r = runner.sanitiseLivePayload({
    id: '9feb4c22-05b9-401e-ba67-0e866e3056da',
    nested: { token: 'sk-evil', arr: ['hi', 'sk-other'] },
  });
  assert.equal(r.id.includes('9feb4c22'), false);
  assert.equal(r.nested.token.includes('sk-evil'), false);
  assert.equal(r.nested.arr[1].includes('sk-other'), false);
});

// ---------------------------------------------------------------------------
// (e) Sidecar baseline + immutability
// ---------------------------------------------------------------------------
test('(e) captureBaseline returns sha256 per existing sidecar, null per missing', () => {
  const tmp = mkTmpDir('baseline');
  try {
    const a = path.join(tmp, 'a.json');
    fs.writeFileSync(a, JSON.stringify({ hello: 'world' }));
    const b = path.join(tmp, 'missing.json');
    const baseline = runner.captureBaseline([a, b]);
    assert.equal(typeof baseline[a], 'string');
    assert.equal(baseline[a].length, 64);
    assert.equal(baseline[b], null);
  } finally { rmTmpDir(tmp); }
});

test('(e) verifySidecarImmutability detects drift', () => {
  const tmp = mkTmpDir('drift');
  try {
    const a = path.join(tmp, 'a.json');
    fs.writeFileSync(a, '{"v":1}');
    const baseline = runner.captureBaseline([a]);
    fs.writeFileSync(a, '{"v":2}');
    const after = runner.captureBaseline([a]);
    const r = runner.verifySidecarImmutability(baseline, after);
    assert.equal(r.ok, false);
    assert.deepEqual(r.drift, [a]);
  } finally { rmTmpDir(tmp); }
});

// ---------------------------------------------------------------------------
// (f) Per-role probe executors
// ---------------------------------------------------------------------------
test('(f) runObservedProbe returns EXECUTED record with zero mutation audit', () => {
  const entry = ROLE_BY_NAME['secret_posture'];
  const r = runner.runObservedProbe(entry, { baseUrl: 'http://127.0.0.1:1' });
  assert.equal(r.ok, true);
  assert.equal(r.record.classification, 'EXECUTED');
  assert.equal(r.record.verdict, 'pass');
  for (const c of MUTATION_AUDIT_ZERO_COUNTERS) {
    assert.equal(r.record.mutation_audit[c], 0);
  }
  assert.equal(r.record.role, 'secret_posture');
  assert.equal(typeof r.record.sanitised_digest, 'string');
  assert.equal(typeof r.record.artifact_hash, 'string');
  assert.equal(/^[a-f0-9]{64}$/.test(r.record.artifact_hash), true);
});

test('(f) runDrillDeferralProbe returns NOT_PROVEN with deferred reason', () => {
  const entry = ROLE_BY_NAME['restore_drill'];
  const r = runner.runDrillDeferralProbe(entry, { baseUrl: 'http://127.0.0.1:1' });
  assert.equal(r.ok, false);
  assert.equal(r.record.classification, 'NOT_PROVEN');
  assert.equal(r.record.verdict, 'not_proven');
  assert.equal(r.record.role, 'restore_drill');
  assert.equal(/T04/.test(r.record.observed_blocker_reason), true);
  assert.equal(r.record.observed_blocker_code.startsWith('M16-S03-PROBE-TARGET-UNAVAILABLE-restore_drill'), true);
});

test('(f) runOfflineBundleProbe returns NOT_PROVEN when bundle missing', () => {
  // Use a sidecar path that definitely does not exist (captureBaseline path resolution)
  const tmp = mkTmpDir('bundle-missing');
  try {
    // Save current cwd is ROOT; we run from a sub-dir won't help, so use existing tmp path
    const entry = ROLE_BY_NAME['cost_snapshot'];
    // Override bundle existence by using a missing file via writeFile then delete
    const real = path.resolve(ROOT, 'runtime-evidence/M016-S02-bos-mission-proof.json');
    let backup = null;
    if (fs.existsSync(real)) {
      backup = real + '.bak-' + process.pid;
      fs.renameSync(real, backup);
    }
    try {
      const r = runner.runOfflineBundleProbe(entry, { baseUrl: 'http://127.0.0.1:1' });
      assert.equal(r.ok, false);
      assert.equal(r.record.classification, 'NOT_PROVEN');
      assert.equal(r.record.observed_blocker_code.startsWith('M16-S03-PROBE-TARGET-UNAVAILABLE-cost_snapshot'), true);
    } finally {
      if (backup) fs.renameSync(backup, real);
    }
  } finally { rmTmpDir(tmp); }
});

test('(f) runLiveProbe happy path returns EXECUTED with sanitised payload', async () => {
  const entry = ROLE_BY_NAME['paperclip_health'];
  const f = await startFixtureServer({
    'GET /api/health': { status: 200, body: { ok: true, version: '1.0' } },
  });
  try {
    const bf = new runner.BoundedFetch({ baseUrl: f.baseUrl, fetchImpl, cookie: 'session=x' });
    const r = await runner.runLiveProbe(entry, { baseUrl: f.baseUrl, companyId: 'c1' }, bf);
    assert.equal(r.ok, true);
    assert.equal(r.record.classification, 'EXECUTED');
    assert.equal(r.record.verdict, 'pass');
    assert.equal(r.record.exit_code, 0);
    assert.equal(/^[a-f0-9]{64}$/.test(r.record.artifact_hash), true);
    for (const c of MUTATION_AUDIT_ZERO_COUNTERS) {
      assert.equal(r.record.mutation_audit[c], 0);
    }
  } finally { await f.close(); }
});

test('(f) runLiveProbe failure path returns NOT_PROVEN with TARGET_TIMEOUT', async () => {
  const entry = ROLE_BY_NAME['paperclip_health'];
  const f = await startFixtureServer({ 'GET /api/health': { hang: true } });
  try {
    const bf = new runner.BoundedFetch({ baseUrl: f.baseUrl, fetchImpl, cookie: 'session=x', timeoutMs: 100 });
    const r = await runner.runLiveProbe(entry, { baseUrl: f.baseUrl, companyId: 'c1' }, bf);
    assert.equal(r.ok, false);
    assert.equal(r.record.classification, 'NOT_PROVEN');
    assert.equal(r.record.observed_blocker_code, BLOCKER_CODES.TARGET_TIMEOUT('paperclip_health'));
  } finally { await f.close(); }
});

// ---------------------------------------------------------------------------
// (g) End-to-end with fixture HTTP server
// ---------------------------------------------------------------------------
function _buildHappyRoutes(extra) {
  return Object.assign({
    'POST /api/auth/sign-in/email': {
      status: 200, body: { ok: true }, headers: { 'set-cookie': 'session=happy; Path=/' },
    },
    'GET /api/companies': {
      status: 200, body: [{ id: 'company-1', name: 'BOS Light' }],
    },
    'GET /api/companies/company-1/agents': {
      status: 200, body: [
        { id: 'agent-hco', name: 'Div1.HCO' },
        { id: 'agent-mp', name: 'Div2.MasterPlanner' },
        { id: 'agent-tr', name: 'Div3.Treasury' },
        { id: 'agent-pr', name: 'Div4.Production' },
        { id: 'agent-ql', name: 'Div5.QualificationsLibraryLearning' },
        { id: 'agent-ex', name: 'Div6.External' },
        { id: 'agent-mc', name: 'Div7.MissionControl' },
      ],
    },
    'GET /api/agents/agent-hco': { status: 200, body: { id: 'agent-hco', name: 'Div1.HCO' } },
    'GET /api/agents/agent-mp': { status: 200, body: { id: 'agent-mp', name: 'Div2.MasterPlanner' } },
    'GET /api/agents/agent-tr': { status: 200, body: { id: 'agent-tr', name: 'Div3.Treasury' } },
    'GET /api/agents/agent-pr': { status: 200, body: { id: 'agent-pr', name: 'Div4.Production' } },
    'GET /api/agents/agent-ql': { status: 200, body: { id: 'agent-ql', name: 'Div5.QualificationsLibraryLearning' } },
    'GET /api/agents/agent-ex': { status: 200, body: { id: 'agent-ex', name: 'Div6.External' } },
    'GET /api/agents/agent-mc': { status: 200, body: { id: 'agent-mc', name: 'Div7.MissionControl' } },
    'GET /api/health': { status: 200, body: { ok: true } },
    'GET /api/companies/company-1/adapters/hermes/test-environment': {
      status: 200, body: { adapter: 'hermes', ok: true },
    },
  }, extra || {});
}

test('(g) end-to-end happy path: all live roles EXECUTED, zero mutation, sidecars immutable', async () => {
  const f = await startFixtureServer(_buildHappyRoutes());
  try {
    const session = await runner.runSession({
      baseUrl: f.baseUrl, email: 'test@x', password: 'pw', allowLive: true, fetchImpl,
      immutableSidecars: ['runtime-evidence/M016-S03-this-does-not-exist.json'],
    });
    assert.equal(session.immutability.ok, true);
    assert.equal(session.mutationStopped, false);
    assert.equal(session.results.record_count, ROLE_REGISTRY.length);
    const liveEntries = ROLE_REGISTRY.filter((e) => e.identity_kind === 'paperclip_api_readonly');
    const liveRoles = session.records.filter((r) => liveEntries.some((e) => e.role === r.role));
    assert.equal(liveRoles.length, liveEntries.length);
    for (const rec of liveRoles) {
      assert.equal(rec.classification, 'EXECUTED', rec.role + ' should be EXECUTED');
      assert.equal(rec.verdict, 'pass');
      for (const c of MUTATION_AUDIT_ZERO_COUNTERS) assert.equal(rec.mutation_audit[c], 0);
    }
    const drillEntries = ROLE_REGISTRY.filter((e) => e.identity_kind === 'scratch_drill');
    const drillRoles = session.records.filter((r) => drillEntries.some((e) => e.role === r.role));
    for (const rec of drillRoles) {
      assert.equal(rec.classification, 'NOT_PROVEN', rec.role + ' should be NOT_PROVEN (T04 scope)');
      assert.equal(rec.observed_blocker_code.startsWith('M16-S03-PROBE-TARGET-UNAVAILABLE-'), true);
    }
    assert.equal(session.results.executed_count, liveEntries.length + ROLE_REGISTRY.filter((e) => e.identity_kind === 'observed' || e.identity_kind === 'offline_bundle_read').length);
  } finally { await f.close(); }
});

test('(g) end-to-end auth failed: all live roles NOT_PROVEN with TARGET_AUTH_FAILED', async () => {
  const f = await startFixtureServer({
    'POST /api/auth/sign-in/email': { status: 401, body: { error: 'bad creds' } },
  });
  try {
    const session = await runner.runSession({
      baseUrl: f.baseUrl, email: 'bad@x', password: 'pw', allowLive: true, fetchImpl,
      immutableSidecars: ['runtime-evidence/M016-S03-nonexistent.json'],
    });
    const liveEntries = ROLE_REGISTRY.filter((e) => e.identity_kind === 'paperclip_api_readonly');
    const liveRoles = session.records.filter((r) => liveEntries.some((e) => e.role === r.role));
    for (const rec of liveRoles) {
      assert.equal(rec.classification, 'NOT_PROVEN', rec.role);
      assert.equal(rec.observed_blocker_code, BLOCKER_CODES.TARGET_AUTH_FAILED(rec.role));
    }
    assert.equal(session.mutationStopped, false);
  } finally { await f.close(); }
});

test('(g) end-to-end rate limited: live roles NOT_PROVEN with TARGET_RATE_LIMITED', async () => {
  const f = await startFixtureServer({
    'POST /api/auth/sign-in/email': { status: 200, body: { ok: true }, headers: { 'set-cookie': 'session=rl; Path=/' } },
    'GET /api/companies': { status: 429, body: { error: 'too many' } },
  });
  try {
    const session = await runner.runSession({
      baseUrl: f.baseUrl, email: 'e@x', password: 'p', allowLive: true, fetchImpl,
      immutableSidecars: ['runtime-evidence/M016-S03-nonexistent.json'],
    });
    const liveRoles = session.records.filter((r) => ROLE_BY_NAME[r.role] && ROLE_BY_NAME[r.role].identity_kind === 'paperclip_api_readonly');
    for (const rec of liveRoles) {
      assert.equal(rec.classification, 'NOT_PROVEN');
      assert.equal(rec.observed_blocker_code, BLOCKER_CODES.TARGET_RATE_LIMITED(rec.role));
    }
  } finally { await f.close(); }
});

test('(g) end-to-end timeout: live roles NOT_PROVEN with TARGET_TIMEOUT', async () => {
  const f = await startFixtureServer({
    'POST /api/auth/sign-in/email': { status: 200, body: { ok: true }, headers: { 'set-cookie': 'session=t; Path=/' } },
    'GET /api/companies': { hang: true },
  });
  try {
    const session = await runner.runSession({
      baseUrl: f.baseUrl, email: 'e@x', password: 'p', allowLive: true, fetchImpl, timeoutMs: 100,
      immutableSidecars: ['runtime-evidence/M016-S03-nonexistent.json'],
    });
    const liveRoles = session.records.filter((r) => ROLE_BY_NAME[r.role] && ROLE_BY_NAME[r.role].identity_kind === 'paperclip_api_readonly');
    for (const rec of liveRoles) {
      assert.equal(rec.classification, 'NOT_PROVEN');
      assert.equal(rec.observed_blocker_code, BLOCKER_CODES.TARGET_TIMEOUT(rec.role));
    }
  } finally { await f.close(); }
});

test('(g) end-to-end malformed response: live roles NOT_PROVEN with TARGET_UNAVAILABLE', async () => {
  const f = await startFixtureServer({
    'POST /api/auth/sign-in/email': { status: 200, body: { ok: true }, headers: { 'set-cookie': 'session=m; Path=/' } },
    'GET /api/companies': { status: 200, body: '<html>not json</html>' },
  });
  try {
    const session = await runner.runSession({
      baseUrl: f.baseUrl, email: 'e@x', password: 'p', allowLive: true, fetchImpl,
      immutableSidecars: ['runtime-evidence/M016-S03-nonexistent.json'],
    });
    const liveRoles = session.records.filter((r) => ROLE_BY_NAME[r.role] && ROLE_BY_NAME[r.role].identity_kind === 'paperclip_api_readonly');
    for (const rec of liveRoles) {
      assert.equal(rec.classification, 'NOT_PROVEN');
      assert.equal(rec.observed_blocker_code, BLOCKER_CODES.TARGET_UNAVAILABLE(rec.role));
    }
  } finally { await f.close(); }
});

test('(g) end-to-end cross-origin redirect: live roles NOT_PROVEN', async () => {
  const f = await startFixtureServer({
    'POST /api/auth/sign-in/email': { status: 200, body: { ok: true }, headers: { 'set-cookie': 'session=r; Path=/' } },
    'GET /api/companies': { status: 302, headers: { location: 'http://evil.example.com/api/companies' }, body: '' },
  });
  try {
    const session = await runner.runSession({
      baseUrl: f.baseUrl, email: 'e@x', password: 'p', allowLive: true, fetchImpl,
      immutableSidecars: ['runtime-evidence/M016-S03-nonexistent.json'],
    });
    const liveRoles = session.records.filter((r) => ROLE_BY_NAME[r.role] && ROLE_BY_NAME[r.role].identity_kind === 'paperclip_api_readonly');
    for (const rec of liveRoles) {
      assert.equal(rec.classification, 'NOT_PROVEN');
    }
  } finally { await f.close(); }
});

test('(g) end-to-end observed-only path: no --allow-live keeps observed/offline EXECUTED + drills NOT_PROVEN', async () => {
  const session = await runner.runSession({
    baseUrl: 'http://127.0.0.1:1', allowLive: false, fetchImpl,
    immutableSidecars: ['runtime-evidence/M016-S03-nonexistent.json'],
  });
  const liveRoles = session.records.filter((r) => ROLE_BY_NAME[r.role] && ROLE_BY_NAME[r.role].identity_kind === 'paperclip_api_readonly');
  for (const rec of liveRoles) {
    assert.equal(rec.classification, 'NOT_PROVEN');
    assert.equal(rec.observed_blocker_code, BLOCKER_CODES.TARGET_UNAVAILABLE(rec.role));
  }
  const observedRoles = session.records.filter((r) => ROLE_BY_NAME[r.role] && ROLE_BY_NAME[r.role].identity_kind === 'observed');
  for (const rec of observedRoles) {
    assert.equal(rec.classification, 'EXECUTED');
  }
});

test('(g) end-to-end results payload contains no raw bodies and conforms to schema', async () => {
  const f = await startFixtureServer(_buildHappyRoutes());
  try {
    const session = await runner.runSession({
      baseUrl: f.baseUrl, email: 'e@x', password: 'p', allowLive: true, fetchImpl,
      immutableSidecars: ['runtime-evidence/M016-S03-nonexistent.json'],
    });
    assert.equal(session.results.schema_id, data.SCHEMA_ID);
    assert.equal(session.results.milestone, data.MILESTONE);
    assert.equal(session.results.slice, data.SLICE);
    assert.equal(session.results.task, 'T03');
    assert.equal(typeof session.results.protocol_digest, 'string');
    assert.equal(session.results.protocol_digest.length, 64);
    assert.equal(session.results.record_count, ROLE_REGISTRY.length);
    // No raw body field in payload
    assert.equal('raw_body' in session.results, false);
    assert.equal('raw_response' in session.results, false);
  } finally { await f.close(); }
});

// ---------------------------------------------------------------------------
// (h) Atomic write + overwrite refusal
// ---------------------------------------------------------------------------
test('(h) atomicWriteJsonIfMissing refuses to overwrite existing file without --force', () => {
  const tmp = mkTmpDir('atomic');
  try {
    const target = path.join(tmp, 'a.json');
    fs.writeFileSync(target, '{"v":1}');
    assert.throws(() => runner.atomicWriteJsonIfMissing(target, { v: 2 }, {}), /refusing to overwrite/);
    const bytes = fs.readFileSync(target, 'utf8');
    assert.equal(bytes, '{"v":1}');
    // --force bypasses
    runner.atomicWriteJsonIfMissing(target, { v: 2 }, { force: true });
    const bytes2 = fs.readFileSync(target, 'utf8');
    assert.equal(bytes2.includes('"v": 2'), true);
  } finally { rmTmpDir(tmp); }
});

// ---------------------------------------------------------------------------
// (i) parseArgs
// ---------------------------------------------------------------------------
test('(i) parseArgs returns defaults when no args', () => {
  const a = runner.parseArgs(['node', 'script.js']);
  assert.equal(a.allowLive, false);
  assert.equal(a.timeoutMs, 15000);
  assert.equal(a.maxBodyBytes, 1024 * 1024);
  assert.equal(a.force, false);
  assert.equal(a.help, false);
});

test('(i) parseArgs reads --base-url / --timeout-ms / --max-body-bytes / --force / --allow-live', () => {
  const a = runner.parseArgs(['node', 's.js', '--base-url', 'http://x:1', '--origin', 'http://x:1', '--email', 'e@x', '--password', 'p', '--allow-live', '--timeout-ms', '5000', '--max-body-bytes', '512', '--results-out', '/tmp/r.json', '--protocol-out', '/tmp/p.json', '--force']);
  assert.equal(a.baseUrl, 'http://x:1');
  assert.equal(a.origin, 'http://x:1');
  assert.equal(a.email, 'e@x');
  assert.equal(a.password, 'p');
  assert.equal(a.allowLive, true);
  assert.equal(a.timeoutMs, 5000);
  assert.equal(a.maxBodyBytes, 512);
  assert.equal(a.resultsOut, '/tmp/r.json');
  assert.equal(a.protocolOut, '/tmp/p.json');
  assert.equal(a.force, true);
});

test('(i) parseArgs throws on unknown arg', () => {
  assert.throws(() => runner.parseArgs(['node', 's.js', '--bogus']), /unknown arg/);
});

// ---------------------------------------------------------------------------
// (j) Static audit: no role method starts with a mutation verb
// ---------------------------------------------------------------------------
test('(j) per-role method tokens never start with mutation verb', () => {
  for (const entry of ROLE_REGISTRY) {
    let m;
    if (entry.identity_kind === 'paperclip_api_readonly') {
      if (entry.role === 'paperclip_health') m = 'GET /api/health';
      else if (entry.role === 'hermes_environment') m = 'GET /api/companies/{companyId}/adapters/hermes/test-environment';
      else m = 'GET /api/companies/{companyId}/agents';
    } else if (entry.identity_kind === 'observed') m = 'GET /api/health';
    else if (entry.identity_kind === 'offline_bundle_read') m = 'GET /api/companies/{companyId}/missions';
    else if (entry.identity_kind === 'scratch_drill') m = entry.drill_kind;
    assert.equal(data.MUTATION_VERB_REGEX.test(m), false, entry.role + ' has mutation verb in ' + m);
    assert.equal(data.isAllowedMethod(m), true, entry.role + ' method ' + m + ' not in allowlist');
  }
});

// ---------------------------------------------------------------------------
// Local fetchImpl binding for tests
// ---------------------------------------------------------------------------
const fetchImpl = globalThis.fetch;
