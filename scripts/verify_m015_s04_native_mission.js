#!/usr/bin/env node
'use strict';

/**
 * scripts/verify_m015_s04_native_mission.js
 *
 * M015-4o8lfw / S04 / T05 — Independent readback / ledger / autonomy validator.
 *
 * The T02 protocol validator and T04 runner both trust the harness's own
 * summary; T05 explicitly does NOT. Every claim is independently re-derived
 * from raw evidence and the validator's own gate functions. The verdict
 * cannot promote safe-block evidence to MISSION_PASS — that path is blocked
 * by VG6 SAFE_BLOCK_NOT_PROMOTED.
 *
 * Inputs:
 *   --admission <path>   default: runtime-evidence/M015-S04-admission.json
 *   --input    <path>    default: runtime-evidence/M015-S04-native-mission-run.json
 *   --protocol <path>    default: runtime-evidence/M015-S04-native-mission-protocol.json
 *   --output   <path>    default: runtime-evidence/M015-S04-native-mission-validation.json
 *   --accept-safe-block  accept admission block + zero mutations as
 *                        MISSION_FAIL_CLOSED_ADMISSION_BLOCKED (safe-block
 *                        path) with exit 0; without this flag, the same
 *                        verdict exits 1. This flag NEVER promotes to
 *                        MISSION_PASS.
 *
 * Output (always written, even on failure):
 *   runtime-evidence/M015-S04-native-mission-validation.json
 *
 * Verdict field is one of:
 *   - 'MISSION_PASS'                           — all 6 VG gates pass on
 *                                                admitted live evidence
 *   - 'MISSION_FAIL_CLOSED_ADMISSION_BLOCKED'  — admission blocked + zero
 *                                                raw mutations (with or
 *                                                without --accept-safe-block
 *                                                both produce this verdict;
 *                                                only the exit code differs)
 *   - 'MISSION_FAIL_CLOSED_LEDGER_VIOLATION'   — blocked admission but raw
 *                                                mutations present (FAIL-
 *                                                CLOSED safety net breached)
 *   - 'MISSION_FAIL_CLOSED_PROTOCOL_MISMATCH'  — VG1/VG2/VG4 fail (evidence
 *                                                surfaces disagree)
 *   - 'MISSION_FAIL_CLOSED_AUTONOMY_BREACH'    — VG5 fail (synthetic bos
 *                                                tag or xiaomi reuse
 *                                                leaked into raw evidence)
 *   - 'MISSION_FAIL_CLOSED'                   — generic fail-closed
 *   - 'MISSION_VALIDATION_ERROR'              — evidence missing/malformed
 *
 * Exit codes:
 *   0  — MISSION_PASS or MISSION_FAIL_CLOSED_ADMISSION_BLOCKED (with
 *        --accept-safe-block) — safe to consume
 *   1  — MISSION_FAIL_CLOSED_* (without --accept-safe-block, or other
 *        fail-closed verdict)
 *   2  — MISSION_VALIDATION_ERROR (evidence missing/malformed)
 *   3  — MISSION_FAIL_CLOSED_LEDGER_VIOLATION (zero-mutation invariant
 *        breached)
 *   4  — MISSION_VALIDATION_RUNTIME_ERROR (internal validator failure)
 */

const fs = require('fs');
const path = require('path');
const {
  ROOT,
  BLOCKER_CODES,
  VERDICT_CODES,
  VALIDATION_GATE_IDS,
  VALIDATION_GATE_LABELS,
  loadEvidence,
  evaluateValidationContract,
  compileValidationBlockers,
  buildValidationEvidence,
  assertWriteSafe,
} = require('./lib/m015-s04-native-validation-contract');

const ADMISSION_PATH = path.join(ROOT, 'runtime-evidence/M015-S04-admission.json');
const DEFAULT_RUN_PATH = path.join(ROOT, 'runtime-evidence/M015-S04-native-mission-run.json');
const DEFAULT_PROTOCOL_PATH = path.join(ROOT, 'runtime-evidence/M015-S04-native-mission-protocol.json');
const OUTPUT_PATH = path.join(ROOT, 'runtime-evidence/M015-S04-native-mission-validation.json');

