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
import type { MissionEnvelope } from "./missionIntake";
import type { Division, MissionRoutingState, MissionRouterUnauthorized, MissionSignals, DecisionDelegatedPayload } from "./contracts";
import { routeApprovedMission, routeAfterDecision } from "./missionRouter";
import { deriveMissionSignals } from "./missionSignals";
import { getDivisionInbox } from "./divisionPacketRouter";
import { decide, createDecisionDelegated, delegateDecisionToDiv1 } from "./decision";

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

// ─── MissionRouter Issue Created Hook ────────────────────────────────────────

/**
 * Record of a packet delivered to a division as part of a routing decision.
 * Links DivisionPacketRouter delivery back to the originating issue.
 */
export interface PacketDeliveryRecord {
  packetId: string;
  packetType: string;
  toDivision: Division;
  fromDivision: Division;
  deliveredAt: string;
}

/**
 * Routing decision log entry for observability.
 * Emitted whenever the MissionRouter hook processes an issue.created event.
 * Includes packet delivery diagnostics for DivisionPacketRouter traceability.
 * When two-pass routing occurs (Div7 executive decision), the second-pass
 * routing result and DecisionDelegated payload are included.
 */
export interface RoutingDecisionLogEntry {
  issueId: string;
  identifier: string;
  missionId: string;
  signals: MissionSignals;
  routingResult: MissionRoutingState | MissionRouterUnauthorized;
  packetDeliveries: PacketDeliveryRecord[];
  routedAt: string;
  /** Present when Div7 executive decision triggered two-pass routing. */
  twoPassRouting?: {
    decisionDelegated: DecisionDelegatedPayload;
    operationalRoutingResult: MissionRoutingState | MissionRouterUnauthorized;
    operationalPacketDeliveries: PacketDeliveryRecord[];
    completedAt: string;
  };
}

/** In-memory routing decision log for diagnostics. */
const routingDecisionLog: RoutingDecisionLogEntry[] = [];
const MAX_ROUTING_LOG_SIZE = 500;

/** Index: issueId -> packet IDs for traceability. */
const issuePacketIndex: Map<string, string[]> = new Map();

/** Get recent routing decision log entries. */
export function getRoutingDecisionLog(limit?: number): RoutingDecisionLogEntry[] {
  if (limit !== undefined) {
    return routingDecisionLog.slice(-limit);
  }
  return [...routingDecisionLog];
}

/** Clear the routing decision log. */
export function clearRoutingDecisionLog(): void {
  routingDecisionLog.length = 0;
  issuePacketIndex.clear();
}

/**
 * Get all packets delivered for a specific issue.
 * Includes both first-pass and second-pass (DecisionDelegated) packets.
 */
export function getPacketsForIssue(issueId: string): PacketDeliveryRecord[] {
  const found: PacketDeliveryRecord[] = [];
  for (const entry of routingDecisionLog) {
    if (entry.issueId === issueId) {
      found.push(...entry.packetDeliveries);
      if (entry.twoPassRouting) {
        found.push(...entry.twoPassRouting.operationalPacketDeliveries);
      }
    }
  }
  return found;
}

/**
 * Get a summary of packet deliveries grouped by target division.
 * Useful for observing which divisions have received work.
 */
export function getRoutingPacketSummary(): Map<Division, { count: number; latestPacketId: string }> {
  const summary = new Map<Division, { count: number; latestPacketId: string }>();
  for (const entry of routingDecisionLog) {
    for (const delivery of entry.packetDeliveries) {
      const existing = summary.get(delivery.toDivision);
      if (existing) {
        existing.count++;
        existing.latestPacketId = delivery.packetId;
      } else {
        summary.set(delivery.toDivision, { count: 1, latestPacketId: delivery.packetId });
      }
    }
  }
  return summary;
}

/**
 * Convert an IssueCreatedPayload into a MissionEnvelope suitable for
 * MissionRouter consumption.
 *
 * Derives risk_level and requested_divisions from issue metadata.
 * Uses identifier prefix and keywords to infer division routing.
 */
