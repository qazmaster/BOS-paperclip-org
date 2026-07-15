#!/usr/bin/env node
'use strict';

/**
 * scripts/lib/m015-s06-requirement-promotion-data.js
 *
 * M015-4o8lfw / S06 / T05 — Mission Level Requirement Promotion and Readback
 * constants and labels.
 *
 * The promotion runner evaluates whether the joint runtime + independent +
 * browser proof (T01 preflight + T02 mission + T03 validation + T04 public UI)
 * is sufficient to promote S06-owned requirements to mission-level
 * confirmation, OR keep them at the previous proof tier (DIAGNOSTIC_PROVEN or
 * NOT_PROMOTED) recorded by S05.
 *
 * Promotion gate (from slice plan must-have):
 *   "T05 должен разрешать DB-backed readback/update только если одновременно
 *    подтверждены: свежий ADMITTED preflight, MG1–MG10 MISSION_PASS, VG1–VG6
 *    MISSION_PASS, public UI PASS, пустые leak scans и строгий allowlist
 *    перечисленных R-IDs. Любое расхождение оставляет требования на прежнем
 *    proof tier."
 *
 * Owned R-IDs (per slice plan "Затронутые требования"):
 *   R019  — Hermes native invokability
 *   R022  — Canonical seven-division agents + bounded mission harness
 *   R023  — Native issue/document/comment graph + readback
 *   R026  — Routing ordering audit/observability
 *   R030  — Useful human deliverable (launch-readiness decision package)
 *   R031  — Seven differentiating division roles + handoffs
 *   R032  — Terminal completion + dispositions
 *   R035  — Public UI proof (authenticated loopback, no leak)
 *   R037  — MiniMax M3 runtime mission (no Xiaomi fallback)
 *
 * Excluded capability surfaces (per slice plan must-have):
 *   approvals, plugin/piko/data/action/widget/state/activity/events, GSD-Pi
 *   execution, Hermes/GSD-Pi execution rows. These remain explicitly
 *   unpromoted regardless of joint proof outcome.
 */

const CANONICAL_VERDICT = 'M015_S06_PROMOTION';

const VERDICT_CODES = Object.freeze({
  PROMOTION_GRANTED_JOINT_PROOF_PASS: 'PROMOTION_GRANTED_JOINT_PROOF_PASS',
  PROMOTION_DENIED_BLOCKED_UPSTREAM: 'PROMOTION_DENIED_BLOCKED_UPSTREAM',
  PROMOTION_DENIED_LEAK_DETECTED: 'PROMOTION_DENIED_LEAK_DETECTED',
  PROMOTION_DENIED_RID_NOT_ALLOWLISTED: 'PROMOTION_DENIED_RID_NOT_ALLOWLISTED',
  PROMOTION_DENIED_EVIDENCE_MISSING: 'PROMOTION_DENIED_EVIDENCE_MISSING',
  PROMOTION_RUNNER_FAILURE: 'PROMOTION_RUNNER_FAILURE',
});

const PROOF_TIERS = Object.freeze({
  MISSION_PROVEN: 'MISSION_PROVEN',
  DIAGNOSTIC_PROVEN: 'DIAGNOSTIC_PROVEN',
  NOT_PROMOTED: 'NOT_PROMOTED',
  UNVALIDATED: 'UNVALIDATED',
});

const OWNED_RID_ALLOWLIST = Object.freeze([
  'R019',
  'R022',
  'R023',
  'R026',
  'R030',
  'R031',
  'R032',
  'R035',
  'R037',
]);

const RID_SET = Object.freeze(new Set(OWNED_RID_ALLOWLIST));

const RID_LABELS = Object.freeze({
  R019: 'Hermes native invokability — 7/7 canonical division agents via MiniMax M3',
  R022: 'Canonical seven-division agents + bounded mission harness',
  R023: 'Native issue/document/comment graph + readback',
  R026: 'Routing ordering audit/observability — Div7→Div1 decision delegation',
  R030: 'Useful human deliverable — launch-readiness decision package (not POC)',
  R031: 'Seven differentiating division roles + handoffs',
  R032: 'Terminal completion + dispositions on root/children',
  R035: 'Public UI proof — authenticated loopback with no leak',
  R037: 'MiniMax M3 runtime mission — no Xiaomi/Mimo fallback',
});

const RID_EVIDENCE_POINTERS = Object.freeze({
  R019: ['mission-run.orchestrator', 'preflight.s06_provenance'],
  R022: ['mission-run.mission_context', 'validation.gates.readback_integrity_pass'],
  R023: ['mission-run.root_issue', 'mission-run.mission_run', 'public-ui.page_evidence'],
  R026: ['mission-run.s06_provenance.audit_trail_records', 'validation.gates.r026_boundary_classification_pass'],
  R030: ['mission-run.mission_run.durable_artifacts', 'public-ui.diagnostics_summary'],
  R031: ['mission-run.s06_provenance.orchestrator.canonical_aggregate_pass_count', 'validation.gates.preflight_correlation_pass'],
  R032: ['mission-run.mission_run.terminal_dispositions', 'validation.gates.zero_business_mutation_ledger_pass'],
  R035: ['public-ui.verdict', 'public-ui.browser_assertions', 'public-ui.leak_scan'],
  R037: ['preflight.s06_provenance', 'mission-run.s06_provenance.no_unsupported_capability_promotion'],
});

const EXCLUDED_CAPABILITY_SURFACES = Object.freeze([
  'approvals',
  'plugin_registration',
  'piko_tools',
  'data_provider',
  'action_surfaces',
  'dashboard_widget',
  'state_persistence',
  'activity_events',
  'gsdpi_execution',
  'hermes_execution',
  'bos_light_adapters',
  'admin_support',
  'compliance_secrets',
]);

