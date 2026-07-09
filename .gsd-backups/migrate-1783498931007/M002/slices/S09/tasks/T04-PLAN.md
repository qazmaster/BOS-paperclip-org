---
estimated_steps: 15
estimated_files: 5
skills_used: []
---

# T04: Run final closeout reconciliation and persist S09 audit evidence

Expected executor skills: verify-before-complete.

Why: S09 is complete only when local validators, reconciliation assertions, regression closure, and filesystem artifacts all agree. This task writes the durable S09 audit artifact and refreshes regression closure evidence after the doc updates.

Do:
1. Run `python3 scripts/validate_s09_reconciliation.py --write-audit runtime-evidence/M002-S09-reconciliation-audit.json` and inspect any failures before proceeding.
2. Run the existing M002 final closeout validator and runtime capability validator.
3. Refresh regression closure evidence with `python3 scripts/run_m002_regression_closure.py --output runtime-evidence/M002-S06-regression-closure.json` because the live validation report and runtime health docs changed.
4. Validate the S09 audit JSON with `python3 -m json.tool`.
5. Use `gsd_milestone_status` after command verification to confirm S08 remains complete, S09 is the active planned slice, and no completed slices were structurally modified in the DB.
6. Record in the task summary that no Paperclip core patch, private import, direct DB mutation, plaintext secret, duplicate runtime run, or capability promotion occurred.

Done when: all final commands pass, the audit JSON is present and valid, and the slice has a clear handoff to S10.

Threat Surface (Q3): validation commands read local docs/evidence only and must not contact Paperclip or materialize secrets.
Requirement Impact (Q4): final re-verification for R011, R009, and R010.
Failure Modes (Q5): if any validator fails, fix the underlying doc/artifact/evidence drift instead of suppressing the check; if regression closure changes unexpectedly, document the diff in the audit and task summary.
Load Profile (Q6): trivial local file validation; no shared runtime resources or network calls.
Negative Tests (Q7): command suite must fail on missing audit JSON, malformed JSON, stale docs, over-promoted capability matrix, or closeout validator regressions.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S09-s08-artifact-reconstruction.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s09_reconciliation.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_m002_closeout.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_runtime_capabilities.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_m002_regression_closure.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-provider-adapter-feasibility.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-execution-path-decision-packet.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-adapter-registration-evidence.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-hermes-cli-environment-remediation.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-runtime-execution-smoke.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S09-reconciliation-audit.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S06-regression-closure.json`

## Verification

python3 scripts/validate_s09_reconciliation.py --write-audit runtime-evidence/M002-S09-reconciliation-audit.json && python3 scripts/validate_m002_closeout.py --phase final && python3 scripts/validate_runtime_capabilities.py && python3 scripts/run_m002_regression_closure.py --output runtime-evidence/M002-S06-regression-closure.json && python3 -m json.tool runtime-evidence/M002-S09-reconciliation-audit.json

## Observability Impact

Persists a compact machine-readable audit artifact and refreshed regression closure evidence for milestone validation and S10 handoff.
