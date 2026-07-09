# S01: Div7 Delegation and DecisionDelegated Packet

**Goal:** Replace terminal complex_decision route with requires_executive_decision pre-routing state. Add DecisionDelegated packet type and emission. Prove Div7 cannot become terminal handler.
**Demo:** After this: COMPLEX and CHAOTIC missions pass through Div7 then emit DecisionDelegated back to Div1. Regression tests prove Div7 cannot self-execute technical work.

## Must-Haves

- 1. missionRouter.ts no longer returns complex_decision as terminal route. 2. DecisionDelegated packet type defined with all required fields. 3. decide() emits DecisionDelegated to Div1.HCO after non-policy decisions. 4. Regression tests: COMPLEX mission -> Div7 -> DecisionDelegated -> Div1. CHAOTIC mission -> Div7 -> DecisionDelegated -> Div1. 5. All existing tests pass.

## Proof Level

- This slice proves: Contract + integration tests proving full Div7->Div1 delegation flow.

## Integration Closure

DecisionDelegated packet integrates with existing DivisionPacketRouter inbox system. No new runtime dependencies.

## Verification

- DecisionDelegated packets visible in division inbox for debugging.

## Tasks

- [x] **T01: Define DecisionDelegated packet type and RoutingPhase enum** `est:1h`
  Add to contracts.ts:
  1. `DecisionDelegatedPayload` type with decisionId, cynefinDomain, recommendedMode, routingDirective, constraints, requiredFollowupDivisions, escalationLevel
  2. `RoutingPhase` type: 'pre_decision' | 'post_div7_decision' | 'operational'
  3. `RoutingDirective` type for operational dispatch hints
  4. Extend `DivisionPacketType` union with 'decision_delegated'
  - Files: `plugin-bos-light/src/contracts.ts`
  - Verify: TypeScript compiles. DecisionDelegatedPayload has all required fields. DivisionPacketType includes decision_delegated.

- [x] **T02: Add DecisionDelegated emission to decision.ts** `est:2h`
  After decide() produces accepted DecisionResult:
  1. Check if decision is policy-only (CLEAR domain, BATCH_APPROVAL type, low risk)
  2. If not policy-only, call emitDivisionPacket('Div7.MissionControl', 'Div1.HCO', 'decision_delegated', payload)
  3. Payload maps from DecisionMetadata: decisionId, cynefinDomain, recommendedMode, routingDirective, constraints
  4. Extract requiredFollowupDivisions from decision context
  5. Return both DecisionResult and DivisionPacketDiagnostic
  - Files: `plugin-bos-light/src/decision.ts`
  - Verify: decide() returns { result, delegation? }. Non-policy decisions emit DecisionDelegated packet. Policy-only decisions skip emission.

- [x] **T03: Replace terminal complex_decision in missionRouter.ts** `est:3h`
  Change deriveRoutingRule():
  1. Remove `if (has('Div7.MissionControl')) return 'complex_decision'`
  2. Add `requiresExecutiveDecision()` check based on mission signals
  3. If requires executive: return 'requires_executive_decision' (not terminal)
  4. If routine: return operational route for remaining divisions (excluding Div7)
  5. Update routeApprovedMission() to handle requires_executive_decision state
  6. Route to Div7 only when requiresExecutiveDecision() is true
  - Files: `plugin-bos-light/src/missionRouter.ts`
  - Verify: deriveRoutingRule() never returns 'complex_decision' as terminal. COMPLEX/CHAOTIC signals produce 'requires_executive_decision'. Routine signals produce operational routes.

- [x] **T04: Add regression tests proving Div7 non-terminal behavior** `est:3h`
  Create test file testing:
  1. COMPLEX mission: Div7 presence -> requires_executive_decision -> Div7 decides -> DecisionDelegated emitted -> Div1 routes to Div2/Div4/Div5
  2. CHAOTIC mission: Div7 presence -> requires_executive_decision -> Div7 authorizes stabilization -> DecisionDelegated emitted -> Div1 routes incident flow
  3. Routine mission: no Div7 involvement, direct operational routing
  4. Div7 cannot directly assign operational task to Div4
  5. DecisionDelegated packet contains correct cynefinDomain and routingDirective
  6. All existing missionRouter tests still pass
  - Files: `plugin-bos-light/tests/div7-delegation.test.ts`
  - Verify: All tests pass. Regression tests prove Div7 cannot self-execute technical work. COMPLEX and CHAOTIC missions flow through Div7 -> Div1.

## Files Likely Touched

- plugin-bos-light/src/contracts.ts
- plugin-bos-light/src/decision.ts
- plugin-bos-light/src/missionRouter.ts
- plugin-bos-light/tests/div7-delegation.test.ts
