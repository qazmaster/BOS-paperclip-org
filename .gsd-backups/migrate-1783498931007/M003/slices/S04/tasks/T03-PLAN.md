---
estimated_steps: 9
estimated_files: 1
skills_used: []
---

# T03: Run live attempt and capture evidence

Executor skills_used frontmatter: verify-before-complete.

Why: The slice sketch requires an actual supported live readback attempt when access exists, or explicit fail-closed blocker evidence when it does not. This task executes the runner from T02 exactly once in the current environment and validates the resulting artifact.

Do:
1. Run the M003 S04 live decision artifact readback runner with default safe environment handling and output `runtime-evidence/M003-S04-live-decision-artifact-readback.json`.
2. Do not ask the user for credentials and do not print, echo, or persist secret values. If required environment values are absent, let the runner write a preflight blocker artifact.
3. If Paperclip access is present, allow only bounded issue/document/comment operations for a decision artifact; do not invoke plugin registration, actions, tools, native approval APIs, Hermes, GSD-Pi, activity logs, events, direct DB access, or Paperclip core patches.
4. Validate the produced evidence with the new validator in final mode.
5. Inspect the artifact type and blocker/readback summary for documentation input to T04.

Done when: `runtime-evidence/M003-S04-live-decision-artifact-readback.json` exists and validates as either live evidence or fail-closed blocker evidence with redacted diagnostics and zero unsupported side effects.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/scripts/run_m003_s04_live_decision_artifact_readback.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/scripts/validate_m003_s04_live_decision_artifact_readback.py`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/runtime-evidence/M003-S04-live-decision-artifact-readback.json`

## Verification

python3 scripts/run_m003_s04_live_decision_artifact_readback.py --output runtime-evidence/M003-S04-live-decision-artifact-readback.json
python3 scripts/validate_m003_s04_live_decision_artifact_readback.py --evidence runtime-evidence/M003-S04-live-decision-artifact-readback.json --phase final

## Observability Impact

Persists the operator-facing evidence artifact with readback hashes or blocker diagnostics, sanitized inputs, runtime version/build if reachable, and explicit unsupported side-effect counters.
