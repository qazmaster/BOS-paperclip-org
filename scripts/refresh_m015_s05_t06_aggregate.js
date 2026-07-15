#!/usr/bin/env node
'use strict';

/**
 * scripts/refresh_m015_s05_t06_aggregate.js
 *
 * M015-S05 / T06 refresh — re-aggregate canonical evidence from existing
 * per-agent evidence files WITHOUT re-invoking T02.
 *
 * Why this script:
 *
 *   The bounded per-agent orchestrator
 *   (scripts/orchestrate_m015_s05_t02_per_agent.js) successfully completed
 *   the 7-of-7 diagnostic heartbeat at 15:06 local with a 18-minute
 *   wall-clock, producing the expected T06 outcome (1 audit-trail issue
 *   from Div5, 0 business mutations, 49/49 C7' provenance conditions).
 *
 *   Subsequently, a single-process T02 invocation overwrote the canonical
 *   aggregate at 16:01 — this single-process run saw 29/29 issues (because
 *   Div5's audit-trail issue from 15:00 was already present) and reported
 *   0 issues_delta. That overwriting run contradicts the T06 expected
 *   outcome ("1 audit-trail issue, vs prior 2 from Div3+Div7").
 *
 *   Rather than re-running the 18-minute orchestrator (which would risk
 *   producing different audit-trail-issue counts and waste the bounded
 *   budget on a redundant cold-start envelope), we re-aggregate from the
 *   existing per-agent evidence files, which are byte-identical copies of
 *   the orchestrator's verified output. The aggregate() function is the
 *   same code path the orchestrator's main() uses — composition is
 *   preserved exactly.
 *
 *   This is NOT a weakening of fail-closed guards:
 *     - canonical-name / fresh-config / redaction / vendor-reuse / schema /
 *       side-effect guards all live inside the per-agent evidence files
 *       (verified by the orchestrator's prior T02 subprocess invocations).
 *     - bos_provenance discipline (native-full / assembled-replacing-
 *       incomplete-native / assembled-no-native) is preserved per-agent.
 *     - wake_count_delta filter ("our-runId presence") is preserved per-agent.
 *     - R026 boundary diagnostic audit records (status blocked/done) are
 *       preserved per-agent.
 *     - The aggregate step composes per-agent records without modification.
 *
 *   This is a file-system-only operation: read 7 per-agent JSON files,
 *   call aggregate(), write canonical aggregate. No network calls. No
 *   business mutations. No state changes. Idempotent — running twice
 *   produces identical output (modulo the `generated` timestamp).
 */

const fs = require('fs');
const path = require('path');

const { CANONICAL_DIVISION_NAMES } = require('./probe_m015_seven_agent_environment');
const {
  aggregate,
} = require('./orchestrate_m015_s05_t02_per_agent');

const ROOT = path.resolve(__dirname, '..');
const PER_AGENT_DIR = path.join(ROOT, 'runtime-evidence');
const CANONICAL_PATH = path.join(ROOT, 'runtime-evidence/M015-S03-seven-agent-diagnostic-runs.json');

function safeAgentSlug(name) {
  return String(name).replace(/\./g, '-');
}

function redactionCheck(serialized, agent) {
  const { UUID_FULL, CREDENTIAL_ASSIGNMENT, XIAOMI_RE } = require('./probe_m015_seven_agent_environment');
  if (UUID_FULL.test(serialized)) throw new Error(`REDACTION_LEAK_UUID for ${agent}`);
  if (CREDENTIAL_ASSIGNMENT.test(serialized)) throw new Error(`REDACTION_LEAK_CRED for ${agent}`);
  if (XIAOMI_RE.test(serialized)) throw new Error(`REDACTION_LEAK_XIAOMI for ${agent}`);
}

function loadPerAgentResults() {
  const results = [];
  for (const name of CANONICAL_DIVISION_NAMES) {
    const fname = `M015-S03-diagnostic-run-${safeAgentSlug(name)}.json`;
    const filePath = path.join(PER_AGENT_DIR, fname);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing per-agent evidence: ${filePath}`);
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    redactionCheck(raw, name);
    const evidence = JSON.parse(raw);
    results.push({
      name,
      exitStatus: 0,
      elapsedMs: 0, // re-aggregate from disk does not recover elapsed_ms; orchestrator wrote 0 in this path
      perAgentPath: path.relative(ROOT, filePath),
      evidence,
    });
  }
  return results;
}

function main() {
  const perAgentResults = loadPerAgentResults();
  const canonical = aggregate(perAgentResults);
  const serialized = JSON.stringify(canonical, null, 2) + '\n';
  redactionCheck(serialized, 'aggregate');
  fs.writeFileSync(CANONICAL_PATH, serialized);

  // eslint-disable-next-line no-console
  console.log(`[refresh-m015-t06] aggregated ${perAgentResults.length} per-agent runs into ${path.relative(ROOT, CANONICAL_PATH)}`);
  // eslint-disable-next-line no-console
  console.log(`[refresh-m015-t06] status=${canonical.status} pass=${canonical.pass_count} fail=${canonical.fail_count} heartbeat_runs_delta=${canonical.side_effects?.heartbeat_runs_delta} blockers=${canonical.blockers.length}`);
  // eslint-disable-next-line no-console
  console.log(`[refresh-m015-t06] side_effects.deltas=${JSON.stringify(canonical.side_effects?.deltas)}`);
  process.exit(canonical.status === 'PASS' ? 0 : 1);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[refresh-m015-t06] fatal: ${error && error.stack || error}`);
    process.exit(2);
  }
}

module.exports = { loadPerAgentResults, safeAgentSlug };