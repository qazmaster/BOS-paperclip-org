---
id: T02
parent: S07
milestone: M004-osbua3
key_files:
  - scripts/validate_m004_s07_validation_artifacts.py
  - scripts/test_validate_m004_s07_validation_artifacts.py
key_decisions:
  - Mirrored the S06 validator pattern for S07: standard-library-only, root-bounded local parsing, shaped diagnostics, redacted secret handling, and fixture-rooted unittest coverage.
  - Made final phase require the milestone validation markdown artifact while treating the S07 audit path as a required citation/write target rather than a pre-existing input, so T03 can generate the audit in the same validator invocation.
duration: 
verification_result: passed
completed_at: 2026-05-31T12:05:59.347Z
blocker_discovered: false
---

# T02: Added a fail-closed local S07 validation artifact validator with fixture-rooted unit tests and sanitized audit diagnostics.

**Added a fail-closed local S07 validation artifact validator with fixture-rooted unit tests and sanitized audit diagnostics.**

## What Happened

Created `scripts/validate_m004_s07_validation_artifacts.py` as a standard-library-only, local filesystem validator for the restored M004 S07 validation evidence package. The validator supports `--phase artifact` and `--phase final`, reads an explicit fixed artifact set under a root-bounded repository root, validates a populated roadmap Boundary Map, checks restored context/assessment/S07 assessment presence, validates the S07 inventory JSON plus S06 ledger/audit JSON, confirms R012-R016 traceability in restored artifacts, requires citations to the S06 ledger, S06 final audit, and planned S07 final audit path, rejects explicit runtime capability-promotion flags/lists, rejects secret-like plaintext values without echoing them, and can emit `runtime-evidence/M004-S07-validation-artifacts-audit.json`-shape audit output for T03. Added `scripts/test_validate_m004_s07_validation_artifacts.py` with temporary fixture roots only; the tests construct their own `.gsd` and `runtime-evidence` fixture paths inside `TemporaryDirectory` and never read the repository's local `.gsd`, `.planning`, or `.audits` paths. Failure Modes (Q5): dependencies are bounded local filesystem reads/writes and JSON parsing only; missing/empty markdown or JSON produces fail-closed diagnostics with artifact path/problem kind/validation class, malformed JSON fails closed without raw payload echo, root-escaping paths are rejected, and there is no network, subprocess, database, or runtime-service dependency in validator logic. Load Profile (Q6): the first saturating resource at 10x expected load is local file read/text-scan bytes over a fixed artifact set; protection is explicit required-path lists, O(total required markdown bytes + S06/S07 JSON bytes), no concurrency/shared services, and audit metadata declaring no network/subprocess/database access. Negative Tests (Q7): unittest cases cover passing artifact/final phases, empty Boundary Map, missing context doc, missing R014 traceability, missing S06 ledger citation, capability-promotion language, malformed S06 audit JSON, secret-like values with redacted diagnostics, missing final validation artifact, successful audit writing, and sanitized failed audit output.

## Verification

Fresh verification after the final code edit passed: `python3 -m py_compile scripts/validate_m004_s07_validation_artifacts.py scripts/test_validate_m004_s07_validation_artifacts.py` exited 0; the required `python3 -m unittest scripts/test_validate_m004_s07_validation_artifacts.py` exited 0; `python3 scripts/validate_m004_s07_validation_artifacts.py --phase artifact` exited 0 against the actual restored artifacts; a focused AST/text security inspection confirmed only standard-library imports (`argparse`, `datetime`, `json`, `pathlib`, `re`, `sys`, `typing`), no forbidden network/subprocess/database imports, root-bounded resolution, secret-redaction diagnostics, capability-promotion rejection, and no-network/no-subprocess audit flags. A linter-config check found no Python linter/formatter config in this worktree, so py_compile was used as the syntax sanity check.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 -m py_compile scripts/validate_m004_s07_validation_artifacts.py scripts/test_validate_m004_s07_validation_artifacts.py` | 0 | ✅ pass | 114ms |
| 2 | `python3 -m unittest scripts/test_validate_m004_s07_validation_artifacts.py` | 0 | ✅ pass | 229ms |
| 3 | `python3 scripts/validate_m004_s07_validation_artifacts.py --phase artifact` | 0 | ✅ pass | 171ms |
| 4 | `AST/text security inspection for standard-library imports, root-bounded paths, secret redaction, no-promotion checks, and no-network/no-subprocess audit flags` | 0 | ✅ pass | 76ms |
| 5 | `Python linter/formatter config detection for changed scripts` | 0 | ✅ pass | 55ms |

## Deviations

The task plan estimated two files and no audit generation yet; the implementation kept to those two files and added audit-write support in the validator so T03 can persist `runtime-evidence/M004-S07-validation-artifacts-audit.json` without additional validator changes.

## Known Issues

None.

## Files Created/Modified

- `scripts/validate_m004_s07_validation_artifacts.py`
- `scripts/test_validate_m004_s07_validation_artifacts.py`
