---
estimated_steps: 7
estimated_files: 3
skills_used: []
---

# T04: Validate evidence and update capability matrix

Why: The capability matrix (`capabilities.paperclip-runtime.json`) is the source of truth for what surfaces are confirmed. Per MEM058, only bounded live evidence with version/build plus surface-specific readback may promote a capability. S01 must update the matrix for any surfaces that gained live proof, and leave others unchanged.

Do:
1. Run `python3 scripts/validate_s05_plugin_ui_surface_probe.py --evidence runtime-evidence/M005-S01-plugin-ui-surface-probe.json --phase final` to validate plugin probe evidence.
2. Run `python3 scripts/validate_m005_s01_hermes_xiaomi_probe.py --evidence runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe.json --allow-blocker` to validate Hermes evidence.
3. Update `plugin-bos-light/capabilities.paperclip-runtime.json`: for each confirmed surface from the plugin probe, update status to `confirmed`, set `evidence_source` and `proof_command` to point to the M005-S01 evidence file. For Hermes, add or update a `hermes.execution.xiaomi` row with status based on evidence. For any remaining unvalidated surfaces, leave them unchanged.
4. Write `runtime-evidence/M005-S01-evidence-summary.json` with classified results from both probes, updated capability keys, and blocker codes if any.

Done when: Both validators pass (exit 0), the capability matrix is updated on disk, and the summary evidence file exists.

## Inputs

- `runtime-evidence/M005-S01-plugin-ui-surface-probe.json`
- `runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe.json`
- `plugin-bos-light/capabilities.paperclip-runtime.json`

## Expected Output

- `plugin-bos-light/capabilities.paperclip-runtime.json`
- `runtime-evidence/M005-S01-evidence-summary.json`

## Verification

python3 scripts/validate_s05_plugin_ui_surface_probe.py --evidence runtime-evidence/M005-S01-plugin-ui-surface-probe.json --phase final && python3 scripts/validate_m005_s01_hermes_xiaomi_probe.py --evidence runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe.json --allow-blocker && test -f runtime-evidence/M005-S01-evidence-summary.json

## Observability Impact

Capability matrix updated with evidence-backed statuses; summary artifact provides single-file S01 posture readout.
