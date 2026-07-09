---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T03: Create S10 validator and generate closeout gate

Create scripts/validate_m012_s10_runtime_coverage.js following the established M012 validator pattern (structured check() function with try/catch, JSON gate artifact output with verdict, checks_total, checks_passed). The validator confirms: (1) S08 validation-readiness JSON no longer lists R017/R019 as active in requirement_coverage, (2) REQUIREMENTS.md R017 and R019 notes mention M012 non-addressal, (3) S10 coverage JSON and MD exist and are valid, (4) no forbidden secret-like literals in S10 artifacts. The validator writes runtime-evidence/M012-S10-closeout-gate.json. Run the validator and confirm it exits 0.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S08-validation-readiness.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/REQUIREMENTS.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S10-runtime-requirement-coverage.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S10-runtime-requirement-coverage.md`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s10_runtime_coverage.js`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S10-closeout-gate.json`

## Verification

node /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s10_runtime_coverage.js
