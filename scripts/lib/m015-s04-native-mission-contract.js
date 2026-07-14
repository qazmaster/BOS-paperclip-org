#!/usr/bin/env node
'use strict';

/**
 * scripts/lib/m015-s04-native-mission-contract.js
 *
 * M015-4o8lfw / S04 / T02 — Native seven-division mission contract evaluator.
 *
 * Pure-function evaluator over the mission run evidence JSON. Reads the
 * static protocol structure from ./m015-s04-native-mission-data.js and
 * returns:
 *
 *   evaluateMissionContract(missionRun, options)
 *     -> { gate_pass, gates, diagnostics }
 *
 *   compileProtocolBlockers(diagnostics, gates)
 *     -> [ { code, severity, agent, reason } ]
 *
 *   buildProtocolEvidence({ admission, missionRun, gates, blockers,
 *                           diagnostics, paths, options, status })
 *     -> { ... }
 *
 *   findRedactionLeaks(value, jsonPath, hits)
 *     -> hits[]
 *
 *   findProviderSecretNameHits(value, jsonPath, hits)
 *     -> hits[]
 *
 *   deriveProtocolStatus(gates, blockers, options)
 *     -> 'MISSION_PASS' | 'MISSION_FAIL_CLOSED' | 'MISSION_BLOCKED_SAFE'
 *
 * The harness and validator (validate_m015_s04_native_mission.js) share
 * the same evaluator so negative fixtures drive all three T02..T05
 * paths through one source of truth.
 *
 * 10 protocol gates: MG1 MISSION_TOPOLOGY, MG2 AUTHORSHIP_AND_AUTHORITY,
 * MG3 AGENT_AUTHORED_OUTPUTS, MG4 REVIEW_AND_DISPOSITION_PATH,
 * MG5 ALLOWLISTED_SIDE_EFFECTS, MG6 TERMINAL_RUN_AND_DISPOSITION_STATES,
 * MG7 TIME_BUDGETS, MG8 IDEMPOTENCY_AND_RECOVERY_LOCK, MG9 SECRET_HYGIENE,
 * MG10 NO_SYNTHETIC_BOS_FALLBACK.
 */

const path = require('path');
const {
  redactMessageTail,
  scrubEvidence,
  CANONICAL_DIVISION_NAMES,
  XIAOMI_RE,
  CREDENTIAL_ASSIGNMENT,
  UUID_FULL,
} = require('../probe_m015_seven_agent_environment');
const data = require('./m015-s04-native-mission-data');

const {
  MISSION_TOPOLOGY,
  DIVISION_OUTPUT_REQUIREMENTS,
  REVIEW_PATH,
  ALLOWLISTED_SIDE_EFFECTS,
  TERMINAL_STATES,
  TIME_BUDGETS,
  IDEMPOTENCY_AND_RECOVERY,
  PROVIDER_SECRET_NAMES,
  SECRET_HYGIENE,
  PROTOCOL_GATE_LABELS,
  BLOCKER_CODES,
  MISSION_GATE_IDS,
} = data;

const ROOT = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Small helpers.
// ---------------------------------------------------------------------------

function countByKind(sideEffects, kind) {
  if (!Array.isArray(sideEffects)) return 0;
  return sideEffects.filter((entry) => entry && entry.kind === kind).length;
}

function findUnauthorizedHarnessWrites(sideEffects) {
  if (!Array.isArray(sideEffects)) return [];
  return sideEffects.filter((entry) => {
    if (!entry || entry.actor !== 'harness') return false;
    if (entry.kind === 'issue_create' && entry.assignee === 'Div7.MissionControl') return false;
    return true;
  });
}

function findRedactionLeaks(value, jsonPath, hits) {
  if (!hits) hits = [];
  if (value == null) return hits;
  if (typeof value === 'string') {
    if (UUID_FULL.test(value)) hits.push({ path: jsonPath || '$', kind: 'uuid', tail: redactMessageTail(value, 80) });
    if (CREDENTIAL_ASSIGNMENT.test(value)) hits.push({ path: jsonPath || '$', kind: 'credential', tail: redactMessageTail(value, 80) });
    if (XIAOMI_RE.test(value)) hits.push({ path: jsonPath || '$', kind: 'xiaomi', tail: redactMessageTail(value, 80) });
    if (SECRET_HYGIENE.synthetic_bos_tag.test(value)) hits.push({ path: jsonPath || '$', kind: 'synthetic_bos', tail: redactMessageTail(value, 80) });
    return hits;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      findRedactionLeaks(value[i], jsonPath ? `${jsonPath}[${i}]` : `[${i}]`, hits);
    }
    return hits;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      findRedactionLeaks(v, jsonPath ? `${jsonPath}.${k}` : k, hits);
    }
  }
  return hits;
}

