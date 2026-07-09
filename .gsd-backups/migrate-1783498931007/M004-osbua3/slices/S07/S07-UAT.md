# S07: Restore Validation Evidence Artifacts — UAT

**Milestone:** M004-osbua3
**Written:** 2026-05-31T12:17:59.905Z

# S07 UAT: Restore Validation Evidence Artifacts

**UAT Type:** Documentation/reviewer-readable UAT with local contract, integration, operational, and validation-artifact checks. No browser, network, runtime service, or live Paperclip UAT is required.

## Preconditions

- Work from the M004-osbua3 worktree.
- S01-S06 are complete and their summary/evidence artifacts exist.
- The restored S07 artifact package is present:
  - `.gsd/milestones/M004-osbua3/M004-osbua3-ROADMAP.md`
  - `.gsd/milestones/M004-osbua3/M004-osbua3-CONTEXT.md`
  - `.gsd/milestones/M004-osbua3/M004-osbua3-ASSESSMENT.md`
  - `.gsd/milestones/M004-osbua3/slices/S07/S07-ASSESSMENT.md`
  - `.gsd/milestones/M004-osbua3/M004-osbua3-VALIDATION.md`
  - `runtime-evidence/M004-S07-restored-artifact-inventory.json`
  - `runtime-evidence/M004-S07-validation-artifacts-audit.json`

## Steps

1. Open the M004 roadmap and inspect the Boundary Map.
2. Confirm the Boundary Map is populated and maps S01-S06 evidence flows into M004 closeout and S07 validation restoration.
3. Open the milestone context, milestone assessment, S07 assessment, and final validation markdown.
4. Confirm these artifacts cite existing S05/S06 evidence paths rather than inventing proof.
5. Confirm R012-R016 are traceable and the prose preserves Div6.External-only external I/O, Div5 quarantine/sanitization, Div1.HCO routing/control, Div3.Treasury paid/credentialed grant routing, and fallback-only/unvalidated Paperclip runtime posture.
6. Run `python3 -m unittest scripts/test_validate_m004_s07_validation_artifacts.py`.
7. Run `python3 scripts/validate_m004_requirement_coverage.py --phase final`.
8. Run `python3 scripts/validate_m004_s07_validation_artifacts.py --phase final --write-audit runtime-evidence/M004-S07-validation-artifacts-audit.json`.
9. Run `python3 -m json.tool runtime-evidence/M004-S07-validation-artifacts-audit.json`.
10. Inspect the S07 audit JSON and confirm `passed: true`, `classification: final_ready`, `diagnostics.error_count: 0`, required requirements R012-R016, `traceability_only: true`, no network/subprocess/database access, and no runtime-capability promotion allowed.

## Expected Outcomes

- All commands exit 0.
- The roadmap Boundary Map is no longer blank.
- The reviewer can follow S01-S06 evidence into M004 closeout through restored context, assessment, validation, and S07 audit artifacts.
- S07 remains an artifact restoration and validation-evidence slice only; it does not alter requirement ownership/status or promote live Paperclip capability.

## Edge Cases

- If a restored artifact is missing or empty, the S07 validator fails closed with an artifact path and problem kind.
- If R012-R016 traceability is incomplete, the validator reports a requirement trace gap.
- If validation prose promotes live Paperclip runtime capability, the validator reports capability-promotion/posture drift.
- If malformed JSON or secret-like plaintext appears in required evidence, the validator fails closed and redacts sensitive-looking content from diagnostics.

## Operational Readiness

- Health signal: the final validator writes a `final_ready` audit with zero diagnostics errors and explicit no-network/no-runtime-promotion flags.
- Failure signal: a non-zero validator exit with shaped diagnostics identifies the artifact and validation class that needs correction.
- Recovery: correct the named local artifact using existing S05/S06 evidence paths only, rerun S06 final coverage validation, rerun S07 final validation with audit write, and re-run JSON formatting validation.
- Monitoring gaps: no live runtime monitoring exists or is required because S07 has no deployed service or live Paperclip interaction.
