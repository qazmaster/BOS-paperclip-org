# 11 - Hermes BOS Agents Smoke

This report is the reader-facing S02 evidence surface for Hermes-backed BOS Light agents in the live Paperclip sandbox. It pairs with the machine-readable environment artifact at `runtime-evidence/M002-S02-hermes-environment.json` and the latest agent-smoke artifact at `runtime-evidence/M002-S02-hermes-smoke.json`.

## Environment Gate Result

| Field | Value |
|---|---|
| Phase | `environment` |
| Artifact | `runtime-evidence/M002-S02-hermes-environment.json` |
| Artifact type | `smoke-evidence` |
| Blocker | none |
| Adapter | `hermes_local` |
| Company used for bounded probe | Disposable sandbox company `BOS Light S02 Hermes Runtime Gate` (`/BOSA`, `1a194762-74b6-4c84-ae3c-d2d8f6f31578`) |
| Seven-agent validation target | Not this company. The seven BOS Light division agents were later created/read back in canonical `/BOS` (`BOS Light Sandbox`, `43c74adb-b194-44d1-8f8e-ba142544bb9d`) during S07. |
| Core modification | None; the probe used supported Paperclip HTTP APIs and sandbox container administration only. |

The Hermes CLI was installed ephemerally inside the Paperclip sandbox container and `hermes --version` reported `Hermes Agent v0.15.0 (2026.5.28)`. The adapter environment check no longer reports `hermes_cli_not_found`.

The environment gate passes. The Xiaomi MiMo OpenAI-compatible credential is stored in Paperclip as encrypted company secrets and referenced through `adapterConfig.env` secret refs; non-secret base URLs are supplied as `XIAOMI_BASE_URL` and `OPENAI_BASE_URL` with value `https://token-plan-sgp.xiaomimimo.com/v1`. The adapter `testEnvironment` response reports `status=pass` with check codes `hermes_version`, `hermes_configured_default_model`, and `hermes_api_keys_found`.

## Runtime Fingerprint and API Boundary

- Paperclip health endpoint through the private SSH tunnel returned authenticated/private deployment with `bootstrapStatus=ready` and version `0.3.1`.
- Mutating browser-session API calls required `Origin: http://127.0.0.1:3131`; the runner records this as `trusted_origin` and sends it only for non-GET requests.
- Secret values are not committed. Sensitive adapter env values are stored as Paperclip encrypted secrets and referenced by `secret_ref`; the evidence artifact records env key names and redacts secret-like fields.
- No Paperclip core source, package code, or database rows were patched directly. The only sandbox administration change was filesystem ownership/permission remediation for Hermes home inside the container.

## Failure Modes (Q5)

External dependencies and handling:

- Paperclip HTTP API and network tunnel: connection failures, HTTP 401/403, and malformed JSON are captured into bounded diagnostics in the evidence artifact; 401/403 remains non-passing.
- Browser-authenticated mutation guard: missing trusted Origin returns `Board mutation requires trusted browser origin`; the runner supports an explicit trusted origin for cookie-authenticated mutating calls.
- Company authorization: unsafe adapter probes require active company membership; the task used supported HTTP/browser-authenticated boundaries instead of direct DB membership edits.
- Hermes CLI subprocess inside Paperclip: missing CLI maps to `hermes_cli_or_auth_unavailable`; after installation, `hermes_version` is captured.
- Hermes home filesystem: the first T03 live run failed with `PermissionError: [Errno 13] Permission denied: '/paperclip/.hermes/cron'`. The sandbox was remediated by changing `/paperclip/.hermes` and existing children to `node:node`, creating `/paperclip/.hermes/cron`, verifying `node` can write there, and verifying `hermes --version` starts cleanly as `node`.
- Hermes LLM authentication: inline sensitive keys are rejected by Paperclip strict secret mode; the intended passing path stores the Xiaomi/OpenAI-compatible key as Paperclip encrypted secrets and passes `secret_ref` bindings to the adapter. The latest agent-smoke run proves those refs are persisted on the agent, but the Hermes adapter wrapper still does not materialize them into Hermes subprocess env.
- Filesystem: evidence is written under `runtime-evidence/` and validated with the standard-library validator; no secret-bearing local temp files are committed.

