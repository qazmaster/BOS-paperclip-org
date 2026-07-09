# S04: Live BOS artifact flow with Hermes no-go guard

**Goal:** Produce and validate a bounded live BOS Light artifact flow on Paperclip-visible issue, comment, and document surfaces while enforcing the S02 Hermes execution no-go and S03 GSD-Pi adapter no-go guards. The slice must show BPI, Blueprint, Betting Table, Eval Gate, and Circuit Breaker evidence on a sandbox issue/project without promoting approvals, plugin UI/data/action surfaces, durable state, activity, events, Hermes execution, or GSD-Pi execution beyond their actual proof.
**Demo:** After this: A sandbox issue or project contains visible BPI, Blueprint, Betting Table, Eval Gate, and Circuit Breaker evidence using native or fallback surfaces, explicitly excluding any assumption that Hermes agents are available until the S02 blocker is remediated.

## Must-Haves

- Done means `runtime-evidence/M002-S04-live-artifact-flow.json` validates as a final S04 artifact with live Paperclip runtime version/build, issue create/readback, document create/readback, comment create/readback, BOS artifact markers for BPI/Blueprint/Betting Table/Eval Gate/Circuit Breaker, zero native approvals created, no Hermes run dependency, explicit S02/S03 blocker propagation, no secret-like evidence, and no Paperclip core patch/direct DB/private import claims. Local plugin tests, S04 runner/validator tests, the S04 final validator, runtime capability validation, and plugin typecheck must pass. Any capability matrix promotion must be limited to surfaces with this exact live readback evidence and must preserve fallback-only/unvalidated posture for approvals, UI/data/action registration, state, activity, events, Hermes execution, and GSD-Pi execution.

## Threat Surface

## Q3 findings: exploit and abuse scenarios

### Primary trust boundaries
- **Live Paperclip API boundary:** `scripts/run_s04_live_artifact_flow.py` and `plugin-bos-light/src/livePaperclipAdapter.ts` will send issue/document/comment operations to the Paperclip sandbox through supported HTTP/API or CLI boundaries.
- **Untrusted issue content boundary:** Paperclip issue title/body/acceptance/resources and generated BOS markdown are display artifacts; consumers must treat them as inert text and must not execute embedded markdown/HTML/scripts or infer capability truth from content.
- **Filesystem evidence boundary:** `runtime-evidence/M002-S04-live-artifact-flow.json`, docs, and capability matrix updates become durable repo artifacts; they must be redacted and validated before being committed or used by downstream slices.
- **Runtime capability boundary:** Native issues/comments/documents can be promoted only from live version/build plus create/readback evidence, not from fixtures, comments, local adapter seams, or generated markdown.

### Exploit scenarios to guard against
- **Parameter tampering / cross-resource mutation:** A malicious or mistaken company ID, issue ID, document ID, comment ID, base URL, or capability status could cause the live probe to mutate the wrong Paperclip tenant/project/issue or promote unsupported capabilities. Require approved sandbox scope, readback identity checks, and evidence fields that bind all artifact refs to the intended company/issue.
- **Secret exposure through diagnostics:** Failed HTTP calls, auth headers, env vars, cookies, adapter config, or provider errors could be written into evidence JSON, docs, comments, or fallback markdown. S04 must keep bounded response snippets redacted and retain the explicit `no_secret_like_evidence` / redacted diagnostics guard.
- **Replay / duplicate side effects:** Re-running the live probe could create duplicate issues, comments, documents, or approval-like requests. The final artifact should record side-effect counts and stable refs; the runner should use sandbox markers/idempotency where available and must prove `zero native approvals created`.
- **Privilege escalation through unsupported surfaces:** Treating S02 Hermes or S03 GSD-Pi as available despite their no-go blockers could let BOS Light claim agent/quality execution authority it does not have. S04 must propagate the Hermes execution-time secret-materialization blocker and gsdpi_local registration/execute blocker as no-go status, not skipped-success.
- **Approval/governance spoofing:** Betting Table or fallback comments could be mistaken for native Paperclip approvals. Only validated native approval create/read evidence may populate approval IDs/statuses or change rows to approval-requested; S04 explicitly requires zero native approvals and must preserve approval posture as unvalidated/fallback-only.
- **Core/internal coupling bypass:** Direct DB writes, Paperclip core patches, or private imports could bypass Paperclip governance and upgrade safety. The S04 validator/docs must maintain no-core/no-DB/private-import guardrails.

