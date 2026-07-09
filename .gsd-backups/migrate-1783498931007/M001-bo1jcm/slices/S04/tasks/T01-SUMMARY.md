---
id: T01
parent: S04
milestone: M001-bo1jcm
key_files:
  - plugin-bos-light/src/bettingTable.ts
  - plugin-bos-light/tests/acceptance.test.ts
key_decisions:
  - Betting cycle persistence diagnostics remain cache-overlay-only and never claim durable native Paperclip truth.
  - Load of an empty/missing cached cycle reports `load: "missing"` because the existing persistence contract returns an array rather than a nullable record.
duration: 
verification_result: passed
completed_at: 2026-05-28T04:58:34.496Z
blocker_discovered: false
---

# T01: Added betting cycle build/save/load orchestration with cache-overlay diagnostics and acceptance coverage.

**Added betting cycle build/save/load orchestration with cache-overlay diagnostics and acceptance coverage.**

## What Happened

Extended `plugin-bos-light/src/bettingTable.ts` with exported betting cycle orchestration helpers: `buildAndSaveBettingCycle`, `saveBettingCycle`, and `loadBettingCycle`. The helpers preserve the existing `buildBettingTable` ranking contract, continue to filter zero/negative BPI candidates, preserve `blueprint_id` values exactly, expose selected issue IDs, and return explicit cache-overlay diagnostics for persistence availability, save status, load status, timestamp, and sanitized errors. Persistence is treated as optional cache-overlay support only, not as durable Paperclip truth.

Failure Modes (Q5): External dependency is the optional `BOSPersistence` cache-overlay seam (`saveBettingTable` and `getBettingTable`). Missing persistence returns `persistence: "missing"` with `not_attempted` statuses. Missing optional methods on a provided persistence object return `persistence: "provided"` with `not_attempted`. Save exceptions return `save: "failed"` with sanitized error text and still return the built cycle. Load exceptions return an empty cycle plus `load: "failed"` with sanitized error text. Absent cached data returns `load: "missing"` rather than throwing.

Load Profile (Q6): Runtime work is one in-memory candidate copy/filter/sort/slice plus at most one cache-overlay write for build/save and one cache-overlay read for load. The first saturation point at 10x load is candidate sorting (`O(n log n)`) before cache I/O. Protection is bounded selection via `top_n` after filtering and exactly one cache call per cycle helper invocation; no network fan-out or per-candidate persistence calls were introduced.

Negative Tests (Q7): `plugin-bos-light/tests/acceptance.test.ts` now covers empty candidates, `top_n <= 0` minimum top-N behavior, zero/negative BPI exclusion, null `blueprint_id`, opaque native/comment/markdown-only `blueprint_id` passthrough, missing persistence, absent cached cycles, save failure, load failure, and sanitized diagnostic errors.

## Verification

Ran the required package tests with `npm --prefix plugin-bos-light test`; all 4 test files and 23 tests passed. Also ran `npm --prefix plugin-bos-light run typecheck`; TypeScript strict check passed.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm --prefix plugin-bos-light test` | 0 | ✅ pass | 1459ms |
| 2 | `npm --prefix plugin-bos-light run typecheck` | 0 | ✅ pass | 1137ms |

## Deviations

Added a TypeScript verification command beyond the required npm test command to validate exported helper types.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/src/bettingTable.ts`
- `plugin-bos-light/tests/acceptance.test.ts`
