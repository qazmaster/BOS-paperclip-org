# 02 - Architecture

> **Historical v1.2 baseline:** This architecture document describes the original three-layer design. The active operating model is the **BOS Light v1.4.1 package**. Division ownership, routing rules, and trust boundaries in this document are consistent with v1.4.1, but v1.4.1 is authoritative where any conflict exists.

## Three layers

### 1. Concept Layer - BOS

This layer defines organizational meaning.

Components:

- 7 divisions;
- role semantics;
- VFP: Valuable Final Product per division;
- Hat profiles;
- BPI;
- Betting Table;
- Product Blueprint;
- Circuit Breaker;
- Eval Gates;
- Div7 Decision Protocol;
- guardrails and routing rules.

### 2. Adaptation Layer - BOS Light Plugin

This layer maps BOS concepts onto Paperclip surfaces.

Examples:

- `bpi_score` -> issue-scoped state + issue document/comment fallback;
- `bos_status` -> issue detail overlay + label/comment fallback;
- Product Blueprint -> Paperclip-native issue document;
- Betting Table -> dashboard widget + Paperclip-native approval/request;
- Gate Result -> review checklist/comment/document;
- Decision Record -> issue comment/document;
- Circuit State -> dashboard/detail tab + polling/activity-log fallback.

### 3. Execution Layer - Paperclip

Paperclip remains ground truth.

Ground-truth surfaces:

- agents;
- org chart;
- issues/tasks;
- issue status;
- budget/cost controls;
- heartbeat execution;
- governance and approvals;
- events;
- activity/audit log;
- UI;
- database.

## Component map

| BOS component | Paperclip form | Priority |
|---|---|---:|
| 7-Division Org Board | Company template: 7 agents, org chart, reporting lines | P0 |
| Hat profiles | AGENTS.md per division | P0 |
| BPI scoring | Agent tool `piko:bpi-score` | P0 |
| Product Blueprint | Issue document template with 5 sections | P0 |
| Betting Table | Dashboard widget, coordination surface | P0 |
| Circuit Breaker | Plugin state + polling/activity fallback + escalation issue | P1 |
| Eval Gates | Review checklist/comments/documents | P1 |
| Div7 Decision Protocol | Agent tool `piko:decide` | P2 |

## Data flow

```text
Human mission/goal
  -> Div7.MissionControl frames intent
  -> Div1.HCO routes and dispatches under policy
  -> deterministic/Paperclip-native routing under Div1 policy
  -> Div2 / Div3 / Div4 / Div5 / Div6 according to route
  -> Div1 receives status/correction/escalation signals
  -> Div7 only for strategic/policy-level escalation
```

## Runtime boundary

Plugin code may compute, annotate and request, but it should not silently decide approvals, mutate core governance invariants, bypass budget hard-stops, bypass auth, own a hidden source of truth, or receive raw external IO. This boundary is the implementation shape behind R013, R014, and R015.
