---
estimated_steps: 23
estimated_files: 4
skills_used: []
---

# T02: Update canonical requirement and roadmap artifacts

---
estimated_steps: 5
estimated_files: 4
skills_used:
  - verify-before-complete
---

Propagate the re-scope decision into the canonical requirement and roadmap artifacts so downstream slices and validation have an honest baseline.

## Steps

1. Update `.gsd/REQUIREMENTS.md`:
   - R022 Notes: add S07 re-scope language acknowledging auto-mode constraint and preserving deviation note
   - R023 Notes: note that the first HITL gate (mission creation confirmation) was exercised as a documented re-scope decision rather than live user interaction

2. Update `runtime-evidence/M012-S04-requirement-outcomes.md`:
   - R022 row: update M012 Evidence and Rationale with re-scope language
   - Summary: update to reflect re-scope

3. Update `.gsd/milestones/M012-ihd2ez/M012-ihd2ez-ROADMAP.md`:
   - S07 demo text: reflect that the success criterion was re-scoped due to auto-mode constraint

4. Write `scripts/test_m012_s07_t02.js` to validate all updates include required honest phrases and exclude forbidden overclaiming phrases

5. Run the test with `node --test scripts/test_m012_s07_t02.js`

## Must-Haves

- [ ] R022 notes include "auto-mode constraint" and "re-scoped" language
- [ ] R023 notes reflect re-scope rather than live HITL confirmation
- [ ] Requirement outcomes R022 row updated honestly
- [ ] No forbidden overclaiming phrases present (e.g. "user confirmed", "explicitly confirmed by user")

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S07-rescope-decision.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S07-requirement-update-evidence.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/REQUIREMENTS.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S04-requirement-outcomes.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/M012-ihd2ez-ROADMAP.md`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/REQUIREMENTS.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S04-requirement-outcomes.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/M012-ihd2ez-ROADMAP.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/test_m012_s07_t02.js`

## Verification

node --test scripts/test_m012_s07_t02.js
