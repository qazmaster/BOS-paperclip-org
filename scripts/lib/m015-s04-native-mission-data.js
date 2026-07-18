#!/usr/bin/env node
'use strict';

/**
 * scripts/lib/m015-s04-native-mission-data.js
 *
 * M015-4o8lfw / S04 / T02 — Native seven-division mission protocol data.
 *
 * Pure-data module. No I/O, no evaluation logic, no helpers. Contains
 * the static protocol structure that the contract evaluator
 * (./m015-s04-native-mission-contract.js) consumes.
 *
 * Splitting the data out keeps the evaluator file under the 50KB GSD
 * budget while preserving a single source of truth for the protocol.
 *
 * Sections:
 *   1. REQUIRED_PROVIDER             - hermes_local + minimax + MiniMax-M3
 *   2. MISSION_TOPOLOGY              - root + delegation chain
 *   3. DIVISION_OUTPUT_REQUIREMENTS  - per-division durable outputs
 *   4. REVIEW_PATH                   - Div5 review + Div1/Div7 final
 *   5. ALLOWLISTED_SIDE_EFFECTS      - exact mutation kinds
 *   6. TERMINAL_STATES               - per-division terminal status
 *   7. TIME_BUDGETS                  - per-run + mission total envelope
 *   8. IDEMPOTENCY_AND_RECOVERY      - mission_key + recovery lock
 *   9. SECRET_HYGIENE                - 4 regex classes
 *  10. MISSION_GATE_IDS              - MG1..MG10
 *  11. PROTOCOL_GATE_LABELS          - human-readable gate labels
 *  12. BLOCKER_CODES                 - M15-S04-PROTOCOL-* codes
 */

const {
  CANONICAL_DIVISION_NAMES,
  XIAOMI_RE,
  CREDENTIAL_ASSIGNMENT,
  UUID_FULL,
} = require('../probe_m015_seven_agent_environment');

const REQUIRED_PROVIDER = Object.freeze({
  adapter_type: 'hermes_local',
  provider: 'minimax',
  model: 'MiniMax-M3',
  external_io_policy: 'only Div6.External may use web tools; everyone else is terminal+file',
});

const MISSION_TOPOLOGY = Object.freeze({
  root: Object.freeze({
    role: 'PO_ROOT_MISSION',
    required_assignee: 'Div7.MissionControl',
    prohibited_root_assignees: Object.freeze(
      CANONICAL_DIVISION_NAMES.filter((name) => name !== 'Div7.MissionControl'),
    ),
    parent_issue_id_required: false,
    description_required: true,
    idempotency_key_field: 'mission_key',
  }),
  delegation_chain: Object.freeze([
    Object.freeze({ step: 1, from: 'Div7.MissionControl', to: 'Div1.HCO', edge_kind: 'native_assignment_or_child_creation', authorised_creator: 'Div7.MissionControl', authorised_assignee_target: 'Div1.HCO', rationale: 'Div7 delegates strategy → operations handoff; the only legitimate Div1-creator is Div7 itself.' }),
    Object.freeze({ step: 2, from: 'Div1.HCO', to: 'Div2.MasterPlanner', edge_kind: 'native_child_creation_and_assignment', authorised_creator: 'Div1.HCO', authorised_assignee_target: 'Div2.MasterPlanner', rationale: 'Div1 routes operating work; only Div1 may create the Div2 child.' }),
    Object.freeze({ step: 3, from: 'Div1.HCO', to: 'Div3.Treasury', edge_kind: 'native_child_creation_and_assignment', authorised_creator: 'Div1.HCO', authorised_assignee_target: 'Div3.Treasury', rationale: 'Div1 routes operating work; only Div1 may create the Div3 child.' }),
    Object.freeze({ step: 4, from: 'Div1.HCO', to: 'Div4.Production', edge_kind: 'native_child_creation_and_assignment', authorised_creator: 'Div1.HCO', authorised_assignee_target: 'Div4.Production', rationale: 'Div1 routes operating work; only Div1 may create the Div4 child.' }),
    Object.freeze({ step: 5, from: 'Div1.HCO', to: 'Div5.QualificationsLibraryLearning', edge_kind: 'native_child_creation_and_assignment', authorised_creator: 'Div1.HCO', authorised_assignee_target: 'Div5.QualificationsLibraryLearning', rationale: 'Div1 routes operating work; only Div1 may create the Div5 child.' }),
    Object.freeze({ step: 6, from: 'Div1.HCO', to: 'Div6.External', edge_kind: 'native_child_creation_and_assignment', authorised_creator: 'Div1.HCO', authorised_assignee_target: 'Div6.External', rationale: 'Div1 routes operating work; only Div1 may create the Div6 child.' }),
  ]),
  harness_writable_assignees: Object.freeze(['Div7.MissionControl']),
});

