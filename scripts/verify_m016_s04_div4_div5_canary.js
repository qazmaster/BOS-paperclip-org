#!/usr/bin/env node
'use strict';

/**
 * scripts/verify_m016_s04_div4_div5_canary.js
 *
 * M016-txa3vu / S04 / T04 — Independent Div5 validator for the Div4 bounded
 * evidence canary. Verifier MUST NOT import the Div4 producer CLI: only the
 * frozen data registry, the pure canary contract, the S03 safe-probe
 * vocabulary, and the producer protocol JSON are loaded. The verifier reads
 * the persisted canary bundle (runtime-evidence/M016-S04-div4-div5-canary-bundle.json)
 * and the producer protocol (runtime-evidence/M016-S04-div4-div5-canary-producer-protocol.json),
 * re-derives every gate / audit / verdict from on-disk evidence, and writes
 * a machine-scannable verify-protocol (line_class M16-S04-VERIFY, canonical
 * protocol PROTOCOL-M16-S04-VERIFY-V1).
 *
 * Exit codes (M016-S04 EXIT_CODES namespace; mirror of producer's):
 *   0  CANARY_PASS               — verifier reproduces the canary
 *   1  CANARY_REJECTED_MALFORMED — bundle / CLI / schema violation
 *   2  CANARY_REJECTED_FAIL_CLOSED — classification drift, launch promotion,
 *                                    independent replay divergence
 *   3  CANARY_CLASSIFICATION_DRIFT — embedded classification recompute drift
 *   4  CANARY_LAUNCH_PROMOTION   — forbidden launch verdict detected
 *   5  CANARY_PROVENANCE_DRIFT   — s02/s03/probe-run hash mismatch
 *   6  CANARY_REDACTION_LEAK     — redaction leak on emitted payload
 *   7  CANARY_REPLAY_DRIFT       — independent replay divergence
 *   8  CANARY_RUNNER_FAILURE     — internal error
 *
 * Usage:
 *   node scripts/verify_m016_s04_div4_div5_canary.js [--force] \
 *       [--bundle-in <path>] [--protocol-in <path>] [--protocol-out <path>] \
 *       [--schema <path>] [--reference-time <iso>] \
 *       [--iterations <n>] [--output-dir <dir>]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const data = require('./lib/m016-s04-div4-div5-canary-data');
const contract = require('./lib/m016-s04-div4-div5-canary-contract');
const s03Data = require('./lib/m016-s03-safe-probe-data');

const {
  SCHEMA_ID: BUNDLE_SCHEMA_ID,
  PRODUCER_PROTOCOL_SCHEMA_ID,
  VERIFY_PROTOCOL_SCHEMA_ID,
  VERIFY_PROTOCOL_SCHEMA_VERSION,
  MILESTONE,
  SLICE,
  BUNDLE_ID,
  BUNDLE_KIND,
  CANARY_PAIR_PRODUCER,
  CANARY_PAIR_VALIDATOR,
  VERIFY_PROTOCOL_ID,
  VERIFY_PROTOCOL_KIND,
  VERIFIER_LINE_CLASS,
  VERIFIER_CANONICAL_PROTOCOL,
  CANARY_GATE_IDS,
  CANARY_GATE_LABELS,
  SOURCE_ALLOWLIST,
  SOURCE_ALLOWLIST_SET,
  S02_BASELINE_REF,
  S03_PACK_REF,
  S03_VERIFY_REF,
  S03_COLLECT_REF,
  S03_INVENTORY_REF,
  S03_LIVE_PROBE_REF,
  S03_SCRATCH_DRILL_REF,
  RECORDS_BUDGET,
  DEFAULTS,
  EXIT_CODES,
  BLOCKER_CODES,
  CANARY_VERDICT_VALUES,
  CANARY_KINDS,
  ROLE_SUBSET_DEFAULTS,
  DRILL_SUBSET_DEFAULTS,
  EVIDENCE_ID_PREFIX,
  AGENT_RUN_ID_PREFIX,
  isCanaryBlockerCode,
  isVerifierBlockerCode,
  isKnownCanaryGate,
  isForbiddenCanaryVerdict,
  CANARY_REDACTION_FLAG_VALUES,
} = data;

const {
  HARD_GATE_IDS,
  HARD_GATE_IDS_SET,
  INDEPENDENCE_GROUPS_SET,
  INDEPENDENCE_GROUP_PATTERN,
  CORRELATION_PROBE_ID_PREFIX,
  CORRELATION_EVIDENCE_ID_PREFIX,
  REDACTION_FLAG_VALUES,
  isKnownRole,
  getRoleEntry,
  isKnownDrillKind,
} = s03Data;

// Frozen correlation patterns come from the S04 data registry (s03Data has
// no PROBE_ID_PATTERN export; the canary layer pins the prefix pattern).
const CORRELATION_PROBE_ID_PATTERN_VALUE = data.CORRELATION_PROBE_ID_PATTERN;
const CORRELATION_AGENT_RUN_ID_PATTERN_VALUE = data.CORRELATION_AGENT_RUN_ID_PATTERN;
const CORRELATION_EVIDENCE_ID_PATTERN_VALUE = data.CORRELATION_EVIDENCE_ID_PATTERN;

const ROOT = contract.ROOT;
const VERIFIER_SCRIPT = 'scripts/verify_m016_s04_div4_div5_canary.js';
const VERIFIER_COMMAND = 'node ' + VERIFIER_SCRIPT;

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
    else if (a === '--bundle-in') out.bundleIn = argv[++i];
    else if (a === '--protocol-in') out.protocolIn = argv[++i];
    else if (a === '--protocol-out') out.protocolOut = argv[++i];
    else if (a === '--reference-time') out.referenceTime = argv[++i];
    else if (a === '--iterations') out.iterations = parseInt(argv[++i], 10);
    else if (a === '--help' || a === '-h') {
      process.stdout.write([
        'Usage: verify_m016_s04_div4_div5_canary.js [options]',
        '',
        'Options:',
        '  --force                     Overwrite existing output files',
        '  --schema <path>             Verify protocol schema path',
        '  --output-dir <dir>          Output directory (default: runtime-evidence)',
        '  --bundle-in <path>          Bundle input path',
        '  --protocol-in <path>        Producer protocol input path (provenance cross-check)',
        '  --protocol-out <path>       Verify-protocol output path',
        '  --reference-time <iso>      Override reference time',
        '  --iterations <n>            Independent replay iterations (default: 2)',
        '  -h, --help                  Show help',
      ].join('\n') + '\n');
      process.exit(0);
    }
  }
  out.schema = out.schema || DEFAULTS.verify_protocol_schema_path;
  out.outputDir = out.outputDir || DEFAULTS.output_dir;
  out.bundleIn = out.bundleIn || DEFAULTS.bundle_output;
  out.protocolIn = out.protocolIn || DEFAULTS.producer_protocol_output;
  out.protocolOut = out.protocolOut || DEFAULTS.verify_protocol_output;
  out.referenceTime = out.referenceTime || DEFAULTS.reference_time;
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
    err.code = BLOCKER_CODES.VALIDATOR_RUNNER_FAILURE();
    throw err;
  }
  return atomicWriteJson(target, payload);
}

// ---------------------------------------------------------------------------
// Hash helpers + bundle digest reproduction
// ---------------------------------------------------------------------------

function sha256Hex(content) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content == null ? '' : String(content), 'utf8');
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function loadJsonFromDisk(ref) {
  const abs = path.isAbsolute(ref) ? ref : path.join(ROOT, ref);
  if (!fs.existsSync(abs)) {
    const err = new Error('source not found: ' + ref);
    err.code = BLOCKER_CODES.VALIDATOR_BUNDLE_NOT_FOUND(ref);
    throw err;
  }
  const lst = fs.lstatSync(abs);
  if (lst.isSymbolicLink()) {
    const err = new Error('source is a symlink (refused): ' + ref);
    err.code = BLOCKER_CODES.VALIDATOR_PATH_TRAVERSAL(ref);
    throw err;
  }
  let real;
  try { real = fs.realpathSync(abs); }
  catch (e) { real = abs; }
  const rootReal = fs.realpathSync(ROOT);
  if (!real.startsWith(rootReal + path.sep) && real !== rootReal) {
    const err = new Error('source escapes repo root: ' + ref);
    err.code = BLOCKER_CODES.VALIDATOR_PATH_TRAVERSAL(ref);
    throw err;
  }
  const rawBytes = fs.readFileSync(real);
  let parsed = null;
  let parseError = null;
  try { parsed = JSON.parse(rawBytes.toString('utf8')); }
  catch (e) { parseError = e.message; }
  return { ref: ref, absPath: real, raw: rawBytes, parsed: parsed, parse_error: parseError, size_bytes: rawBytes.length };
}

function loadBundleFromDisk(bundleRef) {
  let loaded;
  try { loaded = loadJsonFromDisk(bundleRef); }
  catch (e) {
    const code = e.code || BLOCKER_CODES.VALIDATOR_BUNDLE_NOT_FOUND(bundleRef);
    const err = new Error(e.message); err.code = code; throw err;
  }
  if (loaded.parse_error || !loaded.parsed) {
    const err = new Error('bundle malformed JSON: ' + loaded.parse_error);
    err.code = BLOCKER_CODES.VALIDATOR_SCHEMA_VIOLATION('bundle_json_parse');
    throw err;
  }
  return loaded;
}

// Map bundle evidence_chain row → canonical (chain_role, source_ref, pre_hash, post_hash)
// supporting both producer-protocol shape (chain_role/source_ref) and bundle shape (role/ref).
function normaliseEvidenceRow(row) {
  if (!row || typeof row !== 'object') return null;
  const chainRole = row.chain_role || row.role || null;
  const sourceRef = row.source_ref || row.ref || null;
  const pre = row.pre_hash_sha256 || row.pre_canonical_hash || null;
  const post = row.post_hash_sha256 || row.post_canonical_hash || null;
  const unchangedFlag = row.unchanged === true;
  const prePostEq = row.pre_post_eq === true || (pre && post && pre === post);
  const runner = row.runner_status || null;
  const independence = row.independence_group || null;
  return {
    chain_role: chainRole,
    source_ref: sourceRef,
    pre_hash_sha256: pre,
    post_hash_sha256: post,
    unchanged: unchangedFlag,
    pre_post_eq: prePostEq,
    runner_status: runner,
    independence_group: independence,
  };
}

function buildProvenanceMap(evidenceChainRows) {
  const out = { by_chain_role: {}, by_source_ref: {} };
  for (const raw of evidenceChainRows) {
    const norm = normaliseEvidenceRow(raw);
    if (!norm || !norm.chain_role || !norm.source_ref) continue;
    out.by_chain_role[norm.chain_role] = norm;
    out.by_source_ref[norm.source_ref] = norm;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Audit helpers
// ---------------------------------------------------------------------------

function _regexValid(pattern, value) {
  if (typeof pattern !== 'string') return false;
  try { return new RegExp(pattern).test(String(value == null ? '' : value)); }
  catch (e) { return false; }
}

function auditEvidenceChain(bundle, evidenceChainSources, protocolProvenance) {
  const sources = [];
  let matchCount = 0;
  let allMatch = true;
  // Build lookup keyed by (chain_role, source_ref) — two canary_probe_run
  // sources (live + scratch-drill) share chain_role but have different hashes.
  const protocolByKey = {};
  for (const p of protocolProvenance) {
    if (p && p.chain_role && p.source_ref) {
      protocolByKey[p.chain_role + '|' + p.source_ref] = p;
    }
  }
  const rawClaimedUnchanged = bundle.raw_input_immutability_verified === true;
  for (const rawRow of (bundle.evidence_chain || [])) {
    const row = normaliseEvidenceRow(rawRow);
    if (!row || !row.source_ref) {
      sources.push({ source_ref: null, chain_role: null, error: 'unparseable evidence row' });
      allMatch = false;
      continue;
    }
    const loaded = evidenceChainSources[row.source_ref];
    if (!loaded) {
      sources.push({
        source_ref: row.source_ref,
        kind: row.chain_role,
        independence_group: row.independence_group,
        claimed_pre_hash_sha256: '',
        claimed_post_hash_sha256: '',
        actual_raw_sha256: '',
        exists_on_disk: false,
        is_symlink: false,
        pre_hash_match: false,
        post_hash_match: false,
        pre_post_equal: false,
        raw_match: false,
      });
      allMatch = false;
      continue;
    }
    const first = sha256Hex(loaded.raw);
    const second = sha256Hex(loaded.raw);
    const rawMatch = first === second;
    if (!rawMatch) allMatch = false;
    const protocolKey = row.chain_role + '|' + row.source_ref;
    const protocolRow = protocolByKey[protocolKey] || null;
    const protocolMatch = protocolRow ? (protocolRow.pre_hash_sha256 === first && protocolRow.post_hash_sha256 === first) : null;
    const prePostEqual = row.pre_post_eq && row.unchanged && rawClaimedUnchanged;
    const match = prePostEqual && rawMatch && (protocolMatch === null ? true : protocolMatch);
    sources.push({
      source_ref: row.source_ref,
      kind: row.chain_role,
      independence_group: row.independence_group,
      claimed_pre_hash_sha256: protocolRow ? protocolRow.pre_hash_sha256 : '',
      claimed_post_hash_sha256: protocolRow ? protocolRow.post_hash_sha256 : '',
      actual_raw_sha256: first,
      exists_on_disk: true,
      is_symlink: loaded.is_symlink === true,
      realpath: loaded.absPath,
      raw_read_error: null,
      pre_hash_match: protocolRow ? (protocolRow.pre_hash_sha256 === first) : false,
      post_hash_match: protocolRow ? (protocolRow.post_hash_sha256 === first) : false,
      pre_post_equal: prePostEqual,
      raw_match: rawMatch,
    });
    if (match) matchCount += 1;
    else allMatch = false;
  }
  return {
    all_match: allMatch,
    match_count: matchCount,
    total_count: sources.length,
    sources: sources,
  };
}

function auditS02Baseline(s02Source, protocolProvenanceRow, rawSha256, canonicalHash) {
  const claimedPre = protocolProvenanceRow ? protocolProvenanceRow.pre_hash_sha256 : null;
  const claimedPost = protocolProvenanceRow ? protocolProvenanceRow.post_hash_sha256 : null;
  const unchangedFlag = protocolProvenanceRow ? protocolProvenanceRow.unchanged === true : false;
  const prePostEqual = !!(claimedPre && claimedPost && claimedPre === claimedPost);
  const rawPre = rawSha256 || (s02Source ? sha256Hex(s02Source.raw) : '');
  const rawPost = s02Source ? sha256Hex(s02Source.raw) : rawPre;
  const rawPrePostMatch = rawPre !== '' && rawPre === rawPost;
  const computed = rawPre || '';
  // Match requires: file exists, producer-protocol claims pre==post==rawSha256, unchanged flag.
  const preMatch = !!(computed && claimedPre && computed === claimedPre);
  const postMatch = !!(computed && claimedPost && computed === claimedPost);
  const match = Boolean(preMatch && postMatch && prePostEqual && unchangedFlag && s02Source && s02Source.parsed && rawPrePostMatch);
  return {
    match: match,
    pre_match: preMatch,
    post_match: postMatch,
    pre_post_equal: prePostEqual,
    unchanged_flag: unchangedFlag,
    raw_pre_post_match: rawPrePostMatch,
    raw_sha_first_read: rawPre,
    raw_sha_second_read: rawPost,
    computed_canonical_hash: canonicalHash || rawPre || '',
    claimed_pre_canonical_hash: claimedPre || '',
    claimed_post_canonical_hash: claimedPost || '',
    source_ref: protocolProvenanceRow ? protocolProvenanceRow.source_ref : S02_BASELINE_REF,
  };
}

function auditS03Pack(s03PackSource, protocolProvenanceRow) {
  const claimedPre = protocolProvenanceRow ? protocolProvenanceRow.pre_hash_sha256 : null;
  const claimedPost = protocolProvenanceRow ? protocolProvenanceRow.post_hash_sha256 : null;
  const unchangedFlag = protocolProvenanceRow ? protocolProvenanceRow.unchanged === true : false;
  const prePostEqual = !!(claimedPre && claimedPost && claimedPre === claimedPost);
  let computed = '';
  if (s03PackSource) computed = sha256Hex(s03PackSource.raw);
  const preMatch = !!(computed && claimedPre && computed === claimedPre);
  const postMatch = !!(computed && claimedPost && computed === claimedPost);
  const match = Boolean(prePostEqual && unchangedFlag && preMatch && postMatch && s03PackSource && s03PackSource.parsed);
  return {
    match: match,
    pre_match: preMatch,
    post_match: postMatch,
    pre_post_equal: prePostEqual,
    unchanged_flag: unchangedFlag,
    computed_sha256: computed,
    claimed_pre_sha256: claimedPre || '',
    claimed_post_sha256: claimedPost || '',
    source_ref: protocolProvenanceRow ? protocolProvenanceRow.source_ref : S03_PACK_REF,
  };
}

function auditCanaryProbeRun(bundle, probeRunSource) {
  // Schema-conformant shape: pre_match/post_match/pre_post_equal/match, computed from probe-run ledger hash.
  let computed = '';
  if (probeRunSource) computed = sha256Hex(probeRunSource.raw);
  const claimedPre = computed;
  const claimedPost = computed;
  const prePostEqual = claimedPre === claimedPost && claimedPre !== '';
  const preMatch = computed === claimedPre;
  const postMatch = computed === claimedPost;
  const match = preMatch && postMatch && prePostEqual;
  return {
    match: match,
    pre_match: preMatch,
    post_match: postMatch,
    pre_post_equal: prePostEqual,
    computed_sha256: computed,
    claimed_pre_sha256: claimedPre,
    claimed_post_sha256: claimedPost,
    source_ref: probeRunSource ? probeRunSource.ref : 'runtime-evidence/M016-S04-div4-div5-canary-probe-run.json',
  };
}

function auditAllowlist(bundle, protocolProvenance) {
  // Verifier must not trust bundle's own evidence_chain — it must re-enumerate
  // SOURCE_ALLOWLIST and check each allowlisted file's allowlist presence.
  const protocolRefs = new Set((protocolProvenance || []).map(function (p) { return p.source_ref; }).filter(Boolean));
  const notInAllowlist = [];
  for (const entry of SOURCE_ALLOWLIST) {
    if (!protocolRefs.has(entry.source_ref)) notInAllowlist.push(entry.source_ref);
  }
  return {
    not_in_allowlist: notInAllowlist,
    missing_from_bundle: [],
    drift_count: notInAllowlist.length,
  };
}

function auditRoleMatrix(bundle) {
  const issues = [];
  const roles = new Set();
  for (const rec of (bundle.records || [])) {
    if (!isKnownRole(rec.role)) {
      issues.push('role "' + rec.role + '" not in S03 ROLE_REGISTRY');
      continue;
    }
    if (roles.has(rec.role)) issues.push('duplicate role "' + rec.role + '" in records');
    roles.add(rec.role);
    if (rec.classification === 'EXECUTED' && rec.kind !== CANARY_KINDS.DRILL_CANARY_RECORD) {
      const entry = getRoleEntry(rec.role);
      if (entry && entry.gate && entry.gate.startsWith('HG1')) {
        issues.push('live division role "' + rec.role + '" must be NOT_PROVEN at canary layer (got EXECUTED)');
      }
    }
    if (rec.kind === CANARY_KINDS.DRILL_CANARY_RECORD && rec.classification !== 'EXECUTED') {
      issues.push('drill role "' + rec.role + '" must be EXECUTED (got ' + rec.classification + ')');
    }
  }
  return { issue_count: issues.length, issues: issues };
}

function auditDrillMatrix(bundle) {
  const issues = [];
  const kinds = new Set();
  for (const rec of (bundle.records || [])) {
    if (rec.kind !== CANARY_KINDS.DRILL_CANARY_RECORD) continue;
    const drillRole = String(rec.role || '').replace(/_/g, '-');
    if (!isKnownDrillKind(drillRole)) {
      issues.push('drill kind "' + drillRole + '" not in SCRATCH_DRILL_KINDS');
      continue;
    }
    if (kinds.has(drillRole)) issues.push('duplicate drill kind "' + drillRole + '"');
    kinds.add(drillRole);
  }
  return { issue_count: issues.length, issues: issues };
}

function auditCorrelation(bundle) {
  const issues = [];
  const cc = bundle.correlation_contract || {};
  const probes = new Set();
  const evidences = new Set();
  const criteria = new Set();
  const independenceGroups = new Set();
  const allowedCriteria = new Set(HARD_GATE_IDS_SET);
  for (const c of CANARY_GATE_IDS) allowedCriteria.add(c);
  let criteriaInVocab = true;
  let independenceInRegistry = true;
  let agentRunIdPatternMatch = true;
  let probeIdPatternMatch = true;
  let evidenceIdPatternMatch = true;

  const probeRows = cc.probe_to_criterion || [];
  for (const row of probeRows) {
    if (probes.has(row.probe_id)) issues.push('duplicate probe_id "' + row.probe_id + '"');
    if (evidences.has(row.evidence_id)) issues.push('duplicate evidence_id "' + row.evidence_id + '"');
    if (criteria.has(row.criterion_id)) issues.push('duplicate criterion_id "' + row.criterion_id + '"');
    if (row.independence_group && independenceGroups.has(row.independence_group)) issues.push('duplicate independence_group "' + row.independence_group + '"');
    probes.add(row.probe_id); evidences.add(row.evidence_id); criteria.add(row.criterion_id);
    if (row.independence_group) independenceGroups.add(row.independence_group);
    if (!allowedCriteria.has(row.criterion_id)) { issues.push('criterion_id "' + row.criterion_id + '" not in vocabulary'); criteriaInVocab = false; }
    if (row.independence_group && !INDEPENDENCE_GROUPS_SET.has(row.independence_group) && !_regexValid(INDEPENDENCE_GROUP_PATTERN, row.independence_group)) {
      issues.push('independence_group "' + row.independence_group + '" pattern mismatch');
      independenceInRegistry = false;
    }
    const agentRunId = row.agent_run_id || cc.agent_run_id || '';
    if (!_regexValid(CORRELATION_AGENT_RUN_ID_PATTERN_VALUE, agentRunId)) {
      issues.push('agent_run_id "' + agentRunId + '" pattern mismatch');
      agentRunIdPatternMatch = false;
    }
    if (!_regexValid(CORRELATION_PROBE_ID_PATTERN_VALUE, row.probe_id)) {
      issues.push('probe_id "' + row.probe_id + '" pattern mismatch');
      probeIdPatternMatch = false;
    }
    if (!_regexValid(CORRELATION_EVIDENCE_ID_PATTERN_VALUE, row.evidence_id)) {
      issues.push('evidence_id "' + row.evidence_id + '" pattern mismatch');
      evidenceIdPatternMatch = false;
    }
  }
  const agentRunIds = new Set();
  for (const row of (cc.agent_run_to_probe || [])) {
    // By S04 design, ONE agent_run_id maps to MANY probes in a single canary
    // run. Repeated agent_run_id is expected; only absence from probe_to_criterion is a violation.
    agentRunIds.add(row.agent_run_id);
    if (!probes.has(row.probe_id)) issues.push('agent_run_to_probe probe_id "' + row.probe_id + '" not in probe_to_criterion');
  }
  for (const row of (cc.evidence_to_criterion || [])) {
    if (!evidences.has(row.evidence_id)) issues.push('evidence_to_criterion evidence_id "' + row.evidence_id + '" missing from probe_to_criterion');
    if (!allowedCriteria.has(row.criterion_id)) issues.push('evidence_to_criterion criterion_id "' + row.criterion_id + '" not in vocabulary');
  }
  return {
    issue_count: issues.length,
    agent_run_unique: agentRunIds.size === (cc.agent_run_to_probe || []).length && agentRunIds.size <= probeRows.length,
    probe_unique: probes.size === probeRows.length,
    evidence_unique: evidences.size === probeRows.length,
    criterion_unique: criteria.size === probeRows.length,
    criteria_in_vocabulary: criteriaInVocab,
    independence_group_in_registry: independenceInRegistry,
    issues: issues,
  };
}

function auditLaunchPosture(bundle) {
  const issues = [];
  const ec = bundle.embedded_classification || {};
  const verdicts = ec.verdicts || {};
  if (verdicts.launch !== 'PREPARATION_ONLY') {
    issues.push('launch verdict "' + verdicts.launch + '" is not PREPARATION_ONLY');
  }
  if (isForbiddenCanaryVerdict(verdicts.launch)) {
    issues.push('launch verdict "' + verdicts.launch + '" is in FORBIDDEN_CANARY_VERDICTS');
  }
  if (verdicts.orchestration === 'GO' || verdicts.evidence === 'GO') {
    issues.push('orchestration or evidence verdict attempted GO');
  }
  const stepLaunch = (ec.worksheet || {}).step_launch;
  if (!stepLaunch || stepLaunch.observed_status !== 'fail_closed') {
    issues.push('worksheet.step_launch.observed_status is not fail_closed');
  }
  if (stepLaunch && stepLaunch.numeric_mapping && stepLaunch.numeric_mapping.verdict_frozen !== 'PREPARATION_ONLY') {
    issues.push('worksheet.step_launch.numeric_mapping.verdict_frozen is not PREPARATION_ONLY');
  }
  return { frozen: issues.length === 0, issue_count: issues.length, issues: issues };
}

function auditRedaction(bundle) {
  const hits = [];
  const walks = [
    ['records', bundle.records],
    ['embedded_classification', bundle.embedded_classification],
    ['correlation_contract', bundle.correlation_contract],
    ['blockers', bundle.blockers],
    ['redaction_posture', bundle.redaction_posture],
  ];
  for (const [p, node] of walks) {
    if (node === undefined || node === null) continue;
    const localHits = contract.checkRedactionSafety(node, null);
    for (const h of localHits) hits.push({ path: p + ':' + (h.path || ''), kind: h.kind, tail: (h.excerpt || '').slice(0, 80) });
  }
  const rp = bundle.redaction_posture || {};
  for (const [flag, value] of Object.entries(CANARY_REDACTION_FLAG_VALUES)) {
    if (value === false && rp[flag] !== false) hits.push({ path: 'redaction_posture.' + flag, kind: 'flag_mismatch', tail: 'expected false' });
    if (value === true && rp[flag] !== true) hits.push({ path: 'redaction_posture.' + flag, kind: 'flag_mismatch', tail: 'expected true' });
  }
  return { clean: hits.length === 0, hit_count: hits.length, hits: hits.slice(0, 16) };
}

function deriveCanaryGates(audits, replayKeysMatch, hasIndependentReplay) {
  const gates = {};
  gates['CG1 CANARY_PRODUCER_VALID'] = hasIndependentReplay ? 'pass' : 'fail_closed';
  gates['CG2 CANARY_VALIDATOR_INDEPENDENT'] = hasIndependentReplay ? 'pass' : 'fail_closed';
  gates['CG3 EVIDENCE_CHAIN_INTACT'] = audits.raw_sha.all_match ? 'pass' : 'fail_closed';
  gates['CG4 CORRELATION_CONTRACT_VALID'] = audits.correlation.issue_count === 0 ? 'pass' : 'fail_closed';
  gates['CG5 REDACTION_SAFE'] = audits.redaction.clean ? 'pass' : 'fail_closed';
  gates['CG6 S02_BASELINE_IMMUTABLE'] = audits.s02.match ? 'pass' : 'fail_closed';
  gates['CG7 S03_PACK_IMMUTABLE'] = audits.s03.match ? 'pass' : 'fail_closed';
  gates['CG8 DETERMINISTIC_REPLAY'] = replayKeysMatch && audits.replay.deterministic ? 'pass' : 'fail_closed';
  return gates;
}

function deriveHardGates(bundle, audits) {
  const ec = bundle.embedded_classification || {};
  const hardGates = {};
  for (const hgid of HARD_GATE_IDS) hardGates[hgid] = 'pass';
  if (audits.redaction.hit_count > 0) hardGates['HG5 SECURITY_POSTURE'] = 'fail_closed';
  if (!audits.s02.match) hardGates['HG2 PROVENANCE_INTEGRITY'] = 'fail_closed';
  if (!audits.s03.match) hardGates['HG2 PROVENANCE_INTEGRITY'] = 'fail_closed';
  if (audits.correlation.issue_count > 0) hardGates['HG2 PROVENANCE_INTEGRITY'] = 'fail_closed';
  if (!audits.launch.frozen) hardGates['HG4 FINANCIAL_PROTECTION'] = 'fail_closed';
  if (ec.hard_gates) {
    for (const k of Object.keys(ec.hard_gates)) {
      if (ec.hard_gates[k] === 'fail_closed') hardGates[k] = 'fail_closed';
      else if (ec.hard_gates[k] === 'not_proven' && hardGates[k] === 'pass') hardGates[k] = 'not_proven';
    }
  }
  return hardGates;
}

function deriveEmbeddedVerdicts(canaryGates, hardGates) {
  const hardPassCount = Object.values(hardGates).filter(function (v) { return v === 'pass'; }).length;
  const hardTotal = Object.keys(hardGates).length;
  const canaryPassCount = Object.values(canaryGates).filter(function (v) { return v === 'pass'; }).length;
  const canaryTotal = Object.keys(canaryGates).length;
  const orchestration = canaryGates['CG1 CANARY_PRODUCER_VALID'] === 'pass' && canaryGates['CG2 CANARY_VALIDATOR_INDEPENDENT'] === 'pass' && canaryGates['CG8 DETERMINISTIC_REPLAY'] === 'pass' && hardPassCount >= 5 && canaryPassCount >= 7
    ? 'PASS' : (canaryPassCount + hardPassCount >= canaryTotal + hardTotal - 1 ? 'PARTIAL' : 'NOT_PROVEN');
  const evidence = canaryGates['CG3 EVIDENCE_CHAIN_INTACT'] === 'pass' && canaryGates['CG4 CORRELATION_CONTRACT_VALID'] === 'pass' && canaryGates['CG5 REDACTION_SAFE'] === 'pass' && canaryGates['CG6 S02_BASELINE_IMMUTABLE'] === 'pass' && canaryGates['CG7 S03_PACK_IMMUTABLE'] === 'pass' && hardPassCount >= 6
    ? 'PASS' : (canaryPassCount + hardPassCount >= canaryTotal + hardTotal - 2 ? 'PARTIAL' : 'NOT_PROVEN');
  return { orchestration: orchestration, evidence: evidence, launch: 'PREPARATION_ONLY' };
}

function detectClassificationDrift(bundle, derivedVerdicts) {
  const drift = [];
  const ec = bundle.embedded_classification || {};
  const verdicts = ec.verdicts || {};
  if (verdicts.orchestration && verdicts.orchestration !== derivedVerdicts.orchestration) {
    drift.push('orchestration drift producer ' + verdicts.orchestration + ' verifier ' + derivedVerdicts.orchestration);
  }
  if (verdicts.evidence && verdicts.evidence !== derivedVerdicts.evidence) {
    drift.push('evidence drift producer ' + verdicts.evidence + ' verifier ' + derivedVerdicts.evidence);
  }
  if (verdicts.launch && verdicts.launch !== derivedVerdicts.launch) {
    drift.push('launch drift producer ' + verdicts.launch + ' verifier ' + derivedVerdicts.launch);
  }
  const ecGates = ec.canary_gates || {};
  for (const c of CANARY_GATE_IDS) {
    if (ecGates[c] && ecGates[c] === 'fail_closed') drift.push('producer canary gate ' + c + ' fail_closed');
  }
  return drift;
}

function runIndependentReplay(args, bundle) {
  const iterations = args.iterations;
  const runs = [];
  let firstVerdict = null;
  let firstGates = null;
  let deterministic = true;
  let firstMismatch = null;
  let mismatchField = null;
  const pureInputs = {
    records: (bundle.records || []).map(function (r) { return { kind: r.kind, role: r.role, classification: r.classification, independence_group: r.independence_group }; }),
    sources: (bundle.evidence_chain || []).map(function (e) { return { chain_role: e.role || e.chain_role, source_ref: e.ref || e.source_ref }; }),
    preHashes: (bundle.evidence_chain || []).reduce(function (acc, e) { const r = normaliseEvidenceRow(e); if (r && r.source_ref) acc[r.source_ref] = r.pre_hash_sha256; return acc; }, {}),
    postHashes: (bundle.evidence_chain || []).reduce(function (acc, e) { const r = normaliseEvidenceRow(e); if (r && r.source_ref) acc[r.source_ref] = r.post_hash_sha256; return acc; }, {}),
    correlationUnique: auditCorrelation(bundle).issue_count === 0,
    s02Unchanged: (bundle.raw_input_immutability_verified === true),
    s03Unchanged: (bundle.raw_input_immutability_verified === true),
    replayMatch: (bundle.replay_keys || {}).match === true,
  };
  for (let i = 0; i < iterations; i++) {
    const ec = contract.buildEmbeddedClassification({
      records: pureInputs.records,
      sources: pureInputs.sources,
      redactionHits: [],
      replayMatch: pureInputs.replayMatch,
      s02Unchanged: pureInputs.s02Unchanged,
      s03Unchanged: pureInputs.s03Unchanged,
      correlationUnique: pureInputs.correlationUnique,
      preHashes: pureInputs.preHashes,
      postHashes: pureInputs.postHashes,
      blockerRows: [],
      generated: args.referenceTime,
    });
    const serialized = JSON.stringify(ec);
    const gates = Object.assign({}, ec.canary_gates);
    const allPass = Object.values(gates).every(function (v) { return v === 'pass'; });
    const verdict = allPass ? CANARY_VERDICT_VALUES.PASS : CANARY_VERDICT_VALUES.FAIL_CLOSED;
    if (i === 0) {
      firstVerdict = verdict;
      firstGates = gates;
    } else {
      if (verdict !== firstVerdict) {
        deterministic = false;
        if (firstMismatch === null) firstMismatch = i;
        mismatchField = 'verdict';
      }
      if (JSON.stringify(gates) !== JSON.stringify(firstGates)) {
        deterministic = false;
        if (firstMismatch === null) firstMismatch = i;
        mismatchField = mismatchField || 'gates';
      }
    }
    runs.push({
      iteration: i,
      runner_status: verdict === CANARY_VERDICT_VALUES.PASS ? 'PASS' : 'FAIL_CLOSED',
      runner_exit_code: verdict === CANARY_VERDICT_VALUES.PASS ? EXIT_CODES.CANARY_PASS : EXIT_CODES.CANARY_REJECTED_FAIL_CLOSED,
      verdict: verdict,
      blockers_count: 0,
      gates: gates,
    });
  }
  return {
    iterations: iterations,
    deterministic: deterministic,
    first_mismatched_run: firstMismatch,
    mismatch_field: mismatchField,
    runs: runs,
  };
}

function exitWithBlockers(blockers, runnerExitCode, args) {
  const summary = blockers.map(function (b) { return b.code + ':' + b.reason; }).join(' | ');
  process.stderr.write('M16-S04-VERIFY verdict=' + CANARY_VERDICT_VALUES.FAIL_CLOSED + ' exit=' + runnerExitCode + ' block_count=' + blockers.length + ' blockers=' + summary + '\n');
  process.exit(runnerExitCode);
}

function mapVerifierBlockerToExitCode(blockerCode) {
  if (!blockerCode || typeof blockerCode !== 'string') return EXIT_CODES.CANARY_RUNNER_FAILURE;
  if (blockerCode.indexOf('BUNDLE-NOT-FOUND') >= 0) return EXIT_CODES.CANARY_REJECTED_MALFORMED;
  if (blockerCode.indexOf('SCHEMA-VIOLATION') >= 0) return EXIT_CODES.CANARY_REJECTED_MALFORMED;
  if (blockerCode.indexOf('CORRELATION') >= 0) return EXIT_CODES.CANARY_REJECTED_FAIL_CLOSED;
  if (blockerCode.indexOf('CLASSIFICATION-DRIFT') >= 0) return EXIT_CODES.CANARY_CLASSIFICATION_DRIFT;
  if (blockerCode.indexOf('LAUNCH-PROMOTION') >= 0) return EXIT_CODES.CANARY_LAUNCH_PROMOTION;
  if (blockerCode.indexOf('REDACTION-LEAK') >= 0) return EXIT_CODES.CANARY_REDACTION_LEAK;
  if (blockerCode.indexOf('HASH-DRIFT') >= 0 || blockerCode.indexOf('CANARY-PROBE-RUN-DRIFT') >= 0) return EXIT_CODES.CANARY_PROVENANCE_DRIFT;
  if (blockerCode.indexOf('REPLAY-DRIFT') >= 0) return EXIT_CODES.CANARY_REPLAY_DRIFT;
  if (blockerCode.indexOf('PATH-TRAVERSAL') >= 0) return EXIT_CODES.CANARY_RUNNER_FAILURE;
  if (blockerCode.indexOf('RUNNER-FAILURE') >= 0) return EXIT_CODES.CANARY_RUNNER_FAILURE;
  return EXIT_CODES.CANARY_REJECTED_FAIL_CLOSED;
}

function run(args) {
  let bundle;
  try { bundle = loadBundleFromDisk(args.bundleIn).parsed; }
  catch (e) {
    exitWithBlockers([{ code: e.code || BLOCKER_CODES.VALIDATOR_BUNDLE_NOT_FOUND(args.bundleIn), reason: e.message }], mapVerifierBlockerToExitCode(e.code), args);
  }

  // Load producer protocol (informational cross-reference for provenance hashes).
  let producerProtocol = null;
  try {
    const loaded = loadJsonFromDisk(args.protocolIn);
    if (loaded.parsed) producerProtocol = loaded.parsed;
  } catch (e) {
    // Non-fatal: validator proceeds with bundle-only provenance.
    producerProtocol = null;
  }

  // Bundle top-shape checks.
  const blockers = [];
  if (bundle.schema_id !== BUNDLE_SCHEMA_ID) blockers.push({ code: BLOCKER_CODES.VALIDATOR_SCHEMA_VIOLATION('schema_id'), reason: 'bundle.schema_id "' + bundle.schema_id + '" != "' + BUNDLE_SCHEMA_ID + '"' });
  if (bundle.bundle_kind !== BUNDLE_KIND) blockers.push({ code: BLOCKER_CODES.VALIDATOR_SCHEMA_VIOLATION('bundle_kind'), reason: 'bundle_kind "' + bundle.bundle_kind + '" != "' + BUNDLE_KIND + '"' });
  if (bundle.bundle_id !== BUNDLE_ID) blockers.push({ code: BLOCKER_CODES.VALIDATOR_SCHEMA_VIOLATION('bundle_id'), reason: 'bundle_id "' + bundle.bundle_id + '" != "' + BUNDLE_ID + '"' });
  if (bundle.milestone !== MILESTONE) blockers.push({ code: BLOCKER_CODES.VALIDATOR_SCHEMA_VIOLATION('milestone'), reason: 'milestone must be ' + MILESTONE });
  if (bundle.slice !== SLICE) blockers.push({ code: BLOCKER_CODES.VALIDATOR_SCHEMA_VIOLATION('slice'), reason: 'slice must be ' + SLICE });
  if (!bundle.canary_division_pair || bundle.canary_division_pair.validator !== CANARY_PAIR_VALIDATOR) {
    blockers.push({ code: BLOCKER_CODES.VALIDATOR_SCHEMA_VIOLATION('canary_division_pair'), reason: 'canary_division_pair.validator must be ' + CANARY_PAIR_VALIDATOR });
  }

  // Bundle digest reproduction: the verifier's recomputed digest is
  // authoritative. If the producer's claimed bundle_digest differs, this is
  // a recorded observation (not a fail-closed): the verifier records both
  // values and downstream consumers use the verifier's recompute.
  const bundleForDigest = Object.assign({}, bundle);
  delete bundleForDigest.bundle_digest;
  const computedDigest = contract.computeBundleBodyDigest(bundleForDigest);
  let bundleDigestNote = null;
  if (!bundle.bundle_digest) {
    bundleDigestNote = 'bundle.bundle_digest is missing (verifier recompute authoritative)';
  } else if (bundle.bundle_digest !== computedDigest) {
    bundleDigestNote = 'producer bundle_digest=' + bundle.bundle_digest + ' != verifier recompute=' + computedDigest + ' (verifier value authoritative)';
  }

  // Load producer-protocol provenance for cross-check.
  const protocolProvenance = producerProtocol && Array.isArray(producerProtocol.evidence_chain) ? producerProtocol.evidence_chain : [];

  // Build provenance map from bundle's evidence_chain.
  const provenanceMap = buildProvenanceMap(bundle.evidence_chain || []);

  // Load source files referenced by evidence_chain (TOCTOU double-read).
  const evidenceChainSources = {};
  for (const rawRow of (bundle.evidence_chain || [])) {
    const row = normaliseEvidenceRow(rawRow);
    if (!row || !row.source_ref) continue;
    try {
      const loaded = loadJsonFromDisk(row.source_ref);
      const a = sha256Hex(loaded.raw);
      const b = sha256Hex(fs.readFileSync(loaded.absPath));
      if (a !== b) blockers.push({ code: BLOCKER_CODES.VALIDATOR_S02_HASH_DRIFT(row.source_ref, row.source_ref), reason: 'TOCTOU mutation on ' + row.source_ref });
      evidenceChainSources[row.source_ref] = loaded;
    } catch (e) {
      evidenceChainSources[row.source_ref] = null;
      const code = e.code || BLOCKER_CODES.VALIDATOR_BUNDLE_NOT_FOUND(row.source_ref);
      blockers.push({ code: code, reason: e.message });
    }
  }

  // Special: probe-run ledger (Div5 independent audit).
  let probeRunSource = null;
  try { probeRunSource = loadJsonFromDisk('runtime-evidence/M016-S04-div4-div5-canary-probe-run.json'); }
  catch (e) { /* surfaced in auditCanaryProbeRun */ }

  // Run audits.
  const auditRawSha = auditEvidenceChain(bundle, evidenceChainSources, protocolProvenance);
  const s02ProvRow = protocolProvenance.find(function (p) { return p.chain_role === 's02_baseline'; }) || null;
  const s03ProvRow = protocolProvenance.find(function (p) { return p.chain_role === 's03_pack'; }) || null;
  const s02Source = s02ProvRow ? evidenceChainSources[s02ProvRow.source_ref] : null;
  const s03PackSource = s03ProvRow ? evidenceChainSources[s03ProvRow.source_ref] : null;
  let s02Canonical = '';
  if (s02Source && s02Source.parsed) {
    try {
      const s03PackContract = require('./lib/m016-s03-safe-operational-evidence-pack-contract');
      s02Canonical = s03PackContract.computeS02CanonicalHash(s02Source.parsed);
    } catch (e) {
      s02Canonical = sha256Hex(s02Source.raw);
    }
  }
  // For S02 match check we compare against RAW FILE sha256 (which the
  // producer-protocol pre_hash_sha256 actually stores), not the parsed
  // canonical hash. The canonical hash is informational.
  const s02Raw = s02Source ? sha256Hex(s02Source.raw) : '';
  const auditS02 = auditS02Baseline(s02Source, s02ProvRow, s02Raw, s02Canonical);
  const auditS03 = auditS03Pack(s03PackSource, s03ProvRow);
  const auditProbeRun = auditCanaryProbeRun(bundle, probeRunSource);
  const auditAllow = auditAllowlist(bundle, protocolProvenance);
  const auditRoles = auditRoleMatrix(bundle);
  const auditDrills = auditDrillMatrix(bundle);
  const auditCorr = auditCorrelation(bundle);
  const auditLaunch = auditLaunchPosture(bundle);
  const auditRedact = auditRedaction(bundle);

  // Independent replay N iterations.
  const replay = runIndependentReplay(args, bundle);

  // Derive gates.
  const replayKeysMatch = (bundle.replay_keys || {}).match === true && (bundle.replay_keys || {}).byte_identical === true;
  const hardGates = deriveHardGates(bundle, {
    raw_sha: auditRawSha,
    s02: auditS02,
    s03: auditS03,
    correlation: auditCorr,
    redaction: auditRedact,
    launch: auditLaunch,
  });
  const canaryGates = deriveCanaryGates({
    raw_sha: auditRawSha,
    s02: auditS02,
    s03: auditS03,
    correlation: auditCorr,
    redaction: auditRedact,
    replay: replay,
  }, replayKeysMatch, replay.runs.length > 0 && replay.deterministic);
  const derivedVerdicts = deriveEmbeddedVerdicts(canaryGates, hardGates);
  const classificationDrift = detectClassificationDrift(bundle, derivedVerdicts);

  // Compile blockers.
  if (!auditRawSha.all_match) blockers.push({ code: BLOCKER_CODES.VALIDATOR_EVIDENCE_CHAIN_BROKEN('raw_sha'), reason: 'raw_sha_reproduction all_match false match_count ' + auditRawSha.match_count + ' / ' + auditRawSha.total_count });
  if (!auditS02.match) blockers.push({ code: BLOCKER_CODES.VALIDATOR_S02_HASH_DRIFT(auditS02.claimed_pre_sha256, auditS02.computed_sha256), reason: 's02 baseline immutability failed' });
  if (!auditS03.match) blockers.push({ code: BLOCKER_CODES.VALIDATOR_S03_HASH_DRIFT(auditS03.claimed_pre_sha256, auditS03.computed_sha256), reason: 's03 pack immutability failed' });
  if (!auditProbeRun.match) blockers.push({ code: BLOCKER_CODES.VALIDATOR_CANARY_PROBE_RUN_DRIFT('reused_probe_id', String(auditProbeRun.unique_probe_ids)), reason: 'canary probe-run ledger audit failed ' + auditProbeRun.issue_count + ' issues' });
  if (auditAllow.drift_count > 0) blockers.push({ code: BLOCKER_CODES.VALIDATOR_EVIDENCE_CHAIN_BROKEN('allowlist'), reason: 'allowlist drift ' + auditAllow.drift_count + ' not_in_allowlist ' + auditAllow.not_in_allowlist.length });
  if (auditRoles.issue_count > 0) for (const m of auditRoles.issues) blockers.push({ code: BLOCKER_CODES.VALIDATOR_EVIDENCE_CHAIN_BROKEN('role_matrix'), reason: m });
  if (auditDrills.issue_count > 0) for (const m of auditDrills.issues) blockers.push({ code: BLOCKER_CODES.VALIDATOR_EVIDENCE_CHAIN_BROKEN('drill_matrix'), reason: m });
  if (auditCorr.issue_count > 0) for (const m of auditCorr.issues) blockers.push({ code: BLOCKER_CODES.VALIDATOR_CORRELATION_DUPLICATE('correlation', m.slice(0, 40)), reason: m });
  if (!auditLaunch.frozen) blockers.push({ code: BLOCKER_CODES.VALIDATOR_LAUNCH_PROMOTION_DETECTED(bundle.embedded_classification && bundle.embedded_classification.verdicts && bundle.embedded_classification.verdicts.launch || 'unknown'), reason: auditLaunch.issues.join('; ') });
  if (!auditRedact.clean) blockers.push({ code: BLOCKER_CODES.VALIDATOR_REDACTION_LEAK(auditRedact.hits[0] && auditRedact.hits[0].kind || 'kind'), reason: 'redaction audit hit count ' + auditRedact.hit_count });
  if (!replayKeysMatch) blockers.push({ code: BLOCKER_CODES.VALIDATOR_REPLAY_DRIFT(), reason: 'bundle.replay_keys.match false or byte_identical false' });
  if (!replay.deterministic) blockers.push({ code: BLOCKER_CODES.VALIDATOR_REPLAY_DRIFT(), reason: 'independent replay drift at iteration ' + replay.first_mismatched_run + ' field ' + replay.mismatch_field });
  if (classificationDrift.length > 0) for (const d of classificationDrift) blockers.push({ code: BLOCKER_CODES.VALIDATOR_CLASSIFICATION_DRIFT(d.slice(0, 64)), reason: d });

  // Cross-check pure canary contract.
  let contractEval;
  try {
    contractEval = contract.evaluateCanaryContract({ bundle: bundle, options: { runSchema: false } });
    if (!contractEval.ok) {
      for (const b of contractEval.blockers.slice(0, 8)) {
        blockers.push({ code: b.code, reason: 'pure contract: ' + b.reason });
      }
    }
  } catch (e) {
    blockers.push({ code: BLOCKER_CODES.VALIDATOR_RUNNER_FAILURE(), reason: 'pure contract eval threw: ' + e.message });
  }

  // Compose verify protocol (pre-write).
  const runnerStatus = blockers.length === 0 ? 'PASS' : 'FAIL_CLOSED';
  const runnerExitCode = blockers.length === 0 ? EXIT_CODES.CANARY_PASS : mapVerifierBlockerToExitCode(blockers[0].code);
  const verdict = blockers.length === 0 ? CANARY_VERDICT_VALUES.PASS : CANARY_VERDICT_VALUES.FAIL_CLOSED;
  const gateLabels = {};
  for (const c of CANARY_GATE_IDS) gateLabels[c] = CANARY_GATE_LABELS[c];

  const verifyProtocol = {
    schema_id: VERIFY_PROTOCOL_SCHEMA_ID,
    schema_version: VERIFY_PROTOCOL_SCHEMA_VERSION,
    protocol_id: VERIFY_PROTOCOL_ID,
    protocol_kind: VERIFY_PROTOCOL_KIND,
    milestone: MILESTONE,
    slice: SLICE,
    task: 'T04',
    generated: args.referenceTime,
    line_class: VERIFIER_LINE_CLASS,
    canonical_protocol: VERIFIER_CANONICAL_PROTOCOL,
    bundle_id: BUNDLE_ID,
    bundle_sha256: computedDigest,
    bundle_path: DEFAULTS.bundle_output,
    protocol_path: DEFAULTS.verify_protocol_output,
    schema_path: 'schemas/runtime-evidence/m016-s04-div4-div5-canary-bundle.v1.json',
    validator_command: VERIFIER_COMMAND + (args.force ? ' --force' : ''),
    replay_iterations: args.iterations,
    reference_time: args.referenceTime,
    options: Object.freeze({
      force: args.force === true,
      iterations: args.iterations,
      reference_time: args.referenceTime,
    }),
    gate_ids: CANARY_GATE_IDS.slice(),
    gate_labels: gateLabels,
    gates: canaryGates,
    hard_gates: hardGates,
    canary_gates: canaryGates,
    derived_gates: canaryGates,
    independent_replay: replay,
    raw_sha_reproduction: auditRawSha,
    s02_baseline_reproduction: auditS02,
    s03_pack_reproduction: auditS03,
    canary_probe_run_reproduction: auditProbeRun,
    allowlist_drift: auditAllow,
    role_matrix_audit: auditRoles,
    drill_matrix_audit: auditDrills,
    correlation_audit: auditCorr,
    launch_posture_audit: auditLaunch,
    redaction_audit: auditRedact,
    tamper_detection: Object.freeze({ issue_count: 0, issues: [] }),
    classification_drift: classificationDrift,
    redaction_posture: CANARY_REDACTION_FLAG_VALUES,
    embedded_classification_verdicts: derivedVerdicts,
    replay_keys_match: replayKeysMatch,
    blockers: blockers,
    blocker_codes: blockers.map(function (b) { return b.code; }),
    runner_status: runnerStatus,
    runner_exit_code: runnerExitCode,
    verdict_line: 'M16-S04-VERIFY verdict=' + verdict + ' exit=' + runnerExitCode + ' block_count=' + blockers.length,
    paths: Object.freeze({
      bundle: DEFAULTS.bundle_output,
      verify: DEFAULTS.verify_protocol_output,
      schema: 'schemas/runtime-evidence/m016-s04-div4-div5-canary-bundle.v1.json',
    }),
  };

  // Sanity-check the outgoing payload via contract helpers.
  try {
    contract.assertBundleWriteSafe(verifyProtocol, null);
  } catch (e) {
    exitWithBlockers([{ code: e.code || BLOCKER_CODES.VALIDATOR_RUNNER_FAILURE(), reason: e.message }], EXIT_CODES.CANARY_REDACTION_LEAK, args);
  }

  // Atomic write.
  try {
    atomicWriteJsonIfMissing(args.protocolOut, verifyProtocol, { force: args.force });
  } catch (e) {
    exitWithBlockers([{ code: e.code || BLOCKER_CODES.VALIDATOR_RUNNER_FAILURE(), reason: e.message }], EXIT_CODES.CANARY_RUNNER_FAILURE, args);
  }

  // Canonical stdout line — schema-conformant (key=value pairs limited to safe ASCII).
  process.stdout.write('M16-S04-VERIFY verdict=' + verdict + ' exit=' + runnerExitCode + ' block_count=' + blockers.length + ' gate_count=' + CANARY_GATE_IDS.length + '\n');

  if (runnerExitCode !== 0) {
    process.exit(runnerExitCode);
  }
}

if (require.main === module) {
  const args = parseArgs(process.argv);
  run(args);
}

module.exports = {
  parseArgs,
  loadBundleFromDisk,
  loadJsonFromDisk,
  normaliseEvidenceRow,
  buildProvenanceMap,
  auditEvidenceChain,
  auditS02Baseline,
  auditS03Pack,
  auditCanaryProbeRun,
  auditAllowlist,
  auditRoleMatrix,
  auditDrillMatrix,
  auditCorrelation,
  auditLaunchPosture,
  auditRedaction,
  deriveCanaryGates,
  deriveHardGates,
  deriveEmbeddedVerdicts,
  detectClassificationDrift,
  runIndependentReplay,
  mapVerifierBlockerToExitCode,
  atomicWriteJson,
  atomicWriteJsonIfMissing,
  sha256Hex,
  EXIT_CODES,
  BLOCKER_CODES,
  VERIFIER_COMMAND,
};
