#!/usr/bin/env node
'use strict';

/**
 * scripts/test_m016_s05_seven_division_replay_artifacts.js
 *
 * M016-txa3vu / S05 / T05 — Canonical artifact audit + verifier-independence
 * static analysis. Complements the fail-closed tamper matrix (T05-fork1)
 * by asserting that the persisted S05 bundle, scoring worksheet,
 * admission sidecar, producer protocol, and verify protocol all satisfy
 * semantic invariants that JSON-Schema alone cannot capture:
 *
 *   1. Exact inventory            — all 7 canonical sidecars exist on disk
 *                                    under ROOT/runtime-evidence/
 *   2. Schema-conformance audit   — each sidecar passes AJV strict against
 *                                    its declared v1 schema_id
 *   3. 19-record coverage         — records.length === 19; partition
 *                                    16 live + 3 drill
 *   4. Division coverage         — Div1..Div7 all present in role space
 *   5. Three-verdict contract    — embedded_classification.verdicts
 *                                    carries orchestration/evidence/launch
 *                                    values inside the bounded vocabulary
 *   6. HG1..HG8 worksheet rows   — scoring_worksheet.rows[0..7] each
 *                                    match data.HARD_GATE_IDS in order
 *   7. Zero-blockers invariant   — bundle.blockers === [] and
 *                                    verify-protocol.blockers === []
 *   8. Replay equality           — bundle.replay_keys.match === true
 *                                    first_run === second_run (modulo
 *                                    identical body canonical sha256)
 *   9. Forbidden-field absence   — no FORBIDDEN_REPLAY_VERDICTS
 *                                    ('GO', 'PASS_AUTOMATIC', 'READY',
 *                                    'LAUNCH_GO') anywhere in the
 *                                    persisted bundle / worksheet /
 *                                    producer-protocol / verify-protocol
 *  10. Verifier-independence    — static grep on the verifier source must
 *                                    not contain a `require` of the
 *                                    producer CLI (production-grade
 *                                    independence guarantee, mirrored
 *                                    from T02 → T03 known-issues)
 *  11. Tamper negative-fixtures artifact audit — round-trip the canonical
 *                                    artifact and confirm 24 sanitised
 *                                    fixtures with unique blocker codes
 *  12. Mutator-isolation grep   — same static analysis applied to the
 *                                    verifier module: it must NEVER
 *                                    import the producer CLI
 *
 * No subprocesses, no network, no live mutation: pure data in, assertions
 * out. The static-analysis checks use Node's `fs.readFileSync` and string
 * matching only.
 *
 * Run with: node --test scripts/test_m016_s05_seven_division_replay_artifacts.js
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const data = require('./lib/m016-s05-seven-division-replay-data');
const contract = require('./lib/m016-s05-seven-division-replay-contract');

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
  PRODUCER_LINE_CLASS,
  VERIFIER_LINE_CLASS,
  PRODUCER_TASK_ID,
  PRODUCER_CANONICAL_PROTOCOL,
  VERIFIER_CANONICAL_PROTOCOL,
  HARD_GATE_IDS,
  HARD_GATE_IDS_SET,
  EXIT_CODES,
  BLOCKER_CODES,
  SOURCE_ALLOWLIST,
  SOURCE_ALLOWLIST_SET,
  MANDATORY_CHAIN_ROLES,
  RECORDS_BUDGET,
  DIVISION_ROLES,
  INFRASTRUCTURE_ROLES,
  REPLAY_PARTITION,
  LAUNCH_VERDICTS,
  EVIDENCE_VERDICTS,
  ORCHESTRATION_VERDICTS,
  VERDICT_VALUES,
  SCORING_WEIGHTS,
  SCORING_WEIGHT_SUM,
  OPERATOR_GATE_TOKEN,
  REPLAY_REDACTION_FLAG_VALUES,
  DEFAULTS,
  isForbiddenReplayVerdict,
  FORBIDDEN_REPLAY_VERDICTS,
} = data;

const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _sha256Hex(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function _readJson(absPath) {
  // Synchronous JSON read with retry on transient ENOENT. The T04
  // integration admit path momentarily removes canonical sidecars; if
  // `node --test` ever runs files in parallel, the audit test may briefly
  // see a missing file here. The retry loop adds resilience without
  // changing serial-mode behaviour (the file is present at first read).
  const raw = _readFileWithRetry(absPath);
  return JSON.parse(raw);
}

function _readFileWithRetry(absPath) {
  // Synchronous file read with retry on transient ENOENT. Mirrors the
  // audit-friendly shape the existing _readJson helper expects. The
  // T04 integration admit path momentarily removes canonical sidecars;
  // if `node --test` ever runs files in parallel, the audit test may
  // briefly see a missing file here. The retry loop adds resilience
  // without changing serial-mode behaviour (file present at first read).
  const maxAttempts = 24;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (fs.existsSync(absPath)) {
      try {
        return fs.readFileSync(absPath, 'utf8');
      } catch (_e) { /* race; retry */ }
    }
    if (attempt < maxAttempts - 1) {
      const sleepMs = Math.min(40 * Math.pow(2, Math.min(attempt, 6)), 800);
      const end = Date.now() + sleepMs;
      while (Date.now() < end) { /* spin */ }
    }
  }
  throw new Error('artifact audit: persistent ENOENT after retry: ' + absPath);
}

