---
id: T04
parent: S04
milestone: M006
key_files:
  - plugin-bos-light/src/gitOperations.ts
  - plugin-bos-light/src/externalIO.ts
  - plugin-bos-light/tests/gitOperations.test.ts
  - plugin-bos-light/tests/externalIO.test.ts
key_decisions:
  - Resolved SecretRef at adapter boundary (construction/init time) and passed resolved string to internal helpers to keep core logic agnostic of SecretRef shape
  - Updated ExternalIOGateway.preferredAdapter to check both hasGitHubToken() and secretRef presence to avoid reporting 'none' when a scoped SecretRef is in use
  - Used auth_failure error_category with secret_unavailable blocker code in redacted_diagnostics for consistent failure signaling across git and external IO paths
duration: 
verification_result: passed
completed_at: 2026-06-01T08:33:45.842Z
blocker_discovered: false
---

# T04: Wired SecretRef into gitOperations and externalIO adapters with fail-closed secret resolution, redacted auth_failure diagnostics, and backward-compatible process.env fallback

**Wired SecretRef into gitOperations and externalIO adapters with fail-closed secret resolution, redacted auth_failure diagnostics, and backward-compatible process.env fallback**

## What Happened

Modified gitOperations.ts to accept optional SecretRef in DefaultGitOperations constructor, threaded it through all GitOperations methods, and updated runGit to resolve the secret via secretResolver.ts before execution. If resolution fails, runGit returns auth_failure evidence with secret_unavailable blocker code and redacted diagnostics. Updated buildAuthEnv to accept an optional resolvedToken parameter so resolved secrets inject into git auth env without mutating process.env.

Modified externalIO.ts to accept optional SecretRef in GitHubHttpAdapter (resolved at construction) and ExternalIOGateway (resolved at init time). Updated runGh and GhCliAdapter to support optional token injection into spawn env. GitHubHttpAdapter returns immediate auth_failure evidence when SecretRef is unavailable. ExternalIOGateway.preferredAdapter was updated to account for SecretRef presence so adapter selection reports correctly even when process.env.GITHUB_TOKEN is absent.

Added 8 new tests covering resolved-token injection, unavailable-secret auth_failure paths, and backward-compatible process.env fallback. All 383 tests pass and TypeScript typecheck is clean.

## Verification

Ran full test suite (383 tests passing) and TypeScript typecheck. Existing gitOperations and externalIO tests pass unchanged. New SecretRef-specific tests verify resolved token injection into git env, HTTP adapter Authorization headers, unavailable-secret early auth_failure, and gateway adapter selection with SecretRef.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npx vitest run tests/gitOperations.test.ts tests/externalIO.test.ts` | 0 | ✅ pass | 427ms |
| 2 | `npx vitest run && npx tsc --noEmit` | 0 | ✅ pass | 2100ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/src/gitOperations.ts`
- `plugin-bos-light/src/externalIO.ts`
- `plugin-bos-light/tests/gitOperations.test.ts`
- `plugin-bos-light/tests/externalIO.test.ts`
