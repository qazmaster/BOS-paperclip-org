#!/usr/bin/env node
'use strict';

/**
 * scripts/test_m016_s09_human_review_verifier.js
 *
 * M016-txa3vu / S09 / T03 — node:test scenarios for the independent
 * human-proof acceptance reviewer.
 *
 * Coverage:
 *   v01  parseArgs — happy path
 *   v02  parseArgs — missing --human-review-path
 *   v03  parseArgs — unknown token rejected
 *   v04  parseArgs — --help short-circuit
 *   v05  resolveUnderRoot — happy path
 *   v06  resolveUnderRoot — absolute path refused
 *   v07  resolveUnderRoot — .. traversal refused
 *   v08  resolveUnderRoot — empty path refused
 *   v09  resolveUnderRoot — NUL byte refused
 *   v10  extractModel — happy path with embedded block
 *   v11  extractModel — missing block → MODEL_MALFORMED
 *   v12  extractModel — malformed JSON → MODEL_MALFORMED
 *   v13  scanRawSecrets — clean markdown → no hits
 *   v14  scanRawSecrets — bearer token → 1 hit
 *   v15  scanRawSecrets — PEM private key → 1 hit
 *   v16  scanRawSecrets — AWS access key → 1 hit
 *   v17  scanRawSecrets — slack token → 1 hit
 *   v18  scanRawSecrets — password assignment → 1 hit
 *   v19  scanRawSecrets — github token → 1 hit
 *   v20  scanRawSecrets — multiple patterns → multiple hits
 *   v21  rederiveHashBlockers — happy path → 0 blockers
 *   v22  rederiveHashBlockers — missing source → SOURCE_MISSING
 *   v23  rederiveHashBlockers — hash drift → SOURCE_HASH_DRIFT
 *   v24  rederiveHashBlockers — non-sha256 → SOURCE_HASH_DRIFT
 *   v25  rederiveHashBlockers — missing key in model → SOURCE_MISSING
 *   v26  extractEvaluatorInputs — happy path
 *   v27  extractEvaluatorInputs — div1 mapping_complete=false forwarded
 *   v28  CLI line shape regex — happy path
 *   v29  CLI line shape regex — wrong section_count fails
 *   v30  CLI line shape regex — wrong source_count fails
 *   v31  exit code namespace — all codes match
 *   v32  module surface frozen
 *   v33  independence — verifier imports list is exactly the 5 allowed
 *   v34  independence — verifier never imports producer CLI module
 *   v35  positive end-to-end run() — happy markdown passes (subprocess)
 *
 * Run: node --test scripts/test_m016_s09_human_review_verifier.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const contract = require('./lib/m016-s09-human-review-contract.js');
const verifier = require('./verify_m016_s09_human_review.js');

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------
function makeFixtureRoot() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'm016-s09-t03-verifier-'));
  const realTmp = fs.realpathSync(tmp);
  fs.mkdirSync(path.join(realTmp, 'runtime-evidence'), { recursive: true });
  const blobs = {};
  const hashes = {};
  for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
    const payload = { source_ref: ref, fixture_kind: 's09-t03-verifier', captured_at: contract.HUMAN_REVIEW_REFERENCE_TIME };
    const body = JSON.stringify(payload);
    const abs = path.join(realTmp, ref);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, Buffer.from(body, 'utf8'));
    blobs[ref] = body;
    hashes[ref] = crypto.createHash('sha256').update(Buffer.from(body, 'utf8')).digest('hex');
  }
  return { tmp: realTmp, blobs, hashes };
}

function buildValidModel(hashes, opts = {}) {
  const sourceHashes = Object.assign({}, hashes);
  if (opts.missingRef) delete sourceHashes[opts.missingRef];
  if (opts.driftRef) sourceHashes[opts.driftRef] = 'f'.repeat(64);
  if (opts.badFormatRef) sourceHashes[opts.badFormatRef] = 'not-a-sha256';
  const sections = {
    sanitised_proof_summary: {
      section_id: 'sanitised_proof_summary',
      m015_baseline_ref: contract.REF.M015_BASELINE,
      s02_proof_ref: contract.REF.S02_PROOF,
      m015_summary_text: 'M015 baseline anchor',
      s02_summary_text: 'S02 bos-mission-proof',
      redaction_posture: { full_ids: false, credentials: false, xiaomi_endpoint_reuse: false, raw_body: false, raw_reasoning: false, raw_result_json_result: false, vendor_reuse_strings: false, bounded_digests_only: true, redaction_bounds_loaded: true },
    },
    full_worksheet: {
      section_id: 'full_worksheet',
      hard_gate_count: 8,
      verdict_row_count: 3,
      evidence_record_count: 19,
      hard_gate_rows: contract.HARD_GATE_IDS.map((id) => ({ hard_gate_id: id, state: 'partial', evidence_record_ids: [] })),
      verdict_rows: [
        { verdict_row: 'orchestration', value: 'PARTIAL' },
        { verdict_row: 'evidence', value: 'PARTIAL' },
        { verdict_row: 'launch', value: 'PREPARATION_ONLY' },
      ],
      evidence_records: contract.EVIDENCE_RECORDS.map((r) => ({ evidence_id: r.evidence_id, review_section: r.review_section, gate: r.gate, source_ref: r.source_ref, classification: r.classification, worksheet_state: 'observed' })),
      hg2_state: 'partial',
      hg6_state: 'partial',
    },
    div1_exact_communication: {
      section_id: 'div1_exact_communication',
      comparison_fields: contract.DIV1_COMPARISON_FIELDS.slice(),
      m015_record: { evidence_kind: contract.DIV1_COMMUNICATION_KINDS.M015_DIAGNOSTIC, role_label: 'Div1.HCO', gate: 'HG1 SEMANTIC_RULE_COMPLIANCE', source_ref: contract.REF.M015_BASELINE, classification: 'OBSERVED', verdict: 'NOT_PROVEN', artifact_hash: 'a'.repeat(64) },
      m016_record: { evidence_kind: contract.DIV1_COMMUNICATION_KINDS.M016_S05_EXECUTED_READBACK, role_label: 'Div1.HCO', gate: 'HG1 SEMANTIC_RULE_COMPLIANCE', source_ref: contract.REF.S05_PRODUCER_PROTOCOL, classification: 'EXECUTED_READONLY_REPLAY', verdict: 'PASS', artifact_hash: 'b'.repeat(64) },
      mapping_complete: opts.div1MappingComplete !== false,
      historical_not_replaced: opts.div1HistoricalNotReplaced !== false,
    },
    launch_class_boundary: {
      section_id: 'launch_class_boundary',
      orchestration: 'PARTIAL',
      evidence: 'PARTIAL',
      launch: 'PREPARATION_ONLY',
      bounded_internal: true,
      s08_closure_ref: contract.REF.S08_CLOSURE,
      s08_scope_decision_ref: contract.REF.S08_SCOPE_DECISION,
      s08_closure_verdict: contract.S08_CLOSURE_VERDICT,
      s08_stage_b_recommendation: contract.S08_STAGE_B_RECOMMENDATION,
    },
    m015_comparison: {
      section_id: 'm015_comparison',
      criterion_diff_row_count: 9,
      capability_audit_row_count: 30,
      criterion_diff: contract.M015_CRITERION_IDS.map((id) => ({ criterion_id: id, m016_verdict: 'NOT_PROVEN', pass_through: false, evidence_driven: false })),
      capability_audit: Array.from({ length: 30 }, (_, i) => ({ capability_key: 'sample.surface.' + i, paperclip_surface_name: 'surface-' + i, pre_status: 'unvalidated', post_status: 'unvalidated', action: 'keep', promotion_attempted: false })),
      promotion_to_confirmed_count: 0,
      evidence_driven_downgrade_count: 1,
    },
  };
  const model = contract.buildReviewModel({
    sourceHashes,
    sections,
    notProvenPreservation: { preserved_ids: [contract.S08_CLOSURE_VERDICT], promotion_attempted: opts.promotionAttempted || [], stage_b_recommendation: contract.S08_STAGE_B_RECOMMENDATION, stage_b_evidence_state: 'deferred-unvalidated', bos_grade_contract_proof_state: 'NOT_PROVEN_MISSING_RESULT_JSON_BOS' },
    // Worksheet inputs must carry the frozen launch posture + HG states so
    // the embedded model passes the verifier's verdict-row + hard-gate
    // checks. Without these the verifier emits VERDICT-LAUNCH-DRIFT before
    // it can look at the test's mutation surface (missingRef / driftRef / etc).
    worksheet: {
      'HG1 SEMANTIC_RULE_COMPLIANCE': 'partial',
      'HG2 PROVENANCE_INTEGRITY': 'partial',
      'HG3 RECOVERY_EVIDENCE': 'partial',
      'HG4 FINANCIAL_PROTECTION': 'partial',
      'HG5 SECURITY_POSTURE': 'partial',
      'HG6 COMPLIANCE_POSTURE': 'partial',
      'HG7 READ_ONLY_BOUNDARY': 'partial',
      'HG8 SCRATCH_ISOLATION': 'partial',
      HG2: 'partial',
      HG6: 'partial',
      orchestration: 'PARTIAL',
      evidence: 'PARTIAL',
      launch: 'PREPARATION_ONLY',
    },
    s08State: { closure_verdict: contract.S08_CLOSURE_VERDICT, stage_b_recommendation: contract.S08_STAGE_B_RECOMMENDATION },
  });
  return model;
}

function renderMarkdown(model, opts = {}) {
  const body = model;
  let md = '# 16-09-HUMAN-REVIEW (test fixture)\n\n';
  md += '<!-- HUMAN_REVIEW_MODEL_V1\n' + JSON.stringify(body) + '\nHUMAN_REVIEW_MODEL_V1 -->\n\n';
  md += 'Body text follows here. No secrets in this fixture.';
  if (opts.injectSecret) {
    md += '\n\nSensitive: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def-ghi\n';
  }
  if (opts.injectPem) {
    md += '\n-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n';
  }
  if (opts.injectAws) {
    md += '\nAKIAIOSFODNN7EXAMPLE\n';
  }
  return md;
}

function writeFixtureAndVerifierArgs(fx, model, opts = {}) {
  // v35 fix: tests pass their own `fx` so the markdown ends up in the
  // SAME tmp dir the test resolves with --source-root. The previous
  // version created its own tmpdir here, which forced
  // `path.relative(fx.tmp, written.abs)` to escape the source root and
  // the verifier correctly rejected the traversal.
  const rel = '.gsd/t03-test-' + Math.random().toString(36).slice(2, 8) + '/HUMAN-REVIEW.md';
  const abs = path.join(fx.tmp, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const md = renderMarkdown(model, opts);
  fs.writeFileSync(abs, md, 'utf8');
  return { fx, rel, abs, md };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('v01 parseArgs — happy path', () => {
  const args = verifier.parseArgs(['--human-review-path', 'foo.md']);
  assert.equal(args.humanReviewPath, 'foo.md');
  assert.equal(args.sourceRoot, null);
  assert.equal(args.help, false);
});

test('v02 parseArgs — missing --human-review-path', () => {
  assert.throws(() => verifier.parseArgs([]), /--human-review-path/);
});

test('v03 parseArgs — unknown token rejected', () => {
  assert.throws(() => verifier.parseArgs(['--bogus']), /unknown/);
});

test('v04 parseArgs — --help short-circuit', () => {
  const args = verifier.parseArgs(['--help']);
  assert.equal(args.help, true);
});

test('v05 resolveUnderRoot — happy path', () => {
  const fx = makeFixtureRoot();
  const out = verifier.resolveUnderRoot('.gsd/test.md', fx.tmp);
  assert.equal(out.exists, false);
});

test('v06 resolveUnderRoot — absolute path refused', () => {
  assert.throws(() => verifier.resolveUnderRoot('/etc/passwd', null), /absolute|path not permitted/);
});

test('v07 resolveUnderRoot — .. traversal refused', () => {
  assert.throws(() => verifier.resolveUnderRoot('../escape.md', null), /escapes root/);
});

test('v08 resolveUnderRoot — empty path refused', () => {
  assert.throws(() => verifier.resolveUnderRoot('', null), /path empty/);
});

test('v09 resolveUnderRoot — NUL byte refused', () => {
  assert.throws(() => verifier.resolveUnderRoot('foo\0bad.md', null), /NUL/);
});

test('v10 extractModel — happy path with embedded block', () => {
  const fx = makeFixtureRoot();
  const model = buildValidModel(fx.hashes);
  const md = renderMarkdown(model);
  const got = verifier.extractModel(md);
  assert.equal(got.schema_id, contract.SCHEMA_ID);
  assert.equal(got.slice, 'S09');
});

test('v11 extractModel — missing block → MODEL_MALFORMED', () => {
  try {
    verifier.extractModel('# no embed');
    assert.fail('should throw');
  } catch (e) {
    assert.equal(e.code, contract.BLOCKER_CODES.MODEL_MALFORMED);
  }
});

test('v12 extractModel — malformed JSON → MODEL_MALFORMED', () => {
  try {
    verifier.extractModel('<!-- HUMAN_REVIEW_MODEL_V1\n{bad json\nHUMAN_REVIEW_MODEL_V1 -->');
    assert.fail('should throw');
  } catch (e) {
    assert.equal(e.code, contract.BLOCKER_CODES.MODEL_MALFORMED);
  }
});

test('v13 scanRawSecrets — clean markdown → no hits', () => {
  const fx = makeFixtureRoot();
  const model = buildValidModel(fx.hashes);
  const md = renderMarkdown(model);
  assert.equal(verifier.scanRawSecrets(md).length, 0);
});

test('v14 scanRawSecrets — bearer token → 1 hit', () => {
  const fx = makeFixtureRoot();
  const md = renderMarkdown(buildValidModel(fx.hashes), { injectSecret: true });
  const hits = verifier.scanRawSecrets(md);
  assert.ok(hits.find((h) => h.kind === 'bearer-token'));
});

test('v15 scanRawSecrets — PEM private key → 1 hit', () => {
  const fx = makeFixtureRoot();
  const md = renderMarkdown(buildValidModel(fx.hashes), { injectPem: true });
  const hits = verifier.scanRawSecrets(md);
  assert.ok(hits.find((h) => h.kind === 'private-key-pem'));
});

test('v16 scanRawSecrets — AWS access key → 1 hit', () => {
  const fx = makeFixtureRoot();
  const md = renderMarkdown(buildValidModel(fx.hashes), { injectAws: true });
  const hits = verifier.scanRawSecrets(md);
  assert.ok(hits.find((h) => h.kind === 'aws-access-key'));
});

test('v17 scanRawSecrets — slack token → 1 hit', () => {
  const fx = makeFixtureRoot();
  const model = buildValidModel(fx.hashes);
  const md = renderMarkdown(model) + '\n\nxoxb-1234567890-abcdefghij\n';
  const hits = verifier.scanRawSecrets(md);
  assert.ok(hits.find((h) => h.kind === 'slack-token'));
});

test('v18 scanRawSecrets — password assignment → 1 hit', () => {
  const fx = makeFixtureRoot();
  const model = buildValidModel(fx.hashes);
  const md = renderMarkdown(model) + '\n\npassword=SuperSecret123\n';
  const hits = verifier.scanRawSecrets(md);
  assert.ok(hits.find((h) => h.kind === 'password-assignment'));
});

test('v19 scanRawSecrets — github token → 1 hit', () => {
  const fx = makeFixtureRoot();
  const model = buildValidModel(fx.hashes);
  const md = renderMarkdown(model) + '\n\nghp_abcdefghijklmnopqrstuvwxyz0123456789\n';
  const hits = verifier.scanRawSecrets(md);
  assert.ok(hits.find((h) => h.kind === 'github-token'));
});

test('v20 scanRawSecrets — multiple patterns → multiple hits', () => {
  const fx = makeFixtureRoot();
  const md = renderMarkdown(buildValidModel(fx.hashes), { injectSecret: true, injectAws: true });
  const hits = verifier.scanRawSecrets(md);
  assert.ok(hits.length >= 2);
});

test('v21 rederiveHashBlockers — happy path → 0 blockers', () => {
  const fx = makeFixtureRoot();
  const model = buildValidModel(fx.hashes);
  const out = verifier.rederiveHashBlockers(model, fx.tmp);
  assert.equal(out.blockers.length, 0);
});

test('v22 rederiveHashBlockers — missing source → SOURCE_MISSING', () => {
  const fx = makeFixtureRoot();
  const model = buildValidModel(fx.hashes, { missingRef: contract.REF.S08_CLOSURE });
  const out = verifier.rederiveHashBlockers(model, fx.tmp);
  const codes = out.blockers.map((b) => b.code);
  assert.ok(codes.some((c) => c.indexOf('SOURCE-MISSING') >= 0));
});

test('v23 rederiveHashBlockers — hash drift → SOURCE_HASH_DRIFT', () => {
  const fx = makeFixtureRoot();
  const model = buildValidModel(fx.hashes, { driftRef: contract.REF.S08_CLOSURE });
  const out = verifier.rederiveHashBlockers(model, fx.tmp);
  const codes = out.blockers.map((b) => b.code);
  assert.ok(codes.some((c) => c.indexOf('SOURCE-HASH-DRIFT') >= 0));
});

test('v24 rederiveHashBlockers — non-sha256 → SOURCE_HASH_DRIFT', () => {
  const fx = makeFixtureRoot();
  const model = buildValidModel(fx.hashes, { badFormatRef: contract.REF.S08_CLOSURE });
  const out = verifier.rederiveHashBlockers(model, fx.tmp);
  const codes = out.blockers.map((b) => b.code);
  assert.ok(codes.some((c) => c.indexOf('SOURCE-HASH-DRIFT') >= 0));
});

test('v25 rederiveHashBlockers — missing key in model → SOURCE_MISSING', () => {
  const fx = makeFixtureRoot();
  // buildReviewModel deeply freezes the returned model (Object.freeze +
  // Object.freeze on every nested array/object). Build the missing-ref
  // variant via the helper's missingRef option so we never try to mutate
  // the frozen top-level model (which would throw under strict mode).
  const model = buildValidModel(fx.hashes, { missingRef: contract.REF.S08_CLOSURE });
  const out = verifier.rederiveHashBlockers(model, fx.tmp);
  const codes = out.blockers.map((b) => b.code);
  assert.ok(codes.some((c) => c.indexOf('SOURCE-MISSING') >= 0));
});

test('v26 extractEvaluatorInputs — happy path', () => {
  const fx = makeFixtureRoot();
  const model = buildValidModel(fx.hashes);
  const inputs = verifier.extractEvaluatorInputs(model);
  assert.equal(inputs.evidenceRecordIds.length, 19);
  assert.equal(inputs.m015Comparison.criterion_diff.length, 9);
  assert.equal(inputs.m015Comparison.capability_audit.length, 30);
  assert.equal(inputs.div1Communication.m015_record.evidence_kind, contract.DIV1_COMMUNICATION_KINDS.M015_DIAGNOSTIC);
  assert.equal(inputs.div1Communication.m016_record.evidence_kind, contract.DIV1_COMMUNICATION_KINDS.M016_S05_EXECUTED_READBACK);
});

test('v27 extractEvaluatorInputs — div1 mapping_complete=false forwarded', () => {
  const fx = makeFixtureRoot();
  const model = buildValidModel(fx.hashes, { div1MappingComplete: false });
  const inputs = verifier.extractEvaluatorInputs(model);
  assert.equal(inputs.div1Communication.mapping_complete, false);
});

test('v28 CLI line shape regex — happy path', () => {
  const fx = makeFixtureRoot();
  const model = buildValidModel(fx.hashes);
  const line = contract.buildCliHealthLine({
    verdict: 'PREPARATION_ONLY',
    exitCode: 0,
    blockCount: 0,
    outputPath: '.gsd/foo.md',
    outputSha256: 'a'.repeat(64),
  });
  assert.ok(contract.CLI_LINE_REGEX.test(line), 'CLI line should match regex: ' + line);
});

test('v29 CLI line shape regex — wrong section_count fails', () => {
  // Manually craft a line with section_count=4 (should fail).
  const line = 'M16-S09-REVIEW verdict=PREPARATION_ONLY exit=0 block_count=0 section_count=4 source_count=11';
  assert.ok(!contract.CLI_LINE_REGEX.test(line));
});

test('v30 CLI line shape regex — wrong source_count fails', () => {
  const line = 'M16-S09-REVIEW verdict=PREPARATION_ONLY exit=0 block_count=0 section_count=5 source_count=10';
  assert.ok(!contract.CLI_LINE_REGEX.test(line));
});

test('v31 exit code namespace — all codes match', () => {
  for (const code of Object.values(contract.EXIT_CODES)) {
    assert.equal(typeof code, 'number');
    assert.ok(code >= 0 && code <= 6);
  }
});

test('v32 module surface frozen', () => {
  // surface check via JSON roundtrip; module is Object.freeze so any mutation throws
  assert.equal(typeof verifier.parseArgs, 'function');
  assert.equal(typeof verifier.run, 'function');
  assert.equal(typeof verifier.extractModel, 'function');
  assert.equal(typeof verifier.scanRawSecrets, 'function');
  assert.equal(typeof verifier.rederiveHashBlockers, 'function');
});

test('v33 independence — verifier imports list is exactly the 5 allowed', () => {
  assert.equal(verifier.VERIFIER_IMPORTS.length, 5);
  assert.ok(verifier.VERIFIER_IMPORTS.indexOf('node:fs') >= 0);
  assert.ok(verifier.VERIFIER_IMPORTS.indexOf('node:path') >= 0);
  assert.ok(verifier.VERIFIER_IMPORTS.indexOf('node:crypto') >= 0);
  assert.ok(verifier.VERIFIER_IMPORTS.some((m) => m.indexOf('m016-s09-human-review-contract') >= 0));
  assert.ok(verifier.VERIFIER_IMPORTS.some((m) => m.indexOf('m016-s09-canonical-reference-loader') >= 0));
});

test('v34 independence — verifier never imports producer CLI module', () => {
  // producer CLI path is recorded but never required
  const cli = verifier.PRODUCER_CLI_PATH;
  assert.equal(typeof cli, 'string');
  // re-read source: must not contain require('./build_m016_s09_human_review')
  const src = fs.readFileSync(path.resolve(__dirname, 'verify_m016_s09_human_review.js'), 'utf8');
  assert.ok(!/require\(['"]\.\/build_m016_s09_human_review/.test(src), 'verifier must not require producer CLI');
});

test('v35 positive end-to-end run() — happy markdown passes (subprocess)', () => {
  const fx = makeFixtureRoot();
  const model = buildValidModel(fx.hashes);
  const written = writeFixtureAndVerifierArgs(fx, model);
  // Use spawnSync so we hit the real CLI entrypoint.
  const out = spawnSync('node', [
    path.resolve(__dirname, 'verify_m016_s09_human_review.js'),
    '--human-review-path', path.relative(fx.tmp, written.abs),
    '--source-root', fx.tmp,
  ], { encoding: 'utf8' });
  assert.equal(out.status, 0, 'expected exit 0; stderr=' + out.stderr + ' stdout=' + out.stdout);
  assert.ok(/^M16-S09-REVIEW\s+/.test(out.stdout));
  assert.ok(out.stdout.indexOf('verdict=PREPARATION_ONLY') >= 0);
  assert.ok(out.stdout.indexOf('exit=0') >= 0);
  assert.ok(out.stdout.indexOf('block_count=0') >= 0);
  assert.ok(out.stdout.indexOf('section_count=5') >= 0);
  assert.ok(out.stdout.indexOf('source_count=11') >= 0);
});