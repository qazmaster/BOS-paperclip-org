---
id: T03
parent: S04
milestone: M003
key_files:
  - runtime-evidence/M003-S04-live-decision-artifact-readback.json
  - scripts/validate_m003_s04_live_decision_artifact_readback.py
  - scripts/test_validate_m003_s04_live_decision_artifact_readback.py
key_decisions:
  - Treated missing Paperclip access as fail-closed blocker evidence and did not request credentials or perform unsupported runtime operations.
  - Kept the validator's positional evidence path compatibility while adding the final-mode CLI required by the task plan.
duration: 
verification_result: passed
completed_at: 2026-05-31T05:28:58.015Z
blocker_discovered: false
---

# T03: Ran the M003 S04 live decision artifact readback attempt and persisted validated fail-closed blocker evidence for missing Paperclip access.

**Ran the M003 S04 live decision artifact readback attempt and persisted validated fail-closed blocker evidence for missing Paperclip access.**

## What Happened

Executed the T02 runner exactly once with default safe environment handling. The environment did not provide PAPERCLIP_BASE_URL, PAPERCLIP_COMPANY_ID, or PAPERCLIP_API_KEY, so the runner stopped at preflight before any network mutation and wrote `runtime-evidence/M003-S04-live-decision-artifact-readback.json` as `fail-closed-blocker` evidence. The artifact records `blocker_reason=missing_base_url_company_id_auth_token_env`, redacted inputs, `runtime.version/build=null` because Paperclip was not reachable, no selected native surface, a deterministic markdown-only fallback ref, sanitized diagnostics, and zero counts for issues/documents/comments plus all explicitly unsupported surfaces.

While validating, the authoritative task command exposed a CLI mismatch: the validator accepted only a positional path and did not accept `--evidence ... --phase final`. I added a backward-compatible final-mode CLI layer and a regression test without rerunning the live attempt.

## Failure Modes
- Environment/auth preflight: absent base URL, company id, or auth token env causes a pre-mutation fail-closed artifact; verified by this run and runner tests.
- Paperclip API/network: the runner bounds requests with a timeout, captures HTTP errors, malformed JSON, invalid base URL, URL/OS/timeout failures, and records sanitized diagnostics rather than promoting unsupported proof. Existing tests cover invalid base URL, denied document fallback, malformed/mismatched readback, and secret redaction.
- Filesystem/artifact readback: the runner creates the output directory and writes JSON; the validator rejects missing/malformed/non-object evidence and redaction/side-effect violations.
- Subprocess/CLI: the planned validator final-mode command now parses successfully and returns nonzero only for invalid evidence.

## Load Profile
This task is a single bounded operator proof, not a service path. At 10x manual invocations, Paperclip API/network quotas would saturate before local CPU or memory. Protection is bounded by one optional issue creation, one document attempt, one comment fallback, no retries/background workers, `MAX_RESPONSE_BYTES`, request timeout, and fail-closed validation.

## Negative Tests
- `scripts/test_run_m003_s04_live_decision_artifact_readback.py`: missing preflight inputs stop before mutation, live document success avoids unsupported side effects, denied document falls back to comment, malformed/mismatched readback fail-closes, diagnostics redact secret-like values, invalid base URL is bounded.
- `scripts/test_validate_m003_s04_live_decision_artifact_readback.py`: rejects missing native readback, missing blocker reason, leaked secret-like values, native approval/plugin action side effects, unsupported capability promotion, markdown fallback as live proof, malformed JSON; new regression covers `--evidence ... --phase final` CLI.

## Verification

Verified that the runner wrote the required evidence artifact and that the artifact validates as a blocker in final mode. Also ran focused runner and validator unit tests after the CLI compatibility fix. The runner command exited 2 because blocker evidence is the runner's expected code when access is unavailable; the artifact was created and final validation passed.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 scripts/run_m003_s04_live_decision_artifact_readback.py --output runtime-evidence/M003-S04-live-decision-artifact-readback.json` | 2 | ✅ pass - expected fail-closed blocker artifact written | 80ms |
| 2 | `python3 -m unittest scripts/test_validate_m003_s04_live_decision_artifact_readback.py` | 0 | ✅ pass | 98ms |
| 3 | `python3 -m unittest scripts/test_run_m003_s04_live_decision_artifact_readback.py` | 0 | ✅ pass | 119ms |
| 4 | `python3 scripts/validate_m003_s04_live_decision_artifact_readback.py --evidence runtime-evidence/M003-S04-live-decision-artifact-readback.json --phase final` | 0 | ✅ pass - evidence valid: blocker | 71ms |

## Deviations

The validator CLI did not initially support the task-plan final-mode flags, so I added backward-compatible `--evidence` and `--phase final` parsing plus a regression test. The live runner itself was still executed only once.

## Known Issues

Paperclip live access was unavailable in this environment because base URL, company id, and API token env were absent; this is captured in the evidence artifact as valid fail-closed blocker evidence rather than live proof.

## Files Created/Modified

- `runtime-evidence/M003-S04-live-decision-artifact-readback.json`
- `scripts/validate_m003_s04_live_decision_artifact_readback.py`
- `scripts/test_validate_m003_s04_live_decision_artifact_readback.py`