export function issueCreatedToMissionEnvelope(
  payload: IssueCreatedPayload
): MissionEnvelope {
  const text = `${payload.title} ${payload.description ?? ""}`.toLowerCase();
  const identifier = payload.identifier;

  // Infer risk level from priority and keywords
  let riskLevel: MissionEnvelope["risk_level"] = "MEDIUM";
  if (payload.priority === "urgent" || payload.priority === "critical") {
    riskLevel = "CRITICAL";
  } else if (payload.priority === "high") {
    riskLevel = "HIGH";
  } else if (payload.priority === "low") {
    riskLevel = "LOW";
  }

  // Keyword-based risk escalation
  if (/outage|incident|emergency|crash/.test(text)) {
    riskLevel = "CRITICAL";
  } else if (/deploy|production|customer/.test(text)) {
    riskLevel = "HIGH";
  } else if (/spike|prototype|experiment/.test(text)) {
    riskLevel = "LOW";
  }

  // Infer requested divisions from keywords
  const divisions: Division[] = ["Div1.HCO"];

  if (/code|feature|implement|build|fix|bug|refactor|deploy/.test(text)) {
    divisions.push("Div4.Production");
  }
  if (/test|qa|verify|audit|review|security|quality/.test(text)) {
    divisions.push("Div5.QualificationsLibraryLearning");
  }
  if (/external|api|integration|third-party|partner|webhook/.test(text)) {
    divisions.push("Div6.External");
  }
  if (/budget|cost|funding|resource|grant/.test(text)) {
    divisions.push("Div3.Treasury");
  }
  if (/policy|strategy|strategic|ambiguous|experiment/.test(text)) {
    divisions.push("Div7.MissionControl");
  }
  if (/plan|backlog|roadmap|prioritiz/.test(text)) {
    divisions.push("Div2.MasterPlanner");
  }

  // Deduplicate
  const uniqueDivisions = [...new Set(divisions)];

  return {
    schema_version: "1.0",
    mission_id: payload.issueId,
    title: payload.title,
    description: payload.description ?? payload.title,
    business_goal: `Issue ${identifier}: ${payload.title}`,
    risk_level: riskLevel,
    requested_divisions: uniqueDivisions,
    status: "APPROVED",
    created_at: payload.createdAt,
    updated_at: payload.createdAt,
  };
}

/**
 * Snapshot a set of division inboxes and return a diff of new packets after routing.
 * Helper to avoid duplicating the snapshot-diff pattern.
 */
function captureNewPackets(
  snapshotBefore: Map<Division, number>,
  divisions: Iterable<Division>
): PacketDeliveryRecord[] {
  const deliveries: PacketDeliveryRecord[] = [];
  for (const div of divisions) {
    const beforeCount = snapshotBefore.get(div) ?? 0;
    const afterInbox = getDivisionInbox(div);
    for (let i = beforeCount; i < afterInbox.length; i++) {
      const pkt = afterInbox[i];
      deliveries.push({
        packetId: pkt.packet_id,
        packetType: pkt.packet_type,
        toDivision: pkt.to_division,
        fromDivision: pkt.from_division,
        deliveredAt: pkt.timestamp,
      });
    }
  }
  return deliveries;
}

/**
 * Execute two-pass routing: simulate Div7 executive decision, then route operationally.
 *
 * When the first-pass routes a mission to Div7 as requires_executive_decision,
 * this function:
 * 1. Constructs mission signals text for Div7's decide()
 * 2. Creates a DecisionDelegated payload
 * 3. Calls routeAfterDecision() for second-pass operational routing
 * 4. Returns the DecisionDelegated payload, operational routing result, and packet deliveries
 *
 * This closes the DecisionDelegated flow loop at the issue lifecycle level.
 */
