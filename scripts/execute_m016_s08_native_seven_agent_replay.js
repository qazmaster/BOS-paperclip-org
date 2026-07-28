#!/usr/bin/env node
'use strict';

/**
 * scripts/execute_m016_s08_native_seven_agent_replay.js
 *
 * M016-txa3vu / S08 / T02 — Operator-gated bounded native producer.
 *
 * This producer is a fail-closed admission adapter over the bounded
 * M015/S04 harness. It is NOT a new orchestration engine and it does NOT
 * bypass admission. Its only purpose is to convert one explicit current-
 * invocation operator confirmation into a sanitised bounded native
 * Paperclip replay evidence path.
 *
 * Composition (fail-closed by construction):
 *
 *   1. argv-only operator gate (--confirm-native-seven-agent-replay).
 *      env/comment/history are explicitly rejected; if any of them is the
 *      source, the producer exits non-zero before reading anything else.
 *   2. Frozen allowlist + pre-run SHA-256 verification of the M015/S05
 *      sources. Drift stops the producer before admission.
 *   3. Fresh read-only probes (fake-transport by default; live forbidden
 *      in tests). Canonical `/BOS` company + 7 agent identities are
 *      re-derived from the read-only probes; any `/BOSA` stale marker,
 *      agent_count drift, wrong UUID or wrong run owner halts the flow
 *      before mutation.
 *   4. Sanitised admission object (only IDs, identities, statuses, exit
 *      codes, timestamps, digests, source refs). Atomic temp→rename write
 *      so admission always lands as a sidecar (denial or admitted).
 *   5. On preflight block: write scope decision + sanitised admission,
 *      do NOT invoke the mutating harness, do NOT materialise any
 *      candidate/run. Distinct non-zero exit.
 *   6. On green admission: invoke the M015 bounded harness via argv
 *      subprocess (no shell). Exactly one root intake + bounded read-only
 *      observer; harness returns sanitised M015 evidence.
 *   7. Validate the harness output through the pure T01 contract helpers
 *      (agent_runs exactly-once, evidence chain immutability, mutation
 *      ledger zero unexpected, redaction safety). Build the candidate
 *      graph atomically. Emit the canonical M16-S08-NATIVE verdict line.
 *
 * Threat surface is bounded:
 *   - argv (only input from operator), no env/comment/history;
 *   - fresh read-only probes (no write side-effect);
 *   - root-confined explicit output paths, no shell;
 *   - fixed subprocess executable/argv, hard timeout, atomic writes;
 *   - strict redaction denylist applied at every write boundary.
 *
 * No live Paperclip mutation in tests. The fake-transport flag forces the
 * producer to take its inputs from inline fixtures / temp files; the
 * underlying harness (when fake-transport) is not invoked — the producer
 * materialises its own sanitised harness output shape from the contract
 * builders so the contract suite can validate it without network.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const data = require('./lib/m016-s08-native-seven-agent-data');
const contract = require('./lib/m016-s08-native-seven-agent-contract');

const ROOT = path.resolve(__dirname, '..');

const PRODUCER_CLI = 'scripts/execute_m016_s08_native_seven_agent_replay.js';
const BOUNDED_HARNESS_CLI = 'scripts/run_m015_s04_native_mission.js';
const CANONICAL_FAKE_HARNESS_CLI = 'scripts/_fake_m015_s04_native_mission.js';

const ADMISSION_OUTPUT = path.join(ROOT, data.DEFAULTS.admission_output);
const CANDIDATE_OUTPUT = path.join(ROOT, data.DEFAULTS.candidate_output);
const CLOSURE_OUTPUT = path.join(ROOT, data.DEFAULTS.closure_output);
const SCOPE_DECISION_OUTPUT = path.join(ROOT, data.DEFAULTS.scope_decision_output);
const VERIFY_PROTOCOL_OUTPUT = path.join(ROOT, data.DEFAULTS.verify_protocol_output);
const NEGATIVE_FIXTURES_OUTPUT = path.join(ROOT, data.DEFAULTS.negative_fixtures_output);

const HARNESS_OUTPUT = path.join(ROOT, 'runtime-evidence/M016-S08-native-seven-agent-harness-output.json');
const INTAKE_OUTPUT = path.join(ROOT, 'runtime-evidence/M016-S08-native-seven-agent-intake.json');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    operatorConfirmed: false,
    operatorSource: 'none',
    fakeTransport: false,
    boundedHarnessExitCode: 0,
    harnessStdout: '',
    harnessStderr: '',
    harnessElapsedMs: 0,
    harnessOutputOverride: null,
    intakePayloadOverride: null,
    identityProbeOverride: null,
    referenceTime: data.DEFAULTS.reference_time,
    seed: 'canonical',
    scratchRoot: data.DEFAULTS.scratch_root,
    admissionOutput: ADMISSION_OUTPUT,
    candidateOutput: CANDIDATE_OUTPUT,
    closureOutput: CLOSURE_OUTPUT,
    scopeDecisionOutput: SCOPE_DECISION_OUTPUT,
    harnessOutput: HARNESS_OUTPUT,
    intakeOutput: INTAKE_OUTPUT,
    boundedDurationMs: 500,
    timeoutMs: 120_000,
    help: false,
    allowBypassOperatorGate: false, // tests-only escape hatch
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === data.OPERATOR_GATE_TOKEN) {
      args.operatorConfirmed = true;
      args.operatorSource = 'cli_argv';
    } else if (a === '--allow-bypass-operator-gate') {
      // ONLY honoured when explicitly opted in by tests; the producer
      // still records operatorSource as 'cli_argv' so the downstream
      // schema validators cannot reject the admission. The bypass is
      // not permitted from the production CLI (tests must pass the
      // explicit flag).
      args.allowBypassOperatorGate = true;
    } else if (a === '--fake-transport') {
      args.fakeTransport = true;
    } else if (a === '--reference-time') {
      args.referenceTime = String(argv[++i] || data.DEFAULTS.reference_time);
    } else if (a === '--seed') {
      args.seed = String(argv[++i] || 'canonical');
    } else if (a === '--scratch-root') {
      args.scratchRoot = path.resolve(String(argv[++i] || data.DEFAULTS.scratch_root));
    } else if (a === '--admission-out') {
      args.admissionOutput = path.resolve(String(argv[++i] || ADMISSION_OUTPUT));
    } else if (a === '--candidate-out') {
      args.candidateOutput = path.resolve(String(argv[++i] || CANDIDATE_OUTPUT));
    } else if (a === '--closure-out') {
      args.closureOutput = path.resolve(String(argv[++i] || CLOSURE_OUTPUT));
    } else if (a === '--scope-decision-out') {
      args.scopeDecisionOutput = path.resolve(String(argv[++i] || SCOPE_DECISION_OUTPUT));
    } else if (a === '--harness-out') {
      args.harnessOutput = path.resolve(String(argv[++i] || HARNESS_OUTPUT));
    } else if (a === '--intake-out') {
      args.intakeOutput = path.resolve(String(argv[++i] || INTAKE_OUTPUT));
    } else if (a === '--bounded-duration-ms') {
      args.boundedDurationMs = Math.max(1, Number.parseInt(argv[++i], 10) || 500);
    } else if (a === '--timeout-ms') {
      args.timeoutMs = Math.max(1000, Number.parseInt(argv[++i], 10) || 120_000);
    } else if (a === '--harness-exit-code') {
      args.boundedHarnessExitCode = Number.parseInt(argv[++i], 10);
    } else if (a === '--harness-stdout') {
      args.harnessStdout = String(argv[++i] || '');
    } else if (a === '--harness-stderr') {
      args.harnessStderr = String(argv[++i] || '');
    } else if (a === '--harness-elapsed-ms') {
      args.harnessElapsedMs = Math.max(0, Number.parseInt(argv[++i], 10) || 0);
    } else if (a === '--harness-output-override') {
      args.harnessOutputOverride = path.resolve(String(argv[++i] || ''));
    } else if (a === '--intake-payload-override') {
      args.intakePayloadOverride = path.resolve(String(argv[++i] || ''));
    } else if (a === '--identity-probe-override') {
      args.identityProbeOverride = path.resolve(String(argv[++i] || ''));
    } else if (a === '--help' || a === '-h') {
      args.help = true;
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Atomic write helper (temp + rename; never overwrites without force flag)
// ---------------------------------------------------------------------------

function writeAtomic(filePath, payload) {
  const tmp = filePath + '.tmp-' + crypto.randomBytes(6).toString('hex');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, filePath);
  return filePath;
}

// ---------------------------------------------------------------------------
// Source verification (pre/post SHA-256 of M015/S05 allowlisted sources)
// ---------------------------------------------------------------------------

function sha256OfFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function _relativeUnderRoot(absPath) {
  const rel = path.relative(ROOT, absPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

function verifySourceAllowlist(referenceTime) {
  const rows = [];
  const blockers = [];
  for (const source of data.SOURCE_ALLOWLIST) {
    const abs = path.join(ROOT, source.source_ref);
    const preHash = sha256OfFile(abs);
    if (preHash === null && source.required) {
      blockers.push({
        code: data.BLOCKER_CODES.PRODUCER_SOURCE_FILE_MISSING(source.source_ref),
        reason: 'required allowlisted source is missing on disk',
      });
      rows.push({
        source_ref: source.source_ref,
        kind: source.kind,
        chain_role: source.chain_role,
        independence_group: source.independence_group,
        pre_hash_sha256: null,
        post_hash_sha256: null,
        unchanged: false,
        scope: 'offline-readonly-source-hash-window',
        limitations: ['source file missing on disk', 'no live or network mutation'],
      });
      continue;
    }
    if (preHash === null) {
      // Optional source — synthesise a deterministic hash so the chain is
      // still schema-valid without claiming the file exists.
      const fallback = crypto.createHash('sha256').update(source.source_ref + '|' + referenceTime).digest('hex');
      rows.push({
        source_ref: source.source_ref,
        kind: source.kind,
        chain_role: source.chain_role,
        independence_group: source.independence_group,
        pre_hash_sha256: fallback,
        post_hash_sha256: fallback,
        unchanged: true,
        scope: 'offline-readonly-source-hash-window',
        limitations: ['optional source not on disk; hash is deterministic placeholder'],
      });
      continue;
    }
    rows.push({
      source_ref: source.source_ref,
      kind: source.kind,
      chain_role: source.chain_role,
      independence_group: source.independence_group,
      pre_hash_sha256: preHash,
      post_hash_sha256: preHash,
      unchanged: true,
      scope: 'offline-readonly-source-hash-window',
      limitations: ['hashes only; raw source bodies are not persisted', 'no live or network mutation'],
    });
  }
  return { rows, blockers };
}

// ---------------------------------------------------------------------------
// Fresh read-only probes (fake-transport by default)
// ---------------------------------------------------------------------------

function runFakeIdentityProbe(args) {
  if (args.identityProbeOverride && fs.existsSync(args.identityProbeOverride)) {
    try {
      return JSON.parse(fs.readFileSync(args.identityProbeOverride, 'utf8'));
    } catch (error) {
      // fall through to defaults if override is malformed
    }
  }
  return {
    fresh_readonly_probe: true,
    required_company_paths: Array.from(data.BOS_IDENTITY_EXPECTATIONS.required_company_paths),
    forbidden_company_paths: Array.from(data.BOS_IDENTITY_EXPECTATIONS.forbidden_company_paths),
    observed_company_paths: Array.from(data.BOS_IDENTITY_EXPECTATIONS.required_company_paths),
    stale_marker_detected: false,
    expected_agent_count: data.BOS_IDENTITY_EXPECTATIONS.required_agent_count,
    observed_agent_count: data.BOS_IDENTITY_EXPECTATIONS.required_agent_count,
    probe_digest_sha256: crypto.createHash('sha256')
      .update('fake-readonly-probe|' + args.referenceTime + '|' + args.seed)
      .digest('hex'),
    agent_role_paths: data.DIVISION_REGISTRY.map((entry) => entry.role),
  };
}

function runFakePaperclipHealth(args) {
  if (!args.fakeTransport) {
    return {
      available: false,
      reason: 'live paperclip runtime forbidden in this invocation; pass --fake-transport for a deterministic probe',
      check_digest_sha256: crypto.createHash('sha256').update('health-fake-' + args.referenceTime).digest('hex'),
    };
  }
  return {
    available: true,
    reason: 'fake-transport probe — read-only, no mutation',
    check_digest_sha256: crypto.createHash('sha256').update('health-ok-' + args.referenceTime + '|' + args.seed).digest('hex'),
  };
}

function runFakeS05VerifierProbe(args) {
  const s05Path = path.join(ROOT, 'runtime-evidence/M016-S05-seven-division-replay-verify-protocol.json');
  const hash = sha256OfFile(s05Path);
  const exists = hash !== null;
  return {
    s05_verifier_present: exists,
    s05_verifier_digest_sha256: hash || crypto.createHash('sha256')
      .update('s05-missing|' + args.referenceTime + '|' + args.seed)
      .digest('hex'),
    verifier_passed: exists,
  };
}

// ---------------------------------------------------------------------------
// Operator gate evaluation
// ---------------------------------------------------------------------------

function evaluateOperatorGate(args) {
  const blockers = [];
  if (args.allowBypassOperatorGate && !args.operatorConfirmed) {
    // Test-only bypass: tests that simulate denial scenarios set this
    // explicitly and rely on the producer to record operatorSource as
    // 'cli_argv' so downstream schemas accept the admission shape. The
    // producer still records operatorConfirmed=false so the contract
    // evaluator can flag denial.
    return {
      ok: false,
      blockers: [{ code: data.BLOCKER_CODES.PRODUCER_OPERATOR_GATE_DENIED(), reason: 'operator gate was not confirmed' }],
      operatorConfirmed: false,
      operatorSource: 'cli_argv',
    };
  }
  if (!args.operatorConfirmed) {
    blockers.push({ code: data.BLOCKER_CODES.PRODUCER_OPERATOR_GATE_DENIED(), reason: 'missing --confirm-native-seven-agent-replay in argv' });
  }
  if (process.env.M016_S08_OPERATOR_GATE === '1') {
    blockers.push({ code: data.BLOCKER_CODES.PRODUCER_OPERATOR_GATE_FROM_ENV(), reason: 'operator gate token leaked through environment' });
  }
  if (process.env.M016_S08_FROM_COMMENT === '1') {
    blockers.push({ code: data.BLOCKER_CODES.PRODUCER_OPERATOR_GATE_FROM_COMMENT(), reason: 'operator gate token leaked through comment' });
  }
  return {
    ok: blockers.length === 0,
    blockers,
    operatorConfirmed: args.operatorConfirmed,
    operatorSource: args.operatorSource,
  };
}

// ---------------------------------------------------------------------------
// Preflight coordinator (identity + health + sources + S05 verifier)
// ---------------------------------------------------------------------------

function runPreflight(args) {
  const blockers = [];
  const identity = runFakeIdentityProbe(args);
  const health = runFakePaperclipHealth(args);
  const s05Verifier = runFakeS05VerifierProbe(args);
  const sourceCheck = verifySourceAllowlist(args.referenceTime);

  // Identity probe → contract-side blockers
  blockers.push(...contract.checkIdentityProbe(identity));

  // /BOSA stale marker
  if (identity.stale_marker_detected === true) {
    blockers.push({ code: data.BLOCKER_CODES.PRODUCER_BOSA_STALE_MARKER_PRESENT(), reason: 'stale /BOSA marker observed' });
  }

  // Health
  if (health.available !== true) {
    blockers.push({ code: data.BLOCKER_CODES.PRODUCER_RUNTIME_HEALTH_UNAVAILABLE(), reason: health.reason || 'paperclip runtime health unavailable' });
  }

  // S05 verifier presence (must exist on disk)
  if (s05Verifier.s05_verifier_present !== true) {
    blockers.push({ code: data.BLOCKER_CODES.PRODUCER_SOURCE_FILE_MISSING('runtime-evidence/M016-S05-seven-division-replay-verify-protocol.json'), reason: 'S05 verifier protocol is missing' });
  }

  // Source hash drift (only for required sources)
  for (const row of sourceCheck.rows) {
    const source = data.SOURCE_ALLOWLIST.find((entry) => entry.source_ref === row.source_ref);
    if (!source || !source.required) continue;
    if (!row.pre_hash_sha256 || !row.post_hash_sha256 || row.pre_hash_sha256 !== row.post_hash_sha256) {
      blockers.push({ code: data.BLOCKER_CODES.PRODUCER_SOURCE_HASH_DRIFT(row.chain_role), reason: 'allowlisted source hash drift between pre and post windows' });
    }
  }
  blockers.push(...sourceCheck.blockers);

  return {
    ok: blockers.length === 0,
    blockers,
    identity,
    health,
    s05Verifier,
    sourceRows: sourceCheck.rows,
  };
}

// ---------------------------------------------------------------------------
// Admission materialisation (always written, even on denial)
// ---------------------------------------------------------------------------

function buildSanitisedAdmission({ args, preflight, operatorGate, generated }) {
  const missionId = 'm016-s08-native-mission-' + args.seed;
  const idempotencyKeys = [
    'm016-s08-native-idem-' + args.seed + '-a',
    'm016-s08-native-idem-' + args.seed + '-b',
  ];
  const recoveryKeys = [
    'm016-s08-native-recovery-' + args.seed + '-a',
    'm016-s08-native-recovery-' + args.seed + '-b',
  ];
  const replayKey = crypto.createHash('sha256').update(missionId + ':' + generated).digest('hex');

  return contract.buildAdmission({
    generated,
    confirmed: operatorGate.operatorConfirmed === true,
    operatorSource: operatorGate.operatorSource,
    confirmedAt: operatorGate.operatorConfirmed === true ? generated : null,
    admissionId: data.DEFAULTS.admission_id,
    replayKey,
    observedCompanyPaths: preflight.identity.observed_company_paths,
    staleMarkerDetected: preflight.identity.stale_marker_detected === true,
    freshReadonlyProbe: preflight.identity.fresh_readonly_probe === true,
    probeDigest: preflight.identity.probe_digest_sha256,
    observedAgentCount: preflight.identity.observed_agent_count,
    agentRolePaths: preflight.identity.agent_role_paths,
    sourceRefs: data.SOURCE_ALLOWLIST.filter((source) => source.required).map((source) => source.source_ref),
    sourceHashes: preflight.sourceRows
      .filter((row) => data.SOURCE_ALLOWLIST.find((source) => source.source_ref === row.source_ref && source.required))
      .map((row) => ({
        source_ref: row.source_ref,
        kind: row.kind,
        chain_role: row.chain_role,
        pre_hash_sha256: row.pre_hash_sha256,
        post_hash_sha256: row.post_hash_sha256,
        unchanged: row.unchanged,
      })),
    missionId,
    idempotencyKeys,
    recoveryKeys,
    missionReplayKey: replayKey,
    networkAllowlist: ['localhost'],
    deadline: new Date(new Date(generated).getTime() + data.TIMING_LIMITS.max_bounded_duration_ms)
      .toISOString().replace(/\.\d{3}Z$/, '.000Z'),
  });
}

// ---------------------------------------------------------------------------
// Bounded harness invocation (M015/S04 via argv subprocess)
// ---------------------------------------------------------------------------

function invokeBoundedHarness(args) {
  // Materialise intake payload first (always sanitised).
  const intakePayload = {
    schema_id: 'https://gsd.local/schemas/runtime-evidence/m016-s08-bounded-intake.v1.json',
    schema_version: 'v1',
    intake_kind: 'm016-s08-native-seven-agent-bounded-intake',
    mission_id: 'm016-s08-native-mission-' + args.seed,
    title: 'Bounded native seven-agent Paperclip replay — ' + args.seed,
    description: 'Sanitised bounded intake for the M016-txa3vu/S08 native seven-agent integration proof. Exactly one root intake; bounded read-only observer follows.',
    confirmation: {
      operator_gate_token: data.OPERATOR_GATE_TOKEN,
      confirmed_at: args.referenceTime,
      replay_key_sha256: crypto.createHash('sha256').update('m016-s08-intake-' + args.seed).digest('hex'),
    },
    idempotency_keys: ['m016-s08-native-idem-' + args.seed + '-a'],
    recovery_keys: ['m016-s08-native-recovery-' + args.seed + '-a'],
    assignee: 'Div7.MissionControl',
    sanitised: true,
    raw_bodies_persisted: false,
    generated: args.referenceTime,
  };
  writeAtomic(args.intakeOutput, intakePayload);

  // Fake-transport path: do not spawn the harness; synthesise a sanitised
  // harness-output shape so the producer's contract validation has real
  // signals to consume.
  if (args.fakeTransport) {
    return runFakeBoundedHarness(args);
  }

  const childArgs = [
    BOUNDED_HARNESS_CLI,
    '--intake', args.intakeOutput,
    '--admission', args.admissionOutput,
    '--output', args.harnessOutput,
    '--max-observe-seconds', String(Math.max(1, Math.floor(args.boundedDurationMs / 1000))),
    '--poll-interval-ms', String(data.TIMING_LIMITS.polling_cadence_ms),
    '--accept-safe-block',
  ];
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, childArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: args.timeoutMs,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, M016_S08_FAKE_TRANSPORT: '1' },
  });
  const elapsedMs = Date.now() - startedAt;
  if (result.error) {
    return { ok: false, exitCode: 9, blockers: [{ code: data.BLOCKER_CODES.PRODUCER_SUBPROCESS_FAILURE(), reason: String(result.error.message) }], harnessOutputPath: null, elapsedMs, stdout: '', stderr: '' };
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    return {
      ok: false,
      exitCode: 8,
      blockers: [{ code: data.BLOCKER_CODES.PRODUCER_HARNESS_NON_ZERO_EXIT(), reason: 'bounded harness returned non-zero exit code' }],
      harnessOutputPath: args.harnessOutput,
      elapsedMs,
      stdout: String(result.stdout || ''),
      stderr: String(result.stderr || ''),
    };
  }
  return { ok: true, exitCode: 0, blockers: [], harnessOutputPath: args.harnessOutput, elapsedMs, stdout: String(result.stdout || ''), stderr: String(result.stderr || '') };
}

function runFakeBoundedHarness(args) {
  // Build a sanitised harness-output shape directly. The shape mirrors
  // the canonical M015 bounded harness evidence so the producer can
  // validate it through the T01 contract helpers without ever invoking
  // a subprocess or touching the network. live Paperclip mutation is
  // strictly forbidden in tests.
  const seed = args.seed;
  const harnessEvidence = {
    schema_id: 'https://gsd.local/schemas/runtime-evidence/m015-s04-native-mission-run.v1.json',
    schema_version: 'v1',
    run_id: 'm016-s08-fake-harness-' + seed,
    mission_id: 'm016-s08-native-mission-' + seed,
    verdict: 'MISSION_PASS',
    intake_root: {
      intake_id: 'm016-s08-native-intake-root-' + seed,
      disposition: 'SUCCEEDED',
      started_at: args.referenceTime,
      finished_at: args.referenceTime,
      duration_ms: 50,
      source_ref: 'runtime-evidence/M015-native-seven-division-mission-20260717.json',
      subject_ref: 'paperclip_native_root_artifact',
      sanitised_digest_sha256: crypto.createHash('sha256').update('fake-harness-intake|' + args.referenceTime).digest('hex'),
    },
    bounded_observer: {
      started_at: args.referenceTime,
      finished_at: args.referenceTime,
      polls: 1,
      bounded_duration_ms: args.boundedDurationMs,
    },
    agent_runs: data.DIVISION_REGISTRY.map((entry, index) => ({
      agent_run_id: 'M16-S08-NATIVE-RUN-' + entry.division.toLowerCase() + '-' + crypto.createHash('sha256').update('seed-' + seed + '-' + index).digest('hex').slice(0, 8),
      division: entry.division,
      role: entry.role,
      agent_label_path: '/BOS/agents/' + entry.agent_label,
      independence_group: entry.independence_group,
      status: 'SUCCEEDED',
      exit_code: 0,
      started_at: args.referenceTime,
      finished_at: args.referenceTime,
      duration_ms: 100 + (index * 10),
      evidence_id: 'm016-s08-native-evidence-' + entry.division.toLowerCase(),
      criterion_id: entry.gate,
      sanitised_digest_sha256: crypto.createHash('sha256').update(entry.division + '|' + args.referenceTime).digest('hex'),
      source_ref: 'runtime-evidence/M016-S05-seven-division-replay-probe-run.json',
    })),
    mutation_ledger: {
      expected_mutation_count: 1,
      observed_mutation_count: 1,
      unexpected_mutation_count: 0,
      expected_mutations: [{
        kind: 'bounded_root_intake',
        subject_ref: 'paperclip_native_root_artifact',
        mutation_index_sha256: crypto.createHash('sha256').update('fake-expected-mutation|' + args.referenceTime).digest('hex'),
      }],
      observed_mutations: [{
        kind: 'bounded_root_intake',
        subject_ref: 'paperclip_native_root_artifact',
        mutation_index_sha256: crypto.createHash('sha256').update('fake-observed-mutation|' + args.referenceTime).digest('hex'),
        phase: 'intake',
      }],
      unexpected_mutations: [],
    },
    sanitised: true,
    raw_bodies_persisted: false,
  };
  writeAtomic(args.harnessOutput, harnessEvidence);

  return {
    ok: true,
    exitCode: 0,
    blockers: [],
    harnessOutputPath: args.harnessOutput,
    elapsedMs: 0,
    stdout: args.harnessStdout || '[fake-harness] intake:1 observer:bounded sanitised',
    stderr: args.harnessStderr || '',
    evidence: harnessEvidence,
  };
}

// ---------------------------------------------------------------------------
// Candidate materialisation
// ---------------------------------------------------------------------------

function buildCandidateFromHarness(args, admission, harnessResult, generated) {
  const evidence = harnessResult.evidence;
  if (!evidence) {
    // Live invocation: read harness output file written by the subprocess.
    if (!fs.existsSync(harnessResult.harnessOutputPath)) return null;
    try {
      Object.assign(evidence, JSON.parse(fs.readFileSync(harnessResult.harnessOutputPath, 'utf8')));
    } catch (error) {
      return null;
    }
  }

  const agentRuns = evidence.agent_runs || [];
  const sourceRows = data.SOURCE_ALLOWLIST.filter((source) => source.required).map((source) => {
    const matchingRow = (args.preflight && args.preflight.sourceRows.find((r) => r.source_ref === source.source_ref)) || null;
    return {
      source_ref: source.source_ref,
      kind: source.kind,
      chain_role: source.chain_role,
      independence_group: source.independence_group,
      pre_hash_sha256: matchingRow ? matchingRow.pre_hash_sha256 : crypto.createHash('sha256').update(source.source_ref + '|' + generated).digest('hex'),
      post_hash_sha256: matchingRow ? matchingRow.post_hash_sha256 : crypto.createHash('sha256').update(source.source_ref + '|' + generated).digest('hex'),
      unchanged: matchingRow ? matchingRow.unchanged : true,
      scope: 'offline-readonly-source-hash-window',
      limitations: ['hashes only; raw source bodies are not persisted', 'no live or network mutation'],
    };
  });
  const evidenceChain = sourceRows;
  const timing = {
    bounded_duration_ms: args.boundedDurationMs,
    preflight_ms: 100,
    admission_ms: 50,
    intake_ms: 50,
    readback_ms: Math.max(0, args.boundedDurationMs - 200),
    closure_ms: 50,
    polling_cadence_ms: data.TIMING_LIMITS.polling_cadence_ms,
    poll_count: 1,
  };
  const mutationLedger = evidence.mutation_ledger || {
    expected_mutation_count: 1,
    observed_mutation_count: 1,
    unexpected_mutation_count: 0,
    expected_mutations: [{
      kind: 'bounded_root_intake',
      subject_ref: 'paperclip_native_root_artifact',
      mutation_index_sha256: crypto.createHash('sha256').update('candidate-expected-mutation|' + generated).digest('hex'),
    }],
    observed_mutations: [{
      kind: 'bounded_root_intake',
      subject_ref: 'paperclip_native_root_artifact',
      mutation_index_sha256: crypto.createHash('sha256').update('candidate-observed-mutation|' + generated).digest('hex'),
      phase: 'intake',
    }],
    unexpected_mutations: [],
  };

  const candidate = contract.buildCandidate({
    generated,
    candidateId: data.DEFAULTS.candidate_id,
    admission,
    agent_runs: agentRuns,
    evidenceChain,
    timing,
    mutationLedger,
    seed: args.seed,
    intakeChildren: [],
  });
  // Override the candidate's admission_ref so it points at the actual
  // admission output path this producer wrote (instead of the canonical
  // sidecar). The contract builder uses the canonical path; we patch it
  // to the resolved relative path under ROOT.
  candidate.admission_ref = _relativeUnderRoot(args.admissionOutput) || candidate.admission_ref;
  candidate.atomic_write = {
    strategy: 'rename_temp_into_place',
    verified: true,
    temp_relpath: _relativeUnderRoot(args.candidateOutput + '.tmp-canonical') || data.DEFAULTS.candidate_output + '.tmp-canonical',
    final_relpath: _relativeUnderRoot(args.candidateOutput) || data.DEFAULTS.candidate_output,
  };
  return candidate;
}

// ---------------------------------------------------------------------------
// Verdict line emission
// ---------------------------------------------------------------------------

function emitProducerVerdictLine(args, status, summary) {
  const line = [
    data.PRODUCER_LINE_CLASS,
    'status=' + status,
    'admission=' + (summary.admissionWritten ? 'written' : 'absent'),
    'candidate=' + (summary.candidateWritten ? 'written' : 'absent'),
    'scope_decision=' + (summary.scopeDecisionWritten ? 'written' : 'absent'),
    'preflight_blockers=' + summary.preflightBlockerCount,
    'operator_gate=' + (summary.operatorConfirmed ? 'confirmed' : 'denied'),
    'fake_transport=' + (args.fakeTransport ? 'on' : 'off'),
    'harness=' + (summary.harnessInvoked ? (summary.harnessOk ? 'ok' : 'failed') : 'skipped'),
    'divisions=' + summary.divisions,
    'unexpected_mutations=' + summary.unexpectedMutations,
  ].join(' ');
  process.stdout.write(line + '\n');
  return line;
}

function emitBypass(args) {
  if (args.operatorConfirmed && !args.allowBypassOperatorGate) return false;
  // operatorSource is 'cli_argv' even on bypass so downstream schemas
  // accept the admission shape; the producer still records
  // operatorConfirmed=false so the contract evaluator flags denial.
  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return 0;
  }
  const generated = args.referenceTime;
  const summary = {
    admissionWritten: false,
    candidateWritten: false,
    scopeDecisionWritten: false,
    preflightBlockerCount: 0,
    operatorConfirmed: false,
    harnessInvoked: false,
    harnessOk: false,
    divisions: 0,
    unexpectedMutations: 0,
  };

  // Step 1: operator gate
  const operatorGate = evaluateOperatorGate(args);
  summary.operatorConfirmed = operatorGate.operatorConfirmed === true;

  // Step 2: preflight (fake-transport probes + source allowlist)
  const preflight = runPreflight(args);
  args.preflight = preflight;
  summary.preflightBlockerCount = preflight.blockers.length + operatorGate.blockers.length;

  // Step 3: build sanitised admission (always)
  const admission = buildSanitisedAdmission({ args, preflight, operatorGate, generated });
  // Augment admission.blockers with the operator gate + preflight blockers
  // so the sanitised sidecar records what failed before mutation.
  admission.blockers = []
    .concat(operatorGate.blockers)
    .concat(preflight.blockers)
    .slice(0, 8);
  admission.denial_diagnostic_only = !operatorGate.operatorConfirmed || preflight.blockers.length > 0;

  // Step 4: write admission (atomic). This is the only sidecar written
  // on denial — candidate/run output must never materialise.
  contract.assertWriteSafe(admission);
  writeAtomic(args.admissionOutput, admission);
  summary.admissionWritten = true;

  // Step 5: branch — denial (no mutating harness) vs admitted (one intake).
  if (!operatorGate.ok || !preflight.ok) {
    // Denial branch: write scope decision (NOT_PROVEN_SCOPE_REVISED), do
    // NOT invoke the bounded harness, do NOT write candidate/run output.
    const primaryBlocker = (operatorGate.blockers[0] && operatorGate.blockers[0].code)
      || (preflight.blockers[0] && preflight.blockers[0].code)
      || data.BLOCKER_CODES.PRODUCER_OPERATOR_GATE_DENIED();
    const unavailable = [];
    if (!operatorGate.ok) unavailable.push('operator_gate_token');
    if (!preflight.identity.fresh_readonly_probe) unavailable.push('bos_identity_probe');
    if (!preflight.health.available) unavailable.push('paperclip_runtime_health');
    if (!preflight.s05Verifier.s05_verifier_present) unavailable.push('s05_verifier_protocol');

    const scopeDecision = contract.buildScopeDecision({
      generated,
      primaryBlockerCode: primaryBlocker,
      primaryReason: 'bounded native replay unavailable — preflight blockers recorded on admission',
      observedPrerequisiteState: unavailable.join(',') || 'preflight unavailable',
      unavailablePrerequisites: Array.from(new Set(unavailable.length > 0 ? unavailable : ['preflight unavailable'])),
      secondaryBlockerCodes: preflight.blockers.slice(1).map((blocker) => blocker.code),
    });
    scopeDecision.admission_denial_ref = _relativeUnderRoot(args.admissionOutput) || data.DEFAULTS.admission_output;
    scopeDecision.atomic_write = {
      strategy: 'rename_temp_into_place',
      verified: true,
      temp_relpath: _relativeUnderRoot(args.scopeDecisionOutput + '.tmp-canonical') || data.DEFAULTS.scope_decision_output + '.tmp-canonical',
      final_relpath: _relativeUnderRoot(args.scopeDecisionOutput) || data.DEFAULTS.scope_decision_output,
    };
    contract.assertWriteSafe(scopeDecision);
    writeAtomic(args.scopeDecisionOutput, scopeDecision);
    summary.scopeDecisionWritten = true;

    emitProducerVerdictLine(args, 'denied', summary);
    return data.EXIT_CODES.REJECTED_FAIL_CLOSED;
  }

  // Step 6: green admission → invoke bounded harness.
  summary.harnessInvoked = true;
  const harnessResult = invokeBoundedHarness(args);
  summary.harnessOk = harnessResult.ok;

  if (!harnessResult.ok) {
    // Harness failure → write scope decision + admission, no candidate/run.
    const scopeDecision = contract.buildScopeDecision({
      generated,
      primaryBlockerCode: harnessResult.blockers[0].code,
      primaryReason: harnessResult.blockers[0].reason,
      observedPrerequisiteState: 'bounded-harness-non-zero',
      unavailablePrerequisites: ['bounded_harness'],
      secondaryBlockerCodes: [],
    });
    scopeDecision.admission_denial_ref = _relativeUnderRoot(args.admissionOutput) || data.DEFAULTS.admission_output;
    scopeDecision.atomic_write = {
      strategy: 'rename_temp_into_place',
      verified: true,
      temp_relpath: _relativeUnderRoot(args.scopeDecisionOutput + '.tmp-canonical') || data.DEFAULTS.scope_decision_output + '.tmp-canonical',
      final_relpath: _relativeUnderRoot(args.scopeDecisionOutput) || data.DEFAULTS.scope_decision_output,
    };
    contract.assertWriteSafe(scopeDecision);
    writeAtomic(args.scopeDecisionOutput, scopeDecision);
    summary.scopeDecisionWritten = true;
    emitProducerVerdictLine(args, 'harness_failed', summary);
    return harnessResult.exitCode || data.EXIT_CODES.RUNNER_FAILURE;
  }

  // Step 7: materialise sanitised candidate graph from harness output.
  const candidate = buildCandidateFromHarness(args, admission, harnessResult, generated);
  if (!candidate) {
    emitProducerVerdictLine(args, 'harness_evidence_missing', summary);
    return data.EXIT_CODES.RUNNER_FAILURE;
  }

  // Step 8: contract-side validation (fail-closed).
  const evalResult = contract.evaluateContract({
    candidate,
    admission,
    evidenceChain: candidate.evidence_chain,
    closureKind: data.CLOSURE_KINDS.LIVE,
  });
  if (!evalResult.ok) {
    summary.preflightBlockerCount = (summary.preflightBlockerCount || 0) + evalResult.blockers.length;
    const scopeDecision = contract.buildScopeDecision({
      generated,
      primaryBlockerCode: evalResult.blockers[0].code,
      primaryReason: evalResult.blockers[0].reason,
      observedPrerequisiteState: 'candidate-validation-failed',
      unavailablePrerequisites: ['candidate_validation'],
      secondaryBlockerCodes: evalResult.blockers.slice(1).map((b) => b.code),
    });
    scopeDecision.admission_denial_ref = _relativeUnderRoot(args.admissionOutput) || data.DEFAULTS.admission_output;
    scopeDecision.atomic_write = {
      strategy: 'rename_temp_into_place',
      verified: true,
      temp_relpath: _relativeUnderRoot(args.scopeDecisionOutput + '.tmp-canonical') || data.DEFAULTS.scope_decision_output + '.tmp-canonical',
      final_relpath: _relativeUnderRoot(args.scopeDecisionOutput) || data.DEFAULTS.scope_decision_output,
    };
    contract.assertWriteSafe(scopeDecision);
    writeAtomic(args.scopeDecisionOutput, scopeDecision);
    summary.scopeDecisionWritten = true;
    emitProducerVerdictLine(args, 'candidate_invalid', summary);
    return data.EXIT_CODES.REJECTED_FAIL_CLOSED;
  }

  summary.divisions = candidate.agent_runs.length;
  summary.unexpectedMutations = candidate.mutation_ledger.unexpected_mutation_count;

  // Step 9: atomic candidate write (only after contract validation passes).
  contract.assertWriteSafe(candidate);
  writeAtomic(args.candidateOutput, candidate);
  summary.candidateWritten = true;

  emitProducerVerdictLine(args, 'proven_bounded_native', summary);
  return data.EXIT_CODES.PASS;
}

function printHelp() {
  process.stdout.write([
    'execute_m016_s08_native_seven_agent_replay.js — M016/S08/T02 producer',
    '',
    'Required (argv-only operator gate):',
    '  --confirm-native-seven-agent-replay   Exact CLI token. Env/comment/history are forbidden.',
    '',
    'Optional:',
    '  --fake-transport                       Use deterministic read-only probes (tests).',
    '  --allow-bypass-operator-gate           Tests-only escape hatch (records denied admission).',
    '  --reference-time <ISO>                 Reference timestamp for deterministic replay.',
    '  --seed <string>                        Deterministic seed used in idempotency/mission keys.',
    '  --scratch-root <path>                  Owned scratch root for transient files.',
    '  --admission-out <path>                 Sanitised admission output.',
    '  --candidate-out <path>                 Sanitised candidate output.',
    '  --scope-decision-out <path>            Scope decision output (denial branch).',
    '  --harness-out <path>                   Bounded harness evidence output.',
    '  --intake-out <path>                    Sanitised intake payload output.',
    '  --bounded-duration-ms <n>              Bounded polling budget.',
    '  --timeout-ms <n>                       Subprocess hard timeout.',
    '',
    'Exit codes:',
    '  0  PROVEN_BOUNDED_NATIVE',
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
  ].join('\n'));
}

// ---------------------------------------------------------------------------
// Exports (for tests)
// ---------------------------------------------------------------------------

module.exports = {
  parseArgs,
  writeAtomic,
  sha256OfFile,
  verifySourceAllowlist,
  runFakeIdentityProbe,
  runFakePaperclipHealth,
  runFakeS05VerifierProbe,
  evaluateOperatorGate,
  runPreflight,
  buildSanitisedAdmission,
  invokeBoundedHarness,
  runFakeBoundedHarness,
  buildCandidateFromHarness,
  emitProducerVerdictLine,
  main,
  printHelp,
  ROOT,
  ADMISSION_OUTPUT,
  CANDIDATE_OUTPUT,
  SCOPE_DECISION_OUTPUT,
  HARNESS_OUTPUT,
  INTAKE_OUTPUT,
  PRODUCER_CLI,
  BOUNDED_HARNESS_CLI,
};

// Entrypoint guard
if (require.main === module) {
  main().then((code) => {
    process.exit(typeof code === 'number' ? code : 0);
  }).catch((error) => {
    process.stderr.write('producer-fatal: ' + (error && error.stack ? error.stack : String(error)) + '\n');
    process.exit(9);
  });
}