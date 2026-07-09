---
id: T01
parent: S01
milestone: M004-osbua3
key_files:
  - docs/BOS_Light_v1_4_1_CANONICAL_ORG.md
  - docs/BOS_Light_v1_4_1_Function_Migration_Matrix.md
  - docs/BOS_Light_v1_4_1_Tool_Permission_Matrix.md
  - docs/BOS_Light_v1_4_1_Data_Contracts.md
  - docs/BOS_Light_v1_4_1_Acceptance_Tests_A12_A20.md
  - skills/SKILL_HCO_ROUTING_CONTROL.md
  - skills/SKILL_EXTERNAL_IO_GATEWAY.md
  - skills/SKILL_KNOWLEDGE_QUARANTINE.md
  - skills/SKILL_DIV5_AUTORESEARCH.md
  - skills/SKILL_AGENT_STAFFING_AND_HATS.md
  - skills/SKILL_CIRCUIT_BREAKER_HCO.md
  - skills/SKILL_TREASURY_BUDGET_ACCESS.md
key_decisions:
  - v1.4.1 package is canonical active doctrine; v1.2/v1.3 docs are historical where they conflict.
  - Imported doctrine/protocol files are static repo-local markdown and must not be executed or used as dynamic path/network sources.
duration: 
verification_result: passed
completed_at: 2026-05-30T16:51:14.530Z
blocker_discovered: false
---

# T01: Imported the v1.4.1 BOS Light doctrine and skill protocol package as static repo-local markdown.

**Imported the v1.4.1 BOS Light doctrine and skill protocol package as static repo-local markdown.**

## What Happened

Created the five canonical v1.4.1 doctrine documents under `docs/` and seven protocol documents under `skills/`. The package establishes the active seven-division org map, function migration matrix, tool permission boundaries, data contracts, and A12-A20 acceptance set. It also makes the critical trust boundaries explicit: Div6 is the only external-world actor, Div5 quarantines and sanitizes knowledge before internal reuse, Div3 owns scoped budget/access grants without performing external IO, and Div1.HCO owns routing/control without becoming an external IO or budget authority. Failure Modes (Q5): this task has filesystem-only dependencies. Missing output directories were handled by creating `docs/` and `skills/`; missing source package files were handled by materializing the v1.4.1 doctrine from existing repo-local `agents/` and `company-template/` context. The imported markdown is static content and intentionally performs no network, subprocess import, or dynamic path behavior. Load Profile (Q6): omitted for runtime load; this task imports static markdown files and adds no runtime path. Negative Tests (Q7): the task-level negative surface is missing or stale static files; verification checked required files, complete package inventory, non-empty files, and key content terms for owners, permissions, data contracts and A12-A20. The acceptance document also records negative checks for A12-A20; executable validator negative tests are planned for T02, which owns handoff entrypoint and validator refresh.

## Verification

Ran the required task verification command: `test -f docs/BOS_Light_v1_4_1_CANONICAL_ORG.md && test -f docs/BOS_Light_v1_4_1_Acceptance_Tests_A12_A20.md && test -f skills/SKILL_EXTERNAL_IO_GATEWAY.md`, which passed. Also verified that all twelve expected package files are present and non-empty, ran the current `scripts/validate_handoff.py` as partial slice baseline, and ran a content sanity script confirming canonical owners, permission boundaries, data contract names and A12-A20 terms are present.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `test -f docs/BOS_Light_v1_4_1_CANONICAL_ORG.md && test -f docs/BOS_Light_v1_4_1_Acceptance_Tests_A12_A20.md && test -f skills/SKILL_EXTERNAL_IO_GATEWAY.md; plus full package non-empty inventory loop` | 0 | ✅ pass | 40ms |
| 2 | `python3 scripts/validate_handoff.py` | 0 | ✅ pass (partial slice baseline; validator inventory enforcement remains T02 scope) | 35ms |
| 3 | `python content sanity check for v1.4.1 owners, permission boundaries, contracts, A12-A20 and protocol terms` | 0 | ✅ pass | 31ms |

## Deviations

No separate source-package files were present in the worktree, so the package was materialized from the existing repo-local v1.4.1 agent profiles and company-template doctrine instead of copying pre-existing files.

## Known Issues

`scripts/validate_handoff.py` currently exits successfully but does not yet enforce/report the v1.4.1 package inventory; that validator refresh is explicitly assigned to S01/T02.

## Files Created/Modified

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
