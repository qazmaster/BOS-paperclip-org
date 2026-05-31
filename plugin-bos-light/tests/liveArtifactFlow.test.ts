import { describe, expect, it } from "vitest";
import { runLiveArtifactFlow } from "../src/liveArtifactFlow";
import { LivePaperclipApiError, LivePaperclipIssueAdapter, type LivePaperclipFetch } from "../src/livePaperclipAdapter";
import type { SeededIssueBPIInput, SeededIssueFields } from "../src/issueBlueprintFlow";

const NOW = "2026-05-29T00:00:00.000Z";

function issue(overrides: Partial<SeededIssueFields> = {}): SeededIssueFields {
  return {
    issue_id: "issue_1",
    title: "Paperclip-visible BOS artifact flow",
    problem_statement: "Operator needs bounded BOS Light artifacts on one issue.",
    producer_division: "Div4.Production",
    acceptance_criteria: ["BPI, Blueprint, Betting Table, Eval Gate, and Circuit Breaker evidence are visible"],
    resources: ["Sandbox Paperclip issue"],
    qa_policy: ["Do not execute Hermes or GSD-Pi adapters while blockers are active"],
    ...overrides
  };
}

function bpi(overrides: Partial<SeededIssueBPIInput> = {}): SeededIssueBPIInput {
  return {
    expected_value: 0.8,
    urgency: 0.9,
    estimated_token_cost: 1_000,
    risk_factor: 1,
    company_token_budget_ref: 10_000,
    hard_gates: {
      strategic_weight_passed: true,
      budget_snapshot_available: true,
      acceptance_inputs_present: true,
      policy_precheck_passed: true,
      security_precheck_passed: true
    },
    ...overrides
  };
}

function guards() {
  return {
    hermes: {
      status: "blocked" as const,
      reason: "S02 Hermes agent-smoke blocked on /paperclip/.hermes/cron permissions",
      evidence_ref: "M002/S02/T03"
    },
    gsd_pi: {
      status: "unvalidated" as const,
      reason: "S03 GSD-Pi adapter no-go until live execution proof exists",
      evidence_ref: "M002/S03"
    }
  };
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => typeof body === "string" ? body : JSON.stringify(body)
  };
}

function routedFetch(routes: Array<{ includes: string; status?: number; body: unknown }>): LivePaperclipFetch {
  return async (url) => {
    const route = routes.find((candidate) => url.includes(candidate.includes));
    if (!route) throw new Error(`unexpected url ${url}`);
    return jsonResponse(route.status ?? 200, route.body);
  };
}

function liveAdapter(fetch: LivePaperclipFetch, timeoutMs = 25): LivePaperclipIssueAdapter {
  return new LivePaperclipIssueAdapter({
    fetch,
    baseUrl: "https://paperclip.example",
    companyId: "company_1",
    issueId: "issue_1",
    headers: {
      authorization: "Bearer should-never-be-recorded",
      "x-request-id": "test-run"
    },
    timeoutMs
  });
}

