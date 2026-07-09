---
estimated_steps: 1
estimated_files: 3
skills_used: []
---

# T01: Generate reconciled capability gate for M012

Create a deterministic script that reads S01 matrix and S02 reprobe, then writes runtime-evidence/M011-S03-reconciled-capability-gate.json plus markdown. The artifact must preserve historical confirmed live proofs where S02 is auth-blocked, keep current unobserved plugin/tool/runtime surfaces fallback-only, and name M012 allowed actions, blocked actions, and human confirmations.

## Inputs

- `runtime-evidence/M011-S01-capability-matrix.json`
- `runtime-evidence/M011-S02-paperclip-readonly-reprobe.json`

## Expected Output

- `scripts/generate_m011_s03_reconciled_gate.js`
- `runtime-evidence/M011-S03-reconciled-capability-gate.json`
- `runtime-evidence/M011-S03-reconciled-capability-gate.md`

## Verification

node scripts/generate_m011_s03_reconciled_gate.js

## Observability Impact

Gate artifact records allowed actions, blocked actions, required confirmations, and reconciliation notes.
