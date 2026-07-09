---
estimated_steps: 7
estimated_files: 1
skills_used: []
---

# T03: Replace terminal complex_decision in missionRouter.ts

Change deriveRoutingRule():
1. Remove `if (has('Div7.MissionControl')) return 'complex_decision'`
2. Add `requiresExecutiveDecision()` check based on mission signals
3. If requires executive: return 'requires_executive_decision' (not terminal)
4. If routine: return operational route for remaining divisions (excluding Div7)
5. Update routeApprovedMission() to handle requires_executive_decision state
6. Route to Div7 only when requiresExecutiveDecision() is true

## Inputs

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/missionRouter.ts`

## Expected Output

- `plugin-bos-light/src/missionRouter.ts`

## Verification

deriveRoutingRule() never returns 'complex_decision' as terminal. COMPLEX/CHAOTIC signals produce 'requires_executive_decision'. Routine signals produce operational routes.
