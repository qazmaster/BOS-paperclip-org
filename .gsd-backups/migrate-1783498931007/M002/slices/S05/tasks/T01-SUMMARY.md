---
id: T01
parent: S05
milestone: M002
key_files:
  - plugin-bos-light/src/registrationProbe.ts
  - plugin-bos-light/tests/registrationProbe.test.ts
  - plugin-bos-light/src/worker.ts
  - plugin-bos-light/src/index.ts
key_decisions:
  - The registration probe remains local-only and always returns `runtime_support_claimed: false`; local harness success is not Paperclip host proof.
  - Optional data-provider and action registration now match tool registration by catching host registration errors and logging warnings.
duration: 
verification_result: passed
completed_at: 2026-05-29T11:27:58.760Z
blocker_discovered: false
---

# T01: Added a local BOS Light registration probe harness that records piko tool, betting-table data-provider, and approve-batch action intent without claiming live Paperclip support.

**Added a local BOS Light registration probe harness that records piko tool, betting-table data-provider, and approve-batch action intent without claiming live Paperclip support.**

## What Happened

Created `probeBosLightRegistration()` around `registerBosLightPlugin(ctx)` with a recording context for `ctx.tools.register`, `ctx.data.register`, `ctx.actions.register`, and logger calls. The probe returns schema/versioned diagnostic output with intended keys, attempted keys, succeeded keys, failed keys, skipped keys, warnings, validation errors, and `runtime_support_claimed: false` so local registration intent cannot be mistaken for live host proof.

Updated worker registration to make data-provider and action registration fail-closed like optional tool registration. Thrown registration failures now emit warning diagnostics and do not stop the worker from attempting remaining optional registration surfaces.

Added Vitest coverage for the happy path, absent `ctx.tools`, thrown tool/data/action registration errors, all seven canonical `piko:*` tool keys, the `betting-table` data-provider key, and the `approve-batch` action key.

## Failure Modes
- External dependencies: no network, filesystem, Paperclip host, or subprocess dependency exists inside the registration harness itself; verification uses npm/vitest/tsc as subprocesses.
- Host API absence: covered by `unavailableSurfaces: ["tools"]`; expected piko tools are reported under `skipped.tools` with no runtime support claim.
- Malformed/failed host registration behavior: covered by local register methods that throw for specific tool/data/action keys; worker catches these and emits warnings while the probe records failures diagnostically.
- Unexpected worker exception: probe catches it into an error log/validation surface instead of claiming support.

## Load Profile
The harness has no meaningful runtime load dimension: it records a fixed small registration contract of 7 tools, 1 data provider, and 1 action in memory during local tests. At 10x the current registration count, the first saturated resource would still be test-process memory/log size, with no persistent state or external host calls; no pool, pagination, or rate-limit protection is applicable.

## Negative Tests
- `plugin-bos-light/tests/registrationProbe.test.ts` covers absent `ctx.tools` and proves all piko tools become skipped diagnostics.
- `plugin-bos-light/tests/registrationProbe.test.ts` covers thrown tool, data-provider, and action registration failures and verifies warnings/failure records without errors.
- `plugin-bos-light/tests/registrationProbe.test.ts` covers boundary/canonical-key assertions for exactly seven `piko:*` tools, exactly one `betting-table` data provider, and exactly one `approve-batch` action.

## Verification

Ran the required focused verification command `npm --prefix plugin-bos-light test -- registrationProbe` successfully: 1 test file passed, 6 tests passed. Ran `npm --prefix plugin-bos-light run typecheck` successfully to verify strict TypeScript compatibility. Ran full regression `npm --prefix plugin-bos-light test` successfully: 9 test files passed, 79 tests passed.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm --prefix plugin-bos-light test -- registrationProbe` | 0 | ✅ pass — 1 test file passed, 6 tests passed | 788ms |
| 2 | `npm --prefix plugin-bos-light run typecheck` | 0 | ✅ pass — tsc --noEmit completed | 1384ms |
| 3 | `npm --prefix plugin-bos-light test` | 0 | ✅ pass — 9 test files passed, 79 tests passed | 1190ms |

## Deviations

Modified `plugin-bos-light/src/worker.ts` and `plugin-bos-light/src/index.ts` in addition to creating the two expected output files so registration failures for data providers/actions are diagnostic-only and the new harness is exported.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/src/registrationProbe.ts`
- `plugin-bos-light/tests/registrationProbe.test.ts`
- `plugin-bos-light/src/worker.ts`
- `plugin-bos-light/src/index.ts`
