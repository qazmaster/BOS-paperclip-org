---
id: T03
parent: S04
milestone: M001-bo1jcm
key_files:
  - plugin-bos-light/src/worker.ts
  - plugin-bos-light/tests/acceptance.test.ts
key_decisions:
  - Worker approve-batch delegates to the Paperclip adapter seam and bettingTable helper rather than directly calling ctx.approvals.
  - Worker data/action failure paths return explicit diagnostics instead of throwing for missing cycle id, persistence, or adapter seams.
duration: 
verification_result: passed
completed_at: 2026-05-28T05:07:19.552Z
blocker_discovered: false
---

# T03: Wired worker Betting Table hydration and approve-batch actions through cache-overlay persistence and the Paperclip adapter seam.

**Wired worker Betting Table hydration and approve-batch actions through cache-overlay persistence and the Paperclip adapter seam.**

## What Happened

Updated `plugin-bos-light/src/worker.ts` so `BOS_LIGHT_TOOLS` exposes the S04 betting-cycle helpers (`buildAndSaveBettingCycle`, `saveBettingCycle`, `loadBettingCycle`, and `requestBettingCycleApproval`). The `betting-table` data provider now resolves a cycle id from provider context/input or `ctx.config.current_betting_cycle_id`, loads rows with `loadBettingCycle(ctx.persistence)`, and returns `{ items, diagnostics }` including cache-overlay load status. Missing cycle ids return explicit diagnostics instead of throwing.

Changed `approve-batch` to delegate to `requestBettingCycleApproval` with `input.adapter ?? ctx.paperclipAdapter ?? ctx.paperclip` and `input.persistence ?? ctx.persistence`. It no longer calls `ctx.approvals?.create`, so native approval claims only come from the adapter seam. Missing cycle ids return a no-crash markdown-only diagnostic response; unavailable adapters fall through to the helper's explicit markdown/comment fallback diagnostics without mutating Betting Table rows.

Extended `plugin-bos-light/tests/acceptance.test.ts` with worker-level acceptance coverage for fake ctx registration, S03 seeded `blueprint_id` artifact persistence and data-provider hydration, native approve-batch persistence updates through the adapter seam, adapter-unavailable fallback diagnostics, missing-cycle/missing-persistence no-crash diagnostics, and proof that `ctx.approvals` is not invoked.

## Failure Modes (Q5)
- Optional host surfaces (`ctx.tools`, `ctx.data`, `ctx.actions`) may be absent: existing no-crash test still verifies `registerBosLightPlugin` resolves when only a logger is supplied.
- Missing cycle id: data provider and approve-batch return explicit `missing_cycle_id` diagnostics instead of attempting reads or approval creation.
- Missing persistence: data provider returns an empty row set with cache-overlay diagnostics (`persistence: "missing"`, `load: "not_attempted"`).
- Missing adapter: approve-batch delegates to the approval helper, which returns `selected_surface: "markdown-only"` with `approvals.native:unavailable` and `comments.native:unavailable` diagnostics without mutating rows.
- Stale/malformed issue ids, malformed native responses, cache read/write failures, and adapter exceptions remain covered by existing betting-cycle approval tests; the worker path now uses that same helper.

## Load Profile (Q6)
- The data provider performs one cache-overlay read per hydration (`loadBettingCycle`). At 10x provider load, the persistence/cache read seam is the first saturation point; no native Paperclip calls are made by hydration.
- approve-batch performs one cache-overlay read, one native approval request or fallback attempt, and one cache-overlay write only when native approval creation succeeds. It avoids plugin-side approval engines and boundedly updates only the selected rows returned from the persisted cycle.

## Negative Tests (Q7)
- `plugin-bos-light/tests/acceptance.test.ts` covers absent ctx surfaces, fake ctx registration, missing cycle id, missing persistence, adapter unavailable, stale/missing/already-decided selections, malformed native approval responses, cache failures, and explicit non-use of `ctx.approvals`.

## Verification

Ran the required package checks. `npm --prefix plugin-bos-light test` passed all 4 test files and 33 tests, including the new worker Betting Table cases. `npm --prefix plugin-bos-light run typecheck` completed with `tsc --noEmit` and exit code 0.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm --prefix plugin-bos-light test` | 0 | ✅ pass (4 files, 33 tests) | 1964ms |
| 2 | `npm --prefix plugin-bos-light run typecheck` | 0 | ✅ pass | 2566ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/src/worker.ts`
- `plugin-bos-light/tests/acceptance.test.ts`
