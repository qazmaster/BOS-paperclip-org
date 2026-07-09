---
estimated_steps: 5
estimated_files: 3
skills_used: []
---

# T04: Run full S03 verification closure

Expected executor skills (record in task plan frontmatter if supported): test, verify-before-complete.

Why: The slice should close with executable proof that the new artifact flow composes with existing tests and S02 guardrails, not just isolated unit checks.

Do: Run and, if needed, minimally adjust test coverage so the full plugin test suite and typecheck pass with the new modules. Keep final verification repository-local and honest: no live runtime claim, no `.gsd` reads from tests, and no capability promotion to `confirmed`. If dependencies are absent, install project dependencies in `plugin-bos-light` before running these commands, but do not treat `node_modules` as a deliverable.

Failure Modes (Q5): Missing dev dependencies block local proof but do not imply runtime support failure; TypeScript drift in exported contracts blocks downstream S04 consumption. Load Profile (Q6): tests remain fixture-local and must not spawn external Paperclip processes. Negative Tests (Q7): ensure negative cases from T01/T02 remain in the suite.

Done when: Full Vitest suite, TypeScript typecheck, and runtime capability validator pass; failure output, if any, points to code/tests/docs rather than missing runtime support.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/package.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tsconfig.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/validate_runtime_capabilities.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/blueprintArtifact.test.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/acceptance.test.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/blueprintArtifact.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/issueBlueprintFlow.ts`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/tests/acceptance.test.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/worker.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/08_RUNTIME_CAPABILITY_HEALTH.md`

## Verification

cd plugin-bos-light && npm test && npm run typecheck && cd .. && python3 scripts/validate_runtime_capabilities.py

## Observability Impact

Confirms the slice-level inspection signals are present in returned artifact metadata and that S02 validator still catches overclaimed native support.
