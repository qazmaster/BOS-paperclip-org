# Skill: Circuit Breaker HCO Control

Status: canonical v1.4.1 protocol.
Owner: Div1.HCO.
Evidence providers: Div5.QualificationsLibraryLearning, Div4.Production and runtime surfaces.

## Purpose

Stop infinite retries and coordinate safe recovery when repeated gate, runtime, adapter or production failures occur.

## Triggers

Use this protocol when:

- max attempts are reached;
- an Eval Gate repeatedly fails;
- production reports the same blocker more than once;
- runtime events indicate open or half-open circuit state;
- external IO or budget/access failure blocks progress;
- correction routing loops without new evidence.

## Inputs

- Failed work reference.
- Failure count and max-attempt policy.
- Gate results, logs, runtime evidence or blocker reports.
- Current route and owner division.
- Budget/access or external IO dependencies.

## Procedure

1. Confirm the failure state and evidence refs.
2. Set circuit state: closed, open or half-open.
3. Classify failure cause: deterministic input, permission/budget, external dependency, implementation defect, qualification failure, strategic ambiguity or unknown.
4. Select exactly one next action:
   - retry with changed hypothesis;
   - reroute to a better owner;
   - pause for missing grant/evidence;
   - escalate to Div7 for policy/strategy;
   - request human input.
5. Record correction route and stop condition.
6. Notify the current owner and affected downstream consumers.
7. Move to half-open only when new evidence or remediation exists.

## Outputs

- CircuitBreakerHcoControl record.
- Correction route.
- Retry/reroute/pause/escalation note.
- Review condition for closing or half-opening the circuit.

## Guardrails

- Div1.HCO coordinates; it does not hide or erase failure evidence.
- Div4.Production must not self-clear independent Div5 gate failures.
- Retrying without a changed hypothesis is prohibited.
- Budget/access failures must route to Div3.
- Strategic or policy ambiguity must route to Div7.

## Failure behavior

If evidence is incomplete, pause and request evidence instead of retrying. If the same fix fails three times, stop implementation and reset the model with a new diagnosis or escalation.
