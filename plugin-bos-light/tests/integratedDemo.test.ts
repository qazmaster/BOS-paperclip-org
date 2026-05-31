import { describe, expect, it } from "vitest";
import {
  A1ToA10FixtureDemoValidationError,
  normalizeA1ToA10FixtureSeeds,
  runA1ToA10FixtureDemo,
  type A1ToA10FixtureSeedIssue
} from "../src/integratedDemo";
import type { BOSPersistence, NativeApprovalRequest, PaperclipAdapter } from "../src/paperclipAdapter";
import { InMemoryBOSPersistence } from "../src/persistence";
import { InMemoryPaperclipAdapter } from "../src/paperclipAdapter";
import type { BettingTableItem, BPIScore, BosStatusOverlay, CircuitBreakerRecord, DecisionMetadata, EvalGateResult } from "../src/contracts";

const now = "2026-02-01T00:00:00.000Z";

function fixtureAdapter(overrides: Partial<PaperclipAdapter> = {}): PaperclipAdapter {
  const base = new InMemoryPaperclipAdapter();
  return {
    createIssueDocument: overrides.createIssueDocument ?? base.createIssueDocument.bind(base),
    addIssueComment: overrides.addIssueComment ?? base.addIssueComment.bind(base),
    createApprovalRequest: overrides.createApprovalRequest ?? base.createApprovalRequest.bind(base),
    createEscalationIssue: overrides.createEscalationIssue ?? base.createEscalationIssue.bind(base),
    logActivity: overrides.logActivity ?? base.logActivity.bind(base)
  };
}

class SelectivelyFailingPersistence implements BOSPersistence {
  private circuit = new InMemoryBOSPersistence();

  async saveBPI(_score: BPIScore): Promise<void> { throw new Error("bpi cache down\nsecret frame"); }
  async getBPI(_issueId: string): Promise<BPIScore | null> { throw new Error("bpi read unavailable"); }
  async saveStatus(_status: BosStatusOverlay): Promise<void> { throw new Error("status cache down\ttrace"); }
  async saveBettingTable(_cycleId: string, _items: BettingTableItem[]): Promise<void> { throw new Error("betting save down\nsecret frame"); }
  async getBettingTable(_cycleId: string): Promise<BettingTableItem[]> { throw new Error("betting load down\ttrace"); }
  async saveGateResult(_result: EvalGateResult): Promise<void> { throw new Error("gate cache down\nsecret frame"); }
  async saveCircuitBreaker(record: CircuitBreakerRecord): Promise<void> { return this.circuit.saveCircuitBreaker(record); }
  async getCircuitBreaker(issueId: string): Promise<CircuitBreakerRecord | null> { return this.circuit.getCircuitBreaker(issueId); }
  async saveDecision(_decision: DecisionMetadata): Promise<void> { throw new Error("decision cache down"); }
}

