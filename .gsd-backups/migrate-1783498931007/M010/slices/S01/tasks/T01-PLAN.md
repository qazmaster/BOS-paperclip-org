---
estimated_steps: 12
estimated_files: 2
skills_used: []
---

# T01: Fix bos-route-packet targetDivision bug in dist/worker.js

## Description

**Why:** Line 145 of `plugin-bos-light/dist/worker.js` references `target_division` (undefined, snake_case) instead of `targetDivision` (camelCase, defined on line 140). This will throw a `ReferenceError` at runtime when `bos-route-packet` is invoked.

**Do:**
1. Read `plugin-bos-light/dist/worker.js`
2. On line 145, change `routed_to: target_division,` to `routed_to: targetDivision,`
3. Create verification script `scripts/verify-t01-worker-fix.js` that:
   - Reads `plugin-bos-light/dist/worker.js` as text
   - Uses `node:assert/strict` to assert the file does NOT contain the literal string `target_division` (snake_case)
   - Asserts the file DOES contain `targetDivision` (camelCase)
   - Calls `process.exit(1)` on assertion failure
4. Run the verify script

**Done when:** `node scripts/verify-t01-worker-fix.js` exits 0, confirming the variable name is correct.

## Inputs

- `plugin-bos-light/dist/worker.js`

## Expected Output

- `plugin-bos-light/dist/worker.js`
- `scripts/verify-t01-worker-fix.js`

## Verification

node scripts/verify-t01-worker-fix.js
