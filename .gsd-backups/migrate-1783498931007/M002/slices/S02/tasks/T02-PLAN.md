---
estimated_steps: 13
estimated_files: 2
skills_used: []
---

# T02: Gate Hermes runtime environment

---
estimated_steps: 7
estimated_files: 2
skills_used:
  - agent-browser
  - observability
  - error-handling-patterns
---
Why: S01 proved hermes_local is registered but blocked by hermes_cli_not_found; agent smoke is invalid until the live Paperclip container passes adapter environment validation.

Do: Using only supported sandbox/container administration and Paperclip adapter/testEnvironment APIs, install or expose the Hermes CLI and authentication needed by hermes_local without committing secrets. Rerun POST /api/companies/{companyId}/adapters/hermes_local/test-environment through the authenticated sandbox boundary. Capture redacted runtime fingerprint, version/build if visible, adapter registry/readback, testEnvironment request metadata, and pass/fail diagnostics in runtime-evidence/M002-S02-hermes-environment.json. If auth or CLI cannot be provisioned autonomously, write a fail-closed blocker artifact with phase=environment, blocker=hermes_cli_or_auth_unavailable, and do not mark this task complete.

Failure Modes (Q5): If the Paperclip API returns 401/403, preserve only status and endpoint class, record auth_required, and stop. If the adapter test times out, record timeout_ms and phase without retry storms. If the response is malformed or lacks adapter status, record malformed_response and keep the evidence non-passing.

Load Profile (Q6): One adapter testEnvironment call plus lightweight readback; avoid polling loops and cap any retries to a small fixed count in the runner.

Done-when: The evidence validator accepts the environment artifact as passing and the artifact proves hermes_local testEnvironment no longer reports hermes_cli_not_found.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/run_s02_hermes_smoke.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_s02_hermes_smoke.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S02-hermes-environment.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/11_HERMES_BOS_AGENTS_SMOKE.md`

## Verification

python3 scripts/validate_s02_hermes_smoke.py --phase environment --evidence runtime-evidence/M002-S02-hermes-environment.json

## Observability Impact

Records the first durable redacted phase artifact for Hermes runtime readiness, including blocker category, endpoint class, timestamps, adapter status, and version/build fields when available.
