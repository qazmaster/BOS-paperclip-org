---
estimated_steps: 5
estimated_files: 4
skills_used: []
---

# T05: Wire S10 into closeout regression

skills_used: tdd, verify-before-complete

Why: M002 closeout currently validates S04, S05, runtime capability posture, M002 docs, and regression unit tests. S10 needs to become part of that durable closeout chain so later milestone completion cannot silently drop runtime execution proof or fail-closed re-scope evidence.

Do: Update `scripts/run_m002_regression_closure.py` and `scripts/test_run_m002_regression_closure.py` to include the S10 final validator and S10 unit tests. Ensure the command plan remains shell-free and redacted, and keep S09 reconciliation validation in the final manual chain if S08/S09 docs were touched. Refresh `runtime-evidence/M002-S06-regression-closure.json` by running the closure runner after the S10 validator/docs/matrix updates. If plugin dependencies are missing, hydrate from the existing lockfile only; do not change package metadata unless a test failure proves it is necessary.

Integration closure: this task is the final assembly gate for S10. It must prove that local unit tests, runtime capability validation, M002 final closeout, and S10 final evidence all agree.

Done when the regression closure artifact records an overall passing verdict and includes S10 validator/test command results.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_m002_regression_closure.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_run_m002_regression_closure.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_s10_runtime_execution.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s10_runtime_execution.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S10-runtime-execution-closeout.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S10-requirement-scope-resolution.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S10-hermes-runtime-execution-proof.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S10-gsdpi-runtime-execution-proof.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s09_reconciliation.py`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_m002_regression_closure.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_run_m002_regression_closure.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S06-regression-closure.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S10-runtime-execution-closeout.json`

## Verification

python3 -m unittest scripts/test_validate_s10_runtime_execution.py scripts/test_run_m002_regression_closure.py && python3 scripts/validate_s10_runtime_execution.py --phase final --write-audit runtime-evidence/M002-S10-runtime-execution-closeout.json && python3 scripts/run_m002_regression_closure.py --output runtime-evidence/M002-S06-regression-closure.json

## Observability Impact

Extends the milestone regression artifact with S10 command results so closeout failures identify whether runtime evidence, docs/matrix posture, or regression wiring broke.