function executeDecisionDelegatedFlow(
  mission: MissionEnvelope,
  signals: MissionSignals
): {
  decisionDelegated: DecisionDelegatedPayload;
  operationalRoutingResult: MissionRoutingState | MissionRouterUnauthorized;
  operationalPacketDeliveries: PacketDeliveryRecord[];
} {
  // Build signal text for Div7's deterministic decision engine
  const signalParts: string[] = [];
  if (signals.incidentSignals) signalParts.push("incident outage emergency critical");
  if (signals.policySignals) signalParts.push("strategy policy ambiguous experiment");
  if (signals.ambiguityLevel === "high") signalParts.push("uncertain unknown");
  if (signals.riskLevel === "CRITICAL") signalParts.push("critical runaway");
  if (signalParts.length === 0) signalParts.push("strategic direction unclear");

  // Div7 makes a decision
  const decision = decide({
    issue_id: mission.mission_id,
    signals: signalParts,
    confidence: signals.riskLevel === "CRITICAL" ? 0.9 : 0.7,
  });

  if (!decision.accepted) {
    throw new Error(`Div7 decision rejected for mission ${mission.mission_id}`);
  }

  // Create DecisionDelegated payload
  const decisionDelegated = createDecisionDelegated(decision);

  // Also emit the DecisionDelegated packet from Div7 to Div1
  delegateDecisionToDiv1(decision);

  // Snapshot inboxes before second-pass routing
  const allTargetDivisions = new Set<Division>([
    ...decisionDelegated.routing_directive.targetDivisions,
    "Div7.MissionControl",
  ]);
  const inboxSnapshotBefore = new Map<Division, number>();
  for (const div of allTargetDivisions) {
    inboxSnapshotBefore.set(div, getDivisionInbox(div).length);
  }

  // Second-pass: Div1 routes operationally based on DecisionDelegated
  const operationalRoutingResult = routeAfterDecision(
    "Div1.HCO",
    mission.mission_id,
    decisionDelegated
  );

  // Capture second-pass packet deliveries
  const operationalPacketDeliveries = captureNewPackets(inboxSnapshotBefore, allTargetDivisions);

  return {
    decisionDelegated,
    operationalRoutingResult,
    operationalPacketDeliveries,
  };
}

/**
 * Hook handler that wires issue.created events to MissionRouter.
 *
 * On issue creation:
 * 1. Converts issue payload to MissionEnvelope
 * 2. Derives MissionSignals (deterministic keyword analysis)
 * 3. Calls routeApprovedMission from Div1.HCO (first pass)
 * 4. If mission routes to Div7 (requires_executive_decision), triggers
 *    DecisionDelegated flow for two-pass routing
 * 5. Logs the routing decision for observability
 *
 * Two-pass routing:
 * - First pass: Div1 routes to Div7 as requires_executive_decision
 * - Second pass: Div7 decides, emits DecisionDelegated, Div1 routes operationally
 *
 * This is the entry point for live MissionRouter integration.
 * Routing decisions are logged and can be inspected via getRoutingDecisionLog().
 */
