# S04: Live proof and capability polish

**Goal:** Attempt a bounded live Paperclip issue, document, or comment readback for an M003 decision artifact when Paperclip access is available, otherwise persist fail-closed blocker evidence, then polish runtime capability docs and validators so unsupported plugin UI, actions, tool registration, native approvals, Hermes, activity logs, events, and GSD-Pi runtime support remain explicitly unpromoted.
**Demo:** Attempt supported live Paperclip issue, document, or comment readback for a decision artifact, or record fail-closed blocker evidence, then verify docs and tests keep unsupported surfaces out of claims.

## Must-Haves

- Must-haves:
- Active requirements advanced by this slice are R003, R008, R012, R013, R014, and R016. R003 is advanced by keeping document/comment/markdown artifacts as the visible system-of-record surface and cache overlays diagnostic only. R008 is advanced by asserting zero native approval mutation across live/blocker evidence. R012 is advanced by preserving v1.4.1 division ownership language and adapter seams in docs. R013 is advanced by keeping external Paperclip interaction behind adapter or bounded runner seams with deterministic markdown fallback. R014 is advanced by treating live Paperclip responses as untrusted external evidence that must be redacted and bounded before docs or validators consume it. R016 is advanced by keeping runtime capability claims fallback-only or unvalidated unless this exact live readback evidence proves a native artifact surface.
- A real test file `plugin-bos-light/tests/liveDecisionArtifactReadback.test.ts` asserts readback parsing, redaction, markdown-only fail-closed behavior, and no approval-state mutation for S02/S03 artifact envelopes.
- Real test files `scripts/test_run_m003_s04_live_decision_artifact_readback.py` and `scripts/test_validate_m003_s04_live_decision_artifact_readback.py` assert accepted live-evidence and fail-closed-blocker outcomes, missing credential preflight, denied access, malformed responses, readback mismatches, redaction, side-effect counters, and unsupported-surface non-promotion.
- The command `python3 scripts/run_m003_s04_live_decision_artifact_readback.py --output runtime-evidence/M003-S04-live-decision-artifact-readback.json` always writes sanitized evidence: `artifact_type=live-evidence` only when supported readback succeeds, or `artifact_type=fail-closed-blocker` when credentials or access are missing or denied.
- The evidence validator accepts either a complete live readback proof or a complete fail-closed blocker proof, and rejects any secret leakage, approval mutation, activity/event/Hermes/GSD-Pi side effects, unsupported capability promotion, or readback hash mismatch.
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, `docs/04_DATA_CONTRACTS.md`, and capability validators reference the M003 S04 evidence path truthfully while leaving plugin UI, actions, tool registration, native approvals, Hermes, activity logs, events, and GSD-Pi runtime support unpromoted.
- Closeout verification passes: targeted plugin tests, Python runner and validator tests, runtime capability validator, TypeScript typecheck, and full plugin test suite.

## Threat Surface

## Q3 exploit analysis

### Abuse scenarios to defend
- **Credential and secret leakage:** the live runner will use Paperclip access inputs when available; evidence, diagnostics, snippets, stdout/stderr digests, docs, and validator failures must never echo API keys, bearer tokens, cookies, auth headers, raw URLs containing credentials, or secret-like fixture content.
- **Parameter tampering / target confusion:** attacker-controlled or misconfigured base URLs, issue ids, document ids, comment ids, artifact refs, or selected-surface values could redirect readback to the wrong tenant/company/artifact or make a fallback look like native proof. The runner and validator should constrain supported phases, surface values, artifact ref formats, hashes, and company/runtime diagnostics.
- **Replay or stale evidence:** an old `runtime-evidence/M003-S04-live-decision-artifact-readback.json` could be reused to promote unsupported capability claims. Evidence should include generated timestamp, runtime version/build when reachable, phase/status, content hash, selected surface, blocker reason, and final validator acceptance for the current artifact.
- **Privilege escalation / approval mutation:** document/comment fallback artifacts could be misinterpreted as Paperclip-native approvals or used to mutate approval status. The slice must keep `native_approval_mutated=false`, approval side-effect counters at zero, and `approvals.native` unpromoted.
- **Prompt/content injection through readback:** issue/document/comment bodies are external, untrusted display content. Bounded snippets should be redacted, hashed, size-limited, and treated as evidence only; docs/validators must not execute, trust, or promote claims based solely on untrusted artifact prose.
- **Unsupported-surface promotion:** successful native issue/document/comment readback could be overgeneralized to plugin UI, actions, tool registration, activity logs, events, Hermes, or GSD-Pi execution. Validators must reject any such promotion.

