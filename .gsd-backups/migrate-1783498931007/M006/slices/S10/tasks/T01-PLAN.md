---
estimated_steps: 12
estimated_files: 1
skills_used: []
---

# T01: E2E autonomous git mission integration test

Create plugin-bos-light/tests/e2eAutonomousMission.test.ts proving the full 7-division loop:

1. Create temp git repo (simulating external repo)
2. Human submits mission through Div7.MissionControl (MissionIntake.frameMission)
3. Div1.HCO routes mission to worker divisions (routeApprovedMission)
4. Verify work_assignment packets emitted to Div3, Div4, Div5, Div6
5. Simulate Div6 gateway: construct ExternalGitEvidence, emit completion_report to Div5
6. Div5 quarantine verifies and approves (verifyAndQuarantine) → gate_decision to Div4
7. Div4 production creates test branch with smoke file (executeProductionWork) → completion_report to Div1, status_update to Div5
8. Div5 post-production verification produces PASS verdict (verifyProductionWork) → status_update to Div1 and Div7
9. Div7 executive report summarizes mission (generateExecutiveReport)
10. Verify final state: branch exists, smoke file exists, verdict PASS, executive report exists

Use real git operations (temp repo). Use emitDivisionPacket for cross-division packet seeding.

## Inputs

- `plugin-bos-light/src/missionIntake.ts`
- `plugin-bos-light/src/missionRouter.ts`
- `plugin-bos-light/src/div5Quarantine.ts`
- `plugin-bos-light/src/div4Production.ts`
- `plugin-bos-light/src/div5PostProductionVerification.ts`
- `plugin-bos-light/src/executiveReport.ts`
- `plugin-bos-light/src/divisionPacketRouter.ts`
- `plugin-bos-light/src/paperclipAdapter.ts`
- `plugin-bos-light/tests/div4Production.realgit.test.ts`

## Expected Output

- `plugin-bos-light/tests/e2eAutonomousMission.test.ts`

## Verification

cd plugin-bos-light && npx vitest run tests/e2eAutonomousMission.test.ts
