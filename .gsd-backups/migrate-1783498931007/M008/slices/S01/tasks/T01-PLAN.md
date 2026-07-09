---
estimated_steps: 5
estimated_files: 1
skills_used: []
---

# T01: Define DecisionDelegated packet type and RoutingPhase enum

Add to contracts.ts:
1. `DecisionDelegatedPayload` type with decisionId, cynefinDomain, recommendedMode, routingDirective, constraints, requiredFollowupDivisions, escalationLevel
2. `RoutingPhase` type: 'pre_decision' | 'post_div7_decision' | 'operational'
3. `RoutingDirective` type for operational dispatch hints
4. Extend `DivisionPacketType` union with 'decision_delegated'

## Inputs

- `plugin-bos-light/src/contracts.ts`

## Expected Output

- `plugin-bos-light/src/contracts.ts`

## Verification

TypeScript compiles. DecisionDelegatedPayload has all required fields. DivisionPacketType includes decision_delegated.
