import { describe, expect, it, vi } from "vitest";
import { evalGateEvidence } from "../src/evalGateEvidence";
import { InMemoryBOSPersistence } from "../src/persistence";
import { InMemoryPaperclipAdapter } from "../src/paperclipAdapter";
import type { EvalGateInput } from "../src/evalGates";

const NOW = "2026-05-28T00:00:00.000Z";

function input(overrides: Partial<EvalGateInput> = {}): EvalGateInput {
  return {
    issue_id: "issue_1",
    run_id: "run_1",
    blueprintMarkdown: "# Blueprint\n\nAcceptance contract",
    outputMarkdown: "# Output\n\nImplemented behavior",
    toolScopeRespected: true,
    budgetWarning: false,
    now: NOW,
    ...overrides
  };
}

describe("Eval Gate evidence", () => {
  it("saves the gate result as cache overlay and mirrors a native comment", async () => {
    const persistence = new InMemoryBOSPersistence();
    const adapter = new InMemoryPaperclipAdapter();

    const evidence = await evalGateEvidence({
      ...input(),
      persistence,
      adapter,
      now: NOW
    });

    expect(evidence.result.overall).toBe("PASSED");
    expect(persistence.gates.get("issue_1")?.overall).toBe("PASSED");
    expect(adapter.comments).toHaveLength(1);
    expect(adapter.comments[0].markdown).toContain("# BOS Eval Gate Result");
    expect(evidence.selected_surface).toBe("comments.native");
    expect(evidence.artifact_ref).toBe("paperclip://issues/issue_1/comments/comment_1");
    expect(evidence.cache_overlay.save).toBe("saved");
    expect(evidence.fallback.reason).toBeNull();
    expect(evidence.evaluated_at).toBe(NOW);
  });

  it("keeps Paperclip source-of-truth semantics as markdown-only when no adapter is provided", async () => {
    const persistence = new InMemoryBOSPersistence();

    const evidence = await evalGateEvidence({
      ...input(),
      persistence,
      now: NOW
    });

    expect(evidence.selected_surface).toBe("markdown-only");
    expect(evidence.artifact_ref).toBe("markdown-only://issues/issue_1/eval-gates/run_1");
    expect(evidence.fallback.reason).toBe("comments.native:unavailable");
    expect(evidence.fallback.comment_error).toBe("comments.native:unavailable");
    expect(evidence.cache_overlay.save).toBe("saved");
    expect(evidence.markdown).toContain("Overall: PASSED");
  });

  it("continues mirroring when cache overlay persistence fails", async () => {
    const persistence = new InMemoryBOSPersistence();
    const adapter = new InMemoryPaperclipAdapter();
    vi.spyOn(persistence, "saveGateResult").mockRejectedValue(new Error("cache write failed\nwith token secret-ish details"));

    const evidence = await evalGateEvidence({
      ...input(),
      persistence,
      adapter,
      now: NOW
    });

    expect(adapter.comments).toHaveLength(1);
    expect(evidence.selected_surface).toBe("comments.native");
    expect(evidence.cache_overlay.save).toBe("failed");
    expect(evidence.cache_overlay.error).toBe("cache write failed with token secret-ish details");
    expect(evidence.fallback.reason).toBeNull();
  });

  it("falls back to markdown-only with bounded diagnostics when comment mirroring fails", async () => {
    const adapter = new InMemoryPaperclipAdapter();
    vi.spyOn(adapter, "addIssueComment").mockRejectedValue(new Error(`comment down ${"x".repeat(800)}`));

    const evidence = await evalGateEvidence({
      ...input(),
      adapter,
      now: NOW
    });

    expect(evidence.selected_surface).toBe("markdown-only");
    expect(evidence.artifact_ref).toBe("markdown-only://issues/issue_1/eval-gates/run_1");
    expect(evidence.fallback.reason).toBe("comment_write_failed");
    expect(evidence.fallback.comment_error?.startsWith("comment down")).toBe(true);
    expect(evidence.fallback.comment_error?.length).toBeLessThanOrEqual(500);
  });

  it("treats malformed comment responses as markdown-only fallback", async () => {
    const adapter = new InMemoryPaperclipAdapter();
    vi.spyOn(adapter, "addIssueComment").mockResolvedValue({ comment_id: "" });

    const evidence = await evalGateEvidence({
      ...input(),
      adapter,
      now: NOW
    });

    expect(evidence.selected_surface).toBe("markdown-only");
    expect(evidence.fallback.reason).toBe("comment_response_malformed");
    expect(evidence.fallback.comment_error).toBe("addIssueComment returned missing comment_id");
  });

  it("does not write native comments for an empty issue id", async () => {
    const persistence = new InMemoryBOSPersistence();
    const adapter = new InMemoryPaperclipAdapter();

    const evidence = await evalGateEvidence({
      ...input({ issue_id: "   " }),
      persistence,
      adapter,
      now: NOW
    });

    expect(adapter.comments).toHaveLength(0);
    expect(persistence.gates.size).toBe(0);
    expect(evidence.result.overall).toBe("INCOMPLETE");
    expect(evidence.result.not_run_count).toBe(4);
    expect(evidence.selected_surface).toBe("markdown-only");
    expect(evidence.fallback.reason).toBe("invalid_input");
    expect(evidence.fallback.validation_error).toBe("issue_id is required");
  });

  it("marks missing required gate inputs incomplete instead of fabricating pass/fail guidance", async () => {
    const adapter = new InMemoryPaperclipAdapter();
    const malformed = {
      issue_id: "issue_1",
      run_id: "run_1",
      blueprintMarkdown: "# Blueprint",
      outputMarkdown: "# Output"
    } as EvalGateInput;

    const evidence = await evalGateEvidence({
      ...malformed,
      adapter,
      now: NOW
    });

    expect(adapter.comments).toHaveLength(0);
    expect(evidence.result.overall).toBe("INCOMPLETE");
    expect(evidence.result.gates.every((gate) => gate.status === "NOT_RUN")).toBe(true);
    expect(evidence.fallback.reason).toBe("invalid_input");
    expect(evidence.fallback.validation_error).toBe("toolScopeRespected and budgetWarning are required booleans");
  });

  it("surfaces blocking failure guidance when required output artifacts are missing", async () => {
    const adapter = new InMemoryPaperclipAdapter();

    const evidence = await evalGateEvidence({
      ...input({ outputMarkdown: "" }),
      adapter,
      now: NOW
    });

    expect(evidence.result.overall).toBe("FAILED_BLOCKING");
    expect(evidence.result.blocking_failure_count).toBeGreaterThan(0);
    expect(evidence.guidance).toContain("Blocking Eval Gate failure");
    expect(adapter.comments[0].markdown).toContain("Blocking Eval Gate failure");
  });

  it("surfaces budget warning as non-blocking guidance", async () => {
    const adapter = new InMemoryPaperclipAdapter();

    const evidence = await evalGateEvidence({
      ...input({ budgetWarning: true }),
      adapter,
      now: NOW
    });

    expect(evidence.result.overall).toBe("PASSED_WITH_WARNINGS");
    expect(evidence.result.warning_count).toBe(1);
    expect(evidence.guidance).toContain("Non-blocking Eval Gate warning");
    expect(adapter.comments[0].markdown).toContain("Non-blocking Eval Gate warning");
  });
});
