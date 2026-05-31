# Start Here - Brief for a New AI Agent

You are inheriting the BOS Chimera -> Paperclip adaptation project.

You know nothing about the prior discussion. This file is the minimum context required to start safely.

## One-sentence mission

Build **BOS Light for Paperclip**: a Paperclip-native organizational intelligence layer that routes work through a seven-division operating model, preserves trust boundaries, qualifies knowledge before reuse, and records durable decisions in visible artifacts without replacing Paperclip's runtime.

## Current canonical doctrine

The active doctrine is the **BOS Light v1.4.1 package**. Read it first:

1. `docs/BOS_Light_v1_4_1_CANONICAL_ORG.md`
2. `docs/BOS_Light_v1_4_1_Function_Migration_Matrix.md`
3. `docs/BOS_Light_v1_4_1_Tool_Permission_Matrix.md`
4. `docs/BOS_Light_v1_4_1_Data_Contracts.md`
5. `docs/BOS_Light_v1_4_1_Acceptance_Tests_A12_A20.md`

Then read the v1.4.1 protocols in `skills/`:

- `skills/SKILL_HCO_ROUTING_CONTROL.md`
- `skills/SKILL_EXTERNAL_IO_GATEWAY.md`
- `skills/SKILL_KNOWLEDGE_QUARANTINE.md`
- `skills/SKILL_DIV5_AUTORESEARCH.md`
- `skills/SKILL_AGENT_STAFFING_AND_HATS.md`
- `skills/SKILL_CIRCUIT_BREAKER_HCO.md`
- `skills/SKILL_TREASURY_BUDGET_ACCESS.md`

## Strategic decision

Do **not** port BOS Chimera 4.1 as a full kernel. Paperclip already provides the runtime surfaces BOS would otherwise rebuild: companies, agents, issues, governance, budgets, heartbeats, events, activity/audit, plugins and UI. BOS Light provides organizational methodology, overlays and visible artifacts.

## Architecture boundary

- Paperclip = system of record and execution plane.
- BOS Light = overlay organizational intelligence.
- Plugin = thin adapter, not a parallel database.
- Company template = first deliverable and should work even if plugin runtime changes.
- Imported v1.4.1 markdown = static doctrine, not executable code or dynamic source.

## Active division model

- Div7.MissionControl frames mission-level intent and strategic ambiguity.
- Div1.HCO owns routing, dispatch, staffing requests and circuit-breaker coordination.
- Div2.MasterPlanner shapes BPI, blueprints, acceptance contracts and Betting Table candidates.
- Div3.Treasury owns budget, access feasibility, scoped grants and secrets permission decisions.
- Div4.Production builds and delivers approved artifacts.
- Div5.QualificationsLibraryLearning owns independent qualification, quarantine, sanitized knowledge and memory/KB approval.
- Div6.External is the only external-world/DMZ division.

## The most important constraints

1. No BOS Kernel.
2. No replacement issue lifecycle.
3. No plugin-side approval engine.
4. Durable decisions must be visible in Paperclip-native or repo-local artifacts.
5. Raw issue text and raw external evidence are untrusted.
6. External IO routes through Div5 local check, Div3 when paid/credentialed, Div6 collection, then Div5 quarantine.
7. Plugin runtime assumptions must be validated against current Paperclip before implementation.

## Historical context to read after v1.4.1

- `docs/01_CONTEXT_AND_DECISION.md`
- `docs/03_IMPLEMENTATION_PLAN_V1_2.md`
- `docs/04_DATA_CONTRACTS.md`
- `docs/06_ACCEPTANCE_TESTS.md`
- `docs/07_RISKS_AND_SPIKES.md`
- `BOS_M002_DEVELOPMENT_HANDOFF.md`
- `HANDOFF_REAL_PAPERCLIP_IMPORT_TEST.md`
- `agents/README.md`
- `plugin-bos-light/README.md`

Treat these files as historical implementation/runtime background wherever they conflict with v1.4.1.

## Validation before handoff

Run:

```bash
python3 scripts/validate_handoff.py
```

A passing validator means the root entrypoints, baseline handoff files, v1.4.1 doctrine/skill package, and manifest hashes are present and current. It does **not** prove live Paperclip runtime compatibility.
