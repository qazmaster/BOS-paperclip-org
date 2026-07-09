---
estimated_steps: 10
estimated_files: 1
skills_used: []
---

# T03: Persist final validation artifact and audit proof

Expected executor task-plan frontmatter: estimated_steps: 6; estimated_files: 2; skills_used: [test, security-review, verify-before-complete].

Why: S07 is complete only when the restored artifact package can be validated in the same turn and the milestone has a final validation artifact analogous to prior milestone validation output.

Do: Use the restored context/assessment/Boundary Map and S06 coverage ledger/audit to rerun final local validation. Prefer `gsd_validate_milestone` to persist `.gsd/milestones/M004-osbua3/M004-osbua3-VALIDATION.md` with verdict `pass`, remediation round `1`, Success Criteria Checklist, Slice Delivery Audit, Cross-Slice Integration, Requirement Coverage for R012-R016, Verification Class Compliance, Verification Classes (Contract, Integration, Operational, UAT), and verdict rationale. If the tool is unavailable in the executor context, write the validation file to match the prior M001 validation shape, but still preserve DB/tool output if available. Then run the S07 validator in final phase and write `runtime-evidence/M004-S07-validation-artifacts-audit.json`. Re-run S06 requirement coverage validation without rewriting the S06 audit to prove the prerequisite ledger still passes.

Done when: milestone validation markdown exists, S07 final audit JSON exists with `passed: true`, classification indicating final-ready/restored validation artifacts, zero diagnostics, required requirements R012-R016, `traceability_only: true`, `network_access: false`, and `runtime_capability_promotions_allowed: false`; S06 validator still passes.

Threat Surface (Q3): Final validation text can accidentally turn traceability into capability promotion. Keep runtime posture conservative, do not contact external services, and do not mention raw secrets. Validation is local artifact inspection only.

Requirement Impact (Q4): Supports validated R012-R016 in the milestone-level validation artifact. It must not update `.gsd/REQUIREMENTS.md`, change primary owners, broaden success criteria, or introduce new active requirements.

Failure Modes (Q5): Missing/restale T01 artifacts -> S07 final validator fails. Missing S06 evidence -> stop and report dependency gap rather than inventing proof. Malformed audit -> fail closed. gsd validation tool failure -> preserve error and do not mark S07 complete until file/audit proof exists.

Load Profile (Q6): Bounded local validation over markdown/JSON; no network, no database reads except the optional GSD validation write path, no long-running processes.

Negative Tests (Q7): Final validator must fail if milestone validation markdown is absent, any R012-R016 row is missing, S06 audit is not cited, diagnostics are nonzero, or runtime promotion language appears.

Path note: expected concrete outputs are `.gsd/milestones/M004-osbua3/M004-osbua3-VALIDATION.md` and `runtime-evidence/M004-S07-validation-artifacts-audit.json`. They are named here rather than in path arrays because of the current duplicate-worktree path validation issue.

## Inputs

- None specified.

## Expected Output

- Update the implementation and proof artifacts needed for this task.

## Verification

python3 -m unittest scripts/test_validate_m004_s07_validation_artifacts.py && python3 scripts/validate_m004_requirement_coverage.py --phase final && python3 scripts/validate_m004_s07_validation_artifacts.py --phase final --write-audit runtime-evidence/M004-S07-validation-artifacts-audit.json && python3 -m json.tool runtime-evidence/M004-S07-validation-artifacts-audit.json

## Observability Impact

Produces the final audit proof for S07 and a milestone validation artifact that future agents can inspect before milestone completion.
