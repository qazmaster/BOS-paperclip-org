---
id: T01
parent: S12
milestone: M002
key_files:
  - scripts/build_s12_runtime_proof_or_rescope.py
  - scripts/validate_s12_runtime_proof_or_rescope.py
  - scripts/test_validate_s12_runtime_proof_or_rescope.py
key_decisions:
  - Reused the existing S10 validator as the authoritative S10 proof classifier instead of duplicating Hermes/GSD-Pi runtime proof rules.
  - Made approved rescope a separate accepted disposition requiring explicit approval, R009/R010/R011 coverage, narrowed/deferred success criteria, and blocker citations for both runtime surfaces.
duration: 
verification_result: passed
completed_at: 2026-05-30T06:39:16.216Z
blocker_discovered: false
---

# T01: Added a stdlib-only S12 resolver and fail-closed validator for runtime proof versus approved rescope disposition.

**Added a stdlib-only S12 resolver and fail-closed validator for runtime proof versus approved rescope disposition.**

## What Happened

Implemented `scripts/validate_s12_runtime_proof_or_rescope.py` with schema `s12-runtime-proof-or-rescope/v1` and artifact type `runtime-proof-or-approved-rescope`. The validator accepts `runtime_proof` only when both referenced S10 Hermes and GSD-Pi artifacts validate as passing through `scripts/validate_s10_runtime_execution.py`; it requires Hermes `resultJson.bos`, gsdpi_local `BosAdapterResult`, supported-boundary proof, S11 no-promotion posture, no unsupported promotions, redacted diagnostics, and docs/matrix no-overclaim checks. It accepts `approved_rescope` only when runtime proof is blocked and an explicit approval source, R009/R010/R011 coverage, narrowed or deferred success criteria, blocker citations for both surfaces, and `no_capability_promotions=true` are present.

Implemented `scripts/build_s12_runtime_proof_or_rescope.py` as the resolver. It classifies the S10 Hermes/GSD-Pi evidence using the S10 validator, writes `runtime_proof` when both pass, writes `approved_rescope` only when `--rescope-approval` supplies an approval fixture for blocked proof, and otherwise writes a blocked disposition that the validator rejects fail-closed.

Added `scripts/test_validate_s12_runtime_proof_or_rescope.py` with temp-root fixtures only. Tests cover accepted runtime proof, accepted approved rescope, builder output for both accepted outcomes, malformed JSON, secret-like diagnostics, one-sided proof, blocker promotion, rescope without approval, DB/core/private-import/shell-string flags, and docs or matrix confirmation without proof.

## Failure Modes
External dependencies are local filesystem JSON/markdown artifacts and local validator module imports. Missing or malformed S12 evidence returns validator errors; missing or malformed S10 artifacts are never accepted as proof and must be explicitly cited as blockers for approved rescope; missing S11 posture fails validation; docs/matrix promotion language without runtime proof fails validation. No network, database, subprocess execution, or shell command execution is performed by the validator.

## Load Profile
No runtime service or repeated workload is introduced. The scripts perform bounded local file reads over fixed-size evidence artifacts and one in-process S10 validation per surface, so the first saturation point at 10x expected use would be filesystem reads/JSON parsing; no pool/rate-limit protection is required beyond bounded artifact scope.

## Negative Tests
Negative coverage is in `scripts/test_validate_s12_runtime_proof_or_rescope.py`: malformed JSON (`test_malformed_json_fails_closed`), secret-like diagnostics (`test_secret_like_diagnostics_fail`), one-sided proof (`test_one_sided_proof_fails_runtime_proof`), blocker promotion (`test_blocker_promotion_fails_approved_rescope`), rescope without approval (`test_rescope_without_approval_fails`), DB/core/private-import/shell-string flags (`test_db_core_private_import_and_shell_string_flags_fail`), and docs/matrix confirmation without proof (`test_docs_or_matrix_confirmation_without_proof_fails`).

## Verification

`python3 -m py_compile scripts/build_s12_runtime_proof_or_rescope.py scripts/validate_s12_runtime_proof_or_rescope.py scripts/test_validate_s12_runtime_proof_or_rescope.py` exited 0. Final required verification `python3 -m unittest scripts/test_validate_s12_runtime_proof_or_rescope.py` exited 0 and reported 11 tests OK.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 -m py_compile scripts/build_s12_runtime_proof_or_rescope.py scripts/validate_s12_runtime_proof_or_rescope.py scripts/test_validate_s12_runtime_proof_or_rescope.py` | 0 | ✅ pass | 68ms |
| 2 | `python3 -m unittest scripts/test_validate_s12_runtime_proof_or_rescope.py` | 0 | ✅ pass (11 tests OK) | 128ms |

## Deviations

None.

## Known Issues

The resolver intentionally returns non-zero when current live evidence is blocked and no explicit approved rescope JSON is supplied; later S12 tasks must supply approved rescope input or passing runtime proof before producing an accepted live disposition.

## Files Created/Modified

- `scripts/build_s12_runtime_proof_or_rescope.py`
- `scripts/validate_s12_runtime_proof_or_rescope.py`
- `scripts/test_validate_s12_runtime_proof_or_rescope.py`
