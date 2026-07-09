# S03: Major flow decision integration

**Goal:** Map the existing batch approval, Eval Gate, Circuit Breaker, policy exception, budget exception, and strategic choice seams onto the S01 DecisionResult contract and S02 DecisionArtifactEnvelope persistence path. The slice proves fixture-level integration only: each major flow can produce a Div7.MissionControl decision artifact with the expected Cynefin domain, risk tier, detail level, fallback diagnostics, and no native approval mutation.
**Demo:** Run integration fixtures where batch approval, eval gate failure, circuit breaker OPEN, policy or budget exception, and strategic choice inputs produce consistent decision artifacts.

## Must-Haves

- Must-haves:
- Batch approval, Eval Gate failure, Circuit Breaker OPEN, policy exception, budget exception, and strategic choice inputs all call the S01 `decide` contract and S02 `persistDecisionArtifact` helper rather than creating a separate decision persistence path.
- Batch approval remains CLEAR, LOW-risk, compact, and artifact-only; it must not create or mutate native approval state.
- Eval Gate failure advances R009 by producing a visible expanded risk-tiered decision artifact with gate/run context and sanitized diagnostics.
- Circuit Breaker OPEN advances R010 and supports R015 by producing a CHAOTIC, CRITICAL, self-healing decision artifact while preserving Div1.HCO control language and avoiding live runtime/event/activity claims.
- Policy and budget exceptions produce COMPLICATED expanded records; strategic choices produce COMPLEX OODA records.
- All outputs preserve S02 invariants: `decided_by=Div7.MissionControl`, `diagnostics_sanitized=true`, and `native_approval_mutated=false`.
- R003 and R008 remain supported by keeping Paperclip document/comment artifacts or deterministic markdown fallback as the visible surface and treating cache/decision persistence as diagnostic overlay only.
- Verification stopping condition:
- `plugin-bos-light/tests/majorFlowDecision.test.ts` contains real assertions for all six flow inputs and failure fallback paths.
- `npm --prefix plugin-bos-light test -- tests/majorFlowDecision.test.ts` passes.
- `npm --prefix plugin-bos-light run typecheck` passes.
- `npm --prefix plugin-bos-light test` passes.
- `python3 scripts/validate_runtime_capabilities.py` passes with no new unsupported runtime capability claims.

## Threat Surface

## Q3 — Exploit analysis

### Trust boundaries
- Untrusted or semi-trusted flow inputs enter `persistMajorFlowDecisionArtifact`: batch approval issue ids/reasons/BPI refs, Eval Gate result or evidence envelopes, circuit breaker evidence, policy/budget exception context, and strategic choice narrative.
- Those inputs are transformed into S01 `DecisionResult` metadata/markdown and passed to S02 `persistDecisionArtifact`, where they may reach cache persistence, Paperclip document creation, Paperclip comments, or deterministic markdown fallback refs.
- Adapter responses and failures are untrusted: malformed document/comment responses, denied capabilities, and thrown errors must not be treated as successful native persistence.

### Abuse scenarios to cover before execution completes
- **Parameter tampering:** forged issue ids, run ids, gate ids, circuit ids, policy owners, budget constraints, or risk words could produce authoritative-looking Div7.MissionControl artifacts for the wrong object or an inflated risk tier.
- **Approval substitution:** batch approval artifacts or markdown/comment fallback could be misread as native approval state unless tests assert `native_approval_mutated=false` and no `createApprovalRequest` calls.
- **Replay/duplication:** deterministic timestamps/ids or repeated flow inputs could create duplicate decision artifacts; fixtures should demonstrate stable refs where intended and no state mutation beyond cache-overlay diagnostics.
- **Markdown/content injection:** user-controlled reasons, diagnostics, or evidence text could inject misleading headings, links, HTML, prompt-like instructions, or fake status lines into native comments/documents and fallback markdown.
- **Secret/PII leakage:** adapter errors, external evidence, stack traces, tokens, cookies, API keys, raw auth material, or sensitive policy/budget context could leak through `decision.diagnostics`, fallback diagnostics, document/comment errors, logs, tests, or runtime evidence.
- **Capability overclaiming:** policy/budget/circuit artifacts could imply live runtime control, activity/event support, Hermes/GSD-Pi execution, or native Paperclip approval support even though S03 is fixture/integration proof only.
- **Denial of service/noise:** oversized evidence or repeated gate/circuit failures could produce very large markdown artifacts or noisy cache/native writes if inputs are not bounded.

