---
estimated_steps: 5
estimated_files: 4
skills_used: []
---

# T04: Publish capability health report and downstream closure docs

Expected executor skills for task-plan frontmatter: write-docs, verify-before-complete.

Why: Later slices need a reader-facing S02 artifact that says exactly which runtime surfaces are confirmed, unsupported, fallback-only, or still unvalidated. The report must preserve the S01 proof boundary and explicitly describe how S03-S05 should proceed without violating Paperclip-as-system-of-record.

Do: Write `docs/08_RUNTIME_CAPABILITY_HEALTH.md` as the durable health report. It must include: runtime version/build evidence or an explicit no-runtime statement; C4/C5/C6/C7 status; import/export and AGENTS.md compatibility posture; per-surface matrix summary; adapter contract rules; native artifact-first persistence policy; plugin-state cache/overlay limits; polling/activity fallback for missing events; approval/request ownership by Paperclip; known blockers; and downstream guidance for S03, S04, S05, and S06. Update `company-template/import-notes.md` and `company-template/a1-validation-evidence.md` to point from S01 local proof to the new S02 health report without weakening D002. Update `docs/05_PERSISTENCE_MATRIX.md` and `docs/07_RISKS_AND_SPIKES.md` if needed so they agree with the matrix and no-runtime probe. Run the full repository-local verification command set.

Done when: the health report is non-empty, validators pass, S01 company-template proof still passes, and the report makes unsupported/unvalidated runtime surfaces explicit instead of presenting them as working.

Failure Modes (Q5): if live runtime evidence is absent, the report must say so; if runtime evidence is partial, unsupported surfaces must remain fallback-only or blockers; malformed matrix/report cross-references must fail validation. Load Profile (Q6): local docs and validator checks only. Negative Tests (Q7): validation must fail if report omits required sections, claims confirmed support without evidence, drops fallback posture for state/events, or breaks S01 local import-readiness.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/capabilities.paperclip-runtime.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/validate_runtime_capabilities.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/probe_paperclip_runtime.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/import-company-template.sh`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/state-spike-checklist.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/event-spike-checklist.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/company-template/import-notes.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/company-template/a1-validation-evidence.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/05_PERSISTENCE_MATRIX.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/07_RISKS_AND_SPIKES.md`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/company-template/import-notes.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/company-template/a1-validation-evidence.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/05_PERSISTENCE_MATRIX.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/07_RISKS_AND_SPIKES.md`

## Verification

python3 scripts/test_validate_runtime_capabilities.py && python3 scripts/test_probe_paperclip_runtime.py && python3 scripts/validate_runtime_capabilities.py && python3 scripts/validate_company_template.py && python3 scripts/test_validate_company_template.py

## Observability Impact

Creates the human-readable diagnostic surface for runtime capability health, including exact status, evidence, fallback, blocker, and downstream-consumer guidance.
