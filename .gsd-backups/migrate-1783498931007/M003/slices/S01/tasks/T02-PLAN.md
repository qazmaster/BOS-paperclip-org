---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T02: Implement risk-tiered classifier contract

Extend the decision contract and implement classifier behavior to satisfy the S01 fixtures. Update `DecisionMetadata` or introduce a typed decision result surface with risk tier, record detail level, domain evidence, OODA sections when warranted, structured validation errors, and sanitized diagnostics. Preserve `Div7.MissionControl`, clamp confidence into 0..1, classify mixed low-confidence evidence as DISORDER, and keep CLEAR batch approval compact.

## Inputs

- `plugin-bos-light/tests/decision.test.ts`
- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/decision.ts`

## Expected Output

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/decision.ts`

## Verification

npm --prefix plugin-bos-light test -- tests/decision.test.ts

## Observability Impact

Adds bounded diagnostic fields explaining validation failures, classification evidence, risk-tier reasons, and DISORDER uncertainty without exposing secrets or raw stack traces.
