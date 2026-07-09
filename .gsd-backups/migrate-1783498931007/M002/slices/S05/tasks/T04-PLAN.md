---
estimated_steps: 4
estimated_files: 6
skills_used: []
---

# T04: Publish matrix and probe ledger

Expected executor skills for task-plan frontmatter: write-docs, verify-before-complete.

Why: S06 needs the repository source of truth to reflect S05 evidence, but docs and matrix entries must not drift ahead of proof.

Do: Update `plugin-bos-light/capabilities.paperclip-runtime.json` for `plugin.runtime.version_build`, `plugin.runtime.registration`, `registration.tools`, `registration.data`, `registration.actions`, `ui.dashboard_widgets`, and `ui.issue_detail_tabs` using only S05 evidence. Promote a row to `confirmed` only when S05 evidence has live version/build and that exact surface has registration, invocation, or render readback proof; otherwise preserve or set conservative unsupported, fallback-only, or unvalidated status with the S05 diagnostic path in evidence text. Extend runtime capability validation/tests so S05 confirmations require `runtime-evidence/M002-S05-plugin-ui-surface-probe.json` and cannot be inferred from S04. Add `docs/14_PLUGIN_UI_SURFACE_PROBES.md` and update runtime health plus live validation report with worked/failed/fallback ledger, zero-approval posture, and remaining no-go gaps.

Done when: runtime capability validation and typecheck pass, docs point to the S05 evidence artifact, and no plugin/UI surface is overclaimed.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S05-plugin-ui-surface-probe.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_runtime_capabilities.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_runtime_capabilities.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S04-live-artifact-flow.json`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_runtime_capabilities.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_runtime_capabilities.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/14_PLUGIN_UI_SURFACE_PROBES.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md`

## Verification

python3 -m unittest scripts/test_validate_runtime_capabilities.py && python3 scripts/validate_runtime_capabilities.py && npm --prefix plugin-bos-light run typecheck

## Observability Impact

Updates the durable matrix and health docs so future agents can see exactly which plugin/UI surfaces have S05 proof, which failed, and which remain fallback-only.
