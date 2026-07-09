# M003 — Research

**Date:** 2026-05-30

## Summary

M003 already has a thin decision entry point, but it is only a keyword heuristic over `signals` and returns a bare `DecisionMetadata` record. That means the hard part of this milestone is not registration — `piko:decide` is already optional in `worker.ts` — but making the decision output explainable, risk-tiered, and mirrorable to Paperclip-native artifacts without overclaiming runtime support.

The strongest existing pattern is the artifact wrappers already used for blueprints, Eval Gates, and circuit-breaker observations. Those modules show the exact shape M003 should imitate: a deterministic envelope, `selected_surface`, `artifact_ref`, markdown payload, bounded fallback diagnostics, and fail-closed behavior when native writes are unavailable. Decision work should extend that pattern rather than invent a new persistence style.

There is no active `REQUIREMENTS.md` in this worktree, so there is nothing to triage mechanically. The milestone context should be treated as the scope source: compact records by default, richer detail for policy/budget/incident/strategic decisions, visible OODA only when warranted, and explicit fail-closed diagnostics for live Paperclip proof attempts.

## Recommendation

Prove the pure decision contract first: classification, confidence clamping, decision type selection, and the rendering rules for compact vs expanded records. Only after that should M003 add a decision artifact envelope and native comment/document mirroring, because the artifact layer is where the user-facing polish and fallback behavior live.

Keep `DecisionMetadata` as the pure decision result, and layer a separate decision artifact envelope on top of it if needed. That keeps the contract stable, lets tests stay focused, and aligns with the repository’s established artifact-first posture.

The most important implementation boundary is runtime honesty: do not imply plugin UI, native approvals, tool registration, or activity-log support beyond the proven boundary. If a live issue/document/comment readback attempt is made, it should fail closed and preserve deterministic markdown evidence when the host surface is unavailable.

### Candidate requirements to formalize later

- Major decisions must be visible in Paperclip-native issue history or explicit markdown fallback.
- CLEAR decisions should remain compact; high-risk / policy / budget / incident / strategic decisions should expand.
- OODA should appear only for domains or risk tiers that justify it.
- Live proof attempts must not promote capability claims when access is unavailable.

## Implementation Landscape

### Key Files

