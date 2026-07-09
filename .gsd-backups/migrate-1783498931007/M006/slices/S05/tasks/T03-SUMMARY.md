---
id: T03
parent: S05
milestone: M006
key_files:
  - plugin-bos-light/tests/div6ExternalGateway.test.ts
key_decisions:
  - Kept the existing 30-test foundation rather than rewriting, extending only the missing coverage to avoid discarding already-valid test work.
  - Fixed the async caller-auth test bug instead of leaving a false-positive test.
duration: 
verification_result: passed
completed_at: 2026-06-01T09:05:24.381Z
blocker_discovered: false
---

# T03: Fixed async bug in caller-auth test and added 6 missing gateway-level git execution tests (ENOENT + auth failure for clone/fetch, redacted diagnostics) bringing div6ExternalGateway.test.ts to 36 exhaustive tests

**Fixed async bug in caller-auth test and added 6 missing gateway-level git execution tests (ENOENT + auth failure for clone/fetch, redacted diagnostics) bringing div6ExternalGateway.test.ts to 36 exhaustive tests**

## What Happened

The existing div6ExternalGateway.test.ts already had 30 tests covering most of the task plan. I identified and fixed a latent async bug in the caller-authorization test: the original code used `.then()` inside a `for` loop without returning promises, so vitest would not wait for assertions. I converted it to `async/await` inside the loop.

I then added a `describe("git execution via gateway")` block with six new tests to close the remaining gaps against the task plan:
1. ENOENT/missing binary for ls-remote through the gateway
2. ENOENT/missing binary for clone through the gateway
3. ENOENT/missing binary for fetch through the gateway
4. Auth failure for clone through the gateway
5. Auth failure for fetch through the gateway
6. Explicit presence check for `redacted_diagnostics` in every evidence envelope

All 36 div6ExternalGateway tests pass, and the full plugin-bos-light suite of 427 tests remains green.

## Verification

Ran npx vitest run tests/div6ExternalGateway.test.ts (36 tests passed) and npx vitest run full suite (427 tests passed). No regressions.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd plugin-bos-light && npx vitest run tests/div6ExternalGateway.test.ts` | 0 | ✅ pass | 438ms |
| 2 | `cd plugin-bos-light && npx vitest run` | 0 | ✅ pass | 2150ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/tests/div6ExternalGateway.test.ts`
