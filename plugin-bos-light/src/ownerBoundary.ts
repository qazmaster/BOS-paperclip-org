import type { Division, OwnerBoundaryResult } from "./contracts";

/**
 * Returns true when the caller is the canonical mission-control oversight division.
 * Per MEM154 canonical ownership map, Div7.MissionControl owns mission-control oversight.
 */
export function isDiv7MissionControl(callerDivision: Division): boolean {
  return callerDivision === "Div7.MissionControl";
}

/**
 * Pure boundary enforcer: may `callerDivision` act on behalf of `allowedDivision`?
 *
 * Rules aligned with the canonical v1.4.1 ownership map (MEM154):
 * - A division may always act as itself.
 * - Div7.MissionControl may cross any boundary (mission-control oversight).
 * - All other cross-division calls are unauthorized.
 */
export function enforceOwnerBoundary(
  callerDivision: Division,
  allowedDivision: Division
): OwnerBoundaryResult {
  if (callerDivision === allowedDivision) {
    return { authorized: true, caller: callerDivision, allowed: allowedDivision };
  }

  if (isDiv7MissionControl(callerDivision)) {
    return { authorized: true, caller: callerDivision, allowed: allowedDivision };
  }

  return {
    authorized: false,
    caller: callerDivision,
    allowed: allowedDivision,
    reason: `Division ${callerDivision} is not authorized to act on behalf of ${allowedDivision}. Only Div7.MissionControl or the division itself may cross this boundary.`,
  };
}
