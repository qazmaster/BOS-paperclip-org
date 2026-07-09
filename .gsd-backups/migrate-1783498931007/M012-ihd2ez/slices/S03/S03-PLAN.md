# S03: Local Seven Division Mission Flow

**Goal:** Run the BOS Light mission flow locally against the live mission anchor and produce auditable artifacts without pretending Hermes or plugin runtime execution worked.
**Demo:** After this: the mission issue has a validated local BOS Light flow package showing Div7 framing, Div1 routing, Div2 planning, Div3 grant, Div4 local delivery posture, and Div5 QA evidence.

## Must-Haves

- Local flow produces structured artifacts for Div7, Div1, Div2, Div3, Div4, and Div5 steps.
- Div7 delegates operational execution back to Div1 for non-policy-only decisions.
- Div3 grant policy and Div5 QA gate are represented with pass, warning, or blocker outcomes.
- Div4 output stays local unless a later explicit external GitHub confirmation is obtained.
- Any Paperclip mirroring uses only S02-supported surfaces and otherwise records repo-local fallback evidence.

## Threat Surface

## Q3: How can this be exploited?

### Verdict: flag

### Abuse scenarios

1. **Identity spoofing in division packet emission (medium)**
   - The BOS Light local flow is expected to emit per-division phase records, decision IDs, routing packets, grant outcomes, and QA verdicts.
   - Existing packet routing patterns appear to allow division identity to be supplied as data rather than enforced by a trusted caller boundary.
   - Risk: internal code can claim to emit packets from Div7, Div1, Div3, or Div5, producing misleading audit artifacts.
   - S03 mitigation: generated artifacts must preserve local-only provenance and should include enough route/decision context to detect impossible or unsupported division transitions.

2. **HITL / approval bypass through simulation paths (low)**
   - S03 validates grant, HITL, branch policy, and QA contracts locally.
   - Test or simulation helpers that resolve human approval promises can be useful for local proof but must not be represented as real human approval.
   - Risk: local artifacts could make simulated approvals look like live operational approval.
   - S03 mitigation: every simulated or local-only decision must be explicitly labeled and must not claim Hermes, GSD-Pi, plugin runtime, or real Paperclip execution.

3. **External data exposure through artifact mirroring (medium)**
   - T03 may mirror mission flow artifacts through native Paperclip issue artifact surfaces only if S02-supported and readback-proven.
   - Mission metadata can include decision IDs, routing packets, grant outcomes, QA verdicts, blocker codes, and issue provenance.
   - Risk: organizational mission state or sensitive operational reasoning could be exposed externally if mirrored too broadly.
   - S03 mitigation: mirror only bounded artifact classes confirmed by S02 probe evidence; otherwise record repo-local fallback evidence. Do not mirror secrets or unrestricted raw logs.

### Data exposure risks

- **PII:** none identified in the slice plan.
- **Secrets/tokens:** no direct secret-handling requirement, but generated artifacts and mirror-status outputs must be checked to ensure they do not serialize environment values, auth tokens, or raw API responses.
- **Organizational metadata:** decision packets, routing results, grant outcomes, and QA verdicts are sensitive operational metadata if mirrored externally.

### Trust boundaries

- **Mission anchor / S02 probe evidence:** consumed as input and must be treated as untrusted until validated/read back.
- **Repo-local filesystem artifacts:** generated JSON/Markdown must be schema-validated and must not claim external execution without proof.
- **Paperclip artifact route:** external write surface only if S02 evidence proves support; otherwise fallback local.
- **Plugin contract fixtures/tests:** local test fixtures must not be confused with runtime authorization or live human approval.

### Required implementation checks before closing S03

- Validate artifact schemas for division identity, local-only execution marker, and external mirror provenance.
- Ensure no artifact includes plaintext secrets, tokens, or raw environment dumps.
- Ensure simulated HITL/grant outcomes are labeled as local proof, not real approvals.
- Ensure any Paperclip mirroring is restricted to S02-supported surfaces and includes readback proof or a repo-local fallback record.

## Requirement Impact

## Q4: Which existing requirements does this slice touch, and which must be re-tested?

### Verdict: flag

### Requirements touched

