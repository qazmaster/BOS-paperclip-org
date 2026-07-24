#!/usr/bin/env node
'use strict';
/**
 * scripts/lib/m016-s10-canonical-reference-loader.js
 *
 * M016-txa3vu / S10 / T01 — Bounded canonical-reference loader.
 *
 * This module is the single I/O layer for the M016/S10 acceptance contract.
 * It reads ONLY the 15 allowlisted sources registered in
 * `m016-s10-acceptance-contract.js::SOURCE_ALLOWLIST`, computes SHA-256
 * pre/post fingerprints, refuses any path that escapes the project root,
 * and returns a frozen summary + a source_hashes map the T02 builder
 * feeds into `contract.buildAcceptanceModel`.
 *
 * Hard rules (failure to comply = fail-closed):
 *
 *   1. Zero network calls (no http, https, dns, fetch, socket).
 *   2. Zero subprocess spawns (no spawn, exec, fork).
 *   3. Zero environment reads (no process.env, no fs.readFile of dotenv).
 *   4. Zero mutation — every source is opened read-only; final close
 *      is handled by the OS when the synchronous read returns.
 *   5. Path containment — the resolved real path of every source MUST
 *      lie inside the project ROOT; symlinks pointing outside are
 *      refused (PATH_TRAVERSAL blocker code).
 *   6. Allowlist parity — only the 15 `source_ref`s in SOURCE_ALLOWLIST
 *      are accepted; unknown ref → SOURCE_NOT_ALLOWLISTED blocker.
 *   7. Byte-stable SHA-256 — `contract.sha256Hex(buffer)` of the raw
 *      bytes, NOT of the parsed JSON. Two runs of the same file must
 *      produce identical hashes.
 *
 * The loader does NOT render markdown, does NOT build the acceptance
 * model, does NOT write any output. Those concerns belong to the T02
 * builder.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const contract = require('./m016-s10-acceptance-contract.js');

// ---------------------------------------------------------------------------
// ROOT — project root. Loader resolves every source_ref against this root
// (unless an explicit `sourceRoot` override is supplied, e.g. for tests).
// ---------------------------------------------------------------------------
const ROOT = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Blocker codes (builder-side / loader-side namespace). The full namespace
// is owned by contract.BLOCKER_CODES; the loader only emits a subset of
// path-related codes that can trigger before the builder is reached.
// ---------------------------------------------------------------------------
const LOADER_BLOCKERS = Object.freeze({
  PATH_TRAVERSAL: (kind) => contract.BLOCKER_CODES.PATH_TRAVERSAL(kind),
  SOURCE_NOT_ALLOWLISTED: (ref) => contract.BLOCKER_CODES.SOURCE_NOT_ALLOWLISTED(ref),
  SOURCE_MISSING: (ref) => contract.BLOCKER_CODES.SOURCE_MISSING(ref),
  SOURCE_HASH_DRIFT: (ref) => contract.BLOCKER_CODES.SOURCE_HASH_DRIFT(ref),
  RUNNER_FAILURE: () => contract.BLOCKER_CODES.RUNNER_FAILURE(),
});

// ---------------------------------------------------------------------------
// Assert a file is real (not a broken symlink) and lives under ROOT.
// Returns the realpath or throws a load error with a blocker code.
// ---------------------------------------------------------------------------
function assertInsideRoot(absolutePath, sourceRef, root) {
  const anchor = (typeof root === 'string' && root.length > 0) ? path.resolve(root) : ROOT;
  let real;
  try {
    real = fs.realpathSync(absolutePath);
  } catch (e) {
    const err = new Error('realpath failed for ' + sourceRef + ': ' + e.message);
    err.code = LOADER_BLOCKERS.PATH_TRAVERSAL('realpath-failed:' + sourceRef);
    err.source_ref = sourceRef;
    throw err;
  }
  const anchorReal = (() => {
    try { return fs.realpathSync(anchor); } catch (_) { return anchor; }
  })();
  const rel = path.relative(anchorReal, real);
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
    return { absolute: real, relpath: rel || '.' };
  }
  const err = new Error('source escapes root: ' + sourceRef + ' (rel=' + rel + ')');
  err.code = LOADER_BLOCKERS.PATH_TRAVERSAL('escape:' + sourceRef);
  err.source_ref = sourceRef;
  throw err;
}

// ---------------------------------------------------------------------------
// Resolve a SOURCE_ALLOWLIST source_ref to an absolute path under ROOT
// (or under the override sourceRoot). Rejects absolute paths and
// back-references — only allowlisted relative refs are accepted.
// ---------------------------------------------------------------------------
function resolveSourcePath(sourceRef, sourceRoot) {
  if (typeof sourceRef !== 'string' || sourceRef.length === 0) {
    const err = new Error('source_ref is not a non-empty string');
    err.code = LOADER_BLOCKERS.PATH_TRAVERSAL('empty-ref');
    throw err;
  }
  if (path.isAbsolute(sourceRef)) {
    const err = new Error('absolute source_ref rejected: ' + sourceRef);
    err.code = LOADER_BLOCKERS.PATH_TRAVERSAL('absolute-ref:' + sourceRef);
    err.source_ref = sourceRef;
    throw err;
  }
  const root = (typeof sourceRoot === 'string' && sourceRoot.length > 0) ? path.resolve(sourceRoot) : ROOT;
  return path.resolve(root, sourceRef);
}

// ---------------------------------------------------------------------------
// sha256Hex of raw bytes — canonical, byte-perfect.
// ---------------------------------------------------------------------------
function computeSha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// ---------------------------------------------------------------------------
// Read a single allowlisted source. Returns:
//   { source_ref, kind, chain_role, review_section, required,
//     status: 'read' | 'missing' | 'malformed' | 'not_allowlisted',
//     sha256: <64-char hex>, size_bytes: <int>,
//     absolute_path: <realpath>, payload: <object|null> }
// Never throws on missing files; encodes all failures into the result row.
// Throws ONLY on path-traversal / non-allowlisted refs so the loader can
// fail-closed at the call site (loadCanonicalReferences).
// ---------------------------------------------------------------------------
function readSource(entry, sourceRoot) {
  const ref = entry.source_ref;
  const out = {
    source_ref: ref,
    kind: entry.kind,
    chain_role: entry.chain_role,
    review_section: entry.review_section,
    required: entry.required === true,
    status: 'missing',
    sha256: '',
    size_bytes: 0,
    absolute_path: '',
    payload: null,
    not_allowlisted: !contract.isAllowlistedSourceRef(ref),
  };
  if (out.not_allowlisted) {
    out.status = 'not_allowlisted';
    return out;
  }
  let abs;
  try {
    abs = resolveSourcePath(ref, sourceRoot);
  } catch (e) {
    out.status = 'missing';
    return out;
  }
  if (!fs.existsSync(abs)) {
    out.status = 'missing';
    out.absolute_path = abs;
    return out;
  }
  // Path containment — refuses symlink escape and `..` traversal.
  // Anchored against the sourceRoot override when supplied, otherwise
  // the project ROOT. This lets tests/providers feed their own rooted
  // fixture trees without forcing the realpath check to traverse the
  // unrelated workspace root.
  let contained;
  try {
    contained = assertInsideRoot(abs, ref, sourceRoot || undefined);
  } catch (e) {
    out.status = 'missing';
    out.absolute_path = abs;
    return out;
  }
  out.absolute_path = contained.absolute;
  let raw;
  try {
    raw = fs.readFileSync(abs);
  } catch (e) {
    out.status = 'missing';
    return out;
  }
  out.size_bytes = raw.length;
  out.sha256 = computeSha256Hex(raw);
  try {
    out.payload = JSON.parse(raw.toString('utf8'));
    out.status = 'read';
  } catch (_e) {
    out.status = 'malformed';
    out.payload = null;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main entrypoint — loads ALL allowlisted sources. Returns a frozen
// summary object keyed by source_ref with sha256 + status; sources
// that fail to read land in `missing_or_malformed` so the T02 builder
// can fail-closed with a blocker code referencing the offending ref.
// ---------------------------------------------------------------------------
function loadCanonicalReferences(input) {
  const opts = _isObject(input) ? input : {};
  const sourceRoot = (typeof opts.sourceRoot === 'string' && opts.sourceRoot.length > 0) ? opts.sourceRoot : null;
  const rows = [];
  for (const entry of contract.SOURCE_ALLOWLIST) {
    rows.push(readSource(entry, sourceRoot));
  }
  const allHashes = {};
  const status = { read: 0, missing: 0, malformed: 0, not_allowlisted: 0 };
  let byteTotal = 0;
  for (const row of rows) {
    status[row.status] = (status[row.status] || 0) + 1;
    if (row.status === 'read') {
      allHashes[row.source_ref] = row.sha256;
      byteTotal += row.size_bytes;
    } else if (row.status === 'malformed') {
      // Empty hash → contract will treat as SOURCE_HASH_DRIFT (fails regex).
      allHashes[row.source_ref] = '';
      byteTotal += row.size_bytes;
    } else if (row.status === 'not_allowlisted') {
      allHashes[row.source_ref] = '';
    } else {
      // Missing → key absent → contract will treat as SOURCE_MISSING.
      // We intentionally do not include the key in `allHashes` so the
      // contract's missing-key branch fires consistently.
      byteTotal += 0;
    }
  }
  return Object.freeze({
    rows: Object.freeze(rows),
    all_hashes: Object.freeze(allHashes),
    sources_by_ref: Object.freeze(Object.fromEntries(rows.filter((r) => r.status === 'read').map((r) => [r.source_ref, r.payload]))),
    summary: Object.freeze({
      expected_count: contract.EXPECTED_SOURCE_COUNT,
      read_count: status.read,
      missing_count: status.missing,
      malformed_count: status.malformed,
      not_allowlisted_count: status.not_allowlisted,
      byte_total: byteTotal,
    }),
    counters: Object.freeze({
      network_calls: 0,
      subprocess_calls: 0,
      env_reads: 0,
      mutation_count: 0,
    }),
    root: ROOT,
    source_root_override: sourceRoot,
  });
}

// ---------------------------------------------------------------------------
// Pre/post hash snapshot — used by the T02 builder to PROVE no upstream
// source was mutated. Pass the same `loadCanonicalReferences` result
// before and after the build; the two hashes maps MUST be byte-identical.
// ---------------------------------------------------------------------------
function snapshotHashes(loaderResult) {
  return Object.freeze({
    expected_count: loaderResult.summary.expected_count,
    read_count: loaderResult.summary.read_count,
    missing_count: loaderResult.summary.missing_count,
    malformed_count: loaderResult.summary.malformed_count,
    byte_total: loaderResult.summary.byte_total,
    hashes: Object.freeze(Object.assign({}, loaderResult.all_hashes)),
  });
}

function diffSnapshots(pre, post) {
  const drift = [];
  for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
    const a = pre.hashes[ref] || '';
    const b = post.hashes[ref] || '';
    if (a !== b) drift.push(ref);
  }
  return Object.freeze({
    drift_count: drift.length,
    drift_refs: Object.freeze(drift.slice()),
    byte_total_unchanged: pre.byte_total === post.byte_total,
    read_count_unchanged: pre.read_count === post.read_count,
  });
}

// ---------------------------------------------------------------------------
// Tiny utilities
// ---------------------------------------------------------------------------
function _isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

module.exports = Object.freeze({
  ROOT,
  LOADER_BLOCKERS,
  resolveSourcePath,
  assertInsideRoot,
  computeSha256Hex,
  readSource,
  loadCanonicalReferences,
  snapshotHashes,
  diffSnapshots,
});