---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T02: Full regression and TypeScript check

Run full test suite and TypeScript check to verify zero regressions across all 33+ test files.

## Inputs

- None specified.

## Expected Output

- Update the implementation and proof artifacts needed for this task.

## Verification

cd plugin-bos-light && npx tsc --noEmit && npx vitest run
