import { describe, expect, it, vi } from "vitest";
import { decide } from "../src/decision";
import { persistDecisionArtifact } from "../src/decisionArtifact";
import { InMemoryBOSPersistence } from "../src/persistence";
import { InMemoryPaperclipAdapter } from "../src/paperclipAdapter";

const NOW = "2026-05-29T00:00:00.000Z";
const RAW_SECRET = "raw-token-secret-1234567890";
const SECRET_ERROR = new Error(
  `dependency denied\nAuthorization: Bearer ${RAW_SECRET}\ntoken=${RAW_SECRET}\ncookie ${RAW_SECRET}\n    at PaperclipClient.request (client.ts:10:5)`
);

function expectSanitizedDiagnostic(value: string | undefined | null) {
  expect(value).toEqual(expect.any(String));
  expect(value).not.toContain(RAW_SECRET);
  expect(value).not.toMatch(/[\r\n\t]/);
  expect(value?.length).toBeLessThanOrEqual(500);
}

function expectApprovalStateUntouched(artifact: unknown, adapter: { approvals?: unknown[]; createApprovalRequest?: ReturnType<typeof vi.fn> }) {
  const serialized = JSON.stringify(artifact);
  expect(serialized).not.toMatch(/native_approval_(request_id|status)/);
  expect(serialized).not.toMatch(/APPROVAL_REQUESTED|APPROVED_FOR_CYCLE/);
  expect(adapter.approvals ?? []).toHaveLength(0);
  if (adapter.createApprovalRequest) expect(adapter.createApprovalRequest).not.toHaveBeenCalled();
}

function acceptedDecision(overrides: Parameters<typeof decide>[0] = {}) {
  const decision = decide({
    issue_id: "issue_decision_1",
    signals: ["Routine batch approve request follows a known approval playbook"],
    confidence: 0.92,
    now: NOW,
    ...(overrides as Record<string, unknown>)
  });
  if (!decision.accepted) throw new Error("expected accepted decision fixture");
  return decision;
}

