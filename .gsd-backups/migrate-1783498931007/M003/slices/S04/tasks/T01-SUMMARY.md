---
id: T01
parent: S04
milestone: M003
key_files:
  - plugin-bos-light/src/liveDecisionArtifactReadback.ts
  - plugin-bos-light/src/contracts.ts
  - plugin-bos-light/src/index.ts
  - plugin-bos-light/tests/liveDecisionArtifactReadback.test.ts
key_decisions:
  - Readback only treats native document/comment refs as live proof; markdown-only refs return deterministic fail-closed handoff evidence without network mutation.
duration: 
verification_result: passed
completed_at: 2026-05-31T05:26:01.186Z
blocker_discovered: false
---

# T01: Added a live decision artifact readback helper and contract tests for native document/comment proof with markdown-only fail-closed handling.

**Added a live decision artifact readback helper and contract tests for native document/comment proof with markdown-only fail-closed handling.**

## What Happened

Implemented `readbackDecisionArtifactEnvelope` in `plugin-bos-light/src/liveDecisionArtifactReadback.ts`, including safe parsing for S02/S03 decision artifact refs, bounded GET readbacks for native document/comment refs, sha256 comparison against envelope markdown, sanitized snippets/diagnostics, and fail-closed outcomes for markdown-only, unsupported, denied, malformed, missing-content, mismatch, timeout, and unsafe-ref cases. Added typed readback result contracts and exported the helper through the plugin index. The Vitest coverage exercises document success, comment success, markdown-only fail-closed behavior, denied access, malformed response redaction, hash mismatch, unsafe/unsupported ref rejection, and the no native approval mutation invariant.

## Verification

Ran the task verification command `npm --prefix plugin-bos-light test -- tests/liveDecisionArtifactReadback.test.ts tests/decisionArtifact.test.ts tests/majorFlowDecision.test.ts` successfully: 3 test files passed, 32 tests passed. Also ran `npm --prefix plugin-bos-light run typecheck` successfully after fixing the diagnostic message type.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm --prefix plugin-bos-light test -- tests/liveDecisionArtifactReadback.test.ts tests/decisionArtifact.test.ts tests/majorFlowDecision.test.ts` | 0 | ✅ pass | 997ms |
| 2 | `npm --prefix plugin-bos-light run typecheck` | 0 | ✅ pass | 1622ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/src/liveDecisionArtifactReadback.ts`
- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/index.ts`
- `plugin-bos-light/tests/liveDecisionArtifactReadback.test.ts`
