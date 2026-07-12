#!/usr/bin/env node
/**
 * @file scripts/validate_paperclip_runtime_lock.js
 *
 * T01 validator for M014-a9jj46/S03 — paperclip-runtime.lock.json.
 *
 * Enforces 10 integrity / contract tests on the runtime lockfile so that
 * downstream mutation scripts (T02 preflight, T03 hardening, T04 audit) cannot
 * silently mutate Paperclip against stale, missing, or unauthorized state.
 *
 * Validator classes (mirror paperclip-runtime.lock.json validator_classes):
 *   V-LF-01 schema_top_level_keys
 *   V-LF-02 freshness_posture_present
 *   V-LF-03 runtime_target_required
 *   V-LF-04 company_identity_provisional
 *   V-LF-05 stale_id_membership
 *   V-LF-06 disposable_id_membership
 *   V-LF-07 auth_modes_consistent
 *   V-LF-08 safe_restart_present
 *   V-LF-09 forbidden_commands_complete
 *   V-LF-10 no_stale_id_in_mutation_defaults
 *
 * Usage:
 *   node --test scripts/validate_paperclip_runtime_lock.js
 *
 * CLI gate (exit 0 = pass, 1 = validation errors, 2 = load errors):
 *   node scripts/validate_paperclip_runtime_lock.js
 *
 * Design contract (slice 14-03-PLAN must-have):
 *   - Rejects missing fields
 *   - Rejects using known stale IDs as mutation defaults
 *   - Produces structured blocker output (kind, code, where, evidence,
 *     remediation) without logging secrets
 *   - Side-effect free: reads lockfile, validates, asserts. No network,
 *     no subprocesses, no git, no secret writes.
 *
 * The exported `validateLockfile(lockfile)` function is reusable by S03 T02
 * (paperclip-preflight) so the same contract gates the live preflight as
 * gates the static lockfile review.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Constants & path resolution
// ---------------------------------------------------------------------------

const PROJECT_ROOT = process.cwd();

const LOCKFILE_PATH = path.resolve(
  PROJECT_ROOT,
  'paperclip-runtime.lock.json'
);

/**
 * The six stale UUID prefixes from R3 (M014-S01-runtime-truth-map.json).
 * These MUST appear (in expanded or fully-qualified form) in
 * `stale_company_ids.ids` or the validator rejects the lockfile.
 *
 * Format note: the truth map truncates middle segments with `…`. We accept
 * either the truncated token (e.g. "9feb4c22-…") or a fully-qualified UUID
 * whose prefix segment matches. Anything in between is considered malformed.
 */
const R3_STALE_PREFIXES = [
  '9feb4c22',
  '43c74adb',
  '1a194762',
  '7595fd85',
  '7eede16c',
  '8233ea7b'
];

/**
 * The five destructive commands that MUST appear in
 * `forbidden_commands[*].command` per M014-S01 vps_targets.
 */
const R3_FORBIDDEN_COMMANDS = [
  'docker compose down -v',
  'docker volume prune',
  'docker system prune',
  'docker rm',
  'docker volume rm'
];

/**
 * Required top-level keys. Schema version key is verified separately so the
 * contract evolves with the milestone.
 */
const REQUIRED_TOP_LEVEL_KEYS = [
  '$schema',
  'milestone',
  'slice',
  'task',
  'purpose',
  'generated',
  'generated_by',
  'consumes',
  'freshness_posture',
  'runtime_target',
  'company_identity',
  'stale_company_ids',
  'disposable_company_ids',
  'auth_modes',
  'safe_restart_command',
  'forbidden_commands',
  'forbidden_command_rule',
  'mutation_default_sources',
  'validator_classes',
  'downstream_handoff'
];

/**
 * Required nested keys (subset of must-have fields from the slice plan).
 */
const REQUIRED_RUNTIME_TARGET_KEYS = [
  'public_ingress',
  'vps_ip',
  'sandbox_path',
  'compose_project',
  'container_name',
  'container_binding',
  'verified_base_url',
  'verified_base_url_status',
  'fresh_readback_required'
];

const REQUIRED_COMPANY_IDENTITY_KEYS = [
  'canonical_company_id',
  'canonical_company_id_status',
  'verified_company_id',
  'verified_company_id_status',
  'fresh_readback_required'
];

const REQUIRED_AUTH_MODES_KEYS = [
  'default_mode',
  'allowed',
  'rejected',
  'forbidden'
];

const REQUIRED_MUTATION_DEFAULT_KEYS = [
  'policy',
  'forbidden_default_sources',
  'explicit_override_required',
  'explicit_override_env'
];

/**
 * Auth modes whose presence in `auth_modes.allowed` is a fail-closed error.
 * Each item is matched case-insensitively against `auth_modes.allowed[*].mode`.
 */
const FORBIDDEN_ALLOWED_AUTH_TOKENS = [
  'api-key-bearer',
  'papERCLIP_API_KEY',
  'paperclip_api_key'
];

// ---------------------------------------------------------------------------
// Structured blocker factory
// ---------------------------------------------------------------------------

