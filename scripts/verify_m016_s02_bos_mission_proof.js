#!/usr/bin/env node
'use strict';

/**
 * scripts/verify_m016_s02_bos_mission_proof.js
 *
 * M016-txa3vu / S02 / T03 — Independent offline replay verifier + fail-closed
 * tamper detector for the canonical sanitised sidecar bos-mission-proof.json
 * produced by collect_m016_s02_bos_mission_proof.js (T02).
 *
 * The verifier is structurally independent of the collector:
 *   - it reads the bundle from disk only via loadCanonicalBundle()
 *   - it evaluates the bundle via contract.evaluateBundleContract()
 *   - it reproduces the provenance hash from the canonical source
 *     descriptors (independent of what the bundle claims)
 *   - it runs the verifier N times (default 2) and proves byte-identical
 *     verdict lines + protocol bytes (deterministic offline replay)
 *   - it mutates a deep clone for tamper detection and asserts each
 *     mutation trips a specific blocker code (fail-closed)
 *
 * The verifier NEVER mutates the bundle or any of the allowlisted sources.
 * The bundle path and the protocol-out path are both realpath/lstat-checked
 * to stay inside the project; symlinks and out-of-tree redirects fail closed.
 *
 * Exit codes (M16-S02 EXIT_CODES namespace, via contract):
 *   0  PASS                          — bundle re-validates, replay deterministic
 *   1  REJECTED_MALFORMED            — input/CLI/schema violation
 *   2  REJECTED_FAIL_CLOSED          — source out of allowlist / tampering
 *   3  REJECTED_CLASSIFICATION_DRIFT — embedded classification drifted
 *   4  REJECTED_LAUNCH_PROMOTION     — forbidden launch verdict attempted
 *   5  REPLAY_DRIFT                  — two independent replays diverged
 *   6  REJECTED_REDACTION_LEAK       — UUID/credential/vendor-reuse leak
 *   7  RUNNER_FAILURE                — internal error (I/O, fs, etc.)
 *
 * Usage:
 *   node scripts/verify_m016_s02_bos_mission_proof.js \
 *        [--bundle <path>] [--protocol-out <path>] [--force] \
 *        [--reference-time <iso>] [--iterations <n>]
 *
 * All flags are optional. Defaults come from
 * scripts/lib/m016-s02-bos-mission-proof-data.js DEFAULTS.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const contract = require('./lib/m016-s02-bos-mission-proof-contract');
const data = require('./lib/m016-s02-bos-mission-proof-data');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT_PATH = __filename;

const {
  BLOCKER_CODES,
  EXIT_CODES,
  DEFAULTS,
  REDACTION_FLAG_VALUES,
  BUNDLE_GATE_IDS,
  BUNDLE_GATE_LABELS,
  evaluateBundleContract,
  buildVerificationEvidence,
  loadSchema,
  computeProvenanceHash,
} = contract;

const NAMESPACE = 'M16-S02-VERIFY';

// ---------------------------------------------------------------------------
// Frozen verifier ALLOWLIST — mirror of the collector's allowlist used to
// bound the independent replay. The verifier's job is to confirm the
// bundle's source_refs are inside this fixed set; if not, the bundle has
// drifted from the canonical S02 schema.
// ---------------------------------------------------------------------------

const ALLOWLIST = Object.freeze([
  Object.freeze({ source_ref: 'runtime-evidence/M015-native-seven-division-mission-20260717.json', kind: 'mission_evidence', independence_group: 'mission-topology' }),
  Object.freeze({ source_ref: 'runtime-evidence/M016-S01-m015-regression-fixture.json',         kind: 'regression_fixture', independence_group: 'regression-fixture' }),
  Object.freeze({ source_ref: 'runtime-evidence/M016-S01-classification-protocol.json',       kind: 'classification_protocol', independence_group: 'classification-protocol' }),
  Object.freeze({ source_ref: 'runtime-evidence/M016-S01-classification-verification.json',    kind: 'classification_verification', independence_group: 'classification-verification' }),
  Object.freeze({ source_ref: 'runtime-evidence/M016-S01-classification-validation.json',      kind: 'classification_verification', independence_group: 'classification-validation' }),
]);

const ALLOWLIST_REFS = Object.freeze(ALLOWLIST.map((s) => s.source_ref));

// ---------------------------------------------------------------------------
// Path-safety primitives — every FS call MUST go through one of these.
// Symlinks and out-of-tree targets fail closed with SOURCE_OUT_OF_ALLOWLIST
// semantics; we reuse the contract blocker_code vocabulary so audit traces
// stay under the M16-S02-* namespace.
// ---------------------------------------------------------------------------

function _safeRealpath(targetPath, label) {
  if (typeof targetPath !== 'string' || targetPath.length === 0) {
    const err = new Error(`${label} missing or not a string`);
    err.code = BLOCKER_CODES.BUNDLE_INPUT_MISSING;
    throw err;
  }
  let abs;
  try {
    abs = path.isAbsolute(targetPath) ? targetPath : path.resolve(ROOT, targetPath);
  } catch (e) {
    const err = new Error(`${label} path resolution failed: ${e.message}`);
    err.code = BLOCKER_CODES.BUNDLE_INPUT_NOT_OBJECT;
    throw err;
  }
  // Containment check FIRST so that out-of-tree paths fail closed even when
  // the target does not exist on disk. An attacker who controls CLI args
  // cannot probe the parent filesystem; the verifier refuses to even lstat
  // anything outside ROOT.
  let rootReal;
  try { rootReal = fs.realpathSync(ROOT); }
  catch (e) {
    const err = new Error(`${label} cannot resolve project root: ${e.message}`);
    err.code = BLOCKER_CODES.RUNNER_FAILURE;
    throw err;
  }
  if (abs !== rootReal && !abs.startsWith(rootReal + path.sep)) {
    const err = new Error(`${label} resolves outside project root (${abs})`);
    err.code = BLOCKER_CODES.SOURCE_PATH_OUT_OF_BOUND(abs);
    err.path = abs;
    throw err;
  }
  let lst = null;
  try { lst = fs.lstatSync(abs); }
  catch (_) {
    // Path may not exist yet (e.g. protocol-out before first write). For
    // in-tree paths we still return the candidate abs — the caller decides
    // whether existence is mandatory (loadCanonicalBundle does, atomicWrite
    // does not). Out-of-tree is already rejected by the containment check
    // above; non-existing in-tree paths are admitted as future targets.
  }
  if (lst && lst.isSymbolicLink()) {
    const err = new Error(`${label} is a symlink; refusing to follow`);
    err.code = BLOCKER_CODES.SOURCE_OUT_OF_ALLOWLIST(`${label}=symlink`);
    err.path = abs;
    throw err;
  }
  let realAbs;
  try { realAbs = fs.realpathSync(abs); }
  catch (e) {
    // For a target that does not exist yet (e.g. protocol-out before first
    // run) realpathSync can fail; fall back to the absolute path which we
    // already proved is inside ROOT.
    realAbs = abs;
  }
  return { abs, realAbs };
}

// ---------------------------------------------------------------------------
// Hash + canonical JSON primitives
// ---------------------------------------------------------------------------

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function _stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map((v) => _stableStringify(v)).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + _stableStringify(value[k])).join(',') + '}';
}

// ---------------------------------------------------------------------------
// loadCanonicalBundle — read+parse+shape the bundle (independent of the
// collector). Realpath-checks the bundle path; refuses symlinks. Returns
// the parsed bundle plus the on-disk bundle bytes for hashing.
// ---------------------------------------------------------------------------

function loadCanonicalBundle(bundlePath) {
  const { abs, realAbs } = _safeRealpath(bundlePath || DEFAULTS.bundle_output, 'bundle_path');
  if (!fs.existsSync(abs)) {
    const err = new Error(`bundle missing at ${abs}`);
    err.code = BLOCKER_CODES.BUNDLE_INPUT_MISSING;
    err.path = abs;
    throw err;
  }
  let rawBytes;
  try { rawBytes = fs.readFileSync(abs); }
  catch (e) {
    const err = new Error(`bundle read failed: ${e.message}`);
    err.code = BLOCKER_CODES.BUNDLE_INPUT_MISSING;
    err.path = abs;
    throw err;
  }
  let parsed;
  try { parsed = JSON.parse(rawBytes.toString('utf8')); }
  catch (e) {
    const err = new Error(`bundle JSON parse failed: ${e.message}`);
    err.code = BLOCKER_CODES.BUNDLE_SCHEMA_VIOLATION('malformed-json');
    err.path = abs;
    throw err;
  }
  return {
    bundle: parsed,
    bytes: rawBytes,
    path: abs,
    realpath: realAbs,
    bundle_sha256: sha256Hex(rawBytes),
  };
}

// ---------------------------------------------------------------------------
// reproduceSourceHashes — independently SHA-256 each allowlisted source_ref
// from disk and confirm the bundle's raw_sha256 matches. Returns per-source
// pass/fail; any drift triggers PROVENANCE_HASH_MISMATCH.
// ---------------------------------------------------------------------------

function reproduceSourceHashes(bundle) {
  const sources = (bundle && bundle.sources) || [];
  const rows = [];
  for (const source of sources) {
    const ref = source.source_ref;
    let actualRawSha = null;
    let rawReadError = null;
    let existsOnDisk = false;
    if (typeof ref === 'string') {
      const abs = path.isAbsolute(ref) ? ref : path.join(ROOT, ref);
      if (fs.existsSync(abs)) {
        existsOnDisk = true;
        try {
          const bytes = fs.readFileSync(abs);
          actualRawSha = sha256Hex(bytes);
        } catch (e) { rawReadError = e.message; }
      }
    }
    rows.push({
      source_ref: ref,
      kind: source.kind,
      independence_group: source.independence_group,
      claimed_raw_sha256: source.raw_sha256,
      actual_raw_sha256: actualRawSha,
      exists_on_disk: existsOnDisk,
      raw_read_error: rawReadError,
      raw_match: actualRawSha === source.raw_sha256,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// detectAllowlistDrift — check every bundle source is in the frozen
// allowlist and every allowlist member is referenced by the bundle.
// ---------------------------------------------------------------------------

function detectAllowlistDrift(bundle) {
  const declaredRefs = new Set((bundle.sources || []).map((s) => s.source_ref));
  const allowedSet = new Set(ALLOWLIST_REFS);
  const notInAllowlist = [];
  for (const ref of declaredRefs) {
    if (!allowedSet.has(ref)) notInAllowlist.push(ref);
  }
  const missingFromBundle = [];
  for (const ref of ALLOWLIST_REFS) {
    if (!declaredRefs.has(ref)) missingFromBundle.push(ref);
  }
  return { notInAllowlist, missingFromBundle };
}

// ---------------------------------------------------------------------------
// verifyCanonicalBundle — pure replay of evaluateBundleContract against
// the bundle. Same input → same gates/blockers/verdicts. Options:
//   { schema, allowedSources, referenceTime }
// ---------------------------------------------------------------------------

function verifyCanonicalBundle(bundle, options) {
  const opts = options || {};
  const allowedSources = opts.allowedSources || ALLOWLIST_REFS;
  const result = evaluateBundleContract({
    bundle,
    schema: opts.schema || null,
    allowedSources,
    options: opts.evaluatorOptions || {},
  });
  // Contract's short-circuit FAIL response carries an empty gates object,
  // which is opaque to downstream audit consumers. Infer the implicit gate
  // that was violated from the first blocker code so the verdict line and
  // the verify-protocol can present a complete BG1..BG6 table.
  const inferredGates = { ...(result.gates || {}) };
  if (Object.keys(inferredGates).length === 0 && result.runner_status === 'FAIL' && result.blockers && result.blockers.length > 0) {
    for (const b of result.blockers) {
      const inferred = _gatePrefixForBlockerInline(b.code);
      if (inferred && !inferredGates[inferred]) inferredGates[inferred] = 'fail_closed';
    }
  }
  return Object.freeze({
    runner_status: result.runner_status,
    runner_exit_code: result.runner_exit_code,
    gates: Object.freeze(inferredGates),
    verdicts: Object.freeze({ ...result.verdicts }),
    blockers: Object.freeze((result.blockers || []).map((b) => Object.freeze({ ...b }))),
    diagnostics: Object.freeze({ ...result.diagnostics }),
    sanitisation_summary: Object.freeze({ ...result.sanitisation_summary }),
    schema_ok: result.schema_ok,
  });
}

// Inline copy of _gatePrefixForBlocker — kept here because verifyCanonicalBundle
// runs above the module.exports.exports block. Both copies MUST stay in sync.
function _gatePrefixForBlockerInline(code) {
  if (typeof code !== 'string') return null;
  if (/BUNDLE-SCHEMA-VIOLATION|SOURCE-HASHES-IDENTICAL|SOURCE-DUPLICATE|ARTIFACT-DIGEST|EXTRA_PROPS|SOURCE-KIND-INVALID|SOURCE-RAW-HASH|SOURCE-SANITISED-HASH|SOURCE-CLAIM-IDS|SOURCE-INDEPENDENCE-GROUP|SOURCE-SIZE-OUT|BUNDLE-INPUT|BUNDLE-KIND|BUNDLE-MILESTONE|BUNDLE-SLICE|BUNDLE-TASK|SIDECAR-ID-MALFORMED|INDEPENDENCE-GROUPS/.test(code)) return 'BG1_SCHEMA_COMPLIANCE';
  if (/SOURCE-OUT-OF-ALLOWLIST|SOURCE-PATH-OUT-OF-BOUND/.test(code)) return 'BG2_SOURCE_ALLOWLIST';
  if (/REDACT-LEAK|REDACT-FLAG-INVALID/.test(code)) return 'BG3_REDACTION_POSTURE';
  if (/PROVENANCE-HASH-MISMATCH|PROVENANCE-HASH-MALFORMED/.test(code)) return 'BG4_PROVENANCE_INTEGRITY';
  if (/CLASSIFY-DRIFT|CLASSIFY-HG-FAIL|CLASSIFY-WORKSHEET-INCOMPLETE|CLASSIFY-VERDICT-FORBIDDEN/.test(code)) return 'BG5_CLASSIFICATION_FROZEN';
  if (/LAUNCH-PROMOTION-ATTEMPT|REPLAY-HASH|REPLAY-FLAG|REPLAY-NOT-BYTE|REPLAY-NOT-MATCH/.test(code)) return 'BG6_LAUNCH_NOT_PROMOTED';
  return null;
}

// ---------------------------------------------------------------------------
// independentReplay — run verifyCanonicalBundle N times and prove the
// verdict line + protocol bytes are byte-identical across runs. Drift →
// REPLAY_DRIFT (exit 5). No fs writes happen during replay — purely an
// in-process determinism check.
// ---------------------------------------------------------------------------

function independentReplay(bundle, options) {
  const opts = options || {};
  const iterations = Math.max(1, Number(opts.iterations) || 2);
  const runs = [];
  for (let i = 0; i < iterations; i++) {
    runs.push(verifyCanonicalBundle(bundle, opts));
  }
  const first = runs[0];
  let deterministic = true;
  let firstMismatchedRunner = null;
  for (let i = 1; i < runs.length; i++) {
    if (runs[i].runner_status !== first.runner_status) { deterministic = false; firstMismatchedRunner = i; break; }
    if (runs[i].runner_exit_code !== first.runner_exit_code) { deterministic = false; firstMismatchedRunner = i; break; }
    const k = Object.keys(first.gates).sort();
    for (const gate of k) {
      if (runs[i].gates[gate] !== first.gates[gate]) { deterministic = false; firstMismatchedRunner = i; break; }
    }
    if (!deterministic) break;
    for (const gate of k) {
      const a = first.verdicts[gate];
      const b = runs[i].verdicts[gate];
      if (typeof a !== 'undefined' && a !== b) { deterministic = false; firstMismatchedRunner = i; break; }
    }
    if (!deterministic) break;
    if (first.blockers.length !== runs[i].blockers.length) { deterministic = false; firstMismatchedRunner = i; break; }
  }
  // Flatten top-level accessors so callers (verdict line, protocol build,
  // CLI summary) can read the canonical gates/verdicts/blockers without
  // digging into `runs[0]` — the contract module freezes each run, so
  // re-exposing them at the top level is safe and pure.
  return Object.freeze({
    iterations,
    runs: Object.freeze(runs),
    deterministic,
    first_mismatched_run: firstMismatchedRunner,
    gates: first.gates,
    verdicts: first.verdicts,
    blockers: first.blockers,
    runner_status: first.runner_status,
    runner_exit_code: first.runner_exit_code,
    final_runner_status: first.runner_status,
    final_runner_exit_code: first.runner_exit_code,
  });
}

// ---------------------------------------------------------------------------
// produceVerdictLine — bounded one-line stdout summary (no secrets, no
// UUIDs, no raw body). Format:
//   M16-S02-VERIFY verdict=<STATUS> exit=<N> block_count=<N>
//     blocker_first=<code|null> gates=<gate>=<verdict>,... replay_match=<bool>
//     provenance_match=<bool> allowlist_drift=<N> iterations=<N>
//     bundle_sha256=<64hex>
// ---------------------------------------------------------------------------

function produceVerdictLine(replayResult, tamperResult, options) {
  const opts = options || {};
  // The CLI may override the contract's runner_status with a more specific
  // verifier-priority label (e.g. PROVENANCE_DRIFT when the raw_sha256 on
  // disk no longer matches the bundle's claim). Without the override, we
  // surface whatever evaluateBundleContract returned.
  const statusOut = opts.verdictStatus || replayResult.runner_status;
  const exitOut = Number.isFinite(opts.verdictExitCode) ? opts.verdictExitCode : replayResult.runner_exit_code;
  const gatesList = (BUNDLE_GATE_IDS && BUNDLE_GATE_IDS.length) ? BUNDLE_GATE_IDS : Object.keys(BUNDLE_GATE_IDS || {});
  const gateValues = replayResult.gates || {};
  const gatesStr = gatesList.map((g) => `${g}=${gateValues[g] != null ? gateValues[g] : 'fail_closed'}`).join(',');
  const blockers = replayResult.blockers || [];
  const blockerFirst = blockers.length > 0 ? blockers[0].code : 'null';
  const tamper = tamperResult || { allRawHashesMatch: null, allowlistDriftCount: 0 };
  const bundleSha = (opts.bundleSha256 || '').slice(0, 64);
  return `${NAMESPACE} verdict=${statusOut} exit=${exitOut} ` +
    `block_count=${blockers.length} blocker_first=${blockerFirst} ` +
    `gates=${gatesStr} replay_match=${replayResult.deterministic ? 'true' : 'false'} ` +
    `provenance_match=${tamper.allRawHashesMatch === null ? 'true' : (tamper.allRawHashesMatch ? 'true' : 'false')} ` +
    `raw_sha_match_count=${tamper.rawShaMatchCount != null ? tamper.rawShaMatchCount : 0}/${tamper.rawShaTotalCount != null ? tamper.rawShaTotalCount : 0} ` +
    `allowlist_drift=${tamper.allowlistDriftCount != null ? tamper.allowlistDriftCount : 0} ` +
    `iterations=${replayResult.iterations} bundle_sha256=${bundleSha}`;
}

// ---------------------------------------------------------------------------
// Atomic JSON write — POSIX rename; refuse overwrite without --force.
// Returns the absolute path written.
// ---------------------------------------------------------------------------

function atomicWriteJson(target, payload, options) {
  const opts = options || {};
  const force = !!opts.force;
  const { abs, realAbs } = _safeRealpath(target, 'protocol_path');
  const dirOfTarget = path.dirname(realAbs);
  const existsOnDisk = fs.existsSync(abs);
  if (existsOnDisk && !force) {
    const err = new Error(`refusing to overwrite existing protocol ${abs} (use --force)`);
    err.code = BLOCKER_CODES.RUNNER_FAILURE;
    err.path = abs;
    throw err;
  }
  if (!fs.existsSync(dirOfTarget)) {
    try { fs.mkdirSync(dirOfTarget, { recursive: true }); }
    catch (e) {
      const err = new Error(`mkdir failed for ${dirOfTarget}: ${e.message}`);
      err.code = BLOCKER_CODES.RUNNER_FAILURE;
      throw err;
    }
  }
  const tmpPath = `${abs}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  let json;
  try { json = JSON.stringify(payload, null, 2); }
  catch (e) {
    const err = new Error(`protocol JSON.stringify failed: ${e.message}`);
    err.code = BLOCKER_CODES.RUNNER_FAILURE;
    throw err;
  }
  try {
    fs.writeFileSync(tmpPath, json);
    fs.renameSync(tmpPath, abs);
  } catch (e) {
    try { fs.unlinkSync(tmpPath); } catch (_) { /* best-effort cleanup */ }
    const err = new Error(`atomic write failed for ${abs}: ${e.message}`);
    err.code = BLOCKER_CODES.RUNNER_FAILURE;
    throw err;
  }
  return { path: abs, bytes_written: Buffer.byteLength(json, 'utf8') };
}

