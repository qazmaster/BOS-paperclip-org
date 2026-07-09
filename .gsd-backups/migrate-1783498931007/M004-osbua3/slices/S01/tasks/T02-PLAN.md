---
estimated_steps: 1
estimated_files: 7
skills_used: []
---

# T02: Refresh handoff entrypoints and inventory

Update the repo root handoff docs and manifest so the v1.4.1 package is the first thing a new agent sees. Keep the older M002 and legacy BOS Chimera material as historical context, but make the README, start-here note, handoff prompt, and import-test guidance clearly point to the new canonical v1.4.1 doctrine package and its validation order. Extend the handoff validator so it checks the new package inventory rather than only the original baseline files.

## Inputs

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

## Expected Output

- `README.md`
- `00_START_HERE_FOR_NEW_AI_AGENT.md`
- `HANDOFF_PROMPT_FOR_NEW_AI_AGENT.md`
- `BOS_M002_DEVELOPMENT_HANDOFF.md`
- `HANDOFF_REAL_PAPERCLIP_IMPORT_TEST.md`
- `MANIFEST.md`
- `scripts/validate_handoff.py`

## Verification

python3 scripts/validate_handoff.py
