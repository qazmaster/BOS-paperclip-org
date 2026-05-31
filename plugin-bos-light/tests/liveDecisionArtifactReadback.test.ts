import { describe, expect, it, vi } from "vitest";
import { decide } from "../src/decision";
import { persistDecisionArtifact } from "../src/decisionArtifact";
import { readbackDecisionArtifactEnvelope } from "../src/liveDecisionArtifactReadback";
import { InMemoryPaperclipAdapter } from "../src/paperclipAdapter";

const NOW = "2026-05-31T00:00:00.000Z";
const RAW_SECRET = "raw-token-secret-1234567890";

function acceptedDecision(issue_id = "issue_decision_readback") {
  const decision = decide({
    issue_id,
    signals: ["Routine batch approve request follows a known approval playbook"],
    confidence: 0.92,
    now: NOW
  });
  if (!decision.accepted) throw new Error("expected accepted decision fixture");
  return decision;
}

async function documentArtifact() {
  const adapter = new InMemoryPaperclipAdapter();
  const decision = acceptedDecision();
  const artifact = await persistDecisionArtifact(decision, {
    adapter,
    capabilities: { documents_native: "confirmed", comments_native: "unvalidated" },
    now: NOW
  });
  return { artifact, markdown: decision.record_markdown };
}

async function commentArtifact() {
  const adapter = new InMemoryPaperclipAdapter();
  const decision = acceptedDecision("issue_comment_readback");
  const artifact = await persistDecisionArtifact(decision, {
    adapter,
    capabilities: { documents_native: "unsupported", comments_native: "unvalidated" },
    now: NOW
  });
  return { artifact, markdown: decision.record_markdown };
}

function okJson(payload: unknown) {
  return { ok: true, status: 200, text: async () => JSON.stringify(payload) };
}

function expectNoApprovalMutation(value: unknown, fetch: ReturnType<typeof vi.fn>) {
  expect(JSON.stringify(value)).toContain('"native_approval_mutated":false');
  expect(fetch.mock.calls.every((call) => call[1]?.method === "GET")).toBe(true);
}

describe("live decision artifact readback", () => {
  it("reads back a native document artifact and computes a matching sha256", async () => {
    const { artifact, markdown } = await documentArtifact();
    const fetch = vi.fn().mockResolvedValue(okJson({ document: { id: artifact.artifact_id, markdown } }));

    const result = await readbackDecisionArtifactEnvelope(artifact, {
      fetch,
      baseUrl: "https://paperclip.example",
      companyId: "company-1"
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://paperclip.example/api/companies/company-1/issues/issue_decision_readback/documents/doc_1",
      { method: "GET", headers: { accept: "application/json" } }
    );
    expect(result).toMatchObject({
      schema_version: "live-decision-artifact-readback/v1",
      selected_surface: "documents.native",
      status: "matched",
      live_proof: true,
      artifact_id: "doc_1",
      issue_id: "issue_decision_readback",
      expected_sha256: result.sha256,
      invariants: {
        decided_by: "Div7.MissionControl",
        diagnostics_sanitized: true,
        native_approval_mutated: false
      }
    });
    expect(result.snippet).toContain("# BOS Decision Record");
    expectNoApprovalMutation(result, fetch);
  });

  it("reads back a native comment artifact through a configured path", async () => {
    const { artifact, markdown } = await commentArtifact();
    const fetch = vi.fn().mockResolvedValue(okJson({ data: { body: markdown } }));

    const result = await readbackDecisionArtifactEnvelope(artifact, {
      fetch,
      baseUrl: "https://paperclip.example",
      companyId: "company-1",
      paths: {
        readIssueComment: ({ issueId, artifactId }) => `/api/issues/${issueId}/comments/${artifactId}`
      }
    });

    expect(fetch.mock.calls[0][0]).toBe("https://paperclip.example/api/issues/issue_comment_readback/comments/comment_1");
    expect(result.status).toBe("matched");
    expect(result.selected_surface).toBe("comments.native");
    expect(result.live_proof).toBe(true);
  });

  it("treats markdown-only refs as fail-closed handoff evidence without network access", async () => {
    const adapter = new InMemoryPaperclipAdapter();
    const decision = acceptedDecision("issue_markdown_only");
    const artifact = await persistDecisionArtifact(decision, {
      adapter,
      capabilities: { documents_native: "unsupported", comments_native: "unsupported" },
      now: NOW
    });
    const fetch = vi.fn();

    const result = await readbackDecisionArtifactEnvelope(artifact, {
      fetch,
      baseUrl: "https://paperclip.example",
      companyId: "company-1"
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "fail-closed", live_proof: false, artifact_ref: artifact.artifact_ref });
    expect(result.diagnostics[0].message).toContain("markdown-only artifact ref");
  });

  it("returns denied diagnostics for inaccessible native artifacts", async () => {
    const { artifact } = await documentArtifact();
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => `Authorization: Bearer ${RAW_SECRET}` });

    const result = await readbackDecisionArtifactEnvelope(artifact, {
      fetch,
      baseUrl: "https://paperclip.example",
      companyId: "company-1"
    });

    expect(result.status).toBe("denied");
    expect(result.live_proof).toBe(false);
    expect(JSON.stringify(result)).not.toContain(RAW_SECRET);
    expect(JSON.stringify(result)).toContain("[REDACTED]");
  });

  it("records malformed JSON without leaking response secrets", async () => {
    const { artifact } = await documentArtifact();
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => `{bad token=${RAW_SECRET}` });

    const result = await readbackDecisionArtifactEnvelope(artifact, {
      fetch,
      baseUrl: "https://paperclip.example",
      companyId: "company-1"
    });

    expect(result.status).toBe("malformed");
    expect(result.diagnostics[0].malformed_json_reason).toEqual(expect.any(String));
    expect(JSON.stringify(result)).not.toContain(RAW_SECRET);
  });

  it("returns mismatch when readback content hash differs from the envelope markdown", async () => {
    const { artifact } = await documentArtifact();
    const fetch = vi.fn().mockResolvedValue(okJson({ body: "# Different decision text" }));

    const result = await readbackDecisionArtifactEnvelope(artifact, {
      fetch,
      baseUrl: "https://paperclip.example",
      companyId: "company-1"
    });

    expect(result.status).toBe("mismatch");
    expect(result.live_proof).toBe(false);
    expect(result.sha256).not.toBe(result.expected_sha256);
  });

  it("rejects unsafe refs before issuing any request", async () => {
    const { artifact } = await documentArtifact();
    const unsafe = {
      ...artifact,
      artifact_id: "doc_1",
      artifact_ref: "paperclip://issues/../documents/doc_1"
    };
    const fetch = vi.fn();

    const result = await readbackDecisionArtifactEnvelope(unsafe, {
      fetch,
      baseUrl: "https://paperclip.example",
      companyId: "company-1"
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(result.status).toBe("unsafe-ref");
    expect(result.live_proof).toBe(false);
  });

  it("rejects unsupported native-looking ref shapes without approval mutation", async () => {
    const { artifact } = await documentArtifact();
    const unsupported = {
      ...artifact,
      artifact_ref: "paperclip://issues/issue_decision_readback/approvals/approval_1"
    };
    const fetch = vi.fn();

    const result = await readbackDecisionArtifactEnvelope(unsupported, {
      fetch,
      baseUrl: "https://paperclip.example",
      companyId: "company-1"
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(result.status).toBe("unsupported-ref");
    expectNoApprovalMutation(result, fetch);
  });
});
