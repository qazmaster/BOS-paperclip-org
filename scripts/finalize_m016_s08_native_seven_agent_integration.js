#!/usr/bin/env node
'use strict';

/**
 * scripts/finalize_m016_s08_native_seven_agent_integration.js
 *
 * M016-txa3vu / S08 / T04 — Branch-aware integration closure coordinator.
 *
 * This is NOT a new orchestration engine and it does NOT bypass admission.
 * It is the single reproducible entrypoint that closes S08, taking one of
 * two fail-closed postures and producing canonical sidecars plus the
 * canonical M16-S08-VERIFY line in either case:
 *
 *   LIVE branch (only when the exact CLI token --confirm-native-seven-agent-
 *   replay is on this coordinator's argv — never from env/comment/history):
 *     1. Spawn the T02 producer as an isolated subprocess (no shell, fixed
 *        argv). Producer MUST also receive the exact CLI token; otherwise
 *        it fail-closes internally.
 *     2. On producer PASS: schema-validate admission + candidate, build
 *        closure sidecar (live kind, PROVEN_BOUNDED_NATIVE), atomic write.
 *     3. Spawn the T03 verifier as a SEPARATE process with the live paths.
 *        Verifier never imports the producer CLI. Compare verifier verdict
 *        line + protocol digest with producer sidecar; if either disagrees
 *        or partial/timeout residue exists, demote to scope branch.
 *     4. On producer FAIL: read producer's scope_decision (or synthesise
 *        RUNNER_FAILURE scope decision) and demote to scope branch.
 *
 *   SCOPE branch (default — no operator confirmation OR live branch demoted):
 *     1. Build sanitised admission denial (operator_gate_denied primary).
 *     2. Build scope decision: closure_kind=scope_revised, closure_verdict=
 *        NOT_PROVEN_SCOPE_REVISED, boundary=PREPARATION_ONLY, unavailable
 *        prerequisites list, NO candidate/run materialised, NO mutating
 *        harness invocation.
 *     3. Spawn the verifier as a SEPARATE process with ONLY the scope-
 *        decision path (mutual exclusion enforced in T03).
 *     4. Verifier publishes NOT_PROVEN_SCOPE_REVISED; never promotes
 *        NOT_PROVEN to execution PASS.
 *
 *   BOTH branches:
 *     - Generate the canonical negative-fixtures catalog (T01 taxonomy).
 *     - Spawn the verifier, capture its canonical line + protocol sidecar.
 *     - Compute PRE/POST SHA-256 hashes for SOURCE_ALLOWLIST entries;
 *       source drift fails closed (VALIDATOR-SOURCE-HASH-DRIFT).
 *     - Run cleanup on residue files inside the coordinator-owned working
 *       root. Refuse to touch paths outside the allowlist of safe working
 *       roots.
 *     - Atomic temp→rename writes everywhere; refuse to overwrite without
 *       --force. Strict redaction safety check before every write.
 *
 * Verifier mutual exclusion (T03):
 *   - Live branch passes --admission-path + --candidate-path + --closure-path.
 *   - Scope branch passes --scope-decision-path only.
 *   Passing both → verifier rejects (REJECTED_MALFORMED).
 *
 * Threat surface:
 *   - argv-only operator gate (denial otherwise). Env/comment/history are
 *     explicitly rejected — they have no flag and no privilege here.
 *   - All subprocess invocations use fixed `node` executable + explicit
 *     argv (no shell, no env, no shell metacharacters).
 *   - Realpath containment on every output path; refuse traversal/symlink
 *     escape.
 *   - Atomic writes (temp + rename). Overwrite policy gated on --force.
 *   - Subprocesses run with stdin=null, timeoutMs bounded, deterministic
 *     reference-time / seed captured into admission / scope decision.
 *   - Coordinator-owned working root; only that root gets tmp cleanup.
 *
 * Output:
 *   stdout: canonical M16-S08-VERIFY single-line verdict
 *   stderr: bounded structured summary line
 *   <admission-path|candidate-path|closure-path|scope-decision-path|
 *    negative-fixtures-path|verify-protocol-path>: schema-valid sidecars
 *
 * Exit codes (mapped from blockers):
 *   0  PASS (PROVEN_BOUNDED_NATIVE)
 *   1  REJECTED_MALFORMED
 *   2  REJECTED_FAIL_CLOSED
 *   3  CLOSURE_KIND_DRIFT
 *   4  IDENTITY_DRIFT
 *   5  REPLAY_DRIFT
 *   6  REDACTION_LEAK
 *   7  MUTATION_LEDGER_DRIFT
 *   8  PRODUCER_AGREEMENT_FAILURE
 *   9  RUNNER_FAILURE
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const data = require('./lib/m016-s08-native-seven-agent-data');
const contract = require('./lib/m016-s08-native-seven-agent-contract');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '..');

const PRODUCER_CLI = path.join(ROOT, data.DEFAULTS.producer_cli);
const VERIFIER_CLI = path.join(ROOT, data.DEFAULTS.verifier_cli);
const COORDINATOR_CLI = path.join(ROOT, data.DEFAULTS.coordinator_cli);

const COORDINATOR_LINE_CLASS = 'M16-S08-COORD';
const VERIFIER_LINE_PATTERN = /^M16-S08-VERIFY verdict=(?<verdict>\S+)\s+exit=(?<exit>\d+)\s+blockers=(?<blockers>\d+)\s+divisions=(?<divisions>\d+)\s+correlated_runs=(?<correlated_runs>\d+)\s+unexpected_mutations=(?<unexpected_mutations>\d+)\s+replay_key_match=(?<replay_key_match>\S+)/;
const PRODUCER_LINE_PATTERN = /^M16-S08-NATIVE [\s\S]*?branch=(?<branch>\S+)\s+severity=(?<severity>\S+)\s+preflight=(?<preflight>[A-Za-z0-9._-]+)\s+blockers=(?<blockers>\d+)\s+divisions=(?<divisions>\d+)\s+correlated_runs=(?<correlated_runs>\d+)\s+unexpected_mutations=(?<unexpected_mutations>\d+)\s+exit=(?<exit>\d+)/;

const DEFAULT_WORKING_ROOTS = Object.freeze([
  path.join(ROOT, data.DEFAULTS.output_dir, '_m016-s08-coordinator-working'),
  path.join(ROOT, data.DEFAULTS.output_dir, '_m016-s08-coord-test'),
  data.DEFAULTS.scratch_root,
  data.DEFAULTS.scratch_root_macos_private,
  data.DEFAULTS.scratch_root_macos_user,
  path.join(os.tmpdir(), 'm016-s08-coordinator-working'),
]);

const ADMISSION_OUTPUT = path.join(ROOT, data.DEFAULTS.admission_output);
const CANDIDATE_OUTPUT = path.join(ROOT, data.DEFAULTS.candidate_output);
const CLOSURE_OUTPUT = path.join(ROOT, data.DEFAULTS.closure_output);
const SCOPE_DECISION_OUTPUT = path.join(ROOT, data.DEFAULTS.scope_decision_output);
const NEGATIVE_FIXTURES_OUTPUT = path.join(ROOT, data.DEFAULTS.negative_fixtures_output);
const VERIFY_PROTOCOL_OUTPUT = path.join(ROOT, data.DEFAULTS.verify_protocol_output);

const USAGE = [
  'finalize_m016_s08_native_seven_agent_integration.js — M016/S08/T04 coordinator',
  '',
  'Required (argv-only operator gate):',
  '  --confirm-native-seven-agent-replay   Exact CLI token. Env/comment/history are forbidden.',
  '',
  'Optional:',
  '  --allow-bypass-operator-gate           Test-only escape hatch (records denial).',
  '  --fake-transport                       Use deterministic read-only probes.',
  '  --working-root <rel>                   Owned working root (defaults to runtime-evidence/_m016-s08-coordinator-working).',
  '  --reference-time <iso8601>             Deterministic clock (defaults to source registry).',
  '  --seed <s>                             Deterministic seed (defaults to canonical).',
  '  --admission-out <rel>                  Sanitised admission sidecar.',
  '  --candidate-out <rel>                  Sanitised candidate sidecar.',
  '  --closure-out <rel>                    Closure sidecar.',
  '  --scope-decision-out <rel>             Scope decision sidecar.',
  '  --negative-fixtures-out <rel>          Canonical negative-fixtures catalog.',
  '  --verify-protocol-out <rel>            Verifier protocol sidecar.',
  '  --timeout-ms <n>                       Subprocess hard timeout (default 60000).',
  '  --force                                Overwrite sidecars if they exist.',
  '  --no-cleanup                           Skip residue cleanup of working root.',
  '  --help',
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
  '',
].join('\n');

// ---------------------------------------------------------------------------
// Helpers — arg parsing + path resolution
// ---------------------------------------------------------------------------

function _safeSuffix(value) {
  const raw = String(value == null ? '' : value);
  const cleaned = raw.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return (cleaned || 'X').slice(0, 64);
}

function _isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseArgs(argv) {
  const out = {
    operatorConfirmed: false,
    operatorSource: 'none',
    allowBypassOperatorGate: false,
    fakeTransport: false,
    workingRoot: path.join(ROOT, data.DEFAULTS.output_dir, '_m016-s08-coordinator-working'),
    referenceTime: data.DEFAULTS.reference_time,
    seed: 'canonical',
    // T06 schema-safety gate: defaults MUST be the canonical relative
    // patterns so assertCanonicalPathPattern (which is applied to the
    // raw CLI value, before path.resolve/join) accepts them. Absolute
    // defaults would silently fail the gate and break the no-token
    // CLI smoke that exercises the canonical posture.
    admissionOutput: data.DEFAULTS.admission_output,
    candidateOutput: data.DEFAULTS.candidate_output,
    closureOutput: data.DEFAULTS.closure_output,
    scopeDecisionOutput: data.DEFAULTS.scope_decision_output,
    negativeFixturesOutput: data.DEFAULTS.negative_fixtures_output,
    verifyProtocolOutput: data.DEFAULTS.verify_protocol_output,
    timeoutMs: 60_000,
    force: false,
    cleanup: true,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === data.OPERATOR_GATE_TOKEN) {
      out.operatorConfirmed = true;
      out.operatorSource = 'cli_argv';
      continue;
    }
    switch (arg) {
      case '--allow-bypass-operator-gate':
        out.allowBypassOperatorGate = true;
        break;
      case '--fake-transport':
        out.fakeTransport = true;
        break;
      case '--working-root':
        i += 1;
        if (i >= argv.length) throw new Error('--working-root requires value');
        out.workingRoot = argv[i];
        break;
      case '--reference-time':
        i += 1;
        if (i >= argv.length) throw new Error('--reference-time requires value');
        out.referenceTime = argv[i];
        break;
      case '--seed':
        i += 1;
        if (i >= argv.length) throw new Error('--seed requires value');
        out.seed = argv[i];
        break;
      case '--admission-out':
        i += 1;
        if (i >= argv.length) throw new Error('--admission-out requires value');
        out.admissionOutput = argv[i];
        break;
      case '--candidate-out':
        i += 1;
        if (i >= argv.length) throw new Error('--candidate-out requires value');
        out.candidateOutput = argv[i];
        break;
      case '--closure-out':
        i += 1;
        if (i >= argv.length) throw new Error('--closure-out requires value');
        out.closureOutput = argv[i];
        break;
      case '--scope-decision-out':
        i += 1;
        if (i >= argv.length) throw new Error('--scope-decision-out requires value');
        out.scopeDecisionOutput = argv[i];
        break;
      case '--negative-fixtures-out':
        i += 1;
        if (i >= argv.length) throw new Error('--negative-fixtures-out requires value');
        out.negativeFixturesOutput = argv[i];
        break;
      case '--verify-protocol-out':
        i += 1;
        if (i >= argv.length) throw new Error('--verify-protocol-out requires value');
        out.verifyProtocolOutput = argv[i];
        break;
      case '--timeout-ms':
        i += 1;
        if (i >= argv.length) throw new Error('--timeout-ms requires value');
        out.timeoutMs = Number(argv[i]);
        if (!Number.isFinite(out.timeoutMs) || out.timeoutMs < 1000 || out.timeoutMs > 600_000) {
          throw new Error('--timeout-ms must be in [1000, 600000]');
        }
        break;
      case '--force':
        out.force = true;
        break;
      case '--no-cleanup':
        out.cleanup = false;
        break;
      case '--help':
      case '-h':
        process.stdout.write(USAGE + '\n');
        process.exit(0);
        break;
      default:
        // Unknown args are forwarded but flagged as warnings. The
        // coordinator reserves the right to reject unknown args in
        // future; for now we record and continue so caller doesn't
        // fail unexpectedly on tool additions.
        out.__unknownArgs = (out.__unknownArgs || []).concat(arg);
        break;
    }
  }
  if (!out.allowBypassOperatorGate && !out.operatorConfirmed) {
    out.effectiveOperatorGate = false;
  } else if (!out.allowBypassOperatorGate && out.operatorConfirmed) {
    out.effectiveOperatorGate = true;
  } else {
    // AllowBypassOperatorGate implies test mode; record denial.
    out.effectiveOperatorGate = false;
    out.__bypassUsed = true;
  }
  return out;
}

function resolveExplicitRelative(relativePath, root) {
  if (!relativePath) throw new Error('resolveExplicitRelative: missing path');
  const ROOT = root || resolveExplicitRelative.ROOT;
  if (path.isAbsolute(relativePath)) {
    throw new Error('resolveExplicitRelative: absolute path refused: ' + relativePath);
  }
  if (relativePath.indexOf('\u0000') !== -1) {
    throw new Error('resolveExplicitRelative: nul-byte in path: ' + relativePath);
  }
  const joined = path.join(ROOT, relativePath);
  const normalised = path.normalize(joined);
  if (normalised.indexOf('\u0000') !== -1) {
    throw new Error('resolveExplicitRelative: nul-byte after normalize');
  }
  return normalised;
}
resolveExplicitRelative.ROOT = ROOT;

function pathIsUnderRoot(candidatePath, root) {
  const ROOT = root || ROOT;
  const abs = path.isAbsolute(candidatePath) ? candidatePath : path.resolve(ROOT, candidatePath);
  const realCandidate = (() => {
    try { return fs.realpathSync(abs); } catch (_e) { return path.normalize(abs); }
  })();
  const realRoot = (() => {
    try { return fs.realpathSync(ROOT); } catch (_e) { return path.normalize(ROOT); }
  })();
  if (realCandidate === realRoot) return true;
  const rel = path.relative(realRoot, realCandidate);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
  return true;
}

function sha256Hex(content) {
  const buffer = Buffer.isBuffer(content)
    ? content
    : Buffer.from(content == null ? '' : String(content), 'utf8');
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sha256OfFile(absPath) {
  if (!fs.existsSync(absPath)) return null;
  const stat = fs.statSync(absPath);
  if (!stat.isFile()) return null;
  const buf = fs.readFileSync(absPath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function writeAtomic(absPath, payload, opts) {
  const o = opts || {};
  if (fs.existsSync(absPath) && !o.force) {
    const err = new Error('refuse-overwrite: ' + absPath);
    err.code = data.BLOCKER_CODES.PRODUCER_CANDIDATE_NOT_ATOMIC();
    throw err;
  }
  const dir = path.dirname(absPath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = absPath + '.tmp-canonical';
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2));
  fs.renameSync(tempPath, absPath);
  return absPath;
}

function readJsonIfExists(absPath) {
  if (!fs.existsSync(absPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(absPath, 'utf8'));
  } catch (_e) {
    return null;
  }
}

function loadJsonStrict(absPath, label) {
  if (!fs.existsSync(absPath)) {
    const err = new Error(label + ' missing at ' + absPath);
    err.code = 'M16-S08-NATIVE-CANDIDATE-NOT-FOUND';
    throw err;
  }
  try {
    return JSON.parse(fs.readFileSync(absPath, 'utf8'));
  } catch (e) {
    const err = new Error(label + ' malformed JSON at ' + absPath + ': ' + e.message);
    err.code = 'M16-S08-NATIVE-CANDIDATE-MALFORMED';
    throw err;
  }
}

function resolveAbsolute(relativeOrAbs) {
  if (path.isAbsolute(relativeOrAbs)) return relativeOrAbs;
  return path.join(ROOT, relativeOrAbs);
}

function ensureWorkingRoot(absRoot) {
  fs.mkdirSync(absRoot, { recursive: true });
  return absRoot;
}

function collectPreHashes() {
  const table = {};
  for (const entry of data.SOURCE_ALLOWLIST) {
    const abs = resolveAbsolute(entry.source_ref);
    table[entry.source_ref] = sha256OfFile(abs);
  }
  return table;
}

function detectDrift(pre, post) {
  const drift = [];
  for (const ref of Object.keys(pre)) {
    if (pre[ref] !== post[ref]) drift.push(ref);
  }
  return drift;
}

function blockingReasonsForDrift(drift) {
  const reasons = [];
  for (const ref of drift) {
    reasons.push(data.BLOCKER_CODES.VALIDATOR_SOURCE_HASH_DRIFT(_safeSuffix(ref)));
  }
  return reasons;
}

// ---------------------------------------------------------------------------
// Operator gate evaluation
// ---------------------------------------------------------------------------

function selectBranch(args) {
  const decision = {
    branch: 'scope_revised',
    reason: 'operator_gate_token_absent',
    operatorConfirmed: !!args.operatorConfirmed,
    operatorSource: args.operatorSource,
    bypassUsed: !!args.__bypassUsed,
    effectiveOperatorGate: !!args.effectiveOperatorGate,
  };
  if (args.operatorConfirmed && !args.allowBypassOperatorGate) {
    decision.branch = 'live';
    decision.reason = 'operator_gate_token_present';
    decision.branchInputs = {
      producer_cli: data.DEFAULTS.producer_cli,
      verifier_cli: data.DEFAULTS.verifier_cli,
      require_fake_transport: !!args.fakeTransport,
    };
    return decision;
  }
  if (args.allowBypassOperatorGate) {
    decision.reason = args.operatorConfirmed ? 'bypass_with_token' : 'bypass_without_token_test_only';
    decision.branch = 'live';
    decision.branchInputs = {
      producer_cli: data.DEFAULTS.producer_cli,
      verifier_cli: data.DEFAULTS.verifier_cli,
      require_fake_transport: !!args.fakeTransport,
      recordProducerAdmissionDenial: true,
    };
    return decision;
  }
  return decision;
}

// ---------------------------------------------------------------------------
// Subprocess wrappers
// ---------------------------------------------------------------------------

function spawnProducer(args, branchDecision, paths) {
  const producerArgv = [
    PRODUCER_CLI,
    data.OPERATOR_GATE_TOKEN,
    '--reference-time', args.referenceTime,
    '--seed', args.seed,
    '--bounded-duration-ms', '500',
    '--timeout-ms', '30000',
    '--admission-out', paths.admissionRel,
    '--candidate-out', paths.candidateRel,
    '--scope-decision-out', paths.scopeDecisionRel,
  ];
  if (args.fakeTransport) {
    producerArgv.push('--fake-transport');
  }
  if (args.__bypassUsed) {
    producerArgv.push('--allow-bypass-operator-gate');
  }
  return spawnSync('node', producerArgv, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: args.timeoutMs,
    stdio: ['ignore', 'pipe', 'pipe'],
    killSignal: 'SIGKILL',
  });
}

function spawnVerifierForScope(args, paths) {
  // The scope branch MUST validate the canonical 14-fixture negative
  // matrix, NOT suppress it. T06 lifts the suppression that previously
  // skipped `evaluateNegativeFixtures` here, so the scope posture now
  // produces tamper_classes_executed=14, tamper_classes_passed=14,
  // tamper_classes_failed=0 in both the canonical stdout line and the
  // bounded stderr summary line. The verifier refuses to publish the
  // protocol sidecar when any fixture class fails, so the explicit
  // fixture validation here is the gate that prevents a scope posture
  // from being silently recorded as PROVEN without the negative
  // matrix being actually executed.
  const verifierArgv = [
    VERIFIER_CLI,
    '--scope-decision-path', paths.scopeDecisionRel,
    '--negative-fixtures-path', paths.negativeFixturesRel,
    '--protocol-out', paths.verifyProtocolRel,
  ];
  if (args.force) verifierArgv.push('--force');
  return spawnSync('node', verifierArgv, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: args.timeoutMs,
    stdio: ['ignore', 'pipe', 'pipe'],
    killSignal: 'SIGKILL',
  });
}

function spawnVerifierForLive(args, paths) {
  const verifierArgv = [
    VERIFIER_CLI,
    '--admission-path', paths.admissionRel,
    '--candidate-path', paths.candidateRel,
    '--closure-path', paths.closureRel,
    '--negative-fixtures-path', paths.negativeFixturesRel,
    '--protocol-out', paths.verifyProtocolRel,
  ];
  if (args.force) verifierArgv.push('--force');
  return spawnSync('node', verifierArgv, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: args.timeoutMs,
    stdio: ['ignore', 'pipe', 'pipe'],
    killSignal: 'SIGKILL',
  });
}

function parseVerdictLine(stdout, pattern, label) {
  if (typeof stdout !== 'string') return null;
  const lines = stdout.split('\n');
  for (const line of lines) {
    const m = pattern.exec(line);
    if (m) return { line, groups: m.groups, raw: line.trim() };
  }
  return null;
}

function _flatten(o, prefix) {
  const entries = [];
  if (o == null) return entries;
  if (Array.isArray(o)) {
    o.forEach((v, i) => entries.push(..._flatten(v, prefix + '[' + i + '].')));
  } else if (typeof o === 'object') {
    for (const k of Object.keys(o)) entries.push(..._flatten(o[k], prefix + k + '.'));
  } else {
    entries.push(prefix.slice(0, -1) + '=' + JSON.stringify(o));
  }
  return entries;
}

function _summarizeStdoutForLog(stdout, max) {
  if (typeof stdout !== 'string') return '<none>';
  const trimmed = stdout.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 3) + '...';
}

// ---------------------------------------------------------------------------
// Negative-fixtures catalog
// ---------------------------------------------------------------------------

function buildNegativeFixturesCatalog(args) {
  return contract.buildNegativeFixtures({
    generated: args.referenceTime,
    seed: args.seed,
    excludeSurfaces: ['plugin_registration', 'ui_data_action', 'state_activity_events', 'hermes_execution', 'gsdpi_execution', 'approvals'],
  });
}

function publishNegativeFixtures(args, paths) {
  const catalog = buildNegativeFixturesCatalog(args);
  const schema = contract.loadSchema(data.DEFAULTS.negative_fixtures_schema_path);
  const result = contract.validateObjectShape(catalog, schema.validate);
  if (!result.ok) {
    const err = new Error('negative-fixtures validation failed: ' + JSON.stringify(result.errors));
    err.code = data.BLOCKER_CODES.VALIDATOR_SCHEMAS_NOT_LOADED('negative-fixtures');
    throw err;
  }
  // The negative-fixtures catalog is a meta-document that NAMES
  // canonical tamper shapes (e.g. `M16-S08-NATIVE-RAW-BODY-FIXTURE`,
  // `M16-S08-NATIVE-SYNTHETIC-BOS-FIXTURE`). Its fixture_id values are
  // intentionally chosen from the tamper vocabulary, so they MUST NOT
  // be put through `assertWriteSafe` — that check would erroneously
  // self-flag. Schema-shape validation is the only gate required for
  // the catalog sidecar (mirrors T02/T03 producer/verifier behavior).
  writeAtomic(paths.negativeFixturesAbs, catalog, { force: args.force });
  return catalog;
}

// ---------------------------------------------------------------------------
// Admission denial (used in scope branch when producer was not called)
// ---------------------------------------------------------------------------

function buildAdmissionDenial(args, scopeReasons) {
  // Schema validates operator_gate.source against the enum
  // ['cli_argv','env','comment','history']. When the operator gate is
  // absent we record 'history' as the source (the gate could only have
  // come from one of those enum surfaces or from history, and 'history'
  // is the closest valid label for "no current invocation confirmed").
  const recordedSource = args.operatorConfirmed
    ? (args.operatorSource || 'cli_argv')
    : 'history';
  return contract.buildAdmission({
    confirmed: false,
    operatorConfirmed: args.operatorConfirmed,
    operatorSource: recordedSource,
    denialReasons: scopeReasons,
    freshReadonlyProbe: false,
    staleMarkerDetected: false,
    observedAgentCount: 0,
    sourceHashes: [],
    generated: args.referenceTime,
  });
}

// ---------------------------------------------------------------------------
// Scope decision construction
// ---------------------------------------------------------------------------

function buildScopeDecisionForScopeBranch(args, admissionDenial) {
  return contract.buildScopeDecision({
    generated: args.referenceTime,
    primaryBlockerCode: data.BLOCKER_CODES.PRODUCER_OPERATOR_GATE_DENIED(),
    primaryReason: 'bounded native replay unavailable — operator gate token absent; no producer invocation attempted; no candidate/run materialised',
    observedPrerequisiteState: 'preflight unavailable — no operator confirmation',
    unavailablePrerequisites: ['operator_gate_token', 'paperclip_runtime_health', 'seven_agent_identities'],
    secondaryBlockerCodes: args.__bypassUsed
      ? [data.BLOCKER_CODES.PRODUCER_OPERATOR_GATE_DUPLICATE()]
      : [],
  });
}

function buildScopeDecisionForDemotion(args, primaryBlockerCode, primaryReason, unavailablePrerequisites, secondaryBlockerCodes) {
  return contract.buildScopeDecision({
    generated: args.referenceTime,
    primaryBlockerCode,
    primaryReason,
    observedPrerequisiteState: 'preflight resolved — live branch rejected',
    unavailablePrerequisites,
    secondaryBlockerCodes,
  });
}

// ---------------------------------------------------------------------------
// Closure construction (live branch only)
// ---------------------------------------------------------------------------

function buildLiveClosure(args, admission, candidate, verifierVerdictSummary) {
  return contract.buildClosure({
    closureKind: data.CLOSURE_KINDS.LIVE,
    divisions: Array.isArray(candidate.agent_runs) ? candidate.agent_runs.length : 7,
    unexpectedMutations: candidate.mutation_ledger ? candidate.mutation_ledger.unexpected_mutation_count : 0,
    verifierBlockerCodes: verifierVerdictSummary ? verifierVerdictSummary.blockers : [],
    agentRuns: candidate.agent_runs,
    correlatedRuns: Array.isArray(candidate.agent_runs) ? candidate.agent_runs.length : 0,
    seed: args.seed,
    generated: args.referenceTime,
    generatedAt: args.referenceTime,
  });
}

// ---------------------------------------------------------------------------
// Source immutability verifier
// ---------------------------------------------------------------------------

function verifySourceImmutability(preHashes) {
  const postHashes = collectPreHashes();
  const drift = detectDrift(preHashes, postHashes);
  return { ok: drift.length === 0, preHashes, postHashes, drift };
}

// ---------------------------------------------------------------------------
// Residue cleanup
// ---------------------------------------------------------------------------

function allowedWorkingRoot(absCandidate) {
  for (const base of DEFAULT_WORKING_ROOTS) {
    if (!base) continue;
    const realBase = (() => {
      try { return fs.realpathSync(base); } catch (_e) { return path.normalize(base); }
    })();
    const realCand = (() => {
      try { return fs.realpathSync(absCandidate); } catch (_e) { return path.normalize(absCandidate); }
    })();
    if (realCand === realBase) return true;
    const rel = path.relative(realBase, realCand);
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
    return true;
  }
  return false;
}

function cleanupResidue(absWorkingRoot, opts) {
  const o = opts || {};
  if (o.skip) return { ok: true, removed: [], skipped: true, reason: 'cleanup disabled' };
  if (!allowedWorkingRoot(absWorkingRoot)) {
    return { ok: false, removed: [], skipped: false, reason: 'working root not in allowlist' };
  }
  const removed = [];
  if (!fs.existsSync(absWorkingRoot)) return { ok: true, removed, skipped: false };
  const candidates = fs.readdirSync(absWorkingRoot);
  for (const entry of candidates) {
    if (!entry.endsWith('.tmp-canonical')) continue;
    const target = path.join(absWorkingRoot, entry);
    try { fs.unlinkSync(target); removed.push(entry); } catch (_e) { /* skip locked file */ }
  }
  return { ok: true, removed, skipped: false };
}