/**
 * Produce a structured, non-throwing blocker record. Used by both the
 * validator and (eventually) the T02 preflight. Secrets are never echoed.
 *
 * Shape:
 *   { code, kind, where, message, evidence, remediation }
 */
function makeBlocker({ code, kind, where, message, evidence, remediation }) {
  return {
    code,
    kind, // 'schema' | 'target' | 'auth' | 'adapter' | 'confirmation' | 'mutation_default'
    where,
    message,
    // evidence is structured (counts, ids, paths) — never raw secrets, never
    // raw auth headers, never raw cookies.
    evidence: evidence || null,
    remediation: remediation || null
  };
}

/**
 * Validate a parsed lockfile object. Always returns an array of blockers;
 * callers decide pass/fail from `blockers.length === 0`.
 *
 * @param {unknown} lockfile  Parsed JSON object (already fs.readFileSync'd).
 * @returns {Array<object>}   Structured blockers (empty when valid).
 */
function validateLockfile(lockfile) {
  const blockers = [];

  // -- V-LF-01 schema_top_level_keys --------------------------------------
  if (lockfile === null || typeof lockfile !== 'object' || Array.isArray(lockfile)) {
    blockers.push(
      makeBlocker({
        code: 'V-LF-01',
        kind: 'schema',
        where: 'paperclip-runtime.lock.json',
        message: 'lockfile root must be a JSON object',
        evidence: { got: Array.isArray(lockfile) ? 'array' : typeof lockfile },
        remediation:
          'Re-emit the lockfile as a single JSON object with the required top-level keys.'
      })
    );
    return blockers; // cannot continue without a root object
  }

  for (const key of REQUIRED_TOP_LEVEL_KEYS) {
    if (!(key in lockfile)) {
      blockers.push(
        makeBlocker({
          code: 'V-LF-01',
          kind: 'schema',
          where: `paperclip-runtime.lock.json root`,
          message: `missing required top-level key: ${key}`,
          evidence: { missing_key: key },
          remediation:
            'Restore the missing key from M014-a9jj46/S03/T01 template. Do NOT auto-stub.'
        })
      );
    }
  }

  // -- V-LF-02 freshness_posture_present -----------------------------------
  const fp = lockfile.freshness_posture;
  if (!fp || typeof fp !== 'object') {
    blockers.push(
      makeBlocker({
        code: 'V-LF-02',
        kind: 'schema',
        where: 'freshness_posture',
        message: 'freshness_posture object missing',
        evidence: { present: fp == null },
        remediation: 'Add freshness_posture with policy, as_of, must_reprobe_after.'
      })
    );
  } else {
    for (const sub of ['policy', 'as_of', 'must_reprobe_after']) {
      if (fp[sub] === undefined || fp[sub] === null || fp[sub] === '') {
        blockers.push(
          makeBlocker({
            code: 'V-LF-02',
            kind: 'schema',
            where: `freshness_posture.${sub}`,
            message: `freshness_posture.${sub} missing`,
            evidence: { field: sub },
            remediation: `Set freshness_posture.${sub} per R3 + R4 in .gsd/KNOWLEDGE.md.`
          })
        );
      }
    }
  }

  // -- V-LF-03 runtime_target_required -------------------------------------
  const rt = lockfile.runtime_target;
  if (!rt || typeof rt !== 'object') {
    blockers.push(
      makeBlocker({
        code: 'V-LF-03',
        kind: 'target',
        where: 'runtime_target',
        message: 'runtime_target object missing',
        evidence: { present: rt == null },
        remediation:
          'Populate runtime_target with public_ingress, compose_project, container_name, verified_base_url.'
      })
    );
  } else {
    for (const key of REQUIRED_RUNTIME_TARGET_KEYS) {
      if (!(key in rt)) {
        blockers.push(
          makeBlocker({
            code: 'V-LF-03',
            kind: 'target',
            where: `runtime_target.${key}`,
            message: `runtime_target.${key} missing`,
            evidence: { missing_key: key },
            remediation: 'Populate runtime_target from M014-S01 vps_targets.'
          })
        );
      }
    }
    if ('fresh_readback_required' in rt && rt.fresh_readback_required !== true) {
      blockers.push(
        makeBlocker({
          code: 'V-LF-03',
          kind: 'target',
          where: 'runtime_target.fresh_readback_required',
          message: 'fresh_readback_required must be true until verified_base_url is set',
          evidence: { value: rt.fresh_readback_required },
          remediation:
            'Set fresh_readback_required=true until an authenticated readback confirms a verified_base_url.'
        })
      );
    }
    if (
      'verified_base_url_status' in rt &&
      !/provisional|verified/.test(String(rt.verified_base_url_status || ''))
    ) {
      blockers.push(
        makeBlocker({
          code: 'V-LF-03',
          kind: 'target',
          where: 'runtime_target.verified_base_url_status',
          message: 'verified_base_url_status must be "provisional-pending-fresh-readback" or "verified"',
          evidence: { value: rt.verified_base_url_status },
          remediation:
            'Set status to "provisional-pending-fresh-readback" until authenticated readback succeeds.'
        })
      );
    }
  }

  // -- V-LF-04 company_identity_provisional --------------------------------
  const ci = lockfile.company_identity;
  if (!ci || typeof ci !== 'object') {
    blockers.push(
      makeBlocker({
        code: 'V-LF-04',
        kind: 'target',
        where: 'company_identity',
        message: 'company_identity object missing',
        evidence: { present: ci == null },
        remediation:
          'Populate company_identity with canonical_company_id, verified_company_id, fresh_readback_required.'
      })
    );
  } else {
    for (const key of REQUIRED_COMPANY_IDENTITY_KEYS) {
      if (!(key in ci)) {
        blockers.push(
          makeBlocker({
            code: 'V-LF-04',
            kind: 'target',
            where: `company_identity.${key}`,
            message: `company_identity.${key} missing`,
            evidence: { missing_key: key },
            remediation: 'Add the required field per the lockfile schema.'
          })
        );
      }
    }
    // Until a fresh readback succeeds, canonical_company_id MUST be null.
    // verified_company_id MUST be null. The validator rejects any non-null
    // value whose status does not explicitly say it is "verified" with a
    // matching fresh_readback_required=false marker.
    for (const field of ['canonical_company_id', 'verified_company_id']) {
      const value = ci[field];
      const statusField =
        field === 'canonical_company_id'
          ? 'canonical_company_id_status'
          : 'verified_company_id_status';
      const status = ci[statusField];
      if (value !== null && value !== undefined) {
        const isVerified = /verified/i.test(String(status || '')) && ci.fresh_readback_required === false;
        if (!isVerified) {
          blockers.push(
            makeBlocker({
              code: 'V-LF-04',
              kind: 'target',
              where: `company_identity.${field}`,
              message:
                'canonical_company_id / verified_company_id must be null until fresh_readback_required=false AND status contains "verified"',
              evidence: {
                field,
                status: status || null,
                fresh_readback_required: ci.fresh_readback_required ?? null
              },
              remediation:
                'Set the value to null OR set fresh_readback_required=false AND status="verified-…".'
            })
          );
        }
      }
    }
  }

  // -- V-LF-05 stale_id_membership -----------------------------------------
  const stale = lockfile.stale_company_ids;
  if (!stale || typeof stale !== 'object' || !Array.isArray(stale.ids)) {
    blockers.push(
      makeBlocker({
        code: 'V-LF-05',
        kind: 'schema',
        where: 'stale_company_ids.ids',
        message: 'stale_company_ids.ids must be an array',
        evidence: { present: stale == null, ids_is_array: Array.isArray(stale && stale.ids) },
        remediation: 'Add stale_company_ids.ids array containing all 6 R3 stale UUIDs.'
      })
    );
  } else {
    for (const prefix of R3_STALE_PREFIXES) {
      const match = stale.ids.some((entry) => {
        if (typeof entry !== 'string') return false;
        // The entry must START with the prefix; otherwise any entry that
        // begins with "-…" would false-positive match every prefix check.
        if (!entry.startsWith(prefix)) return false;
        // Accept truncated "9feb4c22-…" OR fully-qualified "9feb4c22-...".
        const tail = entry.slice(prefix.length);
        if (tail === '-…') return true;
        if (tail.startsWith('-')) {
          // Reject literal "..." truncation tokens; require hex/dash body.
          const body = tail.slice(1);
          if (body === '…') return true;
          return /^[0-9a-f-]{4,}$/i.test(body);
        }
        return false;
      });
      if (!match) {
        blockers.push(
          makeBlocker({
            code: 'V-LF-05',
            kind: 'schema',
            where: 'stale_company_ids.ids',
            message: `stale_company_ids missing R3 prefix ${prefix}`,
            evidence: { missing_prefix: prefix, current_count: stale.ids.length },
            remediation: `Append a stale entry whose prefix segment matches ${prefix}-… or its full UUID.`
          })
        );
      }
    }
  }

  // -- V-LF-06 disposable_id_membership ------------------------------------
  const disp = lockfile.disposable_company_ids;
  if (!disp || typeof disp !== 'object' || !Array.isArray(disp.ids)) {
    blockers.push(
      makeBlocker({
        code: 'V-LF-06',
        kind: 'schema',
        where: 'disposable_company_ids.ids',
        message: 'disposable_company_ids.ids must be an array',
        evidence: { present: disp == null, ids_is_array: Array.isArray(disp && disp.ids) },
        remediation: 'Add disposable_company_ids.ids array (may be empty for first run).'
      })
    );
  }

  // -- V-LF-07 auth_modes_consistent ---------------------------------------
  const auth = lockfile.auth_modes;
  if (!auth || typeof auth !== 'object') {
    blockers.push(
      makeBlocker({
        code: 'V-LF-07',
        kind: 'auth',
        where: 'auth_modes',
        message: 'auth_modes object missing',
        evidence: { present: auth == null },
        remediation: 'Add auth_modes.default_mode + .allowed + .rejected + .forbidden arrays.'
      })
    );
  } else {
    for (const key of REQUIRED_AUTH_MODES_KEYS) {
      if (!(key in auth)) {
        blockers.push(
          makeBlocker({
            code: 'V-LF-07',
            kind: 'auth',
            where: `auth_modes.${key}`,
            message: `auth_modes.${key} missing`,
            evidence: { missing_key: key },
            remediation: 'Add the required field per the lockfile schema.'
          })
        );
      }
    }
    if (Array.isArray(auth.allowed)) {
      for (const entry of auth.allowed) {
        const mode = String(entry && entry.mode || '').toLowerCase();
        for (const forbidden of FORBIDDEN_ALLOWED_AUTH_TOKENS) {
          if (mode.includes(forbidden.toLowerCase())) {
            blockers.push(
              makeBlocker({
                code: 'V-LF-07',
                kind: 'auth',
                where: 'auth_modes.allowed',
                message: `forbidden auth mode present in allowed: ${entry.mode}`,
                evidence: { mode: entry.mode, status: entry.status },
                remediation:
                  'Move PAPERCLIP_API_KEY / api-key-bearer to auth_modes.rejected and demote to diagnostic-only.'
              })
            );
          }
        }
      }
    }
    if (Array.isArray(auth.forbidden)) {
      // R2: the forbidden list MUST contain a public-sign-up entry. If not,
      // emit a single blocker for the whole list rather than per-entry.
      const hasPublicSignUp = auth.forbidden.some((entry) => {
        const mode = String((entry && entry.mode) || '').toLowerCase();
        // accept any token that contains both "public" and "sign-up" /
        // "signup" — case-insensitive, punctuation-tolerant.
        return /public/.test(mode) && (/sign-?up/.test(mode) || /signup/.test(mode));
      });
      if (!hasPublicSignUp) {
        blockers.push(
          makeBlocker({
            code: 'V-LF-07',
            kind: 'auth',
            where: 'auth_modes.forbidden',
            message:
              'auth_modes.forbidden must include a public-sign-up entry to honor R2',
            evidence: {
              current_entries: auth.forbidden.length,
              current_modes: auth.forbidden.map((e) => (e && e.mode) || null)
            },
            remediation:
              'Add { mode: "public-sign-up", status: "forbidden" } to auth_modes.forbidden.'
          })
        );
      }
    }
  }

  // -- V-LF-08 safe_restart_present ----------------------------------------
  if (typeof lockfile.safe_restart_command !== 'string' || lockfile.safe_restart_command.length === 0) {
    blockers.push(
      makeBlocker({
        code: 'V-LF-08',
        kind: 'schema',
        where: 'safe_restart_command',
        message: 'safe_restart_command must be a non-empty string',
        evidence: { present: lockfile.safe_restart_command == null },
        remediation: 'Copy safe_restart_command from M014-S01 vps_targets.'
      })
    );
  } else {
    const cmd = lockfile.safe_restart_command;
    if (!cmd.includes('paperclip_sandbox')) {
      blockers.push(
        makeBlocker({
          code: 'V-LF-08',
          kind: 'schema',
          where: 'safe_restart_command',
          message: 'safe_restart_command must reference the paperclip_sandbox compose project',
          evidence: { contains_paperclip_sandbox: false },
          remediation: 'Reuse the safe_restart_command from M014-S01 vps_targets verbatim.'
        })
      );
    }
  }

  // -- V-LF-09 forbidden_commands_complete ---------------------------------
  if (!Array.isArray(lockfile.forbidden_commands) || lockfile.forbidden_commands.length === 0) {
    blockers.push(
      makeBlocker({
        code: 'V-LF-09',
        kind: 'schema',
        where: 'forbidden_commands',
        message: 'forbidden_commands must be a non-empty array',
        evidence: { present: lockfile.forbidden_commands == null },
        remediation: 'Populate forbidden_commands from M014-S01 vps_targets.'
      })
    );
  } else {
    const cmds = lockfile.forbidden_commands
      .map((entry) => (typeof entry === 'string' ? entry : entry && entry.command))
      .filter((s) => typeof s === 'string');
    for (const required of R3_FORBIDDEN_COMMANDS) {
      if (!cmds.includes(required)) {
        blockers.push(
          makeBlocker({
            code: 'V-LF-09',
            kind: 'schema',
            where: 'forbidden_commands',
            message: `forbidden_commands missing R3 entry: ${required}`,
            evidence: { missing_command: required, current_count: cmds.length },
            remediation: `Add ${required} to forbidden_commands with a reason field.`
          })
        );
      }
    }
  }

  // -- V-LF-10 no_stale_id_in_mutation_defaults ----------------------------
  const mds = lockfile.mutation_default_sources;
  if (!mds || typeof mds !== 'object') {
    blockers.push(
      makeBlocker({
        code: 'V-LF-10',
        kind: 'mutation_default',
        where: 'mutation_default_sources',
        message: 'mutation_default_sources object missing',
        evidence: { present: mds == null },
        remediation: 'Add mutation_default_sources with policy + forbidden_default_sources.'
      })
    );
  } else {
    for (const key of REQUIRED_MUTATION_DEFAULT_KEYS) {
      if (!(key in mds)) {
        blockers.push(
          makeBlocker({
            code: 'V-LF-10',
            kind: 'mutation_default',
            where: `mutation_default_sources.${key}`,
            message: `mutation_default_sources.${key} missing`,
            evidence: { missing_key: key },
            remediation: 'Add the required field per the lockfile schema.'
          })
        );
      }
    }
    if (Array.isArray(mds.forbidden_default_sources)) {
      for (const source of mds.forbidden_default_sources) {
        if (typeof source !== 'string') continue;
        // Each forbidden source MUST NOT contain a fully-qualified UUID literal
        // (8-4-4-4-12 hex) — those would defeat the purpose of the list.
        const fullUuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
        if (fullUuid.test(source)) {
          blockers.push(
            makeBlocker({
              code: 'V-LF-10',
              kind: 'mutation_default',
              where: 'mutation_default_sources.forbidden_default_sources',
              message:
                'forbidden_default_sources entry contains a fully-qualified UUID literal; move it to stale_company_ids.ids',
              evidence: { entry: source },
              remediation:
                'Replace the literal UUID with a category token like "stale_company_ids.ids" or "disposable_company_ids.ids".'
            })
          );
        }
      }
    }
  }

  // Cross-check: any non-null canonical/verified company ID MUST NOT match
  // any stale/disposable ID prefix. This is the core "no stale ID as mutation
  // default" guarantee.
  const allForbiddenIds = new Set();
  if (Array.isArray(stale && stale.ids)) {
    for (const entry of stale.ids) {
      if (typeof entry === 'string') allForbiddenIds.add(entry.toLowerCase());
    }
  }
  if (Array.isArray(disp && disp.ids)) {
    for (const entry of disp.ids) {
      if (typeof entry === 'string') allForbiddenIds.add(entry.toLowerCase());
    }
  }

  if (ci && typeof ci === 'object') {
    for (const field of ['canonical_company_id', 'verified_company_id']) {
      const value = ci[field];
      if (typeof value !== 'string') continue;
      const low = value.toLowerCase();
      if (allForbiddenIds.has(low)) {
        blockers.push(
          makeBlocker({
            code: 'V-LF-10',
            kind: 'mutation_default',
            where: `company_identity.${field}`,
            message: `company_identity.${field} equals a stale/disposable ID; mutation scripts would inherit this default`,
            evidence: { field, blocked_value_prefix: low.slice(0, 8) },
            remediation: `Set ${field} to null OR to a freshly readback-verified UUID that is not in stale/disposable ledgers.`
          })
        );
      }
      // Also reject if its prefix matches any R3 stale prefix (catches the
      // case where the truth map stored "9feb4c22-…" but the lockfile stored
      // a fully-qualified "9feb4c22-…-..." variant that someone copy-pasted
      // from a script).
      for (const prefix of R3_STALE_PREFIXES) {
        if (low.startsWith(prefix + '-')) {
          blockers.push(
            makeBlocker({
              code: 'V-LF-10',
              kind: 'mutation_default',
              where: `company_identity.${field}`,
              message:
                `company_identity.${field} starts with R3 stale prefix ${prefix}; treated as a stale ID as mutation default`,
              evidence: { field, blocked_value_prefix: prefix },
              remediation: `Replace ${field} with a freshly readback-verified UUID or null.`
            })
          );
        }
      }
    }
  }

  return blockers;
}

