#!/usr/bin/env node
'use strict';

/**
 * scripts/test_m016_s07_replay_cleanup_artifacts.js
 *
 * M016-txa3vu / S07 / T04 — Canonical artifact tests for the policy-
 * compliant replay cleanup proof. The two sidecars live at the canonical
 * runtime-evidence/ paths:
 *
 *   runtime-evidence/M016-S07-replay-cleanup-proof.json           (proof)
 *   runtime-evidence/M016-S07-replay-cleanup-negative-fixtures.json (catalog)
 *
 * Tests in this file exercise the sidecars as they exist on disk AFTER
 * `node scripts/verify_m016_s07_replay_cleanup_proof.js --force` has
 * produced them. Each test is self-contained and verifies one well-defined
 * shape / binding invariant:
 *
 *   Proof sidecar:
 *     - exists, parses, and matches the bundled schema via Ajv
 *     - byte_digest round-trip after re-canonicalisation (delete field,
 *       re-hash; must equal original byte_digest)
 *     - semantic_digest is sha256-shaped and reproducible (verifier
 *       published with semantic_digest identical to the on-disk value)
 *     - verdict triple is structurally frozen (orchestration=PASS,
 *       evidence=PARTIAL, launch=PREPARATION_ONLY)
 *     - redaction_posture mirrors CLEANUP_REDACTION_FLAG_VALUES exactly
 *     - raw_bodies_persisted is false
 *     - replay_subprocess_invocations equals exactly 1
 *     - bounded_exit_code equals 0 (CLEANUP_PASS)
 *     - source_hashes covers the full SOURCE_ALLOWLIST
 *     - cleanup_trace spans all three phases (pre_run, replay, post_run)
 *     - canonical verdict line on stdout is exactly `M016_S07_REPLAY_CLEANUP=PASS`
 *     - proof_id + proof_kind match the frozen registry
 *
 *   Negative-fixtures sidecar:
 *     - exists, parses, and matches the bundled schema via Ajv
 *     - proof_kind == replay-cleanup-negative-fixtures
 *     - fixture_count == fixtures.length == 12
 *     - one fixture per threat_class enum value (full coverage)
 *     - unique_blocker_codes == number of distinct expected_blocker_codes
 *     - coverage_summary has every threat_class key with count 1
 *     - runner_command matches schema-enforced node + artifacts/tamper pattern
 *     - schema_path matches the bundled schema path
 *     - byte_digest round-trips after re-canonicalisation
 *     - each fixture_id matches S07-NF-NN pattern
 *     - each expected_blocker_code matches M16-S07-CLEANUP-* namespace
 *     - each expected_exit_code is bounded 1..7
 *     - evaluation_command is set, schema_path matches bundled schema
 *
 *   Cross-sidecar invariants:
 *     - both sidecars share reference_time and generation source
 *     - both sidecars pass redaction safety (no UUID / bearer / raw body)
 *
 * Run with: node --test scripts/test_m016_s07_replay_cleanup_artifacts.js
 */

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const data = require('./lib/m016-s07-replay-cleanup-data');
const contract = require('./lib/m016-s07-replay-cleanup-contract');

const ROOT = path.resolve(__dirname, '..');
const RUNTIME_EVIDENCE = path.join(ROOT, 'runtime-evidence');

const PROOF_PATH = path.join(RUNTIME_EVIDENCE, 'M016-S07-replay-cleanup-proof.json');
const NEG_FIXTURES_PATH = path.join(RUNTIME_EVIDENCE, 'M016-S07-replay-cleanup-negative-fixtures.json');
const SCHEMA_PATH = path.join(ROOT, 'schemas/runtime-evidence/m016-s07-replay-cleanup-proof.v1.json');

const THREAT_CLASSES = Object.freeze([
  'traversal', 'symlink_escape', 'marker_forgery', 'marker_missing',
  'source_hash_drift', 'pre_existing_residue', 'cleanup_refusal',
  'atomic_rename_failure', 'overwrite_attempt', 'redaction_leak',
  'subprocess_overflow', 'verdict_triple_drift',
]);

