# S03: Resource Intake + Pre-Mission Credential Checklist — UAT

**Milestone:** M005
**Written:** 2026-05-31T19:55:15.866Z

# S03 UAT: Resource Intake + Pre-Mission Credential Checklist

- UAT required: no

This slice provides operational infrastructure (probe, validator, test fixtures) rather than user-facing browser behavior. Acceptance is verified by automated test and validator execution.

## Preconditions
- Python 3 available in environment
- Company template bos-company-template.json present with token budget reference
- Environment may or may not have PAPERCLIP_API_KEY, PAPERCLIP_BASE_URL, XIAOMI_API_KEY, XIAOMI_BASE_URL, git credentials

## Verification Steps
1. Run probe: `python3 scripts/run_m005_s03_resource_intake_probe.py`
2. Inspect artifact: `cat runtime-evidence/M005-S03-resource-intake-probe.json`
3. Run validator: `python3 scripts/validate_m005_s03_resource_intake_probe.py --evidence runtime-evidence/M005-S03-resource-intake-probe.json --allow-blocker`
4. Run test suite: `python3 -m unittest scripts/test_validate_m005_s03_resource_intake_probe.py -v`

## Expected Outcomes
- Probe produces valid JSON artifact with schema_version m005-s03-resource-intake/v1
- When credentials missing: artifact_type is fail-closed-blocker, passing=false, blocker_codes enumerate exact missing resources, side_effect_counters all zero
- When credentials present: artifact_type is passing-proof or partial, request_artifacts contain created Paperclip references, side_effect_counters reflect bounded mutations only
- Validator exits 0 with --allow-blocker for blocker artifacts, exits non-zero without flag
- All 12 unit tests pass

## Edge Cases
- Empty-string API key is treated as missing (bool() check)
- Missing Paperclip base URL triggers preflight gate — zero API calls made even if API key present
- Git probe defaults to env-presence check when git binary or URL unavailable
- Company token budget absence is detected independently of other credentials
