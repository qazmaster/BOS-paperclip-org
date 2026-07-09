# S01: Plugin Tool Testing

**Goal:** Fix the bos-route-packet bug and add unit tests for all 6 BOS Light dist/worker.js plugin tools, proving each tool produces correct output given valid inputs and handles missing params gracefully.
**Demo:** All 6 BOS Light tools tested and working

## Must-Haves

- dist/worker.js bos-route-packet references targetDivision (not target_division)\n- All 6 tools have unit tests exercising happy-path and missing-param error paths\n- Tests pass with vitest\n- Evidence artifact recorded at runtime-evidence/M010-S01-plugin-tool-test.json

## Proof Level

- This slice proves: contract

## Integration Closure

This slice only tests the plugin worker contract in isolation. No live Paperclip runtime is exercised. S02+ will test tools through Paperclip agent execution flow.

## Verification

- Run the task and slice verification checks for this slice.

## Tasks

- [x] **T01: Fix bos-route-packet targetDivision bug in dist/worker.js** `est:5m`
  ## Description
  - Files: `plugin-bos-light/dist/worker.js`, `scripts/verify-t01-worker-fix.js`
  - Verify: node scripts/verify-t01-worker-fix.js

- [x] **T02: Write unit tests for all 6 dist/worker.js plugin tools** `est:45m`
  ## Description
  - Files: `plugin-bos-light/tests/distWorkerTools.test.ts`
  - Verify: npx vitest run tests/distWorkerTools.test.ts

- [x] **T03: Record plugin tool test evidence artifact** `est:15m`
  ## Description
  - Files: `runtime-evidence/M010-S01-plugin-tool-test.json`, `scripts/verify-t03-evidence.js`
  - Verify: node scripts/verify-t03-evidence.js

## Files Likely Touched

- plugin-bos-light/dist/worker.js
- scripts/verify-t01-worker-fix.js
- plugin-bos-light/tests/distWorkerTools.test.ts
- runtime-evidence/M010-S01-plugin-tool-test.json
- scripts/verify-t03-evidence.js
