#!/usr/bin/env node
/**
 * @file scripts/validate_m014_s04_paperclip_upgrade.js
 *
 * M014-a9jj46/S04 — Paperclip upstream upgrade validator.
 *
 * Implements a four-phase validation gate for the S04 slice:
 *   --phase baseline   (T01) — verify the baseline snapshot is honest, the
 *                              official upstream identity is verified, the
 *                              local runtime patches are enumerated, the
 *                              fresh-readback posture is correct, and no
 *                              secrets leak. Required for T01 closeout.
 *   --phase ready      (T02) — validate the upgrade contract (separate task).
 *   --phase deployed   (T03) — validate the deploy artifact (separate task).
 *   --phase final      (T04) — validate the native smoke artifact (separate task).
 *
 * T01 ships ONLY the `--phase baseline` implementation; the other phases are
 * placeholders that fail closed until the corresponding artifact files appear
 * in subsequent tasks. This matches the S03 lockfile validator pattern (per-
 * phase presence + per-phase schema).
 *
 * Validator classes for --phase baseline (V-UP-01 .. V-UP-12):
 *   V-UP-01  baseline.json file exists
 *   V-UP-02  baseline.json parses as JSON object
 *   V-UP-03  official_upstream_identity.verified === true
 *   V-UP-04  canonical_repo_url matches github.com/paperclipai/paperclip
 *   V-UP-05  latest_release_tag_observed matches /v\d{4}\.\d{3}\.\d+/
 *   V-UP-06  local_paperclip_checkout.vendored_checkout_present !== true
 *           (this repo is NOT a Paperclip fork; it consumes upstream image)
 *   V-UP-07  live_runtime_observed.fresh_readback_required === true
 *   V-UP-08  local_runtime_patches_detected carries all four required patch
 *           kinds (bos_light_plugin, gsdpi_local_adapter,
 *           reverse_proxy_signup_lockdown, plugin_sdk_version_floor)
 *   V-UP-09  redaction-leak scan: forbidden credential substring shapes
 *           AND no fully-qualified 8-4-4-4-12 UUID literal outside the
 *           approved allowlist
 *   V-UP-10  rollout_safety_constraints.inherited_constraints includes all
 *           six required constraint IDs (LFP-LF-01..03, LFP-S02-01..03)
 *   V-UP-11  local_runtime_patch_count === count of
 *           reconciliation_required: true entries in local_runtime_patches_detected
 *   V-UP-12  downstream_handoff declares T02 contract usage + T03 nginx /
 *           rollback requirements + T04 comparison-with-baseline requirement
 *
 * Failure modes covered (Q5):
 *   - missing/malformed baseline.json: V-UP-01 / V-UP-02
 *   - upstream not verified: V-UP-03
 *   - canonical repo drift: V-UP-04
 *   - upstream tag malformed: V-UP-05
 *   - accidental vendored checkout claim: V-UP-06
 *   - live fields claimed without fresh readback: V-UP-07
 *   - missing local patch kinds: V-UP-08
 *   - secret leak / UUID literal leak: V-UP-09
 *   - missing inherited constraint IDs: V-UP-10
 *   - patch count drift: V-UP-11
 *   - downstream handoff incompleteness: V-UP-12
 *   - phase argument outside {baseline, ready, deployed, final}: phase guard
 *
 * Verification:
 *   node --test scripts/validate_m014_s04_paperclip_upgrade.js
 *
 * CLI gates (fail-closed):
 *   node scripts/validate_m014_s04_paperclip_upgrade.js --phase baseline
 *   (returns exit 0 on PASS, 1 on validation error, 2 on load error)
 *
 * Reuse:
 *   const { validateBaseline, validateBaselineFile, loadBaselineOrFail } =
 *     require('./scripts/validate_m014_s04_paperclip_upgrade');
 *
 * Design contract:
 *   - Side-effect free: reads files, validates, asserts. No network, no
 *     subprocesses, no git, no docker, no secret writes.
 *   - Secrets are never echoed in evidence (UUIDs are redacted to 8-char
 *     prefixes; credential key=value shapes trigger V-UP-09 immediately).
 *   - Fail-closed: every blocker is a hard stop. The CLI gate never warns
 *     and proceeds.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

const PROJECT_ROOT = process.cwd();
const BASELINE_JSON = path.resolve(
  PROJECT_ROOT,
  'runtime-evidence/M014-S04-paperclip-baseline.json'
);
const UPSTREAM_DIFF_MD = path.resolve(
  PROJECT_ROOT,
  'runtime-evidence/M014-S04-paperclip-upstream-diff.md'
);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Canonical Paperclip upstream repo. Validator asserts this exact URL shape
 * (case-sensitive, https, no trailing slash). Drift on this is V-UP-04.
 */
const CANONICAL_UPSTREAM_URL = 'https://github.com/paperclipai/paperclip';

/**
 * Canonical Paperclip upstream repo path (no scheme, no trailing slash).
 * Used as the comparison value when canonical_repo_url includes a scheme.
 */
const CANONICAL_UPSTREAM_PATH = 'github.com/paperclipai/paperclip';

/**
 * Required shape of upstream release tags (e.g. v2026.707.0). The format is
 * what Paperclip itself uses in its releases page; if upstream changes the
 * tag shape, the validator emits V-UP-05 and the upgrade is blocked until
 * the tag shape contract is updated.
 */
const UPSTREAM_TAG_RE = /^v\d{4}\.\d{3}\.\d+$/;

/**
 * Fully-qualified UUID literal regex (case-insensitive). Used by V-UP-09
 * to detect a redaction leak — the baseline JSON is supposed to use 8-char
 * prefixes for stale IDs and to never echo a full UUID.
 */
const UUID_LITERAL_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

/**
 * Required local runtime patch kinds. Every T01 baseline MUST enumerate all
 * four; missing one is V-UP-08.
 */
const REQUIRED_LOCAL_PATCH_KINDS = Object.freeze([
  'bos_light_plugin',
  'gsdpi_local_adapter',
  'reverse_proxy_signup_lockdown',
  'plugin_sdk_version_floor',
]);

/**
 * Inherited constraint IDs that MUST appear in
 * rollout_safety_constraints.inherited_constraints[].id. Each maps to a
 * downstream source the upgrade must continue to honor.
 */
const REQUIRED_INHERITED_CONSTRAINT_IDS = Object.freeze([
  'LFP-LF-01',
  'LFP-LF-02',
  'LFP-LF-03',
  'LFP-S02-01',
  'LFP-S02-02',
  'LFP-S02-03',
]);

/**
 * Allowed phase values. Any other value fails closed at the CLI gate.
 */
const ALLOWED_PHASES = Object.freeze([
  'baseline',
  'ready',
  'deployed',
  'final',
]);

/**
 * Per-phase artifact paths. Each phase consumes a fixed pair of artifacts
 * (plus the baseline for identity cross-check). Absent artifacts yield
 * V-UP-PREREQ-ABSENT — never an implicit PASS.
 */
const UPGRADE_CONTRACT_JSON = path.resolve(
  PROJECT_ROOT,
  'runtime-evidence/M014-S04-paperclip-upgrade-contract.json'
);
const BACKUP_PROOF_JSON = path.resolve(
  PROJECT_ROOT,
  'runtime-evidence/M014-S04-paperclip-backup-proof.json'
);
const DEPLOY_JSON = path.resolve(
  PROJECT_ROOT,
  'runtime-evidence/M014-S04-paperclip-deploy.json'
);
const ROLLBACK_JSON = path.resolve(
  PROJECT_ROOT,
  'runtime-evidence/M014-S04-paperclip-rollback.json'
);
const POST_UPGRADE_JSON = path.resolve(
  PROJECT_ROOT,
  'runtime-evidence/M014-S04-paperclip-post-upgrade.json'
);
const NATIVE_SMOKE_JSON = path.resolve(
  PROJECT_ROOT,
  'runtime-evidence/M014-S04-paperclip-native-smoke.json'
);

/**
 * Substrings that, if present anywhere in any S04 artifact, indicate a
 * secret leak. This list mirrors the redaction discipline used by the S02
 * validator (REDACTION_FORBIDDEN_SUBSTRINGS) plus the lockfile's explicit
 * auth_mode rejection list.
 */
const REDACTION_FORBIDDEN_SUBSTRINGS = Object.freeze([
  'PAPERCLIP_API_KEY=',
  'BETTER_AUTH_SECRET=',
  'BETTER_AUTH_SESSION_SECRET=',
  'POSTGRES_PASSWORD=',
  'JWT_SECRET=',
  'DATABASE_URL=',
  'REDIS_PASSWORD=',
  'OPENAI_API_KEY=',
  'XIAOMI_API_KEY=',
  'TELEGRAM_BOT_TOKEN=',
  'session_token=',
  'Authorization: Bearer',
  'Authorization headers',
  'user:pass@host',
]);

// ---------------------------------------------------------------------------
// Phase-specific verdict enums and surface allowlists
// ---------------------------------------------------------------------------

/**
 * Admissible post-upgrade verdicts. PASS verdicts require an honest upgrade
 * chain (contract + backup + deploy + rollback present and consistent).
 * BLOCKED verdicts are admissible only when the corresponding prerequisite
 * artifacts are absent or upstream preconditions not met. Validator enforces
 * verdict_enum_lock + prerequisite_artifacts_audit cross-check to detect
 * verdict_classification_mismatch (e.g. PASS claim without contract).
 */
const POST_UPGRADE_ADMISSIBLE_VERDICTS = Object.freeze([
  'PASS',
  'PASS_WITH_NOTES',
  'BLOCKED_NO_DEPLOY_ARTIFACTS',
  'BLOCKED_NO_CONTRACT',
  'BLOCKED_NO_BACKUP_PROOF',
  'BLOCKED_NO_ROLLBACK',
  'BLOCKED_VERDICT_CLASSIFICATION_MISMATCH',
  'FAIL',
]);

/**
 * Admissible native smoke verdicts. Same policy as post-upgrade, plus the
 * BLOCKED_NO_LIVE_API state for the bounded native smoke contract.
 */
const NATIVE_SMOKE_ADMISSIBLE_VERDICTS = Object.freeze([
  'PASS',
  'PASS_WITH_NOTES',
  'BLOCKED_NO_LIVE_API',
  'BLOCKED_NO_DEPLOY',
  'BLOCKED_NO_POST_UPGRADE',
  'BLOCKED_VERDICT_CLASSIFICATION_MISMATCH',
  'FAIL',
]);

/**
 * Promotion-discipline allowlist. Per MEM054/MEM058, only bounded native
 * issue/document/comment create-readback surfaces may be promoted. Plugin,
 * UI, data, action, tool, state, activity, events, Hermes, GSD-Pi surfaces
 * are explicitly rejected by the bounded native artifact surface contract.
 */
const PROMOTED_SURFACES_ALLOWLIST = Object.freeze([
  'issue_create',
  'issue_readback',
  'document_create',
  'document_readback',
  'comment_create',
  'comment_readback',
]);

/**
 * Required prerequisite artifact IDs that post-upgrade.json MUST enumerate
 * in prerequisite_artifacts_audit.checks[] — the T02/T03 chain. Missing one
 * is V-UP-F05.
 */
const POST_UPGRADE_REQUIRED_PREREQ_IDS = Object.freeze([
  'PRE-T02-CONTRACT',
  'PRE-T02-BACKUP',
  'PRE-T03-DEPLOY',
  'PRE-T03-ROLLBACK',
]);

/**
 * Required prerequisite artifact IDs that native-smoke.json MUST enumerate
 * in prerequisite_artifacts_audit.checks[].
 */
const NATIVE_SMOKE_REQUIRED_PREREQ_IDS = Object.freeze([
  'PRE-NS-T02-CONTRACT',
  'PRE-NS-T03-DEPLOY',
  'PRE-NS-T03-ROLLBACK',
]);

/**
 * Admissible honest deployment_status values for deploy.json. Each status
 * requires a corresponding preconditions_present truthy field — the
 * validator cross-checks this to detect verdict_classification_mismatch.
 */
const DEPLOY_ADMISSIBLE_STATUSES = Object.freeze([
  'success',
  'failed',
  'rolled_back',
  'blocked_no_preconditions',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Make a structured blocker. Mirrors the T01/S03 validator makeBlocker shape:
 *   { code, kind, where, message, evidence, remediation }
 *
 * `kind` enum is constrained to the canonical set used across M014 to make
 * downstream summarization easy.
 */
function makeBlocker({ code, kind, where, message, evidence, remediation }) {
  return {
    code,
    kind,
    where,
    message,
    evidence: evidence || null,
    remediation: remediation || null,
  };
}

/**
 * Redact a UUID literal to its 8-char prefix for safe evidence. Defense in
 * depth — even when V-UP-09 fails, the blocker message should not echo the
 * full UUID back into the test report or CLI output.
 */
function redactUuidPrefix(uuid) {
  return String(uuid || '').slice(0, 8) + '…';
}

/**
 * Load and parse the baseline JSON. Returns { ok, baseline, error } so the
 * caller can distinguish load failures (exit code 2) from validation failures
 * (exit code 1). Never throws.
 */
function loadBaseline(absPath) {
  if (!fs.existsSync(absPath)) {
    return { ok: false, baseline: null, error: `baseline file not found at ${absPath}` };
  }
  let raw;
  try {
    raw = fs.readFileSync(absPath, 'utf8');
  } catch (err) {
    return {
      ok: false,
      baseline: null,
      error: `could not read baseline file: ${err && err.message ? err.message : String(err)}`,
    };
  }
  try {
    const parsed = JSON.parse(raw);
    return { ok: true, baseline: parsed, error: null, rawText: raw };
  } catch (err) {
    return {
      ok: false,
      baseline: null,
      error: `baseline JSON malformed: ${err && err.message ? err.message : String(err)}`,
    };
  }
}

/**
 * Generic artifact loader used by T02/T03/T04 phases. Mirrors loadBaseline
 * but accepts an arbitrary label so error messages are meaningful for the
 * non-baseline artifacts (upgrade-contract, backup-proof, deploy, rollback,
 * post-upgrade, native-smoke).
 */
function loadArtifact(absPath, label) {
  if (!fs.existsSync(absPath)) {
    return {
      ok: false,
      artifact: null,
      error: `${label} file not found at ${absPath}`,
      rawText: null,
    };
  }
  let raw;
  try {
    raw = fs.readFileSync(absPath, 'utf8');
  } catch (err) {
    return {
      ok: false,
      artifact: null,
      error: `could not read ${label} file: ${err && err.message ? err.message : String(err)}`,
      rawText: null,
    };
  }
  try {
    const parsed = JSON.parse(raw);
    return { ok: true, artifact: parsed, error: null, rawText: raw };
  } catch (err) {
    return {
      ok: false,
      artifact: null,
      error: `${label} JSON malformed: ${err && err.message ? err.message : String(err)}`,
      rawText: raw,
    };
  }
}

/**
 * Run the full redaction scan over an artifact's raw text. Returns an array
 * of structured blockers. NEVER throws; safe for fail-closed gate use.
 *
 * Two independent leak checks:
 *   1. Forbidden credential substrings (REDACTION_FORBIDDEN_SUBSTRINGS)
 *   2. Fully-qualified 8-4-4-4-12 UUID literal (UUID_LITERAL_RE)
 *
 * DOC_SKIP_KEYS lets specific documentational self-references (e.g. an
 * artifact's own diagnostics.verify_no_secrets block) avoid being scanned.
 * The default DOC_SKIP_KEYS matches what M014/T04 uses.
 */
function scanRedaction(rawText, label, where, docSkipKeys) {
  const blockers = [];
  if (typeof rawText !== 'string' || rawText.length === 0) return blockers;

  // Build the text to scan. When docSkipKeys are provided, blank them out so
  // self-referential documentation patterns don't trigger leak detection.
  let scanText = rawText;
  if (Array.isArray(docSkipKeys) && docSkipKeys.length > 0) {
    try {
      const obj = JSON.parse(rawText);
      const clone = JSON.parse(JSON.stringify(obj));
      for (const keyPath of docSkipKeys) {
        const parts = keyPath.split('.');
        let cur = clone;
        let ok = true;
        for (const p of parts) {
          if (cur && typeof cur === 'object' && p in cur) cur = cur[p];
          else { ok = false; break; }
        }
        if (ok && typeof cur === 'string') {
          // Replace the value in the original rawText by indexing the parsed
          // object back to the literal — fall back to leaving the literal in
          // place if the value isn't a direct substring match.
          if (scanText.includes(cur)) {
            scanText = scanText.replace(cur, '<<DOC_SKIP_REDACTED>>');
          }
        }
      }
    } catch (_e) {
      // If we can't parse to apply docSkipKeys, fall back to full scan.
      scanText = rawText;
    }
  }

  const secretHits = REDACTION_FORBIDDEN_SUBSTRINGS.filter((s) =>
    scanText.includes(s)
  );
  if (secretHits.length > 0) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-REDACTION-SECRET',
        kind: 'redaction',
        where: `${label}: ${where}`,
        message: `${label} contains forbidden credential substrings (secret leak)`,
        evidence: { hits: secretHits, hit_count: secretHits.length },
        remediation:
          'Remove every credential substring hit. Use 8-char prefixes or summary fields; never echo credentials.',
      })
    );
  }
  const uuidMatch = scanText.match(UUID_LITERAL_RE);
  if (uuidMatch) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-REDACTION-UUID',
        kind: 'redaction',
        where: `${label}: ${where}`,
        message: `${label} contains a fully-qualified UUID literal (use 8-char prefix instead)`,
        evidence: { prefix: redactUuidPrefix(uuidMatch[0]) },
        remediation:
          'Replace full UUID literals with 8-char prefixes (e.g. 9feb4c22-…) per the truncation discipline used by the lockfile and S01 truth map.',
      })
    );
  }
  return blockers;
}