const DIVISION_OUTPUT_REQUIREMENTS = Object.freeze({
  'Div1.HCO': Object.freeze({ issue_required: true, comment_required: true, document_required: false, review_required: false, handoff_required: true, handoff_target: 'Div2.MasterPlanner,Div3.Treasury,Div4.Production,Div5.QualificationsLibraryLearning,Div6.External', terminal_disposition_required: true, disposition_state: 'routed', rationale: 'Div1 is the operations hub: it must create/assign the five operating children and post a routing comment.' }),
  'Div2.MasterPlanner': Object.freeze({ issue_required: true, comment_required: true, document_required: true, review_required: false, handoff_required: true, handoff_target: 'Div1.HCO', terminal_disposition_required: true, disposition_state: 'planned', rationale: 'Div2 produces the plan artifact (document) and posts a plan-summary comment that Div1 can read.' }),
  'Div3.Treasury': Object.freeze({ issue_required: true, comment_required: true, document_required: false, review_required: false, handoff_required: true, handoff_target: 'Div1.HCO', terminal_disposition_required: true, disposition_state: 'budgeted', rationale: 'Div3 records budget impact and posts a treasury comment; the budget is not a durable document for S04.' }),
  'Div4.Production': Object.freeze({ issue_required: true, comment_required: true, document_required: true, review_required: false, handoff_required: true, handoff_target: 'Div1.HCO', terminal_disposition_required: true, disposition_state: 'built', rationale: 'Div4 produces the build artifact (document) and a build-summary comment.' }),
  'Div5.QualificationsLibraryLearning': Object.freeze({ issue_required: true, comment_required: true, document_required: false, review_required: true, review_target: 'Div4.Production', handoff_required: true, handoff_target: 'Div1.HCO', terminal_disposition_required: true, disposition_state: 'reviewed', rationale: 'Div5 reviews the Div4 build, posts a review comment, and posts a final disposition comment back to Div1.' }),
  'Div6.External': Object.freeze({ issue_required: true, comment_required: true, document_required: false, review_required: false, handoff_required: true, handoff_target: 'Div1.HCO', terminal_disposition_required: true, disposition_state: 'external_brief_received', rationale: 'Div6 is the only web-enabled division; it produces an external brief comment (no external write, ever).' }),
  'Div7.MissionControl': Object.freeze({ issue_required: true, comment_required: true, document_required: false, review_required: false, handoff_required: true, handoff_target: 'Div1.HCO', terminal_disposition_required: true, disposition_state: 'finalised', rationale: 'Div7 owns the root mission and posts the final disposition comment when the chain reaches terminal state.' }),
});

const REVIEW_PATH = Object.freeze({
  required_reviewer: 'Div5.QualificationsLibraryLearning',
  review_target: 'Div4.Production',
  required_review_states: Object.freeze(['approved', 'approved_with_notes', 'rejected']),
  rejection_state_propagates_back_to: 'Div1.HCO',
  final_disposition_owner: 'Div7.MissionControl',
  routing_disposition_owner: 'Div1.HCO',
  disposition_states: Object.freeze({ Div1: 'routed', Div7: 'finalised' }),
});

