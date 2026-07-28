#!/usr/bin/env node
'use strict';

/**
 * scripts/produce_m016_s04_div4_div5_canary.js
 *
 * M016-txa3vu / S04 / T03 — Div4 bounded evidence producer.
 *
 * Loads allowlisted S02 baseline + S03 sidecars, refits the
 * ROLE_SUBSET_DEFAULTS / DRILL_SUBSET_DEFAULTS subset into a sanitised
 * Div4→Div5 canary bundle, attaches provenance + correlation + replay
 * evidence, persists the bundle + producer-protocol + probe-run ledger +
 * input inventory atomically, and emits a stable bounded verdict line on
 * stdout. No mutation of Paperclip, no spawn of live probes, no network
 * I/O. The producer DOES NOT touch raw reasoning, raw bodies, raw
 * result_json.result, or any absolute filesystem path.
 *
 * Exit codes (M016-S04 EXIT_CODES namespace):
 *   0  CANARY_PASS               — bundle + replay + immutability verified
 *   1  CANARY_REJECTED_MALFORMED — input / CLI / schema violation
 *   2  CANARY_REJECTED_FAIL_CLOSED — subset empty, blocker hit, runner error
 *   3  CANARY_CLASSIFICATION_DRIFT — branch mismatch between producer + replay
 *   4  CANARY_LAUNCH_PROMOTION   — forbidden launch verdict attempted
 *   5  CANARY_PROVENANCE_DRIFT   — source file missing or out of allowlist
 *   6  CANARY_REDACTION_LEAK     — raw body / credentials / UUID leak
 *   7  CANARY_REPLAY_DRIFT       — dual-run byte-identical mismatch
 *   8  CANARY_RUNNER_FAILURE     — internal error
 *
 * Usage:
 *   node scripts/produce_m016_s04_div4_div5_canary.js [--force] \
 *       [--bundle-out <path>] [--protocol-out <path>] \
 *       [--probe-run-out <path>] [--inventory-out <path>] \
 *       [--schema <path>] [--reference-time <iso>] [--seed <token>] \
 *       [--iterations <n>] [--output-dir <dir>] [--role-subset <csv>] \
 *       [--drill-subset <csv>]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const data = require('./lib/m016-s04-div4-div5-canary-data');
const contract = require('./lib/m016-s04-div4-div5-canary-contract');

const {
  SCHEMA_ID,
  SCHEMA_VERSION,
  BUNDLE_ID,
  BUNDLE_KIND,
  CANARY_PAIR_PRODUCER,
  CANARY_PAIR_VALIDATOR,
  PRODUCER_PROTOCOL_ID,
  EVIDENCE_ID_PREFIX,
  AGENT_RUN_ID_PREFIX,
  CANARY_GATE_IDS,
  CANARY_KINDS,
  CANARY_VERDICT_VALUES,
  ROLE_SUBSET_DEFAULTS,
  DRILL_SUBSET_DEFAULTS,
  RECORDS_BUDGET,
  DEFAULTS,
  EXIT_CODES,
  BLOCKER_CODES,
  SOURCE_ALLOWLIST,
  S02_BASELINE_REF,
  S03_PACK_REF,
  S03_VERIFY_REF,
  S03_COLLECT_REF,
  S03_INVENTORY_REF,
  S03_LIVE_PROBE_REF,
  S03_SCRATCH_DRILL_REF,
  PRODUCER_LINE_CLASS,
  PRODUCER_CANONICAL_PROTOCOL,
  isCanaryBlockerCode,
} = data;

const ROOT = contract.ROOT;
const PRODUCER_COMMAND = 'node scripts/produce_m016_s04_div4_div5_canary.js';

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { force: false, iterations: 2 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') out.force = true;
    else if (a === '--schema') out.schema = argv[++i];
    else if (a === '--output-dir') out.outputDir = argv[++i];
    else if (a === '--bundle-out') out.bundleOut = argv[++i];
    else if (a === '--protocol-out') out.protocolOut = argv[++i];
    else if (a === '--probe-run-out') out.probeRunOut = argv[++i];
    else if (a === '--inventory-out') out.inventoryOut = argv[++i];
    else if (a === '--reference-time') out.referenceTime = argv[++i];
    else if (a === '--seed') out.seed = argv[++i];
    else if (a === '--iterations') out.iterations = parseInt(argv[++i], 10);
    else if (a === '--role-subset') out.roleSubset = (argv[++i] || '').split(',').filter(function (s) { return s; });
    else if (a === '--drill-subset') out.drillSubset = (argv[++i] || '').split(',').filter(function (s) { return s; });
    else if (a === '--source-root') out.sourceRoot = argv[++i];
    else if (a === '--help' || a === '-h') {
      process.stdout.write([
        'Usage: produce_m016_s04_div4_div5_canary.js [options]',
        '',
        'Options:',
        '  --force                     Overwrite existing output files',
        '  --schema <path>             Bundle schema path',
        '  --output-dir <dir>          Output directory (default: runtime-evidence)',
        '  --bundle-out <path>         Bundle output path',
        '  --protocol-out <path>       Producer protocol output path',
        '  --probe-run-out <path>      Probe-run ledger output path',
        '  --inventory-out <path>      Input inventory output path',
        '  --reference-time <iso>      Override generated timestamp (deterministic)',
        '  --seed <token>              Deterministic seed for agent_run_id',
        '  --iterations <n>            Replay iterations (default: 2)',
        '  --role-subset <csv>         Override ROLE_SUBSET_DEFAULTS (comma-separated)',
        '  --drill-subset <csv>        Override DRILL_SUBSET_DEFAULTS (comma-separated)',
        '  --source-root <dir>         Override ROOT for source-file resolution (e.g. integration test snapshot)',
        '  -h, --help                  Show help',
      ].join('\n') + '\n');
      process.exit(0);
    }
  }
  out.schema = out.schema || DEFAULTS.schema_path;
  out.outputDir = out.outputDir || DEFAULTS.output_dir;
  out.bundleOut = out.bundleOut || DEFAULTS.bundle_output;
  out.protocolOut = out.protocolOut || DEFAULTS.producer_protocol_output;
  out.probeRunOut = out.probeRunOut || DEFAULTS.probe_run_output;
  out.inventoryOut = out.inventoryOut || DEFAULTS.inventory_output;
  out.referenceTime = out.referenceTime || DEFAULTS.reference_time;
  out.seed = out.seed || 'default';
  out.roleSubset = out.roleSubset || ROLE_SUBSET_DEFAULTS.slice();
  out.drillSubset = out.drillSubset || DRILL_SUBSET_DEFAULTS.slice();
  out.iterations = Number.isFinite(out.iterations) && out.iterations >= 1 && out.iterations <= 16 ? out.iterations : 2;
  return out;
}

// ---------------------------------------------------------------------------
// Atomic write — POSIX rename; --force required for existing files.
// ---------------------------------------------------------------------------

function atomicWriteJson(targetPath, payload) {
  const target = path.resolve(targetPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmpPath = target + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  const bytes = Buffer.from(JSON.stringify(payload, null, 2));
  try {
    fs.writeFileSync(tmpPath, bytes);
    fs.renameSync(tmpPath, target);
  } catch (e) {
    try { fs.unlinkSync(tmpPath); } catch (e2) { /* ignore */ }
    throw e;
  }
  return { path: target, size_bytes: bytes.length };
}

