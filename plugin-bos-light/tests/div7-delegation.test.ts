import { describe, it, expect, beforeEach } from "vitest";
import { decide, delegateDecisionToDiv1, isPolicyOnlyDecision, createDecisionDelegated } from "../src/decision";
import {
  routeApprovedMission,
  routeAfterDecision,
  requiresExecutiveDecision,
  deriveOperationalRouteFromDecision
} from "../src/missionRouter";
import { clearPacketRouter, getDivisionInbox } from "../src/divisionPacketRouter";
import type { DecisionDelegatedPayload, Division } from "../src/contracts";
import type { MissionEnvelope } from "../src/missionIntake";

function makeMission(overrides: Partial<MissionEnvelope> = {}): MissionEnvelope {
  return {
    schema_version: "1.0",
    mission_id: "test_mission_001",
    title: "Test mission",
    description: "A test mission for routing verification",
    business_goal: "Test business goal",
    risk_level: "MEDIUM",
    requested_divisions: ["Div2.MasterPlanner", "Div4.Production", "Div5.QualificationsLibraryLearning"],
    status: "APPROVED",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("Div7 Delegation", () => {
  beforeEach(() => {
    clearPacketRouter();
  });

  describe("requiresExecutiveDecision", () => {
    it("returns false for routine technical mission", () => {
      const mission = makeMission({
        title: "Implement feature X",
        description: "Standard implementation task",
        risk_level: "MEDIUM",
      });
      expect(requiresExecutiveDecision(mission)).toBe(false);
    });

    it("returns true for critical risk mission", () => {
      const mission = makeMission({
        title: "Fix production issue",
        description: "Critical production outage",
        risk_level: "CRITICAL",
      });
      expect(requiresExecutiveDecision(mission)).toBe(true);
    });

    it("returns true for incident signals", () => {
      const mission = makeMission({
        title: "Handle outage in payment system",
        description: "Emergency incident response needed",
      });
      expect(requiresExecutiveDecision(mission)).toBe(true);
    });

    it("returns true for policy/strategy signals", () => {
      const mission = makeMission({
        title: "Strategic decision on architecture",
        description: "Policy change needed for compliance",
      });
      expect(requiresExecutiveDecision(mission)).toBe(true);
    });

    it("returns true when Div7 is explicitly requested", () => {
      const mission = makeMission({
        requested_divisions: ["Div7.MissionControl", "Div2.MasterPlanner"],
      });
      expect(requiresExecutiveDecision(mission)).toBe(true);
    });

    it("returns false for routine batch approval", () => {
      const mission = makeMission({
        title: "Routine batch approve",
        description: "Standard known playbook approval",
        risk_level: "LOW",
      });
      expect(requiresExecutiveDecision(mission)).toBe(false);
    });
  });

  describe("routeApprovedMission - pre-decision routing", () => {
    it("routes routine mission directly without Div7 involvement", () => {
      const mission = makeMission({
        title: "Implement feature Y",
        description: "Standard implementation",
        risk_level: "LOW",
        requested_divisions: ["Div2.MasterPlanner", "Div4.Production"],
      });

      const result = routeApprovedMission("Div1.HCO", mission);
      // MissionRoutingState has status field, MissionRouterUnauthorized has authorized field
      expect("status" in result).toBe(true);
      if ("authorized" in result && !result.authorized) {
        throw new Error("Expected authorized result");
      }

      const state = result as { status: string; activated_divisions: Division[] };
      expect(state.status).toBe("ROUTED");
      expect(state.activated_divisions).not.toContain("Div7.MissionControl");
    });

    it("routes critical mission to Div7 as requires_executive_decision", () => {
      const mission = makeMission({
        title: "Handle critical incident",
        description: "Emergency outage response",
        risk_level: "CRITICAL",
      });

      const result = routeApprovedMission("Div1.HCO", mission);
      expect("status" in result).toBe(true);

      const state = result as { status: string; activated_divisions: Division[]; routing_packet_id: string };
      expect(state.status).toBe("ROUTED");
      expect(state.activated_divisions).toContain("Div7.MissionControl");
      expect(state.activated_divisions).toHaveLength(1);
    });

    it("routes ambiguous mission to Div7 for executive decision", () => {
      const mission = makeMission({
        title: "Strategic architecture decision",
        description: "Uncertain path forward, need hypothesis testing",
        risk_level: "HIGH",
        requested_divisions: ["Div2.MasterPlanner", "Div3.Treasury", "Div4.Production", "Div5.QualificationsLibraryLearning"],
      });

      const result = routeApprovedMission("Div1.HCO", mission);
      const state = result as { activated_divisions: Division[] };
      expect(state.activated_divisions).toContain("Div7.MissionControl");
    });

    it("rejects routing from non-Div1 caller", () => {
      const mission = makeMission();
      const result = routeApprovedMission("Div4.Production", mission);
      expect("authorized" in result).toBe(true);
      if ("authorized" in result) {
        expect(result.authorized).toBe(false);
      }
    });
  });

  describe("DecisionDelegated emission", () => {
    it("emits DecisionDelegated for non-policy decisions", () => {
      const decision = decide({
        issue_id: "test_issue",
        signals: ["circuit breaker incident critical stop"],
        confidence: 0.9,
      });

      expect(decision.accepted).toBe(true);
      if (!decision.accepted) throw new Error("Expected accepted decision");

      const delegation = delegateDecisionToDiv1(decision);
      expect(delegation).not.toBeNull();
      expect(delegation!.payload.cynefin_domain).toBe("CHAOTIC");
      expect(delegation!.payload.recommended_mode).toBe("STABILIZE_FIRST");
      expect(delegation!.diagnostic.emitted).toBe(true);
    });

    it("skips emission for policy-only decisions", () => {
      const decision = decide({
        issue_id: "test_issue",
        signals: ["batch approve routine standard known playbook"],
        confidence: 0.95,
      });

      expect(decision.accepted).toBe(true);
      if (!decision.accepted) throw new Error("Expected accepted decision");

      expect(isPolicyOnlyDecision(decision)).toBe(true);
      const delegation = delegateDecisionToDiv1(decision);
      expect(delegation).toBeNull();
    });

    it("creates correct routing directive for COMPLEX domain", () => {
      const decision = decide({
        issue_id: "test_issue",
        signals: ["unknown ambiguous experiment strategy hypothesis probe"],
        confidence: 0.7,
      });

      expect(decision.accepted).toBe(true);
      if (!decision.accepted) throw new Error("Expected accepted decision");

      expect(decision.cynefin_domain).toBe("COMPLEX");
      const delegated = createDecisionDelegated(decision);
      expect(delegated.cynefin_domain).toBe("COMPLEX");
      expect(delegated.recommended_mode).toBe("SAFE_TO_FAIL_EXPERIMENT");
      expect(delegated.routing_directive.targetDivisions).toContain("Div2.MasterPlanner");
      expect(delegated.routing_directive.targetDivisions).toContain("Div4.Production");
      expect(delegated.routing_directive.requiresBudgetGrant).toBe(true);
      expect(delegated.routing_directive.requiresQA).toBe(true);
    });

    it("creates correct routing directive for CHAOTIC domain", () => {
      const decision = decide({
        issue_id: "test_issue",
        signals: ["outage critical emergency runaway incident breaker stop"],
        confidence: 0.9,
      });

      expect(decision.accepted).toBe(true);
      if (!decision.accepted) throw new Error("Expected accepted decision");

      expect(decision.cynefin_domain).toBe("CHAOTIC");
      const delegated = createDecisionDelegated(decision);
      expect(delegated.cynefin_domain).toBe("CHAOTIC");
      expect(delegated.recommended_mode).toBe("STABILIZE_FIRST");
      expect(delegated.routing_directive.targetDivisions).toContain("Div1.HCO");
      expect(delegated.routing_directive.routingRule).toBe("chaotic_incident_flow");
      expect(delegated.escalation_level).toBe("critical");
    });
  });

  describe("routeAfterDecision - post-decision routing", () => {
    it("routes COMPLEX mission to Div2/Div3/Div4/Div5 after Div7 decision", () => {
      const decision = decide({
        issue_id: "test_issue",
        signals: ["unknown ambiguous experiment strategy hypothesis"],
        confidence: 0.7,
      });

      expect(decision.accepted).toBe(true);
      if (!decision.accepted) throw new Error("Expected accepted decision");

      const delegated = createDecisionDelegated(decision);
      const result = routeAfterDecision("Div1.HCO", "test_mission", delegated);

      expect("status" in result).toBe(true);
      const state = result as { activated_divisions: Division[]; status: string };
      expect(state.status).toBe("ROUTED");
      expect(state.activated_divisions).toContain("Div2.MasterPlanner");
      expect(state.activated_divisions).toContain("Div4.Production");
      expect(state.activated_divisions).toContain("Div5.QualificationsLibraryLearning");
      expect(state.activated_divisions).not.toContain("Div7.MissionControl");
    });

    it("routes CHAOTIC mission to Div1/Div3/Div5 for incident flow", () => {
      const decision = decide({
        issue_id: "test_issue",
        signals: ["outage critical emergency runaway incident"],
        confidence: 0.9,
      });

      expect(decision.accepted).toBe(true);
      if (!decision.accepted) throw new Error("Expected accepted decision");

      const delegated = createDecisionDelegated(decision);
      const result = routeAfterDecision("Div1.HCO", "test_mission", delegated);

      const state = result as { activated_divisions: Division[] };
      expect(state.activated_divisions).toContain("Div1.HCO");
      expect(state.activated_divisions).toContain("Div5.QualificationsLibraryLearning");
    });

    it("rejects routing from non-Div1 caller", () => {
      const decision = decide({
        issue_id: "test_issue",
        signals: ["outage critical emergency"],
        confidence: 0.9,
      });

      if (!decision.accepted) throw new Error("Expected accepted decision");
      const delegated = createDecisionDelegated(decision);

      const result = routeAfterDecision("Div7.MissionControl", "test_mission", delegated);
      expect("authorized" in result).toBe(true);
      if ("authorized" in result) {
        expect(result.authorized).toBe(false);
      }
    });
  });

  describe("Full two-pass flow", () => {
    it("COMPLEX mission: Div7 -> DecisionDelegated -> Div1 -> operational route", () => {
      // Step 1: Mission arrives, Div1 checks if executive decision needed
      const mission = makeMission({
        title: "Strategic architecture decision",
        description: "Need safe-to-fail experiment for new architecture pattern",
        risk_level: "HIGH",
        requested_divisions: ["Div7.MissionControl", "Div2.MasterPlanner", "Div4.Production"],
      });

      const routingResult = routeApprovedMission("Div1.HCO", mission);
      const routingState = routingResult as { activated_divisions: Division[] };
      expect(routingState.activated_divisions).toContain("Div7.MissionControl");

      // Step 2: Div7 makes decision
      clearPacketRouter();
      const decision = decide({
        issue_id: mission.mission_id,
        signals: ["experiment strategy hypothesis ambiguous"],
        confidence: 0.7,
      });

      expect(decision.accepted).toBe(true);
      if (!decision.accepted) throw new Error("Expected accepted decision");

      // Step 3: Div7 delegates to Div1
      const delegation = delegateDecisionToDiv1(decision);
      expect(delegation).not.toBeNull();

      // Step 4: Div1 routes operationally
      const operationalResult = routeAfterDecision(
        "Div1.HCO",
        mission.mission_id,
        delegation!.payload
      );

      const opState = operationalResult as { activated_divisions: Division[] };
      expect(opState.activated_divisions).toContain("Div2.MasterPlanner");
      expect(opState.activated_divisions).toContain("Div4.Production");
      expect(opState.activated_divisions).not.toContain("Div7.MissionControl");
    });

    it("CHAOTIC mission: Div7 authorizes stabilization -> Div1 routes incident flow", () => {
      const mission = makeMission({
        title: "Production outage",
        description: "Critical incident requiring stabilization",
        risk_level: "CRITICAL",
      });

      // Div1 routes to Div7 for executive decision
      const routingResult = routeApprovedMission("Div1.HCO", mission);
      const routingState = routingResult as { activated_divisions: Division[] };
      expect(routingState.activated_divisions).toContain("Div7.MissionControl");

      // Div7 makes chaotic decision
      clearPacketRouter();
      const decision = decide({
        issue_id: mission.mission_id,
        signals: ["outage critical emergency runaway incident breaker"],
        confidence: 0.9,
      });

      expect(decision.accepted).toBe(true);
      if (!decision.accepted) throw new Error("Expected accepted decision");
      expect(decision.cynefin_domain).toBe("CHAOTIC");

      // Div7 delegates to Div1
      const delegation = delegateDecisionToDiv1(decision);
      expect(delegation).not.toBeNull();
      expect(delegation!.payload.recommended_mode).toBe("STABILIZE_FIRST");

      // Div1 routes incident flow
      const operationalResult = routeAfterDecision(
        "Div1.HCO",
        mission.mission_id,
        delegation!.payload
      );

      const opState = operationalResult as { activated_divisions: Division[] };
      expect(opState.activated_divisions).toContain("Div1.HCO");
      expect(opState.activated_divisions).not.toContain("Div7.MissionControl");
    });

    it("routine mission bypasses Div7 entirely", () => {
      const mission = makeMission({
        title: "Implement standard feature",
        description: "Routine implementation task",
        risk_level: "LOW",
        requested_divisions: ["Div2.MasterPlanner", "Div4.Production"],
      });

      const result = routeApprovedMission("Div1.HCO", mission);
      const state = result as { activated_divisions: Division[] };

      // Div7 should not be involved
      expect(state.activated_divisions).not.toContain("Div7.MissionControl");
      expect(state.activated_divisions).toContain("Div2.MasterPlanner");
      expect(state.activated_divisions).toContain("Div4.Production");
    });
  });

  describe("Div7 cannot self-execute", () => {
    it("Div7 cannot directly route to Div4", () => {
      // This is enforced by architecture: Div7 only emits to Div1
      // The test verifies that DecisionDelegated only goes to Div1
      const decision = decide({
        issue_id: "test_issue",
        signals: ["experiment strategy ambiguous"],
        confidence: 0.7,
      });

      expect(decision.accepted).toBe(true);
      if (!decision.accepted) throw new Error("Expected accepted decision");

      const delegation = delegateDecisionToDiv1(decision);
      expect(delegation).not.toBeNull();

      // Check that packet was sent to Div1, not Div4
      const div1Inbox = getDivisionInbox("Div1.HCO");
      const div4Inbox = getDivisionInbox("Div4.Production");

      expect(div1Inbox.length).toBeGreaterThan(0);
      expect(div4Inbox.length).toBe(0);
    });
  });
});
