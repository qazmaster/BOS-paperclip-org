---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T02: Create fixture-rooted unit tests for the S08 validator

Write unit tests that import the validator module and exercise it against temporary fixture roots. Tests must cover: happy path with all 5 requirements present, missing requirement, citation file missing, secret-like value in ledger, runtime-promotion flag false, ownership-shift flag false for R003/R008, and malformed JSON. Tests must not read .gsd, .planning, or .audits paths from the repository.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/scripts/validate_m004_s08_requirement_scope.py`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/scripts/test_validate_m004_s08_requirement_scope.py`

## Verification

python3 -m unittest /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/scripts/test_validate_m004_s08_requirement_scope.py
