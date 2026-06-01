import { describe, it, expect, beforeEach } from "vitest";
import {
  routeApprovedMission,
} from "../src/missionRouter";
import { getDivisionInbox, clearPacketRouter } from "../src/divisionPacketRouter";
import type { Division, MissionRoutingState, MissionRouterUnauthorized } from "../src/contracts";
import type { MissionEnvelope } from "../src/missionIntake";

const ALL_DIVISIONS: Division[] = [
  "Div7.MissionControl",
  "Div1.HCO",
  "Div2.MasterPlanner",
  "Div3.Treasury",
  "Div4.Production",
  "Div5.QualificationsLibraryLearning",
  "Div6.External",
];

function makeMission(requestedDivisions: Division[]): MissionEnvelope {
  return {
    schema_version: "1.0",
    mission_id: `mission_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: "Test Mission",
    description: "A mission for testing routing logic",
    business_goal: "Test routing",
    risk_level: "MEDIUM",
    requested_divisions: requestedDivisions,
    status: "APPROVED",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe("routeApprovedMission", () => {
  beforeEach(() => {
    clearPacketRouter();
  });

  it("allows Div1.HCO to route an approved mission", () => {
    const mission = makeMission(ALL_DIVISIONS);
    const result = routeApprovedMission("Div1.HCO", mission);

    expect(result).toBeDefined();
    expect("authorized" in result).toBe(false);
    const state = result as MissionRoutingState;
    expect(state.status).toBe("ROUTED");
    expect(state.mission_id).toBe(mission.mission_id);
    expect(state.routing_packet_id).toMatch(/^pkt_\d+_[a-z0-9]+$/);
  });

  it("rejects non-Div1 callers with MissionRouterUnauthorized", () => {
    const mission = makeMission(ALL_DIVISIONS);
    const nonDiv1 = ALL_DIVISIONS.filter((d) => d !== "Div1.HCO");

    for (const caller of nonDiv1) {
      clearPacketRouter();
      const result = routeApprovedMission(caller, mission);

      expect(result).toBeDefined();
      expect("authorized" in result).toBe(true);
      const unauthorized = result as MissionRouterUnauthorized;
      expect(unauthorized.authorized).toBe(false);
      expect(unauthorized.caller).toBe(caller);
      expect(unauthorized.required_role).toBe("Div1.HCO");
      expect(unauthorized.reason).toContain("Div1.HCO");
      expect(unauthorized.rejected_at).toBeDefined();
    }
  });

  it("excludes Div1.HCO and Div7.MissionControl from activated divisions", () => {
    const mission = makeMission(ALL_DIVISIONS);
    const result = routeApprovedMission("Div1.HCO", mission) as MissionRoutingState;

    expect(result.activated_divisions).not.toContain("Div1.HCO");
    expect(result.activated_divisions).not.toContain("Div7.MissionControl");
    expect(result.excluded_divisions).toContain("Div1.HCO");
    expect(result.excluded_divisions).toContain("Div7.MissionControl");
  });

  it("emits work_assignment packets to all activated divisions", () => {
    const mission = makeMission(ALL_DIVISIONS);
    routeApprovedMission("Div1.HCO", mission);

    for (const div of ALL_DIVISIONS) {
      if (div === "Div1.HCO" || div === "Div7.MissionControl") continue;

      const inbox = getDivisionInbox(div);
      expect(inbox).toHaveLength(1);
      expect(inbox[0].packet_type).toBe("work_assignment");
      expect(inbox[0].from_division).toBe("Div1.HCO");
      expect(inbox[0].to_division).toBe(div);
    }
  });

  it("emits a status_update packet to Div7.MissionControl", () => {
    const mission = makeMission(ALL_DIVISIONS);
    routeApprovedMission("Div1.HCO", mission);

    const div7Inbox = getDivisionInbox("Div7.MissionControl");
    expect(div7Inbox).toHaveLength(1);
    expect(div7Inbox[0].packet_type).toBe("status_update");
    expect(div7Inbox[0].from_division).toBe("Div1.HCO");
    expect(div7Inbox[0].to_division).toBe("Div7.MissionControl");

    const payload = div7Inbox[0].payload as Record<string, unknown>;
    expect(payload.mission_id).toBe(mission.mission_id);
    expect(payload.status).toBe("ROUTED");
    expect(Array.isArray(payload.activated_divisions)).toBe(true);
    expect(Array.isArray(payload.excluded_divisions)).toBe(true);
  });

  it("does not emit work_assignment when no divisions remain after exclusion", () => {
    const mission = makeMission(["Div1.HCO", "Div7.MissionControl"]);
    const result = routeApprovedMission("Div1.HCO", mission) as MissionRoutingState;

    expect(result.activated_divisions).toHaveLength(0);
    expect(result.current_division).toBeNull();

    // Div7 still gets status_update even if no work was assigned
    const div7Inbox = getDivisionInbox("Div7.MissionControl");
    expect(div7Inbox).toHaveLength(1);
    expect(div7Inbox[0].packet_type).toBe("status_update");
  });

  it("sets current_division to the first activated division", () => {
    const mission = makeMission(["Div2.MasterPlanner", "Div4.Production", "Div5.QualificationsLibraryLearning"]);
    const result = routeApprovedMission("Div1.HCO", mission) as MissionRoutingState;

    expect(result.current_division).toBe("Div2.MasterPlanner");
    expect(result.activated_divisions).toEqual([
      "Div2.MasterPlanner",
      "Div4.Production",
      "Div5.QualificationsLibraryLearning",
    ]);
  });

  it("derives backlog_shaping rule for Div2-only missions", () => {
    const mission = makeMission(["Div2.MasterPlanner"]);
    const result = routeApprovedMission("Div1.HCO", mission) as MissionRoutingState;

    const div2Inbox = getDivisionInbox("Div2.MasterPlanner");
    const payload = div2Inbox[0].payload as Record<string, unknown>;
    expect(payload.routing_rule).toBe("backlog_shaping");
  });

  it("derives implementation rule for Div4-only missions", () => {
    const mission = makeMission(["Div4.Production"]);
    const result = routeApprovedMission("Div1.HCO", mission) as MissionRoutingState;

    const div4Inbox = getDivisionInbox("Div4.Production");
    const payload = div4Inbox[0].payload as Record<string, unknown>;
    expect(payload.routing_rule).toBe("implementation");
  });

  it("derives qa_security_review rule for Div5-only missions", () => {
    const mission = makeMission(["Div5.QualificationsLibraryLearning"]);
    const result = routeApprovedMission("Div1.HCO", mission) as MissionRoutingState;

    const div5Inbox = getDivisionInbox("Div5.QualificationsLibraryLearning");
    const payload = div5Inbox[0].payload as Record<string, unknown>;
    expect(payload.routing_rule).toBe("qa_security_review");
  });

  it("derives external_io_request rule for Div5 + Div6 missions", () => {
    const mission = makeMission(["Div5.QualificationsLibraryLearning", "Div6.External"]);
    const result = routeApprovedMission("Div1.HCO", mission) as MissionRoutingState;

    const div5Inbox = getDivisionInbox("Div5.QualificationsLibraryLearning");
    const payload = div5Inbox[0].payload as Record<string, unknown>;
    expect(payload.routing_rule).toBe("external_io_request");
  });

  it("derives paid_credentialed_external_io_request for Div3 + Div5 + Div6 missions", () => {
    const mission = makeMission(["Div3.Treasury", "Div5.QualificationsLibraryLearning", "Div6.External"]);
    const result = routeApprovedMission("Div1.HCO", mission) as MissionRoutingState;

    const div3Inbox = getDivisionInbox("Div3.Treasury");
    const payload = div3Inbox[0].payload as Record<string, unknown>;
    expect(payload.routing_rule).toBe("paid_credentialed_external_io_request");
  });

  it("derives multi_division_workflow for mixed division sets", () => {
    const mission = makeMission(["Div2.MasterPlanner", "Div3.Treasury", "Div4.Production"]);
    const result = routeApprovedMission("Div1.HCO", mission) as MissionRoutingState;

    const div2Inbox = getDivisionInbox("Div2.MasterPlanner");
    const payload = div2Inbox[0].payload as Record<string, unknown>;
    expect(payload.routing_rule).toBe("multi_division_workflow");
  });

  it("does not mutate the original mission object", () => {
    const mission = makeMission(["Div2.MasterPlanner", "Div4.Production"]);
    const originalRequestedDivisions = [...mission.requested_divisions];
    routeApprovedMission("Div1.HCO", mission);

    expect(mission.requested_divisions).toEqual(originalRequestedDivisions);
  });

  it("returns updated_at as a valid ISO timestamp", () => {
    const mission = makeMission(["Div2.MasterPlanner"]);
    const result = routeApprovedMission("Div1.HCO", mission) as MissionRoutingState;

    expect(result.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(result.updated_at).getTime()).not.toBeNaN();
  });
});
