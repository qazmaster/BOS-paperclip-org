---
estimated_steps: 1
estimated_files: 3
skills_used: []
---

# T03: Classify wipe drift or inconclusive verdict

Analyze the captured VPS evidence against the hypothesis matrix. Produce a verdict with confidence, cited evidence, residual unknowns, and specific downstream implications for runtime lockfile and persistence canary design.

## Inputs

- `runtime-evidence/M014-S02-vps-forensics.json`

## Expected Output

- `runtime-evidence/M014-S02-vps-forensics-verdict.json`
- `runtime-evidence/M014-S02-vps-forensics-verdict.md`
- `scripts/validate_m014_s02_vps_forensics.js`

## Verification

node --test scripts/validate_m014_s02_vps_forensics.js

## Observability Impact

Turns raw remote evidence into a stable decision surface for S03 and S04.
