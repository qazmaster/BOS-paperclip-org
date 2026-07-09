---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T04: Validate persistence canary evidence

Add a validator that checks the contract, pre-restart readback, post-restart readback, marker identity/hash continuity, forbidden-command absence, and blocker consistency. It must fail if the canary is claimed passing without matching readback evidence.

## Inputs

- `runtime-evidence/M014-S04-persistence-canary-contract.json`
- `runtime-evidence/M014-S04-persistence-canary-pre-restart.json`
- `runtime-evidence/M014-S04-persistence-canary-post-restart.json`

## Expected Output

- `scripts/validate_m014_s04_persistence_canary.js`

## Verification

node --test scripts/validate_m014_s04_persistence_canary.js

## Observability Impact

Creates executable proof that persistence claims match recorded evidence.
