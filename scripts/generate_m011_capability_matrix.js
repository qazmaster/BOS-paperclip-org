#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const OUT_JSON = path.join(ROOT, 'runtime-evidence', 'M011-S01-capability-matrix.json');
const OUT_MD = path.join(ROOT, 'runtime-evidence', 'M011-S01-capability-matrix.md');

function readJson(rel, required = true) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    if (required) throw new Error(`Missing required JSON: ${rel}`);
    return null;
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function fileInfo(rel, required = true) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    if (required) throw new Error(`Missing required file: ${rel}`);
    return { path: rel, exists: false };
  }
  const buf = fs.readFileSync(p);
  return {
    path: rel,
    exists: true,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    bytes: buf.length,
  };
}

function evidenceStatus(rel) {
  const data = readJson(rel, false);
  if (!data) return { path: rel, exists: false, passing: false, artifact_type: null, promotions: [], blocker_codes: ['missing_evidence_file'] };
  return {
    path: rel,
    exists: true,
    passing: Boolean(data.passing),
    artifact_type: data.artifact_type || null,
    promotions: Array.isArray(data.capability_promotions) ? data.capability_promotions : [],
    blocker_codes: Array.isArray(data.blocker_codes) ? data.blocker_codes : [],
    generated_at: data.generated_at || null,
  };
}

function capFromLedger(ledger, key) {
  const row = (ledger.capabilities || []).find((c) => c.key === key);
  if (!row) return null;
  return {
    ledger_key: row.key,
    ledger_status: row.status,
    evidence_source: row.evidence_source || '',
    blocker_text: row.blocker_text || '',
    proof_command: row.proof_command || '',
  };
}

function row({ key, surface, status, category, evidence = [], blockers = [], sources = [], notes = '', ledger = null }) {
  return {
    key,
    surface,
    status,
    category,
    evidence,
    blockers,
    sources,
    notes,
    ledger,
  };
}

function statusCounts(rows) {
  return rows.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
}

