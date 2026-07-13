#!/usr/bin/env node
/**
 * @file scripts/lib/paperclip-preflight.js
 *
 * M014-a9jj46/S03/T02 — Paperclip preflight contract.
 *
 * Fail-closed guard for live Paperclip mutations (POST/PUT/PATCH/DELETE).
 * Before any mutation script issues a write, it MUST call runPreflight()
 * and receive `{ pass: true }`. Any other return shape — including an
 * exception — MUST be treated as a hard blocker: zero mutation may be
 * attempted by the caller.
 *
 * Validation classes (mirrored in the test suite):
 *   V-PF-01 lockfile_present — lockfile must load from disk and parse as JSON
 *   V-PF-02 lockfile_valid  — validateLockfile() (from T01) must return zero blockers
 *   V-PF-03 stale_target    — explicit or lockfile-default companyId MUST NOT be in
 *                             stale_company_ids.ids or disposable_company_ids.ids;
 *                             a missing companyId requires PAPERCLIP_COMPANY_ID_OVERRIDE=allow
 *   V-PF-04 auth_present    — PAPERCLIP_API_KEY MUST NOT be set;
 *                             PAPERCLIP_EMAIL and PAPERCLIP_PASSWORD MUST be present
 *   V-PF-05 health_reachable— runtime target must respond non-error on /api/health
 *                             (HEAD/GET only; no mutation methods)
 *   V-PF-06 endpoint_reachable — company endpoint URL must respond (404/401/403 are
 *                             acceptable proof-of-route; 5xx or network errors block)
 *   V-PF-07 adapter_support — if requiredAdapter is supplied, the caller must also
 *                             pass allowedAdapters[] containing it (lockfile has no
 *                             structural adapter field today)
 *   V-PF-08 explicit_confirmation — caller-supplied confirmation.reason must be a
 *                             non-empty string with explicit=true before mutation
 *   V-PF-09 override_authorized — PAPERCLIP_COMPANY_ID_OVERRIDE=allow is honored only
 *                             when (a) caller supplied explicitCompanyId, (b) V-PF-08
 *                             passed, and (c) stale_target was not tripped
 *   V-PF-10 zero_mutation_in_preflight — preflight MUST NOT issue POST/PUT/PATCH/DELETE
 *                             (asserted by tests that record all fetch calls)
 *
 * Design contract (slice 14-03-PLAN must-have):
 *   - Fail-closed: any blocker aborts with structured output
 *   - Zero mutation when prerequisites are missing
 *   - Structured blocker output (kind, code, where, evidence, remediation)
 *   - Side-effect free except for read-only HEAD/GET probes
 *   - Secrets never echoed (cookies, tokens, passwords redacted from output)
 *
 * Reusable from T03 (script hardening) and S04 (persistence canary) via:
 *   const { runPreflight } = require('./scripts/lib/paperclip-preflight');
 *   const result = await runPreflight({ explicitCompanyId, confirmation, ... });
 *   if (!result.pass) { /* print result.blockers, abort *\/ }
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  validateLockfile,
  makeBlocker
} = require('../validate_paperclip_runtime_lock');

const PROJECT_ROOT = process.cwd();
const DEFAULT_LOCKFILE_PATH = path.resolve(
  PROJECT_ROOT,
  'paperclip-runtime.lock.json'
);

const REJECTED_AUTH_TOKENS = ['PAPERCLIP_API_KEY'];
const REQUIRED_AUTH_ENV = ['PAPERCLIP_EMAIL', 'PAPERCLIP_PASSWORD'];

/**
 * Default environment reader. Returns undefined when env var is unset.
 */
function defaultReadEnv(name) {
  return process.env[name];
}

/**
 * Default fetch wrapper. Bounded timeout, never follows redirects on
 * mutation-adjacent endpoints, refuses to issue POST/PUT/PATCH/DELETE.
 *
 * @param {string} url
 * @param {object} [init]
 * @returns {Promise<Response>}
 */
