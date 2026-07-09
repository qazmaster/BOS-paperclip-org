---
estimated_steps: 26
estimated_files: 1
skills_used: []
---

# T01: Circuit breaker negative test: repeated verification failures open circuit

Create plugin-bos-light/tests/circuitBreakerPostProduction.test.ts with real-git integration tests:

1. Full pipeline → 3 verification failures → circuit OPEN:
   - Init temp repo, run Div4 production, tamper workspace (delete smoke file)
   - Feed failure to circuitBreakerFlow with observation='failure'
   - Repeat 3 times (circuit max_attempts=3)
   - Verify circuit state transitions: CLOSED → CLOSED → CLOSED → OPEN

2. Circuit OPEN → escalation packet emitted to Div1.HCO:
   - After circuit opens, verify emitDivisionPacket was called
   - Verify escalation packet payload contains issue_id, state=OPEN, failure_reason

3. Circuit OPEN → executive summary emitted to Div7.MissionControl:
   - Verify status_update packet to Div7 contains circuit breaker summary
   - Verify packet includes issue_id, state, attempt_count, last_failure_reason

4. CircuitBreakerIncident artifact structure:
   - Verify incident has schema_version, issue_id, state, attempt_count, max_attempts
   - Verify last_failure_at and last_failure_reason are populated
   - Verify opened_at is set when circuit transitions to OPEN

5. Bounded retries: verify circuit does not reopen after OPEN state
   - After circuit is OPEN, feed another failure
   - Verify attempt_count increments but state stays OPEN
   - Verify no duplicate escalation packets

6. Half-open probe: verify OPEN → HALF_OPEN → success → CLOSED
   - After circuit is OPEN, call circuitBreakerFlow with observation='half_open'
   - Verify state transitions to HALF_OPEN
   - Call with observation='success'
   - Verify state returns to CLOSED

Use real git operations (mkdtempSync + execSync) and real circuitBreakerFlow calls. Seed packets via emitDivisionPacket. Clear packet router between tests.

## Inputs

- `plugin-bos-light/src/circuitBreaker.ts`
- `plugin-bos-light/src/circuitBreakerFlow.ts`
- `plugin-bos-light/src/div5PostProductionVerification.ts`
- `plugin-bos-light/src/div4Production.ts`
- `plugin-bos-light/src/divisionPacketRouter.ts`
- `plugin-bos-light/tests/div4Production.realgit.test.ts`

## Expected Output

- `plugin-bos-light/tests/circuitBreakerPostProduction.test.ts`

## Verification

cd plugin-bos-light && npx vitest run tests/circuitBreakerPostProduction.test.ts && npx vitest run
