---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T01: Create requirement-scope reconciliation ledger and validator

Build the JSON ledger that records an explicit disposition for each of R003, R008, R009, R010, R011, plus a standard-library-only fail-closed validator script that checks the ledger for completeness, citation existence, secret safety, and posture assertions. The ledger must mark R003/R008 as active/M003-owned/traceability-only-out-of-scope-for-m004, and R009-R011 as validated/no-reopen-needed/cited-from-m002-m003. Citations must point only to existing local evidence paths. The validator must use only local file reads/writes, no network, no subprocess, no database access.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/.gsd/milestones/M002/M002-CONTEXT.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/.gsd/milestones/M003/M003-CONTEXT.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/plugin-bos-light/src/bettingTable.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/plugin-bos-light/src/persistence.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/plugin-bos-light/src/evalGateEvidence.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/plugin-bos-light/src/circuitBreakerFlow.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/runtime-evidence/M002-S06-regression-closure.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/runtime-evidence/M002-S12-runtime-proof-or-rescope.json`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/runtime-evidence/M004-S08-requirement-scope-reconciliation.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/scripts/validate_m004_s08_requirement_scope.py`

## Verification

python3 -c "import json; f=open('/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/runtime-evidence/M004-S08-requirement-scope-reconciliation.json'); json.load(f); f.close()"
