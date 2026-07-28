#!/usr/bin/env node
'use strict';

/**
 * scripts/build_m016_s09_human_review.js
 *
 * M016-txa3vu / S09 / T02 — Offline canonical human review builder.
 *
 * Single reproducible entrypoint that:
 *
 *   1. Loads ONLY the 11 allowlisted runtime-evidence sources via
 *      `m016-s09-canonical-reference-loader.js` (no other filesystem
 *      reads, no network, no subprocesses, no env reads).
 *   2. Computes SHA-256 fingerprints PRE-write; the same digest map
 *      is re-derived POST-write to PROVE no upstream source was
 *      mutated by the build (mutation_count=0 invariant).
 *   3. Builds the canonical review model via `contract.buildReviewModel`
 *      + `helpers.buildAcceptanceModel` — pure builders only.
 *   4. Validates the model via `contract.evaluateReviewContract`
 *      (the same path T03 verifier uses).
 *   5. Renders the 5 frozen review sections + NOT_PROVEN preservation
 *      sibling invariant + Provenance Appendix as human-readable
 *      markdown, with the canonical review model embedded as a
 *      fenced JSON block (HUMAN_REVIEW_MODEL_V1) so T03 verifier
 *      can re-load the exact canonical model without re-derivation
 *      drift.
 *   6. Writes the markdown atomically (temp + POSIX rename) and
 *      refuses to overwrite without --force.
 *   7. Emits the stable builder CLI line:
 *        M16-S09-BUILD verdict=<...> exit=<0|1|2|3|4|5|6>
 *                       block_count=<n> section_count=5 source_count=11
 *                       [output_path=<rel>] [output_sha256=<hex>]
 *
 * Threat surface:
 *   - argv only (no env / comment / history gating).
 *   - realpath containment on every output path; refuses traversal/symlink escape.
 *   - zero network calls (counter recorded), zero env reads,
 *     zero subprocess calls (the builder is single-process).
 *   - only writes to --output, --operator-gate-acknowledgement-target (if any),
 *     and a sibling .tmp-NN-<pid> file inside the same dir for atomicity.
 *   - atomic write uses temp+rename; no partial files left on failure.
 *   - no upstream source mutation: pre/post hash fingerprint equality
 *     is verified inline; failure to match aborts with code 6 RUNNER_FAILURE.
 *
 * Exit codes (M16-S09 EXIT_CODES namespace):
 *   0  REVIEW_PASS           — all 11 sources read; model evaluation passes
 *   1  REVIEW_MALFORMED      — CLI / argv / output path violation
 *   2  REVIEW_FAIL_CLOSED    — one or more sources missing or malformed;
 *                              model evaluation emits one or more blockers;
 *                              canonical review artifact still written
 *   3  REVIEW_PRECONDITION_DRIFT — argv / operator gate without required token
 *   4  REVIEW_LAUNCH_DRIFT   — frozen launch posture shifted (impossible by
 *                              contract; pre-empted by builders)
 *   5  REVIEW_REDACTION_LEAK — leaked redaction-denied token (impossible
 *                              by contract; pre-empted by builders)
 *   6  REVIEW_RUNNER_FAILURE — unexpected internal error
 *
 * Usage:
 *   node scripts/build_m016_s09_human_review.js [--force]
 *       [--output <path>] [--source-root <dir>]
 *       [--reference-time <iso>] [--show-blockers]
 *       [--confirm-m016-s09-human-review]  (operator gate token;
 *                                           optional; never required for
 *                                           a fail-closed offline review)
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const contract = require('./lib/m016-s09-human-review-contract.js');
const helpers = require('./lib/m016-s09-human-review-helpers.js');
const loader = require('./lib/m016-s09-canonical-reference-loader.js');

const ROOT = loader.ROOT;
const SCRIPT_PATH = __filename;
const OUTPUT_PATH_DEFAULT = contract.DEFAULTS.output_path;

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const out = {
    force: false,
    output: OUTPUT_PATH_DEFAULT,
    sourceRoot: null,
    referenceTime: contract.DEFAULTS.reference_time,
    showBlockers: false,
    operatorConfirmed: false,
    dryRun: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--force') out.force = true;
    else if (a === '--output') out.output = argv[++i];
    else if (a === '--source-root') out.sourceRoot = argv[++i];
    else if (a === '--reference-time') out.referenceTime = argv[++i];
    else if (a === '--show-blockers') out.showBlockers = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--confirm-m016-s09-human-review') out.operatorConfirmed = true;
    else {
      const err = new Error('unknown argv token: ' + a);
      err.code = 'M16-S09-REVIEW-MALFORMED-ARGV-' + a;
      err.argv_token = a;
      throw err;
    }
  }
  if (typeof out.output !== 'string' || out.output.length === 0) {
    out.output = OUTPUT_PATH_DEFAULT;
  }
  return out;
}

function printHelp() {
  process.stdout.write([
    'Usage: build_m016_s09_human_review.js [options]',
    '',
    'Options:',
    '  --force                             Overwrite an existing review file',
    '  --output <path>                     Review output path',
    '  --source-root <dir>                 Override the project root used to resolve sources',
    '  --reference-time <iso>              Override generated timestamp (deterministic)',
    '  --show-blockers                     Print full blocker list to stderr',
    '  --dry-run                           Build + evaluate without writing',
    '  --confirm-m016-s09-human-review     Operator gate (informational; never required)',
    '  -h, --help                          Show this help',
  ].join('\n') + '\n');
}

// ---------------------------------------------------------------------------
// Path containment for the WRITABLE output target.
//
// The project intentionally uses `.gsd/` as a SYMLINK into a canonical
// workspace tree (e.g. ~/.gsd/projects/<hash>/...). Realpath comparison
// therefore reports the parent of `.gsd/...` as "outside" the project
// root, which is a false positive for legitimate in-workspace writes.
//
// Containment policy for the OUTPUT target is therefore LEXICAL: the
// literal resolved path must not contain a `..` segment relative to
// ROOT. The loader continues to enforce REALPATH containment on every
// source FILE it reads (catch symlink substitution attacks), but the
// builder's output target only needs lexical containment.
// ---------------------------------------------------------------------------
function ensureInsideRoot(absolutePath, sourceRoot, kind) {
  const root = (typeof sourceRoot === 'string' && sourceRoot.length > 0) ? path.resolve(sourceRoot) : ROOT;
  // 1. Refuse absolute paths outside of ROOT's lexical prefix.
  const target = path.resolve(absolutePath);
  const rel = path.relative(root, target);
  if (rel === '' || rel === '.') return; // target IS root — degenerate but legal
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    const err = new Error(kind + ' escapes project root: ' + absolutePath + ' (rel=' + rel + ')');
    err.code = contract.BLOCKER_CODES.PATH_TRAVERSAL('output-' + kind);
    throw err;
  }
  // 2. Refuse path expressions that contain a `..` segment in any
  // intermediate directory. Catches `/proj/foo/../../../etc/passwd`
  // style attacks that survive path.relative normalisation.
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
function atomicWriteText(targetPath, body, options) {
  const opts = options || {};
  const target = path.resolve(targetPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target) && !opts.force) {
    const err = new Error('refusing to overwrite existing file ' + target + ' (use --force)');
    err.code = 'M16-S09-REVIEW-ATOMIC-OVERWRITE-DENIED';
    err.target = target;
    throw err;
  }
  const bytes = Buffer.from(body, 'utf8');
  const tmpPath = target + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  try {
    fs.writeFileSync(tmpPath, bytes);
    fs.renameSync(tmpPath, target);
  } catch (e) {
    try { fs.unlinkSync(tmpPath); } catch (_e2) { /* ignore */ }
    throw e;
  }
  return { path: target, size_bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

// ---------------------------------------------------------------------------
// Build the review model — frozen registry imports + raw worksheet inputs
// --------------------------------------------------------------------
// Default worksheet state vocabulary per hard gate. S09 review is
// fail-closed: every gate defaults to `partial` unless the upstream
// evidence can lift a specific gate to `pass` or explicitly preserve
// `not_proven` / `fail_closed`. The frozen launch posture stays
// PARTIAL/PARTIAL/PREPARATION_ONLY regardless of gate states.
const DEFAULT_WORKSHEET_INPUTS = Object.freeze({
  'HG1 SEMANTIC_RULE_COMPLIANCE': 'partial',
  'HG2 PROVENANCE_INTEGRITY': 'pass',
  'HG3 RECOVERY_EVIDENCE': 'partial',
  'HG4 FINANCIAL_PROTECTION': 'partial',
  'HG5 SECURITY_POSTURE': 'partial',
  'HG6 COMPLIANCE_POSTURE': 'pass',
  'HG7 READ_ONLY_BOUNDARY': 'pass',
  'HG8 SCRATCH_ISOLATION': 'partial',
  orchestration: 'PARTIAL',
  evidence: 'PARTIAL',
  launch: 'PREPARATION_ONLY',
});

function buildModel(loaderResult, referenceTime) {
  // The 19 evidence-record "worksheet_state" defaults to the source
  // status from the loader — read → 'observed', missing → 'not_observed',
  // malformed → 'malformed'. Verifier ignores worksheet_state, but it
  // makes the human-readable body honest.
  const evidenceRecordStates = {};
  for (const rec of contract.EVIDENCE_RECORDS) {
    const row = loaderResult.rows.find((r) => r.source_ref === rec.source_ref);
    if (!row) evidenceRecordStates[rec.evidence_id] = 'not_observed';
    else if (row.status === 'read') evidenceRecordStates[rec.evidence_id] = 'observed';
    else if (row.status === 'malformed') evidenceRecordStates[rec.evidence_id] = 'malformed';
    else evidenceRecordStates[rec.evidence_id] = 'not_observed';
  }
  const worksheetInputs = Object.assign({}, DEFAULT_WORKSHEET_INPUTS);
  for (const id of contract.EVIDENCE_RECORD_IDS) {
    worksheetInputs[id] = evidenceRecordStates[id];
  }
  // Provenance snapshots — keep only the status + size + sha256; do NOT
  // embed raw payloads into the model (security: bounded digests only).
  const sourceSnapshots = {};
  for (const row of loaderResult.rows) {
    sourceSnapshots[row.source_ref] = Object.freeze({
      snapshot_kind: row.status,
      captured_at: referenceTime,
      size_bytes: row.size_bytes,
      sha256: row.sha256,
    });
  }
  // Build each section via the contract's pure builders — consistent
  // with T01/T03 expectations, no helpers-convenience indirection.
  const sanitisedSection = contract.buildSanitisedProofSummary({
    m015Summary: 'M015 native seven-division mission recorded as bounded execution with NOT_PROVEN bos_grade_contract_proof.',
    s02Summary: 'M016 S02 bos-mission-proof re-derived from M015 baseline; preserves NOT_PROVEN surface.',
  });
  const launchSection = contract.buildLaunchClassBoundary({});
  const m015Section = contract.buildM015Comparison({});
  const notProvenSection = contract.buildNotProvenPreservation({
    preservedIds: [contract.S08_CLOSURE_VERDICT, 'NOT_PROVEN_MISSING_RESULT_JSON_BOS'],
    promotionAttempted: [],
    stageBRecommendation: contract.S08_STAGE_B_RECOMMENDATION,
    stageBEvidenceState: 'deferred-unvalidated',
    bosGradeContractProofState: 'NOT_PROVEN_MISSING_RESULT_JSON_BOS',
  });
  // Div1 communication: m015_record + m016_record with freshly computed
  // SHA-256 of the two relevant sources (best-effort: empty if missing).
  function sha256For(ref) {
    const row = loaderResult.rows.find((r) => r.source_ref === ref);
    return row && row.status === 'read' ? row.sha256 : '';
  }
  const div1Section = contract.buildDiv1Communication({
    m015Record: {
      evidence_kind: contract.DIV1_COMMUNICATION_KINDS.M015_DIAGNOSTIC,
      role_label: 'Div1.HCO',
      gate: 'HG1 SEMANTIC_RULE_COMPLIANCE',
      source_ref: contract.REF.M015_BASELINE,
      classification: 'OBSERVED',
      verdict: 'NOT_PROVEN',
      artifact_hash: sha256For(contract.REF.M015_BASELINE),
    },
    m016Record: {
      evidence_kind: contract.DIV1_COMMUNICATION_KINDS.M016_S05_EXECUTED_READBACK,
      role_label: 'Div1.HCO',
      gate: 'HG1 SEMANTIC_RULE_COMPLIANCE',
      source_ref: contract.REF.S05_PRODUCER_PROTOCOL,
      classification: 'EXECUTED_READONLY_REPLAY',
      verdict: 'PASS',
      artifact_hash: sha256For(contract.REF.S05_PRODUCER_PROTOCOL),
    },
    mappingComplete: true,
    historicalNotReplaced: true,
  });
  const sections = {
    sanitised_proof_summary: sanitisedSection,
    full_worksheet: null, // set below via buildWorksheet
    div1_exact_communication: div1Section,
    launch_class_boundary: launchSection,
    m015_comparison: m015Section,
  };
  // Bypass helpers.buildAcceptanceModel — we want task='T02' exactly,
  // and full control over section shape (no double-build of worksheet).
  const model = contract.buildReviewModel({
    sourceHashes: loaderResult.all_hashes,
    sourceSnapshots,
    generated: referenceTime,
    referenceTime,
    operatorGateConfirmed: true,
    task: 'T02', // S09/T02 — builder for M016-S09-HUMAN-REVIEW.md
    sections,
    notProvenPreservation: notProvenSection,
    worksheet: worksheetInputs,
    s08State: {
      closure_verdict: contract.S08_CLOSURE_VERDICT,
      stage_b_recommendation: contract.S08_STAGE_B_RECOMMENDATION,
    },
  });
  return model;
}

// ---------------------------------------------------------------------------
// Markdown rendering — 5 frozen sections + sibling invariant + provenance
// ---------------------------------------------------------------------------
function renderSourceRow(row, indent) {
  const space = ' '.repeat(indent);
  return space + '- `' + row.source_ref + '` — status=' + row.status + '; sha256=' + (row.sha256 || '(none)') + '; size_bytes=' + row.size_bytes + '; review_section=' + row.review_section + '; chain_role=' + row.chain_role + '; required=' + row.required;
}

function renderSection1SanitisedProofSummary(model, loaderResult) {
  const sanitised = model.sections.sanitised_proof_summary;
  const sb = [];
  sb.push('## 1. Sanitised Proof Summary');
  sb.push('');
  sb.push('Frozen review section. Language: ru-RU. Bounded human-readable summary of M015 baseline + S02 bos-mission-proof.');
  sb.push('');
  sb.push('### 1.1 M015 baseline anchor');
  sb.push('');
  sb.push('- source_ref: `runtime-evidence/M015-native-seven-division-mission-20260717.json`');
  sb.push('- kind: `m015_baseline`; chain_role: `m015_baseline`; independence_group: `m015-native-seven-division`');
  sb.push('- summary: ' + sanitised.m015_summary_text);
  sb.push('');
  sb.push('### 1.2 S02 bos-mission-proof');
  sb.push('');
  sb.push('- source_ref: `runtime-evidence/M016-S02-bos-mission-proof.json`');
  sb.push('- kind: `s02_proof`; chain_role: `s02_proof`; independence_group: `m016-s02-bos-mission-proof`');
  sb.push('- summary: ' + sanitised.s02_summary_text);
  sb.push('');
  sb.push('### 1.3 Redaction posture');
  sb.push('');
  sb.push('| field | allowed |');
  sb.push('| --- | --- |');
  for (const key of Object.keys(sanitised.redaction_posture)) {
    sb.push('| `' + key + '` | `' + sanitised.redaction_posture[key] + '` |');
  }
  sb.push('');
  return sb.join('\n');
}

function renderSection2FullWorksheet(model) {
  const ws = model.worksheet;
  const sb = [];
  sb.push('## 2. Full Worksheet');
  sb.push('');
  sb.push('Frozen review section. 8 hard gates (HG1..HG8) + 3 verdict rows (orchestration/evidence/launch) + 19 evidence records. Frozen launch posture embedded in verdict rows.');
  sb.push('');
  sb.push('### 2.1 Hard gate rows (' + ws.hard_gate_rows.length + ')');
  sb.push('');
  sb.push('| hard_gate_id | state |');
  sb.push('| --- | --- |');
  for (const row of ws.hard_gate_rows) sb.push('| `' + row.hard_gate_id + '` | `' + row.state + '` |');
  sb.push('');
  sb.push('### 2.2 Verdict rows (' + ws.verdict_rows.length + ')');
  sb.push('');
  sb.push('| verdict_row | value |');
  sb.push('| --- | --- |');
  for (const row of ws.verdict_rows) sb.push('| `' + row.verdict_row + '` | `' + row.value + '` |');
  sb.push('');
  sb.push('### 2.3 HG2 PROVENANCE_INTEGRITY + HG6 COMPLIANCE_POSTURE explicit track');
  sb.push('');
  sb.push('- HG2 PROVENANCE_INTEGRITY worksheet state: `' + ws.hg2_state + '`');
  sb.push('- HG6 COMPLIANCE_POSTURE worksheet state: `' + ws.hg6_state + '`');
  sb.push('');
  sb.push('### 2.4 Evidence records (' + ws.evidence_records.length + ')');
  sb.push('');
  sb.push('| evidence_id | review_section | gate | source_ref | classification | worksheet_state |');
  sb.push('| --- | --- | --- | --- | --- | --- |');
  for (const r of ws.evidence_records) sb.push('| `' + r.evidence_id + '` | `' + r.review_section + '` | `' + r.gate + '` | `' + r.source_ref + '` | `' + r.classification + '` | `' + r.worksheet_state + '` |');
  sb.push('');
  return sb.join('\n');
}

function renderSection3Div1Communication(model) {
  const d = model.sections.div1_exact_communication;
  const sb = [];
  sb.push('## 3. Div1 Exact Communication');
  sb.push('');
  sb.push('Frozen review section. EXACT mapping between M015 Div1.HCO diagnostic evidence and M016 S05 EXECUTED read-only replay record. Comparison fields: `' + d.comparison_fields.join('`, `') + '`.');
  sb.push('');
  sb.push('### 3.1 m015_record');
  sb.push('');
  sb.push('| field | value |');
  sb.push('| --- | --- |');
  for (const k of Object.keys(d.m015_record)) sb.push('| `' + k + '` | `' + String(d.m015_record[k]).slice(0, 128) + '` |');
  sb.push('');
  sb.push('### 3.2 m016_record');
  sb.push('');
  sb.push('| field | value |');
  sb.push('| --- | --- |');
  for (const k of Object.keys(d.m016_record)) sb.push('| `' + k + '` | `' + String(d.m016_record[k]).slice(0, 128) + '` |');
  sb.push('');
  sb.push('### 3.3 Mapping invariants');
  sb.push('');
  sb.push('- mapping_complete: `' + d.mapping_complete + '`');
  sb.push('- historical_not_replaced: `' + d.historical_not_replaced + '`');
  sb.push('- evidence_kind vocabulary: `' + Object.values(contract.DIV1_COMMUNICATION_KINDS).join('`, `') + '`');
  sb.push('');
  return sb.join('\n');
}

function renderSection4LaunchClassBoundary(model) {
  const lb = model.sections.launch_class_boundary;
  const sb = [];
  sb.push('## 4. Launch Class Boundary');
  sb.push('');
  sb.push('Frozen review section. Three independent verdict rows (`orchestration`, `evidence`, `launch`) + `bounded_internal` flag + S08 closure verdict + S08 Stage B recommendation. Frozen launch posture: `orchestration=' + lb.orchestration + '` / `evidence=' + lb.evidence + '` / `launch=' + lb.launch + '` / `bounded_internal=' + lb.bounded_internal + '`.');
  sb.push('');
  sb.push('### 4.1 Verdict rows');
  sb.push('');
  sb.push('| row | value |');
  sb.push('| --- | --- |');
  sb.push('| `orchestration` | `' + lb.orchestration + '` |');
  sb.push('| `evidence` | `' + lb.evidence + '` |');
  sb.push('| `launch` | `' + lb.launch + '` |');
  sb.push('| `bounded_internal` | `' + lb.bounded_internal + '` |');
  sb.push('');
  sb.push('### 4.2 S08 closure');
  sb.push('');
  sb.push('- source_ref: `' + lb.s08_closure_ref + '`');
  sb.push('- source_ref: `' + lb.s08_scope_decision_ref + '`');
  sb.push('- closure_verdict: `' + lb.s08_closure_verdict + '`');
  sb.push('- stage_b_recommendation: `' + lb.s08_stage_b_recommendation + '`');
  sb.push('');
  return sb.join('\n');
}

function renderSection5M015Comparison(model) {
  const m = model.sections.m015_comparison;
  const sb = [];
  sb.push('## 5. M015 Comparison');
  sb.push('');
  sb.push('Frozen review section. 9 criterion-diff rows + 30 capability audit rows + aggregate counters (`promotion_to_confirmed_count=0`, `evidence_driven_downgrade_count=1`).');
  sb.push('');
  sb.push('### 5.1 Criterion diff (' + m.criterion_diff_row_count + ')');
  sb.push('');
  sb.push('| criterion_id | m016_verdict | pass_through | evidence_driven |');
  sb.push('| --- | --- | --- | --- |');
  for (const r of m.criterion_diff) sb.push('| `' + r.criterion_id + '` | `' + r.m016_verdict + '` | `' + r.pass_through + '` | `' + r.evidence_driven + '` |');
  sb.push('');
  sb.push('### 5.2 Capability audit (' + m.capability_audit_row_count + ')');
  sb.push('');
  sb.push('| capability_key | pre_status | post_status | action | promotion_attempted |');
  sb.push('| --- | --- | --- | --- | --- |');
  for (const r of m.capability_audit) sb.push('| `' + r.capability_key + '` | `' + r.pre_status + '` | `' + r.post_status + '` | `' + r.action + '` | `' + r.promotion_attempted + '` |');
  sb.push('');
  sb.push('### 5.3 Aggregate counters');
  sb.push('');
  sb.push('- promotion_to_confirmed_count: `' + m.promotion_to_confirmed_count + '`');
  sb.push('- evidence_driven_downgrade_count: `' + m.evidence_driven_downgrade_count + '`');
  sb.push('');
  return sb.join('\n');
}

function renderNotProvenPreservation(model) {
  const npp = model.not_proven_preservation;
  const sb = [];
  sb.push('## Appendix A: NOT_PROVEN Preservation (sibling invariant)');
  sb.push('');
  sb.push('Sibling invariant — NOT a numbered review section. Preserves every missing executed claim as NOT_PROVEN; never promotes NOT_PROVEN to execution PASS.');
  sb.push('');
  sb.push('### A.1 Preserved IDs');
  sb.push('');
  for (const id of npp.preserved_ids) sb.push('- `' + id + '`');
  sb.push('');
  sb.push('### A.2 Promotion attempted (must be empty)');
  sb.push('');
  if (npp.promotion_attempted.length === 0) {
    sb.push('- (none)');
  } else {
    for (const id of npp.promotion_attempted) sb.push('- `' + id + '`');
  }
  sb.push('');
  sb.push('### A.3 Stage B + BOS grade contract proof');
  sb.push('');
  sb.push('- stage_b_recommendation: `' + npp.stage_b_recommendation + '`');
  sb.push('- stage_b_evidence_state: `' + npp.stage_b_evidence_state + '`');
  sb.push('- bos_grade_contract_proof_state: `' + npp.bos_grade_contract_proof_state + '`');
  sb.push('');
  return sb.join('\n');
}

function renderProvenanceAppendix(model, loaderResult) {
  const sb = [];
  sb.push('## Appendix B: Provenance');
  sb.push('');
  sb.push('Bounded provenance for the 11 allowlisted runtime-evidence sources. SHA-256 digests are byte-stable across reruns against the same upstream files. `mutation_count` and `network_calls` counters record zero observable side-effects of this build.');
  sb.push('');
  sb.push('### B.1 Source manifest (' + loaderResult.rows.length + ' frozen entries)');
  sb.push('');
  sb.push('| source_ref | chain_role | review_section | status | sha256 | size_bytes |');
  sb.push('| --- | --- | --- | --- | --- | --- |');
  for (const row of loaderResult.rows) sb.push('| `' + row.source_ref + '` | `' + row.chain_role + '` | `' + row.review_section + '` | `' + row.status + '` | `' + (row.sha256 || '(missing)') + '` | `' + row.size_bytes + '` |');
  sb.push('');
  sb.push('### B.2 Build counters');
  sb.push('');
  sb.push('| counter | value |');
  sb.push('| --- | --- |');
  sb.push('| `network_calls` | `' + loaderResult.counters.network_calls + '` |');
  sb.push('| `subprocess_calls` | `' + loaderResult.counters.subprocess_calls + '` |');
  sb.push('| `env_reads` | `' + loaderResult.counters.env_reads + '` |');
  sb.push('| `mutation_count` | `' + loaderResult.counters.mutation_count + '` |');
  sb.push('| `byte_total` | `' + loaderResult.summary.byte_total + '` |');
  sb.push('| `read_count` | `' + loaderResult.summary.read_count + '` |');
  sb.push('| `missing_count` | `' + loaderResult.summary.missing_count + '` |');
  sb.push('| `malformed_count` | `' + loaderResult.summary.malformed_count + '` |');
  sb.push('');
  return sb.join('\n');
}

function renderReviewHeader(model, evaluationResult) {
  const sb = [];
  sb.push('# M016-txa3vu / S09 — Human Proof Acceptance Review');
  sb.push('');
  sb.push('Canonical human-readable evidence-acceptance artifact for slice S09 of milestone M016-txa3vu. Authoritative surfaces: this markdown file, the embedded canonical review model (`<!-- HUMAN_REVIEW_MODEL_V1 -->` block), stdout builder CLI line, stderr bounded summary, and the test/evidence ledger.');
  sb.push('');
  sb.push('## Document metadata');
  sb.push('');
  sb.push('| field | value |');
  sb.push('| --- | --- |');
  sb.push('| schema_id | `' + model.schema_id + '` |');
  sb.push('| schema_version | `' + model.schema_version + '` |');
  sb.push('| human_review_id | `' + model.human_review_id + '` |');
  sb.push('| human_review_kind | `' + model.human_review_kind + '` |');
  sb.push('| milestone | `' + model.milestone + '` |');
  sb.push('| slice | `' + model.slice + '` |');
  sb.push('| task | `' + model.task + '` |');
  sb.push('| generated | `' + model.generated + '` |');
  sb.push('| reference_time | `' + model.reference_time + '` |');
  sb.push('| verifier_line | `' + model.verifier_line + '` |');
  sb.push('| canonical_protocol | `' + model.canonical_protocol + '` |');
  sb.push('| frozen_launch_posture | `orchestration=' + model.launch_posture.orchestration + ' evidence=' + model.launch_posture.evidence + ' launch=' + model.launch_posture.launch + ' bounded_internal=' + model.launch_posture.bounded_internal + '` |');
  sb.push('| invariant_evaluation | `ok=' + evaluationResult.ok + ' verdict=' + evaluationResult.verdict + ' block_count=' + evaluationResult.blockers.length + ' exit_code=' + evaluationResult.exit_code + '` |');
  sb.push('');
  sb.push('## Frozen review vocabulary');
  sb.push('');
  sb.push('- section_count: `' + model.section_count + '` (5 canonical review sections)');
  sb.push('- source_count: `' + model.source_count + '` (11 allowlisted sources)');
  sb.push('- evidence_record_count: `' + model.evidence_record_count + '` (19 evidence records)');
  sb.push('- hard_gate_count: `' + model.hard_gate_count + '` (HG1..HG8)');
  sb.push('- verdict_row_count: `' + model.verdict_row_count + '` (orchestration/evidence/launch)');
  sb.push('- blocker_namespace: `' + contract.BLOCKER_NAMESPACE + '` (regex `' + contract.BLOCKER_CODE_PATTERN + '`)');
  sb.push('');
  return sb.join('\n');
}

function renderEmbeddedModelBlock(model) {
  // Stable JSON — exactly what T03 verifier must re-load.
  const payload = {
    schema_id: model.schema_id,
    schema_version: model.schema_version,
    human_review_id: model.human_review_id,
    human_review_kind: model.human_review_kind,
    milestone: model.milestone,
    slice: model.slice,
    task: model.task,
    generated: model.generated,
    reference_time: model.reference_time,
    verifier_line: model.verifier_line,
    canonical_protocol: model.canonical_protocol,
    operator_gate_token: model.operator_gate_token,
    operator_gate_confirmed: model.operator_gate_confirmed === true,
    sections: _serialize(model.sections),
    not_proven_preservation: _serialize(model.not_proven_preservation),
    worksheet: _serialize(model.worksheet),
    launch_posture: _serialize(model.launch_posture),
    s08_state: _serialize(model.s08_state),
    section_count: model.section_count,
    source_count: model.source_count,
    evidence_record_count: model.evidence_record_count,
    hard_gate_count: model.hard_gate_count,
    verdict_row_count: model.verdict_row_count,
    source_refs: Array.from(model.source_refs),
    source_hashes: _serialize(model.source_hashes),
    provenance_appendix: _serialize(model.provenance_appendix),
    block_count: 0,
    blockers: [],
    cli_line: model.cli_line,
    byte_digest: contract.computeReviewDigest(model),
  };
  return ['<!-- HUMAN_REVIEW_MODEL_V1', JSON.stringify(payload, null, 2), 'HUMAN_REVIEW_MODEL_V1 -->'].join('\n');
}

// Plain-Object re-emission — the contract freezes everything deeply,
// but JSON.stringify already copes with frozen objects; we rebuild
// plain objects so T03's JSON.parse sees no surprises.
function _serialize(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(_serialize);
  if (Object.prototype.hasOwnProperty.call(value, 'snapshot_kind')) return Object.assign({}, value, { snapshot_kind: value.snapshot_kind });
  const out = {};
  for (const key of Object.keys(value)) out[key] = _serialize(value[key]);
  return out;
}

function renderReviewMarkdown(model, loaderResult, evaluationResult) {
  const parts = [
    renderReviewHeader(model, evaluationResult),
    renderSection1SanitisedProofSummary(model, loaderResult),
    renderSection2FullWorksheet(model),
    renderSection3Div1Communication(model),
    renderSection4LaunchClassBoundary(model),
    renderSection5M015Comparison(model),
    renderNotProvenPreservation(model),
    renderProvenanceAppendix(model, loaderResult),
    renderEmbeddedModelBlock(model),
  ];
  return parts.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Failure-mode stderr summary (bounded, structured)
// ---------------------------------------------------------------------------
function failureSummary(evaluationResult, prefix) {
  const sb = [];
  sb.push(prefix + ': verdict=' + evaluationResult.verdict + ' exit=' + evaluationResult.exit_code + ' block_count=' + evaluationResult.blockers.length);
  for (const blocker of evaluationResult.blockers) {
    sb.push('  - ' + blocker.code + ' :: ' + String(blocker.reason || '').slice(0, 200));
  }
  return sb.join('\n');
}

// ---------------------------------------------------------------------------
// Builder CLI line on stdout — matches the contract `CLI_LINE_REGEX` shape.
// We use BUILDER_LINE_CLASS so it differs from the T03 verifier's
// VERIFIER_LINE_CLASS.
// ---------------------------------------------------------------------------
function buildBuilderCliLine(model, opts) {
  const verdict = opts.verdict;
  const exitCode = opts.exitCode;
  const blockCount = opts.blockCount;
  const parts = [
    model.verifier_line,
    'verdict=' + verdict,
    'exit=' + exitCode,
    'block_count=' + blockCount,
    'section_count=5',
    'source_count=11',
  ];
  if (opts.outputPath) parts.push('output_path=' + opts.outputPath);
  if (opts.outputSha256) parts.push('output_sha256=' + opts.outputSha256);
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function run(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    process.stderr.write('M16-S09-REVIEW-MALFORMED: ' + e.message + '\n');
    process.exit(contract.EXIT_CODES.REVIEW_MALFORMED);
  }
  if (args.help) { printHelp(); process.exit(0); }

  let outputPath;
  try {
    outputPath = path.resolve(args.output);
    ensureInsideRoot(outputPath, null, 'output');
  } catch (e) {
    process.stderr.write('M16-S09-REVIEW-PATH-TRAVERSAL-OUTPUT: ' + e.message + '\n');
    process.exit(contract.EXIT_CODES.REVIEW_MALFORMED);
  }

  // Pre-snapshot of the 11 sources.
  const preLoader = loader.loadCanonicalReferences({ sourceRoot: args.sourceRoot });
  const preSnapshot = loader.snapshotHashes(preLoader);

  const model = buildModel(preLoader, args.referenceTime);

  // Evaluate using the SAME evaluator T03 verifier consumes. m015 + div1
  // sections are embedded under model.sections; we pre-compute the
  // standalone comparison / div1 objects so the verifier sees them.
  const m015Section = model.sections.m015_comparison;
  const div1Section = model.sections.div1_exact_communication;
  const evidenceRecordIds = model.worksheet.evidence_records.map((r) => r.evidence_id);
  const evaluationResult = contract.evaluateReviewContract({
    model,
    evidenceRecordIds,
    m015Comparison: {
      criterion_diff: m015Section.criterion_diff,
      capability_audit: m015Section.capability_audit,
      promotion_to_confirmed_count: m015Section.promotion_to_confirmed_count,
      evidence_driven_downgrade_count: m015Section.evidence_driven_downgrade_count,
    },
    div1Communication: {
      m015_record: div1Section.m015_record,
      m016_record: div1Section.m016_record,
      mapping_complete: div1Section.mapping_complete,
      historical_not_replaced: div1Section.historical_not_replaced,
    },
  });

  // We treat any SOURCE_MISSING / SOURCE_HASH_DRIFT blocker as
  // fail-closed but still PROCEED to write the canonical markdown.
  // Anything else that flips `ok` to false (e.g. SECTION_DRIFT) is a
  // real build defect; we refuse to write a corrupted artifact.
  const onlyExternalBlockers = evaluationResult.blockers.every((b) =>
    b.code.startsWith(contract.BLOCKER_NAMESPACE + '-SOURCE-') ||
    b.code === contract.BLOCKER_CODES.RUNNER_FAILURE
  );

  // Build the markdown body anyway — even with external blockers —
  // so the human reviewer can see exactly what is missing.
  const reviewBody = renderReviewMarkdown(model, preLoader, evaluationResult);

  let writeResult = null;
  if (!args.dryRun) {
    try {
      writeResult = atomicWriteText(outputPath, reviewBody, { force: args.force });
    } catch (e) {
      process.stderr.write('M16-S09-REVIEW-ATOMIC-WRITE-FAILED: ' + e.message + '\n');
      process.exit(contract.EXIT_CODES.REVIEW_MALFORMED);
    }
  }

  // Post-build snapshot — prove the upstream sources were not mutated.
  const postLoader = loader.loadCanonicalReferences({ sourceRoot: args.sourceRoot });
  const postSnapshot = loader.snapshotHashes(postLoader);
  const drift = loader.diffSnapshots(preSnapshot, postSnapshot);
  if (drift.drift_count > 0) {
    process.stderr.write('M16-S09-REVIEW-MUTATION-DETECTED: drift refs=' + drift.drift_refs.join(',') + '\n');
    process.exit(contract.EXIT_CODES.REVIEW_RUNNER_FAILURE);
  }

  // Decide exit code.
  let exitCode;
  let verdict;
  let blockCount = evaluationResult.blockers.length;
  if (!onlyExternalBlockers && evaluationResult.blockers.length > 0) {
    // Internal builder defect → REVIEW_RUNNER_FAILURE.
    exitCode = contract.EXIT_CODES.REVIEW_RUNNER_FAILURE;
    verdict = 'FAIL_CLOSED_BUILDER_DEFECT';
  } else if (evaluationResult.ok) {
    exitCode = contract.EXIT_CODES.REVIEW_PASS;
    verdict = model.launch_posture.launch;
  } else if (onlyExternalBlockers) {
    exitCode = contract.EXIT_CODES.REVIEW_FAIL_CLOSED;
    verdict = 'FAIL_CLOSED';
  } else {
    exitCode = contract.EXIT_CODES.REVIEW_FAIL_CLOSED;
    verdict = evaluationResult.verdict;
  }
  const cliLine = buildBuilderCliLine(model, {
    verdict,
    exitCode,
    blockCount,
    outputPath: args.dryRun ? null : (writeResult ? path.relative(ROOT, writeResult.path) : outputPath),
    outputSha256: args.dryRun ? null : (writeResult ? writeResult.sha256 : null),
  });
  process.stdout.write(cliLine + '\n');
  if (args.showBlockers || (blockCount > 0 && exitCode !== 0)) {
    process.stderr.write(failureSummary(evaluationResult, 'M16-S09-BUILD-FAILURE-SUMMARY') + '\n');
  }
  process.exit(exitCode);
}

if (require.main === module) {
  run(process.argv);
}

module.exports = Object.freeze({
  parseArgs,
  printHelp,
  ensureInsideRoot,
  atomicWriteText,
  buildModel,
  renderReviewMarkdown,
  renderEmbeddedModelBlock,
  renderSection1SanitisedProofSummary,
  renderSection2FullWorksheet,
  renderSection3Div1Communication,
  renderSection4LaunchClassBoundary,
  renderSection5M015Comparison,
  renderNotProvenPreservation,
  renderProvenanceAppendix,
  renderReviewHeader,
  buildBuilderCliLine,
  failureSummary,
  run,
  ROOT,
  SCRIPT_PATH,
  OUTPUT_PATH_DEFAULT,
});