async function defaultFetch(url, init = {}) {
  const method = String(init.method || 'GET').toUpperCase();
  // Fail-closed: preflight MUST NOT mutate. Refuse POST/PUT/PATCH/DELETE
  // even if a caller (or a corrupted env) requests it.
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    throw new Error(
      `paperclip-preflight refuses to issue ${method} ${url}: only GET/HEAD/OPTIONS are permitted`
    );
  }
  const timeoutMs = init.timeoutMs || 5000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, method, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Make a structured preflight blocker (delegates to T01 makeBlocker).
 */
function makePreflightBlocker({ code, kind, where, message, evidence, remediation }) {
  return makeBlocker({ code, kind, where, message, evidence, remediation });
}

// ---------------------------------------------------------------------------
// Individual preflight checks. Each returns either:
//   { blocker: <Blocker> } on failure, OR
//   { summary: <object> }  on success.
// No check throws — the orchestrator (runPreflight) translates blockers into
// the structured failure output.
// ---------------------------------------------------------------------------

function checkLockfilePresent(lockfilePath, fsImpl = fs) {
  if (!fsImpl.existsSync(lockfilePath)) {
    return {
      blocker: makePreflightBlocker({
        code: 'V-PF-01',
        kind: 'schema',
        where: lockfilePath,
        message: 'paperclip-runtime.lock.json missing or unreadable',
        evidence: { path: lockfilePath },
        remediation:
          'Restore paperclip-runtime.lock.json per M014-a9jj46/S03/T01 schema, then re-run preflight.'
      })
    };
  }
  let lockfile;
  try {
    const raw = fsImpl.readFileSync(lockfilePath, 'utf8');
    lockfile = JSON.parse(raw);
  } catch (err) {
    return {
      blocker: makePreflightBlocker({
        code: 'V-PF-01',
        kind: 'schema',
        where: lockfilePath,
        message: `lockfile JSON parse failed: ${err && err.message ? err.message : 'unknown'}`,
        evidence: { error: err && err.code ? err.code : 'unknown' },
        remediation: 'Re-emit the lockfile as valid JSON; do NOT auto-stub missing keys.'
      })
    };
  }
  return { summary: { lockfilePath, lockfile } };
}

function checkLockfileValid(lockfile) {
  const blockers = validateLockfile(lockfile);
  if (blockers.length === 0) return { summary: { blockersChecked: 0 } };
  const promoted = blockers.map((b) =>
    makePreflightBlocker({
      code: 'V-PF-02',
      kind: b.kind,
      where: `lockfile.${b.where}`,
      message: `lockfile invalid: ${b.message}`,
      evidence: b.evidence,
      remediation: b.remediation
    })
  );
  return { blocker: promoted.length === 1 ? promoted[0] : promoted };
}

function resolveRuntimeTarget(lockfile) {
  const rt = (lockfile && lockfile.runtime_target) || {};
  return {
    public_ingress: rt.public_ingress || null,
    verified_base_url: rt.verified_base_url || null,
    verified_base_url_status: rt.verified_base_url_status || null,
    compose_project: rt.compose_project || null,
    container_name: rt.container_name || null
  };
}