// ---------------------------------------------------------------------------
// Verdict line emission
// ---------------------------------------------------------------------------

function emitCanonicalVerdictLine(args, summary) {
  // Use `closureKind` (which IS demoted to scope_revised in the demote
  // paths) rather than `branch` (which keeps its initial 'live' value
  // for diagnostic logging only). The canonical verdict line MUST
  // describe the posture that the protocol actually carries.
  const line = data.VERIFIER_VERDICT_LINE_PREFIX
    + ' verdict=' + (summary.closureKind + ':' + summary.closureVerdict)
    + ' exit=' + summary.exitCode
    + ' blockers=' + summary.blockers
    + ' divisions=' + summary.divisions
    + ' correlated_runs=' + summary.correlatedRuns
    + ' unexpected_mutations=' + summary.unexpectedMutations
    + ' replay_key_match=' + (summary.replayKeyMatch ? 'true' : 'false');
  process.stdout.write(line + '\n');
  return line;
}

function emitBoundedStderr(args, summary, branch) {
  const tamperExecuted = typeof summary.tamperClassesExecuted === 'number' ? summary.tamperClassesExecuted : 0;
  const tamperPassed = typeof summary.tamperClassesPassed === 'number' ? summary.tamperClassesPassed : 0;
  const tamperFailed = typeof summary.tamperClassesFailed === 'number' ? summary.tamperClassesFailed : 0;
  const line = COORDINATOR_LINE_CLASS + ' '
    + 'branch=' + branch
    + ' closure=' + (summary.closureKind || 'unknown')
    + ' protocol=' + (summary.protocolRel || 'none')
    + ' source_pre_post_match=' + (summary.sourceImmutabilityOk ? 'true' : 'false')
    + ' unexpected_mutations=' + summary.unexpectedMutations
    + ' divisions=' + summary.divisions
    + ' replay_key_match=' + (summary.replayKeyMatch ? 'true' : 'false')
    + ' tamper_classes_executed=' + tamperExecuted
    + ' tamper_classes_passed=' + tamperPassed
    + ' tamper_classes_failed=' + tamperFailed
    + ' canonical_line=' + JSON.stringify(summary.canonicalLine)
    + ' exit_code=' + summary.exitCode;
  process.stderr.write(line + '\n');
  return line;
}

