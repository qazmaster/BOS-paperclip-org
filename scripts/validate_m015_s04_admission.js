#!/usr/bin/env node
'use strict';

/**
 * scripts/validate_m015_s04_admission.js
 *
 * M015-4o8lfw / S04 / T01 — fail-closed S03→S04 admission boundary.
 *
 * S03 closed honestly fail-closed (21/49 conditions failed, side-effects
 * delta heartbeat_runs=8 vs expected 7, 5/7 sign-ins returned HTTP 429,
 * per-agent BOS-fields contract gap on 6/7 agents). A closed dependency is
 * NOT the same as the required 7/7 fresh admission pass. This validator
 * re-proves the boundary as a pure function over four redacted upstream
 * JSON artifacts and refuses to admit S04 unless all four gates are green
 * AND zero business mutations are recorded.
 *
 * Inputs (all loaded with redacted-string leakage scanner):
 *   runtime-evidence/M015-S03-seven-agent-test-environment.json       (S03 T01)
 *   runtime-evidence/M015-S03-seven-agent-diagnostic-runs.json         (S03 T02)
 *   runtime-evidence/M015-S03-seven-agent-independent-gate.json       (S03 T03)
 *   runtime-evidence/M015-S03-t19-diagnostic-admission-blockers.json  (S03 T19)
 *
 * Admission gates (all four must pass; any failure → BLOCKED_ON_S03_FAIL_CLOSED):
 *   AG1 FRESH-S03-7OF7-INVOKABILITY:
 *       T03 status === "PASS" AND T03.per_agent_passed === 7
 *   AG2 NO-DO-NOT-PROMOTE-S04:
 *       T19.do_not_promote_s04 is not literally true
 *   AG3 NO-DRIFT (configuration / hierarchy / grants):
 *       T01+T02 rosters contain every CANONICAL_DIVISION_NAMES entry,
 *       no extras, no T01 xiaomi_endpoint_reuse_detected, no T02 grants
 *       delta (agents_delta === 0)
 *   AG4 NO-LEAKS:
 *       aggregate findRedactionLeaks() over all four inputs returns []
 *
 * Output (always written, even on failure):
 *   runtime-evidence/M015-S04-admission.json
 *
 * The verdict field is one of:
 *   - 'ADMITTED'                  — all four gates pass; one PO/root intake may proceed
 *   - 'BLOCKED_ON_S03_FAIL_CLOSED'— any gate fails; harness MUST refuse mutation
 *
 * Exports helpers so T02–T05 can drive negative fixtures and never
 * accidentally treat the fail-closed verdict as mission success:
 *   loadEvidence, evaluateAdmissionGates, compileAdmissionBlockers,
 *   buildAdmissionEvidence, evaluateAdmission, findRedactionLeaks,
 *   writeAdmissionEvidence, ADMISSION_GATE_LABELS, BLOCKER_CODES.
 */

const fs = require('fs');
const path = require('path');
const {
  CANONICAL_DIVISION_NAMES,
  XIAOMI_RE,
  CREDENTIAL_ASSIGNMENT,
  UUID_FULL,
  redactMessageTail,
  scrubEvidence,
} = require('./probe_m015_seven_agent_environment');

const ROOT = path.resolve(__dirname, '..');
const T01_PATH = path.join(ROOT, 'runtime-evidence/M015-S03-seven-agent-test-environment.json');
const T02_PATH = path.join(ROOT, 'runtime-evidence/M015-S03-seven-agent-diagnostic-runs.json');
const T03_PATH = path.join(ROOT, 'runtime-evidence/M015-S03-seven-agent-independent-gate.json');
const T19_PATH = path.join(ROOT, 'runtime-evidence/M015-S03-t19-diagnostic-admission-blockers.json');
const OUTPUT_PATH = path.join(ROOT, 'runtime-evidence/M015-S04-admission.json');

const ADMISSION_GATE_LABELS = Object.freeze({
  fresh_s03_7of7_invokability_pass:
    'AG1 FRESH-S03-7OF7-INVOKABILITY: S03-T03.status === "PASS" AND S03-T03.per_agent_passed === 7',
  no_do_not_promote_s04_pass:
    'AG2 NO-DO-NOT-PROMOTE-S04: T19.do_not_promote_s04 is not literally true (closed dependency ≠ fresh admission)',
  no_drift_pass:
    'AG3 NO-DRIFT: T01+T02 rosters contain exactly CANONICAL_DIVISION_NAMES, no T01 xiaomi_endpoint_reuse_detected, T02 grants-delta.agents === 0',
  no_leaks_pass:
    'AG4 NO-LEAKS: aggregate findRedactionLeaks() over T01+T02+T03+T19 returns [] (UUIDs, credential assignments, vendor-reuse strings are scrubbing-safe)',
});