- `plugin-bos-light/src/decision.ts` — current `piko:decide` heuristic; today it returns only a lightweight `DecisionMetadata` record and no artifact envelope.
- `plugin-bos-light/src/contracts.ts` — defines `DecisionMetadata` and the current division vocabulary used by the plugin code (`Div7.MissionControl` here, not the older `Div7.Executive` string found in a legacy doc).
- `plugin-bos-light/src/persistence.ts` — already has `saveDecision` plus `mirrorDecisionToNativeArtifact`, but the mirror is just a flat comment and is not yet used by the decision path.
- `plugin-bos-light/src/paperclipAdapter.ts` — defines the available native seams (`createIssueDocument`, `addIssueComment`, `createApprovalRequest`, `createEscalationIssue`, `logActivity`); there is no decision-specific native surface.
- `plugin-bos-light/src/worker.ts` — already registers `piko:decide` optionally, so the worker is not the missing piece.
- `plugin-bos-light/src/blueprintArtifact.ts` — best template for selected-surface envelopes, artifact refs, markdown, and fallback diagnostics.
- `plugin-bos-light/src/evalGateEvidence.ts` — best template for validation-first, sanitized diagnostics, and markdown-only fallback when native comment mirroring is unavailable.
- `plugin-bos-light/src/circuitBreakerFlow.ts` — best template for fail-closed escalation behavior, bounded diagnostics, and a fallback path that stays visible when native issue creation fails.
- `docs/03_IMPLEMENTATION_PLAN_V1_2.md` — Phase 4 explicitly expects `piko:decide`, Cynefin classification, OODA recommendation, and decision records in issue comments/documents.
- `docs/05_PERSISTENCE_MATRIX.md` — says decision records should restore from issue comments; this reinforces the artifact-first posture.
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md` — keeps plugin registration, actions, UI, and native approvals fallback-only or unvalidated until separate proof exists.
- `docs/BOS_Light_v1_4_1_CANONICAL_ORG.md` — routes strategic ambiguity and escalation toward `Div7.MissionControl`.
- `docs/04_DATA_CONTRACTS.md` — contains a legacy `DecisionMetadata` shape that still uses `Div7.Executive`; treat as stale reference material, not the current implementation target.

### Build Order

1. Prove the pure decision logic and its fixtures first. That means explicit tests for CLEAR / COMPLICATED / COMPLEX / CHAOTIC / DISORDER handling, confidence clamping, and the compact-vs-expanded decision rules.
2. Add the decision artifact envelope and markdown rendering next, using the existing artifact modules as the shape reference. This is where `selected_surface`, `artifact_ref`, and `fallback` should appear.
3. Wire persistence and native mirroring after the envelope is stable. Reuse the existing comment/document patterns, but keep them fail-closed and bounded.
4. Add the live Paperclip readback attempt only after the deterministic artifact path is proven, because the live proof is an operational check, not the core contract.
5. Keep worker registration and docs as thin follow-ups; they should not drive the design.

### Verification Approach

- Add Vitest coverage for decision classification, risk-tier selection, and output shape in `plugin-bos-light/tests/`.
- Mirror the existing artifact test style: assert `selected_surface`, `artifact_ref`, `fallback.reason`, bounded diagnostics, and markdown content.
- Add one test per major trigger family: batch approval, policy/budget exception, gate failure, circuit-breaker OPEN / incident escalation, and strategic ambiguity.
- If live support is attempted, verify it with a mock or sandboxed adapter first, then assert readback before claiming native persistence; unavailable access should produce blocker evidence, not a success claim.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Native-visible artifact with fallback | `createProductBlueprintArtifact`, `evalGateEvidence`, `circuitBreakerFlow` | These already encode `selected_surface`, `artifact_ref`, and `fallback` consistently. |
| Sanitized diagnostics | `sanitizeDiagnosticError` and bounded error formatting in Eval Gate / circuit breaker flows | Prevents secret leakage and keeps diagnostics readable. |
| Runtime capability honesty | `runtimeCapabilities.ts` + `PAPERCLIP_RUNTIME_BOUNDARY_RULES` | Stops the milestone from claiming support that the host has not proven. |
| Deterministic in-memory proof seams | `InMemoryPaperclipAdapter` and `InMemoryBOSPersistence` | Lets tests prove behavior without pretending to be live Paperclip state. |

## Constraints

- Paperclip remains the source of truth; plugin state is cache/overlay only unless a live round-trip proves otherwise.
- Native approvals, plugin UI, tool registration, and activity logs remain unvalidated or fallback-only boundaries.
- The decision protocol must not become a governance runtime; it should stay narrow and product-facing.
- New decision artifacts should reuse current division names from the active v1.4.1 org package, not stale naming from older docs.
- Live artifact attempts must fail closed and preserve deterministic markdown evidence if native access is missing or denied.

## Common Pitfalls

- **Using `DecisionMetadata` as the entire user-visible artifact** — that loses fallback diagnostics, surface selection, and the room for OODA / rationale rendering.
- **Letting markdown fallbacks imply native approval state** — a visible comment is not a native approval object.
- **Mixing old and new division names** — `Div7.Executive` appears in a legacy contract doc, but the current codebase and org package use `Div7.MissionControl`.
- **Treating the worker registration as proof** — `piko:decide` can be registered while the artifact path is still incomplete.

## Open Risks

- The threshold between “compact” and “expanded” decision detail is still subjective and should probably be codified with fixtures before implementation.
- Live issue/document/comment readback may not be available in the current environment, so M003 must support fail-closed completion evidence.
- The current heuristic in `decision.ts` is very small; improving classification without overbuilding the protocol will likely take a few iterations.
- There is no decision-specific native artifact surface yet, so the final shape likely needs a wrapper module rather than a direct expansion of `DecisionMetadata`.

## Skills Discovered

| Technology / Need | Skill | Status |
|------------------|-------|--------|
| Artifact / envelope design | `design-an-interface` | available |
| API-like contract shaping | `api-design` | available |
| Slice sequencing and proof ordering | `decompose-into-slices` | available |
| Long-form milestone writeup | `write-docs` | available |
