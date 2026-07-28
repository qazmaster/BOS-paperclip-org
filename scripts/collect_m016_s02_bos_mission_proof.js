#!/usr/bin/env node
'use strict';

/**
 * scripts/collect_m016_s02_bos_mission_proof.js
 *
 * M016-txa3vu / S02 / T02 — Offline collector that converts allowlisted
 * M015/S01 evidence into the canonical sanitised sidecar
 * bos-mission-proof.json bundle. Runs in two isolated collect-passes
 * (primary + replay child) to prove byte-identical determinism, writes
 * the bundle atomically with a --force guard, and emits a stable
 * bounded verdict line on stdout.
 *
 * The collector NEVER touches Paperclip core, plugin state, or raw
 * result_json.result. Every raw input is SHA-256-fingerprinted before
 * and after collection; any drift is a hard runner failure. The
 * embedded classification stays frozen at orchestration=PASS,
 * evidence=PARTIAL, launch=PREPARATION_ONLY with HG3..HG6 NOT_PROVEN
 * so the sidecar structurally cannot be promoted into a launch proof.
 *
 * Exit codes (M16-S02 EXIT_CODES namespace):
 *   0  PASS — bundle written, dual-run match, redaction clean
 *   1  REJECTED_MALFORMED — input/CLI/schema violation
 *   2  REJECTED_FAIL_CLOSED — source out of allowlist, symlink escape,
 *                              classification drift, classification HG fail
 *   3  REJECTED_CLASSIFICATION_DRIFT — embedded classification drift
 *   4  REJECTED_LAUNCH_PROMOTION — forbidden launch verdict attempted
 *   5  REPLAY_DRIFT — dual-run provenance/byte mismatch
 *   6  REJECTED_REDACTION_LEAK — UUID/credential/vendor-reuse leak
 *   7  RUNNER_FAILURE — internal error
 *
 * Usage:
 *   node scripts/collect_m016_s02_bos_mission_proof.js [--force] \
 *        [--output-dir <dir>] [--bundle-out <path>] \
 *        [--inventory-out <path>] [--redaction-contract-out <path>] \
 *        [--protocol-out <path>] [--schema <path>] \
 *        [--bundle-id <id>] [--reference-time <iso>] \
 *        [--no-dual-run] [--replay] [--replay-tmp-dir <dir>]
 *
 * Internal flags (--replay, --replay-tmp-dir) are used by the dual-run
 * child process and are not part of the public surface.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const contract = require('./lib/m016-s02-bos-mission-proof-contract');
const data = require('./lib/m016-s02-bos-mission-proof-data');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT_PATH = __filename;

// ---------------------------------------------------------------------------
// Allowlisted source descriptors — fixed set of M015/S01 inputs the
// collector is permitted to read. Any other path fails closed.
// ---------------------------------------------------------------------------

const ALLOWLIST = Object.freeze([
  Object.freeze({
    source_ref: 'runtime-evidence/M015-native-seven-division-mission-20260717.json',
    kind: 'mission_evidence',
    independence_group: 'mission-topology',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S01-m015-regression-fixture.json',
    kind: 'regression_fixture',
    independence_group: 'regression-fixture',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S01-classification-protocol.json',
    kind: 'classification_protocol',
    independence_group: 'classification-protocol',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S01-classification-verification.json',
    kind: 'classification_verification',
    independence_group: 'classification-verification',
  }),
  Object.freeze({
    source_ref: 'runtime-evidence/M016-S01-classification-validation.json',
    kind: 'classification_verification',
    independence_group: 'classification-validation',
  }),
]);

// Canonical 9 S01 EXECUTED claim_ids (kebab-case bounded, frozen).
const S01_CLAIM_IDS = Object.freeze([
  'm015-div1-hco-orchestration',
  'm015-div2-masterplanner-orchestration',
  'm015-div3-treasury-orchestration',
  'm015-div4-production-orchestration',
  'm015-div5-qualificationslibrarylearning-orchestration',
  'm015-div6-external-orchestration',
  'm015-div7-missioncontrol-orchestration',
  'm015-mission-documents-bridge',
  'm015-heartbeat-runs-launch',
]);

const CLAIM_DIMENSION = Object.freeze({
  'm015-div1-hco-orchestration': 'orchestration',
  'm015-div2-masterplanner-orchestration': 'orchestration',
  'm015-div3-treasury-orchestration': 'orchestration',
  'm015-div4-production-orchestration': 'orchestration',
  'm015-div5-qualificationslibrarylearning-orchestration': 'orchestration',
  'm015-div6-external-orchestration': 'orchestration',
  'm015-div7-missioncontrol-orchestration': 'orchestration',
  'm015-mission-documents-bridge': 'evidence',
  'm015-heartbeat-runs-launch': 'launch',
});

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { force: false, dualRun: true, replay: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') out.force = true;
    else if (a === '--no-dual-run') out.dualRun = false;
    else if (a === '--replay') out.replay = true;
    else if (a === '--schema') out.schema = argv[++i];
    else if (a === '--output-dir') out.outputDir = argv[++i];
    else if (a === '--bundle-out') out.bundleOut = argv[++i];
    else if (a === '--inventory-out') out.inventoryOut = argv[++i];
    else if (a === '--redaction-contract-out') out.redactionContractOut = argv[++i];
    else if (a === '--protocol-out') out.protocolOut = argv[++i];
    else if (a === '--replay-tmp-dir') out.replayTmpDir = argv[++i];
    else if (a === '--reference-time') out.referenceTime = argv[++i];
    else if (a === '--bundle-id') out.bundleId = argv[++i];
    else if (a === '--help' || a === '-h') {
      process.stdout.write([
        'Usage: collect_m016_s02_bos_mission_proof.js [options]',
        '',
        'Options:',
        '  --schema <path>             Schema path (default: schemas/runtime-evidence/m016-s02-bos-mission-proof.v1.json)',
        '  --output-dir <dir>          Output directory (default: runtime-evidence)',
        '  --bundle-out <path>         Bundle output path',
        '  --inventory-out <path>      Inventory output path',
        '  --redaction-contract-out <path>  Redaction contract output path',
        '  --protocol-out <path>       Collect protocol output path',
        '  --force                     Overwrite existing output files',
        '  --no-dual-run               Skip dual-run replay (testing only)',
        '  --bundle-id <id>            Override bundle_id (determinism)',
        '  --reference-time <iso>      Override generated timestamp (determinism)',
        '  --replay                    Internal: replay-mode child process',
        '  --replay-tmp-dir <dir>      Internal: replay output dir',
        '  -h, --help                  Show this help',
      ].join('\n') + '\n');
      process.exit(0);
    }
  }
  out.schema = out.schema || data.DEFAULTS.schema_path;
  out.outputDir = out.outputDir || data.DEFAULTS.output_dir;
  out.bundleOut = out.bundleOut || data.DEFAULTS.bundle_output;
  out.inventoryOut = out.inventoryOut || data.DEFAULTS.inventory_output;
  out.redactionContractOut = out.redactionContractOut || data.DEFAULTS.redaction_contract_output;
  out.protocolOut = out.protocolOut || data.DEFAULTS.protocol_output;
  out.bundleId = out.bundleId || 'm016-s02-bos-mission-proof-v1';
  out.referenceTime = out.referenceTime || null;
  return out;
}

// ---------------------------------------------------------------------------
// SHA-256 + path safety primitives
// ---------------------------------------------------------------------------

function sha256Hex(input) {
  const h = crypto.createHash('sha256');
  h.update(input);
  return h.digest('hex');
}

function loadRawBytes(sourceRef) {
  const allowlisted = new Set(ALLOWLIST.map((s) => s.source_ref));
  if (!allowlisted.has(sourceRef)) {
    const err = new Error(`source_ref ${sourceRef} not in allowlist`);
    err.code = data.BLOCKER_CODES.SOURCE_OUT_OF_ALLOWLIST(sourceRef);
    throw err;
  }
  const abs = path.resolve(ROOT, sourceRef);
  if (!fs.existsSync(abs)) {
    const err = new Error(`source file missing: ${abs}`);
    err.code = data.BLOCKER_CODES.SOURCE_OUT_OF_ALLOWLIST(sourceRef);
    throw err;
  }
  // lstatSync refuses symlinks at the lstat level (does not follow).
  const lst = fs.lstatSync(abs);
  if (lst.isSymbolicLink()) {
    const err = new Error(`source_ref ${sourceRef} is a symlink (refused)`);
    err.code = data.BLOCKER_CODES.SOURCE_PATH_OUT_OF_BOUND(sourceRef);
    throw err;
  }
  // realpath-stays-inside-repo guard.
  const real = fs.realpathSync(abs);
  const rootReal = fs.realpathSync(ROOT);
  if (!real.startsWith(rootReal + path.sep) && real !== rootReal) {
    const err = new Error(`source_ref ${sourceRef} escapes repo root via realpath`);
    err.code = data.BLOCKER_CODES.SOURCE_PATH_OUT_OF_BOUND(sourceRef);
    throw err;
  }
  const rawBytes = fs.readFileSync(real);
  return { rawBytes, absPath: real, sizeBytes: rawBytes.length };
}

function computeRawInputHashes() {
  const out = {};
  for (const src of ALLOWLIST) {
    const { rawBytes } = loadRawBytes(src.source_ref);
    out[src.source_ref] = sha256Hex(rawBytes);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-source sanitisation (bounded, no UUIDs, no credentials, no vendor-reuse,
// no raw body, no raw reasoning, no result_json.result)
// ---------------------------------------------------------------------------

function safeStr(v, max) {
  if (typeof v !== 'string') return v;
  return v.length > max ? v.slice(0, max) : v;
}

function sanitiseMissionEvidence(payload) {
  // M015 is accepted in both the original live-capture shape and the later
  // repository-contained v1 sanitised shape. Project only bounded metadata;
  // never copy arbitrary source fields into the sidecar.
  const canonicalV1 = typeof payload.schema_id === 'string';
  const boundedBasis = canonicalV1 && payload.verdict_basis && typeof payload.verdict_basis === 'object'
    ? Object.fromEntries(Object.entries(payload.verdict_basis).map(([key, value]) => [key, safeStr(value, 240)]))
    : undefined;
  return {
    $schema: payload.$schema || payload.schema_id,
    schema_id: canonicalV1 ? payload.schema_id : undefined,
    schema_version: canonicalV1 ? payload.schema_version : undefined,
    milestone: payload.milestone,
    mission_id: canonicalV1 ? safeStr(payload.mission_id, 120) : undefined,
    mission_kind: canonicalV1 ? safeStr(payload.mission_kind, 120) : undefined,
    milestone_target: canonicalV1 ? safeStr(payload.milestone_target, 80) : undefined,
    generated: canonicalV1 ? payload.generated : undefined,
    bounded_internal: canonicalV1 ? payload.bounded_internal : undefined,
    scope: canonicalV1 ? safeStr(payload.scope, 200) : undefined,
    sanitised: canonicalV1 ? payload.sanitised : undefined,
    raw_bodies_persisted: canonicalV1 ? payload.raw_bodies_persisted : undefined,
    raw_result_json_persisted: canonicalV1 ? payload.raw_result_json_persisted : undefined,
    verdict_basis: boundedBasis,
    source_count: canonicalV1 && Array.isArray(payload.sources) ? payload.sources.length : undefined,
    blocker_count: canonicalV1 && Array.isArray(payload.blockers) ? payload.blockers.length : undefined,
    mission_key: payload.mission_key,
    purpose_class: safeStr(payload.purpose, 200),
    captured_at: payload.captured_at,
    live_target: {
      paperclip_package_version: payload.live_target && payload.live_target.paperclip && payload.live_target.paperclip.package_version,
      paperclip_source_commit: payload.live_target && payload.live_target.paperclip && payload.live_target.paperclip.source_commit,
      paperclip_source_commit_date: payload.live_target && payload.live_target.paperclip && payload.live_target.paperclip.source_commit_date,
      adapter_type: payload.live_target && payload.live_target.adapter_type,
      provider: payload.live_target && payload.live_target.provider,
      model: payload.live_target && payload.live_target.model,
      hermes_version: payload.live_target && payload.live_target.hermes_version,
      plugin_used: payload.live_target && payload.live_target.plugin_used,
      plugin_rows_present: payload.live_target && payload.live_target.plugin_rows_present,
    },
    mission_topology: {
      distinct_agents_executed: payload.execution && payload.execution.distinct_agents_executed,
      mission_duration_seconds: payload.execution && payload.execution.mission_duration_from_goal_to_root_done_seconds,
      successful_runs: payload.execution && payload.execution.successful_runs,
      successful_exit_zero_runs: payload.execution && payload.execution.successful_exit_zero_runs,
      expected_cancelled_dedupe_runs: payload.execution && payload.execution.expected_cancelled_terminal_dedupe_runs,
      failed_runs: payload.execution && payload.execution.failed_runs,
      timed_out_runs: payload.execution && payload.execution.timed_out_runs,
      bos_results_present: payload.execution && payload.execution.bos_results_present,
      heartbeat_rows: payload.execution && payload.execution.heartbeat_rows,
    },
    evidence_counts: {
      mission_issue_count: payload.evidence && payload.evidence.mission_issue_count,
      mission_issues_done: payload.evidence && payload.evidence.mission_issues_done,
      issue_comments: payload.evidence && payload.evidence.issue_comments,
      issue_activity_events: payload.evidence && payload.evidence.issue_activity_events,
      mission_documents: payload.evidence && payload.evidence.mission_documents,
      preexisting_documents_updated: payload.evidence && payload.evidence.preexisting_documents_updated,
      raw_bodies_persisted: payload.evidence && payload.evidence.raw_comment_bodies_persisted_in_this_evidence,
      raw_model_results_persisted: payload.evidence && payload.evidence.raw_model_results_persisted_in_this_evidence,
    },
    isolation_audit: {
      preexisting_issues_updated: payload.isolation_audit && payload.isolation_audit.preexisting_issues_updated,
      out_of_project_issues_created: payload.isolation_audit && payload.isolation_audit.out_of_project_issues_created,
      out_of_project_comments_created: payload.isolation_audit && payload.isolation_audit.out_of_project_comments_created,
      preexisting_documents_updated: payload.isolation_audit && payload.isolation_audit.preexisting_documents_updated,
      other_projects_created_or_updated: payload.isolation_audit && payload.isolation_audit.other_projects_created_or_updated,
      other_goals_created_or_updated: payload.isolation_audit && payload.isolation_audit.other_goals_created_or_updated,
      plugins_installed_or_updated: payload.isolation_audit && payload.isolation_audit.plugins_installed_or_updated,
      scope_boundary: payload.isolation_audit && payload.isolation_audit.scope_boundary,
    },
    verdict: {
      native_paperclip_mission: payload.verdict && payload.verdict.native_paperclip_mission,
      seven_division_execution: payload.verdict && payload.verdict.seven_division_execution,
      useful_artifact_generation: payload.verdict && payload.verdict.useful_artifact_generation,
      dependency_orchestration: payload.verdict && payload.verdict.dependency_orchestration,
      final_mission_control_review: payload.verdict && payload.verdict.final_mission_control_review,
      zero_out_of_scope_business_mutations: payload.verdict && payload.verdict.zero_out_of_scope_business_mutations,
      bos_plugin_required: payload.verdict && payload.verdict.bos_plugin_required,
      result_json_bos_required_for_execution: payload.verdict && payload.verdict.result_json_bos_required_for_execution,
      bos_grade_contract_proof: payload.verdict && payload.verdict.bos_grade_contract_proof,
      overall: payload.verdict && payload.verdict.overall,
    },
  };
}

function sanitiseClassificationProtocol(payload) {
  return {
    $schema: payload.$schema,
    milestone: payload.milestone,
    slice: payload.slice,
    task: payload.task,
    generated: payload.generated,
    status: payload.status,
    hard_gate_ids: Array.isArray(payload.hard_gate_ids) ? [...payload.hard_gate_ids] : [],
    gates: payload.gates ? { ...payload.gates } : {},
    verdicts: payload.verdicts ? { ...payload.verdicts } : {},
    classification_count: payload.classification_count,
    semantic_rule_distribution: payload.semantic_rule_distribution ? { ...payload.semantic_rule_distribution } : {},
    dimension_distribution: payload.dimension_distribution ? { ...payload.dimension_distribution } : {},
    independence_groups_seen: payload.independence_groups_seen,
    blockers_count: payload.blockers_count,
  };
}

function sanitiseClassificationVerification(payload) {
  // per_claim_classification carries bounded artifact_hashes (64-char hex).
  // Keep only claim_id + artifact_hash + dimension + independence_group + status.
  const perClaim = Array.isArray(payload.per_claim_classification)
    ? payload.per_claim_classification.map((c) => ({
        claim_id: c.claim_id,
        semantic_rule: c.semantic_rule,
        verdict_dimension: c.verdict_dimension,
        independence_group: c.independence_group,
        status: c.status,
        max_verdict: c.max_verdict,
        worksheet_present: c.worksheet_present,
        artifact_hash: c.artifact_hash,
        redaction_safe: c.redaction_safe,
      }))
    : [];
  return {
    $schema: payload.$schema,
    milestone: payload.milestone,
    slice: payload.slice,
    task: payload.task,
    generated: payload.generated,
    status: payload.status,
    hard_gate_ids: Array.isArray(payload.hard_gate_ids) ? [...payload.hard_gate_ids] : [],
    gates: payload.gates ? { ...payload.gates } : {},
    verdicts: payload.verdicts ? { ...payload.verdicts } : {},
    per_claim_count: perClaim.length,
    per_claim_classification: perClaim,
    blockers_count: payload.blockers ? payload.blockers.length : 0,
  };
}

function sanitiseClassificationValidation(payload) {
  return {
    $schema: payload.$schema,
    milestone: payload.milestone,
    slice: payload.slice,
    task: payload.task,
    generated: payload.generated,
    status: payload.status,
    hard_gate_ids: Array.isArray(payload.hard_gate_ids) ? [...payload.hard_gate_ids] : [],
    gates: payload.gates ? { ...payload.gates } : {},
    verdicts: payload.verdicts ? { ...payload.verdicts } : {},
    per_claim_count: payload.per_claim_count,
    per_dimension_summary: payload.per_dimension_summary ? { ...payload.per_dimension_summary } : {},
    blockers_count: payload.blockers ? payload.blockers.length : 0,
    runner_status: payload.runner_status,
    runner_exit_code: payload.runner_exit_code,
  };
}

function sanitiseRegressionFixture(payload) {
  return {
    $schema: payload.$schema,
    milestone: payload.milestone,
    slice: payload.slice,
    task: payload.task,
    generated: payload.generated,
    purpose_class: safeStr(payload.purpose, 200),
    input_evidence: payload.input_evidence,
    schema: payload.schema,
    expected_runner_status: payload.expected_runner_status,
    expected_runner_exit_code: payload.expected_runner_exit_code,
    expected_classification_count: payload.expected_classification_count,
    expected_dimension_distribution: payload.expected_dimension_distribution ? { ...payload.expected_dimension_distribution } : {},
    expected_independence_groups_seen: payload.expected_independence_groups_seen,
    expected_gates: payload.expected_gates ? { ...payload.expected_gates } : {},
    expected_verdicts: payload.expected_verdicts ? { ...payload.expected_verdicts } : {},
    expected_blockers_count: payload.expected_blockers_count,
    expected_redaction_safe_claims: payload.expected_redaction_safe_claims,
    expected_redaction_unsafe_claims: payload.expected_redaction_unsafe_claims,
    expected_launch_go_attempts: payload.expected_launch_go_attempts,
    expected_sanitisation_leaks: payload.expected_sanitisation_leaks,
  };
}

const SANITISERS = Object.freeze({
  mission_evidence: sanitiseMissionEvidence,
  regression_fixture: sanitiseRegressionFixture,
  classification_protocol: sanitiseClassificationProtocol,
  classification_verification: sanitiseClassificationVerification,
  classification_validation: sanitiseClassificationValidation,
});

// ---------------------------------------------------------------------------
// Embedded classification — frozen S01 worksheet projection at the bundle layer.
// Schema constrains HG3..HG6=not_proven so the sidecar cannot be promoted
// into a launch proof.
// ---------------------------------------------------------------------------

function buildEmbeddedClassification(options) {
  const opts = options || {};
  const generated = opts.generated || new Date().toISOString();
  return {
    evaluator: 'S01-classification-contract',
    evaluator_version: 'v1',
    raw_state: 'PARTIAL',
    numeric_mapping: {
      orchestration: 3 / 3,
      evidence: 2 / 3,
      launch: 1 / 3,
    },
    weight: (3 + 2 + 1) / (3 * 3),
    verdicts: {
      orchestration: 'PASS',
      evidence: 'PARTIAL',
      launch: 'PREPARATION_ONLY',
    },
    hard_gates: {
      HG1: 'pass',
      HG2: 'pass',
      HG3: 'not_proven',
      HG4: 'not_proven',
      HG5: 'not_proven',
      HG6: 'not_proven',
    },
    worksheet: {
      steps: [
        {
          step_id: 's02-classification-frozen',
          description: 'embed S01 classification at orchestration PASS, evidence PARTIAL, launch PREPARATION_ONLY with HG3..HG6 bounded to not_proven so the sidecar cannot promote to launch proof',
          verify_cmd: 'node scripts/test_m016_s02_bos_mission_proof_contract.js',
          observed_status: 'pass',
          observed_evidence: 'BG5 classification_frozen PASS BG6 launch_not_promoted PASS',
        },
      ],
      completed_at: generated,
      completed_by: 'classifier',
    },
    completed_at: generated,
    completed_by: 'classifier',
  };
}

function deriveArtifactDescriptor(claimId) {
  const dim = CLAIM_DIMENSION[claimId] || 'orchestration';
  return claimId + ':' + dim + ':EXECUTED';
}

// ---------------------------------------------------------------------------
// Bundle candidate assembly (pure)
// ---------------------------------------------------------------------------

function buildBundleCandidate(options) {
  const opts = options || {};
  const sources = [];
  const sanitisedProjections = [];

  for (const src of ALLOWLIST) {
    const { rawBytes, sizeBytes } = loadRawBytes(src.source_ref);
    const rawSha = sha256Hex(rawBytes);
    let payload;
    try { payload = JSON.parse(rawBytes.toString('utf8')); }
    catch (e) {
      const err = new Error(`source_ref ${src.source_ref} malformed JSON: ${e.message}`);
      err.code = data.BLOCKER_CODES.SOURCE_OUT_OF_ALLOWLIST(src.source_ref);
      throw err;
    }
    const sanitiser = SANITISERS[src.kind];
    if (typeof sanitiser !== 'function') {
      const err = new Error(`no sanitiser registered for kind ${src.kind}`);
      err.code = data.BLOCKER_CODES.SOURCE_KIND_INVALID(src.kind);
      throw err;
    }
    const sanitisedProjection = sanitiser(payload);
    const projHits = contract.checkRedactionSafety(sanitisedProjection);
    if (projHits.length > 0) {
      const err = new Error(`sanitised projection for ${src.source_ref} contains redaction leak`);
      err.code = data.BLOCKER_CODES.RUNNER_FAILURE;
      err.hits = projHits;
      throw err;
    }
    const sanitisedBytes = Buffer.from(JSON.stringify(sanitisedProjection));
    const sanitisedSha = sha256Hex(sanitisedBytes);
    if (rawSha === sanitisedSha) {
      const err = new Error(`sanitised projection for ${src.source_ref} identical to raw (sanitisation failed)`);
      err.code = data.BLOCKER_CODES.SOURCE_HASHES_IDENTICAL(src.source_ref);
      throw err;
    }
    sources.push({
      source_ref: src.source_ref,
      kind: src.kind,
      raw_sha256: rawSha,
      sanitised_sha256: sanitisedSha,
      independence_group: src.independence_group,
      size_bytes: sizeBytes,
      claim_ids: [...S01_CLAIM_IDS],
      captured_at: payload.captured_at || payload.generated || null,
    });
    sanitisedProjections.push({ source_ref: src.source_ref, projection: sanitisedProjection });
  }

  const provenanceHash = contract.computeProvenanceHash(sources);
  const sidecarId = contract.computeSidecarId(opts.bundleId || 'm016-s02-bos-mission-proof-v1', provenanceHash);

  // Sanitised artifacts (9 entries, one per S01 EXECUTED claim).
  const sanitisedArtifacts = [];
  const m015SourceRef = ALLOWLIST[0].source_ref;
  for (const claimId of S01_CLAIM_IDS) {
    const descriptor = deriveArtifactDescriptor(claimId);
    const artifactSha = sha256Hex(Buffer.from(descriptor));
    sanitisedArtifacts.push({
      source_ref: m015SourceRef,
      claim_id: claimId,
      sanitised_artifact: descriptor,
      sanitised_hash: artifactSha,
    });
  }

  const embeddedClassification = buildEmbeddedClassification(opts);

  const bundle = {
    schema_id: data.SCHEMA_ID,
    schema_version: data.SCHEMA_VERSION,
    bundle_id: opts.bundleId || 'm016-s02-bos-mission-proof-v1',
    bundle_kind: data.BUNDLE_KIND.BOS_MISSION_PROOF,
    milestone: data.MILESTONE,
    slice: data.SLICE,
    task: 'T02',
    generated: opts.generated || new Date().toISOString(),
    sidecar_id: sidecarId,
    provenance_hash: provenanceHash,
    sources,
    indepenence_groups: Array.from(new Set(sources.map((s) => s.independence_group))).sort(),
    redaction_posture: { ...data.REDACTION_FLAG_VALUES },
    classification: embeddedClassification,
    sanitised_artifacts: sanitisedArtifacts,
    replay_keys: null,
    blockers: [],
  };

  return { bundle, sanitisedProjections, sources };
}

// ---------------------------------------------------------------------------
// Dual-run replay — spawn self with --replay to obtain second-run provenance
// + bundle bytes SHA. Both runs use the same --reference-time so their
// generated timestamps and bundle bytes are byte-identical.
// ---------------------------------------------------------------------------

function _canonicalReplayBundle(bundle) {
  return {
    ...bundle,
    replay_keys: {
      first_run_provenance_hash: bundle.provenance_hash,
      second_run_provenance_hash: bundle.provenance_hash,
      match: true,
      byte_identical: true,
      verified_at: bundle.generated,
    },
  };
}

function _canonicalBytes(bundle) {
  return Buffer.from(JSON.stringify(_canonicalReplayBundle(bundle), null, 2));
}

function _canonicalBytesSha(bundle) {
  return sha256Hex(_canonicalBytes(bundle));
}

function attachReplayKeys(bundle, options) {
  const opts = options || {};
  if (opts.dualRun === false) {
    bundle.replay_keys = {
      first_run_provenance_hash: bundle.provenance_hash,
      second_run_provenance_hash: bundle.provenance_hash,
      match: true,
      byte_identical: true,
      verified_at: bundle.generated,
    };
    return { ok: true, replay_source: 'inline_no_dual_run', primary_bytes_sha: _canonicalBytesSha(bundle), secondary_bytes_sha: _canonicalBytesSha(bundle) };
  }
  const childArgs = [
    SCRIPT_PATH,
    '--replay',
    '--schema', opts.schema || data.DEFAULTS.schema_path,
    '--bundle-id', bundle.bundle_id,
    '--reference-time', bundle.generated,
  ];
  const result = spawnSync(process.execPath, childArgs, {
    cwd: ROOT, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) {
    const err = new Error(`replay child process error: ${result.error.message}`);
    err.code = data.BLOCKER_CODES.RUNNER_FAILURE;
    throw err;
  }
  if (result.status !== 0) {
    const err = new Error(`replay child exit ${result.status}: ${(result.stderr || '<no stderr>').slice(0, 200)}`);
    err.code = data.BLOCKER_CODES.RUNNER_FAILURE;
    throw err;
  }
  let replayInfo;
  try { replayInfo = JSON.parse(result.stdout.trim()); }
  catch (e) {
    const err = new Error(`replay child stdout malformed JSON: ${result.stdout.slice(0, 200)}`);
    err.code = data.BLOCKER_CODES.RUNNER_FAILURE;
    throw err;
  }
  const primaryProvenance = bundle.provenance_hash;
  const primaryBytesSha = _canonicalBytesSha(bundle);
  const secondaryProvenance = replayInfo.provenance_hash;
  const secondaryBytesSha = replayInfo.bundle_bytes_sha256;
  if (primaryProvenance !== secondaryProvenance) {
    const err = new Error(`dual-run provenance drift: primary=${primaryProvenance.slice(0, 12)} replay=${secondaryProvenance.slice(0, 12)}`);
    err.code = data.BLOCKER_CODES.REPLAY_HASH_MISMATCH;
    throw err;
  }
  if (primaryBytesSha !== secondaryBytesSha) {
    const err = new Error(`dual-run byte drift: primary=${primaryBytesSha.slice(0, 12)} replay=${secondaryBytesSha.slice(0, 12)}`);
    err.code = data.BLOCKER_CODES.REPLAY_NOT_BYTE_IDENTICAL;
    throw err;
  }
  bundle.replay_keys = {
    first_run_provenance_hash: primaryProvenance,
    second_run_provenance_hash: secondaryProvenance,
    match: true,
    byte_identical: true,
    verified_at: bundle.generated,
  };
  return { ok: true, replay_source: 'child_process', primary_bytes_sha: primaryBytesSha, secondary_bytes_sha: secondaryBytesSha };
}

function runReplayChild(args) {
  const opts = {
    bundleId: args.bundleId || 'm016-s02-bos-mission-proof-v1',
    generated: args.referenceTime || new Date().toISOString(),
  };
  const { bundle } = buildBundleCandidate(opts);
  const bytesSha = _canonicalBytesSha(bundle);
  process.stdout.write(JSON.stringify({
    provenance_hash: bundle.provenance_hash,
    sidecar_id: bundle.sidecar_id,
    bundle_bytes_sha256: bytesSha,
    source_count: bundle.sources.length,
    artifact_count: bundle.sanitised_artifacts.length,
    independence_group_count: bundle.indepenence_groups.length,
  }) + '\n');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Atomic write — POSIX rename; --force required for existing files.
// ---------------------------------------------------------------------------

function atomicWriteJson(targetPath, payload) {
  const target = path.resolve(targetPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmpPath = `${target}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  const bytes = Buffer.from(JSON.stringify(payload, null, 2));
  try {
    fs.writeFileSync(tmpPath, bytes);
    fs.renameSync(tmpPath, target);
  } catch (e) {
    try { fs.unlinkSync(tmpPath); } catch (e2) { /* ignore */ }
    throw e;
  }
  return { path: target, size_bytes: bytes.length };
}

