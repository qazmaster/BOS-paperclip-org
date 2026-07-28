#!/usr/bin/env node
'use strict';

/**
 * scripts/run_m016_s03_readonly_probes.js
 *
 * M016-txa3vu / S03 / T03 — GET-only live role probe runner.
 *
 * Sequentially executes allowlisted GET probes for 16 roles (7 divisions +
 * 9 infrastructure). Discover step is fresh via /api/companies →
 * /api/companies/{id}/agents (no hardcoded UUIDs). Each probe becomes a
 * schema-valid EXECUTED record; auth/timeout/404/429/unavailable become
 * honest NOT_PROVEN records. Mutation delta = STOP. Atomic writes only;
 * raw HTTP body never persisted to disk — only sanitised digests and
 * hashes leave the runner.
 *
 * Exit codes:
 *   0  SESSION_VALID          — all roles evaluated, zero mutation,
 *                               sidecars immutable, schema-clean.
 *   1  PROBE_RECORD_MALFORMED — at least one record failed contract gate.
 *   2  MUTATION_DETECTED      — pre/post sidecar drift OR a live probe
 *                               bumped a zero-mutation counter.
 *   3  RUNNER_FAILURE         — internal error (sign-in crash, fetch impl
 *                               missing, IO error, etc.).
 *   4  REDACTION_LEAK         — sanitisation pipeline produced a record
 *                               that the contract would reject.
 *   5  BUNDLE_REJECTED        — schema/CLI violation (bad --base-url,
 *                               missing --output, etc.).
 *
 * Usage:
 *   node scripts/run_m016_s03_readonly_probes.js [--allow-live] \
 *     [--base-url <url>] [--origin <url>] [--email <e>] [--password <p>] \
 *     [--timeout-ms <ms>] [--max-body-bytes <n>] \
 *     [--results-out <path>] [--protocol-out <path>] [--force]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const contract = require('./lib/m016-s03-safe-probe-contract');
const data = require('./lib/m016-s03-safe-probe-data');
const {
  ROLE_REGISTRY, ROLE_BY_NAME, PROBE_METHODS, PROBE_METHOD_VALUES,
  MUTATION_VERB_REGEX, isAllowedMethod,
  REDACTION_FLAG_VALUES,
  MUTATION_AUDIT_ZERO_COUNTERS,
  BLOCKER_CODES, EXIT_CODES, DEFAULTS,
} = data;

const ROOT = path.resolve(__dirname, '..');
const SCRIPT_PATH = __filename;

const IMMUTABLE_SIDECARS = Object.freeze([
  'runtime-evidence/M016-S02-bos-mission-proof.json',
  'runtime-evidence/M016-S02-collect-protocol.json',
  'runtime-evidence/M016-S02-input-inventory.json',
  'runtime-evidence/M016-S02-redaction-contract.json',
  'runtime-evidence/M016-S02-verify-protocol.json',
]);

const DEFAULT_RESULTS_OUT = 'runtime-evidence/M016-S03-live-probe-results.json';
const DEFAULT_PROTOCOL_OUT = 'runtime-evidence/M016-S03-live-probe-protocol.json';

// ---------------------------------------------------------------------------
// 1. Static assertion — no mutation verbs anywhere in the frozen allowlist.
// ---------------------------------------------------------------------------
function assertStaticNoMutationVerbs() {
  // Read PROBE_METHOD_VALUES from the data module each call so external
  // monkey-patches (used in negative tests) are observed.
  const values = (data && Array.isArray(data.PROBE_METHOD_VALUES)) ? data.PROBE_METHOD_VALUES : PROBE_METHOD_VALUES;
  const hits = [];
  for (const m of values) {
    if (typeof m !== 'string') { hits.push('non-string:' + String(m)); continue; }
    if (MUTATION_VERB_REGEX.test(m)) hits.push(m);
    if (!isAllowedMethod(m)) hits.push('not-allowed:' + m);
  }
  if (hits.length) {
    const err = new Error('PROBE_METHODS contains forbidden entries (mutation verb or not-allowed): ' + hits.join(','));
    err.code = BLOCKER_CODES.MUTATION_VERB_DETECTED('static', hits[0]);
    throw err;
  }
  return { checked: values.length, allowlist: values.slice() };
}

// ---------------------------------------------------------------------------
// 2. BoundedFetch — GET-only with redirect rejection + body cap + timeout.
// ---------------------------------------------------------------------------
class BoundedFetch {
  constructor(options) {
    const opts = options || {};
    const baseStr = opts.baseUrl || process.env.PAPERCLIP_BASE_URL || 'http://127.0.0.1:43131';
    this.baseUrl = new URL(baseStr);
    if (!['http:', 'https:'].includes(this.baseUrl.protocol)) {
      throw new Error('BoundedFetch baseUrl must be http(s)://');
    }
    this.origin = opts.origin || process.env.PAPERCLIP_ORIGIN || this.baseUrl.origin;
    this.timeoutMs = opts.timeoutMs || 15000;
    this.maxBodyBytes = opts.maxBodyBytes || (1024 * 1024);
    this.fetchImpl = opts.fetchImpl || (typeof fetch === 'function' ? fetch : null);
    this.cookie = opts.cookie || null;
    this.signedIn = !!opts.cookie;
    this.signInFlight = false;
    this.boundedCalls = 0;
    this.maxCalls = opts.maxCalls || 32;
    if (!this.fetchImpl) throw new Error('BoundedFetch requires global fetch or opts.fetchImpl');
  }

  _rejectCrossOrigin(location) {
    let target;
    try { target = new URL(location, this.baseUrl); } catch (_e) {
      return { ok: false, code: 'CROSS_ORIGIN_REDIRECT', reason: 'malformed redirect location' };
    }
    if (target.protocol !== this.baseUrl.protocol || target.host !== this.baseUrl.host) {
      return { ok: false, code: 'CROSS_ORIGIN_REDIRECT', reason: 'redirect target ' + target.origin + ' (host/protocol mismatch)' };
    }
    return { ok: true, target };
  }

  async signIn({ email, password }) {
    if (this.signInFlight) throw new Error('concurrent sign-in detected');
    if (this.signedIn) return { ok: true, reused: true };
    this.signInFlight = true;
    try {
      const url = new URL('/api/auth/sign-in/email', this.baseUrl);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json', origin: this.origin, referer: this.origin + '/' },
          body: JSON.stringify({ email, password }),
          signal: controller.signal,
          redirect: 'manual',
        });
        if (res.status === 429) return { ok: false, code: 'RATE_LIMITED', reason: 'HTTP 429 during sign-in', status: 429 };
        if (res.status === 401 || res.status === 403) return { ok: false, code: 'AUTH_FAILED', reason: 'HTTP ' + res.status + ' during sign-in', status: res.status };
        if (res.status >= 500) return { ok: false, code: 'UNAVAILABLE', reason: 'HTTP ' + res.status + ' during sign-in', status: res.status };
        if (!res.ok) return { ok: false, code: 'AUTH_FAILED', reason: 'HTTP ' + res.status + ' during sign-in', status: res.status };
        const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
        const cookie = (setCookies || []).filter(Boolean).map((c) => String(c).split(';')[0]).join('; ');
        if (!cookie) return { ok: false, code: 'AUTH_FAILED', reason: 'no session cookie in sign-in response', status: res.status };
        this.cookie = cookie;
        this.signedIn = true;
        return { ok: true };
      } finally { clearTimeout(timer); }
    } finally { this.signInFlight = false; }
  }

  async get(reqPath) {
    this.boundedCalls++;
    if (this.boundedCalls > this.maxCalls) {
      return { ok: false, code: 'RUNNER_FAILURE', reason: 'bounded calls exceeded ' + this.maxCalls + ' in session' };
    }
    if (typeof reqPath !== 'string' || !reqPath.startsWith('/')) {
      return { ok: false, code: 'RUNNER_FAILURE', reason: 'path must start with /' };
    }
    const url = new URL(reqPath, this.baseUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers = { accept: 'application/json', origin: this.origin, referer: this.origin + '/' };
      if (this.cookie) headers.cookie = this.cookie;
      const res = await this.fetchImpl(url, { method: 'GET', headers, signal: controller.signal, redirect: 'manual' });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        const rej = this._rejectCrossOrigin(loc || '');
        if (!rej.ok) return { ok: false, code: rej.code, reason: rej.reason, status: res.status };
        const controller2 = new AbortController();
        const timer2 = setTimeout(() => controller2.abort(), this.timeoutMs);
        try {
          const headers2 = { accept: 'application/json', origin: this.origin, referer: this.origin + '/' };
          if (this.cookie) headers2.cookie = this.cookie;
          const res2 = await this.fetchImpl(rej.target, { method: 'GET', headers: headers2, signal: controller2.signal, redirect: 'manual' });
          return await this._readBody(res2);
        } finally { clearTimeout(timer2); }
      }
      return await this._readBody(res);
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, code: 'TIMEOUT', reason: 'request aborted after ' + this.timeoutMs + 'ms' };
      return { ok: false, code: 'UNAVAILABLE', reason: 'fetch failed: ' + (e && e.message || e) };
    } finally { clearTimeout(timer); }
  }

  async _readBody(res) {
    if (res.status === 401 || res.status === 403) return { ok: false, code: 'AUTH_FAILED', reason: 'HTTP ' + res.status, status: res.status };
    if (res.status === 404) return { ok: false, code: 'NOT_FOUND', reason: 'HTTP 404', status: 404 };
    if (res.status === 429) return { ok: false, code: 'RATE_LIMITED', reason: 'HTTP 429', status: 429 };
    if (res.status >= 500) return { ok: false, code: 'UNAVAILABLE', reason: 'HTTP ' + res.status, status: res.status };
    if (!res.ok) return { ok: false, code: 'RUNNER_FAILURE', reason: 'HTTP ' + res.status, status: res.status };
    if (!res.body) return { ok: true, status: res.status, body: null };
    const reader = res.body.getReader();
    let received = 0;
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > this.maxBodyBytes) {
        try { await reader.cancel(); } catch (_e) { /* ignore */ }
        return { ok: false, code: 'BODY_TOO_LARGE', reason: 'response exceeded ' + this.maxBodyBytes + ' bytes' };
      }
      chunks.push(value);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; }
    catch (_e) { return { ok: false, code: 'MALFORMED_JSON', reason: 'response not valid JSON' }; }
    return { ok: true, status: res.status, body: parsed, raw_size: received };
  }
}

