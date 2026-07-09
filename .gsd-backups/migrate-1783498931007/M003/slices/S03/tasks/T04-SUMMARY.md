---
id: T04
parent: S03
milestone: M003
key_files:
  - plugin-bos-light/src/majorFlowDecision.ts
  - plugin-bos-light/src/decisionArtifact.ts
  - plugin-bos-light/tests/majorFlowDecision.test.ts
  - docs/04_DATA_CONTRACTS.md
  - docs/08_RUNTIME_CAPABILITY_HEALTH.md
key_decisions:
  - Malformed major-flow inputs fail closed through the existing S01 DecisionValidationFailure and S02 markdown-only DecisionArtifactEnvelope path rather than adding a new persistence or exception path.
  - Unsafe token-like public issue ids are rejected instead of transformed into artifact ids or refs, preventing auth-like material from persisting into markdown or adapter calls.
  - S03 remains fixture/integration proof only and does not promote plugin UI, host piko registration, live readback, Paperclip-native approvals, Hermes, GSD-Pi, activity logs, or events.
duration: 
verification_result: passed
completed_at: 2026-05-31T04:54:35.048Z
blocker_discovered: false
---

# T04: Hardened major-flow decision artifacts so malformed inputs, unsafe issue ids, and markdown/HTML injection fail closed through sanitized S01/S02 envelopes without native approval mutation.

**Hardened major-flow decision artifacts so malformed inputs, unsafe issue ids, and markdown/HTML injection fail closed through sanitized S01/S02 envelopes without native approval mutation.**

## What Happened

Inspected the T04 plan, the major-flow adapter implementation, the S02 artifact persistence path, regression tests, and runtime capability documentation. The worktree already contained the planned hardening: major-flow direct inputs are validated and normalized before nested fields are dereferenced; malformed batch approval, Eval Gate, Circuit Breaker, policy exception, budget exception, and strategic choice variants become sanitized DecisionValidationFailure results; token-like or otherwise unsafe public issue ids are rejected before they can enter markdown-only refs, artifact ids, or native adapter calls; untrusted display fields are redacted, compacted, and markdown/HTML/control-neutralized before rendering; and validation failures route through the existing S02 markdown-only envelope without document writes, comment writes, cache saves, or native approval mutation. Documentation in docs/04_DATA_CONTRACTS.md and docs/08_RUNTIME_CAPABILITY_HEALTH.md now describes the fail-closed, fixture-only scope without promoting runtime, host registration, approval, or live readback claims.

## Verification

Ran the focused majorFlowDecision regression tests, the S03-related fixture suite, TypeScript typecheck, the full plugin-bos-light test suite, and the runtime capability honesty validator. All commands passed. Coverage includes markdown/HTML injection strings, token-like issue id rejection, malformed direct inputs for all six major-flow variants, S03 invariants decided_by=Div7.MissionControl, diagnostics_sanitized=true, native_approval_mutated=false, and no native approval mutation.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm --prefix plugin-bos-light test -- tests/majorFlowDecision.test.ts` | 0 | ✅ pass | 966ms |
| 2 | `npm --prefix plugin-bos-light test -- tests/majorFlowDecision.test.ts tests/decisionArtifact.test.ts tests/evalGateEvidence.test.ts tests/circuitBreakerFlow.test.ts` | 0 | ✅ pass | 1032ms |
| 3 | `npm --prefix plugin-bos-light run typecheck` | 0 | ✅ pass | 1665ms |
| 4 | `npm --prefix plugin-bos-light test` | 0 | ✅ pass | 1354ms |
| 5 | `python3 scripts/validate_runtime_capabilities.py` | 0 | ✅ pass | 67ms |

## Deviations

Existing implementation matched the task plan at execution start; no additional code edits were required after inspection.

## Known Issues

None.

## Files Created/Modified

- `plugin-bos-light/src/majorFlowDecision.ts`
- `plugin-bos-light/src/decisionArtifact.ts`
- `plugin-bos-light/tests/majorFlowDecision.test.ts`
- `docs/04_DATA_CONTRACTS.md`
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md`
