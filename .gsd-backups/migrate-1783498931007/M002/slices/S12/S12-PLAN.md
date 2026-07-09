# S12: Runtime proof or approved rescope

**Goal:** Produce a fail-closed S12 disposition for Paperclip runtime execution that either validates supported-boundary Hermes resultJson.bos and gsdpi_local BosAdapterResult proof or records an explicit approved rescope without promoting blocker evidence.
**Demo:** After this: Hermes resultJson.bos and gsdpi_local BosAdapterResult proof is produced through supported Paperclip boundaries with no plaintext secrets or core patches, or approved requirement and success criterion updates explicitly rescope the runtime execution goals.

## Must-Haves

- Runtime execution is attempted only through supported Paperclip HTTP, registry, adapter, and agent boundaries.
- S12 writes exactly one disposition outcome: passing runtime proof for both surfaces, or approved runtime rescope with explicit approval source and blocker citations.
- Fail-closed Hermes or GSD-Pi evidence is not reused as Eval Gate, Circuit Breaker, Hermes, GSD-Pi, or runtime proof.
- Capability matrix, live validation report, runtime health doc, and M002/S12 assessments agree on the outcome.
- S12 validation is wired into M002 regression closure before final closeout.
- No core patching, private imports, direct DB mutation, plaintext secrets, shell-string execution, or unsupported promotion is introduced.

## Threat Surface

## Q3 Exploitability Findings

### Abuse scenarios to guard
- **Parameter tampering:** runtime evidence or disposition JSON could be edited to flip `outcome` to `runtime_proof`, set `capability_promoted=true`, omit blocker codes, or cite stale S10/S11 evidence as fresh proof. The S12 validator must reject malformed, missing, contradictory, or one-sided proof artifacts.
- **Replay / stale proof:** old S10 blocker/proof candidates or stale docs could be re-used as S12 success. S12 must require S12-specific Hermes, GSD-Pi, disposition, closeout, and regression artifacts with matching citations.
- **Privilege/boundary escalation:** attempts to bypass supported Paperclip extension boundaries via Paperclip core patches, private internal imports, direct DB mutation, native approval side effects, or BOS plugin subprocess execution would invalidate R011 and must fail validation.
- **Shell execution abuse:** closure wiring must execute bounded command arrays with shell disabled; shell-string execution or unbounded retries could become command injection or retry-storm risk.
- **Capability overclaim:** docs or `plugin-bos-light/capabilities.paperclip-runtime.json` could promote Hermes or GSD-Pi runtime execution based on diagnostics, auth-denied results, or local fixture readiness rather than live supported-boundary proof.

### Data exposure risks
- Runtime smoke diagnostics may contain tokens, secret references, auth headers, URLs, host details, logs, or model/provider configuration. S12 must reject plaintext secret-looking values and require redacted diagnostics before docs or evidence artifacts are accepted.
- Evidence artifacts and reports are durable repository files, so any leaked credential or PII would become persistent project state.

### Trust boundaries
- Untrusted or semi-trusted runtime responses enter JSON evidence, docs, capability matrices, and validators.
- Local scripts read/write `runtime-evidence/`, `.gsd/milestones/M002`, docs, and plugin capability JSON.
- Paperclip sandbox/API interaction must remain bounded to supported registry/testEnvironment/execute-style boundaries with exactly one intended invocation per surface and no direct DB/core/internal access.

### Required mitigation evidence before completion
- Unit tests for malformed JSON, secret-like diagnostics, one-sided proof, blocker promotion, missing approval, DB/core/private-import flags, shell-string closure execution, and stale/unsupported promotion.
- Final validators that fail closed unless both runtime surfaces provide passing supported-boundary proof or an explicitly approved rescope preserves no-promotion posture.

## Requirement Impact

## Q4 Requirement Coverage Findings

### Requirements touched
- **R009** — proof-gated runtime capability posture. S12 can either produce supported Hermes/GSD-Pi runtime proof or preserve an approved-rescope/no-promotion posture; docs and capability matrix must agree with the S12 disposition.
- **R010** — Hermes runtime execution proof expectations. S12 directly re-attempts Hermes runtime proof and must require bounded Paperclip-owned run/readback, `wakeCountDelta=1`, and passing `resultJson.bos` before any Hermes promotion.
- **R011** — stable Paperclip extension-boundary constraint. S12 must continue to prove no Paperclip core patch, no private Paperclip imports, no direct DB mutation, no plaintext credential logging, and no unsupported runtime or plugin subprocess workaround.

### Requirements not directly changed
- **R012-R015** are active M004 organization-boundary requirements. M002 context states S12/M002 must not reinterpret them; S13 is planned to reconcile coverage explicitly, including out-of-scope notes or validation evidence for R012-R015.

