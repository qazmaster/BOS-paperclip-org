# S02: Owner Interface Boundary

**Goal:** Establish that Human creates mission only through Div7-facing intake; other divisions emit packets to Div7, not direct human questions; final executive report comes from Div7.
**Demo:** Human creates mission only through Div7-facing intake; other divisions emit packets to Div7, not direct human questions; final report comes from Div7.

## Must-Haves

- frameMission and requestHumanApproval reject non-Div7 callers with typed unauthorized diagnostic
- Non-Div7 divisions route human-facing requests through DivisionPacket to Div7.MissionControl
- ExecutiveReport type and generator exist, consuming mission + packet history + gate artifacts
- All behavior verified via in-memory fixtures; zero live Paperclip runtime claims

## Proof Level

- This slice proves: contract

## Integration Closure

Upstream surfaces consumed: contracts.ts Division type, missionIntake.ts MissionEnvelope and event emitters. New wiring: ownerBoundary.ts, divisionPacketRouter.ts, executiveReport.ts. What remains before milestone E2E: integration of packet router into HITLGovernance gate methods (future slice), real Div1 routing control (S03).

## Verification

- Run the task and slice verification checks for this slice.

## Tasks

- [x] **T01: Add boundary packet contracts and owner boundary enforcer** `est:30m`
  Why: The codebase lacks typed packet abstractions and a pure boundary enforcer. DivisionPacket, ExecutiveStatusPacket, ExecutiveReport, and OwnerBoundaryResult types do not exist. Do: Add these types to contracts.ts. Create ownerBoundary.ts with enforceOwnerBoundary(callerDivision, allowedDivision) and isDiv7MissionControl(callerDivision) helpers. Align with MEM154 canonical ownership map. Keep boundary enforcement pure — no async Paperclip calls. Done when: types compile and boundary functions return correct authorized/unauthorized results.
  - Files: `plugin-bos-light/src/contracts.ts`, `plugin-bos-light/src/ownerBoundary.ts`
  - Verify: cd plugin-bos-light && npx tsc --noEmit

- [x] **T02: Harden mission intake with caller division and create packet router** `est:45m`
  Why: MissionIntake currently allows any division to frame missions and request human approval. The boundary requires only Div7.MissionControl to perform these actions. Other divisions must use typed packets instead of direct human contact. Do: Add callerDivision parameter to frameMission and requestHumanApproval in missionIntake.ts. Return unauthorized diagnostic for non-Div7 callers. Create divisionPacketRouter.ts with typed packet envelope, packet types (status_update, escalation, resource_request, gate_decision, completion_report), and emitDivisionPacket function. Ensure non-Div7 divisions emit packets to Div7 instead of direct adapter calls. Done when: non-Div7 callers are rejected from mission intake and packet router accepts and stores packets.
  - Files: `plugin-bos-light/src/missionIntake.ts`, `plugin-bos-light/src/divisionPacketRouter.ts`
  - Verify: cd plugin-bos-light && npx tsc --noEmit

- [x] **T03: Create executive report generator** `est:30m`
  Why: No ExecutiveReport type or generator exists in the codebase. Div7.MissionControl must produce a final executive report for the Human Owner at mission closure. Do: Create executiveReport.ts with ExecutiveReport type and generateExecutiveReport(mission, packets, gates) function. Report must contain mission_summary, division_activity, verdict, and recommendations. Provide a toMarkdown fallback renderer. Done when: report generator produces structured output with all required sections.
  - Files: `plugin-bos-light/src/executiveReport.ts`
  - Verify: cd plugin-bos-light && npx tsc --noEmit

- [x] **T04: Boundary validation tests** `est:45m`
  Why: Boundary contracts need executable verification to prove the slice claims without relying on live Paperclip runtime. Do: Write tests/ownerBoundary.test.ts verifying non-Div7 callers are blocked and Div7 is allowed. Write tests/divisionPacketRouter.test.ts verifying packet routing, type safety, and Div7 aggregation. Write tests/executiveReport.test.ts verifying report generation from mission + packets + gates. Run all tests plus typecheck. Done when: all tests pass and TypeScript compiles with zero errors.
  - Files: `plugin-bos-light/tests/ownerBoundary.test.ts`, `plugin-bos-light/tests/divisionPacketRouter.test.ts`, `plugin-bos-light/tests/executiveReport.test.ts`
  - Verify: cd plugin-bos-light && npx vitest run tests/ownerBoundary.test.ts tests/divisionPacketRouter.test.ts tests/executiveReport.test.ts && npx tsc --noEmit

## Files Likely Touched

- plugin-bos-light/src/contracts.ts
- plugin-bos-light/src/ownerBoundary.ts
- plugin-bos-light/src/missionIntake.ts
- plugin-bos-light/src/divisionPacketRouter.ts
- plugin-bos-light/src/executiveReport.ts
- plugin-bos-light/tests/ownerBoundary.test.ts
- plugin-bos-light/tests/divisionPacketRouter.test.ts
- plugin-bos-light/tests/executiveReport.test.ts
