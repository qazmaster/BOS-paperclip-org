---
id: T02
parent: S07
milestone: M006
key_files:
  - plugin-bos-light/src/div6ExternalGateway.ts
key_decisions:
  - D039
duration: 
verification_result: passed
completed_at: 2026-06-01T10:05:06.306Z
blocker_discovered: false
---

# T02: Extended Div6 to persist local_path in ExternalGitEvidence for clone operations and explicit localPath

**Extended Div6 to persist local_path in ExternalGitEvidence for clone operations and explicit localPath**

## What Happened

Updated the evidence assembly in div6ExternalGateway.ts so that `local_path` is written into `ExternalGitEvidence` when the operation is `clone` OR when `localPath` is explicitly provided. The condition changed from `if (localPath)` to `if (operation === "clone" || localPath)`, reinforcing that clone operations semantically produce a local workspace and must record its path in the evidence envelope for downstream propagation to Div5 and Div4. All existing Div6 tests continue to pass.

## Verification

Ran the full Div6 external gateway test suite: 40/40 tests passed. Verified that clone, fetch, and ls-remote behaviors are unchanged, and that the evidence envelope still carries local_path correctly.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd plugin-bos-light && npx vitest run tests/div6ExternalGateway.test.ts` | 0 | ✅ pass | 550ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/src/div6ExternalGateway.ts`