### Required mitigations / test expectations
- Keep all S02 invariants asserted for every major-flow variant: `decided_by=Div7.MissionControl`, `diagnostics_sanitized=true`, and `native_approval_mutated=false`.
- Add negative adapter tests for unavailable/malformed document/comment responses and ensure markdown-only fallback has sanitized, bounded diagnostics.
- Add assertions that batch approval never calls `createApprovalRequest` and never mutates Betting Table native approval ids/status.
- Ensure generated artifacts make fixture-only scope explicit where relevant and do not claim plugin UI, actions, host registration, native approvals, Hermes, activity logs, events, or GSD-Pi runtime execution.
- Bound and sanitize all user/evidence/diagnostic strings before rendering to native artifacts or markdown fallback.

## Requirement Impact

## Q4 — Requirement impact and retest scope

### Source artifact status
- The requested `.gsd/milestones/M003/REQUIREMENTS.md` artifact is not present in this worktree.
- Requirement mapping was therefore derived from `.gsd/milestones/M003/M003-CONTEXT.md`, `.gsd/milestones/M003/M003-ROADMAP.md`, and `.gsd/milestones/M003/slices/S03/S03-PLAN.md`.
- Notable inconsistency: S03 explicitly says Circuit Breaker OPEN "supports R015", but the M003 context/roadmap requirement list names R003, R008, R009, R010, R012, R013, R014, and R016 and does not define R015 in the available milestone artifacts.

### R-IDs touched by S03
- **R003** — S03 must preserve Paperclip as the visible system-of-record surface by using documents/comments or deterministic markdown fallback and keeping decision/cache persistence as diagnostic overlay only.
- **R008** — Batch approval and fallback artifacts must not mutate, substitute for, or imply native Paperclip approval state.
- **R009** — Eval Gate failures must produce visible expanded risk-tiered decision artifacts with gate/run context and sanitized diagnostics.
- **R010** — Circuit Breaker OPEN flows must produce CHAOTIC/CRITICAL self-healing decision artifacts while preserving operational control boundaries.
- **R012** — The new helper consumes adapter/persistence seams and must preserve runtime-dependent call boundaries and sanitized diagnostics.
- **R013** — S03 exercises native-first durable artifact mirroring and deterministic fallback through the S02 envelope.
- **R014** — S03 applies the deferred Div7 decision foundation to major product flows rather than inventing a new governance runtime.
- **R016** — S03 docs/tests must preserve conservative v1.4.1 runtime claims and avoid promoting unsupported plugin/runtime surfaces.
- **R015** — Mentioned by the S03 plan as supported by Circuit Breaker OPEN, but missing from the available M003 requirement list; this should be reconciled before completion.

### Must re-test after shipping S03
- `npm --prefix plugin-bos-light test -- tests/majorFlowDecision.test.ts` — proves all six variants and fallback paths through the S01/S02 contracts.
- `npm --prefix plugin-bos-light test -- tests/majorFlowDecision.test.ts tests/decisionArtifact.test.ts tests/evalGateEvidence.test.ts tests/circuitBreakerFlow.test.ts` — retests R008/R009/R010/R013 integration surfaces.
- `npm --prefix plugin-bos-light run typecheck` — validates exported contracts and docs-aligned types.
- `npm --prefix plugin-bos-light test` — catches regressions across decision, artifact, Eval Gate, Circuit Breaker, Betting Table, and worker seams.
- `python3 scripts/validate_runtime_capabilities.py` — retests R016/no-overclaim runtime capability posture.
- Documentation review of `docs/04_DATA_CONTRACTS.md` and `docs/08_RUNTIME_CAPABILITY_HEALTH.md` — verifies R003/R012/R014/R016 wording remains artifact-first, fixture-scoped, and fail-closed.

### Decisions to revisit
- Reconfirm the milestone's no-new-governance-runtime decision: `majorFlowDecision.ts` should only compose `decide` and `persistDecisionArtifact`.
- Reconfirm the S02 cache-overlay decision: cache writes are non-authoritative diagnostics, not system-of-record state.
- Reconcile the R015 reference against the missing requirements artifact/current milestone requirement list.

## Proof Level

- This slice proves: Integration fixture proof. Real runtime required: no. Human/UAT required: no. This slice proves composition of existing pure functions and adapter seams; live Paperclip readback and fail-closed live blocker evidence remain S04 scope.

## Integration Closure

Upstream surfaces consumed: `plugin-bos-light/src/decision.ts`, `plugin-bos-light/src/decisionArtifact.ts`, `plugin-bos-light/src/bettingTable.ts`, `plugin-bos-light/src/evalGateEvidence.ts`, `plugin-bos-light/src/circuitBreakerFlow.ts`, and `plugin-bos-light/src/contracts.ts`. New wiring introduced: a reusable `plugin-bos-light/src/majorFlowDecision.ts` helper exported from `plugin-bos-light/src/index.ts`. What remains before milestone end-to-end usability: S04 must attempt supported live Paperclip issue/document/comment readback for one decision artifact or record fail-closed blocker evidence; no live approval/plugin/Hermes/GSD-Pi support is claimed by S03.

## Verification

