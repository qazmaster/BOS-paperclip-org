---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T03: Execute live probe and validate evidence

Run the S00 probe against the live Paperclip sandbox using environment credentials from .env, then run the validator against the produced evidence artifact. Steps: (1) export credentials from .env, (2) run python3 scripts/run_m006_s00_runtime_capability_inventory.py with default output path, (3) run python3 scripts/validate_m006_s00_runtime_capability_inventory.py --evidence runtime-evidence/M006-S00-runtime-capability-inventory.json --allow-blocker, (4) capture both exit codes and stdout. The probe is expected to produce either live-evidence or fail-closed-blocker artifacts depending on runtime posture. Any live confirmations must include runtime version/build readback. No capability promotion is allowed without version/build plus surface-specific readback per MEM058.

## Inputs

- `scripts/run_m006_s00_runtime_capability_inventory.py`
- `scripts/validate_m006_s00_runtime_capability_inventory.py`
- `.env`

## Expected Output

- `runtime-evidence/M006-S00-runtime-capability-inventory.json`

## Verification

python3 scripts/validate_m006_s00_runtime_capability_inventory.py --evidence runtime-evidence/M006-S00-runtime-capability-inventory.json --allow-blocker
