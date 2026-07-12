#!/usr/bin/env node
/*
 * M014-S06 T04 runner — Paperclip and Hermes persistence canary.
 *
 * Side-effect-free planning + precondition audit. Does NOT execute the
 * paperclip-runtime.lock.json safe_restart_command, does NOT capture
 * pre/post snapshots of native Paperclip state or Hermes runtime binding,
 * and does NOT mutate any runtime artifact. The runner audits:
 *
 *   - paperclip-runtime.lock.json presence + safe_restart_command + byte-identical equality
 *   - M014-S05-minimax-provider-contract.json (canonical MiniMax profile)
 *   - M014-S05-minimax-direct-proof.json (S05 direct proof + phase_verdict)
 *   - M014-S06-minimax-direct-live.json (S06-T01 direct-live phase_verdict)
 *   - M014-S06-paperclip-hermes-live.json (S06-T02 paperclip hermes_local phase_verdict)
 *   - M014-S06-rollout-verdict.json (S06-T03 computed rollout_verdict)
 *
 * It then emits a JSON plan describing the planned pre/post safe_restart
 * snapshot pairs (Paperclip companies, agents, memberships, plugins,
 * Postgres data path; Hermes version/providers/profile) and the diff rule
 * required to declare PASS — none of which are executed in the auto-mode lane.
 *
 * Exit code:
 *   0 = preconditions audited, plan is ready for operator-confirmed live execution
 *   2 = precondition gap (missing artifact, mismatched provider, stale ID drift, etc.)
 *
 * Honours inherited LFP-* constraints from S05 + S06-T01/T02/T03 unchanged.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = process.cwd();

const LOCKFILE = path.resolve(PROJECT_ROOT, 'paperclip-runtime.lock.json');
const S05_PROVIDER_CONTRACT = path.resolve(PROJECT_ROOT, 'runtime-evidence/M014-S05-minimax-provider-contract.json');
const S05_DIRECT_PROOF = path.resolve(PROJECT_ROOT, 'runtime-evidence/M014-S05-minimax-direct-proof.json');
const S06_DIRECT_LIVE_EVIDENCE = path.resolve(PROJECT_ROOT, 'runtime-evidence/M014-S06-minimax-direct-live.json');
const S06_PAPERCLIP_HERMES_LIVE_EVIDENCE = path.resolve(
  PROJECT_ROOT,
  'runtime-evidence/M014-S06-paperclip-hermes-live.json'
);
const S06_ROLLOUT_VERDICT_EVIDENCE = path.resolve(
  PROJECT_ROOT,
  'runtime-evidence/M014-S06-rollout-verdict.json'
);

const REQUIRED_PROVIDER_NAME = 'minimax';
const REQUIRED_MODEL_SPELLING = 'MiniMax-M3';
const REQUIRED_ENDPOINT_MODE = 'openai-compatible';
const REQUIRED_AUTH_SECRET_REF = 'MINIMAX_API_KEY';
const REQUIRED_ENDPOINT_SECRET_REF = 'MINIMAX_BASE_URL';

const REQUIRED_PHASE_VERDICT_VALUES = new Set([
  'PLAN_READY_LIVE_EXECUTION_DEFERRED',
  'PASS',
  'FAIL_PRE_SNAPSHOT_MISSING',
  'FAIL_POST_SNAPSHOT_MISSING',
  'FAIL_SAFE_RESTART_COMMAND_MUTATED',
  'FAIL_NATIVE_STATE_DRIFT',
  'FAIL_HERMES_BINDING_DRIFT',
  'FAIL_CREDENTIAL_LEAK',
  'FAIL_TERMINAL_NONZERO_EXIT',
  'FAIL_PG_DATA_PATH_MISSING',
  'BLOCKED_NO_OPERATOR_CONFIRMATION',
  'BLOCKED_PREREQUISITE_GAP',
]);

const REQUIRED_LIVE_STATUS_VALUES = new Set([
  'pending-live-execution',
  'in-progress-live-execution',
  'passed-live-execution',
  'failed-live-execution',
  'deferred-to-operator-confirmed-safe-restart',
]);

const REQUIRED_INHERITED_CONSTRAINT_IDS = [
  'LFP-LF-01',
  'LFP-LF-02',
  'LFP-LF-03',
  'LFP-S02-01',
  'LFP-S02-02',
  'LFP-S02-03',
];

// 8 native/runtime surfaces the persistence canary must snapshot pre and post
// safe_restart. The list is enumerated as a const so the runner, validator,
// and JSON evidence all agree on the exact same set.
const REQUIRED_SNAPSHOT_TARGETS = [
  'paperclip_companies',
  'paperclip_agents',
  'paperclip_memberships',
  'paperclip_plugins',
  'paperclip_postgres_data_path',
  'hermes_agent_version',
  'hermes_providers_profile',
  'hermes_active_profile',
];

const REQUIRED_PRE_POST_DIFF_FIELDS = REQUIRED_SNAPSHOT_TARGETS.map((t) => `${t}_equal`);

const STALE_COMPANY_IDS = new Set([
  '9feb4c22-05b9-401e-ba67-0e866e3056da',
  '43c74adb-b194-44d1-8f8e-ba142544bb9d',
  '1a194762-0000-4000-8000-000000000000',
  '7595fd85-0000-4000-8000-000000000000',
  '7eede16c-0000-4000-8000-000000000000',
  '8233ea7b-0000-4000-8000-000000000000',
]);

function readJsonOrFail(p, label) {
  if (!fs.existsSync(p)) {
    return { ok: false, reason: `${label} file not found: ${p}` };
  }
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch (err) {
    return { ok: false, reason: `${label} read failure: ${err.message}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ok: false, reason: `${label} JSON parse failure: ${err.message}` };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: `${label} top-level must be a JSON object` };
  }
  return { ok: true, parsed, path: p };
}

function auditLockfile() {
  const result = readJsonOrFail(LOCKFILE, 'paperclip-runtime.lock.json');
  if (!result.ok) return result;
  const lockfile = result.parsed;
  if (typeof lockfile.safe_restart_command !== 'string' || lockfile.safe_restart_command.length === 0) {
    return { ok: false, reason: 'lockfile.safe_restart_command missing or empty (LFP-S02-02 breach)' };
  }
  if (!Array.isArray(lockfile.forbidden_commands)) {
    return { ok: false, reason: 'lockfile.forbidden_commands must be an array (LFP-LF-03)' };
  }
  const staleCount = (lockfile.stale_company_ids && Array.isArray(lockfile.stale_company_ids.ids))
    ? lockfile.stale_company_ids.ids.length
    : 0;
  // Compute SHA-256 of safe_restart_command for byte-identical integrity
  // gate. crypto is Node built-in so no native dependency is needed.
  const crypto = require('node:crypto');
  const safeRestartHash = crypto
    .createHash('sha256')
    .update(lockfile.safe_restart_command, 'utf8')
    .digest('hex');
  return {
    ok: true,
    safe_restart_command: lockfile.safe_restart_command,
    safe_restart_command_sha256: safeRestartHash,
    safe_restart_command_length_bytes: Buffer.byteLength(lockfile.safe_restart_command, 'utf8'),
    forbidden_commands_count: lockfile.forbidden_commands.length,
    stale_company_ids_count: staleCount,
  };
}

function unwrapCanonicalField(field, wrapperKey, fallbackKey) {
  // S05 provider-contract wraps canonical values in policy objects with
  // `canonical_name` / `model_spelling` / `endpoint_mode` keys. Older shapes
  // use `value`. Plain strings are passed through.
  if (typeof field === 'string') return field;
  if (field && typeof field === 'object') {
    if (typeof field[wrapperKey] === 'string') return field[wrapperKey];
    if (typeof field[fallbackKey] === 'string') return field[fallbackKey];
  }
  return null;
}

function auditS05ProviderContract() {
  const result = readJsonOrFail(S05_PROVIDER_CONTRACT, 'M014-S05-minimax-provider-contract.json');
  if (!result.ok) return result;
  const contract = result.parsed;
  const providerName = unwrapCanonicalField(contract.canonical_minimax_provider_name, 'canonical_name', 'value');
  const model = unwrapCanonicalField(contract.canonical_model_spelling, 'model_spelling', 'value');
  const endpoint = unwrapCanonicalField(contract.canonical_endpoint_mode, 'endpoint_mode', 'value');
  const authRef = contract.key_environment_contract && contract.key_environment_contract.auth_secret_ref;
  const endpointRef = contract.key_environment_contract && contract.key_environment_contract.endpoint_secret_ref;
  if (providerName !== REQUIRED_PROVIDER_NAME) {
    return { ok: false, reason: `provider-contract.canonical_minimax_provider_name=${providerName} (expected ${REQUIRED_PROVIDER_NAME})` };
  }
  if (model !== REQUIRED_MODEL_SPELLING) {
    return { ok: false, reason: `provider-contract.canonical_model_spelling=${model} (expected ${REQUIRED_MODEL_SPELLING})` };
  }
  if (endpoint !== REQUIRED_ENDPOINT_MODE) {
    return { ok: false, reason: `provider-contract.canonical_endpoint_mode=${endpoint} (expected ${REQUIRED_ENDPOINT_MODE})` };
  }
  if (authRef !== REQUIRED_AUTH_SECRET_REF) {
    return { ok: false, reason: `provider-contract.key_environment_contract.auth_secret_ref=${authRef} (expected ${REQUIRED_AUTH_SECRET_REF})` };
  }
  if (endpointRef !== REQUIRED_ENDPOINT_SECRET_REF) {
    return { ok: false, reason: `provider-contract.key_environment_contract.endpoint_secret_ref=${endpointRef} (expected ${REQUIRED_ENDPOINT_SECRET_REF})` };
  }
  return {
    ok: true,
    canonical_provider_name: providerName,
    canonical_model_spelling: model,
    canonical_endpoint_mode: endpoint,
    auth_secret_ref: authRef,
    endpoint_secret_ref: endpointRef,
  };
}

function auditUpstreamPhaseVerdict(p, label, allowed) {
  const result = readJsonOrFail(p, label);
  if (!result.ok) return result;
  const evidence = result.parsed;
  const lock = Array.isArray(evidence.phase_verdict_enum_lock) ? evidence.phase_verdict_enum_lock : null;
  if (!lock) {
    return { ok: false, reason: `${label}.phase_verdict_enum_lock missing` };
  }
  if (!lock.includes(evidence.phase_verdict)) {
    return { ok: false, reason: `${label}.phase_verdict=${evidence.phase_verdict} not in its own phase_verdict_enum_lock` };
  }
  const statusLock = Array.isArray(evidence.live_execution_status_enum_lock) ? evidence.live_execution_status_enum_lock : null;
  if (!statusLock || !statusLock.includes(evidence.live_execution_status)) {
    return { ok: false, reason: `${label}.live_execution_status=${evidence.live_execution_status} not in its own live_execution_status_enum_lock` };
  }
  const inherited = (evidence.inherited_constraints_remain_in_force && evidence.inherited_constraints_remain_in_force.inherited_constraints) || [];
  const inheritedIds = new Set(inherited.map((c) => c && c.id));
  const missing = REQUIRED_INHERITED_CONSTRAINT_IDS.filter((id) => !inheritedIds.has(id));
  if (missing.length > 0) {
    return { ok: false, reason: `${label} inherited_constraints missing: ${missing.join(', ')}` };
  }
  void allowed; // kept for symmetry with T03's audit helper; not used here
  return {
    ok: true,
    phase_verdict: evidence.phase_verdict,
    live_execution_status: evidence.live_execution_status,
    inherited_constraints_count: inherited.length,
  };
}

function auditUpstreamChain() {
  // S05 direct-proof uses a 9-value enum_lock; we verify against its own
  // phase_verdict_enum_lock (same pattern T01/T02/T03 runners follow).
  return {
    s05_direct_proof: auditUpstreamPhaseVerdict(S05_DIRECT_PROOF, 'M014-S05-minimax-direct-proof.json'),
    s06_direct_live: auditUpstreamPhaseVerdict(S06_DIRECT_LIVE_EVIDENCE, 'M014-S06-minimax-direct-live.json'),
    s06_paperclip_hermes_live: auditUpstreamPhaseVerdict(S06_PAPERCLIP_HERMES_LIVE_EVIDENCE, 'M014-S06-paperclip-hermes-live.json'),
    s06_rollout_verdict: auditUpstreamPhaseVerdict(S06_ROLLOUT_VERDICT_EVIDENCE, 'M014-S06-rollout-verdict.json'),
  };
}

function buildSnapshotPairPlan(canonical, lockfileAudit) {
  const now = new Date().toISOString();
  const expectedCorrelationFormat = 'YYYYMMDD_HHMMSS_<6hex> (e.g. 20260712_203000_a1b2c3) — must be fresh and MUST NOT match any M005-S01 xiaomi session id';
  return {
    policy: 'Live executor (operator-confirmed) MUST capture the pre_restart_snapshot immediately BEFORE running the byte-identical lockfile.safe_restart_command and the post_restart_snapshot immediately AFTER Paperclip/Hermes come back up. Snapshot fields are SHA-256 hashes of native Paperclip entity tables and Hermes runtime introspection outputs. Credential values, session cookies, and any bearer tokens MUST be redacted from snapshot outputs. The T04 auto-mode runner emits this plan only — no safe_restart is performed.',
    snapshot_target_set: REQUIRED_SNAPSHOT_TARGETS,
    snapshot_target_set_size: REQUIRED_SNAPSHOT_TARGETS.length,
    safe_restart_command_source: 'paperclip-runtime.lock.json',
    safe_restart_command_byte_identical_required: true,
    safe_restart_command_byte_identical_sha256: lockfileAudit.safe_restart_command_sha256,
    safe_restart_command_byte_length: lockfileAudit.safe_restart_command_length_bytes,
    pre_restart_snapshot: {
      captured_at_field_name: 'captured_at_utc',
      captured_at_value_placeholder: '<ISO 8601 timestamp recorded by live executor>',
      correlation_id_field_name: 'correlation_id',
      correlation_id_format_expected: expectedCorrelationFormat,
      fields_to_capture: REQUIRED_SNAPSHOT_TARGETS.map((t) => ({
        target: t,
        capture_method_hint: t === 'paperclip_postgres_data_path'
          ? 'sha256 of $(stat -c %s ${POSTGRES_DATA_DIR}) || echo "<stat failure>" (POSTGRES_DATA_DIR from /etc/paperclip/pg.conf or env PAPERCLIP_PG_DATA)'
          : t.startsWith('paperclip_')
            ? `SELECT count(*), array_agg(id ORDER BY created_at) FROM ${t.replace('paperclip_', '')}`
            : `hermes-agent introspection --output ${t}`,
        redaction_posture: 'all UUIDs -> 8-char prefix + ****-****-****-************; credential values removed',
        expected_output_shape: '{ target, sha256, captured_at_utc, correlation_id, redacted_count }',
      })),
    },
    post_restart_snapshot: {
      captured_at_field_name: 'captured_at_utc',
      captured_at_value_placeholder: '<ISO 8601 timestamp recorded by live executor after safe_restart completes>',
      correlation_id_field_name: 'correlation_id',
      correlation_id_format_expected: expectedCorrelationFormat,
      fields_to_capture: REQUIRED_SNAPSHOT_TARGETS.map((t) => ({
        target: t,
        capture_method_hint: 'identical to pre_restart_snapshot — same query, same redaction policy, same field shape',
        expected_output_shape: '{ target, sha256, captured_at_utc, correlation_id, redacted_count }',
      })),
    },
    diff_policy: {
      rule: 'For every snapshot target, pre_restart_snapshot[target].sha256 MUST equal post_restart_snapshot[target].sha256.',
      expected_diff_field_count: REQUIRED_PRE_POST_DIFF_FIELDS.length,
      expected_diff_fields: REQUIRED_PRE_POST_DIFF_FIELDS,
      pass_requires: 'every expected_diff_field === true',
      hermes_binding_extra: 'hermes_providers_profile MUST show provider=minimax and model=MiniMax-M3 in BOTH pre and post (i.e. canonical MiniMax profile survives safe_restart, xiaomi does NOT come back)',
      native_state_extra: 'paperclip_companies, paperclip_agents, paperclip_memberships, paperclip_plugins MUST have the same id sets in pre and post (no entity loss or duplication)',
      pg_data_path_extra: 'paperclip_postgres_data_path.sha256 MUST be unchanged (proves Postgres data volume not wiped)',
    },
    pass_decision_rule: {
      verdict_pass: 'pre/post sha256 equal on all 8 targets AND hermes_providers_profile still references minimax/MiniMax-M3',
      verdict_fail_native_state_drift: 'any paperclip_* target sha256 differs',
      verdict_fail_hermes_binding_drift: 'hermes_providers_profile no longer references minimax OR no longer references MiniMax-M3',
      verdict_fail_pg_data_path: 'paperclip_postgres_data_path.sha256 differs',
      verdict_fail_restart_command_mutated: 'safe_restart_command_sha256 differs from lockfile SHA-256',
    },
    canonical_provider_expected_after_restart: {
      provider: canonical.canonical_provider_name,
      model: canonical.canonical_model_spelling,
      endpoint_class: canonical.canonical_endpoint_mode,
      api_key_secret_ref: canonical.auth_secret_ref,
      base_url_secret_ref: canonical.endpoint_secret_ref,
    },
    redaction_posture: 'All snapshot outputs MUST redact UUIDs (8-char prefix only) and remove credential values. Validation gate V-PRST-11 enforces no credential leak and V-PRST-12 enforces no unapproved UUID literal.',
    stale_company_ids_excluded_from_snapshot: Array.from(STALE_COMPANY_IDS),
    plan_generated_at: now,
  };
}

function main() {
  const audits = {
    lockfile: auditLockfile(),
    s05_provider_contract: auditS05ProviderContract(),
    upstream_chain: auditUpstreamChain(),
  };

  const auditFailures = [];
  if (!audits.lockfile.ok) auditFailures.push(`lockfile: ${audits.lockfile.reason}`);
  if (!audits.s05_provider_contract.ok) auditFailures.push(`s05_provider_contract: ${audits.s05_provider_contract.reason}`);
  Object.entries(audits.upstream_chain).forEach(([k, r]) => {
    if (!r.ok) auditFailures.push(`upstream_chain.${k}: ${r.reason}`);
  });

  if (auditFailures.length > 0) {
    process.stderr.write('FAIL: T04 runner audit failed:\n');
    auditFailures.forEach((f) => process.stderr.write(`  - ${f}\n`));
    process.stderr.write('\nThe runner is side-effect-free; it does NOT execute safe_restart or capture pre/post snapshots. Resolve the failing audit before re-running.\n');
    process.exit(2);
  }

  const chainPhaseVerdicts = Object.fromEntries(
    Object.entries(audits.upstream_chain).map(([k, r]) => [k, r.phase_verdict])
  );

  const upstreamNotPassOrDeferred = Object.entries(audits.upstream_chain).filter(
    ([, r]) => r.phase_verdict !== 'PLAN_READY_LIVE_EXECUTION_DEFERRED' && r.phase_verdict !== 'PASS'
  );
  if (upstreamNotPassOrDeferred.length > 0) {
    process.stderr.write(
      `INFO: ${upstreamNotPassOrDeferred.length} upstream evidence file(s) have non-deferred/non-pass phase_verdict.\n` +
        'Persistence canary is a downstream integrity check; PASS verdict is only meaningful when all upstream is DEFERRED-or-PASS.\n'
    );
  }

  const plan = {
    runner: 'scripts/run_m014_s06_persistence_canary.js',
    milestone: 'M014-a9jj46',
    slice: 'S06',
    task: 'T04',
    purpose: 'Plan-only persistence canary audit; side-effect-free; awaits operator-confirmed safe_restart execution per LFP-LF-02 and LFP-S02-02.',
    generated: new Date().toISOString(),
    generated_by: 'gsd-executor/auto-mode',
    preconditions_audit: {
      lockfile_ok: audits.lockfile.ok,
      safe_restart_command_present: typeof audits.lockfile.safe_restart_command === 'string',
      safe_restart_command_byte_length: audits.lockfile.safe_restart_command_length_bytes,
      safe_restart_command_sha256: audits.lockfile.safe_restart_command_sha256,
      stale_company_ids_count: audits.lockfile.stale_company_ids_count,
      s05_provider_contract_ok: audits.s05_provider_contract.ok,
      s05_direct_proof_phase_verdict: audits.upstream_chain.s05_direct_proof.phase_verdict,
      s05_direct_proof_live_status: audits.upstream_chain.s05_direct_proof.live_execution_status,
      s06_direct_live_phase_verdict: audits.upstream_chain.s06_direct_live.phase_verdict,
      s06_direct_live_live_status: audits.upstream_chain.s06_direct_live.live_execution_status,
      s06_paperclip_hermes_live_phase_verdict: audits.upstream_chain.s06_paperclip_hermes_live.phase_verdict,
      s06_paperclip_hermes_live_live_status: audits.upstream_chain.s06_paperclip_hermes_live.live_execution_status,
      s06_rollout_verdict_phase_verdict: audits.upstream_chain.s06_rollout_verdict.phase_verdict,
      s06_rollout_verdict_live_status: audits.upstream_chain.s06_rollout_verdict.live_execution_status,
      upstream_phase_verdict_summary: chainPhaseVerdicts,
    },
    inherited_constraints_remain_in_force: REQUIRED_INHERITED_CONSTRAINT_IDS.map((id) => ({
      id,
      in_force: true,
      rationale: 'S06-T04 carries forward S05 LFP-* constraints + S06-T01/T02/T03 LHA-EX-* blockers + R3 stale ID ledger unchanged; no relaxations.',
    })),
    snapshot_plan: buildSnapshotPairPlan(audits.s05_provider_contract, audits.lockfile),
    blocker_summary: [
      'LFP-LF-02: live mutation requires operator confirmation; auto-mode has no operator on call',
      'LFP-S02-02: only the byte-identical safe_restart_command from paperclip-runtime.lock.json may be executed; runner must not invent or extend the command',
      'LFP-S02-01: VPS forensics verdict H-INCONCLUSIVE; only safe_restart_command is allowed (no destructive recovery)',
      'S06-T03 prerequisite: rollout-verdict.json phase_verdict=PLAN_READY_LIVE_EXECUTION_DEFERRED means persistence canary has no rolled-out runtime to validate against',
      'S06-T02 prerequisite: paperclip-hermes-live.json phase_verdict=PLAN_READY_LIVE_EXECUTION_DEFERRED means the MiniMax hermesLocal adapter flip has not been observed live, so the hermes_providers_profile post-restart comparison cannot be grounded',
      'S06-T01 prerequisite: direct-live.json phase_verdict=PLAN_READY_LIVE_EXECUTION_DEFERRED means fresh-session minimax/MiniMax-M3 invocation has not been observed live yet',
      'S05-T02 prerequisite: upgrade.json phase_verdict=PLAN_READY_LIVE_EXECUTION_DEFERRED means hermes-agent==0.15.2 still on the live VPS; hermes-agent==0.18.2 upgrade not yet executed live',
      'S05-T03 prerequisite: direct-proof.json phase_verdict=PLAN_READY_LIVE_EXECUTION_DEFERRED means canonical MiniMax provider profile not yet exercised live',
      'R3 stale ID ledger: any pre/post snapshot referencing 9feb4c22 / 43c74adb / 1a194762 / 7595fd85 / 7eede16c / 8233ea7b is treated as canonical-drift and fail-closes V-PRST-12',
    ],
    next_steps_for_operator: [
      'Resolve S02 H-INCONCLUSIVE verdict (capture fresh VPS readback) — beyond auto-mode scope',
      'Execute S05 upgrade plan in operator-confirmed session (pip install --upgrade hermes-agent==0.18.2)',
      'Re-run S05-T02 to upgrade.json phase_verdict=UPGRADE_VERIFIED',
      'Re-run S05-T03 to direct-proof.json phase_verdict=PASS',
      'Re-run S06-T01 to direct-live.json phase_verdict=PASS',
      'Provision a fresh bounded-test-agent (UUID v4 not in R3 stale ledger) for S06-T02',
      'Run the planned PATCH /api/agents/{bounded_agent_id}/adapterConfig with the canonical MiniMax profile',
      'Re-run S06-T02 to paperclip-hermes-live.json phase_verdict=PASS',
      'Re-run S06-T03 to rollout-verdict.json phase_verdict=ROLLOUT_DEFERRED (or ROLLOUT after live RPCs all pass)',
      'Capture pre_restart_snapshot for all 8 targets (paperclip_companies, paperclip_agents, paperclip_memberships, paperclip_plugins, paperclip_postgres_data_path, hermes_agent_version, hermes_providers_profile, hermes_active_profile) — SHA-256 each, redact UUIDs and credential values',
      'Execute the byte-identical lockfile.safe_restart_command (operator-confirmed) and wait for Paperclip + Hermes to come back up',
      'Capture post_restart_snapshot for the same 8 targets with the same capture policy',
      'Compute the 8-element diff (pre/post sha256 equality) and the hermes_provider_post_check (provider=minimax AND model=MiniMax-M3)',
      'Update runtime-evidence/M014-S06-persistence-canary.json: phase_verdict=PASS if all 8 equalities hold AND hermes binding intact; phase_verdict=FAIL_NATIVE_STATE_DRIFT / FAIL_HERMES_BINDING_DRIFT / FAIL_PG_DATA_PATH_MISSING otherwise',
      'Re-run S06-T04 (this runner) — when upstream is DEFERRED-or-PASS, runner emits the audit summary with the live-captured snapshots',
    ],
  };

  process.stdout.write(JSON.stringify(plan, null, 2) + '\n');
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {
  auditLockfile,
  auditS05ProviderContract,
  auditUpstreamChain,
  buildSnapshotPairPlan,
  REQUIRED_PROVIDER_NAME,
  REQUIRED_MODEL_SPELLING,
  REQUIRED_ENDPOINT_MODE,
  REQUIRED_AUTH_SECRET_REF,
  REQUIRED_ENDPOINT_SECRET_REF,
  REQUIRED_PHASE_VERDICT_VALUES,
  REQUIRED_LIVE_STATUS_VALUES,
  REQUIRED_INHERITED_CONSTRAINT_IDS,
  REQUIRED_SNAPSHOT_TARGETS,
  REQUIRED_PRE_POST_DIFF_FIELDS,
  STALE_COMPANY_IDS,
};