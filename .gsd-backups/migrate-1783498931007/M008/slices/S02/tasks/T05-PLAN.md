---
estimated_steps: 7
estimated_files: 1
skills_used: []
---

# T05: Add two-pass routing integration tests

Create test file testing:
1. Routine technical mission: signals -> requiresExecutiveDecision=false -> direct route Div2->Div4->Div5
2. Ambiguous mission: signals -> requiresExecutiveDecision=true -> Div7 -> DecisionDelegated -> Div1 -> operational route
3. CHAOTIC incident: signals -> requiresExecutiveDecision=true -> Div7 -> DecisionDelegated -> Div1 -> incident flow
4. Budget exception: signals -> requiresExecutiveDecision=true -> Div7 -> DecisionDelegated -> Div1 -> Div3 route
5. External data request: signals -> direct route Div6->Div5 (no Div7 needed)
6. Routing latency: routine missions do not invoke Div7 decision path

## Inputs

- `plugin-bos-light/src/routingPolicy.ts`
- `plugin-bos-light/src/missionRouter.ts`
- `plugin-bos-light/src/missionSignals.ts`

## Expected Output

- `plugin-bos-light/tests/routing-policy.test.ts`

## Verification

All tests pass. Two-pass flow works correctly. Routine missions fast-path without Div7.
