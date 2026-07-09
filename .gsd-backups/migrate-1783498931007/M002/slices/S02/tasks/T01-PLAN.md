---
estimated_steps: 11
estimated_files: 3
skills_used: []
---

# T01: Add Hermes smoke evidence harness

---
estimated_steps: 8
estimated_files: 3
skills_used:
  - tdd
  - error-handling-patterns
  - observability
---
Why: S02 needs executable proof rules before live sandbox mutation so a registered adapter or fixture success cannot be mistaken for Hermes runtime support. The harness should make the evidence contract explicit, redact secrets, and validate both success and fail-closed blocker records.

Do: Add a repository-local Python smoke runner and validator for S02. The runner should support at least an environment phase and an agent-smoke phase, accept explicit base URL/company/agent/run options without persisting secrets, call only Paperclip public/admin HTTP surfaces or browser-authenticated endpoints documented by S01, and write bounded JSON under runtime-evidence/. The validator should be standard-library-only, read one evidence JSON file plus the expected docs/matrix paths, enforce the S02 contract, and include fixture tests for success and negative cases. Do not read .gsd/, .planning/, .audits/, gitignored secrets, or Paperclip core internals. Include redaction checks for token/password/API-key-like fields and distinguish fail-closed blocker artifacts from passing smoke evidence.

Done-when: Unit tests prove the validator rejects missing resultJson.bos, wrong adapterType, duplicate wake, created approvals, missing version/build/readback proof for promoted capabilities, and unredacted secret-like strings; the runner/validator paths are ready for the live tasks to use.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/probe_paperclip_runtime.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_probe_paperclip_runtime.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_runtime_capabilities.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_s02_hermes_smoke.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s02_hermes_smoke.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_s02_hermes_smoke.py`

## Verification

python3 -m unittest scripts/test_validate_s02_hermes_smoke.py

## Observability Impact

Creates the machine-readable evidence contract and negative-test diagnostics that future agents use to identify which S02 phase failed without inspecting private runtime state.
