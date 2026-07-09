---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T02: Write S00 evidence validator

Create scripts/validate_m006_s00_runtime_capability_inventory.py (stdlib-only Python) that validates the S00 evidence artifact against schema version m006-s00-runtime-capability-inventory/v1. Validation layers: (1) JSON schema structure checks (required top-level keys, probe array shape, timestamp validity), (2) redaction audit scanning all text fields for unredacted secrets using the same SECRET_VALUE_RE pattern as probe scripts, (3) no-promotion enforcement ensuring blocker artifacts cannot promote capabilities to confirmed, (4) capability matrix consistency check against plugin-bos-light/capabilities.paperclip-runtime.json if the artifact claims promotions. The validator exits 0 on valid evidence (including valid blocker artifacts), exits 1 on schema violations or redaction failures, and prints structured diagnostics. Supports --evidence and --allow-blocker CLI flags.

## Inputs

- `scripts/validate_runtime_capabilities.py`
- `scripts/validate_s05_plugin_ui_surface_probe.py`
- `plugin-bos-light/capabilities.paperclip-runtime.json`

## Expected Output

- `scripts/validate_m006_s00_runtime_capability_inventory.py`

## Verification

test -x scripts/validate_m006_s00_runtime_capability_inventory.py
