---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T02: Execute live S03 resource intake probe

Run the probe in the current environment to generate the live evidence artifact. In the current env, PAPERCLIP_API_KEY is present but PAPERCLIP_BASE_URL, XIAOMI_API_KEY, XIAOMI_BASE_URL, and git credentials are absent. The probe is expected to produce a valid fail-closed-blocker artifact with precise blocker codes (missing_paperclip_base_url, missing_xiaomi_api_key, missing_xiaomi_base_url, missing_git_credentials, etc.) and zero side effects. This establishes the S03 evidence baseline.

## Inputs

- `scripts/run_m005_s03_resource_intake_probe.py`
- `company-template/bos-company-template.json`

## Expected Output

- `runtime-evidence/M005-S03-resource-intake-probe.json`

## Verification

python3 scripts/run_m005_s03_resource_intake_probe.py
