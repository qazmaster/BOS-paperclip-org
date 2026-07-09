---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T03: Evidence validator and fixture tests

Create scripts/validate_m005_s02_company_template_probe.py and scripts/test_validate_m005_s02_company_template_probe.py following the S01 validator pattern. The validator accepts --evidence and --allow-blocker flags, enforces schema_version m005-s02-company-template/v1, validates redaction, rejects unsupported paths/core modification, checks blocker artifacts for precise codes and zero capability promotions, and validates passing proofs for import success or direct-creation fallback with 7 divisions present and routing rules active. The test fixture suite covers: passing import proof, passing direct-creation proof, fail-closed-blocker with missing auth, fail-closed-blocker with unsupported endpoint, partial import, unredacted secrets, malformed timestamp, direct DB mutation flags, and wrong schema version.

## Inputs

- `scripts/validate_m005_s01_hermes_xiaomi_probe.py`
- `scripts/test_validate_m005_s01_hermes_xiaomi_probe.py`
- `runtime-evidence/M005-S02-company-template-probe.json`

## Expected Output

- `scripts/validate_m005_s02_company_template_probe.py`
- `scripts/test_validate_m005_s02_company_template_probe.py`

## Verification

python3 scripts/test_validate_m005_s02_company_template_probe.py
