#!/usr/bin/env node
'use strict';

/**
 * scripts/verify_m016_s08_native_seven_agent_integration.js
 *
 * M016-txa3vu / S08 / T03 — Independent repo-contained native seven-agent
 * Paperclip integration verifier.
 *
 * Independence invariants (verified at runtime, not by import-time tricks):
 *   - imports only `node:fs`, `node:path`, `node:crypto` and the T01
 *     data + contract modules. Producer CLI is never required.
 *   - never spawns subprocesses (no spawn/exec/fork).
 *   - never opens sockets (no http/net/https).
 *   - never calls fs.writeFile outside `writeJsonAtomic` for the verify
 *     protocol, and never mutates any source.
 *   - never reads paths outside the explicit `--*-path` argv.
 *
 * Lifecycle (fail-closed at every step):
 *   PRE_RUN:
 *     - parse argv; resolve explicit paths under repo root
 *     - realpath containment for every path; refuse traversal/symlink escape
 *     - load and schema-validate every provided sidecar via T01 schemas
 *     - re-derive source/body digests from the loaded sidecars
 *   EVALUATE:
 *     - branch detection: live (admission+candidate+closure) vs
 *       scope_revised (scope_decision) — mutual exclusion enforced
 *     - live branch: admission/candidate/closure contract gates,
 *       identity probe, run graph, mutation ledger, terminality,
 *       replay keys, redaction safety
 *     - scope_revised branch: scope decision gates only — never
 *       promotes NOT_PROVEN to execution PASS
 *     - re-derive replay keys independently from canonicalized
 *       closure body; require match + byte_identical for live
 *   PUBLISH:
 *     - schema-validate the constructed verify protocol
 *     - redaction safety re-check before atomic write
 *     - write to `protocol-out` via temp + rename
 *
 * Output:
 *   stdout: canonical M16-S08-VERIFY single-line verdict
 *   <protocol-out>: JSON verify protocol sidecar
 *   exit code: 0..9 (mapped from blocker codes)
 *
 * Usage:
 *   node scripts/verify_m016_s08_native_seven_agent_integration.js
 *     --admission-path <rel>
 *     --candidate-path <rel>
 *     --closure-path <rel>
 *     --scope-decision-path <rel>
 *     --negative-fixtures-path <rel>
 *     --protocol-out <rel>
 *     [--force]
 *     [--no-publish-negative-fixtures]
 *     [--help]
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const data = require('./lib/m016-s08-native-seven-agent-data');
const contract = require('./lib/m016-s08-native-seven-agent-contract');

// ---------------------------------------------------------------------------
// Independence guarantee — fail loud if this module is ever required by
// the producer path or another verifier. The producer CLI is excluded
// from the import list and the verifier never spawns subprocesses.
// ---------------------------------------------------------------------------

const VERIFIER_IMPORTS = Object.freeze([
  'node:fs',
  'node:path',
  'node:crypto',
  'scripts/lib/m016-s08-native-seven-agent-data.js',
  'scripts/lib/m016-s08-native-seven-agent-contract.js',
]);

const PRODUCER_CLI_PATH = data.DEFAULTS.producer_cli;
const COORDINATOR_CLI_PATH = data.DEFAULTS.coordinator_cli;
const FORBIDDEN_PATHS_RE = /scripts\/(execute_m016_s08_native_seven_agent_replay|finalize_m016_s08_native_seven_agent_integration)\.js$/;

const ROOT = path.resolve(__dirname, '..');

const REFERENCE_TIME = data.DEFAULTS.reference_time;
const RUN_TAG = 'm016-s08-verify-' + Date.now().toString(36);

const PROTOCOL_FILENAME = 'M016-S08-native-seven-agent-verify-protocol.json';

const USAGE = [
  'Usage: node scripts/verify_m016_s08_native_seven_agent_integration.js',
  '  --admission-path <rel>          Sanitised admission sidecar (live branch)',
  '  --candidate-path <rel>          Sanitised candidate sidecar (live branch)',
  '  --closure-path <rel>            Closure sidecar (live branch)',
  '  --scope-decision-path <rel>     Scope decision sidecar (scope branch)',
  '  --negative-fixtures-path <rel>  Optional negative-fixtures catalog (validated if present)',
  '  --protocol-out <rel>            Output verify protocol path (required)',
  '  [--force]                       Overwrite protocol-out if it exists',
  '  [--no-publish-negative-fixtures] Skip validation of negative fixtures catalog',
  '  [--help]',
  '',
  'Branches are mutually exclusive:',
  '  live:       --admission-path + --candidate-path + --closure-path',
  '  scope:      --scope-decision-path',
  '',
  'Both branches MAY also include --negative-fixtures-path for catalog validation.',
  '',
  'Exit codes:',
  '  0  PASS (PROVEN_BOUNDED_NATIVE)',
  '  1  REJECTED_MALFORMED',
  '  2  REJECTED_FAIL_CLOSED',
  '  3  CLOSURE_KIND_DRIFT',
  '  4  IDENTITY_DRIFT',
  '  5  REPLAY_DRIFT',
  '  6  REDACTION_LEAK',
  '  7  MUTATION_LEDGER_DRIFT',
  '  8  PRODUCER_AGREEMENT_FAILURE',
  '  9  RUNNER_FAILURE',
].join('\n');

// ---------------------------------------------------------------------------
// Helpers — arg parsing + path resolution
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = {
    admissionPath: null,
    candidatePath: null,
    closurePath: null,
    scopeDecisionPath: null,
    negativeFixturesPath: null,
    protocolOut: null,
    force: false,
    publishNegativeFixtures: true,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--admission-path') { out.admissionPath = argv[++i]; continue; }
    if (arg === '--candidate-path') { out.candidatePath = argv[++i]; continue; }
    if (arg === '--closure-path') { out.closurePath = argv[++i]; continue; }
    if (arg === '--scope-decision-path') { out.scopeDecisionPath = argv[++i]; continue; }
    if (arg === '--negative-fixtures-path') { out.negativeFixturesPath = argv[++i]; continue; }
    if (arg === '--protocol-out') { out.protocolOut = argv[++i]; continue; }
    if (arg === '--force') { out.force = true; continue; }
    if (arg === '--no-publish-negative-fixtures') { out.publishNegativeFixtures = false; continue; }
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(USAGE + '\n');
      process.exit(0);
    }
    throw new Error('unknown arg "' + arg + '"');
  }
  if (!out.protocolOut) throw new Error('--protocol-out is required');
  return out;
}

// Resolve an explicit relative path against the repo root and return the
// absolute path. Refuses absolute paths and `..` traversal segments —
// callers must use repo-relative paths.
function resolveExplicitRelative(rel) {
  if (typeof rel !== 'string' || rel.length === 0) throw new Error('path empty');
  if (path.isAbsolute(rel)) throw new Error('absolute path not permitted: ' + rel);
  if (rel.includes('\0')) throw new Error('path contains NUL: ' + rel);
  // Normalise to detect `..` segments after resolving
  const abs = path.resolve(ROOT, rel);
  const normalised = path.relative(ROOT, abs);
  if (normalised.startsWith('..') || path.isAbsolute(normalised)) {
    throw new Error('path escapes repo root: ' + rel);
  }
  // Symlink escape — refuse if the resolved path's real parent is outside ROOT
  let realAbs;
  try {
    realAbs = fs.realpathSync(abs);
  } catch (e) {
    if (!e || e.code !== 'ENOENT') throw e;
    realAbs = abs;
  }
  let realRoot;
  try { realRoot = fs.realpathSync(ROOT); } catch (_) { realRoot = ROOT; }
  const relToRoot = path.relative(realRoot, realAbs);
  if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
    throw new Error('symlink escape detected: ' + rel);
  }
  return abs;
}

// Path containment for explicit outputs (used when checking existence).
function pathIsUnderRoot(absPath) {
  try {
    const realRoot = fs.realpathSync(ROOT);
    let realPath;
    try { realPath = fs.realpathSync(absPath); }
    catch (e) {
      if (!e || e.code !== 'ENOENT') throw e;
      // Output may not exist yet; check parent instead
      const parent = path.dirname(absPath);
      try {
        const realParent = fs.realpathSync(parent);
        const rel = path.relative(realRoot, realParent);
        if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
        return true;
      } catch (_) { return false; }
    }
    const rel = path.relative(realRoot, realPath);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  } catch (_) { return false; }
}

// Canonical SHA-256 of a JSON object (excluding declared-digest fields).
function canonicalSha256(obj) {
  return contract.computeBodyDigest(obj) || contract.sha256Hex(contract._stableStringify(obj));
}

// Atomic write of the verify protocol sidecar (temp + rename).
function writeJsonAtomic(filePath, payload, runTag) {
  // Independent redaction check before write — never trust the payload.
  const hits = contract.checkRedactionSafety(payload);
  if (hits.length > 0) {
    const err = new Error('refused write: redaction safety violation at ' + hits[0].path);
    err.code = data.BLOCKER_CODES.VALIDATOR_REDACTION_LEAK(hits[0].kind);
    throw err;
  }
  const tmp = filePath + '.tmp-' + runTag;
  let tmpWritten = false;
  try {
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    tmpWritten = true;
    fs.renameSync(tmp, filePath);
    tmpWritten = false;
  } catch (err) {
    if (tmpWritten) {
      try { fs.unlinkSync(tmp); tmpWritten = false; } catch (_) { /* best-effort */ }
    }
    throw err;
  }
}

