---
id: T01
parent: S02
milestone: M002
key_files:
  - scripts/run_s02_hermes_smoke.py
  - scripts/validate_s02_hermes_smoke.py
  - scripts/test_validate_s02_hermes_smoke.py
key_decisions:
  - Use fail-closed blocker artifacts as valid diagnostics but not passing smoke proof.
  - Keep the validator standard-library-only and require docs/matrix context with the evidence JSON.
duration: 
verification_result: passed
completed_at: 2026-05-28T23:21:01.014Z
blocker_discovered: false
---

# T01: Added a standard-library S02 Hermes smoke runner, fail-closed evidence validator, and fixture tests for BOS result, wake, approval, promotion, and redaction guardrails.

**Added a standard-library S02 Hermes smoke runner, fail-closed evidence validator, and fixture tests for BOS result, wake, approval, promotion, and redaction guardrails.**

## What Happened

Created `scripts/run_s02_hermes_smoke.py`, `scripts/validate_s02_hermes_smoke.py`, and `scripts/test_validate_s02_hermes_smoke.py`.

The runner supports `environment` and `agent-smoke` phases, accepts explicit Paperclip base URL/company/agent/run/issue inputs, reads auth only from an operator-named environment variable, redacts secret-like keys and values before writing JSON, and writes bounded artifacts under `runtime-evidence/` by default. It uses only HTTP endpoints such as adapter registry, adapter `test-environment`, agent readback, heartbeat invoke, run readback, and approval/run count reads; it records no-core-modification proof and emits fail-closed blocker artifacts instead of simulated success when runtime evidence is incomplete.

The validator is standard-library-only and reads one evidence JSON plus the live validation report, runtime health doc, and capability matrix. It distinguishes valid blocker artifacts from passing smoke evidence, enforces `hermes_local`, passing testEnvironment for smoke proof, agent config/readback, required `resultJson.bos` fields, exactly one wake, zero created approvals, promoted-capability version/build/readback proof, no-core-modification proof, and redaction of token/password/API-key-like fields or values.

## Failure Modes
- External APIs/network: runner wraps HTTP errors, connection loss, malformed/non-JSON responses, and timeouts into bounded diagnostics and writes fail-closed blocker evidence instead of raising false success.
- Filesystem: evidence writing is limited to the operator-selected output directory; validator reports missing/malformed JSON and missing docs/matrix paths as validation errors.
- Malformed runtime responses: validator requires explicit adapter, agent, run, count, and BOS fields before classifying an artifact as passing.
- Secret exposure: runner redacts secret-like keys/values and validator fails artifacts containing unredacted secret-like material.

## Load Profile
Expected load is one bounded smoke run per validation attempt. At 10x, the first saturation point is Paperclip HTTP request volume and evidence artifact accumulation, not CPU. Protections are fixed endpoint calls, per-request timeout, capped response reads at 256 KiB, no recursive scans, no subprocesses, no polling loop, and one JSON artifact per invocation.

## Negative Tests
`python3 -m unittest scripts/test_validate_s02_hermes_smoke.py` covers missing `resultJson.bos`, wrong adapter type, duplicate wake, created approvals, missing version/build/readback proof for promoted capabilities, unredacted secret-like key/value leakage, blocker artifacts without reasons, missing no-core-modification proof, and valid blocker-vs-passing classification.

## Verification

Fresh verification passed:
- Requested unit test command passed: `python3 -m unittest scripts/test_validate_s02_hermes_smoke.py` ran 13 tests successfully.
- Syntax/help check passed for the new runner, validator, and tests via `python3 -m py_compile ...` plus both CLI `--help` commands.
- Runner fail-closed behavior was exercised against an intentionally unreachable local port with output redirected to a temporary directory; it exited 2 and wrote a valid `fail-closed-blocker` artifact.
- A sample passing fixture validated successfully against the repository's current `PAPERCLIP_LIVE_VALIDATION_REPORT.md`, `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, and `plugin-bos-light/capabilities.paperclip-runtime.json`.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 -m unittest scripts/test_validate_s02_hermes_smoke.py` | 0 | ✅ pass | 116ms |
| 2 | `python3 -m py_compile scripts/run_s02_hermes_smoke.py scripts/validate_s02_hermes_smoke.py scripts/test_validate_s02_hermes_smoke.py && python3 scripts/run_s02_hermes_smoke.py --help >/dev/null && python3 scripts/validate_s02_hermes_smoke.py --help >/dev/null` | 0 | ✅ pass | 193ms |
| 3 | `tmp=$(mktemp -d); python3 scripts/run_s02_hermes_smoke.py --phase environment --base-url http://127.0.0.1:9 --company-id fixture-company --auth-token-env __S02_NO_TOKEN__ --timeout 0.2 --output-dir "$tmp" >/tmp/s02-runner.out 2>/tmp/s02-runner.err; status=$?; python3 - <<'PY' "$tmp" "$status" ...` | 0 | ✅ pass | 199ms |
| 4 | `tmp=$(mktemp -d); python3 - <<'PY' "$tmp/evidence.json" ...; python3 scripts/validate_s02_hermes_smoke.py "$tmp/evidence.json"` | 0 | ✅ pass | 112ms |

## Deviations

None.

## Known Issues

The runner endpoint paths are intentionally flexible guesses based on S01-documented public/admin HTTP surfaces; live S02 execution may need to supply an existing agent/run or use `--create-agent` depending on the sandbox's exact API shape.

## Files Created/Modified

- `scripts/run_s02_hermes_smoke.py`
- `scripts/validate_s02_hermes_smoke.py`
- `scripts/test_validate_s02_hermes_smoke.py`
