#!/usr/bin/env node
/*
 * M014-S06 T03 runner — fail-closed MiniMax rollout verdict computation.
 *
 * Side-effect-free planning + rollout verdict evaluation. Does NOT promote
 * Paperclip fleet, does NOT issue ROLLOUT verdict without canonical evidence,
 * and does NOT mutate any runtime artifact.
 *
 * The runner audits:
 *   - paperclip-runtime.lock.json presence + safe_restart_command
 *   - M014-S05-minimax-provider-contract.json (canonical MiniMax profile)
 *   - M014-S05-hermes-minimax-rollout.json (prior rollout verdict shape)
 *   - M014-S05-paperclip-hermes-minimax-proof.json (S05 bounded-agent proof)
 *   - M014-S05-minimax-direct-proof.json (S05 direct execution proof)
 *   - M014-S06-minimax-direct-live.json (S06-T01 direct-live proof)
 *   - M014-S06-paperclip-hermes-live.json (S06-T02 paperclip hermes_local proof)
 *
 * It then evaluates the rollout_verdict_field_audit and emits a JSON plan
 * describing the computed verdict and the path that the live executor would
 * take to promote it to ROLLOUT.
 *
 * Exit code:
 *   0 = verdict computed and emitted (deferred/rollout as computed)
 *   2 = precondition gap (missing artifact, contract mismatch, etc.)
 *
 * Honours inherited LFP-* constraints from S05 + S06-T01/T02 unchanged.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = process.cwd();

const LOCKFILE = path.resolve(PROJECT_ROOT, 'paperclip-runtime.lock.json');
const S05_PROVIDER_CONTRACT = path.resolve(PROJECT_ROOT, 'runtime-evidence/M014-S05-minimax-provider-contract.json');
const S05_ROLLOUT = path.resolve(PROJECT_ROOT, 'runtime-evidence/M014-S05-hermes-minimax-rollout.json');
const S05_PAPERCLIP_HERMES_PROOF = path.resolve(PROJECT_ROOT, 'runtime-evidence/M014-S05-paperclip-hermes-minimax-proof.json');
const S05_DIRECT_PROOF = path.resolve(PROJECT_ROOT, 'runtime-evidence/M014-S05-minimax-direct-proof.json');
const S06_DIRECT_LIVE = path.resolve(PROJECT_ROOT, 'runtime-evidence/M014-S06-minimax-direct-live.json');
const S06_PAPERCLIP_HERMES_LIVE = path.resolve(PROJECT_ROOT, 'runtime-evidence/M014-S06-paperclip-hermes-live.json');

const REQUIRED_PROVIDER_NAME = 'minimax';
const REQUIRED_MODEL_SPELLING = 'MiniMax-M3';
const REQUIRED_ENDPOINT_MODE = 'openai-compatible';
const REQUIRED_AUTH_SECRET_REF = 'MINIMAX_API_KEY';
const REQUIRED_ENDPOINT_SECRET_REF = 'MINIMAX_BASE_URL';

const REQUIRED_ROLLOUT_VERDICT_VALUES = new Set([
  'PLAN_READY_LIVE_EXECUTION_DEFERRED',
  'ROLLOUT',
  'ROLLOUT_DEFERRED',
  'ROLLBACK_DECLARED',
  'BLOCKED_RBC_TRIGGER',
  'BLOCKED_NO_OPERATOR_CONFIRMATION',
  'BLOCKED_PREREQUISITE_GAP',
]);

const REQUIRED_LIVE_STATUS_VALUES = new Set([
  'pending-live-execution',
  'in-progress-live-execution',
  'passed-live-execution',
  'failed-live-execution',
  'deferred-to-rollout-verdict-computation',
]);

const REQUIRED_INHERITED_CONSTRAINT_IDS = [
  'LFP-LF-01',
  'LFP-LF-02',
  'LFP-LF-03',
  'LFP-S02-01',
  'LFP-S02-02',
  'LFP-S02-03',
];

const REQUIRED_RPC_IDS = ['RPC-01', 'RPC-02', 'RPC-03', 'RPC-04'];
const REQUIRED_RBC_IDS = ['RBC-01', 'RBC-02', 'RBC-03'];

const S06_LIVE_PHASE_VERDICT_LOCK = new Set([
  'PLAN_READY_LIVE_EXECUTION_DEFERRED',
  'PASS',
  'FAIL_PROVIDER_REGISTRY_MISMATCH',
  'FAIL_RESULTJSON_SCHEMA_INVALID',
  'FAIL_XIAOMI_ENDPOINT_REUSE',
  'FAIL_CREDENTIAL_LEAK',
  'FAIL_TERMINAL_NONZERO_EXIT',
  'BLOCKED_NO_OPERATOR_CONFIRMATION',
  'FAIL_PAPERCLIP_ADAPTER_CONFIG_INVALID',
  'FAIL_HERMES_LOCAL_NOT_CLEAN_SESSION',
  'FAIL_XIAOMI_ADAPTER_CONFIG_REUSE',
  'ROLLBACK_DECLARED',
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
  return {
    ok: true,
    safe_restart_command: lockfile.safe_restart_command,
    forbidden_commands_count: lockfile.forbidden_commands.length,
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
  const modelSpelling = unwrapCanonicalField(contract.canonical_model_spelling, 'model_spelling', 'value');
  const endpointMode = unwrapCanonicalField(contract.canonical_endpoint_mode, 'endpoint_mode', 'value');
  if (providerName !== REQUIRED_PROVIDER_NAME) {
    return { ok: false, reason: `provider-contract.canonical_minimax_provider_name=${providerName} (expected ${REQUIRED_PROVIDER_NAME})` };
  }
  if (modelSpelling !== REQUIRED_MODEL_SPELLING) {
    return { ok: false, reason: `provider-contract.canonical_model_spelling=${modelSpelling} (expected ${REQUIRED_MODEL_SPELLING})` };
  }
  if (endpointMode !== REQUIRED_ENDPOINT_MODE) {
    return { ok: false, reason: `provider-contract.canonical_endpoint_mode=${endpointMode} (expected ${REQUIRED_ENDPOINT_MODE})` };
  }
  return {
    ok: true,
    canonical_provider_name: providerName,
    canonical_model_spelling: modelSpelling,
    canonical_endpoint_mode: endpointMode,
  };
}

function auditS05RolloutShape() {
  const result = readJsonOrFail(S05_ROLLOUT, 'M014-S05-hermes-minimax-rollout.json');
  if (!result.ok) return result;
  const rollout = result.parsed;
  const rpcs = (rollout.rollout_pre_conditions && rollout.rollout_pre_conditions.conditions) || [];
  const rbcs = (rollout.rollback_pre_conditions && rollout.rollback_pre_conditions.triggers) || [];
  const rpcIds = rpcs.map((c) => c && c.id);
  const rbcIds = rbcs.map((t) => t && t.id);
  const missingRpcs = REQUIRED_RPC_IDS.filter((id) => !rpcIds.includes(id));
  const missingRbcs = REQUIRED_RBC_IDS.filter((id) => !rbcIds.includes(id));
  if (missingRpcs.length > 0) {
    return { ok: false, reason: `S05 rollout missing RPC ids: ${missingRpcs.join(', ')}` };
  }
  if (missingRbcs.length > 0) {
    return { ok: false, reason: `S05 rollout missing RBC ids: ${missingRbcs.join(', ')}` };
  }
  return {
    ok: true,
    prior_rollout_verdict: rollout.rollout_verdict,
    rpc_count: rpcs.length,
    rbc_count: rbcs.length,
  };
}

function auditUpstreamPhaseVerdict(p, label) {
  const result = readJsonOrFail(p, label);
  if (!result.ok) return result;
  const evidence = result.parsed;
  if (!S06_LIVE_PHASE_VERDICT_LOCK.has(evidence.phase_verdict)) {
    return { ok: false, reason: `${label}.phase_verdict=${evidence.phase_verdict} not in admissible enum_lock` };
  }
  return {
    ok: true,
    phase_verdict: evidence.phase_verdict,
    live_execution_status: evidence.live_execution_status,
  };
}

function auditS06Chain() {
  const results = {
    s05_direct_proof: auditUpstreamPhaseVerdict(S05_DIRECT_PROOF, 'M014-S05-minimax-direct-proof.json'),
    s05_paperclip_hermes_proof: auditUpstreamPhaseVerdict(S05_PAPERCLIP_HERMES_PROOF, 'M014-S05-paperclip-hermes-minimax-proof.json'),
    s06_direct_live: auditUpstreamPhaseVerdict(S06_DIRECT_LIVE, 'M014-S06-minimax-direct-live.json'),
    s06_paperclip_hermes_live: auditUpstreamPhaseVerdict(S06_PAPERCLIP_HERMES_LIVE, 'M014-S06-paperclip-hermes-live.json'),
  };
  const allOk = Object.values(results).every((r) => r.ok);
  return { ok: allOk, results };
}

function computeRolloutVerdict(audits) {
  // Fail-closed verdict computation (T03-specific 7-value enum_lock).
  // 1. If any RBC trigger is observed (live_observed=true) -> ROLLBACK_DECLARED
  // 2. If no live observed yet (all upstream phase_verdict=PLAN_READY_LIVE_EXECUTION_DEFERRED) -> PLAN_READY_LIVE_EXECUTION_DEFERRED
  // 3. If upstream phase_verdict is BLOCKED_NO_OPERATOR_CONFIRMATION -> BLOCKED_NO_OPERATOR_CONFIRMATION
  // 4. If any upstream phase_verdict is BLOCKED_PREREQUISITE_GAP or FAIL_* -> BLOCKED_PREREQUISITE_GAP
  // 5. If all RPCs would pass but live not yet observed -> ROLLOUT_DEFERRED (awaiting live)
  // 6. All RPCs satisfied + zero RBCs + live observed -> ROLLOUT

  const phases = audits.s06_chain.results;
  const anyFail = Object.values(phases).some((r) =>
    r.phase_verdict !== 'PLAN_READY_LIVE_EXECUTION_DEFERRED' &&
    r.phase_verdict !== 'PASS'
  );
  if (anyFail) {
    const failedKeys = Object.entries(phases)
      .filter(([, r]) => r.phase_verdict !== 'PLAN_READY_LIVE_EXECUTION_DEFERRED' && r.phase_verdict !== 'PASS')
      .map(([k]) => k);
    return {
      rollout_verdict: 'BLOCKED_PREREQUISITE_GAP',
      rationale: `Upstream evidence has at least one non-deferred and non-pass phase_verdict: ${failedKeys.join(', ')}. Rollout is fail-closed until all upstream evidence reaches PLAN_READY_LIVE_EXECUTION_DEFERRED or PASS and live observation is recorded.`,
    };
  }
  const allDeferred = Object.values(phases).every((r) => r.phase_verdict === 'PLAN_READY_LIVE_EXECUTION_DEFERRED');
  if (allDeferred) {
    return {
      rollout_verdict: 'PLAN_READY_LIVE_EXECUTION_DEFERRED',
      rationale: 'All 4 upstream S05/S06 evidence files record phase_verdict=PLAN_READY_LIVE_EXECUTION_DEFERRED. No RPC has live_observed=true yet; no RBC trigger has been tripped. The rollout verdict cannot be promoted to ROLLOUT without an operator-confirmed live executor observing all 4 RPC-* conditions and zero RBC-* triggers.',
    };
  }
  return {
    rollout_verdict: 'ROLLOUT_DEFERRED',
    rationale: 'Some upstream evidence has reached PASS but not all; rollout remains deferred until all S05/S06 evidence reaches PASS and live observation is recorded.',
  };
}

function main() {
  const audits = {
    lockfile: auditLockfile(),
    s05_provider_contract: auditS05ProviderContract(),
    s05_rollout_shape: auditS05RolloutShape(),
    s06_chain: auditS06Chain(),
  };

  const auditFailures = [];
  if (!audits.lockfile.ok) auditFailures.push(`lockfile: ${audits.lockfile.reason}`);
  if (!audits.s05_provider_contract.ok) auditFailures.push(`s05_provider_contract: ${audits.s05_provider_contract.reason}`);
  if (!audits.s05_rollout_shape.ok) auditFailures.push(`s05_rollout_shape: ${audits.s05_rollout_shape.reason}`);
  if (!audits.s06_chain.ok) {
    Object.entries(audits.s06_chain.results).forEach(([k, r]) => {
      if (!r.ok) auditFailures.push(`s06_chain.${k}: ${r.reason}`);
    });
  }

  if (auditFailures.length > 0) {
    process.stderr.write('FAIL: T03 runner audit failed:\n');
    auditFailures.forEach((f) => process.stderr.write(`  - ${f}\n`));
    process.stderr.write('\nThe runner is side-effect-free; it does NOT mutate Paperclip state. Resolve the failing audit before re-running.\n');
    process.exit(2);
  }

  const verdict = computeRolloutVerdict(audits);

  const plan = {
    runner: 'scripts/build_m014_s06_rollout_verdict.js',
    milestone: 'M014-a9jj46',
    slice: 'S06',
    task: 'T03',
    purpose: 'Plan-only rollout verdict computation; side-effect-free; awaits operator-confirmed live executor per LFP-LF-02.',
    generated: new Date().toISOString(),
    generated_by: 'gsd-executor/auto-mode',
    preconditions_audit: {
      lockfile_ok: audits.lockfile.ok,
      safe_restart_command_present: typeof audits.lockfile.safe_restart_command === 'string',
      s05_provider_contract_ok: audits.s05_provider_contract.ok,
      s05_rollout_shape_ok: audits.s05_rollout_shape.ok,
      s05_prior_rollout_verdict: audits.s05_rollout_shape.prior_rollout_verdict,
      s05_direct_proof_phase_verdict: audits.s06_chain.results.s05_direct_proof.phase_verdict,
      s05_paperclip_hermes_proof_phase_verdict: audits.s06_chain.results.s05_paperclip_hermes_proof.phase_verdict,
      s06_direct_live_phase_verdict: audits.s06_chain.results.s06_direct_live.phase_verdict,
      s06_paperclip_hermes_live_phase_verdict: audits.s06_chain.results.s06_paperclip_hermes_live.phase_verdict,
    },
    inherited_constraints_remain_in_force: REQUIRED_INHERITED_CONSTRAINT_IDS.map((id) => ({
      id,
      in_force: true,
      rationale: 'S06-T03 carries forward S05 LFP-* constraints + S06-T01/T02 LHA-EX-* blockers unchanged; no relaxations.',
    })),
    computed_rollout_verdict: verdict.rollout_verdict,
    computed_rollout_verdict_rationale: verdict.rationale,
    rollout_pre_conditions_audit: REQUIRED_RPC_IDS.map((id) => ({
      rpc_id: id,
      live_observed: null,
      live_observed_status: 'pending-live-execution',
      upstream_phase_verdict: audits.s06_chain.results.s05_paperclip_hermes_proof.phase_verdict,
    })),
    rollback_pre_conditions_audit: REQUIRED_RBC_IDS.map((id) => ({
      rbc_id: id,
      tripped: false,
      live_observed: null,
      live_observed_status: 'pending-live-execution',
    })),
    blocker_summary: [
      'LFP-LF-02: live mutation requires operator confirmation; auto-mode has no operator on call',
      'LFP-S02-01: VPS forensics verdict H-INCONCLUSIVE; only safe_restart_command allowed',
      'S06-T01 prerequisite: direct-live.json phase_verdict=PLAN_READY_LIVE_EXECUTION_DEFERRED means RPC-04 no_xiaomi_endpoint_reuse cannot be live-observed',
      'S06-T02 prerequisite: paperclip-hermes-live.json phase_verdict=PLAN_READY_LIVE_EXECUTION_DEFERRED means RPC-01 pre_adapter_cleanup_all_passed and RPC-02 paperclip_hermes_local_terminal_success cannot be live-observed',
      'S05-T02 prerequisite: upgrade.json phase_verdict=PLAN_READY_LIVE_EXECUTION_DEFERRED means hermes-agent==0.15.2 still on the live VPS; hermes-agent==0.18.2 upgrade not yet executed live',
      'S05-T03 prerequisite: direct-proof.json phase_verdict=PLAN_READY_LIVE_EXECUTION_DEFERRED means RPC-03 resultJson_bos_schema_valid cannot be live-observed',
    ],
    next_steps_for_operator: [
      'Resolve S02 H-INCONCLUSIVE verdict (capture fresh VPS readback) — beyond auto-mode scope',
      'Execute S05 upgrade plan in operator-confirmed session (pip install --upgrade hermes-agent==0.18.2)',
      'Re-run S05-T02 to upgrade.json phase_verdict=UPGRADE_VERIFIED',
      'Re-run S05-T03 to direct-proof.json phase_verdict=PASS',
      'Re-run S06-T01 to direct-live.json phase_verdict=PASS',
      'Provision a fresh bounded-test-agent (UUID v4 not in R3 stale ledger) for S06-T02',
      'Run the planned PATCH /api/agents/{bounded_agent_id}/adapterConfig with the canonical MiniMax profile',
      'Capture redacted readback, terminal status, and resultJson.bos session_id into runtime-evidence/M014-S06-paperclip-hermes-live.json',
      'Re-run S06-T02 to paperclip-hermes-live.json phase_verdict=PASS',
      'Re-run S06-T03 (this runner) — rollout_verdict will be promoted to ROLLOUT only when all 4 RPC-* are live_observed=true AND 0 RBC triggers tripped',
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
  auditS05RolloutShape,
  auditS06Chain,
  computeRolloutVerdict,
  REQUIRED_PROVIDER_NAME,
  REQUIRED_MODEL_SPELLING,
  REQUIRED_ENDPOINT_MODE,
  REQUIRED_AUTH_SECRET_REF,
  REQUIRED_ENDPOINT_SECRET_REF,
  REQUIRED_ROLLOUT_VERDICT_VALUES,
  REQUIRED_LIVE_STATUS_VALUES,
  REQUIRED_INHERITED_CONSTRAINT_IDS,
  REQUIRED_RPC_IDS,
  REQUIRED_RBC_IDS,
};