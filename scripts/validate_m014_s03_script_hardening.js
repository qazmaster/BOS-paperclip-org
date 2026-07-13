#!/usr/bin/env node
/**
 * @file scripts/validate_m014_s03_script_hardening.js
 *
 * M014-a9jj46/S03/T04 — runtime hardening audit.
 *
 * Scans scripts/ for unsafe live defaults that would silently mutate
 * Paperclip against stale, missing, or unauthorized state. Every audit
 * class returns structured blockers (same shape as T01/T02 validators):
 *   { code, kind, where, message, evidence, remediation }
 *
 * Audit classes:
 *   V-AU-01 no_stale_id_as_mutation_default
 *     Scan mutation-capable scripts for hardcoded UUIDs that match
 *     paperclip-runtime.lock.json stale_company_ids.ids ∪ disposable_company_ids.ids
 *     and appear as a default value (DEFAULT_COMPANY_ID, CANONICAL_COMPANY_ID,
 *     argparse default=, `||` fallback to a UUID literal). Allow in
 *     comments, docstrings, REJECTED/STALE lists, error messages.
 *
 *   V-AU-02 mutation_paths_require_preflight_gate
 *     Every mutation-capable script must invoke the preflight contract
 *     via runPreflight() (JS) or run_preflight()/cli_paperclip_preflight.js
 *     subprocess (Python) somewhere in the file. Absence is a blocker;
 *     presence is the gate (the script's main() must call it before
 *     mutation, which is the contract T03 verified).
 *
 *   V-AU-03 no_forbidden_command_invocation
 *     Scan for actual shell invocations of the five R3 destructive
 *     commands (docker compose down -v, docker volume prune,
 *     docker system prune, docker rm, docker volume rm). Allow in
 *     comments, docstrings, prohibitive warnings, fixture lists.
 *
 *   V-AU-04 paperclip_api_key_not_used_for_mutation_auth
 *     Bearer Authorization header whose source is PAPERCLIP_API_KEY
 *     must NOT be reachable from a POST/PUT/PATCH/DELETE call site.
 *     A diagnostic-only path (Bearer only on GET) is allowed.
 *
 *   V-AU-05 structured_blocker_output
 *     Every emitted blocker has { code, kind, where, message, evidence,
 *     remediation } with kind in the canonical set.
 *
 * Verification:
 *   node --test scripts/validate_m014_s03_script_hardening.js
 *
 * Reuse:
 *   const audit = require('./scripts/validate_m014_s03_script_hardening');
 *   const blockers = audit.auditScriptsDir(scriptsDir, lockfile);
 *
 * Design contract:
 *   - Side-effect free: reads scripts, audits, asserts. No network, no
 *     subprocesses, no git, no secret writes, no .gsd/ mutations.
 *   - Secrets are never echoed in evidence (UUIDs are redacted to a prefix).
 *   - Allow rules are explicit; this file lists each allow rule with its
 *     matching context so reviewers can audit the allow set.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

const PROJECT_ROOT = process.cwd();
const SCRIPTS_DIR = path.resolve(PROJECT_ROOT, 'scripts');
const LOCKFILE_PATH = path.resolve(PROJECT_ROOT, 'paperclip-runtime.lock.json');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Canonical fully-qualified UUID literal regex. Captures whole 8-4-4-4-12 hex
 * tokens; case-insensitive.
 */
const UUID_LITERAL_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/**
 * Lenient UUID detector: accepts both fully-qualified `9feb4c22-…` and
 * truncated `9feb4c22-…` forms (the truth-map and lockfile both use these
 * interchangeably). Used by the allow-rule predicates where the goal is
 * "does this line reference a known UUID" rather than "extract a UUID value".
 */
