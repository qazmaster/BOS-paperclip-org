#!/usr/bin/env node
'use strict';

/**
 * scripts/validate_m015_s04_native_mission.js
 *
 * M015-4o8lfw / S04 / T02 — Native mission protocol validator.
 *
 * Pure-function validator over (a) the S04 admission evidence produced by
 * T01 and (b) the live mission run evidence produced by T04. It compiles
 * 10 protocol gates (MG1..MG10) covering topology, authorship, agent-
 * authored outputs, review path, allowlisted side effects, terminal
 * states, time budgets, idempotency/recovery, secret hygiene, and the
 * prohibition of synthetic BOS JSON fallback.
 *
 * Inputs:
 *   --admission <path>     default: runtime-evidence/M015-S04-admission.json
 *   --input    <path>      default: runtime-evidence/M015-S04-native-mission-run.json
 *   --output   <path>      default: runtime-evidence/M015-S04-native-mission-protocol.json
 *   --accept-safe-block    accept admission block + missing run as
 *                          MISSION_BLOCKED_SAFE (does NOT promote to
 *                          MISSION_PASS); the current S03 fail-closed
 *                          state must use this flag to avoid a hard
 *                          fail in a CI gate that does not yet have
 *                          upstream remediation.
 *
 * Output (always written, even on failure):
 *   runtime-evidence/M015-S04-native-mission-protocol.json
 *
 * Verdict field is one of:
 *   - 'MISSION_PASS'             — all 10 gates pass on live evidence
 *   - 'MISSION_FAIL_CLOSED'      — at least one gate failed; do not promote
 *   - 'MISSION_BLOCKED_SAFE'     — admission blocked + run missing/empty,
 *                                  with --accept-safe-block; explicit
 *                                  evidence of safe stop, NOT success
 *   - 'MISSION_BLOCKED_NO_RUN'   — admission blocked + run missing/empty
 *                                  without --accept-safe-block; CI should
 *                                  fail
 *
 * Exports helpers so T04 + T05 can drive negative fixtures and share
 * the same evaluator:
 *   loadAdmissionEvidence, loadMissionRun, evaluateProtocol,
 *   evaluateMissionContract (re-exported from the contract lib),
 *   compileProtocolBlockers, buildProtocolEvidence,
 *   findRedactionLeaks, writeProtocolEvidence,
 *   PROTOCOL_GATE_LABELS, BLOCKER_CODES.
 */

const fs = require('fs');
const path = require('path');
const {
  ROOT,
  BLOCKER_CODES,
  evaluateMissionContract,
  compileProtocolBlockers,
  buildProtocolEvidence,
  deriveProtocolStatus,
  findRedactionLeaks,
  scrubEvidence,
  UUID_FULL,
  CREDENTIAL_ASSIGNMENT,
  XIAOMI_RE,
} = require('./lib/m015-s04-native-mission-contract');
const { PROTOCOL_GATE_LABELS } = require('./lib/m015-s04-native-mission-data');

const ADMISSION_PATH = path.join(ROOT, 'runtime-evidence/M015-S04-admission.json');
const DEFAULT_RUN_PATH = path.join(ROOT, 'runtime-evidence/M015-S04-native-mission-run.json');
const OUTPUT_PATH = path.join(ROOT, 'runtime-evidence/M015-S04-native-mission-protocol.json');

