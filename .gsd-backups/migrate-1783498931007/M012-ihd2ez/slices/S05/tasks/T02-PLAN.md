---
estimated_steps: 7
estimated_files: 5
skills_used: []
---

# T02: Regression and S05 Closeout

Why: S05 needs a final verification gate that confirms all corrections are valid, coverage is complete, and no S04 validators were broken by the markdown edits.

Do:
1. Create `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s05_closeout.js` — aggregate validator that runs `validate_m012_s05_requirement_outcomes.js` and `validate_m012_s05_coverage.js` as subprocesses, collects their exit codes, and reports a single SUITE_RESULT PASS or FAIL.
2. Run the S05 closeout validator.
3. Run the S04 final reconciliation validator (`node /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s04_final_reconciliation.js`) to confirm markdown corrections did not break JSON-schema validation.
4. Run the S04 closeout validator (`node /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_closeout.js`) to confirm it still passes.

Done when: All S05 validators exit 0, S04 validators still pass, and the aggregate closeout validator reports SUITE_RESULT PASS.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s05_requirement_outcomes.js`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s05_coverage.js`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s04_final_reconciliation.js`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_closeout.js`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S04-final-reconciliation.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S04-closeout-gate.json`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s05_closeout.js`

## Verification

node /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s05_closeout.js && node /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s04_final_reconciliation.js && node /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_closeout.js
