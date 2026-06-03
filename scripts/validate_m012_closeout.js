#!/usr/bin/env node
/**
 * validate_m012_closeout.js
 * Validates M012-S04-closeout-gate.json schema structure.
 * Exit 0 on pass, non-zero on fail.
 */

const fs = require('fs');
const path = require('path');

const GATE_PATH = path.join(__dirname, '..', 'runtime-evidence', 'M012-S04-closeout-gate.json');

const REQUIRED_TOP_FIELDS = [
  'schema_version',
  'artifact_type',
  'phase',
  'generated_at',
  'commands_run',
  'evidence_paths',
  'known_limitations',
  'downstream_recommendations',
  'overall_verdict',
];

const REQUIRED_COMMAND_FIELDS = [
  'command',
  'exit_code',
  'stdout_summary',
  'duration_ms',
  'verdict',
];

const VALID_VERDICTS = ['pass', 'fail', 'not_found'];

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function pass(msg) {
  console.log(`PASS: ${msg}`);
}

try {
  // Read and parse JSON
  const raw = fs.readFileSync(GATE_PATH, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    fail(`Invalid JSON: ${e.message}`);
  }

  // Check required top-level fields
  for (const field of REQUIRED_TOP_FIELDS) {
    if (!(field in data)) {
      fail(`Missing required top-level field: ${field}`);
    }
  }

  // Validate schema_version
  if (data.schema_version !== 'm012-s04-closeout-gate/v1') {
    fail(`Unexpected schema_version: ${data.schema_version}`);
  }
  pass(`schema_version is correct`);

  // Validate artifact_type
  if (data.artifact_type !== 'm012-closeout-gate') {
    fail(`Unexpected artifact_type: ${data.artifact_type}`);
  }
  pass(`artifact_type is correct`);

  // Validate phase
  if (data.phase !== 'M012-S04') {
    fail(`Unexpected phase: ${data.phase}`);
  }
  pass(`phase is correct`);

  // Validate generated_at is a valid ISO string
  const ts = new Date(data.generated_at);
  if (isNaN(ts.getTime())) {
    fail(`generated_at is not a valid ISO timestamp: ${data.generated_at}`);
  }
  pass(`generated_at is valid ISO timestamp`);

  // Validate commands_run is a non-empty array
  if (!Array.isArray(data.commands_run) || data.commands_run.length === 0) {
    fail(`commands_run must be a non-empty array`);
  }
  pass(`commands_run has ${data.commands_run.length} entries`);

  // Validate each command entry
  for (let i = 0; i < data.commands_run.length; i++) {
    const cmd = data.commands_run[i];
    for (const field of REQUIRED_COMMAND_FIELDS) {
      if (!(field in cmd)) {
        fail(`commands_run[${i}] missing field: ${field}`);
      }
    }
    if (!VALID_VERDICTS.includes(cmd.verdict)) {
      fail(`commands_run[${i}] invalid verdict: ${cmd.verdict} (expected one of: ${VALID_VERDICTS.join(', ')})`);
    }
    if (typeof cmd.exit_code !== 'number') {
      fail(`commands_run[${i}] exit_code must be a number`);
    }
    if (typeof cmd.duration_ms !== 'number') {
      fail(`commands_run[${i}] duration_ms must be a number`);
    }
  }
  pass(`All command entries structurally valid`);

  // Validate evidence_paths is an object
  if (typeof data.evidence_paths !== 'object' || Array.isArray(data.evidence_paths)) {
    fail(`evidence_paths must be an object`);
  }
  const evidenceCount = Object.keys(data.evidence_paths).length;
  if (evidenceCount === 0) {
    fail(`evidence_paths is empty`);
  }
  pass(`evidence_paths has ${evidenceCount} entries`);

  // Validate known_limitations is a non-empty array
  if (!Array.isArray(data.known_limitations) || data.known_limitations.length === 0) {
    fail(`known_limitations must be a non-empty array`);
  }
  pass(`known_limitations has ${data.known_limitations.length} entries`);

  // Validate downstream_recommendations is a non-empty array
  if (!Array.isArray(data.downstream_recommendations) || data.downstream_recommendations.length === 0) {
    fail(`downstream_recommendations must be a non-empty array`);
  }
  pass(`downstream_recommendations has ${data.downstream_recommendations.length} entries`);

  // Validate overall_verdict
  if (!['pass', 'fail'].includes(data.overall_verdict)) {
    fail(`overall_verdict must be "pass" or "fail", got: ${data.overall_verdict}`);
  }
  pass(`overall_verdict is "${data.overall_verdict}"`);

  // Summary
  const passCount = data.commands_run.filter(c => c.verdict === 'pass').length;
  const failCount = data.commands_run.filter(c => c.verdict === 'fail').length;
  const notFoundCount = data.commands_run.filter(c => c.verdict === 'not_found').length;

  console.log('');
  console.log(`=== M012-S04 Closeout Gate Validation PASSED ===`);
  console.log(`Commands: ${passCount} pass, ${failCount} fail, ${notFoundCount} not_found (${data.commands_run.length} total)`);
  console.log(`Evidence paths: ${evidenceCount}`);
  console.log(`Known limitations: ${data.known_limitations.length}`);
  console.log(`Downstream recommendations: ${data.downstream_recommendations.length}`);
  console.log(`Overall verdict: ${data.overall_verdict}`);

  process.exit(0);

} catch (err) {
  if (err.code === 'ENOENT') {
    fail(`Closeout gate artifact not found at: ${GATE_PATH}`);
  }
  fail(`Unexpected error: ${err.message}`);
}
