import { describe, expect, it } from "vitest";
import { calculateBPIScore } from "../src/bpi";
import { generateBlueprintMarkdown } from "../src/blueprint";
import { buildAndSaveBettingCycle, buildBettingTable, loadBettingCycle, markApprovalRequested, saveBettingCycle } from "../src/bettingTable";
import { runEvalGates } from "../src/evalGates";
import { runSeededIssueBlueprintFlow } from "../src/issueBlueprintFlow";
import { InMemoryPaperclipAdapter } from "../src/paperclipAdapter";
import { InMemoryBOSPersistence } from "../src/persistence";
import { registerBosLightPlugin } from "../src/worker";

const allHardGatesPass = {
  strategic_weight_passed: true,
  budget_snapshot_available: true,
  acceptance_inputs_present: true,
  policy_precheck_passed: true,
  security_precheck_passed: true
};

describe("BOS Light acceptance vertical slice", () => {
  it("A2-A5 pure logic path works", () => {
    const bpi = calculateBPIScore({
      source_issue_id: "issue_1",
      expected_value: 0.7,
      urgency: 0.8,
      estimated_token_cost: 10000,
      risk_factor: 1.2,
      company_token_budget_ref: 100000,
      hard_gates: allHardGatesPass
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

  it("A2/A3 seeded issue flow mirrors a Blueprint and passes the artifact reference into the Betting Table", async () => {
    const adapter = new InMemoryPaperclipAdapter();
    const persistence = new InMemoryBOSPersistence();

    const flow = await runSeededIssueBlueprintFlow({
      issue: {
        issue_id: "issue_seeded",
        title: "Seed BOS Light candidate",
        problem_statement: "Need the seeded issue to produce an inspectable Product Blueprint.",
        producer_division: "Div3.Production",
        acceptance_criteria: ["Fixture issue receives a five-section Product Blueprint"],
        resources: ["In-memory Paperclip adapter", "In-memory cache overlay"]
      },
      bpi: {
        expected_value: 0.8,
        urgency: 0.9,
        estimated_token_cost: 12000,
        risk_factor: 1.1,
        company_token_budget_ref: 100000,
        hard_gates: allHardGatesPass
      },
      adapter,
      persistence,
      capabilities: { documents_native: "enabled", comments_native: "unvalidated" },
      now: "2026-01-01T00:00:00.000Z"
    });

    const table = buildBettingTable({
      cycle_id: "cycle_seeded",
      top_n: 3,
      candidates: [{
        issue_id: "issue_seeded",
        bpi_score: flow.bpi.score,
        blueprint_id: flow.status_overlay.blueprint_id
      }],
      now: "2026-01-01T00:00:00.000Z"
    });

    expect(flow.bpi.score).toBeGreaterThan(0);
    expect(flow.blueprint_markdown).toContain("## 5. QA Policy");
    expect(flow.artifact.selected_surface).toBe("documents.native");
    expect(flow.artifact.artifact_ref).toBe("paperclip://issues/issue_seeded/documents/doc_1");
    expect(flow.status_overlay.blueprint_id).toBe(flow.artifact.artifact_ref);
    expect(flow.status_overlay.cache_overlay).toMatchObject({
      durability: "cache-overlay-only",
      persistence: "provided",
      bpi: "saved",
      status: "saved",
      error: null
    });
    expect(persistence.bpi.get("issue_seeded")?.score).toBe(flow.bpi.score);
    expect(persistence.status.get("issue_seeded")?.blueprint_id).toBe(flow.artifact.artifact_ref);
    expect(adapter.documents).toHaveLength(1);
    expect(table[0].blueprint_id).toBe(flow.artifact.artifact_ref);
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

describe("betting cycle persistence orchestration", () => {
  const now = "2026-01-01T00:00:00.000Z";

  it("ranks top candidates by BPI, enforces minimum top-N, and excludes non-positive BPI", async () => {
    const cycle = await buildAndSaveBettingCycle({
      cycle_id: "cycle_ranked",
      top_n: 0,
      now,
      candidates: [
        { issue_id: "issue_zero", bpi_score: 0, blueprint_id: "doc_zero" },
        { issue_id: "issue_low", bpi_score: 2, blueprint_id: "doc_low" },
        { issue_id: "issue_negative", bpi_score: -5, blueprint_id: "doc_negative" },
        { issue_id: "issue_high", bpi_score: 9, blueprint_id: "doc_high" }
      ]
    });

    expect(cycle.items).toHaveLength(1);
    expect(cycle.selected_issue_ids).toEqual(["issue_high"]);
    expect(cycle.items[0]).toMatchObject({
      cycle_id: "cycle_ranked",
      issue_id: "issue_high",
      bpi_score: 9,
      blueprint_id: "doc_high",
      status: "CANDIDATE"
    });
    expect(cycle.cache_overlay).toMatchObject({
      durability: "cache-overlay-only",
      persistence: "missing",
      save: "not_attempted",
      load: "not_attempted",
      error: null,
      timestamp: now
    });
  });

  it("preserves opaque native, comment, markdown-only, and null blueprint_id values exactly", () => {
    const table = buildBettingTable({
      cycle_id: "cycle_blueprint_refs",
      top_n: 4,
      now,
      candidates: [
        { issue_id: "issue_native", bpi_score: 10, blueprint_id: "paperclip://issues/issue_native/documents/doc_1" },
        { issue_id: "issue_comment", bpi_score: 9, blueprint_id: "paperclip://issues/issue_comment/comments/comment_1" },
        { issue_id: "issue_markdown", bpi_score: 8, blueprint_id: "markdown-only://issues/issue_markdown/product-blueprint" },
        { issue_id: "issue_null", bpi_score: 7, blueprint_id: null }
      ]
    });

    expect(table.map((item) => item.blueprint_id)).toEqual([
      "paperclip://issues/issue_native/documents/doc_1",
      "paperclip://issues/issue_comment/comments/comment_1",
      "markdown-only://issues/issue_markdown/product-blueprint",
      null
    ]);
  });

  it("saves and loads a betting cycle through the cache-overlay persistence seam", async () => {
    const persistence = new InMemoryBOSPersistence();

    const saved = await buildAndSaveBettingCycle({
      cycle_id: "cycle_saved",
      top_n: 3,
      now,
      persistence,
      candidates: [
        { issue_id: "issue_mid", bpi_score: 5, blueprint_id: "doc_mid" },
        { issue_id: "issue_top", bpi_score: 11, blueprint_id: "doc_top" },
        { issue_id: "issue_bottom", bpi_score: 1, blueprint_id: "doc_bottom" }
      ]
    });

    const loaded = await loadBettingCycle({ cycle_id: "cycle_saved", persistence, now });

    expect(saved.selected_issue_ids).toEqual(["issue_top", "issue_mid", "issue_bottom"]);
    expect(saved.cache_overlay).toMatchObject({
      persistence: "provided",
      save: "saved",
      load: "not_attempted",
      error: null
    });
    expect(loaded.items).toEqual(saved.items);
    expect(loaded.selected_issue_ids).toEqual(saved.selected_issue_ids);
    expect(loaded.cache_overlay).toMatchObject({
      persistence: "provided",
      save: "not_attempted",
      load: "loaded",
      error: null
    });
  });

  it("reports missing cache data separately from missing persistence", async () => {
    const persistence = new InMemoryBOSPersistence();

    const missingPersistenceSave = await saveBettingCycle({ cycle_id: "cycle_missing_persistence", items: [], now });
    const missingPersistenceLoad = await loadBettingCycle({ cycle_id: "cycle_missing_persistence", now });
    const missingCycleLoad = await loadBettingCycle({ cycle_id: "cycle_absent", persistence, now });

    expect(missingPersistenceSave).toMatchObject({
      persistence: "missing",
      save: "not_attempted",
      load: "not_attempted",
      error: null
    });
    expect(missingPersistenceLoad.cache_overlay).toMatchObject({
      persistence: "missing",
      load: "not_attempted",
      error: null
    });
    expect(missingCycleLoad.cache_overlay).toMatchObject({
      persistence: "provided",
      load: "missing",
      error: null
    });
    expect(missingCycleLoad.items).toEqual([]);
  });

  it("returns explicit sanitized diagnostics for save and load failures", async () => {
    const failingPersistence = {
      saveBettingTable: async () => { throw new Error("cache save unavailable\nsecret stack line"); },
      getBettingTable: async () => { throw new Error("cache load unavailable\twith tab"); }
    };

    const saved = await buildAndSaveBettingCycle({
      cycle_id: "cycle_failed",
      top_n: 2,
      now,
      persistence: failingPersistence,
      candidates: [
        { issue_id: "issue_kept", bpi_score: 3, blueprint_id: null },
        { issue_id: "issue_dropped", bpi_score: -1, blueprint_id: "doc_dropped" }
      ]
    });
    const loaded = await loadBettingCycle({ cycle_id: "cycle_failed", persistence: failingPersistence, now });

    expect(saved.items).toHaveLength(1);
    expect(saved.items[0].blueprint_id).toBeNull();
    expect(saved.cache_overlay).toMatchObject({
      persistence: "provided",
      save: "failed",
      load: "not_attempted",
      error: "cache save unavailable secret stack line"
    });
    expect(saved.cache_overlay.error).not.toMatch(/[\n\t]/);
    expect(loaded.items).toEqual([]);
    expect(loaded.cache_overlay).toMatchObject({
      persistence: "provided",
      save: "not_attempted",
      load: "failed",
      error: "cache load unavailable with tab"
    });
    expect(loaded.cache_overlay.error).not.toMatch(/[\n\t]/);
  });

  it("returns an empty cycle for empty candidates without claiming durable Paperclip truth", async () => {
    const persistence = new InMemoryBOSPersistence();

    const cycle = await buildAndSaveBettingCycle({
      cycle_id: "cycle_empty",
      top_n: 5,
      now,
      persistence,
      candidates: []
    });

    expect(cycle.items).toEqual([]);
    expect(cycle.selected_issue_ids).toEqual([]);
    expect(cycle.cache_overlay).toMatchObject({
      durability: "cache-overlay-only",
      persistence: "provided",
      save: "saved",
      load: "not_attempted",
      error: null
    });
    expect(persistence.betting.get("cycle_empty")).toEqual([]);
  });
});

describe("seeded issue Blueprint flow negative surfaces", () => {
  it("returns BPI and markdown when adapter and cache-overlay writes fail", async () => {
    const flow = await runSeededIssueBlueprintFlow({
      issue: {
        issue_id: "issue_failure",
        title: "Keep visible diagnostics",
        problem_statement: "Adapter failures should not hide BPI or Blueprint markdown.",
        producer_division: "Div3.Production",
        acceptance_criteria: ["BPI is returned"],
        resources: ["Fallback markdown"]
      },
      bpi: {
        expected_value: 0.9,
        urgency: 0.9,
        estimated_token_cost: 10000,
        risk_factor: 1,
        company_token_budget_ref: 100000,
        hard_gates: allHardGatesPass
      },
      adapter: {
        createIssueDocument: async () => { throw new Error("document API unavailable"); },
        addIssueComment: async () => { throw new Error("comment API unavailable"); }
      },
      persistence: {
        saveBPI: async () => { throw new Error("cache bpi unavailable"); },
        saveStatus: async () => { throw new Error("cache status unavailable"); }
      },
      capabilities: { documents_native: "enabled", comments_native: "enabled" },
      now: "2026-01-01T00:00:00.000Z"
    });

    const table = buildBettingTable({
      cycle_id: "cycle_failure",
      top_n: 1,
      candidates: [{ issue_id: "issue_failure", bpi_score: flow.bpi.score, blueprint_id: flow.status_overlay.blueprint_id }]
    });

    expect(flow.bpi.score).toBeGreaterThan(0);
    expect(flow.blueprint_markdown).toContain("# Product Blueprint: Keep visible diagnostics");
    expect(flow.artifact.selected_surface).toBe("markdown-only");
    expect(flow.artifact.fallback).toMatchObject({
      reason: "comment_write_failed",
      document_error: "document API unavailable",
      comment_error: "comment API unavailable"
    });
    expect(flow.status_overlay.cache_overlay).toMatchObject({
      durability: "cache-overlay-only",
      persistence: "provided",
      bpi: "failed",
      status: "failed"
    });
    expect(flow.status_overlay.cache_overlay.error).toContain("saveBPI: cache bpi unavailable");
    expect(flow.status_overlay.cache_overlay.error).toContain("saveStatus: cache status unavailable");
    expect(table[0].blueprint_id).toBe("markdown-only://issues/issue_failure/product-blueprint");
  });

  it("handles missing persistence and hard-gated BPI zero without adapter writes", async () => {
    const adapter = new InMemoryPaperclipAdapter();

    const flow = await runSeededIssueBlueprintFlow({
      issue: {
        issue_id: "issue_zero",
        title: "Blocked candidate",
        problem_statement: "A failed hard gate should still produce a diagnostic Blueprint artifact.",
        producer_division: "Div3.Production",
        acceptance_criteria: ["Hard gate failure is visible"],
        resources: ["Policy precheck"]
      },
      bpi: {
        expected_value: 0.9,
        urgency: 0.9,
        estimated_token_cost: 10000,
        risk_factor: 1,
        company_token_budget_ref: 100000,
        hard_gates: { ...allHardGatesPass, policy_precheck_passed: false }
      },
      adapter,
      capabilities: { documents_native: "enabled", comments_native: "enabled" },
      now: "2026-01-01T00:00:00.000Z"
    });

    expect(flow.bpi.score).toBe(0);
    expect(flow.artifact.selected_surface).toBe("markdown-only");
    expect(flow.artifact.fallback.reason).toBe("hard_gate_failed:policy_precheck_passed");
    expect(flow.status_overlay.blueprint_id).toBe("markdown-only://issues/issue_zero/product-blueprint");
    expect(flow.status_overlay.cache_overlay).toMatchObject({
      durability: "cache-overlay-only",
      persistence: "missing",
      bpi: "not_attempted",
      status: "not_attempted",
      error: null
    });
    expect(adapter.documents).toHaveLength(0);
    expect(adapter.comments).toHaveLength(0);
  });

  it("does not crash when optional worker ctx tool surfaces are absent", async () => {
    await expect(registerBosLightPlugin({ logger: { info: () => undefined } })).resolves.toBeUndefined();
  });
});
