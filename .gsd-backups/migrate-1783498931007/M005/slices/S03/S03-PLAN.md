# S03: Resource Intake + Pre-Mission Credential Checklist

**Goal:** Build a bounded, fail-closed resource-intake probe that detects missing pre-mission credentials (Paperclip API key + base URL, company token budget, git access for aipay.kz, Xiaomi API key + base URL) and creates visible resource-request artifacts in Paperclip before any mission starts. Follow the exact S01/S02 bounded-probe pattern with unified evidence schema, validator, test fixtures, and capability-matrix append-only update.
**Demo:** Before mission execution, the system detects missing credentials (Paperclip API key, token budget, git access, Xiaomi API key) and creates visible requests in Paperclip for the user to fulfill. Mission does not start until checklist passes.

## Must-Haves

- Probe runner exists and compiles (T01)
- Live probe artifact exists with schema_version m005-s03-resource-intake/v1 and zero side effects (T02)
- Validator and 12 test fixtures exist, all passing (T03)
- Validator accepts live evidence with --allow-blocker (exit 0), capability matrix validates, and S03 evidence summary exists (T04)
- No capability promotions from blocker evidence (MEM058 compliance)
- R021 advanced: probe infrastructure complete for detecting missing resources and requesting them via Paperclip UI

## Proof Level

- This slice proves: operational

## Integration Closure

Consumes: S01 plugin registration status, S02 company template import evidence and bos_config. Produces: Resource intake checklist (missing_resources, request_artifacts) for S04 git integration and S05 E2E mission cycle. Downstream slices can use the precise blocker_codes to know exactly which credentials are missing before attempting mission execution.

## Verification

- Runtime signals: structured JSON evidence artifacts at runtime-evidence/M005-S03-resource-intake-probe.json with missing_resources, blocker_codes, and side_effect_counters
- Inspection surfaces: validator CLI and test fixture suite provide machine-readable closeout
- Failure visibility: missing credentials are enumerated explicitly; any unexpected side effects are counted and validated

## Tasks

- [x] **T01: Create M005 S03 resource intake probe runner** `est:1h`
  Create scripts/run_m005_s03_resource_intake_probe.py following the proven S01/S02 bounded-probe pattern. The runner:
  1. Discovers required credentials from environment variables and company-template/bos-company-template.json (bos_config.company_token_budget_ref).
  2. Performs a preflight auth gate: if Paperclip base URL or API key is missing, skips all state-changing Paperclip API calls.
  3. If auth is present, attempts a bounded Paperclip API call (list issues or health check) to verify connectivity, then optionally creates a resource-request comment on an existing issue or a new escalation issue using confirmed native artifact surfaces (issues.native, comments.native, documents.native).
  4. Produces a unified evidence artifact with schema_version m005-s03-resource-intake/v1, precise blocker_codes, missing_resources list, request_artifacts list, and side_effect_counters.
  5. Uses the same HttpClient, redaction, and evidence schema patterns as S01/S02.
  - Files: `scripts/run_m005_s03_resource_intake_probe.py`
  - Verify: python3 -m py_compile scripts/run_m005_s03_resource_intake_probe.py

- [x] **T02: Execute live S03 resource intake probe** `est:15m`
  Run the probe in the current environment to generate the live evidence artifact. In the current env, PAPERCLIP_API_KEY is present but PAPERCLIP_BASE_URL, XIAOMI_API_KEY, XIAOMI_BASE_URL, and git credentials are absent. The probe is expected to produce a valid fail-closed-blocker artifact with precise blocker codes (missing_paperclip_base_url, missing_xiaomi_api_key, missing_xiaomi_base_url, missing_git_credentials, etc.) and zero side effects. This establishes the S03 evidence baseline.
  - Verify: python3 scripts/run_m005_s03_resource_intake_probe.py

- [x] **T03: Create S03 validator and test fixture suite** `est:1h 15m`
  Create scripts/validate_m005_s03_resource_intake_probe.py and scripts/test_validate_m005_s03_resource_intake_probe.py following the S01/S02 validator/test patterns.
  - Files: `scripts/validate_m005_s03_resource_intake_probe.py`, `scripts/test_validate_m005_s03_resource_intake_probe.py`
  - Verify: python3 -m unittest scripts/test_validate_m005_s03_resource_intake_probe.py -v

- [x] **T04: Validate live evidence, update capability matrix, and generate S03 evidence summary** `est:30m`
  Run the S03 validator against the live probe evidence with --allow-blocker (expected exit 0). Then update plugin-bos-light/capabilities.paperclip-runtime.json append-only: update the config.api evidence_source and blocker_text to reference M005-S03 evidence, keeping status as fallback-only (no promotions per MEM058). Validate the matrix with scripts/validate_runtime_capabilities.py. Finally, generate runtime-evidence/M005-S03-evidence-summary.json combining S01+S02+S03 results with posture, guardrails, and no-promotion flags.
  - Files: `plugin-bos-light/capabilities.paperclip-runtime.json`, `runtime-evidence/M005-S03-evidence-summary.json`
  - Verify: python3 scripts/validate_m005_s03_resource_intake_probe.py --evidence runtime-evidence/M005-S03-resource-intake-probe.json --allow-blocker && python3 scripts/validate_runtime_capabilities.py

## Files Likely Touched

- scripts/run_m005_s03_resource_intake_probe.py
- scripts/validate_m005_s03_resource_intake_probe.py
- scripts/test_validate_m005_s03_resource_intake_probe.py
- plugin-bos-light/capabilities.paperclip-runtime.json
- runtime-evidence/M005-S03-evidence-summary.json
