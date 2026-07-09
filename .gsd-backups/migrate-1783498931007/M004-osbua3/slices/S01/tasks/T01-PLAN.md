---
estimated_steps: 1
estimated_files: 12
skills_used: []
---

# T01: Import v1.4.1 doctrine docs and protocols

Import the new v1.4.1 doctrine docs and protocol files into the repository. The new package should become the canonical reference set for the updated org model, permissions, contracts, and A12-A20 acceptance set, while the older v1.2-era docs remain available only as historical context.

## Inputs

- `README.md`
- `docs/01_CONTEXT_AND_DECISION.md`
- `docs/02_ARCHITECTURE.md`
- `docs/03_IMPLEMENTATION_PLAN_V1_2.md`
- `docs/06_ACCEPTANCE_TESTS.md`
- `docs/07_RISKS_AND_SPIKES.md`
- `HANDOFF_PROMPT_FOR_NEW_AI_AGENT.md`
- `BOS_M002_DEVELOPMENT_HANDOFF.md`
- `HANDOFF_REAL_PAPERCLIP_IMPORT_TEST.md`

## Expected Output

- `docs/BOS_Light_v1_4_1_CANONICAL_ORG.md`
- `docs/BOS_Light_v1_4_1_Function_Migration_Matrix.md`
- `docs/BOS_Light_v1_4_1_Tool_Permission_Matrix.md`
- `docs/BOS_Light_v1_4_1_Data_Contracts.md`
- `docs/BOS_Light_v1_4_1_Acceptance_Tests_A12_A20.md`
- `skills/SKILL_HCO_ROUTING_CONTROL.md`
- `skills/SKILL_EXTERNAL_IO_GATEWAY.md`
- `skills/SKILL_KNOWLEDGE_QUARANTINE.md`
- `skills/SKILL_DIV5_AUTORESEARCH.md`
- `skills/SKILL_AGENT_STAFFING_AND_HATS.md`
- `skills/SKILL_CIRCUIT_BREAKER_HCO.md`
- `skills/SKILL_TREASURY_BUDGET_ACCESS.md`

## Verification

test -f docs/BOS_Light_v1_4_1_CANONICAL_ORG.md && test -f docs/BOS_Light_v1_4_1_Acceptance_Tests_A12_A20.md && test -f skills/SKILL_EXTERNAL_IO_GATEWAY.md
