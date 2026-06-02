import { describe, it, expect, beforeEach } from "vitest";
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
  type PacketDeliveryRecord,
} from "../src/issueLifecycleHooks";
import { clearPacketRouter, getDivisionInbox } from "../src/divisionPacketRouter";
import type { MissionRoutingState, MissionRouterUnauthorized, Division } from "../src/contracts";

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeCreatedEvent(
  overrides: Partial<IssueCreatedPayload> = {}
): IssueLifecycleHookEvent {
  return {
    eventType: "issue.created",
    eventId: "evt-hook-001",
    occurredAt: "2026-06-02T12:00:00.000Z",
    payload: {
      issueId: "issue-route-001",
      companyId: "company-abc",
      identifier: "BOS-T1",
      title: "Implement auth flow",
      description: "Build code authentication feature",
      status: "open",
      priority: "high",
      projectId: "proj-001",
      createdAt: "2026-06-02T12:00:00.000Z",
      ...overrides,
    },
    actor: { type: "user", id: "user-001" },
  };
}

// ─── issueCreatedToMissionEnvelope ───────────────────────────────────────────

describe("issueCreatedToMissionEnvelope", () => {
  it("converts a basic issue to a MissionEnvelope", () => {
    const payload: IssueCreatedPayload = {
      issueId: "issue-100",
      companyId: "company-1",
      identifier: "BOS-100",
      title: "Fix login bug",
      description: "Users cannot login",
      status: "open",
      createdAt: "2026-06-02T12:00:00.000Z",
    };

    const mission = issueCreatedToMissionEnvelope(payload);

    expect(mission.schema_version).toBe("1.0");
    expect(mission.mission_id).toBe("issue-100");
    expect(mission.title).toBe("Fix login bug");
    expect(mission.description).toBe("Users cannot login");
    expect(mission.status).toBe("APPROVED");
    expect(mission.risk_level).toBe("MEDIUM");
    expect(mission.requested_divisions).toContain("Div1.HCO");
  });

  it("infers CRITICAL risk from urgent priority", () => {
    const payload: IssueCreatedPayload = {
      issueId: "issue-101",
      companyId: "company-1",
      identifier: "BOS-101",
      title: "Fix payment bug",
      status: "open",
      priority: "urgent",
      createdAt: "2026-06-02T12:00:00.000Z",
    };

    const mission = issueCreatedToMissionEnvelope(payload);
    expect(mission.risk_level).toBe("CRITICAL");
  });

  it("infers HIGH risk from high priority", () => {
    const payload: IssueCreatedPayload = {
      issueId: "issue-102",
      companyId: "company-1",
      identifier: "BOS-102",
      title: "Improve performance",
      status: "open",
      priority: "high",
      createdAt: "2026-06-02T12:00:00.000Z",
    };

    const mission = issueCreatedToMissionEnvelope(payload);
    expect(mission.risk_level).toBe("HIGH");
  });

  it("infers LOW risk from low priority", () => {
    const payload: IssueCreatedPayload = {
      issueId: "issue-103",
      companyId: "company-1",
      identifier: "BOS-103",
      title: "Update readme",
      status: "open",
      priority: "low",
      createdAt: "2026-06-02T12:00:00.000Z",
    };

    const mission = issueCreatedToMissionEnvelope(payload);
    expect(mission.risk_level).toBe("LOW");
  });

  it("infers CRITICAL risk from incident keywords", () => {
    const payload: IssueCreatedPayload = {
      issueId: "issue-104",
      companyId: "company-1",
      identifier: "BOS-104",
      title: "Production outage detected",
      status: "open",
      createdAt: "2026-06-02T12:00:00.000Z",
    };

    const mission = issueCreatedToMissionEnvelope(payload);
    expect(mission.risk_level).toBe("CRITICAL");
  });

  it("infers LOW risk from experiment keywords", () => {
    const payload: IssueCreatedPayload = {
      issueId: "issue-105",
      companyId: "company-1",
      identifier: "BOS-105",
      title: "Spike on new caching approach",
      status: "open",
      priority: "medium",
      createdAt: "2026-06-02T12:00:00.000Z",
    };

    const mission = issueCreatedToMissionEnvelope(payload);
    expect(mission.risk_level).toBe("LOW");
  });

  it("adds Div4.Production for code/feature keywords", () => {
    const payload: IssueCreatedPayload = {
      issueId: "issue-106",
      companyId: "company-1",
      identifier: "BOS-106",
      title: "Implement dark mode feature",
      status: "open",
      createdAt: "2026-06-02T12:00:00.000Z",
    };

    const mission = issueCreatedToMissionEnvelope(payload);
    expect(mission.requested_divisions).toContain("Div4.Production");
  });

  it("adds Div5.QualificationsLibraryLearning for QA keywords", () => {
    const payload: IssueCreatedPayload = {
      issueId: "issue-107",
      companyId: "company-1",
      identifier: "BOS-107",
      title: "Security audit needed",
      status: "open",
      createdAt: "2026-06-02T12:00:00.000Z",
    };

    const mission = issueCreatedToMissionEnvelope(payload);
    expect(mission.requested_divisions).toContain("Div5.QualificationsLibraryLearning");
  });

  it("adds Div6.External for external/API keywords", () => {
    const payload: IssueCreatedPayload = {
      issueId: "issue-108",
      companyId: "company-1",
      identifier: "BOS-108",
      title: "Third-party API integration",
      status: "open",
      createdAt: "2026-06-02T12:00:00.000Z",
    };

    const mission = issueCreatedToMissionEnvelope(payload);
    expect(mission.requested_divisions).toContain("Div6.External");
  });

  it("adds Div3.Treasury for budget keywords", () => {
    const payload: IssueCreatedPayload = {
      issueId: "issue-109",
      companyId: "company-1",
      identifier: "BOS-109",
      title: "Budget allocation for Q3",
      status: "open",
      createdAt: "2026-06-02T12:00:00.000Z",
    };

    const mission = issueCreatedToMissionEnvelope(payload);
    expect(mission.requested_divisions).toContain("Div3.Treasury");
  });

  it("adds Div7.MissionControl for strategy/policy keywords", () => {
    const payload: IssueCreatedPayload = {
      issueId: "issue-110",
      companyId: "company-1",
      identifier: "BOS-110",
      title: "Strategic direction unclear",
      status: "open",
      createdAt: "2026-06-02T12:00:00.000Z",
    };

    const mission = issueCreatedToMissionEnvelope(payload);
    expect(mission.requested_divisions).toContain("Div7.MissionControl");
  });

  it("deduplicates divisions", () => {
    const payload: IssueCreatedPayload = {
      issueId: "issue-111",
      companyId: "company-1",
      identifier: "BOS-111",
      title: "Build and implement new feature code refactor",
      description: "Code quality improvement",
      status: "open",
      createdAt: "2026-06-02T12:00:00.000Z",
    };

    const mission = issueCreatedToMissionEnvelope(payload);
    const div4Count = mission.requested_divisions.filter(d => d === "Div4.Production").length;
    expect(div4Count).toBe(1);
  });

  it("handles missing description gracefully", () => {
    const payload: IssueCreatedPayload = {
      issueId: "issue-112",
      companyId: "company-1",
      identifier: "BOS-112",
      title: "Simple task",
      status: "open",
      createdAt: "2026-06-02T12:00:00.000Z",
    };

    const mission = issueCreatedToMissionEnvelope(payload);
    expect(mission.description).toBe("Simple task");
  });

  it("always includes Div1.HCO", () => {
    const payload: IssueCreatedPayload = {
      issueId: "issue-113",
      companyId: "company-1",
      identifier: "BOS-113",
      title: "Unknown task type",
      status: "open",
      createdAt: "2026-06-02T12:00:00.000Z",
    };

    const mission = issueCreatedToMissionEnvelope(payload);
    expect(mission.requested_divisions).toContain("Div1.HCO");
  });
});

