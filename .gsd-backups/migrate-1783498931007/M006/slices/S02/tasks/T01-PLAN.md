---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T01: Add boundary packet contracts and owner boundary enforcer

Why: The codebase lacks typed packet abstractions and a pure boundary enforcer. DivisionPacket, ExecutiveStatusPacket, ExecutiveReport, and OwnerBoundaryResult types do not exist. Do: Add these types to contracts.ts. Create ownerBoundary.ts with enforceOwnerBoundary(callerDivision, allowedDivision) and isDiv7MissionControl(callerDivision) helpers. Align with MEM154 canonical ownership map. Keep boundary enforcement pure — no async Paperclip calls. Done when: types compile and boundary functions return correct authorized/unauthorized results.

## Inputs

- `plugin-bos-light/src/contracts.ts`

## Expected Output

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/ownerBoundary.ts`

## Verification

cd plugin-bos-light && npx tsc --noEmit
