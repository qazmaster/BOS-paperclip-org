import { describe, it, expect, vi, beforeEach } from "vitest";
import { HITLGovernance, type GateDecision } from "../src/hitlGovernance";
import { InMemoryPaperclipAdapter } from "../src/paperclipAdapter";
import type { GitCommandEvidence } from "../src/gitOperations";

describe("HITLGovernance", () => {
  let adapter: InMemoryPaperclipAdapter;
  let governance: HITLGovernance;

  beforeEach(() => {
    adapter = new InMemoryPaperclipAdapter();
    governance = new HITLGovernance(adapter);
  });

  function makeEvidence(args: string[]): GitCommandEvidence {
    return {
      command: "git",
      args,
      cwd: "/tmp/repo",
      env_keys: [],
      exit_code: 0,
      stdout_hash: "abc",
      stderr_hash: "def",
      duration_ms: 100,
      success: true,
      error_category: "none",
      redacted_diagnostics: "OK",
    };
  }

  describe("enforceBranchPolicy", () => {
    it("allows feature branch pushes", () => {
      const evidence = makeEvidence(["push", "origin", "feature/bos-mission_123"]);
      const result = governance.enforceBranchPolicy(evidence);
      expect(result.allowed).toBe(true);
      expect(result.violation).toBeUndefined();
    });

    it("blocks direct push to main", () => {
      const evidence = makeEvidence(["push", "origin", "main"]);
      const result = governance.enforceBranchPolicy(evidence);
      expect(result.allowed).toBe(false);
      expect(result.violation?.rule).toBe("direct_main_push");
      expect(result.violation?.reason).toContain("Direct push to main/master is prohibited");
    });

    it("blocks direct push to master", () => {
      const evidence = makeEvidence(["push", "origin", "master"]);
      const result = governance.enforceBranchPolicy(evidence);
      expect(result.allowed).toBe(false);
      expect(result.violation?.rule).toBe("direct_main_push");
    });

    it("blocks force push", () => {
      const evidence = makeEvidence(["push", "origin", "feature/bos-mission_123", "--force"]);
      const result = governance.enforceBranchPolicy(evidence);
      expect(result.allowed).toBe(false);
      expect(result.violation?.rule).toBe("non_fast_forward");
      expect(result.violation?.reason).toContain("Force push is prohibited");
    });

    it("blocks push with -f shorthand", () => {
      const evidence = makeEvidence(["push", "-f", "origin", "feature/bos-mission_123"]);
      const result = governance.enforceBranchPolicy(evidence);
      expect(result.allowed).toBe(false);
      expect(result.violation?.rule).toBe("non_fast_forward");
    });

    it("blocks non-feature branch naming", () => {
      const evidence = makeEvidence(["push", "origin", "my-random-branch"]);
      const result = governance.enforceBranchPolicy(evidence);
      expect(result.allowed).toBe(false);
      expect(result.violation?.rule).toBe("naming_convention");
      expect(result.violation?.reason).toContain("feature/bos-");
    });

    it("records blocked attempts", () => {
      governance.enforceBranchPolicy(makeEvidence(["push", "origin", "main"]));
      governance.enforceBranchPolicy(makeEvidence(["push", "origin", "bad-branch"]));
      expect(governance.getBlockedAttempts().length).toBe(2);
    });
  });

  describe("requestResourceGrant", () => {
    it("creates a document artifact for resource grant", async () => {
      const artifact = await governance.requestResourceGrant("mission_123", [
        { resource_type: "token_budget", description: "OpenAI API tokens", requested_amount: "$500" },
        { resource_type: "repo_access", description: "aipay.kz repository" },
      ]);

      expect(artifact.gate_type).toBe("resource_grant");
      expect(artifact.mission_id).toBe("mission_123");
      expect(artifact.status).toBe("PENDING");
      expect(artifact.artifact_type).toBe("document");
      expect(adapter.documents.length).toBe(1);
      expect(adapter.documents[0].title).toContain("Resource Grant Request");
    });

    it("falls back to comment when document fails", async () => {
      adapter.createIssueDocument = vi.fn().mockRejectedValue(new Error("fail"));
      const artifact = await governance.requestResourceGrant("mission_456", [
        { resource_type: "api_key", description: "Stripe API key" },
      ]);

      expect(artifact.artifact_type).toBe("comment");
      expect(adapter.comments.length).toBe(1);
    });

    it("stores artifact internally", async () => {
      const artifact = await governance.requestResourceGrant("mission_789", [
        { resource_type: "compute", description: "GPU hours" },
      ]);
      expect(governance.getGateArtifact(artifact.gate_id)).toEqual(artifact);
    });
  });

  describe("requestBatchApproval", () => {
    it("creates a document artifact for batch approval", async () => {
      const artifact = await governance.requestBatchApproval("mission_123", [
        { item_id: "item-1", title: "Feature A", description: "Add payment gateway", estimated_cost: "2d" },
        { item_id: "item-2", title: "Feature B", description: "Add refund flow" },
      ]);

      expect(artifact.gate_type).toBe("batch_approval");
      expect(artifact.artifact_type).toBe("document");
      expect(adapter.documents[0].markdown).toContain("Feature A");
      expect(adapter.documents[0].markdown).toContain("Feature B");
    });

    it("falls back to comment when document fails", async () => {
      adapter.createIssueDocument = vi.fn().mockRejectedValue(new Error("fail"));
      const artifact = await governance.requestBatchApproval("mission_456", [
        { item_id: "item-1", title: "Task 1", description: "Do thing" },
      ]);

      expect(artifact.artifact_type).toBe("comment");
    });
  });

  describe("requestProductionDeploy", () => {
    it("creates a document artifact for deploy request", async () => {
      const artifact = await governance.requestProductionDeploy("mission_123", {
        target_environment: "production",
        branch: "feature/bos-mission_123",
        commit_sha: "abc123",
        ci_workflow: "deploy.yml",
      });

      expect(artifact.gate_type).toBe("production_deploy");
      expect(artifact.artifact_type).toBe("document");
      expect(adapter.documents[0].markdown).toContain("production");
      expect(adapter.documents[0].markdown).toContain("abc123");
      expect(adapter.documents[0].markdown).toContain("deploy.yml");
    });

    it("falls back to comment when document fails", async () => {
      adapter.createIssueDocument = vi.fn().mockRejectedValue(new Error("fail"));
      const artifact = await governance.requestProductionDeploy("mission_456", {
        target_environment: "staging",
        branch: "feature/bos-mission_456",
        commit_sha: "def456",
      });

      expect(artifact.artifact_type).toBe("comment");
    });
  });

  describe("awaitGateDecision", () => {
    it("returns TIMEOUT when no response within timeout", async () => {
      const artifact = await governance.requestResourceGrant("mission_123", [
        { resource_type: "token_budget", description: "Tokens" },
      ]);
      const decision = await governance.awaitGateDecision(artifact.gate_id, 50);
      expect(decision.status).toBe("TIMEOUT");
      expect(decision.reason).toContain("50ms");
    });

    it("returns APPROVED when simulateGateDecision is called", async () => {
      const artifact = await governance.requestResourceGrant("mission_123", [
        { resource_type: "token_budget", description: "Tokens" },
      ]);
      const promise = governance.awaitGateDecision(artifact.gate_id, 5000);

      setTimeout(() => {
        governance.simulateGateDecision(artifact.gate_id, {
          gate_id: artifact.gate_id,
          status: "APPROVED",
          decided_at: new Date().toISOString(),
        });
      }, 10);

      const decision = await promise;
      expect(decision.status).toBe("APPROVED");
    });

    it("updates artifact status on simulated decision", async () => {
      const artifact = await governance.requestResourceGrant("mission_123", [
        { resource_type: "token_budget", description: "Tokens" },
      ]);
      governance.awaitGateDecision(artifact.gate_id, 5000);
      governance.simulateGateDecision(artifact.gate_id, {
        gate_id: artifact.gate_id,
        status: "REJECTED",
        reason: "Budget exceeded",
        decided_at: new Date().toISOString(),
      });

      expect(governance.getGateArtifact(artifact.gate_id)?.status).toBe("REJECTED");
    });
  });

  describe("getGateArtifactsForMission", () => {
    it("returns all artifacts for a mission", async () => {
      await governance.requestResourceGrant("mission_abc", [
        { resource_type: "token_budget", description: "Tokens" },
      ]);
      await governance.requestBatchApproval("mission_abc", [
        { item_id: "i1", title: "T1", description: "D1" },
      ]);
      await governance.requestResourceGrant("mission_xyz", [
        { resource_type: "repo_access", description: "Repo" },
      ]);

      const abcArtifacts = governance.getGateArtifactsForMission("mission_abc");
      expect(abcArtifacts.length).toBe(2);
      expect(abcArtifacts.every((a) => a.mission_id === "mission_abc")).toBe(true);
    });
  });
});
