import { describe, it, expect, vi, beforeEach } from "vitest";
import { MissionIntake, type MissionEnvelope, type ApprovalResponse, type MissionIntakeUnauthorized } from "../src/missionIntake";
import { InMemoryPaperclipAdapter } from "../src/paperclipAdapter";

function assertMission(result: MissionEnvelope | MissionIntakeUnauthorized): MissionEnvelope {
  if ("unauthorized" in result) {
    throw new Error(`Expected mission, got unauthorized: ${result.reason}`);
  }
  return result;
}

function assertArtifact<T>(result: T | MissionIntakeUnauthorized): T {
  if (result && typeof result === "object" && "unauthorized" in result) {
    throw new Error(`Expected artifact, got unauthorized: ${(result as MissionIntakeUnauthorized).reason}`);
  }
  return result as T;
}

describe("MissionIntake", () => {
  let adapter: InMemoryPaperclipAdapter;
  let intake: MissionIntake;

  beforeEach(() => {
    adapter = new InMemoryPaperclipAdapter();
    intake = new MissionIntake(adapter);
  });

  describe("frameMission", () => {
    it("rejects non-Div7 callers with an unauthorized diagnostic", () => {
      const result = intake.frameMission("Div3.Treasury", "Build a new payment integration for aipay.kz");
      expect(result).toHaveProperty("unauthorized", true);
      expect(result).toHaveProperty("caller", "Div3.Treasury");
      expect((result as { reason: string }).reason).toContain("Div7.MissionControl");
    });

    it("creates a structured mission envelope from a vague goal", () => {
      const mission = assertMission(intake.frameMission("Div7.MissionControl", "Build a new payment integration for aipay.kz"));
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
      const mission = assertMission(intake.frameMission("Div7.MissionControl", "Fix compliance gap in payment processing"));
      expect(mission.risk_level).toBe("CRITICAL");
    });

    it("infers HIGH risk for production deployment goals", () => {
      const mission = assertMission(intake.frameMission("Div7.MissionControl", "Deploy customer-facing feature to production"));
      expect(mission.risk_level).toBe("HIGH");
    });

    it("infers LOW risk for experimental goals", () => {
      const mission = assertMission(intake.frameMission("Div7.MissionControl", "Prototype a new UI experiment"));
      expect(mission.risk_level).toBe("LOW");
    });

    it("infers MEDIUM risk for generic goals", () => {
      const mission = assertMission(intake.frameMission("Div7.MissionControl", "Refactor internal utility"));
      expect(mission.risk_level).toBe("MEDIUM");
    });

    it("infers revenue business goal", () => {
      const mission = assertMission(intake.frameMission("Div7.MissionControl", "Increase sales through new checkout flow"));
      expect(mission.business_goal).toBe("Increase revenue or monetization");
    });

    it("stores the framed mission internally", () => {
      const mission = assertMission(intake.frameMission("Div7.MissionControl", "Test mission"));
      expect(intake.getMission(mission.mission_id)).toEqual(mission);
    });
  });

  describe("requestHumanApproval", () => {
    it("rejects non-Div7 callers with an unauthorized diagnostic", async () => {
      const mission = assertMission(intake.frameMission("Div7.MissionControl", "Implement feature X"));
      const result = await intake.requestHumanApproval("Div4.Production", mission);
      expect(result).toHaveProperty("unauthorized", true);
      expect(result).toHaveProperty("caller", "Div4.Production");
      expect((result as { reason: string }).reason).toContain("Div7.MissionControl");
    });

    it("creates a document artifact and updates mission status", async () => {
      const mission = assertMission(intake.frameMission("Div7.MissionControl", "Implement feature X"));
      const artifact = assertArtifact(await intake.requestHumanApproval("Div7.MissionControl", mission));

      expect(artifact.artifact_type).toBe("document");
      expect(artifact.issue_id).toBe(mission.mission_id);
      expect(artifact.options).toEqual(["approve", "reject", "request_clarification"]);
      expect(intake.getMission(mission.mission_id)?.status).toBe("PENDING_APPROVAL");
      expect(adapter.documents.length).toBe(1);
      expect(adapter.documents[0].title).toContain("Mission Approval Request");
    });

    it("falls back to comment when document creation fails", async () => {
      adapter.createIssueDocument = vi.fn().mockRejectedValue(new Error("Document creation failed"));
      const mission = assertMission(intake.frameMission("Div7.MissionControl", "Implement feature Y"));
      const artifact = assertArtifact(await intake.requestHumanApproval("Div7.MissionControl", mission));

      expect(artifact.artifact_type).toBe("comment");
      expect(adapter.comments.length).toBe(1);
    });

    it("stores the approval artifact internally", async () => {
      const mission = assertMission(intake.frameMission("Div7.MissionControl", "Implement feature Z"));
      const artifact = assertArtifact(await intake.requestHumanApproval("Div7.MissionControl", mission));
      expect(intake.getApprovalArtifact(mission.mission_id)).toEqual(artifact);
    });
  });

  describe("awaitHumanApproval", () => {
    it("returns TIMEOUT when no response is received within timeout", async () => {
      const mission = assertMission(intake.frameMission("Div7.MissionControl", "Implement feature A"));
      const response = await intake.awaitHumanApproval(mission.mission_id, 50);
      expect(response.status).toBe("TIMEOUT");
      expect(response.reason).toContain("50ms");
    });

    it("returns APPROVED when simulateHumanResponse is called with approve", async () => {
      const mission = assertMission(intake.frameMission("Div7.MissionControl", "Implement feature B"));
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
      const mission = assertMission(intake.frameMission("Div7.MissionControl", "Implement feature C"));
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

      const mission = assertMission(intake.frameMission("Div7.MissionControl", "Implement feature D"));
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

      const mission = assertMission(intake.frameMission("Div7.MissionControl", "Implement feature E"));
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

      const mission = assertMission(intake.frameMission("Div7.MissionControl", "Implement feature F"));
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

      const mission = assertMission(intake.frameMission("Div7.MissionControl", "Implement feature G"));
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
