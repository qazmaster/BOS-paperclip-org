# Untested Functions Inventory

Generated: 2026-06-03

## ✅ Tested (backfilled)

- `plugin-bos-light/src/evalGates.ts::runEvalGates` — Pure gate evaluation with blocking/warning/overall logic
- `plugin-bos-light/src/blueprint.ts::generateBlueprintMarkdown` — Pure markdown generator from blueprint input
- `plugin-bos-light/src/bettingTable.ts::buildBettingTable` — Pure function that builds sorted betting table
- `plugin-bos-light/src/bettingTable.ts::saveBettingCycle` — Async persistence save with fallback diagnostics
- `plugin-bos-light/src/bettingTable.ts::loadBettingCycle` — Async persistence load with fallback
- `plugin-bos-light/src/bettingTable.ts::markApprovalRequested` — Pure state transition function
- `plugin-bos-light/src/bettingTable.ts::markNativeApprovalDecided` — Pure state transition for approval/rejection
- `plugin-bos-light/src/grantPolicy.ts::validateGrantRequest` — Deterministic policy engine with approve/deny/escalate
- `plugin-bos-light/src/missionSignals.ts::deriveMissionSignals` — Deterministic keyword-based signal extraction
- `plugin-bos-light/src/missionSignals.ts::requiresExecutiveDecision` — Boolean routing predicate based on signals
- `plugin-bos-light/src/grantLedger.ts::InMemoryGrantLedger` — In-memory grant tracking with add/get/revoke/expire
- `plugin-bos-light/src/grantLedger.ts::createBudgetGrant` — Pure factory from request+decision
- `plugin-bos-light/src/grantLedger.ts::createAccessGrant` — Pure factory from request+decision
- `plugin-bos-light/src/metadataMirror.ts::serializeMetadataToMarkdown` — Pure serializer for BosTaskMetadata
- `plugin-bos-light/src/metadataMirror.ts::serializeGrantDecisionToMarkdown` — Pure serializer for grant decisions
- `plugin-bos-light/src/metadataMirror.ts::formatBosMetadataComment` — Pure formatter with delimited markers
- `plugin-bos-light/src/metadataMirror.ts::parseBosMetadataComment` — Parser for delimited metadata comments
- `plugin-bos-light/src/metadataMirror.ts::hasBosMetadata` — Simple predicate for marker detection
- `plugin-bos-light/src/persistence.ts::InMemoryBOSPersistence` — In-memory persistence for all BOS state
- `plugin-bos-light/src/persistence.ts::mirrorGateResultToNativeArtifact` — Mirrors gate results to adapter comments
- `plugin-bos-light/src/persistence.ts::mirrorDecisionToNativeArtifact` — Mirrors decisions to adapter comments
- `plugin-bos-light/src/dryRunPaperclipTaskPort.ts::DryRunPaperclipTaskPort` — Dry-run task port for testing
- `plugin-bos-light/src/livePaperclipAdapter.ts::redactSensitiveText` — Secret redaction utility

## ⏳ Remaining (deferred)

- `plugin-bos-light/src/bettingTable.ts::requestBettingCycleApproval` — Complex approval flow; needs integration-style test with mock adapter
- `plugin-bos-light/src/bettingTable.ts::buildAndSaveBettingCycle` — Composite function; covered by individual tests
- `plugin-bos-light/src/issueBlueprintFlow.ts::runSeededIssueBlueprintFlow` — Depends on BPI, Blueprint, BlueprintArtifact; needs integration test
- `plugin-bos-light/src/livePaperclipAdapter.ts::LivePaperclipIssueAdapter` — HTTP adapter class; needs mock fetch setup
- `plugin-bos-light/src/metadataMirror.ts::mirrorMetadataToComment` — Async adapter call; covered by persistence tests
- `plugin-bos-light/src/metadataMirror.ts::mirrorGrantDecisionToComment` — Async adapter call; covered by persistence tests
- `plugin-bos-light/src/metadataMirror.ts::mirrorAllMetadata` — Batch operation; covered by individual mirror tests

## ⏭️ Skipped (not applicable)

- `plugin-bos-light/src/contracts.ts` — Type definitions only
- `plugin-bos-light/src/paperclipAdapter.ts` — Test helper, not production code
- `plugin-bos-light/src/paperclipTaskPort.ts` — Interfaces only
- `plugin-bos-light/src/runtimeCapabilities.ts` — Constants and types
- `plugin-bos-light/src/index.ts` — Re-exports only
- `plugin-bos-light/src/ui/*.ts` — React UI components
