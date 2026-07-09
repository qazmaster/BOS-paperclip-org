# M003: Decision Protocol and Product Polish

**Gathered:** 2026-05-30
**Status:** Ready for planning

## Project Description

M003 builds a deliberately narrow bridge between Div7 decision protocol and product polish for BOS Light. The milestone should make important BOS Light choices visible, explainable, and recoverable in Paperclip-native artifacts without turning the protocol into a second governance runtime or a bureaucratic layer.

The center of gravity is not a broad plugin UI release. Product polish lands first in native issue/document/comment artifacts because M002 has bounded live readback proof for issues, documents, and comments, while plugin UI, actions, approvals, tool registration, and runtime execution remain fallback-only or unvalidated.

## Why This Milestone

M001 deliberately deferred full Div7 `piko:decide` until usage traces existed, and M002 established a conservative runtime posture: artifact surfaces are the safest visible proof boundary, but plugin UI/actions/native approvals are not yet promotable. M003 exists now to connect real product flows to a compact Div7 decision record before the system accumulates opaque approval, gate, circuit, policy, budget, and strategy decisions.

This milestone should make BOS Light feel more coherent to users: when a major choice happens, the user can see why it happened, what domain it was classified into, what action is recommended, and where the durable record lives.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Run or inspect `piko:decide` for a major BOS Light choice and receive a Div7.MissionControl decision recommendation with Cynefin classification, domain-dependent OODA detail, and a native-artifact-ready decision record.
- Open a Paperclip issue document or comment, or a deterministic markdown fallback, and see a polished decision artifact that explains the decision without requiring hidden plugin state.
- Trace major choices from product flows such as batch approval tradeoffs, gate failures, circuit breaker OPEN escalations, policy or budget exceptions, and strategic roadmap decisions.

### Entry point / environment

- Entry point: `piko:decide` tool/function, decision artifact generation path, and native issue/document/comment mirroring where supported.
- Environment: local repository tests and a live Paperclip issue/document/comment artifact attempt when supported credentials and runtime access are available.
- Live dependencies involved: Paperclip native issues/documents/comments for the live artifact attempt; plugin UI/actions/native approvals/tool registration remain non-dependencies and must not be promoted.

## Completion Class

- Contract complete means: decision input classification, risk-tiered record shape, Cynefin domain assignment, domain-dependent OODA rendering, artifact envelope fields, fallback diagnostics, and no-overclaim runtime capability behavior are covered by tests/fixtures.
- Integration complete means: major BOS Light flows can produce or attach decision artifacts through the same artifact-first persistence posture used for BPI, Blueprint, Betting Table, Eval Gate, and Circuit Breaker evidence.
- Operational complete means: a live issue/document/comment readback attempt is made when supported; if unavailable or denied, M003 records fail-closed blocker evidence and does not claim live support beyond actual proof.

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- A batch approval, policy/budget exception, gate failure, circuit breaker OPEN escalation, or strategic choice can produce a visible Div7 decision record with risk-tiered detail and a clear recommended action.
- Clear or low-risk choices remain compact, while complicated/complex/chaotic or high-risk choices show the relevant OODA sections and richer rationale.
- Decision artifacts can be mirrored to Paperclip-native issue document/comment surfaces when those APIs are available, or returned as deterministic markdown-only fallback with explicit diagnostics.
- What cannot be simulated if M003 is to be considered truly done: any claim that plugin UI, host `piko:*` registration, native approvals, activity logs, events, Hermes, or GSD-Pi runtime execution works. Those require separate live proof and remain out of scope for capability promotion.

## Architectural Decisions

### Bridge decision protocol and product polish deliberately

**Decision:** M003 should connect real product flows to a minimal but useful Div7 decision record rather than choosing only protocol work or only cosmetic polish.

**Rationale:** A standalone decision protocol risks bureaucracy, while pure polish would leave major choices opaque. A bridge lets the user see better product artifacts while validating that Div7 adds useful judgment around real BOS Light moments.

**Alternatives Considered:**
- Decision protocol first — rejected as too likely to overbuild `piko:decide` before enough product-facing usage.
- Product polish first — rejected because it would not address the traceability gap around major choices.

### Trigger decision records for all major choices

**Decision:** Decision records should cover all major choices: batch approvals, prioritization tradeoffs, policy updates, budget/resource exceptions, incidents/self-healing triggers, and strategic choices.

**Rationale:** The user chose a broad trigger set, but the record shape must prevent broad coverage from becoming heavy bureaucracy.

**Alternatives Considered:**
- Escalations only — rejected because it would miss batch approval and prioritization tradeoff context.
- Every small workflow step — rejected implicitly by using “major choices” and risk tiers rather than exhaustive logging.

### Use risk-tiered record detail

**Decision:** M003 decision records are risk-tiered: compact records by default, richer rationale for high-risk, policy, budget, incident, or strategic decisions.

**Rationale:** This preserves the Phase 4 goal that the decision protocol is not bureaucracy while still giving serious decisions the evidence and rationale they need.

