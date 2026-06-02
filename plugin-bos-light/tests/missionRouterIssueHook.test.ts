import { describe, it, expect, beforeEach } from "vitest";
import {
  IssueLifecycleHookManager,
  missionRouterIssueCreatedHandler,
  issueCreatedToMissionEnvelope,
  getRoutingDecisionLog,
  clearRoutingDecisionLog,
  createBosLightHookManager,
  type IssueLifecycleHookEvent,
  type IssueCreatedPayload,
  type RoutingDecisionLogEntry,
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
