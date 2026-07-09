---
estimated_steps: 20
estimated_files: 1
skills_used: []
---

# T02: Add comprehensive routing integration tests covering all 12 rules

## Why

The existing distWorkerTools.test.ts has 10 tests for bos-route-packet covering only the original 5 packet types. After T01 expands the routing table, we need tests for all 14 packet types plus verification that the src/ routing pipeline (missionRouter → decision → packetRouter) produces matching results. This proves the dist/worker.js routing table aligns with the real routing engine.

## Do

1. Add a new describe block in plugin-bos-light/tests/distWorkerTools.test.ts (or create a new file plugin-bos-light/tests/routingIntegration.test.ts) with tests for:
   - All 14 packet_type values produce correct routed_to targets
   - routing_rule field matches expected rule for each packet type
   - Multi-division routing types return arrays with correct divisions
   - Unknown packet_type defaults to Div7.MissionControl
2. Add cross-validation tests that verify the dist/worker.js routing table matches the real missionRouter.ts routing rules for equivalent inputs:
   - For each routing rule, construct a mission that would trigger that rule in missionRouter.ts
   - Verify the dist/worker.js bos-route-packet tool routes to the same divisions
3. Add edge case tests:
   - Empty payload
   - Null/undefined params (already tested but re-verify after refactor)
   - Packet types with special characters
4. All new tests must pass.

## Done-when

- All routing integration tests pass
- Every named routing rule (12 total) has at least one test
- Cross-validation confirms dist/worker.js routing matches src/ missionRouter routing

## Inputs

- `plugin-bos-light/dist/worker.js`
- `plugin-bos-light/tests/distWorkerTools.test.ts`
- `plugin-bos-light/src/missionRouter.ts`
- `plugin-bos-light/src/divisionPacketRouter.ts`
- `plugin-bos-light/src/decision.ts`
- `plugin-bos-light/src/issueLifecycleHooks.ts`
- `plugin-bos-light/src/contracts.ts`

## Expected Output

- `plugin-bos-light/tests/routingIntegration.test.ts`

## Verification

cd plugin-bos-light && npx vitest run tests/routingIntegration.test.ts

## Observability Impact

Test output provides per-rule pass/fail verdicts for all 12 named routing rules.
