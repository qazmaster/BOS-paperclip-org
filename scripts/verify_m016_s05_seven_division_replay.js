#!/usr/bin/env node
'use strict';

/**
 * scripts/verify_m016_s05_seven_division_replay.js
 *
 * M016-txa3vu / S05 / T03 — independent verifier of the canonical S05
 * seven-division evidence replay bundle.
 *
 * Imports only `scripts/lib/m016-s05-seven-division-replay-data.js` and
 * `scripts/lib/m016-s05-seven-division-replay-contract.js`. Producer CLI
 * (`scripts/produce_m016_s05_seven_division_replay.js`) is NEVER
 * require()d in this module — T05 enforces that invariant via static
 * analysis.
 *
 * Pipeline (each step independently verifies against persisted sidecars +
 * fixed allowlisted upstream sources; none trust embedded hashes / score /
 * verdict / blockers / admission):
 *
 *   1.  Realpath containment of every loaded path under ROOT
 *   2.  Load bundle / admission / worksheet / producer-protocol / probe-run
 *       sidecars (input-inventory is informational only)
 *   3.  AJV-strict schema validation of all four S05 producer sidecars
 *       (admission, bundle, worksheet, producer-protocol)
 *   4.  Admission operator-gate posture: `confirmed === true`,
 *       `confirmed_at` non-null, `blockers: []`
 *   5.  Pre/post hash equality on every evidence_chain row against
 *       freshly-computed sha256 of the source file as it lives on disk
 *       right now (no `../`, no symlink escape, all chain_role in
 *       MANDATORY_CHAIN_ROLES)
 *   6.  19-record coverage (16 role + 3 drill), Div1..Div7 covered,
 *       9-infrastructure roles covered, (kind, independence_group) unique
 *   7.  Re-derive correlation / classification / worksheet via the T01
 *       contract; byte-stable compare against the bundle's claims (one
 *       mismatch → VALIDATOR_GATE_DERIVATION_DRIFT-<field>)
 *   8.  Re-derive replay keys via T01 `attachReplayKeys`; compare first /
 *       second / replay_key against bundle.replay_keys
 *       (`VALIDATOR_REPLAY_DRIFT`)
 *   9.  Run N iterations of `computeBundleBodyDigest(bundle)`; all N digests
 *       identical (else `VALIDATOR_BUNDLE_NOT_BYTE_IDENTICAL`)
 *  10.  Re-canonicalize-bundle body digest; compare with bundle.bundle_digest
 *  11.  Forbidden verdict guard over orchestration / evidence / launch values
 *  12.  Re-derive launch promotion guard: any non-PREPARATION_ONLY/PARTIAL
 *       combination impossible without all HG1..HG8 = pass (mirrors
 *       contract.buildEmbeddedClassification's promotion invariant)
 *  13.  Build verify-protocol via `contract.buildVerifyProtocol`; AJV-validate
 *       against the verify-protocol schema; assertBundleWriteSafe passes
 *  14.  Atomic temp+rename write of only the verify-protocol sidecar —
 *       refuses overwrite (mirrors producer immutability semantics for
 *       downstream T04 integration test runs)
 *
 * On any blocker (steps 3..13), the verify-protocol sidecar is NOT written
 * (the schema requires `blockers: maxItems: 0`, so a drift would never
 * satisfy the v1 schema). The runner exits non-zero via
 * `contract.mapBlockerToExitCode(blockers[0].code)` and emits a bounded
 * failure line on stderr.
 *
 * Exit codes mirror producer (data.EXIT_CODES):
 *   0  REPLAY_PASS                — schema-valid protocol persisted
 *   1  REPLAY_REJECTED_MALFORMED   — schema violation
 *   3  REPLAY_CLASSIFICATION_DRIFT — coverage/partition mismatch
 *   4  REPLAY_LAUNCH_PROMOTION    — forbidden verdict detected
 *   5  REPLAY_PROVENANCE_DRIFT    — source hash / correlation / chain drift
 *   6  REPLAY_REDACTION_LEAK      — forbidden payload token in sidecar
 *   7  REPLAY_REPLAY_DRIFT        — replay_keys disagree across iterations
 *   8  REPLAY_RUNNER_FAILURE      — runner-side fault (missing source, IO)
 *
 * Usage:
 *   node scripts/verify_m016_s05_seven_division_replay.js [options]
 *     --iterations <n>             Replay iterations (default: 3, bounded 3..16)
 *     --output-dir <dir>           Output directory (default: runtime-evidence)
 *     --protocol-out <path>        Verify-protocol output path
 *     --bundle-path <path>         Bundle input path
 *     --admission-path <path>      Admission input path
 *     --worksheet-path <path>      Worksheet input path
 *     --producer-protocol-path <p> Producer protocol input path
 *     --input-inventory-path <p>   Optional input inventory (informational)
 *     --probe-run-path <path>      Optional probe-run sidecar
 *     --source-root <dir>          Override ROOT for source resolution
 *     --reference-time <iso>       Override generated timestamp (deterministic)
 *     --seed <token>               Deterministic seed for agent_run_id
 *     -h, --help                   Show help
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// ---------------------------------------------------------------------------
// Restricted imports. Producer CLI is forbidden — T05 greps this file to
// verify that no `require('.../produce_...')` line exists below.
// ---------------------------------------------------------------------------

const data = require('./lib/m016-s05-seven-division-replay-data');
const contract = require('./lib/m016-s05-seven-division-replay-contract');

// Defensive runtime guard: refuse to load in a process that already has the
// producer CLI in its module cache (verifier must be a fresh Node process
// — T04 integration test enforces this boundary via child_process).
const PRODUCER_CLI_PATH = require.resolve('./produce_m016_s05_seven_division_replay.js');
if (require.cache[PRODUCER_CLI_PATH]) {
  process.stderr.write('M16-S05-VERIFY producer CLI is loaded in this process — refusing to run verifier in same address space\n');
  process.exit(8);
}

const ROOT = path.resolve(__dirname, '..');
const VERIFIER_COMMAND = 'node scripts/verify_m016_s05_seven_division_replay.js';

const {
  SCHEMA_ID,
  SCHEMA_VERSION,
  BUNDLE_ID,
  BUNDLE_KIND,
  MILESTONE,
  SLICE,
  VERIFY_PROTOCOL_ID,
  VERIFY_PROTOCOL_KIND,
  VERIFIER_TASK_ID,
  VERIFIER_LINE_CLASS,
  VERIFIER_CANONICAL_PROTOCOL,
  DEFAULTS,
  EXIT_CODES,
  BLOCKER_CODES,
  SOURCE_ALLOWLIST,
  SOURCE_ALLOWLIST_SET,
  MANDATORY_CHAIN_ROLES,
  RECORDS_BUDGET,
  DIVISION_ROLES,
  INFRASTRUCTURE_ROLES,
  REPLAY_PARTITION,
  REPLAY_REDACTION_FLAG_VALUES,
  LAUNCH_VERDICTS,
  isVerifierBlockerCode,
  isForbiddenReplayVerdict,
  HARD_GATE_IDS_SET,
  CORRELATION_AGENT_RUN_ID_PATTERN,
} = data;

// ---------------------------------------------------------------------------
// CLI parsing — minimal surface; unknown flags are silently ignored so T05
// marker-root fixture overrides can pass extra paths safely.
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--iterations') {
      out.iterations = parseInt(argv[++i], 10);
    } else if (a === '--output-dir') {
      out.outputDir = argv[++i];
    } else if (a === '--protocol-out') {
      out.protocolOut = argv[++i];
    } else if (a === '--bundle-path') {
      out.bundlePath = argv[++i];
    } else if (a === '--admission-path') {
      out.admissionPath = argv[++i];
    } else if (a === '--worksheet-path') {
      out.worksheetPath = argv[++i];
    } else if (a === '--producer-protocol-path') {
      out.producerProtocolPath = argv[++i];
    } else if (a === '--input-inventory-path') {
      out.inputInventoryPath = argv[++i];
    } else if (a === '--probe-run-path') {
      out.probeRunPath = argv[++i];
    } else if (a === '--source-root') {
      out.sourceRoot = argv[++i];
    } else if (a === '--reference-time') {
      out.referenceTime = argv[++i];
    } else if (a === '--seed') {
      out.seed = argv[++i];
    } else if (a === '--help' || a === '-h') {
      process.stdout.write([
        'Usage: verify_m016_s05_seven_division_replay.js [options]',
        '',
        'Required: none — runs in canonical mode by default.',
        '',
        'Options:',
        '  --iterations <n>             Replay iterations (default: 3, bounded 3..16)',
        '  --output-dir <dir>           Output directory (default: runtime-evidence)',
        '  --protocol-out <path>        Verify-protocol output path',
        '  --bundle-path <path>         Bundle input path (default: runtime-evidence/M016-S05-seven-division-replay-bundle.json)',
        '  --admission-path <path>      Admission input path',
        '  --worksheet-path <path>      Worksheet input path',
        '  --producer-protocol-path <p> Producer-protocol input path',
        '  --input-inventory-path <p>   Optional input-inventory sidecar (informational)',
        '  --probe-run-path <path>      Optional probe-run sidecar',
        '  --source-root <dir>          Override ROOT for source resolution (T05 fixture overrides)',
        '  --reference-time <iso>       Override generated timestamp (deterministic)',
        '  --seed <token>               Deterministic seed for agent_run_id (default: canonical)',
        '  -h, --help                   Show help',
        '',
        'Exit codes (mirrors producer; see data.EXIT_CODES):',
        '  0  PASS              4  LAUNCH_PROMOTION     8  RUNNER_FAILURE',
        '  1  REJECTED_MALFORMED 5  PROVENANCE_DRIFT',
        '  3  CLASSIFICATION_DRIFT 6 REDACTION_LEAK    7  REPLAY_DRIFT',
      ].join('\n') + '\n');
      process.exit(0);
    }
  }
  out.sourceRoot = (typeof out.sourceRoot === 'string' && out.sourceRoot.length > 0) ? out.sourceRoot : ROOT;
  out.iterations = Number.isInteger(out.iterations) && out.iterations >= 3 && out.iterations <= 16
    ? out.iterations
    : DEFAULTS.verify_iterations;
  out.referenceTime = out.referenceTime || DEFAULTS.reference_time;
  out.seed = out.seed || 'canonical';
  out.outputDir = out.outputDir || DEFAULTS.output_dir;
  out.bundlePath = out.bundlePath || DEFAULTS.bundle_output;
  out.admissionPath = out.admissionPath || DEFAULTS.admission_output;
  out.worksheetPath = out.worksheetPath || DEFAULTS.worksheet_output;
  out.producerProtocolPath = out.producerProtocolPath || DEFAULTS.producer_protocol_output;
  out.inputInventoryPath = out.inputInventoryPath || DEFAULTS.input_inventory_output;
  out.probeRunPath = out.probeRunPath || DEFAULTS.probe_run_output;
  out.protocolOut = out.protocolOut || DEFAULTS.verify_protocol_output;
  out.confirmOperatorGate = true; // verifier doesn't gate on operator (operator admission is upstream in the admission sidecar)
  return out;
}

// ---------------------------------------------------------------------------
// Helpers — pure, no I/O except the explicit file readers below.
// ---------------------------------------------------------------------------

function errorWithCode(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function _resolveAbsoluteWithin(rootDir, sourceRef) {
  if (!sourceRef) return null;
  if (path.isAbsolute(sourceRef)) return sourceRef;
  return path.join(rootDir, sourceRef);
}

function _verifyPathUnder(rootDir, absPath) {
  const realRoot = fs.realpathSync(rootDir);
  let realTarget = absPath;
  try { realTarget = fs.realpathSync(absPath); } catch (_e) { /* accept file-not-yet-existing */ }
  const rel = path.relative(realRoot, realTarget);
  if (rel.startsWith('..') || path.isAbsolute(rel) || rel.split(path.sep).includes('..')) {
    throw errorWithCode(BLOCKER_CODES.VALIDATOR_PATH_TRAVERSAL(absPath), 'path escapes project root: ' + absPath);
  }
  return realTarget;
}

