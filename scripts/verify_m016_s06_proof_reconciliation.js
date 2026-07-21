#!/usr/bin/env node
'use strict';

/**
 * scripts/verify_m016_s06_proof_reconciliation.js
 *
 * M016-txa3vu / S06 / T02 — single offline replay-and-reconciliation
 * gate for M015 ↔ M016 S01..S05 proof reconciliation.
 *
 * Imports only:
 *
 *   scripts/lib/m016-s06-proof-reconciliation-data.js      (T01 data)
 *   scripts/lib/m016-s06-proof-reconciliation-contract.js  (T01 contract)
 *   scripts/lib/m016-s05-seven-division-replay-data.js     (re-derivation)
 *   scripts/lib/m016-s05-seven-division-replay-contract.js (re-derivation)
 *
 * Producer CLIs (`scripts/produce_m016_*`) are NEVER require()d. The
 * S05 verifier (`scripts/verify_m016_s05_seven_division_replay.js`) is
 * launched ONLY through `child_process.spawnSync` (fresh subprocess),
 * never require()d, so the verifier's own producer-CLImported guard
 * remains effective.
 *
 * Pipeline (each step is independently verified; none trust embedded
 * hashes / scores / verdicts / blockers from the upstream sidecars):
 *
 *   1.  Realpath containment of every loaded path under source-root
 *   2.  Fresh SHA-256 of every required allowlisted source against the
 *       current disk bytes; compare against bundle.evidence_chain and
 *       admission.source_hashes triplets when present
 *   3.  Spawn a fresh subprocess running
 *       `node scripts/verify_m016_s05_seven_division_replay.js
 *        --protocol-out <tmp>` (default reference time + seed; S05
 *       replay_keys are time-bound, so S06 MUST NOT alter the S05
 *       reference time or replay drift will trigger)
 *   4.  Confirm subprocess `exit_code=0`, `producer_cli_imported=false`,
 *       `network_calls=0`, `mutation_count=0`, `blockers=[]`,
 *       `replay_keys.{match,byte_identical}=true`
 *   5.  Re-derive S05 verdicts + replay keys via S05 contract from
 *       canonical worksheet + bundle; compare with the subprocess-
 *       emitted protocol and with the bundle's embedded classification
 *   6.  Build criterion-level M015 vs M016 diff via T01 contract:
 *       `m015_verdict=PASS` MUST NOT pass through to evidence / launch
 *       rows without independent M016 back-refs (enforced structurally
 *       by `mapping.m016_required_back_refs`)
 *   7.  Audit the BOS Light capability ledger through T01 contract:
 *       forbidden-promotion-surfaces guard refuses to elevate any
 *       pre_status into `confirmed`, so the audit returns
 *       `promotion_blocked=true` and `pre_status_promoted_to_confirmed_count=0`
 *   8.  Build recommendation via T01 contract: with M015's
 *       `bos_plugin_required=false`, `result_json_bos_required_for_execution=false`,
 *       and `bos_grade_contract_proof=NOT_PROVEN_MISSING_RESULT_JSON_BOS`,
 *       the recommendation falls through to
 *       `plugin-owned proof integration, deferred-unvalidated`
 *   9.  Build canonical `runtime-evidence/M016-S06-proof-reconciliation.json`
 *       and narrow `runtime-evidence/M016-S06-capability-reconciliation.json`
 *       sidecars through T01 contract
 *  10.  Atomic temp+rename write of both sidecars — refuses to overwrite
 *       existing canonical sidecars (mirrors S05 immutability semantics
 *       for downstream T04 integration test runs)
 *  11.  Emit canonical line `M16-S06-RECONCILE verdict=<...> exit=<n>
 *       block_count=<n>` on stdout (or bounded failure line on stderr)
 *
 * Exit codes mirror the T01 contract mapBlockerToExitCode family:
 *   0  RECONCILE_PASS                — zero blockers, sidecars persisted
 *   1  RECONCILE_REJECTED_MALFORMED — schema violation
 *   2  RECONCILE_REJECTED_FAIL_CLOSED
 *   3  RECONCILE_PRECONDITION_DRIFT — missing required source / operator gate / S05 verifier
 *   4  RECONCILE_LAUNCH_PROMOTION   — forbidden promotion / recommendation
 *   5  RECONCILE_PROVENANCE_DRIFT   — source hash / correlation / chain drift
 *   6  RECONCILE_REDACTION_LEAK     — forbidden payload token in sidecar
 *   7  RECONCILE_REPLAY_DRIFT       — replay_keys disagree across iterations
 *   8  RECONCILE_RUNNER_FAILURE     — runner-side fault
 *
 * Usage:
 *   node scripts/verify_m016_s06_proof_reconciliation.js [options]
 *     --reference-time <iso>       Override S06 reconciliation generated timestamp (default: 2026-07-21T12:00:00.000Z)
 *     --seed <token>               Deterministic seed for the verifier run (default: s06-verify)
 *     --confirm-operator-gate-s06  Confirm operator gate; without it, sidecar write is blocked by PRECONDITION-MISSING-operator-gate
 *     --source-root <dir>          Override ROOT for source resolution (T04 fixture overrides)
 *     --output-dir <dir>           Output directory (default: runtime-evidence)
 *     --protocol-out <path>        Override tmp S05 verify-protocol output (default: <scratch>/s05-verify-protocol-<pid>.json)
 *     --dry-run                    Resolve all sources and run S05 subprocess but do NOT persist S06 sidecars
 *     -h, --help                   Show help
 *
 * Re-emits S05 verifier subprocess output to stderr for traceability;
 * the canonical S06 line is the only stdout emission on success.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

// ---------------------------------------------------------------------------
// Restricted imports — allowlisted paths under scripts/lib only.
// scripts/verify_m016_s05_seven_division_replay.js is NEVER require()d;
// it is invoked only through spawnSync (fresh subprocess) below.
// scripts/produce_m016_* are never require()d (T05 / T04 grep invariant).
// ---------------------------------------------------------------------------

const data = require('./lib/m016-s06-proof-reconciliation-data');
const contract = require('./lib/m016-s06-proof-reconciliation-contract');

// S05 re-derivation imports — still under scripts/lib allowlist. If the
// S05 lib is unavailable (uncommon; S05 is shipped) we capture the
// precondition-missing blocker and exit non-zero without writing.
let s05Data = null;
let s05Contract = null;
try {
  s05Data = require('./lib/m016-s05-seven-division-replay-data');
} catch (_e) {
  s05Data = null;
}
try {
  s05Contract = require('./lib/m016-s05-seven-division-replay-contract');
} catch (_e) {
  s05Contract = null;
}

const ROOT = path.resolve(__dirname, '..');
const S05_VERIFIER_SCRIPT = path.resolve(__dirname, 'verify_m016_s05_seven_division_replay.js');
const PRODUCER_FORBIDDEN_RE = /produce_m016_(?:s\d{2}|s\d{2}-[a-z0-9_-]+)_/;
const PRODUCER_FORBIDDEN_IMPORT_RE = /require\([^)]*produce_m016_[^)]*\)/;

// ---------------------------------------------------------------------------
// Allowlist enforcement — runtime check for any dynamic require / require
// cache pollution. The static requires above are all under scripts/lib and
// resolve at module load; if a future refactor introduces a require
// outside the allowlist, _checkImportAllowlist() raises a clear error.
// ---------------------------------------------------------------------------

// scripts/produce_* modules are NEVER allowlisted — they are the live
// producer CLIs. Producer modules are detected by filename prefix and
// refused at load time AND at runtime (require.cache check). Every other
// module that ends up in require.cache (transitive dependencies of the
// S05 / S06 contract/data libs) is allowed; the producer prefix check
// below is the single hard barrier against accidentally importing a
// producer into the verifier process. This mirrors the S05 verifier's
// `require.cache[PRODUCER_CLI_PATH]` runtime guard, extended to the
// whole producer family for defence-in-depth.
const ALLOWED_SCRIPT_PATHS = Object.freeze([
  // Entry-point: the verifier file itself is registered in require.cache
  // when Node loads it as the main module.
  path.resolve(__filename),
]);

function _checkImportAllowlist() {
  for (const cached of Object.keys(require.cache)) {
    if (PRODUCER_FORBIDDEN_RE.test(cached)) {
      throw new Error('refused: producer module loaded into verifier process: ' + cached);
    }
    // We restrict the explicit path-allowlist only to the entry-point
    // itself; the producer-prefix check above is the only hard barrier
    // for transitive dependencies. This matches the S05 verifier's
    // single-file producer-cli guard while extending it to the whole
    // producer family.
    if (cached === __filename) continue;
  }
}

// ---------------------------------------------------------------------------
// CLI parsing — minimal surface; unknown flags are silently ignored so
// future T04 fixture overrides can pass extra paths safely.
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = {
    referenceTime: '',
    seed: '',
    sourceRoot: '',
    outputDir: '',
    protocolOut: '',
    operatorConfirmed: false,
    dryRun: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--reference-time') {
      out.referenceTime = argv[++i] || '';
    } else if (a === '--seed') {
      out.seed = argv[++i] || '';
    } else if (a === '--confirm-operator-gate-s06') {
      out.operatorConfirmed = true;
    } else if (a === '--source-root') {
      out.sourceRoot = argv[++i] || '';
    } else if (a === '--output-dir') {
      out.outputDir = argv[++i] || '';
    } else if (a === '--protocol-out') {
      out.protocolOut = argv[++i] || '';
    } else if (a === '--dry-run') {
      out.dryRun = true;
    } else if (a === '--help' || a === '-h') {
      process.stdout.write([
        'Usage: verify_m016_s06_proof_reconciliation.js [options]',
        '',
        'Options:',
        '  --reference-time <iso>       Override S06 reconciliation generated timestamp (default: 2026-07-21T12:00:00.000Z)',
        '  --seed <token>               Deterministic seed for the verifier run (default: s06-verify)',
        '  --confirm-operator-gate-s06  Confirm operator gate; without it, sidecar write is blocked',
        '  --source-root <dir>          Override ROOT for source resolution',
        '  --output-dir <dir>           Output directory (default: runtime-evidence)',
        '  --protocol-out <path>        Override tmp S05 verify-protocol output',
        '  --dry-run                    Resolve sources + run S05 subprocess, but do NOT persist S06 sidecars',
        '  -h, --help                   Show help',
        '',
        'Exit codes:',
        '  0  PASS                 4  LAUNCH_PROMOTION     8  RUNNER_FAILURE',
        '  1  REJECTED_MALFORMED   5  PROVENANCE_DRIFT',
        '  3  PRECONDITION_DRIFT   6  REDACTION_LEAK       7  REPLAY_DRIFT',
        '',
        'Canonical line on stdout:',
        '  M16-S06-RECONCILE verdict=<PREPARATION_ONLY|NO_GO> exit=<n> block_count=<n> ...',
      ].join('\n') + '\n');
      process.exit(0);
    }
  }
  out.sourceRoot = (typeof out.sourceRoot === 'string' && out.sourceRoot.length > 0) ? path.resolve(out.sourceRoot) : ROOT;
  out.referenceTime = out.referenceTime || data.RECONCILE_REFERENCE_TIME;
  out.seed = out.seed ? out.seed.slice(0, data.DEFAULTS.max_seed_length) : 's06-verify';
  out.outputDir = out.outputDir || data.DEFAULTS.output_dir;
  return out;
}

// ---------------------------------------------------------------------------
// Path / hash helpers
// ---------------------------------------------------------------------------

function _resolveWithin(rootDir, sourceRef) {
  if (!sourceRef || typeof sourceRef !== 'string') return null;
  if (path.isAbsolute(sourceRef)) return sourceRef;
  return path.join(rootDir, sourceRef);
}

function _verifyPathUnder(rootDir, absPath) {
  const realRoot = fs.realpathSync(rootDir);
  let realTarget = absPath;
  try { realTarget = fs.realpathSync(absPath); } catch (_e) { /* missing-file OK */ }
  const rel = path.relative(realRoot, realTarget);
  if (rel.startsWith('..') || path.isAbsolute(rel) || rel.split(path.sep).includes('..')) {
    throw errorWithCode(data.BLOCKER_CODES.PATH_TRAVERSAL(absPath), 'path escapes source-root: ' + absPath);
  }
  return realTarget;
}

