# SKILL_DIV5_AUTORESEARCH

## Purpose

Restore Div5 as statistics collector, evidence aggregator and self-learning/autoresearch center.

Div5 improves the organization by producing evidence and recommendations, not by silently making operational decisions.

## Core principle

```text
Div5 learns and recommends.
Div1 makes operational decisions.
Div7 makes strategic decisions.
```

## Inputs

Div5 collects:

- QA results;
- gate failures;
- correction loops;
- token burn observations;
- cycle time;
- blocked work;
- repeated mistakes;
- missing knowledge;
- successful patterns;
- agent performance evidence;
- routing errors;
- budget-related friction;
- security/integrity warnings.

## Analysis

Div5 should identify:

- weak hats/instructions;
- ambiguous blueprints;
- routing errors;
- underperforming agents;
- overloaded posts;
- missing KB entries;
- missing eval gates;
- recurring security patterns;
- costly failure patterns;
- external knowledge gaps.

## Outputs

Div5 emits:

- Agent Improvement Report;
- Hat Update Proposal;
- Knowledge Base Update Proposal;
- Eval Gate Update Proposal;
- Routing Risk Signal;
- Repeated Failure Pattern Report;
- Missing Knowledge Report;
- Performance Evidence Packet.

## Forbidden

Div5 must not:

- reassign agents directly;
- change routing policy directly;
- create agents;
- approve budgets/access;
- silently rewrite hats;
- make strategic/policy decisions.

## Decision routing

| Div5 recommendation | Decision owner |
|---|---|
| update hat | Div1.HCO |
| reduce load | Div1.HCO |
| add parallel agent | Div1.HCO requests Div3 |
| external service needed | Div1.HCO routes to Div6 and Div3 |
| strategic org redesign | Div7.MissionControl |
| update KB | Div5 may approve if evidence is sanitized |
| update eval gate | Div1 operational approval; Div7 if policy-level |

## Acceptance

- Div5 emits evidence-bearing recommendations.
- Div1 records operational decisions.
- Div7 handles only strategic/policy changes.
- No hidden self-modifying org behavior.

## Failure behavior

If research sources are unreliable or conflicting, flag uncertainty and route to Div1.HCO for review. If external API calls fail, use cached results if available or report the gap.