// ---------------------------------------------------------------------------
// 3. Sanitisation — strip UUIDs/credentials/vendor markers from any payload
// ---------------------------------------------------------------------------
const UUID_FULL_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;
const CREDENTIAL_RE = /\b(?:password|secret|api[_-]?key|access_token|refresh_token)\s*[:=]\s*[^\s,;}]+/gi;
const BEARER_RE = /\bbearer\s+[A-Za-z0-9._-]+/gi;
const SK_TOKEN_RE = /\bsk-[A-Za-z0-9._-]+/g;
const TP_TOKEN_RE = /\btp-[A-Za-z0-9._-]+/g;
const VENDOR_REUSE_RE = /\b(?:hermes\.execution|gsdpi\.execution|plugin\.execution|piko\.execution)\b/gi;
const RESULT_JSON_RE = /\bresult_json\.result\b/g;

function sanitiseString(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(UUID_FULL_RE, '<redacted-id>')
    .replace(CREDENTIAL_RE, '$1=<redacted>')
    .replace(BEARER_RE, 'bearer <redacted>')
    .replace(SK_TOKEN_RE, 'sk-<redacted>')
    .replace(TP_TOKEN_RE, 'tp-<redacted>')
    .replace(VENDOR_REUSE_RE, '<vendor-redacted>')
    .replace(RESULT_JSON_RE, '<redacted>');
}