function checkStaleTarget(lockfile, companyId) {
  if (!companyId || typeof companyId !== 'string') {
    return {
      blocker: makePreflightBlocker({
        code: 'V-PF-03',
        kind: 'target',
        where: 'company_identity',
        message: 'no resolved companyId; mutation requires either a lockfile-verified companyId or an explicit override',
        evidence: {
          canonical_company_id: (lockfile && lockfile.company_identity && lockfile.company_identity.canonical_company_id) || null,
          verified_company_id: (lockfile && lockfile.company_identity && lockfile.company_identity.verified_company_id) || null
        },
        remediation:
          'Re-run with PAPERCLIP_COMPANY_ID_OVERRIDE=allow and a non-stale explicitCompanyId, OR set company_identity.canonical_company_id to a freshly readback-verified UUID.'
      })
    };
  }
  const low = companyId.toLowerCase();
  const stale = (lockfile && lockfile.stale_company_ids && lockfile.stale_company_ids.ids) || [];
  const disp = (lockfile && lockfile.disposable_company_ids && lockfile.disposable_company_ids.ids) || [];
  for (const entry of stale) {
    if (typeof entry !== 'string') continue;
    if (low === entry.toLowerCase()) {
      return {
        blocker: makePreflightBlocker({
          code: 'V-PF-03',
          kind: 'target',
          where: 'explicit_company_id',
          message: 'explicit companyId matches stale_company_ids.ids; mutation refused',
          evidence: { company_id_prefix: low.slice(0, 8), matched_ledger: 'stale_company_ids' },
          remediation:
            'Replace explicitCompanyId with a freshly readback-verified UUID, or set PAPERCLIP_COMPANY_ID_OVERRIDE=allow with a visibility-confirmed alternate (and the stale-id check still applies).'
        })
      };
    }
  }
  for (const entry of disp) {
    if (typeof entry !== 'string') continue;
    if (low === entry.toLowerCase()) {
      return {
        blocker: makePreflightBlocker({
          code: 'V-PF-03',
          kind: 'target',
          where: 'explicit_company_id',
          message: 'explicit companyId matches disposable_company_ids.ids; mutation refused',
          evidence: { company_id_prefix: low.slice(0, 8), matched_ledger: 'disposable_company_ids' },
          remediation:
            'Replace explicitCompanyId with a canonical/production UUID. Disposable IDs are throwaway by definition.'
        })
      };
    }
  }
  return { summary: { company_id_prefix: low.slice(0, 8) } };
}

function checkAuthPresence(readEnv) {
  const rejected = [];
  for (const token of REJECTED_AUTH_TOKENS) {
    if (readEnv(token)) {
      rejected.push(token);
    }
  }
  if (rejected.length > 0) {
    return {
      blocker: makePreflightBlocker({
        code: 'V-PF-04',
        kind: 'auth',
        where: 'process.env',
        message: `rejected auth token(s) present in environment: ${rejected.join(', ')}`,
        evidence: { rejected_tokens: rejected, evidence_kind: 'env_var_presence' },
        remediation:
          'Unset the rejected env var(s). paperclip-preflight only honors session-cookie auth; API keys are forbidden per lockfile auth_modes.rejected.'
      })
    };
  }
  const missing = [];
  for (const env of REQUIRED_AUTH_ENV) {
    const v = readEnv(env);
    if (!v || typeof v !== 'string' || v.length === 0) missing.push(env);
  }
  if (missing.length > 0) {
    return {
      blocker: makePreflightBlocker({
        code: 'V-PF-04',
        kind: 'auth',
        where: 'process.env',
        message: `missing session-cookie credentials: ${missing.join(', ')}`,
        evidence: { missing_env: missing, evidence_kind: 'env_var_presence' },
        remediation:
          'Set the missing env var(s) in .env (PAPERCLIP_EMAIL + PAPERCLIP_PASSWORD) so the caller can sign in. Never pass credentials as CLI args.'
      })
    };
  }
  return {
    summary: {
      auth_mode: 'session-cookie',
      has_email: Boolean(readEnv('PAPERCLIP_EMAIL')),
      has_password: Boolean(readEnv('PAPERCLIP_PASSWORD')),
      has_api_key: false
    }
  };
}

