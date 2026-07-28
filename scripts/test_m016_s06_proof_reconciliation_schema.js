#!/usr/bin/env node
'use strict';

/**
 * scripts/test_m016_s06_proof_reconciliation_schema.js
 *
 * M016-txa3vu / S06 / T04 — schema and pure-contract tests.
 *
 * The fixture is a complete M015 baseline + 30-row capability ledger + the
 * full allowlist of source_refs. Tests cover registry shape, schema
 * compile, strict additional-property rejection, frozen criterion
 * mapping (9 M015→M016 rows), frozen capability actions, frozen
 * recommendation enum, blocker-factory namespace + exit-code mapping,
 * deterministic builders, byte-stable round-trip, evidence-driven
 * upgrade refusal (no M016 row elevates pre→confirmed without an
 * independent M016 source_ref).
 *
 * Run with: node --test scripts/test_m016_s06_proof_reconciliation_schema.js
 */

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const data = require('./lib/m016-s06-proof-reconciliation-data');
const contract = require('./lib/m016-s06-proof-reconciliation-contract');

const ROOT = path.resolve(__dirname, '..');

const SCHEMA_REFS = [
  data.DEFAULTS.reconciliation_schema_path,
  data.DEFAULTS.capability_action_ledger_schema_path,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeM015Baseline() {
  const verdict = {};
  for (const mapping of data.M015_CRITERION_MAPPING) {
    let value;
    if (mapping.m015_expected_state === 'PROVEN') {
      value = data.M015_VERDICT_FIELD_VALUES.PASS;
    } else if (mapping.m015_expected_state === 'NOT_REQUIRED') {
      value = data.M015_VERDICT_FIELD_VALUES.BOOLEAN_FALSE;
    } else if (mapping.m015_expected_state === 'NOT_PROVEN') {
      value = data.M015_VERDICT_FIELD_VALUES.NOT_PROVEN_MISSING_RESULT_JSON_BOS;
    } else {
      value = null;
    }
    verdict[mapping.m015_field.split('.')[1]] = value;
  }
  return {
    verdict,
    generated: data.RECONCILE_REFERENCE_TIME,
    baseline_ref: data.M015_BASELINE_REF,
  };
}

function makeCapabilityLedger() {
  // 30-row ledger: 4 confirmed (allowlist), 26 unvalidated/fallback-only/unsupported.
  const rows = [];
  const confirmedKeys = ['plugin.runtime.version_build', 'issues.native', 'documents.native', 'comments.native'];
  for (const key of confirmedKeys) {
    rows.push({
      key,
      paperclip_surface_name: key,
      status: data.CAPABILITY_STATUSES.CONFIRMED,
      confidence: 1,
    });
  }
  // 26 fallback-only / unsupported / unvalidated rows (any keys, none forbidden
  // promoted above their baseline).
  let idx = 0;
  for (let i = 0; i < 26; i += 1) {
    const statuses = [
      data.CAPABILITY_STATUSES.UNVALIDATED,
      data.CAPABILITY_STATUSES.FALLBACK_ONLY,
      data.CAPABILITY_STATUSES.UNSUPPORTED,
    ];
    rows.push({
      key: 'sample.surface.' + idx,
      paperclip_surface_name: 'surface-' + idx,
      status: statuses[i % statuses.length],
      confidence: 1,
    });
    idx += 1;
  }
  return { capabilities: rows };
}

function loadSourceHash(ref) {
  const abs = path.join(ROOT, ref);
  if (!fs.existsSync(abs)) {
    // Synthesise a sha256-shaped string for the schema-test fixture so the
    // contract's required-source check still passes. This lets unit tests
    // exercise the S06 pipeline in environments where the canonical files
    // are absent (e.g. CI or a fresh checkout), without ever reading
    // potentially corrupted on-disk content.
    return contract.sha256Hex('schema-test-fixture:' + ref);
  }
  const raw = fs.readFileSync(abs, 'utf8');
  return contract.sha256Hex(raw);
}

function makeSourceHashes() {
  const hashes = {};
  for (const entry of data.SOURCE_ALLOWLIST) {
    hashes[entry.source_ref] = loadSourceHash(entry.source_ref);
  }
  return hashes;
}

function validatorFor(schemaRef) {
  const loaded = contract.loadSchema(schemaRef);
  assert.ok(loaded.schema, schemaRef + ' must parse');
  assert.equal(typeof loaded.validate, 'function', schemaRef + ' must compile with Ajv');
  return loaded.validate;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('S06 data registry exposes frozen 9-row criterion mapping, bounded verdicts and frozen enums', () => {
  assert.equal(data.M015_CRITERION_MAPPING.length, 9);
  assert.equal(data.MAX_CRITERION_ROWS, 9);
  assert.deepEqual(data.ORCHESTRATION_VERDICTS, ['PASS', 'PARTIAL', 'NOT_PROVEN']);
  assert.deepEqual(data.EVIDENCE_VERDICTS, ['PASS', 'PARTIAL', 'NOT_PROVEN']);
  assert.deepEqual(data.LAUNCH_VERDICTS, ['PREPARATION_ONLY', 'NO_GO']);
  assert.deepEqual(data.CAPABILITY_ACTIONS, {
    KEEP: 'keep', UPDATE_FALLBACK: 'update_fallback', UPDATE_BLOCKER: 'update_blocker', DROP: 'drop',
  });
  assert.deepEqual(data.CAPABILITY_STATUSES, {
    CONFIRMED: 'confirmed', UNVALIDATED: 'unvalidated', FALLBACK_ONLY: 'fallback-only', UNSUPPORTED: 'unsupported',
  });
  assert.equal(Object.isFrozen(data.DEFAULTS), true);
  assert.equal(Object.isFrozen(data.M015_CRITERION_MAPPING), true);
  assert.equal(data.isForbiddenReconcileVerdict('GO'), true);
  assert.equal(data.isForbiddenReconcileVerdict('GO_BOUNDED_INTERNAL'), false);
});

test('S06 criterion mapping is frozen and references M015 + at least one M016 source_ref', () => {
  for (const mapping of data.M015_CRITERION_MAPPING) {
    assert.equal(typeof mapping.criterion_id, 'string');
    assert.match(mapping.criterion_id, /^M16-S06-CRITERION-[A-Z0-9_-]+$/);
    assert.equal(mapping.m015_field.startsWith('verdict.'), true);
    assert.ok(['PROVEN', 'NOT_PROVEN', 'NOT_REQUIRED'].indexOf(mapping.m015_expected_state) >= 0);
    assert.ok(mapping.m015_verdict_value_refs.length >= 1);
    assert.equal(mapping.m015_verdict_value_refs[0], data.M015_BASELINE_REF);
  }
  // Verify the two NOT_REQUIRED rows are bos_plugin_required and result_json_bos_required.
  const bosPlugin = data.M015_CRITERION_MAPPING.find((row) => row.criterion_id === 'M16-S06-CRITERION-BOS-PLUGIN-REQUIRED');
  assert.equal(bosPlugin.m015_expected_state, 'NOT_REQUIRED');
  const resultJson = data.M015_CRITERION_MAPPING.find((row) => row.criterion_id === 'M16-S06-CRITERION-RESULT-JSON-BOS-REQUIRED');
  assert.equal(resultJson.m015_expected_state, 'NOT_REQUIRED');
  // The bos_grade_contract_proof row stays NOT_PROVEN to keep the launch gate fail-closed.
  const bosGrade = data.M015_CRITERION_MAPPING.find((row) => row.criterion_id === 'M16-S06-CRITERION-BOS-GRADE-CONTRACT-PROOF');
  assert.equal(bosGrade.m015_expected_state, 'NOT_PROVEN');
});

test('RECOMMENDATION_VALUES exposes frozen enums and value helpers', () => {
  assert.equal(data.isRecommendationValue(data.RECOMMENDATION_VALUES.PLUGIN_OWNED_DEFERRED_UNVALIDATED), true);
  assert.equal(data.isRecommendationValue(data.RECOMMENDATION_VALUES.ADAPTER_NATIVE_DEFERRED_UNVALIDATED), true);
  assert.equal(data.isRecommendationValue('plugin-owned, deprecated'), false);
  assert.equal(Object.isFrozen(data.RECOMMENDATION_VALUES), true);
});

test('BLOCKER_CODES factory namespace M16-S06-RECONCILE-* with stable exit-code mapping', () => {
  // Each factory call returns a non-empty string matching the namespace pattern.
  for (const [name, factory] of Object.entries(data.BLOCKER_CODES)) {
    if (name === 'PRECONDITION_MISSING' || name === 'S05_VERIFIER_NOT_FOUND' || name === 'S05_VERIFIER_REPLAY_KEY_MISMATCH'
      || name === 'CRITERION_PASS_THROUGH' || name === 'CAPABILITY_ILLEGAL_PROMOTION'
      || name === 'CAPABILITY_SOURCE_REF_MISSING' || name === 'RECOMMENDATION_UNSUPPORTED'
      || name === 'PATH_TRAVERSAL' || name === 'SECRET_TOKEN' || name === 'SCHEDULE_DUPLICATE'
      || name === 'SCHEMA_VIOLATION' || name === 'LIMITS_EXCEEDED' || name === 'SOURCE_HASH_DRIFT') {
      const code = factory('fixture');
      assert.equal(typeof code, 'string', name + ' must yield string');
      assert.match(code, /^M16-S06-RECONCILE-[A-Z0-9-]+/, name + ' must follow namespace');
      assert.notEqual(contract.mapBlockerToExitCode(code), 0, name + ' must map to non-zero exit');
    } else if (name === 'FRESH_HASH_DRIFT' || name === 'S05_VERIFIER_NONZERO_EXIT'
      || name === 'S05_VERIFIER_NETWORK_CALLS' || name === 'S05_VERIFIER_MUTATIONS'
      || name === 'S05_VERIFIER_BLOCKERS' || name === 'S05_VERDICT_DRIFT') {
      const code = factory('expect', 'actual');
      assert.match(code, /^M16-S06-RECONCILE-[A-Z0-9-]+/, name + ' must follow namespace');
      assert.notEqual(contract.mapBlockerToExitCode(code), 0, name + ' must map to non-zero exit');
    } else if (name === 'CAPABILITY_ACTION_INVALID' || name === 'CAPABILITY_CONFIDENCE_OUT_OF_RANGE') {
      const code = factory('key', 'arg');
      assert.match(code, /^M16-S06-RECONCILE-[A-Z0-9-]+/, name + ' must follow namespace');
      assert.notEqual(contract.mapBlockerToExitCode(code), 0, name + ' must map to non-zero exit');
    } else if (name === 'RECOMMENDATION_MISSING' || name === 'S05_VERIFIER_PRODUCER_CLI_IMPORTED'
      || name === 'VERIFIER_RUNNER_FAILURE') {
      const code = factory();
      assert.match(code, /^M16-S06-RECONCILE-[A-Z0-9-]+/, name + ' must follow namespace');
      assert.notEqual(contract.mapBlockerToExitCode(code), 0, name + ' must map to non-zero exit');
    }
  }
  // PRECONDITION-MISSING maps to RECONCILE_PRECONDITION_DRIFT per the
  // regex-driven exit-code precedence order in mapBlockerToExitCode.
  assert.equal(contract.mapBlockerToExitCode('M16-S06-RECONCILE-PRECONDITION-MISSING-fake'), data.EXIT_CODES.RECONCILE_PRECONDITION_DRIFT);
  // SECRET-TOKEN maps to RECONCILE_REDACTION_LEAK.
  assert.equal(contract.mapBlockerToExitCode('M16-S06-RECONCILE-SECRET-TOKEN-fake'), data.EXIT_CODES.RECONCILE_REDACTION_LEAK);
  // Unknown codes fall through to RUNNER_FAILURE.
  assert.equal(contract.mapBlockerToExitCode('totally-unknown'), data.EXIT_CODES.RECONCILE_RUNNER_FAILURE);
});

test('all S06 schemas compile and advertise strict object roots', () => {
  for (const schemaRef of SCHEMA_REFS) {
    const loaded = contract.loadSchema(schemaRef);
    assert.equal(loaded.schema.additionalProperties, false, schemaRef);
    assert.equal(typeof loaded.validate, 'function', schemaRef);
  }
});

test('valid full reconciliation + ledger build via contract.evaluate end-to-end', () => {
  const m015Baseline = makeM015Baseline();
  const ledger = makeCapabilityLedger();
  const sourceHashes = makeSourceHashes();
  const ledgerHash = sourceHashes[data.CAPABILITY_LEDGER_REF];
  assert.equal(/^[a-f0-9]{64}$/.test(ledgerHash), true, 'capability ledger hash must be valid sha256');

  // S05 independent back-ref catalogue (for criterion diff back refs).
  const m016IndependentRefs = [
    'runtime-evidence/M016-S02-bos-mission-proof.json',
    'runtime-evidence/M016-S05-seven-division-replay-bundle.json',
    'runtime-evidence/M016-S05-seven-division-replay-verify-protocol.json',
  ];

  const m015Evaluation = contract.evaluateM015Baseline(m015Baseline, sourceHashes);
  assert.equal(m015Evaluation.m015_all_pass_against_expected, true);

  const criterionDiff = contract.buildCriterionDiff({ m015Baseline, sourceHashes, m016IndependentRefs });
  assert.equal(criterionDiff.criterion_diff.length, 9);
  assert.equal(criterionDiff.pass_through_count, criterionDiff.criterion_diff.filter((r) => r.pass_through).length);

  const capabilityAudit = contract.buildCapabilityAudit({ ledger, sourceHash: ledgerHash });
  assert.equal(capabilityAudit.ok, true);
  assert.equal(capabilityAudit.total_rows, 30);
  assert.equal(capabilityAudit.pre_status_promoted_to_confirmed_count, 0);
  assert.equal(capabilityAudit.promotion_blocked, true);

  // evaluateReconciliationContract orchestrates the full pipeline; it
  // internally drives buildRecommendation / buildCapabilityAudit /
  // buildCriterionDiff / buildReconciliationSidecar. The schema requires
  // a structured `inputs` map of chain_role -> source_ref that mirrors the
  // verifier's allowlist. Pass it through so the sidecar validates.
  const evaluation = contract.evaluateReconciliationContract({
    m015Baseline,
    sourceHashes,
    m016IndependentRefs,
    capabilityLedger: ledger,
    capabilityLedgerHash: ledgerHash,
    inputs: {
      m015_baseline: data.M015_BASELINE_REF,
      s02_proof: data.S02_PROOF_REF,
      s05_bundle: data.S05_BUNDLE_REF,
      s05_worksheet: data.S05_WORKSHEET_REF,
      s05_verify_protocol: data.S05_VERIFY_PROTOCOL_REF,
      s05_producer_protocol: 'runtime-evidence/M016-S05-seven-division-replay-producer-protocol.json',
      s05_probe_run: 'runtime-evidence/M016-S05-seven-division-replay-probe-run.json',
      s05_admission: 'runtime-evidence/M016-S05-seven-division-replay-admission.json',
      capability_ledger: data.CAPABILITY_LEDGER_REF,
    },
    s05Verifier: {
      exit_code: 0,
      producer_cli_imported: false,
      network_calls: 0,
      mutation_count: 0,
      blockers: [],
      replay_keys: null,
      protocol_path: null,
    },
    referenceTime: data.RECONCILE_REFERENCE_TIME,
  });
  assert.equal(evaluation.ok, true, JSON.stringify(evaluation.blockers));

  const reconciliation = evaluation.sidecar;
  const ledgerSidecar = contract.buildCapabilityActionLedgerSidecar({
    ledger,
    sourceHash: ledgerHash,
    capabilityAudit: evaluation.capability_audit,
    referenceTime: data.RECONCILE_REFERENCE_TIME,
  }).sidecar;

  // Both sidecars pass AJV strict validation.
  const validateReconciliation = validatorFor(data.DEFAULTS.reconciliation_schema_path);
  const validateLedger = validatorFor(data.DEFAULTS.capability_action_ledger_schema_path);
  assert.equal(validateReconciliation(reconciliation), true, JSON.stringify(validateReconciliation.errors));
  assert.equal(validateLedger(ledgerSidecar), true, JSON.stringify(validateLedger.errors));

  // Byte-stable round-trip: re-canonicalize and re-hash the sidecars.
  const reconciliationDigest2 = contract.computeReconciliationBodyDigest(reconciliation);
  assert.equal(reconciliation.byte_digest, reconciliationDigest2);
  const ledgerDigest2 = contract.computeLedgerBodyDigest(ledgerSidecar);
  assert.equal(ledgerSidecar.byte_digest, ledgerDigest2);
});

test('reconciliation sidecar: pass_through_count == sum of criterion_diff[pass_through=true] and blocked-only when M015 disagrees', () => {
  const m015Baseline = makeM015Baseline();
  // Force one FAIL outcome in M015 to verify the diff structure refuses promotion.
  m015Baseline.verdict.native_paperclip_mission = data.M015_VERDICT_FIELD_VALUES.FAIL;
  const sourceHashes = makeSourceHashes();
  const m016IndependentRefs = ['runtime-evidence/M016-S05-seven-division-replay-bundle.json'];

  const m015Evaluation = contract.evaluateM015Baseline(m015Baseline, sourceHashes);
  assert.equal(m015Evaluation.m015_all_pass_against_expected, false);
  const criterionDiff = contract.buildCriterionDiff({ m015Baseline, sourceHashes, m016IndependentRefs });
  const failRow = criterionDiff.criterion_diff.find((row) => row.criterion_id === 'M16-S06-CRITERION-NATIVE-PAPERCLIP-MISSION');
  assert.equal(failRow.pass_through, false);
  assert.notEqual(failRow.m016_verdict, 'PASS');
});

test('capability audit refuses illegal promotion when a forbidden surface is forced to confirmed', () => {
  const ledger = makeCapabilityLedger();
  // Force a forbidden surface to confirmed to verify the promotion guardrail.
  ledger.capabilities.push({
    key: 'registration.tools',
    paperclip_surface_name: 'registration.tools',
    status: data.CAPABILITY_STATUSES.CONFIRMED,
    confidence: 1,
  });
  const sourceHash = contract.sha256Hex('ledger');
  const audit = contract.buildCapabilityAudit({ ledger, sourceHash });
  assert.equal(audit.ok, false);
  assert.match(audit.code, /CAPABILITY-ILLEGAL-PROMOTION/);
});

test('capability audit rejects drop action that promotes a fallback-only row to confirmed', () => {
  // buildCapabilityAudit does not allow promotion, but DROP must NOT flip
  // pre_status; verify it leaves the row at fallback-only with action=drop.
  const ledger = {
    capabilities: [
      { key: 'plugin.runtime.version_build', paperclip_surface_name: 'plugin.runtime.version_build', status: 'confirmed', confidence: 1 },
      { key: 'sample.standby', paperclip_surface_name: 'sample.standby', status: 'fallback-only', confidence: 1 },
    ],
  };
  const sourceHash = contract.sha256Hex('fixture');
  const audit = contract.buildCapabilityAudit({
    ledger,
    sourceHash,
    actions: [{ key: 'sample.standby', action: 'drop', confidence: 1 }],
  });
  assert.equal(audit.ok, true);
  const row = audit.rows.find((r) => r.capability_key === 'sample.standby');
  assert.equal(row.pre_status, 'fallback-only');
  assert.equal(row.post_status, 'fallback-only');
  assert.equal(row.action, 'drop');
});

test('buildRecommendation returns a wrapped recommendation with bounded rationale and evidence', () => {
  const m015Baseline = makeM015Baseline();
  const ledger = makeCapabilityLedger();
  const sourceHash = contract.sha256Hex('fixture');
  const capabilityAudit = contract.buildCapabilityAudit({ ledger, sourceHash });
  const criterionDiff = contract.buildCriterionDiff({ m015Baseline, sourceHashes: {}, m016IndependentRefs: [] });

  const recommendation = contract.buildRecommendation({ capabilityAudit, criterionDiff, m015Baseline });
  assert.equal(recommendation.ok, true);
  assert.equal(data.isRecommendationValue(recommendation.recommendation.value), true);
  assert.equal(typeof recommendation.recommendation.rationale, 'string');
  assert.ok(recommendation.recommendation.rationale.length > 0
    && recommendation.recommendation.rationale.length <= data.DEFAULTS.max_rationale_chars);
  assert.equal(recommendation.recommendation.requires_future_proof, true);
  assert.ok(Array.isArray(recommendation.recommendation.evidence_criterion_ids));
});

test('redaction safety surfaces leak hits and refuses to write without persisting them', () => {
  // checkRedactionSafety is a pure helper that returns a hits array.
  const unsafeHits = contract.checkRedactionSafety({ full_ids: true });
  assert.ok(unsafeHits.length >= 1, 'full_ids=true must surface at least one leak hit');
  const safeHits = contract.checkRedactionSafety({ full_ids: false });
  assert.equal(safeHits.length, 0);

  // assertReconciliationWriteSafe is the actual write gate that throws
  // when full_ids=true is smuggled into the canonical posture.
  const stub = {
    schema_id: data.RECONCILIATION_SCHEMA_ID,
    inputs: {},
    redaction_posture: clone(data.RECONCILE_REDACTION_FLAG_VALUES),
  };
  assert.doesNotThrow(() => contract.assertReconciliationWriteSafe(clone(stub)));

  const unsafe = {
    schema_id: data.RECONCILIATION_SCHEMA_ID,
    inputs: {},
    redaction_posture: Object.assign({}, data.RECONCILE_REDACTION_FLAG_VALUES, { full_ids: true }),
  };
  assert.throws(() => contract.assertReconciliationWriteSafe(unsafe), (error) => error.code && /^M16-S06-RECONCILE-SECRET-TOKEN-/.test(error.code));
});

test('schema roots reject unknown properties and forged verdict promotions', () => {
  // Drive the canonical pipeline end-to-end so we have a real reconciliation
  // sidecar; then pollute it with unknown + forged verdict properties.
  const m015Baseline = makeM015Baseline();
  const sourceHashes = makeSourceHashes();
  const ledger = makeCapabilityLedger();
  const ledgerHash = sourceHashes[data.CAPABILITY_LEDGER_REF];
  const evaluation = contract.evaluateReconciliationContract({
    m015Baseline,
    sourceHashes,
    m016IndependentRefs: ['runtime-evidence/M016-S05-seven-division-replay-bundle.json'],
    capabilityLedger: ledger,
    capabilityLedgerHash: ledgerHash,
    inputs: {
      m015_baseline: data.M015_BASELINE_REF,
      s02_proof: data.S02_PROOF_REF,
      s05_bundle: data.S05_BUNDLE_REF,
      s05_worksheet: data.S05_WORKSHEET_REF,
      s05_verify_protocol: data.S05_VERIFY_PROTOCOL_REF,
      s05_producer_protocol: 'runtime-evidence/M016-S05-seven-division-replay-producer-protocol.json',
      s05_probe_run: 'runtime-evidence/M016-S05-seven-division-replay-probe-run.json',
      s05_admission: 'runtime-evidence/M016-S05-seven-division-replay-admission.json',
      capability_ledger: data.CAPABILITY_LEDGER_REF,
    },
    s05Verifier: {
      exit_code: 0,
      producer_cli_imported: false,
      network_calls: 0,
      mutation_count: 0,
      blockers: [],
      replay_keys: null,
      protocol_path: null,
    },
    referenceTime: data.RECONCILE_REFERENCE_TIME,
  });
  const reconciliation = evaluation.sidecar;
  assert.ok(reconciliation, JSON.stringify(evaluation.blockers));

  const validate = validatorFor(data.DEFAULTS.reconciliation_schema_path);
  const tampered = clone(reconciliation);
  tampered.unexpected = true;
  assert.equal(validate(tampered), false);

  // Forging an unproven verdict promotion is structurally impossible here
  // (the verdict triplet is fixed to PARTIAL/PARTIAL/PREPARATION_ONLY by
  // buildReconciliationSidecar) — verify we cannot smuggle a forbidden
  // word into the aggregate anyway.
  const banned = clone(reconciliation);
  banned.aggregate_verdict.overall = 'GO';
  assert.equal(validate(banned), false);
});

test('contract module has no producer CLI import and no process/network execution surface', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts/lib/m016-s06-proof-reconciliation-contract.js'), 'utf8');
  assert.doesNotMatch(source, /produce_m016_s06_proof_reconciliation/);
  assert.doesNotMatch(source, /child_process|execSync|spawnSync|fetch\s*\(/);
});

test('verifier file does NOT require producer CLI (static analysis)', () => {
  const verifierSource = fs.readFileSync(path.join(ROOT, 'scripts/verify_m016_s06_proof_reconciliation.js'), 'utf8');
  const forbiddenPatterns = [
    /require\(\s*['"]\.\/produce_m016_s06_proof_reconciliation['"]\s*\)/,
    /require\(\s*['"][^'"]*produce_m016_s06_proof_reconciliation[^'"]*['"]\s*\)/,
    /from\s+['"][^'"]*produce_m016_s06_proof_reconciliation[^'"]*['"]/,
    /import\(\s*['"][^'"]*produce_m016_s06_proof_reconciliation[^'"]*['"]\s*\)/,
  ];
  for (const re of forbiddenPatterns) {
    assert.equal(re.test(verifierSource), false,
      'verifier source must NOT require/import the producer CLI: ' + re);
  }
});
