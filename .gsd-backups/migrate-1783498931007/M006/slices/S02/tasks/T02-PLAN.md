---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T02: Harden mission intake with caller division and create packet router

Why: MissionIntake currently allows any division to frame missions and request human approval. The boundary requires only Div7.MissionControl to perform these actions. Other divisions must use typed packets instead of direct human contact. Do: Add callerDivision parameter to frameMission and requestHumanApproval in missionIntake.ts. Return unauthorized diagnostic for non-Div7 callers. Create divisionPacketRouter.ts with typed packet envelope, packet types (status_update, escalation, resource_request, gate_decision, completion_report), and emitDivisionPacket function. Ensure non-Div7 divisions emit packets to Div7 instead of direct adapter calls. Done when: non-Div7 callers are rejected from mission intake and packet router accepts and stores packets.

## Inputs

- `plugin-bos-light/src/missionIntake.ts`
- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/ownerBoundary.ts`

## Expected Output

- `plugin-bos-light/src/missionIntake.ts`
- `plugin-bos-light/src/divisionPacketRouter.ts`

## Verification

cd plugin-bos-light && npx tsc --noEmit
