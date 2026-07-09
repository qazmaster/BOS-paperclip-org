---
estimated_steps: 4
estimated_files: 4
skills_used: []
---

# T02: Build live probe runner and validator

Expected executor skills for task-plan frontmatter: tdd, error-handling-patterns, verify-before-complete.

Why: S05 needs its own bounded evidence artifact for plugin registration and UI surfaces. S04 issue/document/comment readbacks are useful context but cannot prove plugin load, piko invocation, data/action registration, dashboard widgets, or issue tabs.

Do: Add a standard-library Python runner that reads the manifest and runtime matrix, optionally uses `PAPERCLIP_BASE_URL`, `PAPERCLIP_API_KEY`, and related sandbox IDs from the environment, probes only a fixed small set of supported/readback route candidates, and writes S05 evidence. The schema must include runtime version/build if observed, requested manifest tools/data/actions/UI slots, observed registered keys, piko invocation results if supported, dashboard widget render IDs, issue detail tab render IDs, route attempts, side-effect counters with native approvals fixed at zero, redaction status, and fallback diagnostics. Add a validator rejecting missing required surface rows, secret-like values, nonzero approvals, S04-only proof reuse, confirmed statuses without S05 version/build/readback, malformed route responses, and unbounded evidence. Add unittest coverage for live-success fixtures, missing auth, unsupported 404 routes, malformed JSON, timeout/5xx diagnostics, missing render IDs, and redaction.

Done when: runner and validator tests pass and the validator defines a clear final contract for both positive live proof and fail-closed unsupported/fallback evidence.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/manifest.paperclip-plugin.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_s04_live_artifact_flow.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s04_live_artifact_flow.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S04-live-artifact-flow.json`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_s05_plugin_ui_surface_probe.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s05_plugin_ui_surface_probe.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_run_s05_plugin_ui_surface_probe.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_s05_plugin_ui_surface_probe.py`

## Verification

python3 -m unittest scripts/test_run_s05_plugin_ui_surface_probe.py scripts/test_validate_s05_plugin_ui_surface_probe.py

## Observability Impact

Creates the canonical S05 diagnostic artifact schema and validator so live failures become inspectable bounded evidence instead of silent skips.
