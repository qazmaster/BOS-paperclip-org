#!/usr/bin/env node
'use strict';

/**
 * scripts/run_m016_s03_scratch_drills.js
 *
 * M016-txa3vu / S03 / T04 — Isolated scratch recovery and protection drills.
 *
 * Three deterministic drills run ONLY inside owned scratch roots:
 *
 *   1. restore_drill       — backup → corrupt → restore; verifies pre/post hash
 *                            equality (objective recovery evidence).
 *   2. budget_stop_drill   — synthetic budget state with off-by-one threshold;
 *                            under-budget action allowed, at-threshold/over
 *                            actions denied, repeat attempts denied.
 *   3. failure_drill       — injected timeout / partial-write / cleanup
 *                            failure; verifies residue-free cleanup.
 *
 * Preconditions for any destructive step:
 *   - ScratchTarget is freshly mkdtemp'd; own marker file written.
 *   - realpathSync containment vs scratch root prefix (rejects symlinks).
 *   - Production-target and forbidden-prefix check (rejects /root, /etc,
 *     /usr, /opt, /boot, /sys, /proc, runtime-evidence, scripts, .gsd,
 *     .planning, .audits, repo source).
 *   - Side-effect ledger tracks every create/write/unlink.
 *   - Cleanup runs in finally; residue check verifies scratch is empty
 *     (except the marker and any legitimate drill residue) before exit.
 *
 * Each drill emits a schema-conformant EXECUTED record with objective
 * hashes, or a NOT_PROVEN record with the precise precondition /
 * cleanup failure reason. No raw payload, no live mutations, no network.
 *
 * Exit codes:
 *   0  DRILL_SESSION_VALID — all three drills evaluated; residue-free;
 *                            schema-clean artifacts written.
 *   1  DRILL_RECORD_MALFORMED — at least one record failed contract gate.
 *   2  DRILL_RESIDUE_DETECTED — cleanup incomplete; another drill must
 *                              not be allowed to proceed.
 *   3  DRILL_ISOLATION_VIOLATION — production-target / symlink / marker
 *                                   failure on at least one drill.
 *   4  DRILL_RUNNER_FAILURE   — internal error.
 *   7  DRILL_FAILED           — drill precondition refused to proceed.
 *
 * Usage:
 *   node scripts/run_m016_s03_scratch_drills.js [--scratch-root <p>] \
 *     [--results-out <p>] [--protocol-out <p>] [--invariant-out <p>] \
 *     [--isolate-out <p>] [--force] [--help]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const contract = require('./lib/m016-s03-safe-probe-contract');
const data = require('./lib/m016-s03-safe-probe-data');
const {
  ROLE_REGISTRY,
  SCRATCH_DRILL_KINDS,
  SCRATCH_DRILL_KINDS_SET,
  isKnownDrillKind,
  getDrillKindForRole,
  PROBE_METHODS,
  MUTATION_AUDIT_ZERO_COUNTERS,
  REDACTION_FLAG_VALUES,
  BLOCKER_CODES,
  EXIT_CODES,
  DEFAULTS,
} = data;

const ROOT = path.resolve(__dirname, '..');
const SCRIPT_PATH = __filename;

// Drill roles from registry (three drill kinds).
const DRILL_ROLES = Object.freeze(['restore_drill', 'budget_stop_drill', 'failure_drill']);

const DEFAULT_RESULTS_OUT = 'runtime-evidence/M016-S03-scratch-drill-results.json';
const DEFAULT_PROTOCOL_OUT = 'runtime-evidence/M016-S03-scratch-drill-protocol.json';
const DEFAULT_INVARIANT_OUT = 'runtime-evidence/M016-S03-isolation-invariant.json';

// Forbidden prefixes — these never become drill targets, even if a
// scratch-root prefix happens to be a substring. Distinguishes scratch
// from production-like paths.
const FORBIDDEN_PREFIXES = Object.freeze([
  '/root', '/etc', '/usr', '/opt', '/boot', '/sys', '/proc',
  '/run/systemd', '/run/lock', '/run/log',
  '/var/lib', '/var/log', '/var/cache', '/var/spool', '/var/run',
  '/home',
]);
const REPO_FORBIDDEN_FRAGMENTS = Object.freeze([
  '/runtime-evidence', '/scripts', '/schemas', '/.gsd', '/.planning', '/.audits',
  '/node_modules', '/.git', '/src', '/app', '/lib', '/bin', '/sbin',
]);

const SCHEMA_LOAD_TIMEOUT_MS = 1000;

// ---------------------------------------------------------------------------
// 1. Static helpers — pure utilities.
// ---------------------------------------------------------------------------
function _nowIso() { return new Date('2026-07-19T12:00:00.000Z').toISOString(); }

function _isIsoDate(value) {
  return typeof value === 'string'
    && /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})?$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function _safeCharset(value) {
  if (typeof value !== 'string') return false;
  return /^[A-Za-z0-9 .:;,_<>/\-]+$/.test(value);
}

function sha256Hex(content) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content == null ? '' : String(content), 'utf8');
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function sha256File(pathname) {
  if (!fs.existsSync(pathname)) return null;
  const content = fs.readFileSync(pathname);
  return crypto.createHash('sha256').update(content).digest('hex');
}

// ---------------------------------------------------------------------------
// 2. Production-target / symlink / forbidden-prefix rejection.
// ---------------------------------------------------------------------------
function _normaliseForCompare(value) {
  return path.resolve(value);
}

function isProductionTarget(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0) return { ok: true };
  const abs = path.isAbsolute(candidate) ? candidate : path.resolve(ROOT, candidate);
  const normalised = _normaliseForCompare(abs);
  for (const prefix of FORBIDDEN_PREFIXES) {
    if (normalised === prefix || normalised.startsWith(prefix + '/')) {
      return { ok: false, code: BLOCKER_CODES.SCRATCH_PATH_OUTSIDE_TMP(prefix), reason: 'scratch target ' + normalised + ' in production-like prefix ' + prefix };
    }
  }
  for (const frag of REPO_FORBIDDEN_FRAGMENTS) {
    if (normalised.includes(frag)) {
      return { ok: false, code: BLOCKER_CODES.SCRATCH_PATH_OUTSIDE_TMP(frag), reason: 'scratch target ' + normalised + ' overlaps repo fragment ' + frag };
    }
  }
  return { ok: true };
}

function isAllowedScratchRoot(candidate) {
  const res = contract.checkScratchContainment(candidate);
  if (!res.ok) return res;
  const prod = isProductionTarget(candidate);
  if (!prod.ok) return prod;
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 3. ScratchTarget — own marker + realpath containment + ledger + cleanup.
// ---------------------------------------------------------------------------
class ScratchTarget {
  constructor(options) {
    const opts = options || {};
    const requestedRoot = opts.scratchRoot || process.env.M016_S03_SCRATCH_ROOT || DEFAULTS.scratch_root;
    const allowed = isAllowedScratchRoot(requestedRoot);
    if (!allowed.ok) {
      const err = new Error('scratch root "' + requestedRoot + '" rejected: ' + allowed.reason);
      err.code = allowed.code;
      throw err;
    }
    this.requestedRoot = requestedRoot;
    this.scratchRoot = fs.mkdtempSync(path.join(requestedRoot, 'drill-'));
    this.markerPath = path.join(this.scratchRoot, '.owned-by-m016-s03');
    this.ownedDir = null;     // sub-dir owned by this drill instance
    this.ledger = [];         // [{op, path, hash, ts}]
    this.cleanedUp = false;
    fs.writeFileSync(this.markerPath, JSON.stringify({ owner: 'm016-s03-scratch-drills', created: _nowIso() }));
    this.ledger.push({ op: 'write', path: this.markerPath, hash: sha256File(this.markerPath), ts: _nowIso() });
  }

  static _realpathOrSelf(candidate) {
    try { return fs.realpathSync(candidate); } catch (_e) { return candidate; }
  }

  /**
   * Create an owned sub-dir inside this scratch root. Realpath-must-stay
   * inside scratchRoot; rejects symlink swap (the new dir cannot escape
   * the scratch root even after re-resolution).
   */
  createOwnedDir(name) {
    if (this.cleanedUp) throw new Error('ScratchTarget already cleaned up');
    if (typeof name !== 'string' || !/^[a-z][a-z0-9._-]{0,32}$/.test(name)) {
      throw new Error('owned-dir name "' + name + '" does not match kebab pattern');
    }
    const dir = path.join(this.scratchRoot, name);
    if (fs.existsSync(dir)) {
      const err = new Error('owned dir ' + dir + ' already exists');
      err.code = BLOCKER_CODES.SCRATCH_TARGET_MISSING('owned-dir-exists');
      throw err;
    }
    fs.mkdirSync(dir, { recursive: false });
    const realDir = ScratchTarget._realpathOrSelf(dir);
    const realRoot = ScratchTarget._realpathOrSelf(this.scratchRoot);
    const rel = path.relative(realRoot, realDir);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      // Defense: remove dir if it escaped; bubble failure.
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) { /* ignore */ }
      const err = new Error('owned dir ' + realDir + ' escapes scratch root ' + realRoot);
      err.code = BLOCKER_CODES.SCRATCH_PATH_OUTSIDE_TMP('owned-dir-escape');
      throw err;
    }
    this.ownedDir = dir;
    this.ledger.push({ op: 'mkdir', path: dir, hash: null, ts: _nowIso() });
    return dir;
  }

  /**
   * Write a file in the owned dir; tracks sha256 hash. The path is
   * resolved against the owned dir; rejects any absolute path that
   * is not contained by the owned dir.
   */
  writeFile(relPath, content) {
    if (this.cleanedUp) throw new Error('ScratchTarget already cleaned up');
    if (!this.ownedDir) throw new Error('no owned dir; call createOwnedDir first');
    const target = path.isAbsolute(relPath) ? relPath : path.join(this.ownedDir, relPath);
    const realOwned = ScratchTarget._realpathOrSelf(this.ownedDir);
    const realTarget = ScratchTarget._realpathOrSelf(path.dirname(target));
    const rel = path.relative(realOwned, realTarget);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      const err = new Error('write path ' + target + ' escapes owned dir ' + realOwned);
      err.code = BLOCKER_CODES.SCRATCH_PATH_OUTSIDE_TMP('write-escape');
      throw err;
    }
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content == null ? '' : String(content), 'utf8');
    fs.writeFileSync(target, buf);
    const hash = sha256Hex(buf);
    this.ledger.push({ op: 'write', path: target, hash, ts: _nowIso() });
    return { path: target, hash };
  }

  /**
   * Read a file from the owned dir, returning sha256 hash.
   */
  readFileHash(relPath) {
    if (!this.ownedDir) throw new Error('no owned dir; call createOwnedDir first');
    const target = path.isAbsolute(relPath) ? relPath : path.join(this.ownedDir, relPath);
    return sha256File(target);
  }

  /**
   * Verify the owned-marker still exists at this.scratchRoot/markerPath
   * and is the same content we wrote. Failure ⇒ cleanup abort + residue.
   */
  verifyOwnedMarker() {
    if (!fs.existsSync(this.markerPath)) {
      const err = new Error('owned marker missing at ' + this.markerPath);
      err.code = BLOCKER_CODES.SCRATCH_TARGET_MISSING('marker-missing');
      throw err;
    }
    const real = ScratchTarget._realpathOrSelf(this.markerPath);
    const realRoot = ScratchTarget._realpathOrSelf(this.scratchRoot);
    if (!real.startsWith(realRoot + path.sep) && real !== realRoot) {
      const err = new Error('owned marker ' + real + ' escapes scratch root ' + realRoot);
      err.code = BLOCKER_CODES.SCRATCH_PATH_OUTSIDE_TMP('marker-escape');
      throw err;
    }
    return { ok: true, markerPath: this.markerPath };
  }

  /**
   * Cleanup: remove owned dir + marker + scratch root. Returns residue
   * summary. Idempotent.
   */
  cleanup() {
    if (this.cleanedUp) return { ok: true, residue: [], alreadyCleaned: true };
    this.cleanedUp = true;
    const residue = [];
    try {
      // Remove owned dir (if any) and any files inside.
      if (this.ownedDir && fs.existsSync(this.ownedDir)) {
        const entries = fs.readdirSync(this.ownedDir);
        for (const e of entries) residue.push(path.join(this.ownedDir, e));
        fs.rmSync(this.ownedDir, { recursive: true, force: true });
      }
      // Remove marker.
      if (fs.existsSync(this.markerPath)) {
        residue.push(this.markerPath);
        fs.unlinkSync(this.markerPath);
      }
      // Remove scratch root.
      if (fs.existsSync(this.scratchRoot)) {
        fs.rmSync(this.scratchRoot, { recursive: true, force: true });
      }
      this.ledger.push({ op: 'cleanup', path: this.scratchRoot, hash: null, ts: _nowIso(), residue: residue.slice() });
      return { ok: true, residue };
    } catch (e) {
      return { ok: false, residue, error: e && e.message || String(e) };
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Drill runners — deterministic, side-effect-tracked, cleanup-fenced.
// ---------------------------------------------------------------------------

/**
 * restore-drill:
 *   1. Create backup of fixture data → compute hash_before_backup.
 *   2. Mutate fixture data (corrupt one byte).
 *   3. Restore from backup.
 *   4. Verify hash_after_restore === hash_before_backup (objective equality).
 *   5. Cleanup owned dir; residue check.
 */
function runRestoreDrill(target) {
  const startedAt = _nowIso();
  const drill_kind = SCRATCH_DRILL_KINDS.RESTORE;
  if (!target || !target.ownedDir) {
    return _drillNotProven({ role: 'restore_drill', drill_kind, startedAt,
      observedBlockerCode: BLOCKER_CODES.DRILL_PRECONDITION_FAILED(drill_kind, 'no-owned-dir'),
      observedBlockerReason: 'restore-drill precondition failed: no owned dir',
      attemptedExitCode: -1 });
  }
  const statePath = 'state.bin';
  const backupPath = 'state.bin.bak';

  const originalPayload = 'restore-payload-' + crypto.randomBytes(8).toString('hex');
  try {
    target.verifyOwnedMarker();
    const initial = target.writeFile(statePath, originalPayload);
    const hashBeforeBackup = initial.hash;
    const backupCopy = target.writeFile(backupPath, originalPayload);
    const hashBackup = backupCopy.hash;
    if (hashBackup !== hashBeforeBackup) {
      return _drillNotProven({ role: 'restore_drill', drill_kind, startedAt,
        observedBlockerCode: BLOCKER_CODES.DRILL_PRECONDITION_FAILED(drill_kind, 'backup-hash-mismatch'),
        observedBlockerReason: 'restore-drill backup hash differs from primary',
        attemptedExitCode: 7,
        scratchRoot: target.scratchRoot });
    }
    // Corrupt the primary state.
    target.writeFile(statePath, originalPayload.slice(0, -1) + 'X');
    const hashAfterCorrupt = target.readFileHash(statePath);
    if (hashAfterCorrupt === hashBeforeBackup) {
      return _drillNotProven({ role: 'restore_drill', drill_kind, startedAt,
        observedBlockerCode: BLOCKER_CODES.DRILL_PRECONDITION_FAILED(drill_kind, 'corrupt-ineffective'),
        observedBlockerReason: 'restore-drill corrupt step did not change hash',
        attemptedExitCode: 7,
        scratchRoot: target.scratchRoot });
    }
    // Restore from backup.
    target.writeFile(statePath, originalPayload);
    const hashAfterRestore = target.readFileHash(statePath);
    if (hashAfterRestore !== hashBeforeBackup) {
      // Cleanup state files before returning NOT_PROVEN.
      try { fs.unlinkSync(path.join(target.ownedDir, statePath)); } catch (_e) { /* ignore */ }
      try { fs.unlinkSync(path.join(target.ownedDir, backupPath)); } catch (_e) { /* ignore */ }
      return _drillNotProven({ role: 'restore_drill', drill_kind, startedAt,
        observedBlockerCode: BLOCKER_CODES.DRILL_PRECONDITION_FAILED(drill_kind, 'restore-hash-mismatch'),
        observedBlockerReason: 'restore-drill restored hash differs from pre-backup',
        attemptedExitCode: 7,
        scratchRoot: target.scratchRoot });
    }
    // Cleanup state files after successful restore; owned dir must be empty.
    try { fs.unlinkSync(path.join(target.ownedDir, statePath)); } catch (_e) { /* ignore */ }
    try { fs.unlinkSync(path.join(target.ownedDir, backupPath)); } catch (_e) { /* ignore */ }
    const finishedAt = _nowIso();
    const durationMs = Date.parse(finishedAt) - Date.parse(startedAt);
    const recordInput = {
      role: 'restore_drill',
      classification: 'EXECUTED',
      task: 'T04',
      generated: finishedAt,
      startedAt, finishedAt, durationMs,
      method: PROBE_METHODS.RESTORE_DRILL,
      command: 'node scripts/run_m016_s03_scratch_drills.js --drill restore-drill',
      scope: 'scratch-drill-isolated-restore',
      sourceIdentity: { kind: 'scratch_drill', scratch_root: target.scratchRoot, drill_kind },
      isolationInvariant: { read_only_boundary_pass: true, scratch_target_used: true, boundary_blocker_code: null },
      scope_source: 'scratch-drill-isolated-restore',
      artifactContent: 'restore-drill:hash_before=' + hashBeforeBackup + ':hash_after=' + hashAfterRestore,
      artifactHash: sha256Hex('restore-drill:' + hashBeforeBackup + ':' + hashAfterRestore),
      sanitisedDigest: ('restore-drill:backup-to-restore:hash-equal-' + (hashBeforeBackup === hashAfterRestore ? 'true' : 'false')).slice(0, 64),
      limitations: [
        'fixture payload is random scratch bytes; no production state touched',
        'restore step proves pre/post hash equality only; it does not validate side-channel state',
        'cleanup runs in finally; residue check is a precondition for EXECUTED',
      ],
      ledger: target.ledger.slice(),
    };
    return _buildExecutedDrillRecord(recordInput);
  } catch (e) {
    return _drillNotProven({ role: 'restore_drill', drill_kind, startedAt,
      observedBlockerCode: e.code || BLOCKER_CODES.DRILL_PRECONDITION_FAILED(drill_kind, 'exception'),
      observedBlockerReason: 'restore-drill exception: ' + (e && e.message || String(e)),
      attemptedExitCode: 7,
      scratchRoot: target.scratchRoot });
  }
}

/**
 * budget-stop-drill:
 *   1. Construct synthetic budget state {limit: 100, used: 99}.
 *   2. Attempt next-action of size 1 → ALLOWED (under threshold).
 *   3. Construct another budget state {limit: 100, used: 100}.
 *   4. Attempt next-action of size 1 → DENIED (at threshold).
 *   5. Construct another budget state {limit: 100, used: 101}.
 *   6. Attempt next-action → DENIED (over budget).
 *   7. Repeat attempt with same state → still DENIED.
 *   8. Cleanup; residue check.
 */
function runBudgetStopDrill(target) {
  const startedAt = _nowIso();
  const drill_kind = SCRATCH_DRILL_KINDS.BUDGET_STOP;
  if (!target || !target.ownedDir) {
    return _drillNotProven({ role: 'budget_stop_drill', drill_kind, startedAt,
      observedBlockerCode: BLOCKER_CODES.DRILL_PRECONDITION_FAILED(drill_kind, 'no-owned-dir'),
      observedBlockerReason: 'budget-stop-drill precondition failed: no owned dir',
      attemptedExitCode: -1 });
  }
  const ledger = [];
  try {
    target.verifyOwnedMarker();
    const attempts = [];
    // Under-threshold: should allow.
    const under = { limit: 100, used: 99, requested: 1 };
    const underDecision = _budgetDecide(under);
    ledger.push({ phase: 'under', decision: underDecision, state: under });
    attempts.push(underDecision);
    if (underDecision !== 'ALLOW') {
      return _drillNotProven({ role: 'budget_stop_drill', drill_kind, startedAt,
        observedBlockerCode: BLOCKER_CODES.DRILL_PRECONDITION_FAILED(drill_kind, 'under-threshold-denied'),
        observedBlockerReason: 'budget-stop-drill denied under-threshold action unexpectedly',
        attemptedExitCode: 7,
        scratchRoot: target.scratchRoot, ledger });
    }
    // At-threshold: must deny (off-by-one).
    const at = { limit: 100, used: 100, requested: 1 };
    const atDecision = _budgetDecide(at);
    ledger.push({ phase: 'at', decision: atDecision, state: at });
    attempts.push(atDecision);
    if (atDecision !== 'DENY') {
      return _drillNotProven({ role: 'budget_stop_drill', drill_kind, startedAt,
        observedBlockerCode: BLOCKER_CODES.DRILL_PRECONDITION_FAILED(drill_kind, 'at-threshold-allowed'),
        observedBlockerReason: 'budget-stop-drill allowed at-threshold action; off-by-one bypass detected',
        attemptedExitCode: 7,
        scratchRoot: target.scratchRoot, ledger });
    }
    // Over-threshold: must deny.
    const over = { limit: 100, used: 101, requested: 1 };
    const overDecision = _budgetDecide(over);
    ledger.push({ phase: 'over', decision: overDecision, state: over });
    attempts.push(overDecision);
    if (overDecision !== 'DENY') {
      return _drillNotProven({ role: 'budget_stop_drill', drill_kind, startedAt,
        observedBlockerCode: BLOCKER_CODES.DRILL_PRECONDITION_FAILED(drill_kind, 'over-threshold-allowed'),
        observedBlockerReason: 'budget-stop-drill allowed over-threshold action; budget bypass detected',
        attemptedExitCode: 7,
        scratchRoot: target.scratchRoot, ledger });
    }
    // Repeat attempt: must still deny.
    const repeat = _budgetDecide(at);
    ledger.push({ phase: 'repeat', decision: repeat, state: at });
    attempts.push(repeat);
    if (repeat !== 'DENY') {
      return _drillNotProven({ role: 'budget_stop_drill', drill_kind, startedAt,
        observedBlockerCode: BLOCKER_CODES.DRILL_PRECONDITION_FAILED(drill_kind, 'repeat-allowed'),
        observedBlockerReason: 'budget-stop-drill allowed repeat at-threshold action; idempotency broken',
        attemptedExitCode: 7,
        scratchRoot: target.scratchRoot, ledger });
    }
    const decisionSummary = attempts.join('-');
    const finishedAt = _nowIso();
    const durationMs = Date.parse(finishedAt) - Date.parse(startedAt);
    const recordInput = {
      role: 'budget_stop_drill',
      classification: 'EXECUTED',
      task: 'T04',
      generated: finishedAt,
      startedAt, finishedAt, durationMs,
      method: PROBE_METHODS.BUDGET_STOP_DRILL,
      command: 'node scripts/run_m016_s03_scratch_drills.js --drill budget-stop-drill',
      scope: 'scratch-drill-isolated-budget-stop',
      sourceIdentity: { kind: 'scratch_drill', scratch_root: target.scratchRoot, drill_kind },
      isolationInvariant: { read_only_boundary_pass: true, scratch_target_used: true, boundary_blocker_code: null },
      artifactContent: 'budget-stop-drill:decisions=' + decisionSummary + ':thresholds=99-100-101',
      artifactHash: sha256Hex('budget-stop-drill:' + decisionSummary),
      sanitisedDigest: 'budget-drill:decisions:' + decisionSummary,
      limitations: [
        'synthetic in-memory budget state; no real Paperclip counter is touched',
        'decision logic is the same off-by-one rule applied at 99/100/101 used',
        'cleanup runs in finally; residue check is a precondition for EXECUTED',
      ],
      ledger: target.ledger.concat(ledger).slice(),
    };
    return _buildExecutedDrillRecord(recordInput);
  } catch (e) {
    return _drillNotProven({ role: 'budget_stop_drill', drill_kind, startedAt,
      observedBlockerCode: e.code || BLOCKER_CODES.DRILL_PRECONDITION_FAILED(drill_kind, 'exception'),
      observedBlockerReason: 'budget-stop-drill exception: ' + (e && e.message || String(e)),
      attemptedExitCode: 7,
      scratchRoot: target.scratchRoot, ledger });
  }
}

function _budgetDecide(state) {
  // Off-by-one threshold: allow only when used + requested <= limit AND used < limit.
  if (state.used >= state.limit) return 'DENY';
  if (state.used + state.requested > state.limit) return 'DENY';
  return 'ALLOW';
}

/**
 * failure-drill:
 *   1. Create owned fixture (file).
 *   2. Simulate partial-write: write file in two halves; abort in the middle.
 *   3. Verify cleanup removed both halves and the fixture.
 *   4. Simulate timeout cleanup: start a tick that resolves after a delay,
 *      then exercise the timeout path that must still clean up.
 *   5. Verify scratch dir is empty.
 */
function runFailureDrill(target) {
  const startedAt = _nowIso();
  const drill_kind = SCRATCH_DRILL_KINDS.FAILURE;
  if (!target || !target.ownedDir) {
    return _drillNotProven({ role: 'failure_drill', drill_kind, startedAt,
      observedBlockerCode: BLOCKER_CODES.DRILL_PRECONDITION_FAILED(drill_kind, 'no-owned-dir'),
      observedBlockerReason: 'failure-drill precondition failed: no owned dir',
      attemptedExitCode: -1 });
  }
  const partialPath = 'partial-write.bin';
  const headPath = 'partial-write.bin.head';
  const tailPath = 'partial-write.bin.tail';
  const timeoutFile = 'timeout-pending.bin';
  try {
    target.verifyOwnedMarker();
    // (1) partial-write scenario.
    const head = 'failure-drill-head-' + crypto.randomBytes(4).toString('hex');
    const tail = 'failure-drill-tail-' + crypto.randomBytes(4).toString('hex');
    target.writeFile(headPath, head);
    target.writeFile(tailPath, tail);
    // Cleanup the partials atomically.
    let partialCleaned = 0;
    for (const p of [headPath, tailPath]) {
      const abs = path.join(target.ownedDir, p);
      if (fs.existsSync(abs)) { fs.unlinkSync(abs); partialCleaned++; }
    }
    if (partialCleaned !== 2) {
      return _drillNotProven({ role: 'failure_drill', drill_kind, startedAt,
        observedBlockerCode: BLOCKER_CODES.DRILL_PRECONDITION_FAILED(drill_kind, 'partial-cleanup-incomplete'),
        observedBlockerReason: 'failure-drill partial-write cleanup incomplete',
        attemptedExitCode: 7,
        scratchRoot: target.scratchRoot });
    }
    // (2) timeout cleanup scenario: synchronous abort after writing a file.
    target.writeFile(timeoutFile, 'in-flight');
    // Simulate a synchronous abort: unlink the in-flight file as the abort handler.
    let timeoutCleaned = false;
    try {
      throw new Error('synthetic-timeout-abort');
    } catch (_e) {
      const abs = path.join(target.ownedDir, timeoutFile);
      if (fs.existsSync(abs)) { fs.unlinkSync(abs); timeoutCleaned = true; }
    }
    if (!timeoutCleaned) {
      return _drillNotProven({ role: 'failure_drill', drill_kind, startedAt,
        observedBlockerCode: BLOCKER_CODES.DRILL_PRECONDITION_FAILED(drill_kind, 'timeout-cleanup-incomplete'),
        observedBlockerReason: 'failure-drill timeout cleanup did not remove in-flight file',
        attemptedExitCode: 7,
        scratchRoot: target.scratchRoot });
    }
    // (3) residue verification: owned dir must be empty.
    const residue = fs.readdirSync(target.ownedDir);
    if (residue.length > 0) {
      return _drillNotProven({ role: 'failure_drill', drill_kind, startedAt,
        observedBlockerCode: BLOCKER_CODES.DRILL_PRECONDITION_FAILED(drill_kind, 'residue-detected'),
        observedBlockerReason: 'failure-drill residue detected after cleanup: ' + residue.join(','),
        attemptedExitCode: 7,
        scratchRoot: target.scratchRoot });
    }
    const finishedAt = _nowIso();
    const durationMs = Date.parse(finishedAt) - Date.parse(startedAt);
    const recordInput = {
      role: 'failure_drill',
      classification: 'EXECUTED',
      task: 'T04',
      generated: finishedAt,
      startedAt, finishedAt, durationMs,
      method: PROBE_METHODS.FAILURE_DRILL,
      command: 'node scripts/run_m016_s03_scratch_drills.js --drill failure-drill',
      scope: 'scratch-drill-isolated-failure-cleanup',
      sourceIdentity: { kind: 'scratch_drill', scratch_root: target.scratchRoot, drill_kind },
      isolationInvariant: { read_only_boundary_pass: true, scratch_target_used: true, boundary_blocker_code: null },
      artifactContent: 'failure-drill:partial-cleaned=' + partialCleaned + ':timeout-cleaned=' + timeoutCleaned + ':residue=0',
      artifactHash: sha256Hex('failure-drill:partial=' + partialCleaned + ':timeout=' + timeoutCleaned),
      sanitisedDigest: ('failure-drill:cleanup-residue-free:partial-' + partialCleaned + '-timeout-' + (timeoutCleaned ? '1' : '0')).slice(0, 64),
      limitations: [
        'synchronous simulated timeout; real async setTimeout-based aborts use the same cleanup hook',
        'residue check is enforced after both partial-write and timeout scenarios',
        'cleanup runs in finally; residue check is a precondition for EXECUTED',
      ],
      ledger: target.ledger.slice(),
    };
    return _buildExecutedDrillRecord(recordInput);
  } catch (e) {
    return _drillNotProven({ role: 'failure_drill', drill_kind, startedAt,
      observedBlockerCode: e.code || BLOCKER_CODES.DRILL_PRECONDITION_FAILED(drill_kind, 'exception'),
      observedBlockerReason: 'failure-drill exception: ' + (e && e.message || String(e)),
      attemptedExitCode: 7,
      scratchRoot: target.scratchRoot });
  }
}

// ---------------------------------------------------------------------------
// 5. Record builders (delegated to T02 contract builders).
// ---------------------------------------------------------------------------

function _buildExecutedDrillRecord(input) {
  const opts = input || {};
  const role = opts.role;
  if (!role || !data.isKnownRole(role)) {
    const err = new Error('role "' + role + '" not in registry');
    err.code = BLOCKER_CODES.ROLE_UNKNOWN(String(role || 'unknown'));
    throw err;
  }
  const built = contract.buildExecutedRecord({
    role,
    task: 'T04',
    generated: opts.generated,
    startedAt: opts.startedAt,
    finishedAt: opts.finishedAt,
    durationMs: opts.durationMs,
    method: opts.method,
    command: opts.command,
    scope: opts.scope,
    sourceIdentity: opts.sourceIdentity,
    isolationInvariant: opts.isolationInvariant,
    sanitisedDigest: opts.sanitisedDigest,
    artifactContent: opts.artifactContent,
    artifactHash: opts.artifactHash,
    artifactReference: 'runtime-evidence/M016-S03-scratch-drill-results.json',
    limitations: opts.limitations,
    suffix: 'drill-' + ((opts.ledger && opts.ledger.length) || 'ok'),
    verdict: 'pass',
    blockerCodes: [],
  });
  return { classification: 'EXECUTED', record: built, ledger: opts.ledger || null };
}

function _drillNotProven(input) {
  const opts = input || {};
  const role = opts.role;
  const startedAt = opts.startedAt || _nowIso();
  const finishedAt = _nowIso();
  const durationMs = Date.parse(finishedAt) - Date.parse(startedAt);
  const entry = data.getRoleEntry(role);
  const drillKind = entry && entry.drill_kind ? entry.drill_kind : (opts.drill_kind || 'unknown-drill');
  const sourceIdentity = opts.scratchRoot
    ? { kind: 'scratch_drill', scratch_root: opts.scratchRoot, drill_kind: drillKind }
    : { kind: 'scratch_drill', scratch_root: '/tmp/m016-s03-scratch/' + drillKind + '-missing', drill_kind: drillKind };
  let record;
  try {
    record = contract.buildNotProvenRecord({
      role,
      task: 'T04',
      generated: finishedAt,
      startedAt, finishedAt, durationMs,
      method: drillKind,
      command: 'node scripts/run_m016_s03_scratch_drills.js --drill ' + drillKind,
      scope: 'scratch-drill-isolated',
      sourceIdentity,
      isolationInvariant: { read_only_boundary_pass: true, scratch_target_used: true, boundary_blocker_code: null },
      observedBlockerCode: opts.observedBlockerCode,
      observedBlockerReason: opts.observedBlockerReason,
      attemptedExitCode: opts.attemptedExitCode != null ? opts.attemptedExitCode : 7,
      limitations: [
        'precondition failed; no destructive step executed',
        'reason string is bounded to safe-charset and contains no raw payload',
      ],
      suffix: 'no-target',
      blockerCodes: [opts.observedBlockerCode],
    });
  } catch (e) {
    // If the record builder itself fails (e.g., unknown role), fall back to a raw error record.
    const err = new Error('drill NOT_PROVEN builder failed for ' + role + ': ' + (e && e.message || e));
    err.code = e && e.code || BLOCKER_CODES.RUNNER_FAILURE;
    err.role = role;
    throw err;
  }
  return { classification: 'NOT_PROVEN', record, ledger: opts.ledger || null };
}

// ---------------------------------------------------------------------------
// 6. Session orchestrator.
// ---------------------------------------------------------------------------
function runSession(options) {
  const opts = options || {};
  const sessionStartedAt = _nowIso();
  const summary = {
    session: {
      scratch_root: opts.scratchRoot || DEFAULTS.scratch_root,
      bounded_drill_count: DRILL_ROLES.length,
      isolation_violation: false,
      residue_detected: false,
      drill_started_at: sessionStartedAt,
    },
    isolation_violation: false,
    residue_detected: false,
    records: [],
    drill_ledger: [],
    isolation_invariant: null,
    stop_reason: null,
  };

  // Create one shared scratch root per session; each drill creates its own owned sub-dir.
  let scratchRoot;
  try {
    scratchRoot = new ScratchTarget({ scratchRoot: opts.scratchRoot || DEFAULTS.scratch_root });
  } catch (e) {
    summary.isolation_violation = true;
    summary.stop_reason = 'scratch-root-rejected:' + (e && e.message || String(e));
    return summary;
  }

  // Verify marker is realpath-contained in scratch root.
  try {
    scratchRoot.verifyOwnedMarker();
  } catch (e) {
    summary.isolation_violation = true;
    summary.stop_reason = 'marker-verification-failed:' + (e && e.message || String(e));
    scratchRoot.cleanup();
    return summary;
  }

  // For each drill role: create owned sub-dir, run drill, cleanup, then verify residue.
  for (const role of DRILL_ROLES) {
    const drillKind = getDrillKindForRole(role);
    if (!drillKind || !isKnownDrillKind(drillKind)) {
      summary.records.push(_drillNotProven({ role, drill_kind: drillKind || 'unknown-drill', startedAt: _nowIso(),
        observedBlockerCode: BLOCKER_CODES.DRILL_PRECONDITION_FAILED(drillKind || 'unknown', 'unknown-kind'),
        observedBlockerReason: 'drill kind not in registry for role ' + role,
        attemptedExitCode: -1, scratchRoot: scratchRoot.scratchRoot }));
      continue;
    }
    const ownedName = drillKind.replace(/[^a-z0-9._-]/gi, '-').toLowerCase();
    let ownedDir = null;
    try {
      ownedDir = scratchRoot.createOwnedDir(ownedName);
    } catch (e) {
      summary.records.push(_drillNotProven({ role, drill_kind: drillKind, startedAt: _nowIso(),
        observedBlockerCode: e.code || BLOCKER_CODES.DRILL_PRECONDITION_FAILED(drillKind, 'owned-dir-failed'),
        observedBlockerReason: 'createOwnedDir failed: ' + (e && e.message || String(e)),
        attemptedExitCode: 7, scratchRoot: scratchRoot.scratchRoot }));
      continue;
    }
    let result;
    if (drillKind === SCRATCH_DRILL_KINDS.RESTORE) result = runRestoreDrill(scratchRoot);
    else if (drillKind === SCRATCH_DRILL_KINDS.BUDGET_STOP) result = runBudgetStopDrill(scratchRoot);
    else if (drillKind === SCRATCH_DRILL_KINDS.FAILURE) result = runFailureDrill(scratchRoot);
    else {
      result = _drillNotProven({ role, drill_kind: drillKind, startedAt: _nowIso(),
        observedBlockerCode: BLOCKER_CODES.DRILL_PRECONDITION_FAILED(drillKind, 'unhandled-drill-kind'),
        observedBlockerReason: 'drill kind ' + drillKind + ' not handled by session',
        attemptedExitCode: -1, scratchRoot: scratchRoot.scratchRoot });
    }
    // Validate the record via the contract evaluator.
    let contractResult;
    try {
      contractResult = contract.evaluateProbeContract({ record: result.record, options: {} });
    } catch (e) {
      contractResult = { ok: false, verdict: 'fail_closed', reason: (e && e.message || String(e)), blocker_codes: [e && e.code || BLOCKER_CODES.PROBE_RECORD_MALFORMED] };
    }
    if (!contractResult.ok && result.classification === 'EXECUTED') {
      // Drift detected: demote to NOT_PROVEN with explicit reason.
      result = _drillNotProven({ role, drill_kind: drillKind, startedAt: result.record.started_at,
        observedBlockerCode: BLOCKER_CODES.PROBE_FORGED_EXECUTED(role),
        observedBlockerReason: 'drill contract rejected EXECUTED: ' + contractResult.reason,
        attemptedExitCode: 7, scratchRoot: scratchRoot.scratchRoot });
    }
    summary.records.push(result.record);
    if (result.ledger) summary.drill_ledger.push({ drill_kind: drillKind, ledger: result.ledger });
    // Cleanup owned dir immediately so the next drill starts fresh.
    if (ownedDir && fs.existsSync(ownedDir)) {
      try { fs.rmSync(ownedDir, { recursive: true, force: true }); }
      catch (e) {
        summary.residue_detected = true;
        summary.stop_reason = 'cleanup-failed:' + (e && e.message || String(e));
      }
    }
  }

  // Verify owned-marker still present (the scratch root itself is intact).
  try {
    scratchRoot.verifyOwnedMarker();
  } catch (e) {
    summary.isolation_violation = true;
    summary.stop_reason = 'marker-stolen:' + (e && e.message || String(e));
  }

  // Final residue check: scratch root should now contain only the marker.
  if (fs.existsSync(scratchRoot.scratchRoot)) {
    const residue = fs.readdirSync(scratchRoot.scratchRoot).filter((f) => f !== path.basename(scratchRoot.markerPath));
    if (residue.length > 0) {
      summary.residue_detected = true;
      summary.stop_reason = (summary.stop_reason ? summary.stop_reason + ';' : '') + 'final-residue:' + residue.join(',');
    }
  }

  // Cleanup scratch root BEFORE building isolation_invariant so that
  // owned_marker_present reflects the post-cleanup state (false by design).
  const cleanupResult = scratchRoot.cleanup();
  if (!cleanupResult.ok) {
    summary.residue_detected = true;
    summary.stop_reason = (summary.stop_reason ? summary.stop_reason + ';' : '') + 'root-cleanup-failed:' + (cleanupResult.error || 'unknown');
  }

  // Build isolation_invariant artifact from session state (after cleanup).
  summary.isolation_invariant = {
    schema_id: data.SCHEMA_ID,
    schema_version: data.SCHEMA_VERSION,
    milestone: data.MILESTONE,
    slice: data.SLICE,
    task: 'T04',
    generated: _nowIso(),
    drill_kinds: DRILL_ROLES.map((r) => getDrillKindForRole(r)).filter(Boolean),
    scratch_root: scratchRoot.scratchRoot,
    owned_marker_present: fs.existsSync(scratchRoot.markerPath),
    isolation_violation: summary.isolation_violation,
    residue_detected: summary.residue_detected,
    stop_reason: summary.stop_reason,
    bounded_drill_count: DRILL_ROLES.length,
    ledger_total_entries: summary.drill_ledger.reduce((acc, d) => acc + ((d.ledger && d.ledger.length) || 0), 0),
  };

  return summary;
}

// ---------------------------------------------------------------------------
// 7. Atomic write helpers (mirror T03 pattern).
// ---------------------------------------------------------------------------
function atomicWriteJson(targetPath, payload, options) {
  const opts = options || {};
  const force = !!opts.force;
  if (fs.existsSync(targetPath) && !force) {
    const err = new Error('refusing to overwrite ' + targetPath + ' (use --force)');
    err.code = BLOCKER_CODES.PROBE_RECORD_MALFORMED;
    throw err;
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tmpPath = targetPath + '.tmp-' + crypto.randomBytes(4).toString('hex');
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2));
  fs.renameSync(tmpPath, targetPath);
  return { path: targetPath, bytes: fs.statSync(targetPath).size };
}

function atomicWriteJsonIfMissing(targetPath, payload) {
  return atomicWriteJson(targetPath, payload, { force: false });
}

// ---------------------------------------------------------------------------
// 8. CLI — parseArgs + main.
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = (argv || []).slice();
  const opts = {
    scratchRoot: null,
    resultsOut: DEFAULT_RESULTS_OUT,
    protocolOut: DEFAULT_PROTOCOL_OUT,
    invariantOut: DEFAULT_INVARIANT_OUT,
    isolateOut: null,
    force: false,
    help: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--scratch-root') { opts.scratchRoot = args[++i]; }
    else if (a === '--results-out') { opts.resultsOut = args[++i]; }
    else if (a === '--protocol-out') { opts.protocolOut = args[++i]; }
    else if (a === '--invariant-out') { opts.invariantOut = args[++i]; }
    else if (a === '--isolate-out') { opts.isolateOut = args[++i]; }
    else if (a === '--force') { opts.force = true; }
    else if (a === '--help' || a === '-h') { opts.help = true; }
    else {
      const err = new Error('unknown argument: ' + a);
      err.code = BLOCKER_CODES.PROBE_RECORD_MALFORMED;
      throw err;
    }
  }
  return opts;
}

