# S10: Runtime adapter execution proof remediation

**Goal:** Produce or fail-close a supported-boundary runtime execution proof for Hermes via the approved Codex backend path and gsdpi_local, then reconcile capability posture, requirements, docs, and closeout validators without plaintext secrets, Paperclip core patches, private imports, or direct database mutation.
**Demo:** After this: Hermes and gsdpi_local runtime execution proof is either produced through supported Paperclip boundaries with no plaintext secrets or core patches, or the milestone requirements and success criteria are explicitly re-scoped with approved requirement updates and conservative validation evidence.

## Must-Haves

- Slice verification is defined before execution: (1) `python3 scripts/test_validate_s10_runtime_execution.py` proves the S10 validator rejects duplicate wakes, missing `resultJson.bos`, missing `BosAdapterResult`, unredacted secrets, direct DB/core/private-internal flags, and unsupported capability promotion; (2) `python3 scripts/run_s10_hermes_runtime_smoke.py --output runtime-evidence/M002-S10-hermes-runtime-execution-proof.json && python3 scripts/validate_s10_runtime_execution.py --evidence runtime-evidence/M002-S10-hermes-runtime-execution-proof.json --phase hermes` produces either supported Paperclip-owned Hermes runtime proof with `wakeCountDelta=1` and BOS-shaped readback or a redacted fail-closed blocker; (3) `python3 scripts/run_s10_gsdpi_runtime_smoke.py --output runtime-evidence/M002-S10-gsdpi-runtime-execution-proof.json && npm --prefix adapters/gsdpi-local test && python3 scripts/validate_s10_runtime_execution.py --evidence runtime-evidence/M002-S10-gsdpi-runtime-execution-proof.json --phase gsdpi` produces either supported gsdpi_local registration/testEnvironment/execute proof with `BosAdapterResult` or a redacted fail-closed blocker; (4) final docs and capability matrix promote Hermes or GSD-Pi execution only when the matching proof artifact passes, otherwise they explicitly record S10 non-promotion and any requirement re-scope decision; (5) `python3 scripts/run_m002_regression_closure.py --output runtime-evidence/M002-S06-regression-closure.json` passes after adding S10 to closeout coverage.
- Threat Surface Q3: live Paperclip API calls and local adapter command execution can leak tokens or mutate sandbox state if mishandled. Runners must use only existing environment variables, redact secret-like keys/values, perform bounded one-run smokes, avoid approval creation unless explicitly already in evidence scope, never inspect Paperclip private internals, never patch Paperclip core, and never mutate a database directly.
- Requirement Impact Q4: owns R009, R010, and R011. It may update validation notes or scope language if proof remains unavailable, but must not weaken no-core/no-private/no-plaintext/no-direct-DB boundaries. Decisions D008, D009, D010, and D011 remain locked unless fresh supported evidence requires a new recorded decision.
- Failure Modes Q5: missing Paperclip URL/token, unavailable Codex/Hermes provider config, unsupported gsdpi_local adapter registration, HTTP 4xx/5xx, malformed run JSON, timeout, or duplicate wake must produce blocker artifacts rather than simulated success.
- Load Profile Q6: one bounded Hermes smoke and one bounded GSD-Pi smoke; timeout and side-effect counters are more important than throughput. At 10x, Paperclip API rate limits and local process slots would be the first likely bottlenecks, so S10 must not introduce loops or background workers.
- Negative Tests Q7: fixtures must cover missing evidence fields, `wakeCountDelta != 1`, passing status without `resultJson.bos`, gsdpi execute without parseable `bosAdapterResult`, unredacted secret strings, and matrix rows marked `confirmed` without matching proof.

## Threat Surface

## Abuse scenarios reviewed

