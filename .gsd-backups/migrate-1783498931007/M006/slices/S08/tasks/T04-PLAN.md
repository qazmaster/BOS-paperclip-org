---
estimated_steps: 14
estimated_files: 1
skills_used: []
---

# T04: Real-git integration tests and full regression

**Why:** Proves the full pipeline works end-to-end with real git operations: init repo → seed gate_decision → run Div4 production → run Div5 eval gate. Also proves tamper detection: modifying the workspace after Div4 causes Div5 to catch it.

**Do:**
1. Create `plugin-bos-light/tests/div5PostProductionVerification.realgit.test.ts`
2. Use fs.mkdtempSync with tmpdir() for temp repo (same pattern as div4Production.realgit.test.ts)
3. Clean up with rmSync in afterEach
4. Test cases:
   - Full pipeline: init temp repo → seed gate_decision to Div4 → run executeProductionWork → seed status_update to Div5 → run verifyProductionWork → verdict PASS with all 7 checks passing
   - Verdict PASS: branch exists, commit SHA matches HEAD, smoke file exists, files changed present, no remotes, HEAD on test branch
   - Tamper test: run full pipeline, then delete .bos-smoke-test.md → verify verdict FAIL with smoke_file_exists check failing
   - Tamper test: run full pipeline, then create a remote → verify verdict FAIL with not_pushed check failing
   - Packet emission: verify status_update to Div1.HCO and Div7.MissionControl contain verdict summary
   - originalMainSha: verify main_branch_unchanged check passes when correct SHA provided
5. After creating the test file, run full vitest suite to verify zero regressions across all tests

**Done when:** All real-git integration tests pass, full vitest suite passes (target: 495 + new tests = ~520+ tests).

## Inputs

- `plugin-bos-light/src/div5PostProductionVerification.ts`
- `plugin-bos-light/src/div4Production.ts`
- `plugin-bos-light/src/divisionPacketRouter.ts`
- `plugin-bos-light/tests/div4Production.realgit.test.ts`

## Expected Output

- `plugin-bos-light/tests/div5PostProductionVerification.realgit.test.ts`

## Verification

cd plugin-bos-light && npx vitest run
