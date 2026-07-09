---
estimated_steps: 1
estimated_files: 3
skills_used: []
---

# T01: Company template local validation

Run the existing standard-library-only validator to confirm the repository-local BOS Light package is intact before any live Paperclip probe. The validator checks 7 divisions, reporting lines, routing rules, rituals, support assets, external-IO security snippets, and AGENTS.md profile existence. Capture the result as a small local-validation evidence artifact for audit trail.

## Inputs

- `scripts/validate_company_template.py`
- `company-template/bos-company-template.json`
- `agents/Div1_HCO/AGENTS.md`
- `agents/Div2_MasterPlanner/AGENTS.md`
- `agents/Div3_Treasury/AGENTS.md`
- `agents/Div4_Production/AGENTS.md`
- `agents/Div5_QualificationsLibraryLearning/AGENTS.md`
- `agents/Div6_External/AGENTS.md`
- `agents/Div7_MissionControl/AGENTS.md`

## Expected Output

- `runtime-evidence/M005-S02-local-validation.json`

## Verification

python3 scripts/validate_company_template.py
