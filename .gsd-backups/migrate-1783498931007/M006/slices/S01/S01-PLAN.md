# S01: Plugin Live Registration

**Goal:** Paperclip sees plugin tools; tool list visible; piko:* readback proven live. No claim without readback.
**Demo:** Paperclip sees plugin tools; tool list visible; piko:* readback proven live. No claim without readback.

## Must-Haves

- 1) Evidence artifact runtime-evidence/M006-S01-plugin-live-registration.json exists and passes S01-specific validator (accepts fail-closed-blocker as valid). 2) All candidate plugin install and tool registry routes are probed with documented status codes and blocker codes. 3) Capability matrix and runtime capability inventory docs are updated with S01 evidence reference and timestamp. 4) Regression gates M6-R01 and M6-R02 pass.

## Proof Level

- This slice proves: operational

## Integration Closure

Upstream surfaces consumed: S00 probe pattern, S00 evidence artifact, capability matrix. New wiring introduced: S01 probe script, S01 validator, S01 evidence artifact. What remains before milestone usable end-to-end: S02-S10 must plan fallback-only execution paths if plugin registration remains blocked.

## Verification

- Runtime signals: structured JSON evidence artifact with per-probe results, status codes, durations, and blocker codes. Inspection surfaces: evidence artifact file, capability matrix JSON, runtime capability inventory markdown. Failure visibility: each probe records probe_id, method, path, status_code, error, and response_summary.

## Tasks

- [x] **T01: Extended route discovery probe script** `est:1h`
  Create scripts/run_m006_s01_plugin_live_registration.py extending the S00 probe pattern with broader plugin route discovery. Try routes that S00 did not cover: POST /api/plugins (install by payload), POST /api/companies/{companyId}/plugins (company-scoped install), PUT /api/plugins/bos-light (upsert), GET /api/plugins/bos-light/status or /health, GET /api/companies/{companyId}/settings/plugins, GET /api/company/{companyId}/plugins (alternate path segment), and any POST /api/admin/... routes if reachable. Include a plugin_install_attempt probe that tries safe install payloads referencing the manifest plugin key and records exact status codes. The script must be stdlib-only Python, bounded (max 32 routes, 15s timeout), redact secrets via SECRET_VALUE_RE, timeout-guarded, and always write a schema-valid artifact even when fully blocked.
  - Files: `scripts/run_m006_s01_plugin_live_registration.py`
  - Verify: python3 -m py_compile scripts/run_m006_s01_plugin_live_registration.py

- [x] **T02: S01 evidence validator** `est:45m`
  Create scripts/validate_m006_s01_plugin_live_registration.py with schema version m006-s01-plugin-live-registration/v1. Include four validation layers: JSON schema structure (required keys, probe shapes, timestamps), redaction audit (scan all text fields for unredacted secrets via SECRET_VALUE_RE), no-promotion enforcement (blocker artifacts cannot list capability_promotions), and capability matrix consistency checks against plugin-bos-light/capabilities.paperclip-runtime.json. The validator must accept --allow-blocker to treat fail-closed-blocker artifacts as valid diagnostic evidence. Pattern after scripts/validate_m006_s00_runtime_capability_inventory.py.
  - Files: `scripts/validate_m006_s01_plugin_live_registration.py`
  - Verify: python3 -m py_compile scripts/validate_m006_s01_plugin_live_registration.py

- [x] **T03: Evidence generation and capability matrix update** `est:45m`
  Run the S01 probe against the live Paperclip sandbox to generate runtime-evidence/M006-S01-plugin-live-registration.json. Validate the artifact with the S01 validator using --allow-blocker. Inspect company-template/bos-company-template.json for any plugin field support and document findings in the evidence artifact's fallback_diagnostics. Update docs/08_RUNTIME_CAPABILITY_HEALTH.md plugin registration section with S01 timestamp and blocker codes. Update docs/M006_RUNTIME_CAPABILITY_INVENTORY.md sections 2-4 with S01 findings. Update plugin-bos-light/capabilities.paperclip-runtime.json only to append the S01 evidence reference (do not promote any capability status unless live readback proof exists). If all routes fail, accept fail-closed-unsupported immediately with precise blocker codes.
  - Files: `runtime-evidence/M006-S01-plugin-live-registration.json`, `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, `docs/M006_RUNTIME_CAPABILITY_INVENTORY.md`, `plugin-bos-light/capabilities.paperclip-runtime.json`
  - Verify: python3 scripts/validate_m006_s01_plugin_live_registration.py --evidence runtime-evidence/M006-S01-plugin-live-registration.json --allow-blocker

- [x] **T04: Regression gates** `est:15m`
  Run M6-R01 handoff validation to ensure all required files are present and structurally valid. Run M6-R02 plugin unit tests to ensure no test regressions from S01 work. These gates ensure S01 probe/validator additions do not break existing validated surfaces.
  - Verify: python3 scripts/validate_handoff.py && npm --prefix plugin-bos-light test

## Files Likely Touched

- scripts/run_m006_s01_plugin_live_registration.py
- scripts/validate_m006_s01_plugin_live_registration.py
- runtime-evidence/M006-S01-plugin-live-registration.json
- docs/08_RUNTIME_CAPABILITY_HEALTH.md
- docs/M006_RUNTIME_CAPABILITY_INVENTORY.md
- plugin-bos-light/capabilities.paperclip-runtime.json
