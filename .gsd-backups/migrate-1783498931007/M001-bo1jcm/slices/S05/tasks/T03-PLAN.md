---
estimated_steps: 18
estimated_files: 2
skills_used: []
---

# T03: Wire Worker Tools and Acceptance Flow

---
estimated_steps: 6
estimated_files: 3
skills_used:
  - tdd
  - observability
  - api-design
---
Why: S05 needs executor-usable entrypoints and an acceptance path, not only standalone helpers. Worker wiring should remain optional and adapter-driven because Paperclip tool registration is still unvalidated.

Do: Register optional worker tools such as `piko:eval-gate-evidence` and `piko:circuit-breaker-observe` that delegate to the T01 and T02 helpers. Keep existing `piko:eval-gate` pure tool intact. Each new tool should return `adapter_unavailable` or markdown-only diagnostics rather than throwing or claiming native Paperclip support when `ctx.paperclipAdapter`, `ctx.paperclip`, or `ctx.persistence` is absent. Extend `BOS_LIGHT_TOOLS` with the orchestration helpers. Extend acceptance tests to exercise A6 to A10 fixture behavior: gate pass/fail evidence mirrored to the in-memory adapter, repeated failures opening the breaker, escalation issue or fallback comment evidence, HALF_OPEN retry returning to CLOSED, and active-runs-only polling fallback metadata.

Failure Modes Q5:
| Dependency | On error | On timeout | On malformed response |
|------------|----------|------------|------------------------|
| ctx.tools.register | Optional chaining should skip without runtime support claim | Same as skipped registration | Same as skipped registration |
| ctx adapter or persistence | Return diagnostics or markdown-only fallback | Return diagnostics | Return diagnostics |

Load Profile Q6: worker calls are per explicit tool invocation and must not introduce an unbounded background poller. At 10x load, the adapter comment/issue surfaces are the expected bottleneck, not local pure evaluation.

Negative Tests Q7: cover missing adapter context, missing persistence, malformed tool params, and no registration support on ctx.

Done when: acceptance tests prove the new orchestration helpers are reachable through worker tool registration and that S05 can demonstrate A6 to A10 behavior at fixture integration level without live event claims.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/evalGateEvidence.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/circuitBreakerFlow.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/worker.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/paperclipAdapter.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/persistence.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/acceptance.test.ts`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/worker.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/acceptance.test.ts`

## Verification

npm --prefix plugin-bos-light test -- acceptance.test.ts

## Observability Impact

Makes gate and circuit evidence available through explicit worker tool results with adapter availability diagnostics, instead of requiring a future agent to infer state from in-memory maps.
