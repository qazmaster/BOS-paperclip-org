# S01: Plugin Registration and Issue Lifecycle Hooks — UAT

**Milestone:** M009
**Written:** 2026-06-02T10:58:38.510Z

# UAT: S01 — Plugin Registration and Issue Lifecycle Hooks

## Preconditions
- BOS Light plugin source in `plugin-bos-light/` with `src/pluginRegistration.ts` and `src/issueLifecycleHooks.ts`
- Paperclip instance accessible at paperclip.oysana.com (authenticated)
- Node.js environment with dependencies installed (`npm install`)

## Steps

### 1. Verify Plugin Registration Client
**Action:** Run `cd plugin-bos-light && npx vitest run tests/pluginRegistration.test.ts`
**Expected:** All 43 tests pass covering manifest, probing, registration, status, and plugin listing

### 2. Verify Issue Lifecycle Hooks
**Action:** Run `cd plugin-bos-light && npx vitest run tests/issueLifecycleHooks.test.ts`
**Expected:** All 49 tests pass covering handler registration, dispatch, error handling, log queries, and end-to-end lifecycle

### 3. Verify Live Integration
**Action:** Run `cd plugin-bos-light && npx vitest run tests/livePluginRegistration.test.ts`
**Expected:** All 13 tests pass; instance health check returns status=ok; plugin runtime probe confirms unavailability (expected for 0.3.1); hooks fire locally

### 4. Verify Full Suite
**Action:** Run `cd plugin-bos-light && npx vitest run`
**Expected:** 723 tests pass across 42 files, zero failures

### 5. Verify TypeScript Clean
**Action:** Run `cd plugin-bos-light && npx tsc --noEmit`
**Expected:** Exit code 0, no type errors

## Edge Cases
- **Plugin runtime unavailable (current state):** Registration client returns diagnostic message without crashing
- **Hook handler throws error:** Error is captured in invocation log, does not block subsequent handlers
- **Invocation log overflow:** Bounded at maxLogSize (default 1000), oldest entries evicted
- **Unknown domain event type:** Event mapping returns null, hook manager skips dispatch gracefully

## UAT Type
- **Automated:** All steps are runnable via vitest CLI commands
- **Evidence artifact:** Full test suite output (723/723 pass) and typecheck output (exit 0)
