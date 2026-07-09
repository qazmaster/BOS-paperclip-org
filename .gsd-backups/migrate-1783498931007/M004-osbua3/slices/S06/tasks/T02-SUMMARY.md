---
id: T02
parent: S06
milestone: M004-osbua3
key_files:
  - scripts/validate_m004_requirement_coverage.py
  - scripts/test_validate_m004_requirement_coverage.py
key_decisions:
  - Keep the validator standard-library-only and local-file-only, matching the slice traceability-only/no-network contract.
  - Tighten sk- secret matching to realistic token length so ordinary prose such as DB-backed does not fail validation.
duration: 
verification_result: passed
completed_at: 2026-05-31T11:21:00.173Z
blocker_discovered: false
---

# T02: Added a standard-library fail-closed M004 S06 coverage validator and temporary-root unittest suite for R012-R016 traceability drift.

**Added a standard-library fail-closed M004 S06 coverage validator and temporary-root unittest suite for R012-R016 traceability drift.**

## What Happened

Implemented scripts/validate_m004_requirement_coverage.py as a local-only validator for the M004 S06 coverage ledger. The validator rejects malformed JSON, duplicate keys or requirement IDs, missing or extra R012-R016 records, wrong status or coverage, ownership drift, missing validation classes, capability promotion, bad safety booleans, and secret-like values while emitting shaped redacted diagnostics. Added scripts/test_validate_m004_requirement_coverage.py with temporary fixture roots only, covering positive ledger/final phases and negative drift/error cases without reading .gsd, .planning, .audits, or gitignored planning paths.

## Verification

Fresh task verification passed earlier and closeout re-ran the required suite: python3 -m unittest scripts/test_validate_m004_requirement_coverage.py; python3 scripts/validate_m004_requirement_coverage.py --phase ledger; python3 scripts/validate_m004_requirement_coverage.py --phase final. Closeout verification run 56a496bf-59ba-4f12-8c90-a41b3aa64740 also confirmed the current unittest suite and final validator audit path pass.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 -m unittest scripts/test_validate_m004_requirement_coverage.py` | 0 | pass — validator unittest suite passed | 309ms |
| 2 | `python3 scripts/validate_m004_requirement_coverage.py --phase ledger` | 0 | pass — real ledger classified as coverage_ledger | 56ms |
| 3 | `python3 scripts/validate_m004_requirement_coverage.py --phase final` | 0 | pass — final phase smoke classified as final_ready | 80ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `scripts/validate_m004_requirement_coverage.py`
- `scripts/test_validate_m004_requirement_coverage.py`
