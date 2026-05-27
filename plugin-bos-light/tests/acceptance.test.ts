import { describe, expect, it } from "vitest";
import { calculateBPIScore } from "../src/bpi";
import { generateBlueprintMarkdown } from "../src/blueprint";
import { buildBettingTable, markApprovalRequested } from "../src/bettingTable";
import { runEvalGates } from "../src/evalGates";

describe("BOS Light acceptance vertical slice", () => {
  it("A2-A5 pure logic path works", () => {
    const bpi = calculateBPIScore({
      source_issue_id: "issue_1",
      expected_value: 0.7,
      urgency: 0.8,
      estimated_token_cost: 10000,
      risk_factor: 1.2,
      company_token_budget_ref: 100000,
      hard_gates: {
        strategic_weight_passed: true,
        budget_snapshot_available: true,
        acceptance_inputs_present: true,
        policy_precheck_passed: true,
        security_precheck_passed: true
      }
    });

    const blueprint = generateBlueprintMarkdown({
      issue_id: "issue_1",
      title: "Build BOS Light demo",
      problem_statement: "Need a visible vertical slice.",
      producer_division: "Div3.Production",
      bpi,
      acceptance_criteria: ["Demo script passes"],
      resources: ["Paperclip local instance"]
    });

    const table = buildBettingTable({
      cycle_id: "cycle_test",
      top_n: 3,
      candidates: [{ issue_id: "issue_1", bpi_score: bpi.score, blueprint_id: "doc_1" }]
    });

    const requested = markApprovalRequested(table[0], "approval_1", "Master.Human");

    expect(bpi.score).toBeGreaterThan(0);
    expect(blueprint).toContain("## 3. Acceptance Contract");
    expect(table).toHaveLength(1);
    expect(requested.status).toBe("APPROVAL_REQUESTED");
  });

  it("A6/A7 gate states are distinguishable", () => {
    const pass = runEvalGates({
      issue_id: "issue_1",
      blueprintMarkdown: "blueprint",
      outputMarkdown: "output",
      toolScopeRespected: true,
      budgetWarning: false
    });
    const fail = runEvalGates({
      issue_id: "issue_2",
      blueprintMarkdown: "blueprint",
      outputMarkdown: "",
      toolScopeRespected: true,
      budgetWarning: false
    });
    expect(pass.overall).toBe("PASSED");
    expect(fail.overall).toBe("FAILED_BLOCKING");
  });
});
