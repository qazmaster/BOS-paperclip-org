---
id: T03
parent: S02
milestone: M002
key_files:
  - scripts/run_s02_hermes_smoke.py
  - runtime-evidence/M002-S02-hermes-smoke.json
  - runtime-evidence/s02-hermes-agent-smoke-fail-closed-blocker-20260529T010125Z.json
  - docs/11_HERMES_BOS_AGENTS_SMOKE.md
key_decisions:
  - Fail closed instead of injecting plaintext API keys or patching Paperclip core.
  - Treat the remaining failure as execution-time secret materialization in hermes_local, not as an environment gate failure.
  - Stop additional smoke attempts until Paperclip adapter/core behavior can resolve encrypted secret refs into Hermes subprocess env safely.
duration: 
verification_result: passed
completed_at: 2026-05-29T01:10:24.666Z
blocker_discovered: true
---

# T03: Remediated the Hermes home permission blocker and runner harness issues, then captured a new fail-closed T03 blocker for Hermes execution-time secret materialization.

**Remediated the Hermes home permission blocker and runner harness issues, then captured a new fail-closed T03 blocker for Hermes execution-time secret materialization.**

## What Happened

Reopened T03 per user approval, recreated the Paperclip tunnel, and remediated the original Hermes home filesystem blocker inside the sandbox container by changing /paperclip/.hermes ownership to node:node, creating /paperclip/.hermes/cron, verifying node can write there, and verifying hermes --version starts cleanly as node. Patched the smoke runner to use current heartbeat-run list/readback endpoints and to persist the same non-secret env and encrypted Paperclip secret-ref bindings on the created agent. The next live bounded smoke no longer failed on /paperclip/.hermes/cron. It reached Hermes execution but failed closed because the provider request lacked an Authentication header. Remote source inspection showed Paperclip resolves encrypted secret refs into runtime config, while hermes-paperclip-adapter@0.2.0 builds the Hermes subprocess env from the persisted agent adapter config. Under the no-inline-secrets and no-core-patch constraints, this cannot be safely worked around in T03.

## Verification

Fresh verification after the last code/report changes: strict agent-smoke validation returned exit 2 as expected for non-passing proof; agent-smoke validation with --allow-blocker passed; py_compile passed for scripts/run_s02_hermes_smoke.py and scripts/validate_s02_hermes_smoke.py; unittest ran 14 tests OK; environment evidence validation passed; secret scan over runtime-evidence/M002-S02-hermes-smoke.json and docs/11_HERMES_BOS_AGENTS_SMOKE.md reported secret_like_matches=0; SSH tunnel was stopped with remaining_tunnel_pids=none.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `python3 scripts/validate_s02_hermes_smoke.py --phase agent-smoke --evidence runtime-evidence/M002-S02-hermes-smoke.json` | 2 | ✅ expected fail: strict smoke validation rejects blocker artifact | 1000ms |
| 2 | `python3 scripts/validate_s02_hermes_smoke.py --phase agent-smoke --evidence runtime-evidence/M002-S02-hermes-smoke.json --allow-blocker` | 0 | ✅ pass: blocker artifact valid | 1000ms |
| 3 | `python3 -m py_compile scripts/run_s02_hermes_smoke.py scripts/validate_s02_hermes_smoke.py && python3 -m unittest scripts/test_validate_s02_hermes_smoke.py && python3 scripts/validate_s02_hermes_smoke.py --phase environment --evidence runtime-evidence/M002-S02-hermes-environment.json` | 0 | ✅ pass: compile, 14 tests, environment proof | 2000ms |
| 4 | `secret scan over runtime-evidence/M002-S02-hermes-smoke.json and docs/11_HERMES_BOS_AGENTS_SMOKE.md` | 0 | ✅ pass: secret_like_matches=0 | 1000ms |
| 5 | `SSH tunnel cleanup confirmation` | 0 | ✅ pass: remaining_tunnel_pids=none | 1000ms |

## Deviations

The task was reopened after the first Hermes home permission blocker. Remediation fixed /paperclip/.hermes ownership and runner endpoint/env binding issues, but the live smoke still fails before resultJson.bos because Paperclip's installed Hermes adapter does not materialize encrypted secret-ref env values into the Hermes subprocess env. No Paperclip core patch or direct DB mutation was made.

## Known Issues

T03 remains blocked for passing smoke proof. Latest run 391841b8-b878-4fa1-acb2-f0b30520924f failed with adapter_failed: OpenAI-compatible provider returned 401 Missing Authentication header. Agent readback shows OPENAI_API_KEY and XIAOMI_API_KEY persisted as redacted Paperclip secret refs, but hermes-paperclip-adapter@0.2.0 executes from ctx.agent.adapterConfig.env while Paperclip resolves secrets into ctx.config.env, leaving Hermes without a string API key.

## Files Created/Modified

- `scripts/run_s02_hermes_smoke.py`
- `runtime-evidence/M002-S02-hermes-smoke.json`
- `runtime-evidence/s02-hermes-agent-smoke-fail-closed-blocker-20260529T010125Z.json`
- `docs/11_HERMES_BOS_AGENTS_SMOKE.md`
