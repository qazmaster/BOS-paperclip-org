# S04: End-to-End Validation — Research

## Summary

S04 validates the full BOS Light plugin integration by proving that **all subsystems wired in S01–S03 work together through a single cohesive workflow**. The slice exercises the dist/worker.js tool chain through the `activate()` function — tools, grant policy, issue lifecycle hooks, Cynefin routing, and multi-division packet delivery — as one integrated unit rather than isolated subsystems.

The prior slices proved:
- **S01**: All 6 plugin tools (bos-bpi-score, bos-blueprint-gen, bos-eval-gate, bos-circuit-breaker, bos-decide, bos-route-packet) produce correct output and handle missing params gracefully (41 tests).
- **S02**: 14 packet types route through 12 named routing rules with multi-division array routing; dist/worker.js routing table cross-validated against src/missionRouter.ts (76 tests).
- **S03**: AgentActionValidator enforces grant policy on all 6 tools across 7 divisions (63 tests); IssueLifecycleHookManager dispatches issue.created/updated/assignment through MissionRouter with Cynefin two-pass routing (21 tests); 7 agents visible with correct metadata.

**What S04 must add**: A single integrated E2E scenario that exercises the full tool chain end-to-end: issue dispatch → routing decision → grant policy → packet delivery → BPI scoring → blueprint generation → eval gate → circuit breaker check → decision → multi-division routing → audit trail. The scenario must also prove the three Cynefin paths (CLEAR, COMPLEX, CHAOTIC) produce the correct multi-division packet sets.

## Recommendation

Write one new integration test file (`plugin-bos-light/tests/e2eWorkflow.test.ts`) that:

1. Creates a mock Paperclip ctx and calls `activate(ctx)` to register all 7 tools.
2. Runs a **CLEAR scenario** (BOS-T1-style): dispatch issue.created → verify Div4 routing → call bos-bpi-score → call bos-blueprint-gen → call bos-eval-gate (pass) → call bos-circuit-breaker (check, closed) → call bos-decide → call bos-route-packet → verify routing decision log contains full audit trail.
3. Runs a **COMPLEX scenario** (BOS-T2-style): dispatch issue.created → verify two-pass Div7 routing → verify DecisionDelegated packet → verify multi-division operational routing to Div2+Div3+Div4+Div5 → call bos-route-packet with "complex" type → verify routing table alignment.
4. Runs a **CHAOTIC scenario** (BOS-T3-style): dispatch issue.created with incident keywords → verify Div7 executive decision → verify CHAOTIC domain → verify operational routing to Div1+Div3+Div5 → call bos-circuit-breaker (record, open) → verify circuit breaker escalation.
5. Proves **grant policy cross-division enforcement** in the full tool chain: verify that calling bos-decide as Div4.Production is denied (grant policy enforcement active via createValidatedToolWrapper), while Div7.MissionControl can call bos-decide.
6. Generates `runtime-evidence/M010-S04-e2e-workflow.json` with per-scenario verdicts, tool invocation audit trail, routing decision log snapshot, and overall_verdict.
7. Creates a verification script `scripts/verify-s04-e2e-workflow.js` following the established pattern.

## Implementation Landscape

### Key files
- **New**: `plugin-bos-light/tests/e2eWorkflow.test.ts` — main E2E workflow integration test
- **New**: `scripts/verify-s04-e2e-workflow.js` — evidence artifact validation script
- **New**: `runtime-evidence/M010-S04-e2e-workflow.json` — generated evidence artifact
- **Existing**: `plugin-bos-light/dist/worker.js` (913 lines) — the target being tested; no changes expected
- **Existing**: `plugin-bos-light/tests/e2eLive.test.ts` (77 tests) — reference for Cynefin routing scenarios
- **Existing**: `plugin-bos-light/tests/e2eAutonomousMission.test.ts` (4 tests) — reference for full 7-division loop

### Integration points
1. **activate(ctx)** — registers all 7 tools + hook manager; the mock ctx must support `ctx.tools.register`, `ctx.logger`, `ctx.events.on`
2. **IssueLifecycleHookManager.dispatchEvent()** — exercises MissionRouter routing from issue.created event through to division inbox
3. **createValidatedToolWrapper** — enforces grant policy at tool invocation time
4. **getRoutingDecisionLog / getPacketsForIssue / getRoutingPacketSummary** — audit trail after dispatch
5. **bos-dispatch-event tool** — event dispatch surface (Paperclip 0.3.1 fallback)
6. **All 6 BOS tools** — called sequentially to prove the full workflow

