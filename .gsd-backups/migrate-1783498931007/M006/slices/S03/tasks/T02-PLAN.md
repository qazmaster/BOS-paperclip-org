---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T02: Build missionRouter.ts with pure routing logic

Create missionRouter.ts with routeApprovedMission(callerDivision, mission). Enforce caller is Div1.HCO using existing ownerBoundary.ts. Read mission.requested_divisions, exclude Div1 and Div7, emit 'work_assignment' DivisionPackets to each target division via divisionPacketRouter.ts. Emit 'status_update' packet to Div7.MissionControl with routing summary. Return MissionRoutingState with activated/pending/completed division lists. Return typed MissionRouterUnauthorized for non-Div1 callers. Export from index.ts. Keep mapping to canonical routing_rules from bos-company-template.json in comments.

## Inputs

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/divisionPacketRouter.ts`
- `plugin-bos-light/src/ownerBoundary.ts`
- `plugin-bos-light/src/missionIntake.ts`
- `plugin-bos-light/src/index.ts`

## Expected Output

- `plugin-bos-light/src/missionRouter.ts`
- `plugin-bos-light/src/index.ts`

## Verification

cd plugin-bos-light && npm run typecheck