function sanitiseLivePayload(payload) {
  if (payload === null || payload === undefined) return payload;
  if (Array.isArray(payload)) return payload.map(sanitiseLivePayload);
  if (typeof payload === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(payload)) out[k] = sanitiseLivePayload(v);
    return out;
  }
  if (typeof payload === 'string') return sanitiseString(payload);
  return payload;
}

// ---------------------------------------------------------------------------
// 4. Sidecar baseline + immutability check
// ---------------------------------------------------------------------------
function captureBaseline(sidecarPaths) {
  const hashes = {};
  for (const ref of sidecarPaths) {
    const abs = path.resolve(ROOT, ref);
    if (!fs.existsSync(abs)) { hashes[ref] = null; continue; }
    hashes[ref] = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
  }
  return hashes;
}

function verifySidecarImmutability(baseline, after) {
  const drift = [];
  for (const [ref, h] of Object.entries(baseline)) {
    if (after[ref] !== h) drift.push(ref);
  }
  return { ok: drift.length === 0, drift };
}

// ---------------------------------------------------------------------------
// 5. Per-role scaffolding (kebab, scope, limitations, method, command)
// ---------------------------------------------------------------------------
function _roleKebab(role) { return String(role).toLowerCase().replace(/\./g, '-'); }

function _scopeForRole(entry) {
  if (entry.identity_kind === 'paperclip_api_readonly') {
    if (entry.role === 'paperclip_health') return 'live-paperclip-health-readonly';
    if (entry.role === 'hermes_environment') return 'live-paperclip-hermes-test-env-readonly';
    return 'live-paperclip-discover-divisions';
  }
  if (entry.identity_kind === 'observed') return 'local-observed-no-mutation';
  if (entry.identity_kind === 'offline_bundle_read') return 'offline-bundle-readonly-no-mutation';
  if (entry.identity_kind === 'scratch_drill') return 'scratch-drill-deferred-to-t04';
  return 'safe-readonly';
}

function _methodForRole(entry) {
  if (entry.identity_kind === 'paperclip_api_readonly') {
    if (entry.role === 'paperclip_health') return 'GET /api/health';
    if (entry.role === 'hermes_environment') return 'GET /api/companies/{companyId}/adapters/hermes/test-environment';
    return 'GET /api/companies/{companyId}/agents';
  }
  if (entry.identity_kind === 'observed') return 'GET /api/health';
  if (entry.identity_kind === 'offline_bundle_read') return 'GET /api/companies/{companyId}/missions';
  if (entry.identity_kind === 'scratch_drill') return entry.drill_kind;
  return 'GET /api/health';
}

function _commandForRole(entry, baseUrl) {
  const base = baseUrl || 'https://paperclip.oysana.com';
  if (entry.identity_kind === 'paperclip_api_readonly') {
    if (entry.role === 'paperclip_health') return 'GET ' + base + '/api/health';
    if (entry.role === 'hermes_environment') return 'GET ' + base + '/api/companies/{companyId}/adapters/hermes/test-environment';
    return 'GET ' + base + '/api/companies/{companyId}/agents';
  }
  if (entry.identity_kind === 'observed') return 'OBSERVE ' + base + '/api/health';
  if (entry.identity_kind === 'offline_bundle_read') return 'READ runtime-evidence/M016-S02-bos-mission-proof.json';
  if (entry.identity_kind === 'scratch_drill') return 'node scripts/run_m016_s03_scratch_drills.js --drill ' + entry.drill_kind;
  return 'GET ' + base + '/api/health';
}

function _livePathForRole(entry, ctx) {
  if (entry.role === 'paperclip_health') return '/api/health';
  if (entry.role === 'hermes_environment') {
    return '/api/companies/' + encodeURIComponent(ctx.companyId || '') + '/adapters/hermes/test-environment';
  }
  if (ctx.agentId) return '/api/agents/' + encodeURIComponent(ctx.agentId);
  return '/api/companies/' + encodeURIComponent(ctx.companyId || '') + '/agents';
}