### Data exposure risks
- Potentially sensitive fields include Paperclip auth tokens, cookies/session state, company secrets, provider keys, adapter config env, raw HTTP response bodies, issue content that may contain PII, and local filesystem paths. Evidence should store only redacted bounded snippets, hashes, IDs required for sandbox readback, version/build, phase/status, and sanitized errors.

### Required controls before task execution
- Keep all live operations bounded to the approved sandbox and supported Paperclip boundaries.
- Validate final evidence with `scripts/validate_s04_live_artifact_flow.py --phase final` before docs/capability promotion.
- Preserve fail-closed no-go propagation for S02 Hermes and S03 GSD-Pi.
- Re-run runtime capability validation and plugin typecheck after any capability matrix/doc changes.
- Do not commit `.env`, credentials, cookies, session state, raw logs, or VPS/private artifacts.

## Requirement Impact

## Q4 findings: touched requirements and required re-tests

The milestone-specific requirements artifact `.gsd/milestones/M002/REQUIREMENTS.md` is absent in this worktree, so this mapping uses the existing project requirements captured in `M001-bo1jcm-CONTEXT.md`, the M002 roadmap/manifest requirement coverage, and the S04 plan.

### Requirements touched by S04
- **R003 — Preserve Paperclip as the system of record.** S04 writes/readbacks BOS artifacts on Paperclip-visible issue/comment/document surfaces and must not treat plugin cache, markdown-only diagnostics, or local files as native truth.
- **R004 — Validate runtime assumptions before trusting SDK behavior.** S04 is explicitly a live runtime proof slice; it must capture version/build and create/readback evidence before any surface is promoted.
- **R005 — Bounded, explainable BPI scoring.** S04 includes BPI artifact markers/readback in the live BOS artifact flow.
- **R006 — Paperclip-native Product Blueprint generation.** S04 includes Blueprint artifact markers on issue/comment/document surfaces with readback proof or explicit fallback.
- **R007 — Betting Table coordination UI/view.** S04 includes Betting Table evidence as a visible artifact, but not native UI/data-provider proof.
- **R008 — Native approval/request creation without plugin-side approval engine.** S04 intentionally exercises the Betting Table/approval boundary by requiring zero native approvals created and preserving approval fallback/unvalidated posture.
- **R009 — Eval Gate evidence and release guidance.** S04 includes Eval Gate evidence as a visible artifact/comment/document/fallback marker.
- **R010 — Circuit Breaker fallback behavior.** S04 includes Circuit Breaker evidence and must keep Hermes/event/activity assumptions fail-closed.
- **R011 — Balanced proof / live proof level.** S04 upgrades selected artifact surfaces from fixture-only to live integration/operational evidence while preserving no-go blockers.
- **R012 — Adapter and persistence seams.** S04 adds a bounded host adapter/composer and runner/validator; Paperclip-specific calls must remain isolated from pure BOS Light logic.
- **R013 — Native-first durable artifact mirroring.** S04's canonical evidence and docs must promote only surfaces with live version/build plus readback proof and preserve fallback-only posture elsewhere.

### Requirements not materially touched
- **R001/R002** company template/division semantics are upstream baseline requirements and should not be changed by S04.
- **R014** future Div7 decision protocol foundation is not part of S04 unless documentation accidentally changes decision-record posture.

