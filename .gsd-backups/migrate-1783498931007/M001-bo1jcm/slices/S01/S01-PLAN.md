# S01: Company Template Import Proof

**Goal:** Turn the draft company template and seven division profiles into validated import-ready BOS Light organization assets.
**Demo:** A fresh or fixture Paperclip company can validate the seven BOS Light division agents, AGENTS profiles, org chart, task routing, and rituals for A1 evidence.

## Must-Haves

- Seven division profiles preserve role semantics, VFP, guardrails, routing, and rituals.
- Company template, org chart, routing, and rituals validate against a local contract that mirrors the current handoff assumptions.
- A1 evidence is captured in a reusable command and documentation without relying on plugin runtime behavior.

## Proof Level

- This slice proves: Contract and integration-adjacent proof using repository validators and the available draft import schema until a live Paperclip import command is known.

## Integration Closure

Produces stable template assets, a repeatable validation command, and A1 evidence consumed by the runtime capability checks in S02.

## Verification

- Validation output identifies the file, division id, missing field, malformed route, and compatibility issue without printing secrets or relying on external services.

## Tasks

- [x] **T01: Add company template validator** `est:45m`
  Create a deterministic repository-level validator for the company template and division profiles. It should parse company-template/bos-company-template.json, assert exactly seven divisions, verify each agent_profile exists, verify required division fields and routing targets, and check that org chart, routing, and rituals files are present. Done when the validator fails with contextual messages on malformed assets and passes on the current valid package.
  - Files: `scripts/validate_company_template.py`, `company-template/bos-company-template.json`, `agents/README.md`
  - Verify: python3 scripts/validate_company_template.py

- [x] **T02: Align template assets to validation contract** `est:45m`
  Run the new validator against the existing template and fix the template or profile references only where the validator exposes concrete gaps. Keep the template draft-status honest in import-notes.md, but make the local BOS Light contract internally consistent for seven divisions, routing rules, rituals, and referenced AGENTS.md files. Done when the validator passes without weakening the source-of-truth or draft-runtime caveats.
  - Files: `company-template/bos-company-template.json`, `company-template/import-notes.md`, `agents/README.md`, `agents/Div1_Executive/AGENTS.md`, `agents/Div2_MasterPlanner/AGENTS.md`, `agents/Div3_Production/AGENTS.md`, `agents/Div4_Operations/AGENTS.md`, `agents/Div5_Qualifications/AGENTS.md`, `agents/Div6_Resources/AGENTS.md`, `agents/Div7_Strategy/AGENTS.md`
  - Verify: python3 scripts/validate_company_template.py

- [x] **T03: Capture A1 validation evidence** `est:30m`
  Add A1 evidence documentation for the local import-readiness proof. The evidence should name the exact validation command, list validated assets, document what this proves, and explicitly state the remaining live Paperclip import/export unknown that S02 must retire. Done when the evidence file exists, is non-empty, and the handoff validator plus company template validator both pass.
  - Files: `company-template/a1-validation-evidence.md`, `scripts/validate_handoff.py`, `scripts/validate_company_template.py`
  - Verify: python3 scripts/validate_handoff.py

## Files Likely Touched

- scripts/validate_company_template.py
- company-template/bos-company-template.json
- agents/README.md
- company-template/import-notes.md
- agents/Div1_Executive/AGENTS.md
- agents/Div2_MasterPlanner/AGENTS.md
- agents/Div3_Production/AGENTS.md
- agents/Div4_Operations/AGENTS.md
- agents/Div5_Qualifications/AGENTS.md
- agents/Div6_Resources/AGENTS.md
- agents/Div7_Strategy/AGENTS.md
- company-template/a1-validation-evidence.md
- scripts/validate_handoff.py
