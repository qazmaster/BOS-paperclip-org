/**
 * Live Routing Test: BOS-T1 through MissionRouter
 *
 * Tests the complete end-to-end routing flow for BOS-T1 through the
 * MissionRouter and DivisionPacketRouter integration.
 *
 * This test verifies:
 * 1. BOS-T1 issue routes correctly to Div4.Production
 * 2. Div4 receives work_assignment packet
 * 3. Routing decision is logged with complete metadata
 * 4. Packet delivery traceability works end-to-end
 * 5. MissionSignals are correctly derived from issue metadata
 *
 * This is a "live routing" test in the sense that it exercises the full
 * routing pipeline (issue → MissionEnvelope → MissionSignals → routeApprovedMission
 * → DivisionPacketRouter → packet delivery → decision log) without mocking.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  IssueLifecycleHookManager,
  missionRouterIssueCreatedHandler,
  issueCreatedToMissionEnvelope,
  getRoutingDecisionLog,
  clearRoutingDecisionLog,
  getPacketsForIssue,
  getRoutingPacketSummary,
  createBosLightHookManager,
  type IssueLifecycleHookEvent,
  type IssueCreatedPayload,
  type RoutingDecisionLogEntry,
} from "../src/issueLifecycleHooks";
import { clearPacketRouter, getDivisionInbox } from "../src/divisionPacketRouter";
import type { MissionRoutingState, MissionRouterUnauthorized, Division } from "../src/contracts";

// ─── Test Constants ──────────────────────────────────────────────────────────

const BOS_T1_ISSUE_ID = "issue-bos-t1-001";
const BOS_T1_IDENTIFIER = "BOS-T1";
const BOS_T1_COMPANY_ID = "company-bos";
const BOS_T1_PROJECT_ID = "proj-bos";

// ─── Test Helpers ────────────────────────────────────────────────────────────

/**
 * Create a BOS-T1 issue payload with realistic metadata.
 * This represents a typical implementation task that should route to Div4.
 */
function makeBosT1Payload(overrides: Partial<IssueCreatedPayload> = {}): IssueCreatedPayload {
  return {
    issueId: BOS_T1_ISSUE_ID,
    companyId: BOS_T1_COMPANY_ID,
    identifier: BOS_T1_IDENTIFIER,
    title: "Implement authentication flow",
    description: "Build the login and registration code for the application",
    status: "open",
    priority: "high",
    projectId: BOS_T1_PROJECT_ID,
    createdAt: "2026-06-02T12:00:00.000Z",
    ...overrides,
  };
}

/**
 * Create a BOS-T1 lifecycle hook event.
 */
function makeBosT1Event(overrides: Partial<IssueCreatedPayload> = {}): IssueLifecycleHookEvent {
  return {
    eventType: "issue.created",
    eventId: "evt-bos-t1-001",
    occurredAt: "2026-06-02T12:00:00.000Z",
    payload: makeBosT1Payload(overrides),
    actor: { type: "user", id: "user-bos" },
  };
}

/**
 * Type guard for authorized routing result.
 */
function isRoutingState(result: MissionRoutingState | MissionRouterUnauthorized): result is MissionRoutingState {
  return "status" in result && result.status === "ROUTED";
}

// ─── BOS-T1 Live Routing Tests ──────────────────────────────────────────────

