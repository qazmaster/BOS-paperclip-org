---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T03: Extend Div5 to propagate local_path through snapshot and gate_decision

Update div5Quarantine.ts so that SanitizedRepoSnapshot copies local_path from ExternalGitEvidence when present, and the gate_decision payload forwarded to Div4.Production includes local_path from the snapshot. This closes the handoff gap discovered in S07 research. Done when: Div5 snapshot and gate_decision include local_path and all existing Div5 tests still pass.

## Inputs

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/div5Quarantine.ts`
- `plugin-bos-light/src/div6ExternalGateway.ts`

## Expected Output

- `plugin-bos-light/src/div5Quarantine.ts`

## Verification

cd plugin-bos-light && npx vitest run tests/div5Quarantine.test.ts
