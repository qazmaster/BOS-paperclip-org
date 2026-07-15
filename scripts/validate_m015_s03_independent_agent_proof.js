#!/usr/bin/env node
'use strict';

/**
 * scripts/validate_m015_s03_independent_agent_proof.js
 *
 * M015-S03 / T03 — fail-closed 7-of-7 independent-agent invokability gate.
 *
 * Reads two bounded runtime-evidence artifacts written by T01 (testEnvironment
 * probe) and T02 (non-business diagnostic heartbeat) and enforces the S03
 * gate as a pure function over their redacted JSON:
 *
 *   - 7 canonical division agents x 7 per-agent conditions = 49 checks.
 *   - 4 global gates:
 *       G1 NAME-DRIFT     : roster contains no extra/missing canonical names
 *       G2 UPSTREAM-STATUS: T01.status === "PASS" AND T02.status === "PASS"
 *       G3 REDACTION      : no UUIDs, credential assignments or xiaomi/mimo
 *                           strings anywhere in the string values of either
 *                           evidence (boolean flag *keys* are intentionally
 *                           excluded — they describe the property, not leak it)
 *       G4 SIDE-EFFECTS   : issues/documents/comments/approvals/agents deltas
 *                           must all be 0; heartbeat_runs_delta must equal 7
 *
 * S05 / T03 strengthens the C7 per-agent condition into a provenance-backed
 * BOS-agreement check (C7′). The new C7′ is accepted only when:
 *   - bosHasAllRequired   : all REQUIRED_BOS_FIELDS are present (legacy C7 part)
 *   - leakFlagsClean      : xiaomi / credential leak flags are clean (legacy C7)
 *   - runIdAgrees         : bos.runId === invoke.run_id_redacted
 *                           (assembled value agrees with the observed run id)
 *   - divisionAgrees      : bos.division === canonical division name
 *                           (the iteration key is the canonical roster)
 *   - roleAgrees          : bos.role === t01.agent_role_observed
 *                           (assembled value agrees with the independently
 *                            read canonical role from T01 evidence)
 *   - statusAgrees        : bos.status === poll.terminal_status
 *                           (assembled value agrees with observed terminal)
 *   - provenancePopulated : bos_provenance.source is a non-empty string AND
 *                           bos_provenance.field_sources is a non-null object
 *
 * The 49/49 invariant is preserved: C7′ REPLACES C7 in the same 7th position
 * (no condition count change). The per-agent output additionally exposes
 * `t02_bos_provenance_agreement_diagnostics` so T05 / S04 can reason about
 * which sub-checks passed or failed.
 *
 * For every failing per-agent condition or global gate the validator emits a
 * single, scoped blocker code (never a generic catch-all) and increments the
 * per-agent failed counter. Exits 0 only when all 49 per-agent checks and all
 * 4 global gates pass simultaneously. Every invocation always writes
 * runtime-evidence/M015-S03-seven-agent-independent-gate.json with the bounded
 * evidence shape consumed by S04.
 *
 * Exports helpers so T04 can drive negative fixtures:
 *   loadEvidence(filePath, label)
 *   evaluatePerAgentConditions(t01Evidence, t02Evidence)
 *   evaluateGlobalGates(t01Evidence, t02Evidence)
 *   compileBlockers(perAgent, gates)
 *   buildGateEvidence({ perAgent, gates, blockers, t01Path, t02Path })
 *   evaluateGate(t01Evidence, t02Evidence, options?)
 *   findRedactionLeaks(value, jsonPath?, hits?)
 *   PER_AGENT_CONDITION_LABELS, GLOBAL_GATE_LABELS, REQUIRED_BOS_FIELDS,
 *   BLOCKER_CODES
 */

const fs = require('fs');
const path = require('path');
const {
  CANONICAL_DIVISION_NAMES,
  BLOCKER_CODES: PROBE_BLOCKER_CODES,
  XIAOMI_RE,
  CREDENTIAL_ASSIGNMENT,
  UUID_FULL,
  redacted,
  redactMessageTail,
  scrubEvidence,
} = require('./probe_m015_seven_agent_environment');

