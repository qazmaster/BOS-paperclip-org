---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T03: Exhaustive contract tests for mission router

Write ~20 vitest tests in tests/missionRouter.test.ts covering: all 7 Division values as caller (only Div1.HCO authorized), correct work_assignment packets emitted to requested divisions excluding Div1/Div7, Div7 receives status_update not work_assignment, Div1 excluded from work targets, unauthorized callers receive typed MissionRouterUnauthorized with descriptive reason, mission transitions to IN_PROGRESS routing state, empty requested_divisions edge case, routing state tracks activated/pending/completed correctly, packet router state isolation between tests. Use clearPacketRouter beforeEach. Import MissionEnvelope from missionIntake.ts for fixture construction.

## Inputs

- `plugin-bos-light/src/missionRouter.ts`
- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/divisionPacketRouter.ts`
- `plugin-bos-light/src/ownerBoundary.ts`
- `plugin-bos-light/src/missionIntake.ts`

## Expected Output

- `plugin-bos-light/tests/missionRouter.test.ts`

## Verification

cd plugin-bos-light && npx vitest run tests/missionRouter.test.ts
