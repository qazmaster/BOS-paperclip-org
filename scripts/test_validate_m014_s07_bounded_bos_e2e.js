#!/usr/bin/env node
/**
 * @file scripts/test_validate_m014_s07_bounded_bos_e2e.js
 *
 * M014-a9jj46/S07/T01 — Negative fixtures + happy-path tests for the
 * fail-closed entry contract.
 *
 * Verifies that validateEntryGate() against the canonical S04-S06 upstream
 * evidence correctly fails closed with at least 10 distinct blockers, and
 * that synthesized happy-path fixtures (each with all 30 checks satisfied)
 * pass. Negative fixtures mutate one invariant at a time and assert the
 * corresponding V-BOS-E2E-NN check produces a fail verdict.
 *
 * Run:
 *   node --test scripts/test_validate_m014_s07_bounded_bos_e2e.js
 *
 * The fixture builders construct artifacts that exactly match the validator's
 * expectations (enum_lock membership, LFP-* IDs, PFC names, LHA-* IDs,
 * RPC-/RBC- ids, snapshot target names, native surface classes, profile
 * keys, etc.) so happy-path fixtures pass cleanly.
 */

'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const validator = require('./validate_m014_s07_bounded_bos_e2e');

const {
  validateEntryGate,
  loadUpstreamArtifacts,
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
  CANONICAL_MINIMAX_PROVIDER,
  CANONICAL_MINIMAX_MODEL,
  R026_ROUTING_CHAIN,
  ENTRY_GATE_CHECKS
} = validator;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function inheritedConstraints() {
  return REQUIRED_INHERITED_CONSTRAINT_IDS.map((id) => ({
    id,
    in_force: true,
    rationale: `${id} inherited constraint carried forward into S07 entry-gate contract`
  }));
}

function inheritedConstraintsWrapper() {
  return {
    policy: 'all six inherited constraint IDs from LFP-* MUST remain in force',
    inherited_constraints: inheritedConstraints()
  };
}

function liveExecutionBlock() {
  return {
    live_execution_status: 'passed-live-execution',
    live_execution_status_enum_lock: REQUIRED_LIVE_EXECUTION_STATUS_ENUM,
    live_execution_status_rationale: 'promoted to passed-live-execution by operator-confirmed executor',
    fresh_readback_required: true,
    fresh_readback_via: 'operator-confirmed live executor on canonical VPS session'
  };
}

function makeEnvelope(rawExtra = {}) {
  const text = JSON.stringify(rawExtra);
  return { raw: text, parsed: JSON.parse(text) };
}

// ---------------------------------------------------------------------------
// Fixture builders — each builder returns { raw, parsed } matching the
// validator's contract for ONE upstream artifact. The happy-path fixtures
// must satisfy ALL 30 V-BOS-E2E-NN checks.
// ---------------------------------------------------------------------------

function buildValidS04Deploy() {
  const obj = {
    deployment_status: REQUIRED_DEPLOYMENT_STATUS,
    deployment_status_enum_lock: ['success', 'failed', 'rolled_back', 'blocked_no_preconditions'],
    nginx_lockdown_preserved: true,
    migrations_applied: {
      applied: true,
      count: 4,
      migration_ids: ['m_2026_707_001', 'm_2026_707_002', 'm_2026_707_003', 'm_2026_707_004']
    },
    image_pull_status: 'success',
    container_health_status: 'healthy',
    rollout_safety_constraints: inheritedConstraintsWrapper()
  };
  return makeEnvelope(obj);
}

function buildValidS04PostUpgrade() {
  const obj = {
    post_upgrade_verdict: REQUIRED_POST_UPGRADE_VERDICT,
    verdict_enum_lock: ['PASS', 'BLOCKED_NO_FRESH_READBACK', 'BLOCKED_NO_DEPLOY_ARTIFACTS', 'BLOCKED_NO_LIVE_API', 'BLOCKED_AUTH_DRIFT', 'BLOCKED_SIGNUP_LOCKDOWN_DRIFT', 'BLOCKED_VOLUME_LOSS', 'BLOCKED_HEALTH_DRIFT'],
    freshness_posture: {
      policy: 'fresh_readback_required',
      as_of: '2026-07-12',
      fresh_readback_performed: true
    },
    inherited_constraints_remain_in_force: inheritedConstraintsWrapper()
  };
  return makeEnvelope(obj);
}

function buildValidS04NativeSmoke() {
  const obj = {
    native_smoke_verdict: REQUIRED_NATIVE_SMOKE_VERDICT,
    bounded_native_smoke_attempted: true,
    verdict_enum_lock: ['PASS', 'BLOCKED_NO_LIVE_API', 'BLOCKED_NO_DEPLOY_ARTIFACTS', 'BLOCKED_AUTH_DRIFT', 'BLOCKED_ISSUE_CREATE_FAILED', 'BLOCKED_DOCUMENT_CREATE_FAILED', 'BLOCKED_COMMENT_CREATE_FAILED', 'BLOCKED_READBACK_HASH_MISMATCH'],
    promotable_surface_classes: [...REQUIRED_NATIVE_SURFACE_CLASSES],
    promotable_surface_count: REQUIRED_NATIVE_SURFACE_CLASSES.length,
    inherited_constraints_remain_in_force: inheritedConstraintsWrapper()
  };
  return makeEnvelope(obj);
}

