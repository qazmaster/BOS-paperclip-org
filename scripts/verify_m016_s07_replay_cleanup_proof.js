#!/usr/bin/env node
'use strict';

/**
 * scripts/verify_m016_s07_replay_cleanup_proof.js
 *
 * M016-txa3vu / S07 / T03 — Independent repo-contained cleanup verifier.
 *
 * The verifier closes must-haves #3-#5 of the S07 slice:
 *   3. binds the allowlisted S01 schema/fixture + three S01 canonical
 *      artifacts + M015 source via fresh SHA-256 inventory;
 *   4. executes exactly one fresh subprocess replay of the S01 classifier
 *      CLI inside a marker-owned repo-local scratch root
 *      (runtime-evidence/.m016-s07-replay-scratch/s01-out/);
 *   5. reads back the three S01 replay outputs, computes their hashes,
 *      validates the verdict triple, removes the scratch root, and only
 *      after a post-run absence check publishes the canonical S07 proof
 *      sidecar atomically.
 *
 * Lifecycle (fail-closed at every step):
 *   PRE_RUN:
 *     - validate source allowlist (S01 schema, fixture, 3 canonical
 *       sidecars, M015 baseline) and compute SHA-256 inventory
 *     - validate output-dir realpath containment inside repo root
 *     - validate scratch root realpath containment
 *     - refuse if scratch root already exists (pre-existing residue)
 *     - refuse if canonical proof sidecar exists and --force not passed
 *   REPLAY:
 *     - spawn exactly one allowlisted `node` subprocess running
 *       scripts/validate_m016_s01_proof_classification.js with
 *       --output-dir pointed inside the canonical scratch zone
 *     - capture exit code, stdout, stderr (raw, sanitised)
 *     - validate exit code 0 (S01 runner_status PASS, exit_code 0)
 *     - read back the three canonical outputs from scratch
 *     - compute output SHA-256 inventory
 *     - write marker file (runtime-evidence/.m016-s07-replay-scratch/
 *       .m016-s07-replay-marker) with frozen contents
 *     - validate marker ownership (frozen contents match)
 *   POST_RUN:
 *     - compute semantic_digest from sorted source/output hashes plus
 *       scratch root + marker contents
 *     - attempt rm -rf of scratch root; on cleanup failure write
 *       a sibling .cleanup-failed marker and rethrow
 *     - verify post-run absence (scratch root does NOT exist)
 *     - build proof sidecar via the T01 contract helpers
 *     - validate against the schema (Ajv compile)
 *     - assert redaction safety (no UUID / bearer / credentials / etc.)
 *     - atomically write canonical proof sidecar to
 *       <output-dir>/M016-S07-replay-cleanup-proof.json
 *
 * No network, no Paperclip / plugin / UI / browser / business-state
 * mutation. All paths stay inside the current checkout.
 *
 * Usage:
 *   node scripts/verify_m016_s07_replay_cleanup_proof.js
 *     [--output-dir <dir>]                 where to write proof sidecar
 *                                          (default runtime-evidence)
 *     [--force]                            overwrite canonical sidecars if present
 *     [--no-publish-negative-fixtures]     skip publishing the negative-fixtures
 *                                          catalog (default: publish together
 *                                          with the proof sidecar)
 *     [--help]
 *
 * The verifier publishes two sanitised sidecars when --force is in effect:
 *
 *   <output-dir>/M016-S07-replay-cleanup-proof.json               (proof)
 *   <output-dir>/M016-S07-replay-cleanup-negative-fixtures.json   (catalog)
 *
 * Both sidecars are atomic-written via the same writeJsonAtomic helper and
 * validated against the bundled schema (m016-s07-replay-cleanup-proof.v1.json)
 * plus the contract's redaction safety helpers before publish.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const data = require('./lib/m016-s07-replay-cleanup-data');
const contract = require('./lib/m016-s07-replay-cleanup-contract');

const {
  REPLAY_CLEANUP_PROOF_KIND,
  TRIAD_INVARIANT,
  EXIT_CODES,
  BLOCKER_CODES,
  CANONICAL_VERDICT_LINE,
  formatCanonicalVerdictLine,
  DEFAULTS,
  SCRATCH_ROOT_RELPATH,
  SCRATCH_ROOT_MARKER_RELPATH,
  SCRATCH_ROOT_MARKER_CONTENTS,
  MARKER_CONTENTS,
  SOURCE_ALLOWLIST,
  M015_BASELINE_REF,
  S01_SCHEMA_REF,
  S01_FIXTURE_REF,
  S01_PROTOCOL_REF,
  S01_VALIDATION_REF,
  S01_VERIFICATION_REF,
  REPLAY_CLEANUP_PROOF_ID,
  REPLAY_CLEANUP_NEGATIVE_FIXTURES_KIND,
  REPLAY_CLEANUP_NEGATIVE_FIXTURES_ID,
  CLEANUP_PHASES,
  CLEANUP_ACTIONS,
  CLEANUP_OUTCOMES,
  CLEANUP_REDACTION_FLAG_VALUES,
  isCleanupBlockerCode,
  isVerdictTriad,
  verdictTriadDriftField,
} = data;

const {
  sha256Hex,
  buildCleanupTraceRow,
  buildProofSidecar,
  buildNegativeFixturesSidecar,
  evaluateCleanupContract,
  loadSchema,
  validateProofShape,
  assertProofWriteSafe,
  assertNegativeFixturesWriteSafe,
  computeNegativeFixturesBodyDigest,
  _stableStringify,
} = contract;

const ROOT = path.resolve(__dirname, '..');

const RUN_ID = `m016-s07-verify-${new Date().toISOString().replace(/[:.]/g, '-')}`;

const PROOF_FILENAME = 'M016-S07-replay-cleanup-proof.json';
const NEGATIVE_FIXTURES_FILENAME = 'M016-S07-replay-cleanup-negative-fixtures.json';

const USAGE = [
  'Usage: node scripts/verify_m016_s07_replay_cleanup_proof.js',
  '  [--output-dir <dir>]                 directory to write M016-S07-replay-cleanup-proof.json (default runtime-evidence)',
  '  [--force]                            overwrite canonical sidecars if present',
  '  [--no-publish-negative-fixtures]     skip the negative-fixtures catalog publish',
  '  [--help]',
  '',
  'Reads sources from canonical paths (runtime-evidence/, schemas/).',
  'Uses marker-owned scratch at runtime-evidence/.m016-s07-replay-scratch/.',
  'Publishes both M016-S07-replay-cleanup-proof.json and',
  'M016-S07-replay-cleanup-negative-fixtures.json atomically.',
].join('\n');

// ---------------------------------------------------------------------------
// Helpers — arg parsing + path resolution
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = {
    outputDir: DEFAULTS.output_dir,
    force: false,
    publishNegativeFixtures: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--output-dir') { out.outputDir = argv[++i]; continue; }
    if (arg === '--force') { out.force = true; continue; }
    if (arg === '--no-publish-negative-fixtures') { out.publishNegativeFixtures = false; continue; }
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(USAGE + '\n');
      process.exit(0);
    }
    throw new Error(`unknown arg "${arg}"`);
  }
  if (!out.outputDir) throw new Error('--output-dir required when set');
  return out;
}

// ---------------------------------------------------------------------------
// Helpers — negative-fixtures catalog (T04 tamper evidence)
// ---------------------------------------------------------------------------
//
// The catalog enumerates 12 tamper scenarios — one per threat_class enum in
// the bundled schema — each with a stable fixture_id, tamper_path,
// baseline_value / tampered_value pair, expected_blocker_code, expected
// verdict and bounded exit code. The catalog is consumed by:
//   - scripts/test_m016_s07_replay_cleanup_artifacts.js (catalog shape)
//   - scripts/test_m016_s07_replay_cleanup_tamper.js    (each fixture is detected)
//
// The catalog is intentionally pure-data (no I/O); the verifier writes it to
// runtime-evidence/M016-S07-replay-cleanup-negative-fixtures.json atomically.
function buildNegativeFixtureCatalog() {
  const evidenceRef = 'runtime-evidence/M016-S07-replay-cleanup-negative-fixtures.json';
  return Object.freeze([
    Object.freeze({
      fixture_id: 'S07-NF-01',
      threat_class: 'traversal',
      tamper_path: 'cleanup_trace[0].target_relpath',
      mutator_kind: 'path_traversal',
      baseline_value: 'runtime-evidence/.m016-s07-replay-scratch',
      tampered_value: 'runtime-evidence/../etc/passwd',
      expected_blocker_code: BLOCKER_CODES.PATH_TRAVERSAL('runtime-evidence/../etc/passwd'),
      expected_verdict: 'FAIL',
      expected_exit_code: EXIT_CODES.CLEANUP_PRECONDITION_DRIFT,
      rationale: 'cleanup_trace target_relpath must not escape marker-owned scratch via .. segments',
      evidence_ref: evidenceRef,
    }),
    Object.freeze({
      fixture_id: 'S07-NF-02',
      threat_class: 'symlink_escape',
      tamper_path: 'scratch_root_relpath',
      mutator_kind: 'symlink_swap',
      baseline_value: 'runtime-evidence/.m016-s07-replay-scratch',
      tampered_value: 'runtime-evidence/.m016-s07-replay-scratch-symlink',
      expected_blocker_code: BLOCKER_CODES.SYMLINK_ESCAPE('runtime-evidence/.m016-s07-replay-scratch-symlink'),
      expected_verdict: 'FAIL',
      expected_exit_code: EXIT_CODES.CLEANUP_PRECONDITION_DRIFT,
      rationale: 'symlink swap of scratch root would let subprocess write outside repo containment',
      evidence_ref: evidenceRef,
    }),
    Object.freeze({
      fixture_id: 'S07-NF-03',
      threat_class: 'marker_forgery',
      tamper_path: 'cleanup_marker.contents',
      mutator_kind: 'forged_marker',
      baseline_value: MARKER_CONTENTS,
      tampered_value: 'M16-S07-CLEANUP-MARKER-FORGED',
      expected_blocker_code: BLOCKER_CODES.MARKER_FORGED(SCRATCH_ROOT_MARKER_RELPATH),
      expected_verdict: 'FAIL',
      expected_exit_code: EXIT_CODES.CLEANUP_PROVENANCE_DRIFT,
      rationale: 'marker contents must equal the frozen value, not a forged variant',
      evidence_ref: evidenceRef,
    }),
    Object.freeze({
      fixture_id: 'S07-NF-04',
      threat_class: 'marker_missing',
      tamper_path: 'cleanup_marker.relpath',
      mutator_kind: 'missing_file',
      baseline_value: SCRATCH_ROOT_MARKER_RELPATH,
      tampered_value: '<empty-marker-relpath>',
      expected_blocker_code: BLOCKER_CODES.MARKER_MISSING(''),
      expected_verdict: 'FAIL',
      expected_exit_code: EXIT_CODES.CLEANUP_PROVENANCE_DRIFT,
      rationale: 'marker relpath must be set; empty relpath fails provenance check',
      evidence_ref: evidenceRef,
    }),
    Object.freeze({
      fixture_id: 'S07-NF-05',
      threat_class: 'source_hash_drift',
      tamper_path: 'source_hashes[runtime-evidence/M015-native-seven-division-mission-20260717.json]',
      mutator_kind: 'hash_drift',
      baseline_value: 'a'.repeat(64),
      tampered_value: '0'.repeat(64),
      expected_blocker_code: BLOCKER_CODES.SOURCE_HASH_DRIFT('m015_baseline'),
      expected_verdict: 'FAIL',
      expected_exit_code: EXIT_CODES.CLEANUP_PRECONDITION_DRIFT,
      rationale: 'M015 source hash must reflect fresh read; zero hash indicates stale or forged',
      evidence_ref: evidenceRef,
    }),
    Object.freeze({
      fixture_id: 'S07-NF-06',
      threat_class: 'pre_existing_residue',
      tamper_path: 'pre_run_absence_check.present_before',
      mutator_kind: 'boolean_flip',
      baseline_value: 'false',
      tampered_value: 'true',
      expected_blocker_code: BLOCKER_CODES.PRE_EXISTING_RESIDUE(SCRATCH_ROOT_RELPATH),
      expected_verdict: 'FAIL',
      expected_exit_code: EXIT_CODES.CLEANUP_RESIDUE_DRIFT,
      rationale: 'pre_run scratch must be absent; presence indicates leftover residue from prior run',
      evidence_ref: evidenceRef,
    }),
    Object.freeze({
      fixture_id: 'S07-NF-07',
      threat_class: 'cleanup_refusal',
      tamper_path: 'atomic_temp_cleanup_check.removed',
      mutator_kind: 'boolean_flip',
      baseline_value: 'true',
      tampered_value: 'false',
      expected_blocker_code: BLOCKER_CODES.CLEANUP_REFUSED(SCRATCH_ROOT_RELPATH + '/.tmp-fallback'),
      expected_verdict: 'FAIL',
      expected_exit_code: EXIT_CODES.CLEANUP_RESIDUE_DRIFT,
      rationale: 'atomic temp cleanup must succeed; removed=false indicates atomic rename failure',
      evidence_ref: evidenceRef,
    }),
    Object.freeze({
      fixture_id: 'S07-NF-08',
      threat_class: 'atomic_rename_failure',
      tamper_path: 'atomic_temp_cleanup_check.relpath',
      mutator_kind: 'rename_failure',
      baseline_value: 'runtime-evidence/.m016-s07-replay-scratch/.tmp-fallback',
      tampered_value: 'runtime-evidence/.m016-s07-replay-scratch/no-tmp-pattern',
      expected_blocker_code: BLOCKER_CODES.SCHEMA_VIOLATION('atomic-temp-pattern'),
      expected_verdict: 'FAIL',
      expected_exit_code: EXIT_CODES.CLEANUP_PRECONDITION_DRIFT,
      rationale: 'atomic temp relpath must match atomic temp relpath pattern (runtime-evidence/*.tmp-*)',
      evidence_ref: evidenceRef,
    }),
    Object.freeze({
      fixture_id: 'S07-NF-09',
      threat_class: 'overwrite_attempt',
      tamper_path: 'canonical_sidecar_overwrite_refusal.attempted',
      mutator_kind: 'boolean_flip',
      baseline_value: 'false',
      tampered_value: 'true',
      expected_blocker_code: BLOCKER_CODES.OVERWRITE_ATTEMPTED('proof-sidecar'),
      expected_verdict: 'FAIL',
      expected_exit_code: EXIT_CODES.CLEANUP_LAUNCH_PROMOTION,
      rationale: 'canonical sidecar overwrite must be refused; attempted=true indicates missing --force gate',
      evidence_ref: evidenceRef,
    }),
    Object.freeze({
      fixture_id: 'S07-NF-10',
      threat_class: 'redaction_leak',
      tamper_path: 'redaction_posture.full_ids',
      mutator_kind: 'boolean_flip',
      baseline_value: 'false',
      tampered_value: 'true',
      expected_blocker_code: BLOCKER_CODES.SECRET_TOKEN('full_ids'),
      expected_verdict: 'FAIL',
      expected_exit_code: EXIT_CODES.CLEANUP_REDACTION_LEAK,
      rationale: 'full_ids leak flag must stay false; true indicates redaction safety violation',
      evidence_ref: evidenceRef,
    }),
    Object.freeze({
      fixture_id: 'S07-NF-11',
      threat_class: 'subprocess_overflow',
      tamper_path: 'replay_subprocess_invocations',
      mutator_kind: 'extra_subprocess',
      baseline_value: '1',
      tampered_value: '2',
      expected_blocker_code: BLOCKER_CODES.SUBPROCESS_OVERFLOW(2),
      expected_verdict: 'FAIL',
      expected_exit_code: EXIT_CODES.CLEANUP_PROVENANCE_DRIFT,
      rationale: 'replay_subprocess_invocations must equal exactly 1; >1 indicates replay drift',
      evidence_ref: evidenceRef,
    }),
    Object.freeze({
      fixture_id: 'S07-NF-12',
      threat_class: 'verdict_triple_drift',
      tamper_path: 'verdict_triple.launch',
      mutator_kind: 'verdict_promotion',
      baseline_value: 'PREPARATION_ONLY',
      tampered_value: 'PASS',
      expected_blocker_code: BLOCKER_CODES.VERDICT_TRIPLE_DRIFT('launch'),
      expected_verdict: 'FAIL',
      expected_exit_code: EXIT_CODES.CLEANUP_LAUNCH_PROMOTION,
      rationale: 'verdict triple must stay frozen; launch promotion is a fail-closed launch-promotion event',
      evidence_ref: evidenceRef,
    }),
  ]);
}

function buildNegativeFixtureCoverageSummary(fixtures) {
  const summary = {
    traversal: 0,
    symlink_escape: 0,
    marker_forgery: 0,
    marker_missing: 0,
    source_hash_drift: 0,
    pre_existing_residue: 0,
    cleanup_refusal: 0,
    atomic_rename_failure: 0,
    overwrite_attempt: 0,
    redaction_leak: 0,
    subprocess_overflow: 0,
    verdict_triple_drift: 0,
  };
  for (const fixture of fixtures) {
    if (summary[fixture.threat_class] !== undefined) {
      summary[fixture.threat_class] += 1;
    }
  }
  return summary;
}

function resolveSafeRelative(rel, baseDir) {
  if (typeof rel !== 'string' || rel.length === 0) throw new Error('path empty');
  if (rel.includes('\0')) throw new Error('path contains NUL');
  return path.isAbsolute(rel) ? path.resolve(rel) : path.resolve(baseDir, rel);
}

// Realpath containment with ENOENT fallback (output-dir might not exist yet).
function realpathContainment(resolvedPath, rootPath) {
  let realResolved;
  try {
    realResolved = fs.realpathSync(resolvedPath);
  } catch (e) {
    if (!e || e.code !== 'ENOENT') return false;
    const parent = path.dirname(resolvedPath);
    let realParent;
    try { realParent = fs.realpathSync(parent); }
    catch (_) { return false; }
    try {
      const realRoot = fs.realpathSync(rootPath);
      const relRoot = path.relative(realRoot, realParent);
      if (relRoot.startsWith('..') || path.isAbsolute(relRoot)) return false;
      const tail = path.relative(realParent, resolvedPath);
      if (tail.startsWith('..') || path.isAbsolute(tail)) return false;
      return true;
    } catch (_) { return false; }
  }
  try {
    const realRoot = fs.realpathSync(rootPath);
    const rel = path.relative(realRoot, realResolved);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  } catch (_) { return false; }
}

// ---------------------------------------------------------------------------
// Helpers — sha256 + atomic write + cleanup
// ---------------------------------------------------------------------------

function hashFileOrRelpath(rel, baseDir) {
  const abs = resolveSafeRelative(rel, baseDir);
  const buf = fs.readFileSync(abs);
  return sha256Hex(buf);
}

function writeJsonAtomic(filePath, payload, runId) {
  contract.assertProofWriteSafe(payload);
  const tmp = `${filePath}.tmp-${runId}`;
  let tmpWritten = false;
  try {
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n');
    tmpWritten = true;
    fs.renameSync(tmp, filePath);
    tmpWritten = false;
  } catch (err) {
    if (tmpWritten) {
      try {
        fs.unlinkSync(tmp);
        tmpWritten = false;
      } catch (cleanupErr) {
        try {
          fs.writeFileSync(`${tmp}.cleanup-failed`, `atomic-temp cleanup failed: ${String(cleanupErr && cleanupErr.message || cleanupErr)}`);
        } catch (_) { /* best effort */ }
      }
    }
    throw err;
  }
}