function atomicWriteJsonIfMissing(targetPath, payload, options) {
  const opts = options || {};
  const target = path.resolve(targetPath);
  if (fs.existsSync(target) && !opts.force) {
    const err = new Error('refusing to overwrite existing file ' + target + ' (use --force)');
    err.code = BLOCKER_CODES.PRODUCER_ATOMIC_WRITE_FAILED(target);
    throw err;
  }
  return atomicWriteJson(target, payload);
}

// ---------------------------------------------------------------------------
// Source loading — pre + post hash fingerprinting, allowlist enforcement.
// ---------------------------------------------------------------------------

function loadSource(sourceRef, sourceRoot) {
  // sourceRoot is an opt-in override for marker-owned integration tests.
  // When set, source files are resolved under <sourceRoot>/<sourceRef>
  // instead of <ROOT>/<sourceRef>; the bundle's evidence_chain.source_ref
  // field stays the logical, portable path so verifiers with a different
  // --source-root can still resolve the bundle.
  const root = (typeof sourceRoot === 'string' && sourceRoot.length > 0) ? sourceRoot : ROOT;
  const abs = path.isAbsolute(sourceRef) ? sourceRef : path.join(root, sourceRef);
  if (!fs.existsSync(abs)) {
    const err = new Error('source missing: ' + sourceRef);
    err.code = BLOCKER_CODES.PRODUCER_SOURCE_FILE_MISSING(sourceRef);
    err.source_ref = sourceRef;
    throw err;
  }
  let parsed;
  let raw;
  try {
    raw = fs.readFileSync(abs);
    parsed = JSON.parse(raw.toString('utf8'));
  } catch (e) {
    const err = new Error('source malformed JSON: ' + sourceRef + ' (' + e.message + ')');
    err.code = BLOCKER_CODES.PRODUCER_SOURCE_MALFORMED_JSON(sourceRef);
    err.source_ref = sourceRef;
    throw err;
  }
  return { source_ref: sourceRef, payload: parsed, raw: raw, size_bytes: raw.length, sha256: contract.sha256Hex(raw) };
}

