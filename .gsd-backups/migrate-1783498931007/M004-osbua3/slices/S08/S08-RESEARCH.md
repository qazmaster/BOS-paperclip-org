# S08 Research — Reconcile Full Requirement Scope

## Summary
M004 is blocked on traceability, not on new runtime capability. The current milestone validation says R003 is missing, R008 is missing, and R009/R010/R011 are only partial, while R012-R016 are already covered. S08 therefore needs to make the requirement story explicit and machine-checkable using existing evidence only; it should not attempt new live Paperclip proof or reassign ownership to M004.

## Requirement Landscape
- **R003** is active and owned by M003 S02. M003 context defines it as preserving Paperclip as the system of record and preventing BOS Light from owning governance state.
- **R008** is active and owned by M003 S03. M003 context defines it as keeping approval/request ownership Paperclip-native and preventing fallback comments from substituting for native approval state.
- **R009** is preserved from M002: runtime capability promotion remains proof-gated, and fail-closed blocker evidence is not runtime proof.
- **R010** is preserved from M002: future Hermes proof still requires supported-boundary execution evidence, exactly one bounded run/readback, `wakeCountDelta=1`, and passing `resultJson.bos`.
- **R011** is preserved from M002: supported boundaries remain mandatory, with no Paperclip core patch, no private internal dependency, no direct database mutation, and no plaintext credential logging.

M004 validation already names the gap clearly: R003 and R008 are missing; R009-R011 are partial. That means the slice needs explicit disposition records, not a reinterpretation of the requirements.

## Evidence Available
The repository already has the right local patterns to cite:
- `plugin-bos-light/src/bettingTable.ts` only marks rows `APPROVAL_REQUESTED` and stores native approval ids/status when `createApprovalRequest` succeeds. Markdown-only and `comments.native` fallbacks return diagnostics and do not mutate approval rows.
- `plugin-bos-light/src/persistence.ts` keeps decision persistence as native artifact mirroring plus cache-overlay state; the in-memory store is not durable truth.
- `plugin-bos-light/src/evalGateEvidence.ts` and `plugin-bos-light/src/circuitBreakerFlow.ts` both use envelope + fallback diagnostics patterns that preserve visible evidence without pretending unsupported surfaces are promoted.
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md` explicitly keeps `approvals.native` unvalidated, plugin UI/actions fallback-only or unvalidated, and says comment/markdown fallbacks must never become native approvals.
- `.gsd/milestones/M002/M002-CONTEXT.md` and `.gsd/milestones/M002/M002-ASSESSMENT.md` preserve R009-R011.
- `.gsd/milestones/M003/M003-CONTEXT.md` and `.gsd/milestones/M003/M003-ROADMAP.md` define R003/R008 and keep plugin UI/actions/native approvals out of scope for promotion.

The S08 slice directory is currently empty, while S06 and S07 already created their own ledger/audit layers. That suggests S08 should add a narrow reconciliation layer rather than retrofitting earlier evidence.

## Implementation Landscape
The most likely seam is a small requirement-scope reconciliation package under S08 with a companion validator:
- `runtime-evidence/M004-S08-requirement-scope-reconciliation.json` or equivalent ledger
- `runtime-evidence/M004-S08-requirement-scope-audit.json`
- `scripts/validate_m004_s08_requirement_scope.py`
- `scripts/test_validate_m004_s08_requirement_scope.py`
- slice-level `S08-SUMMARY.md`, `S08-ASSESSMENT.md`, and `S08-UAT.md`

The validator should follow the existing M004/M002 pattern: standard-library only, local-file only, fail closed, secret-redacted diagnostics, and explicit per-requirement disposition rows. The useful shape is likely:
- requirement id
- current status/class/owner provenance
- explicit disposition for M004
- coverage summary or no-scope-change rationale
- bounded citations into M002/M003 context, runtime health, and local code seams
- audit summary with zero missing or partial dispositions

## Risks and Constraints
- Do **not** normalize ownership to S08 or M004 for R003/R008; they belong to M003’s decision/artifact boundary.
- Do **not** turn traceability work into runtime promotion. This slice should prove scope reconciliation, not live Paperclip capability.
- Do **not** let fallback comments or markdown imply native approval truth. R008 specifically guards that boundary.
- R011 should stay framed as supported-boundary hygiene, not as a new runtime execution claim.
- Keep citations pointed at existing evidence paths only; no new external proof is needed or desirable here.

## First Proof
The unblocker is a fixture-rooted reconciliation validator that fails if any of R003, R008, R009, R010, or R011 is missing, partially disposed, or uncited, and passes only when each requirement has an explicit disposition and provenance note. That gives reviewers a single place to inspect the full scope reconciliation before milestone validation is rerun.

## Planner Notes
This slice should stay narrow and local. Prefer one small ledger + one validator + one audit path over broad doc churn. The highest-value seam is the explicit requirement disposition table; once that exists, the milestone validator can point to it without reopening runtime capability questions.

## Verification
Recommended checks for the implementation slice:
- `python3 -m unittest scripts/test_validate_m004_s08_requirement_scope.py`
- `python3 scripts/validate_m004_s08_requirement_scope.py --phase final --write-audit runtime-evidence/M004-S08-requirement-scope-audit.json`
- `python3 -m json.tool runtime-evidence/M004-S08-requirement-scope-audit.json`
- rerun the M004 milestone validation after the audit exists