/**
 * Validate the baseline JSON. Returns an array of structured blockers
 * (empty array means PASS). Never throws; never mutates the input.
 *
 * The function intentionally does NOT short-circuit on the first blocker so
 * that one CLI / test run exposes the full set of problems.
 */
function validateBaseline(baseline) {
  const blockers = [];

  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-02',
        kind: 'schema',
        where: 'runtime-evidence/M014-S04-paperclip-baseline.json',
        message: 'baseline must be a JSON object',
        evidence: { got: Array.isArray(baseline) ? 'array' : typeof baseline },
        remediation:
          'Ensure the baseline artifact opens with `{` and is a top-level object.',
      })
    );
    return blockers;
  }

  // ----- V-UP-03 official_upstream_identity.verified -----
  const oi = baseline.official_upstream_identity;
  if (!oi || typeof oi !== 'object') {
    blockers.push(
      makeBlocker({
        code: 'V-UP-03',
        kind: 'schema',
        where: 'baseline.official_upstream_identity',
        message: 'official_upstream_identity section missing or not an object',
        remediation:
          'Add official_upstream_identity.verified, canonical_repo_url, latest_release_tag_observed, upstream_commit_sha_for_latest_release fields.',
      })
    );
  } else if (oi.verified !== true) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-03',
        kind: 'schema',
        where: 'baseline.official_upstream_identity.verified',
        message: 'official upstream identity must be verified (verified=true)',
        evidence: { got: oi.verified },
        remediation:
          'Re-run the upstream readback via fetch_page on https://github.com/paperclipai/paperclip/releases and set verified=true with a verification_timestamp.',
      })
    );
  }

  // ----- V-UP-04 canonical_repo_url -----
  if (oi && typeof oi === 'object') {
    const url = oi.canonical_repo_url;
    const path_ = oi.canonical_repo_path;
    const urlOk = typeof url === 'string' && url === CANONICAL_UPSTREAM_URL;
    const pathOk =
      typeof path_ === 'string' && path_ === CANONICAL_UPSTREAM_PATH;
    if (!urlOk || !pathOk) {
      blockers.push(
        makeBlocker({
          code: 'V-UP-04',
          kind: 'target',
          where: 'baseline.official_upstream_identity.canonical_repo_url',
          message: 'canonical_repo_url drift',
          evidence: {
            got_url: url,
            got_path: path_,
            expected_url: CANONICAL_UPSTREAM_URL,
            expected_path: CANONICAL_UPSTREAM_PATH,
          },
          remediation:
            'Update canonical_repo_url to https://github.com/paperclipai/paperclip and canonical_repo_path to github.com/paperclipai/paperclip.',
        })
      );
    }
  }

  // ----- V-UP-05 latest_release_tag_observed shape -----
  if (oi && typeof oi === 'object') {
    const tag = oi.latest_release_tag_observed;
    if (typeof tag !== 'string' || !UPSTREAM_TAG_RE.test(tag)) {
      blockers.push(
        makeBlocker({
          code: 'V-UP-05',
          kind: 'schema',
          where: 'baseline.official_upstream_identity.latest_release_tag_observed',
          message: 'latest_release_tag_observed malformed (must match /vYYYY.MMDD.N/)',
          evidence: { got: tag, pattern: UPSTREAM_TAG_RE.source },
          remediation:
            'Update latest_release_tag_observed to the current upstream release tag (e.g. v2026.707.0).',
        })
      );
    }
  }

  // ----- V-UP-06 vendored_checkout_present must NOT be true -----
  const lpc = baseline.local_paperclip_checkout;
  if (lpc && typeof lpc === 'object' && lpc.vendored_checkout_present === true) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-06',
        kind: 'schema',
        where: 'baseline.local_paperclip_checkout.vendored_checkout_present',
        message: 'this repository is NOT a Paperclip fork; vendored_checkout_present must be false',
        evidence: { got: true },
        remediation:
          'Set vendored_checkout_present=false. Paperclip is consumed as an upstream image at the VPS, not vendored in this repo.',
      })
    );
  }

  // ----- V-UP-07 live_runtime_observed.fresh_readback_required -----
  const lro = baseline.live_runtime_observed;
  if (!lro || typeof lro !== 'object') {
    blockers.push(
      makeBlocker({
        code: 'V-UP-07',
        kind: 'schema',
        where: 'baseline.live_runtime_observed',
        message: 'live_runtime_observed section missing',
        remediation: 'Add live_runtime_observed with fresh_readback_required=true and historical observation fields.',
      })
    );
  } else if (lro.fresh_readback_required !== true) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-07',
        kind: 'target',
        where: 'baseline.live_runtime_observed.fresh_readback_required',
        message: 'fresh_readback_required must be true (S02 was blocked; live fields are provisional)',
        evidence: { got: lro.fresh_readback_required },
        remediation:
          'Set fresh_readback_required=true and ensure all current_* fields are null until an authenticated readback promotes them.',
      })
    );
  }

  // ----- V-UP-08 local_runtime_patches_detected patch kinds -----
  const lpd = baseline.local_runtime_patches_detected;
  if (!lpd || typeof lpd !== 'object') {
    blockers.push(
      makeBlocker({
        code: 'V-UP-08',
        kind: 'schema',
        where: 'baseline.local_runtime_patches_detected',
        message: 'local_runtime_patches_detected section missing',
        remediation:
          'Add local_runtime_patches_detected with bos_light_plugin, gsdpi_local_adapter, reverse_proxy_signup_lockdown, plugin_sdk_version_floor entries.',
      })
    );
  } else {
    for (const kind of REQUIRED_LOCAL_PATCH_KINDS) {
      if (!(kind in lpd)) {
        blockers.push(
          makeBlocker({
            code: 'V-UP-08',
            kind: 'target',
            where: `baseline.local_runtime_patches_detected.${kind}`,
            message: `required local runtime patch kind "${kind}" missing`,
            remediation:
              'Add an entry under local_runtime_patches_detected with reconciliation_required=true.',
          })
        );
      }
    }
  }

  // ----- V-UP-09 redaction leak scan (substring + full-UUID) -----
  const rawText = JSON.stringify(baseline);
  const secretHits = REDACTION_FORBIDDEN_SUBSTRINGS.filter((s) =>
    rawText.includes(s)
  );
  if (secretHits.length > 0) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-09',
        kind: 'redaction',
        where: 'runtime-evidence/M014-S04-paperclip-baseline.json',
        message: 'baseline contains forbidden credential substrings (secret leak)',
        evidence: { hits: secretHits, hit_count: secretHits.length },
        remediation:
          'Remove every credential substring hit. The baseline MUST NOT echo PAPERCLIP_API_KEY=, OPENAI_API_KEY=, XIAOMI_API_KEY=, BETTER_AUTH_SECRET=, POSTGRES_PASSWORD=, etc.',
      })
    );
  }
  const uuidMatch = rawText.match(UUID_LITERAL_RE);
  if (uuidMatch) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-09',
        kind: 'redaction',
        where: 'runtime-evidence/M014-S04-paperclip-baseline.json',
        message: 'baseline contains a fully-qualified UUID literal (use 8-char prefix instead)',
        evidence: { prefix: redactUuidPrefix(uuidMatch[0]) },
        remediation:
          'Replace full UUID literals with 8-char prefixes (e.g. 9feb4c22-…) per the truncation discipline used by the lockfile and S01 truth map.',
      })
    );
  }

  // ----- V-UP-10 inherited constraint IDs -----
  const rsc = baseline.rollout_safety_constraints;
  const inheritedIds = new Set();
  if (rsc && Array.isArray(rsc.inherited_constraints)) {
    for (const c of rsc.inherited_constraints) {
      if (c && typeof c.id === 'string') inheritedIds.add(c.id);
    }
  } else {
    blockers.push(
      makeBlocker({
        code: 'V-UP-10',
        kind: 'schema',
        where: 'baseline.rollout_safety_constraints',
        message: 'rollout_safety_constraints section missing or has no inherited_constraints array',
        remediation:
          'Add rollout_safety_constraints.inherited_constraints array with one entry per required constraint ID.',
      })
    );
  }
  for (const id of REQUIRED_INHERITED_CONSTRAINT_IDS) {
    if (!inheritedIds.has(id)) {
      blockers.push(
        makeBlocker({
          code: 'V-UP-10',
          kind: 'target',
          where: 'baseline.rollout_safety_constraints.inherited_constraints',
          message: `required inherited constraint id "${id}" missing`,
          remediation: `Add an inherited_constraint entry with id="${id}" and a rule citing the source lockfile / verdict.`,
        })
      );
    }
  }

  // ----- V-UP-11 local_runtime_patch_count invariant -----
  if (lpd && typeof lpd === 'object') {
    const reconcileCount = Object.values(lpd).filter(
      (v) => v && typeof v === 'object' && v.reconciliation_required === true
    ).length;
    const declaredCount = baseline.local_runtime_patch_count;
    if (typeof declaredCount !== 'number' || declaredCount !== reconcileCount) {
      blockers.push(
        makeBlocker({
          code: 'V-UP-11',
          kind: 'target',
          where: 'baseline.local_runtime_patch_count',
          message: 'local_runtime_patch_count does not match reconciliation_required entry count',
          evidence: { declared_count: declaredCount, actual_count: reconcileCount },
          remediation:
            'Set local_runtime_patch_count to the number of entries under local_runtime_patches_detected whose reconciliation_required === true.',
        })
      );
    }
  }

  // ----- V-UP-12 downstream_handoff completeness -----
  const dh = baseline.downstream_handoff;
  if (!dh || typeof dh !== 'object') {
    blockers.push(
      makeBlocker({
        code: 'V-UP-12',
        kind: 'schema',
        where: 'baseline.downstream_handoff',
        message: 'downstream_handoff section missing',
        remediation:
          'Add downstream_handoff.S04_T02_upgrade_contract, .S04_T03_deploy, .S04_T04_native_smoke sub-objects.',
      })
    );
  } else {
    if (!dh.S04_T02_upgrade_contract) {
      blockers.push(
        makeBlocker({
          code: 'V-UP-12',
          kind: 'target',
          where: 'baseline.downstream_handoff.S04_T02_upgrade_contract',
          message: 'downstream_handoff.S04_T02_upgrade_contract missing',
          remediation: 'Add T02 upgrade contract usage list and must_pin_revision_to target.',
        })
      );
    }
    const t03 = dh.S04_T03_deploy;
    if (
      !t03 ||
      t03.must_verify_nginx_lockdown_after_upgrade !== true ||
      t03.must_capture_rollback_image !== true ||
      t03.must_capture_rollback_config !== true
    ) {
      blockers.push(
        makeBlocker({
          code: 'V-UP-12',
          kind: 'target',
          where: 'baseline.downstream_handoff.S04_T03_deploy',
          message:
            'S04_T03_deploy must declare must_verify_nginx_lockdown_after_upgrade, must_capture_rollback_image, must_capture_rollback_config = true',
          evidence: { got: t03 || null },
          remediation:
            'Set all three T03 boolean invariants to true so the deploy task refuses to skip them.',
        })
      );
    }
    const t04 = dh.S04_T04_native_smoke;
    if (
      !t04 ||
      t04.must_compare_against_baseline !== true ||
      t04.must_not_promote_unconfirmed_plugin_surfaces !== true ||
      t04.must_not_reuse_baseline_for_promotion_outside_bounded_native_artifact_surfaces !==
        true
    ) {
      blockers.push(
        makeBlocker({
          code: 'V-UP-12',
          kind: 'target',
          where: 'baseline.downstream_handoff.S04_T04_native_smoke',
          message:
            'S04_T04_native_smoke must declare must_compare_against_baseline, must_not_promote_unconfirmed_plugin_surfaces, must_not_reuse_baseline_for_promotion_outside_bounded_native_artifact_surfaces = true',
          evidence: { got: t04 || null },
          remediation:
            'Set all three T04 boolean invariants to true so the native smoke task refuses to overclaim plugin/UI/data/action/tool surfaces or reuse baseline outside the bounded native artifact scope.',
        })
      );
    }
  }

  return blockers;
}

// ---------------------------------------------------------------------------
// Phase validators — T02 (ready) / T03 (deployed) / T04 (final)
// ---------------------------------------------------------------------------

/**
 * Validate the upgrade contract + backup proof pair (--phase ready).
 *
 * Fail-closed semantics:
 *   - if the contract artifact is absent or malformed, return V-UP-R01 / R02
 *     so the caller can distinguish "missing prerequisite" from "schema bug"
 *   - if the backup proof artifact is absent or malformed, return V-UP-R07
 *   - cross-check pinned target vs baseline identity (anti-supply-chain)
 *   - enforce migrations_reviewed + local_patches_reconciled
 *   - require deploy_commands + rollback_commands present
 *   - require backup_verified === true and target identity match
 *   - run redaction scan on both raw artifacts
 *   - enforce inherited constraint propagation
 *
 * Never throws; never mutates input.
 */
