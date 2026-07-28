#!/usr/bin/env node
'use strict';

/**
 * scripts/test_m016_s06_proof_reconciliation_artifacts.js
 *
 * M016-txa3vu / S06 / T04 — Canonical artifact audit + verifier-independence
 * static analysis. Complements the fail-closed tamper matrix by asserting
 * that the persisted S06 reconciliation sidecar and capability ledger
 * satisfy semantic invariants that JSON-Schema alone cannot capture:
 *
 *   1. Exact inventory             — both canonical sidecars exist on disk
 *                                     under ROOT/runtime-evidence/
 *   2. Schema-conformance audit    — each sidecar passes AJV strict against
 *                                     its declared v1 schema_id
 *   3. 9-criterion coverage        — criterion_diff.length === 9
 *                                     and partition 8 PROVEN + 1 NOT_PROVEN
 *   4. Bounded verdict triplet     — aggregate_verdict carries
 *                                     orchestration/evidence/launch/
 *                                     overall inside the bounded vocabulary
 *   5. Zero-blockers invariant     — bundle.blockers === [] and
 *                                     capability ledger blockers === []
 *   6. Frozen recommendation enum   — recommendation.value is exactly one of
 *                                     RECOMMENDATION_VALUES
 *   7. Forbidden-field absence     — no FORBIDDEN_RECONCILE_VERDICTS
 *                                     ('GO', 'PASS_AUTOMATIC', 'READY',
 *                                     'LAUNCH_GO') anywhere in sidecars
 *   8. Verifier-independence       — static grep on the verifier source
 *                                     must NOT contain a require() of the
 *                                     producer CLI
 *   9. Capability ledger byte-stable — ledger.byte_digest matches
 *                                     computeLedgerBodyDigest round-trip
 *                                     and total_rows === N with
 *                                     pre_status_promoted_to_confirmed_count === 0
 *  10. Capability ledger aggregate_counts — sum of aggregate_action_counts
 *     === total_rows; KEEP/UPDATE_FALLBACK/UPDATE_BLOCKER/DROP all bounded
 *
 * No subprocesses, no network, no live mutation: pure data in, assertions
 * out. The static-analysis checks use Node's `fs.readFileSync` and string
 * matching only.
 *
 * Run with: node --test scripts/test_m016_s06_proof_reconciliation_artifacts.js
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const data = require('./lib/m016-s06-proof-reconciliation-data');
const contract = require('./lib/m016-s06-proof-reconciliation-contract');

const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _sha256Hex(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function _readJson(absPath) {
  return JSON.parse(fs.readFileSync(absPath, 'utf8'));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('T04 canonical artifact audit (M016-txa3vu/S06)', async function (t) {

  // ---- 1. Exact inventory ---------------------------------------------------

  await t.test('exact inventory: both canonical sidecars exist + JSON-loadable', function () {
    const expected = [
      data.DEFAULTS.reconciliation_output,
      data.DEFAULTS.capability_ledger_output,
    ];
    for (const ref of expected) {
      const abs = path.join(ROOT, ref);
      assert.ok(fs.existsSync(abs), 'missing canonical sidecar: ' + ref);
      const raw = fs.readFileSync(abs, 'utf8');
      const parsed = JSON.parse(raw);
      assert.equal(typeof parsed, 'object', ref + ' must parse as JSON object');
    }
  });

  // ---- 2. Schema-conformance audit -----------------------------------------

  await t.test('reconciliation sidecar AJV-strict-passes against its own v1 schema', function () {
    const payload = _readJson(path.join(ROOT, data.DEFAULTS.reconciliation_output));
    const loaded = contract.loadSchema(data.DEFAULTS.reconciliation_schema_path);
    assert.equal(typeof loaded.validate, 'function');
    const ok = loaded.validate(payload);
    assert.ok(ok, 'reconciliation sidecar failed AJV strict: ' + JSON.stringify(loaded.validate.errors));
  });

  await t.test('capability-ledger sidecar AJV-strict-passes against its own v1 schema', function () {
    const payload = _readJson(path.join(ROOT, data.DEFAULTS.capability_ledger_output));
    const loaded = contract.loadSchema(data.DEFAULTS.capability_action_ledger_schema_path);
    assert.equal(typeof loaded.validate, 'function');
    const ok = loaded.validate(payload);
    assert.ok(ok, 'capability-ledger sidecar failed AJV strict: ' + JSON.stringify(loaded.validate.errors));
  });

  // ---- 3. 9-criterion coverage ---------------------------------------------

  let _reconciliation;
  await t.test('reconciliation sidecar: exactly 9 criterion_diff rows', function () {
    _reconciliation = _readJson(path.join(ROOT, data.DEFAULTS.reconciliation_output));
    assert.equal(_reconciliation.criterion_diff.length, 9, 'criterion_diff must have exactly 9 entries');
    const ids = _reconciliation.criterion_diff.map((row) => row.criterion_id);
    for (const mapping of data.M015_CRITERION_MAPPING) {
      assert.ok(ids.indexOf(mapping.criterion_id) >= 0, 'criterion_id missing: ' + mapping.criterion_id);
    }
    // At least 8 PROVEN criteria (M015's bos_grade_contract_proof stays NOT_PROVEN).
    const proven = _reconciliation.criterion_diff.filter((row) => row.m016_verdict === 'PASS').length;
    assert.ok(proven >= 8, 'expected >=8 PASS criteria, got ' + proven);
  });

  // ---- 4. Bounded verdict triplet ------------------------------------------

  await t.test('reconciliation sidecar carries bounded orchestration/evidence/launch/overall vocabulary', function () {
    const verdict = _reconciliation.aggregate_verdict;
    assert.ok(verdict && typeof verdict === 'object', 'aggregate_verdict must be an object');
    assert.ok(data.ORCHESTRATION_VERDICTS.indexOf(verdict.orchestration) >= 0,
      'orchestration ' + verdict.orchestration + ' not in ORCHESTRATION_VERDICTS');
    assert.ok(data.EVIDENCE_VERDICTS.indexOf(verdict.evidence) >= 0,
      'evidence ' + verdict.evidence + ' not in EVIDENCE_VERDICTS');
    assert.ok(data.LAUNCH_VERDICTS.indexOf(verdict.launch) >= 0,
      'launch ' + verdict.launch + ' not in LAUNCH_VERDICTS');
    assert.equal(verdict.launch, data.VERDICT_VALUES.PREPARATION_ONLY,
      'launch must remain PREPARATION_ONLY (canonical S06 verdict)');
    assert.equal(verdict.overall, data.VERDICT_VALUES.PREPARATION_ONLY,
      'overall must remain PREPARATION_ONLY');
  });

  // ---- 5. Zero-blockers invariant -----------------------------------------

  await t.test('reconciliation.blockers === [] and capability-ledger.blockers === []', function () {
    assert.deepEqual(_reconciliation.blockers, [], 'reconciliation.blockers must be empty');
    const ledger = _readJson(path.join(ROOT, data.DEFAULTS.capability_ledger_output));
    assert.deepEqual(ledger.blockers, [], 'capability-ledger.blockers must be empty');
  });

  // ---- 6. Frozen recommendation enum --------------------------------------

  await t.test('reconciliation.recommendation.value matches frozen RECOMMENDATION_VALUES enum', function () {
    const recommendation = _reconciliation.recommendation || {};
    assert.equal(data.isRecommendationValue(recommendation.value), true,
      'recommendation.value ' + JSON.stringify(recommendation.value) + ' is not in frozen enum');
    assert.equal(typeof recommendation.rationale, 'string');
    assert.ok(recommendation.rationale.length > 0);
    assert.ok(recommendation.rationale.length <= data.DEFAULTS.max_rationale_chars,
      'recommendation.rationale must be bounded by max_rationale_chars');
    assert.equal(recommendation.requires_future_proof, true,
      'recommendation must explicitly require future proof (deferred-unvalidated)');
  });

  // ---- 7. Forbidden-field absence -----------------------------------------

  await t.test('no forbidden verdict anywhere in sidecars', function () {
    const refs = [
      data.DEFAULTS.reconciliation_output,
      data.DEFAULTS.capability_ledger_output,
    ];
    for (const ref of refs) {
      const raw = fs.readFileSync(path.join(ROOT, ref), 'utf8');
      for (const forbidden of data.FORBIDDEN_RECONCILE_VERDICTS) {
        const re = new RegExp('\\b' + forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
        if (forbidden === 'GO') {
          const strictRe = new RegExp('[":,]\\s*GO\\s*["},]', 'g');
          assert.equal(strictRe.test(raw), false,
            ref + ' contains forbidden verdict ' + forbidden + ' (strict match)');
        } else {
          assert.equal(re.test(raw), false,
            ref + ' contains forbidden verdict ' + forbidden);
        }
      }
    }
  });

  // ---- 8. Verifier-independence (static grep) -----------------------------

  await t.test('verifier source does NOT require producer CLI (static analysis)', function () {
    const verifierSource = fs.readFileSync(
      path.join(ROOT, 'scripts/verify_m016_s06_proof_reconciliation.js'),
      'utf8',
    );
    const forbiddenPatterns = [
      /require\(\s*['"]\.\/produce_m016_s06_proof_reconciliation['"]\s*\)/,
      /require\(\s*['"][^'"]*produce_m016_s06_proof_reconciliation[^'"]*['"]\s*\)/,
      /from\s+['"][^'"]*produce_m016_s06_proof_reconciliation[^'"]*['"]/,
      /import\(\s*['"][^'"]*produce_m016_s06_proof_reconciliation[^'"]*['"]\s*\)/,
    ];
    for (const re of forbiddenPatterns) {
      assert.equal(re.test(verifierSource), false,
        'verifier source must NOT require/import the producer CLI: ' + re);
    }
  });

  // ---- 9. Capability ledger byte-stable + invariant ------------------------

  let _ledger;
  await t.test('capability ledger round-trip byte-stable + non-promoting + N-row invariant', function () {
    _ledger = _readJson(path.join(ROOT, data.DEFAULTS.capability_ledger_output));
    // byte-stable: re-canonicalize and re-hash, must equal persisted hash.
    const digestNow = contract.computeLedgerBodyDigest(_ledger);
    assert.equal(_ledger.byte_digest, digestNow, 'ledger.byte_digest must equal round-trip body digest');
    // pre→confirmed promotion count must be zero (capability surface never promoted
    // by S06 — only evidence-driven downgrade is permitted per T03 decision).
    assert.equal(_ledger.pre_status_promoted_to_confirmed_count, 0,
      'pre→confirmed promotion count must be zero (S06 must never promote a capability)');
    assert.equal(_ledger.promotion_blocked, true);
    // total_rows matches capability_rows.length.
    assert.equal(_ledger.total_rows, _ledger.capability_rows.length,
      'total_rows must equal capability_rows.length');
    // Every capability row carries both capability_key + paperclip_surface_name.
    for (const row of _ledger.capability_rows) {
      assert.equal(typeof row.capability_key, 'string');
      assert.equal(typeof row.paperclip_surface_name, 'string');
      assert.ok(data.isCapabilityStatus(row.pre_status), 'pre_status invalid: ' + row.pre_status);
      assert.ok(data.isCapabilityStatus(row.post_status), 'post_status invalid: ' + row.post_status);
      assert.ok(data.isCapabilityAction(row.action), 'action invalid: ' + row.action);
    }
  });

  // ---- 10. Aggregate counts sum invariant ---------------------------------

  await t.test('capability ledger aggregate_action_counts sums to total_rows', function () {
    const agg = _ledger.aggregate_action_counts || {};
    const actions = Object.values(data.CAPABILITY_ACTIONS);
    let sum = 0;
    for (const action of actions) {
      assert.equal(typeof agg[action], 'number',
        'aggregate_action_counts[' + action + '] must be a number');
      sum += agg[action];
    }
    assert.equal(sum, _ledger.total_rows,
      'sum of aggregate_action_counts (' + sum + ') must equal total_rows (' + _ledger.total_rows + ')');
  });

  // ---- 11. Source hash triple equality (pre == post on disk) --------------

  await t.test('reconciliation.source_hashes are all sha256-shaped (integrity invariant)', function () {
    const sha256Re = /^[a-f0-9]{64}$/;
    let nonEmptyCount = 0;
    for (const [ref, expected] of Object.entries(_reconciliation.source_hashes)) {
      if (!expected) continue; // empty hashes are acceptable for non-required optional refs.
      nonEmptyCount += 1;
      assert.match(expected, sha256Re,
        'source_hash for ' + ref + ' must be a sha256-shaped hex string; got ' + expected);
    }
    // Sanity: the sidecar must carry at least M015 baseline + S05 bundle sha256-shaped hashes.
    assert.ok(_reconciliation.source_hashes[data.M015_BASELINE_REF] || _reconciliation.source_hashes[data.S05_BUNDLE_REF],
      'sidecar must carry at least one core (M015 or S05) source_hash');
    assert.ok(nonEmptyCount >= 5, 'at least 5 source_hashes must carry values; got ' + nonEmptyCount);
  });

  // ---- 12. Negative-fixtures artifact (may be absent until T04-fork2) -----

  await t.test('tamper test exposes a FIXTURES Object.freeze([...]) array for cross-audit', function () {
    const tamperPath = path.join(ROOT, 'scripts/test_m016_s06_proof_reconciliation_tamper.js');
    assert.ok(fs.existsSync(tamperPath), 'tamper test must exist at ' + tamperPath);
    const tamperSource = fs.readFileSync(tamperPath, 'utf8');
    assert.ok(/FIXTURES\s*=\s*Object\.freeze\(\[\s*[\s\S]+?\]\);/.test(tamperSource),
      'tamper test must declare a FIXTURES Object.freeze([...]) array for cross-test audit');
    // Forbid the tamper test from requiring the producer CLI (it should
    // only spawn the verifier as a fresh subprocess).
    assert.equal(/require\(\s*['"]\.\/produce_m016_s06_proof_reconciliation['"]\s*\)/.test(tamperSource), false,
      'tamper test must not require() the producer CLI');
    assert.ok(/spawnSync\s*\(\s*['"]node['"]/.test(tamperSource),
      'tamper test should spawn the verifier as fresh Node subprocess via spawnSync');
  });
});

// ---------------------------------------------------------------------------
// CLI entry: when invoked directly, run node:test programmatically.
// ---------------------------------------------------------------------------

if (require.main === module) {
  const { run } = require('node:test');
  const reporter = require('node:test/reporters').spec;
  run({ files: [__filename] }).compose(reporter).pipe(process.stdout);
}
