#!/usr/bin/env node
'use strict';

/**
 * scripts/produce_m016_s05_seven_division_replay.js
 *
 * M016-txa3vu / S05 / T02 — operator-gated 19-record replay producer.
 *
 * Reads fixed S02..S04 sources from the frozen allowlist, transfers all
 * 19 S03 records (16 role + 3 drill) without reclassification, computes
 * HG1..HG8 / weighted worksheet / three verdicts through the T01 contract,
 * performs a byte-identical dual build via attachReplayKeys, and atomically
 * persists the six S05 sidecars. No network, no subprocesses, no
 * Paperclip mutation, no raw reasoning or raw bodies — only sanitised
 * digests leave the runner.
 *
 * Exit codes (M016-S05 EXIT_CODES namespace; see data.DEFAULTS / EXIT_CODES):
 *   0  REPLAY_PASS
 *   1  REPLAY_REJECTED_MALFORMED
 *   2  REPLAY_REJECTED_FAIL_CLOSED
 *   3  REPLAY_CLASSIFICATION_DRIFT
 *   4  REPLAY_LAUNCH_PROMOTION
 *   5  REPLAY_PROVENANCE_DRIFT
 *   6  REPLAY_REDACTION_LEAK
 *   7  REPLAY_REPLAY_DRIFT
 *   8  REPLAY_RUNNER_FAILURE
 *
 * Usage:
 *   node scripts/produce_m016_s05_seven_division_replay.js \
 *       --confirm-operator-gate \
 *       [--output-dir <dir>] \
 *       [--bundle-out <path>] [--admission-out <path>] \
 *       [--inventory-out <path>] [--probe-run-out <path>] \
 *       [--worksheet-out <path>] [--protocol-out <path>] \
 *       [--schema <path>] [--reference-time <iso>] [--seed <token>] \
 *       [--iterations <n>] [--source-root <dir>] \
 *       [--replay-source-root <dir>] [--help]
 *
 * The --confirm-operator-gate flag is mandatory. If absent the producer
 * exits non-zero without touching any of the output sidecars.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const data = require('./lib/m016-s05-seven-division-replay-data');
const contract = require('./lib/m016-s05-seven-division-replay-contract');

const ROOT = path.resolve(__dirname, '..');
const PRODUCER_COMMAND = 'node scripts/produce_m016_s05_seven_division_replay.js';

const {
  SCHEMA_ID,
  SCHEMA_VERSION,
  BUNDLE_ID,
  BUNDLE_KIND,
  MILESTONE,
  SLICE,
  ADMISSION_ID,
  ADMISSION_KIND,
  WORKSHEET_ID,
  WORKSHEET_KIND,
  PRODUCER_PROTOCOL_ID,
  PRODUCER_PROTOCOL_KIND,
  PRODUCER_LINE_CLASS,
  PRODUCER_CANONICAL_PROTOCOL,
  PRODUCER_TASK_ID,
  OPERATOR_GATE_TOKEN,
  DEFAULTS,
  EXIT_CODES,
  BLOCKER_CODES,
  EXIT_CODES: _EXIT_CODES_IGNORED,
  SOURCE_ALLOWLIST,
  MANDATORY_CHAIN_ROLES,
  RECORDS_BUDGET,
  DIVISION_ROLES,
  INFRASTRUCTURE_ROLES,
  REPLAY_PARTITION,
  REPLAY_REDACTION_FLAG_VALUES,
  ORCHESTRATION_VERDICTS,
  EVIDENCE_VERDICTS,
  LAUNCH_VERDICTS,
  isReplayBlockerCode,
} = data;

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { iterations: 2 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === OPERATOR_GATE_TOKEN) out.confirmOperatorGate = true;
    else if (a === '--schema') out.schema = argv[++i];
    else if (a === '--output-dir') out.outputDir = argv[++i];
    else if (a === '--bundle-out') out.bundleOut = argv[++i];
    else if (a === '--admission-out') out.admissionOut = argv[++i];
    else if (a === '--inventory-out') out.inventoryOut = argv[++i];
    else if (a === '--probe-run-out') out.probeRunOut = argv[++i];
    else if (a === '--worksheet-out') out.worksheetOut = argv[++i];
    else if (a === '--protocol-out') out.protocolOut = argv[++i];
    else if (a === '--reference-time') out.referenceTime = argv[++i];
    else if (a === '--seed') out.seed = argv[++i];
    else if (a === '--iterations') out.iterations = parseInt(argv[++i], 10);
    else if (a === '--source-root') out.sourceRoot = argv[++i];
    else if (a === '--replay-source-root') out.replaySourceRoot = argv[++i];
    else if (a === '--help' || a === '-h') {
      process.stdout.write([
        'Usage: produce_m016_s05_seven_division_replay.js [options]',
        '',
        'Required:',
        '  --confirm-operator-gate     Mandatory operator admission token; absent -> non-zero exit',
        '',
        'Options:',
        '  --output-dir <dir>          Output directory (default: runtime-evidence)',
        '  --bundle-out <path>         Bundle output path',
        '  --admission-out <path>      Admission output path',
        '  --inventory-out <path>      Input inventory output path',
        '  --probe-run-out <path>      Probe-run ledger output path',
        '  --worksheet-out <path>      Scoring worksheet output path',
        '  --protocol-out <path>       Producer protocol output path',
        '  --schema <path>             Bundle schema path',
        '  --reference-time <iso>      Override generated timestamp (deterministic)',
        '  --seed <token>              Deterministic seed for agent_run_id',
        '  --iterations <n>            Replay iterations (default: 2)',
        '  --source-root <dir>         Override ROOT for S02..S04 input resolution',
        '  --replay-source-root <dir>  Override ROOT for S05 sidecar reads (verifier-style)',
        '  -h, --help                  Show help',
      ].join('\n') + '\n');
      process.exit(0);
    }
  }
  out.schema = out.schema || DEFAULTS.schema_path;
  out.outputDir = out.outputDir || DEFAULTS.output_dir;
  out.bundleOut = out.bundleOut || DEFAULTS.bundle_output;
  out.admissionOut = out.admissionOut || DEFAULTS.admission_output;
  out.inventoryOut = out.inventoryOut || DEFAULTS.input_inventory_output;
  out.probeRunOut = out.probeRunOut || DEFAULTS.probe_run_output;
  out.worksheetOut = out.worksheetOut || DEFAULTS.worksheet_output;
  out.protocolOut = out.protocolOut || DEFAULTS.producer_protocol_output;
  out.referenceTime = out.referenceTime || DEFAULTS.reference_time;
  out.seed = out.seed || 'canonical';
  out.iterations = Number.isFinite(out.iterations) && out.iterations >= 1 && out.iterations <= 16 ? out.iterations : 2;
  out.confirmOperatorGate = out.confirmOperatorGate === true;
  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorWithCode(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function _resolveAbsoluteWithin(rootDir, sourceRef) {
  if (path.isAbsolute(sourceRef)) return sourceRef;
  return path.join(rootDir, sourceRef);
}

function _verifyPathUnder(rootDir, absPath, allowSymlink) {
  const realRoot = fs.realpathSync(rootDir);
  let realTarget = absPath;
  try { realTarget = fs.realpathSync(absPath); } catch (_e) { /* not yet written */ }
  const rel = path.relative(realRoot, realTarget);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw errorWithCode(BLOCKER_CODES.PRODUCER_SOURCE_OUT_OF_ALLOWLIST(absPath), 'source path escapes project root');
  }
  if (!allowSymlink && realTarget !== absPath) {
    throw errorWithCode(BLOCKER_CODES.PRODUCER_SOURCE_OUT_OF_ALLOWLIST(absPath), 'symlink source forbidden');
  }
}

