import type { BPIScore } from "./contracts";
import type { BlueprintArtifactCapabilities } from "./blueprintArtifact";
import type { PaperclipAdapter, BOSPersistence } from "./paperclipAdapter";
import { InMemoryPaperclipAdapter } from "./paperclipAdapter";
import { InMemoryBOSPersistence } from "./persistence";
import { PAPERCLIP_RUNTIME_BOUNDARY_RULES } from "./runtimeCapabilities";
import {
  runSeededIssueBlueprintFlow,
  type SeededIssueBlueprintFlowResult,
  type SeededIssueFields
} from "./issueBlueprintFlow";
import { buildAndSaveBettingCycle, loadBettingCycle, requestBettingCycleApproval, type BettingCycleResult, type BettingApprovalRequestResult } from "./bettingTable";
import { evalGateEvidence, type EvalGateEvidenceEnvelope } from "./evalGateEvidence";
import { circuitBreakerFlow, type CircuitBreakerEvidenceEnvelope } from "./circuitBreakerFlow";

export interface A1ToA10FixtureSeedIssue {
  issue_id?: string;
  title?: string;
  problem_statement?: string;
  producer_division?: SeededIssueFields["producer_division"];
  acceptance_criteria?: string[];
  resources?: string[];
  qa_policy?: string[];
  expected_value?: number;
  urgency?: number;
  estimated_token_cost?: number;
  risk_factor?: number;
  company_token_budget_ref?: number;
  hard_gates?: BPIScore["hard_gates"];
}

export interface NormalizedA1ToA10FixtureIssue {
  issue: SeededIssueFields;
  bpi: {
    expected_value: number;
    urgency: number;
    estimated_token_cost: number;
    risk_factor: number;
    company_token_budget_ref: number;
    hard_gates: BPIScore["hard_gates"];
  };
}

export interface A1ToA10FixtureDemoInput {
  seedIssues?: A1ToA10FixtureSeedIssue[];
  cycle_id?: string;
  top_n?: number;
  now?: string;
  adapter?: PaperclipAdapter;
  persistence?: BOSPersistence;
  capabilities?: BlueprintArtifactCapabilities;
  approval_reason?: string;
  requested_by?: string;
}

export interface A1ToA10FixtureDemoValidationDiagnostics {
  phase: "seed_validation";
  errors: string[];
  received_count: number;
}

export class A1ToA10FixtureDemoValidationError extends Error {
  diagnostics: A1ToA10FixtureDemoValidationDiagnostics;

  constructor(diagnostics: A1ToA10FixtureDemoValidationDiagnostics) {
    super(`Invalid A1-A10 fixture seed rows: ${diagnostics.errors.join("; ")}`);
    this.name = "A1ToA10FixtureDemoValidationError";
    this.diagnostics = diagnostics;
  }
}

export interface A1ToA10RuntimeCapabilityPosture {
  source: "fixture-adapter";
  native_support_confirmed: false;
  surfaces: {
    documents_native: "fixture-exercised-unproven";
    comments_native: "fixture-exercised-unproven";
    approvals_native: "fixture-exercised-unproven";
    issues_native: "fixture-exercised-unproven";
    cache_overlay: "in-memory-not-durable";
  };
  boundary_rules: typeof PAPERCLIP_RUNTIME_BOUNDARY_RULES;
}

export interface A1ToA10RuntimeGapEntry {
  surface: string;
  posture: "fixture-only" | "fallback" | "cache-overlay-only";
  reason: string;
  artifact_ref: string | null;
}

