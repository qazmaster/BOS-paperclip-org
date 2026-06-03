# BOS Light v1.4.2 — R026 Agent Boundary Patch

## Status

Patch over implemented BOS Light v1.4.1.

This update does not change the canonical division map. It makes the existing v1.4.1 ownership model executable after tests revealed that Div7 decision handling could become a terminal operational route.

## Trigger

Execution tests showed that missions routed through Div7 could be classified as COMPLEX or CHAOTIC and then handled inside Div7 without returning to Div1.HCO for operational routing.

This violates the v1.4.1 boundary:

```text
Div7 owns mission framing, strategy, policy direction and regime decisions.
Div1 owns routing control, dispatch governance and operational control.
```

## R026 invariant

```text
Div7 decision output is not an operational terminal route.
Every non-policy-only Div7 decision MUST emit DecisionDelegated to Div1.HCO.
Div1.HCO MUST perform all operational routing after Div7 decision.
```

## Canonical flow

```text
Human / Mission Owner
  -> Div7.MissionControl
      frames mission or makes strategic/policy/regime decision

  -> DecisionDelegated packet

  -> Div1.HCO
      validates decision boundary and performs operational routing

  -> Div2 / Div3 / Div4 / Div5 / Div6
      execute their owned functions through Paperclip runtime

  -> Div1.HCO
      monitors, routes corrections, escalates if needed

  -> Div7.MissionControl
      only when another strategic/policy/regime decision is required
```

## Required code behavior

### Before

```ts
if (has("Div7.MissionControl")) return "complex_decision";
```

### After

```ts
if (requiresExecutiveDecision(mission, activatedDivisions)) {
  return "requires_executive_decision";
}

return deriveOperationalRoute(
  activatedDivisions.filter(d => d !== "Div7.MissionControl")
);
```

After `decide()`:

```ts
emitDivisionPacket({
  from: "Div7.MissionControl",
  to: "Div1.HCO",
  type: "DecisionDelegated",
  payload: {
    decisionId,
    cynefinDomain,
    recommendedMode,
    routingDirective,
    constraints,
    requiredFollowupDivisions,
    escalationLevel
  }
});
```

## Updated agent boundary rule

All agents must treat Div7 output as strategic context, not as direct operational command, unless the output is a policy-only record that requires no follow-up work.

Operational work may reach Div2, Div3, Div4, Div5 or Div6 only through Div1.HCO routing.

## Tests to add

1. Div7 presence does not produce terminal operational route.
2. Technical COMPLEX mission reaches Div7 -> Div1 -> Div2 -> Div3 -> Div4 -> Div5.
3. CHAOTIC mission reaches Div7 -> Div1 incident routing, not Div7 self-execution.
4. Div2 rejects direct operational task from Div7 unless routed by Div1.
5. Div3 rejects direct grant request from Div7 except approved emergency posture routed through Div1.
6. Div4 rejects direct implementation task from Div7.
7. Div5 flags Div7 terminal handling as routing compliance failure.
8. Div6 rejects direct external request from Div7 unless routed by Div1.
