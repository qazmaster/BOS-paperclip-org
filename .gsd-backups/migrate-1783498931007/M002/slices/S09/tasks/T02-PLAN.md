---
estimated_steps: 15
estimated_files: 1
skills_used: []
---

# T02: Add S09 reconciliation validator

Expected executor skills: tdd, verify-before-complete.

Why: Existing closeout validators currently pass even while S08 canonical artifacts are missing and docs do not localize the S08 Hermes plus Codex fail-closed smoke. S09 needs an executable assertion that encodes the reconciliation contract so future docs or artifacts cannot drift silently.

Do:
1. Create `scripts/validate_s09_reconciliation.py` using Python standard library only.
2. Validate required S08 artifact presence and non-empty content at `.gsd/milestones/M002/slices/S08/S08-SUMMARY.md`, `.gsd/milestones/M002/slices/S08/S08-ASSESSMENT.md`, and `.gsd/milestones/M002/slices/S08/S08-UAT.md`.
3. Validate S08 runtime evidence and artifact/doc text using conservative markers rather than brittle exact phrasing: `hermes_local_with_codex_cli_backend`, `adapter_failed`, `wakeCountDelta`/no-duplicate-wake, no passing `resultJson.bos`, `ready_with_warning` or equivalent readiness warning, and no capability promotion.
4. Validate `PAPERCLIP_LIVE_VALIDATION_REPORT.md` and `docs/08_RUNTIME_CAPABILITY_HEALTH.md` mention the S08 outcome and do not leave the milestone story only at the old S02 secret-materialization blocker.
5. Validate `plugin-bos-light/capabilities.paperclip-runtime.json` remains conservative for Hermes/GSD-Pi execution; do not require or implement any promotion.
6. Provide clear failure messages naming the missing path or missing marker.
7. Add a `--write-audit runtime-evidence/M002-S09-reconciliation-audit.json` option that writes a redacted JSON summary of checked files, doc markers, capability posture, and validator result.

Done when: the script compiles and is ready to be used after docs are updated in T03.

Threat Surface (Q3): reads local artifacts only; no network, secrets, or runtime mutation. Avoid printing any secret-like values if future evidence contains them.
Requirement Impact (Q4): protects R011, R009, and R010 by making boundary and no-promotion assertions executable.
Failure Modes (Q5): missing files should produce actionable non-zero failures; malformed JSON should identify the file; ambiguous evidence should fail closed.
Negative Tests (Q7): script should fail if S08 artifacts are missing, docs lack S08 markers, runtime evidence lacks `adapter_failed`, or the capability matrix implies runtime execution support.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S09-s08-artifact-reconstruction.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-provider-adapter-feasibility.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-execution-path-decision-packet.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-adapter-registration-evidence.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-hermes-cli-environment-remediation.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-runtime-execution-smoke.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s09_reconciliation.py`

## Verification

python3 -m py_compile scripts/validate_s09_reconciliation.py

## Observability Impact

Adds a deterministic diagnostics entrypoint with path-specific failures and an optional redacted audit artifact.