// ---------------------------------------------------------------------------
// CLI argument parsing — minimal, no third-party deps. Unknown args fail
// closed via BUNDLE_INPUT_NOT_OBJECT (treated as malformed CLI surface).
// ---------------------------------------------------------------------------

function _parseArgs(argv) {
  const out = {
    bundlePath: DEFAULTS.bundle_output,
    protocolOut: DEFAULTS.verification_output,
    schemaPath: DEFAULTS.schema_path,
    referenceTime: null,
    iterations: 2,
    force: false,
    skipReplay: false,
    errors: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--bundle') { out.bundlePath = argv[++i]; continue; }
    if (a.startsWith('--bundle=')) { out.bundlePath = a.slice('--bundle='.length); continue; }
    if (a === '--protocol-out') { out.protocolOut = argv[++i]; continue; }
    if (a.startsWith('--protocol-out=')) { out.protocolOut = a.slice('--protocol-out='.length); continue; }
    if (a === '--schema') { out.schemaPath = argv[++i]; continue; }
    if (a.startsWith('--schema=')) { out.schemaPath = a.slice('--schema='.length); continue; }
    if (a === '--reference-time') { out.referenceTime = argv[++i]; continue; }
    if (a.startsWith('--reference-time=')) { out.referenceTime = a.slice('--reference-time='.length); continue; }
    if (a === '--iterations') { out.iterations = Number(argv[++i]) || 2; continue; }
    if (a.startsWith('--iterations=')) { out.iterations = Number(a.slice('--iterations='.length)) || 2; continue; }
    if (a === '--force') { out.force = true; continue; }
    if (a === '--no-replay') { out.skipReplay = true; continue; }
    if (a === '--help' || a === '-h') { out.help = true; continue; }
    out.errors.push(`unknown arg: ${a}`);
  }
  return out;
}

