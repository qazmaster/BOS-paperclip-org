# S03: GSD-Pi local adapter smoke

**Goal:** Prove, through supported Paperclip external-adapter boundaries only, whether a standalone gsdpi_local adapter can be registered, pass testEnvironment, and execute one harmless Div4 quality job returning BosAdapterResult gate evidence; if registration or execution requires Paperclip core changes, fail closed with redacted diagnostics and no capability promotion.
**Demo:** Paperclip can invoke gsdpi_local for a harmless Div4 quality job and receive BosAdapterResult gate evidence or a fail-closed diagnostic artifact.

## Must-Haves

- Evidence harness validates both passing and fail-closed S03 artifacts.
- gsdpi_local adapter is implemented or packaged as a standalone external adapter candidate without importing Paperclip private internals.
- Paperclip registration/testEnvironment is attempted only through supported plugin/external-adapter/admin/container boundaries.
- One bounded no-source-write GSD-Pi execution returns BosAdapterResult gate evidence, or the blocker artifact records why it cannot.
- Docs and capability matrix remain conservative unless live version/build/readback proof exists.
- No secrets, local credentials, Paperclip API tokens, or provider keys are committed.

## Threat Surface

## Q3 exploitation analysis

### Abuse scenarios
- **Parameter tampering:** `gsdpi_local` execution can be influenced by adapter/input fields such as `command`, `args`, `prompt`, `task`, `cwd`, `env`, and `timeoutMs`; if these are exposed to untrusted callers, an attacker could attempt arbitrary local command execution, path traversal via `cwd`, environment manipulation, or unexpected GSD-Pi actions. `shell: false` reduces shell-injection risk, but it does not remove command/argument abuse if the command or cwd is attacker-controlled.
- **Replay / duplicate side effects:** Paperclip agent/run retries or repeated adapter invocations could duplicate quality jobs, wake events, approval requests, comments, or evidence writes unless S03 enforces bounded no-source-write execution and records one wake, zero approvals, and no duplicate side effects.
- **Privilege escalation:** Registering the adapter through unsupported Paperclip internals, direct DB mutation, private module imports, or core patches could bypass Paperclip adapter authorization/audit paths and invalidate the external-boundary model.

### Data exposure risks
- The adapter and evidence harness must not commit or emit local credentials, Paperclip API tokens, provider keys, cookies, or inline secret env values.
- Diagnostics currently include env key names and stdout/stderr excerpts; values must remain redacted, and excerpts must be checked for token-like content before committing runtime evidence.
- Runtime evidence may reveal sandbox URLs, version/build facts, installed package versions, cwd, and command paths; these are lower sensitivity but should remain scoped to redacted diagnostics.

### Trust boundaries
- Boundary from Paperclip/admin configuration into adapter `command`/`args`/`cwd`/`env` must be treated as trusted-operator-only configuration, not end-user input.
- Boundary from Paperclip agent task/prompt into GSD-Pi command arguments must be constrained to a harmless Div4 no-source-write job.
- Boundary from local subprocess output into JSON evidence/docs must be parsed conservatively and fail closed when no valid `BosAdapterResult` is emitted.

### Required controls before claiming success
- Use supported plugin/external-adapter/admin/container boundaries only; no Paperclip core patch, direct DB write, monkey patch, or private import.
- Prefer fixed/allowlisted command (`gsd`/known adapter command), bounded timeout, fixed working directory, no source writes, and no approval creation during the smoke.
- Persist only redacted evidence and keep capability matrix claims conservative unless live registration/readback plus execute proof exists.

## Requirement Impact

## Q4 requirement impact analysis

### Requirements touched
- **R011** — BOS Light must integrate with Paperclip only through stable external boundaries: company templates, Paperclip plugin APIs, Paperclip agent configuration, and custom adapter interfaces; it must not patch or depend on Paperclip core internals.
  - S03 directly touches R011 by implementing/packaging `gsdpi_local` as a standalone external adapter candidate, attempting registration/testEnvironment only through supported Paperclip boundaries, and requiring no core/private dependency or direct DB mutation.