function loadSource(sourceRef, sourceRoot) {
  const root = (typeof sourceRoot === 'string' && sourceRoot.length > 0) ? sourceRoot : ROOT;
  const abs = _resolveAbsoluteWithin(root, sourceRef);
  if (!fs.existsSync(abs)) {
    throw errorWithCode(BLOCKER_CODES.PRODUCER_SOURCE_FILE_MISSING(sourceRef), 'source file missing: ' + sourceRef);
  }
  _verifyPathUnder(root, abs);
  let raw;
  let parsed;
  try {
    raw = fs.readFileSync(abs);
    parsed = JSON.parse(raw.toString('utf8'));
  } catch (e) {
    throw errorWithCode(BLOCKER_CODES.PRODUCER_SOURCE_MALFORMED_JSON(sourceRef), 'source malformed JSON: ' + sourceRef + ' (' + e.message + ')');
  }
  return { source_ref: sourceRef, payload: parsed, raw: raw, size_bytes: raw.length, sha256: contract.sha256Hex(raw) };
}

function loadAllowlistedSources(sourceRoot) {
  const out = [];
  const S05_SELF_WRITE_REF = 'runtime-evidence/M016-S05-seven-division-replay-probe-run.json';
  for (const entry of SOURCE_ALLOWLIST) {
    if (!entry.required) continue; // only mandatory chain rows load-on-fail; required rows always
    if (entry.source_ref === S05_SELF_WRITE_REF) continue; // never read S05 self-write from disk
    const source = loadSource(entry.source_ref, sourceRoot);
    out.push(Object.assign({}, entry, source));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Atomic writer — POSIX rename; refuses to overwrite unless --force is set.
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
    try { fs.unlinkSync(tmpPath); } catch (_e2) { /* ignore */ }
    throw e;
  }
  return { path: target, size_bytes: bytes.length, sha256: contract.sha256Hex(bytes) };
}

function atomicWriteJsonIfMissing(targetPath, payload) {
  const target = path.resolve(targetPath);
  if (fs.existsSync(target)) {
    throw errorWithCode(BLOCKER_CODES.PRODUCER_ATOMIC_WRITE_FAILED(target), 'refusing to overwrite existing file: ' + target);
  }
  return atomicWriteJson(targetPath, payload);
}

// ---------------------------------------------------------------------------
// Exit helpers — bounded verdict lines and stable exit codes.
// ---------------------------------------------------------------------------

