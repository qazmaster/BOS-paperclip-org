import type {
  Division,
  MissionRoutingState,
  MissionRouterUnauthorized,
  RoutingDecisionPacket,
  DecisionDelegatedPayload,
  CynefinDomain
} from "./contracts";
import type { MissionEnvelope } from "./missionIntake";
import { enforceOwnerBoundary } from "./ownerBoundary";
import { emitDivisionPacket } from "./divisionPacketRouter";
import { deriveMissionSignals, requiresExecutiveDecision as checkRequiresExecutiveDecision } from "./missionSignals";

/**
 * Routing architecture (D042, D043, D046):
 *
 * Div7.MissionControl = executive regime controller (WHY / WHAT STRATEGIC MODE)
 * Div1.HCO = operational authority (WHO / WHERE / WHEN)
 *
 * Pre-decision routing:
 * - If mission requires executive judgment -> route to Div7 as requires_executive_decision
 * - If routine mission -> direct operational route (no Div7 involvement)
 *
 * Post-decision routing:
 * - Div7 emits DecisionDelegated packet
 * - Div1 receives and applies operational routing based on cynefinDomain
 */

const DIV1_HCO = "Div1.HCO" as const;
const DIV7_MISSION_CONTROL = "Div7.MissionControl" as const;

function now(): string {
  return new Date().toISOString();
}

