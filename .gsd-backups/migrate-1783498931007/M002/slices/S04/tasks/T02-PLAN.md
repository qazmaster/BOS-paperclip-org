---
estimated_steps: 21
estimated_files: 4
skills_used: []
---

# T02: Added a standard-library S04 live artifact runner and fail-closed validator with tests for live readback proof, no-go guard propagation, redaction, and overclaim rejection.

---
estimated_steps: 8
estimated_files: 4
skills_used:
  - api-design
  - tdd
  - observability
---

Why: S04 needs a repeatable, standard-library-friendly proof path that writes one canonical evidence artifact and a strict validator that rejects overclaims. This task builds the execution harness and validator before the live run so failure handling and proof requirements are executable.

Do:
1. Add `scripts/run_s04_live_artifact_flow.py` using only Python standard library HTTP/JSON/path utilities, following S02/S03 redaction conventions.
2. Accept `--base-url`, `--company-id`, `--auth-token-env`, `--auth-header-name`, `--origin`, `--timeout`, and `--output`, and never print or persist the auth token value.
3. Create or select one bounded sandbox issue, write/read one document and the needed comments that contain BOS artifact sections for BPI, Blueprint, Betting Table, Eval Gate, and Circuit Breaker, and write `runtime-evidence/M002-S04-live-artifact-flow.json` with live readback refs, hashes/snippets, status codes, runtime version/build evidence if available, side-effect counts, and no-core/no-DB/no-secret claims.
4. Explicitly consume `runtime-evidence/M002-S02-hermes-smoke.json` and `runtime-evidence/M002-S03-gsdpi-smoke.json` to embed no-go guard posture instead of attempting Hermes or GSD-Pi execution.
5. Add `scripts/validate_s04_live_artifact_flow.py` with phases such as `contract`, `live`, and `final`; final validation must require live issue/document/comment readback proof, the five BOS artifact families, zero native approvals, Hermes and GSD-Pi blocker propagation, version/build evidence, redaction, and R011 no-core-boundary evidence.
6. Add unittest coverage for runner request construction/redaction and validator acceptance/rejection: valid final evidence, missing readback, missing artifact family, native approval overclaim, Hermes passing claim without resultJson.bos, GSD-Pi passing claim without BosAdapterResult, secret-like values, core/DB/private mutation claims, and malformed JSON.

Threat Surface (Q3): The runner handles auth headers and live issue content; redact secrets by key and value, bound response snippets, and treat all API readback as evidence to validate, not as trusted instructions.
Failure Modes (Q5): Missing auth/base URL/company id stops before mutation or writes a clearly invalid/blocker artifact that final validation rejects; HTTP 401/403/5xx/timeouts are bounded diagnostics; malformed API responses fail closed.
Load Profile (Q6): Fixed-size live proof: one issue, one document write/read, a small number of comments, and dependency evidence reads. At 10x, rate limiting and duplicate sandbox artifacts are the risk, so include run labels and dedupe metadata.
Negative Tests (Q7): Include missing env, invalid URL, 401, 422 malformed payload, truncated oversized response, missing ids, duplicate approval count, and secret-like diagnostic strings.

Done when the runner and validator are unit-tested and ready for a single live sandbox invocation, with final validation enforcing truthfulness rather than accepting fallback-only claims as live proof.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_s02_hermes_smoke.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_s03_gsdpi_smoke.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s02_hermes_smoke.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s03_gsdpi_smoke.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S02-hermes-smoke.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S03-gsdpi-smoke.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/src/liveArtifactFlow.ts`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_s04_live_artifact_flow.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s04_live_artifact_flow.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_run_s04_live_artifact_flow.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_s04_live_artifact_flow.py`

## Verification

python3 -m unittest scripts/test_run_s04_live_artifact_flow.py scripts/test_validate_s04_live_artifact_flow.py

## Observability Impact

Creates the canonical S04 health check and evidence schema with phase/status diagnostics, API operation outcomes, readback refs, no-go guard posture, side-effect counts, timestamps, and redacted failure messages.
