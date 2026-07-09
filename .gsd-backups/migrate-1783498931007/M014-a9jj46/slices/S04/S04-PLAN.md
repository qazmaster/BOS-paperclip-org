# S04: Persistence Canary

**Goal:** Prove Paperclip native state persistence under the safe restart path before any BOS Light E2E attempt.
**Demo:** After this: a native Paperclip marker is read back before and after the documented safe restart, or a precise fail-closed blocker explains why persistence cannot be proven.

## Must-Haves

- User explicitly confirms the bounded live target and canary action before mutation.
- Canary uses native Paperclip issue, document, or comment surfaces only.
- Readback hash or stable identifier is captured before safe restart.
- Readback is repeated after safe restart, or a fail-closed blocker records the exact failure.
- No destructive Docker command is used.

## Proof Level

- This slice proves: Operational proof with live runtime evidence and human-confirmed bounded mutation.

## Integration Closure

Consumes S03 preflight and proves the state lifecycle assumption needed by S05.

## Verification

- Adds a durable canary artifact and blocker surface for persistence failures.

## Tasks

- [ ] **T01: Define canary contract and confirmation packet** `est:45m`
  Create a canary contract artifact that names the exact Paperclip target from the S03 runtime lockfile, native surface, marker shape, safe restart command, forbidden commands, cleanup or retention policy, and required confirmation wording. Do not mutate live Paperclip in this task.
  - Files: `runtime-evidence/M014-S04-persistence-canary-contract.json`, `runtime-evidence/M014-S04-persistence-canary-contract.md`
  - Verify: test -s runtime-evidence/M014-S04-persistence-canary-contract.json

- [ ] **T02: Execute confirmed native canary and pre restart readback** `est:1h`
  Only after explicit user confirmation, use the S03 hardened preflight path to create or reuse one bounded native Paperclip canary marker and read it back. If confirmation, auth, target, or preflight is missing, write a fail-closed blocker instead. Do not restart yet.
  - Files: `runtime-evidence/M014-S04-persistence-canary-pre-restart.json`
  - Verify: test -s runtime-evidence/M014-S04-persistence-canary-pre-restart.json

- [ ] **T03: Run safe restart and post restart readback** `est:1h`
  Only after T02 succeeds and user confirms the restart boundary, run the documented safe compose up command, never down or prune. Read the canary marker back after restart. If restart is not approved or fails, write a fail-closed blocker.
  - Files: `runtime-evidence/M014-S04-persistence-canary-post-restart.json`
  - Verify: test -s runtime-evidence/M014-S04-persistence-canary-post-restart.json

- [ ] **T04: Validate persistence canary evidence** `est:1h`
  Add a validator that checks the contract, pre-restart readback, post-restart readback, marker identity/hash continuity, forbidden-command absence, and blocker consistency. It must fail if the canary is claimed passing without matching readback evidence.
  - Files: `scripts/validate_m014_s04_persistence_canary.js`
  - Verify: node --test scripts/validate_m014_s04_persistence_canary.js

## Files Likely Touched

- runtime-evidence/M014-S04-persistence-canary-contract.json
- runtime-evidence/M014-S04-persistence-canary-contract.md
- runtime-evidence/M014-S04-persistence-canary-pre-restart.json
- runtime-evidence/M014-S04-persistence-canary-post-restart.json
- scripts/validate_m014_s04_persistence_canary.js
