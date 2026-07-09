---
estimated_steps: 5
estimated_files: 3
skills_used: []
---

# T03: Emit final coverage audit

Expected task-plan frontmatter: estimated_steps: 5; estimated_files: 1; skills_used: [verify-before-complete].

Why: Reviewers need a durable final proof artifact that records the exact validator outcome for S06, not just a transient console pass.

Do: Run the new validator in final phase with `--write-audit runtime-evidence/M004-S06-coverage-validation.json`. The audit should include schema version, artifact type, generated timestamp, milestone, slice, phase, classification, passed boolean, ledger path input, diagnostics with error count, and a posture block summarizing required requirement ids and no-promotion enforcement. Keep the audit deterministic enough for review but do not hard-code the timestamp. If final phase checks citation readability, keep them repository-local and do not require tests to read `.gsd`; the unit tests should continue to use fixture roots. Re-run the unit suite after writing the audit.

Done when: the final validator command exits 0, the audit JSON exists, reports `passed: true`, lists R012-R016 as required requirements, and records zero diagnostics.

Failure Modes Q5: if final validation fails, the audit must still show diagnostics when `--write-audit` is supplied; if citation paths are inaccessible in this worktree, final validation should rely on the self-contained ledger fields and report path-presence limitations without promoting capabilities. Load Profile Q6: local JSON write only, trivial. Negative Tests Q7: final-phase test should prove non-zero diagnostics produce `passed: false` in audit and do not echo secret values.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/runtime-evidence/M004-S06-requirement-coverage.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/scripts/validate_m004_requirement_coverage.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/scripts/test_validate_m004_requirement_coverage.py`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/runtime-evidence/M004-S06-coverage-validation.json`

## Verification

python3 scripts/validate_m004_requirement_coverage.py --phase final --write-audit runtime-evidence/M004-S06-coverage-validation.json && python3 -m unittest scripts/test_validate_m004_requirement_coverage.py

## Observability Impact

Persists the final coverage-validation result so later agents can inspect pass or fail state without rerunning the validator first.
