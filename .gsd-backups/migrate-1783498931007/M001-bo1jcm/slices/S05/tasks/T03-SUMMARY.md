---
id: T03
parent: S05
milestone: M001-bo1jcm
key_files:
  - plugin-bos-light/src/worker.ts
  - plugin-bos-light/tests/acceptance.test.ts
key_decisions:
  - Kept `piko:eval-gate` pure and exposed evidence mirroring via a separate `piko:eval-gate-evidence` orchestration tool.
  - Treated Paperclip worker registration and adapter/persistence seams as optional runtime capabilities; failures return bounded diagnostics or are skipped with logger warnings instead of being treated as live support proof.
  - Kept Circuit Breaker observation per explicit worker invocation and surfaced active-runs-only polling posture as metadata rather than starting a background poller.
duration: 
verification_result: passed
completed_at: 2026-05-28T05:43:20.159Z
blocker_discovered: false
---

# T03: Added worker-registered Eval Gate evidence and Circuit Breaker observation tools with acceptance coverage for adapter and persistence fallback paths.

**Added worker-registered Eval Gate evidence and Circuit Breaker observation tools with acceptance coverage for adapter and persistence fallback paths.**

## What Happened

Wired executor-usable orchestration entrypoints into `registerBosLightPlugin` while preserving the existing pure `piko:eval-gate` tool. `BOS_LIGHT_TOOLS` now exposes `evalGateEvidence` and `circuitBreakerFlow`, and worker registration now includes `piko:eval-gate-evidence` and `piko:circuit-breaker-observe`.

Added a defensive worker edge: `registerOptionalTool` skips absent `ctx.tools.register` and catches registration failures with logger diagnostics rather than crashing or claiming Paperclip host support. Tool params are normalized at the worker boundary, and adapter/persistence seams are selected from explicit params first, then `ctx.paperclipAdapter`, `ctx.paperclip`, and `ctx.persistence`; absent seams are passed to the helper flows so they return bounded evidence envelopes with markdown-only/cache-overlay diagnostics.

Expanded `plugin-bos-light/tests/acceptance.test.ts` to exercise S05 A6-A10 behavior through registered worker handlers: Eval Gate pass/fail comments mirrored to the in-memory adapter, repeated worker failures opening the breaker with native escalation issue evidence, HALF_OPEN retry returning to CLOSED, comment fallback when native issue creation is unavailable, and ACTIVE_RUNS_ONLY polling fallback metadata.

## Failure Modes

- `ctx.tools.register` missing: optional registration skips without throwing; existing no-tool-surface acceptance coverage still passes.
- `ctx.tools.register` rejected/timeout-equivalent failure: new acceptance coverage uses a rejecting register function and verifies `registerBosLightPlugin` resolves with warning diagnostics instead of claiming registration.
- Malformed tool params: worker normalizes non-object params to `{}` and helper validation returns `invalid_input` envelopes; acceptance covers missing Eval Gate booleans and invalid Circuit Breaker observation values.
- Missing adapter or persistence: Eval Gate evidence returns `markdown-only` with `comments.native:unavailable` and `cache_overlay.persistence: missing`; Circuit Breaker OPEN evidence returns markdown-only escalation diagnostics when issue/comment adapter paths are absent.
- Malformed or unavailable native evidence surfaces: Circuit Breaker worker acceptance covers missing native escalation issue creation and successful comment fallback; T01/T02 helper tests already cover malformed comment responses, adapter write failures, cache read/write failures, and activity logging failures.

## Load Profile

Worker calls are explicit per tool invocation; the implementation does not introduce a background poller or unbounded run-event listener. At 10x invocation load, the expected saturation point remains the Paperclip adapter issue/comment surfaces, not local pure gate evaluation. Protection is by bounded helper envelopes, cache-overlay-only persistence diagnostics, and polling metadata that explicitly reports `poll_scope: ACTIVE_RUNS_ONLY`, `max_retries: 60`, and `fallback_source: activity_log` rather than starting local polling.

## Negative Tests

- Missing seams: `returns worker tool diagnostics for missing seams, malformed params, and registration failures` verifies missing adapter/persistence Eval Gate diagnostics and missing-adapter Circuit Breaker markdown-only OPEN escalation diagnostics.
- Malformed inputs: the same test covers Eval Gate missing boolean inputs and Circuit Breaker invalid observation values.
- No/failed registration support: `does not crash when optional worker ctx tool surfaces are absent` covers absent registration support; the worker diagnostics test covers rejected `ctx.tools.register`.
- Fallback evidence: `uses comment escalation evidence when the worker breaker adapter lacks native issue creation` verifies comment fallback rather than native support claims.

## Observability Impact

Future agents can invoke `piko:eval-gate-evidence` or `piko:circuit-breaker-observe` and inspect returned envelopes for `selected_surface`, `artifact_ref`/`escalation_ref`, cache-overlay save/get state, fallback reasons, transition state, attempt count, polling posture, and markdown diagnostics.

## Verification

Ran the required targeted acceptance verification after implementation: `npm --prefix plugin-bos-light test -- acceptance.test.ts` passed with 26 tests. Also ran `npm --prefix plugin-bos-light run typecheck` successfully after fixing the worker edge typing needed for malformed-param diagnostic calls.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm --prefix plugin-bos-light run typecheck` | 0 | ✅ pass | 1945ms |
| 2 | `npm --prefix plugin-bos-light test -- acceptance.test.ts` | 0 | ✅ pass | 1228ms |

## Deviations

Added a small defensive optional-registration wrapper for all worker tools, not just the two new tools, so a failing optional `ctx.tools.register` cannot crash plugin startup or imply host support.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/src/worker.ts`
- `plugin-bos-light/tests/acceptance.test.ts`
