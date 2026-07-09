---
estimated_steps: 5
estimated_files: 1
skills_used: []
---

# T01: Define MissionSignals type and extraction function

Create missionSignals.ts:
1. MissionSignals type with taskClass (technical|research|compliance|budget|external|qa|strategy), requestedDivisions, requiresExternalData, requiresBudgetOrAccess, requiresImplementation, requiresQA, riskLevel (low|medium|high|critical), ambiguityLevel (low|medium|high), incidentSignals, policySignals
2. deriveMissionSignals(mission: MissionEnvelope): MissionSignals - deterministic scan of mission title, description, requested_divisions, risk_level
3. Lightweight keyword scan (no LLM) for task classification
4. Signal extraction from division composition

## Inputs

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/missionIntake.ts`

## Expected Output

- `plugin-bos-light/src/missionSignals.ts`

## Verification

TypeScript compiles. deriveMissionSignals() returns deterministic signals for test missions. No LLM dependency.
