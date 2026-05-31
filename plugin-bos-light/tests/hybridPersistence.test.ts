import { describe, it, expect, beforeEach } from "vitest";
import { DefaultHybridBOSPersistence } from "../src/hybridPersistence";
import { InMemoryPaperclipAdapter } from "../src/paperclipAdapter";
import type {
  BPIScore,
  BosStatusOverlay,
  BettingTableItem,
  EvalGateResult,
  CircuitBreakerRecord,
  DecisionMetadata,
  BosStatus,
} from "../src/contracts";

describe("DefaultHybridBOSPersistence", () => {
  let adapter: InMemoryPaperclipAdapter;
  let persistence: DefaultHybridBOSPersistence;

  beforeEach(() => {
    adapter = new InMemoryPaperclipAdapter();
    persistence = new DefaultHybridBOSPersistence(adapter);
  });

  function makeBPI(issueId: string): BPIScore {
    return {
      schema_version: "1.0",
      score: 0.85,
      formula: "bpi_v1.0",
      components: {
        expected_value: 1000,
        urgency: 0.9,
        estimated_token_cost: 50000,
        risk_factor: 0.2,
        company_token_budget_ref: 100000,
      },
      hard_gates: {
        strategic_weight_passed: true,
        budget_snapshot_available: true,
        acceptance_inputs_present: true,
        policy_precheck_passed: true,
        security_precheck_passed: true,
      },
      scored_by: "Div2.MasterPlanner",
      scored_at: new Date().toISOString(),
      source_issue_id: issueId,
    };
  }

  function makeStatus(issueId: string): BosStatusOverlay {
    return {
      schema_version: "1.0",
      issue_id: issueId,
      bos_status: "TRIAGED" as BosStatus,
      producer_division: "Div4.Production",
      blueprint_id: null,
      bpi_score: 0.85,
      updated_at: new Date().toISOString(),
    };
  }

  function makeBettingItems(cycleId: string): BettingTableItem[] {
    return [
      {
        schema_version: "1.0",
        cycle_id: cycleId,
        issue_id: "issue-1",
        bpi_score: 0.9,
        blueprint_id: "bp-1",
        status: "CANDIDATE",
        native_approval_request_id: null,
        native_approval_status: null,
        approved_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
  }

  function makeGateResult(issueId: string): EvalGateResult {
    return {
      schema_version: "1.0",
      issue_id: issueId,
      run_id: "run-1",
      gates: [
        { gate_id: "LARS.Deterministic", status: "PASSED", evidence: "ok", is_blocking: true },
        { gate_id: "LARS.SecurityPolicy", status: "FAILED", evidence: null, is_blocking: true },
      ],
      overall: "FAILED_BLOCKING",
      blocking_failure_count: 1,
      warning_count: 0,
      not_run_count: 0,
      evaluated_at: new Date().toISOString(),
      evaluated_by: "Div5.QualificationsLibraryLearning",
    };
  }

  function makeCircuitBreaker(issueId: string): CircuitBreakerRecord {
    return {
      schema_version: "1.0",
      issue_id: issueId,
      state: "CLOSED",
      attempt_count: 0,
      max_attempts: 3,
      half_open_threshold: 1,
      last_failure_at: null,
      last_failure_reason: null,
      opened_at: null,
      escalation_issue_id: null,
      updated_at: new Date().toISOString(),
    };
  }

  function makeDecision(issueId: string): DecisionMetadata {
    return {
      schema_version: "1.0",
      accepted: true,
      decision_id: "dec-1",
      issue_id: issueId,
      cynefin_domain: "COMPLICATED",
      confidence: 0.92,
      risk_tier: "MEDIUM",
      record_detail: "compact",
      decision_type: "BATCH_APPROVAL",
      emitted_events: [],
      recommended_action: "approve batch",
      decided_by: "Div7.MissionControl",
      decided_at: new Date().toISOString(),
      diagnostics: {
        domain_evidence: [],
        selected_domain_reasons: [],
        risk_reasons: [],
        validation_errors: [],
        uncertainty_reasons: [],
        sanitized: true,
      },
      record_markdown: "# Decision\napprove",
    };
  }

  describe("mirror success", () => {
    it("mirrors BPI to document artifact", async () => {
      const bpi = makeBPI("issue-1");
      await persistence.saveBPI(bpi);
      await new Promise((r) => setTimeout(r, 50));
      expect(adapter.documents.length).toBe(1);
      expect(adapter.documents[0].issueId).toBe("issue-1");
      expect(adapter.documents[0].title).toContain("BPI Score");
    });

    it("mirrors status to comment artifact", async () => {
      const status = makeStatus("issue-2");
      await persistence.saveStatus(status);
      await new Promise((r) => setTimeout(r, 50));
      expect(adapter.comments.length).toBe(1);
      expect(adapter.comments[0].issueId).toBe("issue-2");
      expect(adapter.comments[0].markdown).toContain("BOS Status Update");
    });

    it("mirrors betting table to document artifact", async () => {
      const items = makeBettingItems("cycle-1");
      await persistence.saveBettingTable("cycle-1", items);
      await new Promise((r) => setTimeout(r, 50));
      expect(adapter.documents.length).toBe(1);
      expect(adapter.documents[0].title).toContain("Betting Table");
    });

    it("mirrors gate result to comment artifact", async () => {
      const result = makeGateResult("issue-3");
      await persistence.saveGateResult(result);
      await new Promise((r) => setTimeout(r, 50));
      expect(adapter.comments.length).toBe(1);
      expect(adapter.comments[0].markdown).toContain("Eval Gate Result");
    });

    it("mirrors circuit breaker to document artifact", async () => {
      const record = makeCircuitBreaker("issue-4");
      await persistence.saveCircuitBreaker(record);
      await new Promise((r) => setTimeout(r, 50));
      expect(adapter.documents.length).toBe(1);
      expect(adapter.documents[0].title).toContain("Circuit Breaker");
    });

    it("mirrors decision to comment artifact", async () => {
      const decision = makeDecision("issue-5");
      await persistence.saveDecision(decision);
      await new Promise((r) => setTimeout(r, 50));
      expect(adapter.comments.length).toBe(1);
      expect(adapter.comments[0].markdown).toContain("Decision Record");
    });
  });

  describe("in-memory persistence still works", () => {
    it("retrieves saved BPI from memory", async () => {
      const bpi = makeBPI("issue-1");
      await persistence.saveBPI(bpi);
      const retrieved = await persistence.getBPI("issue-1");
      expect(retrieved).toEqual(bpi);
    });

    it("retrieves saved betting table from memory", async () => {
      const items = makeBettingItems("cycle-1");
      await persistence.saveBettingTable("cycle-1", items);
      const retrieved = await persistence.getBettingTable("cycle-1");
      expect(retrieved).toEqual(items);
    });

    it("retrieves saved circuit breaker from memory", async () => {
      const record = makeCircuitBreaker("issue-4");
      await persistence.saveCircuitBreaker(record);
      const retrieved = await persistence.getCircuitBreaker("issue-4");
      expect(retrieved).toEqual(record);
    });
  });

  describe("adapter failure fallback", () => {
    it("falls back to in-memory-only when adapter throws on document creation", async () => {
      adapter.createIssueDocument = async () => {
        throw new Error("document service unavailable");
      };
      const bpi = makeBPI("issue-1");
      await persistence.saveBPI(bpi);
      await new Promise((r) => setTimeout(r, 50));
      const retrieved = await persistence.getBPI("issue-1");
      expect(retrieved).toEqual(bpi);
      expect(persistence.diagnostics.last_error).toContain("document service unavailable");
    });

    it("falls back to in-memory-only when adapter throws on comment creation", async () => {
      adapter.addIssueComment = async () => {
        throw new Error("comment service unavailable");
      };
      const status = makeStatus("issue-2");
      await persistence.saveStatus(status);
      await new Promise((r) => setTimeout(r, 50));
      const diag = persistence.diagnostics;
      expect(diag.last_error).toContain("comment service unavailable");
    });

    it("does not crash on sequential adapter failures", async () => {
      adapter.createIssueDocument = async () => {
        throw new Error("document service unavailable");
      };
      adapter.addIssueComment = async () => {
        throw new Error("comment service unavailable");
      };
      await persistence.saveBPI(makeBPI("a"));
      await persistence.saveStatus(makeStatus("b"));
      await persistence.saveBettingTable("c", makeBettingItems("c"));
      await new Promise((r) => setTimeout(r, 100));
      expect(persistence.diagnostics.last_error).toBeTruthy();
    });
  });

  describe("artifact ref tracking", () => {
    it("tracks document refs after successful mirror", async () => {
      const bpi = makeBPI("issue-1");
      await persistence.saveBPI(bpi);
      await new Promise((r) => setTimeout(r, 50));
      const diag = persistence.diagnostics;
      expect(diag.total_documents).toBe(1);
      expect(diag.artifact_refs.length).toBe(1);
      expect(diag.artifact_refs[0].type).toBe("document");
      expect(diag.artifact_refs[0].issue_id).toBe("issue-1");
      expect(diag.artifact_refs[0].ref_id).toBe("doc_1");
      expect(diag.artifact_refs[0].created_at).toBeTruthy();
    });

    it("tracks comment refs after successful mirror", async () => {
      const status = makeStatus("issue-2");
      await persistence.saveStatus(status);
      await new Promise((r) => setTimeout(r, 50));
      const diag = persistence.diagnostics;
      expect(diag.total_comments).toBe(1);
      expect(diag.artifact_refs[0].type).toBe("comment");
      expect(diag.artifact_refs[0].issue_id).toBe("issue-2");
      expect(diag.artifact_refs[0].ref_id).toBe("comment_1");
    });

    it("accumulates refs across multiple operations", async () => {
      await persistence.saveBPI(makeBPI("i1"));
      await persistence.saveStatus(makeStatus("i2"));
      await persistence.saveBettingTable("c1", makeBettingItems("c1"));
      await new Promise((r) => setTimeout(r, 100));
      const diag = persistence.diagnostics;
      expect(diag.total_documents).toBe(2);
      expect(diag.total_comments).toBe(1);
      expect(diag.artifact_refs.length).toBe(3);
    });

    it("does not add refs on adapter failure", async () => {
      adapter.createIssueDocument = async () => {
        throw new Error("fail");
      };
      await persistence.saveBPI(makeBPI("i1"));
      await new Promise((r) => setTimeout(r, 50));
      expect(persistence.diagnostics.total_documents).toBe(0);
      expect(persistence.diagnostics.artifact_refs.length).toBe(0);
    });
  });

  describe("zero secret leakage", () => {
    it("does not leak secrets in markdown output", async () => {
      const bpi: BPIScore = {
        ...makeBPI("issue-1"),
        components: {
          expected_value: 100,
          urgency: 0.5,
          estimated_token_cost: 50000,
          risk_factor: 0.1,
          company_token_budget_ref: 100000,
        },
      };
      await persistence.saveBPI(bpi);
      await new Promise((r) => setTimeout(r, 50));
      const doc = adapter.documents[0];
      expect(doc.markdown).not.toContain("ghp_");
      expect(doc.markdown).not.toContain("glpat-");
      expect(doc.markdown).not.toContain("BEGIN OPENSSH PRIVATE KEY");
    });

    it("does not leak secrets in adapter comments", async () => {
      const decision = makeDecision("issue-5");
      await persistence.saveDecision(decision);
      await new Promise((r) => setTimeout(r, 50));
      const comment = adapter.comments[0];
      expect(comment.markdown).not.toContain("ghp_");
      expect(comment.markdown).not.toContain("glpat-");
      expect(comment.markdown).not.toContain("BEGIN RSA PRIVATE KEY");
    });

    it("does not leak secrets in diagnostics", async () => {
      adapter.addIssueComment = async () => {
        throw new Error("token ghp_abcdefghijklmnopqrstuvwxyz0123456789 leaked in error");
      };
      await persistence.saveStatus(makeStatus("issue-2"));
      await new Promise((r) => setTimeout(r, 50));
      const diag = persistence.diagnostics;
      expect(diag.last_error).not.toContain("ghp_");
      expect(diag.last_error).toContain("[REDACTED]");
    });
  });
});
