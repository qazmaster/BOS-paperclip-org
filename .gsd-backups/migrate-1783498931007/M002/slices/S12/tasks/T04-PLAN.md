---
estimated_steps: 10
estimated_files: 1
skills_used: []
---

# T04: Refresh final regression evidence

---
estimated_steps: 4
estimated_files: 1
skills_used:
  - verify-before-complete
---
Why: The slice closes only when S12 composes with existing S04, S05, S10, S11, M002 closeout, unit-test, and typecheck gates in the real regression runner.

Do: Run the updated closure runner and write `runtime-evidence/M002-S06-regression-closure.json`. Confirm overall pass, S12 appears after S11 and before `m002-closeout-validator`, and no leaked secret redaction labels. Do not claim runtime proof unless the S12 disposition says `runtime_proof`; if it says `approved_rescope`, state runtime remains unproved and deferred or narrowed by the approval artifact.

Q4: re-verifies R009, R010, R011. Q5: any child failure, timeout, missing S12 audit, stale docs, unsupported promotion, or typecheck failure leaves S12 incomplete. Q6: bounded local command set with shell disabled. Q7: T03 tests cover omission and order; this task exercises the real command plan.

Done when refreshed closure evidence records passing S12 gate and overall pass.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_m002_regression_closure.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s12_runtime_proof_or_rescope.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S12-validation-closeout.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S12-runtime-proof-or-rescope.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S06-regression-closure.json`

## Verification

python3 scripts/run_m002_regression_closure.py --output runtime-evidence/M002-S06-regression-closure.json

## Observability Impact

Refreshes aggregate regression closure artifact with command-level S12 verdict, order, timing, redacted digests, and overall status.
