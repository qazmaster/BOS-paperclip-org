---
id: S02
parent: M002
milestone: M002
provides:
  - Hermes environment gate passed with CLI/provider readiness via encrypted Paperclip secret refs.
  - Latest Hermes agent smoke blocker: run 391841b8-b878-4fa1-acb2-f0b30520924f failed before resultJson.bos due to Missing Authentication header.
  - Conservative docs/matrix posture and validator support for final no-go closure.
requires:
  []
affects:
  - S04 must not assume Hermes-backed BOS agents are available; it can consume only the no-go blocker and resultJson.bos expected shape from docs.
  - S06 must keep Hermes runtime execution in the remaining gap ledger unless Paperclip adapter/core secret materialization is fixed.
key_files:
  - runtime-evidence/M002-S02-hermes-environment.json
  - runtime-evidence/M002-S02-hermes-smoke.json
  - docs/11_HERMES_BOS_AGENTS_SMOKE.md
  - docs/08_RUNTIME_CAPABILITY_HEALTH.md
  - PAPERCLIP_LIVE_VALIDATION_REPORT.md
  - plugin-bos-light/capabilities.paperclip-runtime.json
  - scripts/run_s02_hermes_smoke.py
  - scripts/validate_s02_hermes_smoke.py
  - scripts/test_validate_s02_hermes_smoke.py
key_decisions:
  - Fail closed rather than inject plaintext API keys or patch Paperclip core.
  - Treat S02 as completed with a blocker/no-go outcome because all planned evidence/docs tasks are done but the live smoke proof is not passing.
  - Keep runtime capability matrix conservative with no confirmed capability promotions from S02.
patterns_established:
  - Use fail-closed evidence when live Paperclip runtime proof is incomplete.
  - Validate conservative docs/matrix closure separately from passing smoke proof.
  - Record no-core-modification and side-effect counts as first-class evidence fields.
observability_surfaces:
  - `runtime-evidence/M002-S02-hermes-environment.json` records environment gate pass details.
  - `runtime-evidence/M002-S02-hermes-smoke.json` records latest fail-closed run IDs, wake/approval counts, blocker reason, redacted agent config/readback, run resultJson, and no-core-modification proof.
  - `docs/11_HERMES_BOS_AGENTS_SMOKE.md` gives the reader-facing diagnostic trail and current verdict.
  - `scripts/validate_s02_hermes_smoke.py --phase final` verifies docs/matrix do not overclaim from blocker evidence.
drill_down_paths:
  - .gsd/milestones/M002/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M002/slices/S02/tasks/T02-SUMMARY.md
  - .gsd/milestones/M002/slices/S02/tasks/T03-SUMMARY.md
  - .gsd/milestones/M002/slices/S02/tasks/T04-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-05-29T01:21:21.640Z
blocker_discovered: false
---

# S02: Hermes BOS agents smoke

**S02 produced passing Hermes environment proof and a verified fail-closed no-go for Hermes agent execution due to execution-time secret materialization.**

## What Happened

S02 established the Hermes evidence contract, passed the live Paperclip Hermes environment gate, remediated the first live execution blocker in `/paperclip/.hermes`, and reran a bounded Paperclip agent smoke using only supported HTTP/browser-authenticated/container-admin boundaries and encrypted Paperclip secret refs. The smoke runner was corrected for current heartbeat-run endpoints and agent env persistence. The final live run reached Hermes but failed because the provider request lacked an authentication header: Paperclip persisted the agent's encrypted secret refs, but the installed Hermes adapter path builds the subprocess env from the persisted agent config rather than resolved runtime config. The slice therefore closes as honest fail-closed evidence and conservative documentation/matrix posture, not as runtime capability promotion.

## Verification

Fresh verification after final edits: py_compile passed for run_s02_hermes_smoke.py, validate_s02_hermes_smoke.py, and validate_runtime_capabilities.py; unittest ran 15 S02 validator tests OK; S02 final validator passed; S02 agent-smoke validator with --allow-blocker passed; runtime capability validator passed; secret scan over touched evidence/docs/matrix reported secret_like_matches=0.

## Requirements Advanced

- R011 — advanced by proving supported-boundary/no-core-modification evidence and fail-closed behavior, but not validated as passing Hermes execution proof.

## Requirements Validated

None.

## New Requirements Surfaced

- Paperclip hermes_local execution must materialize resolved encrypted secret-ref env bindings into the Hermes subprocess without exposing provider keys inline.

## Requirements Invalidated or Re-scoped

None.

## Operational Readiness

None.

## Deviations

The original demo target was a passing Hermes-backed BOS smoke returning resultJson.bos. The slice instead produced passing environment proof and a verified fail-closed no-go because Hermes execution did not receive provider authentication from encrypted secret refs. The plan's fail-closed clause was applied; no core patch, direct DB mutation, or inline key workaround was used.

## Known Limitations

No passing Hermes agent smoke proof exists. The latest run failed before resultJson.bos with provider 401 Missing Authentication header. `runtime-evidence/M002-S02-hermes-smoke.json` validates only as a blocker/final conservative artifact, not as passing smoke evidence.

## Follow-ups

Fix Paperclip's supported Hermes execution path so resolved encrypted secret-ref env values are passed into the Hermes subprocess without inline plaintext keys, then rerun one bounded hermes_local smoke. Until then, do not use S02 as dependency proof for live Hermes agent execution.

## Files Created/Modified

- `PAPERCLIP_LIVE_VALIDATION_REPORT.md` — Reader-facing live validation report updated with S02 environment pass, T03 no-go, no-core closure audit, and downstream no-go posture.
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md` — Runtime capability health report updated to explain the Hermes secret-materialization blocker and prohibit treating S02 as passing execution support.
- `docs/11_HERMES_BOS_AGENTS_SMOKE.md` — S02 smoke report updated with environment gate, remediated filesystem blocker, latest run IDs, provider auth blocker, and current verdict.
- `plugin-bos-light/capabilities.paperclip-runtime.json` — Capability matrix kept conservative and updated to clarify why S02 diagnostics do not promote runtime version/build, plugin registration, or tool registration.
- `scripts/run_s02_hermes_smoke.py` — Smoke runner updated to use current heartbeat-run endpoints, delayed readback, nested JSON parsing, and agent adapter env persistence through Paperclip secret refs.
- `scripts/validate_s02_hermes_smoke.py` — S02 validator updated with final-docs phase and conservative blocker closure checks.
- `scripts/test_validate_s02_hermes_smoke.py` — Validator test fixtures expanded to cover the final-docs blocker path.
- `runtime-evidence/M002-S02-hermes-smoke.json` — Canonical latest fail-closed agent-smoke evidence artifact.
