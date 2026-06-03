#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MATRIX_PATH = path.join(ROOT, 'runtime-evidence', 'M011-S01-capability-matrix.json');
const REQUIRED_KEYS = [
  'company.divisions_active',
  'resource.secret_resolution',
  'mission.lifecycle',
  'artifact.issue_document_comment_native',
  'git.local_hybrid_push',
  'workflow.mission_intake',
  'workflow.hitl_gates',
  'workflow.branch_policy',
  'workflow.qa_review',
  'workflow.pr_merge_ci',
  'plugin.host_registration',
  'plugin.piko_tools',
  'runtime.hermes_xiaomi_execution',
  'runtime.gsdpi_execution',
];
const ALLOWED_STATUSES = new Set(['confirmed', 'local-only', 'fallback-only', 'blocked', 'unknown']);
const FORBIDDEN_CONFIRMED_PREFIXES = ['plugin.', 'runtime.hermes', 'runtime.gsdpi'];

function fail(errors) {
  console.error('M011 capability matrix validation failed:');
  for (const err of errors) console.error(`- ${err}`);
  process.exit(1);
}

function hasRuntimeExecutionProof(row) {
  return (row.evidence || []).some((e) => e && e.artifact_type === 'runtime-execution-proof' && e.passing === true);
}

function main() {
  const errors = [];
  if (!fs.existsSync(MATRIX_PATH)) fail([`missing ${path.relative(ROOT, MATRIX_PATH)}`]);
  const matrix = JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8'));

  if (matrix.schema_version !== 'm011-s01-capability-matrix/v1') errors.push(`unexpected schema_version ${matrix.schema_version}`);
  if (matrix.artifact_type !== 'capability-reconciliation-matrix') errors.push(`unexpected artifact_type ${matrix.artifact_type}`);
  if (!matrix.safety || matrix.safety.plaintext_secrets_requested_or_logged !== false) errors.push('safety.plaintext_secrets_requested_or_logged must be false');
  if (!matrix.safety || matrix.safety.external_mutations !== 0) errors.push('safety.external_mutations must be 0');
  if (!Array.isArray(matrix.capabilities) || matrix.capabilities.length < REQUIRED_KEYS.length) errors.push('capabilities array is missing or too short');

  const byKey = new Map((matrix.capabilities || []).map((row) => [row.key, row]));
  for (const key of REQUIRED_KEYS) {
    if (!byKey.has(key)) errors.push(`missing required capability ${key}`);
  }

  for (const row of matrix.capabilities || []) {
    if (!row.key) errors.push('row missing key');
    if (!ALLOWED_STATUSES.has(row.status)) errors.push(`${row.key}: invalid status ${row.status}`);
    if (!row.category) errors.push(`${row.key}: missing category`);
    if (!Array.isArray(row.evidence)) errors.push(`${row.key}: evidence must be array`);
    if (!Array.isArray(row.blockers)) errors.push(`${row.key}: blockers must be array`);
    if (row.status === 'confirmed') {
      const okEvidence = (row.evidence || []).some((e) => e && e.exists !== false && (e.passing === true || e.path === 'runtime-evidence/M006-S00-runtime-capability-inventory.json' || e.path === 'runtime-evidence/M006-S01-plugin-live-registration.json'));
      if (!okEvidence) errors.push(`${row.key}: confirmed row lacks positive evidence`);
      if (row.blockers && row.blockers.length > 0) errors.push(`${row.key}: confirmed row must not carry blockers`);
    }
    if (['fallback-only', 'blocked'].includes(row.status) && (!row.blockers || row.blockers.length === 0) && !String(row.notes || '').toLowerCase().includes('blocked')) {
      errors.push(`${row.key}: ${row.status} row needs blocker codes or blocker note`);
    }
    if (FORBIDDEN_CONFIRMED_PREFIXES.some((prefix) => row.key.startsWith(prefix)) && row.status === 'confirmed' && !hasRuntimeExecutionProof(row)) {
      errors.push(`${row.key}: forbidden confirmed status without runtime-execution-proof`);
    }
  }

  const statusCounts = (matrix.capabilities || []).reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  const serializedCounts = JSON.stringify(statusCounts);
  if (JSON.stringify(matrix.status_counts || {}) !== serializedCounts) {
    errors.push(`status_counts mismatch expected ${serializedCounts}`);
  }

  const sourceFiles = matrix.source_files || [];
  for (const f of sourceFiles) {
    if (!f.exists) errors.push(`source file missing: ${f.path}`);
    if (f.exists && !f.sha256) errors.push(`source file lacks sha256: ${f.path}`);
  }

  if (errors.length) fail(errors);
  console.log(`validated ${path.relative(ROOT, MATRIX_PATH)}`);
  console.log(`capabilities ${matrix.capabilities.length}`);
  console.log(`status_counts ${serializedCounts}`);
}

main();
