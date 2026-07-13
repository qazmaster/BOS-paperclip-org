#!/usr/bin/env node
/*
 * M014-S06 T01 runner — Direct MiniMax M3 live proof.
 *
 * Side-effect-free planning + precondition audit. Does NOT open an
 * authenticated SSH session to VPS 87.99.146.178, does NOT invoke
 * hermes-paperclip against the MiniMax endpoint, and does NOT mutate
 * any runtime artifact.
 *
 * The runner audits:
 *   - paperclip-runtime.lock.json presence + safe_restart_command
 *   - M014-S05-minimax-provider-contract.json presence + canonical provider
 *   - M014-S05-minimax-direct-proof.json presence + admissible phase_verdict
 *   - M014-S06-minimax-direct-live.json presence + admissible phase_verdict
 *
 * It then emits a JSON plan to stdout describing the planned hermes-paperclip
 * invocation that an operator-confirmed live executor would run. The plan is
 * captured into runtime-evidence/M014-S06-minimax-direct-live.json by the
 * validator pipeline; the runner itself does NOT write to runtime-evidence.
 *
 * Exit code:
 *   0 = preconditions audited, plan is ready for operator-confirmed live execution
 *   2 = precondition gap (missing artifact, mismatched provider, etc.)
 *
 * Honours inherited LFP-* constraints from S05:
 *   LFP-LF-01 (prefer Paperclip routes; no core patch)
 *   LFP-LF-02 (live mutation requires operator confirmation)
 *   LFP-LF-03 (forbidden commands unless explicitly approved)
 *   LFP-S02-01 (VPS forensics H-INCONCLUSIVE; no destructive recovery)
 *   LFP-S02-02 (safe_restart_command is the one in lockfile only)
 *   LFP-S02-03 (stale ID ledger not canonical)
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = process.cwd();

const LOCKFILE = path.resolve(PROJECT_ROOT, 'paperclip-runtime.lock.json');
const S05_PROVIDER_CONTRACT = path.resolve(PROJECT_ROOT, 'runtime-evidence/M014-S05-minimax-provider-contract.json');
const S05_DIRECT_PROOF = path.resolve(PROJECT_ROOT, 'runtime-evidence/M014-S05-minimax-direct-proof.json');
const S06_DIRECT_LIVE_EVIDENCE = path.resolve(PROJECT_ROOT, 'runtime-evidence/M014-S06-minimax-direct-live.json');

const REQUIRED_PROVIDER_NAME = 'minimax';
const REQUIRED_MODEL_SPELLING = 'MiniMax-M3';
const REQUIRED_ENDPOINT_MODE = 'openai-compatible';
const REQUIRED_AUTH_SECRET_REF = 'MINIMAX_API_KEY';
const REQUIRED_ENDPOINT_SECRET_REF = 'MINIMAX_BASE_URL';

const REQUIRED_PHASE_VERDICT_VALUES = new Set([
  'PLAN_READY_LIVE_EXECUTION_DEFERRED',
  'PASS',
  'FAIL_PROVIDER_REGISTRY_MISMATCH',
  'FAIL_RESULTJSON_SCHEMA_INVALID',
  'FAIL_XIAOMI_ENDPOINT_REUSE',
  'FAIL_CREDENTIAL_LEAK',
  'FAIL_TERMINAL_NONZERO_EXIT',
  'BLOCKED_NO_OPERATOR_CONFIRMATION',
]);

const REQUIRED_LIVE_STATUS_VALUES = new Set([
  'pending-live-execution',
  'in-progress-live-execution',
  'passed-live-execution',
  'failed-live-execution',
  'deferred-to-fresh-readback-window',
]);

const REQUIRED_INHERITED_CONSTRAINT_IDS = [
  'LFP-LF-01',
  'LFP-LF-02',
  'LFP-LF-03',
  'LFP-S02-01',
  'LFP-S02-02',
  'LFP-S02-03',
];

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

function auditS05ProviderContract() {
  const result = readJsonOrFail(S05_PROVIDER_CONTRACT, 'M014-S05-minimax-provider-contract.json');
  if (!result.ok) return result;
  const contract = result.parsed;
  const providerName = contract.canonical_minimax_provider_name;
  const model = contract.canonical_model_spelling;
  const endpoint = contract.canonical_endpoint_mode;
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

function auditS05DirectProof() {
  const result = readJsonOrFail(S05_DIRECT_PROOF, 'M014-S05-minimax-direct-proof.json');
  if (!result.ok) return result;
  const proof = result.parsed;
  if (!REQUIRED_PHASE_VERDICT_VALUES.has(proof.phase_verdict)) {
    return { ok: false, reason: `S05 direct-proof.phase_verdict=${proof.phase_verdict} not in 8-value enum_lock` };
  }
  if (!REQUIRED_LIVE_STATUS_VALUES.has(proof.live_execution_status)) {
    return { ok: false, reason: `S05 direct-proof.live_execution_status=${proof.live_execution_status} not in 5-value enum_lock` };
  }
  return {
    ok: true,
    phase_verdict: proof.phase_verdict,
    live_execution_status: proof.live_execution_status,
    s05_live_execution_blocker_count: proof.live_execution_blocker_count || 0,
  };
}

function auditS06DirectLiveEvidence() {
  const result = readJsonOrFail(S06_DIRECT_LIVE_EVIDENCE, 'M014-S06-minimax-direct-live.json');
  if (!result.ok) return result;
  const evidence = result.parsed;
  if (!REQUIRED_PHASE_VERDICT_VALUES.has(evidence.phase_verdict)) {
    return { ok: false, reason: `S06 direct-live.phase_verdict=${evidence.phase_verdict} not in 8-value enum_lock` };
  }
  if (!REQUIRED_LIVE_STATUS_VALUES.has(evidence.live_execution_status)) {
    return { ok: false, reason: `S06 direct-live.live_execution_status=${evidence.live_execution_status} not in 5-value enum_lock` };
  }
  const inherited = (evidence.inherited_constraints_remain_in_force && evidence.inherited_constraints_remain_in_force.inherited_constraints) || [];
  const inheritedIds = new Set(inherited.map((c) => c && c.id));
  const missing = REQUIRED_INHERITED_CONSTRAINT_IDS.filter((id) => !inheritedIds.has(id));
  if (missing.length > 0) {
    return { ok: false, reason: `S06 direct-live inherited_constraints missing: ${missing.join(', ')}` };
  }
  return {
    ok: true,
    phase_verdict: evidence.phase_verdict,
    live_execution_status: evidence.live_execution_status,
    inherited_constraints_count: inherited.length,
  };
}

function buildPlannedInvocation(canonical) {
  return {
    policy: 'Live executor (operator-confirmed) MUST run this exact invocation against the MiniMax endpoint and capture all live_captured_* fields. The T01 auto-mode runner emits this plan only — no live mutation is performed.',
    planned_command: `/paperclip/hermes-runtime/bin/hermes-paperclip --provider=${canonical.canonical_provider_name} --model=${canonical.canonical_model_spelling} --timeout=300 --grace=5 --output-schema=bos --paperclip-secret-ref=${canonical.auth_secret_ref} --paperclip-secret-ref=${canonical.endpoint_secret_ref}`,
    command_argv: [
      '/paperclip/hermes-runtime/bin/hermes-paperclip',
      `--provider=${canonical.canonical_provider_name}`,
      `--model=${canonical.canonical_model_spelling}`,
      '--timeout=300',
      '--grace=5',
      '--output-schema=bos',
      `--paperclip-secret-ref=${canonical.auth_secret_ref}`,
      `--paperclip-secret-ref=${canonical.endpoint_secret_ref}`,
    ],
    expected_exit_code: 0,
    expected_session_id_format: 'YYYYMMDD_HHMMSS_<6hex> (e.g. 20260712_203000_a1b2c3) — must be fresh and MUST NOT match any M005-S01 Xiaomi session id',
    expected_resultJson_bos_shape: 'JSON object with at minimum keys {session_id, resultJson} where resultJson.bos is a BOS-shaped payload (per R5/R6 BOS Light standards)',
  };
}

function main() {
  const audits = {
    lockfile: auditLockfile(),
    s05_provider_contract: auditS05ProviderContract(),
    s05_direct_proof: auditS05DirectProof(),
    s06_direct_live_evidence: auditS06DirectLiveEvidence(),
  };

  const auditFailures = Object.entries(audits)
    .filter(([, r]) => !r.ok)
    .map(([k, r]) => `${k}: ${r.reason}`);

  if (auditFailures.length > 0) {
    process.stderr.write('FAIL: T01 runner audit failed:\n');
    auditFailures.forEach((f) => process.stderr.write(`  - ${f}\n`));
    process.stderr.write('\nThe runner is side-effect-free; it does NOT mutate state. Resolve the failing audit before re-running.\n');
    process.exit(2);
  }

  if (!audits.s06_direct_live_evidence.ok || audits.s06_direct_live_evidence.phase_verdict !== 'PLAN_READY_LIVE_EXECUTION_DEFERRED') {
    process.stderr.write(
      `INFO: S06 direct-live.phase_verdict=${audits.s06_direct_live_evidence.phase_verdict} (expected PLAN_READY_LIVE_EXECUTION_DEFERRED).\n` +
        'Live execution by the operator is blocked by LFP-LF-02 (operator confirmation required) and the inherited LFP-* constraints.\n'
    );
  }

  const plan = {
    runner: 'scripts/run_m014_s06_minimax_direct_live.js',
    milestone: 'M014-a9jj46',
    slice: 'S06',
    task: 'T01',
    purpose: 'Plan-only audit for direct MiniMax M3 live proof; side-effect-free; awaits operator-confirmed live executor per LFP-LF-02.',
    generated: new Date().toISOString(),
    generated_by: 'gsd-executor/auto-mode',
    preconditions_audit: {
      lockfile_ok: audits.lockfile.ok,
      safe_restart_command_present: typeof audits.lockfile.safe_restart_command === 'string',
      s05_provider_contract_ok: audits.s05_provider_contract.ok,
      s05_direct_proof_ok: audits.s05_direct_proof.ok,
      s05_phase_verdict: audits.s05_direct_proof.phase_verdict,
      s05_live_status: audits.s05_direct_proof.live_execution_status,
      s06_direct_live_evidence_ok: audits.s06_direct_live_evidence.ok,
      s06_phase_verdict: audits.s06_direct_live_evidence.phase_verdict,
      s06_live_status: audits.s06_direct_live_evidence.live_execution_status,
    },
    inherited_constraints_remain_in_force: REQUIRED_INHERITED_CONSTRAINT_IDS.map((id) => ({
      id,
      in_force: true,
      rationale: 'S06-T01 carries forward S05 LFP-* constraints unchanged; no relaxations.',
    })),
    planned_invocation: buildPlannedInvocation(audits.s05_provider_contract),
    blocker_summary: [
      'LFP-LF-02: live mutation requires operator confirmation; auto-mode has no operator on call',
      'LFP-S02-01: VPS forensics verdict H-INCONCLUSIVE; only safe_restart_command allowed',
      'S05-T03 prerequisite: phase_verdict=PLAN_READY_LIVE_EXECUTION_DEFERRED means prerequisite_state_for_S06_T01.gate_satisfied=false',
      'S05-T02 prerequisite: upgrade.json phase_verdict=PLAN_READY_LIVE_EXECUTION_DEFERRED means upgrade verification gate not yet passed',
    ],
    next_steps_for_operator: [
      'Resolve S02 H-INCONCLUSIVE verdict (capture fresh VPS readback) — beyond auto-mode scope',
      'Execute S05 upgrade plan in operator-confirmed session (pip install --upgrade hermes-agent==0.18.2)',
      'Re-run S05-T02 to upgrade.json phase_verdict=UPGRADE_VERIFIED',
      'Re-run S05-T03 to direct-proof.json phase_verdict=PASS',
      'Re-run S06-T01 to direct-live.json phase_verdict=PASS (this runner then becomes a thin wrapper that emits the captured stdout/stderr to runtime-evidence)',
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
  auditS05DirectProof,
  auditS06DirectLiveEvidence,
  buildPlannedInvocation,
  REQUIRED_PROVIDER_NAME,
  REQUIRED_MODEL_SPELLING,
  REQUIRED_ENDPOINT_MODE,
  REQUIRED_AUTH_SECRET_REF,
  REQUIRED_ENDPOINT_SECRET_REF,
  REQUIRED_INHERITED_CONSTRAINT_IDS,
};