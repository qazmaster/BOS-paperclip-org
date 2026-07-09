---
estimated_steps: 1
estimated_files: 3
skills_used: []
---

# T06: Update plugin fixtures and acceptance tests

Update the plugin demo flow and acceptance tests to use the remapped v1.4.1 owner values. Refresh the seeded producer_division defaults, blueprint/eval expectations, and any test fixtures that still assume the old v1.3 ownership strings so the test suite exercises the same contract model that T05 defines.

## Inputs

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/integratedDemo.ts`
- `plugin-bos-light/tests/acceptance.test.ts`
- `plugin-bos-light/tests/blueprintArtifact.test.ts`

## Expected Output

- `plugin-bos-light/src/integratedDemo.ts`
- `plugin-bos-light/tests/acceptance.test.ts`
- `plugin-bos-light/tests/blueprintArtifact.test.ts`

## Verification

npm --prefix plugin-bos-light test
