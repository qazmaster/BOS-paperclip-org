# S07: Restore Validation Evidence Artifacts

**Goal:** Restore the missing milestone-level validation evidence package for M004-osbua3 so reviewers can inspect a populated Boundary Map, context, assessment, S07 assessment, final validation artifact, and local audit proof without changing R012-R016 ownership/status or promoting live Paperclip capability.
**Demo:** A reviewer can inspect the roadmap Boundary Map, milestone context or equivalent verification-class planning, and slice assessment artifacts, then rerun milestone validation without artifact-presence gaps.

## Must-Haves

- Roadmap Boundary Map is no longer blank and explicitly maps S01-S06 evidence flows into M004 closeout and S07 validation restoration.
- Milestone context, milestone assessment, S07 assessment, and milestone validation artifacts exist, are reviewer-readable, and cite existing local S06/S05 evidence paths instead of inventing proof.
- A standard-library local validator with fixture-rooted tests proves the restored artifacts are present, internally trace R012-R016, preserve traceability-only/no-promotion posture, and expose shaped diagnostics.
- Final verification reruns S06 requirement coverage validation and S07 artifact validation locally with no network, no external IO, no runtime services, and no `.gsd` reads from unit tests.

## Threat Surface

## Abuse scenarios considered

- **Capability-promotion / traceability drift:** Restored milestone docs or validation text could falsely turn prior local evidence into a live Paperclip runtime capability claim. Mitigation required by the slice plan: preserve traceability-only posture, keep `live_runtime_capability_promoted`/runtime promotion flags false, and have the S07 validator reject promotion wording.
- **Boundary weakening:** Reviewer-facing docs could weaken Div6-only external I/O ownership, Div5 quarantine/sanitization, or Div1.HCO/Div3.Treasury routing. Mitigation: restored artifacts must cite existing S01-S06 evidence and preserve R012-R016 ownership/status without re-owning or broadening scope.
- **Filesystem/path abuse:** The new validator reads markdown/JSON from a repository root and writes an audit artifact, so unsafe path handling could allow traversal outside the fixture/repo root. Mitigation: root-bounded path resolution, explicit expected paths, no network, no subprocess, and no database access from unit tests.
- **Secret or PII exposure:** The slice should only cite local artifact paths/statuses, but malformed docs or audit inputs may contain secret-like values that diagnostics could echo. Mitigation: reject plaintext secret-like values and emit shaped, redacted diagnostics only.
- **Replay/stale evidence:** S07 consumes S06 ledger/audit evidence; stale or missing upstream artifacts could be re-used as proof. Mitigation: final verification must rerun the S06 requirement coverage validator and S07 final validator locally before completion.

## Trust boundaries

- Inputs are repository-local markdown/JSON artifacts, including `.gsd/milestones/M004-osbua3/...` docs and `runtime-evidence/M004-S06-*` files.
- Unit tests must use temporary fixture roots and must not read `.gsd`, `.planning`, `.audits`, or gitignored planning paths.
- No user-supplied web/API input, external services, tokens, PII stores, runtime databases, or live Paperclip surfaces are part of this slice.

## Gate conclusion

No unmitigated exploitation path is apparent before execution if the validator implements root-bounded reads, redacted diagnostics, no-network/no-runtime behavior, and fail-closed checks for R012-R016 traceability and no-promotion posture.

## Requirement Impact

## Requirements touched

The milestone-level requirements artifact named in the prompt (`.gsd/milestones/M004-osbua3/REQUIREMENTS.md`) is absent in this worktree; S07's own plan and existing S06/M004 artifacts identify the active requirement set as **R012-R016**. S07 supports these requirements only by restoring validation evidence artifacts and must not alter ownership, status, success criteria, or live runtime capability claims.

- **R012** — v1.4.1 doctrine/division-map adoption evidence must remain traceable through the restored Boundary Map, context, assessment, validation artifact, and S06 coverage ledger.
- **R013** — Div6.External-only external-world ownership must remain represented and must not be weakened by restored docs or validation prose.
- **R014** — Div5.QualificationsLibraryLearning quarantine/sanitization evidence must remain represented, including negative-test/no-raw-evidence posture where applicable.
- **R015** — Div1.HCO routing/control and Div3.Treasury paid/credentialed grant routing must remain represented without shifting ownership to S07.
- **R016** — Paperclip/runtime capability posture must remain fallback-only/unvalidated unless live surface-specific proof exists; S07 must not promote live Paperclip capability.

