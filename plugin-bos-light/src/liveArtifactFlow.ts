import type { BlueprintArtifactCapabilities } from "./blueprintArtifact";
import { buildAndSaveBettingCycle, requestBettingCycleApproval, type BettingApprovalRequestResult, type BettingCycleResult } from "./bettingTable";
import { circuitBreakerFlow, type CircuitBreakerEvidenceEnvelope, type CircuitBreakerObservationKind } from "./circuitBreakerFlow";
import type { BOSPersistence, PaperclipAdapter } from "./paperclipAdapter";
import { InMemoryBOSPersistence } from "./persistence";
import { evalGateEvidence, type EvalGateEvidenceEnvelope } from "./evalGateEvidence";
import {
  runSeededIssueBlueprintFlow,
  type SeededIssueBPIInput,
  type SeededIssueBlueprintFlowResult,
  type SeededIssueFields
} from "./issueBlueprintFlow";
import { PAPERCLIP_RUNTIME_BOUNDARY_RULES } from "./runtimeCapabilities";
import { redactSensitiveText, type LivePaperclipAdapterDiagnostic, type LivePaperclipSideEffectCounts } from "./livePaperclipAdapter";

export type ExecutionGuardStatus = "blocked" | "unvalidated" | "unavailable" | "available";

export interface ExecutionNoGoGuardInput {
  status: ExecutionGuardStatus;
  reason: string;
  execution_allowed?: boolean;
  evidence_ref?: string | null;
}

export interface ExecutionNoGoGuardState extends Required<Omit<ExecutionNoGoGuardInput, "evidence_ref">> {
  system: "S02.Hermes" | "S03.GSD-Pi";
  no_go: boolean;
  evidence_ref: string | null;
}

export interface LiveArtifactRuntimeContext {
  version?: string | null;
  build?: string | null;
}

export interface LiveArtifactFlowInput {
  issue: SeededIssueFields;
  bpi: SeededIssueBPIInput;
  adapter: PaperclipAdapter;
  persistence?: BOSPersistence | null;
  capabilities?: BlueprintArtifactCapabilities;
  cycle_id?: string;
  run_id?: string | null;
  top_n?: number;
  approval_reason?: string;
  requested_by?: string;
  eval?: {
    toolScopeRespected?: boolean;
    budgetWarning?: boolean;
    outputMarkdown?: string;
  };
  circuit_breaker?: {
    observation?: CircuitBreakerObservationKind;
    failure_reason?: string | null;
  };
  no_go_guards: {
    hermes: ExecutionNoGoGuardInput;
    gsd_pi: ExecutionNoGoGuardInput;
  };
  runtime?: LiveArtifactRuntimeContext;
  now?: string;
}

export interface LiveArtifactFlowSelectedSurfaces {
  blueprint: SeededIssueBlueprintFlowResult["artifact"]["selected_surface"];
  betting_approval: BettingApprovalRequestResult["selected_surface"];
  eval_gate: EvalGateEvidenceEnvelope["selected_surface"];
  circuit_breaker: CircuitBreakerEvidenceEnvelope["selected_surface"];
}

export interface LiveArtifactFlowArtifactRefs {
  bpi: string;
  blueprint: string;
  betting_cycle: string;
  betting_approval: string;
  eval_gate: string;
  circuit_breaker: string;
}

export interface LiveArtifactFlowBundle {
  schema_version: "1.0";
  phase: "S04.live_artifact_flow";
  generated_at: string;
  runtime: {
    version: string | null;
    build: string | null;
  };
  company_issue_context: {
    issue_id: string;
    title: string;
    producer_division: SeededIssueFields["producer_division"];
  };
  selected_surfaces: LiveArtifactFlowSelectedSurfaces;
  artifact_refs: LiveArtifactFlowArtifactRefs;
  side_effect_counts: LivePaperclipSideEffectCounts;
  no_go_guards: {
    hermes: ExecutionNoGoGuardState;
    gsd_pi: ExecutionNoGoGuardState;
  };
  adapter_diagnostics: LivePaperclipAdapterDiagnostic[];
  boundary_rules: typeof PAPERCLIP_RUNTIME_BOUNDARY_RULES;
  invariants: {
    no_core_patch: true;
    no_direct_db_access: true;
    no_secret_diagnostics: true;
    cache_overlay_diagnostic_only: true;
    hermes_execution_attempted: false;
    gsd_pi_execution_attempted: false;
  };
}

