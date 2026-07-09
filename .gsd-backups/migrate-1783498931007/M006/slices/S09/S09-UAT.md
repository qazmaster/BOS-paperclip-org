# S09: Circuit Breaker Negative Test — UAT

**Milestone:** M006
**Written:** 2026-06-01T12:00:28.202Z

## UAT: Circuit Breaker Negative Test (S09)

### Pre-conditions
- Div4 production pipeline functional (S07)
- Div5 post-production verification functional (S08)
- Circuit breaker implemented with max_attempts=3

### Test Cases

**TC1: 3 failures → circuit OPEN**
1. Run Div4 pipeline on temp git repo
2. Tamper workspace (delete smoke file)
3. Run Div5 verification → FAIL
4. Feed failure to circuitBreakerFlow with InMemoryBOSPersistence
5. Repeat 2 more times
6. ✅ Circuit state=OPEN after 3rd failure
7. ✅ attempt_count=3, opened_at set

**TC2: CircuitBreakerIncident structure**
1. After circuit opens
2. ✅ schema_version="1.0", issue_id, state=OPEN
3. ✅ last_failure_reason contains "smoke_file_exists"
4. ✅ transition_reason="failure_threshold_reached"

**TC3: Bounded retries**
1. After circuit is OPEN, feed 2 more failures
2. ✅ State stays OPEN
3. ✅ attempt_count increments (4, 5)

**TC4: Half-open recovery**
1. After circuit is OPEN, call with observation='half_open'
2. ✅ State transitions to HALF_OPEN
3. Call with observation='success'
4. ✅ State returns to CLOSED, attempt_count=0

**TC5: Actionable diagnostics**
1. Delete smoke file, run verification
2. ✅ failure_reason contains check_id and "not found" detail
3. ✅ Circuit breaker record preserves full diagnostic string

