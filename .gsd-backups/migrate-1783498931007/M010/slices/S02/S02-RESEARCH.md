# S02: Division Routing Configuration — Research

## Summary

The division routing system is **already fully implemented** across the source modules. The `dist/worker.js` `bos-route-packet` tool is a simplified lookup table (5 hardcoded packet_type → division mappings). The real routing engine lives in `src/missionRouter.ts` + `src/divisionPacketRouter.ts` + `src/issueLifecycleHooks.ts` + `src/decision.ts` + `src/missionSignals.ts`. These modules provide:

1. **Two-pass routing**: Pre-decision (Div1 checks if Div7 executive decision needed) → Post-decision (Div1 routes operationally based on DecisionDelegated payload).
2. **Deterministic Cynefin classification**: `decide()` in `decision.ts` maps keyword signals to CLEAR/COMPLICATED/COMPLEX/CHAOTIC domains.
3. **Packet router**: In-memory `DivisionPacketRouter` with typed packets (`work_assignment`, `status_update`, `escalation`, `gate_decision`, etc.) and per-division inboxes.
4. **Issue lifecycle hooks**: `issueLifecycleHooks.ts` wires `issue.created` events → MissionSignals → MissionRouter → packet delivery with full decision log traceability.
5. **Routing rules**: 8 named rules (`requires_executive_decision`, `backlog_shaping`, `budget_capacity`, `implementation`, `qa_security_review`, `external_io_request`, `paid_credentialed_external_io_request`, `multi_division_workflow`, `complex_safe_to_fail`, `chaotic_incident_flow`, `complicated_expert_review`, `standard_operational`).

### Existing Test Coverage (80 tests pass across 3 files)

| Test File | Tests | What It Covers |
|-----------|-------|---------------|
| `missionRouter.test.ts` | 26 | `routeApprovedMission()`: Div1 auth gate, exclusion rules, routine routing, executive decision detection, packet emission, routing rule derivation for all 8 combinations |
| `divisionPacketRouter.test.ts` | 15 | `emitDivisionPacket`, inbox aggregation, cross-division routing, packet type safety, `clearPacketRouter` isolation |
| `liveRouting.test.ts` | 39 | Full `issue.created` → MissionRouter → Div4 packet delivery pipeline. Two-pass routing with DecisionDelegated. Packet traceability via `getPacketsForIssue()`. Edge cases (missing description, incident keywords, urgency levels) |
| `missionRouterIssueHook.test.ts` | 56 | `issueCreatedToMissionEnvelope`, routing decision log, packet delivery records, Div7 two-pass flow, edge cases |

Additionally, `e2eAutonomousMission.test.ts` (3 tests) exercises the full 7-division loop including routing, quarantine, production, verification, and executive report.

## Recommendation

S02's slice goal is "Division routing configured and packets routed correctly." The routing engine is **functionally complete and tested**. The gap is:

1. **No evidence artifact** — S01 produced `runtime-evidence/M010-S01-plugin-tool-test.json`. S02 needs a corresponding evidence artifact proving routing works.
2. **The `dist/worker.js` bos-route-packet tool is a simplified stub** — it uses a 5-entry lookup table (`intake→Div7`, `planning→Div2`, `execution→Div4`, `review→Div1`, `external→Div6`) that doesn't exercise the real `missionRouter.ts`/`decision.ts` pipeline. This is the plugin worker surface that Paperclip agents invoke.
3. **No test verifies the `dist/worker.js` bos-route-packet tool exercises the full routing table** — existing distWorkerTools tests cover 5 hardcoded packet types but miss edge cases and the gap between the stub and the real routing engine.

### Suggested Tasks

**T01: Routing evidence artifact + verification script** (est: ~20 min)
- Create `runtime-evidence/M010-S02-routing-config.json` with per-rule verdicts proving all routing paths work.
- Create `scripts/verify-t02-routing-evidence.js` to validate the artifact schema.
- Evidence should cover: (a) routine routing to all 7 divisions, (b) two-pass routing with DecisionDelegated, (c) packet delivery traceability, (d) routing rule derivation for all named rules.

