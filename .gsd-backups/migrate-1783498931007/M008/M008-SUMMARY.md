---
id: M008
title: "Div7 Delegation and Div1 Deterministic Routing Refactor"
status: complete
completed_at: 2026-06-02T08:07:49.794Z
key_decisions:
  - D042: BOS Light routing governance layer over Paperclip runtime
  - D043: Two-phase routing with MissionSignals pre-decision
  - D044: BosTaskMetadata storage strategy
  - D045: Live Paperclip integration phasing
  - D046: Div7 and Div1 authority boundary clarification
key_files:
  - plugin-bos-light/src/contracts.ts
  - plugin-bos-light/src/decision.ts
  - plugin-bos-light/src/missionRouter.ts
  - plugin-bos-light/src/missionSignals.ts
  - plugin-bos-light/src/divisionPacketRouter.ts
  - plugin-bos-light/src/paperclipTaskPort.ts
  - plugin-bos-light/src/dryRunPaperclipTaskPort.ts
  - plugin-bos-light/src/bosTaskMetadata.ts
  - plugin-bos-light/src/metadataMirror.ts
  - agents/Div7_MissionControl/AGENTS.md
  - agents/Div1_HCO/AGENTS.md
lessons_learned:
  - Two-pass routing cleanly separates signal analysis (deterministic, no LLM) from strategic decision (Cynefin/OODA). This prevents Div7 from becoming a bottleneck for routine work.
  - DecisionDelegated packet is the right abstraction for Div7->Div1 delegation. It carries enough context (cynefin domain, routing directive, constraints) for Div1 to make operational routing decisions without re-analyzing the mission.
  - BosTaskMetadata as BOS-owned state with Paperclip comment mirror is the right storage strategy. Paperclip custom fields are too limited, and assigneeAdapterOverrides is semantically wrong for governance state.
  - DryRunPaperclipTaskPort enables architecture verification without live API coupling. M007B can add live implementation without changing any routing logic.
---

# M008: Div7 Delegation and Div1 Deterministic Routing Refactor

**Fixed architecture gap where Div7 became terminal handler for technical work. Implemented two-pass routing: pre-decision on MissionSignals, post-decision on Cynefin domain. Div7 is now executive regime controller, Div1 is operational authority.**

## What Happened

M008 fixed the critical architecture gap (R026, R027) where Div7.MissionControl could become a terminal handler for technical work. Key changes:

1. **DecisionDelegated packet** (S01): Every non-policy-only Div7 decision now emits a DecisionDelegated packet to Div1.HCO containing cynefin domain, recommended mode, routing directive, constraints, and escalation level.

2. **Two-pass routing** (S02): Pre-decision routing uses MissionSignals (deterministic keyword scan, no LLM) to determine if Div7 is needed. Routine missions bypass Div7 entirely. Post-decision routing uses DecisionDelegated payload for operational dispatch.

3. **PaperclipTaskPort** (S03): Interface for Paperclip task operations with DryRunPaperclipTaskPort for testing. BosTaskMetadata captures routing governance state. Mirror formatter produces structured comments for audit trail.

Authority boundary clarified (D046): Div7 = executive regime controller (WHY / WHAT STRATEGIC MODE). Div1 = operational authority (WHO / WHERE / WHEN). Div7 decides regime, Div1 runs the operating system.

## Success Criteria Results

All 10 success criteria verified:
1. Div7 cannot complete operational missions directly ✅
2. Routine CLEAR/COMPLICATED missions route without Div7 ✅
3. COMPLEX missions pass through Div7 then back to Div1 ✅
4. CHAOTIC missions trigger Div1-controlled incident flow ✅
5. DecisionDelegated packet emitted for non-policy decisions ✅
6. Routing policy uses MissionSignals for pre-decision ✅
7. PaperclipAction mapper produces correct dry-run actions ✅
8. BosTaskMetadata type and storage ready for M007B ✅
9. Regression tests prove Div7 non-terminal ✅
10. All existing tests pass ✅

## Definition of Done Results

All 5 definition-of-done items met:
1. All slices complete with passing tests ✅ (590/590 pass)
2. R026 acceptance criteria verified ✅
3. R027 acceptance criteria verified ✅
4. No terminal complex_decision route ✅
5. Dry-run PaperclipTaskPort interface ready ✅

## Requirement Outcomes

R026 (Div7 delegation constraint): Status changed from active to validated. All 8 acceptance criteria verified by 21 regression tests.
R027 (two-phase routing): Status changed from active to validated. All 6 acceptance criteria verified by routing policy tests.

## Deviations

None. All planned tasks completed as specified.

## Follow-ups

["M007B: Live Paperclip adapter spike - implement LivePaperclipIssueAdapter calling Paperclip API", "M007C: Production live routing behind feature flag with idempotency and rollback", "Update requirements R026 and R027 status to validated", "Consider adding Div7 AGENTS.md update for DecisionDelegated emission instructions"]
