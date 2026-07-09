---
id: S01
parent: M003
milestone: M003
provides:
  - Stable typed piko:decide result contract for S02 artifact envelopes and S03 flow integrations.
  - Deterministic markdown rendering data for fallback artifacts.
  - Fixture proof covering Cynefin domains, risk tiers, confidence clamping, OODA detail, validation errors, and worker seam behavior.
requires:
  []
affects:
  - S02
  - S03
  - S04
key_files:
  - plugin-bos-light/tests/decision.test.ts
  - plugin-bos-light/src/contracts.ts
  - plugin-bos-light/src/decision.ts
  - plugin-bos-light/src/worker.ts
  - plugin-bos-light/tests/liveArtifactFlow.test.ts
  - docs/04_DATA_CONTRACTS.md
key_decisions:
  - D019: malformed piko:decide inputs return a discriminated accepted:false result with sanitized diagnostics instead of throwing.
  - Kept piko:decide pure and deterministic; optional worker registration delegates through runPikoDecide without claiming live host tool proof.
  - Documented S01 as contract/fixture proof only with no claims for plugin UI, actions, native approvals, Hermes, GSD-Pi, or live host registration.
patterns_established:
  - DecisionResult is the downstream stable surface: accepted decisions carry metadata and deterministic markdown; rejected inputs carry bounded sanitized diagnostics.
  - Risk tier and detail level derive from Cynefin evidence, confidence, and trigger context, with DISORDER used for truthful low-confidence mixed signals.
  - CLEAR low-risk batch approvals stay compact while policy, budget, incident, strategic, ambiguous, chaotic, and high-risk cases expand with OODA sections.
observability_surfaces:
  - Structured validation errors for invalid decision input.
  - Domain evidence, risk reasons, uncertainty reasons, record detail level, and risk tier on accepted decision results.
  - Deterministic markdown records suitable for downstream Paperclip document/comment artifacts.
  - Optional worker registration failure remains bounded by the existing optional registration seam rather than becoming a live runtime claim.
drill_down_paths:
  - .gsd/milestones/M003/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M003/slices/S01/tasks/T02-SUMMARY.md
  - .gsd/milestones/M003/slices/S01/tasks/T03-SUMMARY.md
  - .gsd/milestones/M003/slices/S01/tasks/T04-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-05-31T03:23:54.397Z
blocker_discovered: false
---

# S01: Decision contract and classifier

**Established and verified the typed piko:decide decision contract, Cynefin classifier, sanitized diagnostics, deterministic markdown records, and optional worker seam for downstream decision artifacts.**

## What Happened

S01 delivered the shared decision-result surface for major BOS Light choices before persistence or product-flow integrations depend on it. The slice added fixture-first coverage for CLEAR, COMPLICATED, COMPLEX, CHAOTIC, and DISORDER inputs, then implemented a typed DecisionResult union that preserves Div7.MissionControl ownership, clamps confidence into 0..1, selects risk tier and record detail level, exposes domain evidence and risk/uncertainty diagnostics, and returns accepted:false structured validation failures for malformed inputs rather than partial records or thrown errors. CLEAR low-risk batch approval decisions remain compact, while policy, budget, incident, strategic, ambiguous, complex, chaotic, and high-risk decisions expand with domain-dependent OODA data and fallback-ready markdown sections. The piko:decide worker path now delegates through the same pure runPikoDecide seam as direct decide calls; optional registration remains proof-limited and no live host registration, plugin UI, actions, native approvals, Hermes, GSD-Pi runtime execution, or Paperclip persistence support was promoted. Contract documentation was updated to describe the accepted/failure union, risk tiers, record detail levels, diagnostics, OODA sections, deterministic record_markdown, and fixture-only boundary. During final documentation verification, a stale division fixture in liveArtifactFlow.test.ts was corrected to the current Div4.Production contract so typecheck and the full plugin suite pass.

## Verification

Fresh closeout verification used the closeout-safe gsd_exec surface. `npm --prefix plugin-bos-light test -- tests/decision.test.ts` exited 0 with 1 test file and 9/9 tests passing, proving CLEAR, COMPLICATED, COMPLEX, CHAOTIC, DISORDER, confidence clamping, deterministic now/decision_id, markdown rendering, invalid input errors, and worker piko:decide behavior. `npm --prefix plugin-bos-light run typecheck` exited 0, proving the TypeScript contract and docs-aligned fixture changes compile. `npm --prefix plugin-bos-light test` exited 0 with 10 test files and 88/88 tests passing, proving the decision changes did not regress the local plugin runtime suite. Operational readiness for this contract-only slice is fixture-driven: healthy means decision tests, typecheck, and full plugin tests pass and decision outputs include structured diagnostics; broken means those checks fail, a malformed input does not return accepted:false sanitized errors, or the optional registration seam throws instead of logging bounded warnings.

## Requirements Advanced

- R009 — Provided the decision contract support needed for eval gate failure decisions to produce visible risk-tiered records in S03.
- R010 — Provided the CHAOTIC/circuit-breaker decision classifier support needed for visible OPEN/self-healing escalation records in S03.
- R016 — Preserved the conservative runtime posture by documenting S01 as fixture-only proof and avoiding live Paperclip, plugin UI, native approval, Hermes, GSD-Pi, or host registration claims.

## Requirements Validated

None.

## New Requirements Surfaced

- None.

## Requirements Invalidated or Re-scoped

None.

## Operational Readiness

None.

## Deviations

T01 intentionally produced RED fixture proof before implementation. T02 recreated the decision fixture because it was absent in the worktree despite the T01 summary. T04 corrected an out-of-plan stale `Div3.Production` test fixture to `Div4.Production` because required typecheck exposed it. No live runtime or persistence support was added.

## Known Limitations

S01 is contract and fixture proof only. It does not persist decision artifacts, mirror Paperclip documents/comments, validate live Paperclip readback, prove host tool registration, or introduce dashboards/alerts. Runtime capability claims remain fallback-only or unvalidated until later slices provide surface-specific evidence.

## Follow-ups

S02 should consume the typed DecisionResult and deterministic markdown record to build the artifact envelope and native-or-markdown fallback persistence. S03 should integrate the same contract into batch approval, eval gate failure, circuit breaker, policy/budget exception, and strategic choice flows. S04 should attempt live Paperclip readback only where supported and record fail-closed blocker evidence otherwise.

## Files Created/Modified

- `plugin-bos-light/tests/decision.test.ts` — Added contract fixtures for domain classification, risk tiers, confidence clamping, deterministic markdown, invalid input errors, and worker seam behavior.
- `plugin-bos-light/src/contracts.ts` — Extended the shared decision contract types for accepted and rejected decision results.
- `plugin-bos-light/src/decision.ts` — Implemented risk-tiered classification, OODA/detail selection, sanitized diagnostics, and deterministic markdown rendering.
- `plugin-bos-light/src/worker.ts` — Routed optional piko:decide registration through the pure runPikoDecide seam.
- `plugin-bos-light/tests/liveArtifactFlow.test.ts` — Updated a stale division fixture to the current Div4.Production contract so typecheck passes.
- `docs/04_DATA_CONTRACTS.md` — Documented the S01 DecisionResult contract, diagnostics, OODA sections, deterministic markdown, and fixture-only boundary.