const ROOT = path.resolve(__dirname, '..');
const T01_PATH = path.join(ROOT, 'runtime-evidence/M015-S03-seven-agent-test-environment.json');
const T02_PATH = path.join(ROOT, 'runtime-evidence/M015-S03-seven-agent-diagnostic-runs.json');
const OUTPUT_PATH = path.join(ROOT, 'runtime-evidence/M015-S03-seven-agent-independent-gate.json');

const REQUIRED_BOS_FIELDS = Object.freeze([
  'schemaVersion',
  'runId',
  'division',
  'role',
  'status',
]);

const PER_AGENT_CONDITION_LABELS = Object.freeze({
  canonical_name_present: 'C1  Agent present in both T01+T02 evidence under a canonical division name',
  t01_http_success: 'C2  T01 probe: POST /api/companies/{id}/adapters/hermes_local/test-environment returned HTTP 2xx',
  t01_response_status_pass: 'C3  T01 probe: response_status === "pass" (not warn|fail|unknown)',
  t01_no_xiaomi_endpoint_reuse: 'C4  T01 probe: aggregate xiaomi_endpoint_reuse_detected === false for this agent',
  t02_heartbeat_terminal_succeeded: 'C5  T02 heartbeat: poll reached terminal_status === "succeeded" within 12 attempts',
  t02_wake_count_delta_one: 'C6  T02 heartbeat: wake_count_delta === 1 from independent heartbeat-runs list',
  t02_bos_provenance_agreement: "C7' T02 heartbeat: assembled bos-light-v1 values agree with observed run/poll state and independently read canonical name/role; field-level provenance populated; vendor-leak flags clean",
});

const GLOBAL_GATE_LABELS = Object.freeze({
  name_drift_pass: 'G1  NAME-DRIFT: roster contains no extra agents and no missing canonical division names',
  upstream_status_pass: 'G2  UPSTREAM-STATUS: T01.status === "PASS" AND T02.status === "PASS"',
  redaction_pass: 'G3  REDACTION: no UUIDs, credential assignments, or vendor-reuse marker strings (caught by the upstream regex set) in evidence string-values',
  side_effects_pass: 'G4  SIDE-EFFECTS: heartbeat_runs_delta === 7 AND issues/documents/comments/approvals/agents deltas all === 0',
});

const BLOCKER_CODES = Object.freeze({
  GATE_NAME_DRIFT: 'M15-S03-GATE-NAME-DRIFT',
  GATE_UPSTREAM_STATUS: 'M15-S03-GATE-UPSTREAM-STATUS',
  GATE_REDACTION: 'M15-S03-GATE-REDACTION',
  GATE_SIDE_EFFECTS: 'M15-S03-GATE-SIDE-EFFECTS',
  RUNTIME_EVIDENCE_MISSING: (label) => `M15-S03-RUNTIME-EVIDENCE-MISSING-${label}`,
  RUNTIME_EVIDENCE_MALFORMED: (label) => `M15-S03-RUNTIME-EVIDENCE-MALFORMED-${label}`,
  PER_AGENT_NAME_MISSING_T01: (name) => `M15-S03-${name}-T01-MISSING`,
  PER_AGENT_NAME_MISSING_T02: (name) => `M15-S03-${name}-T02-MISSING`,
  PER_AGENT_CONDITION: (name, conditionKey) => `M15-S03-${name}-${conditionKey.toUpperCase()}`,
});

