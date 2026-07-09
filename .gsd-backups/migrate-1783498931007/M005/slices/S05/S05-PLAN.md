# S05: E2E Mission Cycle Proof

**Goal:** Close governance gaps between S04 implementation and v1.4.1 doctrine. Deliver Div7 mission intake workflow with explicit human approval gates, Div5 QA review layer, Div6.External GitHub API for PR/merge, branch policy enforcement, and HITL runtime gates for mission acceptance, resource grants, batch approval, and Circuit Breaker OPEN resolution. Preserve the S04 constraint: Div4 pushes to its own branch; Div6 opens PR and merges only after Div5 review passes.
**Demo:** A human creates a mission in Paperclip. The system flows through all 7 divisions, produces a Blueprint, modifies aipay.kz code, passes Eval Gate, and completes. Human approves at mission creation, system failure (if any), and strategy decision points. All artifacts visible in Paperclip.

## Must-Haves

- All 5 TypeScript modules (missionIntake, hitlGovernance, qaReview, externalIO, circuitBreakerHumanResolution) pass unit tests.
- S05 probe runner produces valid evidence artifact (expected fail-closed-blocker in auth-missing env).
- Validator accepts artifact with --allow-blocker (exit 0).
- 12 test fixtures pass.
- Capability matrix validates with zero errors.
- Cumulative evidence summary generated.
- All new capability rows are fallback-only (not confirmed) because live Paperclip auth remains missing.

## Proof Level

- This slice proves: contract + integration

## Integration Closure

Upstream surfaces consumed: S01 plugin registration intent, S02 company template + division routing, S03 resource intake checklist, S04 git operations + hybrid persistence + state reconstruction. New wiring introduced: Div7 intake → HITL gate → Div1 routing → Div2 blueprint → Div3 budget → Div4 branch+push → Div5 QA review → Div6 PR+merge. Circuit Breaker OPEN halts at any gate and awaits human decision. What remains before milestone is truly usable end-to-end: live Paperclip auth to exercise the full cycle with real git push, real PR, and real human approval through Paperclip UI.

## Verification

- HITL gate artifacts track pending/approved/rejected status with timestamps. Branch policy enforcement records blocked push attempts. Div5 QA review envelope records diff hash, eval gate verdict, security scan result. Div6 PR envelope records PR number, merge commit SHA, CI/CD trigger ref. Circuit Breaker incident artifact records OPEN timestamp, human decision options, selected resolution.

## Tasks

- [x] **T01: Create Div7 mission intake + HITL gate TypeScript module** `est:45m`
  Why: Every mission must start with Div7 framing and explicit human approval before any division executes work. Do: Create plugin-bos-light/src/missionIntake.ts with MissionIntake class. Implement frameMission(vagueGoal: string) → structured mission envelope (id, title, description, business_goal, risk_level, requested_divisions). Implement requestHumanApproval(mission) → creates Paperclip artifact (comment/document) with approval options (approve / reject / request_clarification). Implement awaitHumanApproval(missionId, timeoutMs) → polls for response or returns timeout-blocker. Implement onApproval(mission) → emits mission_approved event with full envelope. Implement onRejection(mission) → emits mission_rejected with reason. Create missionIntake.test.ts with vitest covering: mission framing, approval artifact creation, timeout handling, rejection path. Done when: unit tests pass.
  - Files: `plugin-bos-light/src/missionIntake.ts`, `plugin-bos-light/tests/missionIntake.test.ts`
  - Verify: cd plugin-bos-light && npx vitest run tests/missionIntake.test.ts

- [x] **T02: Create branch policy + HITL runtime gates TypeScript module** `est:45m`
  Why: S04 git operations need branch policy enforcement and explicit human approval gates for resource grants, batch approval, and production deploy. Do: Create plugin-bos-light/src/hitlGovernance.ts with HITLGovernance class. Implement enforceBranchPolicy(operation: GitOperation) → rejects direct main/master push, enforces feature-branch naming (feature/bos-{mission_id}), blocks non-fast-forward, records blocked attempt with reason. Implement requestResourceGrant(missionId, resources[]) → creates Paperclip artifact requesting human approval for each resource (token budget, repo access, API key). Implement requestBatchApproval(missionId, batchItems[]) → creates artifact for human approval of betting table batch. Implement requestProductionDeploy(missionId, deployConfig) → creates artifact for human approval of deploy/CI trigger. Implement awaitGateDecision(gateId, timeoutMs) → polls or returns timeout. Create hitlGovernance.test.ts covering: branch policy blocks, resource grant artifact, batch approval artifact, deploy gate artifact, timeout handling. Done when: unit tests pass.
  - Files: `plugin-bos-light/src/hitlGovernance.ts`, `plugin-bos-light/tests/hitlGovernance.test.ts`
  - Verify: cd plugin-bos-light && npx vitest run tests/hitlGovernance.test.ts

