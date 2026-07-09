# S04: End-to-End Validation — UAT

**Milestone:** M010
**Written:** 2026-06-02T20:00:23.672Z

# UAT: S04 End-to-End Validation

## UAT Type
Integration Verification

## Preconditions
- BOS Light plugin compiled (dist/worker.js exists)
- All S01-S03 tasks completed and verified
- vitest test runner available in plugin-bos-light/

## Steps

### Step 1: Run E2E workflow test suite
**Action:** `cd plugin-bos-light && npx vitest run tests/e2eWorkflow.test.ts`
**Expected:** 37 tests pass across 5 groups (CLEAR, COMPLEX, CHAOTIC, Grant Policy, Cross-Scenario Integration)
**Evidence:** Test output shows 37 passed, 0 failed

### Step 2: Verify evidence artifact
**Action:** `node scripts/verify-s04-e2e-workflow.js`
**Expected:** Exit 0, overall_verdict=PASS, all per-scenario verdicts=PASS
**Evidence:** Output shows "Verification PASSED — all scenarios pass with valid evidence artifact"

### Step 3: Validate evidence artifact schema
**Action:** `cat plugin-bos-light/runtime-evidence/M010-S04-e2e-workflow.json`
**Expected:** JSON contains artifact, generated_at (ISO 8601), total_tests=37, passed=37, failed=0, 5 scenarios each with verdict=pass, overall_verdict=pass

### Step 4: Full regression test
**Action:** `cd plugin-bos-light && npx vitest run`
**Expected:** 1250 tests pass across 52 test files, zero failures
**Evidence:** Test output shows 1250 passed, 0 failed

### Step 5: Type checking (no new errors)
**Action:** `cd plugin-bos-light && npx tsc --noEmit`
**Expected:** Exit code 2 with pre-existing errors only (TS6142, TS7016, TS7006/T2339); zero new errors from S04

## Edge Cases
- **Cynefin domain mismatch:** Verify COMPLEX scenario uses COMPLICATED domain (not COMPLEX) — documented behavioral discovery
- **Grant deny synchronicity:** Verify createValidatedToolWrapper returns synchronously when denied (not wrapping in Promise)
- **CHAOTIC mode:** Verify CHAOTIC uses 'act' mode (not STABILIZE_FIRST)
- **Single activate() isolation:** All 3 Cynefin scenarios must exercise the full tool chain through one activate() call, not separate registrations

## Evidence Artifacts
- `plugin-bos-light/runtime-evidence/M010-S04-e2e-workflow.json` — primary evidence with per-scenario verdicts
- `plugin-bos-light/tests/e2eWorkflow.test.ts` — test source (37 tests)
- `scripts/verify-s04-e2e-workflow.js` — verification script
