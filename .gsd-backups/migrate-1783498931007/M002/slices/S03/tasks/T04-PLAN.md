---
estimated_steps: 1
estimated_files: 3
skills_used: []
---

# T04: Register gsdpi_local through supported boundary

Attempt to register or expose gsdpi_local to Paperclip through documented external adapter/plugin configuration only. Record exact supported boundary used, adapter registry readback, and whether testEnvironment can call the adapter. If Paperclip requires core code edits or direct database mutation to load the adapter, stop and record a fail-closed blocker rather than modifying Paperclip.

## Inputs

- `adapters/gsdpi-local/package.json`
- `adapters/gsdpi-local/src/index.ts`
- `scripts/validate_s03_gsdpi_smoke.py`

## Expected Output

- `runtime-evidence/M002-S03-gsdpi-registration.json`

## Verification

python3 scripts/validate_s03_gsdpi_smoke.py --phase registration --evidence runtime-evidence/M002-S03-gsdpi-registration.json --allow-blocker

## Observability Impact

Records registry/testEnvironment status and unsupported-boundary blockers without forcing private Paperclip internals.
