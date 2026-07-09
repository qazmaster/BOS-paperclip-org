---
estimated_steps: 1
estimated_files: 4
skills_used: []
---

# T01: Generate Final Reconciliation Artifact

Create a final M012 reconciliation generator and validator. The artifact must aggregate S01 through S03 evidence, identify what was proven live, what was proven locally, what remained blocked, and which capability rows must not be promoted. It must fail validation if plugin host, piko tools, Hermes, GSD-Pi, GitHub, Telegram, unsupported comments, or unsupported documents are promoted without fresh independent proof.

## Inputs

- `runtime-evidence/M011-S03-reconciled-capability-gate.json`

## Expected Output

- `runtime-evidence/M012-S04-final-reconciliation.json`
- `runtime-evidence/M012-S04-final-reconciliation.md`

## Verification

node scripts/validate_m012_s04_final_reconciliation.js

## Observability Impact

Records capability deltas, requirement outcomes, blocker inventory, validation status, and evidence paths.
