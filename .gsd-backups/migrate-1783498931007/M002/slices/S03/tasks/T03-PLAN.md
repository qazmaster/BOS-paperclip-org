---
estimated_steps: 1
estimated_files: 3
skills_used: []
---

# T03: Passed the S03 GSD-Pi environment gate by installing and verifying `gsd` in the Paperclip sandbox container.

Use supported sandbox/container administration to establish whether the Paperclip execution environment has a usable GSD-Pi command path. Prefer installed `gsd` or `pi` availability checks and package-managed installation only if safe and non-secret. Produce environment evidence with command version, node/npm/pnpm facts, adapter registry facts, and explicit no-core/no-DB proof. If installation or command availability requires unsupported mutation, fail closed.

## Inputs

- `PAPERCLIP_LIVE_VALIDATION_REPORT.md`
- `scripts/validate_s03_gsdpi_smoke.py`

## Expected Output

- `scripts/run_s03_gsdpi_smoke.py`
- `runtime-evidence/M002-S03-gsdpi-environment.json`
- `docs/12_GSDPI_LOCAL_ADAPTER_SMOKE.md`

## Verification

python3 scripts/validate_s03_gsdpi_smoke.py --phase environment --evidence runtime-evidence/M002-S03-gsdpi-environment.json --allow-blocker

## Observability Impact

Captures command availability, version output, registry status, blocker reason, and no-secret/no-core proof for a cold reader.
