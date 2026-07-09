---
estimated_steps: 7
estimated_files: 1
skills_used: []
---

# T04: Add regression tests proving Div7 non-terminal behavior

Create test file testing:
1. COMPLEX mission: Div7 presence -> requires_executive_decision -> Div7 decides -> DecisionDelegated emitted -> Div1 routes to Div2/Div4/Div5
2. CHAOTIC mission: Div7 presence -> requires_executive_decision -> Div7 authorizes stabilization -> DecisionDelegated emitted -> Div1 routes incident flow
3. Routine mission: no Div7 involvement, direct operational routing
4. Div7 cannot directly assign operational task to Div4
5. DecisionDelegated packet contains correct cynefinDomain and routingDirective
6. All existing missionRouter tests still pass

## Inputs

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/decision.ts`
- `plugin-bos-light/src/missionRouter.ts`
- `plugin-bos-light/src/divisionPacketRouter.ts`

## Expected Output

- `plugin-bos-light/tests/div7-delegation.test.ts`

## Verification

All tests pass. Regression tests prove Div7 cannot self-execute technical work. COMPLEX and CHAOTIC missions flow through Div7 -> Div1.
