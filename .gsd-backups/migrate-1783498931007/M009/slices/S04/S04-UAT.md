# S04: End-to-End Live Validation with BOS-T1, T2, T3 — UAT

**Milestone:** M009
**Written:** 2026-06-02T12:03:49.443Z

## UAT: End-to-End Live Validation with BOS-T1, T2, T3

**UAT Type:** Integration / Routing Protocol Validation

### Preconditions
- BOS Light plugin registered on Paperclip (S01 complete)
- MissionRouter and DivisionPacketRouter operational (S02 complete)
- GrantPolicy and BosTaskMetadata enforcement active (S03 complete)
- All 959 plugin tests passing with zero regressions

### Test Scenarios

#### Scenario 1: BOS-T1 CLEAR Routing
**Steps:**
1. Create issue with CLEAR/task keywords (implementation, deploy, technical)
2. Observe MissionRouter dispatch
3. Check routing decision log

**Expected Outcomes:**
- Issue routes deterministically to Div4.Production
- Status = ROUTED
- No two-pass routing triggered (single-pass)
- Grant auto-approved (LOW risk, within limits)
- Work_assignment packet delivered to Div4
- Status_update packet delivered to Div7
- BosTaskMetadata created with Div4 assignment
- Metadata mirrored to Paperclip comment
- Consistent across repeated invocations (deterministic)

#### Scenario 2: BOS-T2 COMPLEX Routing
**Steps:**
1. Create issue with COMPLEX keywords (strategic, policy, ambiguous, governance)
2. Observe MissionRouter → Div7 executive decision
3. Check DecisionDelegated payload
4. Check second-pass operational routing

**Expected Outcomes:**
- First-pass routes to Div7.MissionControl
- Two-pass routing triggered (decisionDelegated + operationalRoutingResult)
- DecisionDelegated: cynefin_domain=COMPLEX, mode=SAFE_TO_FAIL_EXPERIMENT
- Routing rule: complex_safe_to_fail, requiresBudgetGrant=true
- Second-pass activates Div2, Div3, Div4, Div5
- DecisionDelegated packet in Div1.HCO inbox
- Work_assignment packets to all 4 divisions
- HIGH risk + high cost escalates grant to Div1.HCO
- MEDIUM risk + low cost auto-approves

#### Scenario 3: BOS-T3 CHAOTIC Routing
**Steps:**
1. Create issue with CHAOTIC keywords (outage, emergency, critical, crash)
2. Observe incident signal detection and Div7 routing
3. Check CHAOTIC domain classification
4. Verify incident flow routing

**Expected Outcomes:**
- Routes to Div7 as requires_executive_decision
- incidentSignals=true, riskLevel=CRITICAL
- DecisionDelegated: cynefin_domain=CHAOTIC, mode=STABILIZE_FIRST
- Routing rule: chaotic_incident_flow, requiresQA=true
- Second-pass activates Div1, Div3, Div5 (NOT Div2, NOT Div4)
- Critical escalation level
- Emergency grant bypass (no budget grant required)
- DecisionDelegated packet verified in Div1.HCO inbox

#### Scenario 4: Determinism and Audit Trail
**Steps:**
1. Run same routing scenario 5 consecutive times
2. Compare routing results

**Expected Outcomes:**
- Identical routing decisions across all 5 runs
- Complete audit trail metadata (issueId, identifier, missionId, signals, routingResult, packetDeliveries)
- All packets traceable via getPacketsForIssue()
- Packet summary reflects first-pass routing

### Edge Cases
- DecisionDelegated packet capture window: packet emitted between first/second pass — verify via getDivisionInbox directly
- getRoutingPacketSummary only indexes first-pass; full traceability requires getPacketsForIssue()
- BosTaskMetadataStore.attachGrant handles both grant binding and audit trail internally

### Coverage
- CLEAR domain: single-division deterministic routing ✅
- COMPLEX domain: two-pass routing with Div7 decision ✅
- CHAOTIC domain: incident flow with critical escalation ✅
- Grant policy: auto-approve, escalation, emergency bypass ✅
- Metadata mirror: Paperclip comment integration ✅
- Audit trail: routing decision log, packet traceability ✅
- Determinism: 5-run consistency proof ✅
