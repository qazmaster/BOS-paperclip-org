#!/usr/bin/env node
/**
 * M012-S01: Canonical Paperclip Readback Probe
 *
 * Probes the live Paperclip API for the canonical BOS Light company using
 * supported GET routes only. Rejects the stale sandbox company ID as a target.
 * Normalizes company, agents, issues, projects, goals, and route statuses.
 * Writes JSON + markdown evidence with no plaintext secrets and no DB mutation.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_JSON = path.join(ROOT, 'runtime-evidence', 'M012-S01-canonical-paperclip-readback.json');
const OUT_MD = path.join(ROOT, 'runtime-evidence', 'M012-S01-canonical-paperclip-readback.md');
const DEFAULT_BASE_URL = 'https://paperclip.oysana.com';
const CANONICAL_COMPANY_ID = '9feb4c22-05b9-401e-ba67-0e866e3056da';
const STALE_SANDBOX_ID = '43c74adb-b194-44d1-8f8e-ba142544bb9d';

// --- .env loader (matches M011 S02 pattern) ---
function loadDotenv() {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return { loaded: false, keys: [] };
  const text = fs.readFileSync(p, 'utf8');
  const keys = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    let key = line.slice(0, idx).trim();
    // Strip 'export ' prefix common in shell-style .env files
    if (key.startsWith('export ')) key = key.slice(7).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
    keys.push(key);
  }
  return { loaded: true, keys };
}

function chooseAuthToken() {
  const candidates = ['PAPERCLIP_API_KEY', 'PAPERCLIP_TOKEN', 'PAPERCLIP_AUTH_TOKEN'];
  for (const key of candidates) {
    if (process.env[key] && process.env[key].trim()) return { key, present: true };
  }
  return { key: null, present: false };
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
function looksSecret(value) {
  if (typeof value !== 'string') return false;
  return /(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|Bearer\s+[A-Za-z0-9._-]{10,}|pcp_[A-Za-z0-9_-]{16,}|paperclip_(?:key|token)_[A-Za-z0-9_-]{12,})/.test(value);
}

// --- Route classification ---
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

function safeBodySummary(text, route) {
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
  // For agents/issues/etc, extract key identifying fields
  const pick = {};
  for (const k of ['id', 'name', 'title', 'status', 'slug', 'email', 'role', 'priority', 'company_id']) {
    if (k in item) pick[k] = item[k];
  }
  return Object.keys(pick).length > 0 ? pick : undefined;
}

// --- GET fetch wrapper ---
async function getRoute(baseUrl, route, tokenValue) {
  const url = `${baseUrl}${route}`;
  const headers = { Accept: 'application/json' };
  if (tokenValue) headers.Authorization = `Bearer ${tokenValue}`;
  const started = Date.now();
  try {
    const res = await fetch(url, { method: 'GET', headers, redirect: 'manual' });
    const text = await res.text();
    return {
      route,
      method: 'GET',
      ok: res.ok,
      status: res.status,
      class: classifyRoute(route, res.status),
      duration_ms: Date.now() - started,
      content_type: res.headers.get('content-type') || null,
      body_summary: safeBodySummary(text, route),
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

// --- Normalization ---
function normalizeCompany(routeResult) {
  if (!routeResult || !routeResult.ok) return null;
  return { route: routeResult.route, status: routeResult.status, available: true };
}

function normalizeAgents(routeResult) {
  if (!routeResult || !routeResult.ok) return { available: false, count: null };
  const summary = routeResult.body_summary || {};
  return { available: true, count: summary.array_count || null };
}

function normalizeIssues(routeResult) {
  if (!routeResult || !routeResult.ok) return { available: false, count: null };
  const summary = routeResult.body_summary || {};
  return { available: true, count: summary.array_count || null };
}

function normalizeGenericList(routeResult, name) {
  if (!routeResult || !routeResult.ok) return { available: false, count: null, name };
  const summary = routeResult.body_summary || {};
  return { available: true, count: summary.array_count || null, name };
}

// --- Blocker derivation ---
function deriveBlockers(routes, auth, companyId) {
  const blockers = new Set();
  if (!auth.present) blockers.add('missing_paperclip_auth');
  if (routes.some(r => r.status === 401)) blockers.add('paperclip_auth_unauthorized');
  if (routes.some(r => r.status === 403)) blockers.add('paperclip_auth_forbidden');
  if (routes.some(r => r.class === 'plugin_route_not_found')) blockers.add('plugin_routes_not_found');
  if (routes.some(r => r.class === 'tool_route_not_found')) blockers.add('tool_routes_not_found');
  if (!routes.some(r => r.route === '/api/health' && r.ok)) blockers.add('health_unavailable');
  if (companyId === STALE_SANDBOX_ID) blockers.add('stale_sandbox_company_id_used');
  return Array.from(blockers);
}

// --- Route inventory ---
function buildRouteInventory(routes) {
  return routes.map(r => ({
    route: r.route,
    status: r.status,
    class: r.class,
    ok: r.ok,
  }));
}

// --- Markdown evidence ---
function buildMarkdown(artifact) {
  const lines = [];
  lines.push('# M012-S01: Canonical Paperclip Readback');
  lines.push('');
  lines.push(`**Generated:** ${artifact.generated_at}`);
  lines.push(`**Company ID:** \`${artifact.config.company_id}\` (canonical)`);
  lines.push(`**Base URL:** ${artifact.config.base_url_origin}`);
  lines.push(`**Auth present:** ${artifact.config.auth_present}`);
  lines.push(`**Stale sandbox rejected:** ${artifact.safety.stale_sandbox_rejected}`);
  lines.push('');

  lines.push('## Safety');
  lines.push('');
  lines.push(`- Read-only: ${artifact.safety.read_only}`);
  lines.push(`- HTTP methods: ${artifact.safety.http_methods_used.join(', ')}`);
  lines.push(`- External mutations: ${artifact.safety.external_mutations}`);
  lines.push(`- Plaintext secrets logged: ${artifact.safety.plaintext_secrets_requested_or_logged}`);
  lines.push(`- Direct DB mutation: ${artifact.safety.direct_db_mutation}`);
  lines.push('');

  lines.push('## Observations');
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
    for (const b of artifact.blocker_codes) {
      lines.push(`- \`${b}\``);
    }
  }
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
  const dotenv = loadDotenv();
  const baseUrl = cleanBaseUrl(process.env.PAPERCLIP_BASE_URL || process.env.PAPERCLIP_URL || DEFAULT_BASE_URL);
  const rawCompanyId = process.env.PAPERCLIP_COMPANY_ID || CANONICAL_COMPANY_ID;

  // Reject stale sandbox
  let companyId = rawCompanyId;
  let staleSandboxRejected = false;
  if (companyId === STALE_SANDBOX_ID) {
    staleSandboxRejected = true;
    console.warn(`WARNING: Stale sandbox company ID ${STALE_SANDBOX_ID} detected; overriding to canonical ${CANONICAL_COMPANY_ID}`);
    companyId = CANONICAL_COMPANY_ID;
  }

  const auth = chooseAuthToken();
  const tokenValue = auth.present ? process.env[auth.key] : null;
  const host = safeHost(baseUrl);

  // Supported GET routes
  const routesToProbe = [
    '/api/health',
    '/api/version',
    `/api/companies/${companyId}`,
    `/api/companies/${companyId}/agents`,
    `/api/companies/${companyId}/issues?limit=50`,
    `/api/companies/${companyId}/projects`,
    `/api/companies/${companyId}/goals`,
    `/api/companies/${companyId}/plugins`,
    `/api/companies/${companyId}/plugins/bos-light`,
    `/api/companies/${companyId}/plugins/bos-light/status`,
    `/api/companies/${companyId}/plugins/bos-light/tools`,
    '/api/plugins',
    '/api/plugins/bos-light',
    '/api/plugins/bos-light/status',
    '/api/plugins/bos-light/tools',
    '/api/tools',
    '/api/tools/registry',
  ];

  const routes = [];
  for (const route of routesToProbe) {
    routes.push(await getRoute(baseUrl, route, tokenValue));
  }

  // Normalize entities
  const byRoute = Object.fromEntries(routes.map(r => [r.route, r]));
  const normalizedEntities = {
    company: normalizeCompany(byRoute[`/api/companies/${companyId}`]),
    agents: normalizeAgents(byRoute[`/api/companies/${companyId}/agents`]),
    issues: normalizeIssues(byRoute[`/api/companies/${companyId}/issues?limit=50`]),
    projects: normalizeGenericList(byRoute[`/api/companies/${companyId}/projects`], 'projects'),
    goals: normalizeGenericList(byRoute[`/api/companies/${companyId}/goals`], 'goals'),
  };

  // Observations
  const observations = {
    health_ok: Boolean(byRoute['/api/health'] && byRoute['/api/health'].ok),
    company_visible: Boolean(byRoute[`/api/companies/${companyId}`] && byRoute[`/api/companies/${companyId}`].ok),
    agents_visible: Boolean(byRoute[`/api/companies/${companyId}/agents`] && byRoute[`/api/companies/${companyId}/agents`].ok),
    issues_visible: Boolean(byRoute[`/api/companies/${companyId}/issues?limit=50`] && byRoute[`/api/companies/${companyId}/issues?limit=50`].ok),
    projects_visible: Boolean(byRoute[`/api/companies/${companyId}/projects`] && byRoute[`/api/companies/${companyId}/projects`].ok),
    goals_visible: Boolean(byRoute[`/api/companies/${companyId}/goals`] && byRoute[`/api/companies/${companyId}/goals`].ok),
    plugin_route_ok: routes.some(r => r.route.includes('plugin') && r.ok),
    piko_tools_observed: routes.some(r => r.route.includes('tool') && r.ok),
  };

  const blockerCodes = deriveBlockers(routes, auth, companyId);
  const routeInventory = buildRouteInventory(routes);

  const artifact = {
    schema_version: 'm012-s01-canonical-paperclip-readback/v1',
    artifact_type: 'canonical-live-readback',
    phase: 'M012-S01',
    generated_at: new Date().toISOString(),
    selected_path: 'supported_http_get_routes_only',
    passing: observations.health_ok && observations.company_visible,
    config: {
      base_url_origin: host.origin,
      base_url_host: host.host,
      company_id: companyId,
      canonical_company_id: CANONICAL_COMPANY_ID,
      stale_sandbox_id: STALE_SANDBOX_ID,
      auth_present: auth.present,
      auth_key_name: auth.key,
      dotenv_loaded: dotenv.loaded,
      dotenv_known_keys_count: dotenv.keys.length,
    },
    safety: {
      read_only: true,
      http_methods_used: ['GET'],
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
    routes,
  };

  // Safety check: refuse to write if secrets leaked into artifact
  const serialized = JSON.stringify(artifact, null, 2) + '\n';
  if (looksSecret(serialized)) {
    console.error('FATAL: Secret-like pattern detected in artifact output; refusing to write');
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, serialized);

  // Write markdown evidence
  const md = buildMarkdown(artifact);
  if (looksSecret(md)) {
    console.error('FATAL: Secret-like pattern detected in markdown output; refusing to write');
    process.exit(1);
  }
  fs.writeFileSync(OUT_MD, md);

  console.log(`JSON: ${path.relative(ROOT, OUT_JSON)}`);
  console.log(`MD:   ${path.relative(ROOT, OUT_MD)}`);
  console.log(`company_id=${companyId}`);
  console.log(`health_ok=${observations.health_ok}`);
  console.log(`company_visible=${observations.company_visible}`);
  console.log(`agents_visible=${observations.agents_visible}`);
  console.log(`issues_visible=${observations.issues_visible}`);
  console.log(`projects_visible=${observations.projects_visible}`);
  console.log(`goals_visible=${observations.goals_visible}`);
  console.log(`blocker_codes=${JSON.stringify(blockerCodes)}`);
}

main().catch(err => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});
