---
estimated_steps: 7
estimated_files: 11
skills_used: []
---

# T04: Run final closure verification

Task plan metadata: estimated_steps: 5; estimated_files: 0; skills_used: [verify-before-complete].

Why: S06 closes the milestone baseline and must prove that the new demo did not regress existing validators, plugin tests, TypeScript contracts, or runtime capability guardrails.

Do: Run the full closure command set from a clean worktree context. Inspect any failure before claiming completion. Do not modify files unless a verification failure identifies a concrete bug; if that happens, fix the relevant earlier task output and rerun this task. Record fresh command evidence in the task summary when completing.

Failure Modes Q5: A validator/test/typecheck failure blocks S06 completion. A demo runner phase failure must identify the failing A-step and command label. Runtime capability validation failure means docs/source/matrix drift must be repaired without promoting unproven live support.

Load Profile Q6: Closure runs local tests and validators only; there are no network calls or long-running services. If local npm dependencies are missing, install or restore them only through the project package workflow before rerunning verification.

Negative Tests Q7: Closure includes existing negative unit tests for company-template validation, runtime capability validation, plugin acceptance paths, Eval Gate, Circuit Breaker, and the new demo runner/doc validators.

Done when: All listed commands exit 0 with fresh evidence and no live Paperclip runtime capability is promoted without version/build proof.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/run_a1_a10_demo.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/test_run_a1_a10_demo.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/validate_a1_a10_demo_docs.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/validate_company_template.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/test_validate_company_template.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/validate_runtime_capabilities.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/test_validate_runtime_capabilities.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/10_A1_A10_DEMO.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/integratedDemo.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/integratedDemo.test.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/package.json`

## Expected Output

- Update the implementation and proof artifacts needed for this task.

## Verification

python3 scripts/run_a1_a10_demo.py && python3 scripts/test_validate_company_template.py && npm --prefix plugin-bos-light test && npm --prefix plugin-bos-light run typecheck && python3 scripts/test_validate_runtime_capabilities.py && python3 scripts/validate_runtime_capabilities.py && python3 scripts/validate_a1_a10_demo_docs.py

## Observability Impact

Produces fresh verification evidence for the whole integrated baseline and confirms the demo command surfaces phase-level diagnostics on failure.
