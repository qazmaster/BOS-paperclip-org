---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T05: Div4 tests and full regression

Write comprehensive tests for div4Production.ts covering: caller auth rejection across all 6 non-Div4 divisions, missing gate_decision in inbox, missing local_path in snapshot, approved_for_division mismatch, successful test-branch creation / file write / add / commit with real git in a temp directory, pushed:false in evidence, packet emission to Div1.HCO and Div5, diff_hash and commit_sha populated. Use real git + fs.mkdtempSync with cleanup in afterEach. Run full vitest regression to confirm zero S05/S06 regressions. Done when: all tests pass (455+ existing + new).

## Inputs

- `plugin-bos-light/src/div4Production.ts`
- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/divisionPacketRouter.ts`
- `plugin-bos-light/src/gitOperations.ts`

## Expected Output

- `plugin-bos-light/tests/div4Production.test.ts`

## Verification

cd plugin-bos-light && npx vitest run