describe("runA1ToA10FixtureDemo", () => {
  it("composes a deterministic A3-A10 fixture demo with explicit fixture-only runtime posture", async () => {
    const report = await runA1ToA10FixtureDemo({ now });

    expect(report.schema_version).toBe("1.0");
    expect(report.seed_issue_count).toBe(5);
    expect(Object.keys(report.A3.artifact_refs)).toHaveLength(5);
    expect(report.runtime_capability_posture).toMatchObject({
      source: "fixture-adapter",
      native_support_confirmed: false,
      surfaces: {
        documents_native: "fixture-exercised-unproven",
        approvals_native: "fixture-exercised-unproven",
        cache_overlay: "in-memory-not-durable"
      }
    });

    expect(Object.values(report.A3.selected_surfaces).every((surface) => surface === "documents.native")).toBe(true);
    for (const item of report.A4.built.items) {
      expect(item.blueprint_id).toBe(report.A3.artifact_refs[item.issue_id]);
      expect(report.A4.blueprint_ids[item.issue_id]).toBe(item.blueprint_id);
    }
    expect(report.A4.loaded.items).toEqual(report.A4.built.items);
    expect(report.A4.selected_surface).toBe("cache-overlay");
    expect(report.A4.built.cache_overlay).toMatchObject({ persistence: "provided", save: "saved" });
    expect(report.A4.loaded.cache_overlay).toMatchObject({ persistence: "provided", load: "loaded" });

    expect(report.A5).toMatchObject({
      selected_surface: "approvals.native",
      native_support_confirmed: false,
      fallback: { reason: null }
    });
    expect(report.A5.approval.native_approval_request_id).toBe("approval_1");
    expect(report.A5.approval.updated_rows.map((row) => row.status)).toEqual([
      "APPROVAL_REQUESTED",
      "APPROVAL_REQUESTED",
      "APPROVAL_REQUESTED"
    ]);
    expect(report.A5.approval.updated_rows.map((row) => row.approved_by)).toEqual([
      "Div1.HCO",
      "Div1.HCO",
      "Div1.HCO"
    ]);
    expect(report.A6).toMatchObject({ selected_surface: "comments.native", fallback: { reason: null } });
    expect(report.A6.evidence.result.evaluated_by).toBe("Div5.QualificationsLibraryLearning");
    expect(report.A6.evidence.result.overall).toBe("PASSED");
    expect(report.A7).toMatchObject({ selected_surface: "comments.native", fallback: { reason: null } });
    expect(report.A7.evidence.result.evaluated_by).toBe("Div5.QualificationsLibraryLearning");
    expect(report.A7.evidence.result.overall).toBe("FAILED_BLOCKING");
    expect(report.A7.evidence.guidance).toContain("Blocking Eval Gate failure");

    expect(report.A8.attempts).toHaveLength(3);
    expect(report.A8.attempts.map((attempt) => attempt.attempt_count)).toEqual([1, 2, 3]);
    expect(report.A8.opened).toMatchObject({
      previous_state: "CLOSED",
      next_state: "OPEN",
      transition_reason: "failure_threshold_reached",
      selected_surface: "issues.native",
      escalation_issue_id: "escalation_1"
    });
    expect(report.A9.evidence).toMatchObject({ previous_state: "OPEN", next_state: "HALF_OPEN", transition_reason: "half_open_probe_started" });
    expect(report.A10.evidence).toMatchObject({ previous_state: "HALF_OPEN", next_state: "CLOSED", attempt_count: 0, failure_reason: null });
    expect(report.runtime_gap_ledger).toEqual(expect.arrayContaining([
      expect.objectContaining({ surface: "runtime.native_support", posture: "fixture-only" }),
      expect.objectContaining({ surface: "cache-overlay", posture: "cache-overlay-only" })
    ]));
  });

  it("keeps fallback diagnostics and never confirms native approval support when the approval adapter response is malformed", async () => {
    const report = await runA1ToA10FixtureDemo({
      now,
      adapter: fixtureAdapter({
        createApprovalRequest: async (): Promise<NativeApprovalRequest> => ({ id: "", issue_ids: [], status: "PENDING" }),
        addIssueComment: async () => ({ comment_id: "approval_fallback_comment" })
      })
    });

    expect(report.runtime_capability_posture.native_support_confirmed).toBe(false);
    expect(report.A5.native_support_confirmed).toBe(false);
    expect(report.A5).toMatchObject({
      selected_surface: "comments.native",
      artifact_ref: `paperclip://issues/${report.A5.approval.selected_issue_ids[0]}/comments/approval_fallback_comment`,
      fallback: {
        reason: "native_response_malformed",
        native_error: "createApprovalRequest returned missing id or invalid status"
      }
    });
    expect(report.A5.approval.native_approval_request_id).toBeNull();
    expect(report.runtime_gap_ledger).toEqual(expect.arrayContaining([
      expect.objectContaining({ surface: "A5.approval", posture: "fallback", reason: "native_response_malformed" })
    ]));
  });

  it("returns markdown-only approval diagnostics when native and comment approval paths fail", async () => {
    const report = await runA1ToA10FixtureDemo({
      now,
      adapter: fixtureAdapter({
        createApprovalRequest: async () => { throw new Error("native approvals unavailable\nsecret frame"); },
        addIssueComment: async () => { throw new Error("comment approval unavailable\ttrace"); }
      })
    });

    expect(report.A5).toMatchObject({
      selected_surface: "markdown-only",
      artifact_ref: "markdown-only://betting-cycles/fixture_cycle_a1_to_a10/approval-request",
      fallback: {
        reason: "comment_write_failed",
        native_error: "native approvals unavailable secret frame",
        comment_error: "comment approval unavailable trace"
      },
      native_support_confirmed: false
    });
    expect(report.A5.fallback.native_error).not.toMatch(/[\n\t]/);
    expect(report.A5.fallback.comment_error).not.toMatch(/[\n\t]/);
  });

  it("surfaces cache-overlay failures while retaining Paperclip-visible or markdown fallback artifact refs", async () => {
    const report = await runA1ToA10FixtureDemo({
      now,
      persistence: new SelectivelyFailingPersistence()
    });

    expect(Object.values(report.A3.artifact_refs).every((ref) => ref.startsWith("paperclip://issues/"))).toBe(true);
    expect(Object.values(report.A3.cache_overlay).every((overlay) => overlay.persistence === "provided" && overlay.bpi === "failed" && overlay.status === "failed")).toBe(true);
    expect(Object.values(report.A3.cache_overlay).every((overlay) => overlay.error && !/[\n\t]/.test(overlay.error))).toBe(true);
    expect(report.A4.built.cache_overlay).toMatchObject({ persistence: "provided", save: "failed", error: "betting save down secret frame" });
    expect(report.A4.loaded.cache_overlay).toMatchObject({ persistence: "provided", load: "failed", error: "betting load down trace" });
    expect(report.A5).toMatchObject({
      selected_surface: "markdown-only",
      artifact_ref: "markdown-only://betting-cycles/fixture_cycle_a1_to_a10/approval-request",
      fallback: { reason: "missing_cycle" },
      cache_overlay: { persistence: "provided", load: "failed", save: "not_attempted", error: "betting load down trace" }
    });
    expect(report.A6.cache_overlay).toMatchObject({ persistence: "provided", save: "failed", error: "gate cache down secret frame" });
    expect(report.A8.opened.next_state).toBe("OPEN");
    expect(report.runtime_gap_ledger).toEqual(expect.arrayContaining([
      expect.objectContaining({ surface: "A4.betting.save", posture: "cache-overlay-only", reason: "betting save down secret frame" }),
      expect.objectContaining({ surface: "A4.betting.load", posture: "cache-overlay-only", reason: "betting load down trace" }),
      expect.objectContaining({ surface: "A5.approval", posture: "fallback", reason: "missing_cycle" })
    ]));
  });

  it("rejects malformed or empty seed rows before producing partial demo output", async () => {
    await expect(runA1ToA10FixtureDemo({ seedIssues: [] })).rejects.toMatchObject({
      name: "A1ToA10FixtureDemoValidationError",
      diagnostics: { phase: "seed_validation", errors: ["at least one seed issue is required"], received_count: 0 }
    });

    const malformed: A1ToA10FixtureSeedIssue[] = [
      { title: "", expected_value: Number.NaN, urgency: 0.5, estimated_token_cost: 1000 },
      { title: "Duplicate", issue_id: "same", expected_value: 0.5, urgency: 0.5, estimated_token_cost: 1000 },
      { title: "Duplicate again", issue_id: "same", expected_value: 0.5, urgency: 0.5, estimated_token_cost: 1000, resources: [] }
    ];

    await expect(runA1ToA10FixtureDemo({ seedIssues: malformed })).rejects.toBeInstanceOf(A1ToA10FixtureDemoValidationError);
    try {
      normalizeA1ToA10FixtureSeeds(malformed);
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(A1ToA10FixtureDemoValidationError);
      const diagnostics = (error as A1ToA10FixtureDemoValidationError).diagnostics;
      expect(diagnostics.errors).toEqual(expect.arrayContaining([
        "row 1: title is required",
        "row 1: expected_value must be a finite number",
        "row 3: duplicate issue_id same",
        "row 3: resources must contain only non-empty strings"
      ]));
    }
  });
});