const BLOCKER_CODES = Object.freeze({
  GATE_FRESH_S03_7OF7: 'M15-S04-ADMISSION-GATE-FRESH-S03-7OF7',
  GATE_DO_NOT_PROMOTE: 'M15-S04-ADMISSION-GATE-DO-NOT-PROMOTE-S04',
  GATE_NO_DRIFT: 'M15-S04-ADMISSION-GATE-NO-DRIFT',
  GATE_NO_LEAKS: 'M15-S04-ADMISSION-GATE-NO-LEAKS',
  RUNTIME_EVIDENCE_MISSING: (label) => `M15-S04-ADMISSION-EVIDENCE-MISSING-${label}`,
  RUNTIME_EVIDENCE_MALFORMED: (label) => `M15-S04-ADMISSION-EVIDENCE-MALFORMED-${label}`,
  RUNNER_FAILURE: 'M15-S04-ADMISSION-RUNNER-FAILURE',
});

const EXPECTED_INPUTS = Object.freeze([
  { key: 't01', label: 'S03-T01', path: T01_PATH },
  { key: 't02', label: 'S03-T02', path: T02_PATH },
  { key: 't03', label: 'S03-T03', path: T03_PATH },
  { key: 't19', label: 'S03-T19', path: T19_PATH },
]);

