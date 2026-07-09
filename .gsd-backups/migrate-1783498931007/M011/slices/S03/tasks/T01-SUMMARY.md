---
id: T01
parent: S03
milestone: M011
key_files:
  - scripts/generate_m011_s03_reconciled_gate.js
  - runtime-evidence/M011-S03-reconciled-capability-gate.json
  - runtime-evidence/M011-S03-reconciled-capability-gate.md
key_decisions:
  - S02 auth-blocked reprobe does not downgrade prior specific live proofs; it blocks fresh readback until auth is restored.
duration: 
verification_result: passed
completed_at: 2026-06-03T00:25:00.156Z
blocker_discovered: false
---

# T01: Generated the reconciled M012 capability gate from S01 matrix and S02 reprobe.

**Generated the reconciled M012 capability gate from S01 matrix and S02 reprobe.**

## What Happened

Added scripts/generate_m011_s03_reconciled_gate.js. The generator reads the S01 capability matrix and S02 read-only reprobe, then writes runtime-evidence/M011-S03-reconciled-capability-gate.json and Markdown. The gate preserves exact historical confirmed live proofs, treats S02 auth-blocked current observations as blockers rather than downgrades, keeps plugin/piko/Hermes/GSD-Pi fallback-only, and defines M012 allowed actions, blocked actions, required confirmations, and proposed native Paperclip mission flow.

## Verification

Ran `node scripts/generate_m011_s03_reconciled_gate.js && node scripts/validate_m011_s03_reconciled_gate.js`; exit 0. Output: wrote gate JSON/Markdown; allowed_actions 4; blocked_actions 7; required_confirmations 3; validator passed.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node scripts/generate_m011_s03_reconciled_gate.js && node scripts/validate_m011_s03_reconciled_gate.js` | 0 | ✅ pass | 120ms |

## Deviations

None.

## Known Issues

M012 live Paperclip mutation remains gated on Paperclip auth and explicit user confirmation.

## Files Created/Modified

- `scripts/generate_m011_s03_reconciled_gate.js`
- `runtime-evidence/M011-S03-reconciled-capability-gate.json`
- `runtime-evidence/M011-S03-reconciled-capability-gate.md`
