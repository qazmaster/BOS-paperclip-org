---
id: T03
parent: S03
milestone: M003
key_files:
  - docs/04_DATA_CONTRACTS.md
  - docs/08_RUNTIME_CAPABILITY_HEALTH.md
  - plugin-bos-light/tests/majorFlowDecision.test.ts
  - plugin-bos-light/src/index.ts
key_decisions:
  - No runtime capability promotion was made for S03; the helper remains fixture/integration proof over S01/S02 artifacts until separate live readback evidence exists.
  - The existing public index export was preserved and verified through tests rather than duplicated.
duration: 
verification_result: passed
completed_at: 2026-05-31T04:22:34.794Z
blocker_discovered: false
---

# T03: Documented and public-export-verified the S03 major-flow decision artifact helper without promoting unsupported runtime or approval surfaces.

**Documented and public-export-verified the S03 major-flow decision artifact helper without promoting unsupported runtime or approval surfaces.**

## What Happened

Updated the public S03 contract documentation so `persistMajorFlowDecisionArtifact` is discoverable as an adapter-only helper that maps major-flow inputs onto the S01 `DecisionResult` contract and delegates persistence to the S02 `DecisionArtifactEnvelope`. The docs now enumerate batch approval, Eval Gate failure, Circuit Breaker OPEN, policy exception, budget exception, and strategic choice variants; name the S02 inspection fields future agents should use; describe R003/R008/R009/R010/R015 impact; and carry S04 handoff notes for live readback, fail-closed blocker evidence, and no approval substitution.

`plugin-bos-light/src/index.ts` already exported `./majorFlowDecision`; instead of adding a duplicate export, the major-flow fixture test now imports `persistMajorFlowDecisionArtifact` and the exported `MajorFlowDecisionArtifactInput` type through `../src`, proving the helper and type are reachable through the public index surface under typecheck.

Updated the runtime capability health report to state that M003 S03 is fixture/integration proof only over document adapters, comment adapters, and deterministic markdown fallback. The wording explicitly avoids claims for plugin UI, host actions, host piko registration, Paperclip-native approvals, Hermes, GSD-Pi, activity logs, events, and live document/comment readback for the helper.

## Failure Modes

- Paperclip document/comment dependencies: S03 delegates to S02, which returns sanitized `fallback.document_error`/`fallback.comment_error` and deterministic `markdown-only` artifacts for write failures, malformed responses, unavailable adapter methods, or unsupported comments. Verified by targeted major-flow and decision-artifact tests.
- Cache persistence dependency: cache overlay save failure remains non-blocking and reports sanitized `cache_overlay.error`; artifact mirroring still proceeds. Verified by decision-artifact tests and documented as diagnostic-only.
- Malformed major-flow inputs and upstream evidence: invalid decision inputs fail closed through S01/S02 validation diagnostics; Eval Gate and Circuit Breaker evidence tests cover invalid or incomplete inputs without native writes.
- Filesystem/subprocess verification dependency: documentation and validator are filesystem-backed; verification commands completed successfully. If future filesystem reads fail, `validate_runtime_capabilities.py` reports missing/unreadable files rather than silently passing.

## Load Profile

The task is documentation plus a public export test, so it adds no new runtime loop. The documented helper performs at most one S01 classification, one optional cache save, one preferred document write, and one comment fallback attempt per major-flow artifact. At 10x expected artifact volume, the first saturating resource would be the Paperclip document/comment write surface, not local classification; the protection is bounded markdown generation, deterministic markdown-only fallback, cache-overlay-only diagnostics, and no polling, events, activity-log dependency, or native approval mutation.

## Negative Tests

- `plugin-bos-light/tests/majorFlowDecision.test.ts`: covers malformed document/comment responses, document write failure with comments unavailable, secret redaction, unsupported comments, Eval Gate evidence envelope input, Circuit Breaker OPEN evidence, and no native approval mutation.
- `plugin-bos-light/tests/decisionArtifact.test.ts`: covers invalid `DecisionValidationFailure`, document/comment write failures, malformed native responses, unsupported comments, cache save failures, bounded sanitized diagnostics, and approval-state non-mutation.
- `plugin-bos-light/tests/evalGateEvidence.test.ts`: covers empty issue ids, missing required gate booleans, comment write failure, malformed comment response, incomplete runs, and blocking failure guidance.
- `plugin-bos-light/tests/circuitBreakerFlow.test.ts`: covers invalid issue ids, cache get/save failure, malformed cache records, failed escalation issue creation, failed comment fallback, markdown-only escalation, and activity logging failure remaining diagnostic only.

## Observability Impact

The docs now point operators and future agents to envelope-level inspection fields: `selected_surface`, `artifact_ref`, `fallback.reason`, `document_error`, `comment_error`, `cache_overlay.save`, `cache_overlay.error`, `decision.diagnostics`, and `invariants`. Runtime capability health preserves the distinction between fixture-level decision artifacts and unvalidated live/plugin/runtime surfaces.

## Verification

Ran the required targeted fixture set, TypeScript typecheck, full plugin test suite, and runtime capability validator. All commands passed. The targeted suite verified major-flow, decision artifact, Eval Gate evidence, and Circuit Breaker flow behavior. Typecheck verified the public index import of the helper and exported input type. The runtime capability validator confirmed the health-report wording and matrix guardrails did not overclaim runtime support.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm --prefix plugin-bos-light test -- tests/majorFlowDecision.test.ts tests/decisionArtifact.test.ts tests/evalGateEvidence.test.ts tests/circuitBreakerFlow.test.ts` | 0 | ✅ pass | 1022ms |
| 2 | `npm --prefix plugin-bos-light run typecheck` | 0 | ✅ pass | 1586ms |
| 3 | `npm --prefix plugin-bos-light test` | 0 | ✅ pass | 1479ms |
| 4 | `python3 scripts/validate_runtime_capabilities.py` | 0 | ✅ pass | 182ms |

## Deviations

`plugin-bos-light/src/index.ts` already exported `./majorFlowDecision`; I verified the export path by changing the fixture test to import from `../src` instead of adding a duplicate export line. `scripts/validate_runtime_capabilities.py` did not require changes because the new documentation remained consistent with the existing validator guardrails.

## Known Issues

No implementation defects found. Live readback for S03 major-flow artifacts, fail-closed blocker evidence in a target runtime, and native approval proof remain documented downstream/S04 handoff work rather than completed S03 claims.

## Files Created/Modified

- `docs/04_DATA_CONTRACTS.md`
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `plugin-bos-light/tests/majorFlowDecision.test.ts`
- `plugin-bos-light/src/index.ts`
