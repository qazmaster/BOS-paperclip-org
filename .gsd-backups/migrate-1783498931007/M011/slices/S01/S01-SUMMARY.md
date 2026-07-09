---
id: S01
parent: M011
milestone: M011
provides:
  - A normalized capability matrix for S02 route targeting and S03 reconciliation.
  - Mechanical validation that plugin host, piko tools, Hermes, and GSD-Pi remain unpromoted without runtime proof.
requires:
  []
affects:
  - S02
  - S03
key_files:
  - scripts/generate_m011_capability_matrix.js
  - scripts/validate_m011_capability_matrix.js
  - runtime-evidence/M011-S01-capability-matrix.json
  - runtime-evidence/M011-S01-capability-matrix.md
key_decisions:
  - Native Paperclip mission/company/resource/git evidence is treated separately from plugin-host and runtime-execution evidence to avoid over-promotion.
patterns_established:
  - Generated evidence artifacts include source file hashes, status counts, safety flags, and blocker codes.
  - Validator enforces proof-gate invariants before capability promotion claims.
observability_surfaces:
  - runtime-evidence/M011-S01-capability-matrix.json
  - runtime-evidence/M011-S01-capability-matrix.md
  - scripts/validate_m011_capability_matrix.js
drill_down_paths:
  - .gsd/milestones/M011/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M011/slices/S01/tasks/T02-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-06-03T00:18:20.085Z
blocker_discovered: false
---

# S01: Evidence Matrix from Implemented Code

**Generated and validated a proof-gated BOS Light capability matrix grounded in current code and runtime evidence.**

## What Happened

S01 created a deterministic evidence reconciliation path. The generator reads current BOS Light source/test files, the existing Paperclip runtime capability ledger, and M005/M006/M010 runtime evidence artifacts. It emits JSON and Markdown matrix artifacts that separate confirmed native/live capabilities from local-only workflows and fallback-only plugin/runtime execution surfaces. The validator then enforces required capability coverage, evidence or blocker presence, source hash availability, redaction safety, and no-promotion rules for plugin host, piko tools, Hermes, and GSD-Pi.

## Verification

Slice-level verification passed with `node scripts/generate_m011_capability_matrix.js && node scripts/validate_m011_capability_matrix.js`. Output: wrote matrix JSON/Markdown; status_counts {"confirmed":5,"local-only":4,"fallback-only":5}; validated matrix JSON; capabilities 14.

## Requirements Advanced

None.

## Requirements Validated

None.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Operational Readiness

None.

## Deviations

None.

## Known Limitations

This slice does not perform fresh live Paperclip probing; S02 will refresh current route/auth/plugin observations.

## Follow-ups

Run S02 read-only Paperclip reprobe and use its artifact to reconcile any currently changed live state.

## Files Created/Modified

- `scripts/generate_m011_capability_matrix.js` — New generator for M011 S01 matrix artifacts.
- `scripts/validate_m011_capability_matrix.js` — New validator enforcing schema and proof-gate invariants.
- `runtime-evidence/M011-S01-capability-matrix.json` — Generated structured capability matrix.
- `runtime-evidence/M011-S01-capability-matrix.md` — Generated readable capability matrix summary.
