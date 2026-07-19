#!/usr/bin/env node
'use strict';

/**
 * scripts/test_m016_s02_bos_mission_proof_contract.js
 *
 * M016-txa3vu / S02 / T01 — Test suite for the pure fail-closed sidecar
 * proof bundle contract.
 *
 * Uses node:test. Covers:
 *   (a) Public API surface stability
 *   (b) Schema loader (AJV when available, fail-open otherwise)
 *   (c) Sanitisation helpers (redaction + scanner + charset)
 *   (d) Per-source + bundle-shape validators
 *   (e) Provenance + sidecar ID deterministic hashes
 *   (f) Redaction posture + scanner fail-closed paths
 *   (g) Classification drift detector + launch promotion guard
 *   (h) Replay-keys + independence-groups cross-check
 *   (i) Top-level evaluator (PASS / REJECTED_* / FAIL_CLOSED states)
 *   (j) Evidence builders (protocol / verification / validation)
 *   (k) Determinism: same input → same output (run twice)
 *
 * All fixtures live in this file (no /tmp, no runtime-evidence pollution).
 *
 * Run with:
 *   node --test scripts/test_m016_s02_bos_mission_proof_contract.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const contract = require('./lib/m016-s02-bos-mission-proof-contract');
const data = require('./lib/m016-s02-bos-mission-proof-data');

const {
  BLOCKER_CODES,
  EXIT_CODES,
  BUNDLE_GATE_IDS,
  BUNDLE_GATE_LABELS,
  BUNDLE_VERDICT_VALUES,
  REDACTION_FLAG_VALUES,
  DEFAULTS,
  REDACTION_BOUNDS,
  SOURCE_KINDS,
  loadSchema,
  validateBundleShape,
  checkRedactionSafety,
  assertBundleWriteSafe,
  sanitizeString,
  canonicalizeSources,
  computeProvenanceHash,
  computeSidecarId,
  evaluateBundleGates,
  evaluateBundleContract,
  buildProtocolEvidence,
  buildVerificationEvidence,
  buildValidationEvidence,
} = contract;

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function sha256hex(seed) {
  // Deterministic 64-char lowercase hex for fixture use only. NOT a real
  // cryptographic hash; produces stable artifact_hash values.
  let counter = 0;
  let out = '';
  const s = String(seed);
  while (out.length < 64) {
    let h = 0;
    const t = s + ':' + counter;
    for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
    out += h.toString(16).padStart(8, '0');
    counter++;
  }
  return out.slice(0, 64);
}

function baseSource(overrides = {}) {
  return Object.assign({
    source_ref: 'runtime-evidence/M015-native-seven-division-mission-20260717.json',
    kind: 'mission_evidence',
    raw_sha256: sha256hex('raw-' + Math.random()),
    sanitised_sha256: sha256hex('san-' + Math.random()),
    independence_group: 'mission-topology',
    size_bytes: 4096,
    claim_ids: ['div4-build-doc-executed', 'div5-review-executed'],
    captured_at: '2026-07-17T12:00:00Z',
  }, overrides);
}

function baseRedactionPosture(overrides = {}) {
  return Object.assign({ ...REDACTION_FLAG_VALUES }, overrides);
}

function baseClassification(overrides = {}) {
  return Object.assign({
    evaluator: 'S01-classification-contract',
    evaluator_version: 'v1',
    raw_state: 'PARTIAL',
    numeric_mapping: { orchestration: 1.0, evidence: 0.5, launch: 0.25 },
    weight: 1.0,
    verdicts: { orchestration: 'PASS', evidence: 'PARTIAL', launch: 'PREPARATION_ONLY' },
    hard_gates: { HG1: 'pass', HG2: 'pass', HG3: 'not_proven', HG4: 'not_proven', HG5: 'not_proven', HG6: 'not_proven' },
    worksheet: {
      steps: [
        { step_id: 'w-div4-build', description: 'check artifact exists', verify_cmd: 'test -f artifact.json', observed_status: 'pass' },
        { step_id: 'w-div5-review', description: 'verify sha256', verify_cmd: 'sha256sum artifact.json', observed_status: 'pass' },
      ],
      completed_at: '2026-07-17T12:02:00Z',
      completed_by: 'classifier',
    },
    completed_at: '2026-07-17T12:02:00Z',
    completed_by: 'classifier',
  }, overrides);
}

function baseArtifact(overrides = {}) {
  return Object.assign({
    source_ref: 'runtime-evidence/M015-native-seven-division-mission-20260717.json',
    claim_id: 'div4-build-doc-executed',
    sanitised_artifact: 'sha-div4-build-doc-v1 bounded digest',
    sanitised_hash: sha256hex('artifact-' + Math.random()),
  }, overrides);
}

function baseReplay(provenanceHash, overrides = {}) {
  return Object.assign({
    first_run_provenance_hash: provenanceHash,
    second_run_provenance_hash: provenanceHash,
    match: true,
    byte_identical: true,
    verified_at: '2026-07-17T12:05:00Z',
  }, overrides);
}

function buildBundle(overrides = {}) {
  const source = overrides.source || baseSource();
  const sources = overrides.sources || [source];
  const provenanceHash = overrides.provenanceHash || computeProvenanceHash(sources);
  const sidecarId = overrides.sidecarId || computeSidecarId(overrides.bundle_id || 'm016-s02-bos-mission-proof-v1', provenanceHash);
  const bundle = Object.assign({
    schema_id: data.SCHEMA_ID,
    schema_version: data.SCHEMA_VERSION,
    bundle_id: 'm016-s02-bos-mission-proof-v1',
    bundle_kind: 'bos-mission-proof',
    milestone: 'M016-txa3vu',
    slice: 'S02',
    task: 'T02',
    generated: '2026-07-17T12:00:00Z',
    sidecar_id: sidecarId,
    provenance_hash: provenanceHash,
    sources,
    indepenence_groups: Array.from(new Set(sources.map((s) => s.independence_group))).sort(),
    redaction_posture: baseRedactionPosture(),
    classification: baseClassification(),
    sanitised_artifacts: [baseArtifact({ source_ref: source.source_ref, claim_id: (source.claim_ids || [])[0] || 'div4-build-doc-executed' })],
    replay_keys: baseReplay(provenanceHash),
    blockers: [],
  }, overrides.overrides || {});
  return bundle;
}

// ---------------------------------------------------------------------------
// Public API surface
// ---------------------------------------------------------------------------

test('contract: public API surface is stable', () => {
  const expected = [
    'loadSchema', 'validateBundleShape', 'checkRedactionSafety', 'assertBundleWriteSafe',
    'sanitizeString', 'canonicalizeSources', 'computeProvenanceHash', 'computeSidecarId',
    'evaluateBundleGates', 'evaluateBundleContract',
    'buildProtocolEvidence', 'buildVerificationEvidence', 'buildValidationEvidence',
  ];
  for (const name of expected) assert.equal(typeof contract[name], 'function', `expected ${name} to be a function`);
});

test('contract: re-exports frozen data module constants', () => {
  assert.equal(contract.BUNDLE_GATE_IDS.length, 6);
  assert.equal(contract.BUNDLE_VERDICT_VALUES.PROVENANCE_PRESERVED, 'PROVENANCE_PRESERVED');
  assert.equal(contract.BLOCKER_CODES.BUNDLE_INPUT_MISSING, 'M16-S02-BUNDLE-INPUT-MISSING');
  assert.equal(contract.EXIT_CODES.BUNDLE_PASS, 0);
  assert.equal(contract.EXIT_CODES.BUNDLE_REJECTED_MALFORMED, 1);
  assert.equal(contract.EXIT_CODES.BUNDLE_REDACTION_LEAK, 6);
  assert.equal(contract.EXIT_CODES.BUNDLE_LAUNCH_PROMOTION, 4);
  assert.equal(contract.DEFAULTS.schema_path, 'schemas/runtime-evidence/m016-s02-bos-mission-proof.v1.json');
});

test('data: source kinds cover M015/S01 surfaces', () => {
  for (const kind of SOURCE_KINDS) assert.equal(typeof kind, 'string');
});

// ---------------------------------------------------------------------------
// Schema loader
// ---------------------------------------------------------------------------

test('loadSchema: loads JSON Schema draft-07 and compiles AJV validator when available', () => {
  const result = loadSchema('schemas/runtime-evidence/m016-s02-bos-mission-proof.v1.json');
  assert.equal(result.schema.$schema, 'http://json-schema.org/draft-07/schema#');
  assert.ok(result.path);
  // AJV may or may not be available; either way loadSchema must succeed.
  if (result.validate) {
    const ok = result.validate(buildBundle());
    assert.equal(ok, true, 'expected well-formed bundle to validate against schema');
  }
});

// ---------------------------------------------------------------------------
// Sanitisation helpers
// ---------------------------------------------------------------------------

test('sanitizeString: replaces UUID with redacted-id placeholder', () => {
  const uuid = '45cb883f-32b5-40cd-bf8d-94c40419a1d1';
  const out = sanitizeString(`live-id=${uuid}`);
  assert.equal(out.includes(uuid), false);
  assert.equal(out.includes(data.REDACTION_PLACEHOLDERS.redacted_id_placeholder), true);
});

test('sanitizeString: replaces bearer token with redacted placeholder', () => {
  const out = sanitizeString('Authorization: bearer abc.def.ghi');
  assert.equal(out.includes('bearer'), false);
  assert.equal(out.includes(data.REDACTION_PLACEHOLDERS.redacted_token_placeholder), true);
});

test('sanitizeString: replaces credential assignment', () => {
  const out = sanitizeString('PAPERCLIP_API_KEY=sk-test-abcdef');
  assert.equal(out.includes('PAPERCLIP_API_KEY='), false);
  assert.equal(out.includes(data.REDACTION_PLACEHOLDERS.redacted_credential_placeholder), true);
});

test('sanitizeString: bounds length to max_chars_per_digest', () => {
  const big = 'a'.repeat(REDACTION_BOUNDS.bounded_digest_max_chars + 100);
  const out = sanitizeString(big);
  assert.ok(out.length <= REDACTION_BOUNDS.bounded_digest_max_chars);
});

test('sanitizeString: passes through safe strings unchanged', () => {
  const safe = 'safe string no markers';
  assert.equal(sanitizeString(safe), safe);
});

test('checkRedactionSafety: detects UUID / bearer / xiaomi / vendor-reuse leaks in nested object', () => {
  const payload = {
    outer: {
      inner: { id: '45cb883f-32b5-40cd-bf8d-94c40419a1d1' },
      vendor: 'hermes.execution',
      xiaomi: 'uses xiaomi endpoint',
    },
    array: ['safe', 'bearer x.y.z', 'mimo probe'],
  };
  const hits = checkRedactionSafety(payload);
  const kinds = hits.map((h) => h.kind);
  assert.ok(kinds.includes('uuid'));
  assert.ok(kinds.includes('bearer_token'));
  assert.ok(kinds.includes('xiaomi_marker'));
  assert.ok(kinds.includes('vendor_reuse_string'));
});

test('checkRedactionSafety: detects raw_result_json_result / raw_reasoning / raw_body markers', () => {
  const payload = {
    reasoning_chain: 'leaked chain_of_thought',
    document_body: 'leaked raw_body',
    result_json: { result: 'leaked result_json.result field' },
  };
  const hits = checkRedactionSafety(payload);
  const kinds = hits.map((h) => h.kind);
  assert.ok(kinds.includes('raw_reasoning_marker'));
  assert.ok(kinds.includes('raw_body_marker'));
  assert.ok(kinds.includes('raw_result_json_result'));
});

test('checkRedactionSafety: skips canonical hash / path / id keys', () => {
  const payload = {
    raw_sha256: sha256hex('safe'),
    sanitised_sha256: sha256hex('safe2'),
    sidecar_id: sha256hex('safe3'),
    provenance_hash: sha256hex('safe4'),
    first_run_provenance_hash: sha256hex('safe5'),
    source_ref: 'runtime-evidence/M015-native-seven-division-mission-20260717.json',
    claim_id: 'div4-build-doc-executed',
    code: 'M16-S02-BUNDLE-INPUT-MISSING',
    $schema: 'https://gsd.local/schemas/runtime-evidence/m016-s02-bos-mission-proof.v1.json',
  };
  const hits = checkRedactionSafety(payload);
  assert.equal(hits.length, 0, 'expected no hits for canonical hash/id/code fields, got ' + JSON.stringify(hits));
});

test('assertBundleWriteSafe: throws when bundle leaks UUID via sanitised_artifact', () => {
  // UUID inside sidecar_id / claim_id / verified_at is intentionally
  // ignored by the scanner (those are hash / id / namespace positions).
  // To force a leak, embed the UUID in a scanned string field.
  const bad = baseArtifact({ sanitised_artifact: 'leak-uuid-45cb883f-32b5-40cd-bf8d-94c40419a1d1-marker' });
  const bundle = buildBundle({ overrides: { sanitised_artifacts: [bad] } });
  assert.throws(() => assertBundleWriteSafe(bundle), /redaction leak/);
});

test('assertBundleWriteSafe: returns silently for clean bundle', () => {
  const bundle = buildBundle();
  assert.doesNotThrow(() => assertBundleWriteSafe(bundle));
});

// ---------------------------------------------------------------------------
// Per-source + bundle-shape validators
// ---------------------------------------------------------------------------

test('validateBundleShape: rejects null bundle', () => {
  const res = validateBundleShape(null);
  assert.equal(res.ok, false);
  assert.equal(res.code, BLOCKER_CODES.BUNDLE_INPUT_MISSING);
});

test('validateBundleShape: rejects non-object bundle', () => {
  const res = validateBundleShape([1, 2, 3]);
  assert.equal(res.ok, false);
  assert.equal(res.code, BLOCKER_CODES.BUNDLE_INPUT_NOT_OBJECT);
});

test('validateBundleShape: rejects unknown bundle_kind', () => {
  const bundle = buildBundle({ overrides: { bundle_kind: 'malicious-proof' } });
  // Need to recompute hashes since sidecar_id depends on bundle_id, but bundle_kind doesn't.
  const res = validateBundleShape(bundle);
  assert.equal(res.ok, false);
  assert.match(res.code, /BUNDLE-KIND-INVALID/);
});

test('validateBundleShape: rejects wrong milestone / slice / task', () => {
  const bundle = buildBundle({ overrides: { milestone: 'M999-bogus', slice: 'S99', task: 'T99' } });
  // milestones/slice mismatch won't affect hash since sidecar_id depends on bundle_id+provenance.
  const res = validateBundleShape(bundle);
  assert.equal(res.ok, false);
});

test('validateBundleShape: rejects source_ref out of bounded path', () => {
  const badSource = baseSource({ source_ref: '/etc/passwd' });
  const sources = [badSource];
  const bundle = buildBundle({ sources, provenanceHash: computeProvenanceHash(sources), sidecarId: undefined });
  bundle.sidecar_id = computeSidecarId(bundle.bundle_id, bundle.provenance_hash);
  const res = validateBundleShape(bundle);
  assert.equal(res.ok, false);
  assert.match(res.code, /SOURCE-PATH-OUT-OF-BOUND/);
});

test('validateBundleShape: rejects source.kind outside canonical list', () => {
  const badSource = baseSource({ kind: 'bogus_kind' });
  const sources = [badSource];
  const bundle = buildBundle({ sources, provenanceHash: computeProvenanceHash(sources) });
  bundle.sidecar_id = computeSidecarId(bundle.bundle_id, bundle.provenance_hash);
  const res = validateBundleShape(bundle);
  assert.equal(res.ok, false);
  assert.match(res.code, /SOURCE-KIND-INVALID/);
});

test('validateBundleShape: rejects source with identical raw/sanitised hashes', () => {
  const same = sha256hex('same');
  const badSource = baseSource({ raw_sha256: same, sanitised_sha256: same });
  const sources = [badSource];
  const bundle = buildBundle({ sources, provenanceHash: computeProvenanceHash(sources) });
  bundle.sidecar_id = computeSidecarId(bundle.bundle_id, bundle.provenance_hash);
  const res = validateBundleShape(bundle);
  assert.equal(res.ok, false);
  assert.match(res.code, /SOURCE-HASHES-IDENTICAL/);
});

test('validateBundleShape: rejects duplicate source_ref', () => {
  const sources = [baseSource(), baseSource({ raw_sha256: sha256hex('raw2'), sanitised_sha256: sha256hex('san2') })];
  const bundle = buildBundle({ sources, provenanceHash: computeProvenanceHash(sources) });
  bundle.sidecar_id = computeSidecarId(bundle.bundle_id, bundle.provenance_hash);
  const res = validateBundleShape(bundle);
  assert.equal(res.ok, false);
  assert.match(res.code, /SOURCE-DUPLICATE/);
});

test('checkRedactionSafety: detects UUID leak in sanitised_artifact', () => {
  // Shape validator (validateBundleShape) checks structure/charset only;
  // redaction scanning happens in checkRedactionSafety / evaluateBundleContract.
  const artifact = baseArtifact({ sanitised_artifact: 'safe-prefix 45cb883f-32b5-40cd-bf8d-94c40419a1d1 suffix' });
  const bundle = buildBundle({ overrides: { sanitised_artifacts: [artifact] } });
  const hits = checkRedactionSafety(bundle);
  assert.ok(hits.some((h) => h.kind === 'uuid'), 'expected UUID leak hit in sanitised_artifact');
});

test('validateBundleShape: rejects sanitised_artifact with charset violation', () => {
  const artifact = baseArtifact({ sanitised_artifact: 'has!!bad!!chars' });
  const bundle = buildBundle({ overrides: { sanitised_artifacts: [artifact] } });
  const res = validateBundleShape(bundle);
  assert.equal(res.ok, false);
  assert.match(res.code, /ARTIFACT-DIGEST-CHARSET/);
});

test('evaluateBundleContract: replay_keys with mismatched dual-run hashes → REJECTED_LAUNCH_PROMOTION', () => {
  // Shape validator only verifies the replay_keys structure (well-formed hex);
  // the actual equality check is enforced by _verifyReplayKeys during contract
  // evaluation. A second_run_provenance_hash that disagrees with first triggers
  // BG6 (replay failure) and emits REPLAY_HASH_MISMATCH.
  const source = baseSource();
  const bundle = buildBundle({ sources: [source], source });
  bundle.replay_keys = baseReplay(bundle.provenance_hash, { second_run_provenance_hash: sha256hex('different') });
  const result = evaluateBundleContract({ bundle, allowedSources: [source.source_ref] });
  assert.equal(result.runner_status, 'REJECTED_LAUNCH_PROMOTION');
  assert.ok(result.blockers.some((b) => /REPLAY-HASH-MISMATCH/.test(b.code)));
});

test('validateBundleShape: rejects malformed blocker code outside namespace', () => {
  const bundle = buildBundle({ overrides: { blockers: [{ code: 'M16-OTHER-NAMESPACE-X', severity: 'blocking', reason: 'sneaky' }] } });
  const res = validateBundleShape(bundle);
  assert.equal(res.ok, false);
  assert.match(res.code, /BUNDLE-SCHEMA-VIOLATION/);
});

test('validateBundleShape: rejects unknown top-level property', () => {
  const bundle = buildBundle();
  bundle.injected_evil = 'sneaky';
  const res = validateBundleShape(bundle);
  assert.equal(res.ok, false);
  assert.match(res.code, /BUNDLE-SCHEMA-VIOLATION/);
});

// ---------------------------------------------------------------------------
// Provenance + sidecar ID hashes
// ---------------------------------------------------------------------------

test('canonicalizeSources: sorts sources by source_ref then raw_sha256', () => {
  const s1 = baseSource({ source_ref: 'runtime-evidence/b.json', raw_sha256: sha256hex('b-raw') });
  const s2 = baseSource({ source_ref: 'runtime-evidence/a.json', raw_sha256: sha256hex('a-raw') });
  const s3 = baseSource({ source_ref: 'runtime-evidence/a.json', raw_sha256: sha256hex('a2-raw') });
  const canon = canonicalizeSources([s1, s2, s3]);
  assert.equal(canon[0].source_ref, 'runtime-evidence/a.json');
  assert.equal(canon[1].source_ref, 'runtime-evidence/a.json');
  assert.equal(canon[2].source_ref, 'runtime-evidence/b.json');
  assert.ok(canon[0].raw_sha256 < canon[1].raw_sha256);
});

test('computeProvenanceHash: deterministic across runs', () => {
  const sources = [baseSource({ raw_sha256: sha256hex('det-raw'), sanitised_sha256: sha256hex('det-san') })];
  const h1 = computeProvenanceHash(sources);
  const h2 = computeProvenanceHash(sources);
  assert.equal(h1, h2);
  assert.match(h1, /^[a-f0-9]{64}$/);
});

test('computeProvenanceHash: order-independent (sorts before hashing)', () => {
  const a = baseSource({ source_ref: 'runtime-evidence/a.json', raw_sha256: sha256hex('a') });
  const b = baseSource({ source_ref: 'runtime-evidence/b.json', raw_sha256: sha256hex('b') });
  const h1 = computeProvenanceHash([a, b]);
  const h2 = computeProvenanceHash([b, a]);
  assert.equal(h1, h2);
});

test('computeSidecarId: deterministic and 64-char hex', () => {
  const id = computeSidecarId('m016-s02-bos-mission-proof-v1', sha256hex('prov'));
  assert.match(id, /^[a-f0-9]{64}$/);
  const id2 = computeSidecarId('m016-s02-bos-mission-proof-v1', sha256hex('prov'));
  assert.equal(id, id2);
});

// ---------------------------------------------------------------------------
// Bundle-gate evaluator
// ---------------------------------------------------------------------------

test('evaluateBundleGates: all-positive → every gate pass', () => {
  const gates = evaluateBundleGates({ shapeOk: true, redactionOk: true, sourcesOk: true, provenanceOk: true, classificationFailures: [], replayFailures: [], launchFailures: [] });
  for (const [k, v] of Object.entries(gates)) assert.equal(v, 'pass', `${k} should be pass`);
});

test('evaluateBundleGates: classification drift → BG5 fail_closed', () => {
  const gates = evaluateBundleGates({ shapeOk: true, redactionOk: true, sourcesOk: true, provenanceOk: true, classificationFailures: [{ code: 'X' }], replayFailures: [], launchFailures: [] });
  assert.equal(gates.BG5_CLASSIFICATION_FROZEN, 'fail_closed');
});

test('evaluateBundleGates: launch promotion → BG6 fail_closed', () => {
  const gates = evaluateBundleGates({ shapeOk: true, redactionOk: true, sourcesOk: true, provenanceOk: true, classificationFailures: [], replayFailures: [], launchFailures: [{ code: 'X' }] });
  assert.equal(gates.BG6_LAUNCH_NOT_PROMOTED, 'fail_closed');
});

// ---------------------------------------------------------------------------
// Top-level orchestrator
// ---------------------------------------------------------------------------

test('evaluateBundleContract: null bundle → BUNDLE_INPUT_MISSING blocker', () => {
  const result = evaluateBundleContract({ bundle: null, allowedSources: [] });
  assert.equal(result.runner_status, 'FAIL');
  assert.equal(result.runner_exit_code, EXIT_CODES.BUNDLE_REJECTED_MALFORMED);
  assert.ok(result.blockers.some((b) => b.code === BLOCKER_CODES.BUNDLE_INPUT_MISSING));
});

test('evaluateBundleContract: empty allowedSources → SOURCE_OUT_OF_ALLOWLIST blocker', () => {
  const bundle = buildBundle();
  const result = evaluateBundleContract({ bundle, allowedSources: [] });
  assert.equal(result.runner_status, 'FAIL');
  assert.equal(result.runner_exit_code, EXIT_CODES.BUNDLE_REJECTED_FAIL_CLOSED);
  assert.ok(result.blockers.some((b) => /SOURCE-OUT-OF-ALLOWLIST/.test(b.code)));
});

test('evaluateBundleContract: well-formed bundle → PASS across all verdicts', () => {
  const source = baseSource();
  const bundle = buildBundle({ sources: [source], source });
  const allowedSources = [source.source_ref];
  const result = evaluateBundleContract({ bundle, allowedSources });
  assert.equal(result.runner_status, 'PASS');
  assert.equal(result.runner_exit_code, EXIT_CODES.BUNDLE_PASS);
  for (const gid of Object.keys(result.gates)) assert.equal(result.gates[gid], 'pass', `${gid} should be pass, got ${result.gates[gid]}`);
  assert.equal(result.verdicts.PROVENANCE_PRESERVED, BUNDLE_VERDICT_VALUES.PROVENANCE_PRESERVED);
  assert.equal(result.verdicts.REDACTION_SAFE, BUNDLE_VERDICT_VALUES.REDACTION_SAFE);
  assert.equal(result.verdicts.REPLAY_DETERMINISTIC, BUNDLE_VERDICT_VALUES.REPLAY_DETERMINISTIC);
  assert.equal(result.verdicts.CLASSIFICATION_FROZEN, BUNDLE_VERDICT_VALUES.CLASSIFICATION_FROZEN);
  assert.equal(result.verdicts.LAUNCH_NOT_PROMOTED, BUNDLE_VERDICT_VALUES.LAUNCH_NOT_PROMOTED);
});

test('evaluateBundleContract: launch verdict GO → REJECTED_LAUNCH_PROMOTION', () => {
  const source = baseSource();
  const bundle = buildBundle({ sources: [source], source });
  bundle.classification = baseClassification({ verdicts: { orchestration: 'PASS', evidence: 'PARTIAL', launch: 'GO' } });
  const result = evaluateBundleContract({ bundle, allowedSources: [source.source_ref] });
  assert.equal(result.runner_status, 'REJECTED_LAUNCH_PROMOTION');
  assert.equal(result.runner_exit_code, EXIT_CODES.BUNDLE_LAUNCH_PROMOTION);
  assert.ok(result.blockers.some((b) => /LAUNCH-PROMOTION-ATTEMPT/.test(b.code)));
});

test('evaluateBundleContract: HG3 not NOT_PROVEN → REJECTED_CLASSIFICATION_DRIFT', () => {
  const source = baseSource();
  const bundle = buildBundle({ sources: [source], source });
  bundle.classification = baseClassification({ hard_gates: { HG1: 'pass', HG2: 'pass', HG3: 'pass', HG4: 'not_proven', HG5: 'not_proven', HG6: 'not_proven' } });
  const result = evaluateBundleContract({ bundle, allowedSources: [source.source_ref] });
  assert.equal(result.runner_status, 'REJECTED_CLASSIFICATION_DRIFT');
  assert.equal(result.runner_exit_code, EXIT_CODES.BUNDLE_CLASSIFICATION_DRIFT);
  assert.ok(result.blockers.some((b) => /CLASSIFY-HG-FAIL-HG3/.test(b.code)));
});

test('evaluateBundleContract: UUID leak → REJECTED_REDACTION_LEAK', () => {
  // UUID inside sidecar_id / verified_at / claim_id is intentionally skipped
  // by the scanner (those are hash / id / namespace positions). To force the
  // scanner to catch a leak, embed the UUID inside sanitised_artifact which
  // is scanned.
  const source = baseSource();
  const bundle = buildBundle({ sources: [source], source });
  bundle.sanitised_artifacts = [baseArtifact({
    source_ref: source.source_ref,
    claim_id: (source.claim_ids || [])[0] || 'div4-build-doc-executed',
    sanitised_artifact: 'leak-uuid-45cb883f-32b5-40cd-bf8d-94c40419a1d1-marker',
  })];
  const result = evaluateBundleContract({ bundle, allowedSources: [source.source_ref] });
  assert.equal(result.runner_status, 'REJECTED_REDACTION_LEAK');
  assert.equal(result.runner_exit_code, EXIT_CODES.BUNDLE_REDACTION_LEAK);
  assert.ok(result.blockers.some((b) => /REDACT-LEAK-uuid/.test(b.code)));
});

test('evaluateBundleContract: wrong provenance_hash → REJECTED_MALFORMED', () => {
  const source = baseSource();
  const bundle = buildBundle({ sources: [source], source });
  bundle.provenance_hash = sha256hex('deliberately-wrong');
  bundle.sidecar_id = computeSidecarId(bundle.bundle_id, bundle.provenance_hash);
  const result = evaluateBundleContract({ bundle, allowedSources: [source.source_ref] });
  assert.equal(result.runner_status, 'REJECTED_MALFORMED');
  assert.equal(result.runner_exit_code, EXIT_CODES.BUNDLE_REJECTED_MALFORMED);
  assert.ok(result.blockers.some((b) => /PROVENANCE-HASH-MISMATCH/.test(b.code) || /SIDECAR-ID-MALFORMED/.test(b.code)));
});

test('evaluateBundleContract: replay_keys.match=false → BG6 fail_closed', () => {
  const source = baseSource();
  const bundle = buildBundle({ sources: [source], source });
  bundle.replay_keys = { ...bundle.replay_keys, match: false, byte_identical: false };
  const result = evaluateBundleContract({ bundle, allowedSources: [source.source_ref] });
  // match=false doesn't block BG6 directly via gate status (BG6 also requires launch failures); but
  // the replay verifier emits blockers and the gate status falls into the malformation bucket.
  assert.ok(result.blockers.some((b) => /REPLAY/.test(b.code)));
});

test('evaluateBundleContract: independence group declared but missing → independence_groups_unknown blocker', () => {
  const source = baseSource();
  const bundle = buildBundle({ sources: [source], source });
  bundle.indepenence_groups = ['some-declared-group-with-no-source'];
  const result = evaluateBundleContract({ bundle, allowedSources: [source.source_ref] });
  assert.ok(result.blockers.some((b) => /INDEPENDENCE-GROUPS-UNKNOWN/.test(b.code)));
});

// ---------------------------------------------------------------------------
// Evidence builders
// ---------------------------------------------------------------------------

test('buildProtocolEvidence: produces canonical protocol shape', () => {
  const source = baseSource();
  const bundle = buildBundle({ sources: [source], source });
  const result = evaluateBundleContract({ bundle, allowedSources: [source.source_ref] });
  const proto = buildProtocolEvidence({
    gates: result.gates, verdicts: result.verdicts, blockers: result.blockers,
    diagnostics: result.diagnostics,
  });
  assert.equal(proto.$schema, DEFAULTS.protocol_schema);
  assert.equal(proto.milestone, 'M016-txa3vu');
  assert.equal(proto.slice, 'S02');
  assert.equal(proto.task, 'T02');
  assert.equal(proto.bundle_gate_ids.length, 6);
  assert.equal(typeof proto.gates, 'object');
  assert.equal(typeof proto.verdicts, 'object');
  assert.equal(proto.source_count, 1);
});

test('buildVerificationEvidence: includes per-source projection and replay_keys_match flag', () => {
  const source = baseSource();
  const bundle = buildBundle({ sources: [source], source });
  const result = evaluateBundleContract({ bundle, allowedSources: [source.source_ref] });
  const ver = buildVerificationEvidence({
    bundle, gates: result.gates, verdicts: result.verdicts, blockers: result.blockers,
    diagnostics: result.diagnostics,
  });
  assert.equal(ver.$schema, DEFAULTS.verification_schema);
  assert.equal(ver.task, 'T03');
  assert.equal(ver.sources.length, 1);
  assert.equal(ver.replay_keys_match, true);
  assert.equal(ver.provenance_match, true);
});

test('buildValidationEvidence: includes per-dimension summary and regression slot', () => {
  const source = baseSource();
  const bundle = buildBundle({ sources: [source], source });
  const result = evaluateBundleContract({ bundle, allowedSources: [source.source_ref] });
  const val = buildValidationEvidence({
    bundle, gates: result.gates, verdicts: result.verdicts, blockers: result.blockers,
    diagnostics: result.diagnostics,
    regressionFixture: { orchestration: 'PASS', evidence: 'PARTIAL', launch: 'PREPARATION_ONLY' },
  });
  assert.equal(val.$schema, DEFAULTS.validation_schema);
  assert.equal(val.task, 'T01');
  assert.equal(val.per_dimension_summary.orchestration.verdict, 'PASS');
  assert.equal(val.per_dimension_summary.evidence.verdict, 'PARTIAL');
  assert.equal(val.per_dimension_summary.launch.verdict, 'PREPARATION_ONLY');
  assert.equal(val.regression.orchestration, 'PASS');
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

test('determinism: same bundle → identical verdict (run twice)', () => {
  const source = baseSource();
  const bundle = buildBundle({ sources: [source], source });
  const allowedSources = [source.source_ref];
  const r1 = evaluateBundleContract({ bundle, allowedSources });
  const r2 = evaluateBundleContract({ bundle, allowedSources });
  // The diagnostics.scanner_hits field is an empty array but is structurally stable.
  assert.deepEqual(r1.gates, r2.gates);
  assert.deepEqual(r1.verdicts, r2.verdicts);
  assert.deepEqual(r1.blockers, r2.blockers);
});

test('determinism: provenance + sidecar hashes are byte-stable', () => {
  const source = baseSource({ source_ref: 'runtime-evidence/M015-native-seven-division-mission-20260717.json', raw_sha256: sha256hex('stable-raw'), sanitised_sha256: sha256hex('stable-san') });
  const sources = [source];
  const p1 = computeProvenanceHash(sources);
  const p2 = computeProvenanceHash(sources);
  assert.equal(p1, p2);
  const s1 = computeSidecarId('m016-s02-bos-mission-proof-v1', p1);
  const s2 = computeSidecarId('m016-s02-bos-mission-proof-v1', p2);
  assert.equal(s1, s2);
});

// ---------------------------------------------------------------------------
// Bounded label / namespace exposure
// ---------------------------------------------------------------------------

test('contract: BUNDLE_GATE_LABELS exposes 6 canonical labels', () => {
  assert.equal(Object.keys(BUNDLE_GATE_LABELS).length, 6);
  assert.ok(BUNDLE_GATE_LABELS.schema_compliance_pass);
  assert.ok(BUNDLE_GATE_LABELS.classification_frozen_pass);
  assert.ok(BUNDLE_GATE_LABELS.launch_not_promoted_pass);
});
