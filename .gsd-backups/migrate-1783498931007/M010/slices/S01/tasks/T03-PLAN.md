---
estimated_steps: 30
estimated_files: 2
skills_used: []
---

# T03: Record plugin tool test evidence artifact

## Description

**Why:** The slice demo requires an evidence artifact recording per-tool test results. This provides auditable proof that all 6 tools are tested and working.

**Do:**
1. Run the T02 test suite and capture results
2. Create `runtime-evidence/M010-S01-plugin-tool-test.json` with structure:
   ```
   {
     "milestone": "M010",
     "slice": "S01",
     "tools_tested": 6,
     "tool_results": [
       { "name": "bos-bpi-score", "verdict": "pass", "tests": N },
       { "name": "bos-blueprint-gen", "verdict": "pass", "tests": N },
       { "name": "bos-eval-gate", "verdict": "pass", "tests": N },
       { "name": "bos-circuit-breaker", "verdict": "pass", "tests": N },
       { "name": "bos-decide", "verdict": "pass", "tests": N },
       { "name": "bos-route-packet", "verdict": "pass", "tests": N }
     ],
     "overall_verdict": "pass",
     "timestamp": "ISO-8601"
   }
   ```
3. Create verification script `scripts/verify-t03-evidence.js` that:
   - Reads and parses `runtime-evidence/M010-S01-plugin-tool-test.json`
   - Uses `node:assert/strict` to assert `tools_tested === 6`
   - Asserts `overall_verdict === "pass"`
   - Asserts `tool_results` is an array of length 6
   - Calls `process.exit(1)` on assertion failure
4. Run the verify script

**Done when:** `node scripts/verify-t03-evidence.js` exits 0 and evidence artifact exists.

## Inputs

- `plugin-bos-light/dist/worker.js`
- `plugin-bos-light/tests/distWorkerTools.test.ts`

## Expected Output

- `runtime-evidence/M010-S01-plugin-tool-test.json`
- `scripts/verify-t03-evidence.js`

## Verification

node scripts/verify-t03-evidence.js