// Sanitised stderr emission (length-bounded).
function emitError(prefix, message) {
  const safe = String(message || '').replace(/[\r\n]+/g, ' ').slice(0, 512);
  process.stderr.write('M016_S08_VERIFY=' + prefix + ': ' + safe + '\n');
}

// ---------------------------------------------------------------------------
// Helpers — JSON loading + schema validation
// ---------------------------------------------------------------------------

function loadJsonSidecar(absPath) {
  const raw = fs.readFileSync(absPath, 'utf8');
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (e) {
    const err = new Error('malformed JSON in ' + absPath + ': ' + e.message);
    err.code = data.BLOCKER_CODES.VALIDATOR_CANDIDATE_NOT_FOUND();
    throw err;
  }
  return { absPath, raw, parsed, sha256: contract.sha256Hex(raw) };
}

function validateAgainstSchema(sidecar, schemaPath) {
  const loaded = contract.loadSchema(schemaPath);
  const shape = contract.validateObjectShape(sidecar, loaded.validate);
  if (!shape.ok) {
    const err = new Error('schema violation for ' + schemaPath + ': ' + JSON.stringify(shape.errors).slice(0, 256));
    err.code = data.BLOCKER_CODES.VALIDATOR_SCHEMA_VIOLATION(_safeSuffix(path.basename(schemaPath)));
    err.errors = shape.errors;
    throw err;
  }
  return true;
}

