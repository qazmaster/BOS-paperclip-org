---
estimated_steps: 1
estimated_files: 4
skills_used: []
---

# T03: Evidence generation and capability matrix update

Run the S01 probe against the live Paperclip sandbox to generate runtime-evidence/M006-S01-plugin-live-registration.json. Validate the artifact with the S01 validator using --allow-blocker. Inspect company-template/bos-company-template.json for any plugin field support and document findings in the evidence artifact's fallback_diagnostics. Update docs/08_RUNTIME_CAPABILITY_HEALTH.md plugin registration section with S01 timestamp and blocker codes. Update docs/M006_RUNTIME_CAPABILITY_INVENTORY.md sections 2-4 with S01 findings. Update plugin-bos-light/capabilities.paperclip-runtime.json only to append the S01 evidence reference (do not promote any capability status unless live readback proof exists). If all routes fail, accept fail-closed-unsupported immediately with precise blocker codes.

## Inputs

- `scripts/run_m006_s01_plugin_live_registration.py`
- `scripts/validate_m006_s01_plugin_live_registration.py`
- `company-template/bos-company-template.json`
- `plugin-bos-light/capabilities.paperclip-runtime.json`
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `docs/M006_RUNTIME_CAPABILITY_INVENTORY.md`

## Expected Output

- `runtime-evidence/M006-S01-plugin-live-registration.json`

## Verification

python3 scripts/validate_m006_s01_plugin_live_registration.py --evidence runtime-evidence/M006-S01-plugin-live-registration.json --allow-blocker

## Observability Impact

Evidence artifact becomes the canonical S01 runtime posture record; docs and matrix reflect current blocker state.
