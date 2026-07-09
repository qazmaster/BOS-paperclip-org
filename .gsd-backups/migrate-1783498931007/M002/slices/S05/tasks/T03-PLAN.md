---
estimated_steps: 4
estimated_files: 1
skills_used: []
---

# T03: Generate canonical probe evidence

Expected executor skills for task-plan frontmatter: verify-before-complete, error-handling-patterns.

Why: The slice needs an actual evidence JSON, not just a runner. This task executes the bounded probe against whatever approved Paperclip sandbox configuration is available in the environment and records a truthful classification for each requested plugin and UI surface.

Do: Run the S05 probe to create `runtime-evidence/M002-S05-plugin-ui-surface-probe.json`. If live auth and supported host readback surfaces are present, capture version/build plus registered tool keys, data provider keys, action keys, piko invocation results, dashboard widget render IDs, and issue tab render IDs. If auth, plugin APIs, invocation routes, or UI render readbacks are missing, record blocked/unsupported/fallback diagnostics and keep all unproved surfaces unconfirmed. Confirm zero native approvals, zero core/DB/private import mutations, no Hermes/GSD-Pi execution, no secret-like values, and no use of S04 evidence as plugin/UI proof.

Done when: the evidence file exists, final validation passes, and every S05 surface has a concrete observed, blocked, unsupported, fallback-only, or unvalidated classification.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_s05_plugin_ui_surface_probe.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s05_plugin_ui_surface_probe.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/manifest.paperclip-plugin.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S04-live-artifact-flow.json`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S05-plugin-ui-surface-probe.json`

## Verification

python3 scripts/run_s05_plugin_ui_surface_probe.py --output runtime-evidence/M002-S05-plugin-ui-surface-probe.json && python3 scripts/validate_s05_plugin_ui_surface_probe.py --evidence runtime-evidence/M002-S05-plugin-ui-surface-probe.json --phase final

## Observability Impact

Materializes the slice proof artifact with per-surface route attempts, statuses, timestamps, redaction proof, and side-effect counters.
