# SKILL_TREASURY_BUDGET_ACCESS

## Purpose

Define Div3.Treasury ownership over budget, access, permissions, resources and capacity.

## Owner

Div3.Treasury owns:

- budget;
- token limits;
- cost limits;
- compute/resource allocation;
- access grants;
- permission grants;
- secret/tool access policy;
- capacity funding;
- parallel-agent funding;
- external service funding.

## Inputs

Div3 receives requests from Div1.HCO:

- task budget feasibility;
- access/tool grant;
- model/tool spend limit;
- external API/service access;
- parallel agent budget;
- external service/vendor spend;
- capacity increase.

## Outputs

Div3 emits:

- budget grant/refusal;
- access grant/refusal;
- resource grant/refusal;
- spend warning;
- capacity warning;
- funding decision.

## External IO relation

Div3 does not interact with external world.

Div3 may grant Div6.External permission/budget to interact with external APIs, vendors, services, clients or external agents.

## Guardrails

- No plaintext secrets in agent instructions.
- No wildcard permissions.
- Grants must be task/post scoped where possible.
- External API/service access must be granted only to Div6.
- Production repo/tool access must match Div4 post and task.
- Budget/cost approvals must be visible in Paperclip-native artifacts when possible.

## Routing

```text
Div1 request -> Div3 decision -> Div1 route/dispatch
```

For external IO:

```text
Div1 -> Div3 grant -> Div6 executes external interaction -> Div5 validates evidence
```

## Acceptance

- Div6 external API use requires Div3 grant.
- Parallel agents require Div3 funding.
- Div3 does not browse/search/contact vendors directly.
- Budget/access evidence is available to Div5 gate checks.

## Failure behavior

If grant request exceeds budget limits, escalate to Div1.HCO or Div7.MissionControl. If external access is requested by non-Div6 division, deny and route through Div6.External. If TTL exceeds maximum, deny with explanation.
