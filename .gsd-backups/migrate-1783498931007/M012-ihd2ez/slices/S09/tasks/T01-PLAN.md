---
estimated_steps: 7
estimated_files: 5
skills_used: []
---

# T01: Redact Secret Literals from S06, S07, and S08 Task Summaries

The S08 closeout gate currently shows verdict=fail with 22/25 checks because raw password and API key literals in four task summary files trigger cascading secret-scan failures across S06, S07, and S08 validators.

Replace every occurrence of the password literal `BosAdmin2026!` with `[REDACTED-PASSWORD]` and the API key prefix `pcp_board_6ef981ecf6b35d3ce8cdc8257e23689b37e52233d412d3fc` with `[REDACTED-API-KEY]` in:
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/slices/S06/tasks/T01-SUMMARY.md` (lines 25, 29)
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/slices/S06/tasks/T05-SUMMARY.md` (line 27)
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/slices/S07/tasks/T03-SUMMARY.md` (line 40)
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/slices/S08/tasks/T01-SUMMARY.md` (lines 23, 27, 35)

Use python3 for any replacement where special characters defeat the edit tool. After redaction, run the S06, S07, and S08 closeout validators to regenerate passing gate artifacts. Verify with a small Node test script that all three gate artifacts have `verdict: "pass"`.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s06_closeout.js`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s07_closeout.js`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s08_closeout.js`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/slices/S06/tasks/T01-SUMMARY.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/slices/S06/tasks/T05-SUMMARY.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/slices/S07/tasks/T03-SUMMARY.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/slices/S08/tasks/T01-SUMMARY.md`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/slices/S06/tasks/T01-SUMMARY.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/slices/S06/tasks/T05-SUMMARY.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/slices/S07/tasks/T03-SUMMARY.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/slices/S08/tasks/T01-SUMMARY.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/verify_s09_t01_redaction.js`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S06-closeout-gate.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S07-closeout-gate.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S08-closeout-gate.json`

## Verification

node /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/verify_s09_t01_redaction.js
