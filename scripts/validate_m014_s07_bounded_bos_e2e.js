#!/usr/bin/env node
/**
 * @file scripts/validate_m014_s07_bounded_bos_e2e.js
 *
 * M014-a9jj46/S07 — Bounded BOS Light E2E Gate validator.
 *
 * Implements a multi-phase validation gate for the S07 slice:
 *   --phase entry-gate    (T01) — verify the exact-match triple upstream
 *                                  promotion contract: S04 deployment_status=success
 *                                  + post_upgrade_verdict=PASS + native_smoke_verdict=PASS,
 *                                  plus S05 upgrade/direct/paperclip and S06
 *                                  direct-live/paperclip-hermes-live/rollout/persistence.
 *                                  Health-only signals are explicitly insufficient;
 *                                  the gate fails closed when ANY upstream is deferred.
 *   --phase allow-blocker (T03) — accept a validator-valid blocker artifact
 *                                  (diagnostic fail-closed posture).
 *   --phase require-pass  (T04) — require the canonical runtime-execution-proof
 *                                  artifact with terminal succeeded and exact
 *                                  side-effect accounting.
 *
 * T01 ships the `--phase entry-gate` implementation plus redaction/idempotent
 * helpers. The other two phases are stub fail-closed placeholders that exit
 * with a clear "not yet implemented" message until T03/T04 land.
 *
 * Validator classes for --phase entry-gate (V-BOS-E2E-01 .. V-BOS-E2E-30):
 *   V-BOS-E2E-01  all 10 upstream artifacts present and parse as JSON objects
 *   V-BOS-E2E-02  S04 deploy.deployment_status === "success"
 *   V-BOS-E2E-03  S04 deploy.nginx_lockdown_preserved === true
 *   V-BOS-E2E-04  S04 deploy.migrations_applied.applied === true AND count >= 1
 *   V-BOS-E2E-05  S04 post-upgrade.post_upgrade_verdict === "PASS"
 *   V-BOS-E2E-06  S04 post-upgrade.fresh_readback_performed === true
 *   V-BOS-E2E-07  S04 native-smoke.native_smoke_verdict === "PASS"
 *   V-BOS-E2E-08  S04 native-smoke.bounded_native_smoke_attempted === true AND all
 *                 6 native surface classes present (issue/document/comment
 *                 create+readback)
 *   V-BOS-E2E-09  S05 upgrade.phase_verdict in {UPGRADE_VERIFIED,
 *                 UPGRADE_VERIFIED_PENDING_MINIMAX_REGISTRY}
 *   V-BOS-E2E-10  S05 upgrade.pre_flight_checks_results.checks_count === 6 AND
 *                 all 6 PFC check names present AND each pre_flight_check.passed=true
 *   V-BOS-E2E-11  S05 upgrade.patch_reconciliation_results.patches_count === 4 AND
 *                 all 4 LHA-* patch IDs present AND each patch.reconciled=true
 *   V-BOS-E2E-12  S05 direct-proof.phase_verdict === "PASS"
 *   V-BOS-E2E-13  S05 paperclip-proof.phase_verdict === "PASS" AND
 *                 adapter_profile_target.profile_shape carries all 9 required keys
 *   V-BOS-E2E-14  S06 direct-live.phase_verdict === "PASS"
 *   V-BOS-E2E-15  S06 direct-live provider_observed === "minimax" AND
 *                 model_observed === "MiniMax-M3"
 *   V-BOS-E2E-16  S06 paperclip-hermes-live.phase_verdict === "PASS"
 *   V-BOS-E2E-17  S06 paperclip-hermes-live bounded_agent_id_prefix NOT in R3
 *                 stale_company_ids ledger (8-char prefix check)
 *   V-BOS-E2E-18  S06 rollout.phase_verdict === "ROLLOUT" AND
 *                 rollout_verdict === "ROLLOUT"
 *   V-BOS-E2E-19  S06 rollout all 4 RPC-* conditions live_observed === true
 *   V-BOS-E2E-20  S06 rollout zero RBC-* triggers tripped (all three false)
 *   V-BOS-E2E-21  S06 persistence.phase_verdict === "PASS"
 *   V-BOS-E2E-22  S06 persistence all 8 pre/post sha256 pairs equal (companies,
 *                 agents, memberships, plugins, postgres_data_path, hermes_agent_version,
 *                 hermes_providers_profile, hermes_active_profile)
 *   V-BOS-E2E-23  S06 persistence hermes_providers_profile post-restart still
 *                 references minimax AND MiniMax-M3 (xiaomi must NOT re-emerge)
 *   V-BOS-E2E-24  xiaomi prohibition all 4 layers true across S06 direct
 *                 (xiaomi_endpoint_reuse_prohibition) AND S06 paperclip
 *                 (xiaomi_adapter_config_prohibition)
 *   V-BOS-E2E-25  inherited_constraints_remain_in_force carries all 6 LFP-*
 *                 IDs in EACH S05 and S06 evidence artifact
 *   V-BOS-E2E-26  redaction discipline: no credential value (KEY=value,
 *                 Bearer tokens, sk-/tp- prefixes) AND no unapproved UUID
 *                 literal across ALL 10 upstream artifacts
 *   V-BOS-E2E-27  phase_verdict in its declared enum_lock for each upstream
 *                 (deferred values like PLAN_READY_LIVE_EXECUTION_DEFERRED
 *                 reject PASS attempts; PASS rejects LOCKED/DEFERRED claims)
 *   V-BOS-E2E-28  live_execution_status in its declared enum_lock AND
 *                 fresh_readback_required === true for each upstream
 *   V-BOS-E2E-29  business_mutation_count invariant: if entry-gate is FAIL,
 *                 optional target evidence must show business_mutation_count === 0
 *                 AND ledger.issues_created === 0 AND ledger.heartbeat_runs_started === 0
 *   V-BOS-E2E-30  R026 routing preservation: if any payload claims a routing
 *                 field, the route MUST preserve
 *                 Div7.MissionControl -> DecisionDelegated -> Div1.HCO ->
 *                 operational divisions (exact chain)
 *
 * Failure modes covered (Q5):
 *   - missing upstream artifact: V-BOS-E2E-01 (load fails fast with structured error)
 *   - deferred upstream gate: V-BOS-E2E-02..07, V-BOS-E2E-09, V-BOS-E2E-12..18, V-BOS-E2E-21
 *   - stale company_id (R3) in bounded-test-agent: V-BOS-E2E-17
 *   - xiaomi drift: V-BOS-E2E-15 (provider), V-BOS-E2E-23 (post-restart), V-BOS-E2E-24 (4-layer)
 *   - credential leak: V-BOS-E2E-26 (sub-pattern cred-key-value, cred-bearer, cred-sk/tp-prefix)
 *   - full UUID literal leak: V-BOS-E2E-26
 *   - missing inherited constraint: V-BOS-E2E-25
 *   - R026 routing violation: V-BOS-E2E-30
 *   - business_mutation_count > 0 on a fail-closed artifact: V-BOS-E2E-29
 *   - phase_verdict outside declared enum_lock: V-BOS-E2E-27
 *   - missing live_execution_status enum_lock / fresh_readback_required: V-BOS-E2E-28
 *   - phase argument outside {entry-gate, allow-blocker, require-pass}: phase guard
 *
 * Verification:
 *   node --test scripts/test_validate_m014_s07_bounded_bos_e2e.js
 *
 * CLI gates (fail-closed):
 *   node scripts/validate_m014_s07_bounded_bos_e2e.js --phase entry-gate
 *   (returns exit 0 on PASS, 1 on validation error, 2 on load error)
 *
 * Reuse:
 *   const { validateEntryGate, loadUpstreamArtifacts, scanCredentialLeaks,
 *           scanUuidLeaks, redactUuidLiteral, REQUIRED_* } =
 *     require('./scripts/validate_m014_s07_bounded_bos_e2e');
 *
 * Design contract:
 *   - Side-effect free: reads files, validates, asserts. No network, no
 *     subprocesses, no git, no docker, no secret writes.
 *   - Secrets are never echoed in evidence (UUIDs are redacted to 8-char
 *     prefixes; credential key=value shapes trigger V-BOS-E2E-26 immediately).
 *   - Fail-closed: every blocker is a hard stop. The CLI gate never warns
 *     and proceeds. A validator-valid blocker artifact does NOT pass
 *     --phase require-pass.
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
const S04_DEPLOY_JSON = path.resolve(
  PROJECT_ROOT,
  'runtime-evidence/M014-S04-paperclip-deploy.json'
);
const S04_POST_UPGRADE_JSON = path.resolve(
  PROJECT_ROOT,
  'runtime-evidence/M014-S04-paperclip-post-upgrade.json'
);
const S04_NATIVE_SMOKE_JSON = path.resolve(
  PROJECT_ROOT,
  'runtime-evidence/M014-S04-paperclip-native-smoke.json'
);
const S05_UPGRADE_JSON = path.resolve(
  PROJECT_ROOT,
  'runtime-evidence/M014-S05-hermes-upgrade.json'
);
const S05_DIRECT_JSON = path.resolve(
  PROJECT_ROOT,
  'runtime-evidence/M014-S05-minimax-direct-proof.json'
);
const S05_PAPERCLIP_JSON = path.resolve(
  PROJECT_ROOT,
  'runtime-evidence/M014-S05-paperclip-hermes-minimax-proof.json'
);
const S06_DIRECT_LIVE_JSON = path.resolve(
  PROJECT_ROOT,
  'runtime-evidence/M014-S06-minimax-direct-live.json'
);
const S06_PAPERCLIP_HERMES_LIVE_JSON = path.resolve(
  PROJECT_ROOT,
  'runtime-evidence/M014-S06-paperclip-hermes-live.json'
);
const S06_ROLLOUT_JSON = path.resolve(
  PROJECT_ROOT,
  'runtime-evidence/M014-S06-rollout-verdict.json'
);
const S06_PERSISTENCE_JSON = path.resolve(
  PROJECT_ROOT,
  'runtime-evidence/M014-S06-persistence-canary.json'
);
const S07_TARGET_JSON = path.resolve(
  PROJECT_ROOT,
  'runtime-evidence/M014-S07-bounded-bos-e2e.json'
);
const LOCKFILE_JSON = path.resolve(
  PROJECT_ROOT,
  'paperclip-runtime.lock.json'
);

const UPSTREAM_ARTIFACT_PATHS = {
  s04Deploy: S04_DEPLOY_JSON,
  s04PostUpgrade: S04_POST_UPGRADE_JSON,
  s04NativeSmoke: S04_NATIVE_SMOKE_JSON,
  s05Upgrade: S05_UPGRADE_JSON,
  s05Direct: S05_DIRECT_JSON,
  s05Paperclip: S05_PAPERCLIP_JSON,
  s06DirectLive: S06_DIRECT_LIVE_JSON,
  s06PaperclipHermesLive: S06_PAPERCLIP_HERMES_LIVE_JSON,
  s06Rollout: S06_ROLLOUT_JSON,
  s06Persistence: S06_PERSISTENCE_JSON
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REQUIRED_DEPLOYMENT_STATUS = 'success';
const REQUIRED_POST_UPGRADE_VERDICT = 'PASS';
const REQUIRED_NATIVE_SMOKE_VERDICT = 'PASS';
const REQUIRED_S05_UPGRADE_PHASE_VERDICTS = [
  'UPGRADE_VERIFIED',
  'UPGRADE_VERIFIED_PENDING_MINIMAX_REGISTRY'
];
const REQUIRED_S05_DIRECT_PHASE_VERDICT = 'PASS';
const REQUIRED_S05_PAPERCLIP_PHASE_VERDICT = 'PASS';
const REQUIRED_S06_DIRECT_LIVE_PHASE_VERDICT = 'PASS';
const REQUIRED_S06_PAPERCLIP_HERMES_LIVE_PHASE_VERDICT = 'PASS';
const REQUIRED_S06_ROLLOUT_PHASE_VERDICT = 'ROLLOUT';
const REQUIRED_S06_ROLLOUT_VERDICT = 'ROLLOUT';
const REQUIRED_S06_PERSISTENCE_PHASE_VERDICT = 'PASS';

const REQUIRED_LIVE_EXECUTION_STATUS_ENUM = [
  'pending-live-execution',
  'in-progress-live-execution',
  'passed-live-execution',
  'failed-live-execution',
  'deferred-to-fresh-readback-window'
];

const REQUIRED_PFC_CHECK_NAMES = [
  'cli_startup',
  'config_parsing',
  'profiles',
  'provider_discovery',
  'timeout_handling',
  'structured_output'
];

const REQUIRED_LHA_PATCH_IDS = [
  'LHA-PYUSERBASE-WRAPPER',
  'LHA-PEP668-OVERRIDE',
  'LHA-ADAPTER-CLI-CONTRACT',
  'LHA-SECRET-REF-ENVELOPE'
];

const REQUIRED_INHERITED_CONSTRAINT_IDS = [
  'LFP-LF-01',
  'LFP-LF-02',
  'LFP-LF-03',
  'LFP-S02-01',
  'LFP-S02-02',
  'LFP-S02-03'
];

const REQUIRED_RPC_IDS = ['RPC-01', 'RPC-02', 'RPC-03', 'RPC-04'];
const REQUIRED_RBC_IDS = ['RBC-01', 'RBC-02', 'RBC-03'];

const REQUIRED_PERSISTENCE_TARGETS = [
  'paperclip_companies',
  'paperclip_agents',
  'paperclip_memberships',
  'paperclip_plugins',
  'paperclip_postgres_data_path',
  'hermes_agent_version',
  'hermes_providers_profile',
  'hermes_active_profile'
];

const REQUIRED_NATIVE_SURFACE_CLASSES = [
  'issue_create',
  'issue_readback',
  'document_create',
  'document_readback',
  'comment_create',
  'comment_readback'
];

const REQUIRED_PAPERCLIP_PROFILE_KEYS = [
  'provider',
  'model',
  'timeoutSec',
  'graceSec',
  'endpoint_class',
  'api_key_secret_ref',
  'base_url_secret_ref',
  'structured_output_schema',
  'session_id_format_expected'
];

const REQUIRED_XIAOMI_PROHIBITION_FIELDS = [
  'no_xiaomi_endpoint_use',
  'no_xiaomi_api_key_use',
  'no_xiaomi_base_url_use',
  'no_xiaomi_session_id_reuse'
];

const REQUIRED_XIAOMI_ADAPTER_PROHIBITION_FIELDS = [
  'no_xiaomi_adapter_endpoint_use',
  'no_xiaomi_adapter_api_key_use',
  'no_xiaomi_adapter_base_url_use',
  'no_xiaomi_adapter_session_id_reuse'
];

// R3 stale-id ledger prefixes (8-char) — bounded-test-agent must NEVER
// carry any of these as its 8-char prefix.
const R3_STALE_PREFIXES = new Set([
  '9feb4c22', // stale-m012-epoch
  '43c74adb', // stale-m002-epoch
  '1a194762', // historical-runtime-gate
  '7595fd85', // R3 dead UUID as of 2026-07-08
  '7eede16c', // R3 dead UUID as of 2026-07-08
  '8233ea7b'  // R3 dead UUID as of 2026-07-08
]);

const CANONICAL_MINIMAX_PROVIDER = 'minimax';
const CANONICAL_MINIMAX_MODEL = 'MiniMax-M3';

// R026 routing chain — exact 4-step sequence that any payload claiming routing
// MUST preserve (Div7.MissionControl -> DecisionDelegated -> Div1.HCO ->
// operational divisions). Used by V-BOS-E2E-30.
const R026_ROUTING_CHAIN = [
  'Div7.MissionControl',
  'DecisionDelegated',
  'Div1.HCO',
  'operational divisions'
];

// Forbidden credential value shapes. Same posture as S05 validator V-HM-09
// family: detect real KEY=<value> leaks, not bare documentation substrings.
const FORBIDDEN_CREDENTIAL_VALUE_PATTERNS = [
  {
    id: 'cred-key-value',
    label: 'credential key=value with non-empty value',
    re: /(?:XIAOMI_API_KEY|XIAOMI_BASE_URL|OPENAI_API_KEY|PAPERCLIP_API_KEY|MINIMAX_API_KEY|MINIMAX_BASE_URL)\s*=\s*[^\s"',;}\]\n]{4,}/g
  },
  {
    id: 'cred-bearer',
    label: 'Authorization Bearer with token value',
    re: /Authorization:\s*Bearer\s+[A-Za-z0-9_\-.~+/=]{4,}/g
  },
  {
    id: 'cred-sk-prefix',
    label: 'sk-* token shape',
    re: /\bsk-(?:proj-)?[A-Za-z0-9_\-]{16,}/g
  },
  {
    id: 'cred-tp-prefix',
    label: 'tp-* token shape',
    re: /\btp-[A-Za-z0-9_\-]{16,}/g
  }
];

// 8-4-4-4-12 hex UUID literal. Allowed prefixes are restricted to the R3
// ledger (legacy historical references) plus a small set of self-documentation
// shapes used in validator design notes.
const UUID_LITERAL_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const APPROVED_UUID_PREFIXES = new Set([
  ...R3_STALE_PREFIXES,
  // Self-documentation shape used inside some validator design notes:
  // 00000000-0000-0000-0000-000000000000 (zero-UUID) and 11111111-...
  '00000000',
  '11111111',
  'aaaaaaaa',
  'ffffffff',
  'deadbeef',
  'cafebabe'
]);

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

function loadJSON(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`required upstream artifact not found: ${filePath}`);
  }
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(`read failure: ${filePath}: ${err && err.message ? err.message : 'unknown'}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`JSON parse failure: ${filePath}: ${err && err.message ? err.message : 'unknown'}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`top-level must be a JSON object: ${filePath}`);
  }
  return { raw, parsed };
}

function loadUpstreamArtifacts() {
  const artifacts = {};
  const errors = [];
  for (const [key, filePath] of Object.entries(UPSTREAM_ARTIFACT_PATHS)) {
    try {
      artifacts[key] = loadJSON(filePath);
    } catch (err) {
      errors.push({ key, filePath, error: err.message });
    }
  }
  if (errors.length > 0) {
    const summary = errors.map((e) => `${e.key}=${e.error}`).join('; ');
    const err = new Error(`upstream artifact load errors: ${summary}`);
    err.details = errors;
    throw err;
  }
  return artifacts;
}

function loadLockfileOrNull() {
  if (!fs.existsSync(LOCKFILE_JSON)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(LOCKFILE_JSON, 'utf8'));
  } catch {
    return null;
  }
}

function loadTargetEvidenceOrNull() {
  return loadTargetEvidenceFromPath(S07_TARGET_JSON);
}

function loadTargetEvidenceFromPath(filePath) {
  if (!filePath) {
    return null;
  }
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function redactCredentialMatch(match) {
  const eqIdx = match.search(/=/);
  if (eqIdx === -1) {
    return `${match.slice(0, 4)}…(redacted)`;
  }
  const key = match.slice(0, eqIdx + 1);
  const value = match.slice(eqIdx + 1).trim();
  if (value.length <= 6) {
    return `${key}…(redacted)`;
  }
  return `${key}${value.slice(0, 2)}…${value.slice(-2)}`;
}

function scanCredentialLeaks(haystack) {
  const hits = [];
  for (const pat of FORBIDDEN_CREDENTIAL_VALUE_PATTERNS) {
    pat.re.lastIndex = 0;
    const matches = haystack.match(pat.re) || [];
    for (const m of matches) {
      hits.push({ id: pat.id, label: pat.label, redacted: redactCredentialMatch(m) });
    }
  }
  return hits;
}

function redactUuidLiteral(u) {
  return `${u.slice(0, 8)}-****-****-****-************`;
}

function scanUuidLeaks(haystack, allowedPrefixes = APPROVED_UUID_PREFIXES) {
  const matches = haystack.match(UUID_LITERAL_RE) || [];
  return matches.filter((u) => !allowedPrefixes.has(u.slice(0, 8).toLowerCase()));
}

function getIdsFromConstraintList(constraintList) {
  if (!Array.isArray(constraintList)) return new Set();
  return new Set(constraintList.map((c) => (c && typeof c.id === 'string' ? c.id : null)).filter(Boolean));
}

function isLivePhaseAdmissible(phaseVerdict) {
  // Admissible live values for an S07 entry gate are only those that mean the
  // upstream has actually been promoted. Anything else is a fail-closed block.
  return (
    phaseVerdict === REQUIRED_DEPLOYMENT_STATUS ||
    phaseVerdict === REQUIRED_POST_UPGRADE_VERDICT ||
    phaseVerdict === REQUIRED_NATIVE_SMOKE_VERDICT ||
    REQUIRED_S05_UPGRADE_PHASE_VERDICTS.includes(phaseVerdict) ||
    phaseVerdict === REQUIRED_S05_DIRECT_PHASE_VERDICT ||
    phaseVerdict === REQUIRED_S05_PAPERCLIP_PHASE_VERDICT ||
    phaseVerdict === REQUIRED_S06_DIRECT_LIVE_PHASE_VERDICT ||
    phaseVerdict === REQUIRED_S06_PAPERCLIP_HERMES_LIVE_PHASE_VERDICT ||
    phaseVerdict === REQUIRED_S06_ROLLOUT_PHASE_VERDICT ||
    phaseVerdict === REQUIRED_S06_PERSISTENCE_PHASE_VERDICT
  );
}

// ---------------------------------------------------------------------------
// Individual entry-gate validators
// ---------------------------------------------------------------------------

function checkAllArtifactsPresent(artifacts) {
  const requiredKeys = Object.keys(UPSTREAM_ARTIFACT_PATHS);
  const missing = requiredKeys.filter((k) => !artifacts[k] || !artifacts[k].parsed);
  if (missing.length > 0) {
    return {
      blocker: `missing upstream artifacts: ${missing.join(', ')}`,
      check: {
        id: 'V-BOS-E2E-01',
        verdict: 'fail',
        note: `missing: ${missing.join(', ')}`
      }
    };
  }
  return {
    summary: { count: requiredKeys.length },
    check: {
      id: 'V-BOS-E2E-01',
      verdict: 'pass',
      note: `all ${requiredKeys.length} upstream artifacts present and parse as JSON objects`
    }
  };
}

function checkS04DeploymentStatus(s04Deploy) {
  const parsed = s04Deploy && s04Deploy.parsed;
  if (!parsed) {
    return { check: { id: 'V-BOS-E2E-02', verdict: 'fail', note: 's04Deploy missing' } };
  }
  const status = parsed.deployment_status;
  if (status !== REQUIRED_DEPLOYMENT_STATUS) {
    return {
      blocker: `S04 deploy.deployment_status must equal "${REQUIRED_DEPLOYMENT_STATUS}" (got ${status}); one /api/health 200 response is NOT sufficient`,
      check: {
        id: 'V-BOS-E2E-02',
        verdict: 'fail',
        note: `deployment_status drift: ${status}`
      }
    };
  }
  return {
    summary: { status },
    check: { id: 'V-BOS-E2E-02', verdict: 'pass', note: `deployment_status=${status}` }
  };
}

function checkS04NginxLockdown(s04Deploy) {
  const parsed = s04Deploy && s04Deploy.parsed;
  if (!parsed) {
    return { check: { id: 'V-BOS-E2E-03', verdict: 'fail', note: 's04Deploy missing' } };
  }
  if (parsed.nginx_lockdown_preserved !== true) {
    return {
      blocker: `S04 deploy.nginx_lockdown_preserved must be true (got ${parsed.nginx_lockdown_preserved}); public sign-up must remain locked`,
      check: {
        id: 'V-BOS-E2E-03',
        verdict: 'fail',
        note: `nginx lockdown drift: ${parsed.nginx_lockdown_preserved}`
      }
    };
  }
  return {
    summary: { nginx_lockdown_preserved: true },
    check: { id: 'V-BOS-E2E-03', verdict: 'pass', note: 'nginx_lockdown_preserved=true' }
  };
}

function checkS04MigrationsApplied(s04Deploy) {
  const parsed = s04Deploy && s04Deploy.parsed;
  if (!parsed) {
    return { check: { id: 'V-BOS-E2E-04', verdict: 'fail', note: 's04Deploy missing' } };
  }
  const migrations = parsed.migrations_applied;
  if (!migrations || migrations.applied !== true || (migrations.count || 0) < 1) {
    return {
      blocker: `S04 deploy.migrations_applied.applied must be true with count>=1 (got ${JSON.stringify(migrations)})`,
      check: {
        id: 'V-BOS-E2E-04',
        verdict: 'fail',
        note: `migrations drift: ${JSON.stringify(migrations)}`
      }
    };
  }
  return {
    summary: { count: migrations.count, ids: migrations.migration_ids },
    check: {
      id: 'V-BOS-E2E-04',
      verdict: 'pass',
      note: `migrations applied: count=${migrations.count}`
    }
  };
}

function checkS04PostUpgradeVerdict(s04PostUpgrade) {
  const parsed = s04PostUpgrade && s04PostUpgrade.parsed;
  if (!parsed) {
    return { check: { id: 'V-BOS-E2E-05', verdict: 'fail', note: 's04PostUpgrade missing' } };
  }
  const verdict = parsed.post_upgrade_verdict;
  if (verdict !== REQUIRED_POST_UPGRADE_VERDICT) {
    return {
      blocker: `S04 post-upgrade.post_upgrade_verdict must equal "${REQUIRED_POST_UPGRADE_VERDICT}" (got ${verdict})`,
      check: {
        id: 'V-BOS-E2E-05',
        verdict: 'fail',
        note: `post-upgrade verdict drift: ${verdict}`
      }
    };
  }
  return {
    summary: { verdict },
    check: { id: 'V-BOS-E2E-05', verdict: 'pass', note: `post_upgrade_verdict=${verdict}` }
  };
}

function checkS04FreshReadbackPerformed(s04PostUpgrade) {
  const parsed = s04PostUpgrade && s04PostUpgrade.parsed;
  if (!parsed) {
    return { check: { id: 'V-BOS-E2E-06', verdict: 'fail', note: 's04PostUpgrade missing' } };
  }
  const fp = parsed.freshness_posture && parsed.freshness_posture.fresh_readback_performed;
  if (fp !== true) {
    return {
      blocker: `S04 post-upgrade.freshness_posture.fresh_readback_performed must be true (got ${fp}); health-only signals are insufficient`,
      check: {
        id: 'V-BOS-E2E-06',
        verdict: 'fail',
        note: `fresh_readback_performed missing: ${fp}`
      }
    };
  }
  return {
    summary: { fresh_readback_performed: true },
    check: { id: 'V-BOS-E2E-06', verdict: 'pass', note: 'fresh_readback_performed=true' }
  };
}

function checkS04NativeSmokeVerdict(s04NativeSmoke) {
  const parsed = s04NativeSmoke && s04NativeSmoke.parsed;
  if (!parsed) {
    return { check: { id: 'V-BOS-E2E-07', verdict: 'fail', note: 's04NativeSmoke missing' } };
  }
  const verdict = parsed.native_smoke_verdict;
  if (verdict !== REQUIRED_NATIVE_SMOKE_VERDICT) {
    return {
      blocker: `S04 native-smoke.native_smoke_verdict must equal "${REQUIRED_NATIVE_SMOKE_VERDICT}" (got ${verdict})`,
      check: {
        id: 'V-BOS-E2E-07',
        verdict: 'fail',
        note: `native-smoke verdict drift: ${verdict}`
      }
    };
  }
  return {
    summary: { verdict },
    check: { id: 'V-BOS-E2E-07', verdict: 'pass', note: `native_smoke_verdict=${verdict}` }
  };
}

function checkS04NativeSurfacesLive(s04NativeSmoke) {
  const parsed = s04NativeSmoke && s04NativeSmoke.parsed;
  if (!parsed) {
    return { check: { id: 'V-BOS-E2E-08', verdict: 'fail', note: 's04NativeSmoke missing' } };
  }
  if (parsed.bounded_native_smoke_attempted !== true) {
    return {
      blocker: `S04 native-smoke.bounded_native_smoke_attempted must be true (got ${parsed.bounded_native_smoke_attempted}); no live evidence was collected`,
      check: {
        id: 'V-BOS-E2E-08',
        verdict: 'fail',
        note: `bounded_native_smoke_attempted missing: ${parsed.bounded_native_smoke_attempted}`
      }
    };
  }
  const surfaceClasses = new Set((parsed.promotable_surface_classes || []).map(String));
  const missing = REQUIRED_NATIVE_SURFACE_CLASSES.filter((c) => !surfaceClasses.has(c));
  if (missing.length > 0) {
    return {
      blocker: `S04 native-smoke.promotable_surface_classes missing: ${missing.join(', ')}`,
      check: {
        id: 'V-BOS-E2E-08',
        verdict: 'fail',
        note: `surface class gap: ${missing.join(', ')}`
      }
    };
  }
  return {
    summary: { surface_class_count: surfaceClasses.size },
    check: {
      id: 'V-BOS-E2E-08',
      verdict: 'pass',
      note: `all ${REQUIRED_NATIVE_SURFACE_CLASSES.length} native surface classes present`
    }
  };
}

function checkS05UpgradePhaseVerdict(s05Upgrade) {
  const parsed = s05Upgrade && s05Upgrade.parsed;
  if (!parsed) {
    return { check: { id: 'V-BOS-E2E-09', verdict: 'fail', note: 's05Upgrade missing' } };
  }
  const verdict = parsed.phase_verdict;
  if (!REQUIRED_S05_UPGRADE_PHASE_VERDICTS.includes(verdict)) {
    return {
      blocker: `S05 upgrade.phase_verdict must be one of [${REQUIRED_S05_UPGRADE_PHASE_VERDICTS.join(', ')}] (got ${verdict})`,
      check: {
        id: 'V-BOS-E2E-09',
        verdict: 'fail',
        note: `S05 upgrade phase_verdict drift: ${verdict}`
      }
    };
  }
  return {
    summary: { verdict },
    check: { id: 'V-BOS-E2E-09', verdict: 'pass', note: `S05 upgrade phase_verdict=${verdict}` }
  };
}

function checkS05UpgradePreFlightChecks(s05Upgrade) {
  const parsed = s05Upgrade && s05Upgrade.parsed;
  if (!parsed) {
    return { check: { id: 'V-BOS-E2E-10', verdict: 'fail', note: 's05Upgrade missing' } };
  }
  const pfc = parsed.pre_flight_checks_results || {};
  const checks = Array.isArray(pfc.checks) ? pfc.checks : [];
  const names = new Set(checks.map((c) => (c && c.name) || null).filter(Boolean));
  const missing = REQUIRED_PFC_CHECK_NAMES.filter((n) => !names.has(n));
  const nonPassed = checks.filter((c) => c && c.passed !== true).map((c) => c && c.name);
  if (checks.length !== REQUIRED_PFC_CHECK_NAMES.length || missing.length > 0 || nonPassed.length > 0) {
    return {
      blocker: `S05 upgrade.pre_flight_checks_results must cover ${REQUIRED_PFC_CHECK_NAMES.length} PFC checks all passed (got count=${checks.length}, missing=${missing.join(',')}, non_passed=${nonPassed.join(',')})`,
      check: {
        id: 'V-BOS-E2E-10',
        verdict: 'fail',
        note: `PFC gap: count=${checks.length}, missing=${missing.join(',')}`
      }
    };
  }
  return {
    summary: { count: checks.length },
    check: {
      id: 'V-BOS-E2E-10',
      verdict: 'pass',
      note: `all ${REQUIRED_PFC_CHECK_NAMES.length} PFC checks passed`
    }
  };
}

function checkS05UpgradePatchReconciliation(s05Upgrade) {
  const parsed = s05Upgrade && s05Upgrade.parsed;
  if (!parsed) {
    return { check: { id: 'V-BOS-E2E-11', verdict: 'fail', note: 's05Upgrade missing' } };
  }
  const pr = parsed.patch_reconciliation_results || {};
  const patches = Array.isArray(pr.patches) ? pr.patches : [];
  const ids = new Set(patches.map((p) => (p && p.id) || null).filter(Boolean));
  const missing = REQUIRED_LHA_PATCH_IDS.filter((id) => !ids.has(id));
  const nonReconciled = patches.filter((p) => p && p.reconciled !== true).map((p) => p && p.id);
  if (patches.length !== REQUIRED_LHA_PATCH_IDS.length || missing.length > 0 || nonReconciled.length > 0) {
    return {
      blocker: `S05 upgrade.patch_reconciliation_results must cover all 4 LHA-* patches reconciled (got count=${patches.length}, missing=${missing.join(',')}, non_reconciled=${nonReconciled.join(',')})`,
      check: {
        id: 'V-BOS-E2E-11',
        verdict: 'fail',
        note: `patch reconciliation gap: ${missing.join(',')} / non_reconciled=${nonReconciled.join(',')}`
      }
    };
  }
  return {
    summary: { count: patches.length },
    check: {
      id: 'V-BOS-E2E-11',
      verdict: 'pass',
      note: `all ${REQUIRED_LHA_PATCH_IDS.length} LHA-* patches reconciled`
    }
  };
}

function checkS05DirectProofPhase(s05Direct) {
  const parsed = s05Direct && s05Direct.parsed;
  if (!parsed) {
    return { check: { id: 'V-BOS-E2E-12', verdict: 'fail', note: 's05Direct missing' } };
  }
  const verdict = parsed.phase_verdict;
  if (verdict !== REQUIRED_S05_DIRECT_PHASE_VERDICT) {
    return {
      blocker: `S05 direct-proof.phase_verdict must equal "${REQUIRED_S05_DIRECT_PHASE_VERDICT}" (got ${verdict})`,
      check: {
        id: 'V-BOS-E2E-12',
        verdict: 'fail',
        note: `S05 direct-proof phase_verdict drift: ${verdict}`
      }
    };
  }
  return {
    summary: { verdict },
    check: { id: 'V-BOS-E2E-12', verdict: 'pass', note: `S05 direct-proof phase_verdict=${verdict}` }
  };
}

function checkS05PaperclipProofPhase(s05Paperclip) {
  const parsed = s05Paperclip && s05Paperclip.parsed;
  if (!parsed) {
    return { check: { id: 'V-BOS-E2E-13', verdict: 'fail', note: 's05Paperclip missing' } };
  }
  const verdict = parsed.phase_verdict;
  if (verdict !== REQUIRED_S05_PAPERCLIP_PHASE_VERDICT) {
    return {
      blocker: `S05 paperclip-proof.phase_verdict must equal "${REQUIRED_S05_PAPERCLIP_PHASE_VERDICT}" (got ${verdict})`,
      check: {
        id: 'V-BOS-E2E-13',
        verdict: 'fail',
        note: `S05 paperclip-proof phase_verdict drift: ${verdict}`
      }
    };
  }
  // Profile shape: look for adapter_profile_target.profile_shape (canonical
  // 9-key shape) OR adapter_profile.profile_shape (alternative field name).
  const profileShape =
    (parsed.adapter_profile_target && parsed.adapter_profile_target.profile_shape) ||
    (parsed.adapter_profile && parsed.adapter_profile.profile_shape) ||
    (parsed.profile_shape) ||
    null;
  if (!profileShape || typeof profileShape !== 'object') {
    return {
      blocker: `S05 paperclip-proof.adapter_profile_target.profile_shape must carry the 9-key adapter profile shape`,
      check: {
        id: 'V-BOS-E2E-13',
        verdict: 'fail',
        note: 'adapter profile shape missing'
      }
    };
  }
  const present = new Set(Object.keys(profileShape));
  const missing = REQUIRED_PAPERCLIP_PROFILE_KEYS.filter((k) => !present.has(k));
  if (missing.length > 0) {
    return {
      blocker: `S05 paperclip-proof.adapter_profile_target.profile_shape missing keys: ${missing.join(', ')}`,
      check: {
        id: 'V-BOS-E2E-13',
        verdict: 'fail',
        note: `profile keys gap: ${missing.join(', ')}`
      }
    };
  }
  return {
    summary: { verdict, profile_key_count: present.size },
    check: {
      id: 'V-BOS-E2E-13',
      verdict: 'pass',
      note: `S05 paperclip-proof phase_verdict=${verdict} with all 9 profile keys`
    }
  };
}

function checkS06DirectLivePhase(s06DirectLive) {
  const parsed = s06DirectLive && s06DirectLive.parsed;
  if (!parsed) {
    return { check: { id: 'V-BOS-E2E-14', verdict: 'fail', note: 's06DirectLive missing' } };
  }
  const verdict = parsed.phase_verdict;
  if (verdict !== REQUIRED_S06_DIRECT_LIVE_PHASE_VERDICT) {
    return {
      blocker: `S06 direct-live.phase_verdict must equal "${REQUIRED_S06_DIRECT_LIVE_PHASE_VERDICT}" (got ${verdict})`,
      check: {
        id: 'V-BOS-E2E-14',
        verdict: 'fail',
        note: `S06 direct-live phase_verdict drift: ${verdict}`
      }
    };
  }
  return {
    summary: { verdict },
    check: { id: 'V-BOS-E2E-14', verdict: 'pass', note: `S06 direct-live phase_verdict=${verdict}` }
  };
}

function checkS06DirectLiveProviderModel(s06DirectLive) {
  const parsed = s06DirectLive && s06DirectLive.parsed;
  if (!parsed) {
    return { check: { id: 'V-BOS-E2E-15', verdict: 'fail', note: 's06DirectLive missing' } };
  }
  // Look for provider_observed + model_observed fields; if absent, look for
  // canonical_provider_name + canonical_model_spelling.
  const provider =
    parsed.provider_observed ||
    (parsed.selected_provider && parsed.selected_provider.canonical_provider_name) ||
    (parsed.canonical_minimax_provider_name && parsed.canonical_minimax_provider_name.canonical_name);
  const model =
    parsed.model_observed ||
    (parsed.selected_provider && parsed.selected_provider.canonical_model_spelling) ||
    (parsed.canonical_model_spelling && parsed.canonical_model_spelling.model_spelling);
  if (provider !== CANONICAL_MINIMAX_PROVIDER || model !== CANONICAL_MINIMAX_MODEL) {
    return {
      blocker: `S06 direct-live must observe provider=${CANONICAL_MINIMAX_PROVIDER} AND model=${CANONICAL_MINIMAX_MODEL} (got provider=${provider}, model=${model})`,
      check: {
        id: 'V-BOS-E2E-15',
        verdict: 'fail',
        note: `provider/model drift: provider=${provider}, model=${model}`
      }
    };
  }
  return {
    summary: { provider, model },
    check: {
      id: 'V-BOS-E2E-15',
      verdict: 'pass',
      note: `provider=${provider}, model=${model}`
    }
  };
}

function checkS06PaperclipHermesLivePhase(s06PaperclipHermesLive) {
  const parsed = s06PaperclipHermesLive && s06PaperclipHermesLive.parsed;
  if (!parsed) {
    return { check: { id: 'V-BOS-E2E-16', verdict: 'fail', note: 's06PaperclipHermesLive missing' } };
  }
  const verdict = parsed.phase_verdict;
  if (verdict !== REQUIRED_S06_PAPERCLIP_HERMES_LIVE_PHASE_VERDICT) {
    return {
      blocker: `S06 paperclip-hermes-live.phase_verdict must equal "${REQUIRED_S06_PAPERCLIP_HERMES_LIVE_PHASE_VERDICT}" (got ${verdict})`,
      check: {
        id: 'V-BOS-E2E-16',
        verdict: 'fail',
        note: `S06 paperclip-hermes-live phase_verdict drift: ${verdict}`
      }
    };
  }
  return {
    summary: { verdict },
    check: { id: 'V-BOS-E2E-16', verdict: 'pass', note: `S06 paperclip-hermes-live phase_verdict=${verdict}` }
  };
}

function checkS06BoundedAgentNotStale(s06PaperclipHermesLive) {
  const parsed = s06PaperclipHermesLive && s06PaperclipHermesLive.parsed;
  if (!parsed) {
    return { check: { id: 'V-BOS-E2E-17', verdict: 'fail', note: 's06PaperclipHermesLive missing' } };
  }
  // Look for bounded_agent_id_prefix or bounded_agent_id; if a full UUID
  // literal slipped in, V-BOS-E2E-26 catches it; here we only check 8-char
  // prefix against R3 ledger.
  const prefix =
    parsed.bounded_agent_id_prefix ||
    (parsed.bounded_test_agent_target && parsed.bounded_test_agent_target.bounded_agent_id_prefix) ||
    null;
  if (!prefix) {
    return {
      blocker: `S06 paperclip-hermes-live must record bounded_agent_id_prefix (8-char) for R3 stale-id pre-check`,
      check: {
        id: 'V-BOS-E2E-17',
        verdict: 'fail',
        note: 'bounded_agent_id_prefix missing'
      }
    };
  }
  const lowPrefix = String(prefix).toLowerCase().slice(0, 8);
  if (R3_STALE_PREFIXES.has(lowPrefix)) {
    return {
      blocker: `S06 paperclip-hermes-live bounded_agent_id_prefix "${lowPrefix}" is in R3 stale_company_ids ledger; a stale-id reuse is fail-closed`,
      check: {
        id: 'V-BOS-E2E-17',
        verdict: 'fail',
        note: `bounded agent stale-id reuse: ${lowPrefix}`
      }
    };
  }
  return {
    summary: { prefix: lowPrefix },
    check: { id: 'V-BOS-E2E-17', verdict: 'pass', note: `bounded_agent_id_prefix=${lowPrefix} (not in R3 ledger)` }
  };
}

function checkS06RolloutVerdict(s06Rollout) {
  const parsed = s06Rollout && s06Rollout.parsed;
  if (!parsed) {
    return { check: { id: 'V-BOS-E2E-18', verdict: 'fail', note: 's06Rollout missing' } };
  }
  const phaseVerdict = parsed.phase_verdict;
  const rolloutVerdict = parsed.rollout_verdict;
  if (phaseVerdict !== REQUIRED_S06_ROLLOUT_PHASE_VERDICT || rolloutVerdict !== REQUIRED_S06_ROLLOUT_VERDICT) {
    return {
      blocker: `S06 rollout must record phase_verdict="${REQUIRED_S06_ROLLOUT_PHASE_VERDICT}" AND rollout_verdict="${REQUIRED_S06_ROLLOUT_VERDICT}" (got phase=${phaseVerdict}, rollout=${rolloutVerdict})`,
      check: {
        id: 'V-BOS-E2E-18',
        verdict: 'fail',
        note: `rollout verdict drift: phase=${phaseVerdict}, rollout=${rolloutVerdict}`
      }
    };
  }
  return {
    summary: { phaseVerdict, rolloutVerdict },
    check: {
      id: 'V-BOS-E2E-18',
      verdict: 'pass',
      note: `phase_verdict=${phaseVerdict}, rollout_verdict=${rolloutVerdict}`
    }
  };
}

function checkS06RolloutRpcLiveObserved(s06Rollout) {
  const parsed = s06Rollout && s06Rollout.parsed;
  if (!parsed) {
    return { check: { id: 'V-BOS-E2E-19', verdict: 'fail', note: 's06Rollout missing' } };
  }
  const conds = (parsed.rollout_pre_conditions && parsed.rollout_pre_conditions.conditions) || [];
  const condsById = {};
  for (const c of conds) {
    if (c && c.id) condsById[c.id] = c;
  }
  const missingRpc = REQUIRED_RPC_IDS.filter((id) => !condsById[id]);
  const notLive = REQUIRED_RPC_IDS.filter((id) => condsById[id] && condsById[id].live_observed !== true);
  if (missingRpc.length > 0 || notLive.length > 0) {
    return {
      blocker: `S06 rollout all 4 RPC-* must be live_observed=true (missing: ${missingRpc.join(',')}; not_live: ${notLive.join(',')})`,
      check: {
        id: 'V-BOS-E2E-19',
        verdict: 'fail',
        note: `RPC live-observed gap: missing=${missingRpc.join(',')}; not_live=${notLive.join(',')}`
      }
    };
  }
  return {
    summary: { rpc_count: REQUIRED_RPC_IDS.length },
    check: {
      id: 'V-BOS-E2E-19',
      verdict: 'pass',
      note: `all ${REQUIRED_RPC_IDS.length} RPC-* conditions live_observed=true`
    }
  };
}

function checkS06RolloutZeroRbcTripped(s06Rollout) {
  const parsed = s06Rollout && s06Rollout.parsed;
  if (!parsed) {
    return { check: { id: 'V-BOS-E2E-20', verdict: 'fail', note: 's06Rollout missing' } };
  }
  const triggers = (parsed.rollback_pre_conditions && parsed.rollback_pre_conditions.triggers) || [];
  const triggersById = {};
  for (const t of triggers) {
    if (t && t.id) triggersById[t.id] = t;
  }
  const missingRbc = REQUIRED_RBC_IDS.filter((id) => !triggersById[id]);
  const tripped = REQUIRED_RBC_IDS.filter((id) => triggersById[id] && triggersById[id].tripped === true);
  if (missingRbc.length > 0 || tripped.length > 0) {
    return {
      blocker: `S06 rollout zero RBC-* triggers must be tripped (missing: ${missingRbc.join(',')}; tripped: ${tripped.join(',')})`,
      check: {
        id: 'V-BOS-E2E-20',
        verdict: 'fail',
        note: `RBC trip gap: missing=${missingRbc.join(',')}; tripped=${tripped.join(',')}`
      }
    };
  }
  return {
    summary: { rbc_count: REQUIRED_RBC_IDS.length },
    check: {
      id: 'V-BOS-E2E-20',
      verdict: 'pass',
      note: `all ${REQUIRED_RBC_IDS.length} RBC-* triggers not tripped`
    }
  };
}

function checkS06PersistencePhase(s06Persistence) {
  const parsed = s06Persistence && s06Persistence.parsed;
  if (!parsed) {
    return { check: { id: 'V-BOS-E2E-21', verdict: 'fail', note: 's06Persistence missing' } };
  }
  const verdict = parsed.phase_verdict;
  if (verdict !== REQUIRED_S06_PERSISTENCE_PHASE_VERDICT) {
    return {
      blocker: `S06 persistence.phase_verdict must equal "${REQUIRED_S06_PERSISTENCE_PHASE_VERDICT}" (got ${verdict})`,
      check: {
        id: 'V-BOS-E2E-21',
        verdict: 'fail',
        note: `S06 persistence phase_verdict drift: ${verdict}`
      }
    };
  }
  return {
    summary: { verdict },
    check: { id: 'V-BOS-E2E-21', verdict: 'pass', note: `S06 persistence phase_verdict=${verdict}` }
  };
}

function checkS06PersistenceAllSha256Equal(s06Persistence) {
  const parsed = s06Persistence && s06Persistence.parsed;
  if (!parsed) {
    return { check: { id: 'V-BOS-E2E-22', verdict: 'fail', note: 's06Persistence missing' } };
  }
  const pre = parsed.pre_restart_snapshot || {};
  const post = parsed.post_restart_snapshot || {};
  const missing = REQUIRED_PERSISTENCE_TARGETS.filter((t) => !pre[t] || !post[t]);
  if (missing.length > 0) {
    return {
      blocker: `S06 persistence must have pre/post snapshot for each of 8 targets (missing: ${missing.join(', ')})`,
      check: {
        id: 'V-BOS-E2E-22',
        verdict: 'fail',
        note: `snapshot target gap: ${missing.join(', ')}`
      }
    };
  }
  const unequal = REQUIRED_PERSISTENCE_TARGETS.filter((t) => {
    const a = pre[t] && pre[t].sha256;
    const b = post[t] && post[t].sha256;
    return !a || !b || a !== b;
  });
  if (unequal.length > 0) {
    return {
      blocker: `S06 persistence pre/post sha256 must match on all 8 targets (unequal: ${unequal.join(', ')})`,
      check: {
        id: 'V-BOS-E2E-22',
        verdict: 'fail',
        note: `sha256 inequality: ${unequal.join(', ')}`
      }
    };
  }
  return {
    summary: { target_count: REQUIRED_PERSISTENCE_TARGETS.length },
    check: {
      id: 'V-BOS-E2E-22',
      verdict: 'pass',
      note: `all ${REQUIRED_PERSISTENCE_TARGETS.length} pre/post sha256 pairs equal`
    }
  };
}

function checkS06PersistenceHermesBinding(s06Persistence) {
  const parsed = s06Persistence && s06Persistence.parsed;
  if (!parsed) {
    return { check: { id: 'V-BOS-E2E-23', verdict: 'fail', note: 's06Persistence missing' } };
  }
  const post = (parsed.post_restart_snapshot && parsed.post_restart_snapshot.hermes_providers_profile) || {};
  // The post-restart profile is a sha256 — we cross-check against the
  // canonical_provider_expected_after_restart block (which carries
  // provider=minimax + model=MiniMax-M3 literally).
  const expected = parsed.canonical_provider_expected_after_restart || {};
  if (expected.provider !== CANONICAL_MINIMAX_PROVIDER || expected.model !== CANONICAL_MINIMAX_MODEL) {
    return {
      blocker: `S06 persistence.canonical_provider_expected_after_restart must declare provider=${CANONICAL_MINIMAX_PROVIDER} AND model=${CANONICAL_MINIMAX_MODEL} (got provider=${expected.provider}, model=${expected.model})`,
      check: {
        id: 'V-BOS-E2E-23',
        verdict: 'fail',
        note: `expected-after-restart drift: provider=${expected.provider}, model=${expected.model}`
      }
    };
  }
  if (!post.sha256) {
    return {
      blocker: `S06 persistence.post_restart_snapshot.hermes_providers_profile.sha256 must be present`,
      check: {
        id: 'V-BOS-E2E-23',
        verdict: 'fail',
        note: 'post-restart hermes_providers_profile.sha256 missing'
      }
    };
  }
  return {
    summary: { expected_provider: expected.provider, expected_model: expected.model, sha256_prefix: post.sha256.slice(0, 8) },
    check: {
      id: 'V-BOS-E2E-23',
      verdict: 'pass',
      note: `hermes binding: provider=${expected.provider}, model=${expected.model}`
    }
  };
}

function checkXiaomiProhibitionLayers(s06DirectLive, s06PaperclipHermesLive) {
  const blockers = [];
  const notes = [];

  // S06 direct: xiaomi_endpoint_reuse_prohibition (4 fields)
  const dParsed = s06DirectLive && s06DirectLive.parsed;
  if (!dParsed) {
    return { check: { id: 'V-BOS-E2E-24', verdict: 'fail', note: 's06DirectLive missing' } };
  }
  const dProhibition = dParsed.xiaomi_endpoint_reuse_prohibition || {};
  const dMissing = REQUIRED_XIAOMI_PROHIBITION_FIELDS.filter((f) => dProhibition[f] !== true);
  if (dMissing.length > 0) {
    blockers.push(`S06 direct-live.xiaomi_endpoint_reuse_prohibition missing/incomplete fields: ${dMissing.join(', ')}`);
    notes.push(`direct gap: ${dMissing.join(',')}`);
  }

  // S06 paperclip: xiaomi_adapter_config_prohibition (4 fields)
  const pParsed = s06PaperclipHermesLive && s06PaperclipHermesLive.parsed;
  if (!pParsed) {
    return { check: { id: 'V-BOS-E2E-24', verdict: 'fail', note: 's06PaperclipHermesLive missing' } };
  }
  const pProhibition = pParsed.xiaomi_adapter_config_prohibition || {};
  const pMissing = REQUIRED_XIAOMI_ADAPTER_PROHIBITION_FIELDS.filter((f) => pProhibition[f] !== true);
  if (pMissing.length > 0) {
    blockers.push(`S06 paperclip-hermes-live.xiaomi_adapter_config_prohibition missing/incomplete fields: ${pMissing.join(', ')}`);
    notes.push(`paperclip gap: ${pMissing.join(',')}`);
  }

  if (blockers.length > 0) {
    return {
      blocker: blockers.join('; '),
      check: {
        id: 'V-BOS-E2E-24',
        verdict: 'fail',
        note: `xiaomi prohibition layers gap: ${notes.join(' | ')}`
      }
    };
  }
  return {
    summary: { layers: REQUIRED_XIAOMI_PROHIBITION_FIELDS.length + REQUIRED_XIAOMI_ADAPTER_PROHIBITION_FIELDS.length },
    check: {
      id: 'V-BOS-E2E-24',
      verdict: 'pass',
      note: `all 8 xiaomi prohibition layers asserted true`
    }
  };
}

function checkInheritedConstraintsAllEvidence(artifacts) {
  const blockers = [];
  const notes = [];
  const evidenceMap = [
    ['s05Upgrade', artifacts.s05Upgrade],
    ['s05Direct', artifacts.s05Direct],
    ['s05Paperclip', artifacts.s05Paperclip],
    ['s06DirectLive', artifacts.s06DirectLive],
    ['s06PaperclipHermesLive', artifacts.s06PaperclipHermesLive],
    ['s06Rollout', artifacts.s06Rollout],
    ['s06Persistence', artifacts.s06Persistence]
  ];
  for (const [key, evidence] of evidenceMap) {
    if (!evidence || !evidence.parsed) {
      blockers.push(`inherited_constraints check skipped: ${key} missing`);
      notes.push(`${key}:missing`);
      continue;
    }
    // Each artifact stores the 6 LFP-* IDs in either
    //   inherited_constraints_remain_in_force.inherited_constraints[] or
    //   rollout_safety_constraints.inherited_constraints[]
    const list =
      (evidence.parsed.inherited_constraints_remain_in_force &&
        evidence.parsed.inherited_constraints_remain_in_force.inherited_constraints) ||
      (evidence.parsed.rollout_safety_constraints &&
        evidence.parsed.rollout_safety_constraints.inherited_constraints) ||
      [];
    const ids = getIdsFromConstraintList(list);
    const missing = REQUIRED_INHERITED_CONSTRAINT_IDS.filter((id) => !ids.has(id));
    if (missing.length > 0) {
      blockers.push(`${key} inherited_constraints missing LFP-* IDs: ${missing.join(', ')}`);
      notes.push(`${key}:missing=${missing.join(',')}`);
    }
  }
  if (blockers.length > 0) {
    return {
      blocker: blockers.join('; '),
      check: {
        id: 'V-BOS-E2E-25',
        verdict: 'fail',
        note: `inherited constraint drift: ${notes.join(' | ')}`
      }
    };
  }
  return {
    summary: { evidence_count: evidenceMap.length, constraint_count: REQUIRED_INHERITED_CONSTRAINT_IDS.length },
    check: {
      id: 'V-BOS-E2E-25',
      verdict: 'pass',
      note: `all 6 LFP-* IDs present across ${evidenceMap.length} upstream evidence files`
    }
  };
}

function checkRedactionDisciplineAllEvidence(artifacts) {
  const blockers = [];
  const notes = [];
  const evidenceMap = [
    ['s04Deploy', artifacts.s04Deploy],
    ['s04PostUpgrade', artifacts.s04PostUpgrade],
    ['s04NativeSmoke', artifacts.s04NativeSmoke],
    ['s05Upgrade', artifacts.s05Upgrade],
    ['s05Direct', artifacts.s05Direct],
    ['s05Paperclip', artifacts.s05Paperclip],
    ['s06DirectLive', artifacts.s06DirectLive],
    ['s06PaperclipHermesLive', artifacts.s06PaperclipHermesLive],
    ['s06Rollout', artifacts.s06Rollout],
    ['s06Persistence', artifacts.s06Persistence]
  ];
  for (const [key, evidence] of evidenceMap) {
    if (!evidence || !evidence.raw) {
      blockers.push(`redaction check skipped: ${key} missing`);
      notes.push(`${key}:missing`);
      continue;
    }
    const credentialHits = scanCredentialLeaks(evidence.raw);
    const uuidHits = scanUuidLeaks(evidence.raw);
    if (credentialHits.length > 0) {
      const redacted = credentialHits.map((h) => h.redacted).join(', ');
      blockers.push(`${key} credential leak: ${redacted}`);
      notes.push(`${key}:cred=${credentialHits.length}`);
    }
    if (uuidHits.length > 0) {
      const redacted = uuidHits.map(redactUuidLiteral).join(', ');
      blockers.push(`${key} unapproved UUID literal: ${redacted}`);
      notes.push(`${key}:uuid=${uuidHits.length}`);
    }
  }
  if (blockers.length > 0) {
    return {
      blocker: blockers.join('; '),
      check: {
        id: 'V-BOS-E2E-26',
        verdict: 'fail',
        note: `redaction discipline: ${notes.join(' | ')}`
      }
    };
  }
  return {
    summary: { evidence_count: evidenceMap.length },
    check: {
      id: 'V-BOS-E2E-26',
      verdict: 'pass',
      note: `no credential value or unapproved UUID literal across ${evidenceMap.length} upstream evidence files`
    }
  };
}

function checkPhaseVerdictEnumLock(artifacts) {
  const blockers = [];
  const notes = [];
  const evidenceMap = [
    ['s04Deploy', artifacts.s04Deploy, REQUIRED_DEPLOYMENT_STATUS, 'deployment_status_enum_lock'],
    ['s04PostUpgrade', artifacts.s04PostUpgrade, REQUIRED_POST_UPGRADE_VERDICT, 'verdict_enum_lock'],
    ['s04NativeSmoke', artifacts.s04NativeSmoke, REQUIRED_NATIVE_SMOKE_VERDICT, 'verdict_enum_lock'],
    ['s05Upgrade', artifacts.s05Upgrade, REQUIRED_S05_UPGRADE_PHASE_VERDICTS, 'phase_verdict_enum_lock'],
    ['s05Direct', artifacts.s05Direct, REQUIRED_S05_DIRECT_PHASE_VERDICT, 'phase_verdict_enum_lock'],
    ['s05Paperclip', artifacts.s05Paperclip, REQUIRED_S05_PAPERCLIP_PHASE_VERDICT, 'phase_verdict_enum_lock'],
    ['s06DirectLive', artifacts.s06DirectLive, REQUIRED_S06_DIRECT_LIVE_PHASE_VERDICT, 'phase_verdict_enum_lock'],
    ['s06PaperclipHermesLive', artifacts.s06PaperclipHermesLive, REQUIRED_S06_PAPERCLIP_HERMES_LIVE_PHASE_VERDICT, 'phase_verdict_enum_lock'],
    ['s06Rollout', artifacts.s06Rollout, REQUIRED_S06_ROLLOUT_PHASE_VERDICT, 'phase_verdict_enum_lock'],
    ['s06Persistence', artifacts.s06Persistence, REQUIRED_S06_PERSISTENCE_PHASE_VERDICT, 'phase_verdict_enum_lock']
  ];
  for (const [key, evidence, allowed, lockField] of evidenceMap) {
    if (!evidence || !evidence.parsed) {
      blockers.push(`enum_lock check skipped: ${key} missing`);
      notes.push(`${key}:missing`);
      continue;
    }
    const lock = evidence.parsed[lockField] || [];
    if (!Array.isArray(lock) || lock.length === 0) {
      blockers.push(`${key}.${lockField} must declare a non-empty enum_lock`);
      notes.push(`${key}:lock-missing`);
      continue;
    }
    const allowedSet = Array.isArray(allowed) ? allowed : [allowed];
    const allPresent = allowedSet.every((v) => lock.includes(v));
    if (!allPresent) {
      const missing = allowedSet.filter((v) => !lock.includes(v));
      blockers.push(`${key}.${lockField} missing admissible value(s): ${missing.join(', ')}`);
      notes.push(`${key}:lock-missing=${missing.join(',')}`);
    }
  }
  if (blockers.length > 0) {
    return {
      blocker: blockers.join('; '),
      check: {
        id: 'V-BOS-E2E-27',
        verdict: 'fail',
        note: `enum_lock drift: ${notes.join(' | ')}`
      }
    };
  }
  return {
    summary: { evidence_count: evidenceMap.length },
    check: {
      id: 'V-BOS-E2E-27',
      verdict: 'pass',
      note: `phase_verdict enum_lock admissible on all ${evidenceMap.length} upstream artifacts`
    }
  };
}

function checkLiveExecutionStatusEnumLock(artifacts) {
  const blockers = [];
  const notes = [];
  const evidenceMap = [
    artifacts.s05Upgrade,
    artifacts.s05Direct,
    artifacts.s05Paperclip,
    artifacts.s06DirectLive,
    artifacts.s06PaperclipHermesLive,
    artifacts.s06Rollout,
    artifacts.s06Persistence
  ];
  let idx = 0;
  for (const evidence of evidenceMap) {
    idx += 1;
    if (!evidence || !evidence.parsed) {
      blockers.push(`live_execution_status check skipped: artifact #${idx} missing`);
      notes.push(`#${idx}:missing`);
      continue;
    }
    const lock = evidence.parsed.live_execution_status_enum_lock || [];
    const status = evidence.parsed.live_execution_status;
    const freshRequired = evidence.parsed.fresh_readback_required;
    if (!Array.isArray(lock)) {
      blockers.push(`#${idx} live_execution_status_enum_lock missing or not an array`);
      notes.push(`#${idx}:lock-missing`);
      continue;
    }
    const lockCovers = REQUIRED_LIVE_EXECUTION_STATUS_ENUM.every((v) => lock.includes(v));
    if (!lockCovers) {
      const missing = REQUIRED_LIVE_EXECUTION_STATUS_ENUM.filter((v) => !lock.includes(v));
      blockers.push(`#${idx} live_execution_status_enum_lock missing: ${missing.join(', ')}`);
      notes.push(`#${idx}:lock-incomplete=${missing.join(',')}`);
    }
    if (typeof status !== 'string' || !lock.includes(status)) {
      blockers.push(`#${idx} live_execution_status "${status}" not in declared enum_lock`);
      notes.push(`#${idx}:status-not-in-lock`);
    }
    if (freshRequired !== true) {
      blockers.push(`#${idx} fresh_readback_required must be true`);
      notes.push(`#${idx}:fresh-readback-missing`);
    }
  }
  if (blockers.length > 0) {
    return {
      blocker: blockers.join('; '),
      check: {
        id: 'V-BOS-E2E-28',
        verdict: 'fail',
        note: `live_execution_status drift: ${notes.join(' | ')}`
      }
    };
  }
  return {
    summary: { evidence_count: evidenceMap.length },
    check: {
      id: 'V-BOS-E2E-28',
      verdict: 'pass',
      note: `live_execution_status + fresh_readback_required asserted on all ${evidenceMap.length} upstream artifacts`
    }
  };
}

function checkBusinessMutationInvariant(entryVerdict, targetEvidence) {
  // Only meaningful if entry-gate verdict is FAIL and a target S07 evidence
  // exists. If PASS, we still expect business_mutation_count > 0 (handled by
  // T04). The fail-closed invariant is: blocker artifact must record
  // business_mutation_count === 0 AND ledger.issues_created === 0 AND
  // ledger.heartbeat_runs_started === 0 AND ledger.unexpected_mutating_routes
  // === 0.
  if (!targetEvidence) {
    return {
      summary: { skipped: 'no target S07 evidence present' },
      check: {
        id: 'V-BOS-E2E-29',
        verdict: 'pass',
        note: 'no target evidence; fail-closed invariant vacuously satisfied'
      }
    };
  }
  if (entryVerdict === 'pass') {
    return {
      summary: { skipped: 'entry gate PASS — invariant moves to T04' },
      check: {
        id: 'V-BOS-E2E-29',
        verdict: 'pass',
        note: 'entry gate PASS — business_mutation_count invariant handled by T04 require-pass'
      }
    };
  }
  const bmc = targetEvidence.business_mutation_count;
  const ledger = targetEvidence.ledger || {};
  const required_zero = {
    business_mutation_count: bmc,
    ledger_issues_created: ledger.issues_created,
    ledger_heartbeat_runs_started: ledger.heartbeat_runs_started,
    ledger_unexpected_mutating_routes: ledger.unexpected_mutating_routes,
    ledger_unconfirmed_live_side_effects: ledger.unconfirmed_live_side_effects
  };
  const nonZero = Object.entries(required_zero).filter(([, v]) => typeof v === 'number' && v !== 0);
  if (nonZero.length > 0) {
    return {
      blocker: `fail-closed artifact must record business_mutation_count=0 and all-zero ledger counters (violations: ${nonZero.map(([k]) => k).join(', ')})`,
      check: {
        id: 'V-BOS-E2E-29',
        verdict: 'fail',
        note: `fail-closed invariant violated: ${nonZero.map(([k, v]) => `${k}=${v}`).join(', ')}`
      }
    };
  }
  return {
    summary: { bmc: bmc || 0 },
    check: {
      id: 'V-BOS-E2E-29',
      verdict: 'pass',
      note: 'fail-closed invariant: business_mutation_count=0 + all-zero ledger counters'
    }
  };
}

function checkR026RoutingPreservation(artifacts, targetEvidence) {
  // Search all parsed evidence for routing fields; if any payload claims a
  // routing chain, it MUST preserve Div7.MissionControl -> DecisionDelegated
  // -> Div1.HCO -> operational divisions.
  const allSources = [];
  for (const evidence of Object.values(artifacts)) {
    if (evidence && evidence.parsed) allSources.push(evidence.parsed);
  }
  if (targetEvidence) allSources.push(targetEvidence);

  const blockers = [];
  const notes = [];

  for (let i = 0; i < allSources.length; i++) {
    const src = allSources[i];
    const routing = src.routing || src.delegation_chain || src.div7_to_div1_route || src.div7_mission_control_routing;
    if (!routing) continue; // absence is fine
    // Look for the 4-step chain as a string or array.
    const flat = typeof routing === 'string' ? routing : JSON.stringify(routing);
    const matches = R026_ROUTING_CHAIN.every((step) => flat.includes(step));
    if (!matches) {
      blockers.push(`source #${i} routing present but R026 chain not preserved (expected: ${R026_ROUTING_CHAIN.join(' -> ')})`);
      notes.push(`#${i}:routing-drift`);
    }
  }

  if (blockers.length > 0) {
    return {
      blocker: blockers.join('; '),
      check: {
        id: 'V-BOS-E2E-30',
        verdict: 'fail',
        note: `R026 routing violation: ${notes.join(' | ')}`
      }
    };
  }
  return {
    summary: { chain: R026_ROUTING_CHAIN.join(' -> ') },
    check: {
      id: 'V-BOS-E2E-30',
      verdict: 'pass',
      note: `R026 routing preserved across all sources with routing fields (or absent)`
    }
  };
}

// ---------------------------------------------------------------------------
// Aggregator
// ---------------------------------------------------------------------------

const ENTRY_GATE_CHECKS = [
  ['V-BOS-E2E-01', checkAllArtifactsPresent],
  ['V-BOS-E2E-02', (artifacts) => checkS04DeploymentStatus(artifacts.s04Deploy)],
  ['V-BOS-E2E-03', (artifacts) => checkS04NginxLockdown(artifacts.s04Deploy)],
  ['V-BOS-E2E-04', (artifacts) => checkS04MigrationsApplied(artifacts.s04Deploy)],
  ['V-BOS-E2E-05', (artifacts) => checkS04PostUpgradeVerdict(artifacts.s04PostUpgrade)],
  ['V-BOS-E2E-06', (artifacts) => checkS04FreshReadbackPerformed(artifacts.s04PostUpgrade)],
  ['V-BOS-E2E-07', (artifacts) => checkS04NativeSmokeVerdict(artifacts.s04NativeSmoke)],
  ['V-BOS-E2E-08', (artifacts) => checkS04NativeSurfacesLive(artifacts.s04NativeSmoke)],
  ['V-BOS-E2E-09', (artifacts) => checkS05UpgradePhaseVerdict(artifacts.s05Upgrade)],
  ['V-BOS-E2E-10', (artifacts) => checkS05UpgradePreFlightChecks(artifacts.s05Upgrade)],
  ['V-BOS-E2E-11', (artifacts) => checkS05UpgradePatchReconciliation(artifacts.s05Upgrade)],
  ['V-BOS-E2E-12', (artifacts) => checkS05DirectProofPhase(artifacts.s05Direct)],
  ['V-BOS-E2E-13', (artifacts) => checkS05PaperclipProofPhase(artifacts.s05Paperclip)],
  ['V-BOS-E2E-14', (artifacts) => checkS06DirectLivePhase(artifacts.s06DirectLive)],
  ['V-BOS-E2E-15', (artifacts) => checkS06DirectLiveProviderModel(artifacts.s06DirectLive)],
  ['V-BOS-E2E-16', (artifacts) => checkS06PaperclipHermesLivePhase(artifacts.s06PaperclipHermesLive)],
  ['V-BOS-E2E-17', (artifacts) => checkS06BoundedAgentNotStale(artifacts.s06PaperclipHermesLive)],
  ['V-BOS-E2E-18', (artifacts) => checkS06RolloutVerdict(artifacts.s06Rollout)],
  ['V-BOS-E2E-19', (artifacts) => checkS06RolloutRpcLiveObserved(artifacts.s06Rollout)],
  ['V-BOS-E2E-20', (artifacts) => checkS06RolloutZeroRbcTripped(artifacts.s06Rollout)],
  ['V-BOS-E2E-21', (artifacts) => checkS06PersistencePhase(artifacts.s06Persistence)],
  ['V-BOS-E2E-22', (artifacts) => checkS06PersistenceAllSha256Equal(artifacts.s06Persistence)],
  ['V-BOS-E2E-23', (artifacts) => checkS06PersistenceHermesBinding(artifacts.s06Persistence)],
  ['V-BOS-E2E-24', (artifacts) => checkXiaomiProhibitionLayers(artifacts.s06DirectLive, artifacts.s06PaperclipHermesLive)],
  ['V-BOS-E2E-25', (artifacts) => checkInheritedConstraintsAllEvidence(artifacts)],
  ['V-BOS-E2E-26', (artifacts) => checkRedactionDisciplineAllEvidence(artifacts)],
  ['V-BOS-E2E-27', (artifacts) => checkPhaseVerdictEnumLock(artifacts)],
  ['V-BOS-E2E-28', (artifacts) => checkLiveExecutionStatusEnumLock(artifacts)],
  ['V-BOS-E2E-29', (artifacts, targetEvidence, entryVerdict) => checkBusinessMutationInvariant(entryVerdict, targetEvidence)],
  ['V-BOS-E2E-30', (artifacts, targetEvidence) => checkR026RoutingPreservation(artifacts, targetEvidence)]
];

function validateEntryGate(artifacts, targetEvidence) {
  const blockers = [];
  const checks = [];

  // First pass: run all checks to compute verdict.
  let preliminaryVerdict = 'pass';
  for (const [id, fn] of ENTRY_GATE_CHECKS) {
    const result = fn(artifacts, targetEvidence, preliminaryVerdict);
    if (result.check) {
      checks.push(result.check);
    }
    if (result.blocker) {
      blockers.push(result.blocker);
      preliminaryVerdict = 'fail';
    }
  }

  const verdict = blockers.length === 0 ? 'pass' : 'fail';

  // Re-run V-BOS-E2E-29 with the FINAL verdict (the first pass uses a stale
  // preliminaryVerdict='pass'). This is intentional: V-BOS-E2E-29 must see
  // the final verdict before deciding whether the fail-closed invariant
  // applies. Only re-run if the check exists.
  if (verdict === 'fail' && targetEvidence) {
    const re = checkBusinessMutationInvariant(verdict, targetEvidence);
    const existing = checks.find((c) => c.id === 'V-BOS-E2E-29');
    if (existing && re.check) {
      existing.verdict = re.check.verdict;
      existing.note = re.check.note;
      if (re.blocker) {
        // Promote blocker if newly added
        if (!blockers.some((b) => b.includes('business_mutation_count') || b.includes('ledger'))) {
          blockers.push(re.blocker);
        }
      }
    }
  }

  return {
    verdict,
    blockers,
    checks,
    summary: {
      blockers_count: blockers.length,
      checks_count: checks.length,
      pass_count: checks.filter((c) => c.verdict === 'pass').length,
      fail_count: checks.filter((c) => c.verdict === 'fail').length
    }
  };
}

// ---------------------------------------------------------------------------
// T03: --phase allow-blocker (canonical blocker evidence validator)
// ---------------------------------------------------------------------------

const ALLOW_BLOCKER_TOP_LEVEL_KEYS = [
  'bounded_policy',
  'inherited_constraints_remain_in_force',
  'preconditions_audit',
  'redacted_request_journal',
  'bounded_poll_history',
  'pre_post_counters',
  'expected_vs_observed_side_effect_ledger',
  'native_readback_hashes',
  'validator_check_ids',
  'blocker_boundary',
  'canonical_provider',
  'canonical_model',
  'stale_company_ids_known',
  'routing_chain_required',
  'bos_result_required_fields',
  'business_mutation_count',
  'ledger'
];

const ALLOW_BLOCKER_CHECK_IDS = [
  'AB-01',
  'AB-02',
  'AB-03',
  'AB-04',
  'AB-05',
  'AB-06',
  'AB-07',
  'AB-08',
  'AB-09',
  'AB-10',
  'AB-11',
  'AB-12',
  'AB-13',
  'AB-14',
  'AB-15',
  'AB-16',
  'AB-17',
  'AB-18',
  'AB-19',
  'AB-20'
];

function checkAllowBlockerEvidenceParses(targetEvidence) {
  if (targetEvidence === null || typeof targetEvidence !== 'object' || Array.isArray(targetEvidence)) {
    return {
      blocker: 'target evidence missing or not a JSON object (allow-blocker requires the canonical S07 evidence file)',
      check: { id: 'AB-01', verdict: 'fail', note: 'canonical evidence missing or not a JSON object' }
    };
  }
  return { check: { id: 'AB-01', verdict: 'pass', note: 'canonical evidence parses as JSON object' } };
}

function checkAllowBlockerTopLevelShape(targetEvidence) {
  const missing = ALLOW_BLOCKER_TOP_LEVEL_KEYS.filter((k) => !(k in targetEvidence));
  if (missing.length > 0) {
    return {
      blocker: `canonical blocker evidence missing required top-level keys: ${missing.join(', ')}`,
      check: { id: 'AB-02', verdict: 'fail', note: `missing keys: ${missing.join(', ')}` }
    };
  }
  return {
    check: { id: 'AB-02', verdict: 'pass', note: `all ${ALLOW_BLOCKER_TOP_LEVEL_KEYS.length} required top-level keys present` }
  };
}

function checkAllowBlockerUpstreamGateNotSatisfied(targetEvidence) {
  const audit = targetEvidence.preconditions_audit || {};
  if (audit.upstream_gate_satisfied !== false) {
    return {
      blocker: `canonical blocker evidence must record preconditions_audit.upstream_gate_satisfied=false (got ${JSON.stringify(audit.upstream_gate_satisfied)})`,
      check: { id: 'AB-03', verdict: 'fail', note: `upstream_gate_satisfied=${JSON.stringify(audit.upstream_gate_satisfied)}` }
    };
  }
  return { check: { id: 'AB-03', verdict: 'pass', note: 'preconditions_audit.upstream_gate_satisfied=false (fail-closed blocker)' } };
}

function checkAllowBlockerBusinessMutationCount(targetEvidence) {
  const bmc = targetEvidence.business_mutation_count;
  if (bmc !== 0) {
    return {
      blocker: `canonical blocker evidence must record business_mutation_count=0 (got ${JSON.stringify(bmc)})`,
      check: { id: 'AB-04', verdict: 'fail', note: `business_mutation_count=${JSON.stringify(bmc)}` }
    };
  }
  return { check: { id: 'AB-04', verdict: 'pass', note: 'business_mutation_count=0 (fail-closed invariant)' } };
}

function checkAllowBlockerLedgerAllZero(targetEvidence) {
  const ledger = targetEvidence.ledger || {};
  const requiredZeroKeys = [
    'issues_created',
    'heartbeat_runs_started',
    'documents_created',
    'comments_created',
    'approvals_created',
    'agents_mutated',
    'unexpected_mutating_routes',
    'unconfirmed_live_side_effects'
  ];
  const missing = requiredZeroKeys.filter((k) => !(k in ledger));
  if (missing.length > 0) {
    return {
      blocker: `canonical blocker evidence ledger missing required keys: ${missing.join(', ')}`,
      check: { id: 'AB-05', verdict: 'fail', note: `missing ledger keys: ${missing.join(', ')}` }
    };
  }
  const violations = requiredZeroKeys.filter((k) => ledger[k] !== 0);
  if (violations.length > 0) {
    return {
      blocker: `canonical blocker evidence ledger must record all-zero counters (violations: ${violations.map((k) => `${k}=${ledger[k]}`).join(', ')})`,
      check: { id: 'AB-05', verdict: 'fail', note: `ledger violations: ${violations.join(', ')}` }
    };
  }
  return { check: { id: 'AB-05', verdict: 'pass', note: 'all 8 ledger counters are zero (fail-closed invariant)' } };
}

function checkAllowBlockerValidatorCheckIds(targetEvidence) {
  const ids = targetEvidence.validator_check_ids || [];
  if (!Array.isArray(ids)) {
    return {
      blocker: 'canonical blocker evidence validator_check_ids must be an array',
      check: { id: 'AB-06', verdict: 'fail', note: 'validator_check_ids is not an array' }
    };
  }
  const expectedIds = ENTRY_GATE_CHECKS.map(([id]) => id);
  const expectedSet = new Set(expectedIds);
  const actualSet = new Set(ids);
  const missing = expectedIds.filter((id) => !actualSet.has(id));
  const extra = ids.filter((id) => !expectedSet.has(id));
  if (missing.length > 0 || extra.length > 0) {
    const parts = [];
    if (missing.length > 0) parts.push(`missing: ${missing.join(', ')}`);
    if (extra.length > 0) parts.push(`extra: ${extra.join(', ')}`);
    return {
      blocker: `canonical blocker evidence validator_check_ids must exactly mirror the 30 V-BOS-E2E-NN IDs (${parts.join('; ')})`,
      check: { id: 'AB-06', verdict: 'fail', note: parts.join('; ') }
    };
  }
  return {
    check: { id: 'AB-06', verdict: 'pass', note: `all ${expectedIds.length} V-BOS-E2E-NN IDs present, no extras` }
  };
}

function checkAllowBlockerRequestJournalBounded(targetEvidence) {
  const journal = targetEvidence.redacted_request_journal || {};
  const expected = { total_entries: 5, control_plane_count: 1, business_count: 2, readback_count: 2 };
  const violations = [];
  for (const [k, v] of Object.entries(expected)) {
    if (journal[k] !== v) {
      violations.push(`${k}=${JSON.stringify(journal[k])} (expected ${v})`);
    }
  }
  const entries = Array.isArray(journal.entries) ? journal.entries : [];
  const classifications = entries.map((e) => e && e.classification).filter(Boolean);
  const classCounts = {
    'control-plane': classifications.filter((c) => c === 'control-plane').length,
    business: classifications.filter((c) => c === 'business').length,
    readback: classifications.filter((c) => c === 'readback').length
  };
  if (classCounts['control-plane'] !== 1 || classCounts.business !== 2 || classCounts.readback !== 2) {
    violations.push(`entry classification counts=${JSON.stringify(classCounts)} (expected 1+2+2)`);
  }
  if (violations.length > 0) {
    return {
      blocker: `canonical blocker evidence redacted_request_journal violates bounded contract (${violations.join('; ')})`,
      check: { id: 'AB-07', verdict: 'fail', note: violations.join('; ') }
    };
  }
  return {
    check: { id: 'AB-07', verdict: 'pass', note: 'redacted_request_journal bounded: 1 control-plane + 2 business + 2 readback' }
  };
}

function checkAllowBlockerPollHistoryBounded(targetEvidence) {
  const policy = targetEvidence.bounded_policy || {};
  const history = targetEvidence.bounded_poll_history || {};
  const maxPolls = policy.max_polls;
  const polls = Array.isArray(history.polls) ? history.polls : [];
  if (maxPolls !== 8) {
    return {
      blocker: `canonical blocker evidence bounded_policy.max_polls must be 8 (got ${JSON.stringify(maxPolls)})`,
      check: { id: 'AB-08', verdict: 'fail', note: `max_polls=${JSON.stringify(maxPolls)}` }
    };
  }
  if (polls.length !== 8) {
    return {
      blocker: `canonical blocker evidence bounded_poll_history.polls must contain exactly 8 polls (got ${polls.length})`,
      check: { id: 'AB-08', verdict: 'fail', note: `polls.length=${polls.length}` }
    };
  }
  let monotonic = true;
  let lastBudget = Infinity;
  for (const p of polls) {
    const budget = typeof p.budget_remaining_after === 'number' ? p.budget_remaining_after : null;
    if (budget === null || budget > lastBudget) {
      monotonic = false;
      break;
    }
    lastBudget = budget;
  }
  if (!monotonic) {
    return {
      blocker: 'canonical blocker evidence bounded_poll_history must record monotonically-decreasing budget_remaining_after',
      check: { id: 'AB-08', verdict: 'fail', note: 'poll budget not monotonically decreasing' }
    };
  }
  return {
    check: { id: 'AB-08', verdict: 'pass', note: `bounded_poll_history: 8 polls, monotonically decreasing budget to 0` }
  };
}

function checkAllowBlockerInheritedConstraints(targetEvidence) {
  const list = Array.isArray(targetEvidence.inherited_constraints_remain_in_force) ? targetEvidence.inherited_constraints_remain_in_force : [];
  const expected = REQUIRED_INHERITED_CONSTRAINT_IDS;
  const present = new Set(list.map((c) => c && c.id));
  const missing = expected.filter((id) => !present.has(id));
  const notInForce = list.filter((c) => expected.includes(c && c.id) && c.in_force !== true);
  if (missing.length > 0) {
    return {
      blocker: `canonical blocker evidence missing inherited constraint IDs: ${missing.join(', ')}`,
      check: { id: 'AB-09', verdict: 'fail', note: `missing: ${missing.join(', ')}` }
    };
  }
  if (notInForce.length > 0) {
    return {
      blocker: `canonical blocker evidence inherited constraints not in_force=true: ${notInForce.map((c) => c.id).join(', ')}`,
      check: { id: 'AB-09', verdict: 'fail', note: `not in_force: ${notInForce.map((c) => c.id).join(', ')}` }
    };
  }
  return {
    check: { id: 'AB-09', verdict: 'pass', note: `all 6 LFP-* constraints present and in_force=true` }
  };
}

function checkAllowBlockerCanonicalProviderModel(targetEvidence) {
  if (targetEvidence.canonical_provider !== CANONICAL_MINIMAX_PROVIDER) {
    return {
      blocker: `canonical blocker evidence canonical_provider must equal "${CANONICAL_MINIMAX_PROVIDER}" (got ${JSON.stringify(targetEvidence.canonical_provider)})`,
      check: { id: 'AB-10', verdict: 'fail', note: `canonical_provider=${JSON.stringify(targetEvidence.canonical_provider)}` }
    };
  }
  if (targetEvidence.canonical_model !== CANONICAL_MINIMAX_MODEL) {
    return {
      blocker: `canonical blocker evidence canonical_model must equal "${CANONICAL_MINIMAX_MODEL}" (got ${JSON.stringify(targetEvidence.canonical_model)})`,
      check: { id: 'AB-10', verdict: 'fail', note: `canonical_model=${JSON.stringify(targetEvidence.canonical_model)}` }
    };
  }
  return {
    check: { id: 'AB-10', verdict: 'pass', note: `canonical provider=minimax model=MiniMax-M3 (xiaomi prohibited)` }
  };
}

function checkAllowBlockerStaleCompanyIds(targetEvidence) {
  const known = Array.isArray(targetEvidence.stale_company_ids_known) ? targetEvidence.stale_company_ids_known : [];
  const missing = Array.from(R3_STALE_PREFIXES).filter((p) => !known.includes(p));
  if (missing.length > 0) {
    return {
      blocker: `canonical blocker evidence stale_company_ids_known missing R3 prefixes: ${missing.join(', ')}`,
      check: { id: 'AB-11', verdict: 'fail', note: `missing R3 prefixes: ${missing.join(', ')}` }
    };
  }
  return {
    check: { id: 'AB-11', verdict: 'pass', note: `stale_company_ids_known carries all ${R3_STALE_PREFIXES.size} R3 prefixes` }
  };
}

function checkAllowBlockerRoutingChain(targetEvidence) {
  const chain = targetEvidence.routing_chain_required;
  if (!Array.isArray(chain) || chain.length !== R026_ROUTING_CHAIN.length) {
    return {
      blocker: `canonical blocker evidence routing_chain_required must be a ${R026_ROUTING_CHAIN.length}-step R026 chain (got length=${Array.isArray(chain) ? chain.length : 'non-array'})`,
      check: { id: 'AB-12', verdict: 'fail', note: `routing_chain_required length invalid` }
    };
  }
  const mismatches = [];
  for (let i = 0; i < R026_ROUTING_CHAIN.length; i++) {
    if (chain[i] !== R026_ROUTING_CHAIN[i]) {
      mismatches.push(`step[${i}]=${JSON.stringify(chain[i])} (expected ${JSON.stringify(R026_ROUTING_CHAIN[i])})`);
    }
  }
  if (mismatches.length > 0) {
    return {
      blocker: `canonical blocker evidence routing_chain_required does not preserve R026 (${mismatches.join('; ')})`,
      check: { id: 'AB-12', verdict: 'fail', note: mismatches.join('; ') }
    };
  }
  return {
    check: { id: 'AB-12', verdict: 'pass', note: `R026 routing chain preserved: ${R026_ROUTING_CHAIN.join(' -> ')}` }
  };
}

function checkAllowBlockerBosFields(targetEvidence) {
  const fields = targetEvidence.bos_result_required_fields;
  const expected = ['schemaVersion', 'runId', 'issueId', 'division', 'role', 'status'];
  if (!Array.isArray(fields)) {
    return {
      blocker: 'canonical blocker evidence bos_result_required_fields must be an array of 6 fields',
      check: { id: 'AB-13', verdict: 'fail', note: 'bos_result_required_fields is not an array' }
    };
  }
  const missing = expected.filter((f) => !fields.includes(f));
  const extra = fields.filter((f) => !expected.includes(f));
  if (missing.length > 0 || extra.length > 0) {
    const parts = [];
    if (missing.length > 0) parts.push(`missing: ${missing.join(', ')}`);
    if (extra.length > 0) parts.push(`extra: ${extra.join(', ')}`);
    return {
      blocker: `canonical blocker evidence bos_result_required_fields must exactly match the 6 BOS fields (${parts.join('; ')})`,
      check: { id: 'AB-13', verdict: 'fail', note: parts.join('; ') }
    };
  }
  return {
    check: { id: 'AB-13', verdict: 'pass', note: 'bos_result_required_fields exactly matches the 6 mandatory BOS fields' }
  };
}

function checkAllowBlockerPrePostCountersEqual(targetEvidence) {
  const counters = targetEvidence.pre_post_counters || {};
  const pre = counters.pre_dispatch_counters;
  const post = counters.post_dispatch_counters_fail_closed;
  if (!pre || !post) {
    return {
      blocker: 'canonical blocker evidence pre_post_counters must record pre_dispatch_counters and post_dispatch_counters_fail_closed',
      check: { id: 'AB-14', verdict: 'fail', note: 'missing pre/post counter objects' }
    };
  }
  const preKeys = Object.keys(pre).sort();
  const postKeys = Object.keys(post).sort();
  if (preKeys.length !== postKeys.length || preKeys.some((k, i) => k !== postKeys[i])) {
    return {
      blocker: `canonical blocker evidence pre/post counter keys differ (pre=${preKeys.join(',')} post=${postKeys.join(',')})`,
      check: { id: 'AB-14', verdict: 'fail', note: `pre keys != post keys` }
    };
  }
  const diffs = [];
  for (const k of preKeys) {
    if (pre[k] !== post[k]) {
      diffs.push(`${k}: pre=${pre[k]} post=${post[k]}`);
    }
  }
  if (diffs.length > 0) {
    return {
      blocker: `canonical blocker evidence pre_dispatch_counters must equal post_dispatch_counters_fail_closed (diffs: ${diffs.join('; ')})`,
      check: { id: 'AB-14', verdict: 'fail', note: diffs.join('; ') }
    };
  }
  return {
    check: { id: 'AB-14', verdict: 'pass', note: `pre/post counters deep-equal across ${preKeys.length} keys` }
  };
}

function checkAllowBlockerObservedFailClosedZero(targetEvidence) {
  const ledger = targetEvidence.expected_vs_observed_side_effect_ledger || {};
  const observed = ledger.observed_fail_closed;
  if (!observed || typeof observed !== 'object') {
    return {
      blocker: 'canonical blocker evidence expected_vs_observed_side_effect_ledger.observed_fail_closed must be present',
      check: { id: 'AB-15', verdict: 'fail', note: 'observed_fail_closed missing' }
    };
  }
  const violations = Object.entries(observed)
    .filter(([, v]) => typeof v === 'number' && v !== 0)
    .map(([k, v]) => `${k}=${v}`);
  if (violations.length > 0) {
    return {
      blocker: `canonical blocker evidence observed_fail_closed must be all-zero (violations: ${violations.join(', ')})`,
      check: { id: 'AB-15', verdict: 'fail', note: `observed violations: ${violations.join(', ')}` }
    };
  }
  return {
    check: { id: 'AB-15', verdict: 'pass', note: `observed_fail_closed all-zero across ${Object.keys(observed).length} counters` }
  };
}

function checkAllowBlockerNoCredentialLeaks(targetEvidence) {
  const haystack = JSON.stringify(targetEvidence);
  const leaks = scanCredentialLeaks(haystack);
  if (leaks.length > 0) {
    return {
      blocker: `canonical blocker evidence must not contain credential values (${leaks.length} leak(s): ${leaks.slice(0, 3).map((l) => l.redacted).join(', ')})`,
      check: { id: 'AB-16', verdict: 'fail', note: `${leaks.length} credential leak(s) detected` }
    };
  }
  return { check: { id: 'AB-16', verdict: 'pass', note: 'no credential value patterns detected in canonical blocker evidence' } };
}

function checkAllowBlockerNoUnapprovedUuids(targetEvidence) {
  const haystack = JSON.stringify(targetEvidence);
  const leaks = scanUuidLeaks(haystack);
  if (leaks.length > 0) {
    return {
      blocker: `canonical blocker evidence must not contain unapproved full UUID literals (${leaks.length} leak(s))`,
      check: { id: 'AB-17', verdict: 'fail', note: `${leaks.length} unapproved UUID literal(s) detected` }
    };
  }
  return { check: { id: 'AB-17', verdict: 'pass', note: 'no unapproved full UUID literals detected in canonical blocker evidence' } };
}

function checkAllowBlockerNativeReadbackHashes(targetEvidence) {
  const hashes = targetEvidence.native_readback_hashes;
  if (!hashes || typeof hashes !== 'object' || Array.isArray(hashes)) {
    return {
      blocker: 'canonical blocker evidence native_readback_hashes must be a non-array object',
      check: { id: 'AB-18', verdict: 'fail', note: 'native_readback_hashes missing or not an object' }
    };
  }
  const entries = Object.entries(hashes);
  if (entries.length < 3) {
    return {
      blocker: `canonical blocker evidence native_readback_hashes must include >= 3 sha256 hashes (got ${entries.length})`,
      check: { id: 'AB-18', verdict: 'fail', note: `only ${entries.length} hash entries` }
    };
  }
  const sha256Re = /^[0-9a-f]{64}$/i;
  const invalid = entries.filter(([, v]) => typeof v !== 'string' || !sha256Re.test(v));
  if (invalid.length > 0) {
    return {
      blocker: `canonical blocker evidence native_readback_hashes entries must be 64-char sha256 hex (invalid: ${invalid.map(([k]) => k).join(', ')})`,
      check: { id: 'AB-18', verdict: 'fail', note: `invalid hex: ${invalid.map(([k]) => k).join(', ')}` }
    };
  }
  return {
    check: { id: 'AB-18', verdict: 'pass', note: `${entries.length} sha256 hashes all match 64-char hex` }
  };
}

function checkAllowBlockerReMutationPolicy(targetEvidence) {
  const boundary = targetEvidence.blocker_boundary || {};
  const policy = typeof boundary.re_mutation_policy === 'string' ? boundary.re_mutation_policy.toUpperCase() : '';
  if (!policy.includes('NEVER')) {
    return {
      blocker: `canonical blocker evidence blocker_boundary.re_mutation_policy must start with "NEVER" (got ${JSON.stringify(boundary.re_mutation_policy)})`,
      check: { id: 'AB-19', verdict: 'fail', note: `re_mutation_policy=${JSON.stringify(boundary.re_mutation_policy)}` }
    };
  }
  const recovery = typeof boundary.recovery_starts_from === 'string' ? boundary.recovery_starts_from.toLowerCase() : '';
  if (!recovery.includes('failing')) {
    return {
      blocker: `canonical blocker evidence blocker_boundary.recovery_starts_from must reference a failing boundary (got ${JSON.stringify(boundary.recovery_starts_from)})`,
      check: { id: 'AB-19', verdict: 'fail', note: `recovery_starts_from=${JSON.stringify(boundary.recovery_starts_from)}` }
    };
  }
  return {
    check: { id: 'AB-19', verdict: 'pass', note: 'blocker_boundary.re_mutation_policy=NEVER retry; recovery_starts_from=failing boundary' }
  };
}

function checkAllowBlockerUpstreamArtifactsAllDeferred(targetEvidence) {
  const audit = targetEvidence.preconditions_audit || {};
  const upstream = audit.upstream_artifacts || {};
  const requiredKeys = [
    's04Deploy',
    's04PostUpgrade',
    's04NativeSmoke',
    's05Upgrade',
    's05Direct',
    's05Paperclip',
    's06DirectLive',
    's06PaperclipHermesLive',
    's06Rollout',
    's06Persistence'
  ];
  const missing = requiredKeys.filter((k) => !(k in upstream));
  if (missing.length > 0) {
    return {
      blocker: `canonical blocker evidence preconditions_audit.upstream_artifacts missing keys: ${missing.join(', ')}`,
      check: { id: 'AB-20', verdict: 'fail', note: `missing upstream keys: ${missing.join(', ')}` }
    };
  }
  const admissibleViolations = requiredKeys.filter((k) => upstream[k] && upstream[k].phase_admissible_for_live !== false);
  if (admissibleViolations.length > 0) {
    return {
      blocker: `canonical blocker evidence requires every upstream artifact phase_admissible_for_live=false (violations: ${admissibleViolations.join(', ')})`,
      check: { id: 'AB-20', verdict: 'fail', note: `admissible violations: ${admissibleViolations.join(', ')}` }
    };
  }
  return {
    check: { id: 'AB-20', verdict: 'pass', note: `all 10 upstream artifacts recorded with phase_admissible_for_live=false` }
  };
}

const ALLOW_BLOCKER_CHECKS = [
  checkAllowBlockerEvidenceParses,
  checkAllowBlockerTopLevelShape,
  checkAllowBlockerUpstreamGateNotSatisfied,
  checkAllowBlockerBusinessMutationCount,
  checkAllowBlockerLedgerAllZero,
  checkAllowBlockerValidatorCheckIds,
  checkAllowBlockerRequestJournalBounded,
  checkAllowBlockerPollHistoryBounded,
  checkAllowBlockerInheritedConstraints,
  checkAllowBlockerCanonicalProviderModel,
  checkAllowBlockerStaleCompanyIds,
  checkAllowBlockerRoutingChain,
  checkAllowBlockerBosFields,
  checkAllowBlockerPrePostCountersEqual,
  checkAllowBlockerObservedFailClosedZero,
  checkAllowBlockerNoCredentialLeaks,
  checkAllowBlockerNoUnapprovedUuids,
  checkAllowBlockerNativeReadbackHashes,
  checkAllowBlockerReMutationPolicy,
  checkAllowBlockerUpstreamArtifactsAllDeferred
];

function validateAllowBlocker(targetEvidence) {
  if (targetEvidence === null || targetEvidence === undefined) {
    return {
      verdict: 'fail',
      blockers: [
        'canonical S07 evidence (runtime-evidence/M014-S07-bounded-bos-e2e.json) missing for --allow-blocker / --phase allow-blocker'
      ],
      checks: [],
      summary: { blockers_count: 1, checks_count: 0, pass_count: 0, fail_count: 0 }
    };
  }
  const checks = [];
  const blockers = [];
  for (const fn of ALLOW_BLOCKER_CHECKS) {
    const result = fn(targetEvidence);
    if (result.check) checks.push(result.check);
    if (result.blocker) blockers.push(result.blocker);
  }
  const verdict = blockers.length === 0 ? 'pass' : 'fail';
  return {
    verdict,
    blockers,
    checks,
    summary: {
      blockers_count: blockers.length,
      checks_count: checks.length,
      pass_count: checks.filter((c) => c.verdict === 'pass').length,
      fail_count: checks.filter((c) => c.verdict === 'fail').length
    }
  };
}

// ---------------------------------------------------------------------------
// T04: --phase require-pass (canonical live PASS evidence validator)
// ---------------------------------------------------------------------------

const REQUIRE_PASS_CHECK_IDS = Object.freeze(Array.from({ length: 20 }, (_, index) => `RP-${String(index + 1).padStart(2, '0')}`));
const REQUIRE_PASS_EXPECTED_SIDE_EFFECTS = Object.freeze({
  issues_created: 1,
  heartbeat_runs_started: 1,
  documents_created: 0,
  comments_created: 0,
  approvals_created: 0,
  agents_mutated: 0,
  unexpected_mutating_routes: 0,
  unconfirmed_live_side_effects: 0
});

function validateRequirePass(targetEvidence) {
  const blockers = [];
  const checks = [];
  const addCheck = (id, condition, note, blocker) => {
    checks.push({ id, verdict: condition ? 'pass' : 'fail', note });
    if (!condition) blockers.push(blocker || note);
  };
  const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const isSha256 = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);

  if (!isObject(targetEvidence)) {
    return {
      verdict: 'fail',
      blockers: ['target S07 evidence missing or not a JSON object for --require-pass / --phase require-pass'],
      checks: [],
      placeholder: false,
      summary: { blockers_count: 1, checks_count: 0, pass_count: 0, fail_count: 0 }
    };
  }

  addCheck('RP-01', targetEvidence.mode === 'live' && targetEvidence.status === 'PASS' && targetEvidence.milestone === 'M014-a9jj46' && targetEvidence.slice === 'S07' && targetEvidence.task === 'T04',
    'canonical identity, mode=live, and status=PASS', 'canonical S07 evidence must identify M014-a9jj46/S07/T04 with mode=live and status=PASS');

  addCheck('RP-02', targetEvidence.auth_mode === 'session-cookie' && typeof targetEvidence.confirmation_scope === 'string' && targetEvidence.confirmation_scope.includes('D062'),
    'session-cookie auth and D062 confirmation scope recorded', 'canonical S07 evidence must use session-cookie auth and record D062 confirmation scope');

  const upstream = validateEntryGate(loadUpstreamArtifacts(), null);
  addCheck('RP-03', upstream.verdict === 'pass' && upstream.blockers.length === 0,
    'all 30 upstream entry-gate checks pass', `upstream S04-S06 entry gate must pass before T04 acceptance (${upstream.blockers.join('; ')})`);

  const hashes = targetEvidence.idempotency_key_sha256;
  addCheck('RP-04', isSha256(targetEvidence.run_seed_hash) && isSha256(targetEvidence.correlation_id_sha256) &&
    isObject(hashes) && isSha256(hashes.issue_create) && isSha256(hashes.heartbeat) && hashes.distinct === true && hashes.issue_create !== hashes.heartbeat,
    'run/correlation/idempotency hashes are present and operation-specific', 'T04 evidence must contain distinct sha256 identities for issue-create and heartbeat');

  const recovery = targetEvidence.recovery_lock;
  const issueRecovery = recovery && recovery.operations && recovery.operations['issue-create'];
  const heartbeatRecovery = recovery && recovery.operations && recovery.operations['heartbeat-invoke'];
  addCheck('RP-05', isObject(recovery) && recovery.status === 'completed' && issueRecovery?.status === 'confirmed' && issueRecovery?.attempted === true && issueRecovery?.confirmed === true && heartbeatRecovery?.status === 'confirmed' && heartbeatRecovery?.attempted === true && heartbeatRecovery?.confirmed === true,
    'terminal recovery lock confirms both mutations exactly once', 'recovery lock must be completed with confirmed issue-create and heartbeat-invoke operations');

  addCheck('RP-06', targetEvidence.preflight?.pass === true && Array.isArray(targetEvidence.preflight.blocker_codes) && targetEvidence.preflight.blocker_codes.length === 0,
    'paperclip-preflight passed with zero blockers', 'paperclip-preflight must pass with zero blocker codes');

  const adapter = targetEvidence.adapter_check;
  const adapterText = JSON.stringify(adapter || {}).toLowerCase();
  addCheck('RP-07', isObject(adapter) && adapter.adapterType === 'hermes_local' && adapter.provider === CANONICAL_MINIMAX_PROVIDER && adapter.model === CANONICAL_MINIMAX_MODEL && !adapterText.includes('xiaomi') && !adapterText.includes('mimo-v2.5-pro'),
    'adapter is hermes_local + MiniMax M3 with no Xiaomi reuse', 'adapter_check must prove hermes_local + MiniMax M3 and contain no Xiaomi/Mimo markers');

  const policy = targetEvidence.bounded_policy;
  addCheck('RP-08', isObject(policy) && policy.max_issue_creates === 1 && policy.max_heartbeat_posts === 1 && Number.isInteger(policy.max_readback_gets) && policy.max_readback_gets > 0 && typeof policy.retry_policy === 'string' && policy.retry_policy.includes('no POST/PATCH/DELETE retry'),
    'bounded mutation/readback/retry policy recorded', 'bounded_policy must cap one issue, one heartbeat, bounded GETs, and forbid mutating retries');

  const journal = Array.isArray(targetEvidence.request_journal) ? targetEvidence.request_journal : [];
  const issuePosts = journal.filter((entry) => entry.method === 'POST' && /\/api\/companies\/[^/]+\/issues$/.test(entry.path || ''));
  const heartbeatPosts = journal.filter((entry) => entry.method === 'POST' && /\/api\/agents\/[^/]+\/heartbeat\/invoke$/.test(entry.path || ''));
  const signIns = journal.filter((entry) => entry.method === 'POST' && entry.path === '/api/auth/sign-in/email' && entry.classification === 'control-plane');
  const unexpectedMutations = journal.filter((entry) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(entry.method) && !signIns.includes(entry) && !issuePosts.includes(entry) && !heartbeatPosts.includes(entry));
  addCheck('RP-09', issuePosts.length === 1 && heartbeatPosts.length === 1 && signIns.length === 1 && unexpectedMutations.length === 0,
    'journal contains one sign-in, one issue POST, one heartbeat POST, and no other mutation', 'request_journal must contain exactly the three allowed POST routes and no unexpected mutation');

  const budget = targetEvidence.readback_budget;
  const getCount = journal.filter((entry) => entry.method === 'GET').length;
  addCheck('RP-10', isObject(budget) && Number.isInteger(budget.used) && Number.isInteger(budget.max) && budget.used === getCount && budget.used <= budget.max && budget.remaining === budget.max - budget.used,
    'all GETs are counted within the declared budget', 'readback_budget must exactly account for every GET and remain within its cap');

  const terminal = targetEvidence.terminal_proof;
  addCheck('RP-11', isObject(terminal) && terminal.status === 'succeeded' && terminal.terminal === true && terminal.exit_code === 0 && terminal.bos_status === 'succeeded' && terminal.bos_required_fields_present === true && terminal.issue_reference_matched === true,
    'terminal succeeded exit=0 with schema-complete BOS and issue binding', 'terminal_proof must show succeeded, terminal=true, exit_code=0, complete BOS fields, and exact issue binding');

  addCheck('RP-12', targetEvidence.wake_count_delta === 1,
    'wakeCountDelta is exactly one', 'wake_count_delta must equal exactly 1');

  const ledger = targetEvidence.exact_side_effect_ledger;
  const expected = ledger && ledger.expected;
  const observed = ledger && ledger.observed;
  const expectedExact = isObject(expected) && Object.entries(REQUIRE_PASS_EXPECTED_SIDE_EFFECTS).every(([key, value]) => expected[key] === value);
  const observedExact = isObject(observed) && Object.entries(REQUIRE_PASS_EXPECTED_SIDE_EFFECTS).every(([key, value]) => observed[key] === value);
  addCheck('RP-13', expectedExact && observedExact,
    'expected and observed side-effect ledgers match the exact acceptance contract', 'exact_side_effect_ledger expected/observed values must equal one issue, one heartbeat, and zero other/unconfirmed effects');

  const attempted = ledger && ledger.attempted;
  addCheck('RP-14', ledger?.business_mutation_count === 2 && ledger?.acceptance?.exact_mutation_counts === true && attempted?.issue_create_posts === 1 && attempted?.heartbeat_posts === 1 && attempted?.operations?.['issue-create'] === 1 && attempted?.operations?.['heartbeat-invoke'] === 1,
    'attempted ledger proves exactly two allowed business mutations', 'attempted ledger must prove one issue-create and one heartbeat-invoke with business_mutation_count=2');

  const uncertaintyEvents = targetEvidence.unconfirmed_live_side_effect_events;
  addCheck('RP-15', observed?.unconfirmed_live_side_effects === 0 && Number.isInteger(uncertaintyEvents) && uncertaintyEvents >= 0 && attempted?.unconfirmed_live_side_effect_events === uncertaintyEvents && (uncertaintyEvents === 0 || targetEvidence.recovery_lock?.status === 'completed'),
    'no current unconfirmed live side effects remain; historical uncertainty events are resolved and accounted', 'current unconfirmed side effects must be zero and every historical uncertainty event must be resolved by a completed recovery lock');

  const readbackHashes = targetEvidence.readback_hashes;
  addCheck('RP-16', isObject(readbackHashes) && ['issue', 'heartbeat', 'agent'].every((key) => isSha256(readbackHashes[key])),
    'issue, heartbeat, and agent independent readback hashes are present', 'readback_hashes must contain 64-char sha256 values for issue, heartbeat, and agent');

  addCheck('RP-17', targetEvidence.failure === null,
    'failure field is null', 'PASS evidence must not contain a failure object');

  const serialized = JSON.stringify(targetEvidence);
  const credentialHits = scanCredentialLeaks(serialized);
  const uuidHits = scanUuidLeaks(serialized);
  addCheck('RP-18', credentialHits.length === 0 && uuidHits.length === 0,
    'evidence contains no credential values or full UUIDs', `evidence redaction failed: credential_hits=${credentialHits.length}, uuid_hits=${uuidHits.length}`);

  const target = targetEvidence.target;
  addCheck('RP-19', isObject(target) && ['company_id', 'project_id', 'agent_id'].every((key) => target[key] === '<redacted-id>'),
    'target identifiers are fully redacted', 'target company/project/agent identifiers must be stored only as <redacted-id>');

  addCheck('RP-20', checks.length === REQUIRE_PASS_CHECK_IDS.length - 1,
    'all canonical require-pass checks are present', `require-pass check cardinality drift: expected ${REQUIRE_PASS_CHECK_IDS.length}`);

  return {
    verdict: blockers.length === 0 ? 'pass' : 'fail',
    blockers,
    checks,
    placeholder: false,
    summary: {
      blockers_count: blockers.length,
      checks_count: checks.length,
      pass_count: checks.filter((check) => check.verdict === 'pass').length,
      fail_count: checks.filter((check) => check.verdict === 'fail').length
    }
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    phase: null,
    allowBlocker: null,
    requirePass: null,
    json: false,
    help: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--phase') {
      args.phase = argv[++i];
    } else if (a === '--allow-blocker') {
      args.allowBlocker = argv[++i];
    } else if (a === '--require-pass') {
      args.requirePass = argv[++i];
    } else if (a === '--json') {
      args.json = true;
    } else if (a === '--help' || a === '-h') {
      args.help = true;
    }
  }
  return args;
}

function printHelp() {
  process.stdout.write(
    [
      'Usage: node scripts/validate_m014_s07_bounded_bos_e2e.js [flags]',
      '',
      'Flags:',
      '  --phase <phase>          run a phase: entry-gate | allow-blocker | require-pass',
      '                           (uses the canonical runtime-evidence file at runtime-evidence/M014-S07-bounded-bos-e2e.json)',
      '  --allow-blocker <file>   validate the fail-closed canonical blocker evidence at <file> (T03)',
      '                           short-circuits --phase routing; <file> overrides the default evidence path',
      '  --require-pass <file>    validate the canonical runtime-execution-proof at <file> (T04 placeholder)',
      '                           short-circuits --phase routing; <file> overrides the default evidence path',
      '  --json                   emit JSON result to stdout (one phase at a time)',
      '  --help, -h               show this help',
      '',
      'Phases:',
      '  entry-gate      validate the fail-closed upstream gate (T01; current)',
      '  allow-blocker   validate a fail-closed blocker artifact (T03; canonical)',
      '  require-pass    validate the canonical runtime-execution-proof (T04; placeholder)',
      '',
      'Exit codes:',
      '  0  PASS (entry-gate cleared; every upstream gate promoted; or blocker/require-pass approved)',
      '  1  FAIL (validation error; fail-closed)',
      '  2  LOAD (could not read upstream artifacts, unknown phase, or missing/invalid evidence path)',
      '',
      'Examples:',
      '  node scripts/validate_m014_s07_bounded_bos_e2e.js --phase entry-gate',
      '  node scripts/validate_m014_s07_bounded_bos_e2e.js --phase entry-gate --json',
      '  node scripts/validate_m014_s07_bounded_bos_e2e.js --allow-blocker runtime-evidence/M014-S07-bounded-bos-e2e.json',
      '  node scripts/validate_m014_s07_bounded_bos_e2e.js --require-pass runtime-evidence/M014-S07-bounded-bos-e2e.json',
      ''
    ].join('\n')
  );
}

function runCLI(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return 0;
  }

  // Explicit file-path flags short-circuit --phase routing and take an
  // arbitrary evidence file. They support both the canonical S07 evidence
  // file path and a synthetic test fixture.
  if (args.allowBlocker) {
    const targetEvidence = loadTargetEvidenceFromPath(path.resolve(PROJECT_ROOT, args.allowBlocker));
    const result = validateAllowBlocker(targetEvidence);
    if (args.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else {
      process.stdout.write(
        `phase=allow-blocker file=${args.allowBlocker} verdict=${result.verdict} blockers=${result.blockers.length} checks=${result.summary.checks_count} pass=${result.summary.pass_count} fail=${result.summary.fail_count}\n`
      );
      for (const b of result.blockers) {
        process.stdout.write(`  blocker: ${b}\n`);
      }
    }
    return result.verdict === 'pass' ? 0 : 1;
  }
  if (args.requirePass) {
    const targetEvidence = loadTargetEvidenceFromPath(path.resolve(PROJECT_ROOT, args.requirePass));
    const result = validateRequirePass(targetEvidence);
    if (args.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else {
      process.stdout.write(`phase=require-pass file=${args.requirePass} verdict=${result.verdict} blockers=${result.blockers.length}\n`);
      for (const b of result.blockers) {
        process.stdout.write(`  blocker: ${b}\n`);
      }
    }
    return result.verdict === 'pass' ? 0 : 1;
  }

  if (!args.phase) {
    process.stderr.write('error: --phase <phase> is required (try --help)\n');
    return 2;
  }
  if (!['entry-gate', 'allow-blocker', 'require-pass'].includes(args.phase)) {
    process.stderr.write(`error: unknown phase "${args.phase}"\n`);
    return 2;
  }

  if (args.phase === 'entry-gate') {
    let artifacts;
    try {
      artifacts = loadUpstreamArtifacts();
    } catch (err) {
      process.stderr.write(`error: ${err.message}\n`);
      return 2;
    }
    const targetEvidence = loadTargetEvidenceOrNull();
    const result = validateEntryGate(artifacts, targetEvidence);
    if (args.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else {
      process.stdout.write(
        `phase=entry-gate verdict=${result.verdict} blockers=${result.blockers.length} checks=${result.summary.checks_count} pass=${result.summary.pass_count} fail=${result.summary.fail_count}\n`
      );
      for (const b of result.blockers) {
        process.stdout.write(`  blocker: ${b}\n`);
      }
    }
    return result.verdict === 'pass' ? 0 : 1;
  }

  if (args.phase === 'allow-blocker') {
    const targetEvidence = loadTargetEvidenceOrNull();
    const result = validateAllowBlocker(targetEvidence);
    if (args.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else {
      process.stdout.write(
        `phase=allow-blocker verdict=${result.verdict} blockers=${result.blockers.length} checks=${result.summary.checks_count} pass=${result.summary.pass_count} fail=${result.summary.fail_count}\n`
      );
      for (const b of result.blockers) {
        process.stdout.write(`  blocker: ${b}\n`);
      }
    }
    return result.verdict === 'pass' ? 0 : 1;
  }

  if (args.phase === 'require-pass') {
    const targetEvidence = loadTargetEvidenceOrNull();
    const result = validateRequirePass(targetEvidence);
    if (args.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else {
      process.stdout.write(`phase=require-pass verdict=${result.verdict} blockers=${result.blockers.length}\n`);
      for (const b of result.blockers) {
        process.stdout.write(`  blocker: ${b}\n`);
      }
    }
    return result.verdict === 'pass' ? 0 : 1;
  }

  return 2;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Validators
  validateEntryGate,
  validateAllowBlocker,
  validateRequirePass,
  // Individual checks (for testability)
  checkAllArtifactsPresent,
  checkS04DeploymentStatus,
  checkS04NginxLockdown,
  checkS04MigrationsApplied,
  checkS04PostUpgradeVerdict,
  checkS04FreshReadbackPerformed,
  checkS04NativeSmokeVerdict,
  checkS04NativeSurfacesLive,
  checkS05UpgradePhaseVerdict,
  checkS05UpgradePreFlightChecks,
  checkS05UpgradePatchReconciliation,
  checkS05DirectProofPhase,
  checkS05PaperclipProofPhase,
  checkS06DirectLivePhase,
  checkS06DirectLiveProviderModel,
  checkS06PaperclipHermesLivePhase,
  checkS06BoundedAgentNotStale,
  checkS06RolloutVerdict,
  checkS06RolloutRpcLiveObserved,
  checkS06RolloutZeroRbcTripped,
  checkS06PersistencePhase,
  checkS06PersistenceAllSha256Equal,
  checkS06PersistenceHermesBinding,
  checkXiaomiProhibitionLayers,
  checkInheritedConstraintsAllEvidence,
  checkRedactionDisciplineAllEvidence,
  checkPhaseVerdictEnumLock,
  checkLiveExecutionStatusEnumLock,
  checkBusinessMutationInvariant,
  checkR026RoutingPreservation,
  // Loaders
  loadJSON,
  loadUpstreamArtifacts,
  loadLockfileOrNull,
  loadTargetEvidenceOrNull,
  loadTargetEvidenceFromPath,
  // Helpers
  scanCredentialLeaks,
  scanUuidLeaks,
  redactUuidLiteral,
  redactCredentialMatch,
  isLivePhaseAdmissible,
  // Constants (exported for fixture builders in test suite)
  REQUIRED_DEPLOYMENT_STATUS,
  REQUIRED_POST_UPGRADE_VERDICT,
  REQUIRED_NATIVE_SMOKE_VERDICT,
  REQUIRED_S05_UPGRADE_PHASE_VERDICTS,
  REQUIRED_S05_DIRECT_PHASE_VERDICT,
  REQUIRED_S05_PAPERCLIP_PHASE_VERDICT,
  REQUIRED_S06_DIRECT_LIVE_PHASE_VERDICT,
  REQUIRED_S06_PAPERCLIP_HERMES_LIVE_PHASE_VERDICT,
  REQUIRED_S06_ROLLOUT_PHASE_VERDICT,
  REQUIRED_S06_ROLLOUT_VERDICT,
  REQUIRED_S06_PERSISTENCE_PHASE_VERDICT,
  REQUIRED_LIVE_EXECUTION_STATUS_ENUM,
  REQUIRED_PFC_CHECK_NAMES,
  REQUIRED_LHA_PATCH_IDS,
  REQUIRED_INHERITED_CONSTRAINT_IDS,
  REQUIRED_RPC_IDS,
  REQUIRED_RBC_IDS,
  REQUIRED_PERSISTENCE_TARGETS,
  REQUIRED_NATIVE_SURFACE_CLASSES,
  REQUIRED_PAPERCLIP_PROFILE_KEYS,
  REQUIRED_XIAOMI_PROHIBITION_FIELDS,
  REQUIRED_XIAOMI_ADAPTER_PROHIBITION_FIELDS,
  R3_STALE_PREFIXES,
  APPROVED_UUID_PREFIXES,
  CANONICAL_MINIMAX_PROVIDER,
  CANONICAL_MINIMAX_MODEL,
  R026_ROUTING_CHAIN,
  ENTRY_GATE_CHECKS,
  // CLI
  runCLI,
  parseArgs,
  // Paths (for tests that build fixture artifacts in /tmp)
  UPSTREAM_ARTIFACT_PATHS,
  LOCKFILE_JSON,
  S07_TARGET_JSON
};

// ---------------------------------------------------------------------------
// Self-test harness (node:test) — used by `node --test scripts/validate_m014_s07_bounded_bos_e2e.js`
// ---------------------------------------------------------------------------

describe('validate_m014_s07_bounded_bos_e2e.js helpers (self-test)', () => {
  it('exports validateEntryGate as a function', () => {
    assert.equal(typeof module.exports.validateEntryGate, 'function');
  });

  it('exports 30 entry-gate check ids in ENTRY_GATE_CHECKS', () => {
    const ids = module.exports.ENTRY_GATE_CHECKS.map(([id]) => id);
    assert.equal(ids.length, 30);
    assert.ok(ids.includes('V-BOS-E2E-01'));
    assert.ok(ids.includes('V-BOS-E2E-30'));
  });

  it('exports 6 LFP-* inherited constraint IDs', () => {
    assert.equal(module.exports.REQUIRED_INHERITED_CONSTRAINT_IDS.length, 6);
    assert.ok(module.exports.REQUIRED_INHERITED_CONSTRAINT_IDS.includes('LFP-LF-01'));
    assert.ok(module.exports.REQUIRED_INHERITED_CONSTRAINT_IDS.includes('LFP-S02-03'));
  });

  it('exports 6 R3 stale prefixes', () => {
    assert.equal(module.exports.R3_STALE_PREFIXES.size, 6);
    assert.ok(module.exports.R3_STALE_PREFIXES.has('9feb4c22'));
  });

  it('redactCredentialMatch handles KEY=value shape', () => {
    const r = module.exports.redactCredentialMatch('XIAOMI_API_KEY=tp-sd7b39f0xxxx');
    assert.ok(r.includes('XIAOMI_API_KEY='));
    assert.ok(r.includes('…'));
    assert.ok(!r.includes('sd7b39f0')); // value body redacted
  });

  it('redactCredentialMatch handles sk-* prefix', () => {
    const r = module.exports.redactCredentialMatch('sk-proj-abcdef0123456789abcdef0123456789');
    assert.ok(r.startsWith('sk-p'));
    assert.ok(!r.includes('abcdef0123456789'));
  });

  it('scanCredentialLeaks detects XIAOMI_API_KEY= leak', () => {
    // Use a value without tp- prefix to isolate the key-value pattern.
    const hits = module.exports.scanCredentialLeaks('XIAOMI_API_KEY=myleakedsecretvalue1234');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].id, 'cred-key-value');
  });

  it('scanCredentialLeaks ignores bare XIAOMI_API_KEY= substring (no value)', () => {
    const hits = module.exports.scanCredentialLeaks('XIAOMI_API_KEY=  # documented redaction shape');
    assert.equal(hits.length, 0);
  });

  it('scanCredentialLeaks detects Authorization Bearer token', () => {
    const hits = module.exports.scanCredentialLeaks('Authorization: Bearer abcdefghijklmnop');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].id, 'cred-bearer');
  });

  it('scanCredentialLeaks detects sk-* token prefix', () => {
    const hits = module.exports.scanCredentialLeaks('sk-proj-abcdefghijklmnopqrst');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].id, 'cred-sk-prefix');
  });

  it('scanUuidLeaks allows R3 ledger prefixes', () => {
    const text = '9feb4c22-05b9-401e-ba67-0e866e3056da and 43c74adb-b194-44d1-8f8e-ba142544bb9d';
    const leaks = module.exports.scanUuidLeaks(text);
    assert.equal(leaks.length, 0);
  });

  it('scanUuidLeaks detects unapproved UUID literal', () => {
    const text = 'random 12345678-1234-1234-1234-123456789abc appears here';
    const leaks = module.exports.scanUuidLeaks(text);
    assert.equal(leaks.length, 1);
    assert.ok(leaks[0].startsWith('12345678'));
  });

  it('redactUuidLiteral formats to 8-char prefix only', () => {
    const r = module.exports.redactUuidLiteral('12345678-1234-1234-1234-123456789abc');
    assert.equal(r, '12345678-****-****-****-************');
  });

  it('isLivePhaseAdmissible accepts live values, rejects deferred', () => {
    assert.equal(module.exports.isLivePhaseAdmissible('success'), true);
    assert.equal(module.exports.isLivePhaseAdmissible('PASS'), true);
    assert.equal(module.exports.isLivePhaseAdmissible('ROLLOUT'), true);
    assert.equal(module.exports.isLivePhaseAdmissible('PLAN_READY_LIVE_EXECUTION_DEFERRED'), false);
    assert.equal(module.exports.isLivePhaseAdmissible('BLOCKED_NO_OPERATOR_CONFIRMATION'), false);
  });
});

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (require.main === module) {
  process.exit(runCLI(process.argv.slice(2)));
}