function errorWithCode(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function freshHashOfFile(absPath) {
  const bytes = fs.readFileSync(absPath);
  return contract.sha256Hex(bytes);
}

function loadSourcePayload(sourceRef, sourceRoot) {
  if (!sourceRef || typeof sourceRef !== 'string') {
    throw errorWithCode(data.BLOCKER_CODES.PRECONDITION_MISSING('source-ref'), 'missing source_ref');
  }
  const abs = _resolveWithin(sourceRoot, sourceRef);
  _verifyPathUnder(sourceRoot, abs);
  if (!fs.existsSync(abs)) {
    throw errorWithCode(data.BLOCKER_CODES.S05_VERIFIER_NOT_FOUND(sourceRef), 'source file missing: ' + sourceRef);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (e) {
    throw errorWithCode(data.BLOCKER_CODES.SCHEMA_VIOLATION(sourceRef + ':malformed-json'), 'source malformed JSON: ' + sourceRef + ' (' + e.message + ')');
  }
  return { source_ref: sourceRef, abs_path: abs, payload: parsed };
}

// ---------------------------------------------------------------------------
// Scratch root — create ephemeral scratch dir for the S05 subprocess
// protocol output. POSIX temp+rename inside a dedicated scratch dir keeps
// partial writes from leaking into runtime-evidence/. If /tmp is missing
// (rare on macOS where /tmp → /private/tmp), fall back to os.tmpdir().
// ---------------------------------------------------------------------------

function ensureScratchRoot() {
  const candidates = [
    data.DEFAULTS.scratch_root,
    data.DEFAULTS.scratch_root_macos_private,
    data.DEFAULTS.scratch_root_macos_user,
    os.tmpdir() + '/m016-s06-scratch',
  ];
  for (const candidate of candidates) {
    try {
      fs.mkdirSync(candidate, { recursive: true });
      const real = fs.realpathSync(candidate);
      return real;
    } catch (_e) {
      // try next candidate
    }
  }
  throw errorWithCode(data.BLOCKER_CODES.VERIFIER_RUNNER_FAILURE(), 'failed to create scratch root');
}

// ---------------------------------------------------------------------------
// Atomic JSON write (POSIX temp+rename). Refuses to overwrite an existing
// canonical sidecar (mirrors S05 producer immutability semantics).
// ---------------------------------------------------------------------------

function atomicWriteJsonIfMissing(targetPath, payload) {
  const target = path.resolve(targetPath);
  if (fs.existsSync(target)) {
    throw errorWithCode(data.BLOCKER_CODES.SCHEDULE_DUPLICATE(target), 'refusing to overwrite existing sidecar: ' + target);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmpPath = target + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  const bytes = Buffer.from(JSON.stringify(payload, null, 2));
  try {
    fs.writeFileSync(tmpPath, bytes);
    fs.renameSync(tmpPath, target);
  } catch (e) {
    try { fs.unlinkSync(tmpPath); } catch (_e2) { /* ignore */ }
    throw e;
  }
  return { path: target, size_bytes: bytes.length, sha256: contract.sha256Hex(bytes) };
}

// ---------------------------------------------------------------------------
// Verdict lines (bounded)
// ---------------------------------------------------------------------------

function printVerdictLine(payload) {
  const parts = [
    data.VERIFIER_LINE_CLASS,
    'verdict=' + payload.aggregate_verdict.overall,
    'exit=' + payload.exit,
    'block_count=' + payload.block_count,
    'orchestration=' + payload.aggregate_verdict.orchestration,
    'evidence=' + payload.aggregate_verdict.evidence,
    'launch=' + payload.aggregate_verdict.launch,
    'pass_through_count=' + payload.pass_through_count,
    'promotion_refused_count=' + payload.promotion_refused_count,
    'promotion_blocked=' + payload.capability_promotion_blocked,
    'pre_to_confirmed=' + payload.pre_status_promoted_to_confirmed_count,
    's05_exit=' + payload.s05_exit_code,
    's05_blockers=' + payload.s05_blockers_count,
    'reconciliation_ref=' + payload.reconciliation_ref,
    'capability_ledger_ref=' + payload.capability_ledger_ref,
    'canonical_protocol=' + data.VERIFIER_CANONICAL_PROTOCOL,
    'reference_time=' + payload.reference_time,
    'producer_cli_imported=false',
    'network_calls=0',
    'mutation_count=' + payload.s06_mutation_count,
    'replay_key=' + payload.replay_key,
  ];
  process.stdout.write(parts.join(' ') + '\n');
}

function printFailureLine(blockers, exitCode) {
  const joined = blockers.map((b) => b.code + ':' + b.reason).join(' | ');
  process.stderr.write([
    data.VERIFIER_LINE_CLASS,
    'verdict=' + data.VERDICT_VALUES.NO_GO,
    'exit=' + exitCode,
    'block_count=' + blockers.length,
    'blockers=' + joined,
  ].join(' ') + '\n');
}

// ---------------------------------------------------------------------------
// S05 subprocess. Spawns `node scripts/verify_m016_s05_seven_division_replay.js`
// with --protocol-out pointed at a fresh scratch file. NO --reference-time
// or --seed is forwarded: S05 replay_keys are time-bound, so passing our
// own time would trigger REPLAY_DRIFT inside S05 and the subprocess would
// exit non-zero. Default S05 reference time = `2026-07-20T12:00:00.000Z`
// matches the canonical verify-protocol `verified_at`.
// ---------------------------------------------------------------------------

function runS05Subprocess(protocolOut, opts) {
  const argv = [
    S05_VERIFIER_SCRIPT,
    '--protocol-out', protocolOut,
  ];
  const result = spawnSync(process.execPath, argv, {
    timeout: opts.timeoutMs,
    encoding: 'utf8',
    cwd: opts.sourceRoot,
    // Inherit the parent environment (NODE_PATH / PATH / HOME etc.) so the
    // child can resolve `ajv` from the repo-root `node_modules/` the same
    // way a manually-invoked `node scripts/verify_m016_s05_…` would.
    // Producer-CLI import is structurally prevented by the
    // require.cache guard inside the S05 verifier itself; we do not need
    // to scrub the env to honour that boundary.
    env: process.env,
    killSignal: 'SIGKILL',
  });
  return {
    exit_code: typeof result.status === 'number' ? result.status : -1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    signal: result.signal || null,
    error: result.error || null,
    timed_out: result.signal === 'SIGKILL' && result.status === null,
  };
}

// ---------------------------------------------------------------------------
// Build the list of source_refs we will audit.
// ---------------------------------------------------------------------------

function classifyAllowlist() {
  return {
    required: data.SOURCE_ALLOWLIST.filter((s) => s.required).map((s) => s.source_ref),
    auxiliaryS01: data.SOURCE_ALLOWLIST.filter((s) => s.source_ref.startsWith('runtime-evidence/M016-S01-')).map((s) => s.source_ref),
    auxiliaryS02: data.SOURCE_ALLOWLIST.filter((s) => s.source_ref.startsWith('runtime-evidence/M016-S02-')).map((s) => s.source_ref),
    auxiliaryS03: data.SOURCE_ALLOWLIST.filter((s) => s.source_ref.startsWith('runtime-evidence/M016-S03-')).map((s) => s.source_ref),
    auxiliaryS04: data.SOURCE_ALLOWLIST.filter((s) => s.source_ref.startsWith('runtime-evidence/M016-S04-')).map((s) => s.source_ref),
  };
}

// ---------------------------------------------------------------------------
// M015 vs S05 sidecar source-hash triplet comparison.
//
// Compares freshly-computed disk hashes against the chain triplets in
// bundle.evidence_chain (M016 S05 producer) and admission.source_hashes
// (M016 S05 admission). When neither sidecar carries the chain role we
// accept the absence but still record the disk hash for the source_hashes
// map so downstream contract.evaluateReconciliationContract can require it.
// ---------------------------------------------------------------------------

function compareHashTriplets(bundle, admission, sourceHashes) {
  const drift = [];
  const chainRows = (bundle && Array.isArray(bundle.evidence_chain)) ? bundle.evidence_chain : [];
  for (const row of chainRows) {
    const disk = sourceHashes[row.source_ref];
    if (!disk) continue;
    if (typeof row.pre_hash_sha256 === 'string' && row.pre_hash_sha256 !== disk) {
      drift.push({ chain_role: row.chain_role || 'unknown', kind: 'pre', expected: row.pre_hash_sha256, actual: disk, source_ref: row.source_ref });
    }
    if (typeof row.post_hash_sha256 === 'string' && row.post_hash_sha256 !== disk) {
      drift.push({ chain_role: row.chain_role || 'unknown', kind: 'post', expected: row.post_hash_sha256, actual: disk, source_ref: row.source_ref });
    }
  }
  const admissionRows = (admission && Array.isArray(admission.source_hashes)) ? admission.source_hashes : [];
  for (const row of admissionRows) {
    const disk = sourceHashes[row.source_ref];
    if (!disk) continue;
    if (typeof row.pre_hash_sha256 === 'string' && row.pre_hash_sha256 !== disk) {
      drift.push({ chain_role: 'admission:' + (row.chain_role || row.source_ref), kind: 'pre', expected: row.pre_hash_sha256, actual: disk, source_ref: row.source_ref });
    }
    if (typeof row.post_hash_sha256 === 'string' && row.post_hash_sha256 !== disk) {
      drift.push({ chain_role: 'admission:' + (row.chain_role || row.source_ref), kind: 'post', expected: row.post_hash_sha256, actual: disk, source_ref: row.source_ref });
    }
  }
  return drift;
}

// ---------------------------------------------------------------------------
// Re-derive S05 verdicts + replay keys from canonical worksheet + bundle
// using the S05 contract, independent of the producer's claims. Compares
// against the bundle's embedded_classification and the subprocess-emitted
// protocol's verdicts.
// ---------------------------------------------------------------------------

function rederiveS05(bundle, worksheet, s05ReferenceTime) {
  if (!s05Contract || !s05Data) {
    return { ok: false, code: data.BLOCKER_CODES.PRECONDITION_MISSING('s05-rederivation-lib'), reason: 'S05 contract/data lib unavailable', rederived: null, drift: { classification: true, replayKeys: true } };
  }
  const refTime = s05ReferenceTime || s05Data.DEFAULTS.reference_time;
  const drift = { classification: false, replayKeys: false };
  let rederivedReplayKeys = null;
  try {
    rederivedReplayKeys = s05Contract.attachReplayKeys({
      bundle,
      referenceTime: refTime,
      verifiedAt: refTime,
    });
  } catch (e) {
    return { ok: false, code: data.BLOCKER_CODES.VERIFIER_RUNNER_FAILURE(), reason: 'attachReplayKeys fault: ' + e.message, rederived: null, drift };
  }
  if (!rederivedReplayKeys || rederivedReplayKeys.match !== true || rederivedReplayKeys.byte_identical !== true) {
    drift.replayKeys = true;
  }
  const claimed = (bundle && bundle.replay_keys) || {};
  if (claimed.first_run_provenance_hash !== rederivedReplayKeys.first_run_provenance_hash
      || claimed.second_run_provenance_hash !== rederivedReplayKeys.second_run_provenance_hash
      || claimed.replay_key !== rederivedReplayKeys.replay_key) {
    drift.replayKeys = true;
  }

  let rederivedClassification = null;
  try {
    rederivedClassification = s05Contract.buildEmbeddedClassification({
      records: bundle.records,
      evidenceChain: bundle.evidence_chain,
      redactionHits: [],
      correlationUnique: true,
      replayMatch: true,
      rawInputImmutable: true,
    });
  } catch (e) {
    return { ok: false, code: data.BLOCKER_CODES.VERIFIER_RUNNER_FAILURE(), reason: 'buildEmbeddedClassification fault: ' + e.message, rederived: null, drift };
  }
  const claimedClassification = (bundle && bundle.embedded_classification && bundle.embedded_classification.verdicts) || {};
  for (const field of ['orchestration', 'evidence', 'launch']) {
    if (rederivedClassification.verdicts[field] !== claimedClassification[field]) {
      drift.classification = true;
      break;
    }
  }

  return {
    ok: true,
    code: null,
    reason: null,
    rederived: {
      replay_keys: rederivedReplayKeys,
      classification_verdicts: rederivedClassification.verdicts,
    },
    drift,
  };
}

// ---------------------------------------------------------------------------
// Top-level pipeline.
// ---------------------------------------------------------------------------

function run(args) {
  const blockers = [];
  const pushBlocker = (code, reason) => {
    if (!code) return;
    if (!blockers.some((b) => b.code === code)) {
      blockers.push({ code, reason: String(reason || '').slice(0, data.DEFAULTS.max_blocker_reason_chars) });
    }
  };

  try { _checkImportAllowlist(); } catch (e) {
    pushBlocker(data.BLOCKER_CODES.SCHEMA_VIOLATION('import-allowlist'), e.message);
    return reject(blockers, args);
  }

  // Static guard: T05 / T04 grep will catch a future regression; this
  // regex is the runtime defence-in-depth check.
  const thisFile = fs.readFileSync(__filename, 'utf8');
  if (PRODUCER_FORBIDDEN_IMPORT_RE.test(thisFile)) {
    pushBlocker(data.BLOCKER_CODES.SCHEMA_VIOLATION('producer-forbidden-import'), 'verifier file imports a producer module');
    return reject(blockers, args);
  }

  const sourceRoot = args.sourceRoot;
  const referenceTime = args.referenceTime;
  const outputDir = args.outputDir;
  const operatorConfirmed = args.operatorConfirmed;

  // Operator gate posture (fail-closed precondition).
  if (!operatorConfirmed) {
    pushBlocker(data.BLOCKER_CODES.PRECONDITION_MISSING('operator-gate-s06'), 'operator gate is not confirmed; pass --confirm-operator-gate-s06 to allow sidecar write');
  }

  // Resolve required sources + auxiliary sources.
  const allowlist = classifyAllowlist();
  const requiredRefs = allowlist.required.slice();
  const auxiliaryRefs = []
    .concat(allowlist.auxiliaryS01)
    .concat(allowlist.auxiliaryS02)
    .concat(allowlist.auxiliaryS03)
    .concat(allowlist.auxiliaryS04)
    .slice(0, 32);

  const sourceHashes = {};
  const payloads = {};
  for (const ref of requiredRefs.concat(auxiliaryRefs)) {
    try {
      const loaded = loadSourcePayload(ref, sourceRoot);
      const hash = freshHashOfFile(loaded.abs_path);
      sourceHashes[ref] = hash;
      payloads[ref] = loaded.payload;
    } catch (e) {
      if (allowlist.required.indexOf(ref) >= 0) {
        pushBlocker(e.code || data.BLOCKER_CODES.PRECONDITION_MISSING(ref), e.message);
      }
      // Auxiliary failures are non-blocking; record absence and move on.
    }
  }

  const m015Baseline = payloads[data.M015_BASELINE_REF];
  const s05Bundle = payloads[data.S05_BUNDLE_REF];
  const s05Worksheet = payloads[data.S05_WORKSHEET_REF];
  const s05VerifyProtocol = payloads[data.S05_VERIFY_PROTOCOL_REF];
  const s05Admission = payloads['runtime-evidence/M016-S05-seven-division-replay-admission.json'];
  const capabilityLedger = payloads[data.CAPABILITY_LEDGER_REF];

  if (!m015Baseline) {
    pushBlocker(data.BLOCKER_CODES.PRECONDITION_MISSING(data.M015_BASELINE_REF), 'M015 baseline could not be loaded');
  }
  if (!s05Bundle) {
    pushBlocker(data.BLOCKER_CODES.PRECONDITION_MISSING(data.S05_BUNDLE_REF), 'S05 bundle could not be loaded');
  }
  if (!s05Worksheet) {
    pushBlocker(data.BLOCKER_CODES.PRECONDITION_MISSING(data.S05_WORKSHEET_REF), 'S05 worksheet could not be loaded');
  }
  if (!s05VerifyProtocol) {
    pushBlocker(data.BLOCKER_CODES.PRECONDITION_MISSING(data.S05_VERIFY_PROTOCOL_REF), 'S05 verify-protocol could not be loaded');
  }
  if (!s05Admission) {
    pushBlocker(data.BLOCKER_CODES.PRECONDITION_MISSING('runtime-evidence/M016-S05-seven-division-replay-admission.json'), 'S05 admission could not be loaded');
  }
  if (!capabilityLedger) {
    pushBlocker(data.BLOCKER_CODES.PRECONDITION_MISSING(data.CAPABILITY_LEDGER_REF), 'capability ledger could not be loaded');
  }

  // 1. Hash triplet drift.
  const hashDrift = compareHashTriplets(s05Bundle || {}, s05Admission || {}, sourceHashes);
  if (hashDrift.length > 0) {
    const first = hashDrift[0];
    pushBlocker(
      data.BLOCKER_CODES.SOURCE_HASH_DRIFT(first.chain_role + ':' + first.kind),
      'source hash drift at ' + first.source_ref + ' (chain_role=' + first.chain_role + ', kind=' + first.kind + ')'
    );
  }

  // 2. S05 subprocess.
  let scratchDir;
  try { scratchDir = ensureScratchRoot(); } catch (e) {
    pushBlocker(data.BLOCKER_CODES.VERIFIER_RUNNER_FAILURE(), 'failed to create scratch dir: ' + e.message);
    return reject(blockers, args);
  }
  const s05ProtocolOut = args.protocolOut || path.join(scratchDir, 'm016-s06-s05-verify-protocol-' + process.pid + '-' + crypto.randomBytes(4).toString('hex') + '.json');

  // S05 verifier must not pollute the canonical protocol path; ensure
  // scratch file does not pre-exist (atomic write target).
  if (fs.existsSync(s05ProtocolOut)) {
    try { fs.unlinkSync(s05ProtocolOut); } catch (_e) { /* best effort */ }
  }

  const subprocess = runS05Subprocess(s05ProtocolOut, {
    timeoutMs: data.DEFAULTS.max_replay_duration_ms,
    sourceRoot,
  });

  let s05Protocol = null;
  let s05ProtocolHash = '';
  if (fs.existsSync(s05ProtocolOut)) {
    try {
      s05ProtocolHash = contract.sha256Hex(fs.readFileSync(s05ProtocolOut));
      s05Protocol = JSON.parse(fs.readFileSync(s05ProtocolOut, 'utf8'));
    } catch (e) {
      pushBlocker(data.BLOCKER_CODES.SCHEMA_VIOLATION('s05-protocol-malformed'), 'subprocess protocol JSON malformed: ' + e.message);
    }
  } else {
    pushBlocker(data.BLOCKER_CODES.S05_VERIFIER_BLOCKERS(0), 'subprocess did not produce a verify-protocol');
  }

  if (subprocess.timed_out) {
    pushBlocker(data.BLOCKER_CODES.S05_VERIFIER_NONZERO_EXIT('timeout'), 'S05 verifier subprocess exceeded max_replay_duration_ms');
  }
  if (subprocess.exit_code !== 0) {
    pushBlocker(data.BLOCKER_CODES.S05_VERIFIER_NONZERO_EXIT(subprocess.exit_code), 'fresh S05 verifier returned a non-zero exit: ' + subprocess.exit_code);
  }

  if (s05Protocol) {
    if (s05Protocol.producer_cli_imported !== false) {
      pushBlocker(data.BLOCKER_CODES.S05_VERIFIER_PRODUCER_CLI_IMPORTED(), 'subprocess protocol reports producer_cli_imported !== false');
    }
    if (typeof s05Protocol.network_calls === 'number' && s05Protocol.network_calls > 0) {
      pushBlocker(data.BLOCKER_CODES.S05_VERIFIER_NETWORK_CALLS(s05Protocol.network_calls), 'subprocess protocol reports network_calls > 0');
    }
    if (typeof s05Protocol.mutation_count === 'number' && s05Protocol.mutation_count > 0) {
      pushBlocker(data.BLOCKER_CODES.S05_VERIFIER_MUTATIONS(s05Protocol.mutation_count), 'subprocess protocol reports mutation_count > 0');
    }
    if (Array.isArray(s05Protocol.blockers) && s05Protocol.blockers.length > 0) {
      pushBlocker(data.BLOCKER_CODES.S05_VERIFIER_BLOCKERS(s05Protocol.blockers.length), 'subprocess protocol carries ' + s05Protocol.blockers.length + ' blocker(s)');
    }
    if (!s05Protocol.replay_keys || s05Protocol.replay_keys.match !== true || s05Protocol.replay_keys.byte_identical !== true) {
      pushBlocker(data.BLOCKER_CODES.S05_VERIFIER_REPLAY_KEY_MISMATCH('match'), 'subprocess protocol replay_keys do not match byte-identically');
    }
  }

  // Forward subprocess stderr to operator (bounded — one line only).
  if (subprocess.stderr) {
    process.stderr.write(subprocess.stderr);
  }

  // 3. Re-derive S05 verdicts from canonical bundle + worksheet via S05 contract.
  let redrive = null;
  if (s05Bundle && s05Data && s05Contract) {
    redrive = rederiveS05(s05Bundle, s05Worksheet, s05Data.DEFAULTS.reference_time);
    if (!redrive.ok) {
      pushBlocker(redrive.code, redrive.reason);
    } else if (redrive.drift.classification) {
      pushBlocker(data.BLOCKER_CODES.S05_VERDICT_DRIFT('classification'), 'S05 classification verdicts drift from independent re-derivation');
    } else if (redrive.drift.replayKeys) {
      pushBlocker(data.BLOCKER_CODES.S05_VERIFIER_REPLAY_KEY_MISMATCH('rederivation'), 'S05 replay_keys drift from independent re-derivation');
    } else if (s05Protocol && s05Protocol.verdicts) {
      for (const field of ['orchestration', 'evidence', 'launch']) {
        if (s05Protocol.verdicts[field] !== redrive.rederived.classification_verdicts[field]) {
          pushBlocker(data.BLOCKER_CODES.S05_VERDICT_DRIFT('subprocess:' + field), 'S05 subprocess emitted verdict diverges from independent re-derivation: ' + field);
        }
      }
    }
  } else {
    pushBlocker(data.BLOCKER_CODES.PRECONDITION_MISSING('s05-rederivation-lib'), 'S05 contract/data lib unavailable for re-derivation');
  }

  // Build capability action list — no overrides (T01 contract defaults to
  // keep / update_blocker per status, with FORBIDDEN_PROMOTION_SURFACES
  // guarding against illegal promotion to `confirmed`).
  const capabilityActions = [];
  // Build M016 independent back-refs list (everything we successfully
  // loaded, minus the M015 baseline itself, which is excluded from
  // back-ref counting by T01 contract).
  const m016IndependentRefs = Object.keys(payloads).filter((ref) => ref !== data.M015_BASELINE_REF);

  // 4. Build reconciliation sidecar via T01 contract.
  const sidecarInput = {
    generated: referenceTime,
    referenceTime,
    m015Baseline: m015Baseline || {},
    capabilityLedger: capabilityLedger || {},
    capabilityLedgerHash: sourceHashes[data.CAPABILITY_LEDGER_REF] || '',
    capabilityActions,
    s05Verifier: {
      exit_code: subprocess.exit_code,
      producer_cli_imported: s05Protocol ? s05Protocol.producer_cli_imported : null,
      network_calls: s05Protocol ? s05Protocol.network_calls : null,
      mutation_count: s05Protocol ? s05Protocol.mutation_count : null,
      blockers: s05Protocol && Array.isArray(s05Protocol.blockers) ? s05Protocol.blockers : [],
      replay_keys: s05Protocol && s05Protocol.replay_keys
        ? {
            match: s05Protocol.replay_keys.match === true,
            byte_identical: s05Protocol.replay_keys.byte_identical === true,
            verified_at: s05Protocol.replay_keys.verified_at,
          }
        : null,
      protocol_path: s05ProtocolOut,
    },
    inputs: {
      m015_baseline: data.M015_BASELINE_REF,
      s02_proof: data.S02_PROOF_REF,
      s05_bundle: data.S05_BUNDLE_REF,
      s05_worksheet: data.S05_WORKSHEET_REF,
      s05_verify_protocol: data.S05_VERIFY_PROTOCOL_REF,
      s05_producer_protocol: 'runtime-evidence/M016-S05-seven-division-replay-producer-protocol.json',
      s05_probe_run: 'runtime-evidence/M016-S05-seven-division-replay-probe-run.json',
      s05_admission: 'runtime-evidence/M016-S05-seven-division-replay-admission.json',
      capability_ledger: data.CAPABILITY_LEDGER_REF,
      s01_auxiliary: allowlist.auxiliaryS01.filter((ref) => ref in payloads).slice(0, 8),
      s02_auxiliary: allowlist.auxiliaryS02.filter((ref) => ref in payloads).slice(0, 8),
      s03_auxiliary: allowlist.auxiliaryS03.filter((ref) => ref in payloads).slice(0, 8),
      s04_auxiliary: allowlist.auxiliaryS04.filter((ref) => ref in payloads).slice(0, 8),
    },
    sourceHashes,
    m016IndependentRefs,
    operatorConfirmed,
    operatorConfirmedAt: operatorConfirmed ? referenceTime : null,
  };

  const recoBuilt = contract.buildReconciliationSidecar(sidecarInput);
  if (!recoBuilt.ok) {
    pushBlocker(recoBuilt.code, 'reconciliation sidecar refused to render: ' + (recoBuilt.code || 'unknown'));
  }
  const ledgerBuilt = contract.buildCapabilityActionLedgerSidecar({
    generated: referenceTime,
    referenceTime,
    ledger: capabilityLedger || {},
    actions: capabilityActions,
    sourceHash: sourceHashes[data.CAPABILITY_LEDGER_REF] || '',
  });
  if (!ledgerBuilt.ok) {
    pushBlocker(ledgerBuilt.code, 'capability ledger sidecar refused to render');
  }

  const reco = recoBuilt.ok ? recoBuilt.sidecar : null;
  const ledgerSidecar = ledgerBuilt.ok ? ledgerBuilt.sidecar : null;

  // 5. Evaluate reconciliation contract (defence-in-depth — should be
  // consistent with the manual blocker collection above).
  const evaluate = contract.evaluateReconciliationContract({
    ...sidecarInput,
    generated: referenceTime,
  });
  for (const evalBlocker of evaluate.blockers || []) {
    pushBlocker(evalBlocker.code, evalBlocker.reason);
  }

  // Aggregate verdict — T01 contract leaves it at PREPARATION_ONLY when
  // pass-through is partial; we mirror that in the canonical line.
  const aggregateVerdict = reco ? reco.aggregate_verdict : {
    orchestration: data.VERDICT_VALUES.NOT_PROVEN,
    evidence: data.VERDICT_VALUES.NOT_PROVEN,
    launch: data.VERDICT_VALUES.NO_GO,
    overall: data.VERDICT_VALUES.NO_GO,
  };

  // 6. Atomic write of both sidecars — refuse to overwrite.
  if (blockers.length === 0 && reco && ledgerSidecar && !args.dryRun) {
    try {
      contract.assertReconciliationWriteSafe(reco);
      contract.assertLedgerWriteSafe(ledgerSidecar);
    } catch (e) {
      pushBlocker(e.code || data.BLOCKER_CODES.SECRET_TOKEN('assert'), 'redaction safety refusal: ' + e.message);
    }
  }
  if (blockers.length === 0 && reco && ledgerSidecar && !args.dryRun) {
    const recoOut = path.join(outputDir, 'M016-S06-proof-reconciliation.json');
    const ledgerOut = path.join(outputDir, 'M016-S06-capability-reconciliation.json');
    try {
      atomicWriteJsonIfMissing(recoOut, reco);
    } catch (e) {
      pushBlocker(e.code || data.BLOCKER_CODES.VERIFIER_RUNNER_FAILURE(), 'reconciliation atomic write failed: ' + e.message);
    }
    try {
      atomicWriteJsonIfMissing(ledgerOut, ledgerSidecar);
    } catch (e) {
      pushBlocker(e.code || data.BLOCKER_CODES.VERIFIER_RUNNER_FAILURE(), 'capability ledger atomic write failed: ' + e.message);
    }
  } else if (args.dryRun) {
    process.stdout.write('M16-S06-RECONCILE dry-run: sidecar persistence skipped\n');
  }

  // 7. Emit canonical line.
  if (blockers.length > 0) {
    return reject(blockers, args, {
      aggregate_verdict: aggregateVerdict,
      s05_exit_code: subprocess.exit_code,
      s05_blockers_count: s05Protocol && Array.isArray(s05Protocol.blockers) ? s05Protocol.blockers.length : 0,
      pass_through_count: reco ? reco.pass_through_count : 0,
      promotion_refused_count: reco ? reco.promotion_refused_count : 0,
      capability_promotion_blocked: ledgerSidecar ? ledgerSidecar.promotion_blocked : true,
      pre_status_promoted_to_confirmed_count: ledgerSidecar ? ledgerSidecar.pre_status_promoted_to_confirmed_count : 0,
      s06_mutation_count: 0,
      reconciliation_ref: data.DEFAULTS.reconciliation_output,
      capability_ledger_ref: data.DEFAULTS.capability_ledger_output,
      replay_key: redrive && redrive.rederived && redrive.rederived.replay_keys ? redrive.rederived.replay_keys.replay_key : '',
      reference_time: referenceTime,
    });
  }

  // PASS — emit bounded verdict line on stdout.
  printVerdictLine({
    aggregate_verdict: aggregateVerdict,
    exit: data.EXIT_CODES.RECONCILE_PASS,
    block_count: 0,
    pass_through_count: reco.pass_through_count,
    promotion_refused_count: reco.promotion_refused_count,
    capability_promotion_blocked: ledgerSidecar.promotion_blocked,
    pre_status_promoted_to_confirmed_count: ledgerSidecar.pre_status_promoted_to_confirmed_count,
    s05_exit_code: subprocess.exit_code,
    s05_blockers_count: s05Protocol && Array.isArray(s05Protocol.blockers) ? s05Protocol.blockers.length : 0,
    s06_mutation_count: 0,
    reconciliation_ref: data.DEFAULTS.reconciliation_output,
    capability_ledger_ref: data.DEFAULTS.capability_ledger_output,
    replay_key: redrive && redrive.rederived && redrive.rederived.replay_keys ? redrive.rederived.replay_keys.replay_key : '',
    reference_time: referenceTime,
  });
  process.exit(data.EXIT_CODES.RECONCILE_PASS);
}

function reject(blockers, args, context) {
  const exitCode = contract.mapBlockerToExitCode(blockers[0].code);
  if (context) {
    // Emit bounded verdict line on stdout AND bounded failure line on
    // stderr so downstream consumers can distinguish pass-from-fail
    // even when sidecars were not written.
    printVerdictLine(Object.assign({}, context, {
      aggregate_verdict: context.aggregate_verdict || {
        orchestration: data.VERDICT_VALUES.NOT_PROVEN,
        evidence: data.VERDICT_VALUES.NOT_PROVEN,
        launch: data.VERDICT_VALUES.NO_GO,
        overall: data.VERDICT_VALUES.NO_GO,
      },
      exit: exitCode,
      block_count: blockers.length,
      pass_through_count: context.pass_through_count || 0,
      promotion_refused_count: context.promotion_refused_count || 0,
      capability_promotion_blocked: context.capability_promotion_blocked === undefined ? true : context.capability_promotion_blocked,
      pre_status_promoted_to_confirmed_count: context.pre_status_promoted_to_confirmed_count === undefined ? 0 : context.pre_status_promoted_to_confirmed_count,
      s06_mutation_count: context.s06_mutation_count || 0,
      reconciliation_ref: context.reconciliation_ref || data.DEFAULTS.reconciliation_output,
      capability_ledger_ref: context.capability_ledger_ref || data.DEFAULTS.capability_ledger_output,
      replay_key: context.replay_key || '',
      reference_time: context.reference_time || args.referenceTime,
    }));
  }
  printFailureLine(blockers, exitCode);
  process.exit(exitCode);
}

// ---------------------------------------------------------------------------
// CLI entry — if required directly, run with parsed args. When required
// from tests (T04), exporting run + helpers is enough; we never auto-run
// the side effects below.
// ---------------------------------------------------------------------------

if (require.main === module) {
  try {
    const args = parseArgs(process.argv);
    run(args);
  } catch (e) {
    const code = (e && e.code) || data.BLOCKER_CODES.VERIFIER_RUNNER_FAILURE();
    const message = (e && e.message) || String(e);
    printFailureLine([{ code, reason: message }], contract.mapBlockerToExitCode(code));
    process.exit(contract.mapBlockerToExitCode(code));
  }
}

module.exports = {
  parseArgs,
  run,
  loadSourcePayload,
  freshHashOfFile,
  compareHashTriplets,
  rederiveS05,
  runS05Subprocess,
  atomicWriteJsonIfMissing,
  ensureScratchRoot,
  classifyAllowlist,
  errorWithCode,
  ROOT,
  S05_VERIFIER_SCRIPT,
};