// ---------------------------------------------------------------------------
// CLI argument parser — minimal, fail-closed.
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    admission: ADMISSION_PATH,
    input: DEFAULT_RUN_PATH,
    protocol: DEFAULT_PROTOCOL_PATH,
    output: OUTPUT_PATH,
    acceptSafeBlock: false,
    errors: [],
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--admission') {
      const v = argv[++i];
      if (!v) opts.errors.push('--admission requires a value');
      else opts.admission = path.isAbsolute(v) ? v : path.join(ROOT, v);
    } else if (a === '--input') {
      const v = argv[++i];
      if (!v) opts.errors.push('--input requires a value');
      else opts.input = path.isAbsolute(v) ? v : path.join(ROOT, v);
    } else if (a === '--protocol') {
      const v = argv[++i];
      if (!v) opts.errors.push('--protocol requires a value');
      else opts.protocol = path.isAbsolute(v) ? v : path.join(ROOT, v);
    } else if (a === '--output') {
      const v = argv[++i];
      if (!v) opts.errors.push('--output requires a value');
      else opts.output = path.isAbsolute(v) ? v : path.join(ROOT, v);
    } else if (a === '--accept-safe-block') {
      opts.acceptSafeBlock = true;
    } else if (a === '--help' || a === '-h') {
      opts.help = true;
    } else {
      opts.errors.push(`unknown argument: ${a}`);
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Main entry point — used by both CLI and tests.
// ---------------------------------------------------------------------------

function runValidation({ admissionPath, inputPath, protocolPath, outputPath, acceptSafeBlock }) {
  const errors = [];
  let admission, missionRun, protocol;
  try {
    admission = loadEvidence(admissionPath, 'admission');
  } catch (err) {
    errors.push({ kind: 'admission', code: err.code, message: err.message });
  }
  try {
    missionRun = loadEvidence(inputPath, 'mission_run');
  } catch (err) {
    errors.push({ kind: 'mission_run', code: err.code, message: err.message });
  }
  try {
    protocol = loadEvidence(protocolPath, 'protocol');
  } catch (err) {
    errors.push({ kind: 'protocol', code: err.code, message: err.message });
  }
  // Even if some evidence failed to load, still write a bounded
  // validation evidence file with VALIDATION_ERROR verdict.
  if (errors.length > 0) {
    return {
      verdict: VERDICT_CODES.MISSION_VALIDATION_ERROR,
      gates: Object.fromEntries(VALIDATION_GATE_IDS.map((gid) => [gid, false])),
      blockers: errors.map((e) => ({
        code: e.code || BLOCKER_CODES.EVIDENCE_MISSING(e.kind),
        severity: 'blocking',
        agent: null,
        reason: e.message,
      })),
      diagnostics: { evidence_load_errors: errors },
      safe_block_declared: false,
      outputEvidencePath: outputPath,
    };
  }
  // Run contract evaluator
  const evalResult = evaluateValidationContract({
    admission,
    missionRun,
    protocol,
    acceptSafeBlock,
  });
  const blockers = compileValidationBlockers(evalResult.gates, evalResult.diagnostics);
  const evidence = buildValidationEvidence({
    admission,
    missionRun,
    protocol,
    gates: evalResult.gates,
    blockers,
    diagnostics: evalResult.diagnostics,
    paths: {
      admission_evidence: path.relative(ROOT, admission.path),
      mission_run_evidence: path.relative(ROOT, missionRun.path),
      protocol_evidence: path.relative(ROOT, protocol.path),
      output_evidence: path.relative(ROOT, outputPath),
    },
    options: { acceptSafeBlock },
    status: evalResult.status,
  });
  // Belt-and-braces: refuse to write if payload itself would leak redaction
  assertWriteSafe(evidence);
  return {
    verdict: evalResult.status,
    gates: evalResult.gates,
    blockers,
    diagnostics: evalResult.diagnostics,
    safe_block_declared: !!evidence.safe_block_declared,
    outputEvidencePath: outputPath,
    evidence,
  };
}

function writeValidationEvidence({ verdict, gates, blockers, diagnostics, safe_block_declared, outputEvidencePath, evidence }) {
  // Use pre-built evidence when present, else build minimal evidence for error paths
  let payload = evidence;
  if (!payload) {
    payload = {
      $schema: 'https://gsd.local/schemas/runtime-evidence/m015-s04-native-mission-validation.v1.json',
      milestone: 'M015-4o8lfw',
      slice: 'S04',
      task: 'T05',
      generated: new Date().toISOString(),
      status: verdict,
      safe_block_declared,
      gate_labels: VALIDATION_GATE_LABELS,
      gates,
      diagnostics,
      blockers,
      paths: { output_evidence: path.relative(ROOT, outputEvidencePath) },
      redaction: {
        full_ids: false,
        credentials: false,
        xiaomi_endpoint_reuse: safe_block_declared,
        provider_secret_names: '<redacted>',
        synthetic_bos: safe_block_declared,
      },
    };
  }
  assertWriteSafe(payload);
  // Ensure parent dir exists
  fs.mkdirSync(path.dirname(outputEvidencePath), { recursive: true });
  fs.writeFileSync(outputEvidencePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// Exit-code mapping
// ---------------------------------------------------------------------------

function exitCodeFor(verdict, acceptSafeBlock) {
  switch (verdict) {
    case VERDICT_CODES.MISSION_PASS:
      return 0;
    case VERDICT_CODES.MISSION_FAIL_CLOSED_ADMISSION_BLOCKED:
      return acceptSafeBlock ? 0 : 1;
    case VERDICT_CODES.MISSION_FAIL_CLOSED_LEDGER_VIOLATION:
      return 3;
    case VERDICT_CODES.MISSION_VALIDATION_ERROR:
      return 2;
    case VERDICT_CODES.MISSION_FAIL_CLOSED_AUTONOMY_BREACH:
    case VERDICT_CODES.MISSION_FAIL_CLOSED_PROTOCOL_MISMATCH:
    case VERDICT_CODES.MISSION_FAIL_CLOSED:
    default:
      return 1;
  }
}

// ---------------------------------------------------------------------------
// CLI bootstrap
// ---------------------------------------------------------------------------

function runCli(argv) {
  const opts = parseArgs(argv || process.argv);
  if (opts.help) {
    process.stdout.write(
      'verify_m015_s04_native_mission.js — M015/S04/T05 independent validator\n' +
      '  --admission <path>   admission evidence (default: runtime-evidence/M015-S04-admission.json)\n' +
      '  --input    <path>    mission-run evidence (default: runtime-evidence/M015-S04-native-mission-run.json)\n' +
      '  --protocol <path>    protocol evidence (default: runtime-evidence/M015-S04-native-mission-protocol.json)\n' +
      '  --output   <path>    output validation evidence (default: runtime-evidence/M015-S04-native-mission-validation.json)\n' +
      '  --accept-safe-block  exit 0 on MISSION_FAIL_CLOSED_ADMISSION_BLOCKED (never promotes to PASS)\n'
    );
    return 0;
  }
  if (opts.errors.length > 0) {
    for (const e of opts.errors) {
      process.stderr.write(`error: ${e}\n`);
    }
    return 4;
  }
  let result;
  try {
    result = runValidation({
      admissionPath: opts.admission,
      inputPath: opts.input,
      protocolPath: opts.protocol,
      outputPath: opts.output,
      acceptSafeBlock: opts.acceptSafeBlock,
    });
  } catch (err) {
    process.stderr.write(`runtime error: ${err.message}\n`);
    if (err.xiaomiHits || err.syntheticHits) {
      process.stderr.write(`refused write: redaction leak detected\n`);
    }
    return 4;
  }
  try {
    writeValidationEvidence(result);
  } catch (err) {
    process.stderr.write(`write error: ${err.message}\n`);
    return 4;
  }
  // Banner
  const safeFlag = opts.acceptSafeBlock ? ' --accept-safe-block' : '';
  process.stdout.write(
    `M015_S04_VALIDATION=verdict=${result.verdict}` +
    ` admission=${(result.evidence && result.evidence.admission_snapshot && result.evidence.admission_snapshot.status) || 'n/a'}` +
    ` blockers=${result.blockers.length}` +
    ` safe_block_declared=${result.safe_block_declared ? 'true' : 'false'}` +
    ` output=${path.relative(ROOT, opts.output)}` +
    `${safeFlag}\n`
  );
  return exitCodeFor(result.verdict, opts.acceptSafeBlock);
}

if (require.main === module) {
  const code = runCli(process.argv);
  process.exit(code);
}

module.exports = {
  runValidation,
  writeValidationEvidence,
  exitCodeFor,
  parseArgs,
  runCli,
  ADMISSION_PATH,
  DEFAULT_RUN_PATH,
  DEFAULT_PROTOCOL_PATH,
  OUTPUT_PATH,
};