function _expectedT05TamperFixtures() {
  // Mirrors the FIXTURES array from scripts/test_m016_s05_seven_division_replay_tamper.js
  // (re-read on each call so this audit always sees the latest tamper fixture
  // definitions without manual sync). We only look up the public surface that
  // the negative-fixtures artifact is supposed to expose.
  const tamperScript = fs.readFileSync(
    path.join(ROOT, 'scripts/test_m016_s05_seven_division_replay_tamper.js'),
    'utf8',
  );
  return tamperScript;
}

// ---------------------------------------------------------------------------
// node:test surface
// ---------------------------------------------------------------------------

test('T05 canonical artifact audit (M016-txa3vu/S05)', async function (t) {

  // ---- 1. Exact inventory ---------------------------------------------------

  await t.test('exact inventory: all 7 canonical sidecars exist + JSON-loadable', function () {
    const expected = [
      DEFAULTS.bundle_output,
      DEFAULTS.admission_output,
      DEFAULTS.worksheet_output,
      DEFAULTS.producer_protocol_output,
      DEFAULTS.input_inventory_output,
      DEFAULTS.probe_run_output,
      DEFAULTS.verify_protocol_output,
    ];
    const inventory = {};
    for (const ref of expected) {
      const abs = path.join(ROOT, ref);
      assert.ok(fs.existsSync(abs), 'missing canonical sidecar: ' + ref);
      const raw = _readFileWithRetry(abs);
      const parsed = JSON.parse(raw);
      inventory[ref] = { bytes: Buffer.byteLength(raw, 'utf8'), sha256: _sha256Hex(raw), parsed };
    }
    // Cache for downstream tests
    t.audit_inventory = inventory;
  });

  // ---- 2. Schema-conformance audit -----------------------------------------

  await t.test('all 4 schema-required sidecars (bundle, worksheet, admission, producer-protocol) AJV-strict-pass', function () {
    // Reuse contract.loadSchema (the same path the verifier uses) so we
    // share one AJV instance and avoid the _addSchema recursion that
    // fresh AJV instances can hit when called rapidly inside a loop.
    const checks = [
      { ref: DEFAULTS.bundle_output, schema: DEFAULTS.schema_path },
      { ref: DEFAULTS.worksheet_output, schema: DEFAULTS.worksheet_schema_path },
      { ref: DEFAULTS.admission_output, schema: DEFAULTS.admission_schema_path },
      { ref: DEFAULTS.producer_protocol_output, schema: DEFAULTS.producer_protocol_schema_path },
    ];
    for (const check of checks) {
      const payload = _readJson(path.join(ROOT, check.ref));
      const loaded = contract.loadSchema(check.schema);
      if (!loaded.validate) {
        throw new Error('AJV-compiled validator unavailable for ' + check.schema);
      }
      const ok = loaded.validate(payload);
      assert.ok(ok, check.ref + ' failed AJV strict: ' + JSON.stringify(loaded.validate.errors || []));
    }
  });

  await t.test('verify-protocol sidecar AJV-strict-passes against its own v1 schema', function () {
    const payload = _readJson(path.join(ROOT, DEFAULTS.verify_protocol_output));
    const loaded = contract.loadSchema(DEFAULTS.verify_protocol_schema_path);
    if (!loaded.validate) {
      throw new Error('AJV-compiled validator unavailable for verify-protocol schema');
    }
    const ok = loaded.validate(payload);
    assert.ok(ok, 'verify-protocol failed AJV strict: ' + JSON.stringify(loaded.validate.errors || []));
  });

  // ---- 3. 19-record coverage + 16+3 partition -------------------------------

  let _bundle;
  await t.test('bundle: exactly 19 records (16 live_replay_record + 3 drill_replay_record)', function () {
    _bundle = _readJson(path.join(ROOT, DEFAULTS.bundle_output));
    assert.equal(_bundle.records.length, RECORDS_BUDGET.total_records, 'records.length must be exactly 19');
    const roleRecords = _bundle.records.filter((r) => r.kind === 'live_replay_record');
    const drillRecords = _bundle.records.filter((r) => r.kind === 'drill_replay_record');
    assert.equal(roleRecords.length, RECORDS_BUDGET.role_records, 'role partition must be exactly 16');
    assert.equal(drillRecords.length, RECORDS_BUDGET.drill_records, 'drill partition must be exactly 3');
  });

  // ---- 4. Division coverage ------------------------------------------------

  await t.test('bundle: all Div1..Div7 present in role space', function () {
    const roles = new Set(_bundle.records.map((r) => r.role));
    for (const division of DIVISION_ROLES) {
      assert.ok(roles.has(division), 'division missing from bundle.records: ' + division);
    }
  });

  // ---- 5. Three-verdict contract -------------------------------------------

  await t.test('bundle.embedded_classification.verdicts carries bounded orchestration/evidence/launch vocabulary', function () {
    const verdicts = _bundle.embedded_classification.verdicts;
    assert.ok(verdicts && typeof verdicts === 'object', 'verdicts must be an object');
    assert.ok(verdicts.orchestration && typeof verdicts.orchestration === 'string');
    assert.ok(verdicts.evidence && typeof verdicts.evidence === 'string');
    assert.ok(verdicts.launch && typeof verdicts.launch === 'string');
    assert.ok(ORCHESTRATION_VERDICTS.indexOf(verdicts.orchestration) >= 0,
      'orchestration ' + verdicts.orchestration + ' not in ORCHESTRATION_VERDICTS');
    assert.ok(EVIDENCE_VERDICTS.indexOf(verdicts.evidence) >= 0,
      'evidence ' + verdicts.evidence + ' not in EVIDENCE_VERDICTS');
    assert.ok(LAUNCH_VERDICTS.indexOf(verdicts.launch) >= 0,
      'launch ' + verdicts.launch + ' not in LAUNCH_VERDICTS');
    assert.ok(verdicts.launch !== 'GO_BOUNDED_INTERNAL',
      'canonical launch verdict must NOT be GO_BOUNDED_INTERNAL (R041 promotion-grade evidence still requires S06 admission)');
  });

  // ---- 6. HG1..HG8 worksheet rows ------------------------------------------

  let _worksheet;
  await t.test('bundle.scoring_worksheet.rows carries exactly 8 HG1..HG8 rows in canonical order', function () {
    _worksheet = _readJson(path.join(ROOT, DEFAULTS.worksheet_output));
    assert.equal(_worksheet.rows.length, 8, 'scoring_worksheet.rows must have 8 entries');
    for (let index = 0; index < HARD_GATE_IDS.length; index += 1) {
      assert.equal(_worksheet.rows[index].criterion_id, HARD_GATE_IDS[index],
        'rows[' + index + '].criterion_id mismatch: expected ' + HARD_GATE_IDS[index] + ', got ' + _worksheet.rows[index].criterion_id);
    }
    assert.equal(_worksheet.rows.reduce((sum, row) => sum + row.weight, 0), 1.0,
      'sum of rows[].weight must equal exactly 1.0');
    // Per-row arithmetic invariant: contribution = round(numeric_mapping * weight, 6).
    // Contribution sum is NOT necessarily equal to weight_sum — contributions
    // depend on the per-row numeric_mapping which is 1 (pass) / 0.5
    // (not_proven) / 0 (fail_closed) per contract.buildScoringWorksheet.
    for (const row of _worksheet.rows) {
      const expectedContribution = Math.round((row.numeric_mapping * row.weight + Number.EPSILON) * 1e6) / 1e6;
      assert.equal(row.contribution, expectedContribution,
        'row.contribution must equal round(numeric_mapping * weight, 6); got ' + row.contribution + ' for ' + row.criterion_id);
      assert.ok(['pass', 'not_proven', 'fail_closed'].indexOf(row.raw_state) >= 0,
        'row.raw_state must be one of pass/not_proven/fail_closed; got ' + row.raw_state);
      assert.ok(typeof row.numeric_mapping === 'number', 'row.numeric_mapping must be number');
      assert.ok(typeof row.weight === 'number', 'row.weight must be number');
    }
  });

  await t.test('bundle.scoring_worksheet.steps carries exactly 3 weighted steps (orchestration/evidence/launch)', function () {
    assert.equal(_worksheet.steps.length, 3, 'scoring_worksheet.steps must have 3 entries');
    const stepNames = _worksheet.steps.map((s) => s.step);
    assert.ok(stepNames.indexOf('step_orchestration') >= 0, 'must include step_orchestration');
    assert.ok(stepNames.indexOf('step_evidence') >= 0, 'must include step_evidence');
    assert.ok(stepNames.indexOf('step_launch') >= 0, 'must include step_launch');
    const sumWeights = _worksheet.steps.reduce((acc, s) => acc + s.weight, 0);
    assert.ok(Math.abs(sumWeights - 1.0) < 1e-9,
      'sum of steps[].weight must equal exactly 1.0; got ' + sumWeights);
    assert.equal(typeof _worksheet.score, 'number', 'worksheet.score must be a number');
    assert.ok(_worksheet.score >= 0 && _worksheet.score <= 1,
      'worksheet.score must be in [0,1]; got ' + _worksheet.score);
  });

  // ---- 7. Zero-blockers invariant ------------------------------------------

  await t.test('bundle.blockers === [] and producer-protocol.blockers === [] and verify-protocol.blockers === []', function () {
    assert.deepEqual(_bundle.blockers, [], 'bundle.blockers must be empty');
    const producerProtocol = _readJson(path.join(ROOT, DEFAULTS.producer_protocol_output));
    assert.deepEqual(producerProtocol.blockers, [], 'producer-protocol.blockers must be empty');
    const verifyProtocol = _readJson(path.join(ROOT, DEFAULTS.verify_protocol_output));
    assert.deepEqual(verifyProtocol.blockers, [], 'verify-protocol.blockers must be empty');
  });

  // ---- 8. Replay equality + canonical pinning -----------------------------

  await t.test('bundle.replay_keys equality invariants (match=true, byte_identical=true, first==second)', function () {
    assert.equal(_bundle.replay_keys.match, true, 'replay_keys.match must be true');
    assert.equal(_bundle.replay_keys.byte_identical, true, 'replay_keys.byte_identical must be true');
    assert.equal(_bundle.replay_keys.first_run_provenance_hash, _bundle.replay_keys.second_run_provenance_hash,
      'first_run_provenance_hash must equal second_run_provenance_hash (canonical byte-stability)');
    // Cross-equal of bundle.bundle_digest against canonical body sha256 (T02 known-issue).
    const expectedDigest = contract.computeBundleBodyDigest(_bundle);
    assert.equal(_bundle.bundle_digest, expectedDigest,
      'bundle.bundle_digest must equal computed canonical body sha256');
  });

  await t.test('verify-protocol.replay_keys agree with bundle.replay_keys (independent re-derivation)', function () {
    const verifyProtocol = _readJson(path.join(ROOT, DEFAULTS.verify_protocol_output));
    assert.equal(verifyProtocol.replay_keys.first_run_provenance_hash, _bundle.replay_keys.first_run_provenance_hash,
      'verify-protocol.first_run must agree with bundle.first_run');
    assert.equal(verifyProtocol.replay_keys.replay_key, _bundle.replay_keys.replay_key,
      'verify-protocol.replay_key must agree with bundle.replay_key (independent re-derivation)');
  });

  await t.test('verify-protocol recorded three verdicts + iterations=3 + producer_cli_imported=false', function () {
    const verifyProtocol = _readJson(path.join(ROOT, DEFAULTS.verify_protocol_output));
    assert.equal(verifyProtocol.iterations, 3, 'verify-protocol.iterations must be 3');
    assert.deepEqual(verifyProtocol.verdicts, _bundle.embedded_classification.verdicts,
      'verify-protocol.verdicts must agree with bundle.embedded_classification.verdicts');
    assert.equal(verifyProtocol.producer_cli_imported, false,
      'verify-protocol.producer_cli_imported must be false (verifier never requires producer CLI)');
    assert.equal(verifyProtocol.network_calls, 0, 'verify-protocol.network_calls must be 0');
    assert.equal(verifyProtocol.mutation_count, 0, 'verify-protocol.mutation_count must be 0');
    assert.ok(Array.isArray(verifyProtocol.verifier_imports) && verifyProtocol.verifier_imports.length >= 2,
      'verify-protocol.verifier_imports must list both data + contract modules');
  });

  // ---- 9. Forbidden-field absence ------------------------------------------

  await t.test('no forbidden replay verdict (GO/PASS_AUTOMATIC/READY/LAUNCH_GO) anywhere in sidecars', function () {
    const refs = [
      DEFAULTS.bundle_output,
      DEFAULTS.worksheet_output,
      DEFAULTS.admission_output,
      DEFAULTS.producer_protocol_output,
      DEFAULTS.verify_protocol_output,
    ];
    for (const ref of refs) {
      const raw = _readFileWithRetry(path.join(ROOT, ref));
      for (const forbidden of FORBIDDEN_REPLAY_VERDICTS) {
        // Use a strict boundary check: forbid word-boundary-anchored matches so
        // 'GO_BOUNDED_INTERNAL' is NOT false-positive (the substring 'GO' appears
        // there but it is the legitimate launch promotion value).
        const re = new RegExp('\\b' + forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
        if (forbidden === 'GO') {
          // 'GO' is too short for \b boundary to be reliable; require uppercase-G-O
          // only as a stand-alone verdict token (preceded by ':', ',', or '"').
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

  // ---- 10. Verifier-independence (static grep) ----------------------------

  await t.test('verifier source does NOT require producer CLI (static analysis)', function () {
    const verifierSource = fs.readFileSync(
      path.join(ROOT, 'scripts/verify_m016_s05_seven_division_replay.js'),
      'utf8',
    );
    // Forbid any require/import of the producer CLI — both quoted and unquoted
    // variants, plus any line that touches `produce_m016_s05_seven_division_replay`.
    const forbiddenPatterns = [
      /require\(\s*['"]\.\/produce_m016_s05_seven_division_replay['"]\s*\)/,
      /require\(\s*['"][^'"]*produce_m016_s05_seven_division_replay[^'"]*['"]\s*\)/,
      /from\s+['"][^'"]*produce_m016_s05_seven_division_replay[^'"]*['"]/,
      /import\(\s*['"][^'"]*produce_m016_s05_seven_division_replay[^'"]*['"]\s*\)/,
    ];
    for (const re of forbiddenPatterns) {
      assert.equal(re.test(verifierSource), false,
        'verifier source must NOT require/import the producer CLI: ' + re);
    }
  });

  await t.test('verifier module-level guard rejects require.cache[PRODUCER_CLI_PATH] (runtime independence)', function () {
    // The require.cache[require.resolve("./produce_*.js")] guard is the
    // runtime equivalent of the static-analysis check above. Ensure the
    // multi-line `PRODUCER_CLI_PATH = require.resolve('./produce_*.js');
    // if (require.cache[PRODUCER_CLI_PATH]) { ... }` declaration is present
    // in the verifier source so future refactors cannot silently remove the
    // defence-in-depth guarantee.
    const verifierSource = fs.readFileSync(
      path.join(ROOT, 'scripts/verify_m016_s05_seven_division_replay.js'),
      'utf8',
    );
    const hasGuard = /require\.resolve\(\s*['"]\.\/produce_m016_s05_seven_division_replay(\.js)?['"]\s*\)/.test(verifierSource)
      && /require\.cache\[\s*PRODUCER_CLI_PATH\s*\]/.test(verifierSource);
    assert.ok(hasGuard, 'verifier must declare require.cache guard against producer CLI module (PRODUCER_CLI_PATH = require.resolve(...) paired with if (require.cache[PRODUCER_CLI_PATH]))');
  });

  // ---- 11. Tamper negative-fixtures artifact round-trip --------------------

  await t.test('negative-fixtures artifact exists + has 24 fixtures + non-zero exit codes + unique blocker codes', function () {
    const negativeRef = DEFAULTS.negative_fixtures_output;
    const abs = path.join(ROOT, negativeRef);
    assert.ok(fs.existsSync(abs), 'negative-fixtures artifact missing at ' + negativeRef);
    const raw = _readJson(abs);
    assert.equal(raw.task, 'T05', 'task must be T05');
    assert.equal(raw.milestone, MILESTONE, 'milestone must match');
    assert.equal(raw.slice, SLICE, 'slice must be S05');
    assert.equal(raw.fixture_count, 24, 'fixture_count must be 24');
    assert.equal(raw.fixtures.length, 24, 'fixtures array must have 24 entries');
    assert.equal(raw.non_zero_exit_codes, true, 'every expected_blocker_code must map to non-zero exit');
    // Unique blocker codes
    const codes = raw.fixtures.map((f) => f.expected_blocker_code);
    const unique = new Set(codes);
    assert.equal(unique.size, codes.length, 'expected_blocker_codes must be unique (' + codes.length + ' distinct)');
    // Cross-check vs tamper matrix FIXTURES array by reading the runner
    const tamperSource = _expectedT05TamperFixtures();
    assert.ok(/FIXTURES = Object\.freeze\(\[\n[\s\S]+?\]\);/.test(tamperSource),
      'tamper test must declare a FIXTURES Object.freeze([...]) array');
    for (const fixture of raw.fixtures) {
      assert.ok(tamperSource.indexOf("id: '" + fixture.fixture_id + "'") >= 0,
        'fixture ' + fixture.fixture_id + ' missing from tamper FIXTURES array');
    }
  });

  // ---- 12. Producer CLI import sanity on tamper matrix file --------------

  await t.test('tamper test does NOT import producer CLI directly (only spawns subprocess)', function () {
    const tamperSource = fs.readFileSync(
      path.join(ROOT, 'scripts/test_m016_s05_seven_division_replay_tamper.js'),
      'utf8',
    );
    // Forbid require() of the producer CLI — tamper test must spawn a child
    // process so the verifier's require.cache guard stays meaningful.
    const forbidden = /require\(\s*['"]\.\/produce_m016_s05_seven_division_replay['"]\s*\)/;
    assert.equal(forbidden.test(tamperSource), false,
      'tamper test must not require() the producer CLI');
    // The harness IS allowed to spawn it as a child process. Grep for spawnSync.
    assert.ok(/spawnSync\s*\(\s*['"]node['"]/.test(tamperSource),
      'tamper test should spawn verifier as fresh Node subprocess via spawnSync');
  });

  await t.test('verification suite path is referenced by negative-fixtures runner_command', function () {
    const raw = _readJson(path.join(ROOT, DEFAULTS.negative_fixtures_output));
    assert.equal(raw.runner_command, 'node --test scripts/test_m016_s05_seven_division_replay_tamper.js');
    assert.ok(raw.evaluation_command.indexOf('verify_m016_s05_seven_division_replay.js') >= 0,
      'evaluation_command should reference the verifier');
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
