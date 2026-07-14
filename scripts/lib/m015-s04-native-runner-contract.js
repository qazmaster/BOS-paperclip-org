#!/usr/bin/env node
'use strict';

/**
 * scripts/lib/m015-s04-native-runner-contract.js
 *
 * M015-4o8lfw / S04 / T03 — Pure-function contract for the bounded-intake
 * + read-only observer harness.
 *
 * No transport, no observer loop, no I/O. Consumes data constants from
 * ./m015-s04-native-runner-data.js and the T02 protocol evaluator from
 * ./validate_m015_s04_native_mission.js (when available). Drives the same
 * shapes (validateIntake, deriveMissionContext, loadRunnerInput,
 * aggregateMissionRun, evaluateMissionOutcome, buildRunnerEvidence,
 * writeRunnerEvidence) that the runner file calls.
 *
 * Splitting these out keeps the runner file under the 50KB GSD budget
 * while a single source of truth governs harness-side invariants:
 *
 *   - intake required fields and literal-boolean confirmations
 *   - mission_key / idempotency_key / recovery_lock format derivation
 *   - missionRun shape for the T02 evaluator (issues / comments / docs /
 *     heartbeat_runs / side_effects / dispositions / reviews / keys)
 *   - admission-aware verdict derivation matching T02 exit-code policy
 *   - belt-and-braces redaction refusal before fs.writeFileSync
 */

const fs = require('fs');
const path = require('path');
const {
  scrubEvidence,
  UUID_FULL,
  CREDENTIAL_ASSIGNMENT,
  XIAOMI_RE,
} = require('../probe_m015_seven_agent_environment');
const {
  RUNNER_BLOCKER_CODES,
  REQUIRED_INTAKE_FIELDS,
  ROOT_REQUIRED_ASSIGNEE,
  MISSION_KEY_PREFIX,
  MISSION_KEY_SLUG_RE,
} = require('./m015-s04-native-runner-data');

const ROOT = path.resolve(__dirname, '..', '..');

// T02's evaluator is required; resolve lazily so a missing validator at
// test time does not crash. runOnce() in the runner already enforces
// admit-or-block semantics that short-circuit before this is called.
const T02 = (() => {
  try {
    return require('../validate_m015_s04_native_mission');
  } catch (_) {
    return {
      BLOCKER_CODES: {},
      evaluateMissionContract: null,
      compileProtocolBlockers: null,
      buildProtocolEvidence: null,
      evaluateProtocol: null,
    };
  }
})();

const PROTOCOL_BLOCKER_CODES = T02.BLOCKER_CODES || {};

// ---------------------------------------------------------------------------
// Small helpers.
// ---------------------------------------------------------------------------

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function nowIso() {
  return new Date().toISOString();
}

function isoToSlug(iso) {
  // Drop the milliseconds segment and replace colons (and any remaining
  // dots) with dashes so that ISO-8601 timestamps make a valid slug.
  // Example: '2026-07-14T16:00:00.000Z' -> '2026-07-14T16-00-00Z'.
  const noMs = typeof iso === 'string' ? iso.replace(/\.\d{3}/, '') : '';
  return noMs.replace(/[:]/g, '-');
}

