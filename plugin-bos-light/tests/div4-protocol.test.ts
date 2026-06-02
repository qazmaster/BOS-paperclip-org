import { describe, it, expect, beforeEach } from "vitest";
import { clearPacketRouter, getDivisionInbox } from "../src/divisionPacketRouter";
import { raiseBlocker, requestQAReview } from "../src/div4Production";

describe("Div4 Production - Blocker and QA Protocol", () => {
  beforeEach(() => {
    clearPacketRouter();
  });

  describe("raiseBlocker", () => {
    it("emits blocker_raised packet to Div1.HCO", () => {
      const blocker = raiseBlocker(
        "mission_001",
        "task_001",
        "missing_blueprint",
        "No blueprint received for task_001",
        "Route to Div2 for blueprint creation"
      );

      expect(blocker.packet_type).toBe("blocker_raised");
      expect(blocker.mission_id).toBe("mission_001");
      expect(blocker.task_id).toBe("task_001");
      expect(blocker.blocker_type).toBe("missing_blueprint");
      expect(blocker.raised_by).toBe("Div4.Production");

      // Verify packet in Div1 inbox
      const div1Inbox = getDivisionInbox("Div1.HCO");
      expect(div1Inbox).toHaveLength(1);
      expect(div1Inbox[0].packet_type).toBe("blocker_raised");
    });

    it("supports all blocker types", () => {
      const blockerTypes = [
        "missing_blueprint",
        "missing_access",
        "missing_budget",
        "missing_dependency",
        "external_info_needed",
        "tests_impossible",
        "acceptance_criteria_unclear",
        "scope_conflict",
        "grant_expired",
        "grant_revoked",
        "budget_exhausted",
        "circuit_breaker_triggered",
      ] as const;

      for (const blockerType of blockerTypes) {
        clearPacketRouter();
        const blocker = raiseBlocker(
          "mission_001",
          "task_001",
          blockerType,
          `Test ${blockerType}`,
          "Test action"
        );
        expect(blocker.blocker_type).toBe(blockerType);
      }
    });

    it("generates unique blocker IDs", () => {
      const blocker1 = raiseBlocker("m1", "t1", "missing_blueprint", "desc1", "action1");
      const blocker2 = raiseBlocker("m1", "t1", "missing_access", "desc2", "action2");

      expect(blocker1.blocker_id).not.toBe(blocker2.blocker_id);
    });
  });

  describe("requestQAReview", () => {
    it("emits qa_review_requested packet to Div1.HCO", () => {
      const qaRequest = requestQAReview(
        "mission_001",
        "task_001",
        "snapshot_001",
        "abc123",
        "test-branch",
        ["file1.ts", "file2.ts"],
        true,
        "Implementation complete, all tests pass"
      );

      expect(qaRequest.packet_type).toBe("qa_review_requested");
      expect(qaRequest.mission_id).toBe("mission_001");
      expect(qaRequest.local_checks_passed).toBe(true);
      expect(qaRequest.requested_by).toBe("Div4.Production");

      // Verify packet in Div1 inbox
      const div1Inbox = getDivisionInbox("Div1.HCO");
      expect(div1Inbox).toHaveLength(1);
      expect(div1Inbox[0].packet_type).toBe("qa_review_requested");
    });

    it("includes all required fields for Div5 verification", () => {
      const qaRequest = requestQAReview(
        "mission_001",
        "task_001",
        "snapshot_001",
        "abc123",
        "test-branch",
        ["src/index.ts"],
        true,
        "All checks passed"
      );

      expect(qaRequest.snapshot_id).toBe("snapshot_001");
      expect(qaRequest.commit_sha).toBe("abc123");
      expect(qaRequest.branch_created).toBe("test-branch");
      expect(qaRequest.files_changed).toContain("src/index.ts");
      expect(qaRequest.local_checks_passed).toBe(true);
      expect(qaRequest.implementation_notes).toBe("All checks passed");
    });

    it("can report failed local checks", () => {
      const qaRequest = requestQAReview(
        "mission_001",
        "task_001",
        "snapshot_001",
        "abc123",
        "test-branch",
        ["src/index.ts"],
        false,
        "Lint warnings present but functionality complete"
      );

      expect(qaRequest.local_checks_passed).toBe(false);
    });
  });

  describe("Div4 communication boundary", () => {
    it("Div4 only emits to Div1.HCO", () => {
      raiseBlocker("m1", "t1", "missing_blueprint", "desc", "action");

      const div1Inbox = getDivisionInbox("Div1.HCO");
      const div5Inbox = getDivisionInbox("Div5.QualificationsLibraryLearning");
      const div6Inbox = getDivisionInbox("Div6.External");

      expect(div1Inbox).toHaveLength(1);
      expect(div5Inbox).toHaveLength(0);
      expect(div6Inbox).toHaveLength(0);
    });

    it("blockers and QA requests go through Div1 routing", () => {
      raiseBlocker("m1", "t1", "missing_blueprint", "desc", "action");
      requestQAReview("m1", "t1", "snap1", "sha1", "branch1", [], true, "notes");

      const div1Inbox = getDivisionInbox("Div1.HCO");
      expect(div1Inbox).toHaveLength(2);
      expect(div1Inbox[0].packet_type).toBe("blocker_raised");
      expect(div1Inbox[1].packet_type).toBe("qa_review_requested");
    });
  });
});
