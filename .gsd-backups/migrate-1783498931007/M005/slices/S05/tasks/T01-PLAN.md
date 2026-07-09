---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T01: Create Div7 mission intake + HITL gate TypeScript module

Why: Every mission must start with Div7 framing and explicit human approval before any division executes work. Do: Create plugin-bos-light/src/missionIntake.ts with MissionIntake class. Implement frameMission(vagueGoal: string) → structured mission envelope (id, title, description, business_goal, risk_level, requested_divisions). Implement requestHumanApproval(mission) → creates Paperclip artifact (comment/document) with approval options (approve / reject / request_clarification). Implement awaitHumanApproval(missionId, timeoutMs) → polls for response or returns timeout-blocker. Implement onApproval(mission) → emits mission_approved event with full envelope. Implement onRejection(mission) → emits mission_rejected with reason. Create missionIntake.test.ts with vitest covering: mission framing, approval artifact creation, timeout handling, rejection path. Done when: unit tests pass.

## Inputs

- `plugin-bos-light/src/paperclipAdapter.ts`
- `plugin-bos-light/src/hybridPersistence.ts`

## Expected Output

- `plugin-bos-light/src/missionIntake.ts`
- `plugin-bos-light/tests/missionIntake.test.ts`

## Verification

cd plugin-bos-light && npx vitest run tests/missionIntake.test.ts