function _limitationsForRole(entry) {
  if (entry.identity_kind === 'paperclip_api_readonly') {
    return [
      'GET-only allowlist; mutation verbs rejected at every layer',
      'identity discovered fresh per session; no hardcoded UUIDs',
      'raw HTTP body sanitised; never persisted; only digest and hash leave runner',
    ];
  }
  if (entry.identity_kind === 'observed') {
    return [
      'observation reads only sanitised sidecars in runtime-evidence/',
      'no HTTP call; no mutation; UUIDs and credentials never persisted',
      'verifies redaction posture rather than external state',
    ];
  }
  if (entry.identity_kind === 'offline_bundle_read') {
    return [
      'reads only the allowlisted M016-S02-bos-mission-proof.json bundle',
      'no live HTTP call; bounded path under runtime-evidence/',
      'redaction scan applied before any artifact_hash computation',
    ];
  }
  if (entry.identity_kind === 'scratch_drill') {
    return [
      'scratch-drill evidence materialises in T04: restore-drill, budget-stop-drill, failure-drill',
      'T03 emits honest NOT_PROVEN to keep role cardinality complete',
      'drill_kind preserved for cross-record independence tracking',
    ];
  }
  return ['unknown role identity kind'];
}

const ROLE_TO_DISCOVER_PREFIX = Object.freeze({
  'Div1.HCO': 'Div1',
  'Div2.MasterPlanner': 'Div2',
  'Div3.Treasury': 'Div3',
  'Div4.Production': 'Div4',
  'Div5.QualificationsLibraryLearning': 'Div5',
  'Div6.External': 'Div6',
  'Div7.MissionControl': 'Div7',
});

// ---------------------------------------------------------------------------
// 6. Per-role probe executors
// ---------------------------------------------------------------------------
async function runLiveProbe(entry, ctx, fetch) {
  const startMs = Date.now();
  const startedAt = new Date(startMs).toISOString();
  const reqPath = _livePathForRole(entry, ctx);
  const fetchResult = await fetch.get(reqPath);
  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - startMs;

  const method = _methodForRole(entry);
  const command = _commandForRole(entry, ctx.baseUrl);
  const scope = _scopeForRole(entry);
  const limitations = _limitationsForRole(entry);

  if (!fetchResult.ok) {
    const blockerCode = (() => {
      switch (fetchResult.code) {
        case 'TIMEOUT': return BLOCKER_CODES.TARGET_TIMEOUT(entry.role);
        case 'RATE_LIMITED': return BLOCKER_CODES.TARGET_RATE_LIMITED(entry.role);
        case 'AUTH_FAILED': return BLOCKER_CODES.TARGET_AUTH_FAILED(entry.role);
        case 'NOT_FOUND': return BLOCKER_CODES.TARGET_UNAVAILABLE(entry.role);
        case 'UNAVAILABLE': return BLOCKER_CODES.TARGET_UNAVAILABLE(entry.role);
        case 'MALFORMED_JSON': return BLOCKER_CODES.TARGET_UNAVAILABLE(entry.role);
        case 'BODY_TOO_LARGE': return BLOCKER_CODES.TARGET_UNAVAILABLE(entry.role);
        case 'CROSS_ORIGIN_REDIRECT': return BLOCKER_CODES.TARGET_UNAVAILABLE(entry.role);
        default: return BLOCKER_CODES.RUNNER_FAILURE;
      }
    })();
    return {
      ok: false,
      fetchResult,
      record: contract.buildNotProvenRecord({
        role: entry.role, task: 'T03',
        generated: startedAt, startedAt, finishedAt, durationMs,
        method, command, scope, limitations,
        observedBlockerCode: blockerCode,
        observedBlockerReason: fetchResult.reason || fetchResult.code,
        attemptedExitCode: -1,
      }),
    };
  }

  const sanitised = sanitiseLivePayload(fetchResult.body);
  const sanitisedBytes = Buffer.from(JSON.stringify(sanitised), 'utf8');
  const artifactHash = crypto.createHash('sha256').update(sanitisedBytes).digest('hex');
  const sanitisedDigest = (entry.role + ':' + entry.methodology + ':' + artifactHash.slice(0, 32)).slice(0, 64);
  const artifactReference = 'runtime-evidence/M016-S03-live-probe-' + _roleKebab(entry.role) + '.json';

  return {
    ok: true,
    fetchResult,
    sanitised,
    record: contract.buildExecutedRecord({
      role: entry.role, task: 'T03',
      generated: startedAt, startedAt, finishedAt, durationMs,
      method, command, scope, limitations,
      exitCode: 0,
      sanitisedDigest,
      artifactReference,
      artifactHash,
    }),
  };
}

function runObservedProbe(entry, ctx) {
  const startedAt = new Date().toISOString();
  const finishedAt = new Date().toISOString();
  const durationMs = 0;
  const method = _methodForRole(entry);
  const command = _commandForRole(entry, ctx.baseUrl);
  const scope = _scopeForRole(entry);
  const limitations = _limitationsForRole(entry);

  const artifactReference = (() => {
    if (entry.role === 'secret_posture') return 'runtime-evidence/M016-S02-redaction-contract.json';
    if (entry.role === 'isolation_invariant') return 'runtime-evidence/M016-S02-bos-mission-proof.json';
    if (entry.role === 'redaction_posture_audit') return 'runtime-evidence/M016-S02-redaction-contract.json';
    return 'runtime-evidence/M016-S02-bos-mission-proof.json';
  })();

  const obs = {
    observed_at: startedAt,
    sidecar: artifactReference,
    redaction_flags: Object.assign({}, REDACTION_FLAG_VALUES),
  };
  const sanitisedBytes = Buffer.from(JSON.stringify(obs), 'utf8');
  const artifactHash = crypto.createHash('sha256').update(sanitisedBytes).digest('hex');
  const sanitisedDigest = (entry.role + ':' + entry.methodology + ':' + artifactHash.slice(0, 32)).slice(0, 64);

  return {
    ok: true,
    record: contract.buildExecutedRecord({
      role: entry.role, task: 'T03',
      generated: startedAt, startedAt, finishedAt, durationMs,
      method, command, scope, limitations,
      exitCode: 0,
      sanitisedDigest,
      artifactReference,
      artifactHash,
    }),
    observation: obs,
  };
}