export interface A1ToA10FixtureDemoReport {
  schema_version: "1.0";
  demo_id: string;
  generated_at: string;
  seed_issue_count: number;
  runtime_capability_posture: A1ToA10RuntimeCapabilityPosture;
  runtime_gap_ledger: A1ToA10RuntimeGapEntry[];
  A3: {
    phase: "Product Blueprint artifact flow";
    timestamp: string;
    issue_count: number;
    selected_surfaces: Record<string, SeededIssueBlueprintFlowResult["artifact"]["selected_surface"]>;
    artifact_refs: Record<string, string>;
    cache_overlay: Record<string, SeededIssueBlueprintFlowResult["status_overlay"]["cache_overlay"]>;
    fallback: Record<string, SeededIssueBlueprintFlowResult["artifact"]["fallback"]>;
    blueprints: SeededIssueBlueprintFlowResult[];
  };
  A4: {
    phase: "Betting Table cycle";
    timestamp: string;
    selected_surface: "cache-overlay" | "markdown-only";
    built: BettingCycleResult;
    loaded: BettingCycleResult;
    selected_issue_ids: string[];
    blueprint_ids: Record<string, string | null>;
    fallback: { reason: string | null };
  };
  A5: {
    phase: "Approval request";
    timestamp: string;
    selected_surface: BettingApprovalRequestResult["selected_surface"];
    artifact_ref: string;
    cache_overlay: BettingApprovalRequestResult["cache_overlay"];
    fallback: BettingApprovalRequestResult["fallback"];
    native_support_confirmed: false;
    approval: BettingApprovalRequestResult;
  };
  A6: {
    phase: "Eval Gate pass evidence";
    timestamp: string;
    selected_surface: EvalGateEvidenceEnvelope["selected_surface"];
    artifact_ref: string;
    cache_overlay: EvalGateEvidenceEnvelope["cache_overlay"];
    fallback: EvalGateEvidenceEnvelope["fallback"];
    evidence: EvalGateEvidenceEnvelope;
  };
  A7: {
    phase: "Eval Gate warning/failure visibility";
    timestamp: string;
    selected_surface: EvalGateEvidenceEnvelope["selected_surface"];
    artifact_ref: string;
    cache_overlay: EvalGateEvidenceEnvelope["cache_overlay"];
    fallback: EvalGateEvidenceEnvelope["fallback"];
    evidence: EvalGateEvidenceEnvelope;
  };
  A8: {
    phase: "Circuit Breaker open evidence";
    timestamp: string;
    selected_surface: CircuitBreakerEvidenceEnvelope["selected_surface"];
    artifact_ref: string;
    cache_overlay: CircuitBreakerEvidenceEnvelope["cache_overlay"];
    fallback: CircuitBreakerEvidenceEnvelope["fallback"];
    attempts: CircuitBreakerEvidenceEnvelope[];
    opened: CircuitBreakerEvidenceEnvelope;
  };
  A9: {
    phase: "Circuit Breaker half-open evidence";
    timestamp: string;
    selected_surface: CircuitBreakerEvidenceEnvelope["selected_surface"];
    artifact_ref: string;
    cache_overlay: CircuitBreakerEvidenceEnvelope["cache_overlay"];
    fallback: CircuitBreakerEvidenceEnvelope["fallback"];
    evidence: CircuitBreakerEvidenceEnvelope;
  };
  A10: {
    phase: "Circuit Breaker recovery evidence";
    timestamp: string;
    selected_surface: CircuitBreakerEvidenceEnvelope["selected_surface"];
    artifact_ref: string;
    cache_overlay: CircuitBreakerEvidenceEnvelope["cache_overlay"];
    fallback: CircuitBreakerEvidenceEnvelope["fallback"];
    evidence: CircuitBreakerEvidenceEnvelope;
  };
}

const DEFAULT_HARD_GATES: BPIScore["hard_gates"] = {
  strategic_weight_passed: true,
  budget_snapshot_available: true,
  acceptance_inputs_present: true,
  policy_precheck_passed: true,
  security_precheck_passed: true
};

