---
id: T02
parent: S03
milestone: M003
key_files:
  - plugin-bos-light/src/majorFlowDecision.ts
  - plugin-bos-light/src/contracts.ts
  - plugin-bos-light/tests/majorFlowDecision.test.ts
  - plugin-bos-light/src/decisionArtifact.ts
key_decisions:
  - Major-flow adapters remain artifact-first: they derive S01 classifier inputs, append sanitized context, and delegate to S02 persistence without mutating native approval state or promoting runtime control.
  - Free-form diagnostics are not classifier signals; they are sanitized context so incidental words or secrets cannot change domain/type classification.
duration: 
verification_result: passed
completed_at: 2026-05-31T04:17:56.475Z
blocker_discovered: false
---

# T02: Added artifact-first circuit breaker, policy exception, budget exception, and strategic choice decision adapters with fixture coverage and sanitized markdown-only fallbacks.

**Added artifact-first circuit breaker, policy exception, budget exception, and strategic choice decision adapters with fixture coverage and sanitized markdown-only fallbacks.**

## What Happened

Extended the major-flow decision adapter beyond batch approvals and Eval Gate failures to cover the remaining S03 sketch seams. `circuit_breaker_open` now accepts existing `CircuitBreakerEvidenceEnvelope` data or a minimal OPEN record input, emits S01 signals that classify as CHAOTIC/CRITICAL/expanded/SELF_HEALING, and appends context preserving Div1.HCO operational ownership while making clear that Div7.MissionControl records the decision artifact and that this adapter adds no polling, subscriptions, activity-log dependence, or escalation automation. `policy_exception` and `budget_exception` produce COMPLICATED expanded artifact-only records with policy/budget owner or constraint context, reversible next steps, and no external mutation. `strategic_choice` produces a COMPLEX HIGH-risk EXPERIMENT record with OODA context plus safe-to-fail probe and rollback text. Updated contract types for all new input variants and hardened S02 diagnostic redaction to strip flattened stack-frame fragments before fallback artifacts are persisted.

Failure Modes (Q5): External dependencies are the Paperclip document/comment adapter methods and optional BOS persistence `saveDecision`. Document write failures or malformed document responses are recorded in `fallback.document_error` and fall back to comments; comment write failures, malformed comment responses, unavailable comment methods, or unsupported comment posture return deterministic markdown-only artifacts with sanitized `fallback.comment_error`; cache-overlay save failures remain non-blocking and are exposed through `cache_overlay.save=failed` plus sanitized `cache_overlay.error`. Tests cover malformed document/comment responses, unavailable comments after a document failure, and no native approval mutation.

Load Profile (Q6): The adapter has no polling loop, event subscription, or background runtime load dimension. At 10x call volume, the first saturating resources would be Paperclip document/comment writes or cache-overlay persistence writes. Protection is bounded per-call behavior: one S01 classification, one optional cache save, at most one document attempt and one comment fallback attempt, bounded diagnostic strings, and markdown-only fallback instead of retries or runtime controller promotion.

Negative Tests (Q7): `plugin-bos-light/tests/majorFlowDecision.test.ts` covers malformed Eval Gate evidence via `EvalGateEvidenceEnvelope`, circuit breaker OPEN evidence containing raw auth-like material, policy diagnostics containing token-like material, malformed document and comment adapter responses, document rejection with unavailable comment fallback, and repeated assertions that `native_approval_mutated=false` and `createApprovalRequest` is never called.

## Verification

Ran the targeted task verification command `npm --prefix plugin-bos-light test -- tests/majorFlowDecision.test.ts` successfully: 9 tests passed. Ran `npm --prefix plugin-bos-light run typecheck` successfully after contract and sanitizer changes. Ran the full plugin suite `npm --prefix plugin-bos-light test` successfully: 12 test files and 109 tests passed.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm --prefix plugin-bos-light test -- tests/majorFlowDecision.test.ts` | 0 | ✅ pass | 1301ms |
| 2 | `npm --prefix plugin-bos-light run typecheck` | 0 | ✅ pass | 2107ms |
| 3 | `npm --prefix plugin-bos-light test` | 0 | ✅ pass | 1561ms |

## Deviations

Also updated `plugin-bos-light/src/decisionArtifact.ts` to strip flattened stack-frame fragments from S02 fallback diagnostics so the slice redaction constraint holds for adapter error paths.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/src/majorFlowDecision.ts`
- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/tests/majorFlowDecision.test.ts`
- `plugin-bos-light/src/decisionArtifact.ts`
