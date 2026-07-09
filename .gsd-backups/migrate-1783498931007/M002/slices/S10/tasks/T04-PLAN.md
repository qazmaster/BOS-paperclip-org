---
estimated_steps: 5
estimated_files: 6
skills_used: []
---

# T04: Reconcile docs and capability posture

skills_used: write-docs, verify-before-complete, security-review

Why: After fresh Hermes and GSD-Pi evidence exists, the reader-facing docs, capability matrix, and requirement posture must say exactly what was proven and what remained blocked. This is where S10 either promotes exact proven runtime execution rows or explicitly re-scopes/non-promotes the milestone without drifting away from R009, R010, and R011.

Do: Read the two S10 proof artifacts and update `PAPERCLIP_LIVE_VALIDATION_REPORT.md`, `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, and `plugin-bos-light/capabilities.paperclip-runtime.json`. If Hermes proof passed, promote only the Hermes execution surface and cite `runtime-evidence/M002-S10-hermes-runtime-execution-proof.json`; otherwise record the S10 blocker and keep Hermes unvalidated/fallback-only. If GSD-Pi proof passed, promote only the gsdpi_local execution surface and cite `runtime-evidence/M002-S10-gsdpi-runtime-execution-proof.json`; otherwise record the registration/execution blocker and keep GSD-Pi unvalidated/fallback-only. If proof remains unavailable, write `runtime-evidence/M002-S10-requirement-scope-resolution.json` documenting whether R009/R010/R011 already cover the conservative outcome or whether the executor used `gsd_requirement_update` to explicitly re-scope validation notes. Do not broaden requirements or success criteria without evidence, and do not edit `.gsd/REQUIREMENTS.md` manually.

Requirement impact: R009 must still prevent capability promotion drift, R010 must preserve `wakeCountDelta=1` or explicit non-proof if unmeasurable, and R011 must preserve no-core/no-private/no-plaintext/no-direct-DB boundaries.

Done when the final S10 validator passes and docs/matrix contain no unsupported runtime execution claims.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S10-hermes-runtime-execution-proof.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S10-gsdpi-runtime-execution-proof.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s10_runtime_execution.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_runtime_capabilities.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_runtime_capabilities.py`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S10-requirement-scope-resolution.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S10-runtime-execution-closeout.json`

## Verification

python3 scripts/validate_s10_runtime_execution.py --phase final --write-audit runtime-evidence/M002-S10-runtime-execution-closeout.json && python3 scripts/validate_runtime_capabilities.py && python3 scripts/validate_m002_closeout.py --phase final

## Observability Impact

Adds final S10 scope-resolution and closeout JSON that future agents can inspect to know whether proof was produced, blocked, or re-scoped and which docs/matrix rows were updated.