function generatePacketId(): string {
  return `pkt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Determine if a mission requires Div7 executive decision.
 * Uses MissionSignals from missionSignals.ts for deterministic analysis.
 */
export function requiresExecutiveDecision(mission: MissionEnvelope): boolean {
  const signals = deriveMissionSignals(mission);
  return checkRequiresExecutiveDecision(signals);
}

/**
 * Derive operational route from cynefin domain (post-Div7 decision).
 * This is the second pass of two-pass routing.
 */
export function deriveOperationalRouteFromDecision(
  decision: DecisionDelegatedPayload
): { targetDivisions: Division[]; routingRule: string } {
  const domain = decision.cynefin_domain;
  const directive = decision.routing_directive;

  // Use routing directive from DecisionDelegated if available
  if (directive.targetDivisions.length > 0) {
    return {
      targetDivisions: directive.targetDivisions,
      routingRule: directive.routingRule
    };
  }

  // Fallback: derive from cynefin domain
  switch (domain) {
    case "COMPLEX":
      return {
        targetDivisions: ["Div2.MasterPlanner", "Div3.Treasury", "Div4.Production", "Div5.QualificationsLibraryLearning"],
        routingRule: "complex_safe_to_fail"
      };
    case "CHAOTIC":
      return {
        targetDivisions: ["Div1.HCO", "Div3.Treasury", "Div5.QualificationsLibraryLearning"],
        routingRule: "chaotic_incident_flow"
      };
    case "COMPLICATED":
      return {
        targetDivisions: ["Div2.MasterPlanner", "Div4.Production", "Div5.QualificationsLibraryLearning"],
        routingRule: "complicated_expert_review"
      };
    default:
      return {
        targetDivisions: ["Div2.MasterPlanner", "Div4.Production", "Div5.QualificationsLibraryLearning"],
        routingRule: "standard_operational"
      };
  }
}

/**
 * Route an approved mission from Div1.HCO to the appropriate worker divisions.
 *
 * Two-pass routing:
 * 1. Pre-decision: check if Div7 executive decision is needed
 *    - If yes: route to Div7 as requires_executive_decision (not terminal)
 *    - If no: direct operational route
 * 2. Post-decision: Div1 receives DecisionDelegated and applies operational routing
 *
 * Returns MissionRoutingState on success, or MissionRouterUnauthorized on auth failure.
 */
export function routeApprovedMission(
  callerDivision: Division,
  mission: MissionEnvelope
): MissionRoutingState | MissionRouterUnauthorized {
  if (callerDivision !== DIV1_HCO) {
    return {
      schema_version: "1.0",
      authorized: false,
      caller: callerDivision,
      required_role: DIV1_HCO,
      reason: `Mission routing is restricted to Div1.HCO. Caller ${callerDivision} is not authorized to route missions.`,
      rejected_at: now(),
    };
  }

  // Pre-decision: check if Div7 executive decision is needed
  if (requiresExecutiveDecision(mission)) {
    // Route to Div7 as requires_executive_decision (NOT terminal)
    const routingPacket: RoutingDecisionPacket = {
      schema_version: "1.0",
      packet_id: generatePacketId(),
      mission_id: mission.mission_id,
      activated_divisions: [DIV7_MISSION_CONTROL],
      excluded_divisions: [DIV1_HCO],
      routing_rule: "requires_executive_decision",
      routed_by: DIV1_HCO,
      routed_at: now(),
    };

    // Emit to Div7 for executive decision
    emitDivisionPacket(DIV1_HCO, DIV7_MISSION_CONTROL, "work_assignment", {
      ...routingPacket,
      assigned_to: DIV7_MISSION_CONTROL,
      requires_decision: true,
    });

    const state: MissionRoutingState = {
      schema_version: "1.0",
      mission_id: mission.mission_id,
      status: "ROUTED",
      routing_packet_id: routingPacket.packet_id,
      activated_divisions: [DIV7_MISSION_CONTROL],
      excluded_divisions: [DIV1_HCO],
      current_division: DIV7_MISSION_CONTROL,
      updated_at: now(),
    };

    return state;
  }

  // Routine mission: direct operational route (no Div7 involvement)
  const excludedDivisions: Division[] = [DIV1_HCO, DIV7_MISSION_CONTROL];
  const activatedDivisions = mission.requested_divisions.filter(
    (d) => !excludedDivisions.includes(d)
  );

  const routingPacket: RoutingDecisionPacket = {
    schema_version: "1.0",
    packet_id: generatePacketId(),
    mission_id: mission.mission_id,
    activated_divisions: activatedDivisions,
    excluded_divisions: excludedDivisions,
    routing_rule: deriveRoutineRoutingRule(activatedDivisions),
    routed_by: DIV1_HCO,
    routed_at: now(),
  };

  // Emit work_assignment packets to each activated division
  for (const targetDivision of activatedDivisions) {
    emitDivisionPacket(DIV1_HCO, targetDivision, "work_assignment", {
      ...routingPacket,
      assigned_to: targetDivision,
    });
  }

  // Emit status_update to Div7.MissionControl with routing summary (for oversight only)
  emitDivisionPacket(DIV1_HCO, DIV7_MISSION_CONTROL, "status_update", {
    mission_id: mission.mission_id,
    title: mission.title,
    status: "ROUTED",
    activated_divisions: activatedDivisions,
    excluded_divisions: excludedDivisions,
    routing_packet_id: routingPacket.packet_id,
    routed_at: routingPacket.routed_at,
    requires_decision: false,
  });

  const state: MissionRoutingState = {
    schema_version: "1.0",
    mission_id: mission.mission_id,
    status: "ROUTED",
    routing_packet_id: routingPacket.packet_id,
    activated_divisions: activatedDivisions,
    excluded_divisions: excludedDivisions,
    current_division: activatedDivisions.length > 0 ? activatedDivisions[0] : null,
    updated_at: now(),
  };

  return state;
}

/**
 * Route operationally after Div7 has made a decision.
 * This is the second pass of two-pass routing.
 *
 * Called when Div1 receives a DecisionDelegated packet from Div7.
 */
export function routeAfterDecision(
  callerDivision: Division,
  missionId: string,
  decision: DecisionDelegatedPayload
): MissionRoutingState | MissionRouterUnauthorized {
  if (callerDivision !== DIV1_HCO) {
    return {
      schema_version: "1.0",
      authorized: false,
      caller: callerDivision,
      required_role: DIV1_HCO,
      reason: `Post-decision routing is restricted to Div1.HCO. Caller ${callerDivision} is not authorized.`,
      rejected_at: now(),
    };
  }

  const { targetDivisions, routingRule } = deriveOperationalRouteFromDecision(decision);

  const routingPacket: RoutingDecisionPacket = {
    schema_version: "1.0",
    packet_id: generatePacketId(),
    mission_id: missionId,
    activated_divisions: targetDivisions,
    excluded_divisions: [DIV1_HCO, DIV7_MISSION_CONTROL],
    routing_rule: routingRule,
    routed_by: DIV1_HCO,
    routed_at: now(),
  };

  // Emit work_assignment packets to each target division
  for (const targetDivision of targetDivisions) {
    emitDivisionPacket(DIV1_HCO, targetDivision, "work_assignment", {
      ...routingPacket,
      assigned_to: targetDivision,
      decision_id: decision.decision_id,
      cynefin_domain: decision.cynefin_domain,
      recommended_mode: decision.recommended_mode,
      constraints: decision.constraints,
    });
  }

  // Emit status_update to Div7 confirming operational routing
  emitDivisionPacket(DIV1_HCO, DIV7_MISSION_CONTROL, "status_update", {
    mission_id: missionId,
    status: "OPERATIONAL_ROUTING_COMPLETE",
    decision_id: decision.decision_id,
    cynefin_domain: decision.cynefin_domain,
    routing_rule: routingRule,
    target_divisions: targetDivisions,
    routed_at: now(),
  });

  const state: MissionRoutingState = {
    schema_version: "1.0",
    mission_id: missionId,
    status: "ROUTED",
    routing_packet_id: routingPacket.packet_id,
    activated_divisions: targetDivisions,
    excluded_divisions: [DIV1_HCO, DIV7_MISSION_CONTROL],
    current_division: targetDivisions.length > 0 ? targetDivisions[0] : null,
    updated_at: now(),
  };

  return state;
}

/**
 * Derive routing rule for routine missions (no Div7 involvement).
 */
function deriveRoutineRoutingRule(activatedDivisions: Division[]): string {
  const has = (d: Division) => activatedDivisions.includes(d);
  const set = new Set(activatedDivisions);

  if (has("Div5.QualificationsLibraryLearning") && has("Div6.External") && has("Div3.Treasury")) {
    return "paid_credentialed_external_io_request";
  }
  if (has("Div5.QualificationsLibraryLearning") && has("Div6.External")) {
    return "external_io_request";
  }
  if (set.size === 1 && has("Div2.MasterPlanner")) {
    return "backlog_shaping";
  }
  if (set.size === 1 && has("Div3.Treasury")) {
    return "budget_capacity";
  }
  if (set.size === 1 && has("Div4.Production")) {
    return "implementation";
  }
  if (set.size === 1 && has("Div5.QualificationsLibraryLearning")) {
    return "qa_security_review";
  }
  return "multi_division_workflow";
}

/**
 * @deprecated Use requiresExecutiveDecision() + deriveOperationalRouteFromDecision() instead.
 * This function is kept for backward compatibility only.
 */
export function deriveRoutingRule(activatedDivisions: Division[]): string {
  const has = (d: Division) => activatedDivisions.includes(d);
  const set = new Set(activatedDivisions);

  if (has("Div5.QualificationsLibraryLearning") && has("Div6.External") && has("Div3.Treasury")) {
    return "paid_credentialed_external_io_request";
  }
  if (has("Div5.QualificationsLibraryLearning") && has("Div6.External")) {
    return "external_io_request";
  }
  if (set.size === 1 && has("Div2.MasterPlanner")) {
    return "backlog_shaping";
  }
  if (set.size === 1 && has("Div3.Treasury")) {
    return "budget_capacity";
  }
  if (set.size === 1 && has("Div4.Production")) {
    return "implementation";
  }
  if (set.size === 1 && has("Div5.QualificationsLibraryLearning")) {
    return "qa_security_review";
  }
  // IMPORTANT: This no longer returns "complex_decision" as terminal route.
  // Div7 presence now triggers requires_executive_decision in routeApprovedMission().
  if (has("Div7.MissionControl")) {
    return "requires_executive_decision";
  }
  return "multi_division_workflow";
}