## Must re-test after shipping

- `python3 -m unittest scripts/test_validate_m004_s07_validation_artifacts.py`
- `python3 scripts/validate_m004_requirement_coverage.py --phase final`
- `python3 scripts/validate_m004_s07_validation_artifacts.py --phase final --write-audit runtime-evidence/M004-S07-validation-artifacts-audit.json`
- `python3 -m json.tool runtime-evidence/M004-S07-validation-artifacts-audit.json`
- Reviewer-readable artifact inspection: populated Boundary Map, milestone context, milestone assessment, S07 assessment, final validation markdown, S06 ledger/audit citations, and zero runtime-promotion language.

## Decisions to preserve / revisit

The task plans call out decisions **D012, D013, D014, D015, D020, and D021** as preserved. No decision needs revisiting for this slice because the scope is artifact restoration and validation evidence only, not a change to requirement ownership, doctrine, routing, security policy, or live runtime behavior.

## Proof Level

- This slice proves: Final-assembly artifact proof. Real runtime required: no. UAT required: documentation/reviewer-readable UAT only; no browser or live Paperclip UAT. Verification classes: Contract for restored artifact shape and Boundary Map content, Integration for S01-S06 evidence wiring into milestone closeout, Operational for local fail-closed validators/audits, and UAT for reviewer-readable validation narrative.

## Integration Closure

Upstream consumed: S01-S06 summaries/UAT, S06 coverage ledger/audit, M004 milestone summary, and prior M002/M001 artifact patterns. New wiring: restored milestone context/assessment/validation docs plus S07 artifact validator/audit. Remaining before milestone closeout: after these tasks pass, only normal GSD slice completion and milestone completion remain; no requirement records or runtime claims need to change.

## Verification

- Adds local inspection surfaces for artifact-presence failures: restored docs, `scripts/validate_m004_s07_validation_artifacts.py`, fixture tests, and `runtime-evidence/M004-S07-validation-artifacts-audit.json`. The audit should include pass/fail classification, required artifacts, required R012-R016 coverage, diagnostics with artifact path/problem kind/validation class, no-network posture, and no runtime capability promotion flags.

## Tasks

- [x] **T01: Restore Boundary Map and milestone assessment package** `est:1h`
  Expected executor task-plan frontmatter: estimated_steps: 7; estimated_files: 4; skills_used: [write-docs, security-review, verify-before-complete].
  - Verify: test -s .gsd/milestones/M004-osbua3/M004-osbua3-CONTEXT.md && test -s .gsd/milestones/M004-osbua3/M004-osbua3-ASSESSMENT.md && test -s .gsd/milestones/M004-osbua3/slices/S07/S07-ASSESSMENT.md && test -s .gsd/milestones/M004-osbua3/M004-osbua3-ROADMAP.md && python3 -m json.tool runtime-evidence/M004-S07-restored-artifact-inventory.json

- [x] **T02: Add fail-closed validator for restored validation artifacts** `est:1h 30m`
  Expected executor task-plan frontmatter: estimated_steps: 8; estimated_files: 2; skills_used: [test, lint, security-review, verify-before-complete].
  - Verify: python3 -m unittest scripts/test_validate_m004_s07_validation_artifacts.py

- [x] **T03: Persist final validation artifact and audit proof** `est:1h`
  Expected executor task-plan frontmatter: estimated_steps: 6; estimated_files: 2; skills_used: [test, security-review, verify-before-complete].
  - Verify: python3 -m unittest scripts/test_validate_m004_s07_validation_artifacts.py && python3 scripts/validate_m004_requirement_coverage.py --phase final && python3 scripts/validate_m004_s07_validation_artifacts.py --phase final --write-audit runtime-evidence/M004-S07-validation-artifacts-audit.json && python3 -m json.tool runtime-evidence/M004-S07-validation-artifacts-audit.json