function findProviderSecretNameHits(value, jsonPath, hits) {
  if (!hits) hits = [];
  if (value == null) return hits;
  if (typeof value === 'string') {
    for (const name of PROVIDER_SECRET_NAMES) {
      const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(value)) hits.push({ path: jsonPath || '$', name, tail: redactMessageTail(value, 80) });
    }
    return hits;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      findProviderSecretNameHits(value[i], jsonPath ? `${jsonPath}[${i}]` : `[${i}]`, hits);
    }
    return hits;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      findProviderSecretNameHits(v, jsonPath ? `${jsonPath}.${k}` : k, hits);
    }
  }
  return hits;
}

function safeNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

// ---------------------------------------------------------------------------
// evaluateMissionContract — pure function over the mission run evidence.
// ---------------------------------------------------------------------------

function evaluateMissionContract(missionRun, options) {
  const opts = options || {};
  const run = missionRun && typeof missionRun === 'object' ? missionRun : null;
  const issues = run && Array.isArray(run.issues) ? run.issues : [];
  const comments = run && Array.isArray(run.comments) ? run.comments : [];
  const documents = run && Array.isArray(run.documents) ? run.documents : [];
  const heartbeatRuns = run && Array.isArray(run.heartbeat_runs) ? run.heartbeat_runs : [];
  const sideEffects = run && Array.isArray(run.side_effects) ? run.side_effects : [];
  const dispositions = run && Array.isArray(run.dispositions) ? run.dispositions : [];
  const reviews = run && Array.isArray(run.reviews) ? run.reviews : [];

  const rootIssue = issues.find((i) => i && i.role === 'PO_ROOT_MISSION') || null;
  const rootIssueAssignee = rootIssue && rootIssue.assignee;
  const rootIssuesCount = issues.filter((i) => i && i.role === 'PO_ROOT_MISSION').length;

  // MG1: MISSION_TOPOLOGY
  const mg1_rootAssigneeOk = !!rootIssue
    && rootIssueAssignee === MISSION_TOPOLOGY.root.required_assignee;
  const mg1_rootCountOk = rootIssuesCount === 1;

  const divChildren = {};
  for (const name of CANONICAL_DIVISION_NAMES) divChildren[name] = [];
  for (const issue of issues) {
    if (!issue || !issue.assignee) continue;
    if (divChildren[issue.assignee]) divChildren[issue.assignee].push(issue);
  }
  const mg1_eachDivisionHasOneChild = CANONICAL_DIVISION_NAMES.every(
    (name) => divChildren[name].length >= 1,
  );

  // MG2: AUTHORSHIP_AND_AUTHORITY
  // The Div1 child must be authored by Div7.MissionControl. We check every
  // Div1 child regardless of parent (it must have a parent — the root
  // issue) and require all of them to be Div7-authored. The harness is
  // the only author allowed for the root intake; everything below Div1
  // must be native-authored.
  const div1Children = divChildren['Div1.HCO'];
  const mg2_div1AuthoredByDiv7 = div1Children.length > 0
    && div1Children.every((c) => c.created_by === 'Div7.MissionControl');

  // Div2..Div6 children must be authored by Div1.
  const operating = ['Div2.MasterPlanner', 'Div3.Treasury', 'Div4.Production', 'Div5.QualificationsLibraryLearning', 'Div6.External'];
  const mg2_operatingAuthoredByDiv1 = operating.every((name) => {
    const kids = divChildren[name];
    return kids.length > 0 && kids.every((c) => c.created_by === 'Div1.HCO');
  });

  // Harness may only write the root issue assigned to Div7.
  const mg2_harnessUnauthorized = findUnauthorizedHarnessWrites(sideEffects);
  const mg2_harnessPass = mg2_harnessUnauthorized.length === 0;

  const mg2_authorshipAndAuthorityPass = mg2_harnessPass && mg2_div1AuthoredByDiv7 && mg2_operatingAuthoredByDiv1;

  // MG3: AGENT_AUTHORED_OUTPUTS
  const missingOutputs = [];
  const unauthorizedDocAuthors = [];
  for (const name of CANONICAL_DIVISION_NAMES) {
    const req = DIVISION_OUTPUT_REQUIREMENTS[name];
    if (!req) continue;
    if (req.comment_required) {
      const c = comments.find((cm) => cm && cm.author_division === name && cm.kind === 'handoff_or_progress');
      if (!c) missingOutputs.push({ name, kind: 'comment' });
    }
    if (req.document_required) {
      const d = documents.find((doc) => doc && doc.author_division === name);
      if (!d) missingOutputs.push({ name, kind: 'document' });
    }
  }
  for (const doc of documents) {
    if (!doc || !doc.author_division) continue;
    if (doc.author_division !== 'Div2.MasterPlanner' && doc.author_division !== 'Div4.Production') {
      unauthorizedDocAuthors.push(doc.author_division);
    }
  }
  const mg3_outputsPass = missingOutputs.length === 0 && unauthorizedDocAuthors.length === 0;

  // MG4: REVIEW_AND_DISPOSITION_PATH
  const div5Review = reviews.find((r) => r && r.reviewer_division === 'Div5.QualificationsLibraryLearning'
    && REVIEW_PATH.required_review_states.includes(r.outcome));
  const mg4_div5ReviewPresent = !!div5Review;
  const mg4_div5TargetCorrect = !!div5Review && div5Review.target_division === REVIEW_PATH.review_target;

  const mg4_div1Routing = dispositions.find((d) => d && d.division === 'Div1.HCO' && d.state === REVIEW_PATH.disposition_states.Div1);
  const mg4_div1RoutingPresent = !!mg4_div1Routing;

  const mg4_div7Final = dispositions.find((d) => d && d.division === 'Div7.MissionControl' && d.state === REVIEW_PATH.disposition_states.Div7);
  const mg4_div7FinalPresent = !!mg4_div7Final;

  const mg4_rootFinal = dispositions.find((d) => d && d.issue_id && rootIssue && d.issue_id === rootIssue.id && d.state === 'finalised');
  const mg4_rootFinalPresent = !!mg4_rootFinal;

  const mg4_reviewAndDispositionPass = mg4_div5ReviewPresent
    && mg4_div5TargetCorrect
    && mg4_div1RoutingPresent
    && mg4_div7FinalPresent
    && mg4_rootFinalPresent;

  // MG5: ALLOWLISTED_SIDE_EFFECTS — bounded counts on each allowlisted kind.
  const counts = {
    issue_create: countByKind(sideEffects, 'issue_create'),
    issue_create_or_assign: countByKind(sideEffects, 'issue_create_or_assign'),
    comment_create: countByKind(sideEffects, 'comment_create'),
    document_create: countByKind(sideEffects, 'document_create'),
    issue_status_update: countByKind(sideEffects, 'issue_status_update'),
    heartbeat_run_invoke: countByKind(sideEffects, 'heartbeat_run_invoke'),
  };

  const allowlistViolations = [];
  if (counts.issue_create > ALLOWLISTED_SIDE_EFFECTS.root_issue.max_count) {
    allowlistViolations.push({ kind: 'issue_create', reason: `count ${counts.issue_create} > max ${ALLOWLISTED_SIDE_EFFECTS.root_issue.max_count}` });
  }
  if (counts.issue_create_or_assign > ALLOWLISTED_SIDE_EFFECTS.div1_to_operating.max_count + 1) {
    // 1 for Div7→Div1 + 5 for Div1→Div2..Div6 = 6 total
    allowlistViolations.push({ kind: 'issue_create_or_assign', reason: `count ${counts.issue_create_or_assign} > max 6` });
  }
  if (counts.document_create > ALLOWLISTED_SIDE_EFFECTS.agent_authored_documents.max_count) {
    allowlistViolations.push({ kind: 'document_create', reason: `count ${counts.document_create} > max 2` });
  }
  if (counts.issue_status_update > CANONICAL_DIVISION_NAMES.length) {
    allowlistViolations.push({ kind: 'issue_status_update', reason: `count ${counts.issue_status_update} > max 7` });
  }
  if (counts.heartbeat_run_invoke !== ALLOWLISTED_SIDE_EFFECTS.heartbeat_runs.expected_run_count) {
    allowlistViolations.push({ kind: 'heartbeat_run_invoke', reason: `count ${counts.heartbeat_run_invoke} != expected 7` });
  }
  const allowedKinds = new Set([
    'issue_create',
    'issue_create_or_assign',
    'comment_create',
    'document_create',
    'issue_status_update',
    'heartbeat_run_invoke',
  ]);
  const offAllowlistKinds = [];
  for (const entry of sideEffects) {
    if (!entry || typeof entry.kind !== 'string') continue;
    if (!allowedKinds.has(entry.kind)) offAllowlistKinds.push(entry.kind);
  }
  if (offAllowlistKinds.length > 0) {
    allowlistViolations.push({ kind: 'off_allowlist', reason: `unrecognised kinds: ${[...new Set(offAllowlistKinds)].join(',')}` });
  }
  const mg5_allowlistedSideEffectsPass = allowlistViolations.length === 0;

  // MG6: TERMINAL_RUN_AND_DISPOSITION_STATES
  const expectedRunCount = IDEMPOTENCY_AND_RECOVERY.expected_runs_per_mission;
  const observedRunCount = heartbeatRuns.length;
  const mg6_runCountOk = observedRunCount === expectedRunCount;

  const divisionRunState = {};
  const divisionRunMissing = [];
  const divisionRunTerminalWrong = [];
  for (const name of CANONICAL_DIVISION_NAMES) {
    const runs = heartbeatRuns.filter((r) => r && r.division === name);
    if (runs.length === 0) {
      divisionRunMissing.push(name);
      divisionRunState[name] = 'missing';
      continue;
    }
    const succeeded = runs.filter((r) => r.terminal_status === TERMINAL_STATES.run_success_state).length;
    if (succeeded !== runs.length) {
      divisionRunTerminalWrong.push(name);
      divisionRunState[name] = 'mixed_or_failed';
    } else {
      divisionRunState[name] = 'succeeded';
    }
  }
  const mg6_allRunsTerminalSucceeded = divisionRunMissing.length === 0
    && divisionRunTerminalWrong.length === 0;

  const divisionsWithDisposition = CANONICAL_DIVISION_NAMES.filter((name) =>
    dispositions.some((d) => d && d.division === name && typeof d.state === 'string'),
  );
  const mg6_divisionsWithDisposition = divisionsWithDisposition.length === CANONICAL_DIVISION_NAMES.length;

  const mg6_terminalRunAndDispositionStatesPass = mg6_runCountOk
    && mg6_allRunsTerminalSucceeded
    && mg6_divisionsWithDisposition;

  // MG7: TIME_BUDGETS
  const perRunOver = [];
  for (const r of heartbeatRuns) {
    if (!r) continue;
    const dur = safeNumber(r.duration_sec, null);
    if (dur != null && dur > TIME_BUDGETS.per_run_timeout_sec) {
      perRunOver.push(r.division || 'unknown');
    }
  }
  const missionDuration = safeNumber(run && run.mission_duration_sec, null);
  const missionOverTotal = missionDuration != null && missionDuration > TIME_BUDGETS.mission_total_budget_sec;
  const mg7_timeBudgetsPass = perRunOver.length === 0 && !missionOverTotal;

  // MG8: IDEMPOTENCY_AND_RECOVERY_LOCK
  const missionKey = run && typeof run.mission_key === 'string' ? run.mission_key : null;
  const idempotencyKey = run && typeof run.idempotency_key === 'string' ? run.idempotency_key : null;
  const recoveryLock = run && typeof run.recovery_lock === 'string' ? run.recovery_lock : null;
  const mg8_keysPresent = !!missionKey && !!idempotencyKey && !!recoveryLock;
  const prevKeys = Array.isArray(opts.previousMissionKeys) ? opts.previousMissionKeys : [];
  const mg8_duplicateKey = !!missionKey && prevKeys.includes(missionKey);
  const mg8_idempotencyAndRecoveryPass = mg8_keysPresent && !mg8_duplicateKey;

  // MG9: SECRET_HYGIENE
  const leakHits = findRedactionLeaks(run);
  const secretHits = findProviderSecretNameHits(run);
  const allHits = [...leakHits, ...secretHits];
  const mg9_secretHygienePass = allHits.length === 0;

  // MG10: NO_SYNTHETIC_BOS_FALLBACK
  const syntheticBosHits = leakHits.filter((h) => h.kind === 'synthetic_bos');
  const mg10_noSyntheticBosPass = syntheticBosHits.length === 0;

  const gates = {
    mission_topology_pass: mg1_rootAssigneeOk && mg1_rootCountOk && mg1_eachDivisionHasOneChild,
    authorship_and_authority_pass: mg2_authorshipAndAuthorityPass,
    agent_authored_outputs_pass: mg3_outputsPass,
    review_and_disposition_path_pass: mg4_reviewAndDispositionPass,
    allowlisted_side_effects_pass: mg5_allowlistedSideEffectsPass,
    terminal_run_and_disposition_states_pass: mg6_terminalRunAndDispositionStatesPass,
    time_budgets_pass: mg7_timeBudgetsPass,
    idempotency_and_recovery_lock_pass: mg8_idempotencyAndRecoveryPass,
    secret_hygiene_pass: mg9_secretHygienePass,
    no_synthetic_bos_fallback_pass: mg10_noSyntheticBosPass,
  };

  const diagnostics = {
    mission_topology: {
      root_issue_id: rootIssue && rootIssue.id || null,
      root_assignee: rootIssueAssignee || null,
      root_count: rootIssuesCount,
      divisions_with_child_count: CANONICAL_DIVISION_NAMES.map((name) => ({
        name,
        child_count: divChildren[name].length,
      })),
    },
    authorship_and_authority: {
      harness_unauthorized_writes: mg2_harnessUnauthorized.length,
      div1_child_authored_by_div7: mg2_div1AuthoredByDiv7,
      operating_authored_by_div1: mg2_operatingAuthoredByDiv1,
    },
    agent_authored_outputs: {
      missing_outputs: missingOutputs,
      unauthorized_doc_authors: [...new Set(unauthorizedDocAuthors)],
      comment_count: comments.length,
      document_count: documents.length,
    },
    review_and_disposition_path: {
      div5_review_present: mg4_div5ReviewPresent,
      div5_target_correct: mg4_div5TargetCorrect,
      div1_routing_disposition_present: mg4_div1RoutingPresent,
      div7_final_disposition_present: mg4_div7FinalPresent,
      root_final_disposition_present: mg4_rootFinalPresent,
    },
    allowlisted_side_effects: { counts, violations: allowlistViolations },
    terminal_run_and_disposition_states: {
      observed_run_count: observedRunCount,
      expected_run_count: expectedRunCount,
      division_run_state: divisionRunState,
      divisions_missing_run: divisionRunMissing,
      divisions_with_wrong_terminal: divisionRunTerminalWrong,
      divisions_with_disposition: divisionsWithDisposition,
    },
    time_budgets: {
      per_run_timeout_sec: TIME_BUDGETS.per_run_timeout_sec,
      mission_total_budget_sec: TIME_BUDGETS.mission_total_budget_sec,
      per_run_over: perRunOver,
      mission_duration_sec: missionDuration,
      mission_over_total: missionOverTotal,
    },
    idempotency_and_recovery_lock: {
      mission_key: missionKey,
      idempotency_key: idempotencyKey,
      recovery_lock: recoveryLock,
      duplicate_mission_key: mg8_duplicateKey,
    },
    secret_hygiene: {
      leak_count: allHits.length,
      leak_paths: allHits.map((h) => `${h.path || h.name || '$'}(${h.kind || h.name})`),
    },
  };

  return {
    gate_pass: Object.values(gates).every((v) => v === true),
    gates,
    diagnostics,
  };
}

