---
estimated_steps: 20
estimated_files: 5
skills_used: []
---

# T02: Orchestrate Circuit Breaker Observations

---
estimated_steps: 8
estimated_files: 4
skills_used:
  - tdd
  - error-handling-patterns
  - observability
---
Why: R010 requires repeated failure detection, OPEN escalation, HALF_OPEN retry, and CLOSED recovery behavior to be visible without relying on unvalidated terminal run events. The existing circuit breaker module is a pure state machine but has no orchestration, persistence, escalation, or fallback evidence path.

Do: Add a `circuitBreakerFlow` helper that consumes an observation for an issue/run, loads an existing record from optional persistence or creates one, applies `recordFailure`, `recordSuccess`, or `moveToHalfOpen` as appropriate, saves the record as cache overlay, and returns an evidence envelope with previous state, next state, attempt count, polling config, transition reason, cache overlay diagnostics, escalation reference, and fallback diagnostics. When the next state is OPEN and no escalation issue is already attached, attempt `adapter.createEscalationIssue`; if that fails or is missing, attempt `adapter.addIssueComment`; if that fails too, return markdown-only escalation instructions. Activity logging may be attempted as observability but must never be the sole durable evidence path. Export the helper from `src/index.ts`.

Failure Modes Q5:
| Dependency | On error | On timeout | On malformed response |
|------------|----------|------------|------------------------|
| Persistence get or save | Continue from new/current record and report cache_overlay failed or missing | Same as error | Treat as missing cache overlay |
| createEscalationIssue | Fall back to issue comment escalation | Fall back to issue comment escalation | Fall back to issue comment escalation |
| addIssueComment | Return markdown-only escalation diagnostics | Return markdown-only escalation diagnostics | Return markdown-only escalation diagnostics |
| logActivity | Record activity fallback failure but keep issue/comment evidence path | Same as error | Ignore malformed activity result |

Load Profile Q6: one get, one save, optional one issue create, optional one comment, optional one activity log per observation. At 10x load, issue/comment API rate limiting and duplicate escalation creation are the likely breakpoints; the helper should avoid duplicate escalations when a record already has `escalation_issue_id`.

Negative Tests Q7: cover empty issue ids, repeated failures opening exactly at threshold, no duplicate escalation on already open records, issue creation failure falling back to comments, all adapter paths failing to markdown-only, HALF_OPEN transition from OPEN, HALF_OPEN success returning to CLOSED, and success from CLOSED remaining CLOSED.

Done when: tests prove CLOSED, HALF_OPEN, and OPEN transitions, escalation issue attachment or fallback comment, active-runs-only polling config exposure, and safe cache-overlay failure diagnostics.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/circuitBreaker.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/paperclipAdapter.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/persistence.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/contracts.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/index.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/circuitBreaker.test.ts`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/circuitBreakerFlow.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/index.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/circuitBreakerFlow.test.ts`

## Verification

npm --prefix plugin-bos-light test -- circuitBreakerFlow.test.ts

## Observability Impact

Adds circuit transition envelopes that expose previous state, next state, attempt count, failure reason, opened timestamp, escalation reference, polling config, and fallback diagnostics.
