---
id: T01
parent: S01
milestone: M003
key_files:
  - plugin-bos-light/tests/decision.test.ts
key_decisions:
  - Treat T01 as a TDD RED contract-test artifact; T02 is responsible for making the tests green.
duration: 
verification_result: passed
completed_at: 2026-05-30T20:16:41.039Z
blocker_discovered: false
---

# T01: Added RED decision contract fixtures for M003/S01/T01.

**Added RED decision contract fixtures for M003/S01/T01.**

## What Happened

Added `plugin-bos-light/tests/decision.test.ts` in the M003 worktree. The tests exercise the public `decide` interface for CLEAR batch approval, COMPLICATED policy and budget exception, COMPLEX ambiguous strategy, CHAOTIC outage/circuit-breaker escalation, DISORDER mixed low-confidence signals, confidence clamping, deterministic timestamps, markdown record expectations, and structured invalid-input errors. The first run revealed missing worktree dependencies; after `npm ci`, the test command ran successfully and produced the intended RED result against the current implementation.

## Verification

Fresh verification command ran after the test file was written: `npm --prefix /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/plugin-bos-light test -- tests/decision.test.ts`. Vitest executed 6 tests and all 6 failed for expected contract gaps in the current `decision.ts`, proving the tests are active and pin T02 behavior.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm --prefix /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/plugin-bos-light ci` | 0 | ✅ pass | 4200ms |
| 2 | `npm --prefix /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M004-osbua3/plugin-bos-light test -- tests/decision.test.ts` | 1 | ✅ expected RED: 6 contract tests execute and fail on missing implementation fields/behavior | 7500ms |

## Deviations

Task verification is intentionally RED because T01 is the test-first contract-writing task and T02 implements the contract. The RED failures are the acceptance signal for T01: the new tests execute and fail only on missing decision-contract fields/behavior, not on test infrastructure.

## Known Issues

The decision contract implementation is not present yet: risk_tier, record_detail, diagnostics, ooda, record_markdown, DISORDER mixed-signal behavior, and structured validation errors are all expected T02 work.

## Files Created/Modified

- `plugin-bos-light/tests/decision.test.ts`