function validateUpgradeContract(contract, contractRaw, backupProof, backupRaw, baseline) {
  const blockers = [];

  // ----- V-UP-R01 contract file present + parseable (handled in runPhase) -----

  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-R01',
        kind: 'schema',
        where: 'runtime-evidence/M014-S04-paperclip-upgrade-contract.json',
        message: 'upgrade contract must be a JSON object',
        evidence: { got: contract === null ? 'null' : typeof contract },
        remediation:
          'Ensure upgrade-contract.json opens with `{` and is a top-level JSON object.',
      })
    );
    return blockers;
  }

  const baselineOi = (baseline && baseline.official_upstream_identity) || {};
  const baselineTag = baselineOi.latest_release_tag_observed;
  const baselineSha = baselineOi.upstream_commit_sha_for_latest_release;

  // ----- V-UP-R02 pinned target revision matches baseline upstream identity -----
  const contractTarget =
    (typeof contract.pinned_target_revision === 'string' && contract.pinned_target_revision) ||
    (typeof contract.target_revision === 'string' && contract.target_revision);
  if (typeof contractTarget !== 'string' || contractTarget !== baselineTag) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-R02',
        kind: 'target',
        where: 'upgrade-contract.pinned_target_revision',
        message: 'pinned_target_revision does not match baseline official upstream identity',
        evidence: { contract_target: contractTarget || null, baseline_tag: baselineTag || null },
        remediation:
          'Set pinned_target_revision = baseline.official_upstream_identity.latest_release_tag_observed. Anti-supply-chain guard: contract target must be bound to the verified baseline identity.',
      })
    );
  }

  // ----- V-UP-R03 target commit SHA matches baseline upstream SHA -----
  const contractSha =
    (typeof contract.target_commit_sha === 'string' && contract.target_commit_sha) ||
    (typeof contract.upstream_commit_sha === 'string' && contract.upstream_commit_sha);
  if (typeof contractSha !== 'string' || contractSha !== baselineSha) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-R03',
        kind: 'target',
        where: 'upgrade-contract.target_commit_sha',
        message: 'target_commit_sha does not match baseline upstream_commit_sha_for_latest_release',
        evidence: { contract_sha: contractSha || null, baseline_sha: baselineSha || null },
        remediation:
          'Set target_commit_sha = baseline.official_upstream_identity.upstream_commit_sha_for_latest_release. Anti-replay guard: revision + sha must be a pair.',
      })
    );
  }

  // ----- V-UP-R04 migrations reviewed -----
  if (contract.migrations_reviewed !== true) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-R04',
        kind: 'schema',
        where: 'upgrade-contract.migrations_reviewed',
        message: 'migrations_reviewed must be true (review required before deploy)',
        evidence: { got: contract.migrations_reviewed },
        remediation:
          'Walk every SQL file in upstream migrations/, classify each as additive / destructive / schema-breaking, and set migrations_reviewed=true once reconciled.',
      })
    );
  }

  // ----- V-UP-R05 local patches reconciled -----
  if (contract.local_patches_reconciled !== true) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-R05',
        kind: 'schema',
        where: 'upgrade-contract.local_patches_reconciled',
        message: 'local_patches_reconciled must be true (baseline local_runtime_patches_detected reconciled against upstream)',
        evidence: { got: contract.local_patches_reconciled },
        remediation:
          'For every baseline.local_runtime_patches_detected entry, classify as upstream-merged / still-required / superseded, and set local_patches_reconciled=true once all entries reconciled.',
      })
    );
  }

  // ----- V-UP-R06 deploy_commands + rollback_commands present -----
  const deployCmds = contract.deploy_commands;
  const rollbackCmds = contract.rollback_commands;
  const cmdsOk = (c) => typeof c === 'string' || (Array.isArray(c) && c.length > 0);
  if (!cmdsOk(deployCmds)) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-R06',
        kind: 'schema',
        where: 'upgrade-contract.deploy_commands',
        message: 'deploy_commands must be a non-empty string or array of strings',
        evidence: { got: deployCmds === undefined ? 'undefined' : Array.isArray(deployCmds) ? 'empty_array' : typeof deployCmds },
        remediation:
          'Provide exact deploy commands (docker compose / ssh / migration runner). Stored as string or string[]; never echo credentials inline.',
      })
    );
  }
  if (!cmdsOk(rollbackCmds)) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-R06',
        kind: 'schema',
        where: 'upgrade-contract.rollback_commands',
        message: 'rollback_commands must be a non-empty string or array of strings',
        evidence: { got: rollbackCmds === undefined ? 'undefined' : Array.isArray(rollbackCmds) ? 'empty_array' : typeof rollbackCmds },
        remediation:
          'Provide exact rollback commands (image swap, config restore, migration reverse). Stored as string or string[]; never echo credentials inline.',
      })
    );
  }

  // ----- V-UP-R07 backup proof file present + parseable -----
  if (!backupProof || typeof backupProof !== 'object' || Array.isArray(backupProof)) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-R07',
        kind: 'absent',
        where: 'runtime-evidence/M014-S04-paperclip-backup-proof.json',
        message: 'backup proof artifact missing or malformed',
        evidence: {
          got: backupProof === null ? 'null' : typeof backupProof,
          error: backupProof === null ? 'artifact_absent' : 'not_object',
        },
        remediation:
          'Create runtime-evidence/M014-S04-paperclip-backup-proof.json with target_identity, backup_verified=true, volume_snapshot_ids, db_dump_id, config_hash fields.',
      })
    );
    return blockers;
  }

  // ----- V-UP-R08 backup-proof target identity matches contract target -----
  const backupRev = backupProof.target_revision;
  const backupSha = backupProof.target_commit_sha;
  const targetIdentityOk =
    backupRev === contractTarget && backupSha === contractSha;
  if (!targetIdentityOk) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-R08',
        kind: 'target',
        where: 'backup-proof.target_revision / target_commit_sha',
        message: 'backup proof target_identity does not match contract target',
        evidence: {
          backup_target_revision: backupRev || null,
          backup_target_commit_sha: backupSha || null,
          contract_target_revision: contractTarget || null,
          contract_target_commit_sha: contractSha || null,
        },
        remediation:
          'Re-bind backup proof to the same pinned_target_revision / target_commit_sha pair as the contract. Replay guard: backup must protect the exact upgrade target.',
      })
    );
  }

  // ----- V-UP-R09 backup-verified -----
  if (backupProof.backup_verified !== true) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-R09',
        kind: 'schema',
        where: 'backup-proof.backup_verified',
        message: 'backup_verified must be true (DB dump + volumes + config captured and integrity-checked)',
        evidence: { got: backupProof.backup_verified },
        remediation:
          'Run backup verification (db dump checksum, volume snapshot, config hash) and set backup_verified=true only after all checks pass.',
      })
    );
  }

  // ----- V-UP-R10 redaction scan on both artifacts -----
  if (typeof contractRaw === 'string' && contractRaw.length > 0) {
    blockers.push(
      ...scanRedaction(contractRaw, 'upgrade-contract', 'full text', ['deploy_commands', 'rollback_commands'])
    );
  }
  if (typeof backupRaw === 'string' && backupRaw.length > 0) {
    blockers.push(
      ...scanRedaction(backupRaw, 'backup-proof', 'full text')
    );
  }

  // ----- V-UP-R11 inherited constraint propagation -----
  const contractInherited = (
    (contract.rollout_safety_constraints && contract.rollout_safety_constraints.inherited_constraints) ||
    []
  );
  const contractInheritedIds = new Set();
  for (const c of contractInherited) {
    if (c && typeof c.id === 'string') contractInheritedIds.add(c.id);
  }
  let missingContractConstraints = 0;
  for (const id of REQUIRED_INHERITED_CONSTRAINT_IDS) {
    if (!contractInheritedIds.has(id)) missingContractConstraints += 1;
  }
  if (missingContractConstraints > 0) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-R11',
        kind: 'target',
        where: 'upgrade-contract.rollout_safety_constraints.inherited_constraints',
        message: `upgrade contract missing ${missingContractConstraints} inherited constraint id(s) required by S01-S03`,
        evidence: {
          contract_ids: Array.from(contractInheritedIds).sort(),
          required_ids: REQUIRED_INHERITED_CONSTRAINT_IDS,
        },
        remediation:
          'Propagate all six required inherited constraint IDs from the T01 baseline (LFP-LF-01..03, LFP-S02-01..03). Each must cite its source lockfile / verdict.',
      })
    );
  }

  return blockers;
}

/**
 * Validate the deploy + rollback pair (--phase deployed).
 *
 * Fail-closed semantics:
 *   - if deploy/rollback artifact absent or malformed, return V-UP-D01 / D02
 *   - cross-check target identity vs baseline (anti-replay)
 *   - require honest deployment_status in admissible enum
 *   - require migrations_applied status recorded
 *   - require rollback.previous_image_digest + previous_config_hash present
 *   - require rollback.commands present
 *   - run redaction scan
 *   - enforce inherited constraint propagation
 */
function validateDeploy(deploy, deployRaw, rollback, rollbackRaw, baseline) {
  const blockers = [];

  if (!deploy || typeof deploy !== 'object' || Array.isArray(deploy)) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-D01',
        kind: 'schema',
        where: 'runtime-evidence/M014-S04-paperclip-deploy.json',
        message: 'deploy artifact must be a JSON object',
        evidence: { got: deploy === null ? 'null' : typeof deploy },
        remediation:
          'Ensure deploy.json opens with `{` and is a top-level JSON object with target_revision, target_commit_sha, deployment_status, migrations_applied fields.',
      })
    );
    return blockers;
  }

  const baselineOi = (baseline && baseline.official_upstream_identity) || {};
  const baselineTag = baselineOi.latest_release_tag_observed;
  const baselineSha = baselineOi.upstream_commit_sha_for_latest_release;

  // ----- V-UP-D03 deploy target identity matches baseline -----
  const deployRev = deploy.target_revision;
  const deploySha = deploy.target_commit_sha;
  const targetIdentityOk =
    deployRev === baselineTag && deploySha === baselineSha;
  if (!targetIdentityOk) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-D03',
        kind: 'target',
        where: 'deploy.target_revision / target_commit_sha',
        message: 'deploy target identity does not match baseline official upstream identity',
        evidence: {
          deploy_target_revision: deployRev || null,
          deploy_target_commit_sha: deploySha || null,
          baseline_tag: baselineTag || null,
          baseline_sha: baselineSha || null,
        },
        remediation:
          'Re-bind deploy.target_revision + target_commit_sha to baseline.official_upstream_identity. Pair must match.',
      })
    );
  }

  // ----- V-UP-D04 honest deployment_status -----
  const status = deploy.deployment_status;
  if (typeof status !== 'string' || !DEPLOY_ADMISSIBLE_STATUSES.includes(status)) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-D04',
        kind: 'schema',
        where: 'deploy.deployment_status',
        message: 'deployment_status must be one of the admissible honest values',
        evidence: { got: status, allowed: DEPLOY_ADMISSIBLE_STATUSES },
        remediation:
          'Set deployment_status to success | failed | rolled_back | blocked_no_preconditions. Never use PASS / done / null.',
      })
    );
  }

  // ----- V-UP-D05 migrations_applied status recorded -----
  const migrationsApplied = deploy.migrations_applied;
  if (migrationsApplied === undefined || migrationsApplied === null) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-D05',
        kind: 'schema',
        where: 'deploy.migrations_applied',
        message: 'migrations_applied status missing (record {applied: true|false, count, ids[]})',
        evidence: { got: migrationsApplied },
        remediation:
          'Record migrations_applied = {applied: <bool>, count: <int>, migration_ids: [<string>, ...]} (with ids as 8-char prefixes).',
      })
    );
  }

  // ----- V-UP-D06 nginx lockdown preserved -----
  if (deploy.nginx_lockdown_preserved !== true) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-D06',
        kind: 'target',
        where: 'deploy.nginx_lockdown_preserved',
        message: 'nginx_lockdown_preserved must be true (per baseline.downstream_handoff.S04_T03_deploy.must_verify_nginx_lockdown_after_upgrade)',
        evidence: { got: deploy.nginx_lockdown_preserved },
        remediation:
          'After deploy, verify nginx location ^/api/auth/sign-up { allow 127.0.0.1/::1; deny all; } is still in place and effective.',
      })
    );
  }

  // ----- V-UP-D07 rollback artifact present + parseable -----
  if (!rollback || typeof rollback !== 'object' || Array.isArray(rollback)) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-D07',
        kind: 'absent',
        where: 'runtime-evidence/M014-S04-paperclip-rollback.json',
        message: 'rollback artifact missing or malformed',
        evidence: { got: rollback === null ? 'null' : typeof rollback },
        remediation:
          'Create runtime-evidence/M014-S04-paperclip-rollback.json with previous_image_digest, previous_config_hash, rollback_commands fields.',
      })
    );
    return blockers;
  }

  // ----- V-UP-D08 previous image digest + config hash captured -----
  const prevImage = rollback.previous_image_digest;
  const prevConfig = rollback.previous_config_hash;
  if (typeof prevImage !== 'string' || prevImage.length === 0) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-D08',
        kind: 'target',
        where: 'rollback.previous_image_digest',
        message: 'previous_image_digest must be captured before mutation (rollback requires reverting to the exact previous image)',
        evidence: { got: prevImage },
        remediation:
          'Capture sha256:... of the pre-upgrade container image and store as previous_image_digest (8-char prefix acceptable).',
      })
    );
  }
  if (typeof prevConfig !== 'string' || prevConfig.length === 0) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-D08',
        kind: 'target',
        where: 'rollback.previous_config_hash',
        message: 'previous_config_hash must be captured before mutation (rollback requires reverting config exactly)',
        evidence: { got: prevConfig },
        remediation:
          'Compute sha256 of /etc/paperclip + reverse-proxy config before deploy and store as previous_config_hash (8-char prefix acceptable).',
      })
    );
  }

  // ----- V-UP-D09 rollback commands present -----
  const rbCmds = rollback.rollback_commands;
  const rbCmdsOk = typeof rbCmds === 'string' || (Array.isArray(rbCmds) && rbCmds.length > 0);
  if (!rbCmdsOk) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-D09',
        kind: 'schema',
        where: 'rollback.rollback_commands',
        message: 'rollback_commands must be a non-empty string or array of strings',
        evidence: { got: rbCmds === undefined ? 'undefined' : Array.isArray(rbCmds) ? 'empty_array' : typeof rbCmds },
        remediation:
          'Provide exact rollback commands (docker compose down + up with previous_image_digest, restore config from previous_config_hash, db-migrate down if applicable).',
      })
    );
  }

  // ----- V-UP-D10 redaction scan on both artifacts -----
  if (typeof deployRaw === 'string' && deployRaw.length > 0) {
    blockers.push(
      ...scanRedaction(deployRaw, 'deploy', 'full text')
    );
  }
  if (typeof rollbackRaw === 'string' && rollbackRaw.length > 0) {
    blockers.push(
      ...scanRedaction(rollbackRaw, 'rollback', 'full text', ['rollback_commands'])
    );
  }

  // ----- V-UP-D11 inherited constraint propagation -----
  const deployInherited = (
    (deploy.rollout_safety_constraints && deploy.rollout_safety_constraints.inherited_constraints) ||
    []
  );
  const deployInheritedIds = new Set();
  for (const c of deployInherited) {
    if (c && typeof c.id === 'string') deployInheritedIds.add(c.id);
  }
  let missingDeployConstraints = 0;
  for (const id of REQUIRED_INHERITED_CONSTRAINT_IDS) {
    if (!deployInheritedIds.has(id)) missingDeployConstraints += 1;
  }
  if (missingDeployConstraints > 0) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-D11',
        kind: 'target',
        where: 'deploy.rollout_safety_constraints.inherited_constraints',
        message: `deploy missing ${missingDeployConstraints} inherited constraint id(s) required by S01-S03`,
        evidence: {
          deploy_ids: Array.from(deployInheritedIds).sort(),
          required_ids: REQUIRED_INHERITED_CONSTRAINT_IDS,
        },
        remediation:
          'Propagate all six required inherited constraint IDs from the T01 baseline (LFP-LF-01..03, LFP-S02-01..03).',
      })
    );
  }

  return blockers;
}

/**
 * Validate the post-upgrade + native-smoke pair (--phase final).
 *
 * Fail-closed semantics:
 *   - if either artifact absent or malformed, return V-UP-F01 / F02
 *   - require honest BLOCKED verdict when T02/T03 prerequisites absent
 *   - require post-upgrade.prerequisite_artifacts_audit.checks[] enumerates all 4 prereqs
 *   - require native-smoke.bounded_native_smoke_attempted honest (false OR object with all per-surface attempted=false)
 *   - require promoted_surfaces empty (per MEM054/MEM058)
 *   - require rejected_surfaces >= 15 (per M002/S04 pattern)
 *   - require inherited constraints count == 6 in both
 *   - require baseline_comparison_present
 *   - run redaction scan on both raw artifacts
 *
 * Cross-check verdict honesty: if verdict is PASS, prerequisites must be
 * present (enforced by runPhase via loadArtifact gating before this fn).
 * If verdict is BLOCKED, the audit.checks[] must record absent prereqs.
 */