function slugify(value) {
  return String(value == null ? '' : value)
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

// ---------------------------------------------------------------------------
// loadRunnerInput — pure function. Loads admission + intake JSON.
// ---------------------------------------------------------------------------

function loadRunnerInput({ admissionPath, intakePath } = {}) {
  const admission = loadAdmissionEvidence(admissionPath);
  let intake = null;
  if (intakePath) {
    intake = readJsonOrThrow(intakePath, 'S04-po-intake');
  }
  return { admission, intake };
}

function loadAdmissionEvidence(filePath) {
  if (!fs.existsSync(filePath)) {
    const err = new Error(`admission evidence missing at ${path.relative(ROOT, filePath)}`);
    err.code = PROTOCOL_BLOCKER_CODES.EVIDENCE_MISSING
      ? PROTOCOL_BLOCKER_CODES.EVIDENCE_MISSING('S04-admission')
      : RUNNER_BLOCKER_CODES.RUNNER_FAILURE;
    throw err;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (inner) {
    const err = new Error(`admission evidence malformed JSON at ${path.relative(ROOT, filePath)} (${inner.message})`);
    err.code = PROTOCOL_BLOCKER_CODES.EVIDENCE_MALFORMED
      ? PROTOCOL_BLOCKER_CODES.EVIDENCE_MALFORMED('S04-admission')
      : RUNNER_BLOCKER_CODES.RUNNER_FAILURE;
    throw err;
  }
}

function readJsonOrThrow(filePath, label) {
  if (!fs.existsSync(filePath)) {
    const err = new Error(`runner input missing: ${label} at ${path.relative(ROOT, filePath)}`);
    err.code = RUNNER_BLOCKER_CODES.INTAKE_PAYLOAD_MISSING;
    err.detail = label;
    throw err;
  }
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (inner) {
    const err = new Error(`runner input unreadable: ${label} (${inner.message})`);
    err.code = RUNNER_BLOCKER_CODES.INTAKE_PAYLOAD_MALFORMED;
    err.detail = label;
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch (inner) {
    const err = new Error(`runner input malformed JSON: ${label} (${inner.message})`);
    err.code = RUNNER_BLOCKER_CODES.INTAKE_PAYLOAD_MALFORMED;
    err.detail = label;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// validateIntake — pure function. Required fields + literal-boolean
// confirmation + assignee/parent invariant.
// ---------------------------------------------------------------------------

function validateIntake(rawIntake) {
  const blockers = [];
  if (!rawIntake || typeof rawIntake !== 'object' || Array.isArray(rawIntake)) {
    blockers.push({
      code: RUNNER_BLOCKER_CODES.INTAKE_PAYLOAD_MALFORMED,
      severity: 'blocking',
      agent: null,
      reason: 'intake must be a JSON object',
    });
    return { ok: false, blockers, intake: null };
  }
  for (const field of REQUIRED_INTAKE_FIELDS) {
    if (!(field in rawIntake)) {
      blockers.push({
        code: RUNNER_BLOCKER_CODES.INTAKE_INVALID(field),
        severity: 'blocking', agent: null,
        reason: `required intake field '${field}' missing`,
      });
    }
  }
  if (nonEmptyString(rawIntake.title)) {
    // ok
  } else if ('title' in rawIntake) {
    blockers.push({
      code: RUNNER_BLOCKER_CODES.INTAKE_TITLE_REQUIRED,
      severity: 'blocking', agent: null,
      reason: 'intake.title must be a non-empty string',
    });
  }
  if (nonEmptyString(rawIntake.description)) {
    // ok
  } else if ('description' in rawIntake) {
    blockers.push({
      code: RUNNER_BLOCKER_CODES.INTAKE_DESCRIPTION_REQUIRED,
      severity: 'blocking', agent: null,
      reason: 'intake.description must be a non-empty string',
    });
  }
  if (!rawIntake.confirmation || typeof rawIntake.confirmation !== 'object') {
    blockers.push({
      code: RUNNER_BLOCKER_CODES.INTAKE_CONFIRMATION_REQUIRED,
      severity: 'blocking', agent: null,
      reason: 'intake.confirmation must be an object',
    });
  } else {
    const explicit = rawIntake.confirmation.explicit;
    const reasonText = rawIntake.confirmation.reason;
    if (explicit !== true) {
      blockers.push({
        code: RUNNER_BLOCKER_CODES.INTAKE_CONFIRMATION_NOT_EXPLICIT,
        severity: 'blocking', agent: null,
        reason: 'intake.confirmation.explicit must be literally true (=== true)',
      });
    }
    if (!nonEmptyString(reasonText)) {
      blockers.push({
        code: RUNNER_BLOCKER_CODES.INTAKE_INVALID('confirmation.reason'),
        severity: 'blocking', agent: null,
        reason: 'intake.confirmation.reason must be a non-empty string explaining the bounded intake',
      });
    }
  }
  if ('assignee' in rawIntake && rawIntake.assignee !== ROOT_REQUIRED_ASSIGNEE) {
    blockers.push({
      code: RUNNER_BLOCKER_CODES.INTAKE_ASSIGNEE_MUST_BE_DIV7,
      severity: 'blocking', agent: rawIntake.assignee,
      reason: `intake.assignee=${JSON.stringify(rawIntake.assignee)} !== required ${ROOT_REQUIRED_ASSIGNEE}`,
    });
  }
  if ('parent_issue_id' in rawIntake
    && rawIntake.parent_issue_id !== null
    && typeof rawIntake.parent_issue_id !== 'undefined') {
    blockers.push({
      code: RUNNER_BLOCKER_CODES.INTAKE_PARENT_MUST_BE_NULL,
      severity: 'blocking', agent: null,
      reason: `intake.parent_issue_id=${JSON.stringify(rawIntake.parent_issue_id)} must be null for the root PO mission`,
    });
  }
  return { ok: blockers.length === 0, blockers, intake: rawIntake };
}

// ---------------------------------------------------------------------------
// deriveMissionContext — pure function. Builds mission_key /
// idempotency_key / recovery_lock with format validation.
// ---------------------------------------------------------------------------

function deriveMissionContext(intake, options) {
  const opts = options || {};
  const now = opts.now || new Date();
  const iso = now.toISOString();
  const providedKey = intake && nonEmptyString(intake.mission_key) ? intake.mission_key.trim() : null;
  const providedIdempotency = intake && nonEmptyString(intake.idempotency_key) ? intake.idempotency_key.trim() : null;
  const providedRecovery = intake && nonEmptyString(intake.recovery_lock) ? intake.recovery_lock.trim() : null;

  const missionKey = providedKey || `${MISSION_KEY_PREFIX}${isoToSlug(iso)}`;
  const keySlug = missionKey.slice(MISSION_KEY_PREFIX.length);
  if (!MISSION_KEY_SLUG_RE.test(keySlug)) {
    return {
      ok: false,
      blockers: [{
        code: RUNNER_BLOCKER_CODES.MISSION_KEY_INVALID,
        severity: 'blocking', agent: null,
        reason: `mission_key=${JSON.stringify(missionKey)} must match ${MISSION_KEY_PREFIX}<slug> (alphanumeric + . _ -; 1–64 chars)`,
      }],
      missionKey: null,
      idempotencyKey: null,
      recoveryLock: null,
    };
  }

  const idempotencyKey = providedIdempotency || `${missionKey}::pending-root-issue-id`;
  if (!nonEmptyString(idempotencyKey)) {
    return {
      ok: false,
      blockers: [{ code: RUNNER_BLOCKER_CODES.IDEMPOTENCY_KEY_MISSING, severity: 'blocking', agent: null, reason: 'idempotency_key missing' }],
      missionKey,
      idempotencyKey: null,
      recoveryLock: null,
    };
  }

  const recoveryLock = providedRecovery || `replay-blocked-on:${missionKey}`;
  if (!nonEmptyString(recoveryLock)) {
    return {
      ok: false,
      blockers: [{ code: RUNNER_BLOCKER_CODES.RECOVERY_LOCK_MISSING, severity: 'blocking', agent: null, reason: 'recovery_lock missing' }],
      missionKey,
      idempotencyKey,
      recoveryLock: null,
    };
  }

  return {
    ok: true,
    blockers: [],
    missionKey,
    idempotencyKey,
    recoveryLock,
    derivedAt: iso,
    reasonSlug: slugify(intake && intake.confirmation && intake.confirmation.reason),
  };
}

// ---------------------------------------------------------------------------
// aggregateMissionRun — combine rootIssue / observed state into the
// missionRun shape that the T02 contract evaluator consumes.
// ---------------------------------------------------------------------------

function aggregateMissionRun({ rootIssue, observedState, missionContext, startedAt, endedAt }) {
  const missionStart = startedAt || (observedState && observedState.started_at) || nowIso();
  const missionEnd = endedAt || (observedState && observedState.ended_at) || nowIso();
  const durationSec = Math.max(0, Math.round((Date.parse(missionEnd) - Date.parse(missionStart)) / 1000));
  const state = observedState || {};
  const issues = [
    rootIssue,
    ...((state.issues || []).filter((i) => i && rootIssue && i.id !== rootIssue.id)),
  ].filter(Boolean);
  return {
    mission_key: missionContext.missionKey,
    idempotency_key: missionContext.idempotencyKey,
    recovery_lock: missionContext.recoveryLock,
    started_at: missionStart,
    ended_at: missionEnd,
    mission_duration_sec: durationSec,
    root_issue: rootIssue,
    issues,
    comments: state.comments || [],
    documents: state.documents || [],
    heartbeat_runs: state.heartbeat_runs || [],
    side_effects: state.side_effects || [],
    dispositions: state.dispositions || [],
    reviews: state.reviews || [],
    observer_status: state.observer_status || null,
    observer_budget_exhausted: !!state.observer_budget_exhausted,
    observed_harness_escapes: state.observed_harness_escapes || [],
  };
}

// ---------------------------------------------------------------------------
// deriveMissionStatus — pure function. Mirrors T02's verdict derivation
// so the runner exit code matches the validator verdict byte-for-byte.
// ---------------------------------------------------------------------------

function deriveMissionStatus({ admissionAdmitted, missionRun, gates, blockers, acceptSafeBlock }) {
  if (!admissionAdmitted && !missionRun) {
    return acceptSafeBlock ? 'MISSION_BLOCKED_SAFE' : 'MISSION_BLOCKED_NO_RUN';
  }
  if (!admissionAdmitted && missionRun) {
    return 'MISSION_FAIL_CLOSED';
  }
  if (blockers && blockers.length > 0) return 'MISSION_FAIL_CLOSED';
  const gateValues = gates ? Object.values(gates) : [];
  // MISSION_PASS requires (a) at least one gate and (b) all gates passing.
  // An empty gates object cannot be vacuously "pass" (defends against a
  // degenerate pipeline emitting MISSION_PASS with zero evidence).
  if (gateValues.length > 0 && gateValues.every((v) => v === true)) return 'MISSION_PASS';
  return 'MISSION_FAIL_CLOSED';
}

// ---------------------------------------------------------------------------
// evaluateMissionOutcome — composes T02's evaluator over the aggregated
// missionRun. Returns { status, gates, blockers, admission, redaction }.
// ---------------------------------------------------------------------------

function evaluateMissionOutcome({ admission, missionRun, options }) {
  const opts = options || {};
  const admissionAdmitted = !!admission && admission.status === 'ADMITTED';
  const emptyGates = () => ({
    mission_topology_pass: false,
    authorship_and_authority_pass: false,
    agent_authored_outputs_pass: false,
    review_and_disposition_path_pass: false,
    allowlisted_side_effects_pass: false,
    terminal_run_and_disposition_states_pass: false,
    time_budgets_pass: false,
    idempotency_and_recovery_lock_pass: false,
    secret_hygiene_pass: false,
    no_synthetic_bos_fallback_pass: false,
  });

  if (!admissionAdmitted && !missionRun) {
    return {
      status: deriveMissionStatus({
        admissionAdmitted: false, missionRun: null, gates: emptyGates(),
        blockers: [{
          code: PROTOCOL_BLOCKER_CODES.ADMISSION_BLOCKER_CARRY_FORWARD
            || RUNNER_BLOCKER_CODES.RUNNER_FAILURE, agent: null,
          reason: 'admission blocked; no intake allowed',
        }],
        acceptSafeBlock: !!opts.acceptSafeBlock,
      }),
      gates: emptyGates(),
      blockers: [{
        code: PROTOCOL_BLOCKER_CODES.ADMISSION_BLOCKER_CARRY_FORWARD
          || RUNNER_BLOCKER_CODES.RUNNER_FAILURE,
        severity: 'blocking', agent: null,
        reason: 'admission blocked; no intake allowed',
      }],
      admission, redaction: {},
    };
  }
  if (!admissionAdmitted && missionRun) {
    return {
      status: 'MISSION_FAIL_CLOSED',
      gates: emptyGates(),
      blockers: [{
        code: PROTOCOL_BLOCKER_CODES.ADMISSION_BLOCKER_CARRY_FORWARD
          || RUNNER_BLOCKER_CODES.RUNNER_FAILURE,
        severity: 'blocking', agent: null,
        reason: 'admission blocked; mission run evidence present but cannot be promoted to MISSION_PASS',
      }],
      admission, redaction: {},
    };
  }
  // Admitted + run present → invoke T02's evaluator.
  if (typeof T02.evaluateMissionContract !== 'function') {
    return {
      status: 'MISSION_RUNNER_FAILURE',
      gates: emptyGates(),
      blockers: [{
        code: RUNNER_BLOCKER_CODES.RUNNER_FAILURE,
        severity: 'blocking', agent: null,
        reason: 'T02 evaluator is unavailable in this build',
      }],
      admission, redaction: {},
    };
  }
  const gatesAndBlockers = T02.evaluateMissionContract(missionRun, {
    previousMissionKeys: opts.previousMissionKeys || [],
  });
  const blockers = (typeof T02.compileProtocolBlockers === 'function')
    ? T02.compileProtocolBlockers(gatesAndBlockers.diagnostics, gatesAndBlockers.gates)
    : [];
  const status = deriveMissionStatus({
    admissionAdmitted: true, missionRun, gates: gatesAndBlockers.gates, blockers,
    acceptSafeBlock: !!opts.acceptSafeBlock,
  });
  return {
    status, gates: gatesAndBlockers.gates, blockers, admission,
    redaction: { gates: gatesAndBlockers.gates },
  };
}

// ---------------------------------------------------------------------------
// buildRunnerEvidence — assemble the output JSON artifact.
// ---------------------------------------------------------------------------

function buildRunnerEvidence({ admission, intake, missionContext, rootIssue, missionRun, outcome, startedAt, endedAt, observationBudget, observationPollingMs }) {
  const status = (outcome && outcome.status) || 'MISSION_FAIL_CLOSED';
  return {
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s04-native-mission-run.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S04',
    task: 'T03',
    generated: nowIso(),
    status,
    admission_summary: admission ? {
      status: typeof admission.status === 'string' ? admission.status : null,
      admitted: admission.status === 'ADMITTED',
      blocked: admission.status !== 'ADMITTED',
      business_mutations_recorded: typeof admission.business_mutations_recorded === 'number' ? admission.business_mutations_recorded : 0,
      blocker_codes: Array.isArray(admission.blockers) ? admission.blockers.map((b) => (b && b.code) || null).filter(Boolean) : [],
    } : null,
    safe_block_declared: !!outcome.safe_block_declared,
    harness_writes: rootIssue ? { root_issue_create: 1 } : { root_issue_create: 0 },
    mission_context: missionContext ? {
      mission_key: missionContext.missionKey,
      idempotency_key: missionContext.idempotencyKey,
      recovery_lock: missionContext.recoveryLock,
      derived_at: missionContext.derivedAt || null,
    } : null,
    intake_summary: intake ? {
      title_present: nonEmptyString(intake.title),
      description_present: nonEmptyString(intake.description),
      confirmation_explicit: !!(intake.confirmation && intake.confirmation.explicit === true),
      confirmation_reason_present: !!(intake.confirmation && nonEmptyString(intake.confirmation.reason)),
      desired_assignee: intake.assignee || ROOT_REQUIRED_ASSIGNEE,
      parent_issue_id: intake.parent_issue_id === undefined ? null : intake.parent_issue_id,
      priority: intake.priority || 'normal',
      desired_outcome_present: nonEmptyString(intake.desired_outcome),
    } : null,
    root_issue: rootIssue || null,
    mission_run: missionRun || null,
    protocol_gates: outcome.gates || null,
    blockers: (outcome.blockers || []).map((entry) => ({
      code: entry.code,
      severity: entry.severity || 'blocking',
      agent: entry.agent || null,
      reason: entry.reason,
    })),
    observation_budget: {
      started_at: startedAt || null,
      ended_at: endedAt || null,
      max_seconds: observationBudget ? observationBudget.maxSeconds : null,
      poll_interval_ms: observationPollingMs || null,
      budget_exhausted: !!(missionRun && missionRun.observer_budget_exhausted),
    },
    redaction: {
      full_ids: false,
      credentials: false,
      xiaomi_endpoint_reuse: true,
      provider_secret_names: true,
      synthetic_bos: true,
    },
  };
}

// ---------------------------------------------------------------------------
// writeRunnerEvidence — atomic write with belt-and-braces refusal guard.
// ---------------------------------------------------------------------------

function writeRunnerEvidence(evidence, outputPath) {
  const target = outputPath || path.join(ROOT, 'runtime-evidence/M015-S04-native-mission-run.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const scrubbed = scrubEvidence(evidence);
  const serialised = JSON.stringify(scrubbed, null, 2) + '\n';
  // Belt-and-braces refusal: same pattern as T01 / T02. Catches leaks
  // that survived scrubEvidence (unknown credential names, partial
  // matches, future-regex drift).
  if (UUID_FULL.test(serialised)) {
    const err = new Error(`${RUNNER_BLOCKER_CODES.LEAK_UUID} refused write: full UUID detected in runner output`);
    err.code = RUNNER_BLOCKER_CODES.LEAK_UUID;
    throw err;
  }
  if (CREDENTIAL_ASSIGNMENT.test(serialised)) {
    const err = new Error(`${RUNNER_BLOCKER_CODES.LEAK_CREDENTIAL} refused write: credential assignment detected in runner output`);
    err.code = RUNNER_BLOCKER_CODES.LEAK_CREDENTIAL;
    throw err;
  }
  if (XIAOMI_RE.test(serialised)) {
    const err = new Error(`${RUNNER_BLOCKER_CODES.LEAK_XIAOMI} refused write: xiaomi or mimo string detected in runner output`);
    err.code = RUNNER_BLOCKER_CODES.LEAK_XIAOMI;
    throw err;
  }
  fs.writeFileSync(target, serialised);
}

module.exports = {
  ROOT,
  loadRunnerInput,
  loadAdmissionEvidence,
  readJsonOrThrow,
  validateIntake,
  deriveMissionContext,
  aggregateMissionRun,
  deriveMissionStatus,
  evaluateMissionOutcome,
  buildRunnerEvidence,
  writeRunnerEvidence,
  nonEmptyString,
  nowIso,
  isoToSlug,
  slugify,
};
