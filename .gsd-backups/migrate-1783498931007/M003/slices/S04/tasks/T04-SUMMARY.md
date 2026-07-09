---
id: T04
parent: S04
milestone: M003
key_files:
  - docs/08_RUNTIME_CAPABILITY_HEALTH.md
  - docs/04_DATA_CONTRACTS.md
  - plugin-bos-light/capabilities.paperclip-runtime.json
  - plugin-bos-light/src/runtimeCapabilities.ts
  - scripts/validate_runtime_capabilities.py
  - scripts/test_validate_runtime_capabilities.py
key_decisions:
  - M003 S04 fail-closed decision artifact readback evidence is recorded as conservative no-promotion blocker evidence; no capability status was promoted from markdown-only readback.
  - Validator enforcement now requires the M003 S04 no-promotion ledger and rejects any attempt to cite fail-closed decision readback evidence as proof for native approvals, actions/tools/UI, Hermes, GSD-Pi, activity logs, or events.
duration: 
verification_result: passed
completed_at: 2026-05-31T05:45:02.221Z
blocker_discovered: false
---

# T04: Polished M003 S04 capability docs and validators so decision readback blocker evidence remains explicitly no-promotion.

**Polished M003 S04 capability docs and validators so decision readback blocker evidence remains explicitly no-promotion.**

## What Happened

Updated the reader-facing runtime capability health report with a dedicated M003 S04 decision artifact readback section. The report now names `runtime-evidence/M003-S04-live-decision-artifact-readback.json`, records the actual T03 outcome as `fail-closed-blocker` / `blocked_preflight`, and states that the artifact is markdown-only blocker evidence with no capability status promotion.

Updated the data contracts document with a M003 S04 decision artifact readback evidence contract covering the evidence schema, redacted inputs, runtime version/build posture, selected surface/ref fields, hash/snippet/readback requirements, diagnostic phase names, cache-overlay posture, side-effect counters, capability-claim booleans, and approval immutability invariant.

Updated the machine-readable capability matrix with a top-level M003 S04 no-promotion evidence ledger and guardrail wording. Existing statuses remain unchanged: native issue/document/comment confirmation still comes only from M002 S04 live artifact flow; plugin UI, issue tabs, dashboard widgets, actions, tool registration, data providers, config/state/entities APIs, native approvals, Hermes, activity logs, events, and GSD-Pi remain fallback-only or unvalidated as before.

Updated the source-level capability boundary text in `runtimeCapabilities.ts` to distinguish M002 S04 native artifact proof from the current M003 S04 fail-closed markdown-only decision readback blocker.

Extended `scripts/validate_runtime_capabilities.py` to require the M003 S04 no-promotion ledger, validate the M003 S04 evidence invariants/zero unsupported side effects, and reject using M003 S04 blocker evidence as confirmed capability proof. Extended `scripts/test_validate_runtime_capabilities.py` with fixture coverage for the ledger requirement, overclaim rejection, and unsupported side-effect/capability-claim failures.

## Failure Modes

External dependencies for this task are filesystem reads/writes of docs, JSON, source, and evidence files plus subprocess verification through Python and npm. Missing or malformed capability/evidence JSON now fails `scripts/validate_runtime_capabilities.py`; missing M003 S04 ledger metadata fails the validator; docs that omit required M003 blocker wording fail the health-report check; overclaims using fail-closed M003 evidence for approvals/actions/UI/Hermes/GSD-Pi/activity/events fail negative tests and validator checks. Live Paperclip access was not retried in this task; the existing T03 artifact already records missing base URL/company/auth as a fail-closed preflight blocker before mutation.

## Load Profile

No runtime load-bearing path was added. The changed runtime capability validator is a one-shot static closeout check over small repository-local markdown/JSON/TypeScript files, so the first saturated resource at 10x expected use would be local subprocess/filesystem time during CI, protected by deterministic bounded parsing and no network calls.

## Negative Tests

Negative coverage now includes missing M003 S04 no-promotion ledger, attempts to confirm `approvals.native` from M003 S04 blocker evidence, unsupported M003 side effects such as `plugin_actions_invoked=1`, promoted capability claims such as `hermes=true`, and `native_approval_mutated=true`. Existing M003 S04 evidence validator tests also cover missing native readback, missing blocker reason, secret-like diagnostics, native approval/plugin action side effects, unsupported capability promotion, markdown fallback treated as live proof, and malformed JSON.

## Verification

Ran the full task-plan closeout sequence successfully: runtime capability validator, combined Python unittest suites for runtime capability and M003 S04 readback scripts, targeted plugin decision artifact tests, TypeScript typecheck, full plugin test suite, and standalone slice-level validation of the M003 S04 evidence artifact. All commands exited 0.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 scripts/validate_runtime_capabilities.py` | 0 | ✅ pass | 58ms |
| 2 | `python3 -m unittest scripts/test_validate_runtime_capabilities.py scripts/test_validate_m003_s04_live_decision_artifact_readback.py scripts/test_run_m003_s04_live_decision_artifact_readback.py` | 0 | ✅ pass | 293ms |
| 3 | `npm --prefix plugin-bos-light test -- tests/liveDecisionArtifactReadback.test.ts tests/decisionArtifact.test.ts tests/majorFlowDecision.test.ts` | 0 | ✅ pass | 1207ms |
| 4 | `npm --prefix plugin-bos-light run typecheck` | 0 | ✅ pass | 2256ms |
| 5 | `npm --prefix plugin-bos-light test` | 0 | ✅ pass | 1849ms |
| 6 | `python3 scripts/validate_m003_s04_live_decision_artifact_readback.py --evidence runtime-evidence/M003-S04-live-decision-artifact-readback.json --phase final` | 0 | ✅ pass | 59ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `docs/04_DATA_CONTRACTS.md`
- `plugin-bos-light/capabilities.paperclip-runtime.json`
- `plugin-bos-light/src/runtimeCapabilities.ts`
- `scripts/validate_runtime_capabilities.py`
- `scripts/test_validate_runtime_capabilities.py`
