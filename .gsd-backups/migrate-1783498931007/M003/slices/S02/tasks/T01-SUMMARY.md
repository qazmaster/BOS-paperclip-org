---
id: T01
parent: S02
milestone: M003
key_files:
  - plugin-bos-light/src/contracts.ts
  - plugin-bos-light/src/decisionArtifact.ts
  - plugin-bos-light/tests/decisionArtifact.test.ts
key_decisions:
  - Kept `saveDecision` as cache-overlay-only and non-blocking; Paperclip document/comment/markdown artifacts remain the inspectable system-of-record surface.
  - Modeled no-approval-mutation as an explicit envelope invariant instead of interacting with the approval adapter seam.
duration: 
verification_result: passed
completed_at: 2026-05-31T03:39:27.036Z
blocker_discovered: false
---

# T01: Added a native-first DecisionResult artifact envelope with cache-overlay diagnostics and markdown-only fail-closed behavior.

**Added a native-first DecisionResult artifact envelope with cache-overlay diagnostics and markdown-only fail-closed behavior.**

## What Happened

Implemented `persistDecisionArtifact` in `plugin-bos-light/src/decisionArtifact.ts` as a pure async helper over the S01 `DecisionResult` contract. Accepted decisions preserve `decision.record_markdown` exactly, attempt `saveDecision` only as cache-overlay state, then choose Paperclip-native documents when document capability is `confirmed`/`enabled`, native comments when documents are unavailable/unvalidated and comments are not explicitly unsupported/failed, and deterministic `markdown-only://issues/{issue}/decisions/{decision}` refs when native writes cannot be used. Rejected `DecisionValidationFailure` results now fail closed to deterministic sanitized markdown without calling persistence or adapter methods.

Added the shared contract in `plugin-bos-light/src/contracts.ts`: `DecisionArtifactSurface`, capability posture/capability types, cache overlay diagnostics, fallback diagnostics, invariants, and `DecisionArtifactEnvelope` with `phase: S02.decision_artifact`, selected surface, artifact id/ref, mirrored timestamps, embedded result, and explicit `decided_by=Div7.MissionControl`, `diagnostics_sanitized=true`, and `native_approval_mutated=false` invariants.

Added `plugin-bos-light/tests/decisionArtifact.test.ts` covering confirmed document success, unvalidated-document comment fallback for COMPLICATED decisions, invalid DecisionValidationFailure markdown-only behavior, cache-overlay failure while native mirroring still proceeds, and the invariant that approval requests/state are never touched even when document/comment writes fail.

## Failure Modes
External dependencies are the optional Paperclip adapter methods (`createIssueDocument`, `addIssueComment`) and optional cache-overlay persistence (`saveDecision`). Persistence failure is caught, sanitized, bounded to 500 chars, and reported in `cache_overlay.save=failed` without blocking artifact mirroring. Document write failures/malformed document responses fall through to comments with `document_error` diagnostics. Comment write failures/malformed comment responses return markdown-only artifacts with `comment_error` diagnostics. Missing adapter methods/capability postures route to later fallback surfaces instead of throwing. Rejected decisions are treated as invalid input and never invoke external dependencies.

## Load Profile
This helper has no bulk runtime loop, network polling, filesystem work, or batching dimension. The 10x breakpoint is the caller's Paperclip/persistence write throughput; the helper performs at most one cache write, one document write attempt, and one comment write attempt per decision, so it does not add internal queueing or unbounded memory growth. Runtime protection is bounded diagnostics and immediate fallback rather than retries.

## Negative Tests
Negative coverage includes invalid `DecisionValidationFailure` inputs staying markdown-only with no adapter/persistence calls, cache persistence rejection remaining non-blocking and sanitized, and adapter document/comment rejection falling to markdown-only without calling `createApprovalRequest` or mutating approvals. These cases live in `plugin-bos-light/tests/decisionArtifact.test.ts`.

## Verification

Verified the task-required targeted decision artifact tests passed with `npm --prefix plugin-bos-light test -- tests/decisionArtifact.test.ts`. Also ran TypeScript typecheck and the full plugin test suite as regression checks; both passed.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm --prefix plugin-bos-light test -- tests/decisionArtifact.test.ts` | 0 | ✅ pass | 942ms |
| 2 | `npm --prefix plugin-bos-light run typecheck` | 0 | ✅ pass | 1810ms |
| 3 | `npm --prefix plugin-bos-light test` | 0 | ✅ pass | 1339ms |

## Deviations

Added two extra regression checks beyond the task minimum: cache-overlay failure behavior and full plugin test/typecheck verification.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/decisionArtifact.ts`
- `plugin-bos-light/tests/decisionArtifact.test.ts`