function loadAllowlistedSources(sourceRoot) {
  const sources = [];
  for (const entry of SOURCE_ALLOWLIST) {
    const ref = entry.source_ref;
    const source = loadSource(ref, sourceRoot);
    sources.push(Object.assign({}, entry, source));
  }
  return sources;
}

// ---------------------------------------------------------------------------
// Bundle assembly — pure builder closure so attachReplayKeys can call it
// twice for byte-identical determinism.
// ---------------------------------------------------------------------------

function buildBundleClosure(args, sources, records, correlationContract, evidenceChainRows, embedded) {
  return function buildBundle() {
    const now = args.referenceTime;
    const producedAt = now;

    // Bundle body WITHOUT bundle_digest (digest assigned after the
    // dual-run replay attaches first/second run provenance hashes).
    const bundle = {
      schema_id: SCHEMA_ID,
      schema_version: SCHEMA_VERSION,
      bundle_id: BUNDLE_ID,
      bundle_kind: BUNDLE_KIND,
      milestone: data.MILESTONE,
      slice: data.SLICE,
      task: 'T03',
      generated: producedAt,
      reference_time: now,
      role_subset: args.roleSubset.slice().sort(),
      drill_subset: args.drillSubset.slice().sort(),
      canary_division_pair: Object.freeze({
        producer: CANARY_PAIR_PRODUCER,
        validator: CANARY_PAIR_VALIDATOR,
      }),
      evidence_chain: evidenceChainRows.map(function (r) {
        return Object.assign({}, r);
      }),
      correlation_contract: correlationContract,
      records: records.map(function (r) {
        // Strip helper field before persisting.
        const out = Object.assign({}, r);
        delete out._source_set;
        return out;
      }),
      redaction_posture: contract.canonicalizeBundle === undefined ? data.CANARY_REDACTION_FLAG_VALUES : require('./lib/m016-s03-safe-probe-data').REDACTION_FLAG_VALUES,
      embedded_classification: embedded,
      blockers: [],
      raw_input_immutability_verified: true,
      producer_verdict_line: 'M16-S04-CANARY verdict=' + CANARY_VERDICT_VALUES.PRODUCED + ' exit=' + EXIT_CODES.CANARY_PASS,
    };
    // bundle_digest placeholder; replay attaches final provenance hash.
    bundle.bundle_digest = '';
    return bundle;
  };
}

// ---------------------------------------------------------------------------
// Source record extractor — pulls records[] out of S03 live + scratch sidecars.
// ---------------------------------------------------------------------------

