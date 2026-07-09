---
estimated_steps: 14
estimated_files: 1
skills_used: []
---

# T01: Rebuild canonical S08 closeout artifacts from existing evidence

Expected executor skills: write-docs, verify-before-complete.

Why: S08 is complete in the GSD DB, but the rendered slice-level artifacts are missing from `.gsd/milestones/M002/slices/S08/`. S09 must repair the artifact layer without changing completed task facts, reopening completed work, or promoting runtime capability.

Do:
1. Read the five S08 task summaries under `.gsd/milestones/M002/slices/S08/tasks/` and the five S08 runtime-evidence JSON files listed in inputs.
2. Create `.gsd/milestones/M002/slices/S08/S08-SUMMARY.md` summarizing D011, the approved path `hermes_local_with_codex_cli_backend`, Hermes CLI remediation, the Paperclip-owned run, `adapter_failed`, `wakeCountDelta=1`, and no passing `resultJson.bos`.
3. Create `.gsd/milestones/M002/slices/S08/S08-ASSESSMENT.md` with requirement coverage for R011, R009, and R010, explicitly distinguishing T01 `codex_local_builtin` feasibility from the final selected path.
4. Create `.gsd/milestones/M002/slices/S08/S08-UAT.md` as a conservative UAT/readback artifact: Paperclip owned the run, no duplicate wake was observed, runtime execution proof did not pass, and capability promotion remains blocked.
5. Write `runtime-evidence/M002-S09-s08-artifact-reconstruction.json` recording the repaired artifact paths, source evidence paths, redacted status summary, and no-promotion posture.
6. Keep all language fail-closed and redacted; do not add new runtime claims or modify the capability matrix.

Done when: all three canonical artifacts exist, are non-empty, and tell the same conservative S08 story as the task summaries and runtime evidence.

Threat Surface (Q3): no external input or auth surface is introduced; risk is accidental disclosure or overclaim while summarizing evidence, so quote only redacted statuses/IDs already present in committed evidence.
Requirement Impact (Q4): supports R011, R009, and R010; does not affect active M004 requirements R012-R015.
Failure Modes (Q5): if evidence files are malformed or inconsistent, stop and document the inconsistency rather than inventing missing facts.
Negative Tests (Q7): the later reconciliation validator must fail if any artifact is missing or claims passing `resultJson.bos` from S08.

## Inputs

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-provider-adapter-feasibility.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-execution-path-decision-packet.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-adapter-registration-evidence.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-hermes-cli-environment-remediation.json`
- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S08-runtime-execution-smoke.json`

## Expected Output

- `/home/qazanik/.gsd/projects/5520c80b9dfc/worktrees/M002/runtime-evidence/M002-S09-s08-artifact-reconstruction.json`

## Verification

test -s .gsd/milestones/M002/slices/S08/S08-SUMMARY.md && test -s .gsd/milestones/M002/slices/S08/S08-ASSESSMENT.md && test -s .gsd/milestones/M002/slices/S08/S08-UAT.md && python3 -m json.tool runtime-evidence/M002-S09-s08-artifact-reconstruction.json

## Observability Impact

Restores canonical S08 slice-level inspection surfaces and records a compact reconstruction audit for future agents.
