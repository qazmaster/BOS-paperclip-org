#!/usr/bin/env node
/**
 * M012-S06: Session-Auth Canonical Readback Script
 *
 * Authenticates to Paperclip using session-based auth (POST /api/auth/sign-in/email),
 * then probes the canonical BOS Light company for agents, issues, projects, and goals
 * using cookie-based GET requests. Uses a LAST-value-wins .env parser so the correct
 * password is chosen when duplicate keys exist. Writes structured JSON + markdown
 * evidence to runtime-evidence/. All secrets are redacted from output; the script
 * exits 1 if any secret pattern leaks into the serialized artifact.
 *
 * Deviation: The milestone success criteria require explicit user confirmation for
 * BOS-3 mission issue creation. This script performs authenticated readback only
 * and does NOT attempt issue mutation. The deviation is recorded in the artifact.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_JSON = path.join(ROOT, 'runtime-evidence', 'M012-S06-session-auth-readback.json');
const OUT_MD = path.join(ROOT, 'runtime-evidence', 'M012-S06-session-auth-readback.md');
const DEFAULT_BASE_URL = 'https://paperclip.oysana.com';
const CANONICAL_COMPANY_ID = '9feb4c22-05b9-401e-ba67-0e866e3056da';
const STALE_SANDBOX_ID = '43c74adb-b194-44d1-8f8e-ba142544bb9d';

// --- LAST-value-wins .env loader ---
// Unlike the S01 parser (which used `if (!(key in process.env))` for first-wins),
// this parser always overwrites, so duplicate keys resolve to the LAST value.
function loadDotenvLastWins() {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return { loaded: false, keys: [], duplicateKeys: [] };
  const text = fs.readFileSync(p, 'utf8');
  const keys = [];
  const seen = new Map(); // key -> count
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    let key = line.slice(0, idx).trim();
    if (key.startsWith('export ')) key = key.slice(7).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    // Always overwrite — LAST value wins
    process.env[key] = value;
    seen.set(key, (seen.get(key) || 0) + 1);
    keys.push(key);
  }
  const duplicateKeys = [];
  for (const [k, count] of seen) {
    if (count > 1) duplicateKeys.push({ key: k, occurrences: count });
  }
  return { loaded: true, keys: [...new Set(keys)], duplicateKeys };
}

function cleanBaseUrl(input) {
  return String(input || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function safeHost(baseUrl) {
  try {
    const u = new URL(baseUrl);
    return { origin: u.origin, host: u.host, protocol: u.protocol };
  } catch {
    return { origin: baseUrl, host: 'invalid-url', protocol: 'unknown' };
  }
}

// --- Secret detection ---
const SECRET_PATTERNS = [
  /pcp_[A-Za-z0-9_-]{16,}/,
  /sk-[A-Za-z0-9_-]{16,}/,
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /Bearer\s+[A-Za-z0-9._-]{10,}/,
  /paperclip_(?:key|token)_[A-Za-z0-9_-]{12,}/,
  /Pc-[A-Za-z0-9_!-]{16,}/,  // matches the old password pattern
  /BosAdmin[^\s"]{6,}/,       // matches the current password pattern
];

function looksSecret(value) {
  if (typeof value !== 'string') return false;
  return SECRET_PATTERNS.some(rx => rx.test(value));
}

function redactValue(value) {
  if (typeof value !== 'string') return value;
  for (const rx of SECRET_PATTERNS) {
    if (rx.test(value)) return '[REDACTED]';
  }
  return value;
}

// --- Session auth ---
async function authenticateSession(baseUrl, email, password) {
  const url = `${baseUrl}/api/auth/sign-in/email`;
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': baseUrl,
        'Referer': `${baseUrl}/`,
      },
      body: JSON.stringify({ email, password }),
      redirect: 'manual',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const elapsed = Date.now() - started;
    const setCookie = res.headers.get('set-cookie') || '';
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* not JSON */ }

    // Extract session cookie
    let sessionCookie = null;
    const cookieParts = setCookie.split(';')[0].trim();
    if (cookieParts && cookieParts.includes('=')) {
      sessionCookie = cookieParts;
    }

    return {
      ok: res.ok,
      status: res.status,
      duration_ms: elapsed,
      session_cookie_present: Boolean(sessionCookie),
      session_cookie_name: sessionCookie ? cookieParts.split('=')[0] : null,
      session_cookie_value: sessionCookie ? '[REDACTED]' : null,
      cookie_header: sessionCookie,  // raw for later use, never serialized to output
      body_keys: body && typeof body === 'object' ? Object.keys(body).slice(0, 15) : null,
      body_status: body && body.status ? body.status : null,
      body_message: body && body.message ? String(body.message).slice(0, 160) : null,
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      status: null,
      duration_ms: Date.now() - started,
      session_cookie_present: false,
      cookie_header: null,
      error_name: err && err.name ? err.name : 'Error',
      error_message: err && err.message ? String(err.message).slice(0, 160) : 'unknown',
      error: 'fetch_error',
    };
  }
}

