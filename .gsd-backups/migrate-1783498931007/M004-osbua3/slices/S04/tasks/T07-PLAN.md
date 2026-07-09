---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T07: Update persistence and acceptance docs

Update the persistence matrix and acceptance test documentation to reflect the v1.4.1 doctrine. The new content should make the Div6-only external-world rule, Div5 quarantine rule, Div1 routing control, and the A12-A20 acceptance set visible to future agents while keeping the repository-local, fixture-first proof boundary explicit.

## Inputs

- `docs/05_PERSISTENCE_MATRIX.md`
- `docs/06_ACCEPTANCE_TESTS.md`
- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/integratedDemo.ts`

## Expected Output

- `docs/05_PERSISTENCE_MATRIX.md`
- `docs/06_ACCEPTANCE_TESTS.md`

## Verification

python3 scripts/validate_runtime_capabilities.py
