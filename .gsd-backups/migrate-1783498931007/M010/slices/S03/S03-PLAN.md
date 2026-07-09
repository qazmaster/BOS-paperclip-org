# S03: Agent Integration

**Goal:** Wire division-specific grant policy enforcement and issue lifecycle hooks into dist/worker.js tools, prove cross-division tool access boundaries, and produce evidence that all 7 agents are visible with correct metadata.
**Demo:** 7 division agents visible and integrated

## Must-Haves

- All 7 v1.4.1 division agents verified visible with correct metadata via Paperclip API
- dist/worker.js tools enforce grant policy via AgentActionValidator (Div4 blocked from external, Div6 allowed)
- issueLifecycleHooks wired into dist/worker.js activate() so issue creation triggers MissionRouter routing
- Cross-division tool access boundaries tested: at least 5 division/tool denial pairs validated
- Integration test proves issue.created event flows through MissionRouter and delivers packets to correct division inboxes
- Evidence artifact recorded for agent visibility

## Proof Level

- This slice proves: integration

## Integration Closure

Upstream surfaces consumed: agentActionValidator.ts (AgentActionValidator, createValidatedToolWrapper), issueLifecycleHooks.ts (createBosLightHookManager, missionRouterIssueCreatedHandler), grantPolicy.ts (validateGrantRequest), dist/worker.js (tool registrations).
New wiring introduced: createValidatedToolWrapper applied to all 6 tool registrations in dist/worker.js, IssueLifecycleHookManager wired to activate() for onEvent dispatch.
What remains before milestone is truly usable end-to-end: S04 E2E validation (live agent execution through Paperclip).

## Verification

- Grant denials logged via AgentActionValidator denial log (division, tool, mission, reason)
- Routing decisions logged via issueLifecycleHooks RoutingDecisionLogEntry (signals, routing result, packet deliveries)
- Hook invocation log tracks event dispatch with handler name, result, duration

## Tasks

- [x] **T01: Wire AgentActionValidator into dist/worker.js tool registrations** `est:45m`
  ## Why
  dist/worker.js currently registers 6 tools as plain handlers with no grant policy enforcement. AgentActionValidator and createValidatedToolWrapper exist in src/ but are not wired into the plugin worker. This task applies createValidatedToolWrapper to all 6 tool registrations so division-specific tool access boundaries are enforced at execution time.
  - Files: `plugin-bos-light/dist/worker.js`
  - Verify: cd plugin-bos-light && npx vitest run tests/distWorkerTools.test.ts

- [x] **T02: Add division-specific tool access integration tests** `est:1h`
  ## Why
  AgentActionValidator tests prove the validator logic, but there are no tests that exercise the wrapped dist/worker.js tools with multiple divisions to verify cross-division boundaries. This task creates integration tests that call the wrapped tools as different divisions and assert correct allow/deny behavior.
  - Files: `plugin-bos-light/tests/agentIntegration.test.ts`
  - Verify: cd plugin-bos-light && npx vitest run tests/agentIntegration.test.ts

- [x] **T03: Wire IssueLifecycleHookManager into dist/worker.js onEvent dispatch** `est:45m`
  ## Why
  dist/worker.js activate() registers tools but does not handle domain events from Paperclip. IssueLifecycleHookManager and createBosLightHookManager exist in src/ and wire issue.created events to MissionRouter routing. This task integrates the hook manager into the worker's activate() so that when Paperclip dispatches issue lifecycle events, BOS Light routing executes automatically.
  - Files: `plugin-bos-light/dist/worker.js`
  - Verify: cd plugin-bos-light && npx vitest run tests/distWorkerTools.test.ts

- [x] **T04: Add agent-to-hook integration test proving issue routing flow** `est:1h`
  ## Why
  T03 wires the hook manager into the worker, but we need a test that proves the full flow: issue.created event → MissionRouter → division inbox packet delivery. This test exercises the integrated worker with the hook manager dispatching real routing decisions.
  - Files: `plugin-bos-light/tests/agentIntegration.test.ts`
  - Verify: cd plugin-bos-light && npx vitest run tests/agentIntegration.test.ts

- [x] **T05: Verify agent visibility and produce evidence artifact** `est:30m`
  ## Why
  The research identified 7 v1.4.1 agents created in Paperclip (from runtime-evidence/bos-v141-agent-creation.json). S03 must independently verify all 7 agents are still visible with correct metadata. This task creates a verification script and evidence artifact.
  - Files: `scripts/verify-s03-agent-visibility.js`, `runtime-evidence/M010-S03-agent-integration.json`
  - Verify: node scripts/verify-s03-agent-visibility.js

- [x] **T06: Full slice verification and test suite pass** `est:30m`
  ## Why
  Final verification that all S03 work integrates cleanly: the modified dist/worker.js passes all existing tests plus the new agentIntegration tests, and the evidence artifact is valid.
  - Verify: cd plugin-bos-light && npx vitest run tests/distWorkerTools.test.ts tests/agentIntegration.test.ts

## Files Likely Touched

- plugin-bos-light/dist/worker.js
- plugin-bos-light/tests/agentIntegration.test.ts
- scripts/verify-s03-agent-visibility.js
- runtime-evidence/M010-S03-agent-integration.json
