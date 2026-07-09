---
id: T02
parent: S00
milestone: M006
key_files:
  - scripts/validate_m006_s00_runtime_capability_inventory.py
key_decisions:
  - Used exact SECRET_VALUE_RE and SECRET_KEY_RE patterns from the probe script to ensure redaction audit parity.
  - Defined CAPABILITY_TO_MATRIX_KEY mapping to bridge M006 S00 promotion identifiers to plugin-bos-light/capabilities.paperclip-runtime.json keys for consistency checks.
  - Accept empty probes in blocker artifacts when live_probe_enabled=false, matching the probe script's preflight-blocked behavior.
duration: 
verification_result: passed
completed_at: 2026-06-01T06:05:40.973Z
blocker_discovered: false
---

# T02: Created M006 S00 runtime capability inventory validator with schema, redaction, no-promotion, and matrix consistency checks.

**Created M006 S00 runtime capability inventory validator with schema, redaction, no-promotion, and matrix consistency checks.**

## What Happened

Created scripts/validate_m006_s00_runtime_capability_inventory.py (stdlib-only Python) that validates the M006-S00 runtime capability inventory evidence artifact against schema version m006-s00-runtime-capability-inventory/v1. Implemented four validation layers: (1) JSON schema structure checks for required top-level keys, probe shapes, result fields, readback fields, timestamp validity, and runner metadata; (2) redaction audit that walks all JSON text fields scanning for unredacted secrets using the exact SECRET_VALUE_RE pattern from the probe script; (3) no-promotion enforcement ensuring fail-closed-blocker artifacts cannot list capability_promotions and live-evidence must list them; (4) capability matrix consistency check against plugin-bos-light/capabilities.paperclip-runtime.json when promotions are claimed, mapping M006 S00 promotion identifiers to matrix keys and rejecting promotions mapped to unsupported statuses. The validator supports --evidence and --allow-blocker CLI flags, exits 0 on valid evidence (including valid blocker artifacts), exits 1 on schema violations or redaction failures, and can write a structured validator-audit JSON via --write-audit. Preflight-blocked blocker artifacts with empty probes (live_probe_enabled=false) are accepted as valid fail-closed evidence.

## Verification

Ran validator against existing M006-S00-runtime-capability-inventory.json blocker artifact: passes with exit 0. Tested redaction violation detection with injected secret: fails with exit 1. Tested fake passing artifact with inconsistent promotions vs probe results: fails correctly. Tested fake passing artifact with consistent promotions and valid probes: passes with exit 0. Tested blocker artifact with capability_promotions: fails with exit 1. Verified script is executable.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 scripts/validate_m006_s00_runtime_capability_inventory.py --evidence runtime-evidence/M006-S00-runtime-capability-inventory.json --allow-blocker` | 0 | ✅ pass | 150ms |
| 2 | `python3 scripts/validate_m006_s00_runtime_capability_inventory.py --evidence /tmp/m006-s00-bad-evidence.json` | 1 | ✅ pass (redaction correctly rejected) | 120ms |
| 3 | `python3 scripts/validate_m006_s00_runtime_capability_inventory.py --evidence /tmp/m006-s00-fake-pass2.json` | 1 | ✅ pass (internal consistency correctly rejected) | 130ms |
| 4 | `python3 scripts/validate_m006_s00_runtime_capability_inventory.py --evidence /tmp/m006-s00-fake-pass3.json` | 0 | ✅ pass (valid passing artifact accepted) | 140ms |
| 5 | `python3 scripts/validate_m006_s00_runtime_capability_inventory.py --evidence /tmp/m006-s00-blocker-with-promo.json --allow-blocker` | 1 | ✅ pass (no-promotion enforcement correctly rejected) | 110ms |
| 6 | `test -x scripts/validate_m006_s00_runtime_capability_inventory.py` | 0 | ✅ pass | 50ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `scripts/validate_m006_s00_runtime_capability_inventory.py`
