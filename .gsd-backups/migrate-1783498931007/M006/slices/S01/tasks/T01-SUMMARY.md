---
id: T01
parent: S01
milestone: M006
key_files:
  - scripts/run_m006_s01_plugin_live_registration.py
key_decisions:
  - Extended S00 probe pattern with 5 new probes covering 13+ additional routes for plugin discovery, install, health, and tool registry
duration: 
verification_result: passed
completed_at: 2026-06-01T06:47:11.479Z
blocker_discovered: false
---

# T01: Created extended route discovery probe script for M006 S01 plugin live registration

**Created extended route discovery probe script for M006 S01 plugin live registration**

## What Happened

Implemented scripts/run_m006_s01_plugin_live_registration.py extending the S00 probe pattern with broader plugin route discovery. The script includes five probes: (1) extended_route_discovery covering GET /api/plugins/{key}/status, /health, /api/companies/{id}/settings/plugins, /api/company/{id}/plugins, and admin routes; (2) plugin_install_attempt with safe payloads for POST /api/plugins, POST /api/companies/{id}/plugins, PUT /api/plugins/{key}, and POST /api/admin/plugins; (3) tool_registry_extended with additional company-scoped and global tool paths; (4) plugin_health_deep probing worker status and runtime info; and (5) artifact_regression_smoke creating and reading back issue, document, and comment artifacts. The script is stdlib-only, bounded to max 32 routes with 15s timeout per request, redacts secrets via SECRET_VALUE_RE, is timeout-guarded, and always writes a schema-valid artifact even when fully blocked.

## Verification

Verified via python3 -m py_compile and smoke test execution. The script correctly produces a fail-closed-blocker artifact when sandbox env vars are absent, and the artifact passes schema validation.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 -m py_compile scripts/run_m006_s01_plugin_live_registration.py` | 0 | pass | 1200ms |
| 2 | `python3 scripts/run_m006_s01_plugin_live_registration.py --output /tmp/m006-s01-smoke.json` | 2 | pass - expected blocker artifact produced | 800ms |
| 3 | `python3 scripts/validate_m006_s01_plugin_live_registration.py /tmp/m006-s01-smoke.json --allow-blocker` | 0 | pass | 600ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `scripts/run_m006_s01_plugin_live_registration.py`
