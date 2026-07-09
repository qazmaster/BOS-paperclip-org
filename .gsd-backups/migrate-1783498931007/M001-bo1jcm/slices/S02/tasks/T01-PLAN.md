---
estimated_steps: 5
estimated_files: 5
skills_used: []
---

# T01: Define capability matrix and validation guardrails

Expected executor skills for task-plan frontmatter: api-design, write-docs, verify-before-complete.

Why: S02 needs a durable contract that prevents later slices from relying on Paperclip surfaces that are only assumed by the draft manifest, worker, and adapter. The matrix is the source of truth for runtime capability health, and the validator is the guardrail that stops unsupported surfaces from being represented as working.

Do: Create `plugin-bos-light/capabilities.paperclip-runtime.json` with entries for C4/C5/C6/C7 and every manifest-requested or adapter-assumed surface: import/export, AGENTS.md syntax, plugin runtime version/build, tools/data/actions registration, native issues/documents/comments, native approval/request creation, config, issue-scoped state, company-scoped state, entities, activity logging, issue events, terminal run events, dashboard widgets, and issue detail tabs. Each entry must include a stable key, status enum, Paperclip surface name, requirement IDs, downstream consumers, evidence source, proof command or runtime evidence field, fallback path, blocker text when applicable, and notes. Default any unproven runtime behavior to `unvalidated`, `unsupported`, or `fallback-only`; do not mark a surface confirmed without real evidence fields. Add `scripts/validate_runtime_capabilities.py` using only the Python standard library to validate the matrix against `plugin-bos-light/manifest.paperclip-plugin.json` and the adapter/worker assumptions. Add `scripts/test_validate_runtime_capabilities.py` with fixture-based negative tests for missing manifest coverage, unsupported status without fallback/blocker, and confirmed status without proof evidence.

Done when: the validator and tests pass locally, every draft manifest capability is mapped, and the matrix names the fallback or blocker for all non-confirmed surfaces.

Failure Modes (Q5): if JSON is malformed, the validator must fail with the path and capability key; if manifest fields drift, the validator must identify the missing capability mapping; if evidence is absent, the status must remain unvalidated rather than failing into support. Load Profile (Q6): trivial local file reads only. Negative Tests (Q7): malformed JSON, missing capability key, unsupported status without fallback, confirmed status without runtime evidence, and manifest capability not represented in the matrix.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/manifest.paperclip-plugin.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/worker.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/paperclipAdapter.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/src/persistence.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/05_PERSISTENCE_MATRIX.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/07_RISKS_AND_SPIKES.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/company-template/a1-validation-evidence.md`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/capabilities.paperclip-runtime.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/validate_runtime_capabilities.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/test_validate_runtime_capabilities.py`

## Verification

python3 scripts/test_validate_runtime_capabilities.py

## Observability Impact

Adds machine-checkable health status fields and validation errors that future agents can use to localize overclaimed runtime assumptions before executing downstream slices.
