import type { BPIScore } from "./contracts";

export interface BPIScoreInput {
  source_issue_id: string;
  expected_value: number;
  urgency: number;
  estimated_token_cost: number;
  risk_factor?: number;
  company_token_budget_ref: number;
  hard_gates: BPIScore["hard_gates"];
  now?: string;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function calculateBPIScore(input: BPIScoreInput): BPIScore {
  const expectedValue = clamp01(input.expected_value);
  const urgency = clamp01(input.urgency);
  const tokenBudgetRef = Math.max(1, input.company_token_budget_ref);
  const estimatedCost = Math.max(0, input.estimated_token_cost);
  const riskFactor = Math.max(0.01, input.risk_factor ?? 1.0);
  const normalizedCost = clamp01(estimatedCost / tokenBudgetRef);
  const rawScore = (expectedValue * urgency) / Math.max(0.01, normalizedCost * riskFactor);
  const hardGatePassed = Object.values(input.hard_gates).every(Boolean);
  const score = hardGatePassed ? clamp01(rawScore) : 0;

  return {
    schema_version: "1.0",
    score,
    formula: "bpi_v1.0",
    components: {
      expected_value: expectedValue,
      urgency,
      estimated_token_cost: estimatedCost,
      risk_factor: riskFactor,
      company_token_budget_ref: tokenBudgetRef
    },
    hard_gates: input.hard_gates,
    scored_by: "Div2.MasterPlanner",
    scored_at: input.now ?? new Date().toISOString(),
    source_issue_id: input.source_issue_id
  };
}