- **R016** — conservative claims / no unsupported runtime claims. S03 must not claim Hermes, GSD-Pi, plugin host registration, comments, documents, or live Paperclip runtime behavior without readback proof.
- **R022** — live Paperclip GUI end-to-end mission evidence. S03 contributes local seven-division evidence anchored to S02, but does **not** satisfy the full live GUI E2E requirement by itself.
- **R023** — HITL gate contracts. T02 validates HITL behavior against existing plugin contracts and must distinguish simulated/local approvals from real human approvals.
- **R026** — Div7 to Div1 delegation. T01 must prove Div7 delegates operational execution back to Div1 for non-policy-only decisions.
- **R027** — two-phase routing model. T01/T02 must prove mission signals and delegated decisions route through the expected BOS Light flow.
- **R028** — Div3 grant policy. T01/T02 must represent deterministic Div3 grant results with pass, warning, or blocker outcomes.
- **R029** — Div4 production constraints. T01/T03 must keep Div4 output local unless explicit external GitHub/Paperclip artifact confirmation is obtained.

### Requirements that must be re-tested after shipping

- **R016:** inspect generated JSON/Markdown artifacts and mirror-status records for unsupported claims about Hermes, GSD-Pi, plugin runtime execution, comments, documents, or unverified Paperclip surfaces.
- **R022:** in S04 reconciliation, verify the gap between S03 local-only evidence and the live GUI E2E requirement is explicitly documented; do not promote R022 based solely on S03.
- **R023:** run targeted HITL/plugin contract tests and ensure local simulation paths are labeled as simulation.
- **R026-R029:** run the plugin regression suite and T01/T03 validators after any changes to missionRouter.ts, decision.ts, grantPolicy.ts, and related flow scripts.

### Decisions / scope to revisit

- Whether S03's consumed S02 mission anchor is a live issue ID or blocker/fallback evidence must be explicit in the artifact provenance.
- Any T02 changes to `missionRouter.ts`, `decision.ts`, or `grantPolicy.ts` should be reviewed against prior M008 contract decisions so S03 does not silently expand plugin scope into host registration or Hermes runtime work.
- Any external mirroring decision must remain bounded by S02-supported surfaces and readback proof; otherwise the repo-local fallback is the correct S03 outcome.

### Key S04 reconciliation flags

1. R022 cannot be marked fully validated by S03 local evidence alone.
2. S03 artifacts must clearly describe mission-anchor provenance from S02, including any blocker/null-live-issue context if present at execution time.
3. Contract-level regressions in routing, grant policy, HITL, branch policy, or QA gates must block S03 completion until fixed or explicitly escalated.

## Proof Level

- This slice proves: Local orchestration proof anchored to a live Paperclip issue.

## Integration Closure

Consumes S02 mission issue anchor at execution time; produces division flow evidence for final reconciliation in S04.

## Verification

- Adds per-division phase records, decision IDs, routing packets, grant outcomes, QA verdicts, blocker codes, and artifact mirror status.

## Tasks

- [x] **T01: Generated local seven-division flow artifact (JSON + markdown) with all BOS Light divisions, correct routing sequence, grant policy, QA verdict, and no runtime execution claims.** `est:1h 30m`
  Implement or reuse BOS Light local orchestration paths to generate a structured mission flow artifact for the S02 mission anchor. The flow must include Div7 framing, Div7 to Div1 delegation for operational work, Div1 routing, Div2 blueprint or BPI output, Div3 grant policy result, Div4 local production posture, and Div5 QA verdict. The artifact must clearly mark local execution and must not claim Hermes, GSD-Pi, or plugin runtime execution.
  - Files: `scripts/m012_s03_local_seven_division_flow.js`, `scripts/validate_m012_s03_local_flow.js`, `runtime-evidence/M012-S03-local-seven-division-flow.json`, `runtime-evidence/M012-S03-local-seven-division-flow.md`
  - Verify: node scripts/validate_m012_s03_local_flow.js

