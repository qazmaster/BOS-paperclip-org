---
id: T02
parent: S02
milestone: M002
key_files:
  - scripts/run_s02_hermes_smoke.py
  - scripts/validate_s02_hermes_smoke.py
  - scripts/test_validate_s02_hermes_smoke.py
  - runtime-evidence/M002-S02-hermes-environment.json
  - docs/11_HERMES_BOS_AGENTS_SMOKE.md
  - docs/08_RUNTIME_CAPABILITY_HEALTH.md
  - PAPERCLIP_LIVE_VALIDATION_REPORT.md
key_decisions:
  - Use Paperclip encrypted company secrets and secret_ref adapter env bindings for sensitive Hermes credentials under strict secret mode.
  - For Xiaomi MiMo Hermes runtime, provide `XIAOMI_API_KEY`/`XIAOMI_BASE_URL` and keep `OPENAI_API_KEY`/`OPENAI_BASE_URL` aliases for the current hermes_local testEnvironment API-key check.
duration: 
verification_result: passed
completed_at: 2026-05-29T00:17:06.905Z
blocker_discovered: false
---

# T02: Removed the Hermes environment blocker by storing the Xiaomi MiMo credential as Paperclip secrets and producing passing `hermes_local` testEnvironment evidence.

**Removed the Hermes environment blocker by storing the Xiaomi MiMo credential as Paperclip secrets and producing passing `hermes_local` testEnvironment evidence.**

## What Happened

Removed the S02/T02 Hermes environment blocker. The earlier blocker was caused by two separate constraints: Hermes lacked non-empty LLM credentials, and Paperclip strict secret mode rejected inline sensitive `adapterConfig.env` values. After the user clarified that the collected key is a Xiaomi MiMo OpenAI-compatible key and provided `https://token-plan-sgp.xiaomimimo.com/v1`, I added local gitignored Xiaomi/OpenAI-compatible env aliases, created Paperclip encrypted company secrets through `POST /api/companies/{companyId}/secrets`, and reran the `hermes_local` adapter `testEnvironment` using `secret_ref` bindings for `OPENAI_API_KEY` and `XIAOMI_API_KEY` plus inline non-secret `OPENAI_BASE_URL` and `XIAOMI_BASE_URL`.

The live environment artifact at `runtime-evidence/M002-S02-hermes-environment.json` is now `artifact_type=smoke-evidence`, `phase=environment`, and adapter `testEnvironment.status=pass`. Its check codes are `hermes_version`, `hermes_configured_default_model`, and `hermes_api_keys_found`; it no longer reports `hermes_cli_not_found`, `hermes_no_api_keys`, or the strict-secret inline-value error. The artifact was scanned for secret-like values and remained redacted.

Updated the runner to support `--adapter-secret-ref ENV=SECRET_ID`, updated the docs to passing environment posture, and kept runtime capability docs conservative: this proves Hermes adapter environment readiness only, not BOS Light plugin registration or native Paperclip capability promotion.

Failure Modes (Q5): The runner now handles missing CLI, missing auth, browser Origin rejection, company access rejection, strict secret mode, and secret refs. Sensitive values are never committed; Paperclip resolves encrypted refs at runtime.

Load Profile (Q6): Still one bounded adapter registry/readback plus one testEnvironment call, no polling loop, capped responses, per-request timeout, and one durable JSON artifact.

Negative Tests (Q7): Existing validator tests still pass after secret-ref runner support; the artifact redaction scan found zero secret-like value matches.

## Verification

Fresh verification passed: strict S02 environment evidence validation exits 0 without `--allow-blocker`; the validator unit suite runs 14 tests successfully; script compile/help checks pass; runtime capability validation passes; the fixed evidence artifact scan found zero secret-like values. Live gate output showed `artifact_type=smoke-evidence`, `test_status=pass`, and check codes `hermes_version,hermes_configured_default_model,hermes_api_keys_found`.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 scripts/validate_s02_hermes_smoke.py --phase environment --evidence runtime-evidence/M002-S02-hermes-environment.json` | 0 | ✅ pass | 89ms |
| 2 | `python3 -m unittest scripts/test_validate_s02_hermes_smoke.py` | 0 | ✅ pass | 146ms |
| 3 | `python3 -m py_compile scripts/run_s02_hermes_smoke.py scripts/validate_s02_hermes_smoke.py scripts/test_validate_s02_hermes_smoke.py && python3 scripts/run_s02_hermes_smoke.py --help >/dev/null && python3 scripts/validate_s02_hermes_smoke.py --help >/dev/null` | 0 | ✅ pass | 184ms |
| 4 | `python3 scripts/validate_runtime_capabilities.py` | 0 | ✅ pass | 105ms |
| 5 | `python3 - <<'PY' ... scan runtime-evidence/M002-S02-hermes-environment.json for secret-like values` | 0 | ✅ pass: zero secret-like value matches | 65ms |

## Deviations

Initial autonomous execution recorded a fail-closed credential blocker. The user then supplied that the collected key is for Xiaomi MiMo and provided the OpenAI-compatible provider URL; I stored the key in gitignored local env, created Paperclip encrypted company secrets, passed secret_ref bindings to testEnvironment, and replaced the environment artifact with passing smoke evidence.

## Known Issues

The environment gate now passes, but T03 still needs an actual bounded Hermes agent run that returns `resultJson.bos` and verifies exactly one wake plus zero approvals. Plugin/native capability surfaces remain unpromoted.

## Files Created/Modified

- `scripts/run_s02_hermes_smoke.py`
- `scripts/validate_s02_hermes_smoke.py`
- `scripts/test_validate_s02_hermes_smoke.py`
- `runtime-evidence/M002-S02-hermes-environment.json`
- `docs/11_HERMES_BOS_AGENTS_SMOKE.md`
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `PAPERCLIP_LIVE_VALIDATION_REPORT.md`
