---
estimated_steps: 8
estimated_files: 1
skills_used: []
---

# T03: Full Regression and Slice Evidence

Run the complete BOS Light test suite to confirm zero regressions from S04 changes. Record evidence artifact and verification.

**Why:** S04 adds new E2E tests but must not break existing tests. Full regression ensures the integrated worker remains stable.

**Steps:**
1. Run full BOS Light test suite: cd plugin-bos-light && npx vitest run
2. Verify all tests pass (exit 0)
3. Run tsc --noEmit to check for new type errors (pre-existing errors in test/fixture layer are acceptable)
4. Update runtime-evidence/M010-S04-e2e-workflow.json with regression results if needed

**Done when:** cd plugin-bos-light && npx vitest run exits 0 with all tests passing; cd plugin-bos-light && npx tsc --noEmit exits 0 or only has pre-existing errors in test/fixture layer

## Inputs

- `plugin-bos-light/tests/e2eWorkflow.test.ts`
- `scripts/verify-s04-e2e-workflow.js`
- `runtime-evidence/M010-S04-e2e-workflow.json`

## Expected Output

- `runtime-evidence/M010-S04-e2e-workflow.json`

## Verification

cd plugin-bos-light && npx vitest run

## Observability Impact

Signals added: full test suite pass/fail status, tsc --noEmit error count. How a future agent inspects this: run npx vitest run to see full suite results. Failure state exposed: failing test names, new type errors introduced by S04.
