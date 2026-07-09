---
id: T01
parent: S01
milestone: M011
key_files:
  - scripts/generate_m011_capability_matrix.js
  - runtime-evidence/M011-S01-capability-matrix.json
  - runtime-evidence/M011-S01-capability-matrix.md
key_decisions:
  - Treat M005 live proof artifacts as specific capability confirmations without promoting plugin host, Hermes, or GSD-Pi execution.
duration: 
verification_result: passed
completed_at: 2026-06-03T00:17:42.760Z
blocker_discovered: false
---

# T01: Generated the M011 S01 capability matrix from current source, tests, ledger, and runtime evidence.

**Generated the M011 S01 capability matrix from current source, tests, ledger, and runtime evidence.**

## What Happened

Added scripts/generate_m011_capability_matrix.js. The generator reads the existing BOS Light capability ledger, M005/M006/M010 runtime evidence artifacts, and key source/test file hashes, then writes runtime-evidence/M011-S01-capability-matrix.json and runtime-evidence/M011-S01-capability-matrix.md. The matrix separates native Paperclip/live git confirmations from local-only workflows and fallback-only plugin/runtime execution surfaces.

## Verification

Ran `node scripts/generate_m011_capability_matrix.js`; exit 0. Output wrote runtime-evidence/M011-S01-capability-matrix.json and runtime-evidence/M011-S01-capability-matrix.md with status_counts {"confirmed":5,"local-only":4,"fallback-only":5}.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node scripts/generate_m011_capability_matrix.js` | 0 | ✅ pass | 120ms |

## Deviations

None.

## Known Issues

The matrix is generated from existing artifacts only; S02 still needs a fresh read-only live Paperclip reprobe.

## Files Created/Modified

- `scripts/generate_m011_capability_matrix.js`
- `runtime-evidence/M011-S01-capability-matrix.json`
- `runtime-evidence/M011-S01-capability-matrix.md`
