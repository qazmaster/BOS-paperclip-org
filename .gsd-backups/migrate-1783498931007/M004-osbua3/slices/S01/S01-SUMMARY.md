---
id: S01
parent: M004-osbua3
milestone: M004-osbua3
provides:
  - A complete v1.4.1 doctrine and protocol package under `docs/` and `skills/`.
  - Root handoff entrypoints that direct future agents to the canonical v1.4.1 package first.
  - A machine-checkable handoff validator that enumerates the v1.4.1 package inventory and reports missing or stale assets explicitly.
requires:
  []
affects:
  - S02
  - S03
  - S04
  - S05
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
  - README.md
  - 00_START_HERE_FOR_NEW_AI_AGENT.md
  - HANDOFF_PROMPT_FOR_NEW_AI_AGENT.md
  - BOS_M002_DEVELOPMENT_HANDOFF.md
  - HANDOFF_REAL_PAPERCLIP_IMPORT_TEST.md
  - MANIFEST.md
  - scripts/validate_handoff.py
  - scripts/test_validate_handoff.py
key_decisions:
  - v1.4.1 doctrine and protocol markdown is the canonical first-read package for ownership, permissions, trust boundaries, routing, and A12-A20; M001/M002/v1.2/v1.3 material remains historical where conflicts exist.
  - Imported doctrine/protocol files are static repo-local markdown and must not be executed, fetched dynamically, or used as path/network input.
  - `scripts/validate_handoff.py` treats `MANIFEST.md` size/SHA256 rows as the staleness surface and excludes hidden local tooling/state paths from generated inventory.
patterns_established:
  - Static handoff packages should be represented as explicit validator inventories with path-specific missing/stale diagnostics.
  - Manifest hash/size checks provide a lightweight contract-staleness signal for downstream agents.
  - Root handoff entrypoints can preserve historical runtime evidence while clearly deferring active ownership/security semantics to the canonical doctrine package.
observability_surfaces:
  - `python3 scripts/validate_handoff.py` health output and non-zero missing/stale diagnostics.
  - `python3 -m unittest scripts/test_validate_handoff.py` negative tests for validator behavior.
drill_down_paths:
  - .gsd/milestones/M004-osbua3/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M004-osbua3/slices/S01/tasks/T02-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-05-30T16:59:12.133Z
blocker_discovered: false
---

# S01: Import Doctrine Package

**Imported the BOS Light v1.4.1 doctrine and skill protocol package, made it the canonical first-read handoff path, and taught the handoff validator to fail on missing or stale package inventory.**

## What Happened

S01 established the v1.4.1 doctrine package as a discoverable, repository-local, static source of truth for downstream migration work. T01 added the five `docs/BOS_Light_v1_4_1_*.md` doctrine documents and seven `skills/SKILL_*.md` protocol documents covering the canonical org map, function migration, tool permissions, data contracts, A12-A20 acceptance tests, HCO routing/control, Div6 external IO, Div5 knowledge quarantine/autoresearch, staffing/hats, circuit breaker control, and treasury budget/access boundaries. T02 refreshed the root handoff path so new agents encounter the v1.4.1 package first: `README.md`, `00_START_HERE_FOR_NEW_AI_AGENT.md`, `HANDOFF_PROMPT_FOR_NEW_AI_AGENT.md`, `BOS_M002_DEVELOPMENT_HANDOFF.md`, `HANDOFF_REAL_PAPERCLIP_IMPORT_TEST.md`, and `MANIFEST.md` now identify v1.4.1 as canonical for ownership, permissions, trust boundaries, routing, and A12-A20 while keeping M001/M002/v1.2-era material historical where conflicts exist. The handoff validator was replaced with a structured repository-local validator that enumerates the original baseline plus all twelve v1.4.1 package files, checks required content terms, and uses `MANIFEST.md` size/SHA256 rows as the missing/stale package surface. Validator unit tests cover the positive fixture plus negative cases for missing package files, stale manifest hashes, and stale entrypoint content.

## Operational Readiness
- Health signal: `python3 scripts/validate_handoff.py` exits 0 and prints `Handoff package OK ... (27 required files; 12 v1.4.1 package files)`, proving the package inventory is present, non-empty, content-checked, and manifest-hash aligned.
- Failure signal: the same validator exits non-zero with explicit `Missing required file`, `Stale or incomplete content`, or `Stale manifest` lines naming the failing path or manifest row.
- Recovery procedure: restore or regenerate the named doctrine/protocol/entrypoint file, refresh `MANIFEST.md` through the validator's manifest-generation path, then rerun `python3 -m unittest scripts/test_validate_handoff.py` and `python3 scripts/validate_handoff.py` before proceeding.
- Monitoring gaps: this slice adds no production runtime process or live Paperclip telemetry; health is local contract/inventory validation only. Live Paperclip capability remains unpromoted until later slices collect runtime proof.

## Verification

Fresh closeout verification used the GSD verification surface and passed:

