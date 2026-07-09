---
estimated_steps: 21
estimated_files: 2
skills_used: []
---

# T03: Create S03 validator and test fixture suite

Create scripts/validate_m005_s03_resource_intake_probe.py and scripts/test_validate_m005_s03_resource_intake_probe.py following the S01/S02 validator/test patterns.

Validator must:
- Enforce schema_version m005-s03-resource-intake/v1
- Validate redaction (no plaintext secrets)
- Reject unsupported paths, core modification, private imports, direct DB mutation
- Check blocker artifacts for precise blocker_codes and zero capability_promotions
- Accept passing proofs only when all 4 resource categories are present with visible request_artifacts (issue/document/comment readback confirmed)
- Include --allow-blocker CLI flag and --write-audit closeout

Test fixtures must cover:
1. Passing checklist (all resources present, request artifacts confirmed)
2. Fail-closed blocker (missing auth)
3. Fail-closed blocker (missing Xiaomi)
4. Fail-closed blocker (missing git)
5. Partial checklist (some resources present)
6. Unredacted secrets in diagnostics
7. Malformed timestamp
8. Unsupported paths used
9. Wrong schema version
10. Capability promotion in blocker artifact
11. CLI write-audit closeout
12. Zero side effects in blocker artifact

## Inputs

- `scripts/validate_m005_s01_hermes_xiaomi_probe.py`
- `scripts/validate_m005_s02_company_template_probe.py`
- `scripts/test_validate_m005_s01_hermes_xiaomi_probe.py`
- `scripts/test_validate_m005_s02_company_template_probe.py`
- `runtime-evidence/M005-S03-resource-intake-probe.json`

## Expected Output

- `scripts/validate_m005_s03_resource_intake_probe.py`
- `scripts/test_validate_m005_s03_resource_intake_probe.py`

## Verification

python3 -m unittest scripts/test_validate_m005_s03_resource_intake_probe.py -v
