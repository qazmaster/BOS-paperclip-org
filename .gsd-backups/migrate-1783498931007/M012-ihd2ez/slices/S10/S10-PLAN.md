# S10: Missing Runtime Requirement Coverage Remediation

**Goal:** Truthfully remove R017 and R019 from M012's touched validation set by updating the validation-readiness artifact, REQUIREMENTS.md, and producing a runtime coverage evidence artifact with documented rationale and blocker citations.
**Demo:** After this: R017 and R019 have scoped runtime proof or are truthfully removed from the M012 touched validation set, with updated requirement outcomes and downstream handoff evidence.

## Must-Haves

- R017 and R019 are removed from M012's touched validation set (marked descoped in validation-readiness JSON with status_change and updated assessment).
- REQUIREMENTS.md has truthful M012 non-addressal notes for R017 and R019.
- S10 runtime coverage artifacts (JSON and MD) document the descoping rationale with blocker citations and safety flags.
- S10 validator passes and writes runtime-evidence/M012-S10-closeout-gate.json with verdict pass.

## Requirement Impact

## Q4 Requirement Coverage Findings

Verdict: pass.

Touched requirements:

- R017: plugin registration/runtime coverage requirement being truthfully removed from the M012 touched validation set.
- R019: Hermes/Xiaomi execution/runtime coverage requirement being truthfully removed from the M012 touched validation set.

Required re-testing after S10:

1. Validation-readiness JSON marks R017 and R019 with `m012_status: "descoped"`, `status_change: "descoped-from-m012"`, and rationale that matches M012 boundaries.
2. `.gsd/REQUIREMENTS.md` includes M012 non-addressal notes for R017 and R019.
3. `runtime-evidence/M012-S10-runtime-requirement-coverage.json` and `.md` exist, are valid/non-empty, and document blocker citations plus safety flags.
4. `scripts/validate_m012_s10_runtime_coverage.js` exits 0 and writes `runtime-evidence/M012-S10-closeout-gate.json` with verdict pass.
5. New S10 artifacts pass the planned forbidden secret-like literal scan.

Decision/scope flag: milestone validation round 1 should revisit requirement outcome claims after S10 so M012 does not over-claim runtime coverage for R017/R019.

## Proof Level

- This slice proves: Contract — artifact schema validation plus validator pass. No live Paperclip mutation. No runtime execution.

## Integration Closure

Upstream surfaces consumed: S08 validation-readiness artifact, S04 final reconciliation artifact, M005 plugin and Hermes probe artifacts. New wiring: S10 closeout gate artifact linking descoping rationale to validation readiness. After this slice: M012 requirement coverage is clean for validation round 1; R017 and R019 are formally removed from the M012 validation set with documented rationale.

## Verification

- S10 closeout gate JSON (runtime-evidence/M012-S10-closeout-gate.json) records aggregate pass/fail health. Validator stdout provides structured check names and file:line metadata for failures. New artifacts are secret-scanned for forbidden patterns.

## Tasks

- [x] **T01: Descope R017 and R019 in validation-readiness JSON and REQUIREMENTS.md** `est:30m`
  Read the S08 validation-readiness JSON and REQUIREMENTS.md. Update the requirement_coverage entries for R017 and R019: set m012_status to "descoped", status_change to "descoped-from-m012", and update assessment with honest rationale documenting M012 scope boundaries (native Paperclip issue flow and local BOS Light orchestration) and external blockers. Add M012 non-addressal notes to the R017 and R019 sections in REQUIREMENTS.md. Create and run a node:test verification script that asserts the descoping language is present in both files.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S08-validation-readiness.json`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/REQUIREMENTS.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/verify_m012_s10_t01.js`
  - Verify: node --test /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/verify_m012_s10_t01.js

- [x] **T02: Create S10 runtime requirement coverage artifacts** `est:30m`
  Create runtime-evidence/M012-S10-runtime-requirement-coverage.json with structured descoping entries for R017 and R019, including requirement text, previous and new status, honest rationale, blocker citations from MEM252/MEM111 and M005 probe artifacts, and safety flags confirming no capability promotion and no live mutation. Create the human-readable markdown companion documenting the same rationale. Create and run a node:test verification script that asserts both files exist, the JSON parses, and the markdown is non-empty.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S10-runtime-requirement-coverage.json`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S10-runtime-requirement-coverage.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/verify_m012_s10_t02.js`
  - Verify: node --test /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/verify_m012_s10_t02.js

- [x] **T03: Create S10 validator and generate closeout gate** `est:45m`
  Create scripts/validate_m012_s10_runtime_coverage.js following the established M012 validator pattern (structured check() function with try/catch, JSON gate artifact output with verdict, checks_total, checks_passed). The validator confirms: (1) S08 validation-readiness JSON no longer lists R017/R019 as active in requirement_coverage, (2) REQUIREMENTS.md R017 and R019 notes mention M012 non-addressal, (3) S10 coverage JSON and MD exist and are valid, (4) no forbidden secret-like literals in S10 artifacts. The validator writes runtime-evidence/M012-S10-closeout-gate.json. Run the validator and confirm it exits 0.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s10_runtime_coverage.js`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S10-closeout-gate.json`
  - Verify: node /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s10_runtime_coverage.js

## Files Likely Touched

- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S08-validation-readiness.json
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/.gsd/REQUIREMENTS.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/verify_m012_s10_t01.js
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S10-runtime-requirement-coverage.json
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S10-runtime-requirement-coverage.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/verify_m012_s10_t02.js
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/scripts/validate_m012_s10_runtime_coverage.js
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M012-ihd2ez/runtime-evidence/M012-S10-closeout-gate.json
