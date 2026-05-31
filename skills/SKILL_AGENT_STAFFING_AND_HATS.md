# Skill: Agent Staffing and Hats

Status: canonical v1.4.1 protocol.
Owner: Div1.HCO.

## Purpose

Manage operational staffing, hats, job descriptions, workload balancing and parallel-agent requests without bypassing budget/access controls or quality evidence.

## Triggers

Use this protocol when:

- a division is overloaded;
- repeated failures suggest underperformance or missing capability;
- work can be safely parallelized;
- a new hat/post/job description is proposed;
- an external specialist or service may be needed;
- routing queues or circuit-breaker data show sustained bottlenecks.

## Inputs

- Workload evidence, queue state or issue references.
- Div5 quality/performance evidence when available.
- Div4 blocker reports when implementation is affected.
- Div3 budget/access feasibility if staffing adds cost, tools or credentials.
- Proposed hat/post scope and permissions.

## Procedure

1. Div1.HCO classifies the staffing trigger: overload, underperformance, missing-capability, parallelization or external-specialist.
2. Gather evidence from Div5, Div4, runtime status or Paperclip issue history.
3. Define the proposed hat/post with responsibilities, allowed tools, forbidden tools and review condition.
4. If the change needs budget, credentials, paid tools or extra capacity, route to Div3.Treasury for feasibility.
5. If the change needs external sourcing, route through the External IO Gateway.
6. Record the assignment or denial in a visible artifact.
7. Set a review condition and revocation condition.

## Outputs

- StaffingHatRequest.
- Hat/post description.
- Div3 budget/access decision when needed.
- Assignment, denial or escalation record.

## Guardrails

- HCO owns staffing flow but cannot mint budget or wildcard permissions.
- Staffing changes must not hide unreviewed external agents inside internal work.
- External specialists are external IO and must pass through Div6 and Div5 quarantine.
- Underperformance decisions must cite evidence, not vibes.
- New hats must reduce operational load, not add bureaucracy.

## Failure behavior

If evidence is insufficient, create a time-boxed observation request or escalate. If budget/access is denied, revise scope or pause. If a proposed hat crosses external IO or secret boundaries, require Div3 and Div5 controls before assignment.
