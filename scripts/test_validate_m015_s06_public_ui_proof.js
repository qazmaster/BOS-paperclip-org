#!/usr/bin/env node
'use strict';

/**
 * scripts/test_validate_m015_s06_public_ui_proof.js
 *
 * Unit tests for scripts/validate_m015_s06_public_ui_proof.js.
 *
 * These tests cover pure-function surface (loadEnv, parseCookies,
 * scanDiagnosticsForLeaks, evaluateBrowserAssertions, deriveVerdict,
 * buildPublicUiProofEvidence, writeEvidence, VIRTUAL_PAGES layout).
 *
 * The tests intentionally do NOT spin up real Chrome: the live UI proof
 * runner depends on a live Paperclip instance, and `node validate_*` is
 * reserved for the integration run (it produces the canonical evidence).
 * Pure helpers are exercised here so we have positive + negative fixture
 * coverage for the leak scan and browser assertion pipeline.
 *
 * Test cases:
 *   - parseCookies: parses well-formed Set-Cookie + honors HttpOnly/Secure/SameSite/Path
 *   - parseCookies: handles missing Set-Cookie without crashing
 *   - scanDiagnosticsForLeaks: detects UUID, credential assignment, xiaomi/mimo
 *   - scanDiagnosticsForLeaks: returns empty array when diagnostics are clean
 *   - evaluateBrowserAssertions: detects sign-up POST request (BLOCKED)
 *   - evaluateBrowserAssertions: detects 5xx response (BLOCKED)
 *   - evaluateBrowserAssertions: detects console errors (BLOCKED)
 *   - evaluateBrowserAssertions: detects trusted-origin mismatch (BLOCKED)
 *   - evaluateBrowserAssertions: detects cookie-not-set (BLOCKED)
 *   - evaluateBrowserAssertions: detects network loading-failed events (BLOCKED)
 *   - evaluateBrowserAssertions: passes clean diagnostics (PASS_AUTH_NO_LEAK)
 *   - deriveVerdict: leak findings always trump other failures (LEAK_DETECTED)
 *   - deriveVerdict: trusted-origin / cookie failures yield BLOCKED_UI_AUTH_FAILURE
 *   - deriveVerdict: safety violations yield BLOCKED_UI_SAFETY_VIOLATION
 *   - deriveVerdict: clean run yields PASS_AUTH_NO_LEAK
 *   - buildPublicUiProofEvidence: serializes with redaction discipline
 *   - writeEvidence: throws on UUID leak in serialized output
 *   - writeEvidence: throws on credential leak in serialized output
 *   - writeEvidence: writes valid JSON to OUTPUT_PATH
 *   - VIRTUAL_PAGES: 8 entries (root, 6 children, root-final) — no missing/extra
 *   - NEGATIVE_PROBE: path matches expected slug
 *   - extractSafeOrigin: parses https://host
 *   - extractSafeOrigin: returns null for invalid URL
 *   - evaluateBrowserAssertions: negative probe allows 200/401/403/404 but flags 5xx
 *   - canonical verdict constant: M015_S06_UI
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { test } = require('node:test');
const assert = require('node:assert');

const ROOT = path.resolve(__dirname, '..');
const RUNNER_PATH = path.join(ROOT, 'scripts/validate_m015_s06_public_ui_proof.js');

function freshRequire() {
  // Bust require cache to test against current runner source.
  delete require.cache[require.resolve(RUNNER_PATH)];
  return require(RUNNER_PATH);
}

test('canonical verdict constant equals M015_S06_UI', () => {
  const r = freshRequire();
  assert.strictEqual(r.CANONICAL_VERDICT, 'M015_S06_UI');
});

test('VIRTUAL_PAGES layout: 8 entries (root, child-div1..6, root-final)', () => {
  const r = freshRequire();
  assert.strictEqual(r.VIRTUAL_PAGES.length, 8, 'expected 8 pages');
  const slugs = r.VIRTUAL_PAGES.map((p) => p.slug);
  assert.deepStrictEqual(slugs, ['root', 'child-div1', 'child-div2', 'child-div3', 'child-div4', 'child-div5', 'child-div6', 'root-final']);
});

test('NEGATIVE_PROBE shape', () => {
  const r = freshRequire();
  assert.strictEqual(typeof r.NEGATIVE_PROBE, 'object');
  assert.ok(r.NEGATIVE_PROBE.path.startsWith('/issues/'), 'probe must target issues path');
  assert.strictEqual(r.NEGATIVE_PROBE.expected_kind, '404-or-not-found');
});

test('parseCookies parses well-formed Set-Cookie array', () => {
  const r = freshRequire();
  const setCookies = [
    'session=abc123; Path=/; HttpOnly; SameSite=Lax',
    'csrf=xyz789; Path=/; Secure; SameSite=None',
  ];
  const parsed = r.parseCookies(setCookies);
  assert.strictEqual(parsed.cookieHeader, 'session=abc123; csrf=xyz789');
  assert.strictEqual(parsed.parsed.length, 2);
  // parseCookies lowercases SameSite to canonical form
  assert.deepStrictEqual(parsed.parsed[0], {
    name: 'session', value: 'abc123', httpOnly: true, secure: false, sameSite: 'lax', path: '/', expires: null,
  });
  assert.deepStrictEqual(parsed.parsed[1], {
    name: 'csrf', value: 'xyz789', httpOnly: false, secure: true, sameSite: 'none', path: '/', expires: null,
  });
});

test('parseCookies handles missing Set-Cookie', () => {
  const r = freshRequire();
  const parsed = r.parseCookies([]);
  assert.strictEqual(parsed.cookieHeader, '');
  assert.deepStrictEqual(parsed.parsed, []);
  const parsedNull = r.parseCookies(null);
  assert.strictEqual(parsedNull.cookieHeader, '');
});

test('extractSafeOrigin parses https://host', () => {
  const r = freshRequire();
  const safe = r.extractSafeOrigin('https://paperclip.oysana.com');
  assert.deepStrictEqual(safe, { protocol: 'https:', host: 'paperclip.oysana.com', origin: 'https://paperclip.oysana.com' });
});

test('extractSafeOrigin returns null for invalid URL', () => {
  const r = freshRequire();
  assert.strictEqual(r.extractSafeOrigin('not-a-url'), null);
  assert.strictEqual(r.extractSafeOrigin(''), null);
});

test('scanDiagnosticsForLeaks detects UUID, credential assignment, xiaomi', () => {
  const r = freshRequire();
  const diagnostics = {
    networkRequests: [
      // valid UUIDv4 (variant nibble must be 8-b; version nibble must be 1-5)
      { id: '1', url: 'https://paperclip.oysana.com/api/issues/12345678-aaaa-4bbb-8ccc-123456789012', headers: [] },
      { id: '2', url: 'https://paperclip.oysana.com/?PAPERCLIP_API_KEY=sk-deadbeef1234567890', headers: [] },
    ],
    consoleEvents: [
      { method: 'Runtime.consoleAPICalled', level: 'log', args: ['xiaomi endpoint reuse detected'] },
      { method: 'Runtime.consoleAPICalled', level: 'log', args: ['mimo fallback triggered'] },
    ],
  };
  const findings = r.scanDiagnosticsForLeaks(diagnostics);
  const kinds = findings.map((f) => f.kind);
  assert.ok(kinds.includes('uuid-url'), `expected uuid-url in: ${kinds.join(',')}`);
  assert.ok(kinds.includes('credential-url'), `expected credential-url in: ${kinds.join(',')}`);
  assert.ok(kinds.includes('xiaomi-console'), `expected xiaomi-console in: ${kinds.join(',')}`);
});

test('scanDiagnosticsForLeaks returns empty array for clean diagnostics', () => {
  const r = freshRequire();
  const diagnostics = {
    networkRequests: [
      { id: '1', url: 'https://paperclip.oysana.com/api/issues?limit=20', headers: [{ name: 'accept', value: 'application/json' }] },
    ],
    consoleEvents: [
      { method: 'Runtime.consoleAPICalled', level: 'log', args: ['[react] component mounted'] },
    ],
  };
  const findings = r.scanDiagnosticsForLeaks(diagnostics);
  assert.deepStrictEqual(findings, []);
});

test('scanDiagnosticsForLeaks: cookie/authorization header names are advisory only, not leaks', () => {
  const r = freshRequire();
  const diagnostics = {
    networkRequests: [
      { id: '1', url: 'https://paperclip.oysana.com/api/x', headers: [{ name: 'cookie', value: 'session=abc' }] },
      { id: '2', url: 'https://paperclip.oysana.com/api/y', headers: [{ name: 'Authorization', value: 'Bearer abc1234567890def' }] },
    ],
    consoleEvents: [],
  };
  const findings = r.scanDiagnosticsForLeaks(diagnostics);
  // Auth header names are EXPECTED on authenticated requests — we do NOT
  // flag them as leaks anymore. Only credential-pattern VALUES are leaks.
  const kinds = findings.map((f) => f.kind);
  assert.ok(!kinds.includes('auth-header-leak'), `auth-header-leak should NOT appear: ${kinds.join(',')}`);
  assert.strictEqual(findings.length, 0, 'no leaks expected for clean auth headers');
});

test('scanDiagnosticsForLeaks detects credential-header-value as blocking', () => {
  const r = freshRequire();
  const diagnostics = {
    networkRequests: [
      { id: '1', url: 'https://paperclip.oysana.com/api/x', headers: [{ name: 'x-custom', value: 'PAPERCLIP_API_KEY=sk-deadbeef1234567890' }] },
    ],
    consoleEvents: [],
  };
  const findings = r.scanDiagnosticsForLeaks(diagnostics);
  const findingsOfKind = findings.filter((f) => f.kind === 'credential-header-value');
  assert.strictEqual(findingsOfKind.length, 1, 'expected exactly one credential-header-value finding');
  assert.strictEqual(findingsOfKind[0].severity, 'blocking');
});

test('evaluateBrowserAssertions: sign-up POST is blocked', () => {
  const r = freshRequire();
  const diag = {
    networkRequests: [{ id: '1', url: 'https://paperclip.oysana.com/api/auth/sign-up' }],
    consoleEvents: [],
    responseStatuses: [{ status: 200 }],
    networkFailures: [],
  };
  const result = r.evaluateBrowserAssertions({
    trustedOrigin: { host: 'paperclip.oysana.com' },
    expectedOrigin: { host: 'paperclip.oysana.com' },
    diagnosticsByPage: { root: diag },
    negativeProbe: null,
    setCookie: { cookieHeader: 'session=abc' },
  });
  const codes = result.blockers.map((b) => b.code);
  assert.ok(codes.includes(r.BLOCKER_CODES.SIGNUP_REQUEST_DETECTED), `expected SIGNUP in: ${codes.join(',')}`);
});

test('evaluateBrowserAssertions: 5xx response is blocked', () => {
  const r = freshRequire();
  const diag = {
    networkRequests: [],
    consoleEvents: [],
    responseStatuses: [{ status: 500 }, { status: 502 }],
    networkFailures: [],
  };
  const result = r.evaluateBrowserAssertions({
    trustedOrigin: { host: 'paperclip.oysana.com' },
    expectedOrigin: { host: 'paperclip.oysana.com' },
    diagnosticsByPage: { root: diag },
    negativeProbe: null,
    setCookie: { cookieHeader: 'session=abc' },
  });
  const codes = result.blockers.map((b) => b.code);
  assert.ok(codes.includes(r.BLOCKER_CODES.FIVE_XX_DETECTED), `expected FIVE_XX in: ${codes.join(',')}`);
});

test('evaluateBrowserAssertions: console error is blocked', () => {
  const r = freshRequire();
  const diag = {
    networkRequests: [],
    consoleEvents: [{ method: 'Runtime.consoleAPICalled', level: 'error', args: ['boom'] }],
    responseStatuses: [],
    networkFailures: [],
  };
  const result = r.evaluateBrowserAssertions({
    trustedOrigin: { host: 'paperclip.oysana.com' },
    expectedOrigin: { host: 'paperclip.oysana.com' },
    diagnosticsByPage: { root: diag },
    negativeProbe: null,
    setCookie: { cookieHeader: 'session=abc' },
  });
  const codes = result.blockers.map((b) => b.code);
  assert.ok(codes.includes(r.BLOCKER_CODES.CONSOLE_ERROR_DETECTED), `expected CONSOLE_ERROR in: ${codes.join(',')}`);
});

test('evaluateBrowserAssertions: trusted-origin mismatch is blocked', () => {
  const r = freshRequire();
  const diag = { networkRequests: [], consoleEvents: [], responseStatuses: [], networkFailures: [] };
  const result = r.evaluateBrowserAssertions({
    trustedOrigin: { host: 'evil.example.com' },
    expectedOrigin: { host: 'paperclip.oysana.com' },
    diagnosticsByPage: { root: diag },
    negativeProbe: null,
    setCookie: { cookieHeader: 'session=abc' },
  });
  const codes = result.blockers.map((b) => b.code);
  assert.ok(codes.includes(r.BLOCKER_CODES.TRUSTED_ORIGIN_MISMATCH), `expected ORIGIN_MISMATCH in: ${codes.join(',')}`);
});

test('evaluateBrowserAssertions: cookie-not-set is blocked', () => {
  const r = freshRequire();
  const diag = { networkRequests: [], consoleEvents: [], responseStatuses: [], networkFailures: [] };
  const result = r.evaluateBrowserAssertions({
    trustedOrigin: { host: 'paperclip.oysana.com' },
    expectedOrigin: { host: 'paperclip.oysana.com' },
    diagnosticsByPage: { root: diag },
    negativeProbe: null,
    setCookie: null,
  });
  const codes = result.blockers.map((b) => b.code);
  assert.ok(codes.includes(r.BLOCKER_CODES.COOKIE_NOT_SET), `expected COOKIE_NOT_SET in: ${codes.join(',')}`);
});

test('evaluateBrowserAssertions: network loading-failed is blocked', () => {
  const r = freshRequire();
  const diag = {
    networkRequests: [{ id: '1', url: 'https://paperclip.oysana.com/api/issues' }],
    consoleEvents: [],
    responseStatuses: [],
    networkFailures: [{ id: '1', error_text: 'net::ERR_ABORTED' }],
  };
  const result = r.evaluateBrowserAssertions({
    trustedOrigin: { host: 'paperclip.oysana.com' },
    expectedOrigin: { host: 'paperclip.oysana.com' },
    diagnosticsByPage: { root: diag },
    negativeProbe: null,
    setCookie: { cookieHeader: 'session=abc' },
  });
  const codes = result.blockers.map((b) => b.code);
  assert.ok(codes.includes(r.BLOCKER_CODES.FAILED_REQUEST_DETECTED), `expected FAILED_REQUEST in: ${codes.join(',')}`);
});

test('evaluateBrowserAssertions: clean diagnostics passes', () => {
  const r = freshRequire();
  const diag = {
    networkRequests: [{ id: '1', url: 'https://paperclip.oysana.com/api/issues' }],
    consoleEvents: [{ method: 'Runtime.consoleAPICalled', level: 'log', args: ['fetched 12 issues'] }],
    responseStatuses: [{ status: 200 }, { status: 304 }],
    networkFailures: [],
  };
  const result = r.evaluateBrowserAssertions({
    trustedOrigin: { host: 'paperclip.oysana.com' },
    expectedOrigin: { host: 'paperclip.oysana.com' },
    diagnosticsByPage: { root: diag },
    negativeProbe: null,
    setCookie: { cookieHeader: 'session=abc' },
  });
  assert.strictEqual(result.blockers.length, 0);
});

test('evaluateBrowserAssertions: negative probe allows 200/401/403/404 but flags 5xx', () => {
  const r = freshRequire();
  const diag = { networkRequests: [], consoleEvents: [], responseStatuses: [], networkFailures: [] };
  // 404 in negative probe is expected behavior (mission root not exists).
  const result404 = r.evaluateBrowserAssertions({
    trustedOrigin: { host: 'paperclip.oysana.com' },
    expectedOrigin: { host: 'paperclip.oysana.com' },
    diagnosticsByPage: {},
    negativeProbe: {
      networkRequests: [{ id: '1', url: 'https://paperclip.oysana.com/issues/not-real' }],
      responseStatuses: [{ status: 404 }],
      consoleEvents: [],
      networkFailures: [],
    },
    setCookie: { cookieHeader: 'session=abc' },
  });
  assert.strictEqual(result404.blockers.length, 0, 'expected no blockers for 404 negative probe');

  // 5xx in negative probe is a leak/safety issue.
  const result500 = r.evaluateBrowserAssertions({
    trustedOrigin: { host: 'paperclip.oysana.com' },
    expectedOrigin: { host: 'paperclip.oysana.com' },
    diagnosticsByPage: {},
    negativeProbe: {
      networkRequests: [{ id: '1', url: 'https://paperclip.oysana.com/issues/not-real' }],
      responseStatuses: [{ status: 503 }],
      consoleEvents: [],
      networkFailures: [],
    },
    setCookie: { cookieHeader: 'session=abc' },
  });
  const codes = result500.blockers.map((b) => b.code);
  assert.ok(codes.includes(r.BLOCKER_CODES.FIVE_XX_DETECTED), `expected FIVE_XX for 503 negative probe: ${codes.join(',')}`);
});

test('deriveVerdict: blocking leak findings trump other failures', () => {
  const r = freshRequire();
  const result = r.deriveVerdict({
    blockers: [{ code: r.BLOCKER_CODES.CONSOLE_ERROR_DETECTED, severity: 'blocking' }],
    leakFindings: [{ kind: 'credential-url', ref: '1', severity: 'blocking' }],
  });
  assert.strictEqual(result.verdict, 'BLOCKED_UI_LEAK_DETECTED');
});

test('deriveVerdict: advisory leak findings do NOT block verdict', () => {
  const r = freshRequire();
  const result = r.deriveVerdict({
    blockers: [],
    leakFindings: [{ kind: 'uuid-url', ref: '1', severity: 'advisory' }],
  });
  assert.strictEqual(result.verdict, 'PASS_AUTH_NO_LEAK');
});

test('deriveVerdict: trusted-origin / cookie failures yield BLOCKED_UI_AUTH_FAILURE', () => {
  const r = freshRequire();
  const result1 = r.deriveVerdict({
    blockers: [{ code: r.BLOCKER_CODES.TRUSTED_ORIGIN_MISMATCH, severity: 'blocking' }],
    leakFindings: [],
  });
  assert.strictEqual(result1.verdict, 'BLOCKED_UI_AUTH_FAILURE');

  const result2 = r.deriveVerdict({
    blockers: [{ code: r.BLOCKER_CODES.COOKIE_NOT_SET, severity: 'blocking' }],
    leakFindings: [],
  });
  assert.strictEqual(result2.verdict, 'BLOCKED_UI_AUTH_FAILURE');
});

test('deriveVerdict: safety violations yield BLOCKED_UI_SAFETY_VIOLATION', () => {
  const r = freshRequire();
  const result = r.deriveVerdict({
    blockers: [
      { code: r.BLOCKER_CODES.SIGNUP_REQUEST_DETECTED, severity: 'blocking' },
    ],
    leakFindings: [],
  });
  assert.strictEqual(result.verdict, 'BLOCKED_UI_SAFETY_VIOLATION');
});

test('deriveVerdict: clean run yields PASS_AUTH_NO_LEAK', () => {
  const r = freshRequire();
  const result = r.deriveVerdict({ blockers: [], leakFindings: [] });
  assert.strictEqual(result.verdict, 'PASS_AUTH_NO_LEAK');
  assert.strictEqual(result.code, 'M15-S06-UI-PASS-AUTH-NO-LEAK');
});

test('buildPublicUiProofEvidence: serializes with redaction discipline', () => {
  const r = freshRequire();
  const evidence = r.buildPublicUiProofEvidence({
    startedAt: '2026-07-15T20:00:00.000Z',
    endedAt: '2026-07-15T20:01:00.000Z',
    env: { PAPERCLIP_BASE_URL: 'https://paperclip.oysana.com', PAPERCLIP_ORIGIN: 'https://paperclip.oysana.com', PAPERCLIP_EMAIL: 'a@b.c', PAPERCLIP_PASSWORD: 'pw', duplicateKeys: [] },
    auth: { ok: true, http_status: 200, elapsed_ms: 500, cookies: [{ name: 'session', httpOnly: true, secure: false, sameSite: 'Lax', path: '/' }], reason: null, blocker_code: null },
    chromeLaunch: { args: ['--headless=new'], userDataDir: '/tmp/x' },
    chromeReady: { ready: true, browser_ws_url: 'ws://localhost:9222/devtools/page/abc', browser: { Browser: 'Chrome/150', 'Protocol-Version': '1.3' } },
    trustedOrigin: { host: 'paperclip.oysana.com' },
    expectedOrigin: { host: 'paperclip.oysana.com' },
    pageEvidence: [{ slug: 'root', path: '/', url: 'https://paperclip.oysana.com/', expected_kind: 'authenticated-ui-page', screenshot_path: '/tmp/root.png', screenshot_bytes: 12345, screenshot_hash: 'a'.repeat(64) }],
    negativeProbeEvidence: { slug: 'negative-issue-probe', path: '/issues/s06-mission-M015-S06-T04-not-exists', url: 'https://paperclip.oysana.com/issues/s06-mission-M015-S06-T04-not-exists' },
    diagnosticsByPage: { root: { networkRequests: [{ id: '1', url: 'https://paperclip.oysana.com/api/issues' }], consoleEvents: [], responseStatuses: [{ status: 200 }], networkFailures: [] } },
    screenshotHashes: { root: 'a'.repeat(64) },
    leakFindings: [],
    assertions: { blockers: [], warnings: [] },
    verdictResult: { verdict: 'PASS_AUTH_NO_LEAK', code: 'M15-S06-UI-PASS-AUTH-NO-LEAK' },
    safeBlockDeclared: true,
    preflightSnapshot: { verdict: 'BLOCKED_ON_LIVE_RUNTIME_UNREACHABLE', business_mutations_recorded: 0 },
    validationSnapshot: { status: 'MISSION_FAIL_CLOSED_LEDGER_VIOLATION' },
    missionRunSnapshot: { status: 'MISSION_BLOCKED_NO_RUN', root_issue: null, mission_run: null },
  });
  assert.strictEqual(evidence.canonical_verdict, 'M015_S06_UI');
  assert.strictEqual(evidence.verdict, 'PASS_AUTH_NO_LEAK');
  assert.strictEqual(evidence.safe_block_declared, true);
  // password MUST be scrubbed from auth surface
  assert.ok(!('PAPERCLIP_PASSWORD' in evidence.environment), 'password must not leak into environment');
  // auth block must only have cookie names (no values)
  for (const c of evidence.auth.cookie_attributes) {
    assert.ok(!('value' in c), `cookie must not contain raw value: ${JSON.stringify(c)}`);
  }
  // redaction discipline keys exist
  assert.deepStrictEqual(evidence.redaction, {
    full_ids: false,
    credentials: false,
    xiaomi_endpoint_reuse: false,
    synthetic_bos: false,
  });
});

test('writeEvidence scrubs UUID before writing (no raw UUID remains in file)', () => {
  const r = freshRequire();
  const origOutput = path.join(ROOT, 'runtime-evidence/M015-S06-public-ui-proof.json');
  let backed = null;
  if (fs.existsSync(origOutput)) backed = fs.readFileSync(origOutput);
  try {
    const evidence = {
      $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s06-public-ui-proof.v1.json',
      milestone: 'M015',
      slice: 'S06',
      task: 'T04',
      generated: new Date().toISOString(),
      canonical_verdict: 'M015_S06_UI',
      // Valid UUID v4: 3rd group starts with 1-5, 4th group starts with 8-b.
      // writeEvidence scrubs this to <redacted-id> before persisting.
      leaked_uuid: '12345678-aaaa-4bbb-8ccc-123456789012',
    };
    r.writeEvidence(evidence);
    const written = fs.readFileSync(path.join(ROOT, 'runtime-evidence/M015-S06-public-ui-proof.json'), 'utf8');
    assert.ok(!/12345678-aaaa-4bbb-8ccc-123456789012/.test(written), 'raw UUID must be scrubbed before write');
    assert.ok(/redacted-id/.test(written), 'redaction marker should be present after scrub');
  } finally {
    if (backed) fs.writeFileSync(origOutput, backed);
  }
});

test('writeEvidence scrubs credential assignment before writing', () => {
  const r = freshRequire();
  const origOutput = path.join(ROOT, 'runtime-evidence/M015-S06-public-ui-proof.json');
  let backed = null;
  if (fs.existsSync(origOutput)) backed = fs.readFileSync(origOutput);
  try {
    const evidence = {
      $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s06-public-ui-proof.v1.json',
      milestone: 'M015',
      slice: 'S06',
      task: 'T04',
      generated: new Date().toISOString(),
      canonical_verdict: 'M015_S06_UI',
      leaked_cred: 'PAPERCLIP_API_KEY=sk-deadbeef1234567890',
    };
    r.writeEvidence(evidence);
    const written = fs.readFileSync(path.join(ROOT, 'runtime-evidence/M015-S06-public-ui-proof.json'), 'utf8');
    assert.ok(!/PAPERCLIP_API_KEY=sk-deadbeef1234567890/.test(written), 'raw credential assignment must be scrubbed before write');
    assert.ok(/redacted-credential-fragment/.test(written), 'redaction marker should be present after scrub');
  } finally {
    if (backed) fs.writeFileSync(origOutput, backed);
  }
});

test('writeEvidence writes valid JSON when evidence is clean', () => {
  const r = freshRequire();
  const evidence = {
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s06-public-ui-proof.v1.json',
    milestone: 'M015',
    slice: 'S06',
    task: 'T04',
    generated: new Date().toISOString(),
    canonical_verdict: 'M015_S06_UI',
    verdict: 'PASS_AUTH_NO_LEAK',
  };
  r.writeEvidence(evidence);
  const written = JSON.parse(fs.readFileSync(path.join(ROOT, 'runtime-evidence/M015-S06-public-ui-proof.json'), 'utf8'));
  assert.strictEqual(written.canonical_verdict, 'M015_S06_UI');
  assert.strictEqual(written.verdict, 'PASS_AUTH_NO_LEAK');
});

test('loadEnv returns object with defaults when .env is missing', () => {
  const r = freshRequire();
  // Save and unset env vars
  const origEmail = process.env.PAPERCLIP_EMAIL;
  const origPassword = process.env.PAPERCLIP_PASSWORD;
  const origBase = process.env.PAPERCLIP_BASE_URL;
  delete process.env.PAPERCLIP_EMAIL;
  delete process.env.PAPERCLIP_PASSWORD;
  delete process.env.PAPERCLIP_BASE_URL;
  try {
    const env = r.loadEnv();
    assert.strictEqual(env.PAPERCLIP_BASE_URL, 'https://paperclip.oysana.com');
  } finally {
    if (origEmail) process.env.PAPERCLIP_EMAIL = origEmail;
    if (origPassword) process.env.PAPERCLIP_PASSWORD = origPassword;
    if (origBase) process.env.PAPERCLIP_BASE_URL = origBase;
  }
});

test('BLOCKER_CODES has stable canonical names', () => {
  const r = freshRequire();
  assert.strictEqual(r.BLOCKER_CODES.SIGNUP_REQUEST_DETECTED, 'M15-S06-UI-SIGNUP-REQUEST-DETECTED');
  assert.strictEqual(r.BLOCKER_CODES.FIVE_XX_DETECTED, 'M15-S06-UI-FIVE-XX-DETECTED');
  assert.strictEqual(r.BLOCKER_CODES.FAILED_REQUEST_DETECTED, 'M15-S06-UI-FAILED-REQUEST-DETECTED');
  assert.strictEqual(r.BLOCKER_CODES.CONSOLE_ERROR_DETECTED, 'M15-S06-UI-CONSOLE-ERROR-DETECTED');
  assert.strictEqual(r.BLOCKER_CODES.TRUSTED_ORIGIN_MISMATCH, 'M15-S06-UI-TRUSTED-ORIGIN-MISMATCH');
  assert.strictEqual(r.BLOCKER_CODES.LEAK_DETECTED, 'M15-S06-UI-LEAK-DETECTED');
});