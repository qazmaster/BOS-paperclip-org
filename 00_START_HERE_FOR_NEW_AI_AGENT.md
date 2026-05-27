# Start Here - Brief for a New AI Agent

You are inheriting the BOS Chimera -> Paperclip adaptation project.

You know nothing about the prior discussion. This file is the minimum context required to start.

## One-sentence mission

Build **BOS Light for Paperclip**: a template-first organizational intelligence layer that helps Paperclip companies prioritize work, batch approvals, route tasks through 7 semantic divisions, run lightweight quality gates, and avoid runaway loops - without replacing Paperclip's runtime.

## Current strategic decision

Do **not** port BOS Chimera 4.1 as a full kernel. Paperclip already provides the runtime surfaces BOS would otherwise rebuild: companies, agents, issues, governance, budgets, heartbeats, events, activity/audit, plugins and UI. BOS should provide the organizational methodology and overlays.

## Architecture boundary

- Paperclip = system of record and execution plane.
- BOS Light = overlay organizational intelligence.
- Plugin = thin adapter, not a parallel database.
- Company template = first deliverable and should work even if plugin runtime changes.

## What must be built first

Phase 1 is independent of plugin runtime:

1. 7 division agents with AGENTS.md profiles.
2. Org chart and reporting lines.
3. Task routing rules.
4. Rituals: daily pulse, weekly review, batch approval ritual.

Phase 2 starts only after the state/event spikes:

1. `piko:bpi-score` agent tool.
2. `piko:blueprint-gen` agent tool.
3. Betting Table dashboard widget.
4. Paperclip-native approval/request creation.

Phase 3:

1. Circuit Breaker with polling fallback.
2. Eval Gates: Deterministic, SecurityPolicy, ArtifactIntegrity, Budget.

Phase 4:

1. `piko:decide` with Cynefin + OODA.
2. Only after enough usage traces exist.

## The most important constraints

1. No BOS Kernel.
2. No replacement issue lifecycle.
3. No plugin-side approval engine.
4. Durable decisions must be visible in Paperclip-native artifacts.
5. Plugin runtime assumptions must be validated against current Paperclip before implementation.

## Files to read next

- `docs/01_CONTEXT_AND_DECISION.md`
- `docs/03_IMPLEMENTATION_PLAN_V1_2.md`
- `docs/04_DATA_CONTRACTS.md`
- `docs/06_ACCEPTANCE_TESTS.md`
- `docs/07_RISKS_AND_SPIKES.md`
- `agents/README.md`
- `plugin-bos-light/README.md`
