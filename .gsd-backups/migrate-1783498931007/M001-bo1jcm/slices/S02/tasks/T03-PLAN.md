---
estimated_steps: 5
estimated_files: 4
skills_used: []
---

# T03: Align adapter and manifest boundaries with capability statuses

Expected executor skills for task-plan frontmatter: api-design, observability, verify-before-complete.

Why: The runtime capability matrix must be reflected in the code seams that later slices will use. The draft worker currently registers tools/data/actions and calls approvals through optional chaining, while the in-memory adapter can look like real support unless its boundary is explicit.

Do: Add a lightweight runtime capability contract in `plugin-bos-light/src/runtimeCapabilities.ts` or equivalent source-level structure that mirrors the matrix keys without becoming a second source of truth for evidence. Update `plugin-bos-light/src/paperclipAdapter.ts`, `plugin-bos-light/src/persistence.ts`, and `plugin-bos-light/src/worker.ts` comments/types so the in-memory adapter is clearly test/draft-only, native approvals/requests remain Paperclip-owned, issue documents/comments are the preferred durable artifact path, plugin state is cache/overlay only, and event handling is optional behind polling/activity fallback. Update `plugin-bos-light/manifest.paperclip-plugin.json` notes to reference the capability health matrix and to distinguish requested capabilities from confirmed runtime capabilities. Do not implement BPI, Blueprint, Betting Table, Eval Gate, or Circuit Breaker feature flow in this task.

Done when: `scripts/validate_runtime_capabilities.py` confirms the manifest, matrix, and source-level adapter boundary are aligned and no code comment implies unsupported runtime success.

Failure Modes (Q5): if source-level keys drift from the matrix, validation must fail; if manifest requests are added without matrix coverage, validation must fail; if approvals are represented as plugin-owned, validation must fail. Load Profile (Q6): none beyond static file validation. Negative Tests (Q7): validator fixtures or assertions should catch missing source key, manifest drift, and forbidden support wording around events/state/approvals.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/capabilities.paperclip-runtime.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/validate_runtime_capabilities.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/paperclipAdapter.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/persistence.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/worker.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/manifest.paperclip-plugin.json`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/runtimeCapabilities.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/paperclipAdapter.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/persistence.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/worker.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/manifest.paperclip-plugin.json`

## Verification

python3 scripts/validate_runtime_capabilities.py

## Observability Impact

Makes the runtime health boundary inspectable directly from source and prevents future agents from mistaking draft in-memory adapters or optional-chained SDK calls for proven Paperclip support.
