---
estimated_steps: 9
estimated_files: 1
skills_used: []
---

# T01: E2E Workflow Integration Test

Create plugin-bos-light/tests/e2eWorkflow.test.ts with three Cynefin scenarios (CLEAR, COMPLEX, CHAOTIC) that exercise the full tool chain through a single activate() call.

**Why:** S01-S03 proved individual subsystems work in isolation. S04 must prove they work together as one integrated unit through the same activate() registration.

**Steps:**
1. Create test file with mock ctx pattern from distWorkerTools.test.ts
2. Implement CLEAR scenario (BOS-T1-style): dispatch issue.created → verify Div4 routing → call bos-bpi-score → call bos-blueprint-gen → call bos-eval-gate (pass) → call bos-circuit-breaker (check, closed) → call bos-decide → call bos-route-packet → verify routing decision log contains full audit trail
3. Implement COMPLEX scenario (BOS-T2-style): dispatch issue.created → verify two-pass Div7 routing → verify DecisionDelegated packet → verify multi-division operational routing to Div2+Div3+Div4+Div5 → call bos-route-packet with 'complex' type → verify routing table alignment
4. Implement CHAOTIC scenario (BOS-T3-style): dispatch issue.created with incident keywords → verify Div7 executive decision → verify CHAOTIC domain → verify operational routing to Div1+Div3+Div5 → call bos-circuit-breaker (record, open) → verify circuit breaker escalation
5. Implement grant policy cross-division enforcement: verify that calling bos-decide as Div4.Production is denied (grant policy enforcement active via createValidatedToolWrapper), while Div7.MissionControl can call bos-decide

**Done when:** cd plugin-bos-light && npx vitest run tests/e2eWorkflow.test.ts exits 0 with all tests passing

## Inputs

- `plugin-bos-light/dist/worker.js`
- `plugin-bos-light/tests/distWorkerTools.test.ts`
- `plugin-bos-light/tests/e2eLive.test.ts`
- `plugin-bos-light/tests/agentIntegration.test.ts`

## Expected Output

- `plugin-bos-light/tests/e2eWorkflow.test.ts`

## Verification

cd plugin-bos-light && npx vitest run tests/e2eWorkflow.test.ts

## Observability Impact

Signals added: per-scenario tool invocation audit trail, routing decision log snapshot, grant policy enforcement verification. How a future agent inspects this: run npx vitest run tests/e2eWorkflow.test.ts to see per-scenario pass/fail verdicts. Failure state exposed: failing scenario name, expected vs actual routing decision, denied tool call error message.