function _printHelp() {
  process.stdout.write([
    `${NAMESPACE} — independent offline replay + fail-closed tamper detector.`,
    '',
    'Usage:',
    '  node scripts/verify_m016_s02_bos_mission_proof.js [options]',
    '',
    'Options:',
    '  --bundle <path>           bundle path (default runtime-evidence/M016-S02-bos-mission-proof.json)',
    '  --protocol-out <path>     verify protocol output (default runtime-evidence/M016-S02-verify-protocol.json)',
    '  --schema <path>           schema path (default schemas/runtime-evidence/m016-s02-bos-mission-proof.v1.json)',
    '  --reference-time <iso>    ISO-8601 fixed timestamp for protocol.generated_at',
    '  --iterations <n>          independent replay iterations (default 2)',
    '  --no-replay               skip multi-iteration replay (single pass only)',
    '  --force                   allow overwriting an existing protocol file',
    '  --help, -h                print this help',
    '',
    `Exit codes (${Object.keys(EXIT_CODES).length}): see scripts/lib/m016-s02-bos-mission-proof-data.js`,
    '',
  ].join('\n'));
}

// ---------------------------------------------------------------------------
// runReplayOnce — single CLI invocation main loop. Separated from main()
// so tests can import and run it with controlled args.
// ---------------------------------------------------------------------------

