---
estimated_steps: 9
estimated_files: 3
skills_used: []
---

# T01: Contracts and Div4 local_path propagation

**Why:** S08 needs PostProductionCheck and PostProductionVerdict types in contracts.ts. Div4's status_update to Div5 currently lacks local_path, which S08 needs to locate the workspace. Adding local_path to the status_update payload is a one-line change that closes this gap.

**Do:**
1. Add `PostProductionCheck` interface to contracts.ts: `{ check_id: string; passed: boolean; detail: string; }`
2. Add `PostProductionVerdict` interface to contracts.ts: `{ schema_version: '1.0'; mission_id: string; snapshot_id: string; branch_created: string; commit_sha: string; checks: PostProductionCheck[]; overall: 'PASS' | 'FAIL'; evaluated_at: string; evaluated_by: 'Div5.QualificationsLibraryLearning'; }`
3. Add `Div5PostProductionUnauthorized` interface (same pattern as Div5QuarantineUnauthorized)
4. In div4Production.ts, add `local_path` to the status_update emit payload (the emit at line ~180)
5. Update div4Production.test.ts: add assertion that status_update payload includes local_path
6. Run existing tests to confirm zero regressions

**Done when:** TypeScript compiles, all existing tests pass, status_update to Div5 includes local_path.

## Inputs

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/div4Production.ts`
- `plugin-bos-light/tests/div4Production.test.ts`

## Expected Output

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/div4Production.ts`
- `plugin-bos-light/tests/div4Production.test.ts`

## Verification

cd plugin-bos-light && npx tsc --noEmit && npx vitest run tests/div4Production.test.ts

## Observability Impact

None — contract additions and one-line payload enrichment.