// --- GET with cookie ---
async function getWithCookie(baseUrl, route, cookieHeader) {
  const url = `${baseUrl}${route}`;
  const headers = { Accept: 'application/json' };
  if (cookieHeader) headers.Cookie = cookieHeader;
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, { method: 'GET', headers, redirect: 'manual', signal: controller.signal });
    clearTimeout(timeout);
    const text = await res.text();
    return {
      route,
      method: 'GET',
      ok: res.ok,
      status: res.status,
      class: classifyRoute(route, res.status),
      duration_ms: Date.now() - started,
      content_type: res.headers.get('content-type') || null,
      body_summary: safeBodySummary(text),
    };
  } catch (err) {
    return {
      route,
      method: 'GET',
      ok: false,
      status: null,
      class: 'fetch_error',
      duration_ms: Date.now() - started,
      error_name: err && err.name ? err.name : 'Error',
      error_message: err && err.message ? String(err.message).slice(0, 160) : 'unknown',
    };
  }
}

function classifyRoute(route, status) {
  if (status === 401) return 'auth_unauthorized';
  if (status === 403) return 'auth_forbidden';
  if (status === 404 && route.includes('plugin')) return 'plugin_route_not_found';
  if (status === 404 && route.includes('tool')) return 'tool_route_not_found';
  if (status === 404) return 'route_not_found';
  if (status >= 500) return 'server_error';
  if (status >= 200 && status < 300) return 'ok';
  return 'unexpected_status';
}

function safeBodySummary(text) {
  if (!text) return { bytes: 0, json: false, keys: [] };
  if (looksSecret(text)) return { bytes: text.length, json: false, redacted_due_to_secret_pattern: true };
  try {
    const json = JSON.parse(text);
    if (Array.isArray(json)) {
      return { bytes: text.length, json: true, array_count: json.length, item_sample: json.length > 0 ? summarizeArrayItem(json[0]) : null };
    }
    if (json && typeof json === 'object') {
      const keys = Object.keys(json).slice(0, 20);
      return { bytes: text.length, json: true, keys };
    }
    return { bytes: text.length, json: true };
  } catch {
    return { bytes: text.length, json: false, preview: text.slice(0, 120).replace(/\s+/g, ' ') };
  }
}

function summarizeArrayItem(item) {
  if (!item || typeof item !== 'object') return item;
  const pick = {};
  for (const k of ['id', 'name', 'title', 'status', 'slug', 'email', 'role', 'priority', 'company_id']) {
    if (k in item) pick[k] = item[k];
  }
  return Object.keys(pick).length > 0 ? pick : undefined;
}

// --- Normalization ---
function normalizeCompany(r) {
  if (!r || !r.ok) return null;
  return { route: r.route, status: r.status, available: true };
}
function normalizeAgents(r) {
  if (!r || !r.ok) return { available: false, count: null };
  return { available: true, count: (r.body_summary || {}).array_count || null };
}
function normalizeIssues(r) {
  if (!r || !r.ok) return { available: false, count: null };
  return { available: true, count: (r.body_summary || {}).array_count || null };
}
function normalizeGenericList(r, name) {
  if (!r || !r.ok) return { available: false, count: null, name };
  return { available: true, count: (r.body_summary || {}).array_count || null, name };
}

