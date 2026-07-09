---
estimated_steps: 7
estimated_files: 2
skills_used: []
---

# T02: Regression closure runner and evidence artifact

Expected executor skills_used: verify-before-complete, tdd.

Why: The final milestone closeout needs one durable command that future agents can rerun and one machine-readable artifact proving which local regressions passed or failed. Shell transcript prose is too easy to lose or overstate.

Do: Add `scripts/run_m002_regression_closure.py` using Python standard library subprocess calls without shell expansion. It should run the S04 evidence validator, S05 evidence validator, runtime capability validator, closeout validator, relevant unittest suites, and plugin-bos-light typecheck or tests as explicit command arrays. The runner should write `runtime-evidence/M002-S06-regression-closure.json` with command, exit code, duration, verdict, redacted stdout/stderr digest, started/completed timestamps, and a top-level `overall_verdict`. It must not print or persist secret values; keep only secret key names if any are observed. Add `scripts/test_run_m002_regression_closure.py` covering command plan construction, fail-fast or aggregate failure behavior, redaction, JSON schema shape, and nonzero exit-code reporting.

Failure Modes Q5: If a child command exits nonzero, record the failing command and continue only if the runner is intentionally aggregate-mode; otherwise fail closed. If output contains secret-looking values, redact before artifact write. If the artifact path parent is missing, fail with a clear filesystem error rather than creating unexpected directories outside the repo.

Load Profile Q6: Shared resources are local CPU and Node/Python process startup. Per-operation cost is a bounded command list over local files. At 10x usage the first breakpoint is wall-clock time from repeated npm typecheck/test runs, not network or database load.

Negative Tests Q7: Simulated command failure, timeout if implemented, malformed command result, secret-looking stdout, empty command plan, and unwritable output path.

Done when: the runner unit tests pass and the runner is ready for the final task to produce the canonical S06 regression closure JSON artifact.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_m002_closeout.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_runtime_capabilities.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_runtime_capabilities.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s04_live_artifact_flow.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s05_plugin_ui_surface_probe.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_s04_live_artifact_flow.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_s05_plugin_ui_surface_probe.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S04-live-artifact-flow.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S05-plugin-ui-surface-probe.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/package.json`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_m002_regression_closure.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_run_m002_regression_closure.py`

## Verification

python3 -m unittest scripts/test_run_m002_regression_closure.py

## Observability Impact

Adds a single JSON evidence artifact format with per-command verdicts and redacted digests so future agents can identify the exact failing closeout gate.
