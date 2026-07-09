# S06: Reconcile Requirement Coverage

**Goal:** Reconcile M004 requirement coverage by adding a repository-local, machine-checkable coverage ledger for R012-R016 plus a fail-closed validator and final audit artifact. This slice is traceability-only: it must preserve existing requirement provenance, keep R012-R016 validated and covered, and avoid promoting any live Paperclip runtime capability beyond the S05 evidence.
**Demo:** A reviewer can inspect requirement records and slice evidence and see explicit COVERED status or corrected ownership/scope for every requirement touched by M004, with fresh local verification evidence attached.

## Must-Haves

- Slice verification is defined before implementation: `python3 -m unittest scripts/test_validate_m004_requirement_coverage.py` must pass, and `python3 scripts/validate_m004_requirement_coverage.py --phase final --write-audit runtime-evidence/M004-S06-coverage-validation.json` must pass and write a passing audit. Threat Surface Q3: no auth or external IO is introduced; exploitable risks are coverage overclaim, stale ownership normalization, secret-like proof text copied into JSON, malformed JSON, and accidental live-runtime capability promotion. Requirement Impact Q4: touches validated R012, R013, R014, R015, and R016 as traceability evidence only; no active requirements are owned by this slice, and unrelated active R003/R008 are not in scope. Re-verify D012, D013, and D014 remain consistent by requiring v1.4.1 coverage, Div6-only external IO and Div5 quarantine coverage, Div1.HCO routing coverage, and no capability promotions. The tests must use temporary fixture roots and must not read .gsd, .planning, .audits, or other gitignored planning paths.

## Threat Surface

## Q3 Threat/Exploit Review

### Scope reviewed
- Slice plan: `.gsd/milestones/M004-osbua3/slices/S06/S06-PLAN.md`
- Expected touched files: `runtime-evidence/M004-S06-requirement-coverage.json`, `scripts/validate_m004_requirement_coverage.py`, `scripts/test_validate_m004_requirement_coverage.py`, and `runtime-evidence/M004-S06-coverage-validation.json`.

### Abuse scenarios
- **Coverage overclaim / capability promotion:** A malformed or overly broad ledger entry could claim R012-R016 are covered, or imply live Paperclip runtime capability, without the S05 evidence actually proving it.
- **Stale ownership normalization:** v1.4.1 ownership could drift back to old division names or omit Div6-only external IO, Div5 quarantine, or Div1.HCO routing while still appearing validated.
- **Secret-like proof text copied into JSON:** Evidence snippets may accidentally embed tokens, credentials, or sensitive URLs in machine-readable artifacts.
- **Malformed JSON / schema drift:** Invalid or partially valid JSON could be accepted if the validator is permissive, leaving reviewers with false confidence.
- **Filesystem trust boundary:** The final validator accepts an audit output path; it should avoid path traversal or accidental writes outside the intended local runtime-evidence boundary.

### Data exposure risks
- No new PII, token, authentication, or external service integration is planned.
- Risk is limited to repository-local evidence text and diagnostics, so validator output should redact secret-like values and avoid printing raw sensitive-looking strings.

### Trust boundaries
- Untrusted or drift-prone inputs are repo-local JSON ledger contents, cited artifact paths, validator CLI arguments, and local filesystem state.
- No user-supplied web/API payloads, database writes, or network calls are introduced.

### Required implementation guardrails
- Fail closed on unknown requirements, missing evidence, malformed JSON, stale division names, capability-promotion language, and missing S05 proof linkage.
- Keep tests fixture-rooted and ensure they do not read `.gsd`, `.planning`, `.audits`, or gitignored planning paths.
- Redact secret-like diagnostics and keep all validation no-network/local-only.
- Constrain or clearly validate audit output writes to expected local evidence paths.

## Requirement Impact

## Q4 Requirement Impact Review

