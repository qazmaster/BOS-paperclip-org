# S09: Circuit Breaker Negative Test

**Goal:** Prove that repeated post-production verification failures trigger the circuit breaker to OPEN state, producing a CircuitBreakerIncident and routing escalation to Div1.HCO and executive summary to Div7.MissionControl.
**Demo:** Repeated failures stop the mission; retries bounded; CircuitBreakerIncident produced; Div1 receives escalation; Div7 receives executive summary.

## Must-Haves

- Circuit breaker transitions to OPEN after 3 consecutive verification failures\n- CircuitBreakerIncident artifact produced with complete failure diagnostics\n- Escalation packet routed to Div1.HCO with circuit breaker state\n- Executive summary packet routed to Div7.MissionControl\n- Half-open probe and recovery path verified\n- All tests pass with zero regressions

## Proof Level

- This slice proves: integration

## Integration Closure

S09 consumes PostProductionVerdict from S08 and CircuitBreakerFlow from existing implementation. Proves the failure path: repeated verification failures → circuit breaker OPEN → escalation to Div1 → executive summary to Div7. This validates the negative-test slice contract for S10 (E2E Autonomous Git Mission).

## Verification

- CircuitBreakerIncident artifact with state, attempt_count, failure_reason, opened_at. Escalation packet to Div1.HCO. Executive summary to Div7.MissionControl.

## Tasks

- [x] **T01: Circuit breaker negative test: repeated verification failures open circuit** `est:1h30m`
  Create plugin-bos-light/tests/circuitBreakerPostProduction.test.ts with real-git integration tests:
  - Files: `plugin-bos-light/tests/circuitBreakerPostProduction.test.ts`
  - Verify: cd plugin-bos-light && npx vitest run tests/circuitBreakerPostProduction.test.ts && npx vitest run

- [x] **T02: Full regression and TypeScript check** `est:5m`
  Run full test suite and TypeScript check to verify zero regressions across all 33+ test files.
  - Verify: cd plugin-bos-light && npx tsc --noEmit && npx vitest run

## Files Likely Touched

- plugin-bos-light/tests/circuitBreakerPostProduction.test.ts
