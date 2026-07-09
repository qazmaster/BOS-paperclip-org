---
estimated_steps: 13
estimated_files: 1
skills_used: []
---

# T03: Wire IssueLifecycleHookManager into dist/worker.js onEvent dispatch

## Why
dist/worker.js activate() registers tools but does not handle domain events from Paperclip. IssueLifecycleHookManager and createBosLightHookManager exist in src/ and wire issue.created events to MissionRouter routing. This task integrates the hook manager into the worker's activate() so that when Paperclip dispatches issue lifecycle events, BOS Light routing executes automatically.

## Do
1. In dist/worker.js activate(), import createBosLightHookManager (or inline the pattern).
2. Create a hook manager instance and store it on ctx for onEvent access.
3. Register an onEvent handler (ctx.onEvent or ctx.events.on) that maps Paperclip domain events to IssueLifecycleHookEvent via mapDomainEventToHookEvent and dispatches them through the hook manager.
4. If the Paperclip plugin runtime does not support onEvent (0.3.1 limitation), expose the hook manager as a tool (e.g., bos-dispatch-event) that can be called with event payloads for testing.
5. Keep existing tool registrations and grant policy wrapping from T01.

## Done-when
- Hook manager is created in activate() and accessible
- Issue lifecycle events can be dispatched through the manager
- missionRouterIssueCreatedHandler fires on issue.created events
- Routing decision log captures routing results

## Inputs

- `plugin-bos-light/dist/worker.js`
- `plugin-bos-light/src/issueLifecycleHooks.ts`
- `plugin-bos-light/src/missionRouter.ts`
- `plugin-bos-light/tests/issueLifecycleHooks.test.ts`
- `plugin-bos-light/tests/missionRouterIssueHook.test.ts`

## Expected Output

- `plugin-bos-light/dist/worker.js`

## Verification

cd plugin-bos-light && npx vitest run tests/distWorkerTools.test.ts

## Observability Impact

Routing decisions logged with signals, activated divisions, packet deliveries, and two-pass routing diagnostics.
