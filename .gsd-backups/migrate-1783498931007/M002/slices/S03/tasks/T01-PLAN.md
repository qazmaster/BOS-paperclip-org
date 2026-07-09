---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T01: Added the S03 GSD-Pi smoke evidence validator and tests.

Create standard-library S03 evidence validation for GSD-Pi adapter runtime proof. Define the JSON contract for environment and execute phases, including adapterType gsdpi_local, registry/readback, testEnvironment result, execute resultJson.bos or BosAdapterResult, side-effect counts, no-core-modification proof, and fail-closed blocker handling. Add tests covering missing result, wrong adapter, unredacted secrets, direct DB/core modification claims, and conservative blocker acceptance.

## Inputs

- `PAPERCLIP_LIVE_VALIDATION_REPORT.md`
- `scripts/validate_s02_hermes_smoke.py`
- `scripts/test_validate_s02_hermes_smoke.py`

## Expected Output

- `scripts/validate_s03_gsdpi_smoke.py`
- `scripts/test_validate_s03_gsdpi_smoke.py`

## Verification

python3 -m unittest scripts/test_validate_s03_gsdpi_smoke.py

## Observability Impact

Establishes fail-closed validation and redaction checks before any live adapter mutation.
