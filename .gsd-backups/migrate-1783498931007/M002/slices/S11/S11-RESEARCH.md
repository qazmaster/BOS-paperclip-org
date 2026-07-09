# S11 Research: Validation artifact repair

## Summary

M002 still has an artifact-layer gap even though the runtime posture is already settled. In the current worktree, the milestone root only contains `M002-RESEARCH.md` and `M002-ROADMAP.md`; it does **not** yet have a milestone context or milestone assessment artifact. At the slice level, S09 and S10 are complete in GSD DB and already have `SUMMARY.md` and `UAT.md`, but they do **not** have canonical `ASSESSMENT.md` artifacts on disk.

The repair target is therefore documentation/validation completeness, not runtime behavior:

- add a milestone-level context artifact for M002,
- add canonical assessment artifacts for S09 and S10,
- explicitly treat the S01 assessment as historical baseline evidence rather than current closeout posture,
- keep the runtime story aligned with the existing S09/S10 docs, audit JSON, and conservative capability matrix.

## Active Requirement Lens

This slice primarily supports the already-active runtime guardrails:

- **R009** — no runtime capability promotion without passing S10 evidence,
- **R010** — Hermes proof still requires wakeCountDelta/resultJson.bos semantics; current auth-denied evidence remains non-proof,
- **R011** — keep no-core-patch, no-private-import, no-direct-DB, and no-plaintext-secret boundaries intact.

It should **not** touch the active M004 org-boundary requirements (**R012–R015**) except to avoid contradicting them.

## Implementation Landscape

### 1) Root milestone context is missing

The M002 root has no `M002-CONTEXT.md` yet. Based on the M001 pattern, this should be the planner-facing, closeout-friendly snapshot that tells future readers what matters now. It should likely:

- summarize S09 as the artifact-reconciliation slice,
- summarize S10 as the proof-gated runtime posture slice,
- state that the current closeout story is fail-closed/no-promotion,
- mark S01 as historical baseline / superseded context rather than the current runtime posture,
- point at the new S09 and S10 assessment artifacts as the stable consumer-facing evidence.

### 2) S09 lacks a canonical assessment artifact

`S09/S09-SUMMARY.md` and `S09/S09-UAT.md` exist, but `S09/S09-ASSESSMENT.md` is missing. The assessment should likely be a concise requirement/coverage note that says:

- S09 repaired the source-of-truth gap by reconciling S08 artifacts and docs,
- the validator/audit/regression chain passed,
- no runtime capability was promoted,
- R009/R010/R011 remain conservative and intact,
- S01 baseline evidence is historical and should not override the S09/S10 closeout story.

### 3) S10 lacks a canonical assessment artifact

`S10/S10-SUMMARY.md` and `S10/S10-UAT.md` exist, but `S10/S10-ASSESSMENT.md` is missing. The assessment should preserve the proof-gated posture already captured in `runtime-evidence/M002-S10-requirement-scope-resolution.json`, the S10 summary, and the S10 UAT. It should state that:

- Hermes and GSD-Pi remain fail-closed/unpromoted,
- the S10 evidence is valid blocker evidence, not runtime proof,
- no requirement re-scope was required in the recorded resolution,
- R009/R010/R011 remain supported without weakening boundary rules.

### 4) S01 assessment conflict should be resolved by supersession, not deletion

`S01/S01-ASSESSMENT.md` exists and is a valid historical artifact, but it is not the current closeout posture. The cleanest approach is to make the new milestone context explicitly say that S01 is historical baseline evidence and that the closeout source of truth now comes from S09/S10. That avoids rewriting the S01 artifact while removing ambiguity for future validators and readers.

## Risks / Gotchas

- Do not reinterpret S01 browser-executable failure as a current runtime blocker for later slices; it is historical context.
- Do not alter the validated docs/matrix/runtime-evidence posture unless the planner discovers a concrete mismatch.
- Keep all new prose fail-closed and redacted; no new runtime claims, no secrets, no direct DB or core references.
- Avoid mixing milestone context with milestone validation; the latter should remain a later gate if/when the milestone is actually ready.

## First Proof

The best first proof is purely filesystem-based:

1. create `M002-CONTEXT.md`,
2. create `S09/S09-ASSESSMENT.md`,
3. create `S10/S10-ASSESSMENT.md`,
4. if needed, add `M002-ASSESSMENT.md` as the consumer-facing closeout assessment,
5. verify the new artifacts are non-empty and mutually consistent.

If milestone validation is part of the follow-up slice, it should happen only after the artifact set is repaired.

## Verification Targets

- `test -s .gsd/milestones/M002/M002-CONTEXT.md`
- `test -s .gsd/milestones/M002/slices/S09/S09-ASSESSMENT.md`
- `test -s .gsd/milestones/M002/slices/S10/S10-ASSESSMENT.md`
- `gsd_milestone_status(M002)` to confirm the slice DB state still matches the filesystem story
- later milestone validation, if the repaired artifact set is intended to feed closeout

## Sources Reviewed

- `.gsd/milestones/M002/M002-RESEARCH.md`
- `.gsd/milestones/M002/M002-ROADMAP.md`
- `.gsd/milestones/M002/slices/S01/S01-ASSESSMENT.md`
- `.gsd/milestones/M002/slices/S01/S01-UAT.md`
- `.gsd/milestones/M002/slices/S09/S09-SUMMARY.md`
- `.gsd/milestones/M002/slices/S09/S09-UAT.md`
- `.gsd/milestones/M002/slices/S10/S10-SUMMARY.md`
- `.gsd/milestones/M002/slices/S10/S10-UAT.md`
- `runtime-evidence/M002-S10-requirement-scope-resolution.json`
- `PAPERCLIP_LIVE_VALIDATION_REPORT.md`
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `plugin-bos-light/capabilities.paperclip-runtime.json`

## Skill Fit

This is a docs-only repair slice. The installed `write-docs` skill is the closest match; final completion should follow `verify-before-complete` discipline when the artifacts are actually written and checked.