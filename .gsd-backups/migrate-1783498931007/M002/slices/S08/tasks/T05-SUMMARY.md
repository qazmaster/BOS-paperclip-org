---
id: T05
parent: S08
milestone: M002
key_files:
  - runtime-evidence/M002-S08-hermes-cli-environment-remediation.json
  - runtime-evidence/M002-S08-adapter-registration-evidence.json
  - .gsd/milestones/M002/slices/S08/S08-PLAN.md
  - .gsd/milestones/M002/slices/S08/tasks/T05-PLAN.md
key_decisions:
  - Use Paperclip process-adapter admin runs as the supported environment remediation boundary; avoid core patches, direct DB mutation, private internals, and plaintext secrets.
  - Classify the repeated readiness proof as ready_with_warning because Hermes CLI and Codex host are available but the generic API-key warning remains.
duration: 
verification_result: passed
completed_at: 2026-05-29T15:25:04.872Z
blocker_discovered: false
---

# T05: Remediated Paperclip Hermes CLI availability through a supported process-adapter admin path and repeated T03 readiness evidence with the CLI blocker cleared.

**Remediated Paperclip Hermes CLI availability through a supported process-adapter admin path and repeated T03 readiness evidence with the CLI blocker cleared.**

## What Happened

Used the Paperclip `process` adapter as the supported non-secret environment administration boundary to diagnose the runtime, install `hermes-agent` into an isolated userbase at `/paperclip/hermes-runtime`, and add a wrapper `/paperclip/hermes-runtime/bin/hermes-paperclip` that exports `PYTHONUSERBASE` before invoking Hermes. The successful Paperclip-owned runs produced run/readback IDs, log hashes, and resultJson showing `Hermes Agent v0.15.2 (2026.5.29.2)`. A separate read-only Paperclip process diagnostic confirmed `/usr/local/bin/codex`, `codex-cli 0.134.0`, and `/paperclip/.codex` exist on the same host. Repeating `hermes_local/test-environment` for both `/BOS` and `/BOSA` with `hermesCommand=/paperclip/hermes-runtime/bin/hermes-paperclip`, `provider=openai-codex`, and `model=gpt-5.3-codex` cleared the previous `hermes_cli_not_found` blocker and returned `hermes_version` plus `hermes_model_configured`; the endpoint still reports a generic `hermes_no_api_keys` warning, so the artifact records `ready_with_warning` rather than a full runtime-smoke pass.

## Verification

Fresh verification ran after artifact writes: `python3 -m json.tool` validated both JSON artifacts, and inline assertions confirmed package install succeeded, wrapper creation succeeded, no provider execution/runtime smoke was claimed, `hermes_cli_not_found` is absent from both repeated company probes, `hermes_version` and `hermes_model_configured` are present, Codex host availability is recorded, and the remaining warning is explicitly `hermes_no_api_keys`. Output: `validated: remediation evidence and T03 repeat evidence are internally consistent`.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 -m json.tool runtime-evidence/M002-S08-hermes-cli-environment-remediation.json >/dev/null && python3 -m json.tool runtime-evidence/M002-S08-adapter-registration-evidence.json >/dev/null && python3 - <<'PY'
import json
from pathlib import Path
rem=json.loads(Path('runtime-evidence/M002-S08-hermes-cli-environment-remediation.json').read_text())
reg=json.loads(Path('runtime-evidence/M002-S08-adapter-registration-evidence.json').read_text())
assert rem['operation_flags']['package_install_succeeded'] is True
assert rem['operation_flags']['wrapper_created'] is True
assert rem['operation_flags']['provider_execution_attempted'] is False
assert rem['operation_flags']['runtime_smoke_attempted'] is False
assert rem['conclusion']['hermes_cli_blocker_removed'] is True
assert reg['readiness_assessment']['status']=='ready_with_warning'
assert reg['readiness_assessment']['hermes_cli_not_found_cleared'] is True
assert reg['readiness_assessment']['version_check_passed'] is True
assert reg['readiness_assessment']['codex_host_available'] is True
assert 'hermes_no_api_keys' in reg['readiness_assessment']['remaining_warning_codes']
assert reg['operation_flags']['runtime_smoke_attempted'] is False
for name, entry in reg['test_environment_results'].items():
    j=entry['hermes_local_test_environment']['json']
    assert j['status']=='warn', name
    codes=[c['code'] for c in j['checks']]
    assert 'hermes_version' in codes, (name,codes)
    assert 'hermes_model_configured' in codes, (name,codes)
    assert 'hermes_cli_not_found' not in codes, (name,codes)
print('validated: remediation evidence and T03 repeat evidence are internally consistent')
PY` | 0 | ✅ pass | 0ms |

## Deviations

Added T05 via slice replan because completed T03 correctly fail-closed on the original missing Hermes CLI. T05 updates the adapter-registration evidence as a repeat-after-remediation artifact rather than pretending the original T03 passed at first attempt.

## Known Issues

`hermes_local/test-environment` still returns `status=warn` due to generic `hermes_no_api_keys`. For the selected `openai-codex` path this is not treated as proof of failure because Codex CLI/session is present, but it must be retired or accepted through bounded T04 provider execution/readback with fresh human approval. This does not prove the original OpenAI/Xiaomi secret materialization issue is fixed.

## Files Created/Modified

- `runtime-evidence/M002-S08-hermes-cli-environment-remediation.json`
- `runtime-evidence/M002-S08-adapter-registration-evidence.json`
- `.gsd/milestones/M002/slices/S08/S08-PLAN.md`
- `.gsd/milestones/M002/slices/S08/tasks/T05-PLAN.md`
