---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T02: Create branch policy + HITL runtime gates TypeScript module

Why: S04 git operations need branch policy enforcement and explicit human approval gates for resource grants, batch approval, and production deploy. Do: Create plugin-bos-light/src/hitlGovernance.ts with HITLGovernance class. Implement enforceBranchPolicy(operation: GitOperation) → rejects direct main/master push, enforces feature-branch naming (feature/bos-{mission_id}), blocks non-fast-forward, records blocked attempt with reason. Implement requestResourceGrant(missionId, resources[]) → creates Paperclip artifact requesting human approval for each resource (token budget, repo access, API key). Implement requestBatchApproval(missionId, batchItems[]) → creates artifact for human approval of betting table batch. Implement requestProductionDeploy(missionId, deployConfig) → creates artifact for human approval of deploy/CI trigger. Implement awaitGateDecision(gateId, timeoutMs) → polls or returns timeout. Create hitlGovernance.test.ts covering: branch policy blocks, resource grant artifact, batch approval artifact, deploy gate artifact, timeout handling. Done when: unit tests pass.

## Inputs

- `plugin-bos-light/src/gitOperations.ts`
- `plugin-bos-light/src/paperclipAdapter.ts`
- `plugin-bos-light/src/hybridPersistence.ts`

## Expected Output

- `plugin-bos-light/src/hitlGovernance.ts`
- `plugin-bos-light/tests/hitlGovernance.test.ts`

## Verification

cd plugin-bos-light && npx vitest run tests/hitlGovernance.test.ts
