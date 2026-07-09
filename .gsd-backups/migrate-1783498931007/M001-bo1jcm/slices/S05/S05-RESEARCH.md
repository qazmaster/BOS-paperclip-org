# S05: Eval Gates and Circuit Breaker Evidence Research

## Summary
S05 already has the pure state machines, but not the runtime loop that makes them visible in Paperclip. `plugin-bos-light/src/evalGates.ts` returns a four-gate result with blocking/non-blocking classification and overall pass/fail rollup. `plugin-bos-light/src/circuitBreaker.ts` defines the `CLOSED` / `HALF_OPEN` / `OPEN` record, default thresholds, polling config constants, and transition helpers (`recordFailure`, `recordSuccess`, `moveToHalfOpen`, `attachEscalationIssue`).

What is missing is the orchestration layer: there is no poller, no activity-log scanner, no event subscription path, no worker tool for circuit state, and no code that turns `OPEN` into a native escalation issue or comment-based fallback. The docs are explicit that `events.issue_lifecycle` is `unvalidated`, `events.terminal_runs` is `fallback-only`, and polling must use active runs only with jitter/backoff and activity/comment fallback.

## Relevant Requirements
- **R009** — advance Eval Gate evidence and release guidance.
- **R010** — advance Circuit Breaker fallback behavior.
- **R012** — keep adapter and persistence seams intact while wiring native surfaces.
- Supporting constraints from **R003/R004/R011**: Paperclip remains the source of truth, runtime surfaces stay unproven until evidence exists, and M001 must preserve balanced proof without simulating live runtime behavior.

## Implementation Landscape

### Existing files that matter
- `plugin-bos-light/src/evalGates.ts` — deterministic gate evaluation with four gates: Deterministic, SecurityPolicy, ArtifactIntegrity, Budget.
- `plugin-bos-light/src/circuitBreaker.ts` — record creation and pure transitions; includes `POLLING_CONFIG` with active-runs-only, jitter/backoff, and activity-log fallback.
- `plugin-bos-light/src/persistence.ts` — `saveGateResult`, `saveCircuitBreaker`, `getCircuitBreaker`, plus `mirrorGateResultToNativeArtifact` and `mirrorDecisionToNativeArtifact` helpers.
- `plugin-bos-light/src/paperclipAdapter.ts` — exposes `createEscalationIssue` and `logActivity` seams; the in-memory adapter only records test-double calls.
- `plugin-bos-light/src/worker.ts` — currently registers `piko:eval-gate`, but nothing for circuit monitoring or fallback polling.
- Docs: `docs/05_PERSISTENCE_MATRIX.md`, `docs/06_ACCEPTANCE_TESTS.md`, `docs/07_RISKS_AND_SPIKES.md`, `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, `docs/02_ARCHITECTURE.md`, `docs/03_IMPLEMENTATION_PLAN_V1_2.md`, `docs/08_DEMO_SCRIPT.md`.

### What already works
- Gate evaluation is deterministic and returns explicit evidence strings.
- Circuit state can be created, failed, reset, moved to half-open, and attached to an escalation issue id.
- Gate results already have a native-comment mirror helper, which is the obvious durable evidence path when issue documents are unavailable.
- The polling configuration is already codified and aligned with the docs.

### What is missing
- No code wires `runEvalGates` into persistence or native artifacts.
- No code drives `recordFailure` / `recordSuccess` / `moveToHalfOpen` from observed runtime state or polling results.
- No escalation path currently calls `createEscalationIssue` when the breaker opens.
- No fallback policy exists for missing activity logging beyond the seam definitions and docs.
- No test covers half-open transitions, escalation issue attachment, or polling/activity fallback semantics.

## Natural Seams
1. **Pure gate seam** — `runEvalGates` should remain deterministic and easy to unit test.
2. **Pure circuit seam** — `createCircuitBreakerRecord` and the transition helpers should remain isolated from Paperclip concerns.
3. **Orchestration seam** — a worker/job or action handler should consume runtime observations, update state, persist the result, and decide whether to mirror to comment/document or escalate.
4. **Fallback evidence seam** — `mirrorGateResultToNativeArtifact` and adapter comment/issue hooks are the durable evidence layer until live docs/issues/activity are proven.

## First Proof
The highest-value proof is a deterministic test path that:
1. runs gates,
2. persists and mirrors the result,
3. simulates repeated failures through polling/observation input,
4. opens the breaker on the third failure,
5. attaches an escalation issue or explicit fallback comment, and
6. verifies a half-open retry path can return to `CLOSED` on success.

That gives visible evidence for A6-A10 without requiring event delivery to be trusted.

## Verification
- `npm --prefix plugin-bos-light test` — extend coverage for half-open, escalation, and mirror helpers.
- `npm --prefix plugin-bos-light run typecheck` — ensure new orchestration types align with contracts.
- `python3 scripts/validate_runtime_capabilities.py` — confirm docs still treat events/activity/issue surfaces as unvalidated until real proof exists.

## Notes / Skills
- The installed `observability` skill is directly relevant if this slice adds traceability for repeated failures, OPEN transitions, or fallback selection.
- The installed `error-handling-patterns` skill is relevant because S05 will likely need explicit Result-like or error-aware orchestration to keep fallback diagnostics safe and bounded.

## Planner-facing takeaway
S05 probably wants two executor tracks: (1) wire gate/circuit persistence + native evidence, and (2) add polling/fallback orchestration with tests for OPEN, HALF_OPEN, and recovery behavior.