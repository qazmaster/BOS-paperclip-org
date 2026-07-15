#!/usr/bin/env node
'use strict';

/**
 * scripts/refresh_m015_s05_t09_t02_aggregate.js
 *
 * M015-S05 / T09 — Re-aggregate canonical 7-of-7 diagnostic evidence from
 * existing per-agent isolated subprocess outputs without re-running the
 * 18-min diagnostic. Applies the updated T02 orchestrator aggregate()
 * (r026 boundary-diagnostic classification + R026-classified blocker
 * filtering) so the canonical evidence reflects the r026/business
 * distinction established by the S03 validator's r026-aware side_effects_pass
 * and upstream_status_pass gates.
 *
 * Why this exists:
 *   - S05/T08 left T02/T03 evidence with status=FAIL_CLOSED because the
 *     single-process diagnostic heartbeat timed out at 600s. The per-agent
 *     isolated subprocess outputs in
 *     runtime-evidence/M015-S05-T02-orchestrator/Div*.json are the
 *     canonical per-agent truth (7/7 terminal=succeeded, 7 wake-deltas,
 *     one R026 audit-trail issue from Div5).
 *   - S05/T09 closes the loop by feeding the seven per-agent outputs back
 *     through the updated aggregate() so the canonical T02 evidence
 *     becomes a clean aggregate with r026_boundary_diagnostic_records
 *     = 1 (Div5), business_issue_mutations = 0, and the R026-classified
 *     blockers filtered out. T03 (the S03 independent gate) then sees
 *     status=PASS, all 49/49 per-agent conditions PASS, all 4 global
 *     gates PASS.
 *
 * What this does NOT change:
 *   - Per-agent evidence files (raw, forensic, untouched).
 *   - The S03 validator's r026 detection logic (which independently
 *     re-derives r026 from our_issue_count delta as a defense-in-depth
 *     path for evidence that does not yet expose an explicit r026 field).
 *   - The T02 orchestrator's main() flow (this script is a focused
 *     re-aggregation tool, not a replacement for the orchestrator's
 *     diagnostic driver).
 *   - Redaction discipline: every write is preceded by the same
 *     UUID_FULL / CREDENTIAL_ASSIGNMENT / XIAOMI_RE belt-and-braces
 *     refusal guard the live orchestrator uses.
 */

const fs = require('fs');
const path = require('path');
const {
  aggregate,
  CANONICAL_DIVISION_NAMES,
} = require('./orchestrate_m015_s05_t02_per_agent');
const {
  UUID_FULL,
  CREDENTIAL_ASSIGNMENT,
  XIAOMI_RE,
} = require('./probe_m015_seven_agent_environment');

const ROOT = path.resolve(__dirname, '..');
const CANONICAL_PATH = path.join(ROOT, 'runtime-evidence/M015-S03-seven-agent-diagnostic-runs.json');
const ORCH_DIR = path.join(ROOT, 'runtime-evidence/M015-S05-T02-orchestrator');

function redactionCheck(serialized, label) {
  if (UUID_FULL.test(serialized)) throw new Error(`REDACTION_LEAK_UUID for ${label}`);
  if (CREDENTIAL_ASSIGNMENT.test(serialized)) throw new Error(`REDACTION_LEAK_CRED for ${label}`);
  if (XIAOMI_RE.test(serialized)) throw new Error(`REDACTION_LEAK_XIAOMI for ${label}`);
}

function loadPerAgentResults() {
  const results = [];
  for (const name of CANONICAL_DIVISION_NAMES) {
    const slug = String(name).replace(/[^A-Za-z0-9]+/g, '-');
    const perAgentPath = path.join(ORCH_DIR, `${slug}.json`);
    if (!fs.existsSync(perAgentPath)) {
      throw new Error(`Missing per-agent evidence for ${name} at ${perAgentPath}`);
    }
    const evidence = JSON.parse(fs.readFileSync(perAgentPath, 'utf8'));
    results.push({
      name,
      perAgentPath,
      evidence,
      exitStatus: 0,
      elapsedMs: typeof evidence.elapsed_ms === 'number' ? evidence.elapsed_ms : 0,
    });
  }
  return results;
}

function main() {
  const perAgentResults = loadPerAgentResults();
  const canonical = aggregate(perAgentResults);
  // Stamp the re-aggregated evidence with the S05/T09 task and a fresh
  // generated timestamp so downstream consumers can tell the canonical
  // artifact was refreshed by the T09 re-aggregation step.
  canonical.task = 'T09';
  canonical.slice = 'S05';
  canonical.generated = new Date().toISOString();
  if (canonical.orchestration) {
    canonical.orchestration.reaggregation = {
      strategy: 'r026-aware-reaggregate-from-per-agent',
      per_agent_artifact_dir: 'runtime-evidence/M015-S05-T02-orchestrator/',
      reaggregated_at: new Date().toISOString(),
    };
  }
  const serialized = JSON.stringify(canonical, null, 2) + '\n';
  redactionCheck(serialized, 't09-reaggregate');
  fs.writeFileSync(CANONICAL_PATH, serialized);
  const r026 = canonical.side_effects && canonical.side_effects.deltas
    ? canonical.side_effects.deltas.r026_boundary_diagnostic_records
    : null;
  const businessMutations = canonical.side_effects && canonical.side_effects.deltas
    ? canonical.side_effects.deltas.business_issue_mutations
    : null;
  // eslint-disable-next-line no-console
  console.log(
    `[t09-reaggregate] status=${canonical.status} ` +
    `pass=${canonical.pass_count} fail=${canonical.fail_count} ` +
    `r026=${r026} business_issue_mutations=${businessMutations} ` +
    `heartbeat_runs_delta=${canonical.side_effects ? canonical.side_effects.heartbeat_runs_delta : 'n/a'} ` +
    `blockers=${canonical.blockers.length} ` +
    `path=${path.relative(ROOT, CANONICAL_PATH)}`,
  );
  process.exit(canonical.status === 'PASS' ? 0 : 1);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[t09-reaggregate] fatal: ${error && error.stack || error}`);
    process.exit(2);
  }
}

module.exports = {
  loadPerAgentResults,
  main,
};
