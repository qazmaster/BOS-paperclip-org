---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T01: Write S00 live probe script

Create scripts/run_m006_s00_runtime_capability_inventory.py following the canonical M005 S05 probe pattern (stdlib-only Python, bounded routes, redaction, timeout guards). The probe performs five sequential probes: (1) Paperclip health/version readback via GET /api/health, (2) plugin install path discovery via GET /api/companies/{companyId}/plugins and fallback admin routes, (3) tool registry readback attempting to observe piko:* tools, (4) secret materialization test for GITHUB_TOKEN_AIPAY via Hermes testEnvironment or agent env endpoint, (5) issue/document/comment regression smoke (lightweight create + readback). Each probe writes a bounded result with status_code, duration_ms, response_summary, and blocker codes when blocked. The script reads PAPERCLIP_API_KEY and PAPERCLIP_BASE_URL from environment. Output is a single canonical evidence artifact at runtime-evidence/M006-S00-runtime-capability-inventory.json. Even when fully blocked, the artifact must be schema-valid and contain precise blocker codes per fail-closed mandate.

## Inputs

- `scripts/run_s05_plugin_ui_surface_probe.py`
- `scripts/run_m005_s01_hermes_xiaomi_probe.py`
- `plugin-bos-light/manifest.paperclip-plugin.json`
- `plugin-bos-light/capabilities.paperclip-runtime.json`

## Expected Output

- `scripts/run_m006_s00_runtime_capability_inventory.py`

## Verification

test -x scripts/run_m006_s00_runtime_capability_inventory.py
