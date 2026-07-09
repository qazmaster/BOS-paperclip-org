---
estimated_steps: 5
estimated_files: 5
skills_used: []
---

# T03: Document artifact fallback contract

Expected executor skills (record in task plan frontmatter if supported): write-docs, api-design, verify-before-complete.

Why: S03 changes the durable artifact contract that later slices consume, so docs must describe exactly what is proven locally, what remains unvalidated at runtime, and how S04 should use `blueprint_id` without treating plugin state as durable truth.

Do: Update data contract, persistence matrix, acceptance, runtime health, and backlog docs to describe the S03 artifact envelope, native document preference, comment/markdown fallback behavior, cache-overlay persistence, and absence of live runtime proof. Keep wording aligned with S02: `documents.native`, `comments.native`, and `state.issue_scoped` remain unvalidated/fallback-only unless live Paperclip version/build evidence exists. Add or update acceptance notes for the seeded issue proof and downstream handoff to S04. Do not modify the capability matrix to `confirmed`.

Failure Modes (Q5): Docs must not imply local in-memory adapter writes are real host support; stale docs would cause S04 to build on unsupported approval/document assumptions. Negative Tests (Q7): runtime capability validator should continue rejecting unproven confirmed/native claims.

Done when: Docs explain how to inspect the artifact reference and fallback posture, runtime capability validation still passes, and S04 has a clear contract for consuming `blueprint_id` without approval/request scope bleed.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/blueprintArtifact.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/issueBlueprintFlow.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/capabilities.paperclip-runtime.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/04_DATA_CONTRACTS.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/05_PERSISTENCE_MATRIX.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/06_ACCEPTANCE_TESTS.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/09_BACKLOG.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/validate_runtime_capabilities.py`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/04_DATA_CONTRACTS.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/05_PERSISTENCE_MATRIX.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/06_ACCEPTANCE_TESTS.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/09_BACKLOG.md`

## Verification

python3 scripts/validate_runtime_capabilities.py

## Observability Impact

Documents the inspection surfaces and fallback diagnostics a future agent should use when a blueprint artifact is missing or only markdown-backed.
