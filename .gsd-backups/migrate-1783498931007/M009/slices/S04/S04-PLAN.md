# S04: End-to-End Live Validation with BOS-T1, T2, T3

**Goal:** Prove full BOS Light routing protocol works on live Paperclip
**Demo:** All three test tasks processed through live plugin with correct routing, grants, and metadata

## Must-Haves

- BOS-T1 (CLEAR/Div4), BOS-T2 (COMPLEX/Div7→Div1→multi), BOS-T3 (CHAOTIC/Div7→Div1→incident) all route correctly

## Proof Level

- This slice proves: Full end-to-end live validation

## Integration Closure

All routing paths exercised, all grant types tested, metadata mirror verified

## Verification

- Full audit trail in issue comments and plugin logs

## Tasks

- [x] **T01: End-to-end test: BOS-T1 CLEAR routing** `est:2h`
  Process BOS-T1 through live plugin. Verify deterministic routing to Div4. Verify grant auto-approved.
  - Files: `plugin-bos-light/tests/e2eLive.test.ts`
  - Verify: BOS-T1 routes to Div4, grant auto-approved

- [x] **T02: End-to-end test: BOS-T2 COMPLEX routing** `est:2h`
  Process BOS-T2 through live plugin. Verify Div7 decision, DecisionDelegated to Div1, multi-division routing.
  - Files: `plugin-bos-light/tests/e2eLive.test.ts`
  - Verify: BOS-T2 routes through Div7→Div1→multi-division

- [x] **T03: End-to-end test: BOS-T3 CHAOTIC routing** `est:2h`
  Process BOS-T3 through live plugin. Verify CHAOTIC routing, emergency grant, incident flow.
  - Files: `plugin-bos-light/tests/e2eLive.test.ts`
  - Verify: BOS-T3 routes through CHAOTIC incident flow

- [x] **T04: Document Level 2 activation results** `est:1h`
  Document what works, what doesn't, what needs improvement. Create HANDOFF_M009_COMPLETE.md.
  - Files: `HANDOFF_M009_COMPLETE.md`
  - Verify: Documentation complete

## Files Likely Touched

- plugin-bos-light/tests/e2eLive.test.ts
- HANDOFF_M009_COMPLETE.md