**Alternatives Considered:**
- Compact artifact for every decision — rejected because high-risk choices need more rationale and evidence.
- Full rationale for every decision — rejected because routine batch approvals would become noisy.

### Make OODA domain-dependent

**Decision:** OODA should be visible only when the Cynefin domain or risk tier calls for it. CLEAR decisions can show a compact recommended action; COMPLICATED, COMPLEX, CHAOTIC, policy, budget, incident, and strategic decisions should show more explicit Observe/Orient/Decide/Act sections.

**Rationale:** The user wants OODA available without forcing every low-risk choice into a verbose framework.

**Alternatives Considered:**
- Action only — rejected because some decisions need explainability.
- Visible OODA for everything — rejected because it would feel heavy for CLEAR batch decisions.

### Polish native artifacts before plugin UI

**Decision:** Product polish for M003 lands first in native issue/document/comment artifacts and markdown fallbacks, not plugin dashboard widgets, actions, or issue-detail tabs.

**Rationale:** M002 confirmed bounded live issue/document/comment readback but kept plugin UI/actions/tool registration/native approvals unvalidated or fallback-only. M003 should improve what can be safely shown now.

**Alternatives Considered:**
- Plugin UI intent polish — deferred because it would remain fallback-only and could overpromise runtime capability.
- Native approvals as primary proof — rejected because `approvals.native` remains unvalidated.

### Attempt live artifact proof but fail closed

**Decision:** M003 should attempt live Paperclip issue/document/comment readback for decision artifacts when supported access exists, but fail closed and retain fixture proof if live access is unavailable or denied.

**Rationale:** This aligns with M002’s conservative evidence posture and lets M003 improve confidence without inventing capability proof.

**Alternatives Considered:**
- Contract-only proof — rejected because the user selected a live artifact attempt.
- Full live plugin proof — rejected because plugin UI/actions/registration are outside the proven boundary.

## Error Handling Strategy

Decision generation must be safe, inspectable, and non-authoritative unless a native artifact confirms persistence. Invalid inputs should return structured validation errors instead of partial decision records. Unknown or mixed signals should classify as DISORDER or low-confidence COMPLICATED/COMPLEX rather than pretending certainty.

Artifact persistence should follow the existing native-first envelope pattern: prefer documents/comments when supported, preserve deterministic markdown-only fallback when native writes fail, and include fallback diagnostics without secrets. A failed live artifact attempt must not mark the decision as persisted. Fallback comments or markdown review requests must not become native approval state. Runtime access denial, unavailable credentials, missing APIs, malformed adapter responses, and readback mismatches should produce fail-closed blocker evidence.

## Risks and Unknowns

- “All major choices” could become too broad — risk-tiered detail is needed so routine choices stay compact.
- Current `src/decision.ts` is a lightweight heuristic — M003 must decide how much classification rigor is enough without overbuilding.
- OODA visibility can add noise — domain-dependent rendering is the selected mitigation.
- Live artifact attempt may be unavailable or denied — completion must allow fail-closed blocker evidence without promoting support.
- Paperclip plugin UI/actions/tool registration/native approvals remain unvalidated — M003 must avoid implying they work.
- M004 v1.4.1 division semantics are active in the worktree — M003 should use Div7.MissionControl, Div5.QualificationsLibraryLearning, Div3.Treasury, Div6.External, and the new ownership language rather than old division names.

## Existing Codebase / Prior Art

