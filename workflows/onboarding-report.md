# Onboarding Report — BOS Chimera Paperclip Handoff

## Summary

A new contributor can read the docs and run the test suite, but the validation command fails out of the box due to a stale manifest, and TypeScript checking has pre-existing errors. The README provides a clear conceptual path but the "validation before handoff" step is broken.

## Prerequisites

- [✓] Node.js — Not explicitly pinned (no `.nvmrc`, `.tool-versions`, or `engines` in package.json). Current env: v25.9.0. Works.
- [✓] npm — Used for package management. Current env: 11.12.1. Works.
- [✓] Python 3 — README uses `python3`. Current env: 3.12.3. Works.
- [?] TypeScript — Listed in `plugin-bos-light/package.json` devDependencies but README doesn't mention running `tsc`.

## Steps

1. [✗] `python3 scripts/validate_handoff.py` — **FAILS**. Exits non-zero with 16 stale manifest errors. `MANIFEST.md` is out of date — file sizes and SHA256 hashes don't match actual files. The validator reports mismatches for `00_START_HERE_FOR_NEW_AI_AGENT.md`, all 7 `agents/*/AGENTS.md` files, and `plugin-bos-light/src/contracts.ts`.

2. [✓] `cd plugin-bos-light && npx vitest run` — **PASSES**. 63 test files, 1424 tests, all green. (README claims "1250 tests, 52 files" — stale count.)

3. [✗] `cd plugin-bos-light && npx tsc --noEmit` — **FAILS**. Pre-existing errors in `agentIntegration.test.ts`, `distWorkerTools.test.ts`, `e2eWorkflow.test.ts`, `routingIntegration.test.ts` (implicit `any` types, missing declaration for `../dist/worker.js`). Two minor type errors in new backfill tests (`metadataMirror.test.ts`, `persistence.test.ts`).

4. [?] `npm install` — Not explicitly documented in README. Runs fine when executed.

## Gaps

1. **Stale `MANIFEST.md`**: The validation command (`validate_handoff.py`) is the first thing the README tells you to run, and it fails immediately. This is the most impactful gap — it blocks the documented handoff verification flow.

2. **No version pinning**: No `.nvmrc`, `.tool-versions`, `engines` field, or `Dockerfile` to tell contributors which Node/npm/Python versions are expected. Works today on Node 25 + Python 3.12 but could break on different versions.

3. **Stale test count in docs**: `00_START_HERE_FOR_NEW_AI_AGENT.md` and `HANDOFF_M008_COMPLETE.md` claim "1250 tests, 52 files" but actual is 1424 tests, 63 files.

4. **TypeScript errors in test files**: `tsc --noEmit` fails on pre-existing test files (not just new backfill tests). The README documents this as a verification step but it doesn't pass clean.

5. **Missing `npm install` step**: Neither README nor `00_START_HERE_FOR_NEW_AI_AGENT.md` tells you to run `npm install` before running tests. A new clone would fail on `npx vitest run` without it.

6. **No `dist/` directory in repo**: Tests that import `../dist/worker.js` fail TypeScript checking because the dist artifacts aren't committed. No build step is documented.

## Recommendations

1. **Regenerate `MANIFEST.md`**: Run whatever script produces it (or manually update hashes/sizes) so `validate_handoff.py` passes. This is the single highest-impact fix — it restores the documented handoff verification flow.

2. **Add install + build steps to README**: Add a "Getting Started" section:
   ```bash
   npm install
   cd plugin-bos-light && npm install
   npx vitest run
   ```

3. **Add `.nvmrc`**: Pin to `22` (or whatever version is canonical) so contributors don't guess.

4. **Update test counts**: Change "1250 tests, 52 files" to "1424 tests, 63 files" in `00_START_HERE_FOR_NEW_AI_AGENT.md` and handoff docs.

5. **Fix or suppress pre-existing `tsc` errors**: Either fix the implicit `any` types in test files, add `// @ts-expect-error` comments, or exclude test files from the tsconfig. Otherwise remove `tsc --noEmit` from the documented verification steps.
