/**
 * Issue Lifecycle Hooks for BOS Light
 *
 * Implements hooks for issue create, update, and assign events.
 * These hooks fire when the Paperclip host dispatches domain events
 * to the BOS Light plugin worker via the `onEvent` RPC.
 *
 * Design:
 *   - Handlers are registered per event type (issue.created, issue.updated,
 *     issue.assignment).
 *   - Each invocation is logged with timestamp, event type, issue ID, and
 *     handler outcome.
 *   - Delivery is at-least-once; handlers must be idempotent.
 *   - When the Paperclip plugin runtime is not available (post-V1), hooks
 *     can still be tested and invoked programmatically via dispatchEvent().
 */

import type { PaperclipDomainEvent } from "./pluginRegistration";

// ─── Hook Event Shapes ───────────────────────────────────────────────────────

/**
 * Discriminated union of issue lifecycle hook event types.
 */
export type IssueHookEventType =
  | "issue.created"
  | "issue.updated"
  | "issue.assignment";

/**
 * Issue payload received with a create event.
 */
export interface IssueCreatedPayload {
  issueId: string;
  companyId: string;
  identifier: string;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  assigneeAgentId?: string;
  assigneeUserId?: string;
  projectId?: string;
  createdAt: string;
}

/**
 * Issue payload received with an update event.
 */
export interface IssueUpdatedPayload {
  issueId: string;
  companyId: string;
  identifier: string;
  title?: string;
  status?: string;
  priority?: string;
  previousStatus?: string;
  updatedAt: string;
  changedFields: string[];
}

/**
 * Issue payload received with an assignment event.
 */
export interface IssueAssignmentPayload {
  issueId: string;
  companyId: string;
  identifier: string;
  assigneeAgentId?: string;
  assigneeUserId?: string;
  previousAssigneeAgentId?: string;
  previousAssigneeUserId?: string;
  assignedAt: string;
}

/**
 * Union of all issue hook payloads.
 */
export type IssueHookPayload =
  | IssueCreatedPayload
  | IssueUpdatedPayload
  | IssueAssignmentPayload;

/**
 * A normalized issue lifecycle event as seen by hook handlers.
 */
export interface IssueLifecycleHookEvent {
  eventType: IssueHookEventType;
  eventId: string;
  occurredAt: string;
  payload: IssueHookPayload;
  actor?: {
    type: "agent" | "user" | "system" | "plugin";
    id: string;
  };
}

// ─── Hook Handler Contract ───────────────────────────────────────────────────

/**
 * Result returned by a hook handler after processing an event.
 */
export interface HookHandlerResult {
  /** Whether the handler processed the event successfully. */
  handled: boolean;
  /** Optional message describing what the handler did. */
  message?: string;
  /** Time the handler took to execute (ms). */
  durationMs: number;
  /** Error if the handler threw. */
  error?: string;
}

/**
 * A hook handler function.
 * Must be idempotent — delivery is at-least-once.
 */
export type IssueHookHandler = (
  event: IssueLifecycleHookEvent
) => Promise<HookHandlerResult>;

/**
 * Record of a single hook invocation, stored for diagnostics.
 */
export interface HookInvocationLog {
  eventType: IssueHookEventType;
  eventId: string;
  issueId: string;
  handlerName: string;
  result: HookHandlerResult;
  dispatchedAt: string;
}

// ─── Issue Lifecycle Hook Manager ────────────────────────────────────────────

/**
 * Manages registration and dispatch of issue lifecycle hooks.
 *
 * Usage:
 *   const manager = new IssueLifecycleHookManager();
 *   manager.on("issue.created", "bos-light-triage", async (event) => { ... });
 *   await manager.dispatchEvent(hookEvent);
 */
export class IssueLifecycleHookManager {
  private handlers: Map<IssueHookEventType, Map<string, IssueHookHandler>> =
    new Map();

  private invocationLog: HookInvocationLog[] = [];

  private maxLogSize: number;

  constructor(maxLogSize: number = 1000) {
    this.maxLogSize = maxLogSize;

    // Initialize handler maps for each event type
    this.handlers.set("issue.created", new Map());
    this.handlers.set("issue.updated", new Map());
    this.handlers.set("issue.assignment", new Map());
  }

  /**
   * Register a named handler for an issue lifecycle event.
   *
   * @param eventType - The event type to listen for
   * @param handlerName - Unique name for this handler (used in logs)
   * @param handler - The handler function
   * @throws if a handler with the same name is already registered for this event
   */
  on(
    eventType: IssueHookEventType,
    handlerName: string,
    handler: IssueHookHandler
  ): void {
    const handlersForEvent = this.handlers.get(eventType);
    if (!handlersForEvent) {
      throw new Error(`Unknown event type: ${eventType}`);
    }

    if (handlersForEvent.has(handlerName)) {
      throw new Error(
        `Handler "${handlerName}" is already registered for event "${eventType}"`
      );
    }

    handlersForEvent.set(handlerName, handler);
  }

