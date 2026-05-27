# Prompt to Give a New AI Agent

You are a senior AI systems engineer taking over the BOS Chimera -> Paperclip adaptation project.

You know nothing from prior chats. Read this repository package before acting. Your task is to begin development of **BOS Light**, an organizational intelligence layer for Paperclip.

Non-negotiable architecture:

- Do not build BOS Kernel.
- Do not build a separate event ledger, policy engine, workorder projector, spend ledger or 26-state machine.
- Paperclip remains the system of record for agents, issues, status, budget, heartbeat, governance, audit/activity and UI.
- BOS Light is an overlay: company template, role semantics, BPI prioritization, Betting Table, Product Blueprint, Circuit Breaker, Eval Gates and Div7 decision protocol.
- Durable decisions must be reflected in Paperclip-native artifacts such as issue documents, comments, approvals, activity log or managed resources.
- Betting Table is a coordination UI, not an approval engine. Approve Batch must create or update Paperclip-native approvals/requests.
- Do not rely on agent.run.finished/failed/cancelled events until you run the event spike.
- Do not rely on company-scoped ctx.state until you run the state spike.

Your first actions:

1. Read `00_START_HERE_FOR_NEW_AI_AGENT.md`.
2. Read `docs/03_IMPLEMENTATION_PLAN_V1_2.md`, `docs/04_DATA_CONTRACTS.md`, `docs/05_PERSISTENCE_MATRIX.md`, and `docs/06_ACCEPTANCE_TESTS.md`.
3. Inspect `agents/` and `company-template/`.
4. Inspect `plugin-bos-light/`, but treat SDK calls as draft adapters until validated against the current Paperclip runtime.
5. Produce an implementation plan for Phase 1 and Phase 2 with explicit spike tasks C1-C7.
6. Implement Phase 1 first: 7 agents, AGENTS.md profiles, org chart, routing and rituals.
7. Only then implement the minimal plugin vertical slice.

Acceptance target:

- A1 passes: fresh Paperclip company imports 7 agents with AGENTS.md and org chart.
- A2-A5 pass: issues receive BPI, blueprints generate, Betting Table displays top-N, Approve creates native request.
- A6-A10 pass: gates and circuit breaker work with polling fallback.
- A11a-e pass: clearing plugin state does not destroy config, scores, betting cycle, gate results or decision records.

Before coding against Paperclip SDK, check the current Paperclip docs and runtime. This project deliberately isolates Paperclip-specific calls in `plugin-bos-light/src/paperclipAdapter.ts` and `plugin-bos-light/src/persistence.ts` so breaking SDK changes are localized.
