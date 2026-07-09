---
estimated_steps: 9
estimated_files: 2
skills_used: []
---

# T03: Run validation round one and refresh aggregate closure

Why: S13 is complete only when the reconciled coverage ledger, docs, and aggregate closure runner have been exercised together and recorded as validation round 1 evidence. This task produces the durable closeout artifacts; it does not add new runtime claims.

Expected task-plan frontmatter: estimated_steps: 5; estimated_files: 2; skills_used: [verify-before-complete, test].

Do: Run the S13 unit tests and aggregate runner tests together. Run scripts/validate_s13_requirement_coverage.py in final phase with --write-audit runtime-evidence/M002-S13-validation-closeout.json. Then run scripts/run_m002_regression_closure.py with --output runtime-evidence/M002-S06-regression-closure.json so the aggregate closure artifact includes the S13 gate after S12. Inspect the resulting JSON summaries before marking done: S13 audit must pass, validation_round must be 1, verification classes must include Contract, Integration, Operational, and UAT, and aggregate closure must pass with no failing commands and no redaction, shell string, core patch, direct DB mutation, private import, unsupported path, or runtime promotion findings.

Threat Surface Q3: The final artifacts become closeout evidence, so failures must be explicit rather than suppressed. Do not trim or hand-edit command failures into pass states.

Requirement Impact Q4: final re-verification covers active R012, R013, R014, and R015 coverage plus preservation of validated R009, R010, and R011 posture.

Failure Modes Q5: If unit tests fail, return to T01 or T02 depending on whether the failure is validator contract or runner wiring. If S13 final audit fails, fix the named ledger or docs mismatch. If aggregate closure fails outside S13, preserve the failure evidence and do not mark the task complete.

Load Profile Q6: bounded local subprocesses only; no network, no Paperclip runtime, no long-running service.

Negative Tests Q7: covered by T01 and T02 tests; this task proves they run as part of validation round 1.

Done when: both closeout artifacts exist, both report pass, and the aggregate closure command list contains the S13 gate in the required post-S12 position.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S13-requirement-coverage.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s13_requirement_coverage.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_s13_requirement_coverage.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/.gsd/milestones/M002/M002-CONTEXT.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/.gsd/milestones/M002/M002-ASSESSMENT.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/.gsd/milestones/M002/slices/S13/S13-ASSESSMENT.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_m002_regression_closure.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_run_m002_regression_closure.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S12-runtime-proof-or-rescope.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S12-validation-closeout.json`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S13-validation-closeout.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S06-regression-closure.json`

## Verification

python3 -m unittest scripts/test_validate_s13_requirement_coverage.py scripts/test_run_m002_regression_closure.py && python3 scripts/validate_s13_requirement_coverage.py --phase final --ledger runtime-evidence/M002-S13-requirement-coverage.json --write-audit runtime-evidence/M002-S13-validation-closeout.json && python3 scripts/run_m002_regression_closure.py --output runtime-evidence/M002-S06-regression-closure.json

## Observability Impact

Produces the final S13 audit and refreshed aggregate closure artifact. These files are the primary inspection surfaces for M002 validation and future troubleshooting.