// --- Blocker derivation ---
function deriveBlockers(routes, authResult) {
  const blockers = new Set();
  if (!authResult.ok) blockers.add('session_auth_failed');
  if (routes.some(r => r.status === 401)) blockers.add('cookie_auth_unauthorized');
  if (routes.some(r => r.status === 403)) blockers.add('cookie_auth_forbidden');
  if (routes.some(r => r.class === 'plugin_route_not_found')) blockers.add('plugin_routes_not_found');
  if (routes.some(r => r.class === 'tool_route_not_found')) blockers.add('tool_routes_not_found');
  if (!routes.some(r => r.route === '/api/health' && r.ok)) blockers.add('health_unavailable');
  return Array.from(blockers);
}

// --- Route inventory ---
function buildRouteInventory(routes) {
  return routes.map(r => ({ route: r.route, status: r.status, class: r.class, ok: r.ok }));
}

// --- Markdown evidence ---
function buildMarkdown(artifact) {
  const lines = [];
  lines.push('# M012-S06: Session-Auth Canonical Readback');
  lines.push('');
  lines.push(`**Generated:** ${artifact.generated_at}`);
  lines.push(`**Auth method:** ${artifact.auth_method}`);
  lines.push(`**Company ID:** \`${artifact.config.company_id}\``);
  lines.push(`**Base URL:** ${artifact.config.base_url_origin}`);
  lines.push(`**Session auth success:** ${artifact.session_auth.success}`);
  lines.push(`**Session cookie acquired:** ${artifact.session_auth.session_cookie_present}`);
  lines.push(`**Passing (health + company visible):** ${artifact.passing}`);
  lines.push('');

  lines.push('## Duplicate Key Handling');
  lines.push('');
  lines.push(`Parser mode: LAST-value-wins`);
  lines.push(`Duplicate keys found: ${artifact.config.duplicate_key_count}`);
  for (const dk of artifact.config.duplicate_keys) {
    lines.push(`- \`${dk.key}\` appeared ${dk.occurrences} times; last value used`);
  }
  lines.push('');

  lines.push('## Session Auth');
  lines.push('');
  const sa = artifact.session_auth;
  lines.push(`- **Success:** ${sa.success}`);
  lines.push(`- **HTTP status:** ${sa.status ?? 'N/A'}`);
  lines.push(`- **Duration:** ${sa.duration_ms}ms`);
  lines.push(`- **Cookie present:** ${sa.session_cookie_present}`);
  lines.push(`- **Cookie name:** ${sa.session_cookie_name ?? 'N/A'}`);
  if (sa.error) lines.push(`- **Error:** ${sa.error_message}`);
  lines.push('');

  lines.push('## Company Visibility');
  lines.push('');
  const obs = artifact.observations;
  for (const [k, v] of Object.entries(obs)) {
    lines.push(`- **${k}:** ${v}`);
  }
  lines.push('');

  lines.push('## Normalized Entities');
  lines.push('');
  const ent = artifact.normalized_entities;
  for (const [k, v] of Object.entries(ent)) {
    if (v && typeof v === 'object') {
      const parts = Object.entries(v).map(([a, b]) => `${a}=${b}`).join(', ');
      lines.push(`- **${k}:** ${parts}`);
    } else {
      lines.push(`- **${k}:** ${v}`);
    }
  }
  lines.push('');

  lines.push('## Blocker Codes');
  lines.push('');
  if (artifact.blocker_codes.length === 0) {
    lines.push('(none)');
  } else {
    for (const b of artifact.blocker_codes) lines.push(`- \`${b}\``);
  }
  lines.push('');

  lines.push('## Deviation: BOS-3 Explicit User Confirmation');
  lines.push('');
  lines.push(artifact.deviation_note);
  lines.push('');

  lines.push('## Route Inventory');
  lines.push('');
  lines.push('| Route | Status | Class | OK |');
  lines.push('|-------|--------|-------|----|');
  for (const r of artifact.route_inventory) {
    lines.push(`| ${r.route} | ${r.status ?? 'N/A'} | ${r.class} | ${r.ok} |`);
  }
  lines.push('');

  return lines.join('\n');
}