function loadEvidence(filePath, label) {
  if (!fs.existsSync(filePath)) {
    const err = new Error(`admission evidence missing: ${label} expected at ${path.relative(ROOT, filePath)}`);
    err.code = BLOCKER_CODES.RUNTIME_EVIDENCE_MISSING(label);
    throw err;
  }
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (inner) {
    const err = new Error(`admission evidence unreadable: ${label} (${inner.message})`);
    err.code = BLOCKER_CODES.RUNTIME_EVIDENCE_MALFORMED(label);
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch (inner) {
    const err = new Error(`admission evidence malformed JSON: ${label} (${inner.message})`);
    err.code = BLOCKER_CODES.RUNTIME_EVIDENCE_MALFORMED(label);
    throw err;
  }
}

function indexAgentNames(evidence) {
  if (!evidence || !Array.isArray(evidence.agents)) return new Set();
  const names = new Set();
  for (const entry of evidence.agents) {
    if (entry && typeof entry.name === 'string' && entry.name) names.add(entry.name);
  }
  return names;
}

function findRedactionLeaks(value, jsonPath, hits) {
  if (!hits) hits = [];
  if (value == null) return hits;
  if (typeof value === 'string') {
    if (UUID_FULL.test(value)) hits.push({ path: jsonPath || '$', kind: 'uuid', source: 'admission-evidence', tail: redactMessageTail(value, 80) });
    if (CREDENTIAL_ASSIGNMENT.test(value)) hits.push({ path: jsonPath || '$', kind: 'credential', source: 'admission-evidence', tail: redactMessageTail(value, 80) });
    if (XIAOMI_RE.test(value)) hits.push({ path: jsonPath || '$', kind: 'xiaomi_endpoint_reuse', source: 'admission-evidence', tail: redactMessageTail(value, 80) });
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

function evaluateAdmissionGates(inputs) {
  const t01 = inputs && inputs.t01;
  const t02 = inputs && inputs.t02;
  const t03 = inputs && inputs.t03;
  const t19 = inputs && inputs.t19;

  // AG1: T03.status === "PASS" AND T03.per_agent_passed === 7.
  const t03Status = t03 && typeof t03.status === 'string' ? t03.status : null;
  const t03PerAgentPassed = t03 && typeof t03.per_agent_passed === 'number' ? t03.per_agent_passed : null;
  const t03PerAgentTotal = t03 && typeof t03.per_agent_total === 'number' ? t03.per_agent_total : null;
  const t03PerAgentFailed = t03 && typeof t03.per_agent_failed === 'number' ? t03.per_agent_failed : null;
  const fresh_s03_7of7_invokability_pass = t03Status === 'PASS' && t03PerAgentPassed === 7;

  // AG2: T19.do_not_promote_s04 must not literally be true.
  const doNotPromoteRaw = t19 ? t19.do_not_promote_s04 : undefined;
  const doNotPromoteIsTrue = doNotPromoteRaw === true;
  const no_do_not_promote_s04_pass = !doNotPromoteIsTrue;

  // AG3: roster + xiaomi + grants drift.
  const canonicalSet = new Set(CANONICAL_DIVISION_NAMES);
  const t01Names = indexAgentNames(t01);
  const t02Names = indexAgentNames(t02);
  const missingCanonical = CANONICAL_DIVISION_NAMES.filter((n) => !t01Names.has(n) || !t02Names.has(n));
  const t01Extras = [...t01Names].filter((n) => !canonicalSet.has(n));
  const t02Extras = [...t02Names].filter((n) => !canonicalSet.has(n));
  const extraRoster = Array.from(new Set([...t01Extras, ...t02Extras]));
  const t01XiaomiDetected = Array.isArray(t01 && t01.agents)
    ? t01.agents.some((a) => a && a.xiaomi_endpoint_reuse_detected === true)
    : false;
  const t02GrantsDelta = t02 && t02.side_effects && t02.side_effects.deltas && typeof t02.side_effects.deltas.agents === 'number'
    ? t02.side_effects.deltas.agents
    : null;
  const no_drift_pass = missingCanonical.length === 0
    && extraRoster.length === 0
    && !t01XiaomiDetected
    && t02GrantsDelta === 0;

  // AG4: redaction aggregate over all four inputs.
  const t01Leaks = findRedactionLeaks(t01);
  const t02Leaks = findRedactionLeaks(t02);
  const t03Leaks = findRedactionLeaks(t03);
  const t19Leaks = findRedactionLeaks(t19);
  const aggregateLeaks = [
    ...t01Leaks.map((entry) => Object.assign({}, entry, { source_artifact: 'S03-T01' })),
    ...t02Leaks.map((entry) => Object.assign({}, entry, { source_artifact: 'S03-T02' })),
    ...t03Leaks.map((entry) => Object.assign({}, entry, { source_artifact: 'S03-T03' })),
    ...t19Leaks.map((entry) => Object.assign({}, entry, { source_artifact: 'S03-T19' })),
  ];
  const no_leaks_pass = aggregateLeaks.length === 0;

  return {
    fresh_s03_7of7_invokability_pass,
    no_do_not_promote_s04_pass,
    no_drift_pass,
    no_leaks_pass,
    diagnostics: {
      fresh_s03_7of7_invokability: {
        t03_status: t03Status,
        t03_per_agent_passed: t03PerAgentPassed,
        t03_per_agent_total: t03PerAgentTotal,
        t03_per_agent_failed: t03PerAgentFailed,
      },
      no_do_not_promote_s04: {
        t19_do_not_promote_s04: doNotPromoteRaw,
        t19_closeout_verdict: t19 && typeof t19.closeout_verdict === 'string' ? t19.closeout_verdict : null,
      },
      no_drift: {
        canonical_required_count: CANONICAL_DIVISION_NAMES.length,
        missing_canonical: missingCanonical,
        extra_roster: extraRoster,
        t01_xiaomi_detected: t01XiaomiDetected,
        t02_agents_delta: t02GrantsDelta,
      },
      no_leaks: {
        aggregate_leak_count: aggregateLeaks.length,
        t01_leak_count: t01Leaks.length,
        t02_leak_count: t02Leaks.length,
        t03_leak_count: t03Leaks.length,
        t19_leak_count: t19Leaks.length,
        leak_paths: aggregateLeaks.map((entry) => `${entry.source_artifact}:${entry.path}(${entry.kind})`),
      },
    },
  };
}

function compileAdmissionBlockers(gates, t19) {
  const blockers = [];

  if (!gates.fresh_s03_7of7_invokability_pass) {
    const d = gates.diagnostics.fresh_s03_7of7_invokability;
    blockers.push({
      code: BLOCKER_CODES.GATE_FRESH_S03_7OF7,
      agent: null,
      reason:
        `fresh S03 7/7 invokability not proven: ` +
        `T03.status=${d.t03_status == null ? 'missing' : d.t03_status} ` +
        `T03.per_agent_passed=${d.t03_per_agent_passed == null ? 'missing' : d.t03_per_agent_passed}/7 ` +
        `(failed=${d.t03_per_agent_failed == null ? 'unknown' : d.t03_per_agent_failed})`,
    });
  }

  if (!gates.no_do_not_promote_s04_pass) {
    const d = gates.diagnostics.no_do_not_promote_s04;
    blockers.push({
      code: BLOCKER_CODES.GATE_DO_NOT_PROMOTE,
      agent: null,
      reason:
        `T19.do_not_promote_s04=${JSON.stringify(d.t19_do_not_promote_s04)} ` +
        `is explicitly true; S04 admission must be blocked until upstream remediation ` +
        `(closeout_verdict=${d.t19_closeout_verdict == null ? 'missing' : d.t19_closeout_verdict})`,
    });
  }

  if (!gates.no_drift_pass) {
    const d = gates.diagnostics.no_drift;
    blockers.push({
      code: BLOCKER_CODES.GATE_NO_DRIFT,
      agent: null,
      reason:
        `drift detected: missing=[${d.missing_canonical.join(',') || 'none'}] ` +
        `extra=[${d.extra_roster.join(',') || 'none'}] ` +
        `t01_xiaomi_detected=${d.t01_xiaomi_detected} ` +
        `t02_agents_delta=${d.t02_agents_delta == null ? 'missing' : d.t02_agents_delta}`,
    });
  }

  if (!gates.no_leaks_pass) {
    const d = gates.diagnostics.no_leaks;
    blockers.push({
      code: BLOCKER_CODES.GATE_NO_LEAKS,
      agent: null,
      reason:
        `aggregate redaction leaks detected: count=${d.aggregate_leak_count} ` +
        `t01=${d.t01_leak_count} t02=${d.t02_leak_count} t03=${d.t03_leak_count} t19=${d.t19_leak_count}`,
    });
  }

  return blockers;
}

function deriveStatus(gates, blockers) {
  return blockers.length === 0
    && gates.fresh_s03_7of7_invokability_pass
    && gates.no_do_not_promote_s04_pass
    && gates.no_drift_pass
    && gates.no_leaks_pass
    ? 'ADMITTED'
    : 'BLOCKED_ON_S03_FAIL_CLOSED';
}

function buildAdmissionEvidence({ inputs, gates, blockers, paths }) {
  const status = deriveStatus(gates, blockers);
  return {
    $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s04-admission.v1.json',
    milestone: 'M015-4o8lfw',
    slice: 'S04',
    task: 'T01',
    generated: new Date().toISOString(),
    status,
    admission_model: '4 admission gates (fresh_s03_7of7_invokability, no_do_not_promote_s04, no_drift, no_leaks)',
    upstream_artifacts: {
      s03_t01_test_environment: paths && paths.t01 ? path.relative(ROOT, paths.t01) : null,
      s03_t02_diagnostic_runs: paths && paths.t02 ? path.relative(ROOT, paths.t02) : null,
      s03_t03_independent_gate: paths && paths.t03 ? path.relative(ROOT, paths.t03) : null,
      s03_t19_admission_blockers: paths && paths.t19 ? path.relative(ROOT, paths.t19) : null,
    },
    gate_labels: ADMISSION_GATE_LABELS,
    gates: {
      fresh_s03_7of7_invokability_pass: gates.fresh_s03_7of7_invokability_pass,
      no_do_not_promote_s04_pass: gates.no_do_not_promote_s04_pass,
      no_drift_pass: gates.no_drift_pass,
      no_leaks_pass: gates.no_leaks_pass,
      diagnostics: gates.diagnostics,
    },
    business_mutations_recorded: 0,
    blockers: blockers.map((entry) => ({
      code: entry.code,
      severity: 'blocking',
      agent: entry.agent || null,
      reason: entry.reason,
    })),
    redaction: {
      full_ids: false,
      credentials: false,
      xiaomi_endpoint_reuse: gates.no_leaks_pass,
    },
  };
}

function evaluateAdmission(inputs, options) {
  const opts = options || {};
  const gates = evaluateAdmissionGates(inputs);
  const blockers = compileAdmissionBlockers(gates, inputs && inputs.t19);
  const evidence = buildAdmissionEvidence({
    inputs,
    gates,
    blockers,
    paths: {
      t01: opts.t01Path || T01_PATH,
      t02: opts.t02Path || T02_PATH,
      t03: opts.t03Path || T03_PATH,
      t19: opts.t19Path || T19_PATH,
    },
  });
  return {
    admitted: evidence.status === 'ADMITTED',
    evidence,
    gates,
    blockers,
  };
}

function writeAdmissionEvidence(evidence) {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const scrubbed = scrubEvidence(evidence);
  const serialized = JSON.stringify(scrubbed, null, 2) + '\n';

  // Belt-and-braces refusal — guard against accidentally emitted leaks even
  // when all gates pass. Boolean flag KEYS like 'xiaomi_endpoint_reuse_detected'
  // are intentional and do NOT match \b(xiaomi|mimo)\b (underscore is a JS word
  // character); only actual string VALUES containing xiaomi/mimo trip this.
  if (UUID_FULL.test(serialized)) {
    throw new Error(`${BLOCKER_CODES.GATE_NO_LEAKS} refused write: full UUID detected in admission output`);
  }
  if (CREDENTIAL_ASSIGNMENT.test(serialized)) {
    throw new Error(`${BLOCKER_CODES.GATE_NO_LEAKS} refused write: credential assignment detected in admission output`);
  }
  if (XIAOMI_RE.test(serialized)) {
    throw new Error(`${BLOCKER_CODES.GATE_NO_LEAKS} refused write: xiaomi or mimo string detected in admission output`);
  }

  fs.writeFileSync(OUTPUT_PATH, serialized);
}

async function run() {
  const inputs = {
    t01: loadEvidence(T01_PATH, 'S03-T01'),
    t02: loadEvidence(T02_PATH, 'S03-T02'),
    t03: loadEvidence(T03_PATH, 'S03-T03'),
    t19: loadEvidence(T19_PATH, 'S03-T19'),
  };
  const result = evaluateAdmission(inputs, {
    t01Path: T01_PATH,
    t02Path: T02_PATH,
    t03Path: T03_PATH,
    t19Path: T19_PATH,
  });
  writeAdmissionEvidence(result.evidence);

  const gateSummary =
    `fresh_s03_7of7=${result.gates.fresh_s03_7of7_invokability_pass ? 'p' : 'f'} ` +
    `no_do_not_promote=${result.gates.no_do_not_promote_s04_pass ? 'p' : 'f'} ` +
    `no_drift=${result.gates.no_drift_pass ? 'p' : 'f'} ` +
    `no_leaks=${result.gates.no_leaks_pass ? 'p' : 'f'}`;

  process.stdout.write(
    `M015_S04_ADMISSION=${result.admitted ? 'ADMITTED' : 'BLOCKED_ON_S03_FAIL_CLOSED'} ` +
    `gates=${gateSummary} blockers=${result.blockers.length} business_mutations=${result.evidence.business_mutations_recorded}\n`,
  );
  process.exit(result.admitted ? 0 : 1);
}

if (require.main === module) {
  run().catch((error) => {
    try {
      const failure = {
        $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s04-admission.v1.json',
        milestone: 'M015-4o8lfw',
        slice: 'S04',
        task: 'T01',
        generated: new Date().toISOString(),
        status: 'BLOCKED_ON_S03_FAIL_CLOSED',
        admission_model: '4 admission gates (fresh_s03_7of7_invokability, no_do_not_promote_s04, no_drift, no_leaks)',
        reason: error && error.message ? error.message : String(error),
        blockers: [
          {
            code: BLOCKER_CODES.RUNNER_FAILURE,
            severity: 'blocking',
            agent: null,
            reason: error && error.message ? error.message : String(error),
          },
        ],
        business_mutations_recorded: 0,
        redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false },
      };
      fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(failure, null, 2) + '\n');
    } catch (_) { /* best effort */ }
    process.stderr.write(`M015_S04_ADMISSION_ERROR=${error && error.message ? error.message : error}\n`);
    process.exit(2);
  });
}

module.exports = {
  ROOT,
  T01_PATH,
  T02_PATH,
  T03_PATH,
  T19_PATH,
  OUTPUT_PATH,
  ADMISSION_GATE_LABELS,
  BLOCKER_CODES,
  EXPECTED_INPUTS,
  loadEvidence,
  evaluateAdmissionGates,
  compileAdmissionBlockers,
  buildAdmissionEvidence,
  evaluateAdmission,
  findRedactionLeaks,
  writeAdmissionEvidence,
};