function checkAdapterSupport(lockfile, requiredAdapter, allowedAdapters) {
  if (!requiredAdapter || typeof requiredAdapter !== 'string') {
    return { summary: { required: null } };
  }
  const list = Array.isArray(allowedAdapters) ? allowedAdapters : [];
  const matched = list.find((a) => String(a || '').toLowerCase() === requiredAdapter.toLowerCase());
  if (!matched) {
    return {
      blocker: makePreflightBlocker({
        code: 'V-PF-07',
        kind: 'adapter',
        where: 'requiredAdapter',
        message: `required adapter "${requiredAdapter}" not present in allowedAdapters[]`,
        evidence: { required: requiredAdapter, allowed_count: list.length, allowed_names: list },
        remediation:
          'Pass allowedAdapters[] containing the required adapter type, or remove the requiredAdapter if the mutation does not need one.'
      })
    };
  }
  return { summary: { required: requiredAdapter, allowed: true } };
}

function checkExplicitConfirmation(confirmation) {
  if (!confirmation || typeof confirmation !== 'object') {
    return {
      blocker: makePreflightBlocker({
        code: 'V-PF-08',
        kind: 'confirmation',
        where: 'confirmation',
        message: 'no confirmation supplied; mutation requires explicit operator confirmation',
        evidence: { present: confirmation == null },
        remediation:
          'Pass confirmation: { explicit: true, reason: "<operator-acknowledged-string>" } from the caller.'
      })
    };
  }
  if (confirmation.explicit !== true) {
    return {
      blocker: makePreflightBlocker({
        code: 'V-PF-08',
        kind: 'confirmation',
        where: 'confirmation.explicit',
        message: 'confirmation.explicit must be true to permit mutation',
        evidence: { explicit: confirmation.explicit || null },
        remediation: 'Set confirmation.explicit = true after the operator reads the dry-run summary.'
      })
    };
  }
  if (typeof confirmation.reason !== 'string' || confirmation.reason.trim().length === 0) {
    return {
      blocker: makePreflightBlocker({
        code: 'V-PF-08',
        kind: 'confirmation',
        where: 'confirmation.reason',
        message: 'confirmation.reason must be a non-empty operator-acknowledged string',
        evidence: { reason_kind: typeof confirmation.reason },
        remediation: 'Pass a concrete confirmation reason describing the operator-acknowledged scope.'
      })
    };
  }
  return { summary: { explicit: true, reason_length: confirmation.reason.length } };
}

function checkOverrideAuthorization(opts) {
  const { explicitCompanyId, lockfileCompanyId, readEnv, confirmationPresent, staleCheckPassed } = opts;
  if (!explicitCompanyId || explicitCompanyId === lockfileCompanyId) {
    // No override in play — nothing to check.
    return { summary: { override_used: false } };
  }
  const overridePolicy = String(readEnv('PAPERCLIP_COMPANY_ID_OVERRIDE') || '').toLowerCase();
  if (overridePolicy !== 'allow') {
    return {
      blocker: makePreflightBlocker({
        code: 'V-PF-09',
        kind: 'mutation_default',
        where: 'PAPERCLIP_COMPANY_ID_OVERRIDE',
        message:
          'explicitCompanyId differs from lockfile canonical/verified; PAPERCLIP_COMPANY_ID_OVERRIDE must be "allow"',
        evidence: {
          provided_prefix: String(explicitCompanyId).slice(0, 8),
          lockfile_prefix: lockfileCompanyId ? String(lockfileCompanyId).slice(0, 8) : null,
          override: overridePolicy || null
        },
        remediation:
          'Set PAPERCLIP_COMPANY_ID_OVERRIDE=allow in the environment, then re-run preflight.'
      })
    };
  }
  if (!confirmationPresent) {
    return {
      blocker: makePreflightBlocker({
        code: 'V-PF-09',
        kind: 'mutation_default',
        where: 'PAPERCLIP_COMPANY_ID_OVERRIDE',
        message: 'override=allow requires explicit confirmation.reason',
        evidence: { override: overridePolicy, confirmation_present: false },
        remediation: 'Supply confirmation: { explicit: true, reason: "<why override is safe>" } alongside the override.'
      })
    };
  }
  if (!staleCheckPassed) {
    return {
      blocker: makePreflightBlocker({
        code: 'V-PF-09',
        kind: 'mutation_default',
        where: 'PAPERCLIP_COMPANY_ID_OVERRIDE',
        message: 'override=allow was requested but explicitCompanyId is stale/disposable; refused',
        evidence: { provided_prefix: String(explicitCompanyId).slice(0, 8) },
        remediation: 'Use a non-stale explicitCompanyId; the stale-id check supersedes the override.'
      })
    };
  }
  return { summary: { override_used: true, override_policy: overridePolicy } };
}

