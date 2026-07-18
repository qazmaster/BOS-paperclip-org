#!/usr/bin/env node
'use strict';

/**
 * scripts/build_m015_s06_requirement_promotion.js
 *
 * M015-4o8lfw / S06 / T05 — Mission Level Requirement Promotion and Readback.
 *
 * Reads the four upstream evidence files (T01 preflight, T02 mission run,
 * T03 validation, T04 public UI), evaluates the nine-gate joint proof
 * (JP1-JP9), and produces an evidence-bound readback describing the
 * promotion status of all S06-owned requirements (R019/R022/R023/R026/R030/
 * R031/R032/R035/R037).
 *
 * Promotion gate (from slice plan must-have):
 *   "T05 должен разрешать DB-backed readback/update только если одновременно
 *    подтверждены: свежий ADMITTED preflight, MG1–MG10 MISSION_PASS, VG1–VG6
 *    MISSION_PASS, public UI PASS, пустые leak scans и строгий allowlist
 *    перечисленных R-IDs. Любое расхождение оставляет требования на прежнем
 *    proof tier."
 *
 * Under current disk state (T01=BLOCKED, T02=MISSION_BLOCKED_NO_RUN,
 * T03=MISSION_FAIL_CLOSED_LEDGER_VIOLATION, T04=PASS_AUTH_NO_LEAK but with
 * safe_block=true), joint proof is not all-pass. The runner therefore
 * DENIES promotion and keeps all requirements at their previous tier
 * (DIAGNOSTIC_PROVEN or NOT_PROMOTED), as recorded by S05.
 *
 * Canonical verdict line on stdout:
 *   M015_S06_PROMOTION=verdict=<status> promoted_count=N/M evidence_hashes=9
 *     blockers=K jp_pass=K/9 safe_block=true|false
 *
 * Exit codes:
 *   0 = success (whether promotion granted or denied; the artifact is the
 *       readback). Includes PROMOTION_DENIED_BLOCKED_UPSTREAM (current state).
 *   1 = EVIDENCE_MISSING — upstream file missing required for promotion logic.
 *   2 = RUNNER_FAILURE — exception during main loop.
 */

const fs = require('fs');
const path = require('path');

const data = require('./lib/m015-s06-requirement-promotion-data');
const contract = require('./lib/m015-s06-requirement-promotion-contract');

const {
  CANONICAL_VERDICT,
  VERDICT_CODES,
  PROOF_TIERS,
  OWNED_RID_ALLOWLIST,
  EXCLUDED_CAPABILITY_SURFACES,
  REQUIRED_TOP_LEVEL_KEYS,
  UPSTREAM_PATHS,
  OUTPUT_PATH,
} = data;

const {
  scrubEvidence,
  assertWriteSafe,
  loadJsonSafe,
  computeFileSha256,
  evaluateJointProof,
  derivePreviousTier,
  computeRequirementReadback,
  buildPromotionEvidence,
  deriveVerdictCode,
  deriveVerdictLine,
  exitCodeFor,
  deriveStatus,
} = contract;

// ---------------------------------------------------------------------------
// CLI argument parsing (minimal — defaults only; no path overrides needed)
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    preflight: UPSTREAM_PATHS.preflight,
    missionRun: UPSTREAM_PATHS.missionRun,
    validation: UPSTREAM_PATHS.validation,
    publicUi: UPSTREAM_PATHS.publicUi,
    s05Remediation: UPSTREAM_PATHS.s05Remediation,
    s04Admission: UPSTREAM_PATHS.s04Admission,
    output: OUTPUT_PATH,
    dryRun: false,
    errors: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    // Skip leading non-flag arguments (node binary, script path) so the
    // same code path works for both real process.argv
    // (['node','/path/to/script.js','--flag',...]) and tests
    // (['node','--flag',...]).
    if (!a.startsWith('-') && i < 2) continue;
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq === -1) { opts.errors.push(`unknown argument: ${a}`); continue; }
      const key = a.slice(0, eq);
      const val = a.slice(eq + 1);
      if (key === '--preflight') opts.preflight = val;
      else if (key === '--mission-run') opts.missionRun = val;
      else if (key === '--validation') opts.validation = val;
      else if (key === '--public-ui') opts.publicUi = val;
      else if (key === '--s05') opts.s05Remediation = val;
      else if (key === '--s04') opts.s04Admission = val;
      else if (key === '--output') opts.output = val;
      else opts.errors.push(`unknown argument: ${a}`);
    }
  }
  return opts;
}