function loadAdmissionEvidence(filePath) {
  if (!fs.existsSync(filePath)) {
    const err = new Error(`admission evidence missing at ${path.relative(ROOT, filePath)}`);
    err.code = BLOCKER_CODES.EVIDENCE_MISSING('S04-admission');
    throw err;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (inner) {
    const err = new Error(`admission evidence malformed JSON at ${path.relative(ROOT, filePath)} (${inner.message})`);
    err.code = BLOCKER_CODES.EVIDENCE_MALFORMED('S04-admission');
    throw err;
  }
}

function loadMissionRun(filePath) {
  if (!filePath) return null;
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (inner) {
    const err = new Error(`mission run evidence malformed JSON at ${path.relative(ROOT, filePath)} (${inner.message})`);
    err.code = BLOCKER_CODES.EVIDENCE_MALFORMED('S04-native-mission-run');
    throw err;
  }
}

function evaluateProtocol({ admission, missionRun, options }) {
  const opts = options || {};
  // Admission is "blocked" when the evidence is missing, explicitly has
  // admitted=false, OR its status string is one of the BLOCKED_* variants
  // the T01 admission validator emits. The T01 evidence does not always
  // carry an explicit `admitted` boolean, so we derive it from `status`.
  const admissionStatus = admission && typeof admission.status === 'string' ? admission.status : null;
  const admissionBlocked = !admission
    || admission.admitted === false
    || (admissionStatus && admissionStatus.startsWith('BLOCKED'));
  if (admissionBlocked && !missionRun) {
    return {
      gate_pass: false,
      gates: Object.fromEntries(Object.keys(PROTOCOL_GATE_LABELS).map((k) => [k, false])),
      diagnostics: {
        short_circuit: 'admission_blocked_no_run',
        admission_status: admissionStatus,
      },
      blockers: [
        {
          code: BLOCKER_CODES.ADMISSION_BLOCKER_CARRY_FORWARD,
          agent: null,
          reason: 'S04 admission is blocked; cannot evaluate mission protocol without a run',
        },
      ],
    };
  }
  if (admissionBlocked && missionRun) {
    return {
      gate_pass: false,
      gates: Object.fromEntries(Object.keys(PROTOCOL_GATE_LABELS).map((k) => [k, false])),
      diagnostics: {
        short_circuit: 'admission_blocked_but_run_present',
        admission_status: admissionStatus,
      },
      blockers: [
        {
          code: BLOCKER_CODES.ADMISSION_BLOCKER_CARRY_FORWARD,
          agent: null,
          reason: 'S04 admission is blocked; mission run evidence is present but cannot be promoted to MISSION_PASS',
        },
      ],
    };
  }
  const result = evaluateMissionContract(missionRun, opts);
  const blockers = compileProtocolBlockers(result.diagnostics, result.gates);
  return { gate_pass: result.gate_pass, gates: result.gates, diagnostics: result.diagnostics, blockers };
}

function parseArgs(argv) {
  const args = { admission: ADMISSION_PATH, input: DEFAULT_RUN_PATH, output: OUTPUT_PATH, acceptSafeBlock: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--admission') { args.admission = path.resolve(argv[++i]); }
    else if (a === '--input') { args.input = path.resolve(argv[++i]); }
    else if (a === '--output') { args.output = path.resolve(argv[++i]); }
    else if (a === '--accept-safe-block') { args.acceptSafeBlock = true; }
    else if (a === '--help' || a === '-h') { args.help = true; }
    else { throw new Error(`unknown arg: ${a}`); }
  }
  return args;
}

function writeProtocolEvidence(evidence) {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const scrubbed = scrubEvidence(evidence);
  const serialised = JSON.stringify(scrubbed, null, 2) + '\n';

  // Belt-and-braces refusal — same pattern as T01 admission validator.
  if (UUID_FULL.test(serialised)) {
    throw new Error(`${BLOCKER_CODES.LEAK_UUID} refused write: full UUID detected in protocol output`);
  }
  if (CREDENTIAL_ASSIGNMENT.test(serialised)) {
    throw new Error(`${BLOCKER_CODES.LEAK_CREDENTIAL} refused write: credential assignment detected in protocol output`);
  }
  if (XIAOMI_RE.test(serialised)) {
    throw new Error(`${BLOCKER_CODES.LEAK_XIAOMI} refused write: xiaomi or mimo string detected in protocol output`);
  }

  fs.writeFileSync(OUTPUT_PATH, serialised);
}

function printHelp() {
  process.stdout.write(
    'Usage: validate_m015_s04_native_mission.js [--admission <path>] [--input <path>] [--output <path>] [--accept-safe-block]\n' +
    '\n' +
    'Defaults:\n' +
    `  --admission  ${path.relative(ROOT, ADMISSION_PATH)}\n` +
    `  --input      ${path.relative(ROOT, DEFAULT_RUN_PATH)}\n` +
    `  --output     ${path.relative(ROOT, OUTPUT_PATH)}\n` +
    '\n' +
    '--accept-safe-block lets a CI gate accept admission-blocked + no-run as\n' +
    'MISSION_BLOCKED_SAFE (NOT MISSION_PASS). Use it only when you explicitly\n' +
    'want the validator to record safe-block evidence instead of failing.\n',
  );
}

async function run() {
  const args = parseArgs(process.argv);
  if (args.help) { printHelp(); return; }
  const admission = loadAdmissionEvidence(args.admission);
  const missionRun = loadMissionRun(args.input);
  const options = { acceptSafeBlock: args.acceptSafeBlock, previousMissionKeys: [] };

  const result = evaluateProtocol({ admission, missionRun, options });
  const evidence = buildProtocolEvidence({
    admission,
    missionRun,
    gates: result.gates,
    blockers: result.blockers,
    options,
    paths: { admission: args.admission, missionRun: args.input, output: args.output },
  });
  writeProtocolEvidence(evidence);

  const gateSummary = Object.entries(result.gates)
    .map(([k, v]) => `${k}=${v ? 'p' : 'f'}`)
    .join(' ');
  process.stdout.write(
    `M015_S04_PROTOCOL=${evidence.status} blockers=${result.blockers.length} gates={${gateSummary}} safe_block=${!!args.acceptSafeBlock}\n`,
  );
  // exit codes:
  //   0 = MISSION_PASS
  //   1 = MISSION_FAIL_CLOSED (gate failure OR admission blocked + run present + no --accept-safe-block)
  //   2 = MISSION_BLOCKED_SAFE (admission blocked + --accept-safe-block declared, regardless of run presence)
  //   3 = MISSION_BLOCKED_NO_RUN (admission blocked + run missing/empty + no --accept-safe-block)
  if (evidence.status === 'MISSION_PASS') process.exit(0);
  if (evidence.status === 'MISSION_BLOCKED_SAFE') process.exit(2);
  if (evidence.status === 'MISSION_BLOCKED_NO_RUN') process.exit(3);
  process.exit(1);
}

if (require.main === module) {
  run().catch((error) => {
    try {
      const failure = {
        $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s04-native-mission-protocol.v1.json',
        milestone: 'M015-4o8lfw',
        slice: 'S04',
        task: 'T02',
        generated: new Date().toISOString(),
        status: 'MISSION_FAIL_CLOSED',
        reason: error && error.message ? error.message : String(error),
        blockers: [
          {
            code: BLOCKER_CODES.RUNNER_FAILURE,
            severity: 'blocking',
            agent: null,
            reason: error && error.message ? error.message : String(error),
          },
        ],
        redaction: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false, provider_secret_names: false, synthetic_bos: false },
      };
      fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(failure, null, 2) + '\n');
    } catch (_) { /* best effort */ }
    process.stderr.write(`M015_S04_PROTOCOL_ERROR=${error && error.message ? error.message : error}\n`);
    process.exit(1);
  });
}

module.exports = {
  ROOT,
  ADMISSION_PATH,
  DEFAULT_RUN_PATH,
  OUTPUT_PATH,
  PROTOCOL_GATE_LABELS,
  BLOCKER_CODES,
  loadAdmissionEvidence,
  loadMissionRun,
  evaluateProtocol,
  evaluateMissionContract,
  compileProtocolBlockers,
  buildProtocolEvidence,
  findRedactionLeaks,
  writeProtocolEvidence,
  parseArgs,
};
