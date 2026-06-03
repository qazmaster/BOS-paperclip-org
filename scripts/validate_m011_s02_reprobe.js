#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ARTIFACT = path.join(ROOT, 'runtime-evidence', 'M011-S02-paperclip-readonly-reprobe.json');

function secretLike(value) {
  if (typeof value !== 'string') return false;
  return /(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|Bearer\s+[A-Za-z0-9._-]{10,}|pcp_[A-Za-z0-9_-]{16,}|paperclip_(?:key|token)_[A-Za-z0-9_-]{12,})/.test(value);
}

function fail(errors) {
  console.error('M011 S02 reprobe validation failed:');
  for (const err of errors) console.error(`- ${err}`);
  process.exit(1);
}

function main() {
  const errors = [];
  if (!fs.existsSync(ARTIFACT)) fail([`missing ${path.relative(ROOT, ARTIFACT)}`]);
  const text = fs.readFileSync(ARTIFACT, 'utf8');
  if (secretLike(text)) errors.push('artifact contains secret-like token pattern');
  const artifact = JSON.parse(text);

  if (artifact.schema_version !== 'm011-s02-paperclip-readonly-reprobe/v1') errors.push(`unexpected schema_version ${artifact.schema_version}`);
  if (artifact.artifact_type !== 'read-only-live-reprobe') errors.push(`unexpected artifact_type ${artifact.artifact_type}`);
  if (!artifact.safety || artifact.safety.read_only !== true) errors.push('safety.read_only must be true');
  if (!artifact.safety || artifact.safety.external_mutations !== 0) errors.push('safety.external_mutations must be 0');
  if (!artifact.safety || artifact.safety.direct_db_mutation !== false) errors.push('safety.direct_db_mutation must be false');
  if (!artifact.safety || artifact.safety.plaintext_secrets_requested_or_logged !== false) errors.push('plaintext secret logging flag must be false');
  if (!Array.isArray(artifact.safety.http_methods_used) || artifact.safety.http_methods_used.some((m) => m !== 'GET')) errors.push('only GET methods are allowed');
  if (!Array.isArray(artifact.routes) || artifact.routes.length < 10) errors.push('routes array missing or too short');
  if (!Array.isArray(artifact.capability_promotions) || artifact.capability_promotions.length !== 0) errors.push('S02 reprobe must not promote capabilities directly');
  if (!Array.isArray(artifact.blocker_codes)) errors.push('blocker_codes must be an array');

  for (const route of artifact.routes || []) {
    if (route.method !== 'GET') errors.push(`${route.route}: non-GET method ${route.method}`);
    if (typeof route.status !== 'number' && route.status !== null) errors.push(`${route.route}: invalid status`);
    if (!route.class) errors.push(`${route.route}: missing class`);
    const body = JSON.stringify(route.body_summary || {});
    if (secretLike(body)) errors.push(`${route.route}: body summary contains secret-like token`);
  }

  const routeByPath = new Map((artifact.routes || []).map((r) => [r.route, r]));
  if (!routeByPath.has('/api/health')) errors.push('missing /api/health route');
  if (!artifact.observations || artifact.observations.health_ok !== Boolean(routeByPath.get('/api/health') && routeByPath.get('/api/health').ok)) {
    errors.push('observations.health_ok does not match /api/health route');
  }

  if (artifact.config && artifact.config.auth_present === false && !artifact.blocker_codes.includes('missing_paperclip_auth')) {
    errors.push('missing auth must produce missing_paperclip_auth blocker');
  }
  const has401 = (artifact.routes || []).some((r) => r.status === 401);
  if (has401 && !artifact.blocker_codes.includes('paperclip_auth_unauthorized')) {
    errors.push('401 routes must produce paperclip_auth_unauthorized blocker');
  }
  const pluginObserved = artifact.observations && artifact.observations.plugin_route_ok === true;
  const pikoObserved = artifact.observations && artifact.observations.piko_tools_observed === true;
  if (!pluginObserved && !artifact.blocker_codes.includes('plugin_routes_not_found')) {
    errors.push('unobserved plugin route must remain blocked');
  }
  if (!pikoObserved && !artifact.blocker_codes.includes('tool_routes_not_found')) {
    errors.push('unobserved piko tools must remain blocked');
  }

  if (errors.length) fail(errors);
  console.log(`validated ${path.relative(ROOT, ARTIFACT)}`);
  console.log(`routes ${(artifact.routes || []).length}`);
  console.log(`health_ok ${artifact.observations.health_ok}`);
  console.log(`company_visible ${artifact.observations.company_visible}`);
  console.log(`agents_visible ${artifact.observations.agents_visible}`);
  console.log(`plugin_route_ok ${artifact.observations.plugin_route_ok}`);
  console.log(`piko_tools_observed ${artifact.observations.piko_tools_observed}`);
  console.log(`blocker_codes ${JSON.stringify(artifact.blocker_codes)}`);
}

main();