export const DEFAULT_A1_TO_A10_FIXTURE_SEED_ISSUES: A1ToA10FixtureSeedIssue[] = [
  {
    title: "Create onboarding page for BOS Light demo",
    expected_value: 0.8,
    urgency: 0.7,
    estimated_token_cost: 12000,
    risk_factor: 1.1
  },
  {
    title: "Add traceable gate result comments",
    expected_value: 0.75,
    urgency: 0.8,
    estimated_token_cost: 9000,
    risk_factor: 1.0
  },
  {
    title: "Draft investor-style pitch deck widget copy",
    expected_value: 0.55,
    urgency: 0.4,
    estimated_token_cost: 6000,
    risk_factor: 1.0
  },
  {
    title: "Implement Circuit Breaker polling fallback",
    expected_value: 0.9,
    urgency: 0.9,
    estimated_token_cost: 20000,
    risk_factor: 1.3
  },
  {
    title: "Create company weekly review ritual",
    expected_value: 0.45,
    urgency: 0.3,
    estimated_token_cost: 3000,
    risk_factor: 0.8
  }
];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function addMinutes(base: string, minutes: number): string {
  const parsed = new Date(base);
  if (Number.isNaN(parsed.valueOf())) return new Date(Date.now() + minutes * 60_000).toISOString();
  return new Date(parsed.getTime() + minutes * 60_000).toISOString();
}

function validateHardGates(value: unknown, row: number, errors: string[]): BPIScore["hard_gates"] | null {
  if (value === undefined) return { ...DEFAULT_HARD_GATES };
  const gates = value as Partial<BPIScore["hard_gates"]>;
  const gateNames = Object.keys(DEFAULT_HARD_GATES) as Array<keyof BPIScore["hard_gates"]>;
  for (const gate of gateNames) {
    if (typeof gates[gate] !== "boolean") {
      errors.push(`row ${row}: hard_gates.${gate} must be boolean when hard_gates is provided`);
    }
  }
  return gateNames.every((gate) => typeof gates[gate] === "boolean") ? gates as BPIScore["hard_gates"] : null;
}

function normalizedStringList(value: unknown, fallback: string[], row: number, field: string, errors: string[]): string[] {
  if (value === undefined) return fallback;
  if (!Array.isArray(value)) {
    errors.push(`row ${row}: ${field} must be an array of non-empty strings`);
    return fallback;
  }
  const strings = value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean);
  if (strings.length !== value.length || strings.length === 0) {
    errors.push(`row ${row}: ${field} must contain only non-empty strings`);
  }
  return strings;
}

