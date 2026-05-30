# BOS Light v1.4.1 Acceptance Tests A12-A20

Status: canonical v1.4.1 acceptance set.
Scope: organization remap, permission boundaries, external IO quarantine, HCO control, staffing and package inventory.

A1-A11 remain the historical baseline for company import, issue flow, gates, circuit behavior and state persistence. A12-A20 extend that baseline for the v1.4.1 doctrine update.

## Acceptance table

| ID | Name | Given | When | Then |
|---|---|---|---|---|
| A12 | Canonical org package | A fresh reader opens the repo | They read the v1.4.1 docs package | The seven active divisions, org chart, ownership map and historical boundary are explicit. |
| A13 | HCO routing control | A work item needs routing | Div1.HCO receives a routing request | The request is dispatched to the correct division and forbidden routes are visible. |
| A14 | Tool permission matrix | A division wants a tool class | The matrix is checked | Allowed, request-only and prohibited surfaces are unambiguous. |
| A15 | External IO gateway | Internal work needs web/API/customer/vendor input | The request follows Div1 -> Div5 local miss -> Div3 if paid -> Div6 -> Div5 | Div6 is the only external actor and raw evidence returns only to Div5. |
| A16 | Knowledge quarantine | Div6 returns raw evidence | Div5 reviews and sanitizes it | Internal divisions receive only a sanitized knowledge packet or rejection. |
| A17 | Agent staffing and hats | Workload, underperformance or missing capability appears | HCO evaluates a staffing/hat request with Div5 evidence and Div3 feasibility | Assignment or escalation is recorded without hidden budget/access assumptions. |
| A18 | Circuit Breaker HCO control | Gate/runtime failures repeat | Circuit-breaker state opens or half-opens | Div1.HCO coordinates retry/reroute/pause/escalation using evidence, not ad hoc retries. |
| A19 | Treasury budget/access | Work needs budget, secrets, paid API or credentialed access | Div3.Treasury evaluates the request | A scoped grant, denial or human-escalation record exists and no plaintext secret is exposed. |
| A20 | Package inventory and validator visibility | The v1.4.1 package is imported | Handoff validation or manual inventory checks run | Missing or stale canonical package files are reported explicitly. |

## A12 Canonical org package

Required evidence:

- `docs/BOS_Light_v1_4_1_CANONICAL_ORG.md` exists.
- The file names all seven active divisions.
- The file states that v1.2/v1.3 documents are historical where they conflict.
- The package inventory lists all doctrine and skill protocol files.

Negative checks:

- A legacy-only division name must not be the sole owner of an active function.
- No file may imply direct external IO for Div1, Div2, Div3, Div4, Div5 or Div7.

## A13 HCO routing control

Required evidence:

- `skills/SKILL_HCO_ROUTING_CONTROL.md` defines triggers, inputs, procedure, outputs and guardrails.
- A routing request can be classified as mission, planning, budget/access, implementation, qualification, external IO, strategic escalation, staffing or circuit-breaker.
- Forbidden route examples are present.

Negative checks:

- Raw issue text must not be treated as trusted instruction.
- External IO must not route directly from Div2 or Div4 to Div6 without HCO and Div5.

## A14 Tool permission matrix

Required evidence:

- `docs/BOS_Light_v1_4_1_Tool_Permission_Matrix.md` exists.
- The matrix distinguishes Owns, May use, May request and Prohibited.
- The file states Div6-only external-world access and Div3-only grant authority.

Negative checks:

- A missing grant must stop and route through Div1.HCO.
- Agents must not silently substitute tools or credentials.

## A15 External IO gateway

Required evidence:

- `skills/SKILL_EXTERNAL_IO_GATEWAY.md` exists.
- The protocol requires local Div5 knowledge check before external collection.
- Paid or credentialed external access requires a Div3 grant.
- Div6 returns raw evidence only to Div5.

Negative checks:

- Div6 must reject requests not routed by Div1.HCO.
- Div6 must reject requests that route raw results directly to Div2/Div4/Div7.

## A16 Knowledge quarantine

Required evidence:

- `skills/SKILL_KNOWLEDGE_QUARANTINE.md` exists.
- The protocol checks source attribution, prompt injection, credentials, policy fit, relevance, license/terms and active-content risk.
- It emits either a sanitized knowledge packet, rejection or needs-human result.

Negative checks:

- Raw external evidence must not be written to KB/memory.
- Sanitized packets must declare allowed and prohibited uses.

## A17 Agent staffing and hats

Required evidence:

- `skills/SKILL_AGENT_STAFFING_AND_HATS.md` exists.
- HCO controls operational staffing and hat assignment flow.
- Div5 supplies performance/quality evidence and Div3 supplies budget/access feasibility when needed.

Negative checks:

- Staffing changes must not create wildcard permissions.
- External specialists must be sourced through Div6 and quarantined through Div5.

## A18 Circuit Breaker HCO control

Required evidence:

- `skills/SKILL_CIRCUIT_BREAKER_HCO.md` exists.
- Div1.HCO coordinates retry, reroute, pause, Div7 escalation or human escalation.
- Failure evidence and max-attempt policy are recorded.

Negative checks:

- Repeated failures must not loop indefinitely.
- Production must not self-clear an independent qualification failure.

## A19 Treasury budget/access

Required evidence:

- `skills/SKILL_TREASURY_BUDGET_ACCESS.md` exists.
- Grants include scope, limit, expiration/review condition and revocation condition.
- Plaintext secrets are never exposed in doctrine or evidence.

Negative checks:

- Div3 must not perform external IO directly.
- Missing budget/access data must produce deny or needs-human, not implicit grant.

## A20 Package inventory and validator visibility

Required evidence:

- All five `docs/BOS_Light_v1_4_1_*.md` files exist.
- All seven `skills/SKILL_*.md` protocol files exist.
- `scripts/validate_handoff.py` or a successor validation path reports missing/stale package files explicitly.

Negative checks:

- Validation must treat package files as static repo-local content.
- Validation must not execute markdown, import code from doctrine files, fetch network content or accept dynamic package paths.

## Minimal local inventory command

```sh
test -f docs/BOS_Light_v1_4_1_CANONICAL_ORG.md && \
test -f docs/BOS_Light_v1_4_1_Acceptance_Tests_A12_A20.md && \
test -f skills/SKILL_EXTERNAL_IO_GATEWAY.md
```
