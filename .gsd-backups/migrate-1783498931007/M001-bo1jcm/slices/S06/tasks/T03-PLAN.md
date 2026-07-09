---
estimated_steps: 6
estimated_files: 3
skills_used: []
---

# T03: Publish runbook and gap ledger

Task plan metadata: estimated_steps: 7; estimated_files: 5; skills_used: [write-docs, verify-before-complete].

Why: S06 must be understandable to future agents and humans as a baseline demo, including exactly what is fixture-proven versus still live-runtime-untrusted.

Do: Create docs/10_A1_A10_DEMO.md with an A1-A10 table, run commands, evidence source paths, expected fixture outputs, live runtime smoke instructions, and a gap ledger for unvalidated Paperclip surfaces. Update docs/06_ACCEPTANCE_TESTS.md, docs/08_RUNTIME_CAPABILITY_HEALTH.md, and docs/09_BACKLOG.md to reference the integrated demo runner and keep runtime proof blockers aligned. Add scripts/validate_a1_a10_demo_docs.py as a small standard-library validator that checks required sections, A1-A10 labels, runner command mention, fixture proof boundary, and gap-ledger headings.

Failure Modes Q5: If the demo runner output changes, docs validation should fail on missing required sections or stale command references. If a runtime capability is promoted in docs without matrix proof, the existing runtime validator remains the source of truth and must fail during closure.

Negative Tests Q7: The doc validator should reject missing A-step entries, missing fixture proof boundary wording, missing live runtime gap ledger, and missing command references.

Done when: Documentation names how to reproduce the baseline, maps each A-step to evidence, explicitly states live runtime gaps, and can be validated by script.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/run_a1_a10_demo.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/company-template/a1-validation-evidence.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/06_ACCEPTANCE_TESTS.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/09_BACKLOG.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/plugin-bos-light/capabilities.paperclip-runtime.json`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/10_A1_A10_DEMO.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/06_ACCEPTANCE_TESTS.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/docs/09_BACKLOG.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M001-bo1jcm/scripts/validate_a1_a10_demo_docs.py`

## Verification

python3 scripts/validate_a1_a10_demo_docs.py

## Observability Impact

Adds a durable runbook and gap ledger so future agents can inspect what each demo phase proved, reproduce failures, and avoid live runtime overclaims.
