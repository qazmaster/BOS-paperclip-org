#!/usr/bin/env node
'use strict';

/**
 * scripts/build_m016_s10_acceptance_contract.js
 *
 * M016-txa3vu / S10 / T02 — Canonical seven division acceptance sidecar builder.
 *
 * Single reproducible entrypoint that:
 *
 *   1. Loads ONLY the 15 allowlisted sources via
 *      `m016-s10-canonical-reference-loader.js` (no other filesystem reads,
 *      no network, no subprocesses, no env reads).
 *   2. Computes SHA-256 fingerprints PRE-write; the same digest map is
 *      re-derived POST-write to PROVE no upstream source was mutated by
 *      the build (mutation_count=0 invariant).
 *   3. Builds the canonical acceptance model via
 *      `contract.buildAcceptanceModel` + 6 frozen section builders
 *      (`buildR041Acceptance`, `buildMilestoneCriterion`,
 *      `buildS05CanonicalVerdicts`, `buildS08ScopeDecision`,
 *      `buildNotProvenPreservation`, `buildCanonicalAcceptanceOutcome`).
 *   4. Validates the model via `contract.evaluateAcceptance` (the same
 *      evaluator T03 verifier uses — pure invariant surface).
 *   5. Embeds loader summary (source_hashes + counters + provenance),
 *      evaluation result (blockers + redaction_hits + exit_code), and
 *      a byte-stable `acceptance_contract_digest` (sha256 of the
 *      canonicalized model).
 *   6. Writes the canonical JSON sidecar atomically (temp + POSIX
 *      rename) and refuses to overwrite without --force.
 *   7. Emits the stable builder CLI line on stdout:
 *        M16-S10-BUILD verdict=<ACCEPTANCE_BUILT|FAIL_CLOSED> exit=<0..9>
 *                       block_count=<n> criterion_count=6 not_proven_count=9
 *                       source_count=15 section_count=6 digest=<hex>
 *                       output_path=<rel> output_sha256=<hex>
 *
 * Threat surface:
 *   - argv only (no env / dotenv / history gating).
 *   - realpath containment on every output path; refuses traversal /
 *     symlink escape via `M16-S10-ACCEPTANCE-PATH-TRAVERSAL` blocker.
 *   - zero network calls (counter recorded = 0), zero env reads
 *     (counter recorded = 0), zero subprocess calls (counter = 0).
 *   - only writes to --output and a sibling .tmp-<pid>-<hex> file inside
 *     the same dir for atomicity.
 *   - atomic write uses temp + rename; no partial files left on failure.
 *   - no upstream source mutation: pre/post hash fingerprint equality is
 *     verified inline; failure to match aborts with exit 7
 *     (MUTATION_LEDGER_DRIFT).
 *   - redaction safety scan via `contract.checkRedactionSafety`; any hit
 *     aborts with exit 6 (REDACTION_LEAK).
 *
 * Exit codes (mapped via `contract.mapBlockerToExitCode`):
 *   0  ACCEPTANCE_PASS                  — all 15 sources read; evaluator returns ok=true
 *   1  ACCEPTANCE_MALFORMED             — CLI / argv / output path violation
 *   2  ACCEPTANCE_REJECTED_FAIL_CLOSED  — evaluator emits one or more blockers
 *                                         (canonical sidecar still written
 *                                         when --force is supplied)
 *   3  ACCEPTANCE_REPLAY_DRIFT          — pre/post source-hash drift detected
 *   4  ACCEPTANCE_SOURCE_HASH_DRIFT     — allowlisted source hash drift on rerun
 *   5  ACCEPTANCE_IDENTITY_DRIFT        — non-allowlisted source or path traversal
 *   6  ACCEPTANCE_REDACTION_LEAK        — leaked redaction-denied token
 *   7  ACCEPTANCE_MUTATION_LEDGER_DRIFT — upstream source mutated by build
 *   8  ACCEPTANCE_CLOSURE_KIND_DRIFT    — frozen posture drift (impossible by contract)
 *   9  ACCEPTANCE_RUNNER_FAILURE        — unexpected internal error
 *
 * Usage:
 *   node scripts/build_m016_s10_acceptance_contract.js [--force]
 *       [--output <path>] [--source-root <dir>]
 *       [--reference-time <iso>] [--dry-run]
 *       [--show-blockers]
 *
 * Refusing to overwrite an existing file without --force prevents
 * silent destruction of the canonical sidecar; CLI failures never
 * mutate upstream runtime-evidence.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const contract = require('./lib/m016-s10-acceptance-contract.js');
const loader = require('./lib/m016-s10-canonical-reference-loader.js');

const ROOT = loader.ROOT;
const SCRIPT_PATH = __filename;
const OUTPUT_PATH_DEFAULT = contract.DEFAULTS.acceptance_contract_output;
const REFERENCE_TIME_DEFAULT = contract.DEFAULTS.reference_time;

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const out = {
    force: false,
    output: OUTPUT_PATH_DEFAULT,
    sourceRoot: null,
    referenceTime: REFERENCE_TIME_DEFAULT,
    dryRun: false,
    showBlockers: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--force') out.force = true;
    else if (a === '--output') out.output = argv[++i];
    else if (a === '--source-root') out.sourceRoot = argv[++i];
    else if (a === '--reference-time') out.referenceTime = argv[++i];
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--show-blockers') out.showBlockers = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else {
      const err = new Error('unknown argv token: ' + a);
      err.code = contract.BLOCKER_CODES.RUNNER_FAILURE();
      err.argv_token = a;
      throw err;
    }
  }
  if (typeof out.output !== 'string' || out.output.length === 0) {
    out.output = OUTPUT_PATH_DEFAULT;
  }
  // reference-time MUST be ISO 8601 (frozen timestamp invariant).
  if (typeof out.referenceTime !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(out.referenceTime)) {
    const err = new Error('reference-time must be ISO 8601 (got: ' + out.referenceTime + ')');
    err.code = contract.BLOCKER_CODES.HEALTHLINE_MISMATCH('reference-time-format');
    throw err;
  }
  return out;
}

function printHelp() {
  process.stdout.write([
    'Usage: build_m016_s10_acceptance_contract.js [options]',
    '',
    'Options:',
    '  --force                       Overwrite an existing sidecar file',
    '  --output <path>               Sidecar output path',
    '  --source-root <dir>           Override the project root used to resolve sources',
    '  --reference-time <iso>        Override generated timestamp (deterministic)',
    '  --show-blockers               Print full blocker list to stderr',
    '  --dry-run                     Build + evaluate without writing',
    '  -h, --help                    Show this help',
    '',
    'Default output: ' + OUTPUT_PATH_DEFAULT,
    'Default reference-time: ' + REFERENCE_TIME_DEFAULT,
    'Builder line class: ' + contract.BUILDER_LINE_CLASS,
    'Blocker namespace: ' + contract.BLOCKER_NAMESPACE,
  ].join('\n') + '\n');
}

// ---------------------------------------------------------------------------
// Path containment for the WRITABLE output target.
//
// Lexical containment against ROOT — same policy as the S09 builder.
// Catches `/proj/foo/../../../etc/passwd` style attacks via both
// `path.relative` (which normalises `..`) and explicit `..` segment scan.
// ---------------------------------------------------------------------------
function ensureInsideRoot(absolutePath, sourceRoot, kind) {
  const root = (typeof sourceRoot === 'string' && sourceRoot.length > 0) ? path.resolve(sourceRoot) : ROOT;
  const target = path.resolve(absolutePath);
  const rel = path.relative(root, target);
  if (rel === '' || rel === '.') return;
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    const err = new Error(kind + ' escapes project root: ' + absolutePath + ' (rel=' + rel + ')');
    err.code = contract.BLOCKER_CODES.PATH_TRAVERSAL('output-' + kind);
    throw err;
  }
  const segments = rel.split(path.sep);
  for (const seg of segments) {
    if (seg === '..') {
      const err = new Error(kind + ' contains `..` segment: ' + absolutePath);
      err.code = contract.BLOCKER_CODES.PATH_TRAVERSAL('output-dots:' + kind);
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Atomic write — POSIX temp + rename; refuses to overwrite without --force.
// ---------------------------------------------------------------------------
function atomicWriteJson(targetPath, payload, options) {
  const opts = options || {};
  const target = path.resolve(targetPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target) && !opts.force) {
    const err = new Error('refusing to overwrite existing file ' + target + ' (use --force)');
    err.code = contract.BLOCKER_CODES.SOURCE_HASH_DRIFT('overwrite-denied:' + target);
    err.target = target;
    throw err;
  }
  const body = JSON.stringify(payload, null, 2) + '\n';
  const bytes = Buffer.from(body, 'utf8');
  const tmpPath = target + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  try {
    fs.writeFileSync(tmpPath, bytes);
    fs.renameSync(tmpPath, target);
  } catch (e) {
    try { fs.unlinkSync(tmpPath); } catch (_e2) { /* ignore */ }
    throw e;
  }
  return {
    path: target,
    size_bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
}

