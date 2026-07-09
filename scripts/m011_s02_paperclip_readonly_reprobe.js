#!/usr/bin/env node
/**
 * M011 S02 Paperclip Readonly Reprobe
 *
 * Environment Variables:
 *   PAPERCLIP_API_KEY (str): Primary auth token. Required for live probes.
 *   PAPERCLIP_TOKEN (str): Alias for PAPERCLIP_API_KEY.
 *   PAPERCLIP_AUTH_TOKEN (str): Alias for PAPERCLIP_API_KEY.
 *   PAPERCLIP_BASE_URL (str): Paperclip instance URL. Default: https://paperclip.oysana.com
n *   PAPERCLIP_URL (str): Alias for PAPERCLIP_BASE_URL.
 *   PAPERCLIP_COMPANY_ID (str): Company ID. Default: 43c74adb-b194-44d1-8f8e-ba142544bb9d
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'runtime-evidence', 'M011-S02-paperclip-readonly-reprobe.json');
const DEFAULT_BASE_URL = 'https://paperclip.oysana.com';
const DEFAULT_COMPANY_ID = '43c74adb-b194-44d1-8f8e-ba142544bb9d';

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
    const key = line.slice(0, idx).trim();
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

function looksSecret(value) {
  if (typeof value !== 'string') return false;
  return /(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|Bearer\s+[A-Za-z0-9._-]{10,}|pcp_[A-Za-z0-9_-]{16,}|paperclip_(?:key|token)_[A-Za-z0-9_-]{12,})/.test(value);
}

function summarizeBody(text) {
  if (!text) return { bytes: 0, json: false, keys: [] };
  if (looksSecret(text)) return { bytes: text.length, json: false, redacted_due_to_secret_pattern: true };
  try {
    const json = JSON.parse(text);
    const keys = json && typeof json === 'object' && !Array.isArray(json) ? Object.keys(json).slice(0, 20) : [];
    const array_count = Array.isArray(json) ? json.length : undefined;
    const plugin_loaded = JSON.stringify(json).toLowerCase().includes('bos-light');
    return { bytes: text.length, json: true, keys, array_count, mentions_bos_light: plugin_loaded };
  } catch {
    return { bytes: text.length, json: false, preview: text.slice(0, 120).replace(/\s+/g, ' ') };
  }
}

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
      body_summary: summarizeBody(text),
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

function deriveBlockers(routes, auth) {
  const blockers = new Set();
  if (!auth.present) blockers.add('missing_paperclip_auth');
  if (routes.some((r) => r.status === 401)) blockers.add('paperclip_auth_unauthorized');
  if (routes.some((r) => r.status === 403)) blockers.add('paperclip_auth_forbidden');
  if (routes.filter((r) => r.class === 'plugin_route_not_found').length > 0) blockers.add('plugin_routes_not_found');
  if (routes.filter((r) => r.class === 'tool_route_not_found').length > 0) blockers.add('tool_routes_not_found');
  if (!routes.some((r) => r.route === '/api/health' && r.ok)) blockers.add('health_unavailable');
  return Array.from(blockers);
}

function deriveObservations(routes) {
  const byRoute = Object.fromEntries(routes.map((r) => [r.route, r]));
  const health_ok = Boolean(byRoute['/api/health'] && byRoute['/api/health'].ok);
  const company_visible = Boolean(byRoute[`/api/companies/${DEFAULT_COMPANY_ID}`] && byRoute[`/api/companies/${DEFAULT_COMPANY_ID}`].ok);
  const agents_visible = Boolean(byRoute[`/api/companies/${DEFAULT_COMPANY_ID}/agents`] && byRoute[`/api/companies/${DEFAULT_COMPANY_ID}/agents`].ok);
  const plugin_route_ok = routes.some((r) => r.route.includes('plugin') && r.ok && r.body_summary && r.body_summary.mentions_bos_light);
  const piko_tools_observed = routes.some((r) => r.route.includes('tool') && r.ok && r.body_summary && r.body_summary.mentions_bos_light);
  return { health_ok, company_visible, agents_visible, plugin_route_ok, piko_tools_observed };
}

async function main() {
  const dotenv = loadDotenv();
  const baseUrl = cleanBaseUrl(process.env.PAPERCLIP_BASE_URL || process.env.PAPERCLIP_URL || DEFAULT_BASE_URL);
  const companyId = process.env.PAPERCLIP_COMPANY_ID || DEFAULT_COMPANY_ID;
  const auth = chooseAuthToken();
  const tokenValue = auth.present ? process.env[auth.key] : null;
  const host = safeHost(baseUrl);
  const routesToProbe = [
    '/api/health',
    '/api/version',
    `/api/companies/${companyId}`,
    `/api/companies/${companyId}/agents`,
    `/api/companies/${companyId}/issues?limit=5`,
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

  const observations = deriveObservations(routes);
  const blocker_codes = deriveBlockers(routes, auth);
  const artifact = {
    schema_version: 'm011-s02-paperclip-readonly-reprobe/v1',
    artifact_type: 'read-only-live-reprobe',
    phase: 'M011-S02',
    generated_at: new Date().toISOString(),
    selected_path: 'supported_http_get_routes_only',
    passing: observations.health_ok,
    capability_promotions: [],
    blocker_codes,
    config: {
      base_url_origin: host.origin,
      base_url_host: host.host,
      company_id: companyId,
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
    },
    observations,
    routes,
    no_core_modification: {
      method: 'Supported Paperclip HTTP GET routes only',
      core_source_patched: false,
      paperclip_core_patched: false,
      private_internal_imports: false,
      direct_db_mutation: false,
    },
  };

  const serialized = JSON.stringify(artifact, null, 2) + '\n';
  if (looksSecret(serialized)) throw new Error('Refusing to write artifact: secret-like pattern detected');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, serialized);
  console.log(`wrote ${path.relative(ROOT, OUT)}`);
  console.log(`health_ok ${observations.health_ok}`);
  console.log(`company_visible ${observations.company_visible}`);
  console.log(`agents_visible ${observations.agents_visible}`);
  console.log(`plugin_route_ok ${observations.plugin_route_ok}`);
  console.log(`piko_tools_observed ${observations.piko_tools_observed}`);
  console.log(`blocker_codes ${JSON.stringify(blocker_codes)}`);
}

main().catch((err) => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});
