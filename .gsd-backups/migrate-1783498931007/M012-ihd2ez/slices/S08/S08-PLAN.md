# S08: Coverage Boundary and Secret Scan Remediation

**Goal:** S06 closeout secret scan passes, R003 has truthful coverage or descoping evidence, S05/S06/S07 handoffs are reflected in the roadmap, and validation round 1 has coherent success criteria, verification classes, and requirement coverage.
**Demo:** After this: S06 closeout secret scan passes, R003 has truthful coverage or descoping evidence, S05/S06/S07 handoffs are reflected in the roadmap, and validation round 1 has coherent success criteria, verification classes, and requirement coverage.

## Must-Haves

- S06 closeout validator passes with 31/31 checks and S07 closeout validator passes with 27/27 checks, both showing `verdict: \"pass\"`.
- `runtime-evidence/M012-S08-r003-coverage.json` exists and documents R003 coverage assessment with truthful language.
- `.gsd/REQUIREMENTS.md` and `runtime-evidence/M012-S04-requirement-outcomes.md` both reference M012 S08 R003 coverage.
- `runtime-evidence/M012-S08-validation-readiness.json` exists with success criteria checklist, verification classes, requirement coverage matrix, slice delivery audit, and cross-slice integration assessment.
- `scripts/validate_m012_s08_closeout.js` runs cleanly and produces `runtime-evidence/M012-S08-closeout-gate.json` with `verdict: \"pass\"`.

## Threat Surface

## Q3 Findings

- **Attack surface:** No externally reachable API, UI, DB mutation path, authentication flow, or network request is introduced by S08.
- **Parameter tampering / replay / privilege escalation:** Not applicable to the slice mechanics because validators and reconciliation artifacts operate on hardcoded local files and deterministic checks.
- **Data exposure:** The relevant exposure is pre-existing raw credential literals in prior S06/S07 task summaries; S08 T01 explicitly remediates these and requires S06/S07 closeout validators to pass without echoing secret values.
- **Trust boundaries:** No untrusted user input reaches a database, API, or filesystem through this slice. File writes are planned validation artifacts and requirement documentation updates.
- **Verification expectation:** Secret-scan failure output must remain metadata-only (pattern name plus file:line), never matched secret values.

## Requirement Impact

## Q4 Findings

- **Directly touched requirement:** R003, because S08 creates `runtime-evidence/M012-S08-r003-coverage.json` and updates `.gsd/REQUIREMENTS.md` plus `runtime-evidence/M012-S04-requirement-outcomes.md` with truthful M012 S08 coverage traceability.
- **Indirectly touched requirements:** R022 and R023 through validation-readiness and S07 re-scope coherence; the S08 readiness matrix should also preserve full M012 requirement coverage references for R017-R025 where applicable.
- **Must be re-tested after shipping:** run `node scripts/validate_m012_s06_closeout.js && node scripts/validate_m012_s07_closeout.js`, `node --test scripts/test_m012_s08_t02.js`, and `node scripts/validate_m012_s08_closeout.js`; inspect generated closeout/readiness artifacts for `verdict: "pass"` and truthful requirement coverage language.
- **Decisions to revisit:** None identified. S08 is a reconciliation and validation-readiness slice, not a scope expansion.

## Proof Level

- This slice proves: This slice proves contract and UAT readiness for M012 validation round 1. No real runtime required. No human/UAT required beyond documentation review.

## Integration Closure

- Upstream surfaces consumed: S06 closeout gate (`runtime-evidence/M012-S06-closeout-gate.json`), S07 closeout gate (`runtime-evidence/M012-S07-closeout-gate.json`), S05/S06/S07 slice summaries, M012 roadmap, and canonical requirement files.
- New wiring introduced: S08 aggregate closeout validator chains all prior validators plus secret scan and validation readiness checks.
- What remains before the milestone is truly usable end-to-end: M012 validation round 1 (`gsd_validate_milestone`) must be executed next. S08 is the final pre-validation slice.

## Verification

- Runtime signals: S08 closeout gate (`runtime-evidence/M012-S08-closeout-gate.json`) provides observable validation health.
- Inspection surfaces: rerun `node scripts/validate_m012_s08_closeout.js` to inspect current state.
- Failure visibility: any failed section reports file:line:pattern metadata for secret scans, or specific check names for validator regressions.
- Redaction constraints: validators must never echo matched secret values; report only pattern names and file:line metadata.

## Tasks

- [x] **T01: Secret Scan Remediation and S06/S07 Validator Pass** `est:30m`
  Redact raw credential literals from S06 and S07 task summary files that cause closeout validator secret-scan failures.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/slices/S06/tasks/T01-SUMMARY.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/slices/S06/tasks/T05-SUMMARY.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/slices/S07/tasks/T03-SUMMARY.md`
  - Verify: node scripts/validate_m012_s06_closeout.js && node scripts/validate_m012_s07_closeout.js

- [x] **T02: R003 Coverage Evidence and Requirement Reconciliation** `est:45m`
  Document R003 coverage for M012 and reconcile requirement outcomes to include R003 traceability.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/REQUIREMENTS.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S04-requirement-outcomes.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/test_m012_s08_t02.js`
  - Verify: node --test scripts/test_m012_s08_t02.js

- [x] **T03: S08 Aggregate Closeout and Validation Readiness** `est:1h`
  Build the S08 aggregate closeout validator and validation readiness artifact to prepare M012 for validation round 1.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s08_closeout.js`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S08-validation-readiness.json`
  - Verify: node scripts/validate_m012_s08_closeout.js

## Files Likely Touched

- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/slices/S06/tasks/T01-SUMMARY.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/slices/S06/tasks/T05-SUMMARY.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/milestones/M012-ihd2ez/slices/S07/tasks/T03-SUMMARY.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/REQUIREMENTS.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S04-requirement-outcomes.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/test_m012_s08_t02.js
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s08_closeout.js
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S08-validation-readiness.json