- [x] **T03: Create Div5 QA review + Eval Gate integration TypeScript module** `est:45m`
  Why: Div5 must review Div4 code changes before Div6 can open PR and merge. Do: Create plugin-bos-light/src/qaReview.ts with QAReview class. Implement reviewDiff(diffText: string) → produces review envelope (diff_hash, files_changed, lines_added, lines_removed, security_flags[]). Implement runEvalGate(reviewEnvelope, criteria[]) → produces eval gate result (verdict: pass/flag/fail, rationale, evidence). Implement produceReviewArtifact(reviewResult, issueId) → mirrors review result to Paperclip document/comment. Implement isApprovedForMerge(reviewResult) → returns true only if eval gate verdict is pass and no critical security flags. Create qaReview.test.ts covering: diff review hashing, eval gate pass/fail, security flag detection, merge approval logic, artifact mirroring. Done when: unit tests pass.
  - Files: `plugin-bos-light/src/qaReview.ts`, `plugin-bos-light/tests/qaReview.test.ts`
  - Verify: cd plugin-bos-light && npx vitest run tests/qaReview.test.ts

- [x] **T04: Create Div6.External GitHub API + PR/merge TypeScript module** `est:50m`
  Why: Div6 must open PR, request review, and merge after Div5 approval — not Div4 directly. Do: Create plugin-bos-light/src/externalIO.ts with ExternalIOGateway class. Implement openPullRequest(params) → calls GitHub API to create PR from feature branch to main, returns PR number and URL. Implement requestPRReview(prNumber, reviewers[]) → requests review from specified users/teams. Implement mergePullRequest(prNumber, mergeMethod) → merges PR after Div5 approval, returns merge commit SHA. Implement triggerCI(repo, branch) → triggers GitHub Actions/workflow dispatch. Implement getCIStatus(runId) → polls CI status. All methods use GitHub token from env, redact secrets in diagnostics, and produce structured evidence envelopes. Detect missing GitHub token and produce clean blocker. Create externalIO.test.ts covering: PR creation shaping, merge after approval, CI trigger, missing token detection, secret redaction. Done when: unit tests pass.
  - Files: `plugin-bos-light/src/externalIO.ts`, `plugin-bos-light/tests/externalIO.test.ts`
  - Verify: cd plugin-bos-light && npx vitest run tests/externalIO.test.ts

- [x] **T05: Create Circuit Breaker human resolution TypeScript module** `est:40m`
  Why: When Circuit Breaker opens, the system must freeze work, revoke access, create incident artifact, and present human decision options. Do: Create plugin-bos-light/src/circuitBreakerHumanResolution.ts with CircuitBreakerHumanResolution class. Implement onOpen(circuitState) → creates incident artifact in Paperclip with: OPEN timestamp, failure count, affected divisions, recommended options (abort_mission / resume_with_limits / create_correction_work_order / escalate_to_div7 / open_new_mission). Implement awaitHumanDecision(incidentId, timeoutMs) → polls for human selection. Implement executeResolution(decision) → routes to abort (clean shutdown), resume (reset counters with limits), correction (spawn new WorkOrder), escalate (notify Div7), or new mission (spawn intake). Implement logResolution(incidentId, decision) → mirrors resolution to Paperclip comment. Create circuitBreakerHumanResolution.test.ts covering: OPEN incident creation, option enumeration, human decision routing, resolution logging, timeout handling. Done when: unit tests pass.
  - Files: `plugin-bos-light/src/circuitBreakerHumanResolution.ts`, `plugin-bos-light/tests/circuitBreakerHumanResolution.test.ts`
  - Verify: cd plugin-bos-light && npx vitest run tests/circuitBreakerHumanResolution.test.ts

- [x] **T06: Create S05 Python probe runner** `est:40m`
  Why: Need a bounded live probe that validates mission intake, HITL gates, branch policy, QA review, Div6 PR/merge, and Circuit Breaker human resolution, producing a machine-readable evidence artifact. Do: Create scripts/run_m005_s05_e2e_governance_probe.py following S01-S04 patterns: HttpClient, redaction, preflight auth gate, evidence schema_version m005-s05-e2e-governance/v1. Discover GITHUB_TOKEN, GIT_SSH_KEY, PAPERCLIP_API_KEY from env. Smoke-test mission intake framing via simulated adapter. Smoke-test branch policy enforcement (simulate direct-main-push block). Smoke-test HITL gate artifact creation via simulated adapter. Smoke-test QA review diff hash + eval gate. Smoke-test Circuit Breaker OPEN incident creation. Smoke-test Div6 PR creation (mock GitHub API if token missing). Write evidence to runtime-evidence/M005-S05-e2e-governance-probe.json. In current auth-missing environment, produce valid fail-closed-blocker artifact with precise blocker codes and zero side effects. Done when: script executes and writes evidence artifact.
  - Files: `scripts/run_m005_s05_e2e_governance_probe.py`
  - Verify: python3 scripts/run_m005_s05_e2e_governance_probe.py

