---
id: T01
parent: S01
milestone: M010
key_files:
  - plugin-bos-light/dist/worker.js
  - scripts/verify-t01-worker-fix.js
key_decisions:
  - (none)
duration: 
verification_result: passed
completed_at: 2026-06-02T19:05:45.250Z
blocker_discovered: false
---

# T01: Fixed bos-route-packet targetDivision bug in dist/worker.js (snake_case to camelCase)

**Fixed bos-route-packet targetDivision bug in dist/worker.js (snake_case to camelCase)**

## What Happened

Read plugin-bos-light/dist/worker.js and confirmed line 140 defines `const targetDivision` (camelCase) while line 145 referenced `target_division` (snake_case), which would throw a ReferenceError at runtime. Changed `routed_to: target_division,` to `routed_to: targetDivision,` on line 145. Created verification script scripts/verify-t01-worker-fix.js that asserts the file does not contain `target_division` and does contain `targetDivision`. Ran verification script successfully (exit 0).

## Verification

node scripts/verify-t01-worker-fix.js exited 0, confirming worker.js no longer contains snake_case `target_division` and does contain camelCase `targetDivision`.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node scripts/verify-t01-worker-fix.js` | 0 | ✅ pass | 84ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/dist/worker.js`
- `scripts/verify-t01-worker-fix.js`
