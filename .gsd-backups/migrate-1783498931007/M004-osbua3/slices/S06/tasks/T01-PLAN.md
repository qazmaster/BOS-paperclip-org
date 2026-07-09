---
estimated_steps: 6
estimated_files: 1
skills_used: []
---

# T01: Create M004 coverage ledger

Expected task-plan frontmatter: estimated_steps: 6; estimated_files: 1; skills_used: [write-docs, verify-before-complete].

Why: S05 already validated R012-R016, but reviewers currently have to reconstruct coverage from summaries and requirement records. S06 needs a single durable ledger that states each touched requirement is COVERED without changing requirement ownership or scope.

Do: Create `runtime-evidence/M004-S06-requirement-coverage.json` using the M002 S13 ledger shape as the nearest precedent, adapted for M004. Include `schema_version`, `artifact_type`, `generated_at`, `milestone`, `slice`, `validation_round`, `source_of_truth`, `inputs`, `requirements`, and `safety`. The `requirements` array must contain exactly R012, R013, R014, R015, and R016. For each record include `requirement_id`, `status: validated`, `coverage_status: covered`, `requirement_class`, canonical requirement text or bounded canonical summary, existing primary owner provenance, `m004_disposition: covered_in_m004`, `runtime_proof_claimed: false` unless the requirement is explicitly about repository-local runtime posture, `live_runtime_capability_promoted: false`, `coverage_summary`, and evidence citations. Preserve provenance: R015 is M004-originated; R012-R014 and R016 keep their existing primary owners rather than being normalized to S06. Cite the M004 milestone summary, S05 summary, S05 proof stdout paths, and relevant local validators or docs as strings. Do not copy secret values or raw credentials into the ledger.

Done when: the JSON is valid, self-contained enough for the validator to check R012-R016 coverage status, and clearly states that no new runtime capability is promoted.

Failure Modes Q5: if an upstream .gsd summary is unavailable, use the inlined task context and note that limitation in `source_of_truth`; if citation paths differ between summaries, record both proof-log paths without treating either as a capability promotion; if requirement owner provenance is uncertain, preserve the existing owner text from context and add an `owner_reconciliation` note instead of inventing a new owner.

Load Profile Q6: local JSON only, trivial cost. Negative Tests Q7 to support in the later validator: missing R016, unknown extra requirement, non-validated status, non-covered coverage status, owner-provenance mutation, capability promotion flag, and secret-like strings.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/.gsd/milestones/M004-osbua3/M004-osbua3-SUMMARY.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/.gsd/milestones/M004-osbua3/slices/S05/S05-SUMMARY.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/.gsd/exec/f3fb5605-43ce-4a3f-badf-77029cc18522.stdout`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/.gsd/exec/8a0b5a07-20e9-4cb2-9900-e826114dc6c6.stdout`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/runtime-evidence/M002-S13-requirement-coverage.json`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/runtime-evidence/M004-S06-requirement-coverage.json`

## Verification

python3 -m json.tool runtime-evidence/M004-S06-requirement-coverage.json

## Observability Impact

Creates the reviewer-facing coverage ledger and makes proof citations explicit without adding runtime behavior.