function loadEvidence(filePath, label) {
  if (!fs.existsSync(filePath)) {
    const err = new Error(`runtime evidence missing: ${label} expected at ${path.relative(ROOT, filePath)}`);
    err.code = BLOCKER_CODES.RUNTIME_EVIDENCE_MISSING(label);
    throw err;
  }
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (inner) {
    const err = new Error(`runtime evidence unreadable: ${label} (${inner.message})`);
    err.code = BLOCKER_CODES.RUNTIME_EVIDENCE_MALFORMED(label);
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch (inner) {
    const err = new Error(`runtime evidence malformed JSON: ${label} (${inner.message})`);
    err.code = BLOCKER_CODES.RUNTIME_EVIDENCE_MALFORMED(label);
    throw err;
  }
}

function indexByName(agents) {
  const map = new Map();
  for (const entry of agents || []) {
    if (entry && typeof entry.name === 'string') map.set(entry.name, entry);
  }
  return map;
}

function evaluatePerAgentConditions(t01Evidence, t02Evidence) {
  const t01ByName = indexByName(t01Evidence && t01Evidence.agents);
  const t02ByName = indexByName(t02Evidence && t02Evidence.agents);

  return CANONICAL_DIVISION_NAMES.map((name) => {
    const t01 = t01ByName.get(name);
    const t02 = t02ByName.get(name);

    const httpStatus = t01 && t01.testEnvironment && typeof t01.testEnvironment.http_status === 'number'
      ? t01.testEnvironment.http_status
      : null;
    const responseStatus = t01 && t01.testEnvironment ? t01.testEnvironment.response_status : null;
    const xiaomiDetectedT01 = !!(t01 && t01.xiaomi_endpoint_reuse_detected === true);
    // Independent read of the canonical role — comes from T01 only, never from T02.
    // This is what gives C7′ its provenance independence: the bos.role value
    // is checked against a name->role mapping that T02 itself cannot influence.
    const canonicalRoleFromT01 = t01 && typeof t01.agent_role_observed === 'string'
      ? t01.agent_role_observed
      : null;

    const terminalStatus = t02 && t02.poll ? t02.poll.terminal_status : null;
    const wakeDelta = t02 && typeof t02.wake_count_delta === 'number' ? t02.wake_count_delta : null;
    const bosFieldsPresent = t02 && Array.isArray(t02.result_json_bos_fields_present)
      ? t02.result_json_bos_fields_present.slice()
      : null;
    const leakFlags = t02 && t02.leak_flags && typeof t02.leak_flags === 'object' ? t02.leak_flags : null;

    // Pull the assembled BOS object, the per-field provenance, and the
    // observed run-id from independent T02 sub-fields. Each agreement
    // check below cross-validates bos values against a NON-BOS source so
    // a forged bos-light-v1 cannot pass without forking the rest of T02.
    const bos = t02 && t02.result_json_bos_redacted && typeof t02.result_json_bos_redacted === 'object'
      ? t02.result_json_bos_redacted
      : null;
    const bosProvenance = t02 && t02.bos_provenance && typeof t02.bos_provenance === 'object'
      ? t02.bos_provenance
      : null;
    const observedRunId = t02 && t02.invoke && typeof t02.invoke.run_id_redacted === 'string'
      ? t02.invoke.run_id_redacted
      : null;

    // Legacy C7 sub-checks (preserved so the existing booleans keep working).
    const bosHasAllRequired = !!bosFieldsPresent
      && REQUIRED_BOS_FIELDS.every((field) => bosFieldsPresent.includes(field));
    const leakFlagsClean = !!leakFlags
      && leakFlags.xiaomi_endpoint_reuse_detected === false
      && leakFlags.credential_assignment_detected === false;

    // C7′ provenance agreement sub-checks. Each is computed independently so
    // the diagnostics object can show which sub-check failed.
    const runIdAgrees = !!bos && typeof bos.runId === 'string'
      && typeof observedRunId === 'string'
      && bos.runId === observedRunId;
    const divisionAgrees = !!bos && typeof bos.division === 'string'
      && bos.division === name; // name is the canonical iteration key
    const roleAgrees = !!bos && typeof bos.role === 'string'
      && bos.role === canonicalRoleFromT01;
    const statusAgrees = !!bos && typeof bos.status === 'string'
      && bos.status === terminalStatus;
    const provenancePopulated = !!bosProvenance
      && typeof bosProvenance.source === 'string'
      && bosProvenance.source.length > 0
      && typeof bosProvenance.field_sources === 'object'
      && bosProvenance.field_sources !== null;

    const t02_bos_provenance_agreement = bosHasAllRequired
      && runIdAgrees
      && divisionAgrees
      && roleAgrees
      && statusAgrees
      && provenancePopulated
      && leakFlagsClean;

    const conditions = {
      canonical_name_present: !!t01 && !!t02,
      t01_http_success: httpStatus !== null && httpStatus >= 200 && httpStatus < 300,
      t01_response_status_pass: responseStatus === 'pass',
      t01_no_xiaomi_endpoint_reuse: !!t01 && !xiaomiDetectedT01 && t01ByName.has(name),
      t02_heartbeat_terminal_succeeded: terminalStatus === 'succeeded',
      t02_wake_count_delta_one: wakeDelta === 1,
      t02_bos_provenance_agreement: t02_bos_provenance_agreement,
    };

    const expected = Object.keys(PER_AGENT_CONDITION_LABELS).length;
    const passed_count = Object.values(conditions).filter(Boolean).length;
    const passed = passed_count === expected;

    return {
      name,
      expected_count: expected,
      passed_count,
      passed,
      conditions,
      t01_present: !!t01,
      t02_present: !!t02,
      t01_verdict: t01 ? t01.verdict : null,
      t02_verdict: t02 ? t02.verdict : null,
      t01_http_status: httpStatus,
      t01_response_status: responseStatus,
      t01_agent_role_observed: canonicalRoleFromT01,
      t02_terminal_status: terminalStatus,
      t02_wake_count_delta: wakeDelta,
      t02_bos_run_id_redacted: observedRunId,
      t02_bos_observed: bos ? {
        schemaVersion: typeof bos.schemaVersion === 'string' ? bos.schemaVersion : null,
        runId: typeof bos.runId === 'string' ? bos.runId : null,
        division: typeof bos.division === 'string' ? bos.division : null,
        role: typeof bos.role === 'string' ? bos.role : null,
        status: typeof bos.status === 'string' ? bos.status : null,
      } : null,
      t02_bos_provenance_source: bosProvenance && typeof bosProvenance.source === 'string'
        ? bosProvenance.source
        : null,
      t02_bos_provenance_agreement_diagnostics: {
        bos_fields_present_match: bosHasAllRequired,
        run_id_match: runIdAgrees,
        division_match: divisionAgrees,
        role_match: roleAgrees,
        status_match: statusAgrees,
        provenance_source_populated: provenancePopulated,
        leak_flags_clean: leakFlagsClean,
      },
    };
  });
}

function findRedactionLeaks(value, jsonPath, hits) {
  if (!hits) hits = [];
  if (value == null) return hits;
  if (typeof value === 'string') {
    if (UUID_FULL.test(value)) hits.push({ path: jsonPath || '$', kind: 'uuid', tail: redactMessageTail(value, 80) });
    if (CREDENTIAL_ASSIGNMENT.test(value)) hits.push({ path: jsonPath || '$', kind: 'credential', tail: redactMessageTail(value, 80) });
    if (XIAOMI_RE.test(value)) hits.push({ path: jsonPath || '$', kind: 'xiaomi_endpoint_reuse', tail: redactMessageTail(value, 80) });
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
    return hits;
  }
  return hits;
}

function evaluateGlobalGates(t01Evidence, t02Evidence) {
  const canonical = new Set(CANONICAL_DIVISION_NAMES);

  const t01Names = new Set((t01Evidence && t01Evidence.agents || []).map((a) => a && a.name).filter(Boolean));
  const t02Names = new Set((t02Evidence && t02Evidence.agents || []).map((a) => a && a.name).filter(Boolean));

  const missingCanonical = CANONICAL_DIVISION_NAMES.filter((n) => !t01Names.has(n) || !t02Names.has(n));
  const extraRoster = [...t02Names].filter((n) => !canonical.has(n));
  const t01HasNameDrift = (t01Evidence.blockers || []).some((b) => b && b.code === PROBE_BLOCKER_CODES.NAME_DRIFT);
  const t02HasNameDrift = (t02Evidence.blockers || []).some((b) => b && b.code === PROBE_BLOCKER_CODES.NAME_DRIFT);
  const name_drift_pass = missingCanonical.length === 0 && extraRoster.length === 0 && !t01HasNameDrift && !t02HasNameDrift;

  const upstream_status_pass = t01Evidence.status === 'PASS' && t02Evidence.status === 'PASS';

  const t01Leaks = findRedactionLeaks(t01Evidence);
  const t02Leaks = findRedactionLeaks(t02Evidence);
  const redaction_pass = t01Leaks.length === 0 && t02Leaks.length === 0;

  const sideEffects = (t02Evidence && t02Evidence.side_effects) || {};
  const deltas = sideEffects.deltas || {};
  const issuesDelta = deltas.issues;
  const docsDelta = deltas.documents;
  const commentsDelta = deltas.comments;
  const approvalsDelta = deltas.approvals;
  const agentsDelta = deltas.agents;
  const heartbeatDelta = sideEffects.heartbeat_runs_delta;
  const side_effects_pass = issuesDelta === 0
    && docsDelta === 0
    && commentsDelta === 0
    && approvalsDelta === 0
    && agentsDelta === 0
    && heartbeatDelta === 7;

  return {
    name_drift_pass,
    upstream_status_pass,
    redaction_pass,
    side_effects_pass,
    diagnostics: {
      name_drift: {
        missing_canonical: missingCanonical,
        extra_roster: extraRoster,
        t01_name_drift_blocker: t01HasNameDrift,
        t02_name_drift_blocker: t02HasNameDrift,
      },
      upstream_status: { t01_status: t01Evidence && t01Evidence.status, t02_status: t02Evidence && t02Evidence.status },
      redaction: {
        t01_leak_count: t01Leaks.length,
        t02_leak_count: t02Leaks.length,
        t01_leak_paths: t01Leaks.map((entry) => entry.path),
        t02_leak_paths: t02Leaks.map((entry) => entry.path),
      },
      side_effects: {
        issues_delta: issuesDelta,
        documents_delta: docsDelta,
        comments_delta: commentsDelta,
        approvals_delta: approvalsDelta,
        agents_delta: agentsDelta,
        heartbeat_runs_delta: heartbeatDelta,
      },
    },
  };
}

function compileBlockers(perAgent, gates) {
  const blockers = [];

  for (const entry of perAgent) {
    if (entry.passed) continue;

    if (!entry.t01_present && !entry.t02_present) {
      blockers.push({
        code: BLOCKER_CODES.PER_AGENT_NAME_MISSING_T01(entry.name),
        agent: entry.name,
        reason: `agent ${entry.name} absent from both T01 and T02 evidence`,
      });
      continue;
    }
    if (!entry.t01_present) {
      blockers.push({
        code: BLOCKER_CODES.PER_AGENT_NAME_MISSING_T01(entry.name),
        agent: entry.name,
        reason: `agent ${entry.name} missing from T01 evidence`,
      });
    }
    if (!entry.t02_present) {
      blockers.push({
        code: BLOCKER_CODES.PER_AGENT_NAME_MISSING_T02(entry.name),
        agent: entry.name,
        reason: `agent ${entry.name} missing from T02 evidence`,
      });
    }

    const failed = Object.entries(entry.conditions)
      .filter(([, ok]) => !ok)
      .map(([key]) => key);
    for (const condKey of failed) {
      blockers.push({
        code: BLOCKER_CODES.PER_AGENT_CONDITION(entry.name, condKey),
        agent: entry.name,
        reason: `${entry.name} failed ${condKey} (${entry.passed_count}/${entry.expected_count})`,
      });
    }
  }

  if (!gates.name_drift_pass) {
    blockers.push({
      code: BLOCKER_CODES.GATE_NAME_DRIFT,
      agent: null,
      reason: `name drift: missing=[${gates.diagnostics.name_drift.missing_canonical.join(',') || 'none'}] extra=[${gates.diagnostics.name_drift.extra_roster.join(',') || 'none'}] t01_drift_blocker=${gates.diagnostics.name_drift.t01_name_drift_blocker} t02_drift_blocker=${gates.diagnostics.name_drift.t02_name_drift_blocker}`,
    });
  }
  if (!gates.upstream_status_pass) {
    blockers.push({
      code: BLOCKER_CODES.GATE_UPSTREAM_STATUS,
      agent: null,
      reason: `upstream statuses off-spec: T01=${gates.diagnostics.upstream_status.t01_status || 'missing'} T02=${gates.diagnostics.upstream_status.t02_status || 'missing'}`,
    });
  }
  if (!gates.redaction_pass) {
    blockers.push({
      code: BLOCKER_CODES.GATE_REDACTION,
      agent: null,
      reason: `redaction leaks detected: t01=${gates.diagnostics.redaction.t01_leak_count} t02=${gates.diagnostics.redaction.t02_leak_count}`,
    });
  }
  if (!gates.side_effects_pass) {
    blockers.push({
      code: BLOCKER_CODES.GATE_SIDE_EFFECTS,
      agent: null,
      reason: `side-effect deltas off-spec: ${JSON.stringify(gates.diagnostics.side_effects)}`,
    });
  }

  return blockers;
}

function buildGateEvidence({ perAgent, gates, blockers, t01Path, t02Path, gateModel }) {
  const totalConditions = perAgent.reduce((acc, entry) => acc + entry.expected_count, 0);
  const passedConditions = perAgent.reduce((acc, entry) => acc + entry.passed_count, 0);
  const overallPass = perAgent.every((entry) => entry.passed)
    && gates.name_drift_pass
    && gates.upstream_status_pass
    && gates.redaction_pass
    && gates.side_effects_pass;

  return {
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s03-seven-agent-independent-gate.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S03',
    task: 'T03',
    generated: new Date().toISOString(),
    status: overallPass ? 'PASS' : 'FAIL_CLOSED',
    gate_model: gateModel || "49 per-agent conditions (7 agents x 7 checks including C7' provenance-backed BOS agreement) AND 4 global gates (name_drift, upstream_status, redaction, side_effects)",
    upstream_artifacts: {
      test_environment: t01Path ? path.relative(ROOT, t01Path) : null,
      diagnostic_runs: t02Path ? path.relative(ROOT, t02Path) : null,
    },
    global_gates: {
      name_drift_pass: gates.name_drift_pass,
      upstream_status_pass: gates.upstream_status_pass,
      redaction_pass: gates.redaction_pass,
      side_effects_pass: gates.side_effects_pass,
      labels: GLOBAL_GATE_LABELS,
      diagnostics: gates.diagnostics,
    },
    per_agent_conditions_total: totalConditions,
    per_agent_conditions_passed: passedConditions,
    per_agent_conditions_failed: totalConditions - passedConditions,
    per_agent_passed: perAgent.filter((entry) => entry.passed).length,
    per_agent_failed: perAgent.filter((entry) => !entry.passed).length,
    per_agent_total: perAgent.length,
    condition_labels: PER_AGENT_CONDITION_LABELS,
    per_agent: perAgent,
    blockers: blockers.map((entry) => ({
      code: entry.code,
      severity: 'blocking',
      agent: entry.agent || null,
      reason: entry.reason,
    })),
    redaction: {
      full_ids: false,
      credentials: false,
      xiaomi_endpoint_reuse: gates.diagnostics.redaction.t01_leak_count + gates.diagnostics.redaction.t02_leak_count === 0,
    },
  };
}

function evaluateGate(t01Evidence, t02Evidence, options) {
  const opts = options || {};
  const perAgent = evaluatePerAgentConditions(t01Evidence, t02Evidence);
  const gates = evaluateGlobalGates(t01Evidence, t02Evidence);
  const blockers = compileBlockers(perAgent, gates);
  const evidence = buildGateEvidence({
    perAgent,
    gates,
    blockers,
    t01Path: opts.t01Path || T01_PATH,
    t02Path: opts.t02Path || T02_PATH,
  });
  return {
    ok: evidence.status === 'PASS',
    evidence,
    perAgent,
    gates,
    blockers,
  };
}

function writeEvidence(evidence) {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const scrubbed = scrubEvidence(evidence);
  const serialized = JSON.stringify(scrubbed, null, 2) + '\n';

  // Belt-and-braces refusal to write if we accidentally introduced a leak.
  // Note: boolean flag key NAMES like "xiaomi_endpoint_reuse_detected" do NOT
  // match \b(xiaomi|mimo)\b because underscore is a JS word character; only
  // string values containing "xiaomi" or "mimo" would trip these checks.
  if (UUID_FULL.test(serialized)) {
    throw new Error(`${BLOCKER_CODES.GATE_REDACTION} refused write: full UUID detected in validator output`);
  }
  if (CREDENTIAL_ASSIGNMENT.test(serialized)) {
    throw new Error(`${BLOCKER_CODES.GATE_REDACTION} refused write: credential assignment detected in validator output`);
  }
  if (XIAOMI_RE.test(serialized)) {
    throw new Error(`${BLOCKER_CODES.GATE_REDACTION} refused write: xiaomi or mimo string detected in validator output`);
  }

  fs.writeFileSync(OUTPUT_PATH, serialized);
}

async function run() {
  const t01Evidence = loadEvidence(T01_PATH, 'T01');
  const t02Evidence = loadEvidence(T02_PATH, 'T02');
  const result = evaluateGate(t01Evidence, t02Evidence, { t01Path: T01_PATH, t02Path: T02_PATH });
  writeEvidence(result.evidence);

  const passedAll49 = result.perAgent.every((entry) => entry.passed);
  const overallCond = `${result.evidence.per_agent_conditions_passed}/${result.evidence.per_agent_conditions_total}`;
  const gates = result.gates;
  const gateSummary = `name=${gates.name_drift_pass ? 'p' : 'f'} upstream=${gates.upstream_status_pass ? 'p' : 'f'} redact=${gates.redaction_pass ? 'p' : 'f'} sidefx=${gates.side_effects_pass ? 'p' : 'f'}`;

  process.stdout.write(
    `M015_S03_GATE=${result.ok ? 'pass' : 'fail'} 49-of-49=${passedAll49} conditions=${overallCond} gates=${gateSummary} blockers=${result.blockers.length}\n`,
  );
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
  run().catch((error) => {
    try {
      const failure = {
        $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s03-seven-agent-independent-gate.v1.json',
        milestone: 'M015-4o8lfw',
        slice: 'S03',
        task: 'T03',
        generated: new Date().toISOString(),
        status: 'FAIL_CLOSED',
        reason: error && error.message ? error.message : String(error),
        blockers: [{
          code: 'M15-S03-RUNNER-FAILURE',
          severity: 'blocking',
          agent: null,
          reason: error && error.message ? error.message : String(error),
        }],
        redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false },
      };
      fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(failure, null, 2) + '\n');
    } catch (_) { /* best effort */ }
    process.stderr.write(`M015_S03_GATE_ERROR=${error && error.message ? error.message : error}\n`);
    process.exit(2);
  });
}

module.exports = {
  ROOT,
  T01_PATH,
  T02_PATH,
  OUTPUT_PATH,
  REQUIRED_BOS_FIELDS,
  PER_AGENT_CONDITION_LABELS,
  GLOBAL_GATE_LABELS,
  BLOCKER_CODES,
  loadEvidence,
  evaluatePerAgentConditions,
  evaluateGlobalGates,
  compileBlockers,
  buildGateEvidence,
  evaluateGate,
  findRedactionLeaks,
  writeEvidence,
  _redactedText: redacted,
};
