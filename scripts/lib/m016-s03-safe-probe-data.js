#!/usr/bin/env node
'use strict';

/**
 * scripts/lib/m016-s03-safe-probe-data.js
 *
 * M016-txa3vu / S03 / T01 — Frozen registry and constants for the safe
 * operational probe record.
 *
 * Pure-data module. No I/O, no evaluation logic. The schema validator
 * (m016-s03-safe-probe.v1.json) and the contract evaluator
 * (m016-s03-safe-probe-contract.js, T02) consume these constants so the
 * heavy lifter stays under the 50KB GSD budget while a single source of
 * truth governs:
 *
 *   1. SCHEMA + NAMESPACE           — schema_id, schema_version, slice, milestone
 *   2. ROLE_REGISTRY                — seven divisions + nine infrastructure roles
 *   3. PROBE_METHODS                — GET-only allowlist + scratch-drill kind tokens
 *   4. PROHIBITED_METHODS           — mutation verbs rejected at every layer
 *   5. SCRATCH_DRILL_KINDS          — bounded scratch drill vocabulary
 *   6. INDEPENDENCE_GROUPS          — canonical frozen identifiers per role
 *   7. HARD_GATE_IDS                — HG1..HG8 with explicit coverage labels
 *   8. BLOCKER_CODES                — M16-S03-PROBE-* factory functions
 *   9. SOURCE_IDENTITY_KINDS        — paperclip_api_readonly / scratch_drill / offline_bundle_read / observed
 *  10. REDACTION_BOUNDS             — reused UUID_FULL, XIAOMI_RE, CREDENTIAL_ASSIGNMENT
 *  11. REDACTION_FLAG_VALUES        — bounded redaction posture
 *  12. MUTATION_AUDIT_ZERO_COUNTERS — frozen counter names that live probes MUST keep at zero
 *  13. DEAD_COMPANY_UUIDS           — stale UUIDs forbidden as source identity values
 *  14. EXIT_CODES                   — process exit codes
 *  15. DEFAULTS                     — paths, scratch root, fixtures, ceilings
 */


// ---------------------------------------------------------------------------
// Internal sanitizer for blocker-code dynamic tokens. Strips anything outside
// [A-Za-z0-9._-], collapses runs of '-', truncates to 64 chars, and returns
// 'X' for empty output. Keeps role/independence_group/drill_kind and other
// already-validated tokens untouched by callers; only dynamic method/url/etc.
// strings flow through here so the resulting M16-S03-PROBE-* code always
// stays inside the schema pattern.
// ---------------------------------------------------------------------------
function _safeSuffix(value) {
  const raw = String(value == null ? '' : value);
  const cleaned = raw.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!cleaned) return 'X';
  return cleaned.slice(0, 64);
}
const {
  UUID_FULL,
  XIAOMI_RE,
  CREDENTIAL_ASSIGNMENT,
  CANONICAL_DIVISION_NAMES,
} = require('../probe_m015_seven_agent_environment');

// ---------------------------------------------------------------------------
// 1. SCHEMA + NAMESPACE
// ---------------------------------------------------------------------------

const SCHEMA_ID = 'https://gsd.local/schemas/runtime-evidence/m016-s03-safe-probe.v1.json';
const SCHEMA_VERSION = 'v1';

const MILESTONE = 'M016-txa3vu';
const SLICE = 'S03';
const TASK_IDS = Object.freeze(['T01', 'T02', 'T03', 'T04', 'T05', 'T06']);

const PROBE_ID_PREFIX = 'M16-S03-PROBE-';
const PROBE_BLOCKER_NAMESPACE = 'M16-S03-PROBE';
const PROBE_BLOCKER_CODE_PATTERN = '^M16-S03-PROBE-[A-Za-z0-9._-]+$';
const INDEPENDENCE_GROUP_PATTERN = '^[a-z][a-z0-9._-]{2,63}$';
const SCHEMA_NAMESPACE = 'm016-s03-safe-probe-v1';

// ---------------------------------------------------------------------------
// 2. ROLE_REGISTRY
// ---------------------------------------------------------------------------

