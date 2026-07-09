---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T02: Validate reprobe safety and classification

Create a validator that checks the S02 reprobe artifact is read-only, has no secret values, records route statuses, classifies auth/plugin blockers, and does not promote plugin host or piko tools unless supported route readback is actually observed. Run the reprobe and validator.

## Inputs

- `runtime-evidence/M011-S02-paperclip-readonly-reprobe.json`

## Expected Output

- `scripts/validate_m011_s02_reprobe.js`

## Verification

node scripts/validate_m011_s02_reprobe.js

## Observability Impact

Validator prints route count, blocker codes, and promotion count without echoing credentials.
