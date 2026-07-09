---
estimated_steps: 11
estimated_files: 3
skills_used: []
---

# T01: Wire batch and eval gate decisions

Skills expected for executor task plan frontmatter: api-design, tdd, verify-before-complete.

Why: S03 must start by proving the shared major-flow adapter can consume already-shipped S01 and S02 contracts without inventing a new governance runtime. Batch approval is the compact CLEAR path; blocking Eval Gate failure is the first expanded risk record needed by R009.

Do:
1. Add a new `plugin-bos-light/src/majorFlowDecision.ts` module with a small discriminated input contract and a `persistMajorFlowDecisionArtifact` helper that calls `decide` and then `persistDecisionArtifact`.
2. Keep options aligned with S02: accept `adapter`, `persistence`, `capabilities`, and `now`, and pass them through without adding plugin UI, action registration, native approval creation, Hermes, GSD-Pi, activity-event, or host-registration behavior.
3. Implement the `batch_approval` variant from existing Betting Table/approval request seam data: cycle id, selected issue ids, optional BPI or approval request ref, and reason. Its signals must produce a CLEAR, LOW-risk, compact `BATCH_APPROVAL` decision when confidence is high.
4. Implement the `eval_gate_failure` variant from an existing `EvalGateResult` or `EvalGateEvidenceEnvelope`: blocking failures and incomplete gate runs must produce an expanded, non-LOW decision record with visible gate ids, overall result, run id, and guidance in the decision artifact markdown.
5. Add `plugin-bos-light/tests/majorFlowDecision.test.ts` with real assertions for batch and Eval Gate cases using deterministic timestamps, `InMemoryPaperclipAdapter`, and `InMemoryBOSPersistence`.
6. Assert that the batch path creates a decision artifact but never calls `createApprovalRequest`, never changes Betting Table row native approval ids/statuses, and still uses Paperclip documents or comments only as artifact surfaces.
7. Assert that the Eval Gate path advances R009 by producing an accepted Div7.MissionControl artifact whose decision metadata is expanded, diagnostics are sanitized, and selected surface/fallback fields are inspectable.

Done when: `persistMajorFlowDecisionArtifact` exists, the batch and Eval Gate variants are fixture-tested through the S02 artifact envelope, and the targeted test proves no approval-state mutation.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/decision.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/decisionArtifact.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/bettingTable.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/evalGateEvidence.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/contracts.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/tests/decision.test.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/tests/decisionArtifact.test.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/tests/evalGateEvidence.test.ts`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/majorFlowDecision.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/tests/majorFlowDecision.test.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/contracts.ts`

## Verification

npm --prefix plugin-bos-light test -- tests/majorFlowDecision.test.ts

## Observability Impact

Adds a single fixture-inspectable major-flow decision envelope with `selected_surface`, `artifact_ref`, `fallback`, `cache_overlay`, `decision.diagnostics`, and S02 invariants preserved for batch and Eval Gate decisions.
