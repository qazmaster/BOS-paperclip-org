# S02: MissionRouter and DivisionPacketRouter Live Integration — UAT

**Milestone:** M009
**Written:** 2026-06-02T11:24:40.155Z

# UAT: S02 — MissionRouter and DivisionPacketRouter Live Integration

## Preconditions
- BOS Light plugin loaded in Paperclip (S01 complete)
- `createBosLightHookManager()` returns a hook manager with `bos-light-mission-router` handler registered
- MissionRouter, DivisionPacketRouter, and Decision modules available

## UAT Type: Integration

---

### Scenario 1: Issue creation triggers routing to Div4.Production

**Steps:**
1. Create a Paperclip issue with title "Build authentication feature for API" (contains code/feature keywords)
2. Dispatch `issue.created` event through the hook manager

**Expected:**
- MissionEnvelope created with `requested_divisions` including `Div4.Production`, `Div1.HCO`
- Risk level inferred as HIGH (default for technical work)
- `routeApprovedMission()` called, delivering `work_assignment` packet to Div4
- `getRoutingDecisionLog()` returns entry with issueId, signals (taskClass: technical, requiresImplementation: true), routing result, and packet deliveries
- `getPacketsForIssue(issueId)` returns PacketDeliveryRecord with `toDivision: Div4.Production`
- Handler returns `{ handled: true, message: "MissionRouter routed [identifier] [taskClass] → Div4.Production (N packets delivered, rule: routed)" }`

---

### Scenario 2: Div5 QA routing

**Steps:**
1. Create issue with title "Verify test coverage for auth module" (contains test/QA keywords)
2. Dispatch `issue.created` event

**Expected:**
- MissionEnvelope includes `Div5.QualificationsLibraryLearning` in `requested_divisions`
- `work_assignment` packet delivered to Div5
- `status_update` packet delivered to Div7 for oversight
- `getRoutingPacketSummary()` shows Div5 with count >= 1

---

### Scenario 3: Div7 two-pass routing for executive decisions

**Steps:**
1. Create issue with title "Emergency: production outage affecting all customers" (contains incident/outage keywords → CRITICAL risk + strategy keywords)
2. Dispatch `issue.created` event

**Expected:**
- First-pass routing activates `Div7.MissionControl` only (requires_executive_decision)
- Two-pass routing triggered automatically
- `decide()` classifies Cynefin domain (CHAOTIC for incident keywords)
- `DecisionDelegated` payload created with domain and routing directive
- `delegateDecisionToDiv1()` emits DecisionDelegated packet from Div7 to Div1
- Second-pass operational routing distributes to target divisions based on domain (CHAOTIC → Div1, Div3, Div5)
- `getRoutingDecisionLog()` entry includes `twoPassRouting` field with DecisionDelegated payload, operational routing result, and operational packet deliveries

---

### Scenario 4: Routine mission bypasses Div7

**Steps:**
1. Create issue with title "Add unit tests for user service" (routine technical work)
2. Dispatch `issue.created` event

**Expected:**
- First-pass routing activates Div4 (and possibly Div5), NOT Div7
- No two-pass routing triggered
- Routing decision log entry has no `twoPassRouting` field

---

### Scenario 5: Packet observability

**Steps:**
1. Create 3 issues with different division keywords
2. Dispatch all `issue.created` events
3. Call `getRoutingPacketSummary()`

**Expected:**
- Summary Map shows entries for each target division
- Each entry has `count` (number of packets) and `latestPacketId`
- `getPacketsForIssue()` returns correct packets for each issueId
- `clearRoutingDecisionLog()` also clears packet index

---

### Edge Cases
- Issue with empty description: routing still works with title-only inference
- Issue with no division keywords: defaults to Div1.HCO + Div4.Production
- Multiple keywords hitting same division: deduplicated in `requested_divisions`
- Handler errors: captured in invocation log, do not block subsequent handlers

---

### Verification Evidence
- `cd plugin-bos-light && npx vitest run tests/liveRouting.test.ts` — 39 tests, exit 0
- `cd plugin-bos-light && npx vitest run tests/missionRouterIssueHook.test.ts` — 56 tests, exit 0
- `cd plugin-bos-light && npx tsc --noEmit` — exit 0, clean
- `cd plugin-bos-light && npx vitest run` — 818 tests, 44 files, 0 failures