function loadSource(sourceRef, sourceRoot) {
  if (!sourceRef || typeof sourceRef !== 'string') {
    throw errorWithCode(BLOCKER_CODES.VALIDATOR_BUNDLE_NOT_FOUND(String(sourceRef)), 'missing source_ref');
  }
  const root = (typeof sourceRoot === 'string' && sourceRoot.length > 0) ? sourceRoot : ROOT;
  const abs = _resolveAbsoluteWithin(root, sourceRef);
  if (!fs.existsSync(abs)) {
    throw errorWithCode(BLOCKER_CODES.VALIDATOR_BUNDLE_NOT_FOUND(sourceRef), 'source file missing: ' + sourceRef);
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
  return { source_ref: sourceRef, payload: parsed, raw, size_bytes: raw.length, sha256: contract.sha256Hex(raw) };
}

function loadJson(sourceRef, sourceRoot) {
  const result = loadSource(sourceRef, sourceRoot);
  return result.payload;
}

// Atomic JSON write (POSIX temp+rename), refuses to overwrite by default.
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
    throw errorWithCode(BLOCKER_CODES.PRODUCER_ATOMIC_WRITE_FAILED(target), 'refusing to overwrite existing verify-protocol: ' + target);
  }
  return atomicWriteJson(targetPath, payload);
}

