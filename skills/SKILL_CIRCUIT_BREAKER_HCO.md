# SKILL_CIRCUIT_BREAKER_HCO

## Purpose

Move Circuit Breaker organizational ownership to Div1.HCO.

Paperclip remains runtime owner; BOS Light owns doctrine/evidence/route/control semantics only.

## Owner

Div1.HCO owns:

- Circuit Breaker control;
- failure escalation;
- correction routing;
- operational pause/resume decision;
- escalation issue/comment routing;
- strategic escalation to Div7.

## Producers of failure signals

- Div4.Production reports implementation/build/test failures.
- Div5.QualificationsLibraryLearning reports blocking QA/security/integrity failures.
- Div3.Treasury reports budget/access risk.
- Div6.External reports unsafe external source risk.
- Paperclip/runtime surfaces may report run failures if capability is validated.

## States

```text
CLOSED
HALF_OPEN
OPEN
```

## Flow

```text
Failure signal
  -> Div1.HCO records observation
  -> update CircuitBreakerRecord/evidence envelope
  -> route correction or open breaker

If threshold not reached:
  -> route correction to Div2/Div4/Div5

If threshold reached:
  -> Circuit Breaker OPEN
  -> create visible escalation artifact
  -> request Div3 budget/access freeze if needed
  -> escalate to Div7 if strategic/policy-level
```

## Important boundary

Circuit Breaker is not a guaranteed runtime kill-switch unless Paperclip capability proof exists.

Until live runtime proof exists, use:

- explicit observations;
- bounded polling;
- activity/comment/manual fallback;
- Paperclip-visible evidence envelopes.

## Correct ownership

- Div1 owns Circuit Breaker control.
- Div4 reports production failures.
- Div5 reports independent gate failures.
- Div3 reports budget/access risks.
- Div7 handles strategic interpretation.
- Paperclip owns actual runtime execution.

## Acceptance

- Div4 is not Circuit Breaker owner.
- Div1 owns breaker records and escalation routing.
- OPEN state creates visible escalation artifact.
- Strategic repeated failure can escalate to Div7.

## Failure behavior

If Circuit Breaker opens, block further execution and escalate to Div1.HCO. If HALF_OPEN probe fails, return to OPEN state. If human resolution is required, notify the designated owner.
