# S07: Div4 Production on Approved Workspace — UAT

**Milestone:** M006
**Written:** 2026-06-01T11:23:13.247Z

## UAT: Div4 Production on Approved Workspace

### Preconditions
- BOS Light plugin loaded in Paperclip runtime
- Div5 has completed quarantine and emitted an approved gate_decision with local_path
- A sanitized repo snapshot exists at the local_path with a valid git repository

### Test Steps

| # | Step | Expected Outcome |
|---|------|-----------------|
| 1 | Trigger Div4.Production with an approved gate_decision containing local_path, approved_for_division="Div4.Production", and secret_scan_passed=true | Div4 creates a test branch (e.g., `bos-smoke/<snapshot_id>`), writes a harmless smoke-test file, runs git add + commit |
| 2 | Inspect the ProductionWorkEvidence output | Evidence contains: commit_sha (40-char hex), diff_hash (SHA-256), branch_created (matches test branch name), files_changed (array with smoke file), pushed: false |
| 3 | Check Div1.HCO inbox for completion_report packet | completion_report exists with snapshot_id, commit_sha, branch_created, pushed: false |
| 4 | Check Div5.QualificationsLibraryLearning inbox for status_update packet | status_update exists with snapshot_id, status="completed", ProductionWorkEvidence payload |
| 5 | Verify git log on the local_path repo | Test branch HEAD has the smoke commit; main/master branch HEAD is unchanged |
| 6 | Trigger Div4.Production with a non-Div4 caller (e.g., "Div1.HCO") | Returns Div4ProductionUnauthorized error; no git operations performed |
| 7 | Trigger Div4.Production with gate_decision missing local_path | Returns error "Missing or empty local_path"; no git operations performed |
| 8 | Trigger Div4.Production with gate_decision where approved_for_division != "Div4.Production" | Returns approval mismatch error; no git operations performed |

### Edge Cases
- Missing gate_decision in Div4 inbox: returns error, no git ops
- Empty/whitespace snapshot_id: returns error
- Git command failure during branch/commit: error event logged, no ProductionWorkEvidence emitted
- Sequential runs with same snapshot_id: distinct branches and commits created

### UAT Type
- **Contract verification** - confirms Div4.Production module enforces authorization, performs bounded local-only git work, emits structured evidence, and never pushes to remote