function buildValidS05Upgrade() {
  const obj = {
    phase_verdict: REQUIRED_S05_UPGRADE_PHASE_VERDICTS[0],
    phase_verdict_enum_lock: ['PLAN_READY_LIVE_EXECUTION_DEFERRED', 'UPGRADE_VERIFIED_PENDING_MINIMAX_REGISTRY', 'UPGRADE_VERIFIED', 'ROLLBACK_EXECUTED', 'BLOCKED_NO_OPERATOR_CONFIRMATION'],
    pre_flight_checks_results: {
      checks_count: REQUIRED_PFC_CHECK_NAMES.length,
      checks: REQUIRED_PFC_CHECK_NAMES.map((name) => ({
        id: 'PFC-' + name.split('_').map((s) => s[0].toUpperCase() + s.slice(1)).join(''),
        name,
        passed: true,
        observed_at_utc: '2026-07-12T20:00:00Z'
      }))
    },
    patch_reconciliation_results: {
      patches_count: REQUIRED_LHA_PATCH_IDS.length,
      patches: REQUIRED_LHA_PATCH_IDS.map((id) => ({
        id,
        reconciled: true,
        compatibility_review: 'YES',
        evidence_pointer: `runtime-evidence/M014-S05-hermes-baseline.json#${id}`
      }))
    },
    ...liveExecutionBlock(),
    inherited_constraints_remain_in_force: inheritedConstraintsWrapper()
  };
  return makeEnvelope(obj);
}

function buildValidS05Direct() {
  const obj = {
    phase_verdict: REQUIRED_S05_DIRECT_PHASE_VERDICT,
    phase_verdict_enum_lock: ['PLAN_READY_LIVE_EXECUTION_DEFERRED', 'PASS', 'FAIL_PROVIDER_REGISTRY_MISMATCH', 'FAIL_RESULTJSON_SCHEMA_INVALID', 'FAIL_XIAOMI_ENDPOINT_REUSE', 'FAIL_CREDENTIAL_LEAK', 'FAIL_TERMINAL_NONZERO_EXIT', 'BLOCKED_NO_OPERATOR_CONFIRMATION'],
    provider_observed: CANONICAL_MINIMAX_PROVIDER,
    model_observed: CANONICAL_MINIMAX_MODEL,
    ...liveExecutionBlock(),
    inherited_constraints_remain_in_force: inheritedConstraintsWrapper()
  };
  return makeEnvelope(obj);
}

function buildValidS05Paperclip() {
  const profileShape = {};
  for (const k of REQUIRED_PAPERCLIP_PROFILE_KEYS) {
    profileShape[k] = k === 'provider' ? CANONICAL_MINIMAX_PROVIDER : k === 'model' ? CANONICAL_MINIMAX_MODEL : `placeholder_${k}`;
  }
  const obj = {
    phase_verdict: REQUIRED_S05_PAPERCLIP_PHASE_VERDICT,
    phase_verdict_enum_lock: ['PLAN_READY_LIVE_EXECUTION_DEFERRED', 'PASS', 'FAIL_PAPERCLIP_ADAPTER_CONFIG_INVALID', 'FAIL_HERMES_LOCAL_NOT_CLEAN_SESSION', 'FAIL_XIAOMI_ADAPTER_CONFIG_REUSE', 'FAIL_CREDENTIAL_LEAK', 'FAIL_TERMINAL_NONZERO_EXIT', 'BLOCKED_NO_OPERATOR_CONFIRMATION', 'ROLLBACK_DECLARED'],
    adapter_profile_target: {
      profile_shape: profileShape,
      profile_shape_key_count: REQUIRED_PAPERCLIP_PROFILE_KEYS.length
    },
    ...liveExecutionBlock(),
    inherited_constraints_remain_in_force: inheritedConstraintsWrapper()
  };
  return makeEnvelope(obj);
}

function buildValidS06DirectLive() {
  const prohibition = {};
  for (const f of REQUIRED_XIAOMI_PROHIBITION_FIELDS) prohibition[f] = true;
  const obj = {
    phase_verdict: REQUIRED_S06_DIRECT_LIVE_PHASE_VERDICT,
    phase_verdict_enum_lock: ['PLAN_READY_LIVE_EXECUTION_DEFERRED', 'PASS', 'FAIL_PROVIDER_REGISTRY_MISMATCH', 'FAIL_RESULTJSON_SCHEMA_INVALID', 'FAIL_XIAOMI_ENDPOINT_REUSE', 'FAIL_CREDENTIAL_LEAK', 'FAIL_TERMINAL_NONZERO_EXIT', 'BLOCKED_NO_OPERATOR_CONFIRMATION'],
    provider_observed: CANONICAL_MINIMAX_PROVIDER,
    model_observed: CANONICAL_MINIMAX_MODEL,
    xiaomi_endpoint_reuse_prohibition: prohibition,
    ...liveExecutionBlock(),
    inherited_constraints_remain_in_force: inheritedConstraintsWrapper()
  };
  return makeEnvelope(obj);
}

function buildValidS06PaperclipHermesLive() {
  const adapterProhibition = {};
  for (const f of REQUIRED_XIAOMI_ADAPTER_PROHIBITION_FIELDS) adapterProhibition[f] = true;
  // Use a fresh, non-stale bounded-agent prefix (8-char hex prefix only).
  const obj = {
    phase_verdict: REQUIRED_S06_PAPERCLIP_HERMES_LIVE_PHASE_VERDICT,
    phase_verdict_enum_lock: ['PLAN_READY_LIVE_EXECUTION_DEFERRED', 'PASS', 'FAIL_PAPERCLIP_ADAPTER_CONFIG_INVALID', 'FAIL_HERMES_LOCAL_NOT_CLEAN_SESSION', 'FAIL_XIAOMI_ADAPTER_CONFIG_REUSE', 'FAIL_CREDENTIAL_LEAK', 'FAIL_TERMINAL_NONZERO_EXIT', 'BLOCKED_NO_OPERATOR_CONFIRMATION', 'ROLLBACK_DECLARED'],
    bounded_agent_id_prefix: 'b0c4a6e8',
    xiaomi_adapter_config_prohibition: adapterProhibition,
    ...liveExecutionBlock(),
    inherited_constraints_remain_in_force: inheritedConstraintsWrapper()
  };
  return makeEnvelope(obj);
}