// ---------------------------------------------------------------------------
// Helpers for tests
// ---------------------------------------------------------------------------

function loadLockfileOrFail() {
  if (!fs.existsSync(LOCKFILE_PATH)) {
    throw new Error(`lockfile not found at ${LOCKFILE_PATH}`);
  }
  const raw = fs.readFileSync(LOCKFILE_PATH, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`lockfile is not valid JSON: ${err.message}`);
  }
  return parsed;
}

function minimalValidLockfile() {
  return {
    $schema: 'gsd/m014-s03-runtime-lockfile-v1',
    milestone: 'M014-a9jj46',
    slice: 'S03',
    task: 'T01',
    purpose: 'minimal fixture',
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

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('validate_paperclip_runtime_lock', () => {
  it('lockfile exists at paperclip-runtime.lock.json', () => {
    assert.equal(
      fs.existsSync(LOCKFILE_PATH),
      true,
      `expected lockfile at ${LOCKFILE_PATH}`
    );
  });

  it('lockfile parses as JSON object', () => {
    const lf = loadLockfileOrFail();
    assert.equal(typeof lf, 'object');
    assert.notEqual(lf, null);
    assert.equal(Array.isArray(lf), false);
  });

  describe('V-LF-01 schema_top_level_keys', () => {
    it('shipped lockfile has all required top-level keys', () => {
      const lf = loadLockfileOrFail();
      const missing = REQUIRED_TOP_LEVEL_KEYS.filter((k) => !(k in lf));
      assert.deepEqual(missing, [], `missing keys: ${missing.join(',')}`);
    });

    it('rejects a lockfile missing freshness_posture', () => {
      const lf = minimalValidLockfile();
      delete lf.freshness_posture;
      const blockers = validateLockfile(lf);
      // Either V-LF-01 (top-level key missing) or V-LF-02 (freshness_posture
      // object missing) is acceptable; both correctly fail the contract.
      const caught =
        blockers.some(
          (b) => b.code === 'V-LF-01' && b.evidence.missing_key === 'freshness_posture'
        ) || blockers.some((b) => b.code === 'V-LF-02');
      assert.ok(
        caught,
        `expected V-LF-01 or V-LF-02 blocker for freshness_posture, got ${JSON.stringify(blockers.map((b) => ({ code: b.code, where: b.where })))}`
      );
    });

    it('rejects a non-object root', () => {
      const blockers = validateLockfile('not-an-object');
      assert.equal(blockers.length >= 1, true);
      assert.equal(blockers[0].code, 'V-LF-01');
      assert.equal(blockers[0].kind, 'schema');
    });

    it('rejects an array root', () => {
      const blockers = validateLockfile([]);
      assert.equal(blockers[0].code, 'V-LF-01');
    });
  });

  describe('V-LF-02 freshness_posture_present', () => {
    it('shipped lockfile has all freshness_posture fields', () => {
      const lf = loadLockfileOrFail();
      const blockers = validateLockfile(lf);
      const v2 = blockers.filter((b) => b.code === 'V-LF-02');
      assert.deepEqual(v2, [], `unexpected V-LF-02 blockers: ${JSON.stringify(v2)}`);
    });

    it('rejects missing as_of', () => {
      const lf = minimalValidLockfile();
      delete lf.freshness_posture.as_of;
      const blockers = validateLockfile(lf);
      assert.ok(blockers.some((b) => b.code === 'V-LF-02' && b.where === 'freshness_posture.as_of'));
    });
  });

  describe('V-LF-03 runtime_target_required', () => {
    it('shipped lockfile runtime_target has all required keys', () => {
      const lf = loadLockfileOrFail();
      const blockers = validateLockfile(lf);
      const v3 = blockers.filter((b) => b.code === 'V-LF-03');
      assert.deepEqual(v3, [], `unexpected V-LF-03 blockers: ${JSON.stringify(v3)}`);
    });

    it('rejects runtime_target.fresh_readback_required=false', () => {
      const lf = minimalValidLockfile();
      lf.runtime_target.fresh_readback_required = false;
      const blockers = validateLockfile(lf);
      assert.ok(
        blockers.some(
          (b) =>
            b.code === 'V-LF-03' &&
            b.where === 'runtime_target.fresh_readback_required'
        )
      );
    });

    it('rejects bad verified_base_url_status enum', () => {
      const lf = minimalValidLockfile();
      lf.runtime_target.verified_base_url_status = 'pending-maybe';
      const blockers = validateLockfile(lf);
      assert.ok(
        blockers.some(
          (b) => b.code === 'V-LF-03' && b.where === 'runtime_target.verified_base_url_status'
        )
      );
    });
  });

  describe('V-LF-04 company_identity_provisional', () => {
    it('shipped lockfile passes company_identity contract', () => {
      const lf = loadLockfileOrFail();
      const blockers = validateLockfile(lf);
      const v4 = blockers.filter((b) => b.code === 'V-LF-04');
      assert.deepEqual(v4, [], `unexpected V-LF-04 blockers: ${JSON.stringify(v4)}`);
    });

    it('rejects non-null canonical_company_id without verified status', () => {
      const lf = minimalValidLockfile();
      lf.company_identity.canonical_company_id = 'aaaa1111-2222-3333-4444-555566667777';
      lf.company_identity.canonical_company_id_status = 'provisional-pending-fresh-readback';
      lf.company_identity.fresh_readback_required = true;
      const blockers = validateLockfile(lf);
      assert.ok(
        blockers.some(
          (b) => b.code === 'V-LF-04' && b.where === 'company_identity.canonical_company_id'
        )
      );
    });

    it('accepts canonical_company_id with verified status + fresh_readback_required=false', () => {
      const lf = minimalValidLockfile();
      lf.company_identity.canonical_company_id = 'bbbb1111-2222-3333-4444-555566667777';
      lf.company_identity.canonical_company_id_status = 'verified-2026-07-11';
      lf.company_identity.fresh_readback_required = false;
      const blockers = validateLockfile(lf);
      const v4 = blockers.filter((b) => b.code === 'V-LF-04');
      assert.deepEqual(v4, [], `unexpected blockers: ${JSON.stringify(v4)}`);
    });
  });

  describe('V-LF-05 stale_id_membership', () => {
    it('shipped lockfile contains all 6 R3 stale prefixes', () => {
      const lf = loadLockfileOrFail();
      const blockers = validateLockfile(lf);
      const v5 = blockers.filter((b) => b.code === 'V-LF-05');
      assert.deepEqual(v5, [], `unexpected V-LF-05 blockers: ${JSON.stringify(v5)}`);
    });

    it('rejects when a stale prefix is missing', () => {
      const lf = minimalValidLockfile();
      lf.stale_company_ids.ids = ['9feb4c22-…']; // only 1 of 6
      const blockers = validateLockfile(lf);
      const missing = blockers.filter((b) => b.code === 'V-LF-05');
      assert.ok(missing.length >= 5, `expected >=5 missing-prefix blockers, got ${missing.length}`);
    });

    it('accepts the truncated "9feb4c22-…" form', () => {
      const lf = minimalValidLockfile();
      lf.stale_company_ids.ids = R3_STALE_PREFIXES.map((p) => `${p}-…`);
      const blockers = validateLockfile(lf);
      const v5 = blockers.filter((b) => b.code === 'V-LF-05');
      assert.deepEqual(v5, [], `unexpected blockers: ${JSON.stringify(v5)}`);
    });

    it('rejects empty stale_company_ids.ids', () => {
      const lf = minimalValidLockfile();
      lf.stale_company_ids.ids = [];
      const blockers = validateLockfile(lf);
      assert.ok(blockers.filter((b) => b.code === 'V-LF-05').length >= 6);
    });
  });

  describe('V-LF-06 disposable_id_membership', () => {
    it('accepts empty disposable_company_ids.ids (first run)', () => {
      const lf = minimalValidLockfile();
      const blockers = validateLockfile(lf);
      const v6 = blockers.filter((b) => b.code === 'V-LF-06');
      assert.deepEqual(v6, []);
    });

    it('rejects when disposable_company_ids.ids is not an array', () => {
      const lf = minimalValidLockfile();
      lf.disposable_company_ids = { ids: 'oops' };
      const blockers = validateLockfile(lf);
      assert.ok(blockers.some((b) => b.code === 'V-LF-06'));
    });
  });

  describe('V-LF-07 auth_modes_consistent', () => {
    it('shipped lockfile auth_modes contract passes', () => {
      const lf = loadLockfileOrFail();
      const blockers = validateLockfile(lf);
      const v7 = blockers.filter((b) => b.code === 'V-LF-07');
      assert.deepEqual(v7, [], `unexpected blockers: ${JSON.stringify(v7)}`);
    });

    it('rejects PAPERCLIP_API_KEY in auth_modes.allowed', () => {
      const lf = minimalValidLockfile();
      lf.auth_modes.allowed.push({
        mode: 'api-key-bearer (PAPERCLIP_API_KEY)',
        status: 'confirmed'
      });
      const blockers = validateLockfile(lf);
      assert.ok(
        blockers.some(
          (b) => b.code === 'V-LF-07' && b.where === 'auth_modes.allowed'
        )
      );
    });

    it('rejects forbidden list missing public-sign-up', () => {
      const lf = minimalValidLockfile();
      lf.auth_modes.forbidden = [{ mode: 'something-else', status: 'forbidden' }];
      const blockers = validateLockfile(lf);
      assert.ok(
        blockers.some(
          (b) => b.code === 'V-LF-07' && b.where === 'auth_modes.forbidden'
        )
      );
    });
  });

  describe('V-LF-08 safe_restart_present', () => {
    it('shipped lockfile has safe_restart_command', () => {
      const lf = loadLockfileOrFail();
      const blockers = validateLockfile(lf);
      const v8 = blockers.filter((b) => b.code === 'V-LF-08');
      assert.deepEqual(v8, []);
    });

    it('rejects safe_restart_command missing paperclip_sandbox token', () => {
      const lf = minimalValidLockfile();
      lf.safe_restart_command = 'docker compose up -d paperclip';
      const blockers = validateLockfile(lf);
      assert.ok(blockers.some((b) => b.code === 'V-LF-08'));
    });
  });

  describe('V-LF-09 forbidden_commands_complete', () => {
    it('shipped lockfile contains all 5 R3 forbidden commands', () => {
      const lf = loadLockfileOrFail();
      const blockers = validateLockfile(lf);
      const v9 = blockers.filter((b) => b.code === 'V-LF-09');
      assert.deepEqual(v9, [], `unexpected blockers: ${JSON.stringify(v9)}`);
    });

    it('rejects missing forbidden command', () => {
      const lf = minimalValidLockfile();
      lf.forbidden_commands = lf.forbidden_commands.filter(
        (c) => c.command !== 'docker volume rm'
      );
      const blockers = validateLockfile(lf);
      assert.ok(
        blockers.some(
          (b) => b.code === 'V-LF-09' && b.evidence.missing_command === 'docker volume rm'
        )
      );
    });

    it('accepts forbidden_commands as bare strings', () => {
      const lf = minimalValidLockfile();
      lf.forbidden_commands = [...R3_FORBIDDEN_COMMANDS];
      const blockers = validateLockfile(lf);
      const v9 = blockers.filter((b) => b.code === 'V-LF-09');
      assert.deepEqual(v9, [], `unexpected: ${JSON.stringify(v9)}`);
    });
  });

  describe('V-LF-10 no_stale_id_in_mutation_defaults', () => {
    it('shipped lockfile has no stale IDs as mutation defaults', () => {
      const lf = loadLockfileOrFail();
      const blockers = validateLockfile(lf);
      const v10 = blockers.filter((b) => b.code === 'V-LF-10');
      assert.deepEqual(v10, [], `unexpected blockers: ${JSON.stringify(v10)}`);
    });

    it('rejects canonical_company_id = a stale UUID (m013_s02_create_tech_debt_issue.js default)', () => {
      const lf = minimalValidLockfile();
      lf.company_identity.canonical_company_id = '9feb4c22-05b9-401e-ba67-0e866e3056da';
      lf.company_identity.canonical_company_id_status = 'verified';
      lf.company_identity.fresh_readback_required = false;
      const blockers = validateLockfile(lf);
      assert.ok(
        blockers.some(
          (b) => b.code === 'V-LF-10' && b.where === 'company_identity.canonical_company_id'
        )
      );
    });

    it('rejects verified_company_id = a stale UUID (create_bos_v141_agents.py default)', () => {
      const lf = minimalValidLockfile();
      lf.company_identity.verified_company_id = '43c74adb-b194-44d1-8f8e-ba142544bb9d';
      lf.company_identity.verified_company_id_status = 'verified';
      lf.company_identity.fresh_readback_required = false;
      const blockers = validateLockfile(lf);
      assert.ok(
        blockers.some(
          (b) => b.code === 'V-LF-10' && b.where === 'company_identity.verified_company_id'
        )
      );
    });

    it('rejects disposable_company_id leaking into verified_company_id', () => {
      const lf = minimalValidLockfile();
      lf.disposable_company_ids.ids = [
        'aaaa1111-2222-3333-4444-555566667777'
      ];
      lf.company_identity.verified_company_id = 'aaaa1111-2222-3333-4444-555566667777';
      lf.company_identity.verified_company_id_status = 'verified';
      lf.company_identity.fresh_readback_required = false;
      const blockers = validateLockfile(lf);
      assert.ok(
        blockers.some(
          (b) => b.code === 'V-LF-10' && b.where === 'company_identity.verified_company_id'
        )
      );
    });

    it('rejects mutation_default_sources containing a fully-qualified UUID literal', () => {
      const lf = minimalValidLockfile();
      lf.mutation_default_sources.forbidden_default_sources.push(
        '9feb4c22-05b9-401e-ba67-0e866e3056da'
      );
      const blockers = validateLockfile(lf);
      assert.ok(
        blockers.some(
          (b) =>
            b.code === 'V-LF-10' &&
            b.where === 'mutation_default_sources.forbidden_default_sources'
        )
      );
    });

    it('rejects mutation_default_sources missing', () => {
      const lf = minimalValidLockfile();
      delete lf.mutation_default_sources;
      const blockers = validateLockfile(lf);
      assert.ok(blockers.some((b) => b.code === 'V-LF-10'));
    });
  });

  describe('structured blocker output', () => {
    it('blockers include code, kind, where, message without secrets', () => {
      const lf = minimalValidLockfile();
      lf.company_identity.canonical_company_id = '9feb4c22-05b9-401e-ba67-0e866e3056da';
      lf.company_identity.canonical_company_id_status = 'verified';
      lf.company_identity.fresh_readback_required = false;
      const blockers = validateLockfile(lf);
      assert.ok(blockers.length >= 1);
      for (const b of blockers) {
        assert.equal(typeof b.code, 'string');
        assert.ok(b.code.startsWith('V-LF-'));
        assert.ok(
          ['schema', 'target', 'auth', 'adapter', 'confirmation', 'mutation_default'].includes(
            b.kind
          )
        );
        assert.equal(typeof b.where, 'string');
        assert.equal(typeof b.message, 'string');
        // Ensure no secret-shaped tokens leak (long hex/base64 strings or
        // anything that looks like an api_key=… or cookie value).
        const text = JSON.stringify(b);
        assert.ok(!/api_key=|password=|cookie=/i.test(text));
        assert.ok(!/[A-Za-z0-9+/]{60,}={0,2}/.test(text), 'looks like raw base64 token');
      }
    });

    it('validateLockfile is exported and reusable for preflight', () => {
      assert.equal(typeof validateLockfile, 'function');
      const blockers = validateLockfile(minimalValidLockfile());
      assert.equal(Array.isArray(blockers), true);
    });
  });
});

// ---------------------------------------------------------------------------
// CLI gate intentionally omitted.
//
// `node --test` loads each test file with `require.main === module` returning
// true (the test file IS the entry point of its subprocess). A synchronous
// CLI gate would call process.exit() before `describe`/`it` blocks register,
// producing a misleading 0/0 summary. A deferred CLI gate via setImmediate()
// still calls process.exit() AFTER tests run and masks the test runner's
// intended exit code (failures would be hidden by the gate's exit(0)).
//
// Per S02 validator precedent (scripts/validate_m014_s02_vps_forensics.js),
// this file is test-only. Callers invoke validation via:
//   1. `node --test scripts/validate_paperclip_runtime_lock.js` (CI gate)
//   2. `require('./scripts/validate_paperclip_runtime_lock').validateLockfile(obj)`
//      (T02 preflight + S04 persistence canary + downstream consumers).
//
// If a CLI gate becomes useful later, add it as a SEPARATE file
// (scripts/cli-validate-paperclip-runtime-lock.js) so the test suite stays
// free of side effects.
// ---------------------------------------------------------------------------

module.exports = {
  validateLockfile,
  makeBlocker,
  LOCKFILE_PATH,
  R3_STALE_PREFIXES,
  R3_FORBIDDEN_COMMANDS,
  REQUIRED_TOP_LEVEL_KEYS
};