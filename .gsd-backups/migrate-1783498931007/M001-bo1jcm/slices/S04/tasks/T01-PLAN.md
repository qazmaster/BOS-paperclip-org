---
estimated_steps: 7
estimated_files: 4
skills_used: []
---

# T01: Add betting cycle persistence orchestration

Expected executor skills: tdd, api-design, verify-before-complete.

Why: S04 needs a persisted betting cycle seam without treating cache-overlay persistence as durable Paperclip truth.

Do: Extend `plugin-bos-light/src/bettingTable.ts` with build/save/load cycle helpers using optional `BOSPersistence.saveBettingTable/getBettingTable`. Preserve `blueprint_id` exactly, filter non-positive BPI through `buildBettingTable`, and return cache-overlay diagnostics (`missing|provided`, `saved|failed|not_attempted`, `loaded|missing|failed|not_attempted`, sanitized errors). Extend `plugin-bos-light/tests/acceptance.test.ts` with contract tests for ranking order, minimum top-N behavior, zero/negative exclusion, opaque native/comment/markdown-only `blueprint_id` passthrough, save/load success, missing persistence, and save/load failures.

Done when `npm --prefix plugin-bos-light test` proves persisted cycle behavior and diagnostics without live runtime claims.

Failure Modes (Q5): missing persistence and save/load exceptions are explicit diagnostics.
Load Profile (Q6): one sort plus one cache read/write per cycle.
Negative Tests (Q7): empty candidates, top_n <= 0, null blueprint_id, save failure, load failure.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/bettingTable.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/persistence.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/paperclipAdapter.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/contracts.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/acceptance.test.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/package.json`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/bettingTable.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/acceptance.test.ts`

## Verification

npm --prefix plugin-bos-light test

## Observability Impact

Adds cache-overlay diagnostics for build/save/load so future agents can distinguish missing persistence, failed cache writes, and empty cycles.
