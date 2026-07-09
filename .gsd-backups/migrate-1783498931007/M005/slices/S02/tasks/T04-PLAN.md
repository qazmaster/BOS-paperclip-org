---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T04: Validate evidence and update capability matrix

Run the S02 validator against the live probe evidence with --allow-blocker. Confirm the artifact passes with zero capability promotions (expected outcome for this environment). Then update plugin-bos-light/capabilities.paperclip-runtime.json append-only: add or update rows for company_template.import_export and agents.syntax with status from the probe outcome, preserving all prior rows and recording evidence_source and blocker_text. Validate the matrix JSON with scripts/validate_runtime_capabilities.py. Finally, generate runtime-evidence/M005-S02-evidence-summary.json combining S02 results with S01 context, including confirmed_surfaces, fallback_only_surfaces, unvalidated_surfaces, posture, and guardrails.

## Inputs

- `runtime-evidence/M005-S02-company-template-probe.json`
- `scripts/validate_m005_s02_company_template_probe.py`
- `plugin-bos-light/capabilities.paperclip-runtime.json`
- `runtime-evidence/M005-S01-evidence-summary.json`

## Expected Output

- `plugin-bos-light/capabilities.paperclip-runtime.json`
- `runtime-evidence/M005-S02-evidence-summary.json`

## Verification

python3 scripts/validate_m005_s02_company_template_probe.py --evidence runtime-evidence/M005-S02-company-template-probe.json --allow-blocker && python3 scripts/validate_runtime_capabilities.py
