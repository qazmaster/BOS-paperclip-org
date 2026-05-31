# BOS Light v1.4.1 Function Migration Matrix

Status: canonical v1.4.1 migration reference.
Purpose: map legacy BOS Light functions to the active v1.4.1 owner, route and permission boundary.

## Migration principles

1. Paperclip-native artifacts remain the durable surface for issues, status, decisions, approvals and evidence.
2. v1.4.1 separates routing, planning, budget/access, production, qualification, external IO and strategy into explicit divisions.
3. External-world contact moves behind Div6.External and Div5 quarantine.
4. Budget and access grants move behind Div3.Treasury.
5. Operational routing and staffing move to Div1.HCO.
6. Older v1.2 terms remain historical labels only when a v1.4.1 owner exists.

## Function matrix

| Function | Legacy or ambiguous placement | v1.4.1 owner | Required route | Migration note |
|---|---|---|---|---|
| Human mission intake | Div1 / executive layer | Div7.MissionControl | Human -> Div7 -> Div1.HCO | Div7 frames high-level intent before routine routing. |
| Routine task routing | Div1 executive or ad hoc agent | Div1.HCO | Div7/issue -> Div1.HCO -> target division | HCO owns routing policy and exception dispatch. |
| Backlog shaping | Planner/production mixed | Div2.MasterPlanner | Div1.HCO -> Div2 | Div2 creates BPI, blueprint, acceptance and candidate batch. |
| BPI scoring | Planning helper | Div2.MasterPlanner | Div1.HCO -> Div2, with Div3 budget snapshot as needed | Budget inputs are requested from Div3, not invented by Div2. |
| Product Blueprint | Planning helper | Div2.MasterPlanner | Div1.HCO -> Div2 -> Div1.HCO | Blueprint is an inert Paperclip artifact. |
| Betting Table | Planning/approval helper | Div2.MasterPlanner with Div3 feasibility | Div1.HCO -> Div2 -> Div3 -> Div1.HCO | Batch approval remains visible in Paperclip. |
| Budget reference and cost fit | Div6.Resources or generic resource role | Div3.Treasury | Div1.HCO -> Div3 | Div3 is the active v1.4.1 budget/access owner. |
| Secret or external API access | Ad hoc environment setup | Div3.Treasury grants, Div6.External uses | Div1.HCO -> Div3 -> Div6 | Grants must be scoped; Div3 does not perform IO. |
| Implementation | Div3.Production in earlier agent set | Div4.Production | Div1.HCO -> Div4 | v1.4.1 names build/delivery as Div4. |
| Local smoke/regression execution | Production or operations | Div4.Production | Div1.HCO -> Div4 | Div4 can run local build/test tools within the task grant. |
| Independent QA verdict | Production self-check | Div5.QualificationsLibraryLearning | Div4 -> Div5 -> Div1.HCO | Div4 self-check is not independent qualification. |
| Eval Gate evidence | Div5.Qualifications | Div5.QualificationsLibraryLearning | Div1.HCO -> Div5 | Div5 owns LARS gates and correction guidance. |
| Security/library review | Div5.Qualifications | Div5.QualificationsLibraryLearning | Div1.HCO -> Div5 | Div5 validates before internal reuse. |
| Knowledge base write | Any agent memory write | Div5.QualificationsLibraryLearning approval | Div1.HCO -> Div5 | Raw content must be sanitized first. |
| Local RAG/library search | Any agent | Div5.QualificationsLibraryLearning | Requester -> Div1.HCO -> Div5 | Local knowledge is checked before external research. |
| External research | Direct web/search by planner or builder | Div6.External | Div1.HCO -> Div5 local miss -> Div3 if paid -> Div6 -> Div5 | Div6 returns raw evidence only to Div5. |
| Customer/vendor/API contact | Ad hoc external operation | Div6.External | Div1.HCO -> Div3 when paid/credentialed -> Div6 -> Div5 | External contact is DMZ-bound. |
| Raw external evidence handling | Direct use by downstream agents | Div5 quarantine | Div6 -> Div5 -> Div1.HCO | Raw evidence is never routed directly to Div2/Div4/Div7. |
| Circuit Breaker control | Gate or runtime subsystem | Div1.HCO with Div5 evidence and Div7 escalation | Div5 signal -> Div1.HCO -> Div4/Div7 as needed | HCO coordinates stop/retry/escalate decisions. |
| Strategic ambiguity | Ad hoc escalation | Div7.MissionControl | Div1.HCO -> Div7 | Div7 handles complex, chaotic or policy-level terrain. |
| Staffing, hats and role assignments | Human or ad hoc runtime state | Div1.HCO, with Div3 budget/access and Div5 performance evidence | Div5/Div4 signal -> Div1.HCO -> Div3 as needed | HCO proposes and routes staffing changes; it does not mint budget. |
| Runtime adapter lifecycle | Plugin implementation detail | Paperclip plus Div4/Div5 evidence | Div1.HCO -> Div4 build -> Div5 validate | Adapter state must not become hidden source of truth. |

## Compatibility aliases

Older files may still reference these roles. Treat them as aliases only when interpreting historical context:

| Historical label | Active v1.4.1 interpretation |
|---|---|
| Div1.Executive | Split between Div7.MissionControl for mission authority and Div1.HCO for routing/dispatch. |
| Div3.Production | Div4.Production for build/delivery. |
| Div4.Operations | Operational concerns feed Div1.HCO and Div7 escalation; routine production remains Div4. |
| Div5.Qualifications | Div5.QualificationsLibraryLearning. |
| Div6.Resources | Div3.Treasury for budget/access; Div6.External for external-world DMZ. |
| Div7.Strategy | Div7.MissionControl strategy and policy escalation. |

## Migration acceptance

A migrated function is complete when:

- it has exactly one primary v1.4.1 owner;
- it declares the required route;
- it names the trust boundary for untrusted input, secrets, budget or external IO;
- it persists decisions and evidence in Paperclip-native or repo-local artifacts, not hidden plugin state;
- downstream agents can tell whether a legacy reference is historical or active.
