---
id: T04
parent: S05
milestone: M005
key_files:
  - plugin-bos-light/src/externalIO.ts
  - plugin-bos-light/tests/externalIO.test.ts
key_decisions:
  - Used child_process spawn for gh CLI (consistent with gitOperations.ts pattern)
  - Used native https module for HTTP fallback to avoid extra dependencies
  - Gateway.init() performs capability discovery at runtime rather than constructor time to allow test control over env
duration: 
verification_result: passed
completed_at: 2026-05-31T23:10:57.215Z
blocker_discovered: false
---

# T04: Created ExternalIOGateway TypeScript module with gh CLI primary adapter, GitHub HTTP fallback adapter, token detection, and clean blocker on missing auth

**Created ExternalIOGateway TypeScript module with gh CLI primary adapter, GitHub HTTP fallback adapter, token detection, and clean blocker on missing auth**

## What Happened

Implemented plugin-bos-light/src/externalIO.ts with: (1) ExternalIOGateway class that auto-detects gh CLI availability and falls back to native HTTPS GitHub API; (2) GhCliAdapter implementing PR create, PR merge (squash/merge/rebase), PR approve, workflow trigger, and workflow run watch with structured JSON output parsing; (3) GitHubHttpAdapter implementing the same operations via api.github.com REST API using Node.js https module; (4) hasGitHubToken() env check and discoverGhBinary() async probe; (5) redaction of secrets in all diagnostics; (6) missing GITHUB_TOKEN produces clean auth_failure blocker evidence with zero side effects; (7) missing gh binary transparently falls back to HTTP adapter. Created 28 vitest tests covering secret redaction, token detection, gh binary discovery (success/fail/missing), GhCliAdapter PR create/merge/approve/workflow operations with success and auth failure paths, GitHubHttpAdapter PR create/merge/approve/workflow operations with success and 401 paths, ExternalIOGateway init with token+gh, token+no-gh, and no-token scenarios, and all five operations returning clean blockers when token is missing. All tests pass.

## Verification

Unit tests pass: cd plugin-bos-light && npx vitest run tests/externalIO.test.ts (28/28 passed)

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd plugin-bos-light && npx vitest run tests/externalIO.test.ts` | 0 | ✅ pass | 684ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/src/externalIO.ts`
- `plugin-bos-light/tests/externalIO.test.ts`
