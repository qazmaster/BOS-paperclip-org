import type { EvalGateResult } from "./contracts";

export interface EvalGateInput {
  issue_id: string;
  run_id?: string | null;
  blueprintMarkdown?: string | null;
  outputMarkdown?: string | null;
  toolScopeRespected: boolean;
  budgetWarning: boolean;
  now?: string;
}

export function runEvalGates(input: EvalGateInput): EvalGateResult {
  const hasBlueprint = Boolean(input.blueprintMarkdown?.trim());
  const hasOutput = Boolean(input.outputMarkdown?.trim());
  const artifactMatches = hasBlueprint && hasOutput;

  const gates: EvalGateResult["gates"] = [
    {
      gate_id: "LARS.Deterministic",
      status: hasOutput ? "PASSED" : "FAILED",
      evidence: hasOutput ? "Output present." : "Missing output.",
      is_blocking: true
    },
    {
      gate_id: "LARS.SecurityPolicy",
      status: input.toolScopeRespected ? "PASSED" : "FAILED",
      evidence: input.toolScopeRespected ? "Tool scope respected." : "Tool scope violation or unknown direct mutation.",
      is_blocking: true
    },
    {
      gate_id: "LARS.ArtifactIntegrity",
      status: artifactMatches ? "PASSED" : "FAILED",
      evidence: artifactMatches ? "Blueprint and output are both present." : "Cannot verify output against blueprint.",
      is_blocking: true
    },
    {
      gate_id: "LARS.Budget",
      status: input.budgetWarning ? "FAILED" : "PASSED",
      evidence: input.budgetWarning ? "Budget warning threshold reached." : "No budget warning.",
      is_blocking: false
    }
  ];

  const blockingFailureCount = gates.filter((gate) => gate.is_blocking && gate.status === "FAILED").length;
  const warningCount = gates.filter((gate) => !gate.is_blocking && gate.status === "FAILED").length;
  const notRunCount = gates.filter((gate) => gate.status === "NOT_RUN").length;
  const overall: EvalGateResult["overall"] = notRunCount > 0
    ? "INCOMPLETE"
    : blockingFailureCount > 0
      ? "FAILED_BLOCKING"
      : warningCount > 0
        ? "PASSED_WITH_WARNINGS"
        : "PASSED";

  return {
    schema_version: "1.0",
    issue_id: input.issue_id,
    run_id: input.run_id ?? null,
    gates,
    overall,
    blocking_failure_count: blockingFailureCount,
    warning_count: warningCount,
    not_run_count: notRunCount,
    evaluated_at: input.now ?? new Date().toISOString(),
    evaluated_by: "Div5.Qualifications"
  };
}
