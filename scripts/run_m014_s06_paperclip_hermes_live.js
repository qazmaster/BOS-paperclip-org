#!/usr/bin/env node
/*
 * M014-S06 T02 runner — Paperclip hermes_local MiniMax live proof.
 *
 * Side-effect-free planning + precondition audit. Does NOT mutate the
 * Paperclip adapterConfig.hermesLocal block on the live runtime, does NOT
 * PATCH the bounded test-agent, and does NOT invoke hermes-paperclip from
 * within Paperclip's process. The runner audits the same prerequisites as
 * T01 (lockfile + S05 provider-contract + S05 direct-proof + S06-T01
 * direct-live evidence) plus the new T02 artifact shape.
 *
 * It then emits a JSON plan to stdout describing the planned Paperclip
 * adapterConfig.hermesLocal flip (xiaomi/mimo-v2.5-pro ->
 * minimax/MiniMax-M3) on a bounded test-agent, the planned PAC-01..03
 * pre-adapter cleanup checks, and the planned xiaomi_adapter_config_prohibition
 * 4-layer detection — none of which are executed in the auto-mode lane.
 *
 * Exit code:
 *   0 = preconditions audited, plan is ready for operator-confirmed live execution
 *   2 = precondition gap (missing artifact, mismatched provider, etc.)
 *
 * Honours inherited LFP-* constraints from S05 + S06-T01 unchanged.
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

const REQUIRED_PROVIDER_NAME = 'minimax';
const REQUIRED_MODEL_SPELLING = 'MiniMax-M3';
const REQUIRED_ENDPOINT_MODE = 'openai-compatible';
const REQUIRED_AUTH_SECRET_REF = 'MINIMAX_API_KEY';
const REQUIRED_ENDPOINT_SECRET_REF = 'MINIMAX_BASE_URL';
const REQUIRED_BOUNDED_AGENT_KIND = 'bounded-test-agent';

const REQUIRED_PHASE_VERDICT_VALUES = new Set([
  'PLAN_READY_LIVE_EXECUTION_DEFERRED',
  'PASS',
  'FAIL_PAPERCLIP_ADAPTER_CONFIG_INVALID',
  'FAIL_HERMES_LOCAL_NOT_CLEAN_SESSION',
  'FAIL_XIAOMI_ADAPTER_CONFIG_REUSE',
  'FAIL_CREDENTIAL_LEAK',
  'FAIL_TERMINAL_NONZERO_EXIT',
  'BLOCKED_NO_OPERATOR_CONFIRMATION',
  'ROLLBACK_DECLARED',
]);

const REQUIRED_LIVE_STATUS_VALUES = new Set([
  'pending-live-execution',
  'in-progress-live-execution',
  'passed-live-execution',
  'failed-live-execution',
  'deferred-to-operator-confirmed-paperclip-adapter-flip',
]);

const REQUIRED_INHERITED_CONSTRAINT_IDS = [
  'LFP-LF-01',
  'LFP-LF-02',
  'LFP-LF-03',
  'LFP-S02-01',
  'LFP-S02-02',
  'LFP-S02-03',
];

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
  return {
    ok: true,
    safe_restart_command: lockfile.safe_restart_command,
    forbidden_commands_count: lockfile.forbidden_commands.length,
    stale_company_ids_count: staleCount,
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
    return { ok: false, reason: `S05 direct-proof.phase_verdict=${proof.phase_verdict} not in 9-value enum_lock` };
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
  // Cross-slice honesty: T01 evidence has its own fresh-readback framing
  // (deferred-to-fresh-readback-window), distinct from T02's bounded-agent
  // framing (deferred-to-operator-confirmed-paperclip-adapter-flip).
  // Verify admissibility against the file's OWN enum_lock arrays — same
  // pattern the validator uses for V-HM-LD-03 / V-HM-LD-04.
  const t01PhaseVerdictLock = Array.isArray(evidence.phase_verdict_enum_lock) ? evidence.phase_verdict_enum_lock : null;
  if (!t01PhaseVerdictLock || !t01PhaseVerdictLock.includes(evidence.phase_verdict)) {
    return { ok: false, reason: `S06 direct-live.phase_verdict=${evidence.phase_verdict} not in its own phase_verdict_enum_lock` };
  }
  const t01LiveStatusLock = Array.isArray(evidence.live_execution_status_enum_lock) ? evidence.live_execution_status_enum_lock : null;
  if (!t01LiveStatusLock || !t01LiveStatusLock.includes(evidence.live_execution_status)) {
    return { ok: false, reason: `S06 direct-live.live_execution_status=${evidence.live_execution_status} not in its own live_execution_status_enum_lock` };
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

function auditS06PaperclipHermesLiveEvidence() {
  const result = readJsonOrFail(S06_PAPERCLIP_HERMES_LIVE_EVIDENCE, 'M014-S06-paperclip-hermes-live.json');
  if (!result.ok) return result;
  const evidence = result.parsed;
  if (!REQUIRED_PHASE_VERDICT_VALUES.has(evidence.phase_verdict)) {
    return { ok: false, reason: `S06 paperclip-hermes-live.phase_verdict=${evidence.phase_verdict} not in 9-value enum_lock` };
  }
  if (!REQUIRED_LIVE_STATUS_VALUES.has(evidence.live_execution_status)) {
    return { ok: false, reason: `S06 paperclip-hermes-live.live_execution_status=${evidence.live_execution_status} not in 5-value enum_lock` };
  }
  const bounded = evidence.bounded_test_agent_target;
  if (!bounded || bounded.agent_kind !== REQUIRED_BOUNDED_AGENT_KIND) {
    return { ok: false, reason: `S06 paperclip-hermes-live bounded_test_agent_target.agent_kind must equal ${REQUIRED_BOUNDED_AGENT_KIND}` };
  }
  const pacResults = evidence.pre_adapter_cleanup_results;
  if (!pacResults || pacResults.checks_count !== 3) {
    return { ok: false, reason: 'S06 paperclip-hermes-live pre_adapter_cleanup_results.checks_count must be 3 (PAC-01..03)' };
  }
  const xrp = evidence.xiaomi_adapter_config_prohibition;
  if (!xrp || xrp.no_xiaomi_provider_name !== true || xrp.no_xiaomi_model_spelling !== true
    || xrp.no_xiaomi_secret_ref_use !== true || xrp.no_xiaomi_session_id_reuse !== true) {
    return { ok: false, reason: 'S06 paperclip-hermes-live xiaomi_adapter_config_prohibition layers not all true' };
  }
  const inherited = (evidence.inherited_constraints_remain_in_force && evidence.inherited_constraints_remain_in_force.inherited_constraints) || [];
  const inheritedIds = new Set(inherited.map((c) => c && c.id));
  const missing = REQUIRED_INHERITED_CONSTRAINT_IDS.filter((id) => !inheritedIds.has(id));
  if (missing.length > 0) {
    return { ok: false, reason: `S06 paperclip-hermes-live inherited_constraints missing: ${missing.join(', ')}` };
  }
  return {
    ok: true,
    phase_verdict: evidence.phase_verdict,
    live_execution_status: evidence.live_execution_status,
    bounded_agent_kind: bounded.agent_kind,
    pac_checks_count: pacResults.checks_count,
    inherited_constraints_count: inherited.length,
  };
}

function buildPlannedAdapterFlip(canonical) {
  return {
    policy: "Live executor (operator-confirmed) MUST execute this planned Paperclip adapterConfig.hermesLocal flip on a bounded-test-agent with a fresh, freshly-issued bounded_agent_id that does NOT match any R3 stale_company_id. The T02 auto-mode runner emits this plan only — no Paperclip mutation is performed.",
    bounded_agent_kind: REQUIRED_BOUNDED_AGENT_KIND,
    bounded_agent_id_format: "fresh <UUID v4> — NOT from stale_company_ids ledger; agent must be created in same operator session, not extracted from previous S04/S05 evidence",
    planned_http_invocation: {
      method: "PATCH",
      path_template: "/api/agents/{bounded_agent_id}/adapterConfig",
      expected_response_status: 200,
      expected_response_body_shape: "JSON object with at minimum keys {agent_id, adapterConfig, hermesLocal: {provider, model, endpoint_class, api_key_secret_ref, base_url_secret_ref, structured_output_schema, session_id_format_expected, timeoutSec, graceSec}}",
    },
    planned_body_payload: {
      adapterConfig: {
        hermesLocal: {
          provider: canonical.canonical_provider_name,
          model: canonical.canonical_model_spelling,
          endpoint_class: canonical.canonical_endpoint_mode,
          api_key_secret_ref: canonical.auth_secret_ref,
          base_url_secret_ref: canonical.endpoint_secret_ref,
          structured_output_schema: "bos",
          session_id_format_expected: "YYYYMMDD_HHMMSS_<6hex> (e.g. 20260712_203000_a1b2c3) — must be fresh and MUST NOT match any M005-S01 xiaomi session id",
          timeoutSec: 300,
          graceSec: 5,
        },
      },
    },
    delta_policy: "Field-level diff: provider xiaomi -> minimax; model mimo-v2.5-pro -> MiniMax-M3; endpoint_class openai-compatible (unchanged); api_key_secret_ref XIAOMI_API_KEY -> MINIMAX_API_KEY; base_url_secret_ref XIAOMI_BASE_URL -> MINIMAX_BASE_URL; structured_output_schema <preserved-or-bos>; session_id_format_expected <preserved-or-YYYYMMDD_HHMMSS_<6hex>>; timeoutSec <preserved-or-300>; graceSec <preserved-or-5>.",
    expected_exit_status: 200,
    expected_response_status_field: "adapterConfig.hermesLocal.provider === 'minimax' AND adapterConfig.hermesLocal.model === 'MiniMax-M3' AND adapterConfig.hermesLocal.api_key_secret_ref === 'MINIMAX_API_KEY' AND adapterConfig.hermesLocal.base_url_secret_ref === 'MINIMAX_BASE_URL'",
    expected_resultJson_bos_shape: "JSON object with at minimum keys {agent_id, adapterConfig, hermesLocal: {...canonical...}, resultJson} where resultJson.bos is a BOS-shaped payload (per R5/R6 BOS Light standards) and resultJson.bos.session_id == a fresh YYYYMMDD_HHMMSS_<6hex> identifier that does NOT appear in any M005-S01 xiaomi session id corpus",
  };
}

function main() {
  const audits = {
    lockfile: auditLockfile(),
    s05_provider_contract: auditS05ProviderContract(),
    s05_direct_proof: auditS05DirectProof(),
    s06_direct_live_evidence: auditS06DirectLiveEvidence(),
    s06_paperclip_hermes_live_evidence: auditS06PaperclipHermesLiveEvidence(),
  };

  const auditFailures = Object.entries(audits)
    .filter(([, r]) => !r.ok)
    .map(([k, r]) => `${k}: ${r.reason}`);

  if (auditFailures.length > 0) {
    process.stderr.write('FAIL: T02 runner audit failed:\n');
    auditFailures.forEach((f) => process.stderr.write(`  - ${f}\n`));
    process.stderr.write('\nThe runner is side-effect-free; it does NOT mutate Paperclip state. Resolve the failing audit before re-running.\n');
    process.exit(2);
  }

  if (!audits.s06_paperclip_hermes_live_evidence.ok || audits.s06_paperclip_hermes_live_evidence.phase_verdict !== 'PLAN_READY_LIVE_EXECUTION_DEFERRED') {
    process.stderr.write(
      `INFO: S06 paperclip-hermes-live.phase_verdict=${audits.s06_paperclip_hermes_live_evidence.phase_verdict} (expected PLAN_READY_LIVE_EXECUTION_DEFERRED).\n` +
        'Live execution by the operator is blocked by LFP-LF-02 (operator confirmation required) and the inherited LFP-* constraints.\n'
    );
  }

  const plan = {
    runner: 'scripts/run_m014_s06_paperclip_hermes_live.js',
    milestone: 'M014-a9jj46',
    slice: 'S06',
    task: 'T02',
    purpose: 'Plan-only audit for Paperclip hermes_local MiniMax live proof; side-effect-free; awaits operator-confirmed live executor per LFP-LF-02.',
    generated: new Date().toISOString(),
    generated_by: 'gsd-executor/auto-mode',
    preconditions_audit: {
      lockfile_ok: audits.lockfile.ok,
      safe_restart_command_present: typeof audits.lockfile.safe_restart_command === 'string',
      stale_company_ids_count: audits.lockfile.stale_company_ids_count,
      s05_provider_contract_ok: audits.s05_provider_contract.ok,
      s05_direct_proof_ok: audits.s05_direct_proof.ok,
      s05_phase_verdict: audits.s05_direct_proof.phase_verdict,
      s05_live_status: audits.s05_direct_proof.live_execution_status,
      s06_direct_live_evidence_ok: audits.s06_direct_live_evidence.ok,
      s06_direct_live_phase_verdict: audits.s06_direct_live_evidence.phase_verdict,
      s06_paperclip_hermes_live_evidence_ok: audits.s06_paperclip_hermes_live_evidence.ok,
      s06_paperclip_hermes_live_phase_verdict: audits.s06_paperclip_hermes_live_evidence.phase_verdict,
      s06_paperclip_hermes_live_live_status: audits.s06_paperclip_hermes_live_evidence.live_execution_status,
    },
    inherited_constraints_remain_in_force: REQUIRED_INHERITED_CONSTRAINT_IDS.map((id) => ({
      id,
      in_force: true,
      rationale: 'S06-T02 carries forward S05 LFP-* constraints + S06-T01 LHA-EX-S06T01-* blockers unchanged; no relaxations.',
    })),
    stale_company_ids_known: Array.from(STALE_COMPANY_IDS),
    planned_invocation: buildPlannedAdapterFlip(audits.s05_provider_contract),
    blocker_summary: [
      'LFP-LF-02: live mutation requires operator confirmation; auto-mode has no operator on call',
      'LFP-S02-01: VPS forensics verdict H-INCONCLUSIVE; only safe_restart_command allowed',
      'S06-T01 prerequisite: direct-live.json phase_verdict=PLAN_READY_LIVE_EXECUTION_DEFERRED means prerequisite_state_for_S06_T02.gate_satisfied=false',
      'S05-T02 prerequisite: upgrade.json phase_verdict=PLAN_READY_LIVE_EXECUTION_DEFERRED means hermes-agent==0.15.2 still on the live VPS; hermes-agent==0.18.2 upgrade not yet executed live',
      'S05-T03 prerequisite: direct-proof.json phase_verdict=PLAN_READY_LIVE_EXECUTION_DEFERRED means canonical MiniMax provider profile not yet exercised live',
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
  auditS06PaperclipHermesLiveEvidence,
  buildPlannedAdapterFlip,
  REQUIRED_PROVIDER_NAME,
  REQUIRED_MODEL_SPELLING,
  REQUIRED_ENDPOINT_MODE,
  REQUIRED_AUTH_SECRET_REF,
  REQUIRED_ENDPOINT_SECRET_REF,
  REQUIRED_BOUNDED_AGENT_KIND,
  REQUIRED_INHERITED_CONSTRAINT_IDS,
  STALE_COMPANY_IDS,
};