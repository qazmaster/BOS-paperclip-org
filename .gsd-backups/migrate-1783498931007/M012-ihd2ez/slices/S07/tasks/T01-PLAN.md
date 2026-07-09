---
estimated_steps: 26
estimated_files: 1
skills_used: []
---

# T01: Document auto-mode constraint and produce re-scope decision artifacts

---
estimated_steps: 5
estimated_files: 4
skills_used:
  - verify-before-complete
---

Document the auto-mode constraint that prevents explicit user confirmation and produce the formal re-scope decision artifacts.

Path A (user confirms BOS-3 reuse) and Path B (user confirms new issue creation) are both blocked because GSD auto-mode prohibits `ask_user_questions` and no human is available. This task formally selects Path C (re-scope) and produces structured evidence.

## Steps

1. Write `runtime-evidence/M012-S07-rescope-decision.json` with:
   - `schema_version`: "m012-s07-rescope-decision/v1"
   - `decision_type`: "milestone-criterion-rescope"
   - `constraint`: "auto-mode prohibits ask_user_questions"
   - `blocked_paths`: ["Path A: confirm BOS-3 reuse", "Path B: create new issue with confirmation"]
   - `selected_path`: "Path C: formal re-scope"
   - `re_scoped_criterion`: language accepting BOS-3 as mission anchor with preserved deviation note
   - `canonical_company_id`, `issue_id`, `issue_identifier`, timestamps

2. Write `runtime-evidence/M012-S07-rescope-decision.md` as human-readable version

3. Write `runtime-evidence/M012-S07-requirement-update-evidence.json` documenting planned changes to R022, R023, requirement outcomes, and roadmap

4. Write `scripts/test_m012_s07_t01.js` to validate artifact schema and required fields

5. Run the test with `node --test scripts/test_m012_s07_t01.js`

## Must-Haves

- [ ] `runtime-evidence/M012-S07-rescope-decision.json` exists and is valid JSON
- [ ] `runtime-evidence/M012-S07-rescope-decision.md` exists and is non-empty
- [ ] `runtime-evidence/M012-S07-requirement-update-evidence.json` exists and documents R022/R023 changes
- [ ] Test script passes with exit 0

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S06-mission-issue-evidence.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S04-requirement-outcomes.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/REQUIREMENTS.md`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S07-rescope-decision.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S07-rescope-decision.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S07-requirement-update-evidence.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/test_m012_s07_t01.js`

## Verification

node --test scripts/test_m012_s07_t01.js
