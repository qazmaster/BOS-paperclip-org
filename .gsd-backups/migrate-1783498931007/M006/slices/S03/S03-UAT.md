# S03: Div1 Internal Routing Control — UAT

**Milestone:** M006
**Written:** 2026-06-01T07:56:56.064Z

## UAT: Div1 Internal Routing Control

- **UAT required:** no
- **UAT Type:** Contract-level verification (no user-facing or browser/runtime behavior)

### Preconditions
- Plugin source compiles with `npm run typecheck`
- Vitest test suite runs with `npx vitest run tests/missionRouter.test.ts`

### Steps
1. Run TypeScript typecheck: `cd plugin-bos-light && npm run typecheck`
2. Run mission router contract tests: `cd plugin-bos-light && npx vitest run tests/missionRouter.test.ts`
3. Run full regression suite: `cd plugin-bos-light && npx vitest run`

### Expected Outcomes
- TypeScript compilation reports zero errors
- 24/24 missionRouter tests pass
- 346/346 full-suite tests pass with no regressions

### Edge Cases Covered in Tests
- Empty requested_divisions list: Div7 still receives status_update, no work_assignment packets emitted
- Div1.HCO excluded from work targets even if present in requested_divisions
- Div7.MissionControl excluded from work targets and cannot invoke routing (unauthorized)
- All non-Div1 division callers receive MissionRouterUnauthorized with descriptive reason
- Packet router state isolation between tests via clearPacketRouter