function main() {
  const ledger = readJson('plugin-bos-light/capabilities.paperclip-runtime.json');
  const evidence = {
    company: evidenceStatus('runtime-evidence/M005-S02-company-template-runtime-probe-live.json'),
    resources: evidenceStatus('runtime-evidence/M005-S03-resource-intake-runtime-probe-live.json'),
    git: evidenceStatus('runtime-evidence/M005-S04-git-hybrid-runtime-probe-live.json'),
    mission: evidenceStatus('runtime-evidence/M005-S05-e2e-mission-runtime-probe-live.json'),
    governance: evidenceStatus('runtime-evidence/M005-S05-e2e-governance-probe.json'),
    plugin: evidenceStatus('runtime-evidence/M006-S01-plugin-live-registration.json'),
    runtimeInventory: evidenceStatus('runtime-evidence/M006-S00-runtime-capability-inventory.json'),
    m010E2e: evidenceStatus('plugin-bos-light/runtime-evidence/M010-S04-e2e-workflow.json'),
  };

  const sourceFiles = [
    'plugin-bos-light/src/missionIntake.ts',
    'plugin-bos-light/src/missionRouter.ts',
    'plugin-bos-light/src/grantPolicy.ts',
    'plugin-bos-light/src/hitlGovernance.ts',
    'plugin-bos-light/src/externalIO.ts',
    'plugin-bos-light/src/gitOperations.ts',
    'plugin-bos-light/src/qaReview.ts',
    'plugin-bos-light/tests/missionIntake.test.ts',
    'plugin-bos-light/tests/hitlGovernance.test.ts',
    'plugin-bos-light/tests/externalIO.test.ts',
    'plugin-bos-light/tests/gitOperations.test.ts',
    'plugin-bos-light/tests/qaReview.test.ts',
    'plugin-bos-light/tests/e2eWorkflow.test.ts',
  ].map((p) => fileInfo(p, false));

  const capabilities = [];

  capabilities.push(row({
    key: 'company.divisions_active',
    surface: 'Paperclip /BOS company with seven BOS Light divisions',
    status: evidence.company.passing && evidence.company.promotions.includes('company.divisions_active') ? 'confirmed' : 'blocked',
    category: 'live-runtime-proof',
    evidence: [evidence.company],
    blockers: evidence.company.blocker_codes,
    sources: ['company-template/bos-company-template.json'],
    notes: 'Canonical /BOS company evidence supersedes old missing-auth import-prep rows for division visibility only.',
    ledger: capFromLedger(ledger, 'company_template.import_export'),
  }));

  capabilities.push(row({
    key: 'resource.secret_resolution',
    surface: 'Paperclip secrets API credential storage and resolution',
    status: evidence.resources.passing && evidence.resources.promotions.includes('resource.secret_resolution') ? 'confirmed' : 'blocked',
    category: 'live-runtime-proof',
    evidence: [evidence.resources],
    blockers: evidence.resources.blocker_codes,
    sources: ['plugin-bos-light/src/grantPolicy.ts'],
    notes: 'Confirms secrets API/storage readback, not permission to disclose or transmit secrets externally.',
    ledger: capFromLedger(ledger, 'workflow.resource_intake'),
  }));

  capabilities.push(row({
    key: 'mission.lifecycle',
    surface: 'Native Paperclip mission issue create, assign, lifecycle',
    status: evidence.mission.passing && evidence.mission.promotions.includes('mission.lifecycle') ? 'confirmed' : 'blocked',
    category: 'live-runtime-proof',
    evidence: [evidence.mission],
    blockers: evidence.mission.blocker_codes,
    sources: ['plugin-bos-light/src/missionIntake.ts', 'plugin-bos-light/src/missionRouter.ts'],
    notes: 'Confirms native issue lifecycle mission path, not plugin-host tool invocation.',
    ledger: capFromLedger(ledger, 'issues.native'),
  }));

  capabilities.push(row({
    key: 'artifact.issue_document_comment_native',
    surface: 'Native Paperclip issue, document, and comment artifact surfaces',
    status: 'confirmed',
    category: 'live-runtime-proof',
    evidence: [evidence.runtimeInventory, evidence.plugin],
    blockers: [],
    sources: ['runtime-evidence/M006-S01-plugin-live-registration.json', 'plugin-bos-light/capabilities.paperclip-runtime.json'],
    notes: 'Confirmed by prior native readback evidence; current S02 reprobe will refresh auth-dependent visibility.',
    ledger: capFromLedger(ledger, 'documents.native') || capFromLedger(ledger, 'comments.native'),
  }));

  capabilities.push(row({
    key: 'git.local_hybrid_push',
    surface: 'Local git clone, branch, commit, push with artifact mirror posture',
    status: evidence.git.passing && evidence.git.promotions.includes('git.push') ? 'confirmed' : 'blocked',
    category: 'live-runtime-proof',
    evidence: [evidence.git],
    blockers: evidence.git.blocker_codes,
    sources: ['plugin-bos-light/src/gitOperations.ts'],
    notes: 'Confirms local git/SSH push path, not GitHub API PR/merge/CI operations.',
    ledger: capFromLedger(ledger, 'git.local_cli'),
  }));

  capabilities.push(row({
    key: 'workflow.mission_intake',
    surface: 'Div7 mission framing and approval artifact creation',
    status: 'local-only',
    category: 'implemented-and-tested',
    evidence: [evidence.governance],
    blockers: evidence.governance.blocker_codes,
    sources: ['plugin-bos-light/src/missionIntake.ts', 'plugin-bos-light/tests/missionIntake.test.ts'],
    notes: 'Implemented and locally smoke-tested; live artifact mirroring remains blocked in governance proof when Paperclip auth is absent.',
    ledger: capFromLedger(ledger, 'workflow.mission_intake'),
  }));

  capabilities.push(row({
    key: 'workflow.hitl_gates',
    surface: 'Resource, batch, deploy, and human gate artifacts',
    status: 'local-only',
    category: 'implemented-and-tested',
    evidence: [evidence.governance],
    blockers: evidence.governance.blocker_codes,
    sources: ['plugin-bos-light/src/hitlGovernance.ts', 'plugin-bos-light/tests/hitlGovernance.test.ts'],
    notes: 'Gate creation and timeout/decision logic are implemented; live human polling and artifact mirroring need auth proof.',
    ledger: capFromLedger(ledger, 'workflow.hitl_gates'),
  }));

  capabilities.push(row({
    key: 'workflow.branch_policy',
    surface: 'Branch policy blocks direct main/master and force push',
    status: 'local-only',
    category: 'implemented-and-tested',
    evidence: [evidence.governance],
    blockers: evidence.governance.blocker_codes,
    sources: ['plugin-bos-light/src/hitlGovernance.ts', 'plugin-bos-light/src/gitOperations.ts'],
    notes: 'Smoke proof shows policy decisions; live git push enforcement beyond prior git proof remains a future integrated run.',
    ledger: capFromLedger(ledger, 'workflow.branch_policy'),
  }));

  capabilities.push(row({
    key: 'workflow.qa_review',
    surface: 'Div5 QA review, diff hash, security scan, eval gate',
    status: 'local-only',
    category: 'implemented-and-tested',
    evidence: [evidence.governance, evidence.m010E2e],
    blockers: evidence.governance.blocker_codes,
    sources: ['plugin-bos-light/src/qaReview.ts', 'plugin-bos-light/tests/qaReview.test.ts'],
    notes: 'Local QA logic is covered and M010 E2E passes; live Paperclip artifact mirroring remains auth-dependent.',
    ledger: capFromLedger(ledger, 'workflow.qa_review'),
  }));

  capabilities.push(row({
    key: 'workflow.pr_merge_ci',
    surface: 'Div6 GitHub PR create, approve, merge, workflow trigger/watch',
    status: 'fallback-only',
    category: 'implemented-but-live-blocked',
    evidence: [evidence.governance],
    blockers: evidence.governance.blocker_codes.length ? evidence.governance.blocker_codes : ['missing_live_github_api_proof'],
    sources: ['plugin-bos-light/src/externalIO.ts', 'plugin-bos-light/tests/externalIO.test.ts'],
    notes: 'Implemented via gh CLI and GitHub HTTP adapter, but live PR/merge/CI is unexercised without GitHub token and explicit external-service confirmation.',
    ledger: capFromLedger(ledger, 'workflow.pr_merge'),
  }));

  capabilities.push(row({
    key: 'plugin.host_registration',
    surface: 'BOS Light loaded as Paperclip plugin and observable through supported host readback',
    status: 'fallback-only',
    category: 'host-surface-blocked',
    evidence: [evidence.plugin],
    blockers: evidence.plugin.blocker_codes.length ? evidence.plugin.blocker_codes : ['plugin_host_readback_missing'],
    sources: ['plugin-bos-light/manifest.paperclip-plugin.json', 'plugin-bos-light/src/worker.ts'],
    notes: 'Do not promote from local manifest or optional chaining; route discovery returned unsupported/404 in existing live proof.',
    ledger: capFromLedger(ledger, 'plugin.runtime.registration'),
  }));

  capabilities.push(row({
    key: 'plugin.piko_tools',
    surface: 'piko:* tool registration and invocation through Paperclip host',
    status: 'fallback-only',
    category: 'host-surface-blocked',
    evidence: [evidence.plugin],
    blockers: evidence.plugin.blocker_codes.length ? evidence.plugin.blocker_codes : ['piko_tool_readback_missing'],
    sources: ['plugin-bos-light/src/worker.ts', 'plugin-bos-light/manifest.paperclip-plugin.json'],
    notes: 'No piko tool readback or invocation result is present; local TypeScript functions remain callable directly only.',
    ledger: capFromLedger(ledger, 'registration.tools'),
  }));

  capabilities.push(row({
    key: 'runtime.hermes_xiaomi_execution',
    surface: 'Hermes Xiaomi model runtime execution as Paperclip-owned agent run',
    status: 'fallback-only',
    category: 'runtime-execution-blocked',
    evidence: [evidenceStatus('runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe.json')],
    blockers: ['adapter_registry_auth_denied', 'missing_auth', 'missing_xiaomi_api_key', 'missing_xiaomi_base_url', 'test_environment_auth_denied'],
    sources: ['plugin-bos-light/capabilities.paperclip-runtime.json'],
    notes: 'Requires supported adapter registry readback, passing testEnvironment, exactly one bounded run, wakeCountDelta=1, and resultJson.bos before promotion.',
    ledger: capFromLedger(ledger, 'hermes.execution.xiaomi'),
  }));

  capabilities.push(row({
    key: 'runtime.gsdpi_execution',
    surface: 'GSD-Pi local adapter execution with BosAdapterResult',
    status: 'fallback-only',
    category: 'runtime-execution-blocked',
    evidence: [evidenceStatus('runtime-evidence/M002-S12-gsdpi-runtime-execution-proof.json')],
    blockers: ['adapter_registry_unavailable', 'health_unavailable', 'missing_auth', 'test_environment_not_passing'],
    sources: ['adapters/gsdpi-local/src/index.ts', 'plugin-bos-light/capabilities.paperclip-runtime.json'],
    notes: 'Memory and evidence say gsdpi_local remains unregistered; local package readiness is not runtime capability promotion.',
    ledger: null,
  }));

  const matrix = {
    schema_version: 'm011-s01-capability-matrix/v1',
    artifact_type: 'capability-reconciliation-matrix',
    phase: 'M011-S01',
    generated_at: new Date().toISOString(),
    safety: {
      read_only: true,
      plaintext_secrets_requested_or_logged: false,
      external_mutations: 0,
      direct_db_mutation: false,
    },
    status_enum: ['confirmed', 'local-only', 'fallback-only', 'blocked', 'unknown'],
    status_counts: statusCounts(capabilities),
    source_files: sourceFiles,
    evidence_inventory: evidence,
    capabilities,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(matrix, null, 2) + '\n');

  const lines = [];
  lines.push('# M011 S01 Capability Matrix');
  lines.push('');
  lines.push(`Generated: ${matrix.generated_at}`);
  lines.push('');
  lines.push('## Status Counts');
  lines.push('');
  for (const [k, v] of Object.entries(matrix.status_counts)) lines.push(`- ${k}: ${v}`);
  lines.push('');
  lines.push('## Capabilities');
  lines.push('');
  lines.push('| Key | Status | Category | Evidence | Blockers |');
  lines.push('|---|---|---|---|---|');
  for (const c of capabilities) {
    const ev = c.evidence.map((e) => e.path).filter(Boolean).join('<br>');
    const blockers = c.blockers.join(', ') || 'none';
    lines.push(`| ${c.key} | ${c.status} | ${c.category} | ${ev} | ${blockers} |`);
  }
  lines.push('');
  lines.push('## Proof Gate Notes');
  lines.push('');
  lines.push('- Plugin host registration and piko tools remain fallback-only unless supported host readback observes BOS Light and registered tools.');
  lines.push('- Hermes and GSD-Pi remain fallback-only unless future runtime-execution-proof evidence includes the required adapter readback and bounded execution payloads.');
  lines.push('- Native Paperclip mission/company/resource/git capabilities are listed separately from plugin-host capabilities to avoid over-promotion.');
  fs.writeFileSync(OUT_MD, lines.join('\n') + '\n');

  console.log(`wrote ${path.relative(ROOT, OUT_JSON)}`);
  console.log(`wrote ${path.relative(ROOT, OUT_MD)}`);
  console.log(`status_counts ${JSON.stringify(matrix.status_counts)}`);
}

main();
