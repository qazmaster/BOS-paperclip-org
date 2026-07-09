---
id: T02
parent: S04
milestone: M002
key_files:
  - scripts/run_s04_live_artifact_flow.py
  - scripts/validate_s04_live_artifact_flow.py
  - scripts/test_run_s04_live_artifact_flow.py
  - scripts/test_validate_s04_live_artifact_flow.py
key_decisions:
  - Kept the S04 runner and validator standard-library-only with injected HTTP seams for testability and no private Paperclip imports.
  - Made final S04 validation reject blocker/fallback-only claims even when those blocker artifacts are valid live-phase diagnostics.
  - Embedded S02/S03 guard posture from existing evidence files rather than attempting Hermes or GSD-Pi execution.
duration: 
verification_result: passed
completed_at: 2026-05-29T03:19:43.902Z
blocker_discovered: false
---

# T02: Added a standard-library S04 live artifact runner and fail-closed validator with tests for live readback proof, no-go guard propagation, redaction, and overclaim rejection.

**Added a standard-library S04 live artifact runner and fail-closed validator with tests for live readback proof, no-go guard propagation, redaction, and overclaim rejection.**

## What Happened

Created `scripts/run_s04_live_artifact_flow.py` as the canonical S04 harness. It accepts the planned Paperclip connection arguments, never prints or persists auth token values, creates or selects one bounded sandbox issue, writes BOS BPI, Blueprint, Betting Table, Eval Gate, and Circuit Breaker sections to document/comment surfaces, reads them back, computes hashes/snippets, embeds S02/S03 no-go guard posture from the existing evidence files, and writes `runtime-evidence/M002-S04-live-artifact-flow.json` by default. The runner records bounded diagnostics with API phase, status code, bounded response text, malformed JSON reason, timeout field, and fallback flag, plus no-core/no-DB/no-secret/no-execution invariants.

Created `scripts/validate_s04_live_artifact_flow.py` as the executable health check. It supports `contract`, `live`, and `final` phases. Live phase accepts valid fail-closed blockers as diagnostics; final phase rejects fallback/blocker-only claims and requires live issue/document/comment readback proof, runtime version/build, all five BOS artifact families, zero native approvals/activity/Hermes/GSD-Pi runs, propagated S02/S03 no-go guards, redaction, and R011 no-core-boundary evidence.

Added `scripts/test_run_s04_live_artifact_flow.py` and `scripts/test_validate_s04_live_artifact_flow.py` with fixture-driven tests that exercise the public script interfaces and injected HTTP client seam rather than private Paperclip modules.

## Failure Modes
External dependencies are Paperclip HTTP APIs, local filesystem evidence reads/writes, environment auth configuration, and JSON parsing. Missing auth env stops before mutation and writes a blocker shape; invalid base URLs return bounded `ValueError` diagnostics; HTTP 401/403/422/5xx responses are represented with phase/status/bounded text/malformed JSON fields; timeouts have `timeout_ms`; malformed source/evidence JSON fails closed in the validator; missing S02/S03 evidence becomes propagated no-go guard blockers instead of attempted Hermes/GSD-Pi execution.

## Load Profile
The expected live workload is fixed-size: one issue selection/creation, one document write/read, one comment write/read, health/version reads, and two local guard evidence reads. At 10x, Paperclip issue/document/comment mutation rate and duplicate sandbox artifacts saturate first; protection is bounded run labels/dedupe metadata, no polling loop, fixed response byte caps, a single comment/document proof path, zero native approval requests, zero activity events, and no Hermes/GSD-Pi execution starts.

## Negative Tests
Negative coverage includes missing auth env stopping before mutation, invalid base URL diagnostics, 401 redaction/bounded diagnostics, 422 malformed payload blocker diagnostics, oversized response truncation, missing document id fail-closed behavior, missing readback, missing artifact family, native approval/duplicate side-effect overclaim, Hermes passing claim without S04 no-go, GSD-Pi passing claim without S04 no-go, secret-like diagnostic values, core/DB/private mutation claims, missing runtime build, and malformed JSON. The runner cases are in `scripts/test_run_s04_live_artifact_flow.py`; validator acceptance/rejection cases are in `scripts/test_validate_s04_live_artifact_flow.py`.

## Verification

Verified the new S04 unit suite, script syntax, CLI help surfaces, and that existing S02/S03 no-go evidence remains valid blocker input for the S04 runner. The required task verification command passed: `python3 -m unittest scripts/test_run_s04_live_artifact_flow.py scripts/test_validate_s04_live_artifact_flow.py`.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 -m unittest scripts/test_run_s04_live_artifact_flow.py scripts/test_validate_s04_live_artifact_flow.py` | 0 | ✅ pass (21 tests) | 404ms |
| 2 | `python3 -m py_compile scripts/run_s04_live_artifact_flow.py scripts/validate_s04_live_artifact_flow.py scripts/test_run_s04_live_artifact_flow.py scripts/test_validate_s04_live_artifact_flow.py; python3 scripts/run_s04_live_artifact_flow.py --help >/dev/null; python3 scripts/validate_s04_live_artifact_flow.py --help >/dev/null` | 0 | ✅ pass | 174ms |
| 3 | `python3 scripts/validate_s02_hermes_smoke.py --phase agent-smoke --allow-blocker --evidence runtime-evidence/M002-S02-hermes-smoke.json; python3 scripts/validate_s03_gsdpi_smoke.py --phase execute --allow-blocker --evidence runtime-evidence/M002-S03-gsdpi-smoke.json` | 0 | ✅ pass | 115ms |

## Deviations

None.

## Known Issues

None. The live sandbox invocation is intentionally left to the subsequent S04 live-run task; this task made the runner and validator ready for that invocation.

## Files Created/Modified

- `scripts/run_s04_live_artifact_flow.py`
- `scripts/validate_s04_live_artifact_flow.py`
- `scripts/test_run_s04_live_artifact_flow.py`
- `scripts/test_validate_s04_live_artifact_flow.py`
