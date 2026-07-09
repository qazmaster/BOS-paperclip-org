---
estimated_steps: 7
estimated_files: 4
skills_used: []
---

# T02: Implement approval request native and fallback flow

Expected executor skills: api-design, error-handling-patterns, tdd, verify-before-complete.

Why: Approve Batch must request Paperclip-owned approval when adapter support is supplied, but must not become a local approval engine.

Do: Extend `plugin-bos-light/src/bettingTable.ts` and `plugin-bos-light/src/contracts.ts` with an approval request envelope. The flow loads a persisted cycle, validates non-empty selected issue ids are present and requestable, calls `createApprovalRequest(issueIds, reason)` only when provided, validates native id/status, marks rows with `markApprovalRequested` only after native request creation, saves updated rows, and returns selected surface, native request id/status, approval request ref, updated rows, cache diagnostics, fallback diagnostics, and sanitized errors. If native approvals are unavailable/fail, attempt a comment fallback; if comments fail/unavailable, return `markdown-only://betting-cycles/<cycle_id>/approval-request`. Fallbacks must not set native approval id/status. Extend acceptance tests for native and fallback paths.

Done when tests prove native approval update/persistence and all fallback/error paths.

Failure Modes (Q5): missing cycle, stale issue id, adapter unavailable, native throw, malformed response, comment throw, cache save failure.
Load Profile (Q6): one read, one request/fallback, one write.
Negative Tests (Q7): empty issue_ids, issue not in cycle, already decided rows, malformed approval id, all adapters fail.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/bettingTable.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/contracts.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/paperclipAdapter.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/persistence.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/acceptance.test.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/package.json`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/bettingTable.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/contracts.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/acceptance.test.ts`

## Verification

npm --prefix plugin-bos-light test

## Observability Impact

Adds approval request envelopes with selected surface, native id/status when present, fallback ref, selected issues, cache-save result, timestamp, and sanitized errors.
