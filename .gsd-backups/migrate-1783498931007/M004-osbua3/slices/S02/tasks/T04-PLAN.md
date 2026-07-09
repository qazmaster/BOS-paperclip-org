---
estimated_steps: 1
estimated_files: 3
skills_used: []
---

# T04: Update company template validators

Update the deterministic company-template validator and its negative coverage so it recognizes the v1.4.1 division ids, new agent profile paths, and the new routing semantics. Keep the old legacy ids out of active contract validation and make probe failures point at the exact stale route or profile that needs to change.

## Inputs

- `scripts/validate_company_template.py`
- `scripts/test_validate_company_template.py`
- `scripts/test_probe_paperclip_runtime.py`
- `company-template/bos-company-template.json`
- `company-template/org-chart.mmd`
- `company-template/task-routing.md`
- `company-template/rituals.md`
- `agents/Div1_Executive/AGENTS.md`
- `agents/Div2_MasterPlanner/AGENTS.md`
- `agents/Div3_Production/AGENTS.md`
- `agents/Div4_Operations/AGENTS.md`
- `agents/Div5_Qualifications/AGENTS.md`
- `agents/Div6_Resources/AGENTS.md`
- `agents/Div7_Strategy/AGENTS.md`

## Expected Output

- `scripts/validate_company_template.py`
- `scripts/test_validate_company_template.py`
- `scripts/test_probe_paperclip_runtime.py`

## Verification

python3 scripts/test_validate_company_template.py && python3 scripts/test_probe_paperclip_runtime.py