// ---------------------------------------------------------------------------
// compileProtocolBlockers — convert diagnostics into M15-S04-PROTOCOL-* codes.
// ---------------------------------------------------------------------------

function compileProtocolBlockers(diagnostics, gates) {
  const blockers = [];

  if (!gates.mission_topology_pass) {
    const d = diagnostics.mission_topology;
    if (!d.root_assignee) {
      blockers.push({ code: BLOCKER_CODES.ROOT_ASSIGNEE_WRONG, agent: null, reason: 'no root PO mission present in issues' });
    } else if (d.root_assignee !== MISSION_TOPOLOGY.root.required_assignee) {
      blockers.push({ code: BLOCKER_CODES.ROOT_ASSIGNEE_WRONG, agent: d.root_assignee, reason: `root assignee ${d.root_assignee} != required Div7.MissionControl` });
    }
    if (d.root_count !== 1) {
      blockers.push({ code: BLOCKER_CODES.ROOT_COUNT_OFF, agent: null, reason: `root PO mission count=${d.root_count} != required 1` });
    }
    const missingDivisions = d.divisions_with_child_count
      .filter((entry) => entry.child_count < 1)
      .map((entry) => entry.name);
    if (missingDivisions.length > 0) {
      blockers.push({
        code: BLOCKER_CODES.SIDE_EFFECT_NOT_ALLOWLISTED('missing-child'),
        agent: missingDivisions.join(','),
        reason: `no child issue for divisions: ${missingDivisions.join(', ')}`,
      });
    }
  }

  if (!gates.authorship_and_authority_pass) {
    const d = diagnostics.authorship_and_authority;
    if (d.harness_unauthorized_writes > 0) {
      blockers.push({ code: BLOCKER_CODES.HARNESS_WROTE_OPERATING, agent: 'harness', reason: `harness emitted ${d.harness_unauthorized_writes} unauthorised side effects outside the root PO intake` });
    }
    if (!d.div1_child_authored_by_div7) {
      blockers.push({ code: BLOCKER_CODES.DIV1_CHILD_AUTHORED_BY_WRONG_AGENT, agent: 'Div1.HCO', reason: 'Div1 child issue(s) not authored by Div7.MissionControl' });
    }
    if (!d.operating_authored_by_div1) {
      blockers.push({ code: BLOCKER_CODES.OPERATING_CHILD_AUTHORED_BY_WRONG_AGENT, agent: 'Div1.HCO', reason: 'one or more Div2..Div6 child issues not authored by Div1.HCO' });
    }
  }

  if (!gates.agent_authored_outputs_pass) {
    const d = diagnostics.agent_authored_outputs;
    for (const miss of d.missing_outputs) {
      blockers.push({ code: BLOCKER_CODES.DIVISION_MISSING_REQUIRED_OUTPUT(miss.name), agent: miss.name, reason: `${miss.name} missing required ${miss.kind}` });
    }
    for (const name of d.unauthorized_doc_authors) {
      blockers.push({ code: BLOCKER_CODES.UNAUTHORISED_DOCUMENT_AUTHOR(name), agent: name, reason: `${name} authored a document; only Div2.MasterPlanner and Div4.Production are allowed` });
    }
  }

  if (!gates.review_and_disposition_path_pass) {
    const d = diagnostics.review_and_disposition_path;
    if (!d.div5_review_present) blockers.push({ code: BLOCKER_CODES.DIV5_REVIEW_MISSING, agent: 'Div5.QualificationsLibraryLearning', reason: 'Div5 review record missing' });
    if (!d.div5_target_correct) blockers.push({ code: BLOCKER_CODES.DIV5_REVIEW_TARGET_WRONG, agent: 'Div5.QualificationsLibraryLearning', reason: 'Div5 review target != Div4.Production' });
    if (!d.div1_routing_disposition_present) blockers.push({ code: BLOCKER_CODES.DIV1_ROUTING_DISPOSITION_MISSING, agent: 'Div1.HCO', reason: 'Div1 routing disposition missing' });
    if (!d.div7_final_disposition_present) blockers.push({ code: BLOCKER_CODES.DIV7_FINAL_DISPOSITION_MISSING, agent: 'Div7.MissionControl', reason: 'Div7 final disposition missing' });
    if (!d.root_final_disposition_present) blockers.push({ code: BLOCKER_CODES.ROOT_FINAL_DISPOSITION_MISSING, agent: 'Div7.MissionControl', reason: 'root mission final disposition missing' });
  }

  if (!gates.allowlisted_side_effects_pass) {
    const d = diagnostics.allowlisted_side_effects;
    for (const v of d.violations) {
      blockers.push({ code: BLOCKER_CODES.SIDE_EFFECT_NOT_ALLOWLISTED(v.kind), agent: null, reason: v.reason });
    }
  }

  if (!gates.terminal_run_and_disposition_states_pass) {
    const d = diagnostics.terminal_run_and_disposition_states;
    if (d.observed_run_count !== d.expected_run_count) {
      blockers.push({
        code: BLOCKER_CODES.RUN_COUNT_OFF,
        agent: null,
        reason: `observed ${d.observed_run_count} heartbeat runs != expected ${d.expected_run_count} (S03 anomaly 8-vs-7 explicitly blocks here)`,
      });
    }
    for (const name of d.divisions_missing_run) {
      blockers.push({ code: BLOCKER_CODES.RUN_NOT_FOUND(name), agent: name, reason: `no heartbeat run for ${name}` });
    }
    for (const name of d.divisions_with_wrong_terminal) {
      blockers.push({ code: BLOCKER_CODES.RUN_TERMINAL_STATE_WRONG(name), agent: name, reason: `${name} has a non-succeeded terminal run state` });
    }
    if (d.divisions_with_disposition.length !== CANONICAL_DIVISION_NAMES.length) {
      const missing = CANONICAL_DIVISION_NAMES.filter((name) => !d.divisions_with_disposition.includes(name));
      blockers.push({
        code: BLOCKER_CODES.SIDE_EFFECT_NOT_ALLOWLISTED('missing-disposition'),
        agent: missing.join(','),
        reason: `missing disposition for: ${missing.join(', ')}`,
      });
    }
  }

  if (!gates.time_budgets_pass) {
    const d = diagnostics.time_budgets;
    for (const name of d.per_run_over) {
      blockers.push({ code: BLOCKER_CODES.RUN_OVER_PER_RUN_TIMEOUT(name), agent: name, reason: `${name} run exceeded ${d.per_run_timeout_sec}s per-run budget` });
    }
    if (d.mission_over_total) {
      blockers.push({ code: BLOCKER_CODES.MISSION_OVER_TOTAL_BUDGET, agent: null, reason: `mission duration ${d.mission_duration_sec}s exceeded ${d.mission_total_budget_sec}s` });
    }
  }

  if (!gates.idempotency_and_recovery_lock_pass) {
    const d = diagnostics.idempotency_and_recovery_lock;
    if (!d.mission_key) blockers.push({ code: BLOCKER_CODES.MISSION_KEY_MISSING, agent: null, reason: 'mission_key missing on run evidence' });
    if (!d.idempotency_key) blockers.push({ code: BLOCKER_CODES.IDEMPOTENCY_KEY_MISSING, agent: null, reason: 'idempotency_key missing on run evidence' });
    if (!d.recovery_lock) blockers.push({ code: BLOCKER_CODES.RECOVERY_LOCK_MISSING, agent: null, reason: 'recovery_lock missing on run evidence' });
    if (d.duplicate_mission_key) blockers.push({ code: BLOCKER_CODES.DUPLICATE_MISSION_KEY, agent: null, reason: `duplicate mission_key ${d.mission_key} seen in a prior validation` });
  }

  if (!gates.secret_hygiene_pass) {
    const d = diagnostics.secret_hygiene;
    if (d.leak_paths.some((p) => p.includes('(uuid)'))) blockers.push({ code: BLOCKER_CODES.LEAK_UUID, agent: null, reason: `redaction leak: full UUID found at ${d.leak_paths.filter((p) => p.includes('(uuid)')).join(', ')}` });
    if (d.leak_paths.some((p) => p.includes('(credential)'))) blockers.push({ code: BLOCKER_CODES.LEAK_CREDENTIAL, agent: null, reason: `redaction leak: credential assignment found at ${d.leak_paths.filter((p) => p.includes('(credential)')).join(', ')}` });
    if (d.leak_paths.some((p) => p.includes('(xiaomi)'))) blockers.push({ code: BLOCKER_CODES.LEAK_XIAOMI, agent: null, reason: `redaction leak: xiaomi/mimo vendor reuse found at ${d.leak_paths.filter((p) => p.includes('(xiaomi)')).join(', ')}` });
    if (d.leak_paths.some((p) => ['PAPERCLIP_API_KEY', 'MINIMAX_API_KEY', 'XIAOMI_API_KEY', 'BETTER_AUTH_SECRET', 'POSTGRES_PASSWORD', 'DATABASE_URL', 'OPENAI_API_KEY'].some((n) => p.includes(n)))) {
      blockers.push({ code: BLOCKER_CODES.LEAK_PROVIDER_SECRET, agent: null, reason: `redaction leak: provider secret name found at ${d.leak_paths.join(', ')}` });
    }
  }

  if (!gates.no_synthetic_bos_fallback_pass) {
    blockers.push({ code: BLOCKER_CODES.LEAK_SYNTHETIC_BOS, agent: null, reason: `synthetic bos light tag found in evidence at ${diagnostics.secret_hygiene.leak_paths.filter((p) => p.includes('(synthetic_bos)')).join(', ') || 'unknown'}` });
  }

  return blockers;
}

