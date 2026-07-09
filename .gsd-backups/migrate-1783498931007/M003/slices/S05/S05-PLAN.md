# S05: Validation artifact reconciliation

**Goal:** Reconcile M003 validation-support artifacts so milestone validation can pass based on existing evidence without changing runtime capability claims or completed slice behavior.
**Demo:** After this: M003 has canonical validation-support artifacts: Boundary Map populated from proven slice contracts, S01-S04 assessments restored or explicitly reconciled from existing evidence, rendered roadmap state aligned with DB status, and milestone validation reruns to pass or reports only real remaining blockers.

## Must-Haves

- Boundary Map in the M003 roadmap is populated with the proven S01-S04 producer/consumer contracts.
- S01-S04 assessment evidence is restored, rendered, or explicitly reconciled from canonical DB/summaries without inventing new runtime proof.
- Rendered roadmap completion state agrees with `gsd_milestone_status` for S01-S04 and shows S05 as the only open remediation slice until complete.
- M003 validation is rerun after reconciliation and returns `pass`, or any remaining blocker is concrete and plan-invalidating.
- No docs, tests, manifests, or validation artifacts promote plugin UI, actions/tools, native approvals, Hermes, GSD-Pi, activity logs, events, or live Paperclip support beyond existing evidence.

## Threat Surface

## Q3 Exploitability Review

- **Runtime/auth surface:** S05 does not add or modify product runtime paths, host tool registration, plugin UI/actions, native approvals, Hermes, GSD-Pi execution, APIs, or authentication flows.
- **Parameter tampering / replay:** Not applicable to external requests because the slice operates on local validation artifacts and canonical GSD state/evidence rather than accepting remote parameters or replayable operations.
- **Privilege escalation:** No new privilege boundary is introduced. The relevant boundary is local repository/GSD artifact write access, which already exists for milestone execution.
- **Data exposure:** The main exposure risk is accidentally copying raw credentials, tokens, or sensitive Paperclip diagnostics from live-readback evidence into validation artifacts. S05 must cite existing evidence only in sanitized form and preserve the M003 rule that secrets/raw auth material never appear in artifacts, diagnostics, logs, or evidence.
- **Trust boundaries:** Inputs are existing S01-S04 summaries, task evidence, runtime evidence, DB-backed milestone status, and M003 validation output. Reconciliation must not treat stale or speculative UAT text as proof, and must not promote unsupported surfaces beyond proven evidence.
- **Abuse scenario to guard against:** Artifact-only reconciliation could be misused to make validation pass by overstating support for plugin UI/actions/native approvals/Hermes/GSD-Pi. The slice plan explicitly blocks this; verification should scan for those unsupported capability promotions.

## Requirement Impact

## Q4 Requirement Impact Review

S05 reconciles validation-support artifacts for the full M003 milestone, so it touches the milestone requirement set named in M003 context and roadmap:

- **R003** — Preserve Paperclip as the system of record; retest that reconciliation does not introduce plugin-owned governance state.
- **R008** — Keep approval/request ownership Paperclip-native; retest that fallback comments/markdown are not represented as native approvals.
- **R009** — Eval Gate evidence posture; retest that gate-driven decisions remain visible and evidence-backed.
- **R010** — Circuit Breaker fallback behavior; retest that self-healing/escalation decisions remain visible without overstating live runtime support.
- **R012** — Adapter/persistence seams; retest that runtime-dependent calls remain behind seams with sanitized diagnostics.
- **R013** — Native-first durable artifact mirroring; retest document/comment/fallback artifact evidence and readback-or-fail-closed behavior.
- **R014** — Div7 decision foundation; retest decision recommendation/artifact coverage remains tied to S01-S04 evidence.
- **R016** — Conservative runtime claims under v1.4.1 posture; retest no unsupported capability promotion for plugin UI, actions/tools, native approvals, Hermes, GSD-Pi, activity logs, events, or live Paperclip support beyond proof.

## Retest Scope After Shipping S05

