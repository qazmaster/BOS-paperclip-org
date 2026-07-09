---
id: T01
parent: S10
milestone: M002
key_files:
  - scripts/validate_s10_runtime_execution.py
  - scripts/test_validate_s10_runtime_execution.py
key_decisions:
  - Final matrix validation identifies Hermes/GSD-Pi execution rows by capability key or Paperclip surface identity, not by conservative warning notes on unrelated rows; confirmed execution rows still require referenced S10 proof artifacts that validate.
duration: 
verification_result: passed
completed_at: 2026-05-30T03:58:19.930Z
blocker_discovered: false
---

# T01: Added a standard-library S10 runtime execution validator and unittest fixture suite for Hermes, GSD-Pi, final capability posture, redaction, and unsupported-boundary failures.

**Added a standard-library S10 runtime execution validator and unittest fixture suite for Hermes, GSD-Pi, final capability posture, redaction, and unsupported-boundary failures.**

## What Happened

Created `scripts/validate_s10_runtime_execution.py` with `hermes`, `gsdpi`, and `final` phases. The Hermes phase accepts redacted fail-closed blocker diagnostics but requires the selected `hermes_local_with_codex_cli_backend` path, Paperclip-owned lifecycle/readback proof, `hermes_local` adapter config/readback, `wakeCountDelta=1`, safe/no approval creation, succeeded run status, `resultJson.bos`, supported-boundary proof, ISO timestamp, and no capability promotion mismatch before classifying evidence as passing proof. The GSD-Pi phase likewise accepts valid blockers but requires `gsdpi_local` adapter registry/readback, passing `testEnvironment`, succeeded execute status, and a parseable `BosAdapterResult`/equivalent BOS adapter result for proof. The final phase checks docs and `plugin-bos-light/capabilities.paperclip-runtime.json` so execution-specific Hermes/GSD-Pi rows can be `confirmed` only when their referenced `runtime-evidence/M002-S10-*.json` artifacts validate as passing proof; fail-closed execution rows must stay `unvalidated`, `fallback-only`, or `unsupported` and cite explicit S10 evidence paths. Added `scripts/test_validate_s10_runtime_execution.py` with temp-root unittest fixtures for passing proof, valid fail-closed blocker evidence, duplicate wake, missing Hermes BOS result, missing GSD-Pi BosAdapterResult, plaintext token leakage, direct DB/core/private import flags, malformed timestamps, matrix promotion drift, valid final promotion with referenced proof, and fail-closed rows missing S10 paths.

## Failure Modes
External dependencies are local filesystem JSON/text files only: evidence artifacts, docs, and the capability matrix. Missing files, unreadable UTF-8, malformed JSON, malformed timestamps, missing proof fields, plaintext secret-like values, direct DB/core/private import flags, invalid capability rows, and referenced S10 proof artifacts that fail validation all bubble as path-specific collected errors rather than prose-only success. There are no network, API, or subprocess dependencies inside the validator; the CLI exits nonzero on validation failure and `2` for a valid blocker unless `--allow-blocker` is supplied.

## Load Profile
The validator is a linear local-file scanner/parser. At 10x expected evidence size, memory and JSON/text parsing time saturate first because artifacts and the capability matrix are read into memory once; protection is fail-closed bounded traversal with no network retries, no polling, no database mutation, and no background work. This is acceptable for the expected small runtime-evidence/docs artifacts; very large artifacts should be summarized/redacted before validation.

## Negative Tests
Negative coverage lives in `scripts/test_validate_s10_runtime_execution.py`: `test_duplicate_wake_fails_with_path_specific_error`, `test_missing_result_json_bos_fails_hermes_proof`, `test_missing_bos_adapter_result_fails_gsdpi_proof`, `test_unredacted_token_strings_fail_any_phase`, `test_direct_db_core_patch_and_private_import_flags_fail`, `test_malformed_timestamp_fails`, `test_final_matrix_promotion_drift_requires_matching_s10_proof`, and `test_final_fail_closed_rows_must_cite_s10_evidence_path`.

## Verification

Ran the focused S10 unittest suite with `python3 scripts/test_validate_s10_runtime_execution.py`; all 11 tests passed. Also ran `python3 scripts/validate_s10_runtime_execution.py --phase final` against the current repository docs/matrix; after narrowing execution-row detection to key/surface identity, it passed and confirmed the current capability posture is proof-gated without overclaiming Hermes/GSD-Pi execution.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 scripts/test_validate_s10_runtime_execution.py` | 0 | ✅ pass — 11 unittest fixtures passed | 102ms |
| 2 | `python3 scripts/validate_s10_runtime_execution.py --phase final` | 0 | ✅ pass — current docs/matrix remain proof-gated | 79ms |

## Deviations

None. Added an extra current-repo final-phase validation run beyond the required unittest command.

## Known Issues

None.

## Files Created/Modified

- `scripts/validate_s10_runtime_execution.py`
- `scripts/test_validate_s10_runtime_execution.py`
