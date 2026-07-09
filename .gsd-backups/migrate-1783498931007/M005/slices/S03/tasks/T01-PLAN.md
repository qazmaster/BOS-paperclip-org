---
estimated_steps: 7
estimated_files: 1
skills_used: []
---

# T01: Create M005 S03 resource intake probe runner

Create scripts/run_m005_s03_resource_intake_probe.py following the proven S01/S02 bounded-probe pattern. The runner:
1. Discovers required credentials from environment variables and company-template/bos-company-template.json (bos_config.company_token_budget_ref).
2. Performs a preflight auth gate: if Paperclip base URL or API key is missing, skips all state-changing Paperclip API calls.
3. If auth is present, attempts a bounded Paperclip API call (list issues or health check) to verify connectivity, then optionally creates a resource-request comment on an existing issue or a new escalation issue using confirmed native artifact surfaces (issues.native, comments.native, documents.native).
4. Produces a unified evidence artifact with schema_version m005-s03-resource-intake/v1, precise blocker_codes, missing_resources list, request_artifacts list, and side_effect_counters.
5. Uses the same HttpClient, redaction, and evidence schema patterns as S01/S02.

Done when: the probe runner file exists, is executable, and contains all four resource categories with preflight gating.

## Inputs

- `scripts/run_m005_s01_hermes_xiaomi_probe.py`
- `scripts/run_m005_s02_company_template_probe.py`
- `company-template/bos-company-template.json`
- `plugin-bos-light/src/livePaperclipAdapter.ts`

## Expected Output

- `scripts/run_m005_s03_resource_intake_probe.py`

## Verification

python3 -m py_compile scripts/run_m005_s03_resource_intake_probe.py