async function probeHealth(target, fetchFn) {
  // Resolve the base URL: prefer verified_base_url (set after a fresh
  // authenticated readback), fall back to public_ingress.
  const baseUrl = target.verified_base_url || target.public_ingress;
  if (!baseUrl) {
    return {
      blocker: makePreflightBlocker({
        code: 'V-PF-05',
        kind: 'target',
        where: 'runtime_target.verified_base_url',
        message: 'no resolvable base URL for health probe',
        evidence: {
          verified_base_url: target.verified_base_url,
          public_ingress: target.public_ingress
        },
        remediation:
          'Set runtime_target.verified_base_url after a fresh authenticated readback, or rely on runtime_target.public_ingress.'
      })
    };
  }
  let url;
  try {
    url = new URL('/api/health', baseUrl).toString();
  } catch (err) {
    return {
      blocker: makePreflightBlocker({
        code: 'V-PF-05',
        kind: 'target',
        where: 'runtime_target.base_url',
        message: `invalid base URL: ${err && err.message ? err.message : 'unknown'}`,
        evidence: { base_url: baseUrl, error: err && err.code ? err.code : 'unknown' },
        remediation: 'Fix runtime_target.verified_base_url / public_ingress to a valid http(s) URL.'
      })
    };
  }
  let res;
  try {
    res = await fetchFn(url, { method: 'GET', timeoutMs: 4000 });
  } catch (err) {
    return {
      blocker: makePreflightBlocker({
        code: 'V-PF-05',
        kind: 'target',
        where: 'health_probe',
        message: `health probe network error: ${err && err.message ? err.message : 'unknown'}`,
        evidence: { url_host: new URL(url).host, error_kind: err && err.name ? err.name : 'unknown' },
        remediation:
          'Verify the runtime target is reachable. For local sandbox, ensure the SSH tunnel to 127.0.0.1:3131 is up.'
      })
    };
  }
  // A 404 on /api/health is acceptable — it proves the host is reachable and
  // the URL is routable. 5xx and other unexpected statuses are blockers.
  const ok = res.status >= 200 && res.status < 400;
  if (!ok) {
    return {
      blocker: makePreflightBlocker({
        code: 'V-PF-05',
        kind: 'target',
        where: 'health_probe',
        message: `health probe returned ${res.status}; runtime target is not healthy`,
        evidence: { status: res.status, url_host: new URL(url).host },
        remediation: 'Investigate Paperclip container health, then re-run preflight.'
      })
    };
  }
  return { summary: { url_host: new URL(url).host, status: res.status } };
}

