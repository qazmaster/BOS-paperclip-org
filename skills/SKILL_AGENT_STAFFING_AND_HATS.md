# SKILL_AGENT_STAFFING_AND_HATS

## Purpose

Define Div1.HCO ownership of posts, hats, job descriptions, workload control and staffing requests.

## Owner

Div1.HCO owns:

- posts;
- hat profiles;
- job descriptions;
- agent assignment to posts;
- role changes;
- workload monitoring;
- capacity monitoring;
- underperformance detection;
- parallel-agent requests;
- agent replacement/reassignment;
- external service/agent sourcing requests.

## Inputs

Div1 uses:

- Div5 performance evidence;
- Div4 blocker/failure reports;
- Div3 budget/capacity signals;
- Paperclip task load;
- Cycle metrics;
- Correction loop counts;
- Gate failure rates;
- Agent availability;
- Mission priority from Div7.

## Staffing flow

```text
Div5 detects repeated failure / poor quality / missing skill / overload evidence
  -> sends evidence to Div1.HCO

Div1 reviews:
  - is the agent overloaded?
  - is the hat unclear?
  - was routing wrong?
  - is access/tooling missing?
  - is parallel capacity needed?
  - is an external service/agent needed?

If budget/access/resources needed:
  -> Div1 requests Div3.Treasury

If external service/agent needed:
  -> Div1 routes through Div6.External

If hat/profile update needed:
  -> Div1 updates or approves hat change

If strategic org redesign needed:
  -> Div1 escalates to Div7.MissionControl

Div5 later verifies whether the change improved performance.
```

## Hat profile minimum sections

Every AGENTS.md / hat profile must include:

- Role;
- Valuable Final Product / ЦКП;
- Owns;
- Does Not Own;
- Inputs;
- Outputs;
- Allowed Tools;
- Forbidden Tools;
- Routing Rules;
- Escalation Rules;
- Paperclip Runtime Boundary;
- Security Invariants;
- Acceptance Checks.

## Decision authority

Div1 can approve operational hat updates.

Div7 must approve strategic/org redesign.

Div3 must approve funding/resource grants.

Div6 must source external services/agents.

Div5 verifies evidence and improvement results.

## Acceptance

- Div1 can detect overload.
- Div1 can request Div3 budget for parallel agent.
- Div1 can route external sourcing to Div6.
- Div5 provides evidence but does not make the staffing decision.

## Failure behavior

If no qualified agent is available for a role, escalate to Div1.HCO for staffing decision. If agent is overloaded, route to another qualified agent or queue the work.
