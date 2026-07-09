# S03 Research: Div1 Internal Routing Control

## Slice Objective

After S03: Div1 routes approved missions to Div2/Div3/Div6/Div5/Div4; Div1 does not perform all work itself; Div1 does not directly ask human. All routing is contract-level with in-memory fixtures.

## Requirements Mapping

| Requirement | Role | Relevance |
|-------------|------|-----------|
| R022 — E2E mission cycle | Supporting | Div1.HCO routing is a required step in the E2E flow; S03 must prove the routing contract before live integration |
| R023 — HITL gates | Supporting | Mission creation gate (Div7) is already validated by S02; S03 ensures all subsequent routing is autonomous with no human contact except through Div7 packets |

## Existing Codebase State

### Already Delivered by S02
- `plugin-bos-light/src/contracts.ts` — Division union, MissionEnvelope, DivisionPacket, ExecutiveStatusPacket, EvalGateResult, CircuitBreakerRecord, BosStatus enum
- `plugin-bos-light/src/divisionPacketRouter.ts` — In-memory packet store + keyed division inboxes; 5 packet types (status_update, escalation, resource_request, gate_decision, completion_report); 15 passing tests
- `plugin-bos-light/src/ownerBoundary.ts` — Pure boundary enforcer (self-OK, Div7 cross-boundary OK, all others rejected); 6 passing tests
- `plugin-bos-light/src/missionIntake.ts` — Mission framing, human approval request/await, event emission; rejects non-Div7 callers with typed diagnostics
- `plugin-bos-light/src/executiveReport.ts` — Report generator + markdown fallback; 19 passing tests
- `company-template/bos-company-template.json` — Canonical v1.4.1 routing rules:
  - `high_level_mission`: Div7.MissionControl → Div1.HCO
  - `backlog_shaping`: Div1.HCO → Div2.MasterPlanner
  - `budget_capacity`: Div1.HCO → Div3.Treasury
  - `implementation`: Div1.HCO → Div4.Production
  - `qa_security_review`: Div1.HCO → Div5.QualificationsLibraryLearning
  - `external_io_request`: Div1.HCO → Div5 → Div6 → Div5
  - `complex_decision`: Div1.HCO → Div7.MissionControl

### What Is Missing for S03
1. **RoutingDecisionPacket contract** — No type exists for Div1 to record a routing decision (which divisions activated, routing rule used, timestamp)
2. **Mission routing state machine** — No module transitions a mission from `APPROVED` → `IN_PROGRESS` with division activation tracking
3. **Div1 router implementation** — No function/module takes an approved MissionEnvelope and emits division-specific work packets
4. **Division work packet types** — Current DivisionPacketType is generic (status_update, escalation, etc.); S03 may need `work_assignment` or `mission_routing` packet type for inter-division mission handoff
5. **Human-facing routing guard** — No explicit verification that Div1 routes human contact through Div7 rather than direct adapter calls
6. **"Div1 does not do all work" guard** — No contract enforcing that Div1 emits packets to other divisions rather than executing work itself

## Architecture Notes from Memory

- **MEM154**: Canonical ownership map — Div1.HCO owns "approval/request routing ownership"; Div7.MissionControl owns mission-control oversight
- **MEM204**: Mission intake uses typed unauthorized diagnostic returns (not throws); non-Div7 divisions route through division packet router
- **MEM205**: Boundary validation tests must use exhaustive combinatorial coverage over all Division values
- **MEM207**: DivisionPacket router with in-memory keyed inboxes enables non-Div7 divisions to route human-facing communications to Div7 without direct adapter calls

## Recommended Implementation

### Natural Task Seams

1. **T01 — Extend contracts with routing types**
   - Add `RoutingDecisionPacket` to `contracts.ts`
   - Add `MissionRoutingState` type tracking activated divisions, pending divisions, completed divisions
   - Add `work_assignment` to `DivisionPacketType` in `divisionPacketRouter.ts`
   - Key file: `plugin-bos-light/src/contracts.ts`

2. **T02 — Build missionRouter.ts**
   - Pure function `routeApprovedMission(callerDivision, mission)` → returns routing decision + emitted packets
   - Enforces caller is Div1.HCO (boundary check via ownerBoundary.ts)
   - Reads `mission.requested_divisions`, filters out Div7/Div1, emits `work_assignment` packets to each target division
   - Emits `status_update` packet to Div7.MissionControl with routing summary
   - Returns typed `MissionRoutingState` with activated/pending/completed division lists
   - Returns typed diagnostic for unauthorized callers (non-Div1)
   - Key file: `plugin-bos-light/src/missionRouter.ts`

3. **T03 — Align routing rules with company template**
   - Ensure routing logic respects canonical routing_rules from bos-company-template.json
   - Div2 gets backlog_shaping; Div3 gets budget_capacity; Div4 gets implementation; Div5 gets qa_security_review; Div6 only activated when external_io is inferred
   - Complex decisions route back to Div7
   - Key file: `plugin-bos-light/src/missionRouter.ts`

4. **T04 — Exhaustive contract tests**
   - Test all Division values as caller (only Div1.HCO authorized to route)
   - Test that routing emits correct packets to correct divisions
   - Test that Div7 and Div1 are excluded from work_assignment targets
   - Test that human-facing communication is routed as DivisionPacket to Div7, not direct adapter call
   - Test that mission status transitions to IN_PROGRESS after routing
   - Test routing state tracks pending/completed correctly
   - Target: ~20 tests
   - Key file: `plugin-bos-light/tests/missionRouter.test.ts`

### Verification
- `npx tsc --noEmit` must pass with zero errors
- All new tests must pass
- No live Paperclip runtime claims (pure contract-level, in-memory only)

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Over-engineering a full workflow engine | Medium | Keep scope to "routing decision + packet emission"; do not build async orchestration or polling |
| Violating S02 boundary purity | Low | Use existing ownerBoundary.ts and divisionPacketRouter.ts; no new async adapter calls |
| Div1 "god object" anti-pattern | Medium | Explicitly test that Div1 emits packets but does not execute division work; each division has its own module |
| Routing rule drift from company template | Low | Derive routing rules from mission.requested_divisions + company template; document mapping in comments |

## Dependencies

- S02 contracts and division packet router (already complete)
- S02 owner boundary enforcer (already complete)
- S02 mission intake mission status transitions (APPROVED state already exists)

## No External Dependencies

All work is pure TypeScript contract-level with in-memory fixtures. No new libraries or external services required.
