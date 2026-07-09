# S03: Agent Integration Research

## Summary

S03 must prove that all 7 BOS Light division agents (Div7.MissionControl, Div1.HCO, Div2.MasterPlanner, Div3.Treasury, Div4.Production, Div5.QualificationsLibraryLearning, Div6.External) are visible, correctly configured, and can execute through the Paperclip agent-to-plugin-tool invocation flow.

**Key finding:** The 7 agents already exist in Paperclip (created by `scripts/create_bos_v141_agents.py`), but the current dist/worker.js uses simplified tool implementations. S03 must:
1. Verify all 7 agents are visible and have correct metadata
2. Wire the src/ agentActionValidator + issueLifecycleHooks to the dist/worker.js tools
3. Prove agent-to-tool invocation works through the Paperclip execution flow
4. Validate division-specific tool access via grant policy

## Current State

### Agents in Paperclip (from runtime-evidence/bos-v141-agent-creation.json)
- All 7 v1.4.1 agents created via `POST /api/companies/{id}/agents`
- Agent IDs: Div7=1854f725, Div1=8ad1fa82, Div6=725db3d3 (others pre-existing)
- Adapter: hermes_local
- Metadata: bosLightDivisionId, bosLightTitle, v1.4.1=true

### Plugin Tools (dist/worker.js)
Current dist/worker.js has 6 simplified tools:
- bos-bpi-score, bos-blueprint-gen, bos-eval-gate, bos-circuit-breaker, bos-decide, bos-route-packet

These are stub implementations that don't use the full src/ modules.

### Source Modules Available
The src/ directory has rich implementations:
- `issueLifecycleHooks.ts` - Hook manager for issue.created/updated/assignment events
- `agentActionValidator.ts` - Grant policy validation for tool calls
- `divisionPacketRouter.ts` - Division inbox/packet routing
- `missionRouter.ts` - Two-pass routing (Div7 executive → Div1 operational)
- `grantPolicy.ts` / `grantLedger.ts` - Budget/access grant management

### Plugin Tool Invocation Path (from MEM271)
Plugin tools can ONLY be invoked through Paperclip's agent execution flow:
1. Create an issue
2. Assign an agent
3. Send a chat message requesting tool invocation
4. The agent creates a runId and calls tools through Paperclip tool dispatcher
5. POST /api/plugins/tools/execute requires a real runId in runContext

**This is by-design security** — tools execute in the context of an agent run.

## Natural Seams (Task Decomposition)

### T01: Agent Visibility Verification
**Goal:** Prove all 7 division agents are visible in Paperclip with correct metadata.
**Files:** scripts/verify-s03-agent-visibility.js (new)
**Approach:** 
- Use Paperclip API to list agents in company
- Verify all 7 v1.4.1 agents present
- Verify metadata (bosLightDivisionId, v1.4.1, role)
- Record evidence artifact

### T02: Division Tool Access Wiring
**Goal:** Wire the src/ agentActionValidator to dist/worker.js so tools enforce division-specific access.
**Files:** plugin-bos-light/dist/worker.js (modify)
**Approach:**
- Import AgentActionValidator from dist
- Create per-division tool wrappers that validate against grant policy
- Map division AGENTS.md allowed/forbidden tools to validator rules
- Test that Div4 can't call Div6 tools, Div3 can't call Div4 tools, etc.

### T03: Issue Lifecycle Hook Integration
**Goal:** Wire the src/ issueLifecycleHooks to dist/worker.js so agent assignment triggers BOS routing.
**Files:** plugin-bos-light/dist/worker.js (modify), plugin-bos-light/tests/agentIntegration.test.ts (new)
**Approach:**
- Import createBosLightHookManager from dist
- Register hooks for issue.created, issue.assignment
- Test that issue creation triggers mission routing
- Test that agent assignment validates division boundary

### T04: Agent-to-Tool Invocation Evidence
**Goal:** Prove agent-to-plugin-tool invocation works through Paperclip execution flow.
**Files:** scripts/verify-s03-agent-tool-invocation.js (new), runtime-evidence/M010-S03-agent-integration.json (new)
**Approach:**
- Create test issue
- Assign to a division agent
- Send chat message requesting tool invocation
- Verify tool executes with correct runContext
- Record evidence artifact

## Constraints

1. **Plugin registration is blocked** (Paperclip 0.3.1 returns 404 on plugin routes)
   - Cannot use live plugin runtime
   - Must use agent creation API + unit tests as proof

2. **Tool invocation requires agent execution flow**
   - Cannot call tools directly via REST API
   - Must create issues, assign agents, send messages

3. **Hermes execution not proven** (MEM043, MEM046)
   - hermes_local adapter may have secret materialization issues
   - Must fail-closed if Hermes execution fails

4. **Grant policy must be deterministic**
   - Routine grants within auto-approve limits are deterministic
   - No LLM needed for basic tool access validation

## Risk Assessment

**High Risk:** Agent-to-tool invocation through Paperclip execution flow may not work if:
- Hermes adapter fails to execute
- Plugin tools not registered in Paperclip runtime
- runContext not properly threaded

**Mitigation:** Test with unit tests first, then attempt live invocation. Record fail-closed evidence if blocked.

## Recommendation

Focus on **proving the integration contract** rather than live execution:
1. Verify agent visibility (T01) - high confidence
2. Wire division tool access (T02) - medium confidence
3. Wire issue lifecycle hooks (T03) - medium confidence
4. Attempt live invocation (T04) - low confidence, may produce fail-closed evidence

## Implementation Landscape

### Files to Modify
- `plugin-bos-light/dist/worker.js` - Wire src/ modules to tool implementations
- `plugin-bos-light/tests/agentIntegration.test.ts` (new) - Test agent-tool integration

### Files to Create
- `scripts/verify-s03-agent-visibility.js` - Verify agent existence
- `scripts/verify-s03-agent-tool-invocation.js` - Verify tool invocation
- `runtime-evidence/M010-S03-agent-integration.json` - Evidence artifact

### Tests to Run
- `cd plugin-bos-light && npx vitest run tests/agentIntegration.test.ts`
- `node scripts/verify-s03-agent-visibility.js`
- `node scripts/verify-s03-agent-tool-invocation.js`

## Sources

- `runtime-evidence/bos-v141-agent-creation.json` - Agent creation evidence
- `scripts/create_bos_v141_agents.py` - Agent creation script
- `plugin-bos-light/src/issueLifecycleHooks.ts` - Hook manager
- `plugin-bos-light/src/agentActionValidator.ts` - Grant policy validator
- `plugin-bos-light/src/divisionPacketRouter.ts` - Division routing
- `plugin-bos-light/src/missionRouter.ts` - Two-pass routing
- `plugin-bos-light/tests/e2eAutonomousMission.test.ts` - E2E test patterns
- `plugin-bos-light/tests/e2eLive.test.ts` - Live E2E test patterns
- MEM271 - Plugin tool invocation requires agent execution flow
