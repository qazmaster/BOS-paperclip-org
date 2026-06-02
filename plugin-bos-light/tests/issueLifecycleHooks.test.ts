import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  IssueLifecycleHookManager,
  logIssueCreatedHandler,
  logIssueUpdatedHandler,
  logIssueAssignmentHandler,
  mapDomainEventToHookEvent,
  createBosLightHookManager,
  type IssueLifecycleHookEvent,
  type IssueCreatedPayload,
  type IssueUpdatedPayload,
  type IssueAssignmentPayload,
  type HookHandlerResult,
} from "../src/issueLifecycleHooks";
import type { PaperclipDomainEvent } from "../src/pluginRegistration";

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeCreatedEvent(
  overrides: Partial<IssueCreatedPayload> = {}
): IssueLifecycleHookEvent {
  return {
    eventType: "issue.created",
    eventId: "evt-created-001",
    occurredAt: "2026-06-02T10:00:00.000Z",
    payload: {
      issueId: "issue-123",
      companyId: "company-456",
      identifier: "BOS-001",
      title: "Implement auth flow",
      status: "open",
      priority: "high",
      projectId: "project-789",
      createdAt: "2026-06-02T10:00:00.000Z",
      ...overrides,
    },
    actor: { type: "user", id: "user-001" },
  };
}

function makeUpdatedEvent(
  overrides: Partial<IssueUpdatedPayload> = {}
): IssueLifecycleHookEvent {
  return {
    eventType: "issue.updated",
    eventId: "evt-updated-001",
    occurredAt: "2026-06-02T10:05:00.000Z",
    payload: {
      issueId: "issue-123",
      companyId: "company-456",
      identifier: "BOS-001",
      status: "in_progress",
      previousStatus: "open",
      updatedAt: "2026-06-02T10:05:00.000Z",
      changedFields: ["status"],
      ...overrides,
    },
    actor: { type: "agent", id: "agent-001" },
  };
}

function makeAssignmentEvent(
  overrides: Partial<IssueAssignmentPayload> = {}
): IssueLifecycleHookEvent {
  return {
    eventType: "issue.assignment",
    eventId: "evt-assignment-001",
    occurredAt: "2026-06-02T10:10:00.000Z",
    payload: {
      issueId: "issue-123",
      companyId: "company-456",
      identifier: "BOS-001",
      assigneeAgentId: "agent-002",
      assignedAt: "2026-06-02T10:10:00.000Z",
      ...overrides,
    },
    actor: { type: "system", id: "dispatcher" },
  };
}

