import { describe, expect, it } from "vitest";
import { calculateBPIScore } from "../src/bpi";
import { generateBlueprintMarkdown } from "../src/blueprint";
import { buildAndSaveBettingCycle, buildBettingTable, loadBettingCycle, markApprovalRequested, requestBettingCycleApproval, saveBettingCycle } from "../src/bettingTable";
import { runEvalGates } from "../src/evalGates";
import { runSeededIssueBlueprintFlow } from "../src/issueBlueprintFlow";
import { InMemoryPaperclipAdapter } from "../src/paperclipAdapter";
import { InMemoryBOSPersistence } from "../src/persistence";
import { BOS_LIGHT_TOOLS, registerBosLightPlugin } from "../src/worker";

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

describe("betting cycle approval request orchestration", () => {
  const now = "2026-01-02T00:00:00.000Z";

  it("creates a native approval request, marks selected rows, and persists the updated betting cycle", async () => {
    const persistence = new InMemoryBOSPersistence();
    const adapter = new InMemoryPaperclipAdapter();

    await buildAndSaveBettingCycle({
      cycle_id: "cycle_approval_native",
      top_n: 2,
      now,
      persistence,
      candidates: [
        { issue_id: "issue_a", bpi_score: 10, blueprint_id: "doc_a" },
        { issue_id: "issue_b", bpi_score: 9, blueprint_id: "doc_b" }
      ]
    });

    const result = await requestBettingCycleApproval({
      cycle_id: "cycle_approval_native",
      issue_ids: ["issue_a", "issue_b"],
      reason: "Approve top BPI candidates for the next cycle",
      requested_by: "Master.Human",
      adapter,
      persistence,
      now
    });
    const persisted = await loadBettingCycle({ cycle_id: "cycle_approval_native", persistence, now });

    expect(result).toMatchObject({
      schema_version: "1.0",
      cycle_id: "cycle_approval_native",
      selected_issue_ids: ["issue_a", "issue_b"],
      selected_surface: "approvals.native",
      native_approval_request_id: "approval_1",
      native_approval_status: "PENDING",
      approval_request_ref: "paperclip://approval-requests/approval_1",
      requested_at: now,
      fallback: { reason: null },
      cache_overlay: {
        durability: "cache-overlay-only",
        persistence: "provided",
        load: "loaded",
        save: "saved",
        error: null,
        timestamp: now
      }
    });
    expect(result.updated_rows.map((row) => row.status)).toEqual(["APPROVAL_REQUESTED", "APPROVAL_REQUESTED"]);
    expect(result.updated_rows.map((row) => row.native_approval_request_id)).toEqual(["approval_1", "approval_1"]);
    expect(result.updated_rows.map((row) => row.approved_by)).toEqual(["Master.Human", "Master.Human"]);
    expect(persisted.items).toEqual(result.updated_rows);
    expect(adapter.approvals).toEqual([{ id: "approval_1", issue_ids: ["issue_a", "issue_b"], status: "PENDING" }]);
  });

  it("records a comment fallback when native approval support is unavailable without mutating rows", async () => {
    const persistence = new InMemoryBOSPersistence();
    const comments: Array<{ issueId: string; markdown: string }> = [];

    await buildAndSaveBettingCycle({
      cycle_id: "cycle_approval_comment",
      top_n: 1,
      now,
      persistence,
      candidates: [{ issue_id: "issue_comment", bpi_score: 8, blueprint_id: "doc_comment" }]
    });

    const result = await requestBettingCycleApproval({
      cycle_id: "cycle_approval_comment",
      issue_ids: ["issue_comment"],
      reason: "Native approvals disabled in this runtime",
      adapter: {
        addIssueComment: async (issueId, markdown) => {
          comments.push({ issueId, markdown });
          return { comment_id: "comment_approval" };
        }
      },
      persistence,
      now
    });
    const persisted = await loadBettingCycle({ cycle_id: "cycle_approval_comment", persistence, now });

    expect(result.selected_surface).toBe("comments.native");
    expect(result.native_approval_request_id).toBeNull();
    expect(result.native_approval_status).toBeNull();
    expect(result.approval_request_ref).toBe("paperclip://issues/issue_comment/comments/comment_approval");
    expect(result.fallback).toMatchObject({ reason: "approvals.native:unavailable" });
    expect(result.cache_overlay).toMatchObject({ load: "loaded", save: "not_attempted", error: null });
    expect(result.updated_rows[0]).toMatchObject({ status: "CANDIDATE", native_approval_request_id: null, native_approval_status: null });
    expect(persisted.items[0].status).toBe("CANDIDATE");
    expect(comments).toHaveLength(1);
    expect(comments[0].markdown).toContain("Native approval fallback reason: approvals.native:unavailable");
  });

  it("returns markdown-only diagnostics when native and comment fallbacks fail with sanitized errors", async () => {
    const persistence = new InMemoryBOSPersistence();

    await buildAndSaveBettingCycle({
      cycle_id: "cycle_approval_all_fail",
      top_n: 1,
      now,
      persistence,
      candidates: [{ issue_id: "issue_fail", bpi_score: 7, blueprint_id: "doc_fail" }]
    });

    const result = await requestBettingCycleApproval({
      cycle_id: "cycle_approval_all_fail",
      issue_ids: ["issue_fail"],
      reason: "Exercise all fallback diagnostics",
      adapter: {
        createApprovalRequest: async () => { throw new Error("native approval down\nsecret stack"); },
        addIssueComment: async () => { throw new Error("comment down\ttrace"); }
      },
      persistence,
      now
    });

    expect(result).toMatchObject({
      selected_surface: "markdown-only",
      native_approval_request_id: null,
      native_approval_status: null,
      approval_request_ref: "markdown-only://betting-cycles/cycle_approval_all_fail/approval-request",
      fallback: {
        reason: "comment_write_failed",
        native_error: "native approval down secret stack",
        comment_error: "comment down trace"
      },
      cache_overlay: { load: "loaded", save: "not_attempted" }
    });
    expect(result.fallback.native_error).not.toMatch(/[\n\t]/);
    expect(result.fallback.comment_error).not.toMatch(/[\n\t]/);
    expect(result.updated_rows[0].status).toBe("CANDIDATE");
  });

  it("rejects empty, stale, missing-cycle, and already-decided selections before adapter writes", async () => {
    const persistence = new InMemoryBOSPersistence();
    let nativeCalls = 0;
    const adapter = {
      createApprovalRequest: async () => {
        nativeCalls += 1;
        return { id: "should_not_happen", issue_ids: [], status: "PENDING" as const };
      },
      addIssueComment: async () => {
        throw new Error("comment should not be called for validation failures");
      }
    };

    await buildAndSaveBettingCycle({
      cycle_id: "cycle_approval_validation",
      top_n: 1,
      now,
      persistence,
      candidates: [{ issue_id: "issue_valid", bpi_score: 6, blueprint_id: "doc_valid" }]
    });
    const decidedRows = buildBettingTable({
      cycle_id: "cycle_approval_decided",
      top_n: 1,
      now,
      candidates: [{ issue_id: "issue_decided", bpi_score: 5, blueprint_id: "doc_decided" }]
    });
    await persistence.saveBettingTable("cycle_approval_decided", [
      markApprovalRequested(decidedRows[0], "approval_existing", "Master.Human", now)
    ]);

    const empty = await requestBettingCycleApproval({
      cycle_id: "cycle_approval_validation",
      issue_ids: [],
      reason: "Empty request",
      adapter,
      persistence,
      now
    });
    const stale = await requestBettingCycleApproval({
      cycle_id: "cycle_approval_validation",
      issue_ids: ["issue_missing"],
      reason: "Stale request",
      adapter,
      persistence,
      now
    });
    const missing = await requestBettingCycleApproval({
      cycle_id: "cycle_missing",
      issue_ids: ["issue_missing"],
      reason: "Missing cycle",
      adapter,
      persistence,
      now
    });
    const decided = await requestBettingCycleApproval({
      cycle_id: "cycle_approval_decided",
      issue_ids: ["issue_decided"],
      reason: "Already requested",
      adapter,
      persistence,
      now
    });

    expect(empty.fallback.reason).toBe("empty_issue_ids");
    expect(stale.fallback.reason).toBe("stale_issue_id:issue_missing");
    expect(missing.fallback.reason).toBe("missing_cycle");
    expect(decided.fallback.reason).toBe("issue_not_requestable:issue_decided:APPROVAL_REQUESTED");
    expect([empty, stale, missing, decided].map((result) => result.selected_surface)).toEqual([
      "markdown-only",
      "markdown-only",
      "markdown-only",
      "markdown-only"
    ]);
    expect([empty, stale, missing, decided].map((result) => result.native_approval_request_id)).toEqual([null, null, null, null]);
    expect(nativeCalls).toBe(0);
  });

  it("falls back on malformed native approval responses and reports cache save failures after native creation", async () => {
    const persistence = new InMemoryBOSPersistence();
    const failingSavePersistence = {
      getBettingTable: persistence.getBettingTable.bind(persistence),
      saveBettingTable: async () => { throw new Error("cache save failed\nwith stack"); }
    };

    await buildAndSaveBettingCycle({
      cycle_id: "cycle_approval_malformed",
      top_n: 1,
      now,
      persistence,
      candidates: [{ issue_id: "issue_malformed", bpi_score: 4, blueprint_id: "doc_malformed" }]
    });
    await buildAndSaveBettingCycle({
      cycle_id: "cycle_approval_save_fail",
      top_n: 1,
      now,
      persistence,
      candidates: [{ issue_id: "issue_save_fail", bpi_score: 3, blueprint_id: "doc_save_fail" }]
    });

    const malformed = await requestBettingCycleApproval({
      cycle_id: "cycle_approval_malformed",
      issue_ids: ["issue_malformed"],
      reason: "Bad native response",
      adapter: {
        createApprovalRequest: async () => ({ id: "", issue_ids: ["issue_malformed"], status: "PENDING" })
      },
      persistence,
      now
    });
    const saveFailed = await requestBettingCycleApproval({
      cycle_id: "cycle_approval_save_fail",
      issue_ids: ["issue_save_fail"],
      reason: "Native succeeds but cache save fails",
      adapter: new InMemoryPaperclipAdapter(),
      persistence: failingSavePersistence,
      now
    });

    expect(malformed).toMatchObject({
      selected_surface: "markdown-only",
      native_approval_request_id: null,
      native_approval_status: null,
      fallback: {
        reason: "native_response_malformed",
        native_error: "createApprovalRequest returned missing id or invalid status",
        comment_error: "comments.native:unavailable"
      }
    });
    expect(saveFailed).toMatchObject({
      selected_surface: "approvals.native",
      native_approval_request_id: "approval_1",
      native_approval_status: "PENDING",
      cache_overlay: {
        load: "loaded",
        save: "failed",
        error: "cache save failed with stack"
      }
    });
    expect(saveFailed.updated_rows[0]).toMatchObject({
      status: "APPROVAL_REQUESTED",
      native_approval_request_id: "approval_1",
      native_approval_status: "PENDING"
    });
    expect(saveFailed.cache_overlay.error).not.toMatch(/[\n\t]/);
  });
});

