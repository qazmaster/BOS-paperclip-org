# Prompt to Give a New AI Agent

> **Current handoff note:** The active doctrine is the imported **BOS Light v1.4.1 package**. M001/M002 and legacy BOS Chimera materials remain useful historical context, but v1.4.1 controls whenever ownership, permission, trust-boundary or external-IO guidance conflicts.

You are a senior AI systems engineer taking over the BOS Chimera -> Paperclip adaptation project.

You know nothing from prior chats. Read this repository package before acting. Your task is to continue development of **BOS Light**, an organizational intelligence layer for Paperclip.

## Read first, in this order

1. `00_START_HERE_FOR_NEW_AI_AGENT.md`
2. `docs/BOS_Light_v1_4_1_CANONICAL_ORG.md`
3. `docs/BOS_Light_v1_4_1_Function_Migration_Matrix.md`
4. `docs/BOS_Light_v1_4_1_Tool_Permission_Matrix.md`
5. `docs/BOS_Light_v1_4_1_Data_Contracts.md`
6. `docs/BOS_Light_v1_4_1_Acceptance_Tests_A12_A20.md`
7. The v1.4.1 protocols in `skills/`
8. `BOS_M002_DEVELOPMENT_HANDOFF.md` and `HANDOFF_REAL_PAPERCLIP_IMPORT_TEST.md` for runtime-validation history.

## Non-negotiable architecture

- Do not build BOS Kernel.
- Do not build a separate event ledger, policy engine, workorder projector, spend ledger or 26-state machine.
- Paperclip remains the system of record for agents, issues, status, budget, heartbeat, governance, audit/activity and UI.
- BOS Light is an overlay: division routing, company template, role semantics, BPI prioritization, Product Blueprint, Betting Table, Circuit Breaker, Eval Gates and decision protocols.
- Durable decisions must be reflected in Paperclip-native or repo-local artifacts such as issue documents, comments, approvals, activity log, managed resources or committed markdown.
- Betting Table is a coordination UI, not an approval engine. Approve Batch must create or update Paperclip-native approvals/requests when that surface is proven.
- Do not rely on agent.run.finished/failed/cancelled events until you run the event spike.
- Do not rely on company-scoped `ctx.state` until you run the state spike.

## v1.4.1 trust and routing rules

- Div7.MissionControl accepts/fragments mission-level intent and strategic ambiguity.
- Div1.HCO owns routing, dispatch control, exception routing, staffing requests and circuit-breaker coordination.
- Div2.MasterPlanner owns BPI, blueprints, acceptance contracts and Betting Table candidates.
- Div3.Treasury owns budget/access feasibility, secret/access grants and cost/capacity risk.
- Div4.Production builds and delivers approved artifacts.
- Div5.QualificationsLibraryLearning owns independent qualification, quarantine, sanitized knowledge packets and memory/KB approval.
- Div6.External is the only division that touches web/search/live internet, customer/vendor/API interaction, external documents or external agents.
- Raw issue text and raw external evidence are untrusted until routed and qualified.

## First actions

1. Validate the handoff package:

   ```bash
   python3 scripts/validate_handoff.py
   ```

2. Inspect `agents/` and `company-template/` for the existing company-template baseline.
3. Inspect `plugin-bos-light/`, but treat SDK calls as draft adapters until validated against the current Paperclip runtime.
4. If planning implementation, map work to v1.4.1 divisions and A12-A20 in addition to legacy A1-A11.
5. If performing live runtime validation, follow `HANDOFF_REAL_PAPERCLIP_IMPORT_TEST.md` and preserve its proof boundary.

## Acceptance target

BOS Light should remain locally honest and Paperclip-native:

- A1 passes: fresh Paperclip company imports the seven-division template with AGENTS.md and org chart.
- A2-A5 pass: issues receive BPI, blueprints generate, Betting Table displays top-N, Approve creates native request when proven.
- A6-A10 pass: gates and circuit breaker work with polling fallback.
- A11a-e pass: clearing plugin state does not destroy config, scores, betting cycle, gate results or decision records.
- A12-A20 pass: v1.4.1 routing, permission, quarantine, staffing, circuit-breaker, treasury/access and external-IO boundaries are preserved.

Before coding against Paperclip SDK, check the current Paperclip docs and runtime. This project deliberately isolates Paperclip-specific calls in `plugin-bos-light/src/paperclipAdapter.ts` and `plugin-bos-light/src/persistence.ts` so breaking SDK changes are localized.
