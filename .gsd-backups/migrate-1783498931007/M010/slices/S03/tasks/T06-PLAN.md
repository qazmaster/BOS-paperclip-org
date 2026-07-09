---
estimated_steps: 13
estimated_files: 5
skills_used: []
---

# T06: Full slice verification and test suite pass

## Why
Final verification that all S03 work integrates cleanly: the modified dist/worker.js passes all existing tests plus the new agentIntegration tests, and the evidence artifact is valid.

## Do
1. Run the full distWorkerTools test suite to confirm T01/T03 changes don't break existing tests.
2. Run the full agentIntegration test suite to confirm T02/T04 tests pass.
3. Run the evidence verification script from T05.
4. Run typecheck if available (tsc --noEmit or similar).
5. If any test fails, fix the issue before claiming slice completion.

## Done-when
- All distWorkerTools tests pass
- All agentIntegration tests pass
- Evidence verification script passes
- No regressions in existing test suites

## Inputs

- `plugin-bos-light/dist/worker.js`
- `plugin-bos-light/tests/distWorkerTools.test.ts`
- `plugin-bos-light/tests/agentIntegration.test.ts`
- `scripts/verify-s03-agent-visibility.js`
- `runtime-evidence/M010-S03-agent-integration.json`

## Expected Output

- Update the implementation and proof artifacts needed for this task.

## Verification

cd plugin-bos-light && npx vitest run tests/distWorkerTools.test.ts tests/agentIntegration.test.ts