### Must re-test after shipping S04
- `npm --prefix plugin-bos-light test -- liveArtifactFlow` for the new adapter/composer contract.
- `python3 -m unittest scripts/test_run_s04_live_artifact_flow.py scripts/test_validate_s04_live_artifact_flow.py` for runner/validator behavior, redaction, fallback, and failure diagnostics.
- `python3 scripts/validate_s04_live_artifact_flow.py --evidence runtime-evidence/M002-S04-live-artifact-flow.json --phase final` for canonical live evidence.
- `python3 scripts/validate_runtime_capabilities.py` to ensure capability promotion is limited to exact live readback evidence and no fallback-only/unvalidated surfaces are accidentally promoted.
- `npm --prefix plugin-bos-light run typecheck` after TypeScript adapter/capability exports change.
- Re-check S02/S03 blocker propagation in the final evidence/docs: Hermes execution remains no-go until resultJson.bos exists, and gsdpi_local remains no-go until adapter registration/testEnvironment/execute evidence exists.
- Inspect `runtime-evidence/M002-S04-live-artifact-flow.json`, `PAPERCLIP_LIVE_VALIDATION_REPORT.md`, `docs/13_LIVE_BOS_ARTIFACT_FLOW.md`, `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, and `plugin-bos-light/capabilities.paperclip-runtime.json` for no secrets, no core patch/direct DB/private import claims, and correct surface status.

### Decisions to revisit if S04 changes scope
- **Native-first durable truth** remains valid; revisit only if Paperclip lacks all visible issue/comment/document surfaces and S04 cannot produce readback evidence.
- **Spike-gated adapter integration** remains valid; do not bypass it with private Paperclip internals to satisfy the live probe.
- **Betting Table is a coordination view** remains valid; S04 must not convert comment/markdown fallbacks into approval truth or plugin-side approval state.
- **Hermes/GSD-Pi no-go propagation** must remain in force until supported runtime fixes provide fresh passing execution evidence.

## Proof Level

- This slice proves: Integration plus operational evidence. Real runtime required for the final S04 evidence file: yes, the visible artifact path must be exercised against the Paperclip sandbox through supported HTTP/API or documented CLI boundaries. Human/UAT required: no. This proves live visible issue/comment/document artifact flow for BOS envelopes only; it does not prove Hermes-backed agent execution, gsdpi_local execution, plugin registration, UI surfaces, native approvals, durable state, activity logging, or event delivery.

## Integration Closure

Upstream consumed: S02 Hermes environment/pass-with-execution-blocker evidence, S03 gsdpi_local fail-closed adapter evidence, existing BOS Light envelope seams in issueBlueprintFlow, bettingTable, evalGateEvidence, and circuitBreakerFlow, and previously observed Paperclip issue/comment/document APIs. New wiring introduced: a bounded host adapter/composer and S04 live probe/validator that turn existing BOS envelopes into Paperclip-visible artifacts with readback evidence. Downstream produced for S05: stable issue/document/comment refs and a conservative capability matrix/report showing which native artifact surfaces worked and which plugin/UI/adapter surfaces remain fallback-only. Remaining before milestone end-to-end usability: S05 plugin/UI surface probes and S06 final capability report/regression closure.

## Verification

- S04 adds `runtime-evidence/M002-S04-live-artifact-flow.json` as the canonical machine-readable state surface with phase, runtime version/build, company/issue IDs, artifact refs, readback hashes or snippets, side-effect counts, no-go guard status, redacted diagnostics, and no-core/no-DB/no-secret flags. `scripts/validate_s04_live_artifact_flow.py` becomes the executable health check for future agents; docs/13 and the live validation report provide reader-facing diagnostics. Failure states must name the failed API phase, status code, bounded response text or malformed JSON reason, timeout, and whether a fallback was used, without recording auth tokens or raw secrets.

## Tasks

- [x] **T01: Added a tested live Paperclip adapter and BOS artifact-flow composer that produce BPI, Blueprint, Betting Table, Eval Gate, and Circuit Breaker envelopes while preserving Hermes/GSD-Pi no-go and native-approval fail-closed guards.** `est:2h`
  ---
  estimated_steps: 7
  estimated_files: 4
  skills_used:
    - api-design
    - tdd
    - error-handling-patterns
  ---
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/src/livePaperclipAdapter.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/src/liveArtifactFlow.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/src/index.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/tests/liveArtifactFlow.test.ts`
  - Verify: npm --prefix plugin-bos-light test -- liveArtifactFlow