describe("worker Betting Table data and approve-batch wiring", () => {
  const now = "2026-01-03T00:00:00.000Z";

  async function registerWorkerHarness(ctxOverrides: Record<string, unknown> = {}) {
    const tools = new Map<string, (input?: any) => Promise<any> | any>();
    const dataProviders = new Map<string, (input?: any) => Promise<any> | any>();
    const actions = new Map<string, (input?: any) => Promise<any> | any>();
    const ctx = {
      logger: { info: () => undefined },
      tools: { register: async (name: string, handler: (input?: any) => Promise<any> | any) => { tools.set(name, handler); } },
      data: { register: async (name: string, handler: (input?: any) => Promise<any> | any) => { dataProviders.set(name, handler); } },
      actions: { register: async (name: string, handler: (input?: any) => Promise<any> | any) => { actions.set(name, handler); } },
      ...ctxOverrides
    };

    await registerBosLightPlugin(ctx);
    return { tools, dataProviders, actions, ctx };
  }

  it("exposes betting-cycle helpers and registers fake ctx data/action surfaces", async () => {
    const { tools, dataProviders, actions } = await registerWorkerHarness();

    expect(BOS_LIGHT_TOOLS).toMatchObject({
      buildAndSaveBettingCycle,
      saveBettingCycle,
      loadBettingCycle,
      requestBettingCycleApproval
    });
    expect(tools.has("piko:bpi-score")).toBe(true);
    expect(tools.has("piko:bpi-blueprint-artifact")).toBe(true);
    expect(dataProviders.has("betting-table")).toBe(true);
    expect(actions.has("approve-batch")).toBe(true);
  });

  it("hydrates persisted S03 blueprint_id Betting Table rows through the worker data provider", async () => {
    const persistence = new InMemoryBOSPersistence();
    const adapter = new InMemoryPaperclipAdapter();
    const flow = await runSeededIssueBlueprintFlow({
      issue: {
        issue_id: "issue_worker_seeded",
        title: "Seed worker Betting Table",
        problem_statement: "Worker provider should hydrate the persisted cycle by current config.",
        producer_division: "Div3.Production",
        acceptance_criteria: ["Seeded Blueprint artifact ref appears in provider rows"],
        resources: ["In-memory Paperclip adapter", "In-memory cache overlay"]
      },
      bpi: {
        expected_value: 0.85,
        urgency: 0.9,
        estimated_token_cost: 10000,
        risk_factor: 1,
        company_token_budget_ref: 100000,
        hard_gates: allHardGatesPass
      },
      adapter,
      persistence,
      capabilities: { documents_native: "enabled", comments_native: "enabled" },
      now
    });
    await buildAndSaveBettingCycle({
      cycle_id: "cycle_worker_hydrated",
      top_n: 2,
      now,
      persistence,
      candidates: [
        { issue_id: "issue_lower", bpi_score: 0.1, blueprint_id: "markdown-only://issues/issue_lower/product-blueprint" },
        { issue_id: "issue_worker_seeded", bpi_score: flow.bpi.score, blueprint_id: flow.status_overlay.blueprint_id }
      ]
    });
    const { dataProviders } = await registerWorkerHarness({
      persistence,
      config: { current_betting_cycle_id: "cycle_worker_hydrated" }
    });

    const result = await dataProviders.get("betting-table")?.({});

    expect(result.items.map((item: any) => item.issue_id)).toEqual(["issue_worker_seeded", "issue_lower"]);
    expect(result.items[0].blueprint_id).toBe(flow.artifact.artifact_ref);
    expect(result.diagnostics).toMatchObject({
      cycle_id: "cycle_worker_hydrated",
      selected_issue_ids: ["issue_worker_seeded", "issue_lower"],
      cache_overlay: {
        durability: "cache-overlay-only",
        persistence: "provided",
        load: "loaded",
        save: "not_attempted",
        error: null
      }
    });
  });

  it("approve-batch uses the adapter seam for native approvals, updates persistence, and never calls ctx.approvals", async () => {
    const persistence = new InMemoryBOSPersistence();
    const paperclipAdapter = new InMemoryPaperclipAdapter();
    let directApprovalCalls = 0;
    await buildAndSaveBettingCycle({
      cycle_id: "cycle_worker_native",
      top_n: 2,
      now,
      persistence,
      candidates: [
        { issue_id: "issue_worker_a", bpi_score: 12, blueprint_id: "doc_a" },
        { issue_id: "issue_worker_b", bpi_score: 10, blueprint_id: "doc_b" }
      ]
    });
    const { actions } = await registerWorkerHarness({
      persistence,
      paperclipAdapter,
      approvals: { create: async () => { directApprovalCalls += 1; throw new Error("direct approvals surface must not be used"); } }
    });

    const result = await actions.get("approve-batch")?.({
      cycle_id: "cycle_worker_native",
      issue_ids: ["issue_worker_a", "issue_worker_b"],
      reason: "Approve worker batch",
      requested_by: "Master.Human",
      now
    });
    const persisted = await loadBettingCycle({ cycle_id: "cycle_worker_native", persistence, now });

    expect(directApprovalCalls).toBe(0);
    expect(result.approval).toBeUndefined();
    expect(result).toMatchObject({
      selected_surface: "approvals.native",
      native_approval_request_id: "approval_1",
      native_approval_status: "PENDING",
      fallback: { reason: null },
      cache_overlay: { load: "loaded", save: "saved", error: null }
    });
    expect(paperclipAdapter.approvals).toEqual([{ id: "approval_1", issue_ids: ["issue_worker_a", "issue_worker_b"], status: "PENDING" }]);
    expect(persisted.items.map((item) => item.status)).toEqual(["APPROVAL_REQUESTED", "APPROVAL_REQUESTED"]);
    expect(persisted.items.map((item) => item.native_approval_request_id)).toEqual(["approval_1", "approval_1"]);
  });

  it("approve-batch returns explicit fallback diagnostics when the adapter is unavailable without mutating rows", async () => {
    const persistence = new InMemoryBOSPersistence();
    await buildAndSaveBettingCycle({
      cycle_id: "cycle_worker_fallback",
      top_n: 1,
      now,
      persistence,
      candidates: [{ issue_id: "issue_worker_fallback", bpi_score: 7, blueprint_id: "doc_fallback" }]
    });
    const { actions } = await registerWorkerHarness({ persistence });

    const result = await actions.get("approve-batch")?.({
      cycle_id: "cycle_worker_fallback",
      issue_ids: ["issue_worker_fallback"],
      reason: "Runtime lacks native approval adapter",
      now
    });
    const persisted = await loadBettingCycle({ cycle_id: "cycle_worker_fallback", persistence, now });

    expect(result).toMatchObject({
      selected_surface: "markdown-only",
      native_approval_request_id: null,
      native_approval_status: null,
      approval_request_ref: "markdown-only://betting-cycles/cycle_worker_fallback/approval-request",
      fallback: {
        reason: "approvals.native:unavailable",
        comment_error: "comments.native:unavailable"
      },
      cache_overlay: { load: "loaded", save: "not_attempted", error: null }
    });
    expect(persisted.items[0]).toMatchObject({
      status: "CANDIDATE",
      native_approval_request_id: null,
      native_approval_status: null
    });
  });

  it("returns no-crash diagnostics for missing cycle ids and missing persistence", async () => {
    const { dataProviders: noCycleDataProviders, actions } = await registerWorkerHarness();

    const missingCycleData = await noCycleDataProviders.get("betting-table")?.({});
    const missingCycleAction = await actions.get("approve-batch")?.({ issue_ids: ["issue_no_cycle"] });

    expect(missingCycleData).toMatchObject({
      items: [],
      diagnostics: { cycle_id: null, error: "missing_cycle_id", persistence: "missing" }
    });
    expect(missingCycleAction).toMatchObject({
      error: "missing_cycle_id",
      selected_issue_ids: ["issue_no_cycle"],
      selected_surface: "markdown-only"
    });

    const { dataProviders: noPersistenceDataProviders } = await registerWorkerHarness({
      config: { current_betting_cycle_id: "cycle_without_persistence" }
    });
    const missingPersistenceData = await noPersistenceDataProviders.get("betting-table")?.({});

    expect(missingPersistenceData).toMatchObject({
      items: [],
      diagnostics: {
        cycle_id: "cycle_without_persistence",
        selected_issue_ids: [],
        cache_overlay: {
          durability: "cache-overlay-only",
          persistence: "missing",
          load: "not_attempted",
          save: "not_attempted",
          error: null
        }
      }
    });
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
