---
estimated_steps: 16
estimated_files: 2
skills_used: []
---

# T03: S08 Aggregate Closeout and Validation Readiness

Build the S08 aggregate closeout validator and validation readiness artifact to prepare M012 for validation round 1.

Steps:
1. Write `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s08_closeout.js` that performs the following checks:
   - S06 closeout validator regression: execSync `node scripts/validate_m012_s06_closeout.js` and assert exit 0.
   - S07 closeout validator regression: execSync `node scripts/validate_m012_s07_closeout.js` and assert exit 0.
   - Secret scan across all M012 slice artifacts (S01-S08): walk `runtime-evidence/` and `.gsd/milestones/M012-ihd2ez/slices/S0*/` for `.md`/`.json`/`.txt` files, scan with the same three patterns as S06/S07 validators (password-literal, api-key-pcp-prefix, session-cookie-value), fail closed on any match.
   - R003 coverage artifact validation: `runtime-evidence/M012-S08-r003-coverage.json` exists, is valid JSON, has `requirement_id: 'R003'`, and has `coverage_verdict`.
   - Validation readiness artifact validation: `runtime-evidence/M012-S08-validation-readiness.json` exists, is valid JSON, has `success_criteria_checklist`, `verification_classes`, and `requirement_coverage`.
   - Write `runtime-evidence/M012-S08-closeout-gate.json` with schema_version `m012-s08-closeout-gate/v1`, verdict, checks_total, checks_passed, checks_failed.
2. Create `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S08-validation-readiness.json` with:
   - `success_criteria_checklist`: the 5 M012 roadmap success criteria mapped to specific evidence files and pass/fail status (e.g., criterion 1 maps to `runtime-evidence/M012-S01-canonical-paperclip-readback.json` with status pass).
   - `verification_classes`: Contract (artifact schema validation + validator pass) and UAT (human-readable success criteria met with citations). Integration and Operational marked as not applicable.
   - `requirement_coverage`: matrix of all M012-touched active requirements (R017, R018, R019, R020, R022, R023, R024, R025) plus R003 to their M012 evidence files and honest assessment.
   - `slice_delivery_audit`: S01-S07 claimed vs delivered output with cross-checks.
   - `cross_slice_integration`: assessment confirming S05→S06→S07→S08 handoff coherence.
3. Run `node scripts/validate_m012_s08_closeout.js` which writes `runtime-evidence/M012-S08-closeout-gate.json`.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s06_closeout.js`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s07_closeout.js`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S08-r003-coverage.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/M012-ihd2ez-ROADMAP.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S01-canonical-paperclip-readback.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S02-native-mission-issue.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S03-local-seven-division-flow.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S04-final-reconciliation.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S06-closeout-gate.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S07-closeout-gate.json`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s08_closeout.js`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S08-validation-readiness.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S08-closeout-gate.json`

## Verification

node scripts/validate_m012_s08_closeout.js