**T02: Extend dist/worker.js bos-route-packet tool to use real routing** (est: ~30 min)
- The current `bos-route-packet` tool in `dist/worker.js` is a 5-entry lookup table. It should either:
  - (A) Invoke the real `missionRouter.ts` routing pipeline (preferred), or
  - (B) Expand the lookup table to cover all routing rules (simpler but doesn't prove real integration).
- Option A requires bundling the missionRouter/decision/missionSignals modules into the dist worker. Option B just needs more entries.
- **Decision point**: The dist/worker.js is a single-file bundle. Option A requires a build step or inlining. Option B is additive.

**T03: Routing integration test through dist/worker.js** (est: ~20 min)
- Add tests to `distWorkerTools.test.ts` (or a new file) that verify the `bos-route-packet` tool handles all packet types and produces correct division routing.
- If T02 chose option A, test that the tool exercises real routing. If option B, test the expanded lookup table.

## Implementation Landscape

### Files Involved

| File | Role |
|------|------|
| `plugin-bos-light/dist/worker.js` | Plugin worker — the surface Paperclip agents call. `bos-route-packet` is the routing tool. |
| `plugin-bos-light/src/missionRouter.ts` | Real routing engine: `routeApprovedMission()`, `routeAfterDecision()`, `deriveRoutineRoutingRule()` |
| `plugin-bos-light/src/divisionPacketRouter.ts` | In-memory packet store: `emitDivisionPacket()`, `getDivisionInbox()`, `clearPacketRouter()` |
| `plugin-bos-light/src/decision.ts` | Div7 Cynefin decision engine: `decide()`, `createDecisionDelegated()`, `delegateDecisionToDiv1()` |
| `plugin-bos-light/src/missionSignals.ts` | Deterministic signal extraction: `deriveMissionSignals()`, `requiresExecutiveDecision()` |
| `plugin-bos-light/src/issueLifecycleHooks.ts` | Issue lifecycle → routing pipeline: `missionRouterIssueCreatedHandler()`, `issueCreatedToMissionEnvelope()` |
| `plugin-bos-light/src/contracts.ts` | Type definitions: `Division`, `MissionRoutingState`, `RoutingDecisionPacket`, `DecisionDelegatedPayload`, etc. |

### Key Constraints

1. **dist/worker.js is a single-file bundle** — it's already built (not from a build pipeline visible in the repo). Modifying it means editing the bundled file or adding a build step.
2. **No Paperclip runtime** — S02 tests are repository-local only. No live Paperclip import/export.
3. **S01 fixed a bug** in dist/worker.js `bos-route-packet` (snake_case→camelCase). The fix is already in place.
4. **Two-pass routing is the canonical pattern** (MEM243, MEM247, MEM264, MEM265). DecisionDelegated packets fall between first-pass and second-pass inbox capture windows.

### Routing Rules Summary

| Rule | Trigger | Target Divisions |
|------|---------|-----------------|
| `requires_executive_decision` | Div7 in requested_divisions or incident/policy signals | Div7.MissionControl (first pass) |
| `backlog_shaping` | Div2 only | Div2.MasterPlanner |
| `budget_capacity` | Div3 only | Div3.Treasury |
| `implementation` | Div4 only | Div4.Production |
| `qa_security_review` | Div5 only | Div5.QualificationsLibraryLearning |
| `external_io_request` | Div5 + Div6 | Div5, Div6 |
| `paid_credentialed_external_io_request` | Div3 + Div5 + Div6 | Div3, Div5, Div6 |
| `multi_division_workflow` | Mixed (no specific pattern) | All requested (excl Div1, Div7) |
| `complex_safe_to_fail` | Cynefin COMPLEX | Div2, Div3, Div4, Div5 |
| `chaotic_incident_flow` | Cynefin CHAOTIC | Div1, Div3, Div5 |
| `complicated_expert_review` | Cynefin COMPLICATED | Div2, Div4, Div5 |
| `standard_operational` | Cynefin CLEAR/default | Div2, Div4, Div5 |

### Risks

- **Low risk**: The routing engine is well-tested (136+ tests across routing files). The main gap is evidence artifact creation and potentially expanding the dist/worker.js tool surface.
- **Medium risk**: dist/worker.js is a pre-built bundle. If T02 needs to inline the real routing modules, this requires understanding the bundle format. The file uses ESM exports and appears to be a manually assembled single file, not a webpack/rollup output.
