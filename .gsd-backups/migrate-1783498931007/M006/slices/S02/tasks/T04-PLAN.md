---
estimated_steps: 1
estimated_files: 3
skills_used: []
---

# T04: Boundary validation tests

Why: Boundary contracts need executable verification to prove the slice claims without relying on live Paperclip runtime. Do: Write tests/ownerBoundary.test.ts verifying non-Div7 callers are blocked and Div7 is allowed. Write tests/divisionPacketRouter.test.ts verifying packet routing, type safety, and Div7 aggregation. Write tests/executiveReport.test.ts verifying report generation from mission + packets + gates. Run all tests plus typecheck. Done when: all tests pass and TypeScript compiles with zero errors.

## Inputs

- `plugin-bos-light/src/ownerBoundary.ts`
- `plugin-bos-light/src/divisionPacketRouter.ts`
- `plugin-bos-light/src/executiveReport.ts`

## Expected Output

- `plugin-bos-light/tests/ownerBoundary.test.ts`
- `plugin-bos-light/tests/divisionPacketRouter.test.ts`
- `plugin-bos-light/tests/executiveReport.test.ts`

## Verification

cd plugin-bos-light && npx vitest run tests/ownerBoundary.test.ts tests/divisionPacketRouter.test.ts tests/executiveReport.test.ts && npx tsc --noEmit
