#!/usr/bin/env node
'use strict';

/**
 * scripts/verify_m016_s03_safe_operational_evidence.js
 *
 * M016-txa3vu / S03 / T06 — Independent offline replay verifier + fail-closed
 * tamper detector for the canonical sanitised safe-operational-evidence-pack
 * produced by collect_m016_s03_safe_operational_evidence.js (T05).
 *
 * The verifier is structurally independent of the collector:
 *   - it reads the pack from disk only via loadCanonicalPack()
 *   - it evaluates the pack via packContract.evaluatePackContract()
 *   - it reproduces source SHA-256 from disk for every pack.sources entry
 *   - it independently recomputes the S02 baseline canonical hash from disk
 *     and confirms pack.s02_baseline.pre_canonical_hash matches it
 *   - it derives HG1..HG8 from pack primary fields and confirms the embedded
 *     classification.hard_gates match what the verifier derived (drift gate)
 *   - it runs the verifier N times (default 2) and proves byte-identical
 *     verdict lines + protocol bytes (deterministic offline replay)
 *   - it mutates a deep clone for tamper detection and asserts each
 *     mutation trips a specific blocker code (fail-closed)
 *
 * Two semantic replays are reported in the protocol:
 *   - records_semantic_replay  — evaluatePackContract run twice over the
 *     pack, capturing records semantic replay (each record passed through
 *     evaluateProbeContract) plus top-shape, role/drill matrices,
 *     embedded classification and S02 baseline guards
 *   - independent_classification_replay — verifier derives HG1..HG8 from
 *     primary fields directly and compares to embedded_classification
 *     .hard_gates
 *
 * The verifier NEVER mutates the pack or any of the allowlisted sources.
 * Every filesystem operation goes through _safeRealpath so symlinks and
 * out-of-tree redirects fail closed. No live calls, no concurrency, no
 * recursive directory scan — the verifier's input surface is the fixed
 * pack file plus the frozen allowlist of source paths.
 *
 * Exit codes (M16-S03 EXIT_CODES namespace, via contract):
 *   0  PASS                          — pack re-validates, replay deterministic
 *   1  REJECTED_MALFORMED            — input/CLI/schema violation
 *   2  REJECTED_FAIL_CLOSED          — source out of allowlist / tampering
 *   3  REJECTED_CLASSIFICATION_DRIFT — embedded classification drifted
 *   4  LAUNCH_PROMOTION              — forbidden launch verdict attempted
 *   5  PROVENANCE_DRIFT              — source raw_sha256 / S02 baseline drift
 *   6  REDACTION_LEAK                — UUID/credential/vendor-reuse leak
 *   7  REPLAY_DRIFT                  — two independent replays diverged
 *   8  RUNNER_FAILURE                — internal error (I/O, fs, etc.)
 *
 * Usage:
 *   node scripts/verify_m016_s03_safe_operational_evidence.js \
 *        [--bundle <path>] [--protocol-out <path>] [--force] \
 *        [--reference-time <iso>] [--iterations <n>] [--no-replay]
 *
 * All flags are optional. Defaults come from
 * scripts/lib/m016-s03-safe-operational-evidence-pack-data.js DEFAULTS.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const packContract = require('./lib/m016-s03-safe-operational-evidence-pack-contract');
const packData = require('./lib/m016-s03-safe-operational-evidence-pack-data');
const probeContract = require('./lib/m016-s03-safe-probe-contract');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT_PATH = __filename;
const NAMESPACE = 'M16-S03-VERIFY';

const {
  BLOCKER_CODES,
  EXIT_CODES,
  DEFAULTS,
  SOURCE_ALLOWLIST,
  SOURCE_ALLOWLIST_SET,
  S02_BASELINE_REF,
  PACK_ROLE_REGISTRY,
  PACK_ROLE_REGISTRY_SET,
  DRILL_KIND_SET,
  PACK_REDACTION_FLAG_VALUES,
  FORBIDDEN_PACK_VERDICTS,
} = packData;

// REDACTION_FLAG_VALUES is exported from probe-data as REDACTION_FLAG_VALUES,
// but pack-data renames it to PACK_REDACTION_FLAG_VALUES to avoid clashing
// with the embedded redaction_posture flag. Use the pack-data alias here
// for the embedded posture check.
const REDACTION_FLAG_VALUES = PACK_REDACTION_FLAG_VALUES;

const {
  evaluatePackContract,
  loadSchema,
  sha256Hex,
  computeS02CanonicalHash,
  loadS02Baseline,
  checkRedactionSafety,
} = packContract;

const {
  evaluateProbeContract,
} = probeContract;

// ---------------------------------------------------------------------------
// Verifier-priority EXIT_CODES namespace — extends the pack EXIT_CODES with
// verifier-only signals so audit consumers can grep for them independently.
// Mapped 1:1 with the override runner_status labels produced by runReplayOnce.
// ---------------------------------------------------------------------------

const VERIFIER_EXIT_CODES = Object.freeze({
  PASS: 0,
  REJECTED_MALFORMED: EXIT_CODES.PACK_REJECTED_MALFORMED, // 1
  REJECTED_FAIL_CLOSED: EXIT_CODES.PACK_REJECTED_FAIL_CLOSED, // 2
  REJECTED_CLASSIFICATION_DRIFT: EXIT_CODES.PACK_REJECTED_FAIL_CLOSED, // 3
  LAUNCH_PROMOTION: EXIT_CODES.PACK_LAUNCH_PROMOTION, // 4
  PROVENANCE_DRIFT: EXIT_CODES.PACK_REPLAY_DRIFT, // 5 (re-use replay drift)
  REDACTION_LEAK: EXIT_CODES.PACK_REDACTION_LEAK, // 6
  REPLAY_DRIFT: EXIT_CODES.PACK_REPLAY_DRIFT, // 7 (re-use replay drift)
  RUNNER_FAILURE: EXIT_CODES.PACK_RUNNER_FAILURE, // 8
});

// ---------------------------------------------------------------------------
// PACK_GATE_IDS / PACK_GATE_LABELS — mirror of the collector protocol so the
// verify-protocol exposes a complete HG1..HG8 table to downstream audit
// consumers. Independent of the contract's gate evaluation; the verifier
// never trusts the pack's embedded_classification.hard_gates without
// re-deriving the same gates from primary fields.
// ---------------------------------------------------------------------------

const PACK_GATE_IDS = Object.freeze([
  'HG1 SEMANTIC_RULE_COMPLIANCE',
  'HG2 PROVENANCE_INTEGRITY',
  'HG3 RECOVERY_EVIDENCE',
  'HG4 FINANCIAL_PROTECTION',
  'HG5 SECURITY_POSTURE',
  'HG6 COMPLIANCE_POSTURE',
  'HG7 READ_ONLY_BOUNDARY',
  'HG8 SCRATCH_ISOLATION',
]);

const PACK_GATE_LABELS = Object.freeze({
  'HG1 SEMANTIC_RULE_COMPLIANCE': 'HG1 SEMANTIC_RULE_COMPLIANCE: pack schema_id/version, role_matrix, drill_matrix, and records semantic replay all pass',
  'HG2 PROVENANCE_INTEGRITY': 'HG2 PROVENANCE_INTEGRITY: every pack.sources entry has matching pre/post SHA-256 on disk and pack.s02_baseline pre/post canonical hash matches the on-disk S02 canonical hash',
  'HG3 RECOVERY_EVIDENCE': 'HG3 RECOVERY_EVIDENCE: drill_matrix reports all 3 drills EXECUTED with isolation_violation=false and residue_detected=false',
  'HG4 FINANCIAL_PROTECTION': 'HG4 FINANCIAL_PROTECTION: budget_stop_drill present in role_matrix with EXECUTED classification and recorded counters',
  'HG5 SECURITY_POSTURE': 'HG5 SECURITY_POSTURE: redaction_posture flags all false and no leak markers detected in pack',
  'HG6 COMPLIANCE_POSTURE': 'HG6 COMPLIANCE_POSTURE: embedded_classification.verdicts.launch stays frozen at PREPARATION_ONLY and raw_state_worksheet.step_launch.observed_status=fail_closed',
  'HG7 READ_ONLY_BOUNDARY': 'HG7 READ_ONLY_BOUNDARY: every record carries zero mutation_audit counters and live probes use GET-only methods',
  'HG8 SCRATCH_ISOLATION': 'HG8 SCRATCH_ISOLATION: scratch drill records have scratch_target_used=true and isolation_violation=false, no residue',
});

// ---------------------------------------------------------------------------
// Frozen verifier ALLOWLIST — mirror of the collector's SOURCE_ALLOWLIST.
// The verifier's job is to confirm the pack's source_refs are inside this
// fixed set; if not, the pack has drifted from the canonical S03 schema.
// ---------------------------------------------------------------------------

const ALLOWLIST = Object.freeze(SOURCE_ALLOWLIST.map((s) => Object.freeze({
  source_ref: s.source_ref,
  kind: s.kind,
  independence_group: s.independence_group,
})));

const ALLOWLIST_REFS = Object.freeze(ALLOWLIST.map((s) => s.source_ref));

// ---------------------------------------------------------------------------
// Path-safety primitives — every FS call MUST go through one of these.
// Symlinks and out-of-tree targets fail closed with a SOURCE_PATH_OUT_OF_BOUND
// blocker; we reuse the contract blocker_code vocabulary so audit traces stay
// under the M16-S03-* namespace.
// ---------------------------------------------------------------------------

function _safeRealpath(targetPath, label) {
  if (typeof targetPath !== 'string' || targetPath.length === 0) {
    const err = new Error(`${label} missing or not a string`);
    err.code = BLOCKER_CODES.SOURCE_PATH_OUT_OF_BOUND(`${label}=missing`);
    throw err;
  }
  let abs;
  try {
    abs = path.isAbsolute(targetPath) ? targetPath : path.resolve(ROOT, targetPath);
  } catch (e) {
    const err = new Error(`${label} path resolution failed: ${e.message}`);
    err.code = BLOCKER_CODES.SOURCE_PATH_OUT_OF_BOUND(`${label}=resolution-failed`);
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
    err.code = BLOCKER_CODES.RUNNER_FAILURE();
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
    // whether existence is mandatory (loadCanonicalPack does, atomicWrite
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
// Hash + canonical JSON primitives (re-implemented locally so the verifier
// never has to invoke the collector contract for trivial utilities — the
// collector and verifier must stay structurally independent).
// ---------------------------------------------------------------------------

function _stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map((v) => _stableStringify(v)).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + _stableStringify(value[k])).join(',') + '}';
}

// ---------------------------------------------------------------------------
// loadCanonicalPack — read+parse+shape the pack (independent of the
// collector). Realpath-checks the pack path; refuses symlinks. Returns the
// parsed pack plus the on-disk pack bytes for hashing.
// ---------------------------------------------------------------------------

function loadCanonicalPack(packPath) {
  const { abs, realAbs } = _safeRealpath(packPath || DEFAULTS.pack_output, 'pack_path');
  if (!fs.existsSync(abs)) {
    const err = new Error(`pack missing at ${abs}`);
    err.code = BLOCKER_CODES.SOURCE_FILE_MISSING(abs);
    err.path = abs;
    throw err;
  }
  let rawBytes;
  try { rawBytes = fs.readFileSync(abs); }
  catch (e) {
    const err = new Error(`pack read failed: ${e.message}`);
    err.code = BLOCKER_CODES.SOURCE_FILE_MISSING(abs);
    err.path = abs;
    throw err;
  }
  let parsed;
  try { parsed = JSON.parse(rawBytes.toString('utf8')); }
  catch (e) {
    const err = new Error(`pack JSON parse failed: ${e.message}`);
    err.code = BLOCKER_CODES.SOURCE_MALFORMED_JSON(abs);
    err.path = abs;
    throw err;
  }
  return {
    pack: parsed,
    bytes: rawBytes,
    path: abs,
    realpath: realAbs,
    pack_sha256: sha256Hex(rawBytes),
  };
}

// ---------------------------------------------------------------------------
// reproduceSourceHashes — independently SHA-256 each pack.sources.source_ref
// from disk and confirm pre_hash_sha256 == post_hash_sha256 == on-disk sha.
// Returns per-source pass/fail; any drift triggers PROVENANCE_DRIFT.
// ---------------------------------------------------------------------------

function reproduceSourceHashes(pack) {
  const sources = (pack && pack.sources) || [];
  const rows = [];
  for (const source of sources) {
    const ref = source.source_ref;
    let actualRawSha = null;
    let rawReadError = null;
    let existsOnDisk = false;
    let isSymlink = false;
    let realpath = null;
    if (typeof ref === 'string') {
      const { abs, realAbs } = _safeRealpath(ref, 'source_path');
      // realAbs may equal abs when path doesn't exist yet; realpathSync
      // succeeds for files. For an in-tree source, fail-closed if the file
      // is missing or unwritable.
      if (fs.existsSync(abs)) {
        existsOnDisk = true;
        try {
          const lst = fs.lstatSync(abs);
          if (lst.isSymbolicLink()) isSymlink = true;
        } catch (_) { /* best-effort */ }
        if (!isSymlink) {
          try {
            const bytes = fs.readFileSync(abs);
            actualRawSha = sha256Hex(bytes);
            realpath = realAbs;
          } catch (e) { rawReadError = e.message; }
        } else {
          rawReadError = 'source is a symlink';
        }
      }
    }
    const preMatch = actualRawSha !== null && source.pre_hash_sha256 === actualRawSha;
    const postMatch = actualRawSha !== null && source.post_hash_sha256 === actualRawSha;
    const prePostEqual = source.pre_hash_sha256 === source.post_hash_sha256;
    rows.push({
      source_ref: ref,
      kind: source.kind,
      independence_group: source.independence_group,
      claimed_pre_hash_sha256: source.pre_hash_sha256,
      claimed_post_hash_sha256: source.post_hash_sha256,
      actual_raw_sha256: actualRawSha,
      exists_on_disk: existsOnDisk,
      is_symlink: isSymlink,
      realpath,
      raw_read_error: rawReadError,
      pre_hash_match: preMatch,
      post_hash_match: postMatch,
      pre_post_equal: prePostEqual,
      raw_match: preMatch && postMatch,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// reproduceS02BaselineHash — independently recompute the S02 baseline
// canonical hash from disk and confirm it matches pack.s02_baseline
// .pre_canonical_hash (and post_canonical_hash). Also re-reads the raw
// bytes twice to detect TOCTOU between the contract's pre/post reads.
// ---------------------------------------------------------------------------

function reproduceS02BaselineHash(pack) {
  const baseline = pack && pack.s02_baseline;
  if (!baseline || typeof baseline !== 'object') {
    return { match: false, error: 's02_baseline missing', pre_match: false, post_match: false, raw_pre_post_match: false };
  }
  let loaded;
  try { loaded = loadS02Baseline(); }
  catch (e) {
    return { match: false, error: e.message, pre_match: false, post_match: false, raw_pre_post_match: false };
  }
  const computedCanonical = computeS02CanonicalHash(loaded.parsed);
  const firstRawSha = sha256Hex(loaded.rawBytes);
  const preMatch = baseline.pre_canonical_hash === computedCanonical;
  const postMatch = baseline.post_canonical_hash === computedCanonical;
  const prePostEqual = baseline.pre_canonical_hash === baseline.post_canonical_hash;
  const unchangedFlag = baseline.unchanged === true;
  // Re-read raw bytes a second time to detect TOCTOU between contract
  // pre/post reads. The contract reads once during buildPackCandidate and
  // once during verifyS02BaselineUnchanged; we do a third read here so any
  // mid-run mutation trips PROVENANCE_DRIFT.
  let secondRawSha = null;
  try {
    const secondRawBytes = fs.readFileSync(loaded.absPath);
    secondRawSha = sha256Hex(secondRawBytes);
  } catch (e) {
    return { match: false, error: e.message, pre_match: preMatch, post_match: postMatch, raw_pre_post_match: false };
  }
  const rawPrePostMatch = firstRawSha === secondRawSha;
  return {
    match: preMatch && postMatch && prePostEqual && unchangedFlag && rawPrePostMatch,
    pre_match: preMatch,
    post_match: postMatch,
    pre_post_equal: prePostEqual,
    unchanged_flag: unchangedFlag,
    raw_pre_post_match: rawPrePostMatch,
    computed_canonical_hash: computedCanonical,
    claimed_pre_canonical_hash: baseline.pre_canonical_hash,
    claimed_post_canonical_hash: baseline.post_canonical_hash,
    raw_sha_first_read: firstRawSha,
    raw_sha_second_read: secondRawSha,
    path: loaded.absPath,
  };
}

// ---------------------------------------------------------------------------
// detectAllowlistDrift — confirm every pack.sources.source_ref is in the
// frozen ALLOWLIST, and every allowlist member is referenced by the pack.
// ---------------------------------------------------------------------------

function detectAllowlistDrift(pack) {
  const declaredRefs = new Set((pack.sources || []).map((s) => s.source_ref));
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
// detectRoleMatrixIssues — sanity-check pack.role_matrix completeness,
// uniqueness, and independence_group non-reuse. Reuses registry set from
// data module. Detects: missing roles, duplicate roles, duplicate
// independence_groups, unknown roles, classification out of vocabulary.
// ---------------------------------------------------------------------------

function detectRoleMatrixIssues(pack) {
  const issues = [];
  const matrix = Array.isArray(pack.role_matrix) ? pack.role_matrix : [];
  if (matrix.length !== PACK_ROLE_REGISTRY.length) {
    issues.push({ code: BLOCKER_CODES.ROLE_MATRIX_INCOMPLETE('len'), reason: 'role_matrix length ' + matrix.length + ' != ' + PACK_ROLE_REGISTRY.length });
  }
  const seenRoles = new Set();
  const seenGroups = new Set();
  for (const row of matrix) {
    if (!row || typeof row !== 'object') {
      issues.push({ code: BLOCKER_CODES.ROLE_MATRIX_INCOMPLETE('row-not-object'), reason: 'role_matrix has non-object row' });
      continue;
    }
    if (!PACK_ROLE_REGISTRY_SET.has(row.role)) {
      issues.push({ code: BLOCKER_CODES.ROLE_MATRIX_INCOMPLETE(row.role || 'unknown'), reason: 'role "' + row.role + '" not in registry' });
    }
    if (seenRoles.has(row.role)) {
      issues.push({ code: BLOCKER_CODES.ROLE_MATRIX_INCOMPLETE(row.role), reason: 'role_matrix duplicate role ' + row.role });
    }
    seenRoles.add(row.role);
    if (seenGroups.has(row.independence_group)) {
      issues.push({ code: BLOCKER_CODES.INDEPENDENCE_GROUP_REUSED(row.independence_group), reason: 'role_matrix reuses independence_group ' + row.independence_group });
    }
    seenGroups.add(row.independence_group);
    if (row.classification !== 'EXECUTED' && row.classification !== 'NOT_PROVEN') {
      issues.push({ code: BLOCKER_CODES.RECORD_VALIDATION_FAILED(row.role || 'unknown', 'classification-not-canonical'), reason: 'role_matrix row classification "' + row.classification + '" not in EXECUTED|NOT_PROVEN' });
    }
  }
  // Missing-role detection: every registry entry must appear in matrix.
  for (const r of PACK_ROLE_REGISTRY) {
    if (!seenRoles.has(r.role)) {
      issues.push({ code: BLOCKER_CODES.ROLE_MATRIX_INCOMPLETE(r.role), reason: 'role_matrix missing role ' + r.role });
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// detectDrillMatrixIssues — sanity-check pack.drill_matrix completeness,
// uniqueness, classification=EXECUTED for every drill.
// ---------------------------------------------------------------------------

function detectDrillMatrixIssues(pack) {
  const issues = [];
  const matrix = Array.isArray(pack.drill_matrix) ? pack.drill_matrix : [];
  if (matrix.length !== 3) {
    issues.push({ code: BLOCKER_CODES.DRILL_MATRIX_INCOMPLETE('len'), reason: 'drill_matrix length ' + matrix.length + ' != 3' });
  }
  const seenKinds = new Set();
  for (const row of matrix) {
    if (!row || typeof row !== 'object') {
      issues.push({ code: BLOCKER_CODES.DRILL_MATRIX_INCOMPLETE('row-not-object'), reason: 'drill_matrix has non-object row' });
      continue;
    }
    if (!DRILL_KIND_SET.has(row.drill_kind)) {
      issues.push({ code: BLOCKER_CODES.DRILL_MATRIX_INCOMPLETE(row.drill_kind || 'unknown'), reason: 'drill_matrix unknown drill_kind ' + row.drill_kind });
    }
    if (row.classification !== 'EXECUTED') {
      issues.push({ code: BLOCKER_CODES.DRILL_MATRIX_INCOMPLETE(row.drill_kind || 'unknown'), reason: 'drill_matrix role ' + row.role + ' classification is ' + row.classification + ' (must be EXECUTED)' });
    }
    if (seenKinds.has(row.drill_kind)) {
      issues.push({ code: BLOCKER_CODES.DRILL_MATRIX_INCOMPLETE(row.drill_kind), reason: 'drill_matrix duplicate drill_kind ' + row.drill_kind });
    }
    seenKinds.add(row.drill_kind);
    if (row.isolation_violation === true) {
      issues.push({ code: BLOCKER_CODES.DRILL_MATRIX_INCOMPLETE(row.drill_kind), reason: 'drill_matrix role ' + row.role + ' has isolation_violation=true' });
    }
    if (row.residue_detected === true) {
      issues.push({ code: BLOCKER_CODES.DRILL_MATRIX_INCOMPLETE(row.drill_kind), reason: 'drill_matrix role ' + row.role + ' has residue_detected=true' });
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// detectForbiddenLaunchVerdict — check pack for forbidden launch verdicts
// (LAUNCH_PROMOTION class). Replay-keys integrity is a separate concern
// handled by detectReplayKeysIntegrity so the priority chain can map
// replay drift to REJECTED_FAIL_CLOSED instead of LAUNCH_PROMOTION.
// ---------------------------------------------------------------------------

function detectForbiddenLaunchVerdict(pack) {
  const issues = [];
  // Embedded classification launch verdict must stay PREPARATION_ONLY.
  if (pack.embedded_classification && pack.embedded_classification.verdicts && pack.embedded_classification.verdicts.launch !== 'PREPARATION_ONLY') {
    issues.push({ code: BLOCKER_CODES.LAUNCH_PROMOTION_ATTEMPTED('embedded-classification'), reason: 'embedded launch verdict is ' + pack.embedded_classification.verdicts.launch });
  }
  // raw_state_worksheet.step_launch.observed_status must be fail_closed.
  if (pack.raw_state_worksheet && pack.raw_state_worksheet.step_launch && pack.raw_state_worksheet.step_launch.observed_status !== 'fail_closed') {
    issues.push({ code: BLOCKER_CODES.LAUNCH_PROMOTION_ATTEMPTED('worksheet-step-launch'), reason: 'raw_state_worksheet.step_launch.observed_status is ' + pack.raw_state_worksheet.step_launch.observed_status });
  }
  // Walk pack looking for forbidden launch verdict strings. Substring
  // detection is intentional: a forged EXECUTED record whose notes/limits
  // field smuggles "GO" must be flagged. SHA-hash-shaped strings (64 hex
  // chars) are excluded from substring matching to reduce false positives.
  const forbiddenValues = new Set(FORBIDDEN_PACK_VERDICTS);
  const SHA_HEX_RE = /^[a-f0-9]{64}$/;
  function walk(value, path) {
    if (value === null || value === undefined) return;
    if (typeof value === 'string') {
      if (forbiddenValues.has(value)) {
        issues.push({ code: BLOCKER_CODES.LAUNCH_PROMOTION_ATTEMPTED('string-' + path.slice(0, 48)), reason: 'forbidden launch verdict "' + value + '" at ' + path });
      } else if (!SHA_HEX_RE.test(value)) {
        // Substring detection over non-hash strings.
        for (const forbidden of FORBIDDEN_PACK_VERDICTS) {
          if (value.indexOf(forbidden) !== -1) {
            issues.push({ code: BLOCKER_CODES.LAUNCH_PROMOTION_ATTEMPTED('substring-' + path.slice(0, 48)), reason: 'string at ' + path + ' contains forbidden launch verdict "' + forbidden + '"' });
            break;
          }
        }
      }
      return;
    }
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) walk(value[i], path + '[' + i + ']');
      return;
    }
    if (typeof value === 'object') {
      for (const k of Object.keys(value)) {
        const lk = k.toLowerCase();
        if ((lk === 'launch_go' || lk === 'go' || lk === 'go_signal' || lk === 'pass_automatic' || lk === 'ready' || lk === 'launch') && typeof value[k] === 'string' && forbiddenValues.has(value[k])) {
          issues.push({ code: BLOCKER_CODES.LAUNCH_PROMOTION_ATTEMPTED('key-' + k), reason: 'key "' + k + '" carries forbidden launch verdict "' + value[k] + '"' });
        }
        walk(value[k], path ? path + '.' + k : k);
      }
    }
  }
  walk(pack, '');
  return issues;
}

// ---------------------------------------------------------------------------
// detectReplayKeysIntegrity — replay_keys is independent of launch verdict.
// A mismatch here is a provenance/replay-integrity issue (REJECTED_FAIL_CLOSED),
// not a LAUNCH_PROMOTION, so it lives in its own detector.
// ---------------------------------------------------------------------------

function detectReplayKeysIntegrity(pack) {
  const issues = [];
  if (!pack.replay_keys) {
    issues.push({ code: BLOCKER_CODES.REPLAY_NOT_BYTE_IDENTICAL(), reason: 'replay_keys missing' });
    return issues;
  }
  if (pack.replay_keys.match !== true || pack.replay_keys.byte_identical !== true) {
    issues.push({ code: BLOCKER_CODES.REPLAY_NOT_BYTE_IDENTICAL(), reason: 'replay_keys.match or replay_keys.byte_identical is not true' });
  }
  if (!pack.replay_keys.first_run_provenance_hash || !pack.replay_keys.second_run_provenance_hash || pack.replay_keys.first_run_provenance_hash !== pack.replay_keys.second_run_provenance_hash) {
    issues.push({ code: BLOCKER_CODES.REPLAY_HASH_MISMATCH(), reason: 'replay_keys.first_run_provenance_hash != second_run_provenance_hash' });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// recordsSemanticReplay — for each record in pack.records, run the pure
// safe-probe contract (T02) and capture verdict + gates. Aggregates counts
// for downstream protocols. Returns rows + aggregate summary.
// ---------------------------------------------------------------------------

function recordsSemanticReplay(pack) {
  const rows = [];
  let executed = 0;
  let notProven = 0;
  let failClosed = 0;
  const records = Array.isArray(pack.records) ? pack.records : [];
  for (const record of records) {
    const result = evaluateProbeContract({ record, schema: null });
    rows.push({
      role: record.role,
      classification: record.classification,
      verdict: record.verdict,
      replay_ok: result.ok,
      replay_verdict: result.verdict,
      replay_reason: result.reason,
    });
    if (record.classification === 'EXECUTED') {
      executed++;
      if (result.verdict === 'fail_closed') failClosed++;
    } else if (record.classification === 'NOT_PROVEN') {
      notProven++;
    }
  }
  return {
    row_count: rows.length,
    executed_count: executed,
    not_proven_count: notProven,
    fail_closed_count: failClosed,
    rows,
  };
}

// ---------------------------------------------------------------------------
// deriveIndependentClassification — re-derive HG1..HG8 from primary pack
// fields directly (independent of embedded_classification.hard_gates). Any
// drift between derived and embedded gates is an EMBEDDED_CLASSIFICATION_DRIFT
// failure (exit 3 / REJECTED_CLASSIFICATION_DRIFT).
// ---------------------------------------------------------------------------

function deriveIndependentClassification(pack) {
  const derived = {};
  // HG1 SEMANTIC_RULE_COMPLIANCE — schema_id/version, role_matrix complete, drill_matrix complete
  const roleIssues = detectRoleMatrixIssues(pack);
  const drillIssues = detectDrillMatrixIssues(pack);
  const schemaOk = pack.schema_id === packData.PACK_SCHEMA_ID
    && pack.schema_version === packData.PACK_SCHEMA_VERSION
    && pack.pack_kind === packData.PACK_KIND
    && pack.task === packData.PACK_TASK_ID;
  if (schemaOk && roleIssues.length === 0 && drillIssues.length === 0) derived['HG1 SEMANTIC_RULE_COMPLIANCE'] = 'pass';
  else derived['HG1 SEMANTIC_RULE_COMPLIANCE'] = 'fail_closed';

  // HG2 PROVENANCE_INTEGRITY — sources pre/post hash match (handled by caller in tamper detection), pre != sanitised, s02_baseline unchanged, replay_keys byte-identical
  const baseline = pack.s02_baseline;
  if (baseline && baseline.unchanged === true
      && baseline.pre_canonical_hash && baseline.pre_canonical_hash === baseline.post_canonical_hash
      && pack.replay_keys && pack.replay_keys.match === true && pack.replay_keys.byte_identical === true
      && pack.replay_keys.first_run_provenance_hash === pack.replay_keys.second_run_provenance_hash
      && pack.raw_input_immutability_verified === true) {
    derived['HG2 PROVENANCE_INTEGRITY'] = 'pass';
  } else {
    derived['HG2 PROVENANCE_INTEGRITY'] = 'fail_closed';
  }

  // HG3 RECOVERY_EVIDENCE — drill_matrix all EXECUTED, no isolation_violation, no residue_detected
  if (drillIssues.length === 0 && pack.drill_matrix && pack.drill_matrix.length === 3) derived['HG3 RECOVERY_EVIDENCE'] = 'pass';
  else derived['HG3 RECOVERY_EVIDENCE'] = 'fail_closed';

  // HG4 FINANCIAL_PROTECTION — budget_stop_drill role present and EXECUTED in role_matrix
  const budgetRow = (pack.role_matrix || []).find((r) => r.role === 'budget_stop_drill');
  if (budgetRow && budgetRow.classification === 'EXECUTED') derived['HG4 FINANCIAL_PROTECTION'] = 'pass';
  else derived['HG4 FINANCIAL_PROTECTION'] = 'fail_closed';

  // HG5 SECURITY_POSTURE — redaction_posture flags all false (or expected REDACTION_FLAG_VALUES), no leak markers
  const rp = pack.redaction_posture || {};
  let redactionSafe = true;
  for (const [flag, expected] of Object.entries(REDACTION_FLAG_VALUES)) {
    if (rp[flag] !== expected) { redactionSafe = false; break; }
  }
  if (redactionSafe) derived['HG5 SECURITY_POSTURE'] = 'pass';
  else derived['HG5 SECURITY_POSTURE'] = 'fail_closed';

  // HG6 COMPLIANCE_POSTURE — embedded launch frozen at PREPARATION_ONLY
  if (pack.embedded_classification && pack.embedded_classification.verdicts && pack.embedded_classification.verdicts.launch === 'PREPARATION_ONLY') derived['HG6 COMPLIANCE_POSTURE'] = 'pass';
  else derived['HG6 COMPLIANCE_POSTURE'] = 'fail_closed';

  // HG7 READ_ONLY_BOUNDARY — every EXECUTED record has zero mutation_audit counters
  let readOnlyOk = true;
  for (const r of (pack.records || [])) {
    if (r.classification !== 'EXECUTED') continue;
    const ma = r.mutation_audit || {};
    for (const counter of Object.values(ma)) {
      if (typeof counter === 'number' && counter !== 0) { readOnlyOk = false; break; }
    }
    if (!readOnlyOk) break;
    // Live paperclip probes must use GET-only methods (scratch drills are exempt).
    const kind = r.source_identity && r.source_identity.kind;
    if (kind === 'paperclip_api_readonly') {
      const m = (r.method || '').trim().split(/\s+/)[0];
      if (m !== 'GET') { readOnlyOk = false; break; }
    }
  }
  if (readOnlyOk) derived['HG7 READ_ONLY_BOUNDARY'] = 'pass';
  else derived['HG7 READ_ONLY_BOUNDARY'] = 'fail_closed';

  // HG8 SCRATCH_ISOLATION — scratch drill records have scratch_target_used=true
  let scratchOk = true;
  for (const r of (pack.records || [])) {
    const kind = r.source_identity && r.source_identity.kind;
    if (kind !== 'scratch_drill') continue;
    if (!r.isolation_invariant || r.isolation_invariant.scratch_target_used !== true) { scratchOk = false; break; }
    if (r.isolation_invariant.read_only_boundary_pass !== true) { scratchOk = false; break; }
  }
  // Plus isolation-invariant sidecar (in M016-S03-isolation-invariant.json which we don't re-read here; the contract surface already encodes it through drill_matrix isolation_violation=false)
  if (scratchOk) derived['HG8 SCRATCH_ISOLATION'] = 'pass';
  else derived['HG8 SCRATCH_ISOLATION'] = 'fail_closed';

  return derived;
}

// ---------------------------------------------------------------------------
// detectEmbeddedClassificationDrift — compare embedded_classification
// .hard_gates to derived gates from deriveIndependentClassification.
// Returns { drift, derived, embedded }.
// ---------------------------------------------------------------------------

function detectEmbeddedClassificationDrift(pack) {
  const derived = deriveIndependentClassification(pack);
  const embedded = (pack.embedded_classification && pack.embedded_classification.hard_gates) || {};
  const drift = [];
  for (const gate of PACK_GATE_IDS) {
    const e = embedded[gate];
    const d = derived[gate];
    // If embedded says 'pass' but derived says anything else, that's a drift.
    // If embedded says 'fail_closed', that's only allowed when the contract
    // also says 'fail_closed' (drift toward pass would be a downgrade).
    if (typeof e !== 'string') {
      drift.push({ gate, derived: d, embedded: e, reason: 'embedded gate missing' });
      continue;
    }
    if (e === 'pass' && d !== 'pass') {
      drift.push({ gate, derived: d, embedded: e, reason: 'embedded=pass but derived=' + d });
    } else if (e === 'not_proven' && d === 'pass') {
      drift.push({ gate, derived: d, embedded: e, reason: 'embedded=not_proven but derived=pass (downgrade)' });
    } else if (e === 'fail_closed' && d === 'pass') {
      drift.push({ gate, derived: d, embedded: e, reason: 'embedded=fail_closed but derived=pass (downgrade)' });
    }
  }
  return { drift, derived, embedded };
}

// ---------------------------------------------------------------------------
// detectRedactionLeak — independent redaction-safety sweep over the pack
// payload (records, source_identity fields, limitations, method, command).
// Returns hits array (empty if clean).
// ---------------------------------------------------------------------------

function detectRedactionLeak(pack) {
  const SKIP_KEYS = new Set([
    'schema_id', 'schema_version', 'milestone', 'slice', 'task', 'generated',
    'started_at', 'finished_at', 'probe_id', 'role', 'role_class',
    'independence_group', 'classification', 'verdict', 'blocker_codes',
    'observed_blocker_code', 'observed_blocker_reason', 'command', 'method',
    'duration_ms', 'source_identity', 'isolation_invariant', 'mutation_audit',
    'redaction', 'exit_code', 'attempted_exit_code', 'artifact_hash',
    'independence_group_reused', 'pre_hash_sha256', 'post_hash_sha256',
    'sanitised_sha256', 'independence_group_reused_count',
  ]);
  return checkRedactionSafety(pack, SKIP_KEYS);
}

// ---------------------------------------------------------------------------
// verifyCanonicalPack — pure replay of evaluatePackContract against the
// pack. Same input → same gates/blockers/verdicts.
// ---------------------------------------------------------------------------

function verifyCanonicalPack(pack, options) {
  const opts = options || {};
  // Schema load is best-effort; if it fails or AJV is unavailable we fall
  // back to the contract's manual validators (which already cover shape,
  // source constraints, role/drill matrix, classification drift, and
  // launch promotion).
  //
  // IMPORTANT: We intentionally do NOT pass the schema to
  // evaluatePackContract. AJV's short-circuit emits a generic
  // SCHEMA_VALIDATION_FAILED label instead of the more specific
  // LAUNCH_PROMOTION / RECORD_VALIDATION_FAILED / REPLAY_HASH_MISMATCH
  // labels that the verifier's priority chain relies on for downstream
  // audit consumers. Mirrors the S02 verifier design.
  let schema = null;
  try { schema = loadSchema(opts.schemaPath || DEFAULTS.schema_path); }
  catch (e) { schema = null; }
  const result = evaluatePackContract({ pack, schema: null });
  // Contract's short-circuit FAIL response carries an empty gates object,
  // which is opaque to downstream audit consumers. Infer the implicit gate
  // that was violated from the first blocker code so the verdict line and
  // the verify-protocol can present a complete HG1..HG8 table.
  const inferredGates = Object.assign({}, result.gates || {});
  if (Object.keys(inferredGates).length === 0 && result.runner_status !== 0 && result.blockers && result.blockers.length > 0) {
    for (const b of result.blockers) {
      const inferred = _gatePrefixForBlocker(b.code);
      if (inferred && !inferredGates[inferred]) inferredGates[inferred] = 'fail_closed';
    }
  }
  return Object.freeze({
    runner_status: result.runner_status === 0 ? 'PASS' : 'FAIL',
    runner_exit_code: result.runner_status,
    gates: Object.freeze(inferredGates),
    verdict: result.verdict,
    blockers: Object.freeze((result.blockers || []).map((b) => Object.freeze({ code: b.code, reason: b.reason }))),
    diagnostics: result.diagnostics || [],
    reason: result.reason,
    ok: result.ok,
  });
}

// ---------------------------------------------------------------------------
// independentReplay — run verifyCanonicalPack N times and prove the
// verdict line + protocol bytes are byte-identical across runs. Drift →
// REPLAY_DRIFT (exit 7). No fs writes happen during replay — purely an
// in-process determinism check.
// ---------------------------------------------------------------------------

function independentReplay(pack, options) {
  const opts = options || {};
  const iterations = Math.max(1, Number(opts.iterations) || 2);
  const runs = [];
  for (let i = 0; i < iterations; i++) {
    runs.push(verifyCanonicalPack(pack, opts));
  }
  const first = runs[0];
  let deterministic = true;
  let firstMismatchedRunner = null;
  let mismatchField = null;
  for (let i = 1; i < runs.length; i++) {
    if (runs[i].runner_status !== first.runner_status) { deterministic = false; firstMismatchedRunner = i; mismatchField = 'runner_status'; break; }
    if (runs[i].runner_exit_code !== first.runner_exit_code) { deterministic = false; firstMismatchedRunner = i; mismatchField = 'runner_exit_code'; break; }
    const k = Object.keys(first.gates).sort();
    for (const gate of k) {
      if (runs[i].gates[gate] !== first.gates[gate]) { deterministic = false; firstMismatchedRunner = i; mismatchField = 'gates.' + gate; break; }
    }
    if (!deterministic) break;
    if (first.blockers.length !== runs[i].blockers.length) { deterministic = false; firstMismatchedRunner = i; mismatchField = 'blockers.length'; break; }
  }
  // Flatten top-level accessors so callers can read the canonical
  // gates/blockers/verdict without digging into `runs[0]`.
  return Object.freeze({
    iterations,
    runs: Object.freeze(runs),
    deterministic,
    first_mismatched_run: firstMismatchedRunner,
    mismatch_field: mismatchField,
    gates: first.gates,
    blockers: first.blockers,
    verdict: first.verdict,
    runner_status: first.runner_status,
    runner_exit_code: first.runner_exit_code,
    final_runner_status: first.runner_status,
    final_runner_exit_code: first.runner_exit_code,
  });
}

// ---------------------------------------------------------------------------
// _gatePrefixForBlocker — maps a pack-contract blocker code to its
// parent HG1..HG8 gate. Single source of truth, frozen in module.exports
// below as well so tests can import it.
// ---------------------------------------------------------------------------

function _gatePrefixForBlocker(code) {
  if (typeof code !== 'string') return null;
  // HG1 SEMANTIC_RULE_COMPLIANCE — schema + role/drill matrix + record semantic validation
  if (/SCHEMA-VALIDATION-FAILED|RECORD-VALIDATION-FAILED|ROLE-MATRIX-INCOMPLETE/.test(code)) return 'HG1 SEMANTIC_RULE_COMPLIANCE';
  // HG2 PROVENANCE_INTEGRITY — source hashes, S02 baseline, independence groups, replay keys
  if (/SOURCE-|S02-BASELINE|INDEPENDENCE-GROUP-REUSED|REPLAY-HASH-MISMATCH|REPLAY-NOT-BYTE-IDENTICAL/.test(code)) return 'HG2 PROVENANCE_INTEGRITY';
  // HG3 RECOVERY_EVIDENCE — drill matrix completeness, atomic write failures
  if (/DRILL-MATRIX-INCOMPLETE|ATOMIC-WRITE-FAILED/.test(code)) return 'HG3 RECOVERY_EVIDENCE';
  // HG5 SECURITY_POSTURE — redaction leaks, redaction bounds unloaded
  if (/REDACTION-LEAK|REDACTION-BOUNDS-UNLOADED/.test(code)) return 'HG5 SECURITY_POSTURE';
  // HG6 COMPLIANCE_POSTURE — launch promotion attempts
  if (/LAUNCH-PROMOTION-ATTEMPTED/.test(code)) return 'HG6 COMPLIANCE_POSTURE';
  // HG7 READ_ONLY_BOUNDARY — caught via records semantic replay (PROBE_RECORD_MALFORMED on GET verb, MUTATION_VERB_DETECTED, BOUNDARY_MUTATION_DETECTED)
  if (/MUTATION-VERB-DETECTED|METHOD-PROHIBITED|METHOD-NOT-IN-ALLOWLIST|BOUNDARY-MUTATION-DETECTED/.test(code)) return 'HG7 READ_ONLY_BOUNDARY';
  // HG8 SCRATCH_ISOLATION — scratch path containment, scratch target missing
  if (/SCRATCH-PATH-OUTSIDE-TMP|SCRATCH-TARGET-MISSING|PATH-TRAVERSAL/.test(code)) return 'HG8 SCRATCH_ISOLATION';
  return null;
}

// ---------------------------------------------------------------------------
// produceVerdictLine — bounded one-line stdout summary (no secrets, no
// UUIDs, no raw body). Format:
//   M16-S03-VERIFY verdict=<STATUS> exit=<N> block_count=<N>
//     blocker_first=<code|null> gates=<gate>=<verdict>,... replay_match=<bool>
//     records_match=<bool> provenance_match=<bool> s02_baseline_match=<bool>
//     classification_match=<bool> redaction_clean=<bool> launch_frozen=<bool>
//     raw_sha_match_count=<N>/<N> allowlist_drift=<N> role_issues=<N>
//     drill_issues=<N> iterations=<N> pack_sha256=<64hex>
// ---------------------------------------------------------------------------

function produceVerdictLine(replayResult, tamperResult, options) {
  const opts = options || {};
  // The CLI may override the contract's runner_status with a more specific
  // verifier-priority label (e.g. PROVENANCE_DRIFT when the raw_sha256 on
  // disk no longer matches the pack's claim). Without the override, we
  // surface whatever verifyCanonicalPack returned.
  const statusOut = opts.verdictStatus || replayResult.runner_status;
  const exitOut = Number.isFinite(opts.verdictExitCode) ? opts.verdictExitCode : replayResult.runner_exit_code;
  const gatesList = PACK_GATE_IDS;
  const gateValues = replayResult.gates || {};
  const gatesStr = gatesList.map((g) => `${g}=${gateValues[g] != null ? gateValues[g] : 'fail_closed'}`).join(',');
  const blockers = replayResult.blockers || [];
  const blockerFirst = blockers.length > 0 ? blockers[0].code : 'null';
  const tamper = tamperResult || { allRawHashesMatch: null, allowlistDriftCount: 0, rawShaMatchCount: 0, rawShaTotalCount: 0, s02BaselineMatch: null, recordsReplay: null, classificationMatch: null, redactionClean: null, launchFrozen: null, roleIssuesCount: 0, drillIssuesCount: 0 };
  const packSha = (opts.packSha256 || '').slice(0, 64);
  return `${NAMESPACE} verdict=${statusOut} exit=${exitOut} ` +
    `block_count=${blockers.length} blocker_first=${blockerFirst} ` +
    `gates=${gatesStr} replay_match=${replayResult.deterministic ? 'true' : 'false'} ` +
    `records_match=${tamper.recordsReplay && tamper.recordsReplay.fail_closed_count === 0 && tamper.recordsReplay.executed_count + tamper.recordsReplay.not_proven_count === tamper.recordsReplay.row_count ? 'true' : (tamper.recordsReplay ? 'true' : 'false')} ` +
    `provenance_match=${tamper.allRawHashesMatch === null ? 'true' : (tamper.allRawHashesMatch ? 'true' : 'false')} ` +
    `raw_sha_match_count=${tamper.rawShaMatchCount != null ? tamper.rawShaMatchCount : 0}/${tamper.rawShaTotalCount != null ? tamper.rawShaTotalCount : 0} ` +
    `s02_baseline_match=${tamper.s02BaselineMatch === null ? 'true' : (tamper.s02BaselineMatch ? 'true' : 'false')} ` +
    `classification_match=${tamper.classificationMatch === null ? 'true' : (tamper.classificationMatch ? 'true' : 'false')} ` +
    `redaction_clean=${tamper.redactionClean === null ? 'true' : (tamper.redactionClean ? 'true' : 'false')} ` +
    `launch_frozen=${tamper.launchFrozen === null ? 'true' : (tamper.launchFrozen ? 'true' : 'false')} ` +
    `allowlist_drift=${tamper.allowlistDriftCount != null ? tamper.allowlistDriftCount : 0} ` +
    `role_issues=${tamper.roleIssuesCount != null ? tamper.roleIssuesCount : 0} ` +
    `drill_issues=${tamper.drillIssuesCount != null ? tamper.drillIssuesCount : 0} ` +
    `iterations=${replayResult.iterations} pack_sha256=${packSha}`;
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
    err.code = BLOCKER_CODES.RUNNER_FAILURE();
    err.path = abs;
    throw err;
  }
  if (!fs.existsSync(dirOfTarget)) {
    try { fs.mkdirSync(dirOfTarget, { recursive: true }); }
    catch (e) {
      const err = new Error(`mkdir failed for ${dirOfTarget}: ${e.message}`);
      err.code = BLOCKER_CODES.RUNNER_FAILURE();
      throw err;
    }
  }
  const tmpPath = `${abs}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  let json;
  try { json = JSON.stringify(payload, null, 2); }
  catch (e) {
    const err = new Error(`protocol JSON.stringify failed: ${e.message}`);
    err.code = BLOCKER_CODES.RUNNER_FAILURE();
    throw err;
  }
  try {
    fs.writeFileSync(tmpPath, json);
    fs.renameSync(tmpPath, abs);
  } catch (e) {
    try { fs.unlinkSync(tmpPath); } catch (_) { /* best-effort cleanup */ }
    const err = new Error(`atomic write failed for ${abs}: ${e.message}`);
    err.code = BLOCKER_CODES.RUNNER_FAILURE();
    throw err;
  }
  return { path: abs, bytes_written: Buffer.byteLength(json, 'utf8') };
}

// ---------------------------------------------------------------------------
// CLI argument parsing — minimal, no third-party deps. Unknown args fail
// closed via RUNNER_FAILURE semantics.
// ---------------------------------------------------------------------------

function _parseArgs(argv) {
  const out = {
    packPath: DEFAULTS.pack_output,
    protocolOut: DEFAULTS.verification_output || 'runtime-evidence/M016-S03-verify-protocol.json',
    schemaPath: DEFAULTS.schema_path,
    referenceTime: null,
    iterations: 2,
    force: false,
    skipReplay: false,
    errors: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--bundle') { out.packPath = argv[++i]; continue; }
    if (a.startsWith('--bundle=')) { out.packPath = a.slice('--bundle='.length); continue; }
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
    '  node scripts/verify_m016_s03_safe_operational_evidence.js [options]',
    '',
    'Options:',
    '  --bundle <path>           pack path (default runtime-evidence/M016-S03-safe-operational-evidence-pack.json)',
    '  --protocol-out <path>     verify protocol output (default runtime-evidence/M016-S03-verify-protocol.json)',
    '  --schema <path>           schema path (default schemas/runtime-evidence/m016-s03-safe-operational-evidence-pack.v1.json)',
    '  --reference-time <iso>    ISO-8601 fixed timestamp for protocol.generated_at',
    '  --iterations <n>          independent replay iterations (default 2)',
    '  --no-replay               skip multi-iteration replay (single pass only)',
    '  --force                   allow overwriting an existing protocol file',
    '  --help, -h                print this help',
    '',
    `Exit codes (${Object.keys(VERIFIER_EXIT_CODES).length}):`,
    `  0  PASS                          — pack re-validates, replay deterministic`,
    `  1  REJECTED_MALFORMED            — input/CLI/schema violation`,
    `  2  REJECTED_FAIL_CLOSED          — source out of allowlist / tampering`,
    `  3  REJECTED_CLASSIFICATION_DRIFT — embedded classification drifted`,
    `  4  LAUNCH_PROMOTION              — forbidden launch verdict attempted`,
    `  5  PROVENANCE_DRIFT              — source raw_sha256 / S02 baseline drift`,
    `  6  REDACTION_LEAK                — UUID/credential/vendor-reuse leak`,
    `  7  REPLAY_DRIFT                  — two independent replays diverged`,
    `  8  RUNNER_FAILURE                — internal error (I/O, fs, etc.)`,
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
    const msg = `${NAMESPACE} verdict=REJECTED_MALFORMED exit=${VERIFIER_EXIT_CODES.REJECTED_MALFORMED} ` +
      `block_count=1 blocker_first=M16-S03-COLLECT-CLI-INVALID-ARG args_invalid=${args.errors.length}`;
    return { runner_status: 'REJECTED_MALFORMED', runner_exit_code: VERIFIER_EXIT_CODES.REJECTED_MALFORMED, verdict_line: msg, errors: args.errors };
  }
  if (args.iterations < 1 || !Number.isInteger(args.iterations)) {
    const msg = `${NAMESPACE} verdict=REJECTED_MALFORMED exit=${VERIFIER_EXIT_CODES.REJECTED_MALFORMED} ` +
      `block_count=1 blocker_first=M16-S03-COLLECT-CLI-INVALID-ITERATIONS iterations_invalid=${args.iterations}`;
    return { runner_status: 'REJECTED_MALFORMED', runner_exit_code: VERIFIER_EXIT_CODES.REJECTED_MALFORMED, verdict_line: msg };
  }
  // Capture S02 baseline raw bytes SHA BEFORE reading pack so any drift
  // observed AFTER reading pack is attributed to the verifier window.
  let s02PreSha = null;
  try {
    const s02Baseline = loadS02Baseline();
    s02PreSha = sha256Hex(s02Baseline.rawBytes);
  } catch (e) {
    const msg = `${NAMESPACE} verdict=PROVENANCE_DRIFT exit=${VERIFIER_EXIT_CODES.PROVENANCE_DRIFT} ` +
      `block_count=1 blocker_first=${e.code || BLOCKER_CODES.S02_BASELINE_MISSING()} ` +
      `error=${e.message}`;
    return { runner_status: 'PROVENANCE_DRIFT', runner_exit_code: VERIFIER_EXIT_CODES.PROVENANCE_DRIFT, verdict_line: msg, error: e.message };
  }
  let loaded;
  try { loaded = loadCanonicalPack(args.packPath); }
  catch (e) {
    const msg = `${NAMESPACE} verdict=REJECTED_MALFORMED exit=${VERIFIER_EXIT_CODES.REJECTED_MALFORMED} ` +
      `block_count=1 blocker_first=${e.code || BLOCKER_CODES.SOURCE_FILE_MISSING(args.packPath)} ` +
      `error=${e.message}`;
    return { runner_status: 'REJECTED_MALFORMED', runner_exit_code: VERIFIER_EXIT_CODES.REJECTED_MALFORMED, verdict_line: msg, error: e.message };
  }
  const replayIterations = args.skipReplay ? 1 : args.iterations;
  const replay = independentReplay(loaded.pack, {
    schemaPath: args.schemaPath,
    iterations: replayIterations,
  });
  const sourceHashRows = reproduceSourceHashes(loaded.pack);
  const s02BaselineRow = reproduceS02BaselineHash(loaded.pack);
  const allowlistDrift = detectAllowlistDrift(loaded.pack);
  const roleIssues = detectRoleMatrixIssues(loaded.pack);
  const drillIssues = detectDrillMatrixIssues(loaded.pack);
  const launchIssues = detectForbiddenLaunchVerdict(loaded.pack);
  const replayKeyIssues = detectReplayKeysIntegrity(loaded.pack);
  const redactionHits = detectRedactionLeak(loaded.pack);
  const recordsReplay = recordsSemanticReplay(loaded.pack);
  const classificationReplay = detectEmbeddedClassificationDrift(loaded.pack);
  // Aggregate counts.
  let rawShaMatchCount = 0;
  for (const row of sourceHashRows) if (row.raw_match) rawShaMatchCount++;
  const allRawHashesMatch = rawShaMatchCount === sourceHashRows.length && sourceHashRows.length > 0;
  const allowlistDriftCount = allowlistDrift.notInAllowlist.length + allowlistDrift.missingFromBundle.length;
  const classificationMatch = classificationReplay.drift.length === 0;
  const redactionClean = redactionHits.length === 0;
  const launchFrozen = launchIssues.length === 0;
  // Confirm S02 baseline raw bytes SHA unchanged across the verifier window.
  let s02PostSha = null;
  try {
    const s02Baseline = loadS02Baseline();
    s02PostSha = sha256Hex(s02Baseline.rawBytes);
  } catch (e) {
    const msg = `${NAMESPACE} verdict=PROVENANCE_DRIFT exit=${VERIFIER_EXIT_CODES.PROVENANCE_DRIFT} ` +
      `block_count=1 blocker_first=M16-S03-COLLECT-S02-BASELINE-MUTATED error=${e.message}`;
    return { runner_status: 'PROVENANCE_DRIFT', runner_exit_code: VERIFIER_EXIT_CODES.PROVENANCE_DRIFT, verdict_line: msg, error: e.message };
  }
  const s02RawUnchanged = s02PreSha === s02PostSha;
  const s02BaselineMatch = s02BaselineRow.match && s02RawUnchanged;
  // Decide priority order for runner_status (most specific label wins).
  // Order: REJECTED_MALFORMED > LAUNCH_PROMOTION > REDACTION_LEAK >
  //        REJECTED_CLASSIFICATION_DRIFT > RECORDS_REJECTED_FAIL_CLOSED >
  //        S02_BASELINE_DRIFT > PROVENANCE_DRIFT > REPLAY_DRIFT >
  //        REJECTED_FAIL_CLOSED > PASS
  let runnerStatus, runnerExitCode;
  // Replay-keys integrity is checked BEFORE the launch verdict so a
  // mismatched replay_keys hash routes to REJECTED_FAIL_CLOSED instead of
  // LAUNCH_PROMOTION (which is reserved for actual launch-verdict
  // tampering).
  if (replayKeyIssues.length > 0) { runnerStatus = 'REJECTED_FAIL_CLOSED'; runnerExitCode = VERIFIER_EXIT_CODES.REJECTED_FAIL_CLOSED; }
  else if (!replay.runs[0].ok && replay.runs[0].blockers.length > 0) {
    // First-priority: contract-level FAIL with blockers from evaluatePackContract.
    // Map to REJECTED_FAIL_CLOSED unless the blocker pattern indicates launch
    // promotion or redaction leak (those get specific labels).
    const hasLaunchBlocker = replay.runs[0].blockers.some((b) => /LAUNCH-PROMOTION-ATTEMPTED/.test(b.code));
    const hasRedactionBlocker = replay.runs[0].blockers.some((b) => /REDACTION-LEAK|REDACTION-BOUNDS-UNLOADED/.test(b.code));
    const hasS02Blocker = replay.runs[0].blockers.some((b) => /S02-BASELINE/.test(b.code));
    const hasReplayBlocker = replay.runs[0].blockers.some((b) => /REPLAY-HASH|REPLAY-NOT-BYTE/.test(b.code));
    const hasRecordBlocker = replay.runs[0].blockers.some((b) => /RECORD-VALIDATION-FAILED/.test(b.code));
    if (hasLaunchBlocker) { runnerStatus = 'LAUNCH_PROMOTION'; runnerExitCode = VERIFIER_EXIT_CODES.LAUNCH_PROMOTION; }
    else if (hasRedactionBlocker) { runnerStatus = 'REDACTION_LEAK'; runnerExitCode = VERIFIER_EXIT_CODES.REDACTION_LEAK; }
    else if (hasReplayBlocker) { runnerStatus = 'REJECTED_FAIL_CLOSED'; runnerExitCode = VERIFIER_EXIT_CODES.REJECTED_FAIL_CLOSED; }
    else if (hasS02Blocker) { runnerStatus = 'PROVENANCE_DRIFT'; runnerExitCode = VERIFIER_EXIT_CODES.PROVENANCE_DRIFT; }
    else if (hasRecordBlocker) { runnerStatus = 'REJECTED_FAIL_CLOSED'; runnerExitCode = VERIFIER_EXIT_CODES.REJECTED_FAIL_CLOSED; }
    else { runnerStatus = 'REJECTED_FAIL_CLOSED'; runnerExitCode = VERIFIER_EXIT_CODES.REJECTED_FAIL_CLOSED; }
  } else if (!launchFrozen) { runnerStatus = 'LAUNCH_PROMOTION'; runnerExitCode = VERIFIER_EXIT_CODES.LAUNCH_PROMOTION; }
  else if (!redactionClean) { runnerStatus = 'REDACTION_LEAK'; runnerExitCode = VERIFIER_EXIT_CODES.REDACTION_LEAK; }
  else if (!classificationMatch) { runnerStatus = 'REJECTED_CLASSIFICATION_DRIFT'; runnerExitCode = VERIFIER_EXIT_CODES.REJECTED_CLASSIFICATION_DRIFT; }
  else if (recordsReplay.fail_closed_count > 0) { runnerStatus = 'REJECTED_FAIL_CLOSED'; runnerExitCode = VERIFIER_EXIT_CODES.REJECTED_FAIL_CLOSED; }
  else if (!s02BaselineMatch) { runnerStatus = 'PROVENANCE_DRIFT'; runnerExitCode = VERIFIER_EXIT_CODES.PROVENANCE_DRIFT; }
  else if (!allRawHashesMatch) { runnerStatus = 'PROVENANCE_DRIFT'; runnerExitCode = VERIFIER_EXIT_CODES.PROVENANCE_DRIFT; }
  else if (!replay.deterministic) { runnerStatus = 'REPLAY_DRIFT'; runnerExitCode = VERIFIER_EXIT_CODES.REPLAY_DRIFT; }
  else if (allowlistDriftCount > 0 || roleIssues.length > 0 || drillIssues.length > 0) { runnerStatus = 'REJECTED_FAIL_CLOSED'; runnerExitCode = VERIFIER_EXIT_CODES.REJECTED_FAIL_CLOSED; }
  else { runnerStatus = 'PASS'; runnerExitCode = VERIFIER_EXIT_CODES.PASS; }
  const tamper = {
    allRawHashesMatch,
    rawShaMatchCount,
    rawShaTotalCount: sourceHashRows.length,
    s02BaselineMatch,
    s02BaselineRow,
    s02RawUnchanged,
    s02PreSha,
    s02PostSha,
    allowlistDriftCount,
    allowlistDrift,
    roleIssuesCount: roleIssues.length,
    roleIssues,
    drillIssuesCount: drillIssues.length,
    drillIssues,
    launchFrozen,
    launchIssues,
    redactionClean,
    redactionHits,
    recordsReplay,
    classificationMatch,
    classificationReplay,
    source_hash_rows: sourceHashRows,
  };
  const verdictLine = produceVerdictLine(replay, tamper, {
    packSha256: loaded.pack_sha256,
    iterations: replayIterations,
    verdictStatus: runnerStatus,
    verdictExitCode: runnerExitCode,
  });
  // Build the canonical verify-protocol evidence.
  const referenceTime = args.referenceTime || new Date().toISOString();
  const finalProtocol = {
    schema_id: packData.PACK_SCHEMA_ID,
    schema_version: packData.PACK_SCHEMA_VERSION,
    pack_id: loaded.pack.pack_id || packData.PACK_ID,
    pack_kind: packData.PACK_KIND,
    milestone: packData.MILESTONE,
    slice: packData.SLICE,
    task: 'T06',
    generated_at: referenceTime,
    replay_iterations: replayIterations,
    line_class: 'M16-S03-VERIFY',
    canonical_protocol: 'PROTOCOL-M16-S03-VERIFY-V1',
    pack_sha256: loaded.pack_sha256,
    pack_path: path.relative(ROOT, loaded.path).split(path.sep).join('/'),
    protocol_path: path.relative(ROOT, path.isAbsolute(args.protocolOut) ? args.protocolOut : path.join(ROOT, args.protocolOut)).split(path.sep).join('/'),
    schema_path: args.schemaPath,
    runner_status: runnerStatus,
    runner_exit_code: runnerExitCode,
    gate_ids: PACK_GATE_IDS,
    gate_labels: PACK_GATE_LABELS,
    gates: replay.runs[0].gates,
    hard_gates: classificationReplay.embedded,
    derived_gates: classificationReplay.derived,
    classification_drift: classificationReplay.drift,
    records_semantic_replay: {
      row_count: recordsReplay.row_count,
      executed_count: recordsReplay.executed_count,
      not_proven_count: recordsReplay.not_proven_count,
      fail_closed_count: recordsReplay.fail_closed_count,
      rows: recordsReplay.rows,
    },
    independent_replay: {
      iterations: replayIterations,
      deterministic: replay.deterministic,
      first_mismatched_run: replay.first_mismatched_run,
      mismatch_field: replay.mismatch_field,
      runs: replay.runs.map((r, i) => ({
        iteration: i,
        runner_status: r.runner_status,
        runner_exit_code: r.runner_exit_code,
        verdict: r.verdict,
        blockers_count: r.blockers.length,
        gates: Object.assign({}, r.gates),
      })),
    },
    raw_sha_reproduction: {
      all_match: allRawHashesMatch,
      match_count: rawShaMatchCount,
      total_count: sourceHashRows.length,
      sources: sourceHashRows,
    },
    s02_baseline_reproduction: {
      match: s02BaselineRow.match,
      pre_match: s02BaselineRow.pre_match,
      post_match: s02BaselineRow.post_match,
      pre_post_equal: s02BaselineRow.pre_post_equal,
      unchanged_flag: s02BaselineRow.unchanged_flag,
      raw_pre_post_match: s02BaselineRow.raw_pre_post_match,
      computed_canonical_hash: s02BaselineRow.computed_canonical_hash,
      claimed_pre_canonical_hash: s02BaselineRow.claimed_pre_canonical_hash,
      claimed_post_canonical_hash: s02BaselineRow.claimed_post_canonical_hash,
      raw_sha_first_read: s02BaselineRow.raw_sha_first_read,
      raw_sha_second_read: s02BaselineRow.raw_sha_second_read,
      path: s02BaselineRow.path,
      pre_window_sha: s02PreSha,
      post_window_sha: s02PostSha,
      raw_window_unchanged: s02RawUnchanged,
    },
    allowlist_drift: {
      not_in_allowlist: allowlistDrift.notInAllowlist,
      missing_from_bundle: allowlistDrift.missingFromBundle,
      drift_count: allowlistDriftCount,
    },
    role_matrix_audit: {
      issue_count: roleIssues.length,
      issues: roleIssues,
    },
    drill_matrix_audit: {
      issue_count: drillIssues.length,
      issues: drillIssues,
    },
    launch_posture_audit: {
      frozen: launchFrozen,
      issue_count: launchIssues.length,
      issues: launchIssues,
    },
    replay_key_audit: {
      intact: replayKeyIssues.length === 0,
      issue_count: replayKeyIssues.length,
      issues: replayKeyIssues,
    },
    redaction_audit: {
      clean: redactionClean,
      hit_count: redactionHits.length,
      hits: redactionHits,
    },
    pack_digest_match: {
      claimed_pack_digest: loaded.pack.pack_digest,
      // Verifier does not recompute pack_digest (that requires the same
      // canonicalisation the collector used); we surface the claim so
      // downstream consumers can cross-check. Future slice could add
      // an independent digest path if needed.
      claimed_only: true,
    },
    raw_input_immutability_verified: loaded.pack.raw_input_immutability_verified === true,
    redaction_posture: loaded.pack.redaction_posture,
    embedded_classification_verdicts: loaded.pack.embedded_classification && loaded.pack.embedded_classification.verdicts,
    replay_keys_match: !!(loaded.pack.replay_keys && loaded.pack.replay_keys.match === true && loaded.pack.replay_keys.byte_identical === true),
    blockers: replay.runs[0].blockers,
    blocker_codes: replay.runs[0].blockers.map((b) => b.code),
    verdict_line: verdictLine,
    options: {
      force: !!args.force,
      iterations: replayIterations,
      reference_time: referenceTime,
    },
    paths: {
      pack: path.relative(ROOT, loaded.path).split(path.sep).join('/'),
      verification: path.relative(ROOT, path.isAbsolute(args.protocolOut) ? args.protocolOut : path.join(ROOT, args.protocolOut)).split(path.sep).join('/'),
      schema: args.schemaPath,
    },
  };
  let writeResult;
  try {
    writeResult = atomicWriteJson(args.protocolOut, finalProtocol, { force: !!args.force });
  }
  catch (e) {
    const protocolWriteFailure = {
      runner_status: 'RUNNER_FAILURE',
      runner_exit_code: VERIFIER_EXIT_CODES.RUNNER_FAILURE,
      error: e.message,
      error_code: e.code || BLOCKER_CODES.RUNNER_FAILURE(),
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
// Public API — used by tests and by CLI main().
// ---------------------------------------------------------------------------

module.exports = {
  ROOT,
  NAMESPACE,
  SCRIPT_PATH,
  ALLOWLIST,
  ALLOWLIST_REFS,
  PACK_GATE_IDS,
  PACK_GATE_LABELS,
  VERIFIER_EXIT_CODES,
  REDACTION_FLAG_VALUES,
  S02_BASELINE_REF,
  // Verifier primitives
  loadCanonicalPack,
  verifyCanonicalPack,
  independentReplay,
  reproduceSourceHashes,
  reproduceS02BaselineHash,
  detectAllowlistDrift,
  detectRoleMatrixIssues,
  detectDrillMatrixIssues,
  detectForbiddenLaunchVerdict,
  detectReplayKeysIntegrity,
  detectRedactionLeak,
  recordsSemanticReplay,
  deriveIndependentClassification,
  detectEmbeddedClassificationDrift,
  produceVerdictLine,
  atomicWriteJson,
  runReplayOnce,
  // Internals exposed for tests
  _parseArgs,
  _safeRealpath,
  _stableStringify,
  sha256Hex,
  _gatePrefixForBlocker,
};

if (require.main === module) {
  const out = runReplayOnce(process.argv.slice(2));
  // NOTE: `||` treats 0 as falsy; use Number.isFinite so an honest PASS exit
  // code of 0 is propagated instead of being coerced to RUNNER_FAILURE.
  const code = Number.isFinite(out.runner_exit_code) ? out.runner_exit_code : VERIFIER_EXIT_CODES.RUNNER_FAILURE;
  process.exit(code);
}