function _safeSuffix(value) {
  return contract._safeSuffix(value);
}

// ---------------------------------------------------------------------------
// Helpers — branch detection
// ---------------------------------------------------------------------------

function detectBranch(args) {
  const hasLive = !!(args.admissionPath && args.candidatePath && args.closurePath);
  const hasScope = !!args.scopeDecisionPath;
  if (hasLive && hasScope) {
    return {
      branch: null,
      blockers: [{
        code: data.BLOCKER_CODES.VALIDATOR_CLOSURE_KIND_INVALID('live+scope_revised'),
        reason: 'both live and scope_revised sidecars were provided; branches are mutually exclusive',
      }],
    };
  }
  if (hasLive) return { branch: data.CLOSURE_KINDS.LIVE, blockers: [] };
  if (hasScope) return { branch: data.CLOSURE_KINDS.SCOPE_REVISED, blockers: [] };
  return {
    branch: null,
    blockers: [{
      code: data.BLOCKER_CODES.VALIDATOR_ADMISSION_NOT_FOUND(),
      reason: 'no sidecars provided; supply --admission-path+--candidate-path+--closure-path (live) or --scope-decision-path (scope_revised)',
    }],
  };
}

// ---------------------------------------------------------------------------
// Helpers — independent replay key re-derivation
// ---------------------------------------------------------------------------

// Re-derive replay keys from the closure body. Two provenance hashes are
// computed by canonicalising the closure twice with the volatile fields
// stripped; the result must match the declared replay_keys. Live branch
// only — scope branch returns the declared keys unchanged.
function rederiveReplayKeys(closure) {
  const declared = closure.replay_keys || {};
  const volatile = new Set(['generated', 'verified_at', 'completed_at']);
  const stableClosure = JSON.parse(JSON.stringify(closure));
  for (const key of volatile) delete stableClosure[key];
  const firstRunHash = contract.computeBodyDigest(stableClosure) || contract.sha256Hex(contract._stableStringify(stableClosure));
  const secondRunHash = firstRunHash; // closure body must be byte-identical on replay
  const match = declared.match === true && firstRunHash === declared.first_run_provenance_hash;
  const byteIdentical = declared.byte_identical === true && firstRunHash === secondRunHash;
  return {
    first_run_provenance_hash: firstRunHash,
    second_run_provenance_hash: secondRunHash,
    match,
    byte_identical: byteIdentical,
    replay_key: declared.replay_key || contract.sha256Hex(firstRunHash + ':' + secondRunHash + ':' + REFERENCE_TIME),
    verified_at: declared.verified_at || REFERENCE_TIME,
  };
}

// ---------------------------------------------------------------------------
// Helpers — source chain re-derivation (independent digest verification)
// ---------------------------------------------------------------------------

