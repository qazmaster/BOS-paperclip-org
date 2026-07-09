---
id: T02
parent: S03
milestone: M006
key_files:
  - plugin-bos-light/src/missionRouter.ts
  - plugin-bos-light/src/index.ts
  - plugin-bos-light/tests/missionRouter.test.ts
key_decisions:
  - Strict caller identity check (caller === "Div1.HCO") instead of ownerBoundary enforcement alone, because Div7.MissionControl is authorized to cross all boundaries per ownerBoundary.ts and must not be allowed to route missions on Div1's behalf.
  - Routing rule derivation maps division combinations to canonical labels from bos-company-template.json for observability and traceability.
duration: 
verification_result: passed
completed_at: 2026-06-01T07:51:55.478Z
blocker_discovered: false
---

# T02: Built missionRouter.ts with pure routing logic, work-assignment packet emission, and strict Div1.HCO caller enforcement

**Built missionRouter.ts with pure routing logic, work-assignment packet emission, and strict Div1.HCO caller enforcement**

## What Happened

Created plugin-bos-light/src/missionRouter.ts implementing routeApprovedMission(callerDivision, mission). The function strictly requires caller === "Div1.HCO" (not just ownerBoundary authorization, since Div7.MissionControl can cross boundaries). It filters mission.requested_divisions to exclude Div1.HCO and Div7.MissionControl, emits work_assignment DivisionPackets to each activated division via divisionPacketRouter.ts, emits a status_update packet to Div7.MissionControl with routing summary, and returns MissionRoutingState. For non-Div1 callers it returns MissionRouterUnauthorized. Added deriveRoutingRule() mapping activated divisions to canonical routing rule labels from bos-company-template.json, documented in comments. Exported from index.ts. Added plugin-bos-light/tests/missionRouter.test.ts with 15 tests covering authorization, exclusion, packet emission, routing rule derivation, and immutability. All 337 tests pass and typecheck is clean.

## Verification

TypeScript typecheck passes. All 337 vitest tests pass, including 15 new missionRouter tests. Verified that work_assignment packets reach target division inboxes and status_update reaches Div7.MissionControl. Verified strict rejection of non-Div1 callers including Div7.MissionControl.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd plugin-bos-light && npm run typecheck` | 0 | ✅ pass | 2300ms |
| 2 | `cd plugin-bos-light && npx vitest run tests/missionRouter.test.ts` | 0 | ✅ pass | 323ms |
| 3 | `cd plugin-bos-light && npx vitest run` | 0 | ✅ pass | 1840ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/src/missionRouter.ts`
- `plugin-bos-light/src/index.ts`
- `plugin-bos-light/tests/missionRouter.test.ts`
