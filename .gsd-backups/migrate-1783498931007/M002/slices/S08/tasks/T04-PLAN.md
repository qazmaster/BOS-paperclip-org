---
estimated_steps: 1
estimated_files: 4
skills_used: []
---

# T04: Approved runtime execution smoke

Execute only if T03 proves supported registry and testEnvironment readiness. Run one bounded Paperclip adapter smoke through the selected path and require structured BOS result evidence: Hermes `resultJson.bos`, GSD-Pi `BosAdapterResult`, or an explicitly specified `codex_local` BOS result schema. Capture run id, status, duration, side effects, redacted logs, no duplicate wake behavior when applicable, and conservative capability matrix updates. If the smoke fails, fail closed with diagnostics.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-adapter-registration-evidence.json`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-runtime-execution-smoke.json`

## Verification

python3 -m json.tool runtime-evidence/M002-S08-runtime-execution-smoke.json >/dev/null && python3 scripts/validate_m002_closeout.py --phase final

## Observability Impact

Records smoke execution status, structured result shape, run id, no duplicate wake evidence where relevant, redacted diagnostics, and exact capability promotions or no-go blockers.