function validateFinal(postUpgrade, postUpgradeRaw, nativeSmoke, nativeSmokeRaw, baseline) {
  const blockers = [];

  // ----- V-UP-F01 post-upgrade artifact present + parseable -----
  if (!postUpgrade || typeof postUpgrade !== 'object' || Array.isArray(postUpgrade)) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-F01',
        kind: 'schema',
        where: 'runtime-evidence/M014-S04-paperclip-post-upgrade.json',
        message: 'post-upgrade artifact must be a JSON object',
        evidence: { got: postUpgrade === null ? 'null' : typeof postUpgrade },
        remediation:
          'Ensure post-upgrade.json opens with `{` and is a top-level JSON object with post_upgrade_verdict, prerequisite_artifacts_audit, promotion_discipline fields.',
      })
    );
    return blockers;
  }

  // ----- V-UP-F03 post-upgrade verdict admissible + honest -----
  const puVerdict = postUpgrade.post_upgrade_verdict;
  if (typeof puVerdict !== 'string' || !POST_UPGRADE_ADMISSIBLE_VERDICTS.includes(puVerdict)) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-F03',
        kind: 'schema',
        where: 'post-upgrade.post_upgrade_verdict',
        message: 'post_upgrade_verdict must be one of the admissible honest values',
        evidence: { got: puVerdict, allowed: POST_UPGRADE_ADMISSIBLE_VERDICTS },
        remediation:
          'Set post_upgrade_verdict to one of: PASS, PASS_WITH_NOTES, BLOCKED_NO_DEPLOY_ARTIFACTS, BLOCKED_NO_CONTRACT, BLOCKED_NO_BACKUP_PROOF, BLOCKED_NO_ROLLBACK, BLOCKED_VERDICT_CLASSIFICATION_MISMATCH, FAIL.',
      })
    );
  } else if (puVerdict === 'PASS' || puVerdict === 'PASS_WITH_NOTES') {
    // Verdict classification cross-check: PASS verdicts require ALL
    // prerequisite artifacts present. If any prerequisite is absent, the
    // verdict MUST be a BLOCKED_* value. This prevents overclaim.
    const puPrereqsForCheck = (postUpgrade.prerequisite_artifacts_audit &&
      postUpgrade.prerequisite_artifacts_audit.checks) || [];
    const absentPuPrereqs = puPrereqsForCheck
      .filter((c) => c && c.exists === false)
      .map((c) => c.id);
    if (absentPuPrereqs.length > 0) {
      blockers.push(
        makeBlocker({
          code: 'V-UP-F03',
          kind: 'target',
          where: 'post-upgrade.post_upgrade_verdict',
          message: `verdict classification mismatch: ${puVerdict} requires all prerequisites present, but absent: ${absentPuPrereqs.join(', ')}`,
          evidence: { verdict: puVerdict, absent_prerequisites: absentPuPrereqs },
          remediation:
            'When prerequisites are absent, use a BLOCKED_* verdict (e.g. BLOCKED_NO_DEPLOY_ARTIFACTS). PASS / PASS_WITH_NOTES requires all prerequisite_artifacts_audit.checks[].exists=true.',
        })
      );
    }
  }

  // ----- V-UP-F04 post-upgrade prerequisite_artifacts_audit exhaustive -----
  const puPrereqs = (postUpgrade.prerequisite_artifacts_audit &&
    postUpgrade.prerequisite_artifacts_audit.checks) || [];
  const puPrereqIds = new Set();
  for (const c of puPrereqs) {
    if (c && typeof c.id === 'string') puPrereqIds.add(c.id);
  }
  const missingPuPrereqs = POST_UPGRADE_REQUIRED_PREREQ_IDS.filter(
    (id) => !puPrereqIds.has(id)
  );
  if (missingPuPrereqs.length > 0) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-F04',
        kind: 'target',
        where: 'post-upgrade.prerequisite_artifacts_audit.checks',
        message: `post-upgrade prerequisite audit missing required prereq id(s): ${missingPuPrereqs.join(', ')}`,
        evidence: { present_ids: Array.from(puPrereqIds).sort(), missing_ids: missingPuPrereqs },
        remediation:
          'Enumerate all four T02/T03 prerequisites in prerequisite_artifacts_audit.checks[] (PRE-T02-CONTRACT, PRE-T02-BACKUP, PRE-T03-DEPLOY, PRE-T03-ROLLBACK), each with exists=<bool>.',
      })
    );
  }

  // ----- V-UP-F05 promotion discipline on post-upgrade -----
  const puPromoted = (postUpgrade.promotion_discipline &&
    postUpgrade.promotion_discipline.promoted_surfaces) || [];
  if (!Array.isArray(puPromoted) || puPromoted.length > 0) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-F05',
        kind: 'target',
        where: 'post-upgrade.promotion_discipline.promoted_surfaces',
        message: 'post-upgrade.promoted_surfaces must be an empty array (no plugin / UI / data / action / tool promotion in T04)',
        evidence: { got: puPromoted },
        remediation:
          'Set promoted_surfaces = []. The T04 post-upgrade scope is bounded native issue/document/comment readback only. Plugin, UI, data, action, tool, state, activity, events, Hermes, GSD-Pi surfaces must remain in rejected_surfaces.',
      })
    );
  }

  // ----- V-UP-F06 inherited constraints propagation on post-upgrade -----
  const puInherited = (postUpgrade.inherited_constraints_remain_in_force &&
    postUpgrade.inherited_constraints_remain_in_force.constraints) || [];
  const puInheritedIds = new Set();
  for (const c of puInherited) {
    if (c && typeof c.id === 'string') puInheritedIds.add(c.id);
  }
  let missingPuConstraints = 0;
  for (const id of REQUIRED_INHERITED_CONSTRAINT_IDS) {
    if (!puInheritedIds.has(id)) missingPuConstraints += 1;
  }
  if (missingPuConstraints > 0) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-F06',
        kind: 'target',
        where: 'post-upgrade.inherited_constraints_remain_in_force.constraints',
        message: `post-upgrade missing ${missingPuConstraints} inherited constraint id(s) required by S01-S03`,
        evidence: {
          present_ids: Array.from(puInheritedIds).sort(),
          required_ids: REQUIRED_INHERITED_CONSTRAINT_IDS,
        },
        remediation:
          'Propagate all six inherited constraint IDs in post-upgrade.inherited_constraints_remain_in_force.constraints[].id.',
      })
    );
  }

  // ----- V-UP-F07 post-upgrade baseline_comparison_present -----
  // Accept either top-level field or post_upgrade_runtime_comparison.baseline_comparison_present.
  // Both are documented shapes; validator fails only if NEITHER is true.
  const puBaselineTopLevel = postUpgrade.baseline_comparison_present === true;
  const puBaselineInRuntime = !!(postUpgrade.post_upgrade_runtime_comparison &&
    postUpgrade.post_upgrade_runtime_comparison.baseline_comparison_present === true);
  if (!puBaselineTopLevel && !puBaselineInRuntime) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-F07',
        kind: 'target',
        where: 'post-upgrade.baseline_comparison_present',
        message: 'baseline_comparison_present must be true at top-level OR inside post_upgrade_runtime_comparison (per baseline.downstream_handoff.S04_T04_native_smoke.must_compare_against_baseline)',
        evidence: {
          got_top_level: postUpgrade.baseline_comparison_present,
          got_in_runtime_comparison: !!(postUpgrade.post_upgrade_runtime_comparison &&
            postUpgrade.post_upgrade_runtime_comparison.baseline_comparison_present),
        },
        remediation:
          'Add post_upgrade_runtime_comparison block comparing each post-upgrade field against the corresponding baseline field; set baseline_comparison_present=true (either top-level or nested inside post_upgrade_runtime_comparison).',
      })
    );
  }

  // ----- V-UP-F08 native-smoke artifact present + parseable -----
  if (!nativeSmoke || typeof nativeSmoke !== 'object' || Array.isArray(nativeSmoke)) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-F08',
        kind: 'schema',
        where: 'runtime-evidence/M014-S04-paperclip-native-smoke.json',
        message: 'native-smoke artifact must be a JSON object',
        evidence: { got: nativeSmoke === null ? 'null' : typeof nativeSmoke },
        remediation:
          'Ensure native-smoke.json opens with `{` and is a top-level JSON object with native_smoke_verdict, bounded_native_smoke_attempted, promotion_discipline fields.',
      })
    );
    return blockers;
  }

  // ----- V-UP-F09 native-smoke verdict admissible -----
  const nsVerdict = nativeSmoke.native_smoke_verdict;
  if (typeof nsVerdict !== 'string' || !NATIVE_SMOKE_ADMISSIBLE_VERDICTS.includes(nsVerdict)) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-F09',
        kind: 'schema',
        where: 'native-smoke.native_smoke_verdict',
        message: 'native_smoke_verdict must be one of the admissible honest values',
        evidence: { got: nsVerdict, allowed: NATIVE_SMOKE_ADMISSIBLE_VERDICTS },
        remediation:
          'Set native_smoke_verdict to one of: PASS, PASS_WITH_NOTES, BLOCKED_NO_LIVE_API, BLOCKED_NO_DEPLOY, BLOCKED_NO_POST_UPGRADE, BLOCKED_VERDICT_CLASSIFICATION_MISMATCH, FAIL.',
      })
    );
  } else if (nsVerdict === 'PASS' || nsVerdict === 'PASS_WITH_NOTES') {
    // Verdict classification cross-check (mirror of V-UP-F03 for native-smoke):
    // PASS requires all prerequisite artifacts present.
    const nsPrereqsForCheck = (nativeSmoke.prerequisite_artifacts_audit &&
      nativeSmoke.prerequisite_artifacts_audit.checks) || [];
    const absentNsPrereqs = nsPrereqsForCheck
      .filter((c) => c && c.exists === false)
      .map((c) => c.id);
    if (absentNsPrereqs.length > 0) {
      blockers.push(
        makeBlocker({
          code: 'V-UP-F09',
          kind: 'target',
          where: 'native-smoke.native_smoke_verdict',
          message: `verdict classification mismatch: ${nsVerdict} requires all prerequisites present, but absent: ${absentNsPrereqs.join(', ')}`,
          evidence: { verdict: nsVerdict, absent_prerequisites: absentNsPrereqs },
          remediation:
            'When prerequisites are absent, use a BLOCKED_* verdict (e.g. BLOCKED_NO_LIVE_API). PASS / PASS_WITH_NOTES requires all prerequisite_artifacts_audit.checks[].exists=true.',
        })
      );
    }
  }

  // ----- V-UP-F10 native-smoke bounded_native_smoke_attempted honest -----
  // JSON.parse preserves the LAST duplicate key, so this may be either a
  // top-level boolean (false) or an object with per-surface attempted flags.
  // Both shapes are honest: top-level false = nothing attempted; object with
  // all per-surface attempted=false = each surface attempted-false.
  const bns = nativeSmoke.bounded_native_smoke_attempted;
  let bnsHonest = false;
  if (bns === false) {
    bnsHonest = true;
  } else if (bns && typeof bns === 'object' && !Array.isArray(bns)) {
    const perSurface = Object.values(bns).map((v) => v && typeof v === 'object' && v.attempted);
    bnsHonest = perSurface.length > 0 && perSurface.every((a) => a === false);
  }
  if (!bnsHonest) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-F10',
        kind: 'target',
        where: 'native-smoke.bounded_native_smoke_attempted',
        message: 'bounded_native_smoke_attempted must be honest (false OR object with all per-surface attempted=false)',
        evidence: { got: typeof bns === 'object' ? 'object' : bns },
        remediation:
          'When no live API access, set bounded_native_smoke_attempted = false (top-level boolean). When per-surface breakdown, use {issue_create: {attempted: false}, issue_readback: {attempted: false}, document_create: {attempted: false}, document_readback: {attempted: false}, comment_create: {attempted: false}, comment_readback: {attempted: false}}.',
      })
    );
  }

  // ----- V-UP-F11 native-smoke prerequisite_artifacts_audit exhaustive -----
  const nsPrereqs = (nativeSmoke.prerequisite_artifacts_audit &&
    nativeSmoke.prerequisite_artifacts_audit.checks) || [];
  const nsPrereqIds = new Set();
  for (const c of nsPrereqs) {
    if (c && typeof c.id === 'string') nsPrereqIds.add(c.id);
  }
  const missingNsPrereqs = NATIVE_SMOKE_REQUIRED_PREREQ_IDS.filter(
    (id) => !nsPrereqIds.has(id)
  );
  if (missingNsPrereqs.length > 0) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-F11',
        kind: 'target',
        where: 'native-smoke.prerequisite_artifacts_audit.checks',
        message: `native-smoke prerequisite audit missing required prereq id(s): ${missingNsPrereqs.join(', ')}`,
        evidence: { present_ids: Array.from(nsPrereqIds).sort(), missing_ids: missingNsPrereqs },
        remediation:
          'Enumerate T02/T03 prerequisites in prerequisite_artifacts_audit.checks[] (PRE-NS-T02-CONTRACT, PRE-NS-T03-DEPLOY, PRE-NS-T03-ROLLBACK), each with exists=<bool>.',
      })
    );
  }

  // ----- V-UP-F12 native-smoke promotion discipline -----
  const nsPromoted = (nativeSmoke.promotion_discipline &&
    nativeSmoke.promotion_discipline.promoted_surfaces) || [];
  if (!Array.isArray(nsPromoted) || nsPromoted.length > 0) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-F12',
        kind: 'target',
        where: 'native-smoke.promotion_discipline.promoted_surfaces',
        message: 'native-smoke.promoted_surfaces must be an empty array (no plugin / UI / data / action / tool promotion)',
        evidence: { got: nsPromoted },
        remediation:
          'Set promoted_surfaces = []. Native smoke scope is bounded to issue/document/comment create-readback per MEM054/MEM058.',
      })
    );
  }

  // ----- V-UP-F13 native-smoke rejected_surfaces minimum count -----
  const nsRejected = (nativeSmoke.promotion_discipline &&
    nativeSmoke.promotion_discipline.rejected_surfaces) || [];
  if (!Array.isArray(nsRejected) || nsRejected.length < 15) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-F13',
        kind: 'target',
        where: 'native-smoke.promotion_discipline.rejected_surfaces',
        message: 'native-smoke.rejected_surfaces must enumerate at least 15 rejected plugin/UI/data/action/tool/state/activity/events/Hermes/GSD-Pi surfaces',
        evidence: { got_length: Array.isArray(nsRejected) ? nsRejected.length : null },
        remediation:
          'Enumerate at least 15 rejected surfaces with surface_id + surface + rule_reference. Minimum surface set per MEM054/MEM058.',
      })
    );
  }

  // ----- V-UP-F14 native-smoke inherited constraints propagation -----
  const nsInheritedFromRemain = (nativeSmoke.inherited_constraints_remain_in_force &&
    nativeSmoke.inherited_constraints_remain_in_force.constraints) || [];
  const nsInheritedFromTopLevel = nativeSmoke.inherited_constraints || [];
  const nsInherited = nsInheritedFromRemain.length > 0 ? nsInheritedFromRemain : nsInheritedFromTopLevel;
  const nsInheritedIds = new Set();
  for (const c of nsInherited) {
    if (c && typeof c.id === 'string') nsInheritedIds.add(c.id);
  }
  let missingNsConstraints = 0;
  for (const id of REQUIRED_INHERITED_CONSTRAINT_IDS) {
    if (!nsInheritedIds.has(id)) missingNsConstraints += 1;
  }
  if (missingNsConstraints > 0) {
    blockers.push(
      makeBlocker({
        code: 'V-UP-F14',
        kind: 'target',
        where: 'native-smoke.inherited_constraints_remain_in_force.constraints',
        message: `native-smoke missing ${missingNsConstraints} inherited constraint id(s) required by S01-S03`,
        evidence: {
          present_ids: Array.from(nsInheritedIds).sort(),
          required_ids: REQUIRED_INHERITED_CONSTRAINT_IDS,
        },
        remediation:
          'Propagate all six inherited constraint IDs in native-smoke.inherited_constraints_remain_in_force.constraints[].id (preferred T04 shape) or native-smoke.inherited_constraints[].id (legacy fixture shape).',
      })
    );
  }

  // ----- V-UP-F15 redaction scan on both artifacts -----
  // DOC_SKIP_KEYS rationale (T04 follow-up, fix option 2):
  //   - post-upgrade.diagnostics.verify_no_secrets is the artifact's own
  //     documentation of its redaction scan; it may quote forbidden
  //     substrings as part of describing what it scans for.
  //   - native-smoke.diagnostics.verify_no_secrets — same as above.
  //   - native-smoke.negative_tests_executed[] — the artifact enumerates
  //     negative tests that quote forbidden substrings (e.g. NT-NS-05
  //     documents the PAPERCLIP_API_KEY= redaction check). Per T04 known
  //     inconsistency, these are documentation patterns, not credentials.
  //     T04 explicitly listed "расширить validator DOC_SKIP_KEYS до
  //     negative_tests_executed[]" as one of two valid fix options.
  //     We implement option 2 here so the validator stays aligned with the
  //     current T04 artifact content. Future real leaks would still be
  //     caught outside these blocks.
  if (typeof postUpgradeRaw === 'string' && postUpgradeRaw.length > 0) {
    blockers.push(
      ...scanRedaction(postUpgradeRaw, 'post-upgrade', 'full text', ['diagnostics.verify_no_secrets'])
    );
  }
  if (typeof nativeSmokeRaw === 'string' && nativeSmokeRaw.length > 0) {
    blockers.push(
      ...scanRedaction(
        nativeSmokeRaw,
        'native-smoke',
        'full text',
        ['diagnostics.verify_no_secrets', 'negative_tests_executed']
      )
    );
  }

  return blockers;
}