export function normalizeA1ToA10FixtureSeeds(seedIssues: A1ToA10FixtureSeedIssue[] = DEFAULT_A1_TO_A10_FIXTURE_SEED_ISSUES): NormalizedA1ToA10FixtureIssue[] {
  const errors: string[] = [];
  if (!Array.isArray(seedIssues) || seedIssues.length === 0) {
    throw new A1ToA10FixtureDemoValidationError({
      phase: "seed_validation",
      errors: ["at least one seed issue is required"],
      received_count: Array.isArray(seedIssues) ? seedIssues.length : 0
    });
  }

  const seenIssueIds = new Set<string>();
  const normalized = seedIssues.map((seed, index) => {
    const row = index + 1;
    const title = isNonEmptyString(seed.title) ? seed.title.trim() : "";
    if (!title) errors.push(`row ${row}: title is required`);

    const issueId = isNonEmptyString(seed.issue_id) ? seed.issue_id.trim() : `fixture_issue_${row}`;
    if (seenIssueIds.has(issueId)) errors.push(`row ${row}: duplicate issue_id ${issueId}`);
    seenIssueIds.add(issueId);

    if (!isFiniteNumber(seed.expected_value)) errors.push(`row ${row}: expected_value must be a finite number`);
    if (!isFiniteNumber(seed.urgency)) errors.push(`row ${row}: urgency must be a finite number`);
    if (!isFiniteNumber(seed.estimated_token_cost)) errors.push(`row ${row}: estimated_token_cost must be a finite number`);
    if (seed.risk_factor !== undefined && !isFiniteNumber(seed.risk_factor)) errors.push(`row ${row}: risk_factor must be a finite number when provided`);
    if (seed.company_token_budget_ref !== undefined && !isFiniteNumber(seed.company_token_budget_ref)) errors.push(`row ${row}: company_token_budget_ref must be a finite number when provided`);

    const hardGates = validateHardGates(seed.hard_gates, row, errors) ?? { ...DEFAULT_HARD_GATES };
    const acceptanceCriteria = normalizedStringList(
      seed.acceptance_criteria,
      [`${title || issueId} produces a visible Product Blueprint artifact`, "Fallback/runtime-gap diagnostics are preserved"],
      row,
      "acceptance_criteria",
      errors
    );
    const resources = normalizedStringList(
      seed.resources,
      ["In-memory BOS persistence", "Fixture Paperclip adapter", "Markdown fallback artifact"],
      row,
      "resources",
      errors
    );

    return {
      issue: {
        issue_id: issueId,
        title,
        problem_statement: isNonEmptyString(seed.problem_statement)
          ? seed.problem_statement.trim()
          : `Fixture candidate for integrated BOS Light demo: ${title || issueId}.`,
        producer_division: seed.producer_division ?? "Div4.Production",
        acceptance_criteria: acceptanceCriteria,
        resources,
        ...(seed.qa_policy ? { qa_policy: normalizedStringList(seed.qa_policy, [], row, "qa_policy", errors) } : {})
      },
      bpi: {
        expected_value: isFiniteNumber(seed.expected_value) ? seed.expected_value : 0,
        urgency: isFiniteNumber(seed.urgency) ? seed.urgency : 0,
        estimated_token_cost: isFiniteNumber(seed.estimated_token_cost) ? seed.estimated_token_cost : 0,
        risk_factor: isFiniteNumber(seed.risk_factor) ? seed.risk_factor : 1,
        company_token_budget_ref: isFiniteNumber(seed.company_token_budget_ref) ? seed.company_token_budget_ref : 100000,
        hard_gates: hardGates
      }
    };
  });

  if (errors.length) {
    throw new A1ToA10FixtureDemoValidationError({
      phase: "seed_validation",
      errors,
      received_count: seedIssues.length
    });
  }

  return normalized;
}

function buildRuntimePosture(): A1ToA10RuntimeCapabilityPosture {
  return {
    source: "fixture-adapter",
    native_support_confirmed: false,
    surfaces: {
      documents_native: "fixture-exercised-unproven",
      comments_native: "fixture-exercised-unproven",
      approvals_native: "fixture-exercised-unproven",
      issues_native: "fixture-exercised-unproven",
      cache_overlay: "in-memory-not-durable"
    },
    boundary_rules: PAPERCLIP_RUNTIME_BOUNDARY_RULES
  };
}

function cacheOverlayGapReason(cache: unknown): string | null {
  const overlay = cache as {
    persistence?: string;
    error?: string | null;
    get_error?: string | null;
    save_error?: string | null;
    load?: string;
    save?: string;
  };
  const errors = [overlay.error, overlay.get_error, overlay.save_error].filter((error): error is string => Boolean(error));
  if (errors.length) return errors.join("; ");
  if (overlay.persistence && overlay.persistence !== "provided") return `persistence:${overlay.persistence}`;
  if (overlay.load === "failed") return "cache load failed";
  if (overlay.save === "failed") return "cache save failed";
  return null;
}