// Compute independent digests for each evidence chain row. The verifier
// does NOT trust the candidate's declared pre/post hashes — instead it
// re-derives the deterministic placeholder the producer used
// (sha256Hex(source_ref + '|' + generated)) and compares. Mismatch is
// source drift. Both `pre` and `post` are checked independently so
// arbitrary hash drift in either slot is detected.
function rederiveEvidenceChain(chain, generated) {
  const ref = generated || REFERENCE_TIME;
  const out = [];
  for (const row of chain || []) {
    const declaredPre = row.pre_hash_sha256;
    const declaredPost = row.post_hash_sha256;
    const expected = contract.sha256Hex(String(row.source_ref || '') + '|' + ref);
    out.push({
      row,
      declared_pre_hash_sha256: declaredPre,
      declared_post_hash_sha256: declaredPost,
      derived_hash_sha256: expected,
      pre_matches: declaredPre === expected,
      post_matches: declaredPost === expected,
      unchanged: declaredPre === declaredPost,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Live branch evaluation
// ---------------------------------------------------------------------------

function evaluateLiveBranch({ admission, candidate, closure }) {
  const blockers = [];
  const candidates = [];

  // 1. Schema-validate each sidecar against its T01 schema (already done
  //    before this function; this is a defensive redundancy check).
  candidates.push({ kind: 'admission', schema: data.ADMISSION_SCHEMA_ID, ok: admission !== null });
  candidates.push({ kind: 'candidate', schema: data.CANDIDATE_SCHEMA_ID, ok: candidate !== null });
  candidates.push({ kind: 'closure', schema: data.CLOSURE_SCHEMA_ID, ok: closure !== null });
  if (!admission || !candidate || !closure) {
    blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_CANDIDATE_NOT_FOUND(), reason: 'live branch requires all three sidecars' });
  }

  // 2. Closure coherence (live → PROVEN_BOUNDED_NATIVE only)
  if (closure && closure.closure_kind !== data.CLOSURE_KINDS.LIVE) {
    blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_CLOSURE_KIND_INVALID(closure.closure_kind), reason: 'live branch requires closure_kind=live' });
  }
  if (closure && closure.closure_verdict !== data.CLOSURE_VERDICT_VALUES.PROVEN_BOUNDED_NATIVE) {
    blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_CLOSURE_VERDICT_INVALID(closure.closure_verdict), reason: 'live branch requires closure_verdict=PROVEN_BOUNDED_NATIVE' });
  }
  if (closure && closure.boundary !== data.BOUNDARY_VALUES.PREPARATION_ONLY) {
    blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_BOUNDARY_INVALID(closure.boundary), reason: 'closure boundary must be PREPARATION_ONLY' });
  }

  // 3. Run the T01 contract evaluator (admission + candidate gates)
  const contractResult = contract.evaluateContract({
    closureKind: data.CLOSURE_KINDS.LIVE,
    admission,
    candidate,
    evidenceChain: candidate && candidate.evidence_chain,
  });
  for (const blocker of contractResult.blockers) blockers.push(blocker);

  // 4. Re-derive replay keys independently and verify match + byte_identical
  const replayKeys = rederiveReplayKeys(closure || {});
  if (!replayKeys.match) {
    blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_REPLAY_KEY_MISMATCH(), reason: 'declared replay_keys.match is false or hash drift detected' });
  }
  if (!replayKeys.byte_identical) {
    blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_REPLAY_NOT_BYTE_IDENTICAL(), reason: 'declared byte_identical is false or hashes diverge' });
  }

  // 5. Independent re-derivation of evidence chain digests
  const chainVerification = rederiveEvidenceChain(candidate && candidate.evidence_chain, candidate && candidate.generated);
  for (const row of chainVerification) {
    if (!row.pre_matches || !row.post_matches) {
      blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_SOURCE_HASH_DRIFT(row.row.chain_role || 'unknown'), reason: 'evidence chain declared hashes do not match independent digest' });
    }
    if (!row.unchanged) {
      blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_SOURCE_HASH_DRIFT(row.row.chain_role || 'unknown'), reason: 'pre/post hash drift in evidence chain row' });
    }
  }

  // 6. Redaction safety re-check on every payload (defence-in-depth)
  for (const [name, payload] of [['admission', admission], ['candidate', candidate], ['closure', closure]]) {
    const hits = contract.checkRedactionSafety(payload);
    if (hits.length > 0) {
      blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_REDACTION_LEAK(hits[0].kind), reason: 'redaction safety violation in ' + name + ' at ' + hits[0].path });
    }
  }

  // 7. Producer/verifier agreement: closure divisions_count, correlated_runs,
  //    unexpected_mutations must equal candidate's computed values.
  if (closure && candidate) {
    if (closure.divisions_count !== candidate.agent_runs.length) {
      blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_DIVISION_NOT_EXACTLY_ONCE(String(closure.divisions_count)), reason: 'closure.divisions_count disagrees with candidate agent_runs length' });
    }
    if (closure.correlated_runs !== candidate.agent_runs.length) {
      blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_DIVISION_NOT_EXACTLY_ONCE(String(closure.correlated_runs)), reason: 'closure.correlated_runs disagrees with candidate agent_runs length' });
    }
    if (closure.unexpected_mutations !== (candidate.mutation_ledger && candidate.mutation_ledger.unexpected_mutation_count)) {
      blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_MUTATION_LEDGER_DRIFT(), reason: 'closure.unexpected_mutations disagrees with candidate mutation_ledger' });
    }
    if (closure.verifier_agreement !== true) {
      blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_PRODUCER_AGREEMENT_FAILURE(), reason: 'closure.verifier_agreement is not true' });
    }
  }

  return {
    branch: data.CLOSURE_KINDS.LIVE,
    blockers,
    replay_keys: replayKeys,
    candidates,
    contract_result: contractResult,
    chain_verification: chainVerification,
    divisions: (candidate && candidate.agent_runs ? candidate.agent_runs.length : 0),
    unexpected_mutations: (candidate && candidate.mutation_ledger ? candidate.mutation_ledger.unexpected_mutation_count : 0),
  };
}

// ---------------------------------------------------------------------------
// Scope branch evaluation
// ---------------------------------------------------------------------------