## Load Profile (Q6)

Expected load is one environment gate attempt plus one bounded agent-smoke attempt after each concrete remediation: adapter registry/readback, health check, `testEnvironment`, agent creation, one on-demand heartbeat invoke, approvals before/after, and one delayed run readback. At 10x, the first saturation point is Paperclip HTTP auth/mutation handling and accumulated JSON artifacts, not CPU. Protections are no polling loop, bounded request timeouts, capped response reads, and fail-closed classification instead of retry storms.

## Negative Tests (Q7)

`python3 -m unittest scripts/test_validate_s02_hermes_smoke.py` covers malformed or unsafe evidence, including wrong adapter type, duplicate wake, created approvals, missing `resultJson.bos`, unredacted secret-like fields/values, blocker artifacts without reasons, missing no-core-modification proof, missing promoted-capability proof, and the task-plan CLI compatibility form `--phase environment --evidence ...`.

## Agent Smoke Attempt Result

| Field | Value |
|---|---|
| Phase | `agent-smoke` |
| Artifact | `runtime-evidence/M002-S02-hermes-smoke.json` |
| Artifact type | `fail-closed-blocker` |
| Latest agent created | `4b29a556-c7d6-4fc7-b10b-2465c64fac5d` |
| Latest run created | `391841b8-b878-4fa1-acb2-f0b30520924f` |
| Invoke source | `on_demand` |
| Terminal status | `failed` |
| Approvals created | `0` |
| Core modification | None; agent creation, environment gate, invoke, approvals readback, and run readback used supported Paperclip HTTP APIs. |

T03 was reopened after the first blocker, then remediated and retried through supported sandbox/container boundaries:

1. `/paperclip/.hermes` ownership was repaired so the Paperclip runtime user can create/write `/paperclip/.hermes/cron`.
2. `scripts/run_s02_hermes_smoke.py` was corrected to use current Paperclip heartbeat-run endpoints for run listing/readback.
3. The runner was corrected to persist non-secret env bindings and encrypted Paperclip `secret_ref` bindings on the created agent's `adapterConfig.env`.

The latest run reached Hermes execution and no longer fails on `/paperclip/.hermes/cron`. It still failed before producing `resultJson.bos`: Hermes reached the OpenAI-compatible provider without an authentication header and exited with `adapter_failed` (`Error code: 401 - {'error': {'message': 'Missing Authentication header', 'code': 401}}`). The agent readback shows `OPENAI_API_KEY` and `XIAOMI_API_KEY` as redacted secret-ref env bindings, but the installed `hermes-paperclip-adapter@0.2.0` execute path builds subprocess env from persisted `ctx.agent.adapterConfig.env`, while Paperclip resolves encrypted secrets into `ctx.config.env`. Because the wrapper does not merge the resolved secret values back into the Hermes agent config before invoking the adapter, Hermes receives provider base URLs but not a string API key.

This is fail-closed evidence, not a promoted runtime capability proof. A passing S02 proof still requires Paperclip to execute Hermes with resolved secret-ref env values without exposing keys inline.

## Current Verdict

Execution-time secret materialization remains the S02/T03 blocker.

T02 produces passing Hermes runtime environment proof, and the original Hermes home filesystem blocker is remediated. T03 remains blocked by execution-time secret materialization for `hermes_local`: encrypted Paperclip secret refs persist on the agent, but the Hermes subprocess does not receive a usable provider API key. `runtime-evidence/M002-S02-hermes-smoke.json` validates only with `--allow-blocker`; it is not passing smoke proof.

Do not promote BOS Light native/runtime capability posture from this run. The safe next remediation is a Paperclip upstream/core fix or supported adapter release that merges resolved `ctx.config.env` into Hermes subprocess env before invoking `hermes`, while preserving redaction and avoiding inline secrets.