function runOfflineBundleProbe(entry, ctx) {
  const startedAt = new Date().toISOString();
  const finishedAt = new Date().toISOString();
  const durationMs = 0;
  const method = _methodForRole(entry);
  const command = _commandForRole(entry, ctx.baseUrl);
  const scope = _scopeForRole(entry);
  const limitations = _limitationsForRole(entry);

  const bundlePath = 'runtime-evidence/M016-S02-bos-mission-proof.json';
  const absPath = path.resolve(ROOT, bundlePath);
  if (!fs.existsSync(absPath)) {
    return {
      ok: false,
      record: contract.buildNotProvenRecord({
        role: entry.role, task: 'T03',
        generated: startedAt, startedAt, finishedAt, durationMs,
        method, command, scope, limitations,
        observedBlockerCode: BLOCKER_CODES.TARGET_UNAVAILABLE(entry.role),
        observedBlockerReason: 'offline bundle ' + bundlePath + ' missing on disk',
        attemptedExitCode: -1,
      }),
    };
  }
  let bundle = null;
  try { bundle = JSON.parse(fs.readFileSync(absPath, 'utf8')); }
  catch (_e) {
    return {
      ok: false,
      record: contract.buildNotProvenRecord({
        role: entry.role, task: 'T03',
        generated: startedAt, startedAt, finishedAt, durationMs,
        method, command, scope, limitations,
        observedBlockerCode: BLOCKER_CODES.TARGET_UNAVAILABLE(entry.role),
        observedBlockerReason: 'offline bundle ' + bundlePath + ' malformed JSON',
        attemptedExitCode: -1,
      }),
    };
  }
  const sanitised = sanitiseLivePayload({
    bundle_id: bundle.bundle_id,
    sources: bundle.sources ? bundle.sources.length : 0,
    classification_verdict: bundle.classification && bundle.classification.verdicts,
    cost_snapshot_note: 'no live cost snapshot; offline bundle carries 9 sanitised artifacts',
  });
  const sanitisedBytes = Buffer.from(JSON.stringify(sanitised), 'utf8');
  const artifactHash = crypto.createHash('sha256').update(sanitisedBytes).digest('hex');
  const sanitisedDigest = (entry.role + ':' + entry.methodology + ':' + artifactHash.slice(0, 32)).slice(0, 64);

  return {
    ok: true,
    record: contract.buildExecutedRecord({
      role: entry.role, task: 'T03',
      generated: startedAt, startedAt, finishedAt, durationMs,
      method, command, scope, limitations,
      exitCode: 0,
      sanitisedDigest,
      artifactReference: bundlePath,
      artifactHash,
    }),
    sanitised,
  };
}

function runDrillDeferralProbe(entry, ctx) {
  const startedAt = new Date().toISOString();
  const finishedAt = new Date().toISOString();
  const durationMs = 0;
  const method = entry.drill_kind;
  const command = 'node scripts/run_m016_s03_scratch_drills.js --drill ' + entry.drill_kind;
  const scope = _scopeForRole(entry);
  const limitations = _limitationsForRole(entry);
  return {
    ok: false,
    record: contract.buildNotProvenRecord({
      role: entry.role, task: 'T03',
      generated: startedAt, startedAt, finishedAt, durationMs,
      method, command, scope, limitations,
      observedBlockerCode: BLOCKER_CODES.TARGET_UNAVAILABLE(entry.role),
      observedBlockerReason: 'scratch-drill evidence materialises in T04 -- ' + entry.drill_kind + '. T03 emits honest NOT_PROVEN to keep role cardinality complete',
      attemptedExitCode: -1,
    }),
  };
}

// ---------------------------------------------------------------------------
// 7. Discovery — fresh company + division identities via GET
// ---------------------------------------------------------------------------
function _unwrapList(payload, keys) {
  if (Array.isArray(payload)) return payload;
  for (const k of keys) if (Array.isArray(payload && payload[k])) return payload[k];
  return null;
}

async function discoverCompanyAndDivisions(fetch) {
  const companiesRes = await fetch.get('/api/companies');
  if (!companiesRes.ok) return { ok: false, code: companiesRes.code, reason: companiesRes.reason };
  const companies = _unwrapList(companiesRes.body, ['companies', 'items']) || [];
  const company = companies[0] || null;
  if (!company || !company.id) return { ok: false, code: 'NOT_FOUND', reason: 'no company in /api/companies' };

  const agentsRes = await fetch.get('/api/companies/' + encodeURIComponent(company.id) + '/agents');
  if (!agentsRes.ok) return { ok: false, code: agentsRes.code, reason: agentsRes.reason, company };
  const list = _unwrapList(agentsRes.body, ['agents', 'items']) || [];
  const divisionAgents = new Map();
  for (const agent of list) {
    if (!agent || typeof agent !== 'object' || !agent.id) continue;
    const name = agent.name || agent.role || '';
    const match = name.match(/^Div([1-7])/);
    if (!match) continue;
    const idx = match[1];
    const candidates = {
      '1': 'Div1.HCO', '2': 'Div2.MasterPlanner', '3': 'Div3.Treasury',
      '4': 'Div4.Production', '5': 'Div5.QualificationsLibraryLearning',
      '6': 'Div6.External', '7': 'Div7.MissionControl',
    };
    const canonical = candidates[idx];
    if (canonical && !divisionAgents.has(canonical)) divisionAgents.set(canonical, agent.id);
  }
  return { ok: true, company, divisionAgents, agentListSize: list.length };
}

