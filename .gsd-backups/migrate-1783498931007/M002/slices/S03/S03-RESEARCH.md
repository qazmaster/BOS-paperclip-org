# GSD-Pi local adapter smoke — Research

**Date:** 2026-05-28

## Summary
S03 has no implementation yet: the repository contains only blocker notes and runtime-health references for `gsdpi_local`, while `PAPERCLIP_LIVE_VALIDATION_REPORT.md` says Paperclip does not know the adapter and the container has no `gsd` command. The slice should therefore start by creating a standalone external adapter package and proving its `testEnvironment`/`execute` contract before any Div4 smoke run is attempted.

## Recommendation
Build `gsdpi_local` as an external adapter package, not as a Paperclip core patch or a BOS plugin subprocess wrapper. The adapter should expose `createServerAdapter()`, `execute`, and `testEnvironment` (plus optional session/UI codec pieces if needed), be installed through the external adapter or local-path plugin mechanism, and point at a real `gsd` / `@opengsd/gsd-pi` command path. Only after that should the slice run one harmless headless Div4 validation job and capture structured `BosAdapterResult` evidence.

## Implementation Landscape

### Key Files
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md` — current runtime posture; records `gsdpi_local` as unregistered, `gsd` as missing, and the follow-up path for S03.
- `PAPERCLIP_LIVE_VALIDATION_REPORT.md` — exact S01 verdict, `gsdpi_local` prerequisites, and the expected smoke shape (`testEnvironment` followed by a bounded no-source-write validation command).
- `docs/07_RISKS_AND_SPIKES.md` — risk posture for C7 and fallback-only surfaces; reinforces that event/state assumptions must stay conservative.
- `plugin-bos-light/capabilities.paperclip-runtime.json` — the current machine-readable contract for which runtime surfaces remain unvalidated or fallback-only.
- `plugin-bos-light/src/paperclipAdapter.ts`, `plugin-bos-light/src/persistence.ts`, `plugin-bos-light/src/evalGateEvidence.ts`, `plugin-bos-light/src/circuitBreakerFlow.ts` — useful as downstream consumers/examples for bounded evidence envelopes, but not as proof of live adapter support.
- `scripts/probe_paperclip_runtime.py` — keep using this as the conservative report generator; do not turn fixture status into live support.

### Build Order
1. Create the `gsdpi_local` adapter package skeleton with the Paperclip external-adapter contract (`createServerAdapter`, `execute`, `testEnvironment`).
2. Install or bundle the real `gsd` / `@opengsd/gsd-pi` command path inside the Paperclip execution environment.
3. Register the adapter through the supported external-adapter or local-path plugin mechanism without touching Paperclip core.
4. Run `testEnvironment`, then a bounded headless Div4 validation command, and only then capture `BosAdapterResult` evidence.

### Verification Approach
- adapter registration/model lookup for `gsdpi_local`
- `testEnvironment` must pass or fail closed with a bounded diagnostic
- execute one no-source-write command such as `gsd --version` or a bounded headless query that returns structured JSON/log output
- confirm the returned `resultJson.bos` / `BosAdapterResult` shape is preserved and that no Paperclip core files or direct DB writes were required

## Constraints
- Paperclip core remains read-only.
- Secrets, if any, must be collected through secure secret collection or Paperclip secret/provider mechanisms.
- Do not claim support from local fixtures or the in-memory adapter seams used elsewhere in BOS Light.
- The current container does not provide a `gsd` command, so any smoke must first provision the executable or bundle it with the adapter.

## Common Pitfalls
- An adapter package can build successfully yet remain invisible to Paperclip until the external registration path is correct.
- `testEnvironment` can pass while the headless command path still fails; both must be proven.
- A fixture or fallback result is not the same as live `BosAdapterResult` support.

## Open Risks
- There is no existing `gsdpi_local` package in the repo, so the first implementation pass must choose a package location and registration strategy.
- The exact command path / adapter registration shape may need to be aligned to the current Paperclip external-adapter contract before the smoke can run.

## Skills Discovered
| Technology | Skill | Status |
|---|---|---|
| Browser verification | agent-browser | available |
| Runtime observability / health | observability | available |
| API/schema contract design | api-design | available |