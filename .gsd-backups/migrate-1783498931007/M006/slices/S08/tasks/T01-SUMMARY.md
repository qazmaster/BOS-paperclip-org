---
id: T01
parent: S08
milestone: M006
key_files:
  - plugin-bos-light/src/contracts.ts
  - plugin-bos-light/src/div4Production.ts
  - plugin-bos-light/tests/div4Production.test.ts
key_decisions:
  - Added Div5PostProductionUnauthorized as a separate type (not reusing Div5QuarantineUnauthorized) for clear semantic distinction between quarantine and post-production authorization failures
  - Propagated local_path as a top-level field in the status_update payload rather than nesting it in a sub-object for direct access by Div5
duration: 
verification_result: passed
completed_at: 2026-06-01T11:38:21.557Z
blocker_discovered: false
---

# T01: Added PostProductionCheck/PostProductionVerdict/Div5PostProductionUnauthorized contracts and propagated local_path in Div4 status_update to Div5

**Added PostProductionCheck/PostProductionVerdict/Div5PostProductionUnauthorized contracts and propagated local_path in Div4 status_update to Div5**

## What Happened

Three changes applied to complete T01:

1. **contracts.ts** — Added three new interfaces after the existing Div5 quarantine section:
   - `PostProductionCheck`: `{ check_id, passed, detail }` — individual pass/fail check
   - `PostProductionVerdict`: `{ schema_version, mission_id, snapshot_id, branch_created, commit_sha, checks[], overall, evaluated_at, evaluated_by }` — full verdict artifact for Div5 post-production gate
   - `Div5PostProductionUnauthorized`: same shape as `Div5QuarantineUnauthorized` (authorized:false, caller, required_role, reason, rejected_at) — unauthorized response for Div5 post-production operations

2. **div4Production.ts** — Added `local_path: localPath` to the `status_update` emit payload sent to `Div5.QualificationsLibraryLearning`. This closes the gap so S08's post-production gate can locate the workspace from the status_update packet without needing to re-fetch the gate_decision.

3. **div4Production.test.ts** — Added `expect(statusPayload.local_path).toBe("/tmp/test-repo")` assertion to the existing "emits status_update to Div5" test case, confirming local_path is present in the emitted payload.

All changes are contract additions + one-line payload enrichment with zero behavioral impact on existing flows.

## Verification

TypeScript compiles with zero errors (`npx tsc --noEmit`). All 29 tests pass including the new local_path assertion (`npx vitest run tests/div4Production.test.ts`).

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd plugin-bos-light && npx tsc --noEmit` | 0 | ✅ pass | 1500ms |
| 2 | `cd plugin-bos-light && npx vitest run tests/div4Production.test.ts` | 0 | ✅ pass | 410ms |

## Deviations

None

## Known Issues

None

## Files Created/Modified

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/div4Production.ts`
- `plugin-bos-light/tests/div4Production.test.ts`