export interface LiveArtifactFlowResult {
  bundle: LiveArtifactFlowBundle;
  bpi: SeededIssueBlueprintFlowResult["bpi"];
  blueprint: SeededIssueBlueprintFlowResult;
  betting_cycle: BettingCycleResult;
  betting_approval: BettingApprovalRequestResult;
  eval_gate: EvalGateEvidenceEnvelope;
  circuit_breaker: CircuitBreakerEvidenceEnvelope;
}

interface DiagnosticsProvider {
  getDiagnostics?: () => LivePaperclipAdapterDiagnostic[];
  getSideEffectCounts?: () => LivePaperclipSideEffectCounts;
}

const ZERO_SIDE_EFFECT_COUNTS: LivePaperclipSideEffectCounts = {
  documents_created: 0,
  comments_created: 0,
  escalation_issues_created: 0,
  approval_requests_created: 0,
  activity_logs_written: 0
};

function normalizeGuard(system: ExecutionNoGoGuardState["system"], guard: ExecutionNoGoGuardInput): ExecutionNoGoGuardState {
  const explicitlyAllowed = guard.execution_allowed === true && guard.status === "available";
  return {
    system,
    status: guard.status,
    reason: redactSensitiveText(guard.reason || `${system}:no-go`),
    execution_allowed: explicitlyAllowed,
    no_go: !explicitlyAllowed,
    evidence_ref: guard.evidence_ref ?? null
  };
}

function adapterDiagnostics(adapter: PaperclipAdapter): LivePaperclipAdapterDiagnostic[] {
  const provider = adapter as PaperclipAdapter & DiagnosticsProvider;
  if (typeof provider.getDiagnostics !== "function") return [];
  return provider.getDiagnostics().map((diagnostic) => ({
    ...diagnostic,
    bounded_response_text: diagnostic.bounded_response_text ? redactSensitiveText(diagnostic.bounded_response_text) : null,
    malformed_json_reason: diagnostic.malformed_json_reason ? redactSensitiveText(diagnostic.malformed_json_reason) : null,
    message: redactSensitiveText(diagnostic.message)
  }));
}

function sideEffectCounts(adapter: PaperclipAdapter): LivePaperclipSideEffectCounts {
  const provider = adapter as PaperclipAdapter & DiagnosticsProvider;
  if (typeof provider.getSideEffectCounts !== "function") return { ...ZERO_SIDE_EFFECT_COUNTS };
  return { ...ZERO_SIDE_EFFECT_COUNTS, ...provider.getSideEffectCounts() };
}

function buildEvalOutputMarkdown(input: {
  provided?: string;
  blueprintMarkdown: string;
  bettingCycle: BettingCycleResult;
  bettingApproval: BettingApprovalRequestResult;
}): string {
  if (input.provided !== undefined) return input.provided;
  const rows = input.bettingCycle.items.map((item) => `- ${item.issue_id}: ${item.status} (${item.bpi_score}) blueprint=${item.blueprint_id ?? "none"}`);
  return [
    input.blueprintMarkdown,
    "",
    "# BOS Betting Table Evidence",
    "",
    `- Cycle: ${input.bettingCycle.cycle_id}`,
    `- Approval surface: ${input.bettingApproval.selected_surface}`,
    `- Approval ref: ${input.bettingApproval.approval_request_ref}`,
    ...rows
  ].join("\n");
}

