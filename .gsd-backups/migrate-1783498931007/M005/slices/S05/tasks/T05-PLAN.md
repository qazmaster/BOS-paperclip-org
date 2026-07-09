---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T05: Create Circuit Breaker human resolution TypeScript module

Why: When Circuit Breaker opens, the system must freeze work, revoke access, create incident artifact, and present human decision options. Do: Create plugin-bos-light/src/circuitBreakerHumanResolution.ts with CircuitBreakerHumanResolution class. Implement onOpen(circuitState) → creates incident artifact in Paperclip with: OPEN timestamp, failure count, affected divisions, recommended options (abort_mission / resume_with_limits / create_correction_work_order / escalate_to_div7 / open_new_mission). Implement awaitHumanDecision(incidentId, timeoutMs) → polls for human selection. Implement executeResolution(decision) → routes to abort (clean shutdown), resume (reset counters with limits), correction (spawn new WorkOrder), escalate (notify Div7), or new mission (spawn intake). Implement logResolution(incidentId, decision) → mirrors resolution to Paperclip comment. Create circuitBreakerHumanResolution.test.ts covering: OPEN incident creation, option enumeration, human decision routing, resolution logging, timeout handling. Done when: unit tests pass.

## Inputs

- `plugin-bos-light/src/circuitBreaker.ts`
- `plugin-bos-light/src/paperclipAdapter.ts`
- `plugin-bos-light/src/hybridPersistence.ts`

## Expected Output

- `plugin-bos-light/src/circuitBreakerHumanResolution.ts`
- `plugin-bos-light/tests/circuitBreakerHumanResolution.test.ts`

## Verification

cd plugin-bos-light && npx vitest run tests/circuitBreakerHumanResolution.test.ts