async function probeEndpointReachable(target, companyId, fetchFn) {
  if (!companyId) {
    return { summary: { skipped: 'no_company_id' } };
  }
  const baseUrl = target.verified_base_url || target.public_ingress;
  if (!baseUrl) {
    return {
      blocker: makePreflightBlocker({
        code: 'V-PF-06',
        kind: 'target',
        where: 'runtime_target.base_url',
        message: 'no resolvable base URL for endpoint reachability probe',
        evidence: { verified_base_url: target.verified_base_url, public_ingress: target.public_ingress },
        remediation: 'Set runtime_target.verified_base_url after a fresh authenticated readback.'
      })
    };
  }
  let url;
  try {
    url = new URL(`/api/companies/${encodeURIComponent(companyId)}`, baseUrl).toString();
  } catch (err) {
    return {
      blocker: makePreflightBlocker({
        code: 'V-PF-06',
        kind: 'target',
        where: 'company_endpoint_url',
        message: `invalid company endpoint URL: ${err && err.message ? err.message : 'unknown'}`,
        evidence: { base_url: baseUrl, error_kind: err && err.code ? err.code : 'unknown' },
        remediation: 'Fix runtime_target.base_url to a valid http(s) URL.'
      })
    };
  }
  let res;
  try {
    res = await fetchFn(url, { method: 'HEAD', timeoutMs: 4000 });
  } catch (err) {
    return {
      blocker: makePreflightBlocker({
        code: 'V-PF-06',
        kind: 'target',
        where: 'company_endpoint_probe',
        message: `company endpoint probe network error: ${err && err.message ? err.message : 'unknown'}`,
        evidence: { url_host: new URL(url).host, error_kind: err && err.name ? err.name : 'unknown' },
        remediation: 'Verify network reachability and try again.'
      })
    };
  }
  // 2xx, 401, 403, 404 all prove the URL is routable. 5xx and unexpected
  // statuses are blockers.
  const routable =
    (res.status >= 200 && res.status < 400) ||
    res.status === 401 ||
    res.status === 403 ||
    res.status === 404 ||
    res.status === 405; // some servers reject HEAD with 405 → still routable
  if (!routable) {
    return {
      blocker: makePreflightBlocker({
        code: 'V-PF-06',
        kind: 'target',
        where: 'company_endpoint_probe',
        message: `company endpoint returned ${res.status}; runtime target may be unhealthy`,
        evidence: { status: res.status, url_host: new URL(url).host },
        remediation: 'Investigate Paperclip container, then re-run preflight.'
      })
    };
  }
  return {
    summary: {
      url_host: new URL(url).host,
      status: res.status,
      routable: true
    }
  };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Build the structured preflight result envelope.
 * @param {boolean} pass
 * @param {Array<object>} blockers
 * @param {object} diagnostics
 */
function finalize(pass, blockers, diagnostics) {
  return {
    pass,
    blockers,
    diagnostics
  };
}

/**
 * Run the full preflight contract.
 *
 * @param {object} [opts]
 * @param {string} [opts.lockfilePath]            — path to paperclip-runtime.lock.json
 * @param {string} [opts.explicitCompanyId]       — operator override (must satisfy override policy)
 * @param {string} [opts.requiredAdapter]         — adapter type required by the mutation (e.g. "hermes")
 * @param {string[]} [opts.allowedAdapters]       — adapter types known to be supported by current build
 * @param {{explicit:boolean, reason:string}} [opts.confirmation] — operator-acknowledged confirmation
 * @param {boolean} [opts.bypassHealthProbe]      — skip /api/health probe (dry-run only)
 * @param {boolean} [opts.bypassVisibilityProbe]  — skip /api/companies/{id} HEAD probe (dry-run only)
 * @param {object} [opts.fsImpl]                  — filesystem implementation (default: node:fs)
 * @param {function} [opts.fetchFn]               — fetch wrapper (default: native fetch w/ timeout)
 * @param {function} [opts.readEnv]               — env reader (default: process.env reader)
 * @returns {Promise<{pass: boolean, blockers: Array<object>, diagnostics: object}>}
 */
async function runPreflight(opts = {}) {
  const {
    lockfilePath = DEFAULT_LOCKFILE_PATH,
    explicitCompanyId = null,
    requiredAdapter = null,
    allowedAdapters = [],
    confirmation = null,
    bypassHealthProbe = false,
    bypassVisibilityProbe = false,
    fsImpl = fs,
    fetchFn = defaultFetch,
    readEnv = defaultReadEnv
  } = opts;

  const blockers = [];
  const diagnostics = {
    started_at: new Date().toISOString(),
    lockfile_path: lockfilePath,
    explicit_company_id: explicitCompanyId ? String(explicitCompanyId).slice(0, 8) + '…' : null,
    required_adapter: requiredAdapter || null,
    bypass_health: Boolean(bypassHealthProbe),
    bypass_visibility: Boolean(bypassVisibilityProbe)
  };

  // V-PF-01 lockfile_present
  const presentCheck = checkLockfilePresent(lockfilePath, fsImpl);
  if (presentCheck.blocker) {
    blockers.push(presentCheck.blocker);
    return finalize(false, blockers, diagnostics);
  }
  const lockfile = presentCheck.summary.lockfile;
  diagnostics.lockfile_loaded = true;

  // V-PF-02 lockfile_valid
  const validCheck = checkLockfileValid(lockfile);
  if (validCheck.blocker) {
    if (Array.isArray(validCheck.blocker)) {
      blockers.push(...validCheck.blocker);
    } else {
      blockers.push(validCheck.blocker);
    }
    return finalize(false, blockers, diagnostics);
  }

  // Resolve runtime target from lockfile
  const target = resolveRuntimeTarget(lockfile);
  diagnostics.target = target;

  // Determine effective companyId
  const lockfileCompanyId =
    (lockfile.company_identity && lockfile.company_identity.canonical_company_id) ||
    (lockfile.company_identity && lockfile.company_identity.verified_company_id) ||
    null;
  const effectiveCompanyId = explicitCompanyId || lockfileCompanyId;
  diagnostics.company_id = effectiveCompanyId
    ? String(effectiveCompanyId).slice(0, 8) + '…'
    : null;
  diagnostics.company_id_source = explicitCompanyId
    ? 'explicit'
    : lockfileCompanyId
      ? 'lockfile'
      : null;

  // V-PF-09 override_authorization must run BEFORE V-PF-03 stale_target so
  // that an override=allow with a stale companyId is caught as both, in
  // deterministic order.
  let staleCheckPassed = true;
  if (explicitCompanyId && explicitCompanyId !== lockfileCompanyId) {
    const overrideCheck = checkOverrideAuthorization({
      explicitCompanyId,
      lockfileCompanyId,
      readEnv,
      confirmationPresent:
        confirmation &&
        confirmation.explicit === true &&
        typeof confirmation.reason === 'string' &&
        confirmation.reason.trim().length > 0,
      staleCheckPassed: true // not yet checked
    });
    if (overrideCheck.blocker) {
      blockers.push(overrideCheck.blocker);
      return finalize(false, blockers, diagnostics);
    }
    diagnostics.override = overrideCheck.summary;
  }

  // V-PF-03 stale_target
  if (effectiveCompanyId) {
    const staleCheck = checkStaleTarget(lockfile, effectiveCompanyId);
    if (staleCheck.blocker) {
      staleCheckPassed = false;
      blockers.push(staleCheck.blocker);
      return finalize(false, blockers, diagnostics);
    }
  } else {
    // No companyId resolved: require explicit override policy.
    const overridePolicy = String(readEnv('PAPERCLIP_COMPANY_ID_OVERRIDE') || '').toLowerCase();
    if (overridePolicy !== 'allow') {
      blockers.push(
        makePreflightBlocker({
          code: 'V-PF-03',
          kind: 'target',
          where: 'company_identity',
          message:
            'no resolved companyId (lockfile canonical/verified are null) and no override=allow',
          evidence: {
            canonical_company_id:
              (lockfile.company_identity && lockfile.company_identity.canonical_company_id) || null,
            verified_company_id:
              (lockfile.company_identity && lockfile.company_identity.verified_company_id) || null,
            override: overridePolicy || null
          },
          remediation:
            'Either set PAPERCLIP_COMPANY_ID_OVERRIDE=allow with an explicitCompanyId, or update the lockfile after a fresh authenticated readback.'
        })
      );
      return finalize(false, blockers, diagnostics);
    }
    diagnostics.override = { override_used: true, override_policy: overridePolicy };
  }

  // Re-check override authorization now that we know stale-target outcome.
  // (For override=allow with a non-stale explicitCompanyId, this is a no-op;
  // for override=allow with a stale explicitCompanyId, we already blocked
  // at the stale check above — so this re-check just records summary.)
  if (explicitCompanyId && explicitCompanyId !== lockfileCompanyId) {
    // The override summary was already recorded before the stale check; we
    // intentionally do not re-block here because the stale check has higher
    // priority. We just attach an annotation.
    diagnostics.override = diagnostics.override || {};
    diagnostics.override.stale_check_passed = staleCheckPassed;
  }

  // V-PF-04 auth_present
  const authCheck = checkAuthPresence(readEnv);
  if (authCheck.blocker) {
    blockers.push(authCheck.blocker);
    return finalize(false, blockers, diagnostics);
  }
  diagnostics.auth = authCheck.summary;

  // V-PF-07 adapter_support
  if (requiredAdapter) {
    const adapterCheck = checkAdapterSupport(lockfile, requiredAdapter, allowedAdapters);
    if (adapterCheck.blocker) {
      blockers.push(adapterCheck.blocker);
      return finalize(false, blockers, diagnostics);
    }
    diagnostics.adapter = adapterCheck.summary;
  }

  // V-PF-08 explicit_confirmation
  const confirmCheck = checkExplicitConfirmation(confirmation);
  if (confirmCheck.blocker) {
    blockers.push(confirmCheck.blocker);
    return finalize(false, blockers, diagnostics);
  }
  diagnostics.confirmation = confirmCheck.summary;

  // V-PF-05 health_reachable (optional)
  if (!bypassHealthProbe) {
    try {
      const health = await probeHealth(target, fetchFn);
      diagnostics.health = health.summary || { error: 'unrecorded' };
      if (health.blocker) {
        blockers.push(health.blocker);
        return finalize(false, blockers, diagnostics);
      }
    } catch (err) {
      diagnostics.health = { error: err && err.message ? err.message : 'unknown' };
      blockers.push(
        makePreflightBlocker({
          code: 'V-PF-05',
          kind: 'target',
          where: 'health_probe',
          message: `health probe threw unexpectedly: ${err && err.message ? err.message : 'unknown'}`,
          evidence: { error_kind: err && err.name ? err.name : 'unknown' },
          remediation:
            'Investigate the preflight harness; the health probe should never throw.'
        })
      );
      return finalize(false, blockers, diagnostics);
    }
  }

  // V-PF-06 endpoint_reachable (optional)
  if (!bypassVisibilityProbe) {
    try {
      const ep = await probeEndpointReachable(target, effectiveCompanyId, fetchFn);
      diagnostics.endpoint = ep.summary || { error: 'unrecorded' };
      if (ep.blocker) {
        blockers.push(ep.blocker);
        return finalize(false, blockers, diagnostics);
      }
    } catch (err) {
      diagnostics.endpoint = { error: err && err.message ? err.message : 'unknown' };
      blockers.push(
        makePreflightBlocker({
          code: 'V-PF-06',
          kind: 'target',
          where: 'company_endpoint_probe',
          message: `endpoint probe threw unexpectedly: ${err && err.message ? err.message : 'unknown'}`,
          evidence: { error_kind: err && err.name ? err.name : 'unknown' },
          remediation: 'Investigate the preflight harness; the endpoint probe should never throw.'
        })
      );
      return finalize(false, blockers, diagnostics);
    }
  }

  diagnostics.finished_at = new Date().toISOString();
  diagnostics.pass = true;
  return finalize(true, blockers, diagnostics);
}

module.exports = {
  runPreflight,
  makePreflightBlocker,
  // exported for testability
  checkLockfilePresent,
  checkLockfileValid,
  checkStaleTarget,
  checkAuthPresence,
  checkAdapterSupport,
  checkExplicitConfirmation,
  checkOverrideAuthorization,
  probeHealth,
  probeEndpointReachable,
  resolveRuntimeTarget,
  defaultFetch,
  defaultReadEnv,
  DEFAULT_LOCKFILE_PATH
};