function deriveProtocolStatus(gates, blockers, options) {
  if (blockers && blockers.length > 0) return 'MISSION_FAIL_CLOSED';
  const gateValues = gates ? Object.values(gates) : [];
  // MISSION_PASS requires (a) at least one gate and (b) all gates passing.
  // An empty gates object cannot be vacuously "pass" — that would let a
  // degenerate pipeline emit MISSION_PASS with zero evidence.
  if (gateValues.length > 0 && gateValues.every((v) => v === true)) return 'MISSION_PASS';
  if (options && options.acceptSafeBlock) return 'MISSION_BLOCKED_SAFE';
  return 'MISSION_FAIL_CLOSED';
}

// ---------------------------------------------------------------------------
// buildProtocolEvidence — JSON-serialisable runtime evidence artifact.
// ---------------------------------------------------------------------------

function buildProtocolEvidence({ admission, missionRun, gates, blockers, diagnostics, paths, options, status }) {
  const admissionSummary = admission && typeof admission === 'object' ? admission : null;
  const safeBlockDeclared = !!(options && options.acceptSafeBlock);
  // Derive `admitted` from BOTH the explicit boolean field AND the status
  // string. T01 admission evidence does not always carry an explicit
  // `admitted` boolean, so the status-derived check is the canonical
  // fallback for S04.
  const admissionStatus = admissionSummary && typeof admissionSummary.status === 'string' ? admissionSummary.status : null;
  const admissionIsBlocked = !admissionSummary
    || admissionSummary.admitted === false
    || (admissionStatus && admissionStatus.startsWith('BLOCKED'));
  // Status resolution order under blocked admission:
  //   1. Caller-overridden `status` argument wins (escape hatch for tests).
  //   2. `admissionIsBlocked && safeBlockDeclared` → MISSION_BLOCKED_SAFE,
  //      regardless of whether the run file is present. The T04 runner
  //      always writes a run artifact under BLOCKED_ON_S03_FAIL_CLOSED
  //      (with `mission_run: null` inside), so this branch is the
  //      canonical current S04 state. The diagnostic admission-blocker
  //      carry-forward is preserved in `blockers` so callers can still
  //      inspect why the mission was not promoted; only the top-level
  //      status honours the explicit operator acceptance.
  //   3. `admissionIsBlocked && !missionRun && !safeBlockDeclared` →
  //      MISSION_BLOCKED_NO_RUN. CI gates without the explicit flag
  //      must fail-closed (the documented T02 verdict for the
  //      "admission blocked + no run" combination).
  //   4. Otherwise defer to `deriveProtocolStatus`, which honours gate
  //      failures and full pass-through blockers.
  const computedStatus = status
    || (admissionIsBlocked && safeBlockDeclared
      ? 'MISSION_BLOCKED_SAFE'
      : admissionIsBlocked && !missionRun
        ? 'MISSION_BLOCKED_NO_RUN'
        : deriveProtocolStatus(gates, blockers, options));

  return {
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s04-native-mission-protocol.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S04',
    task: 'T02',
    generated: new Date().toISOString(),
    status: computedStatus,
    safe_block_declared: safeBlockDeclared,
    admission_summary: admissionSummary
      ? {
          status: admissionStatus,
          admitted: admissionSummary.admitted === true,
          blocked: admissionIsBlocked,
          blocker_codes: Array.isArray(admissionSummary.blockers)
            ? admissionSummary.blockers.map((b) => (b && b.code) || null).filter(Boolean)
            : [],
        }
      : null,
    protocol: {
      topology_required_root_assignee: MISSION_TOPOLOGY.root.required_assignee,
      division_requirements: Object.fromEntries(
        CANONICAL_DIVISION_NAMES.map((name) => [name, {
          comment_required: DIVISION_OUTPUT_REQUIREMENTS[name].comment_required,
          document_required: DIVISION_OUTPUT_REQUIREMENTS[name].document_required,
          review_required: DIVISION_OUTPUT_REQUIREMENTS[name].review_required,
          terminal_disposition_state: DIVISION_OUTPUT_REQUIREMENTS[name].disposition_state,
        }]),
      ),
      review_path: {
        required_reviewer: REVIEW_PATH.required_reviewer,
        review_target: REVIEW_PATH.review_target,
        routing_disposition_owner: REVIEW_PATH.routing_disposition_owner,
        final_disposition_owner: REVIEW_PATH.final_disposition_owner,
      },
      allowlisted_side_effects: {
        root_issue_max: ALLOWLISTED_SIDE_EFFECTS.root_issue.max_count,
        div7_to_div1_max: 1,
        div1_to_operating_max: ALLOWLISTED_SIDE_EFFECTS.div1_to_operating.max_count,
        documents_max: ALLOWLISTED_SIDE_EFFECTS.agent_authored_documents.max_count,
        heartbeat_runs_expected: ALLOWLISTED_SIDE_EFFECTS.heartbeat_runs.expected_run_count,
        heartbeat_runs_max: ALLOWLISTED_SIDE_EFFECTS.heartbeat_runs.max_run_count,
      },
      time_budgets: {
        per_run_timeout_sec: TIME_BUDGETS.per_run_timeout_sec,
        mission_total_budget_sec: TIME_BUDGETS.mission_total_budget_sec,
      },
      idempotency_and_recovery: {
        mission_key_required: true,
        idempotency_key_required: true,
        recovery_lock_required: true,
        expected_runs_per_mission: IDEMPOTENCY_AND_RECOVERY.expected_runs_per_mission,
      },
    },
    gate_labels: PROTOCOL_GATE_LABELS,
    gates,
    diagnostics: diagnostics || null,
    blockers: blockers.map((entry) => ({
      code: entry.code,
      severity: 'blocking',
      agent: entry.agent || null,
      reason: entry.reason,
    })),
    redaction: {
      full_ids: false,
      credentials: false,
      xiaomi_endpoint_reuse: gates.secret_hygiene_pass,
      provider_secret_names: gates.secret_hygiene_pass,
      synthetic_bos: gates.no_synthetic_bos_fallback_pass,
    },
    paths: {
      admission_evidence: paths && paths.admission ? path.relative(ROOT, paths.admission) : null,
      mission_run_evidence: paths && paths.missionRun ? path.relative(ROOT, paths.missionRun) : null,
      output_evidence: paths && paths.output ? path.relative(ROOT, paths.output) : null,
    },
  };
}

module.exports = {
  ROOT,
  CANONICAL_DIVISION_NAMES,
  XIAOMI_RE,
  CREDENTIAL_ASSIGNMENT,
  UUID_FULL,
  // re-exported from data for ergonomic downstream access
  MISSION_TOPOLOGY,
  DIVISION_OUTPUT_REQUIREMENTS,
  REVIEW_PATH,
  ALLOWLISTED_SIDE_EFFECTS,
  TERMINAL_STATES,
  TIME_BUDGETS,
  IDEMPOTENCY_AND_RECOVERY,
  SECRET_HYGIENE,
  PROTOCOL_GATE_LABELS,
  BLOCKER_CODES,
  MISSION_GATE_IDS,
  PROVIDER_SECRET_NAMES,
  evaluateMissionContract,
  compileProtocolBlockers,
  buildProtocolEvidence,
  deriveProtocolStatus,
  findRedactionLeaks,
  findProviderSecretNameHits,
  scrubEvidence,
};
