---
estimated_steps: 1
estimated_files: 4
skills_used: []
---

# T05: Rewrite plugin ownership contracts

Rewrite the plugin-side ownership contracts so they match the v1.4.1 doctrine package. Update the Division union, decision metadata owner, eval-gate owner, and other contract-level ownership constants so the code no longer treats Div1.Executive or Div7.Executive as canonical. Keep the change in the pure contract layer first so later tasks can update fixtures and tests against a stable type surface.

## Inputs

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/decision.ts`
- `plugin-bos-light/src/evalGates.ts`
- `plugin-bos-light/src/evalGateEvidence.ts`
- `docs/04_DATA_CONTRACTS.md`

## Expected Output

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/decision.ts`
- `plugin-bos-light/src/evalGates.ts`
- `plugin-bos-light/src/evalGateEvidence.ts`

## Verification

npm --prefix plugin-bos-light run typecheck