const ALLOWLISTED_SIDE_EFFECTS = Object.freeze({
  root_issue: Object.freeze({ kind: 'issue_create', actor: 'harness', assignee: 'Div7.MissionControl', parent_issue_id: null, max_count: 1, rationale: 'The single bounded PO intake mutation.' }),
  div7_to_div1: Object.freeze({ kind: 'issue_create_or_assign', actor: 'Div7.MissionControl', parent_issue_id_required: true, assignee: 'Div1.HCO', max_count: 1, rationale: 'Div7 delegates the strategy → operations handoff to Div1.' }),
  div1_to_operating: Object.freeze({ kind: 'issue_create_or_assign', actor: 'Div1.HCO', parent_issue_id_required: true, assignees: Object.freeze(['Div2.MasterPlanner', 'Div3.Treasury', 'Div4.Production', 'Div5.QualificationsLibraryLearning', 'Div6.External']), max_count: 5, rationale: 'Div1 routes operating work; one child per operating division.' }),
  agent_authored_comments: Object.freeze({ kind: 'comment_create', actor_constraint: 'author_must_be_assignee_or_handoff_peer', max_per_division: 4, rationale: 'Comments are part of the durable handoff/review/disposition trail; authors must be the division itself.' }),
  agent_authored_documents: Object.freeze({ kind: 'document_create', author_constraint: 'author_must_be_div2_or_div4', max_count: 2, rationale: 'Documents are the durable plan/build artifacts; only Div2 (plan) and Div4 (build) produce them.' }),
  issue_disposition_transitions: Object.freeze({ kind: 'issue_status_update', actor_constraint: 'must_match_review_path', max_per_division: 1, rationale: 'Each division records its terminal disposition exactly once.' }),
  heartbeat_runs: Object.freeze({ kind: 'heartbeat_run_invoke', actor_constraint: 'one_per_division_exactly', expected_run_count: 7, max_run_count: 7, rationale: 'A valid mission produces exactly 7 native runs — one per division. The 8-vs-7 anomaly observed in S03 is not a valid native pattern.' }),
});

const TERMINAL_STATES = Object.freeze({
  run_statuses: Object.freeze(['succeeded', 'failed', 'cancelled']),
  run_success_state: 'succeeded',
  mission_pass_required: Object.freeze({ runs_terminal_succeeded: 7, divisions_with_disposition: 7, div5_review_present: true, div1_routing_disposition: true, div7_final_disposition: true, root_issue_disposition_final: true }),
});

const TIME_BUDGETS = Object.freeze({
  per_run_timeout_sec: 600,
  per_run_grace_sec: 5,
  mission_total_budget_sec: 60 * 60,
  poll_interval_ms_min: 1000,
  poll_interval_ms_max: 5000,
  admission_window_sec: 30,
});

const IDEMPOTENCY_AND_RECOVERY = Object.freeze({
  mission_key_required: true,
  mission_key_format: 's04-mission-<ulid-or-iso8601-slug>',
  idempotency_key_required: true,
  idempotency_key_format: '<mission_key>::<root_issue_id>',
  recovery_lock_required: true,
  recovery_lock_format: 'replay-blocked-on:<mission_key>',
  dedupe_window_sec: 24 * 60 * 60,
  expected_runs_per_mission: 7,
});

const PROVIDER_SECRET_NAMES = Object.freeze([
  'PAPERCLIP_API_KEY',
  'MINIMAX_API_KEY',
  'XIAOMI_API_KEY',
  'BETTER_AUTH_SECRET',
  'POSTGRES_PASSWORD',
  'DATABASE_URL',
  'OPENAI_API_KEY',
]);

const SECRET_HYGIENE = Object.freeze({
  uuid: UUID_FULL,
  credential_assignment: CREDENTIAL_ASSIGNMENT,
  xiaomi_or_mimo: XIAOMI_RE,
  provider_secret_names: PROVIDER_SECRET_NAMES,
  synthetic_bos_tag: /\bsynthetic\s+bos\s+light\b/i,
});

