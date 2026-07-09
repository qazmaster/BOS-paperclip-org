---
id: T02
parent: S01
milestone: M011
key_files:
  - scripts/validate_m011_capability_matrix.js
  - runtime-evidence/M011-S01-capability-matrix.json
key_decisions:
  - Proof-gate invariants are mechanical so future edits cannot silently promote unproven plugin/runtime execution surfaces.
duration: 
verification_result: passed
completed_at: 2026-06-03T00:17:55.992Z
blocker_discovered: false
---

# T02: Added and ran the M011 capability matrix proof-gate validator.

**Added and ran the M011 capability matrix proof-gate validator.**

## What Happened

Added scripts/validate_m011_capability_matrix.js. The validator enforces the matrix schema, required capability keys, evidence/blocker shape, status count consistency, source file hashes, redaction safety flags, and proof-gate invariants that forbid plugin host, piko tools, Hermes, or GSD-Pi from being confirmed without runtime-execution-proof evidence.

## Verification

Ran `node scripts/generate_m011_capability_matrix.js && node scripts/validate_m011_capability_matrix.js`; exit 0. Validator output: validated runtime-evidence/M011-S01-capability-matrix.json; capabilities 14; status_counts {"confirmed":5,"local-only":4,"fallback-only":5}.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node scripts/generate_m011_capability_matrix.js && node scripts/validate_m011_capability_matrix.js` | 0 | ✅ pass | 120ms |

## Deviations

None.

## Known Issues

Validator intentionally preserves fallback-only status for plugin host, piko tools, Hermes, and GSD-Pi runtime execution.

## Files Created/Modified

- `scripts/validate_m011_capability_matrix.js`
- `runtime-evidence/M011-S01-capability-matrix.json`
