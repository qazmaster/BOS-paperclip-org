# S03: Reconciled Ledger and M012 Gate

**Goal:** Reconcile stale capability rows against S01/S02 evidence and produce the proof-gated M012 plan recommendation.
**Demo:** After this: BOS Light has a reconciled capability artifact and a concrete M012 execution gate naming safe native Paperclip surfaces and blocked plugin/runtime surfaces.

## Must-Haves

- Reconciled artifact explicitly distinguishes confirmed, local-only, fallback-only, blocked, and unknown.
- No stale fallback row hides newer live proof, and no stale proof promotes unsupported current surfaces.
- M012 gate names exact allowed actions, disallowed actions, and required human confirmations.

## Proof Level

- This slice proves: Final assembly documentation plus mechanical validator proof.

## Integration Closure

Closes milestone by connecting code inventory, live reprobe, and next-milestone planning constraints.

## Verification

- Adds final summary artifact suitable for next-agent continuation and human review.

## Tasks

- [x] **T01: Generate reconciled capability gate for M012** `est:45m`
  Create a deterministic script that reads S01 matrix and S02 reprobe, then writes runtime-evidence/M011-S03-reconciled-capability-gate.json plus markdown. The artifact must preserve historical confirmed live proofs where S02 is auth-blocked, keep current unobserved plugin/tool/runtime surfaces fallback-only, and name M012 allowed actions, blocked actions, and human confirmations.
  - Files: `scripts/generate_m011_s03_reconciled_gate.js`, `runtime-evidence/M011-S03-reconciled-capability-gate.json`, `runtime-evidence/M011-S03-reconciled-capability-gate.md`
  - Verify: node scripts/generate_m011_s03_reconciled_gate.js

- [x] **T02: Validate M012 gate invariants** `est:30m`
  Create a validator that checks S03 gate shape, allowed/blocked action lists, no direct external mutations without confirmation, no plugin/Hermes/GSD-Pi promotion, and preservation of auth-blocked current reprobe status. Run generator and validator.
  - Files: `scripts/validate_m011_s03_reconciled_gate.js`, `runtime-evidence/M011-S03-reconciled-capability-gate.json`
  - Verify: node scripts/validate_m011_s03_reconciled_gate.js

## Files Likely Touched

- scripts/generate_m011_s03_reconciled_gate.js
- runtime-evidence/M011-S03-reconciled-capability-gate.json
- runtime-evidence/M011-S03-reconciled-capability-gate.md
- scripts/validate_m011_s03_reconciled_gate.js
