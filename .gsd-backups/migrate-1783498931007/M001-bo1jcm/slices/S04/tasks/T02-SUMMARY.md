---
id: T02
parent: S04
milestone: M001-bo1jcm
key_files:
  - plugin-bos-light/src/bettingTable.ts
  - plugin-bos-light/src/contracts.ts
  - plugin-bos-light/tests/acceptance.test.ts
key_decisions:
  - Approval fallbacks are diagnostic-only: only validated native approval creation mutates and saves Betting Table rows.
duration: 
verification_result: passed
completed_at: 2026-05-28T05:03:28.620Z
blocker_discovered: false
---

# T02: Added Betting Table approval request orchestration with native Paperclip approval support and diagnostic-only comment/markdown fallbacks.

**Added Betting Table approval request orchestration with native Paperclip approval support and diagnostic-only comment/markdown fallbacks.**

## What Happened

Implemented `requestBettingCycleApproval` in `plugin-bos-light/src/bettingTable.ts` and added contract-level approval envelope types in `plugin-bos-light/src/contracts.ts`. The flow loads the persisted betting cycle, validates a non-empty requested issue set, rejects stale or already-requested/decided rows, calls `createApprovalRequest(issueIds, reason)` only when the adapter seam is provided, validates the native approval id/status, marks selected rows with `markApprovalRequested` only after native creation succeeds, and saves the updated cache-overlay rows. If native approvals are missing, throw, or return malformed data, the flow attempts a single comment fallback on the first selected issue; if comments are unavailable or fail, it returns `markdown-only://betting-cycles/<cycle_id>/approval-request`. Fallback results never set native approval id/status and never mutate/persist approval row state.

## Failure Modes
- Missing cycle: handled as `selected_surface: "markdown-only"`, `fallback.reason: "missing_cycle"`, no adapter call, no save attempt.
- Empty `issue_ids`: handled as `fallback.reason: "empty_issue_ids"`, no adapter call, no save attempt.
- Stale issue id: handled as `fallback.reason: "stale_issue_id:<issue_id>"`, no adapter call, no save attempt.
- Already decided/requested row: handled as `fallback.reason: "issue_not_requestable:<issue_id>:<status>"`, no adapter call, no save attempt.
- Adapter unavailable: missing `createApprovalRequest` records `fallback.reason: "approvals.native:unavailable"` and attempts comment fallback.
- Native throw/connection loss/timeout surfaced as thrown adapter error: sanitized into `fallback.native_error`, then comment fallback is attempted.
- Malformed native response: missing approval id or invalid status becomes `fallback.reason: "native_response_malformed"`, no row mutation, no native id/status in the result.
- Comment unavailable/failure: records `comment_error` and returns markdown-only ref.
- Cache save failure after native creation: native id/status and updated rows are returned, `cache_overlay.save: "failed"`, and sanitized cache error is exposed without hiding native creation.

## Load Profile
The runtime path performs one persisted cycle read, one request/fallback operation, and at most one cache-overlay write. At 10x expected batch size the first likely saturation point is the native approval/comment adapter call payload size and Paperclip request rate; the implementation avoids per-row adapter calls by batching native approval creation and using a single fallback comment. Cache writes persist the updated cycle once after validated native creation, and validation uses in-memory maps over the loaded cycle to avoid extra reads.

## Negative Tests
`plugin-bos-light/tests/acceptance.test.ts` covers native success and persistence, native unavailable to comment fallback, native throw plus comment throw to markdown-only fallback with sanitized diagnostics, empty issue ids, stale issue id, missing cycle, already requested row, malformed native approval id, and cache save failure after native creation.

## Verification

Ran `npm --prefix plugin-bos-light test` and `npm --prefix plugin-bos-light run typecheck`. The test suite passed with 4 files and 28 tests, including 17 acceptance tests. TypeScript typecheck passed with `tsc --noEmit`.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm --prefix plugin-bos-light test` | 0 | ✅ pass | 1108ms |
| 2 | `npm --prefix plugin-bos-light run typecheck` | 0 | ✅ pass | 1164ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/src/bettingTable.ts`
- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/tests/acceptance.test.ts`
