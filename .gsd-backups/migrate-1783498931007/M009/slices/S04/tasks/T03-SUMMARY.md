---
id: T03
parent: S04
milestone: M009
key_files:
  - plugin-bos-light/tests/e2eLive.test.ts
key_decisions:
  - Verified decision_delegated packet falls between first-pass and second-pass capture windows - must check getDivisionInbox directly instead of getPacketsForIssue()
  - Confirmed CHAOTIC routing targets Div1.HCO + Div3.Treasury + Div5.QualificationsLibraryLearning (not Div2 or Div4) per chaotic_incident_flow rule
duration: 
verification_result: passed
completed_at: 2026-06-02T11:59:39.009Z
blocker_discovered: false
---

# T03: Added 29 BOS-T3 CHAOTIC routing tests proving incident detection, CHAOTIC domain classification, STABILIZE_FIRST mode, chaotic_incident_flow routing to Div1+Div3+Div5, critical escalation, and emergency grant handling

**Added 29 BOS-T3 CHAOTIC routing tests proving incident detection, CHAOTIC domain classification, STABILIZE_FIRST mode, chaotic_incident_flow routing to Div1+Div3+Div5, critical escalation, and emergency grant handling**

## What Happened

Extended plugin-bos-light/tests/e2eLive.test.ts with 29 new tests covering the complete BOS-T3 CHAOTIC routing pipeline. BOS-T3 is crafted with incident/chaotic keywords (outage, emergency, critical, crash, breaker, runaway) that trigger Div7 executive decision and classify as CHAOTIC domain via the Cynefin decision engine.

**1. Incident Signal Detection Routes to Div7 (5 tests):**
- Routes BOS-T3 to Div7 as requires_executive_decision (single activated division, Div1.HCO excluded)
- Detects incidentSignals=true and riskLevel=CRITICAL in mission signals
- Triggers two-pass routing with DecisionDelegated, operational result, and packet deliveries
- Risk level escalates to CRITICAL via priority=critical + incident keywords
- Deterministic CHAOTIC routing across 5 consecutive invocations

**2. DecisionDelegated: CHAOTIC Domain Classification (8 tests):**
- DecisionDelegated payload has cynefin_domain=CHAOTIC
- Recommended mode is STABILIZE_FIRST (not SAFE_TO_FAIL_EXPERIMENT like COMPLEX)
- Routing rule is chaotic_incident_flow with requiresQA=true
- Targets 3 divisions: Div1.HCO, Div3.Treasury, Div5.QualificationsLibraryLearning
- Does NOT require budget grant (emergency protocol bypasses normal grant flow)
- Escalation level is "critical" (CHAOTIC domain always gets critical escalation)
- Constraints contain incident/active/critical/runaway risk reasons
- DecisionDelegated packet emitted from Div7 to Div1

**3. Second-Pass Chaotic Incident Flow Routing (6 tests):**
- Operational routing activates Div1.HCO, Div3.Treasury, Div5.QualificationsLibraryLearning (3 divisions)
- Excludes Div7.MissionControl from operational routing
- Work_assignment packets delivered to all three target divisions
- Second-pass packets carry correct metadata (packetId, fromDivision)
- Status_update delivered to Div7 confirming operational routing
- CHAOTIC does NOT activate Div2.MasterPlanner or Div4.Production

**4. Emergency Grant Handling (4 tests):**
- CHAOTIC routing directive does not require budget grant (emergency protocol)
- CRITICAL risk grant request escalates to Div7.MissionControl
- Div3.Treasury allowed tools (budget_snapshot, grant_creation, secret_ref_resolution) verified
- Div5 allowed tools (quarantine, verification, scanning) verified

**5. Audit Trail and Packet Traceability (5 tests):**
- Complete metadata in routing decision log (issueId, identifier, missionId, signals, routingResult, twoPassRouting)
- CHAOTIC decision has STABILIZE_FIRST mode confirmed
- Packets traceable via getPacketsForIssue (5+ packets across both passes)
- Packet summary reflects first-pass routing to Div7
- DecisionDelegated packet verified in Div1.HCO inbox directly (falls between capture windows per MEM264)

**6. Full E2E Integration (1 test):**
- Complete flow: issue.create dispatch → HookManager → MissionRouter → Div7 executive decision → DecisionDelegated (CHAOTIC, STABILIZE_FIRST) → Div1 operational routing → Div1+Div3+Div5 packet delivery → DecisionDelegated packet to Div1 → metadata creation → metadata mirror to Paperclip comment → full packet traceability

Total: 77 tests in e2eLive.test.ts (21 T01 + 27 T02 + 29 T03). Full suite: 959 tests, 48 files, 0 failures.

Key discovery: delegateDecisionToDiv1() emits the decision_delegated packet between the first-pass and second-pass capture windows, making it invisible to getPacketsForIssue(). Tests verify this packet by checking getDivisionInbox("Div1.HCO") directly (captured as MEM264).

## Verification

BOS-T3 routes through CHAOTIC incident flow. All 29 new tests pass. Full suite: 959 tests, 48 files, 0 failures.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd plugin-bos-light && npx vitest run tests/e2eLive.test.ts` | 0 | ✅ pass | 543ms |
| 2 | `cd plugin-bos-light && npx vitest run` | 0 | ✅ pass | 9170ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/tests/e2eLive.test.ts`