describe("Decision artifact envelope", () => {
  it("writes an accepted CLEAR decision to confirmed native documents first", async () => {
    const decision = acceptedDecision();
    const adapter = new InMemoryPaperclipAdapter();
    const persistence = new InMemoryBOSPersistence();

    const artifact = await persistDecisionArtifact(decision, {
      adapter,
      persistence,
      capabilities: { documents_native: "confirmed", comments_native: "unvalidated" },
      now: NOW
    });

    expect(adapter.documents).toHaveLength(1);
    expect(adapter.comments).toHaveLength(0);
    expect(persistence.decisions.get(decision.decision_id)).toEqual(decision);
    expect(artifact).toMatchObject({
      schema_version: "1.0",
      phase: "S02.decision_artifact",
      issue_id: "issue_decision_1",
      decision_id: decision.decision_id,
      selected_surface: "documents.native",
      artifact_id: "doc_1",
      artifact_ref: "paperclip://issues/issue_decision_1/documents/doc_1",
      decided_at: NOW,
      mirrored_at: NOW,
      cache_overlay: {
        durability: "cache-overlay-only",
        persistence: "provided",
        save: "saved",
        error: null,
        timestamp: NOW
      },
      fallback: { reason: null },
      invariants: {
        decided_by: "Div7.MissionControl",
        diagnostics_sanitized: true,
        native_approval_mutated: false
      }
    });
    expect(artifact.markdown).toBe(decision.record_markdown);
    expect(adapter.documents[0]).toMatchObject({
      issueId: decision.issue_id,
      title: `BOS Decision Record: ${decision.decision_id}`,
      markdown: decision.record_markdown
    });
  });

  it("falls back to native comments for accepted COMPLICATED decisions when documents are unvalidated", async () => {
    const decision = acceptedDecision({
      issue_id: "issue_policy_budget",
      signals: ["Policy rule review for a budget exception requires expert constraints"],
      confidence: 0.7
    });
    const adapter = new InMemoryPaperclipAdapter();

    const artifact = await persistDecisionArtifact(decision, {
      adapter,
      capabilities: { documents_native: "unvalidated", comments_native: "unvalidated" },
      now: NOW
    });

    expect(adapter.documents).toHaveLength(0);
    expect(adapter.comments).toHaveLength(1);
    expect(adapter.comments[0].markdown).toBe(decision.record_markdown);
    expect(artifact.selected_surface).toBe("comments.native");
    expect(artifact.artifact_id).toBe("comment_1");
    expect(artifact.artifact_ref).toBe("paperclip://issues/issue_policy_budget/comments/comment_1");
    expect(artifact.fallback.reason).toBe("documents.native:unvalidated");
    expect(artifact.markdown).toBe(decision.record_markdown);
  });

  it("records sanitized document write rejection and falls back to native comments", async () => {
    const decision = acceptedDecision();
    const adapter = new InMemoryPaperclipAdapter();
    vi.spyOn(adapter, "createIssueDocument").mockRejectedValue(SECRET_ERROR);

    const artifact = await persistDecisionArtifact(decision, {
      adapter,
      capabilities: { documents_native: "confirmed", comments_native: "unvalidated" },
      now: NOW
    });

    expect(adapter.documents).toHaveLength(0);
    expect(adapter.comments).toHaveLength(1);
    expect(artifact.selected_surface).toBe("comments.native");
    expect(artifact.fallback.reason).toBe("document_write_failed");
    expectSanitizedDiagnostic(artifact.fallback.document_error);
    expect(artifact.fallback.document_error).toContain("[REDACTED]");
    expect(JSON.stringify(artifact)).not.toContain(RAW_SECRET);
    expect(JSON.stringify(artifact)).not.toMatch(/\n\s+at\s/);
  });

  it("records malformed document responses and falls back to native comments", async () => {
    const decision = acceptedDecision();
    const adapter = new InMemoryPaperclipAdapter();
    vi.spyOn(adapter, "createIssueDocument").mockResolvedValue({ document_id: "   " });

    const artifact = await persistDecisionArtifact(decision, {
      adapter,
      capabilities: { documents_native: "confirmed", comments_native: "unvalidated" },
      now: NOW
    });

    expect(adapter.comments).toHaveLength(1);
    expect(artifact.selected_surface).toBe("comments.native");
    expect(artifact.fallback).toMatchObject({
      reason: "document_response_malformed",
      document_error: "createIssueDocument returned missing document_id"
    });
  });

  it("returns deterministic markdown-only artifacts when comments are unavailable after document failure", async () => {
    const decision = acceptedDecision();
    const adapter = {
      approvals: [] as unknown[],
      createIssueDocument: vi.fn().mockRejectedValue(SECRET_ERROR),
      createApprovalRequest: vi.fn()
    };

    const artifact = await persistDecisionArtifact(decision, {
      adapter,
      capabilities: { documents_native: "confirmed", comments_native: "unvalidated" },
      now: NOW
    });

    expect(artifact.selected_surface).toBe("markdown-only");
    expect(artifact.artifact_id).toBe(`markdown-only:${decision.issue_id}:decisions:${decision.decision_id}`);
    expect(artifact.artifact_ref).toBe(`markdown-only://issues/${decision.issue_id}/decisions/${decision.decision_id}`);
    expect(artifact.fallback.reason).toBe("comments.native:unavailable");
    expectSanitizedDiagnostic(artifact.fallback.document_error);
    expectSanitizedDiagnostic(artifact.fallback.comment_error);
    expect(JSON.stringify(artifact)).not.toContain(RAW_SECRET);
    expectApprovalStateUntouched(artifact, adapter);
  });

  it("returns markdown-only with sanitized diagnostics when comment writes are rejected", async () => {
    const decision = acceptedDecision();
    const adapter = new InMemoryPaperclipAdapter();
    const approvalSpy = vi.spyOn(adapter, "createApprovalRequest");
    vi.spyOn(adapter, "createIssueDocument").mockRejectedValue(new Error("document path down"));
    vi.spyOn(adapter, "addIssueComment").mockRejectedValue(SECRET_ERROR);

    const artifact = await persistDecisionArtifact(decision, {
      adapter,
      capabilities: { documents_native: "confirmed", comments_native: "unvalidated" },
      now: NOW
    });

    expect(artifact.selected_surface).toBe("markdown-only");
    expect(artifact.artifact_ref).toBe(`markdown-only://issues/${decision.issue_id}/decisions/${decision.decision_id}`);
    expect(artifact.fallback.reason).toBe("comment_write_failed");
    expect(artifact.fallback.document_error).toBe("document path down");
    expectSanitizedDiagnostic(artifact.fallback.comment_error);
    expect(artifact.fallback.comment_error).toContain("[REDACTED]");
    expect(JSON.stringify(artifact)).not.toContain(RAW_SECRET);
    expect(approvalSpy).not.toHaveBeenCalled();
    expect(adapter.approvals).toHaveLength(0);
  });

  it("returns markdown-only with sanitized diagnostics when comment responses are malformed", async () => {
    const decision = acceptedDecision();
    const adapter = new InMemoryPaperclipAdapter();
    vi.spyOn(adapter, "createIssueDocument").mockRejectedValue(new Error("document path down"));
    vi.spyOn(adapter, "addIssueComment").mockResolvedValue({ comment_id: "" });

    const artifact = await persistDecisionArtifact(decision, {
      adapter,
      capabilities: { documents_native: "confirmed", comments_native: "unvalidated" },
      now: NOW
    });

    expect(artifact.selected_surface).toBe("markdown-only");
    expect(artifact.artifact_id).toBe(`markdown-only:${decision.issue_id}:decisions:${decision.decision_id}`);
    expect(artifact.fallback).toMatchObject({
      reason: "comment_response_malformed",
      document_error: "document path down",
      comment_error: "addIssueComment returned missing comment_id"
    });
  });

  it("returns deterministic markdown-only artifacts when comment capability is explicitly unsupported", async () => {
    const decision = acceptedDecision();
    const adapter = {
      approvals: [] as unknown[],
      createIssueDocument: vi.fn().mockRejectedValue(new Error("document unavailable")),
      addIssueComment: vi.fn(),
      createApprovalRequest: vi.fn()
    };

    const artifact = await persistDecisionArtifact(decision, {
      adapter,
      capabilities: { documents_native: "confirmed", comments_native: "unsupported" },
      now: NOW
    });

    expect(adapter.addIssueComment).not.toHaveBeenCalled();
    expect(artifact.selected_surface).toBe("markdown-only");
    expect(artifact.fallback).toMatchObject({
      reason: "comments.native:unsupported",
      document_error: "document unavailable",
      comment_error: "comments.native posture is unsupported"
    });
    expectApprovalStateUntouched(artifact, adapter);
  });

  it("keeps cache-overlay failure diagnostics sanitized while still mirroring accepted markdown", async () => {
    const decision = acceptedDecision();
    const adapter = new InMemoryPaperclipAdapter();
    const persistence = new InMemoryBOSPersistence();
    vi.spyOn(persistence, "saveDecision").mockRejectedValue(SECRET_ERROR);

    const artifact = await persistDecisionArtifact(decision, {
      adapter,
      persistence,
      capabilities: { documents_native: "enabled" },
      now: NOW
    });

    expect(adapter.documents).toHaveLength(1);
    expect(artifact.selected_surface).toBe("documents.native");
    expect(artifact.cache_overlay).toMatchObject({
      durability: "cache-overlay-only",
      persistence: "provided",
      save: "failed",
      timestamp: NOW
    });
    expectSanitizedDiagnostic(artifact.cache_overlay.error);
    expect(artifact.cache_overlay.error).toContain("[REDACTED]");
    expect(JSON.stringify(artifact)).not.toContain(RAW_SECRET);
    expect(artifact.markdown).toBe(decision.record_markdown);
  });

  it("keeps invalid DecisionValidationFailure results markdown-only and does not call adapter or persistence", async () => {
    const decision = decide({
      issue_id: "",
      signals: [""],
      confidence: Number.NaN,
      now: NOW,
      secret: "decision-token-should-not-leak"
    });
    if (decision.accepted) throw new Error("expected validation failure fixture");
    const adapter = new InMemoryPaperclipAdapter();
    const persistence = new InMemoryBOSPersistence();
    const documentSpy = vi.spyOn(adapter, "createIssueDocument");
    const commentSpy = vi.spyOn(adapter, "addIssueComment");
    const saveSpy = vi.spyOn(persistence, "saveDecision");

    const artifact = await persistDecisionArtifact(decision, {
      adapter,
      persistence,
      capabilities: { documents_native: "confirmed", comments_native: "unvalidated" },
      now: NOW
    });

    expect(documentSpy).not.toHaveBeenCalled();
    expect(commentSpy).not.toHaveBeenCalled();
    expect(saveSpy).not.toHaveBeenCalled();
    expect(artifact.selected_surface).toBe("markdown-only");
    expect(artifact.artifact_ref).toBe("markdown-only://issues/missing/decisions/invalid");
    expect(artifact.cache_overlay.save).toBe("not_attempted");
    expect(artifact.fallback.reason).toBe("invalid_decision_input");
    expect(artifact.markdown).toContain("# BOS Decision Validation Failure");
    expect(artifact.markdown).toContain("- Diagnostics sanitized: true");
    expect(artifact.markdown).toContain("issue_id is required");
    expect(JSON.stringify(artifact)).not.toMatch(/decision-token|stack|\n\s+at\s/);
  });

  it("records cache-overlay failure diagnostics while still mirroring accepted markdown", async () => {
    const decision = acceptedDecision();
    const adapter = new InMemoryPaperclipAdapter();
    const persistence = new InMemoryBOSPersistence();
    vi.spyOn(persistence, "saveDecision").mockRejectedValue(new Error(`cache down ${"x".repeat(800)}`));

    const artifact = await persistDecisionArtifact(decision, {
      adapter,
      persistence,
      capabilities: { documents_native: "enabled" },
      now: NOW
    });

    expect(adapter.documents).toHaveLength(1);
    expect(artifact.selected_surface).toBe("documents.native");
    expect(artifact.cache_overlay.save).toBe("failed");
    expect(artifact.cache_overlay.error?.startsWith("cache down")).toBe(true);
    expect(artifact.cache_overlay.error?.length).toBeLessThanOrEqual(500);
    expect(artifact.markdown).toBe(decision.record_markdown);
  });

  it("never calls createApprovalRequest or mutates approval state from artifact fallbacks", async () => {
    const decision = acceptedDecision({
      issue_id: "issue_no_approval",
      signals: ["Policy rule review requires expert constraint"],
      confidence: 0.7
    });
    const adapter = new InMemoryPaperclipAdapter();
    const approvalSpy = vi.spyOn(adapter, "createApprovalRequest");
    vi.spyOn(adapter, "createIssueDocument").mockRejectedValue(new Error("document unavailable"));
    vi.spyOn(adapter, "addIssueComment").mockRejectedValue(new Error("comment unavailable"));

    const artifact = await persistDecisionArtifact(decision, {
      adapter,
      capabilities: { documents_native: "confirmed", comments_native: "unvalidated" },
      now: NOW
    });

    expect(approvalSpy).not.toHaveBeenCalled();
    expect(adapter.approvals).toHaveLength(0);
    expect(artifact.selected_surface).toBe("markdown-only");
    expect(artifact.artifact_ref).toBe(`markdown-only://issues/${decision.issue_id}/decisions/${decision.decision_id}`);
    expect(artifact.fallback).toMatchObject({
      reason: "comment_write_failed",
      document_error: "document unavailable",
      comment_error: "comment unavailable"
    });
    expect(artifact.invariants.native_approval_mutated).toBe(false);
  });
});