// ---------------------------------------------------------------------------
// JSON tree equality (deep). Used for byte-stable comparison between
// bundle.embedded_classification / bundle.scoring_worksheet / etc. and the
// re-derivation from the contract.
// ---------------------------------------------------------------------------

function _stableStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(_stableStringify).join(',') + ']';
  if (typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + _stableStringify(value[key])).join(',') + '}';
  }
  return JSON.stringify(String(value));
}

function deepEqual(a, b) {
  return _stableStringify(a) === _stableStringify(b);
}

// ---------------------------------------------------------------------------
// AJV-style schema validation helpers. Reuses contract.loadSchema +
// contract.validateBundleShape so verifier and producer share one compile
// path. Schemas are read once and cached by contract.
// ---------------------------------------------------------------------------

const _schemaInstanceCache = new Map();
function _getSchemaValidator(schemaPath) {
  if (_schemaInstanceCache.has(schemaPath)) return _schemaInstanceCache.get(schemaPath);
  const loaded = contract.loadSchema(schemaPath);
  if (!loaded.validate) {
    throw errorWithCode(BLOCKER_CODES.VALIDATOR_REDACTION_BOUNDS_UNLOADED(), 'AJV not available — schema validate cannot run for ' + schemaPath);
  }
  _schemaInstanceCache.set(schemaPath, loaded);
  return loaded;
}

function validateAgainstSchema(sourceRef, sourceRoot, schemaPath) {
  const payload = loadJson(sourceRef, sourceRoot);
  const loaded = _getSchemaValidator(schemaPath);
  const shape = contract.validateBundleShape(payload, loaded.validate);
  if (!shape.ok) {
    const error0 = (shape.errors && shape.errors[0]) || {};
    const fieldPath = error0.instancePath || error0.dataPath || 'object';
    throw errorWithCode(BLOCKER_CODES.VALIDATOR_SCHEMA_VIOLATION(sourceRef + ':' + fieldPath), 'JSON-Schema rejected ' + sourceRef + ' at ' + fieldPath + ': ' + (error0.message || 'unknown'));
  }
  return payload;
}

// ---------------------------------------------------------------------------
// Verdict lines (bounded)
// ---------------------------------------------------------------------------

function printVerdictLine(payload) {
  process.stdout.write([
    'M16-S05-VERIFY',
    'verdict=' + payload.verdict,
    'exit=' + payload.exit,
    'block_count=' + payload.block_count,
    'records=' + payload.records,
    'role_records=' + payload.role_records,
    'drill_records=' + payload.drill_records,
    'divisions_covered=' + payload.divisions_covered,
    'infrastructure_covered=' + payload.infrastructure_covered,
    'replay_key=' + payload.replay_key,
    'first_run=' + payload.first_run,
    'second_run=' + payload.second_run,
    'match=true',
    'byte_identical=true',
    'iterations=' + payload.iterations,
    'orchestration=' + payload.orchestration,
    'evidence=' + payload.evidence,
    'launch=' + payload.launch,
    'producer_cli_imported=false',
    'network_calls=0',
    'mutation_count=0',
    'verify_protocol=' + VERIFIER_CANONICAL_PROTOCOL,
    'reference_time=' + payload.reference_time,
  ].join(' ') + '\n');
}

function printFailureLine(blockers, exitCode) {
  const joined = blockers.map((b) => b.code + ':' + b.reason).join(' | ');
  process.stderr.write([
    'M16-S05-VERIFY',
    'verdict=' + LAUNCH_VERDICTS[2],
    'exit=' + exitCode,
    'block_count=' + blockers.length,
    'blockers=' + joined,
  ].join(' ') + '\n');
}

// ---------------------------------------------------------------------------
// Helper: chain-role-aware source hash drift code (so each chain role has
// a stable blocker code, not a generic one).
// ---------------------------------------------------------------------------