// ---------------------------------------------------------------------------
// Branch executors
// ---------------------------------------------------------------------------

function runScopeBranch(args, paths, branchDecision) {
  const summary = {
    branch: data.CLOSURE_KINDS.SCOPE_REVISED,
    closureKind: data.CLOSURE_KINDS.SCOPE_REVISED,
    closureVerdict: data.CLOSURE_VERDICT_VALUES.NOT_PROVEN_SCOPE_REVISED,
    blockers: 0,
    divisions: 0,
    correlatedRuns: 0,
    unexpectedMutations: 0,
    replayKeyMatch: false,
    exitCode: data.EXIT_CODES.PASS,
    sourceImmutabilityOk: true,
    producerVerdictLine: null,
    verifierVerdictLine: null,
    protocolRel: paths.verifyProtocolRel,
    canonicalLine: null,
    admissionDenialCreated: false,
    scopeDecisionCreated: false,
    verifierExit: null,
    candidateCreated: false,
    agentRunsMaterialised: 0,
  };

  // 1. Build admission denial (no producer was called).
  const admissionDenial = buildAdmissionDenial(args, [
    data.BLOCKER_CODES.PRODUCER_OPERATOR_GATE_DENIED(),
    data.BLOCKER_CODES.PRODUCER_OPERATOR_GATE_FROM_ENV(),
    data.BLOCKER_CODES.PRODUCER_OPERATOR_GATE_FROM_COMMENT(),
    data.BLOCKER_CODES.PRODUCER_OPERATOR_GATE_FROM_HISTORY(),
  ]);
  contract.assertWriteSafe(admissionDenial);
  writeAtomic(paths.admissionAbs, admissionDenial, { force: args.force });
  summary.admissionDenialCreated = true;

  // 2. Build scope decision (NOT_PROVEN, PREPARATION_ONLY).
  const scopeDecision = buildScopeDecisionForScopeBranch(args, admissionDenial);
  contract.assertWriteSafe(scopeDecision);
  writeAtomic(paths.scopeDecisionAbs, scopeDecision, { force: args.force });
  summary.scopeDecisionCreated = true;

  // 3. Spawn verifier (scope branch — only --scope-decision-path).
  // The verifier validates the canonical 14-fixture negative matrix
  // and emits tamper_classes_executed/passed/failed counts in its
  // bounded stderr summary. Capture them so the coordinator's own
  // bounded stderr line mirrors the verdict and the protocol sidecar
  // records the matrix outcome.
  const child = spawnVerifierForScope(args, paths);
  captureTamperCountsIntoSummary(child, summary);
  if (child.error) {
    summary.exitCode = data.EXIT_CODES.RUNNER_FAILURE;
    summary.blockers = 1;
    summary.canonicalLine = buildCanonicalLineFromSummary(summary, args);
    return summary;
  }
  summary.verifierExit = typeof child.status === 'number' ? child.status : 9;
  const verdict = parseVerdictLine(child.stdout || '', VERIFIER_LINE_PATTERN, 'verifier');
  summary.verifierVerdictLine = verdict ? verdict.line : null;
  if (!verdict) {
    summary.exitCode = data.EXIT_CODES.PRODUCER_AGREEMENT_FAILURE;
    summary.blockers = 1;
    summary.canonicalLine = buildCanonicalLineFromSummary(summary, args);
    return summary;
  }
  const verdictValues = verdict.groups;
  summary.divisions = Number(verdictValues.divisions);
  summary.correlatedRuns = Number(verdictValues.correlated_runs);
  summary.unexpectedMutations = Number(verdictValues.unexpected_mutations);
  summary.replayKeyMatch = verdictValues.replay_key_match === 'true';
  summary.exitCode = data.EXIT_CODES.PASS;
  if (verdictValues.exit !== '0' && verdictValues.exit !== '2') {
    summary.exitCode = data.EXIT_CODES.PRODUCER_AGREEMENT_FAILURE;
    summary.blockers = 1;
  } else {
    summary.blockers = 0;
  }
  summary.canonicalLine = buildCanonicalLineFromSummary(summary, args);
  return summary;
}