function printHelp() {
  process.stdout.write([
    'Usage: node scripts/build_m015_s06_requirement_promotion.js [options]',
    '',
    'Options:',
    '  --preflight=PATH         preflight evidence file',
    '  --mission-run=PATH       mission-run evidence file',
    '  --validation=PATH        validation evidence file',
    '  --public-ui=PATH         public UI proof file',
    '  --s05=PATH               S05 remediation evidence file',
    '  --s04=PATH               S04 admission evidence file',
    '  --output=PATH            output promotion evidence file',
    '  --dry-run                do not write evidence; just print verdict',
    '  -h, --help               show this help',
    '',
    `Default output: ${OUTPUT_PATH}`,
    `Canonical verdict line: ${CANONICAL_VERDICT}=...`,
    '',
  ].join('\n'));
}

// ---------------------------------------------------------------------------
// writeEvidence — applies scrubEvidence and assertWriteSafe (defence-in-depth)
// ---------------------------------------------------------------------------

function writeEvidence(evidence, outputPath) {
  // 1) Scrub the evidence (UUIDs, credentials) BEFORE serialization
  const scrubbed = scrubEvidence(evidence);
  // 2) Defence-in-depth: re-scan serialized payload and refuse if any leak
  //    survived scrubbing.
  assertWriteSafe(scrubbed);
  // 3) Compute this file's hash before write so the persisted file is
  //    self-consistent (the evidence_hashes.this_file.sha256 is updated
  //    post-write in a second pass, but for forensic chain we record the
  //    pre-write state).
  const serialized = JSON.stringify(scrubbed, null, 2) + '\n';
  const absOutput = path.isAbsolute(outputPath) ? outputPath : path.join(contract.ROOT, outputPath);
  fs.mkdirSync(path.dirname(absOutput), { recursive: true });
  fs.writeFileSync(absOutput, serialized);
  // After write, compute hash of persisted file and patch in-memory evidence
  // for callers that want it (we do not re-serialize here — the artifact on
  // disk has pending: true for this_file which is fine because the file's own
  // sha256 can be re-derived by re-running the script).
  return { absolute_path: absOutput, byte_size: serialized.length };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(0);
  const opts = parseArgs(argv);
  if (opts.help) { printHelp(); return; }
  if (opts.errors && opts.errors.length > 0) {
    for (const e of opts.errors) process.stderr.write(`error: ${e}\n`);
    printHelp();
    process.exit(2);
  }

  const generated = new Date().toISOString();

  // Load all 6 upstream evidence files
  const upstream = {
    preflight: loadJsonSafe(opts.preflight),
    missionRun: loadJsonSafe(opts.missionRun),
    validation: loadJsonSafe(opts.validation),
    publicUi: loadJsonSafe(opts.publicUi),
    s05: loadJsonSafe(opts.s05Remediation),
    s04Admission: loadJsonSafe(opts.s04Admission),
  };

  // Determine which files are missing entirely. Per S06 T04 approach
  // (derive safe_block from union of upstream), preflight is treated as a
  // soft-fail signal rather than a hard EVIDENCE_MISSING error: if the
  // preflight runner file is absent on disk (e.g. T01 was last run against
  // a different snapshot), the joint proof evaluator still produces an
  // honest PROMOTION_DENIED_BLOCKED_UPSTREAM verdict via the union logic.
  // mission-run/validation/public-ui are still required because without
  // them there is no upstream evidence to read back from.
  const missingFiles = [];
  for (const [k, ev] of Object.entries(upstream)) {
    if (!ev || !ev.value) {
      if (['missionRun', 'validation', 'publicUi'].includes(k)) {
        missingFiles.push(`${k}=${ev ? ev.path : opts[k]}`);
      }
    }
  }
  if (missingFiles.length > 0) {
    const err = new Error(`evidence missing for promotion logic: ${missingFiles.join(', ')}`);
    err.code = VERDICT_CODES.PROMOTION_DENIED_EVIDENCE_MISSING;
    throw err;
  }

  // 1) Evaluate joint proof (JP1..JP9)
  const jointProof = evaluateJointProof(upstream);

  // 2) Look up previous tier for each owned R-ID from S05 (or defaults)
  const previousTiers = {};
  for (const rid of OWNED_RID_ALLOWLIST) {
    previousTiers[rid] = derivePreviousTier(rid, upstream.s05);
  }

  // 3) Compute per-R-ID readback
  const capabilityConstraints = Array.from(EXCLUDED_CAPABILITY_SURFACES);
  const readback = computeRequirementReadback(upstream, jointProof, previousTiers, capabilityConstraints);

  // 4) Build full evidence object (without verdict/status yet)
  const evidence = buildPromotionEvidence({
    upstream,
    jointProof,
    readback,
    generated,
    capabilityConstraints,
  });

  // 5) Derive verdict code + status
  const verdictCode = deriveVerdictCode(jointProof, []);
  evidence.verdict = verdictCode;
  evidence.verdict_code = verdictCode;
  evidence.status = deriveStatus(verdictCode);

  // 6) Verify required top-level keys are present before write
  for (const k of REQUIRED_TOP_LEVEL_KEYS) {
    if (!(k in evidence)) {
      throw new Error(`evidence missing required top-level key: ${k}`);
    }
  }

  // 7) Write evidence (with scrub + assertWriteSafe defence-in-depth)
  let writeResult = null;
  if (!opts.dryRun) {
    writeResult = writeEvidence(evidence, opts.output);
  }

  // 8) Compute own hash post-write for the audit log line (best-effort)
  const ownHash = opts.dryRun ? null : computeFileSha256(opts.output);

  // 9) Emit canonical verdict line on stdout
  const line = deriveVerdictLine(verdictCode, jointProof, readback);
  process.stdout.write(line + '\n');

  // 10) Diagnostic summary on stderr (best-effort, non-canonical)
  if (writeResult) {
    process.stderr.write(`[M015_S06_T05] wrote ${writeResult.absolute_path} (${writeResult.byte_size} bytes, sha256=${ownHash})\n`);
  } else {
    process.stderr.write(`[M015_S06_T05] dry-run; no evidence written\n`);
  }
  process.stderr.write(`[M015_S06_T05] jp_pass=${jointProof.jp_pass_count}/${jointProof.jp_count} promoted_count=${readback.filter((r) => r.promoted_to_mission).length}/${readback.length} safe_block=${jointProof.safe_block_declared}\n`);
  process.stderr.write(`[M015_S06_T05] blocking_gates=${jointProof.blocking_reasons.map((r) => r.gate).join(',') || '(none)'}\n`);

  // 11) Exit
  process.exit(exitCodeFor(verdictCode));
}

