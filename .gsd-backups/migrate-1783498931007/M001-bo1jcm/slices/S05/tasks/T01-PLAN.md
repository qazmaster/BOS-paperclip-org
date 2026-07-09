---
estimated_steps: 18
estimated_files: 5
skills_used: []
---

# T01: Persist and Mirror Eval Gate Evidence

---
estimated_steps: 7
estimated_files: 4
skills_used:
  - tdd
  - error-handling-patterns
  - observability
---
Why: R009 needs Eval Gate pass, warning, blocking fail, and incomplete guidance to become Paperclip-visible evidence instead of a pure return value. Existing `runEvalGates` is deterministic and should stay pure, so this task creates a composition seam around it.

Do: Add an `evalGateEvidence` helper that accepts the existing `EvalGateInput`, optional persistence, optional Paperclip adapter, and an optional `now`. It should run `runEvalGates`, attempt `persistence.saveGateResult` as cache-overlay only, attempt to mirror the gate result through `mirrorGateResultToNativeArtifact` or equivalent comment markdown when an adapter is present, and return an explicit evidence envelope containing the gate result, selected surface (`comments.native` or `markdown-only`), a stable artifact reference, cache overlay diagnostics, fallback reason/error fields, and sanitized bounded error messages. Do not promote comment/document capabilities from caller input; use the adapter only as an injected seam. Export the helper from `src/index.ts`.

Failure Modes Q5:
| Dependency | On error | On timeout | On malformed response |
|------------|----------|------------|------------------------|
| BOSPersistence.saveGateResult | Return cache_overlay save failed diagnostics and continue mirroring | Same as error, with bounded message | Treat as failed cache overlay only |
| PaperclipAdapter.addIssueComment | Return markdown-only fallback with comment error diagnostics | Same as error, with bounded message | Return markdown-only fallback |

Load Profile Q6: one gate evaluation, at most one cache write, and at most one comment write per issue/run. At 10x load the first breakpoint is native comment/activity rate limiting, so this task should keep the helper single-write and side-effect bounded.

Negative Tests Q7: cover missing adapter, persistence failure, comment write failure, empty issue id or missing required gate fields, blocking failure guidance, and budget warning non-blocking guidance.

Done when: the new tests prove gate pass/fail guidance is persisted as cache overlay when possible, mirrored as a comment when possible, downgraded to markdown-only when needed, and all diagnostics preserve Paperclip as source of truth.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/evalGates.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/persistence.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/paperclipAdapter.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/contracts.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/index.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/blueprintArtifact.test.ts`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/evalGateEvidence.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/index.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/evalGateEvidence.test.ts`

## Verification

npm --prefix plugin-bos-light test -- evalGateEvidence.test.ts

## Observability Impact

Introduces gate evidence envelopes with selected surface, artifact reference, cache overlay save status, fallback reason, sanitized error, and evaluated timestamp so future agents can distinguish failed gates from failed mirroring.
