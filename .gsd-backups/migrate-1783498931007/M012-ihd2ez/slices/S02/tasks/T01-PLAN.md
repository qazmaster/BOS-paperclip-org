---
estimated_steps: 1
estimated_files: 4
skills_used: []
---

# T01: Prepare Mission Payload and Confirmation Contract

Create a deterministic bounded mission payload from S01 execution state and the M011 gate, including target company ID, mission title, safety constraints, allowed native route, and blocked surfaces. Write a preflight artifact that can be shown to the user before live mutation. The artifact must explicitly state that plugin routes, Hermes, GSD-Pi, GitHub, Telegram, and unsupported document/comment APIs are out of scope.

## Inputs

- `runtime-evidence/M011-S03-reconciled-capability-gate.json`

## Expected Output

- `runtime-evidence/M012-S02-native-mission-preflight.json`
- `runtime-evidence/M012-S02-native-mission-preflight.md`

## Verification

node scripts/validate_m012_s02_preflight.js

## Observability Impact

Records target, mission payload, route plan, blocked actions, and confirmation wording without secrets.