// ─── missionRouterIssueCreatedHandler ────────────────────────────────────────

describe("missionRouterIssueCreatedHandler", () => {
  beforeEach(() => {
    clearPacketRouter();
    clearRoutingDecisionLog();
  });

  it("routes an issue.created event through MissionRouter", async () => {
    const event = makeCreatedEvent({
      title: "Implement authentication code",
      description: "Build login feature for the app",
    });

    const result = await missionRouterIssueCreatedHandler(event);

    expect(result.handled).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.message).toContain("BOS-T1");
  });

  it("logs routing decisions", async () => {
    const event = makeCreatedEvent({
      issueId: "issue-log-001",
      identifier: "BOS-LOG-1",
      title: "Implement dark mode feature",
    });

    await missionRouterIssueCreatedHandler(event);

    const log = getRoutingDecisionLog();
    expect(log).toHaveLength(1);
    expect(log[0].issueId).toBe("issue-log-001");
    expect(log[0].identifier).toBe("BOS-LOG-1");
    expect(log[0].signals).toBeDefined();
    expect(log[0].routingResult).toBeDefined();
    expect(log[0].routedAt).toBeDefined();
  });

  it("derives MissionSignals from issue metadata", async () => {
    const event = makeCreatedEvent({
      title: "Code feature implementation build",
      description: "Build the new feature",
    });

    await missionRouterIssueCreatedHandler(event);

    const log = getRoutingDecisionLog();
    expect(log).toHaveLength(1);
    expect(log[0].signals.taskClass).toBe("technical");
    expect(log[0].signals.requiresImplementation).toBe(true);
  });

  it("routes to Div4.Production for implementation issues", async () => {
    const event = makeCreatedEvent({
      title: "Implement new login page",
      description: "Build the login feature",
    });

    await missionRouterIssueCreatedHandler(event);

    const log = getRoutingDecisionLog();
    const state = log[0].routingResult as MissionRoutingState;
    expect(state.status).toBe("ROUTED");
    expect(state.activated_divisions).toContain("Div4.Production");
  });

  it("routes to Div5 for QA/security issues", async () => {
    const event = makeCreatedEvent({
      title: "Quality assurance testing needed",
      description: "Run tests to verify functionality",
    });

    await missionRouterIssueCreatedHandler(event);

    const log = getRoutingDecisionLog();
    const state = log[0].routingResult as MissionRoutingState;
    expect(state.activated_divisions).toContain("Div5.QualificationsLibraryLearning");
  });

  it("routes to Div7 when strategy keywords are present", async () => {
    const event = makeCreatedEvent({
      title: "Strategic direction unclear",
      description: "Policy decision needed on ambiguous requirements",
    });

    await missionRouterIssueCreatedHandler(event);

    const log = getRoutingDecisionLog();
    const state = log[0].routingResult as MissionRoutingState;
    // Strategy keywords trigger Div7.MissionControl in requested_divisions,
    // which triggers requires_executive_decision routing
    expect(state.activated_divisions).toContain("Div7.MissionControl");
  });

  it("emits packets to division inboxes", async () => {
    const event = makeCreatedEvent({
      title: "Implement feature code",
      description: "Build new feature",
    });

    await missionRouterIssueCreatedHandler(event);

    // Div4.Production should receive a work_assignment packet
    const div4Inbox = getDivisionInbox("Div4.Production");
    expect(div4Inbox.length).toBeGreaterThanOrEqual(1);
    expect(div4Inbox[div4Inbox.length - 1].packet_type).toBe("work_assignment");
  });

  it("logs routing decision signals correctly", async () => {
    const event = makeCreatedEvent({
      title: "External API integration needed",
      description: "Third-party webhook setup for partner",
    });

    await missionRouterIssueCreatedHandler(event);

    const log = getRoutingDecisionLog();
    expect(log[0].signals.requiresExternalData).toBe(true);
    expect(log[0].signals.taskClass).toBe("external");
  });

  it("handles errors gracefully", async () => {
    // Create an event with missing fields to test error handling
    const event: IssueLifecycleHookEvent = {
      eventType: "issue.created",
      eventId: "evt-error-001",
      occurredAt: "2026-06-02T12:00:00.000Z",
      payload: {} as IssueCreatedPayload,
      actor: { type: "system", id: "test" },
    };

    const result = await missionRouterIssueCreatedHandler(event);
    // Should still handle gracefully (either succeed with defaults or capture error)
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("accumulates multiple routing decisions in the log", async () => {
    const event1 = makeCreatedEvent({ issueId: "issue-201", identifier: "BOS-201", title: "Feature A" });
    const event2 = makeCreatedEvent({ issueId: "issue-202", identifier: "BOS-202", title: "Feature B" });
    const event3 = makeCreatedEvent({ issueId: "issue-203", identifier: "BOS-203", title: "Feature C" });

    await missionRouterIssueCreatedHandler(event1);
    await missionRouterIssueCreatedHandler(event2);
    await missionRouterIssueCreatedHandler(event3);

    const log = getRoutingDecisionLog();
    expect(log).toHaveLength(3);
    expect(log[0].issueId).toBe("issue-201");
    expect(log[1].issueId).toBe("issue-202");
    expect(log[2].issueId).toBe("issue-203");
  });

  it("respects log limit parameter", async () => {
    for (let i = 0; i < 5; i++) {
      await missionRouterIssueCreatedHandler(
        makeCreatedEvent({ issueId: `issue-${i}`, identifier: `BOS-${i}`, title: "Task" })
      );
    }

    expect(getRoutingDecisionLog(2)).toHaveLength(2);
  });

  it("clears routing decision log", async () => {
    await missionRouterIssueCreatedHandler(makeCreatedEvent());
    expect(getRoutingDecisionLog()).toHaveLength(1);

    clearRoutingDecisionLog();
    expect(getRoutingDecisionLog()).toHaveLength(0);
  });
});

// ─── createBosLightHookManager with MissionRouter ────────────────────────────

describe("createBosLightHookManager with MissionRouter integration", () => {
  beforeEach(() => {
    clearPacketRouter();
    clearRoutingDecisionLog();
  });

  it("registers the MissionRouter hook alongside logging hooks", () => {
    const manager = createBosLightHookManager();

    expect(manager.listHandlers("issue.created")).toContain("bos-light-mission-router");
    expect(manager.listHandlers("issue.created")).toContain("bos-light-log-created");
  });

  it("fires both logging and MissionRouter hooks on issue.created", async () => {
    const manager = createBosLightHookManager();

    const event = makeCreatedEvent({
      title: "Implement login feature code",
      description: "Build authentication",
    });

    const logs = await manager.dispatchEvent(event);

    // Both handlers should fire
    expect(logs).toHaveLength(2);
    const logHandler = logs.find(l => l.handlerName === "bos-light-log-created");
    const routerHandler = logs.find(l => l.handlerName === "bos-light-mission-router");

    expect(logHandler).toBeDefined();
    expect(logHandler!.result.handled).toBe(true);
    expect(routerHandler).toBeDefined();
    expect(routerHandler!.result.handled).toBe(true);
  });

  it("MissionRouter hook logs routing decisions when manager dispatches", async () => {
    const manager = createBosLightHookManager();

    await manager.dispatchEvent(makeCreatedEvent({
      issueId: "issue-e2e-001",
      identifier: "BOS-E2E-1",
      title: "Build feature code",
    }));

    const log = getRoutingDecisionLog();
    expect(log).toHaveLength(1);
    expect(log[0].issueId).toBe("issue-e2e-001");
    expect(log[0].signals).toBeDefined();
  });

  it("end-to-end: issue create → MissionSignals → routing decision → packet delivery", async () => {
    const manager = createBosLightHookManager();

    // Create an issue that should route to Div4.Production and Div5 for QA
    const event = makeCreatedEvent({
      issueId: "issue-e2e-002",
      identifier: "BOS-E2E-2",
      title: "Implement and test new authentication feature",
      description: "Build code and run quality audit",
    });

    const logs = await manager.dispatchEvent(event);
    const routerLog = logs.find(l => l.handlerName === "bos-light-mission-router");
    expect(routerLog!.result.handled).toBe(true);

    // Verify routing decision was logged
    const decisionLog = getRoutingDecisionLog();
    expect(decisionLog).toHaveLength(1);

    const { signals, routingResult } = decisionLog[0];
    expect(signals.requiresImplementation).toBe(true);
    expect(signals.requiresQA).toBe(true);

    const state = routingResult as MissionRoutingState;
    expect(state.status).toBe("ROUTED");
    expect(state.activated_divisions).toContain("Div4.Production");
    expect(state.activated_divisions).toContain("Div5.QualificationsLibraryLearning");

    // Verify packets were delivered
    const div4Inbox = getDivisionInbox("Div4.Production");
    expect(div4Inbox.length).toBeGreaterThanOrEqual(1);

    const div5Inbox = getDivisionInbox("Div5.QualificationsLibraryLearning");
    expect(div5Inbox.length).toBeGreaterThanOrEqual(1);
  });

  it("end-to-end: issue with Div7 keywords triggers executive decision routing", async () => {
    const manager = createBosLightHookManager();

    const event = makeCreatedEvent({
      issueId: "issue-e2e-003",
      identifier: "BOS-E2E-3",
      title: "Strategic policy direction needed",
      description: "Ambiguous strategy question with uncertain outcomes",
    });

    await manager.dispatchEvent(event);

    const decisionLog = getRoutingDecisionLog();
    expect(decisionLog).toHaveLength(1);

    const { signals, routingResult } = decisionLog[0];
    expect(signals.policySignals).toBe(true);

    const state = routingResult as MissionRoutingState;
    // Div7 should be the activated division for executive decision
    expect(state.activated_divisions).toContain("Div7.MissionControl");
    expect(state.current_division).toBe("Div7.MissionControl");
  });

  it("end-to-end: routine code issue routes directly to Div4 without Div7", async () => {
    const manager = createBosLightHookManager();

    const event = makeCreatedEvent({
      issueId: "issue-e2e-004",
      identifier: "BOS-E2E-4",
      title: "Fix CSS styling bug",
      description: "Fix the broken layout on mobile",
    });

    await manager.dispatchEvent(event);

    const decisionLog = getRoutingDecisionLog();
    const { signals, routingResult } = decisionLog[0];

    expect(signals.incidentSignals).toBe(false);
    expect(signals.policySignals).toBe(false);

    const state = routingResult as MissionRoutingState;
    expect(state.activated_divisions).not.toContain("Div7.MissionControl");
    expect(state.activated_divisions).toContain("Div4.Production");
  });
});

// ─── DivisionPacketRouter Wiring ─────────────────────────────────────────────

describe("DivisionPacketRouter wiring to routing decisions", () => {
  beforeEach(() => {
    clearPacketRouter();
    clearRoutingDecisionLog();
  });

  it("routing decision includes packet delivery records", async () => {
    const event = makeCreatedEvent({
      issueId: "issue-pkt-001",
      identifier: "BOS-PKT-1",
      title: "Implement feature code",
      description: "Build new feature",
    });

    await missionRouterIssueCreatedHandler(event);

    const log = getRoutingDecisionLog();
    expect(log).toHaveLength(1);
    expect(log[0].packetDeliveries).toBeDefined();
    expect(log[0].packetDeliveries.length).toBeGreaterThan(0);
  });

  it("packet delivery records contain correct packet metadata", async () => {
    const event = makeCreatedEvent({
      issueId: "issue-pkt-002",
      identifier: "BOS-PKT-2",
      title: "Implement dark mode code",
      description: "Build new dark theme feature",
    });

    await missionRouterIssueCreatedHandler(event);

    const log = getRoutingDecisionLog();
    const deliveries = log[0].packetDeliveries;

    // Each delivery should have valid fields
    for (const d of deliveries) {
      expect(d.packetId).toMatch(/^pkt_/);
      expect(d.packetType).toBeDefined();
      expect(d.toDivision).toBeDefined();
      expect(d.fromDivision).toBe("Div1.HCO");
      expect(d.deliveredAt).toBeDefined();
    }
  });

  it("Div4 receives work_assignment packet from routing decision", async () => {
    const event = makeCreatedEvent({
      issueId: "issue-pkt-003",
      identifier: "BOS-PKT-3",
      title: "Build new code feature",
      description: "Implement the feature",
    });

    await missionRouterIssueCreatedHandler(event);

    const log = getRoutingDecisionLog();
    const div4Delivery = log[0].packetDeliveries.find(
      d => d.toDivision === "Div4.Production"
    );

    expect(div4Delivery).toBeDefined();
    expect(div4Delivery!.packetType).toBe("work_assignment");
  });

  it("Div5 receives QA request packet when QA keywords present", async () => {
    const event = makeCreatedEvent({
      issueId: "issue-pkt-004",
      identifier: "BOS-PKT-4",
      title: "Implement and test new feature",
      description: "Build code and verify quality",
    });

    await missionRouterIssueCreatedHandler(event);

    const log = getRoutingDecisionLog();
    const div5Delivery = log[0].packetDeliveries.find(
      d => d.toDivision === "Div5.QualificationsLibraryLearning"
    );

    expect(div5Delivery).toBeDefined();
    expect(div5Delivery!.packetType).toBe("work_assignment");
  });

  it("Div7 receives status_update packet for oversight on routine routing", async () => {
    const event = makeCreatedEvent({
      issueId: "issue-pkt-005",
      identifier: "BOS-PKT-5",
      title: "Fix CSS bug",
      description: "Simple layout fix",
    });

    await missionRouterIssueCreatedHandler(event);

    const log = getRoutingDecisionLog();
    const div7Delivery = log[0].packetDeliveries.find(
      d => d.toDivision === "Div7.MissionControl"
    );

    expect(div7Delivery).toBeDefined();
    expect(div7Delivery!.packetType).toBe("status_update");
  });

  it("Div7 receives work_assignment packet when executive decision needed", async () => {
    const event = makeCreatedEvent({
      issueId: "issue-pkt-006",
      identifier: "BOS-PKT-6",
      title: "Strategic direction unclear",
      description: "Ambiguous policy decision needed",
    });

    await missionRouterIssueCreatedHandler(event);

    const log = getRoutingDecisionLog();
    const div7WorkAssignment = log[0].packetDeliveries.find(
      d => d.toDivision === "Div7.MissionControl" && d.packetType === "work_assignment"
    );

    expect(div7WorkAssignment).toBeDefined();
  });

  it("getPacketsForIssue returns packets linked to issue", async () => {
    const event = makeCreatedEvent({
      issueId: "issue-pkt-007",
      identifier: "BOS-PKT-7",
      title: "Build and test new code feature",
      description: "Implement and verify quality",
    });

    await missionRouterIssueCreatedHandler(event);

    const packets = getPacketsForIssue("issue-pkt-007");
    expect(packets.length).toBeGreaterThan(0);
    expect(packets[0].packetId).toMatch(/^pkt_/);
  });

  it("getPacketsForIssue returns empty for unknown issue", () => {
    const packets = getPacketsForIssue("nonexistent-issue");
    expect(packets).toHaveLength(0);
  });

  it("getRoutingPacketSummary groups packets by target division", async () => {
    // Route a code+QA issue
    const event1 = makeCreatedEvent({
      issueId: "issue-pkt-008",
      identifier: "BOS-PKT-8",
      title: "Build and test new code feature",
      description: "Implement code and verify quality",
    });

    await missionRouterIssueCreatedHandler(event1);

    const summary = getRoutingPacketSummary();
    // Div4 and Div5 should be in summary
    expect(summary.has("Div4.Production")).toBe(true);
    expect(summary.has("Div5.QualificationsLibraryLearning")).toBe(true);

    const div4Info = summary.get("Div4.Production");
    expect(div4Info!.count).toBeGreaterThanOrEqual(1);
    expect(div4Info!.latestPacketId).toMatch(/^pkt_/);
  });

  it("getRoutingPacketSummary accumulates across multiple routing decisions", async () => {
    const event1 = makeCreatedEvent({
      issueId: "issue-pkt-009",
      identifier: "BOS-PKT-9",
      title: "Build code feature A",
    });
    const event2 = makeCreatedEvent({
      issueId: "issue-pkt-010",
      identifier: "BOS-PKT-10",
      title: "Build code feature B",
    });

    await missionRouterIssueCreatedHandler(event1);
    await missionRouterIssueCreatedHandler(event2);

    const summary = getRoutingPacketSummary();
    const div4Info = summary.get("Div4.Production");
    expect(div4Info!.count).toBeGreaterThanOrEqual(2);
  });

  it("clearRoutingDecisionLog also clears packet index", async () => {
    const event = makeCreatedEvent({
      issueId: "issue-pkt-011",
      identifier: "BOS-PKT-11",
      title: "Build code feature",
    });

    await missionRouterIssueCreatedHandler(event);
    expect(getPacketsForIssue("issue-pkt-011").length).toBeGreaterThan(0);

    clearRoutingDecisionLog();
    expect(getPacketsForIssue("issue-pkt-011")).toHaveLength(0);
    expect(getRoutingPacketSummary().size).toBe(0);
  });

  it("packet delivery count matches activated divisions + Div7 oversight", async () => {
    const event = makeCreatedEvent({
      issueId: "issue-pkt-012",
      identifier: "BOS-PKT-12",
      title: "Build and test new code feature",
      description: "Implement code and run quality audit",
    });

    await missionRouterIssueCreatedHandler(event);

    const log = getRoutingDecisionLog();
    const state = log[0].routingResult as MissionRoutingState;
    const deliveryCount = log[0].packetDeliveries.length;

    // Each activated division gets a work_assignment + Div7 gets a status_update
    const expectedMinPackets = state.activated_divisions.length + 1; // +1 for Div7 status_update
    expect(deliveryCount).toBeGreaterThanOrEqual(expectedMinPackets);
  });

  it("e2e: full routing flow logs decisions with packets and inbox visibility", async () => {
    const manager = createBosLightHookManager();

    const event = makeCreatedEvent({
      issueId: "issue-e2e-pkt-001",
      identifier: "BOS-E2E-PKT-1",
      title: "Implement and test new authentication feature",
      description: "Build code and run quality tests",
    });

    await manager.dispatchEvent(event);

    // 1. Routing decision was logged
    const decisionLog = getRoutingDecisionLog();
    expect(decisionLog).toHaveLength(1);

    // 2. Decision includes packet delivery records
    const { packetDeliveries, routingResult } = decisionLog[0];
    expect(packetDeliveries.length).toBeGreaterThan(0);

    // 3. Packets are visible in division inboxes
    const state = routingResult as MissionRoutingState;
    for (const division of state.activated_divisions) {
      const inbox = getDivisionInbox(division);
      expect(inbox.length).toBeGreaterThanOrEqual(1);
    }

    // 4. Packets traceable by issue ID
    const tracedPackets = getPacketsForIssue("issue-e2e-pkt-001");
    expect(tracedPackets.length).toBe(packetDeliveries.length);

    // 5. Summary shows affected divisions
    const summary = getRoutingPacketSummary();
    expect(summary.size).toBeGreaterThan(0);

    // 6. Handler message includes packet count
    const routerHandler = (await manager.getInvocationLog()).find(
      l => l.handlerName === "bos-light-mission-router"
    );
    expect(routerHandler!.result.message).toContain("packet");
  });
});

// ─── DecisionDelegated Flow (Two-Pass Routing) ─────────────────────────────

describe("DecisionDelegated flow (two-pass routing)", () => {
  beforeEach(() => {
    clearPacketRouter();
    clearRoutingDecisionLog();
  });

  it("triggers DecisionDelegated flow when mission routes to Div7", async () => {
    const event = makeCreatedEvent({
      issueId: "issue-dd-001",
      identifier: "BOS-DD-1",
      title: "Strategic direction unclear",
      description: "Ambiguous policy decision needed",
    });

    const result = await missionRouterIssueCreatedHandler(event);

    expect(result.handled).toBe(true);
    // Message should indicate two-pass routing with domain info
    expect(result.message).toContain("executive decision");
    expect(result.message).toContain("domain:");
  });

  it("logs DecisionDelegated in routing decision entry", async () => {
    const event = makeCreatedEvent({
      issueId: "issue-dd-002",
      identifier: "BOS-DD-2",
      title: "Ambiguous experiment strategy needed",
      description: "Uncertain hypothesis for new approach",
    });

    await missionRouterIssueCreatedHandler(event);

    const log = getRoutingDecisionLog();
    expect(log).toHaveLength(1);
    expect(log[0].twoPassRouting).toBeDefined();
    expect(log[0].twoPassRouting!.decisionDelegated).toBeDefined();
    expect(log[0].twoPassRouting!.operationalRoutingResult).toBeDefined();
    expect(log[0].twoPassRouting!.operationalPacketDeliveries).toBeDefined();
    expect(log[0].twoPassRouting!.completedAt).toBeDefined();
  });

  it("DecisionDelegated contains cynefin domain and routing directive", async () => {
    const event = makeCreatedEvent({
      issueId: "issue-dd-003",
      identifier: "BOS-DD-3",
      title: "Strategic architecture decision",
      description: "Need safe-to-fail experiment for ambiguous requirements",
    });

    await missionRouterIssueCreatedHandler(event);

    const log = getRoutingDecisionLog();
    const delegated = log[0].twoPassRouting!.decisionDelegated;

    expect(delegated.schema_version).toBe("1.0");
    expect(delegated.cynefin_domain).toBeDefined();
    expect(delegated.recommended_mode).toBeDefined();
    expect(delegated.routing_directive).toBeDefined();
    expect(delegated.routing_directive.targetDivisions.length).toBeGreaterThan(0);
    expect(delegated.routing_directive.routingRule).toBeDefined();
    expect(delegated.constraints).toBeDefined();
    expect(delegated.escalation_level).toBeDefined();
  });

  it("operational routing activates divisions from DecisionDelegated", async () => {
    const event = makeCreatedEvent({
      issueId: "issue-dd-004",
      identifier: "BOS-DD-4",
      title: "Strategic policy direction needed",
      description: "Ambiguous experiment with uncertain outcomes",
    });

    await missionRouterIssueCreatedHandler(event);

    const log = getRoutingDecisionLog();
    const opResult = log[0].twoPassRouting!.operationalRoutingResult as MissionRoutingState;

    expect(opResult.status).toBe("ROUTED");
    expect(opResult.activated_divisions.length).toBeGreaterThan(0);
    // Should NOT include Div7 or Div1 in operational divisions
    expect(opResult.activated_divisions).not.toContain("Div7.MissionControl");
    expect(opResult.activated_divisions).not.toContain("Div1.HCO");
  });

  it("operational packets are delivered to target divisions", async () => {
    const event = makeCreatedEvent({
      issueId: "issue-dd-005",
      identifier: "BOS-DD-5",
      title: "Strategic direction uncertain",
      description: "Need hypothesis testing for ambiguous approach",
    });

    await missionRouterIssueCreatedHandler(event);

    const log = getRoutingDecisionLog();
    const opPackets = log[0].twoPassRouting!.operationalPacketDeliveries;
    expect(opPackets.length).toBeGreaterThan(0);

    // Each operational packet should have correct metadata
    for (const pkt of opPackets) {
      expect(pkt.packetId).toMatch(/^pkt_/);
      expect(pkt.packetType).toBeDefined();
      expect(pkt.fromDivision).toBe("Div1.HCO");
      expect(pkt.deliveredAt).toBeDefined();
    }
  });

  it("CHAOTIC mission routes through two-pass with STABILIZE_FIRST mode", async () => {
    const event = makeCreatedEvent({
      issueId: "issue-dd-006",
      identifier: "BOS-DD-6",
      title: "Production outage critical",
      description: "Emergency incident with runaway failure",
    });

    await missionRouterIssueCreatedHandler(event);

    const log = getRoutingDecisionLog();
    const delegated = log[0].twoPassRouting!.decisionDelegated;

    expect(delegated.cynefin_domain).toBe("CHAOTIC");
    expect(delegated.recommended_mode).toBe("STABILIZE_FIRST");
    expect(delegated.escalation_level).toBe("critical");
    expect(delegated.routing_directive.routingRule).toBe("chaotic_incident_flow");
  });

  it("COMPLEX mission routes through two-pass with SAFE_TO_FAIL_EXPERIMENT mode", async () => {
    const event = makeCreatedEvent({
      issueId: "issue-dd-007",
      identifier: "BOS-DD-7",
      title: "Unknown ambiguous experiment strategy",
      description: "Hypothesis testing with uncertain outcomes",
    });

    await missionRouterIssueCreatedHandler(event);

    const log = getRoutingDecisionLog();
    const delegated = log[0].twoPassRouting!.decisionDelegated;

    expect(delegated.cynefin_domain).toBe("COMPLEX");
    expect(delegated.recommended_mode).toBe("SAFE_TO_FAIL_EXPERIMENT");
    expect(delegated.routing_directive.routingRule).toBe("complex_safe_to_fail");
  });

  it("routine mission does NOT trigger two-pass routing", async () => {
    const event = makeCreatedEvent({
      issueId: "issue-dd-008",
      identifier: "BOS-DD-8",
      title: "Fix CSS bug",
      description: "Simple layout fix",
    });

    await missionRouterIssueCreatedHandler(event);

    const log = getRoutingDecisionLog();
    expect(log).toHaveLength(1);
    expect(log[0].twoPassRouting).toBeUndefined();
  });

  it("two-pass routing indexes all packets for traceability", async () => {
    const event = makeCreatedEvent({
      issueId: "issue-dd-009",
      identifier: "BOS-DD-9",
      title: "Strategic direction unclear",
      description: "Ambiguous policy decision needed",
    });

    await missionRouterIssueCreatedHandler(event);

    const log = getRoutingDecisionLog();
    const firstPassCount = log[0].packetDeliveries.length;
    const secondPassCount = log[0].twoPassRouting!.operationalPacketDeliveries.length;

    // Total packets should include both passes
    const allPackets = getPacketsForIssue("issue-dd-009");
    expect(allPackets.length).toBe(firstPassCount + secondPassCount);
  });

  it("two-pass handler message includes division names and domain", async () => {
    const event = makeCreatedEvent({
      issueId: "issue-dd-010",
      identifier: "BOS-DD-10",
      title: "Strategic direction unclear",
      description: "Ambiguous policy decision needed",
    });

    const result = await missionRouterIssueCreatedHandler(event);

    expect(result.message).toContain("executive decision");
    expect(result.message).toContain("domain:");
    expect(result.message).toContain("pre-decision");
    expect(result.message).toContain("post-decision");
  });

  it("e2e: full two-pass flow through hook manager", async () => {
    const manager = createBosLightHookManager();

    const event = makeCreatedEvent({
      issueId: "issue-dd-e2e-001",
      identifier: "BOS-DD-E2E-1",
      title: "Strategic policy direction needed",
      description: "Ambiguous strategy with uncertain outcomes",
    });

    const logs = await manager.dispatchEvent(event);
    const routerLog = logs.find(l => l.handlerName === "bos-light-mission-router");
    expect(routerLog!.result.handled).toBe(true);
    expect(routerLog!.result.message).toContain("executive decision");

    const decisionLog = getRoutingDecisionLog();
    expect(decisionLog).toHaveLength(1);
    expect(decisionLog[0].twoPassRouting).toBeDefined();

    // First pass routes to Div7
    const firstPassState = decisionLog[0].routingResult as MissionRoutingState;
    expect(firstPassState.activated_divisions).toContain("Div7.MissionControl");

    // Second pass routes to operational divisions
    const secondPassState = decisionLog[0].twoPassRouting!.operationalRoutingResult as MissionRoutingState;
    expect(secondPassState.activated_divisions.length).toBeGreaterThan(0);
    expect(secondPassState.activated_divisions).not.toContain("Div7.MissionControl");
  });
});
