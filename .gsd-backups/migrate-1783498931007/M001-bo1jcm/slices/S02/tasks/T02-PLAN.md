---
estimated_steps: 5
estimated_files: 2
skills_used: []
---

# T02: Add no-runtime-safe Paperclip probe command

Expected executor skills for task-plan frontmatter: error-handling-patterns, observability, verify-before-complete.

Why: S02 must be able to collect runtime evidence when a Paperclip checkout/runtime is available, but it must also behave honestly in the current no-runtime environment. The probe should make absence of runtime an explicit health result, not a blocker that tempts simulated success.

Do: Add `scripts/probe_paperclip_runtime.py` as a Python standard-library command with a no-runtime mode and an optional `--paperclip-dir` input. In no-runtime mode it should validate the local S01 company template contract, report runtime/import/export/AGENTS/plugin surfaces as unvalidated or fallback-only, and exit 0 only because the posture was recorded honestly. With a Paperclip directory, it should inspect only documented/local metadata and known import/export/plugin spec locations if present; it must never shell-interpolate the provided path or log environment secrets. Update `scripts/import-company-template.sh` so it points users to the probe/current validation path instead of claiming a real import, while preserving the draft warning until C4/C5 are proven. Add `scripts/test_probe_paperclip_runtime.py` with temporary-directory tests for no-runtime behavior, missing Paperclip path, malformed metadata, and redaction of env-like values.

Done when: the probe test passes, no-runtime execution gives an explicit unvalidated report, and the import helper no longer looks like a successful Paperclip import wrapper.

Failure Modes (Q5): missing runtime path becomes an unvalidated capability result; malformed metadata is reported as malformed evidence; timeouts are not relevant because no external process should be spawned in this slice. Load Profile (Q6): trivial local filesystem scanning; avoid recursive repository-wide scans. Negative Tests (Q7): missing path, empty path, path with no spec files, malformed JSON/spec metadata, and secret-like values in metadata.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/capabilities.paperclip-runtime.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/validate_runtime_capabilities.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/validate_company_template.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/import-company-template.sh`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/company-template/bos-company-template.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/company-template/import-notes.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/state-spike-checklist.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/event-spike-checklist.md`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/probe_paperclip_runtime.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/test_probe_paperclip_runtime.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/import-company-template.sh`

## Verification

python3 scripts/test_probe_paperclip_runtime.py

## Observability Impact

Adds a repeatable probe output path for runtime availability, version/build, import/export status, malformed evidence, and fallback posture while preserving redaction boundaries.