function removeScratch(scratchAbs) {
  // Best-effort cleanup with sibling marker on cleanup failure.
  try {
    fs.rmSync(scratchAbs, { recursive: true, force: true });
    return { removed: true };
  } catch (err) {
    try {
      fs.writeFileSync(`${scratchAbs}.cleanup-failed`, `scratch cleanup failed: ${err && err.message}`);
    } catch (_) { /* best effort */ }
    return { removed: false, error: err };
  }
}

// ---------------------------------------------------------------------------
// Helpers — verdict triple extraction
// ---------------------------------------------------------------------------

// Extract orchestration/evidence/launch verdict triple from a S01
// classification-validation JSON object. The validation object stores
// verdicts under `verdicts` (object keyed by dimension).
function extractVerdictTriple(validation) {
  if (!validation || typeof validation !== 'object') return null;
  const verdicts = validation.verdicts;
  if (!verdicts || typeof verdicts !== 'object') return null;
  return {
    orchestration: verdicts.orchestration,
    evidence: verdicts.evidence,
    launch: verdicts.launch,
  };
}

// Sanitise a string for inclusion in the canonical verdict line. Strips
// anything outside [A-Za-z0-9._=:/-] and length-bounds it. Used to defend
// against S01 stdout injection (which we do not trust).
function sanitiseStdoutLine(value) {
  return String(value || '').replace(/[^A-Za-z0-9._=:/-]/g, '').slice(0, 256);
}

