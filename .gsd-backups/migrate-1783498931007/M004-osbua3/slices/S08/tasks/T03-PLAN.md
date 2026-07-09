---
estimated_steps: 1
estimated_files: 4
skills_used: []
---

# T03: Generate final audit and slice closeout docs

Run the validator in final phase to produce the audit artifact, then write the slice-level S08-SUMMARY.md, S08-ASSESSMENT.md, and S08-UAT.md documenting what was reconciled, what dispositions were assigned, and how a reviewer can rerun validation. The audit must record passed=true, zero errors, all five requirements present with disposition rows, and no-runtime-promotion posture.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/runtime-evidence/M004-S08-requirement-scope-reconciliation.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/scripts/validate_m004_s08_requirement_scope.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/scripts/test_validate_m004_s08_requirement_scope.py`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/runtime-evidence/M004-S08-requirement-scope-audit.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/.gsd/milestones/M004-osbua3/slices/S08/S08-SUMMARY.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/.gsd/milestones/M004-osbua3/slices/S08/S08-ASSESSMENT.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/.gsd/milestones/M004-osbua3/slices/S08/S08-UAT.md`

## Verification

python3 /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/scripts/validate_m004_s08_requirement_scope.py --phase final --write-audit /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/runtime-evidence/M004-S08-requirement-scope-audit.json && test -s /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/.gsd/milestones/M004-osbua3/slices/S08/S08-SUMMARY.md && test -s /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/.gsd/milestones/M004-osbua3/slices/S08/S08-ASSESSMENT.md && test -s /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/.gsd/milestones/M004-osbua3/slices/S08/S08-UAT.md