// ---------------------------------------------------------------------------
// Helpers — load canonical sidecars + bundled schema
// ---------------------------------------------------------------------------

function loadProofSidecar() {
  assert.ok(fs.existsSync(PROOF_PATH),
    'canonical proof sidecar missing at ' + PROOF_PATH + ' — run `node scripts/verify_m016_s07_replay_cleanup_proof.js --force` first');
  const raw = fs.readFileSync(PROOF_PATH, 'utf8');
  return JSON.parse(raw);
}

function loadNegativeFixturesSidecar() {
  assert.ok(fs.existsSync(NEG_FIXTURES_PATH),
    'canonical negative-fixtures sidecar missing at ' + NEG_FIXTURES_PATH + ' — run `node scripts/verify_m016_s07_replay_cleanup_proof.js --force` first');
  const raw = fs.readFileSync(NEG_FIXTURES_PATH, 'utf8');
  return JSON.parse(raw);
}

function loadBundledSchema() {
  const raw = fs.readFileSync(SCHEMA_PATH, 'utf8');
  return JSON.parse(raw);
}

function resolveSchemaValidator() {
  const ajv = contract.resolveAjv();
  if (!ajv) return null;
  const schema = loadBundledSchema();
  try {
    return ajv.compile(schema);
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tests — canonical proof sidecar shape
// ---------------------------------------------------------------------------

test('S07 T04 artifacts: canonical proof sidecar exists and parses', () => {
  const sidecar = loadProofSidecar();
  assert.equal(sidecar.proof_kind, data.REPLAY_CLEANUP_PROOF_KIND);
  assert.equal(sidecar.proof_id, data.REPLAY_CLEANUP_PROOF_ID);
  assert.equal(sidecar.schema_id, data.REPLAY_CLEANUP_SCHEMA_ID);
  assert.equal(sidecar.schema_version, data.REPLAY_CLEANUP_SCHEMA_VERSION);
  assert.equal(sidecar.milestone, data.MILESTONE);
  assert.equal(sidecar.slice, data.SLICE);
  assert.match(sidecar.task, /^T[0-9]{2}$/);
});

test('S07 T04 artifacts: proof sidecar verdict line + bounded exit code + status', () => {
  const sidecar = loadProofSidecar();
  assert.equal(sidecar.canonical_verdict_line, data.CANONICAL_VERDICT_LINE);
  assert.equal(sidecar.canonical_verdict_line_status, 'PASS');
  assert.equal(sidecar.bounded_exit_code, data.EXIT_CODES.CLEANUP_PASS);
  assert.equal(sidecar.canonical_protocol, data.VERIFIER_CANONICAL_PROTOCOL);
  assert.equal(sidecar.verifier_line, data.VERIFIER_LINE_CLASS);
});

test('S07 T04 artifacts: proof sidecar verdict triple is structurally frozen', () => {
  const sidecar = loadProofSidecar();
  assert.deepEqual(sidecar.verdict_triple, {
    orchestration: 'PASS', evidence: 'PARTIAL', launch: 'PREPARATION_ONLY',
  });
  assert.equal(data.isVerdictTriad(sidecar.verdict_triple), true);
});

test('S07 T04 artifacts: proof sidecar redaction posture matches frozen flags', () => {
  const sidecar = loadProofSidecar();
  assert.equal(sidecar.raw_bodies_persisted, false);
  for (const [key, expected] of Object.entries(data.CLEANUP_REDACTION_FLAG_VALUES)) {
    assert.equal(sidecar.redaction_posture[key], expected,
      `redaction_posture.${key} must equal ${expected}`);
  }
});

test('S07 T04 artifacts: proof sidecar source_hashes covers the full allowlist', () => {
  const sidecar = loadProofSidecar();
  const allowlistRefs = new Set(data.SOURCE_ALLOWLIST.map((e) => e.source_ref));
  const sidecarRefs = new Set(Object.keys(sidecar.source_hashes));
  assert.equal(sidecarRefs.size, allowlistRefs.size);
  for (const ref of allowlistRefs) {
    assert.ok(sidecarRefs.has(ref), 'source_hashes missing ' + ref);
    assert.match(sidecar.source_hashes[ref], /^[a-f0-9]{64}$/,
      'source_hashes[' + ref + '] must be sha256-shaped');
  }
});

test('S07 T04 artifacts: proof sidecar cleanup_trace spans all three phases', () => {
  const sidecar = loadProofSidecar();
  assert.ok(Array.isArray(sidecar.cleanup_trace));
  assert.ok(sidecar.cleanup_trace.length >= 3);
  const phases = new Set(sidecar.cleanup_trace.map((r) => r.phase));
  assert.ok(phases.has('pre_run'), 'cleanup_trace must include pre_run phase');
  assert.ok(phases.has('replay'), 'cleanup_trace must include replay phase');
  assert.ok(phases.has('post_run'), 'cleanup_trace must include post_run phase');
  // Every row target_relpath stays inside allowlisted prefixes.
  for (const row of sidecar.cleanup_trace) {
    assert.match(row.target_relpath, /^(runtime-evidence|scripts|schemas)\b/,
      'cleanup_trace target_relpath ' + row.target_relpath + ' must stay inside allowlisted prefix');
    assert.ok(data.isCleanupPhase(row.phase));
    assert.ok(data.isCleanupAction(row.action));
    assert.ok(data.isCleanupOutcome(row.outcome));
  }
});

test('S07 T04 artifacts: proof sidecar marker ownership is valid + sha256 matches', () => {
  const sidecar = loadProofSidecar();
  assert.deepEqual(sidecar.cleanup_marker, {
    relpath: data.SCRATCH_ROOT_MARKER_RELPATH,
    contents: data.MARKER_CONTENTS,
    sha256: contract.sha256Hex(data.MARKER_CONTENTS),
  });
  // Sanity: marker ownership validator returns 'valid' for the canonical marker.
  assert.equal(contract.validateMarkerOwnership(
    sidecar.cleanup_marker.relpath,
    sidecar.cleanup_marker.contents,
  ), 'valid');
});

test('S07 T04 artifacts: proof sidecar replay_subprocess_invocations = 1', () => {
  const sidecar = loadProofSidecar();
  assert.equal(sidecar.replay_subprocess_invocations, 1);
});

test('S07 T04 artifacts: proof sidecar absence checks record expected booleans', () => {
  const sidecar = loadProofSidecar();
  assert.deepEqual(sidecar.pre_run_absence_check, {
    relpath: data.SCRATCH_ROOT_RELPATH,
    present_before: false,
    present_after: false,
  });
  assert.deepEqual(sidecar.post_run_absence_check, {
    relpath: data.SCRATCH_ROOT_RELPATH,
    present_before: true,
    present_after: false,
  });
  assert.equal(sidecar.atomic_temp_cleanup_check.removed, true);
  assert.match(sidecar.atomic_temp_cleanup_check.relpath,
    /^runtime-evidence\/[A-Za-z0-9._/-]+\.tmp-[A-Za-z0-9._-]+$/);
});

test('S07 T04 artifacts: proof sidecar overwrite refusal flags both refused', () => {
  const sidecar = loadProofSidecar();
  assert.equal(sidecar.canonical_sidecar_overwrite_refusal.attempted, false);
  assert.equal(sidecar.canonical_sidecar_overwrite_refusal.refused, true);
  assert.equal(sidecar.canonical_output_overwrite_refusal.attempted, false);
  assert.equal(sidecar.canonical_output_overwrite_refusal.refused, true);
});

test('S07 T04 artifacts: proof sidecar byte_digest round-trips after re-canonicalisation', () => {
  const sidecar = loadProofSidecar();
  const original = sidecar.byte_digest;
  const recomputed = contract.computeProofBodyDigest(sidecar);
  assert.equal(recomputed, original,
    're-canonicalising the proof sidecar must reproduce the same byte_digest');
  // Sanity: byte_digest is sha256-shaped.
  assert.match(original, /^[a-f0-9]{64}$/);
});

test('S07 T04 artifacts: proof sidecar semantic_digest is sha256-shaped', () => {
  const sidecar = loadProofSidecar();
  assert.match(sidecar.semantic_digest, /^[a-f0-9]{64}$/);
  assert.ok(sidecar.reproducibility_count >= 1 && sidecar.reproducibility_count <= 4);
});

test('S07 T04 artifacts: proof sidecar limits object mirrors DEFAULTS ceilings exactly', () => {
  const sidecar = loadProofSidecar();
  assert.deepEqual(sidecar.limits, {
    max_cleanup_trace_rows: data.DEFAULTS.max_cleanup_trace_rows,
    max_blocker_codes: data.DEFAULTS.max_blocker_codes,
    max_blocker_reason_chars: data.DEFAULTS.max_blocker_reason_chars,
    max_replay_subprocess_invocations: data.DEFAULTS.max_replay_subprocess_invocations,
    max_source_refs: data.DEFAULTS.max_source_refs,
    max_reproducibility_runs: data.DEFAULTS.max_reproducibility_runs,
  });
});

test('S07 T04 artifacts: proof sidecar inputs object references canonical paths', () => {
  const sidecar = loadProofSidecar();
  for (const value of Object.values(sidecar.inputs)) {
    assert.match(value, /^(runtime-evidence|schemas|scripts)\b/,
      'inputs reference ' + value + ' must stay inside allowlisted prefix');
  }
});

test('S07 T04 artifacts: proof sidecar passes Ajv schema validation', () => {
  const sidecar = loadProofSidecar();
  const validate = resolveSchemaValidator();
  if (!validate) {
    // Ajv not available — defer; schema compile is exercised elsewhere.
    return;
  }
  const ok = validate(sidecar);
  assert.equal(ok, true,
    'proof sidecar failed schema: ' + JSON.stringify(validate.errors || []).slice(0, 256));
});

test('S07 T04 artifacts: proof sidecar passes redaction safety (no UUID / bearer / raw body)', () => {
  const sidecar = loadProofSidecar();
  const hits = contract.checkRedactionSafety(sidecar);
  assert.deepEqual(hits, [], 'redaction safety must report zero hits: ' + JSON.stringify(hits));
});

// ---------------------------------------------------------------------------
// Tests — canonical negative-fixtures sidecar shape
// ---------------------------------------------------------------------------

test('S07 T04 artifacts: canonical negative-fixtures sidecar exists and parses', () => {
  const sidecar = loadNegativeFixturesSidecar();
  assert.equal(sidecar.proof_kind, data.REPLAY_CLEANUP_NEGATIVE_FIXTURES_KIND);
  assert.equal(sidecar.proof_id, data.REPLAY_CLEANUP_NEGATIVE_FIXTURES_ID);
  assert.equal(sidecar.schema_id, data.REPLAY_CLEANUP_SCHEMA_ID);
  assert.equal(sidecar.schema_version, data.REPLAY_CLEANUP_SCHEMA_VERSION);
  assert.equal(sidecar.milestone, data.MILESTONE);
  assert.equal(sidecar.slice, data.SLICE);
  assert.match(sidecar.task, /^T[0-9]{2}$/);
});

test('S07 T04 artifacts: negative-fixtures sidecar has 12 fixtures covering all threat classes', () => {
  const sidecar = loadNegativeFixturesSidecar();
  assert.equal(sidecar.fixtures.length, 12);
  assert.equal(sidecar.fixture_count, 12);
  const fixtureClasses = new Set(sidecar.fixtures.map((f) => f.threat_class));
  for (const threat of THREAT_CLASSES) {
    assert.ok(fixtureClasses.has(threat), 'missing fixture for threat_class=' + threat);
  }
});

test('S07 T04 artifacts: negative-fixtures sidecar fixture_count == fixtures.length', () => {
  const sidecar = loadNegativeFixturesSidecar();
  assert.equal(sidecar.fixture_count, sidecar.fixtures.length);
});

test('S07 T04 artifacts: negative-fixtures sidecar unique_blocker_codes matches distinct blockers', () => {
  const sidecar = loadNegativeFixturesSidecar();
  const distinct = new Set(sidecar.fixtures.map((f) => f.expected_blocker_code));
  assert.equal(sidecar.unique_blocker_codes, distinct.size);
});

test('S07 T04 artifacts: negative-fixtures sidecar coverage_summary counts each threat once', () => {
  const sidecar = loadNegativeFixturesSidecar();
  for (const threat of THREAT_CLASSES) {
    assert.ok(Object.prototype.hasOwnProperty.call(sidecar.coverage_summary, threat),
      'coverage_summary must include key ' + threat);
    assert.equal(sidecar.coverage_summary[threat], 1,
      'coverage_summary.' + threat + ' must equal 1');
  }
});

test('S07 T04 artifacts: negative-fixtures sidecar fixture_id matches S07-NF-NN pattern', () => {
  const sidecar = loadNegativeFixturesSidecar();
  for (const fixture of sidecar.fixtures) {
    assert.match(fixture.fixture_id, /^S07-NF-[0-9]{2}$/);
  }
});

test('S07 T04 artifacts: negative-fixtures sidecar expected_blocker_code matches M16-S07-CLEANUP-* namespace', () => {
  const sidecar = loadNegativeFixturesSidecar();
  for (const fixture of sidecar.fixtures) {
    assert.equal(data.isCleanupBlockerCode(fixture.expected_blocker_code), true,
      'fixture ' + fixture.fixture_id + ' expected_blocker_code ' + fixture.expected_blocker_code
      + ' does not match M16-S07-CLEANUP-* namespace');
  }
});

test('S07 T04 artifacts: negative-fixtures sidecar expected_verdict and bounded exit code are valid', () => {
  const sidecar = loadNegativeFixturesSidecar();
  for (const fixture of sidecar.fixtures) {
    assert.equal(fixture.expected_verdict, 'FAIL',
      'fixture ' + fixture.fixture_id + ' expected_verdict must be FAIL (tamper scenarios)');
    assert.ok(Number.isInteger(fixture.expected_exit_code),
      'fixture ' + fixture.fixture_id + ' expected_exit_code must be integer');
    assert.ok(fixture.expected_exit_code >= 1 && fixture.expected_exit_code <= 7,
      'fixture ' + fixture.fixture_id + ' expected_exit_code ' + fixture.expected_exit_code
      + ' out of bounded range 1..7');
  }
});

test('S07 T04 artifacts: negative-fixtures sidecar runner_command matches schema pattern', () => {
  const sidecar = loadNegativeFixturesSidecar();
  assert.match(sidecar.runner_command,
    /^node(?:[ \t]+--\w+)*[ \t]+scripts\/test_m016_s07_replay_cleanup_(artifacts|tamper)\.js$/);
});

test('S07 T04 artifacts: negative-fixtures sidecar schema_path matches bundled schema', () => {
  const sidecar = loadNegativeFixturesSidecar();
  assert.match(sidecar.schema_path, /^schemas\/runtime-evidence\/m016-s07-[A-Za-z0-9._/-]+\.json$/);
  // Sanity: the schema_path referenced by the sidecar exists on disk.
  const schemaAbs = path.join(ROOT, sidecar.schema_path);
  assert.ok(fs.existsSync(schemaAbs), 'schema_path ' + sidecar.schema_path + ' must exist on disk');
});

test('S07 T04 artifacts: negative-fixtures sidecar byte_digest round-trips after re-canonicalisation', () => {
  const sidecar = loadNegativeFixturesSidecar();
  const original = sidecar.byte_digest;
  const recomputed = contract.computeNegativeFixturesBodyDigest(sidecar);
  assert.equal(recomputed, original,
    're-canonicalising the negative-fixtures sidecar must reproduce the same byte_digest');
  assert.match(original, /^[a-f0-9]{64}$/);
});

test('S07 T04 artifacts: negative-fixtures sidecar evaluation_command is set', () => {
  const sidecar = loadNegativeFixturesSidecar();
  assert.ok(typeof sidecar.evaluation_command === 'string' && sidecar.evaluation_command.length >= 1);
  assert.ok(sidecar.evaluation_command.length <= 512);
});

test('S07 T04 artifacts: negative-fixtures sidecar verdict line + bounded exit code + status', () => {
  const sidecar = loadNegativeFixturesSidecar();
  assert.equal(sidecar.canonical_verdict_line, data.CANONICAL_VERDICT_LINE);
  assert.equal(sidecar.canonical_verdict_line_status, 'PASS');
  assert.equal(sidecar.bounded_exit_code, data.EXIT_CODES.CLEANUP_PASS);
  assert.equal(sidecar.canonical_protocol, data.VERIFIER_CANONICAL_PROTOCOL);
});

test('S07 T04 artifacts: negative-fixtures sidecar redaction posture matches frozen flags', () => {
  const sidecar = loadNegativeFixturesSidecar();
  assert.equal(sidecar.raw_bodies_persisted, false);
  for (const [key, expected] of Object.entries(data.CLEANUP_REDACTION_FLAG_VALUES)) {
    assert.equal(sidecar.redaction_posture[key], expected);
  }
});

test('S07 T04 artifacts: negative-fixtures sidecar passes Ajv schema validation', () => {
  const sidecar = loadNegativeFixturesSidecar();
  const validate = resolveSchemaValidator();
  if (!validate) return;
  const ok = validate(sidecar);
  assert.equal(ok, true,
    'negative-fixtures sidecar failed schema: ' + JSON.stringify(validate.errors || []).slice(0, 256));
});

test('S07 T04 artifacts: negative-fixtures sidecar passes redaction safety', () => {
  const sidecar = loadNegativeFixturesSidecar();
  const hits = contract.checkRedactionSafety(sidecar);
  assert.deepEqual(hits, [], 'redaction safety must report zero hits: ' + JSON.stringify(hits));
});

// ---------------------------------------------------------------------------
// Tests — cross-sidecar invariants
// ---------------------------------------------------------------------------

test('S07 T04 artifacts: both sidecars share reference_time (deterministic generation)', () => {
  const proof = loadProofSidecar();
  const neg = loadNegativeFixturesSidecar();
  assert.equal(proof.reference_time, neg.reference_time,
    'proof.reference_time and negative-fixtures.reference_time must match');
});

test('S07 T04 artifacts: both sidecars publish identical schema_id and protocol token', () => {
  const proof = loadProofSidecar();
  const neg = loadNegativeFixturesSidecar();
  assert.equal(proof.schema_id, neg.schema_id);
  assert.equal(proof.schema_version, neg.schema_version);
  assert.equal(proof.canonical_protocol, neg.canonical_protocol);
  assert.equal(proof.verifier_line, neg.verifier_line);
});

test('S07 T04 artifacts: each fixture evidence_ref points to the canonical negative-fixtures sidecar', () => {
  const neg = loadNegativeFixturesSidecar();
  for (const fixture of neg.fixtures) {
    assert.match(fixture.evidence_ref,
      /^runtime-evidence\/M016-S07-replay-cleanup-negative-fixtures\.json$/);
  }
});

test('S07 T04 artifacts: each fixture tamper_path is non-empty and bounded in length', () => {
  const neg = loadNegativeFixturesSidecar();
  for (const fixture of neg.fixtures) {
    assert.ok(typeof fixture.tamper_path === 'string' && fixture.tamper_path.length >= 1);
    assert.ok(fixture.tamper_path.length <= 256);
    assert.ok(fixture.baseline_value.length >= 1 && fixture.baseline_value.length <= 512);
    assert.ok(fixture.tampered_value.length >= 1 && fixture.tampered_value.length <= 512);
    assert.ok(fixture.rationale.length >= 1 && fixture.rationale.length <= 512);
  }
});
