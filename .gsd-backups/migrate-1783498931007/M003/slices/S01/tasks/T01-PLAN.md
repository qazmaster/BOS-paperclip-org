---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T01: Add decision contract fixture tests

Add focused S01 fixture coverage before implementation changes. Create `plugin-bos-light/tests/decision.test.ts` with cases for CLEAR batch approval, COMPLICATED policy and budget exceptions, COMPLEX ambiguous strategy, CHAOTIC outage or circuit breaker OPEN, DISORDER mixed or underdetermined signals, confidence clamping, deterministic `now`, markdown rendering, and invalid input errors. Tests should assert the contract shape that downstream S02/S03 will consume, not implementation internals.

## Inputs

- `plugin-bos-light/src/decision.ts`
- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/package.json`

## Expected Output

- `plugin-bos-light/tests/decision.test.ts`

## Verification

npm --prefix plugin-bos-light test -- tests/decision.test.ts

## Observability Impact

Negative tests define the diagnostic surface for invalid input and DISORDER classification before implementation starts.
