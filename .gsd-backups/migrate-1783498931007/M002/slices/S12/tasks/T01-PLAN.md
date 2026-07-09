---
estimated_steps: 11
estimated_files: 2
skills_used: []
---

# T01: Add S12 disposition validator

---
estimated_steps: 7
estimated_files: 3
skills_used:
  - tdd
  - verify-before-complete
---
Why: S12 needs an executable contract that decides proof versus approved rescope without weakening S10/S11 fail-closed posture.

Do: Add a standard-library-only S12 resolver and validator. The resolver reads S12 Hermes and GSD-Pi smoke artifacts plus S10/S11 posture and writes `runtime-evidence/M002-S12-runtime-proof-or-rescope.json`. The validator accepts `runtime_proof` only when both surfaces validate as passing supported-boundary proof, or `approved_rescope` only when proof is blocked and the disposition records explicit approval source, narrowed or deferred success criteria, blocker citations, and no capability promotions. Unit tests must use temp fixtures rather than live `.gsd/` paths.

Q3: reject plaintext secret-looking values, private imports, core patch flags, direct DB mutation flags, shell-string execution, and unsupported promotions. Q4: owns R009, R010, R011. Q5: missing or malformed artifacts remain blockers; missing rescope approval fails validation. Q7: test malformed JSON, secret-like diagnostics, one-sided proof, blocker-promotion, rescope without approval, DB/core/private-import flags, and docs or matrix confirmation without proof.

Done when unit tests accept proof and approved-rescope fixtures and reject overclaims.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_s10_hermes_runtime_smoke.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_s10_gsdpi_runtime_smoke.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s10_runtime_execution.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_m002_validation_artifacts.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S10-hermes-runtime-execution-proof.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S10-gsdpi-runtime-execution-proof.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S10-requirement-scope-resolution.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S11-validation-artifact-repair.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/build_s12_runtime_proof_or_rescope.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s12_runtime_proof_or_rescope.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_s12_runtime_proof_or_rescope.py`

## Verification

python3 -m unittest scripts/test_validate_s12_runtime_proof_or_rescope.py

## Observability Impact

Defines S12 audit schema with outcome, proof citations, blocker codes, approval source, no-promotion booleans, redacted diagnostics, and validation error counts.