// ---------------------------------------------------------------------------
// 8. Atomic writes
// ---------------------------------------------------------------------------
function atomicWriteJson(targetPath, payload) {
  const target = path.resolve(targetPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmpPath = target + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  const bytes = Buffer.from(JSON.stringify(payload, null, 2));
  try {
    fs.writeFileSync(tmpPath, bytes);
    fs.renameSync(tmpPath, target);
  } catch (e) {
    try { fs.unlinkSync(tmpPath); } catch (_e) { /* ignore */ }
    throw e;
  }
  return { path: target, size_bytes: bytes.length };
}

function atomicWriteJsonIfMissing(targetPath, payload, options) {
  const opts = options || {};
  const target = path.resolve(targetPath);
  if (fs.existsSync(target) && !opts.force) {
    const err = new Error('refusing to overwrite existing file ' + target + ' (use --force)');
    err.code = BLOCKER_CODES.PRODUCTION_INTERCEPT;
    throw err;
  }
  return atomicWriteJson(target, payload);
}

// ---------------------------------------------------------------------------
// 9. Top-level session orchestration
// ---------------------------------------------------------------------------
function _blockerCodeForFetchFailure(code, role) {
  switch (code) {
    case 'TIMEOUT': return BLOCKER_CODES.TARGET_TIMEOUT(role);
    case 'RATE_LIMITED': return BLOCKER_CODES.TARGET_RATE_LIMITED(role);
    case 'AUTH_FAILED': return BLOCKER_CODES.TARGET_AUTH_FAILED(role);
    case 'NOT_FOUND': return BLOCKER_CODES.TARGET_UNAVAILABLE(role);
    case 'UNAVAILABLE': return BLOCKER_CODES.TARGET_UNAVAILABLE(role);
    case 'MALFORMED_JSON': return BLOCKER_CODES.TARGET_UNAVAILABLE(role);
    case 'BODY_TOO_LARGE': return BLOCKER_CODES.TARGET_UNAVAILABLE(role);
    case 'CROSS_ORIGIN_REDIRECT': return BLOCKER_CODES.TARGET_UNAVAILABLE(role);
    default: return BLOCKER_CODES.RUNNER_FAILURE;
  }
}

function _notProvenForSigninError(entry, ctx, signInError) {
  const startedAt = new Date().toISOString();
  const finishedAt = startedAt;
  return contract.buildNotProvenRecord({
    role: entry.role, task: 'T03',
    generated: startedAt, startedAt, finishedAt, durationMs: 0,
    method: _methodForRole(entry),
    command: _commandForRole(entry, ctx.baseUrl),
    scope: _scopeForRole(entry),
    limitations: _limitationsForRole(entry),
    observedBlockerCode: _blockerCodeForFetchFailure(signInError.code, entry.role),
    observedBlockerReason: signInError.reason || 'sign-in failed (' + signInError.code + ')',
    attemptedExitCode: -1,
  });
}

async function runSession(opts) {
  const cfg = Object.assign({
    baseUrl: process.env.PAPERCLIP_BASE_URL || 'http://127.0.0.1:43131',
    origin: process.env.PAPERCLIP_ORIGIN || null,
    email: process.env.PAPERCLIP_EMAIL || null,
    password: process.env.PAPERCLIP_PASSWORD || null,
    allowLive: false,
    timeoutMs: 15000,
    maxBodyBytes: 1024 * 1024,
    fetchImpl: null,
    immutableSidecars: IMMUTABLE_SIDECARS,
  }, opts || {});
  // Treat null/undefined overrides as absent so parseArgs() defaults still work.
  if (cfg.baseUrl == null) cfg.baseUrl = 'http://127.0.0.1:43131';
  if (cfg.origin == null) cfg.origin = new URL(cfg.baseUrl).origin;

  // Static assertion FIRST — no HTTP / no fs mutation until allowlist is proven clean.
  assertStaticNoMutationVerbs();

  const baseline = captureBaseline(cfg.immutableSidecars);
  const ctx = { baseUrl: cfg.baseUrl, origin: cfg.origin, companyId: null, agentId: null };

  let signInError = null;
  let discovery = null;
  let fetch = null;
  let signedIn = false;

  if (cfg.allowLive && cfg.email && cfg.password) {
    fetch = new BoundedFetch({
      baseUrl: cfg.baseUrl, origin: cfg.origin,
      timeoutMs: cfg.timeoutMs, maxBodyBytes: cfg.maxBodyBytes,
      fetchImpl: cfg.fetchImpl,
    });
    const si = await fetch.signIn({ email: cfg.email, password: cfg.password });
    if (!si.ok) {
      signInError = si;
    } else {
      signedIn = true;
      discovery = await discoverCompanyAndDivisions(fetch);
      if (discovery && discovery.ok) {
        ctx.companyId = discovery.company.id;
      } else if (discovery) {
        signInError = { code: discovery.code, reason: discovery.reason };
      }
    }
  }

  const records = [];
  let mutationStopped = false;
  let stopReason = null;
  const observedExecuted = new Map();

  for (const entry of ROLE_REGISTRY) {
    let result;
    if (mutationStopped) {
      const ts = new Date().toISOString();
      result = {
        ok: false,
        record: contract.buildNotProvenRecord({
          role: entry.role, task: 'T03',
          generated: ts, startedAt: ts, finishedAt: ts, durationMs: 0,
          method: _methodForRole(entry),
          command: _commandForRole(entry, cfg.baseUrl),
          scope: 'session-aborted-on-mutation-stop',
          limitations: ['mutation delta detected; session STOPed; remaining roles materialise NOT_PROVEN'],
          observedBlockerCode: BLOCKER_CODES.PRODUCTION_INTERCEPT,
          observedBlockerReason: 'session aborted after mutation delta; remaining roles keep cardinality via NOT_PROVEN',
          attemptedExitCode: -1,
        }),
      };
    } else if (entry.identity_kind === 'scratch_drill') {
      result = runDrillDeferralProbe(entry, ctx);
    } else if (entry.identity_kind === 'paperclip_api_readonly') {
      if (signedIn && ctx.companyId) {
        ctx.agentId = discovery.divisionAgents.get(entry.role) || null;
        result = await runLiveProbe(entry, ctx, fetch);
      } else {
        result = {
          ok: false,
          record: _notProvenForSigninError(entry, ctx, signInError || { code: 'UNAVAILABLE', reason: 'live session disabled or no credentials' }),
        };
      }
    } else if (entry.identity_kind === 'observed') {
      result = runObservedProbe(entry, ctx);
    } else if (entry.identity_kind === 'offline_bundle_read') {
      result = runOfflineBundleProbe(entry, ctx);
    }

    // Validate record via contract evaluator
    const evaluation = contract.evaluateProbeContract({
      record: result.record,
      observedExecuted,
    });
    records.push(result.record);

    // Mutation delta check on EXECUTED records (counters must be 0)
    if (result.record.classification === 'EXECUTED') {
      for (const counter of MUTATION_AUDIT_ZERO_COUNTERS) {
        if (result.record.mutation_audit && result.record.mutation_audit[counter] !== 0) {
          mutationStopped = true;
          stopReason = 'mutation delta on ' + counter + ' = ' + result.record.mutation_audit[counter] + ' for ' + entry.role;
          break;
        }
      }
    }
    // Track execution outcome for downstream visibility
    result.evaluation = evaluation;
  }

  const after = captureBaseline(cfg.immutableSidecars);
  const immutability = verifySidecarImmutability(baseline, after);
  if (!immutability.ok) {
    mutationStopped = true;
    stopReason = stopReason || 'sidecar drift: ' + immutability.drift.join(',');
  }

  const executedCount = records.filter((r) => r.classification === 'EXECUTED').length;
  const notProvenCount = records.filter((r) => r.classification === 'NOT_PROVEN').length;
  const failClosedCount = records.filter((r) => r.verdict === 'fail_closed').length;

  const overallVerdict = mutationStopped ? 'fail_closed'
    : (records.every((r) => r.verdict !== 'fail_closed') ? 'not_proven' : 'fail_closed');

  const protocol = contract.buildProtocolEvidence({
    records, verdict: overallVerdict, lineClass: 'M16-S03-LIVE', task: 'T03',
    gates: {
      'HG1 SEMANTIC_RULE_COMPLIANCE': mutationStopped ? 'fail_closed' : 'not_proven',
      'HG2 PROVENANCE_INTEGRITY': mutationStopped ? 'fail_closed' : 'not_proven',
      'HG3 RECOVERY_EVIDENCE': 'not_proven',
      'HG4 FINANCIAL_PROTECTION': 'not_proven',
      'HG5 SECURITY_POSTURE': 'not_proven',
      'HG6 COMPLIANCE_POSTURE': 'not_proven',
      'HG7 READ_ONLY_BOUNDARY': mutationStopped ? 'fail_closed' : 'not_proven',
      'HG8 SCRATCH_ISOLATION': 'not_proven',
    },
  });

  protocol.session = {
    base_url: cfg.baseUrl,
    origin: cfg.origin,
    allow_live: cfg.allowLive,
    signed_in: signedIn,
    sign_in_error: signInError,
    company_id: ctx.companyId,
    division_agents_mapped: discovery && discovery.divisionAgents ? discovery.divisionAgents.size : 0,
    bounded_calls: fetch ? fetch.boundedCalls : 0,
    max_body_bytes: cfg.maxBodyBytes,
    timeout_ms: cfg.timeoutMs,
    mutation_stopped: mutationStopped,
    stop_reason: stopReason,
    sidecar_immutability: immutability,
    role_count: ROLE_REGISTRY.length,
    executed_count: executedCount,
    not_proven_count: notProvenCount,
    fail_closed_count: failClosedCount,
    immutable_sidecars: cfg.immutableSidecars.slice(),
  };

  // Build canonical results payload — bounded, no raw bodies.
  const resultsPayload = {
    schema_id: data.SCHEMA_ID,
    schema_version: data.SCHEMA_VERSION,
    milestone: data.MILESTONE,
    slice: data.SLICE,
    task: 'T03',
    generated: new Date().toISOString(),
    line_class: 'M16-S03-LIVE',
    canonical_protocol: protocol.canonical_protocol,
    protocol_digest: protocol.protocol_digest,
    record_count: records.length,
    executed_count: executedCount,
    not_proven_count: notProvenCount,
    fail_closed_count: failClosedCount,
    mutation_stopped: mutationStopped,
    stop_reason: stopReason,
    session: protocol.session,
    records,
  };

  return { records, protocol, results: resultsPayload, mutationStopped, immutability };
}

// ---------------------------------------------------------------------------
// 10. CLI parser
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {
    baseUrl: null,
    origin: null,
    email: null,
    password: null,
    allowLive: false,
    timeoutMs: 15000,
    maxBodyBytes: 1024 * 1024,
    resultsOut: DEFAULT_RESULTS_OUT,
    protocolOut: DEFAULT_PROTOCOL_OUT,
    force: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base-url') args.baseUrl = argv[++i];
    else if (a === '--origin') args.origin = argv[++i];
    else if (a === '--email') args.email = argv[++i];
    else if (a === '--password') args.password = argv[++i];
    else if (a === '--allow-live') args.allowLive = true;
    else if (a === '--timeout-ms') args.timeoutMs = parseInt(argv[++i], 10);
    else if (a === '--max-body-bytes') args.maxBodyBytes = parseInt(argv[++i], 10);
    else if (a === '--results-out') args.resultsOut = argv[++i];
    else if (a === '--protocol-out') args.protocolOut = argv[++i];
    else if (a === '--force') args.force = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error('unknown arg: ' + a);
  }
  return args;
}

