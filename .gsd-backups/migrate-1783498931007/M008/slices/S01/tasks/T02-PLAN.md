---
estimated_steps: 6
estimated_files: 1
skills_used: []
---

# T02: Add DecisionDelegated emission to decision.ts

After decide() produces accepted DecisionResult:
1. Check if decision is policy-only (CLEAR domain, BATCH_APPROVAL type, low risk)
2. If not policy-only, call emitDivisionPacket('Div7.MissionControl', 'Div1.HCO', 'decision_delegated', payload)
3. Payload maps from DecisionMetadata: decisionId, cynefinDomain, recommendedMode, routingDirective, constraints
4. Extract requiredFollowupDivisions from decision context
5. Return both DecisionResult and DivisionPacketDiagnostic

## Inputs

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/decision.ts`
- `plugin-bos-light/src/divisionPacketRouter.ts`

## Expected Output

- `plugin-bos-light/src/decision.ts`

## Verification

decide() returns { result, delegation? }. Non-policy decisions emit DecisionDelegated packet. Policy-only decisions skip emission.
