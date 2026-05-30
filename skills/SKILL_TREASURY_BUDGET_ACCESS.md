# Skill: Treasury Budget Access

Status: canonical v1.4.1 protocol.
Owner: Div3.Treasury.

## Purpose

Evaluate budget, capacity, secret, credential and access requests without exposing secrets or allowing wildcard permissions.

## Triggers

Use this protocol when work needs:

- token, model, compute or external-service budget;
- paid API/service access;
- credentials, secrets or scoped permissions;
- additional agent capacity;
- budget anomaly review;
- grant, denial or human escalation.

## Inputs

- Request routed by Div1.HCO.
- Purpose and expected outcome.
- Tool/service/access class.
- Estimated cost or capacity impact.
- Required secret scope, never the plaintext secret.
- Duration, expiration or review condition.
- Risk notes from Div5 when applicable.

## Procedure

1. Verify the request came through Div1.HCO.
2. Confirm requester division and tool/service class.
3. Check budget/capacity fit and policy constraints.
4. Define the narrowest usable scope.
5. Decide grant, deny or needs-human.
6. Record budget/access decision without plaintext secrets.
7. Return the decision to Div1.HCO for dispatch.
8. For paid/credentialed external IO, grant only to the Div6.External route and require Div5 quarantine on output.

## Outputs

- BudgetAccessDecision.
- Scoped ToolGrant when approved.
- Denial reason or human-escalation note.
- Revocation and review condition.

## Guardrails

- Div3 grants permissions but does not perform external IO.
- Div3 must not expose plaintext secrets in prompts, markdown, logs or evidence.
- No wildcard permissions.
- No implicit grants when data is missing.
- Budget hard-stops and Paperclip-native governance must not be bypassed.

## Failure behavior

Deny or escalate when cost, scope, requester identity, secret handling or policy fit is unclear. Do not create a temporary workaround that bypasses Div1.HCO, Div5 quarantine or Paperclip governance.
