---
id: S03
parent: M006
milestone: M006
provides:
  - MissionRoutingState contract for downstream S04 budget/secret access routing.
  - RoutingDecisionPacket for recording Div1 routing decisions with timestamp and rule.
  - missionRouter.ts as the canonical Div1.HCO routing surface.
requires:
  - slice: S02
    provides: Division and OwnerBoundaryResult contracts, division packet router (emitDivisionPacket, clearPacketRouter), owner boundary enforcer (enforceOwnerBoundary)
affects:
  []
key_files:
  - plugin-bos-light/src/missionRouter.ts
  - plugin-bos-light/src/contracts.ts
  - plugin-bos-light/tests/missionRouter.test.ts
key_decisions:
  - Strict caller identity check (caller === 'Div1.HCO') instead of ownerBoundary enforcement alone, because Div7.MissionControl is authorized to cross all boundaries per ownerBoundary.ts and must not be allowed to route missions on Div1's behalf.
  - Routing rule derivation maps activated division combinations to canonical labels from bos-company-template.json for observability and traceability.
  - Mission routing state uses status 'ROUTED' (not 'IN_PROGRESS') to precisely describe Div1's scope: routing decisions are made, but actual mission execution progress belongs to downstream divisions.
patterns_established:
  - Strict caller identity beyond generic authorization when the authorized party must not proxy critical operations.
  - Typed packet emission (work_assignment, status_update) for inter-division routing with immutable state returns.
observability_surfaces:
  - none
drill_down_paths:
  []
duration: ""
verification_result: passed
completed_at: 2026-06-01T07:56:56.064Z
blocker_discovered: false
---

# S03: Div1 Internal Routing Control

**Div1.HCO routing contract enforces strict caller identity, emits typed work-assignment packets to 5 downstream divisions, and returns immutable MissionRoutingState with 24 passing contract tests.**

## What Happened

T01 extended contracts.ts with RoutingDecisionPacket (activated/excluded division lists, routing rule, timestamp), MissionRoutingState (activated/pending/completed lifecycle tracking), and MissionRouterUnauthorized (typed diagnostic for unauthorized callers). Extended DivisionPacketType in divisionPacketRouter.ts with 'work_assignment' for inter-division handoff. Index.ts re-exported new symbols via existing wildcard exports.

T02 built missionRouter.ts implementing routeApprovedMission(callerDivision, mission). The function strictly requires caller === 'Div1.HCO' — not just ownerBoundary authorization, because Div7.MissionControl is authorized to cross all boundaries and must not route missions on Div1's behalf. It filters mission.requested_divisions to exclude Div1.HCO and Div7.MissionControl, emits work_assignment DivisionPackets to each activated division via divisionPacketRouter.ts, emits a status_update packet to Div7.MissionControl with routing summary, derives canonical routing_rule labels from bos-company-template.json division combinations, and returns MissionRoutingState. Non-Div1 callers receive MissionRouterUnauthorized with descriptive reason. Exported from index.ts.

T03 added 24 exhaustive vitest tests in tests/missionRouter.test.ts covering: all 7 Division values as caller (only Div1.HCO authorized), correct work_assignment packets emitted to requested divisions excluding Div1/Div7, Div7 receives status_update not work_assignment, unauthorized callers receive typed MissionRouterUnauthorized with descriptive reason, empty requested_divisions edge case, routing rule derivation for various division combinations, explicit exclusion of Div1.HCO from work targets even when requested, packet router state isolation via clearPacketRouter beforeEach, preservation of requested_divisions order in activated_divisions, and schema_version presence on returned state.

All TypeScript compiles with zero errors. Full test suite: 346/346 tests pass across 25 test files.

## Verification

TypeScript typecheck: `cd plugin-bos-light && npm run typecheck` passes with zero errors (verified 2026-06-01T12:55). Mission router tests: `cd plugin-bos-light && npx vitest run tests/missionRouter.test.ts` passes 24/24 tests in ~414ms (verified 2026-06-01T12:55). Full regression suite: `cd plugin-bos-light && npx vitest run` passes 346/346 tests across 25 test files in ~1.84s (verified 2026-06-01T12:55). No live Paperclip runtime claims made.

## Requirements Advanced

None.

## Requirements Validated

None.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Operational Readiness

None.

## Deviations

Task plan T03 specified testing 'mission transitions to IN_PROGRESS routing state' but missionRouter.ts returns status 'ROUTED' by design. Tests verify actual ROUTED behavior.

## Known Limitations

None.

## Follow-ups

None.

## Files Created/Modified

- `plugin-bos-light/src/contracts.ts` — Added RoutingDecisionPacket, MissionRoutingState, MissionRouterUnauthorized types
- `plugin-bos-light/src/divisionPacketRouter.ts` — Extended DivisionPacketType with 'work_assignment'
- `plugin-bos-light/src/index.ts` — Re-exported new symbols via wildcard exports (no changes required)
- `plugin-bos-light/src/missionRouter.ts` — Created routeApprovedMission with strict caller enforcement, packet emission, routing rule derivation
- `plugin-bos-light/tests/missionRouter.test.ts` — 24 exhaustive contract tests covering authorization, packet emission, edge cases, state isolation
