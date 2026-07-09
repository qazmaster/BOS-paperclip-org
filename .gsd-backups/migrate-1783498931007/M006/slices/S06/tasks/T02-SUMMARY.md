---
id: T02
parent: S06
milestone: M006
key_files:
  - plugin-bos-light/src/gitOperations.ts
  - plugin-bos-light/src/div6ExternalGateway.ts
  - plugin-bos-light/tests/div6ExternalGateway.test.ts
key_decisions:
  - GitCommandEvidence.metadata is only populated for ls-remote operations to avoid unnecessary parsing overhead for other commands.
  - Parsing occurs on raw stdout before redaction/hashing to preserve actual commit SHAs in structured metadata while keeping stdout_hash redacted.
duration: 
verification_result: passed
completed_at: 2026-06-01T09:38:13.541Z
blocker_discovered: false
---

# T02: Extended GitCommandEvidence with optional metadata field, auto-populated for ls-remote via stdout parsing, wired into ExternalGitEvidence.parsed_metadata, and covered with 4 non-breaking test assertions.

**Extended GitCommandEvidence with optional metadata field, auto-populated for ls-remote via stdout parsing, wired into ExternalGitEvidence.parsed_metadata, and covered with 4 non-breaking test assertions.**

## What Happened

Added an optional `metadata` field to `GitCommandEvidence` in `gitOperations.ts` to hold structured refs/branches/commit_shas parsed from git output. Implemented `parseLsRemoteOutput` to extract data from `git ls-remote` stdout before redaction/hashing. In `div6ExternalGateway.ts`, the gateway now copies `git_evidence.metadata` into `evidence.parsed_metadata` when present. Updated `div6ExternalGateway.test.ts` with four non-breaking assertions: parsed_metadata is populated on ls-remote success, absent on clone/fetch success, and empty on ls-remote failure. Fixed a test data issue where a mock commit SHA was 42 characters instead of 40, causing the regex parser to skip the second ref.

## Verification

All 40 tests in div6ExternalGateway.test.ts pass, including the 4 new assertions for parsed_metadata behavior across ls-remote success, clone/fetch success, and ls-remote failure paths.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npx vitest run plugin-bos-light/tests/div6ExternalGateway.test.ts` | 0 | ✅ pass | 989ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/src/gitOperations.ts`
- `plugin-bos-light/src/div6ExternalGateway.ts`
- `plugin-bos-light/tests/div6ExternalGateway.test.ts`
