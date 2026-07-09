---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T04: Validate live evidence, update capability matrix, and generate S03 evidence summary

Run the S03 validator against the live probe evidence with --allow-blocker (expected exit 0). Then update plugin-bos-light/capabilities.paperclip-runtime.json append-only: update the config.api evidence_source and blocker_text to reference M005-S03 evidence, keeping status as fallback-only (no promotions per MEM058). Validate the matrix with scripts/validate_runtime_capabilities.py. Finally, generate runtime-evidence/M005-S03-evidence-summary.json combining S01+S02+S03 results with posture, guardrails, and no-promotion flags.

## Inputs

- `runtime-evidence/M005-S03-resource-intake-probe.json`
- `runtime-evidence/M005-S01-evidence-summary.json`
- `runtime-evidence/M005-S02-evidence-summary.json`
- `plugin-bos-light/capabilities.paperclip-runtime.json`
- `scripts/validate_runtime_capabilities.py`

## Expected Output

- `runtime-evidence/M005-S03-evidence-summary.json`

## Verification

python3 scripts/validate_m005_s03_resource_intake_probe.py --evidence runtime-evidence/M005-S03-resource-intake-probe.json --allow-blocker && python3 scripts/validate_runtime_capabilities.py
