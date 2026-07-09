---
estimated_steps: 10
estimated_files: 1
skills_used: []
---

# T01: Restore Boundary Map and milestone assessment package

Expected executor task-plan frontmatter: estimated_steps: 7; estimated_files: 4; skills_used: [write-docs, security-review, verify-before-complete].

Why: S06 already proved R012-R016 coverage, but milestone validation still has artifact-presence gaps: the roadmap Boundary Map is blank/`Not provided`, and the milestone context/assessment plus S07 slice assessment are missing. This task restores the reviewer-facing narrative using existing local proof only.

Do: Populate `.gsd/milestones/M004-osbua3/M004-osbua3-ROADMAP.md` Boundary Map with producer/consumer rows for S01 doctrine import, S02 company-template/AGENTS remap, S03 plugin contracts, S04 acceptance/runtime posture, S05 regression closure, S06 requirement coverage, and S07 validation restoration. Create `.gsd/milestones/M004-osbua3/M004-osbua3-CONTEXT.md` mirroring the M002 context shape: Purpose, Current Source of Truth, Slice Status Narrative, Requirement Posture, Closeout Planning Guidance, and Redaction/Boundary Notes. Create `.gsd/milestones/M004-osbua3/M004-osbua3-ASSESSMENT.md` mirroring the M002 assessment shape: Verdict, Current Closeout Sources, Runtime Surface Assessment, Requirement Assessment for R012-R016, No Promotion Rule, and Recovery Guidance. Create `.gsd/milestones/M004-osbua3/slices/S07/S07-ASSESSMENT.md` summarizing the artifact-restoration scope, evidence inputs, security posture, and what the final validator must prove. Also write `runtime-evidence/M004-S07-restored-artifact-inventory.json` listing the restored artifact paths and evidence sources for a repo-root-visible audit breadcrumb. Cite concrete existing paths such as `runtime-evidence/M004-S06-requirement-coverage.json`, `runtime-evidence/M004-S06-coverage-validation.json`, `S06-SUMMARY.md`, `S06-UAT.md`, and `M004-osbua3-SUMMARY.md`; do not fabricate proof, change requirement statuses, or claim live Paperclip capability.

Done when: The restored/updated docs are non-empty, the Boundary Map is meaningfully populated, the inventory JSON parses, all claims are traceability-only, and the text preserves Div6-only external IO, Div5 quarantine/sanitization, Div1.HCO/Div3.Treasury routing, and no-promotion runtime posture.

Threat Surface (Q3): Documentation can be exploited by overclaiming runtime support or weakening Div6/Div5 quarantine boundaries; keep external IO and raw evidence claims constrained to already-validated doctrine. Sensitive data accessible: none expected; cite paths/statuses only, no credentials. Input trust: local evidence files only.

Requirement Impact (Q4): Supports validated R012-R016 as evidence restoration only. Does not re-own, re-scope, broaden, or revalidate requirements beyond existing S06 proof. Decisions preserved: D012, D013, D014, D015, D020, D021.

Failure Modes (Q5): If an evidence input is missing, write the missing path as a gap and do not replace it with invented proof. If prior evidence is malformed or contradictory, stop and replan rather than normalizing ownership to S07. If capability-promotion wording is tempting, preserve blocker/fallback/unvalidated posture.

Load Profile (Q6): Trivial local document synthesis over bounded markdown/JSON files; no shared runtime resources, subprocesses, network, or database access.

Negative Tests (Q7): Future validator must reject empty Boundary Map, missing context/assessment, missing R012-R016 references, secret-like values, and live runtime promotion language.

Path note: the canonical paths are listed above in this description because the planning tool rejected `.gsd` and repository-relative path arrays under the current duplicate-worktree root registration; executor must still use those paths from the current worktree.

## Inputs

- None specified.

## Expected Output

- Update the implementation and proof artifacts needed for this task.

## Verification

test -s .gsd/milestones/M004-osbua3/M004-osbua3-CONTEXT.md && test -s .gsd/milestones/M004-osbua3/M004-osbua3-ASSESSMENT.md && test -s .gsd/milestones/M004-osbua3/slices/S07/S07-ASSESSMENT.md && test -s .gsd/milestones/M004-osbua3/M004-osbua3-ROADMAP.md && python3 -m json.tool runtime-evidence/M004-S07-restored-artifact-inventory.json

## Observability Impact

Adds reviewer-readable state surfaces for the missing-artifact failure and a repo-visible inventory JSON with explicit evidence paths and no-promotion posture.
