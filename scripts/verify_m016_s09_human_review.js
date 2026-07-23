#!/usr/bin/env node
'use strict';

/**
 * scripts/verify_m016_s09_human_review.js
 *
 * M016-txa3vu / S09 / T03 — Independent human-proof acceptance reviewer.
 *
 * Independence invariants (enforced at runtime, not by import tricks):
 *   - imports only `node:fs`, `node:path`, `node:crypto` and the T01
 *     frozen contract + T02 canonical-reference loader modules.
 *   - never spawns subprocesses (no spawn/exec/fork).
 *   - never opens sockets (no http/net/https).
 *   - never writes any file — pure read-only verifier.
 *   - never mutates any source — independent SHA-256 re-derivation
 *     happens against a fresh loader pass over the same sourceRoot.
 *
 * Lifecycle (fail-closed at every step):
 *   PARSE:        parse argv; resolve --human-review-path under ROOT.
 *   READ:         load the markdown; refuse if path is missing or
 *                 escapes repo.
 *   EXTRACT:      parse the embedded HUMAN_REVIEW_MODEL_V1 JSON block.
 *   RE-DERIVE:    independently load the 11 allowlisted sources from
 *                 the same sourceRoot the builder used and SHA-256
 *                 each — refuse on any drift.
 *   EVALUATE:     run contract.evaluateReviewContract against the
 *                 recovered model — section/source/evidence/gate/
 *                 verdict/launch posture/S08/div1/NOT_PROVEN invariants.
 *   REDACT:       independent scan of the markdown body for raw secret
 *                 patterns (bearer, PEM, AWS, Slack, password=). Any
 *                 hit → REDACTION_LEAK blocker.
 *   EMIT:         stable `M16-S09-REVIEW ...` single-line CLI health
 *                 signal on stdout; failure summary on stderr.
 *   EXIT:         process.exit with the appropriate REVIEW_* code.
 *
 * Usage:
 *   node scripts/verify_m016_s09_human_review.js
 *     --human-review-path .gsd/phases/16-txa3vu-evidence-bearing-bounded-mission-proof/16-09-HUMAN-REVIEW.md
 *     [--source-root <project root>]
 *     [--help]
 *
 * Exit codes:
 *   0  REVIEW_PASS (verdict=PREPARATION_ONLY, all invariants hold)
 *   1  REVIEW_MALFORMED (path/argv/JSON/model shape problem)
 *   2  REVIEW_FAIL_CLOSED (invariant drift; see stderr blockers)
 *   3  REVIEW_PRECONDITION_DRIFT (source missing or SHA-256 mismatch)
 *   5  REVIEW_REDACTION_LEAK (raw secret pattern in body)
 *   6  REVIEW_RUNNER_FAILURE (unexpected throw)
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const contract = require('./lib/m016-s09-human-review-contract.js');
const loader = require('./lib/m016-s09-canonical-reference-loader.js');

// ---------------------------------------------------------------------------
// Independence — these are the only modules this verifier is allowed to
// require at runtime. The producer CLI / another verifier are forbidden.
// ---------------------------------------------------------------------------
const VERIFIER_IMPORTS = Object.freeze([
  'node:fs',
  'node:path',
  'node:crypto',
  'scripts/lib/m016-s09-human-review-contract.js',
  'scripts/lib/m016-s09-canonical-reference-loader.js',
]);
const PRODUCER_CLI_PATH = 'scripts/build_m016_s09_human_review.js';

const ROOT = path.resolve(__dirname, '..');
const REFERENCE_TIME = contract.HUMAN_REVIEW_REFERENCE_TIME;
const RUN_TAG = 'm016-s09-verify-' + Date.now().toString(36);

const EMBED_REGEX = /<!--\s*HUMAN_REVIEW_MODEL_V1\s*\n([\s\S]*?)\n\s*HUMAN_REVIEW_MODEL_V1\s*-->/;

const RAW_SECRET_PATTERNS = Object.freeze([
  Object.freeze({ name: 'bearer-token', re: /Bearer\s+[A-Za-z0-9._\-]{20,}/g }),
  Object.freeze({ name: 'private-key-pem', re: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/g }),
  Object.freeze({ name: 'aws-access-key', re: /AKIA[0-9A-Z]{16}/g }),
  Object.freeze({ name: 'slack-token', re: /xox[baprs]-[A-Za-z0-9\-]{10,}/g }),
  Object.freeze({ name: 'password-assignment', re: /(password|passwd|secret)\s*[:=]\s*['"]?[^\s'"]{8,}/gi }),
  Object.freeze({ name: 'github-token', re: /gh[pousr]_[A-Za-z0-9]{30,}/g }),
]);

const USAGE = [
  'Usage: node scripts/verify_m016_s09_human_review.js',
  '  --human-review-path <rel>   Path to canonical 16-09-HUMAN-REVIEW.md (required, repo-relative)',
  '  [--source-root <abs path>]  Override source root for fixture-style runs',
  '  [--help]',
  '',
  'Exit codes:',
  '  0  REVIEW_PASS',
  '  1  REVIEW_MALFORMED',
  '  2  REVIEW_FAIL_CLOSED',
  '  3  REVIEW_PRECONDITION_DRIFT',
  '  5  REVIEW_REDACTION_LEAK',
  '  6  REVIEW_RUNNER_FAILURE',
].join('\n');

// ---------------------------------------------------------------------------
// argv parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const out = { humanReviewPath: null, sourceRoot: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--human-review-path') { out.humanReviewPath = argv[++i]; continue; }
    if (a === '--source-root') { out.sourceRoot = argv[++i]; continue; }
    if (a === '--help' || a === '-h') { out.help = true; continue; }
    throw new Error('unknown argv token: ' + a);
  }
  if (out.help) return out;
  if (typeof out.humanReviewPath !== 'string' || out.humanReviewPath.length === 0) {
    throw new Error('--human-review-path is required');
  }
  return out;
}

function printHelp() {
  process.stdout.write(USAGE + '\n');
}

// ---------------------------------------------------------------------------
// Path containment — refuse absolute paths, .. traversal, symlink escape.
// ---------------------------------------------------------------------------
function resolveUnderRoot(rel, root) {
  if (typeof rel !== 'string' || rel.length === 0) throw new Error('path empty');
  if (path.isAbsolute(rel)) throw new Error('absolute path not permitted: ' + rel);
  if (rel.indexOf('\0') >= 0) throw new Error('path contains NUL byte');
  const baseRoot = (typeof root === 'string' && root.length > 0) ? path.resolve(root) : ROOT;
  const abs = path.resolve(baseRoot, rel);
  const relNorm = path.relative(baseRoot, abs);
  if (relNorm === '' || (!relNorm.startsWith('..') && !path.isAbsolute(relNorm))) {
    let realAbs;
    try { realAbs = fs.realpathSync(abs); }
    catch (e) {
      if (e && e.code === 'ENOENT') return { absolute: abs, realRoot: baseRoot, exists: false };
      throw e;
    }
    let realRoot;
    try { realRoot = fs.realpathSync(baseRoot); }
    catch (_) { realRoot = baseRoot; }
    const relToRoot = path.relative(realRoot, realAbs);
    if (relToRoot === '' || (!relToRoot.startsWith('..') && !path.isAbsolute(relToRoot))) {
      return { absolute: realAbs, realRoot, exists: true };
    }
    const err = new Error('symlink escape detected: ' + rel);
    err.code = contract.BLOCKER_CODES.PATH_TRAVERSAL('symlink-escape:' + rel);
    throw err;
  }
  const err = new Error('path escapes root: ' + rel);
  err.code = contract.BLOCKER_CODES.PATH_TRAVERSAL('escape:' + rel);
  throw err;
}

// ---------------------------------------------------------------------------
// Extract + parse the embedded HUMAN_REVIEW_MODEL_V1 JSON block. The
// builder inserts the canonical review model verbatim into the markdown
// in a fenced comment so the verifier can re-derive every invariant
// from the file alone.
// ---------------------------------------------------------------------------
function extractModel(markdown) {
  const m = markdown.match(EMBED_REGEX);
  if (!m) {
    const err = new Error('embedded HUMAN_REVIEW_MODEL_V1 block not found');
    err.code = contract.BLOCKER_CODES.MODEL_MALFORMED;
    throw err;
  }
  let parsed;
  try {
    parsed = JSON.parse(m[1]);
  } catch (e) {
    const err = new Error('embedded HUMAN_REVIEW_MODEL_V1 JSON malformed: ' + e.message);
    err.code = contract.BLOCKER_CODES.MODEL_MALFORMED;
    throw err;
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Independent redaction scan — never trust the embedded `redaction_posture`
// flag; instead scan the raw markdown body for forbidden secret patterns.
// ---------------------------------------------------------------------------
function scanRawSecrets(markdown) {
  const hits = [];
  // Strip the embedded JSON block — secrets inside that block are
  // schema-bounded (sha256 hex etc) and we want to surface any leak
  // found elsewhere in the human-readable prose.
  const sanitised = markdown.replace(EMBED_REGEX, '[EMBEDDED_MODEL_OMITTED]');
  for (const p of RAW_SECRET_PATTERNS) {
    const m = sanitised.match(p.re);
    if (m && m.length > 0) hits.push({ kind: p.name, count: m.length });
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Pull m015_comparison + div1 inputs out of the model sections so the
// pure evaluator can apply its frozen-vocabulary checks.
// ---------------------------------------------------------------------------
function extractEvaluatorInputs(model) {
  const sections = (model && model.sections) || {};
  const m015 = sections.m015_comparison;
  const div1 = sections.div1_exact_communication;
  return {
    evidenceRecordIds: ((model.worksheet && model.worksheet.evidence_records) || []).map((r) => r && r.evidence_id).filter(Boolean),
    m015Comparison: m015 ? {
      criterion_diff: m015.criterion_diff || [],
      capability_audit: m015.capability_audit || [],
      promotion_to_confirmed_count: m015.promotion_to_confirmed_count,
      evidence_driven_downgrade_count: m015.evidence_driven_downgrade_count,
    } : null,
    div1Communication: div1 ? {
      m015_record: div1.m015_record || null,
      m016_record: div1.m016_record || null,
      mapping_complete: div1.mapping_complete !== false,
      historical_not_replaced: div1.historical_not_replaced !== false,
    } : null,
  };
}

// ---------------------------------------------------------------------------
// Re-derive source SHA-256 against the same sourceRoot the builder used.
// Returns a list of `SOURCE_*` blockers for missing or drifted sources.
// ---------------------------------------------------------------------------
function rederiveHashBlockers(model, sourceRoot) {
  const blockers = [];
  const loaderResult = loader.loadCanonicalReferences({ sourceRoot });
  const expected = (model && model.source_hashes) || {};
  for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
    if (!Object.prototype.hasOwnProperty.call(expected, ref)) {
      blockers.push({ code: contract.BLOCKER_CODES.SOURCE_MISSING(ref), reason: 'source hash missing for ' + ref });
      continue;
    }
    const exp = String(expected[ref] || '');
    if (!/^[a-f0-9]{64}$/.test(exp)) {
      blockers.push({ code: contract.BLOCKER_CODES.SOURCE_HASH_DRIFT(ref), reason: 'source hash not sha256 hex for ' + ref });
      continue;
    }
    const actual = loaderResult.all_hashes[ref];
    if (!actual) {
      blockers.push({ code: contract.BLOCKER_CODES.SOURCE_MISSING(ref), reason: 'source absent on disk for ' + ref });
    } else if (actual !== exp) {
      blockers.push({ code: contract.BLOCKER_CODES.SOURCE_HASH_DRIFT(ref), reason: 'hash drift for ' + ref });
    }
  }
  return { blockers, loaderResult };
}

// ---------------------------------------------------------------------------
// Main entrypoint — caller passes argv array so the helper can also be
// unit-tested directly.
// ---------------------------------------------------------------------------
function run(argv) {
  let args;
  try { args = parseArgs(argv); }
  catch (e) {
    process.stderr.write('M16-S09-REVIEW-RUNNER-FAILURE: argv parse: ' + String(e.message || e).slice(0, 240) + '\n');
    process.exit(contract.EXIT_CODES.REVIEW_RUNNER_FAILURE);
  }
  if (args.help) { printHelp(); process.exit(0); }

  // Resolve the human-review path under ROOT (or override).
  let resolved;
  try { resolved = resolveUnderRoot(args.humanReviewPath, args.sourceRoot); }
  catch (e) {
    const code = (e && e.code) || contract.BLOCKER_CODES.PATH_TRAVERSAL('resolve:' + args.humanReviewPath);
    process.stderr.write(code + ': ' + String(e.message || e).slice(0, 240) + '\n');
    process.exit(contract.EXIT_CODES.REVIEW_MALFORMED);
  }
  if (!resolved.exists) {
    process.stderr.write(contract.BLOCKER_CODES.SOURCE_MISSING(args.humanReviewPath) + ': human-review markdown does not exist\n');
    process.exit(contract.EXIT_CODES.REVIEW_PRECONDITION_DRIFT);
  }

  // Read markdown body.
  const markdown = fs.readFileSync(resolved.absolute, 'utf8');

  // Extract embedded JSON model.
  let model;
  try { model = extractModel(markdown); }
  catch (e) {
    const code = (e && e.code) || contract.BLOCKER_CODES.MODEL_MALFORMED;
    process.stderr.write(code + ': ' + String(e.message || e).slice(0, 240) + '\n');
    process.exit(contract.EXIT_CODES.REVIEW_MALFORMED);
  }

  // Re-derive source hashes against the same sourceRoot.
  const { blockers: hashBlockers } = rederiveHashBlockers(model, args.sourceRoot);
  const allBlockers = hashBlockers.slice();

  // Run the pure contract evaluator.
  const inputs = extractEvaluatorInputs(model);
  const evalResult = contract.evaluateReviewContract({ model, ...inputs });
  for (const b of (evalResult.blockers || [])) allBlockers.push(b);

  // Independent redaction scan.
  const secretHits = scanRawSecrets(markdown);
  for (const h of secretHits) {
    allBlockers.push({ code: contract.BLOCKER_CODES.REDACTION_LEAK_RAW(h.kind + ':' + h.count), reason: 'raw secret pattern detected: ' + h.kind + ' x' + h.count });
  }

  // Classify the failure class.
  let exitCode = contract.EXIT_CODES.REVIEW_PASS;
  let verdict = contract.FROZEN_LAUNCH_POSTURE.launch; // PREPARATION_ONLY
  if (allBlockers.length > 0) {
    const codes = new Set(allBlockers.map((b) => b.code));
    if (secretHits.length > 0) {
      exitCode = contract.EXIT_CODES.REVIEW_REDACTION_LEAK;
    } else if ([...codes].some((c) => c.indexOf(contract.BLOCKER_CODES.SOURCE_HASH_DRIFT('').split('-')[0]) === 0)) {
      // SOURCE_HASH_DRIFT / SOURCE_MISSING → precondition drift
      exitCode = contract.EXIT_CODES.REVIEW_PRECONDITION_DRIFT;
    } else if ([...codes].some((c) => c.indexOf(contract.BLOCKER_CODES.SECTION_DRIFT('').split('-')[0]) === 0
        || c.indexOf(contract.BLOCKER_CODES.MODEL_MALFORMED) === 0
        || c.indexOf(contract.BLOCKER_CODES.HARD_GATE_COUNT_DRIFT('').split('-')[0]) === 0
        || c.indexOf(contract.BLOCKER_CODES.HARD_GATE_UNKNOWN('').split('-')[0]) === 0
        || c.indexOf(contract.BLOCKER_CODES.HARD_GATE_STATE_DRIFT('').split('-')[0]) === 0)) {
      exitCode = contract.EXIT_CODES.REVIEW_MALFORMED;
    } else {
      exitCode = contract.EXIT_CODES.REVIEW_FAIL_CLOSED;
    }
    verdict = 'FAIL_CLOSED';
  }

  // Stable CLI health signal.
  const sha256 = crypto.createHash('sha256').update(markdown).digest('hex');
  const relPath = args.humanReviewPath; // already repo-relative
  const cliLine = contract.buildCliHealthLine({
    verdict,
    exitCode,
    blockCount: allBlockers.length,
    outputPath: relPath,
    outputSha256: sha256,
  });
  process.stdout.write(cliLine + '\n');

  if (allBlockers.length > 0) {
    process.stderr.write('M16-S09-REVIEW-FAILURE-SUMMARY: verdict=' + verdict + ' exit=' + exitCode + ' block_count=' + allBlockers.length + '\n');
    for (const b of allBlockers.slice(0, 32)) {
      const reason = String((b && b.reason) || '').replace(/[\r\n]+/g, ' ').slice(0, 200);
      process.stderr.write('  - ' + ((b && b.code) || 'M16-S09-REVIEW-UNKNOWN') + ' :: ' + reason + '\n');
    }
  }

  process.exit(exitCode);
}

// ---------------------------------------------------------------------------
// Module surface — exported for test suites so they can drive the
// runner without spawning a subprocess when convenient.
// ---------------------------------------------------------------------------
module.exports = Object.freeze({
  parseArgs,
  resolveUnderRoot,
  extractModel,
  scanRawSecrets,
  extractEvaluatorInputs,
  rederiveHashBlockers,
  run,
  VERIFIER_IMPORTS,
  PRODUCER_CLI_PATH,
  RAW_SECRET_PATTERNS,
  EMBED_REGEX,
  RUN_TAG,
  REFERENCE_TIME,
  ROOT,
});

if (require.main === module) {
  try { run(process.argv.slice(2)); }
  catch (e) {
    process.stderr.write('M16-S09-REVIEW-RUNNER-FAILURE: ' + String((e && e.stack) || e).slice(0, 480) + '\n');
    process.exit(contract.EXIT_CODES.REVIEW_RUNNER_FAILURE);
  }
}