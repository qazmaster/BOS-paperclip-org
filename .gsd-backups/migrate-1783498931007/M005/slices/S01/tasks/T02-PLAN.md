---
estimated_steps: 3
estimated_files: 3
skills_used: []
---

# T02: Execute live plugin registration probe

Why: Plugin registration is a hard dependency for S02-S05. With `PAPERCLIP_API_KEY` now available, we can run the first live S05-style probe to attempt confirming plugin load, tool registration, data provider registration, action registration, dashboard widgets, and issue detail tabs in Paperclip.

Do: Run the existing `scripts/run_s05_plugin_ui_surface_probe.py` with live environment. The script discovers base_url, company_id, and auth from env or prior artifacts. It probes plugin registration routes and writes a bounded evidence file. Accept either confirmed surfaces or a valid fail-closed blocker artifact—both are legitimate S01 outcomes.

Done when: `runtime-evidence/M005-S01-plugin-ui-surface-probe.json` exists and passes S05 validation.

## Inputs

- `scripts/run_s05_plugin_ui_surface_probe.py`
- `plugin-bos-light/manifest.paperclip-plugin.json`
- `plugin-bos-light/capabilities.paperclip-runtime.json`

## Expected Output

- `runtime-evidence/M005-S01-plugin-ui-surface-probe.json`

## Verification

python3 scripts/run_s05_plugin_ui_surface_probe.py --output runtime-evidence/M005-S01-plugin-ui-surface-probe.json && test -f runtime-evidence/M005-S01-plugin-ui-surface-probe.json

## Observability Impact

Plugin surface probe evidence file produced with runtime version/build and route readback diagnostics.
