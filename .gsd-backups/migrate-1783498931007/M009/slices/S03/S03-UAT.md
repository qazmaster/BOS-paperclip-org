# S03: GrantPolicy and BosTaskMetadata Live Enforcement — UAT

**Milestone:** M009
**Written:** 2026-06-02T11:43:15.033Z

# UAT: GrantPolicy and BosTaskMetadata Live Enforcement (M009 S03)

## Preconditions
- BOS Light plugin code is in `plugin-bos-light/`
- All 882 tests pass (`cd plugin-bos-light && npx vitest run`)
- TypeScript compiles cleanly (`cd plugin-bos-light && npx tsc --noEmit`)

## UAT Type: Integration Validation

### Test 1: GrantPolicy denies Div4 external access
**Steps:**
1. Create an AgentActionValidator for Div4.Production requesting web_search tool
2. Call validateGrantRequest()
3. Assert result is denied with "Div6.External route" reason

**Expected:** Action denied, denialId logged, denial entry in audit trail

### Test 2: GrantPolicy approves Div6 external access
**Steps:**
1. Create an AgentActionValidator for Div6.External requesting web_search tool
2. Call validateGrantRequest()
3. Assert result is approved

**Expected:** Action approved, no denial logged

### Test 3: BudgetGrant issued for valid Div7 request
**Steps:**
1. Create BosTaskMetadata for BOS-T2
2. Create AgentActionValidator for Div7 requesting decision tool
3. Validate, then attach grant to metadata
4. Assert metadata has grant reference and audit trail

**Expected:** Grant issued, tracked in ledger, attached to metadata

### Test 4: Metadata mirrored to Paperclip comments
**Steps:**
1. Create BosTaskMetadata with full lifecycle data
2. Call mirrorMetadataToComment with InMemoryPaperclipAdapter
3. Assert comment posted with serialized metadata

**Expected:** Comment contains all metadata fields (issue, mission, phase, grant, audit trail)

### Test 5: Grant decision mirrored to Paperclip comments
**Steps:**
1. Create a denied grant decision for Div4 external access
2. Call mirrorGrantDecisionToComment()
3. Assert comment contains DENIED decision with reason

**Expected:** Comment contains denial reason and Div6.External route

### Test 6: Adapter failure handled gracefully
**Steps:**
1. Create metadata mirror with failing adapter (throws error)
2. Call mirrorMetadataToComment()
3. Assert MetadataMirrorResult has success=false, error message

**Expected:** No crash, graceful error reported

### Test 7: Full BOS-T2 end-to-end flow
**Steps:**
1. Create BosTaskMetadata for BOS-T2
2. Validate Div7 grant request → approve
3. Attach grant to metadata
4. Mirror grant decision to comments
5. Mirror full metadata to comments
6. Assert all steps succeed with correct data

**Expected:** Complete lifecycle from metadata creation through grant issuance and mirroring

## Edge Cases
- Div4 requesting forbidden tools (production, repo_write) → denied per division policy
- Cost escalation above 500K → requires human approval
- Critical risk level → always escalates
- Revoked/expired grants detected in ledger
- Grant cost overrun detected
- Multiple concurrent denials tracked with unique denialIds
