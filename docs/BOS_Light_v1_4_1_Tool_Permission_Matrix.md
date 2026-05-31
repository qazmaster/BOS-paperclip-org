# BOS Light v1.4.1 Tool Permission Matrix

Status: canonical v1.4.1 permission reference.
Purpose: define which division may request, grant, or use tool classes.

## Permission states

- Owns: division is accountable for the surface or decision.
- May use: division may directly use the tool class when routed and scoped.
- May request: division must route a request through Div1.HCO and the owning division.
- Prohibited: division must not use or bypass the tool class.

## Tool classes

| Tool class | Div7.MissionControl | Div1.HCO | Div2.MasterPlanner | Div3.Treasury | Div4.Production | Div5.QualificationsLibraryLearning | Div6.External |
|---|---|---|---|---|---|---|---|
| Paperclip issue/status/comment surfaces | May use for mission/policy records | Owns routing/status use | May use shaped artifacts | May use grant records | May use implementation evidence | May use gate/quarantine evidence | May use only routed external evidence records |
| Repo read/write and local build/test tools | Prohibited unless policy task | May request | May request for planning artifacts | May request for grant artifacts | May use for approved implementation | May use for verification artifacts | Prohibited except approved evidence packaging |
| Terminal/subprocess execution | Prohibited | May request | Prohibited | Prohibited except local grant checks | May use when task grant requires | May use for validation commands | Prohibited unless external tool wrapper is explicitly granted |
| Web/search/live internet | Prohibited | Prohibited | Prohibited | Prohibited | Prohibited | Prohibited for raw collection | Owns and may use when routed |
| Customer/vendor communication | Prohibited | Prohibited | Prohibited | Grants access only | Prohibited | Prohibited | Owns and may use when routed |
| External APIs/services | Prohibited | Prohibited | Prohibited | Grants scoped access | Prohibited | Prohibited except validation of sanitized outputs | Owns use after Div3 grant |
| Secrets and credentials | Prohibited | Prohibited except route metadata | Prohibited | Owns grant/deny decisions; never exposes plaintext | May receive scoped runtime access only if approved | May validate non-secret evidence only | May receive scoped runtime access only if approved |
| Local RAG/library search | May consume sanitized packets | May request | May request | May request budget/access records | May request | Owns and may use | May request only through Div5 |
| KB or memory write | Prohibited | May request | May request | May request grant records | May request | Owns approval after sanitization | Prohibited |
| Eval Gate execution | Prohibited | May route | May request | Provides budget inputs | Provides implementation evidence | Owns and may use | Prohibited |
| Circuit Breaker stop/retry/escalate control | Strategic escalation only | Owns operational control | May request | May provide budget/access impact | May provide failure evidence | Provides gate/failure evidence | May provide external failure evidence |
| Budget/capacity grants | Prohibited | May route | May request | Owns grant/deny | May request | May request for verification cost | May request for paid/API access |
| Staffing, hats, post assignment | Strategic policy only | Owns operational request/assignment flow | May request | Provides budget/access feasibility | May request | Recommends based on quality/performance evidence | May request external specialist sourcing only when routed |

## Non-negotiable prohibitions

1. Div6.External is the only division allowed to interact with web, customers, vendors, external APIs, external services and external agents.
2. Div6.External must return raw evidence only to Div5. It must not route raw evidence directly to Div2, Div4 or Div7.
3. Div5 must not perform raw external collection. It quarantines, validates, sanitizes and approves internal reuse.
4. Div3.Treasury grants permissions and budget but must not use external tools directly.
5. Div1.HCO routes and controls dispatch but must not perform external IO or create budget/access grants.
6. Div2 and Div4 must not use web/search or raw external evidence directly.
7. No division may hide approvals, decisions, budget events or gate results only in plugin state.

## Grant shape

A tool grant must include:

- requester division;
- owning/granting division;
- tool class;
- purpose;
- scope;
- allowed inputs;
- forbidden inputs;
- expiration or review condition;
- evidence artifact path or Paperclip reference;
- revocation condition.

## Failure behavior

If a division lacks permission, the correct behavior is to stop and route a request through Div1.HCO. The agent must not silently substitute a different tool, create an untracked credential path, or downgrade an external IO request into direct planner/production research.
