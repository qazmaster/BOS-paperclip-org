---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T03: Create state reconstruction TypeScript module with tests

Why: On plugin restart, BOS state (betting table, gate results, circuit breaker) must rebuild from Paperclip native artifacts when company-scoped plugin state is unavailable. Do: Create `reconstructStateFromArtifacts(adapter, issueId)` in `stateReconstruction.ts` that scrapes issue documents and comments for structured BOS data. Validate parsed payloads against `contracts.ts` types. Return a reconstruction envelope listing what was found, what was missing, and whether fallback was used. Handle markdown-only fallbacks gracefully with best-effort parsing. Create `stateReconstruction.test.ts` using `InMemoryPaperclipAdapter` to simulate pre-seeded artifacts and verify round-trip recovery. Done when: unit tests pass.

## Inputs

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/paperclipAdapter.ts`
- `plugin-bos-light/src/persistence.ts`

## Expected Output

- `plugin-bos-light/src/stateReconstruction.ts`
- `plugin-bos-light/tests/stateReconstruction.test.ts`

## Verification

cd plugin-bos-light && npx vitest run tests/stateReconstruction.test.ts