### Trust boundaries
- Untrusted inputs enter from environment configuration, Paperclip HTTP/API responses, issue/document/comment contents, artifact refs, and existing runtime-evidence files.
- Trusted outputs are only validator-accepted, sanitized evidence envelopes and deterministic markdown fallbacks.
- No untrusted content should reach filesystem evidence, docs, capability matrix updates, or test diagnostics without redaction, bounding, hash validation, and explicit surface classification.

### Required safeguards during implementation
- Preflight missing/denied credentials as `fail-closed-blocker`, not partial success.
- Reject malformed responses, readback hash mismatches, unsupported surface promotions, secret-like strings, approval mutations, activity/event/Hermes/GSD-Pi side effects, and stale/incomplete evidence.
- Keep live readback behind adapter/runner seams and do not introduce direct plugin runtime, approval, Hermes, or GSD-Pi execution paths.

## Requirement Impact

## Q4 requirement impact

The slice plan explicitly advances these active requirements:

- **R003 — Paperclip as system of record / no hidden governance state.** Re-test that decision artifacts remain visible in native document/comment surfaces or deterministic markdown, while cache overlays stay diagnostic only.
- **R008 — Paperclip-native approval/request ownership.** Re-test zero native approval mutation and ensure comment/markdown fallbacks never become approval ids/statuses.
- **R012 — Adapter and persistence seams.** Re-test that live Paperclip interaction stays behind adapter or bounded runner seams and returns structured diagnostics instead of silent success.
- **R013 — Native-first durable artifact mirroring.** Re-test document/comment preference, markdown-only fallback, artifact refs, readback parsing, and hash validation for decision artifacts.
- **R014 — Div7 decision foundation without runtime overclaim.** Re-test sanitized decision artifact envelopes, untrusted readback handling, risk/decision metadata preservation, and fail-closed malformed/readback-mismatch behavior.
- **R016 — Conservative v1.4.1 runtime capability posture.** Re-test docs, capability matrix, and validators to ensure plugin UI, actions, tool registration, native approvals, Hermes, activity logs, events, and GSD-Pi remain fallback-only/unvalidated/unpromoted unless exact evidence exists.

## Required regression retests after shipping

- `npm --prefix plugin-bos-light test -- tests/liveDecisionArtifactReadback.test.ts tests/decisionArtifact.test.ts tests/majorFlowDecision.test.ts`
- `python3 -m unittest scripts/test_run_m003_s04_live_decision_artifact_readback.py scripts/test_validate_m003_s04_live_decision_artifact_readback.py`
- `python3 scripts/run_m003_s04_live_decision_artifact_readback.py --output runtime-evidence/M003-S04-live-decision-artifact-readback.json`
- `python3 scripts/validate_m003_s04_live_decision_artifact_readback.py --evidence runtime-evidence/M003-S04-live-decision-artifact-readback.json --phase final`
- `python3 scripts/validate_runtime_capabilities.py`
- `python3 -m unittest scripts/test_validate_runtime_capabilities.py scripts/test_validate_m003_s04_live_decision_artifact_readback.py scripts/test_run_m003_s04_live_decision_artifact_readback.py`
- `npm --prefix plugin-bos-light run typecheck`
- `npm --prefix plugin-bos-light test`

## Decisions to keep under review

No new decision needs reversal before execution. S04 should preserve the existing M003 decisions to polish native artifacts before plugin UI and to attempt live artifact proof but fail closed; those decisions should be revisited only if the live evidence demonstrates a broader native artifact surface than documents/comments/issues or if implementation pressure attempts to promote plugin UI/actions/approvals/Hermes/GSD-Pi without matching proof.

## Proof Level

- This slice proves: Operational proof at the Paperclip native artifact boundary. Real runtime access is attempted when environment inputs exist; when access is unavailable or denied, a validator-accepted fail-closed blocker artifact is the stopping condition. Human UAT is not required, but the evidence JSON must be readable by a future operator without secret material.

## Integration Closure