const UUID_OR_TRUNCATED_RE = /\b[0-9a-f]{8}-(?:[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|…)/i;

/**
 * The five R3 forbidden docker commands. Order matches paperclip-runtime.lock.json
 * forbidden_commands. The audit scans for actual invocations (subprocess.run
 * with shell=True, child_process.exec/execSync, os.system), not comments.
 */
const R3_FORBIDDEN_COMMANDS = [
  'docker compose down -v',
  'docker volume prune',
  'docker system prune',
  'docker rm',
  'docker volume rm'
];

/**
 * Canonical kinds a blocker may carry. Mirrors the T01 schema; V-AU-05
 * asserts every emitted blocker.kind is in this set.
 */
const CANONICAL_KINDS = new Set([
  'schema',
  'target',
  'auth',
  'adapter',
  'confirmation',
  'mutation_default',
  'command'
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Decide whether a script file is auditable. Excludes:
 *   - tests (test_*)
 *   - validators (validate_*)
 *   - the preflight CLI wrapper itself
 *   - lib helpers (scripts/lib/*)
 *   - python cache dirs
 *   - non .js / .py files
 *
 * The optional `scriptsDir` argument lets tests run the audit against a
 * temporary directory; default is the project-level scripts/ directory.
 */
function isAuditableScript(filepath, scriptsDir = SCRIPTS_DIR) {
  const basename = path.basename(filepath);
  if (basename.startsWith('test_')) return false;
  if (basename.startsWith('validate_')) return false;
  if (basename === 'cli_paperclip_preflight.js') return false;
  if (!/\.(js|py)$/.test(basename)) return false;
  // Path-relative checks (require scriptsDir).
  const rel = path.relative(scriptsDir, filepath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
  if (rel.startsWith('lib' + path.sep) || rel.includes(path.sep + 'lib' + path.sep)) return false;
  if (rel.includes('__pycache__')) return false;
  return true;
}

/**
 * Enumerate auditable scripts in scriptsDir. Sorted for deterministic output.
 * Returns [] if scriptsDir does not exist.
 */
function listAuditableScripts(scriptsDir) {
  if (!fs.existsSync(scriptsDir)) return [];
  const entries = fs.readdirSync(scriptsDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && /\.(js|py)$/.test(e.name))
    .map((e) => path.join(scriptsDir, e.name))
    .filter((p) => isAuditableScript(p, scriptsDir))
    .sort();
}

/**
 * Detect the language of a script by its extension.
 */
function scriptLanguage(filepath) {
  return filepath.endsWith('.py') ? 'python' : 'javascript';
}

/**
 * Make a structured blocker. Mirrors T01's makeBlocker shape.
 */
function makeBlocker({ code, kind, where, message, evidence, remediation }) {
  return {
    code,
    kind,
    where,
    message,
    evidence: evidence || null,
    remediation: remediation || null
  };
}

/**
 * Redact a UUID literal to its 8-char prefix for safe evidence. Never echo
 * the full UUID in evidence because that would defeat the stale-id ledger's
 * hygiene purpose (defense in depth).
 */
function uuidPrefix(uuid) {
  return String(uuid || '').slice(0, 8);
}

// ---------------------------------------------------------------------------
// Allow-rule predicates
// ---------------------------------------------------------------------------

/**
 * Is this line a comment / docstring opener / continuation? Allow stale UUIDs
 * and forbidden commands in comments so historical docs and explanatory
 * text are not flagged.
 */
function isCommentOrDocstringLine(line, language) {
  const trimmed = line.trim();
  if (language === 'python') {
    if (trimmed.startsWith('#')) return true;
    if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) return true;
    return false;
  }
  // javascript
  if (trimmed.startsWith('//')) return true;
  if (trimmed.startsWith('/*') || trimmed.startsWith('*')) return true;
  return false;
}

/**
 * Is this line a stale/disposable ID REJECTION list entry — i.e. the line
 * is documenting that an ID should be REJECTED/STALE/DISPOSABLE rather than
 * used as a default? Examples that should pass:
 *   REJECTED_STALE_IDS = ['9feb4c22-…', '43c74adb-…']
 *   stale_company_ids.ids = [...]
 *   if (entry === '9feb4c22-…') return reject;
 *   ids.includes('9feb4c22-…')
 * Counter-examples that should fail (this is NOT a rejection list):
 *   const DEFAULT_COMPANY_ID = '9feb4c22-…';
 *   parser.add_argument('--company-id', default='9feb4c22-…')
 *   const x = process.env.PAPERCLIP_COMPANY_ID || '9feb4c22-…';
 */
function isStaleRejectionListContext(line) {
  const trimmed = line.trim();
  // Hard negatives: explicit default or fallback.
  if (/\bDEFAULT_?COMPANY_?ID\b/i.test(trimmed)) return false;
  if (/\bCANONICAL_?COMPANY_?ID\b/i.test(trimmed)) return false;
  if (/\bdefault\s*=\s*['"][a-f0-9]{8}/i.test(trimmed)) return false;
  if (/\|\|\s*['"][a-f0-9]{8}[-]/i.test(trimmed)) return false;
  if (/\bor\s+['"][a-f0-9]{8}[-]/i.test(trimmed)) return false;
  // Allow if the line declares a list of rejected IDs (full or truncated).
  const hasUuid = UUID_OR_TRUNCATED_RE.test(trimmed);
  if (
    hasUuid &&
    /\b(REJECTED|STALE|DISPOSABLE|EXCLUDED|EXCLUDE|FORBIDDEN|DENIED|EXCLUSION)/i.test(trimmed) &&
    /[=\[]/.test(trimmed)
  ) {
    return true;
  }
  // Allow .includes() membership check.
  if (/\.includes\s*\(\s*['"][a-f0-9]{8}/i.test(trimmed)) return true;
  // Allow === membership test on a stale ID (if/return/raise context).
  if (
    /===?\s*['"][a-f0-9]{8}[-]/i.test(trimmed) &&
    /\b(if|return|raise)\b/.test(trimmed)
  ) {
    return true;
  }
  // Allow if the line is documentation that an ID has been removed/refused.
  if (
    /\b(removed|deleted|retired|refuses|rejecting|legacy)\b/i.test(trimmed) &&
    /\b(DEFAULT|CANONICAL|hardcoded|constant|ID|UUID)\b/i.test(trimmed)
  ) {
    return true;
  }
  // Allow if the line is an explicit WARNING about a stale / invalid ID.
  if (/\bWARNING\b/i.test(trimmed) && /\b(stale|sandbox|invalid|dead)\b/i.test(trimmed)) {
    return true;
  }
  // Allow if the line is a # NOTE / legacy reference.
  if (/^#\s*NOTE\b/i.test(trimmed) || /^#\s*legacy\b/i.test(trimmed)) return true;
  return false;
}

/**
 * Is this line a prohibitive / warn-only reference to a forbidden command?
 * Allow mentions like:
 *   # MUST NOT be used: docker compose down -v
 *   // Forbidden unless explicit approval
 *   { command: 'docker compose down -v', reason: 'Destructive' }
 */
function isProhibitiveContext(line, language) {
  const trimmed = line.trim();
  if (language === 'python' && trimmed.startsWith('#')) {
    if (/MUST NOT|FORBIDDEN|do not|don't|never|prohibited|refuse/i.test(trimmed)) return true;
  }
  if (language === 'javascript' && (trimmed.startsWith('//') || trimmed.startsWith('*'))) {
    if (/MUST NOT|FORBIDDEN|do not|don't|never|prohibited|refuse/i.test(trimmed)) return true;
  }
  // Validator/test fixture shape: { command: '...', reason: 'Destructive' }
  if (/{ command:\s*['"][^'"]+['"]/.test(trimmed) && /reason:\s*['"]/.test(trimmed)) return true;
  // Bare-string fixture list (forbidden_commands as string[]).
  if (/^[A-Z_]+\s*=\s*\[\s*['"]docker /.test(trimmed)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Mutation capability detection
// ---------------------------------------------------------------------------

/**
 * Detect lines that issue a non-auth POST/PUT/PATCH/DELETE. We treat
 * /api/auth/* URLs as auth-only (NOT mutation). Auth endpoints are session
 * sign-in / sign-up / token refresh, not entity mutation.
 *
 * Returns an array of { line, content, kind: 'js-fetch'|'js-method'|'py-urllib'|'py-requests'|'py-client-request' }.
 */
function findMutationMethodCalls(content, language) {
  const lines = content.split('\n');
  const calls = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments.
    if (isCommentOrDocstringLine(line, language)) continue;
    // Look 15 lines back/forward for the URL string to determine auth vs
    // mutation. Auth endpoints are usually defined as `const url = '/api/auth/...'`
    // in the same function but several lines above the actual fetch/Request.
    const window = lines.slice(Math.max(0, i - 15), Math.min(lines.length, i + 6)).join('\n');

    let matched = null;
    if (language === 'python') {
      if (/\bclient\.request\s*\(\s*['"](POST|PUT|PATCH|DELETE)['"]/i.test(line)) {
        matched = 'py-client-request';
      } else if (/\b(requests|httpx)\.(post|put|patch|delete)\s*\(/i.test(line)) {
        matched = 'py-requests';
      } else if (
        /urllib\.request\.Request\s*\([^)]*method\s*=\s*['"](POST|PUT|PATCH|DELETE)['"]/i.test(line)
      ) {
        // `urllib.request.Request(..., method='POST')` is only a mutation if the
        // method is a literal in the source. Skip when method=method (variable).
        matched = 'py-urllib';
      }
    } else {
      if (/\bmethod\s*:\s*['"](POST|PUT|PATCH|DELETE)['"]/i.test(line)) {
        matched = 'js-method';
      }
    }
    if (!matched) continue;
    // Exclude /api/auth/* URLs.
    if (/\/api\/auth\//i.test(window)) continue;
    calls.push({ line: i + 1, content: line, kind: matched });
  }
  return calls;
}

/**
 * Detect calls to authed_api_request("POST"/"PUT"/"PATCH"/"DELETE", ...) and
 * similar parameterized helpers. These are mutation-capable helper invocations
 * whose method is a literal string in the call site.
 */
function findParameterizedMutationHelpers(content, language) {
  const lines = content.split('\n');
  const calls = [];
  // Pattern: helperName("POST"|"PUT"|"PATCH"|"DELETE", ...)
  // The helper is named "authed_api_request" in create_bos_v141_agents.py;
  // in other scripts the helper may be "client.request" (already caught by
  // findMutationMethodCalls). We catch both `authed_api_request("POST", ...)`
  // and any other helper named *request or *api_call with a mutation method
  // first argument.
  const helperPattern =
    /\b([a-z_][a-z0-9_]*(?:request|api_call|api_request))\s*\(\s*['"](POST|PUT|PATCH|DELETE)['"]/i;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentOrDocstringLine(line, language)) continue;
    const m = line.match(helperPattern);
    if (!m) continue;
    // Filter out helper name collisions with findMutationMethodCalls (e.g.
    // `client.request(...)` was caught above; here we only want helpers
    // whose method is the first positional arg).
    if (/\bclient\.request\s*\(\s*['"]/.test(line)) continue;
    // Exclude /api/auth/* in vicinity (wider window for parameter-passed URLs).
    const window = lines.slice(Math.max(0, i - 15), Math.min(lines.length, i + 6)).join('\n');
    if (/\/api\/auth\//i.test(window)) continue;
    calls.push({
      line: i + 1,
      content: line,
      kind: language === 'python' ? 'py-helper-positional' : 'js-helper-positional',
      helper: m[1]
    });
  }
  return calls;
}

/**
 * Aggregate mutation-capable call sites for a script. A script is
 * mutation-capable if either detection method yields a hit.
 */
function findMutationCalls(content, language) {
  return [
    ...findMutationMethodCalls(content, language),
    ...findParameterizedMutationHelpers(content, language)
  ];
}

// ---------------------------------------------------------------------------
// Preflight invocation detection
// ---------------------------------------------------------------------------

/**
 * Detect preflight invocations. We accept either:
 *   - JS:    `runPreflight(`  (imported from scripts/lib/paperclip-preflight)
 *   - Python:`run_preflight(` (call site; we explicitly exclude `def run_preflight`)
 *   - JS or Python: a subprocess/child_process invocation of
 *     `cli_paperclip_preflight.js`
 */
function findPreflightInvocations(content, language) {
  const lines = content.split('\n');
  const calls = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentOrDocstringLine(line, language)) continue;
    // JS runPreflight( call site (not `function runPreflight`)
    if (language === 'javascript') {
      if (/\brunPreflight\s*\(/.test(line) && !/\bfunction\s+runPreflight\b/.test(line)) {
        calls.push({ line: i + 1, content: line, kind: 'js-direct' });
        continue;
      }
    } else {
      // Python run_preflight( call site (NOT `def run_preflight(`)
      if (/\brun_preflight\s*\(/.test(line) && !/^\s*def\s+run_preflight\s*\(/.test(line)) {
        calls.push({ line: i + 1, content: line, kind: 'py-direct' });
        continue;
      }
    }
    // cli_paperclip_preflight.js subprocess invocation (Python or JS).
    if (/cli_paperclip_preflight/.test(line)) {
      // Must be in a subprocess-like context: the line references
      // subprocess.run / subprocess.Popen / child_process / spawn, OR the
      // file imports subprocess and the variable containing the path is
      // used near a subprocess call.
      const window = lines
        .slice(Math.max(0, i - 6), Math.min(lines.length, i + 4))
        .join(' ');
      if (
        /\b(subprocess|child_process|Popen|spawn|exec)\b/i.test(window) ||
        /\bsubprocess\.run\s*\(\s*\[\s*['"]?node['"]?/i.test(window) ||
        /\bCLI_WRAPPER_RELATIVE_PATH\b/.test(content)
      ) {
        calls.push({ line: i + 1, content: line, kind: 'cli-subprocess' });
      }
    }
  }
  return calls;
}

// ---------------------------------------------------------------------------
// V-AU-01 no_stale_id_as_mutation_default
// ---------------------------------------------------------------------------

/**
 * Build the forbidden-id set from the lockfile. UUIDs are lowercased to make
 * the audit case-insensitive.
 */
function buildForbiddenIdSet(lockfile) {
  const set = new Set();
  const addAll = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const entry of arr) {
      if (typeof entry === 'string') set.add(entry.toLowerCase());
    }
  };
  addAll(lockfile && lockfile.stale_company_ids && lockfile.stale_company_ids.ids);
  addAll(lockfile && lockfile.disposable_company_ids && lockfile.disposable_company_ids.ids);
  return set;
}

/**
 * Determine if a line assigns a hardcoded UUID literal as a default for a
 * companyId variable. Patterns we treat as defaults:
 *   - DEFAULT_COMPANY_ID = 'UUID'
 *   - CANONICAL_COMPANY_ID = 'UUID'
 *   - default='UUID' (argparse)
 *   - default="UUID" (argparse)
 *   - process.env.X || 'UUID' (env fallback)
 *   - process.env.X || "UUID" (env fallback)
 *   - (env.PAPERCLIP_COMPANY_ID || 'UUID') (already-checked path)
 *   - const x = 'UUID'  (top-level const literal) — only if x contains 'company'
 */
function isDefaultAssignment(line, language) {
  const trimmed = line.trim();
  if (
    /\b(DEFAULT|CANONICAL|VERIFIED|MUTATION_DEFAULT)_COMPANY_ID\b\s*=\s*['"][a-f0-9]{8}/i.test(
      trimmed
    )
  ) {
    return true;
  }
  if (/\bdefault\s*=\s*['"][a-f0-9]{8}[-]/i.test(trimmed)) return true;
  if (/\|\|\s*['"][a-f0-9]{8}[-]/i.test(trimmed)) return true;
  // Python `or` fallback to a UUID literal (e.g. `os.environ.get('X') or 'uuid'`,
  // `process.env.X or 'uuid'`).
  if (
    /(?:\bget\(|\bprocess\.env\.|\bos\.environ\.|\benv\.)[^=]*\bor\s+['"][a-f0-9]{8}/i.test(trimmed)
  ) {
    return true;
  }
  if (/\bor\s+['"][a-f0-9]{8}[-]/i.test(trimmed)) return true;
  // Top-level const/let/var whose name contains 'company' (case-insensitive)
  // AND value is a UUID literal — but only when the literal is the FIRST
  // string on the RHS (not concatenated with other text).
  const constRe =
    /\b(const|let|var)\s+[A-Za-z_][A-Za-z0-9_]*[Cc]ompany[A-Za-z0-9_]*\s*=\s*['"]([a-f0-9]{8}-)/i;
  if (language === 'javascript' && constRe.test(trimmed)) return true;
  // Python: COMPANY_ID = 'UUID' (uppercase module-level constant).
  if (language === 'python') {
    const pyRe = /^[A-Z_][A-Z0-9_]*COMPANY[A-Z0-9_]*\s*=\s*['"]([a-f0-9]{8}-)/;
    if (pyRe.test(trimmed)) return true;
  }
  return false;
}

/**
 * Audit a single script for unguarded stale/disposable IDs as mutation
 * defaults. Returns an array of structured blockers (empty when clean).
 *
 * Public signature: takes a filepath. Tests inject content directly via
 * auditContent (below).
 */
function auditNoStaleIdMutationDefault(filepath, lockfile) {
  const content = fs.readFileSync(filepath, 'utf8');
  return auditNoStaleIdMutationDefaultContent(content, filepath, lockfile);
}

function auditNoStaleIdMutationDefaultContent(content, filepath, lockfile) {
  const blockers = [];
  const language = scriptLanguage(filepath);
  // V-AU-01 only applies to mutation-capable scripts. Readback-only scripts
  // may legitimately reference stale UUIDs as readback targets.
  const mutationCalls = findMutationCalls(content, language);
  if (mutationCalls.length === 0) return blockers;
  const lines = content.split('\n');
  const forbiddenIds = buildForbiddenIdSet(lockfile);
  if (forbiddenIds.size === 0) {
    blockers.push(
      makeBlocker({
        code: 'V-AU-01',
        kind: 'schema',
        where: 'paperclip-runtime.lock.json',
        message: 'no forbidden-id ledger in lockfile; audit cannot proceed',
        evidence: { stale_count: 0, disposable_count: 0 },
        remediation:
          'Restore stale_company_ids.ids and disposable_company_ids.ids in the lockfile.'
      })
    );
    return blockers;
  }
  // Precompute total forbidden-id count for evidence.
  const staleCount = Array.isArray(lockfile.stale_company_ids && lockfile.stale_company_ids.ids)
    ? lockfile.stale_company_ids.ids.length
    : 0;
  const dispCount = Array.isArray(
    lockfile.disposable_company_ids && lockfile.disposable_company_ids.ids
  )
    ? lockfile.disposable_company_ids.ids.length
    : 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentOrDocstringLine(line, language)) continue;
    if (isStaleRejectionListContext(line)) continue;

    const matches = line.match(UUID_LITERAL_RE);
    if (!matches) continue;

    for (const uuid of matches) {
      const low = uuid.toLowerCase();
      if (!forbiddenIds.has(low)) continue;
      // The line has a known-stale/disposable UUID literal in non-rejection
      // context. Determine if it is being USED as a default.
      if (!isDefaultAssignment(line, language)) continue;

      blockers.push(
        makeBlocker({
          code: 'V-AU-01',
          kind: 'mutation_default',
          where: `${path.relative(PROJECT_ROOT, filepath)}:${i + 1}`,
          message: 'stale or disposable UUID literal used as a mutation default',
          evidence: {
            id_prefix: uuidPrefix(uuid),
            ledger_match: low.startsWith('9feb4c') || low.startsWith('43c74a')
              ? 'stale_company_ids'
              : low === 'stale' ? 'stale_company_ids' : 'forbidden_ledger',
            stale_count: staleCount,
            disposable_count: dispCount
          },
          remediation:
            'Replace the UUID literal with a freshly readback-verified value, or remove the default and require --company-id with PAPERCLIP_COMPANY_ID_OVERRIDE=allow.'
        })
      );
    }
  }
  return blockers;
}

// ---------------------------------------------------------------------------
// V-AU-02 mutation_paths_require_preflight_gate
// ---------------------------------------------------------------------------

function auditMutationPathsRequirePreflight(filepath) {
  const content = fs.readFileSync(filepath, 'utf8');
  return auditMutationPathsRequirePreflightContent(content, filepath);
}

function auditMutationPathsRequirePreflightContent(content, filepath) {
  const language = scriptLanguage(filepath);
  const mutationCalls = findMutationCalls(content, language);
  if (mutationCalls.length === 0) return [];

  const preflightCalls = findPreflightInvocations(content, language);
  if (preflightCalls.length === 0) {
    return [
      makeBlocker({
        code: 'V-AU-02',
        kind: 'mutation_default',
        where: path.relative(PROJECT_ROOT, filepath),
        message:
          'mutation-capable script has no preflight invocation; mutation is unguarded',
        evidence: {
          mutation_call_sites: mutationCalls.length,
          first_mutation_line: mutationCalls[0].line,
          first_mutation_preview: mutationCalls[0].content.trim().slice(0, 120)
        },
        remediation:
          'Add a preflight invocation (runPreflight() in JS, run_preflight() in Python wrapping cli_paperclip_preflight.js) BEFORE the first mutation call. The script must refuse to mutate when preflight blocks.'
      })
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// V-AU-03 no_forbidden_command_invocation
// ---------------------------------------------------------------------------

function auditNoForbiddenCommandInvocation(filepath) {
  const content = fs.readFileSync(filepath, 'utf8');
  return auditNoForbiddenCommandInvocationContent(content, filepath);
}

function auditNoForbiddenCommandInvocationContent(content, filepath) {
  const language = scriptLanguage(filepath);
  const lines = content.split('\n');
  const blockers = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentOrDocstringLine(line, language)) continue;
    if (isProhibitiveContext(line, language)) continue;

    for (const cmd of R3_FORBIDDEN_COMMANDS) {
      if (!line.includes(cmd)) continue;
      // Determine if this is an actual invocation. We accept either:
      //   - Python: subprocess.run/call/Popen/check_output + cmd
      //   - Python: os.system( + cmd
      //   - JS: child_process.exec / execSync / spawnSync + cmd
      //   - Any language: shell=True or `bash -c` + cmd
      //   - Bare executable reference on a line that also references a
      //     subprocess/child_process keyword within ±6 lines.
      const window = lines.slice(Math.max(0, i - 6), Math.min(lines.length, i + 4)).join('\n');
      const pyInvocation =
        /\b(subprocess|os)\.(run|call|Popen|check_output|check_call|system)\b/i.test(window);
      const jsInvocation =
        /\bchild_process\.(exec|execSync|spawnSync|spawn)\b/i.test(window) ||
        /\b(execSync|spawnSync|spawn)\s*\(/i.test(window) ||
        /\bexec\s*\(\s*['"`]/.test(window);
      const shellInvocation = /\bshell\s*=\s*True\b/i.test(window) || /\bbash\s+-c\b/i.test(window);
      if (!pyInvocation && !jsInvocation && !shellInvocation) continue;

      blockers.push(
        makeBlocker({
          code: 'V-AU-03',
          kind: 'command',
          where: `${path.relative(PROJECT_ROOT, filepath)}:${i + 1}`,
          message: `forbidden command invoked: ${cmd}`,
          evidence: { command: cmd, line_preview: line.trim().slice(0, 120) },
          remediation:
            'Remove the invocation. For recovery scenarios that genuinely need destructive docker commands, use the safe_restart_command from paperclip-runtime.lock.json and obtain explicit operator approval.'
        })
      );
    }
  }
  return blockers;
}

// ---------------------------------------------------------------------------
// V-AU-04 paperclip_api_key_not_used_for_mutation_auth
// ---------------------------------------------------------------------------

function auditPaperclipApiKeyNotMutationAuth(filepath) {
  const content = fs.readFileSync(filepath, 'utf8');
  return auditPaperclipApiKeyNotMutationAuthContent(content, filepath);
}

function auditPaperclipApiKeyNotMutationAuthContent(content, filepath) {
  const language = scriptLanguage(filepath);
  const mutationCalls = findMutationCalls(content, language);
  if (mutationCalls.length === 0) return [];

  const lines = content.split('\n');
  const blockers = [];

  // Track each mutation-capable function block by detecting the nearest
  // surrounding `def` (Python) or `function`/`async function` (JS). For each
  // block, decide whether PAPERCLIP_API_KEY is referenced as the Authorization
  // Bearer source.
  //
  // Heuristic (sufficient for the current scripts/ corpus):
  //   A function block is "API-key-authed" if a line within ±20 lines of a
  //   mutation call sets headers["Authorization"] = `Bearer ${api_key}` (or
  //   similar) where api_key traces back to PAPERCLIP_API_KEY. Such a block
  //   is blocked.

  // Find every Authorization = `Bearer ...` line and whether the source is
  // PAPERCLIP_API_KEY.
  const bearerLines = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/Authorization\b/i.test(line)) continue;
    if (!/Bearer\b/i.test(line)) continue;
    bearerLines.push({ line: i + 1, content: line });
  }

  if (bearerLines.length === 0) return [];

  // For each mutation call, check whether a Bearer Authorization assignment
  // is within the SAME function block. We approximate "same block" by:
  //   - Find the most recent def/function declaration above the mutation
  //     call.
  //   - The Bearer line must be inside that block (i.e., declared AFTER the
  //     def/function header and BEFORE the mutation call OR within ±15 lines
  //     of the mutation call).
  const functionHeaderPattern = language === 'python'
    ? /^\s*(async\s+)?def\s+([a-z_][a-z0-9_]*)\s*\(/
    : /^\s*(async\s+)?function\s+([a-z_][a-z0-9_]*)\s*\(/;

  for (const mutation of mutationCalls) {
    // Find the enclosing function declaration (smallest line < mutation.line).
    let enclosingHeader = -1;
    for (let i = mutation.line - 1; i >= 0; i--) {
      if (functionHeaderPattern.test(lines[i] || '')) {
        enclosingHeader = i;
        break;
      }
    }

    for (const bearer of bearerLines) {
      // Bearer must be inside the enclosing function (between header and mutation).
      if (enclosingHeader >= 0 && bearer.line <= enclosingHeader) continue;
      if (bearer.line > mutation.line + 5) continue;
      // Bearer line must source from PAPERCLIP_API_KEY (or an alias).
      // Acceptable alias patterns: apiKey, api_key, api-key, --api-key-env
      // (the default env var is PAPERCLIP_API_KEY). The audit treats any
      // token-shaped reference as API-key-sourced so diagnostic-only paths
      // are only allowed when the script explicitly filters PAPERCLIP_API_KEY
      // out of the mutation path.
      const isApiKeySourced =
        /PAPERCLIP_API_KEY/.test(bearer.content) ||
        /\bapi[_-]?[Kk]ey\b/.test(bearer.content) ||
        /--api-key-env/.test(bearer.content);
      if (!isApiKeySourced) continue;

      // Check whether the script rejects PAPERCLIP_API_KEY for mutations.
      const rejectsForMutation =
        /PREFLIGHT_REJECTED_ENV_TOKENS/.test(content) ||
        /REJECTED_AUTH_TOKENS/.test(content) ||
        /V-PF-04/.test(content) ||
        /never\s+used\s+for\s+(POST|PUT|PATCH|DELETE|mutation)/i.test(content) ||
        /PAPERCLIP_API_KEY\s+MUST\s+NOT\s+be\s+set/i.test(content) ||
        /PAPERCLIP_API_KEY\s+MUST\s+NOT\s+be\s+used/i.test(content);

      if (rejectsForMutation) continue;

      blockers.push(
        makeBlocker({
          code: 'V-AU-04',
          kind: 'auth',
          where: `${path.relative(PROJECT_ROOT, filepath)}:${bearer.line}`,
          message:
            'PAPERCLIP_API_KEY used as Authorization Bearer source in mutation path',
          evidence: {
            bearer_line: bearer.line,
            mutation_line: mutation.line,
            bearer_preview: bearer.content.trim().slice(0, 120)
          },
          remediation:
            'Demote PAPERCLIP_API_KEY to diagnostic-only; route all POST/PUT/PATCH/DELETE through session-cookie auth (PAPERCLIP_EMAIL/PAPERCLIP_PASSWORD) gated by paperclip-preflight V-PF-04.'
        })
      );
    }
  }
  return blockers;
}

// ---------------------------------------------------------------------------
// Aggregate audit
// ---------------------------------------------------------------------------

/**
 * Run all four audit classes over every auditable script in scriptsDir.
 * Returns an array of structured blockers (empty when clean).
 */
function auditScriptsDir(scriptsDir, lockfile) {
  const blockers = [];
  const scripts = listAuditableScripts(scriptsDir);
  for (const script of scripts) {
    blockers.push(...auditNoStaleIdMutationDefault(script, lockfile));
    blockers.push(...auditMutationPathsRequirePreflight(script));
    blockers.push(...auditNoForbiddenCommandInvocation(script));
    blockers.push(...auditPaperclipApiKeyNotMutationAuth(script));
  }
  return blockers;
}

/**
 * Run all four audit classes against a list of (path, content) pairs. Used
 * by tests to inject synthetic scripts without writing to scripts/.
 */
function auditSyntheticScripts(scripts, lockfile) {
  const blockers = [];
  for (const { path: p, content } of scripts) {
    blockers.push(...auditNoStaleIdMutationDefaultContent(content, p, lockfile));
    blockers.push(...auditMutationPathsRequirePreflightContent(content, p));
    blockers.push(...auditNoForbiddenCommandInvocationContent(content, p));
    blockers.push(...auditPaperclipApiKeyNotMutationAuthContent(content, p));
  }
  return blockers;
}

// ===========================================================================
// Test suite
// ===========================================================================

/**
 * Build a minimal valid lockfile fixture for tests. Mirrors the helper in
 * scripts/validate_paperclip_runtime_lock.js so each test starts from a
 * known-good baseline and only mutates the field under test.
 */
function minimalValidLockfile() {
  return {
    $schema: 'gsd/m014-s03-runtime-lockfile-v1',
    milestone: 'M014-a9jj46',
    slice: 'S03',
    task: 'T04',
    purpose: 'audit-test-fixture',
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
      ids: [
        '9feb4c22-05b9-401e-ba67-0e866e3056da',
        '43c74adb-b194-44d1-8f8e-ba142544bb9d',
        '1a194762-0000-4000-8000-000000000000',
        '7595fd85-0000-4000-8000-000000000000',
        '7eede16c-0000-4000-8000-000000000000',
        '8233ea7b-0000-4000-8000-000000000000'
      ]
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

function loadLockfileOrFail() {
  if (!fs.existsSync(LOCKFILE_PATH)) {
    throw new Error(`lockfile not found at ${LOCKFILE_PATH}`);
  }
  return JSON.parse(fs.readFileSync(LOCKFILE_PATH, 'utf8'));
}

function makeTmpScript(content, basename = 'synthetic.js') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'au-test-'));
  const p = path.join(dir, basename);
  fs.writeFileSync(p, content);
  return { path: p, dir };
}

function cleanupTmpScript(p) {
  try {
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
    if (p) {
      const dir = path.dirname(p);
      if (fs.existsSync(dir)) fs.rmdirSync(dir);
    }
  } catch (_err) {
    // best-effort cleanup; tmpdir() is wiped by the OS eventually
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('validate_m014_s03_script_hardening', () => {
  describe('module surface', () => {
    it('exports the four audit-class functions and helpers', () => {
      assert.equal(typeof auditNoStaleIdMutationDefault, 'function');
      assert.equal(typeof auditMutationPathsRequirePreflight, 'function');
      assert.equal(typeof auditNoForbiddenCommandInvocation, 'function');
      assert.equal(typeof auditPaperclipApiKeyNotMutationAuth, 'function');
      assert.equal(typeof auditScriptsDir, 'function');
      assert.equal(typeof auditSyntheticScripts, 'function');
      assert.equal(typeof listAuditableScripts, 'function');
      assert.equal(typeof isAuditableScript, 'function');
      assert.equal(typeof buildForbiddenIdSet, 'function');
      assert.equal(typeof makeBlocker, 'function');
    });

    it('makeBlocker emits the canonical shape (code, kind, where, message, evidence, remediation)', () => {
      const b = makeBlocker({
        code: 'V-AU-XX',
        kind: 'mutation_default',
        where: 'scripts/example.py:7',
        message: 'demo',
        evidence: { foo: 'bar' },
        remediation: 'fix it'
      });
      assert.equal(typeof b.code, 'string');
      assert.ok(b.code.startsWith('V-AU-'));
      assert.equal(typeof b.kind, 'string');
      assert.ok(CANONICAL_KINDS.has(b.kind));
      assert.equal(typeof b.where, 'string');
      assert.equal(typeof b.message, 'string');
      assert.equal(typeof b.evidence, 'object');
      assert.equal(typeof b.remediation, 'string');
    });
  });

  describe('V-AU-01 no_stale_id_as_mutation_default', () => {
    it('flags DEFAULT_COMPANY_ID = stale-uuid in Python', () => {
      const content = `#!/usr/bin/env python3
import requests
DEFAULT_COMPANY_ID = '9feb4c22-05b9-401e-ba67-0e866e3056da'

def main():
    requests.post(f'https://paperclip/api/companies/{DEFAULT_COMPANY_ID}/issues', json={})
`;
      const lf = minimalValidLockfile();
      const blockers = auditNoStaleIdMutationDefaultContent(content, 'scripts/x.py', lf);
      assert.equal(blockers.length, 1, `expected 1 blocker, got ${blockers.length}`);
      const b = blockers[0];
      assert.equal(b.code, 'V-AU-01');
      assert.equal(b.kind, 'mutation_default');
      assert.equal(b.evidence.id_prefix, '9feb4c22');
      assert.ok(b.where.includes('x.py:'));
    });

    it('flags CANONICAL_COMPANY_ID = stale-uuid in JavaScript', () => {
      const content = `// preflight-gated mutation
const CANONICAL_COMPANY_ID = '43c74adb-b194-44d1-8f8e-ba142544bb9d';
const { runPreflight } = require('./lib/paperclip-preflight');

async function createIssue() {
  const result = await runPreflight({ explicitCompanyId: CANONICAL_COMPANY_ID });
  if (!result.pass) return;
  await fetch('/api/companies/' + CANONICAL_COMPANY_ID + '/issues', { method: 'POST' });
}
`;
      const lf = minimalValidLockfile();
      const blockers = auditNoStaleIdMutationDefaultContent(content, 'scripts/x.js', lf);
      assert.ok(
        blockers.some((b) => b.code === 'V-AU-01' && b.evidence.id_prefix === '43c74adb'),
        `expected V-AU-01 for 43c74adb, got ${JSON.stringify(blockers.map((b) => ({ code: b.code, ev: b.evidence })))}`
      );
    });

    it('flags process.env.X || stale-uuid fallback', () => {
      const content = `#!/usr/bin/env python3
import requests, os
COMPANY_ID = os.environ.get('PAPERCLIP_COMPANY_ID') or '1a194762-0000-4000-8000-000000000000'

def main():
    requests.post(f'https://paperclip/api/companies/{COMPANY_ID}/issues', json={})
`;
      const lf = minimalValidLockfile();
      const blockers = auditNoStaleIdMutationDefaultContent(content, 'scripts/x.py', lf);
      assert.equal(blockers.length, 1);
      assert.equal(blockers[0].evidence.id_prefix, '1a194762');
    });

    it('flags argparse default=stale-uuid', () => {
      const content = `#!/usr/bin/env python3
import requests, argparse
parser = argparse.ArgumentParser()
parser.add_argument('--company-id', default='7595fd85-0000-4000-8000-000000000000')

def main():
    args = parser.parse_args()
    requests.post(f'https://paperclip/api/companies/{args.company_id}/issues', json={})
`;
      const lf = minimalValidLockfile();
      const blockers = auditNoStaleIdMutationDefaultContent(content, 'scripts/x.py', lf);
      assert.equal(blockers.length, 1);
      assert.equal(blockers[0].evidence.id_prefix, '7595fd85');
    });

    it('flags disposable_company_ids entries too', () => {
      const lf = minimalValidLockfile();
      lf.disposable_company_ids.ids = ['aaaa1111-2222-3333-4444-555566667777'];
      const content = `import requests
DEFAULT_COMPANY_ID = 'aaaa1111-2222-3333-4444-555566667777'

def main():
    requests.post(f'https://paperclip/api/companies/{DEFAULT_COMPANY_ID}/issues', json={})
`;
      const blockers = auditNoStaleIdMutationDefaultContent(content, 'scripts/x.py', lf);
      assert.equal(blockers.length, 1);
      assert.equal(blockers[0].evidence.id_prefix, 'aaaa1111');
    });

    it('allows a stale UUID in a # NOTE / legacy comment', () => {
      const content = `#!/usr/bin/env python3
# NOTE: The legacy DEFAULT_COMPANY_ID = "43c74adb-..." constant was removed
DEFAULT_COMPANY_ID = None
`;
      const lf = minimalValidLockfile();
      const blockers = auditNoStaleIdMutationDefaultContent(content, 'scripts/x.py', lf);
      assert.deepEqual(blockers, []);
    });

    it('allows a stale UUID inside an explicit REJECTED_STALE_IDS list', () => {
      const content = `#!/usr/bin/env python3
REJECTED_STALE_IDS = ['9feb4c22-05b9-401e-ba67-0e866e3056da', '43c74adb-b194-44d1-8f8e-ba142544bb9d']
`;
      const lf = minimalValidLockfile();
      const blockers = auditNoStaleIdMutationDefaultContent(content, 'scripts/x.py', lf);
      assert.deepEqual(blockers, []);
    });

    it('allows stale UUID inside an .includes() membership check', () => {
      const content = `#!/usr/bin/env python3
def is_stale(cid):
    return cid in ['9feb4c22-05b9-401e-ba67-0e866e3056da']
`;
      const lf = minimalValidLockfile();
      const blockers = auditNoStaleIdMutationDefaultContent(content, 'scripts/x.py', lf);
      assert.deepEqual(blockers, []);
    });

    it('allows stale UUID inside a stale_company_ids.ids array literal', () => {
      const content = `#!/usr/bin/env python3
stale_company_ids = ['9feb4c22-05b9-401e-ba67-0e866e3056da']
`;
      const lf = minimalValidLockfile();
      const blockers = auditNoStaleIdMutationDefaultContent(content, 'scripts/x.py', lf);
      assert.deepEqual(blockers, []);
    });

    it('does NOT flag a UUID that is not in stale/disposable ledger', () => {
      const content = `#!/usr/bin/env python3
DEFAULT_COMPANY_ID = 'aaaa1111-2222-3333-4444-555566667777'
`;
      const lf = minimalValidLockfile();
      const blockers = auditNoStaleIdMutationDefaultContent(content, 'scripts/x.py', lf);
      assert.deepEqual(blockers, []);
    });

    it('emits a single schema blocker when the lockfile has no forbidden IDs', () => {
      const lf = minimalValidLockfile();
      lf.stale_company_ids.ids = [];
      lf.disposable_company_ids.ids = [];
      const content = `import requests
DEFAULT_COMPANY_ID = '9feb4c22-05b9-401e-ba67-0e866e3056da'

def main():
    requests.post(f'https://paperclip/api/companies/{DEFAULT_COMPANY_ID}/issues', json={})
`;
      const blockers = auditNoStaleIdMutationDefaultContent(content, 'scripts/x.py', lf);
      assert.equal(blockers.length, 1);
      assert.equal(blockers[0].code, 'V-AU-01');
      assert.equal(blockers[0].kind, 'schema');
    });

    it('does NOT echo the full UUID in evidence (defense in depth)', () => {
      const content = `DEFAULT_COMPANY_ID = '9feb4c22-05b9-401e-ba67-0e866e3056da'`;
      const lf = minimalValidLockfile();
      const blockers = auditNoStaleIdMutationDefaultContent(content, 'scripts/x.py', lf);
      const text = JSON.stringify(blockers);
      assert.ok(!text.includes('0e866e3056da'), 'full UUID must not be echoed');
      assert.ok(!/api_key=|password=|cookie=/i.test(text));
    });
  });

  describe('V-AU-02 mutation_paths_require_preflight_gate', () => {
    it('flags a Python mutation script with no preflight invocation', () => {
      const content = `#!/usr/bin/env python3
import requests

def main():
    requests.post('https://paperclip/api/companies/abc/issues', json={'title': 'x'})

if __name__ == '__main__':
    main()
`;
      const blockers = auditMutationPathsRequirePreflightContent(
        content,
        'scripts/x.py'
      );
      assert.equal(blockers.length, 1);
      const b = blockers[0];
      assert.equal(b.code, 'V-AU-02');
      assert.equal(b.kind, 'mutation_default');
      assert.equal(b.evidence.mutation_call_sites >= 1, true);
    });

    it('flags a JS mutation script with no runPreflight() and no cli wrapper', () => {
      const content = `async function main() {
  await fetch('/api/companies/abc/issues', { method: 'POST' });
}
main();
`;
      const blockers = auditMutationPathsRequirePreflightContent(
        content,
        'scripts/x.js'
      );
      assert.equal(blockers.length, 1);
      assert.equal(blockers[0].code, 'V-AU-02');
    });

    it('passes a JS script that imports and calls runPreflight()', () => {
      const content = `const { runPreflight } = require('./lib/paperclip-preflight');

async function main() {
  const result = await runPreflight({ confirmation: { explicit: true, reason: 'x' } });
  if (!result.pass) return;
  await fetch('/api/companies/abc/issues', { method: 'POST' });
}
main();
`;
      const blockers = auditMutationPathsRequirePreflightContent(
        content,
        'scripts/x.js'
      );
      assert.deepEqual(blockers, []);
    });

    it('passes a Python script that invokes run_preflight() (non-def)', () => {
      const content = `#!/usr/bin/env python3
def run_preflight(cid):
    return subprocess.run(['node', 'scripts/cli_paperclip_preflight.js'], capture_output=True)

def main():
    preflight = run_preflight('abc')
    if preflight.returncode != 0:
        return
    client.request('POST', '/api/companies/abc/issues', {})

if __name__ == '__main__':
    main()
`;
      const blockers = auditMutationPathsRequirePreflightContent(
        content,
        'scripts/x.py'
      );
      assert.deepEqual(blockers, []);
    });

    it('does NOT flag a readback-only GET script', () => {
      const content = `const r1 = await fetch('/api/companies/abc', { method: 'GET' });
const r2 = await fetch('/api/companies/abc/agents', { method: 'GET' });
`;
      const blockers = auditMutationPathsRequirePreflightContent(
        content,
        'scripts/x.js'
      );
      assert.deepEqual(blockers, []);
    });

    it('does NOT flag /api/auth/* POST (auth is not a Paperclip mutation)', () => {
      const content = `await fetch('/api/auth/sign-in/email', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'x', password: 'y' })
});
`;
      const blockers = auditMutationPathsRequirePreflightContent(
        content,
        'scripts/x.js'
      );
      assert.deepEqual(blockers, []);
    });

    it('flags authed_api_request("POST", ...) without preflight', () => {
      const content = `#!/usr/bin/env python3
def create_agent(company_id, base_url, session_cookie):
    return authed_api_request('POST', f'/api/companies/{company_id}/agents', base_url, session_cookie)
`;
      const blockers = auditMutationPathsRequirePreflightContent(
        content,
        'scripts/x.py'
      );
      assert.equal(blockers.length, 1);
      assert.equal(blockers[0].code, 'V-AU-02');
    });

    it('flags client.request("PUT", ...) without preflight', () => {
      const content = `#!/usr/bin/env python3
def update(issue_id):
    return client.request('PUT', f'/api/issues/{issue_id}', {})
`;
      const blockers = auditMutationPathsRequirePreflightContent(
        content,
        'scripts/x.py'
      );
      assert.equal(blockers.length, 1);
      assert.equal(blockers[0].code, 'V-AU-02');
    });
  });

  describe('V-AU-03 no_forbidden_command_invocation', () => {
    it('flags subprocess.run with shell=True containing "docker compose down -v"', () => {
      const content = `#!/usr/bin/env python3
import subprocess
subprocess.run('docker compose down -v', shell=True, check=True)
`;
      const blockers = auditNoForbiddenCommandInvocationContent(content, 'scripts/x.py');
      assert.equal(blockers.length, 1);
      assert.equal(blockers[0].code, 'V-AU-03');
      assert.equal(blockers[0].kind, 'command');
      assert.equal(blockers[0].evidence.command, 'docker compose down -v');
    });

    it('flags os.system with "docker volume prune"', () => {
      const content = `#!/usr/bin/env python3
import os
os.system('docker volume prune --force')
`;
      const blockers = auditNoForbiddenCommandInvocationContent(content, 'scripts/x.py');
      assert.equal(blockers.length, 1);
      assert.equal(blockers[0].evidence.command, 'docker volume prune');
    });

    it('flags child_process.execSync with forbidden command in JS', () => {
      const content = `const { execSync } = require('child_process');
execSync('docker system prune --force');
`;
      const blockers = auditNoForbiddenCommandInvocationContent(content, 'scripts/x.js');
      assert.equal(blockers.length, 1);
      assert.equal(blockers[0].evidence.command, 'docker system prune');
    });

    it('flags "docker rm" subprocess invocation', () => {
      const content = `#!/usr/bin/env python3
import subprocess
subprocess.run('docker rm paperclip_sandbox-paperclip-1', shell=True, check=True)
`;
      const blockers = auditNoForbiddenCommandInvocationContent(content, 'scripts/x.py');
      assert.equal(blockers.length, 1);
      assert.equal(blockers[0].evidence.command, 'docker rm');
    });

    it('allows a # MUST NOT be used comment that names the command', () => {
      const content = `#!/usr/bin/env python3
# The following MUST NOT be used: docker compose down -v wipes data.
# Also: docker volume prune is forbidden.
`;
      const blockers = auditNoForbiddenCommandInvocationContent(content, 'scripts/x.py');
      assert.deepEqual(blockers, []);
    });

    it('allows a fixture list of forbidden_commands (validator/test reference)', () => {
      const content = `#!/usr/bin/env python3
FORBIDDEN_COMMANDS = [
  'docker compose down -v',
  'docker volume prune',
  'docker system prune',
  'docker rm',
  'docker volume rm'
]
`;
      const blockers = auditNoForbiddenCommandInvocationContent(content, 'scripts/x.py');
      assert.deepEqual(blockers, []);
    });

    it('allows a JS validator fixture list with reason fields', () => {
      const content = `const FORBIDDEN_COMMANDS = [
  { command: 'docker compose down -v', reason: 'Destructive' },
  { command: 'docker volume prune', reason: 'Destructive' }
];
`;
      const blockers = auditNoForbiddenCommandInvocationContent(content, 'scripts/x.js');
      assert.deepEqual(blockers, []);
    });

    it('does not flag a bare mention without subprocess context', () => {
      const content = `#!/usr/bin/env python3
# discusses docker compose down -v in a comment for docs
note = "we never run docker compose down -v"
`;
      const blockers = auditNoForbiddenCommandInvocationContent(content, 'scripts/x.py');
      assert.deepEqual(blockers, []);
    });
  });

  describe('V-AU-04 paperclip_api_key_not_used_for_mutation_auth', () => {
    it('flags Bearer Authorization sourced from PAPERCLIP_API_KEY on a POST path', () => {
      const content = `#!/usr/bin/env python3
def call_post(company_id, base_url, api_key):
    headers = {'Authorization': f'Bearer {api_key}'}
    return authed_api_request('POST', f'/api/companies/{company_id}/agents', base_url, '', headers)
`;
      const blockers = auditPaperclipApiKeyNotMutationAuthContent(content, 'scripts/x.py');
      assert.equal(blockers.length, 1);
      const b = blockers[0];
      assert.equal(b.code, 'V-AU-04');
      assert.equal(b.kind, 'auth');
      assert.equal(b.evidence.mutation_line >= 1, true);
    });

    it('allows Bearer Authorization when the script rejects PAPERCLIP_API_KEY for mutations', () => {
      const content = `#!/usr/bin/env python3
# PAPERCLIP_API_KEY MUST NOT be set (rejected by V-PF-04)
PREFLIGHT_REJECTED_ENV_TOKENS = ('PAPERCLIP_API_KEY',)

def call_post(company_id, base_url, api_key):
    headers = {'Authorization': f'Bearer {api_key}'}
    return authed_api_request('POST', f'/api/companies/{company_id}/agents', base_url, '', headers)
`;
      const blockers = auditPaperclipApiKeyNotMutationAuthContent(content, 'scripts/x.py');
      assert.deepEqual(blockers, []);
    });

    it('does not flag Bearer Authorization used only for GET (readback)', () => {
      const content = `#!/usr/bin/env python3
def call_get(company_id, base_url, api_key):
    headers = {'Authorization': f'Bearer {api_key}'}
    return authed_api_request('GET', f'/api/companies/{company_id}/agents', base_url, '', headers)
`;
      const blockers = auditPaperclipApiKeyNotMutationAuthContent(content, 'scripts/x.py');
      assert.deepEqual(blockers, []);
    });

    it('does not flag a script that uses PAPERCLIP_API_KEY but routes mutations through session cookie', () => {
      const content = `#!/usr/bin/env python3
# PAPERCLIP_API_KEY MUST NOT be used for POST/PUT/PATCH/DELETE
PREFLIGHT_REJECTED_ENV_TOKENS = ('PAPERCLIP_API_KEY',)

def create_agent(company_id, base_url, session_cookie):
    return authed_api_request('POST', f'/api/companies/{company_id}/agents', base_url, session_cookie, {})
`;
      const blockers = auditPaperclipApiKeyNotMutationAuthContent(content, 'scripts/x.py');
      assert.deepEqual(blockers, []);
    });

    it('flags JS Bearer Authorization on a POST fetch', () => {
      const content = `const apiKey = process.env.PAPERCLIP_API_KEY;
async function createIssue() {
  await fetch('/api/companies/abc/issues', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey }
  });
}
createIssue();
`;
      const blockers = auditPaperclipApiKeyNotMutationAuthContent(content, 'scripts/x.js');
      assert.equal(blockers.length, 1);
      assert.equal(blockers[0].code, 'V-AU-04');
    });
  });

  describe('V-AU-05 structured_blocker_output', () => {
    it('every emitted blocker has code/kind/where/message/evidence/remediation', () => {
      const lf = minimalValidLockfile();
      const scripts = [
        {
          path: 'scripts/bad_default.py',
          content: `#!/usr/bin/env python3
DEFAULT_COMPANY_ID = '9feb4c22-05b9-401e-ba67-0e866e3056da'
def main():
    import requests
    requests.post('https://paperclip/api/companies/x/issues', json={})
`
        },
        {
          path: 'scripts/bad_preflight.js',
          content: `async function main() {
  await fetch('/api/companies/x/issues', { method: 'POST' });
}
main();
`
        },
        {
          path: 'scripts/bad_command.py',
          content: `#!/usr/bin/env python3
import subprocess
subprocess.run('docker compose down -v', shell=True)
`
        },
        {
          path: 'scripts/bad_api_key.py',
          content: `#!/usr/bin/env python3
def call_post(company_id, base_url, api_key):
    headers = {'Authorization': f'Bearer {api_key}'}
    return authed_api_request('POST', f'/api/companies/{company_id}/agents', base_url, '', headers)
`
        }
      ];
      const blockers = auditSyntheticScripts(scripts, lf);
      assert.ok(blockers.length >= 4, `expected >=4 blockers, got ${blockers.length}`);
      for (const b of blockers) {
        assert.equal(typeof b.code, 'string');
        assert.ok(b.code.startsWith('V-AU-'), `bad code: ${b.code}`);
        assert.ok(CANONICAL_KINDS.has(b.kind), `bad kind: ${b.kind}`);
        assert.equal(typeof b.where, 'string');
        assert.ok(b.where.length > 0);
        assert.equal(typeof b.message, 'string');
        assert.ok(b.message.length > 0);
        // Evidence is structured; never raw secrets.
        const text = JSON.stringify(b);
        assert.ok(!/api_key=|password=|cookie=/i.test(text));
        assert.ok(!/[A-Za-z0-9+/]{60,}={0,2}/.test(text), 'looks like raw base64 token');
      }
    });
  });

  describe('integration: shipped scripts/', () => {
    it('the four T03-hardened scripts pass the audit', () => {
      const lf = loadLockfileOrFail();
      const hardened = [
        'scripts/create_bos_v141_agents.py',
        'scripts/m013_s02_create_tech_debt_issue.js',
        'scripts/run_m005_s01_hermes_xiaomi_probe.py',
        'scripts/run_s04_live_artifact_flow.py'
      ];
      const blockers = [];
      for (const rel of hardened) {
        const abs = path.resolve(PROJECT_ROOT, rel);
        if (!fs.existsSync(abs)) continue;
        const content = fs.readFileSync(abs, 'utf8');
        blockers.push(...auditNoStaleIdMutationDefaultContent(content, rel, lf));
        blockers.push(...auditMutationPathsRequirePreflightContent(content, rel));
        blockers.push(...auditNoForbiddenCommandInvocationContent(content, rel));
        blockers.push(...auditPaperclipApiKeyNotMutationAuthContent(content, rel));
      }
      const summary = blockers.map((b) => ({ code: b.code, where: b.where }));
      assert.deepEqual(
        blockers,
        [],
        `expected zero audit blockers for hardened scripts, got ${JSON.stringify(summary)}`
      );
    });

    it('readback-only scripts in scripts/ are NOT flagged by V-AU-01 or V-AU-02', () => {
      // m011/m012/m012_s06 are documented as readback / auth-only scripts.
      // The audit must NOT flag them as mutation-capable even though they
      // reference stale UUIDs as constants.
      const lf = loadLockfileOrFail();
      const readbackOnly = [
        'scripts/m011_s02_paperclip_readonly_reprobe.js',
        'scripts/m012_s01_canonical_paperclip_readback.js',
        'scripts/m012_s01_cleanup_gate.js',
        'scripts/m012_s06_mission_issue_verify.js',
        'scripts/m012_s06_session_auth_readback.js'
      ];
      const blockers = [];
      for (const rel of readbackOnly) {
        const abs = path.resolve(PROJECT_ROOT, rel);
        if (!fs.existsSync(abs)) continue;
        const content = fs.readFileSync(abs, 'utf8');
        blockers.push(...auditNoStaleIdMutationDefaultContent(content, rel, lf));
        blockers.push(...auditMutationPathsRequirePreflightContent(content, rel));
        blockers.push(...auditNoForbiddenCommandInvocationContent(content, rel));
        blockers.push(...auditPaperclipApiKeyNotMutationAuthContent(content, rel));
      }
      const summary = blockers.map((b) => ({ code: b.code, where: b.where }));
      assert.deepEqual(
        blockers,
        [],
        `expected zero audit blockers for readback-only scripts, got ${JSON.stringify(summary)}`
      );
    });
  });

  describe('helpers', () => {
    it('isAuditableScript excludes tests, validators, lib, CLI wrapper', () => {
      assert.equal(isAuditableScript(path.join(SCRIPTS_DIR, 'test_x.js')), false);
      assert.equal(isAuditableScript(path.join(SCRIPTS_DIR, 'validate_x.js')), false);
      assert.equal(isAuditableScript(path.join(SCRIPTS_DIR, 'cli_paperclip_preflight.js')), false);
      assert.equal(isAuditableScript(path.join(SCRIPTS_DIR, 'lib', 'paperclip-preflight.js')), false);
      assert.equal(isAuditableScript(path.join(SCRIPTS_DIR, 'create_bos_v141_agents.py')), true);
      assert.equal(isAuditableScript(path.join(SCRIPTS_DIR, 'm013_s02_create_tech_debt_issue.js')), true);
    });

    it('isCommentOrDocstringLine recognizes comments and docstrings', () => {
      assert.equal(isCommentOrDocstringLine('# hello', 'python'), true);
      assert.equal(isCommentOrDocstringLine('// hello', 'javascript'), true);
      assert.equal(isCommentOrDocstringLine('  const x = 1;', 'javascript'), false);
    });

    it('isStaleRejectionListContext allows REJECTED/STALE/DISPOSABLE list contexts', () => {
      assert.equal(
        isStaleRejectionListContext(
          "REJECTED_STALE_IDS = ['9feb4c22-05b9-401e-ba67-0e866e3056da']"
        ),
        true
      );
      assert.equal(isStaleRejectionListContext("stale_company_ids = ['9feb4c22-…']"), true);
      assert.equal(
        isStaleRejectionListContext("if entry === '9feb4c22-…': return reject"),
        true
      );
      assert.equal(
        isStaleRejectionListContext("const DEFAULT_COMPANY_ID = '9feb4c22-…'"),
        false
      );
      assert.equal(
        isStaleRejectionListContext("parser.add_argument('--company-id', default='9feb4c22-…')"),
        false
      );
    });

    it('isProhibitiveContext allows fixture lists and MUST NOT comments', () => {
      assert.equal(
        isProhibitiveContext(
          "# docker compose down -v MUST NOT be used",
          'python'
        ),
        true
      );
      assert.equal(
        isProhibitiveContext(
          "{ command: 'docker compose down -v', reason: 'Destructive' }",
          'python'
        ),
        true
      );
      assert.equal(
        isProhibitiveContext(
          "FORBIDDEN_COMMANDS = ['docker compose down -v']",
          'python'
        ),
        true
      );
      assert.equal(isProhibitiveContext("subprocess.run('docker compose down -v')", 'python'), false);
    });

    it('buildForbiddenIdSet lowercases and merges stale + disposable', () => {
      const lf = minimalValidLockfile();
      lf.disposable_company_ids.ids = ['AAAA1111-BBBB-2222-3333-444455556666'];
      const set = buildForbiddenIdSet(lf);
      assert.ok(set.has('9feb4c22-05b9-401e-ba67-0e866e3056da'));
      assert.ok(set.has('aaaa1111-bbbb-2222-3333-444455556666'));
    });

    it('listAuditableScripts returns sorted script basenames', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'au-listing-'));
      fs.writeFileSync(path.join(tmp, 'a.py'), '');
      fs.writeFileSync(path.join(tmp, 'b.js'), '');
      fs.writeFileSync(path.join(tmp, 'test_x.js'), '');
      fs.writeFileSync(path.join(tmp, 'validate_x.js'), '');
      fs.writeFileSync(path.join(tmp, 'README.md'), '');
      const list = listAuditableScripts(tmp);
      assert.deepEqual(
        list.map((p) => path.basename(p)),
        ['a.py', 'b.js']
      );
      fs.rmSync(tmp, { recursive: true, force: true });
    });
  });
});

module.exports = {
  auditScriptsDir,
  auditSyntheticScripts,
  auditNoStaleIdMutationDefault,
  auditNoStaleIdMutationDefaultContent,
  auditMutationPathsRequirePreflight,
  auditMutationPathsRequirePreflightContent,
  auditNoForbiddenCommandInvocation,
  auditNoForbiddenCommandInvocationContent,
  auditPaperclipApiKeyNotMutationAuth,
  auditPaperclipApiKeyNotMutationAuthContent,
  isAuditableScript,
  listAuditableScripts,
  isCommentOrDocstringLine,
  isStaleRejectionListContext,
  isProhibitiveContext,
  buildForbiddenIdSet,
  makeBlocker,
  scriptLanguage,
  UUID_LITERAL_RE,
  R3_FORBIDDEN_COMMANDS,
  CANONICAL_KINDS,
  findMutationCalls,
  findPreflightInvocations,
  minimalValidLockfile,
  LOCKFILE_PATH,
  SCRIPTS_DIR
};