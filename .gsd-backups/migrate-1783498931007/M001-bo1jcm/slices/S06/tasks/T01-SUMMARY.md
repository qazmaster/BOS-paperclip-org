---
id: T01
parent: S06
milestone: M001-bo1jcm
key_files:
  - plugin-bos-light/src/integratedDemo.ts
  - plugin-bos-light/src/index.ts
  - plugin-bos-light/src/issueBlueprintFlow.ts
  - plugin-bos-light/tests/integratedDemo.test.ts
key_decisions:
  - Fixture adapter success exercises orchestration seams only; integrated demo reports `native_support_confirmed: false` and logs runtime gaps until live Paperclip support is separately proven.
duration: 
verification_result: passed
completed_at: 2026-05-28T06:50:35.058Z
blocker_discovered: false
---

# T01: Added a typed A3-A10 integrated fixture demo helper that composes blueprints, Betting Table, approval requests, Eval Gate evidence, and Circuit Breaker recovery with explicit runtime-gap reporting.

**Added a typed A3-A10 integrated fixture demo helper that composes blueprints, Betting Table, approval requests, Eval Gate evidence, and Circuit Breaker recovery with explicit runtime-gap reporting.**

## What Happened

Implemented `runA1ToA10FixtureDemo` in `plugin-bos-light/src/integratedDemo.ts` with a source-only default five-issue fixture seed set, upfront seed normalization/validation, in-memory BOS persistence and fixture Paperclip adapter defaults, and a report keyed by A3 through A10. The helper runs seeded Product Blueprint flows, builds and loads a Betting Table cycle, requests approval through the adapter seam, records passing and failing Eval Gate evidence, opens the Circuit Breaker after three failures, moves it half-open, and recovers it to closed.

The returned report includes timestamps, selected surfaces, artifact refs, cache-overlay diagnostics, fallback reasons, runtime capability posture, and a runtime gap ledger. The runtime posture deliberately keeps `native_support_confirmed: false` even when the fixture adapter returns document/comment/approval/escalation refs, so adapter success does not overclaim live Paperclip support.

Exported the helper from `plugin-bos-light/src/index.ts`. Added `plugin-bos-light/tests/integratedDemo.test.ts` covering the happy integrated flow, malformed native approval no-overclaim behavior, markdown-only approval fallback when native/comment paths fail, persistence/cache-overlay failures, malformed/empty seed validation, opaque blueprint_id preservation through the Betting Table, and Circuit Breaker threshold/half-open/recovery semantics. Also sanitized `issueBlueprintFlow` cache-overlay persistence errors into bounded single-line diagnostics so persistence failure reports do not preserve raw newline/tab traces.

## Verification

Ran the required targeted Vitest command for `integratedDemo.test.ts`, TypeScript typecheck, and the full plugin Vitest suite. All final verification commands passed: the targeted integrated demo suite reports 5 passing tests, typecheck reports `tsc --noEmit` success, and the full suite reports 7 files / 63 tests passing.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm --prefix plugin-bos-light test -- integratedDemo.test.ts` | 0 | ✅ pass | 853ms |
| 2 | `npm --prefix plugin-bos-light run typecheck` | 0 | ✅ pass | 1886ms |
| 3 | `npm --prefix plugin-bos-light test` | 0 | ✅ pass | 1156ms |

## Deviations

Also updated `plugin-bos-light/src/issueBlueprintFlow.ts` to sanitize cache-overlay persistence error text into bounded single-line diagnostics; this was necessary to satisfy failure-visibility expectations for the integrated report.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/src/integratedDemo.ts`
- `plugin-bos-light/src/index.ts`
- `plugin-bos-light/src/issueBlueprintFlow.ts`
- `plugin-bos-light/tests/integratedDemo.test.ts`