- Boundary Map contains only proven S01-S04 producer/consumer contracts.
- S01-S04 assessments cite summaries/runtime evidence, not UAT/spec text as proof.
- Rendered roadmap state agrees with DB status for S01-S04 complete and S05 active until closure.
- M003 validation MV01-MV04 is rerun and recorded through canonical GSD validation tooling.
- Unsupported-surface strings are scanned in reconciled artifacts to confirm they remain negative/out-of-scope claims rather than promoted capabilities.

## Decisions to Revisit

No architecture decision needs revision if S05 remains reconciliation-only. Revisit the M002 artifact-first posture or M003 risk-tiered Div7 record decision only if reconciliation requires new runtime capabilities or changes the conservative evidence boundary.

## Proof Level

- This slice proves: artifact reconciliation plus validation rerun

## Integration Closure

S05 consumes the M003 validation round 0 findings, S01-S04 summaries, DB slice status, and runtime evidence, then produces canonical validation artifacts and a rerun validation verdict. It must not alter S01-S04 implementation outputs or promote unsupported runtime surfaces.

## Verification

- Adds explicit reconciliation evidence for why validation packaging was adjusted, including checks for assessment artifacts, roadmap boundary content, DB/render alignment, and validation rerun output.

## Tasks

- [x] **T01: Inventory validation artifact gaps** `est:small`
  Inspect M003 validation round 0 output, S01-S04 summaries, existing UAT/spec files, DB milestone status, and rendered roadmap state. Produce a concise reconciliation inventory that identifies exactly which canonical artifacts are missing or stale and which evidence sources are allowed to regenerate them. Relevant artifact paths: `.gsd/milestones/M003/M003-VALIDATION.md`, `.gsd/milestones/M003/M003-ROADMAP.md`, and `.gsd/milestones/M003/slices/S01` through `S04`. Do not modify product code or runtime claims.
  - Verify: Use `gsd_milestone_status` for DB status and `gsd_exec` to check filesystem artifact presence; summarize missing/stale artifacts without direct DB access.

- [x] **T02: Populate roadmap Boundary Map** `est:small`
  Populate the M003 Boundary Map with the proven cross-slice contracts already evidenced by S01-S04 summaries: S01 decision contract, S02 artifact envelope and fallback persistence, S03 major-flow decision integration, and S04 live-readback or fail-closed evidence. Target artifact: `.gsd/milestones/M003/M003-ROADMAP.md`. Preserve completed slice content and do not add new capability claims.
  - Verify: Run a bounded text check with `gsd_exec` confirming the Boundary Map contains S01→S02/S03, S02→S03/S04, S03→S04, and S04→M003 validation contracts.

- [x] **T03: Restore slice assessment artifacts** `est:medium`
  Restore or render S01-S04 assessment artifacts from existing summaries, task evidence, and DB completion state, or write an explicit reconciliation artifact if the canonical GSD state uses DB-backed assessment rows instead of files. Target artifacts are `.gsd/milestones/M003/slices/S01/S01-ASSESSMENT.md` through `S04/S04-ASSESSMENT.md`. Assessments must cite existing verification evidence only and must not treat UAT specs as proof.
  - Verify: Use `gsd_exec` to confirm S01-S04 ASSESSMENT files exist and contain pass verdicts tied to summary/runtime evidence; verify no unsupported capability promotion strings are introduced.

- [x] **T04: Reconcile roadmap render state** `est:small`
  Reconcile rendered roadmap completion state with DB milestone status, especially the reported S03 checkbox mismatch. Use GSD tooling where available; do not manually toggle checkboxes as a substitute for canonical state. Confirm S01-S04 complete, S05 open before closure, and all S05 tasks tracked.
  - Verify: Run `gsd_milestone_status` and a `gsd_exec` roadmap checkbox scan; evidence must show DB and rendered roadmap agree for S01-S04 and S05 remains the active remediation slice until completed.

- [x] **T05: Rerun milestone validation** `est:medium`
  Rerun M003 milestone validation after artifact reconciliation using the same MV01-MV04 gates and verification-class checks. Persist the new validation result through `gsd_validate_milestone`; if still not pass, record concrete blockers rather than broad attention items.
  - Verify: Dispatch validation reviewers or equivalent gate checks, then call `gsd_validate_milestone` with verdict `pass` only if MV01-MV04 and planned verification classes are satisfied.
