---
id: T03
parent: S01
milestone: M003
key_files:
  - plugin-bos-light/src/decision.ts
  - plugin-bos-light/src/worker.ts
  - plugin-bos-light/tests/decision.test.ts
key_decisions:
  - Kept `piko:decide` pure and deterministic; worker registration now delegates through `runPikoDecide` without claiming live host tool proof.
duration: 
verification_result: mixed
completed_at: 2026-05-31T03:15:18.232Z
blocker_discovered: false
---

# T03: Added deterministic decision-record markdown rendering and routed the optional worker piko:decide tool through a typed pure seam.

**Added deterministic decision-record markdown rendering and routed the optional worker piko:decide tool through a typed pure seam.**

## What Happened

Added an exported `renderDecisionRecord` renderer in `plugin-bos-light/src/decision.ts` that keeps low-risk CLEAR decisions compact while adding deterministic expanded sections for policy/expert review, budget review, incident containment, strategic probes, ambiguity/disorder handling, complex control, chaotic control, high-risk safeguards, OODA, fallback-ready fields, and validation diagnostics. Added markdown normalization helpers so rendered values stay single-line and deterministic without dumping raw signal text.

Added `runPikoDecide` in `plugin-bos-light/src/worker.ts` and wired optional `piko:decide` registration through that seam. The registration remains optional and test-only; no live host tool support is claimed.

Updated `plugin-bos-light/tests/decision.test.ts` to assert compact vs expanded record sections across CLEAR, COMPLICATED, COMPLEX, CHAOTIC, and DISORDER fixtures, plus worker registration behavior that proves the registered `piko:decide` handler returns the same typed result shape as direct `decide`/`runPikoDecide`.

### Failure Modes
- External dependencies for `decide`, `renderDecisionRecord`, and `runPikoDecide`: none. They are pure in-memory functions with no filesystem, network, subprocess, adapter, or persistence calls.
- Optional worker registration dependency: a host-provided `ctx.tools.register` function. The existing `registerOptionalTool` wrapper catches registration failures, logs a bounded warning through `ctx.logger?.warn`, and continues without throwing.
- Malformed decision input path: returns `accepted: false`, `error: invalid_decision_input`, sanitized validation diagnostics, and no stack trace or secret-like extra fields. This is verified for direct and worker-tool calls.

### Load Profile
- Runtime load dimension is CPU/string work over the caller-provided `signals` plus a fixed set of domain keyword rules and deterministic markdown sections. At 10x expected decision fixture load, CPU proportional to total signal text length saturates first.
- Protections: fixed domain rule count, bounded issue IDs and validation messages, no external fan-out, compact records for low-risk CLEAR decisions, and expanded markdown generated from bounded classifier diagnostics rather than raw signal dumps.

### Negative Tests
- `plugin-bos-light/tests/decision.test.ts` covers malformed direct input: empty `issue_id`, empty signal, non-finite confidence, and secret-like extra fields not leaking into serialized output.
- `plugin-bos-light/tests/decision.test.ts` covers malformed worker `piko:decide` input: empty `issue_id`, empty signal, and secret-like extra fields not leaking into serialized output.
- Boundary/error-path cases covered: confidence clamping above 1 and below 0, deterministic `now`/`decision_id`, DISORDER routing for mixed low-confidence evidence, CHAOTIC critical self-healing routing, compact CLEAR rendering, and expanded sections for policy, budget, strategic/ambiguous/complex, incident/chaotic, and high-risk decisions.

## Verification

Ran the authoritative task verification `npm --prefix plugin-bos-light test -- tests/decision.test.ts`; it passed with 9/9 tests. Ran the full plugin runtime suite `npm --prefix plugin-bos-light test`; it passed with 10 files and 88 tests. Ran `npm --prefix plugin-bos-light run typecheck` as a diagnostic; it still fails only on the pre-existing unrelated `tests/liveArtifactFlow.test.ts` invalid `Division` literal recorded by T02, not on this task's changed files.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm --prefix plugin-bos-light test -- tests/decision.test.ts` | 0 | ✅ pass - authoritative T03 fixture passed, 9/9 tests | 911ms |
| 2 | `npm --prefix plugin-bos-light test` | 0 | ✅ pass - full plugin runtime suite passed, 10 files / 88 tests | 1252ms |
| 3 | `npm --prefix plugin-bos-light run typecheck` | 2 | ⚠️ diagnostic only - failed on pre-existing unrelated tests/liveArtifactFlow.test.ts Division literal | 1472ms |

## Deviations

None.

## Known Issues

`npm --prefix plugin-bos-light run typecheck` still fails on the pre-existing unrelated `plugin-bos-light/tests/liveArtifactFlow.test.ts` literal `Div3.Production`, which is not a valid `Division`; this was already documented in T02 and left out of scope.

## Files Created/Modified

- `plugin-bos-light/src/decision.ts`
- `plugin-bos-light/src/worker.ts`
- `plugin-bos-light/tests/decision.test.ts`
