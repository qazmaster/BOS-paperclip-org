import { describe, expect, it, vi } from "vitest";
import { createProductBlueprintArtifact } from "../src/blueprintArtifact";
import type { BlueprintInput } from "../src/blueprint";
import type { BPIScore } from "../src/contracts";
import { InMemoryPaperclipAdapter } from "../src/paperclipAdapter";

const NOW = "2026-05-28T00:00:00.000Z";

type BPIScoreOverrides = Partial<Omit<BPIScore, "components" | "hard_gates">> & {
  components?: Partial<BPIScore["components"]>;
  hard_gates?: Partial<BPIScore["hard_gates"]>;
};

function bpi(overrides: BPIScoreOverrides = {}): BPIScore {
  const base: BPIScore = {
    schema_version: "1.0",
    score: 0.7,
    formula: "bpi_v1.0",
    components: {
      expected_value: 0.7,
      urgency: 0.8,
      estimated_token_cost: 1000,
      risk_factor: 1,
      company_token_budget_ref: 10000
    },
    hard_gates: {
      strategic_weight_passed: true,
      budget_snapshot_available: true,
      acceptance_inputs_present: true,
      policy_precheck_passed: true,
      security_precheck_passed: true
    },
    scored_by: "Div2.MasterPlanner",
    scored_at: NOW,
    source_issue_id: "issue_1"
  };

  return {
    ...base,
    ...overrides,
    components: { ...base.components, ...overrides.components },
    hard_gates: { ...base.hard_gates, ...overrides.hard_gates }
  };
}

function blueprint(overrides: Partial<BlueprintInput> = {}): BlueprintInput {
  return {
    issue_id: "issue_1",
    title: "Seeded opportunity",
    problem_statement: "Customer cannot complete onboarding.",
    producer_division: "Div3.Production",
    bpi: bpi(),
    acceptance_criteria: ["User can finish onboarding"],
    resources: ["Paperclip seeded issue"],
    ...overrides
  };
}

describe("Product Blueprint artifact flow", () => {
  it("writes a confirmed native document first and returns its stable reference", async () => {
    const adapter = new InMemoryPaperclipAdapter();

    const artifact = await createProductBlueprintArtifact({
      adapter,
      blueprint: blueprint(),
      capabilities: { documents_native: "confirmed", comments_native: "unvalidated" },
      now: NOW
    });

    expect(adapter.documents).toHaveLength(1);
    expect(adapter.comments).toHaveLength(0);
    expect(artifact.artifact_id).toBe("doc_1");
    expect(artifact.artifact_ref).toBe("paperclip://issues/issue_1/documents/doc_1");
    expect(artifact.selected_surface).toBe("documents.native");
    expect(artifact.mirrored_at).toBe(NOW);
    expect(artifact.fallback.reason).toBeNull();
  });

  it("falls back to a comment when document support is unvalidated", async () => {
    const adapter = new InMemoryPaperclipAdapter();

    const artifact = await createProductBlueprintArtifact({
      adapter,
      blueprint: blueprint(),
      capabilities: { documents_native: "unvalidated", comments_native: "unvalidated" },
      now: NOW
    });

    expect(adapter.documents).toHaveLength(0);
    expect(adapter.comments).toHaveLength(1);
    expect(artifact.artifact_id).toBe("comment_1");
    expect(artifact.artifact_ref).toBe("paperclip://issues/issue_1/comments/comment_1");
    expect(artifact.selected_surface).toBe("comments.native");
    expect(artifact.fallback.reason).toBe("documents.native:unvalidated");
  });

  it("falls back to a comment and records diagnostics when document creation fails", async () => {
    const adapter = new InMemoryPaperclipAdapter();
    vi.spyOn(adapter, "createIssueDocument").mockRejectedValue(new Error("document API unavailable"));

    const artifact = await createProductBlueprintArtifact({
      adapter,
      blueprint: blueprint(),
      capabilities: { documents_native: "confirmed", comments_native: "unvalidated" },
      now: NOW
    });

    expect(adapter.documents).toHaveLength(0);
    expect(adapter.comments).toHaveLength(1);
    expect(artifact.selected_surface).toBe("comments.native");
    expect(artifact.fallback.reason).toBe("document_write_failed");
    expect(artifact.fallback.document_error).toBe("document API unavailable");
  });

  it("returns markdown-only fallback when all adapter writes fail", async () => {
    const adapter = new InMemoryPaperclipAdapter();
    vi.spyOn(adapter, "createIssueDocument").mockRejectedValue(new Error("document down"));
    vi.spyOn(adapter, "addIssueComment").mockRejectedValue(new Error("comment down"));

    const artifact = await createProductBlueprintArtifact({
      adapter,
      blueprint: blueprint(),
      capabilities: { documents_native: "enabled", comments_native: "unvalidated" },
      now: NOW
    });

    expect(artifact.artifact_id).toBe("markdown-only:issue_1:product-blueprint");
    expect(artifact.artifact_ref).toBe("markdown-only://issues/issue_1/product-blueprint");
    expect(artifact.selected_surface).toBe("markdown-only");
    expect(artifact.fallback.reason).toBe("comment_write_failed");
    expect(artifact.fallback.document_error).toBe("document down");
    expect(artifact.fallback.comment_error).toBe("comment down");
  });

  it("preserves the five required Product Blueprint sections as inert markdown content", async () => {
    const adapter = new InMemoryPaperclipAdapter();

    const artifact = await createProductBlueprintArtifact({
      adapter,
      blueprint: blueprint({
        problem_statement: "Untrusted issue text: <script>alert('owned')</script>"
      }),
      capabilities: { documents_native: "confirmed" },
      now: NOW
    });

    expect(artifact.markdown).toContain("## 1. Identity");
    expect(artifact.markdown).toContain("## 2. BPI");
    expect(artifact.markdown).toContain("## 3. Acceptance Contract");
    expect(artifact.markdown).toContain("## 4. Resources");
    expect(artifact.markdown).toContain("## 5. QA Policy");
    expect(artifact.markdown).toContain("Untrusted issue text: <script>alert('owned')</script>");
  });

  it("hard-gates incompatible scores without writing adapter artifacts", async () => {
    const adapter = new InMemoryPaperclipAdapter();

    const artifact = await createProductBlueprintArtifact({
      adapter,
      blueprint: blueprint({
        bpi: bpi({ hard_gates: { acceptance_inputs_present: false }, score: 0 })
      }),
      capabilities: { documents_native: "confirmed", comments_native: "unvalidated" },
      now: NOW
    });

    expect(adapter.documents).toHaveLength(0);
    expect(adapter.comments).toHaveLength(0);
    expect(artifact.selected_surface).toBe("markdown-only");
    expect(artifact.fallback.reason).toBe("hard_gate_failed:acceptance_inputs_present");
  });

  it("keeps incomplete acceptance or resources as markdown-only diagnostics", async () => {
    const adapter = new InMemoryPaperclipAdapter();

    const artifact = await createProductBlueprintArtifact({
      adapter,
      blueprint: blueprint({ acceptance_criteria: [], resources: [] }),
      capabilities: { documents_native: "confirmed", comments_native: "unvalidated" },
      now: NOW
    });

    expect(adapter.documents).toHaveLength(0);
    expect(adapter.comments).toHaveLength(0);
    expect(artifact.selected_surface).toBe("markdown-only");
    expect(artifact.fallback.reason).toBe("incomplete_blueprint_inputs");
    expect(artifact.markdown).toContain("TODO: define acceptance criteria before production");
    expect(artifact.markdown).toContain("No special resources declared");
  });
});