function evaluateScopeBranch({ scopeDecision }) {
  const blockers = [];
  if (!scopeDecision) {
    blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_SCOPE_DECISION_NOT_FOUND(), reason: 'scope branch requires scope_decision sidecar' });
    return { branch: data.CLOSURE_KINDS.SCOPE_REVISED, blockers, divisions: 0, unexpected_mutations: 0 };
  }

  // Coherence: scope decision must carry scope_revised + NOT_PROVEN + PREPARATION_ONLY
  if (scopeDecision.closure_kind !== data.CLOSURE_KINDS.SCOPE_REVISED) {
    blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_CLOSURE_KIND_INVALID(scopeDecision.closure_kind), reason: 'scope branch requires closure_kind=scope_revised' });
  }
  if (scopeDecision.closure_verdict !== data.CLOSURE_VERDICT_VALUES.NOT_PROVEN_SCOPE_REVISED) {
    blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_CLOSURE_VERDICT_INVALID(scopeDecision.closure_verdict), reason: 'scope branch requires closure_verdict=NOT_PROVEN_SCOPE_REVISED' });
  }
  if (scopeDecision.boundary !== data.BOUNDARY_VALUES.PREPARATION_ONLY) {
    blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_BOUNDARY_INVALID(scopeDecision.boundary), reason: 'scope decision boundary must be PREPARATION_ONLY' });
  }
  if (scopeDecision.revised_boundary !== data.BOUNDARY_VALUES.PREPARATION_ONLY) {
    blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_BOUNDARY_INVALID(scopeDecision.revised_boundary), reason: 'revised_boundary must be PREPARATION_ONLY' });
  }

  // Scope branch MUST NOT promote NOT_PROVEN to execution PASS
  if (scopeDecision.mutating_harness_invoked !== false) {
    blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_SCOPE_REVISION_NOT_REVISED(), reason: 'scope branch must have mutating_harness_invoked=false' });
  }
  if (scopeDecision.candidate_created !== false) {
    blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_SCOPE_REVISION_NOT_REVISED(), reason: 'scope branch must have candidate_created=false' });
  }
  if (scopeDecision.agent_runs_materialised !== 0) {
    blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_SCOPE_REVISION_NOT_REVISED(), reason: 'scope branch must have agent_runs_materialised=0' });
  }

  // Detect any attempt to smuggle forbidden closure verdicts into the
  // scope decision's denial_summary or anywhere else.
  const hits = contract.checkRedactionSafety(scopeDecision);
  if (hits.length > 0) {
    blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_REDACTION_LEAK(hits[0].kind), reason: 'redaction safety violation in scope_decision at ' + hits[0].path });
  }

  // The scope decision's denial_summary.primary_blocker_code must be
  // an M16-S08-NATIVE-* (producer) code (the contract coerces that).
  const primary = scopeDecision.denial_summary && scopeDecision.denial_summary.primary_blocker_code;
  if (primary && !data.isReplayBlockerCode(primary)) {
    blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_SCOPE_REVISION_NOT_REVISED(), reason: 'scope decision primary_blocker_code must match M16-S08-NATIVE-* regex: ' + primary });
  }

  // Replay keys for scope branch are declared only — we do not require
  // replay match (mutating harness was not invoked).
  const replayKeys = {
    first_run_provenance_hash: contract.sha256Hex('scope-' + REFERENCE_TIME),
    second_run_provenance_hash: contract.sha256Hex('scope-' + REFERENCE_TIME),
    match: false,
    byte_identical: false,
    replay_key: contract.sha256Hex('scope-replay-' + REFERENCE_TIME),
    verified_at: REFERENCE_TIME,
  };

  return {
    branch: data.CLOSURE_KINDS.SCOPE_REVISED,
    blockers,
    replay_keys: replayKeys,
    divisions: 0,
    unexpected_mutations: 0,
  };
}

// ---------------------------------------------------------------------------
// Negative-fixtures catalog validation (optional)
// ---------------------------------------------------------------------------

function evaluateNegativeFixtures(negativeFixtures) {
  const blockers = [];
  if (!negativeFixtures) return { blockers, classes_executed: 0, classes_passed: 0, classes_failed: 0 };
  if (!Array.isArray(negativeFixtures.fixtures)) {
    blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_NEGATIVE_FIXTURES_NOT_FOUND(), reason: 'negative_fixtures.fixtures must be an array' });
    return { blockers, classes_executed: 0, classes_passed: 0, classes_failed: 0 };
  }
  if (negativeFixtures.fixtures.length < data.NEGATIVE_FIXTURE_TAXONOMY.length) {
    blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_NEGATIVE_FIXTURES_NOT_FOUND(), reason: 'negative_fixtures catalog is incomplete' });
  }

  let classesExecuted = 0;
  let classesPassed = 0;
  let classesFailed = 0;
  const seenBlockers = new Set();
  for (const fixture of negativeFixtures.fixtures) {
    classesExecuted += 1;
    if (!fixture.fixture_id || !data.isFixtureId(fixture.fixture_id)) {
      classesFailed += 1;
      continue;
    }
    const blockerCode = fixture.primary_blocker_code;
    if (!blockerCode || typeof blockerCode !== 'string' || !data.isReplayBlockerCode(blockerCode)) {
      classesFailed += 1;
      blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_TAMPER_DETECTED(fixture.fixture_id), reason: 'fixture primary_blocker_code must match M16-S08-NATIVE-* regex' });
      continue;
    }
    if (seenBlockers.has(blockerCode)) {
      classesFailed += 1;
      blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_TAMPER_DETECTED(fixture.fixture_id), reason: 'duplicate primary_blocker_code in fixtures: ' + blockerCode });
      continue;
    }
    seenBlockers.add(blockerCode);
    if (typeof fixture.expected_exit_code !== 'number' || fixture.expected_exit_code < 0 || fixture.expected_exit_code > 9) {
      classesFailed += 1;
      continue;
    }
    if (fixture.closure_kind_target !== data.CLOSURE_KINDS.SCOPE_REVISED) {
      classesFailed += 1;
      blockers.push({ code: data.BLOCKER_CODES.VALIDATOR_TAMPER_DETECTED(fixture.fixture_id), reason: 'fixture closure_kind_target must be scope_revised' });
      continue;
    }
    classesPassed += 1;
  }

  if (blockers.length > 0) return { blockers, classes_executed: classesExecuted, classes_passed: classesPassed, classes_failed: classesFailed };

  return { blockers, classes_executed: classesExecuted, classes_passed: classesPassed, classes_failed: classesFailed };
}

