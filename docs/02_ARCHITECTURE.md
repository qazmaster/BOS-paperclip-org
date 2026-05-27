# 02 - Architecture

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
User vague issue
  -> Div2.MasterPlanner triages
  -> piko:bpi-score computes BPI
  -> issue receives bpi_score + producer_division
  -> if score passes cutline: piko:blueprint-gen creates 5-section issue document
  -> Betting Table collects candidates
  -> human/master clicks Approve Batch
  -> plugin creates Paperclip-native approval/request
  -> issue moves into work via Paperclip workflow
  -> agent completes work
  -> Eval Gates run
  -> if pass: ACCEPTED/RELEASED overlay
  -> if fail: CORRECTION_REQUIRED overlay + guidance
  -> if repeated run failures: Circuit Breaker OPEN + escalation issue
```

## Runtime boundary

Plugin code may compute, annotate and request. It should not silently decide approvals, mutate core governance invariants, bypass budget hard-stops, bypass auth or own a hidden source of truth.
