---
estimated_steps: 4
estimated_files: 10
skills_used: []
---

# T05: Run closeout regression chain

Expected executor skills for task-plan frontmatter: verify-before-complete, review.

Why: S05 touches runtime guardrails, docs, Python validators, and TypeScript worker seams. A final regression task catches integration drift before the slice can be marked complete.

Do: Run focused TypeScript registration probe tests, S05 runner/validator tests, final S05 evidence validator, runtime capability validator tests, runtime capability validator, and plugin typecheck. Inspect failures for overclaims first: confirmed statuses without S05 proof, secrets in evidence/docs, nonzero approvals, accidental Hermes/GSD-Pi execution, or any Paperclip core/private import dependency. Do not create commits.

Done when: the full closeout command passes and evidence/docs/matrix state is ready for S06.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/src/registrationProbe.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/tests/registrationProbe.test.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_s05_plugin_ui_surface_probe.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s05_plugin_ui_surface_probe.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_run_s05_plugin_ui_surface_probe.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_s05_plugin_ui_surface_probe.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_runtime_capabilities.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S05-plugin-ui-surface-probe.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/14_PLUGIN_UI_SURFACE_PROBES.md`

## Expected Output

- Update the implementation and proof artifacts needed for this task.

## Verification

npm --prefix plugin-bos-light test -- registrationProbe && python3 -m unittest scripts/test_run_s05_plugin_ui_surface_probe.py scripts/test_validate_s05_plugin_ui_surface_probe.py scripts/test_validate_runtime_capabilities.py && python3 scripts/validate_s05_plugin_ui_surface_probe.py --evidence runtime-evidence/M002-S05-plugin-ui-surface-probe.json --phase final && python3 scripts/validate_runtime_capabilities.py && npm --prefix plugin-bos-light run typecheck

## Observability Impact

Provides final fresh verification evidence that all S05 diagnostics, validators, matrix posture, and TypeScript seams are coherent.
