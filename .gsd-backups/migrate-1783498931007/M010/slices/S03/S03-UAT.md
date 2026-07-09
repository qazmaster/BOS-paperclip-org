# S03: Agent Integration — UAT

**Milestone:** M010
**Written:** 2026-06-02T19:44:59.468Z

# UAT: S03 Agent Integration

## Preconditions
- BOS Light plugin loaded in Paperclip runtime
- dist/worker.js contains AgentActionValidator, IssueLifecycleHookManager, and MissionRouter logic
- All 7 v1.4.1 division agents registered in Paperclip

## UAT Steps

### Step 1: Verify Grant Policy Enforcement
**Action:** Call a BOS Light tool (e.g., bos-route-packet) as Div4.Production  
**Expected:** Tool executes successfully (routing is allowed for Div4)

**Action:** Call bos-decide as Div4.Production  
**Expected:** Returns `grant_denied` with denialId, reason, and division fields (bos-decide is denied for Div4)

### Step 2: Verify Cross-Division Boundaries
**Action:** Call bos-bpi-score as Div1.HCO  
**Expected:** Tool executes successfully

**Action:** Call bos-bpi-score as Div3.Treasury  
**Expected:** Returns `grant_denied` (budget scoring not allowed for Treasury division)

### Step 3: Verify Issue Lifecycle Routing
**Action:** Dispatch an issue.created event with title "Fix critical authentication bug in login" via bos-dispatch-event  
**Expected:** Routing decision log records the event, MissionRouter derives code/QA signals, packet delivered to Div4.Production and Div5.Qualifications

### Step 4: Verify Two-Pass Routing
**Action:** Dispatch an issue.created event with title "Critical outage: system crash emergency" via bos-dispatch-event  
**Expected:** CHAOTIC domain detected, Div7.MissionControl executive decision triggers, operational routing to Div1.HCO + Div3.Treasury + Div5

### Step 5: Verify Agent Visibility
**Action:** Run `node scripts/verify-s03-agent-visibility.js`  
**Expected:** All 7 agents present (Div1.HCO through Div7.MissionControl), overall verdict: PASS

### Step 6: Verify Evidence Artifact
**Action:** Read `runtime-evidence/M010-S03-agent-integration.json`  
**Expected:** overall_verdict = "pass", agent_visibility.total_present = 7, tool_enforcement and hook_integration sections populated

## Edge Cases
- Unknown event type dispatched → no routing, hook manager returns gracefully
- Empty issue title → routing falls back gracefully, no crash
- Multiple dispatches → routing decision log accumulates correctly
- clearRoutingDecisionLog called → log resets to empty

## UAT Type
Integration — verifies grant policy enforcement, issue lifecycle hooks, cross-division boundaries, and agent visibility through BOS Light plugin worker.
