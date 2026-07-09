---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T04: S06 Aggregate Closeout Validator

Create scripts/validate_m012_s06_closeout.js that runs a comprehensive validation suite: (1) M012-S06-session-auth-readback.json schema and content checks (company_visible=true, issues_visible=true, BOS-3 present), (2) M012-S06-mission-issue-evidence.json schema and content checks (liveIssueId non-null, deviation note present), (3) M012-S06-requirement-update-evidence.json presence and correctness, (4) M012-S04-requirement-outcomes.md has no forbidden phrases, (5) re-runs S05 closeout validator to ensure no regression. The script writes runtime-evidence/M012-S06-closeout-gate.json with verdict and evidence. Run the validator.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S06-session-auth-readback.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S06-mission-issue-evidence.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S06-requirement-update-evidence.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s05_closeout.js`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s06_closeout.js`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S06-closeout-gate.json`

## Verification

node /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s06_closeout.js