- `docs/01_CONTEXT_AND_DECISION.md` — defines BOS Light as a Paperclip template plus thin adapter, preserving Div7 decision protocol but discarding BOS Kernel infrastructure.
- `docs/03_IMPLEMENTATION_PLAN_V1_2.md` — Phase 4 names `piko:decide`, Cynefin classification, OODA recommendation, and decision records in issue comments/documents.
- `docs/05_PERSISTENCE_MATRIX.md` — records Decision Record persistence as issue comment/document first, with document/description markdown fallback.
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md` — confirms bounded issues/documents/comments proof and keeps plugin UI/actions/native approvals/tool registration unvalidated or fallback-only.
- `plugin-bos-light/src/decision.ts` — current lightweight `decide` implementation using signal text heuristics and returning `DecisionMetadata`.
- `plugin-bos-light/src/contracts.ts` — defines `DecisionMetadata`, current v1.4.1 division names, BOS statuses, and related contracts.
- `plugin-bos-light/src/worker.ts` — registers optional `piko:decide` and already follows optional registration/fail-closed comments for other tools/actions.
- `plugin-bos-light/src/blueprintArtifact.ts` — prior native artifact envelope pattern for documents/comments/markdown fallback.
- `plugin-bos-light/src/evalGateEvidence.ts` — prior evidence envelope and comment/markdown fallback pattern.
- `plugin-bos-light/src/circuitBreakerFlow.ts` — prior escalation/evidence fallback pattern for circuit breaker state.

## Relevant Requirements

- R003 — preserves Paperclip as the system of record and prevents BOS Light from owning governance state.
- R008 — keeps approval/request ownership Paperclip-native and avoids plugin-side approval substitution.
- R009 — extends Eval Gate evidence posture by making gate-driven decisions visible when needed.
- R010 — extends Circuit Breaker fallback behavior by adding visible decision records for self-healing or escalation triggers.
- R012 — preserves adapter and persistence seams around runtime-dependent calls.
- R013 — advances native-first durable artifact mirroring for decision records.
- R014 — implements the previously deferred Div7 decision foundation without pretending full runtime support.
- R016 — preserves conservative runtime claims under the v1.4.1 migration posture.

## Scope

### In Scope

- `piko:decide` contract refinement for major BOS Light choices.
- Cynefin classification for CLEAR, COMPLICATED, COMPLEX, CHAOTIC, and DISORDER cases.
- Domain-dependent OODA rendering.
- Risk-tiered decision record shape.
- Native-artifact-ready decision markdown and envelope fields.
- Document/comment/markdown fallback diagnostics.
- Fixture coverage for batch approval, gate failure, circuit breaker OPEN, policy/budget exception, and strategic choice examples.
- Live issue/document/comment readback attempt when supported access exists.
- Product polish of decision artifacts and related native artifact language.

### Out of Scope / Non-Goals

- Full BOS Kernel decision engine.
- Separate governance, policy, event, or approval runtime.
- Plugin-owned approvals or substituting fallback comments for native approval state.
- Claiming plugin dashboard widgets, actions, issue-detail tabs, host tool registration, activity logs, events, Hermes, or GSD-Pi execution support.
- Building a broad UI redesign before proven Paperclip UI surfaces exist.
- Making every minor workflow step create a verbose decision record.

## Technical Constraints

- Paperclip remains source of truth.
- Decision records must be visible in native artifacts or explicit markdown fallback, not hidden plugin state.
- Runtime capability claims must match actual evidence.
- Adapter calls stay behind seams and return diagnostics instead of silent success.
- No secrets or raw auth material in decision artifacts, fallback diagnostics, logs, or evidence.
- M003 code should use v1.4.1 division names from the current contracts.

## Integration Points

- `piko:decide` / `plugin-bos-light/src/decision.ts` — primary decision protocol entry point.
- Paperclip native issues — host issue context and possible escalation/decision location.
- Paperclip native documents/comments — preferred visible artifact surfaces for polished decision records.
- Markdown-only fallback — deterministic artifact when native write/readback is unavailable.
- BPI/Blueprint/Betting Table flows — sources of prioritization and batch approval decisions.
- Eval Gate evidence — source of correction/acceptance decision triggers.
- Circuit Breaker evidence — source of self-healing/escalation decision triggers.
- Runtime capability matrix/docs — guardrails against overclaiming unvalidated plugin surfaces.

## Testing Requirements

Use contract and fixture tests first, then live artifact attempt only inside supported boundaries. Unit tests should cover classification, confidence clamping, DISORDER/ambiguous signals, risk-tier selection, OODA rendering rules, and decision markdown shape. Integration-style fixture tests should prove decision artifacts can be produced from batch approval, gate failure, circuit breaker OPEN, policy/budget exception, and strategic choice inputs.

Artifact tests must verify selected surface, artifact refs, fallback reasons, sanitized errors, readback validation when live proof is attempted, and no mutation of native approval status from comment/markdown fallbacks. Runtime tests must fail closed if plugin UI/actions/tool registration/native approvals are absent.

## Acceptance Criteria

- A decision input for a CLEAR batch approval produces a compact Div7.MissionControl recommendation and decision record.
- A COMPLICATED policy or budget exception produces richer rationale and visible OODA sections.
- A COMPLEX ambiguous strategic choice recommends bounded experiment/probe behavior and records uncertainty.
- A CHAOTIC outage/runaway/circuit-breaker scenario recommends stabilization/self-healing first and creates escalation-ready artifact content.
- Decision records are risk-tiered: compact by default, expanded for high-risk, policy, budget, incident, or strategic choices.
- Decision artifact persistence prefers native documents/comments where supported and returns markdown-only fallback with diagnostics otherwise.
- A live issue/document/comment readback attempt is executed when supported access is available; unavailable access is recorded as fail-closed blocker evidence, not ignored.
- Tests and docs explicitly avoid promoting plugin UI/actions/tool registration/native approvals/Hermes/GSD-Pi support.

## Open Questions

- Exact threshold between compact and expanded record detail — current thinking: domain plus explicit risk category should decide.
- Exact decision artifact schema version and field names — current thinking: extend `DecisionMetadata` rather than invent a separate runtime-owned object.
- Whether batch approval decisions should always be recorded or only when selected batch differs materially from BPI order — current thinking: all major batch approvals get compact records.
- Whether the live artifact attempt will have supported Paperclip credentials and target company access during execution — current thinking: attempt only if available, otherwise persist blocker evidence.
