# S06: Reconcile Requirement Coverage — UAT

**Milestone:** M004-osbua3
**Written:** 2026-05-31T11:22:05.031Z

## UAT Type
Reviewer traceability and local verification UAT; no live runtime or human Paperclip interaction required.

## Preconditions
- Repository worktree is on milestone `M004-osbua3` with S01-S05 complete.
- `runtime-evidence/M004-S06-requirement-coverage.json`, `scripts/validate_m004_requirement_coverage.py`, `scripts/test_validate_m004_requirement_coverage.py`, and `runtime-evidence/M004-S06-coverage-validation.json` are present.
- Python 3 standard library is available; no network, credentials, database, or Paperclip runtime is required.

## Steps
1. Run `python3 -m unittest scripts/test_validate_m004_requirement_coverage.py`.
2. Run `python3 scripts/validate_m004_requirement_coverage.py --phase final --write-audit runtime-evidence/M004-S06-coverage-validation.json`.
3. Run `python3 -m json.tool runtime-evidence/M004-S06-coverage-validation.json > /dev/null`.
4. Open `runtime-evidence/M004-S06-coverage-validation.json` and inspect the audit fields.
5. Open `runtime-evidence/M004-S06-requirement-coverage.json` and verify the ledger contains exactly R012, R013, R014, R015, and R016 with `validated` and `covered` status, preserved ownership notes, evidence citations, and no live runtime capability promotion.

## Expected Outcomes
- The unittest suite passes.
- The final validator exits 0 and prints `M004 S06 requirement coverage validation passed: final_ready`.
- The audit is valid JSON with `artifact_type: validator-audit`, `milestone: M004-osbua3`, `slice: S06`, `phase: final`, `classification: final_ready`, `passed: true`, `diagnostics.error_count: 0`, required requirements R012-R016, `traceability_only: true`, and `runtime_capability_promotions_allowed: false`.
- The ledger cites local evidence and keeps runtime claims conservative.

## Edge Cases
- Removing a required requirement, adding an unknown requirement, changing `coverage_status`, normalizing inherited owners to S06, dropping a required validation class, adding secret-like text, or enabling runtime capability promotion should make the validator exit non-zero and write shaped diagnostics without exposing secret-like values.
- Missing or malformed ledger/audit JSON should fail closed.
- No external IO should occur during validation.
