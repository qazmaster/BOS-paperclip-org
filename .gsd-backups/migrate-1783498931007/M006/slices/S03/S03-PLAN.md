# S03: Div1 Internal Routing Control

**Goal:** Div1 routes approved missions to Div2/Div3/Div6/Div5/Div4 via typed work-assignment packets; Div1 does not perform division work itself; Div1 does not directly ask human. All routing is contract-level with in-memory fixtures.
**Demo:** Div1 routes mission to Div2/Div3/Div6/Div5/Div4; Div1 does not perform all work itself; Div1 does not directly ask human.

## Must-Haves

- TypeScript compiles with zero errors. All ~20 missionRouter tests pass. Only Div1.HCO can invoke routeApprovedMission. Div1 emits work_assignment packets to other divisions but never executes work itself. Div7 receives status_update summary, not work_assignment. Unauthorized callers get typed diagnostic, not thrown exceptions. No live Paperclip runtime claims.

## Proof Level

- This slice proves: contract

## Integration Closure

Consumes S02 contracts (Division, OwnerBoundaryResult), division packet router (emitDivisionPacket, clearPacketRouter), and owner boundary enforcer (enforceOwnerBoundary). Introduces missionRouter.ts as the new Div1 routing contract. Downstream S04 will consume MissionRoutingState and RoutingDecisionPacket for budget/secret access routing.

## Verification

- Run the task and slice verification checks for this slice.

## Tasks

- [x] **T01: Extend contracts and packet router with routing types** `est:25m`
  Add RoutingDecisionPacket and MissionRoutingState types to contracts.ts so Div1 can record routing decisions with activated/excluded division lists, routing rule, and timestamp. Add MissionRouterUnauthorized diagnostic type for typed rejection of unauthorized callers. Extend DivisionPacketType in divisionPacketRouter.ts to include 'work_assignment' for inter-division mission handoff. Update index.ts exports.
  - Files: `plugin-bos-light/src/contracts.ts`, `plugin-bos-light/src/divisionPacketRouter.ts`, `plugin-bos-light/src/index.ts`
  - Verify: cd plugin-bos-light && npm run typecheck

- [x] **T02: Build missionRouter.ts with pure routing logic** `est:35m`
  Create missionRouter.ts with routeApprovedMission(callerDivision, mission). Enforce caller is Div1.HCO using existing ownerBoundary.ts. Read mission.requested_divisions, exclude Div1 and Div7, emit 'work_assignment' DivisionPackets to each target division via divisionPacketRouter.ts. Emit 'status_update' packet to Div7.MissionControl with routing summary. Return MissionRoutingState with activated/pending/completed division lists. Return typed MissionRouterUnauthorized for non-Div1 callers. Export from index.ts. Keep mapping to canonical routing_rules from bos-company-template.json in comments.
  - Files: `plugin-bos-light/src/missionRouter.ts`, `plugin-bos-light/src/index.ts`
  - Verify: cd plugin-bos-light && npm run typecheck

- [x] **T03: Exhaustive contract tests for mission router** `est:45m`
  Write ~20 vitest tests in tests/missionRouter.test.ts covering: all 7 Division values as caller (only Div1.HCO authorized), correct work_assignment packets emitted to requested divisions excluding Div1/Div7, Div7 receives status_update not work_assignment, Div1 excluded from work targets, unauthorized callers receive typed MissionRouterUnauthorized with descriptive reason, mission transitions to IN_PROGRESS routing state, empty requested_divisions edge case, routing state tracks activated/pending/completed correctly, packet router state isolation between tests. Use clearPacketRouter beforeEach. Import MissionEnvelope from missionIntake.ts for fixture construction.
  - Files: `plugin-bos-light/tests/missionRouter.test.ts`
  - Verify: cd plugin-bos-light && npx vitest run tests/missionRouter.test.ts

## Files Likely Touched

- plugin-bos-light/src/contracts.ts
- plugin-bos-light/src/divisionPacketRouter.ts
- plugin-bos-light/src/index.ts
- plugin-bos-light/src/missionRouter.ts
- plugin-bos-light/tests/missionRouter.test.ts
