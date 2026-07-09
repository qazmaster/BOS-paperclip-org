---
estimated_steps: 1
estimated_files: 3
skills_used: []
---

# T01: Descope R017 and R019 in validation-readiness JSON and REQUIREMENTS.md

Read the S08 validation-readiness JSON and REQUIREMENTS.md. Update the requirement_coverage entries for R017 and R019: set m012_status to "descoped", status_change to "descoped-from-m012", and update assessment with honest rationale documenting M012 scope boundaries (native Paperclip issue flow and local BOS Light orchestration) and external blockers. Add M012 non-addressal notes to the R017 and R019 sections in REQUIREMENTS.md. Create and run a node:test verification script that asserts the descoping language is present in both files.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S08-validation-readiness.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/REQUIREMENTS.md`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/verify_m012_s10_t01.js`

## Verification

node --test /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/verify_m012_s10_t01.js
