---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T02: S01 evidence validator

Create scripts/validate_m006_s01_plugin_live_registration.py with schema version m006-s01-plugin-live-registration/v1. Include four validation layers: JSON schema structure (required keys, probe shapes, timestamps), redaction audit (scan all text fields for unredacted secrets via SECRET_VALUE_RE), no-promotion enforcement (blocker artifacts cannot list capability_promotions), and capability matrix consistency checks against plugin-bos-light/capabilities.paperclip-runtime.json. The validator must accept --allow-blocker to treat fail-closed-blocker artifacts as valid diagnostic evidence. Pattern after scripts/validate_m006_s00_runtime_capability_inventory.py.

## Inputs

- `scripts/validate_m006_s00_runtime_capability_inventory.py`
- `plugin-bos-light/capabilities.paperclip-runtime.json`

## Expected Output

- `scripts/validate_m006_s01_plugin_live_registration.py`

## Verification

python3 -m py_compile scripts/validate_m006_s01_plugin_live_registration.py

## Observability Impact

Validator produces exit 0 for valid artifacts (including fail-closed) and exit 1 with validation_errors list for invalid ones.