- **Parameter tampering:** Runner inputs such as Paperclip base URL/token environment, adapter type, selected path, output artifact paths, evidence JSON, and capability matrix rows could be tampered to claim unsupported execution. S10 mitigates this by validating exact selected path (`hermes_local_with_codex_cli_backend`), adapter types (`hermes_local`, `gsdpi_local`), supported registry/readback fields, proof artifact paths, and rejecting capability promotion without matching proof.
- **Replay/duplicate execution:** Runtime smoke could accidentally trigger multiple wakes or reuse stale success evidence. S10 explicitly requires one bounded smoke, `wakeCountDelta=1`, malformed timestamp rejection, and duplicate-wake negative tests.
- **Privilege escalation / boundary bypass:** The highest-risk abuse is proving runtime execution by patching Paperclip core, importing private internals, mutating a DB directly, or inferring live support from local package tests. S10 explicitly forbids Paperclip core patches, private imports, and direct DB mutation, and separates local `gsdpi_local` readiness from live Paperclip registration/execute proof.
- **Side effects:** Hermes live API calls and local adapter execution can mutate sandbox state or create approvals. S10 requires bounded one-run smokes, side-effect counters, and no approval creation unless explicitly declared safe in evidence.

## Data exposure risks

- Possible sensitive data: Paperclip URL/token, Codex/Hermes provider config, environment variables, run IDs, local process logs, and adapter command output.
- Required controls: use only existing environment variables, never collect or serialize secrets, redact secret-like keys/values, and validate artifacts for plaintext secret strings before accepting proof.

## Trust boundaries

- Untrusted or semi-trusted inputs reach the filesystem via JSON evidence and docs/matrix updates.
- Live HTTP responses from Paperclip are untrusted and must be parsed defensively, timeout bounded, and recorded as blocker evidence on 4xx/5xx/malformed JSON.
- Local subprocess execution for `gsdpi_local` must use safe command arrays and bounded timeouts.

## Gate outcome

No unresolved security concern blocks execution because the slice plan already names the exploit surfaces and embeds fail-closed validator requirements before runner implementation.

## Requirement Impact

## Requirements touched

- **R009** — runtime capability promotion posture. S10 may only mark Hermes or GSD-Pi runtime execution as confirmed when the matching S10 proof artifact passes; otherwise docs/matrix must explicitly record non-promotion or re-scope.
- **R010** — runtime execution side-effect/wake semantics. S10 must preserve `wakeCountDelta=1` for supported Hermes proof or explicitly record non-proof/blocker status if the metric cannot be measured.
- **R011** — supported-boundary constraints. S10 must preserve no Paperclip core patches, no private/internal imports, no plaintext secrets, and no direct DB mutation for both Hermes and `gsdpi_local` evidence.

## Must be re-tested after shipping

1. `python3 scripts/test_validate_s10_runtime_execution.py` — validates S10 proof/blocker contract and negative cases.
2. `python3 scripts/run_s10_hermes_runtime_smoke.py --output runtime-evidence/M002-S10-hermes-runtime-execution-proof.json && python3 scripts/validate_s10_runtime_execution.py --evidence runtime-evidence/M002-S10-hermes-runtime-execution-proof.json --phase hermes` — re-tests Hermes supported-boundary proof or fail-closed blocker.
3. `python3 scripts/run_s10_gsdpi_runtime_smoke.py --output runtime-evidence/M002-S10-gsdpi-runtime-execution-proof.json && npm --prefix adapters/gsdpi-local test && python3 scripts/validate_s10_runtime_execution.py --evidence runtime-evidence/M002-S10-gsdpi-runtime-execution-proof.json --phase gsdpi` — re-tests local adapter contract and live `gsdpi_local` registration/testEnvironment/execute proof or blocker.
4. `python3 scripts/validate_s10_runtime_execution.py --phase final --write-audit runtime-evidence/M002-S10-runtime-execution-closeout.json && python3 scripts/validate_runtime_capabilities.py && python3 scripts/validate_m002_closeout.py --phase final` — re-tests docs/matrix posture and milestone closeout consistency.
5. `python3 scripts/run_m002_regression_closure.py --output runtime-evidence/M002-S06-regression-closure.json` — re-tests durable regression closure after S10 wiring.