- [x] **T02: Added a standard-library S04 live artifact runner and fail-closed validator with tests for live readback proof, no-go guard propagation, redaction, and overclaim rejection.** `est:2h`
  ---
  estimated_steps: 8
  estimated_files: 4
  skills_used:
    - api-design
    - tdd
    - observability
  ---
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_s04_live_artifact_flow.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s04_live_artifact_flow.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_run_s04_live_artifact_flow.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_s04_live_artifact_flow.py`
  - Verify: python3 -m unittest scripts/test_run_s04_live_artifact_flow.py scripts/test_validate_s04_live_artifact_flow.py

- [x] **T03: T03 was rerun with a securely supplied Paperclip API key and now produces final live S04 issue/document/comment readback evidence instead of blocker evidence.** `est:1h`
  ---
  estimated_steps: 5
  estimated_files: 1
  skills_used:
    - verify-before-complete
    - observability
  ---
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S04-live-artifact-flow.json`
  - Verify: python3 scripts/validate_s04_live_artifact_flow.py --evidence runtime-evidence/M002-S04-live-artifact-flow.json --phase final

- [x] **T04: Close documentation and capability posture from final S04 evidence** `est:1.5h`
  Why: S04 must leave downstream slices with a truthful capability matrix and reader-facing proof ledger. Native artifact surfaces may only be promoted if T03 produced live version/build/readback evidence; all other surfaces and agent/adapter execution paths must remain conservative. Do:
  1. Add docs/13_LIVE_BOS_ARTIFACT_FLOW.md summarizing the final S04 run, exact evidence path, supported-boundary proof, visible artifact refs, no-go guard posture, fallback paths, and remaining gaps.
  2. Update PAPERCLIP_LIVE_VALIDATION_REPORT.md, docs/08_RUNTIME_CAPABILITY_HEALTH.md, docs/05_PERSISTENCE_MATRIX.md, and docs/06_ACCEPTANCE_TESTS.md so they distinguish live issue/comment/document artifact proof from unvalidated plugin registration, UI/data/action registration, approvals, state, activity, events, Hermes execution, and GSD-Pi execution.
  3. Update plugin-bos-light/capabilities.paperclip-runtime.json only for surfaces backed by T03 live readback evidence; likely candidates are issues.native, documents.native, and comments.native. Keep approvals.native, plugin registration, data/action/tools/UI, state, activity, events, Hermes, and GSD-Pi unvalidated or fallback-only.
  4. If capability promotion requires validator changes, update scripts/validate_runtime_capabilities.py and scripts/test_validate_runtime_capabilities.py so confirmed native artifact surfaces require version/build plus S04 evidence, while generic placeholder or overbroad confirmed claims still fail.
  5. Ensure plugin-bos-light/src/runtimeCapabilities.ts wording remains aligned with the matrix and does not imply cache overlay or fallback diagnostics are durable truth.
  6. Run the full closeout command set and fix any docs/matrix/test drift.
  Done when docs, matrix, source-level boundary wording, and validators all agree on exactly what S04 proved and what remains fallback-only/no-go.
  - Files: `docs/13_LIVE_BOS_ARTIFACT_FLOW.md`, `PAPERCLIP_LIVE_VALIDATION_REPORT.md`, `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, `docs/05_PERSISTENCE_MATRIX.md`, `docs/06_ACCEPTANCE_TESTS.md`, `plugin-bos-light/capabilities.paperclip-runtime.json`, `plugin-bos-light/src/runtimeCapabilities.ts`, `scripts/validate_runtime_capabilities.py`, `scripts/test_validate_runtime_capabilities.py`
  - Verify: python3 scripts/validate_s04_live_artifact_flow.py --evidence runtime-evidence/M002-S04-live-artifact-flow.json --phase final && python3 scripts/validate_runtime_capabilities.py && npm --prefix plugin-bos-light run typecheck

## Files Likely Touched

- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/src/livePaperclipAdapter.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/src/liveArtifactFlow.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/src/index.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/tests/liveArtifactFlow.test.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_s04_live_artifact_flow.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s04_live_artifact_flow.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_run_s04_live_artifact_flow.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_s04_live_artifact_flow.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S04-live-artifact-flow.json
- docs/13_LIVE_BOS_ARTIFACT_FLOW.md
- PAPERCLIP_LIVE_VALIDATION_REPORT.md
- docs/08_RUNTIME_CAPABILITY_HEALTH.md
- docs/05_PERSISTENCE_MATRIX.md
- docs/06_ACCEPTANCE_TESTS.md
- plugin-bos-light/capabilities.paperclip-runtime.json
- plugin-bos-light/src/runtimeCapabilities.ts
- scripts/validate_runtime_capabilities.py
- scripts/test_validate_runtime_capabilities.py