### Requirements to re-test after S03
- **R011 re-test required:**
  - Validate `scripts/validate_s03_gsdpi_smoke.py` evidence for environment, registration, execute, and final phases as applicable.
  - Confirm evidence includes `no_core_modification.core_source_patched=false`, `direct_db_mutation=false`, and no private internal Paperclip dependency/import.
  - Confirm `runtime-evidence/M002-S03-gsdpi-registration.json` records supported boundary/readback or a fail-closed blocker.
  - Confirm `runtime-evidence/M002-S03-gsdpi-smoke.json` contains valid `BosAdapterResult`/`resultJson.bos` only when Paperclip actually invoked `gsdpi_local`, otherwise records a blocker without simulating execution success.
  - Confirm docs and `plugin-bos-light/capabilities.paperclip-runtime.json` remain conservative unless version/build/readback proof exists.
  - Re-run local adapter tests/typecheck and runtime capability validators named in S03 tasks.

### Validated requirements to watch
- **R009** (Eval Gate fixture proof) and **R010** (Circuit Breaker fixture proof) are present as validated requirements, but S03 does not directly modify their implementation contract. Re-test them only if T06 capability-matrix/doc changes promote or alter Eval Gate/Circuit Breaker runtime support claims.

### Decisions to revisit
- **D008** and **D009** remain aligned with S03: use Paperclip native adapter/agent boundaries and keep Paperclip core read-only. Revisit only if live evidence proves Paperclip lacks any supported external/custom adapter path for `gsdpi_local` and an official alternative extension point is documented.

## Proof Level

- This slice proves: Operational integration proof against the live Paperclip sandbox when possible; fail-closed blocker proof if external adapter registration, CLI availability, or execution cannot be achieved through supported boundaries.

## Integration Closure

Consumes S01 runtime/container preflight and S02's conservative no-core/no-secret evidence discipline. Produces S03 artifacts for downstream S04: either a passing gsdpi_local adapter testEnvironment plus bounded execution evidence, or a fail-closed diagnostic showing the supported registration/execution blocker. No Paperclip core patch, direct DB mutation, or private internal module import is allowed.

## Verification

- Adds redacted S03 runtime-evidence artifacts with adapter registry/testEnvironment/execute diagnostics, side-effect counts, no-core-modification proof, and a reader-facing GSD-Pi adapter report so future agents can decide whether Div4 quality automation is available.

## Tasks

- [x] **T01: Added the S03 GSD-Pi smoke evidence validator and tests.** `est:1h`
  Create standard-library S03 evidence validation for GSD-Pi adapter runtime proof. Define the JSON contract for environment and execute phases, including adapterType gsdpi_local, registry/readback, testEnvironment result, execute resultJson.bos or BosAdapterResult, side-effect counts, no-core-modification proof, and fail-closed blocker handling. Add tests covering missing result, wrong adapter, unredacted secrets, direct DB/core modification claims, and conservative blocker acceptance.
  - Files: `scripts/validate_s03_gsdpi_smoke.py`, `scripts/test_validate_s03_gsdpi_smoke.py`
  - Verify: python3 -m unittest scripts/test_validate_s03_gsdpi_smoke.py

- [x] **T02: Built a standalone gsdpi_local adapter candidate with package-local tests and no Paperclip core/private dependency.** `est:2h`
  Build the smallest standalone gsdpi_local external adapter candidate in the repository, keeping it separate from plugin-bos-light runtime code. Implement createServerAdapter, testEnvironment, and execute semantics that run a configured GSD-Pi command with bounded timeout and parse/return BosAdapterResult JSON without spawning from the BOS plugin. Do not depend on Paperclip private source modules; use documented adapter contracts and package-local tests/mocks only.
  - Files: `adapters/gsdpi-local/package.json`, `adapters/gsdpi-local/tsconfig.json`, `adapters/gsdpi-local/src/index.ts`, `adapters/gsdpi-local/src/server/execute.ts`, `adapters/gsdpi-local/src/server/test.ts`, `adapters/gsdpi-local/tests/execute.test.ts`
  - Verify: npm --prefix adapters/gsdpi-local test && npm --prefix adapters/gsdpi-local run typecheck

