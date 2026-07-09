---
id: T04
parent: S08
milestone: M006
key_files:
  - plugin-bos-light/tests/div5PostProductionVerification.realgit.test.ts
  - plugin-bos-light/vitest.config.ts
key_decisions:
  - Used pool: forks in vitest config to isolate mock-heavy test files from real-git test files, preventing vi.mock leakage
  - Each test runs full Div4 pipeline then seeds status_update to Div5, verifying the complete integration path
duration: 
verification_result: passed
completed_at: 2026-06-01T11:54:09.116Z
blocker_discovered: false
---

# T04: Created real-git integration tests proving full Div4 pipeline to Div5 eval gate with tamper detection and packet emission verification

**Created real-git integration tests proving full Div4 pipeline to Div5 eval gate with tamper detection and packet emission verification**

## What Happened

Created div5PostProductionVerification.realgit.test.ts with 10 real-git integration tests:

1. **Full pipeline PASS**: init temp repo → seed gate_decision → run executeProductionWork → verifyProductionWork → verdict PASS with all 7 checks passing
2. **All 7 checks pass**: individually verified branch_exists, commit_sha_matches_head, smoke_file_exists, files_changed_present, not_pushed, main_branch_unchanged, on_test_branch
3. **Tamper: smoke file deletion**: delete .bos-smoke-test.md after pipeline → verdict FAIL with smoke_file_exists failing
4. **Tamper: adding remote**: add git remote after pipeline → verdict FAIL with not_pushed failing
5. **Packet emission Div1.HCO**: status_update contains verdict, check counts, mission_id, snapshot_id
6. **Packet emission Div7.MissionControl**: status_update contains verdict and check counts
7. **main_branch_unchanged**: verifies main HEAD differs from test branch HEAD without needing originalMainSha parameter
8. **Tamper: committing on main**: checkout main and commit → on_test_branch fails
9. **commit_sha matches real HEAD**: verdict commit_sha matches actual git rev-parse output
10. **Multiple pipelines**: distinct snapshots produce distinct PASS verdicts

Also created vitest.config.ts with `pool: "forks"` to prevent vi.mock leakage between mock and real-git test files.

## Verification

TypeScript compiles with zero errors. All 542 tests pass across 33 test files including 10 new real-git integration tests. Full suite passes without regressions.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd plugin-bos-light && npx tsc --noEmit` | 0 | ✅ pass | 1500ms |
| 2 | `cd plugin-bos-light && npx vitest run tests/div5PostProductionVerification.realgit.test.ts` | 0 | ✅ pass (10 tests) | 559ms |
| 3 | `cd plugin-bos-light && npx vitest run` | 0 | ✅ pass (542 tests, 33 files) | 2620ms |

## Deviations

None

## Known Issues

None

## Files Created/Modified

- `plugin-bos-light/tests/div5PostProductionVerification.realgit.test.ts`
- `plugin-bos-light/vitest.config.ts`
