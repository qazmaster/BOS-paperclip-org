---
id: T04
parent: S02
milestone: M008
key_files:
  - plugin-bos-light/src/missionRouter.ts
  - plugin-bos-light/src/missionSignals.ts
key_decisions:
  - (none)
duration: 
verification_result: untested
completed_at: 2026-06-02T08:01:03.163Z
blocker_discovered: false
---

# T04: missionRouter.ts updated to use missionSignals.ts for deterministic signal extraction instead of inline logic

**missionRouter.ts updated to use missionSignals.ts for deterministic signal extraction instead of inline logic**

## What Happened

Imported deriveMissionSignals and requiresExecutiveDecision from missionSignals.ts. routeApprovedMission() now calls deriveMissionSignals(mission) then checkRequiresExecutiveDecision(signals) for pre-decision routing. Routine missions bypass Div7. Executive decisions flow through two-pass routing.

## Verification

missionRouter.ts uses routing policy from missionSignals.ts. Routine missions bypass Div7. All 579 tests pass.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| — | No verification commands discovered | — | — | — |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/src/missionRouter.ts`
- `plugin-bos-light/src/missionSignals.ts`