const MISSION_GATE_IDS = Object.freeze([
  'MG1 MISSION_TOPOLOGY',
  'MG2 AUTHORSHIP_AND_AUTHORITY',
  'MG3 AGENT_AUTHORED_OUTPUTS',
  'MG4 REVIEW_AND_DISPOSITION_PATH',
  'MG5 ALLOWLISTED_SIDE_EFFECTS',
  'MG6 TERMINAL_RUN_AND_DISPOSITION_STATES',
  'MG7 TIME_BUDGETS',
  'MG8 IDEMPOTENCY_AND_RECOVERY_LOCK',
  'MG9 SECRET_HYGIENE',
  'MG10 NO_SYNTHETIC_BOS_FALLBACK',
]);

const PROTOCOL_GATE_LABELS = Object.freeze({
  mission_topology_pass: 'MG1 MISSION_TOPOLOGY: root assignee === Div7.MissionControl; parent chain Div7→Div1→Div2..Div6 with one child per division',
  authorship_and_authority_pass: 'MG2 AUTHORSHIP_AND_AUTHORITY: Div7 creates Div1 child, Div1 creates Div2..Div6 children, harness only writes to Div7',
  agent_authored_outputs_pass: 'MG3 AGENT_AUTHORED_OUTPUTS: each division emits its required comment/document; only Div2 + Div4 author documents',
  review_and_disposition_path_pass: 'MG4 REVIEW_AND_DISPOSITION_PATH: Div5 reviews Div4; Div1 routes disposition; Div7 finalises the root mission',
  allowlisted_side_effects_pass: 'MG5 ALLOWLISTED_SIDE_EFFECTS: only root issue + 6 children + bounded comments + 2 docs + 7 runs; no extras',
  terminal_run_and_disposition_states_pass: 'MG6 TERMINAL_RUN_AND_DISPOSITION_STATES: exactly 7 runs, all terminal=succeeded; all 7 divisions have disposition comments',
  time_budgets_pass: 'MG7 TIME_BUDGETS: per_run_timeout_sec=600, mission_total=3600; no run exceeded its window',
  idempotency_and_recovery_lock_pass: 'MG8 IDEMPOTENCY_AND_RECOVERY_LOCK: mission_key + idempotency_key + recovery_lock all present and unique',
  secret_hygiene_pass: 'MG9 SECRET_HYGIENE: zero UUIDs, zero credential assignments, zero xiaomi/mimo, zero provider secret names',
  no_synthetic_bos_fallback_pass: 'MG10 NO_SYNTHETIC_BOS_FALLBACK: zero "synthetic bos light" tags in any readback value',
});