describe("BOS-T1 Live Routing", () => {
  beforeEach(() => {
    clearPacketRouter();
    clearRoutingDecisionLog();
  });

  // ─── Issue-to-Mission Conversion ───────────────────────────────────────────

  describe("BOS-T1 Issue-to-Mission Conversion", () => {
    it("converts BOS-T1 to a valid MissionEnvelope", () => {
      const payload = makeBosT1Payload();
      const mission = issueCreatedToMissionEnvelope(payload);

      expect(mission.schema_version).toBe("1.0");
      expect(mission.mission_id).toBe(BOS_T1_ISSUE_ID);
      expect(mission.title).toBe("Implement authentication flow");
      expect(mission.description).toBe("Build the login and registration code for the application");
      expect(mission.status).toBe("APPROVED");
      expect(mission.created_at).toBe("2026-06-02T12:00:00.000Z");
    });

    it("infers HIGH risk from high priority", () => {
      const payload = makeBosT1Payload({ priority: "high" });
      const mission = issueCreatedToMissionEnvelope(payload);

      expect(mission.risk_level).toBe("HIGH");
    });

    it("includes Div4.Production for implementation keywords", () => {
      const payload = makeBosT1Payload();
      const mission = issueCreatedToMissionEnvelope(payload);

      // Title contains "implement" and description contains "code"
      expect(mission.requested_divisions).toContain("Div4.Production");
    });

    it("always includes Div1.HCO as the routing authority", () => {
      const payload = makeBosT1Payload();
      const mission = issueCreatedToMissionEnvelope(payload);

      expect(mission.requested_divisions).toContain("Div1.HCO");
    });

    it("sets business_goal with BOS-T1 identifier", () => {
      const payload = makeBosT1Payload();
      const mission = issueCreatedToMissionEnvelope(payload);

      expect(mission.business_goal).toContain(BOS_T1_IDENTIFIER);
      expect(mission.business_goal).toContain("Implement authentication flow");
    });
  });

  // ─── MissionSignals Derivation ─────────────────────────────────────────────

  describe("BOS-T1 MissionSignals Derivation", () => {
    it("derives correct signals for BOS-T1 implementation task", async () => {
      const event = makeBosT1Event();

      await missionRouterIssueCreatedHandler(event);

      const log = getRoutingDecisionLog();
      expect(log).toHaveLength(1);

      const { signals } = log[0];
      expect(signals.taskClass).toBe("technical");
      expect(signals.requiresImplementation).toBe(true);
      expect(signals.riskLevel).toBe("HIGH");
    });

    it("detects code keywords for BOS-T1", async () => {
      const event = makeBosT1Event({
        title: "Build login feature",
        description: "Implement authentication code",
      });

      await missionRouterIssueCreatedHandler(event);

      const log = getRoutingDecisionLog();
      expect(log[0].signals.requiresImplementation).toBe(true);
    });

    it("handles BOS-T1 without QA keywords", async () => {
      const event = makeBosT1Event({
        title: "Implement authentication flow",
        description: "Build the login code",
      });

      await missionRouterIssueCreatedHandler(event);

      const log = getRoutingDecisionLog();
      // No QA keywords → should not require QA
      expect(log[0].signals.requiresQA).toBe(false);
    });
  });

  // ─── Routing Decision ──────────────────────────────────────────────────────

  describe("BOS-T1 Routing Decision", () => {
    it("routes BOS-T1 to Div4.Production", async () => {
      const event = makeBosT1Event();

      await missionRouterIssueCreatedHandler(event);

      const log = getRoutingDecisionLog();
      expect(log).toHaveLength(1);

      const routingResult = log[0].routingResult as MissionRoutingState;
      expect(routingResult.status).toBe("ROUTED");
      expect(routingResult.activated_divisions).toContain("Div4.Production");
    });

    it("sets Div4.Production as current division for BOS-T1", async () => {
      const event = makeBosT1Event();

      await missionRouterIssueCreatedHandler(event);

      const log = getRoutingDecisionLog();
      const routingResult = log[0].routingResult as MissionRoutingState;

      expect(routingResult.current_division).toBe("Div4.Production");
    });

    it("does NOT trigger two-pass routing for routine BOS-T1", async () => {
      const event = makeBosT1Event({
        title: "Implement authentication flow",
        description: "Build login code",
      });

      await missionRouterIssueCreatedHandler(event);

      const log = getRoutingDecisionLog();
      // Routine implementation should not trigger Div7 executive decision
      expect(log[0].twoPassRouting).toBeUndefined();
    });

    it("generates a routing_packet_id for BOS-T1", async () => {
      const event = makeBosT1Event();

      await missionRouterIssueCreatedHandler(event);

      const log = getRoutingDecisionLog();
      const routingResult = log[0].routingResult as MissionRoutingState;

      expect(routingResult.routing_packet_id).toBeDefined();
      expect(routingResult.routing_packet_id).toMatch(/^pkt_/);
    });

    it("includes excluded_divisions for BOS-T1", async () => {
      const event = makeBosT1Event();

      await missionRouterIssueCreatedHandler(event);

      const log = getRoutingDecisionLog();
      const routingResult = log[0].routingResult as MissionRoutingState;

      // Excluded divisions should include divisions not activated
      expect(routingResult.excluded_divisions).toBeDefined();
      expect(Array.isArray(routingResult.excluded_divisions)).toBe(true);
    });
  });

  // ─── Packet Delivery ───────────────────────────────────────────────────────

  describe("BOS-T1 Packet Delivery", () => {
    it("delivers work_assignment packet to Div4.Production", async () => {
      const event = makeBosT1Event();

      await missionRouterIssueCreatedHandler(event);

      const div4Inbox = getDivisionInbox("Div4.Production");
      expect(div4Inbox.length).toBeGreaterThanOrEqual(1);

      const workPacket = div4Inbox.find(p => p.packet_type === "work_assignment");
      expect(workPacket).toBeDefined();
      expect(workPacket!.to_division).toBe("Div4.Production");
      expect(workPacket!.from_division).toBe("Div1.HCO");
    });

    it("delivers status_update to Div7.MissionControl for oversight", async () => {
      const event = makeBosT1Event();

      await missionRouterIssueCreatedHandler(event);

      const div7Inbox = getDivisionInbox("Div7.MissionControl");
      expect(div7Inbox.length).toBeGreaterThanOrEqual(1);

      const statusPacket = div7Inbox.find(p => p.packet_type === "status_update");
      expect(statusPacket).toBeDefined();
      expect(statusPacket!.to_division).toBe("Div7.MissionControl");
    });

    it("includes packet_id and timestamp in Div4 delivery", async () => {
      const event = makeBosT1Event();

      await missionRouterIssueCreatedHandler(event);

      const log = getRoutingDecisionLog();
      const div4Delivery = log[0].packetDeliveries.find(
        d => d.toDivision === "Div4.Production"
      );

      expect(div4Delivery).toBeDefined();
      expect(div4Delivery!.packetId).toMatch(/^pkt_/);
      expect(div4Delivery!.packetType).toBe("work_assignment");
      expect(div4Delivery!.deliveredAt).toBeDefined();
    });

    it("tracks BOS-T1 packets via getPacketsForIssue", async () => {
      const event = makeBosT1Event();

      await missionRouterIssueCreatedHandler(event);

      const packets = getPacketsForIssue(BOS_T1_ISSUE_ID);
      expect(packets.length).toBeGreaterThanOrEqual(1);

      // Should include Div4 work_assignment
      const div4Packet = packets.find(p => p.toDivision === "Div4.Production");
      expect(div4Packet).toBeDefined();
    });

    it("packet count matches activated divisions + Div7 oversight", async () => {
      const event = makeBosT1Event();

      await missionRouterIssueCreatedHandler(event);

      const log = getRoutingDecisionLog();
      const routingResult = log[0].routingResult as MissionRoutingState;
      const packetCount = log[0].packetDeliveries.length;

      // Each activated division gets work_assignment + Div7 gets status_update
      const expectedMinPackets = routingResult.activated_divisions.length + 1;
      expect(packetCount).toBeGreaterThanOrEqual(expectedMinPackets);
    });
  });

  // ─── Routing Decision Log ──────────────────────────────────────────────────

  describe("BOS-T1 Routing Decision Log", () => {
    it("logs routing decision with complete metadata", async () => {
      const event = makeBosT1Event();

      await missionRouterIssueCreatedHandler(event);

      const log = getRoutingDecisionLog();
      expect(log).toHaveLength(1);

      const entry = log[0];
      expect(entry.issueId).toBe(BOS_T1_ISSUE_ID);
      expect(entry.identifier).toBe(BOS_T1_IDENTIFIER);
      expect(entry.missionId).toBe(BOS_T1_ISSUE_ID);
      expect(entry.signals).toBeDefined();
      expect(entry.routingResult).toBeDefined();
      expect(entry.packetDeliveries).toBeDefined();
      expect(entry.routedAt).toBeDefined();
    });

    it("includes MissionSignals in routing decision log", async () => {
      const event = makeBosT1Event();

      await missionRouterIssueCreatedHandler(event);

      const log = getRoutingDecisionLog();
      const { signals } = log[0];

      // Verify signal structure
      expect(signals.taskClass).toBeDefined();
      expect(signals.riskLevel).toBeDefined();
      expect(typeof signals.requiresImplementation).toBe("boolean");
      expect(typeof signals.requiresQA).toBe("boolean");
      expect(typeof signals.requiresExternalData).toBe("boolean");
      expect(typeof signals.incidentSignals).toBe("boolean");
      expect(typeof signals.policySignals).toBe("boolean");
      expect(signals.ambiguityLevel).toBeDefined();
    });

    it("includes packet delivery records in routing decision log", async () => {
      const event = makeBosT1Event();

      await missionRouterIssueCreatedHandler(event);

      const log = getRoutingDecisionLog();
      const { packetDeliveries } = log[0];

      expect(packetDeliveries.length).toBeGreaterThan(0);

      for (const delivery of packetDeliveries) {
        expect(delivery.packetId).toMatch(/^pkt_/);
        expect(delivery.packetType).toBeDefined();
        expect(delivery.toDivision).toBeDefined();
        expect(delivery.fromDivision).toBe("Div1.HCO");
        expect(delivery.deliveredAt).toBeDefined();
      }
    });

    it("timestamps routing decision in ISO format", async () => {
      const event = makeBosT1Event();

      await missionRouterIssueCreatedHandler(event);

      const log = getRoutingDecisionLog();
      const { routedAt } = log[0];

      // Should be valid ISO date
      const parsed = new Date(routedAt);
      expect(parsed.getTime()).not.toBeNaN();
      expect(routedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  // ─── Hook Handler Result ───────────────────────────────────────────────────

  describe("BOS-T1 Hook Handler Result", () => {
    it("returns handled=true for successful routing", async () => {
      const event = makeBosT1Event();

      const result = await missionRouterIssueCreatedHandler(event);

      expect(result.handled).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("includes BOS-T1 identifier in handler message", async () => {
      const event = makeBosT1Event();

      const result = await missionRouterIssueCreatedHandler(event);

      expect(result.message).toContain(BOS_T1_IDENTIFIER);
    });

    it("includes routing destination in handler message", async () => {
      const event = makeBosT1Event();

      const result = await missionRouterIssueCreatedHandler(event);

      expect(result.message).toContain("Div4.Production");
    });

    it("includes packet count in handler message", async () => {
      const event = makeBosT1Event();

      const result = await missionRouterIssueCreatedHandler(event);

      expect(result.message).toContain("packet");
    });

    it("includes task class in handler message", async () => {
      const event = makeBosT1Event();

      const result = await missionRouterIssueCreatedHandler(event);

      expect(result.message).toContain("[technical]");
    });

    it("measures handler execution duration", async () => {
      const event = makeBosT1Event();

      const result = await missionRouterIssueCreatedHandler(event);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.durationMs).toBe("number");
    });
  });

  // ─── End-to-End Integration ────────────────────────────────────────────────

  describe("BOS-T1 End-to-End Routing Flow", () => {
    it("complete flow: BOS-T1 issue create → MissionRouter → Div4 packet delivery", async () => {
      const manager = createBosLightHookManager();

      // Create BOS-T1 event
      const event = makeBosT1Event();

      // Dispatch through hook manager
      const logs = await manager.dispatchEvent(event);

      // 1. Both logging and MissionRouter hooks should fire
      expect(logs).toHaveLength(2);

      const routerLog = logs.find(l => l.handlerName === "bos-light-mission-router");
      expect(routerLog).toBeDefined();
      expect(routerLog!.result.handled).toBe(true);

      const loggingLog = logs.find(l => l.handlerName === "bos-light-log-created");
      expect(loggingLog).toBeDefined();
      expect(loggingLog!.result.handled).toBe(true);

      // 2. Routing decision was logged
      const decisionLog = getRoutingDecisionLog();
      expect(decisionLog).toHaveLength(1);

      const entry = decisionLog[0];
      expect(entry.issueId).toBe(BOS_T1_ISSUE_ID);
      expect(entry.identifier).toBe(BOS_T1_IDENTIFIER);

      // 3. Routing result shows Div4.Production activated
      const routingResult = entry.routingResult as MissionRoutingState;
      expect(routingResult.status).toBe("ROUTED");
      expect(routingResult.activated_divisions).toContain("Div4.Production");
      expect(routingResult.current_division).toBe("Div4.Production");

      // 4. Div4 received work_assignment packet
      const div4Inbox = getDivisionInbox("Div4.Production");
      expect(div4Inbox.length).toBeGreaterThanOrEqual(1);

      const workPacket = div4Inbox.find(p => p.packet_type === "work_assignment");
      expect(workPacket).toBeDefined();
      expect(workPacket!.to_division).toBe("Div4.Production");

      // 5. Packet delivery records match inbox
      const div4Delivery = entry.packetDeliveries.find(
        d => d.toDivision === "Div4.Production"
      );
      expect(div4Delivery).toBeDefined();
      expect(div4Delivery!.packetId).toBe(workPacket!.packet_id);

      // 6. Packets traceable by issue ID
      const tracedPackets = getPacketsForIssue(BOS_T1_ISSUE_ID);
      expect(tracedPackets.length).toBe(entry.packetDeliveries.length);

      // 7. Routing packet summary shows Div4
      const summary = getRoutingPacketSummary();
      expect(summary.has("Div4.Production")).toBe(true);
      const div4Summary = summary.get("Div4.Production");
      expect(div4Summary!.count).toBeGreaterThanOrEqual(1);
      expect(div4Summary!.latestPacketId).toMatch(/^pkt_/);
    });

    it("BOS-T1 routing works alongside other issues", async () => {
      const manager = createBosLightHookManager();

      // Route BOS-T1
      const bosT1Event = makeBosT1Event();
      await manager.dispatchEvent(bosT1Event);

      // Route another issue
      const otherEvent = makeBosT1Event({
        issueId: "issue-other-001",
        identifier: "OTHER-1",
        title: "Fix CSS bug",
        description: "Simple layout fix",
      });
      await manager.dispatchEvent(otherEvent);

      // Verify both routing decisions logged
      const log = getRoutingDecisionLog();
      expect(log).toHaveLength(2);

      // BOS-T1 should route to Div4
      const bosT1Entry = log.find(e => e.identifier === BOS_T1_IDENTIFIER);
      expect(bosT1Entry).toBeDefined();
      const bosT1Result = bosT1Entry!.routingResult as MissionRoutingState;
      expect(bosT1Result.activated_divisions).toContain("Div4.Production");

      // Other issue should also route to Div4 (CSS fix)
      const otherEntry = log.find(e => e.identifier === "OTHER-1");
      expect(otherEntry).toBeDefined();
      const otherResult = otherEntry!.routingResult as MissionRoutingState;
      expect(otherResult.activated_divisions).toContain("Div4.Production");

      // Div4 inbox should have packets from both issues
      const div4Inbox = getDivisionInbox("Div4.Production");
      expect(div4Inbox.length).toBeGreaterThanOrEqual(2);
    });

    it("BOS-T1 with QA keywords routes to both Div4 and Div5", async () => {
      const manager = createBosLightHookManager();

      const event = makeBosT1Event({
        title: "Implement and test authentication flow",
        description: "Build login code and run quality tests",
      });

      await manager.dispatchEvent(event);

      const log = getRoutingDecisionLog();
      const routingResult = log[0].routingResult as MissionRoutingState;

      // Should route to both Div4 (implementation) and Div5 (QA)
      expect(routingResult.activated_divisions).toContain("Div4.Production");
      expect(routingResult.activated_divisions).toContain("Div5.QualificationsLibraryLearning");

      // Both divisions should receive packets
      const div4Inbox = getDivisionInbox("Div4.Production");
      const div5Inbox = getDivisionInbox("Div5.QualificationsLibraryLearning");
      expect(div4Inbox.length).toBeGreaterThanOrEqual(1);
      expect(div5Inbox.length).toBeGreaterThanOrEqual(1);
    });

    it("BOS-T1 with strategy keywords triggers two-pass routing", async () => {
      const manager = createBosLightHookManager();

      const event = makeBosT1Event({
        title: "Strategic direction unclear for authentication",
        description: "Ambiguous policy decision needed for login approach",
      });

      await manager.dispatchEvent(event);

      const log = getRoutingDecisionLog();
      const entry = log[0];

      // Should trigger Div7 executive decision
      expect(entry.twoPassRouting).toBeDefined();
      expect(entry.twoPassRouting!.decisionDelegated).toBeDefined();

      // First pass routes to Div7
      const firstPassResult = entry.routingResult as MissionRoutingState;
      expect(firstPassResult.activated_divisions).toContain("Div7.MissionControl");

      // Second pass routes to operational divisions
      const secondPassResult = entry.twoPassRouting!.operationalRoutingResult as MissionRoutingState;
      expect(secondPassResult.activated_divisions.length).toBeGreaterThan(0);
      expect(secondPassResult.activated_divisions).not.toContain("Div7.MissionControl");
    });
  });

  // ─── Packet Summary and Traceability ───────────────────────────────────────

  describe("BOS-T1 Packet Summary and Traceability", () => {
    it("getRoutingPacketSummary includes Div4 after BOS-T1 routing", async () => {
      await missionRouterIssueCreatedHandler(makeBosT1Event());

      const summary = getRoutingPacketSummary();

      expect(summary.has("Div4.Production")).toBe(true);
      const div4Info = summary.get("Div4.Production")!;
      expect(div4Info.count).toBeGreaterThanOrEqual(1);
      expect(div4Info.latestPacketId).toMatch(/^pkt_/);
    });

    it("getPacketsForIssue returns all BOS-T1 packets", async () => {
      await missionRouterIssueCreatedHandler(makeBosT1Event());

      const packets = getPacketsForIssue(BOS_T1_ISSUE_ID);

      expect(packets.length).toBeGreaterThanOrEqual(1);

      // Should include Div4 packet
      const div4Packet = packets.find(p => p.toDivision === "Div4.Production");
      expect(div4Packet).toBeDefined();
      expect(div4Packet!.packetType).toBe("work_assignment");
    });

    it("clearRoutingDecisionLog clears BOS-T1 data", async () => {
      await missionRouterIssueCreatedHandler(makeBosT1Event());

      expect(getRoutingDecisionLog()).toHaveLength(1);
      expect(getPacketsForIssue(BOS_T1_ISSUE_ID).length).toBeGreaterThan(0);

      clearRoutingDecisionLog();

      expect(getRoutingDecisionLog()).toHaveLength(0);
      expect(getPacketsForIssue(BOS_T1_ISSUE_ID)).toHaveLength(0);
    });
  });

  // ─── Edge Cases ────────────────────────────────────────────────────────────

  describe("BOS-T1 Edge Cases", () => {
    it("handles BOS-T1 with missing description", async () => {
      const event = makeBosT1Event({
        description: undefined,
      });

      const result = await missionRouterIssueCreatedHandler(event);

      expect(result.handled).toBe(true);

      const log = getRoutingDecisionLog();
      expect(log).toHaveLength(1);

      const routingResult = log[0].routingResult as MissionRoutingState;
      expect(routingResult.status).toBe("ROUTED");
    });

    it("handles BOS-T1 with empty description", async () => {
      const event = makeBosT1Event({
        description: "",
      });

      const result = await missionRouterIssueCreatedHandler(event);

      expect(result.handled).toBe(true);

      const log = getRoutingDecisionLog();
      const mission = issueCreatedToMissionEnvelope(event.payload as IssueCreatedPayload);
      // Empty string is not nullish, so it's used as-is
      expect(mission.description).toBe("");
    });

    it("handles BOS-T1 with different priority levels", async () => {
      // Test urgent priority
      const urgentEvent = makeBosT1Event({ priority: "urgent" });
      await missionRouterIssueCreatedHandler(urgentEvent);

      const log = getRoutingDecisionLog();
      expect(log[0].signals.riskLevel).toBe("CRITICAL");

      // Test low priority
      clearPacketRouter();
      clearRoutingDecisionLog();

      const lowEvent = makeBosT1Event({ priority: "low" });
      await missionRouterIssueCreatedHandler(lowEvent);

      const log2 = getRoutingDecisionLog();
      expect(log2[0].signals.riskLevel).toBe("LOW");
    });

    it("handles BOS-T1 with incident keywords", async () => {
      const event = makeBosT1Event({
        title: "Production outage in authentication",
        description: "Emergency fix needed for login crash",
      });

      await missionRouterIssueCreatedHandler(event);

      const log = getRoutingDecisionLog();
      expect(log[0].signals.incidentSignals).toBe(true);
      expect(log[0].signals.riskLevel).toBe("CRITICAL");
    });
  });
});