export async function runLiveArtifactFlow(input: LiveArtifactFlowInput): Promise<LiveArtifactFlowResult> {
  const timestamp = input.now ?? new Date().toISOString();
  const cycleId = input.cycle_id ?? `cycle-${input.issue.issue_id}`;
  const runId = input.run_id ?? `run-${input.issue.issue_id}`;
  const persistence = input.persistence ?? new InMemoryBOSPersistence();
  const capabilities = input.capabilities ?? { documents_native: "enabled", comments_native: "unvalidated" };
  const hermesGuard = normalizeGuard("S02.Hermes", input.no_go_guards.hermes);
  const gsdPiGuard = normalizeGuard("S03.GSD-Pi", input.no_go_guards.gsd_pi);

  const blueprint = await runSeededIssueBlueprintFlow({
    issue: input.issue,
    bpi: input.bpi,
    adapter: input.adapter,
    persistence,
    capabilities,
    now: timestamp
  });

  const bettingCycle = await buildAndSaveBettingCycle({
    cycle_id: cycleId,
    candidates: [{
      issue_id: input.issue.issue_id,
      bpi_score: blueprint.bpi.score,
      blueprint_id: blueprint.status_overlay.blueprint_id
    }],
    top_n: input.top_n ?? 1,
    persistence,
    now: timestamp
  });

  const bettingApproval = await requestBettingCycleApproval({
    cycle_id: cycleId,
    issue_ids: bettingCycle.selected_issue_ids,
    reason: input.approval_reason ?? "BOS Light S04 visible artifact flow review request. Native approval remains no-go unless separately validated.",
    adapter: input.adapter,
    persistence,
    requested_by: input.requested_by ?? "BOS.Light.S04",
    now: timestamp
  });

  const evalGate = await evalGateEvidence({
    issue_id: input.issue.issue_id,
    run_id: runId,
    blueprintMarkdown: blueprint.blueprint_markdown,
    outputMarkdown: buildEvalOutputMarkdown({
      provided: input.eval?.outputMarkdown,
      blueprintMarkdown: blueprint.blueprint_markdown,
      bettingCycle,
      bettingApproval
    }),
    toolScopeRespected: input.eval?.toolScopeRespected ?? true,
    budgetWarning: input.eval?.budgetWarning ?? false,
    adapter: input.adapter,
    persistence,
    now: timestamp
  });

  const circuitBreaker = await circuitBreakerFlow({
    issue_id: input.issue.issue_id,
    run_id: runId,
    observation: input.circuit_breaker?.observation ?? "failure",
    failure_reason: input.circuit_breaker?.failure_reason ?? "S04 bounded artifact-flow probe diagnostic; execution adapters remain no-go.",
    adapter: input.adapter,
    persistence,
    now: timestamp
  });

  const bundle: LiveArtifactFlowBundle = {
    schema_version: "1.0",
    phase: "S04.live_artifact_flow",
    generated_at: timestamp,
    runtime: {
      version: input.runtime?.version ?? null,
      build: input.runtime?.build ?? null
    },
    company_issue_context: {
      issue_id: input.issue.issue_id,
      title: input.issue.title,
      producer_division: input.issue.producer_division
    },
    selected_surfaces: {
      blueprint: blueprint.artifact.selected_surface,
      betting_approval: bettingApproval.selected_surface,
      eval_gate: evalGate.selected_surface,
      circuit_breaker: circuitBreaker.selected_surface
    },
    artifact_refs: {
      bpi: `cache-overlay://issues/${input.issue.issue_id}/bpi`,
      blueprint: blueprint.artifact.artifact_ref,
      betting_cycle: `cache-overlay://betting-cycles/${cycleId}`,
      betting_approval: bettingApproval.approval_request_ref,
      eval_gate: evalGate.artifact_ref,
      circuit_breaker: circuitBreaker.artifact_ref
    },
    side_effect_counts: sideEffectCounts(input.adapter),
    no_go_guards: {
      hermes: hermesGuard,
      gsd_pi: gsdPiGuard
    },
    adapter_diagnostics: adapterDiagnostics(input.adapter),
    boundary_rules: PAPERCLIP_RUNTIME_BOUNDARY_RULES,
    invariants: {
      no_core_patch: true,
      no_direct_db_access: true,
      no_secret_diagnostics: true,
      cache_overlay_diagnostic_only: true,
      hermes_execution_attempted: false,
      gsd_pi_execution_attempted: false
    }
  };

  return {
    bundle,
    bpi: blueprint.bpi,
    blueprint,
    betting_cycle: bettingCycle,
    betting_approval: bettingApproval,
    eval_gate: evalGate,
    circuit_breaker: circuitBreaker
  };
}