- [x] **T07: Create S05 Python validator and test fixtures** `est:50m`
  Why: Machine-readable closeout requires a validator and comprehensive fixture coverage for all S05 artifact types. Do: Create scripts/validate_m005_s05_e2e_governance_probe.py with schema_version enforcement (m005-s05-e2e-governance/v1), redaction checks, no_core_modification validation, blocker acceptance (--allow-blocker), and zero capability-promotion rejection. Create scripts/test_validate_m005_s05_e2e_governance_probe.py with 12 fixtures: (1) passing mission intake proof, (2) passing HITL gates proof, (3) fail-closed blocker missing GitHub token, (4) fail-closed blocker missing Paperclip auth, (5) fail-closed blocker branch policy violation, (6) fail-closed blocker QA review fail, (7) fail-closed blocker Circuit Breaker OPEN unresolved, (8) unredacted secrets in diagnostics, (9) malformed timestamp, (10) unsupported paths used, (11) capability promotion in blocker artifact, (12) CLI write-audit closeout. Done when: all 12 fixtures pass.
  - Files: `scripts/validate_m005_s05_e2e_governance_probe.py`, `scripts/test_validate_m005_s05_e2e_governance_probe.py`
  - Verify: python3 -m unittest scripts/test_validate_m005_s05_e2e_governance_probe.py -v

- [x] **T08: Run probe, validate evidence, update capability matrix, and generate summary** `est:30m`
  Why: Slice closeout requires validated evidence, append-only capability matrix update, and cumulative evidence summary per MEM058. Do: Run the S05 probe to produce runtime-evidence/M005-S05-e2e-governance-probe.json. Validate it with python3 scripts/validate_m005_s05_e2e_governance_probe.py --evidence runtime-evidence/M005-S05-e2e-governance-probe.json --allow-blocker (expect exit 0). Update plugin-bos-light/capabilities.paperclip-runtime.json append-only: add workflow.mission_intake, workflow.hitl_gates, workflow.branch_policy, workflow.qa_review, workflow.pr_merge, runtime.circuit_breaker_human_resolution rows with status fallback-only, evidence_source referencing M005-S05 probe, and blocker_text describing the auth-missing environment. Preserve all existing S01-S04 rows unchanged. Update plugin-bos-light/src/runtimeCapabilities.ts to include new keys. Update docs/08_RUNTIME_CAPABILITY_HEALTH.md to add new rows. Generate runtime-evidence/M005-S05-evidence-summary.json combining S01+S02+S03+S04+S05 results with posture, guardrails, confirmed surfaces, fallback-only surfaces, and MEM058 compliance flag. Done when: capability matrix validation passes.
  - Files: `plugin-bos-light/capabilities.paperclip-runtime.json`, `plugin-bos-light/src/runtimeCapabilities.ts`, `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, `runtime-evidence/M005-S05-evidence-summary.json`, `runtime-evidence/M005-S05-validator-closeout.json`
  - Verify: python3 scripts/validate_runtime_capabilities.py

## Files Likely Touched

- plugin-bos-light/src/missionIntake.ts
- plugin-bos-light/tests/missionIntake.test.ts
- plugin-bos-light/src/hitlGovernance.ts
- plugin-bos-light/tests/hitlGovernance.test.ts
- plugin-bos-light/src/qaReview.ts
- plugin-bos-light/tests/qaReview.test.ts
- plugin-bos-light/src/externalIO.ts
- plugin-bos-light/tests/externalIO.test.ts
- plugin-bos-light/src/circuitBreakerHumanResolution.ts
- plugin-bos-light/tests/circuitBreakerHumanResolution.test.ts
- scripts/run_m005_s05_e2e_governance_probe.py
- scripts/validate_m005_s05_e2e_governance_probe.py
- scripts/test_validate_m005_s05_e2e_governance_probe.py
- plugin-bos-light/capabilities.paperclip-runtime.json
- plugin-bos-light/src/runtimeCapabilities.ts
- docs/08_RUNTIME_CAPABILITY_HEALTH.md
- runtime-evidence/M005-S05-evidence-summary.json
- runtime-evidence/M005-S05-validator-closeout.json
