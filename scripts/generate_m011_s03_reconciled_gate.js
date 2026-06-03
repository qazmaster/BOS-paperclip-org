#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MATRIX = path.join(ROOT, 'runtime-evidence', 'M011-S01-capability-matrix.json');
const REPROBE = path.join(ROOT, 'runtime-evidence', 'M011-S02-paperclip-readonly-reprobe.json');
const OUT_JSON = path.join(ROOT, 'runtime-evidence', 'M011-S03-reconciled-capability-gate.json');
const OUT_MD = path.join(ROOT, 'runtime-evidence', 'M011-S03-reconciled-capability-gate.md');

function readJson(abs) {
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function byKey(rows) {
  return Object.fromEntries(rows.map((r) => [r.key, r]));
}

function main() {
  const matrix = readJson(MATRIX);
  const reprobe = readJson(REPROBE);
  const caps = byKey(matrix.capabilities || []);
  const confirmed = Object.values(caps).filter((c) => c.status === 'confirmed').map((c) => c.key);
  const localOnly = Object.values(caps).filter((c) => c.status === 'local-only').map((c) => c.key);
  const fallbackOnly = Object.values(caps).filter((c) => c.status === 'fallback-only').map((c) => c.key);

  const allowedActions = [
    {
      id: 'local.mission_frame_route_grant_qa',
      mode: 'local-only',
      action: 'Run BOS Light TypeScript mission framing, Div1 routing, Div3 grant policy, HITL artifact generation, branch policy, and QA review against local fixtures or generated artifacts.',
      evidence_basis: ['workflow.mission_intake', 'workflow.hitl_gates', 'workflow.branch_policy', 'workflow.qa_review'],
      constraints: ['No external mutation', 'No raw secret output', 'Generated artifacts must record blockers when auth is absent'],
    },
    {
      id: 'paperclip.readonly_health_probe',
      mode: 'live-read-only',
      action: 'Probe Paperclip health and supported GET routes for observation.',
      evidence_basis: ['M011-S02 health_ok=true'],
      constraints: ['GET only', 'No capability promotions from S02 alone', 'No secret persistence'],
    },
    {
      id: 'paperclip.native_mission_artifacts',
      mode: 'live-mutation-after-explicit-confirmation',
      action: 'Create a bounded Paperclip mission issue plus document/comment artifacts through native supported routes.',
      evidence_basis: ['mission.lifecycle', 'artifact.issue_document_comment_native', 'company.divisions_active'],
      constraints: ['Requires Paperclip auth present', 'Requires explicit user yes immediately before mutation', 'Must use canonical /BOS company id', 'Must write live evidence readback artifact', 'Must not use plugin host tools'],
    },
    {
      id: 'git.local_feature_branch',
      mode: 'local-or-explicit-confirmation-for-push',
      action: 'Use local git operations on feature/bos-{mission_id} branches; push only with explicit confirmation and branch policy evidence.',
      evidence_basis: ['git.local_hybrid_push', 'workflow.branch_policy'],
      constraints: ['No direct main/master push', 'No force push', 'External push requires explicit user confirmation'],
    },
  ];

  const blockedActions = [
    {
      id: 'plugin.host_registration',
      reason: 'S02 observed no supported plugin route readback and S01 keeps plugin.host_registration fallback-only.',
      until: 'Supported Paperclip host readback observes bos-light loaded plugin with version/build and no 404 blocker.',
    },
    {
      id: 'plugin.piko_tools',
      reason: 'S02 observed no piko tools and S01 keeps plugin.piko_tools fallback-only.',
      until: 'Tool registry readback observes piko:* tools and at least one invocation returns a supported result.',
    },
    {
      id: 'runtime.hermes_xiaomi_execution',
      reason: 'Hermes runtime execution remains fallback-only with adapter/testEnvironment/auth blockers.',
      until: 'Future runtime-execution-proof includes adapter registry readback, passing testEnvironment, exactly one bounded run, wakeCountDelta=1, and resultJson.bos.',
    },
    {
      id: 'runtime.gsdpi_execution',
      reason: 'gsdpi_local remains unregistered/execution-blocked; local package readiness is not runtime promotion.',
      until: 'Future runtime-execution-proof includes supported registry readback, passing testEnvironment, and BosAdapterResult payload.',
    },
    {
      id: 'workflow.pr_merge_ci_live',
      reason: 'Div6 PR/merge/CI gateway is implemented but live GitHub API path remains unexercised and requires GitHub token plus explicit external confirmation.',
      until: 'Dedicated milestone/slice with GitHub auth, explicit user yes, PR create/readback, CI trigger/watch, and QA approval evidence.',
    },
    {
      id: 'direct.main_push_or_force_push',
      reason: 'Branch policy explicitly blocks direct main/master and force-push paths.',
      until: 'Never for autonomous BOS Light flow; use feature branch plus PR/CI/human gate.',
    },
    {
      id: 'telegram.secret_delivery',
      reason: 'Telegram group is configured for external secret handoff; sending credentials is external disclosure.',
      until: 'Only with explicit user confirmation naming the destination and payload class; never print secret values.',
    },
  ];

  const requiredConfirmations = [
    {
      id: 'paperclip_mutation_yes',
      when: 'Before creating or editing any live Paperclip mission issue/document/comment in M012.',
      wording: 'User must explicitly confirm the live Paperclip mutation target and bounded test mission.',
    },
    {
      id: 'github_external_yes',
      when: 'Before any git push, GitHub PR, workflow trigger, merge, approval, or external API mutation.',
      wording: 'User must explicitly confirm the remote repo/branch/action immediately before the action.',
    },
    {
      id: 'secret_collection',
      when: 'If Paperclip/GitHub auth is needed and absent.',
      wording: 'Use secure_env_collect; never ask the user to paste secrets into chat or edit .env manually.',
    },
  ];

  const reconciliationNotes = [
    'S01 historical live proofs remain confirmed for their exact surfaces: company divisions, secret resolution, mission lifecycle, native artifact surfaces, and git local/hybrid push.',
    'S02 current reprobe is health-positive but auth-blocked for company/agents/issues; this is not a downgrade of prior proofs, but it blocks fresh authenticated readback until auth is restored.',
    'S02 plugin/tool routes remain unobserved, matching S01 fallback-only classification for plugin host and piko tools.',
    'Runtime execution surfaces remain fallback-only regardless of local tests or package readiness.',
  ];

  const gate = {
    schema_version: 'm011-s03-reconciled-capability-gate/v1',
    artifact_type: 'm012-execution-gate',
    phase: 'M011-S03',
    generated_at: new Date().toISOString(),
    inputs: {
      matrix_path: 'runtime-evidence/M011-S01-capability-matrix.json',
      reprobe_path: 'runtime-evidence/M011-S02-paperclip-readonly-reprobe.json',
    },
    safety: {
      plaintext_secrets_requested_or_logged: false,
      direct_db_mutation: false,
      external_mutations_in_this_slice: 0,
      m012_requires_explicit_confirmation_for_external_mutation: true,
    },
    current_observations: reprobe.observations,
    current_blocker_codes: reprobe.blocker_codes,
    capability_summary: {
      confirmed,
      local_only: localOnly,
      fallback_only: fallbackOnly,
      status_counts: matrix.status_counts,
    },
    reconciliation_notes: reconciliationNotes,
    m012_recommendation: {
      title: 'First Real Mission Through Native Paperclip Flow',
      posture: 'Use native Paperclip issue/document/comment mission artifacts after auth and explicit confirmation; do not rely on plugin host tools or runtime execution adapters.',
      allowed_actions: allowedActions,
      blocked_actions: blockedActions,
      required_confirmations: requiredConfirmations,
      proposed_flow: [
        'Collect/verify Paperclip auth via secure_env_collect if absent.',
        'Ask for explicit yes before live Paperclip mutation.',
        'Create one bounded mission issue in canonical /BOS company through supported native route.',
        'Run local Div7 mission framing, Div1 routing, Div3 grant policy, Div2 blueprint stub/artifact generation, Div4 local production task, and Div5 QA review as BOS Light code paths.',
        'Mirror each step to native Paperclip document/comment artifacts with readback.',
        'Stop before GitHub PR/merge/CI unless a later explicit external-action gate is approved.',
      ],
    },
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(gate, null, 2) + '\n');

  const lines = [];
  lines.push('# M011 S03 Reconciled Capability Gate');
  lines.push('');
  lines.push(`Generated: ${gate.generated_at}`);
  lines.push('');
  lines.push('## Current Status');
  lines.push('');
  lines.push(`- Confirmed: ${confirmed.join(', ')}`);
  lines.push(`- Local-only: ${localOnly.join(', ')}`);
  lines.push(`- Fallback-only: ${fallbackOnly.join(', ')}`);
  lines.push(`- Current S02 blockers: ${gate.current_blocker_codes.join(', ') || 'none'}`);
  lines.push('');
  lines.push('## Reconciliation Notes');
  lines.push('');
  for (const note of reconciliationNotes) lines.push(`- ${note}`);
  lines.push('');
  lines.push('## M012 Recommendation');
  lines.push('');
  lines.push(`**${gate.m012_recommendation.title}**`);
  lines.push('');
  lines.push(gate.m012_recommendation.posture);
  lines.push('');
  lines.push('### Allowed Actions');
  lines.push('');
  for (const a of allowedActions) lines.push(`- **${a.id}** (${a.mode}): ${a.action}`);
  lines.push('');
  lines.push('### Blocked Actions');
  lines.push('');
  for (const b of blockedActions) lines.push(`- **${b.id}**: ${b.reason}`);
  lines.push('');
  lines.push('### Required Confirmations');
  lines.push('');
  for (const c of requiredConfirmations) lines.push(`- **${c.id}**: ${c.when}`);
  fs.writeFileSync(OUT_MD, lines.join('\n') + '\n');

  console.log(`wrote ${path.relative(ROOT, OUT_JSON)}`);
  console.log(`wrote ${path.relative(ROOT, OUT_MD)}`);
  console.log(`allowed_actions ${allowedActions.length}`);
  console.log(`blocked_actions ${blockedActions.length}`);
  console.log(`required_confirmations ${requiredConfirmations.length}`);
}

main();
