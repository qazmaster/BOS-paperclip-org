---
id: T02
parent: S02
milestone: M003
key_files:
  - plugin-bos-light/src/decisionArtifact.ts
  - plugin-bos-light/tests/decisionArtifact.test.ts
key_decisions:
  - Kept decision artifact diagnostic sanitization local instead of importing the live Paperclip adapter sanitizer to avoid coupling artifact envelope persistence to the live adapter implementation.
duration: 
verification_result: passed
completed_at: 2026-05-31T03:44:40.967Z
blocker_discovered: false
---

# T02: Hardened decision artifact fallback diagnostics with redacted bounded errors and fixture-proven no-approval-mutation behavior.

**Hardened decision artifact fallback diagnostics with redacted bounded errors and fixture-proven no-approval-mutation behavior.**

## What Happened

Extended `persistDecisionArtifact` with a local one-line diagnostic sanitizer that bounds document/comment/cache errors, removes newlines and tabs, and redacts bearer tokens, token/API-key/session-token/cookie/password/secret material, Stripe-like keys, and JWT-like values. The comment fallback tail now reports explicit `comment_error` diagnostics when comments are missing or explicitly unsupported, so markdown-only envelopes explain both the failed document surface and the unavailable/failed comment surface. Added negative fixtures in `plugin-bos-light/tests/decisionArtifact.test.ts` for document write rejection, malformed document response, missing comment support, comment write rejection, malformed comment response, unsupported comments, and cache save failure with raw secret material.

## Failure Modes
- Paperclip document adapter dependency (`createIssueDocument`): rejection is caught as `fallback.reason: "document_write_failed"` with sanitized `document_error`; malformed/missing `document_id` is caught as `"document_response_malformed"`; both paths fall through to comments when comments are available.
- Paperclip comment adapter dependency (`addIssueComment`): rejection is caught as `"comment_write_failed"`; malformed/missing `comment_id` is caught as `"comment_response_malformed"`; missing method and unsupported/failed posture return deterministic markdown-only artifacts with sanitized `comment_error`.
- Cache overlay persistence dependency (`persistence.saveDecision`): rejection is caught as `cache_overlay.save: "failed"` with sanitized bounded `cache_overlay.error`; document/comment/markdown artifact creation still proceeds for accepted decisions.
- Approval adapter/native approval state: fallback paths never call `createApprovalRequest` and never write `native_approval_request_id`, `native_approval_status`, or Betting Table approval states.

## Load Profile
The helper has no batching loop, queue, filesystem scan, or network client of its own; at 10x decision volume the first saturating resource would be the caller-provided Paperclip adapter/persistence latency. The protection in this task is fail-closed bounded work per decision: at most one cache save attempt, one document write attempt, one comment write attempt, no retries, deterministic markdown-only fallback, and bounded diagnostic strings to prevent large error payload amplification.

## Negative Tests
- `records sanitized document write rejection and falls back to native comments` covers rejected document writes, redaction, one-line diagnostics, and comment fallback.
- `records malformed document responses and falls back to native comments` covers missing/blank `document_id` responses.
- `returns deterministic markdown-only artifacts when comments are unavailable after document failure` covers absent comment support, deterministic markdown refs, sanitized errors, and no approval mutation.
- `returns markdown-only with sanitized diagnostics when comment writes are rejected` covers comment write rejection and no approval mutation.
- `returns markdown-only with sanitized diagnostics when comment responses are malformed` covers missing/blank `comment_id` responses.
- `returns deterministic markdown-only artifacts when comment capability is explicitly unsupported` covers explicit unsupported comment posture without invoking comment writes.
- `keeps cache-overlay failure diagnostics sanitized while still mirroring accepted markdown` covers persistence failure redaction while still writing a visible document artifact.

## Observability Impact
Fallback envelopes now surface `fallback.reason`, `document_error`, `comment_error`, and `cache_overlay.error` as deterministic, bounded, redacted diagnostics so a later agent can localize the failed surface without exposing secrets or claiming unsupported native approval behavior.

## Verification

Ran the task-required targeted Vitest file, package typecheck, and full plugin test suite. The targeted decision artifact suite passed all 12 tests, TypeScript typecheck completed with exit code 0, and the full plugin suite passed 100 tests across 11 files.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm --prefix plugin-bos-light test -- tests/decisionArtifact.test.ts` | 0 | ✅ pass — 12 tests passed | 1143ms |
| 2 | `npm --prefix plugin-bos-light run typecheck` | 0 | ✅ pass — tsc --noEmit completed | 2177ms |
| 3 | `npm --prefix plugin-bos-light test` | 0 | ✅ pass — 100 tests passed across 11 files | 2973ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/src/decisionArtifact.ts`
- `plugin-bos-light/tests/decisionArtifact.test.ts`
