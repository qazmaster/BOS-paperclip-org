# 12 - GSD-Pi Local Adapter Smoke

This report is the reader-facing S03 evidence surface for the proposed `gsdpi_local` Paperclip external adapter.

## Environment Gate Result

| Field | Value |
|---|---|
| Phase | `environment` |
| Artifact | `runtime-evidence/M002-S03-gsdpi-environment.json` |
| Artifact type | `smoke-evidence` |
| Adapter | `gsdpi_local` |
| Runtime command | `gsd` |
| Runtime version | `1.0.2` |
| Registration status | not registered yet |
| Core modification | None; the probe used Paperclip HTTP readback plus sandbox/container package administration only. |

S03 installed the public `@opengsd/gsd-pi@1.0.2` package inside the dedicated Paperclip sandbox container. `gsd --version` returns `1.0.2`. No secrets were required or collected, and no Paperclip core source, package code, monkey patch, private module import, or database row was modified.

## Registration Gate Result

| Field | Value |
|---|---|
| Phase | `registration` |
| Artifact | `runtime-evidence/M002-S03-gsdpi-registration.json` |
| Artifact type | `fail-closed-blocker` |
| Adapter | `gsdpi_local` |
| Registry readback | not registered |
| `testEnvironment` | `422 Unknown adapter type: gsdpi_local` |
| Core modification | None; the probe stopped at supported HTTP adapter registry/models/testEnvironment readback. |

T04 attempted only the documented external-adapter/plugin boundary and supported Paperclip HTTP readback surfaces. The local adapter package still exists at `adapters/gsdpi-local` and exports `createServerAdapter`, but the live Paperclip runtime does not currently load it. `GET /api/adapters` was not usable from this autonomous session without board access, `GET /api/companies/{companyId}/adapters/gsdpi_local/models` was not authorized, and `POST /api/companies/{companyId}/adapters/gsdpi_local/test-environment` returned `422 Unknown adapter type: gsdpi_local`.

No `paperclipai plugin install`, direct registry mutation, Paperclip core source patch, runtime monkey patch, private module import, or direct database write was performed. Host CLI install/list/inspect access was unavailable in this autonomous session, so the gate failed closed rather than forcing registration through unsupported internals.

## Execute Gate Result

| Field | Value |
|---|---|
| Phase | `execute` |
| Artifact | `runtime-evidence/M002-S03-gsdpi-smoke.json` |
| Artifact type | `fail-closed-blocker` |
| Adapter | `gsdpi_local` |
| Agent/run started | no |
| Wake delta | `0` (not attempted) |
| Approvals created | `0` |
| Source writes | `0 created`, `0 modified`, `0 deleted` |
| Core modification | None; execution stopped before agent creation because registration remained blocked. |

T05 did not create a Paperclip agent or run. The prerequisite registration artifact is still fail-closed: supported `testEnvironment` readback returns `422 Unknown adapter type: gsdpi_local`, registry readback is absent, and no passing `gsdpi_local` adapter registration exists. Starting a bounded Div4 quality job without that prerequisite would simulate success rather than prove the Paperclip external-adapter boundary, so the smoke artifact records `gsdpi_local_execution_not_attempted_registration_blocked` and preserves zero side-effect counts.

## Current Boundary

This proves only that the container can run the GSD-Pi CLI prerequisite, that the standalone adapter candidate exists locally, and that S03 stops safely before execution when Paperclip cannot load `gsdpi_local` through supported boundaries. It does not prove Paperclip adapter registration, `testEnvironment` routing through `gsdpi_local`, agent execution, or BosAdapterResult readback.

A future registration retry must install the external adapter through Paperclip's documented plugin/external-adapter mechanism with operator-authorized host or admin access, then require registry readback and a passing `testEnvironment` before any execution smoke. If that requires a Paperclip core patch or direct DB mutation, fail closed and keep runtime capability posture unvalidated.

## Expected Execute Proof Shape

A future passing execution artifact must include one bounded no-source-write run with:

- `adapterType: gsdpi_local`
- one wake and no duplicate wake side effects
- zero approvals created
- zero source file writes
- `resultJson.bosAdapterResult` with `schemaVersion`, `runId`, `adapterType`, `status`, and Div4 gate evidence
- explicit no-core-modification proof

Until that exists, downstream slices must not assume Div4 quality automation is available through Paperclip.
