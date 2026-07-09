# S02: Remap Company Template

**Goal:** Replace the company template, org chart, routing doc, rituals, and agent profiles with the v1.4.1 ownership map.
**Demo:** The company template validates with the v1.4.1 division map and the repo exposes the new AGENTS.md profiles instead of treating the old division names as canonical.

## Must-Haves

- company-template/bos-company-template.json names the new divisions and reporting lines.
- company-template/org-chart.mmd, task-routing.md, and rituals.md match the new routing doctrine.
- The new agent profile directories exist and the active template references them.
- The template validator and its tests pass against the v1.4.1 division ids.

## Proof Level

- This slice proves: integration

## Integration Closure

The org chart, routing, and AGENTS profiles agree on the same new division model, so import readiness is no longer split across conflicting names.

## Verification

- Validator failures pinpoint stale division ids, missing agent profiles, or malformed routes instead of collapsing into a generic template error.

## Tasks

- [x] **T03: Replace company template and agent profiles** `est:2h`
  Replace the company template and agent profile layout with the v1.4.1 division map. Update the org chart, routing rules, rituals, and agent profile paths so the active template references Div7.MissionControl, Div1.HCO, Div3.Treasury, Div4.Production, Div5.QualificationsLibraryLearning, and Div6.External instead of the deprecated v1.3 ownership map.
  - Files: `company-template/bos-company-template.json`, `company-template/org-chart.mmd`, `company-template/task-routing.md`, `company-template/rituals.md`, `agents/Div1_Executive/AGENTS.md`, `agents/Div2_MasterPlanner/AGENTS.md`, `agents/Div3_Production/AGENTS.md`, `agents/Div4_Operations/AGENTS.md`, `agents/Div5_Qualifications/AGENTS.md`, `agents/Div6_Resources/AGENTS.md`, `agents/Div7_Strategy/AGENTS.md`, `agents/Div1_HCO/AGENTS.md`, `agents/Div3_Treasury/AGENTS.md`, `agents/Div4_Production/AGENTS.md`, `agents/Div5_QualificationsLibraryLearning/AGENTS.md`, `agents/Div6_External/AGENTS.md`, `agents/Div7_MissionControl/AGENTS.md`, `agents/README.md`
  - Verify: python3 scripts/validate_company_template.py

- [x] **T04: Update company template validators** `est:1h 30m`
  Update the deterministic company-template validator and its negative coverage so it recognizes the v1.4.1 division ids, new agent profile paths, and the new routing semantics. Keep the old legacy ids out of active contract validation and make probe failures point at the exact stale route or profile that needs to change.
  - Files: `scripts/validate_company_template.py`, `scripts/test_validate_company_template.py`, `scripts/test_probe_paperclip_runtime.py`
  - Verify: python3 scripts/test_validate_company_template.py && python3 scripts/test_probe_paperclip_runtime.py

## Files Likely Touched

- company-template/bos-company-template.json
- company-template/org-chart.mmd
- company-template/task-routing.md
- company-template/rituals.md
- agents/Div1_Executive/AGENTS.md
- agents/Div2_MasterPlanner/AGENTS.md
- agents/Div3_Production/AGENTS.md
- agents/Div4_Operations/AGENTS.md
- agents/Div5_Qualifications/AGENTS.md
- agents/Div6_Resources/AGENTS.md
- agents/Div7_Strategy/AGENTS.md
- agents/Div1_HCO/AGENTS.md
- agents/Div3_Treasury/AGENTS.md
- agents/Div4_Production/AGENTS.md
- agents/Div5_QualificationsLibraryLearning/AGENTS.md
- agents/Div6_External/AGENTS.md
- agents/Div7_MissionControl/AGENTS.md
- agents/README.md
- scripts/validate_company_template.py
- scripts/test_validate_company_template.py
- scripts/test_probe_paperclip_runtime.py