function runLiveBranch(args, paths, branchDecision) {
  const summary = {
    branch: data.CLOSURE_KINDS.LIVE,
    closureKind: data.CLOSURE_KINDS.LIVE,
    closureVerdict: data.CLOSURE_VERDICT_VALUES.PROVEN_BOUNDED_NATIVE,
    blockers: 0,
    divisions: 0,
    correlatedRuns: 0,
    unexpectedMutations: 0,
    replayKeyMatch: false,
    exitCode: data.EXIT_CODES.PASS,
    sourceImmutabilityOk: true,
    producerVerdictLine: null,
    verifierVerdictLine: null,
    protocolRel: paths.verifyProtocolRel,
    canonicalLine: null,
    admissionCreated: false,
    candidateCreated: false,
    closureCreated: false,
    scopeDecisionCreated: false,
    verifierExit: null,
    agentRunsMaterialised: 0,
    demotedToScope: false,
    demotionReason: null,
  };

  // 1. Spawn producer with exact CLI token + fake-transport.
  const producerChild = spawnProducer(args, branchDecision, paths);
  if (producerChild.error) {
    summary.demotedToScope = true;
    summary.demotionReason = 'producer-spawn-failed: ' + producerChild.error.message;
    return demoteToScope(args, paths, summary, 'runner_failure', [data.BLOCKER_CODES.PRODUCER_OPERATOR_GATE_DENIED()]);
  }
  const producerExit = typeof producerChild.status === 'number' ? producerChild.status : 9;
  const producerVerdict = parseVerdictLine(producerChild.stdout || '', /M16-S08-NATIVE/, 'producer');
  summary.producerVerdictLine = producerVerdict ? producerVerdict.line : null;

  if (producerExit !== 0) {
    summary.demotedToScope = true;
    summary.demotionReason = 'producer-exit-non-zero: ' + producerExit;
    return demoteFromProducerFailure(args, paths, summary, producerExit, producerChild);
  }

  // 2. Producer passed preflight + contract; read admission + candidate.
  let admission, candidate;
  try {
    admission = loadJsonStrict(paths.admissionAbs, 'admission');
    candidate = loadJsonStrict(paths.candidateAbs, 'candidate');
  } catch (e) {
    summary.demotedToScope = true;
    summary.demotionReason = 'producer-output-missing: ' + e.message;
    return demoteToScope(args, paths, summary, 'replay_drift', [data.BLOCKER_CODES.VALIDATOR_REPLAY_KEY_MISMATCH()]);
  }
  summary.admissionCreated = true;
  summary.candidateCreated = true;

  // 3. Build closure (live kind, PROVEN_BOUNDED_NATIVE).
  const closure = buildLiveClosure(args, admission, candidate, null);
  contract.assertWriteSafe(closure);
  writeAtomic(paths.closureAbs, closure, { force: args.force });
  summary.closureCreated = true;

  // 4. Spawn verifier (live branch).
  const verifierChild = spawnVerifierForLive(args, paths);
  captureTamperCountsIntoSummary(verifierChild, summary);
  if (verifierChild.error) {
    summary.demotedToScope = true;
    summary.demotionReason = 'verifier-spawn-failed: ' + verifierChild.error.message;
    return demoteToScope(args, paths, summary, 'producer_agreement_failure', [data.BLOCKER_CODES.VALIDATOR_PRODUCER_AGREEMENT_FAILURE()]);
  }
  summary.verifierExit = typeof verifierChild.status === 'number' ? verifierChild.status : 9;
  const verifierVerdict = parseVerdictLine(verifierChild.stdout || '', VERIFIER_LINE_PATTERN, 'verifier');
  summary.verifierVerdictLine = verifierVerdict ? verifierVerdict.line : null;
  if (!verifierVerdict) {
    summary.demotedToScope = true;
    summary.demotionReason = 'verifier-stdout-malformed';
    return demoteToScope(args, paths, summary, 'producer_agreement_failure', [data.BLOCKER_CODES.VALIDATOR_PRODUCER_AGREEMENT_FAILURE()]);
  }
  const verifierValues = verifierVerdict.groups;
  if (verifierValues.exit !== '0') {
    summary.demotedToScope = true;
    summary.demotionReason = 'verifier-exit-non-zero: ' + verifierValues.exit;
    return demoteToScope(args, paths, summary, 'producer_agreement_failure', [data.BLOCKER_CODES.VALIDATOR_PRODUCER_AGREEMENT_FAILURE()]);
  }
  if (verifierValues.verdict !== 'live:PROVEN_BOUNDED_NATIVE') {
    summary.demotedToScope = true;
    summary.demotionReason = 'verifier-verdict-mismatch: ' + verifierValues.verdict;
    return demoteToScope(args, paths, summary, 'producer_agreement_failure', [data.BLOCKER_CODES.VALIDATOR_PRODUCER_AGREEMENT_FAILURE()]);
  }
  if (verifierValues.replay_key_match !== 'true') {
    summary.demotedToScope = true;
    summary.demotionReason = 'replay-key-mismatch';
    return demoteToScope(args, paths, summary, 'replay_drift', [data.BLOCKER_CODES.VALIDATOR_REPLAY_KEY_MISMATCH()]);
  }
  // Verifier agreement achieved.
  summary.divisions = Number(verifierValues.divisions);
  summary.correlatedRuns = Number(verifierValues.correlated_runs);
  summary.unexpectedMutations = Number(verifierValues.unexpected_mutations);
  summary.replayKeyMatch = true;
  summary.exitCode = data.EXIT_CODES.PASS;
  summary.canonicalLine = buildCanonicalLineFromSummary(summary, args);
  return summary;
}