Upstream surfaces consumed: `persistDecisionArtifact`, `persistMajorFlowDecisionArtifact`, `DecisionArtifactEnvelope`, `LivePaperclipIssueAdapter`, `PaperclipAdapter`, the M002 S04 live artifact runner pattern, `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, and `plugin-bos-light/capabilities.paperclip-runtime.json`. New wiring introduced: a decision-artifact readback helper or seam, a bounded M003 S04 live readback runner, an evidence validator, and documentation guardrails. After this slice, M003 has a complete contract to artifact to major-flow to live-proof loop for supported native artifact surfaces, with unsupported runtime surfaces still explicitly excluded.

## Verification

- The primary inspection surface is `runtime-evidence/M003-S04-live-decision-artifact-readback.json`. It must include generated timestamp, redacted inputs, runtime version/build when reachable, selected surface, artifact ref, readback status, content hash, bounded snippet, diagnostics, blocker reason, side-effect counters, and invariants including `native_approval_mutated=false`, `no_secret_diagnostics=true`, `hermes_execution_attempted=false`, and `gsd_pi_execution_attempted=false`. Failures are localized by phase names such as auth.preflight, runtime.health, documents.native, comments.native, documents.read, comments.read, and readback.mismatch.

## Tasks

- [x] **T01: Add decision artifact readback contract tests** `est:2h`
  Executor skills_used frontmatter: tdd, api-design, verify-before-complete.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/liveDecisionArtifactReadback.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/index.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/contracts.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/tests/liveDecisionArtifactReadback.test.ts`
  - Verify: npm --prefix plugin-bos-light test -- tests/liveDecisionArtifactReadback.test.ts tests/decisionArtifact.test.ts tests/majorFlowDecision.test.ts

- [x] **T02: Add live readback runner and validator** `est:3h`
  Executor skills_used frontmatter: tdd, error-handling-patterns, verify-before-complete.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/scripts/run_m003_s04_live_decision_artifact_readback.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/scripts/validate_m003_s04_live_decision_artifact_readback.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/scripts/test_run_m003_s04_live_decision_artifact_readback.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/scripts/test_validate_m003_s04_live_decision_artifact_readback.py`
  - Verify: python3 -m unittest scripts/test_run_m003_s04_live_decision_artifact_readback.py scripts/test_validate_m003_s04_live_decision_artifact_readback.py

- [x] **T03: Run live attempt and capture evidence** `est:45m`
  Executor skills_used frontmatter: verify-before-complete.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/runtime-evidence/M003-S04-live-decision-artifact-readback.json`
  - Verify: python3 scripts/run_m003_s04_live_decision_artifact_readback.py --output runtime-evidence/M003-S04-live-decision-artifact-readback.json
python3 scripts/validate_m003_s04_live_decision_artifact_readback.py --evidence runtime-evidence/M003-S04-live-decision-artifact-readback.json --phase final

- [x] **T04: Polish capability docs and close regressions** `est:2h`
  Executor skills_used frontmatter: write-docs, verify-before-complete.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/docs/08_RUNTIME_CAPABILITY_HEALTH.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/docs/04_DATA_CONTRACTS.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/capabilities.paperclip-runtime.json`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/runtimeCapabilities.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/scripts/validate_runtime_capabilities.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/scripts/test_validate_runtime_capabilities.py`
  - Verify: python3 scripts/validate_runtime_capabilities.py
python3 -m unittest scripts/test_validate_runtime_capabilities.py scripts/test_validate_m003_s04_live_decision_artifact_readback.py scripts/test_run_m003_s04_live_decision_artifact_readback.py
npm --prefix plugin-bos-light test -- tests/liveDecisionArtifactReadback.test.ts tests/decisionArtifact.test.ts tests/majorFlowDecision.test.ts
npm --prefix plugin-bos-light run typecheck
npm --prefix plugin-bos-light test

## Files Likely Touched

- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/liveDecisionArtifactReadback.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/index.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/contracts.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/tests/liveDecisionArtifactReadback.test.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/scripts/run_m003_s04_live_decision_artifact_readback.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/scripts/validate_m003_s04_live_decision_artifact_readback.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/scripts/test_run_m003_s04_live_decision_artifact_readback.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/scripts/test_validate_m003_s04_live_decision_artifact_readback.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/runtime-evidence/M003-S04-live-decision-artifact-readback.json
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/docs/08_RUNTIME_CAPABILITY_HEALTH.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/docs/04_DATA_CONTRACTS.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/capabilities.paperclip-runtime.json
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/runtimeCapabilities.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/scripts/validate_runtime_capabilities.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/scripts/test_validate_runtime_capabilities.py
