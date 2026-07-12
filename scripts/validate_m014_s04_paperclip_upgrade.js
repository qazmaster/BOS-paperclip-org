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
 * Substrings that, if present anywhere in the baseline JSON, indicate a
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
// CLI gate
// ---------------------------------------------------------------------------

/**
 * Run validation for a single phase. Returns { ok, blockers, loadError }.
 * The CLI gate exits 0/1/2 based on this.
 */
function runPhase(phase, baselineAbsPath) {
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

  // T01 baseline phase: validate the baseline JSON.
  if (phase === 'baseline') {
    const loadResult = loadBaseline(baselineAbsPath);
    if (!loadResult.ok) {
      return { ok: false, blockers: [], loadError: loadResult.error };
    }
    const blockers = validateBaseline(loadResult.baseline);
    return { ok: blockers.length === 0, blockers, loadError: null };
  }

  // T02/T03/T04 phases: placeholder until the corresponding task ships its
  // artifact. Fail closed.
  return {
    ok: false,
    blockers: [
      makeBlocker({
        code: 'V-UP-PHASE-NOT-SHIPPED',
        kind: 'schema',
        where: `--phase ${phase}`,
        message: `--phase ${phase} is not yet shipped; this validator only supports --phase baseline in M014/S04/T01`,
        evidence: { shipped_phases: ['baseline'], requested: phase },
        remediation:
          'Run --phase baseline for T01 closeout. T02/T03/T04 phases will be added by their respective tasks.',
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
  let baselinePath = BASELINE_JSON;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--phase') {
      phase = args[i + 1];
      i += 1;
    } else if (a === '--baseline') {
      baselinePath = path.resolve(PROJECT_ROOT, args[i + 1]);
      i += 1;
    } else if (a === '--help' || a === '-h') {
      console.log(`Usage: node scripts/validate_m014_s04_paperclip_upgrade.js --phase <baseline|ready|deployed|final> [--baseline <path>]`);
      process.exitCode = 0;
      return;
    }
  }
  if (!phase) {
    console.error('FAIL: --phase is required (one of: baseline | ready | deployed | final)');
    process.exitCode = 2;
    return;
  }
  const result = runPhase(phase, baselinePath);
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
  validateBaseline,
  loadBaseline,
  runPhase,
  runCli,
  minimalValidBaselineFixture,
  makeBlocker,
  redactUuidPrefix,
  BASELINE_JSON,
  UPSTREAM_DIFF_MD,
  CANONICAL_UPSTREAM_URL,
  CANONICAL_UPSTREAM_PATH,
  UPSTREAM_TAG_RE,
  REQUIRED_LOCAL_PATCH_KINDS,
  REQUIRED_INHERITED_CONSTRAINT_IDS,
  REDACTION_FORBIDDEN_SUBSTRINGS,
  ALLOWED_PHASES,
};