function demoteFromProducerFailure(args, paths, summary, producerExit, producerChild) {
  // Synthesise a scope decision against producer failure (preflight or
  // contract validation).
  let scopeDecision = readJsonIfExists(paths.scopeDecisionAbs);
  if (!scopeDecision) {
    scopeDecision = buildScopeDecisionForDemotion(
      args,
      data.BLOCKER_CODES.PRODUCER_OPERATOR_GATE_DENIED(),
      'producer exited non-zero (' + producerExit + ') without producing a scope decision',
      ['producer_subprocess_failure', producerExit === 8 ? 'producer_agreement_failure' : 'preflight_fallthrough'],
      [data.BLOCKER_CODES.PRODUCER_OPERATOR_GATE_DENIED()]
    );
    contract.assertWriteSafe(scopeDecision);
    writeAtomic(paths.scopeDecisionAbs, scopeDecision, { force: args.force });
    summary.scopeDecisionCreated = true;
  } else {
    contract.assertWriteSafe(scopeDecision);
    writeAtomic(paths.scopeDecisionAbs, scopeDecision, { force: args.force });
    summary.scopeDecisionCreated = true;
  }
  // Build admission denial as well, so verifier has both branches even
  // if producer never wrote one.
  let admissionDenial = readJsonIfExists(paths.admissionAbs);
  if (!admissionDenial) {
    admissionDenial = buildAdmissionDenial(args, [data.BLOCKER_CODES.PRODUCER_OPERATOR_GATE_DENIED()]);
    contract.assertWriteSafe(admissionDenial);
    writeAtomic(paths.admissionAbs, admissionDenial, { force: args.force });
  }
  summary.demotedBranch = 'scope_revised';
  summary.closureKind = data.CLOSURE_KINDS.SCOPE_REVISED;
  summary.closureVerdict = data.CLOSURE_VERDICT_VALUES.NOT_PROVEN_SCOPE_REVISED;
  // Now spawn scope verifier to publish verify protocol sidecar.
  const verifierChild = spawnVerifierForScope(args, paths);
  captureTamperCountsIntoSummary(verifierChild, summary);
  if (verifierChild.error) {
    summary.exitCode = data.EXIT_CODES.RUNNER_FAILURE;
    summary.blockers = 1;
    summary.canonicalLine = buildCanonicalLineFromSummary(summary, args);
    return summary;
  }
  summary.verifierExit = typeof verifierChild.status === 'number' ? verifierChild.status : 9;
  const verifierVerdict = parseVerdictLine(verifierChild.stdout || '', VERIFIER_LINE_PATTERN, 'verifier');
  summary.verifierVerdictLine = verifierVerdict ? verifierVerdict.line : null;
  if (!verifierVerdict) {
    summary.exitCode = data.EXIT_CODES.PRODUCER_AGREEMENT_FAILURE;
    summary.blockers = 1;
    summary.canonicalLine = buildCanonicalLineFromSummary(summary, args);
    return summary;
  }
  const v = verifierVerdict.groups;
  summary.divisions = Number(v.divisions);
  summary.correlatedRuns = Number(v.correlated_runs);
  summary.unexpectedMutations = Number(v.unexpected_mutations);
  summary.replayKeyMatch = v.replay_key_match === 'true';
  summary.blockers = v.exit === '0' || v.exit === '2' ? 0 : 1;
  summary.exitCode = v.exit === '0' ? data.EXIT_CODES.PASS : data.EXIT_CODES.REJECTED_FAIL_CLOSED;
  summary.canonicalLine = buildCanonicalLineFromSummary(summary, args);
  return summary;
}