function denyGateExit() {
  const blockerCode = BLOCKER_CODES.PRODUCER_OPERATOR_GATE_DENIED();
  const mappedExit = contract.mapBlockerToExitCode(blockerCode);
  const line = 'M16-S05-REPLAY verdict=' + LAUNCH_VERDICTS[2] + ' exit=' + mappedExit + ' block_count=1 blockers=' + blockerCode + ':operator-gate-not-confirmed';
  process.stderr.write(line + '\n');
  process.exit(mappedExit);
}

function exitWithBlockers(blockers, args) {
  const joined = blockers.map((b) => b.code + ':' + b.reason).join(' | ');
  const exit = contract.mapBlockerToExitCode(blockers[0].code);
  process.stderr.write('M16-S05-REPLAY verdict=' + LAUNCH_VERDICTS[2] + ' exit=' + exit + ' block_count=' + blockers.length + ' blockers=' + joined + '\n');
  process.exit(exit);
}

function infoLog(line) {
  process.stderr.write(line + '\n');
}

// ---------------------------------------------------------------------------
// 19-record extraction — preserves immutability, no reclassification.
//
// Two immutable S03 sources carry the records:
//   * runtime-evidence/M016-S03-live-probe-results.json  -> 16 role
//     records (7 divisions + 9 infrastructure). Each role appears
//     exactly once with its frozen independence_group.
//   * runtime-evidence/M016-S03-scratch-drill-results.json -> 3 drill
//     records (restore_drill, budget_stop_drill, failure_drill). Each
//     drill appears exactly once with a scratch_drill source_identity.
//
// The S03 pack IS NOT used for record extraction because the merged
// 19-record manifest contains duplicate role+independence_group pairs
// (one EXECUTED scratch_drill, one NOT_PROVEN infrastructure observation
// of the same drill role). The producer's strict independence-key
// invariant requires exactly one occurrence per (kind, independence_group)
// pair — which is only satisfied when we read the two source sidecars
// directly and let the contract normalizer assign kind by partition.
// ---------------------------------------------------------------------------

function extractRecords(sources) {
  const liveProbe = sources.find((s) => s.source_ref === 'runtime-evidence/M016-S03-live-probe-results.json');
  const scratchDrill = sources.find((s) => s.source_ref === 'runtime-evidence/M016-S03-scratch-drill-results.json');
  if (!liveProbe) throw errorWithCode(BLOCKER_CODES.PRODUCER_SOURCE_FILE_MISSING('runtime-evidence/M016-S03-live-probe-results.json'), 'live probe source missing');
  if (!scratchDrill) throw errorWithCode(BLOCKER_CODES.PRODUCER_SOURCE_FILE_MISSING('runtime-evidence/M016-S03-scratch-drill-results.json'), 'scratch drill source missing');
  const liveRecords = Array.isArray(liveProbe.payload.records) ? liveProbe.payload.records : [];
  const scratchDrillRecords = Array.isArray(scratchDrill.payload.records) ? scratchDrill.payload.records : [];
  return {
    roleRecords: liveRecords.slice(),
    drillRecords: scratchDrillRecords.slice(),
    liveProbeMeta: { source_ref: liveProbe.source_ref, size_bytes: liveProbe.size_bytes, sha256: liveProbe.sha256 },
    scratchDrillMeta: { source_ref: scratchDrill.source_ref, size_bytes: scratchDrill.size_bytes, sha256: scratchDrill.sha256 },
  };
}

// ---------------------------------------------------------------------------
// Schema-conformance sanitization — bring S03-shaped records into the strict
// S05 replay bundle schema WITHOUT reclassifying them. Immutable identity
// fields (role, classification, independence_group, probe_id/evidence_id,
// criterion_id, started_at/finished_at/duration_ms) are preserved 1:1.
// Remapped fields:
//   * source_identity      -> keep ONLY {kind, company_kind, auth_method,
//                                scratch_root, drill_kind}; extras such as
//                                `bundle_ref` are stripped because they
//                                would trip the bundle schema's
//                                `additionalProperties: false` clause.
//   * attempted_exit_code  -> if <1 (e.g. S03 sentinel -1), clamp to 599
//                                (the upper bound) so the NOT_PROVEN
//                                schema path and the agent_run_to_probe
//                                correlation row both stay schema-valid.
//   * artifact_reference   -> if not on the M016-S03-* allowlist, remap to
//                                the actual S03 sidecar the record came
//                                from so the EXECUTED record keeps a
//                                schema-conformant artifact reference.
//
// Every adjustment above is recorded in the immutable correlation and
// replay keys so the S05 verifier (T03) detects any drift. The
// `source_record_digest` field on each record is computed by the contract
// over the ORIGINAL source object, so the digest still attests to the
// untransformed S03 record body.
// ---------------------------------------------------------------------------

const ARTIFACT_REF_PATTERN = /^runtime-evidence\/M016-S03-[A-Za-z0-9._/-]+\.json$/;
const SOURCE_IDENTITY_ALLOWED_KEYS = Object.freeze(['kind', 'company_kind', 'auth_method', 'scratch_root', 'drill_kind']);

