import type { Division, MissionRoutingState, MissionRouterUnauthorized, RoutingDecisionPacket } from "./contracts";
import type { MissionEnvelope } from "./missionIntake";
import { enforceOwnerBoundary } from "./ownerBoundary";
import { emitDivisionPacket } from "./divisionPacketRouter";

/**
 * Canonical routing rules from bos-company-template.json (v1.4.1):
 * - backlog_shaping:        Div1.HCO -> Div2.MasterPlanner
 * - budget_capacity:        Div1.HCO -> Div3.Treasury
 * - implementation:         Div1.HCO -> Div4.Production
 * - qa_security_review:     Div1.HCO -> Div5.QualificationsLibraryLearning
 * - external_io_request:    Div1.HCO -> Div5.QualificationsLibraryLearning -> Div6.External -> Div5.QualificationsLibraryLearning
 * - paid_credentialed_external_io_request: Div1.HCO -> Div5.QualificationsLibraryLearning -> Div3.Treasury -> Div6.External -> Div5.QualificationsLibraryLearning
 * - complex_decision:       Div1.HCO -> Div7.MissionControl
 *
 * This router reads `mission.requested_divisions`, excludes Div1.HCO (router itself)
 * and Div7.MissionControl (oversight, not worker), then emits work_assignment packets
 * to each remaining division. A status_update summary is sent to Div7.MissionControl.
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
 * Route an approved mission from Div1.HCO to the appropriate worker divisions.
 *
 * - Only Div1.HCO may call this function.
 * - Div1.HCO and Div7.MissionControl are excluded from work assignments.
 * - Every other division in `mission.requested_divisions` receives a work_assignment packet.
 * - Div7.MissionControl receives a status_update with the routing summary.
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

  // Exclude Div1 (router itself) and Div7 (oversight / not a worker division)
  const excludedDivisions: Division[] = [DIV1_HCO, DIV7_MISSION_CONTROL];
  const activatedDivisions = mission.requested_divisions.filter(
    (d) => !excludedDivisions.includes(d)
  );

  // Build routing decision packet payload
  const routingPacket: RoutingDecisionPacket = {
    schema_version: "1.0",
    packet_id: generatePacketId(),
    mission_id: mission.mission_id,
    activated_divisions: activatedDivisions,
    excluded_divisions: excludedDivisions,
    routing_rule: deriveRoutingRule(activatedDivisions),
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

  // Emit status_update to Div7.MissionControl with routing summary
  emitDivisionPacket(DIV1_HCO, DIV7_MISSION_CONTROL, "status_update", {
    mission_id: mission.mission_id,
    title: mission.title,
    status: "ROUTED",
    activated_divisions: activatedDivisions,
    excluded_divisions: excludedDivisions,
    routing_packet_id: routingPacket.packet_id,
    routed_at: routingPacket.routed_at,
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
 * Derive a canonical routing rule label from the set of activated divisions.
 * This is a best-effort mapping to the rules defined in bos-company-template.json.
 */
function deriveRoutingRule(activatedDivisions: Division[]): string {
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
  if (has("Div7.MissionControl")) {
    return "complex_decision";
  }
  return "multi_division_workflow";
}
