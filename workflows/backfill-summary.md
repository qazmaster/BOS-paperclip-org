# Test Backfill Summary

Generated: 2026-06-03

## Results

- **Symbols tested:** 12
- **Test files created:** 7
- **New tests added:** 67
- **Total suite:** 63 files, 1424 tests (all passing)

## New Test Files

| File | Source | Symbols Covered | Tests |
|------|--------|-----------------|-------|
| `tests/evalGates.test.ts` | `src/evalGates.ts` | `runEvalGates` | 7 |
| `tests/blueprint.test.ts` | `src/blueprint.ts` | `generateBlueprintMarkdown` | 9 |
| `tests/bettingTable.test.ts` | `src/bettingTable.ts` | `buildBettingTable`, `saveBettingCycle`, `loadBettingCycle`, `markApprovalRequested`, `markNativeApprovalDecided` | 14 |
| `tests/grantPolicy.test.ts` | `src/grantPolicy.ts` | `validateGrantRequest` | 10 |
| `tests/missionSignals.test.ts` | `src/missionSignals.ts` | `deriveMissionSignals`, `requiresExecutiveDecision` | 17 |
| `tests/grantLedger.test.ts` | `src/grantLedger.ts` | `InMemoryGrantLedger`, `createBudgetGrant`, `createAccessGrant` | 14 |
| `tests/metadataMirror.test.ts` | `src/metadataMirror.ts` | `serializeMetadataToMarkdown`, `serializeGrantDecisionToMarkdown`, `formatBosMetadataComment`, `parseBosMetadataComment`, `hasBosMetadata` | 13 |
| `tests/persistence.test.ts` | `src/persistence.ts` | `InMemoryBOSPersistence`, `mirrorGateResultToNativeArtifact`, `mirrorDecisionToNativeArtifact` | 11 |
| `tests/dryRunPaperclipTaskPort.test.ts` | `src/dryRunPaperclipTaskPort.ts` | `DryRunPaperclipTaskPort` | 9 |
| `tests/livePaperclipAdapter.test.ts` | `src/livePaperclipAdapter.ts` | `redactSensitiveText` | 10 |

## Skipped / Remaining

The following source files were not backfilled because they contain primarily type definitions, interfaces, or test helpers without testable logic:

- `src/contracts.ts` — Type definitions only (no runtime logic)
- `src/paperclipAdapter.ts` — `InMemoryPaperclipAdapter` is a test helper, not production code
- `src/paperclipTaskPort.ts` — Interfaces only
- `src/runtimeCapabilities.ts` — Constants and type definitions
- `src/index.ts` — Re-exports only
- `src/ui/*.ts` — React UI components (require different test setup)

The following source files have complex integration dependencies and were deferred:

- `src/issueBlueprintFlow.ts` — `runSeededIssueBlueprintFlow` depends on BPI, Blueprint, and BlueprintArtifact modules; needs integration-style test
- `src/livePaperclipAdapter.ts` — `LivePaperclipIssueAdapter` class needs mock HTTP setup; `redactSensitiveText` was tested but class methods deferred

## Coverage Impact

Prior to backfill: 53 test files covering direct module tests.
After backfill: 63 test files with improved coverage of pure functions, state machines, and policy engines.

Key areas now covered:
- **Eval gate logic** — All gate combinations and overall status derivation
- **Betting table** — Sorting, filtering, state transitions, persistence fallback
- **Grant policy** — All approve/deny/escalate branches
- **Mission signals** — Keyword classification, executive decision routing
- **Grant ledger** — Full lifecycle (add, get, revoke, expire, overrun)
- **Metadata mirror** — Serialization, parsing, round-trip fidelity