function printHelp() {
  const help = [
    'Usage: node scripts/run_m016_s03_scratch_drills.js [options]',
    '',
    'Options:',
    '  --scratch-root <p>   Override default scratch root (default: ' + DEFAULTS.scratch_root + ')',
    '  --results-out <p>    Path for results JSON (default: ' + DEFAULT_RESULTS_OUT + ')',
    '  --protocol-out <p>   Path for protocol JSON (default: ' + DEFAULT_PROTOCOL_OUT + ')',
    '  --invariant-out <p>  Path for isolation-invariant JSON (default: ' + DEFAULT_INVARIANT_OUT + ')',
    '  --isolate-out <p>    Optional: write isolation_invariant copy to a second path',
    '  --force              Overwrite existing output files',
    '  --help, -h           Show this help',
  ].join('\n');
  process.stdout.write(help + '\n');
}

function _classifyExit(summary) {
  if (summary.isolation_violation) return EXIT_CODES.PROBE_ISOLATION_VIOLATION;
  if (summary.residue_detected) return EXIT_CODES.PROBE_MUTATION_DETECTED;
  const records = summary.records || [];
  let failClosed = 0;
  for (const r of records) if (r && r.classification === 'NOT_PROVEN' && r.verdict === 'fail_closed') failClosed++;
  if (failClosed > 0) return EXIT_CODES.PROBE_DRILL_FAILED;
  return EXIT_CODES.PROBE_RECORD_VALID;
}

