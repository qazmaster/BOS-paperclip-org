---
estimated_steps: 7
estimated_files: 1
skills_used: []
---

# T04: Final closeout regression pass

Expected executor skills_used: verify-before-complete, review.

Why: The slice should end with fresh evidence produced after the report, validators, and runner are in place. This prevents claiming closure from stale S05 output or partial local checks.

Do: Run the S06 regression closure runner to produce `runtime-evidence/M002-S06-regression-closure.json`. The runner should execute the full closeout suite, including S04 and S05 evidence validators, runtime capability validator and tests, M002 closeout validator and tests, runner tests, and plugin-bos-light local typecheck or test commands. If any command fails, use the recorded failing command and digest to repair the relevant earlier task output, then rerun the runner. Do not edit Paperclip core, mutate a Paperclip database, import private runtime modules, or fabricate live proof to make the artifact pass.

Failure Modes Q5: If npm dependencies are missing, report that as an environment failure in the artifact and do not claim local regression closure. If S04 or S05 evidence fails validation, restore conservative docs/matrix rather than promoting statuses. If typecheck fails, fix BOS Light plugin code or docs-contract drift only within supported boundaries.

Load Profile Q6: Local bounded regression suite; no network calls should be required and no live Paperclip mutation should occur. At 10x repeated runs, wall-clock time and local CPU are the only expected constraints.

Negative Tests Q7: The final runner must surface nonzero child exits, malformed evidence artifacts, and closeout validator overclaim failures as failed command results with redacted diagnostic digests.

Done when: the S06 regression artifact reports an overall pass and includes fresh successful results for every planned closeout command.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_m002_regression_closure.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_run_m002_regression_closure.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_m002_closeout.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_m002_closeout.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S04-live-artifact-flow.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S05-plugin-ui-surface-probe.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/package.json`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S06-regression-closure.json`

## Verification

python3 scripts/run_m002_regression_closure.py --output runtime-evidence/M002-S06-regression-closure.json

## Observability Impact

Produces the canonical final pass or fail artifact for M002 closeout with command-level evidence and redacted diagnostics.
