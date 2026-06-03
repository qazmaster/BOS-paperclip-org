import { describe, expect, it } from "vitest";
import { InMemoryBOSPersistence, mirrorGateResultToNativeArtifact, mirrorDecisionToNativeArtifact } from "../src/persistence";
import { InMemoryPaperclipAdapter } from "../src/paperclipAdapter";
import type { BPIScore, BosStatusOverlay, EvalGateResult, DecisionMetadata } from "../src/contracts";

const now = "2026-06-03T00:00:00.000Z";

describe("InMemoryBOSPersistence", () => {
  const bpi: BPIScore = {
    schema_version: "1.0",
    score: 0.85,
    formula: "bpi_v1.0",
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
    scored_by: "Div2.MasterPlanner",
    scored_at: now,
    source_issue_id: "BOS-100"
  };

  const status: BosStatusOverlay = {
    schema_version: "1.0",
    issue_id: "BOS-100",
    bos_status: "BLUEPRINT_READY",
    producer_division: "Div4.Production",
    blueprint_id: "bp_1",
    bpi_score: 0.85,
    updated_at: now
  };

  it("saves and retrieves BPI", async () => {
    const persistence = new InMemoryBOSPersistence();
    await persistence.saveBPI(bpi);
    const retrieved = await persistence.getBPI("BOS-100");

    expect(retrieved).toEqual(bpi);
  });

  it("returns null for unknown BPI", async () => {
    const persistence = new InMemoryBOSPersistence();
    expect(await persistence.getBPI("unknown")).toBeNull();
  });

  it("saves status", async () => {
    const persistence = new InMemoryBOSPersistence();
    await persistence.saveStatus(status);
    // No getter for status, but should not throw
  });

  it("saves and retrieves betting table", async () => {
    const persistence = new InMemoryBOSPersistence();
    const items = [{
      schema_version: "1.0" as const,
      cycle_id: "cycle_1",
      issue_id: "BOS-100",
      bpi_score: 0.85,
      blueprint_id: "bp_1",
      status: "CANDIDATE" as const,
      native_approval_request_id: null,
      native_approval_status: null,
      approved_by: null,
      created_at: now,
      updated_at: now
    }];

    await persistence.saveBettingTable("cycle_1", items);
    const retrieved = await persistence.getBettingTable("cycle_1");

    expect(retrieved).toEqual(items);
  });

  it("returns empty array for unknown betting table", async () => {
    const persistence = new InMemoryBOSPersistence();
    expect(await persistence.getBettingTable("unknown")).toEqual([]);
  });

  it("saves gate result", async () => {
    const persistence = new InMemoryBOSPersistence();
    const gateResult: EvalGateResult = {
      schema_version: "1.0",
      issue_id: "BOS-100",
      run_id: "run_1",
      gates: [],
      overall: "PASSED",
      blocking_failure_count: 0,
      warning_count: 0,
      not_run_count: 0,
      evaluated_at: now,
      evaluated_by: "Div5.QualificationsLibraryLearning"
    };

    await persistence.saveGateResult(gateResult);
  });

  it("saves and retrieves circuit breaker", async () => {
    const persistence = new InMemoryBOSPersistence();
    const record = {
      schema_version: "1.0" as const,
      issue_id: "BOS-100",
      state: "CLOSED" as const,
      attempt_count: 0,
      max_attempts: 3,
      half_open_threshold: 1,
      last_failure_at: null,
      last_failure_reason: null,
      opened_at: null,
      escalation_issue_id: null,
      updated_at: now
    };

    await persistence.saveCircuitBreaker(record);
    const retrieved = await persistence.getCircuitBreaker("BOS-100");
    expect(retrieved).toEqual(record);
  });

  it("saves decision", async () => {
    const persistence = new InMemoryBOSPersistence();
    const decision: DecisionMetadata = {
      schema_version: "1.0",
      accepted: true,
      decision_id: "dec_1",
      issue_id: "BOS-100",
      cynefin_domain: "CLEAR",
      confidence: 0.9,
      risk_tier: "LOW",
      record_detail: "compact",
      decision_type: "BATCH_APPROVAL",
      emitted_events: [],
      recommended_action: "Proceed to betting table",
      decided_by: "Div7.MissionControl",
      decided_at: now,
      diagnostics: {
        domain_evidence: [],
        selected_domain_reasons: [],
        risk_reasons: [],
        validation_errors: [],
        uncertainty_reasons: [],
        sanitized: true
      },
      record_markdown: "# Decision Record"
    };

    await persistence.saveDecision(decision);
  });
});

describe("mirrorGateResultToNativeArtifact", () => {
  it("mirrors gate result as comment", async () => {
    const adapter = new InMemoryPaperclipAdapter();
    const gateResult: EvalGateResult = {
      schema_version: "1.0",
      issue_id: "BOS-100",
      run_id: "run_1",
      gates: [
        {
          gate_id: "LARS.Deterministic",
          status: "PASSED",
          evidence: "Output present.",
          is_blocking: true
        },
        {
          gate_id: "LARS.SecurityPolicy",
          status: "FAILED",
          evidence: "Scope violation.",
          is_blocking: true
        }
      ],
      overall: "FAILED_BLOCKING",
      blocking_failure_count: 1,
      warning_count: 0,
      not_run_count: 0,
      evaluated_at: now,
      evaluated_by: "Div5.QualificationsLibraryLearning"
    };

    await mirrorGateResultToNativeArtifact(adapter, gateResult);

    expect(adapter.comments).toHaveLength(1);
    expect(adapter.comments[0].issueId).toBe("BOS-100");
    expect(adapter.comments[0].markdown).toContain("# BOS Eval Gate Result");
    expect(adapter.comments[0].markdown).toContain("Overall: FAILED_BLOCKING");
    expect(adapter.comments[0].markdown).toContain("LARS.Deterministic: PASSED");
    expect(adapter.comments[0].markdown).toContain("LARS.SecurityPolicy: FAILED");
  });
});

describe("mirrorDecisionToNativeArtifact", () => {
  it("mirrors decision as comment", async () => {
    const adapter = new InMemoryPaperclipAdapter();
    const decision: DecisionMetadata = {
      schema_version: "1.0",
      accepted: true,
      decision_id: "dec_1",
      issue_id: "BOS-100",
      cynefin_domain: "CLEAR",
      confidence: 0.9,
      risk_tier: "LOW",
      record_detail: "compact",
      decision_type: "BATCH_APPROVAL",
      emitted_events: [],
      recommended_action: "Proceed to betting table",
      decided_by: "Div7.MissionControl",
      decided_at: now,
      diagnostics: {
        domain_evidence: [],
        selected_domain_reasons: [],
        risk_reasons: [],
        validation_errors: [],
        uncertainty_reasons: [],
        sanitized: true
      },
      record_markdown: "# Decision Record"
    };

    await mirrorDecisionToNativeArtifact(adapter, decision);

    expect(adapter.comments).toHaveLength(1);
    expect(adapter.comments[0].issueId).toBe("BOS-100");
    expect(adapter.comments[0].markdown).toContain("# BOS Decision Record");
    expect(adapter.comments[0].markdown).toContain("Decision: dec_1");
    expect(adapter.comments[0].markdown).toContain("Domain: CLEAR");
    expect(adapter.comments[0].markdown).toContain("Confidence: 0.9");
  });
});
