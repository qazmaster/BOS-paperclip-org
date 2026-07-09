# S07: Div4 Production on Approved Workspace

**Goal:** Implement Div4.Production module that receives an approved SanitizedRepoSnapshot via gate_decision packets from Div5, performs bounded local-only git work (test-branch creation, harmless file edit, commit), and emits structured ProductionWorkEvidence. Enforces: no main-branch push, no production deployment, no raw external IO.
**Demo:** Harmless file change in test branch only; no main branch push; no production deployment; no raw external IO.

## Must-Haves

- Div4.Production module receives approved SanitizedRepoSnapshot via gate_decision, performs bounded local-only git work (test branch, harmless file edit, add, commit, no push), and emits structured ProductionWorkEvidence. All existing tests continue to pass. TypeScript compilation has zero errors.

## Proof Level

- This slice proves: contract

## Integration Closure

Upstream surfaces consumed: SanitizedRepoSnapshot and gate_decision from Div5. New wiring: div4Production.ts export in index.ts. Remaining before milestone E2E: S08 Eval Gate must evaluate ProductionWorkEvidence; S09 Circuit Breaker negative test; S10 full autonomous mission.

## Verification

- ProductionWorkEvidence is the primary observable artifact: commit_sha, diff_hash, branch_created, files_changed, pushed:false. Packet emissions to Div1.HCO (completion_report) and Div5 (status_update) provide routing observability.

## Tasks

- [x] **T01: Extend contracts with local_path and Div4 types** `est:20m`
  Add backward-compatible optional local_path fields to ExternalGitEvidence and SanitizedRepoSnapshot so the approved workspace path can propagate from Div6 → Div5 → Div4. Add Div4ProductionUnauthorized and ProductionWorkEvidence contract types to contracts.ts. These are purely additive; no existing S05/S06 test assertions need to change. Done when: contracts.ts compiles and includes the new optional fields and Div4 types.
  - Files: `plugin-bos-light/src/contracts.ts`
  - Verify: cd plugin-bos-light && npx tsc --noEmit

- [x] **T02: Extend Div6 to persist local_path in evidence** `est:15m`
  Update div6ExternalGateway.ts so that ExternalGitEvidence includes the optional local_path field when the operation is clone or when localPath is explicitly provided. The field is written into the evidence object before emission to Div5. Done when: Div6 evidence carries local_path on clone operations and all existing Div6 tests still pass.
  - Files: `plugin-bos-light/src/div6ExternalGateway.ts`
  - Verify: cd plugin-bos-light && npx vitest run tests/div6ExternalGateway.test.ts

- [x] **T03: Extend Div5 to propagate local_path through snapshot and gate_decision** `est:20m`
  Update div5Quarantine.ts so that SanitizedRepoSnapshot copies local_path from ExternalGitEvidence when present, and the gate_decision payload forwarded to Div4.Production includes local_path from the snapshot. This closes the handoff gap discovered in S07 research. Done when: Div5 snapshot and gate_decision include local_path and all existing Div5 tests still pass.
  - Files: `plugin-bos-light/src/div5Quarantine.ts`
  - Verify: cd plugin-bos-light && npx vitest run tests/div5Quarantine.test.ts

- [x] **T04: Implement div4Production.ts module and wire exports** `est:45m`
  Implement the Div4.Production module with executeProductionWork(callerDivision, snapshotId). Enforces strict caller auth (Div4.Production only). Reads gate_decision from Div4 inbox, validates approved_for_division, secret_scan_passed, and local_path presence. Performs local-only git ops: create test branch, write harmless smoke-test file, git add, git commit. Does NOT push. Builds ProductionWorkEvidence with diff_hash, commit_sha, pushed: false. Emits completion_report to Div1.HCO and status_update to Div5.QualificationsLibraryLearning. Wires export in index.ts. Done when: module compiles and exports are wired.
  - Files: `plugin-bos-light/src/div4Production.ts`, `plugin-bos-light/src/index.ts`
  - Verify: cd plugin-bos-light && npx tsc --noEmit

- [x] **T05: Div4 tests and full regression** `est:50m`
  Write comprehensive tests for div4Production.ts covering: caller auth rejection across all 6 non-Div4 divisions, missing gate_decision in inbox, missing local_path in snapshot, approved_for_division mismatch, successful test-branch creation / file write / add / commit with real git in a temp directory, pushed:false in evidence, packet emission to Div1.HCO and Div5, diff_hash and commit_sha populated. Use real git + fs.mkdtempSync with cleanup in afterEach. Run full vitest regression to confirm zero S05/S06 regressions. Done when: all tests pass (455+ existing + new).
  - Files: `plugin-bos-light/tests/div4Production.test.ts`, `plugin-bos-light/src/index.ts`
  - Verify: cd plugin-bos-light && npx vitest run

## Files Likely Touched

- plugin-bos-light/src/contracts.ts
- plugin-bos-light/src/div6ExternalGateway.ts
- plugin-bos-light/src/div5Quarantine.ts
- plugin-bos-light/src/div4Production.ts
- plugin-bos-light/src/index.ts
- plugin-bos-light/tests/div4Production.test.ts
