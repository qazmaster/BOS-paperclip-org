import { describe, it, expect, vi, beforeEach } from "vitest";
import { MissionIntake, type MissionEnvelope, type ApprovalResponse } from "../src/missionIntake";
import { InMemoryPaperclipAdapter } from "../src/paperclipAdapter";

describe("MissionIntake", () => {
  let adapter: InMemoryPaperclipAdapter;
  let intake: MissionIntake;

  beforeEach(() => {
    adapter = new InMemoryPaperclipAdapter();
    intake = new MissionIntake(adapter);
  });

  describe("frameMission", () => {
    it("creates a structured mission envelope from a vague goal", () => {
      const mission = intake.frameMission("Build a new payment integration for aipay.kz");
      expect(mission.schema_version).toBe("1.0");
      expect(mission.mission_id).toMatch(/^mission_\d+_[a-z0-9]+$/);
      expect(mission.title).toBe("Build a new payment integration for aipay.kz");
      expect(mission.description).toBe("Build a new payment integration for aipay.kz");
      expect(mission.status).toBe("DRAFT");
      expect(mission.requested_divisions).toContain("Div7.MissionControl");
      expect(mission.requested_divisions).toContain("Div4.Production");
      expect(mission.created_at).toBeDefined();
      expect(mission.updated_at).toBeDefined();
    });

    it("infers CRITICAL risk for security-related goals", () => {
      const mission = intake.frameMission("Fix compliance gap in payment processing");
      expect(mission.risk_level).toBe("CRITICAL");
    });

    it("infers HIGH risk for production deployment goals", () => {
      const mission = intake.frameMission("Deploy customer-facing feature to production");
      expect(mission.risk_level).toBe("HIGH");
    });

    it("infers LOW risk for experimental goals", () => {
      const mission = intake.frameMission("Prototype a new UI experiment");
      expect(mission.risk_level).toBe("LOW");
    });

    it("infers MEDIUM risk for generic goals", () => {
      const mission = intake.frameMission("Refactor internal utility");
      expect(mission.risk_level).toBe("MEDIUM");
    });

    it("infers revenue business goal", () => {
      const mission = intake.frameMission("Increase sales through new checkout flow");
      expect(mission.business_goal).toBe("Increase revenue or monetization");
    });

    it("stores the framed mission internally", () => {
      const mission = intake.frameMission("Test mission");
      expect(intake.getMission(mission.mission_id)).toEqual(mission);
    });
  });

  describe("requestHumanApproval", () => {
    it("creates a document artifact and updates mission status", async () => {
      const mission = intake.frameMission("Implement feature X");
      const artifact = await intake.requestHumanApproval(mission);

      expect(artifact.artifact_type).toBe("document");
      expect(artifact.issue_id).toBe(mission.mission_id);
      expect(artifact.options).toEqual(["approve", "reject", "request_clarification"]);
      expect(intake.getMission(mission.mission_id)?.status).toBe("PENDING_APPROVAL");
      expect(adapter.documents.length).toBe(1);
      expect(adapter.documents[0].title).toContain("Mission Approval Request");
    });

    it("falls back to comment when document creation fails", async () => {
      adapter.createIssueDocument = vi.fn().mockRejectedValue(new Error("Document creation failed"));
      const mission = intake.frameMission("Implement feature Y");
      const artifact = await intake.requestHumanApproval(mission);

      expect(artifact.artifact_type).toBe("comment");
      expect(adapter.comments.length).toBe(1);
    });

    it("stores the approval artifact internally", async () => {
      const mission = intake.frameMission("Implement feature Z");
      const artifact = await intake.requestHumanApproval(mission);
      expect(intake.getApprovalArtifact(mission.mission_id)).toEqual(artifact);
    });
  });

  describe("awaitHumanApproval", () => {
    it("returns TIMEOUT when no response is received within timeout", async () => {
      const mission = intake.frameMission("Implement feature A");
      const response = await intake.awaitHumanApproval(mission.mission_id, 50);
      expect(response.status).toBe("TIMEOUT");
      expect(response.reason).toContain("50ms");
    });

    it("returns APPROVED when simulateHumanResponse is called with approve", async () => {
      const mission = intake.frameMission("Implement feature B");
      const promise = intake.awaitHumanApproval(mission.mission_id, 5000);

      setTimeout(() => {
        intake.simulateHumanResponse(mission.mission_id, {
          status: "APPROVED",
          responded_at: new Date().toISOString(),
        });
      }, 10);

      const response = await promise;
      expect(response.status).toBe("APPROVED");
    });

    it("returns REJECTED when simulateHumanResponse is called with reject", async () => {
      const mission = intake.frameMission("Implement feature C");
      const promise = intake.awaitHumanApproval(mission.mission_id, 5000);

      setTimeout(() => {
        intake.simulateHumanResponse(mission.mission_id, {
          status: "REJECTED",
          reason: "Budget constraints",
          responded_at: new Date().toISOString(),
        });
      }, 10);

      const response = await promise;
      expect(response.status).toBe("REJECTED");
      expect(response.reason).toBe("Budget constraints");
    });
  });

  describe("onApproval", () => {
    it("emits mission_approved event and updates status", () => {
      const handler = vi.fn();
      intake.addEventListener("mission_approved", handler);

      const mission = intake.frameMission("Implement feature D");
      intake.onApproval(mission);

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0];
      expect(event.type).toBe("mission_approved");
      expect(event.mission.status).toBe("APPROVED");
      expect(intake.getMission(mission.mission_id)?.status).toBe("APPROVED");
    });
  });

  describe("onRejection", () => {
    it("emits mission_rejected event with reason and updates status", () => {
      const handler = vi.fn();
      intake.addEventListener("mission_rejected", handler);

      const mission = intake.frameMission("Implement feature E");
      intake.onRejection(mission, "Out of scope");

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0];
      expect(event.type).toBe("mission_rejected");
      expect(event.mission.status).toBe("REJECTED");
      expect(event.reason).toBe("Out of scope");
    });
  });

  describe("event listener management", () => {
    it("allows adding and removing event listeners", () => {
      const handler = vi.fn();
      intake.addEventListener("mission_approved", handler);
      intake.removeEventListener("mission_approved", handler);

      const mission = intake.frameMission("Implement feature F");
      intake.onApproval(mission);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("simulateHumanResponse", () => {
    it("returns false when no pending approval exists", () => {
      const result = intake.simulateHumanResponse("nonexistent", {
        status: "APPROVED",
        responded_at: new Date().toISOString(),
      });
      expect(result).toBe(false);
    });

    it("triggers onApproval when simulating APPROVED", () => {
      const handler = vi.fn();
      intake.addEventListener("mission_approved", handler);

      const mission = intake.frameMission("Implement feature G");
      intake.awaitHumanApproval(mission.mission_id, 5000);
      intake.simulateHumanResponse(mission.mission_id, {
        status: "APPROVED",
        responded_at: new Date().toISOString(),
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(intake.getMission(mission.mission_id)?.status).toBe("APPROVED");
    });
  });
});
