# S02: VPS Read Only Forensics

**Goal:** Capture and classify read-only VPS, Docker, Paperclip, and proxy evidence before any restart or recovery action.
**Demo:** After this: the project has read-only VPS evidence showing whether the failure pattern is Docker or data wipe, container recreate, auth drift, ownership drift, proxy drift, or inconclusive.

## Must-Haves

- Evidence captures container identity, mounts, volumes, Docker events or logs, destructive-command history, Paperclip data directory presence, and proxy mapping.
- No Docker restart, Paperclip mutation, or destructive command runs before evidence capture.
- Verdict distinguishes wipe, recreate, auth drift, ownership drift, proxy drift, or inconclusive state.
- Secret values are not printed or stored.

## Proof Level

- This slice proves: Operational proof through read-only VPS evidence package.

## Integration Closure

Consumes S01 truth map and produces verified runtime assumptions for S03 and S04.

## Verification

- Creates a forensic evidence package future agents can inspect instead of re-running destructive recovery.

## Tasks

- [ ] **T01: Prepare read only forensic command packet** `est:45m`
  Turn the S01 truth map once available and the handoff checklist into a command packet that names each VPS command, why it is read-only, what it proves, and which hypothesis it supports or refutes. Include explicit forbidden commands. Do not SSH or run remote commands in this task.
  - Files: `runtime-evidence/M014-S02-vps-command-packet.md`, `runtime-evidence/M014-S02-vps-command-packet.json`
  - Verify: test -s runtime-evidence/M014-S02-vps-command-packet.json

- [ ] **T02: Capture approved read only VPS evidence** `est:1.5h`
  After explicit user confirmation for VPS read-only inspection, capture container identity, mounts, volumes, Docker events or daemon logs, shell history destructive-command search, data directory presence, and proxy mapping. Do not restart services, mutate Paperclip, or print secrets. If confirmation is absent, write a fail-closed blocker artifact instead.
  - Files: `runtime-evidence/M014-S02-vps-forensics.json`, `runtime-evidence/M014-S02-vps-forensics.md`
  - Verify: test -s runtime-evidence/M014-S02-vps-forensics.json

- [ ] **T03: Classify wipe drift or inconclusive verdict** `est:1h`
  Analyze the captured VPS evidence against the hypothesis matrix. Produce a verdict with confidence, cited evidence, residual unknowns, and specific downstream implications for runtime lockfile and persistence canary design.
  - Files: `runtime-evidence/M014-S02-vps-forensics-verdict.json`, `runtime-evidence/M014-S02-vps-forensics-verdict.md`, `scripts/validate_m014_s02_vps_forensics.js`
  - Verify: node --test scripts/validate_m014_s02_vps_forensics.js

## Files Likely Touched

- runtime-evidence/M014-S02-vps-command-packet.md
- runtime-evidence/M014-S02-vps-command-packet.json
- runtime-evidence/M014-S02-vps-forensics.json
- runtime-evidence/M014-S02-vps-forensics.md
- runtime-evidence/M014-S02-vps-forensics-verdict.json
- runtime-evidence/M014-S02-vps-forensics-verdict.md
- scripts/validate_m014_s02_vps_forensics.js
