---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T05: Export wiring and full regression

Add export * from './div5Quarantine' to plugin-bos-light/src/index.ts so downstream slices (S07 Div4 Production) can import quarantine types and verifyAndQuarantine. Run TypeScript compilation and full vitest regression scoped to plugin-bos-light to confirm zero type errors and zero test failures across the expanded suite.

## Inputs

- `plugin-bos-light/src/index.ts`
- `plugin-bos-light/src/div5Quarantine.ts`
- `plugin-bos-light/tests/div5Quarantine.test.ts`

## Expected Output

- `plugin-bos-light/src/index.ts`

## Verification

npx tsc --noEmit && npx vitest run plugin-bos-light/
