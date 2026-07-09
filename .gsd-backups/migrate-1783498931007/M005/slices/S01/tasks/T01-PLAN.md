---
estimated_steps: 6
estimated_files: 3
skills_used: []
---

# T01: Create M005 S01 Hermes Xiaomi probe script and validator

Why: The existing S10 Hermes runtime smoke script is hardcoded for openai-codex backend (`selected_path: hermes_local_with_codex_cli_backend`, provider: openai-codex, model: gpt-5.3-codex) and cannot validate xiaomi mimo 2.5 pro provider configuration. M005 S01 needs a dedicated probe that targets the xiaomi provider path with `adapterType: hermes_local`, `provider: xiaomi`, `model: mimo-v2.5-pro`, and encrypted `secret_ref` env for `XIAOMI_API_KEY` / `XIAOMI_BASE_URL`.

Do:
1. Write `scripts/run_m005_s01_hermes_xiaomi_probe.py` based on S10 HTTP client and redaction patterns. It must discover base_url/company_id from env or prior artifacts (e.g., `runtime-evidence/M002-S08-runtime-execution-smoke.json`), attempt one bounded agent creation + invocation + readback, and write a fail-closed evidence file with schema_version `m005-s01-hermes-xiaomi/v1`.
2. Write `scripts/validate_m005_s01_hermes_xiaomi_probe.py` that checks schema_version, artifact_type, redaction, resultJson.bos presence, wakeCountDelta==1, and no core modification flags. Must return exit 0 for valid blocker artifacts.
3. Write `scripts/test_validate_m005_s01_hermes_xiaomi_probe.py` with fixture tests covering passing proof, blocker, missing resultJson.bos, duplicate wake, and unredacted secrets.

Done when: All three scripts exist, compile with `python3 -m py_compile`, and the test validator accepts fixture passing and blocker evidence.

## Inputs

- `scripts/run_s10_hermes_runtime_smoke.py`
- `scripts/validate_s10_runtime_execution.py`
- `scripts/test_validate_s10_runtime_execution.py`

## Expected Output

- `scripts/run_m005_s01_hermes_xiaomi_probe.py`
- `scripts/validate_m005_s01_hermes_xiaomi_probe.py`
- `scripts/test_validate_m005_s01_hermes_xiaomi_probe.py`

## Verification

python3 -m py_compile scripts/run_m005_s01_hermes_xiaomi_probe.py && python3 -m py_compile scripts/validate_m005_s01_hermes_xiaomi_probe.py && python3 -m py_compile scripts/test_validate_m005_s01_hermes_xiaomi_probe.py

## Observability Impact

New probe scripts enable reproducible Hermes Xiaomi diagnostics with versioned evidence artifacts.
