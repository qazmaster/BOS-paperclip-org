import { describe, expect, it } from "vitest";
import { runEvalGates } from "../src/evalGates";

const now = "2026-06-03T00:00:00.000Z";

describe("runEvalGates", () => {
  it("returns PASSED when all gates pass", () => {
    const result = runEvalGates({
      issue_id: "issue_1",
      run_id: "run_1",
      blueprintMarkdown: "# Blueprint",
      outputMarkdown: "# Output",
      toolScopeRespected: true,
      budgetWarning: false,
      now
    });

    expect(result.overall).toBe("PASSED");
    expect(result.blocking_failure_count).toBe(0);
    expect(result.warning_count).toBe(0);
    expect(result.not_run_count).toBe(0);
    expect(result.gates).toHaveLength(4);
    expect(result.gates.every(g => g.status === "PASSED")).toBe(true);
    expect(result.evaluated_by).toBe("Div5.QualificationsLibraryLearning");
    expect(result.evaluated_at).toBe(now);
  });

  it("returns FAILED_BLOCKING when a blocking gate fails", () => {
    const result = runEvalGates({
      issue_id: "issue_2",
      toolScopeRespected: false, // SecurityPolicy fails
      outputMarkdown: "# Output",
      blueprintMarkdown: "# Blueprint",
      budgetWarning: false,
      now
    });

    expect(result.overall).toBe("FAILED_BLOCKING");
    expect(result.blocking_failure_count).toBe(1);
    const securityGate = result.gates.find(g => g.gate_id === "LARS.SecurityPolicy");
    expect(securityGate?.status).toBe("FAILED");
    expect(securityGate?.is_blocking).toBe(true);
  });

  it("returns PASSED_WITH_WARNINGS when only non-blocking gate fails", () => {
    const result = runEvalGates({
      issue_id: "issue_3",
      outputMarkdown: "# Output",
      blueprintMarkdown: "# Blueprint",
      toolScopeRespected: true,
      budgetWarning: true, // Budget gate fails (non-blocking)
      now
    });

    expect(result.overall).toBe("PASSED_WITH_WARNINGS");
    expect(result.blocking_failure_count).toBe(0);
    expect(result.warning_count).toBe(1);
    const budgetGate = result.gates.find(g => g.gate_id === "LARS.Budget");
    expect(budgetGate?.status).toBe("FAILED");
    expect(budgetGate?.is_blocking).toBe(false);
  });

  it("returns FAILED_BLOCKING when multiple blocking gates fail", () => {
    const result = runEvalGates({
      issue_id: "issue_4",
      outputMarkdown: undefined, // Deterministic fails
      toolScopeRespected: false, // SecurityPolicy fails
      blueprintMarkdown: "# Blueprint",
      budgetWarning: false,
      now
    });

    expect(result.overall).toBe("FAILED_BLOCKING");
    expect(result.blocking_failure_count).toBe(3); // Deterministic + SecurityPolicy + ArtifactIntegrity
  });

  it("returns FAILED_BLOCKING when ArtifactIntegrity fails (missing blueprint)", () => {
    const result = runEvalGates({
      issue_id: "issue_5",
      outputMarkdown: "# Output",
      blueprintMarkdown: undefined, // no blueprint
      toolScopeRespected: true,
      budgetWarning: false,
      now
    });

    expect(result.overall).toBe("FAILED_BLOCKING");
    const artifactGate = result.gates.find(g => g.gate_id === "LARS.ArtifactIntegrity");
    expect(artifactGate?.status).toBe("FAILED");
    expect(artifactGate?.evidence).toContain("Cannot verify");
  });

  it("sets run_id to null when not provided", () => {
    const result = runEvalGates({
      issue_id: "issue_6",
      outputMarkdown: "# Output",
      blueprintMarkdown: "# Blueprint",
      toolScopeRespected: true,
      budgetWarning: false,
      now
    });

    expect(result.run_id).toBeNull();
  });

  it("includes evidence text for each gate", () => {
    const result = runEvalGates({
      issue_id: "issue_7",
      outputMarkdown: "# Output",
      blueprintMarkdown: "# Blueprint",
      toolScopeRespected: true,
      budgetWarning: false,
      now
    });

    for (const gate of result.gates) {
      expect(gate.evidence).toBeTruthy();
      expect(typeof gate.evidence).toBe("string");
    }
  });
});
