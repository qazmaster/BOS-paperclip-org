---
id: T01
parent: S02
milestone: M009
key_files:
  - plugin-bos-light/src/issueLifecycleHooks.ts
key_decisions:
  - Moved MissionSignals import from ./contracts to ./missionSignals to match actual export location
duration: 
verification_result: passed
completed_at: 2026-06-02T11:23:08.936Z
blocker_discovered: false
---

# T01: Fixed MissionSignals type import: moved from ./contracts to ./missionSignals where it is exported. Typecheck now passes clean alongside all 818 tests.

**Fixed MissionSignals type import: moved from ./contracts to ./missionSignals where it is exported. Typecheck now passes clean alongside all 818 tests.**

## What Happened

Reopened T01 due to typecheck regression: MissionSignals was imported from "./contracts" but is actually exported from "./missionSignals". Fixed by moving MissionSignals to the missionSignals import line using `import { deriveMissionSignals, type MissionSignals } from "./missionSignals"` and removing it from the contracts type import. Verified: npx tsc --noEmit passes clean (exit 0), full test suite passes (818 tests, 44 files, 0 failures).

## Verification

npx tsc --noEmit passes clean (exit 0). Full test suite: 818 tests, 44 files, 0 failures.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd plugin-bos-light && npx tsc --noEmit` | 0 | ✅ pass | 7119ms |
| 2 | `cd plugin-bos-light && npx vitest run` | 0 | ✅ pass | 10503ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/src/issueLifecycleHooks.ts`
