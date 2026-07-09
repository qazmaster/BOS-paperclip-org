---
id: T02
parent: S01
milestone: M003
key_files:
  - plugin-bos-light/src/contracts.ts
  - plugin-bos-light/src/decision.ts
  - plugin-bos-light/tests/decision.test.ts
key_decisions:
  - D019: piko:decide malformed input failures return a discriminated accepted:false result with sanitized diagnostics instead of throwing.
duration: 
verification_result: mixed
completed_at: 2026-05-30T20:24:42.933Z
blocker_discovered: false
---

# T02: Implemented the risk-tiered piko:decide contract with sanitized diagnostics, DISORDER routing, OODA detail, and compact CLEAR records.

**Implemented the risk-tiered piko:decide contract with sanitized diagnostics, DISORDER routing, OODA detail, and compact CLEAR records.**

## What Happened

Extended the decision contract with a typed `DecisionResult` surface: accepted decisions expose risk tier, record detail level, domain evidence, risk reasons, uncertainty reasons, optional OODA sections, and rendered record markdown; malformed inputs return `accepted: false` with bounded sanitized validation errors rather than throwing. Implemented the classifier behavior in `decision.ts`, preserving `Div7.MissionControl`, clamping confidence into `0..1`, routing mixed low-confidence evidence to `DISORDER`, keeping high-confidence CLEAR batch approvals compact, and expanding higher-risk records.

The planned `plugin-bos-light/tests/decision.test.ts` fixture was absent in this worktree despite the T01 summary, so I recreated the decision contract fixture as a git-trackable package test and verified it with the authoritative command.

### Failure Modes
- External dependencies: none at runtime for `decide`; it is pure in-memory classification with no filesystem, network, subprocess, adapter, or persistence calls.
- Malformed caller input is handled in-process by returning `accepted: false`, `error: invalid_decision_input`, `decided_by: Div7.MissionControl`, and sanitized validation diagnostics.
- Timestamp generation can only use provided `now` or local `Date`; this is intentionally deterministic when callers provide `now` and does not bubble external dependency failures.

### Load Profile
- Runtime load dimension is CPU/string scanning over the provided `signals` array and four small keyword sets. At 10x expected fixture load, the first saturating resource would be CPU proportional to total signal text length.
- Protection applied: bounded classifier rules, bounded validation errors (max 8), bounded sanitized issue IDs/messages, compact records for CLEAR low-risk approvals, and no persistence or network fan-out.

### Negative Tests
- `plugin-bos-light/tests/decision.test.ts` covers malformed inputs: empty `issue_id`, empty signal string, non-finite confidence, and secret-like extra fields not leaking into diagnostics.
- Boundary conditions covered: confidence values above 1 and below 0 clamp to `1` and `0`; deterministic `now` produces deterministic `decided_at` and `decision_id`.
- Error-path classification covered: mixed low-confidence evidence returns `DISORDER` with uncertainty diagnostics; CHAOTIC outage/circuit-breaker evidence returns critical self-healing guidance; CLEAR batch approval remains compact.

## Verification

Fresh final verification ran after the source and test changes: `npm --prefix plugin-bos-light test -- tests/decision.test.ts` exited 0 with 7/7 decision tests passing. I also ran the package test suite, which exited 0 with 10 test files and 86 tests passing. A non-required typecheck diagnostic was run and surfaced an unrelated pre-existing test fixture typo in `tests/liveArtifactFlow.test.ts` (`Div3.Production` is not a valid `Division`); I left that out-of-scope file unchanged.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm --prefix plugin-bos-light ci` | 0 | ✅ pass - installed package dependencies required for Vitest verification | 1930ms |
| 2 | `npm --prefix plugin-bos-light test -- tests/decision.test.ts` | 0 | ✅ pass - final fresh planned verification, 7/7 decision tests passed | 867ms |
| 3 | `npm --prefix plugin-bos-light test` | 0 | ✅ pass - package runtime suite passed, 10 files / 86 tests | 1323ms |
| 4 | `npm --prefix plugin-bos-light run typecheck` | 2 | ⚠️ diagnostic only - failed on unrelated existing tests/liveArtifactFlow.test.ts invalid Division literal | 1555ms |

## Deviations

The task expected only source outputs, but the referenced decision test fixture was missing in this worktree. I recreated `plugin-bos-light/tests/decision.test.ts` from the T01 acceptance summary so the authoritative verification command exercised the intended contract.

## Known Issues

`npm --prefix plugin-bos-light run typecheck` currently fails on an unrelated existing fixture typo in `plugin-bos-light/tests/liveArtifactFlow.test.ts` (`Div3.Production` should be a valid Division such as `Div4.Production`). `npm ci` reported 5 moderate npm audit findings; dependency remediation was outside this task.

## Files Created/Modified

- `plugin-bos-light/src/contracts.ts`
- `plugin-bos-light/src/decision.ts`
- `plugin-bos-light/tests/decision.test.ts`