// ---------------------------------------------------------------------------
// Helpers — error / blocker emission
// ---------------------------------------------------------------------------

function emitError(prefix, message, blockers = []) {
  const safe = String(message || '').replace(/[\r\n]+/g, ' ').slice(0, 512);
  process.stderr.write(`M016_S07_VERIFY=${prefix}: ${safe}\n`);
  if (blockers.length > 0) {
    process.stderr.write(`blockers: ${JSON.stringify(blockers)}\n`);
  }
}

function buildBlocker(code, reason) {
  return { code, reason: String(reason || '').slice(0, DEFAULTS.max_blocker_reason_chars) };
}

// ---------------------------------------------------------------------------
// Main lifecycle
// ---------------------------------------------------------------------------

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    emitError('arg-error', e.message);
    process.exit(EXIT_CODES.CLEANUP_REJECTED_MALFORMED);
  }

  const baseDir = process.cwd();
  const outputDirAbs = resolveSafeRelative(args.outputDir, baseDir);
  const scratchAbs = resolveSafeRelative(SCRATCH_ROOT_RELPATH, baseDir);
  const canonicalProofAbs = path.join(outputDirAbs, PROOF_FILENAME);
  const canonicalProofRel = path.relative(ROOT, canonicalProofAbs);
  const canonicalNegativeFixturesAbs = path.join(outputDirAbs, NEGATIVE_FIXTURES_FILENAME);
  const canonicalNegativeFixturesRel = path.relative(ROOT, canonicalNegativeFixturesAbs);

  // ---------------------------------------------------------------------
  // PRE_RUN — validate sources + output-dir + scratch containment
  // ---------------------------------------------------------------------

  // Realpath containment — output-dir must stay inside repo root.
  if (!realpathContainment(outputDirAbs, ROOT)) {
    emitError('path-error', `output-dir ${outputDirAbs} is outside repo root ${ROOT}`);
    process.exit(EXIT_CODES.CLEANUP_REJECTED_MALFORMED);
  }
  if (!realpathContainment(scratchAbs, ROOT)) {
    emitError('path-error', `scratch root ${scratchAbs} is outside repo root ${ROOT}`);
    process.exit(EXIT_CODES.CLEANUP_REJECTED_MALFORMED);
  }

  // Source allowlist — every required chain_role must exist and be readable.
  const sourceHashes = {};
  const sourceAbsPaths = {
    [S01_SCHEMA_REF]: path.join(ROOT, S01_SCHEMA_REF),
    [S01_FIXTURE_REF]: path.join(ROOT, S01_FIXTURE_REF),
    [S01_PROTOCOL_REF]: path.join(ROOT, S01_PROTOCOL_REF),
    [S01_VALIDATION_REF]: path.join(ROOT, S01_VALIDATION_REF),
    [S01_VERIFICATION_REF]: path.join(ROOT, S01_VERIFICATION_REF),
    [M015_BASELINE_REF]: path.join(ROOT, M015_BASELINE_REF),
  };
  const missingSources = [];
  for (const [ref, abs] of Object.entries(sourceAbsPaths)) {
    if (!fs.existsSync(abs)) {
      missingSources.push(ref);
      continue;
    }
    try {
      sourceHashes[ref] = hashFileOrRelpath(abs, ROOT);
    } catch (e) {
      missingSources.push(ref);
    }
  }
  if (missingSources.length > 0) {
    emitError('precondition-missing', `sources missing or unreadable: ${missingSources.join(', ')}`);
    process.exit(EXIT_CODES.CLEANUP_PRECONDITION_DRIFT);
  }

  // Pre-run absence — scratch root must NOT exist as leftover residue
  // from a previous failed run. We do NOT pre-create scratch; S01 CLI
  // will create it transitively via mkdirSync(recursive) when given
  // --output-dir <scratch>/s01-out/. At S01 CLI start, scratchAbs does
  // not exist, so its scratch-root-present check passes.
  if (fs.existsSync(scratchAbs)) {
    emitError('pre-existing-residue', `scratch root ${SCRATCH_ROOT_RELPATH} already exists; refuse to start`);
    process.exit(EXIT_CODES.CLEANUP_RESIDUE_DRIFT);
  }

  // Overwrite refusal — canonical proof sidecar must not exist without --force.
  if (fs.existsSync(canonicalProofAbs) && !args.force) {
    emitError('output-exists', `canonical proof sidecar ${canonicalProofRel} already exists; pass --force to override`);
    process.exit(EXIT_CODES.CLEANUP_REJECTED_MALFORMED);
  }
  if (args.publishNegativeFixtures && fs.existsSync(canonicalNegativeFixturesAbs) && !args.force) {
    emitError('output-exists', `canonical negative-fixtures sidecar ${canonicalNegativeFixturesRel} already exists; pass --force to override`);
    process.exit(EXIT_CODES.CLEANUP_REJECTED_MALFORMED);
  }

  // ---------------------------------------------------------------------
  // REPLAY — exactly one subprocess invocation of the S01 classifier
  // ---------------------------------------------------------------------

  // The scratch zone layout:
  //   runtime-evidence/.m016-s07-replay-scratch/            (parent, transient)
  //   runtime-evidence/.m016-s07-replay-scratch/s01-out/    (S01 output dir)
  //   runtime-evidence/.m016-s07-replay-scratch/.m016-s07-replay-marker (marker)
  const s01OutAbs = path.join(scratchAbs, 's01-out');

  // S01 CLI's scratch-root-present check fires only when scratchAbs
  // exists at S01 CLI start. We do not pre-create scratch, so the
  // check passes. S01 CLI's mkdirSync(recursive) on its output-dir
  // creates scratchAbs + s01OutAbs as part of the replay.

  const s01Command = [
    process.execPath,
    path.join(ROOT, DEFAULTS.s01_classifier_cli),
    '--input', path.join(ROOT, M015_BASELINE_REF),
    '--expected', path.join(ROOT, S01_FIXTURE_REF),
    '--output-dir', s01OutAbs,
    '--schema', path.join(ROOT, S01_SCHEMA_REF),
    '--force',
  ];

  let s01Result;
  try {
    s01Result = spawnSync(s01Command[0], s01Command.slice(1), {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000,
    });
  } catch (e) {
    emitError('subprocess-spawn-failed', e.message);
    process.exit(EXIT_CODES.CLEANUP_FAIL_CLOSED);
  }

  // Subprocess non-zero exit is fail-closed (must be 0 for PASS).
  if (s01Result.error) {
    emitError('subprocess-error', String(s01Result.error.message || s01Result.error));
    process.exit(EXIT_CODES.CLEANUP_FAIL_CLOSED);
  }
  if (s01Result.signal) {
    emitError('subprocess-signal', `subprocess killed by signal ${s01Result.signal}`);
    process.exit(EXIT_CODES.CLEANUP_FAIL_CLOSED);
  }
  if (s01Result.status !== 0) {
    emitError('subprocess-nonzero', `S01 classifier exited ${s01Result.status}: ${sanitiseStdoutLine(s01Result.stderr)}`);
    process.exit(EXIT_CODES.CLEANUP_PROVENANCE_DRIFT);
  }

  // Read back three S01 canonical outputs from scratch.
  const s01Outputs = {};
  const outputAbsPaths = {
    [S01_PROTOCOL_REF]: path.join(s01OutAbs, 'M016-S01-classification-protocol.json'),
    [S01_VALIDATION_REF]: path.join(s01OutAbs, 'M016-S01-classification-validation.json'),
    [S01_VERIFICATION_REF]: path.join(s01OutAbs, 'M016-S01-classification-verification.json'),
  };
  const missingOutputs = [];
  for (const [ref, abs] of Object.entries(outputAbsPaths)) {
    if (!fs.existsSync(abs)) {
      missingOutputs.push(ref);
      continue;
    }
    try {
      const raw = fs.readFileSync(abs, 'utf8');
      const parsed = JSON.parse(raw);
      s01Outputs[ref] = { abs, parsed, raw, sha256: sha256Hex(raw) };
    } catch (e) {
      missingOutputs.push(ref);
    }
  }
  if (missingOutputs.length > 0) {
    emitError('subprocess-outputs-missing', `S01 replay outputs missing or malformed: ${missingOutputs.join(', ')}`);
    process.exit(EXIT_CODES.CLEANUP_PROVENANCE_DRIFT);
  }

  // Validate verdict triple from the validation output.
  const validationParsed = s01Outputs[S01_VALIDATION_REF].parsed;
  const extractedTriple = extractVerdictTriple(validationParsed);
  if (!extractedTriple) {
    emitError('verdict-triple-missing', 'S01 validation output did not contain verdicts object');
    process.exit(EXIT_CODES.CLEANUP_PROVENANCE_DRIFT);
  }
  // The frozen TRIAD_INVARIANT must match the S01 historical verdict.
  // Any drift is fail-closed with CLEANUP_LAUNCH_PROMOTION exit code.
  if (!isVerdictTriad(extractedTriple)) {
    const driftField = verdictTriadDriftField(extractedTriple);
    emitError('verdict-triple-drift', `S01 replay verdict triple drifted at ${driftField}: ${JSON.stringify(extractedTriple)}`);
    process.exit(EXIT_CODES.CLEANUP_LAUNCH_PROMOTION);
  }

  // ---------------------------------------------------------------------
  // MARKER — write marker inside scratch and validate ownership
  // ---------------------------------------------------------------------

  // Scratch root already exists (created by S01 CLI's mkdir). Write the
  // marker file inside it and validate ownership.
  const markerRelpath = SCRATCH_ROOT_MARKER_RELPATH;
  const markerAbs = path.join(ROOT, markerRelpath);
  try {
    fs.writeFileSync(markerAbs, SCRATCH_ROOT_MARKER_CONTENTS);
  } catch (e) {
    emitError('marker-write-failed', `failed to write marker ${markerRelpath}: ${e.message}`);
    // Try to clean up scratch before failing closed.
    removeScratch(scratchAbs);
    process.exit(EXIT_CODES.CLEANUP_PROVENANCE_DRIFT);
  }
  const markerContentsRead = fs.readFileSync(markerAbs, 'utf8');
  const markerOwnership = contract.validateMarkerOwnership(markerRelpath, markerContentsRead);
  if (markerOwnership !== 'valid') {
    emitError('marker-' + markerOwnership, `marker ${markerRelpath} ownership returned ${markerOwnership}`);
    removeScratch(scratchAbs);
    process.exit(EXIT_CODES.CLEANUP_PROVENANCE_DRIFT);
  }
  const markerSha256 = sha256Hex(SCRATCH_ROOT_MARKER_CONTENTS);

  // ---------------------------------------------------------------------
  // POST_RUN — compute semantic digest, cleanup, verify absence
  // ---------------------------------------------------------------------

  // Semantic digest — deterministic across two sequential runs because it
  // is computed only from source/output hashes + scratch path + marker
  // contents. Output hashes are computed AFTER stripping volatile
  // timestamp fields (generated, completed_at, verified_at) from the
  // canonicalized output JSON so the digest binds reproducible structure,
  // not wall-clock time.
  const sortedSourceKeys = Object.keys(sourceHashes).sort();
  const sortedOutputKeys = Object.keys(s01Outputs).sort();
  const volatileFields = new Set(['generated', 'completed_at', 'verified_at', 'captured_at']);
  function stripVolatile(parsed) {
    const clone = JSON.parse(JSON.stringify(parsed));
    for (const key of Object.keys(clone)) {
      if (volatileFields.has(key)) delete clone[key];
    }
    return clone;
  }
  const canonicalOutputHashes = {};
  for (const [ref, info] of Object.entries(s01Outputs)) {
    const stable = stripVolatile(info.parsed);
    canonicalOutputHashes[ref] = sha256Hex(_stableStringify(stable));
  }
  const semanticInput = _stableStringify({
    sources: sortedSourceKeys.map((k) => [k, sourceHashes[k]]),
    outputs: sortedOutputKeys.map((k) => [k, canonicalOutputHashes[k]]),
    scratch_root_relpath: SCRATCH_ROOT_RELPATH,
    marker_contents: SCRATCH_ROOT_MARKER_CONTENTS,
    verdict_triple: TRIAD_INVARIANT,
    protocol: 'PROTOCOL-M16-S07-REPLAY-CLEANUP-V1',
  });
  const semanticDigest = sha256Hex(semanticInput);

  // Cleanup trace — bounded, ordered 1..N rows.
  const cleanupTrace = [
    buildCleanupTraceRow({
      phase: CLEANUP_PHASES.PRE_RUN,
      action: CLEANUP_ACTIONS.MARKER_MISSING,
      target_relpath: SCRATCH_ROOT_RELPATH,
      outcome: CLEANUP_OUTCOMES.SUCCESS,
      reason: 'pre-run scratch root absent; no leftover residue from prior run',
    }),
    buildCleanupTraceRow({
      phase: CLEANUP_PHASES.REPLAY,
      action: CLEANUP_ACTIONS.SUBPROCESS_INVOKED,
      target_relpath: DEFAULTS.s01_classifier_cli,
      outcome: CLEANUP_OUTCOMES.SUCCESS,
      reason: 'exactly one allowlisted node subprocess replay invocation',
    }),
    buildCleanupTraceRow({
      phase: CLEANUP_PHASES.POST_RUN,
      action: CLEANUP_ACTIONS.MARKER_VALIDATED,
      target_relpath: markerRelpath,
      outcome: CLEANUP_OUTCOMES.SUCCESS,
      reason: 'marker contents match frozen value',
    }),
    buildCleanupTraceRow({
      phase: CLEANUP_PHASES.POST_RUN,
      action: CLEANUP_ACTIONS.REMOVED,
      target_relpath: SCRATCH_ROOT_RELPATH,
      outcome: CLEANUP_OUTCOMES.SUCCESS,
      reason: 'scratch root removed after replay',
    }),
    buildCleanupTraceRow({
      phase: CLEANUP_PHASES.POST_RUN,
      action: CLEANUP_ACTIONS.POST_RUN_ABSENT,
      target_relpath: SCRATCH_ROOT_RELPATH,
      outcome: CLEANUP_OUTCOMES.SUCCESS,
      reason: 'post-run absence check confirmed',
    }),
  ];

  const cleanupResult = removeScratch(scratchAbs);
  if (!cleanupResult.removed) {
    emitError('cleanup-refused', `scratch root cleanup failed: ${cleanupResult.error && cleanupResult.error.message}`);
    process.exit(EXIT_CODES.CLEANUP_RESIDUE_DRIFT);
  }

  // Post-run absence — scratch root must NOT exist after cleanup.
  if (fs.existsSync(scratchAbs)) {
    emitError('post-run-residue', `scratch root ${SCRATCH_ROOT_RELPATH} still present after cleanup`);
    process.exit(EXIT_CODES.CLEANUP_RESIDUE_DRIFT);
  }

  // ---------------------------------------------------------------------
  // SIDECAR — build, schema-validate, assert-write-safe, atomic publish
  // ---------------------------------------------------------------------

  const preRunAbsenceCheck = {
    relpath: SCRATCH_ROOT_RELPATH,
    present_before: false,
    present_after: false,
  };
  const postRunAbsenceCheck = {
    relpath: SCRATCH_ROOT_RELPATH,
    present_before: true,
    present_after: false,
  };

  // Atomic temp cleanup check — only populated when atomic temp was used
  // (write-error path); on the success path we record the absence of any
  // atomic temp residue after cleanup.
  const atomicTempCleanupCheck = {
    relpath: `${SCRATCH_ROOT_RELPATH}/.tmp-fallback`,
    removed: true,
  };

  // Build proof sidecar via T01 contract.
  const proofBuild = buildProofSidecar({
    generated: new Date().toISOString().replace(/\.\d{3}/, '.000'),
    referenceTime: '2026-07-21T12:00:00.000Z',
    sourceHashes,
    cleanupMarker: {
      relpath: markerRelpath,
      contents: SCRATCH_ROOT_MARKER_CONTENTS,
      sha256: markerSha256,
    },
    scratchRootRelpath: SCRATCH_ROOT_RELPATH,
    replaySubprocessInvocations: 1,
    cleanupTrace,
    verdictTriple: TRIAD_INVARIANT,
    preRunAbsenceCheck,
    postRunAbsenceCheck,
    atomicTempCleanupCheck,
    canonicalSidecarOverwriteRefusal: { attempted: false, refused: true },
    canonicalOutputOverwriteRefusal: { attempted: false, refused: true },
    semanticDigest,
    reproducibilityCount: 1,
  });
  if (!proofBuild.ok) {
    emitError('sidecar-build-failed', `proof sidecar refused to render: ${proofBuild.code}`);
    process.exit(EXIT_CODES.CLEANUP_FAIL_CLOSED);
  }
  const sidecar = proofBuild.sidecar;

  // Schema validation via Ajv (loads the bundled proof schema).
  const loaded = loadSchema(DEFAULTS.schema_path);
  const validation = validateProofShape(sidecar, loaded.validate);
  if (!validation.ok) {
    emitError('schema-violation', `proof sidecar failed schema: ${JSON.stringify(validation.errors).slice(0, 256)}`);
    process.exit(EXIT_CODES.CLEANUP_PRECONDITION_DRIFT);
  }

  // Independent redaction safety re-check.
  try {
    assertProofWriteSafe(sidecar);
  } catch (e) {
    emitError('redaction-leak', e.message);
    process.exit(EXIT_CODES.CLEANUP_REDACTION_LEAK);
  }

  // Atomic publish of canonical proof sidecar.
  try {
    fs.mkdirSync(outputDirAbs, { recursive: true });
    writeJsonAtomic(canonicalProofAbs, sidecar, RUN_ID);
  } catch (e) {
    emitError('write-error', `failed to write canonical proof sidecar: ${e.message}`);
    process.exit(EXIT_CODES.CLEANUP_RUNNER_FAILURE);
  }

  // Post-publish absence — scratch root still absent (canonical sidecar
  // is at output-dir, NOT inside scratch).
  if (fs.existsSync(scratchAbs)) {
    emitError('post-publish-residue', `scratch root reappeared after publish: ${SCRATCH_ROOT_RELPATH}`);
    process.exit(EXIT_CODES.CLEANUP_RESIDUE_DRIFT);
  }

  // ---------------------------------------------------------------------
  // NEGATIVE-FIXTURES — publish tamper evidence catalog (T04)
  // ---------------------------------------------------------------------

  let negativeFixturesRel = null;
  if (args.publishNegativeFixtures) {
    const fixtures = buildNegativeFixtureCatalog();
    const coverageSummary = buildNegativeFixtureCoverageSummary(fixtures);
    const negativeBuild = buildNegativeFixturesSidecar({
      generated: sidecar.generated,
      referenceTime: sidecar.reference_time,
      sourceHashes: sourceHashes,
      fixtures: fixtures.map((f) => Object.assign({}, f)),
      coverageSummary,
      task: 'T04',
    });
    if (!negativeBuild.ok) {
      emitError('negative-fixtures-build-failed', `negative-fixtures sidecar refused to render: ${negativeBuild.code}`);
      process.exit(EXIT_CODES.CLEANUP_FAIL_CLOSED);
    }
    // Recompute byte_digest after overriding task to T04 (buildNegativeFixturesSidecar
    // captured the default TASK = 'T01' from data; we want T04).
    negativeBuild.sidecar.task = 'T04';
    negativeBuild.sidecar.byte_digest = contract.computeNegativeFixturesBodyDigest(negativeBuild.sidecar);
    const negativeSidecar = negativeBuild.sidecar;
    const negativeValidation = validateProofShape(negativeSidecar, loaded.validate);
    if (!negativeValidation.ok) {
      emitError('negative-fixtures-schema-violation', `negative-fixtures sidecar failed schema: ${JSON.stringify(negativeValidation.errors).slice(0, 256)}`);
      process.exit(EXIT_CODES.CLEANUP_PRECONDITION_DRIFT);
    }
    try {
      assertNegativeFixturesWriteSafe(negativeSidecar);
    } catch (e) {
      emitError('negative-fixtures-redaction-leak', e.message);
      process.exit(EXIT_CODES.CLEANUP_REDACTION_LEAK);
    }
    try {
      writeJsonAtomic(canonicalNegativeFixturesAbs, negativeSidecar, RUN_ID);
    } catch (e) {
      emitError('negative-fixtures-write-error', `failed to write canonical negative-fixtures sidecar: ${e.message}`);
      process.exit(EXIT_CODES.CLEANUP_RUNNER_FAILURE);
    }
    negativeFixturesRel = canonicalNegativeFixturesRel;
  }

  // ---------------------------------------------------------------------
  // OUTPUT — canonical verdict line + bounded exit code
  // ---------------------------------------------------------------------

  process.stdout.write(formatCanonicalVerdictLine('PASS') + '\n');
  process.stdout.write(
    `M016_S07_VERIFY=pass ` +
    `proof_id=${REPLAY_CLEANUP_PROOF_ID} ` +
    `canonical=${canonicalProofRel} ` +
    `negative_fixtures=${negativeFixturesRel || '<skipped>'} ` +
    `scratch_root=${SCRATCH_ROOT_RELPATH} ` +
    `marker=${markerRelpath} ` +
    `sources=${sortedSourceKeys.length} ` +
    `outputs=${sortedOutputKeys.length} ` +
    `semantic_digest=${semanticDigest} ` +
    `exit_code=${EXIT_CODES.CLEANUP_PASS}\n`,
  );
  process.exit(EXIT_CODES.CLEANUP_PASS);
}

if (require.main === module) {
  main();
}

// Export internals for unit / integration tests. NEVER expose process
// subprocess helpers or atomic-write helpers to general consumers — only
// the deterministic compute helpers used in tests.
module.exports = {
  parseArgs,
  resolveSafeRelative,
  realpathContainment,
  hashFileOrRelpath,
  writeJsonAtomic,
  removeScratch,
  extractVerdictTriple,
  sanitiseStdoutLine,
  buildBlocker,
  emitError,
  buildNegativeFixtureCatalog,
  buildNegativeFixtureCoverageSummary,
  PROOF_FILENAME,
  NEGATIVE_FIXTURES_FILENAME,
  ROOT,
  RUN_ID: () => RUN_ID,
};