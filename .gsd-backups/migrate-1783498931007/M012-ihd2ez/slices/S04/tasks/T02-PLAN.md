---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T02: Update Requirement Outcomes Truthfully

Use GSD requirement update tooling to update notes, validation, or status for requirements touched by M012. Mark requirements validated only when M012 evidence satisfies the actual requirement wording; otherwise leave active and add precise notes. R017 and R019 should remain active or blocked unless plugin runtime and Hermes execution receive fresh proof, which is outside M012 scope.

## Inputs

- `.gsd/REQUIREMENTS.md`

## Expected Output

- `runtime-evidence/M012-S04-requirement-outcomes.md`

## Verification

test -s runtime-evidence/M012-S04-requirement-outcomes.md

## Observability Impact

Records requirement IDs, evidence paths, status transitions, and rationale for active or blocked requirements.
