---
estimated_steps: 1
estimated_files: 3
skills_used: []
---

# T01: Extend contracts and packet router with routing types

Add RoutingDecisionPacket and MissionRoutingState types to contracts.ts so Div1 can record routing decisions with activated/excluded division lists, routing rule, and timestamp. Add MissionRouterUnauthorized diagnostic type for typed rejection of unauthorized callers. Extend DivisionPacketType in divisionPacketRouter.ts to include 'work_assignment' for inter-division mission handoff. Update index.ts exports.

## Inputs

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/divisionPacketRouter.ts`
- `plugin-bos-light/src/index.ts`

## Expected Output

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/divisionPacketRouter.ts`
- `plugin-bos-light/src/index.ts`

## Verification

cd plugin-bos-light && npm run typecheck
