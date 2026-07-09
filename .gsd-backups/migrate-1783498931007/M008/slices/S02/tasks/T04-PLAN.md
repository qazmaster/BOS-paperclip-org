---
estimated_steps: 8
estimated_files: 1
skills_used: []
---

# T04: Integrate routing policy with missionRouter.ts

Update missionRouter.ts:
1. Import deriveMissionSignals, requiresExecutiveDecision, deriveOperationalRoute
2. Replace hardcoded division combination routing with policy-based routing
3. Pre-decision: call requiresExecutiveDecision(signals)
4. If true: route to Div7 as requires_executive_decision
5. If false: call deriveOperationalRoute(signals) for direct operational routing
6. Handle DecisionDelegated packets from Div7 inbox -> call deriveOperationalRoute(signals, decision)
7. Preserve all existing packet emission patterns

## Inputs

- `plugin-bos-light/src/missionRouter.ts`
- `plugin-bos-light/src/routingPolicy.ts`
- `plugin-bos-light/src/missionSignals.ts`

## Expected Output

- `plugin-bos-light/src/missionRouter.ts`

## Verification

missionRouter.ts uses routing policy. Routine missions bypass Div7. Executive decisions flow through two-pass.
