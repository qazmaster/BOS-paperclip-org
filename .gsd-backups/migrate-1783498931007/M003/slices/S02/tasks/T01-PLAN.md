---
estimated_steps: 9
estimated_files: 4
skills_used: []
---

# T01: Add the decision artifact envelope contract and native-first helper

Expected executor skills/frontmatter: skills_used: api-design, tdd, verify-before-complete.

Why: S01 now returns a stable accepted/rejected DecisionResult with deterministic record_markdown, but S02 still needs the persistence envelope promised by the sketch. This task creates the narrow adapter-facing contract that future S03 flows can call without inventing governance state or approval behavior.

Do:
1. Add `plugin-bos-light/src/decisionArtifact.ts` with a pure async helper, tentatively named `persistDecisionArtifact`, that accepts a `DecisionResult`, optional `Pick<PaperclipAdapter, "createIssueDocument" | "addIssueComment">`, optional `Pick<BOSPersistence, "saveDecision">`, optional document/comment capability postures aligned with `blueprintArtifact.ts`, and optional `now`.
2. Define/export the envelope types either in `decisionArtifact.ts` or `contracts.ts`: `DecisionArtifactSurface = "documents.native" | "comments.native" | "markdown-only"`, cache-overlay diagnostics, fallback diagnostics, and `DecisionArtifactEnvelope` with schema version, phase `S02.decision_artifact`, issue id, decision id when accepted, selected surface, artifact id/ref, decided/mirrored timestamps, markdown, cache overlay, fallback diagnostics, the DecisionResult, and explicit invariants including `decided_by: "Div7.MissionControl"`, `diagnostics_sanitized: true`, and `native_approval_mutated: false`.
3. Reuse S01 `decision.record_markdown` for accepted decisions. For rejected decisions, create deterministic markdown that records only sanitized validation diagnostics and returns `selected_surface: "markdown-only"` without calling adapter or persistence.
4. For accepted decisions, attempt `persistence.saveDecision(decision)` as cache-overlay only, then prefer `documents.native` when capability is `confirmed` or explicit local `enabled` and `createIssueDocument` exists. If not usable, try `comments.native` when comment support is not explicitly unsupported/failed and `addIssueComment` exists. Otherwise produce deterministic `markdown-only://issues/{issue_id}/decisions/{decision_id}`.
5. Add initial unit coverage in `plugin-bos-light/tests/decisionArtifact.test.ts` for accepted CLEAR document success, COMPLICATED comment fallback when documents are unvalidated, invalid DecisionValidationFailure markdown-only behavior, and the invariant that the helper never calls or mutates `createApprovalRequest`/approval state.

Done when: the helper returns surface-qualified refs (`paperclip://issues/{issue}/documents/{id}`, `paperclip://issues/{issue}/comments/{id}`, or `markdown-only://issues/{issue}/decisions/{decision_id}`), cache overlay status is inspectable, accepted artifacts preserve the exact decision markdown, rejected artifacts remain fail-closed, and the targeted decision artifact tests pass.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/contracts.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/decision.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/blueprintArtifact.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/evalGateEvidence.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/paperclipAdapter.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/persistence.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/tests/decision.test.ts`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/decisionArtifact.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/tests/decisionArtifact.test.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/contracts.ts`

## Verification

npm --prefix plugin-bos-light test -- tests/decisionArtifact.test.ts

## Observability Impact

Introduces the S02 inspection envelope fields future agents need: selected_surface, artifact_ref, cache_overlay save status, fallback reason/error fields, diagnostics_sanitized, and native_approval_mutated=false.
