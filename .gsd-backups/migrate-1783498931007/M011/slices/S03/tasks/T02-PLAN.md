---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T02: Validate M012 gate invariants

Create a validator that checks S03 gate shape, allowed/blocked action lists, no direct external mutations without confirmation, no plugin/Hermes/GSD-Pi promotion, and preservation of auth-blocked current reprobe status. Run generator and validator.

## Inputs

- `runtime-evidence/M011-S03-reconciled-capability-gate.json`

## Expected Output

- `scripts/validate_m011_s03_reconciled_gate.js`

## Verification

node scripts/validate_m011_s03_reconciled_gate.js

## Observability Impact

Validator prints allowed count, blocked count, required confirmations, and invariant failures.
