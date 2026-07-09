---
id: T01
parent: S03
milestone: M003
key_files:
  - plugin-bos-light/src/majorFlowDecision.ts
  - plugin-bos-light/src/contracts.ts
  - plugin-bos-light/src/index.ts
  - plugin-bos-light/tests/majorFlowDecision.test.ts
key_decisions:
  - Major-flow decision integration is adapter-only: derive S01 decision inputs, append sanitized context, and delegate to S02 artifact persistence without native approval mutation or new runtime registration.
duration: 
verification_result: passed
completed_at: 2026-05-31T04:09:34.277Z
blocker_discovered: false
---

# T01: Added an adapter-only major-flow decision artifact path for batch approvals and Eval Gate failures, with fixture coverage proving S01/S02 contract reuse and no approval-state mutation.

**Added an adapter-only major-flow decision artifact path for batch approvals and Eval Gate failures, with fixture coverage proving S01/S02 contract reuse and no approval-state mutation.**

## What Happened

Implemented `plugin-bos-light/src/majorFlowDecision.ts` with a small discriminated major-flow input contract and `persistMajorFlowDecisionArtifact`. The helper derives S01 `decide` inputs for `batch_approval` and `eval_gate_failure`, appends sanitized major-flow context to accepted decision markdown, then delegates artifact writing to S02 `persistDecisionArtifact` with the caller-provided `adapter`, `persistence`, `capabilities`, and `now` options.

Updated `plugin-bos-light/src/contracts.ts` with batch and Eval Gate major-flow input types, and exported the new module from `plugin-bos-light/src/index.ts`. The implementation deliberately avoids plugin UI, action registration, Hermes, GSD-Pi, host registration, activity events, native approval creation, and Betting Table approval mutation.

Added `plugin-bos-light/tests/majorFlowDecision.test.ts` covering: batch approval as a compact CLEAR LOW-risk `BATCH_APPROVAL` artifact on the documents surface; blocking Eval Gate failure as an expanded non-LOW Div7.MissionControl decision artifact on the comments fallback surface; and an existing `EvalGateEvidenceEnvelope` with an incomplete run producing an expanded markdown-only decision artifact.

## Failure Modes
External dependencies are the Paperclip adapter document/comment methods and the BOS persistence saveDecision method delegated through S02. The implementation relies on `persistDecisionArtifact` to handle document write failures, malformed document responses, comment write failures, malformed comment responses, missing/unsupported capabilities, and cache-overlay save failures with inspectable `fallback`, `document_error`, `comment_error`, and `cache_overlay.error` fields. Tests exercise successful document writes, document-unsupported-to-comment fallback, and comments-unsupported-to-markdown-only fallback through the major-flow helper.

## Load Profile
The helper has no new network loop, polling, queue, pagination, or background runtime. The first resource that would saturate at 10x is the existing S02 artifact write path because each major-flow decision performs one decision cache save and at most one document attempt plus one comment fallback attempt. Protection is inherited from S02 capability gating and bounded fallback behavior; the adapter itself performs O(number of selected issues + number of eval gates) in-memory transformation and does not create native approval requests.

## Negative Tests
Negative and boundary coverage is in `plugin-bos-light/tests/majorFlowDecision.test.ts`: the batch case asserts `createApprovalRequest` is never called and Betting Table rows remain `CANDIDATE` with null native approval fields; the blocking Eval Gate case includes raw token/authorization/stack-like evidence and asserts the serialized artifact omits those values; the incomplete Eval Gate evidence case asserts unsupported comments produce markdown-only fallback while still accepting an expanded non-LOW decision. Existing S02 tests continue to cover malformed document/comment responses and cache failures.

## Verification

Ran the required targeted fixture test with `npm --prefix plugin-bos-light test -- tests/majorFlowDecision.test.ts`; it passed with 3 tests. Also ran `npm --prefix plugin-bos-light run typecheck`; it passed after resolving a test-only spy typing issue and an export name collision.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm --prefix plugin-bos-light test -- tests/majorFlowDecision.test.ts` | 0 | ✅ pass | 969ms |
| 2 | `npm --prefix plugin-bos-light run typecheck` | 0 | ✅ pass | 1568ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/src/majorFlowDecision.ts`
- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/index.ts`
- `plugin-bos-light/tests/majorFlowDecision.test.ts`