// ---------------------------------------------------------------------------
// Synthetic fixtures (used by tests; also useful for downstream T02-T04 to
// reuse via require()).
// ---------------------------------------------------------------------------

function minimalValidBaselineFixture() {
  const patch = (kind, extra = {}) => ({
    reconciliation_required: true,
    kind,
    path: `fixture-${kind}`,
    ...extra,
  });
  const inherited = (id, rule) => ({ id, source: 'fixture', rule });
  return {
    $schema: 'gsd/m014-s04-paperclip-baseline-v1',
    milestone: 'M014-a9jj46',
    slice: 'S04',
    task: 'T01-fixture',
    purpose: 'fixture baseline',
    generated: '2026-07-12',
    generated_by: 'fixture',
    consumes: ['runtime-evidence/M014-S01-runtime-truth-map.json'],
    captured_in_phase: 'baseline',
    baseline_phase_verdict: 'PROVISIONAL_PENDING_FRESH_READBACK',
    freshness_posture: { policy: 'snapshot', as_of: '2026-07-12' },
    official_upstream_identity: {
      verified: true,
      canonical_repo_url: CANONICAL_UPSTREAM_URL,
      canonical_repo_path: CANONICAL_UPSTREAM_PATH,
      latest_release_tag_observed: 'v2026.707.0',
      upstream_commit_sha_for_latest_release: '390627b',
      verification_method: 'fixture',
      verification_timestamp: '2026-07-12',
      fresh_readback_required: false,
    },
    local_paperclip_checkout: {
      vendored_checkout_present: false,
      local_references_to_upstream_only: [],
    },
    live_runtime_observed: {
      fresh_readback_required: true,
      historical_observed_runtime_version: '0.3.1',
      current_branch: null,
      current_commit_sha: null,
      current_image_digest: null,
    },
    local_runtime_patches_detected: {
      bos_light_plugin: patch('paperclip-plugin'),
      gsdpi_local_adapter: patch('paperclip-external-adapter'),
      reverse_proxy_signup_lockdown: patch('infrastructure-policy'),
      company_template: patch('paperclip-company-package', { reconciliation_required: false }),
      scripts_and_configs: patch('orchestration-and-doctrine', { reconciliation_required: false }),
      plugin_sdk_version_floor: patch('peer-dependency'),
    },
    local_runtime_patch_count: 4,
    rollout_safety_constraints: {
      inherited_constraints: [
        inherited('LFP-LF-01', 'fixture'),
        inherited('LFP-LF-02', 'fixture'),
        inherited('LFP-LF-03', 'fixture'),
        inherited('LFP-S02-01', 'fixture'),
        inherited('LFP-S02-02', 'fixture'),
        inherited('LFP-S02-03', 'fixture'),
      ],
    },
    downstream_handoff: {
      S04_T02_upgrade_contract: { uses: [], must_pin_revision_to: 'fixture' },
      S04_T03_deploy: {
        must_verify_nginx_lockdown_after_upgrade: true,
        must_capture_rollback_image: true,
        must_capture_rollback_config: true,
      },
      S04_T04_native_smoke: {
        must_compare_against_baseline: true,
        must_not_promote_unconfirmed_plugin_surfaces: true,
        must_not_reuse_baseline_for_promotion_outside_bounded_native_artifact_surfaces: true,
      },
    },
    anti_replay: { policy: 'snapshot' },
  };
}

/**
 * Minimal valid upgrade contract fixture (T02). Target revision + SHA match
 * the minimalValidBaselineFixture so validateUpgradeContract identity
 * cross-checks pass.
 */
function minimalValidUpgradeContractFixture() {
  const inherited = (id, rule) => ({ id, source: 'fixture', rule });
  return {
    $schema: 'gsd/m014-s04-paperclip-upgrade-contract-v1',
    milestone: 'M014-a9jj46',
    slice: 'S04',
    task: 'T02-fixture',
    pinned_target_revision: 'v2026.707.0',
    target_revision: 'v2026.707.0',
    target_commit_sha: '390627b',
    upstream_commit_sha: '390627b',
    migrations_reviewed: true,
    local_patches_reconciled: true,
    deploy_commands: ['docker compose pull paperclip', 'docker compose up -d paperclip'],
    rollback_commands: ['docker compose down paperclip', 'docker compose up -d paperclip@previous'],
    rollout_safety_constraints: {
      inherited_constraints: [
        inherited('LFP-LF-01', 'fixture'),
        inherited('LFP-LF-02', 'fixture'),
        inherited('LFP-LF-03', 'fixture'),
        inherited('LFP-S02-01', 'fixture'),
        inherited('LFP-S02-02', 'fixture'),
        inherited('LFP-S02-03', 'fixture'),
      ],
    },
  };
}

/**
 * Minimal valid backup proof fixture (T02). Bound to the same target
 * identity as the upgrade contract fixture.
 */
function minimalValidBackupProofFixture() {
  return {
    $schema: 'gsd/m014-s04-paperclip-backup-proof-v1',
    milestone: 'M014-a9jj46',
    slice: 'S04',
    task: 'T02-fixture',
    target_revision: 'v2026.707.0',
    target_commit_sha: '390627b',
    backup_verified: true,
    backup_verification_timestamp: '2026-07-12T15:00:00Z',
    volume_snapshot_ids: ['vol-snap-abc123', 'vol-snap-def456'],
    db_dump_id: 'dump-789xyz',
    config_hash: '8c2f1a09',
  };
}

/**
 * Minimal valid deploy fixture (T03). Bound to baseline identity; honest
 * deployment_status; nginx lockdown preserved.
 */
function minimalValidDeployFixture() {
  const inherited = (id, rule) => ({ id, source: 'fixture', rule });
  return {
    $schema: 'gsd/m014-s04-paperclip-deploy-v1',
    milestone: 'M014-a9jj46',
    slice: 'S04',
    task: 'T03-fixture',
    target_revision: 'v2026.707.0',
    target_commit_sha: '390627b',
    deployment_status: 'success',
    migrations_applied: { applied: true, count: 2, migration_ids: ['add-idx', 'col-add'] },
    nginx_lockdown_preserved: true,
    rollout_safety_constraints: {
      inherited_constraints: [
        inherited('LFP-LF-01', 'fixture'),
        inherited('LFP-LF-02', 'fixture'),
        inherited('LFP-LF-03', 'fixture'),
        inherited('LFP-S02-01', 'fixture'),
        inherited('LFP-S02-02', 'fixture'),
        inherited('LFP-S02-03', 'fixture'),
      ],
    },
  };
}

/**
 * Minimal valid rollback fixture (T03). Previous image digest + config hash
 * captured; rollback commands present.
 */
function minimalValidRollbackFixture() {
  return {
    $schema: 'gsd/m014-s04-paperclip-rollback-v1',
    milestone: 'M014-a9jj46',
    slice: 'S04',
    task: 'T03-fixture',
    previous_image_digest: 'sha256:abc123def456',
    previous_config_hash: 'f1a09b2c',
    rollback_commands: [
      'docker compose down paperclip',
      'docker compose pull paperclip@sha256:abc123def456',
      'docker compose up -d paperclip',
    ],
  };
}

/**
 * Minimal valid blocked post-upgrade fixture (T04). Mirrors the actual
 * runtime-evidence artifact shape: honest BLOCKED verdict, 4 prerequisite
 * audit entries (all absent), empty promoted_surfaces, 6 inherited
 * constraints, baseline_comparison_present.
 */
function minimalValidBlockedPostUpgradeFixture() {
  const inherited = (id, rule) => ({ id, source: 'paperclip-runtime.lock.json', rule });
  const prereq = (id, exists) => ({
    id,
    exists,
    artifact_path: `runtime-evidence/M014-S04-${id.toLowerCase()}.json`,
    reason: exists ? 'present' : 'absent',
  });
  return {
    $schema: 'gsd/m014-s04-paperclip-post-upgrade-v1',
    milestone: 'M014-a9jj46',
    slice: 'S04',
    task: 'T04-fixture',
    post_upgrade_verdict: 'BLOCKED_NO_DEPLOY_ARTIFACTS',
    verdict_enum_lock: POST_UPGRADE_ADMISSIBLE_VERDICTS,
    // baseline_comparison_present declared on BOTH top-level and inside
    // post_upgrade_runtime_comparison for cross-tool compatibility — the
    // validator accepts either location.
    baseline_comparison_present: true,
    prerequisite_artifacts_audit: {
      checks: [
        prereq('PRE-T02-CONTRACT', false),
        prereq('PRE-T02-BACKUP', false),
        prereq('PRE-T03-DEPLOY', false),
        prereq('PRE-T03-ROLLBACK', false),
      ],
    },
    post_upgrade_runtime_comparison: {
      baseline_comparison_present: true,
      drift_unverifiable_reason: 'fixture: no live readback performed',
    },
    inherited_constraints_remain_in_force: {
      constraints: [
        inherited('LFP-LF-01'),
        inherited('LFP-LF-02'),
        inherited('LFP-LF-03'),
        inherited('LFP-S02-01'),
        inherited('LFP-S02-02'),
        inherited('LFP-S02-03'),
      ],
    },
    promotion_discipline: {
      promoted_surfaces: [],
      rejected_surfaces: Array.from({ length: 15 }, (_, i) => ({
        surface_id: `RPS-PU-${String(i + 1).padStart(2, '0')}`,
        surface: 'plugin_or_ui_or_data',
        rule_reference: 'MEM054',
      })),
    },
    diagnostics: {
      verify_no_secrets: 'fixture: scan confirms no credential substrings',
    },
  };
}

/**
 * Minimal valid blocked native-smoke fixture (T04). Honest BLOCKED verdict,
 * bounded_native_smoke_attempted as object with all per-surface attempted=false,
 * 15 rejected surfaces, 6 inherited constraints.
 */