const ROLE_REGISTRY = Object.freeze([
  // ---- Division probes (HG1 SEMANTIC_RULE_COMPLIANCE) ----
  Object.freeze({
    role: 'Div1.HCO', role_class: 'division',
    independence_group: 'm016-s03-probe-div1-hco',
    gate: 'HG1 SEMANTIC_RULE_COMPLIANCE',
    methodology: 'live-readonly',
    identity_kind: 'paperclip_api_readonly',
    target_kind: 'routing',
  }),
  Object.freeze({
    role: 'Div2.MasterPlanner', role_class: 'division',
    independence_group: 'm016-s03-probe-div2-master-planner',
    gate: 'HG1 SEMANTIC_RULE_COMPLIANCE',
    methodology: 'live-readonly',
    identity_kind: 'paperclip_api_readonly',
    target_kind: 'orchestration',
  }),
  Object.freeze({
    role: 'Div3.Treasury', role_class: 'division',
    independence_group: 'm016-s03-probe-div3-treasury',
    gate: 'HG1 SEMANTIC_RULE_COMPLIANCE',
    methodology: 'live-readonly',
    identity_kind: 'paperclip_api_readonly',
    target_kind: 'financial',
  }),
  Object.freeze({
    role: 'Div4.Production', role_class: 'division',
    independence_group: 'm016-s03-probe-div4-production',
    gate: 'HG1 SEMANTIC_RULE_COMPLIANCE',
    methodology: 'live-readonly',
    identity_kind: 'paperclip_api_readonly',
    target_kind: 'production',
  }),
  Object.freeze({
    role: 'Div5.QualificationsLibraryLearning', role_class: 'division',
    independence_group: 'm016-s03-probe-div5-qualifications',
    gate: 'HG1 SEMANTIC_RULE_COMPLIANCE',
    methodology: 'live-readonly',
    identity_kind: 'paperclip_api_readonly',
    target_kind: 'learning',
  }),
  Object.freeze({
    role: 'Div6.External', role_class: 'division',
    independence_group: 'm016-s03-probe-div6-external',
    gate: 'HG1 SEMANTIC_RULE_COMPLIANCE',
    methodology: 'live-readonly',
    identity_kind: 'paperclip_api_readonly',
    target_kind: 'external',
  }),
  Object.freeze({
    role: 'Div7.MissionControl', role_class: 'division',
    independence_group: 'm016-s03-probe-div7-mission-control',
    gate: 'HG1 SEMANTIC_RULE_COMPLIANCE',
    methodology: 'live-readonly',
    identity_kind: 'paperclip_api_readonly',
    target_kind: 'mission-control',
  }),
  // ---- Infrastructure probes (HG3..HG8) ----
  Object.freeze({
    role: 'paperclip_health', role_class: 'infrastructure',
    independence_group: 'm016-s03-probe-paperclip-health',
    gate: 'HG7 READ_ONLY_BOUNDARY',
    methodology: 'live-readonly',
    identity_kind: 'paperclip_api_readonly',
    target_kind: 'runtime-health',
  }),
  Object.freeze({
    role: 'hermes_environment', role_class: 'infrastructure',
    independence_group: 'm016-s03-probe-hermes-environment',
    gate: 'HG5 SECURITY_POSTURE',
    methodology: 'live-readonly',
    identity_kind: 'paperclip_api_readonly',
    target_kind: 'adapter-environment',
  }),
  Object.freeze({
    role: 'secret_posture', role_class: 'infrastructure',
    independence_group: 'm016-s03-probe-secret-posture',
    gate: 'HG5 SECURITY_POSTURE',
    methodology: 'observed',
    identity_kind: 'observed',
    target_kind: 'redaction-posture',
  }),
  Object.freeze({
    role: 'cost_snapshot', role_class: 'infrastructure',
    independence_group: 'm016-s03-probe-cost-snapshot',
    gate: 'HG4 FINANCIAL_PROTECTION',
    methodology: 'observed',
    identity_kind: 'offline_bundle_read',
    target_kind: 'cost-evidence',
  }),
  Object.freeze({
    role: 'isolation_invariant', role_class: 'infrastructure',
    independence_group: 'm016-s03-probe-isolation-invariant',
    gate: 'HG7 READ_ONLY_BOUNDARY',
    methodology: 'observed',
    identity_kind: 'observed',
    target_kind: 'invariant-summary',
  }),
  Object.freeze({
    role: 'restore_drill', role_class: 'infrastructure',
    independence_group: 'm016-s03-probe-restore-drill',
    gate: 'HG3 RECOVERY_EVIDENCE',
    methodology: 'scratch-drill',
    identity_kind: 'scratch_drill',
    target_kind: 'restore',
    drill_kind: 'restore-drill',
  }),
  Object.freeze({
    role: 'budget_stop_drill', role_class: 'infrastructure',
    independence_group: 'm016-s03-probe-budget-stop-drill',
    gate: 'HG4 FINANCIAL_PROTECTION',
    methodology: 'scratch-drill',
    identity_kind: 'scratch_drill',
    target_kind: 'budget-stop',
    drill_kind: 'budget-stop-drill',
  }),
  Object.freeze({
    role: 'failure_drill', role_class: 'infrastructure',
    independence_group: 'm016-s03-probe-failure-drill',
    gate: 'HG3 RECOVERY_EVIDENCE',
    methodology: 'scratch-drill',
    identity_kind: 'scratch_drill',
    target_kind: 'failure-cleanup',
    drill_kind: 'failure-drill',
  }),
  Object.freeze({
    role: 'redaction_posture_audit', role_class: 'infrastructure',
    independence_group: 'm016-s03-probe-redaction-posture-audit',
    gate: 'HG5 SECURITY_POSTURE',
    methodology: 'observed',
    identity_kind: 'observed',
    target_kind: 'redaction-posture-audit',
  }),
]);

