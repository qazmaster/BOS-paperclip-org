# SKILL_HCO_ROUTING_CONTROL

## Purpose

Define how Div1.HCO controls routing without becoming a manual bottleneck.

## Core principle

```text
Div1 owns routing doctrine.
A deterministic router / Paperclip-native automation executes routine routing.
Div1 reviews exceptions.
```

## Inputs

- Mission Brief from Div7.
- Issue/task content.
- BPI/Blueprint availability.
- Budget/access signals from Div3.
- Knowledge availability signals from Div5.
- External IO requirement signals.
- Workload/load signals.
- Circuit Breaker state.
- Risk signals.

## Outputs

- `HcoRoutingDecision`.
- target division.
- target agent_id.
- exception queue item.
- escalation route.

## RouteMode

```ts
type RouteMode =
  | "AUTO_ROUTED"
  | "DIV1_REVIEW_REQUIRED"
  | "DIV3_BUDGET_REQUIRED"
  | "DIV5_KNOWLEDGE_REQUIRED"
  | "DIV6_EXTERNAL_REQUIRED"
  | "DIV7_STRATEGIC_ESCALATION";
```

## Auto-routing conditions

A task may be auto-routed only when all are true:

- division is clear;
- task type maps cleanly to routing table;
- budget/access is available or unnecessary;
- risk is low;
- no active Circuit Breaker;
- target agent load is below threshold;
- no conflicting owner;
- no external IO required;
- no strategic ambiguity.

## Exception conditions

Send to Div1 review if:

- route confidence is low;
- multiple divisions could own the work;
- issue has raw external content;
- external IO is requested;
- budget/access is missing;
- target agent overloaded;
- repeated failure detected;
- Circuit Breaker is HALF_OPEN/OPEN;
- strategic ambiguity exists.

## Canonical routing table

| Signal | Route |
|---|---|
| High-level mission | Div7.MissionControl first |
| Communication/routing/escalation | Div1.HCO |
| Shaping/BPI/Blueprint | Div2.MasterPlanner |
| Budget/access/resources | Div3.Treasury |
| Build/implementation | Div4.Production |
| Independent QA/KB/learning | Div5.QualificationsLibraryLearning |
| External web/customer/vendor/API | Div6.External |
| Strategic/policy ambiguity | Div7.MissionControl |

## Fail-closed rules

- If external IO is detected from an internal division, block and route to Div1.
- If no clear owner exists, route to Div1 review.
- If budget/access required but missing, route to Div3.
- If raw external evidence appears, route to Div5 quarantine.
- If repeated execution failure appears, route to Div1 Circuit Breaker.

## Failure behavior

If routing is ambiguous after classification, escalate to Div7.MissionControl for strategic clarification or request human input. If a division lacks required permissions, halt and route a grant request through Div3.Treasury. If repeated failures occur, trigger Circuit Breaker protocol.