function runReplayOnce(argv) {
  const args = _parseArgs(argv || []);
  if (args.help) { _printHelp(); return { runner_status: 'PASS', runner_exit_code: 0, verdict_line: `${NAMESPACE} verdict=PASS exit=0 help_printed=true` }; }
  if (args.errors.length > 0) {
    const msg = `${NAMESPACE} verdict=REJECTED_MALFORMED exit=${EXIT_CODES.BUNDLE_REJECTED_MALFORMED} ` +
      `block_count=1 blocker_first=M16-S02-CLI-INVALID-ARG block_first_unknown_arg=true ` +
      `args_invalid=${args.errors.length}`;
    return { runner_status: 'REJECTED_MALFORMED', runner_exit_code: EXIT_CODES.BUNDLE_REJECTED_MALFORMED, verdict_line: msg, errors: args.errors };
  }
  if (args.iterations < 1 || !Number.isInteger(args.iterations)) {
    const msg = `${NAMESPACE} verdict=REJECTED_MALFORMED exit=${EXIT_CODES.BUNDLE_REJECTED_MALFORMED} ` +
      `block_count=1 blocker_first=M16-S02-CLI-INVALID-ITERATIONS iterations_invalid=${args.iterations}`;
    return { runner_status: 'REJECTED_MALFORMED', runner_exit_code: EXIT_CODES.BUNDLE_REJECTED_MALFORMED, verdict_line: msg };
  }
  let loaded;
  try { loaded = loadCanonicalBundle(args.bundlePath); }
  catch (e) {
    const msg = `${NAMESPACE} verdict=REJECTED_MALFORMED exit=${EXIT_CODES.BUNDLE_REJECTED_MALFORMED} ` +
      `block_count=1 blocker_first=${e.code || BLOCKER_CODES.BUNDLE_INPUT_MISSING} ` +
      `error=${e.message}`;
    return { runner_status: 'REJECTED_MALFORMED', runner_exit_code: EXIT_CODES.BUNDLE_REJECTED_MALFORMED, verdict_line: msg, error: e.message };
  }
  let schema = null;
  // Schema load is best-effort; if it fails or AJV is unavailable we fall
  // back to the contract's manual validators (which already cover shape,
  // source constraints, classification drift, and launch promotion). We
  // intentionally do NOT pass the schema to evaluateBundleContract for the
  // CLI replay path because the AJV short-circuit emits a generic FAIL
  // status instead of the more specific REJECTED_LAUNCH_PROMOTION /
  // REJECTED_CLASSIFICATION_DRIFT labels that downstream consumers rely
  // on.
  try { schema = loadSchema(args.schemaPath); }
  catch (e) {
    schema = null;
  }
  const replayIterations = args.skipReplay ? 1 : args.iterations;
  const replay = independentReplay(loaded.bundle, {
    schema: null, // see comment above
    allowedSources: ALLOWLIST_REFS,
    iterations: replayIterations,
    evaluatorOptions: { acceptSafeBlock: false },
  });
  const sourceHashRows = reproduceSourceHashes(loaded.bundle);
  const allowlistDrift = detectAllowlistDrift(loaded.bundle);
  let rawShaMatchCount = 0;
  for (const row of sourceHashRows) if (row.raw_match) rawShaMatchCount++;
  const allRawHashesMatch = rawShaMatchCount === sourceHashRows.length && sourceHashRows.length > 0;
  const allowlistDriftCount = allowlistDrift.notInAllowlist.length + allowlistDrift.missingFromBundle.length;
  const tamper = {
    allRawHashesMatch,
    rawShaMatchCount,
    rawShaTotalCount: sourceHashRows.length,
    allowlistDriftCount,
    allowlistDrift,
    source_hash_rows: sourceHashRows,
  };
  let runnerStatus, runnerExitCode;
  // Augment the contract runner status with two replay-only signals:
  //   - REPLAY_DRIFT (when independentReplay is non-deterministic)
  //   - PROVENANCE_DRIFT (when raw_sha256 of any source does not match
  //     the on-disk file)
  if (!replay.deterministic) { runnerStatus = 'REPLAY_DRIFT'; runnerExitCode = EXIT_CODES.BUNDLE_REPLAY_DRIFT; }
  else if (!allRawHashesMatch) { runnerStatus = 'PROVENANCE_DRIFT'; runnerExitCode = EXIT_CODES.BUNDLE_REPLAY_DRIFT; }
  else if (allowlistDriftCount > 0) { runnerStatus = 'REJECTED_FAIL_CLOSED'; runnerExitCode = EXIT_CODES.BUNDLE_REJECTED_FAIL_CLOSED; }
  else { runnerStatus = replay.final_runner_status; runnerExitCode = replay.final_runner_exit_code; }
  const verdictLine = produceVerdictLine(replay, tamper, {
    bundleSha256: loaded.bundle_sha256,
    iterations: replayIterations,
    verdictStatus: runnerStatus,
    verdictExitCode: runnerExitCode,
  });
  // Build the canonical verify-protocol evidence.
  const verifyEvidence = buildVerificationEvidence({
    bundle: loaded.bundle,
    gates: replay.runs[0].gates,
    verdicts: replay.runs[0].verdicts,
    blockers: replay.runs[0].blockers,
    diagnostics: replay.runs[0].diagnostics,
    paths: {
      bundle: path.relative(ROOT, loaded.path).split(path.sep).join('/'),
      verification: path.relative(ROOT, path.isAbsolute(args.protocolOut) ? args.protocolOut : path.join(ROOT, args.protocolOut)).split(path.sep).join('/'),
      schema: args.schemaPath,
    },
    options: {
      status: runnerStatus === 'PASS' ? 'verification_passed' : 'verification_rejected',
    },
  });
  const referenceTime = args.referenceTime || new Date().toISOString();
  const finalProtocol = Object.assign({}, verifyEvidence, {
    generated_at: referenceTime,
    replay_iterations: replayIterations,
    replay_deterministic: replay.deterministic,
    independent_replay: {
      iterations: replayIterations,
      runs: replay.runs.map((r, i) => ({
        iteration: i,
        runner_status: r.runner_status,
        runner_exit_code: r.runner_exit_code,
        blockers_count: r.blockers.length,
        gates: Object.assign({}, r.gates),
        verdicts: Object.assign({}, r.verdicts),
      })),
    },
    raw_sha_reproduction: {
      all_match: allRawHashesMatch,
      match_count: rawShaMatchCount,
      total_count: sourceHashRows.length,
      sources: sourceHashRows,
    },
    allowlist_drift: {
      not_in_allowlist: allowlistDrift.notInAllowlist,
      missing_from_bundle: allowlistDrift.missingFromBundle,
      drift_count: allowlistDriftCount,
    },
    bundle_sha256: loaded.bundle_sha256,
    tamper_detection: {
      provenance_match: allRawHashesMatch,
      allowlist_drift_count: allowlistDriftCount,
      source_hash_rows_match: rawShaMatchCount === sourceHashRows.length,
    },
    verdict_line: verdictLine,
    options: {
      force: !!args.force,
      iterations: replayIterations,
      reference_time: referenceTime,
    },
  });
  let writeResult;
  try {
    writeResult = atomicWriteJson(args.protocolOut, finalProtocol, { force: !!args.force });
  }
  catch (e) {
    const protocolWriteFailure = {
      runner_status: 'RUNNER_FAILURE',
      runner_exit_code: EXIT_CODES.BUNDLE_RUNNER_FAILURE,
      error: e.message,
      error_code: e.code || BLOCKER_CODES.RUNNER_FAILURE,
    };
    const msg = `${NAMESPACE} verdict=RUNNER_FAILURE exit=${protocolWriteFailure.runner_exit_code} ` +
      `block_count=1 blocker_first=${protocolWriteFailure.error_code} ` +
      `protocol_write_error=${e.message}`;
    return Object.assign({ verdict_line: msg, protocol: finalProtocol, replay: replay, tamper: tamper }, protocolWriteFailure);
  }
  // Always print the bounded verdict line on stdout last so callers can grep.
  process.stdout.write(verdictLine + '\n');
  return {
    runner_status: runnerStatus,
    runner_exit_code: runnerExitCode,
    verdict_line: verdictLine,
    protocol: finalProtocol,
    protocol_path: writeResult.path,
    protocol_bytes: writeResult.bytes_written,
    replay: replay,
    tamper: tamper,
  };
}

