---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T02: Validate matrix proof gates

Create a validator that checks matrix shape, required capabilities, evidence references, and proof-gate invariants. It must fail if plugin host, piko tools, Hermes, or GSD-Pi are classified as confirmed without runtime-execution-proof evidence. Run generator and validator to produce S01 evidence.

## Inputs

- `runtime-evidence/M011-S01-capability-matrix.json`
- `scripts/generate_m011_capability_matrix.js`

## Expected Output

- `scripts/validate_m011_capability_matrix.js`

## Verification

node scripts/validate_m011_capability_matrix.js

## Observability Impact

Validator prints status counts and invariant failures without exposing secrets.
