---
estimated_steps: 9
estimated_files: 1
skills_used: []
---

# T03: Implement deriveOperationalRoute with post-decision support

Add to routingPolicy.ts:
1. deriveOperationalRoute(signals: MissionSignals, decision?: DecisionDelegatedPayload): OperationalRoute
2. Without decision: route by taskClass and division composition
3. With decision: route by cynefinDomain and routingDirective from DecisionDelegated
4. COMPLEX: route to Div2 (planning) -> Div3 (budget) -> Div4 (production) -> Div5 (QA)
5. CHAOTIC: route to Div1 (incident control) -> Div3 (budget freeze) -> Div5 (verification)
6. CLEAR: direct operational route without Div7
7. COMPLICATED: route with expert review flags
8. Returns OperationalRoute with targetDivisions, routingRule, requires flags

## Inputs

- `plugin-bos-light/src/missionSignals.ts`
- `plugin-bos-light/src/contracts.ts`

## Expected Output

- `plugin-bos-light/src/routingPolicy.ts`

## Verification

deriveOperationalRoute() produces correct routes for each domain. Two-pass flow works: pre-decision signals -> Div7 -> post-decision routing.
