---
estimated_steps: 7
estimated_files: 6
skills_used: []
---

# T01: Compose fixture demo flow

Task plan metadata: estimated_steps: 8; estimated_files: 3; skills_used: [tdd, verify-before-complete].

Why: S06 needs one A3-A10 composition path rather than isolated acceptance tests. This task creates a typed integrated fixture demo that drives the real plugin orchestration seams with deterministic seed data and asserts the report shape.

Do: Add plugin-bos-light/src/integratedDemo.ts with a runA1ToA10FixtureDemo helper that accepts seed issue data or loads normalized fixture inputs, injects InMemoryBOSPersistence plus fixture PaperclipAdapter behavior, calls runSeededIssueBlueprintFlow for representative issues, builds and loads a Betting Table cycle, requests approval through the adapter seam, records Eval Gate evidence, opens and recovers Circuit Breaker evidence, and returns a report keyed by A3 through A10 with selected surfaces, artifact refs, cache-overlay diagnostics, fallback/runtime-gap posture, and timestamps. Export the helper from plugin-bos-light/src/index.ts. Add plugin-bos-light/tests/integratedDemo.test.ts covering the happy fixture flow plus no-overclaim behavior.

Failure Modes Q5: If adapter calls fail, the report must keep fallback diagnostics and never mark native support confirmed. If persistence load/save fails, the cache-overlay diagnostic must be visible and durable truth must remain the Paperclip-visible or markdown fallback artifact. If seed rows are malformed, the helper should reject or return explicit validation errors rather than producing partial success.

Load Profile Q6: Per run uses five seed issues and in-memory state; 10x seed size should stay bounded in process memory and avoid network or long-lived workers. No shared runtime resource beyond local CPU/filesystem test execution.

Negative Tests Q7: Cover malformed/empty issue candidates, approval adapter unavailable or malformed native response, and Circuit Breaker failure threshold/recovery semantics in the integrated report.

Done when: The integrated Vitest file proves the single fixture helper exercises A3-A10 together, preserves opaque blueprint_id values, includes explicit fallback/runtime-gap fields, and does not read .gsd or any gitignored planning paths.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/demo-seed-issues.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/issueBlueprintFlow.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/bettingTable.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/evalGateEvidence.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/circuitBreakerFlow.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/persistence.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/paperclipAdapter.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/index.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/acceptance.test.ts`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/integratedDemo.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/index.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/integratedDemo.test.ts`

## Verification

npm --prefix plugin-bos-light test -- integratedDemo.test.ts

## Observability Impact

Adds a per-step demo report with selected surfaces, artifact refs, cache-overlay states, transition details, fallback reasons, and timestamps so failed composition can be localized by phase.
