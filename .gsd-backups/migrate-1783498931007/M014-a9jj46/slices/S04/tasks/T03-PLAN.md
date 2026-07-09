---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T03: Run safe restart and post restart readback

Only after T02 succeeds and user confirms the restart boundary, run the documented safe compose up command, never down or prune. Read the canary marker back after restart. If restart is not approved or fails, write a fail-closed blocker.

## Inputs

- `runtime-evidence/M014-S04-persistence-canary-pre-restart.json`

## Expected Output

- `runtime-evidence/M014-S04-persistence-canary-post-restart.json`

## Verification

test -s runtime-evidence/M014-S04-persistence-canary-post-restart.json

## Observability Impact

Captures operational lifecycle proof or a precise restart/readback failure.
