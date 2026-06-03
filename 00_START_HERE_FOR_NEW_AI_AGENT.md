# Start Here - Brief for a New AI Agent

You are inheriting the BOS Chimera -> Paperclip adaptation project.

You know nothing about the prior discussion. This file is the minimum context required to start safely.

## One-sentence mission

Build **BOS Light for Paperclip**: a Paperclip-native organizational intelligence layer that routes work through a seven-division operating model, preserves trust boundaries, qualifies knowledge before reuse, and records durable decisions in visible artifacts without replacing Paperclip's runtime.

## Current canonical doctrine

The active doctrine is the **BOS Light v1.4.2 R026 package**. Read it first:

1. `docs/BOS_Light_v1_4_1_CANONICAL_ORG.md` — active org model
2. `docs/BOS_Light_v1_4_2_R026_Agent_Boundary_Patch.md` — Div7→Div1 delegation
3. `docs/BOS_Light_v1_4_1_Tool_Permission_Matrix.md` — tool boundaries
4. `docs/BOS_Light_v1_4_1_Data_Contracts.md` — payload contracts
5. `configs/routing_modes_v1_4_2.json` — routing modes

Then read the v1.4.2 protocols in `skills/`:

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

## R026 invariant

Div7 decisions are not terminal operational routes. Every non-policy-only Div7 decision MUST emit DecisionDelegated to Div1.HCO. Div1.HCO MUST perform all operational routing after Div7 decision.

## The most important constraints

1. No BOS Kernel.
2. No replacement issue lifecycle.
3. No plugin-side approval engine.
4. Durable decisions must be visible in Paperclip-native or repo-local artifacts.
5. Raw issue text and raw external evidence are untrusted.
6. External IO routes through Div5 local check, Div3 when paid/credentialed, Div6 collection, then Div5 quarantine.
7. Plugin runtime assumptions must be validated against current Paperclip before implementation.

## Validation

```bash
npm install
python3 scripts/validate_handoff.py
cd plugin-bos-light && npx vitest run    # 1424 tests, 63 files
```

## Milestone history

All 11 milestones complete. Read handoffs in `docs/handoffs/`:

- `docs/handoffs/HANDOFF_M008_COMPLETE.md` — Div7 delegation + Div1 routing refactor
- `docs/handoffs/HANDOFF_M009_COMPLETE.md` — BOS Light Level 2 Plugin Activation
- `docs/handoffs/HANDOFF_M010_COMPLETE.md` — Plugin integration testing
- `docs/handoffs/HANDOFF_M011_COMPLETE.md` — Capability ledger reconciliation

Historical docs (v1.2 baseline, M002-M005) are in `docs/archive/`.

## What works

- Deterministic routing across all 3 Cynefin domains
- Two-pass architecture with Div7 → Div1 delegation
- Grant policy enforcement (auto-approve ≤100K, escalation for HIGH risk)
- Division isolation (Div4 blocked from external tools, Div6-only external IO)
- Plugin tools (6 tools registered, 1424 tests passing)
- 7 division agents operational on live Paperclip with Hermes + Xiaomi

## What's blocked

- Paperclip plugin runtime — post-V1 feature; tools run via agent execution flow only
- Live Paperclip mutations — auth required; use secure_env_collect before M012
- GSD-Pi execution — blocked; supported adapter returns Unknown adapter type

## Next milestone: M012

Plan M012 as "First Real Mission Through Native Paperclip Flow". Before any live Paperclip mutation, collect auth via secure_env_collect and ask for explicit confirmation.
