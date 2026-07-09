---
estimated_steps: 5
estimated_files: 2
skills_used: []
---

# T01: Create S10 proof validator

skills_used: tdd, verify-before-complete, security-review

Why: S10 must not rely on prose to decide whether runtime execution is proven or merely blocked. The first increment is a fail-closed validator and fixture suite that defines the exact evidence contract before live or simulated smoke runners are trusted.

Do: Add `scripts/validate_s10_runtime_execution.py` as a standard-library-only validator with phases `hermes`, `gsdpi`, and `final`. The Hermes phase must accept a redacted blocker artifact as diagnostic evidence but require all of these for proof: selected path `hermes_local_with_codex_cli_backend`, Paperclip-owned lifecycle/readback fields, adapter type `hermes_local`, `wakeCountDelta=1`, no created approvals unless explicitly declared safe, status succeeded, and `resultJson.bos`. The GSD-Pi phase must accept blocker evidence but require adapter type `gsdpi_local`, supported registry/readback, `testEnvironment` pass, execute status succeeded, and parseable `resultJson.bosAdapterResult` or equivalent `BosAdapterResult`. All phases must reject plaintext secret values, direct DB mutation, Paperclip core patch flags, private internal imports, malformed timestamps, and capability promotion without matching proof. The final phase must cross-check docs and `plugin-bos-light/capabilities.paperclip-runtime.json` so Hermes/GSD-Pi execution rows are confirmed only when their S10 proof artifacts pass; fail-closed rows must remain unvalidated, fallback-only, or unsupported with explicit S10 evidence paths.

Negative tests: add `scripts/test_validate_s10_runtime_execution.py` using `unittest` fixtures for passing proof, fail-closed blocker, duplicate wake, missing `resultJson.bos`, missing `BosAdapterResult`, unredacted token strings, direct DB/core/private flags, and matrix promotion drift.

Done when the validator gives path-specific actionable errors and the test suite proves both proof and fail-closed branches.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s09_reconciliation.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_s09_reconciliation.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s02_hermes_smoke.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s03_gsdpi_smoke.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-runtime-execution-smoke.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S03-gsdpi-smoke.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s10_runtime_execution.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_s10_runtime_execution.py`

## Verification

python3 scripts/test_validate_s10_runtime_execution.py

## Observability Impact

Defines the machine-readable health signal for S10: validator errors name the exact missing proof, blocker, redaction, or promotion-drift path.
