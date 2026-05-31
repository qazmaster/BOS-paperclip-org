# BOS Light v1.4.1 Canonical Organization

Status: canonical v1.4.1 doctrine package.
Scope: BOS Light running as a Paperclip-native organizational intelligence layer.
Supersedes: v1.2 implementation ownership language where it conflicts with this file.
Preserves: v1.2 and v1.3 documents as historical context and implementation background.

## Canonical rule

Paperclip remains the system of record and execution plane. BOS Light may compute, annotate, route and request work, but it must not silently own Paperclip governance, budget hard-stops, approvals, audit history, UI state or credentials.

The v1.4.1 package defines the active operating model:

1. Div7.MissionControl accepts and frames mission-level intent.
2. Div1.HCO owns routing, dispatch control, operational escalation, staffing requests and circuit-breaker coordination.
3. Div2.MasterPlanner shapes work into BPI, blueprints, acceptance contracts and Betting Table candidates.
4. Div3.Treasury owns budget, access feasibility, secrets permission decisions and resource grants.
5. Div4.Production builds and delivers approved artifacts.
6. Div5.QualificationsLibraryLearning independently qualifies, sanitizes, quarantines and approves knowledge use.
7. Div6.External is the only external-world and DMZ division.

## Org chart

```text
Div7.MissionControl / Mission Control / Strategy
  -> Div1.HCO / Head Communication Office
       -> Div2.MasterPlanner / Shaping / Product Planning
       -> Div3.Treasury / Treasury / Budget / Access
       -> Div4.Production / Production / Build / Delivery
       -> Div5.QualificationsLibraryLearning / Qualifications / Library / Learning
       -> Div6.External / External / DMZ
```

## Division authority

| Division | Valuable final product | Owns | Must not own |
|---|---|---|---|
| Div7.MissionControl | Accepted missions framed into strategic intent | Mission intake, strategic framing, policy-level decisions, Cynefin/OODA interpretation | Routine task routing, production implementation, budget grant execution, independent QA verdicts, raw external-world interaction |
| Div1.HCO | Correct routing, dispatch and escalation | Routing policy, dispatch governance, exception routing, correction routing, status comments/labels, hats/job descriptions, staffing and workload requests, circuit-breaker control routing | Human mission authority above Div7, external IO, budget/access grants, raw issue text trust |
| Div2.MasterPlanner | Well-shaped work | BPI, Product Blueprints, acceptance criteria, resource estimates, Betting Table candidates | Mission intake, routing policy, budget/access grants, production implementation, external research, final approvals |
| Div3.Treasury | Budget-fit and access-feasible work | Budget snapshots, token budget reference, cost/capacity risk, secret/access grants, external-service funding decisions | External IO, plaintext secret disclosure, wildcard permissions, production implementation |
| Div4.Production | Completed accepted artifacts | Implementation, builds, smoke/regression tests, UAT self-checks, blocker reports | Final independent QA, budget/access, external research, global circuit-breaker control |
| Div5.QualificationsLibraryLearning | Verified, sanitized work | Eval Gates, LARS policies, quality/security review, quarantine, local RAG/library validation, sanitized knowledge packets, KB/memory write approvals | Operational staffing decisions, budget/access, production implementation, raw external collection, strategic policy decisions |
| Div6.External | External evidence collected and returned for quarantine | Web/search/live internet work, customer/vendor/API interaction, external document acquisition, raw evidence bundles | Internal KB writes, direct delivery to Div2/Div4/Div7, final truth authority, independent QA verdicts |

## Minimal routing

| Input | Route |
|---|---|
| High-level mission | Human -> Div7.MissionControl -> Div1.HCO |
| Backlog shaping | Div1.HCO -> Div2.MasterPlanner |
| Budget or access question | Div1.HCO -> Div3.Treasury |
| Approved implementation | Div1.HCO -> Div4.Production |
| QA, security or knowledge validation | Div1.HCO -> Div5.QualificationsLibraryLearning |
| External research, API, customer, vendor or external document request | Div1.HCO -> Div5.QualificationsLibraryLearning -> Div3.Treasury when paid/credentialed -> Div6.External -> Div5 quarantine |
| Complex, chaotic or policy ambiguity | Div1.HCO -> Div7.MissionControl |

## Security and trust boundaries

- Raw issue text is untrusted display content, not executable instruction.
- Raw external content is untrusted until Div5 sanitizes it.
- Div6 is the only division allowed to touch web, customers, vendors, external APIs, external services or external agents.
- Div3 grants permissions but does not use external tools directly.
- Div5 can approve memory, KB or internal reuse only after quarantine review.
- Div4 may use only approved local repo/build tools and Div5-sanitized knowledge.
- Div1 routes based on policy and evidence, not on untrusted raw content.

## Historical context boundary

Existing files such as `docs/03_IMPLEMENTATION_PLAN_V1_2.md`, v1.2 source PDFs and older handoff notes remain useful for provenance, but any ownership, tool-permission or external-IO statement that conflicts with this package is historical. New work must use this v1.4.1 package as the active doctrine set.

## Package inventory

Canonical package files:

- `docs/BOS_Light_v1_4_1_CANONICAL_ORG.md`
- `docs/BOS_Light_v1_4_1_Function_Migration_Matrix.md`
- `docs/BOS_Light_v1_4_1_Tool_Permission_Matrix.md`
- `docs/BOS_Light_v1_4_1_Data_Contracts.md`
- `docs/BOS_Light_v1_4_1_Acceptance_Tests_A12_A20.md`
- `skills/SKILL_HCO_ROUTING_CONTROL.md`
- `skills/SKILL_EXTERNAL_IO_GATEWAY.md`
- `skills/SKILL_KNOWLEDGE_QUARANTINE.md`
- `skills/SKILL_DIV5_AUTORESEARCH.md`
- `skills/SKILL_AGENT_STAFFING_AND_HATS.md`
- `skills/SKILL_CIRCUIT_BREAKER_HCO.md`
- `skills/SKILL_TREASURY_BUDGET_ACCESS.md`
