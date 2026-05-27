import { describe, expect, it } from "vitest";
import { calculateBPIScore } from "../src/bpi";

describe("BPI", () => {
  it("calculates deterministic bpi_v1.0 score", () => {
    const score = calculateBPIScore({
      source_issue_id: "issue_1",
      expected_value: 0.8,
      urgency: 0.5,
      estimated_token_cost: 10000,
      risk_factor: 1,
      company_token_budget_ref: 100000,
      hard_gates: {
        strategic_weight_passed: true,
        budget_snapshot_available: true,
        acceptance_inputs_present: true,
        policy_precheck_passed: true,
        security_precheck_passed: true
      },
      now: "2026-05-27T00:00:00.000Z"
    });
    expect(score.score).toBe(1);
    expect(score.formula).toBe("bpi_v1.0");
  });

  it("returns zero if a hard gate fails", () => {
    const score = calculateBPIScore({
      source_issue_id: "issue_2",
      expected_value: 1,
      urgency: 1,
      estimated_token_cost: 1,
      risk_factor: 1,
      company_token_budget_ref: 100000,
      hard_gates: {
        strategic_weight_passed: true,
        budget_snapshot_available: false,
        acceptance_inputs_present: true,
        policy_precheck_passed: true,
        security_precheck_passed: true
      }
    });
    expect(score.score).toBe(0);
  });
});