## Decisions to revisit

- **D008, D009, D010, D011** remain locked per the slice plan unless fresh supported runtime evidence requires a new recorded decision.
- S10 should not weaken requirement scope language; if proof remains unavailable, use requirement update tooling or scope-resolution evidence to record conservative non-promotion rather than editing `.gsd/REQUIREMENTS.md` manually.

## Proof Level

- This slice proves: Operational and final-assembly proof. Real runtime is attempted through supported Paperclip boundaries, but fail-closed evidence plus explicit re-scope/non-promotion is an acceptable S10 outcome when the live boundary is unavailable. Human/UAT is not required during autonomous execution; do not ask for secrets.

## Integration Closure

Consumes S08 selected path and fail-closed Hermes/Codex evidence, S03 GSD-Pi registration evidence, the checked-in gsdpi_local adapter package, runtime capability matrix, and M002 closeout validators. Introduces S10 proof runners, a S10 validator, runtime evidence artifacts, and closeout wiring. After S10, M002 should have no ambiguous runtime-execution gap: either Hermes/GSD-Pi execution is proven and promoted by exact artifact path, or the milestone is conservatively re-scoped and ready for final validation without overclaiming.

## Verification

- Adds redacted JSON evidence under `runtime-evidence/M002-S10-*`, validator diagnostics with path-specific errors, side-effect and wake counters for Hermes, gsdpi_local registration/testEnvironment/execute status, and refreshed regression closure evidence so future agents can distinguish proof, blocker, and re-scope outcomes without reading raw logs or secrets.

## Tasks

