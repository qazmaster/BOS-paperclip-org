# S08: Provider adapter execution remediation — UAT

**Milestone:** M002
**Written:** 2026-05-29T18:12:11.024Z

# S08 UAT

## Scenario
A reviewer needs to know whether BOS Light can safely promote a Paperclip runtime execution path without plaintext secrets or core patches.

## Steps
1. Inspect `runtime-evidence/M002-S08-execution-path-decision-packet.json` and confirm the selected path is `hermes_local_with_codex_cli_backend` and execution is gated.
2. Inspect `runtime-evidence/M002-S08-adapter-registration-evidence.json` and confirm `hermes_cli_not_found` is cleared after remediation, while `hermes_no_api_keys` remains recorded as a warning.
3. Inspect `runtime-evidence/M002-S08-runtime-execution-smoke.json` and confirm the smoke was Paperclip-owned with an agent ID and run ID, but failed closed with `adapter_failed` and no `resultJson.bos`.
4. Run verification:
   ```bash
   python3 -m json.tool runtime-evidence/M002-S08-provider-adapter-feasibility.json >/dev/null && \
   python3 -m json.tool runtime-evidence/M002-S08-execution-path-decision-packet.json >/dev/null && \
   python3 -m json.tool runtime-evidence/M002-S08-adapter-registration-evidence.json >/dev/null && \
   python3 -m json.tool runtime-evidence/M002-S08-hermes-cli-environment-remediation.json >/dev/null && \
   python3 -m json.tool runtime-evidence/M002-S08-runtime-execution-smoke.json >/dev/null && \
   python3 scripts/validate_runtime_capabilities.py && \
   python3 scripts/validate_m002_closeout.py --phase final
   ```

## Expected Result
The commands pass, capability posture remains conservative, and no reviewer can mistake Hermes CLI availability for passing BOS runtime execution.
