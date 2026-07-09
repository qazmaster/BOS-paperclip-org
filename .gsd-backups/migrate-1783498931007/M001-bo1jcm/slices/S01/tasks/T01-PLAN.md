---
estimated_steps: 1
estimated_files: 3
skills_used: []
---

# T01: Add company template validator

Create a deterministic repository-level validator for the company template and division profiles. It should parse company-template/bos-company-template.json, assert exactly seven divisions, verify each agent_profile exists, verify required division fields and routing targets, and check that org chart, routing, and rituals files are present. Done when the validator fails with contextual messages on malformed assets and passes on the current valid package.

## Inputs

- `company-template/bos-company-template.json`
- `company-template/org-chart.mmd`
- `company-template/task-routing.md`
- `company-template/rituals.md`
- `agents/README.md`

## Expected Output

- `scripts/validate_company_template.py`

## Verification

python3 scripts/validate_company_template.py

## Observability Impact

Adds a local inspection surface: python3 scripts/validate_company_template.py reports each validation failure with file path and field context.
