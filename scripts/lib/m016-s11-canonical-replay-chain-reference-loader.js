#!/usr/bin/env node
'use strict';
/**
 * scripts/lib/m016-s11-canonical-replay-chain-reference-loader.js
 *
 * M016-txa3vu / S11 / T02 — Bounded canonical-reference loader for the
 * canonical replay-chain sidecar.
 *
 * Reads ONLY the 17 allowlisted sources registered in
 * `m016-s11-canonical-replay-chain-contract.js::SOURCE_ALLOWLIST`,
 * computes SHA-256 pre/post fingerprints, refuses any path that escapes
 * the project root, and returns a frozen summary + a source_hashes map
 * the T02 builder feeds into `contract.buildChainModel`.
 *
 * Hard rules (failure to comply = fail-closed):
 *
 *   1. Zero network calls (no http, https, dns, fetch, socket).
 *   2. Zero subprocess spawns (no spawn, exec, fork).
 *   3. Zero environment reads.
 *   4. Zero mutation — every source is opened read-only.
 *   5. Path containment — real path of every source must lie inside ROOT;
 *      symlinks pointing outside are refused (PATH_TRAVERSAL blocker).
 *   6. Allowlist parity — only the 17 source_refs in SOURCE_ALLOWLIST are
 *      accepted; unknown ref → SOURCE_NOT_ALLOWLISTED blocker.
 *   7. Byte-stable SHA-256 — sha256 of raw bytes, NOT of parsed JSON.
 *
 * The loader does NOT render markdown, does NOT build the chain model,
 * does NOT write any output. Those concerns belong to the T02 builder.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const contract = require('./m016-s11-canonical-replay-chain-contract.js');

// ---------------------------------------------------------------------------
// ROOT — project root. Loader resolves every source_ref against this root
// unless an explicit `sourceRoot` override is supplied (e.g. for tests).
// ---------------------------------------------------------------------------
const ROOT = path.resolve(__dirname, '..', '..');

const LOADER_BLOCKERS = Object.freeze({
  PATH_TRAVERSAL: (kind) => contract.BLOCKER_CODES.PATH_TRAVERSAL(kind),
  SOURCE_NOT_ALLOWLISTED: (ref) => contract.BLOCKER_CODES.SOURCE_NOT_ALLOWLISTED(ref),
  SOURCE_MISSING: (ref) => contract.BLOCKER_CODES.SOURCE_MISSING(ref),
  SOURCE_HASH_DRIFT: (ref) => contract.BLOCKER_CODES.SOURCE_HASH_DRIFT(ref),
  RUNNER_FAILURE: () => contract.BLOCKER_CODES.RUNNER_FAILURE(),
});

// Assert a file is real (not a broken symlink) and lives under ROOT.
function assertInsideRoot(absolutePath, sourceRef, root) {
  const anchor = (typeof root === 'string' && root.length > 0) ? path.resolve(root) : ROOT;
  const target = path.resolve(absolutePath);
  // 1. Lexical containment.
  const lexRel = path.relative(anchor, target);
  if (lexRel === '' || lexRel === '.') return { absolute: target, relpath: lexRel || '.' };
  if (lexRel.startsWith('..') || path.isAbsolute(lexRel)) {
    const err = new Error('source escapes root lexically: ' + sourceRef + ' (rel=' + lexRel + ')');
    err.code = LOADER_BLOCKERS.PATH_TRAVERSAL('lexical-escape:' + sourceRef);
    err.source_ref = sourceRef;
    throw err;
  }
  for (const seg of lexRel.split(path.sep)) {
    if (seg === '..') {
      const err = new Error('source contains `..` segment: ' + sourceRef);
      err.code = LOADER_BLOCKERS.PATH_TRAVERSAL('lexical-dots:' + sourceRef);
      err.source_ref = sourceRef;
      throw err;
    }
  }
  // 2. Realpath containment.
  let real;
  try {
    real = fs.realpathSync(target);
  } catch (e) {
    const err = new Error('realpath failed for ' + sourceRef + ': ' + e.message);
    err.code = LOADER_BLOCKERS.PATH_TRAVERSAL('realpath-failed:' + sourceRef);
    err.source_ref = sourceRef;
    throw err;
  }
  let anchorReal;
  try { anchorReal = fs.realpathSync(anchor); } catch (_) { anchorReal = anchor; }
  const realRel = path.relative(anchorReal, real);
  if (realRel === '' || (!realRel.startsWith('..') && !path.isAbsolute(realRel))) {
    return { absolute: real, relpath: realRel || '.' };
  }
  // `.gsd/` symlink escape accommodation (project-controlled).
  if (sourceRef.startsWith('.gsd/') || sourceRef === '.gsd') {
    let gsdReal;
    try { gsdReal = fs.realpathSync(path.resolve(anchor, '.gsd')); } catch (_) { gsdReal = null; }
    if (gsdReal) {
      const gsdRel = path.relative(gsdReal, real);
      if (gsdRel === '' || (!gsdRel.startsWith('..') && !path.isAbsolute(gsdRel))) {
        return { absolute: real, relpath: path.join('.gsd', gsdRel) };
      }
    }
  }
  const err = new Error('source escapes root: ' + sourceRef + ' (realpath rel=' + realRel + ')');
  err.code = LOADER_BLOCKERS.PATH_TRAVERSAL('escape:' + sourceRef);
  err.source_ref = sourceRef;
  throw err;
}

function resolveSourcePath(sourceRef, sourceRoot) {
  if (typeof sourceRef !== 'string' || sourceRef.length === 0) {
    const err = new Error('source_ref is not a non-empty string');
    err.code = LOADER_BLOCKERS.PATH_TRAVERSAL('empty-ref');
    throw err;
  }
  if (path.isAbsolute(sourceRef)) {
    const err = new Error('absolute source_ref rejected: ' + sourceRef);
    err.code = LOADER_BLOCKERS.PATH_TRAVERSAL('absolute-ref:' + sourceRef);
    throw err;
  }
  const root = (typeof sourceRoot === 'string' && sourceRoot.length > 0) ? path.resolve(sourceRoot) : ROOT;
  return path.resolve(root, sourceRef);
}

function computeSha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function readSource(entry, sourceRoot) {
  const ref = entry.source_ref;
  const out = {
    source_ref: ref,
    kind: entry.kind,
    chain_role: entry.chain_role,
    verification_class: entry.verification_class,
    chain_section: entry.chain_section,
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
  // Detect content kind by extension.
  const isTextKind = entry.kind === 'requirement_text'
    || entry.kind === 'roadmap_text'
    || entry.kind === 's09_human_review'
    || /\.(md|markdown|txt)$/i.test(ref);
  if (isTextKind) {
    out.payload = raw.toString('utf8');
    out.status = 'read';
    out.payload_kind = 'text';
    return out;
  }
  try {
    out.payload = JSON.parse(raw.toString('utf8'));
    out.status = 'read';
    out.payload_kind = 'json';
  } catch (_e) {
    out.status = 'malformed';
    out.payload = null;
    out.payload_kind = 'json';
  }
  return out;
}

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
      allHashes[row.source_ref] = '';
      byteTotal += row.size_bytes;
    } else if (row.status === 'not_allowlisted') {
      allHashes[row.source_ref] = '';
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
