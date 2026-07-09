---
estimated_steps: 13
estimated_files: 1
skills_used: []
---

# T01: Wire AgentActionValidator into dist/worker.js tool registrations

## Why
dist/worker.js currently registers 6 tools as plain handlers with no grant policy enforcement. AgentActionValidator and createValidatedToolWrapper exist in src/ but are not wired into the plugin worker. This task applies createValidatedToolWrapper to all 6 tool registrations so division-specific tool access boundaries are enforced at execution time.

## Do
1. In dist/worker.js, import AgentActionValidator and createValidatedToolWrapper from the compiled dist modules (or inline the pattern if module resolution is complex in the standalone worker).
2. Create a default AgentActionValidator instance in activate().
3. For each tool registration (bos-bpi-score, bos-blueprint-gen, bos-eval-gate, bos-circuit-breaker, bos-decide, bos-route-packet), wrap the handler with createValidatedToolWrapper. Use a configurable division and missionId (default: 'Div7.MissionControl' and 'default-mission' for standalone tool testing).
4. The wrapper must check grant policy before executing the tool handler. If denied, return { error: 'grant_denied', tool, division, reason, denialId }.
5. Keep existing tool handler logic unchanged — the wrapper is a higher-order function around it.

## Done-when
- All 6 tools are wrapped with createValidatedToolWrapper
- Calling a tool with a division that has access (e.g., Div4 + repo_read) returns the tool result
- Calling a tool with a division that is denied (e.g., Div4 + web_search) returns grant_denied
- Existing distWorkerTools tests still pass (tool behavior unchanged for allowed paths)

## Inputs

- `plugin-bos-light/dist/worker.js`
- `plugin-bos-light/src/agentActionValidator.ts`
- `plugin-bos-light/src/grantPolicy.ts`
- `plugin-bos-light/tests/distWorkerTools.test.ts`

## Expected Output

- `plugin-bos-light/dist/worker.js`

## Verification

cd plugin-bos-light && npx vitest run tests/distWorkerTools.test.ts

## Observability Impact

Grant denials now surface from tool execution layer with division, tool, reason, and denialId. Denial log is queryable via validator.getDenialLog().
