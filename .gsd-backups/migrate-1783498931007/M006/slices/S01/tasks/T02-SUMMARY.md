---
id: T02
parent: S01
milestone: M006
key_files:
  - scripts/validate_m006_s01_plugin_live_registration.py
key_decisions:
  - Patterned validator after S00 with S01-specific schema, probe keys, and capability-to-matrix mappings
duration: 
verification_result: passed
completed_at: 2026-06-01T06:47:11.481Z
blocker_discovered: false
---

# T02: Created M006 S01 evidence validator with four validation layers and capability matrix consistency checks

**Created M006 S01 evidence validator with four validation layers and capability matrix consistency checks**

## What Happened

Implemented scripts/validate_m006_s01_plugin_live_registration.py with schema version m006-s01-plugin-live-registration/v1. The validator provides four validation layers: (1) JSON schema structure validation checking required keys, probe shapes, timestamps, and result structures; (2) redaction audit scanning all text fields for unredacted secrets via SECRET_VALUE_RE; (3) no-promotion enforcement ensuring blocker artifacts cannot list capability_promotions; and (4) capability matrix consistency checks against plugin-bos-light/capabilities.paperclip-runtime.json mapping promoted capabilities to matrix keys. The validator accepts --allow-blocker to treat fail-closed-blocker artifacts as valid diagnostic evidence (exit 0). Invalid artifacts return exit 1 with a validation_errors list. Patterned after the S00 validator with S01-specific probe keys and capability mappings.

## Verification

Verified via python3 -m py_compile and end-to-end smoke test validating a generated blocker artifact.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 -m py_compile scripts/validate_m006_s01_plugin_live_registration.py` | 0 | pass | 1100ms |
| 2 | `python3 scripts/run_m006_s01_plugin_live_registration.py --output /tmp/m006-s01-smoke.json && python3 scripts/validate_m006_s01_plugin_live_registration.py /tmp/m006-s01-smoke.json --allow-blocker` | 0 | pass | 1500ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `scripts/validate_m006_s01_plugin_live_registration.py`
