---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T04: Comprehensive Div5 quarantine tests

Create plugin-bos-light/tests/div5Quarantine.test.ts covering: caller auth rejection for all non-Div5 divisions (Div1, Div2, Div3, Div4, Div6, Div7); missing completion_report in inbox; evidence validation failures (wrong trust_level, missing git_evidence); git failure rejection (success false); secret scan detection (inject fake secret pattern in redacted_diagnostics); secret scan pass (clean diagnostics); snapshot trust_level correctness (sanitized on approval, rejected on failure); packet emission paths (gate_decision to Div4 on approval, escalation to Div1 on rejection, status_update to Div1 in both cases); test isolation via clearPacketRouter() before each test.

## Inputs

- `plugin-bos-light/src/div5Quarantine.ts`
- `plugin-bos-light/src/divisionPacketRouter.ts`
- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/div6ExternalGateway.ts`

## Expected Output

- `plugin-bos-light/tests/div5Quarantine.test.ts`

## Verification

npx vitest run plugin-bos-light/tests/div5Quarantine.test.ts
