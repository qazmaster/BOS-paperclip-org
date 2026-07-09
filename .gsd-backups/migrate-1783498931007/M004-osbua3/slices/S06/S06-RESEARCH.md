# S06 Research: Reconcile Requirement Coverage

## Summary
- M004 requirement coverage is already substantively complete: S05 validated R012-R016, and the M004 milestone summary already records explicit requirement outcomes for each touched requirement.
- The remaining gap is traceability, not product behavior. A reviewer still lacks a dedicated machine-readable coverage artifact that ties each M004 requirement to its proof source in a single place.
- M002 S13 is the closest precedent and shows a safe pattern: a coverage ledger JSON plus validator/test pair, with explicit no-promotion and redaction safeguards.
- Ownership provenance must stay separate from validation evidence. R012-R014 and R016 keep their earlier primary owners; R015 is the only M004-originated requirement. Reconcile coverage without normalizing those owners unless the requirement itself changes.

## Requirement Coverage Landscape
- The current M004 summary already states `Requirement Outcomes` for R012-R016, so the human-readable story is present.
- S05 summary also states that R012-R016 were validated by the closeout regression suite, with fresh proof in `.gsd/exec/8a0b5a07-20e9-4cb2-9900-e826114dc6c6.stdout`.
- `gsd_milestone_status` shows S06 and S07 as pending with zero tasks, so the slice still needs decomposition before implementation.
- In this worktree there is no M004-specific coverage ledger yet under `runtime-evidence/`, so a reviewer must reconstruct coverage from milestone summaries and the requirements record.

## Implementation Landscape
- `M004-osbua3-SUMMARY.md` is the main reader-facing source that already lists the covered requirements.
- `S05-SUMMARY.md` is the regression-closeout source that explains which proof set validated R012-R016.
- `runtime-evidence/M002-S13-requirement-coverage.json` is the best structural precedent for a coverage ledger. It uses `coverage_summary`, `evidence_citations`, and a `safety` block that preserves no-promotion posture.
- `scripts/validate_s13_requirement_coverage.py` and `scripts/test_validate_s13_requirement_coverage.py` show the validator/test shape that can be mirrored if M004 wants a dedicated coverage check.

## Findings
- M004 does not appear to need requirement status changes; the practical gap is explicit coverage traceability.
- The likely missing artifact is a coverage ledger that says, for each touched requirement, whether it is covered, how it is covered, and which M004 evidence proves it.
- The correct output should be a coverage artifact, not a reclassification of validated requirements back to active or out-of-scope.
- If a requirement note needs correction, it should correct scope/provenance only; ownership should remain stable unless the requirement origin truly changed.

## Risks and Constraints
- Do not overwrite validated requirement statuses with ad hoc active/out_of_scope labels; the ledger should be additive.
- Keep S06 focused on coverage reconciliation. S07 is the slice that restores validation-evidence artifacts and should not be absorbed into this work.
- Preserve the conservative no-promotion posture inherited from S05; coverage work should not imply any new runtime capability.
- Because the current worktree does not expose `.gsd/REQUIREMENTS.md` or M004 runtime-evidence files as ordinary local files, the implementation should rely on GSD-generated artifacts and the milestone summary as the source of truth.

## Natural Seams
1. Coverage ledger generation from the current M004 requirement outcomes and S05 proof paths.
2. Validator/test pair to make the ledger machine-checkable and fail-closed.
3. Reader-facing summary or assessment note that cites the coverage ledger without changing requirement provenance.

## First Proof
- Reconcile the M004 summary requirement outcomes against the requirement records and S05 proof before writing any new artifact.
- If any mismatch appears, fix traceability notes first; do not reassign ownership unless the requirement origin itself changes.
- Use the M002 S13 ledger structure as the baseline for the first implementation pass.

## Verification Shape
- If a dedicated validator is added, expected checks are a ledger-phase validation, a final-phase validation, and a unit test file mirroring the M002 S13 pattern.
- If no new validator is added, the minimum proof should be a deterministic scan/diff showing that the M004 requirement outcomes, requirement record, and S05 regression evidence all agree on R012-R016 coverage.
- After any artifact changes, rerun the focused coverage verification before considering the slice ready for the S07 evidence-restoration work.

## Sources / Precedent
- `.gsd/milestones/M004-osbua3/M004-osbua3-SUMMARY.md`
- `.gsd/milestones/M004-osbua3/slices/S05/S05-SUMMARY.md`
- `.gsd/milestones/M004-osbua3/M004-osbua3-ROADMAP.md`
- `.gsd/milestones/M002/M002-CONTEXT.md`
- `.gsd/milestones/M002/M002-ROADMAP.md`
- `runtime-evidence/M002-S13-requirement-coverage.json`
- `scripts/validate_s13_requirement_coverage.py`
- `scripts/test_validate_s13_requirement_coverage.py`
