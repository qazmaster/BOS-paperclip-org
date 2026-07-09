---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T01: Prepare read only forensic command packet

Turn the S01 truth map once available and the handoff checklist into a command packet that names each VPS command, why it is read-only, what it proves, and which hypothesis it supports or refutes. Include explicit forbidden commands. Do not SSH or run remote commands in this task.

## Inputs

- `docs/handoffs/HANDOFF_PAPERCLIP_RUNTIME_FORENSICS.md`
- `.gsd/workflows/spikes/260607-1-start-a-gsd-milestone-for-paperclip-runt/research/ANGLE-2-vps-forensics-plan.md`

## Expected Output

- `runtime-evidence/M014-S02-vps-command-packet.md`
- `runtime-evidence/M014-S02-vps-command-packet.json`

## Verification

test -s runtime-evidence/M014-S02-vps-command-packet.json

## Observability Impact

Provides a command-by-command audit trail before any VPS access occurs.
