---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T01: Extended route discovery probe script

Create scripts/run_m006_s01_plugin_live_registration.py extending the S00 probe pattern with broader plugin route discovery. Try routes that S00 did not cover: POST /api/plugins (install by payload), POST /api/companies/{companyId}/plugins (company-scoped install), PUT /api/plugins/bos-light (upsert), GET /api/plugins/bos-light/status or /health, GET /api/companies/{companyId}/settings/plugins, GET /api/company/{companyId}/plugins (alternate path segment), and any POST /api/admin/... routes if reachable. Include a plugin_install_attempt probe that tries safe install payloads referencing the manifest plugin key and records exact status codes. The script must be stdlib-only Python, bounded (max 32 routes, 15s timeout), redact secrets via SECRET_VALUE_RE, timeout-guarded, and always write a schema-valid artifact even when fully blocked.

## Inputs

- `scripts/run_m006_s00_runtime_capability_inventory.py`
- `plugin-bos-light/manifest.paperclip-plugin.json`
- `plugin-bos-light/src/worker.ts`
- `runtime-evidence/M006-S00-runtime-capability-inventory.json`

## Expected Output

- `scripts/run_m006_s01_plugin_live_registration.py`

## Verification

python3 -m py_compile scripts/run_m006_s01_plugin_live_registration.py

## Observability Impact

Probe script writes structured JSON artifact with per-route status codes, durations, and blocker codes.