- Slice-level diagnostics are the S02 decision artifact envelope fields: `selected_surface`, `artifact_ref`, `fallback.reason`, `document_error`, `comment_error`, `cache_overlay.save`, `cache_overlay.error`, `decision.diagnostics`, and `invariants`. Redaction constraint: raw auth material, tokens, cookies, API keys, stack traces, and raw external evidence must not appear in decision artifacts, tests, docs, or runtime capability evidence.

## Tasks

- [x] **T01: Added an adapter-only major-flow decision artifact path for batch approvals and Eval Gate failures, with fixture coverage proving S01/S02 contract reuse and no approval-state mutation.** `est:2h`
  Skills expected for executor task plan frontmatter: api-design, tdd, verify-before-complete.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/majorFlowDecision.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/tests/majorFlowDecision.test.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/contracts.ts`
  - Verify: npm --prefix plugin-bos-light test -- tests/majorFlowDecision.test.ts

- [x] **T02: Added artifact-first circuit breaker, policy exception, budget exception, and strategic choice decision adapters with fixture coverage and sanitized markdown-only fallbacks.** `est:2h`
  Skills expected for executor task plan frontmatter: api-design, tdd, verify-before-complete.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/majorFlowDecision.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/tests/majorFlowDecision.test.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/contracts.ts`
  - Verify: npm --prefix plugin-bos-light test -- tests/majorFlowDecision.test.ts

- [x] **T03: Documented and public-export-verified the S03 major-flow decision artifact helper without promoting unsupported runtime or approval surfaces.** `est:1.5h`
  Skills expected for executor task plan frontmatter: write-docs, verify-before-complete.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/index.ts`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/docs/04_DATA_CONTRACTS.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/docs/08_RUNTIME_CAPABILITY_HEALTH.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/scripts/validate_runtime_capabilities.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/tests/majorFlowDecision.test.ts`
  - Verify: npm --prefix plugin-bos-light test -- tests/majorFlowDecision.test.ts tests/decisionArtifact.test.ts tests/evalGateEvidence.test.ts tests/circuitBreakerFlow.test.ts
npm --prefix plugin-bos-light run typecheck
npm --prefix plugin-bos-light test
python3 scripts/validate_runtime_capabilities.py

- [x] **T04: Harden major-flow artifact inputs and sanitized rendering** `est:1 step`
  Address closeout security blockers in the S03 major-flow decision integration without introducing a new persistence path or unsupported runtime claims. Add runtime validation/normalization for direct MajorFlowDecisionArtifactInput variants before dereferencing nested fields; invalid or malformed inputs must fail closed with bounded sanitized diagnostics via the existing S01/S02 decision artifact path. Ensure accepted/displayed issue identifiers cannot persist raw auth/token/cookie/API-key-like material into decision markdown, artifact ids, or refs; reject or safely transform invalid public issue ids. Escape or otherwise neutralize markdown/HTML/control-sensitive untrusted free-form major-flow fields before rendering document/comment/fallback markdown while preserving existing redaction/truncation. Update docs only to match the implemented fail-closed behavior and maintain fixture-only scope. Extend majorFlowDecision tests to cover markdown/HTML injection strings, token-like issue ids, and malformed direct inputs for the six major-flow variants, while asserting decided_by=Div7.MissionControl, diagnostics_sanitized=true, native_approval_mutated=false, and no native approval mutation.
  - Files: `plugin-bos-light/src/majorFlowDecision.ts`, `plugin-bos-light/src/decision.ts`, `plugin-bos-light/src/decisionArtifact.ts`, `plugin-bos-light/tests/majorFlowDecision.test.ts`, `docs/04_DATA_CONTRACTS.md`, `docs/08_RUNTIME_CAPABILITY_HEALTH.md`
  - Verify: npm --prefix plugin-bos-light test -- tests/majorFlowDecision.test.ts
npm --prefix plugin-bos-light test -- tests/majorFlowDecision.test.ts tests/decisionArtifact.test.ts tests/evalGateEvidence.test.ts tests/circuitBreakerFlow.test.ts
npm --prefix plugin-bos-light run typecheck
npm --prefix plugin-bos-light test
python3 scripts/validate_runtime_capabilities.py

## Files Likely Touched

- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/majorFlowDecision.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/tests/majorFlowDecision.test.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/contracts.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/index.ts
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/docs/04_DATA_CONTRACTS.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/docs/08_RUNTIME_CAPABILITY_HEALTH.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/scripts/validate_runtime_capabilities.py
- plugin-bos-light/src/majorFlowDecision.ts
- plugin-bos-light/src/decision.ts
- plugin-bos-light/src/decisionArtifact.ts
- plugin-bos-light/tests/majorFlowDecision.test.ts
- docs/04_DATA_CONTRACTS.md
- docs/08_RUNTIME_CAPABILITY_HEALTH.md
