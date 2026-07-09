---
estimated_steps: 5
estimated_files: 1
skills_used: []
---

# T02: Implement requiresExecutiveDecision gate

Add to missionSignals.ts or routingPolicy.ts:
1. requiresExecutiveDecision(signals: MissionSignals): boolean
2. Returns true when: ambiguityLevel === 'high' OR incidentSignals OR policySignals OR conflicting division signals OR riskLevel === 'critical' with unclear task class
3. Returns false for routine: clear taskClass, low ambiguity, standard division composition
4. Gate must be fast (no async, no LLM) - pure deterministic function

## Inputs

- `plugin-bos-light/src/missionSignals.ts`

## Expected Output

- `plugin-bos-light/src/routingPolicy.ts`

## Verification

requiresExecutiveDecision() returns correct boolean for each signal combination. Routine missions return false. Ambiguous/incident missions return true.