function makePaperclipDomainEvent(
  eventType: string,
  overrides: Partial<PaperclipDomainEvent> = {}
): PaperclipDomainEvent {
  return {
    eventId: `evt-${eventType.replace(".", "-")}-001`,
    eventType,
    occurredAt: "2026-06-02T10:00:00.000Z",
    actor: { type: "user", id: "user-001" },
    entity: { type: "issue", id: "issue-123" },
    payload: {
      issueId: "issue-123",
      companyId: "company-456",
      identifier: "BOS-001",
      title: "Test issue",
      status: "open",
      createdAt: "2026-06-02T10:00:00.000Z",
    },
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("IssueLifecycleHookManager", () => {
  let manager: IssueLifecycleHookManager;

  beforeEach(() => {
    manager = new IssueLifecycleHookManager();
  });

  describe("handler registration", () => {
    it("registers a handler for issue.created", () => {
      manager.on("issue.created", "test-handler", async (event) => ({
        handled: true,
        durationMs: 0,
      }));

      expect(manager.listHandlers("issue.created")).toContain("test-handler");
    });

    it("registers a handler for issue.updated", () => {
      manager.on("issue.updated", "test-handler", async (event) => ({
        handled: true,
        durationMs: 0,
      }));

      expect(manager.listHandlers("issue.updated")).toContain("test-handler");
    });

    it("registers a handler for issue.assignment", () => {
      manager.on("issue.assignment", "test-handler", async (event) => ({
        handled: true,
        durationMs: 0,
      }));

      expect(manager.listHandlers("issue.assignment")).toContain(
        "test-handler"
      );
    });

    it("registers multiple handlers for the same event", () => {
      manager.on("issue.created", "handler-1", async () => ({
        handled: true,
        durationMs: 0,
      }));
      manager.on("issue.created", "handler-2", async () => ({
        handled: true,
        durationMs: 0,
      }));

      expect(manager.listHandlers("issue.created")).toEqual(
        expect.arrayContaining(["handler-1", "handler-2"])
      );
    });

    it("throws on duplicate handler name for same event", () => {
      manager.on("issue.created", "handler-1", async () => ({
        handled: true,
        durationMs: 0,
      }));

      expect(() =>
        manager.on("issue.created", "handler-1", async () => ({
          handled: true,
          durationMs: 0,
        }))
      ).toThrow('Handler "handler-1" is already registered for event "issue.created"');
    });

    it("allows same handler name for different events", () => {
      manager.on("issue.created", "logger", async () => ({
        handled: true,
        durationMs: 0,
      }));
      manager.on("issue.updated", "logger", async () => ({
        handled: true,
        durationMs: 0,
      }));

      expect(manager.listHandlers("issue.created")).toContain("logger");
      expect(manager.listHandlers("issue.updated")).toContain("logger");
    });
  });

  describe("handler unregistration", () => {
    it("removes a registered handler", () => {
      manager.on("issue.created", "test-handler", async () => ({
        handled: true,
        durationMs: 0,
      }));

      const removed = manager.off("issue.created", "test-handler");
      expect(removed).toBe(true);
      expect(manager.listHandlers("issue.created")).not.toContain(
        "test-handler"
      );
    });

    it("returns false when handler not found", () => {
      const removed = manager.off("issue.created", "nonexistent");
      expect(removed).toBe(false);
    });
  });

  describe("listAllHandlers", () => {
    it("lists handlers across all event types", () => {
      manager.on("issue.created", "handler-a", async () => ({
        handled: true,
        durationMs: 0,
      }));
      manager.on("issue.updated", "handler-b", async () => ({
        handled: true,
        durationMs: 0,
      }));
      manager.on("issue.assignment", "handler-c", async () => ({
        handled: true,
        durationMs: 0,
      }));

      const all = manager.listAllHandlers();
      expect(all).toHaveLength(3);
      expect(all).toEqual(
        expect.arrayContaining([
          { eventType: "issue.created", handlerName: "handler-a" },
          { eventType: "issue.updated", handlerName: "handler-b" },
          { eventType: "issue.assignment", handlerName: "handler-c" },
        ])
      );
    });
  });

  describe("dispatchEvent", () => {
    it("dispatches issue.created to registered handler", async () => {
      const handler = vi.fn(async () => ({
        handled: true,
        message: "processed",
        durationMs: 5,
      }));

      manager.on("issue.created", "test-handler", handler);

      const event = makeCreatedEvent();
      const logs = await manager.dispatchEvent(event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event);
      expect(logs).toHaveLength(1);
      expect(logs[0].handlerName).toBe("test-handler");
      expect(logs[0].result.handled).toBe(true);
      expect(logs[0].result.message).toBe("processed");
    });

    it("dispatches issue.updated to registered handler", async () => {
      const handler = vi.fn(async () => ({
        handled: true,
        durationMs: 3,
      }));

      manager.on("issue.updated", "test-handler", handler);

      const event = makeUpdatedEvent();
      const logs = await manager.dispatchEvent(event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(logs).toHaveLength(1);
      expect(logs[0].eventType).toBe("issue.updated");
    });

    it("dispatches issue.assignment to registered handler", async () => {
      const handler = vi.fn(async () => ({
        handled: true,
        durationMs: 2,
      }));

      manager.on("issue.assignment", "test-handler", handler);

      const event = makeAssignmentEvent();
      const logs = await manager.dispatchEvent(event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(logs).toHaveLength(1);
      expect(logs[0].eventType).toBe("issue.assignment");
    });

    it("dispatches to multiple handlers sequentially", async () => {
      const order: string[] = [];

      manager.on("issue.created", "handler-1", async () => {
        order.push("handler-1");
        return { handled: true, durationMs: 0 };
      });
      manager.on("issue.created", "handler-2", async () => {
        order.push("handler-2");
        return { handled: true, durationMs: 0 };
      });

      const logs = await manager.dispatchEvent(makeCreatedEvent());

      expect(order).toEqual(["handler-1", "handler-2"]);
      expect(logs).toHaveLength(2);
      expect(logs[0].handlerName).toBe("handler-1");
      expect(logs[1].handlerName).toBe("handler-2");
    });

    it("captures handler errors and continues dispatch", async () => {
      manager.on("issue.created", "failing-handler", async () => {
        throw new Error("Handler crashed");
      });
      manager.on("issue.created", "good-handler", async () => ({
        handled: true,
        durationMs: 0,
      }));

      const logs = await manager.dispatchEvent(makeCreatedEvent());

      expect(logs).toHaveLength(2);
      expect(logs[0].result.handled).toBe(false);
      expect(logs[0].result.error).toBe("Handler crashed");
      expect(logs[1].result.handled).toBe(true);
    });

    it("returns empty-handler log when no handlers registered", async () => {
      const logs = await manager.dispatchEvent(makeCreatedEvent());

      expect(logs).toHaveLength(1);
      expect(logs[0].handlerName).toBe("(no handlers)");
      expect(logs[0].result.handled).toBe(false);
      expect(logs[0].result.message).toContain("No handlers registered");
    });

    it("logs issueId from event payload", async () => {
      manager.on("issue.created", "test-handler", async () => ({
        handled: true,
        durationMs: 0,
      }));

      const logs = await manager.dispatchEvent(
        makeCreatedEvent({ issueId: "issue-xyz" })
      );

      expect(logs[0].issueId).toBe("issue-xyz");
    });

    it("logs eventId in invocation record", async () => {
      manager.on("issue.created", "test-handler", async () => ({
        handled: true,
        durationMs: 0,
      }));

      const logs = await manager.dispatchEvent(makeCreatedEvent());

      expect(logs[0].eventId).toBe("evt-created-001");
    });
  });

  describe("invocation log", () => {
    it("stores invocations in the log", async () => {
      manager.on("issue.created", "test-handler", async () => ({
        handled: true,
        durationMs: 0,
      }));

      await manager.dispatchEvent(makeCreatedEvent());

      expect(manager.getInvocationLog()).toHaveLength(1);
    });

    it("respects maxLogSize limit", async () => {
      const smallManager = new IssueLifecycleHookManager(3);
      smallManager.on("issue.created", "test-handler", async () => ({
        handled: true,
        durationMs: 0,
      }));

      for (let i = 0; i < 5; i++) {
        await smallManager.dispatchEvent(
          makeCreatedEvent({ issueId: `issue-${i}` })
        );
      }

      const log = smallManager.getInvocationLog();
      expect(log).toHaveLength(3);
      // Should keep the most recent entries
      expect(log[0].issueId).toBe("issue-2");
      expect(log[2].issueId).toBe("issue-4");
    });

    it("filters log by event type", async () => {
      manager.on("issue.created", "handler", async () => ({
        handled: true,
        durationMs: 0,
      }));
      manager.on("issue.updated", "handler", async () => ({
        handled: true,
        durationMs: 0,
      }));

      await manager.dispatchEvent(makeCreatedEvent());
      await manager.dispatchEvent(makeUpdatedEvent());
      await manager.dispatchEvent(makeCreatedEvent());

      const createdLogs = manager.getInvocationLogByEventType("issue.created");
      const updatedLogs = manager.getInvocationLogByEventType("issue.updated");

      expect(createdLogs).toHaveLength(2);
      expect(updatedLogs).toHaveLength(1);
    });

    it("filters log by issueId", async () => {
      manager.on("issue.created", "handler", async () => ({
        handled: true,
        durationMs: 0,
      }));

      await manager.dispatchEvent(makeCreatedEvent({ issueId: "issue-aaa" }));
      await manager.dispatchEvent(makeCreatedEvent({ issueId: "issue-bbb" }));
      await manager.dispatchEvent(makeCreatedEvent({ issueId: "issue-aaa" }));

      const logs = manager.getInvocationLogByIssueId("issue-aaa");
      expect(logs).toHaveLength(2);
    });

    it("clears invocation log", async () => {
      manager.on("issue.created", "handler", async () => ({
        handled: true,
        durationMs: 0,
      }));

      await manager.dispatchEvent(makeCreatedEvent());
      expect(manager.getInvocationLog()).toHaveLength(1);

      manager.clearInvocationLog();
      expect(manager.getInvocationLog()).toHaveLength(0);
    });

    it("respects limit parameter on getInvocationLog", async () => {
      manager.on("issue.created", "handler", async () => ({
        handled: true,
        durationMs: 0,
      }));

      for (let i = 0; i < 5; i++) {
        await manager.dispatchEvent(makeCreatedEvent());
      }

      expect(manager.getInvocationLog(3)).toHaveLength(3);
    });
  });

  describe("invocation count", () => {
    it("counts total invocations", async () => {
      manager.on("issue.created", "handler", async () => ({
        handled: true,
        durationMs: 0,
      }));
      manager.on("issue.updated", "handler", async () => ({
        handled: true,
        durationMs: 0,
      }));

      await manager.dispatchEvent(makeCreatedEvent());
      await manager.dispatchEvent(makeCreatedEvent());
      await manager.dispatchEvent(makeUpdatedEvent());

      expect(manager.getInvocationCount()).toBe(3);
    });

    it("counts invocations by event type", async () => {
      manager.on("issue.created", "handler", async () => ({
        handled: true,
        durationMs: 0,
      }));
      manager.on("issue.updated", "handler", async () => ({
        handled: true,
        durationMs: 0,
      }));
      manager.on("issue.assignment", "handler", async () => ({
        handled: true,
        durationMs: 0,
      }));

      await manager.dispatchEvent(makeCreatedEvent());
      await manager.dispatchEvent(makeCreatedEvent());
      await manager.dispatchEvent(makeUpdatedEvent());
      await manager.dispatchEvent(makeAssignmentEvent());
      await manager.dispatchEvent(makeAssignmentEvent());
      await manager.dispatchEvent(makeAssignmentEvent());

      const counts = manager.getInvocationCountByEventType();
      expect(counts["issue.created"]).toBe(2);
      expect(counts["issue.updated"]).toBe(1);
      expect(counts["issue.assignment"]).toBe(3);
    });
  });
});

// ─── Built-in Handler Tests ──────────────────────────────────────────────────

describe("Built-in hook handlers", () => {
  describe("logIssueCreatedHandler", () => {
    it("handles issue.created event", async () => {
      const event = makeCreatedEvent();
      const result = await logIssueCreatedHandler(event);

      expect(result.handled).toBe(true);
      expect(result.message).toContain("BOS-001");
      expect(result.message).toContain("Implement auth flow");
      expect(result.message).toContain("open");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("includes identifier and title in message", async () => {
      const event = makeCreatedEvent({
        identifier: "BOS-042",
        title: "Fix critical bug",
      });
      const result = await logIssueCreatedHandler(event);

      expect(result.message).toContain("BOS-042");
      expect(result.message).toContain("Fix critical bug");
    });
  });

  describe("logIssueUpdatedHandler", () => {
    it("handles issue.updated event", async () => {
      const event = makeUpdatedEvent();
      const result = await logIssueUpdatedHandler(event);

      expect(result.handled).toBe(true);
      expect(result.message).toContain("BOS-001");
      expect(result.message).toContain("status");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("includes previous status in message", async () => {
      const event = makeUpdatedEvent({
        previousStatus: "triaged",
        changedFields: ["status", "priority"],
      });
      const result = await logIssueUpdatedHandler(event);

      expect(result.message).toContain("triaged");
      expect(result.message).toContain("status, priority");
    });

    it("omits previous status when not provided", async () => {
      const event = makeUpdatedEvent({
        previousStatus: undefined,
        changedFields: ["title"],
      });
      const result = await logIssueUpdatedHandler(event);

      expect(result.message).not.toContain("was:");
      expect(result.message).toContain("title");
    });
  });

  describe("logIssueAssignmentHandler", () => {
    it("handles issue.assignment event with agent assignee", async () => {
      const event = makeAssignmentEvent({
        assigneeAgentId: "agent-002",
        previousAssigneeAgentId: "agent-001",
      });
      const result = await logIssueAssignmentHandler(event);

      expect(result.handled).toBe(true);
      expect(result.message).toContain("BOS-001");
      expect(result.message).toContain("agent-001");
      expect(result.message).toContain("agent-002");
    });

    it("handles assignment with user assignee", async () => {
      const event = makeAssignmentEvent({
        assigneeAgentId: undefined,
        assigneeUserId: "user-005",
        previousAssigneeAgentId: undefined,
        previousAssigneeUserId: "user-003",
      });
      const result = await logIssueAssignmentHandler(event);

      expect(result.message).toContain("user-003");
      expect(result.message).toContain("user-005");
    });

    it("shows (unassigned) when no previous assignee", async () => {
      const event = makeAssignmentEvent({
        assigneeAgentId: "agent-002",
      });
      const result = await logIssueAssignmentHandler(event);

      expect(result.message).toContain("(unassigned)");
      expect(result.message).toContain("agent-002");
    });
  });
});

// ─── mapDomainEventToHookEvent ───────────────────────────────────────────────

describe("mapDomainEventToHookEvent", () => {
  it("maps issue.created domain event", () => {
    const domainEvent = makePaperclipDomainEvent("issue.created");
    const hookEvent = mapDomainEventToHookEvent(domainEvent);

    expect(hookEvent).not.toBeNull();
    expect(hookEvent!.eventType).toBe("issue.created");
    expect(hookEvent!.eventId).toBe("evt-issue-created-001");
  });

  it("maps issue.updated domain event", () => {
    const domainEvent = makePaperclipDomainEvent("issue.updated");
    const hookEvent = mapDomainEventToHookEvent(domainEvent);

    expect(hookEvent).not.toBeNull();
    expect(hookEvent!.eventType).toBe("issue.updated");
  });

  it("maps issue.checked_out to issue.assignment", () => {
    const domainEvent = makePaperclipDomainEvent("issue.checked_out");
    const hookEvent = mapDomainEventToHookEvent(domainEvent);

    expect(hookEvent).not.toBeNull();
    expect(hookEvent!.eventType).toBe("issue.assignment");
  });

  it("maps issue.released to issue.assignment", () => {
    const domainEvent = makePaperclipDomainEvent("issue.released");
    const hookEvent = mapDomainEventToHookEvent(domainEvent);

    expect(hookEvent).not.toBeNull();
    expect(hookEvent!.eventType).toBe("issue.assignment");
  });

  it("maps issue.assignment_wakeup_requested to issue.assignment", () => {
    const domainEvent = makePaperclipDomainEvent(
      "issue.assignment_wakeup_requested"
    );
    const hookEvent = mapDomainEventToHookEvent(domainEvent);

    expect(hookEvent).not.toBeNull();
    expect(hookEvent!.eventType).toBe("issue.assignment");
  });

  it("returns null for non-issue events", () => {
    const domainEvent = makePaperclipDomainEvent("agent.run.started");
    const hookEvent = mapDomainEventToHookEvent(domainEvent);

    expect(hookEvent).toBeNull();
  });

  it("returns null for unknown event types", () => {
    const domainEvent = makePaperclipDomainEvent("unknown.event.type");
    const hookEvent = mapDomainEventToHookEvent(domainEvent);

    expect(hookEvent).toBeNull();
  });

  it("preserves actor from domain event", () => {
    const domainEvent = makePaperclipDomainEvent("issue.created", {
      actor: { type: "agent", id: "agent-99" },
    });
    const hookEvent = mapDomainEventToHookEvent(domainEvent);

    expect(hookEvent!.actor).toEqual({ type: "agent", id: "agent-99" });
  });

  it("preserves payload from domain event", () => {
    const domainEvent = makePaperclipDomainEvent("issue.created", {
      payload: {
        issueId: "issue-abc",
        title: "Custom title",
        status: "open",
      },
    });
    const hookEvent = mapDomainEventToHookEvent(domainEvent);

    expect(hookEvent!.payload).toEqual({
      issueId: "issue-abc",
      title: "Custom title",
      status: "open",
    });
  });
});

// ─── createBosLightHookManager ───────────────────────────────────────────────

describe("createBosLightHookManager", () => {
  it("creates manager with default logging hooks", () => {
    const manager = createBosLightHookManager();

    expect(manager.listHandlers("issue.created")).toContain(
      "bos-light-log-created"
    );
    expect(manager.listHandlers("issue.updated")).toContain(
      "bos-light-log-updated"
    );
    expect(manager.listHandlers("issue.assignment")).toContain(
      "bos-light-log-assignment"
    );
  });

  it("fires issue.created hook on create event", async () => {
    const manager = createBosLightHookManager();
    const logs = await manager.dispatchEvent(makeCreatedEvent());

    expect(logs).toHaveLength(1);
    expect(logs[0].result.handled).toBe(true);
    expect(logs[0].result.message).toContain("Issue created");
    expect(logs[0].handlerName).toBe("bos-light-log-created");
  });

  it("fires issue.updated hook on update event", async () => {
    const manager = createBosLightHookManager();
    const logs = await manager.dispatchEvent(makeUpdatedEvent());

    expect(logs).toHaveLength(1);
    expect(logs[0].result.handled).toBe(true);
    expect(logs[0].result.message).toContain("Issue updated");
    expect(logs[0].handlerName).toBe("bos-light-log-updated");
  });

  it("fires issue.assignment hook on assignment event", async () => {
    const manager = createBosLightHookManager();
    const logs = await manager.dispatchEvent(makeAssignmentEvent());

    expect(logs).toHaveLength(1);
    expect(logs[0].result.handled).toBe(true);
    expect(logs[0].result.message).toContain("Issue assigned");
    expect(logs[0].handlerName).toBe("bos-light-log-assignment");
  });

  it("accepts custom maxLogSize", () => {
    const manager = createBosLightHookManager(50);
    expect(manager).toBeDefined();
  });

  it("hooks fire on issue create/update/assign lifecycle", async () => {
    const manager = createBosLightHookManager();

    // Simulate issue lifecycle: create -> update -> assign
    const createLogs = await manager.dispatchEvent(makeCreatedEvent());
    const updateLogs = await manager.dispatchEvent(makeUpdatedEvent());
    const assignLogs = await manager.dispatchEvent(makeAssignmentEvent());

    expect(createLogs[0].result.handled).toBe(true);
    expect(updateLogs[0].result.handled).toBe(true);
    expect(assignLogs[0].result.handled).toBe(true);

    // All three invocations should be logged
    expect(manager.getInvocationCount()).toBe(3);
    expect(manager.getInvocationCountByEventType()).toEqual({
      "issue.created": 1,
      "issue.updated": 1,
      "issue.assignment": 1,
    });
  });

  it("end-to-end: dispatch domain event through hook manager", async () => {
    const manager = createBosLightHookManager();

    // Add a custom handler to verify it fires alongside built-in ones
    manager.on("issue.created", "custom-triage", async (event) => {
      const payload = event.payload as IssueCreatedPayload;
      return {
        handled: true,
        message: `Triaged: ${payload.identifier} → BOS flow`,
        durationMs: 1,
      };
    });

    // Simulate Paperclip dispatching a domain event
    const domainEvent = makePaperclipDomainEvent("issue.created");
    const hookEvent = mapDomainEventToHookEvent(domainEvent);

    expect(hookEvent).not.toBeNull();

    const logs = await manager.dispatchEvent(hookEvent!);

    // Both handlers should fire
    expect(logs).toHaveLength(2);
    expect(logs[0].handlerName).toBe("bos-light-log-created");
    expect(logs[0].result.handled).toBe(true);
    expect(logs[1].handlerName).toBe("custom-triage");
    expect(logs[1].result.handled).toBe(true);
    expect(logs[1].result.message).toContain("BOS flow");
  });
});
