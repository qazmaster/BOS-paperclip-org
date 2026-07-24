#!/usr/bin/env node
'use strict';

/**
 * scripts/verify_m016_s10_acceptance_contract.js
 *
 * M016-txa3vu / S10 / T03 — Independent acceptance contract verifier.
 *
 * Mirrors the S09 verifier architecture: a pure read-only CLI that
 * re-derives source SHA-256 hashes, validates the model via the
 * shared contract evaluator, scans for raw secret leakage, and emits
 * a stable `M16-S10-ACCEPTANCE ...` single-line health signal.
 *
 * Independence invariants (enforced at runtime, not by import tricks):
 *   - imports only `node:fs`, `node:path`, `node:crypto` + T01 frozen
 *     contract + T02 canonical-reference loader modules.
 *   - never spawns subprocesses (no spawn / exec / fork).
 *   - never opens sockets (no http / net / https).
 *   - never writes any file — pure read-only verifier.
 *   - never mutates any source — independent SHA-256 re-derivation
 *     happens against a fresh loader pass over the same sourceRoot.
 *
 * Lifecycle (fail-closed at every step):
 *   PARSE:     parse argv; resolve --input under ROOT (or override).
 *   READ:      load the JSON sidecar; refuse if path is missing or
 *              escapes repo.
 *   EXTRACT:   parse the embedded acceptance model.
 *   SHAPE:     assert schema_id / acceptance_contract_id / slice /
 *              milestone / sections / source_hashes shape.
 *   RE-DERIVE: independently load the 15 allowlisted sources from
 *              the same sourceRoot the builder used and SHA-256
 *              each — refuse on any drift, missing key, or
 *              non-allowlisted ref.
 *   EVALUATE:  run contract.evaluateAcceptance against the recovered
 *              model — section / source / verdict / launch posture /
 *              S08 / NOT_PROVEN / forbidden-token invariants.
 *   REDACT:    independent scan of the JSON body for raw secret
 *              patterns. Any hit → REDACTION_LEAK blocker.
 *   EMIT:      stable `M16-S10-ACCEPTANCE ...` single-line CLI health
 *              signal on stdout; failure summary on stderr.
 *   EXIT:      process.exit with the appropriate ACCEPTANCE_* code.
 *
 * Usage:
 *   node scripts/verify_m016_s10_acceptance_contract.js
 *     --input runtime-evidence/M016-S10-seven-division-acceptance-contract.json
 *     [--source-root <abs>]
 *     [--help]
 *
 * Exit codes (frozen namespace owned by contract.EXIT_CODES):
 *   0  ACCEPTANCE_PASS
 *   2  ACCEPTANCE_REJECTED_FAIL_CLOSED
 *   3  ACCEPTANCE_REPLAY_DRIFT
 *   4  ACCEPTANCE_SOURCE_HASH_DRIFT
 *   5  ACCEPTANCE_IDENTITY_DRIFT
 *   6  ACCEPTANCE_REDACTION_LEAK
 *   7  ACCEPTANCE_MUTATION_LEDGER_DRIFT
 *   8  ACCEPTANCE_CLOSURE_KIND_DRIFT
 *   9  ACCEPTANCE_RUNNER_FAILURE
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const contract = require('./lib/m016-s10-acceptance-contract.js');
const loader = require('./lib/m016-s10-canonical-reference-loader.js');

// ---------------------------------------------------------------------------
// Independence — these are the only modules this verifier is allowed to
// require at runtime. The producer CLI / another verifier are forbidden.
// ---------------------------------------------------------------------------
const VERIFIER_IMPORTS = Object.freeze([
  'node:fs',
  'node:path',
  'node:crypto',
  'scripts/lib/m016-s10-acceptance-contract.js',
  'scripts/lib/m016-s10-canonical-reference-loader.js',
]);
const PRODUCER_CLI_PATH = 'scripts/build_m016_s10_acceptance_contract.js';

const ROOT = path.resolve(__dirname, '..');
const REFERENCE_TIME = contract.ACCEPTANCE_CONTRACT_REFERENCE_TIME;
const RUN_TAG = 'm016-s10-verify-' + Date.now().toString(36);

// Forbidden raw-secret patterns — independent of contract.checkRedactionSafety
// so the verifier is not blindly trusting the contract's internal scanner.
// The body under test is the JSON sidecar text (printed by humans and
// greppable by CI), so we scan its raw bytes.
const RAW_SECRET_PATTERNS = Object.freeze([
  Object.freeze({ name: 'bearer-token', re: /Bearer\s+[A-Za-z0-9._\-]{20,}/g }),
  Object.freeze({ name: 'private-key-pem', re: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/g }),
  Object.freeze({ name: 'aws-access-key', re: /AKIA[0-9A-Z]{16}/g }),
  Object.freeze({ name: 'slack-token', re: /xox[baprs]-[A-Za-z0-9\-]{10,}/g }),
  Object.freeze({ name: 'password-assignment', re: /(password|passwd|secret)\s*[:=]\s*['"]?[^\s'"]{8,}/gi }),
  Object.freeze({ name: 'github-token', re: /gh[pousr]_[A-Za-z0-9]{30,}/g }),
  Object.freeze({ name: 'api-key-assignment', re: /(?:api[_-]?key|token|bearer)\s*[:=]\s*['"]?[A-Za-z0-9._-]{16,}/gi }),
]);

const USAGE = [
  'Usage: node scripts/verify_m016_s10_acceptance_contract.js',
  '  --input <rel>             Path to canonical M016-S10 acceptance contract sidecar (required, repo-relative)',
  '  [--source-root <abs>]     Override source root for fixture-style runs',
  '  [--help]',
  '',
  'Exit codes:',
  '  0  ACCEPTANCE_PASS',
  '  2  ACCEPTANCE_REJECTED_FAIL_CLOSED',
  '  3  ACCEPTANCE_REPLAY_DRIFT',
  '  4  ACCEPTANCE_SOURCE_HASH_DRIFT',
  '  5  ACCEPTANCE_IDENTITY_DRIFT',
  '  6  ACCEPTANCE_REDACTION_LEAK',
  '  7  ACCEPTANCE_MUTATION_LEDGER_DRIFT',
  '  8  ACCEPTANCE_CLOSURE_KIND_DRIFT',
  '  9  ACCEPTANCE_RUNNER_FAILURE',
].join('\n');

// ---------------------------------------------------------------------------
// argv parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const out = { input: null, sourceRoot: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--input') { out.input = argv[++i]; continue; }
    if (a === '--source-root') { out.sourceRoot = argv[++i]; continue; }
    if (a === '--help' || a === '-h') { out.help = true; continue; }
    throw new Error('unknown argv token: ' + a);
  }
  if (out.help) return out;
  if (typeof out.input !== 'string' || out.input.length === 0) {
    throw new Error('--input is required');
  }
  return out;
}

function printHelp() {
  process.stdout.write(USAGE + '\n');
}

// ---------------------------------------------------------------------------
// Path containment — refuse absolute paths, .. traversal, symlink escape.
// Mirrors S09 verifier's resolveUnderRoot semantics but keyed on --input.
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
// Parse the JSON sidecar body. Fail-closed on malformed JSON or a
// non-object top-level value. We DO NOT trust the parsed object
// further; shape + hash + evaluator checks happen next.
// ---------------------------------------------------------------------------
function parseSidecar(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    const err = new Error('sidecar JSON malformed: ' + e.message);
    err.code = contract.BLOCKER_CODES.HEALTHLINE_MISMATCH('sidecar-json-malformed');
    throw err;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const err = new Error('sidecar JSON must be a top-level object');
    err.code = contract.BLOCKER_CODES.HEALTHLINE_MISMATCH('sidecar-shape-malformed');
    throw err;
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Shape check — assert the parsed object really is the frozen S10
// acceptance contract and not an arbitrary JSON document. Any drift
// surfaces as a fail-closed blocker.
// ---------------------------------------------------------------------------
function assertAcceptanceContractShape(model) {
  const blockers = [];
  if (model.schema_id !== contract.SCHEMA_ID) {
    blockers.push({ code: contract.BLOCKER_CODES.HEALTHLINE_MISMATCH('schema-id-mismatch:' + String(model.schema_id || 'missing').slice(0, 60)), reason: 'sidecar schema_id does not match frozen contract schema' });
  }
  if (model.acceptance_contract_id !== contract.ACCEPTANCE_CONTRACT_ID) {
    blockers.push({ code: contract.BLOCKER_CODES.HEALTHLINE_MISMATCH('contract-id-mismatch'), reason: 'sidecar acceptance_contract_id does not match frozen id' });
  }
  if (model.slice !== contract.SLICE) {
    blockers.push({ code: contract.BLOCKER_CODES.HEALTHLINE_MISMATCH('slice-mismatch:' + model.slice), reason: 'sidecar slice != S10' });
  }
  if (model.milestone !== contract.MILESTONE) {
    blockers.push({ code: contract.BLOCKER_CODES.HEALTHLINE_MISMATCH('milestone-mismatch:' + model.milestone), reason: 'sidecar milestone != M016-txa3vu' });
  }
  if (!Array.isArray(model.sections) || model.sections.length !== contract.EXPECTED_SECTION_COUNT) {
    blockers.push({ code: contract.BLOCKER_CODES.SECTION_MISSING('count-' + (Array.isArray(model.sections) ? model.sections.length : 0)), reason: 'sidecar sections array length != 6' });
  }
  if (model.section_count !== contract.EXPECTED_SECTION_COUNT) {
    blockers.push({ code: contract.BLOCKER_CODES.SECTION_MISSING('count-meta-' + model.section_count), reason: 'sidecar section_count meta does not equal 6' });
  }
  if (model.source_count !== contract.EXPECTED_SOURCE_COUNT) {
    blockers.push({ code: contract.BLOCKER_CODES.SECTION_MISSING('source-count-' + model.source_count), reason: 'sidecar source_count meta does not equal 15' });
  }
  if (!model.source_hashes || typeof model.source_hashes !== 'object' || Array.isArray(model.source_hashes)) {
    blockers.push({ code: contract.BLOCKER_CODES.SOURCE_HASH_DRIFT('missing-source-hashes-map'), reason: 'sidecar source_hashes must be a map' });
  }
  if (!Array.isArray(model.section_ids) || model.section_ids.length !== contract.EXPECTED_SECTION_COUNT) {
    blockers.push({ code: contract.BLOCKER_CODES.SECTION_MISSING('section-ids-' + (Array.isArray(model.section_ids) ? model.section_ids.length : 0)), reason: 'sidecar section_ids array length != 6' });
  }
  return blockers;
}

// ---------------------------------------------------------------------------
// Re-derive source SHA-256 against the same sourceRoot the builder used.
// Returns fail-closed blockers for missing keys, malformed hashes,
// drift, or non-allowlisted refs.
// ---------------------------------------------------------------------------
function rederiveHashBlockers(model, sourceRoot) {
  const blockers = [];
  const loaderResult = loader.loadCanonicalReferences({ sourceRoot });
  const expected = (model && model.source_hashes) || {};
  // 1. Each allowlisted source must be present in the sidecar source_hashes.
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
  // 2. Any sidecar source_hashes key NOT in the allowlist is identity drift.
  for (const ref of Object.keys(expected)) {
    if (!contract.SOURCE_ALLOWLIST_SET.has(ref)) {
      blockers.push({ code: contract.BLOCKER_CODES.SOURCE_NOT_ALLOWLISTED(ref), reason: 'sidecar source_hashes contains non-allowlisted ref ' + ref });
    }
  }
  return { blockers, loaderResult };
}

// ---------------------------------------------------------------------------
// Independent redaction scan — never trust the embedded redaction posture
// flag; instead scan the raw JSON body for forbidden secret patterns.
// ---------------------------------------------------------------------------
function scanRawSecrets(jsonText) {
  const hits = [];
  for (const p of RAW_SECRET_PATTERNS) {
    const m = jsonText.match(p.re);
    if (m && m.length > 0) hits.push({ kind: p.name, count: m.length });
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Classify the exit code from accumulated blockers + secret hits.
// Mirrors the S09 verifier's priority ordering with the S10 frozen
// exit-code namespace (contract.EXIT_CODES).
// ---------------------------------------------------------------------------
function classifyExit(blockers, secretHits) {
  if (blockers.length === 0 && secretHits.length === 0) {
    return { verdict: contract.VERDICT_VALUES.ACCEPTANCE_RESOLVED, exitCode: contract.EXIT_CODES.PASS };
  }
  const codes = blockers.map((b) => b.code);
  // Priority 1: redaction leak.
  if (secretHits.length > 0 || codes.some((c) => /REDACTION-LEAK|FORBIDDEN-KEY-LEAK/.test(c))) {
    return { verdict: 'REDACTION_LEAK', exitCode: contract.EXIT_CODES.REDACTION_LEAK };
  }
  // Priority 2: source hash drift / replay drift.
  if (codes.some((c) => /SOURCE-HASH-DRIFT|REPLAY-DRIFT/.test(c))) {
    return { verdict: 'SOURCE_HASH_DRIFT', exitCode: contract.EXIT_CODES.SOURCE_HASH_DRIFT };
  }
  // Priority 3: identity drift (non-allowlisted ref).
  if (codes.some((c) => /SOURCE-NOT-ALLOWLISTED/.test(c))) {
    return { verdict: 'IDENTITY_DRIFT', exitCode: contract.EXIT_CODES.IDENTITY_DRIFT };
  }
  // Priority 4: missing source (after drift).
  if (codes.some((c) => /SOURCE-MISSING/.test(c))) {
    return { verdict: 'IDENTITY_DRIFT', exitCode: contract.EXIT_CODES.IDENTITY_DRIFT };
  }
  // Priority 5: path traversal.
  if (codes.some((c) => /PATH-TRAVERSAL/.test(c))) {
    return { verdict: 'REJECTED_FAIL_CLOSED', exitCode: contract.EXIT_CODES.REJECTED_FAIL_CLOSED };
  }
  // Priority 6: closure-kind drift (R041 / milestone / S05 / S08 / NOT_PROVEN / launch / capability).
  if (codes.some((c) => /R041|MILESTONE-CRITERION|S05-DIVERGENCE|S05-VERIFIER-PROVENANCE|S08-PROMOTION|S08-CLOSURE-KIND|NOT-PROVEN-REMOVED|LAUNCH-POSTURE-DRIFT|CAPABILITY-PROMOTION/.test(c))) {
    return { verdict: 'CLOSURE_KIND_DRIFT', exitCode: contract.EXIT_CODES.CLOSURE_KIND_DRIFT };
  }
  // Priority 7: section / verdict / healthline drift.
  if (codes.some((c) => /VERDICT-FORBIDDEN|SECTION-MISSING|HEALTHLINE-MISMATCH/.test(c))) {
    return { verdict: 'REJECTED_FAIL_CLOSED', exitCode: contract.EXIT_CODES.REJECTED_FAIL_CLOSED };
  }
  return { verdict: 'FAIL_CLOSED', exitCode: contract.EXIT_CODES.REJECTED_FAIL_CLOSED };
}

// ---------------------------------------------------------------------------
// Build the verifier CLI health line. The shape mirrors the contract's
// buildHealthLineAcceptance with two extra fields: input_path (rel) and
// input_sha256 (the sidecar bytes hash, NOT the model digest).
//
// The verdict token is propagated AS-IS from `classification.verdict`:
//   - happy path → ACCEPTANCE_RESOLVED (the frozen resolved outcome)
//   - failure path → the specific failure class (SOURCE_HASH_DRIFT /
//     IDENTITY_DRIFT / REDACTION_LEAK / CLOSURE_KIND_DRIFT /
//     REJECTED_FAIL_CLOSED) so the stdout line is self-describing
//     without forcing the consumer to inspect stderr.
// ---------------------------------------------------------------------------
function buildVerifierCliLine(classification, blockCount, inputRel, inputSha256, digest) {
  const verdictToken = (classification.verdict === contract.VERDICT_VALUES.ACCEPTANCE_RESOLVED)
    ? contract.VERDICT_VALUES.ACCEPTANCE_RESOLVED
    : classification.verdict;
  const line = contract.buildHealthLineAcceptance({
    verdict: verdictToken,
    exitCode: classification.exitCode,
    blockCount: blockCount,
    criterionCount: contract.EXPECTED_MILESTONE_CRITERION_COUNT,
    notProvenCount: contract.EXPECTED_NOT_PROVEN_COUNT,
    sourceCount: contract.EXPECTED_SOURCE_COUNT,
    sectionCount: contract.EXPECTED_SECTION_COUNT,
    digest: digest || 'pending',
  });
  return line + ' input_path=' + inputRel + ' input_sha256=' + inputSha256;
}

// ---------------------------------------------------------------------------
// Bounded stderr summary — surfaces blockers without leaking payload bytes.
// ---------------------------------------------------------------------------
function failureStderrSummary(classification, blockers) {
  const sb = [];
  sb.push('M16-S10-ACCEPTANCE-FAILURE-SUMMARY: verdict=' + classification.verdict + ' exit=' + classification.exitCode + ' block_count=' + blockers.length);
  for (const blocker of blockers.slice(0, 32)) {
    const reason = String((blocker && blocker.reason) || '').replace(/[\r\n]+/g, ' ').slice(0, 200);
    sb.push('  - ' + ((blocker && blocker.code) || 'M16-S10-ACCEPTANCE-UNKNOWN') + ' :: ' + reason);
  }
  return sb.join('\n');
}

// ---------------------------------------------------------------------------
// Main entrypoint — caller passes argv array so the helper can also be
// unit-tested directly without spawning a subprocess.
// ---------------------------------------------------------------------------
function run(argv) {
  let args;
  try { args = parseArgs(argv); }
  catch (e) {
    process.stderr.write('M16-S10-ACCEPTANCE-RUNNER-FAILURE: argv parse: ' + String(e.message || e).slice(0, 240) + '\n');
    process.exit(contract.EXIT_CODES.RUNNER_FAILURE);
  }
  if (args.help) { printHelp(); process.exit(0); }

  // Resolve --input under ROOT (or override).
  let resolved;
  try { resolved = resolveUnderRoot(args.input, args.sourceRoot); }
  catch (e) {
    const code = (e && e.code) || contract.BLOCKER_CODES.PATH_TRAVERSAL('resolve:' + args.input);
    process.stderr.write(code + ': ' + String(e.message || e).slice(0, 240) + '\n');
    process.exit(contract.EXIT_CODES.REJECTED_FAIL_CLOSED);
  }
  if (!resolved.exists) {
    process.stderr.write(contract.BLOCKER_CODES.SOURCE_MISSING(args.input) + ': acceptance contract sidecar does not exist\n');
    process.exit(contract.EXIT_CODES.IDENTITY_DRIFT);
  }

  // Read JSON body.
  const jsonText = fs.readFileSync(resolved.absolute, 'utf8');

  // Parse sidecar JSON.
  let model;
  try { model = parseSidecar(jsonText); }
  catch (e) {
    const code = (e && e.code) || contract.BLOCKER_CODES.HEALTHLINE_MISMATCH('sidecar-parse-failure');
    process.stderr.write(code + ': ' + String(e.message || e).slice(0, 240) + '\n');
    process.exit(contract.EXIT_CODES.RUNNER_FAILURE);
  }

  // Shape check.
  const shapeBlockers = assertAcceptanceContractShape(model);

  // Re-derive source hashes against the same sourceRoot. Skip when
  // shape already failed — the sidecar is not a valid contract.
  let hashBlockers = [];
  if (shapeBlockers.length === 0) {
    const r = rederiveHashBlockers(model, args.sourceRoot);
    hashBlockers = r.blockers;
  }

  // Independent raw-secret scan.
  const secretHits = scanRawSecrets(jsonText);

  // Aggregate blockers (shape + hash + secret-derived).
  const allBlockers = shapeBlockers.slice();
  for (const b of hashBlockers) allBlockers.push(b);
  for (const h of secretHits) {
    allBlockers.push({ code: contract.BLOCKER_CODES.REDACTION_LEAK(h.kind + ':' + h.count), reason: 'raw secret pattern detected: ' + h.kind + ' x' + h.count });
  }

  // Run the pure evaluator only when shape is valid AND hashes match.
  // The evaluator already handles shape/verdict/S08/NOT_PROVEN invariants
  // — but re-evaluating a model whose own shape is broken would only add
  // noise. Skip it when shape already failed.
  if (shapeBlockers.length === 0 && hashBlockers.length === 0) {
    let evalResult;
    try {
      evalResult = contract.evaluateAcceptance({ model });
    } catch (e) {
      process.stderr.write(contract.BLOCKER_CODES.RUNNER_FAILURE() + ': evaluator threw: ' + String(e.message || e).slice(0, 240) + '\n');
      process.exit(contract.EXIT_CODES.RUNNER_FAILURE);
    }
    for (const b of (evalResult.blockers || [])) allBlockers.push(b);
  }

  // Classify + emit.
  const classification = classifyExit(allBlockers, secretHits);

  // Independent digest recomputation (independent of model.acceptance_contract_digest).
  let digest = 'pending';
  try {
    if (shapeBlockers.length === 0) {
      const recomputed = contract.computeAcceptanceDigest(model);
      if (typeof recomputed === 'string' && recomputed.length === 64) digest = recomputed;
    }
  } catch (_) { /* leave digest=pending */ }

  // SHA-256 of the input sidecar file bytes (separate from the model digest).
  const inputSha256 = crypto.createHash('sha256').update(jsonText).digest('hex');

  const cliLine = buildVerifierCliLine(classification, allBlockers.length, args.input, inputSha256, digest);
  process.stdout.write(cliLine + '\n');

  if (allBlockers.length > 0) {
    process.stderr.write(failureStderrSummary(classification, allBlockers) + '\n');
  }

  process.exit(classification.exitCode);
}

// ---------------------------------------------------------------------------
// Module surface — exported for test suites so they can drive the
// runner without spawning a subprocess when convenient.
// ---------------------------------------------------------------------------
module.exports = Object.freeze({
  parseArgs,
  printHelp,
  resolveUnderRoot,
  parseSidecar,
  assertAcceptanceContractShape,
  rederiveHashBlockers,
  scanRawSecrets,
  classifyExit,
  buildVerifierCliLine,
  failureStderrSummary,
  run,
  VERIFIER_IMPORTS,
  PRODUCER_CLI_PATH,
  RAW_SECRET_PATTERNS,
  REFERENCE_TIME,
  ROOT,
  RUN_TAG,
});

if (require.main === module) {
  try { run(process.argv.slice(2)); }
  catch (e) {
    process.stderr.write('M16-S10-ACCEPTANCE-RUNNER-FAILURE: ' + String((e && e.stack) || e).slice(0, 480) + '\n');
    process.exit(contract.EXIT_CODES.RUNNER_FAILURE);
  }
}
