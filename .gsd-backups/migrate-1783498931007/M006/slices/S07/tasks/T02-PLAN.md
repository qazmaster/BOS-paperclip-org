---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T02: Extend Div6 to persist local_path in evidence

Update div6ExternalGateway.ts so that ExternalGitEvidence includes the optional local_path field when the operation is clone or when localPath is explicitly provided. The field is written into the evidence object before emission to Div5. Done when: Div6 evidence carries local_path on clone operations and all existing Div6 tests still pass.

## Inputs

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/div6ExternalGateway.ts`

## Expected Output

- `plugin-bos-light/src/div6ExternalGateway.ts`

## Verification

cd plugin-bos-light && npx vitest run tests/div6ExternalGateway.test.ts