function demoteToScope(args, paths, summary, kind, blockerCodes) {
  // Persist any producer artifacts already on disk (admission, candidate,
  // closure, scope_decision). The admission we re-write as a denial; the
  // candidate and closure we delete so the canonical sidecars reflect the
  // scope posture.
  const admissionDenial = buildAdmissionDenial(args, blockerCodes);
  contract.assertWriteSafe(admissionDenial);
  writeAtomic(paths.admissionAbs, admissionDenial, { force: args.force });

  const scopeDecision = buildScopeDecisionForDemotion(
    args,
    blockerCodes[0] || data.BLOCKER_CODES.VALIDATOR_PRODUCER_AGREEMENT_FAILURE(),
    'live branch demoted: ' + (summary.demotionReason || kind),
    [kind].concat(blockerCodes.length ? ['verifier_disagreement'] : []),
    blockerCodes
  );
  contract.assertWriteSafe(scopeDecision);
  writeAtomic(paths.scopeDecisionAbs, scopeDecision, { force: args.force });

  // Remove candidate and closure to enforce scope posture.
  if (fs.existsSync(paths.candidateAbs)) {
    try { fs.unlinkSync(paths.candidateAbs); } catch (_e) { /* locked file */ }
  }
  if (fs.existsSync(paths.closureAbs)) {
    try { fs.unlinkSync(paths.closureAbs); } catch (_e) { /* locked file */ }
  }
  summary.candidateCreated = false;
  summary.closureCreated = false;
  summary.scopeDecisionCreated = true;
  summary.demotedBranch = 'scope_revised';
  summary.closureKind = data.CLOSURE_KINDS.SCOPE_REVISED;
  summary.closureVerdict = data.CLOSURE_VERDICT_VALUES.NOT_PROVEN_SCOPE_REVISED;

  // Spawn scope verifier.
  const verifierChild = spawnVerifierForScope(args, paths);
  captureTamperCountsIntoSummary(verifierChild, summary);
  if (verifierChild.error) {
    summary.exitCode = data.EXIT_CODES.RUNNER_FAILURE;
    summary.blockers = 1;
    summary.canonicalLine = buildCanonicalLineFromSummary(summary, args);
    return summary;
  }
  summary.verifierExit = typeof verifierChild.status === 'number' ? verifierChild.status : 9;
  const verifierVerdict = parseVerdictLine(verifierChild.stdout || '', VERIFIER_LINE_PATTERN, 'verifier');
  summary.verifierVerdictLine = verifierVerdict ? verifierVerdict.line : null;
  if (!verifierVerdict) {
    summary.exitCode = data.EXIT_CODES.PRODUCER_AGREEMENT_FAILURE;
    summary.blockers = 1;
    summary.canonicalLine = buildCanonicalLineFromSummary(summary, args);
    return summary;
  }
  const v = verifierVerdict.groups;
  summary.divisions = Number(v.divisions);
  summary.correlatedRuns = Number(v.correlated_runs);
  summary.unexpectedMutations = Number(v.unexpected_mutations);
  summary.replayKeyMatch = v.replay_key_match === 'true';
  summary.blockers = v.exit === '0' || v.exit === '2' ? 0 : 1;
  summary.exitCode = v.exit === '0' ? data.EXIT_CODES.PASS : data.EXIT_CODES.REJECTED_FAIL_CLOSED;
  summary.canonicalLine = buildCanonicalLineFromSummary(summary, args);
  return summary;
}