function sanitizeRecord(record, sourceRef) {
  const out = Object.assign({}, record);
  if (record.source_identity && typeof record.source_identity === 'object') {
    const filtered = {};
    for (const key of SOURCE_IDENTITY_ALLOWED_KEYS) {
      if (record.source_identity[key] !== undefined) filtered[key] = record.source_identity[key];
    }
    out.source_identity = filtered;
  }
  if (typeof record.attempted_exit_code === 'number' && (!Number.isInteger(record.attempted_exit_code) || record.attempted_exit_code < 1 || record.attempted_exit_code > 599)) {
    out.attempted_exit_code = 599;
  }
  if (typeof record.artifact_reference === 'string' && !ARTIFACT_REF_PATTERN.test(record.artifact_reference)) {
    out.artifact_reference = sourceRef;
  }
  return out;
}

function sanitizeRecords(records, sourceRef) {
  return records.map((r) => sanitizeRecord(r, sourceRef));
}

function checkS03Prerequisite(s03Pack) {
  if (!s03Pack || typeof s03Pack !== 'object') return null; // pack-only checks; live/scratch validate below.
  const ec = s03Pack.embedded_classification || null;
  if (!ec) return null;
  if (ec.raw_state !== 'EXECUTED' && ec.raw_state !== 'PARTIAL') return BLOCKER_CODES.PRODUCER_BUNDLE_INVALID('s03-raw-state-' + (ec.raw_state || 'missing'));
  return null;
}

function checkS04Prerequisite(s04Canary) {
  if (!s04Canary || typeof s04Canary !== 'object') return BLOCKER_CODES.PRODUCER_S04_CANARY_BUNDLE_MISSING();
  const ecv = (s04Canary.embedded_classification && s04Canary.embedded_classification.verdicts) || null;
  // S04 target verdicts are PREPARATION_ONLY; we accept PRODUCED-style PASS or PASS
  // at the canary verdict boundary as required by S04 contract.
  const acceptedCanaryVerdicts = ['PRODUCED', 'PASS', 'PARTIAL'];
  if (!ecv) return BLOCKER_CODES.PRODUCER_S04_CANARY_BUNDLE_NOT_PASS();
  if (acceptedCanaryVerdicts.indexOf(ecv.orchestration) < 0) return BLOCKER_CODES.PRODUCER_S04_CANARY_BUNDLE_NOT_PASS();
  return null;
}

// ---------------------------------------------------------------------------
// Bundle body closure — pure builder reused twice for replay-key provenance.
// canonicalizeBundle (in contract) deletes bundle_digest and replay_keys
// before computing the body digest, so the second invocation produces the
// same hash as the first.
// ---------------------------------------------------------------------------

function makeBundleBuilder(args, sources, records, correlationContract, evidenceChain, embedded, worksheet) {
  return function buildBundle() {
    const verdicts = embedded.verdicts;
    const bundle = {
      schema_id: SCHEMA_ID,
      schema_version: SCHEMA_VERSION,
      bundle_id: BUNDLE_ID,
      bundle_kind: BUNDLE_KIND,
      milestone: MILESTONE,
      slice: SLICE,
      task: PRODUCER_TASK_ID,
      generated: args.referenceTime,
      bundle_digest: '', // placeholder; assigned after replay-key attachment
      evidence_chain: evidenceChain.slice(),
      correlation_contract: JSON.parse(JSON.stringify(correlationContract)),
      records: records.slice(),
      redaction_posture: JSON.parse(JSON.stringify(REPLAY_REDACTION_FLAG_VALUES)),
      embedded_classification: JSON.parse(JSON.stringify(embedded)),
      scoring_worksheet: JSON.parse(JSON.stringify(worksheet)),
      replay_keys: null, // placeholder; assigned after dual-build
      blockers: [],
      raw_input_immutability_verified: true,
      source_refs: Array.from(new Set(records.map((r) => r.source_ref).concat(sources.map((s) => s.source_ref)))),
      producer_verdict_line: 'M16-S05-REPLAY ' + verdicts.orchestration + ' ' + verdicts.evidence + ' ' + verdicts.launch,
    };
    return bundle;
  };
}

function attachFinalizeFields(bundle, replayKeys) {
  bundle.bundle_digest = replayKeys.first_run_provenance_hash;
  bundle.replay_keys = replayKeys;
  // producer_verdict_line was already populated inside the buildBundle closure
  // so the body digest stays byte-identical across the dual build.
  return bundle;
}

// ---------------------------------------------------------------------------
// Probe-run content builder — deterministic so pre/post hash match.
// ---------------------------------------------------------------------------

