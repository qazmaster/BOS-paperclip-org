# Hermes BOS agents smoke — Research

**Date:** 2026-05-28

## Summary
S02 is blocked by environment provisioning, not by BOS Light logic. `docs/08_RUNTIME_CAPABILITY_HEALTH.md` and `PAPERCLIP_LIVE_VALIDATION_REPORT.md` show `hermes_local` is registered in Paperclip, but the current Paperclip container does not have `hermes` on PATH and `hermes_local/test-environment` fails with `hermes_cli_not_found`. No runtime capability should be promoted from the current evidence; the slice first needs Hermes CLI/auth inside the container, then one bounded BOS smoke run with a real `resultJson.bos` payload.

## Recommendation
Treat S02 as a runtime-provisioning + smoke-probe slice. First prove `hermes_local` testEnvironment passes (or returns a bounded warning-only posture), then create one short-lived BOS test agent through Paperclip agent config using `adapterType: hermes_local`, no terminal toolset, short timeout/grace, and no approvals. Capture agent readback, wake behavior, and `resultJson.bos` as the evidence boundary; do not use in-memory fixtures or plugin-local emulation as proof of live support.

## Implementation Landscape

### Key Files
- `docs/08_RUNTIME_CAPABILITY_HEALTH.md` — reader-facing S02 posture; lists `plugin.runtime.version_build`, `plugin.runtime.registration`, and `registration.tools` as unvalidated, and records the `hermes_local` testEnvironment failure.
- `PAPERCLIP_LIVE_VALIDATION_REPORT.md` — S01 launch verdict, exact `hermes_cli_not_found` blocker, safe smoke definition, and expected `resultJson.bos` fields for future adapter runs.
- `docs/07_RISKS_AND_SPIKES.md` — spike checklist C2/C7 and polling fallback rules; reinforces that event-driven claims are not allowed yet.
- `plugin-bos-light/src/worker.ts` and `plugin-bos-light/capabilities.paperclip-runtime.json` — show the plugin’s draft-only host seams and the surfaces that still remain unvalidated.
- `scripts/probe_paperclip_runtime.py` — conservative probe that should remain the source of truth for `unvalidated` posture.

### Build Order
1. Install/authenticate Hermes CLI inside the Paperclip container and rerun `hermes_local` testEnvironment.
2. Create a single safe BOS agent via the Paperclip agent API with `adapterType: hermes_local`, short timeout/grace, and no terminal toolset/approvals.
3. Run the harmless BOS-2 summarize prompt and collect `resultJson.bos`, wake policy behavior, and agent readback.
4. Only then decide whether `plugin.runtime.version_build` / `registration.tools` can move from unvalidated.

### Verification Approach
- `POST /api/companies/{companyId}/adapters/hermes_local/test-environment`
- agent create/readback through Paperclip UI/API with `adapterType: hermes_local`
- inspect run output/logs for `resultJson.bos` containing `schemaVersion`, `runId`, `issueId`, `division`, `role`, `status`, and optional artifacts / `nextRecommendedAgentId`
- confirm no duplicate wake behavior and no approvals created

## Constraints
- Paperclip core stays read-only.
- Secrets must be collected via secure secret collection or Paperclip secret mechanisms.
- Do not treat fixture or in-memory adapter success as live proof.

## Common Pitfalls
- A registered adapter is not the same as a working runtime environment; `testEnvironment` must pass in the sandbox container.
- Agent creation can succeed while Hermes execution still fails; require an actual smoke run and result payload.
- Duplicate wake behavior would invalidate the smoke even if the run completes.

## Open Risks
- `hermes_local` is visible, but CLI/auth provisioning is still missing in the current container.
- No live Paperclip version/build evidence has been captured in the repo, so capability promotion must remain conservative.

## Skills Discovered
| Technology | Skill | Status |
|---|---|---|
| Browser verification | agent-browser | available |
| Runtime observability / health | observability | available |
| Docs handoff | write-docs | available |