- [x] **T03: Passed the S03 GSD-Pi environment gate by installing and verifying `gsd` in the Paperclip sandbox container.** `est:1h`
  Use supported sandbox/container administration to establish whether the Paperclip execution environment has a usable GSD-Pi command path. Prefer installed `gsd` or `pi` availability checks and package-managed installation only if safe and non-secret. Produce environment evidence with command version, node/npm/pnpm facts, adapter registry facts, and explicit no-core/no-DB proof. If installation or command availability requires unsupported mutation, fail closed.
  - Files: `scripts/run_s03_gsdpi_smoke.py`, `runtime-evidence/M002-S03-gsdpi-environment.json`, `docs/12_GSDPI_LOCAL_ADAPTER_SMOKE.md`
  - Verify: python3 scripts/validate_s03_gsdpi_smoke.py --phase environment --evidence runtime-evidence/M002-S03-gsdpi-environment.json --allow-blocker

- [x] **T04: Register gsdpi_local through supported boundary** `est:1.5h`
  Attempt to register or expose gsdpi_local to Paperclip through documented external adapter/plugin configuration only. Record exact supported boundary used, adapter registry readback, and whether testEnvironment can call the adapter. If Paperclip requires core code edits or direct database mutation to load the adapter, stop and record a fail-closed blocker rather than modifying Paperclip.
  - Files: `runtime-evidence/M002-S03-gsdpi-registration.json`, `docs/12_GSDPI_LOCAL_ADAPTER_SMOKE.md`, `scripts/run_s03_gsdpi_smoke.py`
  - Verify: python3 scripts/validate_s03_gsdpi_smoke.py --phase registration --evidence runtime-evidence/M002-S03-gsdpi-registration.json --allow-blocker

- [x] **T05: Run bounded GSD-Pi adapter smoke** `est:1.5h`
  If environment and registration pass, create one bounded Paperclip agent/run using adapterType gsdpi_local for a harmless Div4 no-source-write quality job. Require a structured BosAdapterResult or resultJson.bos, one wake, zero approvals, no source writes, and no duplicate side effects. If prerequisites are blocked, preserve the blocker artifact and do not simulate execution success.
  - Files: `runtime-evidence/M002-S03-gsdpi-smoke.json`, `docs/12_GSDPI_LOCAL_ADAPTER_SMOKE.md`, `scripts/run_s03_gsdpi_smoke.py`
  - Verify: python3 scripts/validate_s03_gsdpi_smoke.py --phase execute --evidence runtime-evidence/M002-S03-gsdpi-smoke.json --allow-blocker

- [x] **T06: Close S03 docs matrix and boundary audit** `est:1h`
  Update the live validation report, runtime capability health doc, and capability matrix only for GSD-Pi surfaces proven by S03 evidence. Keep gsdpi_local unvalidated or blocked if live registration/execution did not pass. Add downstream guidance for S04 so artifact flow uses GSD-Pi only when S03 provides passing proof, otherwise uses documented fallbacks.
  - Files: `PAPERCLIP_LIVE_VALIDATION_REPORT.md`, `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, `docs/12_GSDPI_LOCAL_ADAPTER_SMOKE.md`, `plugin-bos-light/capabilities.paperclip-runtime.json`
  - Verify: python3 scripts/validate_s03_gsdpi_smoke.py --phase final --evidence runtime-evidence/M002-S03-gsdpi-smoke.json && python3 scripts/validate_runtime_capabilities.py

## Files Likely Touched

- scripts/validate_s03_gsdpi_smoke.py
- scripts/test_validate_s03_gsdpi_smoke.py
- adapters/gsdpi-local/package.json
- adapters/gsdpi-local/tsconfig.json
- adapters/gsdpi-local/src/index.ts
- adapters/gsdpi-local/src/server/execute.ts
- adapters/gsdpi-local/src/server/test.ts
- adapters/gsdpi-local/tests/execute.test.ts
- scripts/run_s03_gsdpi_smoke.py
- runtime-evidence/M002-S03-gsdpi-environment.json
- docs/12_GSDPI_LOCAL_ADAPTER_SMOKE.md
- runtime-evidence/M002-S03-gsdpi-registration.json
- runtime-evidence/M002-S03-gsdpi-smoke.json
- PAPERCLIP_LIVE_VALIDATION_REPORT.md
- docs/08_RUNTIME_CAPABILITY_HEALTH.md
- plugin-bos-light/capabilities.paperclip-runtime.json