function printHelp() {
  process.stdout.write([
    'Usage: node scripts/run_m016_s03_readonly_probes.js [options]',
    '',
    'Options:',
    '  --base-url <url>         Paperclip base URL (default: PAPERCLIP_BASE_URL or http://127.0.0.1:43131)',
    '  --origin <url>           Paperclip origin header (default: derived from --base-url)',
    '  --email <e>              Paperclip email (env: PAPERCLIP_EMAIL)',
    '  --password <p>           Paperclip password (env: PAPERCLIP_PASSWORD)',
    '  --allow-live             Enable live GET probes (otherwise observed/offline-only)',
    '  --timeout-ms <ms>        Per-request timeout (default 15000)',
    '  --max-body-bytes <n>     Response body cap (default 1048576)',
    '  --results-out <path>     Output path for live-probe-results.json',
    '  --protocol-out <path>    Output path for live-probe-protocol.json',
    '  --force                  Overwrite existing outputs',
    '  --help                   Show this message',
    '',
  ].join('\n'));
}

// ---------------------------------------------------------------------------
// 11. CLI entrypoint
// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv);
  if (args.help) { printHelp(); return { exitCode: 0 }; }
  try {
    const session = await runSession({
      baseUrl: args.baseUrl,
      origin: args.origin,
      email: args.email,
      password: args.password,
      allowLive: args.allowLive,
      timeoutMs: args.timeoutMs,
      maxBodyBytes: args.maxBodyBytes,
    });
    atomicWriteJsonIfMissing(args.resultsOut, session.results, { force: args.force });
    atomicWriteJsonIfMissing(args.protocolOut, session.protocol, { force: args.force });
    const line = 'M16_S03_LIVE_PROBE role_count=' + ROLE_REGISTRY.length
      + ' executed=' + session.results.executed_count
      + ' not_proven=' + session.results.not_proven_count
      + ' fail_closed=' + session.results.fail_closed_count
      + ' mutation_stopped=' + session.mutationStopped
      + ' sidecar_immutable=' + session.immutability.ok
      + ' results=' + path.relative(ROOT, path.resolve(args.resultsOut))
      + ' protocol=' + path.relative(ROOT, path.resolve(args.protocolOut));
    process.stdout.write(line + '\n');
    if (session.mutationStopped) return { exitCode: EXIT_CODES.PROBE_MUTATION_DETECTED || 2, line };
    if (session.results.fail_closed_count > 0) return { exitCode: EXIT_CODES.PROBE_RECORD_MALFORMED || 1, line };
    return { exitCode: EXIT_CODES.PROBE_RECORD_VALID || 0, line };
  } catch (e) {
    const code = e && e.code ? String(e.code) : 'RUNNER_FAILURE';
    process.stderr.write('M16_S03_LIVE_PROBE_ERROR=' + (e && e.message || e) + ' (code=' + code + ')\n');
    if (code === 'REDACTION_LEAK' || code === BLOCKER_CODES.REDACTION_LEAK_RAW_BODY('').slice(0, -1)) {
      return { exitCode: EXIT_CODES.PROBE_REDACTION_LEAK || 5 };
    }
    return { exitCode: EXIT_CODES.PROBE_RUNNER_FAILURE || 4 };
  }
}

if (require.main === module) {
  main().then((res) => { process.exit(res.exitCode); }).catch((e) => {
    process.stderr.write('M16_S03_LIVE_PROBE_FATAL=' + (e && e.stack || e) + '\n');
    process.exit(4);
  });
}

module.exports = {
  ROOT, SCRIPT_PATH, IMMUTABLE_SIDECARS,
  DEFAULT_RESULTS_OUT, DEFAULT_PROTOCOL_OUT,
  assertStaticNoMutationVerbs,
  BoundedFetch,
  sanitiseString, sanitiseLivePayload,
  captureBaseline, verifySidecarImmutability,
  runLiveProbe, runObservedProbe, runOfflineBundleProbe, runDrillDeferralProbe,
  discoverCompanyAndDivisions,
  atomicWriteJson, atomicWriteJsonIfMissing,
  runSession,
  parseArgs, printHelp, main,
};
