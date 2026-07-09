---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T02: Capture approved read only VPS evidence

After explicit user confirmation for VPS read-only inspection, capture container identity, mounts, volumes, Docker events or daemon logs, shell history destructive-command search, data directory presence, and proxy mapping. Do not restart services, mutate Paperclip, or print secrets. If confirmation is absent, write a fail-closed blocker artifact instead.

## Inputs

- `runtime-evidence/M014-S02-vps-command-packet.json`

## Expected Output

- `runtime-evidence/M014-S02-vps-forensics.json`
- `runtime-evidence/M014-S02-vps-forensics.md`

## Verification

test -s runtime-evidence/M014-S02-vps-forensics.json

## Observability Impact

Captures durable forensic state so future agents do not have to infer from stale health checks.