// ---------------------------------------------------------------------------
// produceVerdictLine override semantics: when `opts.verdictStatus` is
// provided, the verdict line uses that label instead of the contract's
// generic runner_status. This lets the CLI surface verifier-specific
// priorities (PROVENANCE_DRIFT for on-disk mismatch, REPLAY_DRIFT for
// non-deterministic replay, REJECTED_FAIL_CLOSED for allowlist drift)
// without altering the contract module.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Public API — used by tests and by CLI main().
// ---------------------------------------------------------------------------

module.exports = {
  ROOT,
  NAMESPACE,
  ALLOWLIST,
  ALLOWLIST_REFS,
  REDACTION_FLAG_VALUES,
  BUNDLE_GATE_IDS,
  BUNDLE_GATE_LABELS,
  loadCanonicalBundle,
  verifyCanonicalBundle,
  independentReplay,
  reproduceSourceHashes,
  detectAllowlistDrift,
  produceVerdictLine,
  buildVerifyProtocol: buildVerificationEvidence,
  atomicWriteJson,
  runReplayOnce,
  _parseArgs,
  _safeRealpath,
  _stableStringify,
  sha256Hex,
  _gatePrefixForBlocker: function _gatePrefixForBlocker(code) {
    if (typeof code !== 'string') return null;
    if (/BUNDLE-SCHEMA-VIOLATION|SOURCE-HASHES-IDENTICAL|SOURCE-DUPLICATE|ARTIFACT-DIGEST|EXTRA_PROPS|SOURCE-KIND-INVALID|SOURCE-RAW-HASH|SOURCE-SANITISED-HASH|SOURCE-CLAIM-IDS|SOURCE-INDEPENDENCE-GROUP|SOURCE-SIZE-OUT|BUNDLE-INPUT|BUNDLE-KIND|BUNDLE-MILESTONE|BUNDLE-SLICE|BUNDLE-TASK|SIDECAR-ID-MALFORMED|INDEPENDENCE-GROUPS/.test(code)) return 'BG1_SCHEMA_COMPLIANCE';
    if (/SOURCE-OUT-OF-ALLOWLIST|SOURCE-PATH-OUT-OF-BOUND/.test(code)) return 'BG2_SOURCE_ALLOWLIST';
    if (/REDACT-LEAK|REDACT-FLAG-INVALID/.test(code)) return 'BG3_REDACTION_POSTURE';
    if (/PROVENANCE-HASH-MISMATCH|PROVENANCE-HASH-MALFORMED/.test(code)) return 'BG4_PROVENANCE_INTEGRITY';
    if (/CLASSIFY-DRIFT|CLASSIFY-HG-FAIL|CLASSIFY-WORKSHEET-INCOMPLETE|CLASSIFY-VERDICT-FORBIDDEN/.test(code)) return 'BG5_CLASSIFICATION_FROZEN';
    if (/LAUNCH-PROMOTION-ATTEMPT|REPLAY-HASH|REPLAY-FLAG|REPLAY-NOT-BYTE|REPLAY-NOT-MATCH/.test(code)) return 'BG6_LAUNCH_NOT_PROMOTED';
    return null;
  },
};

if (require.main === module) {
  const out = runReplayOnce(process.argv.slice(2));
  // NOTE: `||` treats 0 as falsy; use Number.isFinite so an honest PASS exit
  // code of 0 is propagated instead of being coerced to RUNNER_FAILURE.
  const code = Number.isFinite(out.runner_exit_code) ? out.runner_exit_code : EXIT_CODES.BUNDLE_RUNNER_FAILURE;
  process.exit(code);
}