const BLOCKER_CODES = Object.freeze({
  ROOT_ASSIGNEE_WRONG: 'M15-S04-PROTOCOL-ROOT-ASSIGNEE-WRONG',
  ROOT_COUNT_OFF: 'M15-S04-PROTOCOL-ROOT-COUNT-OFF',
  HARNESS_WROTE_OPERATING: 'M15-S04-PROTOCOL-HARNESS-WROTE-OPERATING',
  DIV1_CHILD_AUTHORED_BY_WRONG_AGENT: 'M15-S04-PROTOCOL-DIV1-CHILD-AUTHOR-WRONG',
  OPERATING_CHILD_AUTHORED_BY_WRONG_AGENT: 'M15-S04-PROTOCOL-OPERATING-CHILD-AUTHOR-WRONG',
  DIVISION_MISSING_REQUIRED_OUTPUT: (name) => `M15-S04-PROTOCOL-${name}-MISSING-REQUIRED-OUTPUT`,
  UNAUTHORISED_DOCUMENT_AUTHOR: (name) => `M15-S04-PROTOCOL-${name}-UNAUTHORISED-DOC-AUTHOR`,
  DIV5_REVIEW_MISSING: 'M15-S04-PROTOCOL-DIV5-REVIEW-MISSING',
  DIV5_REVIEW_TARGET_WRONG: 'M15-S04-PROTOCOL-DIV5-REVIEW-TARGET-WRONG',
  DIV1_ROUTING_DISPOSITION_MISSING: 'M15-S04-PROTOCOL-DIV1-ROUTING-DISPOSITION-MISSING',
  DIV7_FINAL_DISPOSITION_MISSING: 'M15-S04-PROTOCOL-DIV7-FINAL-DISPOSITION-MISSING',
  ROOT_FINAL_DISPOSITION_MISSING: 'M15-S04-PROTOCOL-ROOT-FINAL-DISPOSITION-MISSING',
  SIDE_EFFECT_NOT_ALLOWLISTED: (kind) => `M15-S04-PROTOCOL-SIDE-EFFECT-NOT-ALLOWLISTED-${kind}`,
  SIDE_EFFECT_OVER_ALLOWLISTED_MAX: (kind) => `M15-S04-PROTOCOL-SIDE-EFFECT-OVER-MAX-${kind}`,
  RUN_COUNT_OFF: 'M15-S04-PROTOCOL-RUN-COUNT-OFF',
  RUN_TERMINAL_STATE_WRONG: (name) => `M15-S04-PROTOCOL-${name}-RUN-TERMINAL-STATE-WRONG`,
  RUN_NOT_FOUND: (name) => `M15-S04-PROTOCOL-${name}-RUN-NOT-FOUND`,
  RUN_OVER_PER_RUN_TIMEOUT: (name) => `M15-S04-PROTOCOL-${name}-RUN-OVER-PER-RUN-TIMEOUT`,
  MISSION_OVER_TOTAL_BUDGET: 'M15-S04-PROTOCOL-MISSION-OVER-TOTAL-BUDGET',
  MISSION_KEY_MISSING: 'M15-S04-PROTOCOL-MISSION-KEY-MISSING',
  IDEMPOTENCY_KEY_MISSING: 'M15-S04-PROTOCOL-IDEMPOTENCY-KEY-MISSING',
  RECOVERY_LOCK_MISSING: 'M15-S04-PROTOCOL-RECOVERY-LOCK-MISSING',
  DUPLICATE_MISSION_KEY: 'M15-S04-PROTOCOL-DUPLICATE-MISSION-KEY',
  LEAK_UUID: 'M15-S04-PROTOCOL-LEAK-UUID',
  LEAK_CREDENTIAL: 'M15-S04-PROTOCOL-LEAK-CREDENTIAL',
  LEAK_XIAOMI: 'M15-S04-PROTOCOL-LEAK-XIAOMI',
  LEAK_PROVIDER_SECRET: 'M15-S04-PROTOCOL-LEAK-PROVIDER-SECRET',
  LEAK_SYNTHETIC_BOS: 'M15-S04-PROTOCOL-LEAK-SYNTHETIC-BOS',
  RUNNER_FAILURE: 'M15-S04-PROTOCOL-RUNNER-FAILURE',
  ADMISSION_BLOCKER_CARRY_FORWARD: 'M15-S04-PROTOCOL-ADMISSION-BLOCKER-CARRY-FORWARD',
  EVIDENCE_MISSING: (label) => `M15-S04-PROTOCOL-EVIDENCE-MISSING-${label}`,
  EVIDENCE_MALFORMED: (label) => `M15-S04-PROTOCOL-EVIDENCE-MALFORMED-${label}`,
  SAFE_BLOCK_DECLARED: 'M15-S04-PROTOCOL-SAFE-BLOCK-DECLARED',
});

module.exports = {
  REQUIRED_PROVIDER,
  MISSION_TOPOLOGY,
  DIVISION_OUTPUT_REQUIREMENTS,
  REVIEW_PATH,
  ALLOWLISTED_SIDE_EFFECTS,
  TERMINAL_STATES,
  TIME_BUDGETS,
  IDEMPOTENCY_AND_RECOVERY,
  PROVIDER_SECRET_NAMES,
  SECRET_HYGIENE,
  MISSION_GATE_IDS,
  PROTOCOL_GATE_LABELS,
  BLOCKER_CODES,
};
