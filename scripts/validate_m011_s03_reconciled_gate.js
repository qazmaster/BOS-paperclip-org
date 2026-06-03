#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GATE = path.join(ROOT, 'runtime-evidence', 'M011-S03-reconciled-capability-gate.json');

function fail(errors) {
  console.error('M011 S03 reconciled gate validation failed:');
  for (const err of errors) console.error(`- ${err}`);
  process.exit(1);
}

function main() {
  const errors = [];
  if (!fs.existsSync(GATE)) fail([`missing ${path.relative(ROOT, GATE)}`]);
  const gate = JSON.parse(fs.readFileSync(GATE, 'utf8'));
  if (gate.schema_version !== 'm011-s03-reconciled-capability-gate/v1') errors.push(`unexpected schema_version ${gate.schema_version}`);
  if (gate.artifact_type !== 'm012-execution-gate') errors.push(`unexpected artifact_type ${gate.artifact_type}`);
  if (!gate.safety || gate.safety.plaintext_secrets_requested_or_logged !== false) errors.push('secret logging flag must be false');
  if (!gate.safety || gate.safety.external_mutations_in_this_slice !== 0) errors.push('S03 must perform zero external mutations');
  if (!gate.safety || gate.safety.m012_requires_explicit_confirmation_for_external_mutation !== true) errors.push('M012 external mutation confirmation gate is required');

  const summary = gate.capability_summary || {};
  const confirmed = new Set(summary.confirmed || []);
  const localOnly = new Set(summary.local_only || []);
  const fallbackOnly = new Set(summary.fallback_only || []);
  for (const key of ['company.divisions_active', 'resource.secret_resolution', 'mission.lifecycle', 'artifact.issue_document_comment_native', 'git.local_hybrid_push']) {
    if (!confirmed.has(key)) errors.push(`expected confirmed capability missing: ${key}`);
  }
  for (const key of ['workflow.mission_intake', 'workflow.hitl_gates', 'workflow.branch_policy', 'workflow.qa_review']) {
    if (!localOnly.has(key)) errors.push(`expected local-only capability missing: ${key}`);
  }
  for (const key of ['plugin.host_registration', 'plugin.piko_tools', 'runtime.hermes_xiaomi_execution', 'runtime.gsdpi_execution', 'workflow.pr_merge_ci']) {
    if (!fallbackOnly.has(key)) errors.push(`expected fallback-only capability missing: ${key}`);
    if (confirmed.has(key)) errors.push(`forbidden confirmed capability: ${key}`);
  }

  const rec = gate.m012_recommendation || {};
  const allowed = rec.allowed_actions || [];
  const blocked = rec.blocked_actions || [];
  const confirmations = rec.required_confirmations || [];
  if (allowed.length < 4) errors.push('expected at least 4 allowed action entries');
  if (blocked.length < 6) errors.push('expected at least 6 blocked action entries');
  if (confirmations.length < 3) errors.push('expected at least 3 required confirmation entries');

  const allowedIds = new Set(allowed.map((a) => a.id));
  const blockedIds = new Set(blocked.map((b) => b.id));
  const confirmationIds = new Set(confirmations.map((c) => c.id));
  for (const id of ['local.mission_frame_route_grant_qa', 'paperclip.readonly_health_probe', 'paperclip.native_mission_artifacts', 'git.local_feature_branch']) {
    if (!allowedIds.has(id)) errors.push(`missing allowed action ${id}`);
  }
  for (const id of ['plugin.host_registration', 'plugin.piko_tools', 'runtime.hermes_xiaomi_execution', 'runtime.gsdpi_execution', 'workflow.pr_merge_ci_live', 'direct.main_push_or_force_push']) {
    if (!blockedIds.has(id)) errors.push(`missing blocked action ${id}`);
  }
  for (const id of ['paperclip_mutation_yes', 'github_external_yes', 'secret_collection']) {
    if (!confirmationIds.has(id)) errors.push(`missing required confirmation ${id}`);
  }

  const paperclipLiveMutation = allowed.find((a) => a.id === 'paperclip.native_mission_artifacts');
  if (!paperclipLiveMutation || !String(paperclipLiveMutation.mode || '').includes('explicit-confirmation')) {
    errors.push('Paperclip live mutation must require explicit confirmation in mode');
  }
  if (!paperclipLiveMutation || !(paperclipLiveMutation.constraints || []).some((c) => /explicit user yes/i.test(c))) {
    errors.push('Paperclip live mutation constraints must mention explicit user yes');
  }
  const gitAction = allowed.find((a) => a.id === 'git.local_feature_branch');
  if (!gitAction || !(gitAction.constraints || []).some((c) => /No direct main\/master push/i.test(c))) {
    errors.push('Git allowed action must block direct main/master push');
  }

  const blockers = new Set(gate.current_blocker_codes || []);
  for (const code of ['missing_paperclip_auth', 'plugin_routes_not_found', 'tool_routes_not_found']) {
    if (!blockers.has(code)) errors.push(`expected current blocker missing: ${code}`);
  }

  if (errors.length) fail(errors);
  console.log(`validated ${path.relative(ROOT, GATE)}`);
  console.log(`allowed_actions ${allowed.length}`);
  console.log(`blocked_actions ${blocked.length}`);
  console.log(`required_confirmations ${confirmations.length}`);
  console.log(`current_blockers ${JSON.stringify(gate.current_blocker_codes)}`);
}

main();