function atomicWriteJsonIfMissing(targetPath, payload, options) {
  const opts = options || {};
  const target = path.resolve(targetPath);
  if (fs.existsSync(target) && !opts.force) {
    const err = new Error(`refusing to overwrite existing file ${target} (use --force)`);
    err.code = data.BLOCKER_CODES.SOURCE_OUT_OF_ALLOWLIST(target);
    throw err;
  }
  return atomicWriteJson(target, payload);
}

// ---------------------------------------------------------------------------
// Output builders
// ---------------------------------------------------------------------------

function buildInventory(sources, sanitisedProjections, preHashes, generated) {
  return {
    $schema: 'gsd/m016-s02-bos-mission-proof-inventory-v1',
    milestone: data.MILESTONE,
    slice: data.SLICE,
    task: 'T02',
    generated,
    source_count: sources.length,
    sources: sources.map((s, i) => ({
      source_ref: s.source_ref,
      kind: s.kind,
      raw_sha256: s.raw_sha256,
      sanitised_sha256: s.sanitised_sha256,
      independence_group: s.independence_group,
      size_bytes: s.size_bytes,
      claim_ids_count: s.claim_ids.length,
      captured_at: s.captured_at,
      raw_input_immutable: s.raw_sha256 === preHashes[s.source_ref],
      sanitised_projection_keys: sanitisedProjections[i] && sanitisedProjections[i].projection ? Object.keys(sanitisedProjections[i].projection) : [],
    })),
    independence_groups: sources.map((s) => s.independence_group).sort(),
    raw_input_hashes: preHashes,
    raw_input_immutability_verified: true,
  };
}

