---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T02: Live company template import probe runner

Create and execute scripts/run_m005_s02_company_template_probe.py following the S01 bounded-probe pattern. The runner: (1) discovers Paperclip base_url/company_id/auth from env or prior artifacts, (2) performs a health check to capture runtime version/build, (3) attempts company template import via supported Paperclip endpoints (POST /api/companies/{id}/import or PUT /api/companies/{id}), (4) if import is unsupported or blocked, falls back to direct agent creation via POST /api/companies/{id}/agents with AGENTS.md content attached as metadata, (5) lists agents readback to verify division presence, (6) documents routing rule test ability. The runner is fail-closed: missing credentials or unsupported endpoints produce a valid blocker artifact with precise blocker codes, zero side effects, and no capability promotions. All HTTP requests use the same redaction and HttpClient patterns as S01.

## Inputs

- `company-template/bos-company-template.json`
- `scripts/create_bos_v141_agents.py`
- `runtime-evidence/M002-S07-agent-visibility.json`
- `agents/Div1_HCO/AGENTS.md`
- `agents/Div2_MasterPlanner/AGENTS.md`
- `agents/Div3_Treasury/AGENTS.md`
- `agents/Div4_Production/AGENTS.md`
- `agents/Div5_QualificationsLibraryLearning/AGENTS.md`
- `agents/Div6_External/AGENTS.md`
- `agents/Div7_MissionControl/AGENTS.md`

## Expected Output

- `scripts/run_m005_s02_company_template_probe.py`
- `runtime-evidence/M005-S02-company-template-probe.json`

## Verification

python3 scripts/run_m005_s02_company_template_probe.py && test -f runtime-evidence/M005-S02-company-template-probe.json