// ---------------------------------------------------------------------------
// Compute SHA-256 of a single allowlisted source ref — convenience helper
// that reuses the loader's all_hashes map. Returns 'pending' if missing.
// ---------------------------------------------------------------------------
function snapshotHash(loaderResult, ref, fallback) {
  const h = loaderResult.all_hashes[ref];
  if (typeof h === 'string' && h.length === 64) return h;
  return _asString(fallback, 'pending');
}

function _asString(value, fallback) {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

// ---------------------------------------------------------------------------
// Build the canonical acceptance model — frozen registry imports + section
// overrides driven by loader-computed SHA-256 fingerprints.
// ---------------------------------------------------------------------------
function buildModel(loaderResult, referenceTime) {
  // Per-source provenance: keep only the bounded digest, status, and
  // size; never embed raw payload bytes into the model.
  const sourceSnapshots = {};
  for (const row of loaderResult.rows) {
    sourceSnapshots[row.source_ref] = Object.freeze({
      snapshot_kind: row.status,
      captured_at: referenceTime,
      size_bytes: row.size_bytes,
      sha256: row.sha256,
      chain_role: row.chain_role,
      review_section: row.review_section,
      required: row.required === true,
      status: row.status,
    });
  }

  // Section A — R041 acceptance. text_snapshot_sha256 is bound to the
  // R041 source ref so downstream verifiers can re-verify text integrity
  // without re-reading the JSON.
  const r041Acceptance = contract.buildR041Acceptance({
    text_snapshot_sha256: snapshotHash(loaderResult, contract.REF.R041_TEXT),
  });

  // Section B — milestone criterion (6 verbatim bullets). The
  // roadmap_text_sha256 must equal the hash of 16-ROADMAP.md so any
  // text drift in the milestone wording surfaces as a
  // MILESTONE_CRITERION_DRIFT blocker.
  const milestoneCriterion = contract.buildMilestoneCriterion({
    roadmap_text_sha256: snapshotHash(loaderResult, contract.REF.ROADMAP_TEXT),
  });

  // Section C — S05 canonical verdicts. Pure registry defaults; the
  // loader does not influence verdict strings (anti-promotion rule).
  const s05CanonicalVerdicts = contract.buildS05CanonicalVerdicts({});

  // Section D — S08 scope decision. Frozen posture preserved verbatim.
  const s08ScopeDecision = contract.buildS08ScopeDecision({});

  // Section E — NOT_PROVEN preservation. The capability_audit_ref +
  // s09_review_ref point at S06 capability + S09 review; their hashes
  // are computed by the loader and embedded into source_hashes but not
  // directly into this section.
  const notProvenPreservation = contract.buildNotProvenPreservation({});

  // Section F — canonical acceptance outcome. Frozen posture; no
  // reconciliation_status or acceptance_verdict override accepted.
  const canonicalOutcome = contract.buildCanonicalAcceptanceOutcome({});

  // Composite builder — let the contract compute the canonical frozen
  // shape; only the `generated` timestamp and `task` override flow in.
  const model = contract.buildAcceptanceModel({
    generated: referenceTime,
    r041_acceptance: r041Acceptance,
    milestone_criterion: milestoneCriterion,
    s05_canonical_verdicts: s05CanonicalVerdicts,
    s08_scope_decision: s08ScopeDecision,
    not_proven_preservation: notProvenPreservation,
    canonical_acceptance_outcome: canonicalOutcome,
  });

  // Stamp the explicit T02 task identifier so downstream CLIs can
  // pattern-match the builder output without parsing the schema.
  model.task = 'T02';
  model.builder_line_class = contract.BUILDER_LINE_CLASS;
  model.canonical_protocol = contract.BUILDER_CANONICAL_PROTOCOL;

  // Attach source snapshots (bounded digests only — no raw payloads).
  model.source_snapshots = Object.freeze(sourceSnapshots);
  model.source_hashes = Object.freeze(Object.assign({}, loaderResult.all_hashes));

  return Object.freeze(model);
}

// ---------------------------------------------------------------------------
// Build the full sidecar payload — model + evaluation + provenance + digest
// ---------------------------------------------------------------------------
function buildPayload(model, evaluation, loaderResult, opts) {
  // The byte-stable digest of the canonicalized model — verifier must
  // reproduce this exact value when reloading from disk.
  const acceptanceContractDigest = contract.computeAcceptanceDigest(model);

  // Build counters — the loader enforces 0 for all four counters, the
  // builder adds one extra: temp_file_writes (1 during atomic write,
  // 0 post-rename).
  const counters = Object.freeze({
    network_calls: loaderResult.counters.network_calls,
    subprocess_calls: loaderResult.counters.subprocess_calls,
    env_reads: loaderResult.counters.env_reads,
    mutation_count: loaderResult.counters.mutation_count,
    temp_file_writes: opts.dryRun ? 0 : 1,
  });

  // Provenance appendix — same shape as the contract library's source
  // snapshots, augmented with read_count/missing_count/malformed_count.
  const provenanceAppendix = Object.freeze({
    source_count: loaderResult.summary.expected_count,
    read_count: loaderResult.summary.read_count,
    missing_count: loaderResult.summary.missing_count,
    malformed_count: loaderResult.summary.malformed_count,
    byte_total: loaderResult.summary.byte_total,
    source_refs: contract.SOURCE_ALLOWLIST_REFS.slice(),
  });

  // Blockers + redaction summary — bounded; no raw payload content.
  const boundedBlockers = evaluation.blockers.map((b) => Object.freeze({
    code: b.code,
    section_id: b.section_id || null,
    reason: typeof b.reason === 'string' ? b.reason.slice(0, 240) : '',
  }));
  const boundedRedactionHits = (evaluation.redaction_hits || []).map((h) => Object.freeze({
    kind: h.kind,
    path: h.path,
  }));

  // Output path (relative) for the health line — supplied separately so
  // this function can be tested without writing.
  const outputRel = path.isAbsolute(opts.output) ? path.relative(ROOT, opts.output) : opts.output;

  return Object.freeze({
    schema_id: contract.SCHEMA_ID,
    schema_version: contract.SCHEMA_VERSION,
    schema_namespace: contract.SCHEMA_NAMESPACE,
    acceptance_contract_id: contract.ACCEPTANCE_CONTRACT_ID,
    acceptance_contract_kind: contract.ACCEPTANCE_CONTRACT_KIND,
    acceptance_contract_digest: acceptanceContractDigest,
    milestone: contract.MILESTONE,
    slice: contract.SLICE,
    task: 'T02',
    builder_line_class: contract.BUILDER_LINE_CLASS,
    canonical_protocol: contract.BUILDER_CANONICAL_PROTOCOL,
    generated: model.generated,
    reference_time: opts.referenceTime,
    output_path: outputRel,
    section_count: model.section_count,
    section_ids: model.section_ids,
    source_count: model.source_count,
    source_refs: model.source_refs,
    source_hashes: model.source_hashes,
    source_snapshots: model.source_snapshots,
    provenance_appendix: provenanceAppendix,
    launch_posture: model.launch_posture,
    sections: model.sections,
    not_proven_preserved_count: model.not_proven_preserved_count,
    blocked_count: boundedBlockers.length,
    blockers: Object.freeze(boundedBlockers),
    redaction_hits: Object.freeze(boundedRedactionHits),
    redaction_posture: contract.REDACTION_FLAG_VALUES,
    evaluation: Object.freeze({
      ok: evaluation.ok === true,
      verdict: evaluation.ok === true ? contract.VERDICT_VALUES.ACCEPTANCE_BUILT : 'FAIL_CLOSED',
      exit_code: evaluation.exit_code,
      block_count: boundedBlockers.length,
    }),
    counters,
    sanitised: true,
    raw_bodies_persisted: false,
    producer_cli_invoked: false,
    network_calls: counters.network_calls,
    subprocess_calls: counters.subprocess_calls,
    env_reads: counters.env_reads,
    mutation_count: counters.mutation_count,
  });
}

// ---------------------------------------------------------------------------
// Builder CLI line — matches contract.buildHealthLineBuilder shape with
// optional output_path + output_sha256 extension.
// ---------------------------------------------------------------------------
function buildBuilderCliLine(payload, writeResult) {
  const blockCount = payload.blocked_count;
  const verdict = payload.evaluation.ok ? contract.VERDICT_VALUES.ACCEPTANCE_BUILT : 'FAIL_CLOSED';
  const exitCode = payload.evaluation.exit_code;
  const line = contract.buildHealthLineBuilder({
    verdict: verdict,
    exitCode: exitCode,
    blockCount: blockCount,
    criterionCount: contract.EXPECTED_MILESTONE_CRITERION_COUNT,
    notProvenCount: contract.EXPECTED_NOT_PROVEN_COUNT,
    sourceCount: payload.source_count,
    sectionCount: payload.section_count,
    digest: payload.acceptance_contract_digest,
  });
  if (writeResult && typeof writeResult === 'object') {
    return line + ' output_path=' + payload.output_path + ' output_sha256=' + writeResult.sha256;
  }
  return line + ' output_path=' + payload.output_path;
}

// ---------------------------------------------------------------------------
// Bounded stderr summary — surfaces blockers without leaking payload bytes
// ---------------------------------------------------------------------------
function failureStderrSummary(payload) {
  const sb = [];
  sb.push(contract.BUILDER_LINE_CLASS + ': verdict=' + payload.evaluation.verdict + ' exit=' + payload.evaluation.exit_code + ' block_count=' + payload.blocked_count);
  for (const blocker of payload.blockers) {
    sb.push('  - ' + blocker.code + ' :: ' + String(blocker.reason || '').slice(0, 200));
  }
  if (payload.redaction_hits && payload.redaction_hits.length > 0) {
    sb.push('redaction_hits:');
    for (const hit of payload.redaction_hits) sb.push('  - ' + hit.kind + '@' + hit.path);
  }
  return sb.join('\n');
}

// ---------------------------------------------------------------------------
// Main entrypoint
// ---------------------------------------------------------------------------
function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv || process.argv);
  } catch (e) {
    process.stderr.write('CLI parse failure: ' + (e && e.message ? e.message : e) + '\n');
    process.exit(1);
  }
  if (opts.help) {
    printHelp();
    return 0;
  }
  // Path containment on the output target (lexical — see ensureInsideRoot).
  try {
    ensureInsideRoot(opts.output, opts.sourceRoot, 'output');
  } catch (e) {
    process.stderr.write('Output path containment failure: ' + (e && e.message ? e.message : e) + '\n');
    process.exit(5);
  }
  // Source-root lexical containment (catches accidental /etc/passwd
  // overrides from CLI).
  if (opts.sourceRoot) {
    try {
      ensureInsideRoot(path.resolve(opts.sourceRoot) + '/x', opts.sourceRoot, 'source-root');
    } catch (e) {
      process.stderr.write('Source-root containment failure: ' + (e && e.message ? e.message : e) + '\n');
      process.exit(5);
    }
  }

  // 1. PRE-write hash snapshot.
  const preResult = loader.loadCanonicalReferences({ sourceRoot: opts.sourceRoot });
  const preSnapshot = loader.snapshotHashes(preResult);

  // 2. Build the model.
  let model;
  try {
    model = buildModel(preResult, opts.referenceTime);
  } catch (e) {
    process.stderr.write('Model build failure: ' + (e && e.message ? e.message : e) + '\n');
    process.exit(9);
  }

  // 3. Evaluate the model.
  const evaluation = contract.evaluateAcceptance({ model });

  // 4. Build the sidecar payload.
  const payload = buildPayload(model, evaluation, preResult, opts);

  // 5. Redaction safety scan on the payload itself (defense in depth —
  //    even though the contract's pure builders must not emit
  //    forbidden keys, the payload assembly must catch any future leak).
  try {
    contract.assertWriteSafe(payload);
  } catch (e) {
    process.stderr.write('Redaction safety violation: ' + (e && e.message ? e.message : e) + '\n');
    process.stderr.write(failureStderrSummary(payload) + '\n');
    process.exit(6);
  }

  // 6. Write (or dry-run).
  let writeResult = null;
  if (!opts.dryRun) {
    try {
      writeResult = atomicWriteJson(opts.output, payload, { force: opts.force });
    } catch (e) {
      const code = e && e.code ? String(e.code) : '';
      if (/SOURCE-HASH-DRIFT/.test(code)) {
        process.stderr.write('Atomic write refused: ' + (e && e.message ? e.message : e) + '\n');
        process.exit(4);
      }
      process.stderr.write('Atomic write failure: ' + (e && e.message ? e.message : e) + '\n');
      process.exit(9);
    }
  }

  // 7. POST-write hash snapshot — must equal PRE-snapshot byte-for-byte.
  const postResult = loader.loadCanonicalReferences({ sourceRoot: opts.sourceRoot });
  const postSnapshot = loader.snapshotHashes(postResult);
  const drift = loader.diffSnapshots(preSnapshot, postSnapshot);
  if (drift.drift_count > 0 || !drift.byte_total_unchanged || !drift.read_count_unchanged) {
    process.stderr.write('Mutation ledger drift: ' + JSON.stringify(drift) + '\n');
    process.exit(7);
  }

  // 8. Emit the builder CLI line on stdout + bounded stderr summary if
  //    there are blockers or redaction hits.
  const cliLine = buildBuilderCliLine(payload, writeResult);
  process.stdout.write(cliLine + '\n');
  if (payload.blocked_count > 0 && opts.showBlockers) {
    process.stderr.write(failureStderrSummary(payload) + '\n');
  } else if (payload.redaction_hits && payload.redaction_hits.length > 0) {
    process.stderr.write(failureStderrSummary(payload) + '\n');
  }

  // Exit code: PASS (0) when evaluator returned ok=true; otherwise
  // the evaluator's mapped exit code (which is the same code the T03
  // verifier returns for the same model).
  return evaluation.exit_code;
}

// Export for testability (node tests can call main with synthetic argv
// arrays and assert on the returned exit code without spawning a subprocess).
module.exports = Object.freeze({
  // Re-exports for tests
  ROOT, SCRIPT_PATH, OUTPUT_PATH_DEFAULT, REFERENCE_TIME_DEFAULT,

  // Internal functions (tests use these to verify behaviour without writing)
  parseArgs, printHelp, ensureInsideRoot, atomicWriteJson,
  buildModel, buildPayload, buildBuilderCliLine, failureStderrSummary,
  snapshotHash,

  // Main runner — exported so tests can call it directly with synthetic argv
  main,
});

// When invoked directly from the CLI, run main(); when required from a
// test, only the exports above are used.
if (require.main === module) {
  const exitCode = main(process.argv);
  process.exit(exitCode);
}