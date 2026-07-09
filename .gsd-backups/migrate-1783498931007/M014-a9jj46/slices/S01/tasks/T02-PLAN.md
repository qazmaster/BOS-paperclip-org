---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T02: Classify runtime identities and capability surfaces

Build a machine-readable truth map classifying Paperclip company IDs, source epochs, auth status, confirmed surfaces, blocked surfaces, fallback-only surfaces, and proof gaps. Mark all canonical company claims provisional until fresh authenticated readback exists.

## Inputs

- `runtime-evidence/M014-S01-source-inventory.md`
- `runtime-evidence/M012-S06-mission-issue-evidence.json`
- `runtime-evidence/M013-S02-T04-paperclip-issue.json`
- `runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe-live-proof.json`

## Expected Output

- `runtime-evidence/M014-S01-runtime-truth-map.json`
- `runtime-evidence/M014-S01-runtime-truth-map.md`

## Verification

test -s runtime-evidence/M014-S01-runtime-truth-map.json

## Observability Impact

Creates the primary inspection surface for company identity drift and capability posture.