### Requirements touched by S06
- **R012** — v1.4.1 doctrine/import ownership coverage. Re-test that the coverage ledger cites canonical doctrine import, root handoff promotion, company-template/AGENTS remap, and plugin/doc owner remap evidence without changing provenance.
- **R013** — Div6.External external-world ownership. Re-test that coverage preserves Div6-only external IO ownership across doctrine, template routing, AGENTS profiles, acceptance docs, backlog, and risk docs.
- **R014** — Div5.QualificationsLibraryLearning quarantine/sanitization. Re-test that coverage preserves Div5 quarantine, evidence sanitization contracts, external evidence return routing, eval evidence ownership, and negative validator tests.
- **R015** — Div1.HCO routing/control and Div3.Treasury grant routing. Re-test that coverage preserves Div1.HCO routing/control, Div3.Treasury paid/credentialed grant routing, staffing/hats/circuit-breaker/treasury protocols, plugin fixture ownership, and acceptance docs.
- **R016** — conservative Paperclip runtime capability posture. Re-test that coverage and the audit do not promote unproven live Paperclip capability beyond S05 evidence and remain consistent with `validate_runtime_capabilities.py`.

### Explicitly out of scope
- **R003** and **R008** are active/unrelated requirements and should not be claimed as owned or revalidated by this traceability-only slice unless implementation discovers a direct dependency.

### Re-test obligations after shipping
- `python3 -m unittest scripts/test_validate_m004_requirement_coverage.py`
- `python3 scripts/validate_m004_requirement_coverage.py --phase final --write-audit runtime-evidence/M004-S06-coverage-validation.json`
- Inspect the generated audit for passing `COVERED` status/corrected ownership-scope for every touched requirement and no live-runtime capability promotion.

### Decisions to revisit/keep consistent
- **D012** — v1.4.1 coverage must remain canonical and not regress to old ownership semantics.
- **D013** — external IO must remain Div6-only and external evidence must remain quarantined/sanitized through Div5 where applicable.
- **D014** — Div1.HCO routing/control coverage and no-capability-promotion posture must remain consistent with S05 proof and final validation scope.

## Proof Level

- This slice proves: Final-assembly traceability proof. Real runtime required: no. Human or UAT required: no. The slice proves that M004 coverage records are internally consistent, fail closed on drift, cite S05 proof sources, preserve no-promotion posture, and expose diagnostics a reviewer can inspect locally.

## Integration Closure

Upstream consumed: M004 summary outcomes, S05 regression closeout summary, S05 gsd_exec proof logs, and the M002 S13 coverage ledger and validator precedent. New wiring: a new runtime-evidence ledger, a standard-library Python validator, unittest fixture coverage, and a final audit JSON. This prepares S07 by removing requirement-coverage ambiguity; S07 still owns restoration of milestone validation planning and assessment artifacts.

## Verification

- Adds deterministic failure diagnostics through `scripts/validate_m004_requirement_coverage.py` and a durable audit at `runtime-evidence/M004-S06-coverage-validation.json`. Diagnostics should include requirement id, validation class, artifact path, and problem kind while redacting secret-like values and keeping all checks local and no-network.

## Tasks

- [x] **T01: Create M004 coverage ledger** `est:45m`
  Expected task-plan frontmatter: estimated_steps: 6; estimated_files: 1; skills_used: [write-docs, verify-before-complete].
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/runtime-evidence/M004-S06-requirement-coverage.json`
  - Verify: python3 -m json.tool runtime-evidence/M004-S06-requirement-coverage.json

- [x] **T02: Add fail closed coverage validator** `est:1h 30m`
  Expected task-plan frontmatter: estimated_steps: 9; estimated_files: 2; skills_used: [tdd, error-handling-patterns, verify-before-complete].
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/scripts/validate_m004_requirement_coverage.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/scripts/test_validate_m004_requirement_coverage.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/runtime-evidence/M004-S06-requirement-coverage.json`
  - Verify: python3 -m unittest scripts/test_validate_m004_requirement_coverage.py && python3 scripts/validate_m004_requirement_coverage.py --phase ledger

- [x] **T03: Emit final coverage audit** `est:30m`
  Expected task-plan frontmatter: estimated_steps: 5; estimated_files: 1; skills_used: [verify-before-complete].
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/runtime-evidence/M004-S06-coverage-validation.json`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/scripts/validate_m004_requirement_coverage.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/scripts/test_validate_m004_requirement_coverage.py`
  - Verify: python3 scripts/validate_m004_requirement_coverage.py --phase final --write-audit runtime-evidence/M004-S06-coverage-validation.json && python3 -m unittest scripts/test_validate_m004_requirement_coverage.py

## Files Likely Touched

- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/runtime-evidence/M004-S06-requirement-coverage.json
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/scripts/validate_m004_requirement_coverage.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/scripts/test_validate_m004_requirement_coverage.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/runtime-evidence/M004-S06-coverage-validation.json
