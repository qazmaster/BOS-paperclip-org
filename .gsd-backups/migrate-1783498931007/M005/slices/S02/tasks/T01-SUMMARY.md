---
id: T01
parent: S02
milestone: M005
key_files:
  - runtime-evidence/M005-S02-local-validation.json
key_decisions:
  - (none)
duration: 
verification_result: passed
completed_at: 2026-05-31T19:16:55.135Z
blocker_discovered: false
---

# T01: Ran local-only company template validator confirming 7 divisions, 7 agent profiles, org chart, routing rules, and security snippets are intact; captured evidence to runtime-evidence/M005-S02-local-validation.json

**Ran local-only company template validator confirming 7 divisions, 7 agent profiles, org chart, routing rules, and security snippets are intact; captured evidence to runtime-evidence/M005-S02-local-validation.json**

## What Happened

Executed the standard-library-only validator scripts/validate_company_template.py against the repository-local BOS Light v1.4.1 package. The validator confirmed all 7 divisions are present with correct IDs and reporting lines, all 7 AGENTS.md profiles exist and are referenced, 8 routing rules match the expected contract, support assets (org-chart.mmd, task-routing.md, rituals.md, agents/README.md) are present and consistent, and all 12 external-IO security snippets are intact with zero legacy division IDs or duplicate entries. Validation passed with no errors. The result was captured as runtime-evidence/M005-S02-local-validation.json, documenting import_attempt (surface=local-file-system, status=success, zero side effects), agent_activation (7/7 divisions and profiles), routing_validation (8 rules), template_integrity, and runtime metadata.

## Verification

Ran python3 scripts/validate_company_template.py in repository root. Script exited 0 with message confirming 7 divisions, 7 agent profiles, org chart, routing, rituals, and agents README are compatible. Verified resulting evidence file is valid JSON and contains all required audit-trail fields.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 scripts/validate_company_template.py` | 0 | ✅ pass | 53ms |
| 2 | `python3 -c "import json; json.load(open('runtime-evidence/M005-S02-local-validation.json')); print('JSON valid')"` | 0 | ✅ pass | 15ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `runtime-evidence/M005-S02-local-validation.json`