### Must be re-tested after S12 ships
- `python3 -m unittest scripts/test_validate_s12_runtime_proof_or_rescope.py`
- `python3 scripts/validate_s10_runtime_execution.py --evidence runtime-evidence/M002-S12-hermes-runtime-execution-proof.json --phase hermes`
- `python3 scripts/validate_s10_runtime_execution.py --evidence runtime-evidence/M002-S12-gsdpi-runtime-execution-proof.json --phase gsdpi`
- `python3 scripts/validate_s12_runtime_proof_or_rescope.py --artifact runtime-evidence/M002-S12-runtime-proof-or-rescope.json`
- `python3 -m unittest scripts/test_validate_s12_runtime_proof_or_rescope.py scripts/test_run_m002_regression_closure.py`
- `python3 scripts/validate_s12_runtime_proof_or_rescope.py --phase final --write-audit runtime-evidence/M002-S12-validation-closeout.json`
- `python3 scripts/run_m002_regression_closure.py --output runtime-evidence/M002-S06-regression-closure.json`

### Decisions to revisit or preserve
- **D008**: preserve native Paperclip adapters/agents for Hermes and standalone `gsdpi_local`; do not introduce a BOS plugin subprocess executor.
- **D009**: preserve Paperclip core read-only / stable external boundary policy.
- **D010**: only promote runtime capability surfaces with surface-specific live readback proof; S12 may supersede part of this only if proof exists.
- **D011**: if Hermes-via-Codex or another remediation path is used, proof must still be through supported Paperclip-owned runtime execution.
- **D014**: keep runtime posture conservative until live Paperclip proof exists; approved rescope must not become a hidden promotion.

## Proof Level

- This slice proves: Operational proof when supported runtime access succeeds; otherwise final-assembly rescope proof that preserves fail-closed validation posture. Runtime is attempted but not reinterpreted as success unless supported-boundary proof fields validate. Any rescope must cite an explicit approval source.

## Integration Closure

Consumes S10 runtime smoke runners and validators, S11 validation artifact repair posture, the capability matrix, runtime health docs, and M002 closeout runner. Introduces an S12 proof-or-rescope gate and runtime disposition artifact, then composes it into regression closure. S13 remains responsible only for broader requirement coverage reconciliation after S12 establishes the runtime execution posture.

## Verification

- Adds S12 runtime evidence and validation closeout artifacts with outcome, approval source, proof citations, blocker codes, redacted diagnostics, no-promotion booleans, and closure command evidence.

## Tasks

- [x] **T01: Add S12 disposition validator** `est:2h`
  ---
  estimated_steps: 7
  estimated_files: 3
  skills_used:
    - tdd
    - verify-before-complete
  ---
  Why: S12 needs an executable contract that decides proof versus approved rescope without weakening S10/S11 fail-closed posture.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s10_runtime_execution.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_m002_validation_artifacts.py`
  - Verify: python3 -m unittest scripts/test_validate_s12_runtime_proof_or_rescope.py

- [x] **T02: Attempt supported runtime proof and resolve disposition** `est:2h`
  ---
  estimated_steps: 6
  estimated_files: 3
  skills_used:
    - verify-before-complete
    - error-handling-patterns
  ---
  Why: S12 must make one bounded supported-boundary runtime attempt before selecting proof or rescope.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_s10_hermes_runtime_smoke.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_s10_gsdpi_runtime_smoke.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s10_runtime_execution.py`
  - Verify: python3 scripts/validate_s10_runtime_execution.py --evidence runtime-evidence/M002-S12-hermes-runtime-execution-proof.json --phase hermes && python3 scripts/validate_s10_runtime_execution.py --evidence runtime-evidence/M002-S12-gsdpi-runtime-execution-proof.json --phase gsdpi && python3 scripts/validate_s12_runtime_proof_or_rescope.py --artifact runtime-evidence/M002-S12-runtime-proof-or-rescope.json

- [x] **T03: Align docs matrix and closure gate** `est:2h`
  ---
  estimated_steps: 8
  estimated_files: 9
  skills_used:
    - write-docs
    - verify-before-complete
  ---
  Why: Raw evidence is insufficient unless docs, matrix, assessment, and closure all agree on the S12 outcome.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/.gsd/milestones/M002/M002-CONTEXT.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/.gsd/milestones/M002/M002-ASSESSMENT.md`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_m002_regression_closure.py`, `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_run_m002_regression_closure.py`
  - Verify: python3 -m unittest scripts/test_validate_s12_runtime_proof_or_rescope.py scripts/test_run_m002_regression_closure.py && python3 scripts/validate_s12_runtime_proof_or_rescope.py --phase final --write-audit runtime-evidence/M002-S12-validation-closeout.json

- [x] **T04: Refresh final regression evidence** `est:45m`
  ---
  estimated_steps: 4
  estimated_files: 1
  skills_used:
    - verify-before-complete
  ---
  Why: The slice closes only when S12 composes with existing S04, S05, S10, S11, M002 closeout, unit-test, and typecheck gates in the real regression runner.
  - Files: `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S06-regression-closure.json`
  - Verify: python3 scripts/run_m002_regression_closure.py --output runtime-evidence/M002-S06-regression-closure.json

## Files Likely Touched

- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s10_runtime_execution.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_m002_validation_artifacts.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_s10_hermes_runtime_smoke.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_s10_gsdpi_runtime_smoke.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/.gsd/milestones/M002/M002-CONTEXT.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/.gsd/milestones/M002/M002-ASSESSMENT.md
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_m002_regression_closure.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_run_m002_regression_closure.py
- /home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S06-regression-closure.json