function buildValidS06Rollout() {
  const conds = REQUIRED_RPC_IDS.map((id, i) => ({
    id,
    name: `rpc_${id.toLowerCase().replace('-', '_')}`,
    live_observed: true,
    live_observed_status: 'passed-live-execution',
    upstream_phase_verdict_evidence: 'runtime-evidence/M014-S06-paperclip-hermes-live.json',
    upstream_phase_verdict_value: REQUIRED_S06_PAPERCLIP_HERMES_LIVE_PHASE_VERDICT,
    live_observed_required_for_ROLLOUT: true
  }));
  const triggers = REQUIRED_RBC_IDS.map((id) => ({
    id,
    name: `rbc_${id.toLowerCase().replace('-', '_')}`,
    tripped: false,
    live_observed: true,
    live_observed_status: 'passed-live-execution',
    trip_required_for_ROLLBACK_DECLARED: true
  }));
  const obj = {
    phase_verdict: REQUIRED_S06_ROLLOUT_PHASE_VERDICT,
    rollout_verdict: REQUIRED_S06_ROLLOUT_VERDICT,
    phase_verdict_enum_lock: ['PLAN_READY_LIVE_EXECUTION_DEFERRED', 'ROLLOUT', 'ROLLOUT_DEFERRED', 'ROLLBACK_DECLARED', 'BLOCKED_RBC_TRIGGER', 'BLOCKED_NO_OPERATOR_CONFIRMATION', 'BLOCKED_PREREQUISITE_GAP'],
    rollout_verdict_enum_lock: ['PLAN_READY_LIVE_EXECUTION_DEFERRED', 'ROLLOUT', 'ROLLOUT_DEFERRED', 'ROLLBACK_DECLARED', 'BLOCKED_RBC_TRIGGER', 'BLOCKED_NO_OPERATOR_CONFIRMATION', 'BLOCKED_PREREQUISITE_GAP'],
    rollout_pre_conditions: {
      conditions_count: REQUIRED_RPC_IDS.length,
      conditions: conds
    },
    rollback_pre_conditions: {
      triggers_count: REQUIRED_RBC_IDS.length,
      triggers: triggers
    },
    ...liveExecutionBlock(),
    inherited_constraints_remain_in_force: inheritedConstraintsWrapper()
  };
  return makeEnvelope(obj);
}

function buildValidS06Persistence() {
  const sha256Common = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
  const pre = {};
  const post = {};
  for (const t of REQUIRED_PERSISTENCE_TARGETS) {
    pre[t] = { target: t, sha256: sha256Common, captured_at_utc: '2026-07-12T20:30:00Z', correlation_id: '20260712_203000_a1b2c3' };
    post[t] = { target: t, sha256: sha256Common, captured_at_utc: '2026-07-12T20:35:00Z', correlation_id: '20260712_203500_d4e5f6' };
  }
  const obj = {
    phase_verdict: REQUIRED_S06_PERSISTENCE_PHASE_VERDICT,
    phase_verdict_enum_lock: ['PLAN_READY_LIVE_EXECUTION_DEFERRED', 'PASS', 'FAIL_PRE_SNAPSHOT_MISSING', 'FAIL_POST_SNAPSHOT_MISSING', 'FAIL_SAFE_RESTART_COMMAND_MUTATED', 'FAIL_NATIVE_STATE_DRIFT', 'FAIL_HERMES_BINDING_DRIFT', 'FAIL_CREDENTIAL_LEAK', 'FAIL_TERMINAL_NONZERO_EXIT', 'FAIL_PG_DATA_PATH_MISSING', 'BLOCKED_NO_OPERATOR_CONFIRMATION', 'BLOCKED_PREREQUISITE_GAP'],
    snapshot_target_set: [...REQUIRED_PERSISTENCE_TARGETS],
    snapshot_target_set_size: REQUIRED_PERSISTENCE_TARGETS.length,
    pre_restart_snapshot: pre,
    post_restart_snapshot: post,
    canonical_provider_expected_after_restart: {
      provider: CANONICAL_MINIMAX_PROVIDER,
      model: CANONICAL_MINIMAX_MODEL,
      endpoint_class: 'openai-compatible',
      api_key_secret_ref: 'MINIMAX_API_KEY',
      base_url_secret_ref: 'MINIMAX_BASE_URL'
    },
    ...liveExecutionBlock(),
    inherited_constraints_remain_in_force: inheritedConstraintsWrapper()
  };
  return makeEnvelope(obj);
}

function buildAllValidArtifacts() {
  return {
    s04Deploy: buildValidS04Deploy(),
    s04PostUpgrade: buildValidS04PostUpgrade(),
    s04NativeSmoke: buildValidS04NativeSmoke(),
    s05Upgrade: buildValidS05Upgrade(),
    s05Direct: buildValidS05Direct(),
    s05Paperclip: buildValidS05Paperclip(),
    s06DirectLive: buildValidS06DirectLive(),
    s06PaperclipHermesLive: buildValidS06PaperclipHermesLive(),
    s06Rollout: buildValidS06Rollout(),
    s06Persistence: buildValidS06Persistence()
  };
}

// ---------------------------------------------------------------------------
// Negative fixture helpers
// ---------------------------------------------------------------------------

function mutate(obj, key, value) {
  const copy = JSON.parse(JSON.stringify(obj));
  if (value === undefined) {
    delete copy[key];
  } else {
    copy[key] = value;
  }
  return copy;
}

function mutateArtifact(artifacts, key, field, value) {
  const copy = {};
  for (const k of Object.keys(artifacts)) {
    copy[k] = artifacts[k];
  }
  const envelope = artifacts[key];
  const newParsed = mutate(envelope.parsed, field, value);
  copy[key] = { raw: JSON.stringify(newParsed), parsed: newParsed };
  return copy;
}

function rerunWith(artifacts, targetEvidence) {
  return validateEntryGate(artifacts, targetEvidence);
}

function expectBlockerOn(result, ...substrs) {
  for (const sub of substrs) {
    assert.ok(
      result.blockers.some((b) => b.includes(sub)),
      `expected a blocker containing "${sub}"; got blockers: ${JSON.stringify(result.blockers)}`
    );
  }
}

