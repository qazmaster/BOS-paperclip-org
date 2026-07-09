---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T02: Create hybrid persistence TypeScript module with tests

Why: Fast in-memory cache must automatically mirror to durable Paperclip native artifacts (issue documents/comments) so state survives plugin restart without depending on unvalidated Paperclip state APIs. Do: Create `HybridBOSPersistence` class implementing `BOSPersistence` in `hybridPersistence.ts`. Wrap `InMemoryBOSPersistence`. After every `save*` call, auto-mirror to Paperclip via the adapter: `createIssueDocument` for structured data (BPI, betting table, circuit breaker) and `addIssueComment` for human-visible summaries. Track artifact refs and diagnostics. Gracefully degrade to in-memory-only when the adapter throws. Create `hybridPersistence.test.ts` covering mirror success, adapter failure fallback, artifact ref tracking, and zero secret leakage. Done when: unit tests pass.

## Inputs

- `plugin-bos-light/src/persistence.ts`
- `plugin-bos-light/src/paperclipAdapter.ts`
- `plugin-bos-light/src/contracts.ts`

## Expected Output

- `plugin-bos-light/src/hybridPersistence.ts`
- `plugin-bos-light/tests/hybridPersistence.test.ts`

## Verification

cd plugin-bos-light && npx vitest run tests/hybridPersistence.test.ts
