---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T02: Implement E2E evidence validator

Create a validator that accepts either passing E2E evidence or a fail-closed blocker. Passing evidence must include terminal status, resultJson.bos schema validity, native Paperclip artifact readback, side-effect accounting, and capability-promotion justification. The validator must reject stdout-only Hermes evidence.

## Inputs

- `runtime-evidence/M014-S05-bounded-e2e-contract.json`

## Expected Output

- `scripts/validate_m014_s05_bounded_e2e.js`

## Verification

node --test scripts/validate_m014_s05_bounded_e2e.js

## Observability Impact

Prevents future E2E overclaims from passing validation.
