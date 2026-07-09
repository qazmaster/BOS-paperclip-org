---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T02: Execute confirmed native canary and pre restart readback

Only after explicit user confirmation, use the S03 hardened preflight path to create or reuse one bounded native Paperclip canary marker and read it back. If confirmation, auth, target, or preflight is missing, write a fail-closed blocker instead. Do not restart yet.

## Inputs

- `runtime-evidence/M014-S04-persistence-canary-contract.json`

## Expected Output

- `runtime-evidence/M014-S04-persistence-canary-pre-restart.json`

## Verification

test -s runtime-evidence/M014-S04-persistence-canary-pre-restart.json

## Observability Impact

Captures the pre-restart native marker identity, route, hash, and blocker state.
