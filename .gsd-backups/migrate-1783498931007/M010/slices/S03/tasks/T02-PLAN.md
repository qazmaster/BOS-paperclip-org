---
estimated_steps: 19
estimated_files: 1
skills_used: []
---

# T02: Add division-specific tool access integration tests

## Why
AgentActionValidator tests prove the validator logic, but there are no tests that exercise the wrapped dist/worker.js tools with multiple divisions to verify cross-division boundaries. This task creates integration tests that call the wrapped tools as different divisions and assert correct allow/deny behavior.

## Do
1. Create plugin-bos-light/tests/agentIntegration.test.ts.
2. Test at least these cross-division boundaries:
   - Div4.Production: allowed bos-bpi-score, bos-route-packet; denied external tools
   - Div6.External: allowed web_search, external_api; denied repo_write
   - Div3.Treasury: allowed budget_snapshot; denied repo_write, web_search
   - Div7.MissionControl: allowed bos-decide; denied repo_write, external_api
   - Div1.HCO: allowed routing; denied repo_write, external_api
   - Div2.MasterPlanner: allowed planning; denied repo_write, external_api, web_search
   - Div5.QualificationsLibraryLearning: allowed verification; denied repo_write, external_api, web_search
3. Test grant lifecycle: approved action returns result, denied action returns grant_denied with denialId.
4. Test that denial log accumulates across multiple denied calls and can be filtered by division.
5. Use the existing createMockCtx pattern from distWorkerTools.test.ts to activate the worker and call tools.

## Done-when
- All cross-division boundary tests pass
- At least 5 division/tool denial pairs validated
- Denial log filtering by division works

## Inputs

- `plugin-bos-light/dist/worker.js`
- `plugin-bos-light/src/agentActionValidator.ts`
- `plugin-bos-light/src/grantPolicy.ts`
- `plugin-bos-light/tests/distWorkerTools.test.ts`
- `plugin-bos-light/tests/agentActionValidator.test.ts`

## Expected Output

- `plugin-bos-light/tests/agentIntegration.test.ts`

## Verification

cd plugin-bos-light && npx vitest run tests/agentIntegration.test.ts

## Observability Impact

Tests validate that denial log entries contain correct division, tool, and reason fields for audit trail.