const ROLES_SET = Object.freeze(new Set(ROLE_REGISTRY.map((entry) => entry.role)));
const ROLE_BY_NAME = Object.freeze(
  ROLE_REGISTRY.reduce((acc, entry) => Object.assign(acc, { [entry.role]: entry }), {}),
);
const INDEPENDENCE_GROUPS_SET = Object.freeze(
  new Set(ROLE_REGISTRY.map((entry) => entry.independence_group)),
);

function getRoleEntry(role) {
  if (typeof role !== 'string') return null;
  return ROLE_BY_NAME[role] || null;
}

function isKnownRole(role) {
  return ROLES_SET.has(role);
}

function getIndependenceGroup(role) {
  const entry = getRoleEntry(role);
  return entry ? entry.independence_group : null;
}

function getGateFor(role) {
  const entry = getRoleEntry(role);
  return entry ? entry.gate : null;
}

// ---------------------------------------------------------------------------
// 3. PROBE_METHODS — GET-only allowlist + scratch-drill kind tokens
// ---------------------------------------------------------------------------

const PROBE_METHODS = Object.freeze({
  GET_COMPANIES: 'GET /api/companies',
  GET_COMPANY: 'GET /api/companies/{companyId}',
  GET_AGENTS: 'GET /api/companies/{companyId}/agents',
  GET_AGENT: 'GET /api/agents/{agentId}',
  GET_HEALTH: 'GET /api/health',
  GET_ADAPTER_TEST_ENVIRONMENT: 'GET /api/companies/{companyId}/adapters/{adapterType}/test-environment',
  GET_HEARTBEAT_RUNS: 'GET /api/agents/{agentId}/runs',
  GET_MISSIONS: 'GET /api/companies/{companyId}/missions',
  GET_DOCUMENTS: 'GET /api/companies/{companyId}/documents',
  GET_COMMENTS: 'GET /api/companies/{companyId}/comments',
  GET_AGENT_HEARTBEAT: 'GET /api/agents/{agentId}/heartbeat/runs',
  // Scratch-drill kind tokens (live as the `method` token, not as HTTP method).
  RESTORE_DRILL: 'restore-drill',
  BUDGET_STOP_DRILL: 'budget-stop-drill',
  FAILURE_DRILL: 'failure-drill',
});

const PROBE_METHOD_VALUES = Object.freeze(Object.values(PROBE_METHODS));
const PROBE_METHODS_SET = Object.freeze(new Set(PROBE_METHOD_VALUES));

// Pattern that constrains `method` to either GET-only /api paths or scratch-drill kind tokens.
// Mirrors the schema pattern exactly so the contract evaluator can re-check without drift.
const PROBE_METHOD_PATTERN = '^(GET\\s+/api/[A-Za-z0-9._\\-/{}]+|(restore-drill|budget-stop-drill|failure-drill))$';

function isAllowedMethod(value) {
  if (typeof value !== 'string') return false;
  if (!new RegExp(PROBE_METHOD_PATTERN).test(value)) return false;
  return true;
}

function isScratchDrillMethod(value) {
  if (typeof value !== 'string') return false;
  return value === PROBE_METHODS.RESTORE_DRILL
    || value === PROBE_METHODS.BUDGET_STOP_DRILL
    || value === PROBE_METHODS.FAILURE_DRILL;
}

// ---------------------------------------------------------------------------
// 4. PROHIBITED_METHODS — mutation verbs rejected at every layer
// ---------------------------------------------------------------------------

const PROHIBITED_METHODS = Object.freeze([
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'DESTROY',
  'REMOVE',
  'CREATE',
  'UPDATE',
  'INVOKE',
  'WRITE',
  'MUTATE',
]);

const PROHIBITED_METHODS_SET = Object.freeze(new Set(PROHIBITED_METHODS));

// Anchored regex: first token of method must not start with any prohibited verb.
const MUTATION_VERB_REGEX = /^(?:POST|PUT|PATCH|DELETE|DESTROY|REMOVE|CREATE|UPDATE|INVOKE|WRITE|MUTATE)\b/;

function isProhibitedMethod(value) {
  if (typeof value !== 'string') return false;
  return MUTATION_VERB_REGEX.test(value);
}

// ---------------------------------------------------------------------------
// 5. SCRATCH_DRILL_KINDS
// ---------------------------------------------------------------------------

const SCRATCH_DRILL_KINDS = Object.freeze({
  RESTORE: 'restore-drill',
  BUDGET_STOP: 'budget-stop-drill',
  FAILURE: 'failure-drill',
});
const SCRATCH_DRILL_KINDS_SET = Object.freeze(new Set(Object.values(SCRATCH_DRILL_KINDS)));