- [x] **T01: Added a standard-library S10 runtime execution validator and unittest fixture suite for Hermes, GSD-Pi, final capability posture, redaction, and unsupported-boundary failures.** `est:2h`
  skills_used: tdd, verify-before-complete, security-review
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s10_runtime_execution.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_s10_runtime_execution.py`
  - Verify: python3 scripts/test_validate_s10_runtime_execution.py

- [ ] **T02: Record Hermes supported smoke evidence with hard-blocker force guard** `est:1h`
  Remediate the Hermes smoke runner force-bypass path so --force-single-run-after-warning can only bypass warning-only preflight conditions and can never bypass hard blockers such as missing_auth, adapter registry auth/unsupported/unavailable, hermes_local not registered, testEnvironment auth/unsupported failure, or unsupported Codex backend config. Add/extend unit tests proving hard blockers still produce fail-closed blocker artifacts with zero state-changing runtime invocation even when the force flag is supplied. Regenerate the Hermes S10 evidence artifact and confirm it remains redacted and non-promoting unless supported proof exists.
  - Files: `scripts/run_s10_hermes_runtime_smoke.py`, `scripts/test_run_s10_hermes_runtime_smoke.py`, `runtime-evidence/M002-S10-hermes-runtime-execution-proof.json`
  - Verify: PYTHONDONTWRITEBYTECODE=1 python3 -m unittest scripts/test_run_s10_hermes_runtime_smoke.py && PYTHONDONTWRITEBYTECODE=1 python3 scripts/run_s10_hermes_runtime_smoke.py --output runtime-evidence/M002-S10-hermes-runtime-execution-proof.json && PYTHONDONTWRITEBYTECODE=1 python3 scripts/validate_s10_runtime_execution.py --evidence runtime-evidence/M002-S10-hermes-runtime-execution-proof.json --phase hermes

- [ ] **T03: Record GSD-Pi adapter execution evidence with secret-safe execution diagnostics** `est:1.5h`
  Remediate the gsdpi_local adapter execution secret-handling path so child process env construction does not blindly inherit secret-bearing host environment variables and returned diagnostics redact secret-like values from stdout/stderr excerpts. Add adapter tests for host secret env filtering and stdout/stderr secret redaction, while preserving BosAdapterResult parsing, timeout, and fail-closed behavior. Regenerate/validate S10 GSD-Pi runtime evidence; local adapter package pass remains diagnostic only and cannot promote runtime execution without supported Paperclip registry/testEnvironment/execute proof.
  - Files: `adapters/gsdpi-local/src/server/execute.ts`, `adapters/gsdpi-local/tests/execute.test.ts`, `scripts/run_s10_gsdpi_runtime_smoke.py`, `runtime-evidence/M002-S10-gsdpi-runtime-execution-proof.json`
  - Verify: PYTHONDONTWRITEBYTECODE=1 python3 -m unittest scripts/test_run_s10_gsdpi_runtime_smoke.py && npm --prefix adapters/gsdpi-local test && PYTHONDONTWRITEBYTECODE=1 python3 scripts/run_s10_gsdpi_runtime_smoke.py --output runtime-evidence/M002-S10-gsdpi-runtime-execution-proof.json && PYTHONDONTWRITEBYTECODE=1 python3 scripts/validate_s10_runtime_execution.py --evidence runtime-evidence/M002-S10-gsdpi-runtime-execution-proof.json --phase gsdpi

- [x] **T04: Reconciled S10 docs, matrix posture, requirement scope, and final validator audit so Hermes and GSD-Pi execution remain fail-closed with explicit blocker evidence and no capability promotion.** `est:2h`
  skills_used: write-docs, verify-before-complete, security-review
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S10-requirement-scope-resolution.json`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_runtime_capabilities.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_runtime_capabilities.py`
  - Verify: python3 scripts/validate_s10_runtime_execution.py --phase final --write-audit runtime-evidence/M002-S10-runtime-execution-closeout.json && python3 scripts/validate_runtime_capabilities.py && python3 scripts/validate_m002_closeout.py --phase final

- [ ] **T05: Wire S10 into closeout regression after security remediation** `est:1h`
  After T02 and T03 remediations, refresh the S10 final audit and M002 regression closure artifacts so they reflect the hardened runner/adapter behavior. Re-run the authoritative unit/final/regression chain and ensure final closeout validators still pass with proof-gated capability posture, redacted artifacts, no Paperclip core patch/private import/direct DB mutation, and no unsupported capability promotion.
  - Files: `scripts/run_m002_regression_closure.py`, `scripts/test_run_m002_regression_closure.py`, `runtime-evidence/M002-S10-runtime-execution-closeout.json`, `runtime-evidence/M002-S06-regression-closure.json`
  - Verify: PYTHONDONTWRITEBYTECODE=1 python3 -m unittest scripts/test_validate_s10_runtime_execution.py scripts/test_run_m002_regression_closure.py && PYTHONDONTWRITEBYTECODE=1 python3 scripts/validate_s10_runtime_execution.py --phase final --write-audit runtime-evidence/M002-S10-runtime-execution-closeout.json && PYTHONDONTWRITEBYTECODE=1 python3 scripts/run_m002_regression_closure.py --output runtime-evidence/M002-S06-regression-closure.json

## Files Likely Touched

- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s10_runtime_execution.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_s10_runtime_execution.py
- scripts/run_s10_hermes_runtime_smoke.py
- scripts/test_run_s10_hermes_runtime_smoke.py
- runtime-evidence/M002-S10-hermes-runtime-execution-proof.json
- adapters/gsdpi-local/src/server/execute.ts
- adapters/gsdpi-local/tests/execute.test.ts
- scripts/run_s10_gsdpi_runtime_smoke.py
- runtime-evidence/M002-S10-gsdpi-runtime-execution-proof.json
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S10-requirement-scope-resolution.json
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_runtime_capabilities.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_runtime_capabilities.py
- scripts/run_m002_regression_closure.py
- scripts/test_run_m002_regression_closure.py
- runtime-evidence/M002-S10-runtime-execution-closeout.json
- runtime-evidence/M002-S06-regression-closure.json
