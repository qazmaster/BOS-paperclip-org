# S02: MissionSignals and Deterministic Routing Policy

**Goal:** Implement MissionSignals extraction from mission metadata. Add deterministic routing rules. Ensure routine CLEAR/COMPLICATED missions route without Div7 involvement.
**Demo:** After this: routing policy uses MissionSignals for pre-decision routing. Routine missions bypass Div7. Two-pass flow works for executive decisions.

## Must-Haves

- 1. MissionSignals type defined with all required fields. 2. deriveMissionSignals() extracts signals from mission metadata. 3. requiresExecutiveDecision() returns true only when signals indicate ambiguity, policy conflict, or incident. 4. deriveOperationalRoute() produces correct division routing for each signal combination. 5. Routine missions (low ambiguity, clear task class) route directly without Div7. 6. Tests prove two-pass flow for COMPLEX and CHAOTIC.

## Proof Level

- This slice proves: Unit tests for signal extraction, routing rules, and two-pass flow integration.

## Integration Closure

Integrates with S01 DecisionDelegated for post-decision routing. Uses existing mission metadata.

## Verification

- MissionSignals logged for routing debugging.

## Tasks

- [x] **T01: Define MissionSignals type and extraction function** `est:2h`
  Create missionSignals.ts:
  1. MissionSignals type with taskClass (technical|research|compliance|budget|external|qa|strategy), requestedDivisions, requiresExternalData, requiresBudgetOrAccess, requiresImplementation, requiresQA, riskLevel (low|medium|high|critical), ambiguityLevel (low|medium|high), incidentSignals, policySignals
  2. deriveMissionSignals(mission: MissionEnvelope): MissionSignals - deterministic scan of mission title, description, requested_divisions, risk_level
  3. Lightweight keyword scan (no LLM) for task classification
  4. Signal extraction from division composition
  - Files: `plugin-bos-light/src/missionSignals.ts`
  - Verify: TypeScript compiles. deriveMissionSignals() returns deterministic signals for test missions. No LLM dependency.

- [x] **T02: Implement requiresExecutiveDecision gate** `est:1h`
  Add to missionSignals.ts or routingPolicy.ts:
  1. requiresExecutiveDecision(signals: MissionSignals): boolean
  2. Returns true when: ambiguityLevel === 'high' OR incidentSignals OR policySignals OR conflicting division signals OR riskLevel === 'critical' with unclear task class
  3. Returns false for routine: clear taskClass, low ambiguity, standard division composition
  4. Gate must be fast (no async, no LLM) - pure deterministic function
  - Files: `plugin-bos-light/src/routingPolicy.ts`
  - Verify: requiresExecutiveDecision() returns correct boolean for each signal combination. Routine missions return false. Ambiguous/incident missions return true.

- [x] **T03: Implement deriveOperationalRoute with post-decision support** `est:3h`
  Add to routingPolicy.ts:
  1. deriveOperationalRoute(signals: MissionSignals, decision?: DecisionDelegatedPayload): OperationalRoute
  2. Without decision: route by taskClass and division composition
  3. With decision: route by cynefinDomain and routingDirective from DecisionDelegated
  4. COMPLEX: route to Div2 (planning) -> Div3 (budget) -> Div4 (production) -> Div5 (QA)
  5. CHAOTIC: route to Div1 (incident control) -> Div3 (budget freeze) -> Div5 (verification)
  6. CLEAR: direct operational route without Div7
  7. COMPLICATED: route with expert review flags
  8. Returns OperationalRoute with targetDivisions, routingRule, requires flags
  - Files: `plugin-bos-light/src/routingPolicy.ts`
  - Verify: deriveOperationalRoute() produces correct routes for each domain. Two-pass flow works: pre-decision signals -> Div7 -> post-decision routing.

- [x] **T04: Integrate routing policy with missionRouter.ts** `est:2h`
  Update missionRouter.ts:
  1. Import deriveMissionSignals, requiresExecutiveDecision, deriveOperationalRoute
  2. Replace hardcoded division combination routing with policy-based routing
  3. Pre-decision: call requiresExecutiveDecision(signals)
  4. If true: route to Div7 as requires_executive_decision
  5. If false: call deriveOperationalRoute(signals) for direct operational routing
  6. Handle DecisionDelegated packets from Div7 inbox -> call deriveOperationalRoute(signals, decision)
  7. Preserve all existing packet emission patterns
  - Files: `plugin-bos-light/src/missionRouter.ts`
  - Verify: missionRouter.ts uses routing policy. Routine missions bypass Div7. Executive decisions flow through two-pass.

- [x] **T05: Add two-pass routing integration tests** `est:2h`
  Create test file testing:
  1. Routine technical mission: signals -> requiresExecutiveDecision=false -> direct route Div2->Div4->Div5
  2. Ambiguous mission: signals -> requiresExecutiveDecision=true -> Div7 -> DecisionDelegated -> Div1 -> operational route
  3. CHAOTIC incident: signals -> requiresExecutiveDecision=true -> Div7 -> DecisionDelegated -> Div1 -> incident flow
  4. Budget exception: signals -> requiresExecutiveDecision=true -> Div7 -> DecisionDelegated -> Div1 -> Div3 route
  5. External data request: signals -> direct route Div6->Div5 (no Div7 needed)
  6. Routing latency: routine missions do not invoke Div7 decision path
  - Files: `plugin-bos-light/tests/routing-policy.test.ts`
  - Verify: All tests pass. Two-pass flow works correctly. Routine missions fast-path without Div7.

## Files Likely Touched

- plugin-bos-light/src/missionSignals.ts
- plugin-bos-light/src/routingPolicy.ts
- plugin-bos-light/src/missionRouter.ts
- plugin-bos-light/tests/routing-policy.test.ts
