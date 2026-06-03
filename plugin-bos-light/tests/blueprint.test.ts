import { describe, expect, it } from "vitest";
import { generateBlueprintMarkdown } from "../src/blueprint";

describe("generateBlueprintMarkdown", () => {
  const baseInput = {
    issue_id: "BOS-100",
    title: "Add user authentication",
    problem_statement: "Users cannot access protected resources",
    producer_division: "Div4.Production" as const,
    bpi: {
      schema_version: "1.0" as const,
      score: 0.85,
      formula: "bpi_v1.0" as const,
      components: {
        expected_value: 0.9,
        urgency: 0.7,
        estimated_token_cost: 50000,
        risk_factor: 1,
        company_token_budget_ref: 500000
      },
      hard_gates: {
        strategic_weight_passed: true,
        budget_snapshot_available: true,
        acceptance_inputs_present: true,
        policy_precheck_passed: true,
        security_precheck_passed: true
      },
      scored_by: "Div2.MasterPlanner" as const,
      scored_at: "2026-06-03T00:00:00.000Z",
      source_issue_id: "BOS-100"
    },
    acceptance_criteria: ["User can log in", "JWT is returned"],
    resources: ["PostgreSQL database", "Redis cache"]
  };

  it("generates markdown with all sections", () => {
    const md = generateBlueprintMarkdown(baseInput);

    expect(md).toContain("# Product Blueprint: Add user authentication");
    expect(md).toContain("## 1. Identity");
    expect(md).toContain("## 2. BPI");
    expect(md).toContain("## 3. Acceptance Contract");
    expect(md).toContain("## 4. Resources");
    expect(md).toContain("## 5. QA Policy");
  });

  it("includes issue identity fields", () => {
    const md = generateBlueprintMarkdown(baseInput);

    expect(md).toContain("Issue ID: BOS-100");
    expect(md).toContain("Producer division: Div4.Production");
    expect(md).toContain("Problem: Users cannot access protected resources");
  });

  it("includes BPI score and components", () => {
    const md = generateBlueprintMarkdown(baseInput);

    expect(md).toContain("Score: 0.850");
    expect(md).toContain("Formula: bpi_v1.0");
    expect(md).toContain("Expected value: 0.9");
    expect(md).toContain("Urgency: 0.7");
    expect(md).toContain("Estimated token cost: 50000");
    expect(md).toContain("Risk factor: 1");
  });

  it("formats acceptance criteria as list", () => {
    const md = generateBlueprintMarkdown(baseInput);

    expect(md).toContain("- User can log in");
    expect(md).toContain("- JWT is returned");
  });

  it("formats resources as list", () => {
    const md = generateBlueprintMarkdown(baseInput);

    expect(md).toContain("- PostgreSQL database");
    expect(md).toContain("- Redis cache");
  });

  it("uses default QA policy when none provided", () => {
    const md = generateBlueprintMarkdown(baseInput);

    expect(md).toContain("LARS.Deterministic must pass");
    expect(md).toContain("LARS.SecurityPolicy must pass");
    expect(md).toContain("LARS.ArtifactIntegrity must pass");
    expect(md).toContain("LARS.Budget warning must be reviewed if failed");
  });

  it("uses custom QA policy when provided", () => {
    const md = generateBlueprintMarkdown({
      ...baseInput,
      qa_policy: ["Custom check 1", "Custom check 2"]
    });

    expect(md).toContain("- Custom check 1");
    expect(md).toContain("- Custom check 2");
    expect(md).not.toContain("LARS.Deterministic");
  });

  it("handles empty acceptance criteria", () => {
    const md = generateBlueprintMarkdown({
      ...baseInput,
      acceptance_criteria: []
    });

    expect(md).toContain("TODO: define acceptance criteria before production");
  });

  it("handles empty resources", () => {
    const md = generateBlueprintMarkdown({
      ...baseInput,
      resources: []
    });

    expect(md).toContain("No special resources declared");
  });
});
