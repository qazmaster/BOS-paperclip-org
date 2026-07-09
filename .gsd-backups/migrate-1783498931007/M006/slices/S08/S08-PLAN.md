# S08: Div5 Eval Gate

**Goal:** Implement Div5 post-production verification gate that validates Div4's ProductionWorkEvidence against the local workspace, producing a PostProductionVerdict artifact with pass/fail checks.
**Demo:** Expected files exist; SHA/branch/commit verified; acceptance criteria pass/fail recorded; visible verdict artifact produced.

## Must-Haves

- PostProductionVerdict produced with all 7 checks (branch_exists, commit_sha_matches_head, smoke_file_exists, files_changed_present, not_pushed, main_branch_unchanged, on_test_branch). status_update packets emitted to Div1.HCO and Div7.MissionControl. Real-git integration tests prove full pipeline: Div6 clone → Div5 quarantine → Div4 production → Div5 eval gate. Tamper test proves Div5 catches workspace modification.

## Proof Level

- This slice proves: integration

## Integration Closure

S08 consumes status_update packets from Div4.Production (produced by S07). Verdict is visible as a typed artifact for S09 (Circuit Breaker) and S10 (E2E) to consume. Packet emissions to Div1.HCO and Div7.MissionControl close the reporting loop.

## Verification

- PostProductionVerdict is the primary diagnostic surface: each check has a pass/fail detail string. Failed checks produce actionable diagnostics (expected vs actual values). status_update to Div1.HCO enables orchestration-level visibility.

## Tasks

- [x] **T01: Contracts and Div4 local_path propagation** `est:30m`
  **Why:** S08 needs PostProductionCheck and PostProductionVerdict types in contracts.ts. Div4's status_update to Div5 currently lacks local_path, which S08 needs to locate the workspace. Adding local_path to the status_update payload is a one-line change that closes this gap.
  - Files: `plugin-bos-light/src/contracts.ts`, `plugin-bos-light/src/div4Production.ts`, `plugin-bos-light/tests/div4Production.test.ts`
  - Verify: cd plugin-bos-light && npx tsc --noEmit && npx vitest run tests/div4Production.test.ts

- [x] **T02: Core post-production verification module** `est:1h`
  **Why:** This is the heart of S08 — a Div5-only function that reads status_update packets from Div5's inbox, extracts ProductionWorkEvidence fields (commit_sha, branch_created, snapshot_id, mission_id), locates the workspace via local_path, and runs 7 acceptance checks against the local git repo.
  - Files: `plugin-bos-light/src/div5PostProductionVerification.ts`, `plugin-bos-light/src/index.ts`
  - Verify: cd plugin-bos-light && npx tsc --noEmit

- [x] **T03: Mock-based verification tests** `est:1h`
  **Why:** Comprehensive mock-based test coverage for the verification module. Covers authorization rejection, missing inbox packets, missing local_path, all 7 checks pass/fail, packet emission, and edge cases.
  - Files: `plugin-bos-light/tests/div5PostProductionVerification.test.ts`
  - Verify: cd plugin-bos-light && npx vitest run tests/div5PostProductionVerification.test.ts

- [x] **T04: Real-git integration tests and full regression** `est:1h`
  **Why:** Proves the full pipeline works end-to-end with real git operations: init repo → seed gate_decision → run Div4 production → run Div5 eval gate. Also proves tamper detection: modifying the workspace after Div4 causes Div5 to catch it.
  - Files: `plugin-bos-light/tests/div5PostProductionVerification.realgit.test.ts`
  - Verify: cd plugin-bos-light && npx vitest run

## Files Likely Touched

- plugin-bos-light/src/contracts.ts
- plugin-bos-light/src/div4Production.ts
- plugin-bos-light/tests/div4Production.test.ts
- plugin-bos-light/src/div5PostProductionVerification.ts
- plugin-bos-light/src/index.ts
- plugin-bos-light/tests/div5PostProductionVerification.test.ts
- plugin-bos-light/tests/div5PostProductionVerification.realgit.test.ts