function isKnownDrillKind(value) {
  return SCRATCH_DRILL_KINDS_SET.has(value);
}

function getDrillKindForRole(role) {
  const entry = getRoleEntry(role);
  return entry && entry.drill_kind ? entry.drill_kind : null;
}

// ---------------------------------------------------------------------------
// 6. INDEPENDENCE_GROUPS — explicit, mutation_audit enum, frozen identifiers
// ---------------------------------------------------------------------------

const INDEPENDENCE_GROUPS = Object.freeze(
  ROLE_REGISTRY.reduce((acc, entry) => Object.assign(acc, { [entry.role]: entry.independence_group }), {}),
);

const INDEPENDENCE_GROUP_KINDS = Object.freeze({
  ROLE_GROUP: 'role-group',
  CROSS_CUTTING: 'cross-cutting',
});

const HG_TO_INDEPENDENCE_GROUPS = Object.freeze({
  'HG1 SEMANTIC_RULE_COMPLIANCE': Object.freeze(ROLE_REGISTRY.filter((e) => e.gate === 'HG1 SEMANTIC_RULE_COMPLIANCE').map((e) => e.independence_group)),
  'HG3 RECOVERY_EVIDENCE': Object.freeze(ROLE_REGISTRY.filter((e) => e.gate === 'HG3 RECOVERY_EVIDENCE').map((e) => e.independence_group)),
  'HG4 FINANCIAL_PROTECTION': Object.freeze(ROLE_REGISTRY.filter((e) => e.gate === 'HG4 FINANCIAL_PROTECTION').map((e) => e.independence_group)),
  'HG5 SECURITY_POSTURE': Object.freeze(ROLE_REGISTRY.filter((e) => e.gate === 'HG5 SECURITY_POSTURE').map((e) => e.independence_group)),
  'HG7 READ_ONLY_BOUNDARY': Object.freeze(ROLE_REGISTRY.filter((e) => e.gate === 'HG7 READ_ONLY_BOUNDARY').map((e) => e.independence_group)),
});

// ---------------------------------------------------------------------------
// 7. HARD_GATE_IDS — HG1..HG8 with explicit coverage labels
// ---------------------------------------------------------------------------

const HARD_GATE_IDS = Object.freeze([
  'HG1 SEMANTIC_RULE_COMPLIANCE',
  'HG2 PROVENANCE_INTEGRITY',
  'HG3 RECOVERY_EVIDENCE',
  'HG4 FINANCIAL_PROTECTION',
  'HG5 SECURITY_POSTURE',
  'HG6 COMPLIANCE_POSTURE',
  'HG7 READ_ONLY_BOUNDARY',
  'HG8 SCRATCH_ISOLATION',
]);

const HARD_GATE_LABELS = Object.freeze({
  'HG1 SEMANTIC_RULE_COMPLIANCE': 'every probe declares a role from the frozen registry, a bounded scope, an explicit limitations array and a bounded method from the GET-only allowlist',
  'HG2 PROVENANCE_INTEGRITY': 'every EXECUTED record carries exit_code, sanitised_digest, artifact_reference and artifact_hash; NOT_PROVEN records carry attempted_exit_code, observed_blocker_code and observed_blocker_reason',
  'HG3 RECOVERY_EVIDENCE': 'restore-drill and failure-drill produce objective hashes (recovery / cleanup) in owned scratch roots; output references runtime-evidence/M016-S03-scratch-drill-results.json',
  'HG4 FINANCIAL_PROTECTION': 'budget-stop drill exercises the off-by-one threshold in owned scratch state; cost_snapshot records observed usage from offline bundle reads',
  'HG5 SECURITY_POSTURE': 'hermes_environment + secret_posture probes confirm adapter config and redaction posture; limitations explicitly enumerate vendor and bearer leaks rejected',
  'HG6 COMPLIANCE_POSTURE': 'no PII, no public endpoints, no external messaging in any probe result or limiter string; compliance is preserved by observing redaction-flag invariants',
  'HG7 READ_ONLY_BOUNDARY': 'paperclip_api_readonly probes keep every mutation_audit counter at zero and require isolation_invariant.read_only_boundary_pass=true',
  'HG8 SCRATCH_ISOLATION': 'scratch-drill probes run inside /tmp, /private/tmp or /var/folders scratch roots, declare drill_kind explicitly, and require isolation_invariant.scratch_target_used=true and read_only_boundary_pass=true',
});

const HARD_GATE_IDS_SET = Object.freeze(new Set(HARD_GATE_IDS));

function isKnownGate(value) {
  return HARD_GATE_IDS_SET.has(value);
}

// ---------------------------------------------------------------------------
// 8. BLOCKER_CODES — M16-S03-PROBE-* factory functions
// ---------------------------------------------------------------------------

