---
estimated_steps: 6
estimated_files: 2
skills_used: []
---

# T02: Create S09 Aggregate Closeout Validator and Contract/UAT Evidence

Build the S09 aggregate closeout validator that chains S06, S07, and S08 closeout validators as regression checks, verifies the BOS-3 re-scope decision chain is coherent, confirms Contract and UAT verification class applicability against `runtime-evidence/M012-S08-validation-readiness.json`, runs a secret scan over S09 artifacts (excluding PLAN and RESEARCH files), and writes `runtime-evidence/M012-S09-closeout-gate.json`.

Also create `runtime-evidence/M012-S09-contract-uat-evidence.json` summarizing:
- Contract evidence: passing S06, S07, S08, and S09 gate artifacts with check counts
- UAT evidence: SC1-SC5 pass status from validation-readiness.json with evidence citations
- BOS-3 rescope evidence: reference to `runtime-evidence/M012-S07-rescope-decision.json`

Run the S09 validator and confirm it exits 0 with a passing gate artifact.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s06_closeout.js`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s07_closeout.js`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s08_closeout.js`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S08-validation-readiness.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S07-rescope-decision.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S06-closeout-gate.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S07-closeout-gate.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S08-closeout-gate.json`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s09_closeout.js`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S09-contract-uat-evidence.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S09-closeout-gate.json`

## Verification

node /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s09_closeout.js
