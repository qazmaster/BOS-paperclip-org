# S08: Reconcile Full Requirement Scope

**Goal:** Make the M004 requirement scope for R003, R008, R009, R010, R011 explicit, machine-checkable, and reviewer-readable using existing evidence only, without re-owning active requirements, re-opening validated requirements, or promoting live runtime capability.
**Demo:** Reviewer can inspect an explicit M004 requirement scope reconciliation for R003 R008 R009 R010 R011 and rerun milestone validation with no missing or partial requirement dispositions.

## Must-Haves

- Complete the planned slice outcomes.

## Threat Surface

## Exploit/abuse scenarios

- **Citation path tampering:** The reconciliation ledger is an input to the validator and contains citation paths. If the validator accepts absolute paths, `..` traversal, symlink escapes, or non-evidence paths, a crafted ledger could make validation read unrelated local files or turn private repository material into reviewer-facing evidence.
- **Secret/PII exposure:** Ledger fields and copied citation diagnostics could accidentally include API keys, tokens, raw auth errors, or customer/company identifiers. This is especially relevant because S08 writes reviewer-readable summaries and a final JSON audit under `runtime-evidence/`.
- **False runtime capability promotion:** A malicious or careless edit could set R009-R011 dispositions to imply runtime proof, live capability support, native approval support, Hermes/GSD-Pi execution, or plugin UI/action support that prior evidence explicitly keeps proof-gated/fallback-only.
- **Ownership/privilege drift:** A crafted R003/R008 disposition could shift Paperclip system-of-record or native approval ownership into BOS Light/plugin state, undermining the security/ownership boundary that the slice is supposed to preserve.
- **Replay/stale evidence:** Because S08 uses existing evidence only, stale prior artifacts could be replayed as current proof unless the ledger distinguishes `traceability-only`, `validated`, and `no-reopen-needed` from fresh runtime validation.

## Required mitigations to verify during execution

- Validator must fail closed for missing R003/R008/R009/R010/R011, malformed JSON, missing citations, secret-like values, runtime-promotion flags, and ownership-shift flags as planned.
- Citation handling should be rooted in the repository/worktree, reject traversal/absolute-path escapes where possible, and never use network, subprocesses, database access, or live Paperclip calls.
- Final audit and S08 docs must state `no runtime promotion` and must not transform fallback comments, blocker evidence, or prior fail-closed results into live runtime proof.

## Requirement Impact

## Requirements touched

- **R003** — Directly touched as a missing M004 coverage disposition. S08 must mark it as active, M003-owned, traceability-only/out-of-scope for M004, preserving Paperclip as system of record and preventing BOS Light/plugin-owned governance state.
- **R008** — Directly touched as a missing M004 coverage disposition. S08 must mark it as active, M003-owned, traceability-only/out-of-scope for M004, preserving Paperclip-native approval/request ownership and avoiding plugin-side approval substitution.
- **R009** — Directly touched as a partial M004 coverage disposition. S08 must cite existing M002/M003 evidence and confirm no reopen needed for proof-gated Eval Gate/runtime posture; blocker/fallback evidence must not become capability proof.
- **R010** — Directly touched as a partial M004 coverage disposition. S08 must cite existing evidence for Circuit Breaker/Hermes proof constraints and preserve requirements such as bounded supported-boundary proof and no stale ACTIVE_RUNS_ONLY overclaim.
- **R011** — Directly touched as a partial M004 coverage disposition. S08 must cite prior supported-boundary/no-core-patch/no-private-import/no-direct-DB/no-plaintext-credential evidence and preserve conservative runtime boundaries.

## Must be re-tested after shipping S08

- **S08 ledger schema/completeness:** Validate that all five R-IDs are present with explicit dispositions and citations.
- **Citation integrity:** Validate every cited local evidence path exists and that no citation requires network/live runtime access.
- **Secret safety:** Run validator/unit coverage for secret-like values in ledger/audit fields and ensure final docs do not include raw auth material.
- **No runtime promotion:** Validate audit records `passed=true`, zero errors, and a no-runtime-promotion posture for R009-R011.
- **No ownership shift:** Validate R003/R008 remain Paperclip/M003-owned and are not reopened or re-owned by M004.
- **Regression of planned unit cases:** Run `python3 -m unittest scripts/test_validate_m004_s08_requirement_scope.py` after T02/T03.
- **Milestone validation:** Rerun milestone validation after S08 closeout to confirm MV04 no longer reports R003/R008 as missing or R009-R011 as partial.

## Decisions to revisit

No decision should be reopened if S08 stays within the plan. Existing decisions/postures to preserve are: Paperclip remains system of record, native approvals are not substituted by plugin/fallback comments, and Hermes/GSD-Pi/plugin runtime capability remains proof-gated until separate live supported-boundary evidence exists.

## Verification

- Run the task and slice verification checks for this slice.

## Tasks

- [x] **T01: Create requirement-scope reconciliation ledger and validator** `est:1h`
  Build the JSON ledger that records an explicit disposition for each of R003, R008, R009, R010, R011, plus a standard-library-only fail-closed validator script that checks the ledger for completeness, citation existence, secret safety, and posture assertions. The ledger must mark R003/R008 as active/M003-owned/traceability-only-out-of-scope-for-m004, and R009-R011 as validated/no-reopen-needed/cited-from-m002-m003. Citations must point only to existing local evidence paths. The validator must use only local file reads/writes, no network, no subprocess, no database access.
  - Verify: python3 -c "import json; f=open('/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/runtime-evidence/M004-S08-requirement-scope-reconciliation.json'); json.load(f); f.close()"

- [x] **T02: Create fixture-rooted unit tests for the S08 validator** `est:45m`
  Write unit tests that import the validator module and exercise it against temporary fixture roots. Tests must cover: happy path with all 5 requirements present, missing requirement, citation file missing, secret-like value in ledger, runtime-promotion flag false, ownership-shift flag false for R003/R008, and malformed JSON. Tests must not read .gsd, .planning, or .audits paths from the repository.
  - Verify: python3 -m unittest /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/scripts/test_validate_m004_s08_requirement_scope.py

- [x] **T03: Generate final audit and slice closeout docs** `est:30m`
  Run the validator in final phase to produce the audit artifact, then write the slice-level S08-SUMMARY.md, S08-ASSESSMENT.md, and S08-UAT.md documenting what was reconciled, what dispositions were assigned, and how a reviewer can rerun validation. The audit must record passed=true, zero errors, all five requirements present with disposition rows, and no-runtime-promotion posture.
  - Verify: python3 /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/scripts/validate_m004_s08_requirement_scope.py --phase final --write-audit /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/runtime-evidence/M004-S08-requirement-scope-audit.json && test -s /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/.gsd/milestones/M004-osbua3/slices/S08/S08-SUMMARY.md && test -s /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/.gsd/milestones/M004-osbua3/slices/S08/S08-ASSESSMENT.md && test -s /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/.gsd/milestones/M004-osbua3/slices/S08/S08-UAT.md
