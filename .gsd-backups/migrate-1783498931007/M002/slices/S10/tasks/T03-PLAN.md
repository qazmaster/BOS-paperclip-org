---
estimated_steps: 5
estimated_files: 3
skills_used: []
---

# T03: Record GSD-Pi adapter execution evidence

skills_used: tdd, verify-before-complete, observability, security-review

Why: S03 left `gsdpi_local` blocked at Paperclip registration, but this worktree now contains a local `adapters/gsdpi-local` implementation and tests. S10 needs to distinguish local adapter contract readiness from live Paperclip registration/execution proof, and must still fail closed if Paperclip returns `Unknown adapter type: gsdpi_local`.

Do: Add `scripts/run_s10_gsdpi_runtime_smoke.py`. The runner should first record local package readiness by invoking the checked-in package contract through safe subprocess command arrays, then use only supported Paperclip HTTP/admin/adapter routes to discover registry status, run `testEnvironment` if supported, and attempt one bounded execute only if registration/readback succeeds. Write `runtime-evidence/M002-S10-gsdpi-runtime-execution-proof.json` with local package build/test status, registry readback, testEnvironment result, execute result, parsed `BosAdapterResult`, timeout/error diagnostics, and no-core/no-private/no-direct-DB/no-plaintext-secret flags. If live registration is missing or the API rejects `gsdpi_local`, preserve that as a blocker rather than treating the local package test as runtime proof.

Negative tests and boundaries: keep or extend the adapter tests only if the runner exposes a contract gap; never infer live support from package name alone. Local package tests should continue to prove timeout handling, parse failures, and secret-value redaction.

Done when local adapter tests pass and the GSD-Pi artifact validates in phase `gsdpi`; it may be passing proof or explicit fail-closed evidence.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_s03_gsdpi_smoke.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s03_gsdpi_smoke.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s10_runtime_execution.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S03-gsdpi-registration.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S03-gsdpi-smoke.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/adapters/gsdpi-local/package.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/adapters/gsdpi-local/tsconfig.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/adapters/gsdpi-local/src/index.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/adapters/gsdpi-local/src/server/execute.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/adapters/gsdpi-local/tests/execute.test.ts`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_s10_gsdpi_runtime_smoke.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S10-gsdpi-runtime-execution-proof.json`

## Verification

python3 scripts/run_s10_gsdpi_runtime_smoke.py --output runtime-evidence/M002-S10-gsdpi-runtime-execution-proof.json && npm --prefix adapters/gsdpi-local test && python3 scripts/validate_s10_runtime_execution.py --evidence runtime-evidence/M002-S10-gsdpi-runtime-execution-proof.json --phase gsdpi

## Observability Impact

Adds a redacted GSD-Pi evidence artifact separating local adapter contract status from live Paperclip registration, testEnvironment, execute, and BosAdapterResult proof.