const JOINT_PROOF_GATE_LABELS = Object.freeze({
  preflight_admitted: 'JP1 PREFLIGHT_ADMITTED — preflight verdict is ADMITTED (not BLOCKED_ON_*); preflight single-write boundary is GREEN',
  mission_pass: 'JP2 MISSION_PASS — mission status is MISSION_PASS with MG1-MG10 all green and root_issue+mission_run present',
  validation_pass: 'JP3 VALIDATION_PASS — validation status is MISSION_PASS with VG1-VG6 all green (VG7/VG8 boundary provenance as supporting)',
  ui_pass_no_safe_block: 'JP4 UI_PASS_NO_SAFE_BLOCK — public UI verdict is PASS_AUTH_NO_LEAK AND upstream safe_block_declared=false (no upstream safe-block)',
  leak_scans_clean: 'JP5 LEAK_SCANS_CLEAN — 0 blocking findings (UUID_FULL/CREDENTIAL_ASSIGNMENT/xiaomi/credential-headers) across all 4 upstream evidence + their diagnostic summaries',
  r_id_allowlist_ok: 'JP6 R_ID_ALLOWLIST_OK — every owned R-ID is contained in OWNED_RID_ALLOWLIST (no scope expansion beyond R019/R022/R023/R026/R030/R031/R032/R035/R037)',
  business_mutations_clean: 'JP7 BUSINESS_MUTATIONS_CLEAN — preflight.business_mutations_recorded=0 AND mission.harness_root_issue_create=0 AND mission.mission_context/intake_summary/root_issue/mission_run nullity satisfies zero-mutation invariant',
  do_not_promote_clean: 'JP8 DO_NOT_PROMOTE_CLEAN — S04 admission.do_not_promote_s04=false AND no upstream do_not_promote_s04=true',
  mission_run_present: 'JP9 MISSION_RUN_PRESENT — mission_run is a non-null object containing children_count, durable_documents_count, terminal_runs_count, all_agents_terminal=true',
});

const REDACTION_DISCIPLINE_KEYS = Object.freeze({
  full_ids: false,
  credentials: false,
  xiaomi_endpoint_reuse: false,
  provider_secret_names: false,
  synthetic_bos: false,
});

const CANONICAL_SCHEMA = 'https://gsd.local/schemas/runtime-evidence/m015-s06-requirement-promotion.v1.json';

const REQUIRED_TOP_LEVEL_KEYS = Object.freeze([
  '$schema',
  'milestone',
  'slice',
  'task',
  'generated',
  'canonical_verdict',
  'verdict',
  'verdict_code',
  'status',
  'safe_block_declared',
  'joint_proof_evaluation',
  'requirement_readback',
  'non_promotions',
  'capability_promotions',
  'db_readback_payload',
  'redaction',
  'paths',
]);

const PREVIOUS_TIER_DEFAULTS = Object.freeze({
  R019: PROOF_TIERS.DIAGNOSTIC_PROVEN,
  R022: PROOF_TIERS.DIAGNOSTIC_PROVEN,
  R023: PROOF_TIERS.DIAGNOSTIC_PROVEN,
  R026: PROOF_TIERS.DIAGNOSTIC_PROVEN,
  R030: PROOF_TIERS.NOT_PROMOTED,
  R031: PROOF_TIERS.NOT_PROMOTED,
  R032: PROOF_TIERS.DIAGNOSTIC_PROVEN,
  R035: PROOF_TIERS.DIAGNOSTIC_PROVEN,
  R037: PROOF_TIERS.DIAGNOSTIC_PROVEN,
});

const S05_RID_KEY_MAP = Object.freeze({
  R019: 'R019_hermes_native_invokability',
  R022: 'R022_canonical_seven_division_agents',
  R023: 'R023_safe_provider_endpoint_config',
  R026: 'R026_routing_ordering',
  R030: 'R030_requirements_out_of_scope',
  R031: 'R031_requirements_out_of_scope',
  R032: 'R032_bos_proofability',
  R035: 'R035_admission_fail_closed_boundary',
  R037: 'R037_no_premature_business_mutations',
});

const UPSTREAM_PATHS = Object.freeze({
  preflight: 'runtime-evidence/M015-S06-preflight.json',
  missionRun: 'runtime-evidence/M015-S06-native-mission-run.json',
  validation: 'runtime-evidence/M015-S06-native-mission-validation.json',
  publicUi: 'runtime-evidence/M015-S06-public-ui-proof.json',
  s05Remediation: 'runtime-evidence/M015-S05-remediation-evidence.json',
  s04Admission: 'runtime-evidence/M015-S04-admission.json',
});

const OUTPUT_PATH = 'runtime-evidence/M015-S06-requirement-promotion.json';

module.exports = {
  CANONICAL_VERDICT,
  VERDICT_CODES,
  PROOF_TIERS,
  OWNED_RID_ALLOWLIST,
  RID_SET,
  RID_LABELS,
  RID_EVIDENCE_POINTERS,
  EXCLUDED_CAPABILITY_SURFACES,
  JOINT_PROOF_GATE_LABELS,
  REDACTION_DISCIPLINE_KEYS,
  CANONICAL_SCHEMA,
  REQUIRED_TOP_LEVEL_KEYS,
  PREVIOUS_TIER_DEFAULTS,
  S05_RID_KEY_MAP,
  UPSTREAM_PATHS,
  OUTPUT_PATH,
};