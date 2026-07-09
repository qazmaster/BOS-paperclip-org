---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T01: Define canary contract and confirmation packet

Create a canary contract artifact that names the exact Paperclip target from the S03 runtime lockfile, native surface, marker shape, safe restart command, forbidden commands, cleanup or retention policy, and required confirmation wording. Do not mutate live Paperclip in this task.

## Inputs

- `docs/handoffs/HANDOFF_PAPERCLIP_RUNTIME_FORENSICS.md`

## Expected Output

- `runtime-evidence/M014-S04-persistence-canary-contract.json`
- `runtime-evidence/M014-S04-persistence-canary-contract.md`

## Verification

test -s runtime-evidence/M014-S04-persistence-canary-contract.json

## Observability Impact

Makes the live action auditable before it happens.