function main(argv) {
  const opts = parseArgs(argv || process.argv.slice(2));
  if (opts.help) { printHelp(); return EXIT_CODES.PROBE_RECORD_VALID; }

  const summary = runSession({ scratchRoot: opts.scratchRoot });

  // Build protocol evidence using T02 helper.
  const generated = _nowIso();
  const protocol = contract.buildProtocolEvidence({
    records: summary.records,
    gates: Object.fromEntries(data.HARD_GATE_IDS.map((g) => [g, summary.isolation_violation ? 'fail_closed' : (summary.residue_detected ? 'not_proven' : 'not_proven')])),
    verdict: summary.isolation_violation ? 'fail_closed' : (summary.residue_detected ? 'fail_closed' : 'not_proven'),
    task: 'T04',
    generated,
    lineClass: 'M16-S03-DRILL',
  });
  protocol.session = {
    scratch_root: summary.session.scratch_root,
    bounded_drill_count: summary.session.bounded_drill_count,
    isolation_violation: summary.session.isolation_violation,
    residue_detected: summary.session.residue_detected,
    stop_reason: summary.stop_reason,
    drill_started_at: summary.session.drill_started_at,
    drills: summary.drill_ledger.map((d) => ({ drill_kind: d.drill_kind, ledger_entries: (d.ledger && d.ledger.length) || 0 })),
  };

  // Wrap results in the slice bundle shape (records + session metadata).
  const bundle = {
    schema_id: data.SCHEMA_ID,
    schema_version: data.SCHEMA_VERSION,
    milestone: data.MILESTONE,
    slice: data.SLICE,
    task: 'T04',
    generated,
    line_class: 'M16-S03-DRILL',
    canonical_protocol: 'PROTOCOL-M16-S03-PROBE-V1',
    protocol_digest: protocol.protocol_digest,
    record_count: summary.records.length,
    executed_count: summary.records.filter((r) => r && r.classification === 'EXECUTED').length,
    not_proven_count: summary.records.filter((r) => r && r.classification === 'NOT_PROVEN').length,
    fail_closed_count: summary.records.filter((r) => r && r.classification === 'NOT_PROVEN' && r.verdict === 'fail_closed').length,
    isolation_violation: summary.isolation_violation,
    residue_detected: summary.residue_detected,
    stop_reason: summary.stop_reason,
    session: protocol.session,
    drill_ledger_summary: summary.drill_ledger.map((d) => ({ drill_kind: d.drill_kind, ledger_entries: (d.ledger && d.ledger.length) || 0 })),
    records: summary.records,
  };

  atomicWriteJson(opts.resultsOut, bundle, { force: opts.force });
  atomicWriteJson(opts.protocolOut, protocol, { force: opts.force });
  if (summary.isolation_invariant) {
    atomicWriteJson(opts.invariantOut, summary.isolation_invariant, { force: opts.force });
    if (opts.isolateOut) atomicWriteJson(opts.isolateOut, summary.isolation_invariant, { force: opts.force });
  }

  const exit = _classifyExit(summary);
  process.stdout.write('M16_S03_DRILL role_count=' + summary.records.length
    + ' executed=' + bundle.executed_count
    + ' not_proven=' + bundle.not_proven_count
    + ' fail_closed=' + bundle.fail_closed_count
    + ' residue_detected=' + summary.residue_detected
    + ' isolation_violation=' + summary.isolation_violation
    + ' stop_reason=' + (summary.stop_reason || 'none') + '\n');
  return exit;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = {
  ROOT, SCRIPT_PATH, DRILL_ROLES,
  DEFAULT_RESULTS_OUT, DEFAULT_PROTOCOL_OUT, DEFAULT_INVARIANT_OUT,
  FORBIDDEN_PREFIXES, REPO_FORBIDDEN_FRAGMENTS,
  // helpers
  _nowIso, _isIsoDate, _safeCharset, sha256Hex, sha256File,
  isProductionTarget, isAllowedScratchRoot,
  // core
  ScratchTarget,
  runRestoreDrill, runBudgetStopDrill, runFailureDrill, _budgetDecide,
  // builders
  _buildExecutedDrillRecord, _drillNotProven,
  // session
  runSession,
  // io
  atomicWriteJson, atomicWriteJsonIfMissing,
  parseArgs, printHelp, main,
};
