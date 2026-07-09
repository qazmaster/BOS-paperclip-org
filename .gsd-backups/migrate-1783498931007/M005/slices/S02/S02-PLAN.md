# S02: Company Template Import + Agent Profile Activation

**Goal:** BOS Light v1.4.1 company template is imported into Paperclip (or directly created via API fallback), 7 divisions are visible with AGENTS.md profiles attached, and routing rules are active. Evidence artifacts validate with zero side effects and capability matrix is updated append-only.
**Demo:** The v1.4.1 company template is imported into Paperclip, 7 divisions are visible in the org chart, and each division's AGENTS.md profile is parsed and active. Routing rules route a test task to the correct division.

## Must-Haves

- Local validation passes (exit 0). Probe produces runtime-evidence/M005-S02-company-template-probe.json with valid schema_version m005-s02-company-template/v1, precise blocker codes if fail-closed, zero side effects, and no capability promotions. Validator passes with --allow-blocker (exit 0). Capability matrix updated append-only for company_template.import_export and agents.syntax; no prior rows overwritten. Evidence summary generated. All test fixtures pass.

## Proof Level

- This slice proves: operational

## Integration Closure

Consumes S01 context: same Paperclip base_url/api_key env requirements, same redaction patterns, same HttpClient boundary. Produces company template import evidence and agent activation proof for S03 resource intake (needs division routing active) and S04 git integration (needs Div4.Production agent present) to consume. Fail-closed blocker artifacts are valid S02 outcomes and do not block downstream slices because the direct agent creation fallback preserves operational continuity.

## Verification

- runtime-evidence/M005-S02-company-template-probe.json captures import_attempt (surface, status, blocker_codes, side_effect_counters), agent_activation (divisions_present, divisions_missing, agents_created, profile_attached), routing_validation (rules_active, test_route_result), and runtime (version, build). plugin-bos-light/capabilities.paperclip-runtime.json records append-only status rows with evidence_source. runtime-evidence/M005-S02-evidence-summary.json provides single-file posture readout for downstream slices.

## Tasks

- [x] **T01: Company template local validation** `est:20m`
  Run the existing standard-library-only validator to confirm the repository-local BOS Light package is intact before any live Paperclip probe. The validator checks 7 divisions, reporting lines, routing rules, rituals, support assets, external-IO security snippets, and AGENTS.md profile existence. Capture the result as a small local-validation evidence artifact for audit trail.
  - Files: `scripts/validate_company_template.py`, `company-template/bos-company-template.json`, `runtime-evidence/M005-S02-local-validation.json`
  - Verify: python3 scripts/validate_company_template.py

- [x] **T02: Live company template import probe runner** `est:1h 30m`
  Create and execute scripts/run_m005_s02_company_template_probe.py following the S01 bounded-probe pattern. The runner: (1) discovers Paperclip base_url/company_id/auth from env or prior artifacts, (2) performs a health check to capture runtime version/build, (3) attempts company template import via supported Paperclip endpoints (POST /api/companies/{id}/import or PUT /api/companies/{id}), (4) if import is unsupported or blocked, falls back to direct agent creation via POST /api/companies/{id}/agents with AGENTS.md content attached as metadata, (5) lists agents readback to verify division presence, (6) documents routing rule test ability. The runner is fail-closed: missing credentials or unsupported endpoints produce a valid blocker artifact with precise blocker codes, zero side effects, and no capability promotions. All HTTP requests use the same redaction and HttpClient patterns as S01.
  - Files: `scripts/run_m005_s02_company_template_probe.py`, `runtime-evidence/M005-S02-company-template-probe.json`
  - Verify: python3 scripts/run_m005_s02_company_template_probe.py && test -f runtime-evidence/M005-S02-company-template-probe.json

- [x] **T03: Evidence validator and fixture tests** `est:1h 30m`
  Create scripts/validate_m005_s02_company_template_probe.py and scripts/test_validate_m005_s02_company_template_probe.py following the S01 validator pattern. The validator accepts --evidence and --allow-blocker flags, enforces schema_version m005-s02-company-template/v1, validates redaction, rejects unsupported paths/core modification, checks blocker artifacts for precise codes and zero capability promotions, and validates passing proofs for import success or direct-creation fallback with 7 divisions present and routing rules active. The test fixture suite covers: passing import proof, passing direct-creation proof, fail-closed-blocker with missing auth, fail-closed-blocker with unsupported endpoint, partial import, unredacted secrets, malformed timestamp, direct DB mutation flags, and wrong schema version.
  - Files: `scripts/validate_m005_s02_company_template_probe.py`, `scripts/test_validate_m005_s02_company_template_probe.py`
  - Verify: python3 scripts/test_validate_m005_s02_company_template_probe.py

- [x] **T04: Validate evidence and update capability matrix** `est:45m`
  Run the S02 validator against the live probe evidence with --allow-blocker. Confirm the artifact passes with zero capability promotions (expected outcome for this environment). Then update plugin-bos-light/capabilities.paperclip-runtime.json append-only: add or update rows for company_template.import_export and agents.syntax with status from the probe outcome, preserving all prior rows and recording evidence_source and blocker_text. Validate the matrix JSON with scripts/validate_runtime_capabilities.py. Finally, generate runtime-evidence/M005-S02-evidence-summary.json combining S02 results with S01 context, including confirmed_surfaces, fallback_only_surfaces, unvalidated_surfaces, posture, and guardrails.
  - Files: `plugin-bos-light/capabilities.paperclip-runtime.json`, `runtime-evidence/M005-S02-evidence-summary.json`
  - Verify: python3 scripts/validate_m005_s02_company_template_probe.py --evidence runtime-evidence/M005-S02-company-template-probe.json --allow-blocker && python3 scripts/validate_runtime_capabilities.py

## Files Likely Touched

- scripts/validate_company_template.py
- company-template/bos-company-template.json
- runtime-evidence/M005-S02-local-validation.json
- scripts/run_m005_s02_company_template_probe.py
- runtime-evidence/M005-S02-company-template-probe.json
- scripts/validate_m005_s02_company_template_probe.py
- scripts/test_validate_m005_s02_company_template_probe.py
- plugin-bos-light/capabilities.paperclip-runtime.json
- runtime-evidence/M005-S02-evidence-summary.json