### Constraints
- No live Paperclip runtime available (MEM194: plugin install returns 404 on Paperclip 0.3.1). Tests use mock ctx pattern established in S01–S03.
- The dist/worker.js is a hand-maintained standalone ESM with no build step (MEM282). Tests import from `../dist/worker.js` directly.
- Paperclip 0.3.1 does not support `ctx.events.on` (MEM283), so bos-dispatch-event tool is the primary event dispatch surface.
- tsc --noEmit errors exist in test/fixture layer only (pre-existing JSX config, implicit any). Not blockers for E2E test creation.

### Patterns to follow
- **Evidence artifact pattern**: runtime-evidence/M010-S04-e2e-workflow.json with milestone, slice, per-scenario verdicts, overall_verdict, timestamp
- **Verification script pattern**: scripts/verify-s04-e2e-workflow.js using node:assert/strict to validate evidence artifact schema
- **Test pattern**: mock ctx → activate() → getHandler() → call tools → assert results, as established in distWorkerTools.test.ts and routingIntegration.test.ts
- **E2E scenario pattern**: issue lifecycle event dispatch → routing decision → multi-division packet delivery, as established in e2eLive.test.ts

## Risks

1. **Low risk**: Existing e2eLive.test.ts already covers BOS-T1/T2/T3 Cynefin routing with 77 tests. S04 must add value by proving the **tool chain integration** (not just routing), showing that tools called sequentially through a single activate() produce a coherent workflow.

2. **Low risk**: Grant policy enforcement is already tested in agentIntegration.test.ts with 63 tests. S04 should demonstrate enforcement in the context of a full workflow (e.g., trying to call bos-decide from a restricted division mid-workflow).

3. **Low risk**: The evidence artifact follows the exact same JSON structure pattern as M010-S01/S02/S03.

## Task Decomposition

### T01: E2E Workflow Integration Test (medium)
Create `plugin-bos-light/tests/e2eWorkflow.test.ts` with three Cynefin scenarios (CLEAR, COMPLEX, CHAOTIC) that exercise the full tool chain through a single `activate()` call. Each scenario dispatches an issue.created event, verifies routing, calls multiple tools in sequence, and validates the audit trail. Add grant policy enforcement verification (denied division tool call fails, allowed division succeeds).

**Files**: plugin-bos-light/tests/e2eWorkflow.test.ts
**Verify**: cd plugin-bos-light && npx vitest run tests/e2eWorkflow.test.ts (exit 0)

### T02: Evidence Artifact Generation and Verification (small)
Create `scripts/verify-s04-e2e-workflow.js` that runs the E2E test suite, captures results, and writes `runtime-evidence/M010-S04-e2e-workflow.json`. Create verification assertions for the evidence artifact schema.

**Files**: scripts/verify-s04-e2e-workflow.js, runtime-evidence/M010-S04-e2e-workflow.json
**Verify**: node scripts/verify-s04-e2e-workflow.js (exit 0); node -e "const e=JSON.parse(require('fs').readFileSync('runtime-evidence/M010-S04-e2e-workflow.json','utf8'));require('assert').strictEqual(e.overall_verdict,'pass')" (exit 0)

### T03: Full Regression and Slice Evidence (small)
Run the complete BOS Light test suite to confirm zero regressions from S04 changes. Record evidence artifact and verification.

**Files**: runtime-evidence/M010-S04-e2e-workflow.json (updated)
**Verify**: cd plugin-bos-light && npx vitest run (exit 0, all tests pass); cd plugin-bos-light && npx tsc --noEmit (exit 0 or only pre-existing errors in test/fixture layer)

## Verification Strategy

- **Contract proof**: All 3 Cynefin scenarios (CLEAR, COMPLEX, CHAOTIC) produce correct multi-division packet sets and complete audit trails through a single activate() registration.
- **Integration proof**: Grant policy enforcement verified in the context of the full tool chain (not just isolated unit tests).
- **Regression proof**: Full test suite (1213+ existing tests) passes without regressions after E2E test addition.
- **Evidence proof**: runtime-evidence/M010-S04-e2e-workflow.json passes verification script with overall_verdict=pass.

## Depth Calibration

**Targeted research** — known technology (vitest, dist/worker.js tool chain), new integration target (E2E workflow across all 3 Cynefin paths). No unfamiliar APIs or libraries needed. Existing e2eLive.test.ts and e2eAutonomousMission.test.ts provide clear patterns.