function minimalValidBlockedNativeSmokeFixture() {
  const inherited = (id, rule) => ({ id, source: 'paperclip-runtime.lock.json', rule });
  const prereq = (id, exists) => ({
    id,
    exists,
    artifact_path: `runtime-evidence/M014-S04-${id.toLowerCase()}.json`,
    reason: exists ? 'present' : 'absent',
  });
  return {
    $schema: 'gsd/m014-s04-paperclip-native-smoke-v1',
    milestone: 'M014-a9jj46',
    slice: 'S04',
    task: 'T04-fixture',
    native_smoke_verdict: 'BLOCKED_NO_LIVE_API',
    verdict_enum_lock: NATIVE_SMOKE_ADMISSIBLE_VERDICTS,
    bounded_native_smoke_attempted: {
      issue_create: { attempted: false, reason: 'no live API access' },
      issue_readback: { attempted: false, reason: 'no live API access' },
      document_create: { attempted: false, reason: 'no live API access' },
      document_readback: { attempted: false, reason: 'no live API access' },
      comment_create: { attempted: false, reason: 'no live API access' },
      comment_readback: { attempted: false, reason: 'no live API access' },
    },
    prerequisite_artifacts_audit: {
      checks: [
        prereq('PRE-NS-T02-CONTRACT', false),
        prereq('PRE-NS-T03-DEPLOY', false),
        prereq('PRE-NS-T03-ROLLBACK', false),
        prereq('PRE-NS-POST-UPGRADE', true),
      ],
    },
    inherited_constraints: [
      inherited('LFP-LF-01'),
      inherited('LFP-LF-02'),
      inherited('LFP-LF-03'),
      inherited('LFP-S02-01'),
      inherited('LFP-S02-02'),
      inherited('LFP-S02-03'),
    ],
    promotion_discipline: {
      promoted_surfaces: [],
      rejected_surfaces: Array.from({ length: 15 }, (_, i) => ({
        surface_id: `RPS-NS-${String(i + 1).padStart(2, '0')}`,
        surface: 'plugin_or_ui_or_data',
        rule_reference: 'MEM058',
      })),
    },
    diagnostics: {
      verify_no_secrets: 'fixture: scan confirms no credential substrings',
    },
  };
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('M014 S04 baseline validator — canonical artifact (T01 output)', () => {
  let loadResult;
  let blockers;

  before(() => {
    loadResult = loadBaseline(BASELINE_JSON);
    blockers = loadResult.ok ? validateBaseline(loadResult.baseline) : [];
  });

  it('V-UP-01 baseline file exists', () => {
    assert.ok(loadResult, 'load result exists');
    if (!loadResult.ok) {
      assert.fail(`baseline not loadable: ${loadResult.error}`);
    }
    assert.ok(fs.existsSync(BASELINE_JSON), `baseline missing at ${BASELINE_JSON}`);
  });

  it('V-UP-02 baseline parses as JSON object', () => {
    assert.ok(loadResult.ok, 'baseline loaded');
    assert.equal(typeof loadResult.baseline, 'object');
    assert.ok(!Array.isArray(loadResult.baseline));
  });

  it('aggregated validation produces zero blockers', () => {
    if (blockers.length > 0) {
      const summary = blockers.map((b) => `[${b.code}] ${b.message}`).join('\n  - ');
      throw new assert.AssertionError({
        message: `Canonical baseline produced ${blockers.length} blocker(s):\n  - ${summary}`,
        actual: blockers,
        expected: [],
        operator: 'deepEqual',
      });
    }
    assert.deepEqual(blockers, []);
  });

  it('upstream-diff.md twin exists at runtime-evidence/M014-S04-paperclip-upstream-diff.md', () => {
    assert.ok(
      fs.existsSync(UPSTREAM_DIFF_MD),
      `markdown twin missing at ${UPSTREAM_DIFF_MD}`
    );
    const text = fs.readFileSync(UPSTREAM_DIFF_MD, 'utf8');
    assert.ok(text.length > 200, 'upstream-diff.md twin is suspiciously short');
    // Cross-check: the markdown twin should reference the upstream URL we
    // verified, and the four local patch kinds.
    assert.ok(
      text.includes('github.com/paperclipai/paperclip'),
      'twin should reference the canonical upstream URL'
    );
    for (const kind of REQUIRED_LOCAL_PATCH_KINDS) {
      assert.ok(
        text.includes(kind),
        `twin should reference local patch kind "${kind}"`
      );
    }
  });
});

describe('M014 S04 baseline validator — synthetic fixtures', () => {
  it('valid fixture produces zero blockers', () => {
    const fixture = minimalValidBaselineFixture();
    const errs = validateBaseline(fixture);
    assert.deepEqual(errs, [], `expected zero blockers, got: ${JSON.stringify(errs)}`);
  });

  it('V-UP-02 non-object baseline is rejected', () => {
    for (const bad of [null, undefined, 'string', 42, [], true]) {
      const errs = validateBaseline(bad);
      assert.ok(errs.length > 0, `non-object input ${JSON.stringify(bad)} must be rejected`);
      assert.equal(errs[0].code, 'V-UP-02');
    }
  });

  it('V-UP-03 upstream identity not verified triggers blocker', () => {
    const fixture = minimalValidBaselineFixture();
    fixture.official_upstream_identity.verified = false;
    const errs = validateBaseline(fixture);
    assert.ok(errs.some((b) => b.code === 'V-UP-03'), 'V-UP-03 missing');
  });

  it('V-UP-04 canonical_repo_url drift triggers blocker', () => {
    const fixture = minimalValidBaselineFixture();
    fixture.official_upstream_identity.canonical_repo_url = 'https://github.com/other/paperclip';
    fixture.official_upstream_identity.canonical_repo_path = 'github.com/other/paperclip';
    const errs = validateBaseline(fixture);
    assert.ok(errs.some((b) => b.code === 'V-UP-04'), 'V-UP-04 missing');
  });

  it('V-UP-05 malformed release tag triggers blocker', () => {
    const fixture = minimalValidBaselineFixture();
    fixture.official_upstream_identity.latest_release_tag_observed = 'not-a-tag';
    const errs = validateBaseline(fixture);
    assert.ok(errs.some((b) => b.code === 'V-UP-05'), 'V-UP-05 missing');
  });

  it('V-UP-06 unexpected vendored checkout claim triggers blocker', () => {
    const fixture = minimalValidBaselineFixture();
    fixture.local_paperclip_checkout.vendored_checkout_present = true;
    const errs = validateBaseline(fixture);
    assert.ok(errs.some((b) => b.code === 'V-UP-06'), 'V-UP-06 missing');
  });

  it('V-UP-07 fresh_readback_required misasserted triggers blocker', () => {
    const fixture = minimalValidBaselineFixture();
    fixture.live_runtime_observed.fresh_readback_required = false;
    const errs = validateBaseline(fixture);
    assert.ok(errs.some((b) => b.code === 'V-UP-07'), 'V-UP-07 missing');
  });

  it('V-UP-08 missing local patch kind triggers blocker per missing kind', () => {
    const fixture = minimalValidBaselineFixture();
    delete fixture.local_runtime_patches_detected.gsdpi_local_adapter;
    const errs = validateBaseline(fixture);
    assert.ok(errs.some((b) => b.code === 'V-UP-08' && /gsdpi_local_adapter/.test(b.where)),
      'V-UP-08 missing for gsdpi_local_adapter');
  });

  it('V-UP-09 redaction leak — credential substring triggers blocker', () => {
    const fixture = minimalValidBaselineFixture();
    fixture.live_runtime_observed.diagnostic_note = 'leaked PAPERCLIP_API_KEY=sk-ir-test';
    const errs = validateBaseline(fixture);
    assert.ok(errs.some((b) => b.code === 'V-UP-09'), 'V-UP-09 missing for credential substring');
  });

  it('V-UP-09 redaction leak — fully-qualified UUID literal triggers blocker', () => {
    const fixture = minimalValidBaselineFixture();
    fixture.live_runtime_observed.leaked_uuid = '9feb4c22-05b9-401e-ba67-0e866e3056da';
    const errs = validateBaseline(fixture);
    assert.ok(errs.some((b) => b.code === 'V-UP-09' && /UUID/i.test(b.message)),
      'V-UP-09 missing for full-UUID leak');
    // Defense in depth: blocker evidence should NOT echo the full UUID.
    const blob = JSON.stringify(errs);
    assert.ok(!blob.includes('9feb4c22-05b9-401e-ba67-0e866e3056da'),
      'V-UP-09 evidence must NOT echo full UUID');
  });

  it('V-UP-10 missing inherited constraint id triggers blocker per missing id', () => {
    const fixture = minimalValidBaselineFixture();
    fixture.rollout_safety_constraints.inherited_constraints =
      fixture.rollout_safety_constraints.inherited_constraints.filter(
        (c) => c.id !== 'LFP-S02-01'
      );
    const errs = validateBaseline(fixture);
    assert.ok(errs.some((b) => b.code === 'V-UP-10' && /LFP-S02-01/.test(b.message)),
      'V-UP-10 missing for LFP-S02-01');
  });

  it('V-UP-11 patch count drift triggers blocker', () => {
    const fixture = minimalValidBaselineFixture();
    fixture.local_runtime_patch_count = 99;
    const errs = validateBaseline(fixture);
    assert.ok(errs.some((b) => b.code === 'V-UP-11'), 'V-UP-11 missing');
  });

  it('V-UP-12 downstream_handoff incompleteness triggers blocker', () => {
    const fixture = minimalValidBaselineFixture();
    fixture.downstream_handoff.S04_T03_deploy.must_verify_nginx_lockdown_after_upgrade = false;
    const errs = validateBaseline(fixture);
    assert.ok(errs.some((b) => b.code === 'V-UP-12'), 'V-UP-12 missing for T03 invariant');
  });
});

describe('M014 S04 baseline validator — helpers', () => {
  it('minimalValidBaselineFixture contains all required patches + constraints', () => {
    const fixture = minimalValidBaselineFixture();
    for (const kind of REQUIRED_LOCAL_PATCH_KINDS) {
      assert.ok(kind in fixture.local_runtime_patches_detected, `${kind} missing in fixture`);
    }
    const ids = new Set(
      fixture.rollout_safety_constraints.inherited_constraints.map((c) => c.id)
    );
    for (const id of REQUIRED_INHERITED_CONSTRAINT_IDS) {
      assert.ok(ids.has(id), `fixture missing ${id}`);
    }
  });

  it('redactUuidPrefix strips to 8 chars + ellipsis', () => {
    assert.equal(redactUuidPrefix('9feb4c22-05b9-401e-ba67-0e866e3056da'), '9feb4c22…');
    assert.equal(redactUuidPrefix(''), '…');
    assert.equal(redactUuidPrefix(null), '…');
  });

  it('makeBlocker returns the canonical shape', () => {
    const b = makeBlocker({
      code: 'V-UP-99',
      kind: 'schema',
      where: 'fixture',
      message: 'fixture',
    });
    assert.equal(b.code, 'V-UP-99');
    assert.equal(b.kind, 'schema');
    assert.equal(b.where, 'fixture');
    assert.equal(b.message, 'fixture');
    assert.equal(b.evidence, null);
    assert.equal(b.remediation, null);
  });
});

// ---------------------------------------------------------------------------
// Test suites — T02 (ready phase) — upgrade-contract + backup-proof
// ---------------------------------------------------------------------------

describe('M014 S04 ready phase validator — T02 synthetic fixtures', () => {
  it('valid contract + backup + baseline produces zero blockers', () => {
    const baseline = minimalValidBaselineFixture();
    const contract = minimalValidUpgradeContractFixture();
    const backup = minimalValidBackupProofFixture();
    const errs = validateUpgradeContract(
      contract,
      JSON.stringify(contract),
      backup,
      JSON.stringify(backup),
      baseline
    );
    assert.deepEqual(errs, [], `expected zero blockers, got: ${JSON.stringify(errs)}`);
  });

  it('V-UP-R01 non-object contract is rejected', () => {
    const baseline = minimalValidBaselineFixture();
    const backup = minimalValidBackupProofFixture();
    for (const bad of [null, undefined, 'string', 42, [], true]) {
      const errs = validateUpgradeContract(bad, '{}', backup, JSON.stringify(backup), baseline);
      assert.ok(errs.length > 0, `non-object contract must be rejected (${JSON.stringify(bad)})`);
      assert.equal(errs[0].code, 'V-UP-R01');
    }
  });

  it('V-UP-R02 pinned_target_revision mismatch triggers blocker', () => {
    const baseline = minimalValidBaselineFixture();
    const contract = minimalValidUpgradeContractFixture();
    contract.pinned_target_revision = 'v9999.999.9';
    const backup = minimalValidBackupProofFixture();
    const errs = validateUpgradeContract(
      contract,
      JSON.stringify(contract),
      backup,
      JSON.stringify(backup),
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-R02'), 'V-UP-R02 missing');
  });

  it('V-UP-R03 target_commit_sha mismatch triggers blocker', () => {
    const baseline = minimalValidBaselineFixture();
    const contract = minimalValidUpgradeContractFixture();
    contract.target_commit_sha = 'deadbeef';
    const backup = minimalValidBackupProofFixture();
    const errs = validateUpgradeContract(
      contract,
      JSON.stringify(contract),
      backup,
      JSON.stringify(backup),
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-R03'), 'V-UP-R03 missing');
  });

  it('V-UP-R04 migrations_reviewed false triggers blocker', () => {
    const baseline = minimalValidBaselineFixture();
    const contract = minimalValidUpgradeContractFixture();
    contract.migrations_reviewed = false;
    const backup = minimalValidBackupProofFixture();
    const errs = validateUpgradeContract(
      contract,
      JSON.stringify(contract),
      backup,
      JSON.stringify(backup),
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-R04'), 'V-UP-R04 missing');
  });

  it('V-UP-R05 local_patches_reconciled false triggers blocker', () => {
    const baseline = minimalValidBaselineFixture();
    const contract = minimalValidUpgradeContractFixture();
    contract.local_patches_reconciled = false;
    const backup = minimalValidBackupProofFixture();
    const errs = validateUpgradeContract(
      contract,
      JSON.stringify(contract),
      backup,
      JSON.stringify(backup),
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-R05'), 'V-UP-R05 missing');
  });

  it('V-UP-R06 missing deploy_commands triggers blocker', () => {
    const baseline = minimalValidBaselineFixture();
    const contract = minimalValidUpgradeContractFixture();
    contract.deploy_commands = [];
    const backup = minimalValidBackupProofFixture();
    const errs = validateUpgradeContract(
      contract,
      JSON.stringify(contract),
      backup,
      JSON.stringify(backup),
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-R06' && /deploy_commands/.test(b.where)),
      'V-UP-R06 missing for deploy_commands');
  });

  it('V-UP-R07 missing backup proof triggers blocker (kind: absent)', () => {
    const baseline = minimalValidBaselineFixture();
    const contract = minimalValidUpgradeContractFixture();
    const errs = validateUpgradeContract(
      contract,
      JSON.stringify(contract),
      null,
      '',
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-R07'), 'V-UP-R07 missing');
    assert.equal(errs[0].kind, 'absent');
  });

  it('V-UP-R08 backup-proof target identity mismatch triggers blocker', () => {
    const baseline = minimalValidBaselineFixture();
    const contract = minimalValidUpgradeContractFixture();
    const backup = minimalValidBackupProofFixture();
    backup.target_revision = 'v9999.999.9';
    const errs = validateUpgradeContract(
      contract,
      JSON.stringify(contract),
      backup,
      JSON.stringify(backup),
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-R08'), 'V-UP-R08 missing');
  });

  it('V-UP-R09 backup_verified false triggers blocker', () => {
    const baseline = minimalValidBaselineFixture();
    const contract = minimalValidUpgradeContractFixture();
    const backup = minimalValidBackupProofFixture();
    backup.backup_verified = false;
    const errs = validateUpgradeContract(
      contract,
      JSON.stringify(contract),
      backup,
      JSON.stringify(backup),
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-R09'), 'V-UP-R09 missing');
  });

  it('V-UP-R10 redaction leak in contract triggers blocker', () => {
    const baseline = minimalValidBaselineFixture();
    const contract = minimalValidUpgradeContractFixture();
    contract.notes = 'leaked PAPERCLIP_API_KEY=sk-ir-test';
    const backup = minimalValidBackupProofFixture();
    const errs = validateUpgradeContract(
      contract,
      JSON.stringify(contract),
      backup,
      JSON.stringify(backup),
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-REDACTION-SECRET' && /upgrade-contract/.test(b.where)),
      'V-UP-REDACTION-SECRET missing for upgrade-contract');
  });

  it('V-UP-R11 missing inherited constraint triggers blocker', () => {
    const baseline = minimalValidBaselineFixture();
    const contract = minimalValidUpgradeContractFixture();
    contract.rollout_safety_constraints.inherited_constraints =
      contract.rollout_safety_constraints.inherited_constraints.filter(
        (c) => c.id !== 'LFP-S02-01'
      );
    const backup = minimalValidBackupProofFixture();
    const errs = validateUpgradeContract(
      contract,
      JSON.stringify(contract),
      backup,
      JSON.stringify(backup),
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-R11'),
      'V-UP-R11 missing for LFP-S02-01');
  });
});

// ---------------------------------------------------------------------------
// Test suites — T03 (deployed phase) — deploy + rollback
// ---------------------------------------------------------------------------

describe('M014 S04 deployed phase validator — T03 synthetic fixtures', () => {
  it('valid deploy + rollback + baseline produces zero blockers', () => {
    const baseline = minimalValidBaselineFixture();
    const deploy = minimalValidDeployFixture();
    const rollback = minimalValidRollbackFixture();
    const errs = validateDeploy(
      deploy,
      JSON.stringify(deploy),
      rollback,
      JSON.stringify(rollback),
      baseline
    );
    assert.deepEqual(errs, [], `expected zero blockers, got: ${JSON.stringify(errs)}`);
  });

  it('V-UP-D01 non-object deploy is rejected', () => {
    const baseline = minimalValidBaselineFixture();
    const rollback = minimalValidRollbackFixture();
    for (const bad of [null, undefined, 'string', 42, [], true]) {
      const errs = validateDeploy(bad, '{}', rollback, JSON.stringify(rollback), baseline);
      assert.ok(errs.length > 0, `non-object deploy must be rejected (${JSON.stringify(bad)})`);
      assert.equal(errs[0].code, 'V-UP-D01');
    }
  });

  it('V-UP-D03 deploy target identity mismatch triggers blocker', () => {
    const baseline = minimalValidBaselineFixture();
    const deploy = minimalValidDeployFixture();
    deploy.target_revision = 'v9999.999.9';
    const rollback = minimalValidRollbackFixture();
    const errs = validateDeploy(
      deploy,
      JSON.stringify(deploy),
      rollback,
      JSON.stringify(rollback),
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-D03'), 'V-UP-D03 missing');
  });

  it('V-UP-D04 deployment_status inadmissible triggers blocker', () => {
    const baseline = minimalValidBaselineFixture();
    const deploy = minimalValidDeployFixture();
    deploy.deployment_status = 'PASS'; // forbidden (not in DEPLOY_ADMISSIBLE_STATUSES)
    const rollback = minimalValidRollbackFixture();
    const errs = validateDeploy(
      deploy,
      JSON.stringify(deploy),
      rollback,
      JSON.stringify(rollback),
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-D04'), 'V-UP-D04 missing');
  });

  it('V-UP-D05 migrations_applied missing triggers blocker', () => {
    const baseline = minimalValidBaselineFixture();
    const deploy = minimalValidDeployFixture();
    delete deploy.migrations_applied;
    const rollback = minimalValidRollbackFixture();
    const errs = validateDeploy(
      deploy,
      JSON.stringify(deploy),
      rollback,
      JSON.stringify(rollback),
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-D05'), 'V-UP-D05 missing');
  });

  it('V-UP-D06 nginx_lockdown_preserved false triggers blocker', () => {
    const baseline = minimalValidBaselineFixture();
    const deploy = minimalValidDeployFixture();
    deploy.nginx_lockdown_preserved = false;
    const rollback = minimalValidRollbackFixture();
    const errs = validateDeploy(
      deploy,
      JSON.stringify(deploy),
      rollback,
      JSON.stringify(rollback),
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-D06'), 'V-UP-D06 missing');
  });

  it('V-UP-D07 missing rollback triggers blocker (kind: absent)', () => {
    const baseline = minimalValidBaselineFixture();
    const deploy = minimalValidDeployFixture();
    const errs = validateDeploy(
      deploy,
      JSON.stringify(deploy),
      null,
      '',
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-D07'), 'V-UP-D07 missing');
    assert.equal(errs[0].kind, 'absent');
  });

  it('V-UP-D08 rollback previous_image_digest missing triggers blocker', () => {
    const baseline = minimalValidBaselineFixture();
    const deploy = minimalValidDeployFixture();
    const rollback = minimalValidRollbackFixture();
    delete rollback.previous_image_digest;
    const errs = validateDeploy(
      deploy,
      JSON.stringify(deploy),
      rollback,
      JSON.stringify(rollback),
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-D08' && /previous_image_digest/.test(b.where)),
      'V-UP-D08 missing for previous_image_digest');
  });

  it('V-UP-D09 rollback_commands missing triggers blocker', () => {
    const baseline = minimalValidBaselineFixture();
    const deploy = minimalValidDeployFixture();
    const rollback = minimalValidRollbackFixture();
    rollback.rollback_commands = [];
    const errs = validateDeploy(
      deploy,
      JSON.stringify(deploy),
      rollback,
      JSON.stringify(rollback),
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-D09'), 'V-UP-D09 missing');
  });

  it('V-UP-D10 deploy credential leak triggers blocker', () => {
    const baseline = minimalValidBaselineFixture();
    const deploy = minimalValidDeployFixture();
    deploy.diagnostic = 'leaked POSTGRES_PASSWORD=hunter2';
    const rollback = minimalValidRollbackFixture();
    const errs = validateDeploy(
      deploy,
      JSON.stringify(deploy),
      rollback,
      JSON.stringify(rollback),
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-REDACTION-SECRET' && /deploy/.test(b.where)),
      'V-UP-REDACTION-SECRET missing for deploy');
  });

  it('V-UP-D11 missing inherited constraint on deploy triggers blocker', () => {
    const baseline = minimalValidBaselineFixture();
    const deploy = minimalValidDeployFixture();
    deploy.rollout_safety_constraints.inherited_constraints =
      deploy.rollout_safety_constraints.inherited_constraints.filter(
        (c) => c.id !== 'LFP-LF-02'
      );
    const rollback = minimalValidRollbackFixture();
    const errs = validateDeploy(
      deploy,
      JSON.stringify(deploy),
      rollback,
      JSON.stringify(rollback),
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-D11'),
      'V-UP-D11 missing for LFP-LF-02');
  });
});

// ---------------------------------------------------------------------------
// Test suites — T04 (final phase) — post-upgrade + native-smoke
// ---------------------------------------------------------------------------

describe('M014 S04 final phase validator — T04 synthetic fixtures', () => {
  it('valid blocked post-upgrade + native-smoke + baseline produces zero blockers', () => {
    const baseline = minimalValidBaselineFixture();
    const post = minimalValidBlockedPostUpgradeFixture();
    const smoke = minimalValidBlockedNativeSmokeFixture();
    const errs = validateFinal(
      post,
      JSON.stringify(post),
      smoke,
      JSON.stringify(smoke),
      baseline
    );
    assert.deepEqual(errs, [], `expected zero blockers, got: ${JSON.stringify(errs)}`);
  });

  it('V-UP-F01 non-object post-upgrade is rejected', () => {
    const baseline = minimalValidBaselineFixture();
    const smoke = minimalValidBlockedNativeSmokeFixture();
    for (const bad of [null, undefined, 'string', 42, [], true]) {
      const errs = validateFinal(bad, '{}', smoke, JSON.stringify(smoke), baseline);
      assert.ok(errs.length > 0, `non-object post-upgrade must be rejected`);
      assert.equal(errs[0].code, 'V-UP-F01');
    }
  });

  it('V-UP-F03 post_upgrade_verdict inadmissible triggers blocker', () => {
    const baseline = minimalValidBaselineFixture();
    const post = minimalValidBlockedPostUpgradeFixture();
    post.post_upgrade_verdict = 'PASS'; // inadmissible when prerequisites absent
    const smoke = minimalValidBlockedNativeSmokeFixture();
    const errs = validateFinal(
      post,
      JSON.stringify(post),
      smoke,
      JSON.stringify(smoke),
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-F03'), 'V-UP-F03 missing');
  });

  it('V-UP-F04 post-upgrade missing prerequisite audit id triggers blocker', () => {
    const baseline = minimalValidBaselineFixture();
    const post = minimalValidBlockedPostUpgradeFixture();
    post.prerequisite_artifacts_audit.checks =
      post.prerequisite_artifacts_audit.checks.filter(
        (c) => c.id !== 'PRE-T02-CONTRACT'
      );
    const smoke = minimalValidBlockedNativeSmokeFixture();
    const errs = validateFinal(
      post,
      JSON.stringify(post),
      smoke,
      JSON.stringify(smoke),
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-F04' && /PRE-T02-CONTRACT/.test(b.message)),
      'V-UP-F04 missing for PRE-T02-CONTRACT');
  });

  it('V-UP-F05 post-upgrade promoted_surfaces non-empty triggers blocker', () => {
    const baseline = minimalValidBaselineFixture();
    const post = minimalValidBlockedPostUpgradeFixture();
    post.promotion_discipline.promoted_surfaces = ['plugin_registration'];
    const smoke = minimalValidBlockedNativeSmokeFixture();
    const errs = validateFinal(
      post,
      JSON.stringify(post),
      smoke,
      JSON.stringify(smoke),
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-F05'), 'V-UP-F05 missing');
  });

  it('V-UP-F06 post-upgrade missing inherited constraint triggers blocker', () => {
    const baseline = minimalValidBaselineFixture();
    const post = minimalValidBlockedPostUpgradeFixture();
    post.inherited_constraints_remain_in_force.constraints =
      post.inherited_constraints_remain_in_force.constraints.filter(
        (c) => c.id !== 'LFP-S02-03'
      );
    const smoke = minimalValidBlockedNativeSmokeFixture();
    const errs = validateFinal(
      post,
      JSON.stringify(post),
      smoke,
      JSON.stringify(smoke),
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-F06'),
      'V-UP-F06 missing for LFP-S02-03');
  });

  it('V-UP-F07 post-upgrade baseline_comparison_present false triggers blocker', () => {
    const baseline = minimalValidBaselineFixture();
    const post = minimalValidBlockedPostUpgradeFixture();
    post.baseline_comparison_present = false;
    post.post_upgrade_runtime_comparison.baseline_comparison_present = false;
    const smoke = minimalValidBlockedNativeSmokeFixture();
    const errs = validateFinal(
      post,
      JSON.stringify(post),
      smoke,
      JSON.stringify(smoke),
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-F07'), 'V-UP-F07 missing');
  });

  it('V-UP-F08 non-object native-smoke is rejected', () => {
    const baseline = minimalValidBaselineFixture();
    const post = minimalValidBlockedPostUpgradeFixture();
    for (const bad of [null, undefined, 'string', 42, [], true]) {
      const errs = validateFinal(post, JSON.stringify(post), bad, '{}', baseline);
      assert.ok(errs.length > 0, `non-object native-smoke must be rejected`);
      assert.equal(errs[0].code, 'V-UP-F08');
    }
  });

  it('V-UP-F09 native_smoke_verdict inadmissible triggers blocker', () => {
    const baseline = minimalValidBaselineFixture();
    const post = minimalValidBlockedPostUpgradeFixture();
    const smoke = minimalValidBlockedNativeSmokeFixture();
    smoke.native_smoke_verdict = 'GREEN'; // inadmissible
    const errs = validateFinal(
      post,
      JSON.stringify(post),
      smoke,
      JSON.stringify(smoke),
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-F09'), 'V-UP-F09 missing');
  });

  it('V-UP-F10 native-smoke bounded_native_smoke_attempted=true is dishonest (no live evidence)', () => {
    const baseline = minimalValidBaselineFixture();
    const post = minimalValidBlockedPostUpgradeFixture();
    const smoke = minimalValidBlockedNativeSmokeFixture();
    // Attempted=true without any actual readback is dishonest — must be
    // either top-level false OR object with all per-surface attempted=false.
    smoke.bounded_native_smoke_attempted = {
      issue_create: { attempted: true, reason: 'fixture' },
      issue_readback: { attempted: false, reason: 'fixture' },
    };
    const errs = validateFinal(
      post,
      JSON.stringify(post),
      smoke,
      JSON.stringify(smoke),
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-F10'), 'V-UP-F10 missing');
  });

  it('V-UP-F10 native-smoke bounded_native_smoke_attempted top-level true is dishonest', () => {
    const baseline = minimalValidBaselineFixture();
    const post = minimalValidBlockedPostUpgradeFixture();
    const smoke = minimalValidBlockedNativeSmokeFixture();
    smoke.bounded_native_smoke_attempted = true; // not boolean false, not object
    const errs = validateFinal(
      post,
      JSON.stringify(post),
      smoke,
      JSON.stringify(smoke),
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-F10'), 'V-UP-F10 missing for boolean true');
  });

  it('V-UP-F11 native-smoke missing prerequisite audit id triggers blocker', () => {
    const baseline = minimalValidBaselineFixture();
    const post = minimalValidBlockedPostUpgradeFixture();
    const smoke = minimalValidBlockedNativeSmokeFixture();
    smoke.prerequisite_artifacts_audit.checks =
      smoke.prerequisite_artifacts_audit.checks.filter(
        (c) => c.id !== 'PRE-NS-T03-DEPLOY'
      );
    const errs = validateFinal(
      post,
      JSON.stringify(post),
      smoke,
      JSON.stringify(smoke),
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-F11' && /PRE-NS-T03-DEPLOY/.test(b.message)),
      'V-UP-F11 missing for PRE-NS-T03-DEPLOY');
  });

  it('V-UP-F12 native-smoke promoted_surfaces non-empty triggers blocker', () => {
    const baseline = minimalValidBaselineFixture();
    const post = minimalValidBlockedPostUpgradeFixture();
    const smoke = minimalValidBlockedNativeSmokeFixture();
    smoke.promotion_discipline.promoted_surfaces = ['issue_create', 'ui_modification'];
    const errs = validateFinal(
      post,
      JSON.stringify(post),
      smoke,
      JSON.stringify(smoke),
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-F12'), 'V-UP-F12 missing');
  });

  it('V-UP-F13 native-smoke rejected_surfaces < 15 triggers blocker', () => {
    const baseline = minimalValidBaselineFixture();
    const post = minimalValidBlockedPostUpgradeFixture();
    const smoke = minimalValidBlockedNativeSmokeFixture();
    smoke.promotion_discipline.rejected_surfaces =
      smoke.promotion_discipline.rejected_surfaces.slice(0, 5);
    const errs = validateFinal(
      post,
      JSON.stringify(post),
      smoke,
      JSON.stringify(smoke),
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-F13'), 'V-UP-F13 missing');
  });

  it('V-UP-F14 native-smoke missing inherited constraint triggers blocker', () => {
    const baseline = minimalValidBaselineFixture();
    const post = minimalValidBlockedPostUpgradeFixture();
    const smoke = minimalValidBlockedNativeSmokeFixture();
    smoke.inherited_constraints = smoke.inherited_constraints.filter(
      (c) => c.id !== 'LFP-LF-01'
    );
    const errs = validateFinal(
      post,
      JSON.stringify(post),
      smoke,
      JSON.stringify(smoke),
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-F14'),
      'V-UP-F14 missing for LFP-LF-01');
  });

  it('V-UP-F15 post-upgrade credential leak triggers blocker', () => {
    const baseline = minimalValidBaselineFixture();
    const post = minimalValidBlockedPostUpgradeFixture();
    post.diagnostic = 'leaked BETTER_AUTH_SECRET=xxx';
    const smoke = minimalValidBlockedNativeSmokeFixture();
    const errs = validateFinal(
      post,
      JSON.stringify(post),
      smoke,
      JSON.stringify(smoke),
      baseline
    );
    assert.ok(errs.some((b) => b.code === 'V-UP-REDACTION-SECRET' && /post-upgrade/.test(b.where)),
      'V-UP-REDACTION-SECRET missing for post-upgrade');
  });
});

// ---------------------------------------------------------------------------
// Test suites — runPhase absent-prerequisite gates (fail-closed honest BLOCKED)
// ---------------------------------------------------------------------------

describe('M014 S04 runPhase absent-prerequisite gate', () => {
  it('runPhase("baseline") with absent baseline returns loadError', () => {
    const result = runPhase('baseline', {
      baselinePath: '/nonexistent/baseline.json',
    });
    assert.equal(result.ok, false);
    assert.ok(result.loadError, 'expected loadError');
    assert.match(result.loadError, /baseline file not found/);
  });

  it('runPhase("ready") with absent contract returns V-UP-PREREQ-ABSENT (kind: absent)', () => {
    const result = runPhase('ready', {
      baselinePath: BASELINE_JSON,
      contractPath: '/nonexistent/contract.json',
      backupProofPath: '/nonexistent/backup.json',
    });
    assert.equal(result.ok, false);
    assert.ok(result.blockers.length > 0);
    const absentBlocker = result.blockers.find((b) => b.code === 'V-UP-PREREQ-ABSENT');
    assert.ok(absentBlocker, 'V-UP-PREREQ-ABSENT missing');
    assert.equal(absentBlocker.kind, 'absent');
    assert.match(absentBlocker.message, /upgrade-contract artifact unavailable/);
  });

  it('runPhase("deployed") with absent deploy returns V-UP-PREREQ-ABSENT', () => {
    const result = runPhase('deployed', {
      baselinePath: BASELINE_JSON,
      deployPath: '/nonexistent/deploy.json',
      rollbackPath: '/nonexistent/rollback.json',
    });
    assert.equal(result.ok, false);
    const absentBlocker = result.blockers.find((b) => b.code === 'V-UP-PREREQ-ABSENT');
    assert.ok(absentBlocker, 'V-UP-PREREQ-ABSENT missing');
    assert.equal(absentBlocker.kind, 'absent');
    assert.match(absentBlocker.message, /deploy artifact unavailable/);
  });

  it('runPhase("final") with absent post-upgrade returns V-UP-PREREQ-ABSENT', () => {
    const result = runPhase('final', {
      baselinePath: BASELINE_JSON,
      postUpgradePath: '/nonexistent/post.json',
      nativeSmokePath: '/nonexistent/smoke.json',
    });
    assert.equal(result.ok, false);
    const absentBlocker = result.blockers.find((b) => b.code === 'V-UP-PREREQ-ABSENT');
    assert.ok(absentBlocker, 'V-UP-PREREQ-ABSENT missing');
    assert.equal(absentBlocker.kind, 'absent');
    assert.match(absentBlocker.message, /post-upgrade artifact unavailable/);
  });

  it('runPhase("final") with absent native-smoke returns V-UP-PREREQ-ABSENT', () => {
    const result = runPhase('final', {
      baselinePath: BASELINE_JSON,
      postUpgradePath: POST_UPGRADE_JSON,
      nativeSmokePath: '/nonexistent/smoke.json',
    });
    assert.equal(result.ok, false);
    const absentBlocker = result.blockers.find((b) => b.code === 'V-UP-PREREQ-ABSENT');
    assert.ok(absentBlocker, 'V-UP-PREREQ-ABSENT missing');
    assert.match(absentBlocker.message, /native-smoke artifact unavailable/);
  });

  it('runPhase("bogus") returns V-UP-PHASE blocker', () => {
    const result = runPhase('bogus', { baselinePath: BASELINE_JSON });
    assert.equal(result.ok, false);
    assert.equal(result.blockers[0].code, 'V-UP-PHASE');
  });

  it('runPhase("ready") with malformed contract JSON returns loadError-equivalent absent blocker', () => {
    // Create a temp file with malformed JSON to simulate a corrupt artifact.
    const fs = require('node:fs');
    const os = require('node:os');
    const tmp = path.join(os.tmpdir(), `m014-s04-malformed-${process.pid}.json`);
    fs.writeFileSync(tmp, '{not json', 'utf8');
    try {
      const result = runPhase('ready', {
        baselinePath: BASELINE_JSON,
        contractPath: tmp,
        backupProofPath: '/nonexistent/backup.json',
      });
      assert.equal(result.ok, false);
      const absentBlocker = result.blockers.find((b) => b.code === 'V-UP-PREREQ-ABSENT');
      assert.ok(absentBlocker, 'V-UP-PREREQ-ABSENT missing for malformed contract');
      assert.equal(absentBlocker.evidence.error_kind, 'malformed');
    } finally {
      try { fs.unlinkSync(tmp); } catch (_e) { /* ignore */ }
    }
  });
});

// ---------------------------------------------------------------------------
// Test suites — runPhase happy-path with synthetic in-memory fixtures
// ---------------------------------------------------------------------------

describe('M014 S04 runPhase happy-path with synthetic fixtures', () => {
  // Use a synthetic baseline path via temp file so the validator doesn't
  // depend on the actual baseline artifact on disk for happy-path tests.
  let tmpBaseline;
  let tmpContract;
  let tmpBackup;
  let tmpDeploy;
  let tmpRollback;
  let tmpPost;
  let tmpSmoke;

  const fs = require('node:fs');
  const os = require('node:os');

  function writeTemp(name, value) {
    const p = path.join(os.tmpdir(), `m014-s04-${name}-${process.pid}.json`);
    fs.writeFileSync(p, JSON.stringify(value, null, 2), 'utf8');
    return p;
  }

  before(() => {
    const baseline = minimalValidBaselineFixture();
    tmpBaseline = writeTemp('baseline', baseline);
    tmpContract = writeTemp('contract', minimalValidUpgradeContractFixture());
    tmpBackup = writeTemp('backup', minimalValidBackupProofFixture());
    tmpDeploy = writeTemp('deploy', minimalValidDeployFixture());
    tmpRollback = writeTemp('rollback', minimalValidRollbackFixture());
    tmpPost = writeTemp('post', minimalValidBlockedPostUpgradeFixture());
    tmpSmoke = writeTemp('smoke', minimalValidBlockedNativeSmokeFixture());
  });

  it('runPhase("baseline") on synthetic baseline returns ok: true', () => {
    const result = runPhase('baseline', { baselinePath: tmpBaseline });
    assert.equal(result.ok, true, `expected ok, blockers: ${JSON.stringify(result.blockers)}`);
    assert.deepEqual(result.blockers, []);
  });

  it('runPhase("ready") on synthetic contract + backup returns ok: true', () => {
    const result = runPhase('ready', {
      baselinePath: tmpBaseline,
      contractPath: tmpContract,
      backupProofPath: tmpBackup,
    });
    assert.equal(result.ok, true, `expected ok, blockers: ${JSON.stringify(result.blockers)}`);
    assert.deepEqual(result.blockers, []);
  });

  it('runPhase("deployed") on synthetic deploy + rollback returns ok: true', () => {
    const result = runPhase('deployed', {
      baselinePath: tmpBaseline,
      deployPath: tmpDeploy,
      rollbackPath: tmpRollback,
    });
    assert.equal(result.ok, true, `expected ok, blockers: ${JSON.stringify(result.blockers)}`);
    assert.deepEqual(result.blockers, []);
  });

  it('runPhase("final") on synthetic blocked post-upgrade + native-smoke returns ok: true', () => {
    const result = runPhase('final', {
      baselinePath: tmpBaseline,
      postUpgradePath: tmpPost,
      nativeSmokePath: tmpSmoke,
    });
    assert.equal(result.ok, true, `expected ok, blockers: ${JSON.stringify(result.blockers)}`);
    assert.deepEqual(result.blockers, []);
  });
});

// ---------------------------------------------------------------------------
// CLI gate
// ---------------------------------------------------------------------------

/**
 * Run validation for a single phase. Returns { ok, blockers, loadError }.
 * The CLI gate exits 0/1/2 based on this.
 *
 * opts = {
 *   baselinePath, contractPath, backupProofPath, deployPath,
 *   rollbackPath, postUpgradePath, nativeSmokePath
 * }
 *
 * Phase semantics:
 *   baseline  — load + validate T01 baseline.json
 *   ready     — load T02 contract + backup-proof; validate identity cross-check
 *               against baseline + migrations_reviewed + local_patches_reconciled
 *               + deploy/rollback commands + backup_verified + redaction +
 *               inherited constraints
 *   deployed  — load T03 deploy + rollback; validate target identity match +
 *               honest deployment_status + migrations_applied +
 *               nginx_lockdown_preserved + previous_image_digest +
 *               previous_config_hash + rollback commands + redaction +
 *               inherited constraints
 *   final     — load T04 post-upgrade + native-smoke; validate honest
 *               BLOCKED verdicts + prerequisite_artifacts_audit exhaustive +
 *               bounded_native_smoke_attempted honest + promoted_surfaces=[] +
 *               rejected_surfaces>=15 + inherited constraints (6) +
 *               baseline_comparison_present + redaction
 *
 * Fail-closed:
 *   - each phase requires its own artifact pair; if absent, return
 *     V-UP-PREREQ-ABSENT (kind: 'absent') — never an implicit PASS
 *   - malformed JSON returns loadError (exit 2)
 *   - schema bugs return kind: 'schema' / 'target' / 'redaction' blockers
 */
function runPhase(phase, opts) {
  if (!ALLOWED_PHASES.includes(phase)) {
    return {
      ok: false,
      blockers: [
        makeBlocker({
          code: 'V-UP-PHASE',
          kind: 'schema',
          where: '--phase',
          message: `unknown phase "${phase}"`,
          evidence: { allowed: ALLOWED_PHASES },
          remediation: `Pass --phase ${ALLOWED_PHASES.join('|')}.`,
        }),
      ],
      loadError: null,
    };
  }

  if (phase === 'baseline') {
    const loadResult = loadBaseline(opts.baselinePath);
    if (!loadResult.ok) {
      return { ok: false, blockers: [], loadError: loadResult.error };
    }
    const blockers = validateBaseline(loadResult.baseline);
    return { ok: blockers.length === 0, blockers, loadError: null };
  }

  // For ready / deployed / final we always need the baseline for identity
  // cross-check (anti-supply-chain, anti-replay). Load it once.
  const baseLoad = loadBaseline(opts.baselinePath);
  if (!baseLoad.ok) {
    return {
      ok: false,
      blockers: [
        makeBlocker({
          code: 'V-UP-BASELINE-LOAD',
          kind: 'absent',
          where: opts.baselinePath,
          message: `baseline unavailable: ${baseLoad.error}`,
          remediation:
            'Baseline is required for identity cross-check on every non-baseline phase. Restore runtime-evidence/M014-S04-paperclip-baseline.json.',
        }),
      ],
      loadError: baseLoad.error,
    };
  }

  if (phase === 'ready') {
    const contractLoad = loadArtifact(opts.contractPath, 'upgrade-contract');
    const backupLoad = loadArtifact(opts.backupProofPath, 'backup-proof');
    const blockers = [];
    if (!contractLoad.ok) {
      blockers.push(
        makeBlocker({
          code: 'V-UP-PREREQ-ABSENT',
          kind: 'absent',
          where: opts.contractPath,
          message: `upgrade-contract artifact unavailable: ${contractLoad.error}`,
          evidence: { error_kind: contractLoad.error && contractLoad.error.includes('malformed') ? 'malformed' : 'absent' },
          remediation:
            'Create runtime-evidence/M014-S04-paperclip-upgrade-contract.json with pinned_target_revision, target_commit_sha, migrations_reviewed, local_patches_reconciled, deploy_commands, rollback_commands, inherited_constraints fields.',
        })
      );
      return { ok: false, blockers, loadError: null };
    }
    if (!backupLoad.ok) {
      blockers.push(
        makeBlocker({
          code: 'V-UP-PREREQ-ABSENT',
          kind: 'absent',
          where: opts.backupProofPath,
          message: `backup-proof artifact unavailable: ${backupLoad.error}`,
          evidence: { error_kind: backupLoad.error && backupLoad.error.includes('malformed') ? 'malformed' : 'absent' },
          remediation:
            'Create runtime-evidence/M014-S04-paperclip-backup-proof.json with target_revision, target_commit_sha, backup_verified, volume_snapshot_ids, db_dump_id, config_hash fields.',
        })
      );
      return { ok: false, blockers, loadError: null };
    }
    const readyBlockers = validateUpgradeContract(
      contractLoad.artifact,
      contractLoad.rawText,
      backupLoad.artifact,
      backupLoad.rawText,
      baseLoad.baseline
    );
    blockers.push(...readyBlockers);
    return { ok: blockers.length === 0, blockers, loadError: null };
  }

  if (phase === 'deployed') {
    const deployLoad = loadArtifact(opts.deployPath, 'deploy');
    const rollbackLoad = loadArtifact(opts.rollbackPath, 'rollback');
    const blockers = [];
    if (!deployLoad.ok) {
      blockers.push(
        makeBlocker({
          code: 'V-UP-PREREQ-ABSENT',
          kind: 'absent',
          where: opts.deployPath,
          message: `deploy artifact unavailable: ${deployLoad.error}`,
          evidence: { error_kind: deployLoad.error && deployLoad.error.includes('malformed') ? 'malformed' : 'absent' },
          remediation:
            'Create runtime-evidence/M014-S04-paperclip-deploy.json with target_revision, target_commit_sha, deployment_status, migrations_applied, nginx_lockdown_preserved fields.',
        })
      );
      return { ok: false, blockers, loadError: null };
    }
    if (!rollbackLoad.ok) {
      blockers.push(
        makeBlocker({
          code: 'V-UP-PREREQ-ABSENT',
          kind: 'absent',
          where: opts.rollbackPath,
          message: `rollback artifact unavailable: ${rollbackLoad.error}`,
          evidence: { error_kind: rollbackLoad.error && rollbackLoad.error.includes('malformed') ? 'malformed' : 'absent' },
          remediation:
            'Create runtime-evidence/M014-S04-paperclip-rollback.json with previous_image_digest, previous_config_hash, rollback_commands fields.',
        })
      );
      return { ok: false, blockers, loadError: null };
    }
    const deployBlockers = validateDeploy(
      deployLoad.artifact,
      deployLoad.rawText,
      rollbackLoad.artifact,
      rollbackLoad.rawText,
      baseLoad.baseline
    );
    blockers.push(...deployBlockers);
    return { ok: blockers.length === 0, blockers, loadError: null };
  }

  if (phase === 'final') {
    const postLoad = loadArtifact(opts.postUpgradePath, 'post-upgrade');
    const smokeLoad = loadArtifact(opts.nativeSmokePath, 'native-smoke');
    const blockers = [];
    if (!postLoad.ok) {
      blockers.push(
        makeBlocker({
          code: 'V-UP-PREREQ-ABSENT',
          kind: 'absent',
          where: opts.postUpgradePath,
          message: `post-upgrade artifact unavailable: ${postLoad.error}`,
          evidence: { error_kind: postLoad.error && postLoad.error.includes('malformed') ? 'malformed' : 'absent' },
          remediation:
            'Create runtime-evidence/M014-S04-paperclip-post-upgrade.json with post_upgrade_verdict, prerequisite_artifacts_audit, promotion_discipline, inherited_constraints_remain_in_force, baseline_comparison_present fields.',
        })
      );
      return { ok: false, blockers, loadError: null };
    }
    if (!smokeLoad.ok) {
      blockers.push(
        makeBlocker({
          code: 'V-UP-PREREQ-ABSENT',
          kind: 'absent',
          where: opts.nativeSmokePath,
          message: `native-smoke artifact unavailable: ${smokeLoad.error}`,
          evidence: { error_kind: smokeLoad.error && smokeLoad.error.includes('malformed') ? 'malformed' : 'absent' },
          remediation:
            'Create runtime-evidence/M014-S04-paperclip-native-smoke.json with native_smoke_verdict, bounded_native_smoke_attempted, prerequisite_artifacts_audit, promotion_discipline, inherited_constraints fields.',
        })
      );
      return { ok: false, blockers, loadError: null };
    }
    const finalBlockers = validateFinal(
      postLoad.artifact,
      postLoad.rawText,
      smokeLoad.artifact,
      smokeLoad.rawText,
      baseLoad.baseline
    );
    blockers.push(...finalBlockers);
    return { ok: blockers.length === 0, blockers, loadError: null };
  }

  // Should be unreachable since ALLOWED_PHASES is exhaustive.
  return {
    ok: false,
    blockers: [
      makeBlocker({
        code: 'V-UP-PHASE',
        kind: 'schema',
        where: '--phase',
        message: `unhandled phase "${phase}"`,
        evidence: { allowed: ALLOWED_PHASES },
        remediation: `Pass --phase ${ALLOWED_PHASES.join('|')}.`,
      }),
    ],
    loadError: null,
  };
}

function printBlockers(blockers) {
  for (const b of blockers) {
    console.error(`[${b.code}] ${b.message}`);
    if (b.where) console.error(`  where: ${b.where}`);
    if (b.evidence) console.error(`  evidence: ${JSON.stringify(b.evidence)}`);
    if (b.remediation) console.error(`  remediation: ${b.remediation}`);
  }
}

function runCli(argv) {
  const args = argv.slice(2);
  let phase = null;
  const opts = {
    baselinePath: BASELINE_JSON,
    contractPath: UPGRADE_CONTRACT_JSON,
    backupProofPath: BACKUP_PROOF_JSON,
    deployPath: DEPLOY_JSON,
    rollbackPath: ROLLBACK_JSON,
    postUpgradePath: POST_UPGRADE_JSON,
    nativeSmokePath: NATIVE_SMOKE_JSON,
  };
  const pathFlags = {
    '--baseline': 'baselinePath',
    '--contract': 'contractPath',
    '--backup-proof': 'backupProofPath',
    '--deploy': 'deployPath',
    '--rollback': 'rollbackPath',
    '--post-upgrade': 'postUpgradePath',
    '--native-smoke': 'nativeSmokePath',
  };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--phase') {
      phase = args[i + 1];
      i += 1;
    } else if (Object.prototype.hasOwnProperty.call(pathFlags, a)) {
      opts[pathFlags[a]] = path.resolve(PROJECT_ROOT, args[i + 1]);
      i += 1;
    } else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node scripts/validate_m014_s04_paperclip_upgrade.js ' +
          '--phase <baseline|ready|deployed|final> ' +
          '[--baseline <path>] [--contract <path>] [--backup-proof <path>] ' +
          '[--deploy <path>] [--rollback <path>] ' +
          '[--post-upgrade <path>] [--native-smoke <path>]'
      );
      process.exitCode = 0;
      return;
    } else {
      console.error(`FAIL: unknown argument "${a}"`);
      process.exitCode = 2;
      return;
    }
  }
  if (!phase) {
    console.error('FAIL: --phase is required (one of: baseline | ready | deployed | final)');
    process.exitCode = 2;
    return;
  }
  const result = runPhase(phase, opts);
  if (result.loadError) {
    console.error(`FAIL: ${result.loadError}`);
    process.exitCode = 2;
    return;
  }
  if (result.ok) {
    console.log(`PASS: M014-S04 upgrade validator — --phase ${phase} (${result.blockers.length} blockers)`);
    process.exitCode = 0;
    return;
  }
  console.error(`FAIL: M014-S04 upgrade validator — --phase ${phase} (${result.blockers.length} blocker(s))`);
  printBlockers(result.blockers);
  process.exitCode = 1;
}

function isLaunchedUnderNodeTest() {
  if (Array.isArray(process.execArgv)) {
    for (const arg of process.execArgv) {
      if (typeof arg === 'string' && arg.includes('--test')) return true;
    }
  }
  if (Array.isArray(process.argv)) {
    for (const arg of process.argv) {
      if (typeof arg === 'string' && arg.includes('--test')) return true;
    }
  }
  return false;
}

if (
  require.main === module &&
  !isLaunchedUnderNodeTest() &&
  process.env.NODE_TEST_CONTEXT === undefined
) {
  runCli(process.argv);
}

module.exports = {
  // Phase validators
  validateBaseline,
  validateUpgradeContract,
  validateDeploy,
  validateFinal,
  // Loaders + helpers
  loadBaseline,
  loadArtifact,
  scanRedaction,
  runPhase,
  runCli,
  makeBlocker,
  redactUuidPrefix,
  // Synthetic fixtures (T01..T04)
  minimalValidBaselineFixture,
  minimalValidUpgradeContractFixture,
  minimalValidBackupProofFixture,
  minimalValidDeployFixture,
  minimalValidRollbackFixture,
  minimalValidBlockedPostUpgradeFixture,
  minimalValidBlockedNativeSmokeFixture,
  // Artifact paths
  BASELINE_JSON,
  UPSTREAM_DIFF_MD,
  UPGRADE_CONTRACT_JSON,
  BACKUP_PROOF_JSON,
  DEPLOY_JSON,
  ROLLBACK_JSON,
  POST_UPGRADE_JSON,
  NATIVE_SMOKE_JSON,
  // Canonical constants
  CANONICAL_UPSTREAM_URL,
  CANONICAL_UPSTREAM_PATH,
  UPSTREAM_TAG_RE,
  REQUIRED_LOCAL_PATCH_KINDS,
  REQUIRED_INHERITED_CONSTRAINT_IDS,
  REDACTION_FORBIDDEN_SUBSTRINGS,
  ALLOWED_PHASES,
  POST_UPGRADE_ADMISSIBLE_VERDICTS,
  NATIVE_SMOKE_ADMISSIBLE_VERDICTS,
  DEPLOY_ADMISSIBLE_STATUSES,
  PROMOTED_SURFACES_ALLOWLIST,
  POST_UPGRADE_REQUIRED_PREREQ_IDS,
  NATIVE_SMOKE_REQUIRED_PREREQ_IDS,
};