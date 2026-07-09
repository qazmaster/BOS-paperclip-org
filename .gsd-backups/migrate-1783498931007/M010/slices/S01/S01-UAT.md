# S01: Plugin Tool Testing — UAT

**Milestone:** M010
**Written:** 2026-06-02T19:09:54.521Z

# UAT: S01 Plugin Tool Testing

## Preconditions
- `plugin-bos-light/dist/worker.js` exists and exports 6 tool handlers: bos-bpi-score, bos-blueprint-gen, bos-eval-gate, bos-circuit-breaker, bos-decide, bos-route-packet
- `plugin-bos-light/tests/distWorkerTools.test.ts` exists with vitest test suite
- `runtime-evidence/M010-S01-plugin-tool-test.json` exists with tool test evidence

## Steps

### 1. Verify bos-route-packet uses targetDivision (camelCase)
- **Action:** Read `plugin-bos-light/dist/worker.js` and check the bos-route-packet handler
- **Expected:** Variable is assigned as `targetDivision` and referenced as `targetDivision` (not `target_division`)

### 2. Run unit test suite
- **Action:** `cd plugin-bos-light && npx vitest run tests/distWorkerTools.test.ts`
- **Expected:** 41 tests pass, 0 failures

### 3. Verify all 6 tools have test coverage
- **Action:** Check test output for 6 tool names: bos-bpi-score, bos-blueprint-gen, bos-eval-gate, bos-circuit-breaker, bos-decide, bos-route-packet
- **Expected:** All 6 tools appear in test results with multiple test cases each

### 4. Verify evidence artifact
- **Action:** `node scripts/verify-t03-evidence.js`
- **Expected:** Exit code 0, confirms tools_tested=6, overall_verdict="pass", all tool verdicts are "pass"

### 5. Verify missing-param error handling
- **Action:** Review test file for missing-param test cases on each tool
- **Expected:** Each tool has at least one test with missing required param, verifying graceful error handling (no unhandled exceptions)

## Edge Cases
- bos-route-packet with unknown packet_type falls back to Div7.MissionControl
- bos-eval-gate with unknown gate_id falls back to gate_id mapping
- bos-circuit-breaker with unknown action returns error message
- bos-bpi-score with null params uses defaults without crashing

## UAT Type
Contract verification — confirms plugin tools handle valid inputs correctly and missing params gracefully without live Paperclip runtime.