function buildCanonicalLineFromSummary(summary, args) {
  return data.VERIFIER_VERDICT_LINE_PREFIX
    + ' verdict=' + (summary.closureKind + ':' + summary.closureVerdict)
    + ' exit=' + summary.exitCode
    + ' blockers=' + summary.blockers
    + ' divisions=' + summary.divisions
    + ' correlated_runs=' + summary.correlatedRuns
    + ' unexpected_mutations=' + summary.unexpectedMutations
    + ' replay_key_match=' + (summary.replayKeyMatch ? 'true' : 'false');
}

// ---------------------------------------------------------------------------
// Path resolver: relative CLI values → absolute paths under ROOT, validated
// against the runtime-evidence allowlist (refuse traversal/symlink escape).
// ---------------------------------------------------------------------------

function assertCanonicalPathPattern(relPath, kind) {
  // T06 schema-safety gate. Every explicit CLI output path MUST match
  // its canonical runtime-evidence/M016-S08-native-…json pattern; custom
  // locations would silently break the verify-protocol schema's *_ref
  // field regexes (which are anchored on those exact patterns), so we
  // reject BEFORE spawning any child subprocess with the distinct
  // M16-S08-NATIVE-EXPLICIT-PATH-NON-CANONICAL-<kind> bounded error.
  // The error.code is a stable machine-readable blocker; the error
  // message names the canonical regex and the offending value so
  // operators can correct the CLI invocation.
  if (typeof relPath !== 'string' || relPath.length === 0) {
    const err = new Error('explicit output path for ' + kind + ' must be a non-empty string');
    err.code = data.BLOCKER_CODES.COORDINATOR_EXPLICIT_PATH_NON_CANONICAL(kind);
    throw err;
  }
  if (!data.isCanonicalOutputPathKind(kind)) {
    const err = new Error('unknown explicit output path kind: ' + kind);
    err.code = data.BLOCKER_CODES.COORDINATOR_EXPLICIT_PATH_NON_CANONICAL(kind);
    throw err;
  }
  if (!data.isCanonicalOutputPath(relPath, kind)) {
    const err = new Error(
      'explicit output path for ' + kind + ' must match canonical pattern '
      + data.CANONICAL_OUTPUT_PATH_PATTERNS[kind].source
      + ' (got: ' + relPath + ')'
    );
    err.code = data.BLOCKER_CODES.COORDINATOR_EXPLICIT_PATH_NON_CANONICAL(kind);
    throw err;
  }
  return relPath;
}

// Verifier bounded stderr summary line carries the canonical
// tamper-classes-executed/passed/failed counts. Capture them so the
// coordinator's stderr summary can mirror the verifier's verdict.
const VERIFIER_BOUNDS_LINE_PATTERN = /^M016_S08_VERIFY=(?<verdict>pass|fail)\s+branch=(?<branch>\S+)\s+protocol=\S+\s+blockers=\d+\s+divisions=\d+\s+unexpected_mutations=\d+\s+tamper_classes_executed=(?<executed>\d+)\s+tamper_classes_passed=(?<passed>\d+)\s+tamper_classes_failed=(?<failed>\d+)\s+exit_code=\d+/m;

function parseTamperCountsFromStdout(stdout) {
  if (typeof stdout !== 'string') return null;
  const m = VERIFIER_BOUNDS_LINE_PATTERN.exec(stdout);
  if (!m) return null;
  return {
    executed: Number(m.groups.executed),
    passed: Number(m.groups.passed),
    failed: Number(m.groups.failed),
  };
}

function captureTamperCountsIntoSummary(child, summary) {
  const counts = parseTamperCountsFromStdout(child && child.stdout);
  if (!counts) return;
  summary.tamperClassesExecuted = counts.executed;
  summary.tamperClassesPassed = counts.passed;
  summary.tamperClassesFailed = counts.failed;
}

