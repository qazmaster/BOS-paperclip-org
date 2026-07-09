---
estimated_steps: 10
estimated_files: 5
skills_used: []
---

# T03: Document and export major flow integration

Skills expected for executor task plan frontmatter: write-docs, verify-before-complete.

Why: S03 is product-flow integration, not live Paperclip proof. The public docs and exports must make the new helper discoverable while preserving the S01/S02/S04 boundary: artifacts are visible records, cache is diagnostic, native approvals are untouched, and live readback remains S04.

Do:
1. Export the new major-flow decision helper and types from `plugin-bos-light/src/index.ts`.
2. Update `docs/04_DATA_CONTRACTS.md` with the S03 `persistMajorFlowDecisionArtifact` contract, input variants, relationship to S01 `DecisionResult` and S02 `DecisionArtifactEnvelope`, and the requirement impact for R003, R008, R009, R010, and R015.
3. Update `docs/08_RUNTIME_CAPABILITY_HEALTH.md` to state S03 is fixture/integration proof only over documents, comments, and deterministic markdown fallback. Explicitly avoid claims for plugin UI, actions, host piko registration, native approvals, Hermes, GSD-Pi, activity logs, events, or live readback.
4. If runtime capability validation docs/scripts already enumerate S02/S03 decision surfaces, keep wording consistent with confirmed document/comment surfaces and fallback-only unvalidated plugin/runtime surfaces; only update validators if the new documentation requires it.
5. Run targeted and regression verification: major-flow test, decision artifact test, Eval Gate evidence test, Circuit Breaker flow test, typecheck, full plugin suite, and runtime capability validator.
6. Summarize any remaining S04 handoff notes in docs: live readback, fail-closed blocker evidence, and no approval substitution.

Done when: the helper is exported, documentation captures the artifact-first integration boundary, no unsupported runtime surface is promoted, and closeout commands pass.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/majorFlowDecision.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/tests/majorFlowDecision.test.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/index.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/docs/04_DATA_CONTRACTS.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/scripts/validate_runtime_capabilities.py`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/index.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/docs/04_DATA_CONTRACTS.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/scripts/validate_runtime_capabilities.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/tests/majorFlowDecision.test.ts`

## Verification

npm --prefix plugin-bos-light test -- tests/majorFlowDecision.test.ts tests/decisionArtifact.test.ts tests/evalGateEvidence.test.ts tests/circuitBreakerFlow.test.ts
npm --prefix plugin-bos-light run typecheck
npm --prefix plugin-bos-light test
python3 scripts/validate_runtime_capabilities.py

## Observability Impact

Documents the inspection path for major-flow decisions and preserves the health-report distinction between fixture-level decision artifacts and unvalidated live/plugin/runtime surfaces.
