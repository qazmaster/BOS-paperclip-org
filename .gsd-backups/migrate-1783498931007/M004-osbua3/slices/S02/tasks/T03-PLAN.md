---
estimated_steps: 1
estimated_files: 18
skills_used: []
---

# T03: Replace company template and agent profiles

Replace the company template and agent profile layout with the v1.4.1 division map. Update the org chart, routing rules, rituals, and agent profile paths so the active template references Div7.MissionControl, Div1.HCO, Div3.Treasury, Div4.Production, Div5.QualificationsLibraryLearning, and Div6.External instead of the deprecated v1.3 ownership map.

## Inputs

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

- `company-template/bos-company-template.json`
- `company-template/org-chart.mmd`
- `company-template/task-routing.md`
- `company-template/rituals.md`
- `agents/Div1_HCO/AGENTS.md`
- `agents/Div2_MasterPlanner/AGENTS.md`
- `agents/Div3_Treasury/AGENTS.md`
- `agents/Div4_Production/AGENTS.md`
- `agents/Div5_QualificationsLibraryLearning/AGENTS.md`
- `agents/Div6_External/AGENTS.md`
- `agents/Div7_MissionControl/AGENTS.md`
- `agents/README.md`

## Verification

python3 scripts/validate_company_template.py