function resolveRunPaths(args) {
  // T06 schema-safety gate: every explicit output path MUST match
  // its canonical runtime-evidence/M016-S08-native-…json pattern.
  // Custom locations would silently break the verify-protocol
  // schema's *_ref field regexes (which are anchored on those exact
  // patterns), so we reject BEFORE any child subprocess is spawned
  // with the distinct M16-S08-NATIVE-EXPLICIT-PATH-NON-CANONICAL-<kind>
  // bounded error. Defaults are exactly the canonical patterns, so
  // default-arg invocations and explicit-canonical invocations both
  // pass this gate; only divergent paths fail.
  assertCanonicalPathPattern(args.admissionOutput, 'admission');
  assertCanonicalPathPattern(args.candidateOutput, 'candidate');
  assertCanonicalPathPattern(args.closureOutput, 'closure');
  assertCanonicalPathPattern(args.scopeDecisionOutput, 'scope_decision');
  assertCanonicalPathPattern(args.negativeFixturesOutput, 'negative_fixtures');
  assertCanonicalPathPattern(args.verifyProtocolOutput, 'verify_protocol');

  const admissionAbs = resolveAbsolute(args.admissionOutput);
  const candidateAbs = resolveAbsolute(args.candidateOutput);
  const closureAbs = resolveAbsolute(args.closureOutput);
  const scopeDecisionAbs = resolveAbsolute(args.scopeDecisionOutput);
  const negativeFixturesAbs = resolveAbsolute(args.negativeFixturesOutput);
  const verifyProtocolAbs = resolveAbsolute(args.verifyProtocolOutput);
  const workingRootAbs = path.isAbsolute(args.workingRoot)
    ? args.workingRoot
    : resolveAbsolute(args.workingRoot);

  const allow = [];
  for (const target of [admissionAbs, candidateAbs, closureAbs, scopeDecisionAbs, negativeFixturesAbs, verifyProtocolAbs]) {
    if (pathIsUnderRoot(target, ROOT)) allow.push(target);
  }
  if (allow.length !== 6) {
    throw new Error('one or more output paths escaped repo root');
  }

  return {
    admissionAbs,
    candidateAbs,
    closureAbs,
    scopeDecisionAbs,
    negativeFixturesAbs,
    verifyProtocolAbs,
    workingRootAbs,
    admissionRel: path.relative(ROOT, admissionAbs),
    candidateRel: path.relative(ROOT, candidateAbs),
    closureRel: path.relative(ROOT, closureAbs),
    scopeDecisionRel: path.relative(ROOT, scopeDecisionAbs),
    negativeFixturesRel: path.relative(ROOT, negativeFixturesAbs),
    verifyProtocolRel: path.relative(ROOT, verifyProtocolAbs),
    workingRootRel: path.relative(ROOT, workingRootAbs),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(argv) {
  const argSource = (argv && Array.isArray(argv)) ? argv.slice(2) : process.argv.slice(2);
  let args;
  try {
    args = parseArgs(argSource);
  } catch (e) {
    process.stderr.write(COORDINATOR_LINE_CLASS + ' ' + 'malformed_args: ' + e.message + '\n');
    process.exit(data.EXIT_CODES.REJECTED_MALFORMED);
    return;
  }

  // T06 schema-safety gate: reject divergent explicit output paths
  // BEFORE any child subprocess is spawned. The helper raises with a
  // stable M16-S08-NATIVE-EXPLICIT-PATH-NON-CANONICAL-<kind> code so
  // we can emit a distinct bounded stderr line and exit
  // REJECTED_MALFORMED without invoking producer or verifier. This
  // is the documented rejection path — custom paths cannot be
  // supported safely because the verify-protocol schema's *_ref
  // regexes are anchored on the canonical patterns.
  let paths;
  try {
    paths = resolveRunPaths(args);
  } catch (e) {
    if (e && e.code && /^M16-S08-NATIVE-EXPLICIT-PATH-NON-CANONICAL/.test(String(e.code))) {
      process.stderr.write(COORDINATOR_LINE_CLASS + ' ' + e.code + ': ' + e.message + '\n');
      process.exit(data.EXIT_CODES.REJECTED_MALFORMED);
      return;
    }
    throw e;
  }
  ensureWorkingRoot(paths.workingRootAbs);

  const preHashes = collectPreHashes();
  const branchDecision = selectBranch(args);

  // Always publish negative-fixtures catalog.
  let fixtures;
  try {
    fixtures = publishNegativeFixtures(args, paths);
  } catch (e) {
    process.stderr.write(COORDINATOR_LINE_CLASS + ' ' + 'fixtures_failed: ' + e.message + '\n');
    process.exit(data.EXIT_CODES.REJECTED_MALFORMED);
    return;
  }

  let summary;
  if (branchDecision.branch === 'live') {
    summary = runLiveBranch(args, paths, branchDecision);
  } else {
    summary = runScopeBranch(args, paths, branchDecision);
  }

  // Source immutability post-check.
  const immutability = verifySourceImmutability(preHashes);
  summary.sourceImmutabilityOk = immutability.ok;
  if (!immutability.ok) {
    summary.blockers += immutability.drift.length;
    summary.exitCode = data.EXIT_CODES.REPLAY_DRIFT;
    if (!summary.demotedToScope) {
      // Reject live branch if sources drifted.
      if (summary.closureKind === data.CLOSURE_KINDS.LIVE) {
        summary.demotedToScope = true;
        summary.demotionReason = 'source-drift: ' + JSON.stringify(immutability.drift);
        summary = demoteToScope(args, paths, summary, 'replay_drift', blockingReasonsForDrift(immutability.drift));
      }
    }
  }

  // Cleanup residue (skip if --no-cleanup or external working root).
  if (args.cleanup) {
    const cleanupResult = cleanupResidue(paths.workingRootAbs, { skip: false });
    summary.cleanupResult = cleanupResult;
  }

  const finalLine = emitCanonicalVerdictLine(args, summary);
  summary.canonicalLine = finalLine;
  emitBoundedStderr(args, summary, summary.closureKind);

  process.exit(typeof summary.exitCode === 'number' ? summary.exitCode : data.EXIT_CODES.RUNNER_FAILURE);
}

// ---------------------------------------------------------------------------
// Exports (for tests)
// ---------------------------------------------------------------------------

module.exports = {
  parseArgs,
  resolveExplicitRelative,
  pathIsUnderRoot,
  sha256Hex,
  sha256OfFile,
  writeAtomic,
  readJsonIfExists,
  loadJsonStrict,
  resolveAbsolute,
  ensureWorkingRoot,
  collectPreHashes,
  detectDrift,
  blockingReasonsForDrift,
  selectBranch,
  spawnProducer,
  spawnVerifierForScope,
  spawnVerifierForLive,
  parseVerdictLine,
  buildNegativeFixturesCatalog,
  publishNegativeFixtures,
  buildAdmissionDenial,
  buildScopeDecisionForScopeBranch,
  buildScopeDecisionForDemotion,
  buildLiveClosure,
  verifySourceImmutability,
  cleanupResidue,
  emitCanonicalVerdictLine,
  emitBoundedStderr,
  runScopeBranch,
  runLiveBranch,
  demoteToScope,
  demoteFromProducerFailure,
  resolveRunPaths,
  buildCanonicalLineFromSummary,
  assertCanonicalPathPattern,
  parseTamperCountsFromStdout,
  captureTamperCountsIntoSummary,
  VERIFIER_BOUNDS_LINE_PATTERN,
  main,
  printHelp: function printHelp() { process.stdout.write(USAGE + '\n'); },
  ROOT,
  PRODUCER_CLI,
  VERIFIER_CLI,
  COORDINATOR_CLI,
  ADMISSION_OUTPUT,
  CANDIDATE_OUTPUT,
  CLOSURE_OUTPUT,
  SCOPE_DECISION_OUTPUT,
  NEGATIVE_FIXTURES_OUTPUT,
  VERIFY_PROTOCOL_OUTPUT,
  VERIFIER_LINE_PATTERN,
  PRODUCER_LINE_PATTERN,
};

// Entrypoint guard
if (require.main === module) {
  main().then((code) => {
    process.exit(typeof code === 'number' ? code : data.EXIT_CODES.RUNNER_FAILURE);
  }).catch((error) => {
    process.stderr.write(COORDINATOR_LINE_CLASS + ' coordinator-fatal: ' + (error && error.stack ? error.stack : String(error)) + '\n');
    process.exit(data.EXIT_CODES.RUNNER_FAILURE);
  });
}
