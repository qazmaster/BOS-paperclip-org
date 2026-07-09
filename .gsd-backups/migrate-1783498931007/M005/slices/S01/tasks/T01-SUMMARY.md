---
id: T01
parent: S01
milestone: M005
key_files:
  - scripts/run_m005_s01_hermes_xiaomi_probe.py
  - scripts/validate_m005_s01_hermes_xiaomi_probe.py
  - scripts/test_validate_m005_s01_hermes_xiaomi_probe.py
key_decisions:
  - Selected schema_version m005-s01-hermes-xiaomi/v1 to version the evidence contract
  - Used secret_ref env references (env:XIAOMI_API_KEY, env:XIAOMI_BASE_URL) instead of plaintext secrets in adapterConfig
  - Inherited HttpClient and redaction patterns from S10 for consistency and safety
duration: 
verification_result: passed
completed_at: 2026-05-31T18:47:37.924Z
blocker_discovered: false
---

# T01: Created M005 S01 Hermes Xiaomi probe runner, validator, and 11-test fixture suite

**Created M005 S01 Hermes Xiaomi probe runner, validator, and 11-test fixture suite**

## What Happened

Based on S10 Hermes runtime smoke patterns, created three scripts for M005 S01:

1. `scripts/run_m005_s01_hermes_xiaomi_probe.py` — Fail-closed probe runner targeting `adapterType: hermes_local`, `provider: xiaomi`, `model: mimo-v2.5-pro`. Discovers base_url/company_id from env or prior M002-S08 artifacts. Uses encrypted `secret_ref` env references for `XIAOMI_API_KEY` / `XIAOMI_BASE_URL`. Performs bounded agent creation + invoke + readback, writes versioned evidence with schema_version `m005-s01-hermes-xiaomi/v1`. Includes defensive exception handling and full redaction.

2. `scripts/validate_m005_s01_hermes_xiaomi_probe.py` — Standard-library-only validator checking schema_version, artifact_type, redaction, resultJson.bos presence, wakeCountDelta==1, no core modification flags, and proper lifecycle proof. Returns exit 0 for valid blocker artifacts.

3. `scripts/test_validate_m005_s01_hermes_xiaomi_probe.py` — 11 fixture tests covering: passing proof, blocker acceptance, duplicate wake failure, missing resultJson.bos, unredacted secrets, direct DB/core-patch/private-import flags, malformed timestamp, wrong schema_version, wrong selected_path, CLI zero-exit for blocker, and audit persistence.

All scripts were verified to compile with `python3 -m py_compile`, all 11 tests pass, and a dry-run probe produced a valid blocker artifact accepted by the validator with exit code 0.

## Verification

All three scripts compile without syntax errors. All 11 unit tests in test_validate_m005_s01_hermes_xiaomi_probe.py pass. A dry-run of the probe script produced a valid fail-closed blocker artifact that the validator accepted with exit code 0.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 -m py_compile scripts/run_m005_s01_hermes_xiaomi_probe.py` | 0 | ✅ pass | 150ms |
| 2 | `python3 -m py_compile scripts/validate_m005_s01_hermes_xiaomi_probe.py` | 0 | ✅ pass | 120ms |
| 3 | `python3 -m py_compile scripts/test_validate_m005_s01_hermes_xiaomi_probe.py` | 0 | ✅ pass | 100ms |
| 4 | `python3 scripts/test_validate_m005_s01_hermes_xiaomi_probe.py -v` | 0 | ✅ pass (11/11 tests) | 180ms |
| 5 | `python3 scripts/run_m005_s01_hermes_xiaomi_probe.py --output runtime-evidence/M005-S01-hermes-xiaomi-probe-dryrun.json` | 0 | ✅ pass (produced valid blocker artifact) | 200ms |
| 6 | `python3 scripts/validate_m005_s01_hermes_xiaomi_probe.py --evidence runtime-evidence/M005-S01-hermes-xiaomi-probe-dryrun.json --allow-blocker` | 0 | ✅ pass (blocker accepted) | 150ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `scripts/run_m005_s01_hermes_xiaomi_probe.py`
- `scripts/validate_m005_s01_hermes_xiaomi_probe.py`
- `scripts/test_validate_m005_s01_hermes_xiaomi_probe.py`
