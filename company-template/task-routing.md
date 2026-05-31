# Task Routing Rules

| Input | Primary division | Secondary division | Notes |
|---|---|---|---|
| High-level mission | Div7.MissionControl | Div1.HCO | Mission intake and strategic framing |
| Backlog issue | Div1.HCO | Div2.MasterPlanner | BPI + blueprint |
| Budget anomaly | Div1.HCO | Div3.Treasury | Budget/access feasibility |
| Approved cycle work | Div1.HCO | Div4.Production | Deliver according to blueprint |
| QA review | Div1.HCO | Div5.QualificationsLibraryLearning | Gate pass/fail and quarantine |
| External research / customer / vendor / external document request | Div1.HCO | Div5.QualificationsLibraryLearning | Div5 checks local knowledge first, Div6.External collects, Div5 quarantines raw evidence before internal reuse. |
| Paid or credentialed external API/service request | Div1.HCO | Div5.QualificationsLibraryLearning | Div3.Treasury grants scoped access, Div6.External executes external IO, Div5 quarantines raw evidence before internal reuse. |
| Complex/chaotic decision | Div1.HCO | Div7.MissionControl | Cynefin + OODA recommendation |

## External IO security invariant

External IO must follow `Div1.HCO -> Div5.QualificationsLibraryLearning -> Div6.External -> Div5.QualificationsLibraryLearning` for unpaid/uncredentialed requests and `Div1.HCO -> Div5.QualificationsLibraryLearning -> Div3.Treasury -> Div6.External -> Div5.QualificationsLibraryLearning` when paid services, credentials, secrets, or access grants are required. Div3.Treasury grants scoped access but does not perform external IO. Div6.External is the only division allowed to touch web, customer, vendor, external API, external service, external document, or external-agent surfaces. Div6.External returns raw ExternalEvidencePacket / RawExternalEvidenceBundle output only to Div5.QualificationsLibraryLearning quarantine; internal divisions may consume only Div5-produced SanitizedKnowledgePacket or approved-internal-use evidence.
