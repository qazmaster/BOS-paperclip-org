---
estimated_steps: 6
estimated_files: 2
skills_used: []
---

# T01: Closeout validator and no core audit guard

Expected executor skills_used: verify-before-complete, review.

Why: S06 needs a mechanical closeout gate, not just prose review. The gate must protect R011 by proving final docs and matrix do not overclaim capabilities, reuse S04 proof for unrelated plugin/UI surfaces, hide the S02 blocker, or rely on Paperclip core/private boundaries.

Do: Add `scripts/validate_m002_closeout.py` using Python standard library only. It should read the runtime capability matrix, S04 and S05 canonical evidence, `docs/08_RUNTIME_CAPABILITY_HEALTH.md`, `PAPERCLIP_LIVE_VALIDATION_REPORT.md`, and source files under supported BOS Light boundaries. Implement checks for canonical evidence references, conservative status counts or stricter equivalent status derivation, no confirmed S05 plugin/UI surfaces without S05 proof, required report sections for no-core-modification audit and remaining gaps, mention of the S02 Hermes execution-time secret-materialization blocker, and a forbidden-pattern scan for Paperclip core/private imports, direct DB mutation, monkey patches, or native approval side-effect claims. Add `scripts/test_validate_m002_closeout.py` with fixture-style positive and negative cases for overclaim prevention, missing gap ledger, missing no-core audit, stale S05 proof misuse, secret-looking text, and forbidden boundary patterns.

Failure Modes Q5: If evidence JSON is missing or malformed, fail closed with a precise path and field name. If docs are missing a required section, fail with the missing heading. If source scanning hits a forbidden pattern, report the file and pattern without dumping secrets.

Negative Tests Q7: Malformed evidence JSON, `confirmed` plugin/UI status without S05 readback, missing Hermes blocker text, missing no-core audit, and source text containing private Paperclip import or direct DB mutation patterns.

Done when: the new unit tests pass and the validator can run in a preflight mode against the current repository without requiring the later S06 regression artifact.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/capabilities.paperclip-runtime.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/plugin-bos-light/src/runtimeCapabilities.ts`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/docs/08_RUNTIME_CAPABILITY_HEALTH.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/PAPERCLIP_LIVE_VALIDATION_REPORT.md`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S04-live-artifact-flow.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S05-plugin-ui-surface-probe.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_runtime_capabilities.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_runtime_capabilities.py`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/validate_m002_closeout.py`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/scripts/test_validate_m002_closeout.py`

## Verification

python3 -m unittest scripts/test_validate_m002_closeout.py && python3 scripts/validate_m002_closeout.py --phase preflight

## Observability Impact

Creates a repeatable failure-localizing closeout gate that reports matrix, evidence, report, and boundary-audit drift with precise file paths.
