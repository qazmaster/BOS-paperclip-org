---
id: S00
parent: M006
milestone: M006
provides:
  - Reusable probe script and validator for future runtime capability checks across M006 and beyond
  - Fail-closed evidence artifact showing current runtime posture: confirmed Paperclip v0.3.1 live, native issue/document/comment APIs working; blocked plugin registration, piko:* tools, GITHUB_TOKEN_AIPAY secret materialization
  - PAPERCLIP_COMPANY_ID discovered and documented for reuse by downstream slices
  - Baseline blocker codes (missing_secret_env, piko_tools_not_observed, plugin_install_endpoint_unsupported, plugin_not_found, tool_registry_endpoint_unsupported) constraining S01-S05 assumptions
requires:
  []
affects:
  []
key_files: []
key_decisions:
  - Followed canonical M005 S05 probe pattern with stdlib-only Python, bounded routes, redaction, timeout guards, and fail-closed artifact generation
  - Fixed redaction bug: _redact_value now recursively walks nested dict/list structures instead of replacing entire structures when a parent key matches SECRET_KEY_RE
  - Supplemented missing PAPERCLIP_COMPANY_ID from docs/M006_RUNTIME_CAPABILITY_INVENTORY.md when .env was missing it
  - Promoted only plugin.runtime.version_build to confirmed based on M006 S00 live evidence (version 0.3.1); kept plugin registration, tool registry, and secret materialization as blocked with precise blocker codes
  - Extended validate_runtime_capabilities.py to accept M006 S00 as an alternative evidence path for plugin.runtime.version_build
patterns_established:
  - (none)
observability_surfaces:
  - none
drill_down_paths:
  []
duration: ""
verification_result: passed
completed_at: 2026-06-01T06:28:48.493Z
blocker_discovered: false
---

# S00: Runtime Capability Inventory

**Live Paperclip runtime assumptions validated: version 0.3.1 confirmed, native artifact APIs working, plugin/tools/secret materialization blocked with precise fail-closed evidence.**

## What Happened

S00 established the baseline runtime posture for M006 by creating and executing a live probe against the Paperclip sandbox, then validating the evidence with a custom validator, updating the capability matrix, and clearing regression gates.

T01 created scripts/run_m006_s00_runtime_capability_inventory.py following the canonical M005 S05 probe pattern. The script performs five sequential probes: (1) Paperclip health/version readback, (2) plugin install path discovery with fallback routes, (3) tool registry readback for piko:* tools, (4) secret materialization test for GITHUB_TOKEN_AIPAY, and (5) lightweight issue/document/comment regression smoke with create+readback+SHA-256 hashing. It is stdlib-only Python, has bounded routes, redaction, timeout guards, and always writes a schema-valid artifact even when fully blocked.

T02 created scripts/validate_m006_s00_runtime_capability_inventory.py with four validation layers: JSON schema structure checks, redaction audit scanning all text fields for unredacted secrets, no-promotion enforcement ensuring blocker artifacts cannot list capability_promotions, and capability matrix consistency checks against plugin-bos-light/capabilities.paperclip-runtime.json.

T03 executed the live probe against https://paperclip.oysana.com using credentials from .env plus PAPERCLIP_COMPANY_ID discovered from docs/M006_RUNTIME_CAPABILITY_INVENTORY.md. The probe confirmed Paperclip runtime version 0.3.1 (P01) and verified native issue/document/comment APIs with live create+readback+hashes (P05). Plugin install path returned 404/empty array (P02), tool registry returned 404 (P03), and GITHUB_TOKEN_AIPAY was missing from environment (P04). During execution, a redaction bug was discovered and fixed: _redact_value was replacing entire dict/list structures when a parent key matched SECRET_KEY_RE, destroying probe shapes. The fix recursively walks nested structures while only redacting leaf string values.

T04 promoted plugin.runtime.version_build to confirmed in the capability matrix based on M006 S00 live evidence, extended scripts/validate_runtime_capabilities.py to accept M006 S00 as an alternative evidence path, and updated docs/08_RUNTIME_CAPABILITY_HEALTH.md and docs/M006_RUNTIME_CAPABILITY_INVENTORY.md with checkmarks, timestamps, blocker codes, and hash details.

T05 ran M6-R01 handoff validation (34 required files, exit 0) and M6-R02 plugin unit tests (280/280 passed, exit 0). Both regression gates cleared.

## Verification

All slice-level verification checks pass:
1. Evidence artifact validation: python3 scripts/validate_m006_s00_runtime_capability_inventory.py --evidence runtime-evidence/M006-S00-runtime-capability-inventory.json --allow-blocker → exit 0, 'blocker artifact OK: fail-closed diagnostics are valid'
2. Three-way capability consistency: python3 scripts/validate_runtime_capabilities.py → exit 0, 'Paperclip runtime capabilities OK'
3. M6-R01 handoff regression: python3 scripts/validate_handoff.py → exit 0, 'Handoff package OK: 34 required files; 12 v1.4.1 package files'
4. Evidence artifact exists and is structurally valid: schema_version m006-s00-runtime-capability-inventory/v1, artifact_type runtime_capability_inventory, phase runtime, 5 probes present, side_effect_counters show 1 issue, 1 document, 1 comment created with zero approvals/hermes/gsd-pi runs, no validation errors.

## Requirements Advanced

None.

## Requirements Validated

None.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Operational Readiness

None.

## Deviations

Added PAPERCLIP_COMPANY_ID from docs/M006_RUNTIME_CAPABILITY_INVENTORY.md during T03 because .env was missing it. Fixed redaction bug in probe script during T03 execution to prevent validator failure.

## Known Limitations

Plugin and tool registry endpoints return 404; bos-light plugin is not registered in the sandbox. GITHUB_TOKEN_AIPAY not present in .env, blocking secret materialization validation. Only bounded artifact regression smoke was performed; no full E2E mission cycle.

## Follow-ups

GITHUB_TOKEN_AIPAY needs to be added to .env for future secret materialization tests. S01 must attempt actual plugin registration. Re-probe after S01-S05 if credentials become available or runtime posture changes.

## Files Created/Modified

- `scripts/run_m006_s00_runtime_capability_inventory.py` — M006 S00 live probe script with five sequential probes, redaction, timeout guards, fail-closed artifact generation
- `scripts/validate_m006_s00_runtime_capability_inventory.py` — M006 S00 evidence validator with schema, redaction, no-promotion, and matrix consistency checks
- `runtime-evidence/M006-S00-runtime-capability-inventory.json` — Fail-closed blocker evidence artifact with live version 0.3.1 confirmation, working native artifact APIs, and precise blocker codes
- `plugin-bos-light/capabilities.paperclip-runtime.json` — Promoted plugin.runtime.version_build to confirmed with M006 S00 evidence; added M006 S00 regression evidence to native artifact surfaces
- `scripts/validate_runtime_capabilities.py` — Extended to accept M006 S00 as alternative evidence path for plugin.runtime.version_build
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md` — Updated C6 status, per-surface matrix, status totals, and runtime evidence section
- `docs/M006_RUNTIME_CAPABILITY_INVENTORY.md` — Updated sections 1-6, 8, and 9 with checkmarks, timestamps, blocker codes, and hash details
