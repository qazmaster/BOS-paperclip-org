---
id: T01
parent: S03
milestone: M009
key_files:
  - plugin-bos-light/src/agentActionValidator.ts
  - plugin-bos-light/src/worker.ts
  - plugin-bos-light/src/index.ts
  - plugin-bos-light/tests/agentActionValidator.test.ts
key_decisions:
  - GrantPolicy enforcement via wrapper pattern rather than modifying each tool handler individually
  - Denial log stored in-memory with per-validator instance for test isolation
  - Worker reads division/missionId from plugin context (ctx.division, ctx.missionId) with defaults
duration: 
verification_result: passed
completed_at: 2026-06-02T11:30:58.004Z
blocker_discovered: false
---

# T01: Wired GrantPolicy to agent action validation via AgentActionValidator wrapping all piko:* tool registrations

**Wired GrantPolicy to agent action validation via AgentActionValidator wrapping all piko:* tool registrations**

## What Happened

Created `agentActionValidator.ts` with `AgentActionValidator` class and `createValidatedToolWrapper` factory function. The validator connects GrantPolicy to agent action hooks by:

1. **AgentActionValidator**: Accepts an `AgentActionRequest` (division, missionId, toolName, secrets, cost, risk, TTL) and runs it through `validateGrantRequest`. Denied and escalated actions are logged to an in-memory denial log with audit trail entries (denialId, timestamp, division, tool, mission, reason, decisionId).

2. **createValidatedToolWrapper**: Higher-order function that wraps any tool handler with grant policy validation. If the action is denied, returns a `{ error: "grant_denied", tool, division, reason, denialId, decision }` object instead of executing.

3. **Worker integration**: All `piko:*` tools in `worker.ts` are now wrapped with `wrapWithGrantPolicy` before registration. The validator reads `ctx.division` and `ctx.missionId` from the plugin context. Tools that were previously unprotected (piko:bpi-score, piko:blueprint-gen, piko:bpi-blueprint-artifact, piko:eval-gate, piko:eval-gate-evidence, piko:circuit-breaker-observe, piko:decide) now enforce:
   - External tool access restricted to Div6.External only
   - Division-specific tool deny-lists (e.g., Div4.Production cannot use production tool)
   - Cost escalation thresholds (auto-approve at 100K, human approval at 500K)
   - Critical risk level always escalates
   - TTL limits (max 480 minutes)

4. **Test coverage**: 25 new tests covering approval/denial paths, denial logging, division/mission filtering, grant lifecycle (ledger integration), and tool wrapper behavior.

## Verification

TypeScript compiles cleanly (tsc --noEmit). All 843 tests pass across 45 test files including 25 new agentActionValidator tests. Key verification checks: Div4 blocked from web_search/external_api/external_api_call (denied with Div6.External route), Div6 allowed external tools, forbidden tools denied per division policy, cost escalation works, denial log tracks all denials with audit trail.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd plugin-bos-light && npx tsc --noEmit` | 0 | ✅ pass | 3200ms |
| 2 | `cd plugin-bos-light && npx vitest run tests/agentActionValidator.test.ts` | 0 | ✅ pass (25/25 tests) | 343ms |
| 3 | `cd plugin-bos-light && npx vitest run` | 0 | ✅ pass (843/843 tests, 45 files) | 8650ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/src/agentActionValidator.ts`
- `plugin-bos-light/src/worker.ts`
- `plugin-bos-light/src/index.ts`
- `plugin-bos-light/tests/agentActionValidator.test.ts`