const BLOCKER_CODES = Object.freeze({
  // Schema / record-shape blockers
  RUNNER_FAILURE: 'M16-S03-PROBE-RUNNER-FAILURE',
  PROBE_RECORD_MALFORMED: 'M16-S03-PROBE-RECORD-MALFORMED',
  SCHEMA_VALIDATION_FAILED: (role) => `M16-S03-PROBE-${role}-SCHEMA-VALIDATION-FAILED`,
  PROBE_CLASSIFICATION_INVALID: (role, value) => `M16-S03-PROBE-${role}-CLASSIFICATION-INVALID-${_safeSuffix(value)}`,
  ROLE_UNKNOWN: (role) => `M16-S03-PROBE-ROLE-UNKNOWN-${role}`,
  // Method / command blockers
  METHOD_PROHIBITED: (role, method) => `M16-S03-PROBE-${role}-METHOD-PROHIBITED-${_safeSuffix(method)}`,
  METHOD_NOT_IN_ALLOWLIST: (role, method) => `M16-S03-PROBE-${role}-METHOD-NOT-IN-ALLOWLIST-${_safeSuffix(method)}`,
  MUTATION_VERB_DETECTED: (role, method) => `M16-S03-PROBE-${role}-MUTATION-VERB-DETECTED-${_safeSuffix(method)}`,
  COMMAND_LEAK: (role, kind) => `M16-S03-PROBE-${role}-COMMAND-LEAK-${_safeSuffix(kind)}`,
  // Field-shape blockers
  HASH_MALFORMED: (role) => `M16-S03-PROBE-${role}-HASH-MALFORMED`,
  TIMESTAMP_INVALID: (role, field) => `M16-S03-PROBE-${role}-TIMESTAMP-INVALID-${_safeSuffix(field)}`,
  EXIT_CODE_INVALID: (role, code) => `M16-S03-PROBE-${role}-EXIT-CODE-INVALID-${_safeSuffix(code)}`,
  DIGEST_CHARSET_VIOLATION: (role) => `M16-S03-PROBE-${role}-DIGEST-CHARSET-VIOLATION`,
  PATH_TRAVERSAL: (role, kind) => `M16-S03-PROBE-${role}-PATH-TRAVERSAL-${_safeSuffix(kind)}`,
  LIMITATIONS_MISSING: (role) => `M16-S03-PROBE-${role}-LIMITATIONS-MISSING`,
  SCOPE_MISSING: (role) => `M16-S03-PROBE-${role}-SCOPE-MISSING`,
  // Boundary / isolation blockers
  BOUNDARY_MUTATION_DETECTED: (role, counter, value) => `M16-S03-PROBE-${role}-BOUNDARY-MUTATION-${_safeSuffix(String(counter || '').toUpperCase())}-${_safeSuffix(value)}`,
  SCRATCH_TARGET_MISSING: (kind) => `M16-S03-PROBE-SCRATCH-TARGET-MISSING-${_safeSuffix(kind)}`,
  SCRATCH_PATH_OUTSIDE_TMP: (kind) => `M16-S03-PROBE-SCRATCH-PATH-OUTSIDE-TMP-${_safeSuffix(kind)}`,
  SCRATCH_URL_EQUALS_PRODUCTION: (kind) => `M16-S03-PROBE-SCRATCH-URL-EQUALS-PRODUCTION-${_safeSuffix(kind)}`,
  SCRATCH_COMPANY_EQUALS_PRODUCTION: (kind) => `M16-S03-PROBE-SCRATCH-COMPANY-EQUALS-PRODUCTION-${_safeSuffix(kind)}`,
  PRODUCTION_INTERCEPT: 'M16-S03-PROBE-PRODUCTION-INTERCEPT',
  // Live / drill blockers
  TARGET_UNAVAILABLE: (role) => `M16-S03-PROBE-TARGET-UNAVAILABLE-${role}`,
  TARGET_RATE_LIMITED: (role) => `M16-S03-PROBE-TARGET-RATE-LIMITED-${role}`,
  TARGET_AUTH_FAILED: (role) => `M16-S03-PROBE-TARGET-AUTH-FAILED-${role}`,
  TARGET_TIMEOUT: (role) => `M16-S03-PROBE-TARGET-TIMEOUT-${role}`,
  // Drill precondition / cleanup
  DRILL_PRECONDITION_FAILED: (kind, reason) => `M16-S03-PROBE-DRILL-PRECONDITION-FAILED-${_safeSuffix(kind)}-${_safeSuffix(reason)}`,
  // Verdict / classification guards
  PROBE_FORGED_EXECUTED: (role) => `M16-S03-PROBE-FORGED-EXECUTED-${role}`,
  PROBE_FORGED_NOT_PROVEN: (role) => `M16-S03-PROBE-FORGED-NOT-PROVEN-${role}`,
  LAUNCH_PROMOTION_ATTEMPTED: (role) => `M16-S03-PROBE-LAUNCH-PROMOTION-ATTEMPTED-${role}`,
  VERDICT_DRIFT: (role, claimed) => `M16-S03-PROBE-VERDICT-DRIFT-${role}-${_safeSuffix(claimed)}`,
  // Independence / redaction
  STALE_IDENTITY: (role, identity) => `M16-S03-PROBE-STALE-IDENTITY-${role}-${_safeSuffix(identity)}`,
  INDEPENDENCE_GROUP_REUSED: (group) => `M16-S03-PROBE-INDEPENDENCE-GROUP-REUSED-${_safeSuffix(group)}`,
  REDACTION_LEAK_UUID: (role) => `M16-S03-PROBE-REDACTION-LEAK-UUID-${role}`,
  REDACTION_LEAK_CREDENTIAL: (role) => `M16-S03-PROBE-REDACTION-LEAK-CREDENTIAL-${role}`,
  REDACTION_LEAK_BEARER: (role) => `M16-S03-PROBE-REDACTION-LEAK-BEARER-${role}`,
  REDACTION_LEAK_SK_TOKEN: (role) => `M16-S03-PROBE-REDACTION-LEAK-SK-TOKEN-${role}`,
  REDACTION_LEAK_TP_TOKEN: (role) => `M16-S03-PROBE-REDACTION-LEAK-TP-TOKEN-${role}`,
  REDACTION_LEAK_XIAOMI: (role) => `M16-S03-PROBE-REDACTION-LEAK-XIAOMI-${role}`,
  REDACTION_LEAK_VENDOR_REUSE: (role) => `M16-S03-PROBE-REDACTION-LEAK-VENDOR-REUSE-${role}`,
  REDACTION_LEAK_RAW_BODY: (role) => `M16-S03-PROBE-REDACTION-LEAK-RAW-BODY-${role}`,
  REDACTION_LEAK_RAW_REASONING: (role) => `M16-S03-PROBE-REDACTION-LEAK-RAW-REASONING-${role}`,
  REDACTION_LEAK_RAW_RESULT_JSON: (role) => `M16-S03-PROBE-REDACTION-LEAK-RAW-RESULT-JSON-${role}`,
});

