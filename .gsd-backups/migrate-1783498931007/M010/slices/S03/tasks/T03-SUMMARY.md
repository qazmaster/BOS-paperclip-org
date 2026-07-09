---
id: T03
parent: S03
milestone: M010
key_files:
  - plugin-bos-light/dist/worker.js
  - plugin-bos-light/tests/distWorkerTools.test.ts
key_decisions:
  - Inlined IssueLifecycleHookManager, mapDomainEventToHookEvent, and missionRouterIssueCreatedHandler into dist/worker.js rather than importing from src/ — the full dependency chain (missionRouter → missionSignals → contracts → divisionPacketRouter → decision) is too deep for standalone ESM
  - Created bos-dispatch-event tool as the primary event dispatch surface since Paperclip 0.3.1 does not support ctx.events.on
  - Inlined Cynefin domain derivation and two-pass routing logic equivalently to src/issueLifecycleHooks.ts missionRouterIssueCreatedHandler
duration: 
verification_result: passed
completed_at: 2026-06-02T19:37:20.215Z
blocker_discovered: false
---

# T03: Wired IssueLifecycleHookManager into dist/worker.js with bos-dispatch-event tool, ctx.events.on registration, and inlined mission router hook for issue lifecycle event dispatch

**Wired IssueLifecycleHookManager into dist/worker.js with bos-dispatch-event tool, ctx.events.on registration, and inlined mission router hook for issue lifecycle event dispatch**

## What Happened

Inlined IssueLifecycleHookManager class, mapDomainEventToHookEvent, missionRouterIssueCreatedHandler (with self-contained MissionSignals derivation, Cynefin domain classification, and two-pass routing), and createBosLightHookManager factory into dist/worker.js. The full src/ dependency chain (missionRouter → missionSignals → contracts → divisionPacketRouter → decision) was too deep to import in the standalone ESM worker, so the routing logic was inlined with equivalent behavior. In activate(): created a hook manager instance via createBosLightHookManager() (registers 4 handlers: bos-light-log-created, bos-light-log-updated, bos-light-log-assignment, bos-light-mission-router), stored it on ctx._hookManager for external inspection, registered ctx.events.on("issue.lifecycle") for Paperclip domain events when the runtime supports it, and registered bos-dispatch-event tool as the primary event dispatch surface (Paperclip 0.3.1 fallback). All exports added for test access: IssueLifecycleHookManager, mapDomainEventToHookEvent, createBosLightHookManager, missionRouterIssueCreatedHandler, deriveMissionSignalsFromText, inferDivisionsFromText, requiresExecutiveDecision, getRoutingDecisionLog, clearRoutingDecisionLog, getRoutingPacketSummary, getPacketsForIssue. Added 42 new tests covering: hook manager construction/registration/dispatch/error-handling/logging, mapDomainEventToHookEvent for 3 event types, createBosLightHookManager factory, MissionSignals derivation, requiresExecutiveDecision logic, routing decision log, bos-dispatch-event tool (7 tests for all event types + error paths), MissionRouter integration via bos-dispatch-event (7 tests covering routine technical routing, CHAOTIC two-pass, COMPLICATED two-pass, multi-division, packet deliveries, getPacketsForIssue, getRoutingPacketSummary), hook manager invocation log tracking after dispatch, and ctx.events.on registration behavior. Total: 94 tests in distWorkerTools.test.ts, 1192 tests across 51 files all passing.

## Verification

cd plugin-bos-light && npx vitest run tests/distWorkerTools.test.ts — 94 tests pass (41 original tool tests + 11 grant enforcement + 42 hook manager integration). Full suite: 1192 tests pass across 51 test files.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd plugin-bos-light && npx vitest run tests/distWorkerTools.test.ts` | 0 | ✅ pass | 435ms |
| 2 | `cd plugin-bos-light && npx vitest run` | 0 | ✅ pass | 9100ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/dist/worker.js`
- `plugin-bos-light/tests/distWorkerTools.test.ts`