  /**
   * Unregister a named handler.
   *
   * @returns true if the handler was found and removed
   */
  off(eventType: IssueHookEventType, handlerName: string): boolean {
    const handlersForEvent = this.handlers.get(eventType);
    if (!handlersForEvent) return false;
    return handlersForEvent.delete(handlerName);
  }

  /**
   * List all registered handler names for an event type.
   */
  listHandlers(eventType: IssueHookEventType): string[] {
    const handlersForEvent = this.handlers.get(eventType);
    if (!handlersForEvent) return [];
    return Array.from(handlersForEvent.keys());
  }

  /**
   * List all registered handler names across all event types.
   */
  listAllHandlers(): Array<{
    eventType: IssueHookEventType;
    handlerName: string;
  }> {
    const result: Array<{
      eventType: IssueHookEventType;
      handlerName: string;
    }> = [];

    for (const [eventType, handlersForEvent] of this.handlers) {
      for (const handlerName of handlersForEvent.keys()) {
        result.push({ eventType, handlerName });
      }
    }

    return result;
  }

  /**
   * Dispatch an issue lifecycle event to all registered handlers.
   *
   * Handlers run sequentially in registration order. If a handler throws,
   * the error is captured in the invocation log and dispatch continues
   * with the next handler.
   */
  async dispatchEvent(
    event: IssueLifecycleHookEvent
  ): Promise<HookInvocationLog[]> {
    const handlersForEvent = this.handlers.get(event.eventType);
    if (!handlersForEvent || handlersForEvent.size === 0) {
      // Log the dispatch even if no handlers are registered
      const emptyLog: HookInvocationLog = {
        eventType: event.eventType,
        eventId: event.eventId,
        issueId: this.extractIssueId(event),
        handlerName: "(no handlers)",
        result: {
          handled: false,
          message: `No handlers registered for event "${event.eventType}"`,
          durationMs: 0,
        },
        dispatchedAt: new Date().toISOString(),
      };
      this.appendLog(emptyLog);
      return [emptyLog];
    }

    const logs: HookInvocationLog[] = [];
    const dispatchedAt = new Date().toISOString();
    const issueId = this.extractIssueId(event);

    for (const [handlerName, handler] of handlersForEvent) {
      const startTime = Date.now();
      let result: HookHandlerResult;

      try {
        result = await handler(event);
      } catch (error) {
        result = {
          handled: false,
          durationMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      // Ensure durationMs is set even if handler didn't set it
      if (result.durationMs === undefined) {
        result.durationMs = Date.now() - startTime;
      }

      const log: HookInvocationLog = {
        eventType: event.eventType,
        eventId: event.eventId,
        issueId,
        handlerName,
        result,
        dispatchedAt,
      };

      logs.push(log);
      this.appendLog(log);
    }

    return logs;
  }

  /**
   * Get the recent invocation log.
   */
  getInvocationLog(limit?: number): HookInvocationLog[] {
    if (limit !== undefined) {
      return this.invocationLog.slice(-limit);
    }
    return [...this.invocationLog];
  }

  /**
   * Get invocation log entries for a specific event type.
   */
  getInvocationLogByEventType(
    eventType: IssueHookEventType,
    limit?: number
  ): HookInvocationLog[] {
    const filtered = this.invocationLog.filter(
      (log) => log.eventType === eventType
    );
    if (limit !== undefined) {
      return filtered.slice(-limit);
    }
    return filtered;
  }

  /**
   * Get invocation log entries for a specific issue ID.
   */
  getInvocationLogByIssueId(
    issueId: string,
    limit?: number
  ): HookInvocationLog[] {
    const filtered = this.invocationLog.filter(
      (log) => log.issueId === issueId
    );
    if (limit !== undefined) {
      return filtered.slice(-limit);
    }
    return filtered;
  }

  /**
   * Clear the invocation log.
   */
  clearInvocationLog(): void {
    this.invocationLog = [];
  }

  /**
   * Get the count of total invocations.
   */
  getInvocationCount(): number {
    return this.invocationLog.length;
  }

  /**
   * Get the count of invocations by event type.
   */
  getInvocationCountByEventType(): Record<IssueHookEventType, number> {
    const counts: Record<string, number> = {
      "issue.created": 0,
      "issue.updated": 0,
      "issue.assignment": 0,
    };

    for (const log of this.invocationLog) {
      counts[log.eventType] = (counts[log.eventType] || 0) + 1;
    }

    return counts as Record<IssueHookEventType, number>;
  }

  /**
   * Append to the invocation log, evicting oldest entries if at capacity.
   */
  private appendLog(log: HookInvocationLog): void {
    this.invocationLog.push(log);
    if (this.invocationLog.length > this.maxLogSize) {
      this.invocationLog = this.invocationLog.slice(-this.maxLogSize);
    }
  }

  /**
   * Extract the issue ID from a hook event payload.
   */
  private extractIssueId(event: IssueLifecycleHookEvent): string {
    const payload = event.payload as unknown as Record<string, unknown>;
    return (payload.issueId as string) ?? "(unknown)";
  }
}

// ─── Built-in Hook Handlers ──────────────────────────────────────────────────

/**
 * Logging hook handler that logs issue creation events.
 */
export async function logIssueCreatedHandler(
  event: IssueLifecycleHookEvent
): Promise<HookHandlerResult> {
  const startTime = Date.now();
  const payload = event.payload as IssueCreatedPayload;

  // Structured log output for observability
  const logEntry = {
    hook: "issue.created",
    eventId: event.eventId,
    issueId: payload.issueId,
    identifier: payload.identifier,
    title: payload.title,
    status: payload.status,
    companyId: payload.companyId,
    projectId: payload.projectId,
    actor: event.actor,
    occurredAt: event.occurredAt,
  };

  // In a real plugin worker, this would use ctx.logger.info()
  // For now, we return structured data that can be observed
  return {
    handled: true,
    message: `Issue created: ${payload.identifier} "${payload.title}" [${payload.status}]`,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Logging hook handler that logs issue update events.
 */
export async function logIssueUpdatedHandler(
  event: IssueLifecycleHookEvent
): Promise<HookHandlerResult> {
  const startTime = Date.now();
  const payload = event.payload as IssueUpdatedPayload;

  return {
    handled: true,
    message: `Issue updated: ${payload.identifier} changed fields: [${payload.changedFields.join(", ")}]${payload.previousStatus ? ` (was: ${payload.previousStatus})` : ""}`,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Logging hook handler that logs issue assignment events.
 */
export async function logIssueAssignmentHandler(
  event: IssueLifecycleHookEvent
): Promise<HookHandlerResult> {
  const startTime = Date.now();
  const payload = event.payload as IssueAssignmentPayload;

  const newAssignee = payload.assigneeAgentId ?? payload.assigneeUserId ?? "(unassigned)";
  const prevAssignee = payload.previousAssigneeAgentId ?? payload.previousAssigneeUserId ?? "(unassigned)";

  return {
    handled: true,
    message: `Issue assigned: ${payload.identifier} from ${prevAssignee} to ${newAssignee}`,
    durationMs: Date.now() - startTime,
  };
}

// ─── Helper: Convert PaperclipDomainEvent to IssueLifecycleHookEvent ─────────

/**
 * Map a Paperclip domain event to a normalized issue lifecycle hook event.
 *
 * Returns null if the event is not a recognized issue lifecycle event.
 */
export function mapDomainEventToHookEvent(
  domainEvent: PaperclipDomainEvent
): IssueLifecycleHookEvent | null {
  // Map Paperclip event types to our hook event types
  let hookEventType: IssueHookEventType | null = null;

  switch (domainEvent.eventType) {
    case "issue.created":
      hookEventType = "issue.created";
      break;
    case "issue.updated":
      hookEventType = "issue.updated";
      break;
    case "issue.checked_out":
    case "issue.released":
    case "issue.assignment_wakeup_requested":
      hookEventType = "issue.assignment";
      break;
    default:
      return null;
  }

  return {
    eventType: hookEventType,
    eventId: domainEvent.eventId,
    occurredAt: domainEvent.occurredAt,
    payload: domainEvent.payload as unknown as IssueHookPayload,
    actor: domainEvent.actor,
  };
}

// ─── Factory: Create Pre-wired Hook Manager ──────────────────────────────────

/**
 * Create a pre-wired IssueLifecycleHookManager with the standard BOS Light
 * logging hooks registered for all lifecycle events.
 */
export function createBosLightHookManager(
  maxLogSize?: number
): IssueLifecycleHookManager {
  const manager = new IssueLifecycleHookManager(maxLogSize);

  // Register built-in logging hooks
  manager.on("issue.created", "bos-light-log-created", logIssueCreatedHandler);
  manager.on("issue.updated", "bos-light-log-updated", logIssueUpdatedHandler);
  manager.on(
    "issue.assignment",
    "bos-light-log-assignment",
    logIssueAssignmentHandler
  );

  return manager;
}
