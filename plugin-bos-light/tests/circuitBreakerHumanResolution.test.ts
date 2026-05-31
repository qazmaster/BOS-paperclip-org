import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CircuitBreakerHumanResolution,
  type ResolutionDecision,
  type HumanDecision,
} from "../src/circuitBreakerHumanResolution";
import { InMemoryPaperclipAdapter } from "../src/paperclipAdapter";
import { createCircuitBreakerRecord } from "../src/circuitBreaker";

describe("CircuitBreakerHumanResolution", () => {
  let adapter: InMemoryPaperclipAdapter;
  let resolver: CircuitBreakerHumanResolution;

  beforeEach(() => {
    adapter = new InMemoryPaperclipAdapter();
    resolver = new CircuitBreakerHumanResolution(adapter);
  });

  describe("onOpen", () => {
    it("creates a document artifact for OPEN circuit breaker", async () => {
      const record = createCircuitBreakerRecord("issue-1");
      const artifact = await resolver.onOpen(record);

      expect(artifact.artifact_type).toBe("document");
      expect(artifact.issue_id).toBe("issue-1");
      expect(artifact.options).toContain("abort_mission");
      expect(artifact.options).toContain("resume_with_limits");
      expect(artifact.options).toContain("create_correction_work_order");
      expect(artifact.options).toContain("escalate_to_div7");
      expect(artifact.options).toContain("open_new_mission");
      expect(adapter.documents.length).toBe(1);
      expect(adapter.documents[0].title).toContain("Circuit Breaker OPEN");
    });

    it("falls back to comment when document creation fails", async () => {
      adapter.createIssueDocument = vi.fn().mockRejectedValue(new Error("fail"));
      const record = createCircuitBreakerRecord("issue-2");
      const artifact = await resolver.onOpen(record);

      expect(artifact.artifact_type).toBe("comment");
      expect(adapter.comments.length).toBe(1);
    });

    it("stores incident artifact internally", async () => {
      const record = createCircuitBreakerRecord("issue-3");
      const artifact = await resolver.onOpen(record);
      expect(resolver.getIncident(artifact.incident_id)).toEqual(artifact);
    });

    it("includes OPEN timestamp in markdown", async () => {
      const record = createCircuitBreakerRecord("issue-4");
      const artifact = await resolver.onOpen(record);
      expect(adapter.documents[0].markdown).toContain("OPEN");
      expect(adapter.documents[0].markdown).toContain("abort_mission");
    });
  });

  describe("awaitHumanDecision", () => {
    it("defaults to abort_mission on timeout", async () => {
      const record = createCircuitBreakerRecord("issue-1");
      const artifact = await resolver.onOpen(record);
      const decision = await resolver.awaitHumanDecision(artifact.incident_id, 50);

      expect(decision.decision).toBe("abort_mission");
      expect(decision.reason).toContain("50ms");
    });

    it("returns simulated decision for resume_with_limits", async () => {
      const record = createCircuitBreakerRecord("issue-1");
      const artifact = await resolver.onOpen(record);
      const promise = resolver.awaitHumanDecision(artifact.incident_id, 5000);

      setTimeout(() => {
        resolver.simulateHumanDecision(artifact.incident_id, {
          decision: "resume_with_limits",
          reason: "Safe to retry with limits",
          decided_at: new Date().toISOString(),
        });
      }, 10);

      const decision = await promise;
      expect(decision.decision).toBe("resume_with_limits");
      expect(decision.reason).toBe("Safe to retry with limits");
    });

    it("returns simulated decision for create_correction_work_order", async () => {
      const record = createCircuitBreakerRecord("issue-1");
      const artifact = await resolver.onOpen(record);
      const promise = resolver.awaitHumanDecision(artifact.incident_id, 5000);

      setTimeout(() => {
        resolver.simulateHumanDecision(artifact.incident_id, {
          decision: "create_correction_work_order",
          decided_at: new Date().toISOString(),
        });
      }, 10);

      const decision = await promise;
      expect(decision.decision).toBe("create_correction_work_order");
    });

    it("returns false when simulating non-existent incident", () => {
      const result = resolver.simulateHumanDecision("nonexistent", {
        decision: "abort_mission",
        decided_at: new Date().toISOString(),
      });
      expect(result).toBe(false);
    });
  });

  describe("executeResolution", () => {
    it("executes abort_mission", () => {
      const result = resolver.executeResolution({
        decision: "abort_mission",
        reason: "Too risky",
        decided_at: new Date().toISOString(),
      });
      expect(result.executed).toBe(true);
      expect(result.decision).toBe("abort_mission");
      expect(result.message).toContain("Mission aborted");
      expect(result.payload).toHaveProperty("action", "shutdown");
    });

    it("executes resume_with_limits", () => {
      const result = resolver.executeResolution({
        decision: "resume_with_limits",
        reason: "Safe to retry",
        decided_at: new Date().toISOString(),
      });
      expect(result.executed).toBe(true);
      expect(result.decision).toBe("resume_with_limits");
      expect(result.message).toContain("reset with reduced limits");
      expect(result.payload).toHaveProperty("limit_factor", 0.5);
    });

    it("executes create_correction_work_order", () => {
      const result = resolver.executeResolution({
        decision: "create_correction_work_order",
        decided_at: new Date().toISOString(),
      });
      expect(result.executed).toBe(true);
      expect(result.decision).toBe("create_correction_work_order");
      expect(result.message).toContain("correction work order spawned");
      expect(result.payload).toHaveProperty("type", "correction");
    });

    it("executes escalate_to_div7", () => {
      const result = resolver.executeResolution({
        decision: "escalate_to_div7",
        decided_at: new Date().toISOString(),
      });
      expect(result.executed).toBe(true);
      expect(result.decision).toBe("escalate_to_div7");
      expect(result.message).toContain("Div7.MissionControl");
      expect(result.payload).toHaveProperty("target", "Div7.MissionControl");
    });

    it("executes open_new_mission", () => {
      const result = resolver.executeResolution({
        decision: "open_new_mission",
        reason: "Pivot needed",
        decided_at: new Date().toISOString(),
      });
      expect(result.executed).toBe(true);
      expect(result.decision).toBe("open_new_mission");
      expect(result.message).toContain("New mission intake initiated");
      expect(result.payload).toHaveProperty("action", "new_mission");
    });

    it("stores resolution internally", () => {
      const decision: HumanDecision = {
        decision: "abort_mission",
        decided_at: new Date().toISOString(),
      };
      resolver.executeResolution(decision);
      expect(resolver.getResolution("abort_mission")?.executed).toBe(true);
    });
  });

  describe("logResolution", () => {
    it("creates a document artifact for resolution", async () => {
      const record = createCircuitBreakerRecord("issue-1");
      const incident = await resolver.onOpen(record);
      const decision: HumanDecision = {
        decision: "abort_mission",
        reason: "Safety first",
        decided_at: new Date().toISOString(),
      };

      const artifact = await resolver.logResolution(incident.incident_id, decision);
      expect(artifact.artifact_type).toBe("document");
      expect(adapter.documents.length).toBe(2);
      expect(adapter.documents[1].markdown).toContain("abort_mission");
      expect(adapter.documents[1].markdown).toContain("Safety first");
    });

    it("falls back to comment on document failure", async () => {
      const record = createCircuitBreakerRecord("issue-2");
      const incident = await resolver.onOpen(record);
      adapter.createIssueDocument = vi.fn().mockRejectedValue(new Error("fail"));

      const decision: HumanDecision = {
        decision: "resume_with_limits",
        decided_at: new Date().toISOString(),
      };

      const artifact = await resolver.logResolution(incident.incident_id, decision);
      expect(artifact.artifact_type).toBe("comment");
      expect(adapter.comments.length).toBe(1);
    });
  });
});