1. `test -f docs/BOS_Light_v1_4_1_CANONICAL_ORG.md && test -f docs/BOS_Light_v1_4_1_Acceptance_Tests_A12_A20.md && test -f skills/SKILL_EXTERNAL_IO_GATEWAY.md` — exit 0; `required file existence check passed` (`gsd_exec` a37a685d-7381-43ac-9a18-e56832b8c9da).
2. `python3 scripts/validate_handoff.py` — exit 0; `Handoff package OK ... (27 required files; 12 v1.4.1 package files)` (`gsd_exec` 72a8f39b-f0aa-4eb0-9138-29c398fa94fa).
3. Validator regression and closeout audit — exit 0; `python3 -m unittest scripts/test_validate_handoff.py` ran 4 tests successfully, all 12 package files were non-empty, all 6 entrypoints pointed to v1.4.1, and `scripts/validate_handoff.py` enumerated every expected v1.4.1 package file (`gsd_exec` 58f1276d-f3aa-446e-b92e-cb58dccc9f60).

## Requirements Advanced

- R012 — Imported canonical v1.4.1 org doctrine and made root handoff docs point to it as active while keeping legacy names historical/deprecated.
- R013 — Imported the v1.4.1 tool permission matrix and external IO gateway protocol that define Div6-only external-world interaction.
- R014 — Imported Div5 knowledge quarantine/autoresearch protocols and data-contract doctrine for ExternalEvidencePacket to SanitizedKnowledgePacket flow.
- R015 — Imported HCO routing, circuit breaker, staffing/hats, and treasury/access protocols that define Div1.HCO control boundaries.

## Requirements Validated

None.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Operational Readiness

None.

## Deviations

T01 had no separate source-package archive available in the worktree, so the package was materialized from existing repo-local v1.4.1 agent profiles and company-template context. T02 added `scripts/test_validate_handoff.py` for negative validator coverage and tightened manifest generation to exclude hidden tool/state directories.

## Known Limitations

S01 validates repository-local doctrine inventory only. It does not claim live Paperclip import success, runtime agent visibility, native comment/document support, or enforcement of the v1.4.1 division map in plugin contracts; those remain downstream slice responsibilities.

## Follow-ups

S02 must remap the company template and AGENTS profiles to the v1.4.1 division map. S03 must remap plugin contracts, seeds, and tests. S04 must update acceptance/runtime docs while preserving conservative Paperclip posture. S05 must run full local regression closure.

## Files Created/Modified

- `docs/BOS_Light_v1_4_1_CANONICAL_ORG.md` — Added canonical v1.4.1 seven-division ownership doctrine.
- `docs/BOS_Light_v1_4_1_Function_Migration_Matrix.md` — Added function migration mapping from legacy ownership to v1.4.1 divisions.
- `docs/BOS_Light_v1_4_1_Tool_Permission_Matrix.md` — Added v1.4.1 external/internal tool permission boundaries.
- `docs/BOS_Light_v1_4_1_Data_Contracts.md` — Added v1.4.1 data contract packet definitions.
- `docs/BOS_Light_v1_4_1_Acceptance_Tests_A12_A20.md` — Added A12-A20 acceptance contract.
- `skills/SKILL_HCO_ROUTING_CONTROL.md` — Added Div1.HCO routing/control protocol.
- `skills/SKILL_EXTERNAL_IO_GATEWAY.md` — Added Div6 external IO gateway protocol.
- `skills/SKILL_KNOWLEDGE_QUARANTINE.md` — Added Div5 quarantine protocol.
- `skills/SKILL_DIV5_AUTORESEARCH.md` — Added Div5 autoresearch protocol.
- `skills/SKILL_AGENT_STAFFING_AND_HATS.md` — Added staffing/hats protocol.
- `skills/SKILL_CIRCUIT_BREAKER_HCO.md` — Added HCO circuit breaker protocol.
- `skills/SKILL_TREASURY_BUDGET_ACCESS.md` — Added treasury budget/access protocol.
- `README.md` — Promoted v1.4.1 package as first-read canonical handoff material.
- `00_START_HERE_FOR_NEW_AI_AGENT.md` — Updated new-agent start path for v1.4.1 canonical package.
- `HANDOFF_PROMPT_FOR_NEW_AI_AGENT.md` — Updated handoff prompt to point to v1.4.1 package and preserve runtime proof boundaries.
- `BOS_M002_DEVELOPMENT_HANDOFF.md` — Added canonical-doctrine warning while retaining M002 as historical runtime evidence.
- `HANDOFF_REAL_PAPERCLIP_IMPORT_TEST.md` — Added v1.4.1 ownership/security pointer while preserving import-test proof scope.
- `MANIFEST.md` — Regenerated package-scoped inventory with v1.4.1 files and hashes.
- `scripts/validate_handoff.py` — Replaced baseline-only validation with explicit v1.4.1 inventory/content/manifest validation.
- `scripts/test_validate_handoff.py` — Added validator positive and negative tests.
