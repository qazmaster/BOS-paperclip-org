---
estimated_steps: 4
estimated_files: 3
skills_used: []
---

# T01: Add registration contract harness

Expected executor skills for task-plan frontmatter: tdd, verify-before-complete.

Why: The worker uses optional chaining for tools, data providers, and actions, so missing host APIs can be silently skipped. Before live probing, add local contract coverage that records what BOS Light intends to register and proves failures stay diagnostic-only.

Do: Create a TypeScript registration probe helper around `registerBosLightPlugin(ctx)` using a recording context for `ctx.tools.register`, `ctx.data.register`, `ctx.actions.register`, and logger calls. Return attempted keys, succeeded keys, failed keys, skipped surfaces, and warnings without claiming Paperclip host support. Add Vitest coverage for the happy path, absent `ctx.tools`, thrown registration errors, seven `piko:*` tools, `betting-table` data provider, and `approve-batch` action. Do not import Paperclip internals or mutate the capability matrix.

Done when: local tests prove worker registration intent is explicit, optional surfaces expose diagnostics, and no runtime support is claimed from the local harness.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/src/worker.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/manifest.paperclip-plugin.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/tests/acceptance.test.ts`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/src/registrationProbe.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/tests/registrationProbe.test.ts`

## Verification

npm --prefix plugin-bos-light test -- registrationProbe

## Observability Impact

Adds local registration diagnostics for attempted, succeeded, failed, and skipped worker surfaces so future agents can distinguish registration intent from live host proof.