function _chainRoleHashDriftCode(chainRole, expected, actual) {
  switch (chainRole) {
    case 's02_baseline':
      return BLOCKER_CODES.VALIDATOR_S02_HASH_DRIFT(expected, actual);
    case 's03_pack':
      return BLOCKER_CODES.VALIDATOR_S03_HASH_DRIFT(expected, actual);
    case 's04_canary_bundle':
      return BLOCKER_CODES.VALIDATOR_S04_CANARY_HASH_DRIFT(expected, actual);
    case 'replay_probe_run':
      return BLOCKER_CODES.VALIDATOR_REPLAY_PROBE_RUN_DRIFT(expected, actual);
    default:
      return BLOCKER_CODES.VALIDATOR_EVIDENCE_CHAIN_BROKEN(chainRole || 'unknown');
  }
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

function run(args) {
  const blockers = [];
  function push(code, reason) {
    if (!isVerifierBlockerCode(code) && !/^M16-S05-REPLAY-/.test(code)) {
      // Unexpected non-blocker code; remap to RUNNER_FAILURE for safety.
      code = BLOCKER_CODES.VALIDATOR_RUNNER_FAILURE();
    }
    if (!blockers.some((b) => b.code === code)) blockers.push({ code, reason });
  }

  const bundleSchemaPath = DEFAULTS.schema_path;
  const admissionSchemaPath = DEFAULTS.admission_schema_path;
  const worksheetSchemaPath = DEFAULTS.worksheet_schema_path;
  const producerProtocolSchemaPath = DEFAULTS.producer_protocol_schema_path;
  const verifyProtocolSchemaPath = DEFAULTS.verify_protocol_schema_path;

  // ------------------------------------------------------------------ 1-4 --

  let bundle, admission, worksheet, producerProtocol;
  try {
    bundle = validateAgainstSchema(args.bundlePath, args.sourceRoot, bundleSchemaPath);
    admission = validateAgainstSchema(args.admissionPath, args.sourceRoot, admissionSchemaPath);
    worksheet = validateAgainstSchema(args.worksheetPath, args.sourceRoot, worksheetSchemaPath);
    producerProtocol = validateAgainstSchema(args.producerProtocolPath, args.sourceRoot, producerProtocolSchemaPath);
  } catch (e) {
    push(e.code || BLOCKER_CODES.VALIDATOR_RUNNER_FAILURE(), e.message);
    return reject(blockers, args);
  }

  // Defense-in-depth: producer CLI must not have been imported in the same
  // process. The earlier require.cache guard handles the normal case; this
  // block makes the audit trail explicit when a future refactor introduces
  // a subtle re-import path.
  if (require.cache[PRODUCER_CLI_PATH]) {
    push(BLOCKER_CODES.VALIDATOR_INDEPENDENCE_VIOLATION(), 'producer CLI module loaded into process after verifier start');
    return reject(blockers, args);
  }

  // Admission operator gate posture (sanitised fail-closed)
  if (!admission.operator_gate || admission.operator_gate.confirmed !== true) {
    push(BLOCKER_CODES.VALIDATOR_REDACTION_BOUNDS_UNLOADED(), 'operator gate is not confirmed');
  }
  if (!admission.operator_gate || !admission.operator_gate.confirmed_at) {
    push(BLOCKER_CODES.VALIDATOR_RUNNER_FAILURE(), 'operator gate confirmed_at is missing');
  }
  if (Array.isArray(admission.blockers) && admission.blockers.length > 0) {
    push(BLOCKER_CODES.VALIDATOR_RUNNER_FAILURE(), 'admission sidecar carries non-empty blockers');
  }
  if (admission.sanitised !== true || admission.raw_bodies_persisted !== false) {
    push(BLOCKER_CODES.VALIDATOR_REDACTION_BOUNDS_UNLOADED(), 'admission sanitised posture is unsafe');
  }

  // ------------------------------------------------------------ 5. chain ---

  // Read each evidence_chain row's source file from disk and compare
  // sha256 to the row's claimed pre/post hashes. We never trust the
  // bundle's claimed hashes — every one is independently recomputed.
  for (const row of bundle.evidence_chain) {
    let actual;
    try {
      actual = loadSource(row.source_ref, args.sourceRoot);
    } catch (e) {
      push(e.code || BLOCKER_CODES.VALIDATOR_BUNDLE_NOT_FOUND(row.source_ref), 'evidence chain load failed: ' + e.message);
      continue;
    }
    if (!SOURCE_ALLOWLIST_SET.has(row.source_ref)) {
      push(BLOCKER_CODES.VALIDATOR_EVIDENCE_CHAIN_BROKEN(row.chain_role || 'unknown'), 'source_ref is outside frozen allowlist: ' + row.source_ref);
    }
    if (MANDATORY_CHAIN_ROLES.indexOf(row.chain_role) < 0) {
      push(BLOCKER_CODES.VALIDATOR_EVIDENCE_CHAIN_BROKEN(row.chain_role || 'unknown'), 'chain_role is not in MANDATORY_CHAIN_ROLES');
    }
    if (!/^(?:s02_baseline|s03_pack|s04_canary_bundle|replay_probe_run)$/.test(row.chain_role || '')) {
      push(BLOCKER_CODES.VALIDATOR_EVIDENCE_CHAIN_BROKEN(row.chain_role || 'unknown'), 'chain_role not in frozen set');
    }
    if (actual.sha256 !== row.pre_hash_sha256) {
      push(_chainRoleHashDriftCode(row.chain_role, row.pre_hash_sha256, actual.sha256), row.chain_role + ' pre_hash_sha256 disagrees with current source: ' + row.source_ref);
    }
    if (actual.sha256 !== row.post_hash_sha256) {
      push(_chainRoleHashDriftCode(row.chain_role, row.post_hash_sha256, actual.sha256), row.chain_role + ' post_hash_sha256 disagrees with current source: ' + row.source_ref);
    }
    const derivedUnchanged = row.pre_hash_sha256 === row.post_hash_sha256;
    if (row.unchanged !== derivedUnchanged) {
      push(BLOCKER_CODES.VALIDATOR_EVIDENCE_CHAIN_BROKEN(row.chain_role), 'unchanged boolean does not equal (pre === post)');
    }
  }
  if (bundle.evidence_chain.length !== MANDATORY_CHAIN_ROLES.length) {
    push(BLOCKER_CODES.VALIDATOR_EVIDENCE_CHAIN_BROKEN('row-count'), 'evidence_chain must contain exactly ' + MANDATORY_CHAIN_ROLES.length + ' rows');
  }

  // Verify also admission.source_hashes if present (cross-check vs
  // bundle.evidence_chain rows). Producer populates it; verifier trusts
  // admission.source_hashes only after the freshly-recomputed sha256 of
  // the source file agrees with what's claimed.
  if (Array.isArray(admission.source_hashes)) {
    for (const sha of admission.source_hashes) {
      let actual;
      try {
        actual = loadSource(sha.source_ref, args.sourceRoot);
      } catch (e) {
        push(e.code || BLOCKER_CODES.VALIDATOR_BUNDLE_NOT_FOUND(sha.source_ref), 'admission source_hash load failed: ' + e.message);
        continue;
      }
      if (actual.sha256 !== sha.pre_hash_sha256) {
        push(BLOCKER_CODES.VALIDATOR_EVIDENCE_CHAIN_BROKEN('admission:' + sha.source_ref), 'admission pre_hash_sha256 disagrees with current source');
      }
      if (actual.sha256 !== sha.post_hash_sha256) {
        push(BLOCKER_CODES.VALIDATOR_EVIDENCE_CHAIN_BROKEN('admission:' + sha.source_ref), 'admission post_hash_sha256 disagrees with current source');
      }
      const derivedUnchanged = sha.pre_hash_sha256 === sha.post_hash_sha256;
      if (sha.unchanged !== derivedUnchanged) {
        push(BLOCKER_CODES.VALIDATOR_EVIDENCE_CHAIN_BROKEN('admission:' + sha.source_ref), 'admission.unchanged does not equal (pre === post)');
      }
    }
  }

  // --------------------------------------------------------- 6. coverage ---

  const records = bundle.records;
  if (!Array.isArray(records) || records.length !== RECORDS_BUDGET.total_records) {
    push(BLOCKER_CODES.VALIDATOR_COVERAGE_NOT_NINETEEN(records.length), 'records count must be exactly 19');
  }

  const roleRecords = records.filter((r) => r && r.kind === 'live_replay_record');
  const drillRecords = records.filter((r) => r && r.kind === 'drill_replay_record');
  if (roleRecords.length !== RECORDS_BUDGET.role_records) {
    push(BLOCKER_CODES.VALIDATOR_COVERAGE_NOT_NINETEEN('role-' + roleRecords.length), 'role partition must contain exactly 16 records');
  }
  if (drillRecords.length !== RECORDS_BUDGET.drill_records) {
    push(BLOCKER_CODES.VALIDATOR_COVERAGE_NOT_NINETEEN('drill-' + drillRecords.length), 'drill partition must contain exactly 3 records');
  }

  const divisionSet = new Set();
  const infraSet = new Set();
  const roleSeenByKind = { live_replay_record: new Set(), drill_replay_record: new Set() };
  const indepSeen = new Set();
  for (const record of records) {
    if (!record || typeof record !== 'object') {
      push(BLOCKER_CODES.VALIDATOR_COVERAGE_NOT_NINETEEN('record-not-object'), 'record is not an object');
      continue;
    }
    if (DIVISION_ROLES.indexOf(record.role) >= 0) divisionSet.add(record.role);
    if (INFRASTRUCTURE_ROLES.indexOf(record.role) >= 0) infraSet.add(record.role);
    const kindRoles = roleSeenByKind[record.kind];
    if (kindRoles) {
      if (kindRoles.has(record.role)) {
        push(BLOCKER_CODES.VALIDATOR_CORRELATION_DUPLICATE('role:' + (record.kind || 'unknown'), record.role), 'role matrix duplicate within partition: ' + (record.kind || 'unknown') + ':' + record.role);
      }
      kindRoles.add(record.role);
    } else {
      push(BLOCKER_CODES.VALIDATOR_CORRELATION_DUPLICATE('role:unknown', String(record.role)), 'unknown kind partition for role: ' + record.role);
    }
    const indepKey = (record.kind || 'unknown') + ':' + (record.independence_group || 'unknown');
    if (indepSeen.has(indepKey)) {
      push(BLOCKER_CODES.VALIDATOR_INDEPENDENCE_VIOLATION(), '(kind, independence_group) duplicate: ' + indepKey);
    }
    indepSeen.add(indepKey);
  }
  for (const division of DIVISION_ROLES) {
    if (!divisionSet.has(division)) {
      push(BLOCKER_CODES.VALIDATOR_DIVISION_MISSING(division), 'division coverage missing: ' + division);
    }
  }
  if (infraSet.size !== INFRASTRUCTURE_ROLES.length) {
    for (const role of INFRASTRUCTURE_ROLES) {
      if (!infraSet.has(role)) {
        push(BLOCKER_CODES.VALIDATOR_COVERAGE_NOT_NINETEEN('infrastructure:' + role), 'infrastructure role coverage missing: ' + role);
      }
    }
  }

  // ---------------------------------------------------- 7. correlation ----

  const bundleCorrelation = bundle.correlation_contract || {};
  if (Array.isArray(bundleCorrelation.probe_to_criterion) && bundleCorrelation.probe_to_criterion.length === records.length) {
    const seenProbes = new Set();
    const seenEvidence = new Set();
    const seenIndepKeys = new Set();
    for (const row of bundleCorrelation.probe_to_criterion) {
      if (seenProbes.has(row.probe_id)) push(BLOCKER_CODES.VALIDATOR_CORRELATION_DUPLICATE('probe_id', row.probe_id), 'correlation probe_id duplicate');
      if (seenEvidence.has(row.evidence_id)) push(BLOCKER_CODES.VALIDATOR_CORRELATION_DUPLICATE('evidence_id', row.evidence_id), 'correlation evidence_id duplicate');
      if (seenIndepKeys.has(row.independence_key)) push(BLOCKER_CODES.VALIDATOR_CORRELATION_DUPLICATE('independence_key', row.independence_key), 'correlation independence_key duplicate');
      seenProbes.add(row.probe_id);
      seenEvidence.add(row.evidence_id);
      seenIndepKeys.add(row.independence_key);
    }
  }
  if (!new RegExp(CORRELATION_AGENT_RUN_ID_PATTERN).test(String(bundleCorrelation.agent_run_id || ''))) {
    push(BLOCKER_CODES.VALIDATOR_CORRELATION_AGENT_RUN_MISSING(), 'agent_run_id is missing or outside the replay namespace');
  }

  // Re-derive correlation from records (independent of the producer's claim).
  let rederivedCorrelation;
  try {
    const correlationBuild = contract.buildCorrelationContract({ records, seed: args.seed });
    if (!correlationBuild.ok) {
      push(BLOCKER_CODES.VALIDATOR_CORRELATION_DUPLICATE('rebuild', String(correlationBuild.code)), 'correlation rebuilder rejected records: ' + (correlationBuild.reason || ''));
    } else {
      rederivedCorrelation = correlationBuild.correlation_contract;
      // Compare row-by-row for the per-row invariants; full equality via deepEqual below.
      const recordsByProbe = new Map(records.map((r) => [r.reused_probe_id, r]));
      if (Array.isArray(bundleCorrelation.probe_to_criterion)) {
        for (const row of bundleCorrelation.probe_to_criterion) {
          const rec = recordsByProbe.get(row.probe_id);
          if (!rec) {
            push(BLOCKER_CODES.VALIDATOR_CORRELATION_PROBE_NOT_IN_S03(row.probe_id), 'correlation probe is not present in records');
            continue;
          }
          if (row.evidence_id !== rec.evidence_id || row.criterion_id !== rec.criterion_id
              || row.independence_group !== rec.independence_group
              || row.independence_key !== rec.kind + ':' + rec.independence_group) {
            push(BLOCKER_CODES.VALIDATOR_CORRELATION_INDEPENDENCE_GROUP_UNKNOWN(row.independence_group || 'missing'), 'correlation row does not match immutable record: ' + row.probe_id);
          }
        }
      }
      // Full equality is a stronger invariant that confirms the producer's
      // correlation_contract row count and order are byte-identical to the
      // contract's re-derivation. This catches any inserted/removed/swapped
      // row that the row-by-row check above would not detect on its own.
      if (!deepEqual(rederivedCorrelation, bundleCorrelation)) {
        push(BLOCKER_CODES.VALIDATOR_CORRELATION_DUPLICATE('contract', 'drift'), 'correlation_contract does not match independent re-derivation');
      }
    }
  } catch (e) {
    push(BLOCKER_CODES.VALIDATOR_RUNNER_FAILURE(), 'correlation rebuild fault: ' + e.message);
  }

  // --------------------------------------------------- 8. classification --

  const redactionHitsOnBundle = contract.checkRedactionSafety({ redaction_posture: bundle.redaction_posture, records });
  if (redactionHitsOnBundle.length > 0) {
    push(BLOCKER_CODES.VALIDATOR_REDACTION_LEAK(redactionHitsOnBundle[0].kind), 'bundle redaction posture or record payload unsafe: ' + redactionHitsOnBundle[0].path);
  }
  // Re-derive classification directly via contract (no provenance input — we
  // pass `correlationUnique: true, replayMatch: true, rawInputImmutable: true`
  // because the verifier has independently confirmed those invariants above).
  let rederivedClassification;
  try {
    rederivedClassification = contract.buildEmbeddedClassification({
      records,
      evidenceChain: bundle.evidence_chain,
      redactionHits: [],
      correlationUnique: true,
      replayMatch: true,
      rawInputImmutable: true,
    });
  } catch (e) {
    push(BLOCKER_CODES.VALIDATOR_RUNNER_FAILURE(), 'classification rebuild fault: ' + e.message);
  }

  // Compare bundle.embedded_classification.{verdicts, hard_gates, replay_gates}.
  if (rederivedClassification) {
    const claimed = bundle.embedded_classification || {};
    if (!deepEqual(claimed.verdicts, rederivedClassification.verdicts)) {
      push(BLOCKER_CODES.VALIDATOR_GATE_DERIVATION_DRIFT('verdicts'), 'bundle embedded_classification.verdicts drift from re-derivation');
    }
    if (!deepEqual(claimed.hard_gates, rederivedClassification.hard_gates)) {
      push(BLOCKER_CODES.VALIDATOR_GATE_DERIVATION_DRIFT('hard_gates'), 'bundle embedded_classification.hard_gates drift from re-derivation');
    }
    if (!deepEqual(claimed.replay_gates, rederivedClassification.replay_gates)) {
      push(BLOCKER_CODES.VALIDATOR_GATE_DERIVATION_DRIFT('replay_gates'), 'bundle embedded_classification.replay_gates drift from re-derivation');
    }
  }

  // Forbidden canary verdict guard. The launch promotion guard below also
  // catches GO_BOUNDED_INTERNAL without all HG* pass, but explicit
  // FORBIDDEN_REPLAY_VERDICTS (GO, PASS_AUTOMATIC, READY, LAUNCH_GO) must
  // never appear anywhere in the bundle.
  for (const verdict of ['orchestration', 'evidence', 'launch']) {
    const value = bundle.embedded_classification && bundle.embedded_classification.verdicts && bundle.embedded_classification.verdicts[verdict];
    if (isForbiddenReplayVerdict(value)) {
      push(BLOCKER_CODES.VALIDATOR_LAUNCH_PROMOTION_DETECTED(value), 'forbidden canary verdict token in ' + verdict + ': ' + value);
    }
  }

  // ------------------------------------------------- 9-10. replay keys ----

  let rederivedReplayKeys;
  try {
    rederivedReplayKeys = contract.attachReplayKeys({
      bundle,
      referenceTime: args.referenceTime,
      verifiedAt: args.referenceTime,
    });
  } catch (e) {
    push(BLOCKER_CODES.VALIDATOR_RUNNER_FAILURE(), 'attachReplayKeys fault: ' + e.message);
  }

  if (rederivedReplayKeys) {
    if (rederivedReplayKeys.match !== true || rederivedReplayKeys.byte_identical !== true) {
      push(BLOCKER_CODES.VALIDATOR_BUNDLE_NOT_BYTE_IDENTICAL(), 'attachReplayKeys returned match=false / byte_identical=false');
    }
    const claimed = bundle.replay_keys || {};
    if (claimed.first_run_provenance_hash !== rederivedReplayKeys.first_run_provenance_hash) {
      push(BLOCKER_CODES.VALIDATOR_REPLAY_DRIFT(), 'first_run_provenance_hash disagrees with re-derivation');
    }
    if (claimed.second_run_provenance_hash !== rederivedReplayKeys.second_run_provenance_hash) {
      push(BLOCKER_CODES.VALIDATOR_REPLAY_DRIFT(), 'second_run_provenance_hash disagrees with re-derivation');
    }
    if (claimed.replay_key !== rederivedReplayKeys.replay_key) {
      push(BLOCKER_CODES.VALIDATOR_REPLAY_DRIFT(), 'replay_key disagrees with re-derivation');
    }

    // N iterations of computeBundleBodyDigest MUST yield identical digests.
    const digests = [];
    for (let index = 0; index < args.iterations; index += 1) {
      digests.push(contract.computeBundleBodyDigest(bundle));
    }
    if (new Set(digests).size !== 1) {
      push(BLOCKER_CODES.VALIDATOR_BUNDLE_NOT_BYTE_IDENTICAL(), 'computeBundleBodyDigest across ' + args.iterations + ' iterations disagrees');
    }

    // Bundle digest header must equal the canonical body digest.
    if (bundle.bundle_digest !== contract.computeBundleBodyDigest(bundle)) {
      push(BLOCKER_CODES.VALIDATOR_REPLAY_DRIFT(), 'bundle.bundle_digest disagrees with canonical body digest');
    }
  }

  // ------------------------------------------------- 11. worksheet --------

  let rederivedWorksheet;
  try {
    rederivedWorksheet = contract.buildScoringWorksheet({
      records,
      classification: rederivedClassification,
      generated: args.referenceTime,
    });
  } catch (e) {
    push(BLOCKER_CODES.VALIDATOR_RUNNER_FAILURE(), 'worksheet rebuild fault: ' + e.message);
  }

  if (rederivedWorksheet) {
    const claimed = bundle.scoring_worksheet || {};
    if (claimed.weight_sum !== rederivedWorksheet.weight_sum) {
      push(BLOCKER_CODES.VALIDATOR_GATE_DERIVATION_DRIFT('weight_sum'), 'worksheet.weight_sum drift from re-derivation');
    }
    if (claimed.score !== rederivedWorksheet.score) {
      push(BLOCKER_CODES.VALIDATOR_GATE_DERIVATION_DRIFT('score'), 'worksheet.score drift from re-derivation');
    }
    if (!deepEqual(claimed.verdicts, rederivedWorksheet.verdicts)) {
      push(BLOCKER_CODES.VALIDATOR_GATE_DERIVATION_DRIFT('worksheet.verdicts'), 'worksheet.verdicts drift from re-derivation');
    }
    if (Array.isArray(claimed.rows) && claimed.rows.length === rederivedWorksheet.rows.length) {
      for (let index = 0; index < claimed.rows.length; index += 1) {
        const cRow = claimed.rows[index];
        const eRow = rederivedWorksheet.rows[index];
        if (!deepEqual(cRow, eRow)) {
          push(BLOCKER_CODES.VALIDATOR_GATE_DERIVATION_DRIFT('worksheet.rows[' + index + ']'), 'worksheet rows[' + index + '] drift from re-derivation');
        }
      }
    } else {
      push(BLOCKER_CODES.VALIDATOR_GATE_DERIVATION_DRIFT('worksheet.rows.length'), 'worksheet.rows length or shape differs from re-derivation');
    }
    if (Array.isArray(claimed.steps) && claimed.steps.length === rederivedWorksheet.steps.length) {
      for (let index = 0; index < claimed.steps.length; index += 1) {
        const cStep = claimed.steps[index];
        const eStep = rederivedWorksheet.steps[index];
        if (!deepEqual(cStep, eStep)) {
          push(BLOCKER_CODES.VALIDATOR_GATE_DERIVATION_DRIFT('worksheet.steps[' + index + ']'), 'worksheet steps[' + index + '] drift from re-derivation');
        }
      }
    } else {
      push(BLOCKER_CODES.VALIDATOR_GATE_DERIVATION_DRIFT('worksheet.steps.length'), 'worksheet.steps length or shape differs from re-derivation');
    }
  }

  // -------------------------------------------------- 12. worksheet schema --

  // Worksheet is schema-validated above as part of loadJson. We additionally
  // re-check that worksheet.replay_key matches the re-derived one (byte-equal)
  // because the contract's buildScoringWorksheet accepts a custom replayKey
  // which the producer might have altered without triggering the upstream
  // drift detectors.
  if (rederivedWorksheet && worksheet.replay_key && rederivedWorksheet.replay_key !== worksheet.replay_key) {
    push(BLOCKER_CODES.VALIDATOR_GATE_DERIVATION_DRIFT('worksheet.replay_key'), 'worksheet.replay_key drift from re-derivation');
  }

  // ----------------------------------------------------- 13. score keys ----

  // (No cross-equal check between worksheet.replay_key and
  // bundle.replay_keys.replay_key: those are intentionally different
  // fingerprints. bundle.replay_keys.replay_key is `sha256(firstDigest +
  // ':' + secondDigest + ':' + referenceTime)` from `attachReplayKeys`;
  // worksheet.replay_key is `sha256(stableStringify({rows, steps, score}))`
  // from `buildScoringWorksheet`. Each must equal its OWN re-derivation —
  // checks above cover that — but the two are unrelated by design.)

  // ------------------------------------------------------ 14. protocol -----

  let verifyProtocolPayload = null;
  if (blockers.length === 0) {
    // Build the verify protocol exactly via the contract so the result
    // satisfies the schema by construction.
    verifyProtocolPayload = contract.buildVerifyProtocol({
      bundle,
      replayKeys: rederivedReplayKeys,
      iterations: args.iterations,
      verdicts: bundle.embedded_classification.verdicts,
      blockers: [],
      generated: args.referenceTime,
    });

    // Self-schema-validate the verify protocol. Even though it's generated
    // by the contract, future refactors could break the contract.
    try {
      const loaded = _getSchemaValidator(verifyProtocolSchemaPath);
      const shape = contract.validateBundleShape(verifyProtocolPayload, loaded.validate);
      if (!shape.ok) {
        const error0 = (shape.errors && shape.errors[0]) || {};
        push(BLOCKER_CODES.VALIDATOR_SCHEMA_VIOLATION('verify-protocol:' + (error0.instancePath || 'object')), 'verify-protocol JSON-Schema mismatch: ' + (error0.message || 'unknown'));
        verifyProtocolPayload = null;
      }
    } catch (e) {
      push(BLOCKER_CODES.VALIDATOR_SCHEMA_VIOLATION('verify-protocol-load'), e.message);
      verifyProtocolPayload = null;
    }

    if (verifyProtocolPayload) {
      // Redaction safety: the verify protocol must never carry UUIDs,
      // credentials, raw reasoning, vendor reuse strings, etc.
      const redactionCheck = contract.checkRedactionSafety(verifyProtocolPayload);
      if (redactionCheck.length > 0) {
        push(BLOCKER_CODES.VALIDATOR_REDACTION_LEAK(redactionCheck[0].kind), 'verify-protocol redaction safety violation: ' + redactionCheck[0].path);
        verifyProtocolPayload = null;
      }
    }

    if (verifyProtocolPayload) {
      // Atomic write — refuse to overwrite, mirrors producer immutability.
      try {
        atomicWriteJsonIfMissing(args.protocolOut, verifyProtocolPayload);
      } catch (e) {
        push(e.code || BLOCKER_CODES.PRODUCER_ATOMIC_WRITE_FAILED(args.protocolOut), 'verify-protocol atomic write failed: ' + e.message);
        verifyProtocolPayload = null;
      }
    }
  }

  // ------------------------------------------------------ 15. exit ------

  if (blockers.length > 0) {
    return reject(blockers, args);
  }

  // PASS — print the bounded verifier verdict line.
  const divisions = new Set(records.filter((r) => DIVISION_ROLES.indexOf(r.role) >= 0).map((r) => r.role));
  const infra = new Set(records.filter((r) => INFRASTRUCTURE_ROLES.indexOf(r.role) >= 0).map((r) => r.role));
  printVerdictLine({
    verdict: bundle.embedded_classification.verdicts.launch,
    exit: EXIT_CODES.REPLAY_PASS,
    block_count: 0,
    records: records.length,
    role_records: REPLAY_PARTITION.role_count,
    drill_records: REPLAY_PARTITION.drill_count,
    divisions_covered: divisions.size,
    infrastructure_covered: infra.size,
    replay_key: rederivedReplayKeys.replay_key,
    first_run: rederivedReplayKeys.first_run_provenance_hash,
    second_run: rederivedReplayKeys.second_run_provenance_hash,
    iterations: args.iterations,
    orchestration: bundle.embedded_classification.verdicts.orchestration,
    evidence: bundle.embedded_classification.verdicts.evidence,
    launch: bundle.embedded_classification.verdicts.launch,
    reference_time: args.referenceTime,
  });
  process.exit(EXIT_CODES.REPLAY_PASS);
}

function reject(blockers, args) {
  const exitCode = contract.mapBlockerToExitCode(blockers[0].code);
  printFailureLine(blockers, exitCode);
  process.exit(exitCode);
}

// ---------------------------------------------------------------------------
// CLI entry — if required directly, run with parsed args. When required from
// tests (T05), exporting parseArgs + verify-bundle helpers is enough; we
// never auto-run the side effects below.
// ---------------------------------------------------------------------------

if (require.main === module) {
  const args = parseArgs(process.argv);
  run(args);
}

module.exports = {
  parseArgs,
  loadSource,
  loadJson,
  atomicWriteJson,
  atomicWriteJsonIfMissing,
  validateAgainstSchema,
  run,
  VERIFIER_COMMAND,
  ROOT,
};
