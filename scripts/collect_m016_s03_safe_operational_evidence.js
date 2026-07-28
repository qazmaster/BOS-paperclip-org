#!/usr/bin/env node
'use strict';

/**
 * scripts/collect_m016_s03_safe_operational_evidence.js
 *
 * M016-txa3vu / S03 / T05 — Offline collector that converts allowlisted
 * S03 live-probe and scratch-drill sidecars into the canonical
 * safe-operational-evidence-pack.json. Runs an inline dual-run replay
 * to prove byte-identical determinism, writes the pack + inventory +
 * protocol atomically with a --force guard, and emits a stable bounded
 * verdict line on stdout.
 *
 * The collector NEVER touches Paperclip core, plugin state, raw
 * result_json.result, or the S02 baseline. Every raw input is SHA-256
 * fingerprinted before and after collection; any drift is a hard runner
 * failure. Embedded classification stays frozen at orchestration=PASS,
 * evidence=PASS, launch=PREPARATION_ONLY with HG3..HG8=pass so the sidecar
 * structurally cannot be promoted into a launch proof.
 *
 * Exit codes (M16-S03 EXIT_CODES namespace):
 *   0  PACK_VALID — pack written, dual-run byte-identical, redaction clean
 *   1  PACK_REJECTED_MALFORMED — input/CLI/schema violation
 *   2  PACK_REJECTED_FAIL_CLOSED — source out of allowlist, symlink escape,
 *                                  classification drift, raw/sanitised confusion
 *   3  PACK_REPLAY_DRIFT — dual-run provenance/byte mismatch
 *   4  PACK_LAUNCH_PROMOTION — forbidden launch verdict attempted
 *   5  PACK_REDACTION_LEAK — UUID/credential/vendor-reuse leak
 *   6  PACK_RUNNER_FAILURE — internal error
 *
 * Usage:
 *   node scripts/collect_m016_s03_safe_operational_evidence.js [--force] \
 *        [--output-dir <dir>] [--pack-out <path>] \
 *        [--inventory-out <path>] [--protocol-out <path>] \
 *        [--schema <path>] [--pack-id <id>] [--reference-time <iso>]
 *
 * Internal flags are used by the dual-run replay path and are not part
 * of the public surface.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const data = require('./lib/m016-s03-safe-operational-evidence-pack-data');
const contract = require('./lib/m016-s03-safe-operational-evidence-pack-contract');

const {
  PACK_SCHEMA_ID,
  PACK_SCHEMA_VERSION,
  PACK_ID,
  PACK_KIND,
  PACK_TASK_ID,
  BLOCKER_CODES,
  SOURCE_ALLOWLIST,
  S02_BASELINE_REF,
  PACK_ROLE_REGISTRY,
  DRILL_REGISTRY,
  EXIT_CODES,
  DEFAULTS,
} = data;

const ROOT = contract.ROOT;
const SCRIPT_PATH = __filename;

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { force: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') out.force = true;
    else if (a === '--schema') out.schema = argv[++i];
    else if (a === '--output-dir') out.outputDir = argv[++i];
    else if (a === '--pack-out') out.packOut = argv[++i];
    else if (a === '--inventory-out') out.inventoryOut = argv[++i];
    else if (a === '--protocol-out') out.protocolOut = argv[++i];
    else if (a === '--reference-time') out.referenceTime = argv[++i];
    else if (a === '--pack-id') out.packId = argv[++i];
    else if (a === '--help' || a === '-h') {
      process.stdout.write([
        'Usage: collect_m016_s03_safe_operational_evidence.js [options]',
        '',
        'Options:',
        '  --schema <path>             Schema path (default: schemas/runtime-evidence/m016-s03-safe-operational-evidence-pack.v1.json)',
        '  --output-dir <dir>          Output directory (default: runtime-evidence)',
        '  --pack-out <path>           Pack output path',
        '  --inventory-out <path>      Inventory output path',
        '  --protocol-out <path>       Collect protocol output path',
        '  --force                     Overwrite existing output files',
        '  --pack-id <id>              Override pack_id (determinism)',
        '  --reference-time <iso>      Override generated timestamp (determinism)',
        '  -h, --help                  Show this help',
      ].join('\n') + '\n');
      process.exit(0);
    }
  }
  out.schema = out.schema || DEFAULTS.schema_path;
  out.outputDir = out.outputDir || DEFAULTS.output_dir;
  out.packOut = out.packOut || DEFAULTS.pack_output;
  out.inventoryOut = out.inventoryOut || DEFAULTS.inventory_output;
  out.protocolOut = out.protocolOut || DEFAULTS.protocol_output;
  out.packId = out.packId || PACK_ID;
  out.referenceTime = out.referenceTime || null;
  return out;
}

// ---------------------------------------------------------------------------
// Atomic write — POSIX rename; --force required for existing files.
// ---------------------------------------------------------------------------

function atomicWriteJson(targetPath, payload) {
  const target = path.resolve(targetPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmpPath = `${target}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
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
    const err = new Error(`refusing to overwrite existing file ${target} (use --force)`);
    err.code = BLOCKER_CODES.ATOMIC_WRITE_FAILED(target);
    throw err;
  }
  return atomicWriteJson(target, payload);
}

// ---------------------------------------------------------------------------
// Inventory builder
// ---------------------------------------------------------------------------

function buildInventory(sourceEntries, sanitisedProjections, preHashes, generated) {
  const projectionMap = new Map();
  for (const item of sanitisedProjections) {
    projectionMap.set(item.source_ref, item.projection);
  }
  return {
    $schema: 'gsd/m016-s03-safe-operational-evidence-pack-inventory-v1',
    milestone: data.MILESTONE,
    slice: data.SLICE,
    task: PACK_TASK_ID,
    generated,
    source_count: sourceEntries.length,
    sources: sourceEntries.map((s) => ({
      source_ref: s.source_ref,
      kind: s.kind,
      pre_hash_sha256: s.pre_hash_sha256,
      post_hash_sha256: s.post_hash_sha256,
      sanitised_sha256: s.sanitised_sha256,
      independence_group: s.independence_group,
      size_bytes: s.size_bytes,
      claim_ids_count: s.claim_ids.length,
      projection_keys: s.projection_keys,
      captured_at: s.captured_at,
      raw_input_immutable: s.pre_hash_sha256 === s.post_hash_sha256,
    })),
    independence_groups: sourceEntries.map((s) => s.independence_group).sort(),
    raw_input_hashes: preHashes,
    raw_input_immutability_verified: true,
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv);

  // Compute pre-collection raw hashes for immutability proof.
  let preHashes;
  try { preHashes = contract.computeRawInputHashes(); }
  catch (e) {
    process.stderr.write(`FAIL: pre-collection raw hash failed: ${e.message}\n`);
    process.exit(contract.exitCodeFor(e.code));
  }

  // Compute S02 baseline raw bytes hash + canonical hash upfront for immutability proof.
  let s02PreRawHash;
  let s02PreCanonicalHash;
  try {
    const s02Baseline = contract.loadS02Baseline();
    s02PreRawHash = contract.sha256Hex(s02Baseline.rawBytes);
    s02PreCanonicalHash = contract.computeS02CanonicalHash(s02Baseline.parsed);
  } catch (e) {
    process.stderr.write(`FAIL: S02 baseline pre-hash failed: ${e.message}\n`);
    process.exit(contract.exitCodeFor(e.code));
  }

  // Load schema (optional AJV).
  let schema;
  try { schema = contract.loadSchema(args.schema); }
  catch (e) {
    process.stderr.write(`FAIL: schema load failed: ${e.message}\n`);
    process.exit(EXIT_CODES.PACK_REJECTED_MALFORMED);
  }

  // Build pack candidate with frozen timestamp for byte-identity.
  const referenceTime = args.referenceTime || new Date().toISOString();
  let buildResult;
  try {
    buildResult = contract.buildPackCandidate({
      packId: args.packId,
      generated: referenceTime,
    });
  } catch (e) {
    process.stderr.write(`FAIL: pack build failed: ${e.message}\n`);
    process.exit(contract.exitCodeFor(e.code));
  }
  const { pack, sanitisedProjections, sourceEntries } = buildResult;

  // Attach replay keys (inline dual-run). This may throw with replay-drift code.
  try { contract.attachReplayKeys(pack, { ...args }); }
  catch (e) {
    process.stderr.write(`FAIL: replay attach failed: ${e.message}\n`);
    process.exit(contract.exitCodeFor(e.code));
  }

  // Evaluate pack contract (full gate check).
  const result = contract.evaluatePackContract({ pack, schema });

  // Verify raw inputs unchanged after collection.
  const postHashes = contract.computeRawInputHashes();
  const drift = [];
  for (const ref of Object.keys(preHashes)) {
    if (preHashes[ref] !== postHashes[ref]) drift.push({ source_ref: ref, before: preHashes[ref], after: postHashes[ref] });
  }
  if (drift.length > 0) {
    process.stderr.write(`FAIL: raw input mutation detected: ${JSON.stringify(drift)}\n`);
    process.exit(EXIT_CODES.PACK_RUNNER_FAILURE);
  }

  // Verify S02 baseline immutability post-collection.
  try {
    contract.verifyS02BaselineUnchanged(s02PreRawHash, s02PreCanonicalHash);
  } catch (e) {
    process.stderr.write(`FAIL: S02 baseline mutation detected: ${e.message}\n`);
    process.exit(contract.exitCodeFor(e.code));
  }

  // Build inventory + collect-protocol.
  const inventoryPayload = buildInventory(sourceEntries, sanitisedProjections, preHashes, pack.generated);
  const collectProtocol = contract.buildProtocolEvidence({
    pack,
    result,
    paths: {
      pack: args.packOut,
      inventory: args.inventoryOut,
      protocol: args.protocolOut,
      schema: args.schema,
    },
  });

  // Atomic write all outputs.
  try {
    atomicWriteJsonIfMissing(args.packOut, pack, { force: args.force });
    atomicWriteJsonIfMissing(args.inventoryOut, inventoryPayload, { force: args.force });
    atomicWriteJsonIfMissing(args.protocolOut, collectProtocol, { force: args.force });
  } catch (e) {
    process.stderr.write(`FAIL: atomic write failed: ${e.message}\n`);
    process.exit(contract.exitCodeFor(e.code));
  }

  // Stable bounded verdict line.
  const summary = {
    runner_status: result.runner_status,
    runner_exit_code: result.runner_exit_code,
    pack_id: pack.pack_id,
    pack_digest: pack.pack_digest,
    source_count: pack.sources.length,
    record_count: pack.records.length,
    role_matrix_size: pack.role_matrix.length,
    drill_matrix_size: pack.drill_matrix.length,
    s02_baseline_unchanged: pack.s02_baseline.unchanged,
    s02_baseline_hash: pack.s02_baseline.pre_canonical_hash,
    redaction_safe: contract.checkRedactionSafety(pack).length === 0,
    gates: result.gates,
    verdict: result.verdict,
    raw_input_immutability: {
      before_hash_count: Object.keys(preHashes).length,
      after_hash_count: Object.keys(postHashes).length,
      drift_count: drift.length,
    },
    blocker_codes: result.blockers.map((b) => b.code),
  };
  process.stdout.write(JSON.stringify(summary) + '\n');
  process.exit(result.runner_status);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  buildInventory,
  atomicWriteJson,
  atomicWriteJsonIfMissing,
  ROOT,
  SCRIPT_PATH,
};
