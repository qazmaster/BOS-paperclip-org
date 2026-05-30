# Skill: Div5 Autoresearch

Status: canonical v1.4.1 protocol.
Owner: Div5.QualificationsLibraryLearning.

## Purpose

Answer internal knowledge requests from the local repo/library first, then initiate the external IO gateway only when local evidence is insufficient.

## Triggers

Use this protocol when Div1.HCO, Div2.MasterPlanner, Div4.Production, Div3.Treasury or Div7.MissionControl requests facts, prior decisions, reusable patterns, risk history or validation context.

## Inputs

- Routed knowledge question.
- Intended consumer and allowed use.
- Relevant repo-local artifacts, Paperclip references or memory/library indexes.
- Freshness requirement.
- Risk class: low, medium, high or policy-sensitive.

## Procedure

1. Confirm the request was routed by Div1.HCO or is an approved Div5 qualification activity.
2. Search local repo docs, decision records, requirements, runtime evidence and approved memory/library content.
3. Classify the result:
   - sufficient local answer;
   - insufficient local answer with clear external question;
   - conflicting local evidence;
   - policy-sensitive uncertainty.
4. For sufficient local answers, return a SanitizedKnowledgePacket with support refs.
5. For local misses, write a local_miss_summary and quarantine criteria, then ask Div1.HCO to route through the External IO Gateway.
6. For conflicting or policy-sensitive evidence, route to Div7 or human through Div1.HCO.
7. After Div6 returns raw evidence, run Knowledge Quarantine before internal reuse.

## Outputs

- Local sanitized knowledge packet.
- Local miss summary and external IO request draft.
- Conflict report.
- Escalation request.

## Guardrails

- Div5 Autoresearch is not web/search. Raw external collection belongs to Div6 only.
- Div5 must not bypass HCO routing for external requests.
- Div5 must not claim freshness beyond its evidence.
- Div5 must not approve KB/memory writes for unsanitized content.

## Failure behavior

If local evidence is stale, contradictory or absent, say so explicitly. Do not fabricate an answer and do not silently perform external IO.