export async function missionRouterIssueCreatedHandler(
  event: IssueLifecycleHookEvent
): Promise<HookHandlerResult> {
  const startTime = Date.now();
  const payload = event.payload as IssueCreatedPayload;

  try {
    // Step 1: Convert issue to mission envelope
    const mission = issueCreatedToMissionEnvelope(payload);

    // Step 2: Derive mission signals
    const signals = deriveMissionSignals(mission);

    // Step 3: Snapshot inbox state before first-pass routing
    const inboxSnapshotBefore = new Map<Division, number>();
    for (const div of mission.requested_divisions) {
      inboxSnapshotBefore.set(div, getDivisionInbox(div).length);
    }
    inboxSnapshotBefore.set("Div7.MissionControl", getDivisionInbox("Div7.MissionControl").length);

    // Step 4: First-pass route via MissionRouter (caller is Div1.HCO)
    const routingResult = routeApprovedMission("Div1.HCO", mission);

    // Step 5: Capture first-pass packet deliveries
    const allFirstPassDivisions = new Set<Division>([
      ...mission.requested_divisions,
      "Div7.MissionControl",
    ]);
    const packetDeliveries = captureNewPackets(inboxSnapshotBefore, allFirstPassDivisions);

    // Step 6: Check if first-pass routed to Div7 (two-pass routing needed)
    let twoPassRouting: RoutingDecisionLogEntry["twoPassRouting"];

    const isAuthorized = "authorized" in routingResult && routingResult.authorized === false;

    if (!isAuthorized) {
      const state = routingResult as MissionRoutingState;

      if (
        state.activated_divisions.length === 1 &&
        state.activated_divisions[0] === "Div7.MissionControl" &&
        state.excluded_divisions.includes("Div1.HCO")
      ) {
        // Two-pass routing: Div7 executive decision required
        const flowResult = executeDecisionDelegatedFlow(mission, signals);
        twoPassRouting = {
          decisionDelegated: flowResult.decisionDelegated,
          operationalRoutingResult: flowResult.operationalRoutingResult,
          operationalPacketDeliveries: flowResult.operationalPacketDeliveries,
          completedAt: new Date().toISOString(),
        };
      }
    }

    // Step 7: Log the routing decision with packet delivery diagnostics
    const logEntry: RoutingDecisionLogEntry = {
      issueId: payload.issueId,
      identifier: payload.identifier,
      missionId: mission.mission_id,
      signals,
      routingResult,
      packetDeliveries,
      routedAt: new Date().toISOString(),
      twoPassRouting,
    };

    routingDecisionLog.push(logEntry);
    if (routingDecisionLog.length > MAX_ROUTING_LOG_SIZE) {
      routingDecisionLog.splice(0, routingDecisionLog.length - MAX_ROUTING_LOG_SIZE);
    }

    // Index packets by issueId for traceability (includes both passes)
    const existingIds = issuePacketIndex.get(payload.issueId) ?? [];
    const allPacketIds = [...packetDeliveries.map(d => d.packetId)];
    if (twoPassRouting) {
      allPacketIds.push(...twoPassRouting.operationalPacketDeliveries.map(d => d.packetId));
    }
    existingIds.push(...allPacketIds);
    issuePacketIndex.set(payload.issueId, existingIds);

    if (isAuthorized) {
      return {
        handled: true,
        message: `MissionRouter rejected routing for ${payload.identifier}: unauthorized caller`,
        durationMs: Date.now() - startTime,
      };
    }

    const state = routingResult as MissionRoutingState;
    const packetCount = packetDeliveries.length;

    if (twoPassRouting) {
      const opState = twoPassRouting.operationalRoutingResult;
      const opDivisions = "activated_divisions" in opState ? opState.activated_divisions.join(", ") : "none";
      const opPacketCount = twoPassRouting.operationalPacketDeliveries.length;
      return {
        handled: true,
        message: `MissionRouter routed ${payload.identifier} [${signals.taskClass}] → Div7 (executive decision) → ${opDivisions} (${packetCount} pre-decision + ${opPacketCount} post-decision packets, domain: ${twoPassRouting.decisionDelegated.cynefin_domain})`,
        durationMs: Date.now() - startTime,
      };
    }

    const divisionNames = state.activated_divisions.join(", ");
    return {
      handled: true,
      message: `MissionRouter routed ${payload.identifier} [${signals.taskClass}] → ${divisionNames} (${packetCount} packet${packetCount !== 1 ? "s" : ""} delivered, rule: ${state.routing_packet_id ? "routed" : "no-op"})`,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      handled: false,
      message: `MissionRouter hook failed for ${payload.identifier}`,
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ─── Factory: Create Pre-wired Hook Manager ──────────────────────────────────

/**
 * Create a pre-wired IssueLifecycleHookManager with the standard BOS Light
 * logging hooks registered for all lifecycle events.
 *
 * Also registers the MissionRouter issue.created hook so that issue creation
 * triggers MissionSignals derivation and routing decisions.
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

  // Register MissionRouter integration hook for issue creation
  manager.on(
    "issue.created",
    "bos-light-mission-router",
    missionRouterIssueCreatedHandler
  );

  return manager;
}
