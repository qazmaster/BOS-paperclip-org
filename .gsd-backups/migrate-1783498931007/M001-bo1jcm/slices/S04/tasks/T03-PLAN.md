---
estimated_steps: 7
estimated_files: 4
skills_used: []
---

# T03: Wire worker Betting Table data and approve-batch actions

Expected executor skills: api-design, error-handling-patterns, tdd, verify-before-complete.

Why: Worker currently returns an empty Betting Table and directly optional-chains `ctx.approvals?.create`, bypassing the adapter seam.

Do: Update `plugin-bos-light/src/worker.ts` so `BOS_LIGHT_TOOLS` exposes the new helpers. Change the `betting-table` data provider to read `cycle_id` from provider context/input or `ctx.config?.current_betting_cycle_id`, call the load helper with `ctx.persistence`, and return `{ items, diagnostics }`. Change `approve-batch` to call the approval helper using `ctx.persistence` and `input.adapter ?? ctx.paperclipAdapter ?? ctx.paperclip`, not direct `ctx.approvals?.create`. Extend acceptance tests for seeded S03 `blueprint_id` -> persisted Betting Table -> data-provider hydration -> native approval request and fallback action result. Optional worker surfaces must still no-crash.

Done when tests cover fake ctx registration, data hydration, native approve-batch persistence update, adapter-unavailable fallback, and no live Paperclip claims.

Failure Modes (Q5): absent ctx.data/actions, missing cycle id, missing persistence, missing adapter, malformed input.
Load Profile (Q6): data-provider is one cache read; approve is one read, one request/fallback, one write.
Negative Tests (Q7): absent surfaces, data provider without cycle id/current config, stale issue id, adapter unavailable, persistence unavailable.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/worker.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/bettingTable.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/issueBlueprintFlow.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/paperclipAdapter.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/persistence.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/acceptance.test.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/package.json`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/worker.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/acceptance.test.ts`

## Verification

npm --prefix plugin-bos-light test && npm --prefix plugin-bos-light run typecheck

## Observability Impact

Worker data/action payloads become the inspection surface for cycle hydration, missing runtime seams, native approval creation, and fallback diagnostics.
