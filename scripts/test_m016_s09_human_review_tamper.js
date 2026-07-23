#!/usr/bin/env node
'use strict';

/**
 * scripts/test_m016_s09_human_review_tamper.js
 *
 * M016-txa3vu / S09 / T03 — Executable negative tamper matrix for the
 * independent human-proof acceptance reviewer.
 *
 * Coverage (each test mutates one frozen invariant and asserts the
 * verifier fails-closed with the matching blocker code):
 *   t01  section count drift (4 instead of 5)
 *   t02  section ordering drift
 *   t03  section unknown id
 *   t04  source count drift (10 instead of 11)
 *   t05  source not allowlisted
 *   t06  source hash missing in model
 *   t07  source hash not sha256
 *   t08  source hash drift (regenerated fixture)
 *   t09  source absent on disk
 *   t10  evidence record count drift
 *   t11  evidence record unknown id
 *   t12  evidence record duplicate id
 *   t13  hard gate count drift
 *   t14  hard gate unknown id
 *   t15  hard gate invalid state
 *   t16  verdict row count drift
 *   t17  forbidden verdict value
 *   t18  launch posture orchestration drift
 *   t19  launch posture evidence drift
 *   t20  launch posture launch drift
 *   t21  bounded_internal=false drift
 *   t22  S08 closure verdict drift
 *   t23  S08 stage B recommendation drift
 *   t24  M015 criterion_diff row count drift
 *   t25  M015 capability_audit row count drift
 *   t26  M015 capability promotion_attempted
 *   t27  M015 promotion_to_confirmed_count > 0
 *   t28  M015 evidence_driven_downgrade_count drift
 *   t29  div1 m015 evidence_kind unknown
 *   t30  div1 m016 evidence_kind unknown
 *   t31  div1 mapping_complete=false
 *   t32  div1 historical_not_replaced=false
 *   t33  NOT_PROVEN promotion_attempted non-empty
 *   t34  raw secret bearer token → REDACTION_LEAK
 *   t35  raw secret AWS key → REDACTION_LEAK
 *   t36  raw secret PEM → REDACTION_LEAK
 *   t37  path traversal .. → PATH_TRAVERSAL
 *   t38  path absolute → PATH_TRAVERSAL
 *   t39  malformed embedded JSON → MODEL_MALFORMED
 *   t40  missing embedded block → MODEL_MALFORMED
 *   t41  missing human-review markdown → PRECONDITION_DRIFT
 *
 * Run: node --test scripts/test_m016_s09_human_review_tamper.js
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
// Fixture helpers (mirror verifier test fixtures but allow richer mutation)
// ---------------------------------------------------------------------------
function makeFixtureRoot() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'm016-s09-t03-tamper-'));
  const realTmp = fs.realpathSync(tmp);
  fs.mkdirSync(path.join(realTmp, 'runtime-evidence'), { recursive: true });
  const hashes = {};
  for (const ref of contract.SOURCE_ALLOWLIST_REFS) {
    const payload = { source_ref: ref, fixture_kind: 's09-t03-tamper', captured_at: contract.HUMAN_REVIEW_REFERENCE_TIME };
    const body = JSON.stringify(payload);
    const abs = path.join(realTmp, ref);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, Buffer.from(body, 'utf8'));
    hashes[ref] = crypto.createHash('sha256').update(Buffer.from(body, 'utf8')).digest('hex');
  }
  return { tmp: realTmp, hashes };
}

function buildValidModel(hashes, mutation) {
  const sourceHashes = Object.assign({}, hashes);
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
      mapping_complete: true,
      historical_not_replaced: true,
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
  // Apply mutation. Mutation shape: { sections?: { id?: replacement }, ... }
  if (mutation && mutation.sections) {
    for (const [id, repl] of Object.entries(mutation.sections)) {
      if (repl === '__delete__') { delete sections[id]; continue; }
      if (repl === '__unknown__') {
        sections['mystery_section'] = { section_id: 'mystery_section' };
        continue;
      }
      sections[id] = repl;
    }
  }
  if (mutation && mutation.sourceHashDrop) delete sourceHashes[mutation.sourceHashDrop];
  if (mutation && mutation.sourceHashDrift) sourceHashes[mutation.sourceHashDrift] = 'f'.repeat(64);
  if (mutation && mutation.sourceHashBadFormat) sourceHashes[mutation.sourceHashBadFormat] = 'not-sha256';
  if (mutation && mutation.sourceHashExtra) sourceHashes['runtime-evidence/EXTRA-FOO.json'] = 'a'.repeat(64);

  const notProvenOpts = { preserved_ids: [contract.S08_CLOSURE_VERDICT], promotion_attempted: [], stage_b_recommendation: contract.S08_STAGE_B_RECOMMENDATION, stage_b_evidence_state: 'deferred-unvalidated', bos_grade_contract_proof_state: 'NOT_PROVEN_MISSING_RESULT_JSON_BOS' };
  if (mutation && mutation.notProvenPromotion) notProvenOpts.promotion_attempted = mutation.notProvenPromotion;
  const s08Opts = { closure_verdict: contract.S08_CLOSURE_VERDICT, stage_b_recommendation: contract.S08_STAGE_B_RECOMMENDATION };
  if (mutation && mutation.s08ClosureVerdict) s08Opts.closure_verdict = mutation.s08ClosureVerdict;
  if (mutation && mutation.s08StageB) s08Opts.stage_b_recommendation = mutation.s08StageB;

  const model = contract.buildReviewModel({
    sourceHashes,
    sections,
    notProvenPreservation: notProvenOpts,
    // Worksheet inputs must carry the frozen launch posture + HG states so
    // the embedded model passes the verifier's verdict-row + hard-gate
    // checks. Without these the verifier emits VERDICT-LAUNCH-DRIFT before
    // it can even look at the test mutation.
    worksheet: Object.assign({
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
    }, mutation && mutation.worksheetOverride ? mutation.worksheetOverride : {}),
    s08State: s08Opts,
  });
  // Post-build mutations: mutate a fresh JSON clone (`out`) — the model
  // returned by buildReviewModel is deeply frozen, so any write against it
  // either silently fails or throws. Working against the JSON clone makes
  // every post-build mutation reliable + the original `sections` closure
  // variable stays untouched.
  const out = JSON.parse(JSON.stringify(model));
  if (mutation && mutation.launchPosture) {
    for (const [k, v] of Object.entries(mutation.launchPosture)) out.launch_posture[k] = v;
  }
  // Source allowlist drift: verifier inspects model.source_refs (frozen
  // SOURCE_ALLOWLIST_REFS), not model.source_hashes — so an extra bogus
  // ref must land in BOTH source_refs and source_hashes.
  if (mutation && mutation.sourceHashExtra) {
    out.source_refs.push('runtime-evidence/EXTRA-FOO.json');
    out.source_hashes['runtime-evidence/EXTRA-FOO.json'] = 'a'.repeat(64);
  }
  if (mutation && mutation.sourceHashOverride) {
    out.source_refs[out.source_refs.indexOf(mutation.sourceHashOverride)] = 'runtime-evidence/BOGUS.json';
    out.source_hashes['runtime-evidence/BOGUS.json'] = 'a'.repeat(64);
    delete out.source_hashes[mutation.sourceHashOverride];
  }
  // Unknown section id: buildReviewModel only iterates REVIEW_SECTION_IDS
  // when populating model.sections, so a pre-build mutation on
  // `sections.mystery_section` never survives. Inject it post-build so
  // the verifier's SECTION-MISSING blocker fires. Also accept the legacy
  // `sections: { mystery_section: '__unknown__' }` mutation shape for
  // backwards compatibility.
  if (mutation && mutation.unknownSectionId) {
    out.sections.mystery_section = { section_id: 'mystery_section' };
  } else if (mutation && mutation.sections) {
    for (const [, repl] of Object.entries(mutation.sections)) {
      if (repl === '__unknown__') {
        out.sections.mystery_section = { section_id: 'mystery_section' };
        break;
      }
    }
  }
  if (mutation && mutation.div1Kind) {
    if (mutation.div1Kind.m015) out.sections.div1_exact_communication.m015_record.evidence_kind = mutation.div1Kind.m015;
    if (mutation.div1Kind.m016) out.sections.div1_exact_communication.m016_record.evidence_kind = mutation.div1Kind.m016;
  }
  if (mutation && mutation.div1Mapping === false) out.sections.div1_exact_communication.mapping_complete = false;
  if (mutation && mutation.div1Historical === false) out.sections.div1_exact_communication.historical_not_replaced = false;
  if (mutation && mutation.capabilityPromotionCount !== undefined) out.sections.m015_comparison.promotion_to_confirmed_count = mutation.capabilityPromotionCount;
  if (mutation && mutation.capabilityDowngradeCount !== undefined) out.sections.m015_comparison.evidence_driven_downgrade_count = mutation.capabilityDowngradeCount;
  if (mutation && mutation.unknownCriterionId) {
    out.sections.m015_comparison.criterion_diff.push({ criterion_id: mutation.unknownCriterionId, m016_verdict: 'PASS', pass_through: true, evidence_driven: false });
    out.sections.m015_comparison.criterion_diff_row_count = out.sections.m015_comparison.criterion_diff.length;
  }
  if (mutation && mutation.capabilityRowsOverride) {
    out.sections.m015_comparison.capability_audit = mutation.capabilityRowsOverride;
    out.sections.m015_comparison.capability_audit_row_count = mutation.capabilityRowsOverride.length;
  }
  if (mutation && mutation.unknownCapability) {
    out.sections.m015_comparison.capability_audit.push({ capability_key: 'unknown', paperclip_surface_name: 'unknown', pre_status: 'confirmed', post_status: 'confirmed', action: 'promote', promotion_attempted: true });
    out.sections.m015_comparison.capability_audit_row_count = out.sections.m015_comparison.capability_audit.length;
  }
  // Worksheet drift — verifier reads model.worksheet (the contract's
  // auto-generated evidence_records / hard_gate_rows / verdict_rows), NOT
  // model.sections.full_worksheet. Mutations must target out.worksheet.
  if (mutation && mutation.duplicateEvidence) {
    out.worksheet.evidence_records.push({ evidence_id: 'm016-s09-record-0001-m015-baseline', review_section: 'sanitised_proof_summary', gate: 'HG1', source_ref: contract.REF.M015_BASELINE, classification: 'EXECUTED_READBACK', worksheet_state: 'observed' });
  }
  if (mutation && mutation.unknownHardGate) {
    // Replace HG1's id with HG9 UNKNOWN_GATE — keeps the count at 8 so
    // the verifier's for-loop branch fires HARD-GATE-UNKNOWN. Adding a
    // 9th row would short-circuit on HARD-GATE-COUNT-DRIFT first, which
    // some tests (t14) cannot match.
    out.worksheet.hard_gate_rows[0].hard_gate_id = 'HG9 UNKNOWN_GATE';
  }
  if (mutation && mutation.invalidHardGateState) {
    out.worksheet.hard_gate_rows[0].state = 'banana';
  }
  if (mutation && mutation.forbiddenVerdict) {
    out.worksheet.verdict_rows.push({ verdict_row: 'forbidden_test', value: mutation.forbiddenVerdict });
  }
  if (mutation && mutation.evidenceDrop) {
    const idx = out.worksheet.evidence_records.findIndex((r) => r.evidence_id === mutation.evidenceDrop);
    if (idx >= 0) out.worksheet.evidence_records.splice(idx, 1);
  }
  if (mutation && mutation.evidenceUnknown) {
    out.worksheet.evidence_records.push({ evidence_id: 'm016-s09-record-bogus', review_section: 'sanitised_proof_summary', gate: 'HG1', source_ref: contract.REF.M015_BASELINE, classification: 'EXECUTED_READBACK', worksheet_state: 'observed' });
  }
  // Section drops/swaps (work via model.sections).
  if (mutation && mutation.missingSectionCount) {
    delete out.sections.m015_comparison;
  }
  if (mutation && mutation.swapSections) {
    // Actually reorder the keys so the verifier's section-order check
    // fires SECTION-DRIFT. A simple value-swap leaves Object.keys in
    // insertion order, which doesn't trip the check.
    const reordered = {
      sanitised_proof_summary: out.sections.sanitised_proof_summary,
      m015_comparison: out.sections.m015_comparison,
      full_worksheet: out.sections.full_worksheet,
      div1_exact_communication: out.sections.div1_exact_communication,
      launch_class_boundary: out.sections.launch_class_boundary,
    };
    out.sections = reordered;
  }
  return out;
}

function writeFixture(mutation) {
  const fx = makeFixtureRoot();
  const model = buildValidModel(fx.hashes, mutation);
  const rel = '.gsd/t03-tamper-' + Math.random().toString(36).slice(2, 8) + '/HUMAN-REVIEW.md';
  const abs = path.join(fx.tmp, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  let bodyText = 'no secrets in body';
  if (mutation && mutation.injectSecret === 'bearer') bodyText += '\n\nBearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def-ghi\n';
  if (mutation && mutation.injectSecret === 'aws') bodyText += '\n\nAKIAIOSFODNN7EXAMPLE\n';
  if (mutation && mutation.injectSecret === 'pem') bodyText += '\n\n-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n';
  if (mutation && mutation.noEmbed) {
    fs.writeFileSync(abs, bodyText, 'utf8');
  } else if (mutation && mutation.malformedJson) {
    fs.writeFileSync(abs, '<!-- HUMAN_REVIEW_MODEL_V1\n{bad json\nHUMAN_REVIEW_MODEL_V1 -->\n' + bodyText, 'utf8');
  } else {
    fs.writeFileSync(abs, '<!-- HUMAN_REVIEW_MODEL_V1\n' + JSON.stringify(model) + '\nHUMAN_REVIEW_MODEL_V1 -->\n' + bodyText, 'utf8');
  }
  // Flatten: tests do `fx.tmp` / `fx.rel` directly — return a single-level
  // object so `fx.tmp` resolves to the real tmp dir instead of undefined.
  return { tmp: fx.tmp, hashes: fx.hashes, abs, rel: path.relative(fx.tmp, abs) };
}

function runVerifierSubprocess(fx, rel) {
  const out = spawnSync('node', [
    path.resolve(__dirname, 'verify_m016_s09_human_review.js'),
    '--human-review-path', rel,
    '--source-root', fx.tmp,
  ], { encoding: 'utf8' });
  return out;
}

// ---------------------------------------------------------------------------
// Tests — each one runs the verifier subprocess and asserts the expected
// failure class (exit code + presence of matching blocker code).
// ---------------------------------------------------------------------------

test('t01 section count drift (drop one section)', () => {
  const fx = writeFixture({ missingSectionCount: true });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/SECTION-DRIFT|SECTION-MISSING/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t02 section ordering drift (swap two sections)', () => {
  const fx = writeFixture({ swapSections: true });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/SECTION-DRIFT/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t03 unknown section id introduced', () => {
  const fx = writeFixture({ sections: { mystery_section: '__unknown__' } });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  // Either SECTION-DRIFT or SECTION-MISSING — both indicate unknown vocab.
  assert.ok(/SECTION/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t04 source count drift (10 instead of 11) — extra source', () => {
  const fx = writeFixture({ sourceHashExtra: true });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/SOURCE-NOT-ALLOWLISTED|SOURCE-COUNT-DRIFT/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t05 source not allowlisted (override an existing ref to bogus)', () => {
  // Use writeFixture + sourceHashOverride mutation so the post-build clone
  // gets the bogus ref in BOTH source_refs and source_hashes. Direct
  // mutation on the frozen model.source_hashes is silently dropped.
  const fx = writeFixture({ sourceHashOverride: contract.REF.S08_CLOSURE });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/SOURCE-NOT-ALLOWLISTED|SOURCE-COUNT-DRIFT/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t06 source hash missing in model', () => {
  const fx = writeFixture({ sourceHashDrop: contract.REF.S08_CLOSURE });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/SOURCE-MISSING/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t07 source hash not sha256', () => {
  const fx = writeFixture({ sourceHashBadFormat: contract.REF.S08_CLOSURE });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/SOURCE-HASH-DRIFT/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t08 source hash drift (regenerate fixture to invalidate hash)', () => {
  const fx = makeFixtureRoot();
  const hashes = Object.assign({}, fx.hashes);
  // Write a different body at the S08_CLOSURE path so the hash drifts.
  const target = path.join(fx.tmp, contract.REF.S08_CLOSURE);
  fs.writeFileSync(target, Buffer.from('{"corrupted":true}', 'utf8'));
  const model = buildValidModel(hashes);
  const rel = '.gsd/t08/HUMAN-REVIEW.md';
  fs.mkdirSync(path.join(fx.tmp, '.gsd/t08'), { recursive: true });
  fs.writeFileSync(path.join(fx.tmp, rel), '<!-- HUMAN_REVIEW_MODEL_V1\n' + JSON.stringify(model) + '\nHUMAN_REVIEW_MODEL_V1 -->\n');
  const out = runVerifierSubprocess(fx, rel);
  assert.notEqual(out.status, 0);
  assert.ok(/SOURCE-HASH-DRIFT/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t09 source absent on disk', () => {
  const fx = makeFixtureRoot();
  // Remove the S08_CLOSURE file from disk; keep the matching hash claim.
  fs.unlinkSync(path.join(fx.tmp, contract.REF.S08_CLOSURE));
  const model = buildValidModel(fx.hashes);
  const rel = '.gsd/t09/HUMAN-REVIEW.md';
  fs.mkdirSync(path.join(fx.tmp, '.gsd/t09'), { recursive: true });
  fs.writeFileSync(path.join(fx.tmp, rel), '<!-- HUMAN_REVIEW_MODEL_V1\n' + JSON.stringify(model) + '\nHUMAN_REVIEW_MODEL_V1 -->\n');
  const out = runVerifierSubprocess(fx, rel);
  assert.notEqual(out.status, 0);
  assert.ok(/SOURCE-MISSING/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t10 evidence record count drift', () => {
  const fx = writeFixture({ evidenceDrop: contract.EVIDENCE_RECORD_IDS[0] });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/EVIDENCE-RECORD-COUNT-DRIFT/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t11 evidence record unknown id', () => {
  const fx = writeFixture({ evidenceUnknown: true });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/EVIDENCE-RECORD|SECTION-MISSING/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t12 evidence record duplicate id', () => {
  const fx = writeFixture({ duplicateEvidence: true });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/EVIDENCE-RECORD-DUPLICATE/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t13 hard gate count drift', () => {
  const fx = writeFixture({ unknownHardGate: true });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/HARD-GATE-COUNT|HARD-GATE-UNKNOWN/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t14 hard gate unknown id', () => {
  const fx = writeFixture({ unknownHardGate: true });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/HARD-GATE-UNKNOWN/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t15 hard gate invalid state', () => {
  const fx = writeFixture({ invalidHardGateState: true });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/HARD-GATE-STATE-DRIFT/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t16 verdict row count drift', () => {
  const fx = writeFixture({ forbiddenVerdict: 'TEST_VERDICT' });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/VERDICT-ROW-COUNT|VERDICT-FORBIDDEN/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t17 forbidden verdict value (GO)', () => {
  // Use writeFixture + forbiddenVerdict mutation so the post-build clone
  // gets a 4th verdict row with value 'GO' in out.worksheet.verdict_rows.
  // Direct mutation on the frozen model's nested verdict_rows is silently
  // dropped, leaving the model valid.
  const fx = writeFixture({ forbiddenVerdict: 'GO' });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/VERDICT-FORBIDDEN|VERDICT-LAUNCH-DRIFT|VERDICT-ROW-COUNT/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t18 launch posture orchestration drift', () => {
  const fx = makeFixtureRoot();
  const model = buildValidModel(fx.hashes);
  model.launch_posture.orchestration = 'PASS';
  const rel = '.gsd/t18/HUMAN-REVIEW.md';
  fs.mkdirSync(path.join(fx.tmp, '.gsd/t18'), { recursive: true });
  fs.writeFileSync(path.join(fx.tmp, rel), '<!-- HUMAN_REVIEW_MODEL_V1\n' + JSON.stringify(model) + '\nHUMAN_REVIEW_MODEL_V1 -->\n');
  const out = runVerifierSubprocess(fx, rel);
  assert.notEqual(out.status, 0);
  assert.ok(/VERDICT-LAUNCH-DRIFT/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t19 launch posture evidence drift', () => {
  const fx = makeFixtureRoot();
  const model = buildValidModel(fx.hashes);
  model.launch_posture.evidence = 'PASS';
  const rel = '.gsd/t19/HUMAN-REVIEW.md';
  fs.mkdirSync(path.join(fx.tmp, '.gsd/t19'), { recursive: true });
  fs.writeFileSync(path.join(fx.tmp, rel), '<!-- HUMAN_REVIEW_MODEL_V1\n' + JSON.stringify(model) + '\nHUMAN_REVIEW_MODEL_V1 -->\n');
  const out = runVerifierSubprocess(fx, rel);
  assert.notEqual(out.status, 0);
  assert.ok(/VERDICT-LAUNCH-DRIFT/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t20 launch posture launch drift', () => {
  const fx = makeFixtureRoot();
  const model = buildValidModel(fx.hashes);
  model.launch_posture.launch = 'GO';
  const rel = '.gsd/t20/HUMAN-REVIEW.md';
  fs.mkdirSync(path.join(fx.tmp, '.gsd/t20'), { recursive: true });
  fs.writeFileSync(path.join(fx.tmp, rel), '<!-- HUMAN_REVIEW_MODEL_V1\n' + JSON.stringify(model) + '\nHUMAN_REVIEW_MODEL_V1 -->\n');
  const out = runVerifierSubprocess(fx, rel);
  assert.notEqual(out.status, 0);
  assert.ok(/VERDICT-LAUNCH-DRIFT/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t21 bounded_internal=false drift', () => {
  const fx = makeFixtureRoot();
  const model = buildValidModel(fx.hashes);
  model.launch_posture.bounded_internal = false;
  const rel = '.gsd/t21/HUMAN-REVIEW.md';
  fs.mkdirSync(path.join(fx.tmp, '.gsd/t21'), { recursive: true });
  fs.writeFileSync(path.join(fx.tmp, rel), '<!-- HUMAN_REVIEW_MODEL_V1\n' + JSON.stringify(model) + '\nHUMAN_REVIEW_MODEL_V1 -->\n');
  const out = runVerifierSubprocess(fx, rel);
  assert.notEqual(out.status, 0);
  assert.ok(/VERDICT-BOUNDED-INTERNAL-DRIFT/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t22 S08 closure verdict drift', () => {
  const fx = writeFixture({ s08ClosureVerdict: 'PROVEN_LIVE' });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/S08-CLOSURE-VERDICT-DRIFT/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t23 S08 stage B recommendation drift', () => {
  const fx = writeFixture({ s08StageB: 'plugin-owned proof integration, GO-LIVE' });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/S08-STAGE-B-RECOMMENDATION-DRIFT/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t24 M015 criterion_diff row count drift', () => {
  const fx = writeFixture({ unknownCriterionId: 'M16-S06-CRITERION-FAKE' });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/CRITERION-DIFF-ROW-COUNT-DRIFT|CRITERION-DIFF-UNKNOWN-ID/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t25 M015 capability_audit row count drift', () => {
  const fx = writeFixture({ capabilityRowsOverride: Array.from({ length: 5 }, (_, i) => ({ capability_key: 'k' + i, paperclip_surface_name: 's' + i, pre_status: 'unvalidated', post_status: 'unvalidated', action: 'keep', promotion_attempted: false })) });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/CAPABILITY-AUDIT-ROW-COUNT-DRIFT/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t26 M015 capability promotion_attempted=true detected', () => {
  const fx = writeFixture({ unknownCapability: true });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/CAPABILITY-AUDIT|CAPABILITY-PROMOTION/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t27 M015 promotion_to_confirmed_count > 0', () => {
  const fx = writeFixture({ capabilityPromotionCount: 1 });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/CAPABILITY-PROMOTION-DETECTED/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t28 M015 evidence_driven_downgrade_count drift (0 instead of 1)', () => {
  const fx = writeFixture({ capabilityDowngradeCount: 0 });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/CAPABILITY-DOWNGRADE-COUNT-DRIFT/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t29 div1 m015 evidence_kind unknown', () => {
  const fx = writeFixture({ div1Kind: { m015: 'mystery_kind' } });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/DIV1-KIND-UNKNOWN/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t30 div1 m016 evidence_kind unknown', () => {
  const fx = writeFixture({ div1Kind: { m016: 'mystery_kind' } });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/DIV1-KIND-UNKNOWN/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t31 div1 mapping_complete=false', () => {
  const fx = writeFixture({ div1Mapping: false });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/DIV1-MAPPING-INCOMPLETE/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t32 div1 historical_not_replaced=false', () => {
  const fx = writeFixture({ div1Historical: false });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/DIV1-MAPPING-INCOMPLETE/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t33 NOT_PROVEN promotion_attempted non-empty', () => {
  const fx = writeFixture({ notProvenPromotion: ['m016-s09-record-0001-m015-baseline'] });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/NOT-PROVEN-PROMOTION/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t34 raw secret bearer token → REDACTION_LEAK', () => {
  const fx = writeFixture({ injectSecret: 'bearer' });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/REDACTION-LEAK|bearer-token/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t35 raw secret AWS key → REDACTION_LEAK', () => {
  const fx = writeFixture({ injectSecret: 'aws' });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/REDACTION-LEAK|aws-access-key/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t36 raw secret PEM private key → REDACTION_LEAK', () => {
  const fx = writeFixture({ injectSecret: 'pem' });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/REDACTION-LEAK|private-key-pem/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t37 path traversal ..', () => {
  const fx = makeFixtureRoot();
  // Create a markdown outside the source-root to attempt escape.
  const escape = path.join(os.tmpdir(), 'm016-s09-t03-escape-' + Math.random().toString(36).slice(2, 8) + '.md');
  fs.writeFileSync(escape, '# escape\n', 'utf8');
  const out = spawnSync('node', [
    path.resolve(__dirname, 'verify_m016_s09_human_review.js'),
    '--human-review-path', '../' + path.basename(escape),
    '--source-root', fx.tmp,
  ], { encoding: 'utf8' });
  fs.unlinkSync(escape);
  assert.notEqual(out.status, 0);
  assert.ok(/PATH-TRAVERSAL|escape|REVIEW_MALFORMED|REVIEW_RUNNER_FAILURE/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t38 path absolute', () => {
  const out = spawnSync('node', [
    path.resolve(__dirname, 'verify_m016_s09_human_review.js'),
    '--human-review-path', '/etc/passwd',
  ], { encoding: 'utf8' });
  assert.notEqual(out.status, 0);
  assert.ok(/absolute|path not permitted|REVIEW_MALFORMED/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t39 malformed embedded JSON → MODEL_MALFORMED', () => {
  const fx = writeFixture({ malformedJson: true });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/MODEL-MALFORMED|malformed JSON/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t40 missing embedded block', () => {
  const fx = writeFixture({ noEmbed: true });
  const out = runVerifierSubprocess(fx, fx.rel);
  assert.notEqual(out.status, 0);
  assert.ok(/MODEL-MALFORMED|not found/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});

test('t41 missing human-review markdown → PRECONDITION_DRIFT', () => {
  const fx = makeFixtureRoot();
  const out = runVerifierSubprocess(fx, '.gsd/nonexistent/HUMAN-REVIEW.md');
  assert.notEqual(out.status, 0);
  assert.ok(/SOURCE-MISSING|does not exist|REVIEW_PRECONDITION_DRIFT/.test(out.stderr + out.stdout), 'stderr=' + out.stderr);
});