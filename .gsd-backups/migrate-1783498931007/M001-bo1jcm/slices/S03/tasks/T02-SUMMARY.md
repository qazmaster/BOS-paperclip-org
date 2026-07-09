---
id: T02
parent: S03
milestone: M001-bo1jcm
key_files:
  - plugin-bos-light/src/issueBlueprintFlow.ts
  - plugin-bos-light/src/worker.ts
  - plugin-bos-light/tests/acceptance.test.ts
  - plugin-bos-light/src/index.ts
key_decisions:
  - Use `artifact.artifact_ref` as `status_overlay.blueprint_id` so Betting Table receives a stable surface-qualified reference while cache/overlay state remains non-durable.
  - Optional worker tool registration must return an adapter-unavailable diagnostic rather than claiming Paperclip document/comment support when no adapter seam is present.
duration: 
verification_result: passed
completed_at: 2026-05-28T04:35:16.323Z
blocker_discovered: false
---

# T02: Added a seeded issue flow that scores BPI, mirrors the Product Blueprint artifact, records cache-overlay status, and passes artifact refs into Betting Table candidates.

**Added a seeded issue flow that scores BPI, mirrors the Product Blueprint artifact, records cache-overlay status, and passes artifact refs into Betting Table candidates.**

## What Happened

# T02: Added a seeded issue flow that scores BPI, mirrors the Product Blueprint artifact, records cache-overlay status, and passes artifact refs into Betting Table candidates.

**Added a seeded issue flow that scores BPI, mirrors the Product Blueprint artifact, records cache-overlay status, and passes artifact refs into Betting Table candidates.**

## What Happened

Implemented `runSeededIssueBlueprintFlow` as the callable S03 orchestration seam. It accepts seeded issue fields, BPI inputs, a document/comment adapter, optional cache-overlay persistence, runtime capability posture, and an optional clock; it computes bounded BPI, invokes the proof-gated Product Blueprint artifact helper, builds a `BLUEPRINT_READY` status overlay, and returns `{ bpi, blueprint_markdown, artifact, status_overlay }`.

`status_overlay.blueprint_id` is populated from `artifact.artifact_ref`, so downstream Betting Table items receive a stable surface-qualified reference such as `paperclip://issues/.../documents/...` or `markdown-only://issues/.../product-blueprint` instead of a local adapter ID. Persistence remains explicitly diagnostic and cache-only: save attempts report `durability: cache-overlay-only`, whether persistence was missing/provided, per-write saved/failed/not_attempted state, and a combined non-durable error string.

Wired the helper into `BOS_LIGHT_TOOLS`, exported it from `src/index.ts`, and registered optional draft worker tool `piko:bpi-blueprint-artifact`. The worker wrapper uses optional chaining for host registration surfaces and returns an `adapter_unavailable` diagnostic if no caller-provided adapter seam exists, avoiding any implication that Paperclip host documents/comments are proven.

## Failure Modes

External dependencies for this unit are adapter document/comment writes and optional `BOSPersistence` cache-overlay writes. Document write failure falls back to comment; comment failure returns a markdown-only artifact while preserving BPI and Blueprint markdown plus `document_error`/`comment_error`. Persistence `saveBPI` and `saveStatus` failures are caught independently and returned under `status_overlay.cache_overlay` as cache-overlay failures, not durable Paperclip loss. Missing persistence is represented as `persistence: missing` with no attempted writes. Optional worker ctx `tools`, `data`, and `actions` surfaces are optional-chained and do not crash registration.

## Load Profile

Expected load is one issue per helper call. At 10x candidate volume, the first saturation point is adapter/persistence I/O, so the helper is intentionally per-issue, stateless, and does not introduce global queues, caches, or mutable batching state. S04 batching can call this helper per issue and apply its own concurrency/rate controls around the adapter seam.

## Negative Tests

`plugin-bos-light/tests/acceptance.test.ts` now covers adapter document/comment failure with successful BPI/markdown return, cache-overlay write failures, missing persistence, hard-gated BPI zero producing markdown-only diagnostics without adapter writes, fallback artifact references flowing into Betting Table candidates, and absent worker ctx tool surfaces not crashing registration.

## Observability Impact

Per-issue flow results expose selected artifact surface, fallback reason/errors, mirrored timestamp via the artifact contract, and cache-overlay write diagnostics via `status_overlay.cache_overlay`. No live runtime secrets are logged; issue content remains returned as generated markdown only.

## Verification

Ran the requested repository-level acceptance command `cd plugin-bos-light && npm test -- tests/acceptance.test.ts`; all 6 acceptance tests passed. Also ran `cd plugin-bos-light && npm run typecheck`; TypeScript completed with no errors.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd plugin-bos-light && npm test -- tests/acceptance.test.ts` | 0 | ✅ pass — 6 acceptance tests passed | 963ms |
| 2 | `cd plugin-bos-light && npm run typecheck` | 0 | ✅ pass — TypeScript noEmit completed | 1138ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/src/issueBlueprintFlow.ts`
- `plugin-bos-light/src/worker.ts`
- `plugin-bos-light/tests/acceptance.test.ts`
- `plugin-bos-light/src/index.ts`

## Verification

Ran the requested repository-level acceptance command `cd plugin-bos-light && npm test -- tests/acceptance.test.ts`; all 6 acceptance tests passed. Also ran `cd plugin-bos-light && npm run typecheck`; TypeScript completed with no errors.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm --prefix plugin-bos-light test && npm --prefix plugin-bos-light run typecheck && python3 scripts/validate_runtime_capabilities.py` | 0 | pass | 2323ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/src/issueBlueprintFlow.ts`
- `plugin-bos-light/src/worker.ts`
- `plugin-bos-light/tests/acceptance.test.ts`
- `plugin-bos-light/src/index.ts`
