---
id: S03
parent: M003
milestone: M003
provides:
  - Reusable `persistMajorFlowDecisionArtifact` helper exported through plugin-bos-light/src/index.ts.
  - Fixture proof that six major flow inputs produce consistent Div7.MissionControl decision artifacts through the S01/S02 contracts.
  - Fail-closed validation behavior for malformed direct major-flow inputs and unsafe issue identifiers.
  - Documentation for S04 to attempt live readback or record fail-closed blocker evidence.
requires:
  - slice: S01
    provides: DecisionResult classifier contract, Cynefin domains, risk tiers, detail levels, diagnostics, and deterministic record markdown.
  - slice: S02
    provides: DecisionArtifactEnvelope persistence path, native document/comment preference, deterministic markdown-only fallback, sanitized diagnostics, and invariants.
affects:
  - S04 live proof and capability polish
key_files:
  - plugin-bos-light/src/majorFlowDecision.ts
  - plugin-bos-light/src/decisionArtifact.ts
  - plugin-bos-light/src/contracts.ts
  - plugin-bos-light/src/index.ts
  - plugin-bos-light/tests/majorFlowDecision.test.ts
  - docs/04_DATA_CONTRACTS.md
  - docs/08_RUNTIME_CAPABILITY_HEALTH.md
key_decisions:
  - Major-flow decision integration composes S01 decide and S02 persistDecisionArtifact rather than introducing a separate governance runtime or persistence path.
  - Invalid major-flow inputs fail closed through S01 DecisionValidationFailure and S02 markdown-only envelopes.
  - Direct circuit_breaker_open inputs must include an OPEN record; missing or non-OPEN records are invalid and are not transformed into synthetic OPEN state.
  - S03 remains fixture/integration proof only and does not promote unsupported runtime, plugin, approval, Hermes, GSD-Pi, activity-log, event, or live-readback surfaces.
patterns_established:
  - Use envelope invariants and fallback/cache diagnostics as the operational inspection surface for decision artifacts.
  - Reject unsafe token-like public issue ids before they can enter artifact ids, refs, markdown, or adapter calls.
  - Treat cache persistence as diagnostic overlay only; document/comment/markdown artifact refs remain the visible recovery surface.
observability_surfaces:
  - DecisionArtifactEnvelope fields: selected_surface, artifact_ref, fallback.reason, document_error, comment_error, cache_overlay.save, cache_overlay.error, decision.diagnostics, and invariants.
  - Runtime capability guardrail: scripts/validate_runtime_capabilities.py.
  - Focused and full Vitest suites for regression signals.
drill_down_paths:
  - .gsd/milestones/M003/slices/S03/tasks/T01-SUMMARY.md
  - .gsd/milestones/M003/slices/S03/tasks/T02-SUMMARY.md
  - .gsd/milestones/M003/slices/S03/tasks/T03-SUMMARY.md
  - .gsd/milestones/M003/slices/S03/tasks/T04-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-05-31T05:05:43.617Z
blocker_discovered: false
---

# S03: Major flow decision integration

**Integrated six major BOS Light flow decisions with the S01 decision contract and S02 artifact envelope, including fail-closed input hardening and no unsupported runtime or native-approval claims.**

## What Happened

S03 added `persistMajorFlowDecisionArtifact` as an adapter-only composition seam for batch approval, Eval Gate failure, Circuit Breaker OPEN, policy exception, budget exception, and strategic choice flows. Each valid flow derives controlled S01 `decide` signals, appends bounded major-flow context to deterministic decision markdown, and delegates persistence unchanged to the S02 `DecisionArtifactEnvelope` path. The slice preserves `decided_by=Div7.MissionControl`, `diagnostics_sanitized=true`, and `native_approval_mutated=false` across accepted and rejected paths.

Batch approval stays CLEAR/LOW/compact and artifact-only; tests prove Betting Table rows are not moved to approval states and `createApprovalRequest` is never called. Eval Gate failures produce expanded COMPLICATED artifacts with run/gate context while omitting raw gate evidence. Circuit Breaker OPEN produces CHAOTIC/CRITICAL SELF_HEALING records with Div1.HCO containment language and explicit no-runtime-support wording. Policy and budget exceptions produce COMPLICATED expanded records with reversible next steps. Strategic choices produce COMPLEX/HIGH EXPERIMENT records with OODA and safe-to-fail rollback context.

Closeout review found and fixed one fail-closed hardening gap: direct `circuit_breaker_open` inputs no longer synthesize a minimal OPEN record when `record` is missing, and non-OPEN records now fail closed as invalid decision inputs. The tests now cover missing circuit records, non-OPEN circuit records, malformed direct inputs across all six variants, token-like issue id rejection, markdown/HTML injection neutralization, adapter malformed-response fallback, document failure with comments unavailable, and secret/stack redaction.

## Operational Readiness

Health signal: S03 is healthy when major-flow fixtures pass and artifacts expose the S02 inspection fields `selected_surface`, `artifact_ref`, `fallback.reason`, `fallback.document_error`, `fallback.comment_error`, `cache_overlay.save`, `cache_overlay.error`, embedded `decision.diagnostics`, and `invariants` with `decided_by=Div7.MissionControl`, `diagnostics_sanitized=true`, and `native_approval_mutated=false`.

Failure signal: alert or stop-the-line if a major-flow artifact returns unsanitized diagnostics, leaks auth/token/cookie/API-key-like material, mutates native approval state, fabricates circuit OPEN state for missing or non-OPEN records, writes documents/comments for invalid inputs, or if `python3 scripts/validate_runtime_capabilities.py` flags a runtime capability overclaim.

