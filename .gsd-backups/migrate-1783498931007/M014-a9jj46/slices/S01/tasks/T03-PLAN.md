---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# T03: Add source truth validator

Create a lightweight validator for the S01 truth map. It should fail if required sections are absent, if known stale or disposable IDs are missing from classification, or if Hermes and GSD-Pi are promoted without the required proof fields. Keep validation local and fixture or artifact based.

## Inputs

- `runtime-evidence/M014-S01-runtime-truth-map.json`

## Expected Output

- `scripts/validate_m014_s01_truth_map.js`

## Verification

node --test scripts/validate_m014_s01_truth_map.js

## Observability Impact

Provides an executable guard against future overclaims in the source truth map.
