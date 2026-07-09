---
id: T01
parent: S00
milestone: M006
key_files:
  - scripts/run_m006_s00_runtime_capability_inventory.py
key_decisions:
  - Followed canonical M005 S05 probe pattern with stdlib-only Python, bounded routes, redaction, and timeout guards.
  - Implemented five sequential probes mapping to health/version, plugin path, tool registry, secret materialization, and artifact regression smoke.
  - Used fail-closed design: always writes schema-valid artifact even when fully blocked, with precise blocker codes.
duration: 
verification_result: passed
completed_at: 2026-06-01T05:56:13.141Z
blocker_discovered: false
---

# T01: Created scripts/run_m006_s00_runtime_capability_inventory.py following canonical M005 S05 probe pattern with five sequential probes, stdlib-only Python, bounded routes, redaction, timeout guards, and fail-closed artifact generation.

**Created scripts/run_m006_s00_runtime_capability_inventory.py following canonical M005 S05 probe pattern with five sequential probes, stdlib-only Python, bounded routes, redaction, timeout guards, and fail-closed artifact generation.**

## What Happened

Wrote the M006 S00 runtime capability inventory probe script by synthesizing patterns from scripts/run_s05_plugin_ui_surface_probe.py, scripts/run_m005_s01_hermes_xiaomi_probe.py, and scripts/run_s04_live_artifact_flow.py. The script performs five sequential probes: (1) Paperclip health/version readback, (2) plugin install path discovery with fallback routes, (3) tool registry readback for piko:* tools, (4) secret materialization test for GITHUB_TOKEN_AIPAY via Hermes testEnvironment, and (5) lightweight issue/document/comment regression smoke with create+readback+SHA-256 hashing. When live env vars are absent, it still writes a schema-valid fail-closed-blocker artifact with precise blocker codes. The script is executable, syntax-validated, and produces the canonical evidence artifact at runtime-evidence/M006-S00-runtime-capability-inventory.json.

## Verification

Verified via: (1) chmod +x && python3 -m py_compile passed, (2) dry-run without env vars produced valid fail-closed-blocker JSON artifact with 15 precise blocker codes, (3) structural assertions confirmed schema_version, artifact_type, phase, runner, inputs, redaction, fallback_diagnostics, validation_errors, and side_effect_counters all present and correct.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `chmod +x scripts/run_m006_s00_runtime_capability_inventory.py && python3 -m py_compile scripts/run_m006_s00_runtime_capability_inventory.py` | 0 | pass | 150ms |
| 2 | `python3 scripts/run_m006_s00_runtime_capability_inventory.py --output runtime-evidence/M006-S00-runtime-capability-inventory.json` | 2 | pass (expected exit code 2 for blocker artifact) | 80ms |
| 3 | `python3 -c structural assertions on generated artifact` | 0 | pass | 50ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `scripts/run_m006_s00_runtime_capability_inventory.py`
