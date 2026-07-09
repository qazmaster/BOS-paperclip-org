---
estimated_steps: 1
estimated_files: 3
skills_used: []
---

# T03: Run Final Regression and Closeout Gate

Run all M012 evidence validators plus the relevant plugin-bos-light regression suite and typecheck. Write a closeout gate artifact containing commands, exit codes, evidence paths, known limitations, and downstream recommendations. Do not mark the slice or milestone complete unless verification output is fresh and passing.

## Inputs

- `runtime-evidence/M011-S03-reconciled-capability-gate.json`
- `plugin-bos-light/package.json`

## Expected Output

- `runtime-evidence/M012-S04-closeout-gate.json`
- `runtime-evidence/M012-S04-closeout-gate.md`

## Verification

node scripts/validate_m012_closeout.js

## Observability Impact

Records command evidence, exit codes, verifier verdicts, remaining blockers, and downstream M013 recommendations.
