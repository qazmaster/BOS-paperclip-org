---
estimated_steps: 22
estimated_files: 2
skills_used: []
---

# T02: Core post-production verification module

**Why:** This is the heart of S08 — a Div5-only function that reads status_update packets from Div5's inbox, extracts ProductionWorkEvidence fields (commit_sha, branch_created, snapshot_id, mission_id), locates the workspace via local_path, and runs 7 acceptance checks against the local git repo.

**Do:**
1. Create `plugin-bos-light/src/div5PostProductionVerification.ts`
2. Export `verifyProductionWork(callerDivision: Division, snapshotId: string, gitOps?: GitOperations)` returning `PostProductionVerificationResult = PostProductionVerificationSuccess | Div5PostProductionUnauthorized`
3. Implement strict caller identity check (Div5.QualificationsLibraryLearning only)
4. Read status_update from Div5 inbox by snapshot_id match
5. Extract commit_sha, branch_created, mission_id from payload; get local_path from payload (added in T01)
6. Validate local_path is non-empty
7. Implement 7 synchronous verification checks using fs.existsSync and execSync:
   - branch_exists: `git branch` output contains branch_created
   - commit_sha_matches_head: `git rev-parse HEAD` on test branch matches commit_sha
   - smoke_file_exists: `.bos-smoke-test.md` exists at local_path
   - files_changed_present: all files in files_changed exist on disk
   - not_pushed: `git remote` returns empty (no remotes)
   - main_branch_unchanged: `git rev-parse main` matches original commit SHA from gate_decision (need to read from Div4's inbox or accept as parameter — use the commit_shas from the original gate_decision in Div5's own records... but Div5 doesn't store those. Alternative: accept originalMainSha as a parameter)
   - on_test_branch: `git rev-parse --abbrev-ref HEAD` matches branch_created
8. For main_branch_unchanged check: accept `originalMainSha` as an optional parameter. If not provided, skip the check with a diagnostic note. This is cleaner than reading another division's inbox.
9. Build PostProductionVerdict with all check results and overall PASS/FAIL
10. Emit status_update to Div1.HCO with verdict summary
11. Emit status_update to Div7.MissionControl with verdict summary
12. Add export to index.ts

**Done when:** Module compiles, exports are wired, function follows the same pattern as div5Quarantine.

## Inputs

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/div4Production.ts`
- `plugin-bos-light/src/div5Quarantine.ts`
- `plugin-bos-light/src/divisionPacketRouter.ts`
- `plugin-bos-light/src/gitOperations.ts`
- `plugin-bos-light/src/index.ts`

## Expected Output

- `plugin-bos-light/src/div5PostProductionVerification.ts`
- `plugin-bos-light/src/index.ts`

## Verification

cd plugin-bos-light && npx tsc --noEmit

## Observability Impact

PostProductionVerdict is the primary diagnostic surface. Each check has check_id, passed, and detail. Failed checks include expected vs actual values.
