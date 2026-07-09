---
id: T04
parent: S08
milestone: M002
key_files:
  - runtime-evidence/M002-S08-runtime-execution-smoke.json
key_decisions:
  - Do not promote `hermes_local_with_codex_cli_backend` runtime capability: Paperclip-owned Hermes starts, but Hermes itself is not configured for a non-interactive provider path.
  - Record the failure as a runtime configuration blocker, not as the original Hermes CLI availability blocker; `hermes_cli_not_found` remains remediated.
duration: 
verification_result: passed
completed_at: 2026-05-29T18:10:46.708Z
blocker_discovered: true
---

# T04: Ran the approved Paperclip-owned Hermes plus Codex T04 smoke and failed closed on Hermes non-interactive provider configuration, with run/readback evidence captured.

**Ran the approved Paperclip-owned Hermes plus Codex T04 smoke and failed closed on Hermes non-interactive provider configuration, with run/readback evidence captured.**

## What Happened

Created a fresh Paperclip-owned `hermes_local` smoke agent for `/BOS` using `hermesCommand=/paperclip/hermes-runtime/bin/hermes-paperclip`, `provider=openai-codex`, and `model=gpt-5.3-codex`, then invoked one bounded heartbeat run after explicit user approval. Paperclip created agent `5475a6a0-3668-4763-9bf8-651bbdf94f4a` and run `9f7c4b62-5970-4416-b4e5-a55b8f99fb0f`; the run count delta was exactly one, so no duplicate wake was observed. The run failed quickly with `adapter_failed`, exit code 1. Logs show Paperclip launched Hermes (`[hermes] Starting Hermes Agent`) but Hermes reported no configured API keys or providers and that interactive setup cannot run without a TTY. The artifact preserves redacted create/invoke/readback data, resultJson summary, log hash/reference, and fail-closed blocker reasons.

## Verification

Fresh verification ran after writing the artifact: `python3 -m json.tool runtime-evidence/M002-S08-runtime-execution-smoke.json >/dev/null && python3 scripts/validate_m002_closeout.py --phase final` exited 0 with `M002 closeout OK: evidence, conservative matrix posture, docs, secrets, and no-core boundary guard passed.` Additional inline assertions confirmed artifact_type is fail-closed-blocker, runtime/provider execution flags are true, core/private/DB mutation flags are false, run status is failed with `adapter_failed`, exitCode=1, no interactive TTY diagnostic is present, and wakeCountDelta=1.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 -m json.tool runtime-evidence/M002-S08-runtime-execution-smoke.json >/dev/null && python3 scripts/validate_m002_closeout.py --phase final` | 0 | ✅ pass | 0ms |
| 2 | `python3 - <<'PY'
import json
from pathlib import Path
p=Path('runtime-evidence/M002-S08-runtime-execution-smoke.json')
e=json.loads(p.read_text())
assert e['artifact_type']=='fail-closed-blocker'
assert 'run_status_not_succeeded' in e['blocker_reason']
assert 'missing_resultJson_bos' in e['blocker_reason']
assert e['operation_flags']['runtime_smoke_attempted'] is True
assert e['operation_flags']['provider_execution_attempted'] is True
assert e['operation_flags']['paperclip_core_patched'] is False
assert e['operation_flags']['direct_database_mutation'] is False
assert e['operation_flags']['private_internals_used'] is False
run=e['run']['final_readback']['json']
assert run['status']=='failed'
assert run['errorCode']=='adapter_failed'
assert run['exitCode']==1
assert 'No interactive TTY detected' in run['resultJson']['result']
assert e['run']['wakeCountDelta']==1
print('validated: T04 fail-closed artifact captures Paperclip-owned run, exact Hermes config blocker, and no duplicate wake')
PY` | 0 | ✅ pass | 0ms |

## Deviations

T04 executed after explicit approval even though repeated T03 was `ready_with_warning`, because the remaining warning could only be resolved by bounded runtime execution. The smoke correctly failed closed instead of promoting capability.

## Known Issues

Hermes starts under Paperclip but exits with adapter_failed because Hermes reports no configured API keys or providers and cannot run its interactive first-run setup in the Paperclip non-interactive environment. The run has no `resultJson.bos`, so BOS runtime capability must remain unpromoted. A supported follow-up would need fresh approval to run non-interactive Hermes config commands or another documented provider setup path.

## Files Created/Modified

- `runtime-evidence/M002-S08-runtime-execution-smoke.json`