Recovery procedure: inspect the failed envelope fields first, preserve the deterministic markdown-only artifact as handoff evidence, correct malformed flow input or adapter capability posture, and rerun the focused major-flow tests plus runtime capability validator before retrying native document/comment mirroring. Do not promote plugin UI, host actions, Paperclip-native approvals, Hermes, GSD-Pi, activity logs, events, or live readback until a separate proof slice supplies evidence.

Monitoring gaps: S03 is fixture/integration proof only and adds no production daemon, dashboard, metric, or live Paperclip readback. S04 must attempt supported live issue/document/comment readback or record fail-closed blocker evidence for this decision artifact path.

## Verification

Fresh closeout verification used `gsd_exec` only for required checks. PASS: `npm --prefix plugin-bos-light test -- tests/majorFlowDecision.test.ts` (exit 0; 12 tests passed; exec 2f94cddd-2ad1-4805-a5da-4566107bbe13). PASS: `npm --prefix plugin-bos-light test -- tests/majorFlowDecision.test.ts tests/decisionArtifact.test.ts tests/evalGateEvidence.test.ts tests/circuitBreakerFlow.test.ts` (exit 0; 4 files/45 tests passed; exec 10ba1e8e-f99b-4083-9281-6594965ed3eb). PASS: `npm --prefix plugin-bos-light run typecheck` (exit 0; exec e02ad63a-b1fc-4df7-a9c8-65ce419e6fba). PASS: `npm --prefix plugin-bos-light test` (exit 0; 12 files/112 tests passed; exec 6f5b7a76-4f60-45c8-b80b-b6ba3f076975). PASS: `python3 scripts/validate_runtime_capabilities.py` (exit 0; runtime capability guardrails OK; exec ee94aac2-f285-45cc-b00a-254ec8991b05). Reviewer/security subagents were dispatched before closure; security re-review confirmed PASS after the circuit-breaker hardening fix.

## Requirements Advanced

- R003 — Kept Paperclip document/comment or deterministic markdown artifact surfaces as the visible decision trail while cache persistence remains diagnostic overlay only.
- R008 — Proved major-flow decision artifacts do not mutate or substitute for Paperclip-native approval state.
- R009 — Eval Gate failures now produce visible expanded risk-tiered decision artifacts with gate/run context and sanitized diagnostics.
- R010 — Circuit Breaker OPEN now produces CHAOTIC/CRITICAL self-healing decision artifacts while preserving Div1.HCO containment boundaries.
- R012 — Preserved adapter/persistence seams and sanitized diagnostics without adding direct runtime-dependent calls.
- R013 — Exercised native-first document/comment mirroring and deterministic markdown fallback through the S02 envelope.
- R014 — Applied the Div7 decision foundation to major flows without introducing a new governance runtime.
- R016 — Docs and runtime capability validation keep conservative runtime claims and unsupported surfaces out of S03.

## Requirements Validated

- R008 — majorFlowDecision fixtures assert no createApprovalRequest calls, no Betting Table approval-state mutation, and native_approval_mutated=false.
- R009 — Eval Gate fixtures pass with expanded COMPLICATED decision artifacts, gate/run context, and sanitized diagnostics.
- R010 — Circuit Breaker OPEN fixtures pass with CHAOTIC/CRITICAL SELF_HEALING artifacts and fail-closed missing/non-OPEN record tests.
- R013 — S03 quartet tests pass across majorFlowDecision, decisionArtifact, evalGateEvidence, and circuitBreakerFlow fixture surfaces.
- R016 — python3 scripts/validate_runtime_capabilities.py passed after S03 documentation updates.

## New Requirements Surfaced

- None.

## Requirements Invalidated or Re-scoped

None.

## Operational Readiness

None.

## Deviations

Closeout review surfaced one additional hardening gap after T04's task summary: direct circuit-breaker inputs could synthesize an OPEN record when `record` was missing. This was fixed before slice closure, covered with new tests, and documented as fail-closed behavior.

## Known Limitations

S03 remains fixture/integration proof only. It does not prove live Paperclip readback for this helper, plugin UI, host action/tool registration, Paperclip-native approvals, Hermes, GSD-Pi execution, activity logs, or events.

## Follow-ups

S04 should attempt supported live Paperclip issue/document/comment readback for a decision artifact or record fail-closed blocker evidence using the S02 envelope fields.

## Files Created/Modified

- `plugin-bos-light/src/majorFlowDecision.ts` — Added and hardened six major-flow decision adapters, validation, sanitization, fail-closed circuit OPEN record handling, and S01/S02 composition.
- `plugin-bos-light/src/decisionArtifact.ts` — Maintained sanitized S02 fallback diagnostics used by major-flow artifacts.
- `plugin-bos-light/src/contracts.ts` — Added major-flow decision input contracts.
- `plugin-bos-light/src/index.ts` — Exports the major-flow helper through the public package surface.
- `plugin-bos-light/tests/majorFlowDecision.test.ts` — Added fixture coverage for all six flows, fallbacks, injection/redaction, token-like ids, malformed inputs, missing circuit records, non-OPEN circuit records, and invariants.
- `docs/04_DATA_CONTRACTS.md` — Documented the S03 major-flow contract, fail-closed validation, and fixture-only capability scope.
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md` — Documented S03 as fixture/integration proof only with no unsupported runtime promotions.