if (require.main === module) {
  main().catch((error) => {
    const verdictCode = error && error.code ? error.code : VERDICT_CODES.PROMOTION_RUNNER_FAILURE;
    const status = deriveStatus(verdictCode);
    const evidence = {
      $schema: data.CANONICAL_SCHEMA,
      milestone: 'M015-4o8lfw',
      slice: 'S06',
      task: 'T05',
      generated: new Date().toISOString(),
      canonical_verdict: CANONICAL_VERDICT,
      verdict: verdictCode,
      verdict_code: verdictCode,
      status,
      reason: error && error.message ? error.message : String(error),
      redaction: { ...data.REDACTION_DISCIPLINE_KEYS },
      paths: { ...UPSTREAM_PATHS, output: OUTPUT_PATH },
    };
    try {
      const scrubbed = scrubEvidence(evidence);
      const serialized = JSON.stringify(scrubbed, null, 2) + '\n';
      const absOutput = path.join(contract.ROOT, OUTPUT_PATH);
      fs.mkdirSync(path.dirname(absOutput), { recursive: true });
      fs.writeFileSync(absOutput, serialized);
    } catch (_) { /* best effort */ }
    process.stderr.write(`M015_S06_PROMOTION_FAIL=${error && error.message ? error.message : String(error)}\n`);
    process.stderr.write(`M015_S06_PROMOTION=verdict=${verdictCode} promoted_count=0/9 evidence_hashes=9 blockers=1 jp_pass=0/9 safe_block=true\n`);
    process.exit(exitCodeFor(verdictCode));
  });
}

module.exports = {
  parseArgs,
  printHelp,
  writeEvidence,
  main,
};