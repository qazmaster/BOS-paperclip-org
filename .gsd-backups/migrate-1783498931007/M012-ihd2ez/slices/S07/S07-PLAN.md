# S07: Explicit Confirmation Mission Anchor Remediation

**Goal:** In auto-mode (no human available), formally re-scope the milestone success criterion for BOS-3 explicit confirmation, update requirement outcomes honestly, and produce a passing closeout gate.
**Demo:** After this: explicit user confirmation has either authorized the canonical Paperclip BOS-3 create or reuse target and produced readback evidence with live issue ID, company ID, route, timestamps, and safety flags, or the milestone success criterion has been formally re-scoped before validation round 1.

## Must-Haves

- `runtime-evidence/M012-S07-rescope-decision.json` exists and passes schema validation
- `runtime-evidence/M012-S07-rescope-decision.md` exists and is non-empty
- `runtime-evidence/M012-S07-requirement-update-evidence.json` exists and documents planned changes
- `.gsd/REQUIREMENTS.md` R022 and R023 notes include honest S07 re-scope language
- `runtime-evidence/M012-S04-requirement-outcomes.md` R022 row reflects re-scope
- `.gsd/milestones/M012-ihd2ez/M012-ihd2ez-ROADMAP.md` S07 demo text reflects re-scope outcome
- `scripts/validate_m012_s07_closeout.js` exits 0 and writes `runtime-evidence/M012-S07-closeout-gate.json` with verdict "pass"
- Secret scan over S07 artifacts passes

## Requirement Impact

## Requirements touched

- R022: E2E mission cycle / BOS-3 explicit confirmation outcome is re-scoped with honest language that explicit user confirmation was unavailable in auto-mode.
- R023: HITL gate / confirmation requirement is re-scoped with honest language about the auto-mode constraint and what remains unproven.

## Must be re-tested after shipping

- Verify `.gsd/REQUIREMENTS.md` R022 and R023 notes include honest S07 re-scope language.
- Verify `runtime-evidence/M012-S04-requirement-outcomes.md` R022 row reflects the re-scope.
- Verify `.gsd/milestones/M012-ihd2ez/M012-ihd2ez-ROADMAP.md` S07 demo text reflects the re-scope outcome.
- Run `node scripts/validate_m012_s07_closeout.js` and confirm it writes `runtime-evidence/M012-S07-closeout-gate.json` with verdict `pass`.
- Confirm the S07 secret scan passes.

## Decisions to revisit

None before S07 execution; this slice is documentation/process remediation. The next validation slice should revisit whether the overall milestone success criterion remains coherent after R022/R023 are re-scoped.

## Proof Level

- This slice proves: operational

## Integration Closure

Upstream surfaces consumed: S06 closeout validator, S06 requirement update evidence, S06 mission issue evidence. New wiring introduced: none — this slice is documentation and process validation only. What remains before milestone validation: S08 must ensure secret scan passes, R003 has truthful coverage, and validation round 1 has coherent criteria.

## Verification

- `runtime-evidence/M012-S07-closeout-gate.json` records pass/fail state and full check breakdown. `scripts/validate_m012_s07_closeout.js` prints sectioned gate results and fails closed on missing artifacts, forbidden phrases, regression, or secret-scan failures.

## Tasks

- [x] **T01: Document auto-mode constraint and produce re-scope decision artifacts** `est:30m`
  ---
  estimated_steps: 5
  estimated_files: 4
  skills_used:
    - verify-before-complete
  ---
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/test_m012_s07_t01.js`
  - Verify: node --test scripts/test_m012_s07_t01.js

- [x] **T02: Update canonical requirement and roadmap artifacts** `est:30m`
  ---
  estimated_steps: 5
  estimated_files: 4
  skills_used:
    - verify-before-complete
  ---
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/REQUIREMENTS.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S04-requirement-outcomes.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/M012-ihd2ez-ROADMAP.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/test_m012_s07_t02.js`
  - Verify: node --test scripts/test_m012_s07_t02.js

- [x] **T03: Build and run S07 aggregate closeout validator** `est:45m`
  ---
  estimated_steps: 3
  estimated_files: 2
  skills_used:
    - verify-before-complete
  ---
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s07_closeout.js`
  - Verify: node scripts/validate_m012_s07_closeout.js

## Files Likely Touched

- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/test_m012_s07_t01.js
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/REQUIREMENTS.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S04-requirement-outcomes.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/M012-ihd2ez-ROADMAP.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/test_m012_s07_t02.js
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s07_closeout.js