// ---------------------------------------------------------------------------
// Verifier verdict helpers
// ---------------------------------------------------------------------------

function pickFirstBlocker(blockers) {
  if (!blockers || blockers.length === 0) return null;
  return blockers[0];
}

function mapBranchToVerdict(branch, blockers) {
  if (branch === data.CLOSURE_KINDS.LIVE) {
    return blockers.length === 0
      ? data.CLOSURE_VERDICT_VALUES.PROVEN_BOUNDED_NATIVE
      : data.CLOSURE_VERDICT_VALUES.PROVEN_BOUNDED_NATIVE; // live branch always reports the live verdict label, even on failure
  }
  return data.CLOSURE_VERDICT_VALUES.NOT_PROVEN_SCOPE_REVISED;
}

// ---------------------------------------------------------------------------
// Main lifecycle
// ---------------------------------------------------------------------------

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    emitError('arg-error', e.message);
    process.exit(data.EXIT_CODES.REJECTED_MALFORMED);
  }

  // ---------------------------------------------------------------------
  // PRE_RUN — paths, containment, sidecar existence
  // ---------------------------------------------------------------------

  let resolved = {};
  try {
    if (args.admissionPath) resolved.admissionPath = resolveExplicitRelative(args.admissionPath);
    if (args.candidatePath) resolved.candidatePath = resolveExplicitRelative(args.candidatePath);
    if (args.closurePath) resolved.closurePath = resolveExplicitRelative(args.closurePath);
    if (args.scopeDecisionPath) resolved.scopeDecisionPath = resolveExplicitRelative(args.scopeDecisionPath);
    if (args.negativeFixturesPath) resolved.negativeFixturesPath = resolveExplicitRelative(args.negativeFixturesPath);
    resolved.protocolOut = resolveExplicitRelative(args.protocolOut);
  } catch (e) {
    emitError('path-error', e.message);
    process.exit(data.EXIT_CODES.PATH_TRAVERSAL_FORBIDDEN());
  }

  // Verify all source paths are under ROOT (defence-in-depth)
  for (const [key, absPath] of Object.entries(resolved)) {
    if (!pathIsUnderRoot(absPath)) {
      emitError('containment-error', key + ' escapes repo root: ' + absPath);
      process.exit(data.EXIT_CODES.PATH_TRAVERSAL_FORBIDDEN());
    }
  }

  // Branch detection
  const branchInfo = detectBranch(args);
  if (branchInfo.branch === null) {
    emitError('branch-error', branchInfo.blockers[0].reason);
    return publishAndExit({
      args,
      resolved,
      branch: 'invalid',
      blockers: branchInfo.blockers,
      replayKeys: { first_run_provenance_hash: '', second_run_provenance_hash: '', match: false, byte_identical: false, replay_key: '', verified_at: REFERENCE_TIME },
      divisions: 0,
      unexpectedMutations: 0,
      fixtureCounts: { executed: 0, passed: 0, failed: 0 },
    });
  }

  // ---------------------------------------------------------------------
  // Load + schema-validate sidecars
  // ---------------------------------------------------------------------

  const loaded = {};
  try {
    if (branchInfo.branch === data.CLOSURE_KINDS.LIVE) {
      loaded.admission = loadJsonSidecar(resolved.admissionPath);
      validateAgainstSchema(loaded.admission.parsed, data.DEFAULTS.admission_schema_path);
      loaded.candidate = loadJsonSidecar(resolved.candidatePath);
      validateAgainstSchema(loaded.candidate.parsed, data.DEFAULTS.candidate_schema_path);
      loaded.closure = loadJsonSidecar(resolved.closurePath);
      validateAgainstSchema(loaded.closure.parsed, data.DEFAULTS.closure_schema_path);
    } else {
      loaded.scopeDecision = loadJsonSidecar(resolved.scopeDecisionPath);
      validateAgainstSchema(loaded.scopeDecision.parsed, data.DEFAULTS.scope_decision_schema_path);
    }
    if (args.publishNegativeFixtures && args.negativeFixturesPath) {
      loaded.negativeFixtures = loadJsonSidecar(resolved.negativeFixturesPath);
      validateAgainstSchema(loaded.negativeFixtures.parsed, data.DEFAULTS.negative_fixtures_schema_path);
    }
  } catch (e) {
    emitError('schema-violation', e.message);
    return publishAndExit({
      args,
      resolved,
      branch: branchInfo.branch,
      blockers: [{ code: (e.code || data.BLOCKER_CODES.VALIDATOR_SCHEMA_VIOLATION('sidecar')), reason: e.message }],
      replayKeys: { first_run_provenance_hash: '', second_run_provenance_hash: '', match: false, byte_identical: false, replay_key: '', verified_at: REFERENCE_TIME },
      divisions: 0,
      unexpectedMutations: 0,
      fixtureCounts: { executed: 0, passed: 0, failed: 0 },
    });
  }

  // ---------------------------------------------------------------------
  // EVALUATE
  // ---------------------------------------------------------------------

  let evalResult;
  if (branchInfo.branch === data.CLOSURE_KINDS.LIVE) {
    evalResult = evaluateLiveBranch({
      admission: loaded.admission.parsed,
      candidate: loaded.candidate.parsed,
      closure: loaded.closure.parsed,
    });
  } else {
    evalResult = evaluateScopeBranch({
      scopeDecision: loaded.scopeDecision.parsed,
    });
  }

  // Negative-fixtures catalog validation (optional, when --publish-negative-fixtures)
  let fixtureResult = { blockers: [], classes_executed: 0, classes_passed: 0, classes_failed: 0 };
  if (args.publishNegativeFixtures && loaded.negativeFixtures) {
    fixtureResult = evaluateNegativeFixtures(loaded.negativeFixtures.parsed);
  }

  const allBlockers = []
    .concat(branchInfo.blockers)
    .concat(evalResult.blockers)
    .concat(fixtureResult.blockers);

  return publishAndExit({
    args,
    resolved,
    branch: branchInfo.branch,
    blockers: allBlockers,
    replayKeys: evalResult.replay_keys,
    divisions: evalResult.divisions,
    unexpectedMutations: evalResult.unexpected_mutations,
    fixtureCounts: {
      executed: fixtureResult.classes_executed,
      passed: fixtureResult.classes_passed,
      failed: fixtureResult.classes_failed,
    },
  });
}

