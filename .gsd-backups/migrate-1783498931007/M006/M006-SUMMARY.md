---
id: M006
title: "Autonomous Company Loop"
status: complete
completed_at: 2026-06-01T12:11:42.416Z
key_decisions:
  - Used execSync for synchronous verification checks (S08)
  - Used InMemoryBOSPersistence for circuit breaker state accumulation (S09)
  - Fixed approved_for_division gap in Div5 quarantine gate_decision (S10)
  - Created vitest.config.ts with pool:forks for test isolation
  - Derived files_changed from git diff-tree rather than requiring it in payload (S08)
key_files:
  - plugin-bos-light/src/div5PostProductionVerification.ts
  - plugin-bos-light/src/div5Quarantine.ts
  - plugin-bos-light/src/index.ts
  - plugin-bos-light/tests/div5PostProductionVerification.test.ts
  - plugin-bos-light/tests/div5PostProductionVerification.realgit.test.ts
  - plugin-bos-light/tests/circuitBreakerPostProduction.test.ts
  - plugin-bos-light/tests/e2eAutonomousMission.test.ts
  - plugin-bos-light/vitest.config.ts
  - agents/Div1_HCO/AGENTS.md
  - agents/Div2_MasterPlanner/AGENTS.md
  - agents/Div3_Treasury/AGENTS.md
  - agents/Div4_Production/AGENTS.md
  - agents/Div5_QualificationsLibraryLearning/AGENTS.md
  - agents/Div6_External/AGENTS.md
  - agents/Div7_MissionControl/AGENTS.md
lessons_learned:
  - Integration gaps surface when connecting independently-tested modules — the approved_for_division field was missing from Div5 quarantine's gate_decision despite Div4 production expecting it
  - vitest vi.mock leakage between test files requires pool:forks configuration for proper isolation
  - InMemoryBOSPersistence is essential for circuit breaker tests — without persistence, each call creates a fresh record
  - runDiv4Pipeline helper must be async since it calls async executeProductionWork — forgetting async/await causes silent test failures
---

# M006: Autonomous Company Loop

**Proved full 7-division autonomous loop end-to-end: Div7 intake → Div1 routing → Div6 gateway → Div5 quarantine → Div4 production → Div5 verification → Div7 executive report, with circuit breaker negative test and complete division hat profiles**

## What Happened

M006 implemented and proved the complete BOS Light autonomous company loop across 12 slices:

**S00-S01**: Runtime capability inventory and plugin live registration — proved Paperclip sees plugin tools and piko:* readback works.

**S02-S03**: Owner interface boundary and Div1 routing — proved human mission intake through Div7, routing through Div1, and packet-based division communication.

**S04-S05**: Div3 scoped budget access and Div6 external git gateway — proved secret ref resolution, scoped grants, and external git operations through the DMZ.

**S06-S07**: Div5 quarantine and Div4 production — proved secret scanning, sanitized repo snapshots, and local-only production work on test branches.

**S08**: Div5 eval gate — proved post-production verification with 7 synchronous checks producing PostProductionVerdict artifacts.

**S09**: Circuit breaker negative test — proved 3 consecutive failures open the circuit breaker with half-open recovery path.

**S10**: E2E autonomous git mission — proved the full 7-division loop works end-to-end with real git operations, producing branch, smoke file, verdict, and executive report.

**S11**: Hermes division profiles — enhanced all 7 AGENTS.md with Allowed Tools, Forbidden Tools, Runtime Boundary, Security Invariants, and Acceptance Checks.

Key integration fix: added approved_for_division to Div5 quarantine gate_decision emission (pre-existing gap). Created vitest.config.ts with pool:forks for test isolation.

Final state: 556 tests pass across 35 files. TypeScript compiles cleanly. All 12 slices complete.

## Success Criteria Results

- ✅ Full 7-division loop executes autonomously for bounded git mission (S10 E2E test)
- ✅ Plugin piko:* tools live and invoked through Paperclip (S01)
- ✅ Div6 performs external git; Div5 quarantines; Div4 works on sanitized snapshot (S05-S07)
- ✅ Circuit Breaker proven with negative test (S09)
- ✅ Final Div7 Executive Report exists (S10)
- ✅ All 7 division AGENTS.md have complete hat profiles (S11)

## Definition of Done Results

- ✅ 556 tests pass across 35 files
- ✅ TypeScript compiles with zero errors
- ✅ All 12 slices complete with tasks done
- ✅ Post-production verification produces verdict with 7 checks
- ✅ Circuit breaker opens after 3 failures with recovery path
- ✅ E2E test proves full autonomous loop
- ✅ All 7 AGENTS.md have Allowed Tools, Forbidden Tools, Runtime Boundary, Security Invariants, Acceptance Checks

## Requirement Outcomes

All roadmap vision requirements covered and validated by the 12 slices.

## Deviations

None

## Follow-ups

None — M006 is complete.
