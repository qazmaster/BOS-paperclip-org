---
estimated_steps: 21
estimated_files: 1
skills_used: []
---

# T04: Add agent-to-hook integration test proving issue routing flow

## Why
T03 wires the hook manager into the worker, but we need a test that proves the full flow: issue.created event → MissionRouter → division inbox packet delivery. This test exercises the integrated worker with the hook manager dispatching real routing decisions.

## Do
1. Add tests to plugin-bos-light/tests/agentIntegration.test.ts (extend the file from T02).
2. Test the full issue routing flow:
   a. Activate the worker with the hook manager
   b. Create an issue.created event with keywords that trigger specific division routing (e.g., 'implement code feature' → Div4.Production)
   c. Dispatch the event through the hook manager
   d. Assert routing decision log has an entry
   e. Assert division inbox has packets for expected divisions
   f. Assert packet delivery records match expected divisions
3. Test two-pass routing:
   a. Create an issue with strategic/policy keywords (triggers Div7 executive decision)
   b. Assert DecisionDelegated flow executes
   c. Assert operational routing result has activated divisions
4. Test edge cases: unknown event type returns no routing, empty title falls back gracefully.

## Done-when
- Issue routing flow test passes end-to-end
- Two-pass routing test passes
- Division inbox assertions verify packet delivery
- Routing decision log assertions verify observability

## Inputs

- `plugin-bos-light/dist/worker.js`
- `plugin-bos-light/src/issueLifecycleHooks.ts`
- `plugin-bos-light/src/missionRouter.ts`
- `plugin-bos-light/src/divisionPacketRouter.ts`
- `plugin-bos-light/tests/agentIntegration.test.ts`

## Expected Output

- `plugin-bos-light/tests/agentIntegration.test.ts`

## Verification

cd plugin-bos-light && npx vitest run tests/agentIntegration.test.ts

## Observability Impact

Tests verify routing decision log entries contain correct signals, activated divisions, and packet delivery records.