- [x] **T02: Created 58-test suite validating the M012 local seven-division flow against all BOS Light plugin contracts (routing, grant, HITL, QA, owner boundary, packet router).** `est:1h`
  Add targeted tests or fixtures if needed to prove the generated flow respects the existing BOS Light routing, grant, HITL, branch policy, and QA contracts. Run the plugin regression suite and typecheck. If failures appear, fix root causes without expanding M012 into plugin host registration or Hermes runtime work.
  - Files: `plugin-bos-light/tests/m012LocalMissionFlow.test.ts`, `plugin-bos-light/src/missionRouter.ts`, `plugin-bos-light/src/decision.ts`, `plugin-bos-light/src/grantPolicy.ts`
  - Verify: npm test

- [x] **T03: Recorded artifact mirror status as repo-local-fallback; all native Paperclip routes are auth-blocked or unsupported.** `est:45m`
  Use the S02 artifact route probe results at execution time to decide whether mission flow artifacts can be mirrored through native Paperclip issue artifacts. If supported, mirror only the confirmed bounded artifact classes; otherwise record repo-local fallback evidence linked to the live issue ID. Never claim comments or documents work without readback proof.
  - Files: `scripts/m012_s03_record_mirror_status.js`, `scripts/validate_m012_s03_mirror_status.js`, `runtime-evidence/M012-S03-artifact-mirror-status.json`, `runtime-evidence/M012-S03-artifact-mirror-status.md`
  - Verify: node scripts/validate_m012_s03_mirror_status.js

- [x] **T04: Resolve Plugin Verification Baseline Before Slice Closeout** `est:1h`
  Investigate the plugin-bos-light verification baseline discovered during S03 closeout. Either fix the package-level test/typecheck blockers (`../dist/worker.js` missing for four suites, JSX tsconfig setting, and existing implicit-any/test fixture typing errors) so `npm --prefix plugin-bos-light run typecheck` and `npm --prefix plugin-bos-light test` exit 0, or re-scope the S03 verification contract with explicit evidence that the blockers are inherited/out-of-scope and that focused M012 contract tests plus S03 validators are sufficient for this local-only mission flow. Do not claim Hermes, GSD-Pi, plugin runtime, documents, comments, or live GitHub execution. Record the final verification command set and rationale in the task summary.
  - Files: `plugin-bos-light/tsconfig.json`, `plugin-bos-light/tests/agentIntegration.test.ts`, `plugin-bos-light/tests/distWorkerTools.test.ts`, `plugin-bos-light/tests/e2eWorkflow.test.ts`, `plugin-bos-light/tests/routingIntegration.test.ts`, `plugin-bos-light/tests/m012LocalMissionFlow.test.ts`, `.gsd/milestones/M012-ihd2ez/slices/S03/S03-PLAN.md`
  - Verify: node scripts/validate_m012_s03_local_flow.js
node scripts/validate_m012_s03_mirror_status.js
npm --prefix plugin-bos-light exec -- vitest run tests/m012LocalMissionFlow.test.ts
npm --prefix plugin-bos-light run typecheck
npm --prefix plugin-bos-light test

If package-level typecheck/test remain intentionally scoped out, the replan must replace those commands with an explicit passing scoped verifier and document the inherited failures with fresh gsd_exec stdout/stderr paths.

## Files Likely Touched

- scripts/m012_s03_local_seven_division_flow.js
- scripts/validate_m012_s03_local_flow.js
- runtime-evidence/M012-S03-local-seven-division-flow.json
- runtime-evidence/M012-S03-local-seven-division-flow.md
- plugin-bos-light/tests/m012LocalMissionFlow.test.ts
- plugin-bos-light/src/missionRouter.ts
- plugin-bos-light/src/decision.ts
- plugin-bos-light/src/grantPolicy.ts
- scripts/m012_s03_record_mirror_status.js
- scripts/validate_m012_s03_mirror_status.js
- runtime-evidence/M012-S03-artifact-mirror-status.json
- runtime-evidence/M012-S03-artifact-mirror-status.md
- plugin-bos-light/tsconfig.json
- plugin-bos-light/tests/agentIntegration.test.ts
- plugin-bos-light/tests/distWorkerTools.test.ts
- plugin-bos-light/tests/e2eWorkflow.test.ts
- plugin-bos-light/tests/routingIntegration.test.ts
- .gsd/milestones/M012-ihd2ez/slices/S03/S03-PLAN.md
