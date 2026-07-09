---
estimated_steps: 10
estimated_files: 4
skills_used: []
---

# T02: Add live readback runner and validator

Executor skills_used frontmatter: tdd, error-handling-patterns, verify-before-complete.

Why: S04 must attempt whatever live Paperclip access is actually available, but autonomous execution cannot ask for credentials. The runner therefore must be safe to run with or without env vars and must always produce sanitized evidence that distinguishes live proof from fail-closed blocker evidence.

Do:
1. Add `scripts/run_m003_s04_live_decision_artifact_readback.py` as a standard-library-only runner modeled on `scripts/run_s04_live_artifact_flow.py`, but scoped to one M003 decision artifact rather than the broader M002 artifact-family flow.
2. The runner must read optional environment or CLI inputs for base URL, company id, issue id, auth token env name, auth header name, trusted origin, timeout, and output path. It must not require secrets to be present; missing base URL, company id, or token must produce `artifact_type=fail-closed-blocker` before any mutating request.
3. When access exists, create or select one bounded sandbox issue, write a sanitized Div7.MissionControl decision artifact markdown to a supported document or comment surface, read back the selected native artifact, compute sha256 and bounded snippet, and write `runtime-evidence/M003-S04-live-decision-artifact-readback.json` with selected surface, artifact refs, diagnostics, runtime version/build when reachable, and side-effect counters.
4. The runner must record deterministic markdown fallback metadata when native write or readback is unavailable, but fallback metadata must not be treated as live proof or native approval state.
5. Add `scripts/validate_m003_s04_live_decision_artifact_readback.py` that accepts two final outcomes: `live-evidence` with at least one successful decision artifact document or comment readback, or `fail-closed-blocker` with blocker reason, diagnostics, redacted inputs, zero unsupported side effects, and deterministic markdown fallback/ref context.
6. Add Python unit tests covering live success fixtures, missing credential preflight, denied or 404 document/comment access, malformed JSON, readback mismatch, secret redaction, zero native approvals/activity/Hermes/GSD-Pi/plugin actions, and validator rejection of unsupported capability promotion.

Done when: the runner and validator are test-covered and a future executor can run the live attempt once without knowing whether Paperclip credentials exist.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/scripts/run_s04_live_artifact_flow.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/scripts/validate_s04_live_artifact_flow.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/scripts/test_run_s04_live_artifact_flow.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/scripts/test_validate_s04_live_artifact_flow.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/decisionArtifact.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/plugin-bos-light/src/majorFlowDecision.ts`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/scripts/run_m003_s04_live_decision_artifact_readback.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/scripts/validate_m003_s04_live_decision_artifact_readback.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/scripts/test_run_m003_s04_live_decision_artifact_readback.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M003/scripts/test_validate_m003_s04_live_decision_artifact_readback.py`

## Verification

python3 -m unittest scripts/test_run_m003_s04_live_decision_artifact_readback.py scripts/test_validate_m003_s04_live_decision_artifact_readback.py

## Observability Impact

Creates the canonical S04 evidence schema and validator. Failure states become inspectable by blocker reason, phase diagnostics, side-effect counters, sanitized runtime response snippets, and readback hashes.
