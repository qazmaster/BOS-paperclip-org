---
estimated_steps: 27
estimated_files: 1
skills_used: []
---

# T03: Mock-based verification tests

**Why:** Comprehensive mock-based test coverage for the verification module. Covers authorization rejection, missing inbox packets, missing local_path, all 7 checks pass/fail, packet emission, and edge cases.

**Do:**
1. Create `plugin-bos-light/tests/div5PostProductionVerification.test.ts`
2. Use vi.mock('fs') and vi.mock('child_process') at module level (same pattern as div4Production.test.ts)
3. Use vi.clearAllMocks() in afterEach (not vi.restoreAllMocks())
4. Test cases:
   - Rejects all 6 non-Div5 callers with Div5PostProductionUnauthorized
   - Rejects empty snapshotId
   - Rejects when no status_update with matching snapshot_id in Div5 inbox
   - Rejects when local_path is missing from status_update payload
   - Rejects when local_path is empty
   - All 7 checks pass on clean workspace (mock git/fs responses)
   - branch_exists fails when branch not in git branch output
   - commit_sha_matches_head fails when SHA mismatch
   - smoke_file_exists fails when file missing
   - files_changed_present fails when file missing
   - not_pushed fails when git remote returns non-empty
   - on_test_branch fails when HEAD is different branch
   - overall PASS when all checks pass
   - overall FAIL when any check fails
   - Emits status_update to Div1.HCO with verdict
   - Emits status_update to Div7.MissionControl with verdict
   - Does not emit packets on auth/validation failure
   - Handles originalMainSha parameter for main_branch_unchanged check
   - Skips main_branch_unchanged when originalMainSha not provided
   - Isolates packet state between tests

**Done when:** All mock tests pass with full coverage of authorization, validation, checks, and emissions.

## Inputs

- `plugin-bos-light/src/div5PostProductionVerification.ts`
- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/divisionPacketRouter.ts`
- `plugin-bos-light/tests/div4Production.test.ts`

## Expected Output

- `plugin-bos-light/tests/div5PostProductionVerification.test.ts`

## Verification

cd plugin-bos-light && npx vitest run tests/div5PostProductionVerification.test.ts
