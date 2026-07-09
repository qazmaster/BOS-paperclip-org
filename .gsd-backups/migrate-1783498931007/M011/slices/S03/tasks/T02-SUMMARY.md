---
id: T02
parent: S03
milestone: M011
key_files:
  - scripts/validate_m011_s03_reconciled_gate.js
  - runtime-evidence/M011-S03-reconciled-capability-gate.json
key_decisions:
  - M012 can use native Paperclip mission artifacts only after auth and explicit confirmation; it must not rely on plugin host tools or runtime execution adapters.
duration: 
verification_result: passed
completed_at: 2026-06-03T00:25:13.523Z
blocker_discovered: false
---

# T02: Added and ran the M012 gate invariant validator.

**Added and ran the M012 gate invariant validator.**

## What Happened

Added scripts/validate_m011_s03_reconciled_gate.js. The validator checks S03 schema, safety flags, zero external mutations, confirmed/local/fallback capability placement, required allowed/blocked actions, required Paperclip/GitHub/secret confirmation gates, branch policy constraints, and current blocker preservation.

## Verification

Ran `node scripts/generate_m011_s03_reconciled_gate.js && node scripts/validate_m011_s03_reconciled_gate.js`; exit 0. Validator output: validated runtime-evidence/M011-S03-reconciled-capability-gate.json; allowed_actions 4; blocked_actions 7; required_confirmations 3; current blockers include missing_paperclip_auth, plugin_routes_not_found, tool_routes_not_found.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node scripts/generate_m011_s03_reconciled_gate.js && node scripts/validate_m011_s03_reconciled_gate.js` | 0 | ✅ pass | 120ms |

## Deviations

None.

## Known Issues

The gate intentionally blocks plugin host, piko tools, Hermes, GSD-Pi, live PR/merge/CI, direct main push, and Telegram secret delivery.

## Files Created/Modified

- `scripts/validate_m011_s03_reconciled_gate.js`
- `runtime-evidence/M011-S03-reconciled-capability-gate.json`
