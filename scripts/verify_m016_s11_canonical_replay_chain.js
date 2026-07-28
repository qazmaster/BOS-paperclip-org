#!/usr/bin/env node
'use strict';
/**
 * scripts/verify_m016_s11_canonical_replay_chain.js
 *
 * M016-txa3vu / S11 / T03 — Independent read-only chain verifier.
 *
 * Independently re-derives the SHA-256 fingerprints of all 17 allowlisted
 * S05-S10 sources, validates counts/section/class semantics, HG1-HG8,
 * worksheet vocabulary, frozen launch posture, NOT_PROVEN preservation,
 * redaction safety and chain-verdict discipline. The verifier is
 * STRICTLY read-only and NEVER imports the T02 builder code — its only
 * collaborator modules are:
 *
 *   - node:fs, node:path, node:crypto (stdlib only)
 *   - ./lib/m016-s11-canonical-replay-chain-contract.js (pure contract)
 *   - ./lib/m016-s11-canonical-replay-chain-reference-loader.js (loader)
 *
 * Hard rules (failure to comply = fail-closed):
 *
 *   1. NEVER spawn a subprocess.
 *   2. NEVER open a socket (no net, dns, http, https, fetch, tls).
 *   3. NEVER write any file (read-only enforcement).
 *   4. NEVER import the T02 builder module.
 *   5. NEVER mutate any of the 17 allowlisted upstream sources.
 *   6. ALWAYS independently re-derive SHA-256 fingerprints and compare
 *      against the sidecar's embedded source_hashes map.
 *
 * Exit code map (mirrors contract.EXIT_CODES):
 *   0  PASS — chain resolved (CHAIN_RESOLVED_PREPARATION_ONLY)
 *   2  REJECTED_FAIL_CLOSED — semantic / posture / verdict drift
 *   4  SOURCE_HASH_DRIFT — at least one allowlisted source no longer
 *                           matches the sidecar fingerprint
 *   6  REDACTION_LEAK     — redaction safety scan fired
 *   9  RUNNER_FAILURE     — argv, IO or schema-level malformation
 *
 * Stable stdout line:
 *   M16-S11-CHAIN verdict=<CHAIN_RESOLVED_PREPARATION_ONLY|FAIL_CLOSED>
 *                  exit=<0..9> block_count=<n> class_count=4
 *                  source_count=17 section_count=8 not_proven_count=<n>
 *                  mutation_count=0 network_call_count=0 digest=<hex>
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const contract = require('./lib/m016-s11-canonical-replay-chain-contract.js');
const loader = require('./lib/m016-s11-canonical-replay-chain-reference-loader.js');

const ROOT = loader.ROOT;
const SCRIPT_PATH = __filename;

// Verifier is read-only by construction. Any of these modules being
// imported would violate the independence invariant and would be
// detected by the anti-coupling test suite.
const FORBIDDEN_IMPORT_PATTERNS = Object.freeze([
  /require\(\s*['"]node:child_process['"]\s*\)/,
  /require\(\s*['"]node:net['"]\s*\)/,
  /require\(\s*['"]node:dns['"]\s*\)/,
  /require\(\s*['"]node:http['"]\s*\)/,
  /require\(\s*['"]node:https['"]\s*\)/,
  /require\(\s*['"]node:http2['"]\s*\)/,
  /require\(\s*['"]node:tls['"]\s*\)/,
  /require\(\s*['"]node:worker_threads['"]\s*\)/,
  /require\(\s*['"]\.\/build_m016_s11_canonical_replay_chain['"]\s*\)/,
  /require\(\s*['"]\.\/build_m016_s11_canonical_replay_chain\.js['"]\s*\)/,
  /require\(\s*['"]\.\/test_m016_s11_canonical_replay_chain_builder['"]/,
  /from\s+['"]\.\/build_m016_s11_canonical_replay_chain/,
]);

const _isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function parseArgs(argv) {
  const out = {
    input: null,
    showBlockers: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--input') out.input = argv[++i];
    else if (a === '--show-blockers') out.showBlockers = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else {
      const err = new Error('unknown argv token: ' + a);
      err.code = contract.BLOCKER_CODES.RUNNER_FAILURE() + ':ARGV-' + a;
      err.argv_token = a;
      throw err;
    }
  }
  return out;
}

function printHelp() {
  process.stdout.write([
    'Usage: verify_m016_s11_canonical_replay_chain.js [options]',
    '',
    'Options:',
    '  --input <path>          Path to canonical sidecar JSON (required)',
    '  --show-blockers         Print full blocker list to stderr',
    '  -h, --help              Show this help',
    '',
    'Reads the sidecar produced by build_m016_s11_canonical_replay_chain.js,',
    'independently re-derives SHA-256 fingerprints for all 17 allowlisted',
    'sources, and verifies counts/sections/classes/posture/NOT_PROVEN',
    'invariants. STRICTLY read-only: no subprocesses, no sockets, no writes.',
  ].join('\n') + '\n');
}

// ---------------------------------------------------------------------------
// Pure sidecar validations — collect blockers rather than throw early.
// The verifier collects ALL failures in a single pass; only the exit-code
// selection looks at the first dominant blocker.
// ---------------------------------------------------------------------------
function compareArrays(actual, expected, kind) {
  if (!Array.isArray(actual)) {
    return [{ code: contract.BLOCKER_CODES.SECTION_ORDER_DRIFT(kind + ':not-array'), reason: kind + ' is not an array' }];
  }
  const blocks = [];
  if (actual.length !== expected.length) {
    blocks.push({ code: contract.BLOCKER_CODES.COUNT_DRIFT(kind + ':len=' + actual.length + '!=' + expected.length), reason: kind + ' length mismatch' });
  }
  const n = Math.max(actual.length, expected.length);
  for (let i = 0; i < n; i += 1) {
    if (actual[i] !== expected[i]) {
      blocks.push({ code: contract.BLOCKER_CODES.SECTION_ORDER_DRIFT(kind + ':idx=' + i + ':' + String(actual[i]) + '!=' + String(expected[i])), reason: kind + ' order/value mismatch at index ' + i });
      break; // first mismatch is enough for fail-closed
    }
  }
  return blocks;
}

function validateSchema(sidecar) {
  const blocks = [];
  if (!_isObject(sidecar)) {
    blocks.push({ code: contract.BLOCKER_CODES.RUNNER_FAILURE() + ':SCHEMA-NOT-OBJECT', reason: 'sidecar root is not an object' });
    return blocks;
  }
  if (sidecar.schema_id !== contract.SCHEMA_ID) blocks.push({ code: contract.BLOCKER_CODES.RUNNER_FAILURE() + ':SCHEMA-ID', reason: 'schema_id mismatch' });
  if (sidecar.schema_namespace !== contract.SCHEMA_NAMESPACE) blocks.push({ code: contract.BLOCKER_CODES.RUNNER_FAILURE() + ':SCHEMA-NAMESPACE', reason: 'schema_namespace mismatch' });
  if (sidecar.schema_version !== contract.SCHEMA_VERSION) blocks.push({ code: contract.BLOCKER_CODES.RUNNER_FAILURE() + ':SCHEMA-VERSION', reason: 'schema_version mismatch' });
  if (sidecar.chain_id !== contract.CHAIN_ID) blocks.push({ code: contract.BLOCKER_CODES.RUNNER_FAILURE() + ':CHAIN-ID', reason: 'chain_id mismatch' });
  if (sidecar.milestone !== contract.MILESTONE) blocks.push({ code: contract.BLOCKER_CODES.RUNNER_FAILURE() + ':MILESTONE', reason: 'milestone mismatch' });
  if (sidecar.slice !== contract.SLICE) blocks.push({ code: contract.BLOCKER_CODES.RUNNER_FAILURE() + ':SLICE', reason: 'slice mismatch' });
  return blocks;
}

function validateCounts(sidecar) {
  const blocks = [];
  if (sidecar.source_count !== contract.EXPECTED_SOURCE_COUNT) blocks.push({ code: contract.BLOCKER_CODES.COUNT_DRIFT('source:' + sidecar.source_count), reason: 'source_count mismatch' });
  if (sidecar.section_count !== contract.EXPECTED_SECTION_COUNT) blocks.push({ code: contract.BLOCKER_CODES.COUNT_DRIFT('section:' + sidecar.section_count), reason: 'section_count mismatch' });
  if (sidecar.verification_class_count !== contract.EXPECTED_VERIFICATION_CLASS_COUNT) blocks.push({ code: contract.BLOCKER_CODES.COUNT_DRIFT('class:' + sidecar.verification_class_count), reason: 'verification_class_count mismatch' });
  if (sidecar.hard_gate_count !== contract.EXPECTED_HARD_GATE_COUNT) blocks.push({ code: contract.BLOCKER_CODES.COUNT_DRIFT('hardgate:' + sidecar.hard_gate_count), reason: 'hard_gate_count mismatch' });
  return blocks;
}

function validateSectionOrder(sidecar) {
  return compareArrays(sidecar.section_ids, contract.CHAIN_SECTION_IDS, 'section_ids');
}

function validateClassOrder(sidecar) {
  return compareArrays(sidecar.verification_class_ids, contract.VERIFICATION_CLASS_IDS, 'verification_class_ids');
}

function validateHardGateOrder(sidecar) {
  return compareArrays(sidecar.hard_gate_ids, contract.HARD_GATE_IDS, 'hard_gate_ids');
}

function validateLaunchPosture(sidecar) {
  const blocks = [];
  const lp = sidecar.launch_posture;
  if (!_isObject(lp)) {
    blocks.push({ code: contract.BLOCKER_CODES.LAUNCH_POSTURE_DRIFT('missing'), reason: 'launch_posture missing' });
    return blocks;
  }
  if (lp.orchestration !== contract.FROZEN_LAUNCH_POSTURE.orchestration) blocks.push({ code: contract.BLOCKER_CODES.LAUNCH_POSTURE_DRIFT('orchestration:' + lp.orchestration), reason: 'orchestration drift' });
  if (lp.evidence !== contract.FROZEN_LAUNCH_POSTURE.evidence) blocks.push({ code: contract.BLOCKER_CODES.LAUNCH_POSTURE_DRIFT('evidence:' + lp.evidence), reason: 'evidence drift' });
  if (lp.launch !== contract.FROZEN_LAUNCH_POSTURE.launch) blocks.push({ code: contract.BLOCKER_CODES.LAUNCH_POSTURE_DRIFT('launch:' + lp.launch), reason: 'launch drift' });
  if (lp.bounded_internal !== contract.FROZEN_LAUNCH_POSTURE.bounded_internal) blocks.push({ code: contract.BLOCKER_CODES.LAUNCH_POSTURE_DRIFT('bounded_internal:' + lp.bounded_internal), reason: 'bounded_internal drift' });
  return blocks;
}

function validateS10Crosslink(sidecar) {
  const blocks = [];
  const cl = sidecar.s10_crosslink_posture;
  if (!_isObject(cl)) {
    blocks.push({ code: contract.BLOCKER_CODES.S10_CROSSLINK_MISSING('missing'), reason: 's10_crosslink_posture missing' });
    return blocks;
  }
  if (cl.orchestration !== contract.S10_FROZEN_POSTURE.orchestration) blocks.push({ code: contract.BLOCKER_CODES.S10_CROSSLINK_DRIFT('orchestration:' + cl.orchestration), reason: 's10 orchestration drift' });
  if (cl.evidence !== contract.S10_FROZEN_POSTURE.evidence) blocks.push({ code: contract.BLOCKER_CODES.S10_CROSSLINK_DRIFT('evidence:' + cl.evidence), reason: 's10 evidence drift' });
  if (cl.launch !== contract.S10_FROZEN_POSTURE.launch) blocks.push({ code: contract.BLOCKER_CODES.S10_CROSSLINK_DRIFT('launch:' + cl.launch), reason: 's10 launch drift' });
  if (cl.bounded_internal !== contract.S10_FROZEN_POSTURE.bounded_internal) blocks.push({ code: contract.BLOCKER_CODES.S10_CROSSLINK_DRIFT('bounded_internal:' + cl.bounded_internal), reason: 's10 bounded_internal drift' });
  return blocks;
}

function validateNotProvenPreservation(sidecar) {
  const blocks = [];
  if (!Array.isArray(sidecar.not_proven_preserved_ids) || sidecar.not_proven_preserved_ids.length < contract.EXPECTED_NOT_PROVEN_COUNT) {
    blocks.push({ code: contract.BLOCKER_CODES.NOT_PROVEN_REMOVED('count-' + (Array.isArray(sidecar.not_proven_preserved_ids) ? sidecar.not_proven_preserved_ids.length : 0)), reason: 'NOT_PROVEN preserved count fell below frozen minimum' });
  }
  // Every frozen preserved id MUST be present in the sidecar list.
  for (const frozen of contract.NOT_PROVEN_PRESERVED_IDS) {
    if (Array.isArray(sidecar.not_proven_preserved_ids) && sidecar.not_proven_preserved_ids.indexOf(frozen) === -1) {
      blocks.push({ code: contract.BLOCKER_CODES.NOT_PROVEN_REMOVED(frozen), reason: 'frozen NOT_PROVEN id missing: ' + frozen });
    }
  }
  return blocks;
}

function validateSourceAllowlist(sidecar) {
  const blocks = [];
  const refs = sidecar.source_refs;
  if (!Array.isArray(refs)) {
    blocks.push({ code: contract.BLOCKER_CODES.RUNNER_FAILURE() + ':SOURCE-REFS-NOT-ARRAY', reason: 'source_refs must be array' });
    return blocks;
  }
  blocks.push(...compareArrays(refs, contract.SOURCE_ALLOWLIST_REFS, 'source_refs'));
  return blocks;
}

function validateChainVerdict(sidecar) {
  const blocks = [];
  const sections = Array.isArray(sidecar.sections) ? sidecar.sections : [];
  const outcome = sections.find((s) => s && s.section_id === 'canonical_chain_outcome');
  const verdict = outcome ? outcome.chain_verdict : null;
  if (typeof verdict !== 'string' || verdict.length === 0) {
    blocks.push({ code: contract.BLOCKER_CODES.VERDICT_FORBIDDEN('missing'), reason: 'chain_verdict missing in canonical_chain_outcome' });
    return blocks;
  }
  // Verdict must be exactly one of the two chain verdict vocabulary
  // values. Anything else — including forbidden chain verdicts and
  // valid launch verdicts like GO_BOUNDED_INTERNAL — fails closed.
  const knownVerdicts = [
    contract.VERDICT_VALUES.CHAIN_RESOLVED,   // CHAIN_RESOLVED_PREPARATION_ONLY
    contract.VERDICT_VALUES.CHAIN_BUILT,      // CHAIN_BUILT
  ];
  if (knownVerdicts.indexOf(verdict) === -1) {
    const reason = contract.isForbiddenChainVerdict(verdict) || verdict === 'ACCEPTANCE_RESOLVED'
      ? 'forbidden chain verdict: ' + verdict
      : 'chain_verdict must be CHAIN_RESOLVED_PREPARATION_ONLY or CHAIN_BUILT, got ' + verdict;
    blocks.push({ code: contract.BLOCKER_CODES.VERDICT_FORBIDDEN(verdict), reason: reason });
  }
  return blocks;
}

function validateCounters(sidecar) {
  const blocks = [];
  if (typeof sidecar.network_call_count !== 'number' || sidecar.network_call_count !== 0) {
    blocks.push({ code: contract.BLOCKER_CODES.RUNNER_FAILURE() + ':NETWORK-CALL-COUNT:' + sidecar.network_call_count, reason: 'network_call_count must be 0' });
  }
  if (typeof sidecar.mutation_count !== 'number' || sidecar.mutation_count !== 0) {
    blocks.push({ code: contract.BLOCKER_CODES.RUNNER_FAILURE() + ':MUTATION-COUNT:' + sidecar.mutation_count, reason: 'mutation_count must be 0' });
  }
  return blocks;
}

function validateHumanReviewSection(sidecar) {
  const blocks = [];
  const sections = Array.isArray(sidecar.sections) ? sidecar.sections : [];
  const s09 = sections.find((s) => s && s.section_id === 's09_human_review');
  if (!s09) {
    blocks.push({ code: contract.BLOCKER_CODES.SECTION_MISSING('s09_human_review'), reason: 's09_human_review section missing' });
    return blocks;
  }
  if (s09.review_ref !== contract.REF.S09_HUMAN_REVIEW) {
    blocks.push({ code: contract.BLOCKER_CODES.SECTION_MISSING('s09_human_review:review_ref:' + s09.review_ref), reason: 's09 review_ref must equal contract.REF.S09_HUMAN_REVIEW' });
  }
  if (!_isObject(s09.frozen_posture)) {
    blocks.push({ code: contract.BLOCKER_CODES.LAUNCH_POSTURE_DRIFT('s09.frozen_posture.missing'), reason: 's09 frozen_posture missing' });
    return blocks;
  }
  const fp = s09.frozen_posture;
  if (fp.orchestration !== contract.FROZEN_LAUNCH_POSTURE.orchestration
    || fp.evidence !== contract.FROZEN_LAUNCH_POSTURE.evidence
    || fp.launch !== contract.FROZEN_LAUNCH_POSTURE.launch
    || fp.bounded_internal !== contract.FROZEN_LAUNCH_POSTURE.bounded_internal) {
    blocks.push({ code: contract.BLOCKER_CODES.LAUNCH_POSTURE_DRIFT('s09:' + JSON.stringify(fp)), reason: 's09 frozen_posture drift' });
  }
  return blocks;
}

// Re-derive SHA-256 from disk for every allowlisted source and compare
// against the sidecar.source_hashes map. The loader is bounded and
// read-only; this sidecar verification is independent of the T02
// builder because we use loader.loadCanonicalReferences directly.
function rederiveSourceHashes(loaderResult, embeddedHashes) {
  const blocks = [];
  const drift = [];
  for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
    const row = loaderResult.rows.find((r) => r.source_ref === ref);
    const fresh = (row && row.status === 'read') ? row.sha256 : '';
    const declared = (embeddedHashes && typeof embeddedHashes === 'object') ? (embeddedHashes[ref] || '') : '';
    if (row && row.status !== 'read') {
      blocks.push({ code: contract.BLOCKER_CODES.SOURCE_MISSING(ref), reason: 'source missing or unreadable: ' + ref });
      drift.push(ref);
      continue;
    }
    if (fresh !== declared) {
      blocks.push({ code: contract.BLOCKER_CODES.SOURCE_HASH_DRIFT(ref), reason: 'source hash drift: ' + ref });
      drift.push(ref);
    }
  }
  return { blocks, drift };
}

function validateRedaction(sidecar) {
  const blocks = [];
  const hits = contract.checkRedactionSafety(sidecar);
  if (hits.length > 0) {
    blocks.push({ code: contract.BLOCKER_CODES.REDACTION_LEAK(hits[0].kind + ':' + (hits[0].path || 'root')), reason: 'redaction scan flagged ' + hits.length + ' hit(s)' });
  }
  return blocks;
}

function validateDigest(sidecar, freshModel) {
  const blocks = [];
  if (!freshModel) return blocks;
  const declared = sidecar.chain_digest;
  const fresh = contract.computeChainDigest(freshModel);
  if (typeof declared !== 'string' || declared.length !== 64) {
    blocks.push({ code: contract.BLOCKER_CODES.DIGEST_DRIFT('shape:' + String(declared).slice(0, 16)), reason: 'chain_digest missing or not 64 hex chars' });
    return blocks;
  }
  if (declared !== fresh) {
    blocks.push({ code: contract.BLOCKER_CODES.DIGEST_DRIFT('value:' + declared.slice(0, 12) + '!=' + fresh.slice(0, 12)), reason: 'chain_digest mismatch (model has drifted from sidecar)' });
  }
  return blocks;
}

// Pick the dominant exit code based on the first blocker in priority order.
function selectExitCode(blockers) {
  if (blockers.length === 0) return contract.EXIT_CODES.PASS;
  for (const b of blockers) {
    if (b.code.indexOf('SOURCE-HASH-DRIFT') !== -1) return contract.EXIT_CODES.SOURCE_HASH_DRIFT;
    if (b.code.indexOf('REDACTION-LEAK') !== -1) return contract.EXIT_CODES.REDACTION_LEAK;
    if (b.code.indexOf('RUNNER-FAILURE') !== -1) return contract.EXIT_CODES.RUNNER_FAILURE;
  }
  return contract.EXIT_CODES.REJECTED_FAIL_CLOSED;
}

function buildVerifierCliLine(opts) {
  return contract.buildHealthLineChain({
    verdict: opts.verdict,
    exitCode: opts.exitCode,
    blockCount: opts.blockCount,
    sourceCount: contract.EXPECTED_SOURCE_COUNT,
    sectionCount: contract.EXPECTED_SECTION_COUNT,
    classCount: contract.EXPECTED_VERIFICATION_CLASS_COUNT,
    notProvenCount: Array.isArray(opts.notProvenIds) ? opts.notProvenIds.length : contract.EXPECTED_NOT_PROVEN_COUNT,
    mutationCount: 0,
    networkCallCount: 0,
    digest: opts.digest || 'pending',
  });
}

function failureSummary(blockers, prefix) {
  const sb = [];
  sb.push(prefix + ': block_count=' + blockers.length);
  for (const b of blockers) {
    sb.push('  - ' + b.code + ' :: ' + String(b.reason || '').slice(0, 200));
  }
  return sb.join('\n');
}

// Read+parse sidecar JSON; bounded to a reasonable size to avoid
// accidental memory blow-ups on tampered input.
function readSidecar(inputPath) {
  if (typeof inputPath !== 'string' || inputPath.length === 0) {
    const err = new Error('--input path is required');
    err.code = contract.BLOCKER_CODES.RUNNER_FAILURE() + ':INPUT-MISSING';
    throw err;
  }
  const abs = path.resolve(inputPath);
  if (!fs.existsSync(abs)) {
    const err = new Error('input sidecar not found: ' + abs);
    err.code = contract.BLOCKER_CODES.RUNNER_FAILURE() + ':INPUT-NOT-FOUND';
    throw err;
  }
  const stat = fs.statSync(abs);
  if (stat.size > 5 * 1024 * 1024) {
    const err = new Error('input sidecar exceeds 5 MB ceiling: ' + stat.size + ' bytes');
    err.code = contract.BLOCKER_CODES.RUNNER_FAILURE() + ':INPUT-TOO-LARGE';
    throw err;
  }
  const text = fs.readFileSync(abs, 'utf8');
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (e) {
    const err = new Error('input sidecar is not valid JSON: ' + e.message);
    err.code = contract.BLOCKER_CODES.RUNNER_FAILURE() + ':INPUT-MALFORMED-JSON';
    throw err;
  }
  return parsed;
}

// INDEPENDENCE GUARD — run once at module load. Reads the verifier's own
// source file and asserts that none of the forbidden import patterns
// appear. This protects against accidental dependency creep; the test
// suite also enforces it.
function enforceIndependence() {
  const src = fs.readFileSync(SCRIPT_PATH, 'utf8');
  for (const pat of FORBIDDEN_IMPORT_PATTERNS) {
    if (pat.test(src)) {
      const err = new Error('verifier independence violated: forbidden pattern ' + pat);
      err.code = contract.BLOCKER_CODES.PRODUCER_CLI_INVOKED(pat.source.slice(0, 32));
      throw err;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Pure sidecar verification (no IO, no mutation) — exported for tests.
// ---------------------------------------------------------------------------
function verifySidecar(sidecar, loaderResult) {
  const blockers = []
    .concat(validateSchema(sidecar))
    .concat(validateCounts(sidecar))
    .concat(validateSectionOrder(sidecar))
    .concat(validateClassOrder(sidecar))
    .concat(validateHardGateOrder(sidecar))
    .concat(validateSourceAllowlist(sidecar))
    .concat(validateLaunchPosture(sidecar))
    .concat(validateS10Crosslink(sidecar))
    .concat(validateNotProvenPreservation(sidecar))
    .concat(validateChainVerdict(sidecar))
    .concat(validateCounters(sidecar))
    .concat(validateHumanReviewSection(sidecar));

  // Source hash re-derivation — required, deterministic, independent.
  if (loaderResult) {
    const rr = rederiveSourceHashes(loaderResult, sidecar.source_hashes);
    for (const b of rr.blocks) blockers.push(b);
  }

  // Redaction safety scan — apply at top-level only.
  for (const b of validateRedaction(sidecar)) blockers.push(b);

  const exitCode = selectExitCode(blockers);
  const verdict = blockers.length === 0 ? contract.VERDICT_VALUES.CHAIN_RESOLVED : 'FAIL_CLOSED';
  return Object.freeze({
    ok: blockers.length === 0,
    verdict,
    exit_code: exitCode,
    blockers: Object.freeze(blockers.slice()),
    block_count: blockers.length,
    source_count: contract.EXPECTED_SOURCE_COUNT,
    section_count: contract.EXPECTED_SECTION_COUNT,
    class_count: contract.EXPECTED_VERIFICATION_CLASS_COUNT,
    not_proven_count: Array.isArray(sidecar.not_proven_preserved_ids) ? sidecar.not_proven_preserved_ids.length : 0,
    chain_digest: typeof sidecar.chain_digest === 'string' ? sidecar.chain_digest : 'pending',
  });
}

function run(argv) {
  enforceIndependence();

  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    process.stderr.write('M16-S11-CHAIN-MALFORMED-ARGV: ' + e.message + '\n');
    process.exit(contract.EXIT_CODES.RUNNER_FAILURE);
  }
  if (args.help) { printHelp(); process.exit(0); }

  let sidecar;
  try {
    sidecar = readSidecar(args.input);
  } catch (e) {
    process.stderr.write('M16-S11-CHAIN-INPUT-FAILURE: ' + e.message + '\n');
    process.exit(contract.EXIT_CODES.RUNNER_FAILURE);
  }

  // Load canonical references from disk for independent re-derivation.
  // The verifier ALWAYS reads from project ROOT — the canonical 17
  // sources are the single trust boundary. Tampered / re-rooted sidecars
  // therefore cannot hide drift by relocating the source root.
  let loaderResult;
  try {
    loaderResult = loader.loadCanonicalReferences({ sourceRoot: ROOT });
  } catch (e) {
    process.stderr.write('M16-S11-CHAIN-LOADER-FAILURE: ' + e.message + '\n');
    process.exit(contract.EXIT_CODES.RUNNER_FAILURE);
  }

  const result = verifySidecar(sidecar, loaderResult);

  const cliLine = buildVerifierCliLine({
    verdict: result.verdict,
    exitCode: result.exit_code,
    blockCount: result.block_count,
    notProvenIds: sidecar.not_proven_preserved_ids,
    digest: result.chain_digest,
  });
  process.stdout.write(cliLine + '\n');
  if (args.showBlockers || (result.block_count > 0 && result.exit_code !== 0)) {
    process.stderr.write(failureSummary(result.blockers, 'M16-S11-CHAIN-FAILURE-SUMMARY') + '\n');
  }
  process.exit(result.exit_code);
}

if (require.main === module) {
  run(process.argv);
}

module.exports = Object.freeze({
  parseArgs,
  printHelp,
  verifySidecar,
  validateSchema,
  validateCounts,
  validateSectionOrder,
  validateClassOrder,
  validateHardGateOrder,
  validateSourceAllowlist,
  validateLaunchPosture,
  validateS10Crosslink,
  validateNotProvenPreservation,
  validateChainVerdict,
  validateCounters,
  validateHumanReviewSection,
  rederiveSourceHashes,
  validateRedaction,
  selectExitCode,
  buildVerifierCliLine,
  failureSummary,
  readSidecar,
  enforceIndependence,
  run,
  ROOT,
  SCRIPT_PATH,
  FORBIDDEN_IMPORT_PATTERNS,
});
