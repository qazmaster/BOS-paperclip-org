# S00: Runtime Capability Inventory — UAT

**Milestone:** M006
**Written:** 2026-06-01T06:28:48.493Z

# S00 UAT: Runtime Capability Inventory

- UAT required: no

## Purpose
This is an operational inventory slice with no user-facing GUI, browser, or public API surface. Verification is automated via probe scripts and validators.

## Preconditions
- .env contains PAPERCLIP_API_KEY and PAPERCLIP_BASE_URL
- PAPERCLIP_COMPANY_ID is available (from .env or docs/M006_RUNTIME_CAPABILITY_INVENTORY.md)
- Python 3 is available

## Verification Steps
1. Run the probe: `python3 scripts/run_m006_s00_runtime_capability_inventory.py`
2. Validate the artifact: `python3 scripts/validate_m006_s00_runtime_capability_inventory.py --evidence runtime-evidence/M006-S00-runtime-capability-inventory.json --allow-blocker`
3. Check capability consistency: `python3 scripts/validate_runtime_capabilities.py`
4. Confirm regression gates: `python3 scripts/validate_handoff.py` and `npm --prefix plugin-bos-light test`

## Expected Outcomes
- Probe produces schema-valid JSON artifact at runtime-evidence/M006-S00-runtime-capability-inventory.json
- Validator exits 0 (even for blocker artifacts with --allow-blocker)
- Runtime capabilities validator exits 0
- Handoff validator exits 0
- Plugin unit tests pass with zero failures

## Edge Cases
- Missing env vars: probe still produces valid fail-closed-blocker artifact with precise blocker codes
- Missing company ID: probe falls back to preflight-blocked artifact
- Network unreachable: probe times out and records timeout_ms with blocker code
