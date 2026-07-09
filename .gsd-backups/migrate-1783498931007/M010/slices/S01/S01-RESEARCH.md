# Slice S01 Research: Plugin Tool Testing

## Summary

Test all 6 BOS Light plugin tools through Paperclip's agent execution flow. The previous session installed the plugin (`cff0e22a-62c4-499e-9a2b-5e3ef89d4732`) and created 7 division agents + a CEO agent (`e01c675f-0215-4294-b368-e3cbdce6d6c7`) using `hermes_local` adapter with `xiaomi` provider. The plugin sidebar UI renders correctly. Tool invocation has NOT yet been tested.

## Key Findings

### Tool Invocation Model (D052/MEM270/MEM271)

Plugin tools can ONLY be invoked through Paperclip's agent execution flow:
1. Create an issue
2. Assign an agent (CEO agent `e01c675f-...`)
3. Send a chat message requesting tool invocation
4. The agent creates a runId and calls tools through Paperclip's tool dispatcher

The `POST /api/plugins/tools/execute` endpoint requires a `runId` in `runContext` that belongs to the `companyId`. There is no REST API to create runs. This is by-design security.

### Tool Names: Critical Mismatch

There are **3 different naming schemes** across the codebase:

| Location | Tool Names | Count |
|---|---|---|
| `dist/manifest.js` | `bos-bpi-score`, `bos-blueprint-gen`, `bos-eval-gate`, `bos-circuit-breaker`, `bos-decide`, `bos-route-packet` | 6 |
| `dist/worker.js` (activate) | `bos-bpi-score`, `bos-blueprint-gen`, `bos-eval-gate`, `bos-circuit-breaker`, `bos-decide`, `bos-route-packet` | 6 |
| `src/worker.ts` (registerBosLightPlugin) | `piko:bpi-score`, `piko:blueprint-gen`, `piko:bpi-blueprint-artifact`, `piko:eval-gate`, `piko:eval-gate-evidence`, `piko:circuit-breaker-observe`, `piko:decide` | 7 |
| `manifest.paperclip-plugin.json` | `piko:*` names | 7 |
| `src/pluginRegistration.ts` (BOS_LIGHT_MANIFEST) | `bpi-score`, `blueprint-gen`, `eval-gate`, `decide`, `circuit-breaker-observe` | 5 |

**The `dist/` files are what Paperclip actually loads.** The `src/worker.ts` `registerBosLightPlugin` function is NOT used by the dist — it's the SDK-style registration path that's blocked because Paperclip 0.3.1 has no plugin SDK.

The dist/worker.js `activate()` function registers 6 tools with `bos-` prefix. These are the tools an agent will see when it queries available tools.

### Bug in dist/worker.js: `bos-route-packet`

Line 145 references `target_division` (undefined) instead of `targetDivision` (line 140). This will throw a ReferenceError at runtime when `bos-route-packet` is invoked.

### Hermes + Xiaomi Status

The CEO agent uses `hermes_local` adapter with `provider: xiaomi`. The previous session noted this was configured but NOT tested with an actual agent run. Key concern from MEM043/MEM019: `hermes-paperclip-adapter@0.2.0` uses persisted `adapterConfig.env` instead of resolved runtime config, so Hermes subprocess may miss provider API keys and fail with 401.

### Key IDs

| Entity | ID |
|---|---|
| Company | `9feb4c22-05b9-401e-ba67-0e866e3056da` |
| CEO Agent | `e01c675f-0215-4294-b368-e3cbdce6d6c7` |
| Plugin | `cff0e22a-62c4-499e-9a2b-5e3ef89d4732` |
| Plugin Key | `bos-light.organizational-intelligence` |
| API Key | `pcp_7c334e03159c48e4561cc9b0cf76533d7b545f182e353380` |

### Tools to Test (6 from dist/manifest.js)

1. **bos-bpi-score** — Calculate BPI score (params: `mission_id`, `dimensions`)
2. **bos-blueprint-gen** — Generate BOS Blueprint markdown (params: `mission_id`, `title`, `divisions`)
3. **bos-eval-gate** — Run eval gates (params: `gate_id`, `target_id`, `evidence`)
4. **bos-circuit-breaker** — Check/record/reset circuit breaker (params: `action`, `breaker_id`, `failure_reason`)
5. **bos-decide** — Run decision engine (params: `mission_id`, `decision_type`, `rationale`)
6. **bos-route-packet** — Route packet to division (params: `mission_id`, `packet_type`, `payload`) — **has bug, needs fix first**

## Recommendation

### Implementation Order

1. **T01: Fix dist/worker.js bug** — Fix `target_division` → `targetDivision` variable name on line 145. 5-minute fix.
2. **T02: Test tool invocation via agent flow** — Create issue BOS-1 (or use existing), send message to CEO agent requesting each tool invocation, verify tool output appears in agent run result.
3. **T03: Verify Hermes+xiaomi adapter** — Check if the agent run succeeds or fails with auth errors. If 401, document blocker and create fallback-only evidence.
4. **T04: Record tool test results** — Create evidence artifact with per-tool pass/fail, response payloads, and runtime diagnostics.

### Blockers

- **Hermes adapter auth**: MEM043 warns hermes-paperclip-adapter@0.2.0 may not resolve secret refs at runtime. If agent runs fail with 401, all 6 tools are blocked.
- **Plugin loading**: If Paperclip didn't load the plugin correctly after DB reset, tools won't be visible to agents. Need to verify plugin is registered in the fresh instance.
- **dist/src mismatch**: The dist/ files are hand-written JS, not compiled from src/. Future changes to src/ must be manually reflected in dist/.

### Verification

- Agent run with tool invocation returns result JSON (not error)
- Each tool produces expected output schema
- `bos-route-packet` does not throw ReferenceError
- Evidence artifact recorded at `runtime-evidence/M010-S01-plugin-tool-test.json`

## Files

| File | Purpose |
|---|---|
| `plugin-bos-light/dist/worker.js` | Plugin worker loaded by Paperclip (has target_division bug) |
| `plugin-bos-light/dist/manifest.js` | Plugin manifest loaded by Paperclip |
| `plugin-bos-light/dist/ui/index.js` | UI sidebar component |
| `plugin-bos-light/src/worker.ts` | Source worker (piko: names, not used by dist) |
| `plugin-bos-light/src/registrationProbe.ts` | Registration probe without live Paperclip |
| `plugin-bos-light/src/pluginRegistration.ts` | Full plugin SDK contract spec |
| `plugin-bos-light/src/bpi.ts` | BPI score calculation |
| `plugin-bos-light/src/decision.ts` | Decision engine with Cynefin domains |
| `plugin-bos-light/src/evalGates.ts` | Eval gate logic |
| `plugin-bos-light/src/circuitBreaker.ts` | Circuit breaker state machine |

## Skill Check

- `verify-before-complete` skill: relevant for T04 verification step. Each tool must be verified working before claiming "tested and working".
