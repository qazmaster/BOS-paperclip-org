import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  QAReview,
  reviewDiff,
  hashDiff,
  parseDiff,
  scanSecurity,
  runEvalGate,
  isApprovedForMerge,
  produceReviewArtifact,
  type ReviewCriteria,
} from "../src/qaReview";
import { InMemoryPaperclipAdapter } from "../src/paperclipAdapter";

describe("qaReview", () => {
  describe("hashDiff", () => {
    it("produces deterministic SHA-256 hash", () => {
      const diff = "+hello world\n-foo bar";
      const h1 = hashDiff(diff);
      const h2 = hashDiff(diff);
      expect(h1).toBe(h2);
      expect(h1).toHaveLength(64);
    });

    it("produces different hashes for different diffs", () => {
      const h1 = hashDiff("+hello");
      const h2 = hashDiff("+world");
      expect(h1).not.toBe(h2);
    });
  });

  describe("parseDiff", () => {
    it("parses git diff format", () => {
      const diff = `diff --git a/src/foo.ts b/src/foo.ts
+++ b/src/foo.ts
+line1
+line2
-line3
+line4`;
      const result = parseDiff(diff);
      expect(result.files_changed).toContain("src/foo.ts");
      expect(result.lines_added).toBe(3);
      expect(result.lines_removed).toBe(1);
    });

    it("parses multiple files", () => {
      const diff = `diff --git a/a.ts b/a.ts
+++ b/a.ts
+line

diff --git a/b.ts b/b.ts
+++ b/b.ts
+other`;
      const result = parseDiff(diff);
      expect(result.files_changed).toContain("a.ts");
      expect(result.files_changed).toContain("b.ts");
      expect(result.lines_added).toBe(2);
    });

    it("handles empty diff", () => {
      const result = parseDiff("");
      expect(result.files_changed).toEqual([]);
      expect(result.lines_added).toBe(0);
      expect(result.lines_removed).toBe(0);
    });
  });

  describe("scanSecurity", () => {
    it("detects hardcoded secrets", () => {
      const diff = `diff --git a/config.ts b/config.ts
+++ b/config.ts
+const apiKey = "sk-live-1234567890abcdef";`;
      const flags = scanSecurity(diff, ["config.ts"]);
      expect(flags.length).toBeGreaterThan(0);
      expect(flags.some((f) => f.category === "secret_leak")).toBe(true);
    });

    it("detects eval usage", () => {
      const diff = `diff --git a/app.ts b/app.ts
+++ b/app.ts
+eval(userInput);`;
      const flags = scanSecurity(diff, ["app.ts"]);
      expect(flags.some((f) => f.category === "injection")).toBe(true);
    });

    it("detects auth bypass", () => {
      const diff = `diff --git a/auth.ts b/auth.ts
+++ b/auth.ts
+skipAuth: true`;
      const flags = scanSecurity(diff, ["auth.ts"]);
      expect(flags.some((f) => f.category === "authorization")).toBe(true);
    });

    it("detects TODO comments", () => {
      const diff = `diff --git a/x.ts b/x.ts
+++ b/x.ts
+// TODO: fix this later`;
      const flags = scanSecurity(diff, ["x.ts"]);
      expect(flags.some((f) => f.category === "configuration")).toBe(true);
    });

    it("ignores unchanged lines", () => {
      const diff = `diff --git a/x.ts b/x.ts
+++ b/x.ts
 const password = "old";`;
      const flags = scanSecurity(diff, ["x.ts"]);
      expect(flags.every((f) => f.line === undefined || f.line === 0)).toBe(true);
    });
  });

  describe("reviewDiff", () => {
    it("produces a complete review envelope", () => {
      const diff = `diff --git a/src/index.ts b/src/index.ts
+++ b/src/index.ts
+console.log("hello");`;
      const envelope = reviewDiff(diff);
      expect(envelope.schema_version).toBe("1.0");
      expect(envelope.diff_hash).toHaveLength(64);
      expect(envelope.files_changed).toContain("src/index.ts");
      expect(envelope.lines_added).toBe(1);
      expect(envelope.reviewed_by).toBe("Div5.QualificationsLibraryLearning");
    });
  });

  describe("runEvalGate", () => {
    const passCriteria: ReviewCriteria[] = [
      {
        gate_id: "LARS.Deterministic",
        description: "Has output",
        is_blocking: true,
        check: (e) => e.lines_added > 0,
      },
      {
        gate_id: "LARS.SecurityPolicy",
        description: "No critical flags",
        is_blocking: true,
        check: (e) => !e.security_flags.some((f) => f.severity === "critical"),
      },
    ];

    it("returns PASSED when all blocking criteria pass", () => {
      const envelope = reviewDiff(`diff --git a/a.ts b/a.ts\n+++ b/a.ts\n+ok`);
      const result = runEvalGate(envelope, passCriteria);
      expect(result.overall).toBe("PASSED");
      expect(result.blocking_failure_count).toBe(0);
    });

    it("returns FAILED_BLOCKING when a blocking criterion fails", () => {
      const envelope = reviewDiff(`diff --git a/a.ts b/a.ts\n+++ b/a.ts\n+eval("bad")`);
      const result = runEvalGate(envelope, passCriteria);
      expect(result.overall).toBe("FAILED_BLOCKING");
      expect(result.blocking_failure_count).toBeGreaterThan(0);
    });

    it("returns PASSED_WITH_WARNINGS for non-blocking failures", () => {
      const warnCriteria: ReviewCriteria[] = [
        {
          gate_id: "LARS.Deterministic",
          description: "Has output",
          is_blocking: true,
          check: (e) => e.lines_added > 0,
        },
        {
          gate_id: "LARS.Budget",
          description: "Small change",
          is_blocking: false,
          check: (e) => e.lines_added > 1000,
        },
      ];
      const envelope = reviewDiff(`diff --git a/a.ts b/a.ts\n+++ b/a.ts\n+small`);
      const result = runEvalGate(envelope, warnCriteria);
      expect(result.overall).toBe("PASSED_WITH_WARNINGS");
      expect(result.warning_count).toBe(1);
    });
  });

  describe("isApprovedForMerge", () => {
    it("returns false for FAILED_BLOCKING", () => {
      const result = {
        schema_version: "1.0" as const,
        envelope: reviewDiff("+x"),
        eval_gate: runEvalGate(reviewDiff("+x"), [
          { gate_id: "LARS.Deterministic", description: "fail", is_blocking: true, check: () => false },
        ]),
        approved_for_merge: false,
      };
      expect(isApprovedForMerge(result)).toBe(false);
    });

    it("returns false when critical security flags exist", () => {
      const envelope = reviewDiff(`diff --git a/a.ts b/a.ts\n+++ b/a.ts\n+eval("bad")`);
      const result = {
        schema_version: "1.0" as const,
        envelope,
        eval_gate: runEvalGate(envelope, [
          { gate_id: "LARS.Deterministic", description: "pass", is_blocking: true, check: () => true },
        ]),
        approved_for_merge: false,
      };
      expect(isApprovedForMerge(result)).toBe(false);
    });

    it("returns true for PASSED with no critical flags", () => {
      const envelope = reviewDiff(`diff --git a/a.ts b/a.ts\n+++ b/a.ts\n+console.log("ok")`);
      const result = {
        schema_version: "1.0" as const,
        envelope,
        eval_gate: runEvalGate(envelope, [
          { gate_id: "LARS.Deterministic", description: "pass", is_blocking: true, check: () => true },
        ]),
        approved_for_merge: false,
      };
      expect(isApprovedForMerge(result)).toBe(true);
    });
  });

  describe("produceReviewArtifact", () => {
    it("creates a document artifact", async () => {
      const adapter = new InMemoryPaperclipAdapter();
      const envelope = reviewDiff(`diff --git a/a.ts b/a.ts\n+++ b/a.ts\n+ok`);
      const result = {
        schema_version: "1.0" as const,
        envelope,
        eval_gate: runEvalGate(envelope, [
          { gate_id: "LARS.Deterministic", description: "pass", is_blocking: true, check: () => true },
        ]),
        approved_for_merge: true,
      };
      const artifact = await produceReviewArtifact(result, "issue-1", adapter);
      expect(artifact.artifact_type).toBe("document");
      expect(adapter.documents.length).toBe(1);
    });

    it("falls back to comment on document failure", async () => {
      const adapter = new InMemoryPaperclipAdapter();
      adapter.createIssueDocument = vi.fn().mockRejectedValue(new Error("fail"));
      const envelope = reviewDiff(`diff --git a/a.ts b/a.ts\n+++ b/a.ts\n+ok`);
      const result = {
        schema_version: "1.0" as const,
        envelope,
        eval_gate: runEvalGate(envelope, [
          { gate_id: "LARS.Deterministic", description: "pass", is_blocking: true, check: () => true },
        ]),
        approved_for_merge: true,
      };
      const artifact = await produceReviewArtifact(result, "issue-1", adapter);
      expect(artifact.artifact_type).toBe("comment");
      expect(adapter.comments.length).toBe(1);
    });
  });

  describe("QAReview class", () => {
    let adapter: InMemoryPaperclipAdapter;
    let qa: QAReview;

    beforeEach(() => {
      adapter = new InMemoryPaperclipAdapter();
      qa = new QAReview(adapter);
    });

    it("performs full review end-to-end", () => {
      const criteria: ReviewCriteria[] = [
        {
          gate_id: "LARS.Deterministic",
          description: "Has output",
          is_blocking: true,
          check: (e) => e.lines_added > 0,
        },
      ];
      const result = qa.fullReview(`diff --git a/a.ts b/a.ts\n+++ b/a.ts\n+ok`, criteria);
      expect(result.envelope.lines_added).toBe(1);
      expect(result.eval_gate.overall).toBe("PASSED");
      expect(result.approved_for_merge).toBe(true);
    });

    it("produces artifact via class method", async () => {
      const criteria: ReviewCriteria[] = [
        { gate_id: "LARS.Deterministic", description: "pass", is_blocking: true, check: () => true },
      ];
      const result = qa.fullReview(`diff --git a/a.ts b/a.ts\n+++ b/a.ts\n+ok`, criteria);
      const artifact = await qa.produceReviewArtifact(result, "issue-2");
      expect(artifact.artifact_type).toBe("document");
    });
  });
});
