---
estimated_steps: 1
estimated_files: 6
skills_used: []
---

# T04: Full regression — typecheck and complete test suite

Run the complete verification suite to confirm zero TypeScript compilation errors and all unit tests passing. Target: maintain all 386+ existing tests from prior slices plus 25+ new tests added in S05, with zero typecheck errors.

## Inputs

- `plugin-bos-light/src/div6ExternalGateway.ts`
- `plugin-bos-light/tests/div6ExternalGateway.test.ts`
- `plugin-bos-light/src/gitOperations.ts`
- `plugin-bos-light/tests/gitOperations.test.ts`
- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/index.ts`

## Expected Output

- Update the implementation and proof artifacts needed for this task.

## Verification

cd plugin-bos-light && npx tsc --noEmit && npx vitest run
