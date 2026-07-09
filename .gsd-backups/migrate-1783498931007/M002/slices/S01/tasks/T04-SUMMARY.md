---
id: T04
parent: S01
milestone: M002
key_files:
  - .gsd/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md
key_decisions:
  - (none)
duration: 
verification_result: passed
completed_at: 2026-05-28T12:47:56.494Z
blocker_discovered: false
---

# T04: Captured adapter readiness: `hermes_local` is registered but CLI-blocked, and `gsdpi_local` must be built and installed as an external adapter.

**Captured adapter readiness: `hermes_local` is registered but CLI-blocked, and `gsdpi_local` must be built and installed as an external adapter.**

## What Happened

Queried Paperclip’s authenticated browser APIs and sandbox container read-only to identify adapter registry and host prerequisites. `GET /api/adapters` confirms `hermes_local`, `pi_local`, `process`, and `http` are loaded built-in adapters. The `hermes_local` configuration doc is available through `/llms/agent-configuration/hermes_local.txt`, but `hermes_local` testEnvironment fails because the `hermes` CLI is not in PATH. The Paperclip container has Node v24.16.0, npm, and pnpm, satisfying the Node >=22 prerequisite for a future GSD-Pi adapter, but neither `gsd` nor `hermes` is installed. `gsdpi_local` returns unknown adapter type, so it must be built/installed as an external adapter package through Paperclip’s adapter/plugin mechanism, not core patches. Updated the report with required preconditions and stop conditions for S02/S03.

## Verification

Verified report contains the key T04 evidence: loaded `hermes_local`, `hermes_cli_not_found`, Node v24.16.0, missing `hermes`/`gsd`, unknown `gsdpi_local`, external adapter `createServerAdapter()` path, and S02/S03 readiness lists. Worktree status shows only the report artifact changed.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `browser API: GET /api/adapters` | 0 | ✅ pass — hermes_local, pi_local, process, http visible | 0ms |
| 2 | `browser API: POST /api/companies/{companyId}/adapters/hermes_local/test-environment` | 0 | ✅ pass — API worked, result status=fail with hermes_cli_not_found | 0ms |
| 3 | `ssh docker exec paperclip_sandbox-paperclip-1 node/npm/pnpm/hermes/gsd checks` | 0 | ✅ pass — Node v24.16.0 present; hermes and gsd absent | 0ms |
| 4 | `browser API: GET /api/companies/{companyId}/adapters/gsdpi_local/models` | 0 | ✅ pass — API returned 422 Unknown adapter type as expected before registration | 0ms |
| 5 | `python3 adapter readiness checklist check over PAPERCLIP_LIVE_VALIDATION_REPORT.md` | 0 | ✅ pass — 10 required readiness strings present | 0ms |

## Deviations

The task was planned as prerequisite inventory, not installation. I did not install Hermes or GSD-Pi yet because that requires package/secret decisions and belongs after recording readiness blockers.

## Known Issues

`hermes_local` is registered but blocked by missing `hermes` CLI in the Paperclip container. `gsdpi_local` is not registered. The Paperclip container has Node v24.16.0/npm/pnpm but no `gsd` command. Existing `pi_local` is not a substitute for `gsdpi_local` and also lacks its `pi` command/model setup.

## Files Created/Modified

- `.gsd/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md`
