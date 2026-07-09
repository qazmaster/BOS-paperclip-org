---
id: T01
parent: S07
milestone: M006
key_files:
  - plugin-bos-light/src/contracts.ts
  - plugin-bos-light/src/div6ExternalGateway.ts
key_decisions:
  - Added local_path as optional field to existing evidence types rather than creating new packet shapes, preserving backward compatibility.
  - Placed Div4 contract types in contracts.ts alongside other division contract families for consistency.
  - Populated local_path in ExternalGitEvidence only when present (clone/fetch operations), avoiding empty-string pollution.
duration: 
verification_result: passed
completed_at: 2026-06-01T10:03:14.379Z
blocker_discovered: false
---

# T01: Added optional local_path to ExternalGitEvidence and SanitizedRepoSnapshot; introduced Div4ProductionUnauthorized and ProductionWorkEvidence contract types

**Added optional local_path to ExternalGitEvidence and SanitizedRepoSnapshot; introduced Div4ProductionUnauthorized and ProductionWorkEvidence contract types**

## What Happened

Extended contracts.ts with backward-compatible optional local_path fields on SanitizedRepoSnapshot (to propagate approved workspace path from Div6 → Div5 → Div4) and added two new Div4 contract types: Div4ProductionUnauthorized (authorization failure shape) and ProductionWorkEvidence (bounded local-only git work result with commit_sha, diff_hash, branch_created, files_changed, and pushed:false). Also updated div6ExternalGateway.ts to add the same optional local_path to ExternalGitEvidence and populate it during executeExternalGitOperation when a localPath argument is provided. These changes are purely additive; no existing test assertions were affected.

## Verification

Ran npx tsc --noEmit in plugin-bos-light. Compilation succeeded with zero errors, confirming the new optional fields and contract types are type-safe and do not break existing code.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd plugin-bos-light && npx tsc --noEmit` | 0 | pass | 2794ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/div6ExternalGateway.ts`
