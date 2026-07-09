---
estimated_steps: 1
estimated_files: 4
skills_used: []
---

# T03: Probe Native Artifact Mirror Routes

Probe only safe supported native artifact mirror routes associated with the confirmed mission issue. Use read-only probes first; only write comments or documents if a supported route exists and the S02 confirmation scope included it. Otherwise produce a fallback artifact route report. The validator must fail if unsupported comment or document routes are claimed as working.

## Inputs

- `runtime-evidence/M011-S03-reconciled-capability-gate.json`

## Expected Output

- `runtime-evidence/M012-S02-artifact-route-probe.json`
- `runtime-evidence/M012-S02-artifact-route-probe.md`

## Verification

node scripts/validate_m012_s02_artifact_route_probe.js

## Observability Impact

Records route support, unsupported route blockers, write count, readback status, and capability promotion status.
