# S03: Remap Plugin Contracts

**Goal:** Update the plugin data contracts and code paths that encode division ownership, evaluation ownership, and decision ownership to the new organization model.
**Demo:** The plugin contracts, seed values, and tests compile and pass using the v1.4.1 ownership semantics instead of the old Div1.Executive and Div3.Production map.

## Must-Haves

- plugin-bos-light/src/contracts.ts uses the v1.4.1 Division union and ownership constants.
- Decision and eval-gate surfaces use the new Div7.MissionControl, Div1.HCO, Div3.Treasury, Div5.QualificationsLibraryLearning, and Div6.External names where appropriate.
- Seed/demo data and acceptance tests use the same owner semantics as the contracts.
- The plugin typecheck and test suite pass after the remap.

## Proof Level

- This slice proves: integration

## Integration Closure

The plugin code and tests share the same v1.4.1 ownership model as the doctrine docs, so contract drift is no longer hidden in constants or fixtures.

## Verification

- Typecheck and test failures will identify stale owner constants, old division names, or contract mismatches directly at the affected source file.

## Tasks

- [x] **T05: Rewrite plugin ownership contracts** `est:2h`
  Rewrite the plugin-side ownership contracts so they match the v1.4.1 doctrine package. Update the Division union, decision metadata owner, eval-gate owner, and other contract-level ownership constants so the code no longer treats Div1.Executive or Div7.Executive as canonical. Keep the change in the pure contract layer first so later tasks can update fixtures and tests against a stable type surface.
  - Files: `plugin-bos-light/src/contracts.ts`, `plugin-bos-light/src/decision.ts`, `plugin-bos-light/src/evalGates.ts`, `plugin-bos-light/src/evalGateEvidence.ts`
  - Verify: npm --prefix plugin-bos-light run typecheck

- [x] **T06: Update plugin fixtures and acceptance tests** `est:2h`
  Update the plugin demo flow and acceptance tests to use the remapped v1.4.1 owner values. Refresh the seeded producer_division defaults, blueprint/eval expectations, and any test fixtures that still assume the old v1.3 ownership strings so the test suite exercises the same contract model that T05 defines.
  - Files: `plugin-bos-light/src/integratedDemo.ts`, `plugin-bos-light/tests/acceptance.test.ts`, `plugin-bos-light/tests/blueprintArtifact.test.ts`
  - Verify: npm --prefix plugin-bos-light test

## Files Likely Touched

- plugin-bos-light/src/contracts.ts
- plugin-bos-light/src/decision.ts
- plugin-bos-light/src/evalGates.ts
- plugin-bos-light/src/evalGateEvidence.ts
- plugin-bos-light/src/integratedDemo.ts
- plugin-bos-light/tests/acceptance.test.ts
- plugin-bos-light/tests/blueprintArtifact.test.ts