function expectCheckVerdict(result, checkId, expectedVerdict) {
  const c = result.checks.find((c) => c.id === checkId);
  assert.ok(c, `check ${checkId} not present in result`);
  assert.equal(c.verdict, expectedVerdict, `check ${checkId} expected ${expectedVerdict}, got ${c.verdict} (note: ${c.note})`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('M014-S07-T01 entry-gate fail-closed contract', () => {
  describe('Current S04-S06 deferred state', () => {
    it('loads all 10 upstream artifacts from canonical paths', () => {
      const artifacts = loadUpstreamArtifacts();
      for (const k of Object.keys(validator.UPSTREAM_ARTIFACT_PATHS)) {
        assert.ok(artifacts[k], `${k} not loaded`);
        assert.ok(artifacts[k].parsed, `${k}.parsed missing`);
      }
    });

    it('validates entry-gate against actual upstream artifacts (must FAIL with >=10 blockers)', () => {
      const artifacts = loadUpstreamArtifacts();
      const result = validateEntryGate(artifacts, null);
      assert.equal(result.verdict, 'fail', 'entry-gate must fail closed against deferred upstream');
      assert.ok(result.blockers.length >= 10, `expected >=10 blockers, got ${result.blockers.length}`);
    });

    it('rejects current S04 deploy deployment_status=blocked_no_preconditions', () => {
      const artifacts = loadUpstreamArtifacts();
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'S04 deploy.deployment_status must equal "success"', 'blocked_no_preconditions');
    });

    it('rejects current S04 post-upgrade verdict=BLOCKED_NO_DEPLOY_ARTIFACTS', () => {
      const artifacts = loadUpstreamArtifacts();
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'S04 post-upgrade.post_upgrade_verdict must equal "PASS"');
    });

    it('rejects current S04 native-smoke verdict=BLOCKED_NO_LIVE_API', () => {
      const artifacts = loadUpstreamArtifacts();
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'S04 native-smoke.native_smoke_verdict must equal "PASS"');
    });

    it('rejects current S05/S06 deferred phase_verdicts', () => {
      const artifacts = loadUpstreamArtifacts();
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'S05 upgrade.phase_verdict must be one of');
      expectBlockerOn(result, 'S06 direct-live.phase_verdict must equal "PASS"');
      expectBlockerOn(result, 'S06 paperclip-hermes-live.phase_verdict must equal "PASS"');
      expectBlockerOn(result, 'S06 rollout must record phase_verdict="ROLLOUT"');
      expectBlockerOn(result, 'S06 persistence.phase_verdict must equal "PASS"');
    });

    it('records exactly 30 entry-gate checks (V-BOS-E2E-01..30)', () => {
      const artifacts = loadUpstreamArtifacts();
      const result = validateEntryGate(artifacts, null);
      assert.equal(result.summary.checks_count, 30);
      // fail_count is bounded by the number of FAILed checks. Against actual
      // deferred upstream, MOST checks fail but a small set of static checks
      // (redaction discipline, inherited-constraint ledger, enum_lock
      // membership, fresh_readback_required assertion) STILL PASS because the
      // evidence files are honest about their deferred state. We require
      // >=10 fail-closed blockers against the deferred S04-S06 chain.
      assert.ok(result.summary.fail_count >= 10, `expected >=10 fail-closed checks, got ${result.summary.fail_count}`);
      assert.equal(result.summary.checks_count - result.summary.fail_count, result.summary.pass_count);
    });
  });

  describe('Happy-path fixture (synthetic all-promoted state)', () => {
    let allValid;
    before(() => {
      allValid = buildAllValidArtifacts();
    });

    it('synthesized all-promoted fixture passes entry-gate (verdict=pass)', () => {
      const result = validateEntryGate(allValid, null);
      assert.equal(result.verdict, 'pass', `expected pass, got ${JSON.stringify(result.blockers)}`);
      assert.equal(result.blockers.length, 0);
      assert.equal(result.summary.checks_count, 30);
      assert.equal(result.summary.pass_count, 30);
      assert.equal(result.summary.fail_count, 0);
    });

    it('all 30 V-BOS-E2E-NN checks return verdict=pass', () => {
      const result = validateEntryGate(allValid, null);
      for (const c of result.checks) {
        assert.equal(c.verdict, 'pass', `check ${c.id} should pass: ${c.note}`);
      }
    });
  });

  describe('Negative fixtures — fail-closed per check', () => {
    let baseline;
    before(() => {
      baseline = buildAllValidArtifacts();
    });

    it('V-BOS-E2E-01: missing one upstream artifact', () => {
      const artifacts = { ...baseline };
      delete artifacts.s04Deploy;
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'missing upstream artifacts: s04Deploy');
      expectCheckVerdict(result, 'V-BOS-E2E-01', 'fail');
    });

    it('V-BOS-E2E-02: S04 deploy deployment_status not success', () => {
      const artifacts = mutateArtifact(baseline, 's04Deploy', 'deployment_status', 'blocked_no_preconditions');
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'S04 deploy.deployment_status must equal "success"', 'blocked_no_preconditions');
      expectCheckVerdict(result, 'V-BOS-E2E-02', 'fail');
    });

    it('V-BOS-E2E-03: S04 deploy nginx_lockdown_preserved=false', () => {
      const artifacts = mutateArtifact(baseline, 's04Deploy', 'nginx_lockdown_preserved', false);
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'nginx_lockdown_preserved must be true');
      expectCheckVerdict(result, 'V-BOS-E2E-03', 'fail');
    });

    it('V-BOS-E2E-04: S04 deploy migrations_applied.applied=false', () => {
      const mutated = mutate(baseline.s04Deploy.parsed, 'migrations_applied', { applied: false, count: 0, migration_ids: [] });
      const artifacts = { ...baseline, s04Deploy: { raw: JSON.stringify(mutated), parsed: mutated } };
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'migrations_applied.applied must be true with count>=1');
      expectCheckVerdict(result, 'V-BOS-E2E-04', 'fail');
    });

    it('V-BOS-E2E-05: S04 post-upgrade verdict=BLOCKED_NO_DEPLOY_ARTIFACTS', () => {
      const artifacts = mutateArtifact(baseline, 's04PostUpgrade', 'post_upgrade_verdict', 'BLOCKED_NO_DEPLOY_ARTIFACTS');
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'S04 post-upgrade.post_upgrade_verdict must equal "PASS"');
      expectCheckVerdict(result, 'V-BOS-E2E-05', 'fail');
    });

    it('V-BOS-E2E-06: S04 post-upgrade fresh_readback_performed=false', () => {
      const mutated = mutate(baseline.s04PostUpgrade.parsed, 'freshness_posture', { policy: 'snapshot', fresh_readback_performed: false });
      const artifacts = { ...baseline, s04PostUpgrade: { raw: JSON.stringify(mutated), parsed: mutated } };
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'fresh_readback_performed must be true');
      expectCheckVerdict(result, 'V-BOS-E2E-06', 'fail');
    });

    it('V-BOS-E2E-07: S04 native-smoke verdict=BLOCKED_NO_LIVE_API', () => {
      const artifacts = mutateArtifact(baseline, 's04NativeSmoke', 'native_smoke_verdict', 'BLOCKED_NO_LIVE_API');
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'S04 native-smoke.native_smoke_verdict must equal "PASS"');
      expectCheckVerdict(result, 'V-BOS-E2E-07', 'fail');
    });

    it('V-BOS-E2E-08a: S04 native-smoke bounded_native_smoke_attempted=false', () => {
      const artifacts = mutateArtifact(baseline, 's04NativeSmoke', 'bounded_native_smoke_attempted', false);
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'bounded_native_smoke_attempted must be true');
      expectCheckVerdict(result, 'V-BOS-E2E-08', 'fail');
    });

    it('V-BOS-E2E-08b: S04 native-smoke missing one surface class (e.g. comment_readback)', () => {
      const mutated = mutate(baseline.s04NativeSmoke.parsed, 'promotable_surface_classes', ['issue_create', 'issue_readback', 'document_create', 'document_readback', 'comment_create']);
      const artifacts = { ...baseline, s04NativeSmoke: { raw: JSON.stringify(mutated), parsed: mutated } };
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'promotable_surface_classes missing', 'comment_readback');
      expectCheckVerdict(result, 'V-BOS-E2E-08', 'fail');
    });

    it('V-BOS-E2E-09: S05 upgrade phase_verdict=PLAN_READY_LIVE_EXECUTION_DEFERRED', () => {
      const artifacts = mutateArtifact(baseline, 's05Upgrade', 'phase_verdict', 'PLAN_READY_LIVE_EXECUTION_DEFERRED');
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'S05 upgrade.phase_verdict must be one of', 'PLAN_READY_LIVE_EXECUTION_DEFERRED');
      expectCheckVerdict(result, 'V-BOS-E2E-09', 'fail');
    });

    it('V-BOS-E2E-10a: S05 upgrade missing one PFC check (timeout_handling)', () => {
      const filtered = REQUIRED_PFC_CHECK_NAMES.filter((n) => n !== 'timeout_handling');
      const mutated = mutate(baseline.s05Upgrade.parsed, 'pre_flight_checks_results', {
        checks_count: filtered.length,
        checks: filtered.map((name) => ({ name, passed: true }))
      });
      const artifacts = { ...baseline, s05Upgrade: { raw: JSON.stringify(mutated), parsed: mutated } };
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'pre_flight_checks_results must cover', 'timeout_handling');
      expectCheckVerdict(result, 'V-BOS-E2E-10', 'fail');
    });

    it('V-BOS-E2E-10b: S05 upgrade one PFC check passed=false', () => {
      const pfc = baseline.s05Upgrade.parsed.pre_flight_checks_results;
      const failingIdx = 0;
      const newChecks = pfc.checks.map((c, i) => (i === failingIdx ? { ...c, passed: false } : c));
      const mutated = mutate(baseline.s05Upgrade.parsed, 'pre_flight_checks_results', {
        checks_count: newChecks.length,
        checks: newChecks
      });
      const artifacts = { ...baseline, s05Upgrade: { raw: JSON.stringify(mutated), parsed: mutated } };
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'non_passed=cli_startup');
      expectCheckVerdict(result, 'V-BOS-E2E-10', 'fail');
    });

    it('V-BOS-E2E-11: S05 upgrade missing one LHA-* patch reconciliation', () => {
      const filtered = REQUIRED_LHA_PATCH_IDS.filter((id) => id !== 'LHA-SECRET-REF-ENVELOPE');
      const mutated = mutate(baseline.s05Upgrade.parsed, 'patch_reconciliation_results', {
        patches_count: filtered.length,
        patches: filtered.map((id) => ({ id, reconciled: true }))
      });
      const artifacts = { ...baseline, s05Upgrade: { raw: JSON.stringify(mutated), parsed: mutated } };
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'patch_reconciliation_results must cover', 'LHA-SECRET-REF-ENVELOPE');
      expectCheckVerdict(result, 'V-BOS-E2E-11', 'fail');
    });

    it('V-BOS-E2E-12: S05 direct-proof phase_verdict=PLAN_READY_LIVE_EXECUTION_DEFERRED', () => {
      const artifacts = mutateArtifact(baseline, 's05Direct', 'phase_verdict', 'PLAN_READY_LIVE_EXECUTION_DEFERRED');
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'S05 direct-proof.phase_verdict must equal "PASS"');
      expectCheckVerdict(result, 'V-BOS-E2E-12', 'fail');
    });

    it('V-BOS-E2E-13a: S05 paperclip-proof phase_verdict=BLOCKED', () => {
      const artifacts = mutateArtifact(baseline, 's05Paperclip', 'phase_verdict', 'PLAN_READY_LIVE_EXECUTION_DEFERRED');
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'S05 paperclip-proof.phase_verdict must equal "PASS"');
      expectCheckVerdict(result, 'V-BOS-E2E-13', 'fail');
    });

    it('V-BOS-E2E-13b: S05 paperclip-proof profile_shape missing session_id_format_expected', () => {
      const profileShape = baseline.s05Paperclip.parsed.adapter_profile_target.profile_shape;
      const newShape = { ...profileShape };
      delete newShape.session_id_format_expected;
      const mutated = mutate(baseline.s05Paperclip.parsed, 'adapter_profile_target', {
        profile_shape: newShape,
        profile_shape_key_count: REQUIRED_PAPERCLIP_PROFILE_KEYS.length - 1
      });
      const artifacts = { ...baseline, s05Paperclip: { raw: JSON.stringify(mutated), parsed: mutated } };
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'profile_shape missing keys', 'session_id_format_expected');
      expectCheckVerdict(result, 'V-BOS-E2E-13', 'fail');
    });

    it('V-BOS-E2E-14: S06 direct-live phase_verdict=PLAN_READY_LIVE_EXECUTION_DEFERRED', () => {
      const artifacts = mutateArtifact(baseline, 's06DirectLive', 'phase_verdict', 'PLAN_READY_LIVE_EXECUTION_DEFERRED');
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'S06 direct-live.phase_verdict must equal "PASS"');
      expectCheckVerdict(result, 'V-BOS-E2E-14', 'fail');
    });

    it('V-BOS-E2E-15: S06 direct-live provider_observed=xiaomi (drift)', () => {
      const artifacts = mutateArtifact(baseline, 's06DirectLive', 'provider_observed', 'xiaomi');
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'must observe provider=minimax AND model=MiniMax-M3', 'provider=xiaomi');
      expectCheckVerdict(result, 'V-BOS-E2E-15', 'fail');
    });

    it('V-BOS-E2E-16: S06 paperclip-hermes-live phase_verdict drift', () => {
      const artifacts = mutateArtifact(baseline, 's06PaperclipHermesLive', 'phase_verdict', 'PLAN_READY_LIVE_EXECUTION_DEFERRED');
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'S06 paperclip-hermes-live.phase_verdict must equal "PASS"');
      expectCheckVerdict(result, 'V-BOS-E2E-16', 'fail');
    });

    it('V-BOS-E2E-17a: S06 paperclip bounded_agent_id_prefix matches R3 stale ledger (9feb4c22)', () => {
      const artifacts = mutateArtifact(baseline, 's06PaperclipHermesLive', 'bounded_agent_id_prefix', '9feb4c22');
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'bounded_agent_id_prefix "9feb4c22" is in R3 stale_company_ids ledger');
      expectCheckVerdict(result, 'V-BOS-E2E-17', 'fail');
    });

    it('V-BOS-E2E-17b: S06 paperclip bounded_agent_id_prefix missing', () => {
      const artifacts = mutateArtifact(baseline, 's06PaperclipHermesLive', 'bounded_agent_id_prefix', undefined);
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'must record bounded_agent_id_prefix');
      expectCheckVerdict(result, 'V-BOS-E2E-17', 'fail');
    });

    it('V-BOS-E2E-18: S06 rollout phase_verdict=ROLLBACK_DECLARED', () => {
      const mutated = mutate(baseline.s06Rollout.parsed, 'rollout_verdict', 'ROLLBACK_DECLARED');
      const mutated2 = mutate(mutated, 'phase_verdict', 'ROLLBACK_DECLARED');
      const artifacts = { ...baseline, s06Rollout: { raw: JSON.stringify(mutated2), parsed: mutated2 } };
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'S06 rollout must record phase_verdict="ROLLOUT" AND rollout_verdict="ROLLOUT"');
      expectCheckVerdict(result, 'V-BOS-E2E-18', 'fail');
    });

    it('V-BOS-E2E-19: S06 rollout RPC-04 live_observed=false', () => {
      const conds = baseline.s06Rollout.parsed.rollout_pre_conditions.conditions.map((c) =>
        c.id === 'RPC-04' ? { ...c, live_observed: false, live_observed_status: 'pending-live-execution' } : c
      );
      const mutated = mutate(baseline.s06Rollout.parsed, 'rollout_pre_conditions', { conditions_count: conds.length, conditions: conds });
      const artifacts = { ...baseline, s06Rollout: { raw: JSON.stringify(mutated), parsed: mutated } };
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'all 4 RPC-* must be live_observed=true', 'RPC-04');
      expectCheckVerdict(result, 'V-BOS-E2E-19', 'fail');
    });

    it('V-BOS-E2E-20: S06 rollout RBC-02 tripped=true', () => {
      const triggers = baseline.s06Rollout.parsed.rollback_pre_conditions.triggers.map((t) =>
        t.id === 'RBC-02' ? { ...t, tripped: true } : t
      );
      const mutated = mutate(baseline.s06Rollout.parsed, 'rollback_pre_conditions', { triggers_count: triggers.length, triggers: triggers });
      const artifacts = { ...baseline, s06Rollout: { raw: JSON.stringify(mutated), parsed: mutated } };
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'zero RBC-* triggers must be tripped', 'RBC-02');
      expectCheckVerdict(result, 'V-BOS-E2E-20', 'fail');
    });

    it('V-BOS-E2E-21: S06 persistence phase_verdict=BLOCKED_PREREQUISITE_GAP', () => {
      const artifacts = mutateArtifact(baseline, 's06Persistence', 'phase_verdict', 'BLOCKED_PREREQUISITE_GAP');
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'S06 persistence.phase_verdict must equal "PASS"');
      expectCheckVerdict(result, 'V-BOS-E2E-21', 'fail');
    });

    it('V-BOS-E2E-22: S06 persistence pre/post sha256 mismatch on hermes_providers_profile', () => {
      const post = baseline.s06Persistence.parsed.post_restart_snapshot;
      const newPost = {
        ...post,
        hermes_providers_profile: {
          ...post.hermes_providers_profile,
          sha256: 'feedfacecafebeefdeadbeefcafebabe0123456789abcdef0123456789abcdef'
        }
      };
      const mutated = mutate(baseline.s06Persistence.parsed, 'post_restart_snapshot', newPost);
      const artifacts = { ...baseline, s06Persistence: { raw: JSON.stringify(mutated), parsed: mutated } };
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'pre/post sha256 must match on all 8 targets', 'hermes_providers_profile');
      expectCheckVerdict(result, 'V-BOS-E2E-22', 'fail');
    });

    it('V-BOS-E2E-23: S06 persistence hermes binding drift to xiaomi/MiniMax-M3', () => {
      const mutated = mutate(baseline.s06Persistence.parsed, 'canonical_provider_expected_after_restart', {
        provider: 'xiaomi',
        model: 'mimo-v2.5-pro',
        endpoint_class: 'openai-compatible',
        api_key_secret_ref: 'XIAOMI_API_KEY',
        base_url_secret_ref: 'XIAOMI_BASE_URL'
      });
      const artifacts = { ...baseline, s06Persistence: { raw: JSON.stringify(mutated), parsed: mutated } };
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'canonical_provider_expected_after_restart must declare provider=minimax');
      expectCheckVerdict(result, 'V-BOS-E2E-23', 'fail');
    });

    it('V-BOS-E2E-24a: S06 direct xiaomi_endpoint_reuse_prohibition no_xiaomi_api_key_use=false', () => {
      const prohibition = { ...baseline.s06DirectLive.parsed.xiaomi_endpoint_reuse_prohibition };
      prohibition.no_xiaomi_api_key_use = false;
      const mutated = mutate(baseline.s06DirectLive.parsed, 'xiaomi_endpoint_reuse_prohibition', prohibition);
      const artifacts = { ...baseline, s06DirectLive: { raw: JSON.stringify(mutated), parsed: mutated } };
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'xiaomi_endpoint_reuse_prohibition missing', 'no_xiaomi_api_key_use');
      expectCheckVerdict(result, 'V-BOS-E2E-24', 'fail');
    });

    it('V-BOS-E2E-24b: S06 paperclip xiaomi_adapter_config_prohibition no_xiaomi_adapter_endpoint_use=false', () => {
      const prohibition = { ...baseline.s06PaperclipHermesLive.parsed.xiaomi_adapter_config_prohibition };
      prohibition.no_xiaomi_adapter_endpoint_use = false;
      const mutated = mutate(baseline.s06PaperclipHermesLive.parsed, 'xiaomi_adapter_config_prohibition', prohibition);
      const artifacts = { ...baseline, s06PaperclipHermesLive: { raw: JSON.stringify(mutated), parsed: mutated } };
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'xiaomi_adapter_config_prohibition missing', 'no_xiaomi_adapter_endpoint_use');
      expectCheckVerdict(result, 'V-BOS-E2E-24', 'fail');
    });

    it('V-BOS-E2E-25: S05 upgrade missing one inherited constraint (LFP-S02-03)', () => {
      const filtered = REQUIRED_INHERITED_CONSTRAINT_IDS.filter((id) => id !== 'LFP-S02-03');
      const mutated = mutate(baseline.s05Upgrade.parsed, 'inherited_constraints_remain_in_force', {
        inherited_constraints: filtered.map((id) => ({ id, in_force: true, rationale: 'partial' }))
      });
      const artifacts = { ...baseline, s05Upgrade: { raw: JSON.stringify(mutated), parsed: mutated } };
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 's05Upgrade inherited_constraints missing LFP-* IDs', 'LFP-S02-03');
      expectCheckVerdict(result, 'V-BOS-E2E-25', 'fail');
    });

    it('V-BOS-E2E-26a: credential leak in S05 upgrade raw text', () => {
      const leakedRaw = JSON.stringify(baseline.s05Upgrade.parsed).replace(
        /"phase_verdict":"UPGRADE_VERIFIED"/,
        '"phase_verdict":"UPGRADE_VERIFIED","_leak":"XIAOMI_API_KEY=tp-sd7b39f0xxxxxxxx"'
      );
      const leakedParsed = JSON.parse(leakedRaw);
      const artifacts = { ...baseline, s05Upgrade: { raw: leakedRaw, parsed: leakedParsed } };
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 's05Upgrade credential leak', 'XIAOMI_API_KEY');
      expectCheckVerdict(result, 'V-BOS-E2E-26', 'fail');
    });

    it('V-BOS-E2E-26b: full UUID literal in S06 rollout raw text (not in R3 ledger)', () => {
      // Use a non-approved 8-char prefix (12345678) that is NOT in
      // APPROVED_UUID_PREFIXES (which contains only R3 stale prefixes +
      // documentation-shaped zero/ones/aaa/ffff/deadbeef/cafebabe).
      const leakedRaw = JSON.stringify(baseline.s06Rollout.parsed).replace(
        /"phase_verdict":"ROLLOUT"/,
        '"phase_verdict":"ROLLOUT","_leaked":"12345678-1234-4567-89ab-cdef01234567"'
      );
      const leakedParsed = JSON.parse(leakedRaw);
      const artifacts = { ...baseline, s06Rollout: { raw: leakedRaw, parsed: leakedParsed } };
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 's06Rollout unapproved UUID literal', '12345678-****-****-****-************');
      expectCheckVerdict(result, 'V-BOS-E2E-26', 'fail');
    });

    it('V-BOS-E2E-27: S06 persistence phase_verdict_enum_lock missing PASS', () => {
      const mutated = mutate(baseline.s06Persistence.parsed, 'phase_verdict_enum_lock', [
        'PLAN_READY_LIVE_EXECUTION_DEFERRED',
        'BLOCKED_NO_OPERATOR_CONFIRMATION'
      ]);
      const artifacts = { ...baseline, s06Persistence: { raw: JSON.stringify(mutated), parsed: mutated } };
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 's06Persistence.phase_verdict_enum_lock missing admissible value(s)', 'PASS');
      expectCheckVerdict(result, 'V-BOS-E2E-27', 'fail');
    });

    it('V-BOS-E2E-28: S05 upgrade live_execution_status outside enum_lock', () => {
      const mutated = mutate(baseline.s05Upgrade.parsed, 'live_execution_status', 'unrecognized_status');
      const artifacts = { ...baseline, s05Upgrade: { raw: JSON.stringify(mutated), parsed: mutated } };
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, '#1 live_execution_status "unrecognized_status" not in declared enum_lock');
      expectCheckVerdict(result, 'V-BOS-E2E-28', 'fail');
    });

    it('V-BOS-E2E-28b: S05 upgrade fresh_readback_required=false', () => {
      const mutated = mutate(baseline.s05Upgrade.parsed, 'fresh_readback_required', false);
      const artifacts = { ...baseline, s05Upgrade: { raw: JSON.stringify(mutated), parsed: mutated } };
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, '#1 fresh_readback_required must be true');
      expectCheckVerdict(result, 'V-BOS-E2E-28', 'fail');
    });

    it('V-BOS-E2E-29: fail-closed artifact with business_mutation_count > 0', () => {
      // Build a target S07 fail-closed evidence with business_mutation_count=1.
      const target = {
        business_mutation_count: 1,
        ledger: {
          issues_created: 1,
          heartbeat_runs_started: 0,
          unexpected_mutating_routes: 0,
          unconfirmed_live_side_effects: 0
        }
      };
      // Make upstream fail by setting S04 deploy to deferred.
      const failedArtifacts = mutateArtifact(baseline, 's04Deploy', 'deployment_status', 'blocked_no_preconditions');
      const result = validateEntryGate(failedArtifacts, target);
      expectBlockerOn(result, 'fail-closed artifact must record business_mutation_count=0');
      expectCheckVerdict(result, 'V-BOS-E2E-29', 'fail');
    });

    it('V-BOS-E2E-30: R026 routing violation (chain truncated)', () => {
      const mutated = mutate(baseline.s06DirectLive.parsed, 'routing', {
        source: 'Div7.MissionControl',
        destination: 'Div2.Ops'
      });
      const artifacts = { ...baseline, s06DirectLive: { raw: JSON.stringify(mutated), parsed: mutated } };
      const result = validateEntryGate(artifacts, null);
      expectBlockerOn(result, 'R026 chain not preserved', 'Div7.MissionControl -> DecisionDelegated -> Div1.HCO -> operational divisions');
      expectCheckVerdict(result, 'V-BOS-E2E-30', 'fail');
    });
  });

  describe('Stub phases (T03 / T04 placeholders)', () => {
    it('validateAllowBlocker returns fail when target evidence missing', () => {
      const result = validator.validateAllowBlocker(null);
      assert.equal(result.verdict, 'fail');
      assert.ok(result.placeholder === true);
    });

    it('validateRequirePass returns fail when target evidence missing', () => {
      const result = validator.validateRequirePass(null);
      assert.equal(result.verdict, 'fail');
      assert.ok(result.placeholder === true);
    });

    it('validateAllowBlocker returns fail with T03-deliverable blocker when target evidence present', () => {
      const result = validator.validateAllowBlocker({ some: 'evidence' });
      assert.equal(result.verdict, 'fail');
      assert.ok(result.placeholder === true);
      assert.ok(result.blockers.some((b) => b.includes('T03 deliverable')));
    });

    it('validateRequirePass returns fail with T04-deliverable blocker when target evidence present', () => {
      const result = validator.validateRequirePass({ some: 'evidence' });
      assert.equal(result.verdict, 'fail');
      assert.ok(result.placeholder === true);
      assert.ok(result.blockers.some((b) => b.includes('T04 deliverable')));
    });
  });

  describe('Constant invariants', () => {
    it('exported R026 routing chain has 4 steps', () => {
      assert.equal(R026_ROUTING_CHAIN.length, 4);
      assert.equal(R026_ROUTING_CHAIN[0], 'Div7.MissionControl');
      assert.equal(R026_ROUTING_CHAIN[1], 'DecisionDelegated');
      assert.equal(R026_ROUTING_CHAIN[2], 'Div1.HCO');
      assert.equal(R026_ROUTING_CHAIN[3], 'operational divisions');
    });

    it('exported R3 stale prefixes has 6 entries including all canonical R3 ids', () => {
      assert.equal(R3_STALE_PREFIXES.size, 6);
      for (const id of ['9feb4c22', '43c74adb', '1a194762', '7595fd85', '7eede16c', '8233ea7b']) {
        assert.ok(R3_STALE_PREFIXES.has(id), `missing R3 stale prefix ${id}`);
      }
    });

    it('exported required persistence targets has 8 entries', () => {
      assert.equal(REQUIRED_PERSISTENCE_TARGETS.length, 8);
    });

    it('exported required PFC check names has 6 entries', () => {
      assert.equal(REQUIRED_PFC_CHECK_NAMES.length, 6);
    });

    it('exported required LHA-* patch ids has 4 entries', () => {
      assert.equal(REQUIRED_LHA_PATCH_IDS.length, 4);
    });

    it('exported required RPC ids has 4 entries', () => {
      assert.equal(REQUIRED_RPC_IDS.length, 4);
    });

    it('exported required RBC ids has 3 entries', () => {
      assert.equal(REQUIRED_RBC_IDS.length, 3);
    });

    it('exported required native surface classes has 6 entries', () => {
      assert.equal(REQUIRED_NATIVE_SURFACE_CLASSES.length, 6);
    });

    it('exported required Paperclip profile keys has 9 entries', () => {
      assert.equal(REQUIRED_PAPERCLIP_PROFILE_KEYS.length, 9);
    });

    it('exported required xiaomi prohibition fields has 4 entries each', () => {
      assert.equal(REQUIRED_XIAOMI_PROHIBITION_FIELDS.length, 4);
      assert.equal(REQUIRED_XIAOMI_ADAPTER_PROHIBITION_FIELDS.length, 4);
    });

    it('ENTRY_GATE_CHECKS has 30 entries (V-BOS-E2E-01..30)', () => {
      assert.equal(ENTRY_GATE_CHECKS.length, 30);
      const ids = ENTRY_GATE_CHECKS.map(([id]) => id);
      assert.deepEqual(ids, ids.slice().sort((a, b) => {
        const na = parseInt(a.split('-').pop(), 10);
        const nb = parseInt(b.split('-').pop(), 10);
        return na - nb;
      }));
    });
  });
});