---
estimated_steps: 3
estimated_files: 1
skills_used: []
---

# T03: Execute Hermes Xiaomi bounded runtime smoke

Why: Hermes execution with xiaomi mimo 2.5 pro is explicitly required by D026 and R019. Prior M002 attempts failed with 401 Missing Authentication header due to secret ref materialization issues in hermes-paperclip-adapter@0.2.0. M005 must attempt a fresh bounded run and produce either live proof or a precise fail-closed blocker.

Do: Run `scripts/run_m005_s01_hermes_xiaomi_probe.py` created in T01. The script attempts to create a Paperclip agent with xiaomi provider config, invokes it once, polls run status, and verifies resultJson.bos output. It redacts all secrets and writes a bounded evidence file.

Done when: `runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe.json` exists and passes the M005 S01 Xiaomi validator.

## Inputs

- `scripts/run_m005_s01_hermes_xiaomi_probe.py`

## Expected Output

- `runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe.json`

## Verification

python3 scripts/run_m005_s01_hermes_xiaomi_probe.py --output runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe.json && test -f runtime-evidence/M005-S01-hermes-xiaomi-runtime-probe.json

## Observability Impact

Hermes Xiaomi runtime evidence file produced with resultJson.bos diagnostics or exact blocker codes.
