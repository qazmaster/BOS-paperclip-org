---
estimated_steps: 1
estimated_files: 7
skills_used: []
---

# T01: Enhance all 7 division AGENTS.md with complete hat profiles

Add Allowed Tools, Forbidden Tools, Runtime Boundary, Security Invariants, and Acceptance Checks sections to all 7 division AGENTS.md files.

## Inputs

- `skills/SKILL_TREASURY_BUDGET_ACCESS.md`
- `skills/SKILL_EXTERNAL_IO_GATEWAY.md`
- `skills/SKILL_KNOWLEDGE_QUARANTINE.md`
- `skills/SKILL_HCO_ROUTING_CONTROL.md`
- `skills/SKILL_CIRCUIT_BREAKER_HCO.md`

## Expected Output

- `agents/Div1_HCO/AGENTS.md`
- `agents/Div2_MasterPlanner/AGENTS.md`
- `agents/Div3_Treasury/AGENTS.md`
- `agents/Div4_Production/AGENTS.md`
- `agents/Div5_QualificationsLibraryLearning/AGENTS.md`
- `agents/Div6_External/AGENTS.md`
- `agents/Div7_MissionControl/AGENTS.md`

## Verification

ls agents/*/AGENTS.md && grep -l 'Allowed Tools' agents/*/AGENTS.md | wc -l