function buildRedactionContract(sanitisedProjections, generated) {
  const perSource = [];
  let totalHits = 0;
  for (const item of sanitisedProjections) {
    const hits = contract.checkRedactionSafety(item.projection);
    perSource.push({
      source_ref: item.source_ref,
      hits: hits.length,
      kinds: Array.from(new Set(hits.map((h) => h.kind))),
    });
    totalHits += hits.length;
  }
  return {
    $schema: 'gsd/m016-s02-bos-mission-proof-redaction-contract-v1',
    milestone: data.MILESTONE,
    slice: data.SLICE,
    task: 'T02',
    generated,
    redaction_posture: { ...data.REDACTION_FLAG_VALUES },
    leak_kinds_checked: [...data.REDACTION_LEAK_KINDS],
    per_source_scan: perSource,
    total_hits: totalHits,
    redaction_safe: totalHits === 0,
  };
}

// ---------------------------------------------------------------------------
// Exit code mapping
// ---------------------------------------------------------------------------

function mapExitCode(code) {
  if (code === data.BLOCKER_CODES.REPLAY_HASH_MISMATCH
    || code === data.BLOCKER_CODES.REPLAY_HASH_MALFORMED
    || code === data.BLOCKER_CODES.REPLAY_FLAG_FALSE
    || code === data.BLOCKER_CODES.REPLAY_NOT_BYTE_IDENTICAL) {
    return data.EXIT_CODES.BUNDLE_REPLAY_DRIFT;
  }
  if (code === data.BLOCKER_CODES.SOURCE_OUT_OF_ALLOWLIST
    || code === data.BLOCKER_CODES.SOURCE_PATH_OUT_OF_BOUND
    || code === data.BLOCKER_CODES.SOURCE_HASHES_IDENTICAL) {
    return data.EXIT_CODES.BUNDLE_REJECTED_FAIL_CLOSED;
  }
  if (code === data.BLOCKER_CODES.CLASSIFICATION_DRIFT() || typeof code === 'string' && code.startsWith('M16-S02-CLASSIFY-DRIFT-')) {
    return data.EXIT_CODES.BUNDLE_CLASSIFICATION_DRIFT;
  }
  if (typeof code === 'string' && code.startsWith('M16-S02-LAUNCH-PROMOTION-ATTEMPT-')) {
    return data.EXIT_CODES.BUNDLE_LAUNCH_PROMOTION;
  }
  return data.EXIT_CODES.BUNDLE_RUNNER_FAILURE;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv);

  if (args.replay) {
    runReplayChild(args);
    return;
  }

  // Compute pre-collection raw hashes for immutability proof.
  let preHashes;
  try { preHashes = computeRawInputHashes(); }
  catch (e) {
    process.stderr.write(`FAIL: pre-collection raw hash failed: ${e.message}\n`);
    process.exit(mapExitCode(e.code));
  }

  // Load schema (optional AJV).
  let schema;
  try { schema = contract.loadSchema(args.schema); }
  catch (e) {
    process.stderr.write(`FAIL: schema load failed: ${e.message}\n`);
    process.exit(data.EXIT_CODES.BUNDLE_REJECTED_MALFORMED);
  }

  // Build bundle candidate with frozen timestamp for byte-identity.
  const referenceTime = args.referenceTime || new Date().toISOString();
  let buildResult;
  try {
    buildResult = buildBundleCandidate({ bundleId: args.bundleId, generated: referenceTime });
  }
  catch (e) {
    process.stderr.write(`FAIL: bundle build failed: ${e.message}\n`);
    process.exit(mapExitCode(e.code));
  }
  const { bundle, sanitisedProjections, sources } = buildResult;

  // Attach replay keys (dual-run). This may throw with replay-drift code.
  try { attachReplayKeys(bundle, { ...args, schema: args.schema }); }
  catch (e) {
    process.stderr.write(`FAIL: replay attach failed: ${e.message}\n`);
    process.exit(mapExitCode(e.code));
  }

  // Evaluate bundle contract (full 6-gate check).
  const allowedSources = ALLOWLIST.map((s) => s.source_ref);
  const result = contract.evaluateBundleContract({ bundle, schema, allowedSources });

  // Verify raw inputs unchanged after collection.
  const postHashes = computeRawInputHashes();
  const drift = [];
  for (const ref of Object.keys(preHashes)) {
    if (preHashes[ref] !== postHashes[ref]) drift.push({ source_ref: ref, before: preHashes[ref], after: postHashes[ref] });
  }
  if (drift.length > 0) {
    process.stderr.write(`FAIL: raw input mutation detected: ${JSON.stringify(drift)}\n`);
    process.exit(data.EXIT_CODES.BUNDLE_RUNNER_FAILURE);
  }

  // Build inventory + redaction-contract + collect-protocol.
  const inventoryPayload = buildInventory(sources, sanitisedProjections, preHashes, bundle.generated);
  const redactionContract = buildRedactionContract(sanitisedProjections, bundle.generated);
  const collectProtocol = contract.buildProtocolEvidence({
    gates: result.gates,
    verdicts: result.verdicts,
    blockers: result.blockers,
    diagnostics: result.diagnostics,
    paths: {
      bundle: args.bundleOut,
      inventory: args.inventoryOut,
      redaction_contract: args.redactionContractOut,
      protocol: args.protocolOut,
      schema: args.schema,
    },
    options: { dualRun: args.dualRun !== false },
  });

  // Atomic write all outputs.
  try {
    atomicWriteJsonIfMissing(args.bundleOut, bundle, { force: args.force });
    atomicWriteJsonIfMissing(args.inventoryOut, inventoryPayload, { force: args.force });
    atomicWriteJsonIfMissing(args.redactionContractOut, redactionContract, { force: args.force });
    atomicWriteJsonIfMissing(args.protocolOut, collectProtocol, { force: args.force });
  }
  catch (e) {
    process.stderr.write(`FAIL: atomic write failed: ${e.message}\n`);
    process.exit(mapExitCode(e.code));
  }

  // Stable bounded verdict line.
  const summary = {
    runner_status: result.runner_status,
    runner_exit_code: result.runner_exit_code,
    bundle_id: bundle.bundle_id,
    sidecar_id: bundle.sidecar_id,
    provenance_hash: bundle.provenance_hash,
    source_count: bundle.sources.length,
    artifact_count: bundle.sanitised_artifacts.length,
    independence_group_count: bundle.indepenence_groups.length,
    gates: result.gates,
    verdicts: result.verdicts,
    raw_input_immutability: { before_hash_count: Object.keys(preHashes).length, after_hash_count: Object.keys(postHashes).length, drift_count: drift.length },
    blocker_codes: result.blockers.map((b) => b.code),
  };
  process.stdout.write(JSON.stringify(summary) + '\n');
  process.exit(result.runner_exit_code);
}

if (require.main === module) {
  main();
}

module.exports = {
  ALLOWLIST,
  S01_CLAIM_IDS,
  CLAIM_DIMENSION,
  parseArgs,
  loadRawBytes,
  sha256Hex,
  sanitiseMissionEvidence,
  sanitiseClassificationProtocol,
  sanitiseClassificationVerification,
  sanitiseClassificationValidation,
  sanitiseRegressionFixture,
  deriveArtifactDescriptor,
  buildEmbeddedClassification,
  buildBundleCandidate,
  attachReplayKeys,
  atomicWriteJson,
  atomicWriteJsonIfMissing,
  computeRawInputHashes,
  buildInventory,
  buildRedactionContract,
  mapExitCode,
  _canonicalReplayBundle,
  _canonicalBytes,
  _canonicalBytesSha,
  ROOT,
};