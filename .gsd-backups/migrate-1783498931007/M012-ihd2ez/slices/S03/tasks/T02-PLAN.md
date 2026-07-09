---
estimated_steps: 1
estimated_files: 4
skills_used: []
---

# T02: Validate Flow Against Plugin Contracts

Add targeted tests or fixtures if needed to prove the generated flow respects the existing BOS Light routing, grant, HITL, branch policy, and QA contracts. Run the plugin regression suite and typecheck. If failures appear, fix root causes without expanding M012 into plugin host registration or Hermes runtime work.

## Inputs

- `plugin-bos-light/package.json`

## Expected Output

- `plugin-bos-light/tests/m012LocalMissionFlow.test.ts`

## Verification

npm test

## Observability Impact

Test failures identify the exact contract drift between generated M012 evidence and plugin-bos-light local logic.
