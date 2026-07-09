# S13: Requirement coverage reconciliation — UAT

**Milestone:** M002
**Written:** 2026-05-30T07:40:18.292Z

# S13 UAT: Requirement coverage reconciliation

**UAT Type:** Artifact/readability UAT for repository validation evidence; no live Paperclip runtime or human sandbox mutation is required.

## Preconditions

- Worktree contains completed S12 approved-rescope artifacts.
- `runtime-evidence/M002-S13-requirement-coverage.json` exists.
- `scripts/validate_s13_requirement_coverage.py` and `scripts/run_m002_regression_closure.py` are available.

## Steps

1. Open `runtime-evidence/M002-S13-requirement-coverage.json`.
2. Confirm exactly R012, R013, R014, and R015 are present and active.
3. Confirm each record uses `primary_owning_slice: M004-osbua3`, `m002_disposition: out_of_scope_for_m002`, and does not claim M002 runtime proof.
4. Confirm evidence citations include Contract, Integration, Operational, and UAT classes.
5. Open `.gsd/milestones/M002/M002-CONTEXT.md`, `.gsd/milestones/M002/M002-ASSESSMENT.md`, and `.gsd/milestones/M002/slices/S13/S13-ASSESSMENT.md`; verify they name the S13 ledger and do not reinterpret M004 ownership.
6. Run `python3 scripts/validate_s13_requirement_coverage.py --phase final --ledger runtime-evidence/M002-S13-requirement-coverage.json --write-audit runtime-evidence/M002-S13-validation-closeout.json`.
7. Run `python3 scripts/run_m002_regression_closure.py --output runtime-evidence/M002-S06-regression-closure.json`.
8. Inspect `runtime-evidence/M002-S13-validation-closeout.json` and `runtime-evidence/M002-S06-regression-closure.json`.

## Expected Outcomes

- S13 validation audit reports `passed=true`, `phase=final`, `classification=final_ready`, and zero diagnostics.
- R012-R015 remain active M004-owned requirements and are not claimed as validated by M002.
- S12 approved-rescope/no-promotion posture is preserved.
- Aggregate closure reports `overall_verdict=pass`.
- S13 final validator appears after S12 and before M002 closeout.
- No secret leakage, runtime promotion, Paperclip core patching, direct DB mutation, private import, unsupported path, or shell string execution is introduced.

## Edge Cases

- Missing R012-R015 rows, duplicate requirement IDs, unknown requirement IDs, or canonical text drift must fail closed with requirement-specific diagnostics.
- Any runtime capability promotion claim or changed S12 approved-rescope posture must fail validation.
- Missing documentation readability evidence must fail final phase.
- Shell-style aggregate command metadata, missing S13 gate, S13-before-S12 ordering, or S13-after-closeout ordering must fail aggregate closure tests.
- Secret-like strings in ledger/audit inputs must be rejected without echoing credential values.

## Operational Readiness

- Health signal: passing S13 final audit and passing aggregate closure JSON artifacts.
- Failure signal: nonzero validator/runner exit, nonempty diagnostics, failed command row, timeout, or invariant drift in shell/redaction/gate ordering.
- Recovery: fix the named artifact or command metadata, keep R012-R015 M004-owned/out-of-scope for M002, rerun the final validator and aggregate closure, and re-review generated diagnostics before completion.
- Monitoring gap: S13 has no live runtime monitor because it is an offline reconciliation slice.
