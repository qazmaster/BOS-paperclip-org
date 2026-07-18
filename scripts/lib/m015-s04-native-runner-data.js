#!/usr/bin/env node
'use strict';

/**
 * scripts/lib/m015-s04-native-runner-data.js
 *
 * M015-4o8lfw / S04 / T03 — Pure data for the bounded-intake + read-only
 * observer harness.
 *
 * No I/O, no evaluation logic. The runner and its tests consume these
 * constants so the heavy lifters stay under the 50KB GSD budget while a
 * single source of truth governs blocker codes, exit codes, intake
 * schema, mission-key format, and budget ceilings.
 *
 * Sections:
 *   1. RUNNER_BLOCKER_CODES  — M15-S04-NATIVE-RUN-* namespace (HARNESS-side)
 *   2. EXIT_CODES            — process exit codes by verdict class
 *   3. DEFAULTS              — paths, budgets, polling intervals, ceiling
 *   4. INTAKE_REQUIRED_KEYS  — root-level required intake fields
 *   5. KEY_FORMATS           — mission_key/idempotency_key/recovery_lock
 *   6. MISSION_NAMESPACE     — top-level keys written to the run evidence
 */

const {
  CANONICAL_DIVISION_NAMES,
} = require('../probe_m015_seven_agent_environment');

const ROOT_REQUIRED_ASSIGNEE = 'Div7.MissionControl';
const EXPECTED_RUNS_PER_MISSION = 7;

const RUNNER_BLOCKER_CODES = Object.freeze({
  RUNNER_FAILURE: 'M15-S04-NATIVE-RUN-RUNNER-FAILURE',
  INTAKE_PAYLOAD_MISSING: 'M15-S04-NATIVE-RUN-INTAKE-PAYLOAD-MISSING',
  INTAKE_PAYLOAD_MALFORMED: 'M15-S04-NATIVE-RUN-INTAKE-PAYLOAD-MALFORMED',
  INTAKE_INVALID: (field) => `M15-S04-NATIVE-RUN-INTAKE-INVALID-${field}`,
  INTAKE_ASSIGNEE_MUST_BE_DIV7: 'M15-S04-NATIVE-RUN-INTAKE-ASSIGNEE-MUST-BE-DIV7',
  INTAKE_PARENT_MUST_BE_NULL: 'M15-S04-NATIVE-RUN-INTAKE-PARENT-MUST-BE-NULL',
  INTAKE_TITLE_REQUIRED: 'M15-S04-NATIVE-RUN-INTAKE-TITLE-REQUIRED',
  INTAKE_DESCRIPTION_REQUIRED: 'M15-S04-NATIVE-RUN-INTAKE-DESCRIPTION-REQUIRED',
  INTAKE_CONFIRMATION_REQUIRED: 'M15-S04-NATIVE-RUN-INTAKE-CONFIRMATION-REQUIRED',
  INTAKE_CONFIRMATION_NOT_EXPLICIT: 'M15-S04-NATIVE-RUN-INTAKE-CONFIRMATION-NOT-EXPLICIT',
  MISSION_KEY_INVALID: 'M15-S04-NATIVE-RUN-MISSION-KEY-INVALID',
  IDEMPOTENCY_KEY_MISSING: 'M15-S04-NATIVE-RUN-IDEMPOTENCY-KEY-MISSING',
  RECOVERY_LOCK_MISSING: 'M15-S04-NATIVE-RUN-RECOVERY-LOCK-MISSING',
  HARNESS_WROTE_MULTIPLE_ROOT: 'M15-S04-NATIVE-RUN-HARNESS-WROTE-MULTIPLE-ROOT',
  HARNESS_WROTE_OPERATING: 'M15-S04-NATIVE-RUN-HARNESS-WROTE-OPERATING',
  HARNESS_POST_INTAKE_WRITE: 'M15-S04-NATIVE-RUN-HARNESS-POST-INTAKE-WRITE',
  ROOT_ISSUE_CREATE_HTTP_ERROR: (status) => `M15-S04-NATIVE-RUN-ROOT-CREATE-HTTP-${status}`,
  ROOT_ISSUE_CREATE_NOT_OBJECT: 'M15-S04-NATIVE-RUN-ROOT-CREATE-RESPONSE-NOT-OBJECT',
  ROOT_ISSUE_ID_MISSING: 'M15-S04-NATIVE-RUN-ROOT-ISSUE-ID-MISSING',
  ROOT_ISSUE_ASSIGNEE_MISMATCH: 'M15-S04-NATIVE-RUN-ROOT-ISSUE-ASSIGNEE-MISMATCH',
  OBSERVER_BUDGET_EXHAUSTED: 'M15-S04-NATIVE-RUN-OBSERVER-BUDGET-EXHAUSTED',
  OBSERVER_TRANSPORT_ERROR: (op) => `M15-S04-NATIVE-RUN-OBSERVER-TRANSPORT-ERROR-${op}`,
  OBSERVED_SIDE_EFFECT_DURING_OBSERVER: (kind) => `M15-S04-NATIVE-RUN-OBSERVED-SIDE-EFFECT-${kind}`,
  LEAK_UUID: 'M15-S04-NATIVE-RUN-LEAK-UUID',
  LEAK_CREDENTIAL: 'M15-S04-NATIVE-RUN-LEAK-CREDENTIAL',
  LEAK_XIAOMI: 'M15-S04-NATIVE-RUN-LEAK-XIAOMI',
});

const EXIT_CODES = Object.freeze({
  MISSION_PASS: 0,
  MISSION_FAIL_CLOSED: 1,
  MISSION_BLOCKED_SAFE: 2,
  MISSION_BLOCKED_NO_RUN: 3,
  MISSION_RUNNER_FAILURE: 4,
  MISSION_HARNESS_WROTE_MULTIPLE_ROOT: 5,
  MISSION_HARNESS_WROTE_OPERATING: 6,
});

const MISSION_KEY_PREFIX = 's04-mission-';
const MISSION_KEY_SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const ISO_SLUG_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(Z|[+-]\d{2}:?\d{2})$/;

const DEFAULTS = Object.freeze({
  admission_path: 'runtime-evidence/M015-S04-admission.json',
  intake_path: 'runtime-evidence/M015-S04-po-intake.json',
  output_path: 'runtime-evidence/M015-S04-native-mission-run.json',
  max_observe_seconds: 600,
  max_observe_seconds_ceiling: 3600,
  poll_interval_ms: 5000,
  poll_interval_ms_min: 500,
});

const REQUIRED_INTAKE_FIELDS = Object.freeze(['title', 'description', 'confirmation']);

const MISSION_NAMESPACE = Object.freeze({
  runner_namespace: 'M15-S04-NATIVE-RUN',
  protocol_namespace: 'M15-S04-PROTOCOL',
  expected_runs_per_mission: EXPECTED_RUNS_PER_MISSION,
  root_required_assignee: ROOT_REQUIRED_ASSIGNEE,
  canonical_divisions: CANONICAL_DIVISION_NAMES,
});

module.exports = {
  ROOT_REQUIRED_ASSIGNEE,
  EXPECTED_RUNS_PER_MISSION,
  RUNNER_BLOCKER_CODES,
  EXIT_CODES,
  MISSION_KEY_PREFIX,
  MISSION_KEY_SLUG_RE,
  ISO_SLUG_RE,
  DEFAULTS,
  REQUIRED_INTAKE_FIELDS,
  MISSION_NAMESPACE,
};