function collectRuntimeGaps(input: {
  blueprintFlows: SeededIssueBlueprintFlowResult[];
  betting: BettingCycleResult;
  loadedBetting: BettingCycleResult;
  approval: BettingApprovalRequestResult;
  evalPass: EvalGateEvidenceEnvelope;
  evalFail: EvalGateEvidenceEnvelope;
  opened: CircuitBreakerEvidenceEnvelope;
  halfOpen: CircuitBreakerEvidenceEnvelope;
  recovered: CircuitBreakerEvidenceEnvelope;
}): A1ToA10RuntimeGapEntry[] {
  const gaps: A1ToA10RuntimeGapEntry[] = [
    {
      surface: "runtime.native_support",
      posture: "fixture-only",
      reason: "Integrated demo uses in-memory adapter seams; live Paperclip native support remains unconfirmed.",
      artifact_ref: null
    },
    {
      surface: "cache-overlay",
      posture: "cache-overlay-only",
      reason: "InMemoryBOSPersistence is inspectable test state, not durable Paperclip truth.",
      artifact_ref: null
    }
  ];

  for (const flow of input.blueprintFlows) {
    if (flow.artifact.fallback.reason) {
      gaps.push({
        surface: `A3.${flow.status_overlay.issue_id}.blueprint`,
        posture: "fallback",
        reason: flow.artifact.fallback.reason,
        artifact_ref: flow.artifact.artifact_ref
      });
    }
    if (flow.status_overlay.cache_overlay.error || flow.status_overlay.cache_overlay.persistence !== "provided") {
      gaps.push({
        surface: `A3.${flow.status_overlay.issue_id}.cache_overlay`,
        posture: "cache-overlay-only",
        reason: flow.status_overlay.cache_overlay.error ?? `persistence:${flow.status_overlay.cache_overlay.persistence}`,
        artifact_ref: flow.artifact.artifact_ref
      });
    }
  }

  for (const [surface, cache, artifactRef] of [
    ["A4.betting.save", input.betting.cache_overlay, null],
    ["A4.betting.load", input.loadedBetting.cache_overlay, null],
    ["A5.approval", input.approval.cache_overlay, input.approval.approval_request_ref],
    ["A6.eval_gate_pass", input.evalPass.cache_overlay, input.evalPass.artifact_ref],
    ["A7.eval_gate_failure", input.evalFail.cache_overlay, input.evalFail.artifact_ref],
    ["A8.circuit_open", input.opened.cache_overlay, input.opened.artifact_ref],
    ["A9.circuit_half_open", input.halfOpen.cache_overlay, input.halfOpen.artifact_ref],
    ["A10.circuit_recovered", input.recovered.cache_overlay, input.recovered.artifact_ref]
  ] as const) {
    const reason = cacheOverlayGapReason(cache);
    if (reason) {
      gaps.push({
        surface,
        posture: "cache-overlay-only",
        reason,
        artifact_ref: artifactRef
      });
    }
  }

  for (const [surface, fallback, artifactRef] of [
    ["A5.approval", input.approval.fallback, input.approval.approval_request_ref],
    ["A6.eval_gate_pass", input.evalPass.fallback, input.evalPass.artifact_ref],
    ["A7.eval_gate_failure", input.evalFail.fallback, input.evalFail.artifact_ref],
    ["A8.circuit_open", input.opened.fallback, input.opened.artifact_ref],
    ["A9.circuit_half_open", input.halfOpen.fallback, input.halfOpen.artifact_ref],
    ["A10.circuit_recovered", input.recovered.fallback, input.recovered.artifact_ref]
  ] as const) {
    if (fallback.reason) {
      gaps.push({
        surface,
        posture: "fallback",
        reason: fallback.reason,
        artifact_ref: artifactRef
      });
    }
  }

  return gaps;
}

