---
estimated_steps: 6
estimated_files: 8
skills_used: []
---

# T04: Align docs and runtime capability guardrails

Expected executor skills: write-docs, verify-before-complete.

Why: S04 changes contracts and worker behavior that must be documented without promoting unvalidated Paperclip approval, data-provider, dashboard, or state surfaces.

Do: Update `docs/04_DATA_CONTRACTS.md` with cycle and approval request envelope details. Update `docs/05_PERSISTENCE_MATRIX.md` to mark Betting Table persistence as cache-overlay-only and approval truth as Paperclip-owned native request/comment/markdown fallback. Update `docs/06_ACCEPTANCE_TESTS.md` with new proofs and negative cases. Update `docs/08_RUNTIME_CAPABILITY_HEALTH.md` to keep approvals/data/UI/entities/state unvalidated/fallback-only unless live evidence exists. Update `docs/09_BACKLOG.md` with S06/live-runtime follow-ups for dashboard hydration, native approval proof, and fallback-rate observability.

Done when closeout verification passes and docs describe fixture-level proof only.

Failure Modes (Q5): docs/capability drift, accidental live runtime claim, omitted fallback paths.
Negative Tests (Q7): validator catches promoted unproven capabilities; tests cover fallback/error paths before docs claim them.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/04_DATA_CONTRACTS.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/05_PERSISTENCE_MATRIX.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/06_ACCEPTANCE_TESTS.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/09_BACKLOG.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/capabilities.paperclip-runtime.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/validate_runtime_capabilities.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/runtimeCapabilities.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/bettingTable.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/worker.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/acceptance.test.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/package.json`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/04_DATA_CONTRACTS.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/05_PERSISTENCE_MATRIX.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/06_ACCEPTANCE_TESTS.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/09_BACKLOG.md`

## Verification

npm --prefix plugin-bos-light test && npm --prefix plugin-bos-light run typecheck && python3 scripts/validate_runtime_capabilities.py

## Observability Impact

Documents the runtime inspection surfaces and fallback diagnostics future agents should use before claiming native approval/dashboard support.