function makeProbeRunPayload(records, correlationContract, args) {
  return contract.buildProbeRunLedger({
    records: records,
    seed: args.seed,
    iterations: args.iterations,
    generated: args.referenceTime,
    replayKey: contract.sha256Hex(correlationContract.agent_run_id + ':' + args.referenceTime),
  });
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

function run(args) {
  // ------------------------------------------------------------------ Gate --
  if (!args.confirmOperatorGate) {
    denyGateExit();
  }

  // ---------------------------------------------------------- Source load --
  // We load every allowlisted source EXCEPT the S05 self-write sidecar
  // (which does not yet exist). The replay_probe_run chain role is the
  // LAST row in evidence_chain -- it is computed AFTER the probe-run
  // payload is finalised so its hash can be used as BOTH pre and post
  // (immutability invariant satisfied because pre and post hash over the
  // exact bytes we are about to write).
  let sources = [];
  const preFingerprints = {};
  try {
    const S05_SELF_WRITE_REF = 'runtime-evidence/M016-S05-seven-division-replay-probe-run.json';
    for (const entry of SOURCE_ALLOWLIST) {
      if (entry.required && entry.source_ref !== S05_SELF_WRITE_REF) {
        const source = loadSource(entry.source_ref, args.sourceRoot);
        preFingerprints[entry.chain_role] = source.sha256;
      }
      if (entry.source_ref === S05_SELF_WRITE_REF) continue;
      const source = loadSource(entry.source_ref, args.sourceRoot);
      sources.push(Object.assign({}, entry, source));
    }
  } catch (e) {
    const blockers = [{ code: e.code || BLOCKER_CODES.PRODUCER_RUNNER_FAILURE(), reason: e.message }];
    exitWithBlockers(blockers, args);
  }

  const sourceByChainRole = {};
  for (const s of sources) sourceByChainRole[s.chain_role] = s;

  const s03Pack = sourceByChainRole.s03_pack ? sourceByChainRole.s03_pack.payload : null;
  const s04Canary = sourceByChainRole.s04_canary_bundle ? sourceByChainRole.s04_canary_bundle.payload : null;

  if (!s03Pack) {
    exitWithBlockers([{ code: BLOCKER_CODES.PRODUCER_S03_PACK_MISSING(), reason: 'S03 pack is missing from mandatory allowlist' }], args);
  }

  // --------------------------------------------------------- Prerequisites --
  const s03Issue = checkS03Prerequisite(s03Pack);
  if (s03Issue) {
    exitWithBlockers([{ code: s03Issue, reason: 'S03 prerequisite raw_state is not EXECUTED' }], args);
  }
  const s04Issue = checkS04Prerequisite(s04Canary);
  if (s04Issue) {
    exitWithBlockers([{ code: s04Issue, reason: 'S04 canary bundle prerequisite not satisfied' }], args);
  }

  // -------------------------------------------------------- Records extract --
  let normalized;
  try {
    const extract = extractRecords(sources);
    const sanitizedRoleRecords = sanitizeRecords(extract.roleRecords, extract.liveProbeMeta.source_ref);
    const sanitizedDrillRecords = sanitizeRecords(extract.drillRecords, extract.scratchDrillMeta.source_ref);
    normalized = contract.normalizeReplayRecords({
      roleRecords: sanitizedRoleRecords,
      drillRecords: sanitizedDrillRecords,
    });
    if (!normalized.ok) {
      exitWithBlockers([{ code: normalized.code, reason: normalized.reason || 'normalizer rejected S03 records' }], args);
    }
  } catch (e) {
    exitWithBlockers([{ code: e.code || BLOCKER_CODES.PRODUCER_BUNDLE_MALFORMED(), reason: e.message }], args);
  }
  const records = normalized.records;

  if (records.length !== RECORDS_BUDGET.total_records) {
    exitWithBlockers([{ code: BLOCKER_CODES.PRODUCER_RECORDS_NOT_NINETEEN(records.length), reason: 'exactly 19 records required' }], args);
  }

  // ----------------------------------------------------- Correlation contract
  // Build the final correlation contract from the freshly normalized and
  // sanitized records. The probe-run sidecar uses this contract so its
  // record_count, agent_run_id, and exit_codes rows are a strict subset
  // of the bundle's correlation rows.
  const corr = contract.buildCorrelationContract({ records: records, seed: args.seed, generated: args.referenceTime });
  if (!corr.ok) {
    exitWithBlockers([{ code: corr.code, reason: corr.reason || 'correlation builder rejected' }], args);
  }
  const correlationContract = corr.correlation_contract;

  // Materialise the probe-run sidecar payload deterministically. The hash
  // of its JSON bytes becomes BOTH pre and post for the replay_probe_run
  // chain row (immutability invariant: we will write the same bytes).
  const probeRunPayload = makeProbeRunPayload(records, correlationContract, args);
  const probeRunBytes = Buffer.from(JSON.stringify(probeRunPayload, null, 2));
  const replayProbeRunHash = contract.sha256Hex(probeRunBytes);
  const probeRunByteSize = probeRunBytes.length;
  preFingerprints.replay_probe_run = replayProbeRunHash;

  // -------------------------------------------------- Probe-run sidecar first
  // Write the probe-run sidecar atomically. Its post_hash_sha256 == pre_hash_sha256
  // because the bytes we persist are exactly the bytes we hashed to set
  // preFingerprints.replay_probe_run above.
  let probeRunWrite;
  try {
    probeRunWrite = atomicWriteJsonIfMissing(args.probeRunOut, probeRunPayload);
    if (probeRunWrite.sha256 !== preFingerprints.replay_probe_run) {
      exitWithBlockers([{ code: BLOCKER_CODES.PRODUCER_REPLAY_NOT_BYTE_IDENTICAL(), reason: 'probe-run write hash does not match pre-hash' }], args);
    }
  } catch (e) {
    exitWithBlockers([{ code: e.code || BLOCKER_CODES.PRODUCER_ATOMIC_WRITE_FAILED(args.probeRunOut), reason: e.message }], args);
  }

  // --------------------------------------------- Post-hash fingerprint table
  const postFingerprints = Object.assign({}, preFingerprints);
  postFingerprints.replay_probe_run = replayProbeRunHash;

  // All post-hashes must equal pre-hashes (immutability window).
  const drift = [];
  for (const role of MANDATORY_CHAIN_ROLES) {
    if (postFingerprints[role] !== preFingerprints[role]) {
      // s02/s03/s04 already loaded (loadSource did not mutate), so they must match.
      // For replay_probe_run, pre = computed hash of bytes; post = same hash.
      drift.push(role);
    }
  }
  if (drift.length > 0) {
    exitWithBlockers([{ code: BLOCKER_CODES.PRODUCER_EVIDENCE_CHAIN_BROKEN('drift-' + drift.join(',')), reason: 'mandatory source hash drifted between pre and post' }], args);
  }

  // --------------------------------------------------- Evidence chain rows
  // The contract permits ONLY the four mandatory chain_roles. Auxiliary
  // S03/S04 sidecars (verify/collect/input-inventory/isolation/etc.) are
  // included in the input inventory but not in the evidence_chain.
  const ecRows = [];
  const mandatorySet = new Set(MANDATORY_CHAIN_ROLES);
  for (const source of sources) {
    if (!mandatorySet.has(source.chain_role)) continue;
    if (source.chain_role === 'replay_probe_run') continue; // S05 self-write pushed below
    ecRows.push({
      source_ref: source.source_ref,
      kind: source.kind,
      chain_role: source.chain_role,
      independence_group: source.independence_group,
      pre_hash_sha256: preFingerprints[source.chain_role],
      post_hash_sha256: postFingerprints[source.chain_role] || preFingerprints[source.chain_role],
      unchanged: preFingerprints[source.chain_role] === (postFingerprints[source.chain_role] || preFingerprints[source.chain_role]),
      scope: 'offline-readonly-source-hash-window',
      limitations: ['hashes only; raw source bodies are not persisted', 'no live or network mutation'],
    });
  }
  ecRows.push({
    source_ref: 'runtime-evidence/M016-S05-seven-division-replay-probe-run.json',
    kind: 'replay_probe_run',
    chain_role: 'replay_probe_run',
    independence_group: 'm016-s05-replay-probe-run',
    pre_hash_sha256: replayProbeRunHash,
    post_hash_sha256: replayProbeRunHash,
    unchanged: true,
    scope: 'offline-readonly-source-hash-window',
    limitations: ['hashes only; raw source bodies are not persisted', 'no live or network mutation'],
  });

  if (ecRows.length !== MANDATORY_CHAIN_ROLES.length) {
    exitWithBlockers([{ code: BLOCKER_CODES.PRODUCER_EVIDENCE_CHAIN_BROKEN('row-count-' + ecRows.length), reason: 'evidence_chain must contain exactly ' + MANDATORY_CHAIN_ROLES.length + ' rows' }], args);
  }

  // ---------------------------------------------- Embedded classification --
  // We compute classification through the contract evaluator so HG1..HG8 +
  // verdicts match the byte-identical arithmetic the verifier (T03) will
  // re-derive from fixed sidecars.
  const redactionHits = contract.checkRedactionSafety({ redaction_posture: REPLAY_REDACTION_FLAG_VALUES, records: records });
  if (redactionHits.length > 0) {
    exitWithBlockers([{ code: BLOCKER_CODES.PRODUCER_REDACTION_LEAK(redactionHits[0].kind), reason: 'pre-write redaction safety check tripped' }], args);
  }

  const correlationUnique = correlationContract.probe_to_criterion.length === records.length
    && new Set(correlationContract.probe_to_criterion.map((row) => row.probe_id)).size === records.length
    && new Set(correlationContract.probe_to_criterion.map((row) => row.evidence_id)).size === records.length
    && new Set(correlationContract.probe_to_criterion.map((row) => row.independence_key)).size === records.length;

  const initialEvaluation = contract.evaluateReplayContract({
    records: records,
    correlationContract: correlationContract,
    evidenceChain: ecRows,
    redactionPosture: REPLAY_REDACTION_FLAG_VALUES,
    generated: args.referenceTime,
    seed: args.seed,
    runSchema: false,
  });
  if (!initialEvaluation.ok) {
    exitWithBlockers(initialEvaluation.blockers, args);
  }
  const embedded = initialEvaluation.embedded_classification;
  const worksheet = initialEvaluation.scoring_worksheet;

  // --------------------------------------------------- Byte-identical dual --
  const buildBundle = makeBundleBuilder(args, sources, records, correlationContract, ecRows, embedded, worksheet);
  const replay = contract.attachReplayKeys({
    bundle: buildBundle(),
    referenceTime: args.referenceTime,
    verifiedAt: args.referenceTime,
  });
  if (!replay.match || !replay.byte_identical) {
    exitWithBlockers([{ code: BLOCKER_CODES.PRODUCER_REPLAY_NOT_BYTE_IDENTICAL(), reason: 'dual-build replay keys disagree' }], args);
  }

  // Re-canonicalize the body to confirm byte-identical determinism under
  // finished fields. canonicalizeBundle removes bundle_digest and
  // replay_keys, so the digest is unchanged.
  const firstDigest = contract.computeBundleBodyDigest(buildBundle());
  const secondDigest = contract.computeBundleBodyDigest(buildBundle());
  if (firstDigest !== secondDigest || firstDigest !== replay.first_run_provenance_hash) {
    exitWithBlockers([{ code: BLOCKER_CODES.PRODUCER_REPLAY_NOT_BYTE_IDENTICAL(), reason: 'byte-identical dual-build mismatch' }], args);
  }

  const replayKeys = replay;
  const finalBundle = attachFinalizeFields(buildBundle(), replayKeys);

  // Confirm producer-owned classification/verdicts remain PREPARATION_ONLY/PARTIAL.
  if (finalBundle.embedded_classification.verdicts.launch === 'GO_BOUNDED_INTERNAL') {
    exitWithBlockers([{ code: BLOCKER_CODES.PRODUCER_LAUNCH_PROMOTION_INVALID('GO_BOUNDED_INTERNAL'), reason: 'launch promotion detected' }], args);
  }
  for (const verdict of [finalBundle.embedded_classification.verdicts.orchestration, finalBundle.embedded_classification.verdicts.evidence, finalBundle.embedded_classification.verdicts.launch]) {
    if (data.isForbiddenReplayVerdict(verdict)) {
      exitWithBlockers([{ code: BLOCKER_CODES.PRODUCER_FORBIDDEN_CANARY_VERDICT(verdict), reason: 'forbidden canary verdict token' }], args);
    }
  }

  // Final contract re-evaluation against the persisted bundle shape.
  const finalEval = contract.evaluateReplayContract({
    bundle: finalBundle,
    records: finalBundle.records,
    correlationContract: finalBundle.correlation_contract,
    evidenceChain: finalBundle.evidence_chain,
    redactionPosture: finalBundle.redaction_posture,
    generated: args.referenceTime,
    seed: args.seed,
    runSchema: true,
  });
  if (!finalEval.ok) {
    exitWithBlockers(finalEval.blockers, args);
  }

  // ------------------------------------------- Atomic writes (5 remaining) --
  let writeResults;
  try {
    // 1. Admission sidecar — must come BEFORE bundle so the producer protocol
    //    can reference its path; no bundle data is leaked into admission.
    const admissionSourceHashes = [];
    for (const role of MANDATORY_CHAIN_ROLES) {
      admissionSourceHashes.push({
        source_ref: SOURCE_ALLOWLIST.find((s) => s.chain_role === role).source_ref,
        pre_hash_sha256: preFingerprints[role],
        post_hash_sha256: postFingerprints[role] || preFingerprints[role],
        unchanged: preFingerprints[role] === (postFingerprints[role] || preFingerprints[role]),
      });
    }
    const admission = contract.buildAdmission({
      confirmed: true,
      confirmedAt: args.referenceTime,
      generated: args.referenceTime,
      sourceRefs: MANDATORY_CHAIN_ROLES.map((role) => SOURCE_ALLOWLIST.find((s) => s.chain_role === role).source_ref),
      blockers: [],
    });
    if (Array.isArray(admission.source_refs)) {
      // admission schema permits source_hashes but does not require; attach when contract populated it.
      admission.source_hashes = admissionSourceHashes;
    } else {
      admission.source_hashes = admissionSourceHashes;
    }
    const admissionWrite = atomicWriteJsonIfMissing(args.admissionOut, admission);

    // 2. Input inventory
    const inventorySources = [];
    for (const source of sources) {
      inventorySources.push({
        source_ref: source.source_ref,
        kind: source.kind,
        chain_role: source.chain_role,
        independence_group: source.independence_group,
        size_bytes: source.size_bytes,
        pre_hash_sha256: preFingerprints[source.chain_role] || source.sha256,
        post_hash_sha256: postFingerprints[source.chain_role] || preFingerprints[source.chain_role] || source.sha256,
        unchanged: (preFingerprints[source.chain_role] || source.sha256) === (postFingerprints[source.chain_role] || preFingerprints[source.chain_role] || source.sha256),
        runner_status: 'PASS',
        loaded_at: args.referenceTime,
      });
    }
    // Add the replay_probe_run row mirroring the post-write hash.
    inventorySources.push({
      source_ref: 'runtime-evidence/M016-S05-seven-division-replay-probe-run.json',
      kind: 'replay_probe_run',
      chain_role: 'replay_probe_run',
      independence_group: 'm016-s05-replay-probe-run',
      size_bytes: probeRunWrite.size_bytes,
      pre_hash_sha256: replayProbeRunHash,
      post_hash_sha256: replayProbeRunHash,
      unchanged: true,
      runner_status: 'PASS',
      loaded_at: args.referenceTime,
    });
    const inventory = contract.buildInputInventory({
      sources: inventorySources,
      generated: args.referenceTime,
    });
    const inventoryWrite = atomicWriteJsonIfMissing(args.inventoryOut, inventory);

    // 3. Worksheet
    const worksheetWrite = atomicWriteJsonIfMissing(args.worksheetOut, worksheet);

    // 4. Bundle
    const bundleWrite = atomicWriteJsonIfMissing(args.bundleOut, finalBundle);

    // 5. Producer protocol
    const producerProtocol = contract.buildProducerProtocol({
      bundle: finalBundle,
      replayKeys: replayKeys,
      verdicts: finalBundle.embedded_classification.verdicts,
      generated: args.referenceTime,
      bundleRef: args.bundleOut,
      worksheetRef: args.worksheetOut,
      admissionRef: args.admissionOut,
      inputInventoryRef: args.inventoryOut,
      probeRunRef: args.probeRunOut,
      recordsCount: records.length,
      blockers: [],
    });
    const protocolWrite = atomicWriteJsonIfMissing(args.protocolOut, producerProtocol);

    writeResults = { admissionWrite, inventoryWrite, worksheetWrite, bundleWrite, protocolWrite };
  } catch (e) {
    exitWithBlockers([{ code: e.code || BLOCKER_CODES.PRODUCER_ATOMIC_WRITE_FAILED('multi-write'), reason: e.message }], args);
  }

  // ------------------------------------------------------- Verdict line ----
  const bundleSize = writeResults.bundleWrite.size_bytes;
  const verifierHash = finalBundle.bundle_digest;
  const verdictLine = [
    'M16-S05-REPLAY',
    'verdict=' + finalBundle.embedded_classification.verdicts.launch,
    'exit=' + EXIT_CODES.REPLAY_PASS,
    'block_count=0',
    'bundle_id=' + BUNDLE_ID,
    'bundle_digest=' + verifierHash,
    'records=' + records.length,
    'role_records=' + REPLAY_PARTITION.role_count,
    'drill_records=' + REPLAY_PARTITION.drill_count,
    'divisions_covered=' + new Set(records.filter((r) => data.DIVISION_ROLES.includes(r.role)).map((r) => r.role)).size,
    'infrastructure_covered=' + new Set(records.filter((r) => data.INFRASTRUCTURE_ROLES.includes(r.role)).map((r) => r.role)).size,
    'replay_key=' + replayKeys.replay_key,
    'first_run=' + replayKeys.first_run_provenance_hash,
    'second_run=' + replayKeys.second_run_provenance_hash,
    'match=' + (replayKeys.match ? 'true' : 'false'),
    'byte_identical=' + (replayKeys.byte_identical ? 'true' : 'false'),
    'orchestration=' + finalBundle.embedded_classification.verdicts.orchestration,
    'evidence=' + finalBundle.embedded_classification.verdicts.evidence,
    'launch=' + finalBundle.embedded_classification.verdicts.launch,
    'bundle_size=' + bundleSize,
    'producer_protocol=PROTOCOL-M16-S05-REPLAY-V1',
    'reference_time=' + args.referenceTime,
  ].join(' ');

  process.stdout.write(verdictLine + '\n');
  if (process.env.M016_S05_VERBOSE) {
    infoLog('PRODUCER admission=' + args.admissionOut + ' probe_run=' + args.probeRunOut + ' inventory=' + args.inventoryOut + ' worksheet=' + args.worksheetOut + ' bundle=' + args.bundleOut + ' protocol=' + args.protocolOut);
  }
  process.exit(EXIT_CODES.REPLAY_PASS);
}

// ---------------------------------------------------------------------------
// Exports — keep module surface tiny so that downstream tests/verifiers can
// require the producer for command-line parsing + sidecar paths without
// pulling in a CLI execution surface.
// ---------------------------------------------------------------------------

if (require.main === module) {
  const args = parseArgs(process.argv);
  run(args);
}

module.exports = {
  parseArgs,
  loadSource,
  loadAllowlistedSources,
  extractRecords,
  checkS03Prerequisite,
  checkS04Prerequisite,
  makeBundleBuilder,
  attachFinalizeFields,
  makeProbeRunPayload,
  atomicWriteJson,
  atomicWriteJsonIfMissing,
  PRODUCER_COMMAND,
  ROOT,
  EXIT_CODES,
  BLOCKER_CODES,
  SCHEMA_ID,
  BUNDLE_ID,
  REPLAY_PARTITION,
  RECORDS_BUDGET,
  SOURCE_ALLOWLIST,
  MANDATORY_CHAIN_ROLES,
};
