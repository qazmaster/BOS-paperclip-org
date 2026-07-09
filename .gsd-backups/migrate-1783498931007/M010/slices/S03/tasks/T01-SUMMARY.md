---
id: T01
parent: S03
milestone: M010
key_files:
  - plugin-bos-light/dist/worker.js
  - plugin-bos-light/tests/distWorkerTools.test.ts
key_decisions:
  - Inlined validator/ledger/wrapper into dist/worker.js rather than adding a build step — worker.js is hand-maintained standalone ESM
  - Default validator uses Div7.MissionControl + default-mission for standalone tool registrations
  - Exported AgentActionValidator, InMemoryGrantLedger, createValidatedToolWrapper for test customization of division/missionId
duration: 
verification_result: passed
completed_at: 2026-06-02T19:29:21.236Z
blocker_discovered: false
---

# T01: Wired AgentActionValidator and createValidatedToolWrapper into all 6 dist/worker.js tool registrations, enforcing division-specific grant policy at execution time

**Wired AgentActionValidator and createValidatedToolWrapper into all 6 dist/worker.js tool registrations, enforcing division-specific grant policy at execution time**

## What Happened

Inlined GrantPolicy (validateGrantRequest + DEFAULT_POLICY), AgentActionValidator, InMemoryGrantLedger, and createValidatedToolWrapper from src/ into dist/worker.js since the worker is a hand-maintained standalone ESM module with no build step. Created a default AgentActionValidator instance in activate() using Div7.MissionControl / default-mission as defaults. Wrapped all 6 tool registrations (bos-bpi-score, bos-blueprint-gen, bos-eval-gate, bos-circuit-breaker, bos-decide, bos-route-packet) with createValidatedToolWrapper. The wrapper checks grant policy before executing; denied calls return { error: 'grant_denied', tool, division, reason, denialId, decision }. Exported AgentActionValidator, InMemoryGrantLedger, and createValidatedToolWrapper for test access. All 41 existing tests still pass, plus 11 new grant enforcement tests covering: export availability, allowed paths for default division, grant_denied for external tools on non-Div6 divisions, denial log recording with correct fields, division/mission filtering, cross-division boundary verification (Div4 can repo_read but not web_search; Div6 can web_search but Div3 cannot), decision metadata in denial responses, and clearDenialLog. All 1087 tests pass across 50 test files.

## Verification

cd plugin-bos-light && npx vitest run tests/distWorkerTools.test.ts — 52 tests pass (41 original + 11 grant enforcement). Full suite: 1087 tests pass across 50 test files.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd plugin-bos-light && npx vitest run tests/distWorkerTools.test.ts` | 0 | ✅ pass | 545ms |
| 2 | `cd plugin-bos-light && npx vitest run` | 0 | ✅ pass | 9700ms |

## Deviations

None

## Known Issues

None

## Files Created/Modified

- `plugin-bos-light/dist/worker.js`
- `plugin-bos-light/tests/distWorkerTools.test.ts`