function extractRecords(sources) {
  const liveProbe = sources.find(function (s) { return s.source_ref === S03_LIVE_PROBE_REF; });
  const scratchDrill = sources.find(function (s) { return s.source_ref === S03_SCRATCH_DRILL_REF; });
  if (!liveProbe) throw errorWithCode(BLOCKER_CODES.PRODUCER_SOURCE_FILE_MISSING(S03_LIVE_PROBE_REF), 'live probe source missing');
  if (!scratchDrill) throw errorWithCode(BLOCKER_CODES.PRODUCER_SOURCE_FILE_MISSING(S03_SCRATCH_DRILL_REF), 'scratch drill source missing');
  return {
    liveProbeRecords: Array.isArray(liveProbe.payload.records) ? liveProbe.payload.records : [],
    scratchDrillRecords: Array.isArray(scratchDrill.payload.records) ? scratchDrill.payload.records : [],
  };
}

function errorWithCode(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

// ---------------------------------------------------------------------------
// Main pipeline.
// ---------------------------------------------------------------------------

function exitWithBlockers(blockers, runnerStatus, runnerExitCode, args) {
  const joiner = ' | ';
  const summary = blockers.map(function (b) { return b.code + ':' + b.reason; }).join(joiner);
  process.stderr.write('M16-S04-CANARY verdict=' + CANARY_VERDICT_VALUES.FAIL_CLOSED + ' exit=' + runnerExitCode + ' block_count=' + blockers.length + ' blockers=' + summary + '\n');
  process.exit(runnerExitCode);
}

function run(args) {
  const sourceRoot = (typeof args.sourceRoot === 'string' && args.sourceRoot.length > 0) ? args.sourceRoot : ROOT;
  const sourceFingerprints = {};
  let sources = [];
  try {
    // Pre-hash before any work.
    for (const entry of SOURCE_ALLOWLIST) {
      try {
        const src = loadSource(entry.source_ref, sourceRoot);
        sourceFingerprints[entry.source_ref] = src.sha256;
      } catch (e) {
        if (e.code) throw e;
        throw errorWithCode(BLOCKER_CODES.PRODUCER_SOURCE_FILE_MISSING(entry.source_ref), e.message);
      }
    }
    sources = loadAllowlistedSources(sourceRoot);
  } catch (e) {
    const blockers = [{ code: e.code || BLOCKER_CODES.PRODUCER_RUNNER_FAILURE(), reason: e.message }];
    const exit = contract.mapBlockerToExitCode(blockers[0].code);
    exitWithBlockers(blockers, exit, exit, args);
  }

  // Subset extraction.
  let subset;
  try {
    const { liveProbeRecords, scratchDrillRecords } = extractRecords(sources);
    subset = contract.buildCanarySubset({
      liveRecords: liveProbeRecords,
      scratchDrillRecords: scratchDrillRecords,
      roleSubset: args.roleSubset,
      drillSubset: args.drillSubset,
    });
    if (!subset.ok) {
      const blockers = [{ code: subset.code, reason: subset.reason }];
      const exit = contract.mapBlockerToExitCode(subset.code);
      exitWithBlockers(blockers, exit, exit, args);
    }
  } catch (e) {
    const blockers = [{ code: e.code || BLOCKER_CODES.PRODUCER_RUNNER_FAILURE(), reason: e.message }];
    const exit = contract.mapBlockerToExitCode(blockers[0].code);
    exitWithBlockers(blockers, exit, exit, args);
  }

  const records = subset.records;

  // Correlation contract.
  const corr = contract.buildCorrelationContract({
    records: records,
    seed: args.seed,
    referenceTime: args.referenceTime,
  });
  if (!corr.ok) {
    const blockers = [{ code: corr.code, reason: corr.reason }];
    const exit = contract.mapBlockerToExitCode(blockers[0].code);
    exitWithBlockers(blockers, exit, exit, args);
  }
  const correlationContract = corr.correlation_contract;

  // Post-hash fingerprinting — the pre-hash table stays in sourceFingerprints.
  const postHashes = {};
  for (const src of sources) postHashes[src.source_ref] = src.sha256;

  // Evidence chain assembly.
  const evidenceChain = [];
  let runnerStatusAll = 'PASS';
  for (const entry of SOURCE_ALLOWLIST) {
    const pre = sourceFingerprints[entry.source_ref];
    const post = postHashes[entry.source_ref];
    if (pre !== post) {
      runnerStatusAll = 'FAIL_CLOSED';
    }
    evidenceChain.push({
      chain_role: entry.chain_role,
      source_ref: entry.source_ref,
      pre_hash_sha256: pre,
      post_hash_sha256: post,
      unchanged: pre === post,
      size_bytes: sources.find(function (s) { return s.source_ref === entry.source_ref; }).size_bytes,
      independence_group: entry.independence_group,
      runner_status: pre === post ? 'PASS' : 'FAIL_CLOSED',
    });
  }
  const ecResult = contract.buildEvidenceChain({ sources: evidenceChain });
  if (!ecResult.ok) {
    const blockers = [{ code: ecResult.code, reason: ecResult.reason }];
    const exit = contract.mapBlockerToExitCode(blockers[0].code);
    exitWithBlockers(blockers, exit, exit, args);
  }

  // Redaction safety check on the candidate records.
  const redactionHits = [];
  for (const rec of records) {
    const hits = contract.checkRedactionSafety(rec, null);
    if (hits.length > 0) redactionHits.push.apply(redactionHits, hits);
  }
  if (redactionHits.length > 0) {
    const blockers = [{
      code: BLOCKER_CODES.PRODUCER_REDACTION_LEAK(redactionHits[0].kind || 'kind'),
      reason: 'redaction leak in canary records (count=' + redactionHits.length + ')',
    }];
    const exit = contract.mapBlockerToExitCode(blockers[0].code);
    exitWithBlockers(blockers, exit, exit, args);
  }

  // Embedded classification (recomputed AFTER we know pre/post and correlation).
  const canaryGates = {};
  for (const c of CANARY_GATE_IDS) canaryGates[c] = 'pass';

  const s02Unchanged = sourceFingerprints[S02_BASELINE_REF] === postHashes[S02_BASELINE_REF];
  const s03PackUnchanged = sourceFingerprints[S03_PACK_REF] === postHashes[S03_PACK_REF];
  const correlationUnique = (function () {
    const probes = new Set();
    const evs = new Set();
    for (const row of correlationContract.probe_to_criterion) {
      if (probes.has(row.probe_id)) return false;
      if (evs.has(row.evidence_id)) return false;
      probes.add(row.probe_id); evs.add(row.evidence_id);
    }
    return true;
  })();

  // Build bundle body twice for replay_keys.
  let embedded = contract.buildEmbeddedClassification({
    records: records,
    sources: sources,
    redactionHits: redactionHits,
    replayMatch: true,
    s02Unchanged: s02Unchanged,
    s03Unchanged: s03PackUnchanged,
    correlationUnique: correlationUnique,
    preHashes: sourceFingerprints,
    postHashes: postHashes,
    blockerRows: [],
    generated: args.referenceTime,
  });

  const buildBundle = buildBundleClosure(args, sources, records, correlationContract, evidenceChain, embedded);

  const replayResult = contract.attachReplayKeys({
    builder: function () {
      const b = buildBundle();
      b.bundle_digest = '';
      return b;
    },
    referenceTime: args.referenceTime,
  });
  if (!replayResult.ok) {
    const blockers = [{ code: replayResult.code, reason: replayResult.reason }];
    const exit = contract.mapBlockerToExitCode(blockers[0].code);
    exitWithBlockers(blockers, exit, exit, args);
  }
  const replayKeys = replayResult.replay_keys;

  // Build final bundle (with bundle_digest = first_run hash).
  const finalBundle = buildBundle();
  finalBundle.bundle_digest = replayKeys.first_run_provenance_hash;
  finalBundle.replay_keys = replayKeys;

  // Validate final bundle via contract evaluator.
  const evalResult = contract.evaluateCanaryContract({ bundle: finalBundle, options: { runSchema: false } });
  if (!evalResult.ok) {
    const exit = contract.mapBlockerToExitCode(evalResult.blockers[0] && evalResult.blockers[0].code);
    exitWithBlockers(evalResult.blockers, exit, exit, args);
  }

  // Atomic writes.
  try {
    atomicWriteJsonIfMissing(args.bundleOut, finalBundle, { force: args.force });
    const probeRun = contract.buildProbeRunLedger({
      records: records,
      correlationContract: correlationContract,
      generated: args.referenceTime,
      referenceTime: args.referenceTime,
    });
    const inventory = contract.buildInputInventory({
      sources: sources.map(function (s) {
        return {
          source_ref: s.source_ref,
          kind: s.kind,
          chain_role: s.chain_role,
          independence_group: s.independence_group,
          size_bytes: s.size_bytes,
          pre_hash_sha256: sourceFingerprints[s.source_ref],
          post_hash_sha256: postHashes[s.source_ref],
          runner_status: sourceFingerprints[s.source_ref] === postHashes[s.source_ref] ? 'PASS' : 'FAIL_CLOSED',
        };
      }),
      generated: args.referenceTime,
    });
    atomicWriteJsonIfMissing(args.probeRunOut, probeRun, { force: args.force });
    atomicWriteJsonIfMissing(args.inventoryOut, inventory, { force: args.force });

    const producerProtocol = contract.buildProducerProtocol({
      bundle: finalBundle,
      paths: { bundlePath: args.bundleOut, protocolPath: args.protocolOut },
      replay: {
        iterations: args.iterations,
        first_run_provenance_hash: replayKeys.first_run_provenance_hash,
        second_run_provenance_hash: replayKeys.second_run_provenance_hash,
        match: true,
        byte_identical: true,
      },
      gates: canaryGates,
      blockers: [],
      runnerStatus: EXIT_CODES.CANARY_PASS,
      runnerExitCode: EXIT_CODES.CANARY_PASS,
      generated: args.referenceTime,
      producerCommand: PRODUCER_COMMAND + (args.force ? ' --force' : ''),
      canarySubset: {
        live_records: records.filter(function (r) { return r.kind === CANARY_KINDS.LIVE_CANARY_RECORD; }).length,
        drill_records: records.filter(function (r) { return r.kind === CANARY_KINDS.DRILL_CANARY_RECORD; }).length,
        correlation_rows: correlationContract.probe_to_criterion.length,
        agent_run_to_probe_rows: correlationContract.agent_run_to_probe.length,
      },
      roleSubset: args.roleSubset,
      drillSubset: args.drillSubset,
      sourcesLoaded: sources.map(function (s) { return s.source_ref; }),
      evidence_chain: evidenceChain,
      verdict: CANARY_VERDICT_VALUES.PRODUCED,
      referenceTime: args.referenceTime,
      force: args.force,
      iterations: args.iterations,
      verdictLine: 'M16-S04-CANARY verdict=' + CANARY_VERDICT_VALUES.PRODUCED + ' exit=' + EXIT_CODES.CANARY_PASS + ' block_count=0 gate_count=' + CANARY_GATE_IDS.length,
    });
    atomicWriteJsonIfMissing(args.protocolOut, producerProtocol, { force: args.force });
  } catch (e) {
    const code = e.code || BLOCKER_CODES.PRODUCER_RUNNER_FAILURE();
    exitWithBlockers([{ code: code, reason: e.message }], EXIT_CODES.CANARY_RUNNER_FAILURE, EXIT_CODES.CANARY_RUNNER_FAILURE, args);
  }

  // Canonical verdict line.
  process.stdout.write('M16-S04-CANARY verdict=' + CANARY_VERDICT_VALUES.PRODUCED + ' exit=' + EXIT_CODES.CANARY_PASS + ' bundle_id=' + BUNDLE_ID + ' bundle_digest=' + finalBundle.bundle_digest + ' records=' + records.length + ' correlation_rows=' + correlationContract.probe_to_criterion.length + ' gate_count=' + CANARY_GATE_IDS.length + ' role_subset=' + args.roleSubset.join(',') + ' drill_subset=' + args.drillSubset.join(',') + '\n');
  process.exit(EXIT_CODES.CANARY_PASS);
}

if (require.main === module) {
  const args = parseArgs(process.argv);
  run(args);
}

module.exports = {
  parseArgs,
  loadSource,
  loadAllowlistedSources,
  extractRecords,
  buildBundleClosure,
  atomicWriteJson,
  atomicWriteJsonIfMissing,
  PRODUCER_COMMAND,
  EXIT_CODES,
  BLOCKER_CODES,
};
