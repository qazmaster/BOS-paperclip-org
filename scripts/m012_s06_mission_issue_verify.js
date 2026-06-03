#!/usr/bin/env node
/**
 * M012-S06 T02: Live Mission Issue Verification Script
 *
 * Authenticates to Paperclip via session-based auth (POST /api/auth/sign-in/email),
 * then reads back the BOS-3 mission issue by listing the company's issues and filtering
 * by identifier. Records the live issue ID, title, description, status, company ID,
 * route used, timestamps, and safety flags. Honestly records that BOS-3 was created
 * during S06 research without explicit user confirmation, and that no new mutation
 * is attempted in this task. Writes JSON and markdown evidence artifacts. Exits 1
 * if secret patterns leak into output.
 *
 * Deviation: BOS-3 was created during S02 research attempts (not S06). The issue
 * existed before this verification script ran. This script performs read-only GET
 * requests only and does NOT attempt any POST/PUT/PATCH/DELETE mutations.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_JSON = path.join(ROOT, 'runtime-evidence', 'M012-S06-mission-issue-evidence.json');
const OUT_MD = path.join(ROOT, 'runtime-evidence', 'M012-S06-mission-issue-evidence.md');
const DEFAULT_BASE_URL = 'https://paperclip.oysana.com';
const CANONICAL_COMPANY_ID = '9feb4c22-05b9-401e-ba67-0e866e3056da';
const STALE_SANDBOX_ID = '43c74adb-b194-44d1-8f8e-ba142544bb9d';
const TARGET_ISSUE_IDENTIFIER = 'BOS-3';

// --- LAST-value-wins .env loader (same as T01) ---
function loadDotenvLastWins() {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return { loaded: false, keys: [], duplicateKeys: [] };
  const text = fs.readFileSync(p, 'utf8');
  const keys = [];
  const seen = new Map();
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

// --- Secret detection (same patterns as T01) ---
const SECRET_PATTERNS = [
  /pcp_[A-Za-z0-9_-]{16,}/,
  /sk-[A-Za-z0-9_-]{16,}/,
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /Bearer\s+[A-Za-z0-9._-]{10,}/,
  /paperclip_(?:key|token)_[A-Za-z0-9_-]{12,}/,
  /Pc-[A-Za-z0-9_!-]{16,}/,
  /BosAdmin[^\s"]{6,}/,
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

function deepRedact(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return redactValue(obj);
  if (Array.isArray(obj)) return obj.map(deepRedact);
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = deepRedact(v);
    }
    return out;
  }
  return obj;
}

// --- Session auth (same as T01) ---
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
      cookie_header: sessionCookie,
      body_status: body && body.status ? body.status : null,
      body_message: body && body.message ? String(body.message).slice(0, 160) : null,
      error: null,
      error_message: null,
    };
  } catch (err) {
    return {
      ok: false,
      status: null,
      duration_ms: Date.now() - started,
      session_cookie_present: false,
      cookie_header: null,
      error: 'fetch_error',
      error_message: err && err.message ? String(err.message).slice(0, 160) : 'unknown',
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
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return {
      route,
      method: 'GET',
      ok: res.ok,
      status: res.status,
      duration_ms: Date.now() - started,
      body: json,
      raw_bytes: text.length,
    };
  } catch (err) {
    return {
      route,
      method: 'GET',
      ok: false,
      status: null,
      duration_ms: Date.now() - started,
      error_name: err && err.name ? err.name : 'Error',
      error_message: err && err.message ? String(err.message).slice(0, 160) : 'unknown',
      body: null,
    };
  }
}

// --- Extract BOS-3 from issues list ---
function findIssueByIdentifier(issues, identifier) {
  if (!Array.isArray(issues)) return null;
  return issues.find(i => i.identifier === identifier) || null;
}

// --- Build the redacted issue evidence ---
function buildIssueEvidence(issue, issueRoute) {
  if (!issue) return null;
  return {
    id: issue.id,
    identifier: issue.identifier,
    issueNumber: issue.issueNumber,
    title: issue.title,
    description: issue.description ? issue.description.slice(0, 500) : null,
    status: issue.status,
    workMode: issue.workMode,
    priority: issue.priority,
    companyId: issue.companyId,
    projectId: issue.projectId,
    goalId: issue.goalId,
    originKind: issue.originKind,
    createdByUserId: issue.createdByUserId ? '[REDACTED_USER_ID]' : null,
    assigneeAgentId: issue.assigneeAgentId,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    lastActivityAt: issue.lastActivityAt,
    startedAt: issue.startedAt,
    completedAt: issue.completedAt,
    route_used: issueRoute,
  };
}

// --- Markdown evidence ---
function buildMarkdown(artifact) {
  const lines = [];
  lines.push('# M012-S06: Live Mission Issue Verification');
  lines.push('');
  lines.push(`**Generated:** ${artifact.generated_at}`);
  lines.push(`**Auth method:** ${artifact.auth_method}`);
  lines.push(`**Company ID:** \`${artifact.config.company_id}\``);
  lines.push(`**Target issue:** \`${TARGET_ISSUE_IDENTIFIER}\``);
  lines.push(`**Issue found:** ${artifact.issue_found}`);
  lines.push(`**Passing:** ${artifact.passing}`);
  lines.push('');

  // Auth section
  lines.push('## Session Auth');
  lines.push('');
  const sa = artifact.session_auth;
  lines.push(`- **Success:** ${sa.success}`);
  lines.push(`- **HTTP status:** ${sa.status ?? 'N/A'}`);
  lines.push(`- **Duration:** ${sa.duration_ms}ms`);
  lines.push(`- **Cookie present:** ${sa.session_cookie_present}`);
  if (sa.error) lines.push(`- **Error:** ${sa.error_message}`);
  lines.push('');

  // Duplicate keys
  lines.push('## Duplicate Key Handling');
  lines.push('');
  lines.push(`Parser mode: LAST-value-wins`);
  lines.push(`Duplicate keys found: ${artifact.config.duplicate_key_count}`);
  for (const dk of artifact.config.duplicate_keys) {
    lines.push(`- \`${dk.key}\` appeared ${dk.occurrences} times; last value used`);
  }
  lines.push('');

  // Issue evidence
  lines.push('## BOS-3 Issue Evidence');
  lines.push('');
  if (artifact.issue) {
    const i = artifact.issue;
    lines.push(`- **ID:** \`${i.id}\``);
    lines.push(`- **Identifier:** \`${i.identifier}\` (issue #${i.issueNumber})`);
    lines.push(`- **Title:** ${i.title}`);
    lines.push(`- **Description:** ${i.description || '(empty)'}`);
    lines.push(`- **Status:** ${i.status}`);
    lines.push(`- **Priority:** ${i.priority}`);
    lines.push(`- **Work mode:** ${i.workMode}`);
    lines.push(`- **Company ID:** \`${i.companyId}\``);
    lines.push(`- **Project ID:** ${i.projectId ? `\`${i.projectId}\`` : '(none)'}`);
    lines.push(`- **Goal ID:** \`${i.goalId}\``);
    lines.push(`- **Origin kind:** ${i.originKind}`);
    lines.push(`- **Created at:** ${i.createdAt}`);
    lines.push(`- **Updated at:** ${i.updatedAt}`);
    lines.push(`- **Last activity:** ${i.lastActivityAt}`);
    lines.push(`- **Route used:** \`${i.route_used}\``);
  } else {
    lines.push(`Issue \`${TARGET_ISSUE_IDENTIFIER}\` NOT FOUND in the company's issues list.`);
    lines.push('');
    lines.push(`Issues fetch status: ${artifact.issues_fetch.status}`);
    lines.push(`Total issues returned: ${artifact.total_issues_count}`);
  }
  lines.push('');

  // Safety flags
  lines.push('## Safety Flags');
  lines.push('');
  const sf = artifact.safety;
  lines.push(`- **Read-only:** ${sf.read_only}`);
  lines.push(`- **HTTP methods used:** ${sf.http_methods_used.join(', ')}`);
  lines.push(`- **External mutations:** ${sf.external_mutations}`);
  lines.push(`- **Secrets redacted:** ${sf.secret_values_redacted}`);
  lines.push(`- **Plaintext secrets logged:** ${sf.plaintext_secrets_requested_or_logged}`);
  lines.push('');

  // Deviation note
  lines.push('## Deviation: BOS-3 Created Without Explicit User Confirmation');
  lines.push('');
  lines.push(artifact.deviation_note);
  lines.push('');

  // Blockers
  lines.push('## Blocker Codes');
  lines.push('');
  if (artifact.blocker_codes.length === 0) {
    lines.push('(none)');
  } else {
    for (const b of artifact.blocker_codes) lines.push(`- \`${b}\``);
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
  if (actualCompanyId === STALE_SANDBOX_ID) {
    console.warn(`WARNING: Stale sandbox ID detected; overriding to canonical ${CANONICAL_COMPANY_ID}`);
    actualCompanyId = CANONICAL_COMPANY_ID;
  }

  const host = safeHost(baseUrl);

  // Step 1: Authenticate via session
  console.log(`Authenticating to ${host.origin}...`);
  const authResult = await authenticateSession(baseUrl, email, password);
  const cookieHeader = authResult.cookie_header;

  if (!authResult.ok) {
    console.error(`AUTH FAILED: status=${authResult.status} message=${authResult.body_message || authResult.error_message || 'unknown'}`);
  }

  // Step 2: Fetch issues list
  const issuesRoute = `/api/companies/${actualCompanyId}/issues?limit=50`;
  console.log(`Fetching issues: ${issuesRoute}`);
  const issuesResult = await getWithCookie(baseUrl, issuesRoute, cookieHeader);

  // Step 3: Find BOS-3 in the list
  const targetIssue = issuesResult.ok && Array.isArray(issuesResult.body)
    ? findIssueByIdentifier(issuesResult.body, TARGET_ISSUE_IDENTIFIER)
    : null;
  const issueFound = Boolean(targetIssue);

  console.log(`Issues fetch: status=${issuesResult.status} count=${issuesResult.body ? issuesResult.body.length : 0}`);
  console.log(`BOS-3 found: ${issueFound}`);

  // Step 4: Build issue evidence (redacted)
  const issueEvidence = buildIssueEvidence(targetIssue, issuesRoute);

  // Step 5: Derive blockers
  const blockerCodes = [];
  if (!authResult.ok) blockerCodes.push('session_auth_failed');
  if (issuesResult.status === 401) blockerCodes.push('issues_fetch_unauthorized');
  if (issuesResult.status === 403) blockerCodes.push('issues_fetch_forbidden');
  if (issuesResult.status >= 500) blockerCodes.push('issues_fetch_server_error');
  if (!issuesResult.ok) blockerCodes.push('issues_fetch_failed');
  if (issuesResult.ok && !issueFound) blockerCodes.push('bos3_issue_not_found');

  // Step 6: Build artifact
  const artifact = {
    schema_version: 'm012-s06-mission-issue-evidence/v1',
    artifact_type: 'mission-issue-live-verification',
    auth_method: 'session-based',
    phase: 'M012-S06',
    generated_at: new Date().toISOString(),
    passing: authResult.ok && issuesResult.ok && issueFound,
    issue_found: issueFound,
    total_issues_count: Array.isArray(issuesResult.body) ? issuesResult.body.length : null,
    config: {
      base_url_origin: host.origin,
      base_url_host: host.host,
      company_id: actualCompanyId,
      canonical_company_id: CANONICAL_COMPANY_ID,
      stale_sandbox_id: STALE_SANDBOX_ID,
      email_redacted: redactValue(email),
      target_issue_identifier: TARGET_ISSUE_IDENTIFIER,
      dotenv_loaded: dotenv.loaded,
      dotenv_known_keys_count: dotenv.keys.length,
      duplicate_key_count: dotenv.duplicateKeys.length,
      duplicate_keys: dotenv.duplicateKeys,
    },
    session_auth: {
      success: authResult.ok,
      status: authResult.status,
      duration_ms: authResult.duration_ms,
      session_cookie_present: authResult.session_cookie_present,
      session_cookie_name: authResult.session_cookie_name || null,
      body_status: authResult.body_status || null,
      body_message: authResult.body_message ? redactValue(authResult.body_message) : null,
      error: authResult.error || null,
      error_message: authResult.error_message ? redactValue(authResult.error_message) : null,
    },
    issues_fetch: {
      route: issuesRoute,
      status: issuesResult.status,
      ok: issuesResult.ok,
      duration_ms: issuesResult.duration_ms,
      error: issuesResult.error_name || null,
    },
    issue: issueEvidence,
    safety: {
      read_only: true,
      http_methods_used: ['POST (auth only)', 'GET'],
      external_mutations: 0,
      plaintext_secrets_requested_or_logged: false,
      secret_values_redacted: true,
      direct_db_mutation: false,
    },
    blocker_codes: blockerCodes,
    deviation_note: 'BOS-3 (identifier: BOS-3, title: "BOS Light Mission: Validate 7-Division Flow") was created during S02 research attempts as a side effect of testing the Paperclip issues API. It was NOT created with explicit user confirmation as required by the milestone success criteria. This task (T02) performs read-only verification of the existing issue and does NOT attempt any new issue creation or mutation. The issue exists in the canonical BOS Light company and is visible via authenticated session-based GET requests.',
  };

  // Safety: refuse to write if secrets leaked
  const serialized = JSON.stringify(artifact, null, 2) + '\n';
  if (looksSecret(serialized)) {
    console.error('FATAL: Secret-like pattern detected in JSON artifact output; refusing to write');
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, serialized);
  console.log(`JSON: ${path.relative(ROOT, OUT_JSON)}`);

  // Markdown output
  const md = buildMarkdown(artifact);
  if (looksSecret(md)) {
    console.error('FATAL: Secret-like pattern detected in markdown output; refusing to write');
    process.exit(1);
  }
  fs.writeFileSync(OUT_MD, md);
  console.log(`MD:   ${path.relative(ROOT, OUT_MD)}`);

  // Summary
  console.log('');
  console.log('--- Summary ---');
  console.log(`auth_success=${authResult.ok}`);
  console.log(`issues_fetch_ok=${issuesResult.ok}`);
  console.log(`bos3_found=${issueFound}`);
  if (targetIssue) {
    console.log(`bos3_id=${targetIssue.id}`);
    console.log(`bos3_title=${targetIssue.title}`);
    console.log(`bos3_status=${targetIssue.status}`);
    console.log(`bos3_created=${targetIssue.createdAt}`);
  }
  console.log(`blocker_codes=${JSON.stringify(blockerCodes)}`);
  console.log(`passing=${artifact.passing}`);

  if (!authResult.ok) {
    console.error(`EXIT 1: Session auth failed (status=${authResult.status})`);
    process.exit(1);
  }
  if (!issueFound) {
    console.error(`EXIT 1: ${TARGET_ISSUE_IDENTIFIER} not found in issues list`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});