export async function runA1ToA10FixtureDemo(input: A1ToA10FixtureDemoInput = {}): Promise<A1ToA10FixtureDemoReport> {
  const normalized = normalizeA1ToA10FixtureSeeds(input.seedIssues);
  const generatedAt = input.now ?? new Date().toISOString();
  const adapter = input.adapter ?? new InMemoryPaperclipAdapter();
  const persistence = input.persistence ?? new InMemoryBOSPersistence();
  const cycleId = input.cycle_id?.trim() || "fixture_cycle_a1_to_a10";
  const topN = Math.max(1, Math.floor(input.top_n ?? 3));
  const capabilities = input.capabilities ?? { documents_native: "enabled", comments_native: "enabled" };

  const blueprintFlows: SeededIssueBlueprintFlowResult[] = [];
  for (const [index, seed] of normalized.entries()) {
    blueprintFlows.push(await runSeededIssueBlueprintFlow({
      issue: seed.issue,
      bpi: seed.bpi,
      adapter,
      persistence,
      capabilities,
      now: addMinutes(generatedAt, index)
    }));
  }

  const bettingBuiltAt = addMinutes(generatedAt, normalized.length + 1);
  const betting = await buildAndSaveBettingCycle({
    cycle_id: cycleId,
    top_n: topN,
    now: bettingBuiltAt,
    persistence,
    candidates: blueprintFlows.map((flow) => ({
      issue_id: flow.status_overlay.issue_id,
      bpi_score: flow.bpi.score,
      blueprint_id: flow.status_overlay.blueprint_id
    }))
  });
  const bettingLoadedAt = addMinutes(generatedAt, normalized.length + 2);
  const loadedBetting = await loadBettingCycle({ cycle_id: cycleId, persistence, now: bettingLoadedAt });
  const approvalIssueIds = betting.selected_issue_ids;

  const approvalAt = addMinutes(generatedAt, normalized.length + 3);
  const approval = await requestBettingCycleApproval({
    cycle_id: cycleId,
    issue_ids: approvalIssueIds,
    reason: input.approval_reason ?? "Approve top fixture BPI candidates for the integrated A1-A10 baseline demo.",
    requested_by: input.requested_by ?? "Fixture.MasterPlanner",
    adapter,
    persistence,
    now: approvalAt
  });

  const evalTarget = blueprintFlows[0];
  const evalPassAt = addMinutes(generatedAt, normalized.length + 4);
  const evalPass = await evalGateEvidence({
    issue_id: evalTarget.status_overlay.issue_id,
    run_id: "fixture_eval_pass",
    blueprintMarkdown: evalTarget.blueprint_markdown,
    outputMarkdown: `# Fixture output\n\nAccepted blueprint ${evalTarget.status_overlay.blueprint_id ?? "missing-blueprint"}.`,
    toolScopeRespected: true,
    budgetWarning: false,
    adapter,
    persistence,
    now: evalPassAt
  });

  const evalFailAt = addMinutes(generatedAt, normalized.length + 5);
  const evalFail = await evalGateEvidence({
    issue_id: evalTarget.status_overlay.issue_id,
    run_id: "fixture_eval_failure_visibility",
    blueprintMarkdown: evalTarget.blueprint_markdown,
    outputMarkdown: "",
    toolScopeRespected: true,
    budgetWarning: true,
    adapter,
    persistence,
    now: evalFailAt
  });

  const circuitIssueId = approvalIssueIds[0] ?? evalTarget.status_overlay.issue_id;
  const circuitAttempts: CircuitBreakerEvidenceEnvelope[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    circuitAttempts.push(await circuitBreakerFlow({
      issue_id: circuitIssueId,
      run_id: `fixture_circuit_failure_${attempt + 1}`,
      observation: "failure",
      failure_reason: `fixture failure ${attempt + 1}`,
      adapter,
      persistence,
      now: addMinutes(generatedAt, normalized.length + 6 + attempt)
    }));
  }
  const opened = circuitAttempts[circuitAttempts.length - 1];

  const halfOpen = await circuitBreakerFlow({
    issue_id: circuitIssueId,
    run_id: "fixture_circuit_probe",
    observation: "half_open",
    adapter,
    persistence,
    now: addMinutes(generatedAt, normalized.length + 9)
  });
  const recovered = await circuitBreakerFlow({
    issue_id: circuitIssueId,
    run_id: "fixture_circuit_recovered",
    observation: "success",
    adapter,
    persistence,
    now: addMinutes(generatedAt, normalized.length + 10)
  });

  const blueprintIds = Object.fromEntries(betting.items.map((item) => [item.issue_id, item.blueprint_id]));
  const reportWithoutGaps = {
    schema_version: "1.0" as const,
    demo_id: `a1-a10-fixture:${cycleId}`,
    generated_at: generatedAt,
    seed_issue_count: normalized.length,
    runtime_capability_posture: buildRuntimePosture(),
    A3: {
      phase: "Product Blueprint artifact flow" as const,
      timestamp: generatedAt,
      issue_count: blueprintFlows.length,
      selected_surfaces: Object.fromEntries(blueprintFlows.map((flow) => [flow.status_overlay.issue_id, flow.artifact.selected_surface])),
      artifact_refs: Object.fromEntries(blueprintFlows.map((flow) => [flow.status_overlay.issue_id, flow.artifact.artifact_ref])),
      cache_overlay: Object.fromEntries(blueprintFlows.map((flow) => [flow.status_overlay.issue_id, flow.status_overlay.cache_overlay])),
      fallback: Object.fromEntries(blueprintFlows.map((flow) => [flow.status_overlay.issue_id, flow.artifact.fallback])),
      blueprints: blueprintFlows
    },
    A4: {
      phase: "Betting Table cycle" as const,
      timestamp: bettingBuiltAt,
      selected_surface: "cache-overlay" as const,
      built: betting,
      loaded: loadedBetting,
      selected_issue_ids: betting.selected_issue_ids,
      blueprint_ids: blueprintIds,
      fallback: { reason: betting.cache_overlay.save === "failed" || loadedBetting.cache_overlay.load === "failed" ? "cache_overlay_failed" : null }
    },
    A5: {
      phase: "Approval request" as const,
      timestamp: approvalAt,
      selected_surface: approval.selected_surface,
      artifact_ref: approval.approval_request_ref,
      cache_overlay: approval.cache_overlay,
      fallback: approval.fallback,
      native_support_confirmed: false as const,
      approval
    },
    A6: {
      phase: "Eval Gate pass evidence" as const,
      timestamp: evalPassAt,
      selected_surface: evalPass.selected_surface,
      artifact_ref: evalPass.artifact_ref,
      cache_overlay: evalPass.cache_overlay,
      fallback: evalPass.fallback,
      evidence: evalPass
    },
    A7: {
      phase: "Eval Gate warning/failure visibility" as const,
      timestamp: evalFailAt,
      selected_surface: evalFail.selected_surface,
      artifact_ref: evalFail.artifact_ref,
      cache_overlay: evalFail.cache_overlay,
      fallback: evalFail.fallback,
      evidence: evalFail
    },
    A8: {
      phase: "Circuit Breaker open evidence" as const,
      timestamp: opened.observed_at,
      selected_surface: opened.selected_surface,
      artifact_ref: opened.artifact_ref,
      cache_overlay: opened.cache_overlay,
      fallback: opened.fallback,
      attempts: circuitAttempts,
      opened
    },
    A9: {
      phase: "Circuit Breaker half-open evidence" as const,
      timestamp: halfOpen.observed_at,
      selected_surface: halfOpen.selected_surface,
      artifact_ref: halfOpen.artifact_ref,
      cache_overlay: halfOpen.cache_overlay,
      fallback: halfOpen.fallback,
      evidence: halfOpen
    },
    A10: {
      phase: "Circuit Breaker recovery evidence" as const,
      timestamp: recovered.observed_at,
      selected_surface: recovered.selected_surface,
      artifact_ref: recovered.artifact_ref,
      cache_overlay: recovered.cache_overlay,
      fallback: recovered.fallback,
      evidence: recovered
    }
  };

  return {
    ...reportWithoutGaps,
    runtime_gap_ledger: collectRuntimeGaps({
      blueprintFlows,
      betting,
      loadedBetting,
      approval,
      evalPass,
      evalFail,
      opened,
      halfOpen,
      recovered
    })
  };
}
