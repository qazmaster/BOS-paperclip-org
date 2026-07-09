# S01: Sandbox and adapter preflight

**Goal:** Re-establish the live Paperclip sandbox safely, reproduce local BOS Light baseline, capture runtime/version/build, adapter registry facts, supported extension-boundary inventory, and approved mutation scope before any Hermes or GSD-Pi execution tests.
**Demo:** The next agent has a redacted sandbox fingerprint, local baseline proof, adapter readiness facts, supported extension-boundary inventory, and a go or no-go checklist for Hermes and GSD-Pi launch.

## Must-Haves

- Sandbox target and mutation scope are explicitly approved before any write.
- Health, admin session status, runtime version/build, tunnel status, and environment type are recorded without secrets.
- Local A1-A10 baseline and validators pass or failures are recorded before live testing.
- Adapter registry/config path for hermes_local and gsdpi_local is identified, or the exact blocker is recorded.
- Supported Paperclip extension boundaries are inventoried: company template/import, plugin APIs, agent config, adapter registry/custom adapter.
- Native issue/comment/document readback baseline is planned or performed only within approved sandbox scope.
- A concise launch checklist exists for S02 and S03.
- No Paperclip core patch, direct DB mutation, or internal module dependency is introduced.

## Proof Level

- This slice proves: Operational and integration preflight with local contract regression plus live sandbox read-only evidence; minimal write/readback only after explicit sandbox mutation approval.

## Integration Closure

Produces the runtime fingerprint, proof boundary, supported extension-boundary inventory, and adapter readiness facts consumed by S02 Hermes smoke and S03 GSD-Pi adapter smoke.

## Verification

- Creates redacted operational evidence for sandbox health, tunnel status, runtime version/build, adapter readiness, extension-boundary support, local baseline status, and go/no-go conditions.

## Tasks

- [x] **T01: Confirm sandbox scope and fingerprint runtime** `est:1h`
  Inspect current repo state and restart access to the Paperclip sandbox only after confirming target scope. Verify the local SSH tunnel or recreate it without exposing Paperclip publicly, then read health and admin session evidence.
  - Files: `PAPERCLIP_LIVE_VALIDATION_REPORT.md`
  - Verify: Read-only verification: health endpoint returns ok; browser costs page confirms sandbox admin session; no secrets printed or stored; no Paperclip core modifications.

- [x] **T02: Reproduce local BOS Light baseline** `est:1h`
  Reproduce the M001 local contract and fixture baseline before any live adapter work so failures can be attributed correctly.
  - Files: `PAPERCLIP_LIVE_VALIDATION_REPORT.md`
  - Verify: All local baseline commands pass, or failures are recorded with bounded stdout/stderr and no live capability promotions.

- [x] **T03: Inventory Paperclip extension boundaries** `est:1h`
  Inventory Paperclip supported extension boundaries in the sandbox before selecting any implementation path.
  - Files: `PAPERCLIP_LIVE_VALIDATION_REPORT.md`
  - Verify: Report names company-template, plugin, agent config, and adapter boundaries that are supported or unvalidated, and explicitly rejects core patches/private DB/internal module dependencies.

- [x] **T04: Inventory adapter registry and host prerequisites** `est:2h`
  Inventory the Paperclip runtime adapter mechanism for this sandbox and determine concrete launch requirements for hermes_local and gsdpi_local.
  - Files: `PAPERCLIP_LIVE_VALIDATION_REPORT.md`
  - Verify: Checklist names exact adapter registry/config path, hermes_local status, gsdpi_local registration path, GSD-Pi command support or blocker evidence, and confirms no Paperclip core patch is used.

- [x] **T05: Probe native artifact readback in sandbox** `est:1h`
  If sandbox mutation was approved, perform the smallest native artifact read/write probes needed by downstream slices. Prefer existing BOS-1 sandbox issue or a clearly named test issue. Do not test approvals yet unless separately approved.
  - Files: `PAPERCLIP_LIVE_VALIDATION_REPORT.md`, `plugin-bos-light/capabilities.paperclip-runtime.json`
  - Verify: Each probed surface has create action, readback result, runtime version/build, environment type, and object ID or a documented failure. Capability updates, if any, pass runtime capability validator. No direct DB/core-internal path is used.

- [x] **T06: Write adapter launch checklist** `est:45m`
  Finalize the S01 launch checklist and decide whether S02 Hermes smoke and S03 GSD-Pi adapter smoke are unblocked.
  - Files: `PAPERCLIP_LIVE_VALIDATION_REPORT.md`
  - Verify: Checklist includes all required fields and explicitly preserves proof boundaries: no live support claims without readback evidence and no Paperclip core dependency.

## Files Likely Touched

- PAPERCLIP_LIVE_VALIDATION_REPORT.md
- plugin-bos-light/capabilities.paperclip-runtime.json
