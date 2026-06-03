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

## M005 live runtime proof

M005 proved all core integration surfaces against live Paperclip:

- **S01** Hermes Xiaomi execution — `runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe-live*.json`
- **S02** Company template (7 divisions) — `runtime-evidence/M005-S02-company-template-runtime-probe-live.json`
- **S03** Resource intake / secrets — `runtime-evidence/M005-S03-resource-intake-runtime-probe-live.json`
- **S04** Git hybrid operations — `runtime-evidence/M005-S04-git-hybrid-runtime-probe-live.json`
- **S05** E2E mission creation — `runtime-evidence/M005-S05-e2e-mission-runtime-probe-live.json`

Read `BOS_M005_DEVELOPMENT_HANDOFF.md` for full results, deferred items, and next priorities.

## Historical context to read after v1.4.1

- `docs/01_CONTEXT_AND_DECISION.md`
- `docs/03_IMPLEMENTATION_PLAN_V1_2.md`
- `docs/04_DATA_CONTRACTS.md`
- `docs/06_ACCEPTANCE_TESTS.md`
- `docs/07_RISKS_AND_SPIKES.md`
- `BOS_M002_DEVELOPMENT_HANDOFF.md` — M002 runtime validation context
- `BOS_M004_DEVELOPMENT_HANDOFF.md` — M004 state and blockers (superseded by M005)
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

## M008 architecture update (Div7 delegation + Div1 routing)

M008 fixed the critical architecture gap where Div7 could become a terminal handler for technical work. Read `HANDOFF_M008_COMPLETE.md` for full details.

### Key changes

- **Two-pass routing**: Pre-decision on MissionSignals (deterministic, no LLM), post-decision on Cynefin domain from DecisionDelegated packet.
- **Div7 → Div1 delegation**: Every non-policy-only Div7 decision emits DecisionDelegated to Div1.HCO. Div7 cannot self-execute technical work.
- **Division authority clarification**: Div7=regime controller, Div1=operational authority, Div3=capability gatekeeper, Div4=production executor, Div5=QA/verification, Div6=external gateway.
- **Grant policy**: Div3 issues BudgetGrant/AccessGrant only in response to Div1 requests. Routine grants deterministic. External-world access Div6-only.
- **Div4 protocol**: Blockers raised to Div1 only. QA handoff through Div1 to Div5. No direct cross-division communication.

### Key invariants

```
No route → no grant.
No budget → no access.
No access → no execution.
No Div6 route → no external-world capability.
Div7 decision → DecisionDelegated → Div1 routing (not terminal).
Div4 builds, but does not decide the system.
```

### Test suite

```bash
cd plugin-bos-light && npx vitest run    # 1424 tests, 63 files
cd plugin-bos-light && npx tsc --noEmit  # TypeScript (pre-existing errors in test files)
```

### R026 v1.4.2 patch alignment

Our implementation aligns 95%+ with the official v1.4.2 R026 Agent Boundary Update patch. See `HANDOFF_M008_COMPLETE.md` for detailed comparison table.

## Current state (M001-M011 complete)

All 11 milestones are complete. Read these handoffs for full context:

- `HANDOFF_M008_COMPLETE.md` — Div7 delegation + Div1 routing refactor
- `HANDOFF_M009_COMPLETE.md` — BOS Light Level 2 Plugin Activation (959 tests)
- `HANDOFF_M010_COMPLETE.md` — Plugin integration testing (1250 tests)
- `.gsd/milestones/M011/M011-SUMMARY.md` — Capability ledger reconciliation

### What works

- **Deterministic routing** across all 3 Cynefin domains (CLEAR/COMPLICATED/CHAOTIC)
- **Two-pass architecture** with Div7 → Div1 delegation
- **Grant policy enforcement** (auto-approve ≤100K, escalation for HIGH risk)
- **Division isolation** (Div4 blocked from external tools, Div6-only external IO)
- **Plugin tools** (6 tools registered, 1250 tests passing)
- **7 division agents** operational on live Paperclip with Hermes + Xiaomi

### What's blocked

- **Paperclip plugin runtime** — post-V1 feature; tools run via agent execution flow only
- **Live Paperclip mutations** — auth required; use secure_env_collect before M012
- **GSD-Pi execution** — blocked; supported adapter returns Unknown adapter type

### Next milestone: M012

Plan M012 as "First Real Mission Through Native Paperclip Flow" using `runtime-evidence/M011-S03-reconciled-capability-gate.json`. Before any live Paperclip issue/document/comment mutation, collect Paperclip auth via secure_env_collect and ask for explicit confirmation of the bounded live action.
