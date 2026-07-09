---
estimated_steps: 19
estimated_files: 1
skills_used: []
---

# T02: Write unit tests for all 6 dist/worker.js plugin tools

## Description

**Why:** The 6 BOS Light plugin tools registered in `dist/worker.js` have no unit tests. Each tool needs happy-path and missing-param error-path coverage.

**Do:**
1. Create `plugin-bos-light/tests/distWorkerTools.test.ts`
2. For each of the 6 tools, write tests that:
   - Mock `ctx.tools.register` to capture the handler function
   - Test happy-path invocation with valid params
   - Test missing required params returns error object
   - Assert output shape matches expected schema
3. Tools to test:
   - `bos-bpi-score`: requires `mission_id`, returns `bpi_score`, `dimensions`, `classification`
   - `bos-blueprint-gen`: requires `mission_id` and `title`, returns `blueprint` markdown
   - `bos-eval-gate`: requires `gate_id` and `target_id`, returns `verdict`
   - `bos-circuit-breaker`: requires `action` and `breaker_id`, returns `state`
   - `bos-decide`: requires `mission_id`, returns `decision`
   - `bos-route-packet`: requires `mission_id` and `packet_type`, returns `routed_to` with correct division
4. For `bos-route-packet`, test all 5 routing table entries (intake, planning, execution, review, external) plus default fallback
5. Run with vitest

**Done when:** `npx vitest run tests/distWorkerTools.test.ts` passes all tests.

## Inputs

- `plugin-bos-light/dist/worker.js`

## Expected Output

- `plugin-bos-light/tests/distWorkerTools.test.ts`

## Verification

npx vitest run tests/distWorkerTools.test.ts
