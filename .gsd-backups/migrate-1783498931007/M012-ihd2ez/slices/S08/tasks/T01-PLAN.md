---
estimated_steps: 7
estimated_files: 3
skills_used: []
---

# T01: Secret Scan Remediation and S06/S07 Validator Pass

Redact raw credential literals from S06 and S07 task summary files that cause closeout validator secret-scan failures.

Steps:
1. Edit `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/slices/S06/tasks/T01-SUMMARY.md`: replace `BosAdmin2026!` with `[REDACTED-PASSWORD]` on lines 25 and 29. Replace the regex pattern `/BosAdmin[^\\s\"]{6,}/` in the verification evidence table (line 36) with `/[REDACTED-PASSWORD-PATTERN]/`.
2. Edit `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/slices/S06/tasks/T05-SUMMARY.md`: replace `BosAdmin2026!` with `[REDACTED-PASSWORD]` and replace the API key prefix `pcp_board_6ef981ecf6b35d3ce8cdc8257e23689b37e52233d412d3fc` with `[REDACTED-API-KEY]` on line 27.
3. Edit `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/slices/S07/tasks/T03-SUMMARY.md`: replace `BosAdmin2026!` with `[REDACTED-PASSWORD]` on line 40.
4. Run `node scripts/validate_m012_s06_closeout.js` and confirm 31/31 checks pass.
5. Run `node scripts/validate_m012_s07_closeout.js` and confirm 27/27 checks pass.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/slices/S06/tasks/T01-SUMMARY.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/slices/S06/tasks/T05-SUMMARY.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/slices/S07/tasks/T03-SUMMARY.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s06_closeout.js`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s07_closeout.js`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/slices/S06/tasks/T01-SUMMARY.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/slices/S06/tasks/T05-SUMMARY.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/slices/S07/tasks/T03-SUMMARY.md`

## Verification

node scripts/validate_m012_s06_closeout.js && node scripts/validate_m012_s07_closeout.js