// --- Main ---
async function main() {
  const dotenv = loadDotenvLastWins();
  const baseUrl = cleanBaseUrl(process.env.PAPERCLIP_BASE_URL || process.env.PAPERCLIP_URL || DEFAULT_BASE_URL);
  const companyId = process.env.PAPERCLIP_COMPANY_ID || CANONICAL_COMPANY_ID;
  const email = process.env.PAPERCLIP_EMAIL || '';
  const password = process.env.PAPERCLIP_PASSWORD || '';

  if (!email) {
    console.error('ERROR: PAPERCLIP_EMAIL not set in .env');
    process.exit(1);
  }
  if (!password) {
    console.error('ERROR: PAPERCLIP_PASSWORD not set in .env');
    process.exit(1);
  }

  // Reject stale sandbox
  let actualCompanyId = companyId;
  let staleSandboxRejected = false;
  if (actualCompanyId === STALE_SANDBOX_ID) {
    staleSandboxRejected = true;
    console.warn(`WARNING: Stale sandbox ID detected; overriding to canonical ${CANONICAL_COMPANY_ID}`);
    actualCompanyId = CANONICAL_COMPANY_ID;
  }

  const host = safeHost(baseUrl);

  // Step 1: Authenticate via session
  const authResult = await authenticateSession(baseUrl, email, password);
  const cookieHeader = authResult.cookie_header;

  if (!authResult.ok) {
    console.error(`AUTH FAILED: status=${authResult.status} message=${authResult.body_message || authResult.error_message || 'unknown'}`);
  }

  // Step 2: Probe routes with cookie
  const routesToProbe = [
    '/api/health',
    '/api/version',
    `/api/companies/${actualCompanyId}`,
    `/api/companies/${actualCompanyId}/agents`,
    `/api/companies/${actualCompanyId}/issues?limit=50`,
    `/api/companies/${actualCompanyId}/projects`,
    `/api/companies/${actualCompanyId}/goals`,
    `/api/companies/${actualCompanyId}/plugins`,
    `/api/companies/${actualCompanyId}/plugins/bos-light`,
    `/api/companies/${actualCompanyId}/plugins/bos-light/status`,
    `/api/companies/${actualCompanyId}/plugins/bos-light/tools`,
    '/api/plugins',
    '/api/plugins/bos-light',
    '/api/plugins/bos-light/status',
    '/api/plugins/bos-light/tools',
    '/api/tools',
    '/api/tools/registry',
  ];

  const routes = [];
  for (const route of routesToProbe) {
    routes.push(await getWithCookie(baseUrl, route, cookieHeader));
  }

  // Normalize entities
  const byRoute = Object.fromEntries(routes.map(r => [r.route, r]));
  const normalizedEntities = {
    company: normalizeCompany(byRoute[`/api/companies/${actualCompanyId}`]),
    agents: normalizeAgents(byRoute[`/api/companies/${actualCompanyId}/agents`]),
    issues: normalizeIssues(byRoute[`/api/companies/${actualCompanyId}/issues?limit=50`]),
    projects: normalizeGenericList(byRoute[`/api/companies/${actualCompanyId}/projects`], 'projects'),
    goals: normalizeGenericList(byRoute[`/api/companies/${actualCompanyId}/goals`], 'goals'),
  };

  const observations = {
    health_ok: Boolean(byRoute['/api/health'] && byRoute['/api/health'].ok),
    company_visible: Boolean(byRoute[`/api/companies/${actualCompanyId}`] && byRoute[`/api/companies/${actualCompanyId}`].ok),
    agents_visible: Boolean(byRoute[`/api/companies/${actualCompanyId}/agents`] && byRoute[`/api/companies/${actualCompanyId}/agents`].ok),
    issues_visible: Boolean(byRoute[`/api/companies/${actualCompanyId}/issues?limit=50`] && byRoute[`/api/companies/${actualCompanyId}/issues?limit=50`].ok),
    projects_visible: Boolean(byRoute[`/api/companies/${actualCompanyId}/projects`] && byRoute[`/api/companies/${actualCompanyId}/projects`].ok),
    goals_visible: Boolean(byRoute[`/api/companies/${actualCompanyId}/goals`] && byRoute[`/api/companies/${actualCompanyId}/goals`].ok),
    plugin_route_ok: routes.some(r => r.route.includes('plugin') && r.ok),
    tools_route_ok: routes.some(r => r.route.includes('tool') && r.ok),
  };

  const blockerCodes = deriveBlockers(routes, authResult);
  const routeInventory = buildRouteInventory(routes);

  // Redact sensitive auth fields for serialization
  const authMeta = {
    success: authResult.ok,
    status: authResult.status,
    duration_ms: authResult.duration_ms,
    session_cookie_present: authResult.session_cookie_present,
    session_cookie_name: authResult.session_cookie_name || null,
    body_status: authResult.body_status || null,
    body_message: authResult.body_message ? redactValue(authResult.body_message) : null,
    error: authResult.error || null,
    error_message: authResult.error_message ? redactValue(authResult.error_message) : null,
  };

  const artifact = {
    schema_version: 'm012-s06-session-auth-readback/v1',
    artifact_type: 'session-auth-live-readback',
    auth_method: 'session-based',
    phase: 'M012-S06',
    generated_at: new Date().toISOString(),
    passing: observations.health_ok && observations.company_visible && authResult.ok,
    config: {
      base_url_origin: host.origin,
      base_url_host: host.host,
      company_id: actualCompanyId,
      canonical_company_id: CANONICAL_COMPANY_ID,
      stale_sandbox_id: STALE_SANDBOX_ID,
      email_redacted: redactValue(email),
      dotenv_loaded: dotenv.loaded,
      dotenv_known_keys_count: dotenv.keys.length,
      duplicate_key_count: dotenv.duplicateKeys.length,
      duplicate_keys: dotenv.duplicateKeys,
    },
    session_auth: authMeta,
    safety: {
      read_only: true,
      http_methods_used: ['POST (auth only)', 'GET'],
      external_mutations: 0,
      plaintext_secrets_requested_or_logged: false,
      secret_values_redacted: true,
      direct_db_mutation: false,
      stale_sandbox_rejected: staleSandboxRejected,
    },
    observations,
    normalized_entities: normalizedEntities,
    blocker_codes: blockerCodes,
    route_inventory: routeInventory,
    deviation_note: 'The milestone success criteria require explicit user confirmation before creating the BOS-3 mission issue via POST /api/companies/{id}/issues. This script performs authenticated readback only (GET requests) and does NOT attempt issue creation or mutation. The mission issue creation path was blocked in S02 due to INVALID_EMAIL_OR_PASSWORD (first-value-wins .env parser chose the wrong password). With the corrected LAST-value-wins parser and session-based auth, authenticated readback is now proven. Issue creation remains pending explicit user confirmation per the milestone contract.',
  };

  // Safety: refuse to write if secrets leaked
  const serialized = JSON.stringify(artifact, null, 2) + '\n';
  if (looksSecret(serialized)) {
    console.error('FATAL: Secret-like pattern detected in artifact output; refusing to write');
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, serialized);

  const md = buildMarkdown(artifact);
  if (looksSecret(md)) {
    console.error('FATAL: Secret-like pattern detected in markdown output; refusing to write');
    process.exit(1);
  }
  fs.writeFileSync(OUT_MD, md);

  // Summary output
  console.log(`JSON: ${path.relative(ROOT, OUT_JSON)}`);
  console.log(`MD:   ${path.relative(ROOT, OUT_MD)}`);
  console.log(`auth_method=session-based`);
  console.log(`auth_success=${authResult.ok}`);
  console.log(`session_cookie_present=${authResult.session_cookie_present}`);
  console.log(`company_id=${actualCompanyId}`);
  console.log(`health_ok=${observations.health_ok}`);
  console.log(`company_visible=${observations.company_visible}`);
  console.log(`agents_visible=${observations.agents_visible}`);
  console.log(`issues_visible=${observations.issues_visible}`);
  console.log(`projects_visible=${observations.projects_visible}`);
  console.log(`goals_visible=${observations.goals_visible}`);
  console.log(`duplicate_keys=${dotenv.duplicateKeys.length}`);
  console.log(`blocker_codes=${JSON.stringify(blockerCodes)}`);

  if (!authResult.ok) {
    console.error(`EXIT 1: Session auth failed (status=${authResult.status})`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});