describe("Live Paperclip artifact flow", () => {
  it("writes a native document plus native comments through the injected Paperclip adapter", async () => {
    const adapter = liveAdapter(routedFetch([
      { includes: "/documents", body: { document_id: "doc_blueprint_opaque_123" } },
      { includes: "/comments", body: { comment_id: "comment_visible_1" } }
    ]));

    const result = await runLiveArtifactFlow({
      issue: issue(),
      bpi: bpi(),
      adapter,
      no_go_guards: guards(),
      now: NOW,
      runtime: { version: "paperclip-sandbox", build: "build-1" }
    });

    expect(result.blueprint.artifact.selected_surface).toBe("documents.native");
    expect(result.bundle.selected_surfaces.blueprint).toBe("documents.native");
    expect(result.bundle.selected_surfaces.betting_approval).toBe("comments.native");
    expect(result.bundle.selected_surfaces.eval_gate).toBe("comments.native");
    expect(result.bundle.artifact_refs.blueprint).toBe("paperclip://issues/issue_1/documents/doc_blueprint_opaque_123");
    expect(result.bundle.side_effect_counts.documents_created).toBe(1);
    expect(result.bundle.side_effect_counts.comments_created).toBe(2);
    expect(result.bundle.side_effect_counts.approval_requests_created).toBe(0);
    expect(result.bundle.runtime.version).toBe("paperclip-sandbox");
  });

  it("falls back from failed document creation to a comment with bounded diagnostics", async () => {
    const adapter = liveAdapter(routedFetch([
      { includes: "/documents", status: 500, body: { error: `document API down ${"x".repeat(900)}` } },
      { includes: "/comments", body: { comment_id: "comment_after_doc_failure" } }
    ]));

    const result = await runLiveArtifactFlow({
      issue: issue(),
      bpi: bpi(),
      adapter,
      no_go_guards: guards(),
      now: NOW
    });

    expect(result.blueprint.artifact.selected_surface).toBe("comments.native");
    expect(result.blueprint.artifact.fallback.reason).toBe("document_write_failed");
    expect(result.bundle.adapter_diagnostics[0].phase).toBe("documents.native");
    expect(result.bundle.adapter_diagnostics[0].status_code).toBe(500);
    expect(result.bundle.adapter_diagnostics[0].bounded_response_text?.length).toBeLessThanOrEqual(500);
    expect(result.bundle.side_effect_counts.documents_created).toBe(0);
    expect(result.bundle.side_effect_counts.comments_created).toBe(3);
  });

  it("keeps approval requests fail-closed unless a validated native approval API is injected", async () => {
    const adapter = liveAdapter(routedFetch([
      { includes: "/documents", body: { document_id: "doc_1" } },
      { includes: "/comments", body: { comment_id: "comment_1" } }
    ]));

    const result = await runLiveArtifactFlow({
      issue: issue(),
      bpi: bpi(),
      adapter,
      no_go_guards: guards(),
      now: NOW
    });

    expect(result.betting_approval.selected_surface).toBe("comments.native");
    expect(result.betting_approval.native_approval_request_id).toBeNull();
    expect(result.betting_approval.native_approval_status).toBeNull();
    expect(result.betting_approval.updated_rows[0].status).toBe("CANDIDATE");
    expect(result.bundle.adapter_diagnostics.some((diagnostic) => diagnostic.phase === "approvals.native" && diagnostic.message === "approvals.native:unvalidated")).toBe(true);
    expect(result.bundle.side_effect_counts.approval_requests_created).toBe(0);
  });

  it("propagates Hermes and GSD-Pi no-go guards without attempting either execution surface", async () => {
    const adapter = liveAdapter(routedFetch([
      { includes: "/documents", body: { document_id: "doc_1" } },
      { includes: "/comments", body: { comment_id: "comment_1" } }
    ]));

    const result = await runLiveArtifactFlow({
      issue: issue(),
      bpi: bpi(),
      adapter,
      no_go_guards: guards(),
      now: NOW
    });

    expect(result.bundle.no_go_guards.hermes.no_go).toBe(true);
    expect(result.bundle.no_go_guards.hermes.execution_allowed).toBe(false);
    expect(result.bundle.no_go_guards.gsd_pi.no_go).toBe(true);
    expect(result.bundle.invariants.hermes_execution_attempted).toBe(false);
    expect(result.bundle.invariants.gsd_pi_execution_attempted).toBe(false);
  });

  it("redacts secret-looking diagnostics from Paperclip API failures", async () => {
    const adapter = liveAdapter(routedFetch([
      {
        includes: "/documents",
        status: 401,
        body: "unauthorized Bearer super-secret-token-value api_key=sk_live_should_not_leak token=abc123secret"
      },
      { includes: "/comments", body: { comment_id: "comment_after_401" } }
    ]));

    const result = await runLiveArtifactFlow({
      issue: issue(),
      bpi: bpi(),
      adapter,
      no_go_guards: guards(),
      now: NOW
    });

    const diagnostics = JSON.stringify(result.bundle.adapter_diagnostics);
    expect(diagnostics).toContain("[REDACTED]");
    expect(diagnostics).not.toContain("super-secret-token-value");
    expect(diagnostics).not.toContain("sk_live_should_not_leak");
    expect(result.bundle.invariants.no_secret_diagnostics).toBe(true);
  });

  it("preserves opaque blueprint references in betting rows instead of reinterpreting them", async () => {
    const adapter = liveAdapter(routedFetch([
      { includes: "/documents", body: { document_id: "opaque-blueprint-id:Div3#123" } },
      { includes: "/comments", body: { comment_id: "comment_1" } }
    ]));

    const result = await runLiveArtifactFlow({
      issue: issue(),
      bpi: bpi(),
      adapter,
      no_go_guards: guards(),
      now: NOW
    });

    expect(result.betting_cycle.items[0].blueprint_id).toBe("paperclip://issues/issue_1/documents/opaque-blueprint-id:Div3#123");
  });

  it("returns markdown-only when document and comment fallbacks both fail", async () => {
    const adapter = liveAdapter(routedFetch([
      { includes: "/documents", status: 403, body: { error: "forbidden document surface" } },
      { includes: "/comments", status: 503, body: { error: "comment service unavailable" } }
    ]));

    const result = await runLiveArtifactFlow({
      issue: issue(),
      bpi: bpi(),
      adapter,
      no_go_guards: guards(),
      now: NOW
    });

    expect(result.blueprint.artifact.selected_surface).toBe("markdown-only");
    expect(result.blueprint.artifact.fallback.reason).toBe("comment_write_failed");
    expect(result.betting_approval.selected_surface).toBe("markdown-only");
    expect(result.eval_gate.selected_surface).toBe("markdown-only");
    expect(result.bundle.adapter_diagnostics.some((diagnostic) => diagnostic.status_code === 403)).toBe(true);
    expect(result.bundle.adapter_diagnostics.some((diagnostic) => diagnostic.status_code === 503)).toBe(true);
  });
});

describe("LivePaperclipIssueAdapter negative API handling", () => {
  it("fails closed on malformed JSON readback", async () => {
    const adapter = liveAdapter(async () => ({
      ok: true,
      status: 200,
      text: async () => "{not-json"
    }));

    await expect(adapter.createIssueDocument("issue_1", "Title", "Body")).rejects.toBeInstanceOf(LivePaperclipApiError);
    expect(adapter.getDiagnostics()[0]).toMatchObject({
      phase: "documents.native",
      status_code: 200,
      fallback_used: true,
      message: "Paperclip API returned malformed JSON"
    });
    expect(adapter.getDiagnostics()[0].malformed_json_reason).toBeTruthy();
  });

  it("fails closed when a success response omits the document id", async () => {
    const adapter = liveAdapter(routedFetch([
      { includes: "/documents", body: { document: { title: "missing id" } } }
    ]));

    await expect(adapter.createIssueDocument("issue_1", "Title", "Body")).rejects.toThrow("missing document_id");
    expect(adapter.getDiagnostics()[0].bounded_response_text).toContain("missing id");
  });

  it("records timeout diagnostics without retrying unboundedly", async () => {
    const adapter = liveAdapter(async () => new Promise(() => undefined), 1);

    await expect(adapter.addIssueComment("issue_1", "Body")).rejects.toBeInstanceOf(LivePaperclipApiError);
    expect(adapter.getDiagnostics()[0]).toMatchObject({
      phase: "comments.native",
      status_code: null,
      timeout_ms: 1,
      fallback_used: true
    });
  });
});
