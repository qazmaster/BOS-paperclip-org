# S08: Div5 Eval Gate — UAT

**Milestone:** M006
**Written:** 2026-06-01T11:54:42.117Z

## UAT: Div5 Post-Production Verification Gate (S08)

### Pre-conditions
- Div4 production work has completed (S07)
- Div5 inbox contains status_update from Div4 with commit_sha, branch_created, local_path, mission_id

### Test Cases

**TC1: Happy path — all checks pass**
1. Run full Div4 pipeline on a temp git repo
2. Call verifyProductionWork("Div5.QualificationsLibraryLearning", snapshotId)
3. ✅ Verdict is PASS
4. ✅ All 7 checks have passed=true
5. ✅ status_update emitted to Div1.HCO with verdict=PASS, check_count=7
6. ✅ status_update emitted to Div7.MissionControl with verdict=PASS

**TC2: Tamper — smoke file deleted**
1. Run full Div4 pipeline
2. Delete .bos-smoke-test.md from workspace
3. Call verifyProductionWork
4. ✅ Verdict is FAIL
5. ✅ smoke_file_exists check has passed=false, detail contains "not found"

**TC3: Tamper — remote added**
1. Run full Div4 pipeline
2. Add a git remote to the workspace
3. Call verifyProductionWork
4. ✅ Verdict is FAIL
5. ✅ not_pushed check has passed=false, detail contains remote name

**TC4: Tamper — commit on main**
1. Run full Div4 pipeline
2. Checkout main and make a new commit
3. Call verifyProductionWork
4. ✅ Verdict is FAIL
5. ✅ on_test_branch check has passed=false, detail contains "main"

**TC5: Authorization check**
1. Call verifyProductionWork with non-Div5 caller
2. ✅ Returns Div5PostProductionUnauthorized
3. ✅ authorized=false, required_role="Div5.QualificationsLibraryLearning"

**TC6: Missing inbox packet**
1. Call verifyProductionWork with snapshotId that doesn't exist in inbox
2. ✅ Returns Div5PostProductionUnauthorized with reason about missing status_update

**TC7: Verdict artifact structure**
1. Run successful verification
2. ✅ PostProductionVerdict has schema_version, mission_id, snapshot_id, branch_created, commit_sha, checks[], overall, evaluated_at, evaluated_by
3. ✅ Each check has check_id, passed, detail
4. ✅ Failed checks contain actionable diagnostics (expected vs actual)

