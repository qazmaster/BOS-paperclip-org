---
estimated_steps: 21
estimated_files: 1
skills_used: []
---

# T03: Build and run S07 aggregate closeout validator

---
estimated_steps: 3
estimated_files: 2
skills_used:
  - verify-before-complete
---

Build and run the aggregate S07 closeout validator, patterned after S06's validator, to verify evidence artifacts, secret hygiene, regression against prior slices, and absence of forbidden overclaiming phrases.

## Steps

1. Write `scripts/validate_m012_s07_closeout.js` with checks for:
   - Rescope decision artifact schema and content validation
   - Requirement update evidence presence and validity
   - No forbidden overclaiming phrases in S07 artifacts
   - S06 regression check (re-run `node scripts/validate_m012_s06_closeout.js`)
   - Secret scan over `runtime-evidence/` and `.gsd/milestones/M012-ihd2ez/slices/S07/` artifacts

2. Run the validator with `node scripts/validate_m012_s07_closeout.js`

3. Verify `runtime-evidence/M012-S07-closeout-gate.json` has verdict "pass"

## Must-Haves

- [ ] Validator script exists and exits 0
- [ ] Closeout gate JSON has verdict "pass"
- [ ] Secret scan passes with zero forbidden pattern matches
- [ ] S06 regression check passes

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s06_closeout.js`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S06-closeout-gate.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S07-rescope-decision.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S07-requirement-update-evidence.json`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s07_closeout.js`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S07-closeout-gate.json`

## Verification

node scripts/validate_m012_s07_closeout.js

## Observability Impact

`runtime-evidence/M012-S07-closeout-gate.json` records pass/fail state and full check breakdown. `scripts/validate_m012_s07_closeout.js` prints sectioned gate results and fails closed on missing artifacts, forbidden phrases, regression, or secret-scan failures.
