# S03: Reconciled Ledger and M012 Gate — UAT

**Milestone:** M011
**Written:** 2026-06-03T00:25:43.142Z

# UAT: M011 S03 Reconciled Capability Gate

## What to review

Open `runtime-evidence/M011-S03-reconciled-capability-gate.md`.

## Expected result

- M012 recommendation is `First Real Mission Through Native Paperclip Flow`.
- Allowed actions distinguish local-only work, live read-only probing, live Paperclip mutation after explicit confirmation, and git feature-branch work.
- Blocked actions include plugin host registration, piko tools, Hermes, GSD-Pi, live PR/merge/CI, direct main push, and Telegram secret delivery.
- Required confirmations include Paperclip mutation, GitHub external actions, and secure secret collection.

## Verification command

`node scripts/validate_m011_s03_reconciled_gate.js`