const BLOCKER_CODE_REGEX = new RegExp(PROBE_BLOCKER_CODE_PATTERN);

// ---------------------------------------------------------------------------
// 9. SOURCE_IDENTITY_KINDS
// ---------------------------------------------------------------------------

const SOURCE_IDENTITY_KINDS = Object.freeze({
  PAPERCLIP_API_READONLY: 'paperclip_api_readonly',
  SCRATCH_DRILL: 'scratch_drill',
  OFFLINE_BUNDLE_READ: 'offline_bundle_read',
  OBSERVED: 'observed',
});
const SOURCE_IDENTITY_KINDS_SET = Object.freeze(new Set(Object.values(SOURCE_IDENTITY_KINDS)));

function isValidIdentityKind(value) {
  return SOURCE_IDENTITY_KINDS_SET.has(value);
}

// ---------------------------------------------------------------------------
// 10. REDACTION_BOUNDS
// ---------------------------------------------------------------------------

const REDACTION_LEAK_KINDS = Object.freeze([
  'uuid',
  'credential_assignment',
  'bearer_token',
  'sk_token',
  'tp_token',
  'xiaomi_marker',
  'vendor_reuse_string',
  'raw_reasoning_marker',
  'raw_body_marker',
  'raw_result_json_result',
]);

const REDACTION_BOUNDS = Object.freeze({
  uuid: UUID_FULL,
  credential_assignment: CREDENTIAL_ASSIGNMENT,
  bearer_token: /\bbearer\s+[A-Za-z0-9._-]+/i,
  sk_token: /\bsk-[A-Za-z0-9._-]+/g,
  tp_token: /\btp-[A-Za-z0-9._-]+/g,
  xiaomi_or_mimo: XIAOMI_RE,
  vendor_reuse: /\b(?:hermes\.execution|gsdpi\.execution|plugin\.execution|piko\.execution)\b/i,
  raw_reasoning: /\b(?:chain_of_thought|chain-of-thought|thought_process|reasoning_chain)\b/i,
  raw_body: /\b(?:document_body|comment_body|issue_body|message_body|raw_body)\b/i,
  raw_result_json_result: /\bresult_json\.result\b|"result_json"\s*:\s*\{\s*"result"/,
  bounds: Object.freeze({
    safe_charset_digest: '^[A-Za-z0-9 .:;,_<>/\\-]+$',
    safe_charset_field: '^[A-Za-z0-9 .:;,_<>/\\-{}?&=%@]+$',
    kebab_pattern: '^[a-z][a-z0-9._-]{2,63}$',
    role_token_pattern: '^[A-Za-z0-9._-]+$',
    bounded_digest_min_chars: 8,
    bounded_digest_max_chars: 256,
    bounded_scope_min_chars: 1,
    bounded_scope_max_chars: 200,
    bounded_limitations_max_chars: 200,
    bounded_blocker_reason_min_chars: 1,
    bounded_blocker_reason_max_chars: 400,
    bounded_command_max_chars: 400,
    bounded_probe_id_min_chars: 18,
    bounded_probe_id_max_chars: 80,
    safe_scratch_root_charset: '^/[A-Za-z0-9._/\\-]+$',
  }),
});

const REDACTION_PLACEHOLDERS = Object.freeze({
  redacted_id_placeholder: '<redacted-id>',
  redacted_credential_placeholder: '<redacted-credential-fragment>',
  redacted_token_placeholder: '<redacted>',
});

const REDACTION_FLAG_VALUES = Object.freeze({
  full_ids: false,
  credentials: false,
  xiaomi_endpoint_reuse: false,
  synthetic_bos: false,
  raw_reasoning: false,
  raw_body: false,
  raw_result_json_result: false,
  vendor_reuse_strings: false,
  bounded_digests_only: true,
  redaction_bounds_loaded: true,
});

// ---------------------------------------------------------------------------
// 11. MUTATION_AUDIT — frozen counter taxonomy
// ---------------------------------------------------------------------------

const MUTATION_AUDIT_ZERO_COUNTERS = Object.freeze([
  'issues_created',
  'issues_business_updated',
  'documents_created',
  'documents_business_updated',
  'projects_created',
  'projects_business_updated',
  'goals_created',
  'goals_business_updated',
  'plugins_created',
  'plugins_updated',
  'agents_created',
  'agents_operational_updated',
  'business_mutations_recorded',
]);

const MUTATION_AUDIT_ZERO_COUNTERS_SET = Object.freeze(new Set(MUTATION_AUDIT_ZERO_COUNTERS));

function isKnownCounter(name) {
  return MUTATION_AUDIT_ZERO_COUNTERS_SET.has(name);
}

function allZeroMutationAudit() {
  const result = {};
  for (const counter of MUTATION_AUDIT_ZERO_COUNTERS) result[counter] = 0;
  return result;
}

// ---------------------------------------------------------------------------
// 12. DEAD_COMPANY_UUIDS — stale UUIDs forbidden as identity
// ---------------------------------------------------------------------------

const DEAD_COMPANY_UUIDS = Object.freeze([
  '9feb4c22-05b9-401e-ba67-0e866e3056da',
  '43c74adb-b194-44d1-8f8e-ba142544bb9d',
  '1a194762-b194-44d1-8f8e-ba142544bb9d',
  '7595fd85-b194-44d1-8f8e-ba142544bb9d',
  '7eede16c-b194-44d1-8f8e-ba142544bb9d',
  '8233ea7b-b194-44d1-8f8e-ba142544bb9d',
  'aipay.kz',
  'aipay-kz-stub',
  'bos-light-stale-uuid',
]);

const DEAD_COMPANY_UUIDS_SET = Object.freeze(new Set(DEAD_COMPANY_UUIDS));

function isDeadIdentity(value) {
  if (typeof value !== 'string') return false;
  for (const dead of DEAD_COMPANY_UUIDS) if (value.includes(dead)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// 13. VERDICT_VALUES — bounded probe-record verdict vocabulary
// ---------------------------------------------------------------------------

const VERDICT_VALUES = Object.freeze({
  PASS: 'pass',
  NOT_PROVEN: 'not_proven',
  FAIL_CLOSED: 'fail_closed',
});
const VERDICT_VALUES_SET = Object.freeze(new Set(Object.values(VERDICT_VALUES)));
const FORBIDDEN_PROBE_VERDICTS = Object.freeze(['GO', 'PASS_AUTOMATIC', 'READY']);

function isValidProbeVerdict(value) {
  return VERDICT_VALUES_SET.has(value);
}

// ---------------------------------------------------------------------------
// 14. CLASSIFICATION_VALUES
// ---------------------------------------------------------------------------

const CLASSIFICATION_VALUES = Object.freeze({
  EXECUTED: 'EXECUTED',
  NOT_PROVEN: 'NOT_PROVEN',
});
const CLASSIFICATION_VALUES_SET = Object.freeze(new Set(Object.values(CLASSIFICATION_VALUES)));
const CLASSIFICATION_CANONICAL = Object.freeze({
  OBSERVED: 'OBSERVED',
  EXECUTED: 'EXECUTED',
  INFERRED: 'INFERRED',
  PROPOSED: 'PROPOSED',
  NOT_PROVEN: 'NOT_PROVEN',
});

// ---------------------------------------------------------------------------
// 15. EXIT_CODES — process exit codes by verdict class
// ---------------------------------------------------------------------------

const EXIT_CODES = Object.freeze({
  PROBE_RECORD_VALID: 0,
  PROBE_RECORD_MALFORMED: 1,
  PROBE_MUTATION_DETECTED: 2,
  PROBE_ISOLATION_VIOLATION: 3,
  PROBE_RUNNER_FAILURE: 4,
  PROBE_REDACTION_LEAK: 5,
  PROBE_RATE_LIMITED: 6,
  PROBE_DRILL_FAILED: 7,
  PROBE_BUNDLE_REJECTED: 8,
});

// ---------------------------------------------------------------------------
// 16. DEFAULTS — paths, scratch root, fixtures, ceilings
// ---------------------------------------------------------------------------

const DEFAULTS = Object.freeze({
  schema_path: 'schemas/runtime-evidence/m016-s03-safe-probe.v1.json',
  output_dir: 'runtime-evidence',
  scratch_root: '/tmp/m016-s03-scratch',
  scratch_root_macos_private: '/private/tmp/m016-s03-scratch',
  scratch_root_macos_user: '/var/folders/m016-s03-scratch',
  test_fixture_root: '/tmp/m016-s03-fixtures',
  max_probe_duration_ms: 600000,
  min_hash_chars: 64,
  max_hash_chars_sha256: 64,
  max_hash_chars_sha512: 128,
  max_command_chars: 400,
  max_blocker_reason_chars: 400,
  max_limitation_chars: 200,
  max_scope_chars: 200,
  redacted_id_placeholder: '<redacted-id>',
  redacted_credential_placeholder: '<redacted-credential-fragment>',
  redacted_token_placeholder: '<redacted>',
  independence_group_prefix: 'm016-s03-probe',
});

module.exports = {
  // 1. SCHEMA + NAMESPACE
  SCHEMA_ID,
  SCHEMA_VERSION,
  MILESTONE,
  SLICE,
  TASK_IDS,
  PROBE_ID_PREFIX,
  PROBE_BLOCKER_NAMESPACE,
  PROBE_BLOCKER_CODE_PATTERN,
  INDEPENDENCE_GROUP_PATTERN,
  SCHEMA_NAMESPACE,
  // 2. ROLE_REGISTRY
  ROLE_REGISTRY,
  ROLES_SET,
  ROLE_BY_NAME,
  INDEPENDENCE_GROUPS_SET,
  INDEPENDENCE_GROUPS,
  getRoleEntry,
  isKnownRole,
  getIndependenceGroup,
  getGateFor,
  // 3. PROBE_METHODS
  PROBE_METHODS,
  PROBE_METHOD_VALUES,
  PROBE_METHODS_SET,
  PROBE_METHOD_PATTERN,
  isAllowedMethod,
  isScratchDrillMethod,
  // 4. PROHIBITED_METHODS
  PROHIBITED_METHODS,
  PROHIBITED_METHODS_SET,
  MUTATION_VERB_REGEX,
  isProhibitedMethod,
  // 5. SCRATCH_DRILL_KINDS
  SCRATCH_DRILL_KINDS,
  SCRATCH_DRILL_KINDS_SET,
  isKnownDrillKind,
  getDrillKindForRole,
  // 6. INDEPENDENCE_GROUPS / HG mapping
  INDEPENDENCE_GROUP_KINDS,
  HG_TO_INDEPENDENCE_GROUPS,
  // 7. HARD_GATE_IDS
  HARD_GATE_IDS,
  HARD_GATE_LABELS,
  HARD_GATE_IDS_SET,
  isKnownGate,
  // 8. BLOCKER_CODES
  BLOCKER_CODES,
  BLOCKER_CODE_REGEX,
  // 9. SOURCE_IDENTITY_KINDS
  SOURCE_IDENTITY_KINDS,
  SOURCE_IDENTITY_KINDS_SET,
  isValidIdentityKind,
  // 10. REDACTION_BOUNDS
  REDACTION_LEAK_KINDS,
  REDACTION_BOUNDS,
  REDACTION_PLACEHOLDERS,
  REDACTION_FLAG_VALUES,
  // 11. MUTATION_AUDIT
  MUTATION_AUDIT_ZERO_COUNTERS,
  MUTATION_AUDIT_ZERO_COUNTERS_SET,
  isKnownCounter,
  allZeroMutationAudit,
  // 12. DEAD_COMPANY_UUIDS
  DEAD_COMPANY_UUIDS,
  DEAD_COMPANY_UUIDS_SET,
  isDeadIdentity,
  // 13. VERDICT
  VERDICT_VALUES,
  VERDICT_VALUES_SET,
  FORBIDDEN_PROBE_VERDICTS,
  isValidProbeVerdict,
  // 14. CLASSIFICATION
  CLASSIFICATION_VALUES,
  CLASSIFICATION_VALUES_SET,
  CLASSIFICATION_CANONICAL,
  // 15. EXIT_CODES
  EXIT_CODES,
  // 16. DEFAULTS
  DEFAULTS,
  // Re-exports from probe_m015_seven_agent_environment (for downstream helpers and tests)
  CANONICAL_DIVISION_NAMES,
};