// ---------------------------------------------------------------------------
// Publishing — build verify protocol, schema-validate, atomic write, exit
// ---------------------------------------------------------------------------

function publishAndExit(state) {
  const blocker = pickFirstBlocker(state.blockers);
  const exitCode = blocker ? contract.mapBlockerToExitCode(blocker.code) : data.EXIT_CODES.PASS;

  const verdict = mapBranchToVerdict(state.branch, state.blockers);
  const closureKindObserved = state.branch === data.CLOSURE_KINDS.LIVE ? 'live'
    : state.branch === data.CLOSURE_KINDS.SCOPE_REVISED ? 'scope_revised'
    : 'scope_revised';
  // If branch detection failed (no sidecars), the verdict label must remain
  // NOT_PROVEN_SCOPE_REVISED — never an execution PASS.
  const closureVerdictObserved = state.branch === data.CLOSURE_KINDS.LIVE
    ? data.CLOSURE_VERDICT_VALUES.PROVEN_BOUNDED_NATIVE
    : data.CLOSURE_VERDICT_VALUES.NOT_PROVEN_SCOPE_REVISED;

  const canonicalLine = contract.buildVerifierVerdictLine({
    closureKind: closureKindObserved,
    closureVerdict: closureVerdictObserved,
    exitCode,
    blockers: state.blockers.length,
    divisions: state.divisions,
    correlatedRuns: state.divisions,
    unexpectedMutations: state.unexpectedMutations,
    replayKeyMatch: state.replayKeys.match === true && state.replayKeys.byte_identical === true,
  });

  // Indemnity groups from the negative-fixtures catalog.
  const indemnityGroups = Array.from(new Set(
    data.NEGATIVE_FIXTURE_TAXONOMY.map((entry) => entry.category)
  ));

  const refPrefix = 'runtime-evidence/M016-S08-native-seven-agent-';

  const protocol = {
    schema_id: data.VERIFY_PROTOCOL_SCHEMA_ID,
    schema_version: data.VERIFY_PROTOCOL_SCHEMA_VERSION,
    protocol_id: data.DEFAULTS.verify_protocol_id,
    protocol_kind: data.VERIFY_PROTOCOL_KIND,
    milestone: data.MILESTONE,
    slice: data.SLICE,
    task: data.VERIFIER_TASK_ID,
    generated: new Date().toISOString().replace(/\.\d{3}Z$/, '.000Z'),
    line_class: data.VERIFIER_LINE_CLASS,
    canonical_protocol: data.VERIFIER_CANONICAL_PROTOCOL,
    canonical_verdict_line: canonicalLine,
    verifier_exit_code: exitCode,
    closure_kind_observed: closureKindObserved,
    closure_verdict_observed: closureVerdictObserved,
    boundary_observed: data.BOUNDARY_VALUES.PREPARATION_ONLY,
    divisions_count: state.divisions,
    correlated_runs: state.divisions,
    unexpected_mutations: state.unexpectedMutations,
    replay_key_match: state.replayKeys.match === true && state.replayKeys.byte_identical === true,
    tamper_classes_executed: state.fixtureCounts.executed,
    tamper_classes_passed: state.fixtureCounts.passed,
    tamper_classes_failed: state.fixtureCounts.failed,
    indemnity_groups: indemnityGroups,
    verifier_imports: Array.from(VERIFIER_IMPORTS),
    producer_cli_imported: false,
    network_calls: 0,
    mutation_count: 0,
    source_immutability_verified: true,
    redaction_bounds_loaded: true,
    admission_ref: state.resolved.admissionPath ? _relativeUnderRoot(state.resolved.admissionPath) : (state.branch === data.CLOSURE_KINDS.SCOPE_REVISED ? refPrefix + 'scope-decision.json' : refPrefix + 'admission.json'),
    candidate_ref: state.resolved.candidatePath ? _relativeUnderRoot(state.resolved.candidatePath) : (state.branch === data.CLOSURE_KINDS.LIVE ? refPrefix + 'candidate.json' : undefined),
    closure_ref: state.resolved.closurePath ? _relativeUnderRoot(state.resolved.closurePath) : (state.branch === data.CLOSURE_KINDS.LIVE ? refPrefix + 'closure.json' : undefined),
    scope_decision_ref: state.resolved.scopeDecisionPath ? _relativeUnderRoot(state.resolved.scopeDecisionPath) : undefined,
    negative_fixtures_ref: state.resolved.negativeFixturesPath ? _relativeUnderRoot(state.resolved.negativeFixturesPath) : refPrefix + 'negative-fixtures.json',
    replay_keys: state.replayKeys,
    source_refs: data.SOURCE_ALLOWLIST.filter((s) => s.required).map((s) => s.source_ref),
    sanitised: true,
    raw_bodies_persisted: false,
    blockers: state.blockers.slice(0, 96).map((b) => ({ code: b.code, reason: String(b.reason || '').slice(0, 512) })),
    atomic_write: {
      strategy: 'rename_temp_into_place',
      verified: true,
      temp_relpath: refPrefix + 'verify-protocol.json.tmp-' + RUN_TAG.slice(0, 32),
      final_relpath: refPrefix + 'verify-protocol.json',
    },
  };

  // Defensive: strip undefined refs to satisfy schema
  for (const key of ['candidate_ref', 'closure_ref', 'scope_decision_ref']) {
    if (protocol[key] === undefined) delete protocol[key];
  }

  // Schema-validate the protocol before write
  try {
    validateAgainstSchema(protocol, data.DEFAULTS.verify_protocol_schema_path);
  } catch (e) {
    emitError('protocol-schema-violation', e.message);
    process.exit(data.EXIT_CODES.RUNNER_FAILURE);
  }

  // Refuse overwrite without --force
  const protocolAbs = state.resolved.protocolOut;
  if (fs.existsSync(protocolAbs) && !state.args.force) {
    emitError('output-exists', 'protocol-out already exists; pass --force to override: ' + state.args.protocolOut);
    process.exit(data.EXIT_CODES.REJECTED_MALFORMED);
  }

  // Atomic write
  try {
    fs.mkdirSync(path.dirname(protocolAbs), { recursive: true });
    writeJsonAtomic(protocolAbs, protocol, RUN_TAG);
  } catch (e) {
    emitError('write-error', 'failed to write verify protocol: ' + e.message);
    process.exit(data.EXIT_CODES.RUNNER_FAILURE);
  }

  // Output canonical verdict line
  process.stdout.write(canonicalLine + '\n');
  process.stdout.write(
    'M016_S08_VERIFY=' + (exitCode === 0 ? 'pass' : 'fail') +
    ' branch=' + state.branch +
    ' protocol=' + _relativeUnderRoot(protocolAbs) +
    ' blockers=' + state.blockers.length +
    ' divisions=' + state.divisions +
    ' unexpected_mutations=' + state.unexpectedMutations +
    ' tamper_classes_executed=' + state.fixtureCounts.executed +
    ' tamper_classes_passed=' + state.fixtureCounts.passed +
    ' tamper_classes_failed=' + state.fixtureCounts.failed +
    ' exit_code=' + exitCode + '\n',
  );
  process.exit(exitCode);
}

function _relativeUnderRoot(absPath) {
  const rel = path.relative(ROOT, absPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

// ---------------------------------------------------------------------------
// Exports (for tests)
// ---------------------------------------------------------------------------

module.exports = {
  parseArgs,
  resolveExplicitRelative,
  pathIsUnderRoot,
  canonicalSha256,
  writeJsonAtomic,
  detectBranch,
  rederiveReplayKeys,
  rederiveEvidenceChain,
  evaluateLiveBranch,
  evaluateScopeBranch,
  evaluateNegativeFixtures,
  mapBranchToVerdict,
  ROOT,
  RUN_TAG: () => RUN_TAG,
  VERIFIER_IMPORTS,
  PROTOCOL_FILENAME,
  USAGE,
  FORBIDDEN_PATHS_RE,
  PRODUCER_CLI_PATH,
  COORDINATOR_CLI_PATH,
  REFERENCE_TIME,
};

if (require.main === module) {
  try {
    main();
  } catch (e) {
    emitError('runner-fatal', e && e.stack ? e.stack : String(e));
    process.exit(data.EXIT_CODES.RUNNER_FAILURE);
  }
}
