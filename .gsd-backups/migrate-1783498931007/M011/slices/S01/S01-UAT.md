# S01: Evidence Matrix from Implemented Code — UAT

**Milestone:** M011
**Written:** 2026-06-03T00:18:20.085Z

# UAT: M011 S01 Evidence Matrix

## What to review

Open `runtime-evidence/M011-S01-capability-matrix.md`.

## Expected result

- Confirmed rows are limited to native/live evidence-backed surfaces: company divisions, resource secret resolution, mission lifecycle, native artifacts, and git local/hybrid push.
- Local-only rows cover implemented/tested workflows that still need live artifact/auth proof.
- Fallback-only rows preserve plugin host, piko tools, Hermes, and GSD-Pi runtime execution blockers.
- No secret values appear in the matrix.

## Verification command

`node scripts/validate_m011_capability_matrix.js`
