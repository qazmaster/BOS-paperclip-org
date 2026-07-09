---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T04: Implement div4Production.ts module and wire exports

Implement the Div4.Production module with executeProductionWork(callerDivision, snapshotId). Enforces strict caller auth (Div4.Production only). Reads gate_decision from Div4 inbox, validates approved_for_division, secret_scan_passed, and local_path presence. Performs local-only git ops: create test branch, write harmless smoke-test file, git add, git commit. Does NOT push. Builds ProductionWorkEvidence with diff_hash, commit_sha, pushed: false. Emits completion_report to Div1.HCO and status_update to Div5.QualificationsLibraryLearning. Wires export in index.ts. Done when: module compiles and exports are wired.

## Inputs

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/divisionPacketRouter.ts`
- `plugin-bos-light/src/gitOperations.ts`

## Expected Output

- `plugin-bos-light/src/div4Production.ts`
- `plugin-bos-light/src/index.ts`

## Verification

cd plugin-bos-light && npx tsc --noEmit

## Observability Impact

ProductionWorkEvidence provides structured commit_sha, diff_hash, branch_created, files_changed, and pushed:false as observable artifacts for downstream S08 Eval Gate evaluation.
